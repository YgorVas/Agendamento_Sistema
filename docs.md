# Architecture and Inner Workings

This document explains how the scheduling and daily-queue system is built, how a request travels through it, and which design decisions keep queue operations consistent. The existing `Readme.md` focuses on installation and end-user flows; this file focuses on internals.

## 1. What the system does

The application is a multi-tenant, B2B queue-management system for service establishments (salons, clinics, workshops, and similar businesses). Each establishment is a **company/tenant** (`empresa`) with its own users, customers, services, packages, daily queue, and financial records.

Main capabilities:

- Daily queue with generated positions, tickets, and status transitions.
- Front-desk (staff) check-in and customer self-service entry through a public page.
- Multiple services per queue entry, optionally paid with customer packages.
- Package templates, sold package balances, expiry, and consumption/refund rules.
- Financial snapshots per completed service, with daily/weekly/monthly/yearly reports.
- Multi-company login, company switching, and role-based access (`ADMIN`, `GERENTE`, `CAIXA`).
- Public ticket tracking and a WhatsApp Cloud API chatbot webhook.
- Optional demo data and a database-backed integration test suite.

There is currently no background job runner and no future-appointment scheduling UI. The data model accepts any `data_atendimento`, but the panel and public entry operate on the current day in the `America/Sao_Paulo` timezone.

## 2. Technology stack

| Area | Technology | How it is used |
|---|---|---|
| Runtime | Node.js 18+ | Executes the backend and tests. `fetch`, `AbortSignal.timeout`, and modern crypto APIs are required. |
| Backend framework | Express `^5.3.0` | HTTP server, routing, static file delivery, JSON parsing. |
| Database driver | `mysql2` (`mysql2/promise`) `^3.24.6` | Connection pool and promise-based SQL execution. |
| Database | MySQL 8, InnoDB, `utf8mb4` | Relational persistence. Uses CTEs, window functions, `REGEXP_REPLACE`, `DECIMAL`, and row locking. |
| Authentication | `jsonwebtoken` `^9.0.3` | HS256 JWTs with issuer/audience separation and expiry. |
| Password hashing | `bcryptjs` `^3.0.3` | Cost factor 12; dummy hash for timing-safe invalid logins. |
| Configuration | `dotenv` `^18.0.8` | `.env` loading in the server, database module, and scripts. |
| Frontend | Native HTML5, CSS, JavaScript ES modules | Multi-page frontend with a hash-routed dashboard shell. No bundler, npm package, or framework. |
| Frontend styling | Tailwind Play CDN, custom CSS | Tailwind utility classes for the dashboard; hand-written CSS for login, public queue, and ticket pages. |
| Icons/fonts | Font Awesome 6.4 CDN, Google Fonts (Inter) | Visual assets loaded from CDNs. |
| Charts | Browser CSS | Financial pie chart rendered with `conic-gradient`; PDF export uses the browser print dialog. |
| Testing | `node:test`, `node:assert/strict` | Unit tests with mocks and integration tests against a real temporary MySQL database. |
| Dev tooling | `nodemon` | Local reload during development. |
| External integration | WhatsApp Cloud API (Meta Graph API) | Inbound chatbot webhook and direct Graph API text replies. Outbound "next customer" notices are simulated. |

There is no ORM, query builder, frontend build pipeline, container configuration, CI workflow, or dedicated migration runner.

## 3. Repository layout

```text
Agendamento_Sistema/
├── Agendamento_BackEnd/
│   ├── src/
│   │   ├── app.js                 # Express app composition
│   │   ├── server.js              # Loads .env and starts HTTP listener
│   │   ├── config/db.js           # mysql2 connection pool
│   │   ├── routes/                # URL definitions and route-level middleware
│   │   ├── controllers/           # Input validation and HTTP responses
│   │   ├── models/                # SQL queries and transactions
│   │   ├── middleware/            # JWT/tenant check, role check, rate limiting
│   │   └── services/              # JWT helpers, phone normalization, WhatsApp
│   ├── scripts/preparar-demo.js   # Demo schema/data bootstrap
│   └── test/                      # Auth, rate-limit, and MySQL integration tests
├── Agendamento_BD/
│   ├── Projeto_Agendamento.sql    # Full schema for a fresh database
│   ├── migrations/                # Incremental, idempotent schema changes
│   ├── PERMISSÃO.sql              # Application grant example
│   └── comandos_uteis/            # Manual SQL utilities
├── Agendamento_FrontEnd/
│   ├── index.html                 # Dashboard shell
│   ├── login.html                 # Login, company registration, company selection
│   ├── fila.html                  # Public queue entry page
│   ├── ticket.html                # Public ticket tracker
│   └── assets/
│       ├── api.mjs                # Fetch wrapper and timeout/error handling
│       ├── auth-api.mjs           # Session storage and authenticated requests
│       ├── empresa/               # Dashboard modules
│       ├── fila-publica.mjs       # Public entry logic
│       └── ticket.mjs             # Ticket polling logic
├── Readme.md
├── TIMELINE.md
└── docs.md
```

