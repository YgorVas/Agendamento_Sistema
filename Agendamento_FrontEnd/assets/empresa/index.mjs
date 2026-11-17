import { api, state } from './sessao.mjs';
import { encerrarSessao, tokenAtual } from '../auth-api.mjs';
import { exibirComercios, nomeCargo } from '../selecao-comercio.mjs';
import { configurarFila, renderEmpresaView } from './fila.mjs';
import { configurarBalcao, preencherClientes, populateServicoOptionsSelect, carregarPacotesCliente, renderClienteView } from './balcao.mjs';
import { configurarCatalogo, renderCatalogo } from './catalogo.mjs';
import { abrirFinanceiro, configurarFinanceiro } from './financeiro.mjs';
import { showToast } from './toast.mjs';

const painel = document.getElementById('painel');
const linksMenu = [...document.querySelectorAll('#menu-painel a')];

function mostrarTela() {
    if (painel.hidden) return;
    const destino = linksMenu.find(link => !link.hidden && link.hash === window.location.hash) ?? linksMenu[0];
    for (const link of linksMenu) {
        const nome = link.hash.slice(1);
        const selecionado = link === destino;
        document.getElementById('view-' + nome).hidden = !selecionado;
        if (selecionado) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    }

    const tela = destino.hash.slice(1);
    if (tela === 'catalogo') renderCatalogo();
    if (tela === 'financeiro') abrirFinanceiro();
    document.getElementById('titulo-' + tela).focus();
}

window.addEventListener('hashchange', mostrarTela);

let ocupado = false;
let carregandoFila = false;

const diaAtual = () => new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

async function atualizarFila() {
    const data = diaAtual();
    const token = tokenAtual();
    const fila = await api(`/agendamentos/fila/${data}`);
    if (tokenAtual() !== token) return;
    if (state.data !== data) state.activeClienteId = null;
    state.data = data;
    state.agendamentos = fila;
    renderAll();
}

async function executarAcao(acao) {
    if (ocupado) return;
    if (carregandoFila) {
        showToast('Atualizando fila', 'Tente novamente em instantes.');
        return;
    }
    ocupado = true;
    try {
        await acao();
    } catch (erro) {
        showToast('Erro', erro.message, 'error');
    } finally {
        ocupado = false;
    }
}

const estado = document.getElementById('estado-conexao');
const trocar = document.getElementById('trocar-loja');
const selecao = document.getElementById('selecao');

async function conectarPainel() {
    const token = tokenAtual();
    try {
        const { comercios, comercioAtual } = await api('/auth/comercios');
        [state.clientes, state.servicos, state.pacotes] = await Promise.all([
            api('/clientes'), api('/servicos'), api('/pacotes')
        ]);
        if (tokenAtual() !== token) return;

        const podeGerir = ['ADMIN', 'GERENTE'].includes(comercioAtual.cargo);
        for (const link of linksMenu) {
            if (link.hash === '#financeiro' || link.hash === '#catalogo') link.hidden = !podeGerir;
        }
        document.getElementById('loja-atual').textContent =
            comercioAtual.nomeFantasia + ' · ' + nomeCargo(comercioAtual.cargo);
        document.getElementById('link-fila-publica').href =
            '/fila.html?empresa=' + comercioAtual.comercioId;
        preencherClientes();
        populateServicoOptionsSelect();
        await carregarPacotesCliente();
        await atualizarFila();
        if (tokenAtual() !== token) return;

        painel.hidden = false;
        trocar.hidden = comercios.length < 2;
        estado.textContent = '';
        mostrarTela();
    } catch (erro) {
        if (tokenAtual() === token) estado.textContent = erro.message + ' Recarregue a página para tentar novamente.';
    }
}

document.getElementById('btn-sair').onclick = () => encerrarSessao();

trocar.onclick = () => executarAcao(async () => {
    const token = tokenAtual();
    trocar.disabled = true;
    try {
        const resposta = await api('/auth/iniciar-selecao', { method: 'POST' });
        if (tokenAtual() !== token) return;
        painel.hidden = true;
        trocar.hidden = true;
        exibirComercios(selecao, resposta, {
            concluir: () => location.replace('/dashboard'),
            voltar: () => {
                selecao.hidden = true;
                painel.hidden = false;
                trocar.hidden = false;
                trocar.focus();
            }
        });
    } finally {
        trocar.disabled = false;
    }
});

window.addEventListener('pageshow', evento => {
    if (evento.persisted) location.reload();
});

setInterval(async () => {
    if (!tokenAtual() || painel.hidden || ocupado || carregandoFila) return;
    carregandoFila = true;
    try {
        await atualizarFila();
        estado.textContent = '';
    } catch {
        if (tokenAtual()) estado.textContent = 'Fila desatualizada. Tentando reconectar…';
    } finally {
        carregandoFila = false;
    }
}, 10000);

function renderAll() {
    renderEmpresaView();
    renderClienteView();
}

configurarFila({ executarAcao, atualizarFila });
configurarBalcao({ executarAcao, atualizarFila, diaAtual });
configurarCatalogo({ executarAcao, atualizarServicos: populateServicoOptionsSelect });
configurarFinanceiro();

if (tokenAtual()) conectarPainel();
else encerrarSessao();
