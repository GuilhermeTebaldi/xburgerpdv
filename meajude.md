# Plano Seguro de Evolução para SaaS (sem tocar no Lanches do Bem)

Data: 2026-03-09  
Status: planejamento técnico (nenhuma alteração em produção foi feita)

## Objetivo
Criar o SaaS em `XBURGERPDV.COM.BR`, com múltiplos clientes isolados por subdomínio, sem perder dados e sem alterar o funcionamento atual de:
- `https://www.lanchesdoben.com.br/`
- `https://www.lanchesdoben.com.br/sistema/`

## Premissa de segurança (regra principal)
A forma mais segura é **não migrar nem alterar o stack atual do Lanches do Bem agora**.  
Crie um **stack novo e paralelo** para SaaS (novo backend + novo banco + novo frontend), e mantenha o legado intacto.

## Varredura técnica do sistema atual (achados reais)

### 1) Arquitetura atual é tenant único
- O banco não possui `tenant_id` nas tabelas de negócio.
- Arquivo: `backend/prisma/schema.prisma`.
- Consequência: hoje não há isolamento por cliente.

### 2) Estado operacional está em snapshot único
- Existe `app_state` singleton (`id=1`) e `app_state_backups` sem tenant.
- Arquivos:
- `backend/prisma/migrations/20260220190000_add_app_state_snapshot/migration.sql`
- `backend/prisma/migrations/20260221120000_add_app_state_backups/migration.sql`
- `backend/src/services/state.service.ts`
- Consequência: dados de todos clientes ficariam misturados se ligar múltiplas lojas no mesmo backend atual.

### 3) Fluxo de autenticação atual no frontend é frágil
- Login administrativo no sistema principal está hardcoded no frontend.
- Arquivo: `components/AdminLogin.tsx` (`meu@admin.com` / `admin123`).
- No painel de config crítica existe senha fixa local (`admin123`).
- Arquivo: `components/AdminDashboard.tsx`.
- Consequência: não atende padrão SaaS seguro.

### 4) Site institucional também está acoplado ao Lanches do Bem
- Login do modal admin é hardcoded no site institucional.
- Arquivo: `SITElanchesdoben/src/App.tsx` (`meu@admin.com` / `ben123`).
- Consequência: não escalável para múltiplos clientes.

### 5) Endpoints públicos sensíveis no backend atual
- Vários `GET` estão sem `authRequired`.
- Arquivos em `backend/src/routes/*.ts`.
- O fluxo de estado emite `X-State-Token` no `GET/HEAD` e aceita escrita por token.
- Arquivos:
- `backend/src/controllers/state.controller.ts`
- `backend/src/middlewares/state-auth.middleware.ts`
- `data/stateCommandClient.ts`
- Consequência: para SaaS, isso precisa ser endurecido antes de onboarding de múltiplos clientes.

### 6) CORS e deploy atuais são orientados ao domínio antigo
- CORS atualmente está configurado para `lanchesdoben.com.br`.
- Arquivo: `backend/render.yaml`.
- Build atual entrega site em `/` e sistema em `/sistema`.
- Arquivos:
- `scripts/merge-builds.mjs`
- `vite.config.ts`
- Consequência: é possível manter esse formato, mas para SaaS precisa camada de tenant por host.

## Decisão de arquitetura recomendada

### Estratégia recomendada (zero risco para o que já funciona)
1. Manter o stack atual do Lanches do Bem como está (legado congelado).
2. Criar stack novo SaaS separado:
- API SaaS (novo serviço)
- Banco SaaS (novo banco)
- Front SaaS (portal + sistema tenant-aware)
3. Entrar novos clientes apenas no stack novo.
4. Lanches do Bem continua no stack antigo até você decidir migrar com janela controlada.

## Domínios e subdomínios (recomendação)

### Nome padrão de cliente
Use `cliente.xburgerpdv.com.br` (ex.: `lanchesdoben.xburgerpdv.com.br`).  
É melhor que `cliente.app.xburgerpdv.com.br` porque é mais simples para venda e suporte.

### Mapa recomendado
- `xburgerpdv.com.br` -> portal comercial/login SaaS
- `xburgerpdv.com.br/admingeral` -> painel super admin
- `app.xburgerpdv.com.br` -> API SaaS
- `*.xburgerpdv.com.br` -> entrada dos clientes (tenant por subdomínio)
- `www.lanchesdoben.com.br` e `/sistema` -> continuam no ambiente atual, sem alteração

## DNS no RegistroBR e Render (sem afetar Lanches do Bem)

### O que já existe
- `CNAME app.xburgerpdv.com.br -> xburger-backend.onrender.com` (aguardando verificação).

### O que adicionar no projeto SaaS
1. Domínio do portal (`xburgerpdv.com.br`) apontando para o host do frontend SaaS.
2. Wildcard `*.xburgerpdv.com.br` para o host do frontend tenant.
3. `app.xburgerpdv.com.br` para API SaaS.
4. Verificar certificado TLS de todos os domínios no provedor.

### Observação importante
Se seu provedor/plano não suportar wildcard direto como você precisa, use camada de proxy/CDN (ex.: Cloudflare) para rotear por host sem mexer no legado.

## Modelo de dados SaaS (alvo)

### Tabelas novas
1. `tenants`
- `id`, `slug`, `nome_fantasia`, `status`, `created_at`

