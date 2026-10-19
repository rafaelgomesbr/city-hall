---
validador: testes (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E18
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [API, ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito: **PASS** na dimensão testes. O teste de preflight e o e2e contra a API mordem quando `if-none-match` sai do CORS; cada negativo de segurança do PUT (origem fora da lista, cabeçalho fora da lista, curinga, escrita única, URL vencida, assinatura trocada, chave de outro município) reprova sozinho quando a sua conferência é desligada. As três execuções do bloco rodaram nesta máquina, cada uma 3 vezes, todas verdes: e2e local em Chromium e em Firefox (70 de 70) e e2e contra a API em Chromium e em Firefox (288 e 64). Diferente da rodada 3, o Firefox do Playwright está instalado aqui, então o e2e contra a API em Firefox (onde apareceu V-INS-06) foi executado e não só lido do CI. A única mudança da etapa desde a rodada 3 é a espera de conexão na seção 23 de `apps/web/test/fluxo-api.e2e.mjs` (V-INS-06); `servidor.ts` mudou só no tratamento de corpo ilegível (E07), fora do CORS.

Saídas em `$V` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/testes-E06-E14-E15-E16-E18/`. Mutações por `$V/mutar.py` (troca exata, roda, `git restore`, confere `git status` vazio).

| Critério | Teste que prende | Mutação | Resultado |
| --- | --- | --- | --- |
| preflight devolve `if-none-match` | `apps/api/test/cors-do-envio-de-evidencia.test.ts` | C1: tira `if-none-match` de `allowedHeaders` (`servidor.ts:420`) | morde: 3 de 8 reprovam (`e18-10`) |
| seção 13 sobe a foto pelo navegador contra a API | `fluxo-api.e2e.mjs`, seção 13 | C1 com `node scripts/e2e-api.mjs chromium` | morde: "page.evaluate: TypeError: Failed to fetch" na seção 13, código 1 (`e18-21`) |
| origem fora da lista sem `access-control-allow-origin` | "origem fora da lista não recebe ..." | C2: `origin: true` | morde: 1 reprova (`e18-11`) |
| sem curinga | "cabeçalho qualquer fora da lista não é liberado" e o da origem | C3: `allowedHeaders: ["*"]` | morde: 4 reprovam (`e18-12`) |
| `x-qualquer` fora da lista | idem (lista exata) | C4: acrescenta `x-qualquer` | morde: 1 reprova (`e18-13`) |
| a lista é nominal (não reflete o pedido) | idem | C5: tira `allowedHeaders` (o plugin passa a refletir o que o navegador pede) | morde: 1 reprova (`e18-14`) |
| URL vencida recusada | "URL de envio vencida é recusada" (relógio controlado) | S1: desliga a conferência de `expira` em `armazenamento/memoria.ts` | morde: 1 reprova (`e18-15`) |
| assinatura trocada e chave de outro município recusadas, nada gravado | "assinatura trocada ..." e "URL assinada para a chave de um município não grava na chave de outro" | S2: desliga a conferência do HMAC | morde: 2 reprovam (`e18-16`) |
| segundo PUT na mesma chave recusado (escrita única) | "o primeiro PUT grava, e um segundo ... é recusado" | S3: desliga a conferência de objeto existente em `rotas/armazenamento-local.ts` | morde: 1 reprova (`e18-17`) |
| registrar sem sinal diz a frase de escrita (defeito achado pela suíte, seção 19) | `apps/web/test/duplicidade-sem-rede.test.ts` | W1: tira a troca para `SemConexao(false)` em `possiveisDuplicidades` | morde: 1 de 3 reprova (`e18-41`) |
| e2e local, Chromium | `apps/web/test/fluxo.e2e.mjs` | execução, 3 vezes | PASS: 70 de 70, código 0, nas 3 (`e18-32-*`) |
| e2e local, Firefox | idem com `MOTOR=firefox` | execução, 3 vezes | PASS: 70 de 70, código 0, nas 3 (`e18-33-*`); a variável chega ao processo (sonda `MOTOR=nada` responde "motor desconhecido", `e18-34`) |
| e2e contra a API, Chromium | `node scripts/e2e-api.mjs chromium` | execução, 3 vezes | PASS: 288 e 64, zero erro de console, "TUDO CERTO", código 0 (`e18-20`, `e18-23-*`) |
| e2e contra a API, Firefox | `node scripts/e2e-api.mjs firefox` | execução, 3 vezes | PASS: 288 e 64, zero erro de console, código 0 (`e18-22`, `e18-24-*`) |

## Evidência

- `cd dc360/apps/api && npx vitest run test/cors-do-envio-de-evidencia.test.ts --sequence.shuffle`, 3 vezes: código 0, 8 de 8 (`$V/e18-01-cors-unit-*.txt`).
- `cd dc360/apps/web && npx vitest run test/duplicidade-sem-rede.test.ts --sequence.shuffle`, 3 vezes: 3 de 3 (`$V/e18-40-*`).
- e2e contra a API: `node scripts/e2e-api.mjs chromium` e `firefox` (portas 3691 e 4691 livres antes e depois; o roteiro derruba a API e o painel): 3 rodadas de cada (`$V/e18-20`, `e18-22`, `e18-23-*`, `e18-24-*`).
- e2e local: `npm run build --workspace @dc360/web` no modo padrão (`$V/e18-30`), `npx vite preview --port 4173 --strictPort` (PID 16142, anotado em `$V/e18-31-pid.txt` e derrubado ao fim; porta 4173 livre depois), `node test/fluxo.e2e.mjs` 3 vezes em Chromium e 3 em Firefox (`$V/e18-32-*`, `e18-33-*`). Playwright 1.62.1, navegadores em `~/Library/Caches/ms-playwright` (chromium-1243, firefox-1538).
- `npm run test:api` inteiro: 1326 aprovados, 20 pulados, 1 falha conhecida do LibreSSL (`openssl-do-teste.test.ts`), fora da etapa (`$V/00-test-api-completo.txt`).
- Mutações: `$V/e18-10` a `e18-17`, `e18-21`, `e18-41`, cada uma com "restaurado: True".
- Portão T42: `node scripts/portao-de-skip.mjs` código 0.
- `apps/web/dist` (ignorado pelo git) foi reconstruído pelo roteiro e, por último, no modo padrão.

## Cenários positivos

- O PUT da foto passa pelo preflight de navegador real, em Chromium e em Firefox, com origens diferentes (painel em `localhost:4691`, API em `127.0.0.1:3691`), e a imagem carrega pela URL assinada.
- O fluxo A (a prefeitura registra uma ocorrência manual) passa no modo local nos dois motores.

## Cenários negativos

- Sem `if-none-match` liberado, o navegador bloqueia o PUT e o e2e reprova; o teste por `inject` concorda.
- Origem fora da lista, curinga, cabeçalho a mais, reflexo do pedido, URL vencida, assinatura trocada, chave de outro município e segundo PUT: cada um reprova sozinho quando a sua conferência é desligada.

## Tentativas de reprovar

1. Tirei `if-none-match` do CORS e rodei unidade e navegador: os dois reprovam.
2. Afrouxei o CORS de quatro jeitos (origem qualquer, curinga, cabeçalho a mais, sem lista): os quatro reprovam. O teste confere a lista EXATA, não só a presença.
3. Desliguei, uma de cada vez, expiração, HMAC e escrita única: os três reprovam, e o teste confere também que nada foi gravado nas chaves.
4. Repeti cada e2e 3 vezes, inclusive o Firefox contra a API, que era o instável (V-INS-06): 12 de 12 execuções verdes.
5. Li a espera nova da seção 23 (`irParaQuandoOPainelResponder`): só repete em erro de conexão (`CONNECTION_REFUSED`, `ECONNREFUSED`, `NS_ERROR_NET_RESET`), com limite de 30 s, e sobe qualquer outro erro na hora; não transforma página errada em verde. A repetição em `NS_ERROR_NET_RESET` poderia esconder uma queda do painel por até 30 s, mas a navegação seguinte exige o campo `#entrada-email`, então um painel quebrado ainda reprova.
6. Procurei espera fixa no teste de CORS: nenhuma.

## Achados

### CORRIGE ANTES DE CRESCER

1. **V-INS-06 vence hoje e segue ABERTO no registro.** `docs/evidencias-v2/G00/V2-F00-E03/classificacao-dos-vermelhos.md:266` dá prazo 2026-10-18, dono `rafael`, etapa V2-F00-E18; a linha 337 ainda diz ABERTO, e a espera nova da seção 23 é o "trabalho" que ela pede. Minhas 3 rodadas em Firefox contra a API passaram, mas falta de reprodução não é prova de conserto (o próprio registro diz isso), e eram no macOS, não no Windows onde a falha apareceu. A partir de amanhã o item está vencido pela política T42 (o `portao-de-skip.mjs` não lê esse registro em markdown, por isso continua verde). Ação: fechar com a medição ou renovar o prazo com dono. Dono: E18 ou E03.

### ANOTADO

- Esperas fixas nos e2e (anotado na rodada 3): produzem vermelho intermitente, não verde falso.
- O CI roda o e2e contra a API só em Chromium; o Firefox contra a API depende de execução local.

## Não verificado

- O CI do SHA (run 39143791434) não foi lido; a dimensão Infra e CI cobre isso.
- e2e em Windows (onde V-INS-06 apareceu): só macOS aqui.
- S3 real e CORS do armazenamento externo: fora do escopo (F06-E15).

## Risco residual

Baixo. O conserto é uma linha, as duas camadas de teste reprovam sem ela, os negativos de segurança mordem um a um, e os quatro e2e passaram 3 vezes cada nesta máquina.

## Motivo do humano

Nenhum para esta dimensão.
