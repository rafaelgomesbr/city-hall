import {
  MOTIVO_RECLASSIFICAR, ORIGENS_DA_TRIAGEM, ROTULO_TIPO_COBRADE, TIPOS_COBRADE,
  TIPO_A_CLASSIFICAR,
  encerramentoSchema, estadoTerminal, podeExecutar, precisaReclassificar,
  type Papel, type StatusOcorrencia, type TipoCobrade, type TipoDeEntrada,
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
 * O aviso que a pessoa recebe ao chegar na ocorrência recém registrada, em
 * três pedaços, porque o do meio não é texto: é um número.
 *
 * Ele conserta um buraco de produto: quem registrava o chamado era jogado na
 * tela de detalhe sem nenhum sinal de que a gravação deu certo, e sem o número
 * do protocolo dito em lugar nenhum além do título, que a pessoa ainda não
 * sabia ser o protocolo. Com o telefone no ombro, a pergunta imediata é "posso
 * passar o número para quem está na linha?", e a tela não respondia.
 *
 * Três decisões dentro dele:
 *
 * - o PROTOCOLO vem separado do texto. Ele é ditado por telefone e copiado,
 *   e ditar "000123/2026" na fonte do corpo é ditar zeros e letras "o" que se
 *   parecem, num tipo em que a largura do dígito muda. A tela desenha esta
 *   parte na fonte tabular do design system (`.mono`, que é
 *   `--ds-font-mono` com `tabular-nums`), e é só por isso que a frase vem
 *   partida em vez de pronta. Ele continua sendo lido do registro que já está
 *   na tela, então o número anunciado é o mesmo do título por construção, e
 *   não por coincidência;
 * - o PRÓXIMO PASSO é o do estado em que a ocorrência NASCE. Ela nasce em
 *   `STATUS_INICIAL` ("registrada"), e a única saída dali que não é o fim do
 *   caso é "triagem" (ver `TRANSICOES_PERMITIDAS`): quem age em seguida é
 *   quem classifica, não quem despacha, porque despachar equipe sem
 *   classificação é recusado. Um teste ancora essa leitura na máquina de
 *   estados, senão a frase envelheceria calada no dia em que o fluxo mudar;
 * - o TEXTO do próximo passo muda com o papel de quem está olhando. O
 *   operador de plantão não classifica, e mandá-lo "classificar na triagem"
 *   seria mandar fazer uma coisa que o servidor vai recusar. Ele precisa
 *   saber que o chamado agora espera a coordenação, para poder dizer isso ao
 *   morador.
 *
 * É função pura, e não texto solto no meio do JSX, pelo motivo de sempre nesta
 * pasta: condição escondida dentro de um componente que só roda em navegador
 * não tem como ser exercitada.
 */
export type AvisoDeRegistro = {
  /** O que vem antes do número, já terminando em espaço. */
  antes: string;
  /** O protocolo sozinho, para a tela desenhá-lo na fonte tabular. */
  protocolo: string;
  /** O ponto final e o próximo passo. */
  depois: string;
};

export function avisoDoRegistro(
  { protocolo, papel }: { protocolo: string; papel: Papel },
): AvisoDeRegistro {
  const proximo = podeExecutar(papel, "classificar_triagem")
    ? "Próximo passo: classificar na triagem, que é o que define a severidade e o prazo."
    : "Próximo passo: a coordenação classifica na triagem, que é o que define o prazo.";
  return {
    antes: "Ocorrência registrada com o protocolo ",
    protocolo,
    depois: `. ${proximo}`,
  };
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
  tipo: TipoDeEntrada | null;
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
  tipo: TipoDeEntrada;
  vinculadaA: OcorrenciaRelacionada | null;
  vinculadas: readonly OcorrenciaRelacionada[];
  mesmoEndereco: readonly OcorrenciaRelacionada[];
}): ItemVerTambem[] {
  const vistos = new Set<string>([entrada.ocorrenciaId]);
  const itens: ItemVerTambem[] = [];

  function juntar(
    o: OcorrenciaRelacionada,
    relacao: RelacaoVerTambem,
    tipo: TipoDeEntrada | null,
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

/* ============================================================
   O tipo "outro": a confissão de que a classificação ainda não foi feita
   ============================================================ */

/**
 * O texto do relato que acompanha a abertura, e só quando ele tem lugar.
 *
 * A regra não é da tela, é do banco: a migração 019 tem duas restrições
 * opostas, e as duas recusam o INSERT. "outro" sem descrição abre um chamado
 * que diz "Outro" e nada mais, e a triagem fica sem a matéria prima da decisão
 * que ela existe para tomar; tipo da COBRADE COM descrição transforma a coluna
 * em lixeira de anotação paralela dentro de um registro estruturado.
 *
 * Fica aqui, e não dentro do `onSubmit`, porque o formulário troca de tipo
 * enquanto a pessoa digita: quem escolhe "Outro", escreve o relato e volta
 * atrás para "Vendaval" deixaria o texto para trás, no estado do React, e ele
 * viajaria junto do vendaval até o erro de restrição do banco.
 */
export function descricaoDoTipoNaAbertura(
  tipo: TipoDeEntrada,
  digitado: string,
): string | undefined {
  if (!precisaReclassificar(tipo)) return undefined;
  return digitado.trim() || undefined;
}

/** A âncora do seletor de tipo da triagem, dita uma vez só. */
export const ANCORA_DA_CLASSIFICACAO = "triagem-tipo";

/**
 * Quando o painel oferece a triagem.
 *
 * O primeiro caso é o de sempre: chamado recém registrado, ninguém olhou
 * ainda. O SEGUNDO é a porta que faltava e sem a qual o recurso vira armadilha.
 *
 * A triagem pode acontecer em duas etapas (severidade agora, tipo quando
 * alguém olhar a foto), e o esquema compartilhado torna o tipo opcional
 * justamente por isso. Só que, com o cartão de triagem aparecendo apenas em
 * "registrada", um chamado que passou pela triagem ainda como "outro" ficava
 * sem saída nenhuma: o despacho recusa (`precisaReclassificar`), e a tela não
 * oferecia mais nenhum lugar para escolher o tipo. O chamado ficava preso, e a
 * única saída visível seria encerrar um caso que não foi atendido.
 */
export function ofereceTriagem(
  papel: Papel,
  status: StatusOcorrencia,
  tipo: TipoDeEntrada,
): boolean {
  if (!podeExecutar(papel, "classificar_triagem")) return false;
  if (estadoTerminal(status)) return false;
  // De onde a triagem parte é regra do domínio, e a mesma que a rota confere:
  // oferecer o cartão fora dessas origens terminaria num 409.
  if (!ORIGENS_DA_TRIAGEM.includes(status)) return false;
  if (status === "registrada") return true;
  return status === "triagem" && precisaReclassificar(tipo);
}

/**
 * Quando o despacho é recusado por falta de classificação, ANTES de tentar.
 *
 * Mostrar o formulário de despacho a um chamado que o servidor vai recusar é
 * pedir para a pessoa preencher equipe, prazo e instruções para levar um 409
 * no fim. O aviso toma o lugar do formulário e diz o passo que destrava.
 */
export function despachoEsperaClassificacao(
  status: StatusOcorrencia,
  tipo: TipoDeEntrada,
): boolean {
  return status === "triagem" && precisaReclassificar(tipo);
}

/**
 * O código que a API usa para esta recusa. Espelha `RegraDeNegocio` da rota de
 * despacho, e mora aqui porque o painel não importa código do servidor.
 */
export const CODIGO_A_CLASSIFICAR = "tipo_a_classificar";

/**
 * A falha que a tela precisa tratar diferente das outras.
 *
 * As duas pontas erram com formas diferentes e o painel não pode saber em qual
 * modo está: a API devolve 409 com `erro: "tipo_a_classificar"`, que vira
 * `ErroDaApi.codigo`; o modo de demonstração levanta um `Error` com a mesma
 * frase do pacote compartilhado. Reconhecer as duas é o que permite a faixa
 * vermelha terminar num caminho em vez de terminar num beco.
 *
 * Reconhecer pelo CÓDIGO vem primeiro, e a frase é o segundo caminho, não uma
 * heurística sobre texto: `MOTIVO_RECLASSIFICAR` é a constante compartilhada
 * que as duas pontas mandam, comparada inteira e não por pedaço.
 */
export function recusadoPorFaltaDeClassificacao(erro: unknown): boolean {
  if (!(erro instanceof Error)) return false;
  const codigo = (erro as { codigo?: unknown }).codigo;
  if (typeof codigo === "string") return codigo === CODIGO_A_CLASSIFICAR;
  return erro.message === MOTIVO_RECLASSIFICAR;
}

/** Uma opção do seletor de tipo da triagem. */
export type OpcaoDeTipo = { valor: string; rotulo: string };

/**
 * O valor que representa "não decidir agora" no seletor da triagem.
 *
 * String vazia porque ela não é um tipo: mandar "outro" de volta seria
 * reclassificar para o lugar de onde se veio, e o esquema compartilhado recusa
 * ("outro" não está em `TIPOS_COBRADE`) justamente para o portão do despacho
 * não virar formalidade.
 */
export const SEM_CLASSIFICAR = "";

/**
 * As opções do seletor de tipo da triagem.
 *
 * O chamado que chega como "outro" abre em "ainda não classificar", e essa é a
 * decisão inteira: um seletor que já viesse marcado em "Deslizamento" faria
 * quem tria confirmar sem escolher, e a classificação falsa que "outro" existe
 * para eliminar voltaria pela porta da triagem, agora com o carimbo de quem
 * tem competência técnica, que é pior.
 *
 * Quem já tem tipo da COBRADE abre no próprio tipo, e a lista não oferece a
 * volta para "outro": corrigir um tipo errado é legítimo, desclassificar não.
 */
export function opcoesDeTipoNaTriagem(tipoAtual: TipoDeEntrada): OpcaoDeTipo[] {
  const daTaxonomia = TIPOS_COBRADE.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_COBRADE[t] }));
  if (!precisaReclassificar(tipoAtual)) return daTaxonomia;
  return [
    {
      valor: SEM_CLASSIFICAR,
      rotulo: "Ainda não classificar, segue como Outro",
    },
    ...daTaxonomia,
  ];
}

