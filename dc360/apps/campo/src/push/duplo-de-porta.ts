import type { DefinicaoDeCanal } from "./canais";
import type { EstadoDaPermissao } from "./permissao";
import type { Apresentacao, AvisoBruto, PortaDePush } from "./porta";

/**
 * O duplo de teste do sistema operacional.
 *
 * Existe para que a decisão que mais importa desta frente (descartar o aviso de
 * outro município) seja exercitada sem mandar mensagem de verdade para a Apple
 * nem para o Google. Mandar de verdade seria, além de caro, inútil como prova:
 * a Apple e o Google entregam quando querem, e um teste que depende disso
 * reprova por motivo que não é defeito e passa por motivo que não é acerto.
 *
 * Ele registra o que foi pedido a ele, para o teste poder afirmar o que
 * ACONTECEU (nenhuma navegação, nenhuma apresentação, a bandeja limpa) em vez
 * de afirmar que uma função foi chamada.
 */
export function criarDuploDePorta(inicio: {
  plataforma?: PortaDePush["plataforma"];
  permissao?: EstadoDaPermissao;
  ficha?: string | null;
  /** O que já está na bandeja quando o aplicativo abre. */
  bandeja?: AvisoBruto[];
  /** A notificação que abriu o aplicativo do zero, se houve. */
  aberturaAFrio?: AvisoBruto | null;
} = {}) {
  let permissao: EstadoDaPermissao = inicio.permissao ?? "nao_perguntada";
  let bandeja: AvisoBruto[] = [...(inicio.bandeja ?? [])];
  let decidir: ((bruto: unknown) => Apresentacao) | null = null;
  const ouvintesDeToque: ((aviso: AvisoBruto) => void)[] = [];

  const registro = {
    canaisCriados: [] as string[],
    ajustesAbertos: 0,
    perguntasAoSistema: 0,
    removidosDaBandeja: [] as string[],
    fichasPedidas: 0,
  };

  const porta: PortaDePush = {
    plataforma: inicio.plataforma ?? "android",

    async consultarPermissao() { return permissao; },

    async pedirPermissao() {
      registro.perguntasAoSistema += 1;
      return permissao;
    },

    async abrirAjustes() { registro.ajustesAbertos += 1; },

    async prepararCanais(canais: readonly DefinicaoDeCanal[]) {
      registro.canaisCriados = canais.map((c) => c.id);
    },

    async obterFicha() {
      registro.fichasPedidas += 1;
      return inicio.ficha === undefined ? "ficha-deste-aparelho" : inicio.ficha;
    },

    definirApresentacao(fn) { decidir = fn; },

    aoTocar(ouvinte) {
      ouvintesDeToque.push(ouvinte);
      return () => {
        const onde = ouvintesDeToque.indexOf(ouvinte);
        if (onde >= 0) ouvintesDeToque.splice(onde, 1);
      };
    },

    async avisoQueAbriuOAplicativo() { return inicio.aberturaAFrio ?? null; },

    async listarNaBandeja() { return [...bandeja]; },

    async removerDaBandeja(identificador) {
      registro.removidosDaBandeja.push(identificador);
      bandeja = bandeja.filter((a) => a.identificador !== identificador);
    },
  };

  return {
    porta,
    registro,

    /** O que a bandeja tem agora, depois das varreduras. */
    naBandeja: () => bandeja.map((a) => a.identificador),

    /** Faz chegar um aviso com o aplicativo aberto, e devolve o que a tela faria. */
    chegarComOAplicativoAberto(bruto: unknown): Apresentacao {
      if (!decidir) throw new Error("o aplicativo ainda não decidiu como apresentar");
      return decidir(bruto);
    },

    /** A pessoa tocou numa notificação. */
    tocarEm(aviso: AvisoBruto): void {
      for (const ouvinte of [...ouvintesDeToque]) ouvinte(aviso);
    },

    /** O sistema mudou de ideia sobre a permissão (a pessoa respondeu a caixa). */
    definirPermissao(nova: EstadoDaPermissao): void { permissao = nova; },
  };
}
