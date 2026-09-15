import { describe, expect, it } from "vitest";

import {
  destacar, distanciaDeEdicao, normalizar, pontuar, tetoDeErros,
} from "../src/busca/pontuador";
import {
  ACOES_DA_INTERFACE, buscarNaInterface, indiceDaInterface, type PaginaDoMenu,
} from "../src/busca/indice";

/**
 * O PONTUADOR DA BUSCA, E O QUE ELE NÃO PODE DEIXAR DE ACHAR.
 *
 * A caixa do topo indexa registro e função do painel com tolerância a erro
 * de digitação. A tolerância é escrita aqui, e não numa biblioteca, por duas
 * razões que o produto já assumiu: o `npm audit` fecha em zero e cada
 * dependência é dívida, e a régua de "quantos erros são tolerados" precisa
 * ser lida por quem chega, não descoberta no código de terceiros.
 *
 * O que este arquivo cobra do pontuador:
 *
 * - acento e caixa não contam ("orgão", "Órgãos", "orgao" são a mesma coisa);
 * - prefixo e trecho contam mais que erro de digitação;
 * - a distância de edição tem TETO proporcional ao tamanho: 1 erro até 5
 *   letras, 2 até 10, 3 acima. E ZERO abaixo de 3 letras, porque um erro em
 *   duas letras é metade da palavra, e isso não é tolerância, é ruído;
 * - sinônimo declarado por item acha ("time" acha Equipes, "chamado" acha
 *   Ocorrências);
 * - e, tão importante quanto: o que NÃO deve casar não casa.
 *
 * O índice da interface é o segundo assunto: as páginas de `NAVEGACAO`
 * filtradas pelo mesmo `podeExecutar` do menu, mais as ações do painel, cada
 * uma só para quem pode. A busca não pode ser o lugar onde o operador
 * descobre a tela que o menu escondeu dele.
 */

describe("Normalização", () => {
  it("apaga acento, iguala caixa e junta espaços", () => {
    expect(normalizar("  Órgãos   de DESTINO ")).toBe("orgaos de destino");
    expect(normalizar("Ocorrências")).toBe("ocorrencias");
    expect(normalizar("ç Ç ã Ã é É")).toBe("c c a a e e");
  });
});

describe("Distância de edição", () => {
  it("conta troca, falta, sobra e transposição de vizinhos como um erro cada", () => {
    expect(distanciaDeEdicao("equipe", "equipe")).toBe(0);
    expect(distanciaDeEdicao("eqipe", "equipe")).toBe(1);      // falta
    expect(distanciaDeEdicao("ocorencia", "ocorrencia")).toBe(1); // falta
    expect(distanciaDeEdicao("mapaa", "mapa")).toBe(1);        // sobra
    expect(distanciaDeEdicao("mepa", "mapa")).toBe(1);         // troca
    expect(distanciaDeEdicao("ampa", "mapa")).toBe(1);         // transposição
  });

  it("para de contar quando passa do teto, para não custar caro numa lista grande", () => {
    expect(distanciaDeEdicao("abcdefgh", "zzzzzzzz", 2)).toBeGreaterThan(2);
  });

  it("o teto de erros é proporcional ao tamanho do que foi digitado", () => {
    expect(tetoDeErros(2)).toBe(0);
    expect(tetoDeErros(3)).toBe(1);
    expect(tetoDeErros(5)).toBe(1);
    expect(tetoDeErros(6)).toBe(2);
    expect(tetoDeErros(10)).toBe(2);
    expect(tetoDeErros(11)).toBe(3);
    expect(tetoDeErros(40)).toBe(3);
  });
});

