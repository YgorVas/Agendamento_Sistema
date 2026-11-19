const pool = require('../config/db');
const ClienteModel = require('./clienteModel');
const { registrarAtendimento } = require('./financeiroModel');

async function transacaoDaEmpresa(empresaId, executar) {
    const conexao = await pool.getConnection();
    try {
        await conexao.beginTransaction();
        // Serializa entradas e mudanças de status da mesma empresa.
        const [empresas] = await conexao.execute(
            'SELECT id FROM empresas WHERE id = ? AND ativo = TRUE FOR UPDATE', [empresaId]
        );
        const resultado = empresas.length ? await executar(conexao) : { erro: 'empresa' };
        await conexao.commit();
        return resultado;
    } catch (erro) {
        await conexao.rollback();
        throw erro;
    } finally {
        conexao.release();
    }
}

async function inserirNaFila(conexao, empresaId, clienteId, servicoId, pacoteId, data, ticketHash) {
    const [fila] = await conexao.execute(
        `SELECT COALESCE(MAX(posicao_fila), 0) + 1 AS posicao,
                COUNT(CASE WHEN status IN ('agendado', 'confirmado') THEN 1 END) AS pessoas
         FROM agendamentos WHERE empresa_id = ? AND data_atendimento = ? AND posicao_fila IS NOT NULL`,
        [empresaId, data]
    );
    const { posicao, pessoas } = fila[0];
    const [novo] = await conexao.execute(
        `INSERT INTO agendamentos
            (empresa_id, cliente_id, servico_id, cliente_pacote_id, posicao_fila, data_atendimento, data_hora, status, ticket_hash)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), 'agendado', ?)`,
        [empresaId, clienteId, servicoId, pacoteId, posicao, data, ticketHash]
    );
    return { id: novo.insertId, posicao, pessoas };
}

