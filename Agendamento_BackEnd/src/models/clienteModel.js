const pool = require('../config/db');

const ClienteModel = {
    // Insere um novo cliente no banco de dados
    criar: async (empresa_id, nome, telefone_whatsapp, email, observacoes) => {
        const query = `
            INSERT INTO clientes (empresa_id, nome, telefone_whatsapp, email, observacoes)
            VALUES (?, ?, ?, ?, ?)
        `;
        const [resultado] = await pool.query(query, [empresa_id, nome, telefone_whatsapp, email, observacoes]);
        return resultado.insertId;
    },

    // Busca todos os clientes pertencentes a uma determinada empresa
    listarPorEmpresa: async (empresa_id) => {
        const query = `
            SELECT id, nome, telefone_whatsapp, email, observacoes, criado_em 
            FROM clientes 
            WHERE empresa_id = ?
            ORDER BY nome ASC
        `;
        const [linhas] = await pool.query(query, [empresa_id]);
        return linhas;
    },

    // Busca um cliente específico por ID e Empresa
    buscarPorId: async (id, empresa_id) => {
        const query = `
            SELECT id, nome, telefone_whatsapp, email, observacoes, criado_em 
            FROM clientes 
            WHERE id = ? AND empresa_id = ?
        `;
        const [linhas] = await pool.query(query, [id, empresa_id]);
        return linhas[0];
    }
};

module.exports = ClienteModel;