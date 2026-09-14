import { useRef, useState, type ReactNode } from "react";
import {
  Animated, Easing, TextInput, View,
  type StyleProp, type TextStyle, type ViewStyle,
} from "react-native";

import { Txt, useTema } from "./componentes";
import {
  borda, easing, espaco, foco, fonte, linha, movimento, opacidade, peso, raio, toque,
} from "./tokens";
import { useReducaoDeMovimento } from "./useReducaoDeMovimento";

/**
 * Rótulo, controle, erro e texto de apoio, amarrados uma vez só.
 *
 * Esta peça não existia, e a ausência dela tinha duas consequências medidas.
 *
 * **A primeira é cópia.** As MESMAS oito propriedades de estilo estavam
 * escritas à mão em `entrar.tsx` e em `vistoria/[id].tsx`, e há sete
 * `TextInput` crus no aplicativo. Estilo copiado não é feio, é frágil: o dia em
 * que o raio da caixa mudar, ele muda em um dos dois lugares.
 *
 * **A segunda é que o campo em foco era invisível.** A borda em repouso e a
 * borda com o cursor dentro eram a mesma borda, da mesma cor, da mesma
 * espessura. Num formulário de vistoria com nove campos, rolado dois mil
 * pontos, o agente não tinha como saber onde o teclado ia escrever. Aqui o
 * foco tem contorno PRÓPRIO: a borda engrossa (`borda.enfase`) e um anel
 * aparece em volta (`foco`), então o estado é dito por espessura e por forma, e
 * não só por cor, que é a regra da casa.
 *
 * O desenho vem do painel (`apps/web/src/componentes/Campo.tsx`), inclusive na
 * decisão que mais importa: **o conteúdo entra como FUNÇÃO**, e não como filho
 * solto. Assim não existe caminho para escrever o controle sem receber a
 * amarração. Esquecer de espalhar `{...ligacoes}` é visível na hora, ao
 * contrário de esquecer um atributo no meio de doze.
 *
 *     <Campo rotulo="Matrícula" erro={erro} ajuda="A que está no crachá.">
 *       {(ligacoes) => <TextInput {...ligacoes} value={v} onChangeText={...} />}
 *     </Campo>
 *
 * O que muda do painel para cá, e por quê: no navegador a amarração é
 * `htmlFor`, `aria-describedby` e `aria-invalid`. **O React Native não tem
 * nenhum dos três.** Não existe `aria-invalid`, não existe `aria-required`, e
 * `accessibilityState` não tem campo para inválido. Então o que lá é atributo
 * aqui entra no TEXTO que o leitor de tela fala: o rótulo diz que o campo é
 * obrigatório e diz que ele está com erro, e a dica fala o erro ANTES da ajuda,
 * na mesma ordem do painel, porque quem está corrigindo precisa ouvir primeiro
 * o que impede o envio. Deixar isso para a borda vermelha seria comunicar
 * estado só por cor para quem não vê cor nenhuma.
 */

/** O que o controle recebe pronto. Espalhe tudo, sem escolher. */
export type LigacoesDoCampo = {
  accessibilityLabel: string;
  accessibilityHint?: string;
  onFocus: () => void;
  onBlur: () => void;
  style: StyleProp<TextStyle>;
  editable?: boolean;
  testID?: string;
  placeholderTextColor: string;
};

/**
 * O rótulo falado, calculado num lugar só.
 *
 * "Obrigatório" marca a EXCEÇÃO ao contrário do painel: aqui a maioria dos
 * campos de uma vistoria é obrigatória, e anunciar "obrigatório" em todos
 * ensinaria o ouvinte a ignorar a palavra. Então quem fala é o opcional, e o
 * erro entra no fim, que é onde ele não atrapalha a identificação do campo e
 * ainda chega antes de a pessoa começar a digitar.
 */
export function rotuloFalado({ rotulo, opcional = false, temErro = false }: {
  rotulo: string;
  opcional?: boolean;
  temErro?: boolean;
}): string {
  return [rotulo, opcional ? "opcional" : null, temErro ? "com erro" : null]
    .filter(Boolean)
    .join(", ");
}

/**
 * A dica falada: o erro primeiro, a ajuda depois.
 *
 * A ordem é a mesma do `aria-describedby` do painel, e pela mesma razão: a
 * ordem da lista é a ordem em que o leitor de tela fala, e quem está
 * corrigindo um campo precisa ouvir o que está errado antes do texto de apoio
 * que já ouviu quando preencheu.
 */
