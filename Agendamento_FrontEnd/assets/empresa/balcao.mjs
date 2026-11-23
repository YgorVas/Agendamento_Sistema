import { api, state } from './sessao.mjs';
import { tokenAtual } from '../auth-api.mjs';
import { showToast } from './toast.mjs';

const listaServicos = document.getElementById('servicos-balcao');
const adicionarServico = document.getElementById('adicionar-servico-balcao');
let pacotesCliente = [];
let consultaPacotes = 0;

export function preencherClientes(clienteId = '') {
    const select = document.getElementById('select-cliente');
    select.replaceChildren(new Option('Cadastrar novo cliente', ''));
    for (const cliente of state.clientes) {
        select.add(new Option(`${cliente.nome} · ${cliente.telefone_whatsapp}`, cliente.id));
    }
    select.value = clienteId;
}

export function populateServicoOptionsSelect() {
    for (const select of listaServicos.querySelectorAll('[name="servico_id"]')) {
        const selecionado = select.value;
        select.replaceChildren(new Option('Selecione o serviço', ''));
        for (const servico of state.servicos) {
            select.add(new Option(`${servico.nome} - R$ ${Number(servico.preco).toFixed(2)}`, servico.id));
        }
        if (state.servicos.some(servico => String(servico.id) === selecionado)) select.value = selecionado;
    }
    atualizarItens();
}

function atualizarItens() {
    const linhas = [...listaServicos.children];
    const selecoes = new Set(linhas.map(item => item.querySelector('[name="servico_id"]').value));
    adicionarServico.disabled = linhas.length >= state.servicos.length;
    for (const linha of linhas) {
        const servico = linha.querySelector('[name="servico_id"]');
        for (const opcao of servico.options) {
            opcao.disabled = Boolean(opcao.value) && opcao.value !== servico.value && selecoes.has(opcao.value);
        }
        const pacote = linha.querySelector('[name="cliente_pacote_id"]');
        const selecionado = pacote.value;
        pacote.replaceChildren(new Option('Sem pacote', ''));
        for (const item of pacotesCliente) {
            if (item.status === 'ativo' && item.sessoes_restantes > 0 && String(item.servico_id) === servico.value) {
                pacote.add(new Option(`${item.pacote_nome} (${item.sessoes_restantes} restantes)`, item.id));
            }
        }
        if ([...pacote.options].some(opcao => opcao.value === selecionado)) pacote.value = selecionado;
        pacote.disabled = pacote.options.length === 1;
        linha.querySelector('[data-remover-servico]').hidden = linhas.length === 1;
    }
}

function incluirServico() {
    const template = document.getElementById('item-servico-balcao');
    const linha = template.content.firstElementChild.cloneNode(true);
    listaServicos.append(linha);
    populateServicoOptionsSelect();
    return linha.querySelector('[name="servico_id"]');
}

export async function carregarPacotesCliente({ limpar = false } = {}) {
    const consulta = ++consultaPacotes;
    const cliente = document.getElementById('select-cliente').value;
    const token = tokenAtual();
    const cadastro = document.getElementById('cadastro-cliente');
    cadastro.hidden = Boolean(cliente);
    for (const input of cadastro.querySelectorAll('input')) input.disabled = Boolean(cliente);
    if (limpar || !cliente) {
        pacotesCliente = [];
        atualizarItens();
    }
    if (!cliente) return;

    const pacotes = await api(`/pacotes/cliente/${cliente}`);
    if (consulta !== consultaPacotes || tokenAtual() !== token) return;
    pacotesCliente = pacotes;
    atualizarItens();
}

