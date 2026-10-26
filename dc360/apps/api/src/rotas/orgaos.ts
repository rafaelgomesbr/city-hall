import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Banco } from "../banco/tipos.js";
import { RegraDeNegocio, autorizar } from "../servidor.js";
import { registrarAtoAdministrativo } from "../trilha.js";

/**
 * O catálogo de órgãos de destino do município.
 *
 * Existe porque `providencias.orgao_destino` era texto livre, e texto livre
 * digitado por pessoas diferentes ao longo de um ano produz "Corpo de
 * Bombeiros", "Bombeiros", "CBMSC" e "corpo de bombeiros" como quatro destinos
 * distintos. A conta de "quantas providências foram para os bombeiros" não
 * fecha, e é justamente essa conta que sustenta a conversa de orçamento.
 *
 * O catálogo traz junto o que o texto livre nunca teve: o email do órgão. Ele
 * é o que permite o ofício sair do sistema, e é também a LISTA FECHADA DE
 * DOMÍNIOS que impede o painel de virar um encaminhador de documento oficial
 * para endereço arbitrário. Ver a migração 017.
 *
 * PERMISSÃO: `gerenciar_equipes`, e não `gerenciar_organizacao`.
 *
 * A escolha é deliberada e tem custo dos dois lados. O catálogo é cadastro
 * estrutural do município, como a lista de equipes, e quem monta a operação é
 * a coordenação. Amarrar em `gerenciar_organizacao` deixaria só o
 * administrador cadastrando órgão, e o efeito prático seria o coordenador
 * travado no meio de um encaminhamento urgente esperando alguém aparecer para
 * criar "Corpo de Bombeiros" no sistema. A leitura continua aberta a qualquer
 * conta autenticada, porque o formulário de providência precisa da lista.
 */

const idSchema = z.object({ id: z.string().uuid() });

/** A query de `GET /orgaos`. Exportada para o contrato OpenAPI (V2-F02-E04). */
export const consultaDosOrgaosSchema = z.object({
  incluirInativos: z.enum(["0", "1", "true", "false"]).optional()
    .transform((v) => v === "1" || v === "true"),
});

/*
  O email é opcional aqui, e essa é uma decisão de operação e não de esquema.

  Um órgão existe antes de alguém descobrir o endereço certo, e providência
  encaminhada por telefone continua sendo providência. Sem email, o ofício é
  emitido e impresso normalmente; o que não acontece é o envio, e a rota de
  envio diz isso com todas as letras em vez de falhar sozinha.
*/
export const orgaoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do órgão").max(200),
  sigla: z.string().trim().max(20).optional(),
  email: z.string().trim().email("Informe um email válido").max(320).optional(),
  telefone: z.string().trim().max(40).optional(),
});

export const desativacaoSchema = z.object({
  /*
    Quinze caracteres, e a régua é a mesma do levantamento de interdição.

    "erro", "teste" e "nao" são o que aparece quando o campo aceita qualquer
    coisa, e nenhum deles responde à pergunta que alguém fará daqui a um ano:
    por que este órgão parou de receber ofício, e para onde foi a competência
    dele.
  */
  motivo: z.string().trim().min(15, "Explique por que este órgão sai da lista").max(500),
});

function ehDuplicidade(erro: unknown): boolean {
  const codigo = (erro as { code?: string }).code;
  if (codigo === "23505") return true;
  return /duplicate key|unique constraint/i.test(String((erro as Error)?.message ?? ""));
}

export type LinhaOrgao = {
  id: string;
  nome: string;
  sigla: string | null;
  email: string | null;
  telefone: string | null;
  ativo: boolean;
  desativado_em: string | null;
  motivo_desativacao: string | null;
};

