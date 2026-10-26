import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { ROTAS_ABERTAS_COM_SENHA_PROVISORIA, construirServidor } from "../src/servidor.js";
import {
  PREFIXO_V1,
  ROTAS_FORA_DO_PREFIXO,
  ROTAS_SO_NO_V1,
  cabecalhosDeDepreciacao,
  semPrefixoDeVersao,
} from "../src/versao-v1.js";
import { rotasRegistradas } from "./superficie-registrada.js";

/**
 * O prefixo `/v1` e o espelho legado sem prefixo (V2-F02-E01).
 *
 * Toda rota de negócio existe nos dois endereços, e o legado só ganha
 * cabeçalhos de depreciação. O que este arquivo trava:
 *
 *   - PARIDADE, pelas rotas que o Fastify de fato registrou (nunca por lista
 *     escrita aqui): toda rota legada tem par em `/v1` e vice-versa, salvo as
 *     quatro de infraestrutura (`ROTAS_FORA_DO_PREFIXO`) e as declaradas só em
 *     `/v1` (`ROTAS_SO_NO_V1`, vazia hoje).
 *   - O espelho se comporta igual: mesma resposta, mesmo 404 entre
 *     municípios, mesma senha provisória, mesmo 503 da fila do campo, mesmo
 *     limitador (e o do login NÃO dobra pela escolha do prefixo).
 *   - Os cabeçalhos: só o legado os tem, inclusive nas respostas de erro, e o
 *     `Link` nunca devolve a query string.
 */

const SENHA = "defesa-civil-2026";
const ORG_A = "11111111-1111-4111-8111-000000000001";
const DIEGO = "11111111-1111-4111-8111-0000000000d3";
const EMAIL_HELENA = "helena.coutinho@serraalta.exemplo.gov.br";
const EMAIL_RITA = "rita.lopes@serraalta.exemplo.gov.br";
const EMAIL_DIEGO = "diego.alves@serraalta.exemplo.gov.br";
const EMAIL_B = "aurelio.machado@valefundo.exemplo.gov.br";
const SEGREDO = "segredo-da-versao-v1-com-mais-de-32-bytes!";
const ESPELHO_ATE = "2027-06-30";
const ID_FALSO = "00000000-0000-4000-8000-000000000000";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenHelena: string;
let tokenRita: string;
let tokenB: string;
let idOcorrenciaA: string;

const com = (t: string) => ({ authorization: `Bearer ${t}` });

function configDe(extra: Record<string, string> = {}) {
  return carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: SEGREDO,
    LOGIN_POR_IP: "10000",
    ESPELHO_LEGADO_ATE: ESPELHO_ATE,
    ...extra,
  } as NodeJS.ProcessEnv);
}

async function entrar(email: string, senha = SENHA): Promise<string> {
  const r = await app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha } });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso as string;
}

