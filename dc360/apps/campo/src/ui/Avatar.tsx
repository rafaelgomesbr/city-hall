import { useEffect, useId, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { Txt, useTema } from "./componentes";
import { borda, espaco, gradienteDeDestaque, peso, raio, toque } from "./tokens";

/**
 * O AVATAR: um círculo com a foto da pessoa, ou com as iniciais dela.
 *
 * Nasceu da inicial que a tela de perfil desenhava à mão para cada colega, e
 * virou peça quando a foto de perfil entrou (`dados/foto-do-agente.ts`). É
 * peça, e não um `View` redondo em cada tela, pela razão que já fez o `Dado`
 * e o `Chip` existirem: o mesmo círculo em três tamanhos, com a mesma queda
 * para as iniciais quando a foto falha, decidido uma vez.
 *
 * ## As iniciais não saíram, e não são reserva: são o caso normal
 *
 * A foto é opcional e escolhida pelo servidor. Numa equipe de dez, o comum é
 * metade não ter foto. E mesmo quem tem cai nas iniciais com frequência: a
 * URL da foto do colega é assinada e vence em minutos, a cópia de "meu
 * trabalho" fica no disco por dias, e o perfil abre no morro sem sinal. Um
 * círculo vazio ali pareceria defeito; a inicial diz quem é, e é o que
 * permite achar o colega numa lista sem ler tudo.
 *
 * ## O que ele NÃO faz
 *
 * Não é tocável. Quem quer que o avatar responda ao dedo (a tela de perfil,
 * para trocar a foto) o embrulha num `Tocavel` com rótulo e alvo de 52: o
 * avatar da lista de colegas não faz nada ao toque, e uma peça que às vezes
 * responde e às vezes não ensina o dedo a desconfiar dela.
 *
 * E ele se esconde do leitor de tela por padrão: onde ele aparece, o nome está
 * ao lado, e anunciar "M S" antes de "Maria Souza" faria a lista ser lida
 * duas vezes. `falado` liga o rótulo ("Foto de Maria Souza") para o único
 * lugar em que ele está sozinho, que é o topo do perfil.
 */

export type TamanhoDoAvatar = "pequeno" | "medio" | "grande";

/**
 * Os três tamanhos, em pontos, e por que são estes.
 *
 * - `pequeno` (32) é o da lista de colegas: dá ritmo vertical sem virar o
 *   protagonista da linha, que é o nome.
 * - `medio` (52) é o alvo de toque do produto: é o tamanho de quem aparece
 *   sozinho numa linha que se toca, e o tamanho do coordenador em destaque.
 * - `grande` (96) é o do topo do perfil, e o único com o anel de destaque.
 *   Três vezes o pequeno: a foto que a pessoa acabou de escolher precisa ser
 *   vista, e 96 é o tamanho em que um rosto de 512 pixels ainda é um rosto.
 */
export const TAMANHO_DO_AVATAR: Record<TamanhoDoAvatar, number> = {
  pequeno: espaco.e6,
  medio: toque,
  grande: espaco.e8 + espaco.e6,
};

/**
 * A variante de texto das iniciais, uma por círculo: o tamanho da letra
 * acompanha o tamanho do avatar, e a família continua sendo resolvida pelo
 * `Txt`, como todo texto do produto.
 */
const VARIANTE_DAS_INICIAIS: Record<TamanhoDoAvatar, "corpoP" | "h3" | "display"> = {
  pequeno: "corpoP",
  medio: "h3",
  grande: "display",
};

/**
 * A inicial do primeiro e do último nome, em maiúsculas.
 *
 * Duas letras quando há sobrenome, porque uma equipe com dois "Carlos"
 * viraria dois "C" idênticos. Nome vazio existe (o cadastro do município é
 * de quem cadastrou, não nosso), e um círculo em branco pareceria defeito: a
 * interrogação diz o que houve.
 */
export function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0] ?? "";
  if (!primeira) return "?";
  const ultima = partes.length > 1 ? (partes[partes.length - 1] ?? "") : "";
  return ((primeira[0] ?? "") + (ultima[0] ?? "")).toUpperCase();
}

export function Avatar({ nome, fotoUri, tamanho, falado = false, testID }: {
  nome: string;
  /** A foto, local ou assinada. Nula quando a pessoa não tem foto. */
  fotoUri: string | null;
  tamanho: TamanhoDoAvatar;
  /**
   * Anuncia "Foto de Fulano" ao leitor de tela. Só quando o avatar está
   * SOZINHO: ao lado do nome, a fala repetiria o que já vai ser lido.
   */
  falado?: boolean;
  testID?: string;
}) {
  const tema = useTema();
  const lado = TAMANHO_DO_AVATAR[tamanho];
  /*
    A foto falhou ao carregar (URL assinada vencida, arquivo que sumiu). O
    estado é POR URI: uma foto nova depois de uma que falhou volta a tentar,
    senão trocar a foto num aparelho cuja anterior venceu mostraria iniciais
    para sempre.
  */
  const [falhou, setFalhou] = useState<string | null>(null);
  useEffect(() => { setFalhou(null); }, [fotoUri]);
  const mostraFoto = fotoUri !== null && falhou !== fotoUri;

  const [inicioDoGradiente, fimDoGradiente] = gradienteDeDestaque(tema);
  const idDoGradiente = `dc360Avatar${useId().replace(/[^A-Za-z0-9]/g, "")}`;
  /* O anel só no grande: é o destaque pontual que `CLAUDE.md` autoriza, e
     dez anéis numa lista de colegas seriam dez destaques, ou seja, nenhum. */
  const comAnel = tamanho === "grande";
  const espessuraDoAnel = comAnel ? borda.marca : 0;

  return (
    <View
      testID={testID}
      accessible={falado}
      accessibilityLabel={falado ? (mostraFoto ? `Foto de ${nome}` : `${nome}, sem foto`) : undefined}
      accessibilityElementsHidden={!falado}
      importantForAccessibility={falado ? "yes" : "no-hide-descendants"}
      style={{
        width: lado,
        height: lado,
        borderRadius: raio.pilula,
        backgroundColor: tema.superficie2,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {mostraFoto ? (
        <Image
          testID={testID ? `${testID}-foto` : undefined}
          source={{ uri: fotoUri }}
          onError={() => { setFalhou(fotoUri); }}
          accessibilityIgnoresInvertColors
          style={{
            width: lado - espessuraDoAnel * 2,
            height: lado - espessuraDoAnel * 2,
            borderRadius: raio.pilula,
          }}
        />
      ) : (
        <Txt
          variante={VARIANTE_DAS_INICIAIS[tamanho]}
          peso={peso.negrito}
          cor={tema.destaque}
          alinhamento="center"
        >
          {iniciaisDe(nome)}
        </Txt>
      )}
      {comAnel && (
        /*
          O anel de destaque, em gradiente de token, por cima da foto. É a
          única peça do aplicativo além do botão primário que usa o gradiente,
          e pela mesma regra: dois pontos que são tokens, num elemento de
          destaque, nunca no fundo de nada.
        */
        <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={lado} height={lado}>
          <Defs>
            <LinearGradient id={idDoGradiente} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={inicioDoGradiente} />
              <Stop offset="1" stopColor={fimDoGradiente} />
            </LinearGradient>
          </Defs>
          <Circle
            cx={lado / 2}
            cy={lado / 2}
            r={lado / 2 - espessuraDoAnel / 2}
            stroke={`url(#${idDoGradiente})`}
            strokeWidth={espessuraDoAnel}
            fill="none"
          />
        </Svg>
      )}
    </View>
  );
}
