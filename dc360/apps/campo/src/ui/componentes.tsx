import {
  createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View, useColorScheme,
  type StyleProp, type ViewStyle,
} from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import {
  borda, easing, elevacao, espaco, fonte, gradienteDeDestaque, icone as tamanhoDeIcone,
  linha, movimento, opacidade, peso, raio, temaClaro, temaEscuro, toque,
  type Peso, type Tema,
} from "./tokens";
import { degrau, type NivelDeHierarquia } from "./hierarquia";
import {
  PREFERENCIA_PADRAO, guardarPreferenciaDeTema, lerPreferenciaDeTema,
  type PreferenciaDeTema,
} from "../dados/preferencia-de-tema";
import { useFontes } from "./fontes";
import { pesoEfetivo, type PesoVisual } from "./regua";
import { familiaDoTexto } from "./tipografia";
import { useReducaoDeMovimento } from "./useReducaoDeMovimento";
import { useRespostaAoToque } from "./useRespostaAoToque";

/**
 * As peças de interface do aplicativo de campo.
 *
 * Duas regras governam tudo aqui, e as duas vêm da rua e não do design:
 *
 * 1. **Nada comunica estado só por cor.** Ícone ou palavra sempre acompanham.
 *    Vale para daltonismo, e vale também para tela com sol batendo em cima,
 *    que é a situação normal de quem trabalha em campo.
 * 2. **Alvo grande.** Nada clicável abaixo de 52 pontos. Ver a razão em
 *    `tokens.ts`.
 */

/**
 * ## A DECISÃO SOBRE O ALTERNADOR DE TEMA, e a que ela substituiu
 *
 * Até 14/09/2026 este arquivo dizia o seguinte, e o aplicativo fazia isso:
 *
 * > O tema segue o aparelho, sem alternador próprio. No painel existe
 * > alternador porque a pessoa passa o dia na mesma tela. No celular, o agente
 * > já escolheu no sistema, e oferecer uma segunda chave dentro do aplicativo
 * > só cria a chance de ficarem diferentes.
 *
 * O argumento não era ruim, e fica escrito porque comentário apagado leva
 * junto a memória de que alguém já pensou o contrário. O que ele errava é a
 * premissa: que a escolha do sistema representa a condição de leitura do
 * agente. Ela representa a do dono do telefone sentado em casa.
 *
 * **A tela deste aplicativo é lida em duas situações que o sistema não
 * conhece.** Sol forte batendo na tela, no barranco, ao meio-dia, quando o
 * tema claro é o único legível; e o plantão noturno, com o aparelho a um palmo
 * do rosto no escuro, quando a tela clara cega quem precisa continuar
 * enxergando o barranco depois de olhar para ela. O sistema decide pelo
 * RELÓGIO (ou por uma chave que a pessoa mexeu uma vez e esqueceu), e o relógio
 * não sabe onde o agente está nem se há sol. As duas condições não batem com a
 * hora: chove escuro às duas da tarde, e o plantão da noite começa com o
 * telefone ainda no claro.
 *
 * Por isso a escolha passa a ser do agente, e a decisão é do dono do produto.
 * O risco que o comentário antigo apontava (duas chaves divergindo) continua
 * real, e o que o desarma são os TRÊS estados: "acompanhar o sistema" continua
 * sendo o padrão, ninguém é empurrado para uma segunda chave, e quem mexeu tem
 * como voltar. Um alternador de dois estados teria exatamente o defeito
 * descrito acima, porque não tem volta.
 */

const ContextoTema = createContext<Tema>(temaEscuro);

/**
 * O que a tela de conta precisa para oferecer a escolha, e o que `_layout.tsx`
 * precisa para segurar a abertura até saber qual tema desenhar.
 *
 * Fica num contexto SEPARADO do tema resolvido de propósito. Quem só desenha
 * (que é todo o resto do aplicativo, dezenas de componentes) continua lendo
 * `useTema()` e recebendo um `Tema`, sem nunca ver que existe preferência,
 * escolha ou leitura pendente. A única tela que decide é a que decide.
 */
export type EstadoDoTema = {
  /** O que está guardado no aparelho: "sistema", "claro" ou "escuro". */
  preferencia: PreferenciaDeTema;
  /** O que o sistema diz AGORA, para "acompanhar" poder dizer no que dá. */
  doSistema: "claro" | "escuro";
  /** Troca a escolha. A tela muda no mesmo quadro; a escrita vai atrás. */
  escolher(preferencia: PreferenciaDeTema): void;
  /**
   * A leitura do aparelho já voltou?
   *
   * `false` significa que o tema exibido é um chute (o padrão), e é por isso
   * que a abertura espera: mostrar meio segundo de tela escura para quem
   * escolheu claro é o mesmo piscar que a tela de abertura existe para evitar.
   */
  carregada: boolean;
};

const ContextoEstadoDoTema = createContext<EstadoDoTema | null>(null);

export function ProvedorDeTema({ children }: { children: ReactNode }) {
  const esquema = useColorScheme();
  const doSistema: "claro" | "escuro" = esquema === "light" ? "claro" : "escuro";

  const [preferencia, setPreferencia] = useState<PreferenciaDeTema>(PREFERENCIA_PADRAO);
  const [carregada, setCarregada] = useState(false);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const guardada = await lerPreferenciaDeTema();
      /*
        A escolha do agente ganha da leitura do disco, e não o contrário.

        Sem esta guarda, um toque no alternador durante a leitura (ela é rápida,
        mas existe) seria desfeito por um valor mais velho que o toque, e o
        agente veria a tela voltar sozinha para o tema anterior. É o mesmo
        cuidado do `vivo` logo abaixo, com um efeito pior: aquele só escreve
        estado em componente desmontado, este desmente o usuário.
      */
      if (vivo) {
        setPreferencia((atual) => (atual === PREFERENCIA_PADRAO ? guardada : atual));
        setCarregada(true);
      }
    })();
    return () => { vivo = false; };
  }, []);

  const escolher = useCallback((nova: PreferenciaDeTema) => {
    /*
      Primeiro a tela, depois o disco. O agente toca e a tela troca no mesmo
      quadro: esperar a escrita do SQLite para redesenhar transformaria um
      toque instantâneo num toque com atraso variável, que é como um aplicativo
      parece quebrado sem nunca dar erro.
    */
    setPreferencia(nova);
    void guardarPreferenciaDeTema(nova);
  }, []);

  const efetivo = preferencia === "sistema" ? doSistema : preferencia;
  const tema = efetivo === "claro" ? temaClaro : temaEscuro;

  const estado = useMemo<EstadoDoTema>(
    () => ({ preferencia, doSistema, escolher, carregada }),
    [preferencia, doSistema, escolher, carregada],
  );

  return (
    <ContextoEstadoDoTema.Provider value={estado}>
      <ContextoTema.Provider value={tema}>
        {children}
      </ContextoTema.Provider>
    </ContextoEstadoDoTema.Provider>
  );
}

export function useTema(): Tema {
  return useContext(ContextoTema);
}

/**
 * A escolha do tema, para quem a OFERECE.
 *
 * Estoura fora do provedor, ao contrário de `useTema()`, e a diferença é
 * deliberada. `useTema()` tem padrão porque é lido por dezenas de componentes,
 * vários deles montados isolados em teste, e um tema de reserva ali é
 * inofensivo: a peça sai desenhada. Aqui um padrão silencioso seria um
 * alternador que ACEITA o toque, marca a opção, e não muda tela nenhuma nem
 * guarda nada, porque o `escolher` de reserva não teria o que trocar. Falhar
 * na montagem é o que garante que isso apareça em quem escreve a tela, e não
 * em quem usa o aplicativo.
 */
export function useEstadoDoTema(): EstadoDoTema {
  const valor = useContext(ContextoEstadoDoTema);
  if (!valor) throw new Error("useEstadoDoTema fora do ProvedorDeTema");
  return valor;
}

/* ========================================================================
   Texto
   ======================================================================== */

