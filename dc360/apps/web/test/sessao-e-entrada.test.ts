import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as http from "../src/dados/http";
import { ProvedorSessao } from "../src/estado/sessao";
import { Entrar } from "../src/paginas/Entrar";
import {
  conferirEntrada, destinoDepoisDeEntrar, estadoDaEntrada, telaInicial,
} from "../src/paginas/entrar-regras";

/**
 * A sessão que acaba, e a entrada que devolve a pessoa para onde ela estava.
 *
 * O DEFEITO, provado pelo revisor contra a API: o token de acesso vive quinze
 * minutos e o de renovação, dias. Quando a renovação falha (a sessão foi
 * revogada, o município redefiniu a senha, o token de renovação venceu de
 * madrugada), `http.ts` apagava só os tokens. A sessão da tela continuava em
 * `sessionStorage`, `Protegida` deixava passar, e cada tela mostrava "Falha
 * ao carregar: Token inválido ou expirado" para sempre, sem caminho de volta
 * a não ser adivinhar que "Sair" resolve. Isso ia acontecer toda manhã.
 *
 * O CONSERTO tem duas pontas, e as duas são cobradas aqui:
 *
 * 1. `chamar` reconhece o 401 de sessão morta (`nao_autenticado`, que só a
 *    autenticação do servidor emite), apaga os tokens e avisa quem se
 *    inscreveu por `aoExpirar`. Um 401 de senha errada (`credenciais`) NÃO é
 *    expiração, e não pode derrubar a tela de login em cima de quem errou a
 *    senha.
 * 2. A tela de entrada lê o motivo e o caminho de volta do estado da
 *    navegação, diz "sua sessão expirou" e, depois de entrar, volta para onde
 *    a pessoa estava. O mesmo caminho de volta serve ao link profundo:
 *    `/ocorrencias/<id>` sem sessão passa por `/entrar` e chega ao dossiê, em
 *    vez de morrer no painel.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const SRC = join(AQUI, "..", "src");
const fonte = (relativo: string) => readFileSync(join(SRC, relativo), "utf8");

/** Um `sessionStorage` de mentira: o teste roda em Node, sem janela. */
function armazenamento(): Storage {
  const dados = new Map<string, string>();
  return {
    get length() { return dados.size; },
    clear: () => dados.clear(),
    getItem: (k: string) => dados.get(k) ?? null,
    key: (i: number) => [...dados.keys()][i] ?? null,
    removeItem: (k: string) => { dados.delete(k); },
    setItem: (k: string, v: string) => { dados.set(k, v); },
  } as Storage;
}

function resposta(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status, headers: { "content-type": "application/json" },
  });
}

describe("O 401 de sessão morta avisa a tela", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", armazenamento());
    sessionStorage.setItem("dc360:tokens", JSON.stringify({ acesso: "velho", renovacao: "gasto" }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    http.aoExpirar(null);
  });

  it("renovação recusada: os tokens somem e quem se inscreveu é avisado uma vez", async () => {
    const chamadas: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      chamadas.push(url);
      if (url.endsWith("/auth/renovar")) {
        return resposta(401, { erro: "sessao", mensagem: "Sessão expirada. Entre novamente." });
      }
      return resposta(401, { erro: "nao_autenticado", mensagem: "Token inválido ou expirado." });
    }));

    const expirou = vi.fn();
    http.aoExpirar(expirou);

    await expect(http.indicadores({} as never)).rejects.toMatchObject({ status: 401 });

    expect(expirou).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("dc360:tokens"), "token morto não pode ficar guardado").toBeNull();
    // Tentou renovar antes de desistir: é o caminho de sempre, preservado.
    expect(chamadas.some((u) => u.endsWith("/auth/renovar"))).toBe(true);
  });

  it("senha errada na entrada é 401 de credencial, e NÃO expiração", async () => {
    sessionStorage.removeItem("dc360:tokens");
    vi.stubGlobal("fetch", vi.fn(async () =>
      resposta(401, { erro: "credenciais", mensagem: "Email ou senha inválidos." })));

    const expirou = vi.fn();
    http.aoExpirar(expirou);

    await expect(http.entrarComSenha("a@b.c", "x")).rejects.toMatchObject({ codigo: "credenciais" });
    expect(expirou, "derrubar a tela de login em cima de quem errou a senha").not.toHaveBeenCalled();
  });

  it("um 401 de credencial em rota autenticada (senha atual errada) também não é expiração", async () => {
    // A renovação responde como o servidor de verdade responderia com a
    // sessão viva: token novo. O 401 seguinte é da senha atual errada.
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/auth/renovar")) return resposta(200, { acesso: "novo", renovacao: "nova" });
      return resposta(401, { erro: "credenciais", mensagem: "A senha atual nao confere." });
    }));
    const expirou = vi.fn();
    http.aoExpirar(expirou);
    await expect(http.trocarSenha("errada", "nova-senha-comprida-12")).rejects.toMatchObject({ status: 401 });
    expect(expirou).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("dc360:tokens"), "a sessão continua de pé").not.toBeNull();
  });
});

