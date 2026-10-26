---
validador: engenharia-entrega
modelo: claude-sonnet-5-5
etapa: V2-F00-E19
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados
- Job "Dependências com vulnerabilidade conhecida (auditar)" (113186786462) verde; artefato `dependencias-7005a60...` com `01-auditar.txt` ("Runtime limpo, e o aplicativo sem advisory nova", 6 aceitas com dono Rafael até 2027-01-05) e os quatro JSON de `npm audit`. `auditar` verde em Linux (CI) e Windows (qa).
- Exceção sem prazo reprova: FAIL. `dc360/scripts/auditar.mjs:198` usa `ACEITAS_NO_APLICATIVO[nome].ate < hoje`; sem `ate`, `undefined < "2026-10-13"` é `false` (conferido com `node -e`: saiu `false`), a exceção nunca vence e não é recusada. O bloco pede "cada exceção com dono, motivo e ate" e o teste negativo "exceção sem prazo reprova"; `auditar.test.mjs` não cobre isso nem o vencimento (o cabeçalho admite que o vencimento fica sem teste).
- `expo-doctor` 21 de 21: ver decisão (b).

## Evidência
Run 37739535524, evento push, headSha 7005a60, conclusão success, 9 de 9 jobs verdes, nenhum passo fora de success (lido em `gh run view --json jobs`). Artefatos baixados com `gh run download` (um por job, `<job>-7005a60...`, 3 a 9 arquivos cada, com `00-contexto.txt`). Varredura de JWT, Bearer, ghp_ e URL com senha nos artefatos: zero ocorrência. Workflow: `|| true` só em `npm audit --json` de evidência (comentado; o passo decisório `npm run auditar` vem antes e sem ele), cópia do log do preview, limpeza de docker e `kill` do trap; nenhum `continue-on-error` (as duas menções são comentários que o proíbem). O único `set +e` é o do passo do baseline (abaixo).
`expo-doctor`: o job "Aplicativo de campo" liga `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1` (passo "Saúde do projeto Expo", justificativa em comentário); `aplicativo/07-expo-doctor.txt`: "20/20 checks passed" com a verificação de versões desativada. Em contrapartida, o job baseline Linux rodou `npx expo-doctor` SEM o skip: `baseline/17-expo-doctor.txt`, "21/21 checks passed. No issues detected!" em 2026-10-08, no SHA.

## Cenários positivos
Runtime limpo passa; aceita nomeada com prazo futuro passa (CI e qa).

## Cenários negativos
Prazo vencido reprova (sonda do qa). Sem prazo: passa com saída 0 (defeito).

## Tentativas de reprovar
Li o passo do workflow e o artefato do baseline para saber se o 21/21 tem prova sem pular a checagem: tem, datada e em Linux. Reproduzi a avaliação de `undefined < hoje`. Verifiquei que o `|| true` do job cobre só os JSON de evidência.

## Achados
1. bloqueia a etapa (corrige antes de crescer): exceção sem `ate` aprova com saída 0; faltam testes negativos "sem prazo" e "vencida" exigidos pelo bloco. Correção pequena: validar `dono`, `motivo` e `ate` (AAAA-MM-DD) em toda entrada e reprovar se faltar, com teste sintético.
2. Decisão (b): NÃO é FAIL. O DoD "21 de 21" tem prova do SHA (baseline Linux, sem skip, 21/21 em 2026-10-08). O 20/21 de hoje é drift externo (Expo publica patch toda semana, 6 pacotes), e o skip do job aplicativo é decisão documentada que o próprio bloco já descrevia. Anotado: o 21/21 não se sustenta no tempo e nada o vigia; o README diz "medido em data".
3. anotado: `baseline.mjs` ainda espera `auditar` em falha e `expo-doctor` "20/21" (E01, achado 2).

## Não verificado
`test:isolamento` e `superficie.test.ts` depois do `audit fix` por conta própria (confiei no job `produto` verde). Lista de exceções lida por Rafael.

## Risco residual
Exceção sem prazo permanece válida para sempre até alguém notar.

## Motivo do humano
Rafael lê a lista de exceções com dono e prazo (CP-03).
