import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { chaveDeStorage } from "@dc360/shared";
import type { Banco } from "../banco/tipos.js";
import { RegraDeNegocio, autorizar } from "../servidor.js";
import {
  TAMANHO_MAXIMO_BYTES, TIPOS_ACEITOS, type Armazenamento,
} from "../armazenamento/tipos.js";

/**
 * Ciclo de vida de uma evidência fotográfica.
 *
 *   1. O aparelho pede autorização para enviar, dizendo tipo e tamanho.
 *   2. O servidor confere permissão e dono da ocorrência, DECIDE a chave e
 *      devolve uma URL pré-assinada de vida curta.
 *   3. O aparelho envia os bytes direto para o armazenamento.
 *   4. O aparelho confirma; o servidor verifica que o objeto existe e com que
 *      tamanho, e só então marca a evidência como enviada.
 *
 * O passo 4 não é burocracia. Sem ele, um metadado fica no banco apontando
 * para arquivo que nunca chegou, e a falta só aparece meses depois, quando
 * alguém abre o laudo numa audiência.
 */

const pedidoSchema = z.object({
  ocorrenciaId: z.string().uuid(),
  /**
   * Gerada no aparelho no momento da captura. Pedir autorização duas vezes
   * para a mesma foto é o caso comum, não a exceção: o sinal cai entre
   * autorizar e enviar, a URL vence esperando a rede, o aplicativo é fechado
   * no meio. Sem a chave, cada tentativa deixaria uma linha órfã.
   */
  idempotencyKey: z.string().uuid().optional(),
  nomeArquivo: z.string().min(1).max(200),
  tipoConteudo: z.enum(TIPOS_ACEITOS),
  tamanhoBytes: z.number().int().positive().max(TAMANHO_MAXIMO_BYTES),
  legenda: z.string().max(300).optional(),
  capturadaEm: z.string().datetime(),
  coordenada: z.object({ lat: z.number(), lng: z.number() }).optional(),
  ordem: z.number().int().min(0).max(200).default(0),
});

const confirmacaoSchema = z.object({
  evidenciaId: z.string().uuid(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, "Informe o sha256 em hexadecimal").optional(),
});

