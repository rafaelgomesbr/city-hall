# V2-F02-E09: ano do protocolo e datas do CSV pelo fuso do município

## Fatos

**Base:** `origin/v2/f02` em `d4cedbd`. Sem migração, sem rede nova, sem mudança em `servidor.ts`, `config.ts`, `index.ts`
do shared nem em `package.json`.

**Shared (`dc360/packages/shared/src/fuso.ts`, estava vazio):** passa a abrigar `FUSO_PADRAO` e `fusoDoEstado` (movidos
de `apps/api/src/documentos/folha.ts`, com a mesma tabela IANA por UF e o mesmo comentário), mais três funções novas,
todas por `Intl.DateTimeFormat` com `timeZone` explícito e `hourCycle: "h23"` (a meia-noite sai `00:00`, nunca `24:00`):
`anoNoFuso(instante, fuso)`, `dataNoFuso(instante, fuso)` (`AAAA-MM-DD`) e `dataHoraNoFuso(instante, fuso)`
(`dd/MM/yyyy HH:mm`, o formato que o Excel em português reconhece).

**API:**

- `documentos/folha.ts` importa e REEXPORTA `FUSO_PADRAO` e `fusoDoEstado` do shared (laudo, ofício e o teste
  `fuso-do-documento.test.ts` seguem importando de lá, sem mudança).
- `rotas/ocorrencias.ts`, `POST /ocorrencias`: lê `organizacoes.uf` da organização do TOKEN, na mesma transação, e passa
  `anoNoFuso(new Date(), fusoDoEstado(uf))` a `proximo_protocolo` (antes: `new Date().getFullYear()`). Só essas linhas
  mudaram (mais o nome dos dois símbolos no `import`), para não colidir com a E07.
- `rotas/prestacao-de-contas.ts`, `GET /relatorios/ocorrencias.csv`: lê a UF da organização do token na transação da
  exportação; `dataParaPlanilha(valor, fuso)` (fuso obrigatório, sem padrão) usa `dataHoraNoFuso`, e o nome do arquivo
  usa `dataNoFuso(new Date(), fuso)` (antes: `getDate/getHours` do processo e `toISOString().slice(0, 10)` em UTC).

**Compatibilidade:** protocolos já emitidos não mudam; formato do protocolo e do CSV idêntico; status e `erro` das
respostas iguais. Em UF ausente ou desconhecida o fuso é `America/Sao_Paulo`, nunca o do processo.

**Testes novos:**

- `packages/shared/test/fuso.test.ts`, 115 casos. Para cada uma das 27 UFs, um minuto antes e na hora exata da
  meia-noite local de 31/12/2026 para 01/01/2027 (deslocamento de cada estado escrito à mão: AC UTC-5; AM, MT, MS, RO,
  RR UTC-4; os demais UTC-3), conferindo `anoNoFuso`, `dataNoFuso` e `dataHoraNoFuso`, com o processo em `UTC` e em
  `Pacific/Auckland`. Mais a janela de 03:30Z (2027 em SP, 2026 no AC), 02:30Z (2026 em SP), caixa e espaços na UF, e
  UF desconhecida ou nula caindo no padrão.
- `apps/api/test/fuso-do-protocolo.test.ts`, 9 casos, com `TZ=UTC` e o `Date` fixado: `2027-01-01T03:30Z` gera protocolo
  de 2027 em SP e de 2026 no AC; `02:30Z` gera 2026 em SP; cabeçalhos `x-fuso` e `x-uf` do token de A não mudam o fuso
  (que vem da organização do token); UF `ZZ` usa o padrão sem erro; a virada não repete número (sequência por ano);
  CSV com ocorrência de `03:30Z` traz `31/12/2026 22:30` e `ocorrencias-2026-12-31.csv` no AC e `01/01/2027 00:30` e
  `ocorrencias-2027-01-01.csv` em SP; ocorrência das 22:00 de Brasília (`01:00Z` do dia seguinte) traz a data local;
  UF desconhecida no CSV usa o padrão.
- Mutação: trocando o ano do protocolo de volta para `new Date().getFullYear()`, 5 dos 9 casos da API reprovam.

**Portões (saídas nesta pasta):** `typecheck.txt`, `npm-test.txt`, `isolamento.txt`, `test-scripts.txt`. Também verdes:
`npm run lint`, `npm run lint:teto` (431), `npm run formato:conferir`, `npm run conferir:numeros`,
`node --test scripts/baseline.test.mjs`, `regras-de-conteudo.test.ts` e `node scripts/auditar.mjs`.

## Justificativa

Um lugar só para o fuso: o ano do protocolo, as datas do CSV e os documentos precisam da mesma resposta, e cada um
lendo o relógio do contêiner (UTC, sem `TZ` no produto) era o mesmo defeito em três pontos. O fuso é do município e
vem da UF cadastrada da organização do token, nunca da requisição. Ficam de fora, como a etapa manda, o formato do
protocolo, a reescrita de protocolos antigos, fuso configurável por município e as métricas (anotadas em
`apps/api/PENDENCIAS.md`, item 6).

## Para o orquestrador

- **Linha do STATUS sugerida:** `V2-F02-E09 | IMPLEMENTADA | candidato no ramo de trabalho | fuso do município num lugar
  só (shared/fuso.ts); ano do protocolo e datas e nome do CSV pelo fuso da UF; 115 casos no shared e 9 na API`.
- **Dívidas pagas:** ALY:OCO-01, ALY:RN-02 e ALY:RNF-14 (as três de origem da etapa: ano do protocolo e datas do CSV pelo
  relógio do processo). Não alterei `dividas.md`; confira se há linha com esses códigos.
- **Contagens:** shared 245 para 360 (+115), API 1869 para 1878 (+9); README e `COLOCAR-DE-PE.md` ajustados para a minha
  árvore (npm test 4045, total com o aplicativo 6042). O integrador recalcula os totais na junção.
- **Pendência humana:** Rafael confere a data do CSV de uma ocorrência noturna (registrada entre 21h e a meia-noite
  locais) no ambiente de homologação. A prova automatizada está nos testes acima.
- **Risco:** `ocorrencias.ts` ganhou um `SELECT uf` antes do `proximo_protocolo`; a E07 (idempotência do
  `POST /ocorrencias`) deve manter a leitura da UF antes de pedir o protocolo.
