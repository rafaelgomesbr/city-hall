import { z } from "zod";
import {
  cadastroEquipeSchema,
  cadastroUsuarioSchema,
  edicaoUsuarioSchema,
  PAPEIS,
} from "@dc360/shared";
import { retencaoSchema, situacaoSchema } from "../../rotas/administracao.js";
import { ERROS_AUTENTICADA, ERROS_AUTORIZADA, parametroId } from "../comuns.js";
import { rota, type GrupoDoContrato } from "../tipos.js";

/**
 * A administração do município: equipes, usuários e retenção
 * (`rotas/administracao.ts`). Parte 3C1 do lote 3.
 *
 * Os esquemas de ENTRADA são os que o handler aplica (o `retencaoSchema` e o
 * `situacaoSchema` foram exportados da rota). Os de RESPOSTA moram aqui, fiéis
 * ao que o handler devolve, e `test/contrato-conta-administracao-respostas.test.ts`
 * confere uma resposta real, por `inject`, contra cada um.
 *
 * As listas de `erros` seguem o handler: `autorizar(...)` (token e permissão),
 * `exigirPostoParaGerir` (`posto_insuficiente`: conta de posto acima do seu) e
 * as `RegraDeNegocio` de cada rota. Conta de outro município responde 404, nunca
 * 403.
 */

/** Uma linha de `GET /equipes`; `em_atendimento` é o nome da coluna, em snake. */
const equipeListadaSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  especialidade: z.string().nullable(),
  ativa: z.boolean(),
  em_atendimento: z.number().int().min(0),
});

/** Uma linha de `GET /usuarios`; a senha nunca sai, nem para quem administra. */
const usuarioListadoSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  matricula: z.string(),
  email: z.string(),
  papel: z.enum(PAPEIS),
  equipe_id: z.string().uuid().nullable(),
  ativo: z.boolean(),
  ultimo_acesso: z.string().nullable(),
  equipe_nome: z.string().nullable(),
});

const soIdSchema = z.object({ id: z.string().uuid() });

/** Vale para `GET` e `PATCH` de `/organizacao/retencao`: nulo é valor (ainda não decidiu). */
const diasDeRetencaoSchema = z.object({
  solicitanteDias: z.number().int().nullable(),
  vulnerabilidadeDias: z.number().int().nullable(),
});

