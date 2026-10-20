const pool = require('../config/db');

const ServicoModel = {
    // Cadastrar um novo serviço
    criar: async (empresa_id, nome, descricao, duracao_minutos, preco) => {
        const query = `
            INSERT INTO servicos (empresa_id, nome, descricao, duracao_minutos, preco)
            VALUES (?, ?, ?, ?, ?)
        `;
        const [resultado] = await pool.query(query, [empresa_id, nome, descricao, duracao_minutos, preco]);
        return resultado.insertId;
    },

    // Listar todos os serviços de uma empresa
    listarPorEmpresa: async (empresa_id) => {
        const query = `
            SELECT id, nome, descricao, duracao_minutos, preco 
            FROM servicos 
            WHERE empresa_id = ?
            ORDER BY nome ASC
        `;
        const [linhas] = await pool.query(query, [empresa_id]);
        return linhas;
    }
};

module.exports = ServicoModel;