---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E08
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [UI, A11Y, AUTH, AUTHZ, API, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Produto de `fd17ff4` (árvore em `55209ab`). Saídas em `SCRATCH/val-qa-r7b/` (SCRATCH = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad`). Entre `1ed0b71` e `fd17ff4` nenhum arquivo da etapa mudou (`oficios.ts`, `avisos.ts`, `recorte-do-agente.ts`, `permissoes.ts`); mudou a guarda de códigos de erro, por onde sai o 403 `sem_permissao` desta etapa, e `RegraDeNegocio`. Procurei a regressão ali.

| Critério | Prova | Resultado |
| --- | --- | --- |
| Agente em `GET /oficios` e `GET /oficios/:id`: 403 `sem_permissao` | sonda HTTP real nos dois modos da guarda (`70-sonda-etapas.txt`): `/oficios`, `/oficios?ocorrenciaId=...`, `/oficios/<uuid inexistente>`, `/oficios/nao-e-uuid` e `/oficios/` dão o MESMO 403 `sem_permissao` com a mesma frase (sem 422 nem 404 que denuncie algo) | PASS |
| Operador, coordenador e administrador listam (200) | sonda: administradora 200, operador 200; `leitura-do-agente-oficios-e-avisos.test.ts` 14 de 14 e `orgaos-e-oficio.test.ts` 24 de 24 no `test:api` | PASS |
| Sino recortado: agente sem aviso de outra equipe, `naoLidos` do recorte, agente sem equipe com lista vazia e 0 | `leitura-do-agente-oficios-e-avisos.test.ts` e `sino-de-avisos.test.ts` 19 de 19; mutação M3 abaixo | PASS |
| Ação nova testada no shared e na API | `npm run test --workspace @dc360/shared` 223 de 223 (`42`) | PASS |
| Coordenador de B abre ofício de A: 404 | caso do `leitura-do-agente-oficios-e-avisos.test.ts` ("o agente de outro município também recebe 403...") e `test:isolamento` 345 e 3 pulados (gatekeeper) | PASS |
| Regressão obrigatória | `test:api` 1685 e 34 pulados, código 0 (`40`); `superficie.test.ts` 9 de 9; `test:e2e:api` Chromium 288 e 197, código 0 (`46`) | PASS |
| E2E: token do agente `GET /oficios` 403 e o cartão de ofícios escondido | `46-e2e-api.txt`: "GET /oficios com o token do agente: 403 sem_permissao", "GET /oficios/:id ... sem e-mail nem IP no corpo", "o cartao de oficios nem aparece para ele", "o operador ... continua vendo o cartao de oficios" | PASS |

## Evidência

- CI: run 39420436042 sobre `55209ab`, 9 de 9 `success`, inclusive "Fluxo ponta a ponta no navegador" (`05-ci-jobs.txt`).
- Sonda: `sondas/zz-qa7-etapas.test.ts` (servidor real com semente, `fetch` em porta efêmera; posta em `apps/api/test/` só durante a execução e apagada), 0 desvio da guarda.
- Mutações: `55-MUTACAO-E08-M1-lista-de-oficios.txt`, `57-MUTACAO-E08-M3-contagem.txt`; restaurado `56-E08-restaurado.txt` (66 de 66).

## Cenários positivos

- Operador e administradora leem a lista de ofícios; o operador continua vendo o cartão no dossiê (E2E).

## Cenários negativos

- M1: `GET /oficios` só com `exigirAutenticacao` no lugar de `autorizar(..., "consultar_oficio")`: 2 de 66 falham ("GET /oficios responde 403 sem_permissao ao agente, com ou sem filtro, e não entrega nada" e "o agente de outro município também recebe 403"). Observação: com só `orgaos-e-oficio`, `agente-so-ve-a-equipe` e `sino-de-avisos`, a mesma mutação passa verde (52 de 52); quem morde é `leitura-do-agente-oficios-e-avisos.test.ts`, que está no `test:api`.
- M3: contagem de não lidos sem o recorte do agente: 2 de 66 falham ("a contagem de não lidos é a do recorte", "agente sem equipe: lista vazia e naoLidos 0").
- As duas desfeitas com `git restore`, 66 de 66 de novo, árvore limpa.

## Tentativas de reprovar

1. Oráculo por forma do pedido: id malformado, id inexistente, filtro por ocorrência, barra no fim. Todas 403 idênticas, antes da validação do corpo e de abrir transação.
2. Regressão pela guarda nova: o 403 `sem_permissao` desta etapa passou intacto nos modos "falhar" e "corrigir" por HTTP real, sem desvio.
3. Sino do agente pela sonda: 200 com `itens` vazio e `naoLidos` 0 (a semente não tem aviso da equipe dele); o recorte com avisos de outra equipe é provado pela suíte e pela mutação M3.

## Achados

- Nenhum que bloqueie esta etapa.

## Não verificado

- A escrita dentro de `GET /avisos` continua (decisão da etapa, pendência registrada para F07-E03 e F04-E11); não medi o efeito dela com volume.
- WebKit e Firefox no E2E: só Chromium. Node 24.15.0 local, não o 22 do `.nvmrc`.
- A sonda HTTP do sino rodou com a semente sem avisos; o recorte com avisos de outra equipe ficou com a suíte e a mutação.

## Risco residual

Papel novo que ganhe `consultar_oficio` por engano voltaria a ler ofício; a lista fechada de ações no shared é a defesa até o default deny da F03-E14.

## Motivo do humano

A etapa pede que Rafael veja a sonda do agente antes (200 com o e-mail do órgão) e depois (403), e a jornada nova do painel tem portão visual dele.
