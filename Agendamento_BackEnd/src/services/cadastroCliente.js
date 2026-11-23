const { normalizarDigitos } = require('./telefone');

const erroCadastro = 'Informe nome e sobrenome (até 100 caracteres no total) e um WhatsApp no formato 82 988887777.';

function validarCadastroCliente({ nome, sobrenome, telefone_whatsapp }) {
    const primeiroNome = typeof nome === 'string' ? nome.trim() : '';
    const ultimoNome = typeof sobrenome === 'string' ? sobrenome.trim() : '';
    const nomeCompleto = `${primeiroNome} ${ultimoNome}`;
    if (!primeiroNome || !ultimoNome || nomeCompleto.length > 100 ||
        typeof telefone_whatsapp !== 'string' || telefone_whatsapp.length !== 12 ||
        !/^[0-9]{2} 9[0-9]{8}$/.test(telefone_whatsapp)) {
        return null;
    }
    return { nome: nomeCompleto, telefone: normalizarDigitos(telefone_whatsapp) };
}

module.exports = { validarCadastroCliente, erroCadastro };
