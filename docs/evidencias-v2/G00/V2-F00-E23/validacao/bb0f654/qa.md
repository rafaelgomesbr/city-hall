---
validador: qa (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E23
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: []
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---

Pasta das saídas (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/qa-lote2/` (abaixo, `SAIDAS/`).

Comando base: `cd dc360 && npx vitest run --root apps/api test/contrato-do-painel.test.ts`.

## Critérios verificados

| Critério | Resultado | Prova |
| --- | --- | --- |
| Teste verde na árvore atual | PASS | 12 de 12, código 0 (`e23-01`); também dentro de `test:api` na linha de base |
| `/pacote.zip` reintroduzido no arquivo real reprova | PASS | `apps/web/src/dados/http.ts:1106` com `"/pacote.zip"`: 1 falha, mensagem `POST /pacote.zip (http.ts linha 1106)` (`e23-02`) |
| Método errado reprova | PASS | mesma linha com `metodo: "GET"`: 1 falha, `GET /saida/pacote.zip` (`e23-03`) |
| Âncora: extrator que perde chamada reprova | PASS | caminho trocado por uma variável: 3 falhas, entre elas "âncora: a extração alcança todas as chamadas contadas" (`e23-04`) |
| Chamada sem token fora das isenções reprova | PASS | `semSessao: true` acrescentado ao pacote: 1 falha em "o que o painel chama sem token está nas isenções" (`e23-05`) |
| Caminho com parâmetro faltando reprova | PASS (caso sintético do próprio teste, verde) | |
| Nota no README (versão mínima, F02-E05 generaliza) | PASS | `dc360/README.md:1174-1184` |
| Regressão `test:api` e painel | PASS | linha de base: API só com a falha de máquina do LibreSSL; `superficie.test.ts` 9 de 9; painel 665 de 665 |
| `INDEX.md` byte a byte | PASS | raiz 23 de 23 e `saidas/baseline/INDEX.md` 8 de 8 |

## Evidência

`SAIDAS/e23-01` a `e23-05`. SHA-256 de `http.ts` antes e depois das mutações iguais (`e23-sha-antes.txt`, `e23-sha-depois.txt`); cada mutação desfeita com `git restore`.

## Cenários positivos

Todas as chamadas atuais de `http.ts` casam com rota registrada.

## Cenários negativos

Os quatro plantios no arquivo real reprovam, cada um no caso certo.

## Tentativas de reprovar

1. Procurei chamada de rede fora de `http.ts` no painel (que escaparia do contrato por desenho): `grep` por `fetch(`, `chamar(`, `sendBeacon`, `XMLHttpRequest`, `EventSource` e `WebSocket` em `apps/web/src` fora de `dados/http.ts`: nenhuma.
2. Escondi o caminho atrás de uma variável para tentar enganar o extrator: a âncora reprova.
3. Marquei uma rota protegida como sem token: reprova.

## Achados

Nenhum.

## Não verificado

- Corpo e resposta, campo e console: fora da etapa (F02-E04, F02-E05).

## Risco residual

Baixo.

## Motivo do humano

Nenhum: o "Rafael vê o teste reprovar com `/pacote.zip`" foi substituído pelo plantio no arquivo real, executado aqui.
