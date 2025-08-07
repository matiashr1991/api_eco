const express = require('express');
const router = express.Router();
const guiasController = require('../controllers/guias.controller');
const upload = require('../middleware/upload');

// 📌 Rutas especiales primero
router.get('/control-general', guiasController.obtenerControlGeneral);
router.get('/sin-fecha-emision', guiasController.obtenerGuiasSinFechaEmision);
router.get('/no-usadas', guiasController.obtenerGuiasNoUsadas);
router.get('/numeros', guiasController.obtenerNumerosGuias);
router.get('/all', guiasController.obtenerTodasGuias);
router.get('/id/:id', guiasController.buscarPorId);

// 📌 Subida de imágenes
router.post('/:idguia/imagenes', upload.array('imagenes', 5), guiasController.subirImagenes);

// ✅ Cargar y actualizar guías
router.post('/carga', guiasController.cargarGuia);
router.patch('/:id', guiasController.actualizarGuiaParcial);

// ⚠️ ESTA SIEMPRE AL FINAL
router.get('/:nrguia', guiasController.buscarPorNumero);




module.exports = router;
