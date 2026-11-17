const pool = require('../config/db');

async function buscarUsuario(email) {
    const [[usuario]] = await pool.execute(
        'SELECT id, senha_hash FROM usuarios WHERE email = ?', [email]
    );
    return usuario;
}

async function listarVinculosAtivos(usuarioId) {
    const [vinculos] = await pool.execute(
        `SELECT e.id AS comercioId, e.nome_fantasia AS nomeFantasia, uc.cargo
         FROM usuario_comercios uc
         JOIN empresas e ON e.id = uc.empresa_id
         WHERE uc.usuario_id = ? AND e.ativo = TRUE
         ORDER BY e.nome_fantasia, e.id`,
        [usuarioId]
    );
    return vinculos;
}

async function buscarVinculoAtivo(usuarioId, comercioId) {
    const [[vinculo]] = await pool.execute(
        `SELECT uc.cargo
         FROM usuario_comercios uc
         JOIN empresas e ON e.id = uc.empresa_id
         WHERE uc.usuario_id = ? AND uc.empresa_id = ? AND e.ativo = TRUE`,
        [usuarioId, comercioId]
    );
    return vinculo;
}

module.exports = { buscarUsuario, listarVinculosAtivos, buscarVinculoAtivo };