## 4. High-level architecture

The system is a **modular monolith**: one Node.js process serves both the static frontend and the REST API, and talks to a single MySQL database.

```text
┌─────────────────────────────────────────────────────────────┐
│ Browser                                                     │
│  /login, /dashboard, /fila.html, /ticket.html               │
│  Vanilla ES modules + fetch + sessionStorage                │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS/JSON (same origin)
┌───────────────────────────▼─────────────────────────────────┐
│ Express process                                             │
│  express.static(Agendamento_FrontEnd)                       │
│  /auth        /clientes      /servicos      /agendamentos   │
│  /pacotes     /financeiro    /fila-publica  /api/webhook    │
│                                                             │
│  middleware → controller → model → mysql2 pool              │
└───────────────────────────┬─────────────────────────────────┘
                            │ SQL
┌───────────────────────────▼─────────────────────────────────┐
│ MySQL 8 / InnoDB                                            │
│  tenants, users, customers, services, packages, queue,      │
│  financial snapshots                                        │
└─────────────────────────────────────────────────────────────┘

Optional external path:
Meta WhatsApp Cloud API ──webhook──► Express ──Graph API──► WhatsApp
```

`src/server.js` loads `dotenv`, imports `app.js`, and listens on `HOST`/`PORT` (default `127.0.0.1:3000`). `src/app.js` sets up the middleware stack, serves the frontend directory, and mounts the API routers. The database module creates a pool with `connectionLimit: 10` and `queueLimit: 0` (unlimited waiting queue). The application does not ping MySQL at startup; database failures surface per request.

## 5. Backend request lifecycle

The Express stack in `src/app.js` is ordered as follows:

1. Optional trust-proxy configuration (`TRUST_PROXY_LOCAL=true`).
2. `express.json()` parses JSON and, via its `verify` callback, stores the raw body on `req.rawBody`. The raw body is required for Meta webhook signature validation.
3. Static frontend delivery from `Agendamento_FrontEnd`; the `html` extension is implicit, so `/login` serves `login.html`. `/dashboard` explicitly serves `index.html`.
4. `GET /testar-conexao` performs an authenticated MySQL query.
5. API routers: `/auth`, `/clientes`, `/servicos`, `/agendamentos`, `/pacotes`, `/financeiro`, `/fila-publica`, and `/api/webhook`.

Each API feature follows the same layering:

- **Routes** define HTTP methods/paths and attach middleware.
- **Controllers** validate and normalize input, call models/services, and choose status codes and response bodies.
- **Models** contain SQL and transaction logic.
- **Services** hold reusable helpers (JWT, phone variants, WhatsApp).
- **Middleware** handles cross-cutting checks (authentication, tenant resolution, roles, rate limits).

Authentication is applied per route, not globally. Public routes are the company service catalog, public queue entry, ticket lookup (protected by possession of the ticket), and the WhatsApp webhook. Everything else requires an access JWT, and some routes additionally require `ADMIN` or `GERENTE` via `exigirGestao`.

Controllers generally catch their own errors, log a technical detail, and return a generic JSON error. There is no global error handler outside the auth router. Responses that expose sensitive or frequently changing data set `Cache-Control: no-store`.

## 6. Multi-tenancy and authentication

### 6.1 Identity model

Three tables separate identity from tenant access:

- `usuarios`: global account identity, unique e-mail, bcrypt password hash.
- `empresas`: tenant/establishment, active flag, contact data, and a legacy `senha_hash` column that is required by the schema but not used for panel login.
- `usuario_comercios`: membership table with composite primary key `(usuario_id, empresa_id)` and role `ADMIN`, `GERENTE`, or `CAIXA`.

A user can belong to several companies with a different role in each. Domain rows (customers, services, packages, queue entries, financial records) carry `empresa_id`, and the API always obtains the active company from the JWT rather than trusting a client-provided company ID.

### 6.2 Login and company selection

`POST /auth/login` accepts e-mail and password, looks up the global user, and compares bcrypt hashes. For a nonexistent user, it compares against a precomputed dummy hash so the response time does not trivially reveal account existence.

After validating the password, the API lists the user's active memberships:

- **One active company:** returns an access token plus `comercioId` and `cargo`.
- **Several active companies:** returns `tokenTemporario` (5-minute selection token) and the membership list.
- **No active company:** `403`.

`POST /auth/selecionar-comercio` accepts a selection token and a `comercioId`, rechecks the membership, and issues an access token. `POST /auth/iniciar-selecao` lets an already authenticated user start the same flow again to switch companies. `GET /auth/comercios` lists active memberships and identifies the current one.

### 6.3 JWT design

`src/services/tokensAuth.js` issues HS256 tokens with:

