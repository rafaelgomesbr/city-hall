---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E25
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
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

Saídas brutas fora do repositório: `<Q>` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/qa-E25/`; `<V>` = `.../scratchpad/validadores/qa/`.

Método: um `git worktree` limpo em `1ed0b71` (sem `node_modules` nem `dist`), e `dc360/docs/RESTORE-DO-BANCO.md` (versão 3) seguido à risca como uma segunda pessoa faria: os 14 blocos `bash` do documento extraídos por script (`<Q>/ferramentas/extrair.py`), em ordem, no mesmo shell, trocando só o valor de `PGBIN` (com as aspas do texto-modelo) e as três portas (56451, 56452, 3356, para não colidir com outros validadores). Nenhum bloco tem `#`. PostgreSQL 17.6 da EDB (`SCRATCH/pg17/pgsql/bin`). Ambiente limpo (`env -i`, só `HOME`, `PATH` mínimo, `TERM`, `LANG`, `TMPDIR`).

| Critério (DoD e campos de teste) | Resultado | Prova |
| --- | --- | --- |
| Passo 0 com `PGBIN` com espaço (o defeito da rodada 4) | PASS: `export PGBIN="..."` com aspas aceita caminho com espaço em `zsh` e em `bash` 3.2; os seis binários respondem 17.6 | `<Q>/saida-zsh.txt` bloco 1 (link simbólico `.../qa-E25/Program Files/PostgreSQL/17/bin`); `<Q>/saida-bash-stdin.txt` bloco 1 (cópia real `cp -Rc` em `.../win/Program Files/PostgreSQL/17/bin`, sem link) |
| Restore sem erro com `--exit-on-error` | PASS: código 0 nos dois shells | blocos 9 de `saida-zsh.txt` e `saida-bash-stdin.txt` |
| Origem com todas as migrações e semente | PASS: 51 `aplicando` (001 a 051), `Esquema em dia.`, `Semeado com os dois municípios fictícios.` | bloco 6 dos dois arquivos |
| Contagens e hashes iguais | PASS: `linhas: idêntico` e `estrutura: idêntico` (a `estrutura.sql` inclui `rls_habilitada 35`, `rls_forcada 35`, `negocio_sem_rls_forcada 0`) | bloco 11 |
| RLS ativada e forçada nas 35 tabelas | PASS por comparação (35 e 35 dos dois lados) | `<Q>/saida-negativos.txt` (as linhas do diff mostram os valores) |
| `pg_trgm` e os índices `gin_trgm_ops` | PASS: a busca `acacias` responde pela API restaurada; negativo abaixo | bloco 13 |
| Isolamento no restaurado (sem contexto 0 linhas; com A nada de B) | PASS: `ISOLAMENTO: TODAS AS AFIRMACOES PASSARAM` na origem e na cópia; 31 tabelas com 0 linhas sem contexto; contexto A: 47 linhas de A, 0 fora; B: 2 ocorrências, 0 de A | bloco 11 |
| `UPDATE` na trilha negado (append-only) | PASS: `permission denied for table trilha_eventos` e `trilha_administrativa` | bloco 11 |
| Papel de aplicação sem `BYPASSRLS` e sem ser dono | PASS: `dc360_api|f|f`, `dc360_app|f|f`, 0 tabelas com dono da aplicação | bloco 11 |
| API contra a cópia: `/saude` 200, login, leitura, 404 cruzado | PASS: `{"status":"ok","banco":"ok","ultimaMigracao":"051_..."}`; sonda `TODAS AS CONFERENCIAS PASSARAM`, com 404 para a ocorrência de Vale Fundo com token de Serra Alta | blocos 12 e 13 |
| `npm run migrar -- --conferir` na cópia | PASS: `Esquema em dia.` | bloco 11 |
| Limpeza (passo 7) | PASS: só os bancos da prova listados, servidores parados, `pasta temporária apagada`, `find` sem `*.dump`; nenhum processo `postgres` nem `apps/api/dist/index.js` vivo depois | bloco 14; `pgrep` vazio |
| Regressão `npm run test:isolamento` | PASS: 345 passaram e 3 pulados por ambiente (inclui `isolamento.test.ts`, 137 de 137) | `<V>/npm-test.txt` (suíte `@dc360/db`) |
| Roteiro repetido por segunda pessoa | Não verificado: é validação humana (ver Motivo do humano) | |
| Linux e Windows seguindo o texto | Não verificado: sem contêiner nem Windows nesta máquina | |

