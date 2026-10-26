import { z } from "zod";
import { PAPEIS } from "@dc360/shared";
import {
  entradaSchema,
  recuperacaoSchema,
  redefinicaoSchema,
  renovacaoSchema,
  saidaSchema,
  segundoFatorSchema as segundaEtapaSchema,
  trocaSchema,
} from "../../rotas/autenticacao.js";
import { codigoSchema, desativacaoSchema, inicioSchema } from "../../rotas/segundo-fator.js";
import { ERROS_AUTENTICADA } from "../comuns.js";
import { rota, type GrupoDoContrato } from "../tipos.js";

/**
 * Entrada e conta da pessoa: `rotas/autenticacao.ts` e `rotas/segundo-fator.ts`.
 * Parte 3C1 do lote 3.
 *
 * Os esquemas de ENTRADA são os que os handlers aplicam (exportados das
 * rotas). Os esquemas de RESPOSTA moram aqui, neste grupo, porque nenhuma
 * dessas respostas tem esquema no pacote compartilhado: cada um é fiel ao que
 * o handler devolve (`auth/servico.ts` e `auth/segundo-fator.ts`) e um teste
 * (`test/contrato-auth-respostas.test.ts`) confere uma resposta real, por
 * `inject`, contra o esquema. As rotas públicas (`SEM_TOKEN`) não levam
 * `nao_autenticado` em `erros`.
 */

const mensagemSchema = z.object({ mensagem: z.string() });

/**
 * A sessão que `entrar`, a segunda etapa e a ativação obrigatória devolvem
 * (`Autenticado`, em `auth/servico.ts`). `expiraEm` é a VALIDADE do token de
 * acesso em segundos (não um instante).
 */
const sessaoSchema = z.object({
  acesso: z.string(),
  renovacao: z.string(),
  expiraEm: z.number().int().positive(),
  usuario: z.object({
    id: z.string().uuid(),
    nome: z.string(),
    matricula: z.string(),
    papel: z.enum(PAPEIS),
    organizacaoId: z.string().uuid(),
    organizacaoNome: z.string(),
    municipio: z.string(),
    uf: z.string(),
  }),
  /** Só na segunda etapa do login. */
  codigosDeRecuperacaoRestantes: z.number().int().min(0).optional(),
  /** Só na segunda etapa do login. */
  entrouComCodigoDeRecuperacao: z.boolean().optional(),
  /** Só presente (e verdadeiro) quando a sessão nasceu de uma senha provisória. */
  trocaDeSenhaObrigatoria: z.literal(true).optional(),
});

/** A senha conferiu e a sessão NÃO nasceu: falta a segunda etapa (`DesafioDeEntrada`). */
const desafioSchema = z.object({
  segundoFator: z.enum(["codigo", "ativacao"]),
  desafio: z.string(),
  expiraEm: z.number().int().positive(),
  mensagem: z.string(),
});

const sessaoDaContaSchema = z.object({
  entrouEm: z.string(),
  validaAte: z.string(),
  aparelho: z.string(),
  atual: z.boolean(),
});

/** `SituacaoSegundoFator`, em `auth/segundo-fator.ts`. */
const situacaoDoSegundoFatorSchema = z.object({
  ativo: z.boolean(),
  pendente: z.boolean(),
  exigido: z.boolean(),
  codigosRestantes: z.number().int().min(0),
  disponivel: z.boolean(),
});

