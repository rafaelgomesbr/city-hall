import { z } from "zod";
import type { CodigoDeErro } from "@dc360/shared";

/**
 * Pedaços de contrato que mais de um grupo usa.
 *
 * Só forma de caminho e listas de erro: esquema de negócio mora em
 * `@dc360/shared`, e esquema que o handler aplica por conta própria (dentro de
 * `rotas/*.ts`) NÃO é copiado para cá. Copiar criaria a segunda fonte da
 * verdade que esta etapa existe para evitar: a rota nessa situação fica em
 * `pendentes` do grupo até o esquema ser exportado.
 */

/** `:id` de caminho: o uuid de um registro. */
export const parametroId = z.object({ id: z.string().uuid() });

/** `/ocorrencias/:id/providencia/:providenciaId/...`. */
export const parametroIdEProvidencia = z.object({
  id: z.string().uuid(),
  providenciaId: z.string().uuid(),
});

/**
 * Os códigos que acompanham a forma da rota, para o grupo não repetir lista.
 *
 *   `ERROS_AUTENTICADA`  `app.exigirAutenticacao`: qualquer papel, sem
 *                        permissão de negócio.
 *   `ERROS_AUTORIZADA`   `autorizar(...)`: além do token, a permissão do papel.
 *
 * `dados_invalidos` (400) entra junto quando a rota aplica um esquema ao corpo,
 * à query ou ao caminho, e `nao_encontrada` (404) quando o registro do `:id`
 * pode não existir ou ser de outro município (que responde 404, nunca 403).
 */
export const ERROS_AUTENTICADA = ["nao_autenticado"] as const satisfies readonly CodigoDeErro[];
export const ERROS_AUTORIZADA = [
  "nao_autenticado",
  "sem_permissao",
] as const satisfies readonly CodigoDeErro[];
