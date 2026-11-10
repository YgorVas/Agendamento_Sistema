const ServicoModel = require('../models/servicoModel');

const servicoController = {
    cadastrarServico: async (req, res) => {
        try {
            const { nome, descricao, duracao_minutos, preco } = req.body;

            if (!nome || !duracao_minutos || !preco) {
                return res.status(400).json({ 
                    erro: 'Os campos nome, duracao_minutos e preco são obrigatórios.'
                });
            }

            const novoId = await ServicoModel.criar(
                req.empresaId,
                nome, 
                descricao || null, 
                duracao_minutos, 
                preco
            );

            return res.status(201).json({
                mensagem: 'Serviço cadastrado com sucesso!',
                servico_id: novoId
            });
        } catch (error) {
            console.error('Erro ao cadastrar serviço:', error);
            return res.status(500).json({ erro: 'Erro interno ao cadastrar serviço.' });
        }
    },

    listarServicos: async (req, res) => {
        try {
            const empresa_id = req.empresaId;


            const servicos = await ServicoModel.listarPorEmpresa(empresa_id);
            return res.status(200).json(servicos);
        } catch (error) {
            console.error('Erro ao buscar serviços:', error);
            return res.status(500).json({ erro: 'Erro interno ao buscar serviços.' });
        }
    }
};

module.exports = servicoController;