type PropsTexto = {
  children: ReactNode;
  variante?: "display" | "h1" | "h2" | "h3" | "corpo" | "corpoP" | "legenda";
  /**
   * O PAPEL do texto na peça, quando ele tem um. Ver `hierarquia.ts`.
   *
   * Novo e opcional, e as duas coisas são deliberadas. `variante` diz TAMANHO,
   * e continua sendo o caminho de todo texto corrido; `nivel` diz PAPEL, e
   * resolve tamanho, altura, peso, rastreio, caixa e discrição de uma vez, a
   * partir da régua de hierarquia. Quem passa `nivel` deixa de escolher cinco
   * coisas que precisam combinar entre si, que é onde cinco frentes produzem
   * cinco combinações.
   *
   * Quando os dois vêm juntos, `nivel` ganha: ele é a decisão mais específica,
   * e um texto que declara o papel dele já respondeu à pergunta do tamanho.
   */
  nivel?: NivelDeHierarquia;
  discreto?: boolean;
  cor?: string;
  negrito?: boolean;
  /**
   * O peso exato, quando `negrito` (que é liga/desliga) não basta. Sai de
   * `tokens.peso`, e só existe peso para o qual há arquivo de fonte.
   */
  peso?: Peso;
  /** Protocolo, matrícula e número tabular, em Roboto Mono: dígito que se dita
   *  por rádio precisa ser inconfundível. Ver `tipografia.ts`. */
  mono?: boolean;
  alinhamento?: "left" | "center" | "right";
  numeroDeLinhas?: number;
};

export function Txt({
  children, variante = "corpo", nivel, discreto, cor, negrito, peso: pesoPedido, mono,
  alinhamento, numeroDeLinhas,
}: PropsTexto) {
  const tema = useTema();
  const fontes = useFontes();
  /*
    O papel, quando declarado, resolve tudo o que precisa combinar entre si.
    Sem papel, cai na escala por tamanho, que é o caminho de todo texto corrido
    e continua igual ao que sempre foi.
  */
  const papelDoTexto = nivel ? degrau(nivel) : null;
  const tamanho = papelDoTexto?.fonte ?? {
    display: fonte.display, h1: fonte.h1, h2: fonte.h2, h3: fonte.h3,
    corpo: fonte.corpo, corpoP: fonte.corpoP, legenda: fonte.legenda,
  }[variante];
  const altura = papelDoTexto?.linha ?? {
    display: linha.display, h1: linha.h1, h2: linha.h2, h3: linha.h3,
    corpo: linha.corpo, corpoP: linha.corpoP, legenda: linha.legenda,
  }[variante];
  const pesoFinal: Peso = pesoPedido
    ?? papelDoTexto?.peso
    ?? (negrito || variante.startsWith("h") || variante === "display" ? peso.negrito : peso.normal);
  /*
    O rastreio do papel, e mais nada. Texto corrido não leva rastreio nenhum:
    `undefined` deixa o React Native usar a métrica da própria fonte, que é o
    que a Work Sans foi desenhada para fazer no tamanho de leitura. Só as duas
    pontas da escala pedem correção ótica, e a razão está em `tokens.ts`.
  */
  const espacamento = papelDoTexto?.rastreio;
  const ehDiscreto = discreto ?? papelDoTexto?.discreto ?? false;

  return (
    /*
      O portão proíbe `<Text>` cru em todo o produto justamente para que exista
      um lugar só onde a família de fonte é resolvida, e este é esse lugar. A
      exceção abaixo é a definição da regra, e não um furo nela.
    */
    /* design-system: excecao */
    <Text
      numberOfLines={numeroDeLinhas}
      style={{
        fontSize: tamanho,
        lineHeight: altura,
        /*
          `fontWeight` some quando a fonte do produto está registrada, e essa
          linha é a que separa "funciona no simulador" de "funciona no
          aparelho". Com uma família por peso (WorkSans-SemiBold e não WorkSans
          mais 600), pedir peso POR CIMA da família faz o Android procurar uma
          variante que não existe e desenhar o que quiser. Na reserva do
          sistema é o contrário: a família é uma só e o peso é a única coisa
          que produz hierarquia.
        */
        fontWeight: fontes.prontas ? undefined : pesoFinal,
        fontFamily: familiaDoTexto({ mono, peso: pesoFinal, fontesProntas: fontes.prontas }),
        letterSpacing: espacamento,
        /*
          A caixa alta é do PAPEL e não do conteúdo, e por isso ela é desenhada
          e não escrita. Quem escrever "TAREFAS DE HOJE" no código entrega ao
          leitor de tela uma palavra que vira sigla soletrada; `textTransform`
          muda o desenho e deixa o texto acessível intacto.
        */
        textTransform: papelDoTexto?.maiuscula ? "uppercase" : undefined,
        color: cor ?? (ehDiscreto ? tema.textoDiscreto : tema.texto),
        textAlign: alinhamento,
      }}
    >
      {children}
    </Text>
  );
}

/* ========================================================================
   Quanto um rótulo OCUPA, e as duas decisões que dependem disso
   ======================================================================== */

/**
 * A RÉGUA DE LARGURA DE TEXTO, e por que ela precisa existir aqui.
 *
 * O React Native não mede texto de forma síncrona. Quem escreve a tela só
 * descobre que "Confirmar assinatura" não cabe no botão depois de o aparelho
 * desenhar, e o desenho errado é justamente o que o agente vê: o rótulo quebra
 * em duas linhas, o botão cresce em altura (ele usa `minHeight`, não `height`)
 * e fica mais alto que o vizinho. Foi a reclamação literal de quem paga.
 *
 * Então a largura é ESTIMADA, por tabela de avanço por caractere. A tabela é
 * grosseira de propósito: quatro classes, e não uma métrica por glifo, porque
 * as duas decisões que ela alimenta são binárias e nenhuma delas precisa do
 * ponto exato. Medida contra a Work Sans SemiBold nos rótulos que o produto de
 * fato usa, ela erra em até uns 8% para os dois lados.
 *
 * ## As duas decisões, e por que cada uma erra para um lado
 *
 * - **`cabemLadoALado`** decide LAYOUT (dois botões numa linha, ou empilhados).
 *   Erra para o lado de empilhar: uma linha que não coube é o defeito relatado,
 *   e uma coluna a mais é só uma coluna a mais.
 * - **`varianteQueCabe`** decide TIPOGRAFIA (encolher o rótulo um degrau). Erra
 *   para o lado de NÃO encolher, com a folga abaixo, porque encolher por engano
 *   apaga texto de interação em botão que estava perfeitamente bem. O botão que
 *   dimensiona pela própria palavra (o "Por que não aqui?" do perfil, o ato do
 *   aviso da lista) é exatamente o caso em que a estimativa encosta no real.
 *
 * O que nenhuma das duas precisa acertar: o caso extremo. Ele tem rede embaixo,
 * que é o `numberOfLines={1}` do botão mais as reticências, e o rótulo inteiro
 * continuando no leitor de tela.
 */
const AVANCO_DO_CARACTERE = {
  /** `i j l t f r` e a pontuação fina. */
  estreito: 0.36,
  /** `m w M W`, que valem quase uma caixa alta e meia. */
  largo: 0.95,
  /** Caixa alta e dígito. */
  alto: 0.66,
  /** O espaço, que é o mais estreito de todos e o mais frequente. */
  espaco: 0.28,
  /** Caixa baixa comum. */
  comum: 0.58,
} as const;

const CARACTERES_ESTREITOS = new Set([..."ijltfrIJ.,:;!|'\"()[]"]);
const CARACTERES_LARGOS = new Set([..."mwMW@"]);

/**
 * A folga que a régua se dá antes de mandar encolher um rótulo.
 *
 * É o erro dela mesma, dito como número: a estimativa pode passar do real em
 * até uns 8%, e sem esta folga todo botão que tem a largura da própria palavra
 * encolheria para 14 sem precisar, porque ali a medida disponível É a medida do
 * texto. Só encolhe o rótulo que não cabe com sobra maior que o erro da régua.
 */
const FOLGA_DA_REGUA = 0.92;

/**
 * Quanto um rótulo ocupa, em pontos, num dado tamanho de fonte.
 *
 * Exportada para ser provada com os rótulos reais do produto, e não só usada.
 */
export function larguraDoRotulo(texto: string, tamanhoDaFonte: number): number {
  let avancos = 0;
  for (const letra of texto) {
    if (letra === " ") avancos += AVANCO_DO_CARACTERE.espaco;
    else if (CARACTERES_LARGOS.has(letra)) avancos += AVANCO_DO_CARACTERE.largo;
    else if (CARACTERES_ESTREITOS.has(letra)) avancos += AVANCO_DO_CARACTERE.estreito;
    else if (/[0-9]/.test(letra) || (letra !== letra.toLowerCase() && letra === letra.toUpperCase())) {
      avancos += AVANCO_DO_CARACTERE.alto;
    } else avancos += AVANCO_DO_CARACTERE.comum;
  }
  return avancos * tamanhoDaFonte;
}

