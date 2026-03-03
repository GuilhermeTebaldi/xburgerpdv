# USO_REAL_PRODUCAO

Data da auditoria: 2026-03-02
Escopo: inventario tecnico do uso real em producao (Render) com base em codigo e configuracoes versionadas.
Regra aplicada: nenhuma conclusao sem evidencia.

## Evidencias usadas

Arquivos/linhas:
- `backend/render.yaml:2`, `backend/render.yaml:3`, `backend/render.yaml:37`, `backend/render.yaml:38`, `backend/render.yaml:41`, `backend/render.yaml:43`
- `backend/render.yaml:14`, `backend/render.yaml:20`, `backend/render.yaml:21`, `backend/render.yaml:47`, `backend/render.yaml:51`
- `backend/src/config/env.ts:8`, `backend/src/config/env.ts:24`, `backend/src/config/env.ts:25`, `backend/src/config/env.ts:43`, `backend/src/config/env.ts:47`
- `backend/prisma/schema.prisma:5`, `backend/prisma/schema.prisma:6`, `backend/prisma/schema.prisma:7`
- `backend/src/db/prisma.ts:3`
- `backend/src/server.ts:5`, `backend/src/server.ts:12`
- `backend/src/jobs/state-backup.scheduler.ts:26`, `backend/src/jobs/state-backup.scheduler.ts:27`, `backend/src/jobs/state-backup.scheduler.ts:33`, `backend/src/jobs/state-backup.scheduler.ts:40`
- `backend/src/scripts/run-state-backup.ts:7`
- `backend/src/services/state.service.ts:363`, `backend/src/services/state.service.ts:371`, `backend/src/services/state.service.ts:467`
- `backend/prisma/schema.prisma:400`, `backend/prisma/schema.prisma:408`
- `backend/src/app.ts:20`, `backend/src/app.ts:26`, `backend/src/app.ts:31`
- `data/appStorage.ts:30`, `data/stateCommandClient.ts:10`, `SITElanchesdoben/src/services/publicCatalog.ts:2`, `SITElanchesdoben/src/developer/DeveloperPortal.tsx:12`
- `backend/package.json:15`, `backend/package.json:18`, `backend/package.json:19`
- `backend/prisma/seed.ts:10`, `backend/prisma/seed.ts:11`, `backend/prisma/seed.ts:16`, `backend/prisma/seed.ts:18`
- `backend/src/app.ts:45`
- `backend/README.md:206`

Comandos/prints:
- `rg --files -g 'render.yaml'` -> apenas `backend/render.yaml`
- `rg -n "dpg-" backend backend/render.yaml backend/.env.example` -> sem ocorrencias
- `rg -n "envVarGroups|fromDatabase|databases:" backend/render.yaml` -> sem ocorrencias
- `rg -n "callback|oauth|redirect|auth/callback" backend/src` -> sem rota/callback OAuth; apenas callback interno do middleware CORS em `backend/src/app.ts`

## 1) Mapa de Producao

| Servico | Tipo | Dominios/CORS | DB Hostname | DB Name | Variaveis criticas | Observacoes |
|---|---|---|---|---|---|---|
| `xburger-backend` | Web Service | CORS explicito: `https://lanchesdoben.com.br`, `https://www.lanchesdoben.com.br` (`backend/render.yaml:21`). API tambem permite `localhost/127.0.0.1` e origem vazia (`backend/src/app.ts:21`, `backend/src/app.ts:26`, `backend/src/app.ts:31`). Frontends apontam para `https://xburger-backend.onrender.com` por fallback (`data/appStorage.ts:30`, `data/stateCommandClient.ts:10`, `SITElanchesdoben/src/services/publicCatalog.ts:2`). | **INDETERMINADO** (valor real de `DATABASE_URL` nao versionado; `sync: false`) | **INDETERMINADO** | `DATABASE_URL`, `JWT_SECRET` (hard-fail), `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` (seguranca), `NODE_ENV` | Start real em producao executa migracao + seed + app: `npm run prisma:migrate:deploy && npm run prisma:seed && npm run start` (`backend/render.yaml:8`, `backend/package.json:18`, `backend/package.json:19`). |
| `xburger-backup-daily` | Cron Job | N/A (nao expoe HTTP) | **INDETERMINADO** (valor real de `DATABASE_URL` nao versionado; `sync: false`) | **INDETERMINADO** | `DATABASE_URL` | Agenda: `20 4 * * *`; comando: `npm run backup:run` (`backend/render.yaml:41`, `backend/render.yaml:43`, `backend/package.json:15`). |

