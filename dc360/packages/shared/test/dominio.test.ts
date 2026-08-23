import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHECKLIST_OBRIGATORIO, CHECKLIST_VISTORIA, ROTULO_CHECKLIST,
  STATUS_INICIAL, STATUS_OCORRENCIA, STATUS_RESERVADOS, TRANSICOES_PERMITIDAS,
  ocorrenciaAtiva, transicaoPermitida, type StatusOcorrencia,
} from "../src/index.js";

/**
 * A máquina de estados, verificada como grafo.
 *
 * O defeito que originou este arquivo: `rascunho` estava declarado com rótulo,
 * ícone, cor de selo e até um índice parcial no banco que o excluía, e nenhum
 * caminho de código jamais criava uma ocorrência nesse estado. Duas transições
 * da máquina eram permanentemente inalcançáveis, e ninguém percebeu porque
 * nada olhava o grafo inteiro: cada teste olhava uma transição por vez.
 *
 * Aqui o grafo é percorrido de verdade, a partir do estado inicial.
 */

/** Todos os estados alcançáveis a partir do inicial, andando pelas transições. */
function alcancaveis(): Set<StatusOcorrencia> {
  const vistos = new Set<StatusOcorrencia>([STATUS_INICIAL]);
  const fila: StatusOcorrencia[] = [STATUS_INICIAL];
  while (fila.length > 0) {
    const atual = fila.shift()!;
    for (const proximo of TRANSICOES_PERMITIDAS[atual]) {
      if (!vistos.has(proximo)) {
        vistos.add(proximo);
        fila.push(proximo);
      }
    }
  }
  return vistos;
}

describe("Máquina de estados da ocorrência", () => {
  it("todo estado é alcançável, ou está declarado como reservado com a razão", () => {
    const chegam = alcancaveis();
    const mortos = STATUS_OCORRENCIA.filter(
      (s) => !chegam.has(s) && !STATUS_RESERVADOS[s],
    );
    expect(
      mortos,
      "estado que ninguém alcança e ninguém declarou. Ou existe um caminho " +
      "até ele, ou ele entra em STATUS_RESERVADOS com o motivo escrito.",
    ).toEqual([]);
  });

  it("toda reserva tem razão escrita, e não uma frase de ocasião", () => {
    for (const [estado, razao] of Object.entries(STATUS_RESERVADOS)) {
      expect(razao, estado).toBeTruthy();
      expect(razao!.length, `razão curta demais para ${estado}`).toBeGreaterThan(40);
    }
  });

  it("nenhuma reserva sobra depois de o estado passar a ser alcançável", () => {
    // Reserva que sobra vira desculpa pendurada: o dia em que o aplicativo de
    // campo produzir `rascunho`, a linha precisa sair daqui.
    const chegam = alcancaveis();
    for (const estado of Object.keys(STATUS_RESERVADOS) as StatusOcorrencia[]) {
      expect(
        chegam.has(estado),
        `${estado} já é alcançável: tire a reserva de STATUS_RESERVADOS`,
      ).toBe(false);
    }
  });

  it("encerrada é terminal, e alcançável de todo estado ativo", () => {
    expect(TRANSICOES_PERMITIDAS["encerrada"]).toEqual([]);
    for (const estado of STATUS_OCORRENCIA) {
      if (estado === "encerrada") continue;
      expect(
        transicaoPermitida(estado, "encerrada"),
        `${estado} precisa poder ser encerrada: a realidade da rua impõe isso`,
      ).toBe(true);
    }
  });

  it("nenhuma transição aponta para estado que não existe", () => {
    const declarados = new Set<string>(STATUS_OCORRENCIA);
    for (const [de, paras] of Object.entries(TRANSICOES_PERMITIDAS)) {
      for (const para of paras) {
        expect(declarados.has(para), `${de} aponta para ${para}, que não existe`).toBe(true);
      }
    }
  });

  it("todo estado tem lista de transições declarada", () => {
    // Estado sem entrada aqui faria `TRANSICOES_PERMITIDAS[x]` ser undefined, e
    // `transicaoPermitida` estouraria em vez de recusar.
    for (const estado of STATUS_OCORRENCIA) {
      expect(Array.isArray(TRANSICOES_PERMITIDAS[estado]), estado).toBe(true);
    }
  });

  it("estado reservado não conta como ativo", () => {
    // Se contasse, o indicador "Na fila" somaria rascunho de aparelho que nem
    // chegou ao servidor.
    for (const estado of Object.keys(STATUS_RESERVADOS) as StatusOcorrencia[]) {
      expect(ocorrenciaAtiva(estado), estado).toBe(false);
    }
    expect(ocorrenciaAtiva("encerrada")).toBe(false);
    expect(ocorrenciaAtiva("em_campo")).toBe(true);
  });

  it("o grafo é percorrido de verdade", () => {
    // Âncora: se a busca quebrasse e devolvesse só o inicial, o primeiro caso
    // reprovaria tudo em vez de passar vazio, mas melhor não depender disso.
    const chegam = alcancaveis();
    expect(chegam.has("em_campo")).toBe(true);
    expect(chegam.has("providencia_pendente")).toBe(true);
    expect(chegam.size).toBeGreaterThan(4);
  });
});

