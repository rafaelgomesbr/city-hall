---
validador: arbitragem (general-purpose, Opus)
modelo: claude-opus-5-5
etapa: V2-F00-E25
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [DB, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Conflito arbitrado (seção 7 de `28`): `qa.md` dá FAIL; `banco-de-dados.md` dá PASS. Os fatos NÃO estão em disputa: os dois seguiram o roteiro a frio no macOS (PostgreSQL 17.6, `zsh -f -i` e `bash` 3.2) e os dois chegaram ao fim com as mesmas conferências; o banco põe "Linux e Windows (Git Bash) seguindo o texto" em "Não verificado" e não examinou o caminho do Windows. O QA reproduziu um defeito nesse caminho. A disputa é só se esse defeito reprova a etapa. Arbitro pela prova que eu mesmo produzi (abaixo) e pelo texto dos critérios.

Documento examinado: `dc360/docs/RESTORE-DO-BANCO.md` de `bb0f654` (extraído com `git show bb0f654:...`; o HEAD `0290af5` só difere em `STATUS.md` e `ESTADO-ATUAL.md`, conferido com `git diff --stat bb0f654 HEAD`).

Textos que decidem (citados como estão no repositório, `docs/roadmap-v2/03-fase-00-estabilizacao.md` de `bb0f654`):

1. Bloco da etapa, "O que deve ser implementado", Documentação: "`dc360/docs/RESTORE-DO-BANCO.md` (a criar) com o passo a passo mínimo para Linux, macOS e **Windows com Git Bash** e os erros encontrados".
2. "Estado atual": "a Parte 6 é o roteiro de 15 migrações; passa a 46, **multiplataforma e provado**".
3. Objetivo: "deixar um roteiro mínimo que **outra pessoa repete**".
4. Item "Restore provado" do G00, linha 793, com a EMENDA D-30: "independência de ambiente provada por CI Linux com Postgres 17 e artefato arquivado, **execução reproduzível do roteiro e leitura a frio por agente em clone limpo**".
5. Régua da rodada 3 (`validacao/52952a1/arbitragem.md`), aplicada aqui por coerência: o roteiro, "seguido à risca", precisa se repetir; "O roteiro só funciona se o leitor adivinhar ... o que ele não diz" foi motivo de FAIL; e "o conserto é de texto e barato ... mede o custo do conserto, não a gravidade do defeito: o entregável É um texto".

O que o documento promete ao leitor de Windows (linhas do arquivo em `bb0f654`): linha 106, "No Windows, use o Git Bash."; linhas 111 e 112, "No Windows (Git Bash) eles vêm do instalador do PostgreSQL, por exemplo `/c/Program Files/PostgreSQL/17/bin`."; linha 115, o bloco `export PGBIN=/caminho/da/pasta/bin/do/postgresql-17`, sem aspas; linhas 96 a 99, "Os dois únicos valores que você troca são `PGBIN` ... e `TMP`"; linha 147, `TMP=/caminho/fora/do/repositorio`, sem aspas. O documento não diz que o Windows está fora desta versão: diz só, na seção da prova, que "Linux e Windows seguindo o texto" não rodaram nesta prova.

Decisão por critério:

| Critério | Prova | Resultado |
| --- | --- | --- |
| Restore em PG 17 com `--exit-on-error`, conferências, isolamento, trilha, API contra a cópia (DoD, positivos, negativos, autorização, regressão, E2E) | os dois relatórios, por execução própria e concordantes; não disputado | cumprido no macOS |
| Roteiro reproduzível no macOS, `zsh` e `bash` (emenda D-30) | os dois relatórios, concordantes; não disputado | cumprido |
| Documentação: passo a passo para Windows com Git Bash, seguido à risca (textos 1 a 5) | reproduzido por mim: o primeiro bloco quebra com o exemplo de caminho do próprio documento | **FAIL** |

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/arbitragem-E25/` (abaixo, `<A>`). Shells: `/bin/zsh` 5.9 e `/bin/bash` 3.2.57 do macOS (arm64).

1. Simulação da pasta do instalador com espaço: `<A>/c/Program Files/PostgreSQL/17/bin` como link para os binários 17.6 da EDB já baixados pelo QA (`validadores/qa-E25/pg17/pgsql/bin`). Bloco 0 extraído do próprio documento por `awk` (primeiro bloco `bash`): `<A>/bloco0-original.sh`.
2. `<A>/bloco0-a-risca.sh`: só o valor de `PGBIN` trocado pelo caminho do exemplo de Windows (prefixado pela pasta da simulação), sem acrescentar aspas, como o documento manda. `diff` contra o original: uma linha.
3. `<A>/bloco0-com-aspas.sh`: controle, o mesmo valor entre aspas duplas.
4. Execução, `env -i` com `HOME` e `PATH` mínimos, blocos pela entrada padrão (como quem cola no terminal): `zsh -f -i < bloco0-*.sh` e `bash --norc --noprofile -i < bloco0-*.sh`. Saídas: `<A>/saida-a-risca-zsh.txt` (código 127), `<A>/saida-a-risca-bash.txt` (código 127), `<A>/saida-com-aspas-zsh.txt` (código 0), `<A>/saida-com-aspas-bash.txt` (código 0).
5. `TMP` numa pasta de usuário com espaço: `<A>/tmp-a-risca.sh` (a linha `TMP=...` do bloco 2 com `.../Users/Nome Sobrenome/rodada-e25`, mais o `export DC360_SENHAS="$TMP"` seguinte e um `echo`); saídas `<A>/saida-tmp-zsh.txt` e `<A>/saida-tmp-bash.txt`.
6. Suspeita da crase (achado 2 do QA): cluster 17.6 descartável (`initdb` com `scram-sha-256`, porta 55931, senhas sorteadas em arquivo, `PGPASSFILE`), os comandos do passo 2 do documento em duas variantes; saída `<A>/saida-crase.txt`. Cluster parado, pasta apagada (`test ! -e` confirmou), `lsof` da porta vazio.

Nenhum arquivo do repositório foi criado ou mudado além deste.

## Cenários positivos

- Controle do bloco 0 com aspas: `zsh` e `bash` imprimem `initdb (PostgreSQL) 17.6` até `pg_restore (PostgreSQL) 17.6`, código 0. O defeito é só a falta de aspas.
- Controle da crase como o documento a escreve, no macOS: o `psql` cria `dc360_setup` com senha (`tem_senha = t`) e o login de `dc360_setup` pelo `PGPASSFILE` funciona. No Unix o `popen` do `psql` usa `/bin/sh`, que expande `$DC360_SENHAS`; por isso o macOS passa.
- Os dois validadores: o roteiro inteiro, nos dois shells do macOS, chega ao fim com `linhas: idêntico`, `estrutura: idêntico`, isolamento afirmado nos dois bancos, `Esquema em dia.` e a sonda da API verde. Não contesto.

## Cenários negativos

- Bloco 0 à risca com o exemplo de Windows, `zsh`: `export: not valid in this context: Files/PostgreSQL/17/bin`, depois `command not found` para `initdb`, `pg_ctl`, `psql`, `createdb`, `pg_dump` e `pg_restore`; código 127.
- Mesmo bloco, `bash`: ``export: `Files/PostgreSQL/17/bin': not a valid identifier``, `PGBIN` cortado em `.../Program`, os seis `command not found`; código 127.
- `TMP` com espaço, nos dois shells: a linha vira a execução de `Sobrenome/rodada-e25` (`no such file or directory`) com `TMP` só no ambiente desse comando; em seguida `TMP` e `DC360_SENHAS` ficam vazios (`TMP=[] DC360_SENHAS=[]`).
- Crase, simulação do que chega ao `cat` quando o interpretador do `popen` não expande `$DC360_SENHAS` (texto literal): `cat: $DC360_SENHAS/.senha-setup: No such file or directory`, depois `NOTICE: empty string is not a valid password, clearing password`, o papel sai SEM senha (`tem_senha = f`), e o `psql` termina com **código 0** apesar de `ON_ERROR_STOP=1` (a falha da crase não é erro de SQL). O login seguinte de `dc360_setup` falha com `password authentication failed`. Ou seja: se a premissa do QA valer no Windows, o passo 2 passa calado e o roteiro quebra adiante, no `npm run migrar`.

## Tentativas de reprovar

Tentei derrubar o FAIL do QA:

1. "O bloco tem um marcador de lugar, e quem troca põe aspas": o documento diz que os únicos valores que se trocam são `PGBIN` e `TMP` e dá o exemplo do Windows sem aspas; nada no texto avisa sobre espaço. A rodada 3 já rejeitou "o leitor adivinha" (texto 5). E `/c/Program Files/...` não é caso raro: é o caminho padrão do instalador, o mesmo que o documento cita.
2. "Não há Windows aqui, então é suspeita": a quebra do achado 1 não depende do Windows. É gramática de atribuição do shell POSIX (palavra de atribuição termina no espaço sem aspas), igual em `bash` 3.2, no `bash` 5 do Git Bash e no `zsh`; reproduzi nos dois shells desta máquina. É prova E2, não inferência.
3. "A emenda D-30 só exige CI Linux e leitura a frio por agente": exige também "execução reproduzível do roteiro", e o roteiro, pelo critério 1 da etapa, inclui o passo a passo do Windows. A emenda trocou QUEM prova (agente em vez de segunda pessoa), não O QUE o roteiro precisa cobrir. Um agente lendo a frio no Git Bash, com o exemplo do documento, para no primeiro bloco.
4. "O documento é honesto: diz que Windows não rodou nesta prova": dizer que não testou não torna correta uma instrução que comprovadamente quebra. Não provado vira BLOCKED ou pendência; quebrado provado vira FAIL (seção 7 de `28`: "a prova mostrou defeito").
5. "É barato, corrige antes de crescer": o custo do conserto não mede a gravidade (texto 5). A etapa é de risco alto, o entregável é o texto, Windows é plataforma real do projeto (a prova de 2026-10-07 do próprio implementador foi no Windows 11 com Git Bash) e o critério cita o Windows nominalmente. Achado em critério nomeado da etapa não é "corrige antes de crescer".
6. Procurei decisão registrada que aceitasse o Windows fora desta versão: as premissas (a) a (f) da E25 na seção 9 do STATUS não tratam disso; não há `RISCO-ACEITO.md` na pasta da evidência.
7. Procurei se o PASS do banco refuta o achado: não refuta; o banco não executou nem leu o caminho do Windows (está no seu "Não verificado"). Não há prova contrária a pesar.

## Achados

1. **Bloqueia (critério de Documentação, passo a passo para Windows com Git Bash; reproduzido).** Passo 0, linha 115, `export PGBIN=...` sem aspas, com o exemplo `/c/Program Files/PostgreSQL/17/bin` das linhas 111 e 112: o primeiro bloco quebra em `bash` e `zsh`, e nenhuma ferramenta é encontrada. O mesmo para `TMP=` (linha 147) em pasta de usuário com espaço (`/c/Users/Nome Sobrenome/...`, comum no Windows). **Conserto mínimo (não implementado):** aspas nos dois valores do bloco (`export PGBIN="..."` e `TMP="..."`), o exemplo do Windows escrito já entre aspas, e uma frase dizendo que caminho com espaço exige aspas. A validação seguinte repete o bloco 0 com o caminho com espaço nos dois shells.
2. **Corrige junto, não decide sozinho (premissa não reproduzida; mecanismo a jusante provado).** Passos 2 e 4 leem a senha pela crase do `psql`. No Windows o `psql` nativo executa a crase pelo `_popen` do sistema, que usa o `cmd.exe`, que não expande `$DC360_SENHAS` (premissa do QA, de conhecimento do código do `psql` e da biblioteca do Windows, não executada aqui). Provei a consequência: com o caminho não expandido, o papel sai sem senha, o `psql` sai com código 0 e o login seguinte falha, ou seja, quebra calada. **Conserto mínimo:** tirar a dependência do interpretador do `psql`, fazendo o próprio shell expandir o valor (por exemplo, heredoc sem aspas com `$(cat "$TMP/.senha-setup")` no `\set`, que continua fora da linha de comando), ou provar a crase no Git Bash; ou, se o Windows ficar fora desta versão, registrar isso como emenda do critério 1 com Rafael, nunca só no texto.
3. **Anotado (hipótese, não verificada).** No Git Bash a variável `TMP` costuma vir exportada pelo perfil do sistema, apontando para a pasta temporária do usuário. Se for assim, (a) a linha `TMP=...` a exporta mesmo sem `export`, o que o próprio documento diz quebrar as ferramentas de Node; e (b) com a linha quebrada pelo achado 1, `TMP` continua sendo a pasta temporária do usuário e o `rm -rf "$TMP"` do passo 7 a apagaria. Usar um nome de variável próprio (por exemplo `PASTA_RODADA`) elimina as duas coisas; quem consertar deve conferir no Git Bash.
4. Achados 3 a 5 do QA e A1 a A3 do banco: mantenho como anotados, sem efeito no veredito.

## Não verificado

- Execução do documento num Windows com Git Bash (não há Windows nesta máquina): o achado 1 não precisa disso (gramática do shell, reproduzida); a premissa do achado 2 (o `cmd.exe` no `popen` do `psql` do Windows) e a hipótese do achado 3 (o `TMP` exportado pelo perfil do Git Bash) dependem disso.
- Linux seguindo o documento: não rodado por ninguém nesta rodada (o CI roda `ensaiar-restore.sh`, não o texto).
- O run do CI de `bb0f654`: não lido (`gh` sem login, leitura do token negada nesta sessão).
- O roteiro inteiro no macOS: não o repeti; aceito as duas execuções concordantes dos validadores, que não estão em disputa.
- `bash` 5 (o do Git Bash): não há nesta máquina; a regra de atribuição é a mesma do POSIX desde sempre.

## Risco residual

Um operador no Windows, com o PostgreSQL no caminho padrão do instalador, para no passo 0; se acertar as aspas por conta própria, provavelmente fica com papéis sem senha no passo 2 sem nenhum erro visível, e o roteiro quebra no `migrar`. Num incidente real, o restore atrasa exatamente na plataforma em que o próprio projeto fez a primeira prova. O restore como capacidade, o isolamento depois do restore e o caminho do macOS estão provados e não estão em risco.

## Motivo do humano

Ambiente externo inacessível: depois do conserto, só uma execução num Windows com Git Bash e o PostgreSQL 17 do instalador padrão (`C:\Program Files\PostgreSQL\17`) prova a premissa do achado 2 e a hipótese do achado 3, se o conserto mantiver a crase do `psql` e o nome `TMP`. Se o conserto trocar a crase por expansão do shell e a variável por um nome próprio, o que sobra é gramática de shell, verificável por agente no macOS, e o humano deixa de ser necessário para esse ponto. Não há conflito persistente que exija Rafael: a decisão sai da prova e do texto dos critérios.
