const ClienteModel = require('../models/clienteModel');

const clienteController = {
    // POST /clientes - Cadastrar um novo cliente
    cadastrarCliente: async (req, res) => {
        try {
            const { nome, telefone_whatsapp, email, observacoes } = req.body;

            if (typeof nome !== 'string' || !nome.trim() || nome.trim().length > 100 ||
                typeof telefone_whatsapp !== 'string' || telefone_whatsapp.length > 20 ||
                !/^\+?[\d ().-]+$/.test(telefone_whatsapp) || !/^\d{10,15}$/.test(telefone_whatsapp.replace(/\D/g, ''))) {
                return res.status(400).json({ erro: 'Informe nome e telefone válidos.' });
            }
            const resultado = await ClienteModel.criarOuEncontrar(
                req.comercioId, nome.trim(), telefone_whatsapp.trim(), email || null, observacoes || null
            );
            return res.status(resultado.existente ? 200 : 201).json({
                mensagem: resultado.existente ? 'Cliente já cadastrado.' : 'Cliente cadastrado com sucesso!',
                cliente_id: resultado.cliente.id, existente: resultado.existente, cliente: resultado.cliente
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