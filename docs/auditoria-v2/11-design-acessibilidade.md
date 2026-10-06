# 11. Design e UX (§23) e Acessibilidade (§24): Baseline Zero da V2

Auditor: frente "design e acessibilidade". Repositório: C:\Projetos\city-hall\dc360, HEAD e82719e (17/09/2026). Somente leitura.
Prefixos de ID: UXD (design e UX), A11 (acessibilidade). Todos os caminhos abaixo são relativos a `dc360/`, exceto os que começam por `docs/`, que ficam na raiz do repositório (`C:\Projetos\city-hall\docs`, não `dc360/docs`). `mockup/` é citado só como comparação.

## Resumo

1. Existem TRÊS superfícies de interface no código: painel web (`apps/web`), app de campo (`apps/campo`) e console (`apps/console`). O portal das secretarias e o app do cidadão NÃO existem: `apps/` contém só `api`, `campo`, `console`, `web`, e `packages/` só `shared` e `campo` (este último é fila offline e regra de coleta, sem tela).
2. Não há package de design. A fonte de verdade de fato é `apps/web/src/estilos/tokens.css`. O campo copia em `apps/campo/src/ui/tokens.ts`, com portão de paridade que rodei (10 de 10 passam). O console copia dentro de `apps/console/src/pagina.ts` SEM nenhum teste de paridade (comparei à mão: valores idênticos hoje, subconjunto do painel).
3. O que já é compartilhado de verdade fica em `packages/shared`: glifos de severidade, rótulos de domínio, mensagens do Zod em português, rótulos de campo e os esquemas de validação, que o painel e o app usam nos formulários.
4. Acessibilidade automatizada é forte em contraste (painel 21 pares, campo 34 pares, nos dois temas) e em varredura estática de código. Tudo é análise de fonte e de token, nenhuma é de pixel renderizado. Não existe axe-core nem qualquer checagem de acessibilidade em navegador ou aparelho, embora o levantamento técnico (J09) a prescreva.
5. Validação humana de acessibilidade: nenhum registro em nenhuma superfície (sem leitor de tela, sem pessoa com deficiência, sem aparelho Android no projeto).
6. Hoje, dois portões do painel reprovam. Acessibilidade: `Modal.tsx:260` (rodei: 14 passam, 1 falha; é falso positivo de janela de 4 linhas, a exceção está 6 linhas acima). Design: `Estrutura.tsx:132` `borderRadius: "8px"` (reproduzi a mesma expressão do portão, sem rodar o arquivo).
7. O console não tem contraste calculado, não tem salvaguarda de Alto Contraste (`:focus-visible` só por `box-shadow`, `pagina.ts:1449`) e trata erro como `role="status"`.
8. O app de campo não trata nem testa a escala de fonte do sistema, tem 1 uso de `accessibilityRole="header"` e trava a orientação em retrato (`app.config.ts:200`). Nem o painel nem o app têm ErrorBoundary.
9. Reuso para V2: `tokens.ts` é TypeScript puro e portável; componentes do campo dependem da camada `dados/` (tema em SQLite, fila); componentes do painel vivem dentro de `apps/web`; todos os portões varrem só a própria pasta, então uma nova superfície nasce sem portão.
10. Divergência com a auditoria anterior: os testes de "sessão encerrada" do campo foram chamados de regressão de tela; o código diz que a mudança de texto foi deliberada em 15/09 e o teste é de 14/09 (seção 1.6).

## 1. §23 Inventário do design system

### 1.1 O que rodei, e o que só li

| Comando | Resultado |
| --- | --- |
| `npx vitest run test/acessibilidade.test.ts` em `apps/web` | 15 casos: 14 passam, 1 falha (`componentes/Modal.tsx:260`) |
| `node --test scripts/paridade-de-tokens-do-aplicativo.test.mjs` | 10 de 10 passam |
| `node --test scripts/portao-acessibilidade-do-aplicativo.test.mjs` | 10 de 10 passam |
| Script solto que comparei em memória: blocos de token do console (`pagina.ts`) contra `tokens.css` do painel | todos os tokens do console existem no painel com valor idêntico; o painel tem a mais `--ds-sev-*`, `--ds-qr-*`, `--ds-fw-*`, `--ds-z-*` |
| Cálculo de contraste de pares que nenhum portão mede (ver 2.1) | valores na seção 2.1 |
| Regex do portão de design aplicada à linha `Estrutura.tsx:132` | casa (violação real) |
| Regex do portão de Alto Contraste aplicada ao CSS do console | `removeFoco: true`, `temForcado: false` |

Não rodei: `design-system.test.ts`, `portao-design-do-aplicativo`, `paridade-de-severidade`, `fontes-do-painel`, nenhum Jest do campo, nenhum teste do console, nenhum e2e Playwright. Onde cito esses, o estado é "lido, não executado". Usei um arquivo temporário no scratchpad (`tmp/cmp-tokens.js`) para a comparação do console e o apaguei ao terminar.

### 1.2 Onde vive cada coisa (resposta à pergunta "tokens compartilhados ou duplicados")

| Item | Painel web | App de campo | Console | Compartilhado? |
| --- | --- | --- | --- | --- |
| Tokens de cor, tipografia, espaço, raio, sombra, movimento | `apps/web/src/estilos/tokens.css` (233 linhas, `:root` e `[data-theme="dark"]`) | `apps/campo/src/ui/tokens.ts` (objetos TS: `temaClaro` linha 127, `temaEscuro` linha 151, `espaco` 251, `raio` 255, `toque` 327, `movimento` 387) | `apps/console/src/pagina.ts` dentro de `CSS_DO_CONSOLE` (linha 1036), bloco entre marcadores `INICIO DOS TOKENS` (1064) e `FIM DOS TOKENS` | NÃO. Três cópias. Nenhuma em `packages/` |
| Garantia de sincronia | fonte de verdade | `scripts/paridade-de-tokens-do-aplicativo.test.mjs`: primitivas por igualdade nos dois sentidos, 23 pares semânticos nos dois temas, espaço e raio idênticos, corpo e abaixo idênticos, divergências declaradas com razão | NENHUMA (teste interno do console confere só consistência entre os dois blocos de tema dele, `o-acabamento-da-tela.test.ts:269-298`) | parcial |
| Fontes Work Sans e Roboto Mono | `.woff` em `apps/web/public/fontes`, gerados dos `.ttf` do campo por `scripts/gerar-fontes-do-painel.mjs`; `scripts/fontes-do-painel.test.mjs` compara byte a byte | `.ttf` em `apps/campo/assets/fontes` (origem) | `apps/console/src/fontes.ts`: `.ttf` em base64 com Brotli (3 faces); teste confere que são servidos e a assinatura TrueType, não compara com o `.ttf` de origem | três cópias, duas com portão |
| Ícones | `apps/web/src/componentes/Icones.tsx` (22 funções SVG) | `apps/campo/src/ui/icones.tsx` (react-native-svg, 26 funções) | símbolos SVG dentro do HTML de `pagina.ts` | NÃO, exceto severidade |
| Glifos de severidade | importa de `@dc360/shared` (`comuns.tsx:6-9`) | importa de `@dc360/shared` (`icones.tsx:3`) | não usa | SIM: `packages/shared/src/glifos-de-severidade.ts`, com `scripts/paridade-de-severidade.test.mjs` |
| Rótulos de domínio (severidade, status, COBRADE, papel, campo), mensagens do Zod em pt-BR, esquemas | importa de shared | importa de shared | não usa | SIM |

Consequências verificadas:
- A fonte de verdade declarada pelo próprio comentário do `tokens.css` ("Espelha design-system/DESIGN_SYSTEM.md e _tokens.scss") está desatualizada: `mockup/design-system/tokens.css` e `_tokens.scss` não têm `--ds-border-controle`, `--ds-qr-*` nem `--ds-fw-*`, que existem no painel. O protótipo em `mockup/` está fora de escopo; o ponto é que a autoridade real é o `tokens.css` do painel, e nenhum teste liga os dois.
- O campo não é workspace do monorepo raiz: `package.json` raiz lista `packages/*`, `apps/api`, `apps/console`, `apps/web`, `db`. O campo consome `@dc360/shared` e `@dc360/campo` por `file:../../packages/...` (`apps/campo/package.json:18-19`) mais ajuste de Metro (`metro.config.js`). É o mecanismo que um pacote de tokens novo precisaria repetir.
- A paridade painel e campo NÃO mapeia `bordaControle` (`--ds-border-controle`), `anelDeFoco` (`--ds-focus-ring`) nem `--ds-accent-graphic` (grep no teste: zero ocorrências). Os valores são iguais hoje (leitura dos dois arquivos), e o contraste de `bordaControle` é medido no portão do campo, mas a igualdade não é garantida.
- Divergências declaradas, legítimas: `toque` 52 contra 44; escala grande de tipografia; fundos de selo opacos no escuro do campo; três durações de movimento de natureza diferente.

### 1.3 Inventário por superfície, domínio a domínio