/** O que a linha de ações precisa saber de um botão para decidir se ele cabe. */
export type MedidaDoBotao = {
  titulo: string;
  /** O ícone come `icone.rotulo` mais o `gap`, e some da largura do rótulo. */
  comIcone?: boolean;
};

/** Quanto um botão inteiro precisa, do contorno esquerdo ao direito. */
export function larguraNecessariaDoBotao(
  { titulo, comIcone }: MedidaDoBotao,
  tamanhoDaFonte: number,
): number {
  return espaco.e4 * 2
    + (comIcone ? tamanhoDeIcone.rotulo + espaco.e2 : 0)
    + larguraDoRotulo(titulo, tamanhoDaFonte);
}

/**
 * A REGRA DA LINHA DE AÇÕES, escrita num lugar só: **dois botões dividem uma
 * linha só quando OS DOIS rótulos cabem inteiros, no tamanho de corpo.**
 *
 * Duas coisas que a regra não faz, e as duas são deliberadas:
 *
 * - Ela não conta com a redução de fonte do `Botao`. A redução é rede de
 *   segurança para o rótulo que estourou, e não licença para planejar uma linha
 *   que só funciona encolhida: dois botões lado a lado com o texto menor que o
 *   resto da tela é exatamente o "bagunçado" da reclamação.
 * - Ela não dá meia largura para um e uma largura e meia para o outro. Os dois
 *   levam `flex: 1`, então a pergunta é sempre sobre a METADE. Foi a assimetria
 *   (`flex: 2` contra `flex: 1`) que produziu o par de alturas diferentes na
 *   assinatura.
 *
 * Largura ainda não medida é zero, e zero empilha: uma linha que nasce em pé e
 * vira coluna mostra, por um quadro, dois rótulos partidos ao meio; uma coluna
 * que vira linha mostra, por um quadro, dois botões inteiros.
 */
export function cabemLadoALado(
  primeiro: MedidaDoBotao,
  segundo: MedidaDoBotao,
  larguraDisponivel: number,
): boolean {
  if (larguraDisponivel <= 0) return false;
  const metade = (larguraDisponivel - espaco.e2) / 2;
  return larguraNecessariaDoBotao(primeiro, fonte.corpo) <= metade
    && larguraNecessariaDoBotao(segundo, fonte.corpo) <= metade;
}

/**
 * O degrau em que o rótulo cabe, dado o espaço que o texto REALMENTE recebeu.
 *
 * Dois degraus e não uma escala contínua, e o argumento é o mesmo que
 * `tokens.ts` usa para recusar um 17 entre o 16 e o 18: hierarquia por escala
 * precisa que o degrau seja VISTO, e um tamanho intermediário inventado aqui
 * seria um número que não existe em lugar nenhum do produto.
 *
 * O piso é `corpoP` (14), que é `fonteMinimaDeInteracao`: o texto que se TOCA,
 * ou que nomeia o que se toca, não desce disso, e rótulo de botão é o texto que
 * mais se toca no aplicativo. Abaixo do piso não há terceiro degrau: o rótulo
 * que não couber nem em 14 é cortado com reticências, e continua inteiro para
 * quem ouve a tela.
 */
export function varianteQueCabe(
  titulo: string,
  larguraDisponivel: number,
): "corpo" | "corpoP" {
  if (larguraDisponivel <= 0) return "corpo";
  const precisa = larguraDoRotulo(titulo, fonte.corpo) * FOLGA_DA_REGUA;
  return precisa > larguraDisponivel ? "corpoP" : "corpo";
}

/* ========================================================================
   Botão
   ======================================================================== */

/**
 * OS CINCO TIPOS, e o que separa cada um, na letra de quem paga.
 *
 * "Você apagou o botão roxo que eu disse que tava bonito da aba de tarefas. Se
 * puder deixar os botões mais chamativos ao invés de só preto ou branco seria
 * bom: geralmente pessoas que trabalham nessa área não têm afinidade muito
 * grande com tecnologia."
 *
 * O diagnóstico por trás da frase era medido, e não de gosto: o aplicativo
 * tinha UM botão preenchido (o primário, que só pode aparecer uma vez por
 * tela) e 28 secundários desenhados com `tema.borda`, um fio de 1,30:1 sobre o
 * cartão. Entre os 28 estavam "Tirar foto" e "Capturar localização". Para quem
 * não decora interface, um retângulo com um fio que mal existe não parece
 * botão: parece texto.
 *
 * - `primario`: A ação que a tela quer que aconteça. Preenchido de destaque,
 *   com o único gradiente do aplicativo. Um por tela.
 * - `realce`: o ato importante que NÃO é a ação principal, mas faz o trabalho
 *   ANDAR (tirar a foto, capturar o GPS, adicionar o órgão, tentar de novo).
 *   Preenchido com o fundo suave de destaque, sem gradiente, e por isso lê
 *   como "faça isto" sem disputar com o primário. Pode haver mais de um por
 *   tela, mas um por cartão: dois realces lado a lado são dois convites ao
 *   mesmo tempo.
 * - `secundario`: desistir, voltar, fechar, recusar, corrigir. Contornado,
 *   com `bordaControle` (3:1), que é a mesma borda do campo de formulário.
 * - `discreto`: texto de destaque sem caixa, para o ato que é quase um link.
 * - `perigo`: o que apaga ou descarta. Preenchido de perigo, e pergunta antes.
 *
 * A régua para decidir entre realce e secundário é uma pergunta só: tocar aqui
 * faz o trabalho avançar, ou faz o agente sair de onde está? A primeira é
 * realce; a segunda é secundário.
 */
export type TipoDeBotao = "primario" | "realce" | "secundario" | "discreto" | "perigo";

type PropsBotao = {
  titulo: string;
  onPress: () => void;
  tipo?: TipoDeBotao;
  desabilitado?: boolean;
  carregando?: boolean;
  /** Descrição para leitor de tela, quando o título não bastar. */
  descricao?: string;
  /**
   * O desenho que acompanha o rótulo, à esquerda dele.
   *
   * Recebe a cor do texto do botão, como o `simbolo` do `Chip`, para não haver
   * uma segunda cópia do mapa de cores fora daqui. Ele ACOMPANHA a palavra e
   * nunca a substitui: quem usa este aplicativo o abre duas vezes por semana e
   * não decora pictograma.
   */
  icone?: (cor: string) => ReactNode;
  estilo?: StyleProp<ViewStyle>;
  /*
    Só para teste alcançar o botão pelo papel que ele exerce, e não pelo texto.

    Rótulo é conteúdo, e conteúdo muda: um teste que procura o botão por
    "Descartar esta coleta" reprova quando alguém reescreve a frase, e o defeito
    que ele guardava passa a ser reescrito junto com a frase sem ninguém notar.
  */
  testID?: string;
};

/*
  O `Pressable` animado existe porque o retorno do toque precisa TRANSICIONAR.

  Antes daqui o botão trocava a opacidade de 1 para 0,85 num quadro, sem
  transição nenhuma: o dedo encosta, a cor pula, o dedo sai, a cor pula de
  volta. `movimento.respostaAoToque` estava declarado em `tokens.ts` desde o
  primeiro dia e nunca tinha sido usado por ninguém.
*/
export const PressionavelAnimado = Animated.createAnimatedComponent(Pressable);

