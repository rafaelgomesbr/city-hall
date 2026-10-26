---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E09
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [UI, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: nenhum
---
Veredito: FAIL. O funcional está inteiro e resistiu a todas as tentativas de quebra. Reprova pelo portão visual da seção 0 de `19` (regra inegociável do Rafael) em tela que a própria etapa criou, e pelo foco que a DoD diz que volta ao botão e não volta.

Saídas e temporários ficam em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/qa-painel/` (abaixo, `qa-painel/`). API minha na porta 3991 (banco em memória, semente nova a cada partida) e painel do SHA, construído fora do repositório, na 4991. Scripts de Playwright em `qa-painel/e09*.mjs`. Nada foi commitado e a árvore ficou limpa.

## Critérios verificados

| # | Critério (DoD, testes positivos, negativos, isolamento) | Resultado |
| --- | --- | --- |
| 1 | Os 8 casos de `seguranca-da-conta.test.ts` verdes | PASS. `qa-painel/web-vitest.txt`: 43 arquivos, 649 testes, código 0; o arquivo isolado dá 8 de 8 |
| 2 | Administradora redefine a senha, o login com a temporária exige a troca | PASS. A senha antiga dá 401, a temporária entra e o resto da API responde 403 `troca_de_senha_obrigatoria`; trocar a temporária dá 200 (`qa-painel/e09-chromium.txt`) |
| 3 | `GET /auth/sessoes` marca a sessão atual | PASS. Uma sessão com `atual: true`; três renovações da mesma entrada contam como UMA sessão, e o token anterior às renovações também marca a mesma como atual (`qa-painel/e09-cadeia.txt`) |
| 4 | Encerrar "as outras" mantém a de onde se clicou | PASS na API (diz 2, mantém 1, renovação da outra dá 401) e em dois navegadores reais (o segundo cai na entrada com "Sua sessão foi encerrada." na gravação seguinte, o primeiro segue vivo depois de recarregar; Chromium, Firefox, WebKit) |
| 5 | Encerrar sessões de outra pessoa derruba de fato | PASS. A coordenadora encerra, o navegador de Jonas cai na entrada na ação seguinte, o token antigo recebe 401 na escrita (`qa-painel/e09-chromium.txt`) |
| 6 | Senha temporária única | PASS (detalhe abaixo) |
| 7 | Sessões sem IP e sem user-agent | PASS. Cabeçalho `user-agent` com marca única e `x-forwarded-for` de teste: o corpo de `GET /auth/sessoes` traz só `entrouEm`, `validaAte`, `aparelho` (frase) e `atual`; `GET /usuarios/:id/sessoes` traz `sessoesAbertas`, `ultimaEntradaEm`, `validaAte` |
| 8 | Botões atrás de `ConfirmarAcao`, só quando permitido, nunca na própria conta, e o modo local explica | PASS. Helena vê os dois botões em Jonas e Diego e em mais ninguém; Rita vê em Helena, Jonas e Diego e não na própria linha; no modo local (painel sem API, porta 4173) nenhum botão, e as duas telas trazem a frase "não há senha para redefinir nem sessão para encerrar" (`qa-painel/e09-botoes.txt`) |
| 9 | Autorização e isolamento | PASS. `qa-painel/e09-iso.txt`: coordenador de Vale Fundo contra usuário de Serra Alta e o inverso, nas três rotas, 404 com corpo idêntico ao de UUID inexistente; `organizacao_id` no corpo ou na query não muda nada; agente nas três rotas 403 `sem_permissao`; coordenadora contra administradora 403 `posto_insuficiente`; autoalvo 422; sem token 401 |
| 10 | Portão visual (390 px e 320 px) | FAIL (achado 1) |
| 11 | Acessibilidade da DoD: "foco devolvido ao botão" | FAIL em Minha conta (achado 2) |

### Senha temporária: não reaparece, não fica guardada

`qa-painel/e09-chromium.txt` (e Firefox e WebKit): depois de fechar a janela, de recarregar e de voltar pelo botão do navegador a senha não está no DOM; `localStorage`, `sessionStorage`, `history.state`, `document.cookie`, `storageState` do contexto e a lista de bancos IndexedDB (vazia) não a contêm; nenhuma URL requisitada a contém. Na API: não aparece no log (`qa-painel/e09-log.txt`), a resposta vem com `cache-control: no-store`, `GET /usuarios` não a devolve, a trilha não a traz. Duas redefinições seguidas geram senhas diferentes, a primeira passa a dar 401 e a segunda entra (`qa-painel/e09-duas.txt`).

## Evidência

- Navegador, três motores: `qa-painel/e09-chromium.txt` (35 de 36; a falha é o foco, achado 2), `e09-firefox.txt` (35 de 36, mesma falha), `e09-webkit.txt` (36 de 36; o foco cai em `MAIN`, o WebKit do Playwright se comporta diferente).
- Medição a 320, 360 e 390 px: `qa-painel/e09-320-chromium.txt`, `e09-320-firefox.txt`; capturas `qa-painel/cap/cartao-sessoes-chromium-320.png`, `cartao-sessoes-firefox-320.png`, `minha-conta-<motor>-<largura>.png`.
- Linha de base do gatekeeper no SHA (`baseline/16-e2e.txt`, 70 de 70; `baseline/17-e2e-api.txt`, 279 mais 50 de `layout-estreito`) e a minha repetição do e2e contra a API em Chromium e em Firefox, por cópia do `scripts/e2e-api.mjs` em portas e pasta de build próprias: `qa-painel/e2e-api-chromium.txt` e `e2e-api-firefox.txt`, 279 mais 50, zero falha, zero erro de console, nos dois.
- Prova de que o teste que pegou a falha da rodada 1 morde: troquei `white-space: normal` por `nowrap` em `.modal__rodape .botao` (`apps/web/src/estilos/app.css`), construí o painel numa pasta do scratchpad e rodei `test/layout-estreito.e2e.mjs`: 46 passaram e 4 falharam, exatamente as janelas "Encerrar sessões" e "Redefinir senha" a 320 e 390 px ("rolagem horizontal da janela (370 contra 270)", "(405 contra 340)"), `qa-painel/mut-e09-nowrap-layout-estreito.txt`. Restaurei com `git restore`; `git status --porcelain` limpo fora dos relatórios.

## Cenários positivos

Redefinir, entrar com a temporária, trocar; listar sessões; encerrar as outras; encerrar as de terceiro; os três motores; modo local explicando.

## Cenários negativos

Outro município (404 nas três rotas, dos dois lados); posto igual ou maior (403); papel sem permissão (403); autoalvo (422); sem token (401); duplo clique no confirmar de "Redefinir senha" gera um POST só (`pedidosRed.length === 1`); a senha antiga e a primeira temporária mortas; token de sessão encerrada não escreve (401). O clique fora da janela da senha temporária não fecha: não repeti, cito a prova do agente de navegador (`web/RELATORIO.md`, T2) e a da acessibilidade (`a11y/a2.log`).

## Tentativas de reprovar

1. Confirmei por execução os dois FAIL de outros validadores, com o cenário que os provou (não aceitei a medição deles): achados 1 e 2.
2. Tentei vazar a senha por todos os caminhos de armazenamento do navegador, por histórico, por recarga e por log da API: não vaza.
3. Tentei duas janelas e depois três contextos (Helena encerrando as sessões de Jonas com Jonas em outro navegador): o segundo e o terceiro caem; o token de acesso antigo não escreve.
4. Tentei o token de sessão encerrada em leitura: ver achado 4.
5. Tentei provar que o e2e novo cobre a tela Minha conta: não cobre (achado 1); o e2e fica verde (279 mais 50) com o botão fora da coluna.
6. Tentei trocar a organização por corpo, por query e por UUID de outro município: sempre 404 igual ao de UUID inexistente.

## Achados

Primeiro balde, BLOQUEIA (1 item):

1. **Portão visual, Minha conta a 320 px, botão "Encerrar minhas outras sessões" fora da coluna.** Dono: E09 (`MinhasOutrasSessoes` em `apps/web/src/paginas/MinhaConta.tsx`; `.botao` é `white-space: nowrap`, e a correção 1 só soltou a quebra dentro de `.modal__rodape`). Reprodução: entrar como Jonas com pelo menos uma outra sessão, abrir `/minha-conta` com a janela em 320 px, medir. Esperado: botão dentro da coluna das linhas de sessão (portão da seção 0 de `19`: nada desalinhado, nenhum card grudado). Obtido, Chromium: o botão ocupa x 41 a 295 e as linhas de sessão acima x 41 a 279, 16 px além da coluna, a 8 px do limite do corpo do cartão (x 17 a 303); Firefox: `div.cartao__corpo` com `scrollWidth 303 > clientWidth 286`, o botão vai a 296 de 303. A 360 e 390 px cabe. Evidência: `qa-painel/e09-320-chromium.txt`, `e09-320-firefox.txt`, `qa-painel/cap/cartao-sessoes-firefox-320.png`. Confirma o FAIL do UX. A causa de o e2e não ter pego: `layout-estreito.e2e.mjs` mede só as duas janelas e a barra, não a tela Minha conta; por isso 279 mais 50 aprovadas convivem com o defeito. A correção precisa trazer a verificação nova nesse arquivo.

Segundo balde, CORRIGE ANTES DE CRESCER:

2. **Foco cai em `BODY` depois de confirmar "Encerrar minhas outras sessões".** Dono: E09. O botão que abriu a janela deixa de existir (a seção só o mostra com outra sessão) e a DoD diz "foco devolvido ao botão". Reprodução: Tab até o botão, Enter, confirmar; `document.activeElement` é `BODY` em Chromium e em Firefox (`qa-painel/e09-chromium.txt` e `e09-firefox.txt`, linha "FOCO depois de encerrar..."); no WebKit do Playwright é `MAIN`. Em Usuários o foco volta ao botão da linha. Nenhum teste do repositório cobre isso. Mesmo achado do validador de acessibilidade.
3. **Esc fecha a janela da senha temporária e a senha some** (o clique fora é protegido, o Esc não). Decisão de produto, já anotada pela UX e pela acessibilidade; reproduzi (`e09-chromium.txt`, "Esc fecha a janela da senha"). Quem apertar Esc por reflexo perde o único exemplar e precisa redefinir de novo.
4. **`GET /auth/sessoes` e `GET /usuarios/:id/sessoes` aceitam token de sessão já encerrada** (leitura pura, janela de `ACESSO_MINUTOS`). Reprodução: entrar, entrar de novo em outro lugar, encerrar as outras com a segunda; o token de acesso da primeira ainda lista as sessões da conta com 200 (`qa-painel/e09-cadeia.txt`, última verificação). O que vaza é só a lista de aparelhos e datas da própria conta. É a decisão documentada (leitura confia na assinatura até a F03-E03), mas numa rota cujo assunto é a sessão ela soa estranha; registrar na F03-E03.

Terceiro balde, ANOTADO:

5. Sete dos oito casos de `seguranca-da-conta.test.ts` leem texto do fonte (já registrado na rodada 1); o comportamento está nos e2e e em `sessoes-e-senha-temporaria.test.ts`.
6. A lista "Minhas sessões" não tem teto: depois de 14 entradas da mesma conta ela mostra 14 linhas quase iguais ("Aparelho não identificado"), sem como distinguir (a UX já anotou).
7. Na lista de Usuários a 390 px a coluna das duas ações novas fica atrás da rolagem lateral declarada (F10).

## Não verificado

- Leitor de tela, zoom de 200 por cento, Safari e iPhone reais, aparelho físico (o WebKit do Playwright é proxy).
- "Copiar senha" em Firefox e WebKit (sem permissão de área de transferência no Playwright; só o Chromium provou o conteúdo copiado).
- F5 no meio do POST de redefinição, e duas redefinições simultâneas do mesmo alvo.
- Mutação do `seguranca-da-conta.test.ts` (leitura de fonte): não aplicável, o comportamento é provado pelo e2e.
- O texto da frase da senha única e das confirmações (juízo de texto de produto).

## Risco residual

Pessoa em celular de 320 px com o botão destrutivo encostado na borda do cartão; teclado e leitor de tela perdem a posição depois de encerrar as outras sessões; senha temporária perdida por Esc.

## Motivo do humano

A etapa reserva a Rafael a leitura da frase da senha única e das confirmações (texto de produto) e a decisão sobre o Esc na janela da senha. O fluxo em si foi provado por execução e não depende de pessoa.
