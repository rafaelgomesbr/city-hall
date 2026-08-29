import type { FastifyInstance } from "fastify";
import { chaveDeStorage, envelopeSincronizacaoSchema } from "@dc360/shared";
import type { Banco } from "../banco/tipos.js";
import { RegraDeNegocio, autorizar } from "../servidor.js";

/**
 * Recepção da coleta feita em campo.
 *
 * Esta é a rota que decide se o produto funciona no mundo real. O agente
 * coleta sem sinal, o aparelho guarda na fila, e o envio acontece quando a
 * rede volta, muitas vezes já dentro do carro, com a conexão indo e vindo. A
 * consequência prática é que a MESMA coleta chega mais de uma vez, e um laudo
 * duplicado numa vistoria de interdição é problema jurídico, não estético.
 *
 * A defesa é a chave de idempotência gerada no aparelho, com unicidade por
 * município garantida no banco. Reenvio não vira registro novo: a API
 * reconhece a chave e devolve o resultado da primeira vez, com 200 em vez de
 * 201. O aparelho não precisa saber se foi o primeiro envio ou o quinto.
 */
export async function rotasSincronizacao(
  app: FastifyInstance,
  { banco }: { banco: Banco },
): Promise<void> {
  app.post("/vistoria", async (req, resposta) => {
    const quem = await autorizar(app, req, "registrar_vistoria");
    const envelope = envelopeSincronizacaoSchema.parse(req.body);

    const { vistoriaId, jaExistia } = await banco.comTenant(quem.organizacaoId, async (c) => {
      // Chave já vista: devolve o que foi gravado antes e não toca em nada.
      const anterior = await c.query<{ id: string }>(
        "SELECT id FROM vistorias WHERE idempotency_key = $1",
        [envelope.idempotencyKey],
      );
      if (anterior.rows[0]) {
        return { vistoriaId: anterior.rows[0].id, jaExistia: true };
      }

      const ocorrencia = await c.query<{ id: string; status: string }>(
        "SELECT id, status FROM ocorrencias WHERE id = $1",
        [envelope.ocorrenciaId],
      );
      const alvo = ocorrencia.rows[0];
      if (!alvo) {
        throw new RegraDeNegocio("nao_encontrada", "Ocorrência não encontrada.", 404);
      }
      if (alvo.status === "encerrada") {
        throw new RegraDeNegocio(
          "ja_encerrada",
          "Essa ocorrência já foi encerrada e não aceita vistoria nova.",
        );
      }

      const v = envelope.vistoria;

      /**
       * A chave da assinatura nunca é aceita como veio.
       *
       * Este campo é o único do envelope que ia cru para o banco. A foto, no
       * mesmo envelope, já conferia o prefixo do município logo abaixo; a
       * assinatura não conferia nada, e a coluna era `text` puro. Enquanto o
       * traço era gravado e nunca lido, o campo era inerte. No dia em que o
       * laudo passou a exibi-lo, virou um caminho de leitura: bastava apontar
       * para um objeto de outra prefeitura e o documento saía com uma URL
       * assinada dela.
       *
       * A regra aqui é a mesma da foto, e mais estrita porque não existe
       * fluxo de envio antecipado de assinatura: o servidor remonta a chave a
       * partir do token e do nome do arquivo, sempre. O que o cliente escolhe
       * é, no máximo, o nome.
       */
      const assinaturaChave = v.assinaturaChave
        ? chaveDeStorage(
            quem.organizacaoId,
            envelope.ocorrenciaId,
            v.assinaturaChave.split("/").pop() ?? "assinatura.png",
          )
        : null;

      const inserida = await c.query<{ id: string }>(
        `INSERT INTO vistorias
           (organizacao_id, ocorrencia_id, agente_id, checklist, gps_precisao_metros,
            assinante_nome, assinatura_chave, observacoes, coletada_em, idempotency_key,
            desalojados, desabrigados, feridos, desaparecidos, obitos)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING id`,
        [
          quem.organizacaoId, envelope.ocorrenciaId, quem.usuarioId,
          JSON.stringify(v.checklist), v.gpsPrecisaoMetros,
          v.assinanteNome, assinaturaChave, v.observacoes ?? null,
          v.coletadaEm, envelope.idempotencyKey,
          /*
            `?? null` e não `?? 0`. Ausente significa NÃO CONTADO, e é uma
            afirmação diferente de "contei e deu zero". Zero por omissão faria
            toda coleta de aplicativo antigo declarar que ninguém saiu de casa.
          */
          v.desalojados ?? null, v.desabrigados ?? null, v.feridos ?? null,
          v.desaparecidos ?? null, v.obitos ?? null,
        ],
      );
      const novaId = inserida.rows[0]!.id;

      for (const [ordem, foto] of v.fotos.entries()) {
        /**
         * A foto pode ter subido antes, pelo fluxo de evidência: nesse caso a
         * linha já existe no banco, com `enviada_em` preenchido, e o que falta
         * é amarrá-la a esta vistoria.
         *
         * A chave só é aceita como veio se ela pertencer a ESTA organização e
         * a ESTA ocorrência. Qualquer outra coisa é remontada a partir do
         * nome, porque aceitar chave escolhida pelo cliente permitiria gravar
         * sob o prefixo de outra prefeitura.
         */
        const prefixoEsperado = `tenant/${quem.organizacaoId}/ocorrencias/${envelope.ocorrenciaId}/`;
        const jaEnviada = foto.chave.startsWith(prefixoEsperado);

        if (jaEnviada) {
          const vinculada = await c.query<{ id: string }>(
            `UPDATE evidencias SET vistoria_id = $1, ordem = $2, legenda = COALESCE($3, legenda)
              WHERE ocorrencia_id = $4 AND chave_storage = $5
              RETURNING id`,
            [novaId, ordem, foto.legenda ?? null, envelope.ocorrenciaId, foto.chave],
          );
          if (vinculada.rows[0]) continue;
          // Chave com o prefixo certo mas sem linha correspondente: o aparelho
          // inventou. Cai no caminho de baixo, que remonta uma chave nova.
        }

        const chave = chaveDeStorage(
          quem.organizacaoId,
          envelope.ocorrenciaId,
          foto.chave.split("/").pop() ?? `foto-${ordem + 1}.jpg`,
        );
        await c.query(
          `INSERT INTO evidencias
             (organizacao_id, ocorrencia_id, vistoria_id, chave_storage, legenda,
              latitude, longitude, capturada_em, ordem)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (organizacao_id, chave_storage) DO NOTHING`,
          [
            quem.organizacaoId, envelope.ocorrenciaId, novaId, chave, foto.legenda ?? null,
            foto.coordenada?.lat ?? null, foto.coordenada?.lng ?? null,
            foto.capturadaEm, ordem,
          ],
        );
      }

      if (alvo.status === "em_campo") {
        await c.query(
          "UPDATE ocorrencias SET status = 'vistoria_concluida' WHERE id = $1",
          [envelope.ocorrenciaId],
        );
      }

      /**
       * Duas marcas de tempo no evento, de propósito: `ocorrido_em` é a hora
       * da coleta no aparelho, `registrado_em` é o padrão do banco, a hora em
       * que o servidor recebeu. As duas diferem em toda coleta offline, e o
       * laudo precisa poder mostrar as duas para não parecer que a vistoria
       * foi feita na hora em que o sinal voltou.
       */
      await c.query(
        `INSERT INTO trilha_eventos
           (organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel,
            origem, ocorrido_em, detalhe)
         VALUES ($1,$2,'vistoria',$3,$4,$5,'campo',$6,$7)`,
        [
          quem.organizacaoId, envelope.ocorrenciaId, quem.usuarioId, quem.nome, quem.papel,
          v.coletadaEm,
          JSON.stringify({
            fotos: v.fotos.length,
            gpsPrecisaoMetros: v.gpsPrecisaoMetros,
            assinante: v.assinanteNome,
          }),
        ],
      );

      return { vistoriaId: novaId, jaExistia: false };
    });

    return resposta.code(jaExistia ? 200 : 201).send({
      vistoriaId,
      duplicada: jaExistia,
    });
  });

  /**
   * O que o aparelho precisa baixar para trabalhar sem sinal: as ocorrências
   * despachadas para as equipes do agente.
   */
  app.get("/pendencias", async (req) => {
    const quem = await autorizar(app, req, "registrar_vistoria");
    return banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query(
        `SELECT o.id, o.protocolo, o.tipo, o.severidade, o.endereco,
                o.ponto_referencia, o.latitude, o.longitude,
                o.descricao, o.solicitante_nome, o.solicitante_contato,
                o.vulnerabilidade_presente, o.vulnerabilidade_descricao,
                o.prazo_em, o.criado_em
           FROM ocorrencias o
           JOIN usuarios u ON u.equipe_id = o.equipe_id
          WHERE u.id = $1 AND o.status = 'em_campo'
          ORDER BY o.prazo_em NULLS LAST`,
        [quem.usuarioId],
      );
      return { itens: r.rows };
    });
  });
}