Achado adicional de infra:
- Nao existe recurso de banco declarado no blueprint versionado (`backend/render.yaml` nao possui `databases:`; comando `rg -n "databases:" backend/render.yaml` sem saida).
- Nao existe `envVarGroups` no arquivo versionado (`rg -n "envVarGroups" backend/render.yaml` sem saida).

## 2) Banco em uso

### O que esta comprovado
- O backend usa Prisma com **um unico datasource Postgres**: `datasource db` com `url = env("DATABASE_URL")` (`backend/prisma/schema.prisma:5-7`).
- Cliente de banco usado pela aplicacao: `new PrismaClient(...)` (`backend/src/db/prisma.ts:3`).
- Nao ha evidencia de multi-DB no backend (busca por outros clientes/ORMs sem ocorrencias relevantes).
- O cron de backup usa o mesmo stack de servico (`backend/src/scripts/run-state-backup.ts:7` -> `StateService` -> Prisma).

### O que NAO esta comprovado (faltando dado)
- Hostname real `dpg-...` e `database` real em producao: **nao disponivel no repositorio**.
  - Evidencia: `DATABASE_URL` esta como `sync: false` nos dois servicos (`backend/render.yaml:14-15`, `backend/render.yaml:47-48`).
  - Evidencia: busca por `dpg-` no repositorio nao retorna ocorrencias (`rg -n "dpg-" ...` sem saida).

### Mapeamento atual de uso do DB por servico
- `xburger-backend` -> usa `DATABASE_URL` em runtime, migracao e seed (`backend/render.yaml:8`, `backend/prisma/schema.prisma:7`).
- `xburger-backup-daily` -> usa `DATABASE_URL` para executar backup diario/versionado (`backend/render.yaml:43`, `backend/src/scripts/run-state-backup.ts:7`).

### Risco de expirar DB Free e impacto
- **Status do risco: INDETERMINADO com os dados atuais.**
  - Motivo: o plano/tipo do banco nao aparece no repositorio (nao ha `databases:` em `render.yaml`, nem print/export do recurso de banco no Render).
- **Impacto tecnico se o DB ficar indisponivel (por expiracao/suspensao/inatividade):**
  - Web service pode falhar no boot/deploy, pois start roda migracao + seed dependentes de DB (`backend/render.yaml:8`).
  - Cron de backup falha (`backend/render.yaml:43`, `backend/src/scripts/run-state-backup.ts:7`).
  - Rotas de negocio falham por dependencia de Prisma/DB.
  - `/health` pode continuar `200` sem verificar DB (`backend/src/app.ts:45`), gerando falso positivo operacional.

## 3) Cron / Backups

Tarefas agendadas identificadas:

1. Render Cron externo
- Servico: `xburger-backup-daily` (`backend/render.yaml:38`)
- Agenda: `20 4 * * *` (`backend/render.yaml:41`)
- Comando: `npm run backup:run` (`backend/render.yaml:43`)
- Script executado: `tsx src/scripts/run-state-backup.ts` (`backend/package.json:15`)
- Acao: chama `runDailyBackup()` (`backend/src/scripts/run-state-backup.ts:7`)

2. Scheduler interno no Web Service
- Inicializa no boot: `startStateBackupScheduler()` (`backend/src/server.ts:12`)
- Pode ser desabilitado por env: `APP_STATE_BACKUP_SCHEDULER_ENABLED` (`backend/src/jobs/state-backup.scheduler.ts:27`)
- Intervalo: `APP_STATE_BACKUP_CHECK_INTERVAL_MS` (`backend/src/jobs/state-backup.scheduler.ts:33`)
- Executa tambem 1x no startup (`backend/src/jobs/state-backup.scheduler.ts:40`)

O que o backup executa:
- Gera/atualiza backup diario por dia (`backend/src/services/state.service.ts:363`, `backend/src/services/state.service.ts:371`)
- Faz poda por retencao (`backend/src/services/state.service.ts:467`)
- Tabela alvo: `app_state_backups` (`backend/prisma/schema.prisma:400`)
- Unicidade por dia+tipo (idempotencia): `@@unique([backupDay, kind])` (`backend/prisma/schema.prisma:408`)

## 4) Dominios apontando para o servico

Comprovados:
- CORS permitido explicitamente:
  - `https://lanchesdoben.com.br`
  - `https://www.lanchesdoben.com.br`
  - Evidencia: `backend/render.yaml:21`
- Fallback de consumo da API (frontend) para:
  - `https://xburger-backend.onrender.com`
  - Evidencias: `data/appStorage.ts:30`, `data/stateCommandClient.ts:10`, `SITElanchesdoben/src/services/publicCatalog.ts:2`, `SITElanchesdoben/src/developer/DeveloperPortal.tsx:12`

