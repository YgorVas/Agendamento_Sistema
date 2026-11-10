# Sistema de Agendamento B2B e Fila Diária

O painel permite cadastrar clientes, gerar senhas de atendimento e chamar, concluir ou cancelar atendimentos. A API Express grava a fila no MySQL e também gerencia serviços, pacotes e saldos de sessões. O envio de mensagens pelo WhatsApp é simulado.

## Primeira execução no Windows

Você precisa de **Node.js 18 ou superior**, **MySQL 8 em execução** e uma conta com permissão para criar o banco e as tabelas. Os comandos de terminal abaixo são para **PowerShell**. Execute os blocos SQL em um cliente MySQL, como o MySQL Workbench.

### 1. Prepare o banco

- **Instalação nova.** Abra e execute o arquivo inteiro [Projeto_Agendamento.sql](Agendamento_BD/Projeto_Agendamento.sql). Ele cria o banco `gestao_agendamentos` e as tabelas.
- **Base existente.** Faça um backup e execute [Testes.sql](Agendamento_BD/Testes.sql). Apesar do nome, esse arquivo é a migração da fila. Ele adiciona as colunas e o índice necessários quando estão ausentes e preenche datas vazias a partir de `data_hora`.

Configure o backend com uma conta MySQL que tenha `SELECT`, `INSERT` e `UPDATE` em `gestao_agendamentos`. A conta usada para criar ou atualizar o esquema precisa de permissões adicionais de administração do banco.

### 2. Identifique a empresa que vai usar o painel

Se a empresa já existe, consulte seu ID.

```sql
USE gestao_agendamentos;
SELECT id, nome_fantasia FROM empresas ORDER BY id;
```

Se a base acabou de ser criada e está vazia, cadastre uma empresa de demonstração. Execute todo o bloco na mesma conexão para obter o ID gerado pelo MySQL.

```sql
USE gestao_agendamentos;

INSERT INTO empresas (nome_fantasia, telefone_whatsapp, email, senha_hash)
VALUES ('Empresa Demo', '11900000000', 'demo@example.invalid', 'demo-sem-login');

SELECT LAST_INSERT_ID() AS empresa_id;
```

O campo `senha_hash` é obrigatório no esquema. O valor acima serve apenas para o cadastro fictício local. A autenticação do painel usa o token gerado no próximo passo.

### 3. Instale o backend e configure o token

Abra o PowerShell na raiz do repositório e execute os comandos abaixo.

```powershell
cd Agendamento_BackEnd
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

<<<<<<< HEAD
Gere um token com o ID obtido no passo anterior. Troque `'1'` pelo ID real. O último comando imprime a linha que você vai colar no `.env`.
=======
4. **Configurar Variáveis de Ambiente**:
   * Crie um arquivo `.env` na raiz do projeto com base no modelo `.env.example`:
     ```env
     PORT=3000
     DB_HOST=localhost
     DB_USER=seu_usuario
     DB_PASSWORD=sua_senha
     DB_NAME=gestao_agendamentos
     WEBHOOK_VERIFY_TOKEN=senha
     ```
>>>>>>> ccff8e527ea5c8a1b854cdb1bca90d09b03b483b

```powershell
$empresaId = '1'
$tokenEmpresa = node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
$configEmpresa = @{}
$configEmpresa[$empresaId] = $tokenEmpresa
"EMPRESA_TOKENS=$($configEmpresa | ConvertTo-Json -Compress)"
```

Abra `Agendamento_BackEnd/.env` e ajuste estas variáveis.

| Variável | Valor |
|---|---|
| `DB_HOST` | Endereço do MySQL. Use `localhost` para o banco na mesma máquina. |
| `DB_USER` e `DB_PASSWORD` | Usuário e senha da conta MySQL que o backend vai usar. |
| `DB_NAME` | `gestao_agendamentos`, o nome criado pelo script. |
| `EMPRESA_TOKENS` | Substitua a linha inteira pela saída do PowerShell. Em uma configuração existente, preserve as outras entradas do objeto JSON. Cada empresa deve ter um token diferente. |
| `HOST` e `PORT` | Use `127.0.0.1` e `3000` para seguir os exemplos deste guia. |
| `WEBHOOK_VERIFY_TOKEN` | Pode ficar vazio durante o teste local. |

Guarde o token para conectar o painel e fazer as chamadas da API. Ele dá acesso de operador à empresa. Mantenha o `.env` fora do Git.

### 4. Inicie o servidor e cadastre um serviço

Ainda em `Agendamento_BackEnd`, execute `npm start` e mantenha esse terminal aberto. Para desenvolver com reinício automático, use `npm run dev`.

Em outro PowerShell, informe o mesmo token para testar a conexão e cadastrar o serviço **Atendimento**. Se a empresa já tiver um serviço, pule o segundo comando `Invoke-RestMethod`.

```powershell
$tokenEmpresa = Read-Host 'Token da empresa' -MaskInput
$api = 'http://127.0.0.1:3000'
$cabecalhos = @{ Authorization = "Bearer $tokenEmpresa" }

Invoke-RestMethod -Uri "$api/testar-conexao" -Headers $cabecalhos

Invoke-RestMethod -Method Post -Uri "$api/servicos" -Headers $cabecalhos `
  -ContentType 'application/json' `
  -Body '{"nome":"Atendimento","duracao_minutos":30,"preco":40}'
