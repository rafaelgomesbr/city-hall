# V2-F01-E08: imagem Docker no CI e runbook de rollback (Fly releases, Vercel, EAS)

## Fatos

**O que mudou (6 arquivos novos, 11 editados; tudo sob `dc360/` salvo o workflow e o ruleset):**

- `.github/workflows/verificar.yml`: job novo `imagens` (nome de exibição "Imagens Docker (API e console)",
  `ubuntu-24.04`, 40 minutos, Postgres 17 de serviço, sem `secrets.`, sem `permissions` próprio, sem `docker push`).
  Passos: contexto; versão e commit do build (`versao.mjs conferir` e `mostrar`; o commit é o da ponta do PR, não o do
  merge sintético); testes das conferências do smoke; `docker build` das duas imagens com os argumentos
  `DC360_VERSAO` e `DC360_COMMIT`; usuário não root nas duas; `chromium --version` dentro da imagem da API;
  papéis e banco; **migração aplicada a partir da imagem da API** (`db/dist/cli.js`, e de novo com `--conferir`);
  a API sobe da imagem (`NODE_ENV=development`, papel restrito) e `/saude` é conferida contra a versão e o commit
  do build; o console sobe da imagem (dono semeado pelo `provisionar-operador.js` da própria imagem, só em memória)
  e a sua `/saude` é conferida; log dos contêineres, redação de segredo e artefato `imagens-<sha>`.
  O job `implantavel` passou de `postgres:16` a `postgres:17` (o major de produção); o `restore` já era 17.
- `.github/rulesets/master.json`: o check "Imagens Docker (API e console)" entra na lista (9 checks).
- `dc360/Dockerfile` e `dc360/Dockerfile.console`: base `node:22-bookworm-slim` fixada por digest
  (`sha256:de170b39...`, índice multiplataforma lido do registro em 2026-10-24); `ARG DC360_VERSAO` e
  `ARG DC360_COMMIT` viram `ENV` no fim da etapa `runtime`, depois de tudo o que é caro e antes do `USER node`.
  Cabeçalhos reescritos: não dizem mais que "o CI não constrói a imagem".
- `dc360/apps/api/src/versao-do-build.ts` (novo): lê as duas variáveis e só aceita SemVer estrito e SHA em
  minúsculas (a rota é pública); fora disso, `desconhecida` / `desconhecido`. Fica fora do `config.ts` de propósito.
- `dc360/apps/api/src/servidor.ts`: `/saude` devolve também `versao` e `commit`. Duas mudanças pequenas (o import
  e a leitura em `construirServidor`) mais o `return`.
- `dc360/apps/console/src/servidor.ts`: `/saude` do console passa de `{ ok: true }` a `{ ok, versao, commit }`,
  pelo mesmo módulo da API (o console já importa de `apps/api/src`; o `Dockerfile.console` copia `apps/api` inteiro).
- `dc360/scripts/smoke-das-imagens.mjs` (novo): as conferências do job, com o `docker` por parâmetro (`usuario`,
  `chromium`, `saude-api`, `saude-console`); devolve 0, 1 e 2.
- `dc360/scripts/smoke-das-imagens.test.mjs` (novo), 15 casos: a régua com um `docker` de mentira (imagem boa passa;
  sem `USER node`, uid 0, usuário errado, sem Chromium, Chromium que responde outra coisa, versão, commit e banco
  trocados, lixo no lugar do JSON reprovam) e os arquivos (base por digest e igual nos dois Dockerfiles, `ARG` antes
  do `USER node`, o job sem segredo e com Postgres 17, as duas imagens com os dois argumentos, o check no ruleset,
  o `implantavel` em 17, o runbook com as cinco frentes). Sem Docker, sem `skip`.
- `dc360/apps/api/test/saude-versao.test.ts` (novo, 7 casos) e `dc360/apps/console/test/saude-versao.test.ts`
  (novo, 3 casos).
- `dc360/docs/runbooks/rollback.md` (novo): API (`fly releases --image`, `fly deploy --image`), painel (Vercel),
  console, aplicativo (EAS e lojas), banco (migração aditiva, cópia, restore) e a conferência por `/saude`.