export async function rotasOrgaos(
  app: FastifyInstance,
  { banco }: { banco: Banco },
): Promise<void> {
  app.get("/", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    const { incluirInativos } = consultaDosOrgaosSchema.parse(req.query);

    return banco.comTenant(quem.organizacaoId, async (c) => {
      /*
        A contagem de providências vem junto porque é ela que torna a
        desativação uma decisão informada: desativar um órgão com trinta
        encaminhamentos em aberto é diferente de desativar um que nunca foi
        usado, e a tela não tem como saber a diferença sozinha.
      */
      const r = await c.query<LinhaOrgao & { providencias: number; abertas: number }>(
        `SELECT o.id, o.nome, o.sigla, o.email, o.telefone, o.ativo,
                o.desativado_em, o.motivo_desativacao,
                (SELECT count(*) FROM providencias p WHERE p.orgao_id = o.id)::int
                  AS providencias,
                (SELECT count(*) FROM providencias p
                  WHERE p.orgao_id = o.id AND p.respondida_em IS NULL)::int
                  AS abertas
           FROM orgaos o
          WHERE ($1 OR o.ativo)
          ORDER BY o.ativo DESC, o.nome`,
        [incluirInativos],
      );
      return { itens: r.rows };
    });
  });

  app.post("/", async (req, resposta) => {
    const quem = await autorizar(app, req, "gerenciar_equipes");
    const dados = orgaoSchema.parse(req.body);

    try {
      const criado = await banco.comTenant(quem.organizacaoId, async (c) => {
        const r = await c.query<{ id: string }>(
          `INSERT INTO orgaos (organizacao_id, nome, sigla, email, telefone)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [
            quem.organizacaoId, dados.nome,
            dados.sigla || null, dados.email?.toLowerCase() || null, dados.telefone || null,
          ],
        );
        await registrarAtoAdministrativo(c, quem, {
          acao: "orgao_criado",
          alvoTipo: "orgao",
          alvoId: r.rows[0]!.id,
          alvoNome: dados.nome,
          depois: { nome: dados.nome, sigla: dados.sigla ?? null, email: dados.email ?? null },
        });
        return r.rows[0];
      });
      return resposta.code(201).send(criado);
    } catch (erro) {
      if (ehDuplicidade(erro)) {
        throw new RegraDeNegocio(
          "orgao_repetido",
          "Já existe um órgão com esse nome ou essa sigla neste município. "
          + "Use o que já está cadastrado, senão os relatórios contam o mesmo "
          + "destino duas vezes.",
        );
      }
      throw erro;
    }
  });

  app.patch("/:id", async (req) => {
    const quem = await autorizar(app, req, "gerenciar_equipes");
    const { id } = idSchema.parse(req.params);
    const dados = orgaoSchema.parse(req.body);

    try {
      await banco.comTenant(quem.organizacaoId, async (c) => {
        const antes = await c.query<LinhaOrgao>(
          "SELECT id, nome, sigla, email, telefone, ativo FROM orgaos WHERE id = $1",
          [id],
        );
        // 404, e não 403: órgão de outro município não se confirma.
        if (!antes.rows[0]) {
          throw new RegraDeNegocio("nao_encontrado", "Órgão não encontrado.", 404);
        }

        await c.query(
          "UPDATE orgaos SET nome = $2, sigla = $3, email = $4, telefone = $5 WHERE id = $1",
          [
            id, dados.nome,
            dados.sigla || null, dados.email?.toLowerCase() || null, dados.telefone || null,
          ],
        );
        await registrarAtoAdministrativo(c, quem, {
          acao: "orgao_editado",
          alvoTipo: "orgao",
          alvoId: id,
          alvoNome: dados.nome,
          antes: {
            nome: antes.rows[0].nome,
            sigla: antes.rows[0].sigla,
            email: antes.rows[0].email,
          },
          depois: { nome: dados.nome, sigla: dados.sigla ?? null, email: dados.email ?? null },
        });
      });
      return { id };
    } catch (erro) {
      if (ehDuplicidade(erro)) {
        throw new RegraDeNegocio(
          "orgao_repetido",
          "Já existe um órgão com esse nome ou essa sigla neste município.",
        );
      }
      throw erro;
    }
  });

  /**
   * Órgão não se apaga, se desativa com motivo.
   *
   * A rota de exclusão não existe, e a ausência é a decisão. O órgão aparece
   * em ofício já emitido e na trilha de quem encaminhou o quê. Apagar a linha
   * apagaria junto a resposta para "para onde foi este ofício", que é a
   * pergunta que uma auditoria faz. O banco reforça: o papel de aplicação não
   * tem privilégio de DELETE nesta tabela.
   */
  app.post("/:id/desativacao", async (req) => {
    const quem = await autorizar(app, req, "gerenciar_equipes");
    const { id } = idSchema.parse(req.params);
    const { motivo } = desativacaoSchema.parse(req.body);

    await banco.comTenant(quem.organizacaoId, async (c) => {
      const atual = await c.query<{ nome: string; ativo: boolean }>(
        "SELECT nome, ativo FROM orgaos WHERE id = $1",
        [id],
      );
      if (!atual.rows[0]) {
        throw new RegraDeNegocio("nao_encontrado", "Órgão não encontrado.", 404);
      }
      if (!atual.rows[0].ativo) {
        // Desativar duas vezes gravaria um segundo ato administrativo numa
        // trilha que não tem policy de DELETE, dizendo que algo aconteceu
        // quando nada aconteceu. Mesma regra do encerramento duplicado.
        throw new RegraDeNegocio(
          "ja_desativado",
          "Esse órgão já está desativado. Nada foi alterado.",
        );
      }

      await c.query(
        `UPDATE orgaos
            SET ativo = false, desativado_em = now(), motivo_desativacao = $2
          WHERE id = $1`,
        [id, motivo],
      );
      await registrarAtoAdministrativo(c, quem, {
        acao: "orgao_desativado",
        alvoTipo: "orgao",
        alvoId: id,
        alvoNome: atual.rows[0].nome,
        antes: { ativo: true },
        depois: { ativo: false, motivo },
      });
    });

    return { id, ativo: false };
  });

  /**
   * Reativar existe, e desativar continua não sendo apagar.
   *
   * Sem esta rota, um clique errado numa desativação seria irreversível pela
   * tela, e a saída informal viraria cadastrar o mesmo órgão de novo com o
   * nome quase igual, que é exatamente o problema que o catálogo veio
   * resolver.
   */
  app.post("/:id/reativacao", async (req) => {
    const quem = await autorizar(app, req, "gerenciar_equipes");
    const { id } = idSchema.parse(req.params);

    await banco.comTenant(quem.organizacaoId, async (c) => {
      const atual = await c.query<{ nome: string; ativo: boolean }>(
        "SELECT nome, ativo FROM orgaos WHERE id = $1",
        [id],
      );
      if (!atual.rows[0]) {
        throw new RegraDeNegocio("nao_encontrado", "Órgão não encontrado.", 404);
      }
      if (atual.rows[0].ativo) {
        throw new RegraDeNegocio("ja_ativo", "Esse órgão já está ativo. Nada foi alterado.");
      }

      await c.query(
        `UPDATE orgaos
            SET ativo = true, desativado_em = NULL, motivo_desativacao = NULL
          WHERE id = $1`,
        [id],
      );
      await registrarAtoAdministrativo(c, quem, {
        acao: "orgao_reativado",
        alvoTipo: "orgao",
        alvoId: id,
        alvoNome: atual.rows[0].nome,
        antes: { ativo: false },
        depois: { ativo: true },
      });
    });

    return { id, ativo: true };
  });
}
