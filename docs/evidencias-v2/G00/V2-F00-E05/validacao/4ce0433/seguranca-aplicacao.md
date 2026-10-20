---
validador: seguranca-aplicacao
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Validação sobre um worktree esparso do validador no SHA `4ce0433` (`git worktree add --detach`, `node_modules` por link para a árvore principal), nunca na árvore principal.

- **Os três códigos emitidos e testados; catálogo no shared; nenhuma ocorrência de `sessao` como código** (DoD): `npx vitest run test/codigos-de-erro.test.ts` em `apps/api`, 116 de 116, código 0 (`saidas/e05-00-base-codigos.txt`). Inclui `nao_autenticado`, `sessao_encerrada`, `conta_desativada` por requisição, a entrada genérica, o par de isolamento e o caso "ninguém escreve `erro: \"sessao\"`". PASS.
- **Toda resposta 401 ou 403 do servidor real sai com código do catálogo** (comportamento do produto no SHA): cópia da prova dinâmica que grava cada corpo (`saidas/e05-01-prova-dinamica-com-dump.txt`, `saidas/e05-dump.json`, `saidas/e05-02-analise-do-dump.txt`): 2064 pedidos, 608 respostas 401 e 606 respostas 403, todas com `erro` do catálogo ou da entrada (o teste passou, código 0). Busca no fonte real pelas formas que a guarda não lê (abaixo): nenhuma ocorrência hoje. PASS para o produto.
- **Nada vaza detalhe interno**: nos 2064 corpos, zero com pilha, SQL, caminho de arquivo, `node_modules`, `pglite`, `violat`, `duplicate key` ou `FST_ERR`; os 74 5xx são 503 nomeados (`acesso_suspenso` na fila, `push_desligado`). PASS.
- **Recurso de outro município responde 404, nunca 403**: o coordenador de Vale Fundo em URL com id de ocorrência de Serra Alta recebeu só 404 (3) e 422 (12, validação do corpo antes da consulta, igual ao dono); os 16 403 `sem_permissao` dele saem também para o coordenador do próprio município na mesma rota e corpo (recusa por papel, não por recurso). PASS.
- **Teste negativo da etapa: "código fora do catálogo reprova o teste de catálogo"**, e a promessa do README e dos cabeçalhos de `packages/shared/src/codigos-de-erro.ts` e `apps/api/test/codigos-de-erro.test.ts`: FAIL. Sete formas comuns de TypeScript, todas com `tsc --noEmit` código 0, emitem 403 com código novo de verdade e deixam a varredura verde; a prova dinâmica também fica verde (detalhe em Achados).

## Evidência

Saídas no scratchpad do validador, `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L12-seguranca/saidas/`:

- `e05-00-base-codigos.txt`: `npx vitest run test/codigos-de-erro.test.ts`, 116 aprovados, código 0.
- `e05-variantes/RESUMO.txt`: a varredura (`-t "toda resposta 401 ou 403 da API"`) mais `tsc -p tsconfig.json --noEmit` para cada variante plantada no começo do handler de `/saude` de `src/servidor.ts`, guardada pelo cabeçalho `x-sonda-validador`. Um arquivo `.varredura.txt` por variante com o trecho, a saída do vitest e a do tsc. O RESUMO tem uma linha velha da V3 (com 401, reprovada pelo status 401 do `sem_permissao`, não pelo código); a linha final da V3, com 403, é a válida.
- `e05-variantes/RESUMO-execucao.txt` e `*.execucao.txt`: a mesma variante plantada, o servidor real montado (`construirServidor` sobre PGlite) e `GET /saude` com o cabeçalho, por `app.inject`: status e corpo de verdade.
- `e05-variantes/V1-mesmo-nome-de-constante-em-dois-blocos.dinamica.txt`: `prova-dinamica-dos-codigos-de-erro.test.ts` com a variante V1 plantada, código 0.
- Roteiros: `../sonda/variantes.mjs`, `../sonda/rodar.mjs`, `../sonda/rodar-execucao.mjs`, `../sonda/zz-sonda-validador.test.ts`. Depois de cada variante o `servidor.ts` do worktree é restaurado e conferido byte a byte ("restaurado: true").

