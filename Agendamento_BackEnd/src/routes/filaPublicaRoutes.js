const express = require('express');
const filaPublicaController = require('../controllers/filaPublicaController');

const router = express.Router();

router.get('/:empresa_id/servicos', filaPublicaController.catalogo);
router.post('/:empresa_id/entradas', filaPublicaController.entrar);

module.exports = router;
