# Roadmap da Fase 0: protótipo conceitual Defesa Civil Operacional 360

Este arquivo é o plano de execução da Fase 0. Ele é lido pelo humano que aprova cada etapa e pelos agentes `revisor-qa` e `revisor-ux`, que conferem os critérios de aceite do checkpoint em andamento. Ele complementa o `CLAUDE.md` (regras) e o `docs/CONTEXTO.md` (produto). Em caso de conflito, o `CLAUDE.md` prevalece.

**Objetivo da Fase 0:** um protótipo navegável em HTML puro que abre com duplo clique, sem internet, e que faça um coordenador de Defesa Civil reconhecer o próprio fluxo de trabalho em menos de dez minutos de demonstração.

**Estado atual:** nenhuma linha de protótipo escrita. Existem apenas as regras, o contexto de produto, o design system verificado e os dois agentes revisores.

## Como este roadmap é executado

1. Um checkpoint por vez, na ordem. Nada de trabalhar em dois ao mesmo tempo.
2. Ao concluir o checkpoint: invocar `revisor-qa`, depois `revisor-ux`, corrigir o que for crítico e PARAR.
3. Apresentar ao humano: o que foi feito, como testar passo a passo, resultado dos dois revisores e pendências conhecidas.
4. Só avançar após aprovação humana explícita. Depois da aprovação, commit com a mensagem `CPx: resumo do que foi entregue`.
5. Nada é declarado testado sem ter sido testado. Limitação é listada abertamente.

## Numeração em relação ao plano original

O plano original tinha 8 checkpoints. Este roadmap tem 9: o antigo CP4 foi dividido em dois, porque o simulador de offline é o clímax da demo e merece um gate de QA e de UX só dele.

| Original | Aqui | Diferença |
| --- | --- | --- |
| CP1 | CP1 | mais seletor de perfil, git e faxina do repositório |
| CP2 | CP2 | igual |
| CP3 | CP3 | igual |
| CP4 | CP4 e CP5 | dividido: vistoria de campo, depois offline |
| CP5 | CP6 | mais o termo de interdição parcial |
| CP6 | CP7 | mais a tela de visão futura |
| CP7 | CP8 | igual |
| CP8 | CP9 | igual |

Quatro itens exigidos pelo `docs/CONTEXTO.md` que não estavam na lista original entram aqui em checkpoints nomeados: assinatura da moradora (CP4), termo de interdição parcial (CP6), seletor de perfil visível (CP1) e tela de visão futura (CP7).

## Decisão adicional de escopo (2026-08-20)

Depois de ver o CP1 (só esqueleto, como o próprio checkpoint previa), o Rafa pediu mais dados, mais capricho visual e uma camada administrativa, alinhada ao documento de especificação técnica do Alyson (`docs/referencia/Defesa_Civil_Operacional_360_Especificacao_Tecnica_Preliminar.docx`, transcrito também em `docs/referencia/ESPECIFICACAO_TECNICA_PRELIMINAR.md`). Duas decisões, confirmadas com ele:

1. **"Criar um banco de dados" significa enriquecer `app/dados.js`**, não montar um backend real. Continua zero rede, zero servidor, `file://`: essa regra do `CLAUDE.md` é não negociável nesta fase. O que muda é o tamanho e a riqueza do objeto mock: mais ocorrências, histórico, providências, documentos e equipes, todos estáticos.
2. **Camada administrativa leve, escolhida entre três opções**: três telas dentro do perfil coordenador (Configurações da organização, Perfil do usuário logado, Usuários e equipes), sem CRUD real, só para mostrar que o produto é multiusuário e configurável. Não é cobertura ampla de todos os requisitos do documento do Alyson: o fio condutor de uma ocorrência ainda é o centro da demo de 10 minutos. Essas três telas entram como entregável adicional do CP2, abaixo.

---

## Decisão adicional de direção visual (2026-08-20, terceira rodada)

O Rafa pediu redesenho visual do protótipo inteiro (não só o mapa), com mais impacto, mais animação e mais presença do laranja de marca. Isso afrouxa a regra de movimento do `CLAUDE.md` (seção "Direção visual"), documentado lá em detalhe: durações maiores derivadas de `calc()` sobre tokens, elevação mais livre para elementos de destaque, gradiente permitido entre dois tokens `--ds-*`. Continua proibido qualquer valor fora de `--ds-*`, e `design-system/tokens.css` continua intocado. Vale para todas as telas já entregues (CP1-CP4) e para o mapa, que está sendo reconstruído com aparência de mapa de navegação de verdade (pinos em gota, ruas com acostamento, zoom).

## Decisão adicional de direção visual (2026-08-20, quarta rodada: cabeçalho e capricho pontual)

Depois de comparar o protótipo com mockups feitos no Claude Design e com outros projetos do Rafa, três ajustes concretos, sem mudar nenhuma regra do `CLAUDE.md` além do que a terceira rodada já havia afrouxado:

1. **Terceira exceção de tema declarada: `.cabecalho` é sempre escuro nos dois temas** (como um console fixo acima do conteúdo, mesma lógica de `.folha` e `.palco-campo`/`.moldura-celular`). Lê `--ds-ink-*`/`--ds-violet-*` direto, nunca as semânticas. Documentado aqui e em comentário no próprio `app/estilos.css`.
2. **Sombra com tingimento de marca em elementos de destaque pontuais**: usar `color-mix(in srgb, var(--ds-*) X%, transparent)` para compor um brilho/pulso a partir de um token semântico já existente (ex.: o indicador de ocorrências críticas), na mesma lógica já permitida para gradientes na terceira rodada (deriva de tokens, nunca cor inventada). `design-system/tokens.css` continua intocado.
3. **Mapa esquemático**: pinos menores e reagrupamento por proximidade (não só coordenada idêntica) para parar de se sobrepor visualmente; prédios com um leve degradê de dois tons (mesmos tokens de superfície) em vez de bloco chapado; sombra do pino movida do grupo inteiro para cada pino individualmente.
4. **"Usuários e equipes" ganhou interação**: linhas da tabela e o nome da equipe abrem um modal de detalhe (colaborador ou equipe), primeiro uso do token `--ds-z-modal` que já existia em `tokens.css` sem consumidor. Novo componente `.sobreposicao-modal`/`.modal`, com fechamento por Esc, clique fora e botão fechar, seguindo o mesmo padrão de popover já usado no menu da demonstração. Ganhou também um cadastro fake ("Novo colaborador"): formulário no mesmo modal, some da fila de mocks congelados (`window.DC360_DADOS_INICIAIS`) para uma cópia mutável em `estado.usuarios`/`estado.equipes` (o mesmo padrão que `estado.ocorrencias` já usava), sem back-end, restaurado pelo "Reiniciar demonstração".

## Decisão adicional de direção visual (2026-08-20, quinta rodada: mapa reconstruído)

O mapa em SVG (pinos em gota, prédios em retângulo) continuou "feio" mesmo depois dos ajustes da quarta rodada, na avaliação direta do Rafa. Reconstruído do zero como divs com CSS, na mesma técnica do mockup do Claude Design aprovado: manchas de terreno borradas (`filter: blur()`), pinos como círculos com brilho via `box-shadow` (cor derivada de `color-mix()` sobre os tokens de severidade), sem prédios literais. O mapa vira a quinta exceção de tema declarada (sempre escuro, junto de `.folha`, `.palco-campo`/`.moldura-celular` e `.cabecalho`), documentada em comentário no `estilos.css`. A lista de tarefas do agente de campo também ganhou mais densidade visual (selo de severidade, endereço com ícone, vulnerabilidade, equipe, destaque na tarefa mais urgente), mesma técnica de card já usada no painel do coordenador.

## Decisão adicional de estrutura (2026-08-20, segunda rodada)

Depois de ver o CP2 ampliado, o Rafa pediu que a identidade visual da Fase 0 já seja a semente do produto real (não muda o `CLAUDE.md`: continua sem código de produção, só reforça que a linguagem visual dos tokens deve se manter) e três mudanças concretas:

1. **Mapa entregue adiantado.** O mapa esquemático (SVG, pinos por severidade, filtro por tipo e status, painel lateral, clique abre detalhe) foi construído durante esta rodada, antecipando o que o CP7 previa. O CP7, abaixo, tem esse item já riscado.
2. **Perfil virou avatar fixo no cabeçalho**, não mais item de menu. Vale para coordenador e operador; fica oculto no perfil de agente de campo (imersivo, sem menu superior).
3. **CP3 e CP4 passam a ser executados e revisados juntos**, como uma fatia vertical única, porque o Rafa quer que os três papéis (coordenador, operador, agente de campo) tenham função real na demonstração antes de continuar, não só o coordenador. A divisão de papéis é exatamente a do `docs/CONTEXTO.md`, sem mudança: operador registra e faz a triagem; coordenador despacha para a equipe com prazo (a ação de despachar sai do menu do operador e passa a viver no detalhe da ocorrência, no perfil coordenador); agente de campo recebe a tarefa, faz a vistoria e é quem "recebe a missão e relata". A persistência continua em memória, no mesmo padrão de hoje (nada de `sessionStorage`); "Reiniciar demo" continua restaurando tudo. O simulador de offline continua sendo o CP5, sozinho, por ser o clímax da demo.

Critérios de aceite, gates de QA e UX de CP3 e CP4 abaixo continuam valendo cada um por si; a diferença é que os dois são concluídos e revisados na mesma rodada, não em duas aprovações separadas.

---

## Decisões técnicas fixadas no CP1

Estas decisões valem para todos os checkpoints. Os revisores devem tratá-las como lei, não como defeito.

### Arquitetura de arquivos

```
index.html                  shell único, todas as telas como <section>
app/estilos.css             componentes, somente variáveis --ds-*
app/dados.js                mocks, objeto único
app/app.js                  estado, navegação, tema, comportamento das telas
design-system/tokens.css    já existe, nunca editado pelo protótipo
```

Se `app/app.js` passar de cerca de 800 linhas, ele é dividido por área de tela, mantendo a regra de poucos arquivos e de scripts clássicos.

### Página única, não várias páginas HTML

A fila de sincronização offline, o tema e o estado da ocorrência precisam sobreviver à troca de telas. Recarregar página em `file://` zera tudo e mata o clímax da demo. Por isso: um `index.html`, telas como `<section>` mostradas e escondidas por JavaScript, com pilha de navegação própria para o botão "Voltar" da interface.

### Scripts clássicos, nunca módulos ES

`<script src="app/dados.js" defer>` e `<script src="app/app.js" defer>`, nesta ordem. Módulos ES (`type="module"`) são bloqueados por CORS em `file://` e quebrariam a regra do duplo clique.

### Estado em memória

Todo o estado da demo vive em memória, em um objeto único. O botão "Reiniciar demo" restaura os mocks originais sem recarregar a página. Só a preferência de tema usa `localStorage`, dentro de `try/catch`, com fallback para `prefers-color-scheme`.

### Zero arquivo externo de qualquer natureza

Sem `fetch`, sem `XMLHttpRequest`, sem CDN, sem fonte externa, sem PNG, sem JPEG. Ícones, brasão, fotos simuladas, mapa e QR são SVG inline, coloridos com `currentColor` ou `fill="var(--ds-*)"`.

### Exceção declarada de tema para documentos

As telas de documento (relatório de vistoria e termo de interdição) mantêm folha clara nos dois temas, porque documento é documento. Isso é feito remapeando tokens semânticos dentro do escopo `.folha` (por exemplo `--ds-surface: var(--ds-white)` e `--ds-text: var(--ds-ink-900)`), nunca com valor hardcoded. O gate de UX não deve tratar isso como defeito.