- `dc360/README.md`, `dc360/docs/COLOCAR-DE-PE.md`, `dc360/compose.yaml` (só o comentário do cabeçalho),
  `dc360/scripts/baseline.mjs`: documentação e contagens.

**Testes (ver `saidas/`):**

- `apps/api/test/saude-versao.test.ts`: 7 de 7 (`01`). `apps/console/test/saude-versao.test.ts`: 3 de 3 (`02`).
- `scripts/smoke-das-imagens.test.mjs`: 15 de 15 (`03`).
- Prova local do `/saude` (`04`): a API compilada (`apps/api/dist`) sobe com as duas variáveis e responde
  `"versao":"0.1.0"` e o `commit` dado; o `smoke-das-imagens.mjs saude-api` sai 0 com o par certo e 1 com a versão
  trocada. **Isto NÃO é a imagem**: é o mesmo código sem o Docker.
- `npm run test:api`: 1724 passando, 34 pulados por ambiente (os mesmos), 0 falhando (`05`). `npm run test:console`:
  310 de 310 (`06`). O `test:scripts` sem o teste do índice de evidência: 465 casos, 461 passando, 4 pulados por
  ambiente (os que já existiam), 0 falhando (`07`); o `npm run test:scripts` inteiro, rodado à parte depois do
  índice final (o teste do índice confere esta pasta, então arquivar a rodada dele aqui seria autorreferente): 501 casos,
  497 passando, 0 falhando, 4 pulados por ambiente (eram 486 sem esta etapa; +15). `conferir:numeros` verde (`08`), `regras-de-conteudo` 10 de 10 (`09`), `baseline.test.mjs`
  29 de 29 (`10`), `typecheck` 0 (`11`).
- O workflow lê como YAML, tem 11 jobs, e todo bloco `run:` do job `imagens` passa em `bash -n`; o ruleset lê como
  JSON com o check novo (`12`).

**Números que mudaram nos documentos:** API 1717 para 1724 (+7), console 307 para 310 (+3), `npm test` 3553 para
3563, total com o aplicativo 5550 para 5560; `test:scripts` +15. Linhas `V2-F01-E08` em `baseline.mjs`.

**Limitações, ditas sem rodeio:**

- **Nenhuma imagem foi construída nem subida aqui.** Esta máquina não tem Docker. O que prova que as imagens constroem
  e sobem é o job `imagens` do CI, que ainda não rodou. O que foi verificado sem Docker: o código do `/saude`, as
  conferências (com `docker` de mentira), o YAML, a sintaxe dos blocos, o digest (lido do registro) e os caminhos
  dentro da imagem (`db/dist/cli.js` e `apps/console/dist/console/src/provisionar-operador.js` existem na
  compilação local e o segundo imprime a linha da semente do dono no formato que o `sed` do job espera).
- Pontos do job que só o primeiro run confirma: a migração rodando de dentro da imagem (`db/dist/cli.js`,
  `--network host` falando com o Postgres de serviço), a partida do console da imagem contra o Postgres 17
  (papel `dc360_console_login`, esquema conferido por `pg_catalog`) e o tempo total do `docker build` das duas
  imagens (estimado em poucos minutos cada; o limite é 40).
- `postgres:17` no `implantavel` e no `imagens` é a primeira vez que as migrações rodam num Postgres 17 no CI da
  partida (o `restore` já usava 17). O PGlite segue em 16. PostGIS entra com a E21.
- `rollback.md` não foi ensaiado: nenhum comando foi rodado contra Fly, Vercel ou EAS. Está dito no próprio arquivo.
  Duas afirmações dele dependem da documentação das ferramentas e vale o Rafael conferir: o comportamento do
  *Instant Rollback* da Vercel sobre os próximos pushes, e `fly releases --image`.
- Hoje o `fly deploy` não passa `--build-arg`: a imagem de produção sai com `/saude` dizendo `desconhecida` até a E12
  (ou até alguém usar a receita do `rollback.md`).
