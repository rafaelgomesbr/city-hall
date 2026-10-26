# V2-F00-POS, painel web: H05 B, H26 A e H08 A

Ramo `trab/f00pos-painel`, saído de `v2/f00-pos` (`59217dbd`). Decisões do Rafael de
2026-10-26, registradas em `docs/roadmap-v2/pendencias-humanas.md`. Implementado, não
validado: quem valida é o gatekeeper, numa sessão nova.

## O que mudou

### H05 B: a tecla Esc não fecha a janela da senha temporária

- `Modal` ganhou `fecharComEscape` (padrão verdadeiro). Com `false`, o Esc deixa de
  fechar a janela, com o foco dentro dela e com o foco no corpo da página (os dois
  caminhos passam por `tratarTecla`). O Tab continua preso dentro da janela.
- Só a janela "Senha temporária" de Usuários passa `fecharComEscape={false}` (já não
  fechava por clique fora e já não tinha o "Fechar" do canto). A única saída é o botão
  "Já anotei a senha". As confirmações (`ConfirmarAcao`) e as outras janelas continuam
  fechando por Esc.
- Arquivos: `dc360/apps/web/src/componentes/Modal.tsx`, `dc360/apps/web/src/paginas/Usuarios.tsx`.

### H26 A: nenhum aviso cobre nem rouba o toque de uma janela modal aberta

- O defeito já tinha sido tratado na correção 4 da E09 (`cea16f00`): com janela aberta o
  `Toast` não é desenhado (`useHaModalAberto`), o relógio dele para, e ele volta com o
  relógio do começo quando a última janela fecha. Esta etapa conferiu que continua
  valendo (capturas `h26-*`, a 320, 390 e 1280 px, claro e escuro: o aviso nasce, a
  janela da senha abre sem aviso por cima, depois do Esc nada muda, e ao fechar pelo
  botão o aviso volta) e acrescentou prova que morde onde faltava:
  `janela-da-senha-temporaria.test.ts` (contador, ordem do registro antes da interdição,
  aviso não desenhado, aviso mantido montado) e, no E2E (`layout-estreito.e2e.mjs`,
  seção 8), "não há aviso passageiro na página para receber o toque" (zero nós `.toast`
  no DOM com a janela aberta, nos três tamanhos).
- Nenhuma mudança de código de produto foi necessária para o H26.

### H08 A: menu "Mais" na barra do celular (até 900 px)

- A barra do pé deixa de rolar na horizontal. Ela mostra os destinos principais que
  cabem INTEIROS e o botão "Mais", último ladrilho. Principais, na ordem de prioridade:
  Meu trabalho, Painel, Ocorrências, Mapa da cidade, Quem está em campo (o que o papel
  não vê não aparece). Quantos entram: até 360 px, 2; até 600 px, 3; até 900 px, 5
  (com o "Mais", 3, 4 e 6 ladrilhos, as mesmas larguras de ladrilho de antes).
- O menu "Mais" abre acima da barra com tudo que saiu dela, em grupos (Operação,
  Administração) e um grupo "Sistema" com Tema e Sair (que antes eram ladrilhos da barra).
- Acessibilidade: o botão tem `aria-expanded` e, aberto, `aria-controls`; ao abrir, o foco
  vai ao primeiro item; Esc fecha de onde estiver o foco e devolve o foco ao botão; tocar
  fora ou sair da barra pelo Tab fecha sem armadilha de foco; escolher um destino fecha e
  `TrocaDeTela` leva o foco ao conteúdo; quando a tela atual mora no menu, o "Mais" leva
  a marca de "você está aqui" e um texto escondido ("inclui a tela atual"); ladrilho e
  itens com 44 px no mínimo (`--ds-touch`). Enquanto o menu está aberto o aviso passageiro
  espera (mesmo contador das janelas modais). Passar para a tela de mesa fecha o menu.
- É um botão que exibe e esconde, e não `role="menu"`: os itens são links comuns, e
  `role="menu"` prometeria setas e teclas de letra que não existem.
- Folha: só tokens `--ds-*` (as primitivas `--ds-ink-*` e `--ds-violet-400` que o bloco
  `.lateral` já usa, pela mesma exceção declarada: a barra é escura nos dois temas). Nada
  de cor ou medida solta; o teste de folha reprova valor escrito à mão nas regras novas.
- Desktop: a lateral continua igual (coluna, todos os itens, Tema e Sair no rodapé), sem
  "Mais". Os botões Tema e Sair da lateral trocaram o estilo escrito no elemento por uma
  classe (`lateral__item--botao`), com o mesmo desenho.
- Removido: o código que rolava a barra (`trazerParaATela`, o efeito de `scrollLeft`,
  `scroll-padding-inline`, `overflow-x: auto`), que não faz mais sentido.
- Arquivos novos: `src/componentes/BarraDoCelular.tsx` (a marcação, testável sem
  navegador), `src/componentes/navegacao-mais.ts` (as decisões e o hook de largura).
  Alterados: `Estrutura.tsx`, `Icones.tsx` (`IconeReticencias`), `app.css`.

## Testes

Painel (`apps/web`): 778 para 815 casos (+37).

- Novos: `test/menu-mais.test.ts` (27) e `test/janela-da-senha-temporaria.test.ts` (10).
- Reescritos no lugar (sem caso novo): dois casos de `test/acessibilidade.test.ts` (o Tab
  que trazia o item para a tela virou "a barra não rola"; o conteúdo dos ladrilhos),
  uma linha de `test/correcao-6-da-e09.test.ts` (o `className` da `<nav>`) e duas de
  `test/correcao-8-da-e09.test.ts` (a chamada de `tratarTecla` ganhou o argumento).
