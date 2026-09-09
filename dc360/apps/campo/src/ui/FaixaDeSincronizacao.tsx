import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, View } from "react-native";

import { Txt } from "./componentes";
import { movimento, raio, espaco, toque, type Tema } from "./tokens";
import { useReducaoDeMovimento } from "./useReducaoDeMovimento";

/**
 * A faixa de estado da sincronização, e o único momento do aplicativo em que o
 * movimento é o conteúdo, e não enfeite.
 *
 * O agente sobe o morro, coleta sem sinal e desce sem saber se o trabalho dele
 * chegou. Essa dúvida é a maior fonte de desconfiança num aplicativo de campo:
 * quem desconfia anota no papel "por garantia", e a partir daí existem dois
 * sistemas e o de papel vence. A faixa responde à dúvida, e a fila esvaziando é
 * o momento em que ela responde de vez.
 *
 * Por isso existem DOIS movimentos aqui, com pesos diferentes:
 *
 * 1. **Troca de estado**, curta. Sem sinal, enviando, com sinal, sincronizado:
 *    a cor de fundo e o texto trocam num tempo que se percebe sem atrapalhar
 *    quem está lendo outra coisa na tela.
 * 2. **O clímax**, mais longo, e SÓ na chegada a "tudo sincronizado" VINDO de
 *    um estado com item pendente. O emblema cresce e volta, uma vez.
 *
 * A condição de origem do clímax não é detalhe: sem ela, a faixa comemoraria a
 * cada abertura do aplicativo com a fila já vazia, e comemoração que acontece o
 * tempo todo deixa de significar qualquer coisa. Ela precisa marcar uma
 * transição real, e é por isso que o estado anterior é guardado.
 *
 * NADA disto roda quando o aparelho pede redução de movimento. Nesse caso a
 * faixa troca de estado direto, e continua dizendo tudo: cor, símbolo e palavra
 * já carregam a informação inteira, porque a regra da casa é que nada se
 * comunica só por movimento nem só por cor.
 */

export type EstadoDaFaixa = {
  /** Identidade do estado. Trocou, houve transição. */
  chave: "sem_sinal" | "enviando" | "esperando" | "aguardando_autor" | "sincronizado";
  fundo: string;
  cor: string;
  sinalTexto: string;
  titulo: string;
  detalhe: string;
};

/**
 * O que a faixa diz, decidido fora do componente que a desenha.
 *
 * Isto era uma cadeia de ternários dentro do layout do grupo autenticado, o que
 * a tornava inalcançável por teste: provar "a faixa nunca diz Tudo
 * sincronizado com uma vistoria parada no aparelho" exigiria montar as abas
 * inteiras. A frase é a promessa central do aplicativo para quem desceu o
 * morro, e promessa central precisa de teste próprio.
 *
 * A ORDEM DOS CASOS É O CONTEÚDO, e ela vai do mais concreto ao mais otimista:
 * sem sinal, enviando agora, esperando sinal, esperando o autor, e só então
 * tudo certo. "Tudo sincronizado" é o último, e só sobra quando nada mais
 * sobrou.
 */
export function decidirFaixa(
  entrada: {
    temSinal: boolean;
    /** Coletas próprias que ainda vão sair (pendente mais enviando). */
    pendentes: number;
    /** Coletas de outro agente, ou sem autor: não saem com esta sessão. */
    deOutroAutor: number;
    sincronizando: boolean;
  },
  tema: Tema,
): EstadoDaFaixa {
  if (!entrada.temSinal) {
    return {
      chave: "sem_sinal",
      fundo: tema.alertaFundo, cor: tema.alertaTexto, sinalTexto: "!",
      titulo: "Sem sinal", detalhe: "Salvando neste aparelho",
    };
  }
  if (entrada.sincronizando) {
    return {
      chave: "enviando",
      fundo: tema.superficie2, cor: tema.texto, sinalTexto: "↑",
      titulo: "Enviando", detalhe: `${entrada.pendentes} na fila`,
    };
  }
  if (entrada.pendentes > 0) {
    return {
      chave: "esperando",
      fundo: tema.superficie2, cor: tema.texto, sinalTexto: "↑",
      titulo: "Com sinal", detalhe: `${entrada.pendentes} esperando envio`,
    };
  }
  /*
    "Tudo sincronizado" com uma coleta parada no aparelho é a pior frase que
    este produto pode exibir, e era o que acontecia no aparelho de plantão
    compartilhado: o agente da noite entrava, a coleta do turno da manhã não
    subia (o laudo sairia com o nome errado), e a faixa ficava verde.
  */
  if (entrada.deOutroAutor > 0) {
    return {
      chave: "aguardando_autor",
      fundo: tema.alertaFundo, cor: tema.alertaTexto, sinalTexto: "⏸",
      titulo: "Coleta de outro agente no aparelho",
      detalhe: entrada.deOutroAutor === 1
        ? "1 coleta espera quem a fez entrar"
        : `${entrada.deOutroAutor} coletas esperam quem as fez entrar`,
    };
  }
  return {
    chave: "sincronizado",
    fundo: tema.okFundo, cor: tema.okTexto, sinalTexto: "✓",
    titulo: "Tudo sincronizado", detalhe: "Nada pendente no aparelho",
  };
}

