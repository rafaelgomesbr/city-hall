---
validador: qa (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E25
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [DB, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Objetivo da etapa: "provar que um backup do esquema atual restaura num banco novo com o isolamento intacto, E deixar um roteiro mínimo que outra pessoa repete". Pedido desta rodada: seguir `dc360/docs/RESTORE-DO-BANCO.md` à risca no Mac e dizer se ele leva ao restore provado.

| Critério | Prova | Resultado |
| --- | --- | --- |
| Restore sem erro com `--exit-on-error`, linhas e hashes iguais, 35 tabelas com RLS ativada e forçada, `pg_trgm`, isolamento no restaurado, trilha append-only, API contra a cópia (`/saude` 200, login, leitura, 404 do outro município) | CI run 38618369218, job "Restore do banco, Postgres 17 (CA-08)" (id 116039196518), Linux, `pg_dump` 17.11 e dois servidores 17.11: "migracoes em disco: 50", 27 linhas "OK" (restore sem erro, linhas idênticas, estrutura idêntica em 813 linhas, 50 impressões de `schema_migracoes`, RLS em 35 tabelas, isolamento afirmado nos dois lados, `migrar --conferir` na cópia, `/saude` 200, login, lista, detalhe, 404 de Vale Fundo, busca com `pg_trgm`, nenhum dump na saída) (`CI-116039196518.log`) | PASS (prova do CI) |
| Negativos: sem `dc360_console` o restore para; sem `pg_trgm` o índice não existe | mesmo job: "negativo: o restore sem o papel dc360_console reprova", "a mensagem cita o papel dc360_console", "negativo: o restore de um dump sem --extension=pg_trgm reprova", "a mensagem cita gin_trgm_ops" | PASS (CI) |
| As migrações aplicam em Postgres 17 | local, Mac, Postgres 17.10 descartável: `npm run migrar` aplica as 50, `--conferir` "Esquema em dia.", `--semear` "Semeado com os dois municípios fictícios", `schema_migracoes` com 50 linhas (`E25-02`) | PASS (E2 local) |
| O roteiro, seguido à risca, leva ao restore provado | Não leva. Ver a tabela abaixo e os achados 1 a 4 | FAIL |
| Regressão `test:isolamento` | `npm test` (`R-01`): banco 345 passam e 3 pulados por ambiente | PASS |
| Documentação da Parte 6 e de `INDISPONIBILIDADE.md` | `RESTORE-DO-BANCO.md` se declara substituto da Parte 6; não reconferi `INDISPONIBILIDADE.md` | não verificado |

O roteiro seguido à risca no Mac, passo a passo:

| Passo | O que aconteceu | Saída |
| --- | --- | --- |
| 0 | `pg_dump`, `pg_restore`, `psql` e `createdb` AUSENTES nesta máquina (só `initdb`, `pg_ctl` e `postgres` 17.10 do pacote descartável; sem Homebrew). O roteiro para aqui no Mac sem instalar o cliente | `E25-00-passo0.txt` |
| 1 | `initdb` com `--pwfile` e `scram-sha-256`, e o `pg_ctl` exatamente como escrito: funcionam | `E25-00-passo0.txt` |
| 2 | papéis e `GRANT CREATE ON DATABASE` (com `node` e o pacote `pg` no lugar do `psql`), `migrar`, `--conferir`, `--semear` e o `GRANT dc360_app TO dc360_api`: funcionam | `E25-01`, `E25-02` |
| 3 | `pg_dump` ausente. A autenticação que ele faria (`-U dc360_setup`, com o `PGPASSWORD` do passo 0, que é a senha do `postgres`) falha: `28P01 password authentication failed for user "dc360_setup"`; com a senha do próprio `dc360_setup` entra | `E25-03` |
| 4 e 5 | não executáveis aqui (sem `psql`, `createdb` e `pg_restore`) | |
| 6, API | `node apps/api/dist/index.js`, como escrito: nesta máquina o `dist` é de 15/09/2026 (um mês antes do SHA; `apps/api/src/servidor.ts`, `config.ts`, `saida/pacote.ts` e outros são mais novos que ele), e mesmo assim responde `/saude` 200 com `banco: ok` e passa em todas as conferências da sonda | `E25-04`, `E25-05` |
| 6, sonda | `node sondas/api-contra-a-copia.mjs http://127.0.0.1:3355`, que é tudo o que o roteiro diz: "FALHA ... responde 404: status 422" e código 1, porque a sonda espera o id da ocorrência de Vale Fundo como segundo argumento e o roteiro não diz qual; com o id lido da semente, código 0 | `E25-05` |
| 7 | servidor parado, pasta apagada | `E25-06` |

Defeitos das rodadas 1 e 2, reexecutados:

- Rodada 1, "senha de `dc360_setup` ambígua (passos 3 a 6) e senhas em linha de comando (passos 2 e 4)": AINDA MORDE (passo 3 acima; os passos 2 e 4 continuam com `PASSWORD '...'` dentro do `-c`, contra a regra do próprio passo 0, "nenhuma senha vai em linha de comando").
- Rodada 1, "faltam o build da API e o id do município B para a sonda": AINDA MORDE (passo 6 acima).
- Rodada 1, "o roteiro não diz que só vale para cluster próprio, e não para Supabase": parcialmente tratado (seção "Origem Supabase" em "Não provado").
- Rodada 1, "o `restore` só roda com `[ci completo]`": não reconferido no workflow; o run 38618369218 é `[ci completo]` e rodou o job.
- Rodada 2, "`RESTORE-DO-BANCO.md` ainda diz 47 migrações e Postgres 17 não provado": CONSERTADO, com marcador conferido pela máquina. Resíduo: "com a árvore de hoje (50 migrações) o job ainda não rodou" envelheceu, porque o run 38618369218 rodou com as 50.
- Validadores de banco e de engenharia desta rodada anotaram os mesmos dois pontos (senha no `pg_dump`, build ausente): reproduzidos aqui por execução.

## Evidência

Saídas em `$SP/val/qa/lote4/`: `E25-00-passo0.txt`, `E25-01-passo2-papeis.txt`, `E25-02-passo2-migrar.txt`, `E25-03-passo3-autenticacao.txt`, `E25-04-passo6-api-dist-velho.txt`, `E25-05-sonda-api-dist-velho.txt`, `E25-06-limpeza.txt`, `CI-116039196518.log`, `R-01-npm-test.txt`. Script substituto do `psql`: `$SP/val/qa/lote4/scripts/sql.mjs`. Senhas geradas na rodada, nunca impressas (as saídas trazem `<senha-setup>` e `<senha-api>`).

Postgres descartável: binários 17.10 de `$SP/pg/x/package/native`, cluster em `$SP/pg/qa-e25` na porta 55510, parado e apagado no fim; API na 3355, PID guardado e encerrado; `lsof` sem nada meu escutando depois. `git ls-files apps/api/dist` dá 0 arquivos: num clone novo o `dist` não existe.

## Cenários positivos

- O CI prova o restore das 50 migrações em Postgres 17.11 com isolamento, trilha append-only e API contra a cópia, com o script `scripts/ensaiar-restore.sh`.
- As 50 migrações aplicam do zero num Postgres 17.10 local, com a semente.

## Cenários negativos

- Os dois negativos da etapa (sem `dc360_console`, sem `pg_trgm`) reprovam no CI com a mensagem esperada.
- No roteiro: a senha do superusuário não autentica o `dc360_setup`; a sonda sem o id de Vale Fundo reprova.

## Tentativas de reprovar

- Segui o documento, não o script do CI. O script do CI (`scripts/ensaiar-restore.sh:93`, `:175-177`, `:216`) passa `PGPASSWORD` por papel e exige o build (`:39`, `:140`); o documento não faz nenhuma das duas coisas. A prova do CI, portanto, não prova o documento.
- Rodei o passo 6 com o `dist` que existe nesta máquina para ver se o roteiro distingue código velho de código atual: não distingue; um build de 15/09 passa em tudo.

## Achados

1. **bloqueia.** O passo 6 manda rodar `node apps/api/dist/index.js` e nenhum passo manda compilar a API (nem `npm run build:shared`). `dist/` é ignorado pelo git (`dc360/.gitignore:2`, `git ls-files apps/api/dist` vazio): num clone novo, que é a "máquina limpa" do CA-08, o comando não acha o arquivo. Numa máquina de desenvolvimento ele roda o que houver: aqui, um build de 2026-09-15 respondeu `/saude` 200 e passou na sonda inteira contra um banco de 50 migrações (`E25-04`, `E25-05`), uma prova falsa de "a API atual sobe contra a cópia", que é critério da DoD. Conserto: `npm run build --workspace @dc360/shared --workspace @dc360/db --workspace @dc360/api` antes do passo 6, como o script do CI exige.
2. **bloqueia.** Senhas: o passo 0 põe a senha do `postgres` em `PGPASSWORD` e diz que todos os comandos a usam; os passos 2 e 4 criam `dc360_setup` e `dc360_api` com `PASSWORD '...'`; os passos 3, 4, 5 e 6 conectam como `dc360_setup` ou `dc360_api` sem trocar o `PGPASSWORD`. Com qualquer senha diferente da do `postgres` no lugar de `'...'`, o `pg_dump` do passo 3 falha na autenticação (`E25-03`, `28P01`). O documento só funciona se o leitor adivinhar que deve repetir a mesma senha em todos os papéis, o que ele não diz. Conserto: `PGPASSWORD` por comando, como `ensaiar-restore.sh:93`.
3. **corrige antes de crescer.** A sonda `api-contra-a-copia.mjs` exige o id de uma ocorrência de Vale Fundo como segundo argumento; o roteiro não o dá e, sem ele, a sonda reprova com 422 (`E25-05`). Conserto: escrever o id da semente (`22222222-2222-4222-8222-0000000000c1`) no comando.
4. **corrige antes de crescer.** O passo 2 manda `cd dc360`, e o passo 6 roda `psql ... -f "$f.sql"` e `-f isolamento.sql` com caminho relativo, mas os arquivos estão em `docs/evidencias-v2/G00/V2-F00-E25/sondas/`, fora de `dc360/`: seguido à risca, o `psql` não acha o arquivo.
5. **anotado.** O Mac não tem `pg_dump`, `pg_restore`, `psql` nem `createdb` sem instalar o cliente; a seção "Fora do Windows" diz `brew install postgresql@17`, e esta máquina não tem Homebrew. Não é defeito do roteiro, é o pré-requisito dele; registrado porque impediu o restore local nesta validação.
6. **anotado.** "com a árvore de hoje (50 migrações) o job ainda não rodou" ficou velho: o run 38618369218 rodou o job com as 50.

Veredito: o restore em si está provado pelo CI, com o isolamento intacto; o que reprova é a segunda metade do objetivo, o roteiro que outra pessoa repete. Seguido à risca ele não chega ao restore (passo 3) e, no passo da API, ou quebra (clone novo) ou prova a coisa errada (máquina com build velho). As rodadas 1 e 2 anotaram os achados 1 e 2 como "corrigir antes de crescer" e eles continuam iguais na terceira; a D-30 trocou a "segunda pessoa seguindo o roteiro" pelo job do CI, que roda um script e não o documento, então ninguém prova o documento. Confiança média porque as rodadas anteriores julgaram estes mesmos pontos não bloqueantes.

## Não verificado

- O restore local nesta máquina (passos 3 a 5): sem `pg_dump`, `pg_restore` e `psql`. Usei o job do CI como prova do restore.
- `dc360/docs/INDISPONIBILIDADE.md` e a Parte 6 de `COLOCAR-DE-PE.md` (nota que aponta para o roteiro) não foram reconferidos nesta rodada.
- Windows e Linux seguindo o documento (não o script).
- O workflow só roda o job com `[ci completo]` (achado da rodada 1): não reconferido.

## Risco residual

Alto no uso real: o dia em que alguém precisar restaurar seguindo este documento é um dia de incidente, e o documento hoje falha no passo 3 para quem não adivinhar a senha e não diz para compilar a API. O restore como capacidade está provado pelo CI.

## Motivo do humano

O CA-08 pede uma segunda pessoa seguindo o roteiro do zero; a D-30 substituiu isso pelo job do CI, mas o job não lê o documento. Só uma pessoa seguindo o texto, depois do conserto dos achados 1 a 4, prova que ele é repetível.
