/**
 * Os mesmos tokens do painel, no formato que o React Native entende.
 *
 * O painel e o aplicativo são o mesmo produto visto de dois lugares, e o
 * agente que abre os dois no mesmo dia precisa reconhecer. Os valores aqui são
 * cópia literal de `apps/web/src/estilos/tokens.css`, e um teste reprova se
 * divergirem: no React Native não existe CSS custom property, então cópia é o
 * único jeito, e cópia sem portão vira divergência em três meses.
 *
 * O que NÃO é cópia, e por quê: o tamanho mínimo de alvo. No painel a régua é
 * 44 px porque é ponteiro de mouse; aqui é dedo, muitas vezes com luva, dentro
 * de um barranco, com o aparelho molhado. A régua sobe para 52.
 */

export const violeta = {
  v300: "#C4B5FD",
  v400: "#A78BFA",
  v500: "#7C3AED",
  v600: "#6D28D9",
  v700: "#5B21B6",
  v800: "#4C1D95",
} as const;

export const tinta = {
  t950: "#101519",
  t900: "#14191D",
  t850: "#171E24",
  t800: "#1E262D",
  t700: "#2A343C",
  t500: "#5A6B76",
  t400: "#9BAAB5",
  t200: "#DDE3E7",
  t100: "#E9EDF1",
  t50: "#F5F7F8",
  branco: "#FFFFFF",
  gelo: "#ECF1F4",
} as const;

export type Tema = {
  /**
   * Qual dos dois temas é este.
   *
   * Não é enfeite nem duplicata do `useColorScheme`: é o que permite a um
   * token DERIVADO decidir sozinho. A elevação é o caso que obrigou a criar
   * este campo. Sombra preta sobre fundo quase preto não aparece, então a
   * escala de elevação precisa de valores diferentes por tema, e quem a
   * calcula recebe o tema e mais nada. Sem esta bandeira, cada componente
   * teria que perguntar de novo ao sistema qual esquema está ativo, e o dia em
   * que um deles esquecesse produziria uma peça sem elevação nenhuma no
   * escuro, defeito que ninguém vê numa captura de tela clara.
   */
  escuro: boolean;
  fundo: string;
  superficie: string;
  superficie2: string;
  borda: string;
  /**
   * A borda do que se INTERAGE, e ela é separada da de cima de propósito.
   *
   * A WCAG 1.4.11 exige 3:1 para o que identifica um componente de interação.
   * Medido no portão de acessibilidade: `borda` sozinha dava 1.30:1 no tema
   * claro e 1.33:1 no escuro sobre o cartão, e é a única coisa dizendo onde um
   * campo começa. Um campo de formulário praticamente invisível é a definição
   * do problema que essa regra existe para impedir.
   *
   * Não bastava escurecer `borda`, porque ela também desenha borda de cartão e
   * separador. Esses são decoração, não controle, e escurecê-los deixaria o
   * aplicativo inteiro pesado sem que a norma peça.
   *
   * Sem cor nova, e com os mesmos degraus que o painel escolheu em
   * `--ds-border-controle`: `t500` no claro, `t400` no escuro. Os dois já eram
   * primitivas, e a paridade entre as duas pontas continua fechando.
   */
  bordaControle: string;
  texto: string;
  textoDiscreto: string;
  destaque: string;
  destaqueEscuro: string;
  sobreDestaque: string;
  /**
   * A cor do anel de foco, que NÃO é `destaque`.
   *
   * No tema claro `destaque` é violeta 700 porque ele é fundo de texto branco
   * e precisa passar em AA; o anel de foco não tem texto em cima, é contorno,
   * e o painel usa violeta 600 nele (`--ds-focus-ring` em `tokens.css`). Usar
   * `destaque` aqui faria o anel do aplicativo divergir do anel do painel sem
   * ninguém perceber, que é exatamente o tipo de deriva que este arquivo
   * existe para impedir.
   */
  anelDeFoco: string;
  okTexto: string; okFundo: string;
  alertaTexto: string; alertaFundo: string;
  perigoTexto: string; perigoFundo: string;
  /* Severidade, mesmas cores do painel. Nunca a cor de marca. */
  sevBaixaTexto: string; sevBaixaFundo: string;
  sevMediaTexto: string; sevMediaFundo: string;
  sevAltaTexto: string; sevAltaFundo: string;
  sevCriticaTexto: string; sevCriticaFundo: string;
};

