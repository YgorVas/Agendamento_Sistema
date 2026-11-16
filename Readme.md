# Sistema de Agendamento B2B e Fila Diária

O painel permite cadastrar clientes, gerar senhas de atendimento e chamar, concluir ou cancelar atendimentos. A API Express grava a fila no MySQL e também gerencia serviços, pacotes e saldos de sessões. O envio de mensagens pelo WhatsApp é simulado.

## Primeira execução no Windows

Você precisa de **Node.js 18 ou superior**, **MySQL 8 em execução** e uma conta com permissão para criar o banco e as tabelas. Os comandos de terminal abaixo são para **PowerShell**. Execute os blocos SQL em um cliente MySQL, como o MySQL Workbench.

### 1. Prepare o banco

- **Instalação nova.** Abra e execute o arquivo inteiro [Projeto_Agendamento.sql](Agendamento_BD/Projeto_Agendamento.sql). Ele cria o banco `gestao_agendamentos` e as tabelas.
- **Base existente.** Faça um backup e aplique [001_fila_diaria.sql](Agendamento_BD/migrations/001_fila_diaria.sql), [002_ticket_publico.sql](Agendamento_BD/migrations/002_ticket_publico.sql) e [003_registros_atendimento.sql](Agendamento_BD/migrations/003_registros_atendimento.sql), nessa ordem, antes de atualizar o servidor. As migrações podem ser reaplicadas. Se a fila e o ticket público já estiverem configurados, basta aplicar a terceira.

Configure o backend com uma conta MySQL dedicada. Depois de criar a conta, ajuste o usuário e o host em [PERMISSÃO.sql](Agendamento_BD/PERMISSÃO.sql) e execute o script com uma conta administrativa. Ele concede `SELECT`, `INSERT` e `UPDATE` em `gestao_agendamentos`. Para uma conta que já tenha privilégios adicionais, revise as concessões existentes. A conta usada para criar ou atualizar o esquema precisa de permissões adicionais de administração do banco.

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

Gere um token com o ID obtido no passo anterior. Troque `'1'` pelo ID real. O último comando imprime a linha que você vai colar no `.env`.

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

### 5. Faça um atendimento de teste

