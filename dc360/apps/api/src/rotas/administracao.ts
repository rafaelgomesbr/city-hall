import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  cadastroEquipeSchema, cadastroUsuarioSchema, edicaoUsuarioSchema,
  exigirPostoParaGerir, type Papel,
} from "@dc360/shared";
import type { Banco } from "../banco/tipos.js";
import { RegraDeNegocio, autorizar } from "../servidor.js";
import { registrarAtoAdministrativo } from "../trilha.js";
import { derivarSenha, gerarSenhaTemporaria } from "../auth/senha.js";
import { encerrarSessoes } from "../auth/sessoes.js";

const idSchema = z.object({ id: z.string().uuid() });

/**
 * O prazo de retenção, em dias, por município.
 *
 * NULO É VALOR, e não campo esquecido: significa "o município ainda não
 * decidiu", e a varredura pula quem está assim. Por isso `nullable()` e não
 * `optional()`: omitir a chave e mandá-la nula precisam ser coisas
 * diferentes, senão desligar a retenção seria impossível de expressar e
 * alguém acabaria "desligando" com o número 36500.
 *
 * A faixa repete a do banco (migração 021), que é quem manda. Aqui ela existe
 * para a mensagem de erro chegar ao formulário em vez de "violates check
 * constraint".
 */
