import { useEffect, useState } from "react";
import * as Network from "expo-network";

/**
 * Se o aparelho tem sinal, e quanto dele.
 *
 * Duas coisas que parecem detalhe e não são:
 *
 * 1. **`isInternetReachable` importa mais que `isConnected`.** Estar
 *    conectado ao Wi-Fi da prefeitura que caiu, ou preso numa antena de
 *    celular sem rota, conta como conectado e não leva pacote nenhum. O
 *    aplicativo precisa saber a diferença, senão anuncia "online" e a fila
 *    fica tentando contra a parede.
 * 2. **Quando não se sabe, assume que dá.** Alguns aparelhos devolvem
 *    `undefined` para alcançabilidade. Assumir que não há sinal deixaria a
 *    fila parada num aparelho que estava funcionando bem, e o custo do
 *    contrário é uma tentativa que falha e volta para a fila.
 */

export type Sinal = {
  temSinal: boolean;
  /** `wifi`, `celular` ou nada, para a tela dizer o que está usando. */
  tipo: string | null;
};

function interpretar(estado: Network.NetworkState): Sinal {
  const alcancavel = estado.isInternetReachable;
  return {
    temSinal: Boolean(estado.isConnected) && alcancavel !== false,
    tipo:
      estado.type === Network.NetworkStateType.WIFI ? "Wi-Fi"
      : estado.type === Network.NetworkStateType.CELLULAR ? "dados móveis"
      : null,
  };
}

export function useSinal(): Sinal {
  /*
    Começa como "tem sinal" de propósito. O primeiro quadro da tela aparece
    antes de a consulta responder, e mostrar "sem sinal" por um instante a
    cada abertura ensinaria o agente a ignorar o aviso, que é justamente o
    aviso que precisa ser levado a sério.
  */
  const [sinal, setSinal] = useState<Sinal>({ temSinal: true, tipo: null });

  useEffect(() => {
    let vivo = true;

    void Network.getNetworkStateAsync()
      .then((e) => { if (vivo) setSinal(interpretar(e)); })
      .catch(() => undefined);

    const inscricao = Network.addNetworkStateListener((e) => {
      if (vivo) setSinal(interpretar(e));
    });

    return () => {
      vivo = false;
      inscricao.remove();
    };
  }, []);

  return sinal;
}
