const express = require('express');
const router = express.Router();
const verificarInstancia = require('../middleware/verificarInstancia');
const exigirGestao = require('../middleware/exigirGestao');
const servicoController = require('../controllers/servicoController');

router.post('/', verificarInstancia, exigirGestao, servicoController.cadastrarServico);
router.get('/', verificarInstancia, servicoController.listarServicos);
router.get('/empresa/:empresa_id', verificarInstancia, servicoController.listarServicos);

module.exports = router;
