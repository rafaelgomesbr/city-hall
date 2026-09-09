import { createHash } from "node:crypto";
import {
  CHAVE_ACIONAR_ORGAO,
  ROTULO_CANAL, ROTULO_CHECKLIST, ROTULO_SEVERIDADE, ROTULO_TIPO_COBRADE,
  type CanalEntrada, type Severidade, type TipoDeEntrada,
} from "@dc360/shared";
import {
  assinatura, campo, escapar, formatarDataHora, fusoDoEstado, montarFolha,
} from "./folha.js";

/**
 * Laudo de vistoria e termo de interdição.
 *
 * Duas regras de conteúdo que não são estéticas:
 *
 * 1. **As duas marcas de tempo aparecem sempre que diferem.** Coleta e
 *    sincronização em horários distintos é o normal de uma vistoria feita sem
 *    sinal. Mostrar só a segunda faria o documento afirmar que a vistoria
 *    aconteceu na hora em que o sinal voltou, o que é falso e é justamente o
 *    tipo de coisa que derruba um laudo quando alguém contesta.
 *
 * 2. **Nenhuma norma é citada além das que o projeto autoriza, e nenhum
 *    artigo é inventado.** Um número de artigo errado num termo de interdição
 *    é munição para anular o ato. Onde a base normativa é mencionada, ela vem
 *    sem artigo, porque a lista autorizada não os especifica.
 */

