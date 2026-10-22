# Sistema de Agendamento B2B & Gestão de Filas via WhatsApp

Este é o backend de uma solução B2B desenvolvida em Node.js com MySQL, criada para atender pequenos e médios estabelecimentos que trabalham com agendamentos, filas por ordem de chegada, gerenciamento de pacotes/combos e avisos automatizados via WhatsApp.

---

## Funcionalidades Principais

* **Gestão de Filas por Ordem de Chegada**: Inserção de clientes na fila diária, consulta de posição, cálculo de pessoas na frente e avanço de status do atendimento (`agendado`, `concluido`, `cancelado`).
* **Gestão de Pacotes e Combos**: Controle de créditos/sessões de clientes (ex: pacotes promocionais) com verificação automática de validade e abatimento de saldo a cada atendimento.
* **Notificações via WhatsApp (Multi-número)**: Estruturação para envio de mensagens automatizadas para confirmação de posição na fila e alertas para o próximo cliente a ser atendido. Suporta múltiplos números por empresa (arquitetura preparada para Meta Cloud API / APIs de terceiros).
* **Gestão Multi-Empresa**: Estrutura de banco de dados e rotas prontas para isolamento B2B por `empresa_id`.

---

## Tecnologias Utilizadas

* **Node.js**: Ambiente de execução JavaScript.
* **Express.js**: Framework para construção de APIs RESTful.
* **MySQL**: Banco de dados relacional (usando o driver `mysql2/promise`).
* **Axios**: Cliente HTTP para integrações com APIs externas (ex: WhatsApp API).
* **Nodemon**: Ferramenta de desenvolvimento para reload automático do servidor.

---

## Estrutura do Projeto

```text
Agendamento_BackEnd/
├── src/
│   ├── config/
│   │   └── db.js                 # Conexão com o banco de dados MySQL
│   ├── controllers/
│   │   ├── agendamentoController.js # Lógica das rotas de Fila e Atendimentos
│   │   └── pacoteController.js      # Lógica de venda e controle de pacotes
│   │   └── clienteController.js      # Lógica e controle dos clientes
│   │   └── servicoController.js      # Lógica de venda e controle dos serviços
│   ├── models/
│   │   ├── agendamentoModel.js     # Consultas SQL de agendamento e fila
│   │   └── pacoteModel.js          # Consultas SQL para gestão de pacotes
│   │   └── clienteModel.js          # Consultas SQL para gestão de clientes
│   │   └── servicoModel.js          # Consultas SQL para gestão de serviços
│   ├── routes/
│   │   ├── agendamentoRoutes.js    # Rotas de /agendamentos
│   │   └── pacoteRoutes.js         # Rotas de /pacotes
│   │   └── clienteRoutes.js         # Rotas de /cliente
│   │   └── servicoRoutes.js         # Rotas de /servicos
│   │   └── webhookRoutes.js        # Rotas do webhook
│   ├── services/
│   │   └── whatsappService.js      # Serviço de envio de notificações via WhatsApp
│   └── server.js                   # Ponto de entrada da aplicação
├── .env.example                    # Modelo de variáveis de ambiente
├── .gitignore                      # Arquivos e pastas ignorados pelo Git
└── package.json
```

---

## Configuração e Instalação

### Pró-requisitos

* **Node.js** (versão 18 ou superior)
* **MySQL Server** ativo

### Passo a Passo

1. **Clonar o Repositório**:
   ```bash
   git clone <URL_DO_SEU_REPOSITORIO>
   cd Agendamento_BackEnd
   ```

2. **Instalar Dependências**:
   ```bash
   npm install
   ```

3. **Configurar o Banco de Dados**:
   * Crie o banco de dados no MySQL e execute os scripts de criação de tabelas contidos no diretório `database/` ou na documentação do projeto.
   * Adicione as tabelas principais: `empresas`, `clientes`, `servicos`, `pacotes`, `cliente_pacotes` e `agendamentos`.

4. **Configurar Variáveis de Ambiente**:
   * Crie um arquivo `.env` na raiz do projeto com base no modelo `.env.example`:
     ```env
     PORT=3000
     DB_HOST=localhost
     DB_USER=seu_usuario
     DB_PASSWORD=sua_senha
     DB_NAME=gestao_agendamentos
     ```

5. **Iniciar o Servidor**:
   * Em modo de desenvolvimento:
     ```bash
     npm run dev
     ```
   * Em modo de produção:
     ```bash
     npm start
     ```

---

##  Rotas Principais da API
###  Agendamentos e Fila (`/agendamentos`)

* **`POST /agendamentos/fila`**
  * Entra na fila do dia (e desconta sessão de pacote caso um `cliente_pacote_id` válido seja informado).
  * **Body:**
    ```json
    {
      "empresa_id": 1,
      "cliente_id": 1,
      "servico_id": 1,
      "cliente_pacote_id": null,
      "data_atendimento": "2026-10-25"
    }
    ```

* **`GET /agendamentos/fila/:empresa_id/:data_atendimento`**
  * Lista todos os clientes na fila do dia para a empresa informada.

* **`GET /agendamentos/proximo/:empresa_id/:data_atendimento`**
  * Retorna os dados do próximo cliente a ser atendido.

* **`PATCH /agendamentos/status`**
  * Atualiza o status do agendamento (ex: `concluido`) e dispara notificação automática via WhatsApp para o próximo cliente da fila.
  * **Body:**
    ```json
    {
      "id": 1,
      "status": "concluido",
      "empresa_id": 1,
      "data_atendimento": "2026-10-25"
    }
    ```

---

###  Pacotes e Combos (`/pacotes`)

* **`POST /pacotes`**: Cadastra um modelo de pacote/combo da empresa.
* **`GET /pacotes/empresa/:empresa_id`**: Listar modelos de pacotes da empresa.
* **`POST /pacotes/vender`**: Atribui/vende um pacote a um cliente.
* **`GET /pacotes/cliente/:cliente_id`**: Consulta o saldo de sessões e a validade dos pacotes atrelados a um cliente.

---

##  Segurança e Boas Práticas

* **.gitignore**: O arquivo `.env` (contendo credenciais do MySQL) e a pasta `node_modules/` **não são versionados** por questões de segurança e otimização de repositório.
* **Variáveis de Ambiente**: Todas as credenciais de banco e serviços de mensageria usam a biblioteca `dotenv`.