describe("Checklist da vistoria", () => {
  /**
   * O defeito que originou este bloco: o checklist estava definido duas vezes,
   * e as duas cópias tinham listas diferentes. O gerador de documento conhecia
   * seis itens e o painel conhecia quatro. Uma vistoria com
   * `danos_estruturais` saía por extenso no laudo e como chave crua na tela do
   * coordenador: mesmo dado, dois documentos.
   */

  it("todo item tem chave, rótulo e obrigatoriedade declarada", () => {
    expect(CHECKLIST_VISTORIA.length).toBeGreaterThan(3);
    for (const item of CHECKLIST_VISTORIA) {
      expect(item.chave, JSON.stringify(item)).toMatch(/^[a-z_]+$/);
      expect(item.rotulo.length, item.chave).toBeGreaterThan(5);
      expect(typeof item.obrigatorio, item.chave).toBe("boolean");
    }
  });

  it("nenhuma chave repetida", () => {
    // Chave repetida com rótulo diferente faria a resposta do agente aparecer
    // de um jeito no aparelho e de outro no laudo.
    const chaves = CHECKLIST_VISTORIA.map((i) => i.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("os rótulos cobrem todas as chaves", () => {
    for (const item of CHECKLIST_VISTORIA) {
      expect(ROTULO_CHECKLIST[item.chave], item.chave).toBe(item.rotulo);
    }
  });

  it("existe pelo menos um item obrigatório, e nem todos são", () => {
    /*
      Nenhum obrigatório permitiria concluir vistoria em branco. Todos
      obrigatórios ensinaria a marcar qualquer coisa em item que não se aplica,
      só para o botão liberar, e a resposta viraria ruído no laudo.
    */
    expect(CHECKLIST_OBRIGATORIO.length).toBeGreaterThan(0);
    expect(CHECKLIST_OBRIGATORIO.length).toBeLessThan(CHECKLIST_VISTORIA.length);
  });

  it("ninguém redefine o checklist fora do pacote compartilhado", () => {
    /*
      Este é o caso que impede a divergência de voltar. Ele varre o código do
      produto atrás de outra tabela de rótulos de checklist, e reprova se
      encontrar: a definição é uma só, e quem precisa dela importa.
    */
    const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    const IGNORADAS = new Set(["node_modules", "dist", ".git", "coverage"]);

    function fontes(pasta: string): string[] {
      const achados: string[] = [];
      for (const nome of readdirSync(pasta)) {
        if (IGNORADAS.has(nome)) continue;
        const caminho = join(pasta, nome);
        if (statSync(caminho).isDirectory()) achados.push(...fontes(caminho));
        else if (/\.(ts|tsx)$/.test(nome)) achados.push(caminho);
      }
      return achados;
    }

    const arquivos = fontes(RAIZ);
    expect(arquivos.length, "âncora: a varredura precisa achar arquivos").toBeGreaterThan(20);

    const culpados: string[] = [];
    for (const caminho of arquivos) {
      const relativo = relative(RAIZ, caminho).split(sep).join("/");
      // O próprio dominio.ts é onde a definição mora, e este teste a cita.
      if (relativo.endsWith("src/dominio.ts")) continue;
      if (relativo.endsWith("test/dominio.test.ts")) continue;

      const fonte = readFileSync(caminho, "utf8");
      // Uma tabela que mapeia a chave de um item para um texto é a assinatura
      // da cópia. Importar e usar o rótulo não casa com isto.
      if (/(risco_iminente|evacuacao_necessaria|interdicao_indicada)\s*:\s*"/.test(fonte)) {
        culpados.push(relativo);
      }
    }
    expect(
      culpados,
      "checklist redefinido fora do pacote compartilhado: importe ROTULO_CHECKLIST",
    ).toEqual([]);
  });
});