export function Botao({
  titulo, onPress, tipo = "primario", desabilitado, carregando, descricao, icone,
  estilo, testID,
}: PropsBotao) {
  const tema = useTema();
  const inativo = desabilitado || carregando;

  /*
    A MEDIDA É DO RÓTULO, e não do botão.

    Medir o botão e descontar o recuo parecia o caminho curto, e ele erra em
    todo botão que sobrescreve o recuo (o "Por que não aqui?" do perfil escreve
    `paddingHorizontal: 0`): a conta descontaria 32 pontos que não existem e o
    rótulo encolheria sem precisar. O invólucro do texto recebe exatamente o
    espaço que sobrou para o texto, seja ele decidido pelo pai ou pela própria
    palavra, e é essa a medida de que a decisão precisa.
  */
  const [larguraDoTexto, setLarguraDoTexto] = useState(0);

  /*
    O SECUNDÁRIO USA `bordaControle`, E NÃO `borda`, desde a frente dos botões.

    `borda` desenha cartão e separador, que são decoração. `bordaControle`
    existe desde que o campo de formulário reprovou nos 3:1 da WCAG 1.4.11, e
    o botão secundário, que é um controle tanto quanto o campo, continuou com o
    fio decorativo: era a ÚNICA peça de interação do aplicativo desenhada com
    ele. Medido, o fio dava 1,30:1 sobre o cartão, e é exatamente o que quem
    paga viu como "só preto ou branco": um botão cujo contorno não existe é um
    texto solto.

    O realce não tem borda porque o que o separa do secundário é o
    PREENCHIMENTO. Dois botões contornados, um violeta e um cinza, seriam o
    mesmo botão para quem não distingue as duas cores.
  */
  const cores = {
    primario: { fundo: tema.destaque, texto: tema.sobreDestaque, borda: "transparent" },
    realce: { fundo: tema.destaqueFundo, texto: tema.destaqueTexto, borda: "transparent" },
    secundario: { fundo: "transparent", texto: tema.texto, borda: tema.bordaControle },
    discreto: { fundo: "transparent", texto: tema.destaque, borda: "transparent" },
    perigo: { fundo: tema.perigoFundo, texto: tema.perigoTexto, borda: "transparent" },
  }[tipo];

  /*
    O retorno do dedo mora em `useRespostaAoToque`, e não mais aqui dentro.

    Ele nasceu neste botão, e enquanto morou aqui foi a ÚNICA peça do
    aplicativo com transição de toque: cartão de tarefa, "Abrir no mapa", a
    lista do que falta e o disparador da câmera continuavam pulando a opacidade
    num quadro só. Tirar daqui foi o que permitiu ligar os outros sem copiar
    quatro linhas cinco vezes.
  */
  const toqueVisual = useRespostaAoToque();

  const [inicioDoGradiente, fimDoGradiente] = gradienteDeDestaque(tema);
  /*
    Identificador único por botão. `useId` devolve algo com dois pontos no meio
    (`:r3:`), e dois pontos dentro de `url(#...)` não é nome válido de
    referência, então ele sai antes de virar `id`.
  */
  const idDoGradiente = `dc360Primario${useId().replace(/[^A-Za-z0-9]/g, "")}`;

  return (
    <PressionavelAnimado
      onPress={onPress}
      onPressIn={toqueVisual.aoEncostar}
      onPressOut={toqueVisual.aoSoltar}
      disabled={inativo}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={descricao ?? titulo}
      accessibilityState={{ disabled: Boolean(inativo), busy: Boolean(carregando) }}
      style={[
        {
          minHeight: toque,
          paddingHorizontal: espaco.e4,
          borderRadius: raio.normal,
          backgroundColor: cores.fundo,
          borderWidth: tipo === "secundario" ? borda.fio : 0,
          borderColor: cores.borda,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: espaco.e2,
          opacity: inativo ? opacidade.inativo : toqueVisual.opacidadeDoToque,
          transform: [{ scale: toqueVisual.escalaDoToque }],
        },
        estilo,
      ]}
    >
      {/*
        A roda dentro do botão só existe quando o botão é o ÚNICO lugar que
        conta aquele fato. Tela que já tem texto ou `RefreshControl` contando a
        mesma busca não deve passar `carregando`: três desenhos para um fato só
        foi defeito relatado, e o `testID` existe para o teste poder cobrar isso.
      */}
      {/*
        O GRADIENTE, e ele é o único do aplicativo.

        `CLAUDE.md` autoriza gradiente pontual entre dois tokens desde a emenda
        de 2026-08-20, e nunca no fundo de uma tela inteira. O botão primário é
        o lugar certo para o único que existe: ele é a ação que a tela quer que
        aconteça, aparece em todas as telas e em nenhuma aparece duas vezes
        seguidas, então o acabamento chega ao produto inteiro sem virar padrão
        de parede.

        **Ele é REFORÇO e não o fundo.** O `backgroundColor` chapado continua
        embaixo, com a mesma cor de sempre: se o desenho vetorial não subir por
        qualquer motivo, o botão continua sendo exatamente o botão que era. Um
        gradiente que fosse o único fundo transformaria uma falha de desenho
        num botão transparente com texto branco em cima.

        Os dois pontos saem de `gradienteDeDestaque`, que é a única forma de
        fazer um gradiente neste aplicativo, e por construção eles são tokens do
        tema. O `id` é único por instância porque `Defs` com nome repetido faz
        duas peças na mesma tela disputarem a mesma definição.
      */}
      {tipo === "primario" && (
        <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={idDoGradiente} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={inicioDoGradiente} />
              <Stop offset="1" stopColor={fimDoGradiente} />
            </LinearGradient>
          </Defs>
          {/*
            `rx` e não `overflow: hidden`: o Android não recorta filho por
            borda arredondada de forma confiável, e um retângulo reto por baixo
            de um botão arredondado aparece como quatro cantos violeta.
          */}
          <Rect x="0" y="0" width="100%" height="100%" rx={raio.normal} fill={`url(#${idDoGradiente})`} />
        </Svg>
      )}
      {carregando && <ActivityIndicator testID="botao-ocupado" color={cores.texto} />}
      {icone?.(cores.texto)}
      {/*
        O RÓTULO NÃO QUEBRA MAIS, e o invólucro é o que torna isso possível.

        `flexShrink: 1` é a linha que faz o texto CEDER quando o botão é
        estreito, em vez de empurrar a própria caixa e quebrar em duas linhas.
        Sem ela, o React Native mantém a largura natural do texto e o `Text`
        quebra: era esse o "btn com o texto quebrado dentro" do relato.

        Com o texto cedendo, `numeroDeLinhas={1}` corta com reticências em vez
        de crescer em altura, e a `accessibilityLabel` lá em cima continua com o
        rótulo INTEIRO, porque o que foi cortado foi o desenho e não o conteúdo.
      */}
      <View
        testID={testID ? `${testID}-rotulo` : undefined}
        onLayout={(e) => { setLarguraDoTexto(Math.round(e.nativeEvent.layout.width)); }}
        style={{ flexShrink: 1 }}
      >
        <Txt
          cor={cores.texto}
          peso={peso.negrito}
          variante={varianteQueCabe(titulo, larguraDoTexto)}
          numeroDeLinhas={1}
        >
          {titulo}
        </Txt>
      </View>
    </PressionavelAnimado>
  );
}

/* ========================================================================
   A linha de ações
   ======================================================================== */

/** Uma das duas ações da linha. É um `Botao`, dito como dado. */
export type AcaoDaLinha = {
  titulo: string;
  onPress: () => void;
  tipo?: PropsBotao["tipo"];
  icone?: (cor: string) => ReactNode;
  desabilitado?: boolean;
  carregando?: boolean;
  descricao?: string;
  testID?: string;
};

/**
 * DOIS BOTÕES QUE DIVIDEM UMA LINHA, ou empilham quando não cabem.
 *
 * Esta peça existe para acabar com TRÊS convenções que conviviam no produto
 * para a mesma coisa: `View` com `flex:1` em volta de cada botão (a minuta e o
 * cabeçalho da vistoria), `estilo={{flex:1}}` no próprio botão (a assinatura e
 * a fila), e `flex` escrito dentro de um `Tocavel` desenhado à mão ("Abrir no
 * mapa"). Três convenções é como um par de botões acabou com `flex: 2` contra
 * `flex: 1` e alturas diferentes, sem nada reclamar.
 *
 * **A regra mora em `cabemLadoALado`**, e ela é sobre os dois rótulos, não
 * sobre um. A largura chega por `onLayout`, porque a mesma dupla cabe num
 * aparelho de 6,9 polegadas e não cabe num de 5,4, e uma decisão escrita à mão
 * na tela só pode estar certa num dos dois.
 *
 * São exatamente DUAS ações, cobrado pelo tipo. Com uma não há o que decidir, e
 * três botões numa linha de aparelho não cabem em rótulo nenhum deste produto.
 */