const AgendamentoModel = {
    entrarNaFilaPublica: (empresaId, nome, telefone, servicoId, data, ticketHash) =>
        transacaoDaEmpresa(empresaId, async (conexao) => {
            const [entradas] = await conexao.execute(
                'SELECT posicao_fila FROM agendamentos WHERE ticket_hash = ? AND empresa_id = ?',
                [ticketHash, empresaId]
            );
            if (entradas.length) return { existente: true, posicao: entradas[0].posicao_fila };

            const [servicos] = await conexao.execute(
                'SELECT id FROM servicos WHERE id = ? AND empresa_id = ? FOR SHARE',
                [servicoId, empresaId]
            );
            if (!servicos.length) return { erro: 'servico' };

            const cliente = await ClienteModel.buscarPorTelefone(empresaId, telefone, conexao);
            const clienteId = cliente?.id ??
                await ClienteModel.criar(empresaId, nome, telefone, null, null, conexao);
            return inserirNaFila(conexao, empresaId, clienteId, servicoId, null, data, ticketHash);
        }),

    entrarNaFila: (empresaId, clienteId, servicoId, pacoteId, data, ticketHash) =>
        transacaoDaEmpresa(empresaId, async (conexao) => {
            const [cadastro] = await conexao.execute(
                `SELECT c.id FROM clientes c JOIN servicos s ON s.empresa_id = c.empresa_id
                 WHERE c.empresa_id = ? AND c.id = ? AND s.id = ? FOR SHARE`,
                [empresaId, clienteId, servicoId]
            );
            if (!cadastro.length) return { erro: 'cadastro' };

            if (pacoteId) {
                const [debito] = await conexao.execute(
                    `UPDATE cliente_pacotes SET
                         status = IF(sessoes_restantes = 1, 'concluido', 'ativo'),
                         sessoes_restantes = sessoes_restantes - 1
                     WHERE id = ? AND cliente_id = ? AND status = 'ativo' AND sessoes_restantes > 0
                       AND data_validade >= GREATEST(CURDATE(), CAST(? AS DATE))
                       AND pacote_id IN (SELECT id FROM pacotes WHERE empresa_id = ?)`,
                    [pacoteId, clienteId, data, empresaId]
                );
                if (!debito.affectedRows) return { erro: 'pacote' };
            }

            return inserirNaFila(conexao, empresaId, clienteId, servicoId, pacoteId, data, ticketHash);
        }),

    consultarTicket: async (ticketHash) => {
        const [linhas] = await pool.execute(`
            SELECT ticket.posicao_fila, ticket.status,
                   (SELECT COUNT(*) FROM agendamentos fila
                    WHERE fila.empresa_id = ticket.empresa_id
                      AND fila.data_atendimento = ticket.data_atendimento
                      AND fila.posicao_fila < ticket.posicao_fila
                      AND fila.status IN ('agendado', 'confirmado')) AS pessoas_na_frente
            FROM agendamentos ticket
            JOIN empresas e ON e.id = ticket.empresa_id
            WHERE ticket.ticket_hash = ? AND e.ativo = TRUE
        `, [ticketHash]);
        return linhas[0];
    },

    // 4. Listar a fila do dia ordenada pela posição
    listarFilaDoDia: async (empresa_id, data_atendimento) => {
        const query = `
            SELECT 
                a.id, 
                a.posicao_fila,
                a.cliente_pacote_id,
                a.status, 
                c.nome AS cliente_nome, 
                c.telefone_whatsapp AS cliente_telefone,
                s.nome AS servico_nome,
                s.duracao_minutos
            FROM agendamentos a
            JOIN clientes c ON a.cliente_id = c.id AND c.empresa_id = a.empresa_id
            LEFT JOIN servicos s ON a.servico_id = s.id AND s.empresa_id = a.empresa_id
            WHERE a.empresa_id = ? AND a.data_atendimento = ? AND a.posicao_fila IS NOT NULL AND a.status != 'cancelado'
            ORDER BY a.posicao_fila ASC, a.id ASC
        `;
        const [linhas] = await pool.execute(query, [empresa_id, data_atendimento]);
        return linhas;
    },

    atualizarStatus: (empresaId, id, status) =>
        transacaoDaEmpresa(empresaId, async (conexao) => {
            const [registros] = await conexao.execute(
                `SELECT status, cliente_pacote_id, DATE_FORMAT(data_atendimento, '%Y-%m-%d') AS data
                 FROM agendamentos WHERE id = ? AND empresa_id = ?`,
                [id, empresaId]
            );
            const atual = registros[0];
            if (!atual) return { erro: 'registro' };
            if (atual.status === status) return { mudou: false };
            if (atual.status === 'concluido' || atual.status === 'cancelado' || status === 'agendado') {
                return { erro: 'transicao' };
            }
            if (status === 'confirmado') {
                const [emAtendimento] = await conexao.execute(
                    `SELECT id FROM agendamentos
                     WHERE empresa_id = ? AND data_atendimento = ? AND status = 'confirmado'
                       AND posicao_fila IS NOT NULL LIMIT 1`,
                    [empresaId, atual.data]
                );
                if (emAtendimento.length) return { erro: 'atendimento' };
            }
            await conexao.execute(
                'UPDATE agendamentos SET status = ? WHERE id = ? AND empresa_id = ?', [status, id, empresaId]
            );
            if (status === 'cancelado' && atual.status === 'agendado' && atual.cliente_pacote_id) {
                // O débito ocorreu na entrada; devolva-o apenas antes do início do atendimento.
                await conexao.execute(
                    `UPDATE cliente_pacotes SET sessoes_restantes = sessoes_restantes + 1,
                         status = IF(status = 'concluido', 'ativo', status)
                     WHERE id = ?`, [atual.cliente_pacote_id]
                );
            }
            if (status === 'concluido') await registrarAtendimento(conexao, empresaId, id);
            return { mudou: true, data: atual.data };
        }),

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
                JOIN clientes c ON a.cliente_id = c.id AND c.empresa_id = a.empresa_id
                LEFT JOIN servicos s ON a.servico_id = s.id AND s.empresa_id = a.empresa_id
                WHERE a.empresa_id = ? 
                AND a.data_atendimento = ? 
                AND a.posicao_fila IS NOT NULL AND a.status = 'agendado'
                ORDER BY a.posicao_fila ASC, a.id ASC
                LIMIT 1
            `;
            const [linhas] = await pool.execute(query, [empresa_id, data_atendimento]);
            return linhas[0] || null;
    },

};

module.exports = AgendamentoModel;
