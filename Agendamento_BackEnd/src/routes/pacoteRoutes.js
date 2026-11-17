const express = require('express');
const router = express.Router();
const verificarInstancia = require('../middleware/verificarInstancia');
const exigirGestao = require('../middleware/exigirGestao');
const pacoteController = require('../controllers/pacoteController');

// Rotas de modelos de pacotes
router.post('/', verificarInstancia, exigirGestao, pacoteController.cadastrarModeloPacote);
router.get('/', verificarInstancia, pacoteController.listarModelos);
router.get('/empresa/:empresa_id', verificarInstancia, pacoteController.listarModelos);

// Rotas de pacotes comprados pelos clientes
router.post('/vender', verificarInstancia, pacoteController.venderPacote);
router.get('/cliente/:cliente_id', verificarInstancia, pacoteController.listarPacotesCliente);

module.exports = router;
