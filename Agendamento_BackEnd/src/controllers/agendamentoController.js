const AgendamentoModel = require('../models/agendamentoModel');
const WhatsappService = require('../services/whatsappService');

const agendamentoController = {
    // POST /agendamentos/fila - Entrar na fila
// Substitua ou ajuste a função entrarNaFila no seu agendamentoController.js:
    entrarNaFila: async (req, res) => {
        try {
            const { empresa_id, cliente_id, servico_id, cliente_pacote_id, data_atendimento } = req.body;

            if (!empresa_id || !cliente_id || !servico_id || !data_atendimento) {
                return res.status(400).json({ 
                    erro: 'Os campos empresa_id, cliente_id, servico_id e data_atendimento (YYYY-MM-DD) são obrigatórios.' 
                });
            }

            // Se o cliente estiver usando um pacote/combo, valida e desconta a sessão
            if (cliente_pacote_id) {
                const [pacoteCliente] = await pool.query(
                    'SELECT * FROM cliente_pacotes WHERE id = ? AND cliente_id = ? AND status = ? AND sessoes_restantes > 0 AND data_validade >= CURDATE()',
                    [cliente_pacote_id, cliente_id, 'ativo']
                );

                if (pacoteCliente.length === 0) {
                    return res.status(400).json({ erro: 'Pacote inválido, expirado ou sem sessões restantes.' });
                }

                // Desconta a sessão do pacote
                await AgendamentoModel.descontarSessaoPacote(cliente_pacote_id);
            }

            // 1. Descobre a próxima posição na fila
            const posicao = await AgendamentoModel.obterProximaPosicao(empresa_id, data_atendimento);

            // 2. Insere na fila
            const novoId = await AgendamentoModel.entrarNaFila(
                empresa_id, 
                cliente_id, 
                servico_id, 
                cliente_pacote_id || null, 
                data_atendimento, 
                posicao
            );

            // 3. Calcula quantas pessoas estão na frente
            const pessoasNaFrente = await AgendamentoModel.obterPessoasNaFrente(empresa_id, data_atendimento, posicao);

            let mensagemFila = pessoasNaFrente === 0 
                ? 'Você é o primeiro da fila! Por favor, aguarde o início do atendimento.' 
                : `Agendamento confirmado! Existe(m) ${pessoasNaFrente} pessoa(s) na sua frente na fila.`;

            return res.status(201).json({
                mensagem: 'Cliente inserido na fila com sucesso!',
                agendamento_id: novoId,
                posicao_fila: posicao,
                pessoas_na_frente: pessoasNaFrente,
                aviso_cliente: mensagemFila
            });

        } catch (error) {
            console.error('Erro ao inserir cliente na fila:', error);
            return res.status(500).json({ erro: 'Erro interno ao processar agendamento na fila.' });
        }
    },
    // GET /agendamentos/fila/:empresa_id/:data_atendimento - Consultar fila
    obterFila: async (req, res) => {
        try {
            const { empresa_id, data_atendimento } = req.params;

            if (!empresa_id || !data_atendimento) {
                return res.status(400).json({ erro: 'O ID da empresa e a data são obrigatórios.' });
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
            const { id, status, empresa_id, data_atendimento } = req.body;

            if (!id || !status) {
                return res.status(400).json({ erro: 'Os campos id e status são obrigatórios.' });
            }

            // 1. Atualiza o status do agendamento atual
            const atualizado = await AgendamentoModel.atualizarStatus(id, status);

            if (!atualizado) {
                return res.status(404).json({ erro: 'Agendamento não encontrado.' });
            }

            // 2. Se o atendimento foi concluído, busca o próximo da fila e avisa via WhatsApp
            if (status === 'concluido' && empresa_id && data_atendimento) {
                const proximo = await AgendamentoModel.obterProximoDaFila(empresa_id, data_atendimento);
                
                if (proximo && proximo.cliente_telefone) {
                    const mensagemProximo = `Olá ${proximo.cliente_nome}! O atendimento anterior foi concluído. Você é o próximo da fila (${proximo.servico_nome}). Por favor, prepare-se!`;
                    
                    await WhatsappService.enviarMensagem(proximo.cliente_telefone, mensagemProximo);
                }
            }

            return res.status(200).json({ mensagem: 'Status atualizado com sucesso e notificações processadas!' });
        } catch (error) {
            console.error('Erro ao atualizar status:', error);
            return res.status(500).json({ erro: 'Erro interno ao atualizar status.' });
        }
    },

    // Ver o próximo cliente da fila
    verProximoDaFila: async (req, res) => {
        try {
            const { empresa_id, data_atendimento } = req.params;

            if (!empresa_id || !data_atendimento) {
                return res.status(400).json({ erro: 'O ID da empresa e a data são obrigatórios.' });
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