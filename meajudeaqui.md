# GUIA COMPLETO PARA REPLICAR O PAINEL (GERAL + ANALISE) NO OUTRO SITE

Objetivo: transformar as abas `GERAL` e `ANALISE` em painel executivo + inteligência comercial, sem remover nada, sem mexer em backend/banco e reaproveitando os dados já existentes.

## 1) Regras que eu segui (e você deve manter)

1. Não remover nenhuma funcionalidade existente.
2. Não alterar lógica de backend nem banco.
3. Só complementar camada de visualização/análise no frontend.
4. Reutilizar os dados já carregados na página.
5. Não duplicar consultas.
6. Padronizar visual dos gráficos com tema único.

## 2) Arquivos criados/alterados

1. `utils/chartTheme.ts` (novo)
2. `utils/salesAnalytics.ts` (expandido)
3. `components/AdminSalesAnalyticsTab.tsx` (reestruturado)
4. `components/AdminDashboard.tsx` (aba GERAL expandida)

## 3) O que foi criado no tema visual único

Arquivo: `utils/chartTheme.ts`

1. Paleta centralizada (`DASHBOARD_CHART_COLORS`) para:
   - grid, eixos, receita, custo, lucro
   - caixa estimado, caixa informado, diferença
   - canais (balcão, iFood, 99, Keeta)
2. Estilo único de tooltip (`DASHBOARD_TOOLTIP_STYLE`) com borda/sombra/radius padrão.

Resultado: todos os gráficos passaram a seguir a mesma identidade visual.

## 4) O que foi adicionado no motor de analytics (sem backend)

Arquivo: `utils/salesAnalytics.ts`

### 4.1 Novos tipos e estruturas

1. `ChannelKey` (`LOCAL`, `IFOOD`, `APP99`, `KEETA`)
2. Estruturas para:
   - heatmap (`SalesAnalyticsHeatmapRow`)
   - curva acumulada (`SalesAnalyticsCumulativePoint`)
   - ticket médio por período (`SalesAnalyticsTicketPoint`)
   - eficiência por canal (`SalesAnalyticsChannelEfficiencyPoint`)
   - inteligência (`SalesAnalyticsIntelligence`)

### 4.2 Novos datasets calculados

1. `charts.heatmap` (dia da semana x hora)
2. `charts.cumulativeDaily` (acumulado por hora)
3. `charts.ticketByPeriod.day|week|month`
4. `charts.channelEfficiency`
5. `dayTimeline` (linha do tempo diária)
6. `intelligence` com:
   - `deadHours`
   - `productDependency`
   - `salesStability`
   - `weeklyTrend`

### 4.3 Regras dos cálculos

1. Agrupamento de pedido para ticket médio:
   - usa `saleDraftId` quando existe
   - fallback para `sale.id`
2. Receita de app:
   - usa `appOrderTotal` quando válido
   - senão usa `sale.total`
3. Horas mortas:
   - pega os horários ativos com menor volume (top 3 menores)
4. Dependência de produto:
   - `% = receita do produto líder / receita total`
   - risco se `>= 50%`
5. Estabilidade:
   - média diária, desvio padrão e variação (`stddev / média`)
   - classificação:
     - `<= 18%` estável
     - `<= 35%` moderada
     - `> 35%` instável
6. Tendência semanal:
   - compara semana atual vs anterior por receita
   - `> +8%` crescimento
   - `< -8%` queda
   - senão estável

## 5) O que foi implementado na aba ANALISE

Arquivo: `components/AdminSalesAnalyticsTab.tsx`

### 5.1 Organização em 5 blocos

1. **Bloco 1 – Indicadores rápidos**
   - vendas analisadas
   - faturamento histórico
   - melhor/pior dia
   - horário pico/menor

2. **Bloco 2 – Comportamento de vendas**
   - vendas por dia da semana (barra)
   - vendas por hora (linha)
   - heatmap dia x hora (matriz)
   - curva acumulada do dia (linha)
   - ticket médio por período (dia/semana/mês)
   - momentos do dia (madrugada/manhã/tarde/noite)

3. **Bloco 3 – Produtos**
   - ranking horizontal (quantidade)
   - detalhe do produto selecionado
   - líder por dia da semana
   - melhores/piores dias e lista top produtos

