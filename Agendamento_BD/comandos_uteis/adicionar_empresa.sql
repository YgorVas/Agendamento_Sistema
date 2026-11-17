USE gestao_agendamentos;

INSERT INTO empresas (nome_fantasia, telefone_whatsapp, email, senha_hash, ativo)
VALUES ('BarbeariaTeste', '11900000000', 'barbearia@example.invalid', 'demo-sem-login', TRUE);

SELECT LAST_INSERT_ID() AS empresa_id;