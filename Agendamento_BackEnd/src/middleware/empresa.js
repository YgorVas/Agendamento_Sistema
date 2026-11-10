const { createHash, timingSafeEqual } = require('node:crypto');

const hash = (value) => createHash('sha256').update(value).digest();

const config = JSON.parse(process.env.EMPRESA_TOKENS || '{}');
const empresas = Object.entries(config);
if (empresas.some(([id, token]) => !/^[1-9][0-9]*$/.test(id) ||
    !Number.isSafeInteger(Number(id)) || typeof token !== 'string' ||
    !/^[0-9a-f]{64}$/.test(token)) ||
    new Set(empresas.map(([, token]) => token)).size !== empresas.length) {
    throw new Error('EMPRESA_TOKENS exige um token hexadecimal único de 64 caracteres por empresa.');
}
const credenciais = empresas.map(([id, token]) => [Number(id), hash(token)]);

function autenticarEmpresa(req, res, next) {
    const token = /^Bearer ([0-9a-f]{64})$/i.exec(req.get('Authorization') || '')?.[1];
    const credencial = token && credenciais.find(([, digest]) => timingSafeEqual(hash(token), digest));
    if (!credencial) {
        return res.status(401).json({ erro: 'Credencial da empresa inválida ou ausente.' });
    }

    const [empresaId] = credencial;
    for (const id of [req.params.empresa_id, req.body?.empresa_id]) {
        if (id !== undefined && String(id) !== String(empresaId)) {
            return res.status(403).json({ erro: 'Acesso restrito à empresa da credencial.' });
        }
    }
    req.empresaId = empresaId;
    next();
}

module.exports = autenticarEmpresa;
