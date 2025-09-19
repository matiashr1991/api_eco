'use strict';

const express = require('express');
const router = express.Router();

const { requireAuth, requireRoles } = require('../middleware/authz');
const scopeDelegacion = require('../middleware/scopeDelegacion');
const guiasController = require('../controllers/guias.controller');
const { upload } = require('../middleware/upload');

const PROTECT = process.env.PROTECT_API === 'true';
const gate = (roles) => (PROTECT ? [requireRoles(roles)] : []);

const READ_ROLES  = ['delegacion', 'admin', 'control', 'auditor', 'central'];
const WRITE_ROLES = ['delegacion', 'admin','recaudacion'];

// 🔐 auth + scoping
router.use(requireAuth, scopeDelegacion);

// ⚠️ IMPORTANTE: declarar primero la ruta de imágenes
router.get('/:id/imagenes', ...gate(READ_ROLES), guiasController.listarImagenesGuia);

// === Lectura ===
router.get('/control-general', ...gate(['admin','central','control','auditor']), guiasController.obtenerControlGeneral);
router.get('/sin-fecha-emision', ...gate(READ_ROLES), guiasController.obtenerGuiasSinFechaEmision);
router.get('/no-usadas', ...gate(READ_ROLES), guiasController.obtenerGuiasNoUsadas);
router.get('/numeros', ...gate(READ_ROLES), guiasController.obtenerNumerosGuias);
router.get('/id/:id', ...gate(READ_ROLES), guiasController.buscarPorId);

// ⚠️ esta va al final, para no tapar /:id/imagenes
router.get('/:nrguia', ...gate(READ_ROLES), guiasController.buscarPorNumero);

// === Escritura ===
router.post('/carga', ...gate(WRITE_ROLES), guiasController.cargarGuia);
router.patch('/:id', ...gate(WRITE_ROLES), guiasController.actualizarGuiaParcial);

// === Imágenes (subida) ===
router.post('/:idguia/imagenes', ...gate(WRITE_ROLES), upload.array('imagenes', 12), require('../controllers/guiasImagenes.controller').subirImagenes);

module.exports = router;
