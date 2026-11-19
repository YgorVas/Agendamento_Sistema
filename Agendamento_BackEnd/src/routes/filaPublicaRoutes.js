const express = require('express');
const filaPublicaController = require('../controllers/filaPublicaController');

const router = express.Router();
const limitarRequisicoes = require('../middleware/limitarRequisicoes');
const limitarEntrada = limitarRequisicoes({ limite: 60, janelaMs: 15 * 60 * 1000 });

router.get('/:empresa_id/servicos', filaPublicaController.catalogo);
router.post('/:empresa_id/entradas', limitarEntrada, filaPublicaController.entrar);

module.exports = router;
