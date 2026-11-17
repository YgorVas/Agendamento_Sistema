const jwt = require('jsonwebtoken');

const emissor = 'agendamento';
const audienciaSelecao = 'selecionar-comercio';
const audienciaAcesso = 'acesso-comercio';

function assinar(dados, segredo, audiencia, expiresIn) {
    return jwt.sign(dados, segredo, {
        algorithm: 'HS256',
        issuer: emissor,
        audience: audiencia,
        expiresIn
    });
}

function verificar(token, segredo, audiencia) {
    try {
        const dados = jwt.verify(token, segredo, {
            algorithms: ['HS256'],
            issuer: emissor,
            audience: audiencia
        });
        return idValido(dados?.usuarioId) ? dados : null;
    } catch {
        return null;
    }
}

function idValido(id) {
    return Number.isInteger(id) && id > 0 && id <= 2147483647;
}

module.exports = {
    idValido,
    segredoConfigurado: () => {
        const segredo = process.env.AUTH_JWT_SECRET;
        return segredo && Buffer.byteLength(segredo) >= 32 ? segredo : null;
    },
    tokenBearer: (req) => /^Bearer ([^\s,]+)$/i.exec(req.get('Authorization') || '')?.[1],
    emitirSelecao: (usuarioId, segredo) =>
        assinar({ usuarioId }, segredo, audienciaSelecao, '5m'),
    emitirAcesso: (usuarioId, comercioId, cargo, segredo) =>
        assinar({ usuarioId, comercioId, cargo }, segredo, audienciaAcesso, '1h'),
    verificarSelecao: (token, segredo) => verificar(token, segredo, audienciaSelecao),
    verificarAcesso: (token, segredo) => verificar(token, segredo, audienciaAcesso)
};
