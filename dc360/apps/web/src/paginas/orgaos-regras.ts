import { z } from "zod";
import type { DadosDoOrgao } from "../dados/repositorio";

/**
 * A conferência do catálogo de órgãos, fora da tela.
 *
 * ELA É UMA CÓPIA, E NÃO A AUTORIDADE. A regra de verdade mora em dois lugares
 * que o navegador não alcança: o esquema da rota (`apps/api/src/rotas/orgaos.ts`)
 * e as restrições da migração 017. Isto aqui existe para a pessoa saber que o
 * nome ficou curto antes de esperar a volta do servidor, e por isso a resposta
 * do servidor sempre vence na tela: o 422 chega com `campos` e é ele que é
 * desenhado sob cada campo.
 *
 * Enquanto não houver esquema de órgão no pacote compartilhado, esta
 * duplicação é dívida declarada, e não arquitetura. No dia em que as duas
 * divergirem, quem manda é o servidor, porque é ele que grava.
 */

export type FormularioDeOrgao = {
  nome: string;
  sigla: string;
  email: string;
  telefone: string;
};

export const FORMULARIO_VAZIO: FormularioDeOrgao = {
  nome: "", sigla: "", email: "", telefone: "",
};

const orgaoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do órgão").max(200),
  sigla: z.string().trim().max(20, "A sigla tem no máximo 20 caracteres"),
  /*
    O email é opcional, e a decisão é de operação e não de esquema: um órgão
    existe antes de alguém descobrir o endereço certo, e providência
    encaminhada por telefone continua sendo providência. Sem email o ofício é
    emitido e impresso normalmente; o que não acontece é o envio.
  */
  email: z.union([
    z.literal(""),
    z.string().trim().email("Informe um email válido").max(320),
  ]),
  telefone: z.string().trim().max(40, "O telefone tem no máximo 40 caracteres"),
});

export type Conferencia =
  | { ok: true; dados: DadosDoOrgao }
  | { ok: false; erros: Record<string, string> };

/**
 * O que o formulário manda para o servidor.
 *
 * CAMPO EM BRANCO VIRA AUSÊNCIA, e não string vazia. A rota trata `undefined`
 * como "não informado" e o banco guarda `NULL`. Mandar `""` gravaria um email
 * vazio que não é nulo, e a lista fechada de domínios do banco (o que impede o
 * painel de virar encaminhador de documento oficial para endereço qualquer)
 * passaria a ter uma entrada que não casa com endereço nenhum.
 */
export function conferirOrgao(formulario: FormularioDeOrgao): Conferencia {
  const resultado = orgaoSchema.safeParse(formulario);
  if (!resultado.success) {
    const erros: Record<string, string> = {};
    for (const problema of resultado.error.issues) {
      erros[String(problema.path[0] ?? "")] ??= problema.message;
    }
    return { ok: false, erros };
  }
  const d = resultado.data;
  return {
    ok: true,
    dados: {
      nome: d.nome,
      ...(d.sigla ? { sigla: d.sigla } : {}),
      // Em minúsculas porque o endereço é comparado com o domínio do catálogo,
      // e "Protocolo@Orgao.gov.br" e "protocolo@orgao.gov.br" são o mesmo
      // destino para todo mundo, menos para uma comparação de texto.
      ...(d.email ? { email: d.email.toLowerCase() } : {}),
      ...(d.telefone ? { telefone: d.telefone } : {}),
    },
  };
}

/*
  Quinze caracteres, a mesma régua do levantamento de interdição e a mesma da
  rota. "erro", "teste" e "nao" são o que aparece quando o campo aceita
  qualquer coisa, e nenhum deles responde à pergunta que alguém fará daqui a um
  ano: por que este órgão parou de receber ofício, e para onde foi a
  competência dele.
*/
const motivoSchema = z.string().trim()
  .min(15, "Explique por que este órgão sai da lista")
  .max(500, "O motivo tem no máximo 500 caracteres");

export function conferirMotivo(texto: string):
  | { ok: true; motivo: string }
  | { ok: false; erro: string } {
  const resultado = motivoSchema.safeParse(texto);
  if (!resultado.success) {
    return { ok: false, erro: resultado.error.issues[0]?.message ?? "Dados inválidos" };
  }
  return { ok: true, motivo: resultado.data };
}
