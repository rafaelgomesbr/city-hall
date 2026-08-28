import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  cadastroEquipeSchema, cadastroUsuarioSchema, edicaoUsuarioSchema,
  exigirPostoParaGerir, type Papel,
} from "@dc360/shared";
import type { Banco } from "../banco/tipos.js";
import { RegraDeNegocio, autorizar } from "../servidor.js";
import { registrarAtoAdministrativo } from "../trilha.js";
import { derivarSenha } from "../auth/senha.js";

const idSchema = z.object({ id: z.string().uuid() });

/*
  Os schemas vêm do pacote compartilhado, e não são redefinidos aqui. Antes
  eram: a API tinha a versão completa e o formulário do painel tinha uma cópia
  mais fraca, sem formato de email e sem tamanho máximo. Uma regra, um lugar.
*/
const equipeSchema = cadastroEquipeSchema;
const usuarioSchema = cadastroUsuarioSchema;

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
        await registrarAtoAdministrativo(c, quem, {
          acao: "equipe_criada",
          alvoTipo: "equipe",
          alvoId: r.rows[0]!.id,
          alvoNome: dados.nome.trim(),
          depois: { nome: dados.nome.trim(), especialidade: dados.especialidade?.trim() || null },
        });
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
        if (r.rows.length > 0) {
          await registrarAtoAdministrativo(c, quem, {
            acao: dados.ativa ? "equipe_editada" : "equipe_desativada",
            alvoTipo: "equipe",
            alvoId: id,
            alvoNome: dados.nome.trim(),
            depois: {
              nome: dados.nome.trim(),
              especialidade: dados.especialidade?.trim() || null,
              ativa: dados.ativa,
            },
          });
        }
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
    // Ninguém concede papel de posto acima do seu. Sem isto, um coordenador
    // criaria um administrador e, por ele, faria tudo o que não pode.
    exigirPostoParaGerir(quem.papel, dados.papel);
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
        /*
          Criar conta é o ato administrativo de maior consequência que existe,
          e era o que menos deixava rastro. O `depois` NÃO leva senha nem hash:
          leva papel, equipe e identificação, que é o que uma investigação
          precisa e o máximo que ela pode ver.
        */
        await registrarAtoAdministrativo(c, quem, {
          acao: "usuario_criado",
          alvoTipo: "usuario",
          alvoId: r.rows[0]!.id,
          alvoNome: dados.nome.trim(),
          depois: {
            papel: dados.papel,
            matricula: dados.matricula.trim(),
            equipeId: dados.equipeId ?? null,
            ativo: true,
          },
        });
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
      const atual = await c.query<{ papel: Papel; ativo: boolean }>(
        "SELECT papel, ativo FROM usuarios WHERE id = $1",
        [id],
      );
      const alvo = atual.rows[0];
      if (!alvo) {
        throw new RegraDeNegocio("nao_encontrado", "Usuário não encontrado.", 404);
      }

      // Posto antes de tudo: um coordenador não desativa o administrador.
      exigirPostoParaGerir(quem.papel, alvo.papel);

      /*
        O município não pode ficar sem quem o administra.

        A regra de autodesativação sozinha não garantia isso: ela impede a
        pessoa de se desligar, mas nada impedia o penúltimo administrador de
        desativar o último. O resultado seria um município sem ninguém capaz de
        criar usuário, e a saída seria SQL na mão no banco de produção.

        Vale para administrador porque é o teto do município. Coordenador
        abaixo do último continua podendo ser desativado: sempre sobra o
        administrador para recriar.
      */
      if (!ativo && alvo.papel === "administrador" && alvo.ativo) {
        const restantes = await c.query<{ quantos: string }>(
          "SELECT count(*) AS quantos FROM usuarios WHERE papel = 'administrador' AND ativo = true AND id <> $1",
          [id],
        );
        if (Number(restantes.rows[0]?.quantos ?? 0) === 0) {
          throw new RegraDeNegocio(
            "ultimo_administrador",
            "Este é o último administrador ativo do município. Promova outra " +
            "pessoa a administrador antes de desativar esta conta.",
            422,
          );
        }
      }

      await c.query("UPDATE usuarios SET ativo = $2 WHERE id = $1", [id, ativo]);
      if (!ativo) {
        await c.query("SELECT revogar_sessoes_do_usuario($1, $2)", [id, "usuario desativado"]);
      }

      /*
        Desativar e reativar é o par de atos que o red team descreveu como o
        caminho de quem quer usar uma conta e sumir com o rastro. Sem este
        registro, a conta volta ao estado anterior e nada indica que ela esteve
        em uso no meio.
      */
      const nomeAlvo = await c.query<{ nome: string }>(
        "SELECT nome FROM usuarios WHERE id = $1", [id],
      );
      await registrarAtoAdministrativo(c, quem, {
        acao: ativo ? "usuario_reativado" : "usuario_desativado",
        alvoTipo: "usuario",
        alvoId: id,
        alvoNome: nomeAlvo.rows[0]?.nome ?? "(conta removida do cadastro)",
        antes: { ativo: alvo.ativo, papel: alvo.papel },
        depois: { ativo, papel: alvo.papel },
      });
    });

    return { id, ativo };
  });

  /**
   * Corrigir o cadastro de quem já existe.
   *
   * Sem esta rota, um usuário cadastrado com o papel errado só se resolvia
   * desativando a conta e criando outra, o que parte o histórico da pessoa em
   * duas contas. A trilha de auditoria não sofre com a edição: ela grava nome
   * e papel no momento de cada evento, então o passado continua contando o que
   * de fato aconteceu.
   *
   * Senha fica de fora de propósito: trocar senha derruba sessões e é outro
   * ato. Misturar os dois faz alguém trocar senha sem querer.
   */
  app.patch("/usuarios/:id", async (req) => {
    const quem = await autorizar(app, req, "gerenciar_usuarios");
    const { id } = idSchema.parse(req.params);
    const dados = edicaoUsuarioSchema.parse(req.body);

    // Posto dos DOIS lados: não se mexe em conta acima do seu posto, e não se
    // concede papel acima do seu. Sem o segundo, um coordenador se promoveria.
    exigirPostoParaGerir(quem.papel, dados.papel);

    try {
      return await banco.comTenant(quem.organizacaoId, async (c) => {
        const atual = await c.query<{ papel: Papel; ativo: boolean }>(
          "SELECT papel, ativo FROM usuarios WHERE id = $1",
          [id],
        );
        const alvo = atual.rows[0];
        if (!alvo) {
          throw new RegraDeNegocio("nao_encontrado", "Usuário não encontrado.", 404);
        }
        exigirPostoParaGerir(quem.papel, alvo.papel);

        // Rebaixar o último administrador tranca o município igual a desativar.
        if (alvo.papel === "administrador" && alvo.ativo && dados.papel !== "administrador") {
          const restantes = await c.query<{ quantos: string }>(
            "SELECT count(*) AS quantos FROM usuarios WHERE papel = 'administrador' AND ativo = true AND id <> $1",
            [id],
          );
          if (Number(restantes.rows[0]?.quantos ?? 0) === 0) {
            throw new RegraDeNegocio(
              "ultimo_administrador",
              "Este é o último administrador ativo do município. Promova outra " +
              "pessoa a administrador antes de mudar o papel desta conta.",
              422,
            );
          }
        }

        const r = await c.query<{ id: string }>(
          `UPDATE usuarios
              SET nome = $2, matricula = $3, email = $4, papel = $5, equipe_id = $6
            WHERE id = $1
        RETURNING id`,
          [id, dados.nome, dados.matricula, dados.email, dados.papel, dados.equipeId ?? null],
        );
        /*
          A MUDANÇA DE PAPEL é o ato que mais importa registrar de todos.

          É por aqui que uma conta vira coordenador e volta a ser operador, e
          era exatamente isso que não deixava rastro: o cadastro terminava
          igual ao que começou, e nada dizia o que ele foi no meio.
        */
        await registrarAtoAdministrativo(c, quem, {
          acao: alvo.papel === dados.papel ? "usuario_editado" : "papel_alterado",
          alvoTipo: "usuario",
          alvoId: id,
          alvoNome: dados.nome,
          antes: { papel: alvo.papel },
          depois: {
            papel: dados.papel,
            matricula: dados.matricula,
            equipeId: dados.equipeId ?? null,
          },
        });
        return r.rows[0];
      });
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
}
