const express = require('express');
const router = express.Router();
const controller = require('../controllers/delegaciones.controller');

router.get('/dele', controller.obtenerDelegaciones);
router.get('/:id', controller.obtenerDelegacionPorId); // Opcional
router.post('/dele', controller.crearDelegacion); // Opcional

module.exports = router;
