const PacoteModel = require('../models/pacoteModel');
const pool = require('../config/db');

const pacoteController = {
    // Criar o modelo de pacote da empresa
    cadastrarModeloPacote: async (req, res) => {
        try {
            const { nome, descricao, total_sessoes, preco_total, dias_validade, servico_id } = req.body;

            if (!nome || !total_sessoes || !preco_total || !/^[1-9][0-9]*$/.test(String(servico_id || ''))) {
                return res.status(400).json({ 
                    erro: 'Informe o nome, o serviço, o total de sessões e o preço.'
                });
            }

            const [servicos] = await pool.execute('SELECT id FROM servicos WHERE id = ? AND empresa_id = ?', [servico_id, req.comercioId]);
            if (!servicos.length) return res.status(404).json({ erro: 'Serviço não encontrado.' });
            const novoId = await PacoteModel.criarModeloPacote(
                req.comercioId,
                nome, 
                descricao, 
                total_sessoes, 
                preco_total, 
                dias_validade,
                Number(servico_id)
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
            const empresa_id = req.comercioId;
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

            if (![cliente_id, pacote_id].every(id => ['number', 'string'].includes(typeof id) && /^[1-9][0-9]*$/.test(String(id)))) {
                return res.status(400).json({ erro: 'Os campos cliente_id e pacote_id são obrigatórios.' });
            }

            // Busca as informações do pacote (total de sessões e dias de validade)
            const [pacotes] = await pool.execute(
                `SELECT p.total_sessoes, p.dias_validade FROM pacotes p
                 JOIN clientes c ON c.empresa_id = p.empresa_id
                 WHERE p.id = ? AND c.id = ? AND p.empresa_id = ?`,
                [pacote_id, cliente_id, req.comercioId]
            );

            if (pacotes.length === 0) {
                return res.status(404).json({ erro: 'Cliente ou pacote não encontrado.' });
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
            const pacotesCliente = await PacoteModel.listarPacotesDoCliente(cliente_id, req.comercioId);
            return res.status(200).json(pacotesCliente);
        } catch (error) {
            console.error('Erro ao listar pacotes do cliente:', error);
            return res.status(500).json({ erro: 'Erro interno ao buscar pacotes do cliente.' });
        }
    }
};

module.exports = pacoteController;