# V2-F01-E07: SemVer, tags, changelog e estratégia de release

## Fatos

**O que mudou (3 arquivos novos, 2 editados, todos em `dc360/`):**

- `dc360/scripts/versao.mjs` (novo). Duas linhas de versão: `plataforma` (raiz, todos os
  workspaces expandidos de `workspaces` do `package.json`, e `package-lock.json` nas entradas do topo, `""` e uma por
  workspace) e `campo` (`VERSAO` de `apps/campo/app.config.ts`, `apps/campo/package.json` e
  `apps/campo/package-lock.json`). Comandos: `conferir`, `mostrar`, `subir <linha> <y|z|X.Y.Z>`,
  `conferir-tag <nome>`, mais `--raiz=DIR`. Saída 0 certo, 1 problema, 2 uso errado. Antes da G28 a major
  tem de ser 0: a 1.0.0 é recusada. `subir` calcula tudo na memória e só grava se nada falhou, recusa linha já
  dividida e recusa reescrever JSON que não esteja no formato exato do npm. `BUILD` do aplicativo não é tocado.
  O script nunca cria tag: o único uso de `git tag` é `--list`, para recusar nome de tag que já existe.
- `dc360/scripts/versao.test.mjs` (novo), 32 casos, entra em `npm run test:scripts` sem tocar em
  `dc360/package.json`.
- `dc360/CHANGELOG.md` (novo), em português, com "Não lançado", `plataforma 0.1.0 - 2026-10-24` e
  `campo 0.1.0 - 2026-10-24`. As seções dizem que 0.1.0 é a marca de partida, não um lançamento novo, e que a tag
  é posta depois da E01, sem retroagir.
- `dc360/scripts/baseline.mjs`: linha `V2-F01-E07: 32` nas duas tabelas (contagem e arquivo `versao.test.mjs`).
- `dc360/README.md`: seção "Versões, tags e changelog" (antes de "O que falta, e por quê").

**Números não mudaram nos arquivos de versão:** tudo continua em 0.1.0 (a etapa não sobe versão; ela cria o mecanismo).
`node scripts/versao.mjs conferir` na árvore real: plataforma 0.1.0, campo 0.1.0, ambas com seção no CHANGELOG.

**Testes (ver `saidas/`):**

- `node --test scripts/versao.test.mjs`: 32 de 32 (`saidas/01-versao-test.txt`). Positivos: `subir`
  leva todos os workspaces e o lockfile ao mesmo número preservando a formatação byte a byte; `subir campo` muda
  `VERSAO`, o `package.json` e o lockfile do app sem tocar o `BUILD`; árvore real confere. Negativos: bump em um
  só workspace reprova nomeando quem destoa; lockfile defasado; `VERSAO` diferente do `package.json` do app;
  versão sem seção no CHANGELOG (nas duas linhas); CHANGELOG ausente; data inventada, seção vazia, repetida,
  fora de ordem e título fora do formato; major 1; `subir` recusa 1.0.0, versão que não cresce e linha desconhecida
  sem gravar nada; tag `v1`, `v1.0.0`, `v0.1`, `V0.1.0`, `v0.1.0-rc1`, `campo-v1`, vazia e `app-v1` reprovam; tag
  de versão que os arquivos não têm reprova; tag existente reprova. Como comando: códigos 0, 1 e 2.
- Prova de mordida na árvore REAL (`saidas/03-prova-de-mordida.txt`): `packages/shared/package.json` plantado em 0.1.1
  faz `conferir` sair 1 nomeando o workspace; restaurado, sai 0. `v1`, `v1.0.0` e `v0.9.0` saem 1; `subir plataforma 1.0.0`
  sai 1. O arquivo plantado foi restaurado (git não mostra alteração nele).
- `test:scripts` (`saidas/04-test-scripts.txt`): a rodada arquivada cobre todos os `scripts/*.test.mjs` MENOS
  `conferir-indices-de-evidencia.test.mjs`, porque esse teste confere o `INDEX.md` desta própria pasta, que lista o
  arquivo de saída: arquivar a rodada dele aqui seria autorreferente (o hash mudaria a cada rodada). Esse teste rodou à
  parte, depois do índice final, e `npm run test:scripts` inteiro sobre a árvore final deu 385 casos, 381 passando,
  0 falhando, 4 pulados por ambiente (os mesmos que já existiam). Sem esta etapa eram 353 casos; com ela, 385 (32 a mais).
  Reproduzível pelo validador com `cd dc360 && npm run test:scripts`.
