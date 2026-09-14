import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useFonts } from "expo-font";

import { ARQUIVOS_DE_FONTE } from "./tipografia";

/**
 * O carregamento da tipografia, e o que acontece quando ele falha.
 *
 * A tela de abertura já espera a sessão sair do cofre (ver `_layout.tsx`), e
 * agora espera a fonte também, pelo mesmo motivo: sem isso o aplicativo
 * desenha a primeira tela com a fonte do sistema e RETIPOGRAFA tudo quando os
 * arquivos chegam. Texto que muda de largura depois de desenhado reflui a
 * tela inteira, e quem estava lendo perde a linha. É um piscar que parece
 * defeito.
 *
 * **O caso que importa é o da falha, não o do sucesso.** Fonte é enfeite;
 * coleta de vistoria não é. Um aplicativo que fica preso na tela de abertura
 * porque um `.ttf` não abriu é um aplicativo que perdeu o plantão por causa de
 * uma questão de estética. Por isso a abertura tem TRÊS saídas, e só uma delas
 * é o sucesso:
 *
 * 1. as fontes carregaram;
 * 2. o carregamento falhou, e o aplicativo abre com a reserva do sistema;
 * 3. o carregamento não respondeu nada até o teto de tempo, e o aplicativo
 *    abre do mesmo jeito.
 *
 * A terceira não é redundante. `useFonts` promete resolver em carregado ou em
 * erro, e essa promessa é do módulo nativo: um módulo que não responde deixa
 * as duas bandeiras em falso para sempre, e o desfecho é a tela de abertura
 * eterna, sem erro em lugar nenhum para alguém investigar. Teto de tempo é a
 * diferença entre um aplicativo feio e um aplicativo que não abre.
 */

/**
 * Quanto a abertura espera pela fonte antes de desistir dela.
 *
 * Dois segundos e meio. Os arquivos são locais, então o caso normal termina
 * em dezenas de milissegundos; este número não existe para o caso normal, e
 * sim para o aparelho velho de prefeitura na primeira abertura depois da
 * instalação. Acima disso a espera deixa de ser abertura e vira tela travada,
 * que é o que o agente mata no meio do plantão.
 */
export const TETO_DE_ESPERA_DA_FONTE_MS = 2_500;

export type EstadoDasFontes = {
  /** Pode abrir o aplicativo? */
  liberado: boolean;
  /** As famílias do produto estão registradas e podem ser usadas? */
  prontas: boolean;
  /** A identidade caiu e o texto está saindo na pilha do sistema. */
  naReserva: boolean;
};

/**
 * A decisão, separada do hook de propósito.
 *
 * Ela é a regra que precisa continuar valendo, e regra não se prova montando
 * árvore de React: se prova chamando a função com os quatro estados possíveis.
 * O hook abaixo só junta as entradas.
 */
export function decidirAbertura({ carregadas, erro, estourouOTeto }: {
  carregadas: boolean;
  erro: unknown;
  estourouOTeto: boolean;
}): EstadoDasFontes {
  const desistiu = Boolean(erro) || estourouOTeto;
  return {
    liberado: carregadas || desistiu,
    prontas: carregadas,
    /*
      `naReserva` só é verdade quando desistimos E as fontes não vieram. A
      ordem importa: uma carga que termina no mesmo quadro em que o teto
      estoura está PRONTA, e anunciar reserva ali faria o aplicativo se
      declarar degradado estando inteiro.
    */
    naReserva: desistiu && !carregadas,
  };
}

const SEM_FONTES: EstadoDasFontes = { liberado: true, prontas: false, naReserva: true };

/*
  O padrão do contexto é a RESERVA, e não o estado pronto.

  Quem renderiza uma peça fora do provedor (um teste de unidade, uma tela que
  alguém montar isolada) recebe a pilha do sistema, que é o desfecho seguro:
  pedir uma família que não foi registrada faz o React Native desenhar com a
  fonte padrão de qualquer jeito no iOS e ESTOURAR no Android. Errar para o
  lado da reserva é errar para o lado que abre.
*/
const ContextoDeFontes = createContext<EstadoDasFontes>(SEM_FONTES);

export function useFontes(): EstadoDasFontes {
  return useContext(ContextoDeFontes);
}

export function ProvedorDeFontes({ children }: { children: ReactNode }) {
  const [carregadas, erro] = useFonts(ARQUIVOS_DE_FONTE);
  const [estourouOTeto, setEstourouOTeto] = useState(false);

  useEffect(() => {
    const relogio = setTimeout(() => setEstourouOTeto(true), TETO_DE_ESPERA_DA_FONTE_MS);
    // Limpo no desmonte: sem isto, sair do aplicativo antes do teto deixa um
    // temporizador vivo escrevendo estado em componente que já saiu da tela.
    return () => { clearTimeout(relogio); };
  }, []);

  const estado = decidirAbertura({ carregadas, erro, estourouOTeto });

  return <ContextoDeFontes.Provider value={estado}>{children}</ContextoDeFontes.Provider>;
}
