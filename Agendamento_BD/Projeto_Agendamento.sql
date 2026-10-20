-- 1. Criação e seleção do banco de dados
CREATE DATABASE IF NOT EXISTS gestao_agendamentos
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE gestao_agendamentos;

-- --------------------------------------------------------
-- 2. Tabela de Empresas / Estabelecimentos (Seus Clientes B2B)
-- --------------------------------------------------------
CREATE TABLE empresas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome_fantasia VARCHAR(100) NOT NULL,
    razao_social VARCHAR(100),
    cnpj VARCHAR(18) UNIQUE,
    telefone_whatsapp VARCHAR(20) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    senha_hash VARCHAR(255) NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- --------------------------------------------------------
-- 3. Tabela de Clientes Finais (Atendidos pelas Empresas)
-- --------------------------------------------------------
CREATE TABLE clientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    nome VARCHAR(100) NOT NULL,
    telefone_whatsapp VARCHAR(20) NOT NULL,
    email VARCHAR(100),
    observacoes TEXT,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- --------------------------------------------------------
-- 4. Tabela de Serviços
-- --------------------------------------------------------
CREATE TABLE servicos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    nome VARCHAR(100) NOT NULL,
    descricao TEXT,
    duracao_minutos INT NOT NULL DEFAULT 30,
    preco DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- --------------------------------------------------------
-- 5. Tabela de Pacotes / Combos
-- --------------------------------------------------------
CREATE TABLE pacotes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    nome VARCHAR(100) NOT NULL,
    descricao TEXT,
    total_sessoes INT NOT NULL,
    preco_total DECIMAL(10, 2) NOT NULL,
    dias_validade INT DEFAULT 30, -- Ex: Pacote válido por 30, 60 ou 90 dias
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- --------------------------------------------------------
-- 6. Tabela de Pacotes Comprados pelos Clientes
-- --------------------------------------------------------
CREATE TABLE cliente_pacotes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT NOT NULL,
    pacote_id INT NOT NULL,
    sessoes_restantes INT NOT NULL,
    data_compra TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_validade DATE NOT NULL,
    status ENUM('ativo', 'concluido', 'expirado') DEFAULT 'ativo',
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    FOREIGN KEY (pacote_id) REFERENCES pacotes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- --------------------------------------------------------
-- 7. Tabela de Agendamentos
-- --------------------------------------------------------
CREATE TABLE agendamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    empresa_id INT NOT NULL,
    cliente_id INT NOT NULL,
    servico_id INT,
    cliente_pacote_id INT DEFAULT NULL, -- Preenchido se for uso de um pacote/combo
    data_hora DATETIME NOT NULL,
    status ENUM('agendado', 'confirmado', 'concluido', 'cancelado') DEFAULT 'agendado',
    lembrete_enviado BOOLEAN DEFAULT FALSE,
    data_envio_lembrete DATETIME NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    FOREIGN KEY (servico_id) REFERENCES servicos(id) ON DELETE SET NULL,
    FOREIGN KEY (cliente_pacote_id) REFERENCES cliente_pacotes(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- --------------------------------------------------------
-- 8. Índices de Desempenho (Essenciais para buscas rápidas)
-- --------------------------------------------------------
-- Otimiza a busca de agendamentos pendentes de envio de lembrete
CREATE INDEX idx_agendamento_lembrete ON agendamentos (status, lembrete_enviado, data_hora);

-- Otimiza a busca de agendamentos por empresa e data
CREATE INDEX idx_agendamento_empresa_data ON agendamentos (empresa_id, data_hora);

-- Otimiza a verificação de pacotes ativos
CREATE INDEX idx_pacotes_status_validade ON cliente_pacotes (cliente_id, status, data_validade);
