const express = require('express');
const router = express.Router();
const { createHmac, timingSafeEqual } = require('node:crypto');
const pool = require('../config/db');
const { variantesTelefone } = require('../services/telefone');

// Rota de validação do Webhook da Meta (GET)
router.get('/whatsapp', (req, res) => {
    // Chave secreta definida por você (pode colocar no .env)
    const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

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

// A assinatura garante que apenas notificações enviadas pela Meta consultem a fila.
router.post('/whatsapp', async (req, res) => {
    const { WHATSAPP_APP_SECRET: secret, WHATSAPP_ACCESS_TOKEN: accessToken,
        WHATSAPP_PHONE_NUMBER_ID: phoneId, WHATSAPP_EMPRESA_ID: empresaId,
        PUBLIC_BASE_URL: baseUrl, WHATSAPP_API_VERSION: version } = process.env;
    if (!secret || !accessToken || !phoneId || !/^[1-9]\d*$/.test(empresaId || '') || !baseUrl || !/^v\d+\.\d+$/.test(version || '')) return res.sendStatus(503);
    const signature = req.get('x-hub-signature-256') || '';
    const expected = 'sha256=' + createHmac('sha256', secret).update(req.rawBody).digest('hex');
    if (!/^sha256=[0-9a-f]{64}$/.test(signature) || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return res.sendStatus(403);
    try {
        const url = new URL('/fila.html', baseUrl);
        if (url.protocol !== 'https:') return res.sendStatus(503);
        url.searchParams.set('empresa', empresaId);
        for (const entry of req.body.entry || []) for (const change of entry.changes || []) {
            if (change.value?.metadata?.phone_number_id !== phoneId) continue;
            for (const message of change.value.messages || []) {
                if (message.type !== 'text' || !/^\d{10,15}$/.test(message.from || '')) continue;
                const hoje = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
                const [rows] = await pool.execute(`SELECT a.posicao_fila, a.status,
                    (SELECT COUNT(*) FROM agendamentos f WHERE f.empresa_id = a.empresa_id AND f.data_atendimento = a.data_atendimento AND f.posicao_fila < a.posicao_fila AND f.status IN ('agendado', 'confirmado')) AS pessoas
                    FROM agendamentos a JOIN clientes c ON c.id = a.cliente_id AND c.empresa_id = a.empresa_id
                    JOIN empresas e ON e.id = a.empresa_id AND e.ativo = TRUE
                    WHERE a.empresa_id = ? AND a.data_atendimento = ? AND a.status IN ('agendado', 'confirmado')
                    AND REGEXP_REPLACE(c.telefone_whatsapp, '[^0-9]', '') IN (?, ?) ORDER BY a.id DESC LIMIT 1`,
                    [Number(empresaId), hoje, ...variantesTelefone(message.from)]);
                const fila = rows[0];
                const texto = fila ? `Sua senha é ${fila.posicao_fila}. ${fila.status === 'confirmado' ? 'Seu atendimento está em andamento.' : `Há ${fila.pessoas} pessoa(s) à sua frente.`}\nPara entrar na fila: ${url}` : `Para se registrar e entrar na fila, acesse: ${url}\nApós o registro, envie outra mensagem para consultar sua posição.`;
                const resposta = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
                    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messaging_product: 'whatsapp', to: message.from, type: 'text', text: { body: texto } })
                });
                if (!resposta.ok) throw new Error(`WhatsApp HTTP ${resposta.status}`);
            }
        }
        return res.sendStatus(200);
    } catch (erro) { console.error('Falha no chatbot:', erro.message); return res.sendStatus(500); }
});

module.exports = router;