---
validador: acessibilidade
modelo: claude-opus-5-5
etapa: V2-F00-E09
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Montagem toda minha. `A` é o scratchpad do validador (`/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-acessibilidade`). API do SHA (`apps/api`, `npx tsx src/index.ts`, PGlite semeado, notificador de arquivo) em 127.0.0.1:3893; painel construído do SHA (`npm run build:shared` e `vite build` com `VITE_API_URL` para ela, código 0, `A/saidas/00` e `01`) servido por `vite preview` na 4893. A árvore de `dc360/` em HEAD `55209ab` é a de `fd17ff4`. Playwright 1.62.1 com Chromium, Firefox e WebKit. axe-core 4.10.2 (o projeto não tem axe; baixei o pacote para `A/axe/`, SHA-256 do tgz `9ea2d2d6...89158100`) injetado na página com as regras `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` e `wcag22aa`. Zoom do navegador emulado pela janela CSS equivalente: 640x450 é 1280x900 a 200 por cento; 320x256 é 1280x1024 a 400 por cento.

A medição de "foco encoberto" (`medirFoco` em `A/lib.mjs`): uma grade de 5x3 pontos dentro do retângulo do elemento focado; cada ponto dentro da janela conta como visível se `elementFromPoint` devolve o próprio elemento ou um descendente. "Inteiramente encoberto" (o que reprova o 2.4.11 nível AA) é zero pontos visíveis. O relatório também lista os elementos `position: fixed/sticky` e os retângulos deles.

