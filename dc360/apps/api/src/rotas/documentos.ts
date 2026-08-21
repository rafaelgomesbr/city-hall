import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Banco } from "../banco/tipos.js";
import { RegraDeNegocio } from "../servidor.js";
import type { Armazenamento } from "../armazenamento/tipos.js";
import { laudoDeVistoria, termoDeInterdicao, type DadosDocumento } from "../documentos/laudo.js";

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

    const vistoria = await c.query<DadosDocumento["vistoria"]>(
      `SELECT v.id, v.checklist, v.gps_precisao_metros, v.assinante_nome, v.observacoes,
              v.coletada_em, v.sincronizada_em,
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

  return {
    organizacao: bruto.organizacao,
    ocorrencia: bruto.ocorrencia,
    vistoria: bruto.vistoria,
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

export async function rotasDocumentos(
  app: FastifyInstance,
  { banco, armazenamento, marcaDagua }:
    { banco: Banco; armazenamento: Armazenamento; marcaDagua?: string },
): Promise<void> {
  async function responder(
    req: FastifyRequest,
    gerar: (d: DadosDocumento) => string,
  ): Promise<string> {
    const quem = await app.exigirAutenticacao(req);
    const { id } = idSchema.parse(req.params);
    const dados = await reunirDados(
      banco, armazenamento, quem.organizacaoId, id,
      `${quem.nome} (${quem.papel})`,
    );
    return gerar({ ...dados, ...(marcaDagua ? { marcaDagua } : {}) });
  }

  app.get("/:id/laudo", async (req, resposta) => {
    const html = await responder(req, laudoDeVistoria);
    return resposta.type("text/html; charset=utf-8").send(html);
  });

  app.get("/:id/termo-de-interdicao", async (req, resposta) => {
    const html = await responder(req, termoDeInterdicao);
    return resposta.type("text/html; charset=utf-8").send(html);
  });
}