export type DadosDocumento = {
  organizacao: { nome: string; municipio: string; uf: string };
  ocorrencia: {
    id: string;
    protocolo: string;
    /**
     * `TipoDeEntrada` e nao `TipoCobrade`, e a diferenca e uma so: "outro".
     *
     * A migracao 019 passou a aceitar no banco a marca de "ainda nao
     * classificado", e o tipo daqui estava afirmando que ela nao chega. Chega
     * numa unica situacao, e ela nao e hipotetica: um chamado que entrou como
     * "outro" e foi encerrado como improcedente antes de ser classificado
     * continua podendo ter vistoria, e continua tendo laudo. O portao do
     * despacho impede tudo o mais.
     */
    tipo: TipoDeEntrada;
    /** O que foi relatado, quando o chamado entrou sem classificacao. */
    tipo_descricao?: string | null;
    severidade: Severidade | null;
    endereco: string;
    latitude: number | null;
    longitude: number | null;
    solicitante_nome: string;
    solicitante_contato: string | null;
    canal_entrada: string;
    descricao: string;
    vulnerabilidade_presente: boolean;
    vulnerabilidade_descricao: string | null;
    criado_em: string;
    equipe_nome: string | null;
  };
  vistoria: {
    id: string;
    checklist: Array<{ chave: string; resposta: boolean }>;
    gps_precisao_metros: number | null;
    assinante_nome: string;
    observacoes: string | null;
    coletada_em: string;
    sincronizada_em: string;
    agente_nome: string | null;
    agente_matricula: string | null;
    /** Contagem de pessoas. NULL significa não contado, e não zero. */
    desalojados: number | null;
    desabrigados: number | null;
    feridos: number | null;
    desaparecidos: number | null;
    obitos: number | null;
    /**
     * Endereço de leitura do traço de assinatura coletado no aparelho, quando
     * existe.
     *
     * Continua opcional, e não por provisoriedade: em 09/09/2026 as três
     * vistorias reais do piloto de Florianópolis estavam no banco com
     * `assinatura_chave` nula, porque a tela do aplicativo liberava concluir
     * sem a assinatura confirmada. A tela foi corrigida, mas o documento não
     * pode presumir que toda vistoria tem traço: as que já existem não têm, e
     * o laudo delas continua sendo emitido. Sem traço, o bloco de assinatura
     * DIZ que não foi coletada, em vez de deixar espaço em branco.
     */
    assinaturaUrl?: string | null;
    /**
     * Quem a vistoria mandou acionar, um por linha, na ordem em que o agente
     * escolheu no local.
     *
     * Opcional pela mesma razao de `assinaturaUrl`: as vistorias que ja estao
     * no banco foram coletadas antes de existir tabela para isto, e o laudo
     * delas continua sendo emitido. Ausente e lista vazia significam a mesma
     * coisa para o papel, e as duas produzem a frase que diz que a indicacao
     * ficou sem nome, em vez de um espaco em branco embaixo do titulo.
     */
    orgaosIndicados?: ReadonlyArray<{ nome: string; sigla: string | null }>;
    /**
     * As duas equipes do momento em que o servidor recebeu a coleta: a que
     * estava designada para a ocorrência e a do agente que coletou.
     *
     * Existem no documento porque o defeito era invisível justamente no papel.
     * Um agente de qualquer equipe registrava vistoria em qualquer ocorrência
     * do município, a tarefa sumia da fila da equipe que de fato foi ao local,
     * e o termo de interdição saía com brasão e com o nome de quem não foi
     * designado. Nada no papel dizia isso.
     *
     * O servidor aceita a coleta assim mesmo (recusar mataria coleta legítima
     * de quem trocou de equipe entre coletar e enviar, e o aplicativo trata
     * recusa como falha permanente), então quem precisa enxergar a divergência
     * é quem assina o documento. Ver a migração 024.
     *
     * Opcionais porque as vistorias que já estão no banco foram coletadas
     * antes de existirem as colunas, e o laudo delas continua sendo emitido.
     */
    equipe_designada_nome?: string | null;
    equipe_do_agente_nome?: string | null;
  };
  /**
   * As fotografias DESTA vistoria, e só delas.
   *
   * O defeito que isto acaba: a consulta filtrava só por ocorrência, enquanto
   * todo o resto do documento (checklist, agente, assinante, datas, órgãos
   * indicados) era da vistoria vigente. O laudo de uma re-vistoria que concluía
   * que o risco cessou saía com as fotos do talude destruído da vistoria
   * anterior, numeradas como registro daquela ida.
   */
  fotos: Array<{ url: string; legenda: string | null; capturadaEm: string }>;
  /**
   * As fotografias que estão no protocolo sem pertencer a vistoria nenhuma.
   *
   * Elas existem: o fluxo de evidência avulsa grava a foto com `vistoria_id`
   * nulo, e alguém a anexou de propósito. As duas saídas óbvias são erradas.
   * Somá-las às da vistoria é o defeito de novo, agora em versão menor: o
   * documento afirmaria que o agente fotografou aquilo naquela ida. Descartá-las
   * cala uma prova que alguém pôs no processo, e o laudo é o lugar onde o
   * processo se lê.
   *
   * Então elas saem, em seção própria, ditas pelo que são, com quem anexou e
   * quando. O leitor consegue distinguir o registro do agente em campo do que
   * foi acrescentado depois, que é a distinção que o documento existia para
   * apagar.
   */
  fotosAvulsas?: Array<{
    url: string; legenda: string | null; capturadaEm: string;
    anexadaPorNome: string | null;
  }>;
  emitidoPor: string;
  emitidoEm: Date;
  /**
   * O levantamento da interdição, quando existe.
   *
   * Opcional porque os outros dois documentos não o conhecem: só o termo de
   * desinterdição depende dele, e ele exige a presença dos três campos.
   */
  desinterdicao?: {
    em: string;
    motivo: string;
    porNome: string;
    interditadaEm: string;
  };
  /** Marca d'água. Vazio em ambiente definitivo. */
  marcaDagua?: string;
};

/**
 * Identificador curto e estável do documento emitido.
 *
 * Deriva do protocolo mais a vistoria, então o mesmo laudo tem sempre o mesmo
 * código, e dois laudos diferentes nunca compartilham um. Não é assinatura
 * digital e não pretende ser: é o que permite conferir, ao receber um papel,
 * que ele corresponde ao registro no sistema.
 */
export function codigoDeValidacao(protocolo: string, vistoriaId: string): string {
  return createHash("sha256")
    .update(`${protocolo}|${vistoriaId}`)
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();
}

