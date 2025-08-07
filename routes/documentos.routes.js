// routes/documentos.route.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/documentos.controller');

router.get('/todos', controller.obtenerTodosDocumentos);
module.exports = router;
