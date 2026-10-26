---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E03
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [ARQUIVO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-qa/` (`SAIDAS/`). A etapa é um registro; nesta rodada o que pode quebrá-la é um vermelho NOVO, trazido pelo diff `1ed0b71..fd17ff4`, sem linha no registro (que afirma 0 abertas na seção 10.3). A pasta da etapa não mudou no diff além do `VEREDITO.md`.

| Critério | Resultado | Prova |
| --- | --- | --- |
| Registro completo e somado contra a E01 | PASS | `classificacao-dos-vermelhos.md` seções 8.8.4, 9.3 e 10.3: 72 fechadas, 1 tolerada (V-DEP-3, CP-03, prazo 2027-01-05), 0 abertas; a soma bate (72 + 1 = 73) |
| Negativo: nenhum vermelho atual fica sem linha | PASS | todas as suítes rodadas no SHA fecham sem falha: typecheck, shared 223, db 345 (3 pulados), pacote de campo 238, API 1685 (34 pulados) e 1719 de 1719 com Postgres 17.6 real, console 286, painel 699, jest do aplicativo, `test:campo`, `test:scripts` 324, `conferir:numeros` 0, `auditar` 0, e2e 70 e 70, `e2e-api` 288 e 197 em Chromium e Firefox, 196 no WebKit (`--so-layout`) |
| Negativo: linha "teste velho" ou "mock velho" sem evidência datada | PASS | as linhas da tabela com essas classes citam data, commit ou a decisão registrada (`SAIDAS/e03-linhas.txt` e conferência por script) |
| Exceção de dependência tolerada segue válida | PASS | `npm run auditar` 0 no SHA, com a consulta de controle e as 8 advisories aceitas voltando nas consultas (`bl3/05-auditar.txt`); prazo 2027-01-05 não venceu |
| Regra de BZ-N:N.3 decidida por Rafael | PASS (texto) | decisão registrada em `docs/DECISOES-DE-TESTE-DA-FASE-00.md` e na seção 8 do registro; só conferi o registro |

## Evidência

- Roteiro da linha de base em 5 lotes (`SAIDAS/bl1` a `SAIDAS/bl5`, códigos em `SAIDAS/baseline-codigos.txt`).
- `DC360_POSTGRES_DE_PROVA=<cluster descartável local> npm run test:api`: código 0, 106 arquivos, 1719 de 1719 (`SAIDAS/e04-03-test-api-postgres-real.txt`).
- `node scripts/e2e-api.mjs firefox` (código 0) e `node scripts/e2e-api.mjs webkit --so-layout` (código 0): `SAIDAS/e2e-api-firefox.txt`, `SAIDAS/e2e-api-webkit.txt`.
- `conferir-evidencia.mjs V2-F00-E03 --sha fd17ff4`: sem falha (`SAIDAS/conferir-evidencia-E03.txt`).
- CI run 39420436042: 9 de 9 `success` (`SAIDAS/ci-39420436042.txt`).

## Cenários positivos

- O registro afirma zero abertas e a execução no SHA confirma: nenhuma suíte vermelha no Mac, nenhum job vermelho no CI.

## Cenários negativos

- Procura ativa de vermelho fora do caminho padrão: os 34 casos que só rodam com Postgres real (rodados, verdes) e os dois motores que o diff acrescentou ao CI no `e2e-api` (Firefox e WebKit, rodados, verdes).

## Tentativas de reprovar

1. Rodei as suítes que o diff mexe (guarda de códigos de erro da API e do console, painel com `correcao-5-da-e09`, `layout-estreito.e2e.mjs`, `auditar`, `conferir-indices-de-evidencia`) procurando um vermelho novo sem linha: nenhum.
2. Rodei o bloco de Postgres real (`skipIf` de `renovacao-contra-encerramento.test.ts`), que o roteiro pula: 1719 de 1719.
3. Rodei o `e2e-api` em Firefox e WebKit, passos novos do CI no diff: sem falha. O pulo do Tab no WebKit é por motor, com motivo, e não é vermelho.
4. Conferi se a exceção V-DEP-3 (tolerada) ainda corresponde ao que o `auditar` aceita depois da mudança de `auditar-excecoes.mjs` no diff: o portão sai 0 e as aceitas voltam nas próprias consultas.

## Achados

1. **Anotado (repetido da rodada 6).** O roteiro sai 3 no Mac pela pasta `apps/campo/ios/` (4 pulados esperados, 0 obtidos em `test:scripts`). Não é vermelho nem skip; o registro não o menciona.
2. Nenhum vermelho sem linha.

## Não verificado

- Os logs dos jobs do CI (exigem token): só li o estado `success` de cada job.
- Windows; instabilidades sob carga (V-INS-03 a V-INS-06): rodei cada suíte uma vez, sem carga sintética.
- A decisão de Rafael só no texto.

## Risco residual

As linhas de instabilidade fechadas sem causa medida (V-INS-03, 04 e 06) podem reaparecer sob carga; o registro já diz isso (9.2).

## Motivo do humano

Não se aplica: a decisão de Rafael pedida pela etapa (BZ-N:N.3) está registrada; H03 foi dispensada (commit `fd17ff4`).
