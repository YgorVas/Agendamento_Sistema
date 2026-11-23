function normalizarDigitos(valor) {
    return valor.replace(/\D/g, '');
}

function variantesTelefone(valor) {
    const digitos = normalizarDigitos(valor);
    const alternativo = digitos.startsWith('55') && digitos.length >= 12 && digitos.length <= 13
        ? digitos.slice(2) : (digitos.length === 10 || digitos.length === 11 ? '55' + digitos : digitos);
    return [digitos, alternativo];
}

module.exports = { normalizarDigitos, variantesTelefone };
