import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from "react";
import {
  ActivityIndicator, Animated, Pressable, StyleSheet, Text, View, useColorScheme,
  type StyleProp, type ViewStyle,
} from "react-native";
import {
  borda, easing, elevacao, espaco, fonte, icone as tamanhoDeIcone, linha, movimento,
  opacidade, peso, raio, temaClaro, temaEscuro, toque, type Peso, type Tema,
} from "./tokens";
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
  children, variante = "corpo", discreto, cor, negrito, peso: pesoPedido, mono,
  alinhamento, numeroDeLinhas,
}: PropsTexto) {
  const tema = useTema();
  const fontes = useFontes();
  const tamanho = {
    display: fonte.display, h1: fonte.h1, h2: fonte.h2, h3: fonte.h3,
    corpo: fonte.corpo, corpoP: fonte.corpoP, legenda: fonte.legenda,
  }[variante];
  const altura = {
    display: linha.display, h1: linha.h1, h2: linha.h2, h3: linha.h3,
    corpo: linha.corpo, corpoP: linha.corpoP, legenda: linha.legenda,
  }[variante];
  const pesoFinal: Peso = pesoPedido
    ?? (negrito || variante.startsWith("h") || variante === "display" ? peso.negrito : peso.normal);

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
        color: cor ?? (discreto ? tema.textoDiscreto : tema.texto),
        textAlign: alinhamento,
      }}
    >
      {children}
    </Text>
  );
}

/* ========================================================================
   Botão
   ======================================================================== */

type PropsBotao = {
  titulo: string;
  onPress: () => void;
  tipo?: "primario" | "secundario" | "discreto" | "perigo";
  desabilitado?: boolean;
  carregando?: boolean;
  /** Descrição para leitor de tela, quando o título não bastar. */
  descricao?: string;
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
  titulo, onPress, tipo = "primario", desabilitado, carregando, descricao, estilo, testID,
}: PropsBotao) {
  const tema = useTema();
  const inativo = desabilitado || carregando;

  const cores = {
    primario: { fundo: tema.destaque, texto: tema.sobreDestaque, borda: "transparent" },
    secundario: { fundo: "transparent", texto: tema.texto, borda: tema.borda },
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
      {carregando && <ActivityIndicator testID="botao-ocupado" color={cores.texto} />}
      <Txt cor={cores.texto} peso={peso.negrito}>{titulo}</Txt>
    </PressionavelAnimado>
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

export function Cartao({ titulo, children }: { titulo?: string; children: ReactNode }) {
  const tema = useTema();
  return (
    <View
      style={{
        // Fundo, contorno e sombra saem juntos do token, e é o token que sabe
        // que a sombra preta do tema escuro precisa de superfície clareando
        // junto para a peça existir.
        ...elevacao(tema).cartao,
        borderRadius: raio.cartao,
        padding: espaco.e4,
        gap: espaco.e3,
      }}
    >
      {titulo && <Txt variante="h3">{titulo}</Txt>}
      {children}
    </View>
  );
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
  /** O que dá para fazer a respeito, quando houver algo a fazer. */
  acao?: { titulo: string; onPress: () => void; descricao?: string; testID?: string };
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
        flexDirection: "row",
        gap: espaco.e3,
        alignItems: "flex-start",
      }}
    >
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
        {acao && (
          /*
            A ação fica DENTRO do aviso, e não numa linha solta embaixo dele.
            O aviso diz o que houve; separar o que fazer a respeito foi o que
            produziu, em mais de uma tela deste aplicativo, um parágrafo de
            explicação no lugar onde deveria estar um botão.
          */
          <Botao
            titulo={acao.titulo}
            onPress={acao.onPress}
            descricao={acao.descricao}
            testID={acao.testID}
            tipo="secundario"
            estilo={{ alignSelf: "flex-start", paddingHorizontal: espaco.e3 }}
          />
        )}
      </View>
    </View>
  );
}

/*
  `Selo` e `SeloSeveridade` moravam aqui, e saíram.

  `Selo` era a pílula anterior ao `Chip`: recebia `fundo` e `cor` decididos
  dentro da tela, desenhava com um `<Text>` cru (ou seja, fora do `Txt`, então
  sem a família de fonte do produto) e escrevia em `fonte.legenda`, que é 12,
  dois pontos abaixo do `fonteMinima` declarado neste mesmo arquivo. Duas
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
