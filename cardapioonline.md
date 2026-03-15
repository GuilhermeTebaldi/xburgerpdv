# Cardapio Online por Mesa (SaaS) - Blueprint de Execucao (Acerto de Primeira)

Objetivo deste documento: servir como guia fechado para iniciar desenvolvimento do modulo de pedidos online por mesa, com risco minimo de regressao e alta previsibilidade de entrega.

Resultado esperado em producao:
- Admin Geral decide exatamente quais empresas terao o modulo ativo.
- Cliente na mesa escaneia QR da mesa correta e faz pedido.
- Pedido entra na fila da empresa e da mesa certa.
- Operador importa para o carrinho atual com 1 clique.
- Pagamento ocorre no fluxo existente (sem duplicar regra de caixa).
- Estoque continua baixando somente na confirmacao de pagamento.

Principios obrigatorios:
- Preservar o que ja funciona hoje.
- Nao criar caminhos paralelos de pagamento.
- Multi-tenant blindado por empresa.
- Idempotencia em todos os pontos criticos.
- Tudo auditavel.

Contexto tecnico atual validado no projeto:
- Estado operacional central no `app_state` por empresa (`ownerUserId/stateOwnerUserId`).
- Fluxo de caixa via `/api/v1/state/commands` com controle de versao (`If-Match` + `X-State-Token`).
- Comandos de draft existentes: criar, adicionar item, finalizar pagamento, confirmar pago, cancelar.
- Debito de estoque ocorre no comando `SALE_DRAFT_CONFIRM_PAID`.
- Admin Geral existe em `/admingeral` e ja gerencia empresas.
- Endpoint publico atual de produtos nao e suficiente para cardapio por mesa no modelo SaaS.

---

## 1. Analise de risco e impacto

### 1.1 Matriz de risco prioritario
| ID | Risco | Prob. | Impacto | Nivel | Sinal de alerta | Mitigacao obrigatoria |
|---|---|---:|---:|---:|---|---|
| R1 | Vazamento entre empresas | Media | Critico | Critico | Empresa A vendo mesa/produto da B | Escopo por `owner_user_id` em toda query + testes cruzados |
| R2 | Pedido duplicado por retry do cliente | Alta | Alto | Critico | Dois pedidos iguais em segundos | `clientRequestId` + unique key + resposta idempotente |
| R3 | Importacao duplicada por click duplo do operador | Media | Alto | Alto | Dois drafts ou itens dobrados | Lock transacional no pedido + status `IMPORTED` |
| R4 | Baixa de estoque fora do fluxo atual | Baixa | Critico | Critico | Estoque cai antes de pagar | Regra tecnica: so em `SALE_DRAFT_CONFIRM_PAID` |
| R5 | Regressao no caixa normal | Media | Critico | Critico | Falhas em balcao/entrega/apps | Feature flag por empresa + regressao completa |
| R6 | QR previsivel/forjado | Media | Alto | Alto | Acessos invalidos em massa | Token forte randomico + hash + rate limit |
| R7 | Fila de mesa lenta em pico | Media | Alto | Alto | Operador nao ve pedido no tempo | Indices, pagina, polling eficiente, sem full scan |
| R8 | Inconsistencia pedido->draft | Media | Alto | Alto | Pedido marcado importado sem draft | Transacao unica pedido + app_state |
| R9 | Permissao indevida | Baixa | Alto | Medio | OPERADOR habilitando feature | Permissao server-side estrita |
| R10 | Falha de rede no envio publico | Alta | Medio | Alto | Cliente reenviando varias vezes | Idempotencia no backend + UX de reenvio seguro |
| R11 | Conflito no fechamento de conta da mesa | Media | Alto | Alto | Pedido novo durante pagamento | Estado de visita `CHECKOUT_IN_PROGRESS` + regra de bloqueio |
| R12 | Cancelamento sem rastreio | Media | Alto | Alto | Divergencia caixa/cozinha | Motivo obrigatorio + trilha de auditoria |

### 1.2 Impacto tecnico por camada

Banco de dados:
- Nova modelagem sera adicionada sem mexer destrutivamente nas tabelas atuais.
- Risco principal e concorrencia na importacao e deduplicacao.

Backend:
- Aumenta superficie publica (rotas sem login), elevando risco de abuso.
- Exige validacao forte, limites de payload e rate limit.

Frontend sistema (`/sistema`):
- Nova aba `MESAS` com atualizacao frequente da fila.
- Nao pode bloquear nem degradar o fluxo de caixa atual.

