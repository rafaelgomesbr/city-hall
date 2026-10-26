---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E25
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [DB, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Notação: `$V` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-qa/e25` e `$R` = `.../scratchpad/val-qa/reg`. PostgreSQL 17.6 real (binários da EDB em `.../scratchpad/pg17/pgsql/bin`), dois clusters MEUS criados com `initdb` em `$V/pg-origem` e `$V/pg-destino` (portas 55871 e 55872, autenticação scram, senha aleatória num arquivo apagado ao fim, nunca impressa), recriados do zero antes de cada ensaio, parados ao fim. API do ensaio na porta 55873. Node 24.15.0 (o `.nvmrc` pede 22). `apps/api/dist` recompilado antes (`$V/00-build-api.txt`), para não provar código velho.

Por que foi revalidada: o diff `1ed0b71..fd17ff4` toca o mapa de QA (README, workflow, `baseline.mjs`, `e2e-api.mjs`). Conferi: `RESTORE-DO-BANCO.md`, `scripts/ensaiar-restore.sh`, `scripts/restore/`, `INDISPONIBILIDADE.md` e `db/` não mudaram (diff vazio); no workflow, os dois trechos mudados são do job do navegador (linhas 307 e 371), não do job `restore`; em `COLOCAR-DE-PE.md` mudaram só duas contagens de testes.

| Critério | Resultado | Prova |
| --- | --- | --- |
| Restore sem erro com `--exit-on-error`, origem com as 51 migrações e a semente | PASS: `RESTORE ENSAIADO: 27 conferencias passaram, 0 falharam`, código 0, na árvore e de novo na cópia `git archive fd17ff4` | `$V/01-ensaio-verde.txt`, `$V/r1-verde/conferencias.txt`, `$V/02-copia-sem-mutacao.txt` |
| Contagens por tabela e `schema_migracoes` iguais | PASS: `linhas` idêntico (37 linhas, 110 registros), `estrutura` idêntico (816 linhas, inclui as impressões das 51 migrações) | `$V/r1-verde/13-diff-*.txt` |
| RLS ativada e forçada nas 35 tabelas, nos dois lados | PASS: `negocio_sem_rls_forcada|0` na origem e no restaurado, 35 tabelas contadas | `$V/r1-verde/12-estrutura-*.txt` |
| `pg_trgm` e `gin_trgm_ops`; a API usa a busca restaurada | PASS: dump com a extensão; `GET /busca?q=acacias` 200 achando 000471/2026 | `$V/r1-verde/19-api-contra-a-copia.txt` |
| Isolamento no restaurado: sem contexto 0 linhas; com A nada de B; UPDATE e DELETE na trilha negados; papel de aplicação sem BYPASSRLS e sem ser dono | PASS: `ISOLAMENTO: TODAS AS AFIRMACOES PASSARAM` nos dois lados, narrativa idêntica, 0 tabela com dono de papel da aplicação, trilha sem policy de UPDATE e DELETE | `$V/r1-verde/17-*.txt` |
| A API apontada para a cópia (`/saude` 200, login e leitura; 404 do outro município) | PASS, com prova independente: com a ORIGEM DESLIGADA antes de a API subir, `/saude` 200 `banco=ok`, login, lista, detalhe, 404 cruzado e busca passam (M5); a mesma ordem com a API apontada para a origem reprova (M5b) | `$V/M5-origem-desligada-antes-da-api.txt`, `$V/M5b-origem-desligada-e-api-para-a-origem.txt` |
| Negativos da etapa: sem `dc360_console` o restore para; dump sem `pg_trgm` diz que o operador não existe | PASS: as quatro conferências de negativo do ensaio (`role "dc360_console" does not exist`, `gin_trgm_ops`) | `$V/r1-verde/08-*.txt`, `09-*.txt` |
| O teste morde (risco alto) | PASS em 5 de 6 mutações próprias (tabela abaixo); a sexta é o achado | `$V/M*.txt` |
| Regressão: `test:isolamento`, `migrar -- --conferir` | PASS: `migrar --conferir` "Esquema em dia." na origem e na cópia, em cada ensaio; `test:isolamento` 345 e 3 pulados dentro do `npm test` (código 0) e pelo gatekeeper | `$V/r1-verde/04-*.txt`, `20-*.txt`, `$R/06-npm-test.txt` |
| Regressão no que o diff tocou | PASS: `test:scripts` 324 de 324; `test:e2e:api` Chromium 288 e 197, código 0 | `$R/03-test-scripts.txt`, `$R/07-e2e-api-chromium.txt` |
| CI | PASS: job "Restore do banco, Postgres 17 (CA-08)" (118619736536) do run 39420436042 sobre `55209ab`, todos os passos `success`, inclusive "Subir os dois servidores PostgreSQL 17" e "Ensaiar o restore" (lido pela API pública de jobs; o log e o artefato exigem token) | `.../scratchpad/val-qa/ci/jobs-e-passos.txt` |
| Roteiro repetido por segunda pessoa | Humano | |

## Evidência

- `bash scripts/ensaiar-restore.sh` na árvore, com `PGBIN` dos binários 17.6: código 0 (`$V/01-ensaio-verde.txt`; versões em `$V/r1-verde/01-versoes.txt`: `pg_dump`, `pg_restore`, `psql` e os dois servidores 17.6).
- Mutações na cópia `$V/copia/dc360` (`git archive fd17ff4`, `node_modules` e os três `dist` por link para a árvore), com `$V/ensaiar.sh` (recria os dois clusters do zero e roda o ensaio) e o script original guardado em `$V/ensaiar-restore.orig`, devolvido e conferido com `cmp` depois de cada uma.
- Segredo: a senha do superusuário não aparece em nenhum arquivo de saída (`grep -F` sem ocorrência); nenhum `*.dump` sobrou em `$V`.
- Limpeza: os dois clusters parados com `pg_ctl stop`, nenhuma porta 55871 a 55873 escutando, nenhum processo `postgres` dos binários do scratchpad vivo, arquivo de senha apagado.

## Cenários positivos

- Ensaio inteiro verde na árvore e na cópia (27 de 27), contra PostgreSQL 17.6.
- A API contra a cópia continua respondendo com a origem desligada (M5), o que prova que ela fala com o banco restaurado.

## Cenários negativos

| Mutação (na cópia) | Esperado | Obtido |
| --- | --- | --- |
| M1: migração 052 nova cria tabela com `organizacao_id`, RLS ativada e NÃO forçada | reprova | 1, "origem: toda tabela de negocio tem RLS ativada E forcada" |
| M2: uma linha de `avisos` apagada no restaurado depois do restore | reprova | 1, "linhas: origem e restaurado DIFEREM" |
| M2b: um aviso movido para o outro município no restaurado (mesma contagem) | reprova | 1, "o isolamento narrado difere entre origem e copia" |
| M2b (primeira tentativa): ocorrência movida de município | reprova | o próprio banco recusa (chave estrangeira `trilha_ocorrencia_do_mesmo_municipio`), código 1 |
| M4: uma policy de `ocorrencias` apagada no restaurado | reprova | 1, "estrutura: origem e restaurado DIFEREM" |
| M5b: API apontada para a origem, origem desligada | reprova | 1, "a API nao respondeu /saude 200 contra a copia" |
| M3: API apontada para a ORIGEM, origem ligada | reprova | **0, 27 de 27** (achado) |
| M2c: nome de um usuário alterado no restaurado (mesma contagem, mesmo município) | fora do critério (a etapa pede contagens) | 0 |

## Tentativas de reprovar

- Rodei o ensaio do CI fora do CI, contra servidores meus, recriados do zero a cada vez.
- Procurei o que a conferência não vê, mexendo no restaurado DEPOIS do restore (linha a menos, linha de outro município, policy a menos, conteúdo), na origem ANTES do dump (tabela nova sem RLS forçada) e no próprio script (a API apontada para a origem). Cinco mordem; o conteúdo alterado passa (fora do critério, que pede contagem) e a API apontada para a origem passa (achado).
- Para não deixar o critério "API contra a cópia" só na leitura da linha 102 do script, desliguei a origem antes de a API subir: a API continuou passando nas cinco conferências, e com a URL trocada para a origem ela não sobe. Isso prova o código de hoje.
- Conferi que nada da E25 mudou desde a rodada 6 e que o que mudou no mapa (workflow, `e2e-api.mjs`, `baseline.mjs`, README) não quebrou a regressão.

## Achados

- **Corrige antes de crescer.** A conferência "API contra a cópia" de `dc360/scripts/ensaiar-restore.sh` (etapa 9) não distingue a cópia da origem: com `URL_API_DESTINO` apontando para a porta e o banco da origem (linha 102), o ensaio dá 27 de 27 e código 0 (M3), porque origem e cópia têm os mesmos dados e as duas estão de pé. Hoje a linha está certa e o critério está provado (M5), mas uma regressão nessa linha passaria no job do CI. Conserto sugerido: desligar a origem (ou revogar o login da aplicação nela) antes da etapa 9, depois de ler o id do outro município, e mover a etapa 10 para antes; ou gravar um marcador só no restaurado e exigir que a API o veja. Reprodução: na cópia, trocar `${PORTA_DESTINO}/${BANCO_DESTINO}` por `${PORTA_ORIGEM}/${BANCO_ORIGEM}` em `URL_API_DESTINO` e rodar o ensaio.
- **Anotado.** A comparação de dados é por contagem por tabela (o que a etapa pede); conteúdo alterado no restaurado com a mesma contagem e o mesmo município passa (M2c). Um md5 por tabela fecharia isso.

## Não verificado

- Seguir `RESTORE-DO-BANCO.md` passo a passo nesta rodada: o documento não mudou desde a rodada 6, quando o QA o seguiu à risca em `zsh` e `bash` 3.2; aqui rodei o ensaio automatizado e as mutações.
- Linux e Windows seguindo o documento; o Linux está coberto só pelo ensaio automatizado do CI (job 118619736536), cujo log e artefato não li (exigem token).
- Segunda pessoa (ou o Rafael noutra máquina) seguindo o roteiro do zero: humano.
- Node 22 (rodei 24) e PostGIS (os binários 17.6 do scratchpad não o têm; nenhuma migração atual o exige no ensaio).

## Risco residual

O restore está provado com 51 migrações em PostgreSQL 17.6, com isolamento e trilha intactos e a API contra a cópia. O risco que sobra é de manutenção: a conferência da API não acusaria uma troca de banco no próprio script, e diferenças de conteúdo com a mesma contagem não são comparadas.

## Motivo do humano

A Definition of Done pede o roteiro repetido por uma segunda pessoa (ou pelo Rafael noutra máquina) a partir de `RESTORE-DO-BANCO.md`; isso prova que o texto serve a quem não escreveu o sistema, e agente não substitui.
