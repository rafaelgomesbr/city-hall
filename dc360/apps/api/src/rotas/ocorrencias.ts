import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  PRAZO_PADRAO_HORAS,
  SEVERIDADES,
  STATUS_OCORRENCIA,
  aberturaOcorrenciaSchema,
  despachoSchema,
  desinterdicaoSchema, encerramentoSchema,
  estadoTerminal,
  providenciaSchema,
  respostaProvidenciaSchema,
  transicaoPermitida,
  triagemSchema,
  type StatusOcorrencia,
} from "@dc360/shared";
import type { Banco, Consulta } from "../banco/tipos.js";
import { RegraDeNegocio, autorizar } from "../servidor.js";
import { registrarEvento } from "../trilha.js";

const idSchema = z.object({ id: z.string().uuid("Identificador inválido") });

const consultaSchema = z.object({
  busca: z.string().max(200).optional(),
  status: z.enum([...STATUS_OCORRENCIA, "todas", "ativas"]).default("ativas"),
  severidade: z.enum([...SEVERIDADES, "todas"]).default("todas"),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Lê o status atual e recusa transição que a máquina de estados não permite.
 *
 * A ocorrência é lida DENTRO da transação, com o RLS já aplicado: se o
 * identificador for de outro município, nenhuma linha volta, e a resposta é a
 * mesma que para um identificador inexistente. Não existe forma de descobrir
 * que um protocolo existe em outra prefeitura.
 */
async function exigirTransicao(
  c: Consulta,
  id: string,
  para: StatusOcorrencia,
): Promise<StatusOcorrencia> {
  const r = await c.query<{ status: StatusOcorrencia }>(
    "SELECT status FROM ocorrencias WHERE id = $1",
    [id],
  );
  const de = r.rows[0]?.status;
  if (!de) throw new RegraDeNegocio("nao_encontrada", "Ocorrência não encontrada.", 404);
  if (de === para) {
    /*
      Repetir um passo é diferente de repetir um desfecho.

      Reclassificar quem já está em triagem é rotina, e o evento novo diz uma
      verdade: a severidade mudou. Já encerrar quem já está encerrado é clique
      duplicado, e antes disto a rota seguia adiante e gravava um SEGUNDO
      evento de encerramento numa trilha append-only, que por definição não se
      corrige. O `disabled` no botão ajuda; ele não é controle, porque o
      segundo clique pode vir de outra aba, de um F5 ou de uma conexão lenta.
    */
    if (estadoTerminal(de)) {
      throw new RegraDeNegocio(
        "ja_no_estado_final",
        "Essa ocorrência já está encerrada. Nada foi alterado.",
        409,
      );
    }
    return de;
  }
  if (!transicaoPermitida(de, para)) {
    throw new RegraDeNegocio(
      "transicao_invalida",
      `Não é possível ir de "${de}" para "${para}".`,
    );
  }
  return de;
}

export async function rotasOcorrencias(
  app: FastifyInstance,
  { banco }: { banco: Banco },
): Promise<void> {
  app.get("/", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    const f = consultaSchema.parse(req.query);

    return banco.comTenant(quem.organizacaoId, async (c) => {
      const condicoes: string[] = [];
      const params: unknown[] = [];

      if (f.busca?.trim()) {
        params.push(`%${f.busca.trim().toLowerCase()}%`);
        const p = `$${params.length}`;
        condicoes.push(
          `(lower(o.protocolo) LIKE ${p} OR lower(o.endereco) LIKE ${p}
            OR lower(o.solicitante_nome) LIKE ${p} OR lower(o.descricao) LIKE ${p})`,
        );
      }
      if (f.status === "ativas") {
        condicoes.push("o.status NOT IN ('encerrada','rascunho')");
      } else if (f.status !== "todas") {
        params.push(f.status);
        condicoes.push(`o.status = $${params.length}`);
      }
      if (f.severidade !== "todas") {
        params.push(f.severidade);
        condicoes.push(`o.severidade = $${params.length}`);
      }

      const onde = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";

      const total = await c.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM ocorrencias o ${onde}`,
        params,
      );

      params.push(f.porPagina, (f.pagina - 1) * f.porPagina);
      const itens = await c.query(
        `SELECT o.*, e.nome AS equipe_nome
           FROM ocorrencias o
           LEFT JOIN equipes e ON e.id = o.equipe_id
           ${onde}
          ORDER BY
            CASE WHEN o.status IN ('encerrada','rascunho') THEN 1 ELSE 0 END,
            CASE o.severidade WHEN 'critica' THEN 0 WHEN 'alta' THEN 1
                              WHEN 'media' THEN 2 WHEN 'baixa' THEN 3 ELSE 4 END,
            o.criado_em DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      return {
        itens: itens.rows,
        total: Number(total.rows[0]!.total),
        pagina: f.pagina,
        porPagina: f.porPagina,
      };
    });
  });

  app.get("/:id", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    const { id } = idSchema.parse(req.params);

    return banco.comTenant(quem.organizacaoId, async (c) => {
      const ocorrencia = await c.query(
        `SELECT o.*, e.nome AS equipe_nome
           FROM ocorrencias o LEFT JOIN equipes e ON e.id = o.equipe_id
          WHERE o.id = $1`,
        [id],
      );
      if (!ocorrencia.rows[0]) {
        throw new RegraDeNegocio("nao_encontrada", "Ocorrência não encontrada.", 404);
      }

      const [trilha, vistoria, providencias, vinculada, vinculadas] = await Promise.all([
        c.query(
          `SELECT id, tipo, autor_nome, autor_papel, origem, ocorrido_em, registrado_em, detalhe
             FROM trilha_eventos WHERE ocorrencia_id = $1 ORDER BY ocorrido_em`,
          [id],
        ),
        c.query(
          `SELECT v.*, u.nome AS agente_nome FROM vistorias v
             LEFT JOIN usuarios u ON u.id = v.agente_id
                        WHERE v.ocorrencia_id = $1
            ORDER BY v.sincronizada_em DESC, v.coletada_em DESC LIMIT 1`,
          [id],
        ),
        c.query(
          `SELECT * FROM providencias WHERE ocorrencia_id = $1 ORDER BY encaminhada_em DESC`,
          [id],
        ),
        /*
          O vínculo de duplicidade era capturado na abertura e nunca mostrado.
          Isso deixava a deteção de duplicidade pela metade: o operador
          escolhia vincular, e ninguém mais via a decisão. Nas duas direções,
          porque a pergunta "este chamado é o mesmo daquele?" aparece dos dois
          lados.
        */
        c.query(
          `SELECT o.id, o.protocolo, o.status, o.endereco, o.criado_em
             FROM ocorrencias o
             JOIN ocorrencias filha ON filha.vinculada_a = o.id
            WHERE filha.id = $1`,
          [id],
        ),
        c.query(
          `SELECT id, protocolo, status, endereco, criado_em
             FROM ocorrencias WHERE vinculada_a = $1 ORDER BY criado_em`,
          [id],
        ),
      ]);

      return {
        ocorrencia: ocorrencia.rows[0],
        trilha: trilha.rows,
        vistoria: vistoria.rows[0] ?? null,
        providencias: providencias.rows,
        /** A ocorrência da qual esta é continuação, se houver. */
        vinculadaA: vinculada.rows[0] ?? null,
        /** As que foram registradas depois e apontam para esta. */
        vinculadas: vinculadas.rows,
      };
    });
  });

  app.post("/", async (req, resposta) => {
    const quem = await autorizar(app, req, "abrir_ocorrencia");
    const dados = aberturaOcorrenciaSchema.parse(req.body);

    const criada = await banco.comTenant(quem.organizacaoId, async (c) => {
      // O protocolo sai do banco, dentro da transação, com a linha da
      // sequência travada. Gerar na aplicação abriria corrida entre dois
      // operadores registrando ao mesmo tempo.
      const p = await c.query<{ proximo: string }>(
        "SELECT proximo_protocolo($1) AS proximo",
        [new Date().getFullYear()],
      );
      const protocolo = p.rows[0]!.proximo;

      const r = await c.query<{ id: string; protocolo: string }>(
        `INSERT INTO ocorrencias
           (organizacao_id, protocolo, tipo, status, endereco, ponto_referencia,
            latitude, longitude,
            solicitante_nome, solicitante_contato, canal_entrada, descricao, vinculada_a)
         VALUES ($1,$2,$3,'registrada',$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id, protocolo`,
        [
          quem.organizacaoId, protocolo, dados.tipo, dados.endereco,
          dados.pontoReferencia?.trim() || null,
          dados.coordenada?.lat ?? null, dados.coordenada?.lng ?? null,
          dados.solicitanteNome, dados.solicitanteContato ?? null,
          dados.canalEntrada, dados.descricao, dados.vinculadaA ?? null,
        ],
      );
      const nova = r.rows[0]!;
      await registrarEvento(c, quem, nova.id, "registro", {
        protocolo: nova.protocolo,
        canal: dados.canalEntrada,
        vinculadaA: dados.vinculadaA ?? null,
      });
      return nova;
    });

    return resposta.code(201).send(criada);
  });

  /** Possíveis duplicidades: mesmo tipo, ativa, nas últimas 48 horas. */
  app.get("/duplicidades/consulta", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    const q = z.object({
      tipo: z.string().min(1),
      endereco: z.string().min(1).max(400),
    }).parse(req.query);

    const termo = q.endereco.split(",")[0]?.trim().toLowerCase() ?? "";
    if (termo.length < 4) return { itens: [] };

    return banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query(
        `SELECT id, protocolo, endereco, criado_em, status FROM ocorrencias
          WHERE tipo = $1 AND status NOT IN ('encerrada','rascunho')
            AND criado_em > now() - interval '48 hours'
            AND lower(endereco) LIKE $2
          ORDER BY criado_em DESC LIMIT 10`,
        [q.tipo, `%${termo}%`],
      );
      return { itens: r.rows };
    });
  });

  app.post("/:id/triagem", async (req) => {
    const quem = await autorizar(app, req, "classificar_triagem");
    const { id } = idSchema.parse(req.params);
    const t = triagemSchema.parse(req.body);

    await banco.comTenant(quem.organizacaoId, async (c) => {
      await exigirTransicao(c, id, "triagem");
      await c.query(
        `UPDATE ocorrencias
            SET status = 'triagem', severidade = $2,
                vulnerabilidade_presente = $3, vulnerabilidade_descricao = $4,
                prazo_em = criado_em + ($5 || ' hours')::interval
          WHERE id = $1`,
        [id, t.severidade, t.vulnerabilidadePresente,
         t.vulnerabilidadeDescricao ?? null, String(PRAZO_PADRAO_HORAS[t.severidade])],
      );
      await registrarEvento(c, quem, id, "triagem", {
        severidade: t.severidade,
        prazoHoras: PRAZO_PADRAO_HORAS[t.severidade],
      });
    });

    return { status: "triagem" };
  });

  app.post("/:id/despacho", async (req) => {
    const quem = await autorizar(app, req, "despachar_equipe");
    const { id } = idSchema.parse(req.params);
    const d = despachoSchema.parse(req.body);

    await banco.comTenant(quem.organizacaoId, async (c) => {
      await exigirTransicao(c, id, "em_campo");
      // A equipe é lida sob RLS: equipe de outro município simplesmente não
      // existe daqui, então não há como despachar para fora da prefeitura.
      const equipe = await c.query<{ nome: string; ativa: boolean }>(
        "SELECT nome, ativa FROM equipes WHERE id = $1",
        [d.equipeId],
      );
      const encontrada = equipe.rows[0];
      if (!encontrada) {
        throw new RegraDeNegocio("equipe_inexistente", "Equipe não encontrada.", 404);
      }
      if (!encontrada.ativa) {
        throw new RegraDeNegocio("equipe_inativa", "Essa equipe está desativada.");
      }
      await c.query(
        `UPDATE ocorrencias SET status = 'em_campo', equipe_id = $2,
                prazo_em = now() + ($3 || ' hours')::interval
          WHERE id = $1`,
        [id, d.equipeId, String(d.prazoHoras)],
      );
      await registrarEvento(c, quem, id, "despacho", {
        equipe: encontrada.nome,
        prazoHoras: d.prazoHoras,
        instrucoes: d.instrucoes ?? null,
      });
    });

    return { status: "em_campo" };
  });

  app.post("/:id/providencia", async (req) => {
    const quem = await autorizar(app, req, "encaminhar_providencia");
    const { id } = idSchema.parse(req.params);
    const p = providenciaSchema.parse(req.body);

    await banco.comTenant(quem.organizacaoId, async (c) => {
      await exigirTransicao(c, id, "providencia_pendente");
      await c.query(
        `INSERT INTO providencias
           (organizacao_id, ocorrencia_id, orgao_destino, descricao, responsavel, prazo_em)
         VALUES ($1,$2,$3,$4,$5, now() + ($6 || ' hours')::interval)`,
        [quem.organizacaoId, id, p.orgaoDestino, p.descricao, p.responsavel, String(p.prazoHoras)],
      );
      await c.query("UPDATE ocorrencias SET status = 'providencia_pendente' WHERE id = $1", [id]);
      await registrarEvento(c, quem, id, "providencia", {
        orgao: p.orgaoDestino,
        responsavel: p.responsavel,
        prazoHoras: p.prazoHoras,
      });
    });

    return { status: "providencia_pendente" };
  });

  /**
   * Registra o que o órgão respondeu.
   *
   * A providência fica no caminho do encerramento de propósito: encerrar uma
   * ocorrência cuja providência nunca teve desfecho é o que produz o "a
   * prefeitura não fez nada" seis meses depois, sem ninguém conseguir provar
   * o contrário.
   */
  app.post("/:id/providencia/:providenciaId/resposta", async (req) => {
    const quem = await autorizar(app, req, "responder_providencia");
    const { id, providenciaId } = z.object({
      id: z.string().uuid(),
      providenciaId: z.string().uuid(),
    }).parse(req.params);
    const r = respostaProvidenciaSchema.parse(req.body);

    await banco.comTenant(quem.organizacaoId, async (c) => {
      const atual = await c.query<{ respondida_em: string | null; orgao_destino: string }>(
        "SELECT respondida_em, orgao_destino FROM providencias WHERE id = $1 AND ocorrencia_id = $2",
        [providenciaId, id],
      );
      const alvo = atual.rows[0];
      if (!alvo) {
        throw new RegraDeNegocio("nao_encontrada", "Providência não encontrada.", 404);
      }
      if (alvo.respondida_em) {
        // Corrigir uma resposta não é sobrescrever: seria apagar o que o
        // órgão disse antes. Entra como providência nova, encaminhada de novo.
        throw new RegraDeNegocio(
          "ja_respondida",
          "Essa providência já tem resposta registrada. Encaminhe uma nova se algo mudou.",
        );
      }

      await c.query(
        `UPDATE providencias
            SET respondida_em = now(), resposta = $2, desfecho = $3, respondida_por = $4
          WHERE id = $1`,
        [providenciaId, r.resposta, r.desfecho, r.respondidaPor],
      );

      await registrarEvento(c, quem, id, "resposta_providencia", {
        orgao: alvo.orgao_destino,
        desfecho: r.desfecho,
        respondidaPor: r.respondidaPor,
      });
    });

    return { desfecho: r.desfecho };
  });

  app.post("/:id/encerramento", async (req) => {
    const quem = await autorizar(app, req, "encerrar_ocorrencia");
    const { id } = idSchema.parse(req.params);
    const e = encerramentoSchema.parse(req.body);

    const pendentes = await banco.comTenant(quem.organizacaoId, async (c) => {
      await exigirTransicao(c, id, "encerrada");

      /*
        Providência sem resposta não impede encerrar: a realidade da rua é que
        a secretaria às vezes nunca responde, e travar o encerramento faria a
        fila do coordenador crescer para sempre. Mas o fato entra na trilha e
        volta na resposta, para o encerramento ser uma decisão consciente e não
        um esquecimento.
      */
      const abertas = await c.query<{ orgao_destino: string }>(
        "SELECT orgao_destino FROM providencias WHERE ocorrencia_id = $1 AND respondida_em IS NULL",
        [id],
      );

      await c.query(
        `UPDATE ocorrencias SET status = 'encerrada', encerrado_em = now(),
                motivo_encerramento = $2 WHERE id = $1`,
        [id, e.motivo],
      );
      await registrarEvento(c, quem, id, "encerramento", {
        motivo: e.motivo,
        providenciasSemResposta: abertas.rows.map((p) => p.orgao_destino),
      });

      return abertas.rows.map((p) => p.orgao_destino);
    });

    return { status: "encerrada", providenciasSemResposta: pendentes };
  });

  /**
   * Levantar a interdição de um imóvel.
   *
   * O ato que faltava. O sistema sabia interditar (o termo é emitido, a
   * ocorrência fica marcada) e não sabia desinterditar: a casa constava
   * interditada para sempre, e a família voltava para casa sem papel nenhum ou
   * não voltava.
   *
   * Três recusas deliberadas nesta rota:
   *
   * 1. **Não levanta o que não foi interditado.** Sem isso, um clique errado
   *    gravaria um levantamento de interdição que nunca existiu, e o termo
   *    sairia afirmando que uma casa foi liberada de uma restrição imaginária.
   * 2. **Não levanta duas vezes.** O segundo levantamento seria um evento
   *    falso numa trilha que não tem policy de DELETE: não existe correção
   *    depois. É a mesma regra do encerramento duplicado.
   * 3. **Não aceita motivo curto.** O esquema exige quinze caracteres. Quem
   *    autoriza uma família a voltar para uma casa que o município declarou
   *    insegura deve conseguir escrever uma frase sobre o porquê.
   *
   * O que ela deliberadamente NÃO faz: exigir vistoria nova. Deveria, e a
   * norma de campo é essa, mas travar aqui deixaria imóveis interditados sem
   * saída no dia em que a equipe está afogada, que é justamente quando isso
   * acontece. O termo imprime o motivo por extenso, e "sem nova vistoria"
   * fica escrito nele se for o caso.
   */
  app.post("/:id/desinterdicao", async (req) => {
    const quem = await autorizar(app, req, "levantar_interdicao");
    const { id } = idSchema.parse(req.params);
    const d = desinterdicaoSchema.parse(req.body);

    return banco.comTenant(quem.organizacaoId, async (c) => {
      /*
        `FOR UPDATE` porque duas coordenadoras clicando ao mesmo tempo é o
        cenário em que a checagem sem trava deixa passar os dois: as duas leem
        `desinterditada_em` nulo antes de qualquer uma escrever, e a trilha
        ganha dois levantamentos do mesmo imóvel.
      */
      const atual = await c.query<{
        interditada_em: string | null; desinterditada_em: string | null;
      }>(
        `SELECT interditada_em, desinterditada_em FROM ocorrencias
          WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const alvo = atual.rows[0];
      // 404, e não 403: recurso de outro município não se confirma.
      if (!alvo) throw new RegraDeNegocio("nao_encontrada", "Ocorrência não encontrada.", 404);

      if (!alvo.interditada_em) {
        throw new RegraDeNegocio(
          "nao_interditada",
          "Este imóvel não está interditado, então não há interdição a levantar.",
          409,
        );
      }
      if (alvo.desinterditada_em) {
        throw new RegraDeNegocio(
          "ja_desinterditada",
          "A interdição deste imóvel já foi levantada. Se o risco voltou, "
          + "registre uma vistoria nova e emita novo termo de interdição.",
          409,
        );
      }

      await c.query(
        `UPDATE ocorrencias
            SET desinterditada_em = now(), desinterditada_por = $2,
                desinterdicao_motivo = $3
          WHERE id = $1`,
        [id, quem.usuarioId, d.motivo.trim()],
      );
      await registrarEvento(c, quem, id, "desinterdicao", {
        motivo: d.motivo.trim(),
        interditadaEm: alvo.interditada_em,
      });

      return { status: "desinterditada" };
    });
  });

  /**
   * Os imóveis interditados agora.
   *
   * Esta lista existe pelo mesmo motivo que a de providências vencidas: para
   * que "tem gente fora de casa há quatro meses" seja um fato visível na tela,
   * e não uma descoberta quando alguém reclama. Ordenada pela mais antiga
   * primeiro, que é a que mais dói.
   */
  app.get("/interditados", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    return banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query(
        `SELECT o.id, o.protocolo, o.tipo, o.severidade, o.status, o.endereco,
                o.ponto_referencia, o.interditada_em,
                u.nome AS interditada_por_nome
           FROM ocorrencias o
           LEFT JOIN usuarios u ON u.id = o.interditada_por
          WHERE o.interditada_em IS NOT NULL AND o.desinterditada_em IS NULL
          ORDER BY o.interditada_em`,
      );
      return { itens: r.rows };
    });
  });

  /**
   * Providências que vencem sem resposta.
   *
   * Elas somem da fila do coordenador assim que a ocorrência é encerrada, e é
   * justamente aí que ficam esquecidas. Esta lista existe para que "a
   * secretaria não respondeu" seja um fato visível e não uma descoberta seis
   * meses depois.
   */
  app.get("/providencias/pendentes", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    return banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query(
        `SELECT p.id, p.orgao_destino, p.descricao, p.responsavel,
                p.prazo_em, p.encaminhada_em,
                o.id AS ocorrencia_id, o.protocolo, o.endereco, o.status
           FROM providencias p JOIN ocorrencias o ON o.id = p.ocorrencia_id
          WHERE p.respondida_em IS NULL
          ORDER BY p.prazo_em`,
      );
      return { itens: r.rows };
    });
  });

  app.get("/indicadores/painel", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    return banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query(
        `SELECT
           count(*) FILTER (WHERE status NOT IN ('encerrada','rascunho'))::int AS na_fila,
           count(*) FILTER (WHERE status = 'em_campo')::int AS em_campo,
           count(*) FILTER (WHERE status NOT IN ('encerrada','rascunho')
                              AND prazo_em IS NOT NULL AND prazo_em < now())::int AS atrasadas,
           count(*) FILTER (WHERE status = 'encerrada'
                              AND encerrado_em > now() - interval '7 days')::int AS encerradas_7d,
           count(*) FILTER (WHERE status NOT IN ('encerrada','rascunho')
                              AND severidade = 'critica')::int AS criticas,
           (SELECT count(*) FROM providencias
             WHERE respondida_em IS NULL)::int AS providencias_abertas,
           (SELECT count(*) FROM providencias
             WHERE respondida_em IS NULL AND prazo_em < now())::int
             AS providencias_vencidas
         FROM ocorrencias`,
      );
      return r.rows[0];
    });
  });
}