export const temaClaro: Tema = {
  escuro: false,
  fundo: tinta.t50,
  superficie: tinta.branco,
  superficie2: tinta.t100,
  borda: tinta.t200,
  bordaControle: tinta.t500,
  texto: tinta.t900,
  textoDiscreto: tinta.t500,
  destaque: violeta.v700,
  destaqueEscuro: violeta.v800,
  sobreDestaque: tinta.branco,
  anelDeFoco: violeta.v600,
  okTexto: "#14702F", okFundo: "#E6F6EA",
  alertaTexto: "#92400E", alertaFundo: "#FEF3C7",
  perigoTexto: "#C92A2A", perigoFundo: "#FDEBEB",
  sevBaixaTexto: "#4A5763", sevBaixaFundo: tinta.t100,
  sevMediaTexto: "#92400E", sevMediaFundo: "#FEF3C7",
  sevAltaTexto: "#B91C1C", sevAltaFundo: "#FEE2E2",
  sevCriticaTexto: "#FFFFFF", sevCriticaFundo: "#B91C1C",
};

export const temaEscuro: Tema = {
  escuro: true,
  fundo: tinta.t950,
  superficie: tinta.t850,
  superficie2: tinta.t800,
  borda: tinta.t700,
  bordaControle: tinta.t400,
  texto: tinta.gelo,
  textoDiscreto: tinta.t400,
  destaque: violeta.v400,
  destaqueEscuro: violeta.v300,
  sobreDestaque: tinta.t950,
  anelDeFoco: violeta.v400,
  okTexto: "#69DB7C", okFundo: "#17301D",
  alertaTexto: "#FCC419", alertaFundo: "#332B10",
  perigoTexto: "#FF8787", perigoFundo: "#331D1D",
  sevBaixaTexto: "#AEB9C2", sevBaixaFundo: "#242B31",
  sevMediaTexto: "#FCC419", sevMediaFundo: "#332B10",
  sevAltaTexto: "#FF8787", sevAltaFundo: "#331D1D",
  sevCriticaTexto: "#FFFFFF", sevCriticaFundo: "#B91C1C",
};

/**
 * Tokens de ARTEFATO DE DOCUMENTO. Não seguem o tema, de propósito.
 *
 * Existe uma classe de tela neste aplicativo que não é superfície de
 * aplicativo: é papel desenhado na tela. O quadro de assinatura e a minuta do
 * laudo são as duas. Papel não tem modo escuro, e tratá-las como se tivessem
 * produziu um defeito real, encontrado no teste de campo de 08/09/2026:
 *
 * O quadro de assinatura desenhava o traço com `tema.texto`. No tema escuro
 * isso é `tinta.gelo`, quase branco. `toDataURL` do react-native-svg rasteriza
 * exatamente o que está desenhado, então o PNG saía com traço branco, e esse
 * PNG entra no laudo oficial, cujo papel é `#FFFFFF`. Traço branco em papel
 * branco: a assinatura do morador, que é a prova de que ele estava no local
 * quando a casa foi interditada, ficava invisível no documento. Nada reclamava,
 * porque na tela do agente, escura, o traço aparecia perfeitamente.
 *
 * A minuta falhava pelo mesmo motivo, com consequência mais barata: o agente
 * vira o telefone para o morador ver o que vai assinar, e no tema escuro aquilo
 * não parecia documento nenhum.
 *
 * Os valores são os mesmos do papel de verdade, em
 * `apps/api/src/documentos/folha.ts`: é o mesmo documento visto antes e depois
 * de virar arquivo, e ele precisa ser reconhecível como o mesmo.
 *
 * `fundo` precisa ser OPACO. Cor com transparência aqui vira PNG transparente,
 * e o traço passa a depender do que estiver atrás dele no visualizador de quem
 * abrir o laudo.
 */
export const papel = {
  /** O papel. Branco nos dois temas, igual ao `--papel` da folha impressa. */
  fundo: tinta.branco,
  /** A tinta do traço e do texto, igual ao `--tinta` da folha impressa. */
  tinta: tinta.t900,
  /** Tinta secundária, para rótulo e legenda: o `--tinta-fraca` da folha. */
  tintaDiscreta: "#4A5763",
  /** Fio de régua, separador e borda da folha: o `--linha` da folha. */
  linha: "#C9D2D8",
  /** A mesa sob a folha, para a folha ter onde terminar. */
  mesa: tinta.t100,
  /** A tarja de "isto não é o documento", também fixa nos dois temas. */
  avisoFundo: "#FEF3C7",
  avisoTinta: "#92400E",
} as const;

