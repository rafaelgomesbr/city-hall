---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E09
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [UI, API, AUTH, AUTHZ]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito: **PASS** na dimensão red-team. A reprovação da rodada 1 foi de layout (UX), fora desta dimensão. Evidência em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/redteam` (`redteam/`).

| Critério | Resultado |
| --- | --- |
| `GET /auth/sessoes` e `GET /usuarios/:id/sessoes` sem token | 401 `nao_autenticado`, igual para conta existente e id inventado (`out-t2.txt`) |
| `GET /usuarios/:id/sessoes` sem IP nem user-agent completo; posto acima: 403 `posto_insuficiente`; outro município: 404 | PASS (`sessoes-da-conta.test.ts`, `senha-e-sessoes.test.ts` em `out-api-suites.txt`) |
| Redefinir senha e encerrar sessões de outra pessoa: só quem administra, posto abaixo, mesmo município | PASS (suítes) |
| Estado da conta (sessões encerradas) não vaza a quem não tem token | PASS (`out-t2.txt`, ver E05) |

## Evidência

- `out-api-suites.txt` (16 arquivos, 296 de 296) e `out-t2.txt`.
- Leitura de `auth/servico.ts`, `listarMinhasSessoes`: devolve só datas, aparelho resumido e a marca "esta", filtrando pela família da sessão do token.

## Cenários positivos

- A própria pessoa vê as sessões e encerra as outras, mantendo a de onde clicou.

## Cenários negativos

- Sem token, id inventado e id real respondem igual.

## Tentativas de reprovar

1. Usar `GET /usuarios/:id/sessoes` como oráculo de existência de conta sem token: 401 igual.
2. Coordenador contra posto igual ou maior: 403 `posto_insuficiente` (decisão documentada: a conta é do próprio município).
3. Encerrar as próprias sessões com token anterior à renovação: preserva a cadeia (ver E07).

## Achados

**ANOTADO**

1. A senha temporária é conhecida de quem a sorteou e vale 72 horas (IDN-18, já registrado em `PENDENCIAS.md`).

## Não verificado

- Telas no navegador (QA, UX e acessibilidade).
- Sonda própria de outro município contra as três rotas: coberto pelas suítes executadas, sem sonda nova.

## Risco residual

Nenhum novo nesta dimensão.

## Motivo do humano

Nenhum.
