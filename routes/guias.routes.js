const express = require('express');
const router = express.Router();

const { requireAuth, requireRoles } = require('../middleware/authz');
const scopeDelegacion = require('../middleware/scopeDelegacion');
const guiasController = require('../controllers/guias.controller');
const imagenesCtrl = require('../controllers/guiasImagenes.controller');
const { upload } = require('../middleware/upload');

const PROTECT = process.env.PROTECT_API === 'true';
const gate = (roles) => (PROTECT ? [requireRoles(roles)] : []);

// MATRIZ
const READ_ROLES  = ['delegacion', 'admin', 'control', 'auditor'];
const WRITE_ROLES = ['delegacion', 'admin'];

// 🔐 auth + scoping
router.use(requireAuth, scopeDelegacion);

// === Lectura (GET) ===
router.get('/control-general', ...gate(['admin','central','control','auditor']), guiasController.obtenerControlGeneral);
router.get('/sin-fecha-emision', ...gate(READ_ROLES), guiasController.obtenerGuiasSinFechaEmision);
router.get('/no-usadas', ...gate(READ_ROLES), guiasController.obtenerGuiasNoUsadas);
router.get('/numeros', ...gate(READ_ROLES), guiasController.obtenerNumerosGuias);
router.get('/all', ...gate(READ_ROLES), guiasController.obtenerTodasGuias);
router.get('/id/:id', ...gate(READ_ROLES), guiasController.buscarPorId);
router.get('/:nrguia', ...gate(READ_ROLES), guiasController.buscarPorNumero);

// === Escritura (POST/PATCH) ===
router.post('/carga', ...gate(WRITE_ROLES), guiasController.cargarGuia);
router.patch('/:id', ...gate(WRITE_ROLES), guiasController.actualizarGuiaParcial);

// === Imágenes (solo quien puede escribir) ===
router.post('/:idguia/imagenes', ...gate(WRITE_ROLES), upload.array('imagenes', 12), imagenesCtrl.subirImagenes);

// Multer errors prolijos
router.use((err, req, res, next) => {
  if (err && err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE')   return res.status(413).json({ ok:false, error: 'Archivo demasiado grande (máx 8MB)' });
    if (err.code === 'LIMIT_FILE_COUNT')  return res.status(413).json({ ok:false, error: 'Demasiados archivos'    });
    if (err.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ ok:false, error: 'Tipo de archivo no permitido' });
    return res.status(400).json({ ok:false, error: err.message });
  }
  next(err);
});

module.exports = router;