- Issuer: `agendamento`.
- Audience `selecionar-comercio` for temporary selection tokens (5 minutes).
- Audience `acesso-comercio` for access tokens (1 hour).
- Payload: `usuarioId` and, for access tokens, `comercioId` and `cargo`.

The secret comes from `AUTH_JWT_SECRET` and must be at least 32 bytes; otherwise auth-dependent endpoints return `503`. Audience separation prevents an access token from being used as a selection token, and vice versa. There is no refresh-token flow; after one hour the user logs in again.

### 6.4 Per-request tenant validation

`src/middleware/verificarInstancia.js` runs on every protected route. It:

1. Extracts the bearer token and verifies signature, algorithm, issuer, audience, and expiry.
2. Validates the user ID and checks that the token contains a company ID and role.
3. Rejects mismatches between the token's company and an `:empresa_id` route parameter.
4. Re-queries `usuario_comercios` joined to `empresas.ativo = TRUE` on every call.
5. Requires the current role in the database to match the role in the token.

This makes role changes and company deactivation effective immediately rather than at token expiry. A removed/changed membership returns `403` with code `INSTANCIA_INDISPONIVEL`, which the frontend treats as a reason to end the session. The middleware then exposes `req.usuarioId`, `req.comercioId`, and `req.cargo` to controllers.

### 6.5 Role policy

| Capability | ADMIN | GERENTE | CAIXA |
|---|---:|---:|---:|
| View queue, customers, services, packages | yes | yes | yes |
| Enter customers in the queue, cancel/finish entries | yes | yes | yes |
| Assign a package to a customer | yes | yes | yes |
| Create services and package templates | yes | yes | no |
| Financial summary and periods | yes | yes | no |

The UI hides management menus for `CAIXA`, but the API is the enforcement point: `POST /servicos`, `POST /pacotes`, `GET /financeiro/*` require management roles.

### 6.6 Frontend session handling

The browser stores only the access token in `sessionStorage` under `agendamento.auth.token`. `assets/auth-api.mjs`:

- Attaches `Authorization: Bearer <token>`.
- Restricts requests to the current origin.
- Redirects to `/login?sessao=expirada` on `401`.
- Redirects with `sessao=indisponivel` on `INSTANCIA_INDISPONIVEL`.
- Clears the token on explicit logout.

The token is not in a cookie, so ordinary cross-site requests do not carry it automatically. It is still accessible to JavaScript, so XSS would expose it; see the security section.

## 7. Data model

```text
empresas 1 ──── N usuario_comercios N ──── 1 usuarios
    │
    ├── 1:N clientes
    ├── 1:N servicos
    │          │
    │          └── 1:N pacotes (template tied to one service)
    │                     │
    │                     └── 1:N cliente_pacotes N ──── 1 clientes
    │
    ├── 1:N agendamentos N ──── 1 clientes
    │          │
    │          └── 1:N agendamento_servicos N ──── 1 servicos
    │                                  │
    │                                  └── 0..1 cliente_pacotes
    │
    └── 1:N registros_atendimento (financial snapshot per service item)
```

### 7.1 Tables

| Table | Purpose and important details |
|---|---|
| `empresas` | Tenant. `ativo` controls access. Unique e-mail and optional unique CNPJ. `senha_hash` remains `NOT NULL` for compatibility but is not used by panel login. |
| `usuarios` | Global login identity. Unique e-mail across the whole system. |
| `usuario_comercios` | Membership and role. Composite PK prevents duplicate membership. |
| `clientes` | Tenant-scoped customers. Phone is not unique; deduplication is performed by normalized phone lookup. |
| `servicos` | Tenant-scoped service catalog with duration (minutes) and price (`DECIMAL(10,2)`). |
| `pacotes` | Package template: name, total sessions, total price, validity in days, and one linked service. |
| `cliente_pacotes` | A package instance sold/assigned to a customer: remaining sessions, purchase date, expiry date, status. |
| `agendamentos` | A queue entry. Contains tenant, customer, legacy single-service fields, `posicao_fila`, `data_atendimento`, creation timestamp, status, and a unique SHA-256 ticket hash. |
| `agendamento_servicos` | Canonical list of services in one entry, each optionally linked to a customer package. PK `(agendamento_id, servico_id)` prevents duplicate services within an entry. |
| `registros_atendimento` | Immutable financial facts per completed service item. Stores snapshotted customer/service/package names, applied value, local completion date, and UTC timestamp. PK `(agendamento_id, item)`. |

`agendamentos.servico_id` and `agendamentos.cliente_pacote_id` are retained as compatibility fields for the first service. The authoritative multi-service data is in `agendamento_servicos`. Migration `006` copies legacy single-service entries into that table.

### 7.2 Queue-related columns and indexes

