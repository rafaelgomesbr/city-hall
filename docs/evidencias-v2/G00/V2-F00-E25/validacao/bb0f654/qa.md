---
validador: qa (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E25
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [DB, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: media
humano_necessario: sim
escalar: conflito provável com Banco ou Infra e CI (o defeito está só no caminho Windows do roteiro; o caminho macOS passou inteiro); arbitragem em Opus se houver PASS nas outras dimensões
---

## Critérios verificados

Pasta das saídas (scratchpad, fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/qa-E25/` (abaixo, `<V>`).

| Item (DoD e cinco campos de teste) | Como foi verificado | Resultado |
| --- | --- | --- |
| DoD: restore provado em máquina limpa, com as migrações de hoje e API contra a cópia | clone local novo no SHA `bb0f654` (sem `node_modules` nem `dist`), PostgreSQL 17.6 da EDB baixado agora (SHA-256 `5afb85f5...985fcc`, igual ao do documento), dois clusters novos com `initdb`, o documento seguido bloco a bloco em `zsh -f -i` com `env -i` | PASS no macOS |
| DoD: roteiro repetível por outra pessoa (pela emenda D-30, execução reproduzível do roteiro) | os 14 blocos extraídos do próprio arquivo por script, só com `PGBIN`, `TMP` e as três portas trocados, entregues ao `zsh` interativo e depois ao `bash` | PASS no macOS (zsh e bash); FAIL no caminho Windows (achado 1) |
| Contagem de migrações citada | `ls dc360/db/migrations` = 50; o documento diz 50 (marcador `numeros: migracoes=50`); o título do documento não cita número; "46" só existe no título da etapa no roadmap, e "47" só como fato datado da prova do Windows | PASS |
| Testes positivos: restore com `--exit-on-error`, contagens e hashes iguais, 35 tabelas com RLS ativada e forçada, API e `/saude` 200 | saída do fluxo zsh e do bash: `linhas: idêntico`, `estrutura: idêntico`, `rls_habilitada 35`, `rls_forcada 35`, `negocio_sem_rls_forcada 0`, md5 das impressões `0760d8e9...7c769e7b` igual nos dois lados e igual ao do `ensaiar-restore.sh`; `/saude` com `status ok`, `banco ok`, `ultimaMigracao 050_...` | PASS |
| Testes negativos: sem `dc360_console`, sem `pg_trgm`, `dc360_app` sem contexto | N2c, N2d e o afirmado sem contexto (31 tabelas, 0 linhas) | PASS |
| Autorização e isolamento: contexto de A não vê B, UPDATE na trilha negado, `test:isolamento` verde | `isolamento-afirmado.sql` nos dois bancos (`TODAS AS AFIRMACOES PASSARAM`), mutações N4a a N4d mordem; `npm run test:isolamento` no clone: 345 aprovados, 3 pulados, código 0 | PASS |
| Regressão: `test:isolamento`, `migrar -- --conferir` | os dois executados; `Esquema em dia.` na origem e na cópia | PASS |
| E2E: login e leitura de ocorrência contra a API na cópia | sonda `scripts/restore/api-contra-a-copia.mjs`: login, lista (6), detalhe 000471/2026, 404 da ocorrência de Vale Fundo, busca `pg_trgm`, `TODAS AS CONFERENCIAS PASSARAM` | PASS |
| Documentação: passo a passo para Linux, macOS e Windows com Git Bash | executado o de macOS; o de Windows quebra no passo 0 com o caminho de exemplo do próprio documento (achado 1) e provavelmente no passo 2 (achado 2) | FAIL |
| O documento diz a verdade sobre o CI | conferido no `verificar.yml` de `bb0f654`: job `restore` com `postgres:17` roda `scripts/ensaiar-restore.sh`, só com `[ci completo]`, dispatch ou agenda; `origin/master` (referência local, `e82719e`) não tem `workflow_dispatch` nem `schedule`; `implantavel` usa `postgres:16` e tem `GRANT CREATE ON DATABASE`; o script só faz dois negativos (papel e extensão). O run 38618369218 citado bate com o `VEREDITO.md`, mas não foi lido por mim | PASS no corpo do texto; título e Parte 6 dizem um pouco mais (achado 3) |

## Evidência

Todos os comandos rodaram dentro do clone `<V>/clone` (nunca na árvore principal), com `env -i HOME=... PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`.

1. Binários: `curl -sSfL -o postgresql-17.6-1-osx-binaries.zip https://get.enterprisedb.com/postgresql/postgresql-17.6-1-osx-binaries.zip`, `shasum -a 256` igual ao do documento, `unzip` em `<V>/pg17`; `psql --version` 17.6.
2. Clone: `git clone /Users/rafaelgomes/Documents/city-hall <V>/clone` e `git checkout bb0f654` dentro do clone; 50 arquivos em `dc360/db/migrations`.
3. Blocos: `<V>/ferramentas/extrair.py` tira os 14 blocos `bash` de `dc360/docs/RESTORE-DO-BANCO.md` (nenhum tem `#`); `<V>/ferramentas/montar.py` troca só `PGBIN`, `TMP` e as portas (diff conferido: três linhas); fluxo em `<V>/ferramentas/fluxo-zsh.txt`.
4. Fluxo zsh: `zsh -f -i < fluxo-zsh.txt`, código 0, saída `<V>/saidas/zsh-fluxo.txt` (14 de 14 blocos, 16:05:49 a 16:06:07).
5. Fluxo bash: `bash --norc --noprofile fluxo-bash.sh`, código 0, saída `<V>/saidas/bash-fluxo.txt`.
6. Negativos e mutações (clusters novos, blocos 0 e 2 a 10 do documento, depois `<V>/ferramentas/negativos.zsh`, depois o bloco 13): saída `<V>/saidas/zsh-negativos.txt`.
7. `ensaiar-restore.sh` em dois clusters novos: código 0, `RESTORE ENSAIADO: 27 conferencias passaram, 0 falharam.`, saída `<V>/saidas/ensaiar-restore.txt` e `<V>/saidas/ensaio-saida/`.
8. `npm run test:isolamento` no clone: código 0, `Test Files 14 passed`, `Tests 345 passed | 3 skipped`, saída `<V>/saidas/test-isolamento.txt`.
9. Achado 1: `<V>/ferramentas/espaco.sh` (o bloco do passo 0 com o caminho de exemplo do Windows) rodado em `bash` e em `zsh`.

## Cenários positivos

- Documento a frio, zsh puro e interativo: `npm ci` e compilação de shared, db e api; 50 migrações aplicadas do zero; `Esquema em dia.`; semente; `pg_dump` com `--extension=pg_trgm`; destino com os quatro papéis; `pg_restore --exit-on-error` sem erro; três GRANTs; `linhas: idêntico` e `estrutura: idêntico`; afirmado de isolamento passou na origem e na cópia; narrado com os `permission denied` esperados e `SEM CONTEXTO VE LINHA: schema_migracoes (50)`; `migrar --conferir` na cópia `Esquema em dia.`; API com o login `dc360_api` subiu e `/saude` respondeu `banco ok`; sonda 9 de 9; bloco 7 listou só os bancos da prova, parou os dois servidores, apagou `TMP` e o `find` de `*.dump` ficou vazio.
- Mesmo fluxo em bash: mesmo resultado.
- Contagens no restaurado (PG 17.6): 36 tabelas, 35 de negócio com RLS ativada e forçada, 94 policies, 82 funções (27 `SECURITY DEFINER`, mesmo teto de 27 de `isolamento.test.ts:653`; a 82ª é a função comum da 049, como o documento diz), 137 índices (4 `gin_trgm_ops`), `pg_trgm` 1.6, nenhum papel `dc360_*` superusuário, só `dc360_setup` com BYPASSRLS, 0 tabela com dono da aplicação, 0 policy de UPDATE ou DELETE na trilha.
- `ensaiar-restore.sh` deu o mesmo md5 das impressões e as mesmas contagens: as duas vias concordam.

## Cenários negativos

Todos com código e mensagem em `<V>/saidas/zsh-negativos.txt`:

| Caso | Resultado |
| --- | --- |
| N1a restore por cima do banco já restaurado (banco sujo) | código 1, `schema "public" already exists` |
| N1b banco novo sem `DROP SCHEMA public` | código 1, `schema "public" already exists` |
| N2a papel errado: restore como `dc360_api` | código 1, `permission denied for database` |
| N2b restore como superusuário com `--no-owner` | restore passa, o diff de estrutura acusa o dono trocado em todas as tabelas (a conferência morde) |
| N2c destino sem `dc360_console` | código 1, `role "dc360_console" does not exist` na policy `console_codigos_insercao` |
| N2d dump sem `--extension=pg_trgm` | 0 entradas `EXTENSION` no sumário; código 1, `operator class "public.gin_trgm_ops" does not exist`; 0 extensão no destino |
| N2e destino sem `GRANT CREATE ON DATABASE` | código 1, `permission denied for database` |
| N2f sem `GRANT dc360_app TO dc360_api` | afirmado código 3, `permission denied to set role "dc360_app"` |
| N3a migração faltando (linha da 050 apagada de `schema_migracoes`) | `migrar --conferir` código 1; diff de linhas e de estrutura acusam; a API recusa subir: `Esquema atrasado: faltam 1 migração(ões)` |
| N3b impressão da 049 adulterada | `migrar --conferir` código 1 |
| N4a `NO FORCE ROW LEVEL SECURITY` em `ocorrencias` | `negocio_sem_rls_forcada 1`, `rls_forcada 34` |
| N4b `DISABLE ROW LEVEL SECURITY` em `ocorrencias` | afirmado código 3, `SEM CONTEXTO A TABELA ocorrencias MOSTRA 10 LINHA(S)` |
| N4c policy e grant de UPDATE e DELETE na trilha | afirmado código 3, `UPDATE em trilha_eventos foi PERMITIDO` |
| N4d policy de SELECT permissiva em `ocorrencias` | afirmado código 3 |
| N5 sonda sem o id, e com id de Serra Alta no lugar do de Vale Fundo | `1 FALHA(S)`, código 1 nos dois; com o id de A, o caso do 404 acusa `status 200` |
| Sonda com id vazio (bash) | reprova (`status 200` da lista) |

## Tentativas de reprovar

1. Segui o documento como uma segunda pessoa, a frio, extraindo os blocos do arquivo por script em vez de digitá-los (para não corrigir nada sem querer), em `zsh -f -i` sem `interactivecomments` e com ambiente vazio. Não quebrou no macOS.
2. Repeti em bash. Não quebrou.
3. Tentei quebrar a substituição dos dois valores que o documento manda trocar, usando o exemplo do próprio documento para o Windows (`/c/Program Files/PostgreSQL/17/bin`, o caminho padrão do instalador). Quebrou: achado 1.
4. Li o mecanismo de senha do passo 2 e do passo 4 (crase do `psql` com `$DC360_SENHAS`) pensando no Git Bash. Achado 2 (provável, não reproduzido).
5. Restore em banco sujo, papel errado, papel faltando, extensão faltando, grant faltando, migração faltando e impressão adulterada: todos param ou são acusados (tabela acima).
6. Procurei sonda que não morde: desliguei e afrouxei RLS, abri a trilha, vazei policy, troquei e esvaziei o id da sonda da API. Todas acusaram. Um uuid inexistente responde 404 e passa, o que é o desenho (404 nunca 403); o documento lê da origem um id real, e as linhas são idênticas.
7. Conferi as frases sobre o CI contra o `verificar.yml` de `bb0f654` e contra `origin/master`; o corpo está correto. O título e a Parte 6 de `COLOCAR-DE-PE.md` dizem "repetido pelo CI" e "o CI repete o roteiro": achado 3.
8. Conferi a contagem de migrações no texto, no marcador e na pasta (50), e a afirmação sobre 048 a 050 contra o catálogo (36, 94, 27 iguais às da prova de 47; uma função comum a mais).
9. Rodei o `ensaiar-restore.sh` e comparei com o documento: mesmas conferências e mesmo md5. Diferença de forma: o script derruba o `public` só se o dump o recria; o documento derruba sempre (correto para o dump que ele mesmo manda fazer).
10. Procurei senha nas saídas da API e do ensaio: nenhuma ocorrência da senha do superusuário nem de URL com senha no `19-api.log`.

## Achados

1. **FAIL (critério de documentação: passo a passo para Windows com Git Bash).** O passo 0 manda trocar só `PGBIN` e `TMP`, num bloco sem aspas (`export PGBIN=/caminho/da/pasta/bin/do/postgresql-17` e `TMP=/caminho/fora/do/repositorio`), e dá como exemplo do Windows `/c/Program Files/PostgreSQL/17/bin`, que é o caminho padrão do instalador e tem espaço. Seguido à risca, o primeiro bloco quebra. Reprodução (`<V>/ferramentas/espaco.sh`, mesmo caminho com espaço): bash imprime `export: 'Files/PostgreSQL/17/bin': not a valid identifier`, `PGBIN` fica cortado em `.../Program` e `initdb: command not found`; zsh imprime `export: not valid in this context` e o mesmo `command not found`. O mesmo vale para `TMP` numa pasta de usuário com espaço (`TMP=/c/Users/Nome Sobrenome/...` vira a execução de um comando). É a classe de defeito que reprovou a rodada 3 ("seguido à risca não chega ao restore"), agora no caminho do Windows. Conserto mínimo: aspas nos dois valores do bloco (`export PGBIN="..."`, `TMP="..."`) e o exemplo do Windows escrito entre aspas.
2. **Corrige antes de crescer, provável e não reproduzido (sem Windows aqui).** Os passos 2 e 4 leem a senha com a crase do `psql` (`\set senha_setup` com `cat "$DC360_SENHAS/.senha-setup"`). No Windows o `psql` nativo executa a crase pelo `popen` do sistema, que usa o `cmd.exe`, e o `cmd.exe` não expande `$DC360_SENHAS`; o `cat` receberia o texto literal e o papel sairia sem senha ou o SQL pararia. A versão 2 do documento nunca rodou no Windows (o próprio documento diz). Ou se prova o caminho no Git Bash, ou o passo 0 deixa de instruir o Windows e diz que ele não está provado nesta versão.
3. **Anotado.** O título ("o roteiro mínimo, provado e repetido pelo CI") e a nota da Parte 6 de `COLOCAR-DE-PE.md` ("o CI repete o roteiro em Postgres 17") dizem mais do que o corpo, que afirma corretamente que o job roda `ensaiar-restore.sh` e não executa o documento. `INDISPONIBILIDADE.md` usa a forma certa ("repete uma versão dele").
4. **Anotado.** "Fora do Windows", Linux: `apt install postgresql` traz a versão da distribuição (15 ou 16 nas atuais), e não a 17 que o passo 0 pede; falta dizer que a 17 vem do repositório do PGDG. No macOS com Homebrew falta o caminho do `PGBIN` (`postgresql@17` é keg-only).
5. **Anotado.** `scripts/restore/estrutura.sql` calcula o md5 das restrições sem parênteses e afirma que o agrupamento "não muda o significado". Com AND e OR misturados muda: `CHECK (((a OR b) AND c))` e `CHECK ((a OR (b AND c)))` dão o mesmo md5 (`494d81d3...e554`, conferido com node). Risco baixo (o `pg_dump` reproduz a restrição fiel), mas a conferência perde essa mordida e o comentário está errado.

## Não verificado

- Windows com Git Bash seguindo o documento (achados 1 e 2): não há Windows nesta máquina; o achado 1 foi reproduzido com a mesma semântica de shell no bash e no zsh do macOS.
- Linux seguindo o documento: não há Linux aqui; o CI prova o script, não o texto.
- O run do CI de `bb0f654` (nem o 39143791434 nem o 38618369218): `gh` sem login e leitura do token negada. A afirmação "27 conferências" foi conferida só pelo meu próprio ensaio local (27 OK).
- Origem Supabase com o esquema atual (papéis do provedor, `sslmode`): fora do alcance, e o documento a declara não provada.
- `npm run conferir:numeros` no clone: falhou por ambiente (o clone só compilou shared, db e api, e `vitest list --root apps/api` reprovou); o gatekeeper o rodou na árvore principal com código 0. Conferi o número que importa aqui (50) direto na pasta e no marcador.
- Uma pessoa que nunca viu o sistema: quem seguiu o texto fui eu, um agente, num clone limpo, numa máquina que já tinha Node e cache do npm (o `npm ci` levou 2 s).
- O caso do documento "sem `--exit-on-error`, `errors ignored on restore: 752`": não repeti.

## Risco residual

- Um operador no Windows, com o PostgreSQL no caminho padrão, para no passo 0 (achado 1) e, se acertar as aspas por conta própria, provavelmente para no passo 2 (achado 2). Num incidente real o restore atrasa. O caminho macOS, que é a máquina atual do projeto, está provado de ponta a ponta com PostgreSQL 17.6.
- O CA-08 continua dependendo de um run do CI lido por alguém com acesso, e de Linux e Windows seguindo o texto.

## Motivo do humano

Ambiente externo inacessível para o agente: executar `dc360/docs/RESTORE-DO-BANCO.md` num Windows com Git Bash e o PostgreSQL 17 do instalador padrão (`C:\Program Files\PostgreSQL\17`), depois do conserto dos achados 1 e 2, para provar o caminho Windows que o documento instrui. O caminho macOS não precisa de humano: foi executado aqui.
