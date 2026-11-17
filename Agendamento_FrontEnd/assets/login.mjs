import { entrar, salvarSessao, tokenAtual } from './auth-api.mjs';
import { exibirComercios } from './selecao-comercio.mjs';

const form = document.querySelector('#form-login');
const login = document.querySelector('#login');
const selecao = document.querySelector('#selecao');
const senha = document.querySelector('#senha');
const mostrarSenha = document.querySelector('#mostrar-senha');
const botao = document.querySelector('#entrar');
const texto = document.querySelector('#texto-entrar');
const spinner = botao.querySelector('.spinner');
const erroLogin = document.querySelector('#erro-login');
const avisoSessao = document.querySelector('#aviso-sessao');
const abrirDashboard = () => location.replace('/dashboard');

if (tokenAtual()) abrirDashboard();
const motivo = new URLSearchParams(location.search).get('sessao');
const avisos = new Map([
    ['expirada', 'Sua sessão expirou. Entre novamente para continuar.'],
    ['indisponivel', 'Seu acesso a esta loja mudou. Entre novamente para consultar suas lojas.']
]);
if (avisos.has(motivo)) {
    avisoSessao.textContent = avisos.get(motivo);
    avisoSessao.hidden = false;
}

mostrarSenha.onclick = () => {
    const exibir = senha.type === 'password';
    senha.type = exibir ? 'text' : 'password';
    mostrarSenha.textContent = exibir ? 'Ocultar' : 'Mostrar';
};

form.onsubmit = async event => {
    event.preventDefault();
    if (botao.disabled) return;
    avisoSessao.hidden = true;
    erroLogin.textContent = '';
    botao.disabled = true;
    spinner.hidden = false;
    texto.textContent = 'Entrando…';
    try {
        const resposta = await entrar(form.elements.email.value, senha.value);
        senha.value = '';
        senha.type = 'password';
        mostrarSenha.textContent = 'Mostrar';
        if (resposta.token) {
            salvarSessao(resposta.token);
            abrirDashboard();
            return;
        }
        login.hidden = true;
        exibirComercios(selecao, resposta, {
            concluir: abrirDashboard,
            voltar: () => {
                selecao.hidden = true;
                login.hidden = false;
                senha.focus();
            }
        });
    } catch (erro) {
        login.hidden = false;
        selecao.hidden = true;
        erroLogin.textContent = erro.status ? erro.message : 'Não foi possível conectar. Tente novamente.';
    } finally {
        botao.disabled = false;
        spinner.hidden = true;
        texto.textContent = 'Entrar';
    }
};
