# Timeline de implementações

Esta timeline resume os marcos identificados no histórico Git e as alterações realizadas nesta conversa. As datas dos marcos registrados correspondem às datas dos commits; as alterações de 19/11 ainda estão no espaço de trabalho e não foram confirmadas em commit.

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