| Critério | WCAG | Resultado | Prova |
| --- | --- | --- | --- |
| Depois da senha atual errada em Minha conta (401 do servidor), o foco vai ao campo inválido, com `aria-invalid` e o erro ligado | 2.4.3, 3.3.1, 4.1.3 | OK nos três motores, em oito janelas, por Enter no último campo e por Espaço no botão: `#conta-senha-atual`, `aria-invalid="true"`, `aria-describedby="conta-senha-atual-erro"`, erro com `role=alert` e ícone. O foco em BODY da rodada 6 não se repete. No WebKit, o Espaço só vale com o botão focado por código, porque o Tab do WebKit do Mac não passa por botões (padrão do Safari, `A/webkit-tab.mjs`) | `A/saidas/e09-foco.txt` |
| E2e da seção 10 (foco depois da senha errada) e da tela estreita | 2.4.3, 1.4.10 | `layout-estreito.e2e.mjs` contra API recém-semeada: Firefox 197 de 197, WebKit 196 de 196, Chromium 197 de 197, código 0 nos três | `A/saidas/12-layout-estreito-{firefox,webkit,chromium}.txt` |
| O campo focado depois do erro não fica inteiramente encoberto pelo topo ou pela barra fixa | 2.4.11 | **FALHA** (achado 1): Minha conta a 640x450 (zoom de 200 por cento) com o campo inteiro sob o topo em Chromium e Firefox; Minha conta a 320x256 (zoom de 400 por cento) sob a barra do pé nos três motores; Nova ocorrência a 390x844 e 320x640 com "Endereço" inteiro sob a barra do pé nos três motores. É regressão desta correção (mutação abaixo) | `A/saidas/e09-foco.txt`, `A/saidas/e09-foco-mutacao-1ed0b71.txt`; capturas citadas no achado 1 |
| O mesmo nas outras janelas (1280x900, 1366x657, 1024x600, 768x1024, 390x844 e 320x640 em Minha conta) | 2.4.11 | OK: 15 de 15 pontos visíveis nos três motores. A 1024x600, Chromium e Firefox, envio por Espaço: o campo fica em 80..124 e o RÓTULO em 48..72, por baixo do topo (0..81): o campo está à vista, o rótulo não (ver achado 4) | `A/saidas/e09-foco.txt` |
| "Defina a sua senha" depois da provisória errada a 640x450, 320x256 e 320x640 | 2.4.3, 2.4.11 | OK nos três motores: `#senha-nova-atual` focado, 15 de 15 visíveis (tela pública, sem topo fixo). A 320x256 o erro fica abaixo da janela (achado 5) | `A/saidas/e09-provisoria.txt` |
| Janela "Redefinir senha" e "Encerrar sessões" (`ConfirmarAcao`) só pelo teclado | 2.1.1, 2.1.2, 2.4.3, 4.1.2 | OK nos três motores a 1280x900 claro, 390x844 escuro e 640x450 claro: `role=dialog`, `aria-modal=true`, título ligado ("Redefinir senha", "Encerrar sessões"), descrição ligada com o nome da pessoa; fundo `#root` com `inert` e `aria-hidden`; foco inicial em "Cancelar"; Tab e Shift+Tab giram entre "Cancelar" e "Redefinir a senha de Jonas Ferreira" sem sair da janela; Esc fecha e o foco volta ao botão "Redefinir senha" da linha. O foco inicial na janela está à vista (15 de 15) | `A/saidas/e09-fluxo.txt`, `A/saidas/e09-extra.txt`; `capturas/a11y-janela-redefinir-zoom200-chromium-640x450-claro.png` |
| Senha temporária: aparece uma vez, foco, contraste, botões | 2.4.3, 1.4.3, 2.5.8 | OK: foco em "Copiar senha" (a 640x450, no painel da janela, que é focável por código); valor 15,04 (claro) e 13,47 (escuro); frase 5,53 e 7,06; "Copiar senha" 124x44 e "Já anotei a senha" 155x44; ao fechar, o foco volta ao botão "Redefinir senha" da linha | `A/saidas/e09-fluxo.txt`; `capturas/a11y-senha-temporaria-chromium-390x844-escuro.png` |
| Encerrar sessões de outra pessoa: confirmação por `role=status`, ícone e texto, foco devolvido ao botão | 4.1.3, 1.4.1, 2.4.3 | OK nos três motores: Toast `role=status` e `aria-live=polite`, com ícone e frase; contraste 17,7 (claro) e 14,79 (escuro); foco de volta em "Encerrar sessões"; a 390 e a 640x450 o Toast (664..750, 286..356) não cobre a barra do pé (765..844, 371..450) | `A/saidas/e09-fluxo.txt`; `capturas/a11y-encerrar-sessoes-toast-chromium-390x844-escuro.png` |
| Minhas outras sessões | 1.3.1, 4.1.3, 2.4.3 | OK: lista com `aria-label="Sessões abertas na sua conta"`, "Esta sessão" por texto; depois de encerrar, o foco vai à confirmação "A outra sessão foi encerrada. Esta continua aberta." (aviso focável, sem região viva, o mesmo mecanismo da troca de senha) | `A/saidas/e09-fluxo.txt` |
| axe nas telas da etapa | 1.1.1, 1.3.1, 1.4.3, 4.1.2 e demais A e AA | Usuários, as duas janelas, a senha temporária e Minha conta: 0 violações a 1280x900 e a 640x450 nos três motores; a 390x844: 1 violação `link-name` em `.identidade` (achado 3, anterior à fase) | `A/saidas/e09-fluxo.txt` |
| Anel de foco visível e com contraste | 2.4.7, 1.4.11 | OK: anel de 2 px por `box-shadow` (`--ds-accent`), 7,10 contra o cartão claro e 6,19 contra o escuro | `A/saidas/e09-extra.txt` |
| Estado nunca só por cor | 1.4.1 | OK: erro com ícone e frase; borda vermelha acompanhada de texto; selo "Esta sessão" com texto | capturas citadas |
| Testes estáticos do painel | | `npm run test --workspace @dc360/web` 699 de 699 (46 arquivos), código 0; recorte de acessibilidade e foco (`acessibilidade`, `foco`, `correcao-4-da-e09`, `correcao-5-da-e09`, `modal`, `toast`, `portoes-de-componente`) 124 de 124 | `A/saidas/10-vitest-web.txt`, `A/saidas/11-vitest-a11y.txt` |

## Evidência

