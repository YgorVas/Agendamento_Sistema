import { escapeHtml } from '../html.mjs';

export function showToast(titulo, texto, type = 'info') {
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
        <button type="button" aria-label="Fechar aviso" class="text-slate-400 hover:text-slate-600">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;

    toast.querySelector('button').addEventListener('click', () => toast.remove());
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
