import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  ROTULO_DO_GRUPO, classificarRegistros, destinoDoResultado, gruposVisiveis,
  type RegistroPesquisavel,
} from "../src/busca/registros";
import type { RespostaDeBusca } from "../src/dados/tipos";

/**
 * OS REGISTROS NA BUSCA, E A DEMONSTRAÇÃO ACHANDO O QUE O SERVIDOR ACHARIA.
 *
 * O servidor tem a rota `GET /busca?q=` com tolerância a erro própria. O modo
 * de demonstração não tem servidor, e mesmo assim precisa responder à mesma
 * caixa: é nele que o produto é mostrado à prefeitura. Então `local.ts` puxa
 * os registros do banco da aba e passa por ESTE classificador, que devolve
 * exatamente a forma do contrato (`consulta`, `teto`, `grupos` sem grupo
 * vazio, itens já ordenados).
 *
 * O contrato do servidor é reproduzido aqui como dublê, com os mesmos
 * exemplos da especificação, e o que se cobra é que a demonstração encontre
 * o mesmo registro que aquele exemplo mostra o servidor encontrando.
 */

const DADOS = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "dados");

/** O exemplo da especificação da rota, palavra por palavra. */
const RESPOSTA_DO_SERVIDOR: RespostaDeBusca = {
  consulta: "boa esperanca",
  teto: 8,
  grupos: [
    { tipo: "ocorrencia", itens: [{ id: "oc-1", protocolo: "000123/2026", titulo: "Servidão Boa Esperança, 148", detalhe: "Deslizamento, em campo", severidade: "alta", status: "em_campo", pontuacao: 0.83 }] },
    { tipo: "usuario", itens: [{ id: "us-1", titulo: "Joana da Silva Prado", detalhe: "Agente de campo, matrícula 0001", pontuacao: 0.9 }] },
    { tipo: "equipe", itens: [{ id: "eq-1", titulo: "Equipe Alfa", detalhe: "4 pessoas", pontuacao: 0.7 }] },
    { tipo: "orgao", itens: [{ id: "or-1", titulo: "Corpo de Bombeiros", detalhe: "CBMSC", pontuacao: 0.6 }] },
  ],
};

/**
 * Os mesmos registros, como o banco da demonstração os entregaria ao
 * classificador. O protocolo NÃO entra em `termos`: ele casa só por prefixo
 * do número, pelo campo próprio (ver "O ruído da busca", abaixo).
 */
const REGISTROS: RegistroPesquisavel[] = [
  {
    tipo: "ocorrencia", id: "oc-1", titulo: "Servidão Boa Esperança, 148",
    detalhe: "Deslizamento, em campo", protocolo: "000123/2026", severidade: "alta", status: "em_campo",
    termos: ["Servidão Boa Esperança, 148", "Maria Aparecida Lins", "Deslizamento", "Em campo"],
  },
  {
    tipo: "ocorrencia", id: "oc-2", titulo: "Rua Sete de Setembro, 410",
    detalhe: "Vendaval, encerrada", protocolo: "000098/2026", severidade: "baixa", status: "encerrada",
    termos: ["Rua Sete de Setembro, 410", "Benedito Alcântara", "Vendaval", "Encerrada"],
  },
  {
    tipo: "usuario", id: "us-1", titulo: "Joana da Silva Prado",
    detalhe: "Agente de campo, matrícula 0001",
    termos: ["Joana da Silva Prado", "0001", "joana.prado@exemplo.gov.br", "Agente de campo"],
  },
  {
    tipo: "usuario", id: "us-2", titulo: "Helena Vasques Coutinho",
    detalhe: "Coordenador, matrícula SA-1042",
    termos: ["Helena Vasques Coutinho", "SA-1042", "helena.coutinho@exemplo.gov.br", "Coordenador"],
  },
  { tipo: "equipe", id: "eq-1", titulo: "Equipe Alfa", detalhe: "4 pessoas", termos: ["Equipe Alfa", "Vistoria geotécnica"] },
  { tipo: "equipe", id: "eq-2", titulo: "Equipe Bravo", detalhe: "3 pessoas", termos: ["Equipe Bravo", "Alagamento e drenagem"] },
  { tipo: "orgao", id: "or-1", titulo: "Corpo de Bombeiros", detalhe: "CBMSC", termos: ["Corpo de Bombeiros", "CBMSC"] },
  { tipo: "orgao", id: "or-2", titulo: "Secretaria de Obras", detalhe: "SMO", termos: ["Secretaria de Obras", "SMO"] },
];

function ids(resposta: RespostaDeBusca, tipo: string): string[] {
  return resposta.grupos.find((g) => g.tipo === tipo)?.itens.map((i) => i.id) ?? [];
}