Callbacks:
- Nao foram encontradas rotas OAuth/callback no backend (busca sem ocorrencias funcionais; apenas callback do middleware CORS em `backend/src/app.ts`).

## 5) Variaveis de ambiente: essenciais vs legado

### Em uso real (backend Render)

| Variavel | Servico | Status | Evidencia |
|---|---|---|---|
| `DATABASE_URL` | web + cron | **Essencial hard** | Obrigatoria no schema/env (`backend/prisma/schema.prisma:7`, `backend/src/config/env.ts:8`), declarada nos 2 servicos (`backend/render.yaml:14`, `backend/render.yaml:47`) |
| `JWT_SECRET` | web | **Essencial hard (web)** | Validada por `getAuthEnv()` (`backend/src/config/env.ts:24`, `backend/src/server.ts:5`) |
| `JWT_EXPIRES_IN` | web | Em uso (nao hard; tem default) | `backend/src/config/env.ts:25`, `backend/src/services/auth.service.ts:28` |
| `CORS_ORIGINS` | web | Em uso (seguranca; nao hard) | `backend/src/config/env.ts:43`, `backend/src/app.ts:31`, `backend/render.yaml:21` |
| `DEFAULT_TIMEZONE` | web + cron | Em uso (nao hard; tem default) | `backend/src/services/state.service.ts:363`, `backend/render.yaml:28`, `backend/render.yaml:49` |
| `APP_STATE_BACKUP_RETENTION_DAYS` | web + cron | Em uso (nao hard; tem default) | `backend/src/services/state.service.ts:467`, `backend/render.yaml:30`, `backend/render.yaml:51` |
| `APP_STATE_BACKUP_SCHEDULER_ENABLED` | web | Em uso (nao hard; tem default) | `backend/src/jobs/state-backup.scheduler.ts:27`, `backend/render.yaml:32` |
| `APP_STATE_BACKUP_CHECK_INTERVAL_MS` | web | Em uso (nao hard; tem default) | `backend/src/jobs/state-backup.scheduler.ts:33`, `backend/render.yaml:34` |
| `SEED_ADMIN_EMAIL` | web (seed no start) | Em uso; critica de seguranca | `backend/prisma/seed.ts:10`, `backend/render.yaml:22` |
| `SEED_ADMIN_PASSWORD` | web (seed no start) | Em uso; critica de seguranca | `backend/prisma/seed.ts:11`, `backend/prisma/seed.ts:16`, `backend/render.yaml:24` |
| `SEED_ADMIN_NAME` | web (seed no start) | Em uso (nao hard) | `backend/prisma/seed.ts:14`, `backend/render.yaml:26` |
| `NODE_ENV` | web + cron | Em uso (nao hard; tem default em parser) | `backend/src/config/env.ts:6`, `backend/src/app.ts:42`, `backend/render.yaml:12`, `backend/render.yaml:45` |

### Lixo/legado

Conclusao estrita para `backend/render.yaml`:
- **Nenhuma variavel orfa encontrada**. Todas as chaves declaradas no `render.yaml` aparecem em codigo/script de runtime, auth, seed ou backup.

Possivel legado fora do backend (nao usado para Render backend):
- `APP_URL` em `SITElanchesdoben/.env.example:9` aparece apenas como comentario/exemplo; nao ha referencia no codigo deste modulo.

## 6) Dados faltantes e como obter

Para fechar com precisao absoluta os campos `DB Hostname (dpg-...)` e `DB Name`:

1. No Render Dashboard:
- Abrir `xburger-backend` -> `Environment` -> copiar `DATABASE_URL` (pode mascarar usuario/senha).
- Abrir `xburger-backup-daily` -> `Environment` -> copiar `DATABASE_URL`.
- Extrair:
  - hostname: parte entre `@` e `:` (ex.: `dpg-xxxx...`)
  - database: parte apos a ultima `/` antes de `?`

2. Confirmar se ambos os servicos apontam para o mesmo banco:
- Comparar host + database das duas `DATABASE_URL`.

3. Confirmar risco Free:
- No recurso de banco no Render, verificar plano atual e estado (Free/Starter/etc.).
- Sem esse print/export, nao e possivel afirmar expiracao com evidencia.

## 7) Acoes recomendadas (curtas e seguras, sem mudar logica)

1. Registrar (em documento privado) o `DATABASE_URL` redigido de cada servico com host e database para fechar o inventario.
2. Adicionar healthcheck de DB separado de `/health` para evitar falso positivo quando o banco cair.
3. Garantir `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` fortes em producao, pois seed usa defaults fracos quando ausentes (`backend/prisma/seed.ts:16-19`).
4. Decidir explicitamente se quer manter backup em duplicidade (cron externo + scheduler interno) e documentar essa escolha operacional.

