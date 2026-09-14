import type { Tema } from "../tokens";

/**
 * O ESTILO DO MAPA DO GOOGLE, GERADO DOS NOSSOS TOKENS.
 *
 * O pedido do Rafa foi "personalizar da nossa maneira", "algo como o Uber
 * faz", e foi por causa dele que o provedor é o Google nos dois lados: o Apple
 * Maps não aceita paleta própria, e um mapa com a paleta da Apple dentro de um
 * produto com a nossa é a diferença entre ferramenta e página de terceiro
 * embutida.
 *
 * ## Por que este arquivo existe, em vez de um JSON colado
 *
 * O caminho óbvio é abrir o gerador de estilos do Google, escolher cores num
 * seletor e colar o JSON. O resultado seria um bloco de umas vinte cores em
 * hexadecimal, escritas à mão, que não trocam com o tema e não acompanham a
 * paleta: exatamente o que `scripts/portao-design-do-aplicativo.test.mjs`
 * reprova no resto do aplicativo, e exatamente o defeito que este produto já
 * pagou uma vez (a assinatura branca em papel branco, contada em `tokens.ts`).
 *
 * Aqui cada cor do mapa aponta para um token que JÁ EXISTE, o tema entra como
 * argumento, e os dois modos saem da mesma função. Nenhuma cor é inventada.
 *
 * ## O que cada superfície do mapa recebe, e por quê
 *
 * A régua é uma só: o mapa é o CHÃO, e os pinos são a informação. Um mapa de
 * base com contraste alto brigaria com o marcador de severidade, e é o
 * marcador que precisa ser visto primeiro, de relance, com o telefone na mão e
 * a chuva na tela. Por isso a base inteira sai da escala neutra, e a cor de
 * marca (violeta) NÃO aparece em lugar nenhum: ela é do produto, não do
 * território, e um mapa roxo faria a severidade competir com a decoração.
 *
 * - terreno: `fundo`, que é o chão de toda tela do aplicativo, então o mapa
 *   nasce da mesma superfície em que está embutido;
 * - água: `superficie2`, um degrau de separação do terreno em vez do azul do
 *   Google, que no tema escuro é a única mancha saturada da tela inteira;
 * - via: `superficie`, que é a cor de cartão, com contorno em `borda`. É o que
 *   faz a malha viária aparecer como desenho e não como mancha;
 * - edificação: `superficie2`, o mesmo degrau da água, porque as duas são
 *   território ocupado e nenhuma delas é a informação;
 * - texto: `texto` com halo de `fundo`, que é a única combinação garantida
 *   legível nos dois temas, porque é a mesma que o portão de acessibilidade já
 *   mede em toda a interface.
 *
 * ## O que sai do mapa, e é escolha de trabalho
 *
 * Ponto comercial, transporte público e ícone de estabelecimento são
 * desligados. Não é economia de pixel: o agente procura UMA casa, e cada
 * pictograma de padaria é uma coisa a mais a descartar com o olho. O que fica
 * é rua, nome de rua, quadra e água, que é o que responde "onde eu estou e
 * para onde eu ando".
 */

/**
 * O formato que o `react-native-maps` entrega ao SDK, declarado aqui à mão.
 *
 * É o mesmo critério do painel em `mapa-de-base.ts`: o tipo vem de nós e não
 * do pacote, para este arquivo não depender de a biblioteca estar instalada
 * para ser lido, e para o portão conseguir varrer o que ele produz sem montar
 * mapa nenhum. A forma é a documentada pelo Google, e a biblioteca só faz
 * `JSON.stringify` disto antes de passar adiante.
 */
export type EstiloDoMapa = {
  featureType?: string;
  elementType?: string;
  stylers: Array<Record<string, string | number>>;
};

/** Atalhos, para as regras abaixo caberem numa linha cada. */
const cor = (valor: string): Array<Record<string, string>> => [{ color: valor }];
const oculto: Array<Record<string, string>> = [{ visibility: "off" }];

export function estiloDoGoogle(tema: Tema): EstiloDoMapa[] {
  return [
    /* O chão de tudo, e o mesmo fundo da tela em que o mapa está embutido. */
    { elementType: "geometry", stylers: cor(tema.fundo) },

    /*
      O TEXTO, e ele vem antes das regras específicas de propósito.

      O Google aplica as regras na ordem em que chegam, então declarar o texto
      aqui em cima deixa cada bloco seguinte livre para escurecer o SEU rótulo
      sem precisar repetir o halo. Halo com a cor do fundo é o que mantém o
      nome da rua legível quando ele cruza uma quadra escura, e sem ele o texto
      some justamente onde a malha é mais densa, que é o centro.
    */
    { elementType: "labels.text.fill", stylers: cor(tema.texto) },
    { elementType: "labels.text.stroke", stylers: cor(tema.fundo) },

    /* Divisa de município e de bairro: fio, nunca mancha. */
    { featureType: "administrative", elementType: "geometry", stylers: cor(tema.borda) },
    {
      featureType: "administrative.land_parcel",
      elementType: "labels",
      stylers: oculto,
    },

    /* A quadra construída. Território ocupado, um degrau acima do terreno. */
    { featureType: "landscape.man_made", elementType: "geometry", stylers: cor(tema.superficie2) },
    { featureType: "landscape.natural", elementType: "geometry", stylers: cor(tema.fundo) },

    /*
      PONTO DE INTERESSE, desligado inteiro e depois reaberto só para o parque.

      Padaria, banco e ponto turístico são ruído para quem procura uma casa. O
      parque fica porque ele é MASSA no território: um vazio verde grande é
      referência de orientação ("a casa é depois da praça"), e apagá-lo deixaria
      um buraco sem explicação no desenho.
    */
    { featureType: "poi", stylers: oculto },
    { featureType: "poi.park", elementType: "geometry", stylers: cor(tema.superficie2) },

    /*
      A VIA, e é ela que carrega o mapa.

      Preenchimento de cartão com contorno de borda: os dois juntos são o que
      faz a malha ler como desenho técnico em vez de mancha clara. Sem o
      contorno, no tema claro a rua branca sobre o terreno quase branco
      desaparece, que foi a primeira coisa que apareceu ao olhar o resultado.
    */
    { featureType: "road", elementType: "geometry.fill", stylers: cor(tema.superficie) },
    { featureType: "road", elementType: "geometry.stroke", stylers: cor(tema.borda) },
    /*
      Ícone de faixa, seta e brasão de rodovia saem: eles são desenhados pelo
      Google com a paleta DELE, saturada, e reapareceriam como as únicas manchas
      coloridas de uma tela que a nossa paleta inteira mantém neutra.
    */
    { featureType: "road", elementType: "labels.icon", stylers: oculto },
    /*
      A rodovia recebe o contorno de CONTROLE, que é o degrau mais escuro de
      borda do sistema. É a única hierarquia da malha, e ela existe porque o
      agente que está chegando de carro lê a via principal antes da servidão.
    */
    { featureType: "road.highway", elementType: "geometry.stroke", stylers: cor(tema.bordaControle) },

    /* Transporte público: nada que este trabalho use, e ruído no morro. */
    { featureType: "transit", stylers: oculto },

    /* A água, com o nome dela em tinta discreta, porque é referência e não alvo. */
    { featureType: "water", elementType: "geometry", stylers: cor(tema.superficie2) },
    { featureType: "water", elementType: "labels.text.fill", stylers: cor(tema.textoDiscreto) },
  ];
}
