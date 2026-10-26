---
validador: red-team
modelo: claude-sonnet-5-5
etapa: V2-F00-E13
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [UI, A11Y, AUTH]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Painel do SHA construído em `scratchpad/web-dist` com `VITE_API_URL` apontando a API real (`tsx src/index.ts`, semente de desenvolvimento), servido em `localhost:4777`, e atacado com Playwright em Chromium e Firefox (`scratchpad/rt-e13.mjs`; saídas em `rt-e13.txt`, `rt-e13b.txt` e `rt-e13-ff.txt`). Todas as requisições para `evil.example` foram interceptadas e contadas.

1. Redirecionamento aberto por parâmetro de consulta: o código não lê parâmetro nenhum para destino (`grep` em `src` por `searchParams`, `location.search`, `redirect`, `next` só acha filtros de lista e a limpeza do token). Entradas testadas sem sessão, depois login de coordenadora: `/?redirect=https://evil.example/x`, `/?next=//evil.example/x`, `/entrar?redirect=...`, `/entrar?next=...&redirect_to=...&returnUrl=...&url=...&continue=...`, `/painel?next=//evil.example`. Resultado: o login termina em `http://localhost:4777/painel` (ou no caminho interno pedido, com a consulta intocada), zero requisições para `evil.example`, zero erro de página, nos dois navegadores.
2. `//evil.example/x`, `/` mais barra invertida mais `evil.example/x`, `/.//evil.example/x`, `/` mais TAB mais `/evil.example/x`, `/ocorrencias/..//evil.example`: o navegador normaliza todos para `//evil.example/...` (confirmado: `new URL(...).pathname` devolve `//evil.example/x`), `rotaInterna` recusa (`startsWith("//")`) e o login cai em `/painel`. `/%5Cevil.example/x` fica codificado, passa o filtro e permanece na própria origem (NaoEncontrada). Nenhuma navegação externa.
3. A anotação de outro validador, "`rotaInterna` aceita `/` + barra invertida + host", é verdadeira para a FUNÇÃO e NÃO é explorável no navegador. Provas e razões:
   a) A única origem de `voltarPara` é `location.pathname + search + hash` em `Protegida`. Uma barra invertida digitada na URL já chega como `//host` (que `rotaInterna` recusa); TAB e nova linha são removidos pelo analisador de URL antes de existir `pathname`. Não há caminho em que o texto `/` + barra invertida chegue ao filtro vindo da barra de endereço (observado: state gravado = `//evil.example/x`).
   b) O consumidor navega com `replace: true` (`Entrar.tsx` linhas 135 e 428, `<Navigate replace>` em `App.tsx`), que usa `history.replaceState`. Com URL de outra origem o navegador lança `SecurityError`; só o `push` do React Router tem o recuo para `location.assign`, e ele não é usado aqui.
   c) Simulei o atacante que já escreve em `history.state` (precisaria de script na própria origem, ou seja, XSS, que não é vetor externo): `usr.voltarPara` igual a `/` + barra invertida + `evil.example/x` terminou em `http://localhost:4777/evil.example/x` (mesma origem); `/` + TAB + `/evil.example` lançou `SecurityError` (Firefox: "The operation is insecure"), a página ficou em `/entrar` e NÃO navegou; `https://evil.example` e `//evil.example` foram recusados pelo filtro e a pessoa foi para `/painel`. Zero requisições para `evil.example` em todos os casos, Chromium e Firefox.
4. Token no armazenamento do navegador: depois do login, `sessionStorage` tem `dc360:sessao` (organização e papel) e `dc360:tokens` (JSON com `acesso` e `renovacao`), `localStorage` só `dc360:tema`, `document.cookie` vazio e `ctx.cookies()` vazio. Depois de "Sair", `sessionStorage` fica vazio. Não há `dangerouslySetInnerHTML`, `innerHTML` nem `eval` em `src`.
5. Token de recuperação na barra de endereço: `/redefinir-senha?token=...` vira `/redefinir-senha` depois da leitura (nos dois navegadores).
6. Rota índice sem sessão leva a `/entrar` e não concede nada (observado em todas as entradas acima, state com `voltarPara` nulo ou filtrado).

## Evidência

- `scratchpad/rt-e13.txt` (Chromium, matriz completa de 12 entradas e 5 injeções de state), `scratchpad/rt-e13b.txt` (Chromium, API do histórico e armazenamento), `scratchpad/rt-e13-ff.txt` (Firefox, tudo). Comando: `node scratchpad/rt-e13.mjs <saida>` a partir de `dc360/apps/web`, com `MOTOR=firefox` para o segundo.
- Servidores nas portas 3777 e 4777 encerrados; arquivo temporário de teste da API apagado; `git status --porcelain` só mostra pastas `validacao/`.

## Cenários positivos

Coordenadora entra a partir de `/` e chega a `/painel`; entra a partir de `/ocorrencias?x=1` e volta a ela.

## Cenários negativos

Itens 1 a 3 (destino externo por consulta, por caminho e por state injetado).

## Tentativas de reprovar

1. Doze formas de URL hostil na entrada: nenhuma sai da origem.
2. Cinco injeções de `history.state`: nenhuma sai da origem; uma gera erro de página sem navegar.
3. Cinco nomes de parâmetro de retorno (`redirect`, `next`, `redirect_to`, `returnUrl`, `continue`): ignorados.
4. Procurei laço de redirecionamento com `/entrar/` injetado: terminou em `/painel`, sem laço.
5. Procurei token legível fora do `sessionStorage` (cookie, `localStorage`): não há.

## Achados

1. anotado. `rotaInterna` ainda aceita barra invertida, caracteres de controle e `/entrar/` ou `/entrar#x`. Hoje inalcançável de fora (itens 3a a 3c), mas é o filtro de redirecionamento aberto e vale endurecer na próxima mexida (ASVS 5.1.5): recusar barra invertida, TAB, nova linha e qualquer caractere abaixo de 0x20, e comparar `new URL(valor, origem).origin` com a origem atual.
2. corrige antes de crescer (junto do achado 1 da E09). O refresh token de 14 dias vive em `sessionStorage`, legível por qualquer script da origem, e o painel não envia CSP. Hoje não há sink de XSS no código, mas qualquer dependência comprometida leva a conta por 14 dias. Mitigação: CSP no painel (`script-src` próprio) em `vercel.json`; a longo prazo, refresh em cookie `HttpOnly` (decisão de arquitetura, fora da F00).
3. anotado. Um state injetado com `/` + TAB + `/host` gera erro de página não tratado em vez de cair em `/entrar`; só por script na origem.

## Não verificado

- WebKit/Safari (Playwright WebKit não rodado).
- O painel servido pela Vercel (cabeçalhos reais); usei o `vite preview` do mesmo build.
- Modo local (demonstração) em navegador para a matriz de redirecionamento (o código de `rotaInterna` e de `Protegida` é o mesmo nos dois modos).
- Aprovação humana de Rafael digitando só o domínio.

## Risco residual

Filtro de redirecionamento tolera barra invertida (inalcançável hoje); refresh token em armazenamento acessível a script sem CSP.

## Motivo do humano

Não se aplica à dimensão red-team.