/**
 * A paleta do VISOR DA CÂMERA, que não segue o tema, pelo mesmo motivo do
 * `papel` acima.
 *
 * Existe neste aplicativo uma classe de superfície que não é superfície de
 * aplicativo. Ali é papel de documento, aqui é o visor de uma câmera, e os dois
 * são o que são no mundo, nos dois temas.
 *
 * As duas escolhas, e nenhuma é estética:
 *
 * - o fundo é preto porque qualquer outra cor ao redor do enquadramento altera
 *   como o olho lê a imagem, e o que o agente está enquadrando é a trinca na
 *   parede que vai justificar uma interdição;
 * - o obturador é branco e redondo porque é o que toda câmera de telefone
 *   desenha, e quem está com uma mão no aparelho, luva na outra e o morador
 *   esperando não procura botão novo.
 *
 * PRETO E BRANCO PUROS, e não `tinta.t950` e `tinta.branco`: neutro de paleta
 * tem matiz (o nosso puxa para o azul), e matiz encostado na imagem da câmera
 * aparece como uma dominante de cor que não está na cena.
 *
 * Nasceu como constante solta dentro da tela de vistoria, com escape declarado
 * no portão de design. Mora aqui para a exceção ser uma decisão visível no
 * sistema, e não um literal que a próxima varredura vai reencontrar.
 */
export const visor = {
  /** O que fica em volta do enquadramento. */
  fundo: "#000000",
  /** O anel do obturador e o traço do que se sobrepõe à imagem. */
  obturador: "#FFFFFF",
} as const;

export const espaco = {
  e1: 4, e2: 8, e3: 12, e4: 16, e5: 24, e6: 32, e7: 48, e8: 64,
} as const;

export const raio = { normal: 8, cartao: 12, pilula: 999 } as const;

/**
 * A ESCALA TIPOGRÁFICA, e por que ela tem sete degraus e não oito.
 *
 * Até 14/09/2026 havia um oitavo, `corpoG`, de 17 pontos, e ele estava
 * declarado em `PENDENCIAS.md` como dívida: a escala dizia oito e o `Txt`, que
 * é a única peça que a lê, expunha sete. Passar `corpoG` devolvia `fontSize:
 * undefined`, ou seja, o degrau existia no arquivo e não existia na tela.
 *
 * A dívida dizia que as duas saídas eram decisão de produto, e que apagar o
 * degrau custaria um passo que o painel TEM (`--ds-fs-body-lg`). **Essa metade
 * do argumento estava errada, e conferir o número é o que a desfaz:**
 * `--ds-fs-body-lg` vale 18 no painel, e 18 é exatamente o `h3` daqui. O passo
 * do painel não se perde, porque ele já está nesta escala com outro nome. O
 * que `corpoG` acrescentava era um 17 que o painel não tem em lugar nenhum.
 *
 * E 17 não é um degrau: é um ponto de distância do `corpo` (16) e um ponto do
 * `h3` (18). Hierarquia por escala precisa que o degrau seja VISTO, e três
 * tamanhos dentro de dois pontos, bem no meio da escala onde vive o texto que
 * a pessoa de fato lê, produzem a tela em que tudo tem o mesmo peso, que é o
 * defeito que a identidade 2.0 existe para corrigir. Quem quiser separar dois
 * blocos de texto separa por PESO, por ESPAÇO ou por um degrau inteiro, e não
 * por um ponto que ninguém enxerga com o aparelho molhado a meio metro do
 * rosto.
 */
export const fonte = {
  display: 32, h1: 26, h2: 21, h3: 18,
  corpo: 16, corpoP: 14, legenda: 12,
} as const;

export const linha = {
  display: 38, h1: 32, h2: 27, h3: 24,
  corpo: 24, corpoP: 20, legenda: 16,
} as const;

/**
 * RASTREIO (o `letterSpacing`), e ele tem dois valores porque só dois papéis
 * precisam dele.
 *
 * Rastreio não é ajuste fino de gosto: ele conserta um defeito ÓTICO que a
 * escala sozinha produz nas duas pontas dela. Quanto maior o tipo, mais larga
 * parece a distância entre as letras, e um número de 32 pontos com espaçamento
 * normal lê como se estivesse se desmontando. Na outra ponta acontece o
 * contrário: um rótulo de 12 pontos, em maiúsculas, com peso forte, vira uma
 * mancha em que as letras se encostam.
 *
 * Os nomes são o papel na tela, como no resto deste arquivo, e não o sinal do
 * número. Quem escreve uma tela sabe se está desenhando o número grande ou o
 * rótulo discreto embaixo dele; ele não sabe (nem precisa saber) que um pede
 * valor negativo e o outro positivo.
 *
 * Não existe aqui um `normal: 0`. Rastreio zero é a ausência do token, e um
 * token que vale zero seria um token que ninguém consegue perceber se estiver
 * faltando.
 */