/** O valor inicial do seletor: nunca um palpite. */
export function tipoInicialNaTriagem(tipoAtual: TipoDeEntrada): string {
  return precisaReclassificar(tipoAtual) ? SEM_CLASSIFICAR : tipoAtual;
}

/**
 * O que vai no corpo da triagem, a partir do que está escolhido no seletor.
 *
 * `undefined` e não `"outro"`: o campo é opcional no esquema compartilhado, e
 * omiti-lo é o jeito de dizer "não mexi no tipo". Mandar `"outro"` seria pedir
 * ao servidor uma reclassificação que ele recusa.
 */
export function tipoEscolhidoNaTriagem(valor: string): TipoCobrade | undefined {
  if (valor === SEM_CLASSIFICAR || valor === TIPO_A_CLASSIFICAR) return undefined;
  return TIPOS_COBRADE.find((t) => t === valor);
}

/** O que a geração da chave precisa do navegador (e o que um teste pode trocar). */
export type MotorDeAleatorios =
  Pick<Crypto, "getRandomValues"> & Partial<Pick<Crypto, "randomUUID">>;

/**
 * A chave de criação do chamado (V2-F02-E07): um UUID v4 novo, gerado quando o
 * formulário ABRE e guardado enquanto ele existir. O reenvio (toque duplo,
 * resposta perdida, nova tentativa depois de um erro de rede) manda a MESMA
 * chave, e a API devolve o chamado que já nasceu em vez de abrir outro e
 * queimar mais um número do protocolo. Chamado diferente é formulário
 * diferente: abrir a tela de novo gera chave nova.
 *
 * `crypto.randomUUID` só existe em contexto seguro (https ou localhost); o
 * plantão pode abrir o painel por um endereço interno em http. O plano B usa
 * `getRandomValues`, que existe em qualquer contexto, e monta o v4 à mão.
 */
export function novaChaveDeCriacao(
  motor: MotorDeAleatorios | null = globalThis.crypto ?? null,
): string {
  if (motor?.randomUUID) return motor.randomUUID();
  if (!motor) throw new Error("Este navegador não tem gerador de números aleatórios.");
  const b = motor.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
