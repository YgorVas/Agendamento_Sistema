const express = require('express');
const path = require('node:path');
require('dotenv').config();

const pool = require('./config/db');
const clienteRoutes = require('./routes/clienteRoutes');
const servicoRoutes = require('./routes/servicoRoutes');
const agendamentoRoutes = require('./routes/agendamentoRoutes');
const pacoteRoutes = require('./routes/pacoteRoutes');

// 1. IMPORTAR AS ROTAS DO WEBHOOK AQUI:
const webhookRoutes = require('./routes/webhookRoutes');

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../../Agendamento_FrontEnd/sistema_de_agendamentos_e_fila_di_ria.html'));
});

// Rota de teste do banco
app.get('/testar-conexao', require('./middleware/empresa'), async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT 1 + 1 AS resultado');
        res.json({ mensagem: 'Conexão com o MySQL bem-sucedida!', testeDoBanco: rows[0].resultado });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao conectar ao banco de dados' });
    }
});

// Registrando os módulos das rotas
app.use('/clientes', clienteRoutes);
app.use('/servicos', servicoRoutes);
app.use('/agendamentos', agendamentoRoutes); 
app.use('/pacotes', pacoteRoutes);

// 2. REGISTRAR A ROTA DO WEBHOOK AQUI:
app.use('/api/webhook', webhookRoutes);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});