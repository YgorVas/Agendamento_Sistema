import { api, state } from './api.mjs';

let ocupado = false;
let carregandoFila = false;

const diaAtual = () => new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

const escapeHtml = (valor) => String(valor ?? '').replace(/[&<>"']/g, caractere => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[caractere]);

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
        const painel = document.getElementById('painel');
        const estado = document.getElementById('estado-conexao');
        const sair = document.getElementById('btn-sair');
        sair.hidden = true;
        closeModalServicosPacotes();
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
            painel.hidden = false;
            sair.hidden = false;
            estado.textContent = `Empresa ${state.empresaId} conectada.`;
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
    closeModalServicosPacotes();
    document.getElementById('form-entrar-fila').reset();
    document.getElementById('painel').hidden = true;
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
    renderModalData();
}

// ==========================================
// VIEW SWITCHING LOGIC
// ==========================================
function switchView(viewName) {
    
    const btnEmpresa = document.getElementById('btn-view-empresa');
    const btnCliente = document.getElementById('btn-view-cliente');
    const viewEmpresa = document.getElementById('view-empresa');
    const viewCliente = document.getElementById('view-cliente');

    if (viewName === 'empresa') {
        viewEmpresa.classList.remove('hidden');
        viewCliente.classList.add('hidden');
        
        btnEmpresa.className = "flex items-center space-x-2 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all bg-brand-600 text-white shadow-sm";
        btnCliente.className = "flex items-center space-x-2 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all text-slate-300 hover:text-white";
    } else {
        viewEmpresa.classList.add('hidden');
        viewCliente.classList.remove('hidden');

        btnCliente.className = "flex items-center space-x-2 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all bg-brand-600 text-white shadow-sm";
        btnEmpresa.className = "flex items-center space-x-2 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all text-slate-300 hover:text-white";
    }

    renderAll();
}

// ==========================================
// PAINEL DA EMPRESA RENDERING & ACTIONS
// ==========================================
function renderEmpresaView() {
    const emAtendimento = state.agendamentos.find(a => a.status === 'confirmado');
    const proximo = state.agendamentos.find(a => a.status === 'agendado');

    // Render Em Atendimento Card
    const cardAtendimento = document.getElementById('card-em-atendimento');
    const badgeAtendimentoPos = document.getElementById('badge-atendimento-pos');
    const btnConcluir = document.getElementById('btn-concluir');

    if (emAtendimento) {
        badgeAtendimentoPos.textContent = `Posição #${escapeHtml(emAtendimento.posicao_fila)}`;
        btnConcluir.disabled = false;
        cardAtendimento.innerHTML = `
            <div class="space-y-1">
                <div class="text-xs font-semibold text-slate-400">Cliente</div>
                <div class="text-xl font-bold text-slate-900">${escapeHtml(emAtendimento.cliente_nome)}</div>
                <div class="text-xs text-slate-500 flex items-center space-x-2">
                    <span><i class="fa-brands fa-whatsapp text-emerald-500 mr-1"></i>${escapeHtml(emAtendimento.cliente_telefone)}</span>
                    <span>•</span>
                    <span class="font-medium text-slate-700">${escapeHtml(emAtendimento.servico_nome)}</span>
                </div>
            </div>
        `;
    } else {
        badgeAtendimentoPos.textContent = `Livre`;
        btnConcluir.disabled = true;
        cardAtendimento.innerHTML = `
            <div class="text-center py-4 text-slate-400">
                <i class="fa-solid fa-mug-hot text-2xl mb-1"></i>
                <p class="text-xs font-medium">Nenhum cliente em atendimento no momento.</p>
            </div>
        `;
    }

    // Render Próximo da Fila Card
    const cardProximo = document.getElementById('card-proximo-fila');
    const badgeProximoPos = document.getElementById('badge-proximo-pos');
    const btnChamarProximo = document.getElementById('btn-chamar-proximo');

    if (proximo) {
        badgeProximoPos.textContent = `Posição #${escapeHtml(proximo.posicao_fila)}`;
        btnChamarProximo.disabled = Boolean(emAtendimento);
        cardProximo.innerHTML = `
            <div class="space-y-1">
                <div class="text-xs font-semibold text-slate-400">Próximo a ser chamado</div>
                <div class="text-xl font-bold text-slate-900">${escapeHtml(proximo.cliente_nome)}</div>
                <div class="text-xs text-slate-500 flex items-center space-x-2">
                    <span><i class="fa-brands fa-whatsapp text-emerald-500 mr-1"></i>${escapeHtml(proximo.cliente_telefone)}</span>
                    <span>•</span>
                    <span class="font-medium text-slate-700">${escapeHtml(proximo.servico_nome)}</span>
                </div>
            </div>
        `;
    } else {
        badgeProximoPos.textContent = `--`;
        btnChamarProximo.disabled = true;
        cardProximo.innerHTML = `
            <div class="text-center py-4 text-slate-400">
                <i class="fa-solid fa-check-double text-2xl mb-1"></i>
                <p class="text-xs font-medium">Não há clientes aguardando na fila.</p>
            </div>
        `;
    }

    // Render Fila Table Rows
    const tableBody = document.getElementById('table-fila-body');
    document.getElementById('total-fila-count').textContent = `${state.agendamentos.length} Clientes`;
    
    tableBody.innerHTML = '';

    state.agendamentos.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50/80 transition";

        // Status Badge styling
        let statusBadge = '';
        if (item.status === 'confirmado') {
            statusBadge = `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center"><span class="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1.5 pulse-active"></span>Em Atendimento</span>`;
        } else if (item.status === 'agendado') {
            statusBadge = `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">Aguardando</span>`;
        } else if (item.status === 'concluido') {
            statusBadge = `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">Concluído</span>`;
        } else {
            statusBadge = `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700">Cancelado</span>`;
        }

        tr.innerHTML = `
            <td class="py-3.5 px-4 text-center font-bold text-slate-700">#${escapeHtml(item.posicao_fila)}</td>
            <td class="py-3.5 px-4">
                <div class="font-semibold text-slate-900">${escapeHtml(item.cliente_nome)}</div>
                <div class="text-xs text-slate-400"><i class="fa-brands fa-whatsapp text-emerald-500 mr-1"></i>${escapeHtml(item.cliente_telefone)}</div>
            </td>
            <td class="py-3.5 px-4">
                <div class="text-xs font-medium text-slate-700">${escapeHtml(item.servico_nome)}</div>
                ${item.cliente_pacote_id ? '<span class="text-[10px] bg-purple-100 text-purple-700 font-bold px-1.5 py-0.5 rounded">Uso de Pacote</span>' : ''}
            </td>
            <td class="py-3.5 px-4 text-center">${statusBadge}</td>
            <td class="py-3.5 px-4 text-right">
                ${item.status === 'agendado' ? `
                    <button onclick="cancelarAgendamento(${Number(item.id)})" class="text-xs text-rose-600 hover:text-rose-800 font-semibold px-2 py-1 rounded hover:bg-rose-50 transition">
                        Cancelar
                    </button>
                ` : '--'}
            </td>
        `;

        tableBody.appendChild(tr);
    });
}