describe("Pontuação de um item", () => {
  const equipes = { rotulo: "Equipes", sinonimos: ["time", "times"] };
  const ocorrencias = { rotulo: "Ocorrências", sinonimos: ["chamado", "protocolo", "fila"] };

  it("igual vale mais que prefixo, que vale mais que trecho, que vale mais que erro", () => {
    const igual = pontuar("equipes", equipes);
    const prefixo = pontuar("equi", equipes);
    const trecho = pontuar("uipe", equipes);
    const erro = pontuar("eqipes", equipes);
    expect(igual).toBeGreaterThan(prefixo);
    expect(prefixo).toBeGreaterThan(trecho);
    expect(trecho).toBeGreaterThan(erro);
    expect(erro).toBeGreaterThan(0);
  });

  it("acha pelo sinônimo declarado", () => {
    expect(pontuar("time", equipes)).toBeGreaterThan(0);
    expect(pontuar("chamado", ocorrencias)).toBeGreaterThan(0);
    expect(pontuar("protocolo", ocorrencias)).toBeGreaterThan(0);
  });

  it("acento e caixa não atrapalham", () => {
    expect(pontuar("OCORRÊNCIAS", ocorrencias)).toBe(pontuar("ocorrencias", ocorrencias));
  });

  it("consulta de várias palavras exige que cada palavra case, e ignora as de ligação", () => {
    const mapa = { rotulo: "Mapa da cidade", sinonimos: [] };
    expect(pontuar("mapa cidade", mapa)).toBeGreaterThan(0);
    expect(pontuar("cidade mapa", mapa)).toBeGreaterThan(0);
    expect(pontuar("mapa da cidade", mapa)).toBeGreaterThan(0);
    expect(pontuar("mapa do brasil", mapa)).toBe(0);
  });

  it("o que não parece não casa", () => {
    expect(pontuar("banana", equipes)).toBe(0);
    expect(pontuar("ocorencia", equipes)).toBe(0);
    // Duas letras com um erro seria metade da palavra: não é tolerância.
    expect(pontuar("mp", { rotulo: "Mapa", sinonimos: [] })).toBe(0);
    // "Painel" e "Papel" estão a duas trocas; com cinco letras o teto é um.
    expect(pontuar("papel", { rotulo: "Painel", sinonimos: [] })).toBe(0);
  });
});

describe("Destaque do trecho casado", () => {
  it("marca o trecho que casou, no texto original com acento", () => {
    expect(destacar("Ocorrências", "ocorr")).toEqual([
      { texto: "Ocorr", marcado: true },
      { texto: "ências", marcado: false },
    ]);
  });

  it("acha o trecho mesmo quando a consulta foi digitada sem acento", () => {
    expect(destacar("Órgãos de destino", "orgao")).toEqual([
      { texto: "Órgão", marcado: true },
      { texto: "s de destino", marcado: false },
    ]);
  });

  it("com erro de digitação, marca a palavra inteira que casou por distância", () => {
    expect(destacar("Equipes", "eqipes")).toEqual([{ texto: "Equipes", marcado: true }]);
    expect(destacar("Mapa da cidade", "cidde")).toEqual([
      { texto: "Mapa da ", marcado: false },
      { texto: "cidade", marcado: true },
    ]);
  });

  it("sem casamento nenhum devolve o texto inteiro sem marca", () => {
    expect(destacar("Equipes", "banana")).toEqual([{ texto: "Equipes", marcado: false }]);
  });
});

/** As páginas do menu, como `Estrutura.tsx` as declara, sem o JSX do ícone. */
const PAGINAS: readonly PaginaDoMenu[] = [
  { para: "/meu-trabalho", rotulo: "Meu trabalho", exige: "registrar_vistoria" },
  { para: "/painel", rotulo: "Painel", escondeSePuder: "registrar_vistoria",
    sinonimos: ["início", "indicadores"] },
  { para: "/ocorrencias", rotulo: "Ocorrências", escondeSePuder: "registrar_vistoria",
    sinonimos: ["chamado", "protocolo"] },
  { para: "/mapa", rotulo: "Mapa da cidade", sinonimos: ["mapa"] },
  { para: "/quem-esta-em-campo", rotulo: "Quem está em campo",
    exige: "acompanhar_saida_a_campo", escondeSePuder: "registrar_vistoria" },
  { para: "/equipes", rotulo: "Equipes", exige: "gerenciar_equipes", sinonimos: ["time"] },
  { para: "/orgaos", rotulo: "Órgãos de destino", exige: "gerenciar_equipes" },
  { para: "/usuarios", rotulo: "Usuários", exige: "gerenciar_usuarios",
    sinonimos: ["conta", "pessoa"] },
  { para: "/auditoria", rotulo: "Prestação de contas", exige: "consultar_trilha" },
];

function rotulos(consulta: string, papel: "coordenador" | "operador" | "agente_campo" = "coordenador") {
  const indice = indiceDaInterface(papel, PAGINAS, { tema: "claro" });
  return buscarNaInterface(consulta, indice).map((r) => r.item.rotulo);
}