4. **Bloco 4 – Aplicativos**
   - cartões de resumo app (já existentes, mantidos)
   - eficiência por canal (métrica alternável):
     - pedidos
     - faturamento
     - ticket médio
   - tabela consolidada por canal

5. **Bloco 5 – Inteligência comercial**
   - horas mortas + sugestão de promoção
   - dependência de produto + alerta
   - estabilidade de vendas
   - tendência semanal
   - histórico diário top 10

### 5.2 Estados locais adicionados

1. `selectedProductKey`
2. `ticketPeriod` (`day|week|month`)
3. `efficiencyMetric` (`orders|revenue|ticket`)

### 5.3 Componentes auxiliares internos

1. `SectionHeader`
2. `StatCard`
3. `getHeatmapColor`
4. formatadores (`currency`, `int`, `%`)

## 6) O que foi implementado na aba GERAL

Arquivo: `components/AdminDashboard.tsx`

### 6.1 Novos datasets (sem consulta nova)

1. `stockOutCostBreakdown`:
   - custo de baixa de estoque por dia + total
2. `cleaningStockCostBreakdown`:
   - custo de materiais de limpeza por dia + total
3. `generalFinanceSeries`:
   - por dia: faturamento, custos totais, lucro
4. `revenueDistributionData`:
   - participação por origem (`LOCAL`, `IFOOD`, `APP99`, `KEETA`)
5. `cashEvolutionSeries`:
   - por fechamento diário:
     - estimado
     - informado
     - diferença
6. `cashDifferenceStatus`:
   - diferença do último ponto

### 6.2 Gráficos adicionados

1. **Evolução Financeira** (linha)
   - faturamento por dia
   - custo por dia
   - lucro por dia

2. **Distribuição de Receita** (pizza)
   - Balcão
   - iFood
   - 99
   - Keeta

3. **Fluxo Financeiro** (barra comparativa)
   - Entradas
   - Custos
   - Lucro

4. **Evolução do Caixa Diário** (linha)
   - Caixa estimado
   - Caixa informado
   - Diferença

Importante: todos os blocos antigos da aba GERAL foram preservados.

## 7) Observação importante sobre “Caixa informado”

No histórico disponível (`DailySalesHistoryEntry`) não existe campo explícito “caixa final informado”.  
Para manter 100% sem alterar backend, usei `openingCash` como linha “Caixa informado” no gráfico histórico e o “Caixa estimado” pela fórmula já existente:

`openingCash + totalRevenue - totalPurchases - cashExpenses`

Se no outro projeto existir campo de caixa final real, substitua a série `informed` por esse campo.

## 8) Ordem prática para replicar no outro sistema (não SaaS)

1. Copie `utils/chartTheme.ts`.
2. Leve as expansões de `utils/salesAnalytics.ts`.
3. Substitua a implementação de `components/AdminSalesAnalyticsTab.tsx` pela versão nova.
4. Aplique no `components/AdminDashboard.tsx`:
   - imports `recharts` e `chartTheme`
   - helpers de data/formato
   - novos `useMemo` de séries
   - 4 novos blocos de gráfico na aba GERAL
5. Garanta que `recharts` esteja instalado no projeto.
6. Rode build local e valide:
   - sem quebra das abas antigas
   - sem chamadas extras
   - sem alteração de backend

## 9) Checklist rápido de validação

1. Aba GERAL:
   - mantém cards antigos
   - mantém controle de caixa/histórico/demonstrativo/canais
   - mostra 4 gráficos novos
2. Aba ANALISE:
   - mostra 5 blocos
   - heatmap renderiza
   - ticket alterna dia/semana/mês
   - eficiência alterna pedidos/faturamento/ticket
   - inteligência exibe horas mortas/dependência/estabilidade/tendência
3. Nenhuma rota nova no backend.
4. Nenhuma migration nova no banco.
5. Nenhum dado histórico removido.

## 10) Dependências e build que usei

1. Biblioteca de gráficos: `recharts`
2. Build validado com:
   - `npm run build`
   - `npm run build:sistema`

---

Se a estrutura do outro site for “quase igual”, você só precisa mapear os nomes dos arquivos/componentes equivalentes e aplicar a mesma lógica acima.
