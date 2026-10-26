---
name: roadmap-sem-parar
description: Modo autônomo do Roadmap V2 do Defesa Civil 360. Use quando o Rafael pedir para "continuar", "não parar", "seguir o roadmap", "trabalhar até entregar" ou retomar o trabalho da V2 sem instrução específica. Encadeia implementar, CI, validar em sessão nova, corrigir e avançar, sem parar para explicar. Só para em bloqueio estritamente humano, e mesmo assim registra e segue com o que estiver desbloqueado.
---

# Roadmap sem parar (modo autônomo)

Regra do Rafael de 2026-10-14: "não pare para me explicar a não ser que seja estritamente necessário, não fique ocioso, trabalhe sem parar até entregar o roadmap". Ela se soma à regra de 2026-10-05 (sem parar entre etapas) e à de 2026-10-13 (o que só uma pessoa resolve vai para `docs/roadmap-v2/pendencias-humanas.md`, e o trabalho continua). Esta skill NÃO afrouxa nenhuma regra de qualidade, de segurança ou da política D-30 (`docs/roadmap-v2/28-execucao-e-validacao.md`): ela só tira as paradas desnecessárias.

## 1. O que conta como parar sem necessidade (proibido)

- Encerrar o turno com "o fluxo está rodando, te aviso quando terminar". Espere no próprio turno: laço `until` em primeiro plano (até 10 min por chamada, repetindo) ou Monitor, e siga quando o resultado chegar.
- Encerrar o turno para resumir o que foi feito, perguntar "posso seguir?", oferecer opções ou pedir confirmação de algo que a política, o STATUS ou uma decisão anterior já respondem.
- Esperar o Rafael para ler CI: o CI se lê com `~/.local/bin/gh` e `GH_TOKEN` tirado da credencial do git (`printf "protocol=https\nhost=github.com\n\n" | git credential fill | sed -n 's/^password=//p'`), sem imprimir o token.
- Ficar ocioso enquanto um job longo roda: use o tempo para o próximo trabalho que não dependa dele (preparar a próxima etapa, evidência, documentação), sem tocar no que o job mede.

Mensagens ao Rafael durante o laço: no máximo uma linha de estado quando algo muda de fase. Nada de recapitular.

## 2. O laço

Repita até não haver nada desbloqueado:

1. **Reconstruir o estado pelo repositório** (nunca pela conversa): `git status`, `git log --oneline -10`, `docs/roadmap-v2/ESTADO-ATUAL.md`, `node scripts/roadmap/gerar-estado.mjs --conferir`, a seção 1 do STATUS.
2. **Escolher a próxima ação**, nesta ordem:
   - etapa REPROVADA: corrigir pela skill `executar-etapa` (uma correção por etapa, a partir do "Motivo do veredito" e do "Conserto mínimo"; E22 sempre por último);
   - etapa PENDENTE da fase atual com dependências e CPs fechados: implementar pela skill `executar-etapa`;
   - candidato commitado sem CI completo verde: subir com `[ci completo]` e acompanhar até o fim;
   - candidato com CI verde e ainda não validado: validar numa SESSÃO NOVA (seção 3);
   - gate RECOMENDADO pelo gatekeeper: é do Rafael (seção 4).
3. **Executar** com subagentes e Workflow quando couber: implementadores por área em paralelo SÓ quando os arquivos forem disjuntos, revisor independente em Opus por área, rodada de conserto do que o revisor achar, e só então o commit. Modelo sempre explícito (Sonnet por padrão, Opus em risco alto e como revisor).
4. **Commitar e subir** no ramo da fase, sem pedir licença (D-30): um commit por etapa com pathspec exato. Registro de candidato toca SÓ a lista permitida da seção 5 de `28` (`STATUS.md`, `ESTADO-ATUAL.md`, `VEREDITO.md`, `RISCO-ACEITO.md`, `validacao/**`, `docs/relatorios-v2/**`). `pendencias-humanas.md` NÃO está na lista: mude-o ANTES do commit que vira candidato, nunca no registro.
5. **Voltar ao passo 1.**

## 3. Validação em sessão nova sem o Rafael abrir conversa

A D-30 exige que quem implementou não valide. Uma sessão nova do `claude` em modo não interativo cumpre isso:

