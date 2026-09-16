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

    /*
      ESCRITA ÚNICA, como o provedor de verdade faz com `if-none-match: *`
      assinado (ver `armazenamento/s3.ts`). Sem isto, o teste que prova que a
      prova confirmada não se troca passaria aqui e falharia contra o R2, ou o
      contrário, que é o pior tipo de diferença entre as duas implementações
      desta porta. 412 é o status do provedor para a mesma recusa.

      Incondicional, e não "só se o cabeçalho vier": no S3 o cabeçalho é
      obrigatório porque está assinado, então a única forma de o aparelho
      chegar sem ele é adulterar a URL, que lá responde 403. Aqui, exigir o
      cabeçalho abriria a sobrescrita para quem o omitisse.
    */
    if (armazenamento.ler(chave)) {
      return resposta.code(412).send({
        erro: "objeto_ja_existe",
        mensagem: "Já existe um arquivo nesta chave, e ele não pode ser sobrescrito.",
      });
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
      /*
        A política padrão do helmet é `same-site`, e ela bloqueia a imagem
        quando o painel está numa origem e a API noutra, que é exatamente o
        arranjo de produção (painel do município, API do fornecedor). Aqui a
        proteção do arquivo é a URL assinada de vida curta, não a política de
        origem: sem a assinatura correta esta rota devolve 403 antes de chegar
        neste ponto. Vale só para a entrega do objeto, e não para a API.
      */
      .header("cross-origin-resource-policy", "cross-origin")
      .send(objeto.corpo);
  });
}
