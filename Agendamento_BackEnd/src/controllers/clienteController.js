const ClienteModel = require('../models/clienteModel');

const clienteController = {
    // POST /clientes - Cadastrar um novo cliente
    cadastrarCliente: async (req, res) => {
        try {
            const { nome, telefone_whatsapp, email, observacoes } = req.body;

            // Validação simples dos campos obrigatórios
            if (!nome || !telefone_whatsapp) {
                return res.status(400).json({ 
                    erro: 'Os campos nome e telefone_whatsapp são obrigatórios.'
                });
            }

            const novoId = await ClienteModel.criar(
                req.comercioId,
                nome, 
                telefone_whatsapp, 
                email || null, 
                observacoes || null
            );

            return res.status(201).json({
                mensagem: 'Cliente cadastrado com sucesso!',
                cliente_id: novoId
            });
        } catch (error) {
            console.error('Erro ao cadastrar cliente:', error);
            return res.status(500).json({ erro: 'Erro interno ao cadastrar cliente.' });
        }
    },

    // GET /clientes/empresa/:empresa_id - Listar clientes de uma empresa
    listarClientes: async (req, res) => {
        try {
            const empresa_id = req.comercioId;


            const clientes = await ClienteModel.listarPorEmpresa(empresa_id);
            return res.status(200).json(clientes);
        } catch (error) {
            console.error('Erro ao buscar clientes:', error);
            return res.status(500).json({ erro: 'Erro interno ao buscar clientes.' });
        }
    }
};

module.exports = clienteController;