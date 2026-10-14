---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E07
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [AUTH, AUTHZ, DB, MIGRATION, TENANT]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito: **PASS** na dimensão red-team. A reprovação da rodada 1 veio do mesmo defeito da E04 (token anterior à renovação, de cadeia encerrada, e token de papel rebaixado praticando ato por GET). Re-testei pelo cenário que o provou e pela mutação. Evidência em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/redteam` (`redteam/`).

| Critério | Resultado |
| --- | --- |
| Cadeia encerrada: token anterior à rotação não escreve por POST nem pelos GET e HEAD marcados | PASS (`get-com-efeito.test.ts` caso 4, `familia-da-sessao.test.ts`) |
| Papel rebaixado: 401 `nao_autenticado` e nada gravado, também nos GET marcados | PASS (`get-com-efeito.test.ts` caso 2) |
| Senha provisória vencida não escreve nem se troca | PASS (`senha-e-sessoes.test.ts`, `vigencia-na-escrita.test.ts`) |
| `/auth/encerrar-sessoes` com token anterior à renovação preserva a cadeia de quem pediu | PASS (último caso de `get-com-efeito.test.ts`) |
| O teste morde | PASS: com a marca `comEfeito` desligada em `servidor.ts`, 5 de 10 reprovam (`out-mut-comEfeito.txt`); restaurado com `git restore` |

## Evidência

- `out-api-suites.txt`: 16 arquivos, 296 de 296 (inclui `familia-da-sessao`, `vigencia-na-escrita`, `get-com-efeito`, `senha-e-sessoes`, `codigos-de-erro`).
- `out-mut-comEfeito.txt`: mutação e vermelho.
- Leitura de `auth/servico.ts` (`renovar`, `tratarTokenRecusado`): reuso de token rotacionado derruba a família; token desconhecido não abre oráculo.

## Cenários positivos

- Renovação normal: o token antigo escreve até vencer e o novo também.
- Rebaixado renova e passa a ter só as ações do papel novo.

## Cenários negativos

- Administrador encerra a cadeia: o token anterior à renovação recebe 401 `sessao_encerrada` em POST e nos GET com efeito, e nada é gravado.

## Tentativas de reprovar

1. GET e HEAD com efeito usando token da cadeia encerrada (o caminho da rodada 1): fechado.
2. Desliguei a marca para confirmar que o teste enxerga: enxerga.
3. Procurei GET novo que escreva por função SQL (pista 3, ver relatório da E04): nenhum no SHA.
4. Renovação concorrente com o mesmo token: o perdedor aborta (`revogadas === 0`), lido no código e coberto por suíte.

## Achados

**ANOTADO**

1. O portão contra GET novo com efeito é heurístico (ver E04, achado 2); a regra da cadeia depende dele para rotas futuras.

## Não verificado

- Migração 047 em Postgres 17 de produção: só PGlite e o Postgres 18.3 local do gatekeeper.
- Corrida entre a conferência da vigência e a escrita.

## Risco residual

Leitura pura com token vivo de cadeia encerrada continua até vencer (F03-E03).

## Motivo do humano

Nenhum para esta dimensão.