function mudarStatus(id, status) {
    return executarAcao(async () => {
        await api('/agendamentos/status', { method: 'PATCH', body: { id, status } });
        await atualizarFila();
        showToast('Fila atualizada', 'O novo status foi registrado.', 'success');
    });
}

function chamarProximoFila() {
    const proximo = state.agendamentos.find(a => a.status === 'agendado');
    if (proximo) mudarStatus(proximo.id, 'confirmado');
}

function concluirAtendimentoAtual() {
    const atual = state.agendamentos.find(a => a.status === 'confirmado');
    if (atual) mudarStatus(atual.id, 'concluido');
}

function cancelarAgendamento(id) {
    mudarStatus(id, 'cancelado');
}

function preencherClientes(clienteId = '') {
    const select = document.getElementById('select-cliente');
    select.replaceChildren(new Option('Cadastrar novo cliente', ''));
    for (const cliente of state.clientes) {
        select.add(new Option(`${cliente.nome} · ${cliente.telefone_whatsapp}`, cliente.id));
    }
    select.value = clienteId;
}

function populateServicoOptionsSelect() {
    const select = document.getElementById('select-opcao-servico');
    select.replaceChildren(new Option('Selecione o serviço', ''));
    for (const servico of state.servicos) {
        select.add(new Option(`${servico.nome} - R$ ${Number(servico.preco).toFixed(2)}`, servico.id));
    }
}

async function carregarPacotesCliente() {
    const cliente = document.getElementById('select-cliente').value;
    const token = state.token;
    const cadastro = document.getElementById('cadastro-cliente');
    const select = document.getElementById('select-pacote');
    cadastro.hidden = Boolean(cliente);
    for (const input of cadastro.querySelectorAll('input')) input.disabled = Boolean(cliente);
    select.replaceChildren(new Option('Sem pacote', ''));
    select.disabled = true;
    if (!cliente) return;

    const pacotes = await api(`/pacotes/cliente/${cliente}`);
    if (state.token !== token || document.getElementById('select-cliente').value !== cliente) return;
    for (const pacote of pacotes.filter(p => p.status === 'ativo' && p.sessoes_restantes > 0)) {
        select.add(new Option(`${pacote.pacote_nome} (${pacote.sessoes_restantes} restantes)`, pacote.id));
    }
    select.disabled = select.options.length === 1;
}

document.getElementById('select-cliente').addEventListener('change', () => {
    carregarPacotesCliente().catch(erro => showToast('Erro ao buscar pacotes', erro.message, 'error'));
});