### Exceção declarada de primitivas no palco e na moldura de celular

O palco escurecido atrás da moldura de celular (`.palco-campo`) e o chassi do aparelho (`.moldura-celular`, `.moldura-celular__notch`) leem `--ds-ink-950` e `--ds-ink-900` diretamente, em vez de tokens semânticos. Motivo: são cenário de demonstração e chassi físico de aparelho, não superfície de aplicativo, então não devem clarear no tema claro. É a mesma lógica da exceção da folha de documento, aplicada ao inverso (aqui o elemento fica sempre escuro, lá sempre claro). O gate de UX não deve tratar isso como defeito.

Mesma lógica se aplica ao fundo do `body.modo-mobile-forcado` (menu da demonstração, pré-visualização em largura de celular para as telas de coordenador e operador): é palco de pré-visualização, não superfície de app, então também lê `--ds-ink-950` direto.

### Marca d'água obrigatória nos documentos

Todo documento gerado exibe "PROTÓTIPO, DADOS FICTÍCIOS" de forma discreta e sempre visível, inclusive na impressão. Documento com aparência oficial e dados inventados não circula sem essa marca.

### Navegador alvo

Chrome e Edge atuais. Firefox verificado no CP9.

### Dados mock canônicos

Definidos no CP1 e nunca contraditos depois (os 14 registros originais permanecem intactos): município fictício, brasão genérico em SVG, formato de protocolo `000482/2026`, e a ocorrência protagonista da demo (rachadura em encosta após chuva forte, com moradora idosa no imóvel) como registro âncora citado por todas as telas. Nomes, endereços e coordenadas são fictícios e verossímeis. Nunca dados reais de pessoas.

Ampliados no CP2 (decisão de 2026-08-20, só adição, nenhum dos 14 originais mudou): base foi de 14 para 18 ocorrências, mais o elenco completo de usuários (`app/dados.js: usuarios`), status de disponibilidade por equipe e prazos padrão por severidade (`prazosPadraoHoras`). Contagem canônica atual: 1 crítica, 3 atrasadas (regra: status em registrada/triagem/em_campo com prazo vencido; vistoria concluída e providência pendente têm prazo próprio, não contam como atrasada de fila), 3 encerradas, 1 rascunho.

### Checagem mecânica de proibições

Roda no gate de QA de todo checkpoint:

- `http://`, `https://`, `fetch(`, `XMLHttpRequest`, `type="module"`, `cdn`
- travessão em qualquer arquivo do projeto
- hexadecimal de cor, `box-shadow` e duração em `ms` fora de `design-system/tokens.css`
- `outline: none` sem substituto de foco

---

## CP1: esqueleto, tokens e navegação

**Objetivo:** montar o casco do protótipo com tema claro e escuro completos, navegação entre telas e a base de dados mock que todas as telas seguintes vão consumir.

**Entregáveis**

- `index.html`, `app/estilos.css`, `app/dados.js`, `app/app.js`.
- Cabeçalho fixo com marca, seletor de perfil (coordenador, operador, agente de campo), alternância de tema visível e botão "Reiniciar demo".
- Biblioteca de componentes base no CSS: botão (primário, secundário, perigo), selo de severidade, selo de status, card, campo de formulário, tabela, linha do tempo, estado vazio, ícones SVG inline.
- Telas esqueleto de todas as etapas seguintes, cada uma com estado vazio orientado (diz o que virá e como chegar lá).
- Base mock canônica em `app/dados.js`.
- Repositório git inicializado; `CONTEXTO.md` da raiz removido (é cópia antiga do agente revisor-qa; o contexto válido é `docs/CONTEXTO.md`).

**Critérios de aceite**

- Ao abrir `index.html` com duplo clique, sem internet, a interface carrega completa e o console fica sem erro nem aviso.
- Ao clicar na alternância de tema, todas as telas mudam juntas, e a escolha continua valendo ao fechar e reabrir o arquivo.
- Ao abrir com o sistema em modo escuro e sem escolha salva, o protótipo já inicia escuro.
- Ao trocar de perfil no topo, o menu de telas muda para o conjunto daquele papel e a tela atual reflete o papel escolhido.
- Ao navegar por Tab, o foco é sempre visível e segue a ordem lógica; ao apertar Enter em um item de menu, a tela troca e o foco vai para o título dela.
- Ao clicar em "Reiniciar demo", o estado volta ao inicial sem recarregar a página.
- Ao procurar cor, sombra, raio ou duração hardcoded em `app/estilos.css`, não existe nenhuma ocorrência fora de `var(--ds-*)`.
- Ao entrar em qualquer tela esqueleto, existe um estado vazio que orienta a próxima ação, nunca uma tela em branco.

**Gate de QA (revisor-qa)**

Abertura em `file://` sem rede; console limpo; checagem mecânica de proibições completa; nenhum caminho morto no menu de nenhum perfil; voltar funcionando; ausência de travessão; português do Brasil em tudo; `prefers-reduced-motion` tratado; nenhum framework ou biblioteca.

**Gate de UX (revisor-ux)**

Dimensões 1, 2, 3, 4 e 6 com rigor total: cores lendo tokens semânticos, escala de espaçamento sem valor fora de 4, 8, 12, 16, 24, 32, 48 e 64, hierarquia de elevação e0 a e3 respeitada, papéis tipográficos corretos, movimento apenas com tokens de duração e easing. Mais: teste do squint no layout base, foco visível em todo interativo, dois temas sem elemento ilegível.

**Fora deste checkpoint**

Qualquer conteúdo real de tela: fila de ocorrências, formulários funcionais, mapa, documentos e simulador de offline.

---

## CP2: painel do coordenador

