const express = require('express');
const router = express.Router();
const agendamentoController = require('../controllers/agendamentoController');

// Entrar na fila de atendimento
router.post('/fila', agendamentoController.entrarNaFila);

// Listar a fila do dia para a empresa
router.get('/fila/:empresa_id/:data_atendimento', agendamentoController.obterFila);

// Atualizar o status de um agendamento (ex: concluir atendimento)
router.patch('/status', agendamentoController.atualizarStatusAgendamento);

// Consultar quem é o próximo cliente da fila do dia
router.get('/proximo/:empresa_id/:data_atendimento', agendamentoController.verProximoDaFila);

module.exports = router;