function handleEntrarFila(evento) {
    evento.preventDefault();
    executarAcao(async () => {
        const formulario = document.getElementById('form-entrar-fila');
        const servicoId = Number(document.getElementById('select-opcao-servico').value);
        const pacoteId = Number(document.getElementById('select-pacote').value) || null;
        let clienteId = Number(document.getElementById('select-cliente').value);
        if (!clienteId) {
            const nome = document.getElementById('input-nome').value.trim();
            const telefone = document.getElementById('input-whatsapp').value.trim();
            const novo = await api('/clientes', {
                method: 'POST', body: { nome, telefone_whatsapp: telefone }
            });
            clienteId = novo.cliente_id;
            state.clientes.push({ id: clienteId, nome, telefone_whatsapp: telefone });
            preencherClientes(clienteId);
        }

        const data = diaAtual();
        const entrada = await api('/agendamentos/fila', {
            method: 'POST',
            body: { cliente_id: clienteId, servico_id: servicoId, cliente_pacote_id: pacoteId, data_atendimento: data }
        });
        state.data = data;
        state.activeClienteId = entrada.agendamento_id;
        document.getElementById('link-ticket').href = '/ticket.html#' + entrada.ticket;
        formulario.reset();
        preencherClientes();
        await carregarPacotesCliente();
        showToast('Fila confirmada', entrada.aviso_cliente, 'success');
        await atualizarFila();
    });
}

function renderClienteView() {
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
    document.getElementById('ticket-servico-nome').textContent = meuAgendamento.servico_nome;
    document.getElementById('ticket-whatsapp').textContent = meuAgendamento.cliente_telefone;

    // Pessoas na frente
    const pessoasNaFrente = state.agendamentos.filter(a => 
        ['agendado', 'confirmado'].includes(a.status) && a.posicao_fila < meuAgendamento.posicao_fila
    ).length;

    document.getElementById('count-pessoas-frente').textContent = pessoasNaFrente;
    document.getElementById('count-tempo-estimado').textContent = `~${(pessoasNaFrente + 1) * 20} min`;

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
    renderAll();
}

// ==========================================
// MODAL DATA RENDERING (SERVIÇOS & PACOTES)
// ==========================================
function openModalServicosPacotes() {
    document.getElementById('modal-servicos-pacotes').classList.remove('hidden');
    renderModalData();
}

function closeModalServicosPacotes() {
    document.getElementById('modal-servicos-pacotes').classList.add('hidden');
}

function renderModalData() {
    // Render Lista Serviços
    const listServicos = document.getElementById('modal-list-servicos');
    listServicos.innerHTML = '';
    state.servicos.forEach(s => {
        const card = document.createElement('div');
        card.className = "p-3 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center";
        card.innerHTML = `
            <div>
                <div class="font-bold text-slate-800">${escapeHtml(s.nome)}</div>
                <div class="text-xs text-slate-500">${escapeHtml(s.duracao_minutos)} min</div>
            </div>
            <div class="font-bold text-brand-600">R$ ${Number(s.preco).toFixed(2)}</div>
        `;
        listServicos.appendChild(card);
    });

    // Render Lista Pacotes
    const listPacotes = document.getElementById('modal-list-pacotes');
    listPacotes.innerHTML = '';
    state.pacotes.forEach(p => {
        const card = document.createElement('div');
        card.className = "p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between";
        card.innerHTML = `
            <div>
                <div class="font-bold text-slate-800">${escapeHtml(p.nome)}</div>
                <div class="text-xs text-slate-500">Validade: ${Number(p.dias_validade)} dias</div>
            </div>
            <div class="text-right">
                <span class="inline-block px-2 py-0.5 text-xs font-bold bg-purple-100 text-purple-800 rounded-md">
                    ${Number(p.total_sessoes)} sessões
                </span>
            </div>
        `;
        listPacotes.appendChild(card);
    });
}

function showToast(titulo, texto, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    let iconClass = "fa-info-circle text-sky-500";
    if (type === 'success') iconClass = "fa-check-circle text-emerald-500";
    if (type === 'error') iconClass = "fa-exclamation-triangle text-rose-500";

    toast.className = "pointer-events-auto bg-white text-slate-800 p-3.5 rounded-xl shadow-lg border border-slate-200 flex items-center space-x-3 transition-all duration-300 transform translate-y-2 opacity-0 text-xs";

    toast.innerHTML = `
        <i class="fa-solid ${iconClass} text-base flex-shrink-0"></i>
        <div class="flex-1">
            <div class="font-bold text-slate-900">${escapeHtml(titulo)}</div>
            <div class="text-slate-500">${escapeHtml(texto)}</div>
        </div>
        <button onclick="this.parentElement.remove()" class="text-slate-400 hover:text-slate-600">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    });

    setTimeout(() => {
        if (toast.parentElement) {
            toast.classList.add('opacity-0');
            setTimeout(() => toast.remove(), 300);
        }
    }, 4000);
}

// Mantém os handlers declarados no HTML disponíveis para os botões e formulários.
Object.assign(window, {
    switchView, openModalServicosPacotes, closeModalServicosPacotes,
    concluirAtendimentoAtual, chamarProximoFila, cancelarAgendamento, handleEntrarFila, sairFilaCliente
});
