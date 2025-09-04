// routes/remitos.routes.js
const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/authz');
const scopeDelegacion = require('../middleware/scopeDelegacion');

const controller = require('../controllers/remitos.controller');
const remitosImgCtrl = require('../controllers/remitosImagenes.controller');
const { upload } = require('../middleware/upload');

// 🔐 Aplica autenticación + scoping DELEG a todo este router
router.use(requireAuth, scopeDelegacion);

// === Remitos core ===
router.get('/all', controller.obtenerTodosRemitos);
router.get('/no-usados', controller.obtenerRemitosNoUsados); // <= antes que :nrremito
router.get('/:nrremito', controller.obtenerRemitoPorNumero);

router.post('/carga', controller.cargarRemito);
router.patch('/:id', controller.actualizarRemitoParcial);
router.patch('/:id/vincular', controller.vincularAGuia);

// === Imágenes de remitos ===
router.post('/:id/imagenes', upload.array('imagenes', 20), remitosImgCtrl.subirImagenes);
router.get('/:id/imagenes', remitosImgCtrl.listarImagenes);
router.delete('/imagenes/:idimg', remitosImgCtrl.eliminarImagen);

// Errores de Multer prolijos
router.use((err, req, res, next) => {
    if (err && err.name === 'MulterError') {
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ ok: false, error: 'Archivo demasiado grande (máx 8MB)' });
        if (err.code === 'LIMIT_FILE_COUNT') return res.status(413).json({ ok: false, error: 'Demasiados archivos' });
        if (err.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ ok: false, error: 'Tipo de archivo no permitido' });
        return res.status(400).json({ ok: false, error: err.message });
    }
    next(err);
});

module.exports = router;
