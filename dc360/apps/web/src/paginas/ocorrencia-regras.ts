import {
  encerramentoSchema, estadoTerminal, podeExecutar,
  type Papel, type StatusOcorrencia, type TipoCobrade,
} from "@dc360/shared";

/**
 * As decisões da tela de ocorrência que não dependem de React.
 *
 * Elas moram aqui, e não dentro do JSX, porque decisão escondida num `&&` no
 * meio de mil linhas de componente não tem como ser exercitada: este painel
 * não roda em navegador de teste, então uma condição errada só é pega por
 * quem lê o diff com atenção. Foi exatamente assim que "Encerrar ocorrência"
 * passou a aparecer colado na triagem sem ninguém notar. Como função pura,
 * cada regra tem teste que roda em milissegundos.
 */

/**
 * Quando o painel OFERECE o encerramento.
 *
 * Isto não é controle de acesso, e também não é a regra de domínio. O
 * controle continua sendo `exigirPermissao` no servidor, e o domínio continua
 * aceitando encerrar a partir de "registrada" (ver `TRANSICOES_PERMITIDAS`),
 * de propósito, porque chamado improcedente existe e a rua não espera.
 *
 * O que esta função resolve é outra coisa. Numa ocorrência recém registrada a
 * coluna esquerda desenhava, grudados e nesta ordem: "Dados do chamado",
 * "Classificar na triagem" e "Encerrar ocorrência", com botão vermelho.
 * Ninguém tinha pedido para encerrar nada, e o encerramento é irreversível:
 * a trilha não tem policy de UPDATE nem de DELETE, então o evento gravado por
 * engano fica lá para sempre. O painel passa a oferecer o encerramento depois
 * que o caso saiu do estado em que a única coisa conhecida é o telefonema.
 * Quem precisa encerrar por improcedência classifica na triagem primeiro, e
 * a triagem fica registrada dizendo que alguém olhou o caso antes de fechar.
 */
export function podeOferecerEncerramento(papel: Papel, status: StatusOcorrencia): boolean {
  if (!podeExecutar(papel, "encerrar_ocorrencia")) return false;
  // Encerrada é o estado do qual não se sai: oferecer de novo só produziria
  // um segundo evento de encerramento, que seria mentira gravada.
  if (estadoTerminal(status)) return false;
  return status !== "rascunho" && status !== "registrada";
}

/** Em qual dos dois toques o encerramento está. */
export type PassoDoEncerramento = "editando" | "confirmando";

export type DecisaoDeEncerramento =
  | { tipo: "erro"; mensagem: string }
  | { tipo: "perguntar" }
  | { tipo: "gravar"; motivo: string };

/**
 * O que o próximo toque no botão vermelho faz.
 *
 * O painel inteiro não tinha uma única confirmação até aqui, e a única
 * barreira entre um clique distraído e o encerramento definitivo era um campo
 * de motivo que o esquema compartilhado aceita com um caractere. Um "x"
 * digitado sem querer passava.
 *
 * A validação vem ANTES da pergunta de propósito: confirmar primeiro e
 * descobrir depois que o motivo está vazio faria a pessoa confirmar duas
 * vezes o mesmo encerramento, e confirmação que se repete é confirmação que
 * se aprende a clicar sem ler.
 */
export function proximoPassoDoEncerramento(
  passo: PassoDoEncerramento,
  motivoDigitado: string,
): DecisaoDeEncerramento {
  const resultado = encerramentoSchema.safeParse({ motivo: motivoDigitado.trim() });
  if (!resultado.success) {
    return { tipo: "erro", mensagem: resultado.error.issues[0]?.message ?? "Dados inválidos" };
  }
  if (passo === "editando") return { tipo: "perguntar" };
  return { tipo: "gravar", motivo: resultado.data.motivo };
}

/**
 * O texto do botão em cada passo.
 *
 * O protocolo entra no rótulo da confirmação porque quem coordena trabalha
 * com várias ocorrências abertas em abas diferentes, e um "Confirmar" pelado
 * não dá nenhuma chance de perceber que a aba da frente é a do caso errado.
 */
export function rotuloDoBotaoDeEncerrar(
  passo: PassoDoEncerramento,
  protocolo: string,
  gravando: boolean,
): string {
  if (gravando) return "Encerrando";
  if (passo === "confirmando") return `Confirmar encerramento de ${protocolo}`;
  return "Encerrar ocorrência";
}

/* ============================================================
   O aviso de que a ocorrência nasceu
   ============================================================ */

