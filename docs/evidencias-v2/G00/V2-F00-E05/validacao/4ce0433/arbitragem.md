---
validador: arbitragem
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

Arbitragem (seção 7 de `docs/roadmap-v2/28-execucao-e-validacao.md`) entre `red-team.md` (FAIL) e `seguranca-aplicacao.md` (FAIL) contra `qa.md` (PASS), nesta pasta. Os três concordam nos fatos; a disputa é se o texto escrito pela etapa é verdadeiro. Reproduzi as formas eu mesmo, num worktree meu destacado em `4ce0433` (`$A/wt`, onde `$A` é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/A03-arbitragem`), `node_modules` por link, nunca na árvore principal.

Critério em disputa, do bloco da etapa: teste negativo "código fora do catálogo reprova o teste de catálogo", lido junto com o "Motivo do veredito" da rodada 4, cujo conserto mínimo era "o teste de catálogo varrer toda resposta de erro do servidor ... ou o README e o cabeçalho dizerem exatamente o que o teste prende".

O texto exato no SHA:

- `dc360/README.md:156-157`: a varredura "Lê `send({ erro })` literal ou por constante".
- `dc360/README.md:161-165`: "O que ela não consegue ler, ela reprova: `.code(...)` fora de uma cadeia com `send`, ... `statusCode`/`status` escritos à mão (propriedade, chave computada, colchete, `Object.defineProperty`)".
- `dc360/packages/shared/src/codigos-de-erro.ts:44-50`: "O que a varredura NÃO consegue ler, ela REPROVA em vez de deixar passar: `.code(...)` ou `.status(...)` fora de uma cadeia com `send` ... `statusCode` ou `status` escritos à mão por qualquer forma (propriedade, ...)".
- `dc360/apps/api/test/codigos-de-erro.test.ts:38`: a varredura "lê TODAS as formas de emitir erro".
- A exceção declarada (`README.md:209-212`): "O que NENHUM deles prende: uma recusa que só sai com um corpo ou um estado que os perfis da prova dinâmica não criam E que o texto esconde (código montado por dado externo, classe definida fora das pastas varridas, `Object.assign` num erro, resposta de um plugin de terceiros)".

| Item | Resultado | Prova |
| --- | --- | --- |
| Varredura no SHA sem mutação | verde, 116 de 116 | `npx vitest run test/codigos-de-erro.test.ts` no worktree, código 0 |
| Controle M0: `resposta.code(403).send({ erro: "arb_literal" })` | reprova (14 falhas, "código `arb_literal` (send, status 403) ... fora do catálogo") | `$A/saidas/e05-M0.txt` |
| M1 constante com `erro` mutado depois | varredura VERDE, servidor responde `403 {"erro":"arb_ponto"}` | `$A/saidas/e05-M1_constante_mutada.txt` |
| M2 `let` reatribuído antes do `send` | VERDE, `403 {"erro":"arb_let"}` | `$A/saidas/e05-M2_let_reatribuido.txt` |
| M3 `resposta["code"](403)["send"]({ erro })` | VERDE, `403 {"erro":"arb_colchete"}` | `$A/saidas/e05-M3_colchete.txt` |
| M4 `const corpoArb` homônima em outra função do mesmo arquivo | VERDE, `403 {"erro":"arb_homonimo"}` | `$A/saidas/e05-M4_homonimo.txt` |
| M5 `const statusCode = 403; throw { statusCode, code: "FST_ERR_CTP_..." }` | VERDE, `403 {"erro":"corpo_invalido"}` (fora do catálogo e da entrada) | `$A/saidas/e05-M5_statusCode_abreviado.txt` |
| M6 `resposta.code.call(resposta, 403); return { erro }` | VERDE, `403 {"erro":"arb_call"}` | `$A/saidas/e05-M6_code_call.txt` |

Em todas: `tsc --noEmit` código 0, prova dinâmica código 0, arquivo restaurado e conferido ("restaurado: true").

## Evidência

- Roteiro: `$A/scripts/mutar.mjs` planta UMA forma no começo do handler de `GET /saude` (`src/servidor.ts` do worktree), atrás do cabeçalho `x-arbitro` (que a prova dinâmica não manda, isto é, "um estado que os perfis não criam"), roda `tsc`, `codigos-de-erro.test.ts`, `prova-dinamica-dos-codigos-de-erro.test.ts` e uma sonda de execução (`$A/scripts/zz-arbitro-sonda.test.ts`, copiado para o worktree só durante a execução: `construirServidor` sobre PGlite e `app.inject` com o cabeçalho), e restaura o arquivo.
- Saídas: `$A/saidas/e05-M0.txt` a `$A/saidas/e05-M6_code_call.txt`, cada uma com o trecho plantado, os quatro códigos de saída e o corpo real.
- Relatórios em disputa lidos: `red-team.md` (formas A, B, C, N), `seguranca-aplicacao.md` (V1 a V7), `qa.md` (E1 a E4, mais nove formas que mordem). As minhas seis reproduções coincidem com as deles.

## Cenários positivos

- O produto no SHA não emite hoje nenhum 401 ou 403 fora do catálogo: os três validadores concordam (sonda dinâmica com corpos de Segurança, 2064 pedidos; busca das formas cegas no fonte real por Red-team, Segurança e QA, nenhuma ocorrência). Não reexecutei essas sondas; a disputa não está aí.
- As formas diretas mordem (meu controle M0; S1 a S7 do QA; C1 a C4 da Segurança; as duas mutações da rodada 4 no Red-team). Os quatro códigos que a rodada 4 achou fora da lista estão no catálogo.

## Cenários negativos

- Seis formas comuns de TypeScript, todas compiláveis, emitem 403 com código fora do catálogo e deixam a varredura e a prova dinâmica verdes (tabela acima).
- Isolamento e entrada genérica: os três validadores mostram verde (casos do arquivo de catálogo, sonda de oráculo do Red-team, 1560 pedidos sem diferença entre id real e aleatório). Não está em disputa.

## Tentativas de reprovar

1. Tentei reprovar a leitura do QA: se as seis formas cabem na exceção declarada. Não cabem. A exceção exige que o texto ESCONDA o código e dá exemplos de outra natureza (dado externo, classe fora das pastas, `Object.assign`, plugin de terceiros). Em M1 a M4 e M6 o código está como literal no próprio arquivo varrido; em M5 o `statusCode` está escrito à mão. E três dessas formas estão nominalmente na lista do que a varredura "reprova": `.code(...)` fora de cadeia com `send` (M3, M6), `statusCode` escrito à mão "por qualquer forma (propriedade, ...)" (M5, propriedade abreviada). M1, M2 e M4 desmentem "lê `send({ erro })` ... por constante": a varredura lê a constante errado e aprova.
2. Tentei reprovar a leitura de Red-team e Segurança: se o teste negativo da etapa exige uma varredura completa, o que nenhum leitor estático entrega. Não exige: a rodada 4 aceitou como conserto mínimo o texto dizer exatamente o que o teste prende. O FAIL aqui não é por a varredura ter lacuna; é por o README e os dois cabeçalhos afirmarem, como regra geral, que o que ela não lê ela reprova, e que ela lê todas as formas, e isso ser falso em código comum, o mesmo defeito que reprovou a rodada 4 ("teste que não morde código novo e o README o promete").
3. Conferi se o defeito é só de texto e de guarda, sem resposta errada ao cliente hoje: é (ver Cenários positivos). Isso não absolve: o critério negativo da etapa é sobre a guarda contra código novo, não sobre o código de hoje.

## Achados

**Decisão: FAIL.** Os relatórios de Red-team e Segurança estão certos; o PASS do QA não se sustenta porque o próprio QA registra que duas frases ficam "inexatas" e enquadra as formas numa exceção que, pelo texto, não as cobre.

Por quê: o critério negativo "código fora do catálogo reprova o teste de catálogo" foi consertado na rodada 4 sob a condição de o texto dizer exatamente o que o teste prende. No SHA, `README.md:161`, `codigos-de-erro.ts:44-50` e `codigos-de-erro.test.ts:38` prometem que o que a varredura não lê ela reprova, que ela lê todas as formas e que `statusCode` escrito à mão por qualquer forma e `.code(...)` fora de cadeia reprovam. Seis reproduções minhas (M1 a M6) desmentem a promessa com 403 real de código novo e as duas guardas verdes.

Conserto mínimo (qualquer um dos dois basta):

- a varredura (`apps/api/test/varredura-de-erros.ts`) reprovar: atribuição a `X.erro` (como já faz com `.codigo`); corpo de `send` vindo de `let`, de parâmetro, ou de nome com mais de uma declaração no arquivo (ou resolver pelo escopo, com `resolverDeclaracao`); acesso por colchete a `code`, `status` e `send` da resposta e `.code`/`.status` usados sem chamada direta (`.call`, `.apply`, `.bind`); `statusCode`/`status` em propriedade abreviada; com um caso de mordida para cada forma; ou
- o README (seção "Códigos de erro de acesso") e os cabeçalhos de `packages/shared/src/codigos-de-erro.ts` e `apps/api/test/codigos-de-erro.test.ts` retirarem as frases absolutas ("o que não consegue ler, reprova", "lê TODAS as formas", "por qualquer forma") e listarem estas lacunas no parágrafo "O que NENHUM deles prende".

Achados herdados, sem mudança: frase do 401 de `/auth/renovar` diferente da do catálogo (anotado, QA A2).

Itens do "Motivo do veredito" da rodada 4: (1) os quatro códigos fora do catálogo: consertado; (2) teste que não morde `send({erro})` e `RegraDeNegocio` 403: consertado nas formas diretas; (3) README e cabeçalho prometendo mais do que o teste prende: NÃO consertado (M1 a M6).

## Não verificado

- Não reexecutei a regressão completa, o e2e da seção 23 nem as sondas de oráculo e de corpos: os três relatórios concordam nesses pontos e eles não decidem a disputa.
- Não plantei formas no console do fornecedor; a varredura é a mesma função (Segurança e Red-team anotam o mesmo).
- CI do SHA: ausente nesta sessão.

## Risco residual

Nenhuma resposta de acesso sai hoje fora do catálogo. Uma rota nova que monte o corpo por constante mutada, `let`, homônimo, colchete ou `.code.call` passa pelas duas guardas e chega ao cliente como erro comum (ação `nenhuma`), enquanto o README diz a quem mantém que isso seria reprovado.

## Motivo do humano

A validação humana da etapa continua pendente: Rafael ler e aprovar as três frases mostradas na tela de entrada (conteúdo de produto). Não muda o FAIL.
