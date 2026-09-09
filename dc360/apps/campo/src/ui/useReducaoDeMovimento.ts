import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * O aparelho está pedindo para reduzir movimento?
 *
 * Quem liga essa chave no sistema quase nunca liga por estética: liga porque
 * animação em tela dá enjoo, tontura ou dor de cabeça. É a mesma pessoa que
 * este aplicativo coloca em pé num barranco, na chuva, olhando para a tela
 * enquanto o corpo se equilibra. Ignorar a chave aqui custa mais caro do que
 * custaria num painel de escritório.
 *
 * Duas decisões, e as duas evitam defeito visto em revisão:
 *
 * 1. **Não basta ler uma vez na abertura.** O agente liga a chave no meio do
 *    plantão, justamente quando começou a passar mal, e o aplicativo fica
 *    aberto o dia inteiro sem nunca ser reaberto. Por isso o evento
 *    `reduceMotionChanged` fica escutando junto com a leitura inicial.
 * 2. **A inscrição é desfeita no desmonte, e a leitura tardia é descartada.**
 *    Sem `remove()`, cada tela que monta deixa um ouvinte vivo no emissor: num
 *    plantão de horas isso vira dezenas de ouvintes tentando atualizar
 *    componentes que já saíram da tela. Sem a bandeira `vivo`, a promessa da
 *    leitura inicial pode responder depois do desmonte e escrever estado em
 *    componente morto, que é ruído em teste e esconde defeito de verdade.
 *
 * O padrão é `false` de propósito: enquanto a resposta não chega, animar é o
 * comportamento normal do aplicativo, e trocar a tela do estado sem movimento
 * para o com movimento seria, ela mesma, uma animação inesperada.
 */
export function useReducaoDeMovimento(): boolean {
  const [reduzir, setReduzir] = useState(false);

  useEffect(() => {
    let vivo = true;

    void AccessibilityInfo.isReduceMotionEnabled()
      .then((ligado) => { if (vivo) setReduzir(ligado); })
      // Aparelho que não sabe responder continua animando: é o padrão do
      // sistema, e falhar aqui não pode derrubar a tela que está abrindo.
      .catch(() => undefined);

    const inscricao = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (ligado) => { if (vivo) setReduzir(ligado); },
    );

    return () => {
      vivo = false;
      inscricao.remove();
    };
  }, []);

  return reduzir;
}
