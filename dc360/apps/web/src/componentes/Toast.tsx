import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { IconeAlerta, IconeCheck } from "./Icones";

/**
 * O aviso passageiro, e o que ele nunca pode ser.
 *
 * **Toast é confirmação, não é registro.** Ele some sozinho, aparece no canto
 * (fora de onde o olho está, que é onde a pessoa acabou de clicar), e quem usa
 * leitor de tela pode estar no meio de outra leitura quando ele passa. Se a
 * informação existir SÓ aqui, ela se perde: o número do protocolo que acabou
 * de nascer, o erro que impediu a gravação, a lista do que não subiu. Tudo
 * isso pertence à tela, e o toast serve para dizer que aconteceu agora, para
 * quem estava olhando. A regra prática: depois que o toast some, a pessoa
 * ainda tem de conseguir descobrir o que aconteceu sem refazer a ação.
 *
 * `role="status"` com `aria-live="polite"` é o par que faz o texto ser
 * anunciado sem interromper o que o leitor de tela está falando. "Polite" é
 * deliberado: `assertive` corta a frase no meio, e um aviso de sucesso não
 * vale interromper alguém que está lendo um endereço.
 *
 * O temporizador é limpo no desmonte. Sem isso, sair da tela antes de o aviso
 * sumir deixa um `setTimeout` de pé chamando um `aoFechar` que mexe no estado
 * de um componente que já não existe: em desenvolvimento vira aviso no
 * console, e em produção vira comportamento que ninguém consegue reproduzir
 * (o toast da tela anterior fechando por cima da tela nova).
 */

/** Tempo de leitura padrão. Curto o bastante para não estorvar, longo o
 *  bastante para uma frase inteira caber antes de sumir. */
export const DURACAO_PADRAO = 6000;

/**
 * O tempo do aviso que carrega um NÚMERO para ser ditado.
 *
 * Seis segundos cobrem uma frase lida em silêncio. Não cobrem o que acontece
 * de verdade quando um protocolo nasce: quem registrou está com o telefone no
 * ombro, lê o número, dita dígito por dígito e espera a pessoa do outro lado
 * repetir para conferir. Com o relógio padrão, o aviso some no meio disso e o
 * número tem de ser caçado de novo com o morador ainda na linha, que é a
 * reclamação que este aviso existe para resolver.
 *
 * Quinze segundos continuam sendo um palpite, e é por isso que ele não anda
 * sozinho: a pausa de `duracaoComPausa` é que garante o resto, porque ela não
 * depende de acertar o número.
 */
export const DURACAO_PARA_DITAR = 15000;

/**
 * Marca o fim do aviso e devolve o cancelamento.
 *
 * Está fora do componente porque é a parte que precisa ser exercitada: o
 * defeito não é o temporizador disparar, é ele NÃO ser cancelado, e isso só
 * se prova cancelando e vendo que o relógio avançou sem chamar nada.
 *
 * `duracao` nula ou zero significa aviso que fica: existe erro que não pode
 * sumir sozinho enquanto ninguém o leu.
 */
export function agendarFechamento(
  duracao: number | null,
  aoFechar: () => void,
): () => void {
  if (duracao === null || duracao <= 0) return () => {};
  const relogio = setTimeout(aoFechar, duracao);
  return () => clearTimeout(relogio);
}

/**
 * A duração que vale AGORA, considerando se a pessoa está mexendo no aviso.
 *
 * Nenhum número escolhido aqui cobre o tempo de levar o mouse até o canto da
 * tela e arrastar por cima do protocolo para copiar: o aviso que some no meio
 * da seleção leva o número junto, e a pessoa descobre isso já sem ele. Com o
 * ponteiro em cima, ou com o foco do teclado dentro, o relógio simplesmente
 * não corre.
 *
 * A pausa é `null`, que é o mesmo valor que `agendarFechamento` já entende
 * como "aviso que fica": não existe um segundo caminho de código para manter,
 * e a saída manual continua sendo o botão Fechar.
 */
export function duracaoComPausa(
  duracao: number | null,
  interagindo: boolean,
): number | null {
  return interagindo ? null : duracao;
}

const ESTILO_REGIAO: CSSProperties = {
  position: "fixed",
  right: "var(--ds-sp-4)",
  bottom: "var(--ds-sp-4)",
  zIndex: "var(--ds-z-toast)",
  maxWidth: "min(420px, calc(100% - var(--ds-sp-6)))",
};

const ESTILO_AVISO: CSSProperties = {
  /* `.aviso` empurra margem para baixo para separar de um formulário; aqui
     ele é a última coisa da tela e a margem viraria buraco. */
  marginBottom: 0,
  boxShadow: "var(--ds-shadow-2)",
  border: "1px solid var(--ds-border)",
  alignItems: "center",
};

export type TomDoToast = "info" | "sucesso" | "perigo" | "alerta";

export type PropsToast = {
  mensagem: ReactNode;
  tom?: TomDoToast;
  /** Milissegundos até sumir sozinho. `null` para ficar até fecharem. */
  duracao?: number | null;
  aoFechar: () => void;
};

export function Toast({ mensagem, tom = "info", duracao = DURACAO_PADRAO, aoFechar }: PropsToast) {
  /*
    O `aoFechar` mora num ref, e o efeito depende só da duração e da pausa.

    Sem isto, uma função anônima passada pela tela (`aoFechar={() => setAviso(null)}`)
    é uma identidade nova a cada renderização do pai, o efeito reinicia junto,
    e o temporizador nunca chega ao fim: o aviso fica na tela para sempre numa
    tela que se atualiza sozinha, que é justamente o painel de plantão.
  */
  const ultimoFechar = useRef(aoFechar);
  ultimoFechar.current = aoFechar;

  /*
    Mexer no aviso segura o relógio, e o mouse não é o único jeito de mexer.

    `onFocus` e `onBlur` estão aqui porque quem navega por teclado chega ao
    botão Fechar por dentro deste bloco, e os dois eventos sobem até ele no
    React. Sem eles, a pausa seria um favor feito só a quem usa mouse.
  */
  const [interagindo, setInteragindo] = useState(false);

  useEffect(() => agendarFechamento(
    duracaoComPausa(duracao, interagindo), () => ultimoFechar.current(),
  ), [duracao, interagindo]);

  return (
    <div className="toast" style={ESTILO_REGIAO} role="status" aria-live="polite"
         onPointerEnter={() => setInteragindo(true)}
         onPointerLeave={() => setInteragindo(false)}
         onFocus={() => setInteragindo(true)}
         onBlur={() => setInteragindo(false)}>
      <div className={`aviso aviso--${tom}`} style={ESTILO_AVISO}>
        {tom === "sucesso" ? <IconeCheck tamanho={20} /> : <IconeAlerta tamanho={20} />}
        <div style={{ flex: 1 }}>{mensagem}</div>
        {/*
          A saída manual não é conveniência: aviso que só some por tempo
          obriga quem usa ampliador de tela, ou quem precisa de mais tempo,
          a esperar o relógio de outra pessoa. E ele tapa o canto da tela.
        */}
        <button type="button" className="botao botao--discreto" onClick={aoFechar}>
          Fechar
        </button>
      </div>
    </div>
  );
}
