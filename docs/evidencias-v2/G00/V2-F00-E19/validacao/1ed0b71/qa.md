---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E19
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: media
humano_necessario: sim
escalar: item 7 da seção 7 de 28 (portão de dependência de execução que aprova sem ter auditado); arbitragem em Opus se outra dimensão der PASS
---
## Critérios verificados

Saídas brutas: `<V>` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/qa/`. Rodado na árvore principal (`5044e7a`, produto igual ao de `1ed0b71`), macOS arm64, Node 24.15, npm 11.12, com rede.

A decisão do CP-03 não está em `docs/evidencias-v2/CP-03/` (a pasta não existe); li o registro em `docs/roadmap-v2/STATUS.md:149` e em `dc360/scripts/auditar-excecoes.mjs`: runtime reprova; no aplicativo, as sete advisories do Expo aceitas com motivo, dono Rafael e prazo 2027-01-05; prazo vencido reprova.

| Critério | Resultado | Prova |
| --- | --- | --- |
| `npm run auditar` verde conforme o CP-03 | PASS no caminho normal: código 0, runtime 0, 3 de desenvolvimento aceitas com dono e prazo, aplicativo com 57 e as 6 aceitas, sem advisory nova | `<V>/E19-auditar.txt` |
| Zero runtime vulnerável na raiz | PASS: `npm audit --omit=dev` código 0, `found 0 vulnerabilities` | `<V>/E19-npm-audit-omit-dev.txt` |
| Exceções com dono e prazo | PASS: as 6 do aplicativo e as 3 de desenvolvimento com `dono`, `motivo`, `ate` | `scripts/auditar-excecoes.mjs`; saída acima |
| `expo-doctor` 21 de 21 sem pular a checagem | PASS: `21/21 checks passed`, código 0, `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK` ausente | `<V>/E19-expo-doctor.txt` |
| Negativos de `auditar.test.mjs` (runtime reprova, sem prazo, vencida, com correção, só desenvolvimento avisa) | PASS: 28 de 28 | `node --test scripts/auditar.test.mjs` |
| O portão nunca aprova sem ter auditado (correção 3; `README.md:1536-1538`) | **FAIL**: sai 0 com "Runtime limpo" sem auditar em dois cenários (achado 1) | `<V>/E19-negativos.txt`, `<V>/E19-negativos-3.txt` |
| Regressão: `typecheck`, `npm test`, `test:campo`, `test:scripts`, `test:isolamento`, `superficie.test.ts`, `test:e2e:api` | PASS: typecheck 0; `npm test` 0 (API 1590 e 34 pulados, banco 345 e 3 pulados, incluindo `superficie` e o CA-06); `test:campo` 139 suítes e 1997 testes; `test:scripts` 288 de 288; `test:e2e:api` Chromium 288 e 149, 0 falhas | `<V>/typecheck.txt`, `<V>/npm-test.txt`, `<V>/E19-test-campo.txt`, `<V>/E17-test-scripts.txt`, `<V>/E18-e2e-api-chromium.txt` |
| `auditar` verde no Windows e no Linux | Não verificado (sem Windows, sem Linux, CI ausente) | |

## Evidência

- `npm run auditar`: código 0 (`<V>/E19-auditar.txt`).
- Negativos com o npm de verdade: `<V>/E19-negativos.txt`, `<V>/E19-negativos-2.txt`, `<V>/E19-negativos-3.txt` (registro falso em `<V>/ferramentas/registro-vazio.mjs`).
- Negativos com npm falso no `PATH` (`<V>/ferramentas/npm-falso/npm`): `<V>/E19-npm-falso.txt`.
- `npx expo-doctor` em `apps/campo`: código 0 (`<V>/E19-expo-doctor.txt`).

## Cenários positivos

- `auditar` 0 com a política do CP-03; `npm audit --omit=dev` 0 na raiz; `expo-doctor` 21 de 21; suítes de regressão verdes.
- `npm_config_audit=false`, `npm_config_dry_run=true` e `npm_config_prefer_offline=true` não enganam o portão: ele audita de verdade e sai 0 com os números reais (3 e 55 ou 57).

## Cenários negativos

| Cenário | Esperado | Obtido |
| --- | --- | --- |
| Registro inacessível (`npm_config_registry=http://127.0.0.1:9`) | 2 | 2, "NÃO foi auditado" (ECONNREFUSED) |
| Registro que responde 404 ao endpoint de advisories | 2 | 2 |
| Registro que responde HTML (proxy) | 2 | 2 (`invalid json response body`) |
| npm falso: texto que não é JSON, saída vazia, `{}`, `[]`, falha sem saída, `total` como texto, JSON cortado | 2 | 2 em todos os sete |
| npm falso: 1 alta no runtime | 1 | 1 |
| npm falso: advisory nova (`lodash`) no aplicativo | 1 | 1 |
| npm com `offline=true` (`npm_config_offline=true`) | 2 | **0, "Runtime limpo"**, runtime 0, desenvolvimento 0, aplicativo 0 |
| Registro que responde 200 com `{}` ao `POST /-/npm/v1/security/advisories/bulk` | 2 | **0, "Runtime limpo"**, tudo 0 |
| npm falso: advisory nova e crítica em pacote já aceito (`node-forge`, outro id) | 1 | 0 (achado 2, já conhecido) |

