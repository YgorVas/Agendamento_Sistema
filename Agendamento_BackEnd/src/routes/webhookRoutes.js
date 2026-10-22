const express = require('express');
const router = express.Router();

// Rota de validação do Webhook da Meta (GET)
router.get('/whatsapp', (req, res) => {
    // Chave secreta definida por você (pode colocar no .env)
    const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'token_sistema_api';

    // Parâmetros enviados pela Meta no momento do teste
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // Verifica se o modo e o token estão corretos
    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED com sucesso pela Meta!');
            // A Meta exige retornar exatamente o desafio recebido com status HTTP 200
            return res.status(200).send(challenge);
        } else {
            console.error('Falha na validação: Token incorreto.');
            return res.sendStatus(403);
        }
    }
    
    return res.sendStatus(400);
});

module.exports = router;