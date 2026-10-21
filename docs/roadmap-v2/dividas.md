# Dívidas registradas da V2 (D-31)

**Para quem:** quem implementa e quem valida a V2.
**Por que existe:** pela D-31 (seção 19 de `28-execucao-e-validacao.md`), achado latente, que só aparece com código malicioso ou errado dentro do próprio repositório, ou anterior à etapa e fora do escopo dela, não reprova a etapa: vira dívida com dono e prazo. Item resolvido muda de seção, nunca some.
**Fonte do estado:** `STATUS.md` e os `VEREDITO.md`. Se divergirem, vale o STATUS.

## Abertas

| Código | Achado em | O que é | Por que é dívida e não bloqueio | Dono | Prazo |
| --- | --- | --- | --- | --- | --- |
| DV-01 | E05, revisão independente da correção 7b (`e887f69`), 2026-10-20 | Uma rota que define um cabeçalho com um objeto cujo `toString` devolve um valor diferente a cada leitura faz a guarda aprovar uma leitura e o Node escrever outra, e um 403 fora do catálogo sai no fio (`dc360/apps/api/src/guarda-de-codigos-de-erro.ts`, perto da linha 917, e o mesmo padrão na cópia do console, perto da linha 824). Junto vai a diferença de comportamento do `writeEarlyHints` entre o Node 22 e o 24 na mesma guarda. Conserto planejado: tirar um retrato de `getHeaders()` e dos cabeçalhos segurados, convertido para texto uma vez só, validar o retrato e regravar exatamente ele; segunda rede contra `\r\n\r\n` antes do fim de `_header`; `writeEarlyHints` sempre com um objeto novo. Teste com valores inofensivos que conta quantas vezes o valor é lido (tem de ser uma). | Modelo de ameaça da E05 (seção 19, item 2): exige código hostil dentro da própria rota; os validadores da rodada 7 escreveram que não é explorável por cliente externo naquele SHA | V2-F02-E03 (catálogo de códigos) | antes do G02 |

## Resolvidas

Nenhuma ainda.