export const rastreio = {
  /** O número grande do painel do agente, que sem isto parece se desmontar. */
  numeroGrande: -0.5,
  /** O rótulo discreto que nomeia o número, pequeno e em peso forte. */
  rotuloDiscreto: 0.8,
} as const;

/**
 * Alvo mínimo de toque.
 *
 * 52 e não 44. A régua de 44 vem do guia da Apple para uso normal; este
 * aplicativo é usado em pé, na chuva, com uma mão, às vezes com luva, por
 * alguém olhando para um barranco e não para a tela. Errar o botão de
 * concluir vistoria e apagar o rascunho é o tipo de coisa que só acontece em
 * campo, e não na mesa de quem desenha.
 */
export const toque = 52;

/**
 * O PISO DO TEXTO DE INTERAÇÃO, e o nome é comprido de propósito.
 *
 * Ele se chamava `fonteMinima` e dizia "o texto da interface nunca encolhe
 * abaixo disto, mesmo em tela pequena". Essa frase autoriza duas leituras
 * diferentes, as duas defensáveis, e `PENDENCIAS.md` registrou o preço:
 *
 * - lida como PISO DE REDUÇÃO DINÂMICA, ela fala de um mecanismo que reduz
 *   texto em tela pequena, e aí `legenda` (12) continua um degrau legítimo da
 *   escala, usado hoje em 29 lugares;
 * - lida como PISO DA ESCALA, ela proíbe 12 em qualquer lugar, e foi assim que
 *   o `Chip` decidiu desenhar em 14 e a tela de vistoria recusou um selo de 12.
 *
 * Duas frentes leram a mesma linha de dois jeitos e construíram duas pílulas
 * diferentes. O defeito nunca foi o número: foi a linha responder duas
 * perguntas.
 *
 * **A ambiguidade morre pela primeira leitura, e não por empate:** o aplicativo
 * não tem, e nunca teve, nenhum mecanismo de redução dinâmica de fonte. Não há
 * uma linha no produto que consulte este valor para encolher coisa alguma. Ou
 * seja, das duas leituras, uma descrevia um mecanismo inexistente, e o piso de
 * verdade era o outro: o texto que se TOCA, ou que nomeia o que se toca, não
 * desce de 14.
 *
 * O que este piso NÃO governa, e agora está dito: texto de apoio que ninguém
 * toca. Legenda de foto, unidade ao lado de um número, rótulo discreto embaixo
 * de um indicador. Esses continuam podendo ser `legenda`, e a régua de quem
 * decide isso é `hierarquia.ts`, que separa o degrau `interacao` do degrau
 * `apoio` como dado, e não como disciplina.
 *
 * O nome velho não volta: `portao-design-do-aplicativo.test.mjs` reprova quem
 * escrever `fonteMinima` de novo, justamente porque era o nome que permitia as
 * duas leituras.
 */
export const fonteMinimaDeInteracao = 14;

/**
 * Duração de movimento, em milissegundos.
 *
 * Três valores e não sete, porque escala de movimento com sete degraus vira
 * escolha por gosto a cada componente, e o resultado é uma tela onde nada tem
 * o mesmo ritmo de nada.
 *
 * `respostaAoToque` é curto porque ele responde ao dedo: acima de uns 150 ms o
 * toque começa a parecer que não pegou, e o agente toca de novo. `mudancaDeEstado`
 * é para o que muda sozinho e precisa ser percebido sem atrapalhar. `climax` é
 * um só, para um momento só: a fila esvaziando.
 *
 * O clímax é mais longo de propósito, e essa é a única duração deste arquivo
 * que existe por razão emocional em vez de funcional. O agente subiu o morro,
 * coletou sem sinal e desceu sem saber se o trabalho dele chegou. Ver a fila
 * zerar é a resposta a essa dúvida, e ela merece durar o suficiente para ser
 * vista. Um piscar de 150 ms comunicaria o mesmo fato e não resolveria a
 * dúvida.
 *
 * Nada aqui roda quando o aparelho pede redução de movimento: ver
 * `useReducaoDeMovimento`.
 */
export const movimento = {
  respostaAoToque: 120,
  mudancaDeEstado: 260,
  climax: 520,
} as const;