- E2E em `test/layout-estreito.e2e.mjs`: seção 3 reescrita (a barra tem os principais mais
  o Mais, tudo inteiro na tela, 44 px, a barra não rola), seção 3b nova (o menu: abre,
  `aria-expanded`/`aria-controls`, foco entra, retângulos dentro da tela e acima da barra,
  44 px e toque que chega, Esc devolve o foco, toque fora fecha, segundo toque fecha, Tab
  que sai fecha, escolher destino fecha e marca o Mais, reaberto marca `aria-current`), seção
  3c nova (do celular para a mesa com o menu aberto e de volta) e seção 8 ampliada (nenhum
  aviso no DOM, Esc não fecha a janela da senha com o foco dentro e fora dela).
- `scripts/baseline.mjs`: `V2-F00-POS-painel` com +37 em `MUDANCAS_DO_TESTE_WEB_POR_ETAPA`;
  `README.md` e `docs/COLOCAR-DE-PE.md` com os totais novos (815, 3660 e 5657).

Mordida (`saidas/03-mutacoes-dos-testes.txt`, script em `sondas/mutacoes.py`): 12 mutações
no código de produto, todas derrubam pelo menos um teste do vitest (Usuários deixa de
recusar o Esc; `decidirTecla` fecha sempre; o ouvinte do documento ignora a opção; o aviso
volta a ser desenhado; o Modal não registra a abertura; o Mais sem `aria-expanded`; o menu
sem o Tema; um destino some da divisão; a barra volta a rolar; o Esc não fecha o menu;
toque abaixo do token; quatro principais a 320 px). Árvore restaurada depois de cada uma.

## Comandos rodados e saídas (pasta `saidas/`)

| Comando | Resultado | Arquivo |
| --- | --- | --- |
| `npm run typecheck` (em `dc360/`) | código 0 | `01-typecheck.txt` |
| `npx vitest run` (em `apps/web`) | 52 arquivos, 815 casos, código 0 | `02-vitest-painel.txt` |
| mutações dos testes | 12 de 12 mordem | `03-mutacoes-dos-testes.txt` |
| `node scripts/e2e-api.mjs chromium` (suíte principal e geometria) | 288 e 456 verificações, 0 falhas, zero erro de console | `04-e2e-chromium.txt` |
| `node scripts/e2e-api.mjs firefox --so-layout` | 456 verificações, 0 falhas | `05-e2e-firefox.txt` |
| `node scripts/e2e-api.mjs webkit --so-layout` | 452 verificações, 0 falhas, 4 puladas (Tab no WebKit, ver limitações) | `06-e2e-webkit.txt` |
| `node test/fluxo.e2e.mjs` (modo local, em `apps/web`) | 70 verificações, 0 falhas, zero erro de console | `08-e2e-modo-local-chromium.txt` |
| `npm run conferir:numeros` | números do painel batem; ver o item de `test-scripts` nas limitações | `07-conferir-numeros.txt` |

## Capturas (pasta `capturas/`, Chromium, 320, 390 e 1280 px, claro e escuro)

- `h08-{claro,escuro}-{320,390,1280}-barra-fechada.png`: a barra nova (a 1280 px, a lateral
  de sempre).
- `h08-*-{320,390}-menu-aberto.png` e `...-menu-aberto-em-usuarios.png`: o menu aberto,
  e com a tela atual dentro dele (o Mais marcado e o item com a barra violeta).
- `h26-*-1-aviso-de-sessoes-encerradas.png`: o aviso, sem janela aberta, acima da barra.
- `h26-*-2-janela-da-senha-sem-aviso-por-cima.png`: a janela da senha, sem aviso por cima.
- `h05-*-3-depois-do-esc-a-janela-continua.png`: depois do Esc, a janela e a senha seguem.
- `h26-*-4-janela-fechada-o-aviso-volta.png`: fechada pelo botão, o aviso volta.

Geradas por `sondas/capturas.mjs` contra a API e o painel de pé (portas 3691 e 4691).

## Limitações e o que não foi provado

- Aparelho real, Safari de iPhone, Android e leitor de tela (VoiceOver, TalkBack, NVDA)
  não foram usados: tudo é Chromium, Firefox e WebKit do Playwright no Windows.
  O anúncio de `aria-expanded` e do grupo "Mais" por leitor de tela está provado só pela
  marcação, não por escuta.
- No WebKit do Playwright o Tab não alcança links (nem numa página mínima); por isso as 4
  verificações de teclado por Tab (o Tab que sai da barra fecha o menu, três vezes, e o
  primeiro Tab em "Pular para o conteúdo") foram puladas ali pela sonda que a suíte já
  tinha. Valem em Chromium e Firefox. O Esc, o toque e os retângulos valem nos três.
- `npm run conferir:numeros` ainda reprova por UM item que não é desta etapa:
  `test-scripts` espera 355 casos e a árvore tem 358 (+3). Vem do commit `f87082e8`
  (google-services.json fora do git), que acrescentou casos em `scripts/*.test.mjs` sem
  declarar a diferença em `TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS`. Não toquei nisso para
  não colidir com o dono do commit. O item do painel (`teste-web`) está declarado e bate.
- A escolha de quais destinos são "principais" (os quatro de coordenação e o Meu trabalho)
  e dos tamanhos (2, 3 e 5) é decisão de desenho minha, a confirmar. Em 320 px o Mapa da
  cidade passa a morar no menu (antes era sempre um dos três primeiros da barra).
- Com o menu mais alto que a janela (320x568 com tudo aberto) ele rola por dentro; medido
  só no tamanho da suíte (320x568), sem celular deitado com menu aberto.
- Esta etapa não atualizou `pendencias-humanas.md` nem o `STATUS.md` (fora do escopo pedido).