| Domínio | Painel web | App de campo | Console |
| --- | --- | --- | --- |
| Cor | `--ds-*` semânticos e primitivas (violeta e tinta); severidade e status separados da cor de marca; `--ds-border-controle` separa borda de controle (3:1) da decorativa | `Tema` com 28 campos, claro e escuro; `papel` e `visor` fixos nos dois temas, de propósito (assinatura e câmera) | cópia dos tokens (ver 1.2) |
| Tipografia | Work Sans e Roboto Mono; escala display 44 a caption 12, px (`tokens.css:160-168`); pesos `--ds-fw-*` | sete degraus 32 a 12 (`fonte`, `linha`), `rastreio` com dois valores, `hierarquia.ts` (régua de hierarquia; o portão de design cobre H1 e H3), `fonteMinimaDeInteracao` 14 | `--ds-fs-*` copiados; três faces |
| Espaçamento e raio | `--ds-sp-1..8` (4 a 64), `--ds-radius` 8, `-card` 12, `-pill` 999 | `espaco.e1..e8` e `raio` idênticos (teste de igualdade dura) | copiados |
| Sombra e elevação | `--ds-shadow-1..3` por tema | `elevacao(tema)` (superfície clareia no escuro, sombra no claro), com `elevacao-no-cartao.test.tsx` | copiados |
| Movimento | `--ds-dur-*` 150/200/300 ms; zerados em `prefers-reduced-motion` (`tokens.css:224-233`) | `movimento` 120/260/520 ms; `useReducaoDeMovimento` escuta `reduceMotionChanged` | bloco de movimento reduzido no mesmo CSS; roda de carregamento continua girando por decisão documentada |
| Componentes | 15 arquivos em `src/componentes` (Campo, Modal, ConfirmarAcao, Toast, TrocaDeTela, BuscaGlobal, Sino, SegundoFator, comuns com Selo, Aviso, Carregando, Vazio, Cartao, Tabela...); `app.css` 1194 linhas; 89 ocorrências de `style={{` em 18 arquivos | `src/ui` com 21 arquivos de componente mais as primitivas de `componentes.tsx` (Botao, Tocavel, Txt, Cartao, Aviso, Vazio, Carregando, Chip, Cracha, Dialogo, FolhaDeEscolha, FolhaArrastavel, FaixaDeSincronizacao, Sino, Assinatura, Grafico...) | sem componentes: HTML, CSS e JS em três strings (`pagina.ts` 3646 linhas) |
| Formulários | `Campo.tsx`: conteúdo como função, amarra `htmlFor`/`id`, `aria-describedby` (erro antes da dica), `aria-invalid`, `required`; "(opcional)" como exceção; `AvisoDeObrigatorios`; `ErrosDoServidor` mostra o 422 do servidor em português; foco vai ao primeiro campo inválido (`foco.ts`) | `Campo.tsx` com o mesmo desenho (conteúdo como função), adaptado: sem `aria-invalid` no RN, então o rótulo falado traz "opcional" e "com erro" e a dica fala o erro antes da ajuda (`rotuloFalado`, `dicaFalada`); anel de foco animado | `<label for>` e `<input>` crus, `novalidate`, `autocomplete`; erro numa região única `role="status"` (`pagina.ts:383`); `aria-invalid` ausente |
| Validação | esquemas Zod de `@dc360/shared` no cliente (`Equipes.tsx:56`, `NovaOcorrencia.tsx:130`, `Ocorrencia.tsx:1133...`) | `conferirColeta` em `packages/campo` usa os mesmos esquemas; mensagens do Zod em português | validação no script da página; servidor decide |
| Modal | `Modal.tsx` + `ConfirmarAcao.tsx`: armadilha de foco, `inert` e `aria-hidden` no fundo, foco volta a quem abriu, Escape, clique fora só se não destrutivo, foco inicial em Cancelar, botão repete o verbo | `Dialogo.tsx`: folha ancorada embaixo, `accessibilityViewIsModal`, recusa obrigatória quando destrutivo, botão repete o verbo, sem `Alert.alert` (portão) | dois diálogos com `role="dialog"`, `aria-modal`, `inert` na página e foco devolvido |
| Toast | `Toast.tsx`: `role="status"` polite, 6 s (15 s para ditar protocolo), pausa com ponteiro ou foco, botão Fechar | não existe (usa faixas, `Aviso`, diálogos) | não existe (região `recado`) |
| Estado de erro | `ErroDaApi`, `ErroCampo` (`role="alert"`), `Aviso` (`alert` no perigo), `NaoEncontrada`; mensagem "Sem conexão com o servidor" traduzida (`http.ts:131-133`); SEM ErrorBoundary | `comoContarAFalha` separa sessão encerrada, acesso suspenso, sem sinal e genérico (`dados/falha-de-atualizacao.ts:98-160`); `Aviso` com tom; SEM ErrorBoundary | `recado` com ícone e texto; teste de servidor fora do ar (`a-tela-responde.test.ts`) |
| Carregamento | `Carregando` (`role="status"`, `aria-live`) | `Carregando` com `DEMORA_MS` 6000 e botão "Parar de esperar" (portão: espera de tela cheia sem saída reprova) | esqueleto com `aria-busy`, roda em todo botão que espera (teste) |
| Vazio | `Vazio` (título e filhos) | `Vazio` (ícone, título, descrição, ação) | `vazio-desenho` com ícone e texto |
| Offline | sem modo offline; só mensagem de falta de conexão; modo local de demonstração em PGlite | fila de sincronização e `FaixaDeSincronizacao` com 6 estados (`decidirFaixa`), `useSinal`; sinal nunca só por cor | não se aplica |
| Dark e light | alternador de 2 estados, preferência inicial do sistema, persiste em `localStorage` (`estado/sessao.tsx:131-150`), aplicado até na tela de entrada; `theme-color` por esquema no `index.html` | preferência `sistema`, `claro` ou `escuro` em SQLite; `userInterfaceStyle: "automatic"` (`app.config.ts:201`) | claro por padrão, `[data-theme="dark"]` e `@media (prefers-color-scheme: dark)` com `:not([data-theme="light"])` |
| Responsividade | três quebras em `app.css` (1080, 900, 600 px); lateral vira barra inferior; nenhum teste de viewport | só retrato (`orientation: "portrait"`, `app.config.ts:200`); `supportsTablet: true` (linha 230) sem layout de tablet verificado | uma quebra (640 px, `pagina.ts:2135`) |
| Ícones | SVG próprio, `aria-hidden` salvo com `titulo` | SVG próprio, traço 1.8, regras com portão (`icones.test.tsx`) | sprite SVG no HTML |
| Conteúdo | pt-BR fixo, sem i18n; `toLocaleString("pt-BR")` em 11 pontos de `web` e `campo`; sem travessão nem norma inventada (`packages/shared/test/regras-de-conteudo.test.ts`, lido) | idem | idem |

### 1.4 Lacunas do inventário que merecem nota própria

- Os testes unitários do painel não usam jsdom nem navegador. Dos 36 arquivos, 15 renderizam marcação estática com `renderToStaticMarkup`, e os portões de design, acessibilidade, formulários e componente (`design-system`, `acessibilidade`, `formularios`, `portoes-de-componente`) leem o código-fonte com expressões regulares e janelas de linhas. Isso é rápido e barato, e é frágil: a janela de 4 linhas do portão de acessibilidade reprova uma exceção legítima escrita 6 linhas acima (`Modal.tsx:254` contra o elemento em `:260`).
- O app de campo usa `@testing-library/react-native` (`package.json`), com 52 de 121 arquivos de teste tocando rótulo, papel ou label. RNTL inspeciona a árvore React, não é leitor de tela.
- A cobertura em navegador real é a do e2e Playwright (`apps/web/test/fluxo.e2e.mjs`, 415 linhas, rodado no CI em Chromium e Firefox): Tab cai no atalho de pular, combobox com `aria-activedescendant`, `aria-describedby` do erro, tema escuro. Nenhum caso usa viewport móvel, `forcedColors`, `reducedMotion` nem mede contraste renderizado.
- O painel tem `src/estilos/app.css:14-18` com constantes locais fora do prefixo `--ds-` (`--emblema-*`, `--tracking-*`), e `letter-spacing` literal em quatro regras (linhas 262, 345, 386, 761). O portão de design não olha `letter-spacing`.

### 1.5 O que dá para compartilhar com o portal das secretarias e com o app do cidadão

Sem desenhar telas. Capacidade de reaproveitamento, por peça:

| Peça | Para o portal das secretarias (web, novo) | Para o app do cidadão (React Native, novo) | Observação de lacuna |
| --- | --- | --- | --- |
| Tokens de cor, tipografia, espaço, raio, sombra, movimento | Reuso direto de `tokens.css`, se o portal for outra aplicação web: é CSS puro, sem dependência | `tokens.ts` é TS puro (grep: nenhuma linha `import` no arquivo) | Nada disso está num package. Extração exigiria decidir quem é a fonte (CSS ou TS) e religar `scripts/fonte-do-aplicativo.mjs`, que lê `tokens.ts` por expressão regular |
| Gate de paridade | O portal precisaria entrar na paridade, ou herdar do painel | O app do cidadão precisaria do mesmo portão, e o do campo só conhece `apps/campo/src` | Três superfícies hoje, cinco na V2: o custo de cópia sobe |
| Glifos de severidade e rótulos de domínio | Reuso direto (shared) | Reuso direto (shared já é consumido por RN) | O cidadão não classifica severidade oficial; rótulo de status de relato é novo |
| Esquemas de validação e mensagens em pt-BR | Reuso direto | Reuso direto | Esquemas do relato do cidadão e da resposta do órgão são NOVOS |
| Padrão de formulário (conteúdo como função, amarração única) | O `Campo.tsx` do painel serve como está | O `Campo.tsx` do campo serve, mas acopla a `useTema`, `useReducaoDeMovimento` e ao tema do agente | Dois componentes com APIs diferentes (`dica` contra `ajuda`, `rotulo` ReactNode contra string) |
| Modal e confirmação de ato irreversível | `Modal` e `ConfirmarAcao` reutilizáveis se o portal morar em `apps/web`; hoje vivem dentro dele | `Dialogo` do campo serve de modelo; é folha ancorada embaixo, pensada para o polegar do agente | Três implementações independentes (web, campo, console), cada uma com sua cópia da regra "botão repete o verbo" |
| Toast, erro de formulário, carregamento, vazio | Reuso direto | Precisam ser portados: o campo não tem toast; `Aviso`, `Vazio` e `Carregando` do campo dependem da hierarquia e do tema do agente | O padrão de estados de erro por motivo (`comoContarAFalha`) é do campo e não é genérico |
| Estados offline | Web não tem | O motor de fila e `FaixaDeSincronizacao` do agente são a referência, mas `FaixaDeSincronizacao` depende de `dados/conectividade` e `resumo-da-fila` do agente | Para o cidadão, o que fica em fila e o que o relato significa é decisão de produto |
| Tema claro e escuro, alternador | Reuso direto (`useTema` do painel) | `ProvedorDeTema` do campo grava a preferência em SQLite (`dados/preferencia-de-tema`), o que prende o componente ao agente | Precisa de uma porta de armazenamento |
| Shell de navegação | `Estrutura.tsx` tem um array `NAVEGACAO` fixo para a Defesa Civil, filtrado por `podeExecutar` (`Estrutura.tsx:45-110`); marca "Defesa Civil 360" e município | não se aplica | Reuso do mecanismo de filtro por permissão; o conteúdo e a marca são específicos |
| Ícones | Reuso do que for genérico (alerta, check, info, busca) | Idem, redesenhados em `react-native-svg` | Dois conjuntos desenhados à mão; só a severidade é compartilhada |
| Fontes | Reuso dos `.woff` | Reuso dos `.ttf` do campo | Três cópias já existem |