export function LinhaDeAcoes({ acoes, testID }: {
  acoes: readonly [AcaoDaLinha, AcaoDaLinha];
  testID?: string;
}) {
  const [largura, setLargura] = useState(0);
  const emLinha = cabemLadoALado(
    { titulo: acoes[0].titulo, comIcone: Boolean(acoes[0].icone) },
    { titulo: acoes[1].titulo, comIcone: Boolean(acoes[1].icone) },
    largura,
  );

  return (
    <View
      testID={testID}
      onLayout={(e) => { setLargura(Math.round(e.nativeEvent.layout.width)); }}
      style={{
        flexDirection: emLinha ? "row" : "column",
        /*
          O mesmo vão nas duas direções, e um só. Empilhados, os dois continuam
          lendo como UM grupo de ações, e não como dois blocos que por acaso
          ficaram um embaixo do outro.
        */
        gap: espaco.e2,
      }}
    >
      {acoes.map((acao, indice) => (
        <Botao
          key={acao.testID ?? `${indice}-${acao.titulo}`}
          titulo={acao.titulo}
          onPress={acao.onPress}
          tipo={acao.tipo}
          icone={acao.icone}
          desabilitado={acao.desabilitado}
          carregando={acao.carregando}
          descricao={acao.descricao}
          testID={acao.testID}
          /*
            Empilhado, NENHUM estilo: a coluna já estica os dois à largura
            inteira, e é isso que faz as quatro bordas coincidirem. Botão
            empilhado com a largura da própria palavra é o desalinhamento que
            esta peça existe para acabar.
          */
          estilo={emLinha ? { flex: 1 } : undefined}
        />
      ))}
    </View>
  );
}

/* ========================================================================
   Superfícies
   ======================================================================== */

type PropsTocavel = {
  children: ReactNode;
  onPress: () => void;
  /**
   * O estilo de repouso, e ele é ESTÁTICO de propósito.
   *
   * Quem chama não escreve mais `({ pressed }) => ({ ..., opacity: pressed ? ...
   * : 1 })`. Era assim que o retorno do toque virava decisão de cada tela, e
   * foi assim que cinco lugares do aplicativo acabaram com um pulo de opacidade
   * sem transição enquanto o botão, ao lado, tinha a transição certa.
   */
  estilo?: StyleProp<ViewStyle>;
  desabilitado?: boolean;
  /**
   * Obrigatório, e não com valor padrão.
   *
   * Um padrão silencioso aqui resolveria a tela e cegaria o portão: quem lê a
   * fonte é `scripts/portao-acessibilidade-do-aplicativo.test.mjs`, e ele não
   * tem como saber que o componente preenche sozinho. Exigir no tipo é o que
   * mantém a varredura honesta, e é também o que obriga quem escreve uma opção
   * de checklist a dizer "radio" em vez de herdar "button".
   */
  accessibilityRole: "button" | "checkbox" | "radio" | "link";
  accessibilityLabel: string;
  accessibilityState?: { checked?: boolean; disabled?: boolean; selected?: boolean };
  testID?: string;
};

/**
 * Qualquer coisa tocável que NÃO é botão.
 *
 * Cartão de tarefa, linha de "falta isto", "Abrir no mapa", o `ⓘ`, o
 * disparador da câmera, a opção de um checklist: peças que respondem ao dedo e
 * que não têm a forma nem o rótulo de um `Botao`. Todas elas usavam
 * `Pressable` cru com a opacidade decidida na hora, e o resultado era um
 * aplicativo em que o botão respondia com transição e o cartão ao lado
 * respondia com um pulo.
 *
 * O que esta peça acrescenta é exatamente o `useRespostaAoToque` e mais nada:
 * ela não desenha, não escolhe cor e não impõe altura. Desenho continua sendo
 * decisão da tela, porque um cartão de lista e um disparador redondo de câmera
 * não têm nada em comum além de responder ao dedo.
 *
 * `accessibilityLabel` e `accessibilityRole` são obrigatórios aqui, e não
 * opcionais como no `Pressable`: o portão de acessibilidade do aplicativo já
 * cobra os dois de todo tocável, e um tipo que permite esquecer é um tipo que
 * deixa o portão ser o primeiro a lembrar, depois de o código já estar escrito.
 */
export function Tocavel({
  children, onPress, estilo, desabilitado,
  accessibilityRole, accessibilityLabel, accessibilityState, testID,
}: PropsTocavel) {
  const toqueVisual = useRespostaAoToque();

  return (
    <PressionavelAnimado
      onPress={onPress}
      onPressIn={toqueVisual.aoEncostar}
      onPressOut={toqueVisual.aoSoltar}
      disabled={desabilitado}
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(desabilitado), ...accessibilityState }}
      style={[
        estilo,
        {
          /*
            O desabilitado NÃO anima e fica no mesmo lugar: ele já está dizendo
            "não toque" pela opacidade de repouso, e uma peça inerte que encolhe
            sob o dedo estaria prometendo um efeito que não vem.
          */
          opacity: desabilitado ? opacidade.inativo : toqueVisual.opacidadeDoToque,
          transform: [{ scale: desabilitado ? 1 : toqueVisual.escalaDoToque }],
        },
      ]}
    >
      {children}
    </PressionavelAnimado>
  );
}

/**
 * O cartão, que na 2.0 é um OBJETO e não um retângulo com borda.
 *
 * `nivel` é novo e opcional, e é a folga que `CLAUDE.md` autoriza desde a
 * emenda de 2026-08-20 e que este aplicativo nunca usou: elevação com mais
 * liberdade em cartão de destaque e em momento de confirmação, mesmo fora de
 * modal, desde que seja deliberado e consistente entre telas. O "consistente
 * entre telas" é a parte que mora aqui: quem quiser destacar um cartão pede o
 * nível, e não escreve uma sombra própria.
 *
 * O padrão continua sendo `cartao`, e o destaque continua sendo escasso pela
 * mesma aritmética da régua de densidade: três cartões flutuando na mesma tela
 * são três cartões que não flutuam.
 *
 * `folha` não entra na união de propósito. Ele é o topo da escala, e existe
 * para o que cobre a tela e pede decisão; um cartão que se declarasse folha
 * seria um cartão com a elevação de um diálogo, e a frase "se tudo pode ser o
 * mais alto, nada é" deixaria de valer no primeiro uso.
 */
export function Cartao({ titulo, nivel = "cartao", children }: {
  titulo?: string;
  nivel?: "cartao" | "flutuante";
  children: ReactNode;
}) {
  const tema = useTema();
  return (
    <View
      style={{
        // Fundo, contorno e sombra saem juntos do token, e é o token que sabe
        // que a sombra preta do tema escuro precisa de superfície clareando
        // junto para a peça existir.
        ...elevacao(tema)[nivel],
        borderRadius: raio.cartao,
        padding: espaco.e4,
        gap: espaco.e3,
      }}
    >
      {titulo && <Txt nivel="titulo">{titulo}</Txt>}
      {children}
    </View>
  );
}

/**
 * O NÚMERO GRANDE COM RÓTULO DISCRETO, que é a H2 virada peça.
 *
 * `CLAUDE.md` pede esta figura desde o primeiro dia ("números grandes com
 * rótulos discretos no painel"), e o aplicativo nunca a teve: todo indicador
 * dele saiu, até hoje, como duas linhas de texto do mesmo tamanho, uma em cima
 * da outra. Duas linhas iguais não são hierarquia, são uma lista de dois itens.
 *
 * Ela é um componente, e não um par de `Txt` que cada tela monta, por causa da
 * distância entre os dois: ela é a menor da peça (`espaco.e1`), porque
 * proximidade é o que diz que o rótulo pertence ao número e não ao bloco de
 * cima. Deixar isso no ponto de uso é como nascem cinco indicadores com cinco
 * distâncias, que é literalmente a história que `regua.ts` conta.
 *
 * **O número sai em fonte tabular por padrão**, e isso não é estética: os
 * números deste produto são protocolo, contagem e prazo, e são ditados por
 * rádio e por telefone. Em tipo proporcional o zero se parece com a letra o, e
 * o 1 com o l. O aplicativo já pagou por isso uma vez, quando o protocolo saía
 * dentro de uma frase na fonte do corpo.
 *
 * Para o leitor de tela o par é UM elemento com uma frase: "12, tarefas para
 * hoje". Lidos separados, o número vira um número solto no meio da tela e o
 * rótulo vira uma palavra sem sujeito.
 */
