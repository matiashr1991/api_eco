// src/routes/observaciones.routes.js
const router = require('express').Router();
const c = require('../controllers/observaciones.controller');

// OJO: NO ponemos requireAuth acá porque tu app protege /api globalmente
// Endpoints bajo /api/guias/:id/observaciones
router.get('/guias/:id/observaciones', c.listarPorGuia);
router.post('/guias/:id/observaciones', c.crearParaGuia);

module.exports = router;
