const express = require('express');
const path = require('node:path');

const pool = require('./config/db');
const clienteRoutes = require('./routes/clienteRoutes');
const servicoRoutes = require('./routes/servicoRoutes');
const agendamentoRoutes = require('./routes/agendamentoRoutes');
const pacoteRoutes = require('./routes/pacoteRoutes');

const webhookRoutes = require('./routes/webhookRoutes');

const app = express();

app.use(express.json());

app.use(express.static(path.resolve(__dirname, '../../Agendamento_FrontEnd')));

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

app.use('/api/webhook', webhookRoutes);

module.exports = app;
