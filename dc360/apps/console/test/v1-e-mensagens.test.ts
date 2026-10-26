import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DONO,
  codigoNovo,
  subirConsoleDeTeste,
  type ConsoleDeTeste,
} from "./apoio/console-de-teste.js";

/**
 * O console fala `/v1` e responde em português (V2-F02-E02 e DV-38).
 *
 * Duas coisas que nenhum teste de funcionalidade cobrava:
 *
 *   1. A página passa a pedir tudo sob `/v1` e o caminho sem prefixo segue de
 *      pé como espelho (para a página que alguém deixou aberta). Os dois são a
 *      MESMA rota: mesmo portão, mesmo teto de tentativas, mesma resposta.
 *   2. O erro de validação saía em inglês ("Invalid input: expected string,
 *      received undefined"), porque o console nunca carregava o mapa de
 *      mensagens do pacote compartilhado. A forma é `{ erro, mensagem, campos }`.
 */

const EM_INGLES = /invalid|expected|received|required|too small|too big|must be|string|number/i;

let c: ConsoleDeTeste;
let token: string;

beforeAll(async () => {
  c = await subirConsoleDeTeste();
  token = await c.entrar(DONO.email, DONO.senha, c.segredoDoDono);
}, 180_000);

afterAll(async () => {
  await c?.encerrar();
});

const comSessao = () => ({ authorization: `Bearer ${token}` });