describe("O índice da interface", () => {
  it("os exemplos do pedido acham o que devem", () => {
    expect(rotulos("ocorencia")[0]).toBe("Ocorrências");
    expect(rotulos("eqipe")[0]).toBe("Equipes");
    expect(rotulos("usuario")[0]).toBe("Usuários");
    expect(rotulos("orgão")[0]).toBe("Órgãos de destino");
    expect(rotulos("sair da conta")[0]).toBe("Sair");
    expect(rotulos("mapa")[0]).toBe("Mapa da cidade");
  });

  it("as ações do painel entram, cada uma pelo próprio nome e pelos sinônimos", () => {
    expect(rotulos("registrar")).toContain("Registrar ocorrência");
    expect(rotulos("nova ocorrencia")).toContain("Registrar ocorrência");
    expect(rotulos("novo usuario")).toContain("Novo usuário");
    expect(rotulos("nova equipe")).toContain("Nova equipe");
    expect(rotulos("novo orgao")).toContain("Novo órgão");
    expect(rotulos("exportar")).toContain("Exportar a base");
    expect(rotulos("csv")).toContain("Exportar a base");
    expect(rotulos("minha conta")).toContain("Minha conta");
    expect(rotulos("senha")).toContain("Minha conta");
  });

  it("o tema aparece pelo nome do modo que a pessoa procura", () => {
    // No tema claro a ação oferecida é ir para o escuro, e vice-versa, como o
    // botão do menu. Mas quem digita "claro" no tema claro também precisa
    // achar a ação: é a mesma ação, e "modo" acha as duas.
    const claro = buscarNaInterface("escuro", indiceDaInterface("operador", PAGINAS, { tema: "claro" }));
    expect(claro[0]?.item.rotulo).toBe("Tema escuro");
    const escuro = buscarNaInterface("claro", indiceDaInterface("operador", PAGINAS, { tema: "escuro" }));
    expect(escuro[0]?.item.rotulo).toBe("Tema claro");
    expect(rotulos("modo")).toContain("Tema escuro");
    expect(rotulos("tema")).toContain("Tema escuro");
  });

  it("o que o menu esconde de um papel, a busca também esconde", () => {
    // O operador não gerencia usuários nem equipes: o menu não mostra, a busca
    // não pode mostrar, e "Novo usuário" muito menos.
    expect(rotulos("usuario", "operador")).toEqual([]);
    expect(rotulos("equipe", "operador")).toEqual([]);
    expect(rotulos("exportar", "operador")).toEqual([]);
    // O agente de campo não vê o painel nem a fila do município.
    expect(rotulos("painel", "agente_campo")).toEqual([]);
    expect(rotulos("ocorrencias", "agente_campo")).not.toContain("Ocorrências");
    // Mas o que é de todos continua sendo de todos.
    expect(rotulos("mapa", "agente_campo")[0]).toBe("Mapa da cidade");
    expect(rotulos("sair", "agente_campo")[0]).toBe("Sair");
    expect(rotulos("minha conta", "agente_campo")[0]).toBe("Minha conta");
  });

  it("toda ação da interface declara quem pode, ou é de todos de propósito", () => {
    /*
      Âncora da lista. Uma ação nova que caia aqui sem `exige` é uma decisão
      de expor a todo mundo, e o teste obriga a decisão a ser dita.
    */
    const deTodos = new Set(["trocar_tema", "sair", "minha_conta"]);
    for (const acao of ACOES_DA_INTERFACE) {
      expect(
        acao.exige !== undefined || deTodos.has(acao.id),
        `${acao.id} não diz quem pode e não está na lista dos que são de todos`,
      ).toBe(true);
    }
    expect(ACOES_DA_INTERFACE.length).toBeGreaterThanOrEqual(8);
  });

  it("o que não parece nada não acha nada", () => {
    expect(rotulos("banana")).toEqual([]);
    expect(rotulos("xyzw")).toEqual([]);
    expect(rotulos("a")).toEqual([]);
  });

  it("a lista vem ordenada da melhor pontuação para a pior, e o empate é pelo nome", () => {
    const resultados = buscarNaInterface("ocorr", indiceDaInterface("coordenador", PAGINAS, { tema: "claro" }));
    const pontos = resultados.map((r) => r.pontuacao);
    expect(pontos).toEqual([...pontos].sort((a, b) => b - a));
    expect(resultados[0]?.item.rotulo).toBe("Ocorrências");
  });
});