```

O teste de conexão retorna `testeDoBanco: 2`. O cadastro retorna o ID do serviço em `servico_id`.

> Em versões do PowerShell anteriores à 7.2, remova `-MaskInput` do comando `Read-Host` se o parâmetro estiver indisponível.

<<<<<<< HEAD
### 5. Faça um atendimento de teste

1. Abra o [painel local](http://127.0.0.1:3000/) no navegador. Informe o **ID da empresa** e o **token do operador** e clique em **Conectar**.
2. Na aba **Atender cliente**, selecione um cliente existente ou escolha **Cadastrar novo cliente** e preencha nome e telefone.
3. Selecione o serviço **Atendimento**, deixe o pacote como **Sem pacote** e clique em **Confirmar Entrada na Fila**. A tela deve mostrar a senha do cliente.
4. Na aba **Painel Empresa**, confirme que o cliente apareceu. Clique em **Chamar Próximo** e depois em **Concluir Atendimento**.

O painel mostra a fila do dia no fuso de São Paulo e a atualiza a cada 10 segundos. As duas abas usam a mesma credencial de operador e são destinadas à equipe. Para disponibilizar o painel em outra máquina, configure `HOST` e sirva a aplicação por HTTPS.

## Como testar um pacote

1. Crie um modelo com `POST /pacotes`. Use, por exemplo, `{"nome":"Pacote de teste","total_sessoes":3,"preco_total":90,"dias_validade":30}`.
2. Consulte `GET /clientes/empresa/:empresa_id` para obter o ID de um cliente cadastrado. Atribua o modelo com `POST /pacotes/vender`, enviando `cliente_id` e o `pacote_id` retornado no passo anterior.
3. Na aba **Atender cliente**, selecione esse cliente, o serviço e o pacote. Ao confirmar a entrada, a API desconta uma sessão. Consulte o saldo restante em `GET /pacotes/cliente/:cliente_id`.

## Referência da API

Envie `Authorization: Bearer <token>` nas rotas abaixo. A empresa vem do token. Se a URL ou o corpo também contiver `empresa_id`, use o ID associado à credencial.

| Método e rota | Uso |
|---|---|
| `GET /testar-conexao` | Testa a conexão MySQL. |
| `POST /clientes` | Cadastra cliente com `nome` e `telefone_whatsapp`. |
| `GET /clientes/empresa/:empresa_id` | Lista clientes da empresa. |
| `POST /servicos` | Cadastra serviço com `nome`, `duracao_minutos` e `preco`. |
| `GET /servicos/empresa/:empresa_id` | Lista serviços da empresa. |
| `POST /pacotes` | Cadastra modelo com `nome`, `total_sessoes`, `preco_total` e `dias_validade` opcional. |
| `GET /pacotes/empresa/:empresa_id` | Lista os modelos de pacotes. |
| `POST /pacotes/vender` | Atribui um `pacote_id` ao `cliente_id`. |
| `GET /pacotes/cliente/:cliente_id` | Consulta saldo e validade dos pacotes do cliente. |
| `POST /agendamentos/fila` | Recebe `cliente_id`, `servico_id`, `data_atendimento` no formato `AAAA-MM-DD` e `cliente_pacote_id` opcional. |
| `GET /agendamentos/fila/:empresa_id/:data_atendimento` | Lista a fila do dia. |
| `GET /agendamentos/proximo/:empresa_id/:data_atendimento` | Consulta o próximo cliente da fila. |
| `PATCH /agendamentos/status` | Recebe `id` e `status`. Envie `confirmado` para iniciar, `concluido` para concluir ou `cancelado` para cancelar. |

A API permite um atendimento em andamento por empresa e dia. O endpoint público `GET /api/webhook/whatsapp` faz a verificação inicial do webhook quando `WEBHOOK_VERIFY_TOKEN` está configurado.

## Problemas comuns

| Sintoma | O que conferir |
|---|---|
| O painel não abre | Confirme que `npm start` continua rodando e que a URL usa a porta configurada no `.env`. Abra o endereço do servidor no navegador. |
| `401` ao conectar | Confirme que o token digitado é o mesmo da linha `EMPRESA_TOKENS` e reinicie o servidor se alterou o `.env`. |
| `403` ao conectar | Confira se o ID informado corresponde à chave associada ao token no JSON. |
| `500` em `/testar-conexao` | Verifique se o MySQL está rodando e revise `DB_HOST`, `DB_USER`, `DB_PASSWORD` e `DB_NAME`. |
| A fila falha em uma base antiga | Confira se `agendamentos` tem as colunas `posicao_fila` e `data_atendimento`. Se estiverem ausentes, aplique a migração do primeiro passo. |
| A lista de serviços está vazia | Cadastre um serviço com o token da empresa conectada e reconecte o painel. |
=======
* **.gitignore**: O arquivo `.env` (contendo credenciais do MySQL) e a pasta `node_modules/` **não são versionados** por questões de segurança e otimização de repositório.
* **Variáveis de Ambiente**: Todas as credenciais de banco e serviços de mensageria usam a biblioteca `dotenv`.
>>>>>>> ccff8e527ea5c8a1b854cdb1bca90d09b03b483b
