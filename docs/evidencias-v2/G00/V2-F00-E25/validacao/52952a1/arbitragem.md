---
validador: arbitragem (arquiteto-software)
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
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Conflito arbitrado (seção 7 de `28`): `qa.md` dá FAIL (o roteiro `dc360/docs/RESTORE-DO-BANCO.md`, seguido à risca, não chega ao restore); `banco-de-dados.md` e `engenharia-entrega.md` dão PASS. Os fatos não estão em disputa: o banco reproduziu os mesmos dois pontos por execução (seu achado 1, `28P01` no passo 3; seu achado 2, `dist` velho no passo 6) e os classificou como "corrige antes de crescer". A disputa é só se isso reprova a etapa.

1. **O restore está provado?** Sim, e ninguém contesta: job "Restore do banco, Postgres 17 (CA-08)" do run 38618369218, 27 conferências, 50 migrações, isolamento, trilha append-only e API contra a cópia; e o banco o refez no macOS com cliente 17.6. Essa metade do objetivo e da DoD está cumprida.
2. **O "roteiro mínimo" é critério?** Sim, por três textos, nenhum deles interpretação minha:
   - Objetivo da etapa: "provar que um backup ... restaura ... **e deixar um roteiro mínimo que outra pessoa repete**".
   - DoD: "restore provado em máquina limpa ...; **roteiro repetido por segunda pessoa**; item 'restore' do G00 marcado".
   - Item "Restore provado" do G00 (`docs/roadmap-v2/03-fase-00-estabilizacao.md`), com a EMENDA de 2026-10-07 (D-30) que substituiu a segunda pessoa: "independência de ambiente provada por CI Linux com Postgres 17 e artefato arquivado, **execução reproduzível do roteiro e leitura a frio por agente em clone limpo**".
   A emenda não dispensou o roteiro: trocou a segunda pessoa por uma leitura a frio por agente e exigiu execução reproduzível DO ROTEIRO. O job do CI não cumpre essa parte, porque roda `dc360/scripts/ensaiar-restore.sh`, que diverge do documento exatamente nos dois pontos em disputa: passa `PGPASSWORD` por papel (`ensaiar-restore.sh:93`, `:175-177`, `:216`) e recusa rodar sem o build (`:39`, `:140`). Logo, a frase do documento "Provado pelo CI ... o mesmo roteiro" é falsa nesses dois pontos, e a leitura a frio por agente é a única prova do documento. Nesta rodada houve três leituras a frio por agente (QA, banco e eu), e as três esbarram no mesmo lugar.
3. **O roteiro, seguido à risca, se repete?** Não (reproduzido por mim, abaixo):
   - Passo 3: o passo 0 diz que "todos os comandos abaixo usam `PGUSER=postgres` e a senha em `PGPASSWORD`" (a do `postgres`); o passo 2 cria `dc360_setup` com `PASSWORD '...'`; o passo 3 conecta `-U dc360_setup` sem trocar a senha. Em cluster `scram-sha-256` (o que o passo 1 manda criar), a autenticação falha com `28P01` nas duas leituras possíveis do `'...'` (senha nova ou o literal `...`). O mesmo vale para os dois `psql -U dc360_setup` do passo 4, o `pg_restore` do passo 5 e os comandos do passo 6. O roteiro só funciona se o leitor adivinhar que deve repetir a senha do `postgres` em todos os papéis, o que ele não diz.
   - Passo 6: `node apps/api/dist/index.js`, e nenhum passo manda compilar. `dist/` é ignorado pelo git (`dc360/.gitignore:2`); num clone limpo do SHA, `MODULE_NOT_FOUND`. Numa máquina de desenvolvimento roda o `dist` que houver: o desta árvore é de 2026-09-15, com 12 commits em `apps/api/src` depois dele até `52952a1`, e o QA mostrou que ele passa na sonda inteira, uma prova falsa de "a API atual sobe contra a cópia", que é critério da DoD.
   - Passo 6, conferência: os `-f "$f.sql"` e `-f isolamento.sql` são relativos a `dc360/` (o passo 2 manda `cd dc360`), e os arquivos estão em `docs/evidencias-v2/G00/V2-F00-E25/sondas/`. A sonda da API exige o id da ocorrência de Vale Fundo como segundo argumento (`api-contra-a-copia.mjs:40`), que o roteiro não informa.
4. **As rodadas 1 e 2 anotaram sem bloquear: houve mudança de fato ou só de severidade?** O texto dos passos 3 a 6 não mudou desde a rodada 1 (`git diff 7005a60..52952a1 -- dc360/docs/RESTORE-DO-BANCO.md` só toca a contagem de migrações, a seção "O que foi provado" e "Fora do Windows"). O que mudou é a PROVA: a rodada 1 registrou "senha de `dc360_setup` ambígua" e "faltam o build da API e o id do município B" por leitura, como ambiguidade; a rodada 3 tem a falha reproduzida por execução, três vezes, com código de erro, e a prova falsa do `dist` velho, que nenhuma rodada anterior tinha. A política exige "reprodução concreta de um defeito que viola critério da etapa" para FAIL: as rodadas 1 e 2 não a tinham, a 3 tem. Além disso, os dois pontos atravessaram duas correções sem conserto, e o "corrigir antes de crescer" já não segura: a etapa é de risco alto e o documento é o que alguém vai seguir num dia de incidente. É mudança de prova, não só de severidade, e a reclassificação é consequência dela.
5. **"São correções de texto" (banco e engenharia).** Concordo que o conserto é de texto e barato. Isso mede o custo do conserto, não a gravidade do defeito: o entregável É um texto, e o critério é que ele se repita.

