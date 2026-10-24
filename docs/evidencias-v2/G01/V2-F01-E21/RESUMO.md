# V2-F01-E21: PostGIS no CI e no ambiente local (imagem Postgres com a extensão e testes espaciais em Postgres real)

## Fatos

**O que mudou:**

- `.github/workflows/verificar.yml`: a linha de serviço do job `implantavel` (era `postgres:17`) e a do job `imagens`
  (era `postgres:17`) passam a `postgis/postgis:17-3.5@sha256:01a6a70e41e6c4467c8f55f6063555ed72db2d6662cd0d571040d42eadaeb6f6`.
  O digest é o do ÍNDICE multiarquitetura da tag `17-3.5`, lido no registro (Docker Hub, `docker-content-digest`) em
  2026-10-24; a plataforma amd64 do runner resolve a partir dele. O job `produto` não foi tocado. O `implantavel` ganhou o
  passo "Smoke espacial, em Postgres real com PostGIS": `npm run test:espacial` com `DC360_EXIGE_POSTGIS=1` e
  `DC360_POSTGRES_DE_PROVA` apontando para o superusuário do serviço, e reprova também se o vitest relatar teste
  "skipped" (mesmo desenho da corrida de renovação). Nenhum nome de job mudou.
- `dc360/compose.yaml`: `banco` e `papeis` com a mesma imagem por digest (antes só a tag), mais o comentário que manda
  trocar tag e digest nos três lugares juntos.
- `dc360/db/vitest.espacial.config.ts` (novo): só `test/**/*.espacial.test.ts`, mesmos tetos de tempo da suíte comum.
- `dc360/db/vitest.config.ts`: exclui `**/*.espacial.test.ts`, para o PGlite do `npm test` e do `test:isolamento` nunca
  os carregar.
- `dc360/db/package.json` e `dc360/package.json`: só a linha do script `test:espacial` (na raiz delega ao `db`). O
  `verificar` local NÃO inclui `test:espacial` (quem usa só PGlite não precisa de Docker); quem o exige é o CI.
- `dc360/db/test/postgis-decisao.ts` (novo): a regra rodar / pular com aviso / reprovar. `DC360_EXIGE_POSTGIS=1` torna
  servidor ausente, inacessível ou sem a extensão uma REPROVAÇÃO; sem a variável, pula com aviso que ensina a rodar.
- `dc360/db/test/postgis-decisao.test.ts` (novo, 8 casos, suíte comum): prova a regra sem Postgres, inclusive "Postgres
  simples com a exigência ligada reprova".
- `dc360/db/test/postgis-disponivel.espacial.test.ts` (novo, 11 casos): sonda o servidor; num banco e papel
  descartáveis (`prova_e21_<sorteio>`, apagados no fim) cria a extensão e prova: versão 3.x, `spatial_ref_sys` com o SRID
  4326 legível pela aplicação (papel sem superusuário e sem BYPASSRLS), `ST_Contains` (dentro e fora), `ST_DWithin` em
  `geography` medindo em metros, e o isolamento: tabela com coluna `geography` sob RLS ativada e FORÇADA, com um ponto
  do município B a ~51 m de um do A. Como `dc360_api`-equivalente, a busca por raio do A devolve `A1, A2` e nunca `B1`
  (o controle, como superusuário, devolve os três); o B só vê `B1`; sem organização na transação nada aparece; gravar
  em nome de outro município reprova pela policy.
- `dc360/scripts/smoke-das-imagens.test.mjs`: as duas asserções de `postgres:17` viram a imagem por digest, e três casos
  novos (mesma imagem por digest em compose e nos dois jobs; `test:espacial` obrigatório e "pulado reprova" no
  `implantavel`; scripts e exclusão do `npm test`).
- Documentação: `dc360/docs/AMBIENTES.md` (versões e seção "PostGIS no CI e no ambiente local"), `dc360/docs/COLOCAR-DE-PE.md`
  (tabela de versões), `dc360/README.md` (comando, tabela do CI, nota do PostGIS). `scripts/ambientes.json` não guarda
  versão de banco, então não mudou; `node scripts/conferir-ambiente.mjs` segue verde.