export function dicaFalada({ erro, ajuda }: { erro?: string | null; ajuda?: string }): string | undefined {
  const partes = [erro, ajuda].filter(Boolean);
  return partes.length > 0 ? partes.join(". ") : undefined;
}

export type PropsCampo = {
  rotulo: string;
  /** Opcional marca a exceção: o rótulo ganha "(opcional)" na tela e na fala. */
  opcional?: boolean;
  /** A mensagem do esquema compartilhado, ou do 422 do servidor. */
  erro?: string | null;
  /** O que a pessoa precisa saber ANTES de digitar. */
  ajuda?: string;
  desabilitado?: boolean;
  /** Altura de mais de uma linha, para relato e descrição. */
  multilinhas?: boolean;
  testID?: string;
  estilo?: StyleProp<ViewStyle>;
  children: (ligacoes: LigacoesDoCampo) => ReactNode;
};

export function Campo({
  rotulo, opcional = false, erro, ajuda, desabilitado, multilinhas, testID, estilo, children,
}: PropsCampo) {
  const tema = useTema();
  const reduzirMovimento = useReducaoDeMovimento();
  const [comFoco, setComFoco] = useState(false);
  const anel = useRef(new Animated.Value(0)).current;

  function animarAnel(destino: number, curva: readonly [number, number, number, number]) {
    if (reduzirMovimento) {
      // O anel continua APARECENDO: o que some é a interpolação. Quem pediu
      // menos movimento continua precisando ver onde o teclado escreve.
      anel.setValue(destino);
      return;
    }
    Animated.timing(anel, {
      toValue: destino,
      duration: movimento.respostaAoToque,
      easing: Easing.bezier(...curva),
      // Só opacidade: roda na thread de interface e não depende do JavaScript,
      // que neste aplicativo pode estar ocupado drenando a fila.
      useNativeDriver: true,
    }).start();
  }

  const temErro = Boolean(erro);
  /*
    Em repouso a borda é `bordaControle`, e não `borda`.

    A diferença não é estética: `borda` desenha cartão e separador, que são
    decoração, e sobre o cartão ela dá 1.30:1. A WCAG 1.4.11 pede 3:1 para o que
    identifica um componente de interação, e aqui essa borda é a ÚNICA coisa
    dizendo onde o campo começa. Com `borda`, um campo de formulário sobre um
    cartão quase não existe para quem enxerga pouco, e some de vez sob sol.

    Erro e foco continuam com cor própria: os dois são estado, e estado tem que
    ganhar do repouso.
  */
  const corDaBorda = temErro ? tema.perigoTexto : comFoco ? tema.destaque : tema.bordaControle;

  const ligacoes: LigacoesDoCampo = {
    accessibilityLabel: rotuloFalado({ rotulo, opcional, temErro }),
    accessibilityHint: dicaFalada({ erro, ajuda }),
    onFocus: () => { setComFoco(true); animarAnel(1, easing.entrada); },
    onBlur: () => { setComFoco(false); animarAnel(0, easing.saida); },
    editable: desabilitado ? false : undefined,
    testID,
    placeholderTextColor: tema.textoDiscreto,
    style: {
      /*
        As oito propriedades que estavam copiadas verbatim em duas telas, agora
        num lugar só, mais as duas que a cópia não tinha: a espessura que muda
        com o foco e a cor que muda com o erro.
      */
      minHeight: multilinhas ? toque * 2 : toque,
      borderWidth: comFoco || temErro ? borda.enfase : borda.fio,
      borderColor: corDaBorda,
      borderRadius: raio.normal,
      backgroundColor: desabilitado ? tema.superficie2 : tema.superficie,
      color: tema.texto,
      paddingHorizontal: espaco.e3,
      paddingVertical: espaco.e2,
      fontSize: fonte.corpo,
      lineHeight: linha.corpo,
      textAlignVertical: multilinhas ? "top" : "center",
      opacity: desabilitado ? opacidade.inativo : 1,
    },
  };

  return (
    <View style={[{ gap: espaco.e2 }, estilo]}>
      <Txt variante="corpoP" peso={peso.forte}>
        {rotulo}{opcional ? " (opcional)" : ""}
      </Txt>

      {/*
        O anel mora fora do controle, num irmão posicionado por cima, e não no
        `borderWidth` dele. Engrossar a borda do próprio campo moveria o texto
        de dentro dois pontos a cada foco, e texto que pula quando o cursor
        entra é pior do que foco nenhum.
      */}
      <View>
        {children(ligacoes)}
        <Animated.View
          pointerEvents="none"
          // O anel é o estado de foco DESENHADO, e portão de qualidade não
          // enxerga desenho: sem um identificador, nada consegue afirmar que
          // ele existe, com a cor e a folga do token.
          testID={testID ? `${testID}-anel-de-foco` : undefined}
          style={{
            position: "absolute",
            top: -(foco.folga + foco.largura),
            left: -(foco.folga + foco.largura),
            right: -(foco.folga + foco.largura),
            bottom: -(foco.folga + foco.largura),
            borderWidth: foco.largura,
            borderColor: tema.anelDeFoco,
            borderRadius: raio.normal + foco.folga + foco.largura,
            opacity: anel,
          }}
        />
      </View>

      {/*
        Erro colado no controle, ajuda embaixo dele. Quem enxerga lê de cima
        para baixo e encontra primeiro o que impede o envio; quem escuta recebe
        a mesma ordem pelo `accessibilityHint`. Dica e erro em ordens
        diferentes nos dois canais é o começo de uma tela que está certa para
        quem a escreveu e confusa para quem a usa.
      */}
      {erro && (
        <View
          accessibilityRole="alert"
          style={{ flexDirection: "row", gap: espaco.e2, alignItems: "flex-start" }}
        >
          {/* O mesmo sinal do `Aviso` de perigo: o erro do campo não é uma cor
              vermelha, é uma marca com forma própria. */}
          <Txt variante="corpoP" peso={peso.negrito} cor={tema.perigoTexto}>×</Txt>
          <View style={{ flex: 1 }}>
            <Txt variante="corpoP" cor={tema.perigoTexto}>{erro}</Txt>
          </View>
        </View>
      )}
      {ajuda && <Txt variante="legenda" discreto>{ajuda}</Txt>}
    </View>
  );
}

