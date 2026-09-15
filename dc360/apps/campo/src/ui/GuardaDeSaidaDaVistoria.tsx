import {
  createContext, useContext, useMemo, useRef, useState, type ReactNode,
} from "react";

import { Dialogo } from "./Dialogo";
import { lerRascunho } from "../dados/rascunho";

/**
 * A PERGUNTA DE SAIR DA VISTORIA COMEÇADA, num lugar só.
 *
 * Ela nasceu dentro da barra de abas, como compensação de a barra ter passado
 * a aparecer dentro da vistoria: escotilha de fuga permanente embaixo do
 * polegar, ao lado do formulário mais longo do produto, é como se produz
 * vistoria pela metade. O dono desfez a decisão COM a compensação, e a
 * compensação é esta pergunta.
 *
 * Quando o sino entrou no cabeçalho de toda tela, a barra deixou de ser a
 * única saída da vistoria: o sino também sai (para os avisos), e um sino que
 * saísse sem perguntar quebraria a promessa que a barra faz na mesma tela. As
 * duas saídas passam a perguntar pela MESMA função, com o mesmo diálogo e as
 * mesmas palavras, e é isso que este arquivo é.
 *
 * ## Por que a pergunta mora AQUI, e não no layout das abas
 *
 * O layout das abas não guarda estado nenhum que mude com o uso, e a razão é
 * a aba que ficava escura (ver `app/(agente)/_layout.tsx`): um `setState` no
 * pai do navegador reinicia a animação da cena. "Estou perguntando" é estado.
 * Este provedor fica ENTRE o layout e o navegador, e quando ele muda de estado
 * o navegador não é redesenhado: o elemento `<Tabs>` chega aqui como
 * `children`, o mesmo objeto de antes, e o React não desce por um filho que
 * não mudou. O valor do contexto é criado uma vez, então quem o lê (a barra, o
 * sino) tampouco se redesenha por causa da pergunta.
 *
 * ## Quem sabe onde o agente está
 *
 * O navegador. E quem tem o estado do navegador na mão é a barra, que o
 * recebe pronto a cada troca de aba. Por isso a barra REGISTRA a rota aberta
 * aqui (numa referência, sem estado, sem redesenho), e qualquer saída pergunta
 * sem precisar saber de navegação: "vou para os Avisos, posso?".
 *
 * A pergunta NÃO é sobre perda, e o texto diz isso na cara: o rascunho está no
 * disco desde o primeiro toque. É sobre atenção. Por isso a ação não é
 * destrutiva, e o botão repete o DESTINO em vez de dizer "OK", que é a regra
 * de conteúdo do `Dialogo`.
 */

/** O nome da rota da vistoria, que é a única tela com pergunta de saída. */
export const ROTA_DA_VISTORIA = "vistoria/[id]";

export type RotaAberta = { name: string; params?: object | undefined } | null;

export type GuardaDeSaida = {
  /** A barra diz onde o agente está. Só ela recebe o estado do navegador. */
  registrarRotaAberta(rota: RotaAberta): void;
  /**
   * Pergunta se houver vistoria começada na tela aberta; senão segue na hora.
   *
   * `destino` é a palavra que vai no botão ("Ir para Avisos"), e `seguir` é o
   * que acontece quando o agente confirma, ou quando não há o que perguntar.
   */
  antesDeSair(destino: string, seguir: () => void): void;
};

/**
 * Há vistoria COMEÇADA na tela aberta?
 *
 * Começada e aberta são coisas diferentes, e a diferença é o que impede a
 * pergunta de virar obstáculo: a tela de vistoria cunha o rascunho em memória
 * na abertura e só o GRAVA no primeiro toque do agente (ver `alterar()` em
 * `app/(agente)/vistoria/[id].tsx`). Existir linha no disco quer dizer que
 * alguém preencheu alguma coisa, e é o mesmo critério que a lista de tarefas
 * já usa para marcar uma tarefa como "em andamento".
 *
 * A leitura acontece no TOQUE, e não quando a tela abre: o rascunho nasce
 * entre uma coisa e outra, e uma resposta guardada na abertura estaria errada
 * exatamente no caso que importa.
 */
export async function haVistoriaComecada(rota: RotaAberta): Promise<boolean> {
  if (rota?.name !== ROTA_DA_VISTORIA) return false;
  const id = (rota.params as { id?: string } | undefined)?.id;
  if (!id) return false;
  try {
    return (await lerRascunho(id)) !== null;
  } catch {
    /*
      Disco recusando leitura não pode PRENDER o agente na tela. O pior caso de
      deixar passar é uma troca de tela sem pergunta, com o rascunho intacto no
      disco; o pior caso de segurar é um menu que não responde ao dedo no meio
      do plantão.
    */
    return false;
  }
}

/**
 * Sem provedor, ninguém pergunta: a saída segue. É o que faz a barra e o sino
 * poderem ser montados sozinhos (em teste, ou numa tela fora das abas) sem
 * estourar. No aplicativo o provedor está no layout das abas, e o caso que
 * prova a pergunta passa por ele.
 */
const SEM_GUARDA: GuardaDeSaida = {
  registrarRotaAberta() { /* ninguém para contar */ },
  antesDeSair(_destino, seguir) { seguir(); },
};

const Contexto = createContext<GuardaDeSaida>(SEM_GUARDA);

export function useGuardaDeSaida(): GuardaDeSaida {
  return useContext(Contexto);
}

export function GuardaDeSaidaDaVistoria({ children }: { children: ReactNode }) {
  const rotaAberta = useRef<RotaAberta>(null);

  /**
   * A saída que está esperando resposta.
   *
   * Guarda a continuação inteira, e não só o destino: a resposta do diálogo
   * chega num quadro diferente do toque, e reconstruir a navegação pelo nome
   * perderia os parâmetros que vieram junto.
   */
  const [perguntando, setPerguntando] = useState<
    { destino: string; seguir: () => void } | null
  >(null);

  /*
    Um valor só pela vida do provedor. Ele lê a rota por referência e escreve
    estado por `setPerguntando`, que também é estável, então nada aqui precisa
    ser recriado, e quem consome o contexto nunca é redesenhado por ele.
  */
  const guarda = useMemo<GuardaDeSaida>(() => ({
    registrarRotaAberta(rota) { rotaAberta.current = rota; },
    antesDeSair(destino, seguir) {
      void haVistoriaComecada(rotaAberta.current).then((comecada) => {
        if (comecada) setPerguntando({ destino, seguir });
        else seguir();
      });
    },
  }), []);

  return (
    <Contexto.Provider value={guarda}>
      {children}
      {perguntando && (
        <Dialogo
          testID="dialogo-de-sair-da-vistoria"
          aberto
          titulo="Sair da vistoria?"
          texto={
            "A vistoria está começada e o que você já preencheu está guardado "
            + "neste aparelho. Sair agora não apaga nada: quando você voltar, ela "
            + "continua de onde parou."
          }
          acao={{
            rotulo: `Ir para ${perguntando.destino}`,
            aoTocar: perguntando.seguir,
          }}
          recusa={{ rotulo: "Continuar a vistoria" }}
          aoFechar={() => { setPerguntando(null); }}
        />
      )}
    </Contexto.Provider>
  );
}
