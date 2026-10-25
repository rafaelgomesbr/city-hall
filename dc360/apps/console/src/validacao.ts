import { mensagensDoZodEmPortugues } from "@dc360/shared";
import type { z } from "zod";

/**
 * A validação de entrada do console, com as mensagens em português (DV-38).
 *
 * Até a V2-F02-E02 o console não importava nada de `@dc360/shared`, então o mapa
 * de mensagens do Zod nunca era instalado nele e um campo ausente respondia
 * "Invalid input: expected string, received undefined". Quem opera o console
 * lê a frase que a tela mostra; ela precisa estar no idioma do produto.
 *
 * O mapa é instalado de DUAS formas, de propósito:
 *
 *   1. Pelo `import` de `@dc360/shared` (o pacote o instala no Zod global ao
 *      carregar), o que cobre os esquemas de `cadastro.ts` e qualquer
 *      `safeParse` que alguém escreva sem lembrar deste arquivo.
 *   2. Por pedido, em cada `validar`: se o `zod` do console e o do pacote
 *      algum dia forem duas cópias, a configuração global de uma não vale para
 *      a outra, e esta passagem explícita continua valendo.
 *
 * A frase que uma regra do próprio esquema escreveu ("Informe a sua senha")
 * continua vencendo o mapa: o mapa só fala quando a regra não disse nada.
 */
export function validar<T extends z.ZodType>(
  esquema: T,
  valor: unknown,
): z.ZodSafeParseResult<z.output<T>> {
  return esquema.safeParse(valor, { error: mensagensDoZodEmPortugues });
}

/** O campo recusado e o que há de errado nele, no formato do 422 da API. */
export type CampoRecusado = { campo: string; mensagem: string };

/** O corpo de um 400 de validação do console: `{ erro, mensagem, campos }`. */
export type RecusaDePedido = {
  erro: "pedido_invalido";
  mensagem: string;
  campos: CampoRecusado[];
};

/**
 * A resposta 400 de um pedido que não passou no esquema.
 *
 * `erro` e `mensagem` são os de sempre (a tela lê `mensagem`, e o status e o
 * código não mudam: o aplicativo e a página já em uso dependem deles). `campos`
 * é aditivo: a mesma lista `{ campo, mensagem }` do 422 da API, com o caminho
 * pontuado, para quem quiser apontar o campo em vez de só mostrar a frase.
 */
export function recusaDePedido(erro: z.ZodError, padrao: string): RecusaDePedido {
  return {
    erro: "pedido_invalido",
    mensagem: erro.issues[0]?.message ?? padrao,
    campos: erro.issues.map((i) => ({ campo: i.path.join("."), mensagem: i.message })),
  };
}