describe("O console responde sob /v1 e no espelho sem prefixo", () => {
  it("sem sessao, GET /v1/municipios responde 401 e o espelho tambem", async () => {
    const v1 = await c.app.inject({ method: "GET", url: "/v1/municipios" });
    const legado = await c.app.inject({ method: "GET", url: "/municipios" });
    expect(v1.statusCode).toBe(401);
    expect(legado.statusCode).toBe(401);
    expect(v1.json()).toEqual(legado.json());
  });

  it("com sessao, as duas leituras devolvem o mesmo corpo", async () => {
    const v1 = await c.app.inject({ method: "GET", url: "/v1/municipios", headers: comSessao() });
    const legado = await c.app.inject({ method: "GET", url: "/municipios", headers: comSessao() });
    expect(v1.statusCode).toBe(200);
    expect(v1.json()).toEqual(legado.json());
  });

  it("a porta inteira funciona sob /v1 (senha, codigo e sessao)", async () => {
    const primeira = await c.app.inject({
      method: "POST",
      url: "/v1/entrar",
      payload: { email: DONO.email, senha: DONO.senha },
    });
    expect(primeira.statusCode).toBe(200);
    expect(primeira.json().falta).toBe("codigo");
    const segunda = await c.app.inject({
      method: "POST",
      url: "/v1/entrar/codigo",
      payload: { desafio: primeira.json().desafio, codigo: codigoNovo(c.relogio, c.segredoDoDono) },
    });
    expect(segunda.statusCode).toBe(200);
    const lista = await c.app.inject({
      method: "GET",
      url: "/v1/municipios",
      headers: { authorization: `Bearer ${segunda.json().token as string}` },
    });
    expect(lista.statusCode).toBe(200);
  });

  it("infraestrutura e estaticos ficam sem prefixo: /v1/saude e /v1/ respondem 404", async () => {
    expect((await c.app.inject({ method: "GET", url: "/saude" })).statusCode).toBe(200);
    expect((await c.app.inject({ method: "GET", url: "/v1/saude" })).statusCode).toBe(404);
    expect((await c.app.inject({ method: "GET", url: "/v1/console.js" })).statusCode).toBe(404);
  });

  it("a pagina pede tudo pelo ponto unico que poe o /v1", async () => {
    const js = (await c.app.inject({ method: "GET", url: "/console.js" })).body;
    expect(js).toContain('var BASE_DA_API = "/v1";');
    expect(js).toContain("fetch(BASE_DA_API + caminho, opcoes)");
    // Nenhum outro fetch na pagina: o ponto unico e o unico.
    expect(js.match(/\bfetch\(/g)?.length).toBe(1);
  });
});

describe("O erro de validacao do console sai em portugues, na forma { erro, mensagem, campos }", () => {
  const CASOS: Array<[string, string, Record<string, unknown>, boolean]> = [
    ["POST", "/prefeituras", {}, true],
    ["POST", "/operadores", {}, true],
    ["POST", "/senha", {}, true],
    ["POST", "/codigos-de-recuperacao", {}, true],
    ["POST", "/recuperar", {}, false],
  ];

  for (const prefixo of ["/v1", ""]) {
    for (const [metodo, caminho, corpo, comSessaoAberta] of CASOS) {
      it(`${metodo} ${prefixo}${caminho} com corpo vazio responde 400 em portugues`, async () => {
        const r = await c.app.inject({
          method: metodo as "POST",
          url: prefixo + caminho,
          payload: corpo,
          ...(comSessaoAberta ? { headers: comSessao() } : {}),
        });
        expect(r.statusCode, r.body).toBe(400);
        const resposta = r.json();
        expect(resposta.erro).toBe("pedido_invalido");
        expect(resposta.mensagem).toBeTypeOf("string");
        expect(resposta.mensagem).not.toMatch(EM_INGLES);
        expect(Array.isArray(resposta.campos)).toBe(true);
        expect(resposta.campos.length).toBeGreaterThan(0);
        for (const campo of resposta.campos as Array<{ campo: string; mensagem: string }>) {
          expect(campo.campo).toBeTypeOf("string");
          expect(campo.mensagem).not.toMatch(EM_INGLES);
        }
      });
    }
  }

  it("campo ausente diz 'Campo obrigatorio' e tipo errado tambem fala portugues", async () => {
    const ausente = await c.app.inject({
      method: "POST",
      url: "/v1/operadores",
      payload: {},
      headers: comSessao(),
    });
    expect(ausente.json().mensagem).toBe("Campo obrigatório");
    expect(ausente.json().campos[0].campo).toBe("email");

    const tipoErrado = await c.app.inject({
      method: "POST",
      url: "/v1/operadores",
      payload: { email: 123 },
      headers: comSessao(),
    });
    expect(tipoErrado.statusCode).toBe(400);
    expect(tipoErrado.json().mensagem).not.toMatch(EM_INGLES);
  });

  it("a frase que o proprio esquema escreveu continua vencendo o mapa", async () => {
    const r = await c.app.inject({
      method: "POST",
      url: "/v1/senha",
      payload: { senhaAtual: "" },
      headers: comSessao(),
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().mensagem).not.toMatch(EM_INGLES);
  });
});

describe("O teto de tentativas e UM so, nos dois prefixos", () => {
  let apertado: ConsoleDeTeste;

  beforeAll(async () => {
    apertado = await subirConsoleDeTeste({ limitePorEndereco: 3 });
  }, 180_000);

  afterAll(async () => {
    await apertado?.encerrar();
  });

  it("alternar /v1/entrar e /entrar nao dobra o teto da porta", async () => {
    const desfechos: number[] = [];
    for (const url of ["/entrar", "/v1/entrar", "/entrar", "/v1/entrar"]) {
      const r = await apertado.app.inject({
        method: "POST",
        url,
        payload: { email: DONO.email, senha: "chute" },
      });
      desfechos.push(r.statusCode);
    }
    expect(
      desfechos,
      "quatro tentativas com teto de tres, alternando o prefixo: a quarta tem de ser barrada",
    ).toEqual([401, 401, 401, 429]);
  }, 60_000);

  it("o 429 do cadastro sob /v1 diz a espera do cadastro, e nao a da porta", async () => {
    const outro = await subirConsoleDeTeste({ limiteDeCadastro: 1 });
    try {
      const sessao = await outro.entrar(DONO.email, DONO.senha, outro.segredoDoDono);
      const cabecalho = { authorization: `Bearer ${sessao}` };
      const primeira = await outro.app.inject({
        method: "POST",
        url: "/v1/prefeituras",
        payload: {},
        headers: cabecalho,
      });
      expect(primeira.statusCode).toBe(400);
      const segunda = await outro.app.inject({
        method: "POST",
        url: "/v1/prefeituras",
        payload: {},
        headers: cabecalho,
      });
      expect(segunda.statusCode).toBe(429);
      expect(segunda.json().erro).toBe("muitas_tentativas");
      expect(segunda.json().mensagem).toBe("Cadastros demais deste endereço. Espere uma hora.");
    } finally {
      await outro.encerrar();
    }
  }, 120_000);
});
