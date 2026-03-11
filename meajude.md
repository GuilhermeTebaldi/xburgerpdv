# Diagnostico do sistema atual e evolucao segura para novos segmentos

Data: 2026-03-11

## 1) Resposta direta a sua pergunta

Sim, sua percepcao esta correta: hoje o sistema esta modelado principalmente para operacao de lanchonete/food service.  
Para um negocio de material de construcao (ou varejo geral), varias partes funcionam, mas categoria e estoque precisam evoluir para nao gerar limitacoes operacionais.

---

## 2) Como o sistema esta hoje (estado real)

### 2.1 Dominio de produto e categoria

- Categorias de produto no frontend/state: `Snack`, `Drink`, `Side`, `Combo` (fixas).
- No backend transacional principal (Prisma), enum de categoria: `SNACK`, `DRINK`, `SIDE` (fixas).
- Produto e pensado com receita de insumos (BOM): cada produto consome ingredientes.

Evidencias no codigo:
- `types.ts` -> `Product.category` e `SaleOrigin/SalePayment`.
- `backend/prisma/schema.prisma` -> `enum ProductCategory { SNACK DRINK SIDE }`.
- `backend/src/validators/product.validator.ts` -> categoria valida apenas `SNACK|DRINK|SIDE`.

### 2.2 Estoque e custo

- O estoque principal e de **insumo** (`Ingredient`), nao de SKU final.
- Venda baixa estoque via receita (`recipe`) e registra custo por insumo.
- Criacao de produto exige receita com pelo menos 1 insumo no backend de produto.
- Existe material de limpeza separado, tambem com estoque proprio.

Evidencias no codigo:
- `backend/src/services/product.service.ts` -> produto sem receita e rejeitado.
- `backend/src/services/sale.service.ts` -> baixa estoque por ingrediente e valida saldo.
- `types.ts` -> `Product.recipe`, `Sale.recipe`, `stockDebited`.

### 2.3 Unidades e conversoes

- Ha conversoes especiais focadas em cozinha: `kg<->g` e `l<->ml`.
- Fluxo historico preservado para receitas antigas/fractionais.

Evidencias:
- `utils/recipe.ts` -> regras de conversao e exibicao de unidade.

### 2.4 Canais e fluxo de venda

- Origem da venda suportada no fluxo atual: `LOCAL`, `IFOOD`, `APP99`, `KEETA`.
- Existe resumo financeiro de apps com metrica `Diferenca Apps = Receita app - Referencia`.
- Pagamento dividido ja existe (`DIVIDIDO`) com modos:
  - `PEOPLE` (por pessoas)
  - `MIXED` (mesma pessoa, multiplas formas)

Evidencias:
- `types.ts` e `backend/src/types/frontend.ts`.
- `utils/appChannelSummary.ts` (formula da diferenca).
- `backend/src/services/state-command.service.ts` (validacoes de dividido).

---

## 3) O que funciona para qualquer segmento (aproveitavel)

- Fluxo de PDV (venda, pagamento, cancelamento, confirmacao).
- Multiforma de pagamento, inclusive dividido.
- Auditoria, historico e controles de sessao/estado.
- Estrutura SaaS com usuarios e isolamento por dono de estado.
- Estoque com movimentacao e trilha de custo (conceito util para varejo em geral).

---

## 4) Onde nao atende bem material de construcao hoje

### 4.1 Categorias fixas

- Nao existe categoria dinamica por empresa/tenant.
- "Snack/Drink/Side" nao representa "cimento, eletrica, hidraulica, ferramentas..." etc.

### 4.2 Modelo de estoque focado em receita

- Material de construcao costuma vender SKU pronto (saco cimento, tinta, parafuso), nao "receita".
- Hoje a baixa e pensada por ingrediente consumido, nao por item revendido diretamente.

### 4.3 Unidade comercial mais ampla

