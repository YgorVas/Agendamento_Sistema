# Sistema de Agendamento B2B e Fila Diária

O painel permite cadastrar clientes, gerar senhas de atendimento e chamar, concluir ou cancelar atendimentos. O repositório inclui uma aplicação Next.js com PostgreSQL em `nextjs-app` e uma aplicação Express com MySQL em `Agendamento_BackEnd`.

## Next.js e PostgreSQL no Windows

Você precisa de **Node.js 20.9 ou superior** e do **Docker Desktop com Docker Compose**. Abra o Docker Desktop e, no PowerShell, execute os comandos a seguir a partir da raiz do repositório.

### Primeira execução

```powershell
cd nextjs-app
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
notepad .env
```

Use a `DATABASE_URL` do [arquivo de exemplo](nextjs-app/.env.example) para conectar ao PostgreSQL do Docker em `127.0.0.1:5433`. Se o `.env` local ainda aponta para a configuração antiga do Compose na porta 5432, atualize essa linha. Em `AUTH_SECRET`, cole o valor gerado pelo comando do Node.js. Se você já configurou um segredo, mantenha o valor existente. As variáveis do WhatsApp são opcionais. Mantenha o `.env` fora do Git.

Salve o arquivo e execute:

```powershell
docker compose up --wait postgres
npm.cmd ci --ignore-scripts
npm.cmd run db:push
npm.cmd run dev -- --webpack
```

