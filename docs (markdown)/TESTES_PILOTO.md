# Roteiro de testes do piloto do Next.js

Execute este roteiro em homologação antes de convidar os primeiros comércios. Use duas lojas fictícias, um administrador com acesso a ambas, uma conta `CAIXA` e clientes de teste. Valide o acesso pelo domínio HTTPS que será usado no piloto e use uma base separada dos dados reais.

## Suíte de integração

Na pasta `nextjs-app`, aplique as migrações no PostgreSQL descartável e gere o build. Inicie uma instância apontando para essa base. Para a suíte, configure `TRUSTED_CLIENT_IP_HEADER=x-real-ip` na instância isolada, pois ela envia endereços IP fictícios no cabeçalho. Veja os detalhes de configuração no [guia de operação do piloto](Readme.md#operação-do-piloto-no-nextjs).

```powershell
npm.cmd run db:migrate
npm.cmd run build -- --webpack
npm.cmd start
```

Em outro terminal, na mesma pasta, ajuste a URL da aplicação e a conexão para os valores da instância de teste.

```powershell
$env:PILOT_TEST_BASE_URL = 'http://127.0.0.1:3000'
$env:PILOT_TEST_DATABASE_URL = 'postgresql://usuario:senha@127.0.0.1:5433/agendamento_teste'
npm.cmd run test:pilot
```

A suíte deve concluir com **1 teste aprovado** e **0 ignorados**. Ela verifica o uso único de convites e códigos sob concorrência, o isolamento de solicitações entre lojas, a restrição a administradores, a entrada pública repetida com o mesmo ticket e os limites por origem.

## Validação manual em homologação

| Cenário | Como testar | Resultado esperado |
| --- | --- | --- |
| Convite para primeiro cadastro | Emita um convite e abra **Cadastrar empresa com convite**. Tente com outro e-mail, com o e-mail correto e, por fim, reutilize o código. Teste também um convite expirado. | Só o primeiro uso válido cria a loja e abre seu painel. Os demais casos exibem erro. |
| Convite para outra empresa | Como administrador, abra **Criar outra empresa**. Tente com um convite de primeiro cadastro e depois com um convite `nova-loja` para o e-mail da filial. | O convite `nova-loja` permite criar a empresa e abrir o painel da filial. No próximo login, as duas lojas aparecem para seleção. |
| Recuperação de acesso | Entre em dois navegadores. Abra **Esqueci minha senha**, confira o contato do suporte e emita dois códigos para a mesma conta. Teste o primeiro código, use o segundo e tente reutilizá-lo. Teste também um código que tenha expirado. | Só o código vigente e ainda dentro do prazo funciona. A senha antiga deixa de funcionar e as duas sessões anteriores perdem acesso. |
| Limites e proxy | Em homologação, use dois dispositivos em redes diferentes. De uma origem, ultrapasse um limite da tabela abaixo. Depois faça a mesma operação pela segunda origem. Tente também enviar um valor próprio no cabeçalho de IP pelo domínio público. | A primeira origem recebe `429` com `Retry-After`. A segunda tem cota própria por origem. O proxy substitui o cabeçalho enviado pelo cliente e o servidor de origem só aceita conexões do proxy. |
| Limite por conta | Tente login sem sucesso para o mesmo e-mail, alternando entre origens com cota. Depois tente entrar em outra conta. | O mesmo e-mail é limitado na 21ª tentativa dentro de 15 minutos. Outra conta ainda pode entrar se sua origem tiver cota. |
| Exportação e exclusão | Como administrador, selecione um cliente e envie um pedido de cada tipo. Repita o pedido enquanto está pendente. Consulte a lista pelo terminal do suporte, resolva um protocolo de teste e atualize o painel. | A loja vê os dois protocolos e seus estados. Pedidos duplicados ficam bloqueados enquanto pendentes. O cadastro segue acessível enquanto o suporte analisa o pedido. |
| Permissões de dados | Tente abrir uma solicitação como `CAIXA`. Na outra loja, consulte o histórico e tente solicitar a exportação informando o ID de um cliente da primeira loja. | A API retorna `403` para `CAIXA` e `404` para a solicitação com ID de outra loja. O histórico mostra apenas pedidos da loja atual. |
| Fluxo de atendimento | Pelo celular, entre na fila e abra o ticket. No painel, chame e conclua um atendimento de teste com pacote. Em outra entrada com sessão reservada, cancele antes de iniciar. | O ticket acompanha a fila, a conclusão baixa uma sessão e registra o valor no financeiro, e o cancelamento antes do início devolve a sessão reservada. |

### Limites esperados

| Operação | Limite por origem | Primeira tentativa bloqueada |
| --- | --- | --- |
| Login | 30 em 15 minutos | 31ª |
| Cadastro, incluindo criação de outra loja | 10 em 1 hora | 11ª |
| Entrada pública | 60 em 15 minutos | 61ª |
| Recuperação | 15 em 15 minutos | 16ª |

Para isolar o limite por origem do login, distribua as tentativas entre e-mails fictícios. Ao testar a expiração de uma janela, aguarde o prazo e confirme que a rota volta a processar requisições.

## Critério para abrir o piloto

Confirme a suíte aprovada, dois acessos de loja funcionando pelo domínio HTTPS, um atendimento completo pelo celular e pelo balcão, um código de recuperação entregue pelo canal do suporte e um protocolo de dados acompanhado até a resolução. Registre a data, o ambiente e o resultado de cada cenário. Corrija falhas que impeçam cadastro, recuperação, atendimento ou isolamento entre lojas antes de enviar os convites reais.
