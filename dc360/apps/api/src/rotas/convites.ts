import type { FastifyInstance } from "fastify";
import type { DependenciasDasRotas } from "../servidor.js";

/**
 * As rotas do CONVITE de conta (V2-F03-E10): reemissão, cancelamento e o que
 * mais a etapa definir. VAZIO na abertura da API da F03 (parte 1C): o módulo e
 * o registro em `servidor.ts` existem para a E10 não precisar mexer no
 * servidor.
 *
 * Registrado SÓ em `/v1`, com prefixo `/`: quem escreve a rota põe o caminho
 * inteiro (`/convites/...`), como `rotas/administracao.ts` faz. Rota nova daqui
 * entra em `ROTAS_SO_NO_V1` (`versao-v1.ts`) e no grupo `convites` do contrato
 * (`contrato/grupos/convites.ts`), ou o teste de paridade reprova.
 */
export async function rotasConvites(
  _app: FastifyInstance,
  _dependencias: DependenciasDasRotas,
): Promise<void> {
  // Sem rota ainda. Ver o comentário do arquivo.
}
