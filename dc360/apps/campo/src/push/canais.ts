import type { Severidade } from "@dc360/shared";

import type { TipoDeAviso } from "./aviso";

/**
 * Três canais no Android: o despacho toca sempre, o prazo toca por severidade.
 *
 * ## A decisão de 15/09/2026, e o argumento que ela substitui
 *
 * O pedido, na letra de quem paga: "o celular do usuário agente de campo deve
 * obrigatoriamente ser notificado, vibrado ou sonoro, que ele recebeu uma nova
 * ocorrência, com som característico". Até esta data o som só tocava para
 * severidade alta e crítica, inclusive na tarefa nova, e o argumento era de
 * disponibilidade: um aviso de severidade baixa tocando às três da manhã
 * ensina o agente a silenciar o aplicativo inteiro nos ajustes do sistema, e a
 * partir daí o aviso crítico também não toca, sem ninguém no servidor saber.
 *
 * O argumento continua verdadeiro, mas ele descreve o PRAZO, não o despacho.
 * Prazo é relógio: dispara sozinho, de madrugada, para uma ocorrência que já
 * estava na lista, e ninguém decidiu acordar ninguém. Despacho é uma pessoa
 * decidindo AGORA que esta equipe vai: quem despacha às três da manhã precisa
 * da equipe às três da manhã, e o despacho que não é ouvido é a razão inteira
 * de o aplicativo existir deixando de acontecer. Ele é raro (algumas vezes por
 * turno, no pior dia) e é sempre trabalho de verdade, então ele toca em toda
 * severidade, com um som próprio que o agente reconhece de olhos fechados.
 *
 * O que devolve a escolha para quem trabalha é o CANAL: no Android o canal é a
 * unidade que a pessoa liga e desliga nos ajustes. Quem realmente não quiser o
 * som do despacho pode calar o canal de despacho e manter os outros dois, e
 * essa é uma decisão dela, informada pela descrição do canal. O aplicativo não
 * decide por ela, nem para mais (`bypassDnd` fica de fora: furar o "Não
 * perturbe" é escolha da pessoa nos ajustes) nem para menos.
 *
 * ## Por que o canal de despacho é NOVO, e por que os dois antigos ficam
 *
 * O Android congela som, vibração e importância de um canal no momento em que
 * ele é criado. Mudar os valores no código e reinstalar não muda o canal já
 * existente no aparelho: só apagar o aplicativo, ou criar um canal com
 * identificador NOVO. Trocar o som do canal de urgência para o de despacho não
 * chegaria a nenhum aparelho que já tem o aplicativo. Por isso o despacho ganha
 * `dc360.despacho.v1`, um identificador que nenhum aparelho tem, e que nasce
 * com o som certo em todos eles. O sufixo de versão continua no nome pela
 * mesma razão de sempre: no dia em que o som mudar, o caminho é `v2`.
 *
 * Os dois antigos (`dc360.urgencia.v1` e `dc360.comum.v1`) NÃO são apagados,
 * porque continuam servindo ao aviso de prazo, e o prazo continua na regra de
 * severidade. O que muda neles é só o nome e a descrição, que passam a falar
 * de prazo, e nome e descrição são as duas coisas que o Android DEIXA mudar
 * num canal existente. `deleteNotificationChannelAsync` foi considerado e
 * descartado: apagar e recriar com o mesmo id não descongela nada (o Android
 * lembra do canal apagado), e apagar de vez tiraria do agente a escolha de
 * calar o prazo comum e manter o urgente.
 *
 * ## O iOS não entra aqui
 *
 * Lá não existe canal: quem escolhe o som é o servidor, no `aps`, e o que a
 * pessoa desliga é o aplicativo inteiro. É por isso que o pedido de permissão
 * (ver `permissao.ts`) importa tanto mais nessa plataforma.
 */

export const CANAL_DESPACHO = "dc360.despacho.v1";
export const CANAL_URGENCIA = "dc360.urgencia.v1";
export const CANAL_COMUM = "dc360.comum.v1";

/**
 * O som característico do despacho: o nome do arquivo, com extensão.
 *
 * É o mesmo nome nas duas lojas e no servidor: o iOS procura `aps.sound` pelo
 * nome no bundle; o Android resolve o recurso em `res/raw` tirando a extensão;
 * o servidor manda o mesmo texto no `aps`. O arquivo é gerado por
 * `scripts/gerar-som-de-despacho.mjs` e declarado ao plugin em `app.config.ts`.
 */
