const { createHash } = require('node:crypto');
const AgendamentoModel = require('../models/agendamentoModel');
const ServicoModel = require('../models/servicoModel');

const dataLocal = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
});

const idValido = (id) => /^[1-9][0-9]*$/.test(String(id)) && Number.isSafeInteger(Number(id));

async function catalogo(req, res) {
    res.set('Cache-Control', 'no-store');
    const empresaId = req.params.empresa_id;
    try {
        const dados = idValido(empresaId) && await ServicoModel.catalogoPublico(Number(empresaId));
        if (!dados) return res.status(404).json({ erro: 'Estabelecimento não encontrado.' });
        return res.json(dados);
    } catch (erro) {
        console.error('Erro no catálogo público:', erro.code);
        return res.status(500).json({ erro: 'Não foi possível carregar os serviços.' });
    }
}

async function entrar(req, res) {
    res.set('Cache-Control', 'no-store');
    const empresaId = req.params.empresa_id;
    if (!idValido(empresaId)) return res.status(404).json({ erro: 'Estabelecimento não encontrado.' });

    const { nome, telefone_whatsapp, servico_id, ticket } = req.body || {};
    const nomeCliente = typeof nome === 'string' ? nome.trim() : '';
    const telefone = typeof telefone_whatsapp === 'string' ? telefone_whatsapp.trim() : '';
    if (!nomeCliente || nomeCliente.length > 100 || telefone.length > 20 ||
        !/^\+?[\d ().-]+$/.test(telefone) || !/^\d{10,15}$/.test(telefone.replace(/\D/g, '')) ||
        typeof servico_id !== 'number' || !idValido(servico_id) ||
        typeof ticket !== 'string' || !/^[0-9a-f]{64}$/.test(ticket)) {
        return res.status(400).json({ erro: 'Confira seu nome, WhatsApp e serviço escolhido.' });
    }

    try {
        const fila = await AgendamentoModel.entrarNaFilaPublica(
            Number(empresaId), nomeCliente, telefone, servico_id, dataLocal.format(new Date()),
            createHash('sha256').update(ticket).digest()
        );
        if (fila.erro) return res.status(404).json({ erro: 'Estabelecimento ou serviço não encontrado.' });
        return res.status(fila.existente ? 200 : 201).json({ posicao_fila: fila.posicao });
    } catch (erro) {
        console.error('Erro na entrada pública da fila:', erro.code);
        return res.status(500).json({ erro: 'Não foi possível entrar na fila. Tente novamente.' });
    }
}

module.exports = { catalogo, entrar };
