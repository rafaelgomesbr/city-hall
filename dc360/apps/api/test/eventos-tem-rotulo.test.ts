import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROTULO_EVENTO_TRILHA } from "@dc360/shared";

/**
 * Todo evento que o servidor grava tem rótulo em português.
 *
 * O DEFEITO QUE ISTO EXISTE PARA IMPEDIR já tinha acontecido duas vezes,
 * sozinho, sem ninguém errar nada visível. O mapa de rótulos morava copiado em
 * duas telas, e quando `documento_emitido` nasceu ninguém tocou nas cópias. A
 * auditoria passou a imprimir a chave crua do banco, e a linha do tempo da
 * ocorrência também tinha perdido `resposta_providencia` do mesmo jeito.
 *
 * A auditoria é a tela que alguém abre para PROVAR o que aconteceu, muitas
 * vezes para outra pessoa, às vezes num processo. "documento_emitido" numa
 * linha de prova é o sistema falando consigo mesmo na frente de quem precisa
 * entender.
 *
 * O portão DESCOBRE os tipos no código do servidor em vez de conferi-los
 * contra uma lista. Lista alguém esquece de atualizar, que foi exatamente o
 * que aconteceu; o código-fonte não tem como mentir sobre o que ele grava.
 */

const RAIZ = new URL("../src/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function arquivosTypeScript(dir: string): string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) achados.push(...arquivosTypeScript(caminho));
    else if (entrada.name.endsWith(".ts")) achados.push(caminho);
  }
  return achados;
}

/**
 * Os tipos de evento que o servidor grava, lidos do próprio código.
 *
 * Duas formas de escrita, e as duas precisam ser lidas com PRECISÃO
 * posicional, não por proximidade. As duas primeiras versões deste leitor
 * erraram, cada uma de um jeito, e os dois erros valem estar escritos:
 *
 * - Procurar qualquer texto entre aspas depois de `registrarEvento(` casava
 *   com a DEFINIÇÃO da função, cujo último parâmetro tem valor padrão
 *   `"escritorio"`. O portão reprovava pedindo rótulo para a origem do evento.
 * - Procurar qualquer literal dentro de um `VALUES`, filtrando pelos rótulos
 *   já conhecidos, era circular: só encontrava o que já tinha rótulo, então
 *   nunca poderia reprovar por um evento novo, que é a única coisa que este
 *   arquivo existe para pegar.
 *
 * Agora cada leitor aponta para a POSIÇÃO em que o tipo mora: o quarto
 * argumento da chamada, e a terceira coluna do `INSERT`.
 */
function tiposGravados(): Set<string> {
  const tipos = new Set<string>();

  /* Quarto argumento de `registrarEvento`, e só ele. A definição da função
     não casa porque ali o quarto parâmetro é `tipo: string`, sem aspas. */
  const chamada = /registrarEvento\(\s*[^,)]+,\s*[^,)]+,\s*[^,)]+,\s*["']([a-z_]+)["']/g;

  /* Terceira coluna do INSERT em `trilha_eventos`, que é onde `tipo` fica.
     É como `registrarEmissao` grava, com o tipo fixo no próprio SQL. */
  const insercao = /INSERT INTO trilha_eventos[\s\S]*?VALUES\s*\(\s*\$1,\s*\$2,\s*'([a-z_]+)'/g;

  for (const arquivo of arquivosTypeScript(RAIZ)) {
    const fonte = readFileSync(arquivo, "utf8");
    for (const m of fonte.matchAll(chamada)) tipos.add(m[1]!);
    for (const m of fonte.matchAll(insercao)) tipos.add(m[1]!);
  }
  return tipos;
}

describe("Nenhum evento da trilha aparece cru na tela", () => {
  it("acha tipos de evento de verdade no código do servidor", () => {
    /*
      Âncora. Se a varredura parar de encontrar coisa (alguém renomeia
      `registrarEvento`, a pasta muda de lugar), o caso seguinte passaria com
      um conjunto vazio e o portão viraria enfeite. Foi assim que dois testes
      desta suíte passaram sem verificar nada nesta mesma semana.
    */
    const tipos = tiposGravados();
    expect(tipos.size).toBeGreaterThan(5);
    expect(tipos).toContain("encerramento");
    expect(tipos).toContain("registro");
  });

  it("todo tipo gravado tem rótulo em português", () => {
    const semRotulo = [...tiposGravados()].filter((t) => !ROTULO_EVENTO_TRILHA[t]);
    expect(
      semRotulo,
      "evento novo sem rótulo: acrescente em ROTULO_EVENTO_TRILHA, no pacote "
      + "compartilhado, senão a auditoria imprime a chave do banco",
    ).toEqual([]);
  });

  it("nenhum rótulo sobra apontando para evento que ninguém grava", () => {
    /*
      A direção contrária, e ela importa menos, mas importa. Rótulo que sobra
      depois de o evento sumir é documentação afirmando que o sistema registra
      algo que ele não registra mais.
    */
    const gravados = tiposGravados();
    const orfaos = Object.keys(ROTULO_EVENTO_TRILHA).filter((t) => !gravados.has(t));
    expect(orfaos, "rótulo para evento que o servidor não grava").toEqual([]);
  });

  it("nenhum rótulo é a própria chave disfarçada", () => {
    for (const [chave, rotulo] of Object.entries(ROTULO_EVENTO_TRILHA)) {
      // "desinterdicao: 'desinterdicao'" satisfaria o portão acima e não
      // resolveria nada: continuaria sendo jargão de banco na tela.
      expect(rotulo, `rótulo igual à chave: ${chave}`).not.toBe(chave);
      expect(rotulo, `rótulo sem espaço, provável chave: ${chave}`).toMatch(/\s/);
    }
  });
});
