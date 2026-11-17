USE gestao_agendamentos;

SELECT id, email, CHAR_LENGTH(senha_hash) AS tamanho_hash
FROM usuarios
WHERE email = 'barbearia@example.invalid';