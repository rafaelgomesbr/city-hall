# V2-F01-E11: HML, parte (a) de código (tomls, semente sintética, guarda do `--semear`)

Escopo: SÓ o que é código, configuração versionada, teste e documentação. O
provisionamento real de HML (apps do Fly, projeto de banco, bucket, e-mail de
teste, segredos, painel) é do Rafael, CP-05, e está listado em "Para o
orquestrador". Nada foi criado nem tocado no Fly, no Supabase, na Vercel ou no
GitHub.

## Fatos

**O que mudou (tudo em `dc360/`):**

- `fly.hml.toml` e `fly.console.hml.toml` (novos). Espelho dos de PROD com o que o
  contrato manda para HML: `AMBIENTE_DC360 = "hml"`, `MARCA_DAGUA = "AMBIENTE DE HOMOLOGAÇÃO"`,
  `PUSH_ATIVO = "nao"`, `RECUPERACAO_ATIVA` e `EMAIL_ATIVO` em `nao` (até existir o
  domínio de teste), app do Fly com nome próprio (`defesa-civil-hml`,
  `defesa-civil-console-hml`), máquina que pode dormir (`min_machines_running = 0`; PROD
  nunca dorme). Nenhum segredo, nenhuma identidade, domínio nem bundle de PROD.
  `node scripts/conferir-ambiente.mjs` passa SEM aviso (antes avisava que nasciam na E11).
- **Dois marcadores, de propósito.** `IDENTIDADE_DO_BANCO` (e a do console) vale
  `a-definir-no-cp-05` e `DOMINIO_DO_AMBIENTE` vale `painel-hml.a-definir.invalid`. A
  identidade do banco e o domínio de HML só existem depois do CP-05. Nenhuma URL contém o
  marcador, então a partida recusa até alguém trocá-lo: fecha para o lado seguro (HML sem
  identidade nunca sobe contra o banco de PROD). `.invalid` é reservado (RFC 2606), não vira
  origem de painel de terceiro. A matriz `scripts/ambientes.json` segue com
  `identidadeDoBanco` e `dominio` de HML nulos e a nota `pendente` explica a troca.
- `db/seeds/homologacao.sql` (novo). Mesma estrutura dos dois municípios fictícios da semente de
  desenvolvimento (Serra Alta e Vale Fundo, mesmos ids), SEM hash de senha (`senha_hash` NULL:
  conta trancada), e-mails em `example.org` (RFC 2606), telefones no bloco `(35) 90000-xxxx`.
  Nomes e endereços são os fictícios já usados; nenhum dado real.
- `apps/api/src/semear-homologacao.ts` (novo). Carrega o SQL, sorteia uma senha por conta
  (`ABCD-efgh-2345`, sem os símbolos que se confundem), grava o hash scrypt NA MESMA transação e
  devolve/imprime as senhas UMA vez. Recusa, antes de escrever: fora de `AMBIENTE_DC360=hml`;
  sem `DATABASE_URL` ou sem `IDENTIDADE_DO_BANCO`; identidade de PROD declarada ou na URL; URL
  que não traz a identidade declarada; banco que já tem QUALQUER município (real: mensagem de
  município real; só sintéticos: "já foi semeado"). `LOCK TABLE organizacoes` serializa dois
  semeadores; falha no meio faz `ROLLBACK` de tudo. Roda de `apps/api` com
  `npx tsx src/semear-homologacao.ts` (não toquei em `package.json`).
- `db/src/guarda-da-semente.ts` (novo) e `db/src/cli.ts`. A guarda do `--semear` deixa de
  depender de `NODE_ENV=production` no processo: olha para ONDE a conexão vai. Só semeia sem
  `DATABASE_URL` (banco efêmero) ou em host da própria máquina / serviço do Docker. Recusa
  `NODE_ENV=production`, `AMBIENTE_DC360` `prod` ou `hml`, identidade de PROD no usuário ou no
  host da URL (inclusive via túnel em 127.0.0.1), host hospedado de qualquer ambiente e URL
  ilegível (fail-closed). A recusa roda ANTES de conectar e de migrar, sai com código 1 e nunca
  repete a URL. `db/src/index.ts` exporta a guarda e `urlComAncoraDeConfianca`.
  NÃO toquei em `db/src/migrar.ts`.
- Testes novos: `db/test/guarda-da-semente.test.ts` (18), `apps/api/test/semear-homologacao.test.ts`
  (22), `apps/api/test/fly-hml.test.ts` (9), `apps/console/test/fly-hml.test.ts` (4).
  `scripts/conferir-ambiente.test.mjs` (existente) passou a exigir `avisos` vazio.
- Documentação: `docs/AMBIENTES.md` (seções 2, 7, 9 e a nova 11) e `docs/IMPLANTACAO.md` (nova
  seção 9, Homologação: roteiro de criação, semeadura, prova, o que não está coberto).
- Contabilidade: `scripts/baseline.mjs` (API +31, banco +18, console 330 para 334), `README.md` e
  `docs/COLOCAR-DE-PE.md` com os totais novos (3711 testes; 5708 com o aplicativo).

**Testes (saídas em `saidas/`):**

- `npm run test:isolamento` (CA-06, portão número um): 363 passam, 3 pulados por ambiente
  (já eram). `saidas/02`.
- `npm run test:api`: 1815 passam, 34 pulados (já eram). `saidas/03`.
- `npm run test:console`: 334 passam. `saidas/04`.
- `npm run test:scripts`, `conferir:numeros`, `baseline.test.mjs`, `regras-de-conteudo` e os
  typechecks de db, api e console: verdes (`saidas/01`, `05` a `09`).