/**
 * A CASCATA: o atraso entre um item de lista e o seguinte, quando a lista
 * entra.
 *
 * Ela não entra em `movimento` de propósito, e a razão é a mesma que faz
 * `movimento` ter três valores: ali é DURAÇÃO, aqui é ATRASO, e um teste deste
 * aplicativo já cobra que existe exatamente uma curva de easing para cada
 * duração. Enfiar um quarto membro lá dentro obrigaria a inventar uma curva
 * para um número que não anima nada.
 *
 * Por que existir, já que nenhuma lista do produto usa cascata hoje: porque
 * quatro frentes vão refazer quatro listas, e a lista de tarefas, a fila, a
 * equipe e os avisos precisam entrar com o MESMO ritmo. Foi exatamente assim
 * que a régua de densidade nasceu (cinco frentes, cinco decisões certas
 * sozinhas, uma tela poluída no fim), e o atraso em cascata é o tipo de número
 * que cada frente escolheria por gosto. Quem aplica é `atrasoEmCascata()`, em
 * `hierarquia.ts`.
 *
 * `teto` é o que impede a cascata de virar espera. Sem ele, o vigésimo item de
 * uma fila de sincronização esperaria oitocentos milissegundos para aparecer, e
 * o agente que abriu a fila para ver se o trabalho subiu ficaria olhando para
 * uma tela que se monta devagar. Do sexto item em diante todos entram juntos:
 * a cascata existe para dar direção de leitura ao começo da lista, e não para
 * cronometrar o fim dela.
 */
export const cascata = {
  /** Quanto cada item espera a mais que o anterior. */
  passo: 40,
  /** Do enésimo item em diante, ninguém espera mais. */
  teto: 6,
} as const;

/**
 * PESO DE FONTE.
 *
 * Três e não nove, e a razão é o arquivo de fonte: peso que não tem arquivo
 * embarcado é peso que o Android NÃO sintetiza. Ele cai no mais próximo que
 * existir, em silêncio, e o resultado é uma hierarquia que existe no
 * simulador do iOS e some no aparelho de campo. Ver `tipografia.ts`, que
 * carrega exatamente um arquivo para cada valor daqui.
 *
 * O nome é a intenção e não o número: `forte` é o rótulo que precisa se
 * separar do valor ao lado, `negrito` é título e número que manda na tela.
 * Quem escrever `fontWeight: "800"` num componente está pedindo um arquivo
 * que não existe.
 */
export const peso = {
  normal: "400",
  forte: "600",
  negrito: "700",
} as const;

export type Peso = (typeof peso)[keyof typeof peso];

/**
 * LARGURA DE BORDA.
 *
 * `borderWidth: 1` estava escrito à mão em sete lugares, e um deles era o
 * contorno da barra de abas. Um número solto repetido sete vezes é uma
 * decisão que ninguém tomou: ela só aconteceu.
 *
 * Os nomes dizem o papel, porque os três fazem coisas diferentes. `fio` é o
 * contorno normal de superfície, que existe para a peça ter onde terminar.
 * `enfase` é o contorno que MUDA (campo em foco, cartão selecionado): ele
 * dobra a espessura para o estado ser perceptível sem depender de cor, que é
 * a regra da casa. `marca` é a faixa lateral que classifica um cartão inteiro,
 * e por isso é larga o suficiente para ser lida de relance, com o telefone na
 * mão e a chuva na tela.
 */
export const borda = { fio: 1, enfase: 2, marca: 4 } as const;

/**
 * OPACIDADE.
 *
 * Só o que comunica estado, e cada valor com o estado que ele nomeia. Não
 * existe aqui "opacidade de texto secundário": texto discreto tem COR própria
 * (`textoDiscreto`), com contraste verificado, e baixar a opacidade de um
 * texto é justamente como se produz um cinza que reprova em AA sem ninguém
 * calcular nada.
 *
 * `aoToque` é o retorno do dedo, e é sutil de propósito: some junto com o
 * toque e não pode parecer que a tela apagou. `inativo` é o oposto, precisa
 * ser óbvio, porque botão desabilitado que parece habilitado faz o agente
 * tocar três vezes achando que o aparelho travou.
 */
export const opacidade = {
  inativo: 0.5,
  aoToque: 0.85,
  /**
   * O véu escuro por trás de uma folha (diálogo, painel que sobe).
   *
   * **Era 0,55, e mudou para 0,66 por conferência e não por gosto.** Quando
   * este token nasceu, o único véu do aplicativo já existia, dentro do
   * `Dialogo`, pintado com 0,66 escrito à mão. Ninguém comparou os dois: o
   * token nasceu sem nenhum lugar apontando para ele, e o véu continuou sendo
   * um número solto. O aplicativo desenhava 0,66 e o sistema de design
   * afirmava 0,55, e as duas coisas conviveram porque nada as obrigava a se
   * encontrar.
   *
   * Quem ganhou foi o 0,66, e a razão é de prova, não de estética: é o valor
   * que foi compilado, instalado e visto num aparelho, e o 0,55 é um valor que
   * nunca desenhou um pixel. Trocar o véu de todos os diálogos do produto para
   * um número que ninguém olhou seria fazer, em silêncio, a mudança visual que
   * este achado existe para impedir.
   *
   * O defeito de verdade aqui nunca foi o número, e sim ter dois: agora há um,
   * e `portao-design-do-aplicativo.test.mjs` reprova quem escrever o segundo.
   */
  veu: 0.66,
} as const;