export function renderClienteView() {
    const formCard = document.getElementById('cliente-form-card');
    const statusCard = document.getElementById('cliente-status-card');

    if (!state.activeClienteId) {
        formCard.classList.remove('hidden');
        statusCard.classList.add('hidden');
        return;
    }

    const meuAgendamento = state.agendamentos.find(a => a.id === state.activeClienteId);

    if (!meuAgendamento) {
        state.activeClienteId = null;
        formCard.classList.remove('hidden');
        statusCard.classList.add('hidden');
        return;
    }

    formCard.classList.add('hidden');
    statusCard.classList.remove('hidden');

    document.getElementById('ticket-posicao').textContent = `#${meuAgendamento.posicao_fila}`;
    document.getElementById('ticket-nome').textContent = meuAgendamento.cliente_nome;
    document.getElementById('ticket-servico-nome').textContent =
        meuAgendamento.servicos.map(item => item.servico_nome).join(' · ') || '—';
    document.getElementById('ticket-whatsapp').textContent = meuAgendamento.cliente_telefone;

    // Pessoas na frente
    const entradasNaFrente = state.agendamentos.filter(a =>
        ['agendado', 'confirmado'].includes(a.status) && a.posicao_fila < meuAgendamento.posicao_fila
    );
    const pessoasNaFrente = entradasNaFrente.length;
    const tempoEstimado = [meuAgendamento, ...entradasNaFrente]
        .reduce((minutos, entrada) => minutos + (entrada.duracao_minutos ?? 20), 0);

    document.getElementById('count-pessoas-frente').textContent = pessoasNaFrente;
    document.getElementById('count-tempo-estimado').textContent = `~${tempoEstimado} min`;

    // Box Dynamic Messaging
    const msgBox = document.getElementById('status-mensagem-box');
    const titulo = document.getElementById('status-titulo');
    const desc = document.getElementById('status-descricao');

    if (meuAgendamento.status === 'confirmado') {
        msgBox.className = "p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1";
        titulo.textContent = "É A SUA VEZ! EM ATENDIMENTO";
        desc.textContent = "Por favor, dirija-se à cadeira / sala de atendimento.";
    } else if (meuAgendamento.status === 'concluido') {
        msgBox.className = "p-4 rounded-2xl bg-slate-100 border border-slate-200 text-slate-800 space-y-1";
        titulo.textContent = "Atendimento Concluído";
        desc.textContent = "Obrigado por utilizar nossos serviços! Tenha um ótimo dia.";
    } else if (meuAgendamento.status === 'cancelado') {
        msgBox.className = "p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 space-y-1";
        titulo.textContent = "Agendamento Cancelado";
        desc.textContent = "Este agendamento foi cancelado pelo estabelecimento.";
    } else {
        // 'agendado'
        if (pessoasNaFrente === 0) {
            msgBox.className = "p-4 rounded-2xl bg-sky-50 border border-sky-200 text-sky-900 space-y-1";
            titulo.textContent = "Você é o Próximo!";
            desc.textContent = "Prepare-se! O estabelecimento chamará você a qualquer momento.";
        } else {
            msgBox.className = "p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1";
            titulo.textContent = "Aguardando na Fila...";
            desc.textContent = `Existe(m) ${pessoasNaFrente} pessoa(s) na sua frente.`;
        }
    }
}

function sairFilaCliente() {
    state.activeClienteId = null;
    renderClienteView();
}

export function configurarBalcao({ executarAcao, atualizarFila, diaAtual }) {
    incluirServico();
    document.getElementById('select-cliente').addEventListener('change', () => {
        carregarPacotesCliente({ limpar: true }).catch(erro => showToast('Erro ao buscar pacotes', erro.message, 'error'));
    });
    adicionarServico.addEventListener('click', () => incluirServico().focus());
    listaServicos.addEventListener('change', evento => {
        if (evento.target.name === 'servico_id') atualizarItens();
    });
    listaServicos.addEventListener('click', evento => {
        const remover = evento.target.closest('[data-remover-servico]');
        if (!remover) return;
        remover.parentElement.remove();
        atualizarItens();
        adicionarServico.focus();
    });
    function handleEntrarFila(evento) {
        evento.preventDefault();
        executarAcao(async () => {
            const formulario = document.getElementById('form-entrar-fila');
            const servicos = [...listaServicos.children].map(linha => ({
                servico_id: Number(linha.querySelector('[name="servico_id"]').value),
                cliente_pacote_id: Number(linha.querySelector('[name="cliente_pacote_id"]').value) || null
            }));
            let clienteId = Number(document.getElementById('select-cliente').value);
            if (!clienteId) {
                const nome = document.getElementById('input-nome').value.trim();
                const sobrenome = document.getElementById('input-sobrenome').value.trim();
                const telefone = document.getElementById('input-whatsapp').value;
                const novo = await api('/clientes', {
                    method: 'POST', body: { nome, sobrenome, telefone_whatsapp: telefone }
                });
                clienteId = novo.cliente_id;
                if (!state.clientes.some(cliente => cliente.id === clienteId)) state.clientes.push(novo.cliente);
                if (novo.existente) showToast('Cliente encontrado', 'O cadastro existente foi utilizado.', 'success');
                preencherClientes();
            }
            const data = diaAtual();
            const entrada = await api('/agendamentos/fila', {
                method: 'POST',
                body: { cliente_id: clienteId, servicos, data_atendimento: data }
            });
            state.data = data;
            state.activeClienteId = entrada.agendamento_id;
            document.getElementById('link-ticket').href = '/ticket.html#' + entrada.ticket;
            formulario.reset();
            preencherClientes();
            listaServicos.replaceChildren();
            incluirServico();
            await carregarPacotesCliente();
            showToast('Fila confirmada', entrada.aviso_cliente, 'success');
            await atualizarFila();
        });
    }

    document.getElementById('form-entrar-fila').addEventListener('submit', handleEntrarFila);
    document.getElementById('fechar-senha').addEventListener('click', sairFilaCliente);
}
