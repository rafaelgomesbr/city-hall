import { z } from "zod";
import { PAPEIS } from "@dc360/shared";
import { ERROS_AUTENTICADA } from "../comuns.js";
import { rota, type GrupoDoContrato } from "../tipos.js";

/**
 * Entrada e conta da pessoa: `rotas/autenticacao.ts` e `rotas/segundo-fator.ts`.
 * Parte 3C1 do lote 3.
 *
 * Em `pendentes`, as sete rotas de `/auth` cujo esquema de corpo mora dentro de
 * `rotas/autenticacao.ts` (`entradaSchema`, `segundoFatorSchema`,
 * `renovacaoSchema`, `saidaSchema`, `recuperacaoSchema`, `redefinicaoSchema`,
 * `trocaSchema`) e as três de `/segundo-fator` com esquema local. A 3C1 os
 * exporta, descreve a resposta e tira a rota da lista. As rotas públicas
 * (`SEM_TOKEN`) não levam `nao_autenticado` em `erros`.
 */
export const grupo: GrupoDoContrato = {
  nome: "autenticacao",
  rotas: [
    rota({
      metodo: "GET",
      caminho: "/v1/auth/recuperacao",
      resumo: "Diz se a recuperação de senha por email está ligada neste servidor (pública).",
      resposta: {
        status: 200,
        descricao: "Interruptor do servidor inteiro, igual para todos os municípios.",
        esquema: z.object({ ativa: z.boolean() }),
      },
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/auth/eu",
      resumo: "Quem sou eu, lido do token verificado.",
      resposta: {
        status: 200,
        descricao: "A identidade da sessão.",
        esquema: z.object({
          id: z.string().uuid(),
          nome: z.string(),
          papel: z.enum(PAPEIS),
          organizacaoId: z.string().uuid(),
        }),
      },
      erros: ERROS_AUTENTICADA,
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/auth/encerrar-sessoes",
      resumo: "Encerra as OUTRAS sessões da própria conta; a atual continua aberta.",
      resposta: {
        status: 200,
        descricao: "Quantas sessões foram encerradas e a frase para mostrar à pessoa.",
        esquema: z.object({ sessoesEncerradas: z.number().int().min(0), mensagem: z.string() }),
      },
      erros: ERROS_AUTENTICADA,
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/auth/sessoes",
      resumo: "Lista as sessões vivas da própria conta (sem IP e sem user-agent completo).",
      erros: ERROS_AUTENTICADA,
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/segundo-fator",
      resumo: "Lê a situação da verificação em duas etapas da própria conta.",
      erros: ERROS_AUTENTICADA,
    }),
  ],
  pendentes: [
    "POST /v1/auth/entrar",
    "POST /v1/auth/recuperar",
    "POST /v1/auth/redefinir",
    "POST /v1/auth/renovar",
    "POST /v1/auth/sair",
    "POST /v1/auth/segundo-fator",
    "POST /v1/auth/trocar-senha",
    "POST /v1/segundo-fator/confirmar",
    "POST /v1/segundo-fator/desativar",
    "POST /v1/segundo-fator/iniciar",
  ],
};