**Objetivo:** entregar a tela que abre a demo, onde o coordenador vê a fila do dia com prioridade, prazo e o que já estourou.

**Entregáveis**

- Tela do painel com faixa de indicadores: total do dia, em campo, atrasadas, críticas.
- Fila de ocorrências em tabela densa: selo de severidade, tipo COBRADE, endereço, equipe, prazo, status.
- Ordenação por prioridade e por prazo.
- Filtro rápido por status.
- Estado vazio do filtro sem resultado.
- Tela de detalhe da ocorrência (cabeçalho com protocolo, dados, status atual).
- Base mock (`app/dados.js`) enriquecida: mais ocorrências e histórico, providências, equipes com status de disponibilidade, para o painel parecer uma operação de verdade acontecendo, não uma lista de exemplo.
- Camada administrativa leve (decisão de 2026-08-20), dentro do perfil coordenador: tela de Configurações da organização (tipos de ocorrência, prazos padrão por severidade, equipes cadastradas), tela de Perfil do usuário logado, tela de Usuários e equipes (lista de pessoas e papéis). Sem operação de criar, editar ou excluir de verdade.

**Critérios de aceite**

- Ao carregar o painel, os contadores sobem de zero até o valor final em no máximo 300 ms e batem exatamente com a contagem da fila.
- Ao existir ocorrência com prazo vencido, ela aparece no topo com selo de atraso em ícone mais texto, e o contador de atrasadas mostra o mesmo número.
- Ao ordenar por prazo, a ocorrência mais próxima do vencimento vai para a primeira linha, e nenhum registro some da lista.
- Ao filtrar por um status sem registro, aparece estado vazio que diz o que fazer, nunca apenas "nada por aqui".
- Ao clicar em uma linha da fila, abre o detalhe daquela ocorrência com o mesmo protocolo mostrado na lista.
- Ao usar mouse e teclado, toda linha e todo controle têm repouso, hover, pressionado, foco visível e desabilitado.
- Ao olhar o painel de longe, atrasadas e críticas são a primeira coisa que se enxerga.
- Ao abrir Configurações, os tipos de ocorrência, prazos e equipes mostrados são os mesmos usados no resto do protótipo, nunca uma lista solta e diferente.
- Ao abrir Perfil, os dados batem com o usuário do perfil coordenador definido em `app/dados.js`.
- Ao abrir Usuários e equipes, a equipe e o responsável de cada ocorrência da fila aparecem também aqui, com o mesmo nome.

**Gate de QA**

Coerência numérica entre contadores, filtros e fila; nenhuma ordenação que perca registro; protocolo idêntico entre lista e detalhe; tipos COBRADE com nomes reais; coerência entre Configurações/Perfil/Usuários e o resto do protótipo; console limpo; checagem mecânica.

**Gate de UX**

Dimensão 1 com atenção especial: laranja é identidade, nunca severidade; selo de prioridade em laranja é defeito crítico. Dimensão 5: selos idênticos em toda parte, sempre com ícone. Dimensão 10: atrasados e críticos saltando aos olhos primeiro. Mais: legibilidade da tabela em projetor, sem cinza claro sobre branco em informação importante; as três telas administrativas com o mesmo padrão visual do painel, não uma sub-seção esquecida.

**Fora deste checkpoint**

Abertura e triagem de ocorrência, mapa, documentos, visão de campo. Qualquer operação real de criar, editar ou excluir usuário, equipe ou configuração.

---

## CP3: abertura, duplicidade, triagem e despacho

**Objetivo:** mostrar a entrada do chamado até o despacho para a equipe, com o aviso de possível duplicidade como momento de impacto.

**Entregáveis**

- Formulário de abertura (perfil operador): solicitante, canal de entrada, endereço, descrição, tipo COBRADE.
- Painel de possível duplicidade comparando com o chamado anterior do mesmo endereço, com as opções de vincular ou seguir como novo registro.
- Tela de triagem (perfil operador): tipo COBRADE, gravidade, vulnerabilidade presente.
- Despacho (perfil coordenador, a partir do detalhe da ocorrência): escolha de equipe e prazo, disponível quando a ocorrência está registrada ou triada sem equipe.
- Confirmação com o protocolo gerado.

**Critérios de aceite**

- Ao digitar o endereço da ocorrência protagonista, aparece o aviso de possível duplicidade com protocolo, data e resumo do chamado anterior, e as duas opções de decisão.
- Ao escolher vincular, o novo registro mostra o vínculo no cabeçalho e na linha do tempo; ao escolher seguir como novo, o aviso some e o registro segue independente.
- Ao tentar avançar sem preencher campo obrigatório, o avanço é bloqueado, o erro aparece ao lado do campo com ícone mais texto dizendo o que falta, e o foco vai para o primeiro campo com erro.
- Ao concluir a triagem com gravidade alta e vulnerabilidade presente, a ocorrência recebe severidade alta e passa a exibir selo de vulnerabilidade em todas as telas onde aparece.
- Ao despachar para a equipe Alfa com prazo de 24 horas, o painel do coordenador passa a contar essa ocorrência em campo e o prazo aparece na fila.
- Ao concluir o despacho, o protocolo exibido é o mesmo que aparece na fila, no detalhe e, depois, na tarefa do agente.
- Ao voltar em qualquer etapa do fluxo, os dados já digitados continuam preenchidos.

**Gate de QA**

Propagação correta do novo registro para os contadores do CP2; validação bloqueando o avanço de fato, não apenas visualmente; nenhum caminho morto entre as etapas; nomes COBRADE reais e taxonomia não inventada; console limpo; checagem mecânica.

**Gate de UX**

Dimensão 5: rótulo sempre visível (placeholder não é rótulo), erro com ícone mais texto, estados completos em todo interativo. Dimensão 9: o botão diz exatamente o que faz e a confirmação repete o mesmo verbo. Mais: densidade adequada em formulário longo, e o aviso de duplicidade sendo notado sem parecer alarme de erro.

