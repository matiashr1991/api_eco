// server.js / app.js  (puerto :3000)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { requireAuth, requireRoles } = require('./middleware/authz');

const app = express();
app.disable('x-powered-by');

/* =========================================
 * CORS
 * - Por defecto habilitamos el front servido en 100.82.78.55
 * - Podés sobreescribir con CORS_ORIGINS="http://dom1,http://dom2"
 * =======================================*/
const DEFAULT_ORIGINS = [
  'http://100.82.78.55',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : DEFAULT_ORIGINS
).filter(Boolean);

const corsCfg = {
  origin: (origin, cb) => {
    // Permite no-CORS (curl, same-process) y orígenes listados
    if (!origin) return cb(null, true);
    return ALLOWED_ORIGINS.includes(origin)
      ? cb(null, true)
      : cb(new Error('CORS bloqueado para: ' + origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};
app.use(cors(corsCfg));
app.options('*', cors(corsCfg));

/* =========================================
 * Parsers
 * =======================================*/
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

/* =========================================
 * Archivos estáticos públicos (sin token)
 * /uploads -> ./uploads
 * =======================================*/
app.use(
  '/uploads',
  cors(corsCfg),
  express.static(path.join(__dirname, 'uploads'), {
    etag: true,
    maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
    setHeaders(res) {
      // ayuda cuando se consumen imágenes desde el front
      res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.join(','));
    },
  })
);

// Salud
app.get('/health', (req, res) =>
  res.json({ ok: true, protected: process.env.PROTECT_API === 'true' })
);

/* =========================================
 * Toggle de protección /api
 * =======================================*/
const PROTECT = process.env.PROTECT_API === 'true';
const protect = (mw) => (PROTECT ? [mw] : []);

if (PROTECT) {
  console.log('🔒 Protección /api ACTIVADA');
} else {
  console.log('⚠️  Protección /api DESACTIVADA (dev)');
}

/* =========================================
 * Helpers de rol + gate opcional (con bypass admin)
 * =======================================*/
function norm(x) { return String(x || '').trim().toLowerCase(); }
function userRoles(req) {
  const u = req.user || {};
  const arr = Array.isArray(u.roles) ? u.roles.slice() : [];
  if (u.role) arr.push(u.role);
  return arr.map(norm);
}
function isAdmin(req) { return userRoles(req).includes('admin'); }

/** Gate de roles con bypass para ADMIN (si PROTECT=true) */
const superRoleGate = (roles) =>
  PROTECT
    ? [(req, res, next) => (isAdmin(req) ? next() : requireRoles(roles)(req, res, next))]
    : [];

/* =========================================
 * Rutas
 * =======================================*/
const remitosRoutes        = require('./routes/remitos.routes');
const guiasRoutes          = require('./routes/guias.routes');
const controlGeneralRoutes = require('./routes/controlGeneral.routes');
const entregasRoutes       = require('./routes/entregas.routes');
const delegacionesRoutes   = require('./routes/delegaciones.routes');
const observacionesRoutes  = require('./routes/observaciones.routes');
const titularesRoutes      = require('./routes/titulares.routes'); // <-- FIX: agregar router de titulares

/* Auth global sobre /api (si PROTECT=true) */
app.use('/api', ...protect(requireAuth));

/* 🔧 NO ponemos gate de roles en el mount de delegaciones.
   La autorización fina ya está implementada dentro del controller/rutas. */
app.use('/api/delegaciones', delegacionesRoutes);

/* Ejemplo: control-general sólo para 'central' (bypass admin) */
app.use('/api/control-general', ...superRoleGate(['central']), controlGeneralRoutes);

/* Resto de routers (sus controladores aplican checks internos) */
app.use('/api/remitos', remitosRoutes);
app.use('/api/guias', guiasRoutes);
app.use('/api/entregas', entregasRoutes);
app.use('/api/titulares', titularesRoutes); // <-- FIX: montar /api/titulares

// Observaciones (queda bajo /api, protegidas globalmente)
app.use('/api', observacionesRoutes);

/* =========================================
 * 404 para /api
 * =======================================*/
app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: 'No encontrado' });
});

/* =========================================
 * Handler de errores
 * =======================================*/
app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ ok: false, error: err.message || 'Error interno' });
});

/* =========================================
 * Server
 * =======================================*/
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ API negocio escuchando en :${PORT}`));