export const SOM_DE_DESPACHO = "despacho.wav";

/**
 * O padrão de vibração do despacho, em milissegundos: espera, vibra, espera,
 * vibra, espera, vibra. Três pulsos de 300 ms, que é o que se sente no bolso
 * com o telefone dentro de uma capa, e que dura o mesmo que o som.
 */
export const VIBRACAO_DE_DESPACHO: readonly number[] = [0, 300, 150, 300, 150, 300];

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
   * `maxima` interrompe como uma chamada (som, vibração, aviso por cima de
   * qualquer tela); `alta` toca, vibra e mostra por cima; `baixa` chega calada
   * e espera na aba de notificações.
   */
  importancia: "maxima" | "alta" | "baixa";
  /** Arquivo em `res/raw`, `"default"` para o som do sistema, `null` para silêncio. */
  som: string | null;
  /** O padrão de vibração, ou `null` para não vibrar. */
  vibracao: readonly number[] | null;
};

export const CANAIS: readonly DefinicaoDeCanal[] = [
  {
    id: CANAL_DESPACHO,
    nome: "Tarefa nova (despacho)",
    descricao:
      "A coordenação despachou uma ocorrência para a sua equipe. Toca o som de "
      + "despacho e vibra em qualquer severidade, inclusive de madrugada.",
    importancia: "maxima",
    som: SOM_DE_DESPACHO,
    vibracao: VIBRACAO_DE_DESPACHO,
  },
  {
    id: CANAL_URGENCIA,
    nome: "Prazo vencendo: alta e crítica",
    descricao:
      "Prazo vencendo de ocorrência de severidade alta ou crítica. "
      + "Toca e vibra, inclusive de madrugada.",
    importancia: "alta",
    som: "default",
    vibracao: [0, 250, 250, 250],
  },
  {
    id: CANAL_COMUM,
    nome: "Prazo vencendo: baixa e média",
    descricao:
      "Prazo vencendo de ocorrência de severidade baixa ou média. "
      + "Chega sem som, e espera você abrir o aplicativo.",
    importancia: "baixa",
    som: null,
    vibracao: null,
  },
];

/**
 * As severidades de PRAZO que valem acordar alguém.
 *
 * Lista, e não `>= alta`, porque severidade não é número neste produto: é uma
 * das quatro palavras da COBRADE, e comparar palavra por ordem alfabética
 * ("alta" < "baixa" < "critica" < "media") daria exatamente o resultado errado.
 */
const ACORDAM = new Set<Severidade>(["alta", "critica"]);

/** O que decide canal e som: o tipo do aviso primeiro, a severidade depois. */
export type ToqueDoAviso = {
  tipo: TipoDeAviso;
  severidade: Severidade | null;
};

/**
 * O canal de um aviso.
 *
 * Tarefa nova vai para o canal de despacho, sempre. Para o prazo, severidade
 * desconhecida cai no canal COMUM, e essa é a escolha segura das duas: errar
 * para o lado do silêncio custa um aviso que espera o agente abrir o
 * aplicativo; errar para o lado do som custa o aplicativo inteiro silenciado
 * nos ajustes.
 */
export function canalDoAviso(aviso: ToqueDoAviso): string {
  if (aviso.tipo === "tarefa_nova") return CANAL_DESPACHO;
  return aviso.severidade !== null && ACORDAM.has(aviso.severidade)
    ? CANAL_URGENCIA
    : CANAL_COMUM;
}

/**
 * Se o aviso pode fazer barulho.
 *
 * Serve ao iOS e ao aplicativo aberto, onde não existe canal para decidir por
 * nós: quem apresenta a notificação com o aplicativo na frente é o nosso
 * código, e ele precisa da mesma regra. Uma segunda lista de severidades aqui
 * seria a forma clássica de as duas discordarem em três meses, então a resposta
 * sai do mesmo lugar: som em todo canal que não é o comum.
 */
export function deveTocarSom(aviso: ToqueDoAviso): boolean {
  return canalDoAviso(aviso) !== CANAL_COMUM;
}