Frontend publico (site):
- Rota QR mobile-first com fluxo rapido.
- Deve funcionar com internet instavel sem gerar duplicidade.

Operacao:
- Exige observabilidade nova (latencia, erro, fila, importacao).
- Sem monitoramento, incidente vira problema de loja rapidamente.

### 1.3 Restricoes de negocio que nao podem ser quebradas
- Empresa sem liberacao no Admin Geral nao pode usar pedido online.
- Pedido online nao pode furar permissao de usuario interno.
- Nao pode haver cobranca duplicada.
- Nao pode haver alteracao silenciosa de pedido pago.
- Historico e recibo devem manter rastreabilidade de mesa.

### 1.4 Metas nao funcionais (SLO inicial)
- P95 `GET menu por QR`: <= 350ms (sem imagem).
- P95 `POST pedido por QR`: <= 500ms.
- P95 `POST importar pedido`: <= 700ms.
- Erro 5xx em endpoints publicos: < 0.5%.
- Atualizacao da fila no operador: <= 5s via polling.
- Zero downtime de fluxo de caixa em release do modulo.

---

## 2. Pontos criticos identificados

### 2.1 Gaps atuais no codigo
1. Nao existe entidade de mesa.
2. Nao existe entidade de visita/conta aberta por mesa.
3. Nao existe fila de pedidos online por mesa.
4. Nao existe chave de idempotencia para pedido publico.
5. Nao existe comando de importacao mesa->draft no pipeline de estado.
6. Nao existe metadata de mesa em `SaleDraft`/`Sale` para recibo e historico.
7. Nao existe controle de feature "cardapio online" por empresa no Admin Geral.
8. Nao existe UX para pedido adicional/remocao/substituicao do cliente da mesa.
9. Nao existe politica de conflito quando conta esta em fechamento.
10. Nao existe monitoracao especifica do modulo.