/**
 * TAMANHO DE ÍCONE.
 *
 * Quatro degraus, nomeados pelo lugar onde o ícone está e não pelo número,
 * porque é o lugar que decide o tamanho: ícone dentro de uma linha de texto
 * precisa acompanhar a altura daquela linha, e ícone de estado vazio precisa
 * ser visto do outro lado da mesa.
 *
 * `inline` casa com a altura de `legenda`, `rotulo` com a de `corpoP` e
 * `acao` com a de `corpo`, então um ícone ao lado de um texto nunca desalinha
 * a linha de base por escolha de tamanho. Este grupo NÃO tem equivalente no
 * painel: lá o ícone é SVG dimensionado em `em`, e aqui é ponto.
 */
export const icone = { inline: 16, rotulo: 20, acao: 24, vazio: 48 } as const;

/**
 * ANEL DE FOCO.
 *
 * Existe porque o aplicativo tem campo de texto, e campo de texto em foco
 * precisa ser reconhecível sem depender da cor da borda, que é o que ele fazia
 * (nada: a borda era a mesma em repouso e em foco).
 *
 * `folga` é o espaço entre a peça e o anel, e não é estética: sem ela o anel
 * encosta no contorno da própria peça e os dois viram um traço grosso só, que
 * some para quem tem baixa visão. A cor sai de `tema.anelDeFoco`. Os dois
 * números são os mesmos do `--ds-focus-ring` do painel (2 px de anel depois de
 * 2 px do fundo).
 */
export const foco = { largura: 2, folga: 2 } as const;

