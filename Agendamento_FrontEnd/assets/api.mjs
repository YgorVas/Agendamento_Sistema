export const state = {
    empresaId: null,
    token: null,
    data: null,
    activeClienteId: null,
    clientes: [],
    servicos: [],
    pacotes: [],
    agendamentos: []
};

export async function api(caminho, { method = 'GET', body } = {}) {
    const resposta = await fetch(caminho, {
        method,
        headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        signal: AbortSignal.timeout(10000)
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'Falha ao consultar a API.');
    return dados;
}
