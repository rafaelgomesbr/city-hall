# V2-F03-E08 (parte 0G), correção 2: a prova de `some` exige linha exclusiva, e a prova da recusa fora da tabela usa linha real semeada e UPDATE com mudança efetiva

Ramo `trab/f03-juncao-lote1b`, base `42c009a3` (a 0G com a correção 1 juntada no `v2/f03`). Risco CRÍTICO: é o portão da regra número um. Implementador: Claude Opus 5.5, como integrador do lote 1 da F03, por pedido do orquestrador depois da revisão independente (Codex, somente leitura) da correção 1.

## Fatos

**Ponto de partida.** A revisão da correção 1 confirmou FECHADOS os itens 1 a 5, 7 e 8 da auditoria de cobertura e PARCIAL o 6, e apontou:

1. BLOQUEIA (regressão frente a `22167a50`): na prova de `some`, o conjunto `exclusivas` (as chaves do município eliminado que não aparecem no outro) podia ficar vazio. Com `linhasDoMunicipio` devolvendo as mesmas chaves para os dois municípios, tudo virava compartilhado, a contagem do que some era sobre um conjunto vazio e uma tabela declarada `some` cuja limpeza nunca acontece passava.
2. DÍVIDA (item 6): com a tabela do gatilho vazia, a prova da recusa fora da tabela só tinha a linha nula, e uma escrita chaveada por `NEW` feita antes da recusa não mudava linha nenhuma e passava; e o UPDATE da prova era `SET coluna = coluna`, então uma escrita condicionada a `NEW` diferente de `OLD`, antes da recusa, passava mesmo com linha real.
3. DÍVIDA: a proibição de colunas presa ao número da migração 061.

**O que mudou (só `dc360/db/test/`, mais as contagens):**

- `catalogo/conferir.ts`, `provarDestinoNaCopia`: com destino `some`, sem nenhuma chave EXCLUSIVA do município eliminado a prova reprova ("nenhuma das N chave(s) que linhasDoMunicipio devolve para o município eliminado é EXCLUSIVA dele"). `fica` não muda (não exige exclusiva).
- `catalogo/tipos.ts`: `FuncaoPrivilegiada.semearParaProva` (opcional no tipo): SQL com `:org`, rodado como dono dentro da transação desfeita da prova, que põe pelo menos uma linha real em cada tabela de `gatilhoEm` pelo caminho de produção (com os gatilhos reais disparando, e por isso com as chaves ancoradas nas tabelas que a função alcança).
- `catalogo/conferir.ts`, `provarRecusaForaDaTabela(db, funcoes = [])`: com o catálogo, a função que declara `semearParaProva` tem um município criado e a semeadura rodada em cada variante; a variante com linha real passa a existir também quando a tabela estava vazia; semeadura que não põe linha reprova ("semearParaProva não pôs nenhuma linha"). O UPDATE da prova muda de verdade TODAS as colunas: na variante nula, da linha nula para a cópia de uma linha real (`UPDATE ... FROM (SELECT * FROM public.<tabela> LIMIT 1)`); na variante real, da linha real para a nula. Sem linha real disponível (sonda sem catálogo e tabela vazia), fica o UPDATE de antes.
- `catalogo/conferir.ts`, `conferirDeclaracoesCompletas(excecoes, chaves, funcoes = [])`: toda função de gatilho privilegiada (com `gatilhoEm`) do catálogo juntado declara `semearParaProva` com `:org`.
- `isolamento.test.ts`: os dois casos que já existiam passam o catálogo (`FUNCOES_PRIVILEGIADAS`) a `provarRecusaForaDaTabela` e a `conferirDeclaracoesCompletas`. Nenhum caso novo, nenhum caso tirado.
- `catalogo-nominal.test.ts`: 8 casos novos, a sonda 23 (3) e a sonda 24 (5). Nenhum caso existente mudou.
- `scripts/baseline.mjs` (chave `V2-F03-E08-parte-0G-correcao-2`, 8), `README.md` (703 para 711 no banco; 4909 para 4917 em `npm test`), `docs/COLOCAR-DE-PE.md` (6932 para 6940).

**Sabotagens (as sondas novas rodadas contra o portão de antes e o desta correção; saídas inteiras em `sabotagens/`):**

