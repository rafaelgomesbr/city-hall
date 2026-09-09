import {
  ROTULO_SEVERIDADE, ROTULO_TIPO_COBRADE, type Severidade, type TipoCobrade,
} from "@dc360/shared";
import { campo, escapar, formatarDataHora, montarFolha } from "../documentos/folha.js";
import { codigoDeValidacao } from "../documentos/laudo.js";
import type { Mensagem } from "../auth/notificador.js";

/**
 * O ofício de encaminhamento de providência, e a mensagem que o anuncia.
 *
 * Os dois moram no mesmo arquivo de propósito, porque a decisão que importa
 * aqui é a FRONTEIRA ENTRE ELES: o que fica no documento e o que pode viajar
 * por email. Separar em dois arquivos deixaria essa fronteira sem dono, e ela
 * é a peça de privacidade desta frente inteira.
 *
 * O DOCUMENTO carrega o endereço do imóvel, o nome de quem pediu socorro e,
 * quando existe, a descrição da vulnerabilidade social da família. É o que o
 * órgão precisa para agir, e é dado sensível concentrado numa folha só.
 *
 * O EMAIL carrega o número do ofício, o município, o tipo da ocorrência e um
 * endereço de uso único. Nada mais.
 *
 * A razão não é excesso de zelo. Email sai do controle do município no
 * instante em que é entregue: fica na caixa de quem recebeu, no servidor do
 * provedor dele, no backup desse provedor, e em todo encaminhamento que ele
 * fizer depois. Não existe "apagar" depois de enviado. O link, esse, expira,
 * abre uma vez só e deixa registro de quem abriu.
 */

export type DadosDoOficio = {
  organizacao: { nome: string; municipio: string; uf: string };
  orgao: { nome: string; sigla: string | null };
  oficio: {
    id: string;
    numero: string;
    observacoes: string | null;
    emitido_em: string;
    emitido_por_nome: string;
  };
  ocorrencia: {
    protocolo: string;
    tipo: TipoCobrade;
    endereco: string;
    ponto_referencia: string | null;
    descricao: string;
    solicitante_nome: string;
    severidade: string | null;
    vulnerabilidade_presente: boolean;
    vulnerabilidade_descricao: string | null;
    interditada_em: string | null;
  };
  providencia: {
    descricao: string;
    responsavel: string;
    prazo_em: string;
    encaminhada_em: string;
  };
  /** Texto da marca d'água. Vazio remove a marca. */
  marcaDagua?: string;
};

