import { encerrarSessao, salvarSessao, selecionarComercio, tokenAtual } from './auth-api.mjs';

export const nomeCargo = cargo => ({ ADMIN: 'Administrador', CAIXA: 'Caixa', GERENTE: 'Gerente' })[cargo] ?? cargo;

export function exibirComercios(painel, { comercios, tokenTemporario }, { concluir, voltar }) {
    const lista = painel.querySelector('.comercios');
    const aviso = painel.querySelector('[role="alert"]');
    const botaoVoltar = painel.querySelector('[data-voltar]');
    lista.replaceChildren();
    aviso.textContent = '';
    botaoVoltar.onclick = () => {
        lista.replaceChildren();
        botaoVoltar.onclick = null;
        voltar();
    };

    for (const comercio of comercios) {
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'comercio';
        const nome = document.createElement('strong');
        nome.textContent = comercio.nomeFantasia;
        const cargo = document.createElement('span');
        cargo.textContent = nomeCargo(comercio.cargo);
        botao.append(nome, cargo);
        lista.append(botao);

        botao.onclick = async () => {
            const sessaoAnterior = tokenAtual();
            const botoes = [...lista.children, botaoVoltar];
            botoes.forEach(item => { item.disabled = true; });
            aviso.textContent = '';
            cargo.textContent = 'Verificando acesso…';
            try {
                const { token } = await selecionarComercio(comercio.comercioId, tokenTemporario);
                if (tokenAtual() !== sessaoAnterior) return;
                salvarSessao(token);
                lista.replaceChildren();
                botaoVoltar.onclick = null;
                concluir();
            } catch (erro) {
                if (tokenAtual() !== sessaoAnterior) return;
                if (erro.status === 401) {
                    lista.replaceChildren();
                    encerrarSessao('expirada');
                } else {
                    aviso.textContent = erro.status ? erro.message : 'Não foi possível conectar. Tente novamente.';
                }
            } finally {
                cargo.textContent = nomeCargo(comercio.cargo);
                botoes.forEach(item => { item.disabled = false; });
            }
        };
    }
    painel.hidden = false;
    painel.querySelector('h1, h2').focus();
}
