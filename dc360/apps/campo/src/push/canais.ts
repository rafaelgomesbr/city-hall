import type { Severidade } from "@dc360/shared";

/**
 * Dois canais no Android, e som só para alta e crítica.
 *
 * O defeito que isto evita não é de etiqueta, é de disponibilidade: um prazo de
 * severidade baixa tocando às três da manhã ensina o agente a silenciar o
 * aplicativo inteiro, nos ajustes do sistema, de uma vez só. A partir desse
 * momento o aviso de severidade crítica também não toca, e ninguém no servidor
 * fica sabendo, porque a entrega continua sendo bem sucedida. O aplicativo
 * segue registrado, o varredor segue marcando "entregue", e o telefone fica
 * mudo justamente na noite de temporal.
 *
 * Separar em dois canais devolve a escolha para quem trabalha: no Android o
 * canal é a unidade que a pessoa liga e desliga nos ajustes. Ela pode calar o
 * canal comum e manter o de urgência, que é a decisão que faz sentido para
 * quem está de plantão. Com um canal só, a única escolha disponível é tudo ou
 * nada, e quem é acordado às três da manhã escolhe nada.
 *
 * ## Por que o canal não pode ser trocado depois
 *
 * O Android congela som, vibração e importância de um canal no momento em que
 * ele é criado. Mudar os valores no código e reinstalar não muda o canal já
 * existente no aparelho: só apagar o aplicativo, ou criar um canal com
 * identificador NOVO. Por isso os identificadores abaixo têm versão no nome. Se
 * um dia o som de um deles precisar mudar, o caminho é criar
 * `dc360.urgencia.v2` e apagar o anterior, e não editar estes valores achando
 * que eles chegam ao aparelho que já tem o aplicativo instalado.
 *
 * ## O iOS não entra aqui
 *
 * Lá não existe canal: quem escolhe o som é o servidor, no `aps`, e o que a
 * pessoa desliga é o aplicativo inteiro. É por isso que o pedido de permissão
 * (ver `permissao.ts`) importa tanto mais nessa plataforma.
 */

export const CANAL_URGENCIA = "dc360.urgencia.v1";
export const CANAL_COMUM = "dc360.comum.v1";

/**
 * A definição de um canal, sem tipo nenhum do `expo-notifications`.
 *
 * Deliberado: assim esta regra é lida e provada sem aparelho e sem o módulo
 * nativo, e o adaptador (`PortaExpo.ts`) fica com uma tradução tão curta que
 * não tem onde esconder decisão.
 */
export type DefinicaoDeCanal = {
  id: string;
  /** O que a pessoa lê na lista de notificações dos ajustes do Android. */
  nome: string;
  /** A frase que explica, na mesma tela, o que cai neste canal. */
  descricao: string;
  /**
   * `urgente` interrompe (som, vibração e aviso por cima da tela); `comum`
   * chega calado e espera na aba de notificações.
   */
  peso: "urgente" | "comum";
};

export const CANAIS: readonly DefinicaoDeCanal[] = [
  {
    id: CANAL_URGENCIA,
    nome: "Urgente: alta e crítica",
    descricao:
      "Tarefa nova e prazo vencendo de ocorrência de severidade alta ou crítica. "
      + "Toca e vibra, inclusive de madrugada.",
    peso: "urgente",
  },
  {
    id: CANAL_COMUM,
    nome: "Comum: baixa e média",
    descricao:
      "Tarefa nova e prazo vencendo de ocorrência de severidade baixa ou média. "
      + "Chega sem som, e espera você abrir o aplicativo.",
    peso: "comum",
  },
];

/**
 * As severidades que valem acordar alguém.
 *
 * Lista, e não `>= alta`, porque severidade não é número neste produto: é uma
 * das quatro palavras da COBRADE, e comparar palavra por ordem alfabética
 * ("alta" < "baixa" < "critica" < "media") daria exatamente o resultado errado.
 */
const ACORDAM = new Set<Severidade>(["alta", "critica"]);

/**
 * O canal de um aviso.
 *
 * Severidade desconhecida cai no canal COMUM, e essa é a escolha segura das
 * duas. Errar para o lado do silêncio custa um aviso que espera o agente abrir
 * o aplicativo; errar para o lado do som custa o aplicativo inteiro silenciado
 * nos ajustes, que é o defeito que este arquivo existe para evitar.
 */
export function canalDoAviso(severidade: Severidade | null): string {
  return severidade !== null && ACORDAM.has(severidade) ? CANAL_URGENCIA : CANAL_COMUM;
}

/**
 * Se o aviso pode fazer barulho.
 *
 * Serve ao iOS e ao aplicativo aberto, onde não existe canal para decidir por
 * nós: quem apresenta a notificação com o aplicativo na frente é o nosso
 * código, e ele precisa da mesma regra. Uma segunda lista de severidades aqui
 * seria a forma clássica de as duas discordarem em três meses, então a resposta
 * sai do mesmo lugar.
 */
export function deveTocarSom(severidade: Severidade | null): boolean {
  return canalDoAviso(severidade) === CANAL_URGENCIA;
}
