/**
 * O que aparece na tela bloqueada, e o que só aparece depois de destravar.
 *
 * ISTO É REQUISITO DE PRIVACIDADE, e não de estilo de texto.
 *
 * A notificação sai daqui, atravessa a fronteira, passa por servidor da Apple
 * ou do Google e chega ao aparelho. No caminho ela é legível para o
 * intermediário, e no destino ela fica escrita na tela bloqueada, à vista de
 * quem estiver por perto: o parente na sala, o vizinho na fila, a pessoa cujo
 * imóvel está prestes a ser interditado.
 *
 * Uma notificação que diz "Interdição em Servidão Boa Esperança, 148" entrega
 * o endereço de uma família em situação de risco a todo mundo que olhar o
 * telefone de longe. Por isso a VITRINE (título e corpo) diz somente que há
 * tarefa nova ou prazo vencendo, e o DETALHE viaja no dado da mensagem, que o
 * aplicativo lê depois que o agente destrava o aparelho.
 *
 * A decisão está registrada em `docs/SUBPROCESSADORES.md`, seção 2.1.
 */

export type TipoDeAviso = "tarefa_nova" | "prazo_vencendo";

export type DetalheDoAviso = {
  /**
   * O município a que este aviso pertence, e ele NÃO é enfeite.
   *
   * A ficha de push é única por aparelho físico, e a migração 016 aceita, de
   * propósito, que a mesma ficha fique viva em dois municípios (o motivo e o
   * custo estão escritos lá). Este campo é a barreira que fecha o custo: o
   * aplicativo DESCARTA o aviso cujo município não for o da pessoa logada, e
   * com isso o dado de uma prefeitura não abre na tela de quem hoje trabalha
   * para outra.
   */
  organizacaoId: string;
  ocorrenciaId: string;
  severidade: string | null;
  prazoEm: string | null;
};

export type Notificacao = {
  /** Vitrine: o que fica legível na tela bloqueada. */
  titulo: string;
  corpo: string;
  /** Só o aplicativo lê, depois de destravar. */
  dados: Record<string, string>;
};

/**
 * A vitrine é constante, e é constante de propósito.
 *
 * Qualquer interpolação aqui é um vazamento em potencial, então não existe
 * interpolação: o texto não recebe parâmetro nenhum. O que muda entre um
 * aviso e outro é o tipo, e só.
 */
const VITRINE: Record<TipoDeAviso, { titulo: string; corpo: string }> = {
  tarefa_nova: {
    titulo: "Nova tarefa",
    corpo: "A sua equipe recebeu uma tarefa. Abra o aplicativo para ver.",
  },
  prazo_vencendo: {
    titulo: "Prazo vencendo",
    corpo: "Uma tarefa da sua equipe está perto do prazo. Abra o aplicativo para ver.",
  },
};

/** O que fica legível sem destravar o aparelho. */
export function textoVisivel(notificacao: Notificacao): string {
  return `${notificacao.titulo} ${notificacao.corpo}`;
}

export class VitrineIndiscreta extends Error {}

export function montarAviso(tipo: TipoDeAviso, detalhe: DetalheDoAviso): Notificacao {
  const dados: Record<string, string> = {
    tipo,
    organizacaoId: detalhe.organizacaoId,
    ocorrenciaId: detalhe.ocorrenciaId,
    /*
      SEVERIDADE VAI, PROTOCOLO E ENDERECO NAO, e a diferenca nao e de tamanho.

      O dado da mensagem tambem atravessa a fronteira: ele passa pelo servidor
      da Apple ou do Google junto com a vitrine. `docs/SUBPROCESSADORES.md`
      secao 2.3 limita o que sai do pais ao minimo, e endereco de imovel
      vistoriado pela Defesa Civil identifica pessoa quando cruzado com o
      resto, exatamente como a secao 2.2 diz da coordenada do mapa.

      O aplicativo NAO precisa deles: ele ja tem a ocorrencia no disco, e o
      `ocorrenciaId` e suficiente para abri-la. Para a tarefa que ele ainda nao
      baixou, a tela diz isso e oferece atualizar, que e melhor do que mandar o
      endereco da familia para fora para economizar um toque.

      A severidade fica porque ela escolhe o canal de notificacao no Android
      (som so para alta e critica) e precisa ser conhecida ANTES de o aplicativo
      abrir. Ela e uma palavra de quatro valores possiveis e nao diz nada sobre
      pessoa nenhuma.
    */
    ...(detalhe.severidade ? { severidade: detalhe.severidade } : {}),
    ...(detalhe.prazoEm ? { prazoEm: detalhe.prazoEm } : {}),
  };

  const notificacao: Notificacao = { ...VITRINE[tipo], dados };

  /*
    Trava de tempo de execução, além do teste.

    Hoje ela não pode disparar, porque a vitrine é constante. Ela existe para o
    dia em que alguém achar que "Prazo vencendo no protocolo 000123/2026" é
    mais útil, editar o texto acima e não lembrar do motivo. Nesse dia o envio
    daquela notificação falha e fica registrado como falha, em vez de o
    endereço de uma família aparecer na tela bloqueada de um telefone em cima
    do balcão.

    Falhar aqui não derruba a API nem a requisição que originou o aviso: quem
    chama é o varredor, que trata a falha de cada notificação separadamente.
  */
  const visivel = textoVisivel(notificacao).toLowerCase();
  for (const [campo, valor] of Object.entries(dados)) {
    if (campo === "tipo") continue;
    if (valor.length < 3) continue;
    if (visivel.includes(valor.toLowerCase())) {
      throw new VitrineIndiscreta(
        `O texto visível da notificação carrega o campo "${campo}". Ele passa por ` +
        "servidor fora do país e fica legível na tela bloqueada, na mão de quem " +
        "estiver por perto. Detalhe vai no dado da mensagem, nunca na vitrine.",
      );
    }
  }

  return notificacao;
}
