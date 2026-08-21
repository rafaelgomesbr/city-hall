# Defesa Civil Operacional 360 - Fase 0 (protótipo conceitual)

## O que é este repositório
Protótipo navegável em HTML puro, mais documentação de apresentação, para validar o conceito de um sistema de gestão operacional para Defesas Civis municipais: entrada de solicitação, protocolo, triagem, despacho, vistoria de campo offline, evidências, documento técnico, providências e encerramento auditável. O protótipo é peça de venda e instrumento de pesquisa. Será descartado depois: nada aqui é código de produção.

## Escopo permitido (Fase 0)
- HTML + CSS + JavaScript puros (vanilla). Poucos arquivos, sem etapa de build.
- Dados falsos (mock) em objetos JS dentro do próprio projeto.
- Deve abrir com duplo clique (file://) em qualquer notebook, sem internet e sem servidor.
- Duas visões: painel do coordenador (desktop) e visão do agente de campo dentro de uma moldura de smartphone desenhada na tela.
- Documentação de apresentação em linguagem humana (docs/APRESENTACAO.md).

## Proibido nesta fase (não negociável)
- React, Angular, Vue, Tailwind, qualquer framework ou biblioteca externa.
- npm, package.json, bundlers, servidores locais.
- Backend, banco, login real, upload real, chamadas de rede (fetch/XHR) e qualquer recurso vindo de CDN. A demo roda 100% offline.
- Gerar PDF de verdade: o "documento" é uma tela HTML com aparência de documento oficial e botão de imprimir.
- Escrever código pensando em reaproveitar na versão real. Protótipo é descartável por definição.

## Regras de conteúdo
- Idioma: português do Brasil em tudo (interface, comentários, documentos).
- Não usar travessão (—) em nenhum texto. Usar vírgula, dois pontos ou parênteses.
- Tipos de ocorrência com nomes reais da COBRADE (deslizamento, inundação, alagamento, enxurrada, vendaval, granizo, colapso de edificação, incêndio urbano). Não inventar taxonomia própria.
- Terminologia correta do domínio: situação de emergência, estado de calamidade pública, vistoria, interdição, protocolo, providência.
- Nunca inventar número de lei, artigo ou citação. Citar somente as normas listadas em docs/CONTEXTO.md.
- Dados fictícios verossímeis (nomes, endereços e coordenadas de exemplo). Nunca dados reais de pessoas.

## Qualidade mínima (mesmo sendo protótipo)
- Contraste nível AA e área de toque mínima de 44x44 px na visão mobile.
- Navegação por teclado nos fluxos principais.
- Nunca comunicar estado apenas por cor: sempre ícone mais texto.
- Estados vazios simulados onde fizer sentido.
- O simulador de offline precisa funcionar de verdade na demo: botão de simular perda de sinal, fila de sincronização enchendo item a item, reconexão sincronizando sem duplicar.
- Zero erro no console do navegador.

## Direção visual (o protótipo precisa impressionar)
A paleta, os temas, as sombras, a tipografia e o movimento estão DEFINIDOS em design-system/tokens.css e documentados em design-system/DESIGN_SYSTEM.md, com contraste AA verificado numericamente. Importe tokens.css e use somente variáveis --ds-*. Cor, sombra, raio ou duração hardcoded em componente é bug e reprova no gate de QA. O arquivo design-system/_tokens.scss é a versão para a fase real do produto: não usar no protótipo.

A primeira reação de quem assiste à demo deve ser: "isso é muito mais bonito que qualquer sistema público que eu já usei". A estética alvo é produto enterprise polido e sóbrio, com acabamento de aplicativo moderno. Nunca visual de brinquedo, nunca template genérico de dashboard.
- Identidade: violeta como cor de destaque (ver decisão de 2026-08-20 abaixo; era laranja institucional até então), sobre neutros sólidos e profundos. A paleta já está pronta nos tokens: não criar cores novas fora deles. Não usar creme com serifa e terracota, nem fundo preto com verde ácido: são clichês de design gerado por IA.
- Modo claro e modo escuro completos desde o CP1, com alternância visível no topo e aplicada a todas as telas. Nenhuma tela pode existir em um modo só.
- Tipografia: Work Sans (corpo) e Roboto Mono (protocolos, matrículas, números tabulares), carregadas por um único `@import` de fonte no `tokens.css` (ver exceção de rede na decisão de 2026-08-20), com fallback para a pilha do sistema se a fonte não carregar. Hierarquia forte e intencional: números grandes com rótulos discretos no painel, pesos e espaçamentos definidos como tokens.
- Movimento: micro-interações com propósito, em CSS puro (transitions e keyframes), easing suave. Sempre respeitar prefers-reduced-motion.
- O elemento assinatura do protótipo é o simulador de offline: a fila de sincronização enchendo item a item, o retorno do sinal e a sincronização concluindo com feedback visual satisfatório. Concentre o melhor do capricho visual nesse momento; ele é o clímax da demo.
- Proibido, sem exceção: confete, som, parallax e qualquer efeito que engasgue num notebook fraco de prefeitura.

### Decisão de 2026-08-20: direção visual mais ousada

O Rafa pediu explicitamente mais impacto visual no protótipo inteiro, não só sobriedade bem executada. Isso afrouxa (não revoga) a regra acima:

- O teto de 150-300 ms para movimento deixa de ser rígido. Transições de tela, confirmações e o clímax do offline podem durar mais (até por volta de 500 ms), desde que a duração venha de `calc()` sobre um token existente (ex.: `calc(var(--ds-dur-slow) * 1.5)`), nunca de um número solto. Interações rápidas de resposta a toque (hover, clique) continuam curtas.
- Elevação pode ser usada com mais liberdade: cards de destaque (indicadores do painel, momentos de confirmação) podem saltar para `--ds-shadow-2`/`--ds-shadow-3` mesmo fora de dropdown/modal, se isso for deliberado e consistente entre telas.
- Gradiente é permitido quando os dois pontos do gradiente são tokens `--ds-*` já existentes (ex.: `--ds-accent` para `--ds-accent-hover`), nunca cor inventada, e nunca no fundo inteiro da tela: uso pontual, em elementos de destaque.
- Continua proibido: cor, sombra, raio ou duração fora de `--ds-*` (incluindo dentro de gradientes ou `calc()`).

### Decisão de 2026-08-20 (segunda emenda): troca de identidade para violeta e exceção de fonte de rede

O Rafa mandou um HTML de referência (export do canvas do Claude Design) com paleta roxa/violeta e tipografia Work Sans + Roboto Mono via Google Fonts, e pediu explicitamente para o protótipo assumir esse visual, autorizando mexer no design system se necessário. Isso substitui a identidade laranja e abre uma exceção pontual à regra de zero rede:

- A cor de destaque deixa de ser laranja e passa a ser violeta. As primitivas `--ds-orange-*` foram renomeadas para `--ds-violet-*` em `design-system/tokens.css` (e espelhadas em `_tokens.scss`), com os mesmos tokens semânticos (`--ds-accent`, `--ds-accent-hover`, `--ds-accent-graphic`, `--ds-focus-ring`) apontando para as novas primitivas. Contraste AA reverificado e documentado em comentário no próprio `tokens.css`. Continua proibido inventar cor fora dessas primitivas.
- `design-system/tokens.css` deixa de ser somente local: seu topo agora tem um único `@import` do Google Fonts (Work Sans e Roboto Mono). Essa é a ÚNICA chamada de rede permitida no protótipo inteiro. Continua proibido qualquer outro `fetch`, `XMLHttpRequest`, CDN de script, imagem remota ou qualquer outro recurso de rede. Se a demo rodar sem internet, a fonte cai no fallback do sistema definido no próprio token (`-apple-system, "Segoe UI", ...`), então o protótipo continua abrindo e funcionando offline, só sem a fonte bonita.
- `design-system/_tokens.scss` pode ser tocado para espelhar a paleta violeta (deixou de ser "intocado"), mas continua sendo a versão de referência para a fase real, não para uso direto no protótipo.
- Pinos de severidade no mapa, selos de status e cores semânticas (sucesso/perigo/info) NÃO mudam: a regra de "nunca comunicar severidade com a cor de marca" vale igual para violeta.

## Protocolo de trabalho (checkpoints)
1. Trabalhe sempre em checkpoints definidos em docs/ROADMAP_FASE0.md.
2. Ao concluir um checkpoint: invoque o agente revisor-qa, depois o revisor-ux, corrija o que for crítico e então PARE.
3. Apresente ao humano: o que foi feito, como testar passo a passo, resultado dos dois revisores e pendências conhecidas.
4. Só avance para o próximo checkpoint após aprovação humana explícita.
5. Nunca declare algo como testado sem ter testado. Liste limitações abertamente.
6. Se uma instrução conflitar com este arquivo, pergunte antes de agir.
7. Controle de versão: este repositório usa git (inicialize no primeiro checkpoint se ainda não existir). Após a aprovação humana de cada checkpoint, faça um commit com a mensagem "CPx: resumo do que foi entregue". Nunca reescreva histórico já commitado.

## Economia de contexto
- Tarefas pequenas e objetivas. Não reler arquivos inteiros sem necessidade.
- Respostas curtas e diretas, sem recapitular o projeto a cada mensagem.
- Delegue as revisões aos subagentes para manter o contexto principal limpo.