/**
 * O caso comum: um campo de texto de uma linha (ou de várias).
 *
 * Existe para que a tela não precise repetir `<Campo>{(l) => <TextInput
 * {...l} .../>}</Campo>` sete vezes. As propriedades do `TextInput` que
 * importam passam direto; as que a amarração decide (estilo, rótulo falado,
 * foco) não são aceitas de fora, porque aceitar seria abrir de novo a porta da
 * cópia.
 */
export type PropsCampoDeTexto = Omit<PropsCampo, "children"> & {
  valor: string;
  aoMudar: (valor: string) => void;
  placeholder?: string;
  segredo?: boolean;
  teclado?: TextInput["props"]["keyboardType"];
  capitalizacao?: TextInput["props"]["autoCapitalize"];
  autoCompletar?: TextInput["props"]["autoComplete"];
  /**
   * Liga ou desliga a correção automática do teclado.
   *
   * Sem padrão aqui de propósito: sem ninguém pedir, vale o do sistema, que é
   * ligado, e a maioria dos campos deste aplicativo é texto em português (nome
   * de quem assinou, observação do agente), onde a correção ajuda.
   *
   * Desligar é escolha de quem sabe que o campo NÃO é prosa: matrícula e
   * protocolo são cadeias sem significado, e a correção transforma "DC-0412" em
   * outra coisa sem avisar. Quem digita na chuva não confere caractere a
   * caractere.
   */
  corrigirTexto?: TextInput["props"]["autoCorrect"];
  aoEnviar?: () => void;
  /** Botão que mora ao lado do campo, como o "Ver senha" da tela de entrar. */
  acessorio?: ReactNode;
};

export function CampoDeTexto({
  valor, aoMudar, placeholder, segredo, teclado, capitalizacao, autoCompletar, corrigirTexto, aoEnviar,
  acessorio, ...doCampo
}: PropsCampoDeTexto) {
  return (
    <Campo {...doCampo}>
      {(ligacoes) => (
        <View style={{ flexDirection: "row", alignItems: "stretch", gap: espaco.e2 }}>
          <TextInput
            {...ligacoes}
            style={[ligacoes.style, { flex: 1 }]}
            value={valor}
            onChangeText={aoMudar}
            placeholder={placeholder}
            secureTextEntry={segredo}
            keyboardType={teclado}
            autoCapitalize={capitalizacao}
            autoComplete={autoCompletar}
            autoCorrect={corrigirTexto}
            onSubmitEditing={aoEnviar}
            multiline={doCampo.multilinhas}
          />
          {acessorio}
        </View>
      )}
    </Campo>
  );
}