| Sonda e caso | O que faz | Antes (`42c009a3`) | Depois |
| --- | --- | --- | --- |
| 23.1 | `some` com `linhasDoMunicipio` que ignora `:org` (as mesmas chaves para os dois municípios) e limpeza que nunca acontece | PASSA (devolve `[]`) | reprova: "nenhuma das 2 chave(s) ... é EXCLUSIVA dele" |
| 23.2 | a mesma consulta, com a limpeza de verdade | reprova por outro motivo ("mexeu em sonda_marcas fora dele") | reprova: sem linha exclusiva não há o que provar |
| 23.3 (controle) | consulta pelo município e limpeza de verdade (`some`); e `fica` com a consulta que ignora `:org` | passa | passa |
| 24.1 | tabela vazia e `UPDATE cofre ... WHERE quem = NEW.nome` antes da recusa, com `semearParaProva` | PASSA (só a linha nula) | reprova: "(INSERT, com uma linha real de public."sonda_alvo"), a função ESCREVEU antes de recusar (public.sonda_cofre)" |
| 24.2 | gatilho de UPDATE com escrita só quando `NEW IS DISTINCT FROM OLD`, antes da recusa, com linha real | PASSA (`SET coluna = coluna`) | reprova nas duas variantes (UPDATE da nula para a real e da real para a nula) |
| 24.3 (controle) | recusa por `TG_RELID` antes de tudo, com semeadura e gatilhos de INSERT e UPDATE | passa | passa |
| 24.4 | `semearParaProva` que não põe linha | passa | reprova: "semearParaProva não pôs nenhuma linha" |
| 24.5 | função de gatilho privilegiada sem `semearParaProva` (ou sem `:org`) na declaração completa | passa | reprova |

Antes: 6 dos 8 casos vermelhos (`sabotagens/antes-42c009a3.txt`; o vermelho é o portão de antes deixando a abertura passar, ou reprovando pelo motivo errado). Depois: 8 de 8 verdes (`sabotagens/depois.txt`). `isolamento.test.ts` e `catalogo-nominal.test.ts` inteiros com esta correção: 310 de 310 (`saidas/01`). Os portões inteiros rodaram depois das três junções do lote (ver o RESUMO da junção no STATUS e as saídas da junção da E15).

## Justificativa

- **Linha exclusiva só para `some`.** `fica` prova que as linhas do município eliminado continuam lá, e a compartilhada também fica; não há o que esconder num conjunto exclusivo vazio. `some` prova um desaparecimento, e um desaparecimento sobre um conjunto vazio é sempre verdadeiro.
- **A semeadura declarada, e não inventada pelo portão.** O portão não sabe montar uma linha válida de uma tabela qualquer (chaves, CHECKs, gatilhos). Quem declara a função de gatilho sabe, e a semeadura pelo caminho de produção põe as chaves nas tabelas que a função pode alcançar. Por isso a declaração é obrigatória no catálogo juntado e opcional no tipo (as sondas antigas não mudam).
- **UPDATE em todas as colunas.** Um gatilho `UPDATE OF` dispara quando a coluna está na lista do SET; mudar todas as colunas cobre qualquer `UPDATE OF` e qualquer condição sobre `NEW` e `OLD`. As duas direções (nula para real, real para nula) põem a chave real tanto em `NEW` quanto em `OLD`.

## Limitações

- A semeadura roda numa transação desfeita, com os gatilhos reais. Efeito não transacional (`NOTIFY`, trava consultiva) continua fora do que a prova vê, como na correção 1.
- A proibição de colunas continua presa ao número 061 (item 3): registrada como dívida da E08 em `docs/roadmap-v2/dividas.md`.

## Para o orquestrador

- **Linha do STATUS:** a 0G (correção 1 e correção 2) juntada no `v2/f03` pelo integrador do lote 1; continua IMPLEMENTADA, falta validação.
- **Dívidas pagas:** o item 1 da revisão (regressão de `exclusivas`) e as duas dívidas do item 6 (linha nula com a tabela vazia; UPDATE sem mudança). **Dívida que fica:** a proibição presa à 061 (E08).
- **A 1B passa a declarar `semearParaProva`** nas duas funções de gatilho privilegiadas (feito na junção da E15).
