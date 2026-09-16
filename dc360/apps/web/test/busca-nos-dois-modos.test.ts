import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import * as http from "../src/dados/http";
import * as local from "../src/dados/local";
import type { Sessao } from "../src/dados/tipos";
import { CorpoDaBusca, type PropsCorpoDaBusca } from "../src/componentes/BuscaGlobal";
import { destinoDoEnter } from "../src/busca/registros";
import { filtrarTarefas } from "../src/paginas/meu-trabalho-regras";

/**
 * A busca da lista e a caixa do topo, no modo de demonstração, respondendo o
 * que o servidor responde.
 *
 * TRÊS DEFEITOS, provados pelo revisor no Chromium:
 *
 * 1. A lista em modo de demonstração filtrava por `lower() LIKE`: "acacias"
 *    não achava "Rua das Acácias, 245", e "Acácias" achava. O servidor usa
 *    `normalizar_busca` e `casa_busca` da migração 041, que o Postgres da
 *    aba também roda, então a demonstração estava mais burra que o produto
 *    sem motivo.
 * 2. O agente de campo via, no grupo "Ocorrências" da caixa, as ocorrências
 *    das outras equipes, e ao abrir uma caía numa página só com "Voltar". O
 *    servidor recorta pela equipe do cadastro dele; a demonstração não.
 * 3. Enter na caixa levava o agente a `/meu-trabalho?busca=...`, e a tela
 *    ignorava o parâmetro.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const SRC = join(AQUI, "..", "src");
const fonte = (relativo: string) => readFileSync(join(SRC, relativo), "utf8");

const ORG_SERRA_ALTA = "11111111-1111-4111-8111-000000000001";

function sessaoDe(contas: Awaited<ReturnType<typeof local.contasDisponiveis>>, papel: string): Sessao {
  const c = contas.find((x) => x.papel === papel && x.organizacao_id === ORG_SERRA_ALTA);
  if (!c) throw new Error(`a semente não tem ${papel} em Serra Alta`);
  return {
    organizacaoId: c.organizacao_id, organizacaoNome: c.organizacao_nome,
    municipio: c.municipio, uf: c.uf,
    usuarioId: c.usuario_id, usuarioNome: c.usuario_nome, papel: c.papel,
  };
}

describe("A lista filtrada por texto, nos dois modos", () => {
  let coordenadora: Sessao;

  beforeAll(async () => {
    coordenadora = sessaoDe(await local.contasDisponiveis(), "coordenador");
  }, 120_000);

  afterEach(() => { vi.unstubAllGlobals(); });

  it("modo de demonstração: 'acacias' acha 'Rua das Acácias, 245', como 'Acácias' já achava", async () => {
    const semAcento = await local.listarPaginaDeOcorrencias(coordenadora, { busca: "acacias", status: "todas" });
    const comAcento = await local.listarPaginaDeOcorrencias(coordenadora, { busca: "Acácias", status: "todas" });
    expect(comAcento.itens.map((o) => o.protocolo)).toContain("000471/2026");
    expect(semAcento.itens.map((o) => o.protocolo), "sem acento tem que achar o mesmo").toContain("000471/2026");
    expect(semAcento.total).toBe(comAcento.total);
  });

  it("modo de demonstração: tolera a letra trocada, como o servidor tolera", async () => {
    const r = await local.listarPaginaDeOcorrencias(coordenadora, { busca: "Morro do Cruzeyro", status: "todas" });
    expect(r.itens.map((o) => o.protocolo)).toContain("000471/2026");
  });

  it("modo de demonstração: o protocolo digitado inteiro vem no topo", async () => {
    const r = await local.listarPaginaDeOcorrencias(coordenadora, { busca: "000478/2026", status: "todas" });
    expect(r.itens[0]?.protocolo).toBe("000478/2026");
  });

  it("modo de demonstração: o relato continua sendo procurado por substring", async () => {
    // "Talude" só existe no relato de 000471.
    const r = await local.listarPaginaDeOcorrencias(coordenadora, { busca: "talude", status: "todas" });
    expect(r.itens.map((o) => o.protocolo)).toContain("000471/2026");
  });

  it("modo com servidor: o termo viaja como foi digitado, e é o servidor que normaliza", async () => {
    vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ itens: [], total: 0, pagina: 1, porPagina: 10 }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }));
    await http.listarPaginaDeOcorrencias(coordenadora, { busca: "acacias", status: "todas" });
    expect(urls[0]).toContain("busca=acacias");

    /*
      A outra metade da prova mora no teste da API, que roda o mesmo termo
      contra a rota de verdade nos dois sabores de banco. Citado aqui para o
      par não se separar: se aquele caso sumir, este reprova.
    */
    const testeDaApi = readFileSync(
      join(AQUI, "..", "..", "api", "test", "busca.test.ts"), "utf8",
    );
    expect(testeDaApi).toMatch(/GET \/ocorrencias\?busca= usa a mesma normalização/);
    expect(testeDaApi).toMatch(/lista\("ACÁCIAS"\)[\s\S]{0,200}000471\/2026/);
  });
});

