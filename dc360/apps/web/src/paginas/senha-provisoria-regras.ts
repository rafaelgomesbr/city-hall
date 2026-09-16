import { senhaSchema } from "@dc360/shared";
import type { ResultadoDeEntrada, Sessao } from "../dados/tipos";

/**
 * A senha provisória, na tela de entrada, fora do React.
 *
 * Quem entra com a senha sorteada por quem administra (ou a inicial do
 * console) recebe sessão, mas uma sessão que só abre a troca de senha: o
 * servidor responde 403 `troca_de_senha_obrigatoria` a tudo o mais (migração
 * 046). A tela de entrada NÃO pode seguir para o painel nesse caso, senão a
 * primeira coisa que a pessoa vê é uma tela inteira de erros 403 sem saber por
 * quê. Ela pede a senha nova ali mesmo, com a provisória ainda na mão, e só
 * então segue. É o mesmo desenho da ativação obrigatória do segundo fator.
 */

export type PassoDepoisDeEntrar =
  | { passo: "seguir"; sessao: Sessao }
  | { passo: "definir-senha"; sessao: Sessao }
  | { passo: "segundo-fator" };

/** O que a tela faz com o resultado da entrada (senha, ou segundo fator). */
export function passoDepoisDeEntrar(resultado: ResultadoDeEntrada): PassoDepoisDeEntrar {
  if (resultado.tipo === "segundo-fator") return { passo: "segundo-fator" };
  if (resultado.trocaDeSenhaObrigatoria) return { passo: "definir-senha", sessao: resultado.sessao };
  return { passo: "seguir", sessao: resultado.sessao };
}

/**
 * Confere o formulário da senha nova antes de gastar uma ida ao servidor.
 *
 * A mesma régua de `MinhaConta` e do servidor (`senhaSchema`, 12 caracteres):
 * regra que só existisse aqui não existiria. A confirmação é da tela, porque
 * o servidor não tem como saber se a pessoa digitou o que queria.
 */
export function conferirSenhaNova(
  dados: { atual: string; nova: string; repetida: string },
): { ok: true } | { ok: false; erros: Record<string, string> } {
  const erros: Record<string, string> = {};
  if (!dados.atual) erros["atual"] = "Informe a senha provisória que você recebeu";
  const nova = senhaSchema.safeParse(dados.nova);
  if (!nova.success) erros["nova"] = nova.error.issues[0]?.message ?? "Senha inválida";
  else if (dados.nova === dados.atual) erros["nova"] = "A senha nova precisa ser diferente da provisória";
  if (dados.repetida !== dados.nova) erros["repetida"] = "As duas senhas não são iguais";
  return Object.keys(erros).length > 0 ? { ok: false, erros } : { ok: true };
}
