---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E18
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [API, ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Notação: `$V` é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-qa-e14-18`. O produto em `dc360/` é idêntico entre `fd17ff4` e o HEAD `55209ab`. O diff da rodada (`1ed0b71..fd17ff4`) toca o que esta etapa preserva: `apps/api/src/servidor.ts` (`RegraDeNegocio` passa a recusar status que não é inteiro de 400 a 599), a guarda de 401 e 403 (que reescreve `writeHead`, `write` e `end` da resposta), `scripts/e2e-api.mjs` (motor `webkit` e `--so-layout`), o README e o workflow (WebKit no CI). O bloco de CORS e as rotas de armazenamento não mudaram. Mutações numa CÓPIA de `fd17ff4` (`git archive` em `$V/arv`, `node_modules` por link, sem `git worktree`), aplicadas, testadas e restauradas com conferência de SHA-256 por `$V/scripts/mutar.mjs`. Infra e CI é de outro validador; aqui provo o que roda localmente e cito os jobs.

| Critério (bloco da etapa) | Prova | Resultado |
| --- | --- | --- |
| `if-none-match` em `allowedHeaders`, nome a nome, sem curinga, `origin` da lista | `servidor.ts:425` (`origin: config.origens`) e `:442` (lista de quatro nomes); C1 (o conserto desfeito): 3 de 8 reprovam; C2 (curinga `*`): 4 reprovam; C2b (lista omitida, o plugin reflete o pedido): reprova "cabeçalho qualquer fora da lista não é liberado"; C3 (`origin: true`): reprova "origem fora da lista" | PASS |
| Teste de preflight devolve `if-none-match` | `test/cors-do-envio-de-evidencia.test.ts` 8 de 8 dentro de `npm run test:api` (106 arquivos, 1685 aprovados, 34 pulados, código 0) | PASS |
| Negativo: origem fora da lista sem `access-control-allow-origin`; `x-qualquer` não liberado | C3 e C2b mordem | PASS |
| Negativo: segundo PUT na mesma chave recusado (escrita única) | C4 (sem a checagem de 412 em `rotas/armazenamento-local.ts`): reprova | PASS |
| Autorização e isolamento: URL vencida, assinatura trocada, chave de outro município | C5 (expiração ignorada em `armazenamento/memoria.ts`): reprova "URL de envio vencida é recusada"; C6 (assinatura não conferida): reprovam "assinatura trocada" e "chave de um município não grava na de outro"; C7 (a assinatura deixa de cobrir a chave): reprova o caso entre municípios | PASS |
| `npm run test:e2e` (Chromium) e `MOTOR=firefox npm run test:e2e` verdes | painel construído e servido por `vite preview` na 4173: Chromium "Passou: 70   Falhou: 0", "Zero erro de console", código 0; Firefox "Passou: 70   Falhou: 0", código 0 (`$V/r-e2e-local-chromium.txt`, `$V/r-e2e-local-firefox.txt`) | PASS |
| `npm run test:e2e:api` verde, seção 13 sobe a foto | Chromium: "Passou: 288   Falhou: 0" (suíte principal) e "Passou: 197   Falhou: 0" (tela estreita), código 0, com "os bytes sobem direto para o armazenamento", "o servidor confirma o envio" e "a imagem carrega pela URL assinada" (`$V/r-e2e-api-chromium.txt`); Firefox (`node scripts/e2e-api.mjs firefox`): 288 e 197, código 0 (`$V/r-e2e-api-firefox.txt`); WebKit `--so-layout`: 196, código 0 (`$V/r-e2e-api-webkit.txt`) | PASS |
| O e2e morde (E2) | E18-E2E-C1: na cópia, com `if-none-match` fora do `allowedHeaders`, `node scripts/e2e-api.mjs` sai 1 na seção 13 com "page.evaluate: TypeError: Failed to fetch" (`$V/mut-e18-e2e/E18-E2E-C1.txt`, log `$V/e2e-c1.log`) | PASS |
| Regressão obrigatória | `npm run test:api` 0; `npm run test --workspace @dc360/web` 46 arquivos, 699 de 699, código 0 (inclui `duplicidade-sem-rede.test.ts` 3 de 3); os dois e2e acima | PASS |
| Documentação: README "Como testar" e pré-requisito | `dc360/README.md:1695-1697` e `:1749` (as execuções e `npx playwright install chromium firefox`); `:1840` cita o WebKit; ver Achados | PASS com achado anotado |
| Validação humana: Rafael vê o upload da seção 13 | não produzível por agente | pendência humana |

## Evidência

- `npm run test:api` código 0 (`$V/r-test-api.txt`).
- `npm run test --workspace @dc360/web` código 0 (`$V/r-test-web.txt`).
- `npm run build --workspace @dc360/web` código 0 (`$V/r-build-web.txt`), `vite preview --port 4173` (log `$V/preview.log`, derrubado depois).
- e2e: `$V/r-e2e-local-chromium.txt`, `$V/r-e2e-local-firefox.txt`, `$V/r-e2e-api-chromium.txt`, `$V/r-e2e-api-firefox.txt`, `$V/r-e2e-api-webkit.txt`, todos código 0. Portas 4173, 3691 e 4691 livres no fim; nenhum `vite`, `tsx` ou navegador meu vivo.
- Mutações: `$V/muts-e18.json` e `$V/muts-e18-e2e.json`, saídas em `$V/mut-e18/` e `$V/mut-e18-e2e/`, resumos `RESUMO.txt`.
- CI: run 39420436042, job "Fluxo ponta a ponta no navegador" (118619736549) `success`, com os passos "Modo local, no Chromium", "Modo local, no Firefox", "Caminho de produção, contra a API", "... no Firefox" e "... no WebKit (geometria e foco)" todos `success` e `shell: bash` (pipefail); job "Testes, tipos e scripts" (118619736871, "Suíte completa", que roda `test:api`) `success`; job "A API sobe contra Postgres real" (118619736336) `success`.

## Cenários positivos

- Preflight do PUT de envio com `content-type,if-none-match` vindo da origem do painel: liberado.
- A foto sobe pelo navegador contra a API e carrega pela URL assinada, em Chromium e Firefox.

## Cenários negativos

- Origem fora da lista: sem `access-control-allow-origin` (C3 morde).
- `x-qualquer`: não liberado; a lista é exatamente os quatro nomes (C2 e C2b mordem).
- Segundo PUT na mesma chave: 412 (C4 morde).
- URL vencida, assinatura trocada e URL de um município usada na chave de outro: recusadas e nada gravado (C5, C6, C7 mordem).

## Tentativas de reprovar

1. Desfiz o conserto (C1) no teste de unidade e no e2e inteiro: os dois ficam vermelhos, o e2e exatamente na seção 13 com o "Failed to fetch" original.
2. Troquei a lista por curinga e depois a omiti, que é o afrouxamento mais fácil de passar despercebido (C2, C2b): reprovam.
3. Abri a origem (C3) e desliguei a escrita única, a expiração, a assinatura e a cobertura da chave pela assinatura (C4 a C7): todas reprovam.
4. Procurei regressão do diff da rodada: a guarda nova intercepta toda resposta 401 e 403, e o armazenamento local responde 403 `assinatura` à URL vencida ou adulterada. O código `assinatura` está no catálogo com 403, os casos C5 e C6 passam na base com a frase do motivo, e o e2e não mostrou nenhum 500 `desvio_do_catalogo_de_erro`. O 412 `objeto_ja_existe` não é 401 nem 403 e passa intacto.
5. Rodei o e2e contra a API nos três motores, inclusive o WebKit que a rodada acrescentou: verdes.

## Achados

- anotado (documentação, introduzido pelo diff da rodada): `dc360/README.md:1840` passa a citar `node scripts/e2e-api.mjs webkit --so-layout`, mas o pré-requisito escrito em `:1695` e `:1749` continua `npx playwright install chromium firefox`, sem `webkit`; quem seguir o README e rodar o WebKit numa máquina nova encontra o navegador ausente. O CI instala os três (`verificar.yml`, passo "Instalar navegadores"). Conserto: acrescentar `webkit` ao pré-requisito.

Nenhum achado bloqueia.

## Não verificado

- CORS e PUT contra um armazenamento externo de verdade (S3 ou R2): fora da etapa (F06-E15); só o armazenamento local da API foi exercitado.
- O modo `corrigir` da guarda (fora de teste) nas respostas 403 do armazenamento: rodei no modo de teste e no e2e; não li o log de produção.
- Os logs e artefatos dos jobs do CI exigem token: li só as conclusões dos passos.
- Node 22 (o `.nvmrc`): rodei em Node 24.15.0.

## Risco residual

Baixo. Entra um único cabeçalho nominal, a origem continua a lista, e a escrita única e a assinatura seguem presas por teste que morde. O risco que fica é o do armazenamento externo, com CORS próprio, que só a F06-E15 prova.

## Motivo do humano

A etapa pede que o Rafael veja o upload da foto pelo painel concluir na seção 13 (`npm run test:e2e:api`): é a confirmação de pessoa de que o fluxo visível funciona.