async function reativar(): Promise<void> {
  await mem.bruto.query(
    `UPDATE organizacoes SET eliminada_em = NULL, eliminacao_agendada_para = NULL,
            acesso_suspenso_em = NULL, suspensao_motivo = NULL WHERE id = $1`,
    [ORG_A],
  );
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  app = await construirServidor({
    banco: mem.banco,
    config: configDe(),
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  tokenHelena = await entrar(EMAIL_HELENA);
  tokenRita = await entrar(EMAIL_RITA);
  tokenB = await entrar(EMAIL_B);

  const criada = await app.inject({
    method: "POST",
    url: `${PREFIXO_V1}/ocorrencias`,
    headers: com(tokenHelena),
    payload: {
      solicitanteNome: "Marilda Souza Prado",
      canalEntrada: "telefone",
      endereco: "Rua das Acácias, 245",
      tipo: "deslizamento",
      descricao: "Talude cedeu depois da chuva da madrugada.",
    },
  });
  expect(criada.statusCode, criada.body).toBe(201);
  idOcorrenciaA = criada.json().id as string;
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Paridade: o Fastify registrou as mesmas rotas nos dois endereços", () => {
  const todas = () => rotasRegistradas(app).map((r) => `${r.metodo} ${r.caminho}`);
  const doV1 = () => todas().filter((k) => k.split(" ")[1]!.startsWith(`${PREFIXO_V1}/`));
  const doLegado = () => todas().filter((k) => !k.split(" ")[1]!.startsWith(`${PREFIXO_V1}/`));
  const semVersao = (k: string) => {
    const [metodo, caminho] = k.split(" ");
    return `${metodo} ${semPrefixoDeVersao(caminho!)}`;
  };

  it("âncora: a leitura da árvore enxerga as rotas dos dois lados", () => {
    expect(doLegado().length).toBeGreaterThan(100);
    expect(doV1().length).toBeGreaterThan(100);
    expect(doV1()).toContain("GET /v1/ocorrencias");
    expect(doLegado()).toContain("GET /ocorrencias");
  });

  it("toda rota legada tem par em /v1, salvo as quatro de infraestrutura declaradas", () => {
    const v1 = new Set(doV1());
    const sem = doLegado().filter(
      (k) =>
        !ROTAS_FORA_DO_PREFIXO.has(k) && !v1.has(semVersao(k).replace(" /", ` ${PREFIXO_V1}/`)),
    );
    expect(sem, "rota fora do /v1 sem estar em ROTAS_FORA_DO_PREFIXO").toEqual([]);
  });

  it("toda rota de /v1 tem par legado, salvo as declaradas em ROTAS_SO_NO_V1", () => {
    const legado = new Set(doLegado());
    const sem = doV1().filter((k) => !ROTAS_SO_NO_V1.has(k) && !legado.has(semVersao(k)));
    expect(sem, "rota só de /v1 sem estar em ROTAS_SO_NO_V1").toEqual([]);
  });

  it("as exceções existem de verdade, não ganham par, e não há lista morta", () => {
    const legado = new Set(doLegado());
    const v1 = new Set(doV1());
    for (const chave of ROTAS_FORA_DO_PREFIXO.keys()) {
      expect(legado.has(chave), `exceção que não existe na raiz: ${chave}`).toBe(true);
      expect(
        v1.has(semVersao(chave).replace(" /", ` ${PREFIXO_V1}/`)),
        `exceção com par em /v1: ${chave}`,
      ).toBe(false);
    }
    for (const chave of ROTAS_SO_NO_V1.keys()) {
      expect(v1.has(chave), `rota só-/v1 que não existe: ${chave}`).toBe(true);
      expect(legado.has(semVersao(chave)), `rota só-/v1 com par legado: ${chave}`).toBe(false);
    }
  });

  it("as exceções do contrato (saúde, armazenamento assinado, ofício público: quatro rotas, três endereços) e nenhuma além", () => {
    expect([...ROTAS_FORA_DO_PREFIXO.keys()].sort()).toEqual([
      "GET /armazenamento/objeto",
      "GET /publico/oficio/:token",
      "GET /saude",
      "PUT /armazenamento/objeto",
    ]);
    for (const [chave, razao] of ROTAS_FORA_DO_PREFIXO) {
      expect(razao.length, `exceção sem razão: ${chave}`).toBeGreaterThan(20);
    }
  });

  it("o mesmo número de rotas de negócio nos dois lados", () => {
    const negocioLegado = doLegado().filter((k) => !ROTAS_FORA_DO_PREFIXO.has(k));
    expect(doV1().length - ROTAS_SO_NO_V1.size).toBe(negocioLegado.length);
  });

  it("o formulário público de contato vai a /v1 também", () => {
    expect(doV1()).toContain("POST /v1/publico/interesse");
    expect(doLegado()).toContain("POST /publico/interesse");
  });
});

describe("Mesma resposta nos dois prefixos", () => {
  it("GET /v1/ocorrencias com token responde o mesmo que o legado", async () => {
    const legado = await app.inject({
      method: "GET",
      url: "/ocorrencias",
      headers: com(tokenHelena),
    });
    const v1 = await app.inject({
      method: "GET",
      url: "/v1/ocorrencias",
      headers: com(tokenHelena),
    });
    expect(legado.statusCode, legado.body).toBe(200);
    expect(v1.statusCode, v1.body).toBe(200);
    expect(v1.json()).toEqual(legado.json());
    expect(JSON.stringify(v1.json())).toContain(idOcorrenciaA);
  });

  it("o dossiê de uma ocorrência também", async () => {
    const legado = await app.inject({
      method: "GET",
      url: `/ocorrencias/${idOcorrenciaA}`,
      headers: com(tokenHelena),
    });
    const v1 = await app.inject({
      method: "GET",
      url: `/v1/ocorrencias/${idOcorrenciaA}`,
      headers: com(tokenHelena),
    });
    expect(legado.statusCode).toBe(200);
    expect(v1.statusCode).toBe(200);
    expect(v1.json().id).toBe(legado.json().id);
  });

  it("o erro de validação e o de autenticação têm o mesmo corpo", async () => {
    for (const [metodo, caminho, payload] of [
      ["POST", "/auth/entrar", {}],
      ["GET", "/ocorrencias", undefined],
    ] as const) {
      const legado = await app.inject({
        method: metodo,
        url: caminho,
        ...(payload ? { payload } : {}),
      });
      const v1 = await app.inject({
        method: metodo,
        url: `/v1${caminho}`,
        ...(payload ? { payload } : {}),
      });
      expect(v1.statusCode).toBe(legado.statusCode);
      expect(v1.json()).toEqual(legado.json());
    }
  });

  it("token adulterado em /v1 devolve o mesmo que token ausente", async () => {
    const sem = await app.inject({ method: "GET", url: "/v1/ocorrencias" });
    const falso = await app.inject({
      method: "GET",
      url: "/v1/ocorrencias",
      headers: { authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.assinaturaFalsa" },
    });
    expect(sem.statusCode).toBe(401);
    expect(falso.statusCode).toBe(401);
    expect(falso.json().erro).toBe(sem.json().erro);
  });

  it("uma escrita pelo legado aparece na leitura por /v1 (é o mesmo banco)", async () => {
    const criada = await app.inject({
      method: "POST",
      url: "/ocorrencias",
      headers: com(tokenHelena),
      payload: {
        solicitanteNome: "Osvaldo Reis",
        canalEntrada: "telefone",
        endereco: "Avenida Beira Rio, 1180",
        tipo: "alagamento",
        descricao: "Água na via.",
      },
    });
    expect(criada.statusCode, criada.body).toBe(201);
    const lido = await app.inject({
      method: "GET",
      url: `/v1/ocorrencias/${criada.json().id}`,
      headers: com(tokenHelena),
    });
    expect(lido.statusCode).toBe(200);
  });
});

describe("Isolamento entre municípios nos dois prefixos", () => {
  it("o token do município B em /v1/ocorrencias/<id de A> responde 404, igual ao legado", async () => {
    const legado = await app.inject({
      method: "GET",
      url: `/ocorrencias/${idOcorrenciaA}`,
      headers: com(tokenB),
    });
    const v1 = await app.inject({
      method: "GET",
      url: `/v1/ocorrencias/${idOcorrenciaA}`,
      headers: com(tokenB),
    });
    expect(legado.statusCode).toBe(404);
    expect(v1.statusCode).toBe(404);
    expect(v1.json()).toEqual(legado.json());
  });

  it("a lista do município B, por /v1, não traz a ocorrência de A", async () => {
    const v1 = await app.inject({ method: "GET", url: "/v1/ocorrencias", headers: com(tokenB) });
    expect(v1.statusCode).toBe(200);
    expect(JSON.stringify(v1.json())).not.toContain(idOcorrenciaA);
  });

  it("a organização continua vindo só do token: cabeçalho e query com outra organização não mudam nada", async () => {
    const r = await app.inject({
      method: "GET",
      url: `/v1/ocorrencias/${idOcorrenciaA}?organizacaoId=${ORG_A}`,
      headers: { ...com(tokenB), "x-organizacao-id": ORG_A },
    });
    expect(r.statusCode).toBe(404);
  });
});

describe("Fora do /v1: o que não ganha prefixo", () => {
  it("/v1/saude e /v1/publico/oficio/x respondem 404", async () => {
    for (const url of ["/v1/saude", "/v1/publico/oficio/x", "/v1/armazenamento/objeto"]) {
      const r = await app.inject({ method: "GET", url });
      expect(r.statusCode, url).toBe(404);
      expect(r.json().erro, url).toBe("nao_encontrado");
    }
  });

  it("as rotas de infraestrutura seguem na raiz, sem cabeçalho de depreciação", async () => {
    const saude = await app.inject({ method: "GET", url: "/saude" });
    expect(saude.statusCode).toBe(200);
    const oficio = await app.inject({ method: "GET", url: "/publico/oficio/token-que-nao-existe" });
    // A rota existe (HTML), e não é o 404 JSON do roteador.
    expect(oficio.headers["content-type"]).toContain("text/html");
    const objeto = await app.inject({ method: "GET", url: "/armazenamento/objeto" });
    expect([saude, oficio, objeto].map((r) => r.headers["deprecation"])).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect([saude, oficio, objeto].map((r) => r.headers["sunset"])).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect([saude, oficio, objeto].map((r) => r.headers["link"])).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe("Cabeçalhos de depreciação: só no espelho", () => {
  it("o legado traz Deprecation, Sunset (de ESPELHO_LEGADO_ATE) e Link para o sucessor", async () => {
    const r = await app.inject({ method: "GET", url: "/ocorrencias", headers: com(tokenHelena) });
    expect(r.statusCode).toBe(200);
    expect(r.headers["deprecation"]).toBe("true");
    expect(r.headers["sunset"]).toBe("Wed, 30 Jun 2027 23:59:59 GMT");
    expect(r.headers["link"]).toBe('</v1/ocorrencias>; rel="successor-version"');
  });

  it("o /v1 não traz nenhum dos três", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/v1/ocorrencias",
      headers: com(tokenHelena),
    });
    expect(r.statusCode).toBe(200);
    expect(r.headers["deprecation"]).toBeUndefined();
    expect(r.headers["sunset"]).toBeUndefined();
    expect(r.headers["link"]).toBeUndefined();
  });

  it("os cabeçalhos saem também nas respostas de erro e SEM token (401, 404, 422)", async () => {
    const semToken = await app.inject({ method: "GET", url: "/ocorrencias" });
    expect(semToken.statusCode).toBe(401);
    const naoAchou = await app.inject({
      method: "GET",
      url: `/ocorrencias/${ID_FALSO}`,
      headers: com(tokenHelena),
    });
    expect(naoAchou.statusCode).toBe(404);
    const invalida = await app.inject({ method: "POST", url: "/auth/entrar", payload: {} });
    expect(invalida.statusCode).toBe(422);
    for (const r of [semToken, naoAchou, invalida]) {
      expect(r.headers["deprecation"]).toBe("true");
      expect(r.headers["sunset"]).toBe("Wed, 30 Jun 2027 23:59:59 GMT");
      expect(String(r.headers["link"])).toMatch(/^<\/v1\/.+>; rel="successor-version"$/);
    }
  });

  it("o Link não devolve a query string (pode levar o endereço de um imóvel)", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/ocorrencias?endereco=Rua%20das%20Ac%C3%A1cias%2C%20245",
      headers: com(tokenHelena),
    });
    expect(r.headers["link"]).toBe('</v1/ocorrencias>; rel="successor-version"');
  });

  it("o Link nunca fecha o <...> antes da hora, qualquer que seja o caminho pedido", () => {
    const h = cabecalhosDeDepreciacao("2027-06-30", '/ocorrencias/a>b"c d?x=1');
    expect(h.link).toBe('</v1/ocorrencias/a%3Eb%22c%20d>; rel="successor-version"');
    expect(h.sunset).toBe("Wed, 30 Jun 2027 23:59:59 GMT");
  });
});

