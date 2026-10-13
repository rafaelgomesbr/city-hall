---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E03
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [ARQUIVO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: decisao de Rafael sobre BZ-N:N.3
---
## Critérios verificados

- Soma contra a E01: 1 (shared) + 14 (web) + 2 (API) + 20 (campo) + 3 (scripts) = 40 testes vermelhos, mais 13 de `banco-tls`, 5 pulados, 13 afirmações de números, 1 typecheck, 4 de dependência e 3 e2e. Confere com a seção 2 de `classificacao-dos-vermelhos.md` e com a etapa. PASS.
- Linhas de classe B com evidência datada: V-CAM-01 a 06, V-SCR-3 e V-WEB-01 trazem commit e data. PASS.
- SHA-256 do `INDEX.md` da E03 confere.
- Suítes que o registro diz que fecham, medidas hoje: shared 168 de 168 (saída 0), web 643 de 643 (saída 0), isolamento 327 ok (saída 0), `test:scripts` 213 sem falha. No CI Linux (`baseline`): API, console, jest do campo, `test:campo`, e2e e e2e-api saem 0.
- DoD "regra de BZ-N:N.3 decidida por Rafael": NÃO atendido (achado 1).
- Critério do G00 "registro com zero itens abertos" e "`classificacao-dos-vermelhos.md` atualizado": NÃO atendido (achados 2 e 3).

## Evidência

Scratchpad da sessão: `shared.txt`, `web.txt`, `iso.txt`, `test-scripts.txt`, `art/baseline/RESUMO.md`. `git log -- docs/evidencias-v2/G00/V2-F00-E03`: um único commit (afde25c, 2026-10-05).

## Cenários positivos

Todo vermelho do baseline da E01 tem linha; toda linha tem vermelho no baseline.

## Cenários negativos

Linha "teste velho" ou "mock velho" sem evidência datada: nenhuma. Vermelho conhecido fora do registro: achei (achado 3).

## Tentativas de reprovar

- Procurei decisão de Rafael sobre BZ-N:N.3 em STATUS, DECISOES e RESUMOs: só "PENDENTE" e "premissa" (`classificacao-dos-vermelhos.md:184`, `STATUS.md:255` e `:1059`, `DECISOES-DE-TESTE-DA-FASE-00.md:39`).
- Procurei coluna ou marca de estado (aberto/fechado) na classificação: não existe; as linhas dizem "Fecha em E13..." no futuro, escrito em 2026-10-05 e nunca revisto depois das 22 etapas seguintes.
- Procurei instabilidade conhecida fora do registro: `dominio.test.ts` (achado da E10, STATUS:1152) e `test:isolamento` sob carga (STATUS:1171) não aparecem em `classificacao-dos-vermelhos.md`; só `resolver-link.test.ts` aparece (seção 6). `DECISOES-DE-TESTE-DA-FASE-00.md:62` mantém a espera fixa de 20 ms como "proposta, sem etapa aceita"; `resolver-link.test.ts:418` ainda tem `setTimeout(resolve, 20)`; STATUS:1177 confirma que o conserto não foi feito.
- Reexecutei as suítes citadas: nenhuma instabilidade reproduzida hoje (shared, web e isolamento verdes).

## Achados

1. **bloqueia (o gate G00, não o produto).** A decisão de BZ-N:N.3 e a confirmação dos 14 defeitos do campo estão "PENDENTE". A DoD e o item do G00 exigem a decisão de Rafael. Só uma pessoa resolve.
2. **bloqueia.** `classificacao-dos-vermelhos.md` é fotografia de 2026-10-05. Não registra o fechamento de nenhuma linha (V-WEB, V-CAM, V-API, V-DEP, V-NUM, V-E2E), diz "Fecha em" no futuro e descreve `npm audit` da raiz com 4 (1 alta, fastify), quando o Linux de hoje mostra 3 (1 moderada, 2 críticas em tinypool, só desenvolvimento). O "zero itens abertos" não é demonstrável a partir do arquivo que o G00 nomeia.
3. **bloqueia.** O registro não é completo: a instabilidade conhecida de `dominio.test.ts` (shared) e de `test:isolamento` sob carga (o portão número um) só vive no STATUS; `resolver-link.test.ts` está registrado como instável, sem etapa e sem conserto. Isso contradiz "zero vermelho conhecido fora do registro" (G00, política T42) e "zero itens abertos". Reprodução: ler `STATUS.md` linhas 1129, 1152, 1171 e 1177 e comparar com a seção 6 da classificação.
4. **corrige antes de crescer.** As divergências D-1 a D-7 e as respostas 1 a 3 da seção 7 seguem sem resposta registrada; D-7 pede registro nas etapas que reescrevem teste.
5. **anotado.** Números citados (181 de `test:scripts`, 17 de 17) são do snapshot de 2026-10-05; hoje 213.

## Não verificado

- Reexecução completa da API (9 min no CI) e do jest do campo localmente: usei o CI Linux (saída 0 em ambos).
- Se cada linha de classe A foi consertada por teste que falhava antes: matéria de cada etapa (E04 a E21).
- Firefox no e2e local.

## Risco residual

A suíte está verde hoje, mas o registro que deveria prová-lo diz outra coisa, e três testes sensíveis a carga continuam sem dono nem etapa: a falha intermitente vira "roda de novo".

## Motivo do humano

Rafael precisa decidir BZ-N:N.3, confirmar os 14 defeitos do campo e aceitar (ou recusar) a troca de espera fixa por condição em `resolver-link.test.ts` e `dominio.test.ts`. Depois o implementador atualiza o registro (estado por linha, instáveis incluídos) e a validação repete.
