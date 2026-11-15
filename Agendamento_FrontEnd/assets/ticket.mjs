import { requisitar } from './api.mjs';

const token = location.hash.slice(1);
const status = document.getElementById('status');
const posicao = document.getElementById('posicao');

async function atualizarTicket() {
    if (!/^[0-9a-f]{64}$/.test(token)) {
        status.textContent = 'Abra o link do ticket fornecido pelo estabelecimento.';
        return;
    }
    try {
        const ticket = await requisitar('/agendamentos/ticket', { token });
        posicao.textContent = 'Sua posição na fila é #' + ticket.posicao_fila;
        posicao.hidden = false;
        status.textContent = {
            agendado: ticket.pessoas_na_frente === 0
                ? 'Você é o próximo da fila.'
                : ticket.pessoas_na_frente + ' pessoa(s) à sua frente.',
            confirmado: 'É a sua vez. Dirija-se ao local do atendimento.',
            concluido: 'Seu atendimento foi concluído.',
            cancelado: 'Seu atendimento foi cancelado.'
        }[ticket.status];
        if (ticket.status === 'concluido' || ticket.status === 'cancelado') return;
    } catch (erro) {
        if (erro.status === 404) {
            posicao.hidden = true;
            status.textContent = 'Ticket não encontrado.';
            return;
        }
        status.textContent = 'Falha ao atualizar o ticket. Tentando novamente…';
    }
    setTimeout(atualizarTicket, 5000);
}

atualizarTicket();
