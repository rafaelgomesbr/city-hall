import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PAPEIS } from "@dc360/shared";
import type { Banco } from "../banco/tipos.js";
import { RegraDeNegocio, autorizar } from "../servidor.js";
import { derivarSenha } from "../auth/senha.js";

const idSchema = z.object({ id: z.string().uuid() });

const equipeSchema = z.object({
  nome: z.string().min(1, "Informe o nome da equipe").max(120),
  especialidade: z.string().max(200).nullish(),
  ativa: z.boolean().default(true),
});

/**
 * Senha de cadastro segue o ASVS 4.0 (2.1.1 a 2.1.9): mínimo de 12
 * caracteres, máximo alto o bastante para não atrapalhar gerenciador de
 * senha, e nenhuma exigência de composição, que só produz "Senha@123".
 */
const senhaSchema = z.string()
  .min(12, "A senha precisa de pelo menos 12 caracteres")
  .max(200);

const usuarioSchema = z.object({
  nome: z.string().min(1, "Informe o nome").max(200),
  matricula: z.string().min(1, "Informe a matrícula").max(40),
  email: z.string().email("Informe um email válido").max(320),
  papel: z.enum(PAPEIS),
  equipeId: z.string().uuid().nullish(),
  senha: senhaSchema,
});

/** Erro de unicidade do Postgres, traduzido para linguagem de quem preenche. */
function ehDuplicidade(erro: unknown): boolean {
  const codigo = (erro as { code?: string }).code;
  if (codigo === "23505") return true;
  return /duplicate key|unique constraint/i.test(String((erro as Error)?.message ?? ""));
}

export async function rotasAdministracao(
  app: FastifyInstance,
  { banco }: { banco: Banco },
): Promise<void> {
  app.get("/equipes", async (req) => {
    const quem = await app.exigirAutenticacao(req);
    return banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query(
        `SELECT e.id, e.nome, e.especialidade, e.ativa,
                (SELECT count(*) FROM ocorrencias o
                  WHERE o.equipe_id = e.id AND o.status NOT IN ('encerrada','rascunho'))::int
                AS em_atendimento
           FROM equipes e ORDER BY e.nome`,
      );
      return { itens: r.rows };
    });
  });

  app.post("/equipes", async (req, resposta) => {
    const quem = await autorizar(app, req, "gerenciar_equipes");
    const dados = equipeSchema.parse(req.body);
    try {
      const criada = await banco.comTenant(quem.organizacaoId, async (c) => {
        const r = await c.query<{ id: string }>(
          "INSERT INTO equipes (organizacao_id, nome, especialidade) VALUES ($1,$2,$3) RETURNING id",
          [quem.organizacaoId, dados.nome.trim(), dados.especialidade?.trim() || null],
        );
        return r.rows[0];
      });
      return resposta.code(201).send(criada);
    } catch (erro) {
      if (ehDuplicidade(erro)) {
        throw new RegraDeNegocio("nome_repetido", "Já existe uma equipe com esse nome neste município.");
      }
      throw erro;
    }
  });

  app.patch("/equipes/:id", async (req) => {
    const quem = await autorizar(app, req, "gerenciar_equipes");
    const { id } = idSchema.parse(req.params);
    const dados = equipeSchema.parse(req.body);
    try {
      await banco.comTenant(quem.organizacaoId, async (c) => {
        const r = await c.query(
          "UPDATE equipes SET nome = $2, especialidade = $3, ativa = $4 WHERE id = $1 RETURNING id",
          [id, dados.nome.trim(), dados.especialidade?.trim() || null, dados.ativa],
        );
        if (r.rows.length === 0) {
          throw new RegraDeNegocio("nao_encontrada", "Equipe não encontrada.", 404);
        }
      });
      return { id };
    } catch (erro) {
      if (ehDuplicidade(erro)) {
        throw new RegraDeNegocio("nome_repetido", "Já existe uma equipe com esse nome neste município.");
      }
      throw erro;
    }
  });

  app.get("/usuarios", async (req) => {
    const quem = await autorizar(app, req, "gerenciar_usuarios");
    return banco.comTenant(quem.organizacaoId, async (c) => {
      // senha_hash nunca sai daqui, nem para quem administra o município.
      const r = await c.query(
        `SELECT u.id, u.nome, u.matricula, u.email, u.papel, u.equipe_id, u.ativo,
                u.ultimo_acesso, e.nome AS equipe_nome
           FROM usuarios u LEFT JOIN equipes e ON e.id = u.equipe_id
          ORDER BY u.nome`,
      );
      return { itens: r.rows };
    });
  });

  app.post("/usuarios", async (req, resposta) => {
    const quem = await autorizar(app, req, "gerenciar_usuarios");
    const dados = usuarioSchema.parse(req.body);
    const hash = await derivarSenha(dados.senha);

    try {
      const criado = await banco.comTenant(quem.organizacaoId, async (c) => {
        const r = await c.query<{ id: string }>(
          `INSERT INTO usuarios
             (organizacao_id, nome, matricula, email, papel, equipe_id, senha_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [
            quem.organizacaoId, dados.nome.trim(), dados.matricula.trim(),
            dados.email.trim().toLowerCase(), dados.papel,
            dados.equipeId ?? null, hash,
          ],
        );
        return r.rows[0];
      });
      return resposta.code(201).send(criado);
    } catch (erro) {
      if (ehDuplicidade(erro)) {
        throw new RegraDeNegocio(
          "usuario_repetido",
          "Já existe usuário com essa matrícula ou esse email.",
        );
      }
      throw erro;
    }
  });

  /**
   * Usuário não se apaga, se desativa. Ele assina laudo e aparece na trilha:
   * apagar deixaria documento oficial sem autor identificável.
   *
   * Desativar também derruba as sessões abertas. Sem isso, quem foi desligado
   * continuaria trabalhando até o token de acesso expirar.
   */
  app.patch("/usuarios/:id/situacao", async (req) => {
    const quem = await autorizar(app, req, "gerenciar_usuarios");
    const { id } = idSchema.parse(req.params);
    const { ativo } = z.object({ ativo: z.boolean() }).parse(req.body);

    if (id === quem.usuarioId && !ativo) {
      throw new RegraDeNegocio(
        "autodesativacao",
        "Você não pode desativar a própria conta.",
        422,
      );
    }

    await banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query(
        "UPDATE usuarios SET ativo = $2 WHERE id = $1 RETURNING id",
        [id, ativo],
      );
      if (r.rows.length === 0) {
        throw new RegraDeNegocio("nao_encontrado", "Usuário não encontrado.", 404);
      }
      if (!ativo) {
        await c.query("SELECT revogar_sessoes_do_usuario($1, $2)", [id, "usuario desativado"]);
      }
    });

    return { id, ativo };
  });
}
