import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { estadoTerminal, type StatusOcorrencia } from "@dc360/shared";
import type { Banco, Consulta } from "../banco/tipos.js";
import { ROTA_GET_COM_EFEITO, RegraDeNegocio, autorizar, type Identidade } from "../servidor.js";
import type { Armazenamento } from "../armazenamento/tipos.js";
import {
  codigoDeEmissao, laudoDeVistoria, termoDeDesinterdicao, termoDeInterdicao,
  type DadosDocumento,
} from "../documentos/laudo.js";
import type { GeradorDePdf } from "../documentos/pdf.js";
import { identificadorDoOficio } from "../oficios/documento.js";
import {
  lerEmissao, marcarInterditada, registrarEmissao,
  type DocumentoEmitido, type EmissaoRegistrada,
} from "../trilha.js";
import { registrarConsulta } from "../privacidade/consulta.js";
import { enderecoDoCliente } from "../rede.js";

/**
 * Documentos oficiais.
 *
 * Saem do servidor como HTML pronto para impressão, e não montados na tela,
 * porque o mesmo laudo precisa sair igual no navegador do coordenador, na
 * impressora da recepção e no PDF anexado ao processo. Gerar em três lugares
 * seria produzir três documentos com o mesmo número de protocolo.
 *
 * Quando a geração de PDF entrar, ela renderiza exatamente estas páginas: o
 * template é um só, versionado com o código.
 */

const idSchema = z.object({ id: z.string().uuid() });

/**
 * O identificador do rodapé, como `GET /documentos/validar/:codigo` o recebe.
 * Exportado para o contrato OpenAPI (V2-F02-E04) descrever a mesma regra que o
 * handler aplica, sem copiá-la.
 */
export const codigoSchema = z.object({
  codigo: z.string().regex(/^[0-9A-Fa-f]{12}$/, "Identificador com formato inválido"),
});

/**
 * A ocorrência como o documento a lê, mais o estado da interdição.
 *
 * As duas datas de interdição não entram na folha: elas decidem se a emissão
 * do termo é o ATO de interditar ou a SEGUNDA VIA de um ato que já aconteceu.
 * Ver `emissaoEhAtoDeInterdicao`.
 */
type LinhaOcorrencia = DadosDocumento["ocorrencia"] & {
  organizacao_id: string;
  interditada_em: string | null;
  desinterditada_em: string | null;
};

/**
 * @param vistoriaId A vistoria que o documento imprime, quando NÃO é a vigente.
 *   A segunda via do termo de interdição sai da vistoria que sustentou o ato,
 *   e o termo de desinterdição sai da que motivou o levantamento. Nulo lê a
 *   vigente, que é o que o laudo e o ato de interditar querem.
 */
