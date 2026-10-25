# V2-F01-E02, dívida DV-14: higiene do `verificar.yml`

## Fatos

- **Conserto:** commit `2c9d439` (`.github/workflows/verificar.yml`, `dc360/scripts/ambiente-hostil.mjs`, `dc360/scripts/baseline.mjs`, `dc360/scripts/conferir-workflows.test.mjs`).
- **Contagem do painel não fixada em `plataformas`.** O passo "Caso 1: suíte do painel inteira sobre a árvore CRLF" agora grava a saída do vitest e roda `ambiente-hostil.mjs conferir-painel`, que lê `Tests N passed (N)` e compara total, falhas e pulos com `esperadoDoTesteWeb()` do `baseline.mjs`. O número não fica escrito no YAML: vem do `baseline.mjs`, que o `conferir:numeros` já cobra contra a árvore (hoje 750, não os 723 da rodada 8, porque a suíte cresceu). Sobre o clone real com CRLF: `Painel sobre a árvore CRLF: 750 de 750 testes, como o baseline fixa (sem falha, sem pulo)` (`saidas/01-conferir-painel.txt`). Se um teste do painel sumir, for pulado ou falhar só em CRLF, o job reprova. Os casos novos do `ambiente-hostil.test.mjs` provam que o conferidor reprova total diferente, falha, pulo e saída sem a linha de resumo.
- **Estimativa de duração.** O comentário que dizia "15 a 25 minutos no Windows" agora diz o medido (cerca de 4,5 minutos no Windows na rodada 8) e explica que o `timeout-minutes: 45` é folga contra fila lenta, não estimativa. O teste do workflow proíbe a frase antiga voltar.
- **`uses:` por tag.** JÁ ESTAVA RESOLVIDO: a E02 fixou todas as ações por SHA de 40 caracteres com a versão em comentário, e `conferir-workflows.test.mjs` (regra 3, `problemasDeUsos`) reprova qualquer `uses:` fora disso em todos os workflows. Nenhum `uses:` por tag resta em `verificar.yml` (`saidas/02-conferir-workflows-test.txt`: 51 de 51).

## Justificativa

- A contagem foi ligada ao `baseline.mjs` e não escrita no YAML para não criar um segundo lugar com o número: cada etapa que acrescenta teste ao painel já atualiza o `baseline.mjs` (e o `conferir:numeros` reprova se esquecer).

## Limitações

- O conferidor do painel só roda dentro do job `plataformas`; a prova no Windows é o CI.
- Sem push.
