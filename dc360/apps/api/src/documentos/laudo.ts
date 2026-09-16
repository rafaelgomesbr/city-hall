import { createHash } from "node:crypto";
import {
  CHAVE_ACIONAR_ORGAO,
  ROTULO_CANAL, ROTULO_CHECKLIST, ROTULO_SEVERIDADE, ROTULO_TIPO_COBRADE,
  type CanalEntrada, type Severidade, type TipoDeEntrada,
} from "@dc360/shared";
import {
  assinatura, assinaturaDeProprioPunho, campo, escapar, formatarDataHora, fusoDoEstado,
  montarFolha,
} from "./folha.js";
import { MARCADOR_REMOVIDO_POR_PRAZO } from "../privacidade/minimizacao.js";

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
    /**
     * A coleta chegou em ocorrência que NINGUÉM tinha despachado.
     *
     * É a outra marca da mesma família: ali as duas equipes não batem, aqui
     * não havia equipe nenhuma. Até 15/09/2026 a rota de sincronização não
     * marcava, e depois disso o papel continuava calado ("sem despacho não
     * produz aviso"): o laudo saía limpo e o termo de interdição saía como ATO
     * em cima de uma ocorrência em `registrada` ou `triagem`.
     *
     * Vem do evento `vistoria_sem_despacho` da trilha apontando para ESTA
     * vistoria, e não de `equipe_designada_id IS NULL`: toda vistoria anterior
     * à migração 024 tem a coluna nula, e a marca lida dali imprimiria nota
     * falsa em cada laudo antigo. Opcional pela mesma razão das equipes:
     * ausente e falso são a mesma coisa para o papel.
     */
    sem_despacho?: boolean;
    /**
     * ONDE O AGENTE ESTEVE, medido pelo aparelho no momento da coleta.
     *
     * Não é a mesma coisa que a coordenada da ocorrência, que aparece na
     * identificação lá em cima: aquela é o alfinete que o operador colou
     * durante a ligação, com o telefone no ombro, e as duas divergem o tempo
     * todo. Imprimir as duas é o que permite a quem lê ver a divergência, que é
     * exatamente a informação que fazia falta.
     *
     * Opcionais porque as vistorias que já estão no banco foram coletadas antes
     * de a coordenada viajar no envelope, e o laudo delas continua sendo
     * emitido.
     */
    latitude?: number | null;
    longitude?: number | null;
  };
  /**
   * O que foi capturado em campo e não pôde ser recuperado do aparelho.
   *
   * ESTA LISTA É A RAZÃO DE A VISTORIA PODER SUBIR SEM A FOTO. Antes dela, um
   * arquivo apagado pelo sistema operacional destruía o envelope inteiro
   * (checklist, GPS, assinatura, observações, órgãos a acionar), porque as
   * fotos sobem antes do envelope e a leitura dos bytes falhava.
   *
   * A saída alternativa, subir calado sem a foto, seria pior do que não subir:
   * quem lê um registro fotográfico com três fotos não tem como saber que havia
   * cinco, e o documento passaria a parecer completo sendo incompleto. Com a
   * lista, o laudo DIZ o que faltou e quando foi capturado, e quem decide sobre
   * a casa de alguém decide sabendo disso.
   */
  evidenciasPerdidas?: Array<{
    papel: "foto" | "assinatura";
    capturadaEm: string;
    legenda: string | null;
  }>;
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
    /**
     * Se `vistoria` é uma RE-VISTORIA feita depois da interdição (a que atesta
     * a cessação do risco) ou a vistoria que sustentou a interdição, porque o
     * levantamento foi autorizado sem vistoria nova.
     *
     * A diferença decide o que o termo imprime. Com re-vistoria, o checklist
     * dela é o fundamento do levantamento e sai inteiro. Sem, o termo não pode
     * imprimir "Interdição indicada: SIM" embaixo de "Fica LEVANTADA": ele diz
     * que o levantamento foi sem nova vistoria, identifica a vistoria que
     * interditou, e não reproduz um checklist que afirma o contrário do ato.
     * A rota de levantamento prometia isso por escrito ("'sem nova vistoria'
     * fica escrito nele se for o caso") e o termo não cumpria.
     */
    comNovaVistoria: boolean;
  };
  /**
   * A emissão registrada na trilha, quando o documento sai pela rota.
   *
   * Ausente quando o documento é renderizado fora dela (o roteiro de
   * conferência visual), e aí o identificador é calculado do próprio
   * `emitidoEm`, que é exatamente o que a primeira emissão gravaria.
   */
  emissao?: { emitidoEm: Date };
  /** Marca d'água. Vazio em ambiente definitivo. */
  marcaDagua?: string;
};