2. `tenant_domains`
- `id`, `tenant_id`, `domain`, `is_primary`, `verified_at`

3. `tenant_users`
- `tenant_id`, `user_id`, `role`, `is_active`
- roles sugeridos: `OWNER_ADMIN`, `OPERATOR`, `AUDITOR`

### Alterações nas tabelas de negócio
Adicionar `tenant_id` em todas as tabelas operacionais e auditoria:
- `users` (ou usar `users` global + vínculo em `tenant_users`)
- `ingredients`, `products`, `product_ingredients`
- `operating_sessions`, `sales`, `sale_items`, `sale_item_ingredients`
- `refunds`, `refund_items`, `refund_item_ingredients`
- `stock_movements`, `cleaning_materials`, `audit_logs`
- `app_state`, `app_state_backups`

### Regra para `app_state`
Trocar singleton global por chave composta por tenant:
- `PRIMARY KEY (tenant_id, id)` com `id=1`
- backups com `tenant_id` e unique por `tenant_id + backup_day + kind`

## Autenticação e autorização (alvo)

### Tenant resolve por host
- Extrair tenant do `Host` (subdomínio) ou mapear por `tenant_domains`.

### JWT obrigatório para escrita e leitura privada
- JWT deve conter `tenant_id` e `role`.
- Não emitir token de escrita para usuário anônimo.
- Endpoints de estado e comandos devem validar tenant + role em todas as operações.

### Dois acessos por cliente (seu requisito)
1. Conta do dono/admin geral da loja:
- visão `ADMINISTRAÇÃO`, `ANÁLISE`, `CONFIG`, etc.

2. Conta do funcionário:
- visão operacional `CAIXA`, `ESTOQUE`, `VENDAS`, `OUTROS`.

## `/admingeral` (super admin SaaS)

### Funções mínimas
1. Criar tenant (slug único).
2. Criar usuário dono (admin da loja).
3. Criar usuário operador.
4. Vincular domínio/subdomínio do tenant.
5. Reset de senha por tenant.
6. Bloquear/desbloquear tenant.

### Credenciais iniciais que você sugeriu
- Email: `admingeral123@gmail.com`
- Senha: `Gui@1604`

Usar apenas como bootstrap inicial. No primeiro login:
1. Forçar troca de senha.
2. Ativar 2FA.
3. Mover credencial para segredo de ambiente (nunca hardcoded no frontend).

## Plano de execução em fases (sem perder dados)

### Fase 0 - Congelamento seguro do legado
1. Não alterar código/deploy do stack atual do Lanches do Bem.
2. Confirmar backup completo do banco atual.
3. Testar restauração desse backup em ambiente de teste.
4. Registrar checklist de rollback.

### Fase 1 - Infra paralela SaaS
1. Provisionar novo banco Postgres para SaaS.
2. Subir novo serviço backend SaaS (não reutilizar DB legado).
3. Subir frontend portal SaaS (`xburgerpdv.com.br`).
4. Configurar domínios novos e TLS.

### Fase 2 - Multi-tenant no backend novo
1. Implementar `tenants`, `tenant_domains`, `tenant_users`.
2. Introduzir `tenant_id` em todas as entidades.
3. Ajustar índices/uniques por tenant.
4. Aplicar filtros obrigatórios por tenant em todas as queries.
5. Revisar auditoria com `tenant_id`.

### Fase 3 - Segurança de acesso
1. Remover credenciais fixas do frontend.
2. Exigir JWT e role em rotas sensíveis.
3. Bloquear escrita por token anônimo de estado.
4. Rate limit e proteção de login.

### Fase 4 - Portal `admingeral`
1. Tela para cadastrar tenant + dois usuários (dono/funcionário).
2. Geração automática de subdomínio do cliente.
3. Fluxo de recuperação de senha e ativação.

### Fase 5 - Onboarding piloto
1. Criar tenant de teste (`lojateste.xburgerpdv.com.br`).
2. Validar isolamento completo de dados.
3. Validar permissões dono vs funcionário.
4. Só então abrir cadastro para clientes reais.

### Fase 6 - (Opcional) Migração futura do Lanches do Bem
1. Quando quiser migrar, fazer cópia do banco legado para staging.
2. Backfill para `tenant_id = lanchesdoben`.
3. Testes de integridade e reconciliação.
4. Cutover com janela controlada e rollback pronto.

## O que NÃO fazer agora (para não correr risco)
1. Não apontar novos clientes para o backend atual tenant único.
2. Não alterar schema do banco legado em produção neste momento.
3. Não remover/alterar `www.lanchesdoben.com.br` ou `/sistema` agora.
4. Não manter credenciais hardcoded em frontend.

## Checklist de validação antes de vender o SaaS
1. Teste de isolamento: cliente A não enxerga nenhum dado do cliente B.
2. Teste de permissão: operador não acessa área de dono.
3. Teste de backup/restore por tenant.
4. Teste de carga básica com múltiplos tenants.
5. Teste de recuperação de senha e bloqueio de conta.
6. Auditoria de ações críticas por usuário e tenant.

## Conclusão prática
Sim, é possível fazer exatamente o que você quer **sem alterar nada do Lanches do Bem agora** e sem perder dados, desde que a execução seja por stack paralelo SaaS e com multi-tenant real no backend novo.  
Esse é o caminho mais seguro para vender o sistema para várias lojas.