async function reunirDados(
  banco: Banco,
  armazenamento: Armazenamento,
  organizacaoId: string,
  ocorrenciaId: string,
  emitidoPor: string,
  vistoriaId: string | null = null,
): Promise<DadosDocumento> {
  const bruto = await banco.comTenant(organizacaoId, async (c) => {
    const ocorrencia = await c.query<LinhaOcorrencia>(
      `SELECT o.*, e.nome AS equipe_nome
         FROM ocorrencias o LEFT JOIN equipes e ON e.id = o.equipe_id
        WHERE o.id = $1`,
      [ocorrenciaId],
    );
    if (!ocorrencia.rows[0]) {
      throw new RegraDeNegocio("nao_encontrada", "Ocorrência não encontrada.", 404);
    }

    const organizacao = await c.query<{ nome: string; municipio: string; uf: string }>(
      "SELECT nome, municipio, uf FROM organizacoes WHERE id = $1",
      [organizacaoId],
    );

    /*
      A vistoria vigente é a última que o SERVIDOR recebeu, e não a que se diz
      ter acontecido por último.

      Isto ordenava por `coletada_em`, que é declarada pelo aparelho. A migração
      009 aceita até doze horas no futuro de propósito, porque relógio trocado é
      rotina em campo. O efeito era este: dois agentes, dois aparelhos, e vencia
      o relógio mais adiantado em vez de quem foi por último.

      Reproduzido pelo QA: uma vistoria datada onze horas à frente dizendo
      "interditar" continuava vigente depois de uma vistoria real, feita depois,
      dizendo "não interditar". O termo saía, com brasão, mandando desocupar um
      imóvel cujo risco tinha cessado.

      O caso espelho é igual de ruim: uma vistoria futura dizendo "não
      interditar" travaria para sempre a re-vistoria legítima, e a mensagem do
      próprio 409 manda "registre uma vistoria nova", que nunca viraria vigente.

      `sincronizada_em` é `now()` do banco, e ninguém escolhe. `coletada_em`
      continua sendo o que o laudo imprime como data do ato, porque é a hora em
      que o agente esteve no barranco. Ela só deixa de decidir qual vistoria
      vale.
    */
    const vistoria = await c.query<
      DadosDocumento["vistoria"] & { assinatura_chave: string | null }
    >(
      `SELECT v.id, v.checklist, v.gps_precisao_metros, v.assinante_nome, v.observacoes,
              v.coletada_em, v.sincronizada_em, v.assinatura_chave,
              v.latitude, v.longitude,
              v.desalojados, v.desabrigados, v.feridos, v.desaparecidos, v.obitos,
              u.nome AS agente_nome, u.matricula AS agente_matricula,
              ed.nome AS equipe_designada_nome, ea.nome AS equipe_do_agente_nome,
              EXISTS (
                SELECT 1 FROM trilha_eventos t
                 WHERE t.ocorrencia_id = v.ocorrencia_id
                   AND t.tipo = 'vistoria_sem_despacho'
                   AND t.detalhe ->> 'vistoriaId' = v.id::text
              ) AS sem_despacho
         FROM vistorias v
         LEFT JOIN usuarios u ON u.id = v.agente_id
         LEFT JOIN equipes ed ON ed.id = v.equipe_designada_id
         LEFT JOIN equipes ea ON ea.id = v.equipe_do_agente_id
        WHERE v.ocorrencia_id = $1
          AND ($2::uuid IS NULL OR v.id = $2)
                ORDER BY v.sincronizada_em DESC, v.coletada_em DESC LIMIT 1`,
      [ocorrenciaId, vistoriaId],
    );
    /*
      `sem_despacho` vem da TRILHA, e não de `v.equipe_designada_id IS NULL`.

      A coluna nula é o estado normal de toda vistoria anterior à migração 024,
      e lê-la como marca faria o laudo de cada uma delas afirmar que a
      coordenação não tinha despachado ninguém. O evento `vistoria_sem_despacho`
      é gravado pela rota de sincronização no instante em que a coleta chega em
      ocorrência sem equipe (a partir de 15/09/2026), aponta para a vistoria
      pelo `detalhe`, e é append-only: a marca não se perde nem se inventa.
    */
    if (!vistoria.rows[0]) {
      throw new RegraDeNegocio(
        "sem_vistoria",
        "Esta ocorrência ainda não tem vistoria concluída, então não há o que documentar.",
        409,
      );
    }

    /*
      AS FOTOS SÃO DA VISTORIA VIGENTE, e não da ocorrência inteira.

      Esta consulta filtrava só por `ocorrencia_id`, enquanto todo o resto do
      documento (checklist, agente, assinante, datas, órgãos indicados) vinha
      da vistoria vigente. Reproduzido pela revisão: o laudo da re-vistoria B,
      que concluiu que o risco cessou, saía com as fotos do talude destruído da
      vistoria A, numeradas como "Fotografia 1 da vistoria". O documento
      afirmava, com brasão, que o agente fotografou aquilo naquela ida.

      O caso de re-vistoria não é raro: é o caminho normal de todo levantamento
      de interdição, e é justamente o documento em que a diferença entre as
      duas idas é a coisa mais importante da folha.
    */
    const fotos = await c.query<{
      chave_storage: string; legenda: string | null; capturada_em: string;
    }>(
      `SELECT chave_storage, legenda, capturada_em FROM evidencias
        WHERE ocorrencia_id = $1 AND vistoria_id = $2 AND enviada_em IS NOT NULL
        ORDER BY ordem, capturada_em`,
      [ocorrenciaId, vistoria.rows[0]!.id],
    );

    /*
      AS FOTOS SEM VISTORIA, e por que elas não somem nem se misturam.

      Existem de verdade: o fluxo de evidência avulsa (`POST
      /evidencias/autorizar-envio` sem coleta atrás) grava a linha com
      `vistoria_id` nulo, e ela nunca é amarrada a vistoria nenhuma. Somá-las à
      vistoria vigente é o defeito acima em versão menor, e mais difícil de
      pegar: o documento passaria a atribuir ao agente uma imagem que ele não
      fez. Descartá-las cala uma prova que alguém anexou ao processo de
      propósito, e o laudo é onde o processo se lê.

      A terceira saída é dizer o que elas são: seção própria, com quem anexou e
      quando, sem número de foto da vistoria. Quem lê consegue separar o
      registro do agente em campo do que foi acrescentado depois.
    */
    const avulsas = await c.query<{
      chave_storage: string; legenda: string | null; capturada_em: string;
      anexada_por_nome: string | null;
    }>(
      `SELECT e.chave_storage, e.legenda, e.capturada_em, u.nome AS anexada_por_nome
         FROM evidencias e
         LEFT JOIN usuarios u ON u.id = e.anexada_por
        WHERE e.ocorrencia_id = $1 AND e.vistoria_id IS NULL
          AND e.enviada_em IS NOT NULL
        ORDER BY e.ordem, e.capturada_em`,
      [ocorrenciaId],
    );

    /*
      Os órgãos que a vistoria indicou.

      Ligados à VISTORIA e não à ocorrência, de propósito: numa re-vistoria o
      risco pode ter mudado, e o laudo novo precisa listar quem o agente indicou
      naquela ida, não a soma de tudo o que já foi indicado no protocolo.

      `nome` sai desta tabela e não de `orgaos`, mesmo quando há vínculo. O nome
      gravado é o que o agente viu na tela no dia da coleta, e é ele que torna o
      laudo legível daqui a cinco anos, depois de o órgão ter sido renomeado ou
      fundido com outro. A sigla, essa sim, vem do cadastro: ela é abreviação e
      não identidade, e nenhuma coleta a carrega.
    */
    const orgaos = await c.query<{ nome: string; sigla: string | null }>(
      `SELECT i.nome, g.sigla
         FROM vistoria_orgaos_indicados i
         LEFT JOIN orgaos g ON g.id = i.orgao_id
        WHERE i.vistoria_id = $1
        ORDER BY i.ordem, i.criado_em, i.id`,
      [vistoria.rows[0]!.id],
    );

    /*
      O QUE FOI CAPTURADO EM CAMPO E NÃO CHEGOU, e por que ele é lido aqui.

      Sem esta consulta o laudo sairia com o registro fotográfico que sobrou e
      nada dizendo que havia mais: um documento que parece completo e não é, que
      é pior do que documento nenhum. O produto só pode aceitar a coleta sem o
      arquivo porque o papel declara a falta.

      Da VISTORIA VIGENTE, como as fotos e os órgãos, e pelo mesmo motivo: numa
      re-vistoria, a perda da ida anterior não é perda desta.
    */
    const perdidas = await c.query<{
      papel: "foto" | "assinatura"; capturada_em: string; legenda: string | null;
    }>(
      `SELECT papel, capturada_em, legenda
         FROM vistoria_evidencias_perdidas
        WHERE vistoria_id = $1
        ORDER BY ordem, capturada_em, id`,
      [vistoria.rows[0]!.id],
    );

    return {
      organizacao: organizacao.rows[0]!,
      ocorrencia: ocorrencia.rows[0],
      vistoria: { ...vistoria.rows[0], orgaosIndicados: orgaos.rows },
      fotos: fotos.rows,
      avulsas: avulsas.rows,
      perdidas: perdidas.rows,
    };
  });

  const assinaturaUrl = await enderecoDaAssinatura(
    armazenamento, organizacaoId, bruto.vistoria.assinatura_chave,
  );

  return {
    organizacao: bruto.organizacao,
    ocorrencia: bruto.ocorrencia,
    vistoria: { ...bruto.vistoria, assinaturaUrl },
    // A URL da foto é assinada na hora de gerar o documento, e vale por pouco
    // tempo. Um laudo salvo em disco perde as imagens depois disso, o que é
    // correto: a versão que vale é a que sai impressa ou em PDF.
    fotos: await Promise.all(
      bruto.fotos.map(async (f) => ({
        url: await armazenamento.urlParaLer(f.chave_storage, 30 * 60),
        legenda: f.legenda,
        capturadaEm: f.capturada_em,
      })),
    ),
    evidenciasPerdidas: bruto.perdidas.map((p) => ({
      papel: p.papel,
      capturadaEm: p.capturada_em,
      legenda: p.legenda,
    })),
    fotosAvulsas: await Promise.all(
      bruto.avulsas.map(async (f) => ({
        url: await armazenamento.urlParaLer(f.chave_storage, 30 * 60),
        legenda: f.legenda,
        capturadaEm: f.capturada_em,
        anexadaPorNome: f.anexada_por_nome,
      })),
    ),
    emitidoPor,
    emitidoEm: new Date(),
  };
}