### 2.2 Hotspots (arquivos que serao alterados)
Backend:
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/*`
- `backend/src/routes/index.ts`
- `backend/src/routes/user.routes.ts`
- `backend/src/controllers/user.controller.ts`
- `backend/src/services/user.service.ts`
- novos: `table.routes.ts`, `table.controller.ts`, `table.service.ts`, `public-table.routes.ts`, `public-table.controller.ts`
- `backend/src/validators/*` (novos validadores)
- `backend/src/services/state-command.service.ts` (novo comando de importacao)
- `backend/src/services/state.service.ts` (aplicacao atomica para importacao)

Frontend sistema:
- `types.ts` (novos campos opcionais de mesa)
- `data/stateCommandClient.ts` (novo comando)
- `App.tsx` (nova aba `MESAS`, importacao para pagamento)
- `components/Header.tsx` (botao aba MESAS)
- `components/PrintReceipt.tsx` (mostrar mesa no cupom)
- `components/SalesSummary.tsx` e/ou `AdminDashboard.tsx` (filtro/info de mesa)

Frontend Admin Geral (`SITElanchesdoben`):
- `SITElanchesdoben/src/admingeral/AdminGeralPage.tsx` (toggle de feature por empresa)

Frontend publico (`SITElanchesdoben`):
- nova rota de cardapio por token de mesa
- novo service para APIs publicas de mesa

### 2.3 Decisoes funcionais ja fechadas (para evitar ambiguidade)
- Controle de habilitacao e por empresa (owner), nao por usuario isolado.
- Pagamento permanece no fluxo atual.
- Pedido por QR entra em fila antes de virar pagamento.
- Sem exclusao fisica de historico operacional no fluxo normal.

---

## 3. Estrategia segura recomendada

### 3.1 Arquitetura alvo (simples, robusta, sem duplicar caixa)

Camadas:
1. `Configuracao de empresa` (feature flag online menu).
2. `Mesas e visitas` (qual mesa esta com conta aberta).
3. `Pedido publico por QR` (entrada segura e idempotente).
4. `Fila operacional` (painel MESAS para operador).
5. `Importacao para draft` (ponte para fluxo atual).
6. `Pagamento existente` (inalterado na regra de negocio).

### 3.2 Modelo de dados recomendado

#### Tabela: `company_settings`
- `owner_user_id` (PK, FK users.id)
- `online_menu_enabled` (bool not null default false)
- `online_menu_enabled_at` (timestamp null)
- `online_menu_enabled_by_user_id` (uuid null)
- `updated_at` (timestamp)

Uso:
- Fonte unica para decidir se empresa pode usar mesa/QR.

#### Tabela: `restaurant_tables`
- `id` (uuid PK)
- `owner_user_id` (uuid not null, index)
- `table_code` (varchar 30, not null)
- `table_label` (varchar 80, not null)
- `public_token_hash` (varchar 255, not null)
- `token_version` (int not null default 1)
- `is_active` (bool not null default true)
- `created_by_user_id`, `updated_by_user_id` (uuid null)
- `created_at`, `updated_at`
- `unique(owner_user_id, table_code)`

#### Tabela: `table_visits` (conta da mesa)
- `id` (uuid PK)
- `owner_user_id` (uuid not null, index)
- `table_id` (uuid not null, FK)
- `status` enum (`OPEN`, `CHECKOUT_IN_PROGRESS`, `CLOSED`)
- `opened_at`, `checkout_started_at`, `closed_at`
- `closed_by_user_id` (uuid null)
- `metadata_json` (jsonb null)

Regra:
- Uma visita `OPEN` por mesa (unique parcial `table_id where status in (OPEN, CHECKOUT_IN_PROGRESS)`).

#### Tabela: `table_order_requests` (cada envio do cliente)
- `id` (uuid PK)
- `owner_user_id` (uuid not null, index)
- `table_id` (uuid not null, FK)
- `visit_id` (uuid not null, FK)
- `public_request_id` (varchar 120, not null)
- `status` enum (`NEW`, `IMPORTING`, `IMPORTED`, `CANCELLED`, `FAILED`)
- `items_json` (jsonb not null)
- `requested_total` (numeric 14,2 not null)
- `imported_draft_id` (varchar 120 null)
- `imported_by_user_id` (uuid null)
- `imported_at` (timestamp null)
- `error_message` (varchar 500 null)
- `created_at`, `updated_at`
- `unique(owner_user_id, table_id, public_request_id)`

#### Tabela opcional (recomendada): `table_order_change_requests`
- usada para remocao/substituicao apos pedido ja aceito
- `id`, `owner_user_id`, `order_request_id`, `type` (`REMOVE_ITEM`,`REPLACE_ITEM`,`ADD_ITEM`), `payload_json`, `status`, `approved_by_user_id`, `reason`, `created_at`, `updated_at`

### 3.3 Extensao de tipos no estado (compatibilidade)
Adicionar campos opcionais sem quebrar dados existentes:

`SaleDraft`:
- `tableContext?: { tableId: string; tableCode: string; tableLabel: string; visitId: string }`

`Sale`:
- `tableContext?: { tableId: string; tableCode: string; tableLabel: string; visitId: string }`

Regra:
- Campo opcional para manter backward compatibility total.

### 3.4 Politica completa de novo pedido, remover e substituir (cliente na mesa)

#### Estado do item para decisao
Estados operacionais do item no contexto de mesa:
- `PENDING_REVIEW` (acabou de chegar, ainda nao importado)
- `QUEUED_FOR_PAYMENT` (importado em draft, ainda nao pago)
- `PAID` (pagamento confirmado)

#### Regras de negocio (simples e seguras)

A) Cliente faz novo pedido (rodada adicional)
- Sempre permitido enquanto visita `OPEN`.
- Cria novo `table_order_request` com `status=NEW`.
- Operador decide importar para o draft da mesma visita/mesa.

B) Cliente quer remover item
- Se item esta em `PENDING_REVIEW`: remove direto no pedido pendente.
- Se item esta em `QUEUED_FOR_PAYMENT`: vira solicitacao de alteracao; operador aprova e sistema atualiza draft.
- Se item esta em `PAID`: nao remove retroativamente; orienta novo fluxo de estorno/reembolso interno.

C) Cliente quer substituir item
- Implementacao segura: substituicao = `remover antigo + adicionar novo` (delta explicito).
- Mesmo gate de estado da remocao.
- Sempre registrar motivo e autor da aprovacao quando nao for automatico.

D) Cliente quer adicionar item
- Se visita `OPEN`: novo pedido/rodada normal.
- Se visita `CHECKOUT_IN_PROGRESS`: sistema pergunta no painel do operador se entra na conta atual ou vira proxima visita.

E) Conta em fechamento
- Ao entrar em `CHECKOUT_IN_PROGRESS`, pedidos novos entram como `NEW_PENDING_DECISION` (fila especial) ate operador decidir.

### 3.5 Contratos de API recomendados

#### Admin Geral
- `PATCH /api/v1/users/company/:stateOwnerUserId/online-menu`
- body: `{ "enabled": true|false }`
- resposta: `204`

#### Mesas (autenticado)
- `GET /api/v1/tables`
- `POST /api/v1/tables`
- `PATCH /api/v1/tables/:tableId`
- `POST /api/v1/tables/:tableId/regenerate-token`

#### Visitas e fila (autenticado)
- `GET /api/v1/table-visits?status=OPEN,CHECKOUT_IN_PROGRESS`
- `GET /api/v1/table-orders?status=NEW,FAILED`
- `POST /api/v1/table-orders/:orderId/import`
- `POST /api/v1/table-orders/:orderId/cancel` (com motivo)
- `POST /api/v1/table-orders/:orderId/change-request`

#### Publico QR
- `GET /api/v1/public/tables/:token/menu`
- `POST /api/v1/public/tables/:token/orders`
- `POST /api/v1/public/tables/:token/orders/:orderId/change` (opcional v1.1)

Resposta de criacao de pedido publico:
- `{ "orderId": "...", "publicRequestId": "...", "status": "NEW", "receivedAt": "..." }`

Resposta de importacao:
- `{ "orderId": "...", "draftId": "...", "table": {"id":"...","code":"2","label":"Mesa 2"}, "alreadyImported": false }`

### 3.6 Integridade transacional e concorrencia

Regras de implementacao:
- Toda importacao roda em 1 transacao SQL.
- Lock pessimista no `table_order_requests` alvo (`FOR UPDATE`).
- Se status ja `IMPORTED`, retorno idempotente sem mutacao.
- Atualizacao de `app_state` e status do pedido na mesma transacao.
- Em conflito de versao do `app_state`, retry curto controlado no backend (max 2).

Idempotencia em 3 niveis:
1. Cliente: `public_request_id` por envio.
2. Operador: importacao idempotente por `order_id`.
3. Estado: comando com `commandId` unico para replays.

### 3.7 Seguranca
- Token de mesa randomico (>=22 chars base64url) e armazenamento hash.
- Rotacao de token invalida QR antigo imediatamente.
- Rate limit por IP/token em endpoints publicos.
- Sanitizacao de texto (`note`) e limite de tamanho.
- Payload maximo de pedido (ex.: 25 linhas, qty max 50 por linha).
- Nao retornar dados sensiveis no publico (custos, ids internos de usuario, estado completo).

### 3.8 Observabilidade minima obrigatoria
- Logs estruturados com: `requestId`, `ownerUserId`, `tableId`, `visitId`, `orderId`, `draftId`, `action`.
- Auditoria persistente para:
- toggle de feature
- CRUD de mesa
- pedido publico recebido
- importacao
- cancelamento/alteracao
- Metricas:
- `table_orders_new_count`
- `table_orders_import_latency_ms`
- `table_orders_import_error_count`
- `public_qr_order_requests_total`
- `public_qr_order_rate_limited_total`

---

## 4. Implementacao conservadora e incremental

### Fase 0 - Planejamento fechado (sem codigo)
Entregas:
- Decisao de arquitetura aprovada.
- Politica de alteracao de pedido aprovada.
- Checklist de rollout e rollback aprovado.

Gate para avancar:
- Todos os estados e regras do item validados com operacao.

### Fase 1 - Migracoes de banco nao destrutivas
Entregas:
- Criar novas tabelas e enums sem alterar fluxo atual.
- Criar indices e constraints de idempotencia.
- Criar seeds minimos de configuracao (`company_settings` default false).

Gate:
- Migracao sobe e desce em homologacao sem perda.

### Fase 2 - Backend feature flag por empresa (Admin Geral)
Entregas:
- Endpoint para habilitar/desabilitar modulo.
- `UserService.list` inclui status do modulo.
- Auditoria dessas alteracoes.

Gate:
- Empresa ligada/desligada reflete corretamente no frontend de gestao.

### Fase 3 - Backend de mesas
Entregas:
- CRUD mesas.
- Regeneracao de token QR.
- Validacoes por role e por empresa.

Gate:
- Nao e possivel operar mesa de outra empresa.

### Fase 4 - Backend publico QR
Entregas:
- Endpoint menu por token.
- Endpoint criar pedido com idempotencia.
- Rate limit e validacao de payload.

Gate:
- Reenvio com mesmo `publicRequestId` retorna sucesso idempotente sem duplicar.

### Fase 5 - Backend fila + importacao para draft
Entregas:
- Endpoints de fila e importacao.
- Novo comando de estado `SALE_DRAFT_IMPORT_TABLE_ORDER` (ou equivalente atomico interno).
- Persistencia de `tableContext` no draft/venda.

Gate:
- Importacao duplicada nao duplica item nem draft.

### Fase 6 - Frontend Admin Geral (`/admingeral`)
Entregas:
- Coluna/acao de liberar pedido online por empresa.
- Mensagens de sucesso/erro.

Gate:
- Toggle funcional sem impactar acoes atuais de cobranca/bloqueio.

### Fase 7 - Frontend sistema (`/sistema`) - aba MESAS
Entregas:
- Nova aba `MESAS` (visivel so com feature ativa).
- Lista de mesas, visitas, pedidos `NEW`.
- Botao `Cobrar` importa e abre pagamento existente.
- Exibir mesa no carrinho, pagamento, historico e cupom.

Gate:
- Operador fecha pedido de mesa sem sair do fluxo atual.

### Fase 8 - Frontend publico QR
Entregas:
- Rota `cardapio/:token` com UX mobile.
- Envio de pedido e retorno de confirmacao.
- Fluxo de pedido adicional.
- Fluxo de remover/substituir conforme estado permitido.

Gate:
- Cliente consegue operar sem gerar duplicidade em rede ruim.

### Fase 9 - Observabilidade + alertas
Entregas:
- Painel de metrica.
- Alertas de erro/latencia/fila.
- Logs e auditoria validados.

Gate:
- Incidentes simulados possuem trilha de diagnostico.

### Fase 10 - Piloto e rollout gradual
Entregas:
- Piloto 1 empresa (7 dias).
- Ajustes.
- Rollout por lotes.

Gate de cada lote:
- sem regressao no caixa
- sem vazamento multi-tenant
- sem duplicidade financeira

### 4.11 Mapa objetivo de arquivos para iniciar desenvolvimento

Backend - novos arquivos:
- `backend/src/routes/table.routes.ts`
- `backend/src/routes/public-table.routes.ts`
- `backend/src/controllers/table.controller.ts`
- `backend/src/controllers/public-table.controller.ts`
- `backend/src/services/table.service.ts`
- `backend/src/validators/table.validator.ts`

Backend - alterar arquivos existentes:
- `backend/src/routes/index.ts`
- `backend/src/routes/user.routes.ts`
- `backend/src/controllers/user.controller.ts`
- `backend/src/services/user.service.ts`
- `backend/src/services/state-command.service.ts`
- `backend/src/services/state.service.ts`
- `backend/src/types/frontend.ts`
- `backend/src/validators/state-command.validator.ts`
- `backend/prisma/schema.prisma`

Frontend sistema:
- `types.ts`
- `data/stateCommandClient.ts`
- `App.tsx`
- `components/Header.tsx`
- `components/PrintReceipt.tsx`

Frontend Admin Geral:
- `SITElanchesdoben/src/admingeral/AdminGeralPage.tsx`

Frontend publico:
- `SITElanchesdoben/src/main.tsx` (rota)
- novo componente `SITElanchesdoben/src/cardapio/TableMenuPage.tsx`
- novo service `SITElanchesdoben/src/services/publicTableMenu.ts`

### 4.12 Definition of Ready (antes de codar)
- Regras de alteracao/remocao/substituicao aprovadas.
- Contratos de API aprovados.
- Modelo de dados aprovado.
- Plano de testes aprovado.
- Plano de rollback aprovado.

### 4.13 Definition of Done (para liberar producao)
- Todas as fases ate piloto concluidas com sucesso.
- Regressao completa verde.
- Observabilidade ativa.
- Rollback testado em homologacao.
- Checklist de go-live assinado.

---

## 5. Estrategia de rollback

### 5.1 Rollback funcional imediato (sem deploy)
- Desligar feature no Admin Geral por empresa.
- Resultado:
- aba `MESAS` some para empresa
- endpoints autenticados do modulo recusam
- endpoints publicos do token recusam novos pedidos
- fluxo de caixa antigo segue intacto

### 5.2 Rollback por camada

Backend modulo:
- despublicar rotas novas mantendo tabelas para auditoria.

Frontend sistema:
- esconder aba `MESAS` via flag.

Frontend publico:
- responder "pedido online indisponivel" para token da empresa.

### 5.3 Rollback de dados (nao destrutivo)
- Nao apagar tabelas em incidente inicial.
- Nao perder historico de pedidos de mesa.
- Tratar dados como trilha de investigacao.

### 5.4 Runbook de incidente

Incidente: duplicidade de importacao
1. Pausar endpoint de importacao por feature operativa.
2. Manter leitura da fila.
3. Auditar `orderId`, `publicRequestId`, `commandId`.
4. Corrigir idempotencia e reabrir gradualmente.

Incidente: vazamento multi-tenant
1. Desativar modulo globalmente.
2. Bloquear endpoints publicos do modulo.
3. Rodar auditoria de acesso por owner.
4. So reabrir apos patch validado em homologacao.

Incidente: fila atrasada
1. Reduzir polling e paginar melhor.
2. Checar indice de consulta.
3. Escalar recurso e retestar.

### 5.5 Criterio para rollback automatico em rollout
- erro 5xx > 2% por 5 min em endpoint publico
- latencia P95 importacao > 2s por 10 min
- qualquer evidencia de vazamento entre empresas

---

## 6. Estrategia de testes e validacao

### 6.1 Piramide de testes obrigatoria

Unitarios:
- validadores de payload
- regras de permissao
- transicoes de estado do pedido/visita
- funcoes de idempotencia

Integracao:
- CRUD de mesa escopado por empresa
- pedido publico por token valido/invalido
- importacao transacional para draft
- idempotencia de importacao
- metadado de mesa persistido em venda

E2E funcional:
1. Admin Geral libera empresa.
2. ADMGERENTE cadastra Mesa 2 e gera QR.
3. Cliente escaneia e faz pedido.
4. Pedido aparece na fila `MESAS`.
5. Operador importa e abre pagamento existente.
6. Operador confirma pago.
7. Validar baixa de estoque apenas na confirmacao.
8. Validar recibo/historico com mesa.

### 6.2 Testes especificos de remover/substituir/add

Caso A - remover antes de importar:
- cliente remove item pendente
- fila reflete novo total
- nada vai para draft de item removido

Caso B - substituir antes de importar:
- cliente troca item
- sistema grava delta explicito (remove+add)
- importacao gera itens corretos no draft

Caso C - remover apos importado (nao pago):
- gera `change request`
- operador aprova
- draft atualizado sem duplicidade

Caso D - alterar apos pago:
- sistema bloqueia alteracao direta
- orienta novo pedido ou estorno formal

Caso E - pedido novo durante checkout:
- pedido entra em estado pendente de decisao
- operador escolhe conta atual ou proxima visita

### 6.3 Testes de concorrencia
- 2 celulares enviando mesmo `publicRequestId` simultaneamente.
- 2 operadores importando mesmo pedido simultaneamente.
- conflito de versao no `app_state` durante importacao.

Esperado:
- sem duplicidade.
- sem deadlock prolongado.
- resposta idempotente consistente.

### 6.4 Testes de seguranca
- tentativa de token aleatorio em massa.
- payload malicioso (strings gigantes, campos extras).
- tentativa de cruzar `orderId` de outra empresa.
- verificacao de rate limit e bloqueio.

### 6.5 Testes de carga e resiliencia
- stress de leitura menu por QR.
- stress de criacao de pedidos em horario de pico.
- degradacao de rede no cliente (timeout/retry).
- indisponibilidade temporaria do backend e recuperacao.

### 6.6 Checklist de homologacao
- [ ] feature flag por empresa funcionando
- [ ] QR de mesa valida corretamente
- [ ] pedido novo aparece em ate 5s na fila
- [ ] importacao para draft funciona com 1 clique
- [ ] pagamento atual segue igual
- [ ] sem baixa antecipada de estoque
- [ ] remover/substituir conforme regra
- [ ] recibo e historico com mesa
- [ ] auditoria e logs completos
- [ ] rollback funcional validado

### 6.7 Checklist de go-live
- [ ] piloto aprovado por operacao
- [ ] alertas ativos
- [ ] runbook divulgado
- [ ] equipe treinada (ADMGERENTE/OPERADOR)
- [ ] janela de deploy e contingencia definida

### 6.8 Sucesso pos-go-live (primeiros 14 dias)
- erro 5xx do modulo abaixo de 0.5%
- zero incidente de vazamento multi-tenant
- zero duplicidade financeira confirmada
- tempo medio do pedido ao pagamento dentro da meta

---

Resumo executivo:
- O modulo sera construido como extensao segura do sistema atual, sem reescrever caixa e sem abrir risco de regressao.
- O fluxo de pedido online por mesa, inclusive novo pedido/remover/substituir, fica definido por estado e permissao, com idempotencia e auditoria.
- O plano incremental, com gates e rollback, permite iniciar desenvolvimento com alta chance de acerto de primeira em producao.