- O `.dockerignore` e as dependências não mudaram. Nada de scan (E20), SBOM (E19) nem publicação da imagem (E12).

## Justificativa

Imagem que só é construída no `fly deploy` quebra na hora em que a produção precisa dela; construí-la em todo PR
move a descoberta para o PR. A migração é aplicada de dentro da imagem de propósito: prova que `db/dist` e
`db/migrations` vão nela, que é o que o deploy depende. As conferências moram num script com teste porque `run:`
dentro de YAML não tem teste negativo, e a etapa pede explicitamente que root e falta de Chromium reprovem. O carimbo
do build é validado por formato porque `/saude` é pública, e fica fora do `config.ts` porque não é configuração de
quem opera (e o outro agente migra o zod ali). Versão e commit entram por `ARG` no fim do Dockerfile para mudar só
as últimas camadas. O commit usa a ponta do PR porque é esse o SHA que o gatekeeper fixa.

## Para o orquestrador

Linha sugerida do STATUS: `V2-F01-E08 | IMPLEMENTADA | candidato <sha7> (worktree-agent-af539510d0d4cbbaa, sem push) | job imagens no CI (build das duas imagens, migração e partida a partir delas, usuário não root, Chromium, /saude com versao e commit), base por digest, rollback.md; prova das imagens é o run do CI, ainda não rodou`.

Linha de baseline a conciliar com os outros implementadores do lote: `V2-F01-E08: 15` em
`TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS` e `"V2-F01-E08": "smoke-das-imagens.test.mjs"` em
`ARQUIVOS_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS`; `V2-F01-E08: { total: 7, ... }` em `MUDANCAS_DO_TESTE_API_POR_ETAPA`; e o
esperado de `teste-console` de 307 para 310. Os números do README e do `COLOCAR-DE-PE.md` (API 1724, console 310,
`npm test` 3563, 5560 com o aplicativo) vão conflitar com os dos outros lotes: refaça `npm run conferir:numeros` depois
de integrar tudo.

Conflitos prováveis na integração: `verificar.yml` (outros agentes podem mexer em jobs vizinhos; o meu bloco é
o job `imagens`, inteiro, mais uma linha em `implantavel`), `master.json`, `baseline.mjs`, `README.md`,
`COLOCAR-DE-PE.md`, `compose.yaml` (só comentário), `apps/*/src/servidor.ts` (3 hunks pequenos) e os dois Dockerfiles
(o agente da E09 pode mexer em `ENV` ou `compose.yaml`).

**O que o run do CI do job `imagens` precisa mostrar** (o orquestrador dispara e lê): as duas imagens construídas;
`06-usuario.txt` com `ok`; `07-chromium.txt` com a versão; `09-migrar.txt` migrando e depois "Esquema em dia.";
`11-saude-api.json` e `13-saude-console.json` com `versao` e `commit` do run. Se o console não subir, o log está em
`16-log-console.txt`.

Pendências humanas (o Rafael faz fora do repositório):

1. **Importar de novo o ruleset** `.github/rulesets/master.json` no GitHub (Settings, Rules, Rulesets) para o check
   "Imagens Docker (API e console)" passar a ser obrigatório. Só depois de o job ter rodado ao menos uma vez na
   `master` ou no PR, para o nome aparecer na lista de checks do GitHub.
2. **Ler `dc360/docs/runbooks/rollback.md`** (validação humana da etapa) e, na primeira oportunidade, conferir de
   verdade: `fly releases -a defesa-civil --image` (só leitura), e o comportamento do *Instant Rollback* da Vercel.
   O ensaio completo é da E16.
3. Enquanto a E12 não existir, deploy manual da API e do console com a receita de `--build-arg` do `rollback.md`,
   para `/saude` sair com versão e commit.
4. Quando o Dependabot abrir o PR de atualização da base `node:22-bookworm-slim`, ele troca tag e digest dos dois
   Dockerfiles juntos; revisar que os dois ficam iguais (o teste `smoke-das-imagens.test.mjs` reprova se divergirem).
