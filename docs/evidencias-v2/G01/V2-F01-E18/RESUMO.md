# V2-F01-E18: trava contra migração concorrente e regra de migração reversível

Escopo: só `dc360/db/` (código e testes), documentação e contagens. Nada foi
criado nem tocado em `.github/workflows/`, `package.json`, lockfiles, Fly,
Supabase, Vercel ou GitHub. Base: `origin/v2/f01` em `1e2a37e`.

## Fatos

**O que mudou:**

- `db/src/migrar.ts`: `aplicarMigracoes` toma `pg_try_advisory_lock` de sessão
  (`CHAVE_DA_TRAVA_DE_MIGRACAO`) como PRIMEIRA ação, antes até de criar a tabela
  de controle, e a larga num `finally` (sucesso, falha de migração, histórico
  alterado ou papel errado). Trava ocupada: tenta a cada 1 s por 60 s (61
  tentativas) e então lança `MigracaoEmAndamento`, com `codigoDeSaida = 3` e a
  frase "Outra migração está em andamento neste banco". A mensagem do papel
  errado (`garantirTabela`) continua intacta: a trava não pede privilégio, então
  o papel errado ainda chega nela. `motivoParaNaoTravar` recusa a porta 6543
  (pooler em modo transação), porque a trava é de sessão.
- `db/src/cli.ts`: sai com código 3 quando `MigracaoEmAndamento`; recusa 6543
  (código 2) antes de conectar; novo `--desfazer` (recusa antes de conectar em
  PROD; não combina com `--semear` nem com `--conferir`, código 2).
- `db/src/desfazer.ts` (novo): `desfazerUltimaMigracao` desfaz só a ÚLTIMA do
  registro, numa transação com a exclusão da linha em `schema_migracoes`, sob a
  mesma trava. `motivoParaNaoDesfazer` recusa com `AMBIENTE_DC360=prod`,
  `NODE_ENV=production` e URL com a identidade de um banco de PRODUÇÃO (a
  conhecida, `IDENTIDADE_DO_BANCO` ou `CONSOLE_IDENTIDADE_DO_BANCO`), sem repetir
  a senha. Recusa também migração `IRREVERSIVEL`, migração sem arquivo de volta
  (as 001 a 051) e migração aplicada que não existe nesta versão do código.
- `db/src/regras-de-migracao.ts` (novo): a regra. `conferirRegrasDeMigracao`
  devolve as violações: número repetido, nome fora do padrão, migração nova sem
  `desfazer/NNN_nome.sql` e sem cabeçalho `-- IRREVERSIVEL: motivo; aprovado por
  NOME; AAAA-MM-DD` (data ISO válida), cabeçalho incompleto, os dois ao mesmo
  tempo, desfazer órfão ou vazio, migração nova numerada abaixo da última
  isenta, e isenta que sumiu. As 51 existentes estão em
  `MIGRACOES_ISENTAS_DE_DESFAZER`, lista escrita por extenso (arquivo novo com
  número velho não escapa).
- `db/src/carregar.ts`: `carregarDesfazeres` / `pastaDeDesfazeres`.
  `carregarMigracoes` continua lendo só `.sql` direto de `db/migrations`, então
  uma volta nunca é aplicada como migração. `db/migrations/desfazer/LEIA-ME.md`
  mantém a pasta no git e explica a regra.
- Testes novos (todos em `db/test/`, parte de `npm run test:isolamento`):
  `migracoes-regras.test.ts` (19), `desfazer-migracao.test.ts` (18),
  `trava-de-migracao.test.ts` (15, dos quais 3 em Postgres real, pulados por
  ambiente sem `DC360_POSTGRES_DE_PROVA`).
- Documentação: `db/PENDENCIAS.md` (item 7), `docs/runbooks/migracao.md`
  (a trava, a regra, o desfazer só fora de PROD), contagens em `README.md`,
  `docs/COLOCAR-DE-PE.md` e `scripts/baseline.mjs`
  (`"V2-F01-E18": { total: 52, falhas: 0, puladas: 3 }`), e
  `scripts/runbooks.test.mjs` (E18 deixa de ser "dependência futura" do
  `migracao.md`).
- Nenhuma migração existente foi tocada ou reescrita; nenhuma migração nova foi
  criada (a 052 de prova mora só dentro do teste, em PGlite).

**Decisão ajustada ao repositório (para o orquestrador conferir):** o plano
escreveu "obrigatório depois da 046, 46 isentas". Hoje existem 51 migrações
(047 a 051 vieram depois do plano). Escrever a volta de migração já aplicada em
produção seria inventar uma volta que ninguém ensaiou contra o estado dela, e a
etapa diz "desfazer das 46 existentes" fora de escopo. Ficaram isentas as 51, e a
primeira a obedecer a regra é a 052.

## Provas (saídas em `saidas/`)