/**
 * Endereço de leitura do traço de assinatura, ou nada.
 *
 * Duas checagens, e a segunda é a que importa. O traço vive no mesmo
 * armazenamento das fotos, então recebe o mesmo tratamento: endereço assinado,
 * de vida curta, nunca público.
 *
 * Mas a chave sozinha não prova que os bytes chegaram. A rota de sincronização
 * aceita a chave que o aparelho declarou, e o envio do arquivo é outro passo,
 * que pode ter falhado. Emitir a imagem sem conferir produziria um retângulo
 * quebrado no meio de um laudo com brasão, que é pior que assinatura nenhuma:
 * parece documento adulterado.
 */
async function enderecoDaAssinatura(
  armazenamento: Armazenamento,
  organizacaoId: string,
  chave: string | null,
): Promise<string | null> {
  if (!chave) return null;

  /*
   * Terceira camada, e a única que roda na hora de LER.
   *
   * A rota de sincronização remonta a chave e o banco tem a restrição da
   * migração 009, então uma chave estranha não deveria conseguir chegar até
   * aqui. Esta conferência existe para o dia em que uma das duas falhar, e
   * porque é ela que evita tocar o armazenamento: sem ela, uma chave de outra
   * prefeitura vira uma chamada `descrever` cujo resultado é observável no
   * documento, ou seja, um oráculo de existência sobre o balde inteiro.
   *
   * Recusar aqui devolve exatamente o mesmo que "não colheu assinatura", que é
   * o que mata o oráculo: o laudo sai idêntico nos dois casos.
   */
  if (!chave.startsWith(`tenant/${organizacaoId}/`)) return null;

  const objeto = await armazenamento.descrever(chave).catch(() => ({ existe: false }));
  if (!objeto.existe) return null;
  return armazenamento.urlParaLer(chave, 30 * 60);
}

