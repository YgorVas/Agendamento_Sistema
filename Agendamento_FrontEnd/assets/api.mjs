export async function requisitar(caminho, { method = 'GET', body, token } = {}) {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const resposta = await fetch(caminho, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        signal: AbortSignal.timeout(10000)
    });
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok || dados === null) {
        const erro = new Error(dados?.erro || 'Não foi possível consultar o sistema.');
        erro.status = resposta.status;
        erro.codigo = dados?.codigo;
        throw erro;
    }
    return dados;
}
