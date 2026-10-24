import type { ReportadorDeErros } from "./reportador.js";

/**
 * O último recurso: erro que escapou de toda rota e de toda rotina (V2-F01-E14).
 *
 * Sem estes ouvintes o Node já derruba o processo e escreve a pilha na saída de
 * erro, fora do formato estruturado do log. Com eles o erro passa pelo mesmo
 * reportador de tudo o mais, e DEPOIS o processo sai com código 1, que é
 * exatamente o que o Node faria: o Fly reinicia a máquina e nada muda no
 * comportamento de quem opera. Segurar o processo vivo depois de uma exceção
 * não tratada seria deixá-lo em estado desconhecido.
 */
export function instalarCapturaDeProcesso(
  reportador: ReportadorDeErros,
  {
    alvo = process,
    sair = (codigo: number) => process.exit(codigo),
  }: {
    alvo?: Pick<NodeJS.Process, "on">;
    sair?: (codigo: number) => void;
  } = {},
): void {
  alvo.on("uncaughtException", (erro: unknown) => {
    reportador.reportar(erro, { origem: "processo" });
    sair(1);
  });
  alvo.on("unhandledRejection", (motivo: unknown) => {
    reportador.reportar(motivo, { origem: "processo" });
    sair(1);
  });
}