export function Dado({ valor, rotulo, cor, mono = true, testID }: {
  valor: string;
  rotulo: string;
  /** Sai do tema, como sempre. Sem cor, o número é `texto` e o rótulo é discreto. */
  cor?: string;
  /** Desligue só quando o "valor" não for número (uma palavra, um nome). */
  mono?: boolean;
  testID?: string;
}) {
  const desenhado = useContagemQueSobe(valor);
  return (
    <View
      testID={testID}
      accessible
      /*
        O rótulo lê o valor FINAL, sempre, mesmo enquanto o número desenhado
        ainda está subindo. Quem ouve a tela não vê a contagem e não deve
        ouvi-la: "7, vistorias para fazer" anunciado no meio da subida seria
        uma informação errada dita com a voz da certeza.
      */
      accessibilityLabel={`${valor}, ${rotulo}`}
      style={{ gap: espaco.e1 }}
    >
      <Txt nivel="numero" mono={mono} cor={cor}>{desenhado}</Txt>
      <Txt nivel="rotulo">{rotulo}</Txt>
    </View>
  );
}

/**
 * O que é CONTAGEM, e portanto sobe: um inteiro, sem zero à esquerda.
 *
 * "000123" é protocolo e "5 de 7" é fração, e nenhum dos dois sobe. Um
 * protocolo contando de zero é, por 260 ms, um protocolo ERRADO na tela, e o
 * dígito deste produto é ditado por rádio e por telefone: a pessoa do outro
 * lado pode anotar o que viu no meio da subida. Contagem não tem esse risco,
 * porque ninguém dita "12 vistorias" antes de o número parar.
 */
const CONTAGEM = /^(?:0|[1-9]\d*)$/;

/**
 * A CONTAGEM QUE SOBE, na primeira pintura e em mais nenhuma.
 *
 * O `Dado` é o protagonista de quatro telas e nascia parado. A subida é a
 * micro-interação com propósito que `CLAUDE.md` pede: ela leva o olho ao
 * número, que é onde a hierarquia quer que a leitura comece.
 *
 * ## A escolha do mecanismo, e as duas que foram recusadas
 *
 * Texto NÃO anima no driver nativo: o que muda é o conteúdo do `Text`, e não
 * uma propriedade de estilo que a thread de interface saiba interpolar. Então
 * o valor roda em JavaScript de qualquer jeito, e a pergunta é só como ele
 * chega ao desenho.
 *
 * - `Animated.Value` com `addListener` espelhando no ESTADO é o que está aqui.
 *   A duração e a curva passam pelo MESMO `Animated.timing` que toda outra
 *   peça do aplicativo usa, com `movimento.mudancaDeEstado` e
 *   `easing.entrada` lidos dos tokens. Não há uma segunda implementação de
 *   curva de Bézier neste arquivo, e o portão de design lê `duration:` daqui
 *   como lê de qualquer outro lugar. Custa uma renderização por quadro durante
 *   260 ms, para um texto de dois dígitos: é nada.
 * - `setNativeProps` foi recusado porque `Text` não recebe conteúdo por ele
 *   (só `TextInput` aceita `text`), e porque passaria por cima do `Txt`, que
 *   é o único lugar do produto que resolve a família de fonte.
 * - `requestAnimationFrame` com a curva calculada à mão foi recusado porque
 *   seria a segunda forma de animar no aplicativo, com o próprio relógio e a
 *   própria curva, fora do vocabulário que `useRespostaAoToque` e
 *   `ItemDeLista` já compartilham.
 *
 * ## Só na primeira pintura
 *
 * O alvo é lido UMA vez, na montagem, e guardado. Um valor que muda depois (a
 * lista recarregou de 3 para 5) aparece direto, sem contar de novo: um número
 * que rola a cada atualização vira ruído, e o agente para de acreditar no que
 * está lendo. Se o valor mudar NO MEIO da subida, a subida para e o novo valor
 * entra na hora, pelo mesmo motivo.
 *
 * ## Redução de movimento
 *
 * Com a chave ligada o número nasce pronto. E a chave chega sempre DEPOIS do
 * primeiro quadro (`useReducaoDeMovimento` começa em `false` e só sabe a
 * resposta quando a promessa do sistema volta), então há um segundo efeito
 * que para a contagem no meio e fixa no alvo, como `ItemDeLista` faz com a
 * entrada. Sem ele, quem pediu menos movimento receberia a animação inteira.
 */
function useContagemQueSobe(valor: string): string {
  const reduzirMovimento = useReducaoDeMovimento();

  /*
    Lidos uma vez e guardados, pelo mesmo motivo de `ItemDeLista`: a decisão
    de animar precisa estar certa no PRIMEIRO quadro, e não num efeito. Nascer
    em 12, cair para 0 e subir de novo é um piscar, que é pior que não animar.
  */
  const alvoInicial = useRef(valor).current;
  const alvo = useRef(Number(alvoInicial)).current;
  const animar = useRef(CONTAGEM.test(alvoInicial) && alvo > 0 && !reduzirMovimento).current;

  const progresso = useRef(new Animated.Value(animar ? 0 : 1)).current;
  const [desenhado, setDesenhado] = useState(animar ? "0" : alvoInicial);
  const [terminou, setTerminou] = useState(!animar);

  useEffect(() => {
    if (!animar) return;
    const ouvinte = progresso.addListener(({ value }) => {
      setDesenhado(String(Math.round(value * alvo)));
    });
    Animated.timing(progresso, {
      toValue: 1,
      duration: movimento.mudancaDeEstado,
      easing: Easing.bezier(...easing.entrada),
      /* Texto não tem como ser interpolado na thread de interface. */
      useNativeDriver: false,
    }).start(({ finished }) => { if (finished) setTerminou(true); });
    return () => {
      progresso.removeListener(ouvinte);
      progresso.stopAnimation();
    };
  }, [animar, alvo, progresso]);

  /* A chave do sistema chegando atrasada, que é como ela sempre chega. */
  useEffect(() => {
    if (!animar || !reduzirMovimento) return;
    progresso.stopAnimation();
    progresso.setValue(1);
    setTerminou(true);
  }, [animar, reduzirMovimento, progresso]);

  /* O valor que mudou no meio da subida interrompe a subida. */
  const mudou = valor !== alvoInicial;
  useEffect(() => {
    if (!animar || !mudou) return;
    progresso.stopAnimation();
    setTerminou(true);
  }, [animar, mudou, progresso]);

  return terminou || mudou ? valor : desenhado;
}

/**
 * O aviso, com quatro gravidades que precisam PARECER quatro.
 *
 * Duas coisas mudaram aqui, e a primeira era um defeito e não uma falta.
 *
 * **Alerta e perigo usavam o mesmo `!`.** O que separava um do outro era a cor
 * de fundo, e só ela, seis linhas abaixo da regra deste arquivo que proíbe
 * exatamente isso. Para quem não distingue vermelho de âmbar (e para qualquer
 * um com sol batendo na tela, que é a situação normal deste aplicativo) as
 * duas caixas eram a mesma caixa. Agora o perigo é `×`: forma fechada contra a
 * forma vertical do `!`, distinguível de relance e sem depender de cor. Os
 * dois sinais ficam na faixa Latin-1, que é o pedaço da Work Sans que
 * garantidamente existe, então nenhum deles vira quadrado vazio no aparelho.
 *
 * **E o sinal ganhou nome para quem ouve.** Leitor de tela lia "exclamação" ou
 * nada; agora ele lê "Perigo", "Atenção", "Informação" ou "Concluído" antes do
 * texto. O sinal desenhado e a palavra falada dizem a mesma coisa, que é o que
 * "nunca só por cor" quer dizer nas duas pontas.
 *
 * `titulo` e `acao` são NOVOS e OPCIONAIS. São 25 avisos espalhados pelo
 * aplicativo, de quatro gravidades, todos com o mesmo tamanho, a mesma forma e
 * o mesmo peso; sem título, o de perigo tem a mesma altura visual do de
 * informação. Quem migra decide um a um, e nenhuma chamada existente muda.
 */
const SINAL_DO_AVISO = {
  info: { simbolo: "i", nome: "Informação" },
  sucesso: { simbolo: "✓", nome: "Concluído" },
  alerta: { simbolo: "!", nome: "Atenção" },
  perigo: { simbolo: "×", nome: "Perigo" },
} as const;

