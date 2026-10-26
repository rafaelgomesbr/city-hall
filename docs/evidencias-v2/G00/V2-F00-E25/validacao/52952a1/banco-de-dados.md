---
validador: banco-de-dados (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E25
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [DB, INFRA, TENANT, RLS]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Segui `dc360/docs/RESTORE-DO-BANCO.md` (versão do SHA) passo a passo no macOS arm64, a plataforma que o roteiro declara "não executada em prova nenhuma". Servidor: PostgreSQL 17.10 (binários descartáveis do gatekeeper, `initdb` e `pg_ctl`). Cliente: `pg_dump`, `pg_restore` e `psql` 17.6 dos binários oficiais da EDB baixados para uma pasta nova do scratchpad (a máquina não tem cliente Postgres), apagados no fim. Dois clusters NOVOS, origem na porta 55451 e destino na 55452, `initdb` com `--pwfile`, `-A scram-sha-256`, `-E UTF8`, `--locale=C`, exatamente como o passo 1. Senhas sorteadas na rodada, guardadas em arquivo na pasta temporária e redigidas nas saídas. Saídas em `$SP/val/banco-de-dados/` (60 a 69 e a pasta `e25/`).

1. Passo 0 e 1: versões impressas; os dois `initdb` e o `pg_ctl start` com o redirecionamento funcionam como escritos no macOS (o socket vai para `/tmp`, sem o problema de tamanho de caminho) (`60`).
2. Passo 2, origem como o job `implantavel`: banco, papéis, `ALTER SCHEMA`, `GRANT CREATE`, `npm run migrar` aplica as 50 (001 a 050), `--conferir` "Esquema em dia.", `--semear` "Semeado com os dois municípios fictícios.", `GRANT dc360_app TO dc360_api` (`61`).
3. Passo 3, dump: COMO ESCRITO, falha (`password authentication failed for user "dc360_setup"`, código 1): o roteiro manda usar `PGUSER=postgres` e a senha do `postgres` em `PGPASSWORD` em todos os comandos, e o passo 3 conecta como `dc360_setup` num cluster que ele mesmo criou com scram. Com a senha do `dc360_setup`: código 0, 374.789 bytes, `pg_restore -l` com 2 entradas de extensão (o `pg_trgm` vai junto com `--extension=pg_trgm`) (`62`). Ver achado 1.
4. Passo 4: papéis no destino, inclusive `dc360_app` e `dc360_console` criados pelo `dc360_setup`; banco do destino; `DROP SCHEMA public CASCADE`; `GRANT CREATE` (`63`). O `createdb` não veio no pacote que extraí: usei o `CREATE DATABASE ... TEMPLATE template0 ENCODING 'UTF8' LOCALE 'C'` equivalente (limitação minha, não do roteiro).
5. Passo 5: `pg_restore --exit-on-error` como `dc360_setup`, código 0, 0,2 s (`63`).
6. Passo 6, conferência com os arquivos SQL da evidência da E25 (`e25/`, `64`):
   - `linhas`: idêntico (37 linhas de saída);
   - `estrutura`: 813 linhas e exatamente as duas diferenças que o roteiro prevê, a ACL do `public` com as mesmas entradas em outra ordem e a restrição `oficio_envios.provedor_id_plausivel` com outro md5 (parênteses agrupados); nada além disso;
   - `schema_migracoes`: 50 linhas dos dois lados, md5 do conjunto igual (`5e037dd0...`, `67`);
   - catálogo do restaurado: 27 funções SECURITY DEFINER de 82, 94 policies; `travar_sessoes_do_usuario` (049) SECURITY INVOKER, `abrir_sessao` (050) e `console_suspender_municipio` (049) com dono `dc360_setup` e as mesmas ACL da origem (`67`);
   - `isolamento.sql` como `dc360_api` assumindo `dc360_app`: `rolsuper` e `rolbypassrls` falsos para os dois, 0 tabela com dono da aplicação; sem contexto, 32 tabelas lidas e só `schema_migracoes` (catálogo, sem RLS) com linhas (50), 4 sem privilégio de leitura; com contexto de A, 30 tabelas com `organizacao_id`, 47 linhas de A e 0 fora de A; contexto de B espelhado; escrita cruzada `UPDATE 0`; `UPDATE` e `DELETE` em `trilha_eventos` e `UPDATE` em `trilha_administrativa` com `permission denied`; `interesse_municipio` sem leitura (`64`);
   - `npm run migrar -- --conferir` na cópia: "Esquema em dia." (`65`).
7. API apontada para a cópia com o login restrito: `/saude` 200 com `ultimaMigracao` 050; a sonda `sondas/api-contra-a-copia.mjs` da evidência: login da coordenadora, lista com 6 itens, detalhe 200, ocorrência de Vale Fundo com token de Serra Alta 404, busca com `pg_trgm` 200, "TODAS AS CONFERENCIAS PASSARAM" (`66`). Rodei a API por `tsx src/index.ts` e não por `node apps/api/dist/index.js` porque o `dist` desta árvore é de 15/09 (anterior às migrações 047 a 050 e ao código delas); ver achado 2.
8. Passo 7: os dois bancos listados eram só os da prova; servidores parados, pasta apagada, nenhum `*.dump` no scratchpad (`69`).
9. Job de restore do CI (run 38618369218, job 116039196518, `40-ci-restore.log`): origem e destino PostgreSQL 17.11, "migracoes em disco: 50", as 50 aplicadas, os dois negativos (sem `dc360_console`; dump sem `--extension=pg_trgm`) reprovando com as mensagens esperadas, linhas e estrutura idênticas, 50 impressões, RLS forçada em 35 tabelas nos dois lados, isolamento afirmado nos dois lados, `--conferir` na cópia, API contra a cópia, "RESTORE ENSAIADO: 27 conferencias passaram, 0 falharam."
10. Regressão obrigatória: `npm run test:isolamento` 345 aprovados e 3 pulados, código 0 (`50`); `npm run migrar -- --conferir` contra o meu Postgres 17 descartável: "Esquema em dia." (relatório da E07, `04`).
11. Achados das rodadas 1 e 2: "47 migrações" e "Postgres 17 não provado": consertado no texto (o roteiro diz 50 e trata os números como fatos datados). Senha do `dc360_setup` ambígua: CONTINUA, agora reproduzida (achado 1). Falta o build da API: CONTINUA (achado 2). `--conferir` só compara nomes (`db/src/migrar.ts`, `migracoesPendentes`): continua, anotado. O restore só roda com `[ci completo]`: não reconferido (é de engenharia).

## Evidência

Arquivos `60` a `69`, `e25/linhas-*.txt`, `e25/estrutura-*.txt`, `e25/isolamento-restaurado.txt`, `40-ci-restore.log`, `50-test-isolamento.txt`, todos em `$SP/val/banco-de-dados/`. Códigos de saída anotados em cada arquivo.

## Cenários positivos

Restore completo das 50 migrações num segundo cluster Postgres 17 no macOS, linhas e impressões idênticas, API contra a cópia.

## Cenários negativos

No restaurado, como papel de aplicação: 0 linha sem contexto, 0 linha cruzada com contexto de A, escrita cruzada sem efeito, `UPDATE` e `DELETE` na trilha negados. Ocorrência de outro município pela API da cópia: 404. Os negativos do restore (papel ausente, dump sem extensão) provados pelo CI neste SHA.

## Tentativas de reprovar

1. Seguir o roteiro literalmente, sem completar nada de cabeça: quebrou no passo 3 (achado 1).
2. Procurar diferença de estrutura além das duas previstas, com as funções recriadas pela 049 e 050: nenhuma.
3. Conferir que o restaurado não ganhou dono de aplicação nem BYPASSRLS: não quebrou.
4. Conferir que o CI rodou de fato com 50 migrações e Postgres 17 (e não com o número antigo): rodou.

## Achados

1. CORRIGE ANTES DE CRESCER (documentação, dono E25): o roteiro diz que "todos os comandos abaixo usam `PGUSER=postgres` e a senha em `PGPASSWORD`", mas os passos 3, 4 (os dois `psql -U dc360_setup`), 5 e 6 (dois comandos) autenticam como `dc360_setup`, cuja senha é outra (`'...'` no passo 2), num cluster criado com scram. Seguido à risca, o `pg_dump` sai com `password authentication failed` (`62`). É a ambiguidade apontada na rodada 1, agora com a reprodução. Remédio: dizer qual senha cada comando usa (por exemplo `PGPASSWORD="$(cat "$TMP/.senha-setup")"` nesses comandos).
2. CORRIGE ANTES DE CRESCER (documentação, dono E25): o passo 6 sobe a API por `node apps/api/dist/index.js` sem mandar construir antes (`npm run build --workspace @dc360/shared`, `@dc360/db` e `@dc360/api`, como o CI faz). Num clone novo o comando falha à vista; numa máquina de desenvolvimento ele sobe em silêncio um `dist` velho (aqui, de 15/09, sem o código das migrações 047 a 050) e a conferência "API contra a cópia" prova o código errado.
3. ANOTADO: o texto ainda diz que, com 50 migrações, "o job ainda não rodou, e este documento não afirma que ele passa"; o run 38618369218 já rodou e passou (27 de 27). E diz que o macOS não foi executado em prova nenhuma: esta validação o executou (com os ajustes dos achados 1 e 2).
4. ANOTADO (herdado da rodada 2): `migrar --conferir` compara só nomes de migração; quem confere o histórico de verdade é o diff das impressões do passo 6.

## Não verificado

- Os dois negativos do restore (papel `dc360_console` ausente, dump sem `pg_trgm`) não foram repetidos localmente; estão provados pelo CI neste SHA.
- Origem Supabase, provedor gerenciado e fotos e assinaturas do balde: fora da etapa (F01-E15 e F22).
- Segunda pessoa humana em máquina limpa: continua a substituição registrada no VEREDITO da rodada 2 (CI em Linux); esta prova é de outro agente, no macOS, numa máquina que já tinha Node e dependências.
- Rodei com o cliente 17.6 contra servidor 17.10 (mesma versão maior); não com o cliente do Homebrew que o roteiro cita.

## Risco residual

O restore funciona com as 50 migrações e preserva o isolamento, em Linux pelo CI e no macOS por mim. Quem seguir o roteiro sem conhecimento prévio esbarra na senha do `dc360_setup` e pode provar a API com um build velho; os dois são correções de texto.

## Motivo do humano

Não se aplica.
