const express = require('express');
const router = express.Router();
const autenticarEmpresa = require('../middleware/empresa');
const agendamentoController = require('../controllers/agendamentoController');

// Entrar na fila de atendimento
router.post('/fila', autenticarEmpresa, agendamentoController.entrarNaFila);

// Listar a fila do dia para a empresa
router.get('/fila/:empresa_id/:data_atendimento', autenticarEmpresa, agendamentoController.obterFila);

// Atualizar o status de um agendamento (ex: concluir atendimento)
router.patch('/status', autenticarEmpresa, agendamentoController.atualizarStatusAgendamento);

// Consultar quem é o próximo cliente da fila do dia
router.get('/proximo/:empresa_id/:data_atendimento', autenticarEmpresa, agendamentoController.verProximoDaFila);

module.exports = router;