- Segmentos de construcao exigem unidade por `un`, `cx`, `m`, `m2`, `m3`, `kg`, `lt`, fracionamento especifico.
- Regras atuais de conversao tratam principalmente cozinha (g/ml).

### 4.4 Cadastros e atributos de varejo tecnico

- Podem faltar campos importantes para esse segmento:
  - codigo de barras / SKU fabricante
  - marca, modelo, variacao (cor, bitola, voltagem)
  - multiplo de venda (caixa fechada, fracionado, minimo)
  - politicas fiscais e classificacoes (dependendo da operacao)

### 4.5 Integrações de canal

- Canais atuais sao de delivery de comida (`IFOOD/99/KEETA`), nao marketplaces/operacoes comuns de material.

---

## 5) Risco de tentar "forcar" o sistema atual sem evolucao

- Categoria errada em relatorios e dashboard.
- Estoque inconsistente (baixa por receita onde deveria baixar por SKU).
- Custo/margem distorcidos.
- Maior risco de erro operacional no caixa e no inventario.
- Regressao se alterar enums/fluxos centrais sem compatibilidade.

---

## 6) Estrategia segura recomendada (sem quebrar lanchonete)

Principio: **nao substituir o que funciona; adicionar camadas de extensao por perfil de negocio.**

### Fase 0 - Congelamento e baseline

- Mapear fluxo atual de food como "perfil padrao".
- Criar suite de regressao obrigatoria (pagamento simples, dividido, app sale, estorno, estoque).

### Fase 1 - Extensao de dominio (aditiva)

- Adicionar `businessProfile` por tenant: `FOOD` (default), `RETAIL_BUILDING`, etc.
- Criar categorias dinamicas por tenant (`product_categories`), sem remover enum antigo de imediato.
- Introduzir tipo de produto:
  - `RECIPE` (modelo atual food)
  - `SIMPLE_STOCK` (baixa direta por SKU)

### Fase 2 - Estoque multi-estrategia

- Manter baixa por receita para `RECIPE`.
- Implementar baixa por item para `SIMPLE_STOCK`.
- Preservar trilha auditavel de movimentos e custo medio/ultimo custo conforme regra definida.

### Fase 3 - UI condicionada por perfil

- No perfil FOOD, manter telas/atalhos atuais.
- No perfil RETAIL, exibir categorias dinamicas e cadastro de SKU com atributos tecnicos.
- Nao abrir "segunda UX paralela confusa"; reutilizar a tela principal com variacao por perfil.

### Fase 4 - Migração e rollout controlado

- Sem migração destrutiva.
- Feature flags por tenant.
- Rollout gradual (piloto -> grupo pequeno -> geral).

---

## 7) Plano de rollback (obrigatorio)

- Toda mudanca com migration aditiva e reversivel.
- Backup antes de cada release de schema.
- Feature flag para desligar novo fluxo sem derrubar o PDV.
- Se houver erro: voltar tenant para perfil/fluxo antigo imediatamente.

---

## 8) Testes minimos obrigatorios antes de producao

### Regressao do que ja existe

- Venda normal com PIX/DEBITO/CREDITO/DINHEIRO.
- Pagamento dividido `PEOPLE` e `MIXED`.
- Cancelar dividido e retorno ao fluxo normal.
- Origem `LOCAL/IFOOD/APP99/KEETA` e calculo de diferenca apps.
- Estorno e recomposicao de estoque.

### Novos cenarios (perfil material de construcao)

- Cadastro de categoria dinamica.
- Venda de SKU simples com baixa correta.
- Venda fracionada por unidade suportada.
- Concorrencia de estoque (duas vendas simultaneas).
- Relatorio de custo/margem coerente.

---

## 9) Conclusao pratica

Hoje o sistema e forte para lanchonete e pode continuar assim sem risco.  
Para atender material de construcao com qualidade profissional, a evolucao correta e tornar categoria e estrategia de estoque configuraveis por perfil de negocio, em camadas aditivas, com rollout gradual e regressao automatizada.
