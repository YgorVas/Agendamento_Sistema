const pool = require('../config/db');

const ServicoModel = {
    catalogoPublico: async (empresaId) => {
        const [linhas] = await pool.execute(
            `SELECT e.nome_fantasia, s.id, s.nome, s.preco, s.duracao_minutos
             FROM empresas e LEFT JOIN servicos s ON s.empresa_id = e.id
             WHERE e.id = ? ORDER BY s.nome, s.id`,
            [empresaId]
        );
        if (!linhas.length) return null;
        return {
            nome_fantasia: linhas[0].nome_fantasia,
            servicos: linhas.flatMap(({ id, nome, preco, duracao_minutos }) =>
                id === null ? [] : [{ id, nome, preco, duracao_minutos }])
        };
    },

    // Cadastrar um novo serviço
    criar: async (empresa_id, nome, descricao, duracao_minutos, preco) => {
        const query = `
            INSERT INTO servicos (empresa_id, nome, descricao, duracao_minutos, preco)
            VALUES (?, ?, ?, ?, ?)
        `;
        const [resultado] = await pool.execute(query, [empresa_id, nome, descricao, duracao_minutos, preco]);
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
        const [linhas] = await pool.execute(query, [empresa_id]);
        return linhas;
    }
};

module.exports = ServicoModel;
