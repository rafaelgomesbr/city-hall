---
validador: qa (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E19
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---

Pasta das saídas (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/qa-lote2/` (abaixo, `SAIDAS/`). Mac, Node v24.15.0, com rede, medido em 2026-10-18.

## Critérios verificados

| Critério (DoD e campos de teste) | Resultado | Prova |
| --- | --- | --- |
| `npm run auditar` verde conforme o CP-03 nas duas árvores | PASS | código 0, "Runtime limpo, e o aplicativo sem advisory nova"; raiz: 3 avisos de desenvolvimento aceitos com dono e prazo; aplicativo: 57 avisos, só as seis exceções nomeadas (`SAIDAS/e19-03-auditar.txt`, e o passo `auditar` da linha de base) |
| Zero runtime vulnerável na raiz | PASS | `npm audit --omit=dev` na raiz: "found 0 vulnerabilities", código 0 (`e19-01`) |
| Exceções com dono, motivo e prazo | PASS | `scripts/auditar-excecoes.mjs`: seis do aplicativo e três de desenvolvimento, todas com motivo, dono Rafael e `ate` 2027-01-05 |
| Exceção vencida reprova | PASS | `PRAZO` trocado para 2026-10-17: `node scripts/auditar.mjs` código 1, "9 defeito(s) na lista de exceções" (`e19-05`); desfeito |
| Exceção sem dono reprova | PASS | `DONO` vazio: código 1 (`e19-06`); desfeito |
| Advisory sem exceção reprova | PASS | `decode-uri-component` renomeado na lista: código 1, "1 advisory nova no aplicativo de campo (decode-uri-component)" (`e19-07`); desfeito |
| Registro fora do ar não aprova | PASS | `npm_config_registry` apontando para endereço morto: código 2, "NÃO foi auditado" (`e19-04`) |
| `auditar.test.mjs` com JSON sintético (runtime reprova, desenvolvimento só avisa, sem prazo, vencida, com correção) | PASS | `node --test scripts/auditar.test.mjs`: 28 de 28 (`e19-08`) |
| `npx expo-doctor` 21 de 21 sem pular a checagem de versões | PASS | `npx expo-doctor` em `apps/campo`: "21/21 checks passed. No issues detected!", código 0, sem `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK` (`e19-02` e passo da linha de base) |
| Árvore instalada bate com o lockfile da correção 5 | PASS | `npm ls expo expo-router --depth=0`: 57.0.30 e 57.0.28, iguais ao `package-lock.json` |
| Regressão: typecheck, `npm test`, `test:campo`, `test:scripts`, `test:isolamento`, `superficie.test.ts`, `test:e2e:api` | PASS | linha de base completa: typecheck 0; shared 170, db 345 e 3 pulados, pacote de campo 223, console 259, painel 665; jest do aplicativo 1927; `test:campo` 0; `test:scripts` 288 e 0 falhas; `superficie.test.ts` 9 de 9; API só com a falha de máquina do LibreSSL; e2e contra a API 288 e 64 |
| Política do CP-03 na seção de segurança do README; "21 de 21" só se verdade | PASS | `dc360/README.md:1363` (política); linha do `expo-doctor` em `apps/campo/LEIA-ME.md:36` inclui 2026-10-18 |
| Os dois `npm audit` crus da linha de base só "falham" com relatório | PASS | passos `audit-raiz` e `audit-campo` conferem (código 1 com `# npm audit report`) |
| `INDEX.md` byte a byte | PASS | raiz 88 de 88 e `correcao-4/saidas/linha-de-base-final/INDEX.md` 19 de 19 |

## Evidência

`SAIDAS/e19-01` a `e19-08`, e `SAIDAS/baseline-completo/12-auditar.txt` a `15-expo-doctor.txt`. Cada mutação de `scripts/auditar-excecoes.mjs` desfeita com `git restore`, `git status` limpo.

## Cenários positivos

`auditar` 0, runtime da raiz em zero, `expo-doctor` 21 de 21, suítes de regressão verdes.

## Cenários negativos

Prazo vencido, dono vazio, advisory sem exceção (1); registro fora do ar (2); os casos sintéticos do teste.

## Tentativas de reprovar

1. Registro de avisos fora do ar (o FAIL da rodada 2): o portão sai 2, não aprova.
2. Adulterei a lista de exceções de três jeitos: todos reprovam antes ou depois da auditoria.
3. Conferi que o 21 de 21 do `expo-doctor` vale com a checagem de versões ligada e que os pacotes instalados são os do lockfile commitado.
4. Procurei documento que ainda afirme estado velho do `expo-doctor` (ver achado 1).

## Achados

1. Anotado: `dc360/README.md:16` termina a história do `expo-doctor` em 2026-10-14 ("21 de 21 de novo no mesmo dia") e não cita a deriva de 2026-10-18 nem a correção 5, que estão em `README.md:1678-1679`, `COLOCAR-DE-PE.md:47-48`, `apps/campo/LEIA-ME.md:36` e `PENDENCIAS.md:620`. Não é falso (é datado e diz que depende do dia), mas fica incompleto na tabela que se lê primeiro. Reprodução: `grep -n "2026-10-18" dc360/README.md`.
2. Anotado: `docs/evidencias-v2/G00/V2-F00-E19/correcao-4/saidas/08-regras-de-conteudo.txt:2` traz a pasta pessoal do usuário da máquina (sem segredo), que a regra de arquivamento manda redigir (`redigir` de `baseline.mjs`).
3. Anotado: as exceções são por PACOTE, não por advisory. Uma advisory nova num pacote já aceito (por exemplo, outra em `node-forge`) passaria sem reprovar. O CP-03 pede "exceção nomeada, com dono e prazo" e não diz o grão; o prazo de 2027-01-05 limita o efeito.

## Não verificado

- O run do CI com os pacotes novos (Linux): não lido.
- O binário nativo novo e o aplicativo num aparelho físico com `expo` 57.0.30 e `expo-router` 57.0.28: sem aparelho nesta validação.
- O resultado do `npm audit` e do `expo-doctor` vale para o registro de 2026-10-18; muda com o dia.

## Risco residual

Médio-baixo: o portão é sólido; a deriva do Expo volta a cada patch, e o binário nativo novo não foi compilado nem instalado.

## Motivo do humano

1. Decisão de produto: a premissa H24 (atualizar por analogia os pacotes do Expo das correções 4 e 5, que Rafael não decidiu um a um) precisa da confirmação de Rafael.
2. Aparelho físico: o aplicativo com os pacotes nativos novos precisa ser compilado e aberto num aparelho (V2-F14-E12), o que nenhum validador faz aqui.
