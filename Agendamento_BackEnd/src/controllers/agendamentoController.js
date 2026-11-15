const { createHash, randomBytes } = require('node:crypto');
const AgendamentoModel = require('../models/agendamentoModel');
const WhatsappService = require('../services/whatsappService');
const hashTicket = (token) => createHash('sha256').update(token).digest();

const idValido = (valor) =>
    (typeof valor === 'number' || typeof valor === 'string') &&
    /^[1-9][0-9]*$/.test(String(valor)) && Number.isSafeInteger(Number(valor));

function dataValida(data) {
    if (typeof data !== 'string' || !/^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$/.test(data)) return false;
    const dia = new Date(data);
    return !Number.isNaN(dia.getTime()) && dia.toISOString().slice(0, 10) === data;
}

const agendamentoController = {
    entrarNaFila: async (req, res) => {
        try {
            const { cliente_id, servico_id, cliente_pacote_id, data_atendimento } = req.body || {};
            if (!idValido(cliente_id) || !idValido(servico_id) || !dataValida(data_atendimento) ||
                (cliente_pacote_id != null && !idValido(cliente_pacote_id))) {
                return res.status(400).json({ erro: 'Informe IDs válidos e uma data no formato YYYY-MM-DD.' });
            }

            const ticket = randomBytes(32).toString('hex');
            const fila = await AgendamentoModel.entrarNaFila(
                req.empresaId, Number(cliente_id), Number(servico_id),
                cliente_pacote_id == null ? null : Number(cliente_pacote_id), data_atendimento, hashTicket(ticket)
            );
            if (fila.erro === 'pacote') {
                return res.status(400).json({ erro: 'Pacote inválido, expirado ou sem sessões restantes.' });
            }
            if (fila.erro) {
                return res.status(404).json({ erro: 'Empresa, cliente ou serviço não encontrado.' });
            }

            return res.status(201).json({
                mensagem: 'Cliente inserido na fila com sucesso!',
                agendamento_id: fila.id,
                ticket,
                posicao_fila: fila.posicao,
                pessoas_na_frente: fila.pessoas,
                aviso_cliente: fila.pessoas === 0
                    ? 'Você é o primeiro da fila! Aguarde o início do atendimento.'
                    : `Agendamento confirmado! Há ${fila.pessoas} pessoa(s) na sua frente.`
            });
        } catch (error) {
            console.error('Erro ao inserir cliente na fila:', error);
            return res.status(500).json({ erro: 'Erro interno ao entrar na fila.' });
        }
    },

    consultarTicket: async (req, res) => {
        res.set('Cache-Control', 'no-store');
        const token = /^Bearer ([0-9a-f]{64})$/.exec(req.get('Authorization') || '')?.[1];
        const ticket = token && await AgendamentoModel.consultarTicket(hashTicket(token));
        if (!ticket) return res.status(404).json({ erro: 'Ticket não encontrado.' });
        return res.json(ticket);
    },

    // GET /agendamentos/fila/:empresa_id/:data_atendimento - Consultar fila
    obterFila: async (req, res) => {
        try {
            const { data_atendimento } = req.params;
            const empresa_id = req.empresaId;

            if (!dataValida(data_atendimento)) {
                return res.status(400).json({ erro: 'Informe uma data válida no formato YYYY-MM-DD.' });
            }

            const fila = await AgendamentoModel.listarFilaDoDia(empresa_id, data_atendimento);
            return res.status(200).json(fila);

        } catch (error) {
            console.error('Erro ao buscar fila:', error);
            return res.status(500).json({ erro: 'Erro interno ao consultar a fila.' });
        }
    },

    // Atualizar o status do agendamento e disparar WhatsApp para o próximo
    atualizarStatusAgendamento: async (req, res) => {
        try {
            const { id, status } = req.body || {};
            if (!idValido(id) || !['confirmado', 'concluido', 'cancelado'].includes(status)) {
                return res.status(400).json({ erro: 'Informe um ID e um status válidos.' });
            }

            const resultado = await AgendamentoModel.atualizarStatus(req.empresaId, Number(id), status);
            if (resultado.erro === 'atendimento') {
                return res.status(409).json({ erro: 'Conclua o atendimento atual antes de chamar o próximo.' });
            }
            if (resultado.erro === 'transicao') {
                return res.status(409).json({ erro: 'Este agendamento já foi encerrado.' });
            }
            if (resultado.erro) {
                return res.status(404).json({ erro: 'Agendamento não encontrado.' });
            }

            if (resultado.mudou && status === 'concluido') {
                try {
                    const proximo = await AgendamentoModel.obterProximoDaFila(req.empresaId, resultado.data);
                    if (proximo?.cliente_telefone) {
                        await WhatsappService.enviarMensagem(
                            proximo.cliente_telefone, 'O atendimento anterior foi concluído. Você é o próximo da fila!'
                        );
                    }
                } catch (error) {
                    console.error('Erro ao avisar o próximo da fila:', error);
                }
            }

            return res.status(200).json({ mensagem: 'Status atualizado com sucesso!' });
        } catch (error) {
            console.error('Erro ao atualizar status:', error);
            return res.status(500).json({ erro: 'Erro interno ao atualizar status.' });
        }
    },

    // Ver o próximo cliente da fila
    verProximoDaFila: async (req, res) => {
        try {
            const { data_atendimento } = req.params;
            const empresa_id = req.empresaId;

            if (!dataValida(data_atendimento)) {
                return res.status(400).json({ erro: 'Informe uma data válida no formato YYYY-MM-DD.' });
            }

            const proximo = await AgendamentoModel.obterProximoDaFila(empresa_id, data_atendimento);
            
            if (!proximo) {
                return res.status(404).json({ mensagem: 'Não há clientes na fila para esta data.' });
            }

            return res.status(200).json(proximo);
        } catch (error) {
            console.error('Erro ao buscar próximo da fila:', error);
            return res.status(500).json({ erro: 'Erro interno ao consultar o próximo da fila.' });
        }
    }
};

module.exports = agendamentoController;
