# Defesa Civil Operacional 360

## Como este repositório está dividido (leia isto primeiro)

Depois da autorização de 21/08/2026, o repositório passou a ter DUAS bases de
código com regras opostas. Antes de tocar em qualquer arquivo, veja em qual
delas ele está:

| Onde | O que é | Regras que valem |
| --- | --- | --- |
| `mockup/` (`index.html`, `app/`, `design-system/`) | Protótipo da Fase 0, descartável, peça de apresentação | Todas as regras deste arquivo, incluindo as proibições de framework, npm e rede |
| `dc360/` | O produto real, autorizado e em construção | `dc360/README.md` e o levantamento técnico. As proibições da Fase 0 NÃO se aplicam ali |

Concretamente: React, TypeScript, npm, Vite, banco de dados, teste automatizado
e etapa de build são PROIBIDOS em `mockup/` e OBRIGATÓRIOS em `dc360/`. Não misture
as duas. O protótipo continua existindo porque ainda é usado para demonstrar, e
continua descartável.

## O que é o protótipo (`mockup/`)
Protótipo navegável em HTML puro, mais documentação de apresentação, para validar o conceito de um sistema de gestão operacional para Defesas Civis municipais: entrada de solicitação, protocolo, triagem, despacho, vistoria de campo offline, evidências, documento técnico, providências e encerramento auditável. O protótipo é peça de venda e instrumento de pesquisa. Será descartado depois: nada aqui é código de produção.

