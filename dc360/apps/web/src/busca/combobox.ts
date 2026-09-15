/**
 * A máquina de estados da caixa de comando, fora do React.
 *
 * Como em `Modal.tsx`, o comportamento fica escrito como decisão e não como
 * efeito colateral, para ser provado sem navegador: o que cada tecla faz com
 * a lista aberta ou fechada, com item ativo ou sem, é o contrato do pedido,
 * e o contrato precisa de teste que reprove quando alguém o mudar.
 */

/** Milissegundos depois da última tecla antes de perguntar ao servidor. */
export const ATRASO_DA_BUSCA_MS = 200;

/** Menor consulta que vale uma pergunta (o servidor recusa abaixo disso). */
export const CONSULTA_MINIMA = 2;
/** Maior consulta que o servidor aceita. */
export const CONSULTA_MAXIMA = 100;

export type DecisaoDaBusca =
  | { acao: "seguir" }
  | { acao: "abrir" }
  | { acao: "mover"; ativo: number }
  | { acao: "fechar" }
  | { acao: "limpar" }
  | { acao: "escolher"; indice: number }
  | { acao: "enviar" };

export type EstadoDoTeclado = {
  tecla: string;
  aberta: boolean;
  /** Índice do item ativo na lista achatada, ou nenhum. */
  ativo: number | null;
  total: number;
  temTexto: boolean;
};

/**
 * O que a tecla faz.
 *
 * - seta para baixo com a lista fechada abre; aberta, anda e dá a volta;
 * - Enter com item ativo escolhe; SEM item ativo envia, que é o caminho
 *   antigo (a lista de ocorrências com `?busca=`), preservado de propósito
 *   para quem já digita o protocolo e dá Enter;
 * - Escape fecha a lista aberta; fechada, limpa o texto;
 * - Tab fecha e segue: isto é um menu suspenso, não uma janela.
 */
export function decidirTeclaDaBusca(e: EstadoDoTeclado): DecisaoDaBusca {
  const { tecla, aberta, ativo, total } = e;

  if (tecla === "ArrowDown") {
    if (!aberta) return { acao: "abrir" };
    if (total === 0) return { acao: "seguir" };
    return { acao: "mover", ativo: ativo === null ? 0 : (ativo + 1) % total };
  }
  if (tecla === "ArrowUp") {
    if (!aberta) return { acao: "abrir" };
    if (total === 0) return { acao: "seguir" };
    return { acao: "mover", ativo: ativo === null ? total - 1 : (ativo - 1 + total) % total };
  }
  if (tecla === "Home" && aberta && total > 0) return { acao: "mover", ativo: 0 };
  if (tecla === "End" && aberta && total > 0) return { acao: "mover", ativo: total - 1 };

  if (tecla === "Enter") {
    if (aberta && ativo !== null && ativo < total) return { acao: "escolher", indice: ativo };
    return { acao: "enviar" };
  }
  if (tecla === "Escape") {
    if (aberta) return { acao: "fechar" };
    return e.temTexto ? { acao: "limpar" } : { acao: "seguir" };
  }
  if (tecla === "Tab") return aberta ? { acao: "fechar" } : { acao: "seguir" };

  return { acao: "seguir" };
}

/** O id de cada opção da lista, que `aria-activedescendant` aponta. */
export function idDaOpcao(indice: number): string {
  return `busca-global-opcao-${indice}`;
}

/** Ctrl+K no Windows e Linux, Cmd+K no Mac. Alt junto não é o atalho. */
export function ehAtalhoDeFoco(e: { tecla: string; ctrl: boolean; meta: boolean; alt: boolean }): boolean {
  return e.tecla.toLowerCase() === "k" && (e.ctrl || e.meta) && !e.alt && !(e.ctrl && e.meta);
}

/** A dica escrita na caixa, na língua do teclado da máquina. */
export function rotuloDoAtalho(plataforma: string): string {
  return /mac|iphone|ipad/i.test(plataforma) ? "⌘ K" : "Ctrl K";
}

export type SituacaoDoServidor = "ocioso" | "buscando" | "ok" | "falhou";

/**
 * A frase do `aria-live`: quantos resultados há, e o que o servidor está
 * fazendo. É lida em voz baixa a cada mudança, então é curta.
 */
export function fraseDeEstado(e: {
  consulta: string; total: number; situacao: SituacaoDoServidor;
}): string {
  if (e.situacao === "ocioso" && e.total === 0) return "";
  const contagem = e.total === 1 ? "1 resultado" : `${e.total} resultados`;
  if (e.situacao === "buscando") return `${contagem}, buscando no servidor`;
  if (e.total === 0) {
    const nada = `Nada encontrado para ${e.consulta}`;
    return e.situacao === "falhou" ? `Sem sinal com o servidor. ${nada}` : nada;
  }
  return contagem;
}
