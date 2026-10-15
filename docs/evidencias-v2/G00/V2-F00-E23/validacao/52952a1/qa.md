---
validador: qa (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E23
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [API, TESTE]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
Veredito: PASS. O teste de contrato está verde na árvore, reprova com `/pacote.zip` plantado em `http.ts`, reprova com método errado e com `fetch` para rota inexistente, e a âncora de contagem está ativa. Confiança média porque achei duas formas novas de falso verde (método vindo de variável e caminho montado por concatenação), além do alias já anotado na rodada 2: cabem na limitação declarada da versão mínima e não violam a DoD, mas são exatamente o risco que a etapa nomeia.

Saídas em `$SP/val/qa/painel/` (abaixo, `painel/`).

## Critérios verificados

| # | Critério | Resultado e prova |
| --- | --- | --- |
| 1 | Teste verde na árvore atual | PASS. `contrato-do-painel.test.ts` 12 de 12 dentro de `npm run test:api` (`painel/06-test-api.txt`) e sozinho no plantio de controle P0 (`painel/35-e23-plantios.txt`) |
| 2 | O caso `/pacote.zip` reprova | PASS. Plantio P1 (`chamar<Blob>("/pacote.zip", ...)` em `baixarPacoteDeSaida`): 1 falha, "POST /pacote.zip (http.ts linha 1106)" |
| 3 | Método errado reprova | PASS. Plantio P6 (`metodo: "PUT"` na rota do pacote): 1 falha. Também o caso sintético do arquivo |
| 4 | Chamada direta por `fetch` a rota inexistente reprova | PASS. Plantio P5 (`fetch(\`${BASE}/inexistente-qa\`, { method: "POST", ... })`): 1 falha |
| 5 | Parâmetro faltando e extrator que perde chamada reprovam | PASS pelos casos sintéticos do arquivo, verdes (eles afirmam a reprovação) |
| 6 | Âncora ativa | PASS. Conta 70 ou mais chamadas e exige extraídas mais infraestrutura igual à contagem; o caso "extrator que perde uma chamada" passa |
| 7 | Sem token só nas isenções de `superficie.test.ts` | PASS (caso do arquivo verde; `superficie.test.ts` 9 de 9) |
| 8 | Rodada 2: alias de `chamar` escapa | AINDA MORDE. Plantio P2 (`const c2 = chamar; c2("/rota-que-nao-existe-qa")`): verde, a âncora não conta `c2(` |
| 9 | Toda chamada ao servidor está em `http.ts` | PASS. Nenhum `fetch(`, `XMLHttpRequest` ou `sendBeacon` em `apps/web/src` fora de `dados/http.ts` |

## Evidência

- `painel/35-e23-plantios.txt`: para cada plantio, o diff aplicado, a saída de `npx vitest run test/contrato-do-painel.test.ts` e `git status` vazio depois de `git restore` (P0 controle verde; P1, P5 e P6 vermelhos; P2, P3 e P4 verdes).
- `painel/06-test-api.txt` (código 1 só pela falha alheia do openssl do macOS).

## Cenários positivos

Árvore atual: todas as chamadas casam com rota registrada; tipos de documento expandidos.

## Cenários negativos

P1, P5 e P6 reprovam como devem.

## Tentativas de reprovar

1. Alias de `chamar` (P2): falso verde (já anotado na rodada 2).
2. Opções em variável com `metodo: "DELETE"` (P3, `chamar("/usuarios", opcoesQa)`): o extrator não vê `metodo` no texto, assume GET, e `GET /usuarios` existe; a API não tem `DELETE /usuarios`. Falso verde novo.
3. Caminho por concatenação (P4, `chamar("/ocorrencias/" + id + "/inexistente-qa", { metodo: "POST" })`): o extrator lê só o primeiro literal, `POST /ocorrencias/`, que existe (a criação), e não sinaliza o `+`. Falso verde novo.
4. Os três passam pela âncora porque ela conta chamadas, não confere o caminho inteiro nem a origem do método.

## Achados

- corrige antes de crescer: o extrator de `contrato-do-painel.test.ts` aceita como lidos (a) método em variável, assumindo GET, e (b) caminho montado por `+`, conferindo só o primeiro literal; com o alias (rodada 2) são três formas de falso verde. Reprodução: plantios P2, P3 e P4 em `painel/35-e23-plantios.txt`. Conserto barato: tratar como "não lida" a chamada cujo primeiro argumento continua depois do literal (qualquer coisa além de vírgula) e a chamada com segundo argumento que não é objeto literal. Dono: F02-E05 (generalização do contrato) ou ajuste pontual.

## Não verificado

- Contrato do app de campo e do console (fora da etapa, F02-E05); corpo e resposta (fora da etapa).

## Risco residual

Uma chamada escrita num dos três padrões acima com caminho errado passaria verde; hoje nenhuma chamada de `http.ts` usa esses padrões (contagem igual à extração).

## Motivo do humano

A etapa pede que o Rafael veja o teste reprovar com `/pacote.zip` reintroduzido numa cópia de trabalho (o plantio P1 reproduz isso).
