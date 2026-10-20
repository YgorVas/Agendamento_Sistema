const express = require('express');
const router = express.Router();
const pacoteController = require('../controllers/pacoteController');

// Rotas de modelos de pacotes
router.post('/', pacoteController.cadastrarModeloPacote);
router.get('/empresa/:empresa_id', pacoteController.listarModelos);

// Rotas de pacotes comprados pelos clientes
router.post('/vender', pacoteController.venderPacote);
router.get('/cliente/:cliente_id', pacoteController.listarPacotesCliente);

module.exports = router;