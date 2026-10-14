---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E25
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Saídas em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/qa-infra/` (abreviado `qa-infra/`). Não rodei restore local (instrução do gatekeeper). A prova de execução é o log do job do CI que eu li inteiro: `gh run view 38445527075 --log --job 115462783875` em `qa-infra/70-ci-restore-log.txt` (650 linhas).

| Critério | Resultado | Prova no log do CI (Linux, `postgres:17` em contêiner, cliente 17.11) |
| --- | --- | --- |
| Origem como o job `implantavel` (papéis `dc360_setup` e `dc360_api`), `migrar`, `--semear` | PASS | "migracoes em disco: 48"; "aplicando 001 ... 048_dono_do_token_diz_se_a_conta_esta_ativa.sql"; "Esquema em dia."; "Semeado com os dois municípios fictícios." |
| A 048 entra | PASS | listada entre as aplicadas; "schema_migracoes tem as 48 migracoes (as impressoes batem no diff de estrutura)"; `ls dc360/db/migrations` = 48 arquivos |
| `pg_dump --format=custom --schema=public --extension=pg_trgm` | PASS | "o dump leva a extensao pg_trgm so com --extension (o sumario nao tem dado nem segredo)" |
| Destino com papéis antes (inclusive `dc360_console`), `pg_restore --exit-on-error` sem erro | PASS | "pg_restore --exit-on-error terminou sem erro" |
| Linhas e estrutura idênticas, com comparação não vazia | PASS | "linhas: identico (37 linhas conferidas)"; "estrutura: identico (810 linhas conferidas)"; "o restaurado tem 107 linhas no total (comparacao nao vazia)" |
| RLS ativada E forçada nas 35 tabelas, na origem e no restaurado; dono não é a aplicação; trilha sem policy de UPDATE e DELETE | PASS | linhas "origem:" e "restaurado:" de "toda tabela de negocio tem RLS ativada E forcada", "RLS conferida em 35 tabelas de negocio (nao vazio)", "a trilha nao tem policy de UPDATE nem DELETE" |
| Isolamento no banco restaurado (sem contexto 0 linhas; com contexto de A nada de B; escrita cruzada nada; trilha append-only) | PASS | "ISOLAMENTO: TODAS AS AFIRMACOES PASSARAM" nos dois bancos e "o comportamento de isolamento narrado e o mesmo na origem e na copia" |
| `migrar --conferir` na cópia | PASS | "Esquema em dia." |
| API apontada para a cópia (`/saude` 200, login, lista, detalhe, 404 de outro município, busca com `pg_trgm`) | PASS | linhas 569-581: `/saude` 200 `banco ok`; login 200; `GET /ocorrencias` 200, 6 itens; detalhe 200; ocorrência de Vale Fundo com token de Serra Alta 404; `/busca?q=acacias` 200 |
| Negativo: sem `dc360_console` o restore para com o erro registrado | PASS | "negativo: o restore sem o papel dc360_console reprova" e "a mensagem cita o papel dc360_console" |
| Negativo: sem `pg_trgm` o destino diz que o índice não existe | PASS | "o restore de um dump sem --extension=pg_trgm reprova" e "a mensagem cita gin_trgm_ops" |
| Nenhum dump arquivado | PASS | "nenhum dump na pasta de saida (o dump fica fora e e apagado na saida)"; `trap limpar EXIT` em `scripts/ensaiar-restore.sh` |
| O roteiro `RESTORE-DO-BANCO.md` confere com o que o job fez | PASS com ressalva | Mesmos comandos e mesma ordem (comparação abaixo); números e versões do texto estão velhos (achado 1) |

## Evidência

`70-ci-restore-log.txt`; leitura de `dc360/docs/RESTORE-DO-BANCO.md` (292 linhas) e de `dc360/scripts/ensaiar-restore.sh` (359 linhas, `bash -n` sem erro de sintaxe, `qa-infra`); `diff` entre as sondas da evidência (`docs/evidencias-v2/G00/V2-F00-E25/sondas/`) e as cópias do CI (`dc360/scripts/restore/`): `linhas.sql`, `isolamento.sql` e `api-contra-a-copia.mjs` iguais salvo o cabeçalho de "CÓPIA"; `estrutura.sql` com as duas diferenças declaradas (ordem da ACL e parênteses das restrições) para o diff do CI ser exato.

Comparação roteiro x script (linha a linha dos comandos): dump `--format=custom --schema=public --extension=pg_trgm` (roteiro passo 3, script 175-176); restore como `dc360_setup` com `--exit-on-error` (passo 5, script 216); `DROP SCHEMA public CASCADE` no destino quando o dump recria o `public` (passo 4, script 190-212); `CREATE ROLE dc360_console NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT` (passo 4, script 234); os três GRANTs depois do restore (passo 6, script 257-259: `dc360_app` a `dc360_api` e a `dc360_setup`, `USAGE` no `public`); `GRANT CREATE ON DATABASE` na origem (passo 2, script 152-158). Batem.

## Cenários positivos

O job inteiro: 35 linhas "OK", "TODAS AS CONFERENCIAS PASSARAM" e nenhuma linha "FALHA" no log. O passo roda com `bash -e -o pipefail`, então o `| tee` não engole o código de saída.

## Cenários negativos

Dois negativos do próprio script no CI (sem papel, sem extensão), ambos "reprova" com a mensagem esperada; escrita cruzada de A em B ("nao alcanca nada") e UPDATE e DELETE na trilha ("recusados por permissao"), tentados como `dc360_app`; a comparação é recusada se ficar vazia (107 linhas, 35 tabelas). Não rodei mutação no script porque ele só roda com dois servidores PostgreSQL (restrição do gatekeeper); fica em "Não verificado".

## Tentativas de reprovar

1. Procurei verde vazio: o script exige contagens não vazias (107 linhas; 35 tabelas) e compara com o número de migrações do disco (48), não com um literal.
2. Procurei engolimento de código de saída no job: `set -euo pipefail` no script, `trap ... ERR`, `falhar` com `exit 1`; os três `|| true` do script são `kill` da API na limpeza e `tail` do log da API antes de `falhar`.
3. Procurei o papel de aplicação com poder demais no destino: o log afirma que não é superusuário, não tem `BYPASSRLS` e não é dono de nada, nos dois bancos.
4. Procurei corrida do restore sobre um banco que existe: o roteiro manda criar banco novo em cluster separado e o script verifica "os dois servidores estao limpos (sem papel dc360_* e sem os bancos da prova)" antes de começar.
5. Procurei texto que ainda diga o que o CI já refutou (achado 1) e promessa sem implementação: `docs/COLOCAR-DE-PE.md:367` e `docs/INDISPONIBILIDADE.md:110` apontam para o roteiro (existem); o aviso "corrigir o CI e o README não é desta etapa" do roteiro está velho: o `GRANT CREATE ON DATABASE` já está em `verificar.yml:630` e em `README.md:1223`.
6. Segredo no log: senhas geradas por rodada (`randomBytes`), `SENHA_DO_JOB: ***` mascarado com `::add-mask::`; procurei "password" e "senha" no log inteiro e só aparecem os nomes das variáveis.

## Achados

1. **Corrige antes de crescer (documental).** `dc360/docs/RESTORE-DO-BANCO.md` descreve a prova local de 2026-10-07 e não foi atualizado para o que o CI prova hoje: título e passos dizem "47 migrações" (`:1`, `:19`, `:279`; o CI aplicou 48; também `COLOCAR-DE-PE.md:367`); diz que Postgres 17 e Linux "não foram provados" (a lista "Não provado"), enquanto o job "Restore do banco, Postgres 17 (CA-08)" os prova em 17.11 no Ubuntu; não cita `scripts/ensaiar-restore.sh` nem o job, que são a forma repetível do mesmo roteiro; e o passo 2 mostra "Aplicadas: ... 047". Quem seguir o texto vê 48 e acha que errou.
2. Anotado: o roteiro diz "nenhuma senha vai em linha de comando", mas os exemplos trazem `CREATE ROLE ... PASSWORD '...'` e `DATABASE_URL=postgres://dc360_setup:...@` em linha de comando (placeholders de cluster descartável). O script do CI usa variável de ambiente por comando.
3. Anotado: nenhuma pessoa além do implementador seguiu o texto manual do zero; o CI executa o script, não o Markdown.

## Não verificado

- Execução do restore (proibida aqui): nem o script, nem o roteiro manual em máquina minha, nem mutação do script. A evidência é o log do CI (Linux, PG 17.11), mais a leitura.
- Segunda pessoa seguindo `RESTORE-DO-BANCO.md` do zero.
- Windows e macOS no PG 17 (a prova local do implementador foi no PG 18.3, e o CI é Linux).
- Origem Supabase (papéis `anon`, `service_role` etc.), fotos e assinaturas, PITR, RPO e RTO: fora da etapa.
- Tempo de restore com volume real (a semente é sintética).

## Risco residual

O roteiro manual só foi executado pelo autor; se o texto e o script divergirem de novo, só o script é vigiado (job `restore` com `[ci completo]` ou semanal). Backup sem restore recorrente é backup não provado: o roteiro pede repetir a cada migração que mexa em papel, policy, grant ou extensão, e nada o força.

## Motivo do humano

Não aplicável (a segunda pessoa humana é substituída pela emenda D-30; a revisão externa fica com a F22).
