// server.js (:3000)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Middlewares de auth (tuyos)
const { requireAuth, requireRoles } = require('./middleware/authz');

const app = express();
app.disable('x-powered-by');

/* =========================================
 * CORS (ajustado a tu front en :5500)
 * =======================================*/
const ALLOWED_ORIGINS = ['http://localhost:5500', 'http://127.0.0.1:5500'];
const corsCfg = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // allow tools / curl / same-origin
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
app.use(express.json({ limit: '2mb' }));        // API JSON
app.use(express.urlencoded({ extended: true })); // formularios simples

/* =========================================
 * Archivos estáticos públicos (sin token)
 * Sirve /uploads => <root>/uploads
 * Aquí se ubican: /uploads/guias/<delegación>/<archivo>
 * =======================================*/
app.use(
  '/uploads',
  // CORS también para recursos estáticos (por si se usan con fetch)
  cors(corsCfg),
  express.static(path.join(__dirname, 'uploads'), {
    // Evitar problemas de cache en desarrollo
    etag: true,
    maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
    setHeaders(res) {
      res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.join(','));
    },
  })
);

// Ping
app.get('/health', (req, res) =>
  res.json({ ok: true, protected: process.env.PROTECT_API === 'true' })
);

/* =========================================
 * Toggle de protección general /api
 * =======================================*/
const PROTECT = process.env.PROTECT_API === 'true';
const protect = (mw) => (PROTECT ? [mw] : []);

if (PROTECT) {
  console.log('🔒 Protección /api ACTIVADA');
} else {
  console.log('⚠️  Protección /api DESACTIVADA (solo desarrollo)');
}

/* =========================================
 * Helpers de rol
 * =======================================*/
function norm(x) {
  return String(x || '').trim().toLowerCase();
}
function userRoles(req) {
  const u = req.user || {};
  const arr = Array.isArray(u.roles) ? u.roles.slice() : [];
  if (u.role) arr.push(u.role);
  return arr.map(norm);
}
function isAdmin(req) {
  return userRoles(req).includes('admin');
}

/**
 * Gate de roles con bypass para ADMIN.
 * - Si PROTECT=false => no aplica (dev)
 * - Si usuario es admin => next()
 * - Si no, aplica requireRoles(roles)
 */
const superRoleGate = (roles) =>
  PROTECT
    ? [
      (req, res, next) => {
        if (isAdmin(req)) return next();
        return requireRoles(roles)(req, res, next);
      },
    ]
    : [];

/* =========================================
 * Rutas
 * (OJO: el endpoint de subir imágenes está en guias.routes.js:
 *  POST /api/guias/:id/imagenes  -> usa multer y guarda en
 *  /uploads/guias/<delegación>/NRGUIA_FECHA.ext)
 * =======================================*/
const remitosRoutes = require('./routes/remitos.routes');
const guiasRoutes = require('./routes/guias.routes');
const controlGeneralRoutes = require('./routes/controlGeneral.routes');
const entregasRoutes = require('./routes/entregas.routes');
const delegacionesRoutes = require('./routes/delegaciones.routes');

/* Autenticación global /api (si PROTECT=true) */
app.use('/api', ...protect(requireAuth));

/* Autorización fina por router (ADMIN entra por bypass) */
app.use('/api/control-general', ...superRoleGate(['central']), controlGeneralRoutes);
app.use('/api/delegaciones', ...superRoleGate(['delegacion']), delegacionesRoutes);

/* Resto de routers (si adentro aplican checks propios, se respetan) */
app.use('/api/remitos', remitosRoutes);
app.use('/api/guias', guiasRoutes);
app.use('/api/entregas', entregasRoutes);

/* =========================================
 * 404 para /api
 * =======================================*/
app.use('/api', (req, res, _next) => {
  res.status(404).json({ ok: false, error: 'No encontrado' });
});

/* =========================================
 * Handler de errores (formato uniforme)
 * =======================================*/
app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    ok: false,
    error: err.message || 'Error interno',
  });
});

/* =========================================
 * Server
 * =======================================*/
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ API negocio en :${PORT}`));