export async function rotasDocumentos(
  app: FastifyInstance,
  { banco, armazenamento, marcaDagua, pdf }: {
    banco: Banco;
    armazenamento: Armazenamento;
    marcaDagua?: string;
    /** Ausente quando o servidor sobe sem navegador para renderizar. */
    pdf?: GeradorDePdf;
  },
): Promise<void> {
  /**
   * Interdição é ato administrativo, não um botão de imprimir.
   *
   * O termo tira uma família de casa. Quem decide isso é o agente que esteve
   * no local e respondeu o checklist, e `interdicao_indicada` é item
   * OBRIGATÓRIO da vistoria justamente por isso: ele sempre existe e sempre
   * tem resposta.
   *
   * Até aqui a rota nunca o lia. Uma vistoria que concluiu "interdição
   * indicada: não" produzia, do mesmo jeito, um documento com brasão dizendo
   * "Fica INTERDITADO o imóvel". O papel não tinha como ser distinguido de um
   * termo legítimo, e nada no sistema registrava que ele havia saído.
   */
  function exigirInterdicaoIndicada(dados: DadosDocumento): void {
    const indicada = dados.vistoria.checklist
      .some((i) => i.chave === "interdicao_indicada" && i.resposta);
    if (indicada) return;
    throw new RegraDeNegocio(
      "interdicao_nao_indicada",
      "A vistoria desta ocorrência não indicou interdição, então não há termo a emitir. "
      + "Se o risco mudou, registre uma vistoria nova antes de interditar.",
      409,
    );
  }

  /**
   * Os estados em que a ocorrência AINDA NÃO FOI DESPACHADA, e por que o ato
   * de interditar não sai deles.
   *
   * Lido de `TRANSICOES_PERMITIDAS`: `em_campo` tem uma única entrada,
   * `triagem -> em_campo`, que é a rota de despacho; `vistoria_concluida` só
   * vem de `em_campo` e `providencia_pendente` só de `vistoria_concluida`.
   * Então, fora de `encerrada` (terminal, e o ato já é recusado lá), todo
   * status que não está nesta lista prova que um despacho aconteceu. A única
   * aresta para trás da máquina, `em_campo -> triagem`, é a devolução de
   * tarefa: ela LIMPA a equipe e devolve a decisão à coordenação, então
   * `triagem` depois dela é, de novo, "ninguém despachado", e a lista acerta
   * sem precisar saber por onde a ocorrência passou.
   *
   * POR QUE O STATUS, e não a coluna da vistoria nem o evento da trilha. A
   * coluna `equipe_designada_id` é nula em toda vistoria anterior à migração
   * 024, e recusaria o ato sobre coleta legítima antiga. O evento
   * `vistoria_sem_despacho` diz o que o PAPEL precisa dizer (a nota sai por
   * ele), mas o ato é sobre o PROCESSO: se a coordenação despachou depois de a
   * coleta chegar, ela fez exatamente a conferência que a nota pede, e o termo
   * sai, com a nota impressa. E o status já está em `EstadoDaInterdicao`, lido
   * na transação da escrita em `efetivarEmissao`, então a conferência se refaz
   * ali de graça.
   *
   * A sondagem que originou isto: vistoria em ocorrência `registrada` ou
   * `triagem` entrava, e o termo de interdição saía como ATO em cima dela. A
   * coordenação nunca tinha mandado ninguém àquele endereço, e o papel com
   * brasão interditava a casa mesmo assim.
   */
  const ANTES_DO_DESPACHO: ReadonlySet<StatusOcorrencia> = new Set<StatusOcorrencia>([
    "rascunho", "registrada", "triagem",
  ]);

  function exigirOcorrenciaDespachada(status: StatusOcorrencia): void {
    if (!ANTES_DO_DESPACHO.has(status)) return;
    throw new RegraDeNegocio(
      "sem_despacho",
      "Esta ocorrência ainda não foi despachada: a coordenação precisa despachar a "
      + "ocorrência antes de praticar o ato. O laudo de vistoria continua "
      + "disponível.",
      409,
    );
  }

  /**
   * O estado da interdição de uma ocorrência, lido de uma vez.
   *
   * Nulo quando a ocorrência não existe DESTE município: o RLS não devolve a
   * linha, e a resposta é o mesmo 404 de um identificador inventado.
   *
   * `vistoria_do_ato` é a vistoria que SUSTENTOU a interdição em vigor (ou a
   * última): a `vistoriaId` gravada na emissão mais recente do termo. É dela
   * que a segunda via sai. A vigente, que é a última recebida, pode ser a
   * re-vistoria que atestou a cessação do risco, e imprimir essa embaixo de
   * "Fica INTERDITADO" seria um papel que se contradiz. Era pior: a rota
   * exigia `interdicao_indicada` da vigente e respondia 409 para a cópia de
   * um ato que já aconteceu.
   */
  type EstadoDaInterdicao = {
    status: StatusOcorrencia;
    interditada_em: string | null;
    desinterditada_em: string | null;
    desinterdicao_motivo: string | null;
    por_nome: string | null;
    nunca_interditada: boolean;
    levantada: boolean;
    ha_vistoria_apos_levantamento: boolean;
    vistoria_do_ato: string | null;
  };

  async function estadoDaInterdicao(
    c: Consulta, ocorrenciaId: string,
  ): Promise<EstadoDaInterdicao | null> {
    const r = await c.query<EstadoDaInterdicao>(
      `SELECT o.status, o.interditada_em, o.desinterditada_em, o.desinterdicao_motivo,
              u.nome AS por_nome,
              o.interditada_em IS NULL        AS nunca_interditada,
              o.desinterditada_em IS NOT NULL AS levantada,
              EXISTS (
                SELECT 1 FROM vistorias v
                 WHERE v.ocorrencia_id = o.id
                   AND o.desinterditada_em IS NOT NULL
                   AND v.sincronizada_em > o.desinterditada_em
              ) AS ha_vistoria_apos_levantamento,
              (
                SELECT t.detalhe ->> 'vistoriaId'
                  FROM trilha_eventos t
                 WHERE t.ocorrencia_id = o.id
                   AND t.tipo = 'documento_emitido'
                   AND t.detalhe ->> 'documento' = 'termo_de_interdicao'
                 ORDER BY t.ocorrido_em DESC, t.registrado_em DESC
                 LIMIT 1
              ) AS vistoria_do_ato
         FROM ocorrencias o
         LEFT JOIN usuarios u ON u.id = o.desinterditada_por
        WHERE o.id = $1`,
      [ocorrenciaId],
    );
    return r.rows[0] ?? null;
  }

  /**
   * Emitir o termo é interditar. Reimprimir o termo NÃO é interditar de novo.
   *
   * O DEFEITO, reproduzido pela revisão adversarial, em três passos: emitir o
   * termo (interdita), levantar a interdição com motivo, e pedir o MESMO termo
   * outra vez, que é a segunda via de rotina que o próprio
   * `desinterdicao.test.ts` chama de legítima (o papel molhou, o processo pede
   * cópia). Depois do terceiro passo, `marcarInterditada` reinterditava:
   * `interditada_em` ganhava data nova, `desinterditada_em` voltava a NULL e
   * `desinterdicao_motivo` era APAGADO, tudo sem um único evento na trilha.
   *
   * O estrago é do pior tipo que este produto pode produzir. A casa volta a
   * constar interditada por um ato que ninguém praticou. O termo de
   * desinterdição deixa de poder ser emitido, porque a rota dele exige
   * `desinterditada_em`, então a família perde o papel que a autoriza a voltar.
   * E some a coluna que responde, anos depois, POR QUE ela foi autorizada a
   * voltar. Como a trilha é append-only, o evento de desinterdição continua lá:
   * o registro passa a se contradizer sozinho.
   *
   * A regra que faltava é a que o comentário de `marcarInterditada` já
   * afirmava e ninguém conferia: reinterditar depois de um levantamento exige
   * VISTORIA NOVA, porque o risco voltou. Sem vistoria posterior ao
   * levantamento, o que está sendo pedido é a cópia de um documento antigo, e
   * cópia não pratica ato.
   *
   * Nunca interditada: esta emissão é o ato. Interditada e ainda não
   * levantada: é segunda via, e `marcarInterditada` já não tocaria na data.
   * Levantada: só volta a ser ato se houver vistoria depois do levantamento.
   */
  function emissaoEhAtoDeInterdicao(estado: EstadoDaInterdicao): boolean {
    return estado.nunca_interditada
      || (estado.levantada && estado.ha_vistoria_apos_levantamento);
  }

  /**
   * A vistoria que o termo de desinterdição imprime.
   *
   * A vigente NO INSTANTE DO LEVANTAMENTO (a última recebida até ali), e não a
   * vigente de agora: uma vistoria recebida depois do levantamento é outro
   * assunto, possivelmente o risco voltando. `nova` diz se ela veio DEPOIS da
   * interdição, ou seja, se é a re-vistoria que atestou a cessação do risco.
   * Quando não é, o levantamento foi sem vistoria nova, e o termo diz isso em
   * vez de imprimir "Interdição indicada: SIM" embaixo de "Fica LEVANTADA".
   */
  async function vistoriaDoLevantamento(
    c: Consulta, ocorrenciaId: string,
  ): Promise<{ id: string; nova: boolean } | null> {
    const r = await c.query<{ id: string; nova: boolean }>(
      `SELECT v.id, (v.sincronizada_em > o.interditada_em) AS nova
         FROM vistorias v
         JOIN ocorrencias o ON o.id = v.ocorrencia_id
        WHERE v.ocorrencia_id = $1
          AND o.desinterditada_em IS NOT NULL
          AND v.sincronizada_em <= o.desinterditada_em
        ORDER BY v.sincronizada_em DESC, v.coletada_em DESC
        LIMIT 1`,
      [ocorrenciaId],
    );
    return r.rows[0] ?? null;
  }

  type Preparado = {
    quem: Identidade;
    id: string;
    dados: DadosDocumento;
    /** Esta emissão pratica o ATO de interditar. Só o termo de interdição. */
    ato: boolean;
  };

  /*
    A emissão é dividida em PREPARAR e EFETIVAR, e a divisão conserta um
    defeito com pessoa dentro: pedir o termo em PDF num servidor sem gerador
    interditava o imóvel e depois respondia 503. A interdição ficava com a data
    da tentativa que falhou, para sempre, e a única saída registrada era uma
    desinterdição. O QA reproduziu.

    Agora o efeito colateral (registrar emissão, interditar) só acontece em
    EFETIVAR, chamado depois que o servidor já sabe que consegue produzir o
    documento. PREPARAR não muda estado: autoriza, confere o dono e valida.

    ATO e CÓPIA, que é a segunda linha que PREPARAR traça. Uma ocorrência
    encerrada não recebe ato novo: interditar dentro de um processo fechado é
    o que o revisor de integridade provou que passava, enquanto a correção de
    coordenada já recusava o estado terminal. Cópia continua saindo depois do
    encerramento (laudo, segunda via do termo, termo de desinterdição), porque
    o processo pede cópia e a família precisa do papel, e reimprimir não muda
    nada.
  */
  async function prepararDocumento(
    req: FastifyRequest,
    documento: DocumentoEmitido,
  ): Promise<Preparado> {
    /*
      Permissão, e não só token.

      O laudo não é uma tela a mais: é o dossiê montado. Ele reúne, numa página
      só, o nome e o contato do solicitante, o endereço completo, a descrição
      da vulnerabilidade social da família, todas as fotos da casa e a
      identificação do agente que assinou. Cada pedaço disso já circula em
      algum lugar do sistema; a concentração é que muda a natureza da coisa, e
      é ela que sai impressa e vai parar num processo.

      Emitir é ato de coordenação, pela mesma razão que encerrar é.

      A leitura de EVIDÊNCIA continua exigindo apenas autenticação, e isso é
      deliberado, contra a recomendação do auditor. As fotos já aparecem na
      tela de detalhe que operador e agente de campo abrem legitimamente todo
      dia; restringir por papel quebraria a tela de quem atende o telefone sem
      esconder nada que essa pessoa não pudesse ver de qualquer jeito. Ali o
      controle que importa é o isolamento por município, e ele existe.
    */
    const quem = await autorizar(app, req, "emitir_documento");
    const { id } = idSchema.parse(req.params);
    const emitidoPor = `${quem.nome} (${quem.papel})`;

    if (documento === "laudo") {
      const dados = await reunirDados(banco, armazenamento, quem.organizacaoId, id, emitidoPor);
      return { quem, id, dados, ato: false };
    }

    const estado = await banco.comTenant(quem.organizacaoId, (c) => estadoDaInterdicao(c, id));
    // 404, e não 403: recurso de outro município não se confirma.
    if (!estado) throw new RegraDeNegocio("nao_encontrada", "Ocorrência não encontrada.", 404);

    if (documento === "termo_de_interdicao") {
      const ato = emissaoEhAtoDeInterdicao(estado);
      if (ato && estadoTerminal(estado.status)) {
        throw new RegraDeNegocio(
          "ocorrencia_encerrada",
          "Esta ocorrência está encerrada e não recebe ato novo: interditar aqui "
          + "seria interditar dentro de um processo fechado. Se o risco existe, "
          + "registre uma ocorrência nova, vinculada a esta.",
          409,
        );
      }
      // Só o ATO exige despacho. A cópia de um termo já lavrado continua
      // saindo, porque reimprimir não interdita nada.
      if (ato) exigirOcorrenciaDespachada(estado.status);
      /*
        O ato sai da vistoria VIGENTE, que é quem acabou de dizer que a casa
        precisa ser interditada. A cópia sai da vistoria que SUSTENTOU o ato,
        gravada na emissão; a vigente pode ser a re-vistoria que disse NÃO.
      */
      const dados = await reunirDados(
        banco, armazenamento, quem.organizacaoId, id, emitidoPor,
        ato ? null : estado.vistoria_do_ato,
      );
      exigirInterdicaoIndicada(dados);
      return { quem, id, dados, ato };
    }

    // termo_de_desinterdicao: não desinterdita nada, isso já aconteceu.
    if (!estado.desinterditada_em || !estado.interditada_em) {
      throw new RegraDeNegocio(
        "nao_desinterditada",
        "Esta ocorrência não teve interdição levantada, então não há termo de "
        + "desinterdição a emitir.",
        409,
      );
    }
    const motivadora = await banco.comTenant(
      quem.organizacaoId, (c) => vistoriaDoLevantamento(c, id),
    );
    const dados = await reunirDados(
      banco, armazenamento, quem.organizacaoId, id, emitidoPor, motivadora?.id ?? null,
    );
    dados.desinterdicao = {
      em: estado.desinterditada_em,
      motivo: estado.desinterdicao_motivo ?? "",
      porNome: estado.por_nome ?? "Coordenação",
      interditadaEm: estado.interditada_em,
      comNovaVistoria: motivadora?.nova ?? false,
    };
    return { quem, id, dados, ato: false };
  }

  /**
   * O efeito colateral, numa transação sua. Só é chamado quando o documento
   * vai ser entregue de verdade. Emitir o termo É interditar: antes, o termo
   * saía e o sistema não guardava em lugar nenhum que aquele imóvel estava
   * interditado, então não havia como listar o que está interditado hoje, nem
   * nada que obrigasse alguém a levantar a interdição um dia.
   *
   * A decisão "isto é ato ou cópia" é REFEITA aqui, na mesma transação da
   * escrita, e conferida contra a que PREPARAR tomou. Se o estado mudou entre
   * as duas (um levantamento e uma vistoria nova no intervalo), os dados
   * preparados são de outra situação, e gravar seria interditar com o papel
   * errado. É 409, e a pessoa pede de novo.
   *
   * Devolve a emissão que VALE (a primeira do par documento e vistoria), porque
   * é o instante dela que entra no identificador impresso no rodapé.
   */
  async function efetivarEmissao(
    p: Preparado,
    documento: DocumentoEmitido,
    formato: "html" | "pdf",
    ip: string | null,
  ): Promise<EmissaoRegistrada> {
    const { quem, id, dados } = p;
    return banco.comTenant(quem.organizacaoId, async (c) => {
      if (documento === "termo_de_interdicao") {
        const agora = await estadoDaInterdicao(c, id);
        const ato = agora ? emissaoEhAtoDeInterdicao(agora) : false;
        // A devolução de tarefa (`em_campo -> triagem`) cabe no intervalo
        // entre PREPARAR e EFETIVAR, e o ato não pode sair sobre ocorrência
        // que acabou de voltar para a coordenação.
        const semDespacho = ato && agora !== null && ANTES_DO_DESPACHO.has(agora.status);
        if (!agora || ato !== p.ato || (ato && estadoTerminal(agora.status)) || semDespacho) {
          throw new RegraDeNegocio(
            "estado_mudou",
            "A situação da interdição mudou enquanto o termo era preparado. "
            + "Peça o documento de novo.",
            409,
          );
        }
      }

      const emissao = await registrarEmissao(
        c, quem, id, documento, dados.vistoria.id, formato, dados.emitidoEm,
      );
      if (documento === "termo_de_interdicao" && p.ato) {
        await marcarInterditada(c, quem, id);
      }

      /*
        O acesso ao documento fica registrado, e SEMPRE, inclusive na décima
        vez que alguém abrir o mesmo laudo.

        A diferença entre isto e `registrarEmissao` logo acima é o ponto: a
        trilha guarda o ATO de emitir (uma linha por documento e vistoria,
        porque dez aberturas do mesmo laudo não são dez atos administrativos),
        e aqui guarda-se o ACESSO. Para "quem viu os dados dessa família?" a
        décima abertura conta tanto quanto a primeira, e é justamente a
        repetição que descreve alguém consultando dado que não precisa
        consultar.

        O laudo é onde a concentração é maior: nome, contato, endereço,
        descrição de vulnerabilidade social, fotos da casa e a identificação de
        quem assinou, tudo numa página que sai impressa.
      */
      await registrarConsulta(c, quem, {
        ocorrenciaId: id,
        recurso: documento,
        finalidade: "emissao_de_documento",
        ip,
      });
      return emissao;
    });
  }

  const GERADOR: Record<DocumentoEmitido, (d: DadosDocumento) => string> = {
    laudo: laudoDeVistoria,
    termo_de_interdicao: termoDeInterdicao,
    termo_de_desinterdicao: termoDeDesinterdicao,
  };

  function gerar(documento: DocumentoEmitido, dados: DadosDocumento, emissao: EmissaoRegistrada): string {
    return GERADOR[documento]({
      ...dados,
      emissao,
      ...(marcaDagua ? { marcaDagua } : {}),
    });
  }

  /** Caminho HTML: prepara, efetiva e gera, nesta ordem. */
  async function responder(req: FastifyRequest, documento: DocumentoEmitido): Promise<string> {
    const preparado = await prepararDocumento(req, documento);
    const emissao = await efetivarEmissao(preparado, documento, "html", enderecoDoCliente(req));
    return gerar(documento, preparado.dados, emissao);
  }

  app.get("/:id/laudo", ROTA_GET_COM_EFEITO, async (req, resposta) => {
    const html = await responder(req, "laudo");
    return resposta.type("text/html; charset=utf-8").send(html);
  });

  app.get("/:id/termo-de-interdicao", ROTA_GET_COM_EFEITO, async (req, resposta) => {
    const html = await responder(req, "termo_de_interdicao");
    return resposta.type("text/html; charset=utf-8").send(html);
  });

  /**
   * O termo de desinterdição: o papel que autoriza a família a voltar.
   *
   * Existe porque o contrário existia. O levantamento já é registrado (rota
   * `POST /ocorrencias/:id/desinterdicao`), mas até aqui não havia como emitir
   * o documento que o morador leva. A tela mandava "emita o termo de
   * desinterdição" e não havia onde.
   *
   * Ela NÃO desinterdita: isso já aconteceu, e é pré-requisito. Emitir sobre
   * um imóvel que não foi desinterditado responde 409, não inventa um estado.
   *
   * E ela NÃO exige que a vistoria vigente indique interdição. Exigia, porque
   * preparava os dados pelo caminho do termo de interdição, e o fluxo normal
   * de todo levantamento (re-vistoria dizendo que o risco cessou) respondia
   * 409 `interdicao_nao_indicada` justamente para o papel que a família
   * esperava. Reproduzido pelo revisor de integridade.
   */
  app.get("/:id/termo-de-desinterdicao", ROTA_GET_COM_EFEITO, async (req, resposta) => {
    const html = await responder(req, "termo_de_desinterdicao");
    return resposta.type("text/html; charset=utf-8").send(html);
  });

  /**
   * O mesmo documento em PDF.
   *
   * Gerado sob demanda, e não guardado: o laudo muda se uma foto for anexada
   * depois, e um PDF em cache seria a versão errada com cara de definitiva.
   * Quando o volume crescer, isto vira job assíncrono com download por link,
   * como o levantamento técnico prevê. A porta já está no lugar para isso.
   */
  async function responderPdf(
    req: FastifyRequest,
    resposta: FastifyReply,
    documento: "laudo" | "termo_de_interdicao",
    nome: string,
  ) {
    /*
      A ordem aqui conserta o defeito que o QA achou: interditar ao FALHAR.

      1. PREPARAR primeiro: autoriza, confere o dono, valida. Não muda estado.
         Um pedido de outro município morre aqui, em 404, num servidor com ou
         sem gerador, então a resposta não conta a quem sonda que o registro
         existe.
      2. Checar a CAPACIDADE do servidor. Sem gerador, 503 SEM ter interditado
         nada. Antes, o efeito colateral acontecia dentro de `responder()` e o
         imóvel ficava interditado com a data de uma tentativa que devolveu 503.
      3. EFETIVAR só quando o documento vai sair de verdade.

      O identificador do rodapé depende do instante da PRIMEIRA emissão, que
      aqui ainda não foi gravada. Então o PDF é gerado com a emissão que já
      existe (segunda via) ou com a que esta chamada vai gravar (`emitidoEm`
      dos dados, que `registrarEmissao` usa como `ocorrido_em`). Se, entre a
      leitura e a gravação, outra aba gravou a primeira emissão antes, o
      identificador impresso não seria o gravado: o PDF é refeito com o certo.
      Custa uma renderização a mais num caso que quase não acontece.
    */
    const preparado = await prepararDocumento(req, documento);
    const { quem, id, dados } = preparado;

    if (!pdf) {
      throw new RegraDeNegocio(
        "pdf_indisponivel",
        "Este servidor não tem gerador de PDF configurado. Use a versão para impressão.",
        503,
      );
    }

    const existente = await banco.comTenant(
      quem.organizacaoId, (c) => lerEmissao(c, id, documento, dados.vistoria.id),
    );
    const prevista: EmissaoRegistrada = existente ?? { emitidoEm: dados.emitidoEm };

    async function renderizar(emissao: EmissaoRegistrada): Promise<Uint8Array> {
      try {
        return await pdf!.gerar(gerar(documento, dados, emissao));
      } catch (erro) {
        // Navegador ausente ou que morreu no meio. O coordenador precisa do
        // laudo agora, e a versão para impressão continua servindo: dizer isso
        // vale mais do que um 500 sem saída. E não efetivamos: nada foi
        // interditado numa geração que falhou.
        req.log.error({ err: erro }, "falha ao renderizar PDF");
        throw new RegraDeNegocio(
          "pdf_indisponivel",
          "Não foi possível gerar o PDF agora. Use a versão para impressão.",
          503,
        );
      }
    }

    let bytes = await renderizar(prevista);

    // O PDF existe: agora sim registra a emissão e, se for termo, interdita.
    const emissao = await efetivarEmissao(preparado, documento, "pdf", enderecoDoCliente(req));
    if (emissao.emitidoEm.getTime() !== prevista.emitidoEm.getTime()) {
      bytes = await renderizar(emissao);
    }

    return resposta
      .type("application/pdf")
      // `inline` para abrir no visualizador em vez de baixar direto: quem
      // quer salvar salva, e quem só quer conferir não enche a pasta de
      // downloads.
      .header("content-disposition", `inline; filename="${nome}-${id.slice(0, 8)}.pdf"`)
      .send(Buffer.from(bytes));
  }

  app.get("/:id/laudo.pdf", ROTA_GET_COM_EFEITO, async (req, resposta) =>
    responderPdf(req, resposta, "laudo", "laudo-de-vistoria"));

  app.get("/:id/termo-de-interdicao.pdf", ROTA_GET_COM_EFEITO, async (req, resposta) =>
    responderPdf(req, resposta, "termo_de_interdicao", "termo-de-interdicao"));

  /**
   * Onde o identificador do rodapé se confere.
   *
   * O rodapé dizia "Código de validação", o código era `sha256(protocolo|
   * vistoria)` e não existia rota nenhuma que o recebesse: promessa de
   * conferência sem conferência. Agora o rodapé diz "Identificador da
   * emissão", e esta rota responde a que emissão ele corresponde: protocolo,
   * documento, vistoria, instante da primeira emissão e quem emitiu.
   *
   * O que ela NÃO faz: validar conteúdo. O laudo é gerado sob demanda e uma
   * foto anexada depois muda o papel sem mudar a emissão. Ela também não
   * devolve dado do cidadão: protocolo, tipo de documento e autor do ato, e
   * nada mais.
   *
   * Autenticada e sob RLS: identificador de outro município não existe daqui,
   * e responde o mesmo 404 de um identificador inventado. O identificador é
   * recalculado da linha gravada, então emissões anteriores a esta rota
   * conferem do mesmo jeito, e nada precisou ser guardado a mais. O custo é
   * uma varredura das emissões do município, que é o tamanho de um piloto por
   * muitos anos; se um dia doer, o passo seguinte é gravar o código no
   * `detalhe` e indexar.
   */
  app.get("/validar/:codigo", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    const codigo = codigoSchema.parse(req.params).codigo.toUpperCase();

    return banco.comTenant(quem.organizacaoId, async (c) => {
      const emissoes = await c.query<{
        ocorrencia_id: string; protocolo: string; ocorrido_em: string;
        autor_nome: string; autor_papel: string;
        detalhe: { documento: string; vistoriaId: string; formato: string };
      }>(
        `SELECT t.ocorrencia_id, o.protocolo, t.ocorrido_em, t.autor_nome, t.autor_papel,
                t.detalhe
           FROM trilha_eventos t
           JOIN ocorrencias o ON o.id = t.ocorrencia_id
          WHERE t.tipo = 'documento_emitido'`,
      );
      for (const e of emissoes.rows) {
        const emitidoEm = new Date(e.ocorrido_em);
        const calculado = codigoDeEmissao(
          e.detalhe.documento, e.protocolo, e.detalhe.vistoriaId, emitidoEm,
        );
        if (calculado !== codigo) continue;
        return {
          codigo,
          documento: e.detalhe.documento,
          protocolo: e.protocolo,
          ocorrenciaId: e.ocorrencia_id,
          vistoriaId: e.detalhe.vistoriaId,
          formato: e.detalhe.formato,
          emitidoEm: emitidoEm.toISOString(),
          emitidoPor: `${e.autor_nome} (${e.autor_papel})`,
        };
      }

      const oficios = await c.query<{
        id: string; numero: string; emitido_em: string; emitido_por_nome: string;
        ocorrencia_id: string; protocolo: string;
      }>(
        `SELECT f.id, f.numero, f.emitido_em, f.emitido_por_nome, f.ocorrencia_id, o.protocolo
           FROM oficios f JOIN ocorrencias o ON o.id = f.ocorrencia_id`,
      );
      for (const f of oficios.rows) {
        if (identificadorDoOficio(f) !== codigo) continue;
        return {
          codigo,
          documento: "oficio",
          numero: f.numero,
          protocolo: f.protocolo,
          ocorrenciaId: f.ocorrencia_id,
          oficioId: f.id,
          emitidoEm: new Date(f.emitido_em).toISOString(),
          emitidoPor: f.emitido_por_nome,
        };
      }

      throw new RegraDeNegocio(
        "nao_encontrado",
        "Nenhuma emissão deste município corresponde a esse identificador.",
        404,
      );
    });
  });
}
