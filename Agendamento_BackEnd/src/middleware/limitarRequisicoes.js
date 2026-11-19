// Limite local por processo. Em múltiplas instâncias, use um armazenamento compartilhado.
function limitarRequisicoes({ limite, janelaMs }) {
    const acessos = new Map();
    return (req, res, next) => {
        const agora = Date.now();
        for (const [ip, registro] of acessos) if (registro.ate <= agora) acessos.delete(ip);
        const ip = req.ip || req.socket.remoteAddress || 'desconhecido';
        let registro = acessos.get(ip);
        if (!registro) {
            if (acessos.size >= 10000) return res.status(503).json({ erro: 'Serviço temporariamente indisponível.' });
            registro = { quantidade: 0, ate: agora + janelaMs };
            acessos.set(ip, registro);
        }
        if (++registro.quantidade > limite) {
            res.set('Retry-After', String(Math.ceil((registro.ate - agora) / 1000)));
            return res.status(429).json({ erro: 'Muitas tentativas. Aguarde e tente novamente.' });
        }
        next();
    };
}
module.exports = limitarRequisicoes;
