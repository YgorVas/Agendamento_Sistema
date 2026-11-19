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

    const [schema, migracaoFila, migracaoTicket, migracaoFinanceiro, migracaoAuth, migracaoServicos] = await Promise.all([
        readFile(path.join(sqlDir, 'Projeto_Agendamento.sql'), 'utf8'),
        readFile(path.join(sqlDir, 'migrations/001_fila_diaria.sql'), 'utf8'),
        readFile(path.join(sqlDir, 'migrations/002_ticket_publico.sql'), 'utf8'),
        readFile(path.join(sqlDir, 'migrations/003_registros_atendimento.sql'), 'utf8'),
        readFile(path.join(sqlDir, 'migrations/004_autenticacao_multi_tenant.sql'), 'utf8'),
        readFile(path.join(sqlDir, 'migrations/005_servicos_por_entrada.sql'), 'utf8')
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
            DROP TABLE registros_atendimento;
            ALTER TABLE agendamentos DROP INDEX idx_fila_empresa_dia,
                DROP COLUMN data_atendimento, DROP COLUMN posicao_fila, DROP COLUMN ticket_hash;
            INSERT INTO agendamentos (empresa_id, cliente_id, servico_id, data_hora)
            VALUES (1, 1, 1, '2024-01-02 13:45:00');
        `);
        for (const migracao of [migracaoFila, migracaoTicket, migracaoFinanceiro, migracaoAuth]) {
            const sql = migracao.replace(/^USE gestao_agendamentos;/m, 'USE ' + banco + ';');
            await db.query(sql);
            await db.query(sql);
        }
        const [[registro]] = await db.query(`
            SELECT CAST(data_atendimento AS CHAR) AS dia, posicao_fila, ticket_hash FROM agendamentos
        `);
        assert.deepEqual(registro, { dia: '2024-01-02', posicao_fila: null, ticket_hash: null });
    });

    await t.test('prepara estrutura de serviços por entrada sem alterar pacotes anteriores', async () => {
        const sql = migracaoServicos.replace(/^USE gestao_agendamentos;/m, 'USE ' + banco + ';');
        await db.query(sql);
        await db.query(sql);
        const [[pacote]] = await db.query('SELECT servico_id FROM pacotes WHERE id = 1');
        assert.equal(pacote.servico_id, null);
        const [tabelas] = await db.query("SHOW TABLES LIKE 'agendamento_servicos'");
        assert.equal(tabelas.length, 1);
    });

    const segredo = randomBytes(32).toString('hex');
    const { emitirAcesso } = require('../src/services/tokensAuth');
    const tokenA = emitirAcesso(1, 1, 'ADMIN', segredo);
    const tokenB = emitirAcesso(2, 2, 'GERENTE', segredo);
    await db.query(`
        INSERT INTO usuarios (id, nome, email, senha_hash)
        VALUES (1, 'Operador A', 'operador-a@example.test', 'fixture'),
               (2, 'Operador B', 'operador-b@example.test', 'fixture');
        INSERT INTO usuario_comercios (usuario_id, empresa_id, cargo)
        VALUES (1, 1, 'ADMIN'), (2, 2, 'GERENTE');
    `);
    Object.assign(process.env, {
        DB_HOST: config.host, DB_PORT: String(config.port),
        DB_USER: config.user, DB_PASSWORD: config.password, DB_NAME: banco,
        AUTH_JWT_SECRET: segredo
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

    await t.test('cadastro de pacote exige serviço da própria empresa', async () => {
        const pedido = { nome: 'Pacote vinculado', total_sessoes: 2, preco_total: 50, dias_validade: 30 };
        assert.equal((await requisicao('/pacotes', tokenA, 'POST', pedido)).status, 400);
        assert.equal((await requisicao('/pacotes', tokenA, 'POST', { ...pedido, servico_id: 2 })).status, 404);
        const resposta = await requisicao('/pacotes', tokenA, 'POST', { ...pedido, servico_id: 1 });
        assert.equal(resposta.status, 201);
        const { pacote_id } = await resposta.json();
        const [[pacote]] = await db.execute('SELECT servico_id FROM pacotes WHERE id = ?', [pacote_id]);
        assert.equal(pacote.servico_id, 1);
        await db.execute('DELETE FROM pacotes WHERE id = ?', [pacote_id]);
    });

    await t.test('serve o painel e seus módulos JavaScript', async () => {
        const painel = await fetch(base);
        assert.equal(painel.status, 200);
        assert.match(await painel.text(), /src="\/assets\/empresa\/index.mjs"/);
        const entradaPublica = await fetch(base + '/fila.html?empresa=1');
        assert.equal(entradaPublica.status, 200);
        assert.match(await entradaPublica.text(), /src="\/assets\/fila-publica.mjs"/);
        for (const nome of ['empresa/index.mjs', 'empresa/balcao.mjs', 'empresa/catalogo.mjs',
            'empresa/fila.mjs', 'empresa/financeiro.mjs', 'empresa/sessao.mjs', 'empresa/toast.mjs', 'html.mjs',
            'api.mjs', 'painel.css', 'tailwind-config.js', 'fila-publica.mjs', 'cliente.css']) {
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

    await t.test('cancela pacote antes do início com estorno único', async () => {
        await db.query(`INSERT INTO pacotes (id, empresa_id, nome, total_sessoes, preco_total)
            VALUES (3, 1, 'Pacote para estorno', 1, 20);
            INSERT INTO cliente_pacotes (id, cliente_id, pacote_id, sessoes_restantes, data_validade)
            VALUES (3, 1, 3, 1, CURRENT_DATE + INTERVAL 30 DAY)`);
        const pedido = { ...entrada, cliente_pacote_id: 3 };
        const primeira = await entrar(pedido);
        assert.equal(primeira.status, 201);
        const { agendamento_id: id } = await primeira.json();
        const mudar = (registro, status) => requisicao('/agendamentos/status', tokenA, 'PATCH', { id: registro, status });
        const cancelamentos = await Promise.all([mudar(id, 'cancelado'), mudar(id, 'cancelado')]);
        assert.deepEqual(cancelamentos.map(resposta => resposta.status), [200, 200]);
        const [[estornado]] = await db.query('SELECT sessoes_restantes, status FROM cliente_pacotes WHERE id = 3');
        assert.deepEqual(estornado, { sessoes_restantes: 1, status: 'ativo' });

        const segunda = await entrar(pedido);
        assert.equal(segunda.status, 201);
        const { agendamento_id: iniciado } = await segunda.json();
        assert.equal((await mudar(iniciado, 'confirmado')).status, 200);
        assert.equal((await mudar(iniciado, 'cancelado')).status, 200);
        const [[consumido]] = await db.query('SELECT sessoes_restantes, status FROM cliente_pacotes WHERE id = 3');
        assert.deepEqual(consumido, { sessoes_restantes: 0, status: 'concluido' });
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

    await t.test('balcão e entrada pública reutilizam cliente pelo telefone em cada empresa', async () => {
        const pedido = { nome: 'Cliente original', telefone_whatsapp: '(11) 98888-7777' };
        const criar = (token, dados) => requisicao('/clientes', token, 'POST', dados);
        const respostas = await Promise.all([criar(tokenA, pedido), criar(tokenA, pedido)]);
        assert.deepEqual(respostas.map(r => r.status).sort(), [200, 201]);
        const clientes = await Promise.all(respostas.map(r => r.json()));
        assert.equal(clientes[0].cliente_id, clientes[1].cliente_id);
        const outra = await criar(tokenB, pedido);
        assert.equal(outra.status, 201);
        const outroId = (await outra.json()).cliente_id;
        assert.notEqual(outroId, clientes[0].cliente_id);
        await db.execute('DELETE FROM clientes WHERE id = ? AND empresa_id = 2', [outroId]);
        const publica = await fetch(base + '/fila-publica/1/entradas', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome: 'Nome diferente', telefone_whatsapp: '5511988887777', servico_id: 1, ticket: randomBytes(32).toString('hex') })
        });
        assert.equal(publica.status, 201);
        const [registros] = await db.execute("SELECT nome FROM clientes WHERE empresa_id = 1 AND REGEXP_REPLACE(telefone_whatsapp, '[^0-9]', '') IN (?, ?)", ['11988887777', '5511988887777']);
        assert.deepEqual(registros.map(c => c.nome), ['Cliente original']);
    });

    await t.test('cliente entra pelo catálogo público e repete a requisição sem duplicar a entrada', async () => {
        const catalogo = await fetch(base + '/fila-publica/1/servicos');
        assert.equal(catalogo.status, 200);
        const dados = await catalogo.json();
        assert.equal(dados.nome_fantasia, 'Empresa A');
        assert.deepEqual(dados.servicos.map(servico => servico.id), [1]);

        const ticket = randomBytes(32).toString('hex');
        const pedido = { nome: 'Cliente público', telefone_whatsapp: '(82) 99999-1234', servico_id: 1, ticket };
        const enviar = body => fetch(base + '/fila-publica/1/entradas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        assert.equal((await enviar({ ...pedido, servico_id: 2 })).status, 404);
        const respostas = await Promise.all([enviar(pedido), enviar(pedido)]);
        assert.deepEqual(respostas.map(resposta => resposta.status).sort(), [200, 201]);
        const [primeira, segunda] = await Promise.all(respostas.map(resposta => resposta.json()));
        assert.deepEqual(primeira, segunda);
        const consulta = await requisicao('/agendamentos/ticket', ticket);
        assert.equal(consulta.status, 200);
        assert.equal((await consulta.json()).posicao_fila, primeira.posicao_fila);

        const data = new Intl.DateTimeFormat('sv-SE', {
            timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date());
        const fila = await requisicao('/agendamentos/fila/1/' + data, tokenA);
        const clientes = (await fila.json()).filter(item => item.cliente_nome === pedido.nome);
        assert.equal(clientes.length, 1);
        assert.equal(clientes[0].posicao_fila, primeira.posicao_fila);
    });

    await t.test('registra conclusões uma vez e soma avulsos e sessões por período e empresa', async () => {
        const rota = '/financeiro/resumo';
        assert.equal((await requisicao(rota, 'inválido')).status, 401);
        await db.query(`
            INSERT INTO pacotes (id, empresa_id, nome, total_sessoes, preco_total)
            VALUES (2, 1, 'Três sessões', 3, 100);
            INSERT INTO cliente_pacotes (id, cliente_id, pacote_id, sessoes_restantes, data_validade)
            VALUES (2, 1, 2, 3, CURRENT_DATE + INTERVAL 30 DAY);
        `);
        const mudarStatus = (id, status) => requisicao('/agendamentos/status', tokenA, 'PATCH', { id, status });
        const registrar = async (pedido) => {
            const resposta = await entrar(pedido);
            assert.equal(resposta.status, 201);
            return (await resposta.json()).agendamento_id;
        };
        const avulso = await registrar({ ...entrada, data_atendimento: '2024-01-03' });
        const cancelado = await registrar(entrada);
        assert.equal((await mudarStatus(cancelado, 'cancelado')).status, 200);
        assert.equal((await mudarStatus(avulso, 'confirmado')).status, 200);
        const conclusoes = await Promise.all([mudarStatus(avulso, 'concluido'), mudarStatus(avulso, 'concluido')]);
        assert.deepEqual(conclusoes.map(resposta => resposta.status), [200, 200]);
        for (let sessao = 0; sessao < 3; sessao++) {
            const id = await registrar({ ...entrada, cliente_pacote_id: 2 });
            assert.equal((await mudarStatus(id, 'concluido')).status, 200);
        }
        await db.query('UPDATE servicos SET preco = 800 WHERE id = 1; UPDATE pacotes SET preco_total = 900 WHERE id = 2');

        const lerResumo = async (token) => {
            const resposta = await requisicao(rota, token);
            assert.equal(resposta.status, 200);
            assert.equal(resposta.headers.get('cache-control'), 'no-store');
            return resposta.json();
        };
        const antes = await lerResumo(tokenA);
        assert.equal(antes.totais.hoje, '120.00');
        assert.equal(antes.totais.qtd_hoje, 4);
        assert.deepEqual(antes.registros.map(({ data_conclusao, pacote_nome, valor }) =>
            [data_conclusao, pacote_nome, valor]), [
            ...Array.from({ length: 3 }, () => [antes.hoje, 'Três sessões', '33.33']),
            [antes.hoje, null, '20.00']
        ]);

        await db.execute(`
            INSERT INTO registros_atendimento
                (agendamento_id, empresa_id, cliente_nome, servico_nome, valor, data_conclusao, concluido_em_utc)
            VALUES (-1, 1, 'Cliente A', 'Anterior à semana', 10, DATE_SUB(?, INTERVAL 1 DAY), UTC_TIMESTAMP()),
                   (-2, 1, 'Cliente A', 'Anterior ao mês', 40, DATE_SUB(?, INTERVAL 1 DAY), UTC_TIMESTAMP()),
                   (-3, 1, 'Cliente A', 'Futuro', 80, DATE_ADD(?, INTERVAL 1 DAY), UTC_TIMESTAMP())
        `, [antes.inicio_semana, antes.inicio_mes, antes.hoje]);
        const depois = await lerResumo(tokenA);
        const incluiMesAnterior = antes.inicio_mes > antes.inicio_semana;
        const incluiSemanaAnterior = antes.inicio_semana > antes.inicio_mes;
        assert.deepEqual(depois.totais, {
            hoje: '120.00',
            semana: incluiMesAnterior ? '160.00' : '120.00',
            mes: incluiSemanaAnterior ? '130.00' : '120.00',
            qtd_hoje: 4,
            qtd_semana: incluiMesAnterior ? 5 : 4,
            qtd_mes: incluiSemanaAnterior ? 5 : 4
        });
        assert.equal(depois.registros.length, 6);
        const outraEmpresa = await lerResumo(tokenB);
        assert.equal(outraEmpresa.totais.qtd_mes, 0);
        assert.equal(outraEmpresa.totais.mes, '0.00');
        assert.deepEqual(outraEmpresa.registros, []);
    });

    await t.test('consulta períodos anteriores e soma por serviço além das 30 linhas recentes', async () => {
        const rota = '/financeiro/periodo';
        for (const consulta of ['tipo=trimestre', 'data=2021-02-29', 'data=9999-01-01', 'data=2020-12-28&data=2021-01-01']) {
            assert.equal((await requisicao(`${rota}?${consulta}`, tokenA)).status, 400);
        }
        const registros = Array.from({ length: 31 }, (_, indice) =>
            [10000 + indice, 1, 'Cliente A', 'Corte', 10, '2020-12-28', '2020-12-28 12:00:00']);
        registros.push(
            [10031, 1, 'Cliente A', 'Barba', 30, '2021-01-03', '2021-01-03 12:00:00'],
            [10032, 1, 'Cliente A', 'Barba', 20, '2021-01-04', '2021-01-04 12:00:00'],
            [10033, 2, 'Cliente B', 'Corte', 150, '2020-12-28', '2020-12-28 12:00:00']
        );
        await db.query(`
            INSERT INTO registros_atendimento
                (agendamento_id, empresa_id, cliente_nome, servico_nome, valor, data_conclusao, concluido_em_utc)
            VALUES ?
        `, [registros]);

        const consultar = async (tipo, data, token = tokenA) => {
            const resposta = await requisicao(`${rota}?tipo=${tipo}&data=${data}`, token);
            assert.equal(resposta.status, 200);
            assert.equal(resposta.headers.get('cache-control'), 'no-store');
            return resposta.json();
        };
        const dia = await consultar('dia', '2020-12-28');
        assert.equal(dia.total, '310.00');
        assert.equal(dia.registros.length, 30);
        const semana = await consultar('semana', '2021-01-01');
        assert.equal(semana.periodo.inicio, '2020-12-28');
        assert.equal(semana.periodo.fim, '2021-01-03');
        assert.equal(semana.total, '340.00');
        assert.deepEqual(semana.servicos.map(({ nome, valor }) => [nome, Number(valor)]),
            [['Corte', 310], ['Barba', 30]]);
        assert.equal(semana.registros[0].data_conclusao, '2021-01-03');
        assert.equal((await consultar('mes', '2021-01-30')).total, '50.00');
        assert.equal((await consultar('ano', '2020-01-01')).total, '310.00');
        assert.equal((await consultar('ano', '2020-01-01', tokenB)).total, '150.00');
        const vazio = await consultar('dia', '2020-02-29');
        assert.equal(vazio.total, '0.00');
        assert.deepEqual(vazio.servicos, []);
        assert.deepEqual(vazio.registros, []);
    });
    await t.test('login, troca de loja, atribuição de pacote, loja inativa e sessão expirada no MySQL', async () => {
        const bcrypt = require('bcryptjs');
        const jwt = require('jsonwebtoken');
        const senha = 'demonstracao-integracao';
        await db.execute('INSERT INTO usuarios (id, nome, email, senha_hash) VALUES (3, ?, ?, ?)',
            ['Administrador Demo', 'demo@example.test', await bcrypt.hash(senha, 4)]);
        await db.query(`
            INSERT INTO usuario_comercios (usuario_id, empresa_id, cargo)
            VALUES (3, 1, 'ADMIN'), (3, 2, 'CAIXA')
        `);
        const login = await requisicao('/auth/login', '', 'POST', { email: 'demo@example.test', senha });
        assert.equal(login.status, 200);
        const escolha = await login.json();
        assert.equal(escolha.comercios.length, 2);
        const acesso = await requisicao('/auth/selecionar-comercio', escolha.tokenTemporario, 'POST', { comercioId: 1 });
        assert.equal(acesso.status, 200);
        const { token } = await acesso.json();
        const venda = await requisicao('/pacotes/vender', token, 'POST', { cliente_id: 1, pacote_id: 1 });
        assert.equal(venda.status, 201);
        const atribuicao = await venda.json();
        assert.equal(atribuicao.sessoes_iniciais, 1);
        assert.equal((await requisicao('/pacotes/vender', token, 'POST',
            { cliente_id: 2, pacote_id: 1 })).status, 404);
        assert.equal((await requisicao('/pacotes/vender', token, 'POST',
            { cliente_id: 1, pacote_id: 0 })).status, 400);
        const consumo = await entrar({ ...entrada, cliente_pacote_id: atribuicao.cliente_pacote_id }, token);
        assert.equal(consumo.status, 201);
        const saldo = await requisicao('/pacotes/cliente/1', token);
        const pacote = (await saldo.json()).find(item => item.id === atribuicao.cliente_pacote_id);
        assert.equal(pacote.sessoes_restantes, 0);
        assert.equal(pacote.status, 'concluido');
        const troca = await requisicao('/auth/iniciar-selecao', token, 'POST', {});
        assert.equal(troca.status, 200);
        const selecaoB = await requisicao('/auth/selecionar-comercio',
            (await troca.json()).tokenTemporario, 'POST', { comercioId: 2 });
        assert.equal(selecaoB.status, 200);
        const { token: tokenCaixa } = await selecaoB.json();
        const clientes = await requisicao('/clientes?empresa_id=1', tokenCaixa);
        assert.deepEqual((await clientes.json()).map(cliente => cliente.id), [2]);
        assert.equal((await requisicao('/financeiro/resumo', tokenCaixa)).status, 403);
        assert.equal((await requisicao('/servicos', tokenCaixa, 'POST', { nome: 'Proibido' })).status, 403);
        assert.equal((await requisicao('/pacotes', tokenCaixa, 'POST', { nome: 'Proibido' })).status, 403);
        const expirado = jwt.sign({ usuarioId: 3, comercioId: 1, cargo: 'ADMIN' }, segredo,
            { algorithm: 'HS256', issuer: 'agendamento', audience: 'acesso-comercio', expiresIn: -1 });
        assert.equal((await requisicao('/clientes', expirado)).status, 401);
        try {
            await db.query('UPDATE empresas SET ativo = FALSE WHERE id = 2');
            assert.equal((await requisicao('/clientes', tokenCaixa)).status, 403);
            const novoLogin = await requisicao('/auth/login', '', 'POST', { email: 'demo@example.test', senha });
            const direto = await novoLogin.json();
            assert.equal(direto.comercioId, 1);
            assert.ok(direto.token);
        } finally {
            await db.query('UPDATE empresas SET ativo = TRUE WHERE id = 2');
        }
    });
});
