---
validador: engenharia-entrega (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E19
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1 local no macOS, E2]
veredito: BLOCKED
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/engenharia-entrega-E01-E17-E18-E19-E21-E25/` (abaixo, `<V>`).

| Critério | Prova local (Mac, 2026-10-18) | Prova que depende do CI | Situação |
| --- | --- | --- | --- |
| `npm run auditar` verde (raiz e campo) | código 0: runtime 0, desenvolvimento 3 (aceitas com dono e prazo), aplicativo 55 nas 6 exceções nomeadas, "Runtime limpo, e o aplicativo sem advisory nova" (`<V>/05-auditar-com-rede.txt` e `<V>/baseline/12-auditar.txt`) | job `dependencias` em Linux | local PASS; CI BLOCKED |
| `npm audit --omit=dev` zero na raiz | "found 0 vulnerabilities", código 0 (`<V>/07-npm-audit-omit-dev-raiz.txt`) | artefato `03-audit-raiz-runtime.json` | PASS local |
| Campo conforme a política (lista nomeada) | `npm audit --omit=dev --json` em `apps/campo`: 55 (8 moderadas, 46 altas, 1 crítica); pacotes com advisory própria: `brace-expansion`, `braces`, `decode-uri-component`, `node-forge`, `shell-quote`, `sprintf-js`, exatamente as 6 de `ACEITAS_NO_APLICATIVO`, todas com motivo, dono Rafael e prazo 2027-01-05 (`<V>/08-npm-audit-omit-dev-campo.txt`) | artefato `05-audit-campo-runtime.json` | PASS local (ver achado 1) |
| Portão não aprova sem auditar | registro fora do ar (`npm_config_registry` apontando para porta fechada): código 2, "o conjunto de runtime da raiz NÃO foi auditado" (`<V>/06-auditar-registro-fora.txt`) | n/a | PASS |
| `npx expo-doctor` 21 de 21 sem pular a checagem de versões | passo `expo-doctor` da linha de base, sem `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK`: "21/21 checks passed. No issues detected!", código 0 (`<V>/baseline/15-expo-doctor.txt`) | job `baseline` (só com `[ci completo]`) | local PASS hoje; CI BLOCKED |
| Lockfile coerente com o manifesto (correção 5) | `apps/campo/package.json` pede `expo ~57.0.30` e `expo-router ~57.0.28`; o lockfile tem 57.0.30 e 57.0.28 na raiz e em `node_modules/`, e o instalado é o mesmo; `dc360/package-lock.json` não muda no diff `52952a1..bb0f654` | passo `npm ls` do job `aplicativo` | PASS local |
| Regressão: `test:campo`, jest do aplicativo, `test:isolamento`, `typecheck`, `test:e2e:api` | linha de base: `test-campo` 0, jest 1927 de 1927, `teste-db` 345 e 3 pulados, `typecheck` 0, `e2e-api` 288 e 64 | jobs `produto`, `aplicativo`, `navegador` | local PASS; CI BLOCKED |
| Workflow usa `npm run auditar`, e não `npm audit` cru, como portão | lido: job `dependencias` decide por `npm run auditar`; os relatórios crus vão como evidência com `|| true` só nesse passo | execução | estrutura PASS |

## Evidência

- `<V>/05-auditar-com-rede.txt`, `<V>/06-auditar-registro-fora.txt`, `<V>/07-npm-audit-omit-dev-raiz.txt`, `<V>/08-npm-audit-omit-dev-campo.txt`, `<V>/08b-audit-campo-runtime.json`.
- `<V>/baseline/12-auditar.txt` a `15-expo-doctor.txt` (os dois `npm audit` crus com relatório: conferem).

## Cenários positivos

- `auditar` 0, runtime da raiz 0, `expo-doctor` 21 de 21 sem pular versões, suíte do aplicativo inteira verde com os pacotes da correção 5.

## Cenários negativos

- Registro fora do ar: código 2 e mensagem em português; nunca "zero vulnerabilidades".

## Tentativas de reprovar

1. Registro inacessível: o portão recusa (código 2).
2. Conferi se algum pacote com advisory própria no aplicativo fica fora da lista: não (6 de 6).
3. Conferi se o lockfile ficou para trás do manifesto depois da correção 5: não.
4. Conferi se o `expo-doctor` do roteiro pula a checagem de versões: não pula; só o job `aplicativo` do CI pula.
5. Li o filtro do aplicativo em `scripts/auditar.mjs:194-198` procurando o caminho que passa sem dono (achado 1).

## Achados

1. Corrige antes de crescer (não quebra critério da etapa, porque o CP-03 nomeia pacotes): `scripts/auditar.mjs:198` aceita por NOME de pacote (`!(nome in ACEITAS_NO_APLICATIVO)`), não por advisory. Uma advisory nova num pacote já aceito, inclusive de gravidade maior que a descrita no motivo, passa sem reprovar e sem aviso. Reprodução por leitura: hoje `brace-expansion` traz 6 advisories (ids 1240100, 1240103, 1240104, 1240107, 1240108, 1240111) cobertas por uma linha de motivo; se amanhã surgir uma sétima de execução de código em `decode-uri-component` (que vai no aplicativo), `npm run auditar` continua em 0. Remédio sugerido: guardar na exceção os ids ou o GHSA aceitos e reprovar id novo.
2. Anotado: o job `aplicativo`, que roda em todo push, mantém `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK=1` (`.github/workflows/verificar.yml`, passo "Saúde do projeto Expo"); o 21 de 21 sem pular só é medido no job `baseline` (`[ci completo]`, manual ou semanal). Uma deriva do Expo (três vezes em cinco dias, pelo RESUMO da correção 5) só aparece nesses runs. Decisão consciente e escrita no comentário do workflow; registro para o gate.
3. Anotado: o 21 de 21 é do dia 2026-10-18 e do registro do Expo deste dia; volta a cair a cada patch publicado.

## Não verificado

- O run do CI (jobs `dependencias`, `aplicativo` e `baseline` em Linux, com artefato): não lido.
- Binário nativo com `expo` 57.0.30 e `expo-router` 57.0.28 e aparelho físico (fora desta dimensão; pendência humana do aplicativo).
- Windows.

## Risco residual

Médio-baixo: a política está aplicada e testada, mas a granularidade por pacote (achado 1) deixa advisory nova em pacote aceito invisível, e a deriva do Expo só é medida nos runs completos.

## Motivo do humano

Nenhum nesta dimensão. A escolha de granularidade da lista (achado 1) é da política do CP-03, que é do Rafael, mas não bloqueia o critério.
