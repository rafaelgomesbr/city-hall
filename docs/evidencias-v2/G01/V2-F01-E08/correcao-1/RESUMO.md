# V2-F01-E08, correção 1: a imagem leva o SHA que o checkout realmente construiu

Achado: codex-f01-A item 8 (DÍVIDA).

## Fatos

- Confirmado em `.github/workflows/verificar.yml`, job `imagens`, passo "Versão e commit do build": o carimbo
  `DC360_COMMIT` recebia `${PR_HEAD_SHA:-$GITHUB_SHA}`, isto é, em pull_request a PONTA do ramo
  (`pull_request.head.sha`). O `actions/checkout` do job não passa `ref:` e por isso testa o MERGE SINTÉTICO do PR
  (`GITHUB_SHA`). O smoke compara `/saude` com o `DC360_COMMIT` que ele mesmo recebe do passo, então a imagem
  construída de um código e carimbada com o SHA de outro passava sem alarme. O teste antigo
  (`smoke-das-imagens.test.mjs`, "o commit do build é o da ponta do PR") prendia exatamente esse comportamento.
- Conserto: o carimbo e a comparação do smoke passam a usar `commit="$GITHUB_SHA"` (o SHA que o checkout
  realmente construiu). O commit CANDIDATO (ponta do ramo, o que o gatekeeper fixa) fica à parte:
  `candidato="${PR_HEAD_SHA:-$GITHUB_SHA}"` é gravado em `01-versao.txt` do artefato
  (`commit_construido=... candidato=...`), como o `00-contexto.txt` do artefato já fazia. Em push os dois valem o
  mesmo SHA.
- Teste (`smoke-das-imagens.test.mjs`, mesmo número de casos, 18): o caso antigo foi reescrito para exigir
  `commit="$GITHUB_SHA"`, proibir `commit="${PR_HEAD_SHA...`, exigir o `candidato` registrado à parte e o
  `commit_construido`/`candidato` no `01-versao.txt`, que o checkout do job continua sem `ref:` e que o smoke
  compara com `$DC360_COMMIT` nas duas imagens. `saidas/01`: o caso reprova contra o workflow antigo;
  `saidas/02`: passa contra o novo.

## Justificativa

A rastreabilidade que a E08 promete é "o commit que a imagem diz ser é o commit de que ela saiu". Em PR o commit
de que ela saiu é o do merge sintético. O candidato não se perde: está no artefato, ao lado.

## Limitações

- Não executei um pull request no GitHub: a verificação é do texto do workflow e do teste. O deploy de HML
  (`deploy-hml.yml`) tem o seu próprio carimbo e não foi tocado aqui.
