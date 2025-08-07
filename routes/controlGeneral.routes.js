// routes/controlGeneral.routes.js

const express = require('express');
const router = express.Router();
const controlGeneralController = require('../controllers/controlGeneral.controller');

// Guías con paginación
router.get('/ctrl', controlGeneralController.obtenerControlGeneral);

// Remitos con paginación
router.get('/ctrl-remitos', controlGeneralController.obtenerControlGeneralRemitos);

module.exports = router;
