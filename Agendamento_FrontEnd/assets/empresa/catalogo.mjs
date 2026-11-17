import { api, state } from './sessao.mjs';
import { escapeHtml } from '../html.mjs';
import { tokenAtual } from '../auth-api.mjs';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formularioAtribuicao = document.getElementById('form-atribuir-pacote');
const clienteAtribuicao = formularioAtribuicao.elements.cliente_id;
const pacoteAtribuicao = formularioAtribuicao.elements.pacote_id;
const botaoAtribuicao = formularioAtribuicao.querySelector('button[type="submit"]');
const avisoAtribuicao = document.getElementById('aviso-atribuir-pacote');
const saldoPacotes = document.getElementById('saldo-pacotes-cliente');

async function carregarSaldoPacotes() {
    const clienteId = clienteAtribuicao.value;
    const token = tokenAtual();
    saldoPacotes.textContent = clienteId ? 'Consultando pacotes…' : 'Selecione um cliente para consultar seus pacotes.';
    if (!clienteId) return;
    try {
        const pacotes = await api('/pacotes/cliente/' + clienteId);
        if (clienteAtribuicao.value !== clienteId || tokenAtual() !== token) return;
        const status = { ativo: 'Ativo', concluido: 'Concluído', expirado: 'Expirado' };
        saldoPacotes.innerHTML = pacotes.length ? pacotes.map(pacote => {
            const data = String(pacote.data_validade).slice(0, 10).split('-').reverse().join('/');
            return `<li class="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div class="font-semibold">${escapeHtml(pacote.pacote_nome)}</div>
                <div>${Number(pacote.sessoes_restantes)} de ${Number(pacote.total_sessoes)} sessões restantes · Validade ${escapeHtml(data)} · ${escapeHtml(status[pacote.status] || pacote.status)}</div>
            </li>`;
        }).join('') : '<li class="text-slate-500">Este cliente ainda não possui pacotes.</li>';
    } catch (erro) {
        if (clienteAtribuicao.value === clienteId && tokenAtual() === token) saldoPacotes.textContent = erro.message;
    }
}

function preencherOpcoes(select, itens, placeholder, rotulo) {
    const valorAnterior = select.value;
    select.replaceChildren(new Option(placeholder, ''));
    for (const item of itens) select.add(new Option(rotulo(item), item.id));
    select.value = itens.some(item => String(item.id) === valorAnterior) ? valorAnterior : '';
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
    preencherOpcoes(clienteAtribuicao, state.clientes,
        state.clientes.length ? 'Selecione o cliente' : 'Nenhum cliente cadastrado',
        cliente => `${cliente.nome} · ${cliente.telefone_whatsapp}`);
    preencherOpcoes(pacoteAtribuicao, state.pacotes,
        state.pacotes.length ? 'Selecione o pacote' : 'Nenhum pacote cadastrado',
        pacote => `${pacote.nome} · ${pacote.total_sessoes} sessões · ${pacote.dias_validade} dias`);
    if (!clienteAtribuicao.disabled) {
        botaoAtribuicao.disabled = !state.clientes.length || !state.pacotes.length;
    }
    carregarSaldoPacotes();
}

export function configurarCatalogo({ executarAcao, atualizarServicos, aoAtribuirPacote }) {
    clienteAtribuicao.addEventListener('change', () => {
        avisoAtribuicao.textContent = '';
        carregarSaldoPacotes();
    });
    formularioAtribuicao.addEventListener('submit', evento => {
        evento.preventDefault();
        executarAcao(async () => {
            const dados = Object.fromEntries(new FormData(formularioAtribuicao));
            if (!dados.cliente_id || !dados.pacote_id) return;

            clienteAtribuicao.disabled = pacoteAtribuicao.disabled = botaoAtribuicao.disabled = true;
            avisoAtribuicao.className = 'text-sm text-slate-600';
            avisoAtribuicao.textContent = 'Atribuindo pacote…';
            try {
                const resultado = await api('/pacotes/vender', { method: 'POST', body: dados });
                pacoteAtribuicao.value = '';
                avisoAtribuicao.className = 'text-sm text-emerald-700';
                avisoAtribuicao.textContent = `Pacote atribuído com sucesso. ${resultado.sessoes_iniciais} sessões · ${resultado.dias_validade} dias de validade.`;
            } catch (erro) {
                avisoAtribuicao.className = 'text-sm text-rose-700';
                avisoAtribuicao.textContent = erro.message;
                return;
            } finally {
                clienteAtribuicao.disabled = pacoteAtribuicao.disabled = botaoAtribuicao.disabled = false;
            }

            await carregarSaldoPacotes();
            await aoAtribuirPacote(dados.cliente_id);
        });
    });

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
