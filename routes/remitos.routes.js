const express = require('express');
const router = express.Router();

const { requireAuth, requireRoles } = require('../middleware/authz');
const scopeDelegacion = require('../middleware/scopeDelegacion');
const controller = require('../controllers/remitos.controller');
const remitosImgCtrl = require('../controllers/remitosImagenes.controller');
const { upload } = require('../middleware/upload');

const PROTECT = process.env.PROTECT_API === 'true';
const gate = (roles) => (PROTECT ? [requireRoles(roles)] : []);

const READ_ROLES  = ['delegacion', 'admin', 'control', 'auditor'];
const WRITE_ROLES = ['delegacion', 'admin'];

router.use(requireAuth, scopeDelegacion);

// Lectura
router.get('/all', ...gate(READ_ROLES), controller.obtenerTodosRemitos);
router.get('/no-usados', ...gate(READ_ROLES), controller.obtenerRemitosNoUsados);
router.get('/:nrremito', ...gate(READ_ROLES), controller.obtenerRemitoPorNumero);

// Escritura
router.post('/carga', ...gate(WRITE_ROLES), controller.cargarRemito);
router.patch('/:id', ...gate(WRITE_ROLES), controller.actualizarRemitoParcial);
router.patch('/:id/vincular', ...gate(WRITE_ROLES), controller.vincularAGuia);

// Imágenes
router.post('/:id/imagenes', ...gate(WRITE_ROLES), upload.array('imagenes', 20), remitosImgCtrl.subirImagenes);
router.get('/:id/imagenes', ...gate(READ_ROLES), remitosImgCtrl.listarImagenes);
router.delete('/imagenes/:idimg', ...gate(WRITE_ROLES), remitosImgCtrl.eliminarImagen);

router.use((err, req, res, next) => {
  if (err && err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ ok:false, error: 'Archivo demasiado grande (máx 8MB)' });
    if (err.code === 'LIMIT_FILE_COUNT') return res.status(413).json({ ok:false, error: 'Demasiados archivos' });
    if (err.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ ok:false, error: 'Tipo de archivo no permitido' });
    return res.status(400).json({ ok:false, error: err.message });
  }
  next(err);
});

module.exports = router;
