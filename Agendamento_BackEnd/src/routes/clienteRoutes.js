const express = require('express');
const router = express.Router();
const verificarInstancia = require('../middleware/verificarInstancia');
const clienteController = require('../controllers/clienteController');

// Rota para cadastrar um novo cliente
router.post('/', verificarInstancia, clienteController.cadastrarCliente);
router.get('/', verificarInstancia, clienteController.listarClientes);

// Rota para listar todos os clientes de uma empresa
router.get('/empresa/:empresa_id', verificarInstancia, clienteController.listarClientes);

module.exports = router;