export const grupo: GrupoDoContrato = {
  nome: "administracao",
  rotas: [
    rota({
      metodo: "GET",
      caminho: "/v1/equipes",
      resumo: "Lista as equipes do município.",
      resposta: {
        status: 200,
        descricao:
          "As equipes por nome, com quantas ocorrências em atendimento cada uma tem (campo " +
          "`em_atendimento`, igual à coluna).",
        esquema: z.object({ itens: z.array(equipeListadaSchema) }),
      },
      erros: ERROS_AUTENTICADA,
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/equipes",
      resumo: "Cadastra uma equipe.",
      corpo: cadastroEquipeSchema,
      resposta: {
        status: 201,
        descricao: "O identificador da equipe criada.",
        esquema: soIdSchema,
      },
      erros: [...ERROS_AUTORIZADA, "dados_invalidos", "nome_repetido"],
    }),
    rota({
      metodo: "PATCH",
      caminho: "/v1/equipes/:id",
      resumo: "Edita uma equipe (equipe se desativa em vez de sumir).",
      parametros: parametroId,
      corpo: cadastroEquipeSchema,
      resposta: {
        status: 200,
        descricao: "O identificador da equipe editada.",
        esquema: soIdSchema,
      },
      erros: [...ERROS_AUTORIZADA, "dados_invalidos", "nao_encontrada", "nome_repetido"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/usuarios",
      resumo: "Lista os usuários do município.",
      resposta: {
        status: 200,
        descricao:
          "Os usuários por nome, com a equipe e o último acesso; os campos têm o nome da " +
          "coluna, em snake. Senha e hash nunca saem.",
        esquema: z.object({ itens: z.array(usuarioListadoSchema) }),
      },
      erros: ERROS_AUTORIZADA,
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/usuarios",
      resumo: "Cadastra um usuário com senha inicial.",
      corpo: cadastroUsuarioSchema,
      resposta: {
        status: 201,
        descricao: "O identificador do usuário criado.",
        esquema: soIdSchema,
      },
      erros: [...ERROS_AUTORIZADA, "dados_invalidos", "posto_insuficiente", "usuario_repetido"],
    }),
    rota({
      metodo: "PATCH",
      caminho: "/v1/usuarios/:id",
      resumo: "Edita o cadastro de um usuário, sem tocar na senha.",
      parametros: parametroId,
      corpo: edicaoUsuarioSchema,
      resposta: {
        status: 200,
        descricao: "O identificador do usuário editado.",
        esquema: soIdSchema,
      },
      erros: [
        ...ERROS_AUTORIZADA,
        "dados_invalidos",
        "posto_insuficiente",
        "nao_encontrado",
        "email_so_por_administrador",
        "ultimo_administrador",
        "usuario_repetido",
        "papel_nao_se_converte",
      ],
    }),
    rota({
      metodo: "PATCH",
      caminho: "/v1/usuarios/:id/situacao",
      resumo:
        "Desativa ou reativa um usuário (usuário não se apaga); desativar derruba as sessões.",
      parametros: parametroId,
      corpo: situacaoSchema,
      resposta: {
        status: 200,
        descricao: "O identificador e a situação em que a conta ficou.",
        esquema: z.object({ id: z.string().uuid(), ativo: z.boolean() }),
      },
      erros: [
        ...ERROS_AUTORIZADA,
        "dados_invalidos",
        "autodesativacao",
        "nao_encontrado",
        "posto_insuficiente",
        "ultimo_administrador",
      ],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/usuarios/:id/redefinir-senha",
      resumo:
        "Redefine a senha de OUTRO usuário e derruba as sessões dele (a própria conta não passa por aqui).",
      parametros: parametroId,
      resposta: {
        status: 200,
        descricao:
          "A senha temporária em texto, UMA vez (vale 72 horas e a primeira entrada exige " +
          "trocá-la), quantas sessões caíram e a frase para mostrar a quem administra.",
        esquema: z.object({
          senhaTemporaria: z.string(),
          sessoesEncerradas: z.number().int().min(0),
          mensagem: z.string(),
        }),
      },
      erros: [
        ...ERROS_AUTORIZADA,
        "dados_invalidos",
        "autoredefinicao",
        "nao_encontrado",
        "posto_insuficiente",
      ],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/usuarios/:id/encerrar-sessoes",
      resumo: "Encerra todas as sessões de OUTRO usuário.",
      parametros: parametroId,
      resposta: {
        status: 200,
        descricao: "O identificador da conta e quantas sessões foram encerradas.",
        esquema: z.object({ id: z.string().uuid(), sessoesEncerradas: z.number().int().min(0) }),
      },
      erros: [
        ...ERROS_AUTORIZADA,
        "dados_invalidos",
        "autoencerramento",
        "nao_encontrado",
        "posto_insuficiente",
      ],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/usuarios/:id/sessoes",
      resumo: "Lista as sessões vivas de OUTRO usuário do município.",
      parametros: parametroId,
      resposta: {
        status: 200,
        descricao:
          "Só a quantidade e as datas (sem IP e sem aparelho, por privacidade); a data é " +
          "nula quando não há sessão aberta.",
        esquema: z.object({
          id: z.string().uuid(),
          sessoesAbertas: z.number().int().min(0),
          ultimaEntradaEm: z.string().nullable(),
          validaAte: z.string().nullable(),
        }),
      },
      erros: [...ERROS_AUTORIZADA, "dados_invalidos", "nao_encontrado", "posto_insuficiente"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/organizacao/retencao",
      resumo: "Lê o prazo de retenção do município (nulo é valor: ainda não decidiu).",
      resposta: {
        status: 200,
        descricao: "O nome do município e os dois prazos em dias (nulos quando não decidiu).",
        esquema: diasDeRetencaoSchema.extend({ nome: z.string() }),
      },
      erros: ERROS_AUTORIZADA,
    }),
    rota({
      metodo: "PATCH",
      caminho: "/v1/organizacao/retencao",
      resumo: "Grava o prazo de retenção do município; a mudança vai para a trilha.",
      corpo: retencaoSchema,
      resposta: {
        status: 200,
        descricao: "Os dois prazos em dias, como ficaram (nulo é valor: ainda não decidiu).",
        esquema: diasDeRetencaoSchema,
      },
      erros: [...ERROS_AUTORIZADA, "dados_invalidos", "vulnerabilidade_depois_do_nome"],
    }),
  ],
  pendentes: [],
};