**Fora deste checkpoint**

Execução da vistoria, offline, documentos, mapa.

---

## CP4: visão do agente de campo, sem offline

**Objetivo:** entregar a moldura de celular com a vistoria completa em campo, do recebimento da tarefa à assinatura da moradora.

**Entregáveis**

- Moldura de smartphone desenhada em CSS, com barra de status, dentro de um palco escurecido.
- Lista de tarefas do agente.
- Abertura da tarefa com os dados do despacho.
- Checklist de vistoria com itens obrigatórios e opcionais.
- Captura simulada de foto: cinco fotos em SVG inline, cada uma com legenda, horário e coordenada.
- Leitura de GPS com precisão em metros e estado intermediário de melhora de precisão.
- Campo de assinatura da moradora, com registro do nome de quem assinou.
- Conclusão da vistoria.

**Critérios de aceite**

- Ao entrar no perfil de agente, a tela aparece dentro da moldura de celular, com o restante do palco escurecido, e o conteúdo permanece legível a dois metros de distância.
- Ao abrir a tarefa da ocorrência protagonista, protocolo, endereço, tipo, prazo e equipe batem exatamente com o que o coordenador despachou no CP3.
- Ao marcar itens do checklist, o progresso avança, e o botão de concluir só habilita quando todos os itens obrigatórios estão respondidos.
- Ao tocar em capturar foto, a foto simulada entra na lista com horário e coordenada e o contador de evidências sobe; ao capturar cinco, a lista mostra as cinco.
- Ao acionar o GPS, a precisão exibida melhora em etapas até estabilizar, com o valor em metros sempre visível em texto, nunca só em ícone.
- Ao assinar no campo de assinatura, o traço aparece e o nome de quem assinou fica registrado abaixo dele.
- Ao medir qualquer alvo tocável dentro da moldura, ele tem no mínimo 44 por 44 px.
- Ao concluir a vistoria, o painel do coordenador reflete a conclusão.

**Gate de QA**

Coerência total com os dados do CP3; nenhum botão sem destino dentro da moldura; voltar funcionando em todos os passos do fluxo de campo; contador de evidências correto; console limpo; checagem mecânica.

**Gate de UX**

Dimensão 8 inteira: safe area respeitada, ação primária no terço inferior (zona do polegar), nenhum controle sobrepondo conteúdo, moldura convincente como aplicativo real. Dimensão 4: `body-lg` na leitura de campo. Dimensão 7: alvo de 44 px, contraste nos usos reais, nada essencial abaixo de `body-sm`, nenhum estado só por cor.

**Fora deste checkpoint**

Perda de sinal, fila de sincronização, geração de documento.

---

## Decisão de 2026-08-21: shell de admin, conectividade real e estatísticas navegáveis

Rodada de feedback direto do Rafa sobre a apresentação. Mudanças estruturais que valem para todas as telas já entregues:

- **Shell de administração**: a navegação saiu do cabeçalho e virou uma barra lateral escura (`.barra-lateral`), agrupada por seção (Operação, Administração, Produto), recolhível e com o estado persistido em `localStorage`. O cabeçalho passou a concentrar busca global (com atalho Ctrl+K), relógio, notificações, avatar e ações rápidas, separados por divisores visuais.
- **Menu da demo removido**: o dropdown de engenharia (`.menu-dev`, com "Ver em modo mobile") foi eliminado, junto com toda a CSS de `body.modo-mobile-forcado`. Motivo: o botão de engrenagem era visualmente confundido com o alternador de tema, e o layout responsivo real tornou a pré-visualização forçada desnecessária. "Reiniciar demonstração" e "Sair" viraram ícones diretos no cabeçalho.
- **Ícone de marca**: o escudo arredondado foi substituído por `icone-marca` (círculo com triângulo, inspirado no símbolo internacional de proteção civil), com traço anguloso. Aplicado no cabeçalho, no portal de login e no rodapé.
- **CP5 entregue** (ver seção abaixo): o simulador de offline saiu do papel. Detalhes de implementação registrados no próprio CP5.
- **Estatísticas de campo navegáveis**: os blocos Pendentes/Atrasadas/Concluídas viraram botões que abrem uma subtela filtrada (`estado.campoSubtela === "lista-filtrada"`), reaproveitando o mesmo cartão de tarefa. Pendentes e atrasadas abrem a vistoria; concluídas são somente leitura, com selo distinguindo "Sincronizada" de "Aguardando sincronização".

## CP5: simulador de offline, o clímax da demo

**Objetivo:** entregar o momento que vende o produto, quando o sinal cai, a vistoria continua inteira e a reconexão sincroniza item a item sem perder nem duplicar nada.

**Entregáveis**

- Botão visível de simular perda de sinal e de restaurar sinal.
- Indicador persistente do estado da conexão, na moldura do celular e no painel do coordenador.
- Fila de sincronização com itens entrando um a um, cada um com hora de coleta.
- Animação de sincronização escalonada, com conclusão em verde de sucesso e ícone.
- Registro na linha do tempo de que o item foi coletado offline e sincronizado depois, com as duas marcas de tempo.

**Critérios de aceite**

