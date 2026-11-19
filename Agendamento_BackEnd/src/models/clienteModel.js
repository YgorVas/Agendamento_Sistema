const pool = require('../config/db');
const { variantesTelefone } = require('../services/telefone');

const ClienteModel = {
    // Insere um novo cliente no banco de dados
    criar: async (empresa_id, nome, telefone_whatsapp, email, observacoes, conexao = pool) => {
        const query = `
            INSERT INTO clientes (empresa_id, nome, telefone_whatsapp, email, observacoes)
            VALUES (?, ?, ?, ?, ?)
        `;
        const [resultado] = await conexao.execute(query, [empresa_id, nome, telefone_whatsapp, email, observacoes]);
        return resultado.insertId;
    },

    buscarPorTelefone: async (empresaId, telefone, conexao = pool) => {
        const [linhas] = await conexao.execute(
            "SELECT id, nome, telefone_whatsapp FROM clientes WHERE empresa_id = ? AND REGEXP_REPLACE(telefone_whatsapp, '[^0-9]', '') IN (?, ?) ORDER BY id LIMIT 1",
            [empresaId, ...variantesTelefone(telefone)]
        );
        return linhas[0];
    },

    criarOuEncontrar: async (empresaId, nome, telefone, email, observacoes) => {
        const conexao = await pool.getConnection();
        try {
            await conexao.beginTransaction();
            const [empresas] = await conexao.execute('SELECT id FROM empresas WHERE id = ? AND ativo = TRUE FOR UPDATE', [empresaId]);
            if (!empresas.length) throw new Error('Empresa indisponível');
            const existente = await ClienteModel.buscarPorTelefone(empresaId, telefone, conexao);
            if (existente) { await conexao.commit(); return { cliente: existente, existente: true }; }
            const id = await ClienteModel.criar(empresaId, nome, telefone, email, observacoes, conexao);
            await conexao.commit();
            return { cliente: { id, nome, telefone_whatsapp: telefone }, existente: false };
        } catch (erro) { await conexao.rollback(); throw erro; }
        finally { conexao.release(); }
    },

    // Busca todos os clientes pertencentes a uma determinada empresa
    listarPorEmpresa: async (empresa_id) => {
        const query = `
            SELECT id, nome, telefone_whatsapp, email, observacoes, criado_em 
            FROM clientes 
            WHERE empresa_id = ?
            ORDER BY nome ASC
        `;
        const [linhas] = await pool.execute(query, [empresa_id]);
        return linhas;
    },

    // Busca um cliente específico por ID e Empresa
    buscarPorId: async (id, empresa_id) => {
        const query = `
            SELECT id, nome, telefone_whatsapp, email, observacoes, criado_em 
            FROM clientes 
            WHERE id = ? AND empresa_id = ?
        `;
        const [linhas] = await pool.execute(query, [id, empresa_id]);
        return linhas[0];
    }
};

module.exports = ClienteModel;