/**
 * ELEVAÇÃO.
 *
 * Aqui estava o buraco mais caro do arquivo: o aplicativo inteiro tinha UMA
 * sombra, escrita à mão dentro da barra de abas, com cinco propriedades e um
 * `#000000` literal. Sombra literal não acompanha o tema, e o efeito não é
 * "fica feio": é sumir.
 *
 * **Por que isto é uma função e não um objeto.** Sombra preta sobre fundo
 * quase preto não aparece. É o defeito clássico do modo escuro, e uma escala
 * de elevação copiada do tema claro entrega, no escuro, três níveis
 * indistinguíveis. O painel já resolveu isso em `tokens.css`, com
 * `--ds-shadow-1/2/3` redefinidos no bloco do tema escuro: a sombra do escuro
 * é preto puro com opacidade MUITO maior (0,45 a 0,60 contra 0,06 a 0,16). Os
 * valores daqui são aqueles, e é por isso que a elevação precisa receber o
 * tema para existir.
 *
 * **A segunda metade da resposta, que a sombra sozinha não dá.** Mesmo com
 * 60% de opacidade, uma sombra preta sobre `#101519` é um degradê que quase
 * ninguém enxerga na rua, de dia. Então no escuro quem carrega a elevação é a
 * SUPERFÍCIE: a peça elevada clareia (`superficie` para `superficie2`), que é
 * como o próprio painel separa camada no escuro. A sombra fica como reforço,
 * não como único sinal. No claro é o contrário: a superfície é branca nos dois
 * níveis e quem separa é a sombra.
 *
 * Por isso o que sai daqui é um estilo COMPLETO e espalhável: fundo, contorno
 * e sombra juntos. Espalhar metade produziria exatamente o cartão invisível
 * que este bloco existe para evitar.
 *
 * Os nomes são o papel na tela, nunca o número:
 *
 * - `cartao`: a superfície que se separa da página. É o chão de quase tudo.
 * - `flutuante`: o que passa POR CIMA do conteúdo e continua ali enquanto ele
 *   rola (barra, faixa fixa, menu suspenso).
 * - `folha`: o que cobre a tela e pede decisão (diálogo, painel que sobe). É o
 *   topo da escala, e não existe nível acima dele de propósito: se tudo pode
 *   ser o mais alto, nada é.
 *
 * **A SOMBRA DA FOLHA SOBE, e isso é a dívida 9.1 fechada.** Até 14/09/2026
 * este nível não tinha um único uso no produto inteiro, e a razão estava
 * escrita: ele descia a sombra 12 pontos, ou seja, tinha sido desenhado para
 * uma folha que PAIRA, e a única folha do aplicativo é colada no rodapé, onde
 * essa sombra cai para fora da tela. O `Dialogo` desenhava a superfície à mão
 * para contornar, e no tema escuro ele terminava em `superficie`: a peça que
 * está por cima de tudo tinha a superfície de um cartão que está no fundo.
 *
 * O que desfaz a recusa não é gosto, é o produto ter decidido a outra metade
 * em outro lugar: **nenhuma folha deste aplicativo paira, e nenhuma vai.** O
 * cabeçalho de `Dialogo.tsx` recusa a folha no meio da tela com o motivo
 * escrito (o polegar de quem segura o telefone com uma mão só não alcança o
 * meio sem regripar, e regripar em pé num barranco é como telefone cai no
 * barro), e a folha arrastável sobre o mapa, que é a próxima a nascer, é
 * ancorada embaixo pelo mesmo motivo. Um nível desenhado para uma classe de
 * peça que o produto decidiu não ter é um nível errado, não um nível sem uso.
 *
 * Aposentá-lo era a outra saída, e ela custava mais: a folha passaria a pedir
 * emprestado o `flutuante`, cuja declaração diz outra coisa ("o que passa por
 * cima do conteúdo e continua ali enquanto ele rola"), e o topo da escala
 * viraria o nível do meio. A frase acima ("se tudo pode ser o mais alto, nada
 * é") deixa de valer no minuto em que o mais alto é o mesmo que o do meio.
 *
 * Então o deslocamento é NEGATIVO: a sombra sai por cima da borda superior da
 * folha, que é a única borda dela que aparece na tela. O resto do nível não
 * muda, e a metade que conserta o defeito visível é a mesma de sempre: no
 * escuro, a folha clareia para `superficie2` e deixa de se confundir com o
 * cartão de baixo.
 *
 * Uma conversão declarada: no CSS o terceiro número de `box-shadow` é o raio
 * de desfoque, e no React Native `shadowRadius` é cerca de metade disso. Os
 * valores abaixo já estão convertidos, então a sombra do aplicativo e a do
 * painel se parecem em vez de baterem no papel e divergirem na tela. E o
 * `--ds-shadow-1` do claro tem DUAS camadas, que o React Native não sabe
 * desenhar: ficou a de baixo, que é a que dá a forma.
 */
export type EstiloDeElevacao = {
  backgroundColor: string;
  borderWidth: number;
  borderColor: string;
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  /** O Android ignora as quatro de cima e lê só esta. */
  elevation: number;
};

export type NivelDeElevacao = "cartao" | "flutuante" | "folha";