1. Abra o [painel local](http://127.0.0.1:3000/) no navegador. Informe o **ID da empresa** e o **token do operador** e clique em **Conectar**.
2. Abra **Registrar cliente no balcão**, selecione um cliente existente ou escolha **Cadastrar novo cliente** e preencha nome e telefone.
3. Selecione o serviço **Atendimento**, deixe o pacote como **Sem pacote** e clique em **Confirmar Entrada na Fila**. A tela deve mostrar a senha do cliente.
4. Confira se o cliente apareceu na fila do painel. Clique em **Chamar Próximo** e depois em **Concluir Atendimento**.

O painel mostra a fila do dia no fuso de São Paulo e a atualiza a cada 10 segundos. Para disponibilizar o sistema em outra máquina, configure `HOST` e sirva a aplicação por HTTPS.

## Financeiro do estabelecimento

Depois de concluir um atendimento, abra **Financeiro** no painel. Os cartões mostram o valor dos serviços concluídos hoje, desde segunda-feira e desde o primeiro dia do mês, no fuso de São Paulo. Em **Histórico de serviços**, selecione dia, semana, mês ou ano e clique em **Consultar**. O gráfico de pizza mostra a participação de cada serviço no período, incluindo as sessões de pacote. O gráfico considera todos os registros do período e agrupa serviços pelo nome registrado. A tabela lista até 30 atendimentos mais recentes do período.

O sistema registra o preço do serviço avulso ou o preço total do pacote dividido pelo total de sessões. A API preserva o valor registrado na conclusão mesmo quando o preço do catálogo muda e arredonda os totais a centavos após somar. O histórico começa com as conclusões feitas após a atualização, pois os atendimentos antigos não guardavam a data da conclusão nem o valor aplicado.

## Como testar um pacote

1. Crie um modelo com `POST /pacotes`. Use, por exemplo, `{"nome":"Pacote de teste","total_sessoes":3,"preco_total":90,"dias_validade":30}`.
2. Consulte `GET /clientes/empresa/:empresa_id` para obter o ID de um cliente cadastrado. Atribua o modelo com `POST /pacotes/vender`, enviando `cliente_id` e o `pacote_id` retornado no passo anterior.
3. Em **Registrar cliente no balcão**, selecione esse cliente, o serviço e o pacote. Ao confirmar a entrada, a API desconta uma sessão. Consulte o saldo restante em `GET /pacotes/cliente/:cliente_id`.

Para atribuir o pacote pelo PowerShell, use `$api` e `$cabecalhos` do passo 4 e substitua os IDs pelos valores retornados pela API.

```powershell
$clienteId = 7
$pacoteId = 3
$corpo = @{ cliente_id = $clienteId; pacote_id = $pacoteId } | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "$api/pacotes/vender" -Headers $cabecalhos `
  -ContentType 'application/json' -Body $corpo
```

## Entrada pública e acompanhamento

No painel conectado, use **Abrir página de entrada dos clientes** para obter o link do estabelecimento, como `/fila.html?empresa=1`. O cliente informa nome e WhatsApp, escolhe um serviço e segue direto para o ticket. O uso de pacotes é registrado pela equipe no balcão.

Ao registrar pelo balcão, use **Abrir link do cliente** na confirmação para compartilhar o ticket individual. Use o endereço HTTPS do sistema quando compartilhar links fora da máquina local. O ticket mostra a posição e o andamento daquela entrada.

O painel carrega os módulos de `Agendamento_FrontEnd/assets/empresa/`. A entrada pública usa `fila-publica.mjs`, o acompanhamento usa `ticket.mjs` e as duas páginas compartilham `cliente.css`.

## Testes de integração

No PowerShell, a partir da raiz do repositório, configure a URL de uma instância MySQL reservada para testes. A conta precisa poder criar e remover o banco temporário `agendamento_test_*`. A suíte cria um nome aleatório e remove esse banco ao terminar.

```powershell
$env:TEST_MYSQL_URL = 'mysql://usuario:senha@127.0.0.1:3306'
npm.cmd --prefix Agendamento_BackEnd test
```

Sem `TEST_MYSQL_URL`, o Node informa que a suíte de integração foi pulada.

## Referência da API

As rotas do operador usam `Authorization: Bearer <token>`. Se a URL ou o corpo também contiver `empresa_id`, use o ID associado à credencial. As rotas em `/fila-publica` aceitam requisições sem credencial de operador. O acompanhamento usa a credencial do ticket.

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
| `POST /agendamentos/fila` | Recebe `cliente_id`, `servico_id`, `data_atendimento` no formato `AAAA-MM-DD` e `cliente_pacote_id` opcional. Retorna o campo `ticket` para a consulta pública. |
| `GET /fila-publica/:empresa_id/servicos` | Retorna o nome do estabelecimento e o catálogo de serviços. |
| `POST /fila-publica/:empresa_id/entradas` | Recebe `nome`, `telefone_whatsapp`, `servico_id` e um `ticket` aleatório de 64 caracteres hexadecimais gerado pela página. Registra a entrada na fila do dia e retorna a posição. Reenvie o mesmo ticket ao repetir uma requisição. |
| `GET /agendamentos/ticket` | Usa `Authorization: Bearer <ticket>`. Retorna `posicao_fila`, `status` e `pessoas_na_frente`, ou `404` se o ticket estiver ausente ou for inválido. |
| `GET /agendamentos/fila/:empresa_id/:data_atendimento` | Lista a fila do dia. |
| `GET /agendamentos/proximo/:empresa_id/:data_atendimento` | Consulta o próximo cliente da fila. |
| `PATCH /agendamentos/status` | Recebe `id` e `status`. Envie `confirmado` para iniciar, `concluido` para concluir ou `cancelado` para cancelar. |
| `GET /financeiro/resumo` | Retorna os valores e as quantidades de serviços concluídos hoje, na semana atual e no mês atual, além dos últimos 30 registros da empresa. |
| `GET /financeiro/periodo?tipo=semana&data=2026-11-09` | Retorna o intervalo, o valor total, o valor por serviço e até 30 registros recentes da empresa no período. Os tipos são `dia`, `semana`, `mes` e `ano`. Sem parâmetros, consulta o mês atual. |

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
