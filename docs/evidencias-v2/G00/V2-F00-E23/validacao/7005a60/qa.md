---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E23
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: []
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

| Critério | Resultado | Prova |
| --- | --- | --- |
| Todo caminho de `apps/web/src/dados/http.ts` existe entre as rotas registradas | PASS | `cd dc360/apps/api && npx vitest run test/contrato-do-painel.test.ts`: 12 de 12. O teste monta o servidor de verdade e lê as rotas por `printRoutes`; não usa lista copiada. |
| Rota inexistente reprova | PASS (sonda) | Ver sondas 1 e 2. |
| Método errado reprova | PASS (sonda) | Sonda 4. |
| Âncora anti extrator cego | PASS (sonda) | Sonda 3: a chamada que o extrator não sabe ler reprova duas vezes (lista `naoLidas` e contagem independente). |
| Nenhum `fetch` do painel fora de `http.ts` | PASS | `grep -rn "fetch(" apps/web/src` sem acertos fora de `dados/http.ts`. |
| Regressão do prefixo `/saida/pacote.zip` | PASS | Caso de âncora do lado do servidor: `POST /saida/pacote.zip` registrada e `POST /pacote.zip` não. |

## Evidência

Teste: 12 passam. Sondas feitas em `dc360/apps/web/src/dados/http.ts` com cópia de segurança em `%TEMP%` e restauração por `cp`; ao final `git status --porcelain dc360/apps/web/src/dados/http.ts` vazio.

## Cenários positivos

Estado atual do `http.ts`: todas as chamadas casam com `MÉTODO caminho` registrados.

## Cenários negativos

| Sonda | Mudança | Resultado |
| --- | --- | --- |
| 1 | acrescentar `chamar<void>("/rota-inexistente-qa", { metodo: "GET" })` | reprovou: `GET /rota-inexistente-qa (http.ts linha 1388)` |
| 2 | acrescentar template `/ocorrencias/${id}/zz-falso` com POST | reprovou: `POST /ocorrencias/:p/zz-falso` |
| 3 | caminho vindo de variável (`const c = "..."; chamar(c, ...)`) | reprovou: "chamada que o extrator não soube ler" e a âncora de contagem |
| 4 | trocar o método de `/auth/entrar` de POST para PUT | reprovou: `PUT /auth/entrar (http.ts linha 394)` |
| 5 | alias da função (`const f = chamar; f<void>("/rota-via-alias-qa", ...)`) | **passou verde**: extrator e contagem independente não enxergam |

## Tentativas de reprovar

As cinco sondas acima. Só a 5 escapou, e é intencionalmente pouco provável (o código de `http.ts` não usa alias de `chamar`).

## Achados

1. **Anotado.** Alias de `chamar`/`fetch` escapa do extrator e da contagem, porque as duas usam a palavra literal. A contagem "independente" compartilha o mesmo ponto cego do extrator para esse padrão. Reprodução: sonda 5. Sugestão: proibir alias com uma regra no próprio teste (qualquer ocorrência de `chamar` que não seja `chamar(`/`chamar<` vira falha). Dono: E23, sem urgência.
2. **Anotado.** O arquivo vive em `apps/api/test`, e a etapa o descreveu pensando no painel; a F02-E05 o generaliza (dito no cabeçalho). Só registro.

## Não verificado

- Corpo e resposta das chamadas (o teste só confere existência de método e caminho; é o escopo da etapa).
- Chamadas do aplicativo de campo e do console à API (fora do escopo, F02-E05).
- Se cada rota registrada responde de fato 2xx: não rodei o e2e.

## Risco residual

Baixo. Contrato de corpo continua sem teste até a F02.

## Motivo do humano

Nenhum.