export function elevacao(tema: Tema): Record<NivelDeElevacao, EstiloDeElevacao> {
  /*
    A cor da sombra também troca com o tema, e não por capricho. No claro,
    preto puro sobre um neutro quente lê como sujeira; o painel usa a tinta
    mais escura da paleta (`ink-950`), que é a mesma coisa que este arquivo
    chama de `tinta.t950`. No escuro o fundo JÁ é essa tinta, então a única
    sombra que ainda pode escurecer alguma coisa é preto puro.
  */
  const corDaSombra = tema.escuro ? "#000000" : tinta.t950;

  /* No escuro a peça elevada clareia; no claro ela continua branca. */
  const superficieElevada = tema.escuro ? tema.superficie2 : tema.superficie;

  return {
    cartao: {
      backgroundColor: tema.superficie,
      borderWidth: borda.fio,
      borderColor: tema.borda,
      shadowColor: corDaSombra,
      shadowOpacity: tema.escuro ? 0.45 : 0.1,
      shadowRadius: 1.5,
      shadowOffset: { width: 0, height: 1 },
      elevation: 2,
    },
    flutuante: {
      backgroundColor: superficieElevada,
      borderWidth: borda.fio,
      borderColor: tema.borda,
      shadowColor: corDaSombra,
      shadowOpacity: tema.escuro ? 0.5 : 0.1,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    folha: {
      backgroundColor: superficieElevada,
      borderWidth: borda.fio,
      borderColor: tema.borda,
      shadowColor: corDaSombra,
      shadowOpacity: tema.escuro ? 0.6 : 0.16,
      shadowRadius: 14,
      /* Para CIMA: é a borda de cima que aparece numa folha colada no rodapé. */
      shadowOffset: { width: 0, height: -12 },
      elevation: 16,
    },
  };
}

/**
 * O GRADIENTE DE DESTAQUE, e por que ele é uma função e não um par de cores.
 *
 * `CLAUDE.md` autoriza gradiente desde a emenda de 2026-08-20, com três
 * condições: os dois pontos são tokens `--ds-*` já existentes, nunca cor
 * inventada, e nunca no fundo de uma tela inteira. O aplicativo nunca usou, e é
 * uma das coisas que separam "projeto" de "produto" nesta identidade.
 *
 * Isto é uma função porque uma função é o único jeito de a primeira condição
 * ser verdade POR CONSTRUÇÃO. Um token `gradiente: ["#6D28D9", "#4C1D95"]`
 * seria um par de cores escritas à mão, e no dia em que alguém precisasse de um
 * segundo gradiente ele escreveria o par que achasse bonito. Aqui não existe
 * entrada para cor: entra o tema, saem dois tokens semânticos dele.
 *
 * **A ORDEM É DECIDIDA AQUI, e não no ponto de uso.** O par vai do mais claro
 * para o mais escuro nos DOIS temas, então o gradiente sempre desce, e não
 * inverte de direção quando o agente troca de tema no meio do plantão. No tema
 * claro `destaqueEscuro` é o violeta 800, mais escuro que o 700; no escuro é o
 * violeta 300, mais CLARO que o 400, porque no escuro o que dá ênfase é
 * clarear. Quem chamasse com os dois na mesma ordem teria, sem perceber, um
 * botão sombreado para baixo num tema e para cima no outro.
 *
 * **O contraste não piora em ponta nenhuma**, e isso é medido e não afirmado:
 * o texto por cima é `sobreDestaque`, e `hierarquia.test.ts` refaz a conta da
 * WCAG contra os DOIS pontos do gradiente, nos dois temas, com a própria
 * fórmula provada por um caso (preto sobre branco tem que dar 21:1). O ponto
 * que este gradiente acrescenta é sempre o mais contrastante dos dois (mais
 * escuro sob texto branco, mais claro sob texto escuro), então o pior caso do
 * botão com gradiente é o mesmo pior caso do botão chapado, que é o que o
 * portão de acessibilidade já mede.
 *
 * E "nunca no fundo de uma tela inteira" não fica por conta da boa vontade: o
 * portão de design reprova gradiente escrito fora de `src/ui/`, para ele
 * continuar sendo acabamento de peça e não papel de parede.
 */
export function gradienteDeDestaque(tema: Tema): readonly [string, string] {
  return tema.escuro
    ? [tema.destaqueEscuro, tema.destaque]
    : [tema.destaque, tema.destaqueEscuro];
}

/**
 * EASING, nomeado pela intenção.
 *
 * Quatro curvas estavam escolhidas DENTRO dos componentes
 * (`Easing.out(Easing.quad)`, `Easing.out(Easing.cubic)`,
 * `Easing.out(Easing.back(2))`), o que quer dizer que cada peça nova escolhia
 * de novo, por gosto, e o aplicativo passou a ter ritmos diferentes em telas
 * vizinhas.
 *
 * São três, pareadas com as três durações de `movimento`, porque duração e
 * curva são a mesma decisão partida em dois números. O nome diz o que a peça
 * está fazendo, nunca o formato da curva: quem escreve a tela sabe se o
 * elemento está entrando ou saindo, e não sabe (nem deve precisar saber) se
 * quer uma quadrática.
 *
 * - `entrada`: o que aparece e o que muda de estado. Desacelera no fim, então
 *   chega no lugar em vez de bater. É a curva padrão do painel
 *   (`--ds-ease: cubic-bezier(0.2, 0, 0, 1)`).
 * - `saida`: o que deixa a tela. Sai andando, e o olho não precisa acompanhar
 *   o fim. É o `--ds-ease-in` do painel.
 * - `climax`: passa do alvo e volta. Uma curva com excesso é a diferença
 *   entre "o estado mudou" e "conseguimos": ela existe para o momento em que a
 *   fila zera, e para mais nada.
 *
 * Os valores são pontos de controle de Bézier, e não objetos de `Easing`, para
 * este arquivo continuar sendo dado puro: quem anima chama
 * `Easing.bezier(...easing.entrada)`. Um token que já importasse o React
 * Native não poderia ser lido por portão de qualidade nem por teste de
 * paridade com o painel.
 */
export const easing = {
  entrada: [0.2, 0, 0, 1],
  saida: [0, 0, 0.2, 1],
  climax: [0.34, 1.56, 0.64, 1],
} as const;

export type CurvaDeEasing = readonly [number, number, number, number];
