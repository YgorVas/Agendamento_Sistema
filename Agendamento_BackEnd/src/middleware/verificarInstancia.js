const { buscarVinculoAtivo } = require('../models/authModel');
const tokens = require('../services/tokensAuth');

async function verificarInstancia(req, res, next) {
    res.set('Cache-Control', 'no-store');
    const segredo = tokens.segredoConfigurado();
    if (!segredo) {
        return res.status(503).json({ erro: 'Autenticação indisponível.' });
    }
    const dados = tokens.verificarAcesso(tokens.tokenBearer(req), segredo);
    if (!dados || !tokens.idValido(dados.comercioId) || typeof dados.cargo !== 'string') {
        return res.status(401).json({ erro: 'Token de acesso inválido ou expirado.' });
    }

    const { usuarioId, comercioId, cargo } = dados;
    if (req.params.empresa_id !== undefined && String(comercioId) !== req.params.empresa_id) {
        return res.status(403).json({ erro: 'Acesso indisponível para este comércio.' });
    }

    try {
        const vinculo = await buscarVinculoAtivo(usuarioId, comercioId);
        if (!vinculo || vinculo.cargo !== cargo) {
            return res.status(403).json({
                erro: 'Acesso indisponível para este comércio.',
                codigo: 'INSTANCIA_INDISPONIVEL'
            });
        }
    } catch (erro) {
        console.error('Falha ao verificar o comércio:', erro.code ?? erro.name);
        return res.status(500).json({ erro: 'Erro interno ao verificar o comércio.' });
    }

    req.usuarioId = usuarioId;
    req.comercioId = comercioId;
    req.cargo = cargo;
    return next();
}

module.exports = verificarInstancia;