export function Aviso({ tom, titulo, acao, peso: pesoPedido = "forte", children }: {
  tom: "info" | "sucesso" | "alerta" | "perigo";
  /** A frase curta que diz o que houve, acima do texto. */
  titulo?: string;
  /**
   * O que dá para fazer a respeito, quando houver algo a fazer.
   *
   * `tipo` é opcional e o padrão é `secundario`, e o padrão é deliberado: o
   * aviso já carrega a cor do tom no fundo ou no filete, e um bloco violeta
   * dentro de um bloco âmbar seriam duas cores disputando a mesma caixa. O
   * componente não sabe se o ato faz o trabalho andar ("Revisar o laudo
   * agora") ou faz o aviso sair ("Fechar"); quem sabe é quem chama, e sobe
   * para `realce` uma chamada de cada vez.
   */
  acao?: {
    titulo: string;
    onPress: () => void;
    tipo?: Extract<TipoDeBotao, "secundario" | "realce">;
    descricao?: string;
    testID?: string;
  };
  /**
   * Quanto peso este aviso tem direito a ocupar. Ver `ui/regua.ts`.
   *
   * O padrão continua `forte` para nenhuma das 25 chamadas existentes mudar de
   * desenho sozinha. Quem migra decide uma a uma: numa peça que já tem um
   * bloco preenchido mais grave, o aviso desce para leve (R1 e R2).
   *
   * Todo aviso de `sucesso` desce sozinho, peça quem pedir o que pedir: é a R3
   * da régua, e ela mora em `pesoEfetivo` justamente para não depender de cada
   * tela lembrar dela.
   */
  peso?: PesoVisual;
  children: ReactNode;
}) {
  const tema = useTema();
  const cores = {
    info: { fundo: tema.superficie2, texto: tema.texto },
    sucesso: { fundo: tema.okFundo, texto: tema.okTexto },
    alerta: { fundo: tema.alertaFundo, texto: tema.alertaTexto },
    perigo: { fundo: tema.perigoFundo, texto: tema.perigoTexto },
  }[tom];
  const sinal = SINAL_DO_AVISO[tom];
  const desenho = pesoEfetivo(tom, pesoPedido);

  return (
    <View
      accessibilityRole={tom === "perigo" ? "alert" : "text"}
      style={{
        /*
          Em peso leve o aviso troca o retângulo de cor por um FILETE lateral.

          Sem nada no lugar do fundo, um aviso leve e um parágrafo comum seriam
          a mesma coisa, e a peça deixaria de existir como peça: o olho não
          teria onde começar a ler. O filete dá o começo sem acender a área
          inteira, e ele usa `borda.marca`, que é justamente o token que o
          `tokens.ts` descreve como "a faixa lateral que classifica um cartão".

          A cor do tom fica no filete, no sinal e no título. O CORPO sai na cor
          normal do texto, e essa é a metade da correção que importa: parágrafo
          inteiro colorido é literalmente a reclamação que abriu esta frente
          ("textos coloridos pra todo lado"), e ele ainda custa contraste, já
          que toda cor de tom é mais fraca que a cor de texto do tema.
        */
        backgroundColor: desenho === "forte" ? cores.fundo : "transparent",
        borderRadius: raio.normal,
        borderLeftWidth: desenho === "forte" ? 0 : borda.marca,
        borderLeftColor: cores.texto,
        padding: espaco.e3,
        /*
          O AVISO PASSA A SER UMA COLUNA, e a linha com o sinal é só o primeiro
          andar dela.

          Enquanto o aviso inteiro era uma linha, a ação não tinha onde ficar a
          não ser dentro da coluna de texto, que começa depois do sinal de
          largura fixa mais o `gap`. O botão nascia 32 pontos para dentro de
          tudo, e era esse o "torto" do relato: ele não se alinhava com a borda
          do aviso, nem com a do cartão, nem com a da tela.
        */
        gap: espaco.e3,
      }}
    >
      <View style={{ flexDirection: "row", gap: espaco.e3, alignItems: "flex-start" }}>
      {/* O sinal é o "nunca só por cor": sem ele, alerta e perigo seriam a
          mesma caixa para quem não distingue as duas cores. O rótulo de
          acessibilidade diz a gravidade em palavra, porque o desenho do
          caractere não chega a quem usa leitor de tela. */}
      {/*
        O sinal e o texto saem pelo `Txt`, e não por um `<Text>` cru.

        Enquanto foram `<Text>` crus, os dois ficaram DE FORA da família de
        fonte do produto: quem resolve a família é o `Txt`, chamando
        `familiaDoTexto`, e o React Native cai na fonte do sistema sem erro e
        sem aviso. O `Aviso` aparece 25 vezes no aplicativo, então o cartão
        saía em Work Sans e o aviso dentro dele em San Francisco, na mesma tela
        e a poucos pontos de distância. Era o defeito que a tipografia foi
        embarcada para corrigir, sobrevivendo dentro da peça que mais aparece.

        A largura fixa que o sinal precisa (para o texto de todos os avisos da
        tela começar na mesma coluna, independentemente da largura do
        caractere) passou para o invólucro, que é onde ela deveria ter estado:
        quem alinha é a caixa, não a letra.
      */}
      <View
        accessible
        accessibilityLabel={sinal.nome}
        style={{ width: tamanhoDeIcone.rotulo }}
      >
        <Txt variante="corpo" peso={peso.negrito} cor={cores.texto} alinhamento="center">
          {sinal.simbolo}
        </Txt>
      </View>
      <View style={{ flex: 1, gap: espaco.e2 }}>
        {titulo && (
          <Txt variante="corpoP" peso={peso.negrito} cor={cores.texto}>{titulo}</Txt>
        )}
        <Txt variante="corpoP" cor={desenho === "forte" ? cores.texto : undefined}>
          {children}
        </Txt>
      </View>
      </View>
      {acao && (
        /*
          A ação continua DENTRO do aviso, e agora ocupa a largura dele.

          Continuar dentro é a decisão antiga e ela não mudou: o aviso diz o que
          houve, e separar o que fazer a respeito foi o que produziu, em mais de
          uma tela deste aplicativo, um parágrafo de explicação no lugar onde
          deveria estar um botão.

          O que mudou é o alinhamento, e ele deixou de ser decisão desta peça.
          Sem `alignSelf` e sem recuo próprio, o botão encosta nas duas bordas
          internas do aviso e passa a ser desenhado como todo outro botão do
          produto ("Tirar foto", "Capturar localização", "Revisar e concluir",
          os dois do `Dialogo`): largura inteira do que o contém. O botão que
          encolhia até a própria palavra era o ÚNICO deste formato no aplicativo,
          e era por isso que ele parecia solto na tela.
        */
        <Botao
          titulo={acao.titulo}
          onPress={acao.onPress}
          descricao={acao.descricao}
          testID={acao.testID}
          tipo={acao.tipo ?? "secundario"}
        />
      )}
    </View>
  );
}

/*
  `Selo` e `SeloSeveridade` moravam aqui, e saíram.

  `Selo` era a pílula anterior ao `Chip`: recebia `fundo` e `cor` decididos
  dentro da tela, desenhava com um `<Text>` cru (ou seja, fora do `Txt`, então
  sem a família de fonte do produto) e escrevia em `fonte.legenda`, que é 12,
  dois pontos abaixo do `fonteMinimaDeInteracao` declarado neste mesmo arquivo. Duas
  frentes desta onda pararam de usá-lo por causa disso, cada uma à sua maneira,
  e nenhuma o aposentou: ele sobreviveu no único lugar em que ainda era chamado,
  que era também o pior, a marca de gravidade da ocorrência.

  `SeloSeveridade` foi reescrito em cima do `Chip` e mora em `ui/Chip.tsx`, com
  a razão inteira escrita lá. Peça sem uso e ainda exportada é peça que a
  próxima tela usa, porque quem escreve procura "selo" no autocompletar e acha.
*/

/**
 * O estado vazio, que na maioria das vezes é uma RESPOSTA e não uma ausência.
 *
 * Os quatro estados vazios do aplicativo eram idênticos: título e uma frase
 * cinza. O da fila é o exemplo que dói, porque ele responde a pergunta que o
 * agente faz depois de descer o morro ("o meu trabalho chegou?"), e respondia
 * em cinza claro, sem marca nenhuma, do mesmo jeito que "nenhuma tarefa
 * encontrada com esse filtro".
 *
 * `icone` e `acao` são NOVOS e OPCIONAIS, e nenhuma chamada existente muda.
 * O ícone entra como nó e não como nome porque o conjunto de ícones é de outra
 * frente: esta peça precisa aceitar o que vier, e aceitar nada.
 */
