import { requisitar } from '../api.mjs';

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

export function api(caminho, opcoes = {}) {
    return requisitar(caminho, { ...opcoes, token: state.token });
}
