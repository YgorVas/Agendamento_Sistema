const axios = require('axios');

const WhatsappService = {
    enviarMensagem: async (telefone, mensagem) => {
        try {
            const telefoneFormatado = telefone.replace(/\D/g, '');
            console.log(`[WHATSAPP SIMULADO] Para: ${telefoneFormatado} | Mensagem: ${mensagem}`);
            return true;
        } catch (error) {
            console.error('Erro ao enviar mensagem via WhatsApp:', error.message);
            return false;
        }
    }
};

module.exports = WhatsappService;