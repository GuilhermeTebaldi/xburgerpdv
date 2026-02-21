# Backend XBURGER (Produção)

Backend completo em **Node.js + Express + PostgreSQL + Prisma**, pronto para deploy no **Render**, preservando os fluxos de negócio já existentes no frontend.

## 1) O que foi inferido do frontend atual (sem alterar frontend)

### Fluxos reais existentes
- Venda no caixa: baixa automática de estoque por receita (`produto -> insumos`), com suporte a receita customizada e preço customizado por venda.
- Estorno no fluxo atual: desfaz a última venda e devolve insumos ao estoque.
- Estoque de insumos (alimentos): entrada e saída manual com histórico.
- Estoque de materiais de limpeza: fluxo separado do estoque de alimentos, com histórico separado.
- Sessão atual vs histórico global:
  - Sessão atual: vendas e movimentações do dia/caixa aberto.
  - Global: histórico administrativo permanente.
- Métricas operacionais: faturamento, custo de insumos e lucro líquido.

### Decisões de modelagem para cobrir 100% dos fluxos e manter integridade
- Vendas e estornos são transacionais (ACID).
- Não há estoque negativo silencioso.
- Toda ação crítica gera auditoria.
- Estorno parcial foi implementado para produção (além do estorno total já existente no frontend).
- Histórico contábil não é apagado fisicamente por operações normais.

## 2) Stack e arquitetura

- Runtime: Node.js 20+
- API: Express (REST)
- Banco: PostgreSQL
- ORM: Prisma
- Deploy alvo: Render

Estrutura:

- `backend/src/app.ts`: bootstrap da API, CORS, middlewares, roteamento
- `backend/src/server.ts`: inicialização via `process.env.PORT`
- `backend/src/services/*`: regras de negócio (controllers sem lógica crítica)
- `backend/src/controllers/*`: camada HTTP enxuta
- `backend/src/routes/*`: rotas REST
- `backend/prisma/schema.prisma`: modelo de dados
- `backend/prisma/migrations/20260220170000_init/migration.sql`: migração SQL inicial
- `backend/prisma/seed.ts`: seed idempotente do usuário admin e sessão aberta

## 3) Modelo de dados (entidades principais)

### Entidades implementadas
- `users`
- `ingredients`
- `products`
- `product_ingredients` (ProdutoInsumo)
- `stock_movements` (MovimentaçãoEstoque, incluindo alimentos e materiais)
- `cleaning_materials`
- `sales`
- `sale_items` (ItemVenda)
- `sale_item_ingredients` (snapshot da receita usada)
- `refunds` (Estorno)
- `refund_items`
- `refund_item_ingredients`
- `operating_sessions`
- `audit_logs`

### Garantias contábeis
- Venda:
  - valida disponibilidade de estoque;
  - baixa estoque de forma transacional;
  - grava custo no momento da venda;
  - grava snapshot da receita efetiva por item.
- Estorno:
  - total e parcial;
  - devolução proporcional de insumos;
  - atualização de `total_net`, `total_refunded` e status da venda.
- Movimentação manual:
  - entrada/saída com custo unitário e custo total;
  - impede negativo.

## 4) API REST (principal)

Base: `/api/v1`

### Saúde
- `GET /health`

### Auth
- `POST /auth/login`
- `GET /auth/me`

### Estado agregado (compatível com estrutura atual do frontend)
- `GET /state`
- `PUT /state` (requer `If-Match` + `X-State-Token` retornados pelo `GET`, ou `Authorization: Bearer <token>`)
- `DELETE /state` (requer `If-Match` + `X-State-Token` retornados pelo `GET`, ou `Authorization: Bearer <token>`)
- `POST /state/commands` (movimentações de estoque/venda/cadastros em fluxo transacional com versão otimista)

Retorna:
- `ingredients`
- `products`
- `sales`
- `stockEntries`
- `cleaningMaterials`
- `cleaningStockEntries`
- `globalSales`
- `globalCancelledSales`
- `globalStockEntries`
- `globalCleaningStockEntries`

Headers de sincronização:
- `ETag` / `X-State-Version`: versão atual do snapshot para controle otimista.
- `X-State-Token`: token assinado para autorização de escrita no snapshot legado.

