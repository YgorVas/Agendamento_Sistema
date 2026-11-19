const { test } = require('node:test');
const assert = require('node:assert/strict');
const limitar = require('../src/middleware/limitarRequisicoes');

test('limita tentativas por endereço e informa quando tentar novamente', () => {
    const middleware = limitar({ limite: 2, janelaMs: 60000 });
    const chamada = ip => {
        const resultado = {};
        const res = { set: (k, v) => { resultado[k] = v; }, status: s => { resultado.status = s; return res; }, json: body => { resultado.body = body; } };
        middleware({ ip }, res, () => { resultado.prosseguiu = true; });
        return resultado;
    };
    assert.equal(chamada('a').prosseguiu, true);
    assert.equal(chamada('a').prosseguiu, true);
    const bloqueada = chamada('a');
    assert.equal(bloqueada.status, 429);
    assert.ok(Number(bloqueada['Retry-After']) > 0);
    assert.equal(chamada('b').prosseguiu, true);
});
