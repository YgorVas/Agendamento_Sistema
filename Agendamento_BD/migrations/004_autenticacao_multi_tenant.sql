-- Adiciona o esquema de autenticação às bases existentes.
USE gestao_agendamentos;

SET @ddl = IF(EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'empresas' AND column_name = 'ativo'
), 'DO 0', 'ALTER TABLE empresas ADD COLUMN ativo BOOLEAN NOT NULL DEFAULT TRUE');
PREPARE migracao FROM @ddl;
EXECUTE migracao;
DEALLOCATE PREPARE migracao;

CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_usuarios_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS usuario_comercios (
    usuario_id INT NOT NULL,
    empresa_id INT NOT NULL,
    cargo ENUM('ADMIN', 'CAIXA', 'GERENTE') NOT NULL,
    PRIMARY KEY (usuario_id, empresa_id),
    INDEX idx_usuario_comercios_empresa (empresa_id, usuario_id),
    CONSTRAINT fk_usuario_comercios_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT fk_usuario_comercios_empresa
        FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB;