const retencaoSchema = z.object({
  solicitanteDias: z.number().int().min(1).max(36500).nullable(),
  vulnerabilidadeDias: z.number().int().min(1).max(36500).nullable(),
});

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
        const atual = await c.query<{ papel: Papel; ativo: boolean; email: string }>(
          "SELECT papel, ativo, email FROM usuarios WHERE id = $1",
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
          /*
            O EMAIL entra no antes/depois, e não é detalhe: trocar o email de
            outra conta é o primeiro passo da tomada de conta (trocar, pedir
            recuperação de senha, entrar como a pessoa, devolver o email). Era
            a única mudança desta rota que não deixava rastro, num produto que
            se vende como auditável. Agora a trilha mostra de qual email para
            qual.
          */
          antes: { papel: alvo.papel, email: alvo.email },
          depois: {
            papel: dados.papel,
            email: dados.email,
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

  /**
   * Redefinir a senha de outra pessoa do município.
   *
   * O QUE ESTA ROTA SUBSTITUI: até aqui, "esqueci a senha" com a recuperação
   * por email desligada (`RECUPERACAO_ATIVA=nao`, que é como o piloto roda) não
   * tinha saída nenhuma pelo produto. A saída praticada foi `UPDATE` na mão no
   * banco de produção, com o papel que ignora o RLS. Isso não deixa rastro, não
   * respeita posto, não derruba sessão, e coloca a mão de alguém no papel mais
   * poderoso do banco para resolver um chamado de rotina. A mensagem de recusa
   * de `/auth/recuperar` já mandava "procure quem administra o município", e
   * quem administra não tinha o botão.
   *
   * A SENHA VOLTA EM TEXTO NA RESPOSTA, UMA VEZ SÓ, e isso é deliberado: com o
   * email desligado, não existe outro canal para ela chegar em quem administra,
   * que vai ditá-la por telefone ou entregá-la em mãos. Ela não vai para o log
   * (só corpo de requisição é registrado, e a resposta não é), não fica gravada
   * em lugar nenhum em claro (o banco guarda só o hash scrypt) e a resposta sai
   * com `no-store` pelo hook global.
   *
   * O QUE FICOU FALTANDO, e é honesto dizer: a senha temporária deveria valer
   * UMA VEZ e obrigar a troca no primeiro acesso. Não dá para marcar isso hoje:
   * `usuarios` não tem coluna para "precisa trocar a senha" (ver migração 002),
   * e inventar coluna às pressas dentro desta frente, com outras migrações em
   * voo, é como se cria conflito de numeração e tabela sem RLS. Enquanto a
   * coluna não existir, a senha temporária é uma senha comum: quem recebe é
   * ORIENTADO a trocar em Minha conta, e nada o obriga. A pendência é uma
   * migração com `usuarios.trocar_senha_no_proximo_acesso boolean NOT NULL
   * DEFAULT false`, ligada aqui e conferida no login.
   *
   * QUEM NÃO PODE: a própria pessoa. Para trocar a própria senha existe
   * `/auth/trocar-senha`, que exige a senha atual. Se esta rota aceitasse o
   * próprio id, ela viraria o caminho de escalada mais barato que existe: uma
   * sessão esquecida aberta na recepção redefine a senha de quem administra sem
   * precisar saber a senha antiga.
   */
  app.post("/usuarios/:id/redefinir-senha", async (req, resposta) => {
    const quem = await autorizar(app, req, "gerenciar_usuarios");
    const { id } = idSchema.parse(req.params);

    if (id === quem.usuarioId) {
      throw new RegraDeNegocio(
        "autoredefinicao",
        "Para trocar a sua própria senha use Minha conta, onde a senha atual é " +
        "exigida. Esta tela redefine a senha de outra pessoa.",
        422,
      );
    }

    /*
      A derivação acontece ANTES da transação, igual à criação de usuário: são
      cerca de 128 MB e uma fração de segundo de scrypt, e fazer isso com a
      transação aberta prenderia a conexão (no Postgres em WebAssembly, o
      processo inteiro) pelo mesmo tempo.
    */
    const senhaTemporaria = gerarSenhaTemporaria();
    const hash = await derivarSenha(senhaTemporaria);

    const efeito = await banco.comTenant(quem.organizacaoId, async (c) => {
      /*
        A leitura é do município do token, e o RLS é quem impõe isso. Conta de
        outro município simplesmente não aparece, e a resposta é 404: um 403
        confirmaria que aquele id existe em algum lugar, que é metade do que um
        atacante quer descobrir.
      */
      const atual = await c.query<{ papel: Papel; nome: string; ativo: boolean }>(
        "SELECT papel, nome, ativo FROM usuarios WHERE id = $1",
        [id],
      );
      const alvo = atual.rows[0];
      if (!alvo) {
        throw new RegraDeNegocio("nao_encontrado", "Usuário não encontrado.", 404);
      }

      /*
        Posto, e este é o ponto onde a rota inteira seria uma escada: sem esta
        linha, um coordenador redefiniria a senha do administrador e entraria
        como ele um minuto depois.
      */
      exigirPostoParaGerir(quem.papel, alvo.papel);

      await c.query(
        `UPDATE usuarios
            SET senha_hash = $2, falhas_login = 0, bloqueado_ate = NULL
          WHERE id = $1`,
        [id, hash],
      );

      /*
        Derrubar as sessões é metade da redefinição, não um extra. O caso que
        importa é justamente aquele em que a senha está sendo redefinida porque
        alguém invadiu a conta: trocar a senha e deixar o token de renovação do
        invasor vivo devolve a conta para ele.
      */
      const encerradas = await encerrarSessoes(c, {
        usuarioId: id,
        motivo: "senha redefinida por quem administra",
      });

      /*
        Na trilha, e na mesma transação: ou a senha muda e o registro existe,
        ou nada acontece. `depois` NÃO leva a senha nem o hash, pela regra da
        migração 010: o que a investigação precisa é quem redefiniu a senha de
        quem, e quantas sessões caíram junto.
      */
      await registrarAtoAdministrativo(c, quem, {
        acao: "senha_redefinida",
        alvoTipo: "usuario",
        alvoId: id,
        alvoNome: alvo.nome,
        depois: { sessoesEncerradas: encerradas, ativo: alvo.ativo },
      });

      return { nome: alvo.nome, ativo: alvo.ativo, encerradas };
    });

    return resposta.code(200).send({
      senhaTemporaria,
      sessoesEncerradas: efeito.encerradas,
      mensagem:
        `Senha temporária de ${efeito.nome}. Ela aparece uma única vez: ` +
        "entregue em mãos ou dite por telefone, e peça a troca em Minha conta " +
        "na primeira entrada." +
        (efeito.ativo
          ? ""
          : " Atenção: esta conta está desativada e não entra enquanto assim estiver."),
    });
  });

  /**
   * Encerrar as sessões de outra pessoa, sem mexer na senha.
   *
   * É o botão para o caso mais comum de todos: o celular do agente sumiu na
   * área de risco, ou alguém foi desligado no meio do expediente. Redefinir a
   * senha resolveria junto, mas obriga a inventar uma credencial nova para
   * quem talvez volte a trabalhar em uma hora, e trocar a senha de quem não
   * perdeu a senha é ruído que ninguém entende depois.
   *
   * A SESSÃO ATUAL DO ALVO NÃO SOBREVIVE, e é o oposto da decisão tomada em
   * `/auth/encerrar-sessoes`: lá quem clica é o dono das sessões e preservar a
   * dele é o que torna o botão usável; aqui o objetivo declarado é expulsar
   * outra pessoa, e deixar uma sessão de pé seria não fazer o que o botão diz.
   *
   * Continua valendo a limitação anotada em `auth/sessoes.ts`: o token de
   * acesso já emitido vale até expirar, no máximo `ACESSO_MINUTOS`.
   */
  app.post("/usuarios/:id/encerrar-sessoes", async (req) => {
    const quem = await autorizar(app, req, "gerenciar_usuarios");
    const { id } = idSchema.parse(req.params);

    /*
      Igual à redefinição: esta rota é sobre outra pessoa. Quem quer sair de
      todos os aparelhos usa `/auth/encerrar-sessoes`, que preserva a sessão de
      onde clicou. Sem esta recusa, quem administra se desconectaria sozinho
      pelo botão errado e leria isso como falha do sistema.
    */
    if (id === quem.usuarioId) {
      throw new RegraDeNegocio(
        "autoencerramento",
        "Para encerrar as suas próprias sessões use Minha conta: lá a sessão " +
        "onde você está agora continua aberta.",
        422,
      );
    }

    return banco.comTenant(quem.organizacaoId, async (c) => {
      const atual = await c.query<{ papel: Papel; nome: string }>(
        "SELECT papel, nome FROM usuarios WHERE id = $1",
        [id],
      );
      const alvo = atual.rows[0];
      if (!alvo) {
        throw new RegraDeNegocio("nao_encontrado", "Usuário não encontrado.", 404);
      }
      exigirPostoParaGerir(quem.papel, alvo.papel);

      const encerradas = await encerrarSessoes(c, {
        usuarioId: id,
        motivo: "sessoes encerradas por quem administra",
      });

      await registrarAtoAdministrativo(c, quem, {
        acao: "sessoes_encerradas",
        alvoTipo: "usuario",
        alvoId: id,
        alvoNome: alvo.nome,
        depois: { sessoesEncerradas: encerradas },
      });

      return { id, sessoesEncerradas: encerradas };
    });
  });

  /**
   * A retenção de dado pessoal, que é decisão do MUNICÍPIO.
   *
   * O município é o controlador na acepção da Lei 13.709/2018: é ele que
   * decide por quanto tempo o dado fica, porque é a competência dele que
   * justifica o tratamento. O fornecedor entrega o mecanismo (a varredura da
   * migração 021) e nunca o número.
   *
   * Por isso a rota existe, e por isso ela não tem valor padrão: sem ela o
   * mecanismo estaria pronto e sem nenhuma forma de ser ligado, e a seção 4 da
   * política de privacidade descreveria uma retenção que ninguém consegue
   * configurar. Documento que promete o que o sistema não faz é pior que
   * documento nenhum.
   */
  app.get("/organizacao/retencao", async (req) => {
    const quem = await autorizar(app, req, "gerenciar_organizacao");
    return banco.comTenant(quem.organizacaoId, async (c) => {
      const r = await c.query<{
        nome: string;
        retencao_solicitante_dias: number | null;
        retencao_vulnerabilidade_dias: number | null;
      }>(
        `SELECT nome, retencao_solicitante_dias, retencao_vulnerabilidade_dias
           FROM organizacoes WHERE id = $1`,
        [quem.organizacaoId],
      );
      const linha = r.rows[0]!;
      return {
        nome: linha.nome,
        solicitanteDias: linha.retencao_solicitante_dias,
        vulnerabilidadeDias: linha.retencao_vulnerabilidade_dias,
      };
    });
  });

  app.patch("/organizacao/retencao", async (req) => {
    const quem = await autorizar(app, req, "gerenciar_organizacao");
    const dados = retencaoSchema.parse(req.body);

    return banco.comTenant(quem.organizacaoId, async (c) => {
      const antes = await c.query<{
        nome: string;
        retencao_solicitante_dias: number | null;
        retencao_vulnerabilidade_dias: number | null;
      }>(
        `SELECT nome, retencao_solicitante_dias, retencao_vulnerabilidade_dias
           FROM organizacoes WHERE id = $1`,
        [quem.organizacaoId],
      );
      const anterior = antes.rows[0]!;

      /*
        A checagem de ordem também vive no banco (migração 021), e aqui ela
        existe só para a mensagem: o CHECK do Postgres devolveria "violates
        check constraint", que não diz a quem preenche o formulário o que
        corrigir. A regra continua sendo a do banco; esta é a tradução.
      */
      if (
        dados.solicitanteDias !== null && dados.vulnerabilidadeDias !== null
        && dados.vulnerabilidadeDias > dados.solicitanteDias
      ) {
        throw new RegraDeNegocio(
          "vulnerabilidade_depois_do_nome",
          "O prazo da descrição de vulnerabilidade social não pode ser maior que o do "
          + "nome do solicitante: seria descartar o identificador comum e continuar "
          + "guardando o dado sensível.",
          422,
        );
      }

      await c.query(
        `UPDATE organizacoes
            SET retencao_solicitante_dias = $2,
                retencao_vulnerabilidade_dias = $3
          WHERE id = $1`,
        [quem.organizacaoId, dados.solicitanteDias, dados.vulnerabilidadeDias],
      );

      /*
        Mudar prazo de retenção é ato administrativo, e dos graves: encurtar
        um prazo destrói dado de cidadão que ainda estava dentro do anterior, e
        alongar mantém vivo o que já devia ter saído. Sem `antes` e `depois` na
        trilha, a pergunta "quem mandou apagar isso?" não tem resposta, e a
        varredura fica sendo o único suspeito de um descarte que alguém pediu.
      */
      await registrarAtoAdministrativo(c, quem, {
        acao: "retencao_alterada",
        alvoTipo: "organizacao",
        alvoId: quem.organizacaoId,
        alvoNome: anterior.nome,
        antes: {
          solicitanteDias: anterior.retencao_solicitante_dias,
          vulnerabilidadeDias: anterior.retencao_vulnerabilidade_dias,
        },
        depois: {
          solicitanteDias: dados.solicitanteDias,
          vulnerabilidadeDias: dados.vulnerabilidadeDias,
        },
      });

      return {
        solicitanteDias: dados.solicitanteDias,
        vulnerabilidadeDias: dados.vulnerabilidadeDias,
      };
    });
  });
}
