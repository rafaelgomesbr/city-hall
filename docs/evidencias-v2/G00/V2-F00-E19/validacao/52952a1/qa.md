---
validador: qa (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E19
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Saídas em `$SP/val/qa/lote-scripts/` (abreviado `L/`). Registro npm configurado na máquina: o padrão (`https://registry.npmjs.org/`); não há `.npmrc` no repositório (raiz, `dc360`, `apps/campo`) e o workflow não define registro.

| Critério (DoD e cinco campos) | Resultado | Prova |
| --- | --- | --- |
| `npm run auditar` verde (Mac aqui, Linux no CI) | PASS | aqui: código 0, "Runtime (vai para a imagem): 0", 3 de desenvolvimento aceitas, aplicativo com 57 vulnerabilidades e só as 6 nomeadas (`L/e19-02-auditar-com-rede.txt`). CI job 116039196116: mesma saída (`L/ci-job-116039196116.log`) |
| `npm audit --omit=dev` zero na raiz | PASS | "found 0 vulnerabilities", código 0 (`L/e19-02`) |
| Campo conforme a política (CP-03) | PASS | as 6 aceitas (`brace-expansion`, `braces`, `decode-uri-component`, `node-forge`, `shell-quote`, `sprintf-js`) são exatamente as do CP-03 (STATUS, linha CP-03), com motivo, dono e `ate=2027-01-05` em `scripts/auditar-excecoes.mjs` |
| `npx expo-doctor` 21 de 21 sem pular a checagem de versões | PASS hoje | sem `EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK` no ambiente: "21/21 checks passed", código 0 (`L/e19-02`) |
| Negativo: vulnerabilidade de runtime reprova | PASS | mutação M2 (`if (runtime.total > 0)` vira `if (false)`): "reprova vulnerabilidade de runtime" vermelho, 27 de 28 (`L/e19-03-mutacoes-auditar.txt`) |
| Negativo: exceção sem prazo reprova | PASS | caso do próprio `auditar.test.mjs` (28 de 28 verde); a engenharia desta rodada sondou sem prazo, sem dono, sem motivo e data inexistente |
| Negativo: exceção vencida reprova | PASS | mutação M1 (vencida deixa de reprovar): 3 de 28 vermelhos ("reprova a exceção vencida", "reprova exceção vencida e diz a data") |
| Negativo: exceção com correção disponível reprova | PASS | mutação M3: "reprova aceita que tem correção disponível e não está marcada como inaplicável" vermelho. `brace-expansion` e `shell-quote` têm `comCorrecao: true` por decisão escrita do CP-03 (`npm audit fix` mistura SDK 57 e 58) |
| Negativo: só desenvolvimento apenas avisa | PASS | saída real: "3 vulnerabilidade(s) apenas em ferramenta de desenvolvimento, todas aceitas com dono e prazo (CP-03). Não reprova." |
| Autorização e isolamento depois da atualização | PASS | `npm run test:isolamento` 345 e 3 pulados (`L/e01-10`); `apps/api/test/superficie.test.ts` 9 de 9 (`L/e19-04-superficie.txt`) |
| Regressão | PASS | `npm run typecheck` 0 (`L/93-typecheck.txt`), `test:scripts` 260 de 260 (`L/90`), shared 168, web 665; API, console, campo e e2e pela linha de base do gatekeeper e pelo CI 9 de 9 |
| E2E `test:e2e:api` | PASS | CI: "Passou: 288 Falhou: 0" e "Passou: 64 Falhou: 0" (`L/ci-job-116039196287.log`) |

Defeitos das rodadas anteriores, reexecutados:

- Rodada 2 (item 7 da seção 7): `auditar` saía 0 sem auditar com o registro fora do ar. NÃO morde: `npm_config_registry=http://127.0.0.1:9 npm_config_fetch_retries=0 node scripts/auditar.mjs` sai **2** com "ERRO: o conjunto de runtime da raiz NÃO foi auditado" (`L/e19-05-auditar-registro-fora.txt`).
- Rodada 2: `README.md` dizendo que o `expo-doctor` falha uma verificação: NÃO morde (hoje 21 de 21 e o README diz isso).
- Rodada 1: exceção sem prazo aceita: NÃO morde.

## A pergunta do gatekeeper: registro que responde `{}`

Reproduzi de forma independente, com um registro falso meu (`L/registro-vazio.mjs`, só em 127.0.0.1:55551, derrubado depois; `lsof` confirma a porta livre): ele responde HTTP 200 com `{}` a qualquer pedido. O npm pediu 9 vezes `POST /-/npm/v1/security/advisories/bulk` e montou, a partir do `{}`, um relatório válido: `"metadata": { "vulnerabilities": { ..., "total": 0 } }`, código 0 (`L/e19-01-registro-vazio.txt`). Resultado:

- `node scripts/auditar.mjs`: **código 0**, "Runtime limpo, e o aplicativo sem advisory nova", com só um aviso de que as 6 exceções "não aparecem mais no relatório".
- No mesmo cenário, a linha de base (`baseline.mjs --so=auditar,audit-raiz,audit-campo`) faz `audit-raiz` e `audit-campo` DIVERGIREM ("código de saída 0, esperado falha (ficou verde)"), código 3.

Minha leitura, com a prova acima:

1. Não viola o critério da etapa nem o item 7 da seção 7 de `28` na configuração do projeto. O `{}` do endpoint `advisories/bulk` é a resposta LEGÍTIMA do registro quando não há aviso para os pacotes enviados: o portão não tem como distinguir, só pelo relatório, "o registro não tem base de avisos" de "não há aviso". É confiança no registro, não erro de leitura do relatório (o defeito da rodada 2 era ler `{ error }` como zero, e esse está fechado). No CI e nesta máquina o registro é o público do npm, sem `.npmrc` nem variável que o troque; para o portão aprovar sem auditar, alguém precisa trocar o registro (espelho corporativo sem base de avisos) ou o registro público precisa responder vazio. Nenhuma exceção nova é aceita fora do CP-03 nesse caminho: o item 7 trata de exceção, e aqui não há exceção, há falso negativo de fonte.
2. Mesmo assim é a mesma família do defeito da rodada 2 (aprovar sem ter olhado), há sinal disponível e ignorado (as 6 exceções somem todas de uma vez) e o conserto é barato. Vai como "corrige antes de crescer" (achado 1), e há defesa em profundidade hoje: o job de linha de base do CI diverge nesse cenário (só roda com `[ci completo]`, `workflow_dispatch` ou na rodada semanal).

## Evidência

| Comando | Código | Saída |
| --- | --- | --- |
| registro falso `{}` + `node scripts/auditar.mjs`, `npm audit --omit=dev --json` em `apps/campo`, `baseline.mjs --so=auditar,audit-raiz,audit-campo` | 0, 0, 3 | `L/e19-01-registro-vazio.txt` |
| `npm run auditar`; `npm audit --omit=dev`; `npm audit`; `npm audit --omit=dev` em `apps/campo`; `npx expo-doctor`; `node --test scripts/auditar.test.mjs` | 0; 0; 1; 1; 0; 0 | `L/e19-02-auditar-com-rede.txt` |
| mutações M1 a M3 com `git restore` | 1, 1, 1, depois 0 | `L/e19-03-mutacoes-auditar.txt` |
| `npx vitest run test/superficie.test.ts` (API) | 0 | `L/e19-04-superficie.txt` |
| registro fora do ar | 2 | `L/e19-05-auditar-registro-fora.txt` |
| `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E19 --sha 52952a1` | 0 | `L/00-conferir-evidencia.txt`: INDEX bate com 81 arquivos, 0 aviso |

## Cenários positivos

- Com o registro público: `auditar` 0, runtime 0, aplicativo só com as nomeadas, `expo-doctor` 21 de 21.

## Cenários negativos

- Registro fora do ar: código 2.
- Runtime com vulnerabilidade, exceção vencida, aceita com correção: reprovam (provado por mutação que deixa o teste vermelho).
- Registro que responde `{}`: o `auditar` aprova; o roteiro de linha de base diverge.

## Tentativas de reprovar

- Registro vazio (acima).
- Procurei `.npmrc` ou `registry` no repositório e no workflow: nenhum.
- Conferi se as 6 aceitas no aplicativo batem com o CP-03 e não com uma lista maior: batem.
- Conferi se o número do aplicativo mudou sem a lista mudar: 57 hoje (55 e 59 em medições anteriores do registro da E03); a lista é por pacote, então advisory nova num pacote já aceito não reprova até 2027-01-05 (achado 2). O CP-03 aceitou "advisory de ferramenta do Expo" desses pacotes, por nome; é a política decidida.
- Mutações restauradas com `git restore`; `git status --porcelain` só com as pastas `validacao/52952a1/`.

## Achados

1. corrige antes de crescer (dono: E19 ou F01-E06, política do CP-03). Registro que responde `{}` faz o `auditar` aprovar sem base de avisos. Reprodução: `node $SP/val/qa/lote-scripts/registro-vazio.mjs 55551 /tmp/log vazio &` e `npm_config_registry=http://127.0.0.1:55551/ node scripts/auditar.mjs` (código 0). Remédio: fixar `--registry=https://registry.npmjs.org/` nas três chamadas do portão, ou reprovar quando TODAS as exceções presentes somem do relatório de uma vez.
2. anotado (herdado). Exceção por nome de pacote: advisory nova em pacote aceito não reprova até o prazo.
3. anotado. O `expo-doctor` com checagem de versão só roda no job de linha de base (`[ci completo]`); o job de todo push pula a checagem. A deriva volta a cada patch do Expo (voltou em menos de um dia na correção 4).

## Não verificado

- Windows (não há aqui).
- Binário nativo novo com os pacotes do Expo da correção 4 num aparelho: não há aparelho nem emulador Android; o Simulador de iOS não foi usado nesta etapa.

## Risco residual

- O 21 de 21 vale para hoje (2026-10-15); patch novo do Expo faz o passo divergir.
- As exceções do aplicativo vencem em 2027-01-05 e o portão reprova a partir daí, como o CP-03 quer.

## Motivo do humano

- H24 (`pendencias-humanas.md`): a correção 4 subiu cinco pacotes do Expo por PREMISSA (analogia com a D1); só o Rafael confirma ou manda desfazer.
- O aplicativo precisa de binário nativo novo com esses pacotes; compilar e instalar num aparelho é validação humana (o jest não prova o nativo).