function blocoIdentificacao(d: DadosDocumento): string {
  const o = d.ocorrencia;
  const fuso = fusoDoEstado(d.organizacao.uf);
  /*
    "Chamado registrado em", e não "Registrada em".

    O documento traz DUAS datas de atos diferentes: a abertura do chamado e a
    vistoria em campo. "Registrada em", sozinho, ao lado de "Data e hora da
    vistoria em campo", não diz qual das duas é, e o leitor do laudo é quem
    vai decidir sobre a casa de alguém a partir dessa distinção.

    "Relatado como" só aparece quando o chamado entrou sem classificação, e
    existe para o documento não sair afirmando apenas "Outro" no campo do
    tipo. O texto é o que o solicitante contou ao telefone, e sem ele o laudo
    de um chamado não classificado seria um papel com brasão que não diz sobre
    o que é. Some da folha assim que a triagem classifica, porque tipo da
    COBRADE não guarda descrição (migração 019).
  */
  return `<h2>Identificação da ocorrência</h2>
  <div class="campos">
    ${campo("Protocolo", o.protocolo, { mono: true })}
    ${campo("Tipo (COBRADE)", ROTULO_TIPO_COBRADE[o.tipo])}
    ${o.tipo_descricao?.trim()
      ? campo("Relatado como", o.tipo_descricao.trim(), { largo: true })
      : ""}
    ${campo("Severidade", o.severidade ? ROTULO_SEVERIDADE[o.severidade] : "não classificada")}
    ${campo("Chamado registrado em", formatarDataHora(o.criado_em, fuso))}
    ${campo("Endereço", o.endereco, { largo: true })}
    ${campo("Coordenada",
      o.latitude !== null && o.longitude !== null
        ? `${o.latitude.toFixed(6)}, ${o.longitude.toFixed(6)}`
        : "não registrada",
      { mono: true })}
    ${campo("Equipe responsável", o.equipe_nome ?? "não designada")}
    ${campo("Solicitante", o.solicitante_nome)}
    ${campo("Canal de entrada",
      ROTULO_CANAL[o.canal_entrada as CanalEntrada] ?? o.canal_entrada)}
  </div>

  <h2>Relato recebido</h2>
  <p class="relato">${escapar(o.descricao)}</p>

  ${o.vulnerabilidade_presente
    ? `<h2>Vulnerabilidade social identificada</h2>
       <p class="relato">${escapar(o.vulnerabilidade_descricao ?? "")}</p>`
    : ""}`;
}

function blocoVistoria(d: DadosDocumento): string {
  const v = d.vistoria;
  const fuso = fusoDoEstado(d.organizacao.uf);
  const coleta = new Date(v.coletada_em).getTime();
  const sincronia = new Date(v.sincronizada_em).getTime();
  // Um minuto de folga: diferença menor que isso é latência, não coleta
  // offline, e poluiria o documento sem informar nada.
  const offline = sincronia - coleta > 60_000;

  const linhas = v.checklist
    .map((item) => `<tr>
        <td>${escapar(ROTULO_CHECKLIST[item.chave] ?? item.chave)}</td>
        <td class="resposta">${item.resposta ? "SIM" : "NÃO"}</td>
      </tr>`)
    .join("");

  return `<h2>Vistoria realizada</h2>
  <div class="campos">
    ${campo("Data e hora da vistoria em campo", formatarDataHora(v.coletada_em, fuso))}
    ${offline
      ? campo("Recebida pelo sistema em", formatarDataHora(v.sincronizada_em, fuso))
      : campo("Registrada no sistema em", formatarDataHora(v.sincronizada_em, fuso))}
    ${campo("Agente responsável", v.agente_nome ?? "não identificado")}
    ${campo("Matrícula", v.agente_matricula ?? "não informada", { mono: true })}
    ${campo("Precisão do GPS",
      v.gps_precisao_metros !== null ? `${v.gps_precisao_metros} metros` : "não registrada")}
    ${campo("Presente no local", v.assinante_nome)}
  </div>

  ${offline
    ? `<p class="nota">Esta vistoria foi coletada em campo sem conexão e transmitida ao sistema posteriormente. As duas datas acima constam por essa razão, e a data de referência do ato é a da vistoria em campo.</p>`
    : ""}

  ${avisoDeEquipe(v)}

  <h2>Checklist técnico</h2>
  <table class="checklist"><tbody>${linhas}</tbody></table>

  ${blocoOrgaos(v)}

  ${blocoPessoas(v)}

  ${v.observacoes
    ? `<h2>Observações do agente</h2><p class="relato">${escapar(v.observacoes)}</p>`
    : ""}`;
}