export function oficioDeEncaminhamento(d: DadosDoOficio): string {
  const destinatario = d.orgao.sigla
    ? `${d.orgao.nome} (${d.orgao.sigla})`
    : d.orgao.nome;

  /*
    A interdição aparece no ofício quando existe, e essa linha não é
    decorativa: um imóvel interditado muda a urgência do que está sendo pedido,
    e o órgão que recebe precisa saber que tem gente fora de casa esperando por
    aquilo. Quando não existe, a linha some, em vez de sair "não interditado":
    afirmação a mais num documento oficial é afirmação que alguém vai ter que
    defender depois.
  */
  const corpo = `
  <h2>Destinatário</h2>
  <div class="campos">
    ${campo("Órgão", destinatario, { largo: true })}
    ${campo("Prazo solicitado", formatarDataHora(d.providencia.prazo_em))}
    ${campo("Responsável indicado", d.providencia.responsavel)}
  </div>

  <h2>Providência solicitada</h2>
  <p class="relato">${escapar(d.providencia.descricao)}</p>

  <h2>Ocorrência de origem</h2>
  <div class="campos">
    ${campo("Protocolo", d.ocorrencia.protocolo, { mono: true })}
    ${campo("Tipo", ROTULO_TIPO_COBRADE[d.ocorrencia.tipo] ?? d.ocorrencia.tipo)}
    ${campo("Endereço", d.ocorrencia.endereco, { largo: true })}
    ${d.ocorrencia.ponto_referencia
      ? campo("Ponto de referência", d.ocorrencia.ponto_referencia, { largo: true })
      : ""}
    ${campo("Solicitante", d.ocorrencia.solicitante_nome)}
    ${campo("Severidade", d.ocorrencia.severidade
      ? ROTULO_SEVERIDADE[d.ocorrencia.severidade as Severidade] ?? d.ocorrencia.severidade
      : "não classificada")}
    ${d.ocorrencia.interditada_em
      ? campo("Imóvel interditado em", formatarDataHora(d.ocorrencia.interditada_em), { largo: true })
      : ""}
  </div>
  <p class="relato">${escapar(d.ocorrencia.descricao)}</p>

  ${d.ocorrencia.vulnerabilidade_presente
    ? `<h2>Vulnerabilidade registrada</h2>
       <p class="relato">${escapar(d.ocorrencia.vulnerabilidade_descricao ?? "")}</p>`
    : ""}

  ${d.oficio.observacoes
    ? `<h2>Observações da coordenação</h2>
       <p class="relato">${escapar(d.oficio.observacoes)}</p>`
    : ""}

  <h2>Encaminhamento</h2>
  <p class="nota">
    Encaminhado em ${escapar(formatarDataHora(d.providencia.encaminhada_em))}.
    A resposta deste órgão deve ser registrada no protocolo acima, e a ausência
    de resposta fica registrada junto do encerramento da ocorrência.
  </p>
`;

  return montarFolha({
    titulo: `Ofício ${d.oficio.numero}`,
    protocolo: d.ocorrencia.protocolo,
    cabecalho: {
      orgao: d.organizacao.nome,
      municipio: d.organizacao.municipio,
      uf: d.organizacao.uf,
    },
    corpo,
    // O código de validação é da DUPLA ofício e ocorrência, e não do ofício
    // sozinho: é o mesmo par que a folha imprime no rodapé, e é ele que
    // permite conferir, com o papel na mão, que aquele número pertence àquele
    // protocolo.
    validacao: codigoDeValidacao(`OFI-${d.oficio.numero}`, d.oficio.id),
    emitidoEm: new Date(d.oficio.emitido_em),
    emitidoPor: d.oficio.emitido_por_nome,
    ...(d.marcaDagua ? { marcaDagua: d.marcaDagua } : {}),
  });
}

/**
 * A mensagem que sai por email, e o que ela deliberadamente NÃO leva.
 *
 * Sem endereço, sem nome de solicitante, sem descrição do relato, sem
 * vulnerabilidade e sem severidade. Quem lê o email sabe que existe um ofício
 * numerado de um município sobre um tipo de evento, e precisa abrir o link
 * para saber de qual casa se trata.
 *
 * O ganho é concreto e vale escrever: se este email for encaminhado por
 * engano, ou se a caixa de quem recebeu for invadida daqui a dois anos, o que
 * vaza é um número de ofício e um link que já expirou. Com o ofício no corpo,
 * o que vazaria é o dossiê, para sempre.
 */
export function mensagemDeOficio(dados: {
  para: string;
  orgaoNome: string;
  numero: string;
  municipio: string;
  uf: string;
  tipoOcorrencia: TipoCobrade;
  link: string;
  horas: number;
  reenvio: boolean;
}): Mensagem {
  const tipo = ROTULO_TIPO_COBRADE[dados.tipoOcorrencia] ?? dados.tipoOcorrencia;
  const assunto = `${dados.reenvio ? "Reenvio, ofício" : "Ofício"} ${dados.numero}`
    + `, Defesa Civil de ${dados.municipio}`;

  return {
    para: dados.para,
    nome: dados.orgaoNome,
    assunto,
    corpo:
      `${dados.orgaoNome},\n\n`
      + `A Defesa Civil de ${dados.municipio}, ${dados.uf}, emitiu o ofício `
      + `${dados.numero}, referente a uma ocorrência do tipo ${tipo.toLowerCase()}.\n\n`
      + `O conteúdo do ofício NÃO viaja por email, de propósito: ele contém o `
      + `endereço do imóvel e dados da família atendida. Use o endereço abaixo `
      + `para ler e imprimir o documento.\n\n`
      + `${dados.link}\n\n`
      + `Este endereço vale por ${dados.horas} horas e ABRE UMA VEZ SÓ. A abertura `
      + `fica registrada, com data, hora e endereço de origem. Se ele não abrir `
      + `porque já foi usado, alguém abriu antes: avise a Defesa Civil de `
      + `${dados.municipio} e peça o reenvio.\n`,
  };
}