/**
 * Identificador da emissão, impresso no rodapé.
 *
 * Deriva do documento, do protocolo, da vistoria E do instante da primeira
 * emissão do par (documento, vistoria), que é o que `registrarEmissao` grava
 * na trilha. A segunda via carrega o mesmo identificador, porque é o mesmo
 * ato; uma vistoria nova produz outro.
 *
 * O que ele NÃO é, e o rodapé não promete mais: não é código de validação do
 * conteúdo. O laudo é gerado sob demanda, e uma foto anexada depois muda o
 * papel sem mudar a emissão. Ele identifica a emissão, e
 * `GET /documentos/validar/:codigo` responde a que emissão ele corresponde:
 * protocolo, documento, vistoria, instante e quem emitiu. Antes daqui o código
 * era `sha256(protocolo|vistoria)`, o rodapé o chamava de "validação" e não
 * existia lugar nenhum onde validá-lo.
 */
export function codigoDeEmissao(
  documento: string, protocolo: string, referencia: string, emitidoEm: Date,
): string {
  return createHash("sha256")
    .update(`${documento}|${protocolo}|${referencia}|${emitidoEm.toISOString()}`)
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();
}

/** O identificador deste documento: da emissão registrada, ou da que seria. */
function identificador(d: DadosDocumento, documento: string): string {
  return codigoDeEmissao(
    documento, d.ocorrencia.protocolo, d.vistoria.id,
    d.emissao?.emitidoEm ?? d.emitidoEm,
  );
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
       <p class="relato">${escapar(o.vulnerabilidade_descricao ?? MARCADOR_REMOVIDO_POR_PRAZO)}</p>`
    : ""}`;
}

/*
  O MARCADOR DA MINIMIZAÇÃO, e por que o documento o imprime tal como vem.

  Depois do prazo do município (migrações 021, 029 e 043), o nome do
  solicitante, o relato e a observação do agente chegam do banco como o texto
  "removido por prazo", e o laudo os imprime assim, nos três lugares: é o
  mesmo marcador que a trilha e a exportação mostram, e um leitor que veja
  "Relato recebido: removido por prazo" sabe que o texto existiu e foi
  descartado por decisão do controlador, e não que o chamado entrou sem
  relato. A descrição de vulnerabilidade é a única que chega NULA depois do
  descarte (a marca de vulnerabilidade fica, a descrição sai), e por isso o
  marcador dela é posto aqui: sem isto a folha saía com o título e um
  parágrafo em branco embaixo, que é o "espaço em branco" que este documento
  nunca deixa. O nome de quem deu ciência no local NÃO é minimizado, de
  propósito: faz parte do ato, e `docs/PRIVACIDADE.md` declara a exceção.
*/

