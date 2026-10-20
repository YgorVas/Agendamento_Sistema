const PacoteModel = require('../models/pacoteModel');
const pool = require('../config/db');

const pacoteController = {
    // Criar o modelo de pacote da empresa
    cadastrarModeloPacote: async (req, res) => {
        try {
            const { empresa_id, nome, descricao, total_sessoes, preco_total, dias_validade } = req.body;

            if (!empresa_id || !nome || !total_sessoes || !preco_total) {
                return res.status(400).json({ 
                    erro: 'Os campos empresa_id, nome, total_sessoes e preco_total são obrigatórios.' 
                });
            }

            const novoId = await PacoteModel.criarModeloPacote(
                empresa_id, 
                nome, 
                descricao, 
                total_sessoes, 
                preco_total, 
                dias_validade
            );

            return res.status(201).json({
                mensagem: 'Modelo de pacote cadastrado com sucesso!',
                pacote_id: novoId
            });
        } catch (error) {
            console.error('Erro ao cadastrar modelo de pacote:', error);
            return res.status(500).json({ erro: 'Erro interno ao cadastrar pacote.' });
        }
    },

    // Listar modelos de pacotes de uma empresa
    listarModelos: async (req, res) => {
        try {
            const { empresa_id } = req.params;
            const pacotes = await PacoteModel.listarModelosPorEmpresa(empresa_id);
            return res.status(200).json(pacotes);
        } catch (error) {
            console.error('Erro ao listar pacotes:', error);
            return res.status(500).json({ erro: 'Erro interno ao buscar pacotes.' });
        }
    },

    // Vender um pacote para um cliente
    venderPacote: async (req, res) => {
        try {
            const { cliente_id, pacote_id } = req.body;

            if (!cliente_id || !pacote_id) {
                return res.status(400).json({ erro: 'Os campos cliente_id e pacote_id são obrigatórios.' });
            }

            // Busca as informações do pacote (total de sessões e dias de validade)
            const [pacotes] = await pool.query(
                'SELECT total_sessoes, dias_validade FROM pacotes WHERE id = ?', 
                [pacote_id]
            );

            if (pacotes.length === 0) {
                return res.status(404).json({ erro: 'Pacote não encontrado.' });
            }

            const { total_sessoes, dias_validade } = pacotes[0];

            // Atribui o pacote ao cliente
            const clientePacoteId = await PacoteModel.venderParaCliente(
                cliente_id, 
                pacote_id, 
                total_sessoes, 
                dias_validade
            );

            return res.status(201).json({
                mensagem: 'Pacote vendido/atribuído ao cliente com sucesso!',
                cliente_pacote_id: clientePacoteId,
                sessoes_iniciais: total_sessoes,
                dias_validade: dias_validade
            });
        } catch (error) {
            console.error('Erro ao vender pacote:', error);
            return res.status(500).json({ erro: 'Erro interno ao processar a venda do pacote.' });
        }
    },

    // Listar pacotes de um cliente específico
    listarPacotesCliente: async (req, res) => {
        try {
            const { cliente_id } = req.params;
            const pacotesCliente = await PacoteModel.listarPacotesDoCliente(cliente_id);
            return res.status(200).json(pacotesCliente);
        } catch (error) {
            console.error('Erro ao listar pacotes do cliente:', error);
            return res.status(500).json({ erro: 'Erro interno ao buscar pacotes do cliente.' });
        }
    }
};

module.exports = pacoteController;