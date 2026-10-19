---
validador: banco-de-dados (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E25
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [DB, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---

## Critérios verificados

Dimensão banco de dados da E25, sobre `bb0f654` (o HEAD `0290af5` só difere em `STATUS.md` e `ESTADO-ATUAL.md`; `dc360/docs/RESTORE-DO-BANCO.md` do HEAD é byte a byte o de `bb0f654`, conferido com `diff`).

1. O roteiro `dc360/docs/RESTORE-DO-BANCO.md`, seguido COMO ESCRITO, a frio, num clone limpo e em clusters novos, chega ao fim no `zsh` e no `bash`: PASS.
2. `pg_restore --exit-on-error` sem erro, como `dc360_setup`, em PostgreSQL 17 (versão maior de produção): PASS.
3. Linhas por tabela e estrutura inteira iguais entre origem e cópia; hashes de `schema_migracoes` iguais: PASS.
4. Papéis e grants depois do restore: papel de aplicação sem superusuário, sem `BYPASSRLS` e sem ser dono de nada: PASS.
5. RLS ativada E forçada nas 35 tabelas de negócio depois do restore: PASS.
6. Isolamento entre municípios no banco restaurado (sem contexto, zero linhas; contexto de A, nada de B; escrita cruzada sem alcance) e trilha append-only (UPDATE e DELETE recusados): PASS.
7. `npm run migrar -- --conferir` na cópia: "Esquema em dia.": PASS.
8. API apontada para a cópia com o login restrito: `/saude` 200 com `banco: ok`, login, leitura, 404 de outro município, busca com `pg_trgm`: PASS.
9. Testes negativos da etapa (sem `dc360_console`, sem `pg_trgm`, sem derrubar o `public`) param com o erro que o documento promete: PASS.
10. As conferências do roteiro mordem (mutação no banco restaurado faz pelo menos uma delas reprovar): PASS.
11. Coerência entre o roteiro e `dc360/scripts/ensaiar-restore.sh`: PASS, com uma diferença anotada (achado A1).

## Evidência

Toda saída está em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/banco-de-dados-E05-E12-E25/` (abreviado abaixo como `<val>`). Nada disso foi arquivado no repositório (a saída do `initdb` traz o nome de usuário da máquina).

- Binários: zip oficial da EDB `postgresql-17.6-1-osx-binaries.zip`, baixado por mim agora, SHA-256 `5afb85f5d764176bb00a527cfc5dd9127b9f8efaa33f5a9afbedbf6ceb985fcc` (igual ao que o documento cita); `initdb`, `pg_ctl`, `psql`, `createdb`, `pg_dump`, `pg_restore` todos 17.6. Servidor dos clusters: `SHOW server_version` = 17.6.
- Clones: dois `git clone` locais em `<val>/clone-zsh` e `<val>/clone-bash`, `checkout` de `bb0f654` DENTRO de cada clone (a árvore principal não foi tocada), sem `node_modules` nem `dist` no início (conferido com `ls`).
- Extração dos blocos: `<val>/ferramentas/extrair.py` pega os 14 blocos ```` ```bash ```` do documento do clone, em ordem, e só troca `PGBIN`, `TMP` e a linha das três portas (2 blocos alterados; 0 caracteres `#` nos blocos). Acrescenta só `echo "@@@ INICIO/FIM DO BLOCO nn"` entre blocos.
- Execução 1, `zsh -f -i` (zsh puro, interativo, sem `interactivecomments`, blocos pela entrada padrão), `setopt errexit` no topo, `env -i` com só `HOME`, `TERM` e um `PATH` mínimo mais o do Node: código 0, os 14 blocos com marcador de fim, `@@@ FLUXO COMPLETO`, 15 s de relógio. Saída: `<val>/execucao-zsh/saida.txt`.
- Execução 2, `/bin/bash` 3.2.57 do macOS como arquivo de script com `set -e`, `env -i`: código 0, 14 de 14 blocos, mesmas linhas esperadas. Saída: `<val>/execucao-bash/saida-script.txt`.
- Execução 3, `/bin/bash --norc --noprofile -i` com os blocos pela entrada padrão (sem `set -e`): 14 de 14 blocos, mesmas linhas esperadas; NÃO se perdeu no meio (diferente do que o implementador relatou). Saída: `<val>/execucao-bash/saida-entrada.txt`.
- Execução 4, para sondar (`<val>/execucao-sonda/preparar.sh`): os blocos 00 a 12 do documento em `bash` com `set -e` (código 0, "TODAS AS CONFERENCIAS PASSARAM"), deixando os servidores (portas 55721 e 55722) e a API (porta 3373) de pé para as consultas, as mutações e os negativos abaixo; depois limpo à mão.
- Consultas no restaurado: `<val>/execucao-sonda/01-consultas-do-restaurado.txt`. Mutações: `<val>/execucao-sonda/02-mutacoes-mordem.txt`. Negativos do passo 5: `<val>/execucao-sonda/03-negativos-do-passo-5.txt`.

## Cenários positivos

Nas três execuções do documento (zsh, bash script, bash interativo), com os números do zsh:

- Passo 0: as seis ferramentas 17.6; `npm ci` (193 pacotes; imprimiu "3 vulnerabilities (1 moderate, 2 critical)", que o documento já diz não ser o portão) e build de shared, db e api sem erro.
- Passo 2: o primeiro `migrar` aplicou 001 a 050; `--conferir` "Esquema em dia."; `--semear` "Semeado com os dois municípios fictícios.".
- Passos 3 a 5: `pg_dump` e `pg_restore --exit-on-error` sem saída de erro e com código 0 (o `errexit` teria abortado).
- Passo 6: `linhas: idêntico`, `estrutura: idêntico`; `isolamento-afirmado.sql` nos dois bancos: "sem contexto: 31 tabelas lidas, todas com 0 linhas", "contexto A: 30 tabelas com organizacao_id, 47 linhas de A, 0 fora de A", UPDATE e DELETE recusados em `trilha_eventos` e `trilha_administrativa`, `interesse_municipio` recusada, "ISOLAMENTO: TODAS AS AFIRMACOES PASSARAM"; narrado com `SEM CONTEXTO VE LINHA: schema_migracoes (50)` e os quatro `permission denied` que o texto diz serem esperados; `migrar --conferir` na cópia "Esquema em dia.".
- API contra a cópia: `{"status":"ok","banco":"ok","ultimaMigracao":"050_login_e_suspensao_na_mesma_linha.sql",...}`; sonda com 7 OK, inclusive o 404 da ocorrência de Vale Fundo com token de Serra Alta e a busca `acacias` achando 000471/2026 com pontuação 0,8; "TODAS AS CONFERENCIAS PASSARAM".
- Passo 7: só `postgres` e o banco da prova em cada servidor, dois "server stopped", "pasta temporária apagada", `find` sem saída.

Consultas diretas no restaurado (execução 4, como `postgres`):

- RLS nas tabelas de negócio: 35 habilitadas, 35 forçadas, de 35; a única tabela sem RLS forçada é `schema_migracoes`.
- Papéis: `dc360_api` (login, sem super, sem BYPASSRLS), `dc360_app` (sem login, sem super, sem BYPASSRLS), `dc360_console` (sem login, NOINHERIT), `dc360_setup` (BYPASSRLS, não superusuário).
- Donos em `public`: as 174 relações são de `dc360_setup`; funções: 51 de `dc360_setup` (27 `SECURITY DEFINER`) e 31 de `postgres` (as do `pg_trgm`, extensão confiável, igual na origem pelo diff de estrutura).
- Trilha: só policies de INSERT e SELECT; `dc360_app` com INSERT e SELECT em `trilha_eventos` e `trilha_administrativa`, sem UPDATE nem DELETE.
- `pg_trgm` 1.6, dono `dc360_setup`; 4 índices `gin_trgm_ops`.
- `schema_migracoes`: 50 linhas e md5 das impressões `0760d8e984810067b402460d7c769e7b` nos dois lados.

## Cenários negativos

Rodados por mim em PostgreSQL 17.6, cada um num banco novo, com os comandos dos passos 4 e 5 do documento e só a omissão em causa (`<val>/execucao-sonda/03-negativos-do-passo-5.txt`; o do papel num terceiro cluster, porque `dc360_console` é objeto do cluster):

| Situação | Resultado |
| --- | --- |
| Destino sem `dc360_console` | código 1, `role "dc360_console" does not exist` em `CREATE POLICY console_codigos_insercao` (igual ao documento) |
| Banco sem derrubar o `public` de fábrica | código 1, `schema "public" already exists` (igual) |
| Dump sem `--extension=pg_trgm` | código 1, `operator class "public.gin_trgm_ops" does not exist for access method "gin"` em `equipes_busca_idx`; 0 extensão no destino (igual) |
| Destino sem `GRANT CREATE ON DATABASE` ao `dc360_setup` (não está na tabela do documento, mas o passo 4 manda a linha) | código 1, `permission denied for database neg_create` em `CREATE SCHEMA public`: a linha do passo 4 é necessária |
| Sem `--exit-on-error`, `public` de fábrica | código 1, `warning: errors ignored on restore: 752` (igual ao documento); ficaram escritos a extensão `pg_trgm` e suas 31 funções, 0 tabela (achado A2) |

Isolamento como o papel da aplicação: sem contexto, 0 linhas em toda tabela que ele lê; com contexto de Serra Alta, 0 linhas de Vale Fundo; `UPDATE` cruzado alcança 0 linhas; API com token de Serra Alta em ocorrência de Vale Fundo: 404.

## Tentativas de reprovar

1. Segui o documento no `zsh` padrão do macOS do jeito mais duro (`zsh -f -i`, sem `interactivecomments`, `errexit` ligado): passou. Procurei `#` nos blocos: zero.
2. Rodei em `bash` 3.2 (o do macOS, mais velho que o do Git Bash) como script com `set -e` e também interativo pela entrada padrão (onde o implementador disse que o `bash` se perdia): os dois passaram. Única diferença: com `env -i` sem `LANG`, o `bash` 3.2 interativo come o acento de "idêntico" e "temporária" no eco; é da minha forma de rodar (locale C), não do texto.
3. Clone sem `node_modules` nem `dist`: o passo 0 compila e o passo 6 sobe a API desta árvore (`ultimaMigracao` 050, que é a última da pasta de `bb0f654`).
4. Mordida das conferências do passo 6, cada mutação aplicada no restaurado, conferência do roteiro rodada, mutação desfeita (`02-mutacoes-mordem.txt`):
   - M1 `ocorrencias NO FORCE ROW LEVEL SECURITY`: o `isolamento-afirmado.sql` PASSA (o papel não é dono, então a falta de FORCE não muda o que ele vê), mas o diff de estrutura reprova (`negocio_sem_rls_forcada|0` contra `|1`). Ver A1.
   - M2 `vistoria_evidencias_perdidas DISABLE ROW LEVEL SECURITY` com a tabela vazia: o afirmado passa (não há linha para vazar), o diff de estrutura reprova.
   - M3 `dc360_app BYPASSRLS`: afirmado reprova ("papel da aplicacao com superusuario ou BYPASSRLS") e estrutura reprova.
   - M4 `GRANT UPDATE` mais policy de UPDATE em `trilha_eventos`: afirmado reprova ("UPDATE em trilha_eventos foi PERMITIDO").
   - M5 sem o `GRANT dc360_app TO dc360_api` do passo 6: afirmado reprova (`permission denied to set role "dc360_app"`).
   - M6 `equipes` com dono `dc360_app`: afirmado reprova ("tabela de public com dono da aplicacao").
   - Ao desfazer M6 a ACL de `equipes` perdeu a entrada de `dc360_app` (efeito do `ALTER OWNER` de ida e volta); o diff de estrutura acusou (`grants_dc360_app|81` contra `|78`) e eu repus o `GRANT SELECT, INSERT, UPDATE` como na origem; controle final: `estrutura: idêntico` e afirmado código 0. Isso também mostra que o diff de estrutura pega grant faltando.
5. Procurei divergência entre o roteiro e `ensaiar-restore.sh` que mudasse o resultado: mesmos papéis, mesmo dump, mesmos três GRANTs, mesmos `.sql`; o script ainda confere `negocio_sem_rls_forcada|0` em absoluto, a versão do `pg_dump` contra o servidor, servidores limpos e roda dois negativos. Nada no roteiro contradiz o script.
6. Conferi a afirmação do documento sobre o CI: `VEREDITO.md` da E25, linha 36, registra o run 38618369218 do SHA `7585801` como lido pelo gatekeeper. Não li run nenhum (sem `gh`).
7. Senha: nenhuma senha aparece em linha de comando do roteiro; `PGPASSFILE` em modo 600 dentro de `TMP`, que é apagada no passo 7 (conferido: `ls` do `TMP` depois dá "No such file or directory").

## Achados

- A1 (anotado): o roteiro não afirma em absoluto que toda tabela de negócio tem RLS forçada; ele só compara a estrutura dos dois lados. Se a origem já viesse sem FORCE numa tabela, os dois lados sairiam iguais e o roteiro passaria, e o `isolamento-afirmado.sql` não pega a falta de FORCE (M1). O `ensaiar-restore.sh` pega (`afirmar_linha ... "negocio_sem_rls_forcada|0"`). Reprodução: na origem e na cópia, `ALTER TABLE ocorrencias NO FORCE ROW LEVEL SECURITY`, e o passo 6 dá `estrutura: idêntico` e afirmado verde. Remédio de uma linha: dizer no "O que se espera ver" que `$TMP/conferencia/estrutura-restaurado.txt` tem `negocio_sem_rls_forcada|0`, ou levar a checagem para o `isolamento-afirmado.sql`. Não quebra critério da E25 (a origem vem das migrações, que o CA-06 cobre, e a cópia foi conferida por mim: 35 de 35).
- A2 (anotado): "o banco já tinha sido escrito pela metade" (passo 5) exagera: medido, sem `--exit-on-error` e com o `public` de fábrica, o que fica é a extensão `pg_trgm` com 31 funções e nenhuma tabela. A conclusão do texto (usar `--exit-on-error`) continua certa.
- A3 (anotado, fora do roteiro): com a API de pé contra a cópia, `metricas_municipio` ganha 2 linhas (cálculo diário na subida), e uma comparação de linhas feita DEPOIS do passo 6 acusa diferença. No roteiro a comparação vem antes da API, então não afeta quem o segue.

Nenhum achado que bloqueie.

## Não verificado

- Linux e Windows (Git Bash) seguindo o texto: esta máquina é macOS; não há Docker nem WSL.
- O run do CI do SHA (`restore` com `postgres:17` em Linux): não lido, `gh` sem login nesta sessão. A prova desta dimensão é a execução local em 17.6.
- PostgreSQL 17.11 (o do CI) e 16 (o do job `implantavel`): só rodei 17.6.
- Origem Supabase (papéis do provedor): fora da etapa, o documento diz que não refez.
- Uma pessoa que não conhece o sistema seguindo o roteiro: a arbitragem da rodada 3 registra que a emenda D-30 trocou isso por execução reproduzível do roteiro, que é o que fiz; não há pessoa nesta validação.
- O `npm ci` do passo 0 rodou com o cache do npm desta máquina (193 pacotes em 1 s); um cache vazio não foi testado.

## Risco residual

Baixo para o banco: o restore em 17.6 foi refeito do zero três vezes seguindo o texto e as conferências mordem. Resta: a diferença Linux e Windows (caminho dos binários, `pg_ctl` no Git Bash), que o texto trata em prosa e ninguém executou nesta rodada; e o A1, uma checagem absoluta de RLS forçada que só o script do CI faz.

## Motivo do humano

Nenhum para esta dimensão: tudo o que o critério pede de banco é verificável por execução e foi executado. A troca da segunda pessoa por execução reproduzível do roteiro foi decisão da arbitragem da rodada 3 (registrada no `VEREDITO.md`), não desta validação.
