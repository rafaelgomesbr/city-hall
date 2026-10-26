import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, View } from "react-native";

import type { MotivoDeSessao } from "@dc360/campo";
import { useSinal } from "../dados/conectividade";
import { frasesDaPausa } from "../dados/pausa-da-fila";
import { contagemDaFila, useResumoDaFila } from "../dados/resumo-da-fila";
import { Txt, useTema } from "./componentes";
import { easing, movimento, raio, espaco, toque, type Tema } from "./tokens";
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
  chave:
    | "sem_sinal"
    | "enviando"
    | "esperando"
    | "sessao_encerrada"
    | "conta_desativada"
    | "troca_de_senha_obrigatoria"
    | "versao_do_aplicativo_antiga"
    | "precisa_de_correcao"
    | "aguardando_autor"
    | "sincronizado";
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
 * sem sinal, enviando agora, esperando sinal, parada por recusa do servidor,
 * esperando o autor, e só então tudo certo. "Tudo sincronizado" é o último, e
 * só sobra quando nada mais sobrou.
 */
export function decidirFaixa(
  entrada: {
    temSinal: boolean;
    /** Coletas próprias que ainda vão sair (pendente mais enviando). */
    pendentes: number;
    /**
     * Coletas próprias que o servidor recusou e que só saem pela mão do agente.
     *
     * Entrou em 15/09/2026, com as capturas do dono: a vistoria 000009/2026
     * parou na fila por 422 e esta função, que só olhava pendentes e as de
     * outro autor, respondia "sincronizado". A faixa do topo ficou verde,
     * "Tudo sincronizado, nada pendente no aparelho", com a coleta parada a um
     * toque dali. O número já chegava ao componente (`bloqueados`), só que como
     * sufixo do detalhe, e sufixo de uma frase falsa não a conserta.
     */
    bloqueados: number;
    /** Coletas de outro agente, ou sem autor: não saem com esta sessão. */
    deOutroAutor: number;
    sincronizando: boolean;
    /**
     * A fila está parada pela SESSÃO da pessoa (V2-F00-E06): o servidor disse
     * que a sessão acabou ou que a conta foi desativada. Opcional para quem
     * chama sem fila (o teste da faixa pura).
     */
    pausadaPor?: MotivoDeSessao | null;
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
  /*
    A PAUSA DA SESSAO vem antes de "Enviando" e de "Com sinal", e a ordem e o
    conteudo: "Com sinal, 2 esperando envio" promete que sai sozinha, e nao sai
    enquanto a pessoa nao entrar de novo (ou a coordenacao nao reativar a
    conta). "Enviando" tambem mentiria: cada volta do laco e uma tentativa que
    o servidor recusa na hora, e a faixa piscaria nesse estado a cada
    tentativa. O tom e o de perigo, o mesmo dos outros fins de linha.
  */
  if (entrada.pausadaPor) {
    const frases = frasesDaPausa(entrada.pausadaPor);
    return {
      chave: entrada.pausadaPor,
      fundo: tema.perigoFundo, cor: tema.perigoTexto, sinalTexto: "!",
      titulo: frases.faixaTitulo, detalhe: frases.faixaDetalhe,
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
    A COLETA QUE O SERVIDOR RECUSOU vem antes da de outro autor: as duas estão
    paradas, mas esta espera o dedo de quem está com o aparelho na mão agora, e
    a outra espera alguém que não está. O tom é o de perigo, o mesmo do cartão
    dela na fila, e o toque leva à fila, onde está o botão de corrigir.
  */
  if (entrada.bloqueados > 0) {
    return {
      chave: "precisa_de_correcao",
      fundo: tema.perigoFundo, cor: tema.perigoTexto, sinalTexto: "!",
      titulo: "Precisa de correção",
      detalhe: entrada.bloqueados === 1
        ? "1 coleta precisa de correção"
        : `${entrada.bloqueados} coletas precisam de correção`,
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

/**
 * Quanto a faixa cresce no clímax, antes de voltar. É a maior escala do
 * aplicativo, e é de propósito: este é o único momento em que o movimento é o
 * conteúdo, e um pulo tímido aqui seria "o estado mudou", não "conseguimos".
 */
export const ESCALA_DO_CLIMAX = 1.28;

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
    O sufixo ", N com problema" existe para os estados em que a coleta parada
    NÃO é o assunto da frase (esperando envio, enviando). Quando o estado já é
    o da correção, a frase inteira é sobre ela, e o sufixo diria a mesma coisa
    duas vezes na mesma linha.
  */
  const sufixoDeProblema = bloqueados > 0 && estado.chave !== "precisa_de_correcao"
    ? `, ${bloqueados} com problema`
    : "";

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
          toValue: ESCALA_DO_CLIMAX,
          duration: movimento.climax * 0.4,
          easing: Easing.bezier(...easing.climax),
          useNativeDriver: true,
        }),
        // A volta chega no lugar em vez de bater: é a curva de `entrada`.
        Animated.timing(escala, {
          toValue: 1,
          duration: movimento.climax * 0.6,
          easing: Easing.bezier(...easing.entrada),
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
      easing: Easing.bezier(...easing.entrada),
      useNativeDriver: true,
    }).start();
  }, [estado.chave, reduzir, escala, entrada]);

  return (
    <Pressable
      onPress={aoTocar}
      accessibilityRole="button"
      /*
        Os bloqueados entram aqui também, e não só no texto desenhado. Sem
        isto, quem ouve a tela recebia "Tudo sincronizado. Nada pendente no
        aparelho." com uma coleta travada no aparelho, que é a frase que o
        cabeçalho deste arquivo chama de a pior que este produto pode exibir.
      */
      accessibilityLabel={
        `${estado.titulo}. ${estado.detalhe}${sufixoDeProblema}. Toque para ver a fila de envio.`
      }
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
          {sufixoDeProblema}
        </Txt>
      </Animated.View>
      <View>
        <Txt variante="legenda" cor={estado.cor}>ver fila</Txt>
      </View>
    </Pressable>
  );
}

/**
 * A faixa LIGADA à fila e ao sinal, que é o que o layout das abas monta.
 *
 * A peça de cima continua pura (recebe o estado e desenha), porque é assim que
 * `faixa-de-sincronizacao.test.tsx` prova o clímax sem montar fila nenhuma.
 * Esta é a que assina: lê o sinal e o resumo da fila por conta própria, decide
 * o estado com `decidirFaixa` e entrega para a de cima.
 *
 * Por que a assinatura mora AQUI e não no layout: o layout das abas é o pai do
 * navegador, e um `setState` nele no meio da troca de aba reinicia a animação
 * da cena e a deixa com opacidade zero (a causa inteira está em
 * `app/(agente)/_layout.tsx`). A faixa é irmã do navegador, não pai: quando ela
 * se redesenha, o navegador nem fica sabendo.
 */
export function FaixaDeSincronizacaoLigada({ aoTocar }: { aoTocar: () => void }) {
  const tema = useTema();
  const sinal = useSinal();
  const resumo = useResumoDaFila();
  const { pendentes, bloqueados, deOutroAutor, sincronizando, pausadaPor } = contagemDaFila(resumo);

  /*
    A `chave` dentro de `decidirFaixa` existe para a faixa saber que houve
    TRANSIÇÃO, e não só que o texto mudou. Sem ela, "3 esperando envio" virando
    "2 esperando envio" seria indistinguível de "esperando" virando
    "sincronizado", e o clímax da fila esvaziando dispararia a cada item
    enviado, o que o esvaziaria de sentido.
  */
  const estado = decidirFaixa(
    { temSinal: sinal.temSinal, pendentes, bloqueados, deOutroAutor, sincronizando, pausadaPor },
    tema,
  );

  return <FaixaDeSincronizacao estado={estado} bloqueados={bloqueados} aoTocar={aoTocar} />;
}