Nenhuma decisão registrada (seção 9, premissas da E25, (a) a (f); seção 11; `pendencias-humanas.md`, H22) aceita esses pontos.

## Evidência

Saídas em `$SP/val/arbitragem/E25/`.

- `00-cluster.txt`: Postgres 17.10 descartável (binários do gatekeeper), `initdb -U postgres --pwfile=<arquivo> -A scram-sha-256 -E UTF8 --locale=C`, como o passo 1; porta 55531; parado e apagado no fim; `lsof -iTCP:55531 -sTCP:LISTEN` vazio.
- `01-passos-0-2-3.txt` (script `passos.cjs`, pacote `pg` no lugar do `psql` e do `pg_dump`, mesma autenticação por senha): `CREATE DATABASE` e `CREATE ROLE dc360_setup ... PASSWORD '...'` como `postgres` com o `PGPASSWORD` do passo 0: OK. Conexão como `dc360_setup` com o `PGPASSWORD` do passo 0 (o que o `pg_dump` do passo 3 faria): `ERRO 28P01 password authentication failed for user "dc360_setup_..."`, nas duas leituras do `'...'`. Controle positivo: com a senha do próprio papel, OK. Senhas sorteadas, nunca impressas, arquivo apagado.
- `02-clone-limpo.txt`: `git worktree add` de `52952a1` no scratchpad (sem `node_modules` nem link), `git ls-files apps/api/dist` = 0, `ls apps/api/dist` inexistente, o comando do passo 6 dá `MODULE_NOT_FOUND` e código 1; `grep` de build no roteiro: nenhuma ocorrência; os três `.sql` não existem em `dc360/`. Worktree removido com `git worktree remove --force`; `git worktree list` sem ele.
- `03-dist-velho.txt`: `dc360/apps/api/dist/index.js` de 2026-09-15; 12 commits em `dc360/apps/api/src` depois disso até `52952a1`.
- Não tenho `pg_dump` nesta máquina; o restore em si não foi refeito por mim (está provado pelo CI e pelo banco, sem disputa).

## Cenários positivos

- Controle: `dc360_setup` autentica com a própria senha (o defeito é do roteiro, não do cluster).
- Restore, isolamento e API contra a cópia: aceitos do job do CI e do relatório do banco, não disputados.

## Cenários negativos

- Passo 3 como escrito: `28P01`.
- Passo 6 como escrito em clone limpo: `MODULE_NOT_FOUND`.

## Tentativas de reprovar

- Tentei derrubar o FAIL do QA: procurei no roteiro uma instrução de senha por papel, de build ou de caminho dos `.sql`; não há. Procurei se a emenda D-30 dispensava o roteiro; ela o mantém ("execução reproduzível do roteiro e leitura a frio por agente em clone limpo"). Procurei se o CI rodava o documento; roda o script, que diverge nos pontos em disputa.
- Testei a leitura mais benevolente do `'...'` (o literal `...`, igual nos papéis e na `DATABASE_URL`): também falha no passo 3, porque o `PGPASSWORD` é o do `postgres`.

## Achados

1. **bloqueia.** Passos 3 a 6 de `dc360/docs/RESTORE-DO-BANCO.md` autenticam papéis com a senha errada (reproduzido).
2. **bloqueia.** Passo 6 sem build: falha em clone limpo e dá prova falsa com `dist` velho (reproduzido).
3. **corrige antes de crescer.** Caminho dos `.sql` relativo à pasta errada e id de Vale Fundo ausente na sonda.
4. **anotado.** A frase "Provado pelo CI ... o mesmo roteiro" deve dizer que o CI roda `scripts/ensaiar-restore.sh`, e a de "com a árvore de hoje (50 migrações) o job ainda não rodou" envelheceu (run 38618369218 rodou com as 50).

Conserto mínimo (não implementado), só documentação, com dono E25: (a) `PGPASSWORD` explícito por comando nos passos 3 a 6, como `ensaiar-restore.sh:93`, com uma senha por papel guardada em arquivo na pasta temporária; (b) `npm run build --workspace @dc360/shared --workspace @dc360/db --workspace @dc360/api` antes do passo 6, com aviso de que `dist` velho prova código velho; (c) caminhos dos `.sql` a partir de `dc360/` (`../docs/evidencias-v2/G00/V2-F00-E25/sondas/...`) e o id `22222222-2222-4222-8222-0000000000c1` no comando da sonda; (d) a frase sobre o CI corrigida. Para fechar de verdade a "execução reproduzível do roteiro", a validação seguinte deve seguir o documento corrigido a frio, num clone limpo, até o fim; alternativa mais forte: o job do CI passar a executar os blocos do próprio documento, para que roteiro e script não divirjam outra vez.

## Não verificado

- O restore local de ponta a ponta (sem `pg_dump`, `pg_restore` e `psql` nesta máquina); não está em disputa.
- Windows e Linux seguindo o documento.

## Risco residual

O restore como capacidade está provado. O documento que alguém seguirá num incidente falha no passo 3 para quem não adivinhar a senha e, no passo da API, quebra em máquina limpa ou prova o código errado.

## Motivo do humano

Nenhum para esta arbitragem: os fatos e o critério são verificáveis por execução e leitura. A revisão humana independente do roteiro continua com o CP-07 e a F22, pela emenda D-30.
