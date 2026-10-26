import type { FastifyInstance } from "fastify";
import type { DependenciasDasRotas } from "../servidor.js";

/**
 * As rotas do MUNICÍPIO DA SESSÃO (V2-F03-E16): a escolha do município no login
 * de quem tem conta em mais de um, e a troca de município com prova nova. VAZIO
 * na abertura da API da F03 (parte 1C): o módulo e o registro em `servidor.ts`
 * existem para a E16 não precisar mexer no servidor.
 *
 * Registrado SÓ em `/v1`, com prefixo `/`: quem escreve a rota põe o caminho
 * inteiro (`/auth/trocar-municipio`, por exemplo). Rota nova daqui entra em
 * `ROTAS_SO_NO_V1` (`versao-v1.ts`) e no grupo `municipio-da-sessao` do
 * contrato (`contrato/grupos/municipio-da-sessao.ts`), ou o teste de paridade
 * reprova.
 */
export async function rotasMunicipioDaSessao(
  _app: FastifyInstance,
  _dependencias: DependenciasDasRotas,
): Promise<void> {
  // Sem rota ainda. Ver o comentário do arquivo.
}