- `cd A && node e09-foco.mjs` (código 0; `MOTORES=chromium` e depois `MOTORES=firefox,webkit`): 8 janelas por motor, Minha conta por Enter e por Espaço, Nova ocorrência por Enter no nome do solicitante (`A/saidas/e09-foco.txt`).
- Mutação para separar regressão de defeito antigo: `git show 1ed0b71:dc360/apps/web/src/componentes/foco.ts` e o mesmo para `dc360/apps/web/src/estilos/app.css` gravados por cima dos arquivos, `vite build` para `A/web-dist-mut` (código 0, `A/saidas/02-build-web-mutacao.txt`) e `git restore` dos dois arquivos logo em seguida (`git status --porcelain dc360` vazio). O painel mutado foi servido na mesma porta para `SUFIXO=-mutacao-1ed0b71 node e09-foco.mjs` (`A/saidas/e09-foco-mutacao-1ed0b71.txt`) e `tab-encoberto.mjs`, e trocado de volta pelo do SHA.
- `node tab-encoberto.mjs` no SHA e na mutação: 40 Tab por tela em Nova ocorrência, Minha conta e Órgãos a 390x844, 320x640 e 640x450, Chromium e Firefox, contando paradas inteiramente encobertas (`A/saidas/tab-encoberto.txt`, `A/saidas/tab-encoberto-mutacao-1ed0b71.txt`).
- `node e09-fluxo.mjs` (código 0): janelas, senha temporária, Toast e Minha conta, três motores, três janelas, axe (`A/saidas/e09-fluxo.txt`); `node e09-extra.mjs` (fundo inerte e anel de foco, `A/saidas/e09-extra.txt`); `node e09-provisoria.mjs` (`A/saidas/e09-provisoria.txt`); `node webkit-tab.mjs` (o Tab do WebKit pula o botão).
- `BASE_WEB=http://localhost:4893 BASE_API=http://127.0.0.1:3893 MOTOR=<motor> node test/layout-estreito.e2e.mjs` em `dc360/apps/web`, uma API recém-semeada por motor: Firefox 197 e 0, WebKit 196 e 0, Chromium 197 e 0, código 0.
- `npm run test --workspace @dc360/web`: código 0, 699 de 699. `npx vitest run` do recorte: código 0, 124 de 124.
- CI: run 39420436042 sobre o descendente `55209ab` (só lista permitida), 9 de 9 jobs `success` conforme lido pelo gatekeeper; não reli a API do GitHub. O e2e de foco depende do motor e o CI roda em Linux; a prova desta dimensão é local.
- Erros de console: só os 401 provocados pela senha errada ("Failed to load resource"); nenhum `pageerror` em nenhuma sonda.
- Capturas (minhas, Playwright, no SHA, em `capturas/`): `a11y-minha-conta-senha-errada-foco-{chromium,firefox,webkit}-640x450-claro.png`, `a11y-minha-conta-senha-errada-foco-mutacao-1ed0b71-chromium-640x450-claro.png`, `a11y-minha-conta-senha-errada-foco-chromium-320x256-claro.png`, `a11y-minha-conta-senha-errada-foco-mutacao-1ed0b71-chromium-320x256-claro.png`, `a11y-nova-ocorrencia-enter-foco-{chromium,firefox,webkit}-390x844-claro.png`, `a11y-nova-ocorrencia-enter-foco-mutacao-1ed0b71-chromium-390x844-claro.png`, `a11y-janela-redefinir-zoom200-chromium-640x450-claro.png`, `a11y-senha-temporaria-chromium-390x844-escuro.png`, `a11y-encerrar-sessoes-toast-chromium-390x844-escuro.png`.

## Cenários positivos

- Senha errada em Minha conta, Enter e Espaço, oito janelas, três motores: o foco sempre no campo inválido, nunca em BODY (o defeito da rodada 6 está fechado).
- Janelas de redefinir e encerrar operáveis só pelo teclado, com o foco preso e devolvido; Esc fecha.
- Senha temporária com o foco no "Copiar senha", contraste acima de 13 e frase de que não volta.
- Toast de encerrar com `role=status`, ícone e texto; confirmação das minhas outras sessões recebe o foco.

## Cenários negativos

- Coordenadora tentando a própria conta e posto igual ou maior: fora desta dimensão (QA e Red-team); conferi só que os botões existem na linha de quem pode ser administrado ("Redefinir senha" e "Encerrar sessões" na linha de Jonas Ferreira, logada a administradora).
- Erro de servidor (401) e erro da própria tela: os dois caminhos de `MinhaConta.tsx` levam o foco ao campo, medidos.

## Tentativas de reprovar

