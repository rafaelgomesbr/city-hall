---
validador: qa (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E01
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Saídas em `$SP/val/qa/lote-scripts/` (abreviado `L/` abaixo). Máquina: Mac arm64, Node v24.15.0, npm 11.12.1 (o `.nvmrc` diz `22`; a prova de Node 22 é o CI).

| Critério (DoD e cinco campos) | Resultado | Prova |
| --- | --- | --- |
| `node --test scripts/baseline.test.mjs` verde | PASS | `L/e01-01-baseline-test.txt`: 27 de 27, código 0 |
| `baseline.mjs --so-listar` imprime os comandos sem executar | PASS | `L/e01-02-so-listar.txt`: 19 linhas, código 0, `git status` limpo depois |
| Execução completa reproduz o estado de hoje (o REL:01 3.4 é histórico, documentado) | PASS | CI Linux, job 116039196113 do run 38618369218: "Conferem: 19 de 19", código 0 (lido pela engenharia e conferido aqui no log `L/ci-job-116039196113.log`). Mac do gatekeeper (`$SP/baseline/RESUMO.md`): 15 de 17, código 3, com as duas divergências de máquina que `COMO-REPRODUZIR.md` ("O que esperar") descreve passo a passo (LibreSSL no `teste-api`, pasta `ios/` no `test-scripts`). Repeti `--so=test-scripts,conferir-numeros,expo-doctor`: `test-scripts` diverge "puladas: obtido 0, esperado 4" (a pasta `apps/campo/ios/` existe aqui), os outros dois conferem, código 3 (`L/e01-04-baseline-subset.txt`) |
| Negativo: resultado diferente marca "divergente" e sai com código diferente de 0, sem esconder | PASS | mesmo `L/e01-04-baseline-subset.txt` (código 3, a linha divergente nomeada); registro npm fora do ar: `auditar`, `audit-raiz` e `audit-campo` divergem, código 3 (`L/e01-08-baseline-sem-registro.txt`) |
| Negativo: a redação mascara JWT, `Authorization: Bearer` e URL de banco com usuário e senha | PASS | sonda `L/sonda-redigir.mjs` contra `redigir` exportado de `scripts/baseline.mjs` (`L/e01-03-sonda-redigir.txt`): JWT vira `[JWT REDIGIDO]`, `Bearer` e `bearer` com valor viram `[REDIGIDO]`, URL `postgres` e `postgresql` com usuário e senha viram `[REDIGIDO]@`, pasta pessoal de Mac, Linux e Windows vira `[usuario]` |
| Autorização e isolamento: `npm run test:isolamento` inteiro e verde | PASS | `L/e01-10-test-isolamento.txt`: 14 arquivos, 345 aprovados e 3 pulados por ambiente (348), código 0 |
| E2E: `test:e2e` (Chromium e Firefox) e `test:e2e:api` na máquina limpa, resultado registrado | PASS (pelo CI) | job "Fluxo ponta a ponta no navegador" (116039196287): Chromium "Passou: 70 Falhou: 0", `MOTOR=firefox` "Passou: 70 Falhou: 0", e2e da API 288 e 64 (`L/ci-job-116039196287.log`, linhas 776, 900, 1297, 1381). No Mac do gatekeeper, `e2e` e `e2e-api` conferem. O roteiro `baseline.mjs` não tem passo Firefox (ver achado 1) |
| Zero segredo na evidência | PASS | `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E01 --sha 52952a1`: "sem falha, 0 aviso(s)", INDEX bate com 61 arquivos (`L/00-conferir-evidencia.txt`). Varredura minha da pasta (`L/e01-11-varredura-segredos.txt`): 0 JWT, 0 URL com credencial, 0 `Bearer` com valor; a única pasta pessoal está num relatório de validador da rodada 2 (`validacao/4b96ea7/qa.md:19`), não na evidência do implementador |
| Documentação diz o que acontece (defeito da rodada 2) | PASS | `COMO-REPRODUZIR.md` e `dc360/README.md` dizem código 0 na árvore verde com rede e descrevem o 15 de 17 do Mac com a causa de cada linha; batem com o que medi |
| `.nvmrc` com `22` | PASS | `dc360/.nvmrc` = `22` |

Defeitos das rodadas anteriores, reexecutados neste SHA:

- Rodada 2, documentação prometendo código 1 por V-DEP-4: NÃO morde. `expo-doctor` 21 de 21 hoje (`L/e19-02-auditar-com-rede.txt`); o texto diz código 0.
- Rodada 2, `audit-raiz` e `audit-campo` aceitando qualquer código não zero: NÃO morde. Com `npm_config_registry=http://127.0.0.1:9` os dois divergem por "a saída não contém # npm audit report" (`L/e01-08`). Com rede, conferem (`L/e01-09-baseline-com-registro.txt`).
- Rodada 1, roteiro esperando números velhos e saindo 1 numa árvore verde: NÃO morde (CI 19 de 19, código 0).
- Rodada 1, "número esquecido reprova" falso: NÃO morde (a engenharia desta rodada plantou número velho no roteiro e `conferir:numeros` saiu 1; não repeti).

## Evidência

| Comando | Código | Saída |
| --- | --- | --- |
| `node --test scripts/baseline.test.mjs` | 0 | `L/e01-01-baseline-test.txt` |
| `node scripts/baseline.mjs --so-listar` | 0 | `L/e01-02-so-listar.txt` |
| `node L/sonda-redigir.mjs` | 0 | `L/e01-03-sonda-redigir.txt` |
| `node scripts/baseline.mjs --sem-instalar --so=test-scripts,conferir-numeros,expo-doctor --saida=L/bl-subset` | 3 | `L/e01-04-baseline-subset.txt` |
| mutações M1 a M3 (abaixo) e `node --test scripts/baseline.test.mjs` | 1 em cada | `L/e01-05`, `L/e01-06`, `L/e01-07` |
| `npm_config_registry=http://127.0.0.1:9 npm_config_fetch_retries=0 node scripts/baseline.mjs --sem-instalar --so=auditar,audit-raiz,audit-campo` | 3 | `L/e01-08-baseline-sem-registro.txt` |
| o mesmo com o registro padrão | 0 | `L/e01-09-baseline-com-registro.txt` |
| `npm run test:isolamento` | 0 | `L/e01-10-test-isolamento.txt` |
| `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E01 --sha 52952a1` | 0 | `L/00-conferir-evidencia.txt` |
| `gh run view 38618369218 --json jobs` e `--log --job` | 0 | `L/ci-00-jobs.txt` (9 de 9 `success`), `L/ci-job-*.log` |

## Cenários positivos

- CI Linux 19 de 19, código 0; Mac 15 de 17 com as duas divergências de máquina documentadas.
- Com rede, `auditar`, `audit-raiz` e `audit-campo` conferem.

## Cenários negativos

- Divergência real (pasta `ios/` presente): código 3, linha nomeada.
- Registro npm fora do ar: três passos divergentes, código 3.
- Segredos plantados num texto: redigidos.

## Tentativas de reprovar

- Mutação M1 (os passos de `npm audit` voltam a esperar só `{ codigo: "falha" }`): `baseline.test.mjs` 26 de 27, vermelho (`L/e01-05-mutM1-audit-sem-relatorio-VERMELHO.txt`).
- Mutação M2 (`avaliar` ignora contagem divergente): 26 de 27, vermelho (`L/e01-06`).
- Mutação M3 (`redigir` sem a regra de URL com credencial): 26 de 27, vermelho (`L/e01-07`).
- Depois de cada mutação, `git restore dc360/scripts/baseline.mjs`; 27 de 27 de novo; `git status --porcelain` só com as pastas `validacao/52952a1/`.
- Procurei passo que "confere" sem medir: os dois `npm audit` agora exigem o relatório. Achei o caso do registro que responde vazio (relatado na E19): ali `audit-raiz` e `audit-campo` DIVERGEM (código 0 contra falha esperada), então o roteiro pega o que o `auditar` sozinho não pega (`L/e19-01-registro-vazio.txt`).
- Procurei segredo fora dos três formatos prometidos: `Cookie` com valor de sessão, `x-api-key` e `?token=` passam sem redação (`L/e01-03`). A etapa não promete esses (achado 3).

## Achados

1. corrige antes de crescer (dono: E01, prazo do registro da E03 2026-10-18). A linha V-ROT-02 do registro da E03 (passo `e2e-firefox` no `baseline.mjs`) está atribuída à E01 e continua aberta neste candidato: `grep -c firefox dc360/scripts/baseline.mjs` dá 0. O texto da etapa pede o e2e em Chromium e Firefox na máquina limpa, e o CI cumpre isso (job de navegador); o roteiro reproduzível por uma segunda pessoa não. Se não for feito até 2026-10-18, a linha vence no registro da E03.
2. anotado (engenharia desta rodada, confirmado na leitura). `dc360/README.md` manda rodar o roteiro sem `--saida`, e o padrão grava por cima de `docs/evidencias-v2/G00/V2-F00-E01/saidas/`.
3. anotado (dono provável F01-E04, varredura de segredo). `redigir` não cobre `Cookie` de sessão, `x-api-key` nem `?token=`; hoje nenhuma saída do roteiro traz esses valores.

## Não verificado

- `npm ci` das duas árvores (proibido nesta máquina): a prova de instalação do zero é o job Linux do CI.
- Windows: não há Windows aqui; vale a medição das rodadas anteriores.
- O roteiro completo de 17 passos não foi repetido por mim: usei a linha de base do gatekeeper no SHA e repeti seis passos.
- Firefox local: o Playwright desta máquina não tem Firefox instalado (só Chromium e WebKit); o Firefox foi conferido no log do CI.

## Risco residual

- `npm audit` e `expo-doctor` dependem do dia: um patch novo do Expo faz o passo divergir (de propósito).
- No Mac o roteiro sai 3 pelas duas divergências de máquina; quem lê só o `RESUMO.md` gerado não vê a causa, que está em `COMO-REPRODUZIR.md`.

## Motivo do humano

Não se aplica.