describe("A demonstração acha o que o servidor acharia", () => {
  it("cada exemplo do contrato é achado pelo mesmo termo, no mesmo grupo, com a mesma forma", () => {
    const esperados = RESPOSTA_DO_SERVIDOR.grupos.map((g) => [g.tipo, g.itens[0]!] as const);
    for (const [tipo, item] of esperados) {
      const resposta = classificarRegistros(item.titulo, REGISTROS);
      const grupo = resposta.grupos.find((g) => g.tipo === tipo);
      expect(grupo, `grupo ${tipo} para "${item.titulo}"`).toBeDefined();
      const achado = grupo!.itens[0]!;
      expect(achado.id).toBe(item.id);
      expect(achado.titulo).toBe(item.titulo);
      expect(achado.detalhe).toBe(item.detalhe);
      // Os campos que só ocorrência tem viajam só nela.
      expect(achado.protocolo).toBe(item.protocolo);
      expect(achado.severidade).toBe(item.severidade);
      expect(achado.status).toBe(item.status);
      expect(achado.pontuacao).toBeGreaterThan(0);
      expect(achado.pontuacao).toBeLessThanOrEqual(1);
    }
  });

  it("a resposta tem a forma do contrato: consulta normalizada, teto, grupos vazios omitidos", () => {
    const resposta = classificarRegistros("  Boa Esperança ", REGISTROS);
    expect(resposta.consulta).toBe("boa esperanca");
    expect(resposta.teto).toBe(RESPOSTA_DO_SERVIDOR.teto);
    expect(resposta.grupos.map((g) => g.tipo)).toEqual(["ocorrencia"]);
    expect(resposta.grupos.every((g) => g.itens.length > 0)).toBe(true);
  });

  it("tolera erro de digitação nos registros, como o servidor já tolera", () => {
    expect(ids(classificarRegistros("boa esperansa", REGISTROS), "ocorrencia")).toEqual(["oc-1"]);
    expect(ids(classificarRegistros("joana prado", REGISTROS), "usuario")).toEqual(["us-1"]);
    expect(ids(classificarRegistros("bombeiro", REGISTROS), "orgao")).toEqual(["or-1"]);
    expect(ids(classificarRegistros("cbmsc", REGISTROS), "orgao")).toEqual(["or-1"]);
    expect(ids(classificarRegistros("alfa", REGISTROS), "equipe")).toEqual(["eq-1"]);
  });

  it("acha pelo protocolo, pela matrícula e pelo solicitante, que não estão no título", () => {
    expect(ids(classificarRegistros("000123", REGISTROS), "ocorrencia")).toEqual(["oc-1"]);
    expect(ids(classificarRegistros("SA-1042", REGISTROS), "usuario")).toEqual(["us-2"]);
    expect(ids(classificarRegistros("aparecida", REGISTROS), "ocorrencia")).toEqual(["oc-1"]);
  });

  it("ordena cada grupo da melhor pontuação para a pior", () => {
    // "equipe" casa as duas, e "Equipe Alfa" vem antes de "Equipe Bravo" por nome no empate.
    const resposta = classificarRegistros("equipe", REGISTROS);
    const itens = resposta.grupos.find((g) => g.tipo === "equipe")!.itens;
    expect(itens.map((i) => i.id)).toEqual(["eq-1", "eq-2"]);
    const pontos = itens.map((i) => i.pontuacao);
    expect(pontos).toEqual([...pontos].sort((a, b) => b - a));
  });

  it("respeita o teto por grupo", () => {
    const muitos: RegistroPesquisavel[] = Array.from({ length: 20 }, (_, i) => ({
      tipo: "orgao", id: `or-${i}`, titulo: `Secretaria ${i}`, detalhe: "", termos: [`Secretaria ${i}`],
    }));
    const resposta = classificarRegistros("secretaria", muitos);
    expect(resposta.grupos[0]!.itens).toHaveLength(8);
    expect(classificarRegistros("secretaria", muitos, 3).grupos[0]!.itens).toHaveLength(3);
  });

  it("o que não parece nada não acha nada, e a resposta continua bem formada", () => {
    const resposta = classificarRegistros("zzzzzz", REGISTROS);
    expect(resposta.grupos).toEqual([]);
    expect(resposta.consulta).toBe("zzzzzz");
  });
});