/**
 * Quem precisa ser acionado, e por que a seção existe mesmo vazia.
 *
 * O DEFEITO QUE ISTO ACABA. O laudo dizia "Necessário acionar outro órgão:
 * SIM" na tabela do checklist e não dizia QUAL. A primeira providência do
 * coordenador virava um telefonema para o agente, horas depois, com ele já em
 * outra ocorrência ou fora do turno, para perguntar uma coisa que estava clara
 * no barranco no minuto da vistoria. A informação existia e faltava lugar para
 * escrever; agora ela é coletada, gravada e impressa.
 *
 * Entra LOGO DEPOIS do checklist, e não em outro ponto da folha, porque é a
 * resposta daquele item se abrindo: quem lê acabou de ver "SIM" na linha, e a
 * seção seguinte responde quem. É a mesma ordem da minuta lida em voz alta na
 * porta da casa, e os dois documentos precisam ser conferíveis um contra o
 * outro sem ninguém procurar.
 *
 * Quando a resposta foi "sim" e a lista está vazia, a seção existe assim mesmo
 * e DIZ que não foi especificado. É o caso da vistoria coletada por aparelho
 * que ainda não atualizou, e calar aqui devolveria o coordenador ao telefonema
 * que este bloco existe para acabar: ele leria um laudo sem menção nenhuma a
 * órgão e não saberia que a informação faltou.
 *
 * A sigla entra entre parênteses e nunca sozinha: "CBM" num documento de
 * processo, lido daqui a cinco anos por alguém de fora da Defesa Civil, não é
 * nome de órgão nenhum.
 */
function blocoOrgaos(v: DadosDocumento["vistoria"]): string {
  const indicado = v.checklist
    .some((i) => i.chave === CHAVE_ACIONAR_ORGAO && i.resposta);
  if (!indicado) return "";

  const nomes = (v.orgaosIndicados ?? [])
    .map((o) => (o.sigla?.trim() ? `${o.nome.trim()} (${o.sigla.trim()})` : o.nome.trim()))
    .filter((n) => n.length > 0);

  return `<h2>Órgãos a acionar</h2>
    <p class="${nomes.length > 0 ? "relato" : "nota"}">${escapar(
      nomes.length > 0
        ? nomes.join("\n")
        : "Indicada a necessidade de acionar outro órgão, sem especificar qual.",
    )}</p>`;
}

/**
 * Quantas pessoas, e em que situação.
 *
 * Duas decisões que o documento precisa acertar, e as duas são sobre a
 * diferença entre não saber e saber que é zero:
 *
 * 1. Se NADA foi contado, o bloco imprime uma frase dizendo isso, em vez de
 *    imprimir cinco zeros. Um laudo afirmando "0 desabrigados" quando ninguém
 *    contou é uma afirmação falsa num documento que vai para processo.
 * 2. Contagem individual não informada aparece como "não informado", e não
 *    como zero, pela mesma razão.
 *
 * E a distinção que dá nome ao bloco: desalojado saiu de casa e tem para onde
 * ir; desabrigado depende de abrigo público. O segundo número é o que decide
 * se o município precisa abrir uma escola hoje à noite, e somá-lo ao primeiro
 * apagaria exatamente essa informação.
 */
