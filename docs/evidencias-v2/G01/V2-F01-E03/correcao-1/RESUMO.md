# V2-F01-E03, correção 1: o conferidor exige o comando EXECUTADO, não o texto dele

Achado: codex-f01-A item 7 (DÍVIDA).

## Fatos

- `comandosFaltando` (em `dc360/scripts/conferir-workflows.test.mjs`) procurava a forma do comando do script
  `verificar` com uma expressão `(^|[\s;&|(])<forma>` sobre o texto de todos os `run:` juntos. Um `echo npm run
  typecheck` casa (o espaço antes de `npm` serve de fronteira), então trocar a execução por um `echo` do mesmo
  texto continuava verde. A revisão reproduziu isso em memória; o caso sintético novo reproduz de novo
  (`saidas/01`: falha antes, no caso novo).
- Conserto: `comandosExecutados(linha)` separa cada linha de `run:` em comandos de verdade (separadores `&&`,
  `||`, `;`, `|`, `(`, `)`, `{`, `}`), protege antes o que está entre aspas, em `$(...)` e em crase (e o
  comentário), tira variáveis de ambiente (`CI=true`) e palavras de controle (`then`, `do`, `else`, `time`...) da
  frente de cada segmento, e só aceita a forma do comando se o SEGMENTO COMEÇAR por ela. `echo npm run X`,
  `printf "%s" "npm run X"`, `x="npm run X"`, `echo $(date) npm run X` e comentário viram segmentos que começam
  por `echo`, `printf`, `x=`... e não contam. O texto entre aspas é devolvido ao segmento depois do corte, para a
  forma `node --test "scripts/*.test.mjs"` (corpo de `test:scripts`) continuar casando com a mesma escrita.
- Casos sintéticos novos (2, a contagem de `V2-F01-E02` em `baseline.mjs` vai de 51 para 53):
  - negativo: o `echo` do comando, entre aspas, com `printf`, em atribuição, depois de `&&`/`;` e dentro de `$(...)`
    deixam o comando como FALTANDO;
  - positivo: as formas reais continuam aceitas (início de linha, encadeado, com `CI=true`, em `{ ...; } 2>&1`,
    em `( ... )`, em `if ...; then ...; fi`, com `| tee`, e o corpo do script em vez de `npm run`).
- Os workflows reais seguem verdes no conferidor: nenhum workflow real precisou mudar (`saidas/02`, 53 casos).

## Justificativa

O objetivo da E03 é que o `verificar` inteiro rode no CI. Um conferidor que aceita o texto impresso protege o
nome do comando, não a execução. Exigir o segmento de comando é a menor mudança que fecha o buraco sem depender de
um parser de shell completo; os casos sintéticos fixam as duas direções (não aceita o impresso, aceita o real).

## Limitações

- Não é um parser de shell: um comando passado a `bash -c "..."` ou `eval` não conta como executado (não há
  nenhum assim nos workflows de hoje, conferido por `grep`). Se um dia houver, o conferidor reprova e a
  mudança é conscientemente do dono do workflow.