- `agendamentos.posicao_fila` is nullable; only queue entries have a number. Legacy records with `NULL` are excluded from queue listings.
- `ticket_hash` is `BINARY(32)` and globally unique. The plaintext ticket is never stored.
- Index `idx_fila_empresa_dia (empresa_id, data_atendimento, posicao_fila)` supports daily queue reads.
- `registros_atendimento` is indexed by company/date/completion ordering for reports.

### 7.3 Database evolution

`Projeto_Agendamento.sql` is the full schema for a new database. Existing installations apply numbered scripts from `Agendamento_BD/migrations/` in order:

1. `001_fila_diaria.sql` — daily queue position/date and index.
2. `002_ticket_publico.sql` — public ticket hash.
3. `003_registros_atendimento.sql` — financial snapshot table.
4. `004_autenticacao_multi_tenant.sql` — users, memberships, active company flag.
5. `005_servicos_por_entrada.sql` — package-to-service link and `agendamento_servicos`.
6. `006_financeiro_por_servico.sql` — per-service financial items and legacy backfill.

The scripts check `information_schema` before altering, so they are intended to be re-runnable. There is no `schema_migrations` table; the operator is responsible for applying them in order. The demo script applies all migrations every time.

## 8. Queue mechanics

### 8.1 Entering the queue at the front desk

`POST /agendamentos/fila` accepts:

```json
{
  "cliente_id": 10,
  "data_atendimento": "2026-11-21",
  "servicos": [
    { "servico_id": 2, "cliente_pacote_id": 7 },
    { "servico_id": 5 }
  ]
}
```

The legacy shape with a single `servico_id`/`cliente_pacote_id` is also accepted and normalized into a one-item list. The controller validates positive integer IDs, rejects duplicate service IDs, and requires a real `YYYY-MM-DD` date.

The server generates a random 32-byte ticket, returns the 64-character hexadecimal form once, and persists only `SHA-256(ticket)`. The ticket response includes the entry ID, queue position, and number of people ahead.

### 8.2 Transaction and concurrency strategy

All queue writes use `transacaoDaEmpresa` in `src/models/agendamentoModel.js`:

```text
BEGIN
  SELECT empresa ... WHERE id = ? AND ativo = TRUE FOR UPDATE
  ...perform queue operation...
COMMIT (or ROLLBACK on error)
```

Locking the company row serializes all queue entries and status changes for one company. This is the key mechanism that guarantees:

- Two concurrent customers cannot receive the same queue position.
- A customer cannot acquire two active entries for the same company/day through a race.
- The last package session cannot be consumed twice.
- Only one "in progress" entry exists per company/day when calling the next customer.

Different companies can still operate concurrently because they lock different company rows. The trade-off is that all queue mutations within one company are serialized, which is acceptable for a single-location queue but limits write throughput.

Inside the transaction, front-desk entry performs:

1. **Customer check:** load the customer with `FOR SHARE`, scoped to the company.
2. **Duplicate active entry check:** reject if the same customer (or the same normalized phone) already has an entry for that company/day with status `agendado` or `confirmado`. The check spans both front-desk and public entries.
3. **Service ownership check:** select all requested service IDs for the company with `FOR SHARE`; all must exist.
4. **Package validation/debit:** for each service linked to a package, select the package instance with `FOR UPDATE` and verify:
   - it belongs to the customer,
   - its template belongs to the company,
   - status is `ativo`,
   - remaining sessions > 0,
   - the template's service equals the requested service,
   - expiry is at least both today and the attendance date.
   If any condition fails, the whole entry is rejected.
5. **Session debit:** decrement each selected package once; mark it `concluido` when it reaches zero.
6. **Position assignment:** `MAX(posicao_fila) + 1` for that company/day. Positions include cancelled entries, so numbers are never reused on the same day.
7. **Insert entry and service rows** into `agendamentos` and `agendamento_servicos`.
8. **Commit** everything atomically.

### 8.3 Queue reads

`GET /agendamentos/fila/:data_atendimento` (and the legacy `/:empresa_id/:data_atendimento` form) reads the company from the JWT. A CTE selects non-cancelled entries for the day ordered by position, then joins service rows and aggregates them in JavaScript into:

```json
{
  "id": 12,
  "posicao_fila": 3,
  "status": "agendado",
  "cliente_nome": "Ana",
  "cliente_telefone": "...",
  "duracao_minutos": 60,
  "servicos": [
    { "servico_id": 2, "servico_nome": "Corte", "duracao_minutos": 30, "cliente_pacote_id": 7 }
  ]
}
```

`GET /agendamentos/proximo/:data_atendimento` uses the same aggregation with `status = 'agendado'` and `LIMIT 1`. Cancelled entries are omitted from normal queue views; completed entries remain visible as history for the day.

### 8.4 Status transitions

`PATCH /agendamentos/status` accepts `{ id, status }` where status is `confirmado`, `concluido`, or `cancelado`.

