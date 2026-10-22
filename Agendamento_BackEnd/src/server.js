const express = require('express');
const cors = require('cors');
require('dotenv').config();

const pool = require('./config/db');
const clienteRoutes = require('./routes/clienteRoutes');
const servicoRoutes = require('./routes/servicoRoutes');
const agendamentoRoutes = require('./routes/agendamentoRoutes');
const pacoteRoutes = require('./routes/pacoteRoutes');

// 1. IMPORTAR AS ROTAS DO WEBHOOK AQUI:
const webhookRoutes = require('./routes/webhookRoutes');

const app = express();

app.use(cors());
app.use(express.json());

// Rota de teste do banco
app.get('/testar-conexao', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT 1 + 1 AS resultado');
        res.json({ mensagem: 'Conexão com o MySQL bem-sucedida!', testeDoBanco: rows[0].resultado });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao conectar ao banco de dados', detalhes: error.message });
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
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});