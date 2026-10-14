---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E08
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [API, AUTHZ, TENANT, LGPD, UI]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito: **PASS** na dimensão red-team. Evidência em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/redteam` (`redteam/`).

| Critério | Resultado |
| --- | --- |
| Agente recebe 403 `sem_permissao` em `GET /oficios` e `GET /oficios/:id` | PASS (`leitura-do-agente-oficios-e-avisos.test.ts`, `orgaos-e-oficio.test.ts`) |
| Sino do agente: só avisos da equipe, contagem e "lidos" com o mesmo recorte | PASS (`sino-de-avisos.test.ts`); `POST /avisos/lidos` passa pelo recorte (lido em `rotas/avisos.ts`) |
| Ofício de A com token de B: 404, nunca 403 | PASS (suítes) |
| `GET /avisos` passou a conferir vigência (marca da E04) | PASS (ver E04) |

## Evidência

- `out-api-suites.txt`: 16 arquivos, 296 de 296, inclui `orgaos-e-oficio`, `leitura-do-agente-oficios-e-avisos`, `sino-de-avisos`, `documentos`.
- Leitura de `rotas/oficios.ts` (`reunirOficio` e a rota do documento: só leitura) e de `rotas/avisos.ts` (`POST /lidos` insere por dentro de `avisos` com o recorte do agente, sem confirmar existência de aviso de outra equipe ou município).

## Cenários positivos

- Operador, coordenação e administração listam e abrem ofício.

## Cenários negativos

- Agente: 403 nas duas rotas de ofício; agente sem equipe: lista vazia e zero não lidos.

## Tentativas de reprovar

1. Marcar como lido aviso de outra equipe para descobrir se existe: a resposta é `marcados: 0`, igual ao id inventado (lido no código e coberto por suíte).
2. Rota irmã `GET /oficios/:id/documento`: também exige `consultar_oficio` (lido).
3. Variante sem token de ofício (`/publico/oficio/:token`): token aleatório, fora do escopo desta etapa (ver E04, anotado 3).

## Achados

**ANOTADO**

1. `GET /oficios/:id/documento` mostra nome e endereço do solicitante e não grava `ocorrencia_consultas`, ao contrário do dossiê. Assunto de LGPD (consulta nominal é da F05-E11).

## Não verificado

- Sonda própria cruzando todas as rotas tocadas com token de outro município: não executei uma sonda nova; a prova é das suítes do repositório executadas por mim e do `test:isolamento` do gatekeeper (327 aprovados).
- Navegador (QA e UX).

## Risco residual

Nenhum novo nesta dimensão.

## Motivo do humano

Nenhum.
