const express = require('express');
const router = express.Router();
const servicoController = require('../controllers/servicoController');

router.post('/', servicoController.cadastrarServico);
router.get('/empresa/:empresa_id', servicoController.listarServicos);

module.exports = router;