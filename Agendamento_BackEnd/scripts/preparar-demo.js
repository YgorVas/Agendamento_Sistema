const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
require('dotenv').config({ quiet: true });

async function prepararDemo() {
    const nomeBanco = process.env.DB_NAME;
    if (!nomeBanco) throw new Error('Configure DB_NAME no .env.');
    const senha = process.env.DEMO_PASSWORD || randomBytes(18).toString('base64url');
    if (Buffer.byteLength(senha) > 72) throw new Error('DEMO_PASSWORD deve ter até 72 bytes.');
    const hash = await bcrypt.hash(senha, 12);
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: nomeBanco,
        multipleStatements: true
    });
    try {
        const sqlDir = path.resolve(__dirname, '../../Agendamento_BD');
        const [tabelas] = await db.query('SHOW TABLES');
        if (!tabelas.length) {
            const schema = await readFile(path.join(sqlDir, 'Projeto_Agendamento.sql'), 'utf8');
            await db.query(schema.replace(/^(CREATE DATABASE IF NOT EXISTS|USE) gestao_agendamentos\b/gm,
                (_, comando) => comando + ' ' + mysql.escapeId(nomeBanco)));
        }
        for (const arquivo of ['001_fila_diaria.sql', '002_ticket_publico.sql',
            '003_registros_atendimento.sql', '004_autenticacao_multi_tenant.sql']) {
            const sql = await readFile(path.join(sqlDir, 'migrations', arquivo), 'utf8');
            await db.query(sql.replace(/^USE gestao_agendamentos;/m,
                'USE ' + mysql.escapeId(nomeBanco) + ';'));
        }

        await db.beginTransaction();
        const email = 'demo-admin@example.invalid';
        const [usuario] = await db.execute(`
            INSERT INTO usuarios (nome, email, senha_hash)
            VALUES ('Administrador Demo', ?, ?)
            ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
        `, [email, hash]);
        const usuarioId = usuario.insertId;
        const [[conta]] = await db.execute('SELECT senha_hash FROM usuarios WHERE id = ? FOR UPDATE', [usuarioId]);
        for (const loja of [
            { nome: 'Demo Centro', email: 'demo-centro@example.invalid', telefone: '5511000000001',
                cliente: 'Ana Demo', servico: 'Corte Demo', preco: 50 },
            { nome: 'Demo Jardins', email: 'demo-jardins@example.invalid', telefone: '5511000000002',
                cliente: 'Bruno Demo', servico: 'Barba Demo', preco: 35 }
        ]) {
            const [empresa] = await db.execute(`
                INSERT INTO empresas (nome_fantasia, telefone_whatsapp, email, senha_hash)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
            `, [loja.nome, loja.telefone, loja.email, hash]);
            const empresaId = empresa.insertId;
            await db.execute('SELECT id FROM empresas WHERE id = ? FOR UPDATE', [empresaId]);
            await db.execute(`
                INSERT INTO usuario_comercios (usuario_id, empresa_id, cargo)
                VALUES (?, ?, 'ADMIN')
                ON DUPLICATE KEY UPDATE usuario_id = usuario_id
            `, [usuarioId, empresaId]);
            await db.execute(`
                INSERT INTO clientes (empresa_id, nome, telefone_whatsapp)
                SELECT ?, ?, ? WHERE NOT EXISTS (
                    SELECT 1 FROM clientes WHERE empresa_id = ? AND telefone_whatsapp = ?
                )
            `, [empresaId, loja.cliente, loja.telefone, empresaId, loja.telefone]);
            await db.execute(`
                INSERT INTO servicos (empresa_id, nome, preco, duracao_minutos)
                SELECT ?, ?, ?, 30 WHERE NOT EXISTS (
                    SELECT 1 FROM servicos WHERE empresa_id = ? AND nome = ?
                )
            `, [empresaId, loja.servico, loja.preco, empresaId, loja.servico]);
            await db.execute(`
                INSERT INTO pacotes (empresa_id, nome, total_sessoes, preco_total, dias_validade)
                SELECT ?, 'Pacote Demo 4 sessões', 4, ?, 30 WHERE NOT EXISTS (
                    SELECT 1 FROM pacotes WHERE empresa_id = ? AND nome = 'Pacote Demo 4 sessões'
                )
            `, [empresaId, loja.preco * 4, empresaId]);
        }
        await db.commit();
        console.log('Demonstração preparada com duas lojas, clientes, serviços e pacotes.');
        console.log('E-mail de teste: ' + email);
        console.log(await bcrypt.compare(senha, conta.senha_hash)
            ? 'Senha de teste: ' + senha
            : 'A conta demo já existia. Use a senha cadastrada anteriormente.');
    } catch (erro) {
        await db.rollback();
        throw erro;
    } finally {
        await db.end();
    }
}

prepararDemo().catch(erro => {
    console.error('Falha ao preparar demonstração:', erro.sqlMessage || erro.message);
    process.exitCode = 1;
});
