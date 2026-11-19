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
        const opcoes = document.getElementById('opcoes-servicos');
        opcoes.replaceChildren();
        for (const servico of dados.servicos) {
            const rotulo = document.createElement('label');
            const opcao = document.createElement('input');
            opcao.type = 'checkbox';
            opcao.name = 'servico_ids';
            opcao.value = servico.id;
            rotulo.append(opcao, `${servico.nome} · ${moeda.format(servico.preco)}`);
            opcoes.append(rotulo);
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
    const servicoIds = campos.getAll('servico_ids').map(Number);
    if (!servicoIds.length) {
        mensagem.textContent = 'Selecione pelo menos um serviço.';
        document.querySelector('#opcoes-servicos input')?.focus();
        return;
    }
    const body = {
        nome: campos.get('nome').trim(),
        telefone_whatsapp: campos.get('telefone_whatsapp').trim(),
        servico_ids: servicoIds
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
