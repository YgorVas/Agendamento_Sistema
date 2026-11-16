const pool = require('../config/db');

const dataLocal = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
});

const dataISO = (data) => data.toISOString().slice(0, 10);

function inicioDaSemana(data) {
    const segunda = new Date(data);
    segunda.setUTCDate(segunda.getUTCDate() - (segunda.getUTCDay() + 6) % 7);
    return dataISO(segunda);
}

function resolverPeriodo(tipo, data, hoje = dataLocal.format(new Date())) {
    const referencia = data ?? hoje;
    if (typeof referencia !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(referencia) ||
        referencia > hoje) return null;

    const ultimoDia = new Date(referencia);
    if (!Number.isFinite(ultimoDia.getTime()) || dataISO(ultimoDia) !== referencia) return null;

    const ano = ultimoDia.getUTCFullYear();
    const mes = ultimoDia.getUTCMonth();
    let inicio = referencia;
    switch (tipo) {
        case 'dia':
            break;
        case 'semana':
            inicio = inicioDaSemana(referencia);
            ultimoDia.setUTCDate(ultimoDia.getUTCDate() + (7 - ultimoDia.getUTCDay()) % 7);
            break;
        case 'mes':
            inicio = referencia.slice(0, 7) + '-01';
            ultimoDia.setTime(Date.UTC(ano, mes + 1, 0));
            break;
        case 'ano':
            inicio = ano + '-01-01';
            ultimoDia.setTime(Date.UTC(ano, 11, 31));
            break;
        default:
            return null;
    }
    const fim = dataISO(ultimoDia);
    return { tipo, referencia, inicio, fim: fim > hoje ? hoje : fim, hoje };
}

async function registrarAtendimento(conexao, empresaId, agendamentoId) {
    const agora = new Date();
    await conexao.execute(`
        INSERT INTO registros_atendimento
            (agendamento_id, empresa_id, cliente_nome, servico_nome, pacote_nome,
             valor, data_conclusao, concluido_em_utc)
        SELECT a.id, a.empresa_id, c.nome, s.nome, p.nome,
               CASE WHEN a.cliente_pacote_id IS NULL THEN s.preco
                    ELSE CAST(p.preco_total AS DECIMAL(28, 18)) / p.total_sessoes END,
               ?, ?
        FROM agendamentos a
        JOIN clientes c ON c.id = a.cliente_id AND c.empresa_id = a.empresa_id
        JOIN servicos s ON s.id = a.servico_id AND s.empresa_id = a.empresa_id
        LEFT JOIN cliente_pacotes cp ON cp.id = a.cliente_pacote_id AND cp.cliente_id = c.id
        LEFT JOIN pacotes p ON p.id = cp.pacote_id AND p.empresa_id = a.empresa_id
        WHERE a.id = ? AND a.empresa_id = ?
          AND (a.cliente_pacote_id IS NULL OR p.total_sessoes > 0)
    `, [dataLocal.format(agora), agora.toISOString().slice(0, 23).replace('T', ' '), agendamentoId, empresaId]);
}

