import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { montarVerTambem, type OcorrenciaRelacionada } from "../src/paginas/ocorrencia-regras";
import { CartaoVerTambem } from "../src/paginas/Ocorrencia";

/**
 * O cartão "Ver também".
 *
 * Ele existia com título, um único link "Voltar para a lista" (que duplicava
 * o botão Voltar do topo da mesma tela) e nenhuma fonte de dados: gaveta
 * vazia com nome de gaveta cheia. As duas fontes que faltavam já estavam à
 * mão, os vínculos que a página carrega e a consulta de vizinhança que a
 * abertura de ocorrência já usava.
 *
 * O segundo assunto deste arquivo é privacidade, e é o motivo de a montagem
 * da lista ser função pura com tipo de entrada estreito. A consulta de
 * vizinhança do modo local devolve `SELECT o.*`: relato do solicitante e
 * descrição da vulnerabilidade social vêm junto. Espalhar essa linha na lista
 * imprimiria, num cartão lateral, que existe idosa acamada no número tal, de
 * um caso que a pessoa nem abriu. O laudo apontou isso. A defesa não é
 * lembrar de não usar o campo: é o campo não ter como chegar à tela.
 */

const PAGINA = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "paginas", "Ocorrencia.tsx");

function vizinha(dados: Partial<OcorrenciaRelacionada> = {}): OcorrenciaRelacionada {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    protocolo: "2026-000042",
    status: "triagem",
    criado_em: "2026-09-07T14:22:00.000Z",
    ...dados,
  };
}

const ATUAL = "99999999-9999-4999-8999-999999999999";

describe("A lista do Ver também", () => {
  it("junta vínculo e vizinhança numa lista só, do mais forte para o mais fraco", () => {
    const itens = montarVerTambem({
      ocorrenciaId: ATUAL,
      tipo: "deslizamento",
      vinculadaA: vizinha({ id: "a", protocolo: "2026-000001" }),
      vinculadas: [vizinha({ id: "b", protocolo: "2026-000002" })],
      mesmoEndereco: [vizinha({ id: "c", protocolo: "2026-000003" })],
    });
    expect(itens.map((i) => i.relacao)).toEqual(["continuacao", "mesmo_evento", "mesmo_endereco"]);
    expect(itens.map((i) => i.protocolo)).toEqual(["2026-000001", "2026-000002", "2026-000003"]);
  });

  it("não lista a própria ocorrência", () => {
    // A busca por endereço encontra ela mesma: mesmo tipo, mesmo endereço,
    // aberta agora. Sem isto o cartão convidaria a clicar de volta na página
    // em que a pessoa já está.
    const itens = montarVerTambem({
      ocorrenciaId: ATUAL,
      tipo: "deslizamento",
      vinculadaA: null,
      vinculadas: [],
      mesmoEndereco: [vizinha({ id: ATUAL }), vizinha({ id: "outra" })],
    });
    expect(itens.map((i) => i.id)).toEqual(["outra"]);
  });

  it("o mesmo chamado não aparece duas vezes", () => {
    // Vinculado E no mesmo endereço é o caso comum, não o raro: chamado
    // repetido do mesmo evento costuma vir do mesmo lugar.
    const itens = montarVerTambem({
      ocorrenciaId: ATUAL,
      tipo: "deslizamento",
      vinculadaA: null,
      vinculadas: [vizinha({ id: "repetida" })],
      mesmoEndereco: [vizinha({ id: "repetida" })],
    });
    expect(itens).toHaveLength(1);
    expect(itens[0]!.relacao).toBe("mesmo_evento");
  });

  it("o tipo da vizinha vem da consulta, e o do vínculo fica em branco", () => {
    /*
      A rota de vizinhança devolve id, protocolo, endereço, data e situação, e
      mais nada: não devolve o tipo. Lê-lo da linha daria o valor certo no
      modo local e `undefined` em produção. Como a consulta filtra por tipo,
      toda linha que volta tem o tipo consultado, e é ele que vale. O vínculo
      chega sem tipo nenhum, e omitir é melhor que inventar.
    */
    const itens = montarVerTambem({
      ocorrenciaId: ATUAL,
      tipo: "alagamento",
      vinculadaA: vizinha({ id: "vinculo" }),
      vinculadas: [],
      mesmoEndereco: [vizinha({ id: "vizinha" })],
    });
    expect(itens[0]!.tipo).toBe(null);
    expect(itens[1]!.tipo).toBe("alagamento");
  });

  it("nada do relato nem da vulnerabilidade social atravessa a montagem", () => {
    const linhaGorda = {
      ...vizinha({ id: "vizinha" }),
      endereco: "Rua das Palmeiras 100",
      descricao: "Barranco cedeu sobre o quintal dos fundos",
      solicitante_nome: "Marlene Prudêncio",
      solicitante_contato: "(48) 9 9999-0000",
      vulnerabilidade_presente: true,
      vulnerabilidade_descricao: "Idosa acamada e criança de colo no imóvel",
    };
    const itens = montarVerTambem({
      ocorrenciaId: ATUAL,
      tipo: "deslizamento",
      vinculadaA: null,
      vinculadas: [],
      mesmoEndereco: [linhaGorda],
    });

    const serializado = JSON.stringify(itens);
    for (const vazamento of [
      "Idosa acamada", "Barranco cedeu", "Marlene", "9999-0000",
    ]) {
      expect(
        serializado.includes(vazamento),
        `"${vazamento}" chegou até a lista lateral. Protocolo, tipo, data e `
        + "situação bastam para decidir se vale abrir o outro chamado; o resto "
        + "é dado de uma família que quem olha esta tela não abriu.",
      ).toBe(false);
    }
  });
});

