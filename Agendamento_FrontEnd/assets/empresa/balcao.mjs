import { api, state } from './sessao.mjs';
import { showToast } from './toast.mjs';

export function preencherClientes(clienteId = '') {
    const select = document.getElementById('select-cliente');
    select.replaceChildren(new Option('Cadastrar novo cliente', ''));
    for (const cliente of state.clientes) {
        select.add(new Option(`${cliente.nome} · ${cliente.telefone_whatsapp}`, cliente.id));
    }
    select.value = clienteId;
}

export function populateServicoOptionsSelect() {
    const select = document.getElementById('select-opcao-servico');
    select.replaceChildren(new Option('Selecione o serviço', ''));
    for (const servico of state.servicos) {
        select.add(new Option(`${servico.nome} - R$ ${Number(servico.preco).toFixed(2)}`, servico.id));
    }
}

export async function carregarPacotesCliente() {
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
    renderClienteView();
}

export function configurarBalcao({ executarAcao, atualizarFila, diaAtual }) {
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

    document.getElementById('form-entrar-fila').addEventListener('submit', handleEntrarFila);
    document.getElementById('fechar-senha').addEventListener('click', sairFilaCliente);
}