function blocoVistoria(d: DadosDocumento, titulo = "Vistoria realizada"): string {
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

  return `<h2>${escapar(titulo)}</h2>
  <div class="campos">
    ${campo("Data e hora da vistoria em campo", formatarDataHora(v.coletada_em, fuso))}
    ${offline
      ? campo("Recebida pelo sistema em", formatarDataHora(v.sincronizada_em, fuso))
      : campo("Registrada no sistema em", formatarDataHora(v.sincronizada_em, fuso))}
    ${campo("Agente responsável", v.agente_nome ?? "não identificado")}
    ${campo("Matrícula", v.agente_matricula ?? "não informada", { mono: true })}
    ${campo("Precisão do GPS",
      v.gps_precisao_metros !== null ? `${v.gps_precisao_metros} metros` : "não registrada")}
    ${campo("Coordenada capturada no local",
      v.latitude !== null && v.latitude !== undefined
        && v.longitude !== null && v.longitude !== undefined
        ? `${v.latitude.toFixed(6)}, ${v.longitude.toFixed(6)}`
        : "não registrada",
      { mono: true })}
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
 * A coleta SEM DESPACHO recebe nota própria, na mesma posição e com a mesma
 * classe. Isto reverte uma decisão anterior ("sem despacho não viola
 * designação nenhuma, e aviso ali treinaria o leitor a ignorar o aviso"), e
 * a reversão tem sondagem atrás: a vistoria entrava em ocorrência `registrada`
 * ou `triagem`, o laudo saía limpo e o termo saía como ato, e nada no papel
 * dizia que a coordenação nunca tinha mandado ninguém àquele endereço. A
 * marca é `sem_despacho`, que vem do evento da trilha (ver o tipo), e não da
 * ausência do nome da equipe: essa ausência é o normal de toda vistoria
 * anterior à migração 024.
 *
 * O texto NÃO acusa ninguém, de propósito. Trocar de equipe entre a coleta e o
 * envio é rotina, e o caso legítimo é mais comum que o outro. O que o papel
 * precisa dizer é que os dois nomes não batem e que alguém tem que olhar. O
 * mesmo vale para a coleta sem despacho: o agente na rua durante o temporal,
 * com a coordenação ainda abrindo o chamado, é o caso comum.
 */
function avisoDeEquipe(v: DadosDocumento["vistoria"]): string {
  if (v.sem_despacho) {
    return `<p class="nota">Esta ocorrência não tinha equipe despachada quando a vistoria foi recebida. O sistema registrou a coleta, e a divergência precisa ser conferida pela coordenação antes de o ato ser praticado.</p>`;
  }

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

/**
 * A LINHA SEM A QUAL A VISTORIA NÃO PODERIA SUBIR SEM A FOTO.
 *
 * O produto passou a aceitar a coleta cujo arquivo o sistema operacional apagou
 * do aparelho antes do envio. Isso salva a manhã de trabalho do agente
 * (checklist, GPS, assinatura, observações e órgãos a acionar deixaram de ser
 * destruídos por uma imagem que sumiu), e cria um risco novo, que é justamente
 * o que este bloco fecha: um laudo com três fotografias, sem nada dizendo que
 * havia cinco, é um documento que PARECE completo e não é. Isso é pior do que
 * não entregar documento nenhum, porque quem decide sobre a casa de uma família
 * decide achando que viu tudo.
 *
 * Três escolhas de redação, e nenhuma é estilo:
 *
 * 1. **"Capturado em campo" e não "não anexado".** O registro existiu: o agente
 *    fotografou, o aparelho guardou, e o arquivo se perdeu depois. A frase
 *    precisa afirmar a existência, senão ela é lida como desleixo do agente.
 * 2. **A hora de cada captura aparece.** É o que amarra esta declaração ao
 *    evento da trilha, e é o que permite conferir daqui a um ano. "Uma
 *    fotografia se perdeu" não permite conferir nada.
 * 3. **A assinatura, quando é ela que se perdeu, é dita com todas as letras.**
 *    Sem isso, a linha de assinatura sai em branco no fim da folha e fica
 *    indistinguível de uma vistoria em que ninguém assinou, que é a lacuna mais
 *    grave que este documento pode ter.
 */
function blocoEvidenciasPerdidas(d: DadosDocumento, fuso: string): string {
  const perdidas = d.evidenciasPerdidas ?? [];
  if (perdidas.length === 0) return "";

  const itens = perdidas
    .map((p) => `<li>${escapar(
      p.papel === "assinatura"
        ? "Assinatura de quem estava no local"
        : `Fotografia${p.legenda?.trim() ? `: ${p.legenda.trim()}` : ""}`,
    )}, capturada em ${escapar(formatarDataHora(p.capturadaEm, fuso))}.</li>`)
    .join("");

  const assinaturaPerdida = perdidas.some((p) => p.papel === "assinatura");

  return `<h2>Registros capturados que não puderam ser recuperados</h2>
    <p class="nota">Os registros abaixo foram capturados durante esta vistoria e não puderam ser recuperados do aparelho no momento da transmissão, então não constam deste documento. A vistoria foi recebida sem eles, por decisão do agente que a coletou, e a perda está registrada na trilha de auditoria.${
      assinaturaPerdida
        ? " A linha de assinatura ao final desta folha sai sem o traço por essa razão, e não por ausência de quem assinou."
        : ""
    }</p>
    <ul class="nota">${itens}</ul>`;
}

function blocoFotos(d: DadosDocumento): string {
  const fuso = fusoDoEstado(d.organizacao.uf);
  const perdidas = (d.evidenciasPerdidas ?? []).filter((p) => p.papel === "foto");
  /*
    "Nenhuma fotografia foi anexada" deixa de ser dito quando houve fotografia
    perdida, e a troca não é detalhe de escrita. Aquela frase afirma que não
    houve registro fotográfico, e nesse caso houve: ele existiu e se perdeu. A
    frase antiga seria a única linha falsa do documento, e estaria exatamente no
    lugar onde quem lê procura a prova.
  */
  const daVistoria = d.fotos.length === 0
    ? `<h2>Registro fotográfico</h2>
      <p class="nota">${
        perdidas.length > 0
          ? "Nenhuma fotografia desta vistoria pôde ser incluída neste documento. Ver a seção seguinte."
          : "Nenhuma fotografia foi anexada a esta vistoria."
      }</p>`
    : `<h2>Registro fotográfico</h2><div class="fotos">${
        galeria(d.fotos, fuso, "Fotografia da vistoria")
      }</div>`;

  return `${daVistoria}${blocoEvidenciasPerdidas(d, fuso)}${blocoFotosAvulsas(d, fuso)}`;
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

/**
 * O QUE A LINHA DE ASSINATURA DIZ QUANDO O TRAÇO FOI COLETADO E SE PERDEU.
 *
 * O bloco de perdas já dizia, num parágrafo acima, que "a linha de assinatura ao
 * final desta folha sai sem o traço por essa razão, e não por ausência de quem
 * assinou". E ao pé da mesma folha, EM CIMA DO NOME DA MORADORA, o documento
 * imprimia "Assinatura não coletada".
 *
 * Isso não é um espaço em branco ambíguo, que é o problema que aquela frase foi
 * escrita para resolver: é uma AFIRMAÇÃO, e a afirmação é falsa. A moradora
 * assinou no dedo, com a minuta lida em voz alta, e o arquivo se perdeu depois.
 *
 * No termo de interdição o rótulo daquela mesma caixa é "Responsável pelo
 * imóvel, ciente": o papel que tira uma família de casa passaria a declarar, com
 * brasão, que ninguém deu ciência da interdição. Isso não é lacuna, é motivo
 * para anular o ato, e a contradição dentro do mesmo documento leva junto a
 * credibilidade do resto do dossiê.
 */
function ausenciaDaAssinatura(d: DadosDocumento): string | undefined {
  const perdida = (d.evidenciasPerdidas ?? []).some((p) => p.papel === "assinatura");
  return perdida
    ? "Assinatura coletada em campo e não recuperada do aparelho"
    : undefined;
}

export function laudoDeVistoria(d: DadosDocumento): string {
  const corpo = `
    ${blocoIdentificacao(d)}
    ${blocoVistoria(d)}
    ${blocoFotos(d)}
    <div class="assinaturas">
      ${assinaturaDeProprioPunho(d.vistoria.agente_nome ?? "Agente de campo", "Agente de proteção e defesa civil")}
      ${assinatura(d.vistoria.assinante_nome, "Presente no local",
        d.vistoria.assinaturaUrl, ausenciaDaAssinatura(d))}
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
    identificador: identificador(d, "laudo"),
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
      ${assinaturaDeProprioPunho(d.vistoria.agente_nome ?? "Agente de campo", "Agente de proteção e defesa civil")}
      ${assinatura(d.vistoria.assinante_nome, "Responsável pelo imóvel, ciente",
        d.vistoria.assinaturaUrl, ausenciaDaAssinatura(d))}
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
    identificador: identificador(d, "termo_de_interdicao"),
    emitidoEm: d.emitidoEm,
    emitidoPor: d.emitidoPor,
    ...(d.marcaDagua ? { marcaDagua: d.marcaDagua } : {}),
  });
}

