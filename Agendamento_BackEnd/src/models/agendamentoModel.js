const pool = require('../config/db');

const AgendamentoModel = {
    // 1. Obter a próxima posição disponível na fila para a data informada
    obterProximaPosicao: async (empresa_id, data_atendimento) => {
        const query = `
            SELECT COALESCE(MAX(posicao_fila), 0) + 1 AS proxima_posicao 
            FROM agendamentos 
            WHERE empresa_id = ? AND data_atendimento = ? AND status != 'cancelado'
        `;
        const [linhas] = await pool.query(query, [empresa_id, data_atendimento]);
        return linhas[0].proxima_posicao;
    },

    // 2. Entrar na fila do dia
    entrarNaFila: async (empresa_id, cliente_id, servico_id, cliente_pacote_id, data_atendimento, posicao_fila) => {
        const query = `
            INSERT INTO agendamentos (empresa_id, cliente_id, servico_id, cliente_pacote_id, posicao_fila, data_atendimento, data_hora, status)
            VALUES (?, ?, ?, ?, ?, ?, NOW(), 'agendado')
        `;
        const [resultado] = await pool.query(query, [
            empresa_id, 
            cliente_id, 
            servico_id, 
            cliente_pacote_id || null, 
            posicao_fila, 
            data_atendimento
        ]);
        return resultado.insertId;
    },

    // 3. Obter a quantidade de pessoas que estão na frente de um cliente
    obterPessoasNaFrente: async (empresa_id, data_atendimento, posicao_fila) => {
        const query = `
            SELECT COUNT(*) AS pessoas_na_frente
            FROM agendamentos
            WHERE empresa_id = ? 
              AND data_atendimento = ? 
              AND posicao_fila < ?
              AND status = 'agendado'
        `;
        const [linhas] = await pool.query(query, [empresa_id, data_atendimento, posicao_fila]);
        return linhas[0].pessoas_na_frente;
    },

    

    // 4. Listar a fila do dia ordenada pela posição
    listarFilaDoDia: async (empresa_id, data_atendimento) => {
        const query = `
            SELECT 
                a.id, 
                a.posicao_fila, 
                a.status, 
                c.nome AS cliente_nome, 
                c.telefone_whatsapp AS cliente_telefone,
                s.nome AS servico_nome,
                s.duracao_minutos
            FROM agendamentos a
            JOIN clientes c ON a.cliente_id = c.id
            JOIN servicos s ON a.servico_id = s.id
            WHERE a.empresa_id = ? AND a.data_atendimento = ? AND a.status != 'cancelado'
            ORDER BY a.posicao_fila ASC
        `;
        const [linhas] = await pool.query(query, [empresa_id, data_atendimento]);
        return linhas;
    },

    // Atualizar o status de um agendamento (ex: 'concluido', 'em_atendimento', 'cancelado')
    atualizarStatus: async (id, status) => {
        const query = `
            UPDATE agendamentos 
            SET status = ? 
            WHERE id = ?
        `;
        const [resultado] = await pool.query(query, [status, id]);
        return resultado.affectedRows > 0;
    },

    // Buscar o próximo cliente da fila do dia (menor posição com status 'agendado')
    obterProximoDaFila: async (empresa_id, data_atendimento) => {
            const query = `
                SELECT 
                    a.id, 
                    a.posicao_fila, 
                    c.nome AS cliente_nome, 
                    c.telefone_whatsapp AS cliente_telefone,
                    s.nome AS servico_nome
                FROM agendamentos a
                JOIN clientes c ON a.cliente_id = c.id
                JOIN servicos s ON a.servico_id = s.id -- CORRIGIDO AQUI (sem ç)
                WHERE a.empresa_id = ? 
                AND a.data_atendimento = ? 
                AND a.status = 'agendado'
                ORDER BY a.posicao_fila ASC
                LIMIT 1
            `;
            const [linhas] = await pool.query(query, [empresa_id, data_atendimento]);
            return linhas[0] || null;
    },

    // Descontar uma sessão do pacote ativo do cliente
    descontarSessaoPacote: async (cliente_pacote_id) => {
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
    },
};

module.exports = AgendamentoModel;