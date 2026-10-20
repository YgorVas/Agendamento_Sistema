const express = require('express');
const router = express.Router();
const clienteController = require('../controllers/clienteController');

// Rota para cadastrar um novo cliente
router.post('/', clienteController.cadastrarCliente);

// Rota para listar todos os clientes de uma empresa
router.get('/empresa/:empresa_id', clienteController.listarClientes);

module.exports = router;