## Cenários positivos

- Os dez códigos do catálogo saem do servidor real com o status do catálogo (casos de execução do arquivo de teste, 116 de 116).
- Controles de mordida da varredura, cada um REPROVADO como deve: C1 `resposta.code(403).send({ erro: "sonda_nova" })` (mensagem: "código `sonda_nova` (send, status 403) em resposta de acesso e fora do catálogo"); C2 `throw new RegraDeNegocio("sonda_nova", "x", 403)`; C3 status por constante local; C4 `resposta.code(401)` solto e `return { erro }`.
- As quatro recusas que a rodada 4 achou fora da lista (`posto_insuficiente`, `posto_insuficiente_para_dado_pessoal`, `email_so_por_administrador`, `assinatura`) estão no catálogo e têm caso de execução.

## Cenários negativos

- Conta desativada do município A escrevendo em ocorrência do B: mesma resposta que na própria e numa inexistente (caso do arquivo de teste, verde).
- Coordenador do B em recurso do A: 404 ou 422, nunca 403 (dump da prova dinâmica).
- `/auth/entrar` com conta desativada e senha certa: mesma recusa da senha errada e do e-mail inexistente (verde).
- Token lixo, vencido, de outra assinatura e sem token: só `nao_autenticado` (dump).

## Tentativas de reprovar

Variantes de rota que emitem 403 com o código novo `sonda_nova`, por formas de TypeScript comum. Resultado da varredura e da execução real:

| Variante | Forma | Varredura | Resposta real |
| --- | --- | --- | --- |
| V1 | dois blocos com `const corpoS = { erro: ... }` de mesmo nome; o primeiro `send(corpoS)` com `sonda_nova` | VERDE | 403 `sonda_nova` |
| V2 | `const recusaS = { erro: "sem_permissao" }; recusaS.erro = "sonda_nova"; send(recusaS)` | VERDE | 403 `sonda_nova` |
| V3 | auxiliar `(r, corpoR) => r.code(403).send(corpoR)` com um `const corpoR` homônimo no escopo de fora | VERDE | 403 `sonda_nova` |
| V4 | `let corpoL = { erro: "sem_permissao" }; corpoL = { erro: "sonda_nova" }; send(corpoL)` | VERDE | 403 `sonda_nova` |
| V5 | `resposta["code"](403); return { erro: "sonda_nova" }` | VERDE | 403 `sonda_nova` |
| V6 | `resposta.code.call(resposta, 403); return { erro: "sonda_nova" }` | VERDE | 403 `sonda_nova` |
| V7 | `const st: number = 403; resposta.code(st).send({ codigo: "sonda_nova" })` (403 sem `erro`) | VERDE | 403 sem `erro` |

As sete compilam (`tsc` código 0). Com a V1 plantada, a prova dinâmica inteira também passa (código 0), porque nenhum perfil cria o estado que leva à recusa: exatamente a combinação que o texto diz que a varredura cobre.

Causa, lida em `apps/api/test/varredura-de-erros.ts`: `coletar` guarda as constantes de corpo num mapa por NOME para o arquivo inteiro (a última declaração vence, sem escopo, e `let` reatribuído ou objeto mutado depois não são vistos); atribuição a `x.erro` por ponto não vira problema (só `.codigo` e `["erro"]`); `orfaos` só reconhece `.code(...)`/`.status(...)` por acesso com ponto, então colchete e `.call` passam; e corpo com objeto literal sem `erro` só reprova quando o status é o literal 401 ou 403.

Também tentei, sem sucesso (a guarda pegou ou o caminho não existe): busca no fonte real da API, do shared e do console por `["code"]`, `.code.call/apply/bind`, `.erro =` e constantes de corpo homônimas: nenhuma ocorrência; `RECUSA` e `RESPOSTA_*` têm uma declaração por arquivo.

