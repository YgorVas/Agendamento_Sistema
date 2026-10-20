USE gestao_agendamentos;

ALTER TABLE agendamentos 
ADD COLUMN posicao_fila INT NULL AFTER cliente_pacote_id,
ADD COLUMN data_atendimento DATE NOT NULL AFTER posicao_fila;