function blocoPessoas(v: DadosDocumento["vistoria"]): string {
  const contagens = [
    { rotulo: "Desalojados", valor: v.desalojados,
      nota: "saíram de casa e têm para onde ir" },
    { rotulo: "Desabrigados", valor: v.desabrigados,
      nota: "saíram de casa e dependem de abrigo público" },
    { rotulo: "Feridos", valor: v.feridos, nota: "" },
    { rotulo: "Desaparecidos", valor: v.desaparecidos, nota: "" },
    { rotulo: "Óbitos", valor: v.obitos, nota: "" },
  ];

  if (contagens.every((c) => c.valor === null)) {
    return `<h2>Pessoas atingidas</h2>
      <p class="nota">A contagem de pessoas atingidas não foi registrada nesta vistoria. A ausência de contagem não significa ausência de atingidos.</p>`;
  }

  const campos = contagens
    .map((c) => campo(
      c.nota ? `${c.rotulo} (${c.nota})` : c.rotulo,
      c.valor === null ? "não informado" : String(c.valor),
    ))
    .join("");

  return `<h2>Pessoas atingidas</h2><div class="campos">${campos}</div>`;
}

/**
 * A divergência entre a equipe designada e a equipe de quem coletou.
 *
 * Impressa no documento, e não só guardada no banco, porque é aqui que ela
 * muda alguma coisa: quem assina o termo de interdição precisa saber que a
 * vistoria que o sustenta veio de agente de outra equipe antes de assinar, e
 * não depois, numa consulta de auditoria que ninguém faz por conta própria.
 *
 * Só aparece quando houve designação: coleta em ocorrência que nunca foi
 * despachada não viola designação nenhuma, e imprimir aviso ali seria treinar
 * o leitor a ignorar o aviso.
 *
 * O texto NÃO acusa ninguém, de propósito. Trocar de equipe entre a coleta e o
 * envio é rotina, e o caso legítimo é mais comum que o outro. O que o papel
 * precisa dizer é que os dois nomes não batem e que alguém tem que olhar.
 */
function avisoDeEquipe(v: DadosDocumento["vistoria"]): string {
  const designada = v.equipe_designada_nome?.trim();
  if (!designada) return "";
  const doAgente = v.equipe_do_agente_nome?.trim() ?? "";
  if (doAgente === designada) return "";

  return `<p class="nota">Atenção: esta ocorrência estava designada à ${
    escapar(designada)
  } e a vistoria foi coletada por agente ${
    doAgente
      ? `lotado na ${escapar(doAgente)}`
      : "sem equipe registrada no momento do recebimento"
  }. O sistema registrou a coleta e manteve a tarefa com a equipe designada. A divergência precisa ser conferida pela coordenação antes de o ato ser praticado.</p>`;
}

function galeria(
  fotos: ReadonlyArray<{ url: string; legenda: string | null; capturadaEm: string }>,
  fuso: string,
  alt: string,
): string {
  return fotos
    .map((f, i) => `<figure class="foto">
        <img src="${escapar(f.url)}" alt="${escapar(alt)} ${i + 1}">
        <figcaption class="legenda">
          Foto ${i + 1}. ${escapar(f.legenda ?? "sem legenda")}<br>
          Capturada em ${escapar(formatarDataHora(f.capturadaEm, fuso))}
        </figcaption>
      </figure>`)
    .join("");
}

function blocoFotos(d: DadosDocumento): string {
  const fuso = fusoDoEstado(d.organizacao.uf);
  const daVistoria = d.fotos.length === 0
    ? `<h2>Registro fotográfico</h2>
      <p class="nota">Nenhuma fotografia foi anexada a esta vistoria.</p>`
    : `<h2>Registro fotográfico</h2><div class="fotos">${
        galeria(d.fotos, fuso, "Fotografia da vistoria")
      }</div>`;

  return `${daVistoria}${blocoFotosAvulsas(d, fuso)}`;
}

/**
 * As fotos que estão no protocolo sem pertencer a vistoria nenhuma.
 *
 * Seção separada, e nunca somada à de cima. Somar era o defeito: o documento
 * passaria a afirmar que aquelas imagens são o registro do agente naquela ida,
 * com número de foto e tudo, quando ninguém disse isso. Omitir seria o defeito
 * espelho, e mais silencioso: alguém anexou aquilo ao processo de propósito, e
 * o laudo é onde o processo se lê.
 *
 * Cada uma sai com quem a anexou, porque é a pergunta que a separação abre.
 */