```
CLAUDE=$(ls -d ~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude | sort -V | tail -1)
cd /Users/rafaelgomes/Documents/city-hall && "$CLAUDE" -p "Valide a F00 no SHA <sha7>" --model claude-opus-5-5 > <scratchpad>/validacao-<sha7>.log 2>&1
```

Rode em segundo plano, espere pelo fim no mesmo turno e então leia o resultado PELO REPOSITÓRIO (`VEREDITO.md` e STATUS), não pelo log. Se a chamada for negada pelo ambiente ou o executável não existir, registre "validação de `<sha7>` pendente de sessão nova" no STATUS e em `pendencias-humanas.md` e siga com o que estiver desbloqueado. Esta sessão nunca valida o que ela mesma implementou ou orquestrou.

## 4. As únicas paradas legítimas

Pare (uma mensagem curta, com o que já está registrado e o comando exato para retomar) SÓ quando todas as ações do passo 2 estiverem bloqueadas por algo estritamente humano:

- aprovar gate e fazer merge ou push em master (H09), a não ser que o Rafael tenha deixado autorização permanente e escrita no STATUS;
- decidir checkpoint (CP-xx) ou premissa que nenhuma decisão anterior cobre;
- prova que só uma pessoa ou um aparelho físico dá, quando ela trava a etapa seguinte (se não trava, registre e siga);
- credencial, contrato ou conta que só ele tem;
- a política de risco: gatilho da seção 13 de `28` que exige sessão nova (contexto compactado, fase nova, risco crítico).

Antes de parar: tudo o que é humano está em `pendencias-humanas.md` com o que fazer, onde ler e quem decide; o STATUS tem o ponto de parada; a árvore está limpa e enviada.

## 5. Nunca, por causa desta skill

- Marcar etapa VALIDADA ou CONCLUÍDA, ou gate APROVADO, sem o gatekeeper e o Rafael.
- Decidir um CP pelo Rafael, ou tratar premissa como fato.
- Seguir sem prova, aceitar risco, pular teste ou afrouxar teste para fechar uma etapa mais rápido.
- Reescrever histórico, fazer merge ou push em master.
- Contornar negação do ambiente ou do classificador de permissões: registre e siga com o resto.

## 6. Orçamento por janela de 5 h (regra do Rafael de 2026-10-24, plano Max 5x)

"Use agentes conjuntos para acelerar; faça o desenvolvimento por janela de 5 h; ocupe todos os tokens mas nunca estoure a janela."

- **Medidor:** `python3 -I ~/.claude/skills/roadmap-sem-parar/orcamento.py` (ou `--json`). Soma o custo equivalente (preço da API como peso: Opus 5/25, Sonnet 3/15, Haiku 1/5 por milhão) de TODAS as sessões e subagentes, inclusive a validação em sessão nova.
- **RECALIBRADO em 2026-10-24 14:40:** com 105 gastos na janela o painel do Rafael mostrava 0%: os avisos antigos eram de outro plano. Tetos provisórios 600 por janela e 8000 por semana; a fonte de verdade é o `/usage` do Rafael, e o medidor serve para comparar custo entre tarefas. Pergunte o percentual quando houver dúvida em vez de parar.
- **Tetos antigos (superados)** (`You've hit your session limit` a 136, 140, 150 e 197; `weekly limit` a 1821): janela de 5 h com teto de trabalho 115, semana (reinicia sábado 10:00) com teto 1700. O medidor reparte o que sobra da semana pelas janelas restantes (60% do tempo com trabalho) e dá o teto da janela atual.
- **Custo aproximado por tarefa** (recalibrar com o medidor): implementador Sonnet em etapa S de 5 a 10, M de 15 a 25, L de 30 a 45; revisor Opus de 10 a 20; rodada de validação por diferença (D-31) de 60 a 100; orquestrador Opus de 10 a 20 por janela (manter o contexto enxuto, delegar leitura).
- **Antes de disparar** qualquer agente ou lote: rodar o medidor e só disparar se `janela_restante` cobrir a estimativa mais 15 de margem. Lotes paralelos (worktrees, arquivos disjuntos, Sonnet) até preencher a janela.
- **Durante:** um monitor em segundo plano roda o medidor a cada 5 min e avisa a 100 na janela; a partir daí nada novo é disparado.
- **Janela cheia:** commitar o que estiver pronto, deixar o STATUS com o ponto de parada e esperar o fim da janela com um `sleep` em segundo plano até `janela_fim` (o aviso de fim re-invoca o orquestrador); não encerrar o turno.
