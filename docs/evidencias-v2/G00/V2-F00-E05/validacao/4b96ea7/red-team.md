---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [API, AUTH, UI]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito: **PASS** na dimensão red-team. Foco: enumeração de conta e de estado de conta por quem não tem token (pista 6), e o defeito da rodada 1 (renovar depois de desativar pelo painel caía em `sessao_encerrada`). Evidência em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/redteam` (`redteam/`).

| Critério | Resultado |
| --- | --- |
| `/auth/entrar` não distingue inexistente, desativada (senha certa e errada), ativa com senha errada e conta com sessões encerradas | PASS: 5 casos, 1 corpo distinto, todos 401 `credenciais`; tempo mediano de 490 a 493 ms nos cinco (`out-t2.txt`) |
| `/auth/recuperar` não distingue ativa, desativada, inexistente e conta de outro município | PASS: 1 corpo distinto entre os 4 |
| `/auth/renovar` com token inventado | 401 `sessao_encerrada`, igual ao de conta ativa encerrada; `conta_desativada` só para quem apresenta token que o servidor emitiu |
| Rotas de sessões sem token | 401 `nao_autenticado`, igual para conta existente e id inventado |
| `/auth/sair` com token inventado | 204, sem oráculo |
| Correção 1 (renovar depois de desativar pelo endpoint real) | PASS: `codigos-de-erro.test.ts` verde no lote `out-api-suites.txt` (16 arquivos, 296 de 296) |

## Evidência

- Sonda `redteam/t2-estado-da-conta.test.ts` contra a API real em PGlite (`construirServidor`), com a conta desativada e as sessões encerradas pelos endpoints reais da administradora; saída `out-t2.txt`.
- Lote de 16 suítes da API (`out-api-suites.txt`), inclui `codigos-de-erro`, `recuperacao-sem-oraculo` e `recuperacao`.

## Cenários positivos

- Quem tem o token de renovação de conta desativada recebe 403 `conta_desativada` (suíte), o que permite ao cliente parar a fila e avisar.

## Cenários negativos

- Os cinco estados de conta em `/auth/entrar` saem idênticos em corpo, status e tempo mediano.

## Tentativas de reprovar

1. Diferença de tempo entre conta existente e inexistente no login (mediana de 9 pedidos por caso): no máximo 3 ms em PGlite, dentro do ruído.
2. Estado "sessões encerradas" ou "desativada" para quem não tem credencial: não aparece em nenhuma das rotas de entrada, renovação, sessões e recuperação.
3. Recuperação com e-mail de conta de outro município: mesma resposta.
4. Token inventado em renovar e sair: respostas iguais às de token conhecido de conta ativa encerrada.

## Achados

**ANOTADO**

1. A frase do 401 de `/auth/renovar` difere da do catálogo (já anotado pelo QA).
2. Desativada e bloqueada por tentativas só se distinguem para quem tem a senha certa (por desenho).

## Não verificado

- Tempo em Postgres real com latência de rede.
- Telas do painel (UX e acessibilidade).

## Risco residual

Diferença de tempo em produção não medida; o envio do e-mail já sai fora do pedido.

## Motivo do humano

Nenhum para esta dimensão.