- Repeti o caso da rodada 6 (foco em BODY no Firefox) com Enter, com Espaço no botão e com o WebKit: não cai mais em BODY; o único BODY visto foi do WebKit quando o Tab não chega ao botão (motor), e com o botão focado por código o foco vai ao campo.
- Procurei onde o "rótulo não fica atrás do topo" da correção 5 não vale: medi oito janelas, incluindo os zooms de 200 e 400 por cento. A 640x450 o topo tem duas linhas (0..141) e o `scroll-padding-top` acima de 600 px é o de uma linha (80 px): o campo vai a 80..124, inteiro por baixo do topo, em Chromium e Firefox (0 de 15 pontos). No WebKit ficou em 196..240, à vista.
- Procurei o caminho inverso: campo inválido ABAIXO da janela. `focar` agora faz `focus({ preventScroll: true })` mais `scrollIntoView({ block: "nearest" })`; "nearest" encosta o campo na borda de baixo, e a barra do pé (sticky, 79 px) fica por cima, porque não há `scroll-padding-bottom`. Nova ocorrência, nome do solicitante e Enter: "Endereço" em 800..844 sob a barra 765..844 (390x844) e em 586..630 sob 561..640 (320x640), 0 de 15 nos três motores, com o rótulo e "Informe o endereço" também fora de vista.
- Zoom de 400 por cento (320x256): o topo (0..129) e a barra (177..256) deixam 48 px úteis; o campo de Minha conta vai a 176..220, inteiro sob a barra, nos três motores.
- Separei regressão de defeito antigo pela mutação (os dois arquivos de `1ed0b71`): Minha conta a 640x450 ficava em 243..287, 15 de 15 visíveis nos três motores; a 320x256, 146..190, 10 de 15; Nova ocorrência a 390x844 ficava em 440..484, à vista, em Chromium e Firefox (o WebKit já encobria antes, 814..858), e a 320x640 em 538..582, 10 de 15 nos três. Logo os casos do achado 1 são REGRESSÃO da correção 5, salvo o WebKit a 390x844.
- Tab natural pela página no celular (sem erro): conta paradas inteiramente encobertas pela barra do pé, no SHA e na mutação. Existem nos dois (achado 2): é defeito anterior, de origem comum, e não regressão.
- Tentei quebrar a janela: Tab cinco vezes, Shift+Tab, Esc; o foco nunca saiu dela e voltou ao botão que a abriu. Conferi o fundo `inert` e `aria-hidden` por atributo.
- Rodei axe em todas as telas da etapa nos dois temas e em três larguras: a única violação é de antes da fase (achado 3).

## Achados

1. **bloqueia.** WCAG 2.4.11 (Foco não encoberto, mínimo, nível AA), regressão da correção 5. Depois do erro de campo, `focar` (`dc360/apps/web/src/componentes/foco.ts`, `scrollIntoView({ block: "nearest" })`, usado por Minha conta, "Defina a sua senha", Nova ocorrência, Usuários, Ocorrência e Quero conhecer) e o `scroll-padding-top` só no bloco de até 600 px (`estilos/app.css`) deixam o campo focado INTEIRO atrás de conteúdo fixo:
   - Minha conta, senha atual errada, a 640x450 (o notebook de 1280x900 com zoom de 200 por cento): campo 80..124 sob o topo 0..141, Chromium e Firefox (`capturas/a11y-minha-conta-senha-errada-foco-{chromium,firefox}-640x450-claro.png`; antes da correção, `...-mutacao-1ed0b71-chromium-640x450-claro.png`, o campo à vista com o anel). Reprodução: entrar, Minha conta, janela de 640x450, preencher os três campos com a senha atual errada, Enter.
   - Minha conta a 320x256 (zoom de 400 por cento): campo sob a barra do pé nos três motores (`capturas/a11y-minha-conta-senha-errada-foco-chromium-320x256-claro.png`; antes: `...-mutacao-1ed0b71-chromium-320x256-claro.png`, parcialmente à vista).
   - Nova ocorrência a 390x844 e 320x640, nome do solicitante e Enter: "Endereço" inteiro sob a barra do pé nos três motores, sem nada na tela que diga o que falta (`capturas/a11y-nova-ocorrencia-enter-foco-{chromium,firefox,webkit}-390x844-claro.png`; antes, Chromium: `...-mutacao-1ed0b71-chromium-390x844-claro.png`, campo à vista).
   Também afeta 3.3.1 na prática: o erro está no texto e ligado por `aria-describedby` (leitor de tela recebe), mas quem enxerga e usa teclado não vê o campo nem a frase. É o mesmo comportamento que o relatório de UX desta rodada mediu; reproduzi de forma independente com medição de pontos e mutação. Conserto provável (não implementado): `scroll-padding-bottom` da altura da barra do pé no bloco de até 600 px, `scroll-padding-top` da altura real do topo também entre 601 px e a largura em que ele volta a uma linha (ou medido por variável), e conferir o zoom de 200 e 400 por cento na seção 10 do `layout-estreito`.