describe("ESPELHO_LEGADO_ATE", () => {
  it("existe com um padrão válido, e é uma data ISO", () => {
    const c = carregarConfig({ NODE_ENV: "test", JWT_SEGREDO: SEGREDO } as NodeJS.ProcessEnv);
    expect(c.ESPELHO_LEGADO_ATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("recusa o que não é data de calendário", () => {
    for (const ruim of ["31/12/2027", "amanhã", "2027-02-31", "2027-13-01", "2027-1-1", ""]) {
      expect(() => configDe({ ESPELHO_LEGADO_ATE: ruim }), ruim).toThrow();
    }
  });
});

describe("Senha provisória vale nos dois prefixos", () => {
  async function sessaoProvisoria(): Promise<{ acesso: string; temporaria: string }> {
    const red = await app.inject({
      method: "POST",
      url: `/v1/usuarios/${DIEGO}/redefinir-senha`,
      headers: com(tokenRita),
    });
    expect(red.statusCode, red.body).toBe(200);
    const temporaria = red.json().senhaTemporaria as string;
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/entrar",
      payload: { email: EMAIL_DIEGO, senha: temporaria },
    });
    expect(login.statusCode, login.body).toBe(200);
    expect(login.json().trocaDeSenhaObrigatoria).toBe(true);
    return { acesso: login.json().acesso as string, temporaria };
  }

  it("a lista de rotas abertas tem os dois caminhos de cada rota", () => {
    expect([...ROTAS_ABERTAS_COM_SENHA_PROVISORIA].sort()).toEqual([
      "/auth/encerrar-sessoes",
      "/auth/trocar-senha",
      "/v1/auth/encerrar-sessoes",
      "/v1/auth/trocar-senha",
    ]);
  });

  it("token provisório em /v1/ocorrencias recebe 403 troca_de_senha_obrigatoria, como no legado", async () => {
    const { acesso, temporaria } = await sessaoProvisoria();
    for (const url of [
      "/v1/ocorrencias",
      "/ocorrencias",
      "/v1/campo/meu-trabalho",
      "/campo/meu-trabalho",
    ]) {
      const r = await app.inject({ method: "GET", url, headers: com(acesso) });
      expect(r.statusCode, url).toBe(403);
      expect(r.json().erro, url).toBe("troca_de_senha_obrigatoria");
    }
    // E a troca, por /v1, é a rota que o token provisório abre.
    const troca = await app.inject({
      method: "POST",
      url: "/v1/auth/trocar-senha",
      headers: com(acesso),
      payload: { senhaAtual: temporaria, senha: SENHA },
    });
    expect(troca.statusCode, troca.body).toBe(200);
    const depois = await app.inject({
      method: "GET",
      url: "/v1/campo/meu-trabalho",
      headers: com(troca.json().acesso),
    });
    expect(depois.statusCode, depois.body).toBe(200);
  });

  it("encerrar as próprias sessões também passa com a senha provisória, nos dois prefixos", async () => {
    for (const prefixo of ["/v1", ""]) {
      const { acesso, temporaria } = await sessaoProvisoria();
      const r = await app.inject({
        method: "POST",
        url: `${prefixo}/auth/encerrar-sessoes`,
        headers: com(acesso),
      });
      expect(r.statusCode, `${prefixo}: ${r.body}`).toBe(200);
      // Limpa o estado: a próxima volta redefine de novo.
      const t = await app.inject({
        method: "POST",
        url: `${prefixo}/auth/trocar-senha`,
        headers: com(acesso),
        payload: { senhaAtual: temporaria, senha: SENHA },
      });
      expect(t.statusCode, t.body).toBe(200);
    }
  });
});

describe("A fila do campo (503) vale nos dois prefixos", () => {
  it("município suspenso: as rotas da fila respondem 503 e as demais escritas 403, em /v1 e no legado", async () => {
    const acesso = await entrar(EMAIL_DIEGO);
    await mem.bruto.query(
      "UPDATE organizacoes SET acesso_suspenso_em = now(), suspensao_motivo = 'contrato em discussao' WHERE id = $1",
      [ORG_A],
    );
    try {
      for (const prefixo of ["/v1", ""]) {
        for (const caminho of [
          "/sincronizacao/vistoria",
          "/sincronizacao/devolucao",
          "/evidencias/autorizar-envio",
          "/evidencias/confirmar-envio",
        ]) {
          const r = await app.inject({
            method: "POST",
            url: `${prefixo}${caminho}`,
            headers: com(acesso),
            payload: {},
          });
          expect(r.statusCode, `${prefixo}${caminho}: ${r.body}`).toBe(503);
          expect(r.json().erro).toBe("acesso_suspenso");
        }
        const escrita = await app.inject({
          method: "POST",
          url: `${prefixo}/ocorrencias`,
          headers: com(acesso),
          payload: {},
        });
        expect(escrita.statusCode, `${prefixo}/ocorrencias`).toBe(403);
        expect(escrita.json().erro).toBe("acesso_suspenso");
      }
    } finally {
      await reativar();
    }
  });
});

describe("O limitador vale nos dois prefixos", () => {
  async function servidorApertado(
    extra: Record<string, string>,
    limitePorMinuto?: number,
  ): Promise<FastifyInstance> {
    const s = await construirServidor({
      banco: mem.banco,
      config: configDe(extra),
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
      ...(limitePorMinuto ? { limitePorMinuto } : {}),
    });
    await s.ready();
    return s;
  }

  it("o balde global é um só: pedidos por /v1 e pelo legado contam juntos (429 no sexto)", async () => {
    const s = await servidorApertado({}, 5);
    try {
      const codigos: number[] = [];
      for (const url of [
        "/v1/ocorrencias",
        "/ocorrencias",
        "/v1/ocorrencias",
        "/ocorrencias",
        "/v1/ocorrencias",
        "/ocorrencias",
      ]) {
        const r = await s.inject({
          method: "GET",
          url,
          headers: com(tokenHelena),
          remoteAddress: "10.9.9.9",
        });
        codigos.push(r.statusCode);
      }
      expect(codigos.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
      expect(codigos[5]).toBe(429);
    } finally {
      await s.close();
    }
  });

  it("o limite do login NÃO dobra pela escolha do prefixo: três tentativas no total, não três por prefixo", async () => {
    const s = await servidorApertado({ LOGIN_POR_IP: "3" });
    try {
      const codigos: number[] = [];
      for (const url of [
        "/auth/entrar",
        "/v1/auth/entrar",
        "/auth/entrar",
        "/v1/auth/entrar",
        "/auth/entrar",
        "/v1/auth/entrar",
      ]) {
        const r = await s.inject({
          method: "POST",
          url,
          payload: { email: "ninguem@serraalta.exemplo.gov.br", senha: "senha-errada-qualquer" },
          remoteAddress: "10.8.8.8",
        });
        codigos.push(r.statusCode);
      }
      expect(codigos.slice(0, 3).every((c) => c === 401)).toBe(true);
      expect(codigos.slice(3)).toEqual([429, 429, 429]);
    } finally {
      await s.close();
    }
  });

  it("rotas diferentes continuam com baldes diferentes (login e segundo fator não se somam)", async () => {
    const s = await servidorApertado({ LOGIN_POR_IP: "2" });
    try {
      const corpo = { email: "ninguem@serraalta.exemplo.gov.br", senha: "senha-errada-qualquer" };
      for (let i = 0; i < 2; i++) {
        const r = await s.inject({
          method: "POST",
          url: "/v1/auth/entrar",
          payload: corpo,
          remoteAddress: "10.7.7.7",
        });
        expect(r.statusCode).toBe(401);
      }
      const terceiro = await s.inject({
        method: "POST",
        url: "/auth/entrar",
        payload: corpo,
        remoteAddress: "10.7.7.7",
      });
      expect(terceiro.statusCode).toBe(429);
      const outraRota = await s.inject({
        method: "POST",
        url: "/v1/auth/segundo-fator",
        payload: {},
        remoteAddress: "10.7.7.7",
      });
      expect(outraRota.statusCode).not.toBe(429);
    } finally {
      await s.close();
    }
  });
});
