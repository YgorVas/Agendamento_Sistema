const pool = require('../config/db');
const ClienteModel = require('./clienteModel');
const { registrarAtendimento } = require('./financeiroModel');
const { variantesTelefone } = require('../services/telefone');

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

async function temEntradaAtiva(conexao, empresaId, data, { id, telefone_whatsapp }) {
    const [entradas] = await conexao.execute(`
        SELECT a.id FROM agendamentos a
        JOIN clientes c ON c.id = a.cliente_id AND c.empresa_id = a.empresa_id
        WHERE a.empresa_id = ? AND a.data_atendimento = ? AND a.posicao_fila IS NOT NULL
          AND a.status IN ('agendado', 'confirmado')
          AND (c.id = ? OR REGEXP_REPLACE(c.telefone_whatsapp, '[^0-9]', '') IN (NULLIF(?, ''), NULLIF(?, '')))
        LIMIT 1
    `, [empresaId, data, id, ...variantesTelefone(telefone_whatsapp)]);
    return entradas.length > 0;
}

async function servicosDaEmpresa(conexao, empresaId, ids) {
    const [servicos] = await conexao.query(
        'SELECT id FROM servicos WHERE empresa_id = ? AND id IN (?) FOR SHARE', [empresaId, ids]
    );
    return servicos.length === ids.length;
}

async function debitarPacotes(conexao, empresaId, clienteId, data, servicos) {
    const pares = servicos.filter(item => item.pacoteId !== null).map(item => [item.pacoteId, item.servicoId]);
    if (!pares.length) return true;

    const [pacotes] = await conexao.query(`
        SELECT cp.id FROM cliente_pacotes cp JOIN pacotes p ON p.id = cp.pacote_id
        WHERE cp.cliente_id = ? AND p.empresa_id = ? AND cp.status = 'ativo' AND cp.sessoes_restantes > 0
          AND cp.data_validade >= GREATEST(CURDATE(), CAST(? AS DATE))
          AND (cp.id, p.servico_id) IN (?)
        FOR UPDATE
    `, [clienteId, empresaId, data, pares]);
    if (pacotes.length !== pares.length) return false;

    await conexao.query(`
        UPDATE cliente_pacotes SET status = IF(sessoes_restantes = 1, 'concluido', 'ativo'),
            sessoes_restantes = sessoes_restantes - 1
        WHERE id IN (?)
    `, [pacotes.map(pacote => pacote.id)]);
    return true;
}

async function inserirNaFila(conexao, empresaId, clienteId, servicos, data, ticketHash) {
    const [fila] = await conexao.execute(
        `SELECT COALESCE(MAX(posicao_fila), 0) + 1 AS posicao,
                COUNT(CASE WHEN status IN ('agendado', 'confirmado') THEN 1 END) AS pessoas
         FROM agendamentos WHERE empresa_id = ? AND data_atendimento = ? AND posicao_fila IS NOT NULL`,
        [empresaId, data]
    );
    const { posicao, pessoas } = fila[0];
    // Mantém o primeiro serviço nos campos usados pelas integrações anteriores.
    const principal = servicos[0];
    const [novo] = await conexao.execute(
        `INSERT INTO agendamentos
            (empresa_id, cliente_id, servico_id, cliente_pacote_id, posicao_fila, data_atendimento, data_hora, status, ticket_hash)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), 'agendado', ?)`,
        [empresaId, clienteId, principal.servicoId, principal.pacoteId, posicao, data, ticketHash]
    );
    await conexao.query(`
        INSERT INTO agendamento_servicos (agendamento_id, servico_id, cliente_pacote_id) VALUES ?
    `, [servicos.map(({ servicoId, pacoteId }) => [novo.insertId, servicoId, pacoteId])]);
    return { id: novo.insertId, posicao, pessoas };
}

