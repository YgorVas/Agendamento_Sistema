const express = require('express');
const bcrypt = require('bcryptjs');
const usuarios = require('../models/authModel');
const tokens = require('../services/tokensAuth');
const verificarInstancia = require('../middleware/verificarInstancia');

const router = express.Router();
const hashParaUsuarioInexistente = bcrypt.hashSync('credencial-inexistente', 12);

router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.locals.segredoJwt = tokens.segredoConfigurado();
    if (!res.locals.segredoJwt) {
        return res.status(503).json({ erro: 'Autenticação indisponível.' });
    }
    next();
});

router.post('/login', async (req, res) => {
    const { email, senha } = req.body ?? {};
    const emailNormalizado = typeof email === 'string' ? email.trim() : '';
    if (!emailNormalizado || emailNormalizado.length > 254 ||
        typeof senha !== 'string' || !senha || Buffer.byteLength(senha) > 72) {
        return res.status(400).json({ erro: 'Informe um e-mail e uma senha válidos.' });
    }

    const usuario = await usuarios.buscarUsuario(emailNormalizado);
    const senhaValida = await bcrypt.compare(senha, usuario?.senha_hash ?? hashParaUsuarioInexistente);
    if (!usuario || !senhaValida) {
        return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
    }

    const comercios = await usuarios.listarVinculosAtivos(usuario.id);
    if (!comercios.length) {
        return res.status(403).json({ erro: 'Usuário sem acesso a um comércio ativo.' });
    }
    if (comercios.length === 1) {
        const [{ comercioId, cargo }] = comercios;
        return res.json({
            token: tokens.emitirAcesso(usuario.id, comercioId, cargo, res.locals.segredoJwt),
            comercioId,
            cargo
        });
    }

    return res.json({
        tokenTemporario: tokens.emitirSelecao(usuario.id, res.locals.segredoJwt),
        comercios
    });
});

router.post('/selecionar-comercio', async (req, res) => {
    const segredo = res.locals.segredoJwt;
    const dados = tokens.verificarSelecao(tokens.tokenBearer(req), segredo);
    if (!dados) {
        return res.status(401).json({ erro: 'Token de seleção inválido ou expirado.' });
    }

    const { comercioId } = req.body ?? {};
    if (!tokens.idValido(comercioId)) {
        return res.status(400).json({ erro: 'Informe um comercioId inteiro positivo.' });
    }

    const vinculo = await usuarios.buscarVinculoAtivo(dados.usuarioId, comercioId);
    if (!vinculo) {
        return res.status(403).json({ erro: 'Acesso indisponível para este comércio.' });
    }
    const { cargo } = vinculo;
    return res.json({
        token: tokens.emitirAcesso(dados.usuarioId, comercioId, cargo, segredo),
        comercioId,
        cargo
    });
});

router.get('/comercios', verificarInstancia, async (req, res) => {
    const comercios = await usuarios.listarVinculosAtivos(req.usuarioId);
    const comercioAtual = comercios.find(comercio => comercio.comercioId === req.comercioId);
    if (!comercioAtual || comercioAtual.cargo !== req.cargo) {
        return res.status(403).json({ erro: 'Acesso indisponível para este comércio.' });
    }
    return res.json({ comercios, comercioAtual });
});

router.post('/iniciar-selecao', verificarInstancia, async (req, res) => {
    const comercios = await usuarios.listarVinculosAtivos(req.usuarioId);
    if (comercios.length < 2) {
        return res.status(403).json({ erro: 'Nenhum outro comércio ativo está disponível.' });
    }
    return res.json({
        tokenTemporario: tokens.emitirSelecao(req.usuarioId, res.locals.segredoJwt),
        comercios
    });
});

router.use((erro, req, res, next) => {
    if (res.headersSent) return next(erro);
    console.error('Falha na autenticação:', erro.code ?? erro.name);
    return res.status(500).json({ erro: 'Erro interno na autenticação.' });
});

module.exports = router;