### Insumos
- `GET /ingredients`
- `GET /ingredients/:id`
- `POST /ingredients`
- `PATCH /ingredients/:id`
- `DELETE /ingredients/:id` (soft deactivate)
- `GET /ingredients/movements?mode=manual|all&sessionId=...`
- `POST /ingredients/:id/movements`

### Produtos
- `GET /products`
- `GET /products/:id`
- `POST /products`
- `PATCH /products/:id`
- `DELETE /products/:id` (soft deactivate)

### Materiais de limpeza
- `GET /cleaning-materials`
- `GET /cleaning-materials/:id`
- `POST /cleaning-materials`
- `PATCH /cleaning-materials/:id`
- `DELETE /cleaning-materials/:id` (soft deactivate)
- `GET /cleaning-materials/movements?mode=manual|all&sessionId=...`
- `POST /cleaning-materials/:id/movements`

### Sessões
- `GET /sessions/current`
- `POST /sessions/current/close`

### Vendas e estornos
- `GET /sales?sessionId=...&includeRefunded=true|false&onlyRefunded=true|false`
- `GET /sales/:id`
- `POST /sales`
- `POST /sales/undo-last`
- `POST /sales/:id/refunds`

### Relatórios
- `GET /reports/overview?scope=current|all|session&sessionId=...&from=...&to=...`

### Auditoria
- `GET /audit/logs?entityName=...&entityId=...&limit=...`

## 5) Variáveis de ambiente

Arquivo de exemplo: `backend/.env.example`

Obrigatórias em produção:
- `NODE_ENV=production`
- `PORT` (Render define automaticamente)
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN` (ex: `12h`)
- `CORS_ORIGINS` (domínios do Vercel separados por vírgula)
- `SEED_ADMIN_EMAIL`
- `SEED_ADMIN_PASSWORD`
- `SEED_ADMIN_NAME`
- `DEFAULT_TIMEZONE`
- `APP_STATE_BACKUP_RETENTION_DAYS` (padrão `35`)
- `APP_STATE_BACKUP_SCHEDULER_ENABLED` (`true|false`, padrão `true`)
- `APP_STATE_BACKUP_CHECK_INTERVAL_MS` (padrão `3600000`)

Comando utilitário:
- `npm run backup:run --prefix backend` (força execução de backup diário/versionado + poda por retenção)

## 6) Execução local (sem etapa oculta)

1. Criar arquivo `.env` em `backend/` com base em `.env.example`.
2. Instalar dependências:
   - `npm install --prefix backend`
3. Gerar client Prisma:
   - `npm run prisma:generate --prefix backend`
4. Aplicar migração:
   - `npm run prisma:migrate:dev --prefix backend`
5. Seed inicial (admin + sessão aberta):
   - `npm run prisma:seed --prefix backend`
6. Rodar API:
   - `npm run dev --prefix backend`

## 7) Deploy no Render (exato)

### Opção A: Blueprint (recomendada)

1. Subir este repositório no GitHub.
2. No Render, abrir **New + > Blueprint**.
3. Apontar para o repositório.
4. Selecionar `backend/render.yaml`.
5. Definir os valores secretos:
   - `SEED_ADMIN_EMAIL`
   - `SEED_ADMIN_PASSWORD`
6. Deploy.

O Render irá:
- criar PostgreSQL (`xburger-postgres`);
- buildar API;
- executar migração (`prisma migrate deploy`);
- executar seed idempotente (`prisma seed`);
- subir serviço web.

### Opção B: Manual (sem blueprint)

1. Criar PostgreSQL no Render.
2. Criar Web Service (Node), `Root Directory = backend`.
3. Build Command:
   - `npm ci && npm run prisma:generate && npm run build`
4. Start Command:
   - `npm run prisma:migrate:deploy && npm run prisma:seed && npm run start`
5. Configurar env vars listadas na seção 5.
6. Deploy.

## 8) Segurança e consistência

- CORS restrito por `CORS_ORIGINS`.
- Transações ACID para venda e estorno.
- Sem estoque negativo silencioso.
- Auditoria persistente (`audit_logs`) para operações críticas.
- Chaves estrangeiras explícitas e checks no SQL de migração.

## 9) Observação de validação local nesta execução

Neste ambiente de trabalho, a instalação de dependências foi bloqueada por resolução DNS (`ENOTFOUND` para `registry.npmjs.org`).
Por isso, não foi possível concluir `npm install`/`tsc` aqui, mas todos os arquivos de código, migração, scripts e deploy foram entregues.