function blocoFotosAvulsas(d: DadosDocumento, fuso: string): string {
  const avulsas = d.fotosAvulsas ?? [];
  if (avulsas.length === 0) return "";

  const itens = avulsas
    .map((f, i) => `<figure class="foto">
        <img src="${escapar(f.url)}" alt="Fotografia ${i + 1} anexada ao protocolo">
        <figcaption class="legenda">
          Anexo ${i + 1}. ${escapar(f.legenda ?? "sem legenda")}<br>
          Capturada em ${escapar(formatarDataHora(f.capturadaEm, fuso))}<br>
          Anexada por ${escapar(f.anexadaPorNome ?? "autor não registrado")}
        </figcaption>
      </figure>`)
    .join("");

  return `<h2>Fotografias anexadas ao protocolo</h2>
    <p class="nota">As imagens abaixo foram anexadas ao protocolo fora do fluxo de vistoria, então não integram o registro fotográfico desta vistoria e não têm agente responsável por elas.</p>
    <div class="fotos">${itens}</div>`;
}

export function laudoDeVistoria(d: DadosDocumento): string {
  const corpo = `
    ${blocoIdentificacao(d)}
    ${blocoVistoria(d)}
    ${blocoFotos(d)}
    <div class="assinaturas">
      ${assinatura(d.vistoria.agente_nome ?? "Agente de campo", "Agente de proteção e defesa civil")}
      ${assinatura(d.vistoria.assinante_nome, "Presente no local", d.vistoria.assinaturaUrl)}
    </div>`;

  return montarFolha({
    titulo: "Laudo de vistoria",
    protocolo: d.ocorrencia.protocolo,
    cabecalho: {
      orgao: d.organizacao.nome,
      municipio: d.organizacao.municipio,
      uf: d.organizacao.uf,
    },
    corpo,
    validacao: codigoDeValidacao(d.ocorrencia.protocolo, d.vistoria.id),
    emitidoEm: d.emitidoEm,
    emitidoPor: d.emitidoPor,
    ...(d.marcaDagua ? { marcaDagua: d.marcaDagua } : {}),
  });
}

export function termoDeInterdicao(d: DadosDocumento): string {
  const o = d.ocorrencia;

  /**
   * Base normativa sem número de artigo, de propósito.
   *
   * A lista de normas que este projeto autoriza citar não especifica artigos,
   * e inventar um número num termo de interdição é dar motivo para anular o
   * ato. O texto abaixo cita a lei pelo que ela é, e nada além disso.
   */
  const corpo = `
    ${blocoIdentificacao(d)}

    <h2>Fundamento</h2>
    <p class="nota">O presente termo é lavrado no exercício das competências do órgão municipal de proteção e defesa civil, nos termos da Lei 12.608/2012, que institui a Política Nacional de Proteção e Defesa Civil, alterada pela Lei 14.750/2023, diante do risco constatado na vistoria técnica registrada sob o protocolo ${escapar(o.protocolo)}.</p>

    <h2>Decisão</h2>
    <p class="nota">Fica INTERDITADO o imóvel situado em ${escapar(o.endereco)}, em caráter preventivo, ficando vedada a permanência de pessoas no local até que as condições de segurança sejam restabelecidas e nova vistoria ateste a cessação do risco.</p>

    <h2>Ciência do responsável</h2>
    <p class="nota">O responsável abaixo identificado declara ciência da interdição, das razões que a motivaram e da vedação de permanência no imóvel.</p>

    ${blocoVistoria(d)}
    ${blocoFotos(d)}

    <div class="assinaturas">
      ${assinatura(d.vistoria.agente_nome ?? "Agente de campo", "Agente de proteção e defesa civil")}
      ${assinatura(d.vistoria.assinante_nome, "Responsável pelo imóvel, ciente", d.vistoria.assinaturaUrl)}
    </div>`;

  return montarFolha({
    titulo: "Termo de interdição",
    protocolo: o.protocolo,
    cabecalho: {
      orgao: d.organizacao.nome,
      municipio: d.organizacao.municipio,
      uf: d.organizacao.uf,
    },
    corpo,
    validacao: codigoDeValidacao(`INT-${o.protocolo}`, d.vistoria.id),
    emitidoEm: d.emitidoEm,
    emitidoPor: d.emitidoPor,
    ...(d.marcaDagua ? { marcaDagua: d.marcaDagua } : {}),
  });
}