| Current state | Requested state | Result |
|---|---|---|
| any | same state | `200` no-op; no side effects |
| `agendado` | `confirmado` | Allowed if no other entry is already `confirmado` for that company/day |
| `agendado` | `concluido` | Allowed; records financial items |
| `agendado` | `cancelado` | Allowed; refunds every package session used by the entry |
| `confirmado` | `concluido` | Allowed; records financial items |
| `confirmado` | `cancelado` | Allowed; package sessions are **not** refunded |
| `concluido` / `cancelado` | anything | `409`; final states cannot be reopened |
| any | `agendado` | `409`; entries cannot be moved back to waiting |

A second `confirmado` entry is blocked with `409` while another is in progress. Since `agendado -> concluido` is allowed, an operator can complete an entry without explicitly calling it first, which also records financial items.

After a successful completion and commit, the controller attempts to notify the next waiting customer using the simulated WhatsApp service. That notification is outside the transaction: a messaging failure is logged but does not roll back the queue or financial changes.

### 8.5 Active-entry semantics

The uniqueness rule is per **company + customer/phone + calendar day**, and only while the entry is `agendado` or `confirmado`:

- A customer can enter again after the current entry is completed or cancelled.
- A customer can enter on another day even if an older day's entry is still `confirmado`.
- Front-desk and public paths share the same rule.
- The phone check also catches legacy duplicate customer records in the same company.

## 9. Packages and session accounting

### 9.1 Templates vs. sold packages

- `pacotes` is the catalog template: service, total sessions, total price, validity days.
- `cliente_pacotes` is the instance owned by a customer: remaining sessions, dates, status.

Creating a template (`POST /pacotes`) requires `ADMIN`/`GERENTE` and validates that the referenced service belongs to the current company. Assigning a package (`POST /pacotes/vender`) is available to all authenticated roles, validates customer and template belong to the same company, and snapshots the session count and validity at sale time.

`GET /pacotes/cliente/:cliente_id` lists the customer's packages, computing an `expirado` display status when the validity date has passed. The query is company-scoped, so one tenant cannot read another tenant's balances.

### 9.2 Consumption

A package can be selected only for its linked service. At queue entry, one session is deducted per selected package. If the balance reaches zero, the instance becomes `concluido`. Expired or exhausted packages cannot be used, and the entry is rejected atomically if any selected package fails validation.

### 9.3 Refunds

Cancellation of an entry that has not started (`agendado`) returns one session for every package item in the entry. The refund runs in the same transaction, so concurrent cancellations cannot double-refund: the status check plus company lock make the operation effectively idempotent. A repeated cancellation returns a no-op because the entry is already `cancelado`.

Cancellation after the service has started (`confirmado`) intentionally does not refund sessions. This policy is implemented in `AgendamentoModel.atualizarStatus`.

## 10. Public entry and ticket tracking

### 10.1 Public catalog

`GET /fila-publica/:empresa_id/servicos` is unauthenticated. It returns the active company's display name and service list. There is no exposure of customers, users, queue contents, or other tenants.

### 10.2 Public queue entry

`POST /fila-publica/:empresa_id/entradas` accepts:

```json
{
  "nome": "Ana",
  "telefone_whatsapp": "(82) 99999-1234",
  "servico_ids": [1, 3],
  "ticket": "<64 lowercase hex characters>"
}
```

The browser generates the 64-hex ticket with `crypto.getRandomValues` and reuses it for a repeated submission of the same form data. The server stores only its SHA-256 hash and treats `ticket_hash` as an idempotency key: if the same ticket already exists for the company, the API returns the existing position with `200` instead of creating another entry. A new entry returns `201`.

The server:

1. Validates name, phone shape, a non-empty duplicate-free list of numeric service IDs, and the ticket format.
2. Locks the company row (`transacaoDaEmpresa`).
3. Checks ticket idempotency.
4. Verifies all services belong to the company.
5. Finds an existing customer by normalized phone within the company. If found, the stored name is preserved; if not, a customer is created.
6. Rejects an active entry for that customer/phone/day.
7. Inserts the entry and its service rows with no package usage.
8. Returns the queue position.

The public page does not offer package consumption; package use is recorded by staff at the counter.

### 10.3 Phone normalization

`src/services/telefone.js` produces two variants: the digits as entered and an alternative with/without the Brazilian `55` country code (for 10–11 digit numbers it adds `55`; for 12–13 digit numbers starting with `55` it removes it). SQL compares digits after stripping punctuation with `REGEXP_REPLACE`. This shared helper is used by front-desk deduplication, public entry, and the WhatsApp chatbot.

### 10.4 Ticket lookup

`GET /agendamentos/ticket` expects `Authorization: Bearer <64-hex ticket>`. The server hashes the presented value and looks up the active company entry. It returns only:

- `posicao_fila`,
- `status`,
- `pessoas_na_frente` (active entries with a lower position).