export async function rotasEvidencias(
  app: FastifyInstance,
  { banco, armazenamento }: { banco: Banco; armazenamento: Armazenamento },
): Promise<void> {
  /**
   * Autoriza um envio.
   *
   * A chave é montada AQUI, a partir da organização do token. Aceitar a chave
   * que o cliente propõe permitiria gravar sob o prefixo de outra prefeitura,
   * ou sobrescrever a evidência de outra ocorrência. O nome do arquivo entra
   * só como sufixo, e higienizado.
   */
  app.post("/autorizar-envio", async (req, resposta) => {
    const quem = await autorizar(app, req, "registrar_vistoria");
    const dados = pedidoSchema.parse(req.body);

    const resultado = await banco.comTenant(quem.organizacaoId, async (c) => {
      // Já autorizada antes: devolve a MESMA linha, com URL nova. Uma URL
      // pré-assinada vence em minutos, então reemitir é esperado; criar outra
      // evidência não é.
      if (dados.idempotencyKey) {
        const anterior = await c.query<{ id: string; chave_storage: string; enviada_em: string | null }>(
          "SELECT id, chave_storage, enviada_em FROM evidencias WHERE idempotency_key = $1",
          [dados.idempotencyKey],
        );
        const achada = anterior.rows[0];
        if (achada) {
          return {
            evidenciaId: achada.id,
            chave: achada.chave_storage,
            jaEnviada: achada.enviada_em !== null,
          };
        }
      }

      // Sob RLS: ocorrência de outro município simplesmente não existe daqui.
      const ocorrencia = await c.query<{ id: string; status: string }>(
        "SELECT id, status FROM ocorrencias WHERE id = $1",
        [dados.ocorrenciaId],
      );
      const alvo = ocorrencia.rows[0];
      if (!alvo) {
        throw new RegraDeNegocio("nao_encontrada", "Ocorrência não encontrada.", 404);
      }
      if (alvo.status === "encerrada") {
        throw new RegraDeNegocio(
          "ja_encerrada",
          "Essa ocorrência já foi encerrada e não aceita evidência nova.",
        );
      }

      // Sufixo único: duas fotos com o mesmo nome no mesmo aparelho não podem
      // sobrescrever uma à outra, e `IMG_0001.jpg` se repete o tempo todo.
      const unico = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
      const nome = `${unico}-${dados.nomeArquivo}`;
      const chave = chaveDeStorage(quem.organizacaoId, dados.ocorrenciaId, nome);

      const evidencia = await c.query<{ id: string }>(
        `INSERT INTO evidencias
           (organizacao_id, ocorrencia_id, chave_storage, legenda, latitude, longitude,
            capturada_em, ordem, tipo_conteudo, tamanho_bytes, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [
          quem.organizacaoId, dados.ocorrenciaId, chave, dados.legenda ?? null,
          dados.coordenada?.lat ?? null, dados.coordenada?.lng ?? null,
          dados.capturadaEm, dados.ordem, dados.tipoConteudo, dados.tamanhoBytes,
          dados.idempotencyKey ?? null,
        ],
      );

      return { evidenciaId: evidencia.rows[0]!.id, chave, jaEnviada: false };
    });

    const envio = await armazenamento.urlParaEnviar({
      chave: resultado.chave,
      tipoConteudo: dados.tipoConteudo,
      tamanhoBytes: dados.tamanhoBytes,
    });

    return resposta.code(201).send({
      evidenciaId: resultado.evidenciaId,
      chave: resultado.chave,
      // Quando o arquivo já subiu, o aparelho pode pular direto para a
      // sincronização em vez de mandar os bytes de novo.
      jaEnviada: resultado.jaEnviada,
      url: envio.url,
      cabecalhos: envio.cabecalhos,
      expiraEm: envio.expiraEm,
    });
  });

  /**
   * Confirma que o arquivo chegou.
   *
   * O servidor não acredita no cliente: ele pergunta ao armazenamento se o
   * objeto existe e com que tamanho. Se o tamanho não bater com o que foi
   * autorizado, a confirmação é recusada.
   */
  app.post("/confirmar-envio", async (req) => {
    const quem = await autorizar(app, req, "registrar_vistoria");
    const dados = confirmacaoSchema.parse(req.body);

    const evidencia = await banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query<{
        id: string; chave_storage: string; tamanho_bytes: string; enviada_em: string | null;
      }>(
        "SELECT id, chave_storage, tamanho_bytes, enviada_em FROM evidencias WHERE id = $1",
        [dados.evidenciaId],
      );
      const achada = r.rows[0];
      if (!achada) throw new RegraDeNegocio("nao_encontrada", "Evidência não encontrada.", 404);
      return achada;
    });

    // Reconfirmar é inofensivo e acontece: o aparelho pode ter perdido a
    // resposta da primeira confirmação.
    if (evidencia.enviada_em) {
      return { evidenciaId: evidencia.id, confirmada: true, jaEstava: true };
    }

    const objeto = await armazenamento.descrever(evidencia.chave_storage);
    if (!objeto.existe) {
      throw new RegraDeNegocio(
        "arquivo_ausente",
        "O arquivo não chegou ao armazenamento. Tente enviar de novo.",
        409,
      );
    }

    const esperado = Number(evidencia.tamanho_bytes);
    if (objeto.tamanhoBytes !== null && objeto.tamanhoBytes !== esperado) {
      throw new RegraDeNegocio(
        "tamanho_divergente",
        "O arquivo enviado não corresponde ao que foi autorizado.",
        409,
      );
    }

    await banco.comTenant(quem.organizacaoId, async (c) => {
      await c.query(
        "UPDATE evidencias SET enviada_em = now(), sha256 = COALESCE($2, sha256) WHERE id = $1",
        [dados.evidenciaId, dados.sha256 ?? null],
      );
    });

    return { evidenciaId: evidencia.id, confirmada: true, jaEstava: false };
  });

  /**
   * Devolve uma URL de leitura, curta, só depois de conferir a permissão.
   *
   * Nunca existe URL pública: foto de vistoria mostra a casa e a rua de uma
   * família em situação de risco. Quem não tem acesso à ocorrência não recebe
   * link, e quem tem recebe um que vence em minutos.
   */
  app.get("/:id/url", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

    const evidencia = await banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query<{ chave_storage: string; enviada_em: string | null }>(
        "SELECT chave_storage, enviada_em FROM evidencias WHERE id = $1",
        [id],
      );
      return r.rows[0] ?? null;
    });

    if (!evidencia) {
      throw new RegraDeNegocio("nao_encontrada", "Evidência não encontrada.", 404);
    }
    if (!evidencia.enviada_em) {
      throw new RegraDeNegocio(
        "envio_pendente",
        "Essa foto ainda não terminou de subir.",
        409,
      );
    }

    return { url: await armazenamento.urlParaLer(evidencia.chave_storage) };
  });

  /** As evidências já enviadas de uma ocorrência, com URL de leitura em cada. */
  app.get("/ocorrencia/:id", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

    const linhas = await banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query<{
        id: string; chave_storage: string; legenda: string | null;
        capturada_em: string; ordem: number; tipo_conteudo: string; tamanho_bytes: string;
      }>(
        `SELECT id, chave_storage, legenda, capturada_em, ordem, tipo_conteudo, tamanho_bytes
           FROM evidencias
          WHERE ocorrencia_id = $1 AND enviada_em IS NOT NULL
          ORDER BY ordem, capturada_em`,
        [id],
      );
      return r.rows;
    });

    return {
      itens: await Promise.all(
        linhas.map(async (l) => ({
          id: l.id,
          legenda: l.legenda,
          capturadaEm: l.capturada_em,
          ordem: l.ordem,
          tipoConteudo: l.tipo_conteudo,
          tamanhoBytes: Number(l.tamanho_bytes),
          url: await armazenamento.urlParaLer(l.chave_storage),
        })),
      ),
    };
  });
}
