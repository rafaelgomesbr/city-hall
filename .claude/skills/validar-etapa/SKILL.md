---
name: validar-etapa
description: Gatekeeper V0 do Roadmap V2 do Defesa Civil 360 (pedido "Valide V2-Fnn-Enn" ou "Valide a F00 no SHA x"). Roda numa sessão NOVA, fixa o SHA do commit candidato, confere o CI, escolhe os validadores pelas tags, chama-os em sequência como subagentes adversariais, confere a evidência de forma fail-closed e grava o VEREDITO com as versões da política. Não corrige nada e nunca transforma BLOCKED em PASS.
---

# Validar uma etapa da V2 (papel: gatekeeper)

Política: `docs/roadmap-v2/28-execucao-e-validacao.md` (seções 5 a 9, 12 e 15). Você é o gatekeeper. Você não implementa, não corrige, não emite RISCO ACEITO, não tira dimensão obrigatória e não converte BLOCKED em PASS. Você está numa sessão nova de propósito: não leia a justificativa do implementador.

## 0. Fixar o que vai ser validado

1. Entrada: o ID da etapa e o SHA do candidato (está na observação da etapa no STATUS como "candidato `<sha7>`", ou no commit `V2-Fnn-Enn: candidato`).
2. Confira e registre: `git rev-parse HEAD`; o diff `<sha candidato>..HEAD` só toca a lista permitida da seção 6 de `28` (se tocar outra coisa, PARE: o candidato não é o produto atual, peça um candidato novo); o SHA está no remoto (`git branch -r --contains <sha>`); `git status --porcelain` vazio.
3. Versões das regras (vão para o VEREDITO): `git log -1 --format=%H -- docs/roadmap-v2/28-execucao-e-validacao.md` (politica_validacao_sha), `-- docs/roadmap-v2/mapa-de-impacto.json` (mapa_impacto_sha), `-- .claude/skills/validar-etapa scripts/roadmap` (versao_gatekeeper). Se algum desses caminhos tiver mudança não commitada: BLOCKED ("regra não commitada").
4. CI: `gh run list --commit <sha> --json databaseId,status,conclusion,headSha` e, se vazio, o run do SHA descendente da lista permitida (seção 6 de `28`). Leia job a job (`gh run view <id> --json jobs`). Run pendente: espere. Sem `gh` ou sem run: a dimensão "Infra e CI" fica BLOCKED e você segue com as outras.

## 1. Montar a validação

1. `node scripts/roadmap/contexto.mjs V2-Fnn-Enn` e `node scripts/roadmap/tags.mjs V2-Fnn-Enn --diff <base>..<sha candidato> --json`. A base é o último commit antes do primeiro commit `V2-Fnn-Enn:` da etapa (ou o commit indicado no pedido, quando a fase foi implementada em lote).
2. A lista de validadores obrigatórios vem do script. Você pode acrescentar uma dimensão (registre o motivo); nunca tirar.
3. Rode `node scripts/roadmap/conferir-evidencia.mjs V2-Fnn-Enn --sha <sha>` quando existir. Enquanto não existir, confira à mão e diga isso no VEREDITO: pasta da etapa existe, `INDEX.md` com SHA-256 que bate, nenhum segredo, capturas nas larguras e temas exigidos se houver tag UI, sonda antes e depois se o risco for alto ou crítico.
4. Regressão seletiva: as suítes que o mapa de impacto liga aos caminhos do diff, mais `npm run test:isolamento`, typecheck e `npm run conferir:numeros`. Vermelho em item de gate anterior: FAIL com gatilho 2.
5. Herança: se esta é uma rodada depois de FAIL, a dimensão que passou na rodada anterior só é herdada se o diff entre os SHAs não toca o mapa de impacto dela. Registre "herdado de <sha7>, sem impacto".

## 2. Chamar os validadores, EM SEQUÊNCIA

Para cada dimensão, uma de cada vez:

1. Grave o estado da árvore: `git status --porcelain` e `git diff --stat` (devem estar vazios, salvo os arquivos de validação já gravados).
2. Chame o subagente da dimensão (`qa`, `ux`, `acessibilidade`, `seguranca-aplicacao`, `red-team`, `banco-de-dados`, `privacidade-lgpd`, `testes`, `especificacao`, `engenharia-entrega`) com `model` EXPLÍCITO (Sonnet; Opus só onde a seção 12 de `28` manda) e o prompt do arquivo `prompt-do-validador.md` desta skill, preenchido. Entregue: o bloco da etapa (do `contexto.mjs`), o diff `<base>..<sha>`, a seção `## Fatos` do `RESUMO.md` (NUNCA a `## Justificativa`), a lista da evidência, as decisões registradas (premissas da seção 9 do STATUS citadas pela etapa e o "O que NÃO deve ser implementado"), o run do CI e o caminho do arquivo de saída `docs/evidencias-v2/Gnn/V2-Fnn-Enn/validacao/<sha7>/<dimensao>.md`.
3. Depois que ele terminar, confira a árvore: qualquer mudança além daquele arquivo deixa a dimensão BLOCKED ("validador editou"); restaure com `git restore` e `git clean` só nos caminhos que ele alterou, antes do próximo validador.
4. Confira o relatório contra o formato da seção 15 de `28` e a evidência mínima da seção 8. Formato inválido, evidência incompatível, "Tentativas de reprovar" vazia ou "Não verificado" vazio em risco alto: a dimensão fica inconclusiva (BLOCKED).

## 3. Consolidar (fail-closed)

- Uma dimensão FAIL: veredito FAIL.
- Uma dimensão BLOCKED, inconclusiva, sem evidência ou em conflito: veredito BLOCKED.
- Conflito entre dois validadores: uma arbitragem com um subagente em Opus recebendo os dois relatórios; persistindo, BLOCKED para Rafael.
- Todas PASS (ou N/A pela tag ausente): PASS. Com pendência E4 ou E5 (de `humano_necessario: sim` ou da "Validação humana" da etapa que a regra global da seção 4 de `28` mantém humana, incluindo os gatilhos visuais): a etapa fica VALIDADA COM PENDÊNCIA HUMANA, listando cada item.
- RISCO ACEITO: você não emite. Se um critério BLOCKED admite aceite (seção 7 de `28`), escreva um rascunho `RISCO-ACEITO.md` para quem pode aceitar; se não admite, diga que não admite.

## 4. Registrar

1. Escreva `docs/evidencias-v2/Gnn/V2-Fnn-Enn/VEREDITO.md` pelo modelo `modelo-veredito.md` desta skill (acrescente a rodada nova no topo da tabela, nunca apague rodada anterior).
2. Linha da etapa no STATUS (seção 8): VALIDADA, VALIDADA COM PENDÊNCIA HUMANA, REPROVADA ou BLOQUEADA, com o SHA e o motivo; seção 1 e diário.
3. `node scripts/roadmap/gerar-estado.mjs` e `--conferir`. Portão de conteúdo verde.
4. Confira que o diff `<sha candidato>..` (a árvore preparada) só toca a lista permitida. Commit `V2-Fnn-Enn: registro da validação de <sha7>, <veredito>` e push do ramo da fase. Este commit NÃO revalida o produto.

## Relatório final ao Rafael (curto)

Etapa, SHA validado, veredito por dimensão, o que ficou para ele (E4, E5, decisões), riscos residuais, escalonamentos. Nunca diga "validado" para o que ficou BLOCKED.