Específico demais para reaproveitar:
- Painel: lateral escura fixa nos dois temas (lê primitivas `--ds-ink-*` direto, exceção declarada em `app.css:127-180`), `BuscaGlobal`, `Sino`, `SegundoFator`, mapa, toda a página `Ocorrencia.tsx` (2468 linhas).
- Campo: `toque` 52 e `fonteMinimaDeInteracao`, `papel` e `visor`, régua de densidade e de hierarquia (nascidas de reclamações do agente), `Assinatura`, `FolhaArrastavel`, `BarraDeAbas` com vidro (`expo-blur`), retorno tátil, som de despacho, `ItemDeTarefa`, `MinutaDoLaudo`, tudo de `app/(agente)`.
- Console: a arquitetura inteira (string de HTML sem build, política de segurança de conteúdo `style-src 'self'`, SPA sem framework). Só os tokens e o texto dos padrões se aproveitam.

Gaps de reuso: ver matriz (UXD-44 a UXD-48) e Gaps.

### 1.6 Divergência registrada: o teste de "sessão encerrada" do campo

A auditoria anterior (seção 4 e 9) descreve 5 arquivos e 20 casos Jest falhando no campo, e lê o caso de "sessão encerrada" como tela que diverge do desenho. Eu não re-executei o Jest do campo. O que a leitura mostra, em três lados:

- Teste (`src/__tests__/a-sessao-que-terminou-nao-e-falta-de-sinal.test.tsx:203`): espera `getByText(/Sair da conta/)` e `/continua guardado no aparelho/` dentro da explicação. Último commit do arquivo: dcdcec9, 14/09/2026.
- Código (`src/dados/falha-de-atualizacao.ts:98-125`): o texto atual diz "Toque em Entrar de novo" e "Nada é apagado...", e o comentário afirma que a frase NÃO manda mais a pessoa a "Sair da conta", porque esse verbo apaga a vistoria começada, e que "era o que a versão anterior mandava fazer". Último commit do arquivo: 1f6c223, 15/09/2026, posterior ao teste.
- Auditoria anterior: trata como tela que não exibe o que o teste procura, sem ter ido ao commit.

Não escolho uma versão. A evidência (datas e comentário) é compatível com teste defasado depois de uma mudança deliberada de texto, mas se a mudança é a decisão de produto correta é decisão humana (ver Decisões humanas, item 10). Não sei se os outros quatro arquivos falham pelo mesmo motivo.

## 2. §24 Acessibilidade, por superfície

### 2.1 Painel web (apps/web)

Automatizado, e o que cada portão verifica de fato:

| Portão | Verifica | Não verifica |
| --- | --- | --- |
| `test/acessibilidade.test.ts` (rodei: 14 de 15) | contraste WCAG calculado sobre `tokens.css`, nos dois temas, 21 pares (texto, link, botão, avatar, selos de severidade e status com achatamento da transparência de 12 por cento, gráfico 3:1, borda de controle 3:1 sobre três fundos); `onClick` em elemento não interativo sem `tabIndex` e tecla; `<img>` sem `alt`; `outline: none` sem devolver o anel; anel sobrevive a `forced-colors`; campo usa a borda de controle; existe atalho "pular para o conteúdo"; toda rota tem título; `#conteudo` recebe foco | pixel renderizado, texto sobre imagem, estados hover e disabled, placeholder, a lateral escura (medi: 7,71 para o texto, 15,32 o item ativo, 14,79 o hover, todos acima de 4,5, mas sem portão), alvo de 44 px, nome acessível de tabela, ordem de títulos, zoom, reflow |
| `test/formularios.test.ts`, `campo.test.ts`, `foco.test.ts` | todo campo obrigatório declara `required`; formulário com obrigatório desliga validação nativa; "(opcional)" só pelo componente; `aria-describedby` com erro primeiro; `aria-invalid` só com erro; foco vai ao primeiro campo inválido | leitura real por leitor de tela |
| `test/modal.test.ts` (326 linhas), `toast.test.ts` | armadilha de foco, `inert`, `aria-hidden`, retorno do foco, Escape, `aria-labelledby` e `describedby`; toast `role="status"` polite, pausa com ponteiro e foco | comportamento em NVDA ou VoiceOver |
| `test/portoes-de-componente.test.ts` | todo `<label>` nasce em `Campo` (duas exceções estruturais); nenhuma janela nativa `confirm`; todo modal prende o Tab e só existe em `Modal.tsx`; todo ato irreversível pergunta antes; nenhum botão de confirmação diz só "OK" | |
| `test/glifos-de-severidade.test.ts` | selo de severidade tem glifo e palavra, não só ponto colorido | |
| e2e Playwright (`test/fluxo.e2e.mjs`, CI, não rodei) | primeiro Tab cai no atalho; combobox da busca com `aria-activedescendant`; `aria-live` conta resultados; erro amarrado por `aria-describedby`; tema escuro | contraste renderizado, leitor de tela |

Resultado que rodei: o único caso vermelho é `nenhum onClick pendurado em elemento que o teclado não alcança`, por `componentes/Modal.tsx:260` (`<div className="modal" ... onClick=`, o fundo do modal). A exceção `acessibilidade: excecao` está em `Modal.tsx:254`, seis linhas acima; a janela do portão é `linhas.slice(el.linha - 5, el.linha - 1)`, ou seja 4 linhas. A justificativa da exceção (Escape e botões fecham por teclado; dar `tabIndex` ao fundo criaria uma parada inútil) é coerente com o que o modal implementa. Conclusão factual: falso positivo do portão, não defeito do componente; o portão está vermelho do mesmo jeito.

Achados no código que o portão não cobre (verificados por grep e leitura):
- 8 das 16 tabelas do painel não têm `<caption>` (Equipes, MeuTrabalho x2, NovaOcorrencia, Ocorrencia, Orgaos, QuemEstaEmCampo, Usuarios); as 8 com caption usam `oculto-visualmente`. `scope="col"` aparece 75 vezes.
- `NaoEncontrada.tsx` (`Vazio` com `<p>`) não tem nenhum título de página (`<h1>` ausente; as outras 16 páginas têm).
- O alvo de 44 px vem de `--ds-touch` em 13 regras de `app.css`, mas nenhum teste do painel cita `--ds-touch` (grep).
- Tamanhos de fonte em `px` (`tokens.css:160-168`): o zoom do navegador amplia, a mudança de tamanho de fonte padrão do navegador não. Reflow em 320 px e zoom de 200 por cento: NÃO CONFIRMADO, nenhum teste.
- Mapa: o modo plano tem tabela com caption (`Mapa.tsx:244-245`) e pinos com `aria-label` (o e2e clica por `aria-label`); o modo Google usa `google.maps.Marker` (`paginas/MapaDoGoogle.tsx`), cuja acessibilidade por teclado e leitor NÃO foi verificada.
- Erro global de renderização: sem ErrorBoundary no painel (grep por `ErrorBoundary`, `componentDidCatch`, `errorElement`: zero).

Depende de validação humana e não existe registro: leitor de tela (NVDA, JAWS, VoiceOver), pessoa com deficiência, revisão manual de ordem de foco e de texto alternativo, teste em Alto Contraste real do Windows (o teste de `forced-colors` é, nas palavras do próprio arquivo, "grosseiro de propósito"), teste em 200 por cento de zoom, revisão eMAG.

### 2.2 Portal das secretarias (não existe)

Prova da ausência: `apps/` sem diretório de portal; nenhuma rota de interface para órgão além do HTML do ofício entregue por link de uso único, servido pela API (`apps/api/src/rotas/oficios.ts:602-666`, uma leitura única, sem formulário de resposta) e da página de recusa. Esse HTML tem CSS embutido com hexadecimais literais (`oficios.ts:146-157`), fora do painel e fora de todos os portões de design.

O que a V2 precisará cumprir (derivado dos requisitos que o projeto já se impôs, sem inventar norma):
- Os mesmos requisitos do painel: WCAG 2.1 AA nos fluxos principais (`docs/referencia/ESPECIFICACAO_TECNICA_PRELIMINAR.md:263`, RNF-09), contraste calculado nos dois temas, teclado completo, nunca só cor, foco visível, Alto Contraste, movimento reduzido, título por rota.
- Fluxos de formulário com resposta, devolução com motivo, complemento e anexos: cada um precisa de amarração rótulo, erro e dica, foco em erro, confirmação de ato irreversível e anúncio de mudança de estado (aceite, devolução), porque o fluxo de estados é o núcleo do portal.
- Um portão de acessibilidade que varra o portal: os portões atuais têm a pasta fixa (`RAIZ = ... "..", "src"` dentro de `apps/web/test`), então um `apps/portal` não seria coberto.
- Axe-core no CI e auditoria manual com leitor de tela por etapa, que o levantamento técnico prescreve (`docs/referencia/LEVANTAMENTO_TECNICO_JURIDICO_GOVTECH.md:244`, J09) e que não existem hoje.

O que hoje seria reaproveitado: `tokens.css`, `app.css` (tabela, selo, aviso, formulário), `Campo`, `Modal`, `ConfirmarAcao`, `Toast`, `TrocaDeTela`, `Carregando`, `Vazio`, `ErroCampo`, glifos e rótulos de shared, gates como modelo. Se o portal morar dentro de `apps/web` (decisão humana), os portões atuais já o cobrem; se for outra aplicação, não.

### 2.3 App do agente de campo (apps/campo)

Automatizado:

| Portão | Verifica | Não verifica |
| --- | --- | --- |
| `scripts/portao-acessibilidade-do-aplicativo.test.mjs` (rodei: 10 de 10) | contraste calculado nos dois temas em 34 pares, incluindo chips leves, avisos, crachá do sino, botão de realce e bordas de controle (3:1); alvo de toque mínimo 52 em todo tocável (`minHeight`, `height` ou `flex: 1`), lendo a árvore JSX, com prova de mutação; todo tocável com `accessibilityLabel` e `accessibilityRole`; escape nomeado que só dispensa a primitiva `Tocavel` | pixel, texto sobre foto, `TextInput` (não é tocável para o portão), ordem de foco, escala de fonte |
| `scripts/portao-design-do-aplicativo.test.mjs`, `portao-densidade`, `paridade-de-tokens` (este rodei) | valor de design fora de token; uma ação principal por tela; protagonista de hierarquia; espera sem saída; paridade com o painel | |
| Jest com RNTL (121 arquivos de teste no app; 52 tocam rótulo ou papel; não rodei) | texto falado de campo com erro, rótulos de botões que chamam, diálogo, faixa de sincronização, reduzir movimento | leitor de tela; a auditoria anterior registra 5 arquivos e 20 casos vermelhos, ver 1.6 |

