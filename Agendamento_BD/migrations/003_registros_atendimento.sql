USE gestao_agendamentos;

CREATE TABLE IF NOT EXISTS registros_atendimento (
    agendamento_id INT PRIMARY KEY,
    empresa_id INT NOT NULL,
    cliente_nome VARCHAR(100) NOT NULL,
    servico_nome VARCHAR(100) NOT NULL,
    pacote_nome VARCHAR(100) NULL,
    valor DECIMAL(28, 18) NOT NULL,
    data_conclusao DATE NOT NULL,
    concluido_em_utc DATETIME(3) NOT NULL,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    INDEX idx_registros_empresa_data (empresa_id, data_conclusao, concluido_em_utc, agendamento_id)
) ENGINE=InnoDB;