- Ao simular perda de sinal, o indicador muda em ícone mais texto na moldura e no painel em menos de 300 ms, e nenhuma função de vistoria fica bloqueada.
- Ao executar checklist, fotos, GPS e assinatura sem sinal, cada ação entra na fila de sincronização com hora de coleta, e o contador de pendentes sobe item a item.
- Ao tentar sincronizar sem sinal, o sistema explica que os dados estão guardados no aparelho e serão enviados quando o sinal voltar, sem mensagem de erro genérica e sem pedido de desculpa vago.
- Ao restaurar o sinal, os itens saem da fila em sequência escalonada, cada um passando de pendente para sincronizado, e ao final aparece a confirmação de sucesso com o total sincronizado.
- Ao mandar sincronizar de novo depois de concluído, nada duplica: a fila continua vazia e os contadores permanecem iguais.
- Ao alternar perda e retorno de sinal várias vezes seguidas, a fila continua coerente e nenhum item se perde nem aparece duas vezes.
- Ao voltar ao painel do coordenador depois da sincronização, a ocorrência aparece com a vistoria concluída e o horário correto.
- Ao ativar `prefers-reduced-motion`, a fila esvazia sem animação e o resultado final é idêntico.

**Gate de QA**

Ausência absoluta de duplicação em qualquer ordem de cliques; alternância repetida de sinal sem quebrar a fila; contadores coerentes entre moldura e painel; nenhuma animação bloqueando interação por mais de 300 ms; console limpo; checagem mecânica.

**Gate de UX**

Dimensão 6 com veredito explícito sobre o encanto deste momento e, se não encantar, o que exatamente falta. Mais: apenas tokens de duração e easing, sucesso comunicado por ícone mais texto e nunca só por cor, e nenhuma animação que engasgue em máquina fraca (animar somente `transform` e `opacity`).

**Fora deste checkpoint**

Documentos, mapa, providência e encerramento.

**Como ficou implementado (2026-08-21)**

- Estado novo em `app/app.js`: `estado.conectividade` ("online" | "offline" | "sincronizando"), `estado.filaSincronizacao` e `estado.tokenSincronizacao`. Os três entram em `persistirEstado()`/`carregarEstadoPersistido()` (a fila sobrevive a F5) e são zerados por `reiniciarDemo()`. Um F5 durante a sincronização volta como "offline" com a fila intacta, nunca como "sincronizando".
- Dois componentes, papéis distintos: leitura ambiente na barra de status do celular (`.moldura-celular__conexao`, sempre visível, ícone mais texto) e faixa acionável no conteúdo (`.campo-conectividade`), que concentra o único botão de alternância e a lista da fila.
- A fila é granular: checklist, cada foto, GPS e assinatura entram como itens próprios, além da conclusão. Só o item `tipo: "conclusao"` muda `estado.ocorrencias` ao drenar; os outros quatro são registro visual (a fonte de verdade continua sendo `rascunhoVistoria`), o que elimina risco de estado parcialmente aplicado.
- `concluirVistoria()` foi dividida em `montarRegistroVistoria()` (monta o registro) e `aplicarConclusaoVistoria()` (aplica em `estado.ocorrencias`, idempotente: só age se o status ainda for `em_campo`). A função original virou um roteador: online aplica na hora, offline empilha na fila.
- O dreno é FIFO e cancelável por token de geração (`estado.tokenSincronizacao`): perder sinal no meio incrementa o token, e o `setTimeout` em voo se auto-cancela sem aplicar nada. Itens não drenados permanecem intactos, sem lógica de desfazer. Clicar em sincronizar repetidamente não duplica.
- O re-render pesado (`atualizarTudoAposMudanca()`) roda uma vez ao final do dreno, não item a item.
- Linha do tempo do coordenador: quando `vistoriaConcluidaEm` e `vistoria.sincronizadoEm` diferem, o evento ganha o corpo "Coletada offline às HH:MM, sincronizada às HH:MM", reaproveitando o parâmetro que `eventoLinhaTempo` já aceitava.
- Pendência conhecida: o indicador de conexão existe só na moldura do celular, não no painel do coordenador (os entregáveis pediam nos dois). Narrativamente faz sentido (quem perde sinal é o agente), mas fica registrado como divergência deliberada em relação ao texto original do checkpoint.

---

## Situação dos checkpoints em 21/08/2026

CP1 a CP9 concluídos. O dossiê de viabilidade (relatorio/) recomendou priorizar CP5 e CP6, que foram entregues nesta ordem, seguidos de CP7 restante, CP8 e CP9.

Divergências deliberadas em relação ao texto original dos checkpoints:
- CP5: o indicador de conectividade existe na moldura do celular, não no painel do coordenador.
- CP6: o QR de validação é um padrão geométrico decorativo, não um QR legível (protótipo não valida nada de verdade).

### Correções da rodada final de revisão (CP9)

O revisor de UX e o de QA reprovaram a primeira versão do CP9. O que foi corrigido:

- **Fila de sincronização invisível durante a coleta.** A faixa de conectividade não era renderizada dentro da tela de vistoria, então o agente marcava checklist, foto, GPS e assinatura sem nenhum retorno visual: a fila só aparecia depois, cheia de uma vez. Agora a vistoria mostra uma faixa compacta fixa no topo, com o contador subindo a cada ação, e a lista completa continua na tela de tarefas. A entrada dos itens ganhou `animation-delay` escalonado.
- **Faixa fixa cobria o canvas de assinatura.** Corrigido junto: a variante compacta não renderiza a lista, e `atualizarFaixaConectividadeNaTela` preserva o modificador `--compacta` ao trocar a classe de estado (antes reescrevia `className` inteiro e a lista voltava por cima do formulário).
- **Tamanhos de fonte e espaçamentos fora da escala** em 10 pontos do CSS, inclusive dentro do documento oficial (legenda de foto e aviso legal do rodapé). Todos migrados para `--ds-fs-caption` e `--ds-sp-1`.
- **Indicador "Total na fila" nunca caía**, contrariando critério de aceite do CP7: contava o histórico inteiro. Virou "Na fila", contando só ocorrências ativas.
- **Roteiro de demo com passos irreproduzíveis.** Três falhas encontradas executando o roteiro do começo ao fim com automação: mandava despachar a 000482, que já nasce despachada; não avisava que ao trocar de perfil o sistema volta para a última tela usada; e não avisava que o filtro de status continua ativo e impede a busca de encontrar a ocorrência do documento. Todos corrigidos e o roteiro inteiro revalidado ponta a ponta.
- **Pacote de distribuição desatualizado**, gerado antes das correções. Reempacotado e revalidado com o navegador offline.

