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

const frontend = path.resolve(__dirname, '../../Agendamento_FrontEnd');
app.get(['/dashboard', '/dashboard.html'], (req, res) => res.sendFile(path.join(frontend, 'index.html')));
app.use(express.static(frontend, {
    extensions: ['html']
}));

// Rota de teste do banco
app.get('/testar-conexao', require('./middleware/verificarInstancia'), async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT 1 + 1 AS resultado');
        res.json({ mensagem: 'Conexão com o MySQL bem-sucedida!', testeDoBanco: rows[0].resultado });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao conectar ao banco de dados' });
    }
});

// Registrando os módulos das rotas
app.use('/auth', require('./routes/authRoutes'));
app.use('/clientes', clienteRoutes);
app.use('/servicos', servicoRoutes);
app.use('/agendamentos', agendamentoRoutes);
app.use('/pacotes', pacoteRoutes);
app.use('/financeiro', require('./routes/financeiroRoutes'));
app.use('/fila-publica', require('./routes/filaPublicaRoutes'));

app.use('/api/webhook', webhookRoutes);

module.exports = app;
