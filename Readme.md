# Sistema de Agendamento B2B e Fila Diária

O painel permite cadastrar clientes, gerar senhas de atendimento e chamar, concluir ou cancelar atendimentos. A API Express grava a fila no MySQL e também gerencia serviços, pacotes e saldos de sessões. O envio de mensagens pelo WhatsApp é simulado.

## Primeira execução no Windows

Você precisa de **Node.js 18 ou superior**, **MySQL 8 em execução** e uma conta com permissão para criar o banco e as tabelas. Os comandos de terminal abaixo são para **PowerShell**. Execute os blocos SQL em um cliente MySQL, como o MySQL Workbench.

### 1. Prepare o banco

- **Instalação nova.** Abra e execute o arquivo inteiro [Projeto_Agendamento.sql](Agendamento_BD/Projeto_Agendamento.sql). Ele cria o banco `gestao_agendamentos` e as tabelas.
- **Base existente.** Faça um backup e aplique as migrações pendentes em ordem numérica, até [004_autenticacao_multi_tenant.sql](Agendamento_BD/migrations/004_autenticacao_multi_tenant.sql), antes de atualizar o servidor. As migrações podem ser reaplicadas.

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

### 3. Prepare a conta de teste

Cadastre uma empresa ativa ou use uma existente. A tabela `empresas` ainda exige `email` e `senha_hash` no cadastro do estabelecimento. A credencial de login fica em `usuarios`.

Gere um hash bcrypt da senha de teste com `bcryptjs` no diretório do backend. No PowerShell 7.2 ou superior, use os comandos abaixo e guarde o hash retornado.

```powershell
$env:AGENDAMENTO_SENHA_TESTE = Read-Host 'Senha de teste' -MaskInput
try {
    node -e "const senha = process.env.AGENDAMENTO_SENHA_TESTE; if (!senha || Buffer.byteLength(senha) > 72) throw Error('Use uma senha de até 72 bytes'); console.log(require('bcryptjs').hashSync(senha, 12))"
} finally {
    Remove-Item Env:AGENDAMENTO_SENHA_TESTE
}
```

No cliente MySQL, substitua o hash e o ID da empresa no exemplo. Execute os comandos na mesma conexão.

```sql
USE gestao_agendamentos;
SELECT id, nome_fantasia FROM empresas WHERE ativo = TRUE ORDER BY id;

INSERT INTO usuarios (nome, email, senha_hash)
VALUES ('Operador Demo', 'operador@example.invalid', '<HASH_BCRYPT>');

INSERT INTO usuario_comercios (usuario_id, empresa_id, cargo)
VALUES (LAST_INSERT_ID(), 1, 'ADMIN');
```

### 4. Faça um atendimento de teste