---

## CP6: documentos oficiais e linha do tempo auditável

**Objetivo:** entregar os dois documentos pelos quais o servidor público julga o software, e a trilha que prova quem fez o quê e quando.

**Entregáveis**

- Relatório de vistoria com aparência de documento oficial: brasão em SVG, protocolo, identificação do imóvel, checklist respondido, fotos com legenda, autoria e matrícula, data e hora, versão do documento, QR de validação desenhado e marca d'água de protótipo.
- Termo de interdição parcial, com o mesmo cabeçalho e a mesma identidade documental, base normativa citada somente entre as normas permitidas em `docs/CONTEXTO.md`, e assinatura.
- Botão de imprimir com `@media print` correto.
- Linha do tempo auditável da ocorrência: autor, papel, data, hora e origem (campo ou escritório) em cada evento.

**Critérios de aceite**

- Ao abrir o relatório de vistoria, ele preenche a folha com aparência de documento de prefeitura, não de card estilizado, e mantém folha clara nos dois temas.
- Ao conferir o relatório, protocolo, endereço, checklist, número de fotos, autoria e data são exatamente os do CP4 e CP5.
- Ao clicar em imprimir, a pré-visualização mostra a folha limpa, sem menu e sem botões, com a marca d'água preservada.
- Ao abrir o termo de interdição parcial, ele traz o mesmo protocolo do relatório e cita somente normas da lista permitida, sem nenhum número de lei ou artigo inventado.
- Ao abrir a linha do tempo, cada evento tem autor, papel, data e hora, em ordem cronológica, e os eventos coletados offline exibem as duas marcas de tempo (coleta e sincronização).
- Ao gerar novamente o documento depois de qualquer alteração no protótipo, a versão do documento muda e a linha do tempo registra o novo evento.

**Gate de QA**

Conferência item a item entre documento e dados de origem; nenhuma norma fora da lista de `docs/CONTEXTO.md`; nenhum número de lei, artigo ou citação inventado; impressão sem elemento de interface; marca d'água presente também na impressão; console limpo; checagem mecânica.

**Gate de UX**

Dimensão 10: o documento precisa parecer documento oficial de prefeitura. Dimensão 4: hierarquia tipográfica do documento, com um único título de nível 1. Mais: legibilidade em projetor e marca d'água visível sem atrapalhar a leitura.

**Fora deste checkpoint**

Mapa, providência a outra secretaria, encerramento.

---

## CP7: mapa, providência, encerramento e visão futura

**Objetivo:** fechar o ciclo operacional, do mapa da cidade ao encerramento com motivo obrigatório, e insinuar a evolução do produto.

**Já entregue, adiantado durante o feedback do CP2 (ver "Decisão adicional de estrutura" acima):** mapa esquemático da cidade em SVG com pinos por severidade, filtros por tipo COBRADE e por status, painel lateral sincronizado, legenda, clique no pino ou na lista abre o detalhe. Falta rodar o gate de QA/UX formal sobre o mapa, o que acontece junto deste checkpoint.

**Entregáveis restantes**

- Encaminhamento de providência à Secretaria de Obras, com prazo e responsável.
- Acompanhamento da providência no painel do coordenador, com o vencimento visível.
- Encerramento com motivo obrigatório e confirmação.
- Tela única de visão futura (modo emergência e logística humanitária), rotulada como fase futura, sem interação profunda.

**Critérios de aceite**

- Ao filtrar o mapa por tipo, apenas os pinos daquele tipo permanecem, a legenda mostra a contagem correta e o painel lateral lista exatamente os mesmos registros.
- Ao combinar filtro de tipo e de status sem resultado, aparece estado vazio com ação para limpar os filtros.
- Ao clicar em um pino, abre o detalhe da ocorrência correspondente, com o mesmo protocolo do painel.
- Ao encaminhar providência à Secretaria de Obras com prazo, o painel do coordenador passa a exibir a pendência com o vencimento, e a linha do tempo registra o encaminhamento com autor e data.
- Ao tentar encerrar sem informar motivo, o encerramento é bloqueado com mensagem que diz o que falta.
- Ao informar o motivo e confirmar, a ocorrência é encerrada, sai da fila ativa, entra no histórico, e a linha do tempo registra autor, data e motivo.
- Ao voltar ao painel depois do encerramento, os contadores refletem a saída da ocorrência.
- Ao abrir a tela de visão futura, fica claro que aquilo ainda não existe no produto, e nenhum botão dela leva a caminho morto.

**Gate de QA**

Coerência entre mapa, filtros, painel lateral e a fila do CP2; impossibilidade real de encerrar sem motivo; contadores atualizados após o encerramento; nenhum pino sem destino; console limpo; checagem mecânica.

**Gate de UX**

Dimensão 1: cor dos pinos seguindo a escala de severidade, nunca o laranja da marca. Dimensão 5: filtros com a mesma anatomia dos filtros do painel. Dimensão 9: o botão "Encerrar ocorrência" gerando a confirmação "Ocorrência encerrada". Mais: a tela de visão futura não promete o que não existe.

**Fora deste checkpoint**

Mapa interativo real (arrastar, zoom, camadas) e qualquer detalhamento de modo emergência ou logística humanitária.

---

## CP8: documento de apresentação e roteiro de demo

**Objetivo:** escrever o material humano que sustenta a reunião, sem depender de quem estiver operando o protótipo.

**Entregáveis**

