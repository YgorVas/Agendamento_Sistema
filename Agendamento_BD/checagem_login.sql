SELECT u.email, e.nome_fantasia, uc.cargo, e.ativo
FROM usuarios u
JOIN usuario_comercios uc ON uc.usuario_id = u.id
JOIN empresas e ON e.id = uc.empresa_id
WHERE u.email = 'barbearia@example.invalid';