export function FaixaDeSincronizacao({
  estado,
  bloqueados,
  aoTocar,
}: {
  estado: EstadoDaFaixa;
  bloqueados: number;
  aoTocar: () => void;
}) {
  const reduzir = useReducaoDeMovimento();

  /*
    O estado anterior mora numa `ref`, e não em `useState`.

    Guardá-lo em estado provocaria uma segunda renderização a cada troca só
    para registrar o que acabou de acontecer, e essa renderização extra
    chegaria depois da animação já ter começado. A `ref` guarda o fato sem
    participar do ciclo de desenho, que é exatamente o papel dela.
  */
  const anterior = useRef<EstadoDaFaixa["chave"] | null>(null);
  const escala = useRef(new Animated.Value(1)).current;
  const entrada = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const veioDe = anterior.current;
    anterior.current = estado.chave;

    // Primeira montagem não é transição: o aplicativo abrindo com a fila vazia
    // não é a fila tendo esvaziado.
    if (veioDe === null || veioDe === estado.chave) return;

    if (reduzir) {
      escala.setValue(1);
      entrada.setValue(1);
      return;
    }

    const ehClimax = estado.chave === "sincronizado"
      && (veioDe === "enviando" || veioDe === "esperando");

    if (ehClimax) {
      /*
        Cresce e volta, uma vez. `useNativeDriver` ligado porque escala é
        propriedade que a camada nativa sabe animar sozinha: sem isso, cada
        quadro atravessa a ponte, e num aparelho fraco de prefeitura a
        comemoração sai travada, que é pior que não ter comemoração nenhuma.
      */
      escala.setValue(1);
      Animated.sequence([
        Animated.timing(escala, {
          toValue: 1.28,
          duration: movimento.climax * 0.4,
          easing: Easing.out(Easing.back(2)),
          useNativeDriver: true,
        }),
        Animated.timing(escala, {
          toValue: 1,
          duration: movimento.climax * 0.6,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    // Troca comum: o conteúdo entra com uma insinuação de opacidade. Curto o
    // bastante para não atrapalhar quem está lendo a lista de tarefas.
    entrada.setValue(0.35);
    Animated.timing(entrada, {
      toValue: 1,
      duration: movimento.mudancaDeEstado,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [estado.chave, reduzir, escala, entrada]);

  return (
    <Pressable
      onPress={aoTocar}
      accessibilityRole="button"
      accessibilityLabel={`${estado.titulo}. ${estado.detalhe}. Toque para ver a fila de envio.`}
      testID="faixa-de-sincronizacao"
      style={{
        backgroundColor: estado.fundo,
        minHeight: toque,
        paddingHorizontal: espaco.e4,
        paddingVertical: espaco.e2,
        flexDirection: "row",
        alignItems: "center",
        gap: espaco.e3,
      }}
    >
      {/*
        Símbolo além da cor: sol na tela apaga a diferença entre âmbar e verde,
        e daltonismo apaga de vez.
      */}
      <Animated.View
        testID="emblema-da-faixa"
        style={{
          width: 28, height: 28, borderRadius: raio.pilula,
          backgroundColor: estado.cor,
          alignItems: "center", justifyContent: "center",
          transform: [{ scale: escala }],
        }}
      >
        <Txt variante="corpoP" negrito cor={estado.fundo}>{estado.sinalTexto}</Txt>
      </Animated.View>
      <Animated.View style={{ flex: 1, opacity: entrada }}>
        <Txt variante="corpoP" negrito cor={estado.cor}>{estado.titulo}</Txt>
        <Txt variante="legenda" cor={estado.cor}>
          {estado.detalhe}
          {bloqueados > 0 && `, ${bloqueados} com problema`}
        </Txt>
      </Animated.View>
      <View>
        <Txt variante="legenda" cor={estado.cor}>ver fila</Txt>
      </View>
    </Pressable>
  );
}
