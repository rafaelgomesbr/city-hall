---
name: laco-tratado-em-paralelo
description: Laço de revisão e correção com mais de 3 voltas vai para paralelo e o desenvolvimento segue; sempre atualizar o /progresso
metadata:
  type: feedback
---

Rafael (2026-10-25): "sempre que ficar preso em um loop de revisão correção por mais de 3 vezes, vc tem que tratar isso em paralelo e seguir o desenvolvimento. Não podemos ficar ociosos aguardando a finalização de um item que nunca acaba. E sempre atualize a página /progresso. Força total, não pare de desenvolver."

**Why:** a F00 ficou duas semanas presa no laço da E09; ele tem prazo de entrega.

**How to apply:** na quarta volta de corrige e valida no mesmo item, o item vira trilha paralela (agente próprio, ou decisão sua registrada como pendência) e a fase seguinte começa no seu ramo (D-32, seção 20 de `28`). Depois de cada etapa, lote ou rodada, atualizar o /progresso (editorial e linha do tempo, gerar com `publicar-progresso.mjs --sem-deploy` e publicar pelo conector da Vercel, conferindo o uid do index.html). Relacionado: [[trabalhar-sem-parar]], [[orcamento-por-janela]].
