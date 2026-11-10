-- Atualiza bases criadas com a versão anterior do esquema.
USE gestao_agendamentos;

SET @ddl = IF(EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'agendamentos' AND column_name = 'posicao_fila'
), 'DO 0', 'ALTER TABLE agendamentos ADD COLUMN posicao_fila INT NULL');
PREPARE migracao FROM @ddl;
EXECUTE migracao;
DEALLOCATE PREPARE migracao;

SET @ddl = IF(EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'agendamentos' AND column_name = 'data_atendimento'
), 'DO 0', 'ALTER TABLE agendamentos ADD COLUMN data_atendimento DATE NULL');
PREPARE migracao FROM @ddl;
EXECUTE migracao;
DEALLOCATE PREPARE migracao;

UPDATE agendamentos SET data_atendimento = DATE(data_hora)
WHERE data_atendimento IS NULL OR CAST(data_atendimento AS CHAR) = '0000-00-00';
ALTER TABLE agendamentos MODIFY COLUMN data_atendimento DATE NOT NULL;

SET @ddl = IF(EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'agendamentos' AND index_name = 'idx_fila_empresa_dia'
), 'DO 0', 'CREATE INDEX idx_fila_empresa_dia ON agendamentos (empresa_id, data_atendimento, posicao_fila)');
PREPARE migracao FROM @ddl;
EXECUTE migracao;
DEALLOCATE PREPARE migracao;