1. Execute `npm start` no backend e abra o [login local](http://127.0.0.1:3000/login). Entre com o e-mail e a senha cadastrados. Se a conta tiver mais de uma loja ativa, escolha uma delas.
2. Em **Serviços e pacotes**, cadastre um serviço, por exemplo, **Atendimento**. Depois, abra **Registrar cliente no balcão**, cadastre ou selecione um cliente e escolha esse serviço.
3. Clique em **Confirmar Entrada na Fila**. Em **Fila**, confira se o cliente apareceu, clique em **Chamar Próximo** e depois em **Concluir Atendimento**.
4. Abra **Financeiro** para conferir o lançamento. Use **Trocar de Loja** para mudar de estabelecimento, se houver outro vínculo ativo.

O painel mostra a fila do dia no fuso de São Paulo e a atualiza a cada 10 segundos. Para disponibilizar o sistema em outra máquina, configure `HOST` e sirva a aplicação por HTTPS.

### Preparar dados de demonstração

Com o banco indicado em `DB_NAME` criado e o `.env` configurado, execute `npm run demo` no backend usando uma conta MySQL com permissão de migração. O comando prepara as tabelas de uma base vazia, aplica as quatro migrações e cria **Demo Centro** e **Demo Jardins**, cada uma com cliente, serviço e pacote próprios. A conta `demo-admin@example.invalid` recebe acesso administrativo às duas lojas.

Na primeira execução, o terminal exibe a senha aleatória gerada. Guarde-a para entregar ao testador. Para definir a senha inicial, configure `DEMO_PASSWORD` no ambiente antes de executar. As execuções seguintes preservam as credenciais e os registros já existentes, sem duplicar os cadastros da demonstração.

Entre em `/login`, escolha uma das lojas e use **Trocar de Loja** para conferir os diferentes cadastros.

### Link temporário de demonstração

Com o servidor local em execução na porta 3000, use o executável oficial `cloudflared` para abrir o túnel temporário.

```powershell
cloudflared tunnel --url http://127.0.0.1:3000 --protocol http2 --no-autoupdate
```

Abra o endereço HTTPS exibido no terminal, acrescentando `/login`, e compartilhe o link e as credenciais de demonstração com o testador. Mantenha o computador, o servidor e o túnel em execução durante o teste. O encerramento do túnel desativa o link, e uma nova execução gera outro endereço. Consulte as [instruções oficiais da Cloudflare](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## Financeiro do estabelecimento

Depois de concluir um atendimento, abra **Financeiro** no painel. Os cartões mostram o valor dos serviços concluídos hoje, desde segunda-feira e desde o primeiro dia do mês, no fuso de São Paulo. Em **Histórico de serviços**, selecione dia, semana, mês ou ano e clique em **Consultar**. O gráfico de pizza mostra a participação de cada serviço no período, incluindo as sessões de pacote. O gráfico considera todos os registros do período e agrupa serviços pelo nome registrado. A tabela lista até 30 atendimentos mais recentes do período.

Clique em **Exportar PDF** e escolha **Salvar como PDF** no diálogo do navegador. O relatório inclui o intervalo consultado, o total, o gráfico com a legenda e a tabela exibida no Histórico.

O sistema registra o preço do serviço avulso ou o preço total do pacote dividido pelo total de sessões. A API preserva o valor registrado na conclusão mesmo quando o preço do catálogo muda e arredonda os totais a centavos após somar. O histórico começa com as conclusões feitas após a atualização, pois os atendimentos antigos não guardavam a data da conclusão nem o valor aplicado.

## Como testar um pacote

1. Em **Serviços e pacotes**, crie um pacote de teste com uma conta `ADMIN` ou `GERENTE`.
2. Na mesma tela, em **Atribuir pacote a cliente**, selecione um cliente cadastrado e um modelo de pacote. Clique em **Atribuir pacote**. O painel confirma o saldo inicial de sessões e o prazo de validade.
3. Em **Registrar cliente no balcão**, escolha o cliente, o serviço e o pacote. A entrada desconta uma sessão. A rota `GET /pacotes/cliente/:cliente_id` retorna o saldo restante.
4. Volte a **Serviços e pacotes**, selecione o cliente e confira **Saldo de pacotes do cliente**, com sessões restantes, validade e situação.

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
| `POST /clientes` | Cadastra cliente com `nome` e `telefone_whatsapp`. |
| `GET /clientes` | Lista clientes da empresa. |
| `POST /servicos` | Cadastra serviço com `nome`, `duracao_minutos` e `preco`. |
| `POST /pacotes` | Cadastra modelo com `nome`, `total_sessoes`, `preco_total` e `dias_validade` opcional. |
| `GET /pacotes` | Lista os modelos de pacotes. |
| `POST /pacotes/vender` | Atribui um `pacote_id` ao `cliente_id`. |
| `GET /pacotes/cliente/:cliente_id` | Consulta saldo e validade dos pacotes do cliente. |
| `POST /agendamentos/fila` | Recebe `cliente_id`, `servico_id`, `data_atendimento` no formato `AAAA-MM-DD` e `cliente_pacote_id` opcional. Retorna o campo `ticket` para a consulta pública. |
| `GET /fila-publica/:empresa_id/servicos` | Retorna o nome do estabelecimento e o catálogo de serviços. |
| `POST /fila-publica/:empresa_id/entradas` | Recebe `nome`, `telefone_whatsapp`, `servico_id` e um `ticket` aleatório de 64 caracteres hexadecimais gerado pela página. Registra a entrada na fila do dia e retorna a posição. Reenvie o mesmo ticket ao repetir uma requisição. |
| `GET /agendamentos/ticket` | Usa `Authorization: Bearer <ticket>`. Retorna `posicao_fila`, `status` e `pessoas_na_frente`, ou `404` se o ticket estiver ausente ou for inválido. |
| `GET /agendamentos/fila/:data_atendimento` | Lista a fila do dia. |
| `GET /agendamentos/proximo/:data_atendimento` | Consulta o próximo cliente da fila. |
| `PATCH /agendamentos/status` | Recebe `id` e `status`. Envie `confirmado` para iniciar, `concluido` para concluir ou `cancelado` para cancelar. |
| `GET /financeiro/resumo` | Retorna os valores e as quantidades de serviços concluídos hoje, na semana atual e no mês atual, além dos últimos 30 registros da empresa. |
| `GET /financeiro/periodo?tipo=semana&data=2026-11-09` | Retorna o intervalo, o valor total, o valor por serviço e até 30 registros recentes da empresa no período. Os tipos são `dia`, `semana`, `mes` e `ano`. Sem parâmetros, consulta o mês atual. |

A API permite um atendimento em andamento por empresa e dia. O endpoint público `GET /api/webhook/whatsapp` faz a verificação inicial do webhook quando `WEBHOOK_VERIFY_TOKEN` está configurado.

## Problemas comuns

| Sintoma | O que conferir |
|---|---|
| O painel não abre | Confirme que `npm start` continua rodando e que a URL usa a porta configurada no `.env`. Abra o endereço do servidor no navegador. |
| `401` ao conectar | Confira o e-mail e a senha. Se a sessão expirou, entre novamente. |
| `403` ao conectar | Confira o vínculo, o cargo do operador e se a loja está ativa. |
| `500` em `/testar-conexao` | Verifique se o MySQL está rodando e revise `DB_HOST`, `DB_USER`, `DB_PASSWORD` e `DB_NAME`. |
| A fila falha em uma base antiga | Confira se `agendamentos` tem as colunas `posicao_fila` e `data_atendimento`. Se estiverem ausentes, aplique a migração do primeiro passo. |
| A lista de serviços está vazia | Cadastre um serviço em **Serviços e pacotes** com uma conta de gestão. |
