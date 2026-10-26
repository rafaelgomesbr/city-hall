import { cadastroEquipeSchema, cadastroUsuarioSchema, edicaoUsuarioSchema } from "@dc360/shared";
import { ERROS_AUTENTICADA, ERROS_AUTORIZADA, parametroId } from "../comuns.js";
import { rota, type GrupoDoContrato } from "../tipos.js";

/**
 * A administração do município: equipes, usuários e retenção
 * (`rotas/administracao.ts`). Parte 3C1 do lote 3.
 *
 * Em `pendentes`, as duas rotas cujo esquema de corpo mora dentro do arquivo
 * da rota (`retencaoSchema` e o `{ ativo }` da situação do usuário). A 3C1 os
 * exporta e tira a rota da lista.
 */
export const grupo: GrupoDoContrato = {
  nome: "administracao",
  rotas: [
    rota({
      metodo: "GET",
      caminho: "/v1/equipes",
      resumo: "Lista as equipes do município.",
      erros: ERROS_AUTENTICADA,
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/equipes",
      resumo: "Cadastra uma equipe.",
      corpo: cadastroEquipeSchema,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "PATCH",
      caminho: "/v1/equipes/:id",
      resumo: "Edita uma equipe (equipe se desativa em vez de sumir).",
      parametros: parametroId,
      corpo: cadastroEquipeSchema,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/usuarios",
      resumo: "Lista os usuários do município.",
      erros: ERROS_AUTORIZADA,
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/usuarios",
      resumo: "Cadastra um usuário com senha inicial.",
      corpo: cadastroUsuarioSchema,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "PATCH",
      caminho: "/v1/usuarios/:id",
      resumo: "Edita o cadastro de um usuário, sem tocar na senha.",
      parametros: parametroId,
      corpo: edicaoUsuarioSchema,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/usuarios/:id/redefinir-senha",
      resumo:
        "Redefine a senha de OUTRO usuário e derruba as sessões dele (a própria conta não passa por aqui).",
      parametros: parametroId,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/usuarios/:id/encerrar-sessoes",
      resumo: "Encerra todas as sessões de OUTRO usuário.",
      parametros: parametroId,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/usuarios/:id/sessoes",
      resumo: "Lista as sessões vivas de OUTRO usuário do município.",
      parametros: parametroId,
      erros: [...ERROS_AUTORIZADA, "dados_invalidos"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/organizacao/retencao",
      resumo: "Lê o prazo de retenção do município (nulo é valor: ainda não decidiu).",
      erros: ERROS_AUTORIZADA,
    }),
  ],
  pendentes: ["PATCH /v1/usuarios/:id/situacao", "PATCH /v1/organizacao/retencao"],
};
