# V2-F01-E16, correção 1 (parte B): o runbook apaga a cópia onde ela mora

Revisão independente da F01 (Codex, somente leitura), achado 12 de
`codex-f01-B`. Ramo `trab/f01-corr-b`, sobre `v2/f01` em `e483a22`.

## Fatos

- **Confirmado.** `dc360/docs/runbooks/migracao.md`, passo 7, mandava
  `rm ~/dc360-copias/<data>.dump`, mas desde a E15 o roteiro grava em
  `~/dc360-copias/prod/<data>.dump` (`pastaDeCopias("prod")`). Quem seguia o
  runbook trocando só a data via o `rm` falhar e o dump com dado de cidadão
  ficava no disco. O mesmo runbook, no passo 3, já dizia a pasta certa.
- **Conserto no runbook:** o passo 7 manda usar o comando EXATO que o roteiro
  imprime no fim da cópia (E15, `comandoParaApagar`), e dá o caminho certo para
  o caso de ele ter se perdido, em `bash` (`rm -- ~/dc360-copias/prod/<data>.dump`)
  e em PowerShell (`Remove-Item -LiteralPath $HOME\dc360-copias\prod\<data>.dump`),
  com a conferência de que sumiu (`copiar-producao.mjs --ambiente prod --conferir`).
- **Teste novo** em `dc360/scripts/runbooks.test.mjs` (16 casos, eram 15): todo
  `rm` e `Remove-Item` dos trechos de código do `migracao.md`, com `~` e
  `$HOME` trocados pela casa, tem de estar em `pastaDeCopias("prod")`, a mesma
  função que decide onde o roteiro grava, e o runbook tem de dar os dois
  sistemas. O caminho antigo é usado como caso que morde.
- `dc360/docs/runbooks/deploy.md` ganhou duas notas da correção da E12 (parte
  B): o projeto do painel de HML na Vercel e o domínio dele em
  `scripts/ambientes.json` como pré-condição do selo, e o título do run
  "Implantar HML <sha>".

Saídas:

- `saidas/01-runbooks-antes-do-conserto.txt`: o caso novo reprova contra o
  runbook antigo (um comando de remoção só, fora da pasta de PROD).
- `saidas/02-runbooks-depois-do-conserto.txt`: 16 de 16.

## Justificativa

- O teste compara o runbook com a FUNÇÃO que decide o destino, e não com um
  texto copiado: se a pasta mudar de novo, o runbook reprova junto.
- O roteiro imprimir o comando exato tira a pessoa de ter de montar o caminho
  à mão na hora de apagar dado pessoal.
- Os achados 9 (segunda pessoa e ensaio, H49/H72 e CP-07) seguem pendentes:
  dependem de pessoa e não foram tocados.
