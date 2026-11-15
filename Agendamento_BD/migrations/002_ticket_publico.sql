USE gestao_agendamentos;

SET @ddl = IF(EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'agendamentos' AND column_name = 'ticket_hash'
), 'DO 0', 'ALTER TABLE agendamentos ADD COLUMN ticket_hash BINARY(32) NULL UNIQUE');
PREPARE migracao FROM @ddl;
EXECUTE migracao;
DEALLOCATE PREPARE migracao;
