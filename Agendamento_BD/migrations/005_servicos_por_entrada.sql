-- Estrutura para associar pacotes a serviços e registrar serviços por entrada.
-- Pacotes anteriores permanecem sem serviço até serem vinculados explicitamente.
USE gestao_agendamentos;

SET @ddl = IF(EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'pacotes' AND column_name = 'servico_id'
), 'DO 0', 'ALTER TABLE pacotes ADD COLUMN servico_id INT NULL, ADD CONSTRAINT fk_pacotes_servico FOREIGN KEY (servico_id) REFERENCES servicos(id)');
PREPARE migracao FROM @ddl;
EXECUTE migracao;
DEALLOCATE PREPARE migracao;

CREATE TABLE IF NOT EXISTS agendamento_servicos (
    agendamento_id INT NOT NULL,
    servico_id INT NOT NULL,
    cliente_pacote_id INT NULL,
    PRIMARY KEY (agendamento_id, servico_id),
    CONSTRAINT fk_agendamento_servicos_agendamento FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id) ON DELETE CASCADE,
    CONSTRAINT fk_agendamento_servicos_servico FOREIGN KEY (servico_id) REFERENCES servicos(id),
    CONSTRAINT fk_agendamento_servicos_pacote FOREIGN KEY (cliente_pacote_id) REFERENCES cliente_pacotes(id)
) ENGINE=InnoDB;