The ticket page reads the ticket from the URL fragment (`/ticket.html#<ticket>`), so the secret is not sent to the server as part of the page request, and sets `referrer: no-referrer`. It polls every 5 seconds and stops after `concluido` or `cancelado`. Because only the hash is stored, a lost ticket cannot be recovered from the database.

The reported position is the original queue number assigned that day; cancelling earlier entries does not renumber later tickets. `pessoas_na_frente`, however, counts only entries still `agendado` or `confirmado`, so the displayed progress remains meaningful.

## 11. Financial model

### 11.1 Snapshot on completion

Financial data is not derived later from mutable catalog prices. When an entry moves to `concluido`, `registrarAtendimento` inserts one row per service item into `registros_atendimento` inside the same transaction:

- Customer name, service name, and package name are copied as text snapshots.
- For a service without a package, `valor = servicos.preco` at completion time.
- For a package service, `valor = pacotes.preco_total / pacotes.total_sessoes`.
- `item` is assigned with `ROW_NUMBER() OVER (ORDER BY s.id)`.
- `data_conclusao` is the current date in `America/Sao_Paulo`; `concluido_em_utc` is a UTC timestamp with milliseconds.
- Values use `DECIMAL(28,18)` to preserve fractional cents during intermediate sums.

Once written, the row is not updated by later catalog changes. Service/package renames also do not rewrite historical display names. The primary key `(agendamento_id, item)` makes duplicate completion rows impossible, and the status guard prevents repeated completion from trying to insert them.

### 11.2 Summary endpoint

`GET /financeiro/resumo` (management roles only) uses a single CTE query to return:

- totals and service counts for today,
- the current week starting Monday,
- the current month,
- up to 30 most recent financial records.

Sums are rounded to two decimals **after** aggregation, avoiding cumulative rounding drift. The query clamps periods to the current São Paulo date.

### 11.3 Period endpoint

`GET /financeiro/periodo?tipo=dia|semana|mes|ano&data=YYYY-MM-DD`:

- Rejects future reference dates and malformed/nonexistent dates.
- Resolves day, Monday-based week, month, or year boundaries.
- Clamps the end date to today.
- Returns the interval, grand total, totals grouped by service name (across all matching rows), and up to 30 most recent records.
- Uses `SUM(SUM(valor)) OVER ()` to compute the period total while grouping by service.

The UI renders the service breakdown as a conic-gradient pie chart and prints the report using the browser's native PDF export (`window.print()`); there is no server-side PDF library.

### 11.4 Important nuance

The package template row is still referenced when completion happens. If an administrator changes a package template's price or session count before a sold package is used/completed, the applied per-session value uses the template values at completion time. After completion, the snapshot is immutable. Likewise, the customer package list reports sessions based on the template's current `total_sessoes` alongside the stored remaining count. This is a deliberate lightweight snapshot strategy, but it is not a fully historical priced contract.

## 12. WhatsApp integration

There are two separate behaviors:

1. **Inbound chatbot (real Graph API integration)** — `src/routes/webhookRoutes.js`.
2. **Outbound "next customer" notice (simulated)** — `src/services/whatsappService.js` only logs to the console.

### 12.1 Webhook verification

`GET /api/webhook/whatsapp` implements Meta's verification handshake: it checks `hub.mode=subscribe`, compares `hub.verify_token` with `WEBHOOK_VERIFY_TOKEN`, and returns `hub.challenge` exactly.

### 12.2 Signature validation

`POST /api/webhook/whatsapp` requires:

- `WHATSAPP_APP_SECRET`,
- `WHATSAPP_ACCESS_TOKEN`,
- `WHATSAPP_PHONE_NUMBER_ID`,
- numeric `WHATSAPP_EMPRESA_ID`,
- `PUBLIC_BASE_URL` (must resolve to HTTPS),
- `WHATSAPP_API_VERSION` in the form `v<major>.<minor>`.

The endpoint computes `sha256=` HMAC over `req.rawBody` using the app secret and compares it with `x-hub-signature-256` using `timingSafeEqual`. The request is rejected with `503` if configuration is incomplete and `403` if the signature is invalid.

### 12.3 Message handling

For each Meta change whose `metadata.phone_number_id` matches this instance, the handler processes text messages from numeric senders. It:

- Computes today's date in São Paulo.
- Looks for an active queue entry (`agendado`/`confirmado`) for the configured company and a matching phone variant.
- If found, replies with the queue number, status, and people ahead.
- If not found, replies with a link to `/fila.html?empresa=<id>` and instructions to register.
- Sends the response to `https://graph.facebook.com/<version>/<phone_id>/messages` using the access token.

The webhook model is **one company per backend instance**, driven by `WHATSAPP_EMPRESA_ID`. The README documents this constraint. The integration depends on Meta credentials and availability.

## 13. Frontend architecture

