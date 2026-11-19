const pool = require('../config/db');

const PacoteModel = {
    // 1. Cadastrar um modelo de pacote/combo da empresa
    criarModeloPacote: async (empresa_id, nome, descricao, total_sessoes, preco_total, dias_validade, servico_id) => {
        const query = `
            INSERT INTO pacotes (empresa_id, nome, descricao, total_sessoes, preco_total, dias_validade, servico_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const [resultado] = await pool.execute(query, [
            empresa_id, 
            nome, 
            descricao || null, 
            total_sessoes, 
            preco_total, 
            dias_validade || 30,
            servico_id
        ]);
        return resultado.insertId;
    },

    // 2. Listar modelos de pacotes de uma empresa
    listarModelosPorEmpresa: async (empresa_id) => {
        const query = `
            SELECT id, nome, descricao, total_sessoes, preco_total, dias_validade, servico_id
            FROM pacotes
            WHERE empresa_id = ?
        `;
        const [linhas] = await pool.execute(query, [empresa_id]);
        return linhas;
    },

    // 3. Vender/Atribuir um pacote a um cliente
    venderParaCliente: async (cliente_id, pacote_id, sessoes_totais, dias_validade) => {
        // Calcula a data de validade com base nos dias informados
        const query = `
            INSERT INTO cliente_pacotes (cliente_id, pacote_id, sessoes_restantes, data_validade, status)
            VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), 'ativo')
        `;
        const [resultado] = await pool.execute(query, [
            cliente_id, 
            pacote_id, 
            sessoes_totais, 
            dias_validade
        ]);
        return resultado.insertId;
    },

    // 4. Listar pacotes ativos de um cliente
    listarPacotesDoCliente: async (cliente_id, empresaId) => {
        const query = `
            SELECT 
                cp.id, 
                p.nome AS pacote_nome,
                p.servico_id,
                p.total_sessoes,
                cp.sessoes_restantes, 
                cp.data_compra, 
                cp.data_validade, 
                CASE WHEN cp.status = 'ativo' AND cp.data_validade < CURDATE()
                     THEN 'expirado' ELSE cp.status END AS status
            FROM cliente_pacotes cp
            JOIN pacotes p ON cp.pacote_id = p.id
            JOIN clientes c ON c.id = cp.cliente_id AND c.empresa_id = p.empresa_id
            WHERE cp.cliente_id = ? AND c.empresa_id = ?
        `;
        const [linhas] = await pool.execute(query, [cliente_id, empresaId]);
        return linhas;
    },

};

module.exports = PacoteModel;
