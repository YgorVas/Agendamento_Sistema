import { api, state } from './sessao.mjs';
import { escapeHtml } from '../html.mjs';
import { showToast } from './toast.mjs';

export function renderEmpresaView() {
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
                    <button data-cancelar="${Number(item.id)}" class="text-xs text-rose-600 hover:text-rose-800 font-semibold px-2 py-1 rounded hover:bg-rose-50 transition">
                        Cancelar
                    </button>
                ` : '--'}
            </td>
        `;

        tableBody.appendChild(tr);
    });
}

export function configurarFila({ executarAcao, atualizarFila }) {
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

    document.getElementById('btn-chamar-proximo').addEventListener('click', chamarProximoFila);
    document.getElementById('btn-concluir').addEventListener('click', concluirAtendimentoAtual);
    document.getElementById('table-fila-body').addEventListener('click', evento => {
        const botao = evento.target.closest('[data-cancelar]');
        if (botao) mudarStatus(Number(botao.dataset.cancelar), 'cancelado');
    });
}