## Achados

1. **bloqueia.** A guarda promete mais do que prende, o mesmo defeito que reprovou a rodada 4. `dc360/README.md:150` diz "toda resposta 401 ou 403 do servidor tem código nele", `:156-157` diz que a varredura "Lê `send({ erro })` literal ou por constante" e `:161-162` que reprova "`.code(...)` fora de uma cadeia com `send`"; o cabeçalho de `packages/shared/src/codigos-de-erro.ts` (linhas 33 a 61) repete isso e diz (linha 44) que "O que a varredura NÃO consegue ler, ela REPROVA em vez de deixar passar"; o cabeçalho de `apps/api/test/codigos-de-erro.test.ts` (linha 38) diz que ela "lê TODAS as formas de emitir erro". Nenhuma das sete variantes está na lista do que "NENHUM deles prende" (dado externo, classe fora das pastas, `Object.assign` num erro, plugin de terceiros). Reprodução: `node sonda/rodar.mjs <worktree>/dc360/apps/api <saida>` e `node sonda/rodar-execucao.mjs ...` (scripts citados acima). Conserto mínimo: a varredura resolver a constante pelo escopo (ou reprovar `send(identificador)` em resposta de acesso quando o nome tem mais de uma declaração, é `let`, é parâmetro ou tem `.erro` atribuído), reprovar `["code"]`/`["status"]` e `.code.call/apply/bind`, e reprovar corpo sem `erro` com status não resolvido; ou o README e os dois cabeçalhos dizerem exatamente essas exceções.
2. **anotado.** O produto no SHA não emite hoje nenhum 401 ou 403 fora do catálogo (prova dinâmica com corpos, 2064 pedidos, e busca no fonte). O defeito é a guarda contra código novo, que é o que o critério negativo da etapa pede.

## Não verificado

- O E2E de navegador da seção 23 de `fluxo-api.e2e.mjs` e as capturas das três frases: são de QA e UX; esta dimensão não os rodou.
- O console do fornecedor só pela varredura existente (verde no teste base); não plantei variantes nele. As mesmas falhas de mecanismo valem lá, porque é a mesma função.
- Aplicativo de campo e painel lendo os códigos: não exercitados aqui (fora da dimensão; são da E06 e dos testes de cliente).

## Risco residual

Uma rota nova que recuse com código novo por qualquer das sete formas, num estado que os 12 perfis da prova dinâmica não criam (a prova declara que 66 de 114 rotas nunca chegam a 2xx), passa pelas duas linhas da guarda. O cliente leria o código desconhecido como erro comum: no aparelho, recusa permanente do item; no painel, erro genérico. Não há vazamento de dado de outro município por esse caminho, mas o contrato que a etapa vende ("código fora do catálogo reprova o teste") não se sustenta, e o README orienta quem mantém a acreditar nisso.

## Motivo do humano

Rafael ainda precisa ler e aprovar as três frases mostradas ao usuário (validação humana da etapa, conteúdo de produto). Não é desta dimensão, e não muda o FAIL acima.

Itens do "Motivo do veredito" da rodada 4:

- "403 `posto_insuficiente` e outros três fora do catálogo": CONSERTADO. Os quatro estão no catálogo com status 403 e casos de execução verdes (`e05-00`); a prova dinâmica com corpos não achou nenhum 401 ou 403 fora da lista (`e05-02`).
- "o teste de catálogo não morde código novo em `send({erro})` e em `RegraDeNegocio`": CONSERTADO para as formas diretas (controles C1 a C4 reprovam), NÃO CONSERTADO no geral: sete formas comuns passam (V1 a V7).
- "README:146 e o cabeçalho prometem mais do que o teste prende": NÃO CONSERTADO. O texto novo promete ainda mais (lista longa de formas "lidas" e "reprovadas"), e quatro dessas promessas são desmentidas por execução (V1, V2, V4 por constante; V5, V6 por `.code(...)` fora de cadeia; V7 contra "toda resposta").
