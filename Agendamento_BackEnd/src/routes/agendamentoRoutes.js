const express = require('express');
const router = express.Router();
const verificarInstancia = require('../middleware/verificarInstancia');
const agendamentoController = require('../controllers/agendamentoController');

// Entrar na fila de atendimento
router.post('/fila', verificarInstancia, agendamentoController.entrarNaFila);
router.get('/ticket', agendamentoController.consultarTicket);

// Listar a fila do dia para a empresa
router.get('/fila/:empresa_id/:data_atendimento', verificarInstancia, agendamentoController.obterFila);
router.get('/fila/:data_atendimento', verificarInstancia, agendamentoController.obterFila);

// Atualizar o status de um agendamento (ex: concluir atendimento)
router.patch('/status', verificarInstancia, agendamentoController.atualizarStatusAgendamento);

// Consultar quem é o próximo cliente da fila do dia
router.get('/proximo/:empresa_id/:data_atendimento', verificarInstancia, agendamentoController.verProximoDaFila);
router.get('/proximo/:data_atendimento', verificarInstancia, agendamentoController.verProximoDaFila);

module.exports = router;