/** Rotas atrás do limite por endereço (`limiteLogin`): 429 do limitador. */
const COM_LIMITE_DE_ENTRADA = ["excesso_de_requisicoes"] as const;

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
      resposta: {
        status: 200,
        descricao:
          "As sessões vivas da conta; `atual` marca a de onde o pedido veio e `aparelho` é " +
          "navegador e sistema em uma frase.",
        esquema: z.object({ itens: z.array(sessaoDaContaSchema) }),
      },
      erros: ERROS_AUTENTICADA,
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/auth/entrar",
      resumo: "Entra com email e senha (pública); a segunda etapa pode ser exigida.",
      corpo: entradaSchema,
      resposta: {
        status: 200,
        descricao:
          "A sessão (par de tokens e identidade) OU, quando a conta exige verificação em duas " +
          "etapas, um desafio de propósito único que só abre a segunda etapa ou a ativação.",
        esquema: z.union([sessaoSchema, desafioSchema]),
      },
      erros: [
        ...COM_LIMITE_DE_ENTRADA,
        "dados_invalidos",
        "credenciais",
        "senha_provisoria_vencida",
        "acesso_suspenso",
      ],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/auth/segundo-fator",
      resumo:
        "Segunda etapa do login: o código de seis dígitos ou um código de recuperação (pública).",
      corpo: segundaEtapaSchema,
      resposta: {
        status: 200,
        descricao:
          "A sessão, com quantos códigos de recuperação restam e se esta entrada gastou um.",
        esquema: sessaoSchema,
      },
      erros: [
        ...COM_LIMITE_DE_ENTRADA,
        "dados_invalidos",
        "sessao_encerrada",
        "credenciais",
        "bloqueado",
        "acesso_suspenso",
      ],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/auth/renovar",
      resumo: "Troca o token de renovação por um par novo; o usado é revogado (pública).",
      corpo: renovacaoSchema,
      resposta: {
        status: 200,
        descricao: "A sessão com o par de tokens novo.",
        esquema: sessaoSchema,
      },
      erros: [
        ...COM_LIMITE_DE_ENTRADA,
        "dados_invalidos",
        "sessao_encerrada",
        "conta_desativada",
        "acesso_suspenso",
      ],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/auth/sair",
      resumo:
        "Encerra a sessão (pública); com a ficha do aparelho, cala também a notificação dele.",
      corpo: saidaSchema,
      resposta: {
        status: 204,
        descricao: "Sem corpo, mesmo quando o token não existe (a rota não é oráculo de token).",
      },
      erros: ["dados_invalidos"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/auth/recuperar",
      resumo: "Pede o link de redefinição de senha por email (pública).",
      corpo: recuperacaoSchema,
      resposta: {
        status: 202,
        descricao: "A mesma frase exista a conta ou não: a rota não revela quais emails existem.",
        esquema: mensagemSchema,
      },
      erros: [...COM_LIMITE_DE_ENTRADA, "dados_invalidos", "recuperacao_desligada"],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/auth/redefinir",
      resumo: "Redefine a senha com o token do link; nenhuma sessão nasce daqui (pública).",
      corpo: redefinicaoSchema,
      resposta: {
        status: 200,
        descricao: "A frase de confirmação; quem redefiniu entra de novo com a senha nova.",
        esquema: mensagemSchema,
      },
      erros: [
        ...COM_LIMITE_DE_ENTRADA,
        "dados_invalidos",
        "recuperacao_desligada",
        "sessao_encerrada",
      ],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/auth/trocar-senha",
      resumo: "Troca a própria senha, exigindo a atual, e encerra as outras sessões.",
      corpo: trocaSchema,
      resposta: {
        status: 200,
        descricao:
          "A frase de confirmação e o token de acesso NOVO da mesma sessão (solta quem entrou " +
          "com senha provisória); `expiraEm` é a validade dele em segundos.",
        esquema: z.object({
          mensagem: z.string(),
          acesso: z.string(),
          expiraEm: z.number().int().positive(),
        }),
      },
      erros: [...ERROS_AUTENTICADA, "dados_invalidos", "credenciais", "sessao_encerrada"],
    }),
    rota({
      metodo: "GET",
      caminho: "/v1/segundo-fator",
      resumo: "Lê a situação da verificação em duas etapas da própria conta.",
      resposta: {
        status: 200,
        descricao:
          "Ligada, pendente de confirmação, exigida pelo município, quantos códigos de " +
          "recuperação restam e se o recurso está ligado neste servidor.",
        esquema: situacaoDoSegundoFatorSchema,
      },
      erros: ERROS_AUTENTICADA,
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/segundo-fator/iniciar",
      resumo:
        "Começa a ativação: sorteia o segredo e devolve o que cadastrar no aplicativo (uma vez).",
      /* O handler lê `req.body ?? {}`: sem corpo é o mesmo que `{}`. */
      corpo: inicioSchema.optional(),
      resposta: {
        status: 200,
        descricao:
          "O segredo em texto e o endereço `otpauth` do código QR; o banco só guarda a versão " +
          "cifrada, então eles não voltam.",
        esquema: z.object({ segredo: z.string(), uri: z.string(), mensagem: z.string() }),
      },
      erros: [
        ...ERROS_AUTENTICADA,
        "dados_invalidos",
        "conta_nao_encontrada",
        "segundo_fator_desligado",
        "segundo_fator_ja_ativo",
      ],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/segundo-fator/confirmar",
      resumo: "Confirma a ativação com um código de verdade e SÓ ENTÃO liga o recurso.",
      corpo: codigoSchema,
      resposta: {
        status: 200,
        descricao:
          "Os códigos de recuperação (aparecem uma única vez) e, só quando o pedido veio por " +
          "desafio de ativação (quem ainda não tem sessão), a sessão que nasce aqui.",
        esquema: z.object({
          codigosDeRecuperacao: z.array(z.string()),
          sessao: sessaoSchema.optional(),
          mensagem: z.string(),
        }),
      },
      erros: [
        ...ERROS_AUTENTICADA,
        "dados_invalidos",
        "segundo_fator_desligado",
        "ativacao_nao_iniciada",
        "segundo_fator_ja_ativo",
        "codigo_invalido",
        "segundo_fator_ilegivel",
      ],
    }),
    rota({
      metodo: "POST",
      caminho: "/v1/segundo-fator/desativar",
      resumo: "Desliga a verificação em duas etapas, exigindo a senha atual.",
      corpo: desativacaoSchema,
      resposta: {
        status: 200,
        descricao: "A frase de confirmação; os códigos de recuperação antigos deixam de valer.",
        esquema: mensagemSchema,
      },
      erros: [
        ...ERROS_AUTENTICADA,
        "dados_invalidos",
        "segundo_fator_desligado",
        "senha_nao_confere",
        "segundo_fator_nao_esta_ativo",
      ],
    }),
  ],
  pendentes: [],
};
