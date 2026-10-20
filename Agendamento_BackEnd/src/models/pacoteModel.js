const pool = require('../config/db');

const PacoteModel = {
    // 1. Cadastrar um modelo de pacote/combo da empresa
    criarModeloPacote: async (empresa_id, nome, descricao, total_sessoes, preco_total, dias_validade) => {
        const query = `
            INSERT INTO pacotes (empresa_id, nome, descricao, total_sessoes, preco_total, dias_validade)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const [resultado] = await pool.query(query, [
            empresa_id, 
            nome, 
            descricao || null, 
            total_sessoes, 
            preco_total, 
            dias_validade || 30
        ]);
        return resultado.insertId;
    },

    // 2. Listar modelos de pacotes de uma empresa
    listarModelosPorEmpresa: async (empresa_id) => {
        const query = `
            SELECT id, nome, descricao, total_sessoes, preco_total, dias_validade
            FROM pacotes
            WHERE empresa_id = ?
        `;
        const [linhas] = await pool.query(query, [empresa_id]);
        return linhas;
    },

    // 3. Vender/Atribuir um pacote a um cliente
    venderParaCliente: async (cliente_id, pacote_id, sessoes_totais, dias_validade) => {
        // Calcula a data de validade com base nos dias informados
        const query = `
            INSERT INTO cliente_pacotes (cliente_id, pacote_id, sessoes_restantes, data_validade, status)
            VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), 'ativo')
        `;
        const [resultado] = await pool.query(query, [
            cliente_id, 
            pacote_id, 
            sessoes_totais, 
            dias_validade
        ]);
        return resultado.insertId;
    },

    // 4. Listar pacotes ativos de um cliente
    listarPacotesDoCliente: async (cliente_id) => {
        const query = `
            SELECT 
                cp.id, 
                p.nome AS pacote_nome, 
                cp.sessoes_restantes, 
                cp.data_compra, 
                cp.data_validade, 
                cp.status
            FROM cliente_pacotes cp
            JOIN pacotes p ON cp.pacote_id = p.id
            WHERE cp.cliente_id = ?
        `;
        const [linhas] = await pool.query(query, [cliente_id]);
        return linhas;
    },

    // 5. Descontar uma sessão do pacote do cliente (quando ele realiza o atendimento)
    descontarSessao: async (cliente_pacote_id) => {
        const query = `
            UPDATE cliente_pacotes 
            SET sessoes_restantes = sessoes_restantes - 1,
                status = CASE 
                    WHEN (sessoes_restantes - 1) <= 0 THEN 'concluido' 
                    ELSE status 
                END
            WHERE id = ? AND sessoes_restantes > 0 AND status = 'ativo'
        `;
        const [resultado] = await pool.query(query, [cliente_pacote_id]);
        return resultado.affectedRows > 0;
    }
};

module.exports = PacoteModel;