describe("As regras da entrada, fora do React", () => {
  it("email e senha vazios são erro de campo, cada um no seu", () => {
    expect(conferirEntrada({ email: "   ", senha: "" })).toEqual({
      ok: false,
      erros: { email: expect.stringMatching(/email/i), senha: expect.stringMatching(/senha/i) },
    });
    expect(conferirEntrada({ email: "a@b.c", senha: "" })).toEqual({
      ok: false, erros: { senha: expect.stringMatching(/senha/i) },
    });
    expect(conferirEntrada({ email: " a@b.c ", senha: "x" })).toEqual({
      ok: true, dados: { email: "a@b.c", senha: "x" },
    });
  });

  it("o caminho de volta só aceita rota interna do painel", () => {
    expect(destinoDepoisDeEntrar({ voltarPara: "/ocorrencias/abc?x=1" }, "coordenador"))
      .toBe("/ocorrencias/abc?x=1");
    // Sem caminho guardado, cada papel cai na tela dele, como o App já decide.
    expect(destinoDepoisDeEntrar(null, "coordenador")).toBe("/painel");
    expect(destinoDepoisDeEntrar(null, "agente_campo")).toBe("/meu-trabalho");
    expect(destinoDepoisDeEntrar({ voltarPara: undefined }, "operador")).toBe("/painel");
    // Endereço de fora e "protocolo-relativo" não viram destino: o estado da
    // navegação é interno, mas a regra é barata e fecha a porta de vez.
    expect(destinoDepoisDeEntrar({ voltarPara: "https://exemplo.com" }, "coordenador")).toBe("/painel");
    expect(destinoDepoisDeEntrar({ voltarPara: "//exemplo.com" }, "coordenador")).toBe("/painel");
    // Voltar para a própria tela de entrada seria um laço.
    expect(destinoDepoisDeEntrar({ voltarPara: "/entrar" }, "coordenador")).toBe("/painel");
  });

  it("telaInicial é uma só, e o App usa a mesma", () => {
    expect(telaInicial(undefined)).toBe("/entrar");
    expect(telaInicial("agente_campo")).toBe("/meu-trabalho");
    expect(telaInicial("operador")).toBe("/painel");
    const app = fonte("App.tsx");
    expect(app, "o App precisa importar telaInicial de entrar-regras, e não repetir a regra")
      .toMatch(/import \{[^}]*\btelaInicial\b[^}]*\} from "\.\/paginas\/entrar-regras"/);
    expect(app).not.toMatch(/function telaInicial\(/);
  });

  it("o estado da navegação é lido com desconfiança", () => {
    expect(estadoDaEntrada(null)).toEqual({ motivo: null, voltarPara: null });
    expect(estadoDaEntrada({ motivo: "expirou", voltarPara: "/mapa" }))
      .toEqual({ motivo: "expirou", voltarPara: "/mapa" });
    expect(estadoDaEntrada({ motivo: "qualquer", voltarPara: 42 }))
      .toEqual({ motivo: null, voltarPara: null });
  });
});

