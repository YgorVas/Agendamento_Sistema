const ClienteModel = require('../models/clienteModel');
const { validarCadastroCliente, erroCadastro } = require('../services/cadastroCliente');

const clienteController = {
    // POST /clientes - Cadastrar um novo cliente
    cadastrarCliente: async (req, res) => {
        try {
            const dados = req.body ?? {};
            const cadastro = validarCadastroCliente(dados);
            if (!cadastro) return res.status(400).json({ erro: erroCadastro });

            const { email, observacoes } = dados;
            const resultado = await ClienteModel.criarOuEncontrar(
                req.comercioId, cadastro.nome, cadastro.telefone, email || null, observacoes || null
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
