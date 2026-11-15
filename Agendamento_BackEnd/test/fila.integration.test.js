const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const mysql = require('mysql2/promise');

const bancoUrl = process.env.TEST_MYSQL_URL;
const sqlDir = path.resolve(__dirname, '../../Agendamento_BD');

test('fila e migração no MySQL', { skip: !bancoUrl && 'Configure TEST_MYSQL_URL' }, async (t) => {
    const url = new URL(bancoUrl);
    assert.equal(url.protocol, 'mysql:');
    const config = {
        host: url.hostname,
        port: Number(url.port || 3306),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        multipleStatements: true
    };
    const banco = 'agendamento_test_' + randomBytes(8).toString('hex');
    const db = await mysql.createConnection(config);
    let pool;
    let servidor;
    t.after(async () => {
        try {
            if (servidor) await new Promise((resolve, reject) =>
                servidor.close(erro => erro ? reject(erro) : resolve()));
            if (pool) await pool.end();
        } finally {
            try {
                await db.query('DROP DATABASE IF EXISTS ??', [banco]);
            } finally {
                await db.end();
            }
        }
    });

    const [schema, migracaoFila, migracaoTicket] = await Promise.all([
        readFile(path.join(sqlDir, 'Projeto_Agendamento.sql'), 'utf8'),
        readFile(path.join(sqlDir, 'migrations/001_fila_diaria.sql'), 'utf8'),
        readFile(path.join(sqlDir, 'migrations/002_ticket_publico.sql'), 'utf8')
    ]);
    await db.query(schema.replace(/^(CREATE DATABASE IF NOT EXISTS|USE) gestao_agendamentos\b/gm,
        (_, comando) => comando + ' ' + banco));
    await db.query(`
        INSERT INTO empresas (id, nome_fantasia, telefone_whatsapp, email, senha_hash)
        VALUES (1, 'Empresa A', '550000000001', 'a@example.test', 'teste'),
               (2, 'Empresa B', '550000000002', 'b@example.test', 'teste');
        INSERT INTO clientes (id, empresa_id, nome, telefone_whatsapp)
        VALUES (1, 1, 'Cliente A', '550000000003'), (2, 2, 'Cliente B', '550000000004');
        INSERT INTO servicos (id, empresa_id, nome, preco)
        VALUES (1, 1, 'Serviço A', 20), (2, 2, 'Serviço B', 20);
        INSERT INTO pacotes (id, empresa_id, nome, total_sessoes, preco_total)
        VALUES (1, 1, 'Pacote A', 1, 20);
        INSERT INTO cliente_pacotes (id, cliente_id, pacote_id, sessoes_restantes, data_validade)
        VALUES (1, 1, 1, 1, CURRENT_DATE + INTERVAL 30 DAY);
    `);

    await t.test('migra um registro legado e reaplica a migração', async () => {
        await db.query(`
            ALTER TABLE agendamentos DROP INDEX idx_fila_empresa_dia,
                DROP COLUMN data_atendimento, DROP COLUMN posicao_fila, DROP COLUMN ticket_hash;
            INSERT INTO agendamentos (empresa_id, cliente_id, servico_id, data_hora)
            VALUES (1, 1, 1, '2024-01-02 13:45:00');
        `);
        for (const migracao of [migracaoFila, migracaoTicket]) {
            const sql = migracao.replace(/^USE gestao_agendamentos;/m, 'USE ' + banco + ';');
            await db.query(sql);
            await db.query(sql);
        }
        const [[registro]] = await db.query(`
            SELECT CAST(data_atendimento AS CHAR) AS dia, posicao_fila, ticket_hash FROM agendamentos
        `);
        assert.deepEqual(registro, { dia: '2024-01-02', posicao_fila: null, ticket_hash: null });
    });

    const tokenA = randomBytes(32).toString('hex');
    const tokenB = randomBytes(32).toString('hex');
    Object.assign(process.env, {
        DB_HOST: config.host, DB_PORT: String(config.port),
        DB_USER: config.user, DB_PASSWORD: config.password, DB_NAME: banco,
        EMPRESA_TOKENS: JSON.stringify({ 1: tokenA, 2: tokenB })
    });
    pool = require('../src/config/db');
    servidor = require('../src/app').listen(0, '127.0.0.1');
    await once(servidor, 'listening');
    const base = 'http://127.0.0.1:' + servidor.address().port;
    const [[{ dia }]] = await db.query('SELECT CAST(CURRENT_DATE AS CHAR) AS dia');
    const entrada = { cliente_id: 1, servico_id: 1, data_atendimento: dia };

    const requisicao = (rota, token, method = 'GET', body) => fetch(base + rota, {
        method,
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const entrar = (body, token = tokenA) => requisicao('/agendamentos/fila', token, 'POST', body);

    await t.test('serve o painel e seus módulos JavaScript', async () => {
        const painel = await fetch(base);
        assert.equal(painel.status, 200);
        assert.match(await painel.text(), /src="\/assets\/painel.mjs"/);
        for (const nome of ['painel.mjs', 'api.mjs', 'painel.css', 'tailwind-config.js']) {
            const resposta = await fetch(base + '/assets/' + nome);
            assert.equal(resposta.status, 200, nome);
            await resposta.text();
        }
    });

    await t.test('entradas simultâneas recebem posições diferentes', async () => {
        const respostas = await Promise.all([entrar(entrada), entrar(entrada)]);
        assert.deepEqual(respostas.map(r => r.status), [201, 201]);
        const dados = await Promise.all(respostas.map(r => r.json()));
        assert.deepEqual(dados.map(r => r.posicao_fila).sort(), [1, 2]);
    });

    await t.test('apenas uma entrada consome a última sessão', async () => {
        const pedido = { ...entrada, cliente_pacote_id: 1 };
        const respostas = await Promise.all([entrar(pedido), entrar(pedido)]);
        assert.deepEqual(respostas.map(r => r.status).sort(), [201, 400]);
        const [[pacote]] = await db.query('SELECT sessoes_restantes, status FROM cliente_pacotes WHERE id = 1');
        assert.deepEqual(pacote, { sessoes_restantes: 0, status: 'concluido' });
        const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM agendamentos WHERE cliente_pacote_id = 1');
        assert.equal(total, 1);
    });

    await t.test('credenciais, cadastros e registros ficam isolados por empresa', async () => {
        assert.equal((await requisicao('/agendamentos/fila/1/' + dia, 'inválido')).status, 401);
        assert.equal((await requisicao('/agendamentos/fila/1/' + dia, tokenB)).status, 403);
        assert.equal((await entrar(entrada, tokenB)).status, 404);
        const filaB = await requisicao('/agendamentos/fila/2/' + dia, tokenB);
        assert.equal(filaB.status, 200);
        assert.deepEqual(await filaB.json(), []);
        const filaA = await requisicao('/agendamentos/fila/1/' + dia, tokenA);
        const [agendamento] = await filaA.json();
        const resposta = await requisicao('/agendamentos/status', tokenB, 'PATCH',
            { id: agendamento.id, status: 'confirmado' });
        assert.equal(resposta.status, 404);
    });

    await t.test('ticket público exibe apenas a posição e o andamento da própria senha', async () => {
        const entradaB = await entrar({ ...entrada, cliente_id: 2, servico_id: 2 }, tokenB);
        assert.equal(entradaB.status, 201);
        const { ticket, agendamento_id } = await entradaB.json();
        const consulta = await requisicao('/agendamentos/ticket', ticket);
        assert.equal(consulta.status, 200);
        assert.equal(consulta.headers.get('cache-control'), 'no-store');
        assert.deepEqual(await consulta.json(), {
            posicao_fila: 1, status: 'agendado', pessoas_na_frente: 0
        });
        assert.equal((await requisicao('/agendamentos/ticket', tokenB)).status, 404);
        assert.equal((await requisicao('/agendamentos/fila/2/' + dia, ticket)).status, 401);

        const cancelar = await requisicao('/agendamentos/status', tokenB, 'PATCH',
            { id: agendamento_id, status: 'cancelado' });
        assert.equal(cancelar.status, 200);
        const cancelado = await requisicao('/agendamentos/ticket', ticket);
        assert.equal((await cancelado.json()).status, 'cancelado');
    });
});