### 13.1 Pages

| Page | Purpose | Main module |
|---|---|---|
| `login.html` | Login, company self-registration, company selection | `assets/login.mjs` |
| `index.html` | Dashboard shell with queue, front desk, catalog, and financial sections | `assets/empresa/index.mjs` |
| `fila.html` | Public customer entry for one company (`?empresa=<id>`) | `assets/fila-publica.mjs` |
| `ticket.html` | Public ticket position/status tracker | `assets/ticket.mjs` |

All browser code is native ES modules loaded directly by the browser. There is no bundle step, transpilation, or frontend dependency installation.

### 13.2 Dashboard composition

`assets/empresa/index.mjs` is the orchestrator:

- Reads the access token and redirects to login when absent.
- Loads company memberships, customers, services, and package templates.
- Hides catalog/financial navigation for `CAIXA`.
- Sets the public entry link for the active company.
- Wires the feature modules:
  - `fila.mjs` — current service, next customer, table, status buttons.
  - `balcao.mjs` — customer creation/selection, multiple service rows, package selection, ticket confirmation.
  - `catalogo.mjs` — service/package creation and package assignment.
  - `financeiro.mjs` — summary, period filter, chart, records, print.
  - `toast.mjs` — transient notifications.
- Polls the daily queue every 10 seconds while the panel is visible and no action is in progress.
- Reloads after back/forward cache restoration.

Navigation is hash-based (`#fila`, `#balcao`, `#catalogo`, `#financeiro`). Sections are shown/hidden, focus is moved to the section heading, and `aria-current` is maintained. This gives a single-page dashboard feel without client-side routing libraries.

### 13.3 State and race handling

`sessao.mjs` holds a small in-memory state object: selected day, active ticket entry, customers, services, package templates, and current queue. It re-exports the authenticated API helper.

To avoid stale responses overwriting newer UI:

- Queue loads compare the token before and after the request.
- A daily date change clears the active ticket ID.
- Package lookups use an incrementing request counter.
- Financial summary and period loads use separate counters.
- An `ocupado` flag prevents overlapping mutations; polling is paused during mutations.
- `pageshow` with `persisted` forces a reload to avoid stale authenticated views.
- Mutating handlers use single-flight action wrappers and show errors as toasts.

### 13.4 API wrapper

`assets/api.mjs` centralizes fetch behavior:

- JSON headers and optional bearer token.
- `cache: 'no-store'`.
- 10-second timeout via `AbortSignal.timeout`.
- Safe JSON parsing.
- Errors carry `status` and optional `codigo` from the API body.

`auth-api.mjs` adds same-origin enforcement, session storage, automatic logout on `401`, and logout on `INSTANCIA_INDISPONIVEL`. Components generally use `escapeHtml` before injecting server-provided names into templates.

### 13.5 Public pages

The public queue page loads the company catalog, renders service checkboxes, validates at least one service, and submits the typed name/phone. It keeps a ticket per payload in memory so retrying the same submission is idempotent. On success it replaces the URL with the ticket tracker using the fragment.

The ticket page polls independently of the dashboard and stops when the status is final. It handles missing/invalid tickets and transient network failures gracefully.

## 14. Cross-cutting concerns

### 14.1 Input validation

Controllers validate the fields they use: positive safe-integer IDs, strict date shapes and real dates, non-empty names, e-mail patterns, phone digit counts, password length, service duplication, ticket format, and role-protected operations. SQL uses placeholders (`?`) for all user-provided values.

### 14.2 Timezone

All business dates use `Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', ... })`, which yields `YYYY-MM-DD` strings. The frontend uses the same approach to choose "today". Completion records both the local business date and a UTC timestamp for ordering. This avoids relying on the server's local timezone.

### 14.3 Rate limiting

`src/middleware/limitarRequisicoes.js` is an in-process, per-IP fixed-window limiter:

- Login: 30 requests / 15 minutes.
- Company registration: 10 / hour.
- Public queue entry: 60 / 15 minutes.

It returns `429` with `Retry-After`. State is a `Map` local to the process, resets on restart, is not shared across instances, and is capped at 10,000 tracked IPs (returning `503` when the cap is reached). `req.ip` handling depends on Express's proxy trust setting; `TRUST_PROXY_LOCAL=true` is only safe when a local trusted proxy is the sole access path and replaces client-address headers. Production deployments should also apply limits at the proxy.

### 14.4 Caching and browser behavior

Sensitive endpoints set `Cache-Control: no-store`, and fetch calls use `cache: 'no-store'`. The public ticket page avoids leaking the fragment through referrers. The service worker is not used; there is no offline behavior.

### 14.5 Security properties and limitations

Implemented protections:

- Bcrypt hashing with cost 12 and dummy-hash comparison for unknown accounts.
- JWT algorithm pinning, issuer/audience checks, short access lifetime, separate selection token.
- Membership/role/company revalidation on every authenticated request.
- Parameterized SQL and tenant scoping on all domain queries.
- Hashed, high-entropy, non-enumerable public tickets.
- Webhook HMAC verification with timing-safe comparison.
- Basic per-IP abuse limits.

Notable limitations:

- No refresh tokens, MFA, password reset flow, or account lockout beyond rate limiting. Password resets are manual SQL utilities.
- Access tokens live in `sessionStorage`, so XSS can steal them. Output escaping is used, but there is no Content-Security-Policy.
- No Helmet or explicit security headers, CORS policy, or HTTPS termination inside the Node process. HTTPS is expected from a reverse proxy/tunnel.
- Rate limiting is process-local and resets on restart.
- The chatbot supports one company per backend instance.
- Outbound "you are next" WhatsApp messages are simulated; only chatbot replies use the Graph API.
- The frontend depends on CDN availability for Tailwind, Font Awesome, and Google Fonts.
- There is no structured logging, metrics, tracing, health-check endpoint beyond the authenticated database test, or graceful shutdown hook.

## 15. Configuration

Environment variables are loaded from `Agendamento_BackEnd/.env` (see `.env.example`):

| Variable | Purpose |
|---|---|
| `PORT`, `HOST` | HTTP listener. Defaults: `3000`, `127.0.0.1`. |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL connection pool. |
| `AUTH_JWT_SECRET` | HS256 secret; must be at least 32 bytes for auth to work. |
| `WEBHOOK_VERIFY_TOKEN` | Meta webhook handshake token. |
| `WHATSAPP_APP_SECRET` | Meta app secret used to verify webhook HMAC. |
| `WHATSAPP_ACCESS_TOKEN` | Graph API bearer token for replies. |
| `WHATSAPP_PHONE_NUMBER_ID` | Expected phone number ID and reply sender. |
| `WHATSAPP_EMPRESA_ID` | Single tenant served by this chatbot instance. |
| `WHATSAPP_API_VERSION` | Graph API version such as `v23.0`. |
| `PUBLIC_BASE_URL` | HTTPS public origin used to build the entry link. |
| `TRUST_PROXY_LOCAL` | Enables Express `trust proxy` for loopback proxies only. |
| `DEMO_PASSWORD` | Optional fixed password for the demo script. |
| `TEST_MYSQL_URL` | MySQL URL used by integration tests; suite is skipped without it. |

`PERMISSÃO.sql` contains an example grant of `SELECT`, `INSERT`, and `UPDATE` for the application account. Applying migrations or running the demo script requires additional schema/DDL privileges. The runtime account does not need `DELETE` under normal operation.

## 16. Running, demo data, and tests

Backend commands (`Agendamento_BackEnd`):

```bash
npm ci
npm start       # node src/server.js
npm run dev     # nodemon
npm run demo    # build/demo data
npm test        # node --test
```

The demo script (`scripts/preparar-demo.js`):

- Reads `DB_NAME`, creates the schema from `Projeto_Agendamento.sql` only when the database has no tables (rewriting the SQL database name safely).
- Applies all six migrations on every run.
- Upserts demo user `demo-admin@example.invalid`, two companies (Demo Centro and Demo Jardins), one customer/service/package per company, and memberships.
- Preserves existing records and credentials; prints a generated password only for a newly created account.

Tests:

- `test/limites.test.js` — unit test for the rate limiter.
- `test/auth.test.js` — HTTP auth/tenant tests with a mocked database pool; no MySQL needed.
- `test/fila.integration.test.js` — end-to-end integration against a randomly named temporary MySQL database. It applies the schema/migrations, starts the app on an ephemeral port, and exercises concurrency, duplicate prevention, package debit/refund, service isolation, tickets, public entry idempotency, financial rounding/periods, login/company switching, inactive companies, and expired tokens.
- Without `TEST_MYSQL_URL`, the integration suite is reported as skipped.
- There are no automated browser tests; the integration suite checks that the dashboard/public pages and their static modules are served with `200`.

## 17. Operational flow summary

A typical staff interaction:

1. User logs in; if multiple companies exist, selects one and receives a company-bound JWT.
2. Dashboard loads customers, services, package templates, and today's queue.
3. Staff selects/creates a customer and one or more services. The server locks the company, validates services/packages, debits sessions, assigns the next position, and inserts the entry and items in one transaction.
4. The browser shows the ticket and link. The customer can track position/status through the ticket page.
5. Staff calls the next customer (`agendado -> confirmado`) and later completes or cancels the entry.
6. Completion snapshots financial rows; cancellation before start refunds package sessions. A simulated next-customer WhatsApp log is emitted after completion.
7. The financial page reads immutable snapshots for today/week/month or a selected period.

This design keeps the critical invariants in the database transaction rather than in browser state, while keeping the deployment small: one Node process, one MySQL database, and no build step.
