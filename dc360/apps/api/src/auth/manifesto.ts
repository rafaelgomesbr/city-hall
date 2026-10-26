import type { FastifyRequest } from "fastify";
import type { Identidade } from "./autenticacao-da-requisicao.js";

/**
 * O ponto de extensão do manifesto de rota (V2-F03-E12), posto na abertura da
 * API da F03 (parte 1C).
 *
 * `criarAutenticacaoDaRequisicao` chama esta função em TODA requisição
 * autenticada, com a identidade já verificada. Hoje ela não confere nada e
 * deixa passar sempre: a E12 é quem escreve a regra (a rota declara ação,
 * ator, plateia e escopo, e quem não casa é recusado). Colocar o ponto agora,
 * e provar que ele é chamado, é o que impede a E12 de mexer na autenticação.
 *
 * Recusar é lançar o erro que a E12 escolher; devolver é deixar passar.
 */
export async function conferirManifesto(
  _req: FastifyRequest,
  _identidade: Identidade,
): Promise<void> {
  // Sem regra ainda. Ver o comentário do arquivo.
}
