---
name: trabalhar-sem-parar
description: "Rafael quer o roadmap V2 executado sem paradas para explicar; esperar CI dentro do turno, mas rodada de validação em sessão nova é disparada e o turno termina (D-31 P8)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 3d36cfc8-e822-4393-b93c-ef3d51f55862
  modified: 2026-10-21T01:24:57.254Z
---

Não encerrar o turno para explicar, resumir ou pedir confirmação. Esperar CI e jobs curtos no próprio turno (laço `until` em primeiro plano ou Monitor) e seguir para a próxima ação do roadmap. Só parar em bloqueio estritamente humano, registrando em `docs/roadmap-v2/pendencias-humanas.md`. O laço completo está na skill `roadmap-sem-parar`.

Exceção desde 2026-10-20 (D-31, item 8, aprovada por ele para economizar tokens): a rodada de validação numa sessão nova (horas) é disparada e o orquestrador sai do laço, deixando no fim do turno o comando de retomada. Enquanto ela roda, não commitar no checkout principal (o validador confere a árvore).

**Why:** em 2026-10-14 ele se irritou quando o turno terminava com trabalho curto rodando e nada acontecia; em 2026-10-20 pediu economia de tokens e aprovou "o orquestrador não fica esperando em laço".

**How to apply:** em qualquer pedido de continuar a V2, carregar a skill `roadmap-sem-parar`. Mensagens intermediárias de no máximo uma linha. O CI se lê com curl na API pública (60 chamadas por hora sem token) ou com `~/.local/bin/gh` e `GH_TOKEN` tirado da credencial do git. O /progresso publica pelo conector MCP da Vercel quando a CLI está sem login. Relacionado: [[fly-deploy-em-primeiro-plano]].