- `docs/APRESENTACAO.md`: problema, solução, fluxo tela a tela, diferenciais, o que o produto explicitamente não é, próximos passos.
- `docs/ROTEIRO_DEMO.md`: roteiro cronometrado de 10 minutos, com o minuto de cada tela, a fala de abertura, o momento exato do simulador de offline e as perguntas prováveis com resposta pronta.

**Critérios de aceite**

- Ao ler a apresentação sem ver o protótipo, uma pessoa não técnica entende o problema, a solução e o limite do produto.
- Ao conferir o posicionamento, o documento afirma que o produto não substitui S2ID, Defesa Civil Alerta, Cemaden nem os telefones 190, 192 e 193, e que não é aplicativo de alerta à população.
- Ao conferir as citações, toda norma mencionada está na lista permitida de `docs/CONTEXTO.md`, sem número de lei ou artigo inventado.
- Ao seguir o roteiro de 10 minutos, cada passo corresponde a uma tela que existe de fato no protótipo, na ordem em que a navegação permite.
- Ao somar os tempos do roteiro, o total fica entre 9 e 11 minutos, com o simulador de offline entre o quinto e o sétimo minuto.
- Ao ler a seção de perguntas prováveis, cada resposta se sustenta no que o protótipo mostra ou declara como fase futura, nunca em promessa vaga.

**Gate de QA**

Cada tela citada no roteiro existe e é alcançável na ordem descrita; nenhuma afirmação sobre funcionalidade que o protótipo não tem; sem travessão; português do Brasil.

**Gate de UX**

Dimensão 9: vocabulário do domínio (vistoria, interdição, protocolo, providência, triagem) e zero jargão de programador. Dimensão 10: a história flui de tela em tela sem beco. Mais: a apresentação é legível por um coordenador que nunca viu o sistema.

**Fora deste checkpoint**

Alteração de tela do protótipo, salvo correção de erro factual descoberto ao escrever o roteiro.

---

## CP9: rodada final, empacotamento e plano B

**Objetivo:** revisar o conjunto inteiro, corrigir o que for crítico e entregar um pacote que abra sozinho na pior máquina possível.

**Entregáveis**

- Rodada final completa de `revisor-qa` e `revisor-ux` sobre todo o protótipo, não só sobre o último checkpoint.
- Correção de todos os itens críticos apontados.
- `LEIA-ME.txt` com abertura em 3 passos para leigos.
- `docs/ROTEIRO_VIDEO.md`: roteiro de gravação de 3 a 5 minutos, plano B da demo.
- Zip único de distribuição com `index.html`, `app/`, `design-system/tokens.css`, `LEIA-ME.txt` e os documentos de apresentação.

**Critérios de aceite**

- Ao extrair o zip em uma pasta qualquer e dar duplo clique em `index.html`, o protótipo abre completo, sem internet, sem servidor e sem erro no console.
- Ao seguir apenas os 3 passos do `LEIA-ME.txt`, uma pessoa leiga chega ao painel do coordenador sem ajuda.
- Ao percorrer o roteiro de 10 minutos do começo ao fim, nenhum passo falha e nenhuma tela fica inacessível.
- Ao rodar a checagem mecânica sobre o pacote inteiro, não há nenhuma referência externa, nenhum travessão e nenhum valor fora dos tokens.
- Ao abrir em Chrome, Edge e Firefox, o layout se mantém e o simulador de offline funciona igual nos três.
- Ao alternar o tema em qualquer tela do pacote final, nenhuma tela permanece em um modo só.
- Ao seguir o roteiro de vídeo, ele cobre o mesmo fio condutor em 3 a 5 minutos, com a cena do offline preservada.

**Gate de QA**

Varredura final nos nove critérios do `revisor-qa` sobre todos os arquivos; teste do pacote extraído em pasta nova; verificação nos três navegadores; veredito final de aprovação.

**Gate de UX**

Scorecard das 10 dimensões sobre o conjunto, exigindo zero dimensão em REPROVA e zero item crítico em aberto. Foco especial em consistência entre telas construídas em checkpoints diferentes, que é o defeito mais provável nesta etapa.

**Fora deste checkpoint**

Funcionalidade nova de qualquer espécie. Só correção, empacotamento e documentação.

---

## Riscos e mitigação

1. **Inconsistência entre telas feitas em checkpoints distintos.** Mitigação: os componentes visuais nascem no CP1 e os checkpoints seguintes apenas compõem. Criar variante nova de componente exige justificativa no relatório do checkpoint.
2. **Fila de sincronização duplicando.** É o defeito que mataria a demo no momento mais importante. Mitigação: o CP5 tem critério explícito de sincronizar duas vezes e de alternar o sinal repetidamente conferindo que nada duplica.
3. **Documento com aparência oficial e dados fictícios.** Mitigação: marca d'água obrigatória, dados fictícios verossímeis e nenhuma norma fora da lista permitida.
4. **Crescimento de `app/app.js` além do sustentável.** Mitigação: acima de cerca de 800 linhas, dividir por área de tela, mantendo scripts clássicos e poucos arquivos.
5. **Notebook fraco de prefeitura engasgando na animação.** Mitigação: animar somente `transform` e `opacity`, nenhuma animação acima de 300 ms, nenhuma animação simultânea em lista longa.
6. **Projetor ruim apagando a hierarquia visual.** Mitigação: verificação de legibilidade a distância em todo gate de UX, sem cinza claro sobre branco em informação importante.

## Critério de encerramento da Fase 0

A Fase 0 está concluída quando os nove checkpoints foram aprovados pelo humano, o pacote do CP9 abre com duplo clique em máquina limpa e sem internet, e o material de apresentação está pronto para a primeira reunião. O critério de sucesso do conceito, definido em `docs/CONTEXTO.md`, é medido depois, nas demonstrações: pelo menos três Defesas Civis, reconhecimento do fluxo pelo coordenador sem explicação longa e pelo menos duas manifestações formais de interesse.
