import { api, state } from './sessao.mjs';
import { escapeHtml } from '../html.mjs';

const telaCatalogo = document.getElementById('view-catalogo');
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function resetarCatalogo() {
    telaCatalogo.querySelectorAll('form').forEach(formulario => formulario.reset());
    telaCatalogo.querySelectorAll('[aria-live]').forEach(aviso => aviso.replaceChildren());
}

function renderLista(tipo, itens, detalhe, preco) {
    const lista = document.getElementById('lista-' + tipo);
    lista.innerHTML = itens.length ? itens.map(item => `
        <li class="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div class="min-w-0 break-words">
                <div class="font-semibold">${escapeHtml(item.nome)}</div>
                <div class="text-xs text-slate-600">${detalhe(item)}</div>
            </div>
            <span class="shrink-0 font-semibold text-brand-600">${moeda.format(item[preco])}</span>
        </li>
    `).join('') : '<li class="text-slate-500">Nenhum cadastro ainda.</li>';
}

export function renderCatalogo() {
    renderLista('servico', state.servicos, item => `${Number(item.duracao_minutos)} min`, 'preco');
    renderLista('pacote', state.pacotes,
        item => `${Number(item.total_sessoes)} sessões · ${Number(item.dias_validade)} dias de validade`,
        'preco_total');
}

export function configurarCatalogo({ executarAcao, atualizarServicos }) {
    function configurarCadastro({ tipo, rota, chaveId, camposNumericos, aoSalvar }) {
        const formulario = document.getElementById('form-' + tipo);
        const aviso = document.getElementById('aviso-' + tipo);
        const botao = formulario.querySelector('button[type="submit"]');

        formulario.addEventListener('submit', evento => {
            evento.preventDefault();
            executarAcao(async () => {
                const dados = Object.fromEntries(new FormData(formulario));
                dados.nome = dados.nome.trim();
                dados.descricao = dados.descricao.trim() || null;
                if (!dados.nome) {
                    aviso.className = 'text-sm text-rose-700';
                    aviso.textContent = 'Informe um nome para o cadastro.';
                    formulario.elements.nome.focus();
                    return;
                }
                for (const campo of camposNumericos) dados[campo] = Number(dados[campo]);

                botao.disabled = true;
                aviso.className = 'text-sm text-slate-600';
                aviso.textContent = 'Salvando…';
                try {
                    const resultado = await api(rota, { method: 'POST', body: dados });
                    aoSalvar({ ...dados, id: resultado[chaveId] });
                    formulario.reset();
                    renderCatalogo();
                    aviso.className = 'text-sm text-emerald-700';
                    aviso.textContent = resultado.mensagem;
                } catch (erro) {
                    aviso.className = 'text-sm text-rose-700';
                    aviso.textContent = erro.message;
                } finally {
                    botao.disabled = false;
                }
            });
        });
    }

    configurarCadastro({
        tipo: 'servico', rota: '/servicos', chaveId: 'servico_id',
        camposNumericos: ['duracao_minutos', 'preco'],
        aoSalvar: servico => {
            state.servicos.push(servico);
            state.servicos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
            atualizarServicos();
        }
    });
    configurarCadastro({
        tipo: 'pacote', rota: '/pacotes', chaveId: 'pacote_id',
        camposNumericos: ['total_sessoes', 'preco_total', 'dias_validade'],
        aoSalvar: pacote => state.pacotes.push(pacote)
    });
}
