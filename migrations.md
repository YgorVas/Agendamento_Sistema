# Migração para Next.js + PostgreSQL + Drizzle ORM

Este documento descreve a migração da stack original Node.js/Express/MySQL/SQL puro para uma stack baseada em **Next.js 16 + PostgreSQL + Drizzle ORM**, com a aplicação implantada em um runtime Node.js tradicional no **Railway** e o banco de dados gerenciado na **Neon**. A migração está localizada no diretório `nextjs-app/`, na branch `nextjs-postgres-migration`.

## Objetivos da migração

- Substituir o backend Express separado e o frontend HTML estático por uma única aplicação **Next.js**.
- Substituir as consultas SQL puras do MySQL pelo **Drizzle ORM** e por um banco de dados PostgreSQL.
- Automatizar a configuração local descrita no `Readme.md` original (banco de dados, schema, dados de demonstração e servidor de desenvolvimento).
- Preservar o comportamento principal do domínio: empresas multi-tenant, usuários, clientes, serviços, pacotes, fila diária, registros financeiros, entrada pública de autoatendimento, acompanhamento de senhas e webhook do WhatsApp.
- Ter um deploy simples e de baixo custo: aplicação no **Railway** e PostgreSQL gerenciado na **Neon**.

## Nova stack

| Camada | Antes | Depois |
| --- | --- | --- |
| Framework | Express 5 + HTML/JS estático | Next.js 16 (App Router) + React 19 |
| Linguagem | JavaScript (CommonJS) | TypeScript |
| Banco de dados | MySQL 8 | PostgreSQL (Neon em produção; Docker local opcional) |
| Driver/ORM | SQL puro com `mysql2` | `postgres` (postgres-js, TCP) + Drizzle ORM |
| Migrações | SQL manual | Drizzle Kit (`push`/`generate`) |
| Autenticação | JWT no `sessionStorage` + cabeçalho `Authorization` | Cookie HTTP-only `auth-token` |
| Biblioteca JWT | `jsonwebtoken` | `jsonwebtoken` (HS256) |
| Hash de senha | `bcryptjs` | `bcryptjs` (custo 12) |
| Estilização | Tailwind Play CDN + CSS personalizado | Tailwind CSS (npm) + CSS personalizado |
| Runtime | Node.js 18+ | Node.js 20.9+ (Railway usa 22) |
| Deploy | VPS/processo manual | Railway (Nixpacks, `next build`/`next start`) |

## Estrutura do repositório

```text
nextjs-app/
├── package.json                 # Dependências e scripts
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── drizzle.config.ts            # Configuração do Drizzle Kit (dialect postgresql)
├── railway.toml                 # Build, start e healthcheck no Railway
├── neon.ts                      # Serviços Neon declarados (infra as code)
├── .neon                        # Link org/projeto/branch (git-ignored)
├── docker-compose.yml           # PostgreSQL local para desenvolvimento
├── .env.example                 # Variáveis de ambiente necessárias
├── scripts/
│   └── init-db.ts               # Cria o banco local caso não exista
└── src/
    ├── db/
    │   ├── schema.ts            # Definições das tabelas Drizzle
    │   ├── index.ts             # Pool postgres-js + instância Drizzle
    │   ├── migrations/          # Arquivos de migração gerados (Drizzle Kit)
    │   └── seed.ts              # Dados de demonstração (duas lojas, usuário, serviços e pacotes)
    ├── lib/
    │   ├── env.ts               # Validação das variáveis de ambiente em runtime
    │   ├── auth.ts              # JWT, hash de senhas e helpers de cookie/token
    │   ├── cookies.ts           # Definição/remoção do cookie auth-token
    │   ├── phone.ts             # Normalização de telefones (variantes brasileiras)
    │   ├── ticket.ts            # Geração de senhas + hash SHA-256
    │   ├── date.ts              # Funções de data com fuso horário de São Paulo
    │   └── api-client.ts        # Wrapper de fetch do navegador + funções de moeda/data
    ├── app/
    │   ├── layout.tsx           # Layout raiz (fonte Inter, Tailwind)
    │   ├── page.tsx             # Redireciona para /login ou /dashboard
    │   ├── login/page.tsx       # Login, cadastro e seleção de empresa
    │   ├── dashboard/page.tsx   # Fila, atendimento, catálogo e financeiro
    │   ├── fila/page.tsx        # Entrada pública de autoatendimento
    │   ├── ticket/page.tsx      # Acompanhamento público de senhas
    │   └── api/                 # Manipuladores de rotas
    │       ├── auth/            # login, register, select, companies, logout
    │       ├── clients/         # Listagem de clientes e busca/criação
    │       ├── services/        # CRUD do catálogo de serviços
    │       ├── packages/        # Modelos de pacotes e atribuição a clientes
    │       ├── appointments/    # Entrada na fila, listagem, próximo, status e senha
    │       ├── finance/         # Resumo e relatórios por período
    │       ├── public-queue/    # Catálogo e entrada públicos
    │       └── webhook/whatsapp/# Webhook da API do WhatsApp Cloud
    └── components/              # Componentes reutilizáveis opcionais (vazio por enquanto)
```

