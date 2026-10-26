# V2-F00-E20, correção 1: isenções aprovadas e folga do recorte fechada

## Fatos

- **Decisão do Rafael em 2026-10-13 (D4 do roteiro de aprovação):** aprovou a lista de isenções do portão de conteúdo (`docs/referencia`, `relatorio`, os testes do pacote `shared`, a saída bruta de `docs/auditoria-v2/raw` e de `docs/evidencias-v2` fora de `.md`, o arquivo `docs/AUDITORIA-2026-09-30.md` pelo nome exato e as pastas de terceiros) e mandou fechar a folga que achei.
- **A folga:** para isenção de pasta inteira, `isento()` em `dc360/packages/shared/test/regras-de-conteudo.test.ts` comparava só o começo do caminho, então `docs/referencia-outra` herdaria a isenção de `docs/referencia`. Passou a exigir o próprio caminho ou o caminho seguido do separador.
- **Prova:** o caso do repositório sintético ganhou `docs/referencia-outra/nota.md` entre os arquivos que DEVEM reprovar por travessão. `npx vitest run --root packages/shared test/regras-de-conteudo.test.ts`: 8 de 8.
- **Observação:** numa das rodadas o caso "nenhum travessão em texto nenhum" estourou o tempo limite (7 s) sob carga e passou na seguinte, sem mudança de código. É a instabilidade V-INS-04 já registrada na classificação dos vermelhos da E03, ainda aberta.

## Justificativa

A lista de isenções é o único lugar em que o portão deixa de olhar texto. Uma isenção que vaza para o nome vizinho esconde travessão e norma inventada de graça. Fechar a folga custa uma linha e um caso de teste, e deixa a isenção exatamente onde o Rafael aprovou.
