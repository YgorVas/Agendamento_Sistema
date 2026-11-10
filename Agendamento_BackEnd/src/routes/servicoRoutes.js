const express = require('express');
const router = express.Router();
const autenticarEmpresa = require('../middleware/empresa');
const servicoController = require('../controllers/servicoController');

router.post('/', autenticarEmpresa, servicoController.cadastrarServico);
router.get('/empresa/:empresa_id', autenticarEmpresa, servicoController.listarServicos);

module.exports = router;