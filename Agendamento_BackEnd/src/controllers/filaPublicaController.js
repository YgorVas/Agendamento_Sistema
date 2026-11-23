const { createHash } = require('node:crypto');
const AgendamentoModel = require('../models/agendamentoModel');
const ServicoModel = require('../models/servicoModel');
const { validarCadastroCliente, erroCadastro } = require('../services/cadastroCliente');

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

    const dados = req.body ?? {};
    const cadastro = validarCadastroCliente(dados);
    if (!cadastro) return res.status(400).json({ erro: erroCadastro });

    const { servico_id, servico_ids = [servico_id], ticket } = dados;
    if (!Array.isArray(servico_ids) || !servico_ids.length ||
        servico_ids.some(id => typeof id !== 'number' || !idValido(id)) ||
        new Set(servico_ids).size !== servico_ids.length ||
        typeof ticket !== 'string' || !/^[0-9a-f]{64}$/.test(ticket)) {
        return res.status(400).json({ erro: 'Selecione pelo menos um serviço, sem repetição, e confira o ticket.' });
    }

    try {
        const fila = await AgendamentoModel.entrarNaFilaPublica(
            Number(empresaId), cadastro.nome, cadastro.telefone, servico_ids, dataLocal.format(new Date()),
            createHash('sha256').update(ticket).digest()
        );
        if (fila.erro === 'entrada_ativa') return res.status(409).json({ erro: 'Já existe uma entrada ativa para este telefone. Consulte seu ticket ou procure o estabelecimento.' });
        if (fila.erro) return res.status(404).json({ erro: 'Estabelecimento ou serviço não encontrado.' });
        return res.status(fila.existente ? 200 : 201).json({ posicao_fila: fila.posicao });
    } catch (erro) {
        console.error('Erro na entrada pública da fila:', erro.code);
        return res.status(500).json({ erro: 'Não foi possível entrar na fila. Tente novamente.' });
    }
}

module.exports = { catalogo, entrar };
