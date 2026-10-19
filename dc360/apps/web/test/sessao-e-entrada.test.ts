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
  caminhoDeVolta, conferirEntrada, destinoDepoisDeEntrar, estadoDaEntrada, telaInicial,
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
 *    a pessoa estava. Desde a V2-F00-E05 são TRÊS motivos, porque pedem três
 *    frases: expirou (`nao_autenticado`), encerrada (`sessao_encerrada`) e
 *    desativada (`conta_desativada`, 403: entrar de novo não resolve). O mesmo caminho de volta serve ao link profundo:
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
    http.aoRenovar(null);
  });

  it("renovação recusada: os tokens somem e quem se inscreveu é avisado uma vez", async () => {
    const chamadas: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      chamadas.push(url);
      if (url.endsWith("/auth/renovar")) {
        return resposta(401, { erro: "sessao_encerrada", mensagem: "Sessão expirada. Entre novamente." });
      }
      return resposta(401, { erro: "nao_autenticado", mensagem: "Token inválido ou expirado." });
    }));

    const expirou = vi.fn();
    http.aoExpirar(expirou);

    await expect(http.indicadores({} as never)).rejects.toMatchObject({ status: 401 });

    expect(expirou).toHaveBeenCalledTimes(1);
    expect(expirou).toHaveBeenCalledWith("expirou");
    expect(sessionStorage.getItem("dc360:tokens"), "token morto não pode ficar guardado").toBeNull();
    // Tentou renovar antes de desistir: é o caminho de sempre, preservado.
    expect(chamadas.some((u) => u.endsWith("/auth/renovar"))).toBe(true);
  });

  it("sessão encerrada (401 sessao_encerrada) derruba a tela com o motivo 'encerrada'", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/auth/renovar")) {
        return resposta(401, { erro: "sessao_encerrada", mensagem: "Sessão expirada. Entre novamente." });
      }
      return resposta(401, { erro: "sessao_encerrada", mensagem: "Sua sessão foi encerrada." });
    }));
    const expirou = vi.fn();
    http.aoExpirar(expirou);

    await expect(http.criarEquipe({} as never, "Delta", "")).rejects.toMatchObject({
      status: 401, codigo: "sessao_encerrada",
    });
    expect(expirou).toHaveBeenCalledTimes(1);
    expect(expirou).toHaveBeenCalledWith("encerrada");
    expect(sessionStorage.getItem("dc360:tokens")).toBeNull();
  });

  it("papel mudado (401 nao_autenticado) com a renovação viva renova e repete, e avisa a tela do papel novo", async () => {
    // Até a V2-F00-E07 o servidor respondia sessao_encerrada ao papel diferente.
    // Agora é nao_autenticado, "renove e repita": a renovação traz o papel novo.
    let escritas = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/auth/renovar")) {
        return resposta(200, {
          acesso: "novo", renovacao: "nova",
          usuario: { id: "u1", nome: "Helena Vasques Coutinho", papel: "operador" },
        });
      }
      escritas += 1;
      return escritas === 1
        ? resposta(401, { erro: "nao_autenticado", mensagem: "Token inválido ou expirado." })
        : resposta(200, { id: "e1" });
    }));
    const expirou = vi.fn();
    const renovou = vi.fn();
    http.aoExpirar(expirou);
    http.aoRenovar(renovou);
    await http.criarEquipe({} as never, "Delta", "");
    expect(escritas).toBe(2);
    expect(expirou).not.toHaveBeenCalled();
    expect(renovou).toHaveBeenCalledTimes(1);
    expect(renovou).toHaveBeenCalledWith({ papel: "operador", nome: "Helena Vasques Coutinho" });
  });

  it("renovação sem o usuário no corpo (servidor antigo) não avisa nada e não quebra", async () => {
    let escritas = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/auth/renovar")) return resposta(200, { acesso: "novo", renovacao: "nova" });
      escritas += 1;
      return escritas === 1
        ? resposta(401, { erro: "nao_autenticado", mensagem: "Token inválido ou expirado." })
        : resposta(200, { id: "e1" });
    }));
    const renovou = vi.fn();
    http.aoRenovar(renovou);
    await http.criarEquipe({} as never, "Delta", "");
    expect(escritas).toBe(2);
    expect(renovou).not.toHaveBeenCalled();
  });

  it("conta desativada (403 conta_desativada) derruba a tela com o motivo 'desativada' e apaga os tokens", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      resposta(403, { erro: "conta_desativada", mensagem: "Sua conta foi desativada." })));
    const expirou = vi.fn();
    http.aoExpirar(expirou);

    await expect(http.criarEquipe({} as never, "Delta", "")).rejects.toMatchObject({
      status: 403, codigo: "conta_desativada",
    });
    expect(expirou).toHaveBeenCalledTimes(1);
    expect(expirou).toHaveBeenCalledWith("desativada");
    expect(sessionStorage.getItem("dc360:tokens"), "conta desativada não guarda token").toBeNull();
  });

  it("token vencido cuja renovação diz 'conta desativada' leva ao motivo 'desativada', e não a 'expirou'", async () => {
    const chamadas: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      chamadas.push(url);
      if (url.endsWith("/auth/renovar")) {
        return resposta(403, { erro: "conta_desativada", mensagem: "Sua conta foi desativada." });
      }
      return resposta(401, { erro: "nao_autenticado", mensagem: "Token inválido ou expirado." });
    }));
    const expirou = vi.fn();
    http.aoExpirar(expirou);

    await expect(http.indicadores({} as never)).rejects.toMatchObject({ status: 401 });
    expect(expirou).toHaveBeenCalledTimes(1);
    expect(expirou).toHaveBeenCalledWith("desativada");
    // Uma renovação só, e nenhuma repetição do pedido: não há laço contra quem disse não.
    expect(chamadas.filter((u) => u.endsWith("/auth/renovar"))).toHaveLength(1);
    expect(sessionStorage.getItem("dc360:tokens")).toBeNull();
  });

  it("o código antigo `sessao` já não é sessão morta: não está no catálogo", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/auth/renovar")) return resposta(200, { acesso: "novo", renovacao: "nova" });
      return resposta(401, { erro: "sessao", mensagem: "Sessão expirada. Entre novamente." });
    }));
    const expirou = vi.fn();
    http.aoExpirar(expirou);
    await expect(http.indicadores({} as never)).rejects.toMatchObject({ status: 401 });
    expect(expirou).not.toHaveBeenCalled();
  });

  it("sessao_encerrada SEM token (desafio de segundo fator vencido) não finge que uma sessão acabou", async () => {
    sessionStorage.removeItem("dc360:tokens");
    vi.stubGlobal("fetch", vi.fn(async () =>
      resposta(401, { erro: "sessao_encerrada", mensagem: "Esta tentativa de entrada expirou." })));
    const expirou = vi.fn();
    http.aoExpirar(expirou);
    await expect(http.conferirSegundoFator("desafio-velho", "123456")).rejects.toMatchObject({
      codigo: "sessao_encerrada",
    });
    expect(expirou).not.toHaveBeenCalled();
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

  it.each([
    "posto_insuficiente", "posto_insuficiente_para_dado_pessoal", "email_so_por_administrador", "assinatura",
  ])("403 %s (do catálogo, sem ação) é erro comum: não renova nem derruba a tela (correção 2 da E05)", async (codigo) => {
    const buscar = vi.fn(async () => resposta(403, { erro: codigo, mensagem: "Seu perfil não alcança isto." }));
    vi.stubGlobal("fetch", buscar);
    const expirou = vi.fn();
    http.aoExpirar(expirou);
    await expect(http.indicadores({} as never)).rejects.toMatchObject({ status: 403, codigo });
    expect(expirou, "recusa de permissão não é sessão morta").not.toHaveBeenCalled();
    expect(buscar, "403 não pede renovação nem repete").toHaveBeenCalledTimes(1);
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

  it("entrar a partir de / leva à tela do papel, e não a 'Esta página não existe'", () => {
    /*
      O defeito de entrada (V2-F00-E13): quem digita só o domínio chega a `/`,
      a rota protegida manda para `/entrar` com `voltarPara: "/"`, e o painel
      voltava para `/` depois do login. Como `/` não tinha rota, o curinga
      respondia "Esta página não existe" logo depois de entrar.

      São duas metades, e as duas precisam ser provadas: aqui, a regra que
      recusa `/` como caminho de volta; no `App.tsx`, a rota índice que desvia
      para a tela do papel para quem digita `/` já com sessão aberta.
    */
    expect(destinoDepoisDeEntrar({ voltarPara: "/" }, "coordenador")).toBe("/painel");
    expect(destinoDepoisDeEntrar({ voltarPara: "/" }, "agente_campo")).toBe("/meu-trabalho");
    expect(destinoDepoisDeEntrar({ voltarPara: "/?x=1" }, "operador")).toBe("/painel");
    expect(destinoDepoisDeEntrar({ voltarPara: "/#topo" }, "operador")).toBe("/painel");
    expect(estadoDaEntrada({ voltarPara: "/" }).voltarPara).toBeNull();
    // E a raiz continua sendo rota: o curinga não pode mais pegá-la.
    const app = fonte("App.tsx");
    expect(app, "falta a rota índice que desvia a raiz para a tela do papel")
      .toMatch(/<Route\s+index\s+element=\{<Navigate\s+to=\{inicio\}\s+replace\s*\/>\}\s*\/>/);
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
    // Os três motivos da E05 passam; o nome antigo de código não vira motivo.
    expect(estadoDaEntrada({ motivo: "encerrada" }).motivo).toBe("encerrada");
    expect(estadoDaEntrada({ motivo: "desativada" }).motivo).toBe("desativada");
    expect(estadoDaEntrada({ motivo: "sessao" }).motivo).toBeNull();
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

  it("diz a frase certa para cada motivo, com ícone e texto, e só a de conta desativada manda procurar a coordenação", () => {
    const encerrada = desenhar({ motivo: "encerrada" });
    expect(encerrada).toMatch(/sua sess[ãa]o foi encerrada/i);
    expect(encerrada).toMatch(/entre de novo/i);
    expect(encerrada).not.toMatch(/coordena[çc][ãa]o/i);
    expect(encerrada).toMatch(/aviso--alerta[^>]*>\s*<svg/);

    const desativada = desenhar({ motivo: "desativada", voltarPara: "/painel" });
    expect(desativada).toMatch(/sua conta foi desativada/i);
    expect(desativada).toMatch(/procure a coordena[çc][ãa]o do seu munic[íi]pio/i);
    // Entrar de novo não resolve, e a frase não manda tentar: ela diz que não adianta.
    expect(desativada).toMatch(/n[ãa]o\s+resolve/i);
    expect(desativada, "conta desativada é grave: tom de perigo, não de alerta").toMatch(/aviso--perigo[^>]*>\s*<svg/);
    expect(desativada).not.toMatch(/sess[ãa]o expirou/i);
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

  it("sair de propósito não deixa caminho de volta para a pessoa seguinte", () => {
    /*
      O clique em "Sair" também passa pela rota protegida, porque a tela ainda
      está montada quando a sessão some. Sem a distinção, a tela abandonada
      ficava guardada e a PESSOA SEGUINTE a entrar naquele navegador caía nela.
    */
    expect(caminhoDeVolta(true, "/mapa")).toBeNull();
    // Sessão que cai sozinha é o caso oposto: o caminho é o que devolve a
    // pessoa ao trabalho interrompido.
    expect(caminhoDeVolta(false, "/ocorrencias/abc?x=1")).toBe("/ocorrencias/abc?x=1");
    // E a decisão não pode voltar para dentro do componente.
    const app = fonte("App.tsx");
    expect(app, "Protegida precisa usar caminhoDeVolta, e não repetir a regra")
      .toMatch(/voltarPara:\s*caminhoDeVolta\(/);
    const sessao = fonte("estado/sessao.tsx");
    expect(sessao).toContain("setSaidaVoluntaria(true)");
    // Entrar de novo limpa a marca, senão o link profundo seguinte seria perdido.
    expect(sessao).toMatch(/setMotivoDaSaida\(null\);\s*\r?\n\s*setSaidaVoluntaria\(false\);/);
  });

  it("o provedor de sessão se inscreve na expiração e guarda o motivo", () => {
    const sessao = fonte("estado/sessao.tsx");
    expect(sessao).toContain("aoExpirar(");
    // O motivo que a camada HTTP manda é o que a rota protegida leva à entrada.
    expect(sessao).toContain("setMotivoDaSaida(motivo)");
    expect(sessao).toContain("MotivoDaSessaoMorta");
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

describe("A sessão da tela acompanha o papel que a renovação trouxe (V2-F00-E07)", () => {
  it("o provedor se inscreve em aoRenovar, só reescreve quando algo mudou e grava o papel novo", () => {
    const codigo = fonte("estado/sessao.tsx");
    expect(codigo).toMatch(/aoRenovar\(\(usuario\) => \{/);
    expect(codigo, "se inscreve e solta a inscrição ao desmontar").toMatch(/return \(\) => aoRenovar\(null\)/);
    expect(codigo, "papel igual e nome igual não refazem a tela").toMatch(
      /atual\.papel === usuario\.papel && atual\.usuarioNome === usuario\.nome/,
    );
    expect(codigo).toMatch(/papel: usuario\.papel/);
  });
});
