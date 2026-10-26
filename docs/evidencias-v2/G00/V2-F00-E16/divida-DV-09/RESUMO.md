# V2-F00-E16, dívida DV-09: o job `plataformas` não roda "a cada push", roda nos gatilhos do `verificar.yml`

Dívida da rodada 8 da E16 (Testes, achado A1, sobre `60cbc2f`). Paga em 2026-10-25, sobre `e48e5e9` (ramo `v2/f00`). Mudança só de texto, em `dc360/apps/campo/LEIA-ME.md` (perto da linha 59). Nenhum código nem workflow tocado.

## Fatos

- O `LEIA-ME.md` dizia que o job `plataformas` do CI "prova isso a cada push".
- Gatilho real, de `.github/workflows/verificar.yml` (`saidas/01-gatilho-do-job-plataformas.txt`):
  - `push` nos ramos `main`, `master` e `v2/**`;
  - `pull_request`;
  - `workflow_dispatch` e `schedule` também são tratados no arquivo (comentário nas linhas 53 a 61), mas só valem depois que o arquivo chega ao ramo padrão.
- O job `plataformas` (linhas 674 a 900) não tem `if:` no nível do job: roda em todo gatilho acima, em `windows-latest` e `ubuntu-latest`. Os `if:` que existem estão nos passos (`!cancelled()`, `always()` e dependências entre passos) e não decidem se o job roda.
- Logo "a cada push" era largo demais: um push para um ramo fora de `main`, `master` e `v2/**` (por exemplo um ramo de trabalho sem `pull_request` aberto) não roda o job.
- Texto novo no `LEIA-ME.md`: o job prova isso "a cada push em `main`, `master` e `v2/**` e a cada `pull_request` (não em push para outro ramo)".
- **Não verificado:** o comportamento de `workflow_dispatch` e `schedule` (não disparei o workflow); a frase nova descreve só os gatilhos de `push` e `pull_request`, que são os que o arquivo declara e que o job cobre sem condição.

## Justificativa

O job existe e roda onde importa (o ramo da fase `v2/**` e os pull requests, que é onde o gatekeeper lê o run do SHA candidato). A dívida era só de precisão: "a cada push" prometia mais cobertura do que o gatilho dá. A frase agora diz exatamente os gatilhos do arquivo.