export function Vazio({ titulo, descricao, icone, acao }: {
  titulo: string;
  descricao?: string;
  /** O desenho que diz de que vazio se trata, dentro do círculo. */
  icone?: ReactNode;
  /** A saída, quando existe uma. Vazio sem saída é beco. */
  acao?: { titulo: string; onPress: () => void; descricao?: string; testID?: string };
}) {
  const tema = useTema();
  return (
    <View style={{ padding: espaco.e6, gap: espaco.e3, alignItems: "center" }}>
      {icone && (
        <View
          // O ícone é decoração de um bloco que já tem título e descrição em
          // texto: anunciá-lo de novo só faria o leitor de tela repetir.
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: tamanhoDeIcone.vazio + espaco.e4,
            height: tamanhoDeIcone.vazio + espaco.e4,
            borderRadius: raio.pilula,
            backgroundColor: tema.superficie2,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icone}
        </View>
      )}
      <Txt variante="h3" alinhamento="center">{titulo}</Txt>
      {descricao && <Txt variante="corpoP" discreto alinhamento="center">{descricao}</Txt>}
      {acao && (
        <Botao
          titulo={acao.titulo}
          onPress={acao.onPress}
          descricao={acao.descricao}
          testID={acao.testID}
          estilo={{ marginTop: espaco.e2 }}
        />
      )}
    </View>
  );
}

/**
 * Depois de quanto tempo a espera deixa de ser normal e precisa se explicar.
 *
 * Seis segundos, e não dez ou trinta: é o tempo em que alguém em pé, na rua,
 * ainda aceita olhar para uma tela parada sem concluir que o aplicativo travou.
 */
export const DEMORA_MS = 6_000;

/**
 * A espera, com hora marcada para deixar de ser silenciosa.
 *
 * O defeito que este componente passou a evitar veio do campo com estas
 * palavras: "fica um spinner roxo estático pendurado no topo da tela para
 * sempre". A causa não era o desenho girar ou não; era a espera não ter fim
 * declarado. Primeira abertura da tela, sem cópia gravada no aparelho, com
 * sinal fraco: a busca ficava pendurada no tempo limite da rede e a tela
 * ficava exatamente assim, sem segunda linha e sem porta de saída. O que o
 * agente faz nessa situação é matar o aplicativo, e matar o aplicativo no meio
 * do plantão é o único jeito de perder coleta neste produto.
 *
 * Por isso três coisas, e cada uma corrige uma parte do relato:
 *
 * 1. **Aos seis segundos a espera admite que está demorando.** Sem essa linha,
 *    o agente não tem como distinguir "está vindo" de "travou".
 * 2. **Junto com a linha vem uma saída.** Espera sem saída é o que faz alguém
 *    fechar o aplicativo à força. Aqui a saída é sempre visível a partir dos
 *    seis segundos, mesmo quando a tela que chamou não passou nada para fazer.
 * 3. **O temporizador é limpo no desmonte.** Sem isso, sair da aba antes dos
 *    seis segundos deixa um `setTimeout` vivo escrevendo estado em componente
 *    desmontado. É ruído que não quebra nada visível e, exatamente por isso,
 *    esconde defeito de verdade no meio dos avisos.
 *
 * O papel de acessibilidade é `progressbar` com rótulo em português: para quem
 * usa leitor de tela, a roda girando não existe, e sem rótulo a tela inteira é
 * silêncio.
 *
 * ## POR QUE ISTO NÃO VIROU ESQUELETO DE CARREGAMENTO
 *
 * A frente de movimento tinha o esqueleto na lista de tarefas e na fila como
 * opção declarada, e a decisão foi NÃO trocar. Quatro razões, e as quatro são
 * deste aplicativo e não de gosto:
 *
 * 1. **A espera daqui é leitura de DISCO, não de rede.** Num aparelho saudável
 *    ela dura dezenas de milissegundos: o esqueleto piscaria e sumiria, e um
 *    desenho que aparece e some sem o agente conseguir ler nada é ruído que ele
 *    lê como "a tela bugou".
 * 2. **Quando ela demora, é porque quebrou.** E aí o que resolve é a SAÍDA, não
 *    uma forma bonita. Esqueleto não tem porta: ele pulsa para sempre, com o
 *    agente em pé no morro achando que está quase.
 * 3. **A lista pode legitimamente estar VAZIA.** Três cartões falsos seguidos
 *    de "Nenhuma vistoria designada" é o aplicativo prometendo trabalho que não
 *    existe a quem está decidindo se sobe o morro.
 * 4. **Trocar esqueleto por conteúdo muda alturas**, que é exatamente o que a
 *    frente da lista de tarefas passou um turno inteiro eliminando (ver a
 *    âncora da `FlatList` em `(agente)/index.tsx`).
 *
 * O que sustenta esta decisão é o item 2, e por isso ele virou portão: há um
 * caso em `scripts/portao-design-do-aplicativo.test.mjs` que REPROVA qualquer
 * `Carregando` de tela cheia sem `aoDesistir`. No dia em que alguém escrever um
 * sem saída, o argumento contra o esqueleto deixaria de ser verdade em
 * silêncio, e é isso que o portão impede.
 */
export function Carregando({ mensagem, aoDesistir, rotuloDaSaida = "Parar de esperar" }: {
  mensagem?: string;
  /**
   * O que a tela que chamou faz quando o agente desiste de esperar. Opcional:
   * sem isso a espera some do mesmo jeito, só sem ninguém mais ser avisado.
   */
  aoDesistir?: () => void;
  rotuloDaSaida?: string;
}) {
  const tema = useTema();
  const reduzirMovimento = useReducaoDeMovimento();
  const [demorou, setDemorou] = useState(false);
  const [desistiu, setDesistiu] = useState(false);

  useEffect(() => {
    const relogio = setTimeout(() => setDemorou(true), DEMORA_MS);
    return () => { clearTimeout(relogio); };
  }, []);

  if (desistiu) {
    return (
      <View
        accessibilityRole="text"
        accessibilityLiveRegion="polite"
        style={{ padding: espaco.e6, gap: espaco.e2, alignItems: "center" }}
      >
        <Txt variante="corpoP" alinhamento="center">Você parou a espera.</Txt>
        <Txt variante="legenda" discreto alinhamento="center">
          O que já estava guardado no aparelho continua lá. Tente de novo quando
          o sinal melhorar.
        </Txt>
      </View>
    );
  }

  const base = mensagem ?? "Carregando";

  return (
    <View
      testID="espera"
      accessibilityRole="progressbar"
      // O leitor de tela anuncia o rótulo, e é ele que precisa mudar quando a
      // espera passa dos seis segundos: quem não vê a segunda linha teria, sem
      // isto, a mesma tela silenciosa de antes.
      accessibilityLabel={demorou ? `${base}. Está demorando mais que o normal.` : base}
      accessibilityState={{ busy: true }}
      accessibilityLiveRegion="polite"
      style={{ padding: espaco.e6, gap: espaco.e3, alignItems: "center" }}
    >
      {reduzirMovimento ? (
        // Com redução de movimento ligada, a roda girando é justamente o que a
        // pessoa pediu para não ver. A barra parada ocupa o mesmo lugar, e quem
        // diz o que está acontecendo é o texto abaixo, não o desenho.
        <View
          testID="espera-sem-movimento"
          style={{
            width: espaco.e7, height: espaco.e2,
            borderRadius: raio.pilula, backgroundColor: tema.destaque,
          }}
        />
      ) : (
        <ActivityIndicator testID="espera-girando" size="large" color={tema.destaque} />
      )}

      {mensagem && <Txt variante="corpoP" discreto alinhamento="center">{mensagem}</Txt>}

      {demorou && (
        <View style={{ gap: espaco.e3, alignItems: "center" }}>
          <Txt variante="corpoP" alinhamento="center">Está demorando mais que o normal.</Txt>
          <Txt variante="legenda" discreto alinhamento="center">
            Pode ser o sinal daqui. Você não precisa ficar esperando: o que já
            está no aparelho continua guardado.
          </Txt>
          <Botao
            titulo={rotuloDaSaida}
            tipo="secundario"
            onPress={() => { setDesistiu(true); aoDesistir?.(); }}
          />
        </View>
      )}
    </View>
  );
}

export function Separador() {
  const tema = useTema();
  return <View style={{ height: borda.fio, backgroundColor: tema.borda }} />;
}

export const estilos = StyleSheet.create({
  tela: { flex: 1 },
  conteudo: { padding: espaco.e4, gap: espaco.e4 },
  linha: { flexDirection: "row", alignItems: "center", gap: espaco.e3 },
});