/**
 * Termo de desinterdição: o papel que autoriza a família a voltar para casa.
 *
 * Ele existe porque o contrário existia. O sistema sabia interditar e não
 * sabia levantar a interdição: o termo saía, a casa ficava interditada, e não
 * havia documento nenhum para o dia em que o risco cessasse. Na prática isso
 * significa uma de duas coisas, e as duas são ruins: a família espera um papel
 * que ninguém emite, ou volta por conta própria e o município continua com um
 * registro dizendo que aquela casa é insegura.
 *
 * Três coisas que este documento faz questão de imprimir:
 *
 * 1. **As duas datas**, a da interdição e a do levantamento. Quem lê precisa
 *    saber quanto tempo a família ficou fora, e é a diferença entre as duas
 *    que responde isso sem ninguém precisar contar nos dedos.
 * 2. **O motivo, na íntegra**, que é o que responde anos depois por que a
 *    autorização foi dada.
 * 3. **Quem autorizou**, com nome e cargo. Levantar interdição é ato de
 *    coordenação, não de sistema, e o documento diz quem assinou.
 */
export function termoDeDesinterdicao(d: DadosDocumento): string {
  const o = d.ocorrencia;
  const dez = d.desinterdicao;
  if (!dez) {
    throw new Error(
      "termoDeDesinterdicao exige os dados do levantamento. Emitir este termo "
      + "sem eles imprimiria um documento afirmando que a interdição foi "
      + "levantada, sem dizer quando, por quem, nem por quê.",
    );
  }

  const fuso = fusoDoEstado(d.organizacao.uf);
  const corpo = `
    ${blocoIdentificacao(d)}

    <h2>Interdição anterior</h2>
    <div class="campos">
      ${campo("Imóvel interditado em", formatarDataHora(dez.interditadaEm, fuso))}
      ${campo("Levantamento autorizado em", formatarDataHora(dez.em, fuso))}
      ${campo("Autorizado por", dez.porNome)}
    </div>

    <h2>Fundamento</h2>
    <p class="nota">O presente termo é lavrado no exercício das competências do órgão municipal de proteção e defesa civil, nos termos da Lei 12.608/2012, que institui a Política Nacional de Proteção e Defesa Civil, alterada pela Lei 14.750/2023, e revoga a interdição lavrada sobre o imóvel identificado no protocolo ${escapar(o.protocolo)}.</p>

    <h2>Motivo do levantamento</h2>
    <p class="relato">${escapar(dez.motivo)}</p>

    <h2>Decisão</h2>
    <p class="nota">Fica LEVANTADA a interdição do imóvel situado em ${escapar(o.endereco)}, restabelecida a permanência de pessoas no local. O levantamento alcança exclusivamente o risco descrito neste processo e não afasta a obrigação de comunicar ao órgão municipal de proteção e defesa civil qualquer alteração nas condições do imóvel ou do terreno.</p>

    ${blocoVistoria(d)}

    <div class="assinaturas">
      ${assinatura(dez.porNome, "Coordenação de proteção e defesa civil")}
      ${assinatura(d.vistoria.assinante_nome, "Responsável pelo imóvel, ciente")}
    </div>`;

  return montarFolha({
    titulo: "Termo de desinterdição",
    protocolo: o.protocolo,
    cabecalho: {
      orgao: d.organizacao.nome,
      municipio: d.organizacao.municipio,
      uf: d.organizacao.uf,
    },
    corpo,
    validacao: codigoDeValidacao(`DES-${o.protocolo}`, d.vistoria.id),
    emitidoEm: d.emitidoEm,
    emitidoPor: d.emitidoPor,
    ...(d.marcaDagua ? { marcaDagua: d.marcaDagua } : {}),
  });
}
