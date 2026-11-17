import { requisitar } from './api.mjs';

const chaveSessao = 'agendamento.auth.token';

export function tokenAtual() {
    return sessionStorage.getItem(chaveSessao);
}

export function salvarSessao(token) {
    sessionStorage.setItem(chaveSessao, token);
}

export function encerrarSessao(motivo) {
    sessionStorage.removeItem(chaveSessao);
    location.replace(motivo ? '/login?' + new URLSearchParams({ sessao: motivo }) : '/login');
}

export function entrar(email, senha) {
    return requisitar('/auth/login', { method: 'POST', body: { email, senha } });
}

export function selecionarComercio(comercioId, tokenTemporario) {
    return requisitar('/auth/selecionar-comercio', {
        method: 'POST',
        token: tokenTemporario,
        body: { comercioId }
    });
}

export async function apiAutenticada(caminho, opcoes) {
    const url = new URL(caminho, location.origin);
    if (url.origin !== location.origin) throw new Error('Endereço da API inválido.');

    const token = tokenAtual();
    if (!token) {
        encerrarSessao();
        throw new Error('Entre para continuar.');
    }
    try {
        return await requisitar(url.href, { ...opcoes, token });
    } catch (erro) {
        if (tokenAtual() === token) {
            if (erro.status === 401) encerrarSessao('expirada');
            if (erro.codigo === 'INSTANCIA_INDISPONIVEL') encerrarSessao('indisponivel');
        }
        throw erro;
    }
}
