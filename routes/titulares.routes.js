// routes/titulares.routes.js
const express = require('express');
const router = express.Router();

const { requireAuth, requireRoles } = require('../middleware/authz');
const controller = require('../controllers/titulares.controller');

const PROTECT = process.env.PROTECT_API === 'true';
const gate = (roles) => (PROTECT ? [requireRoles(roles)] : []);

// Matriz: lectura amplia, escritura restringida
const READ_ROLES  = ['delegacion', 'admin', 'control', 'auditor'];
const WRITE_ROLES = ['admin', 'control'];

router.use(requireAuth);

// Lectura
router.get('/',    ...gate(READ_ROLES), controller.listar);
router.get('/:id', ...gate(READ_ROLES), controller.obtener);

// Escritura
router.post('/',      ...gate(WRITE_ROLES), controller.crear);
router.patch('/:id',  ...gate(WRITE_ROLES), controller.actualizar);

module.exports = router;
