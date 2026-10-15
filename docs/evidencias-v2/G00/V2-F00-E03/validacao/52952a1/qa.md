---
validador: qa (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E03
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [ARQUIVO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Registro lido: `docs/evidencias-v2/G00/V2-F00-E03/classificacao-dos-vermelhos.md` (seções 2, 3, 8 e 8.8, esta última valendo por cima das outras). Saídas em `$SP/val/qa/lote-scripts/` (abreviado `L/`). Hoje: 2026-10-15 (UTC).

| Critério (DoD e cinco campos) | Resultado | Prova |
| --- | --- | --- |
| Positivo: a soma do registro fecha com o baseline da E01 (1, 14, 2 mais uma suíte, 20, 3, 13 afirmações, 3 e2e) | PASS | seção 2: 1 + 14 + 2 + 20 + 3 = 40 testes, mais 13 da suíte `banco-tls`, 5 pulados da vigência, 13 afirmações, 1 typecheck, 4 de dependência e 3 de navegador; conferi linha a linha contra as tabelas 3.1 a 3.5 |
| Negativo: nenhum vermelho do baseline fica sem linha | PASS | cada passo vermelho da seção 2 tem IDs na seção 3 |
| Negativo: nenhuma linha "teste velho" ou "mock velho" sem evidência datada | PASS | as 8 de classe B (V-WEB-01, V-CAM-01 a V-CAM-06, V-SCR-3) citam commit e data do teste e da decisão no código, e o teste irmão quando existe |
| Objetivo: cada vermelho conhecido tem causa, classe, regra, ETAPA QUE O FECHA e dono | FAIL | 8.8.2 e 8.8.4: V-INS-02 e V-INS-05 estão "ABERTO" com "NENHUMA [etapa] contém o trabalho" (texto do próprio registro). V-INS-03 tem encaixe "parcial" na E20 |
| DoD: item "vermelhos classificados" do G00 marcado. O item (`03-fase-00-estabilizacao.md:775`) diz "o registro da E03 tem zero itens abertos" | FAIL | 8.8.4: 6 linhas abertas (V-INS-02, 03, 04, 05, 06 e V-ROT-02). O próprio registro diz que o item "continua sem fechar à letra". A decisão H03 (aceitar linha aberta e nomeada) segue na seção A, aberta, de `docs/roadmap-v2/pendencias-humanas.md` |
| DoD: regra de BZ-N:N.3 decidida por Rafael | PASS | 8.6 e 8.7: Q1 a Q5 respondidas em 2026-10-13 (D3); confere com `decisoes-secao9.md` |
| Cada linha aberta contra o teto de 5 dias da D2 | PASS | todas com `2026-10-18`, escrito em 2026-10-13: 5 dias exatos; hoje (2026-10-15) ainda dentro. Vencem em 3 dias |
| Estado real das linhas abertas | conferido | `L/e03-01-estado-real-das-linhas.txt`: V-INS-02 continua com 10 `setTimeout(..., 20)` em 4 arquivos da API (o trabalho não foi feito); V-ROT-02: `baseline.mjs` não tem passo Firefox (0 ocorrências); V-INS-03 e V-INS-04: shared 168 de 168 em 3 rodadas seguidas (não reproduziu, coerente com a regra R6 de não fechar por falta de reprodução); V-INS-05: `test:isolamento` 345 e 3 pulados, verde nesta rodada (`L/e01-10-test-isolamento.txt`); V-INS-06: e2e da API em Firefox não rodado aqui (sem Firefox local) e o CI só roda a API em Chromium |
| Linhas fechadas: fechadas de verdade? | PASS por amostra | V-API-S2: `vigencia-na-escrita.test.ts` sem `describe.skip` (só um comentário na linha 38); V-WEB-03: provado com árvore CRLF (`L/e21-01-crlf-ocorrencia-encerramento.txt`); V-SHA-1: shared 168 de 168 e portão de conteúdo verde (`L/92-test-shared.txt`); V-API-S1: `banco-tls` 13 de 13 com `OPENSSL_CONF` inexistente (`L/e21-02`); V-TC-1: cache velho apagado e `test:campo` verde (`L/e21-03`); V-DEP-1 e V-DEP-2a: `auditar` 0 e runtime da raiz 0 (`L/e19-02`); as suítes inteiras estão verdes no CI (9 de 9) e na linha de base do gatekeeper |

Defeitos da rodada 2, reexecutados:

- Seis linhas abertas: AINDA MORDE (6 abertas).
- Prazos acima do teto da D2 (2026-10-27): NÃO morde mais (2026-10-18).
- Referências a E21 e E18 que não contêm o trabalho: PARCIAL. A E21 saiu; a E18 para V-INS-06 é plausível; mas V-INS-02 e V-INS-05 agora não têm etapa nenhuma, e V-INS-03 tem encaixe parcial declarado.
- D-4 (Firefox) sem dono: NÃO morde mais (V-ROT-02, dono `rafael`, etapa E01). Só que o candidato da E01 desta mesma rodada não traz o passo: a linha segue aberta.

## Evidência

| Comando | Código | Saída |
| --- | --- | --- |
| `grep` de `setTimeout(..., 20)` em `apps/api/test`, `grep` de `describe.skip` na vigência, `grep -c firefox scripts/baseline.mjs`, 3 rodadas de `npx vitest run --root packages/shared` | 0 | `L/e03-01-estado-real-das-linhas.txt` |
| `npm run test:isolamento` | 0 | `L/e01-10-test-isolamento.txt` |
| `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E03 --sha 52952a1` | 0 | `L/00-conferir-evidencia.txt`: "sem falha, 3 aviso(s)" (três `.md` só batem normalizando LF para CRLF) |
| CI run 38618369218, 9 de 9 `success` | 0 | `L/ci-00-jobs.txt` |

## Cenários positivos

- Soma do registro contra o baseline da E01: fecha.
- Linhas fechadas por amostra: o teste citado passa hoje.

## Cenários negativos

- Procurei vermelho do baseline sem linha: nenhum.
- Procurei linha de classe B sem data: nenhuma.
- Procurei linha aberta com prazo acima de 5 dias: nenhuma.
- Procurei linha aberta sem etapa que a feche: duas (V-INS-02 e V-INS-05).

## Tentativas de reprovar

- Conferi se o "fechado" de V-API-S2 era real ou só a marca trocada: o `describe.skip` saiu e o portão diz 0 marcados.
- Conferi se o prazo de 2026-10-18 cabe na D2 contado da data de escrita e não da validação: cabe (5 dias); com a folga de fuso o portão aceitaria até 2026-10-19.
- Conferi se V-ROT-02 foi fechada pela E01 neste candidato: não foi.
- Rodei o shared três vezes seguidas para tentar reproduzir V-INS-03 e V-INS-04: 168 de 168 nas três; sem carga extra, como o registro já diz.

## Achados

1. bloqueia (dono: E03 e Rafael, H03). O registro tem 6 linhas abertas e o item do G00 que a DoD manda marcar exige zero; duas delas (V-INS-02 e V-INS-05) não têm etapa que contenha o trabalho, o que viola o objetivo da etapa ("cada vermelho conhecido tem ... etapa que o fecha") independentemente de H03. Conserto mínimo: fechar as linhas (o trabalho cabe em uma etapa curta, como o próprio registro recomenda) ou, para as que ficarem, uma etapa do roadmap que as contenha, mais a decisão do Rafael em H03 sobre linha aberta e nomeada.
2. corrige antes de crescer (dono: E01). V-ROT-02 vence em 2026-10-18 e o candidato da E01 não tem o passo `e2e-firefox`.
3. anotado. `INDEX.md` da E03 só bate com três `.md` normalizando LF para CRLF (aviso do conferidor); não reprova, mas é a mesma classe de fim de linha da E21.

## Não verificado

- V-INS-05 e V-INS-06 sob carga: não reproduzi carga de máquina; o e2e da API em Firefox não roda aqui (sem Firefox no Playwright local).
- Cada uma das 65 linhas fechadas individualmente: conferi por amostra e pelas suítes inteiras verdes.

## Risco residual

- Em 2026-10-18 as 6 linhas abertas vencem; se nada mudar, o registro passa a violar a própria política T42.
- Instabilidade de `test:isolamento` (o portão número um, CA-06) sem causa medida e sem etapa.

## Motivo do humano

H03 (`docs/roadmap-v2/pendencias-humanas.md`, seção A): só o Rafael decide se o item do G00 "zero itens abertos" aceita linha aberta e nomeada, e se cria a etapa para V-INS-02 e V-INS-05. Mesmo com H03 aceito, as duas linhas sem etapa continuam contra o objetivo da etapa.
