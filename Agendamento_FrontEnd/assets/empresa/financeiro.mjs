import { api } from './sessao.mjs';
import { escapeHtml } from '../html.mjs';

const telaFila = document.getElementById('view-fila');
const telaFinanceiro = document.getElementById('view-financeiro');
const abrir = document.getElementById('abrir-financeiro');
const atualizar = document.getElementById('atualizar-financeiro');
const conteudo = document.getElementById('conteudo-financeiro');
const estado = document.getElementById('estado-financeiro');
const tabela = document.getElementById('registros-financeiro');
const filtro = document.getElementById('filtro-financeiro');
const { tipo, data, ano } = filtro.elements;
const resultadoPeriodo = document.getElementById('resultado-periodo-financeiro');
const estadoPeriodo = document.getElementById('estado-periodo-financeiro');
const grafico = document.getElementById('grafico-financeiro');
const legenda = document.getElementById('legenda-financeiro');
const avisoGrafico = document.getElementById('aviso-grafico-financeiro');
const real = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const percentual = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const formatarData = (data) => data.split('-').reverse().join('/');
const cores = ['#047857', '#2563eb', '#7c3aed', '#c2410c', '#be185d', '#0e7490', '#a16207', '#4338ca'];

let consultaResumo = 0;
let consultaPeriodo = 0;

const ajudaPeriodo = {
    dia: 'Escolha o dia que você quer consultar.',
    semana: 'Escolha uma data na semana que você quer consultar. A semana começa na segunda-feira.',
    mes: 'Escolha uma data no mês que você quer consultar.',
    ano: 'Informe o ano que você quer consultar.'
};

function ajustarFiltro() {
    const anual = tipo.value === 'ano';
    document.getElementById('filtro-data-financeiro').hidden = anual;
    document.getElementById('filtro-ano-financeiro').hidden = !anual;
    document.getElementById('ajuda-periodo-financeiro').textContent = ajudaPeriodo[tipo.value];
    data.disabled = anual;
    ano.disabled = !anual;
}

export function resetarFinanceiro() {
    consultaResumo++;
    consultaPeriodo++;
    telaFinanceiro.hidden = true;
    conteudo.hidden = true;
    resultadoPeriodo.hidden = true;
    estado.textContent = '';
    estadoPeriodo.textContent = '';
    tabela.replaceChildren();
    legenda.replaceChildren();
    filtro.reset();
    ajustarFiltro();
    atualizar.disabled = false;
}

function renderizarResumo({ hoje, inicio_semana, inicio_mes, totais }) {
    const fim = formatarData(hoje);
    const periodos = {
        hoje: fim,
        semana: `${formatarData(inicio_semana)} a ${fim}`,
        mes: `${formatarData(inicio_mes)} a ${fim}`
    };

    for (const [chave, periodo] of Object.entries(periodos)) {
        const quantidade = totais['qtd_' + chave];
        document.getElementById('periodo-' + chave).textContent = periodo;
        document.getElementById('total-' + chave).textContent = real.format(totais[chave]);
        document.getElementById('qtd-' + chave).textContent =
            `${quantidade} ${quantidade === 1 ? 'serviço concluído' : 'serviços concluídos'}`;
    }
}

function renderizarRegistros(registros) {
    tabela.innerHTML = registros.length ? registros.map(registro => `
        <tr>
            <td class="whitespace-nowrap px-4 py-3">${escapeHtml(formatarData(registro.data_conclusao))}</td>
            <td class="px-4 py-3">${escapeHtml(registro.cliente_nome)}</td>
            <td class="px-4 py-3 font-semibold">${escapeHtml(registro.servico_nome)}</td>
            <td class="px-4 py-3 text-slate-600">${escapeHtml(registro.pacote_nome ?? 'Avulso')}</td>
            <td class="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">${real.format(registro.valor)}</td>
        </tr>
    `).join('') : '<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500">Nenhum serviço concluído neste período.</td></tr>';
}