/**
 * A frase que a pessoa recebe ao chegar na ocorrência recém registrada.
 *
 * Ela conserta um buraco de produto: quem registrava o chamado era jogado na
 * tela de detalhe sem nenhum sinal de que a gravação deu certo, e sem o número
 * do protocolo dito em lugar nenhum além do título, que a pessoa ainda não
 * sabia ser o protocolo. Com o telefone no ombro, a pergunta imediata é "posso
 * passar o número para quem está na linha?", e a tela não respondia.
 *
 * Duas decisões dentro dela:
 *
 * - o PROTOCOLO vem inteiro na frase. Ele é lido do registro que já está na
 *   tela, então o número anunciado é o mesmo do título por construção, e não
 *   por coincidência;
 * - o PRÓXIMO PASSO muda com o papel de quem está olhando. O operador de
 *   plantão não classifica, e mandá-lo "classificar na triagem" seria mandar
 *   fazer uma coisa que o servidor vai recusar. Ele precisa saber que o
 *   chamado agora espera a coordenação, para poder dizer isso ao morador.
 *
 * É função pura, e não texto solto no meio do JSX, pelo motivo de sempre nesta
 * pasta: condição escondida dentro de um componente que só roda em navegador
 * não tem como ser exercitada.
 */
export function avisoDoRegistro(
  { protocolo, papel }: { protocolo: string; papel: Papel },
): string {
  const proximo = podeExecutar(papel, "classificar_triagem")
    ? "Próximo passo: classificar na triagem, que é o que define a severidade e o prazo."
    : "Próximo passo: a coordenação classifica na triagem, que é o que define o prazo.";
  return `Ocorrência registrada com o protocolo ${protocolo}. ${proximo}`;
}

/* ============================================================
   Ver também
   ============================================================ */

export type RelacaoVerTambem = "continuacao" | "mesmo_evento" | "mesmo_endereco";

/**
 * O mínimo que este painel precisa saber de uma ocorrência VIZINHA.
 *
 * O tipo é estreito por decisão de privacidade, não por economia. A consulta
 * de vizinhança do modo local devolve `SELECT o.*`, o que inclui o relato do
 * solicitante e a descrição da vulnerabilidade social. Espalhar essa linha na
 * lista imprimiria, num cartão lateral que qualquer pessoa com acesso à tela
 * enxerga, que existe idosa acamada no número tal, de um caso que essa pessoa
 * nem abriu. O laudo apontou isso, e a defesa não é lembrar de não usar o
 * campo: é o campo não chegar até aqui.
 */
export type OcorrenciaRelacionada = {
  id: string;
  protocolo: string;
  status: StatusOcorrencia;
  criado_em: string;
};

export type ItemVerTambem = {
  id: string;
  protocolo: string;
  status: StatusOcorrencia;
  criadoEm: string;
  /**
   * Nulo quando o tipo não é conhecido. Os chamados vinculados chegam sem
   * ele, e inventar um seria pior que omitir.
   */
  tipo: TipoCobrade | null;
  relacao: RelacaoVerTambem;
};

/**
 * Monta a lista do cartão "Ver também".
 *
 * O cartão existia com título, um único link "Voltar para a lista" (que
 * duplicava o botão Voltar do topo) e nenhuma fonte de dados: era uma gaveta
 * vazia com nome de gaveta cheia. As duas fontes que faltavam já estavam na
 * página ou a uma consulta de distância.
 *
 * A ordem é de vínculo mais forte para mais fraco, e a deduplicação segue
 * essa ordem: um chamado que é continuação deste E foi aberto no mesmo
 * endereço aparece uma vez só, como continuação, que é o que descreve melhor
 * a relação. A própria ocorrência entra na lista de vistos antes de tudo,
 * porque a consulta por endereço encontra ela mesma.
 */
export function montarVerTambem(entrada: {
  ocorrenciaId: string;
  tipo: TipoCobrade;
  vinculadaA: OcorrenciaRelacionada | null;
  vinculadas: readonly OcorrenciaRelacionada[];
  mesmoEndereco: readonly OcorrenciaRelacionada[];
}): ItemVerTambem[] {
  const vistos = new Set<string>([entrada.ocorrenciaId]);
  const itens: ItemVerTambem[] = [];

  function juntar(
    o: OcorrenciaRelacionada,
    relacao: RelacaoVerTambem,
    tipo: TipoCobrade | null,
  ): void {
    if (vistos.has(o.id)) return;
    vistos.add(o.id);
    itens.push({
      id: o.id,
      protocolo: o.protocolo,
      status: o.status,
      criadoEm: o.criado_em,
      tipo,
      relacao,
    });
  }

  if (entrada.vinculadaA) juntar(entrada.vinculadaA, "continuacao", null);
  for (const v of entrada.vinculadas) juntar(v, "mesmo_evento", null);
  /*
    O tipo das vizinhas vem da consulta, não da linha devolvida. A busca por
    endereço filtra `tipo = $1`, então toda linha que volta tem esse tipo; e a
    rota HTTP não devolve a coluna, então ler dela daria `undefined` em
    produção e o valor certo no modo local, que é a pior combinação possível.
  */
  for (const v of entrada.mesmoEndereco) juntar(v, "mesmo_endereco", entrada.tipo);

  return itens;
}
