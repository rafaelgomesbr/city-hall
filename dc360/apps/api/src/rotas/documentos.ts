import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Banco } from "../banco/tipos.js";
import { RegraDeNegocio, autorizar } from "../servidor.js";
import type { Armazenamento } from "../armazenamento/tipos.js";
import { laudoDeVistoria, termoDeInterdicao, type DadosDocumento } from "../documentos/laudo.js";
import type { GeradorDePdf } from "../documentos/pdf.js";
import { registrarEmissao } from "../trilha.js";

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

type LinhaOcorrencia = DadosDocumento["ocorrencia"] & { organizacao_id: string };

async function reunirDados(
  banco: Banco,
  armazenamento: Armazenamento,
  organizacaoId: string,
  ocorrenciaId: string,
  emitidoPor: string,
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

    const vistoria = await c.query<
      DadosDocumento["vistoria"] & { assinatura_chave: string | null }
    >(
      `SELECT v.id, v.checklist, v.gps_precisao_metros, v.assinante_nome, v.observacoes,
              v.coletada_em, v.sincronizada_em, v.assinatura_chave,
              u.nome AS agente_nome, u.matricula AS agente_matricula
         FROM vistorias v LEFT JOIN usuarios u ON u.id = v.agente_id
        WHERE v.ocorrencia_id = $1
        ORDER BY v.coletada_em DESC LIMIT 1`,
      [ocorrenciaId],
    );
    if (!vistoria.rows[0]) {
      throw new RegraDeNegocio(
        "sem_vistoria",
        "Esta ocorrência ainda não tem vistoria concluída, então não há o que documentar.",
        409,
      );
    }

    const fotos = await c.query<{ chave_storage: string; legenda: string | null; capturada_em: string }>(
      `SELECT chave_storage, legenda, capturada_em FROM evidencias
        WHERE ocorrencia_id = $1 AND enviada_em IS NOT NULL
        ORDER BY ordem, capturada_em`,
      [ocorrenciaId],
    );

    return {
      organizacao: organizacao.rows[0]!,
      ocorrencia: ocorrencia.rows[0],
      vistoria: vistoria.rows[0],
      fotos: fotos.rows,
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

  async function responder(
    req: FastifyRequest,
    documento: "laudo" | "termo_de_interdicao",
    formato: "html" | "pdf",
  ): Promise<string> {
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
    const dados = await reunirDados(
      banco, armazenamento, quem.organizacaoId, id,
      `${quem.nome} (${quem.papel})`,
    );

    if (documento === "termo_de_interdicao") exigirInterdicaoIndicada(dados);

    /*
      O rastro é gravado ANTES de devolver o documento, e numa transação sua.
      Antes, porque o que interessa registrar é que alguém obteve o papel; se a
      geração falhar depois disso, sobra um evento a mais, que é o erro barato.
      O contrário deixaria termos circulando sem registro, que é o erro caro.
    */
    await banco.comTenant(quem.organizacaoId, (c) =>
      registrarEmissao(c, quem, id, documento, dados.vistoria.id, formato));

    const gerar = documento === "laudo" ? laudoDeVistoria : termoDeInterdicao;
    return gerar({ ...dados, ...(marcaDagua ? { marcaDagua } : {}) });
  }

  app.get("/:id/laudo", async (req, resposta) => {
    const html = await responder(req, "laudo", "html");
    return resposta.type("text/html; charset=utf-8").send(html);
  });

  app.get("/:id/termo-de-interdicao", async (req, resposta) => {
    const html = await responder(req, "termo_de_interdicao", "html");
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
      A permissão e o dono da ocorrência são checados ANTES da capacidade do
      servidor. Ao contrário, um pedido de outro município receberia 503 num
      servidor sem gerador e 404 num servidor com gerador, e a diferença entre
      as duas respostas contaria a quem sonda que o registro existe.
    */
    const html = await responder(req, documento, "pdf");

    if (!pdf) {
      throw new RegraDeNegocio(
        "pdf_indisponivel",
        "Este servidor não tem gerador de PDF configurado. Use a versão para impressão.",
        503,
      );
    }
    let bytes: Uint8Array;
    try {
      bytes = await pdf.gerar(html);
    } catch (erro) {
      // Navegador ausente ou que morreu no meio. O coordenador precisa do
      // laudo agora, e a versão para impressão continua servindo: dizer isso
      // vale mais do que um 500 sem saída.
      req.log.error({ err: erro }, "falha ao renderizar PDF");
      throw new RegraDeNegocio(
        "pdf_indisponivel",
        "Não foi possível gerar o PDF agora. Use a versão para impressão.",
        503,
      );
    }
    const { id } = idSchema.parse(req.params);
    return resposta
      .type("application/pdf")
      // `inline` para abrir no visualizador em vez de baixar direto: quem
      // quer salvar salva, e quem só quer conferir não enche a pasta de
      // downloads.
      .header("content-disposition", `inline; filename="${nome}-${id.slice(0, 8)}.pdf"`)
      .send(Buffer.from(bytes));
  }

  app.get("/:id/laudo.pdf", async (req, resposta) =>
    responderPdf(req, resposta, "laudo", "laudo-de-vistoria"));

  app.get("/:id/termo-de-interdicao.pdf", async (req, resposta) =>
    responderPdf(req, resposta, "termo_de_interdicao", "termo-de-interdicao"));
}