function renderizarGrafico(servicos) {
    const totalPositivo = servicos.reduce((soma, servico) => soma + Math.max(0, Number(servico.valor)), 0);
    const fatias = [];
    let acumulado = 0;
    let angulo = 0;
    legenda.innerHTML = servicos.map((servico, indice) => {
        const valor = Number(servico.valor);
        const cor = cores[indice] ?? `hsl(${(indice * 137.508) % 360} 64% 44%)`;
        let participacao = '—';
        if (valor > 0) {
            acumulado += valor;
            const fim = 100 * acumulado / totalPositivo;
            fatias.push(`${cor} ${angulo}% ${fim}%`);
            angulo = fim;
            participacao = percentual.format(valor / totalPositivo);
        }
        return `
            <li class="flex items-center gap-2 py-2.5 text-sm">
                <span class="h-3 w-3 shrink-0 rounded-full" style="background-color: ${valor > 0 ? cor : '#cbd5e1'}" aria-hidden="true"></span>
                <span class="min-w-0 flex-1 break-words font-medium">${escapeHtml(servico.nome)}</span>
                <span class="whitespace-nowrap font-semibold tabular-nums">${real.format(servico.valor)}</span>
                <span class="w-14 shrink-0 text-right tabular-nums text-slate-500">${participacao}</span>
            </li>`;
    }).join('');
    grafico.hidden = !fatias.length;
    grafico.style.background = fatias.length ? `conic-gradient(${fatias.join(', ')})` : '';
    avisoGrafico.textContent = !fatias.length ? 'Nenhum valor positivo para exibir no gráfico.' :
        servicos.some(servico => Number(servico.valor) < 0) ? 'A pizza mostra a participação dos serviços com valor positivo.' : '';
}

async function carregarResumo() {
    const consulta = ++consultaResumo;
    atualizar.disabled = true;
    conteudo.hidden = true;
    estado.textContent = 'Carregando resumo financeiro.';
    try {
        const resumo = await api('/financeiro/resumo');
        if (consulta !== consultaResumo) return;
        renderizarResumo(resumo);
        estado.textContent = '';
        conteudo.hidden = false;
    } catch (erro) {
        if (consulta === consultaResumo) estado.textContent = erro.message;
    } finally {
        if (consulta === consultaResumo) atualizar.disabled = false;
    }
}

async function carregarPeriodo() {
    const consulta = ++consultaPeriodo;
    const parametros = new URLSearchParams({ tipo: tipo.value });
    const referencia = tipo.value === 'ano' && ano.value ? `${ano.valueAsNumber}-01-01` : data.value;
    if (referencia) parametros.set('data', referencia);
    resultadoPeriodo.hidden = true;
    estadoPeriodo.textContent = 'Consultando período.';
    try {
        const { periodo, total, servicos, registros } = await api('/financeiro/periodo?' + parametros);
        if (consulta !== consultaPeriodo) return;
        data.max = periodo.hoje;
        ano.max = periodo.hoje.slice(0, 4);
        if (!data.value) data.value = periodo.referencia;
        if (!ano.value) ano.value = periodo.referencia.slice(0, 4);
        document.getElementById('intervalo-financeiro').textContent = periodo.inicio === periodo.fim
            ? formatarData(periodo.inicio)
            : `${formatarData(periodo.inicio)} a ${formatarData(periodo.fim)}`;
        document.getElementById('total-periodo-financeiro').textContent = real.format(total);
        renderizarGrafico(servicos);
        renderizarRegistros(registros);
        estadoPeriodo.textContent = '';
        resultadoPeriodo.hidden = false;
    } catch (erro) {
        if (consulta === consultaPeriodo) estadoPeriodo.textContent = erro.message;
    }
}

export function configurarFinanceiro() {
    abrir.addEventListener('click', () => {
        telaFila.hidden = true;
        telaFinanceiro.hidden = false;
        document.getElementById('titulo-financeiro').focus();
        carregarResumo();
        carregarPeriodo();
    });
    document.getElementById('voltar-financeiro').addEventListener('click', () => {
        resetarFinanceiro();
        telaFila.hidden = false;
        abrir.focus();
    });
    tipo.addEventListener('change', ajustarFiltro);
    filtro.addEventListener('submit', evento => {
        evento.preventDefault();
        carregarPeriodo();
    });
    atualizar.addEventListener('click', () => {
        carregarResumo();
        if (filtro.reportValidity()) carregarPeriodo();
    });
}