## Mapeamento do schema do banco de dados

O schema MySQL foi convertido para PostgreSQL utilizando os tipos de coluna do Drizzle:

| Tabela MySQL | Tabela PostgreSQL | Observações |
| --- | --- | --- |
| `empresas` | `companies` | Flag `active` preservada; campo legado `senha_hash` mantido por compatibilidade |
| `usuarios` | `users` | Identidade global |
| `usuario_comercios` | `user_companies` | Chave primária composta `(user_id, company_id)`, enum de função |
| `clientes` | `customers` | Deduplicação de telefones por normalização com regex |
| `servicos` | `services` | Preço `numeric(10,2)`, duração inteira |
| `pacotes` | `service_packages` | Modelo vinculado a um único serviço |
| `cliente_pacotes` | `customer_packages` | Instância de pacote vendido com validade |
| `agendamentos` | `appointments` | Enum `appointment_status`, posição anulável e hash de senha único |
| `agendamento_servicos` | `appointment_services` | Relacionamento muitos-para-muitos com pacote opcional |
| `registros_atendimento` | `service_records` | Registro financeiro imutável por item de serviço |

Os enums são declarados como enums do PostgreSQL utilizando `pgEnum`:

- `role`: `ADMIN`, `GERENTE`, `CAIXA`
- `appointment_status`: `agendado`, `confirmado`, `concluido`, `cancelado`
- `package_status`: `ativo`, `concluido`, `expirado`

Os índices foram preservados quando relevantes, especialmente o índice da fila diária em `(company_id, attendance_date, position)`.

## Principais decisões de arquitetura

### Monólito com App Router

A nova aplicação funciona como um único processo Next.js. Os manipuladores de rotas em `app/api/**/route.ts` substituem os antigos roteadores Express, enquanto as páginas do painel e públicas são componentes de cliente em `app/**/page.tsx`.

Arquivos estáticos e o antigo repositório separado do frontend deixam de ser necessários.

### Sessão baseada em cookies

Em vez de armazenar o JWT no `sessionStorage` e enviá-lo por meio do cabeçalho `Authorization: Bearer`, a nova aplicação armazena o token de acesso em um **cookie HTTP-only chamado `auth-token`**.

Essa abordagem é mais idiomática no Next.js, elimina a necessidade de enviar manualmente um cabeçalho bearer em requisições de mesma origem e evita expor o token ao JavaScript.

O token de seleção utilizado no login multiempresa continua sendo retornado na resposta de login e enviado como bearer token para `/api/auth/select`. Rotas protegidas também aceitam `Authorization: Bearer <access token>` como alternativa ao cookie, o que facilita testes de API.

### Pool de conexões único

