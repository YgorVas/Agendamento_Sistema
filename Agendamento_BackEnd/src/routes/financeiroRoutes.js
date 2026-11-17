const router = require('express').Router();
const verificarInstancia = require('../middleware/verificarInstancia');
const exigirGestao = require('../middleware/exigirGestao');
const { consultarResumo, consultarPeriodo, resolverPeriodo } = require('../models/financeiroModel');

router.get('/resumo', verificarInstancia, exigirGestao, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        return res.json(await consultarResumo(req.comercioId));
    } catch (erro) {
        console.error('Erro ao consultar resumo financeiro:', erro.code);
        return res.status(500).json({ erro: 'Não foi possível carregar o resumo financeiro.' });
    }
});

router.get('/periodo', verificarInstancia, exigirGestao, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const periodo = resolverPeriodo(req.query.tipo ?? 'mes', req.query.data);
    if (!periodo) {
        return res.status(400).json({ erro: 'Escolha dia, semana, mês ou ano e informe uma data válida até hoje.' });
    }
    try {
        return res.json(await consultarPeriodo(req.comercioId, periodo));
    } catch (erro) {
        console.error('Erro ao consultar período financeiro:', erro.code);
        return res.status(500).json({ erro: 'Não foi possível carregar o período financeiro.' });
    }
});

module.exports = router;