describe("A caixa do topo para o agente de campo, no modo de demonstração", () => {
  let agente: Sessao;
  let coordenadora: Sessao;

  beforeAll(async () => {
    const contas = await local.contasDisponiveis();
    agente = sessaoDe(contas, "agente_campo");
    coordenadora = sessaoDe(contas, "coordenador");
  }, 120_000);

  function protocolos(r: Awaited<ReturnType<typeof local.buscar>>): string[] {
    return r.grupos.find((g) => g.tipo === "ocorrencia")?.itens.map((i) => i.protocolo ?? "") ?? [];
  }

  it("o agente só acha ocorrência da equipe dele em campo, como GET /busca faz", async () => {
    // Diego é da Alfa. 000471 é da Alfa e está em campo; 000478 é da Bravo.
    const doAgente = protocolos(await local.buscar(agente, "rua"));
    expect(doAgente).toContain("000471/2026");
    expect(doAgente, "ocorrência de outra equipe apareceu para o agente").not.toContain("000478/2026");

    // A coordenadora continua vendo as duas: o recorte é do papel.
    const daCoordenadora = protocolos(await local.buscar(coordenadora, "rua"));
    expect(daCoordenadora).toContain("000478/2026");
  });

  it("o agente não acha, nem pelo protocolo exato, ocorrência de outra equipe", async () => {
    expect(protocolos(await local.buscar(agente, "000478"))).toEqual([]);
  });
});

describe("Enter na caixa leva cada papel para a tela dele, e diz isso", () => {
  it("o destino e a frase vêm da mesma regra", () => {
    expect(destinoDoEnter("agente_campo").para).toBe("/meu-trabalho");
    expect(destinoDoEnter("agente_campo").frase).toMatch(/Meu trabalho/);
    expect(destinoDoEnter("coordenador").para).toBe("/ocorrencias");
    expect(destinoDoEnter("coordenador").frase).toMatch(/lista de ocorrências/);
    expect(destinoDoEnter("operador").para).toBe("/ocorrencias");
  });

  it("o estado vazio da caixa diz para onde o Enter leva, para o agente também", () => {
    const props: PropsCorpoDaBusca = {
      consulta: "xyz", aberta: true, ativo: null, opcoes: [], situacao: "ok", atalho: "Ctrl K",
      fraseDoEnter: destinoDoEnter("agente_campo").frase,
      iconeDe: () => h("span"),
      aoMudar: () => {}, aoTeclar: () => {}, aoEscolher: () => {}, aoEnviar: () => {}, aoFocar: () => {},
    };
    const html = renderToStaticMarkup(h(CorpoDaBusca, props));
    expect(html).toContain("Nada encontrado para");
    expect(html).toMatch(/Enter abre Meu trabalho filtrado/);
    expect(html).not.toMatch(/Enter abre a lista de ocorrências/);
  });

  it("BuscaGlobal usa a regra nos dois lugares, e não repete o podeExecutar", () => {
    const codigo = fonte("componentes/BuscaGlobal.tsx");
    expect(codigo.match(/destinoDoEnter\(/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(codigo).not.toMatch(/podeExecutar\(papel, "registrar_vistoria"\) \? "\/meu-trabalho"/);
  });
});

describe("Meu trabalho aplica a busca da URL", () => {
  const tarefas = [
    { protocolo: "000471/2026", endereco: "Rua das Acácias, 245, Morro do Cruzeiro" },
    { protocolo: "000478/2026", endereco: "Rua Ribeirão Fundo, 402, Bairro Nossa Senhora" },
  ];

  it("filtra por protocolo ou endereço, sem acento e sem caixa", () => {
    expect(filtrarTarefas("acacias", tarefas).map((t) => t.protocolo)).toEqual(["000471/2026"]);
    expect(filtrarTarefas("000478", tarefas).map((t) => t.protocolo)).toEqual(["000478/2026"]);
    expect(filtrarTarefas("RUA", tarefas)).toHaveLength(2);
    expect(filtrarTarefas("", tarefas)).toHaveLength(2);
    expect(filtrarTarefas("   ", tarefas)).toHaveLength(2);
    expect(filtrarTarefas("zzz", tarefas)).toEqual([]);
  });

  it("a tela lê ?busca= e diz que está filtrando", () => {
    const codigo = fonte("paginas/MeuTrabalho.tsx");
    expect(codigo).toContain("useSearchParams");
    expect(codigo).toContain("filtrarTarefas(");
    // Há como limpar: um filtro que só sai editando a URL é um beco.
    expect(codigo).toMatch(/Limpar/);
  });
});