2. **corrige antes de crescer.** WCAG 2.4.11 no Tab natural, anterior a esta correção: até 600 px e a 640x450, o navegador rola o elemento que recebe o Tab até a borda de baixo, e a barra fixa do pé o cobre inteiro (Nova ocorrência: `nova-contato`, `nova-local`, `nova-descricao`; Órgãos: `orgao-telefone`, `orgao-email` e os botões da tabela; Minha conta a 320x640 na mutação: `conta-senha-repetida`). Visto no SHA e no código de `1ed0b71` (`A/saidas/tab-encoberto*.txt`). Mesma raiz do achado 1 (falta `scroll-padding-bottom`); o conserto do achado 1 tende a fechar este.
3. **corrige antes de crescer** (anterior à fase, não é desta etapa). WCAG 2.4.4 e 4.1.2 (nível A): até 600 px o link do topo que leva a Minha conta (`.identidade`, `componentes/Estrutura.tsx:267`) fica sem nome acessível, porque o avatar é `aria-hidden` e o nome e o papel ficam `display: none` (`estilos/app.css:1133`, de `5ecdf4c`). axe `link-name`, impacto sério, em todas as telas logadas a 390 e 320 px. É o caminho para a tela de sessões e troca de senha desta etapa. Conserto provável: `aria-label` com o nome da pessoa e "Minha conta" no `NavLink`.
4. **anotado.** A 1024x600 e acima de 600 px, envio por Espaço com a página rolada: o campo focado fica à vista mas o rótulo dele fica sob o topo (Chromium e Firefox, rótulo 48..72, topo até 81). Não reprova o 2.4.11 nível AA (o campo não está inteiro encoberto); reprova o 2.4.12 (AAA) e o portão visual, que a UX avalia.
5. **anotado.** "Defina a sua senha" a 320x256: o `scroll-padding-top` de 140 px do bloco de até 600 px vale também na tela pública sem topo fixo, e o campo focado vai a 176..220 numa janela de 256: a frase do erro fica abaixo da janela. Não é foco encoberto; é espaço perdido no zoom de 400 por cento.
6. **anotado.** No WebKit do Mac o Tab não passa por botões (padrão do Safari sem "pressione Tab para destacar cada item"); não é defeito do produto, mas os testes de teclado no WebKit precisam focar o botão por código.

## Não verificado

- Leitor de tela real (VoiceOver, NVDA): se o erro de campo é lido uma vez (foco no campo com `aria-describedby` mais `role=alert` no erro pode ler duas vezes), se a confirmação focável das minhas outras sessões é lida, e se a janela é anunciada com título e descrição. Só uma pessoa confere.
- Zoom real do navegador (Ctrl e +): emulei pela janela CSS equivalente; o resultado de layout é o mesmo, mas a rolagem do motor sob zoom real não foi medida.
- Espaçamento de texto (1.4.12) e orientação (1.3.4): não testados.
- Modo de demonstração (painel sem API): não exercitado.
- Os itens "incompletos" de contraste do axe (até 52 em Usuários, por fundos sobrepostos) não foram conferidos à mão; as medidas de contraste que cito são minhas, por elemento.
- Safari de aparelho, Android Chrome e teclado virtual: sem aparelho nesta máquina.
- A Ocorrência e o Quero conhecer também usam `focar`: não medi o encobrimento nelas.

## Risco residual

O conserto do foco em BODY funciona nos três motores, mas a troca de `focus()` por `scrollIntoView({ block: "nearest" })` vale para o painel inteiro e piorou o caso em que o campo inválido está fora da janela: no celular e no notebook com zoom, a pessoa que erra e usa teclado fica com o foco num campo que não vê. Os testes de unidade e o `layout-estreito` passam sem medir zoom nem campo abaixo da janela, então o defeito passa pelo portão automático. O link sem nome do topo no celular é anterior e afeta todas as telas logadas.

## Motivo do humano

Leitor de tela real (VoiceOver no Mac e no iPhone, NVDA se houver Windows): conferir a leitura do erro de campo depois da senha errada, da janela de redefinir com o nome da pessoa, da senha temporária e das confirmações de encerrar sessões. Isso não é medível por agente. Rafael também precisa conferir, no notebook da prefeitura com zoom de 200 por cento, que o campo focado depois do erro fica à vista quando o achado 1 for consertado.