## Evidência

- `zsh -f -i` (interativo, sem `interactivecomments`, blocos pela entrada padrão, como quem cola): `<Q>/saida-zsh.txt`, código do shell 0, 14 de 14 blocos com `@@BLOCO n codigo=0`, 13 s (o `npm ci` saiu do cache).
- `/bin/bash` 3.2.57 `--noprofile --norc -i`, também pela entrada padrão: `<Q>/saida-bash-stdin.txt`, código 0, 14 de 14 blocos. Ambiente hostil: `PASTA_RESTORE` já definida para `<Q>/minha pasta` com `importante.txt`, `TMP` exportado para `<Q>/tmp hostil` com `sentinela.txt`, `TMPDIR` com espaço (`.../T/qa e25`). O `mktemp` criou outra pasta (`.../qa e25/dc360-restore.7zAiUV`); os dois arquivos do leitor continuam lá depois do passo 7.
- Negativos e mordidas: `<Q>/ferramentas/negativos.sh`, saída `<Q>/saida-negativos.txt`, código 0 (o script reproduz os passos 0 a 3 com os blocos do próprio documento, `<Q>/ferramentas/neg-pre.sh`, e roda cada variante num banco novo do destino).
- Regressão: `npm test` na árvore principal (`5044e7a`, produto igual ao de `1ed0b71`), código 0, `<V>/npm-test.txt`.
- Nenhuma senha impressa em saída; nenhum dump fora das pastas temporárias, todas apagadas.

## Cenários positivos

- Os 14 blocos, em ordem, nos dois shells, com caminho de binários com espaço (link e cópia real), chegam ao fim sem erro e com todas as saídas que o documento manda esperar.
- O `npm ci` imprime "3 vulnerabilities (1 moderate, 2 critical)" e o roteiro segue, como o documento avisa.

## Cenários negativos

Todos em `<Q>/saida-negativos.txt`, PostgreSQL 17.6, um banco novo por caso:

| Caso | Resultado |
| --- | --- |
| Destino sem `dc360_console` | código 1, `role "dc360_console" does not exist` na policy `console_codigos_insercao` |
| Dump sem `--extension=pg_trgm` | 0 entradas `EXTENSION` no dump (2 no do roteiro); restore código 1, `operator class "public.gin_trgm_ops" does not exist for access method "gin"` em `equipes_busca_idx`; no destino 0 índice `gin_trgm_ops` e 0 extensão |
| Sem derrubar o `public` | código 1, `schema "public" already exists` |
| Sem derrubar o `public` e sem `--exit-on-error` | `errors ignored on restore: 757`, código 1 |
| `dc360_app` sem contexto | 0 linhas em toda tabela de negócio que lê (bloco 11) |
| Sonda sem o id de Vale Fundo | código 1 (a chamada vai a `/ocorrencias/undefined`) |
| Sonda com um id de Serra Alta no lugar do de Vale Fundo | código 1, `FALHA ... responde 404: status 200` (a sonda morde) |

## Tentativas de reprovar

1. Caminho com espaço sem link simbólico (o `initdb` resolveria o link e esconderia o espaço): cópia real com `cp -Rc` em `.../win/Program Files/PostgreSQL/17/`. Passou.
2. `bash` 3.2 colado pela entrada padrão (a correção 1 registrou que o `bash` se perdia no bloco 11 assim): passou inteiro, sem `unexpected EOF`.
3. Pasta do leitor pré-existente em `PASTA_RESTORE` e `TMP` hostil: nada do leitor foi apagado.
4. A conferência morde? Na cópia, `ALTER TABLE ocorrencias DISABLE ROW LEVEL SECURITY`: `isolamento-afirmado.sql` para com `SEM CONTEXTO A TABELA ocorrencias MOSTRA 10 LINHA(S)`, código 3, e o diff de estrutura acusa `rls_habilitada 35` contra `34`.
5. Só `NO FORCE ROW LEVEL SECURITY` em `ocorrencias` na cópia: `isolamento-afirmado.sql` continua passando (correto, `dc360_api` não é dono), e quem acusa é só o diff de `estrutura` (`rls_forcada 35` contra `34`, `negocio_sem_rls_forcada 0` contra `1`). Ver achado 3.
6. `pg_ctl start` numa porta já ocupada, com o redirecionamento do passo 1: código 1 e nada no terminal; a mensagem `could not start server` fica só no arquivo redirecionado. Ver achado 1.
7. Contagem de migrações e saídas esperadas contra a realidade de hoje (51 migrações): ver achado 2.

