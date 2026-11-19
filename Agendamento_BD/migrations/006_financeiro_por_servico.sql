USE gestao_agendamentos;

-- Copia os vínculos anteriores para a tabela de serviços sem sobrescrever entradas novas.
INSERT INTO agendamento_servicos (agendamento_id, servico_id, cliente_pacote_id)
SELECT a.id, a.servico_id, a.cliente_pacote_id
FROM agendamentos a
WHERE a.servico_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM agendamento_servicos item WHERE item.agendamento_id = a.id
);

-- O item 1 preserva os registros financeiros gravados antes desta migração.
SET @ddl = IF(EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'registros_atendimento' AND column_name = 'item'
), 'DO 0', 'ALTER TABLE registros_atendimento ADD COLUMN item INT NOT NULL DEFAULT 1 AFTER agendamento_id, DROP PRIMARY KEY, ADD PRIMARY KEY (agendamento_id, item)');
PREPARE migracao FROM @ddl;
EXECUTE migracao;
DEALLOCATE PREPARE migracao;
