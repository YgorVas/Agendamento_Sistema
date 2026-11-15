import { requisitar } from './api.mjs';

const empresa = new URLSearchParams(location.search).get('empresa') || '';
const base = '/fila-publica/' + encodeURIComponent(empresa);
const mensagem = document.getElementById('mensagem');
const formulario = document.getElementById('entrada');
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const ticketsPorEntrada = new Map();

async function carregarCatalogo() {
    if (!/^[1-9][0-9]*$/.test(empresa)) {
        mensagem.textContent = 'Abra o link de entrada fornecido pelo estabelecimento.';
        return;
    }

    try {
        const dados = await requisitar(base + '/servicos');
        const estabelecimento = document.getElementById('estabelecimento');
        estabelecimento.textContent = dados.nome_fantasia;
        estabelecimento.hidden = false;
        const seletor = formulario.elements.servico_id;
        seletor.replaceChildren(new Option('Selecione um serviço', ''));
        for (const servico of dados.servicos) {
            seletor.add(new Option(`${servico.nome} · ${moeda.format(servico.preco)}`, servico.id));
        }
        formulario.hidden = dados.servicos.length === 0;
        mensagem.textContent = formulario.hidden ? 'Nenhum serviço está disponível.' : '';
    } catch (erro) {
        mensagem.textContent = erro.message;
    }
}

formulario.addEventListener('submit', async evento => {
    evento.preventDefault();
    const botao = formulario.querySelector('button');
    if (botao.disabled) return;
    const campos = new FormData(formulario);
    const body = {
        nome: campos.get('nome').trim(),
        telefone_whatsapp: campos.get('telefone_whatsapp').trim(),
        servico_id: Number(campos.get('servico_id'))
    };
    const chave = JSON.stringify(body);
    if (!ticketsPorEntrada.has(chave)) {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        ticketsPorEntrada.set(chave, Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''));
    }
    body.ticket = ticketsPorEntrada.get(chave);

    botao.disabled = true;
    mensagem.textContent = 'Registrando sua entrada…';
    try {
        await requisitar(base + '/entradas', { method: 'POST', body });
        location.replace('/ticket.html#' + body.ticket);
    } catch (erro) {
        mensagem.textContent = erro.message;
        botao.disabled = false;
    }
});

carregarCatalogo();