| Prova | Resultado |
| --- | --- |
| `01-typecheck.txt` | `tsc` limpo no `@dc360/db` |
| `02-test-isolamento.txt` | `npm run test:isolamento` (CA-06 e o resto do banco): 18 arquivos, 412 passaram, 6 pulados por ambiente (3 de `busca`, 3 de Postgres real da trava), 0 falha. `migrar.test.ts` e `isolamento.test.ts` sem editar expectativa |
| `03-lint.txt` | ESLint do monorepo OK. O lint do aplicativo de campo não mede neste ambiente (`apps/campo/node_modules` ausente: o `npm ci` do campo não foi rodado, o disco tem pouco espaço): não é desta etapa |
| `04-lint-teto.txt` / `05-formato.txt` | `lint-teto` OK (431, o teto não subiu); `formato:conferir` OK (arquivos novos formatados; `migrar.ts` e `cli.ts` já estão na baseline de formato e não foram reformatados, para não misturar reformatação com mudança) |
| `06-regras-de-conteudo.txt` | 10 de 10 (sem travessão, sem norma inventada) |
| `07-test-scripts.txt` | 672 passam, 1 falha de ambiente (campo sem `node_modules`) e a conferência de INDEX, que na hora desta saída ainda não tinha o INDEX.md desta pasta (ele hasheia esta própria saída, então é gerado por último; depois dele, `node dc360/scripts/conferir-indices-de-evidencia.mjs` passa, rodado e visto no terminal) |
| `08-conferir-numeros.txt` / `09-baseline-test.txt` | números batem; `baseline.test.mjs` 29 de 29 |
| `10-prova-de-mordida.txt` | tirando a trava do aplicador e a recusa de PROD do desfazer, 8 casos reprovam; restaurados, voltam a passar |
| `11-cli-recusas.txt` | o comando de verdade: PROD recusa com código 1 sem conectar; porta 6543 recusa com código 2; banco efêmero vazio diz "nada a desfazer" |
| `12-recusa-do-segundo-migrador.txt` | o texto que o segundo migrador imprime (validação humana: o Rafael lê) |

**O que cada negativo da etapa provou:** migração nova sem desfazer nem
cabeçalho reprova; número repetido reprova; `--desfazer` em `prod` recusa antes
de conectar; ciclo aplicar, desfazer e reaplicar deixa colunas, índices,
políticas, `relrowsecurity`/`relforcerowsecurity` e funções idênticos (com as 51
migrações reais mais uma 052 de prova com tabela de negócio e RLS forçada); a
trava ocupada por 60 s dá código 3 sem alterar nada.

## Limites (ditos abertamente)

- **A disputa com dois `pg.Client` de verdade NÃO rodou aqui.** Não há Postgres
  nem Docker nesta máquina. O bloco existe (`describe.skipIf(!DC360_POSTGRES_DE_PROVA)`
  em `trava-de-migracao.test.ts`: um espera e aplica sem duplicar, o outro sai
  com código 3, e a trava solta quando a conexão do dono cai), foi escrito com
  cuidado, mas está NÃO EXECUTADO. Localmente o que está provado é a decisão pura
  (executor-casca que responde "ocupada") e o fato de a trava ser tomada e
  largada de verdade no PGlite (via `pg_locks`).
- **O `implantavel` ainda não chama esse teste.** Fechar isso exige um passo em
  `.github/workflows/verificar.yml`, que o briefing proibiu mexer. Está em "Para o
  orquestrador".
- Cobertura de `--desfazer` por banco real de HML não foi exercida (não há HML).

## Para o orquestrador

**Linha sugerida para o STATUS:**
`V2-F01-E18 | IMPLEMENTADA | candidato | trava (pg_try_advisory_lock, 60 s, código 3) e regra de desfazer ativas no test:isolamento; prova com dois pg.Client em Postgres real NÃO EXECUTADA, depende de passo no implantavel`

**Pendências (nada do Rafael fora do repositório, salvo a leitura):**

1. **Workflow (orquestrador, na integração):** acrescentar ao job `implantavel` de
   `verificar.yml`, no padrão do passo "Corrida de renovação contra encerramento,
   em Postgres real", um passo "Trava de migração concorrente, em Postgres real":
   `DC360_POSTGRES_DE_PROVA=postgres://postgres:postgres@localhost:5432/postgres`,
   `npx vitest run --root db test/trava-de-migracao.test.ts | tee
   "$RUNNER_TEMP/artefatos/09-trava-de-migracao.txt"`, e reprovar se aparecer
   `skipped` (o bloco de Postgres real foi pulado). Opcional no mesmo job: dois
   `npm run migrar` simultâneos contra o `dc360` (um deve sair com código 3 se o
   outro segurar a trava), mas o teste já cobre isso com banco descartável.
   `conferir-workflows.test.mjs` deve continuar exigindo `timeout-minutes`, SHA
   fixo etc.
2. **Validação humana (Rafael):** ler `saidas/12-recusa-do-segundo-migrador.txt`
   e confirmar que a frase se entende. Confirmar a decisão das 51 isentas (em vez
   das 46 do plano).
3. **Para a F22-E04 / E12:** o desfazer só existe fora de PROD; migration em PROD
   continua aditiva ou restore.
4. **Aviso para as próximas etapas que criarem migração (052 em diante):** elas
   precisam de `db/migrations/desfazer/052_nome.sql` ou do cabeçalho IRREVERSIVEL,
   senão `npm run test:isolamento` reprova.