Acessibilidade nativa que existe, por contagem de uso em código não teste: `accessibilityLabel` 61 ocorrências em 26 arquivos; `accessibilityRole` 45 em 25; `accessibilityState` 15; `accessibilityLiveRegion` 8 (`polite` na maioria, `assertive` em `vistoria/[id].tsx:650`); `accessibilityViewIsModal` 4; `importantForAccessibility` 20; `accessibilityHint` 4; `AccessibilityInfo.isReduceMotionEnabled` mais o evento `reduceMotionChanged` (`ui/useReducaoDeMovimento.ts`); tema automático (`userInterfaceStyle: "automatic"`); alvo de 52 pontos em todo o app.

O que NÃO existe ou não está confirmado, verificado por grep em `src`:
- Escala de fonte do sistema (Dynamic Type no iOS, tamanho de fonte no Android): zero ocorrências de `allowFontScaling`, `maxFontSizeMultiplier`, `fontScale`, `PixelRatio`. O React Native escala o texto por padrão, então o comportamento existe por omissão, mas `larguraDoRotulo` e `varianteQueCabe` (`componentes.tsx:352-426`) estimam a largura do rótulo com tamanho fixo e uma tabela de avanço, sem considerar a escala. Nenhum teste renderiza com fonte ampliada. Como ficam botões lado a lado e o encolhimento de rótulo a 130 por cento ou 200 por cento: NÃO CONFIRMADO.
- Títulos para navegação por rotor: um único `accessibilityRole="header"` no app inteiro (`app/(agente)/fila.tsx:674`).
- Orientação travada em retrato (`app.config.ts:200`): pessoa com aparelho fixo em suporte horizontal não consegue girar. Decisão humana.
- Assinatura: o quadro só aceita traço de dedo (`ui/Assinatura.tsx`, `PanResponder`); rótulo "Arraste o dedo para assinar" (linha 262); não encontrei alternativa para quem não consegue desenhar. A pessoa que assina é o morador, não o agente. NÃO CONFIRMADO o que acontece nesse caso.
- Validação em aparelho: `apps/campo/PENDENCIAS.md:150-155` diz que nada foi executado em aparelho; `:178-180` diz que não há aparelho Android no projeto. O vidro do menu não existe no Android. Nunca se usou TalkBack. Há um iPhone real, sem registro de VoiceOver.
- Sem ErrorBoundary (grep zero).

### 2.4 App do cidadão (não existe)

Prova da ausência: nenhum diretório, nenhum pacote, nenhuma tela; `apps/campo` é do agente (`app/(agente)`).

O que a V2 precisará cumprir, sem inventar norma: o conjunto que o app do agente já cumpre (contraste nos dois temas, rótulo e papel em tocável, alvo de toque, reduzir movimento, tema automático, campo com rótulo falado de erro) MAIS o que o público amplo exige e o agente dispensa: suporte declarado e testado a fonte ampliada, leitor de tela em Android e iOS, navegação por rotor com títulos, linguagem simples, tolerância a erro, orientação, alternativa à assinatura e à câmera se vierem ao fluxo, consentimento e avisos legíveis. Hoje nada disso tem alvo de conformidade definido (decisão humana, item 3).

O que hoje seria reaproveitado: `tokens.ts` (TS puro), os portões do campo como modelo (hoje presos a `apps/campo/src`), shared (glifos, mensagens, esquemas), `useReducaoDeMovimento`, o `Campo` de formulário (com a dependência de tema do agente) e o padrão de diálogo. O alvo de toque de 52 é do agente; o do cidadão é decisão de produto.

### 2.5 Console do fornecedor (apps/console)

Automatizado (`apps/console/test/o-acabamento-da-tela.test.ts`, `a-tela-responde.test.ts`, lidos, não executados):
- política de segurança de conteúdo: sem `style` em HTML, sem `<style>`, sem script dentro do HTML, sem recurso externo;
- régua de design: nenhuma cor, sombra, raio ou duração escrita à mão fora dos tokens; dois temas completos, o escolhido vence o do sistema; alternador com `aria-pressed` e rótulo; `min-height: var(--ds-touch)` em `.botao` e `input`; estados `:hover`, `[disabled]`, `:focus-within`, `aria-busy` com roda;
- diálogos com `role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-describedby`, `tabindex="-1"`, `inert` atrás, Escape, botão que repete o verbo, recusa depois da ação;
- estado "nunca só cor": palavra e ícone no alarme de silêncio e no estado de acesso;
- roda em todo botão que espera.

Estrutura semântica que verifiquei no HTML: `<html lang="pt-BR">` (`pagina.ts:45`), `<main id="principal">` (197), `<nav aria-label="Telas do console">` (164), tabelas com `<caption class="oculto">` e `<th scope="col">` (467-487, 675-682), `<label for>` em todos os campos, `autocomplete` correto.

Lacunas verificadas:
- Nenhum cálculo de contraste: grep por contraste, luminância e WCAG no console traz só três comentários de código. Os pares herdam os valores do painel, que o portão do painel mede, mas pares próprios do console (estados de acesso, recado) não são medidos.
- Sem salvaguarda de Alto Contraste: `:focus-visible { outline: none; box-shadow: var(--ds-focus-ring) }` (`pagina.ts:1449`) e nenhum `@media (forced-colors: active)`. É exatamente o defeito que o portão do painel (`o foco sobrevive ao Alto Contraste do Windows`) existe para impedir. Comportamento real em Alto Contraste: não verificado em navegador.
- Sem atalho de pular (tela de página única; o custo é baixo).
- Erro de login e de formulário em `role="status"` com `aria-live="polite"` (`pagina.ts:383`, 509, 615, 688, 713): anúncio educado para erro; escolha de UX sem teste. Nenhum `aria-invalid` (grep: 0) e `aria-describedby` só nos diálogos.
- Quebra responsiva única de 640 px.

Validação humana: nenhuma registrada.

### 2.6 Itens transversais

- Exigência legal brasileira já citada no projeto (apenas como requisito a verificar, sem parecer jurídico): Lei 13.146/2015 (LBI), art. 63, acessibilidade digital, citada em `docs/CONTEXTO.md:34`, `docs/APRESENTACAO.md:108`, `docs/referencia/LEVANTAMENTO_TECNICO_JURIDICO_GOVTECH.md:171` (que fala em WCAG 2.1 AA como piso e eMAG como referência de governo, "vira cláusula de edital") e na lista autorizada do teste de conteúdo (`packages/shared/test/regras-de-conteudo.test.ts:37`). O eMAG só aparece no levantamento, e não há nenhuma verificação eMAG no código. A aplicabilidade a cada superfície é questão jurídica em aberto.
- Documentos oficiais: o PDF do laudo e do ofício sai de `page.pdf({ format: "A4", printBackground: true })` (`apps/api/src/documentos/pdf.ts:103-105`), sem `tagged: true`; o tipo de `playwright-core` 1.62.1 instalado diz "Whether or not to generate tagged (accessible) PDF. Defaults to `false`" (`node_modules/playwright-core/types/types.d.ts:4110`). O HTML do documento tem `lang="pt-BR"` e `alt` nas imagens (`documentos/folha.ts:317, 409`; `laudo.ts:529, 627`). Acessibilidade do PDF como peça entregue ao cidadão ou ao órgão: NÃO CONFIRMADA, e provavelmente não etiquetada.
- README diz "dezessete pares" de contraste (`README.md:645`); o portão do painel tem 21. É documentação defasada, não defeito.
- O levantamento prescreve "zero violação crítica" com axe-core no CI e auditoria manual com NVDA e VoiceOver (`LEVANTAMENTO...:496`). Nenhuma dependência de axe, Lighthouse, pa11y, Cypress ou Detox em nenhum `package.json`. O CI (`.github/workflows/verificar.yml`) roda typecheck, suíte, isolamento, audit, e2e Playwright, pacote de demonstração, app de campo e Postgres real: nada de acessibilidade além dos testes já descritos.

## Matriz D

Convenção: ESTADO A a G conforme o preâmbulo. "lido" = li o código e o teste, sem executar o teste. Caminhos relativos a `dc360/`. Nas superfícies que não existem, a linha de existência é D e a de requisito é E.