## Tentativas de reprovar

Pedido do gatekeeper: fazer o portão sair 0 sem auditar. Conseguido de dois jeitos, ambos reproduzíveis:

1. `npm_config_offline=true node scripts/auditar.mjs`: o próprio npm, em modo offline, devolve um relatório bem formado com `metadata.vulnerabilities.total: 0` e `vulnerabilities: {}` (`<V>/E19-negativos-2.txt`, item N1f), sem consultar o registro. O `relatorioValido` aceita, e o portão imprime "Runtime limpo, e o aplicativo sem advisory nova" com código 0, dizendo 0 de desenvolvimento e 0 no aplicativo quando o real é 3 e 57. O único sinal é o aviso de que as seis exceções "não aparecem mais no relatório", que não reprova. O mesmo vale para `offline=true` num `.npmrc` do usuário ou do projeto.
2. Um registro (espelho ou proxy corporativo) que responde 200 com `{}` ao endpoint de advisories em massa: o npm monta um relatório vazio válido, e o portão sai 0 com "Runtime limpo" (`<V>/E19-negativos-3.txt`, modo `vazio`; o registro falso recebeu os três `POST .../advisories/bulk`).

Também tentei e o portão segurou: registro fora do ar, 404, HTML, sete formas de saída malformada, `audit=false`, `dry-run`, `prefer-offline`.

## Achados

1. **Bloqueia.** `dc360/scripts/auditar.mjs` (função `auditar` e `relatorioValido`) aprova sem ter auditado quando o npm devolve um relatório vazio e bem formado que não veio de uma consulta real: com `offline=true` na configuração do npm e com um registro que responde `{}` ao endpoint de advisories. O portão afirma "Runtime limpo" e sai 0, e o `README.md:1536-1538` promete o contrário ("O portão nunca aprova sem ter auditado ... sai com código 2"). É a mesma classe do defeito que reprovou a E19 na rodada 2 (registro fora do ar dando 0), num caminho que a correção 3 não fechou; o critério é o item 7 da seção 7 de `28` (dependência de execução com vulnerabilidade conhecida, que não admite risco aceito, e este é o portão que o garante). Reprodução: `cd dc360 && npm_config_offline=true node scripts/auditar.mjs; echo $?` imprime `Runtime limpo` e `0`. Conserto mínimo sugerido: passar `--offline=false` (e `--prefer-online`) nas três chamadas e ter um canário de fonte de advisories (por exemplo, exigir que o relatório do aplicativo traga as advisories que a lista de exceções diz existirem, ou auditar um lockfile sintético sabidamente vulnerável e exigir total maior que 0 antes de confiar no zero).
2. **Corrige antes de crescer** (o mesmo da rodada 4, Infra e CI). A exceção é aceita pelo nome do pacote, não pela advisory: uma advisory nova e crítica em `node-forge` (id 999999 no npm falso) passa com código 0 como "aceita". Reprodução: modo `forge-nova` em `<V>/E19-npm-falso.txt`.
3. **Anotado.** O gatekeeper indicou `docs/evidencias-v2/CP-03/` para a decisão; essa pasta não existe. A decisão está só como linha da tabela em `docs/roadmap-v2/STATUS.md:149`.

## Não verificado

- `npm run auditar` no Windows e no Linux (sem as plataformas; CI ausente por H32).
- O run do CI do SHA (job `dependencias` e `auditar`).
- O aplicativo com `expo` 57.0.30 e `expo-router` 57.0.28 num aparelho, e se o próximo binário nativo compila (pendência humana).
- Se algum espelho real (Nexus, Artifactory, Verdaccio) responde `{}` ao endpoint de advisories; reproduzi com um registro falso local.

## Risco residual

Numa máquina com `offline=true` no npm, ou atrás de um espelho que não implementa auditoria, o portão dá verde falso e o texto do README leva a confiar nele. A aceitação por nome de pacote deixa passar advisory nova em pacote já aceito. A deriva do Expo pode trazer o 20 de 21 de volta a qualquer dia.

## Motivo do humano

Rafael precisa ler a lista de exceções (dono, motivo, prazo), confirmar a premissa H24 (os pacotes do Expo subidos por analogia à D1) e ver o binário nativo novo num aparelho; nada disso esta máquina responde.