describe("O cartão desenhado na tela", () => {
  /*
    O `MemoryRouter` avisa em stderr que `useLayoutEffect` não faz nada no
    servidor. É esperado e não é defeito do cartão: aqui só interessa o
    primeiro quadro do HTML, e o roteador entra porque `Link` precisa de um.
  */
  function html(itens: ReturnType<typeof montarVerTambem>, consultaFalhou = false): string {
    return renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(CartaoVerTambem, { itens, consultaFalhou }),
      ),
    );
  }

  const cheio = montarVerTambem({
    ocorrenciaId: ATUAL,
    tipo: "deslizamento",
    vinculadaA: null,
    vinculadas: [],
    mesmoEndereco: [vizinha({ id: "vizinha", protocolo: "2026-000042" })],
  });

  it("mostra protocolo, tipo, data e situação, e leva ao outro chamado", () => {
    const saida = html(cheio);
    expect(saida).toContain("2026-000042");
    expect(saida).toContain("Deslizamento");
    expect(saida).toContain("Em triagem");
    expect(saida).toContain('href="/ocorrencias/vizinha"');
  });

  it("o estado vazio diz o que foi procurado", () => {
    /*
      "Nada relacionado" sozinho é ambíguo entre "não existe" e "não procurei
      direito", e ambiguidade em cartão de apoio faz desconfiar da tela toda.
    */
    const saida = html([]);
    expect(saida).toContain("Nada relacionado");
    expect(saida).toMatch(/48 horas/);
    expect(
      saida.includes("Voltar para a lista"),
      "o cartão voltou a ser um atalho duplicado do botão Voltar do topo",
    ).toBe(false);
  });

  it("consulta que falhou não vira lista vazia", () => {
    // Lista vazia afirma que não há vizinho. Quando a busca não respondeu,
    // a tela não sabe disso, e dizer que sabe é mentir com cara de dado.
    expect(html([], true)).toMatch(/não respondeu/);
    expect(html(cheio, false)).not.toMatch(/não respondeu/);
  });
});

describe("A fiação da página", () => {
  it("a vizinhança é consultada, e a falha dela não derruba o detalhe", () => {
    const fonte = readFileSync(PAGINA, "utf8");
    expect(fonte).toMatch(
      /possiveisDuplicidades\(sessao, ocorrencia\.tipo, ocorrencia\.endereco\)\s*\.catch\(\(\) => null\)/,
    );
    expect(fonte).toMatch(/<CartaoVerTambem/);
  });
});