O `db:push` cria as tabelas no banco local. O comando de desenvolvimento usa Webpack para contornar uma falha de compilação de CSS observada com o Turbopack no Windows. Deixe o terminal aberto, gere um convite conforme as instruções abaixo, acesse o [login local](http://localhost:3000/login) e escolha **Cadastrar empresa com convite**. O PostgreSQL começa com uma base própria. Para usar dados existentes do MySQL, é preciso migrá-los separadamente.

Para testar com dados de demonstração, execute `npm.cmd run db:seed` em outro terminal na pasta `nextjs-app`. O comando mostra a senha da conta `demo-admin@example.invalid`.

### Execuções seguintes

Com o Docker Desktop aberto, rode estes comandos na pasta `nextjs-app`:

```powershell
docker compose up --wait postgres
npm.cmd run dev -- --webpack
```

Os dados ficam no volume do PostgreSQL. Repita `npm.cmd ci --ignore-scripts` quando as dependências mudarem e `npm.cmd run db:push` quando o esquema do banco mudar.

### Operação do piloto no Next.js

Execute os comandos na pasta `nextjs-app`. Em um banco novo ou já gerenciado pelas migrações do Drizzle, aplique `npm.cmd run db:migrate` antes de publicar. Se a base foi criada com `db:push`, siga esse mesmo fluxo no ambiente de desenvolvimento. Para uma base com dados reais criada dessa forma, valide primeiro a correspondência entre o esquema existente e o histórico versionado em uma cópia da base.

**Convites.** Gere um código para o e-mail com que o dono vai cadastrar a loja. Para **Criar outra empresa** pelo painel, use o tipo `nova-loja` com o e-mail da nova loja. Entregue o código em canal privado. Ele vale 72 horas e só pode ser usado uma vez.

```powershell
npm.cmd run pilot -- convidar dono@exemplo.com
npm.cmd run pilot -- convidar filial@exemplo.com nova-loja
```

**Recuperação de acesso.** Configure `PILOT_SUPPORT_EMAIL` com o endereço que deve aparecer em **Esqueci minha senha**. Confirme a identidade do solicitante e entregue o código por um canal já verificado com o titular. A recuperação usa o e-mail da conta de login. O código é de uso único, expira em 30 minutos e substitui qualquer código anterior da conta. A redefinição invalida as sessões anteriores.

```powershell
npm.cmd run pilot -- recuperar dono@exemplo.com
```

**Solicitações de dados.** Em **Clientes**, um administrador seleciona o cadastro, solicita **Exportação de dados** ou **Exclusão de dados** e acompanha o protocolo no histórico da loja. O suporte deve consultar as pendências, confirmar a autorização para tratá-las e conferir os IDs do cliente e da loja antes de acessar dados. Para exportação, revise os dados cadastrais, os atendimentos, os pacotes e os registros de serviços associados e entregue o arquivo por um canal privado. Para exclusão, revise primeiro os vínculos e a retenção aplicável. A remoção direta da linha do cliente no banco também remove dados relacionados em cascata, incluindo registros que compõem o financeiro. Registre o resultado após concluir a análise e atender ou recusar o pedido.

```powershell
npm.cmd run pilot -- solicitacoes
npm.cmd run pilot -- resolver 123 atendida
```

**Limites de requisições.** O PostgreSQL compartilha os contadores entre instâncias. O login aceita 30 tentativas por origem e 20 por e-mail a cada 15 minutos, o cadastro aceita 10 por origem por hora e a entrada pública aceita 60 por origem a cada 15 minutos. A recuperação aceita 15 por origem a cada 15 minutos. O servidor retorna `429` e `Retry-After` ao atingir um limite. Em produção, configure `TRUSTED_CLIENT_IP_HEADER` somente quando o proxy confiável substituir esse cabeçalho por um único IP e o backend não aceitar conexões diretas da internet. Sem um IP confiável, as requisições compartilham o limite da operação. Rode `npm.cmd run pilot -- limpar-expirados` periodicamente para remover contadores e códigos vencidos.

**Teste de integração.** Use uma instância isolada do Next.js com `TRUSTED_CLIENT_IP_HEADER=x-real-ip` e um PostgreSQL descartável com as migrações aplicadas. Aponte `PILOT_TEST_BASE_URL` e `PILOT_TEST_DATABASE_URL` para essa instância e rode `npm.cmd run test:pilot`. O teste cria lojas e clientes fictícios na base indicada.

### Usar um pacote durante o atendimento

Na aba **Fila** do painel, clique em **Chamar Próximo**. Em **Em Atendimento**, selecione um pacote válido do cliente para cada serviço compatível ou mantenha **Sem pacote**. Ao clicar em **Concluir Atendimento**, o sistema desconta uma sessão de cada pacote escolhido e registra a cobertura no financeiro. Os pacotes já descontados no balcão aparecem como **Pacote registrado**.

Podemos adicionar à fila pública a opção **Usar meu pacote nos serviços que ele cobre**. Após verificar o número do cliente com um código, o sistema poderá mostrar os serviços cobertos e descontar as sessões automaticamente ao concluir o atendimento.

## Express e MySQL no Windows

A API Express grava a fila no MySQL e também gerencia serviços, pacotes e saldos de sessões. O chatbot pode ser conectado à WhatsApp Cloud API. Os avisos automáticos ao próximo cliente são simulados.

Você precisa de **Node.js 18 ou superior**, **MySQL 8 em execução** e uma conta com permissão para criar o banco e as tabelas. Os comandos de terminal abaixo são para **PowerShell**. Execute os blocos SQL em um cliente MySQL, como o MySQL Workbench.

### 1. Prepare o banco

- **Instalação nova.** Abra e execute o arquivo inteiro [Projeto_Agendamento.sql](Agendamento_BD/Projeto_Agendamento.sql). Ele cria o banco `gestao_agendamentos` e as tabelas.
- **Base existente.** Faça um backup e aplique as migrações pendentes em ordem numérica, até [006_financeiro_por_servico.sql](Agendamento_BD/migrations/006_financeiro_por_servico.sql), antes de atualizar o servidor. As migrações podem ser reaplicadas.

Configure o backend com uma conta MySQL dedicada. Depois de criar a conta, ajuste o usuário e o host em [PERMISSÃO.sql](Agendamento_BD/PERMISSÃO.sql) e execute o script com uma conta administrativa. Ele concede `SELECT`, `INSERT` e `UPDATE` em `gestao_agendamentos`. Para uma conta que já tenha privilégios adicionais, revise as concessões existentes. A conta usada para criar ou atualizar o esquema precisa de permissões adicionais de administração do banco.

### 2. Configure o backend

Abra o PowerShell na raiz do repositório.

```powershell
cd Agendamento_BackEnd
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

No `.env`, ajuste `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` e `DB_NAME`. Cole o segredo gerado em `AUTH_JWT_SECRET`. Mantenha `HOST=127.0.0.1` e `PORT=3000` para o teste local. O envio de WhatsApp é simulado e `WEBHOOK_VERIFY_TOKEN` pode ficar vazio. Mantenha o `.env` fora do Git.

### 3. Cadastre uma empresa e prepare a conta de teste

Acesse `/login` e escolha **Cadastrar minha empresa** para criar a empresa e sua conta administradora. O e-mail deve estar disponível e a senha deve ter pelo menos oito caracteres. Depois do cadastro, o painel é aberto automaticamente. Os blocos SQL abaixo são uma alternativa para preparar contas de teste manualmente.

Após preparar o banco, abra uma conexão no MySQL Workbench e selecione o banco definido em `DB_NAME`. Os exemplos abaixo usam `gestao_agendamentos`. O cadastro da empresa fica em `empresas`, a conta usada para entrar no painel fica em `usuarios` e o acesso a cada loja fica em `usuario_comercios`.

#### Cadastre o estabelecimento

Execute o bloco abaixo no editor SQL do Workbench. Ajuste o nome, o WhatsApp e o e-mail para a empresa de teste. Use um e-mail diferente para cada empresa.

```sql
USE gestao_agendamentos;

INSERT INTO empresas (nome_fantasia, telefone_whatsapp, email, senha_hash, ativo)
VALUES ('Empresa Teste Centro', '5511000000001', 'empresa-centro@example.invalid', 'demo-sem-login', TRUE);

SET @empresa_teste_id = LAST_INSERT_ID();
SELECT @empresa_teste_id AS empresa_id;
```

Mantenha a mesma conexão SQL aberta para os próximos blocos. A variável `@empresa_teste_id` guarda o ID gerado para o vínculo com o operador. O campo `ativo = TRUE` permite acessar a loja. A tabela `empresas` ainda exige `senha_hash`, por isso o exemplo preenche esse campo com `demo-sem-login`. O login do painel valida a senha bcrypt da conta em `usuarios`.

Para usar uma empresa já cadastrada, consulte as lojas e substitua `<ID_DA_EMPRESA>` pelo ID escolhido.

```sql
SELECT id, nome_fantasia FROM empresas WHERE ativo = TRUE ORDER BY id;
SET @empresa_teste_id = <ID_DA_EMPRESA>;
```

#### Crie a conta e vincule o administrador

Gere um hash bcrypt da senha de teste com `bcryptjs` no diretório do backend. No PowerShell 7.2 ou superior, use os comandos abaixo e guarde o hash retornado.

```powershell
$env:AGENDAMENTO_SENHA_TESTE = Read-Host 'Senha de teste' -MaskInput
try {
    node -e "const senha = process.env.AGENDAMENTO_SENHA_TESTE; if (!senha || Buffer.byteLength(senha) > 72) throw Error('Use uma senha de até 72 bytes'); console.log(require('bcryptjs').hashSync(senha, 12))"
} finally {
    Remove-Item Env:AGENDAMENTO_SENHA_TESTE
}
```

Volte à mesma conexão no Workbench. Substitua `<HASH_BCRYPT>` pelo hash gerado e escolha um e-mail de operador ainda disponível. Execute o bloco inteiro para criar a conta e vinculá-la à empresa selecionada.

```sql
USE gestao_agendamentos;

START TRANSACTION;

INSERT INTO usuarios (nome, email, senha_hash)
VALUES ('Operador Demo', 'operador@example.invalid', '<HASH_BCRYPT>');

SET @operador_teste_id = LAST_INSERT_ID();

INSERT INTO usuario_comercios (usuario_id, empresa_id, cargo)
VALUES (@operador_teste_id, @empresa_teste_id, 'ADMIN');

COMMIT;

SELECT u.email, e.nome_fantasia, uc.cargo, e.ativo
FROM usuario_comercios uc
JOIN usuarios u ON u.id = uc.usuario_id
JOIN empresas e ON e.id = uc.empresa_id
WHERE u.id = @operador_teste_id;
```

Se ocorrer um erro antes do `COMMIT`, execute `ROLLBACK;` e corrija os dados antes de repetir o cadastro. Para entrar em `/login`, informe `operador@example.invalid` e a senha digitada no PowerShell ao gerar o hash.

Para vincular uma conta já existente, consulte seu ID e execute apenas o vínculo com a empresa selecionada.

```sql
SELECT id, nome, email FROM usuarios ORDER BY nome;
SET @operador_teste_id = <ID_DO_USUARIO>;

INSERT INTO usuario_comercios (usuario_id, empresa_id, cargo)
VALUES (@operador_teste_id, @empresa_teste_id, 'ADMIN');
```

Cada usuário tem um vínculo por empresa. O cargo `ADMIN` permite usar o painel completo. `GERENTE` também acessa catálogo e financeiro, e `CAIXA` opera o atendimento, os clientes e os pacotes de clientes.

#### Adicione uma segunda loja para testar a troca

Na mesma conexão SQL, depois de definir `@operador_teste_id`, execute o bloco abaixo. Ele cria uma segunda empresa e concede acesso à mesma conta.

```sql
INSERT INTO empresas (nome_fantasia, telefone_whatsapp, email, senha_hash, ativo)
VALUES ('Empresa Teste Jardins', '5511000000002', 'empresa-jardins@example.invalid', 'demo-sem-login', TRUE);

SET @segunda_empresa_id = LAST_INSERT_ID();

INSERT INTO usuario_comercios (usuario_id, empresa_id, cargo)
VALUES (@operador_teste_id, @segunda_empresa_id, 'ADMIN');
```

Entre novamente no painel para escolher a loja. Cadastre um serviço e um cliente em cada uma e use **Trocar de Loja** para conferir os dados de cada estabelecimento. Para gerar duas lojas com esses cadastros automaticamente, siga a seção **Preparar dados de demonstração**.

### 4. Faça um atendimento de teste

1. Execute `npm start` no backend e abra o [login local](http://127.0.0.1:3000/login). Entre com o e-mail e a senha cadastrados. Se a conta tiver mais de uma loja ativa, escolha uma delas.
2. Em **Serviços e pacotes**, cadastre um serviço, por exemplo, **Atendimento**. Depois, abra **Registrar cliente no balcão**, cadastre ou selecione um cliente e escolha esse serviço.
3. Clique em **Confirmar Entrada na Fila**. Em **Fila**, confira se o cliente apareceu, clique em **Chamar Próximo** e depois em **Concluir Atendimento**.
4. Abra **Financeiro** para conferir o lançamento. Use **Trocar de Loja** para mudar de estabelecimento, se houver outro vínculo ativo.

O painel mostra a fila do dia no fuso de São Paulo e a atualiza a cada 10 segundos. Para disponibilizar o sistema em outra máquina, configure `HOST` e sirva a aplicação por HTTPS.

### Preparar dados de demonstração

Com o banco indicado em `DB_NAME` criado e o `.env` configurado, execute `npm run demo` no backend usando uma conta MySQL com permissão de migração. O comando prepara as tabelas de uma base vazia, aplica as migrações e cria **Demo Centro** e **Demo Jardins**, cada uma com cliente, serviço e pacote próprios. A conta `demo-admin@example.invalid` recebe acesso administrativo às duas lojas.

Na primeira execução, o terminal exibe a senha aleatória gerada. Guarde-a para entregar ao testador. Para definir a senha inicial, configure `DEMO_PASSWORD` no ambiente antes de executar. As execuções seguintes preservam as credenciais e os registros já existentes, sem duplicar os cadastros da demonstração.

Entre em `/login`, escolha uma das lojas e use **Trocar de Loja** para conferir os diferentes cadastros.

### Link temporário de demonstração

Com o servidor local em execução na porta 3000, instale o `cloudflared` pelo PowerShell, caso ainda não esteja instalado:

```powershell
winget install --id Cloudflare.cloudflared --exact --accept-package-agreements --accept-source-agreements
```

Após a instalação, feche e abra novamente o PowerShell para atualizar o caminho dos programas. Em seguida, abra o túnel temporário:

```powershell
cloudflared tunnel --url http://127.0.0.1:3000 --protocol http2 --no-autoupdate
```

Se o comando `cloudflared` não for reconhecido, confira se a instalação terminou com sucesso e se o PowerShell foi reaberto. Mantenha o backend em execução em outro terminal.

Abra o endereço HTTPS exibido no terminal, acrescentando `/login`, e compartilhe o link e as credenciais de demonstração com o testador. Mantenha o computador, o servidor e o túnel em execução durante o teste. O encerramento do túnel desativa o link, e uma nova execução gera outro endereço. Consulte as [instruções oficiais da Cloudflare](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## Financeiro do estabelecimento

Depois de concluir um atendimento, abra **Financeiro** no painel. Os cartões mostram o valor e a quantidade de serviços concluídos hoje, desde segunda-feira e desde o primeiro dia do mês, no fuso de São Paulo. Em **Histórico de serviços**, selecione dia, semana, mês ou ano e clique em **Consultar**. O gráfico de pizza mostra a participação de cada serviço no período, incluindo as sessões de pacote. O gráfico considera todos os registros do período e agrupa serviços pelo nome registrado. A tabela lista até 30 serviços concluídos mais recentemente, com uma linha por serviço da entrada.

Clique em **Exportar PDF** e escolha **Salvar como PDF** no diálogo do navegador. O relatório inclui o intervalo consultado, o total, o gráfico com a legenda e a tabela exibida no Histórico.

O sistema registra o preço do serviço avulso ou o preço total do pacote dividido pelo total de sessões. A API preserva o valor registrado na conclusão mesmo quando o preço do catálogo muda e arredonda os totais a centavos após somar. O histórico começa com as conclusões feitas após a atualização, pois os atendimentos antigos não guardavam a data da conclusão nem o valor aplicado.

## Como testar um pacote

1. Em **Serviços e pacotes**, crie um pacote de teste com uma conta `ADMIN` ou `GERENTE` e selecione o serviço que ele cobre.
2. Na mesma tela, em **Atribuir pacote a cliente**, selecione um cliente cadastrado e um modelo de pacote. Clique em **Atribuir pacote**. O painel confirma o saldo inicial de sessões e o prazo de validade.
3. Em **Registrar cliente no balcão**, escolha o cliente e adicione os serviços que serão feitos na mesma senha. Para cada serviço, escolha um pacote compatível ou mantenha **Sem pacote**. A entrada desconta uma sessão de cada pacote selecionado. A rota `GET /pacotes/cliente/:cliente_id` retorna os saldos restantes.
4. Volte a **Serviços e pacotes**, selecione o cliente e confira **Saldo de pacotes do cliente**. O cancelamento antes do início devolve todas as sessões descontadas e conserva a validade original. Após o início, as sessões seguem consumidas.

Pacotes cadastrados antes do vínculo com serviços precisam ser associados ao serviço correspondente para aparecerem no balcão.

## Entrada pública e acompanhamento

No painel conectado, use **Abrir página de entrada dos clientes** para obter o link do estabelecimento, como `/fila.html?empresa=1`. A entrada pública e o cadastro de clientes no balcão exigem nome e sobrenome em campos separados e um WhatsApp no formato `82 988887777`. O sistema salva o telefone de novos clientes apenas com dígitos. Cadastros existentes na mesma empresa são encontrados pelo telefone, ignorando pontuação e o prefixo brasileiro 55. O nome cadastrado é preservado. Na entrada pública, o cliente escolhe um ou mais serviços e recebe um único ticket. A equipe registra o uso de pacotes no balcão.

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

O painel em `/` e `/dashboard` usa o login em `/login`. Nas rotas autenticadas, envie `Authorization: Bearer <token>`. A loja é definida pelo JWT de acesso. As rotas de gerenciamento de catálogo e financeiro exigem `ADMIN` ou `GERENTE`. `CAIXA` pode atender na fila, cadastrar clientes e operar pacotes de clientes. O catálogo público da fila usa o endereço da loja e o acompanhamento usa a credencial do ticket.

1. Envie `{ "email": "operador@exemplo.com", "senha": "..." }` para `POST /auth/login`. Com um comércio ativo, a resposta inclui `token`, `comercioId` e `cargo`. Com vários, inclui `tokenTemporario` e `comercios`.
2. Quando houver seleção, envie `{ "comercioId": 1 }` para `POST /auth/selecionar-comercio` com `Authorization: Bearer <tokenTemporario>`. O token temporário expira em 5 minutos.
3. Chame `GET /servicos` com `Authorization: Bearer <token>`. O token de acesso expira em 1 hora. O servidor confere o vínculo, o cargo e a situação do comércio a cada chamada.

| Método e rota | Uso |
|---|---|
| `POST /auth/login` | Valida e-mail e senha e inicia o acesso a um comércio ativo. |
| `POST /auth/selecionar-comercio` | Troca o token temporário por um JWT vinculado ao comércio escolhido. |
| `GET /auth/comercios` | Lista os vínculos ativos do usuário e identifica a loja atual. |
| `POST /auth/iniciar-selecao` | Gera um token temporário para trocar de loja a partir de uma sessão válida. |
| `GET /servicos` | Lista os serviços do comércio associado ao JWT de acesso. |
| `GET /testar-conexao` | Testa a conexão MySQL. |
| `POST /clientes` | Cadastra cliente com `nome`, `sobrenome` e `telefone_whatsapp` no formato `82 988887777`. |
| `GET /clientes` | Lista clientes da empresa. |
| `POST /servicos` | Cadastra serviço com `nome`, `duracao_minutos` e `preco`. |
| `POST /pacotes` | Cadastra modelo com `servico_id`, `nome`, `total_sessoes`, `preco_total` e `dias_validade` opcional. |
| `GET /pacotes` | Lista os modelos de pacotes. |
| `POST /pacotes/vender` | Atribui um `pacote_id` ao `cliente_id`. |
| `GET /pacotes/cliente/:cliente_id` | Consulta saldo e validade dos pacotes do cliente. |
| `POST /agendamentos/fila` | Recebe `cliente_id`, `data_atendimento` no formato `AAAA-MM-DD` e `servicos`, uma lista de objetos com `servico_id` e `cliente_pacote_id` opcional. Também aceita o formato anterior com um serviço no corpo. Retorna `ticket` para a consulta pública. |
| `GET /fila-publica/:empresa_id/servicos` | Retorna o nome do estabelecimento e o catálogo de serviços. |
| `POST /fila-publica/:empresa_id/entradas` | Recebe `nome`, `sobrenome`, `telefone_whatsapp` no formato `82 988887777`, `servico_ids` (ou um `servico_id`) e um `ticket` aleatório de 64 caracteres hexadecimais gerado pela página. Retorna a posição na fila do dia. Reenvie o mesmo ticket ao repetir uma requisição. |
| `GET /agendamentos/ticket` | Usa `Authorization: Bearer <ticket>`. Retorna `posicao_fila`, `status` e `pessoas_na_frente`, ou `404` se o ticket estiver ausente ou for inválido. |
| `GET /agendamentos/fila/:data_atendimento` | Lista a fila do dia com os serviços e a duração total de cada entrada. |
| `GET /agendamentos/proximo/:data_atendimento` | Consulta o próximo cliente da fila e seus serviços. |
| `PATCH /agendamentos/status` | Recebe `id` e `status`. Envie `confirmado` para iniciar, `concluido` para concluir ou `cancelado` para cancelar. |
| `GET /financeiro/resumo` | Retorna os valores e as quantidades de serviços concluídos hoje, na semana atual e no mês atual, além dos últimos 30 registros da empresa. |
| `GET /financeiro/periodo?tipo=semana&data=2026-11-09` | Retorna o intervalo, o valor total, o valor por serviço e até 30 registros recentes da empresa no período. Os tipos são `dia`, `semana`, `mes` e `ano`. Sem parâmetros, consulta o mês atual. |

A fila aceita uma entrada ativa por cliente, empresa e dia, somando balcão e página pública. Uma segunda tentativa no mesmo dia retorna `409` enquanto a entrada estiver aguardando ou em atendimento. Depois de concluir ou cancelar, o cliente pode entrar novamente no mesmo dia. A API permite um atendimento em andamento por empresa e dia. O endpoint público `GET /api/webhook/whatsapp` faz a verificação inicial do webhook quando `WEBHOOK_VERIFY_TOKEN` está configurado.

## Problemas comuns

| Sintoma | O que conferir |
|---|---|
| O painel não abre | Confirme que `npm start` continua rodando e que a URL usa a porta configurada no `.env`. Abra o endereço do servidor no navegador. |
| `401` ao conectar | Confira o e-mail e a senha. Se a sessão expirou, entre novamente. |
| `403` ao conectar | Confira o vínculo, o cargo do operador e se a loja está ativa. |
| `500` em `/testar-conexao` | Verifique se o MySQL está rodando e revise `DB_HOST`, `DB_USER`, `DB_PASSWORD` e `DB_NAME`. |
| A fila falha em uma base antiga | Confira se `agendamentos` tem as colunas `posicao_fila` e `data_atendimento`. Se estiverem ausentes, aplique a migração do primeiro passo. |
| A lista de serviços está vazia | Cadastre um serviço em **Serviços e pacotes** com uma conta de gestão. |


## Chatbot no WhatsApp

Para uma instância vinculada a uma única empresa, configure no `.env` `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_EMPRESA_ID`, `WHATSAPP_API_VERSION` (por exemplo, a versão configurada na Meta), `PUBLIC_BASE_URL` (endereço HTTPS público) e `WEBHOOK_VERIFY_TOKEN`. Configure na Meta o webhook HTTPS `/api/webhook/whatsapp` e assine eventos de mensagens. A assinatura das notificações é validada com o segredo do aplicativo. Uma mensagem de texto recebida retorna o link de entrada; se o número já tiver uma entrada ativa hoje, a resposta também informa a senha e quantas pessoas estão à frente. O número cadastrado deve incluir DDD; o prefixo brasileiro 55 é opcional. O envio depende das credenciais, da configuração e disponibilidade da Meta. Este chatbot atende uma empresa por instância do servidor.


### Proteção das rotas públicas

O servidor limita temporariamente tentativas de login, cadastro de empresa e entrada pública por endereço IP. Os limites são locais ao processo e reiniciam quando o servidor é reiniciado; para múltiplas instâncias, use um mecanismo compartilhado. Por padrão, o servidor não confia em cabeçalhos de proxy, portanto clientes atrás de um mesmo proxy podem compartilhar o limite. Configure `TRUST_PROXY_LOCAL=true` somente quando o backend aceitar conexões exclusivamente de um proxy local confiável, configurado para substituir os cabeçalhos de endereço do cliente. Para exposição em produção, configure limites também no proxy e valide a origem dos endereços.