Como o Railway executa um processo Node.js de longa duração, `src/db/index.ts` mantém um único pool `postgres-js` por processo. Isso reaproveita conexões entre requisições e evita o custo de abrir uma conexão nova a cada chamada.

O pool usa `prepare: false` porque a URL pooled da Neon passa pelo PgBouncer em modo transaction, que não suporta prepared statements nomeados. Connection strings da Neon que incluam `channel_binding=require` são normalizadas para remover essa opção, que é específica do libpq e não é suportada pelo `postgres-js`.

Em produção (`NODE_ENV=production`) o pool é criado no escopo do módulo; em desenvolvimento ele é mantido em `globalThis` para sobreviver ao hot reload do Next.js.

### Transações Drizzle e bloqueio de linhas

As operações críticas da fila continuam bloqueando a linha da empresa (`FOR UPDATE`) e sendo executadas dentro de `db.transaction(...)`.

Isso preserva as garantias de concorrência originais:

- Uma única entrada ativa por cliente/telefone por empresa e por dia.
- Posições de fila únicas e monotônicas por dia.
- Uma única entrada em atendimento (`confirmado`) por empresa/dia.
- Débito e estorno seguros de sessões de pacotes.

Exemplos de sintaxe Drizzle utilizados:

```ts
await tx
  .select()
  .from(companies)
  .where(eq(companies.id, companyId))
  .for("update");

await tx
  .update(customerPackages)
  .set({
    remainingSessions: sql`${customerPackages.remainingSessions} - 1`,
    status: sql`CASE WHEN ${customerPackages.remainingSessions} = 1 THEN 'concluido'::package_status ELSE 'ativo'::package_status END`,
  })
  .where(eq(customerPackages.id, packageId));
```

Dois cuidados específicos do PostgreSQL que surgiram no port e estão aplicados no código:

- **Fragmentos `sql` crus ignoram o mapeamento de colunas do Drizzle.** Um `Date` de JavaScript passado em um template `sql` chega ao driver sem conversão e falha no bind (`ERR_INVALID_ARG_TYPE`). Passe a string `YYYY-MM-DD` ou use `sql.param(valor, coluna)` para que o encoder da coluna seja executado.
- **Colunas enum exigem cast explícito em expressões.** Um `CASE` que produz literais de texto gera `text`, e o PostgreSQL não converte `text` implicitamente para enum em um `UPDATE`; é necessário `'ativo'::package_status`.

### Registros financeiros (snapshots)

Os registros financeiros continuam sendo gravados no momento da conclusão do atendimento (`service_records`), utilizando valores de snapshot.

As sessões de pacotes são precificadas como `total_price / total_sessions` no momento da conclusão, enquanto os preços dos serviços são obtidos do catálogo atual.

A coluna de valores de alta precisão `numeric(28,18)` e o arredondamento após a agregação foram preservados.

### Tratamento de datas

As datas comerciais continuam utilizando o fuso horário `America/Sao_Paulo`.

As funções auxiliares em `src/lib/date.ts` produzem strings no formato `YYYY-MM-DD` nesse fuso horário.

As colunas `date` do PostgreSQL armazenam esses valores diretamente, enquanto timestamps UTC são utilizados para ordenação.

## Deploy no Railway com Neon

O Railway executa a aplicação como um processo Node.js normal (`next build` + `next start`), sem runtime de edge e sem adaptadores específicos. O PostgreSQL fica hospedado na **Neon** e é acessado por conexão TCP padrão com o driver `postgres-js` — não é necessário usar o driver serverless da Neon em um processo Node de longa duração.

### Free tiers