## Escopo permitido no protótipo (Fase 0)
- HTML + CSS + JavaScript puros (vanilla). Poucos arquivos, sem etapa de build.
- Dados falsos (mock) em objetos JS dentro do próprio projeto.
- Deve abrir com duplo clique (file://) em qualquer notebook, sem internet e sem servidor.
- Duas visões: painel do coordenador (desktop) e visão do agente de campo dentro de uma moldura de smartphone desenhada na tela.
- Documentação de apresentação em linguagem humana (docs/APRESENTACAO.md).

## Proibido no protótipo (não negociável)

Estas proibições valem para `mockup/`. Em `dc360/` elas não valem: lá a stack é
exatamente a que o levantamento técnico definiu.
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
A paleta, os temas, as sombras, a tipografia e o movimento estão DEFINIDOS em mockup/design-system/tokens.css e documentados em mockup/design-system/DESIGN_SYSTEM.md, com contraste AA verificado numericamente. Importe tokens.css e use somente variáveis --ds-*. Cor, sombra, raio ou duração hardcoded em componente é bug e reprova no gate de QA. O arquivo mockup/design-system/_tokens.scss é a versão para a fase real do produto: não usar no protótipo.

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

- A cor de destaque deixa de ser laranja e passa a ser violeta. As primitivas `--ds-orange-*` foram renomeadas para `--ds-violet-*` em `mockup/design-system/tokens.css` (e espelhadas em `_tokens.scss`), com os mesmos tokens semânticos (`--ds-accent`, `--ds-accent-hover`, `--ds-accent-graphic`, `--ds-focus-ring`) apontando para as novas primitivas. Contraste AA reverificado e documentado em comentário no próprio `tokens.css`. Continua proibido inventar cor fora dessas primitivas.
- `mockup/design-system/tokens.css` deixa de ser somente local: seu topo agora tem um único `@import` do Google Fonts (Work Sans e Roboto Mono). Essa é a ÚNICA chamada de rede permitida no protótipo inteiro. Continua proibido qualquer outro `fetch`, `XMLHttpRequest`, CDN de script, imagem remota ou qualquer outro recurso de rede. Se a demo rodar sem internet, a fonte cai no fallback do sistema definido no próprio token (`-apple-system, "Segoe UI", ...`), então o protótipo continua abrindo e funcionando offline, só sem a fonte bonita.
- `mockup/design-system/_tokens.scss` pode ser tocado para espelhar a paleta violeta (deixou de ser "intocado"), mas continua sendo a versão de referência para a fase real, não para uso direto no protótipo.
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

## O produto real (`dc360/`)

Autorizado pelo Rafa em 21/08/2026. A stack não é escolha em aberto: está fixada
em `docs/referencia/LEVANTAMENTO_TECNICO_JURIDICO_GOVTECH.md` seção 4.2, e o
dossiê de viabilidade a confirmou. React com Vite e TypeScript no painel web,
React Native com Expo no aplicativo de campo, PostgreSQL com PostGIS, esquemas
Zod compartilhados entre as pontas, monorepo com pacote comum.

Regras que valem lá e não são negociáveis:

- **Isolamento entre municípios é a regra número um.** Banco único, coluna
  `organizacao_id`, RLS ativada E FORÇADA em toda tabela de negócio, papel de
  aplicação que não é superusuário nem dono das tabelas. A organização vem
  sempre do token já verificado, via `SET LOCAL`, nunca de parâmetro de
  requisição. O teste `dc360/db/test/isolamento.test.ts` (critério CA-06) é o
  portão: se ele quebrar, nada entra.
- **A trilha de auditoria é append-only no banco**, por ausência de policy de
  UPDATE e DELETE. Correção entra como evento novo. Nem a aplicação reescreve
  histórico.
- **Registro não se apaga, se encerra com motivo.** Vale para ocorrência, e
  usuário e equipe se desativam em vez de sumir, porque assinam laudo e
  aparecem na trilha.
- **Regra de negócio mora no banco e no pacote compartilhado**, não na tela. Se
  a validação só existe no formulário, ela não existe.
- **Régua de segurança:** OWASP ASVS 4.0 nível 2 como alvo, CIS Controls v8 IG1
  como piso. Dependência com vulnerabilidade conhecida em runtime é bug, não
  pendência: `npm audit` precisa fechar em zero.
- **Na API, a organização vem do token verificado e de mais lugar nenhum.**
  Nunca de cabeçalho, de parâmetro de rota ou do corpo da requisição. Recurso
  de outro município responde 404, nunca 403: 403 confirmaria que existe.
- **Toda escrita passa por `exigirPermissao` antes de tocar no banco.**
  Esconder o botão na tela não é controle de acesso.
- Idioma, taxonomia COBRADE, proibição de travessão e proibição de inventar
  norma continuam valendo igual, lá e aqui.

Ver `dc360/README.md` para como rodar e testar.

## Retomada do Roadmap V2 (ler ANTES de agir em qualquer assunto da V2)

O plano de execução da V2 está em `docs/ROADMAP-V2.md` e `docs/roadmap-v2/`. O estado
vivo (onde estamos, o que está concluído, o que falta, ponto de parada) está
SOMENTE em `docs/roadmap-v2/STATUS.md`. O histórico do chat não é confiável: em
toda conversa nova, leia o STATUS primeiro, confira `git log` e `git status`, e
só então aja. Pedido típico: "Execute V2-Fnn-Enn". O protocolo está em
`docs/roadmap-v2/00-README.md`: conferir o gate anterior e os checkpoints,
implementar só o escopo da etapa, rodar os testes, arquivar a evidência, atualizar
o STATUS, fazer um commit `V2-Fnn-Enn: resumo` depois da aprovação, e PARAR.
Nunca marque uma etapa como concluída sem evidência e sem ter rodado os testes.

REGRA DE EXECUÇÃO de 2026-10-05: o Rafael mandou continuar sem parar entre etapas da V2, só parando se os tokens acabarem. O "PARAR" do protocolo deixa de valer; validação humana que não dá para fazer sozinho fica registrada como pendente no STATUS e não bloqueia a etapa seguinte. Commit continua só com autorização dele.

Regras INEGOCIÁVEIS do Rafael (2026-10-02), valem para toda etapa da V2:
1. Só se avança para a próxima etapa com PROVA arquivada: saída dos testes E2E e,
   em etapa de interface, capturas de tela reais (ou foto do aparelho) mostrando
   que o que foi pedido está satisfeito.
2. A interface tem de estar perfeitamente alinhada e bem escrita: nenhum card
   desalinhado ou grudado, nenhum texto fora do lugar, cortado ou mal escrito.
   O portão visual está em `docs/roadmap-v2/19-definicao-de-pronto.md`, seção 0.
