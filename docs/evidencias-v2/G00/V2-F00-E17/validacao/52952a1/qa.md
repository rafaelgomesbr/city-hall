---
validador: qa (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E17
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

| Critério (DoD e cinco campos) | Prova | Resultado |
| --- | --- | --- |
| 0 falhas em `test:scripts` | Mac: `npm run test:scripts`, 260 testes, 260 passam, 0 falha, 0 pulado (`E17-01`). Linux: CI run 38618369218, job "Testes, tipos e scripts", passo "Testes dos scripts": `# tests 260`, `# pass 256`, `# fail 0`, `# skipped 4` | PASS |
| Os 4 pulados seguem por ambiente (sem `ios/`) | Linux pula 4 (sem `apps/campo/ios/`); no Mac a pasta existe e os 4 rodam e passam (divergência de máquina conhecida) | PASS |
| 0 divergências em `conferir:numeros` | Mac: 25 afirmações conferidas, "Todos os números da documentação batem com a realidade", código 0 (`E17-02`). Linux: mesmo resultado no log do CI | PASS |
| `conferir:numeros` declara os pulos que a lista estática não enumera | saída: "0 ponto(s) de pulo incondicional com marca T42 ... 4 ponto(s) de pulo por ambiente" com os arquivos (`E17-02`) | PASS |
| Negativo: número alterado num rascunho reprova | três plantas, cada uma restaurada: (A) `README.md:1341` 1310 para 1309, código 1, "valor real é 1310 ou 258, e não 1309" (`E17-03`); (B) marcador de migrações de `docs/RESTORE-DO-BANCO.md` 50 para 49, código 1, "a pasta tem 50" (`E17-04`); (C) rascunho novo `docs/RASCUNHO-SONDA-QA.md` com "346 testes do banco", código 1, "valor real é 345" (`E17-05`) | PASS |
| Caso 37 reprova se o `mode` voltar a ser escrito à mão | `apps/campo/app.config.ts:597` trocado para `mode: "production"`: `node --test scripts/entitlements-do-ios.test.mjs` código 1, dois casos vermelhos (`E17-07`); restaurado | PASS |
| Caso 22 continua recusando repositório, iCloud, Dropbox, Google Drive, OneDrive e Área de Trabalho, e aceita pasta fora | leitura de `scripts/copiar-producao.test.mjs:57-71` (os sete `assert` e a aceitação de `dc360-copias`); mutação: `"Dropbox"` retirado de `scripts/copiar-producao.mjs:116`, o caso reprova (`E17-08`); restaurado | PASS |
| Caso 19 com invocação portátil | `scripts/comando-de-migracao.test.mjs` usa `execFileSync("npm", ...)` com o comentário do `shell` no Windows; verde no Mac e no Linux. Windows não reexecutado nesta rodada (provado nas rodadas 1 e 2) | PASS (Mac e Linux) |
| Regressão `npm test` | `npm test` (`R-01`): shared 168, motor de campo 223, console 259, painel 665, banco 345 mais 3 pulados, API 1309 passam, 9 pulados e 1 falha, a de `openssl-do-teste.test.ts` (LibreSSL do macOS, divergência conhecida). Código 1 só por ela | PASS com a divergência conhecida |

Defeitos e achados das rodadas 1 e 2, reexecutados:

- Rodada 2, "afirmação com a palavra `casos` escapa do `conferir:numeros`": AINDA MORDE. Rascunho com "A API tem 999 casos automatizados" passa sem reprovar (`E17-06`). Também passa "A pasta db/migrations tem 47 migrações" escrito sem o marcador: o portão só confere migrações na linha que traz `<!-- numeros: migracoes=N -->`. Anotado abaixo.
- Rodada 1, `razaoParaRecusarAPasta` sem distinção de caixa no Windows: não reexecutável no Mac (sistema de arquivos e `resolve` diferentes); segue como estava, pasta fixa.
- Rodada 1, `conferir:numeros` não lia `baseline.mjs`: CONSERTADO; a saída diz "O roteiro da linha de base espera o mesmo total de casos que a árvore tem, nas oito suítes".

## Evidência

Saídas em `$SP/val/qa/lote4/`:

- `00-build-shared.txt`: `npm run build:shared`, código 0.
- `E17-01-test-scripts.txt`: código 0, 260 de 260.
- `E17-02-conferir-numeros.txt`: código 0, 25 conferidas.
- `E17-03-sonda-A-readme-1309.txt`, `E17-04-sonda-B-marcador-49.txt`, `E17-05-sonda-C-rascunho.txt`: código 1 cada.
- `E17-06-sonda-D-casos-e-migracoes-sem-marcador.txt`: código 1, mas só pela linha "12 testes"; "999 casos" e "47 migrações" não aparecem.
- `E17-07-mut-mode-a-mao.txt`, `E17-08-mut-sem-dropbox.txt`: código 1.
- `R-01-npm-test.txt`: regressão.
- `CI-116039196254.log`: log do job "Testes, tipos e scripts" do run 38618369218.

`git status --porcelain` depois de cada restauração: só as pastas `validacao/52952a1/` não rastreadas, nada mais.

## Cenários positivos

- `test:scripts` e `conferir:numeros` verdes no Mac e no Linux do CI, sobre o mesmo produto (`7585801` só muda o STATUS).

## Cenários negativos

- Número errado no README, no marcador de migrações e num rascunho novo: os três reprovam com a mensagem certa.
- `mode` escrito à mão: reprova. Dropbox fora da lista: reprova.

## Tentativas de reprovar

- Procurei forma de frase que o portão não lê: "N casos" e "N migrações" sem marcador passam (achado anotado, já registrado na rodada 2 para "casos").
- Conferi se o verde do Mac esconde pulo: no Mac 0 pulado, no Linux 4 pulados; a diferença é a pasta `ios/`, e o próprio `conferir:numeros` não depende disso.
- Conferi a contagem que a etapa mandava declarar (API 1104 contra 1109): hoje a lista dá 1310 e a execução 1319 (1310 mais 9 pulados por ambiente); o `conferir:numeros` declara os 4 pontos de pulo por ambiente do vitest, então a diferença tem origem dita na saída.

## Achados

- anotado (dono: E17 ou F01-E03): `conferir:numeros` não confere "N casos" nem contagem de migrações fora da linha marcada. Reprodução: rascunho `docs/RASCUNHO-SONDA-QA.md` com "A API tem 999 casos automatizados." e "A pasta db/migrations tem 47 migrações."; `npm run conferir:numeros` não acusa nenhuma das duas (`E17-06`). Foi exatamente prosa de migrações sem conferência que reprovou a E22 na rodada 2.

## Não verificado

- Execução no Windows nesta rodada (a máquina é Mac). Provada nas rodadas 1 e 2; o diff `4b96ea7..52952a1` em `scripts/` não toca os três casos da etapa.

## Risco residual

Baixo. O portão de números é mais forte que na rodada 2 (marcador de migrações), mas continua cego para frases que não usam "teste" ou "verificação".

## Motivo do humano

Não se aplica.