- Contagens: `baseline.mjs` ganhou `V2-F01-E21: 8` no passo do banco (345 para 353) e `V2-F01-E08` foi de 15 para 18 nos
  scripts; README e `COLOCAR-DE-PE.md` ajustados (3741, 353, 5738). O arquivo espacial fica fora da conta
  (`vitest.config.ts` o exclui).

**O que NÃO foi feito (de propósito):** nenhuma migração com PostGIS, nenhum modelo espacial (F32); nada de extensão no
provedor nem em HML (E22, CP-44).

## Limites declarados (leia antes de dar PASS)

- **Esta máquina não tem Docker nem Postgres.** O corpo do teste espacial (`CREATE EXTENSION postgis`, `ST_Contains`,
  `ST_DWithin`, RLS sobre `geography`) NÃO foi executado aqui. A prova dele é o job `implantavel` no CI do SHA candidato,
  passo "Smoke espacial". Foram executados aqui, de verdade: a sonda, a decisão e os caminhos sem servidor
  (`saidas/09`), o `test:isolamento` (353 passando, 3 pulados por ambiente, o espacial fora da conta) e a leitura de
  estrutura do workflow e do compose (`smoke-das-imagens.test.mjs`).
- A subida do `docker compose up` com a imagem por digest continua sem registro de execução (validação humana: Rafael).
- O digest foi lido no registro pela API (sem Docker). A imagem só foi varrida quando a E20 a varrer no job `imagens`.
- Nesta máquina `apps/campo/node_modules` não existe: `lint` do aplicativo e o caso "as regras mordem no aplicativo de
  campo" de `lint-regras.test.mjs` falham por isso, não por esta etapa (o lint do monorepo está verde, `saidas/02`).
  O caso do INDEX de `saidas/05` reprovou porque esta pasta ainda não tinha INDEX naquela rodada; com o INDEX,
  `node dc360/scripts/conferir-indices-de-evidencia.mjs` fecha verde.

## Provas (em `saidas/`)

1. `01-typecheck.txt` (código 0). 2. `02-lint.txt` (monorepo, código 0). 3. `03-lint-teto.txt`. 4. `04-formato.txt`.
5. `05-test-scripts.txt` (640 passam; as 2 reprovações são as dos limites acima). 6. `06-regras-de-conteudo.txt`.
7. `07-conferir-numeros.txt`. 8. `08-test-db.txt` (`test:isolamento`: 353 passaram, 3 pulados). 9.
`09-espacial-local-e-negativos.txt` (pula com aviso; `EXIGE=1` sem servidor ou com servidor fora do ar reprova). 10.
`10-prova-de-mordida.txt` (voltar o `implantavel` a `postgres:17`, tirar o digest do compose e desligar a exigência
derrubam os casos esperados; restaurado, 18 de 18). 11. `11-conferir-ambiente.txt`.

## Para o orquestrador

- **Linha do STATUS sugerida:** `V2-F01-E21 | IMPLEMENTADA (candidato) | PostGIS 17-3.5 por digest em implantavel, imagens e compose; db/vitest.espacial.config.ts, test:espacial e smoke espacial (ST_Contains, ST_DWithin, RLS sobre geography) obrigatório no implantavel com DC360_EXIGE_POSTGIS=1; PGlite mantido. Prova do corpo do teste: o CI do SHA (sem Docker local).`
- **Ao validar:** abrir o run do SHA e ler `implantavel`, passo "Smoke espacial" (`implantavel-<sha>/09-test-espacial.txt`: 11 passaram, 0 skipped) e `imagens` verde com o Postgres novo. Se o `implantavel` ou o `imagens` ficarem vermelhos por causa da imagem (por exemplo, uma migração que enumera tabelas de `public` e encontra `spatial_ref_sys` no banco `postgres` da imagem), o rollback é voltar as duas linhas a `postgres:17` e tirar o passo.
- **Pendências humanas (fora do repositório):** (1) Rafael roda `docker compose up` com a imagem por digest e registra o resultado (validação humana da etapa); (2) nenhuma ação em Fly, Vercel, Supabase ou GitHub foi feita.
