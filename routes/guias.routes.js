// routes/guias.routes.js
const express = require('express');
const router = express.Router();

const guiasController = require('../controllers/guias.controller');
const imagenesCtrl = require('../controllers/guiasImagenes.controller');
const { upload } = require('../middleware/upload');
const { requireRoles } = require('../middleware/authz');

const PROTECT = process.env.PROTECT_API === 'true';
const gate = (roles) => (PROTECT ? [requireRoles(roles)] : []);

// 📌 Rutas especiales primero
router.get('/control-general', ...gate(['admin', 'central']), guiasController.obtenerControlGeneral);
router.get('/sin-fecha-emision', ...gate(['delegacion', 'admin']), guiasController.obtenerGuiasSinFechaEmision);
router.get('/no-usadas', guiasController.obtenerGuiasNoUsadas);
router.get('/numeros', guiasController.obtenerNumerosGuias);
router.get('/all', guiasController.obtenerTodasGuias);
router.get('/id/:id', guiasController.buscarPorId);

// 📌 Subida de imágenes (delegación + admin)
router.post(
    '/:idguia/imagenes',
    ...gate(['delegacion', 'admin']),
    upload.array('imagenes', 12),
    imagenesCtrl.subirImagenes
);

// ✅ Cargar y actualizar guías
router.post('/carga', ...gate(['admin', 'recaudacion']), guiasController.cargarGuia);
router.patch('/:id', ...gate(['delegacion', 'admin', 'central']), guiasController.actualizarGuiaParcial);

// ⚠️ ESTA SIEMPRE AL FINAL
router.get('/:nrguia', guiasController.buscarPorNumero);

// 💥 Errores de Multer -> respuestas prolijas
router.use((err, req, res, next) => {
    if (err && err.name === 'MulterError') {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ ok: false, error: 'Archivo demasiado grande (máx 8MB)' });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(413).json({ ok: false, error: 'Demasiados archivos' });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ ok: false, error: 'Tipo de archivo no permitido' });
        }
        return res.status(400).json({ ok: false, error: err.message });
    }
    next(err);
});

module.exports = router;