- **Railway:** plano Free com **US$ 1 de crédito recorrente por mês** (sem cartão) e crédito único de **US$ 5** no trial de 30 dias. O plano Free permite 1 projeto com até 3 serviços, 1 vCPU e 0,5 GB de RAM por serviço. Como o banco fica na Neon, esse crédito precisa cobrir apenas o serviço da aplicação; ainda assim, um serviço ligado 24/7 pode exigir o plano **Hobby (US$ 5/mês, com US$ 5 de uso incluído)**.
- **Neon:** possui plano gratuito com limite de computação e armazenamento, suficiente para desenvolvimento e aplicações pequenas. Confirme os limites atuais em [neon.com/pricing](https://neon.com/pricing).

### 1. Criar o banco na Neon

1. Crie um projeto em [console.neon.tech](https://console.neon.tech).
2. Copie a **connection string pooled** (o host contém `-pooler`) e a **direta** (sem `-pooler`).
3. Use o banco `neondb` (padrão) ou crie um novo.

### 2. Criar o serviço no Railway

1. Crie um projeto no Railway.
2. Adicione um serviço a partir do repositório GitHub.
3. Como o repositório é um monorepo, defina o **Root Directory** do serviço como `nextjs-app`.
4. **Não** adicione um serviço PostgreSQL no Railway; o banco fica na Neon.

### 3. Configurar as variáveis de ambiente

No serviço da aplicação:

```bash
DATABASE_URL=postgresql://USUARIO:SENHA@ep-xxx-pooler.regiao.aws.neon.tech/neondb?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://USUARIO:SENHA@ep-xxx.regiao.aws.neon.tech/neondb?sslmode=require
AUTH_SECRET=<string aleatória de 32+ caracteres>
```

- `neon deploy` aplica o `neon.ts` e faz pull de `DATABASE_URL` e `DATABASE_URL_UNPOOLED` para o `.env` automaticamente.
- `DATABASE_URL` (pooled) é usada pela aplicação em runtime.
- `DATABASE_URL_UNPOOLED` (direta) é usada pelo Drizzle Kit para DDL/migrações; também pode ser definida apenas no momento de rodar os comandos.
- O `drizzle.config.ts` também aceita o alias `DIRECT_DATABASE_URL`.

Opcionais (WhatsApp, uma empresa por instância):

```bash
WEBHOOK_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_COMPANY_ID=
WHATSAPP_API_VERSION=
PUBLIC_BASE_URL=https://seu-dominio.up.railway.app
```

Gere o segredo com:

```bash
openssl rand -base64 32
```

O driver usa `prepare: false` porque a URL pooled da Neon passa pelo PgBouncer em modo transaction, que não suporta prepared statements nomeados. O código também remove `channel_binding=require` de connection strings da Neon, pois essa é uma opção do libpq que o `postgres-js` não negocia.

### 4. Build e start

O `railway.toml` já define:

- build: `npm run build`
- start: `npm run start`
- healthcheck: `/login`

O `next start` escuta na porta definida pela variável `PORT`, fornecida pelo Railway. O `engines.node` do `package.json` (`>=20.9.0`) faz o Nixpacks usar uma versão compatível com o Next.js 16; se necessário, defina `NIXPACKS_NODE_VERSION=22`.

### 5. Aplicar schema e dados de demonstração

As migrações não rodam automaticamente no deploy. Execute uma vez, com a CLI do Railway (que injeta as variáveis do serviço) ou localmente:

```bash
# Com Railway CLI, vinculado ao projeto:
railway run npm run db:push
railway run npm run db:seed   # opcional: dados de demonstração

# Ou localmente, usando as URLs da Neon:
cd nextjs-app
DATABASE_URL_UNPOOLED="postgresql://...direta.../neondb?sslmode=require" npm run db:push
DATABASE_URL="postgresql://...pooled.../neondb?sslmode=require" npm run db:seed
```

`db:init` existe apenas para o PostgreSQL local do Docker Compose; na Neon o banco já é criado pelo projeto.

### 6. Deploy

Conecte o repositório no painel do Railway ou use a CLI:

```bash
npm i -g @railway/cli
railway login
railway link
railway up
```

## Configuração local

### 1. Escolher o banco de dados

**Opção A — Neon (recomendado, mesmo banco do deploy):** crie um projeto/branch na Neon e use a URL **pooled** em `DATABASE_URL` e a **direta** em `DATABASE_URL_UNPOOLED`.

**Opção B — PostgreSQL local com Docker:**

```bash
cd nextjs-app
docker compose up -d
```

Isso inicia o PostgreSQL 16 em `localhost:5432`, com usuário/senha `postgres`/`postgres` e banco `agendamento`.

### 2. Configurar o ambiente

```bash
cp .env.example .env
```

Preencha `DATABASE_URL`, `DATABASE_URL_UNPOOLED` (Neon) e `AUTH_SECRET`.

### 3. Preparar o banco

Com Neon (o banco já existe, então não rode `db:init`):

```bash
npm install
npm run db:push
npm run db:seed   # opcional: dados de demonstração
```

Com Docker local:

```bash
npm install
npm run setup     # db:init + db:push + db:seed
```

O `npm run setup` executa:

1. `db:init` — cria o banco `agendamento` caso não exista (apenas Docker local).
2. `db:push` — aplica o schema Drizzle ao PostgreSQL.
3. `db:seed` — cria o usuário de demonstração, duas empresas, clientes, serviços e pacotes.

### 4. Iniciar o desenvolvimento

```bash
npm run dev
```

Acesse `http://localhost:3000/login`.

Credenciais padrão (quando `DEMO_PASSWORD=password` está definido):

- E-mail: `demo-admin@example.invalid`
- Senha: `password`

### Scripts disponíveis

| Script | Finalidade |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento Next.js |
| `npm run build` | Build de produção |
| `npm run start` | Servidor de produção (usa `PORT` se definida) |
| `npm run db:init` | Cria o banco PostgreSQL local caso não exista |
| `npm run db:push` | Aplica o schema ao banco (Drizzle Kit) |
| `npm run db:generate` | Gera arquivos SQL de migração |
| `npm run db:seed` | Insere dados de demonstração |
| `npm run db:studio` | Abre o Drizzle Studio |
| `npm run setup` | `db:init` + `db:push` + `db:seed` |

## Fluxo de autenticação

1. **Login:** `POST /api/auth/login` valida e-mail e senha e retorna diretamente um cookie com o token de acesso (quando existe apenas uma empresa) ou um token de seleção acompanhado da lista de empresas (quando existem várias).
2. **Seleção de empresa:** `POST /api/auth/select` recebe o token de seleção por meio de `Authorization: Bearer ...` e define o cookie do token de acesso.
3. **Validação por requisição:** cada manipulador de rota protegida lê o cookie `auth-token` (ou o cabeçalho `Authorization: Bearer <access token>`), verifica o JWT e valida novamente a associação ativa e a função do usuário no PostgreSQL a cada chamada.
4. **Logout:** `POST /api/auth/logout` remove o cookie.

## Endpoints da API

A API mantém os endpoints originais, mas seguindo a convenção do App Router do Next.js:

| Original | Novo |
| --- | --- |
| `POST /auth/login` | `POST /api/auth/login` |
| `POST /auth/cadastrar` | `POST /api/auth/register` |
| `POST /auth/selecionar-comercio` | `POST /api/auth/select` |
| `GET /auth/comercios` | `GET /api/auth/companies` |
| `GET /clientes` | `GET /api/clients` |
| `POST /clientes` | `POST /api/clients` |
| `GET /servicos` | `GET /api/services` |
| `POST /servicos` | `POST /api/services` |
| `GET /pacotes` | `GET /api/packages` |
| `POST /pacotes` | `POST /api/packages` |
| `POST /pacotes/vender` | `POST /api/packages/sell` |
| `GET /pacotes/cliente/:id` | `GET /api/packages/customer/:id` |
| `POST /agendamentos/fila` | `POST /api/appointments` |
| `GET /agendamentos/ticket` | `GET /api/appointments/ticket` |
| `GET /agendamentos/fila/:data` | `GET /api/appointments/:data` |
| `GET /agendamentos/proximo/:data` | `GET /api/appointments/next/:data` |
| `PATCH /agendamentos/status` | `PATCH /api/appointments/status` |
| `GET /financeiro/resumo` | `GET /api/finance/summary` |
| `GET /financeiro/periodo` | `GET /api/finance/period` |
| `GET /fila-publica/:id/servicos` | `GET /api/public-queue/:id/services` |
| `POST /fila-publica/:id/entradas` | `POST /api/public-queue/:id/entries` |
| `GET /api/webhook/whatsapp` | `GET /api/webhook/whatsapp` |
| `POST /api/webhook/whatsapp` | `POST /api/webhook/whatsapp` |

### Páginas públicas

- `/login` — login do painel e cadastro de empresas.
- `/dashboard` — fila, atendimento, catálogo e financeiro.
- `/fila?empresa=<id>` — entrada pública de autoatendimento.
- `/ticket#<ticket>` — acompanhamento público de senhas.

## O que mudou em relação à versão original

- **Processo único:** backend e frontend são servidos por uma única aplicação Next.js.
- **Sem SQL puro:** todas as consultas utilizam os tipos e as transações do Drizzle ORM.
- **PostgreSQL em vez de MySQL:** schema convertido para uma estrutura idiomática do PostgreSQL, com enums, tipos numéricos e funções regex.
- **Banco gerenciado na Neon:** conexão TCP padrão (postgres-js) com URL pooled em runtime e URL direta para migrações.
- **Sessão por cookie** em vez de token bearer no `sessionStorage`.
- **Sem executor de migrações separado:** o Drizzle Kit aplica o schema; `npm run setup` automatiza a criação do banco local, a aplicação do schema e a inserção dos dados iniciais.
- **Next.js 16:** `cookies()` e `params` de rotas dinâmicas são assíncronos.
- **Deploy Node.js no Railway:** `railway.toml` com build, start e healthcheck; sem adaptadores de edge.
- **Sem dependências de CDN em produção:** o Tailwind é compilado localmente; apenas a fonte Inter continua sendo carregada pelo Google Fonts.
- **Notificação de próximo cliente via WhatsApp continua simulada** (registro no console), enquanto o webhook de entrada utiliza a Graph API.

## Limitações atuais e próximos passos

- **Migrações manuais:** o deploy não executa `db:push` automaticamente; rode-o explicitamente ao alterar o schema.
- **Rate limiting:** ainda não foi implementado na nova stack. O limitador em memória original precisaria ser substituído por uma solução baseada em Redis ou outro armazenamento compartilhado.
- **Testes:** os testes do repositório original ainda não foram migrados. Deve ser criada uma nova suíte utilizando `node:test`, executada contra um banco PostgreSQL temporário, em `nextjs-app/test/`.
- **Aprimoramento do frontend:** o dashboard é funcional, mas minimalista. Os estilos detalhados e os atributos de acessibilidade das páginas estáticas originais podem ser migrados gradualmente.
- **Paginação:** as listas de clientes e serviços ainda não possuem paginação.
- **Ocultação de menus por função:** a interface oculta as seções financeiro e catálogo para usuários com a função `CAIXA`, mas as páginas públicas e a validação no nível das rotas já estão implementadas.
- **Plano gratuito do Railway:** o crédito de US$ 1/mês cobre apenas um serviço mínimo; um serviço ligado 24/7 pode exigir o plano Hobby.
- **Plano gratuito da Neon:** suficiente para desenvolvimento e aplicações pequenas, mas com limites de computação e armazenamento; confirme os limites atuais.
- **Conexão pooled da Neon:** requer `prepare: false` no postgres-js (já configurado); migrações devem usar a URL direta.
- **HTTPS:** o Railway termina o TLS; em execução local o cookie `secure` fica desativado porque `NODE_ENV=development`.
- **Build verificado:** `npm run build` executa com sucesso e a aplicação foi validada em runtime com PostgreSQL local (login multiempresa, seleção de empresa, fila, catálogo e financeiro).
