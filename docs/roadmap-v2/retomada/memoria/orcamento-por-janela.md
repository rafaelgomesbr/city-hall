---
name: orcamento-por-janela
description: Plano Max 5x; trabalho da V2 orçado por janela de 5 h e por semana com o medidor orcamento.py; nunca estourar
metadata:
  type: feedback
---

Rafael (2026-10-24): "use agentes conjuntos pra acelerar, temos a assinatura 5x; faça o desenvolvimento por seção de 5 h, não estoure a seção jamais, ocupe todos os tokens mas sem estourá-los".

**Why:** ele bateu limite de sessão e de semana várias vezes (avisos de 2026-09 e 2026-10 nos transcritos) e o trabalho parava.

**How to apply:** antes de disparar agentes, rodar `python3 -I ~/.claude/skills/roadmap-sem-parar/orcamento.py`; tetos e custos por tarefa na seção 6 da skill `roadmap-sem-parar`. Paralelizar com Sonnet em worktrees até preencher a janela; monitor em segundo plano; janela cheia, esperar o fim com sleep em segundo plano. Relacionado: [[trabalhar-sem-parar]].