/**
 * O que o termo de desinterdição imprime no lugar da vistoria quando o
 * levantamento foi autorizado SEM vistoria nova.
 *
 * A rota de levantamento aceita isso de propósito (equipe afogada no dia da
 * chuva) e prometia: "o termo imprime o motivo por extenso, e 'sem nova
 * vistoria' fica escrito nele se for o caso". O termo não cumpria: imprimia o
 * checklist da vistoria que INTERDITOU, com "Interdição indicada: SIM", como
 * se fosse o fundamento do levantamento. Um papel que se contradiz sozinho.
 *
 * Aqui o documento diz o fato e identifica a vistoria que sustentou a
 * interdição (data, agente), sem reproduzir um checklist que afirma o contrário
 * da decisão de duas seções acima.
 */
function blocoLevantamentoSemVistoria(d: DadosDocumento, fuso: string): string {
  const v = d.vistoria;
  return `<h2>Vistoria</h2>
    <p class="nota">Este levantamento foi autorizado sem nova vistoria técnica. A interdição foi sustentada pela vistoria realizada em ${escapar(formatarDataHora(v.coletada_em, fuso))} por ${escapar(v.agente_nome ?? "agente não identificado")}${v.agente_matricula ? `, matrícula ${escapar(v.agente_matricula)}` : ""}, e o fundamento do levantamento é o motivo transcrito acima.</p>`;
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

    ${dez.comNovaVistoria
      ? blocoVistoria(d, "Vistoria que motivou o levantamento")
      : blocoLevantamentoSemVistoria(d, fuso)}

    <div class="assinaturas">
      ${assinaturaDeProprioPunho(dez.porNome, "Coordenação de proteção e defesa civil")}
      ${assinaturaDeProprioPunho(d.vistoria.assinante_nome, "Responsável pelo imóvel, ciente")}
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
    identificador: identificador(d, "termo_de_desinterdicao"),
    emitidoEm: d.emitidoEm,
    emitidoPor: d.emitidoPor,
    ...(d.marcaDagua ? { marcaDagua: d.marcaDagua } : {}),
  });
}
