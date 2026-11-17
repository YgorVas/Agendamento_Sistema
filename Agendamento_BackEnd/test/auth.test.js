const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const { test } = require('node:test');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

test('autenticação HTTP isola comércios e revalida o acesso a cada chamada', async (t) => {
    process.env.AUTH_JWT_SECRET = randomBytes(32).toString('hex');
    const pool = require('../src/config/db');
    const senha = 'senha de teste';
    const senha_hash = await bcrypt.hash(senha, 4);
    const comercios = [
        { comercioId: 11, nomeFantasia: 'Loja A', cargo: 'ADMIN' },
        { comercioId: 22, nomeFantasia: 'Loja B', cargo: 'CAIXA' }
    ];
    let ativos = comercios.slice();

    t.mock.method(pool, 'execute', async (sql, params) => {
        if (sql.includes('FROM usuarios')) {
            return [params[0] === 'loja@example.test' ? [{ id: 7, senha_hash }] : []];
        }
        if (sql.includes('FROM usuario_comercios')) {
            assert.equal(params[0], 7);
            assert.match(sql, /e\.ativo = TRUE/);
            return [params.length === 1 ? ativos : ativos.filter(c => c.comercioId === params[1])];
        }
        if (sql.includes('FROM clientes')) {
            assert.deepEqual(params, [22]);
            return [[{ id: 15, nome: 'Cliente da loja B' }]];
        }
        assert.match(sql, /FROM servicos\s+WHERE empresa_id = \?/);
        assert.deepEqual(params, [22]);
        return [[{ id: 9, nome: 'Serviço da loja B' }]];
    });

    const servidor = require('../src/app').listen(0, '127.0.0.1');
    t.after(() => new Promise(resolve => servidor.close(resolve)));
    await once(servidor, 'listening');
    const base = `http://127.0.0.1:${servidor.address().port}`;
    for (const [rota, titulo] of [['/login', 'Entrar no painel'], ['/dashboard', 'Painel do estabelecimento']]) {
        const pagina = await fetch(base + rota);
        assert.equal(pagina.status, 200);
        assert.ok((await pagina.text()).includes(titulo));
    }
    async function chamar(rota, { dados, token } = {}) {
        const resposta = await fetch(base + rota, {
            method: dados ? 'POST' : 'GET',
            headers: {
                ...(dados && { 'Content-Type': 'application/json' }),
                ...(token && { Authorization: `Bearer ${token}` })
            },
            body: dados && JSON.stringify(dados)
        });
        return { status: resposta.status, corpo: await resposta.json() };
    }

    const login = dados => chamar('/auth/login', { dados });
    const credenciais = { email: 'loja@example.test', senha };
    assert.equal((await login({ ...credenciais, senha: 'incorreta' })).status, 401);
    assert.equal((await chamar('/servicos')).status, 401);
    const escolha = await login(credenciais);
    assert.equal(escolha.status, 200);
    assert.deepEqual(escolha.corpo.comercios, comercios);
    const { tokenTemporario } = escolha.corpo;
    assert.deepEqual(Object.keys(escolha.corpo).sort(), ['comercios', 'tokenTemporario']);
    assert.equal((await chamar('/servicos', { token: tokenTemporario })).status, 401);

    const selecionar = (comercioId, token = tokenTemporario) =>
        chamar('/auth/selecionar-comercio', { dados: { comercioId }, token });
    assert.equal((await selecionar(99)).status, 403);
    const acesso = await selecionar(22);
    assert.equal(acesso.status, 200);
    const { token, ...instancia } = acesso.corpo;
    assert.deepEqual(instancia, { comercioId: 22, cargo: 'CAIXA' });
    assert.equal(jwt.decode(token).usuarioId, 7);
    assert.equal((await selecionar(11, token)).status, 401);
    const catalogo = await chamar('/servicos?empresa_id=11&comercioId=11', { token });
    assert.deepEqual(catalogo, { status: 200, corpo: [{ id: 9, nome: 'Serviço da loja B' }] });
    assert.equal((await chamar('/clientes/empresa/11', { token })).status, 403);
    assert.deepEqual(await chamar('/clientes?empresa_id=11', { token }), {
        status: 200, corpo: [{ id: 15, nome: 'Cliente da loja B' }]
    });
    assert.equal((await chamar('/financeiro/resumo', { token })).status, 403);
    assert.equal((await chamar('/servicos', { token, dados: { nome: 'Teste' } })).status, 403);
    assert.equal((await chamar('/pacotes', { token, dados: { nome: 'Teste' } })).status, 403);

    const lojas = await chamar('/auth/comercios', { token });
    assert.deepEqual(lojas, { status: 200, corpo: { comercios, comercioAtual: comercios[1] } });
    const troca = await chamar('/auth/iniciar-selecao', { token, dados: {} });
    assert.equal(troca.status, 200);
    assert.equal((await selecionar(11, troca.corpo.tokenTemporario)).corpo.cargo, 'ADMIN');

    ativos = comercios.slice(0, 1);
    assert.equal((await chamar('/servicos', { token })).status, 403);
    assert.equal((await selecionar(22)).status, 403);
    const acessoDireto = await login(credenciais);
    assert.equal(acessoDireto.status, 200);
    assert.equal(acessoDireto.corpo.comercioId, 11);
    assert.equal(jwt.decode(acessoDireto.corpo.token).cargo, 'ADMIN');
    assert.equal((await chamar('/auth/iniciar-selecao', { token: acessoDireto.corpo.token, dados: {} })).status, 403);

    ativos = [];
    assert.equal((await login(credenciais)).status, 403);
});
