USE gestao_agendamentos;
SELECT id, nome_fantasia FROM empresas WHERE ativo = TRUE ORDER BY id;

INSERT INTO usuarios (nome, email, senha_hash)
VALUES ('BarbeariaTeste', 'barbearia@example.invalid', '$2b$12$n/ELk8zgL0M7hCYF.hlDcOAZ8SuwDPCj/GbK0S5KkKXJRCzV1nLvq');

INSERT INTO usuario_comercios (usuario_id, empresa_id, cargo)
VALUES (LAST_INSERT_ID(), 1, 'ADMIN');