async function consultarFila(empresaId, data, apenasProximo = false) {
    const [linhas] = await pool.execute(`
        WITH fila AS (
            SELECT a.id, a.posicao_fila, a.cliente_pacote_id, a.servico_id, a.status,
                   c.nome AS cliente_nome, c.telefone_whatsapp AS cliente_telefone
            FROM agendamentos a
            JOIN clientes c ON c.id = a.cliente_id AND c.empresa_id = a.empresa_id
            WHERE a.empresa_id = ? AND a.data_atendimento = ? AND a.posicao_fila IS NOT NULL
              AND ${apenasProximo ? "a.status = 'agendado'" : "a.status != 'cancelado'"}
            ORDER BY a.posicao_fila, a.id
            ${apenasProximo ? 'LIMIT 1' : ''}
        )
        SELECT fila.id, fila.posicao_fila, fila.cliente_pacote_id, fila.status,
               fila.cliente_nome, fila.cliente_telefone, s.id AS servico_id, s.nome AS servico_nome,
               s.duracao_minutos, item.cliente_pacote_id AS pacote_do_servico
        FROM fila
        LEFT JOIN agendamento_servicos item ON item.agendamento_id = fila.id
        LEFT JOIN servicos s ON s.id = item.servico_id AND s.empresa_id = ?
        ORDER BY fila.posicao_fila, fila.id, (s.id = fila.servico_id) DESC, s.id
    `, [empresaId, data, empresaId]);

    const entradas = new Map();
    for (const { servico_id, servico_nome, duracao_minutos, pacote_do_servico, ...dados } of linhas) {
        if (!entradas.has(dados.id)) {
            entradas.set(dados.id, { ...dados, servico_nome, duracao_minutos: null, servicos: [] });
        }
        if (servico_id === null) continue;
        const entrada = entradas.get(dados.id);
        entrada.servicos.push({ servico_id, servico_nome, duracao_minutos, cliente_pacote_id: pacote_do_servico });
        entrada.duracao_minutos = (entrada.duracao_minutos ?? 0) + duracao_minutos;
    }
    return [...entradas.values()];
}

const AgendamentoModel = {
    entrarNaFilaPublica: (empresaId, nome, telefone, servicoIds, data, ticketHash) =>
        transacaoDaEmpresa(empresaId, async (conexao) => {
            const [entradas] = await conexao.execute(
                'SELECT posicao_fila FROM agendamentos WHERE ticket_hash = ? AND empresa_id = ?',
                [ticketHash, empresaId]
            );
            if (entradas.length) return { existente: true, posicao: entradas[0].posicao_fila };

            if (!await servicosDaEmpresa(conexao, empresaId, servicoIds)) return { erro: 'servico' };

            const cliente = await ClienteModel.buscarPorTelefone(empresaId, telefone, conexao);
            if (cliente && await temEntradaAtiva(conexao, empresaId, data, cliente)) return { erro: 'entrada_ativa' };
            const clienteId = cliente?.id ??
                await ClienteModel.criar(empresaId, nome, telefone, null, null, conexao);
            const servicos = servicoIds.map(servicoId => ({ servicoId, pacoteId: null }));
            return inserirNaFila(conexao, empresaId, clienteId, servicos, data, ticketHash);
        }),

    entrarNaFila: (empresaId, clienteId, servicos, data, ticketHash) =>
        transacaoDaEmpresa(empresaId, async (conexao) => {
            const [[cliente]] = await conexao.execute(
                'SELECT id, telefone_whatsapp FROM clientes WHERE empresa_id = ? AND id = ? FOR SHARE',
                [empresaId, clienteId]
            );
            if (!cliente) return { erro: 'cadastro' };
            if (await temEntradaAtiva(conexao, empresaId, data, cliente)) return { erro: 'entrada_ativa' };
            if (!await servicosDaEmpresa(conexao, empresaId, servicos.map(item => item.servicoId))) {
                return { erro: 'cadastro' };
            }
            if (!await debitarPacotes(conexao, empresaId, clienteId, data, servicos)) return { erro: 'pacote' };
            return inserirNaFila(conexao, empresaId, clienteId, servicos, data, ticketHash);
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

    listarFilaDoDia: (empresaId, data) => consultarFila(empresaId, data),

    atualizarStatus: (empresaId, id, status) =>
        transacaoDaEmpresa(empresaId, async (conexao) => {
            const [registros] = await conexao.execute(
                `SELECT status, DATE_FORMAT(data_atendimento, '%Y-%m-%d') AS data
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
            if (status === 'cancelado' && atual.status === 'agendado') {
                await conexao.execute(`
                    UPDATE agendamentos a
                    LEFT JOIN agendamento_servicos item ON item.agendamento_id = a.id
                    JOIN cliente_pacotes cp ON cp.cliente_id = a.cliente_id
                        AND cp.id = IF(item.agendamento_id IS NULL, a.cliente_pacote_id, item.cliente_pacote_id)
                    SET cp.sessoes_restantes = cp.sessoes_restantes + 1,
                        cp.status = IF(cp.status = 'concluido', 'ativo', cp.status)
                    WHERE a.id = ? AND a.empresa_id = ?
                `, [id, empresaId]);
            }
            if (status === 'concluido') await registrarAtendimento(conexao, empresaId, id);
            return { mudou: true, data: atual.data };
        }),

    obterProximoDaFila: async (empresaId, data) => (await consultarFila(empresaId, data, true))[0] ?? null
};

module.exports = AgendamentoModel;