| ID | SUPERFÍCIE | DOMÍNIO | REQUISITO / CAPACIDADE | ESTADO | EVIDÊNCIA | RISCO | DEPENDÊNCIAS | DECISÃO HUMANA? | OBSERVAÇÃO |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| UXD-01 | Web | Tokens | Tokens únicos de cor, tipografia, espaço, raio, sombra, toque, z e movimento, com tema claro e escuro | A | `apps/web/src/estilos/tokens.css:1-233`; contraste dos tokens passa em `acessibilidade.test.ts` (rodei) | Baixo | | Não | Fonte de verdade de fato do produto |
| UXD-02 | Web | Design gate | Nenhum valor de cor, raio, sombra, duração, peso, tamanho ou espaço literal | B | `apps/web/test/design-system.test.ts:62-130`; `Estrutura.tsx:132` `style={{ borderRadius: "8px" }}`, regex do portão casa (reproduzi) | Baixo | UXD-01 | Não | Teste não executado por mim; auditoria anterior reporta 1 caso falhando, consistente |
| UXD-03 | Campo | Tokens | Tema claro e escuro, espaço, raio, tipografia, toque 52, movimento, elevação, papel e visor fixos | A | `apps/campo/src/ui/tokens.ts:127,151,203,244,251,255,327,387`; `paridade-de-tokens` passa 10 de 10 (rodei) | Baixo | UXD-01 | Não | `papel` e `visor` não seguem o tema, por razão documentada |
| UXD-04 | Transversal | Tokens | Paridade de tokens painel e campo garantida por teste | B | `scripts/paridade-de-tokens-do-aplicativo.test.mjs` (rodei, 10/10); mapa SEMANTICOS tem 23 pares, sem `bordaControle`, `anelDeFoco`, `accent-graphic` | Médio | UXD-01, UXD-03 | Não | Valores iguais hoje (leitura); igualdade desses três não é garantida |
| UXD-05 | Console | Tokens | Tokens do produto no console | C | `apps/console/src/pagina.ts:1064-1190`; comparação em memória: subconjunto do painel, valores idênticos; sem teste de paridade | Médio | UXD-01 | Não | Sem `--ds-sev-*`, `--ds-fw-*`, `--ds-z-*`, `--ds-qr-*` (não usa). Cópia sem portão |
| UXD-06 | Transversal | Tokens | Tokens em package compartilhado consumível por web e React Native | D | `packages/` só tem `shared` e `campo`; `packages/shared/src/index.ts` sem tokens | Alto para V2 | | Sim | Decidir fonte (CSS ou TS) e quem gera o outro |
| UXD-07 | Transversal | Semântica visual | Glifos de severidade, rótulos de domínio e mensagens do Zod em um lugar só | A | `packages/shared/src/glifos-de-severidade.ts:120-162`; imports em `comuns.tsx:6-9` e `campo/src/ui/icones.tsx:3`; `mensagens-do-zod.ts`; `campos.ts` | Baixo | | Não | Portão `paridade-de-severidade` lido, não executado |
| UXD-08 | Transversal | Fontes | Work Sans e Roboto Mono servidas localmente, sem rede | B | web: `tokens.css:1-60`, `scripts/fontes-do-painel.test.mjs` (byte a byte, lido); campo: `assets/fontes`; console: `src/fontes.ts` (base64 Brotli, 3 faces) | Médio | | Não | Três cópias; o console só confere assinatura TrueType e tamanho, não o conteúdo |
| UXD-09 | Web | Tipografia | Escala display 44 a caption 12, pesos por token | A | `tokens.css:160-172`; regras de peso e tamanho em `design-system.test.ts:99-110` | Baixo | UXD-01 | Não | Unidade px (ver A11-12) |
| UXD-10 | Campo | Tipografia | Sete degraus, rastreio, régua de hierarquia com portão, piso de interação 14 | A | `tokens.ts:300-363`; `ui/hierarquia.ts`; `portao-design-do-aplicativo.test.mjs` (H1 e H3, lido) | Baixo | UXD-03 | Não | Não visto em aparelho (`PENDENCIAS.md:258-262`) |
| UXD-11 | Transversal | Espaço, raio, sombra | Escalas de espaçamento, raio e elevação por tema | A | web `tokens.css:175-178, 145-147, 215-217`; campo `tokens.ts:251-255` e `elevacao`; teste de igualdade de espaço e raio (rodei) | Baixo | UXD-04 | Não | |
| UXD-12 | Transversal | Movimento | Durações por token, movimento reduzido respeitado | A | web `tokens.css:224-233`; campo `ui/useReducaoDeMovimento.ts`; console `pagina.ts:1221-1236` | Baixo | | Não | Exceção documentada da roda de carregamento no console |
| UXD-13 | Transversal | Dark e light | Dois temas completos, alternância, persistência | A | web `estado/sessao.tsx:131-150` e e2e `fluxo.e2e.mjs:317-338`; campo `ProvedorDeTema` (`componentes.tsx:101`), `app.config.ts:201`; console `o-acabamento-da-tela.test.ts:269-298` | Baixo | | Não | Web só alterna entre dois estados; o campo tem "sistema, claro, escuro" |
| UXD-14 | Web | Componentes | Biblioteca de componentes coerente, sem estilo solto | B | 15 arquivos em `src/componentes`; 89 `style={{` em 18 arquivos; `Modal.tsx:243-246` admite estilo inline "porque app.css pertence a outra frente" | Médio | UXD-01 | Não | Dívida de migrar inline para a folha |
| UXD-15 | Campo | Componentes | Primitivas do app (Botao, Tocavel, Txt, Cartao, Aviso, Vazio, Carregando, Dialogo, Chip, Cracha, FaixaDeSincronizacao...) | A | `ui/componentes.tsx` (1468 linhas), `ui/*.tsx`; testes `src/ui/*.test.tsx` (52 de 121 arquivos tocam rótulo ou papel) | Baixo | | Não | Jest não executado; auditoria anterior lista 5 arquivos vermelhos no app |
| UXD-16 | Console | Componentes | Componentes reutilizáveis | C | `pagina.ts` 3646 linhas: HTML, CSS e JS em três strings, sem componentes | Médio | | Não | Reuso só de tokens e de padrões |
| UXD-17 | Web | Formulário | Padrão Campo: amarração única de rótulo, erro, dica, required | A | `componentes/Campo.tsx:41-113`; `test/campo.test.ts`, `formularios.test.ts`; e2e `fluxo.e2e.mjs:361` | Baixo | | Não | Base para o portal |
| UXD-18 | Campo | Formulário | Campo RN com rótulo falado e erro antes da ajuda | A | `ui/Campo.tsx:73-96`; `ui/campo.test.tsx` (lido) | Baixo | | Não | RN sem `aria-invalid`: o erro vai no texto falado |
| UXD-19 | Console | Formulário | Erro por campo e mensagens de erro | C | `pagina.ts` tem `<label for>` e `novalidate`; erro numa região única (`:383, 509, 615`); `aria-invalid` ausente (grep 0) | Médio | | Não | Sem `aria-describedby` por campo |
| UXD-20 | Web | Validação | Validação de formulário com esquemas do shared, 422 mostrado por campo e lista | A | `Equipes.tsx:56`, `NovaOcorrencia.tsx:130`, `Ocorrencia.tsx:1133`, `comuns.tsx:281` `ErrosDoServidor`, `shared/campos.ts` | Baixo | | Não | |
| UXD-21 | Campo | Validação | Conferência local com os mesmos esquemas antes de enfileirar | A | `packages/campo/src/conferencia.ts`; `mensagens-do-zod.ts:1-35` | Baixo | | Não | Lido |
| UXD-22 | Web | Modal | Modal acessível e confirmação de ato irreversível | A | `componentes/Modal.tsx:248-331`, `ConfirmarAcao.tsx:100`; `test/modal.test.ts` (326 linhas), `portoes-de-componente.test.ts:390, 535, 641` | Baixo | | Não | Lido, não executado |
| UXD-23 | Campo | Modal | Diálogo em folha, recusa obrigatória no destrutivo, sem `Alert.alert` | A | `ui/Dialogo.tsx:1-80`; `portao-design-do-aplicativo` reprova `Alert.alert` (README) | Baixo | | Não | |
| UXD-24 | Console | Modal | Dois diálogos com amarração completa e `inert` | A | `pagina.ts:914, 947`; `o-acabamento-da-tela.test.ts:391-462` | Baixo | | Não | Lido |
| UXD-25 | Web | Toast | Aviso passageiro anunciado, com pausa e saída manual | A | `componentes/Toast.tsx:30-160`; `test/toast.test.ts` (242 linhas) | Baixo | | Não | 6 s e 15 s para ditar protocolo |
| UXD-26 | Campo e Console | Toast | Equivalente de toast | D | grep por `toast` no campo: zero; o console usa região `recado` | Baixo | | Sim | Decidir se a V2 padroniza um componente de confirmação passageira |
| UXD-27 | Web | Estado de erro | Erro de API, de campo, 404, sem conexão; erro inesperado de renderização | B | `dados/http.ts:56-63, 131-133`; `paginas/NaoEncontrada.tsx`; grep `ErrorBoundary`, `componentDidCatch`, `errorElement`: zero | Médio | | Não | Sem barreira de erro de renderização: tela em branco |
| UXD-28 | Campo | Estado de erro | Erro por motivo (sessão, suspensão, sem sinal) e erro inesperado | B | `dados/falha-de-atualizacao.ts:98-160`; sem `ErrorBoundary` (grep zero) | Médio | | Não | Tela de falha de renderização em campo: não tratada |
| UXD-29 | Console | Estado de erro | Erro visível com ícone e texto, servidor fora do ar | C | `pagina.ts:383`; `a-tela-responde.test.ts:407, 485, 705` | Baixo | | Não | Erro como `role="status"` |
| UXD-30 | Transversal | Carregamento | Estado de carregamento com saída | A | web `comuns.tsx:318-325`; campo `componentes.tsx:1319-1375` (`DEMORA_MS` 6000, `aoDesistir`); console `a-tela-responde.test.ts:549-585`, `o-acabamento:326-351` | Baixo | | Não | |
| UXD-31 | Transversal | Vazio | Estado vazio desenhado | A | web `comuns.tsx:327`; campo `componentes.tsx:1269`; console `a-tela-responde.test.ts:587` | Baixo | | Não | |
| UXD-32 | Campo | Offline | Fila e faixa de sincronização com estados e clímax | B | `ui/FaixaDeSincronizacao.tsx` (`decidirFaixa`, 6 estados); `faixa-de-sincronizacao.test.tsx`; `PENDENCIAS.md:150-155` nada em aparelho | Médio | `packages/campo` | Não | Lógica testada com dublê; não vista em aparelho |
| UXD-33 | Web | Offline | Comportamento sem conexão | C | só mensagem de falta de conexão (`http.ts:131-133`); sem service worker (grep zero) | Baixo hoje, Alto para portal | | Sim | Portal e cidadão podem precisar de política de offline |
| UXD-34 | Web | Responsividade | Layout responsivo | C | `app.css:673, 846, 872` (1080, 900, 600 px); nenhum teste de viewport (e2e sem `setViewportSize`) | Médio | | Não | Lateral vira barra inferior |
| UXD-35 | Campo | Responsividade | Orientação e tablet | C | `app.config.ts:200` `portrait`, `:230` `supportsTablet: true`; nenhum teste de layout de tablet | Médio | | Sim | Retrato travado |
| UXD-36 | Console | Responsividade | Layout móvel | C | uma quebra em `pagina.ts:2135` (640 px) | Baixo | | Não | |
| UXD-37 | Transversal | Ícones | Conjunto de ícones coerente entre superfícies | B | `web/.../Icones.tsx` (22 funções), `campo/src/ui/icones.tsx`, sprite do console; só severidade compartilhada | Baixo | | Não | Três desenhos à mão do mesmo vocabulário |
| UXD-38 | Transversal | Conteúdo | pt-BR, sem travessão, COBRADE, sem norma inventada | A | `packages/shared/test/regras-de-conteudo.test.ts` (lido) | Baixo | | Não | Não executado |
| UXD-39 | Transversal | i18n | Internacionalização | D | nenhuma lib em `package.json` de api, web, campo, console, shared; `pt-BR` fixo em 11 pontos | Baixo hoje | | Sim | Ver decisão de idiomas |
| UXD-40 | Transversal | UX writing | Botão de confirmação repete o verbo e o objeto, nunca "OK" | A | web `portoes-de-componente.test.ts:641`; campo `Dialogo.tsx:41`; console `o-acabamento-da-tela.test.ts:423` | Baixo | | Não | Três implementações da mesma regra |
| UXD-41 | Portal das secretarias | Existência | Superfície de interface do portal | D | `apps/` sem portal; único HTML para órgão é o ofício por link de uso único em `apps/api/src/rotas/oficios.ts:602-666` (leitura, sem resposta) | Alto | | Sim | |
| UXD-42 | Portal das secretarias | Design | Padrão visual, shell por órgão, formulários de resposta, devolução, anexos, prazo | E | Fluxo descrito no preâmbulo; nada no código | Alto | UXD-06, UXD-17, UXD-22, UXD-46 | Sim | Ver decisão 1 |
| UXD-43 | App do cidadão | Existência | Superfície RN do cidadão | D | `apps/campo` é `app/(agente)`; nenhum app de cidadão | Alto | | Sim | |
| UXD-44 | App do cidadão | Reuso de tokens | Aproveitar tokens do campo | C | `tokens.ts` sem imports (puro); `toque` 52, `papel`, `visor` específicos do agente | Médio | UXD-06 | Sim | Extração precisa distinguir genérico de agente |
| UXD-45 | App do cidadão | Reuso de componentes | Componentes RN sem dependência do agente | C | `componentes.tsx:19` importa `dados/preferencia-de-tema` (SQLite); `FaixaDeSincronizacao` importa `dados/conectividade` e `resumo-da-fila` | Alto | UXD-06 | Sim | Precisam de portas (armazenamento, sinal, fila) |
| UXD-46 | Portal das secretarias | Reuso de componentes | Reuso de componentes do painel | C | componentes em `apps/web/src/componentes`, sem package; `Estrutura.tsx:45-110` navegação fixa da Defesa Civil | Médio | | Sim | Mesma aplicação ou aplicação nova muda tudo |
| UXD-47 | Transversal | Gates | Portões de design e acessibilidade cobrem qualquer superfície nova | B | `acessibilidade.test.ts:27` `RAIZ` = `apps/web/src`; `scripts/fonte-do-aplicativo.mjs` fixa `apps/campo/src`; o console testa a própria string | Alto para V2 | | Não | Superfície nova nasce sem portão |
| UXD-48 | Transversal | HTML da API | HTML servido pela API (ofício, recusa, laudo, folha) alinhado ao design | B | `rotas/oficios.ts:146-157` CSS com hexadecimais; `documentos/folha.ts` com `--papel`, `--tinta` próprios | Baixo | | Não | Documentos impressos são papel, por desenho; a página de recusa não é |
| UXD-49 | Campo | UX de estado | Texto de sessão encerrada coerente com o teste | G | `falha-de-atualizacao.ts:98-125` (15/09) contra `a-sessao-que-terminou-nao-e-falta-de-sinal.test.tsx:203` (14/09); auditoria anterior: 5 arquivos, 20 casos | Médio | | Sim | Três lados, não re-executei o Jest (ver 1.6) |
| UXD-50 | Transversal | Documentação | Documentação do design system do produto real | C | README `:628-720` descreve os portões; `DESIGN_SYSTEM.md` e `_tokens.scss` estão em `mockup/` e não têm `--ds-border-controle`, `--ds-fw-*`, `--ds-qr-*` | Baixo | | Não | `tokens.css` afirma espelhar esses arquivos |
| UXD-51 | Portal das secretarias | Identidade | Identidade visual por órgão ou única | F | sem evidência; decisão de produto | Médio | UXD-42 | Sim | Ver decisão 1 |
| A11-01 | Web | Contraste | Contraste AA calculado nos dois temas sobre os tokens | A | `acessibilidade.test.ts:143-190` 21 pares; rodei: 2 casos de contraste passam | Baixo | UXD-01 | Não | Sobre token, não sobre pixel; README diz "dezessete" (`README.md:645`) |
| A11-02 | Web | Contraste | Pares fora da tabela: lateral escura, hover, disabled, placeholder | C | lateral: `app.css:127-180` lê primitivas; medi 7,71 (muted), 15,32 (ativo), 14,79 (hover); disabled e placeholder não medidos | Baixo | | Não | Sem portão |
| A11-03 | Web | Teclado | Nenhum `onClick` fora do alcance do teclado | B | rodei: falha em `Modal.tsx:260`; exceção em `:254` fora da janela de 4 linhas | Baixo | | Não | Falso positivo, portão vermelho |
| A11-04 | Web | Foco | Foco visível, e sobrevive ao Alto Contraste | A | `app.css:45, 58-70`; casos passam (rodei) | Baixo | | Não | Teste "grosseiro de propósito"; sem navegador em modo forçado |
| A11-05 | Web | Navegação | Atalho de pular, título por rota, foco no conteúdo | A | `Estrutura.tsx:128`, `TrocaDeTela.tsx`; testes passam (rodei); e2e `fluxo.e2e.mjs:368-375` | Baixo | | Não | |
| A11-06 | Web | Formulário | Rótulo, required, aria-invalid, aria-describedby, foco no erro | A | `Campo.tsx`, `foco.ts`; `campo.test.ts`, `formularios.test.ts`, `foco.test.ts` (lidos) | Baixo | | Não | |
| A11-07 | Web | Modal | Armadilha de foco, inert, retorno de foco | A | `Modal.tsx:1-60, 248-331`; `modal.test.ts` (lido) | Baixo | | Não | |
| A11-08 | Web | Busca | Combobox com `aria-activedescendant` e contagem `aria-live` | A | `fluxo.e2e.mjs:81-103` (não rodei) | Baixo | | Não | Só roda no CI |
| A11-09 | Web | Tabelas | Nome acessível e cabeçalhos de tabela | B | 16 tabelas, 8 com `<caption>`; `scope="col"` 75; Equipes, MeuTrabalho x2, NovaOcorrencia, Ocorrencia, Orgaos, QuemEstaEmCampo, Usuarios sem caption | Médio | | Não | Sem portão |
| A11-10 | Web | Estrutura | Título de página em toda tela | B | `NaoEncontrada.tsx` sem `<h1>`; 16 páginas com | Baixo | | Não | |
| A11-11 | Web | Alvo de toque | Alvo mínimo de 44 px (regra do `CLAUDE.md`) | C | `--ds-touch` em 13 regras de `app.css`; nenhum teste do painel o cita | Médio | | Não | Regra sem portão |
| A11-12 | Web | Zoom e reflow | Texto ampliável e reflow em 320 px | G | fontes em `px` (`tokens.css:160-168`); quebra mínima 600 px; nenhum teste | Médio | | Sim | WCAG 1.4.4 e 1.4.10 não verificados |
| A11-13 | Transversal | Automação | Axe-core ou equivalente em navegador no CI | D | grep em todos os `package.json`: sem axe, Lighthouse, pa11y, Cypress, Detox; workflow sem passo de acessibilidade | Alto | | Sim | Prescrito em `LEVANTAMENTO...:244, 496` |
| A11-14 | Web | Validação humana | Leitor de tela, pessoa com deficiência, revisão manual | D | grep por NVDA, JAWS, VoiceOver, TalkBack em `docs` e `dc360`: só comentários e o levantamento | Alto | | Sim | Nenhum registro |
| A11-15 | Web | Mapa | Acessibilidade do mapa e dos pinos | G | modo plano: tabela com caption (`Mapa.tsx:244`), pinos com `aria-label` (e2e `:283`); modo Google (`MapaDoGoogle.tsx`) não verificado | Médio | | Não | |
| A11-16 | Web | Estado nunca só por cor | Selo, aviso, erro com ícone e texto | A | `comuns.tsx:39-62, 183-198`; `glifos-de-severidade.test.ts:36-62` | Baixo | | Não | |
| A11-17 | Web | Movimento | Movimento reduzido | A | `tokens.css:224-233`; `app.css:254-256` | Baixo | | Não | |
| A11-18 | Campo | Contraste | Contraste AA nos dois temas, 34 pares | A | `portao-acessibilidade-do-aplicativo.test.mjs:61-140`, rodei 10 de 10 | Baixo | UXD-03 | Não | Sobre token; texto sobre foto não coberto |
| A11-19 | Campo | Alvo de toque | Todo tocável com piso de 52 | A | mesmo portão, caso `nenhum alvo de toque abaixo de 52` (rodei) | Baixo | | Não | Estático; não vê `TextInput` nem tocável criado por componente externo |
| A11-20 | Campo | Leitor de tela | Todo tocável com papel e rótulo | A | caso `todo elemento tocável se apresenta ao leitor de tela` (rodei) | Baixo | | Não | Rótulo presente, não rótulo bom |
| A11-21 | Campo | API nativa | Uso de estado, região viva, modal, dica, headers | B | contagens em código não teste: Label 61, Role 45, State 15, LiveRegion 8, ViewIsModal 4, Hint 4, `header` apenas 1 (`fila.tsx:674`) | Médio | | Não | Poucos títulos para rotor |
| A11-22 | Campo | Escala de fonte | Dynamic Type e tamanho de fonte do Android | G | zero ocorrências de `allowFontScaling`, `maxFontSizeMultiplier`, `fontScale`; `larguraDoRotulo` (`componentes.tsx:352`) usa tamanho fixo | Alto | | Sim | RN escala por padrão; layout ampliado não testado |
| A11-23 | Campo | Movimento | Reduzir movimento com escuta em tempo real | A | `ui/useReducaoDeMovimento.ts:1-54` | Baixo | | Não | |
| A11-24 | Campo | Tema | Tema automático mais escolha | A | `app.config.ts:201`; `tema-a-escolha-do-agente.test.tsx` (lido) | Baixo | | Não | |
| A11-25 | Campo | Validação humana | VoiceOver e TalkBack em aparelho | D | `apps/campo/PENDENCIAS.md:150-155, 178-180`: nada em aparelho, sem aparelho Android | Alto | | Sim | O app do cidadão é Android e iOS |
| A11-26 | Campo | Orientação | Orientação livre | F | `app.config.ts:200` `portrait` | Médio | | Sim | Decisão de produto |
| A11-27 | Campo | Assinatura | Alternativa ao traço de dedo | G | `ui/Assinatura.tsx:262` só desenho | Médio | | Sim | Quem assina é o morador |
| A11-28 | Campo | Campo de texto | Erro e obrigatório ditos no rótulo falado | A | `ui/Campo.tsx:73-96`, `campo.test.tsx` (lido) | Baixo | | Não | Sem `aria-invalid` no RN |
| A11-29 | Console | Estrutura | `lang`, `main`, `nav`, tabelas com caption e `th scope`, labels | A | `pagina.ts:45, 164, 197, 467-487, 675-682` | Baixo | | Não | |
| A11-30 | Console | Contraste | Contraste calculado | D | grep por contraste, luminância e WCAG em `apps/console`: só três comentários | Médio | UXD-05 | Não | Tokens iguais aos do painel; pares próprios não medidos |
| A11-31 | Console | Foco e Alto Contraste | Foco visível em `forced-colors` | B | `pagina.ts:1449`; regex do portão do painel aplicada ao CSS do console: `removeFoco true`, `temForcado false` | Médio | | Não | Mesmo defeito que o painel já corrigiu |
| A11-32 | Console | Erro | Erro anunciado e amarrado ao campo | C | `pagina.ts:383, 509, 615`: `role="status"`; `aria-invalid` ausente | Médio | | Não | |
| A11-33 | Console | Alvo de toque | 44 px em botão e campo | A | `o-acabamento-da-tela.test.ts:307-311` (lido) | Baixo | | Não | Só `.botao` e `input` |
| A11-34 | Console | Atalho de pular | Pular ao conteúdo | D | grep `pular`, `skip`: zero | Baixo | | Não | Tela única, custo baixo |
| A11-35 | Console | Validação humana | Leitor de tela e revisão manual | D | sem registro | Médio | | Sim | |
| A11-36 | Transversal | Documento oficial | PDF acessível do laudo e do ofício | B | `apps/api/src/documentos/pdf.ts:103-105` sem `tagged`; `playwright-core` 1.62.1 `types.d.ts:4110` default `false`; HTML com `lang`, `alt` | Médio | | Sim | Ver decisão 6 |
| A11-37 | Transversal | Exigência legal | LBI art. 63 e eMAG | G | `CONTEXTO.md:34`, `LEVANTAMENTO...:171`; nenhuma verificação eMAG no código | Alto | | Sim | Aplicabilidade é questão jurídica; não emito parecer |
| A11-38 | Portal das secretarias | Acessibilidade | Requisitos de acessibilidade do portal | E | RNF-09 `ESPECIFICACAO...:263`; J09 | Alto | UXD-42, UXD-47, A11-13 | Sim | Fluxo de estados precisa de anúncio de mudança |
| A11-39 | App do cidadão | Acessibilidade | Requisitos de acessibilidade do app do cidadão | E | Público amplo; sem alvo definido | Alto | UXD-43, A11-22, A11-25 | Sim | |
| A11-40 | App do cidadão | Conformidade | Nível alvo de conformidade | F | sem definição; RNF-09 fala em WCAG 2.1 AA no MVP | Alto | | Sim | Ver decisão 3 |
| A11-41 | App do cidadão | Idiomas | Idioma único ou vários | F | sem i18n (UXD-39) | Médio | | Sim | |
| A11-42 | Transversal | Processo | Processo de validação humana por etapa | F | `LEVANTAMENTO...:244` prescreve; nenhum registro | Alto | | Sim | Ver decisão 5 |
| A11-43 | Transversal | Portões | Reuso dos portões em novas superfícies | E | ver UXD-47 | Alto | UXD-47 | Não | |