describe("A tela de entrada", () => {
  function desenhar(state: unknown): string {
    return renderToStaticMarkup(
      h(ProvedorSessao, null,
        h(MemoryRouter, { initialEntries: [{ pathname: "/entrar", state }] },
          h(Entrar))),
    );
  }

  it("diz que a sessão expirou quando chegou aqui por isso, e não diz nada quando não", () => {
    const expirada = desenhar({ motivo: "expirou", voltarPara: "/ocorrencias/abc" });
    expect(expirada).toMatch(/sess[ãa]o expirou/i);
    expect(expirada).toMatch(/entre de novo/i);
    // Ícone e texto: estado nunca só por cor.
    expect(expirada).toMatch(/aviso--alerta[^>]*>\s*<svg/);

    const comum = desenhar(null);
    expect(comum).not.toMatch(/sess[ãa]o expirou/i);
  });

  it("valida vazio no cliente, campo a campo, e casa os campos do 422", () => {
    const entrar = fonte("paginas/Entrar.tsx");
    expect(entrar, "a validação de vazio precisa vir de entrar-regras").toContain("conferirEntrada(");
    expect(entrar, "o 422 traz `campos`, e a tela precisa casá-los como as outras fazem")
      .toContain("errosPorCampo(");
    // O erro de campo vai no Campo, que é onde `aria-invalid` e o texto embaixo nascem.
    expect(entrar).toMatch(/id="entrada-email"[^>]*erro=\{errosDeCampo\["email"\]\}/);
    expect(entrar).toMatch(/id="entrada-senha"[^>]*erro=\{errosDeCampo\["senha"\]\}/);
  });

  it("depois de entrar, volta para onde a pessoa estava, nos dois modos", () => {
    const entrar = fonte("paginas/Entrar.tsx");
    // Uma chamada em cada formulário: o de senha (API) e o de escolha de perfil (local).
    expect(entrar.match(/destinoDepoisDeEntrar\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(entrar, "nenhum caminho pode continuar mandando cego para /painel")
      .not.toMatch(/navegar\("\/painel"\)/);
  });
});

describe("A rota protegida guarda de onde a pessoa veio", () => {
  it("Protegida manda para /entrar com o motivo e o caminho de volta", () => {
    const app = fonte("App.tsx");
    const inicio = app.indexOf("function Protegida(");
    const fim = app.indexOf("function Exige(");
    const protegida = app.slice(inicio, fim);
    expect(protegida).toContain("useLocation()");
    expect(protegida).toMatch(/<Navigate[^>]*to="\/entrar"[^>]*state=\{/);
    expect(protegida).toContain("voltarPara");
  });

  it("o provedor de sessão se inscreve na expiração e guarda o motivo", () => {
    const sessao = fonte("estado/sessao.tsx");
    expect(sessao).toContain("aoExpirar(");
    expect(sessao).toContain('"expirou"');
    // Entrar de novo limpa o motivo, senão a mensagem volta na próxima saída comum.
    expect(sessao).toMatch(/motivoDaSaida/);
  });

  it("aoExpirar existe nos dois modos e sai pelo repositório", async () => {
    const local = await import("../src/dados/local");
    const repositorio = await import("../src/dados/repositorio");
    expect(typeof http.aoExpirar).toBe("function");
    expect(typeof local.aoExpirar).toBe("function");
    expect(Object.keys(repositorio)).toContain("aoExpirar");
  });
});

describe("Servidor fora: a frase certa para leitura e para escrita", () => {
  beforeEach(() => { vi.stubGlobal("sessionStorage", armazenamento()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("abrir uma tela sem servidor diz que nada foi carregado, e não que nada foi enviado", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const erro = await http.indicadores({} as never).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(http.SemConexao);
    const mensagem = (erro as Error).message;
    expect(mensagem).toMatch(/n[ãa]o foi poss[íi]vel carregar|nada foi carregado/i);
    expect(mensagem, "quem só abriu o painel não preencheu nada").not.toMatch(/preencheu/);
    expect(mensagem).toMatch(/tente de novo/i);
  });

  it("gravar sem servidor continua dizendo que o que foi preenchido não saiu", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const erro = await http.criarEquipe({} as never, "Delta", "").catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(http.SemConexao);
    expect((erro as Error).message).toMatch(/preencheu n[ãa]o foi enviado/);
  });

  it("painel e lista oferecem 'Tentar de novo' na falha de carga", () => {
    for (const arquivo of ["paginas/Painel.tsx", "paginas/Ocorrencias.tsx"]) {
      const codigo = fonte(arquivo);
      const falha = /if \(erro\) \{?\s*return \(?[\s\S]{0,600}?<\/Aviso>/.exec(codigo)?.[0] ?? "";
      expect(falha, `${arquivo}: o aviso de falha de carga sumiu ou mudou de forma`).not.toBe("");
      // O `onClick` do botão carrega uma seta, e a seta tem `>` no meio: o
      // fecho da tag não serve de âncora, o texto do botão serve.
      expect(falha, `${arquivo}: falha de carga sem botão de tentar de novo`)
        .toMatch(/<button[\s\S]*?Tentar de novo\s*<\/button>/);
    }
  });
});