- `npm run conferir:numeros`: "Todos os números da documentação batem com a realidade" (`saidas/05-conferir-numeros.txt`),
  incluindo o esperado de `test-scripts` com os 32 casos novos.
- `npx vitest run --root packages/shared test/regras-de-conteudo.test.ts`: 10 de 10 (`saidas/06-regras-de-conteudo.txt`).
- `node --test scripts/baseline.test.mjs`: 29 de 29 (`saidas/07-baseline-test.txt`).

**Ambiente:** o worktree estava na `master` (sem `docs/roadmap-v2`), então foi avançado por fast-forward para `v2/f00`
(`bc3c535`) antes de começar. Foi preciso `npm ci --ignore-scripts` e `npm run build:shared` no worktree para rodar
`conferir:numeros`. Uma primeira rodada de `test:scripts` sem `node_modules` deu 1 vermelho por falta do `tsx`
(`npm run migrar -- --conferir`), ambiental e fora desta etapa.

**Limitações:**

- Não cria tag, não cria Release, não liga ruleset: tudo isso é ação no GitHub (ver "Para o orquestrador").
- Nenhum workflow novo, nenhum script em `dc360/package.json`, `/saude` e SBOM ficam para E08 e E19.
- `conferir` ainda não roda como passo próprio do CI (o workflow é da E02); hoje o CI o exercita porque `test:scripts`
  roda `versao.test.mjs`, que inclui `conferir` contra a árvore real.
- `apps/campo` não é workspace do npm (tem lockfile próprio); por isso é uma linha separada, e `@dc360/campo` em
  `packages/campo` é da linha plataforma. Isso segue o texto da etapa, mas vale o validador olhar.
- Já existe uma tag `app-v1` no repositório (fora do padrão novo, anterior a esta etapa). Não foi tocada.
- Trava registrada no pacote de contexto: gate G00 ainda EM ANDAMENTO e V2-F01-E02 PENDENTE. Executado assim por
  instrução do orquestrador (lote 1 em paralelo); a dependência de E02 desta etapa é só o CI para exercitar o teste.

## Justificativa

Versão que vive em vários arquivos diverge sozinha, e divergir em silêncio é o que impede dizer "este commit está
no ar". Por isso o conferidor lê todos os lugares (raiz, cada workspace, lockfile, app) e o teste de árvore real o
prende ao CI via `test:scripts`, sem depender do workflow da E02. Duas linhas porque o aplicativo sai pela loja num
ritmo próprio e não deve forçar bump da API. A 1.0.0 recusada no código porque a etapa a proíbe e a G28 é do Rafael.
`subir` grava tudo ou nada e se recusa a reformatar JSON, porque um diff de lockfile cheio de ruído esconde erro de
verdade. O script só lista tags: criar tag é ato do dono, e a etapa pede isso explicitamente (risco de tag mutável).
O CHANGELOG da 0.1.0 não inventa histórico: declara-se marca de partida.

## Para o orquestrador

Linha sugerida do STATUS: `V2-F01-E07 | IMPLEMENTADA | candidato <sha7> (worktree-agent-ae190872853e0a819, sem push) | SemVer em duas linhas, versao.mjs (conferir, subir, conferir-tag), CHANGELOG 0.1.0, 32 casos em test:scripts`.

Linha de baseline a conciliar com os outros implementadores do lote: `V2-F01-E07: 32` em
`TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS` e `"V2-F01-E07": "versao.test.mjs"` em
`ARQUIVOS_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS`. O total esperado de `test-scripts` sobe 32.

Pendências humanas (o Rafael faz fora do repositório):

1. Criar o ruleset de tags no GitHub para `v*` e `campo-v*` (sem atualizar e sem apagar; só o dono e, depois, o workflow da E12 criam).
2. Criar a primeira tag depois da E01 e da validação: `v0.1.0` e `campo-v0.1.0`, no commit que tiver este número
   (nunca retroativa sobre um commit antigo), e publicar o Release do GitHub com as notas da seção do CHANGELOG.
3. Ler o `dc360/CHANGELOG.md` (validação humana da etapa) e confirmar que "marca de partida, 0.1.0" é a leitura que
   ele quer, em vez de reescrever a história desde o início.
4. Decidir o destino da tag antiga `app-v1` (apagar ou deixar; o ruleset não a pega, por não casar `v*`).
