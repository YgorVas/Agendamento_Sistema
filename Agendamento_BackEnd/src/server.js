require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
app.listen(PORT, HOST, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});