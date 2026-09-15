import type { FastifyInstance } from "fastify";
import type { Banco } from "../banco/tipos.js";
import { autorizar } from "../servidor.js";
import { lerUso, resumirUso } from "../armazenamento/uso.js";

/**
 * O que o município enxerga do próprio armazenamento.
 *
 * Existe uma rota para isto porque, sem ela, a única forma de o município saber
 * que o balde está enchendo seria a fotografia começar a ser recusada, ou seja,
 * ele descobriria pelo sintoma mais caro possível, com um agente na rua.
 *
 * O que ela NÃO faz é deixar mudar o número. O teto é do contrato, o gatilho da
 * migração 035 recusa a escrita pelo papel de aplicação, e não existe rota de
 * escrita aqui para tentar: quem amplia é o operador da plataforma, pela linha
 * de comando, como quem provisiona município.
 */
export async function rotasArmazenamento(
  app: FastifyInstance,
  { banco }: { banco: Banco },
): Promise<void> {
  /*
    `gerenciar_organizacao`, ou seja, o administrador.

    Ele é o teto do município (ADR 0006) e é quem fala com a plataforma quando o
    número precisa mudar. Não é dado de cidadão, é dado de contrato, e a régua
    aqui é a mesma de "alterar os dados do município".
  */
  app.get("/uso", async (req) => {
    const quem = await autorizar(app, req, "gerenciar_organizacao");
    const uso = await banco.comTenant(quem.organizacaoId, (c) => lerUso(c));
    return resumirUso(uso);
  });
}