describe("O ruído da busca, provado pelo revisor no Chromium", () => {
  /*
    Três achados, na demonstração: "000471" listava os oito protocolos do
    município (todos parecidos em "0004"); "sair" trazia 000478, porque
    "sair" está a uma letra de "bair" de "Bairro"; e "Marilda" achava a
    ocorrência sem nada marcado na linha, porque casou no nome do
    solicitante, que a linha não mostra.

    A régua passa a ser a do servidor (migração 041, sabor sem `pg_trgm`):
    igual, prefixo, início de palavra, substring e, por último, parecido por
    cobertura de trigramas. O protocolo é a exceção: número casa só por
    prefixo, porque quem digita "000471" quer aquele e nenhum vizinho.
  */
  const PROTOCOLOS: RegistroPesquisavel[] = Array.from({ length: 8 }, (_, i) => ({
    tipo: "ocorrencia", id: `oc-${i}`, titulo: `Rua ${i}, ${i}00`,
    detalhe: "Vendaval, em campo", protocolo: `00047${i}/2026`, severidade: "alta", status: "em_campo",
    termos: [`Rua ${i}, ${i}00`, `Solicitante ${i}`, "Vendaval", "Em campo"],
  }));

  it("'000471' acha só 000471, e não os oito vizinhos", () => {
    expect(ids(classificarRegistros("000471", PROTOCOLOS), "ocorrencia")).toEqual(["oc-1"]);
    // O prefixo continua valendo: "00047" acha os oito, que é o esperado.
    expect(ids(classificarRegistros("00047", PROTOCOLOS), "ocorrencia")).toHaveLength(8);
    // E o número inteiro, com o ano.
    expect(ids(classificarRegistros("000471/2026", PROTOCOLOS), "ocorrencia")).toEqual(["oc-1"]);
  });

  it("'sair' não acha 'Bairro Nossa Senhora'", () => {
    const registros: RegistroPesquisavel[] = [{
      tipo: "ocorrencia", id: "oc-8", titulo: "Rua Ribeirão Fundo, 402, Bairro Nossa Senhora",
      detalhe: "Inundação, em campo", protocolo: "000478/2026", severidade: "alta", status: "em_campo",
      termos: ["Rua Ribeirão Fundo, 402, Bairro Nossa Senhora", "Wanderley Pinto de Sá", "Inundação", "Em campo"],
    }];
    expect(classificarRegistros("sair", registros).grupos).toEqual([]);
    // O parecido de verdade continua achando: é a régua do servidor.
    expect(ids(classificarRegistros("ribeirao fumdo", registros), "ocorrencia")).toEqual(["oc-8"]);
  });

  it("quando casou fora do título, o detalhe mostra o trecho que casou", () => {
    const r = classificarRegistros("aparecida", REGISTROS);
    const item = r.grupos.find((g) => g.tipo === "ocorrencia")!.itens[0]!;
    expect(item.detalhe).toContain("Maria Aparecida Lins");
    expect(item.detalhe).toContain("Deslizamento, em campo");

    // Casou no título: o detalhe fica como está.
    const porTitulo = classificarRegistros("boa esperanca", REGISTROS);
    expect(porTitulo.grupos.find((g) => g.tipo === "ocorrencia")!.itens[0]!.detalhe)
      .toBe("Deslizamento, em campo");

    // Casou no protocolo, que a linha já mostra: o detalhe também fica.
    const porProtocolo = classificarRegistros("000123", REGISTROS);
    expect(porProtocolo.grupos.find((g) => g.tipo === "ocorrencia")!.itens[0]!.detalhe)
      .toBe("Deslizamento, em campo");

    // E o termo que já está no detalhe não é repetido.
    const porMatricula = classificarRegistros("SA-1042", REGISTROS);
    expect(porMatricula.grupos.find((g) => g.tipo === "usuario")!.itens[0]!.detalhe)
      .toBe("Coordenador, matrícula SA-1042");
  });
});

describe("Para onde cada resultado leva", () => {
  it("ocorrência abre a própria página; os cadastros abrem a lista, que é o que aceita hoje", () => {
    expect(destinoDoResultado("ocorrencia", "oc-1")).toBe("/ocorrencias/oc-1");
    expect(destinoDoResultado("usuario", "us-1")).toBe("/usuarios");
    expect(destinoDoResultado("equipe", "eq-1")).toBe("/equipes");
    expect(destinoDoResultado("orgao", "or-1")).toBe("/orgaos");
  });

  it("os grupos têm o nome que a lista mostra", () => {
    expect(ROTULO_DO_GRUPO).toEqual({
      ocorrencia: "Ocorrências", usuario: "Pessoas", equipe: "Equipes", orgao: "Órgãos",
    });
  });

  it("um papel só vê os grupos cujas telas ele pode abrir, pelo mesmo podeExecutar do menu", () => {
    /*
      O servidor decide o que devolve. Mas se ele devolver um usuário para o
      operador, a caixa levaria o operador para `/usuarios`, que responde com
      "seu perfil não tem acesso": beco sem saída construído de propósito.
    */
    const grupos = RESPOSTA_DO_SERVIDOR.grupos;
    expect(gruposVisiveis("coordenador", grupos).map((g) => g.tipo))
      .toEqual(["ocorrencia", "usuario", "equipe", "orgao"]);
    expect(gruposVisiveis("operador", grupos).map((g) => g.tipo)).toEqual(["ocorrencia"]);
    expect(gruposVisiveis("agente_campo", grupos).map((g) => g.tipo)).toEqual(["ocorrencia"]);
  });
});

describe("As duas pontas da porta de dados", () => {
  it("o modo de demonstração passa pelo classificador, e a ponta HTTP manda o sinal de cancelamento", () => {
    const local = readFileSync(join(DADOS, "local.ts"), "utf8");
    const http = readFileSync(join(DADOS, "http.ts"), "utf8");
    expect(local).toMatch(/export async function buscar\(/);
    expect(local).toMatch(/classificarRegistros\(/);
    expect(http).toMatch(/export async function buscar\(/);
    expect(http).toMatch(/\/busca\?q=/);
    // O `AbortController` da caixa precisa chegar ao `fetch`, senão cancela nada.
    expect(http).toMatch(/signal:\s*opcoes\.sinal/);
  });
});
