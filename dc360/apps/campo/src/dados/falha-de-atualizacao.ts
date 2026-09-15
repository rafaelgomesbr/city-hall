import { SemSinal } from "./api";

/**
 * Por que a atualização não aconteceu, na única divisão que muda o que o
 * agente FAZ a seguir.
 *
 * Este arquivo existe por causa de um relato de uso real, em 14/09/2026: uma
 * ocorrência foi despachada às 21h46 no painel e nunca apareceu no aparelho, e
 * a única coisa que o aplicativo dizia era "Não deu para atualizar agora". A
 * causa não era rede: a sessão daquele aparelho tinha sido revogada pelo
 * servidor nove horas antes, e desde então TODA chamada respondia 401. O
 * aplicativo tratava isso como sinal ruim, que é o defeito: sinal ruim passa
 * sozinho, sessão encerrada não passa nunca, e as duas frases mandavam o
 * agente fazer a mesma coisa (esperar).
 *
 * São três desfechos porque são três atos diferentes:
 *
 * | Motivo | O que o agente faz |
 * | --- | --- |
 * | `sem-sinal` | espera o sinal voltar, e continua trabalhando no que baixou |
 * | `sessao-encerrada` | entra de novo, e ATÉ LÁ nada novo desce |
 * | `outro` | tenta de novo daqui a pouco |
 *
 * Mora fora das telas porque as duas telas que vão à rede (a lista de hoje e o
 * perfil) precisam da mesma classificação, e porque o Rafa viu a mesma frase
 * errada nas duas.
 */

export type MotivoDaFalha = "sem-sinal" | "sessao-encerrada" | "outro";

/**
 * O status HTTP que veio dentro do erro, quando veio algum.
 *
 * Lê por FORMA, e não por `instanceof ErroDaApi`, e isso é deliberado. A
 * identidade de uma classe não atravessa bem fronteira de módulo: as suítes de
 * tela dublam `dados/api` inteiro, e um `instanceof` contra uma classe ausente
 * do dublê nem responde falso, ele estoura ("right-hand side is not
 * callable"). O que identifica uma resposta do servidor é ela carregar um
 * status numérico, e é isso que está perguntado aqui. É a mesma escolha que
 * `apps/api/src/servidor.ts` já faz para reconhecer erro de esquema vindo de
 * outra cópia do zod.
 */
function statusDaResposta(erro: unknown): number | null {
  if (typeof erro !== "object" || erro === null) return null;
  const status = (erro as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

export function motivoDaFalha(erro: unknown): MotivoDaFalha {
  /*
    O 401 vem na frente do `SemSinal` de propósito: um erro que carrega status
    é resposta do servidor, ou seja, a requisição CHEGOU. Não há sinal a
    esperar.
  */
  if (statusDaResposta(erro) === 401) return "sessao-encerrada";
  if (erro instanceof SemSinal) return "sem-sinal";
  return "outro";
}

/**
 * O que a tela escreve, em duas alturas.
 *
 * `resumo` cabe numa linha (é o que a faixa da lista de hoje mostra) e
 * `detalhe` é o texto inteiro, que o agente abre quando quiser.
 *
 * `oQueSobrouNaTela` é a única parte que muda de tela para tela: na lista é a
 * lista baixada, no perfil é o que já estava no aparelho. Falhar em atualizar
 * NÃO é falhar em mostrar, e a frase precisa dizer isso onde quer que apareça.
 */
export function comoContarAFalha(
  motivo: MotivoDaFalha,
  oQueSobrouNaTela: string,
): { resumo: string; detalhe: string } {
  if (motivo === "sessao-encerrada") {
    return {
      /*
        Curto porque a faixa mostra UMA linha e corta o resto. No aparelho, a
        versão anterior saía como "Sua sessão terminou neste aparel…", e o que
        fazer ficava escondido atrás do toque no `ⓘ`. Em três palavras a frase
        inteira cabe, e o botão ao lado dela diz o resto.
      */
      resumo: "Sua sessão terminou",
      /*
        A frase NÃO diz "entre de novo" e para por aí. Sair da conta é o ato
        que o agente mais teme no fim do plantão (é o que ele acha que apaga a
        vistoria que ele fez no morro), então a promessa de que a fila
        sobrevive vem junto, no mesmo parágrafo. Ela é verdade e está provada:
        `apagarDadosLocais` deixa `fila_sincronizacao` de fora de propósito, e
        o item da fila carimba o autor, então a coleta sobe no nome de quem a
        fez quando ele entrar de novo.
      */
      detalhe:
        "O servidor não reconhece mais a sua entrada neste aparelho, então nenhuma "
        + "tarefa nova desce até você entrar outra vez. Vá em Perfil, toque em "
        + "\"Sair da conta\" e entre de novo com o seu email e a sua senha. O que "
        + "você já coletou continua guardado no aparelho e sobe sozinho depois disso.",
    };
  }
  if (motivo === "sem-sinal") {
    return {
      resumo: "Sem sinal para atualizar",
      detalhe: `Sem sinal para atualizar. ${oQueSobrouNaTela}`,
    };
  }
  return {
    resumo: "Não deu para atualizar agora",
    detalhe: `Não deu para atualizar agora. ${oQueSobrouNaTela}`,
  };
}