- Negativos obrigatórios da etapa: `defesa-civil-2026` não loga em NENHUMA conta semeada de
  HML; `--semear` contra URL de PROD sem `NODE_ENV` recusa (função e comando de verdade,
  `saidas/11` e `14`); semear banco com município real recusa e não escreve nada; API de HML
  configurada pelo `fly.hml.toml` com a `DATABASE_URL` de PROD não parte (`saidas/12`), nem
  o console de HML com a de PROD (`saidas/13`).
- Isolamento em HML: com a conta de Serra Alta (login com a senha sorteada, no Postgres em
  WebAssembly com as migrações e a RLS de verdade), ler pela API a ocorrência
  `22222222-...-0000000000c1` de Vale Fundo dá 404 e a de Serra Alta dá 200 (`saidas/12`).
- Prova de mordida (`saidas/10`): com a checagem da identidade de PROD desligada na guarda, 5 dos
  casos negativos reprovam; religada, os 18 passam.

## Interpretação

A etapa original mistura infraestrutura (CP-05) e código. Entregue o que se faz sem contratar nada:
os dois tomls coerentes com a matriz, a semente sem hash fixo, o semeador com senha sorteada e a
guarda corrigida. O defeito central (OPS-83, OPS-100, ARQ-34) está fechado no código: antes, um
`--semear` contra a URL de PROD copiada para o terminal, sem `NODE_ENV`, semearia contas de
coordenador com senha pública na base dos municípios; agora recusa por onde a conexão vai.

## Riscos aceitos e limites (ditos abertamente)

- **HML NÃO existe no ar.** Nenhum app, banco, bucket ou e-mail de HML foi criado; `/saude` 200
  nos dois apps, a migration do zero contra o Postgres 17 de HML, o `--conferir` contra ele, o
  endurecimento vazio e o fluxo A no painel de HML NÃO foram provados. O que está provado é o
  repositório: tomls, partida (config) e semente no PGlite (Postgres 16 em WebAssembly).
- A semente foi rodada no PGlite, não num Postgres 17 com os três papéis reais. A RLS foi
  exercida pelo papel `dc360_app` do próprio PGlite (o mesmo que os testes de isolamento usam),
  e a atualização de `senha_hash` roda com o papel dono (setup), como no migrador.
- A guarda do `--semear` recusa hoje também um banco de DESENVOLVIMENTO hospedado (um projeto
  Supabase de dev, por exemplo): o desenho é fail-closed e só aceita a própria máquina e serviço
  do Docker. Quem precisar semear banco remoto de desenvolvimento não tem escape de propósito.
- `IDENTIDADES_DE_PROD` em `db/src/guarda-da-semente.ts` repete a identidade de
  `ambientes.prod.identidadeDoBanco`; o teste reprova se divergirem, mas mudar o projeto de PROD
  exige mudar as duas.
- O nome dos apps do Fly (`defesa-civil-hml`, `defesa-civil-console-hml`) é uma escolha minha: o
  Fly pode recusar se já existirem. Trocar nos toml e na matriz.
- A CA do provedor de HML pode diferir da de PROD; o roteiro manda passar `sslrootcert=` na URL.
- O formatador (Prettier, E17) não existe neste ramo (`dc360/.prettierrc.json` ausente): os arquivos
  novos não passaram por ele. Estilo seguido: o dos vizinhos (aspas duplas, ponto e vírgula).

## Para o orquestrador

**Linha sugerida para o STATUS:**
`V2-F01-E11 | IMPLEMENTADA (parte a, código) | candidato | HML no ar BLOQUEADO por CP-05 (apps Fly, banco PG17, bucket, e-mail de teste)`

**Pendências humanas (o que o Rafael faz fora do repositório; roteiro em `dc360/docs/IMPLANTACAO.md`, seção 9):**

1. CP-05: contratar/criar o segundo conjunto de serviços: dois apps do Fly (API e console de HML),
   projeto de banco Postgres 17 SEPARADO de PROD com os papéis (setup, `dc360_app`, `dc360_api`,
   login do console), bucket próprio e domínio/e-mail de teste.
2. Trocar os marcadores (`a-definir-no-cp-05`, `painel-hml.a-definir.invalid`) pela referência real do
   projeto de banco e pelo domínio do painel de HML nos DOIS toml e em `scripts/ambientes.json`
   (`identidadeDoBanco`, `dominio`, `appsNoFly`), no mesmo commit (depende também da E10 para o
   domínio). Se o Fly recusar o nome dos apps, trocar os nomes.
3. Gravar os segredos de HML, todos distintos dos de PROD, e conferir só os nomes:
   `node scripts/conferir-ambiente.mjs --ambiente=hml --app=api --fly=defesa-civil-hml` (e console).
4. Migrar do zero com o papel de setup, `--conferir` ("Esquema em dia"), migrar de novo ("Nada a
   fazer"), aplicar `db/provedores/supabase-endurecer.sql` e rodar a consulta de conferência (vazia).
   Arquivar a saída em `docs/evidencias-v2/G01/V2-F01-E11/` (a validação da etapa pede).
5. Semear com `cd apps/api && npx tsx src/semear-homologacao.ts` (com `AMBIENTE_DC360=hml`,
   `IDENTIDADE_DO_BANCO` e `DATABASE_URL` de setup de HML) e guardar as senhas impressas no cofre.
6. `fly deploy -c fly.hml.toml` e `-c fly.console.hml.toml`; `/saude` 200; entrar com a senha sorteada;
   ver a marca d'água nos documentos; rodar o fluxo A (prefeitura manual) no painel de HML.
7. Confirmar que o CA do provedor de HML é o mesmo de `db/provedores/supabase-prod-ca-2021.crt`, ou
   passar `sslrootcert=` nas URLs.
