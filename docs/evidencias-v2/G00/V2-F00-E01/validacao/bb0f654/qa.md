---
validador: qa (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E01
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---

Pasta das saídas deste validador (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/qa-lote2/` (abaixo, `SAIDAS/`). Máquina: Mac, Node v24.15.0, npm 11.12.1, LibreSSL do sistema, pasta `dc360/apps/campo/ios/` presente. Árvore em `0290af5` (só STATUS e ESTADO-ATUAL diferem de `bb0f654`).

## Critérios verificados

| Critério (DoD e cinco campos de teste) | Resultado | Prova |
| --- | --- | --- |
| `dc360/.nvmrc` com `22` | PASS | `cat dc360/.nvmrc` devolve `22` |
| `baseline.test.mjs` verde | PASS | `node --test scripts/baseline.test.mjs`: 29 de 29, código 0 (`SAIDAS/e01-02-baseline-test.txt`) |
| `--so-listar` imprime sem executar nem criar pasta | PASS | lista os 20 passos (com `e2e-firefox`); com `--saida=` apontando para pasta nova, a pasta não foi criada |
| Execução completa devolve os números esperados | PASS (com 2 divergências da máquina, explicadas) | `node scripts/baseline.mjs --sem-instalar --saida=SAIDAS/baseline-completo`: 18 passos, 16 conferem, código 3, 6 min 50 s (`SAIDAS/baseline-completo/RESUMO.md`, `SAIDAS/baseline-completo.log`) |
| Redação de JWT, Bearer, URL com credencial antes de gravar | PASS | sonda independente sobre `redigir` (`SAIDAS/e01-01-sonda-redigir.txt`): JWT, Bearer, Basic, URL de banco com usuário e senha, pasta pessoal (Mac e Windows) e travessão saem todos redigidos; varredura das 18 saídas da minha rodada: nenhum JWT, Bearer, URL com senha, pasta pessoal nem travessão |
| Resultado diferente marca "divergente" e sai com código diferente de 0, sem esconder | PASS | a própria rodada no Mac: `teste-api` e `test-scripts` marcados `divergente` com o detalhe, código de saída 3; opção inválida sai 2 (`SAIDAS/e01-03-opcao-invalida.txt`) |
| `test:isolamento` inteiro e verde | PASS | passo `teste-db`: 345 aprovados, 3 pulados por ambiente, código 0 (`SAIDAS/baseline-completo/03-teste-db.txt`) |
| E2E (Chromium, Firefox, contra a API) rodam e ficam registrados | PASS | `e2e` "Passou: 70 Falhou: 0"; `e2e-firefox` "Passou: 70 Falhou: 0"; `e2e-api` "Passou: 288" e "Passou: 64", código 0 |
| Documentação: tabela comando x esperado, o que o CI roda e não roda | PASS | `COMO-REPRODUZIR.md` e `dc360/README.md` (seção do roteiro) descrevem os códigos 0, 1, 2 e 3, os 20 passos e as duas divergências do Mac |
| Zero segredo na evidência | PASS | varredura de `docs/evidencias-v2/G00/V2-F00-E01/` (fora `validacao/`): 0 ocorrência de JWT, Bearer, URL com senha ou pasta pessoal; 0 travessão em `.md` |
| `INDEX.md` byte a byte | PASS | script próprio contra os blobs de `bb0f654`: raiz 55 de 55, `saidas/INDEX.md` 19 de 19, `correcao-1/saidas/INDEX.md` 19 de 19, nenhum arquivo fora do índice (`SAIDAS/index-conferencia.txt`); `node scripts/conferir-indices-de-evidencia.mjs` OK, 61 índices |
| Procedimento repetido por segunda pessoa e CI Linux | NÃO VERIFICADO por esta dimensão | ver "Não verificado" |

## Evidência

- `cd dc360 && node scripts/baseline.mjs --sem-instalar --saida=SAIDAS/baseline-completo` (código 3). Resultado por passo: typecheck 0; shared 170; db 345 e 3 pulados; pacote de campo 223; API 1347 casos, 1326 aprovados, 20 pulados, 1 falha (`openssl-do-teste.test.ts`, "respeita OPENSSL_CONF válido", LibreSSL); console 259; painel 665; jest do aplicativo 1927; `test:campo` 0; `test:scripts` 288, 0 falhas, 0 pulados (esperado 4, porque `apps/campo/ios/` existe); `conferir:numeros` 0; `auditar` 0; `npm audit` cru raiz e campo código 1 com relatório (confere); `expo-doctor` 21 de 21; os três E2E verdes.
- `node --test scripts/baseline.test.mjs` (código 0, 29 casos).
- `node SAIDAS/../../qa-scripts/sonda-redigir.mjs` (código 0).
- Conferência de INDEX: `node qa-scripts/conferir-index.mjs bb0f654 ...` (código 0).

## Cenários positivos

- Roteiro completo sem `npm ci`: 16 de 18 conferem, os três E2E e o isolamento verdes.
- `--so-listar` lista 20 passos e não cria a pasta de saída.

## Cenários negativos

- Divergência real (a da máquina) sai como `divergente`, com o motivo, e código 3; nada é escondido como "confere".
- Opção desconhecida: código 2 ("roteiro quebrado").
- Texto com JWT, Bearer, Basic, URL de banco com credencial, pasta pessoal e travessão: tudo redigido.

## Tentativas de reprovar

1. Procurei regressão do roteiro depois da correção 4 da E03 (passo `e2e-firefox`): o passo roda e confere (70 de 70); `COMO-REPRODUZIR.md` diz 20 passos e 18 com `--sem-instalar`, coerente com o `--so-listar`.
2. Conferi se as duas divergências do Mac são mesmo de máquina e se o roteiro e o texto dizem isso: a falha é só o caso do OpenSSL 3 (o resto da API passa, 1326 aprovados); os 4 casos de `test:scripts` que deveriam pular rodam e passam porque `apps/campo/ios/` existe. `COMO-REPRODUZIR.md` ("Medido em 2026-10-14 num Mac") e `dc360/README.md` (linhas 1207 a 1220) explicam as duas; o comentário do passo `test-scripts` em `baseline.mjs` diz "sem pasta ios/".
3. Varri a saída da minha rodada e a pasta de evidência atrás de segredo e de pasta pessoal: nada.
4. Conferi o INDEX contra os blobs commitados, e não contra o disco: bate.

## Achados

- Anotado (não quebra critério): os números citados como medição datada em `COMO-REPRODUZIR.md` e em `dc360/README.md:1208-1213` ("1319 casos impressos, 9 deles pulados", "15 de 17") são de 2026-10-14; em `bb0f654` a API imprime 1347 casos com 20 pulados (a correção 3 da E07 acrescentou casos de Postgres real em `renovacao-contra-encerramento.test.ts`) e o Mac dá 16 de 18. O texto está datado e o próprio documento avisa que as medições datadas são de antes do passo do Firefox, então não é afirmação falsa, mas fica velho. Reprodução: `grep -E "Tests " SAIDAS/baseline-completo/05-teste-api.txt`.

## Não verificado

- O run 39143791434 do CI (Linux, `npm ci` das duas árvores, 20 de 20): não lido nesta sessão (sem `gh` autenticado). A prova de máquina limpa e de Linux é dessa leitura (dimensão Infra e CI).
- Os dois passos `npm ci`: proibidos nesta máquina (`29-operacao-do-ambiente.md`), não rodados.
- Node 22: a rodada foi em Node 24.

## Risco residual

Baixo. O roteiro e a redação provam-se por execução; o que falta é a reprodução em Linux limpo, que depende do CI não lido.

## Motivo do humano

Nenhum para esta dimensão. A "segunda pessoa em máquina limpa" foi substituída pela emenda D-30 (CI Linux mais leitura a frio), cuja prova é o run do CI que fica com a dimensão Infra e CI.
