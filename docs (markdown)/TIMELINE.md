# Timeline de implementações

Esta timeline resume os marcos identificados no histórico Git e as alterações realizadas no espaço de trabalho. As datas indicam quando cada marco foi integrado ao repositório ou trabalhado localmente.

## 20/10/2026 — Início do projeto

- Criação inicial do banco de dados e de parte do backend.

## 22/10/2026 — Primeira interface e WhatsApp

- Criação de uma interface visual para demonstrar a ideia do sistema.
- Primeiras tentativas de integração com a API Cloud da Meta e documentação da verificação do webhook.
- Criação do README do projeto.

## 10/11/2026 — Conexão e identificação da empresa

- Ajustes de conexão com o banco de dados.
- Registro de empresa por ID e token, conforme o histórico do projeto.
- Atualizações no README.

## 15/11/2026 — Painéis, catálogo e financeiro

- Melhorias no banco de dados e na interface HTML e CSS.
- Modularização dos painéis do cliente e do estabelecimento.
- Criação das páginas de serviços e pacotes e dos resumos financeiros diário, semanal e mensal.
- Inclusão de navegação entre páginas e exportação em PDF do histórico de vendas.

## 17/11/2026 — Autenticação, pacotes e fila

- Implementação do login com acesso a múltiplas empresas e seleção de loja.
- Atribuição de pacotes aos clientes.
- Disponibilização de link individual para acompanhar a posição na fila.
- Complementação das instruções de uso no README.

## 19/11/2026 — Cadastro e comunicação com o cliente

- Alteração da entrada pública para buscar clientes pelo telefone dentro da empresa, ignorando pontuação e o prefixo brasileiro 55.
- Inclusão do cadastro de empresa e de sua conta administradora na tela de login.
- Implementação do webhook do chatbot para responder com o link de entrada e consultar a posição de um número com entrada ativa. A operação depende da configuração da WhatsApp Cloud API e, atualmente, atende uma empresa por instância.
- Documentação da instalação do `cloudflared` e da abertura de um link temporário de demonstração.

Os avisos automáticos ao próximo cliente continuam simulados.


## Melhorias após a análise operacional

- Cancelamentos de atendimentos ainda não iniciados devolvem a sessão do pacote; cancelamentos após o início não geram estorno.
- A busca por telefone passou a ser compartilhada pelo balcão e pela entrada pública, com isolamento entre empresas.
- Foram adicionados limites básicos de requisições para login, cadastro de empresa e entrada pública.
- A suíte foi executada com MySQL de teste: 15 testes aprovados, incluindo concorrência, isolamento e estorno.

## 21/11/2026 — Inclusão do Next.js e PostgreSQL

- O PR #1 adicionou a aplicação em `nextjs-app`, com Next.js, TypeScript e PostgreSQL 16. A aplicação reúne login, painel, fila pública, acompanhamento por senha, catálogo, pacotes e financeiro.
- Foram incluídos o Docker Compose, o esquema inicial do Drizzle e um script de dados de demonstração. A versão Express com MySQL permaneceu disponível no repositório.

## 22/11/2026 — Correções e documentação da execução local

