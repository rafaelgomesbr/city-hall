# V2-F01-E17, dívida DV-26: lint também no Windows

## Fatos

- **Conserto:** commit `2c9d439` (`.github/workflows/verificar.yml`, job `windows`, e o teste dele em `dc360/scripts/conferir-workflows.test.mjs`).
- O job `windows` agora roda, depois do `npm ci` das duas árvores e do `build:shared`, os três portões da E17 do `npm run verificar`: `npm run lint` (ESLint tipado do monorepo e do aplicativo), `npm run lint:teto` e `npm run formato:conferir`. Cada um é um passo próprio, com `if: !cancelled()`, saída em `03c-lint-windows.txt`, `03d-lint-teto-windows.txt` e `03e-formato-windows.txt` no artefato `windows-<sha>`. O nome do job passou a `Windows (auditar, lint, test:scripts e conferir:numeros)`; ele não é contexto exigido do `.github/rulesets/master.json`.
- Por que importa: a baseline de supressões do ESLint é por caminho de arquivo, e a formatação e o lint leem arquivo do disco; só rodar em Linux deixava sem prova o que muda com letra de unidade e barra invertida. O `test:scripts` (que inclui `lint-regras.test.mjs` e os outros testes da E17) já rodava no job `windows`.
- Medido localmente (macOS), `saidas/`: `lint` OK nas duas árvores (cerca de 24 s), `lint:teto` OK (431 supressões), `formato:conferir` OK (790 arquivos, 664 na baseline).
- Teste que reprova sem o conserto: o caso novo "o job windows roda lint, lint:teto e formato:conferir, depois de instalar as duas árvores e compilar o shared" lê só os `run:` do job; com o `lint:teto` trocado por `echo`, reprova (`saidas` da DV-13, `03-mutantes-do-yaml.txt`).

## Justificativa

- Pus os três, e não só `lint:teto` e `formato:conferir`: o lint tipado custa menos de meio minuto aqui e é ele quem lê a baseline por caminho, o ponto que o Windows pode quebrar.

## Limitações

- **Só o CI prova o Windows.** Se o ESLint ou a baseline por caminho se comportarem diferente lá (barra invertida nas chaves de `eslint-suppressions.json`, por exemplo), o job `windows` reprova na primeira execução, e o achado é real, não flutuação. O `timeout-minutes: 40` do job tem folga para o acréscimo esperado (poucos minutos).
- Sem push.
