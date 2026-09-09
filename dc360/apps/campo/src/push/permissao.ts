/**
 * Quando pedir permissão de notificação, e por que nunca na primeira abertura.
 *
 * No iOS a recusa é DEFINITIVA. O sistema mostra a caixa uma vez por
 * instalação, e depois disso `requestPermissionsAsync` volta negada na hora,
 * sem desenhar nada na tela. Não existe segunda chance: o único caminho de
 * volta é a pessoa entrar nos ajustes do sistema, achar o aplicativo e ligar na
 * mão. O Android 13 em diante ficou parecido, com duas recusas em vez de uma.
 *
 * Isso transforma o MOMENTO do pedido na decisão mais cara desta parte do
 * produto. Pedir na primeira abertura, antes de a pessoa entender o que o
 * aplicativo faz, é pedir para alguém que ainda não sabe o que está
 * autorizando, e a resposta natural nessa situação é não. O agente que recusa
 * ali nunca mais recebe aviso de prazo, e ninguém descobre: o servidor não tem
 * como saber que a notificação foi entregue a um aparelho que não a mostra.
 *
 * Por isso a régua deste arquivo tem três partes:
 *
 * 1. **Nunca antes do primeiro login.** É um portão duro, e não uma
 *    preferência: sem sessão a resposta é sempre "não pergunte".
 * 2. **Uma frase antes da caixa do sistema.** O convite é uma tela nossa, que
 *    diz para que serve e pode ser recusada sem gastar a única pergunta que o
 *    sistema concede. Quem toca em "Agora não" continua podendo ligar depois;
 *    quem toca em "Ligar os avisos" é levado à caixa do sistema já sabendo o
 *    que ela pergunta.
 * 3. **Nunca insistir.** Convite mostrado é convite gasto. Repetir a cada
 *    abertura é o que ensina a pessoa a tocar "não" por reflexo, e o caminho
 *    para quem mudou de ideia fica em "Minha conta", onde ela procura quando
 *    quiser, em vez de aparecer quando ela não quer.
 */

/** O que o sistema operacional responde quando perguntamos, sem perguntar a ele. */
export type EstadoDaPermissao =
  /** Já pode notificar. */
  | "concedida"
  /** O sistema já perguntou e a resposta foi não. Só os ajustes reabrem. */
  | "negada"
  /** O sistema ainda não perguntou nada a esta pessoa. */
  | "nao_perguntada"
  /** Este build ou este aparelho não tem notificação (emulador, web, loja sem push). */
  | "indisponivel";

export type PassoDaPermissao =
  /** Não faça nada agora. */
  | "nada"
  /** Mostre o convite deste aplicativo, e só depois chame o sistema. */
  | "convidar";

/**
 * O que fazer agora, olhando o estado do sistema e o da sessão.
 *
 * Recebe `jaConvidou` de fora, e não guarda estado próprio, porque essa memória
 * precisa sobreviver ao aplicativo ser fechado: guardada aqui, ela morreria a
 * cada abertura e o convite voltaria todo dia, que é exatamente o que a régua
 * acima proíbe.
 */
export function proximoPasso({
  estado,
  temSessao,
  jaConvidou,
}: {
  estado: EstadoDaPermissao;
  temSessao: boolean;
  jaConvidou: boolean;
}): PassoDaPermissao {
  /*
    O portão duro, e ele vem PRIMEIRO de propósito.

    Escrito depois das outras condições, uma linha nova acrescentada por
    engano acima dele passaria a perguntar antes do login sem ninguém notar na
    revisão, e o custo desse descuido no iOS é permanente.
  */
  if (!temSessao) return "nada";

  if (estado === "concedida") return "nada";
  if (estado === "indisponivel") return "nada";

  /*
    Negada NÃO vira convite. A caixa do sistema não abriria de novo, então o
    convite seria um botão que promete uma tela que não aparece, e a pessoa
    concluiria que o aplicativo está quebrado. Para quem recusou existe o
    caminho dos ajustes, oferecido em "Minha conta".
  */
  if (estado === "negada") return "nada";

  return jaConvidou ? "nada" : "convidar";
}

/**
 * Se vale oferecer o atalho para os ajustes do sistema.
 *
 * Só para quem recusou: para quem já concedeu o atalho não resolve nada, e para
 * quem nunca foi perguntado ele é pior do que o convite, porque manda a pessoa
 * a uma tela do sistema em vez de fazer a pergunta de dentro do aplicativo.
 */
export function ofereceAjustes(estado: EstadoDaPermissao): boolean {
  return estado === "negada";
}

/**
 * A frase que "Minha conta" mostra sobre o estado dos avisos.
 *
 * Mora aqui, e não na tela, porque é a mesma régua vista por outro lado: quatro
 * estados, quatro frases, e nenhuma delas pode dizer "erro". Não receber aviso
 * de push não é defeito do aplicativo, e chamar de erro faria o agente ligar
 * para a coordenação por causa de uma escolha dele mesmo.
 */
export function frasesDoEstado(estado: EstadoDaPermissao): { titulo: string; texto: string } {
  switch (estado) {
    case "concedida":
      return {
        titulo: "Ligados",
        texto:
          "Este aparelho recebe aviso de tarefa nova e de prazo vencendo. O que "
          + "aparece na tela bloqueada não traz endereço nem protocolo.",
      };
    case "negada":
      return {
        titulo: "Desligados",
        texto:
          "Você não vai ser avisado de tarefa nova nem de prazo vencendo. As "
          + "tarefas continuam aparecendo quando você abre o aplicativo. Para "
          + "voltar a receber, ligue as notificações nos ajustes do aparelho.",
      };
    case "nao_perguntada":
      return {
        titulo: "Ainda não ligados",
        texto:
          "Este aparelho ainda não foi autorizado a avisar sobre tarefa nova e "
          + "prazo vencendo.",
      };
    case "indisponivel":
      return {
        titulo: "Não disponíveis neste aparelho",
        texto:
          "Este aparelho não recebe notificação. As tarefas continuam aparecendo "
          + "quando você abre o aplicativo.",
      };
  }
}
