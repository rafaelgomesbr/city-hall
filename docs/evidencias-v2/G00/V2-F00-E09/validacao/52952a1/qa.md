---
validador: qa (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E09
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [UI, AUTH, API, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
Veredito: PASS. Os dois defeitos que reprovaram a rodada 2 (botão de Minha conta fora da coluna a 320 px e foco em `BODY` depois de encerrar) não mordem mais, medidos por mim no navegador em Chromium e WebKit, 320, 390 e 1280 px, claro e escuro; o e2e novo morde quando o conserto é desfeito. O funcional, a autorização e o isolamento resistiram a todas as tentativas.

Saídas em `$SP/val/qa/painel/` (abaixo, `painel/`). API própria (PGlite semeado) na 47611 e painel construído do SHA na 47612, derrubados no fim. Firefox não está instalado nesta máquina.

## Critérios verificados

| # | Critério (DoD, cinco campos, rodadas 1 e 2) | Resultado e prova |
| --- | --- | --- |
| 1 | 8 casos de `seguranca-da-conta.test.ts` verdes | PASS. `painel/01-web-vitest.txt`: 44 arquivos, 665 testes, 0 falha; o arquivo dá 8 de 8 |
| 2 | Administradora redefine a senha, a temporária entra e exige troca | PASS. `painel/22-e09-api.txt`: senha antiga 401, sessão antiga não renova (401), temporária entra, resto da API 403 `troca_de_senha_obrigatoria`, troca 200 |
| 3 | `GET /auth/sessoes` marca a atual, sem IP nem user-agent | PASS. Com `user-agent` marcado e `x-forwarded-for` de teste, o corpo traz só `entrouEm`, `validaAte`, `aparelho`, `atual`, com uma `atual` (`painel/22-e09-api.txt`) |
| 4 | Encerrar "as outras" mantém a de onde se clicou | PASS. Sonda de navegador: duas sessões extras abertas pela API passam a 401 na renovação, a página recarregada continua em Minha conta, 12 combinações (2 motores x 3 larguras x 2 temas), `painel/20-*` e `21-*` |
| 5 | Negativos: autoalvo 422, posto 403, outro município 404, agente 403, sem token 401 | PASS. `painel/22-e09-api.txt`: 422 `autoredefinicao` e `autoencerramento`; coordenadora contra administradora 403 `posto_insuficiente` nas três rotas; Vale Fundo contra conta de Serra Alta 404 com corpo idêntico ao de UUID inexistente nas três rotas, também com organização forjada em query, corpo e cabeçalho; Serra Alta contra conta de Vale Fundo 404; agente 403 `sem_permissao` nas três; sem token 401 |
| 6 | `GET /usuarios/:id/sessoes` só quantidade e datas | PASS. Devolve `id` (o do próprio alvo, ecoado), `sessoesAbertas`, `ultimaEntradaEm`, `validaAte`; minha asserção estrita reprovou só pelo `id` ecoado, que não é dado novo |
| 7 | Rodada 2, achado 1: botão "Encerrar minhas outras sessões" a 320 px | NÃO MORDE. Botão em 41..279 contra área útil 41..279, 58 px de altura em duas linhas, sem corte, sem rolagem no cartão nem na página, nenhum elemento do cartão fora da área útil; igual em Chromium e WebKit, claro e escuro. 390: 41..349 contra 41..349, 44 px. 1280: dentro (`painel/20-e09-sonda-chromium.txt`, `21-e09-sonda-webkit.txt`) |
| 8 | Rodada 2, achado 2: foco depois de encerrar | NÃO MORDE. Confirmado pelo teclado (foco no botão, Enter, foco no confirmar, Enter): 300 ms e 2,8 s depois o foco está em `DIV.aviso aviso--sucesso`, `tabindex=-1`, sem `role`, conectado, texto "As outras 3 sessões foram encerradas. Esta continua aberta."; o foco sobrevive à releitura da lista; nos dois motores, três larguras, dois temas |
| 9 | Rodada 1: janelas de Usuários a 320 px | NÃO MORDE. "Encerrar sessões de Bartolomeu Cavalcanti de Albuquerque Neto" e "Redefinir a senha de ..." quebram em 78 px de altura dentro da área útil (49..271 contra 48..272); janela da senha temporária sem nada fora; claro e escuro, Chromium e WebKit |
| 10 | Regressão obrigatória | PASS. `npm run test --workspace @dc360/web` 665 de 665; `npm run test:api` 1309 aprovados, 9 pulados, 1 falha (`openssl-do-teste.test.ts`, LibreSSL do macOS, divergência conhecida da máquina) com `sessoes-da-conta.test.ts` 27 e `superficie.test.ts` 9 verdes (`painel/06-test-api.txt`); `paridade-dos-modos.test.ts` 10 de 10; `npm run typecheck` código 0 (`painel/07-typecheck.txt`) |
| 11 | E2E seção 26 e geometria | PASS em Chromium: `npm run test:e2e:api` 288 aprovadas, 0 falha, zero erro de console, geometria 64 de 64 (`painel/04-test-e2e-api-chromium.txt`). Geometria sozinha em WebKit 63 de 63 com 1 pulada (Tab do motor) e de novo em Chromium 64 de 64 (`painel/05-layout-estreito-*.txt`) |

## Evidência

- `painel/00-build-shared.txt` (código 0), `01-web-vitest.txt` (código 0), `06-test-api.txt` (código 1 só pelo openssl), `07-typecheck.txt` (0), `09-test-scripts.txt` (260 de 260, 0).
- `painel/04-test-e2e-api-chromium.txt` (código 0) e `04-test-e2e-api-webkit.txt` (código 1: 283 de 288; as 5 falhas são do motor, ver Tentativas).
- Sondas minhas: `painel/scripts/e09-sonda.mjs` (saídas `20-` Chromium 73 de 73, `21-` WebKit 73 de 73, zero erro de console), `scripts/e09-api.mjs` (`22-`), `scripts/e09-leitura-encerrada.mjs` (`27-`).
- Capturas: `painel/capturas/e09-minha-conta-{chromium,webkit}-{320,390,1280}-{claro,escuro}.png`, `e09-minha-conta-confirmar-*`, `e09-minha-conta-depois-*`, `e09-usuarios-*-320-*`, `e09-senha-temporaria-*-320-claro.png`. Olhadas: `e09-minha-conta-chromium-320-escuro.png` (botão em duas linhas, alinhado às linhas de sessão) e `e09-minha-conta-depois-chromium-320-claro.png` (confirmação acima da sessão única). A barra fixa no meio das capturas de página inteira é efeito da captura, já registrado.
- Prova de que o teste morde: `painel/30-mutacao-e09.diff` (tirei `botao--quebra` do botão e anulei o efeito de foco em `MinhaConta.tsx`), painel mutante construído fora do repositório, `git restore` em seguida. `layout-estreito.e2e.mjs` contra o mutante: 60 aprovadas, 4 falhas, exatamente "Minha conta a 320 px ... sai da area util (41..295 contra 41..279)" e as três da seção 7 (foco em `BODY`) (`painel/31-layout-estreito-MUTANTE.txt`); minha sonda contra o mutante: 22 falhas (`32-`). `git status --porcelain` depois de restaurar: só as pastas `validacao/52952a1/` não rastreadas.

## Cenários positivos

Redefinir pela administradora, temporária, troca; listar as próprias sessões com a atual marcada; encerrar as outras pelo teclado nos dois motores; a página continua viva; janelas de Usuários e da senha temporária a 320 px.

## Cenários negativos

Outro município (404 idêntico ao inexistente, nos dois sentidos, com organização forjada em três lugares); posto igual ou maior (403); agente (403); autoalvo (422); sem token (401); sessões extras mortas depois de encerrar (401 na renovação).

## Tentativas de reprovar

1. Medi a geometria por conta própria (retângulo do botão contra o padding do `.cartao__corpo`, mais varredura de todo descendente do cartão) em vez de confiar no e2e do implementador: nada fora.
2. Esperei 2,8 s depois de encerrar para pegar uma releitura da lista que recriasse o aviso e soltasse o foco: o foco ficou.
3. Repeti tudo em WebKit: geometria e foco iguais. As 5 falhas da suíte principal em WebKit são do motor: Cancelar por clique não devolve o foco ao botão (o WebKit no macOS não dá foco a botão clicado; com teclado o foco volta, e minha sonda pelo teclado passou), a cópia da senha sem permissão de área de transferência e o Tab que não alcança links; a mesma classe já foi documentada pelo implementador (página mínima) e na rodada 2.
4. Forjei a organização em query, corpo e cabeçalho `x-organizacao-id`: 404 sempre.
5. Procurei a sessão encerrada lendo: o token de acesso de uma sessão encerrada ainda lê `GET /auth/sessoes` (200) e não escreve (401 `sessao_encerrada`), `painel/27-`. É a decisão documentada da rodada 2 (F03-E03); anotado.
6. Esc na janela da senha temporária: fecha e a senha some (`painel/20-`, linha "Esc ... dialog aberto=0"). Pendência humana já registrada (decisão de produto do Rafael).

## Achados

- anotado: Esc fecha a janela da senha temporária (decisão de produto pendente, já em `pendencias-humanas.md`).
- anotado: leitura de sessões com token de sessão encerrada responde 200 até o vencimento do acesso (decisão registrada, F03-E03).
- anotado: em WebKit, Cancelar por clique em Usuários deixa o foco em `MAIN`; comportamento do motor no macOS, sem efeito pelo teclado.
- anotado: Tab a partir da confirmação vai para "Pular para o conteúdo" porque não há controle focável depois do cartão (o cartão de verificação em duas etapas, desligada no servidor, não tem controle); não é perda de foco.

## Não verificado

- Firefox (não instalado nesta máquina); leitor de tela real (o anúncio por foco foi medido por atributo e `document.activeElement`, não por voz); aparelho físico; zoom de 200 por cento; 768 px medido só pelo e2e do implementador que eu rodei, não pela minha sonda.
- Modo local (demonstração) de Minha conta: só pelos testes de paridade e pelo e2e local (70 de 70 em Chromium), sem sonda minha.

## Risco residual

Anúncio por leitor de tela da confirmação (foco em `div` com `tabindex=-1`) depende de leitor real; senha temporária perdida por Esc enquanto a decisão de produto não vem.

## Motivo do humano

A etapa reserva ao Rafael a leitura da frase da senha única e das confirmações e a decisão sobre o Esc; o anúncio por leitor de tela é da pessoa com leitor (CP-32). O funcional foi provado por execução.