- Atualização das dependências do React, regeneração do lockfile e ajustes de TypeScript, parâmetros de rotas e cookies para o Next.js 16.
- Atualização dos comandos, da configuração e dos metadados de migração do Drizzle.
- Validação da instalação limpa, do build com Webpack e da criação e carga de dados de demonstração em um PostgreSQL 16 temporário.
- Documentação no [README](Readme.md#nextjs-e-postgresql-no-windows) da primeira execução e dos comandos para iniciar novamente a aplicação no Windows.

## 22/11/2026 — Edição de serviços e pacotes no painel

- Administradores e gerentes passaram a editar os serviços e os modelos de pacote pelo painel da versão Next.js e PostgreSQL. A API restringe as alterações aos registros da empresa selecionada.
- A migração do catálogo permite publicar uma nova versão do modelo para futuras atribuições e preservar as condições dos pacotes já atribuídos a clientes.
- A build com Webpack e os testes de integração com PostgreSQL temporário passaram. A migração ficou pendente no banco local, que estava desligado.

## 22/11/2026 — Validação do cadastro de clientes

- No balcão e na entrada pública da fila, o cadastro passou a exigir nome e sobrenome em campos separados nas versões Next.js com PostgreSQL e Express com MySQL.
- O formulário e a API exigem o formato de WhatsApp `82 988887777`, com um espaço após o DDD e sem hífen. O servidor grava apenas os dígitos e continua encontrando cadastros antigos com pontuação ou prefixo 55.

## 22/11/2026 — Cancelamento de entradas na fila

- Na versão Next.js com PostgreSQL, a empresa pode cancelar pelo painel e o cliente pode cancelar a própria entrada pela tela do ticket enquanto aguarda na fila.
- O cancelamento retira a entrada da fila ativa e devolve a sessão reservada do pacote, quando houver. A checagem de TypeScript passou. O fluxo de cancelamento ainda não foi testado com o PostgreSQL em execução.

## 22/11/2026 — Cadastro sem fila e gestão de pacotes por cliente

- No balcão do painel Next.js, administradores e gerentes podem cadastrar clientes sem selecionar um serviço ou gerar uma senha. O cliente fica pré-selecionado na aba **Clientes**.
- A aba **Clientes** permite buscar por nome ou telefone, exibe os dois dados em cada resultado e reúne a consulta de saldo e validade, a atribuição e a remoção de pacotes. A atribuição foi movida da aba **Serviços e pacotes** para essa tela.
- A remoção impede o uso do pacote em novos atendimentos e preserva o histórico. A [migração do PostgreSQL](nextjs-app/src/db/migrations/0002_customer_package_cancellation.sql) adiciona o estado de cancelamento.
- A checagem de TypeScript e os testes com API e banco simulados passaram. O build foi bloqueado por uma falha de permissão ao criar diretórios. A migração ficou pendente no PostgreSQL local.

## 22/11/2026 — Uso de pacotes durante o atendimento

- Na aba **Fila** do painel Next.js, o barbeiro pode escolher um pacote válido para cada serviço compatível no cartão **Em Atendimento**.
- Ao concluir o atendimento, o sistema valida o saldo, desconta uma sessão por serviço coberto e registra o uso no financeiro na mesma transação. Pacotes já debitados no balcão aparecem como **Pacote registrado**.
- A checagem de TypeScript e o build de produção com Webpack passaram. O teste de ponta a ponta ficou pendente porque o PostgreSQL local estava indisponível.

## 23/11/2026 — Cadastro de outra empresa pelo painel

- Na versão Next.js, o botão **Criar outra empresa** aparece ao lado de **Sair** para administradores. O formulário pede o nome, o e-mail e o WhatsApp da nova empresa.
- A mesma conta recebe acesso de administrador à nova empresa e abre seu painel ao concluir o cadastro. No próximo login, o usuário pode escolher qual empresa acessar.
- A checagem de TypeScript, o build com Webpack e o teste de integração com PostgreSQL temporário passaram. O teste verificou o cadastro, a mudança de empresa na sessão, a lista de empresas no login, a validação dos dados, o bloqueio de e-mail duplicado e a restrição a administradores.

## 23/11/2026 — Convites, recuperação de acesso e proteção da fila pública

- O Next.js passou a limitar tentativas de login, cadastro, recuperação de acesso e entrada pública. Os contadores são compartilhados no PostgreSQL e a API retorna `429` com `Retry-After` quando o limite é atingido.
- O primeiro cadastro e a criação de outra empresa pelo painel passaram a exigir convites de uso único, vinculados ao e-mail da loja e válidos por 72 horas.
- A tela **Esqueci minha senha** passou a aceitar um código emitido pelo suporte, válido por 30 minutos e de uso único. A redefinição de senha invalida as sessões anteriores.
- Administradores passaram a registrar pedidos de exportação e exclusão na aba **Clientes** e a acompanhar o protocolo por loja. O suporte analisa os pedidos e registra o resultado.
- O build de produção com Webpack, as migrações e a suíte de integração passaram em PostgreSQL descartável. Os comandos de emissão de códigos, consulta e resolução de pedidos e limpeza de registros expirados também foram verificados nessa base. Os testes no ambiente que receberá os comércios estão no [roteiro de testes do piloto](TESTES_PILOTO.md).

## 23/11/2026 — Identidade visual do Agendai e navegação lateral

- Nas versões Next.js e Express, o sistema passou a se chamar **Agendai**. O nome fica centralizado no topo do painel, com o nome do usuário autenticado e a empresa atual na mesma linha abaixo, separados por `•`.
- A navegação do painel passou para uma barra lateral à esquerda em telas maiores. Em telas estreitas, as opções abrem pelo botão **Menu do painel**.
- A nova paleta usa `#F1F5F0` como fundo dominante, `#77B567` como cor secundária e `#0E3604` nos destaques.
- O build de produção do Next.js com Webpack e os testes de autenticação do Express passaram. O teste de integração com MySQL ficou pendente por falta da configuração `TEST_MYSQL_URL`.
