const express = require('express');
const router = express.Router();
const autenticarEmpresa = require('../middleware/empresa');
const pacoteController = require('../controllers/pacoteController');

// Rotas de modelos de pacotes
router.post('/', autenticarEmpresa, pacoteController.cadastrarModeloPacote);
router.get('/empresa/:empresa_id', autenticarEmpresa, pacoteController.listarModelos);

// Rotas de pacotes comprados pelos clientes
router.post('/vender', autenticarEmpresa, pacoteController.venderPacote);
router.get('/cliente/:cliente_id', autenticarEmpresa, pacoteController.listarPacotesCliente);

module.exports = router;