async function consultarResumo(empresaId) {
    const hoje = dataLocal.format(new Date());
    const inicioSemana = inicioDaSemana(hoje);
    const inicioMes = hoje.slice(0, 7) + '-01';
    const inicioResumo = inicioSemana < inicioMes ? inicioSemana : inicioMes;

    // A precisão intermediária evita que o resíduo de uma divisão altere o arredondamento no meio centavo.
    const [linhas] = await pool.execute(`
        WITH totais AS (
            SELECT
                SUM(CASE WHEN data_conclusao = ? THEN valor ELSE 0 END) AS hoje,
                SUM(CASE WHEN data_conclusao >= ? THEN valor ELSE 0 END) AS semana,
                SUM(CASE WHEN data_conclusao >= ? THEN valor ELSE 0 END) AS mes,
                COUNT(CASE WHEN data_conclusao = ? THEN 1 END) AS qtd_hoje,
                COUNT(CASE WHEN data_conclusao >= ? THEN 1 END) AS qtd_semana,
                COUNT(CASE WHEN data_conclusao >= ? THEN 1 END) AS qtd_mes
            FROM registros_atendimento
            WHERE empresa_id = ? AND data_conclusao BETWEEN ? AND ?
        ), recentes AS (
            SELECT agendamento_id, data_conclusao, concluido_em_utc,
                   cliente_nome, servico_nome, pacote_nome, valor
            FROM registros_atendimento
            WHERE empresa_id = ? AND data_conclusao <= ?
            ORDER BY data_conclusao DESC, concluido_em_utc DESC, agendamento_id DESC
            LIMIT 30
        )
        SELECT COALESCE(ROUND(CAST(totais.hoje AS DECIMAL(36, 12)), 2), 0) AS hoje,
               COALESCE(ROUND(CAST(totais.semana AS DECIMAL(36, 12)), 2), 0) AS semana,
               COALESCE(ROUND(CAST(totais.mes AS DECIMAL(36, 12)), 2), 0) AS mes,
               totais.qtd_hoje, totais.qtd_semana, totais.qtd_mes,
               DATE_FORMAT(recentes.data_conclusao, '%Y-%m-%d') AS data_conclusao,
               recentes.cliente_nome, recentes.servico_nome, recentes.pacote_nome,
               ROUND(recentes.valor, 2) AS valor
        FROM totais LEFT JOIN recentes ON TRUE
        ORDER BY recentes.data_conclusao DESC, recentes.concluido_em_utc DESC, recentes.agendamento_id DESC
    `, [hoje, inicioSemana, inicioMes, hoje, inicioSemana, inicioMes,
        empresaId, inicioResumo, hoje, empresaId, hoje]);

    const primeiro = linhas[0];
    const totais = {
        hoje: primeiro.hoje, semana: primeiro.semana, mes: primeiro.mes,
        qtd_hoje: primeiro.qtd_hoje, qtd_semana: primeiro.qtd_semana, qtd_mes: primeiro.qtd_mes
    };
    const registros = primeiro.data_conclusao
        ? linhas.map(({ data_conclusao, cliente_nome, servico_nome, pacote_nome, valor }) =>
            ({ data_conclusao, cliente_nome, servico_nome, pacote_nome, valor }))
        : [];
    return { hoje, inicio_semana: inicioSemana, inicio_mes: inicioMes, totais, registros };
}

async function consultarPeriodo(empresaId, periodo) {
    const { inicio, fim } = periodo;
    const [linhas] = await pool.execute(`
        WITH servicos AS (
            SELECT servico_nome, SUM(valor) AS valor,
                   ROUND(CAST(SUM(SUM(valor)) OVER () AS DECIMAL(36, 12)), 2) AS total
            FROM registros_atendimento
            WHERE empresa_id = ? AND data_conclusao BETWEEN ? AND ?
            GROUP BY servico_nome
        ), recentes AS (
            SELECT agendamento_id, data_conclusao, concluido_em_utc,
                   cliente_nome, servico_nome, pacote_nome, valor
            FROM registros_atendimento
            WHERE empresa_id = ? AND data_conclusao BETWEEN ? AND ?
            ORDER BY data_conclusao DESC, concluido_em_utc DESC, agendamento_id DESC
            LIMIT 30
        )
        SELECT servico_nome, valor, total, NULL AS data_conclusao,
               NULL AS cliente_nome, NULL AS pacote_nome, NULL AS concluido_em_utc, NULL AS agendamento_id
        FROM servicos
        UNION ALL
        SELECT servico_nome, ROUND(valor, 2), NULL, DATE_FORMAT(data_conclusao, '%Y-%m-%d'),
               cliente_nome, pacote_nome, concluido_em_utc, agendamento_id
        FROM recentes
        ORDER BY data_conclusao DESC, concluido_em_utc DESC, agendamento_id DESC, valor DESC, servico_nome
    `, [empresaId, inicio, fim, empresaId, inicio, fim]);

    const servicos = [];
    const registros = [];
    let total = '0.00';
    for (const { servico_nome, valor, data_conclusao, cliente_nome, pacote_nome, total: totalPeriodo } of linhas) {
        if (data_conclusao) {
            registros.push({ data_conclusao, cliente_nome, servico_nome, pacote_nome, valor });
        } else {
            servicos.push({ nome: servico_nome, valor });
            total = totalPeriodo;
        }
    }
    return { periodo, total, servicos, registros };
}

module.exports = { registrarAtendimento, consultarResumo, consultarPeriodo, resolverPeriodo };
