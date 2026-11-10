const express = require('express');
const router = express.Router();
const autenticarEmpresa = require('../middleware/empresa');
const clienteController = require('../controllers/clienteController');

// Rota para cadastrar um novo cliente
router.post('/', autenticarEmpresa, clienteController.cadastrarCliente);

// Rota para listar todos os clientes de uma empresa
router.get('/empresa/:empresa_id', autenticarEmpresa, clienteController.listarClientes);

module.exports = router;