## Fluxos

| FLUXO | PASSO | ESTADO (EXISTE/PARCIAL/AUSENTE/NOVO V2) | EVIDÊNCIA |
| --- | --- | --- | --- |
| Formulário com erro (painel) | Validar com esquema do shared, mostrar erro por campo, `aria-invalid` e `aria-describedby`, levar foco ao primeiro inválido, listar campos do 422 | EXISTE | `Campo.tsx`, `foco.ts`, `comuns.tsx:281`, `foco.test.ts:126-135`, e2e `fluxo.e2e.mjs:361` |
| Formulário com erro (campo) | Conferir coleta com esquemas, dizer "com erro" no rótulo falado, erro antes da ajuda | EXISTE | `ui/Campo.tsx:73-96`, `packages/campo/src/conferencia.ts` |
| Formulário com erro (console) | Erro numa região única, sem aria-invalid por campo | PARCIAL | `pagina.ts:383, 509`; grep `aria-invalid` zero |
| Confirmar ato irreversível | Título nomeia o ato, consequência em uma frase, botão repete o verbo, foco em Cancelar, Escape fecha | EXISTE nas três superfícies | `ConfirmarAcao.tsx`, `Dialogo.tsx`, `pagina.ts:914-960`, testes listados em UXD-22 a UXD-24 |
| Sessão encerrada no campo | Faixa "Sua sessão terminou", detalhe com "Entrar de novo", promessa de nada apagado | PARCIAL | código `falha-de-atualizacao.ts:98-125` contra teste `a-sessao-que-terminou...:203`; Jest não re-executado |
| Falta de conexão (painel) | Mensagem "Sem conexão com o servidor" e que o preenchido não foi enviado | PARCIAL | `dados/http.ts:131-133`; sem modo offline |
| Falta de sinal (campo) | Faixa de 6 estados, fila enchendo, sincronizado com clímax | EXISTE, não visto em aparelho | `FaixaDeSincronizacao.tsx`, `PENDENCIAS.md:150-155` |
| Erro inesperado de renderização | Tela de falha com saída | AUSENTE | grep zero em web e campo |
| Órgão recebe, aceita, devolve, responde, anexa com acessibilidade | Formulários e estados do portal | NOVO V2 | sem código; UXD-41, UXD-42 |
| Cidadão envia relato com acessibilidade e fonte ampliada | Fluxo de relato no app | NOVO V2 | sem código; UXD-43, A11-39 |
| Validação humana de acessibilidade por etapa | Teste com leitor de tela e pessoas, registro, critério de aceite | AUSENTE | A11-14, A11-25, A11-35, A11-42 |

