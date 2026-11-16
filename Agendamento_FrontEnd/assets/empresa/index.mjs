import { api, state } from './sessao.mjs';
import { configurarFila, renderEmpresaView } from './fila.mjs';
import { configurarBalcao, preencherClientes, populateServicoOptionsSelect, carregarPacotesCliente, renderClienteView } from './balcao.mjs';
import { configurarCatalogo, renderCatalogo, resetarCatalogo } from './catalogo.mjs';
import { abrirFinanceiro, configurarFinanceiro, resetarFinanceiro } from './financeiro.mjs';
import { showToast } from './toast.mjs';

const painel = document.getElementById('painel');
const linksMenu = document.querySelectorAll('#menu-painel a');

function mostrarTela() {
    if (painel.hidden) return;
    const destino = [...linksMenu].find(link => link.hash === window.location.hash) ?? linksMenu[0];
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
    const token = state.token;
    const fila = await api(`/agendamentos/fila/${state.empresaId}/${data}`);
    if (state.token !== token) return;
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

document.getElementById('form-acesso').addEventListener('submit', evento => {
    evento.preventDefault();
    executarAcao(async () => {
        const campoToken = document.getElementById('empresa-token');
        const estado = document.getElementById('estado-conexao');
        const sair = document.getElementById('btn-sair');
        sair.hidden = true;
        resetarFinanceiro();
        resetarCatalogo();
        painel.hidden = true;
        estado.textContent = 'Conectando…';
        state.empresaId = Number(document.getElementById('empresa-id').value);
        state.token = campoToken.value.trim();
        state.activeClienteId = null;
        try {
            [state.clientes, state.servicos, state.pacotes] = await Promise.all([
                api(`/clientes/empresa/${state.empresaId}`),
                api(`/servicos/empresa/${state.empresaId}`),
                api(`/pacotes/empresa/${state.empresaId}`)
            ]);
            preencherClientes();
            populateServicoOptionsSelect();
            await carregarPacotesCliente();
            await atualizarFila();
            document.getElementById('link-fila-publica').href = '/fila.html?empresa=' + state.empresaId;
            painel.hidden = false;
            sair.hidden = false;
            estado.textContent = `Empresa ${state.empresaId} conectada.`;
            mostrarTela();
        } catch (erro) {
            state.token = null;
            estado.textContent = 'Falha ao conectar.';
            throw erro;
        } finally {
            campoToken.value = '';
        }
    });
});

document.getElementById('btn-sair').addEventListener('click', () => {
    if (ocupado) return;
    state.token = null;
    state.empresaId = null;
    state.activeClienteId = null;
    state.clientes = [];
    state.agendamentos = [];
    state.servicos = [];
    state.pacotes = [];
    preencherClientes();
    populateServicoOptionsSelect();
    carregarPacotesCliente();
    renderAll();
    resetarFinanceiro();
    resetarCatalogo();
    document.getElementById('form-entrar-fila').reset();
    painel.hidden = true;
    document.getElementById('btn-sair').hidden = true;
    document.getElementById('estado-conexao').textContent = 'Conecte-se para carregar a fila.';
});

setInterval(async () => {
    if (!state.token || ocupado || carregandoFila) return;
    carregandoFila = true;
    const estado = document.getElementById('estado-conexao');
    try {
        await atualizarFila();
        if (state.token) estado.textContent = `Empresa ${state.empresaId} conectada.`;
    } catch {
        if (state.token) estado.textContent = 'Fila desatualizada. Tentando reconectar…';
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
