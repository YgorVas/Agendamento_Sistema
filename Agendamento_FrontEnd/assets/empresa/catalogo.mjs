import { state } from './sessao.mjs';
import { escapeHtml } from '../html.mjs';

function openModalServicosPacotes() {
    document.getElementById('modal-servicos-pacotes').classList.remove('hidden');
    renderModalData();
}

export function closeModalServicosPacotes() {
    document.getElementById('modal-servicos-pacotes').classList.add('hidden');
}

export function renderModalData() {
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

document.getElementById('abrir-catalogo').addEventListener('click', openModalServicosPacotes);
document.querySelectorAll('[data-fechar-catalogo]').forEach(botao =>
    botao.addEventListener('click', closeModalServicosPacotes)
);
