import type { FastifyInstance } from "fastify";
import type { ArmazenamentoEmMemoria } from "../armazenamento/memoria.js";
import { TAMANHO_MAXIMO_BYTES, tipoAceito } from "../armazenamento/tipos.js";

/**
 * Recebe e serve os bytes quando o armazenamento é o da própria API.
 *
 * Existe só para desenvolvimento e teste, e a configuração recusa subir em
 * produção sem armazenamento externo. Mas as garantias são as mesmas do
 * provedor de verdade: a URL precisa estar assinada e dentro da validade, o
 * tipo precisa estar na lista, e o tamanho tem teto. Fosse um caminho aberto,
 * o teste passaria sem exercitar nada do que importa.
 */
export async function rotasArmazenamentoLocal(
  app: FastifyInstance,
  { armazenamento }: { armazenamento: ArmazenamentoEmMemoria },
): Promise<void> {
  // Foto de vistoria não cabe no limite de payload de negócio.
  app.addContentTypeParser(
    ["image/jpeg", "image/png", "image/webp", "image/heic", "application/octet-stream"],
    { parseAs: "buffer", bodyLimit: TAMANHO_MAXIMO_BYTES },
    (_req, corpo, feito) => { feito(null, corpo); },
  );

  app.put("/objeto", async (req, resposta) => {
    const consulta = req.query as Record<string, string | undefined>;
    const chave = consulta["chave"] ?? "";
    const conferencia = armazenamento.conferirAssinatura("PUT", chave, consulta);
    if (!conferencia.valida) {
      return resposta.code(403).send({ erro: "assinatura", mensagem: conferencia.motivo });
    }

    const tipo = String(req.headers["content-type"] ?? "");
    if (!tipoAceito(tipo)) {
      return resposta.code(415).send({ erro: "tipo_recusado", mensagem: "Tipo de arquivo não aceito." });
    }

    const corpo = req.body as Buffer;
    if (!Buffer.isBuffer(corpo) || corpo.length === 0) {
      return resposta.code(400).send({ erro: "corpo_vazio", mensagem: "Nenhum conteúdo recebido." });
    }

    armazenamento.guardar(chave, corpo, tipo);
    return resposta.code(200).send();
  });

  app.get("/objeto", async (req, resposta) => {
    const consulta = req.query as Record<string, string | undefined>;
    const chave = consulta["chave"] ?? "";
    const conferencia = armazenamento.conferirAssinatura("GET", chave, consulta);
    if (!conferencia.valida) {
      return resposta.code(403).send({ erro: "assinatura", mensagem: conferencia.motivo });
    }

    const objeto = armazenamento.ler(chave);
    if (!objeto) {
      return resposta.code(404).send({ erro: "nao_encontrado", mensagem: "Objeto não encontrado." });
    }

    return resposta
      .header("content-type", objeto.tipoConteudo)
      // Evidência não é conteúdo de cache compartilhado.
      .header("cache-control", "private, max-age=60")
      .send(objeto.corpo);
  });
}