## Gaps

1. `P1 PRODUTO`: nenhuma validação humana de acessibilidade em nenhuma superfície (A11-14, A11-25, A11-35, A11-42). Existe só prescrição (levantamento J09) e análise estática. O produto declara RNF-09 para o MVP.
2. `P1 PRODUTO`: nenhuma automação de acessibilidade em navegador real (A11-13): sem axe-core ou equivalente, contra o que o levantamento prescreve. Portões atuais leem fonte e tokens.
3. `P1 PRODUTO`: console sem salvaguarda de Alto Contraste e sem contraste medido (A11-30, A11-31). É um defeito já conhecido e corrigido no painel.
4. `P1 OPERAÇÃO`: dois portões do painel vermelhos hoje (A11-03, UXD-02). Um é falso positivo de janela de 4 linhas (`Modal.tsx:254` contra `:260`), outro é violação real pequena (`Estrutura.tsx:132`). Portão vermelho perde credibilidade e não sei o status do CI.
5. `P1 OPERAÇÃO`: sem ErrorBoundary no painel e no campo (UXD-27, UXD-28). Erro de renderização deixa tela em branco ou derruba o app em campo.
6. `P1 PRODUTO`: app de campo sem tratamento nem teste de fonte ampliada (A11-22), com estimador de largura que ignora a escala. NÃO CONFIRMADO o efeito, mas o app é usado por agentes de todas as idades.
7. `P1 PRODUTO`: nenhum aparelho Android e nenhuma validação de leitor de tela em aparelho (A11-25), enquanto o app do cidadão será Android e iOS.
8. `P1 OPERAÇÃO`: texto de "sessão encerrada" do campo mudou deliberadamente em 15/09 e o teste de 14/09 continua pedindo o texto antigo (UXD-49); a auditoria anterior chama de regressão. Não re-executei; divergência de três lados.
9. `P1 PRODUTO` (para a V2): portões presos a `apps/web/src` e `apps/campo/src` (UXD-47): superfície nova sem portão.
10. `P1 PRODUTO` (para a V2): tokens triplicados sem package e sem paridade no console (UXD-05, UXD-06); componentes RN do agente acoplados a tema em SQLite e à fila (UXD-45).
11. `P2 EVOLUÇÃO`: paridade painel e campo não cobre `bordaControle`, `anelDeFoco` e `accent-graphic` (UXD-04).
12. `P2 EVOLUÇÃO`: 8 de 16 tabelas sem nome acessível, 404 sem título, alvo de 44 px sem portão (A11-09, A11-10, A11-11).
13. `P2 EVOLUÇÃO`: estilo inline em 89 pontos do painel, constantes locais fora do `--ds-` e `letter-spacing` literal (UXD-14, seção 1.4).
14. `P2 EVOLUÇÃO`: HTML servido pela API (página de recusa, ofício) com cores literais e fora de todo portão (UXD-48).
15. `P2 EVOLUÇÃO`: documentação do design system defasada: `tokens.css` diz espelhar arquivos do protótipo que não têm 7 tokens; README fala em 17 pares e o portão tem 21 (UXD-50, A11-01).
16. `P2 EVOLUÇÃO`: apenas 1 `accessibilityRole="header"` no app de campo (A11-21); erros do console em `role="status"` sem `aria-invalid` (A11-32).
17. `A DEFINIR`: PDF oficial não etiquetado (A11-36): a prioridade depende de quem recebe o documento (cidadão, órgão, tribunal) e de exigência legal.
18. `A DEFINIR`: zoom e reflow do painel, unidade de fonte em px (A11-12), orientação do app (A11-26), alternativa à assinatura (A11-27), nível de conformidade alvo (A11-40), idiomas (A11-41), i18n (UXD-39).
19. `A DEFINIR`: exigência legal LBI art. 63 e eMAG sem verificação (A11-37).

## Decisões humanas

1. Padrão visual do portal das secretarias.
   - Pergunta: o portal usa o mesmo design do painel da Defesa Civil, ou identidade própria por órgão (Obras, Saúde, Assistência Social, Trânsito, Meio Ambiente, Engenharia, Fiscalização, concessionárias)?
   - Por que importa: define tokens, marca, shell e quanto do painel se reaproveita; também define se o órgão se sente "usuário do sistema da Defesa Civil" ou de um portal próprio.
   - O que bloqueia: extração de tokens em package, desenho do shell, portões de paridade, UXD-42 e UXD-51.
   - Alternativas: (a) mesmo design e marca DC360; (b) mesmo sistema com tema neutro e nome do órgão no cabeçalho; (c) identidade própria por órgão com tema por órgão; (d) identidade da prefeitura.
   - Riscos: (a) menor custo, risco de confundir papéis e de o órgão externo ver marca interna; (b) custo médio, exige tokens de tema por órgão e prova de contraste por tema; (c) custo e risco de contraste por órgão sem validação, muitas variações para testar; (d) depende de material de cada prefeitura, risco de marca inconsistente entre municípios.
