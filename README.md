<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/temp/1

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Módulo OUTROS (Materiais de Limpeza)

- Nova aba principal `OUTROS` no topo.
- Controle separado do estoque de alimentos, com subabas internas `MATERIAIS` e `ESTOQUE`.
- Cadastro de material com `nome`, `unidade`, `custo`, `estoque`, `estoque mínimo` e `URL da foto`.
- Movimentações de entrada/saída vão para histórico permanente e aparecem na aba `MATERIAIS` do painel `ADMIN`.

## Módulo ADMIN - Aba ANALISE

- Nova aba `ANALISE` no painel `ADMIN` com foco em inteligencia de vendas historicas.
- Relatorios por produto vendido (sem depender de ingrediente), dia da semana, hora do dia e ranking por data.
- Indicadores de melhor/pior dia da semana, horario de pico e produtos lideres por dia.
- A analise usa o historico persistido em `globalSales` (estado sincronizado com o banco via API de estado).
