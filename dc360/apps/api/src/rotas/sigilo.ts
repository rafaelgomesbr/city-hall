import type { FastifyInstance } from "fastify";
import type { DependenciasDasRotas } from "../servidor.js";

/**
 * As rotas do SIGILO da ocorrência (V2-F03-E21): marcar, levantar e consultar
 * quem pode ver uma ocorrência sigilosa. VAZIO na abertura da API da F03
 * (parte 1C): o módulo e o registro em `servidor.ts` existem para a E21 não
 * precisar mexer no servidor.
 *
 * Registrado SÓ em `/v1`, com prefixo `/`: quem escreve a rota põe o caminho
 * inteiro. Rota nova daqui entra em `ROTAS_SO_NO_V1` (`versao-v1.ts`) e no
 * grupo `sigilo` do contrato (`contrato/grupos/sigilo.ts`), ou o teste de
 * paridade reprova.
 */
export async function rotasSigilo(
  _app: FastifyInstance,
  _dependencias: DependenciasDasRotas,
): Promise<void> {
  // Sem rota ainda. Ver o comentário do arquivo.
}
