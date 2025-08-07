const express = require('express');
const router = express.Router();
const controller = require('../controllers/entregas.controller');

router.post('/entregar', controller.entregarTalonarios);

module.exports = router;
