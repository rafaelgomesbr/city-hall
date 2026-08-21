/**
 * Geração de CSV para exportação.
 *
 * Existe aqui, e não numa linha solta de `join(",")`, por causa de uma
 * armadilha específica de planilha: uma célula que começa com `=`, `+`, `-`,
 * `@`, tabulação ou retorno de carro é interpretada como FÓRMULA pelo Excel e
 * pelo LibreOffice ao abrir o arquivo.
 *
 * Num sistema onde o texto vem do relato de um cidadão pelo telefone, isso é
 * caminho direto para execução de comando na máquina de quem abriu a planilha:
 * basta alguém ditar um endereço que comece com `=`. O servidor público que
 * baixa o relatório é a vítima, e ele nunca vai suspeitar do arquivo que a
 * própria prefeitura gerou.
 *
 * A defesa é prefixar a célula com apóstrofo, que a planilha entende como
 * "isto é texto" e não mostra ao usuário.
 */

const INICIO_PERIGOSO = /^[=+\-@\t\r]/;

export function celulaCsv(valor: unknown): string {
  if (valor === null || valor === undefined) return "";

  let texto = String(valor);

  if (INICIO_PERIGOSO.test(texto)) {
    texto = `'${texto}`;
  }

  // Aspas duplas dentro do campo são escapadas duplicando-as, conforme RFC 4180.
  if (/[",;\n\r]/.test(texto)) {
    texto = `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

export type OpcoesCsv = {
  /**
   * Separador. Ponto e vírgula por padrão: é o que o Excel em português
   * espera, e vírgula quebraria a planilha do servidor público que abre o
   * arquivo com dois cliques.
   */
  separador?: string;
  /**
   * Marca de ordem de bytes. Sem ela, o Excel abre acento como caractere
   * quebrado, e "Acácias" vira "AcÃ¡cias" no relatório que vai para o prefeito.
   */
  comBom?: boolean;
};

export function montarCsv(
  cabecalho: readonly string[],
  linhas: ReadonlyArray<readonly unknown[]>,
  opcoes: OpcoesCsv = {},
): string {
  const { separador = ";", comBom = true } = opcoes;
  const corpo = [cabecalho, ...linhas]
    .map((linha) => linha.map(celulaCsv).join(separador))
    // CRLF conforme RFC 4180: é o que o Excel espera.
    .join("\r\n");
  return (comBom ? "\uFEFF" : "") + corpo + "\r\n";
}
