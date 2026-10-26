# V2-F02-E05, correção 1: fetch qualificado também é conferido

Fecha a dívida da revisão independente (Codex) dos lotes 3 e 4 sobre a parte 4A: uma chamada `globalThis.fetch(...)` dentro de arquivo de cliente já coberto escapava do extrator e do contador (`apps/api/test/apoio/extrair-chamadas.ts` excluía todo identificador precedido por ponto) e a varredura adicional (`usosDeRedeFora`) pula os arquivos cobertos. A revisão provou o furo acrescentando em memória ao texto real do painel uma chamada DELETE para `/rota-que-nao-existe`: 74 contadas, 71 extraídas, três de infraestrutura, nenhuma não lida, e a âncora continuava satisfeita. A evidência da E05 (pasta acima) fica como estava. O teste foi escrito primeiro, falhou, e só então veio o conserto.

## Fatos

1. **O defeito, reproduzido.** `saidas/01-item3-ANTES.txt`: 7 dos 8 casos novos reprovam contra o extrator antigo, entre eles o do texto real do painel com a chamada qualificada a rota inexistente acrescentada (contadas e extraídas não sobem, `faltando` não ganha a rota).
2. **O conserto no extrator e no contador** (`apps/api/test/apoio/extrair-chamadas.ts`). `globalThis.fetch(`, `window.fetch(` e `self.fetch(` (e com `?.`) são o MESMO `fetch`, só qualificado: passam a contar, a ser extraídos (método, caminho, corpo e token lidos como os de `fetch(` solto) e a ser conferidos contra o servidor. `cliente.fetch(` e `a.globalThis.fetch(` continuam de fora: método de outro objeto não é o `fetch` global. A qualificação só vale para o nome `fetch` (`globalThis.chamar` não existe). A forma por colchetes, `globalThis["fetch"](...)`, que o extrator não sabe ler, também conta e reprova como chamada não lida.
3. **A varredura dos arquivos cobertos.** Quando o perfil do arquivo NÃO declara `fetch`, nem o extrator nem a âncora enxergam a chamada, e `usosDeRedeFora` só olha arquivo não coberto. `usosDeRedeDoGlobal` (nova) acha `fetch(`, `globalThis.fetch`, `window.fetch`, `self.fetch` e a forma por colchetes, e um caso novo percorre todo arquivo coberto cujo perfil não declara `fetch` e reprova qualquer uso. A árvore real passa (zero achados nos três clientes).
4. **Testes** (`apps/api/test/contrato-cliente-rota.test.ts`, de 82 para 90 casos, `baseline.mjs` ganhou `V2-F02-E05-correcao-1`, api +8): as três formas qualificadas (certa, inexistente e fora da base, 3 casos), o texto real do painel com a chamada acrescentada, o colchete, `cliente.fetch` que não conta, a função `usosDeRedeDoGlobal` e a varredura dos arquivos cobertos. `contrato-do-painel.test.ts` e `superficie.test.ts`, que também usam o extrator, seguem verdes (111 de 111 nas três suítes). README e `COLOCAR-DE-PE.md` ajustados.

## Limites declarados

- Continua fora do alcance, como antes: `fetch` guardado em variável e chamado depois (`const f = fetch; f(...)`), o global alcançado por nome computado e rede por outro mecanismo que não `fetch`, `XMLHttpRequest`, `sendBeacon` ou `axios`. A varredura por texto é uma rede, não uma prova de que nenhum cliente fale com a API por fora.
- A varredura dos arquivos cobertos sem `fetch` no perfil olha só `fetch`; `XMLHttpRequest` em arquivo coberto segue como estava.

## Provas (em `saidas/`)

`01-item3-ANTES.txt` (7 reprovam de 90), `02-item3-DEPOIS.txt` (`contrato-cliente-rota`, `contrato-do-painel` e `superficie`: 111 de 111). Os portões gerais da correção estão em `V2-F02-E04-parte-4B/correcao-1/saidas/`.

## Para o orquestrador

- Dívida paga: a de E05 (`fetch` qualificado em arquivo coberto). Fica registrado o limite da varredura por texto acima.
- Pendência humana: nenhuma.
