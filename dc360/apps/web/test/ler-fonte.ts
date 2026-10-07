import { readFileSync } from "node:fs";

/**
 * Lê fonte do disco para teste que confere a fonte, sem depender do fim de
 * linha da máquina.
 *
 * Existe pela V2-F00-E21. `ocorrencia-encerramento.test.ts` procurava "\n}\n"
 * no texto lido e, numa árvore CRLF (o checkout do Windows com
 * `core.autocrlf`), não achava nunca: o `indexOf` devolvia -1, o recorte ia até
 * o fim do arquivo e o teste reprovava por um motivo que não era o código. O
 * `.gitattributes` da raiz já fixa LF no checkout, mas árvore clonada antes dele
 * continua CRLF até alguém renormalizar, e teste não pode depender disso.
 *
 * Só `\r\n` vira `\n`. CR solto não é fim de linha de fonte nenhuma deste
 * repositório, e trocá-lo esconderia um arquivo corrompido.
 */
export function normalizarFimDeLinha(texto: string): string {
  return texto.replace(/\r\n/g, "\n");
}

export function lerFonte(caminho: string): string {
  return normalizarFimDeLinha(readFileSync(caminho, "utf8"));
}

/**
 * Recorta uma função de nível superior, da assinatura até a chave que a fecha
 * na coluna zero (a convenção de formatação do painel).
 *
 * Lança em vez de devolver o resto do arquivo quando não acha o fim. Era
 * exatamente o resto do arquivo que o teste antigo recebia em silêncio, e um
 * recorte grande demais faz qualquer conferência de "isto aparece uma vez só"
 * reprovar sem dizer por quê.
 */
export function blocoDaFuncao(fonte: string, assinatura: string): string {
  const texto = normalizarFimDeLinha(fonte);
  const inicio = texto.indexOf(assinatura);
  if (inicio < 0) throw new Error(`a fonte não tem "${assinatura}"`);
  const fim = texto.indexOf("\n}\n", inicio);
  if (fim < 0) throw new Error(`"${assinatura}" não fecha com uma chave na coluna zero`);
  return texto.slice(inicio, fim);
}