2. Portal na mesma aplicação web ou em aplicação separada.
   - Pergunta: rotas do portal dentro de `apps/web`, filtradas por papel, ou `apps/portal`?
   - Por que importa: decide se os portões atuais, `Modal`, `Campo` e o shell se reaproveitam sem cópia, e o que o usuário do órgão recebe no pacote do navegador (telas internas da Defesa Civil).
   - O que bloqueia: UXD-46, UXD-47, política de segurança de conteúdo, desenho de build.
   - Alternativas: mesma aplicação; aplicação separada com package de componentes; aplicação separada copiando.
   - Riscos: mesma aplicação concentra código de dois públicos e aumenta a superfície exposta; separada com package exige criar package de UI e religar portões; cópia repete a deriva que já ocorre com o console.
3. Padrão de acessibilidade alvo do app do cidadão (público amplo, idosos, pessoas com deficiência).
   - Pergunta: qual nível e quais tecnologias assistivas são o alvo e o critério de aceite?
   - Por que importa: hoje o alvo declarado é WCAG 2.1 AA no MVP (RNF-09), sem mapeamento para app nativo; o cidadão amplia o público em relação ao agente.
   - O que bloqueia: A11-39, A11-40, o que se testa e com quem, o tamanho máximo de fonte suportado, contraste acima de AA, alvo de toque.
   - Alternativas: manter WCAG 2.1 AA; WCAG 2.2 AA; AA mais pontos de AAA (contraste reforçado, alvo maior) para o cidadão; eMAG como lista de verificação adicional.
   - Riscos: nível baixo demais expõe a questão legal e exclui quem mais precisa; nível alto aumenta custo de desenho e teste e pode atrasar a V2; adotar norma sem parecer jurídico pode gerar falsa segurança.
4. Idiomas.
   - Pergunta: pt-BR único, ou outros idiomas e linguagem simples?
   - Por que importa: hoje não há i18n (UXD-39) e todo texto está no código; o app do cidadão amplia a base.
   - O que bloqueia: decisão de infraestrutura de texto, rótulos de acessibilidade, tradução de documentos.
   - Alternativas: pt-BR único com revisão de linguagem simples; pt-BR mais Libras em vídeo para orientações (alternativa a verificar); segundo idioma para regiões de fronteira ou turismo.
   - Riscos: manter único exclui quem não lê bem português; multi-idioma exige biblioteca, revisão e conteúdo oficial traduzido com validade jurídica duvidosa.
5. Processo de validação humana de acessibilidade.
   - Pergunta: quem valida, com que tecnologia assistiva, em que etapa, com que critério de aceite e com que registro?
   - Por que importa: hoje não existe nenhum registro (A11-14, A11-25, A11-35) e o levantamento prescreve auditoria manual por etapa.
   - O que bloqueia: declarar RNF-09 cumprido, qualquer cláusula de edital, lançamento do app do cidadão nas lojas com declaração de acessibilidade.
   - Alternativas: auditoria interna; consultoria especializada; recrutar pessoas com deficiência para teste; combinação com axe-core no CI como piso.
   - Riscos: interna tende a subestimar problemas; consultoria tem custo e prazo; recrutamento exige consentimento e dados pessoais tratados (LGPD); sem decidir, o risco é declarar conformidade sem prova.
6. PDF oficial acessível.
   - Pergunta: laudo e ofício precisam sair como PDF etiquetado e navegável?
   - Por que importa: hoje `pdf.ts` não passa `tagged`; o documento vai a cidadão, órgão e possivelmente a processo.
   - O que bloqueia: A11-36.
   - Alternativas: ligar `tagged` e revisar a estrutura semântica do HTML; oferecer também HTML acessível; manter como está por ser documento de assinatura e impressão.
   - Riscos: ligar sem revisar a estrutura dá PDF etiquetado ruim; manter expõe o município a demanda de acesso; HTML alternativo duplica manutenção.
7. Fonte da verdade dos tokens e onde mora.
   - Pergunta: CSS (painel) gera TS (campo e cidadão), ou TS gera CSS, em qual package, e o console passa a consumir?
   - Por que importa: três cópias hoje; cinco superfícies na V2.
   - O que bloqueia: UXD-06, UXD-44, portões de paridade.
   - Alternativas: package de tokens com gerador; manter cópia com mais portões; consumo direto do `tokens.css` pelo console na construção.
   - Riscos: gerador exige pipeline no build, que o console não tem (constrói só com `tsc`); mais portões sobre cópia aumentam manutenção; consumir CSS direto contradiz a razão declarada do console (política de segurança de conteúdo sem `@import`).
8. Orientação e layout de tablet dos apps.
   - Pergunta: o app do agente e o do cidadão ficam travados em retrato?
   - Por que importa: acessibilidade motora (aparelho fixo) e tablets (o campo declara `supportsTablet: true`).
   - O que bloqueia: A11-26, UXD-35.
   - Alternativas: manter retrato; liberar rotação nos dois; liberar só no cidadão.
   - Riscos: liberar exige revisar todos os layouts; travar pode excluir usuários de suporte horizontal.
9. Política de toque, contraste e fonte para o cidadão.
   - Pergunta: alvo de toque de 44, 48 ou 52; fonte mínima e teto de ampliação; contraste acima de 4,5 sob sol?
   - Por que importa: o 52 do agente é razão de campo (luva, chuva), o do cidadão é outro cenário.
   - O que bloqueia: tokens próprios do cidadão e o portão correspondente.
   - Alternativas: herdar 52 e 14; adotar 48; fixar por norma.
   - Riscos: herdar pode deixar telas pesadas para o cidadão; reduzir sem critério repete o botão de 32 pontos que o portão do campo já pegou.
10. Texto de "sessão encerrada" do app do agente.
    - Pergunta: a frase deve mandar "Sair da conta" ou "Entrar de novo", e o teste acompanha?
    - Por que importa: o código comenta que "Sair da conta" apaga a vistoria começada; o teste ainda espera o texto antigo (seção 1.6).
    - O que bloqueia: UXD-49, a suíte do campo.
    - Alternativas: manter o texto novo e atualizar o teste; voltar ao antigo; unificar com decisão sobre o que "Sair" apaga.
    - Riscos: manter o novo sem teste ou com teste errado deixa o portão sem valor; voltar ao antigo reintroduz o risco de perda que o comentário descreve.
11. Quais exigências legais se aplicam a cada superfície.
    - Pergunta: LBI art. 63 e eMAG alcançam painel, portal, app do agente, app do cidadão e console?
    - Por que importa: define prioridade e nível de prova.
    - O que bloqueia: A11-37 e o nível alvo.
    - Alternativas: parecer jurídico por superfície; adotar o mais exigente em todas.
    - Riscos: sem parecer, cumprir de menos expõe, cumprir de mais custa prazo; eu não emito parecer jurídico.
12. Padrão de confirmação passageira (toast) e de erro inesperado para V2.
    - Pergunta: a V2 padroniza um componente de confirmação passageira e uma tela de falha de renderização nas cinco superfícies?
    - Por que importa: UXD-26 e UXD-27, UXD-28; hoje cada superfície resolve de um jeito ou não resolve.
    - O que bloqueia: catálogo de componentes compartilhados.
    - Alternativas: padronizar; deixar por superfície.
    - Riscos: padronizar custa uma rodada de desenho; deixar perpetua três respostas diferentes.

## Riscos arquiteturais

- Design system sem fonte única em package: tokens em CSS no painel, em TS no campo e numa string no console; a paridade só está garantida entre painel e campo. A V2 multiplica por cinco sem decisão.
- Os portões são varreduras de texto com heurísticas de janela (4 linhas de exceção, 12 linhas de junção de tag, regex de expressão). Provaram valor (muitos defeitos reais achados), e já produziram um falso positivo vermelho. Uma superfície nova fora das pastas varridas não é protegida.
- Acessibilidade é avaliada sobre tokens e código, nunca sobre o que o usuário percebe. Não há navegador com leitor, nem aparelho. Com o app do cidadão, essa distância vira risco legal e reputacional.
- Três implementações independentes de modal, confirmação e padrão de formulário; o mesmo acordo de UX é reescrito e retestado em cada uma.
- O console é uma SPA de strings sem build; não compartilha componentes nem consome package de tokens sem mudar a arquitetura dele.
- O app de campo está fora do workspace raiz, com lockfile próprio e links `file:`; qualquer package novo consumido por RN precisa do mesmo ajuste de Metro e de instalação.
- Componentes RN do agente amarram tema a SQLite e a fila; reuso pelo cidadão sem portas repete acoplamento de dados dentro de UI.
- Páginas gigantes (`Ocorrencia.tsx` 2468 linhas, `vistoria/[id].tsx` 3748 linhas) concentram formulários que o portal e o cidadão precisariam reaproveitar por padrão e não por cópia.
- Documentos oficiais são gerados por navegador headless sem PDF etiquetado; acessibilidade do produto final entregue ao cidadão depende de decisão e de ajuste.

## Dívidas técnicas

- `Estrutura.tsx:132` `borderRadius: "8px"` literal (portão de design vermelho) e `Modal.tsx:254` com exceção fora da janela do portão (portão de acessibilidade vermelho).
- 89 `style={{` no painel; `Modal.tsx` e `Toast.tsx` com estilo inline por declaração de que `app.css` era de outra frente; `--emblema-*` e `--tracking-*` fora do prefixo `--ds-`; `letter-spacing` literal em quatro regras.
- `app.css:849` usa `--ds-ink-800` (primitiva) na barra inferior móvel; a lateral inteira lê primitivas, por exceção declarada; pares não medidos pelo portão.
- Sem ErrorBoundary no painel e no campo.
- 8 tabelas sem `<caption>`; `NaoEncontrada` sem título.
- Console: tokens copiados sem teste de paridade; foco sem salvaguarda de Alto Contraste; erro em `role="status"`; sem contraste medido.
- Paridade painel e campo sem `bordaControle`, `anelDeFoco`, `accent-graphic`.
- `tokens.css` declara espelhar `design-system/DESIGN_SYSTEM.md` e `_tokens.scss`, que não têm sete tokens; README diz 17 pares, o portão tem 21.
- Campo: um só `accessibilityRole="header"`; escala de fonte sem tratamento; estimador de largura de rótulo fixo; orientação travada.
- Jest do campo: 5 arquivos e 20 casos vermelhos segundo a auditoria anterior (não re-executado por mim), com ao menos um caso (sessão encerrada) defasado por mudança de texto deliberada.
- Três conjuntos de ícones desenhados à mão; três cópias de fontes (duas com portão).
- HTML servido pela API (`rotas/oficios.ts:146-157`) com cores literais fora do design system e dos portões.
- Sem i18n; textos em pt-BR dentro do código.
- PDF sem `tagged: true` (`documentos/pdf.ts:103-105`).
