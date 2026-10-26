---
validador: engenharia-entrega
modelo: claude-opus-5-5
etapa: V2-F00-E25
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [DB, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Base: bloco da etapa (`node scripts/roadmap/contexto.mjs V2-F00-E25`), diff `afde25c..7005a60` de `.github/workflows/verificar.yml` e `dc360/docs/RESTORE-DO-BANCO.md`, e os arquivos no SHA (`git show 7005a60:...`) de `dc360/scripts/ensaiar-restore.sh`, `dc360/scripts/restore/*`, `dc360/scripts/ci-artefatos.sh` e `dc360/db/src/cli.ts`. O relatório do qa (`qa.md`, mesmo SHA) foi lido e não refeito.

- Run do SHA: `gh run view 37739535524`: evento push, `headSha` 7005a60, conclusão success, 9 jobs, todos success. Job `restore` ("Restore do banco, Postgres 17 (CA-08)", id 113186786420) de 06:47:04 a 06:48:02 UTC.
- Postgres 17 de verdade nos dois lados: log mostra `pg_dump`, `pg_restore` e `psql` 17.11 (cliente instalado do PGDG) e os dois servidores `PostgreSQL 17.11` (contêineres `postgres:17` separados, portas 55451 e 55452).
- 47 migrações do zero na origem como `dc360_setup` (log lista 001 a 047), `--conferir` "Esquema em dia.", semente "Semeado com os dois municípios fictícios.".
- Dump `--format=custom --schema=public --extension=pg_trgm`; sumário do artefato (`07-sumario-do-dump.txt`) tem `EXTENSION - pg_trgm`; o dump sem `--extension` é conferido como sem a extensão.
- Negativos que mordem: restore sem `dc360_console` sai não zero com `role "dc360_console" does not exist` (`08-negativo-sem-dc360_console.txt`); dump sem extensão sai não zero com `operator class "public.gin_trgm_ops" does not exist` (`09-negativo-sem-pg_trgm.txt`). O script reprova se qualquer um dos dois passar.
- Restore `--exit-on-error` como `dc360_setup`, sem erro (`11-restore.txt` vazio, pipeline sob `pipefail`).
- Linhas por tabela geradas do catálogo com `count(*)` exato (não estimativa), `diff` vazio (`13-diff-linhas.txt` 0 bytes), 37 linhas, total 106, e o script reprova se o total for 0 (comparação vazia).
- Estrutura: 809 linhas idênticas (`13-diff-estrutura.txt` 0 bytes), inclui `md5_das_impressoes` de `schema_migracoes` (59a915b9...), `migracoes|47` conferido contra os arquivos em disco, `indices_gin_trgm_ops|4` nos dois lados.
- RLS: `negocio_sem_rls_forcada|0` e `tabelas_de_negocio|35` afirmados por linha exata nos dois lados; nenhuma tabela com dono `dc360_app`/`dc360_api`; nenhuma policy de UPDATE ou DELETE na trilha.
- Isolamento como `dc360_api` assumindo `dc360_app`, nos dois bancos, com `ON_ERROR_STOP` e sentinela final: papéis sem superusuário nem BYPASSRLS; sem contexto 31 tabelas com 0 linhas; contexto A com 47 linhas de A e 0 fora; espelho em B; escrita cruzada sem efeito; UPDATE e DELETE em `trilha_eventos` e `trilha_administrativa` recusados; `interesse_municipio` recusado. O log do servidor destino (`06-servidor-destino.log`) confirma os `permission denied` do lado do banco.
- `migrar --conferir` na cópia: "Esquema em dia.".
- API construída do SHA (`02-build.txt`) apontada para a cópia com o login restrito: `/saude` com `status ok`, `banco ok`, `ultimaMigracao 047`; login, lista (6), detalhe, 404 da ocorrência de Vale Fundo com token de Serra Alta, busca `pg_trgm` 200; sentinela "TODAS AS CONFERENCIAS PASSARAM". Fecha "RESTORE ENSAIADO: 27 conferencias passaram, 0 falharam."
- Artefato `restore-7005a60...` (id 11533335952, 33 arquivos, 65.665 bytes) baixado e lido: tem versões, saída de cada passo, contagens, impressões, diffs, isolamento, API e lista de bancos; nenhum `.dump`.
- Achado anterior do STATUS (job `implantavel` parando na 041 por `permission denied to create extension "pg_trgm"`): NÃO acontece mais neste SHA. Log do job 113186786552: `GRANT CREATE ON DATABASE dc360 TO dc360_setup` executado (`02-provisionar.txt` mostra o segundo `GRANT`), `aplicando 041_busca_com_tolerancia_a_erro.sql`, 47 aplicadas, "Esquema em dia.", `/saude` `{"status":"ok","banco":"ok","ultimaMigracao":"047_familia_da_sessao.sql",...}`; nenhuma ocorrência de `permission denied` nem de `indisponivel` no log.

## Evidência

- `gh run view 37739535524 --json headSha,event,status,conclusion,jobs` (exit 0).
- `gh run view 37739535524 --log --job 113186786420` em `scratchpad/restore.log` (649 linhas, exit 0).
- `gh run view 37739535524 --log --job 113186786552` em `scratchpad/implantavel.log` (520 linhas, exit 0).
- `gh run download 37739535524 -n restore-7005a60cd70b30a4f455a96a64c4d7a3abb2819f` e `-n implantavel-...` em `scratchpad/art/` (exit 0).
- Varredura de segredo nos dois artefatos: `grep -rniE "postgres(ql)?://[^ ]*:[^@ ]+@|PASSWORD '|eyJ...|Bearer ..."` sem resultado.
- Teste de semântica de shell em `scratchpad/gh-step.sh`, `s2.sh`, `s3.sh` (ver "Tentativas de reprovar").

## Cenários positivos

Restore completo em 17.11 com todas as conferências do bloco, listadas acima, lidas no log e no artefato.

## Cenários negativos

No CI: destino sem `dc360_console` e dump sem `--extension=pg_trgm` reprovam com a mensagem esperada; servidor "sujo" (papel `dc360_*` ou banco da prova já existente) reprova antes de começar; `pg_dump` mais velho que o servidor reprova. Isolamento negativo (sem contexto, outro município, UPDATE e DELETE na trilha) afirmado e com efeito no log do servidor. As mutações que provam que as sondas mordem (desligar RLS, conceder UPDATE na trilha, BYPASSRLS no papel) foram feitas pelo qa e não refeitas.

## Tentativas de reprovar

1. Procurei exit code engolido no job e no script. `|| true` só aparece na coleta de `docker logs` e no `docker rm` do passo `always()` de limpeza, e no `kill` da API: nenhum em conferência. Não há `continue-on-error` no job `restore`. O script roda com `set -euo pipefail` e trap de ERR; toda conferência com `tee` ou está sob `pipefail` ou tem `|| falhar` e sentinela textual depois.
2. Conferi que o GitHub roda os passos com `bash --noprofile --norc -e -o pipefail` (está no log de cada passo) e reproduzi localmente os três padrões usados: grupo `{ false; echo ...; } 2>&1 | tee` sob `-e -o pipefail` sai 1 sem executar o resto; função que falha em `| tee` sob `set -euo pipefail` sai 1; `node -e "process.exit(3)" | tee || falhar` cai no `falhar`. Nenhum passa sem conferir.
3. Procurei conferência vazia que passasse por vacuidade: linhas exige total maior que 0; RLS exige `tabelas_de_negocio` maior que 0; `migracoes` comparado com o número de arquivos em disco; isolamento e API exigem a frase sentinela final, que só sai depois de todas as afirmações.
4. Procurei falso positivo do `migrar --conferir` sem `DATABASE_URL` (o CLI cai em PGlite efêmero): ali o banco vazio dá 47 pendentes e exit 1, então não há "Esquema em dia." falso; e o script sempre passa a URL explícita e faz `unset` de `DATABASE_URL` e `PG*` no começo.
5. Procurei vazamento de segredo: a senha do superusuário nasce no job e é mascarada (`::add-mask::`, aparece como `***` no log); as senhas de `dc360_setup`, `dc360_api` e o `JWT_SEGREDO` nascem no script, em memória, e vão a `psql` por `PGPASSWORD` de um comando, nunca em argv nem na saída; o trap de ERR imprime `$BASH_COMMAND`, que é o texto não expandido. Artefato varrido sem achado; redação roda antes do upload ("redigidos 33 arquivo(s)").
6. Procurei se o job deixava dump: `DUMP_DIR` é `mktemp -d` com 700, apagado no trap EXIT, e o script reprova se achar `*.dump` na saída. Nenhum no artefato.
7. Procurei se o job roda onde deveria: só em push com `[ci completo]`, `workflow_dispatch` ou `schedule`. Em pull_request fica pulado (achado 2).

## Achados

Nenhum bloqueia.

CORRIGE ANTES DE CRESCER

1. O roteiro não diz com todas as letras que serve só para restaurar em cluster próprio (onde há superusuário), e não para restaurar EM provedor gerenciado. `RESTORE-DO-BANCO.md` usa o superusuário `postgres` para `CREATE ROLE ... BYPASSRLS`, `createdb`, `DROP SCHEMA public CASCADE` e `GRANT dc360_app TO dc360_api`, e depende de `pg_trgm` criável no destino. Num gerenciado (Supabase 17.6) não há superusuário, o `pg_trgm` costuma morar no esquema `extensions` e não em `public` (então `--schema=public --extension=pg_trgm` levaria `CREATE EXTENSION ... WITH SCHEMA extensions` e o destino precisaria desse esquema), e um destino sem `pg_trgm` disponível não tem saída descrita (com `--exit-on-error` o restore para nos índices). A seção "O que não foi provado" cobre só "Origem Supabase" e "restore por cima da produção". Remédio: um parágrafo "Este roteiro não restaura em provedor gerenciado; isso é V2-F22-E03" e a linha de `pg_trgm` indisponível na tabela de erros. Não bloqueia porque o bloco desta etapa fixa origem e destino locais e manda F22 e F01-E15 para fora.
2. O job `restore` não roda em pull_request nem em push sem o marcador `[ci completo]`; `schedule` e `workflow_dispatch` só valem depois que o workflow chegar a master. Uma migração nova que quebre o restore (papel novo, extensão nova, grant fora do dump) pode chegar a master sem o job rodar, se o autor esquecer o marcador. Remédio sugerido: disparar também por `paths: dc360/db/migrations/**` em pull_request, ou tornar o job obrigatório no merge para master. É convenção de processo hoje, não portão.
3. Senha em linha de comando no roteiro, contra o que o próprio roteiro afirma ("Nenhuma senha vai em linha de comando que fique em histórico"): os passos 2 e 4 põem a cláusula de senha do papel em `psql -c` e o passo 2 exporta `DATABASE_URL` com usuário e senha na URL, que ficam no histórico do shell. O script `ensaiar-restore.sh` já faz certo (heredoc pela entrada padrão e `PGPASSWORD` por comando). Soma ao achado 1 do qa (a senha de `dc360_setup` nos passos 3 a 6 nunca é posta em `PGPASSWORD`). Para cluster descartável o dano é baixo; para o roteiro virar o de produção, não serve.

ANOTADO

4. O roteiro está atrás do próprio SHA: diz "a produção é 17.6 e o CI usa 16" e lista Postgres 17 e Linux como não provados, mas o job `restore` prova em 17.11 no Linux; diz que corrigir o CI e o README "não é desta etapa", e o `GRANT CREATE ON DATABASE` já está no job `implantavel`; não cita `dc360/scripts/ensaiar-restore.sh` e `dc360/scripts/restore/`, a versão executável do roteiro, e aponta para as sondas da pasta de evidência, que já divergem das cópias do script (mesmo achado 4 do qa).
5. `docs/roadmap-v2/29-operacao-do-ambiente.md` diz que o job `restore` leva 7 a 9 minutos; neste run levou 58 segundos. Só afeta a estimativa de custo de minutos.
6. O job `implantavel` usa senhas fixas (`postgres`, `setup`, `api`) e `JWT_SEGREDO` literal: é contêiner de serviço efêmero do CI, sem dado e sem rede externa, e é anterior a esta etapa. O job `restore` já usa senhas aleatórias; alinhar o `implantavel` quando ele for mexido.
7. O `npm ci` do job imprime "3 vulnerabilities (1 moderate, 2 critical)". Quem decide é o job `dependencias` pela política do CP-03 (success no run); não é desta dimensão nesta etapa, só registro para o gatekeeper cruzar.

## Não verificado

- Não rodei o restore em Postgres 17 eu mesmo: não há Docker nem PG17 nesta máquina; a prova em 17 é o run do CI, que li no log e no artefato.
- Não rodei mutação do script do CI (por exemplo, retirar o `--exit-on-error` ou o `GRANT CREATE ON DATABASE` e ver o job vermelho): exigiria push e minutos de CI. A prova de que as conferências mordem é a dos negativos embutidos no job e das mutações do qa em 18.3, mais o meu teste local da semântica de `-e -o pipefail`.
- Restore com origem ou destino em provedor gerenciado (Supabase): fora do escopo da etapa (F01-E15, F22-E03) e sem acesso; achado 1 é inferência pela documentação do provedor, não testada.
- Destino sem `pg_trgm` disponível (contrib ausente): não simulável aqui.
- macOS: não executado por ninguém.
- Segunda pessoa seguindo o roteiro do zero: validação humana pendente da própria etapa.
- Não reli o histórico de runs anteriores para ver quando o `implantavel` passou a ficar verde; conferi só o run deste SHA.

## Risco residual

O CA-08 está provado para o caso que a etapa define: esquema atual, Postgres 17, Linux limpo, cluster próprio, com isolamento, trilha append-only e API conferidos na cópia. O risco que sobra é o primeiro restore real: em provedor gerenciado, sem superusuário e com `pg_trgm` fora de `public`, o roteiro atual não se aplica direto, e isso não está escrito nele (achado 1). Enquanto o job `restore` depender de marcador no commit (achado 2), uma migração pode quebrar o restore sem ninguém ver até a rodada semanal.

## Motivo do humano

A Definition of Done pede o roteiro repetido por uma segunda pessoa (ou Rafael noutra máquina) do zero. Isso mede se o documento é seguível por quem não o escreveu, o que nenhum agente com o repositório já montado prova. Convém corrigir antes os achados 1 e 2 do qa e o achado 3 daqui (senhas nos passos), para a repetição humana não travar no primeiro comando.