## Achados

1. **Corrige antes de crescer.** Passo 1 (`RESTORE-DO-BANCO.md:208-216`): o texto diz que, com o redirecionamento, o `pg_ctl` "responde `servidor iniciado` e volta", mas a saída vai para `pgctl-*.out` e o terminal não mostra nada (nos dois shells). Se o servidor não sobe (porta ocupada, por exemplo), o bloco termina calado com código 1, e a segunda pessoa só vê um erro de conexão ou de senha no passo 2, sem pista da causa. Reprodução: caso H de `<Q>/saida-negativos.txt`. Remédio sugerido: mandar conferir `cat "$PASTA_RESTORE/pgctl-origem.out"` ou encadear `|| cat ...`.
2. **Anotado.** `RESTORE-DO-BANCO.md:402-403` diz que o aviso esperado é `SEM CONTEXTO VE LINHA: schema_migracoes (50)`; hoje sai `(51)` (bloco 11). O resto do documento já fala em 51; a frase é número velho, sem efeito no restore.
3. **Anotado** (o mesmo da rodada 4, Banco). O roteiro não afirma sozinho a RLS forçada depois do restore: a linha `negocio_sem_rls_forcada` está na `estrutura.sql`, mas só é comparada por `diff`; se a origem também estivesse sem forçar, o diff sairia idêntico. O texto do "O que se espera ver" não pede ao leitor que confira `negocio_sem_rls_forcada|0`.
4. **Anotado.** "Fora do Windows" manda `apt install postgresql` no Linux; nas distribuições comuns isso traz uma versão maior diferente de 17 sem o repositório do PGDG, que o texto cita só para o CI. Leitura (E3a), não executado.
5. **Anotado.** `RESTORE-DO-BANCO.md:326-330` diz que, sem `--exit-on-error`, o banco "já tinha sido escrito pela metade"; no meu caso E, `public` terminou com 0 tabelas (757 erros ignorados). Não refutei a frase por inteiro (não listei funções nem extensões), mas a contagem de tabelas não a confirma.

Nenhum achado bloqueia: o roteiro, seguido como está escrito, chega ao fim nos dois shells, inclusive com o caminho com espaço que reprovou a rodada 4.

## Não verificado

- Windows com Git Bash seguindo o texto da versão 3 (caminhos `/c/Program Files/...`, `PGPASSFILE` com caminho POSIX lido pelo `psql.exe`, conversão de caminhos do MSYS em `--pwfile=`, `kill "$API_PID"` num `node.exe`, `mktemp -d` e `TMPDIR` do Git Bash, `initdb` do instalador): não há Windows nesta máquina.
- Linux seguindo o texto: não há contêiner nem Linux; o job "Restore do banco" do CI não rodou para este SHA (CI ausente, H32), e o run 38618369218 citado no documento não foi lido.
- Máquina limpa de verdade: a prova rodou na máquina do dono, com Node 24.15 (o `.nvmrc` pede 22) e o cache do npm já cheio.
- Origem Supabase com o esquema atual (papéis do provedor).
- Uma pessoa que não escreveu o sistema seguindo o documento (validação humana da etapa).
- Os clusters ficaram em `TMPDIR` (pasta temporária do sistema, `/var/folders/.../T/`), não em `SCRATCH/validadores/qa-E25/`, porque o roteiro cria a pasta com `mktemp -d` dentro de `TMPDIR`, e um `TMPDIR` dentro do scratchpad (110 caracteres) estoura o limite de 104 caracteres do socket do `tsx` no macOS. Foram apagados pelo próprio passo 7.

## Risco residual

O caminho Windows continua provado só por análise: a gramática de shell que reprovou a rodada 4 está consertada e provada em `bash` 3.2 e `zsh`, mas os pontos próprios do Git Bash (conversão de caminhos para binários nativos, `PGPASSFILE`, `kill`) nunca rodaram com este texto. A falha calada do `pg_ctl` (achado 1) torna o diagnóstico difícil para quem não conhece o sistema. A RLS forçada é garantida por comparação, não por afirmação (achado 3).

## Motivo do humano

A Definition of Done pede "roteiro repetido por segunda pessoa": só uma pessoa que não escreveu o sistema, de preferência no Windows com Git Bash ou num Linux limpo, fecha o CA-08 por inteiro e cobre os pontos que esta máquina não alcança.
