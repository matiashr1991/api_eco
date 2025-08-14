const express = require('express');
const router = express.Router();
const controller = require('../controllers/remitos.controller');

// Listado
router.get('/all', controller.obtenerTodosRemitos);
router.get('/no-usados', controller.obtenerRemitosNoUsados); // <= antes que :nrremito
router.get('/:nrremito', controller.obtenerRemitoPorNumero);

// Altas/Actualizaciones
router.post('/carga', controller.cargarRemito);
router.patch('/:id', controller.actualizarRemitoParcial);
router.patch('/:id/vincular', controller.vincularAGuia);

module.exports = router;
