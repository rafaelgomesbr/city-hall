import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { derivarSenha } from "../src/auth/senha.js";
import { resumirAparelho } from "../src/auth/aparelho.js";

/**
 * V2-F00-E09: as duas leituras que as telas de sessões precisam.
 *
 * `GET /auth/sessoes` mostra à pessoa as sessões vivas da PRÓPRIA conta, e
 * `GET /usuarios/:id/sessoes` mostra a quem administra QUANTAS sessões a outra
 * pessoa tem, antes de derrubá-las. As rotas de escrita (`redefinir-senha`,
 * `encerrar-sessoes`) já tinham teste em `senha-e-sessoes.test.ts`; aqui estão
 * as leituras novas e o que elas NÃO podem entregar: IP, user-agent completo,
 * sessão de outra pessoa, sessão de outro município.
 */

const SENHA_A = "serra-alta-senha-forte";
const SENHA_B = "vale-fundo-senha-forte";

const UA_CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const UA_SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

let mem: BancoEmMemoria;
let app: FastifyInstance;
const id: Record<string, string> = {};

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrar(
  email: string, senha: string, userAgent?: string,
): Promise<{ acesso: string; renovacao: string }> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha },
    headers: userAgent ? { "user-agent": userAgent } : {},
  });
  if (r.statusCode !== 200) throw new Error(`login falhou (${r.statusCode}): ${r.body}`);
  return { acesso: r.json().acesso, renovacao: r.json().renovacao };
}

type SessaoLida = { entrouEm: string; validaAte: string; aparelho: string; atual: boolean };

async function minhasSessoes(token: string): Promise<{ status: number; itens: SessaoLida[]; corpo: string }> {
  const r = await app.inject({ method: "GET", url: "/auth/sessoes", headers: com(token) });
  return { status: r.statusCode, itens: r.statusCode === 200 ? r.json().itens : [], corpo: r.body };
}

function sessoesDe(alvo: string, token: string) {
  return app.inject({ method: "GET", url: `/usuarios/${alvo}/sessoes`, headers: com(token) });
}

async function semear(): Promise<void> {
  const db = mem.bruto;
  const a = await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome,municipio,uf) VALUES ('DC Serra Alta','Serra Alta','MG') RETURNING id",
  );
  const b = await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome,municipio,uf) VALUES ('DC Vale Fundo','Vale Fundo','MG') RETURNING id",
  );
  const hashA = await derivarSenha(SENHA_A);
  const hashB = await derivarSenha(SENHA_B);
  const pessoas: Array<[string, string, string, string, string, string, string]> = [
    ["helena", a.rows[0]!.id, "Helena Coutinho", "SA-1", "helena@serraalta.exemplo.gov.br", "coordenador", hashA],
    ["jonas", a.rows[0]!.id, "Jonas Ferreira", "SA-2", "jonas@serraalta.exemplo.gov.br", "operador", hashA],
    ["diego", a.rows[0]!.id, "Diego Alves", "SA-3", "diego@serraalta.exemplo.gov.br", "agente_campo", hashA],
    ["rita", a.rows[0]!.id, "Rita Lopes", "SA-4", "rita@serraalta.exemplo.gov.br", "administrador", hashA],
    ["carmem", a.rows[0]!.id, "Carmem Boaventura", "SA-5", "carmem@serraalta.exemplo.gov.br", "coordenador", hashA],
    ["aurelio", b.rows[0]!.id, "Aurelio Machado", "VF-1", "aurelio@valefundo.exemplo.gov.br", "coordenador", hashB],
  ];
  for (const [apelido, org, nome, matricula, email, papel, hash] of pessoas) {
    const r = await db.query<{ id: string }>(
      `INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,senha_hash)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [org, nome, matricula, email, papel, hash],
    );
    id[apelido] = r.rows[0]!.id;
  }
}

beforeAll(async () => {
  mem = await bancoEmMemoria();
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-das-sessoes-da-conta-com-mais-de-32-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
  });
  await app.ready();
  await semear();
}, 300_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("GET /auth/sessoes: as sessões da própria conta", () => {
  it("lista as vivas, marca de onde veio o pedido e traz o aparelho em uma frase", async () => {
    const noComputador = await entrar("helena@serraalta.exemplo.gov.br", SENHA_A, UA_CHROME_WINDOWS);
    const noCelular = await entrar("helena@serraalta.exemplo.gov.br", SENHA_A, UA_SAFARI_IPHONE);

    const doComputador = await minhasSessoes(noComputador.acesso);
    expect(doComputador.status, doComputador.corpo).toBe(200);
    expect(doComputador.itens).toHaveLength(2);

    const atual = doComputador.itens.filter((s) => s.atual);
    expect(atual).toHaveLength(1);
    expect(atual[0]!.aparelho).toBe("Chrome em Windows");
    // A sessão atual vem primeiro: é a que a pessoa procura.
    expect(doComputador.itens[0]!.atual).toBe(true);
    expect(doComputador.itens[1]!.aparelho).toBe("Safari em iOS");

    // De onde o pedido vem decide a marca: pelo celular, o celular é "esta".
    const doCelular = await minhasSessoes(noCelular.acesso);
    expect(doCelular.itens.find((s) => s.atual)!.aparelho).toBe("Safari em iOS");

    for (const s of doComputador.itens) {
      expect(Date.parse(s.entrouEm)).toBeLessThanOrEqual(Date.now());
      expect(Date.parse(s.validaAte)).toBeGreaterThan(Date.now());
    }
  }, 300_000);

  it("não entrega IP, user-agent completo nem identificador de sessão", async () => {
    const t = await entrar("jonas@serraalta.exemplo.gov.br", SENHA_A, UA_CHROME_WINDOWS);
    const r = await minhasSessoes(t.acesso);
    expect(r.status).toBe(200);
    expect(Object.keys(r.itens[0]!).sort()).toEqual(["aparelho", "atual", "entrouEm", "validaAte"]);
    expect(r.corpo).not.toMatch(/Mozilla|AppleWebKit|Win64/);
    expect(r.corpo).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    expect(r.corpo).not.toMatch(/"(ip|user_agent|userAgent|id|token_hash|familia_id)"/);
  }, 300_000);

  it("a renovação não multiplica as linhas nem muda o 'entrou em'", async () => {
    const t = await entrar("carmem@serraalta.exemplo.gov.br", SENHA_A, UA_CHROME_WINDOWS);
    const antes = await minhasSessoes(t.acesso);
    expect(antes.itens).toHaveLength(1);

    const renovada = await app.inject({
      method: "POST", url: "/auth/renovar", payload: { renovacao: t.renovacao },
      headers: { "user-agent": UA_CHROME_WINDOWS },
    });
    expect(renovada.statusCode).toBe(200);

    // Com o token NOVO e também com o ANTIGO (ainda vale para leitura): uma
    // linha só, e é a sessão atual nos dois casos, porque a marca é por família.
    for (const acesso of [renovada.json().acesso as string, t.acesso]) {
      const depois = await minhasSessoes(acesso);
      expect(depois.itens).toHaveLength(1);
      expect(depois.itens[0]!.atual).toBe(true);
      expect(depois.itens[0]!.entrouEm).toBe(antes.itens[0]!.entrouEm);
    }
  }, 300_000);

  it("só a própria conta: a de outra pessoa e a de outro município não aparecem", async () => {
    const diego = await entrar("diego@serraalta.exemplo.gov.br", SENHA_A, UA_SAFARI_IPHONE);
    await entrar("aurelio@valefundo.exemplo.gov.br", SENHA_B, UA_CHROME_WINDOWS);
    await entrar("aurelio@valefundo.exemplo.gov.br", SENHA_B, UA_CHROME_WINDOWS);

    const r = await minhasSessoes(diego.acesso);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]!.aparelho).toBe("Safari em iOS");
  }, 300_000);

  it("encerrar as outras deixa só esta na lista, e a lista reflete o banco", async () => {
    const e = "rita@serraalta.exemplo.gov.br";
    const a = await entrar(e, SENHA_A, UA_CHROME_WINDOWS);
    await entrar(e, SENHA_A, UA_SAFARI_IPHONE);
    expect((await minhasSessoes(a.acesso)).itens.length).toBeGreaterThanOrEqual(2);

    const r = await app.inject({ method: "POST", url: "/auth/encerrar-sessoes", headers: com(a.acesso) });
    expect(r.statusCode).toBe(200);

    const depois = await minhasSessoes(a.acesso);
    expect(depois.itens).toHaveLength(1);
    expect(depois.itens[0]!.atual).toBe(true);
    expect(depois.itens[0]!.aparelho).toBe("Chrome em Windows");
  }, 300_000);

  it("sem token, 401", async () => {
    const r = await app.inject({ method: "GET", url: "/auth/sessoes" });
    expect(r.statusCode).toBe(401);
  });

  it("sessão vencida ou encerrada não aparece", async () => {
    const t = await entrar("helena@serraalta.exemplo.gov.br", SENHA_A, UA_CHROME_WINDOWS);
    const base = (await minhasSessoes(t.acesso)).itens.length;
    // Uma sessão que o banco já considera vencida, gravada por fora.
    await mem.bruto.query(
      `INSERT INTO sessoes (organizacao_id, usuario_id, token_hash, expira_em, user_agent)
       SELECT organizacao_id, id, 'hash-vencida-e09', now() - interval '1 hour', 'curl/8'
         FROM usuarios WHERE id = $1`,
      [id["helena"]],
    );
    expect((await minhasSessoes(t.acesso)).itens).toHaveLength(base);
  }, 300_000);
});

describe("GET /usuarios/:id/sessoes: quantas sessões a outra pessoa tem", () => {
  it("a administradora vê a quantidade e as datas, e nada do aparelho", async () => {
    const rita = await entrar("rita@serraalta.exemplo.gov.br", SENHA_A);
    // Zera o que os outros testes deixaram e abre duas sessões conhecidas.
    await app.inject({ method: "POST", url: `/usuarios/${id["diego"]}/encerrar-sessoes`, headers: com(rita.acesso) });
    const vazia = await sessoesDe(id["diego"]!, rita.acesso);
    expect(vazia.statusCode, vazia.body).toBe(200);
    expect(vazia.json()).toMatchObject({ id: id["diego"], sessoesAbertas: 0 });
    expect(vazia.json().ultimaEntradaEm).toBeNull();

    await entrar("diego@serraalta.exemplo.gov.br", SENHA_A, UA_SAFARI_IPHONE);
    await entrar("diego@serraalta.exemplo.gov.br", SENHA_A, UA_CHROME_WINDOWS);

    const r = await sessoesDe(id["diego"]!, rita.acesso);
    expect(r.statusCode).toBe(200);
    expect(r.json().sessoesAbertas).toBe(2);
    expect(Date.parse(r.json().ultimaEntradaEm)).toBeLessThanOrEqual(Date.now());
    expect(Date.parse(r.json().validaAte)).toBeGreaterThan(Date.now());
    expect(Object.keys(r.json()).sort()).toEqual(["id", "sessoesAbertas", "ultimaEntradaEm", "validaAte"]);
    expect(r.body).not.toMatch(/Mozilla|iPhone|Windows|Safari|Chrome/);
    expect(r.body).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);

    // E o número bate com o que o ato de encerrar derruba.
    const encerrar = await app.inject({
      method: "POST", url: `/usuarios/${id["diego"]}/encerrar-sessoes`, headers: com(rita.acesso),
    });
    expect(encerrar.json().sessoesEncerradas).toBe(2);
    expect((await sessoesDe(id["diego"]!, rita.acesso)).json().sessoesAbertas).toBe(0);
  }, 300_000);

  it("a coordenadora vê as de quem está abaixo do posto dela", async () => {
    const helena = await entrar("helena@serraalta.exemplo.gov.br", SENHA_A);
    for (const alvo of ["diego", "jonas"]) {
      const r = await sessoesDe(id[alvo]!, helena.acesso);
      expect(r.statusCode, `${alvo}: ${r.body}`).toBe(200);
    }
  }, 300_000);

  it("posto igual ou acima: 403 posto_insuficiente", async () => {
    const helena = await entrar("helena@serraalta.exemplo.gov.br", SENHA_A);
    for (const alvo of ["carmem", "rita"]) {
      const r = await sessoesDe(id[alvo]!, helena.acesso);
      expect(r.statusCode, alvo).toBe(403);
      expect(r.json().erro).toBe("posto_insuficiente");
    }
  }, 300_000);

  it("o operador e o agente de campo não têm a ação: 403 sem_permissao nas três rotas", async () => {
    const jonas = await entrar("jonas@serraalta.exemplo.gov.br", SENHA_A);
    const diego = await entrar("diego@serraalta.exemplo.gov.br", SENHA_A);
    for (const quem of [jonas, diego]) {
      const leitura = await sessoesDe(id["carmem"]!, quem.acesso);
      expect(leitura.statusCode).toBe(403);
      expect(leitura.json().erro).toBe("sem_permissao");

      const redefinir = await app.inject({
        method: "POST", url: `/usuarios/${id["carmem"]}/redefinir-senha`, headers: com(quem.acesso),
      });
      expect(redefinir.statusCode).toBe(403);
      expect(redefinir.json().erro).toBe("sem_permissao");

      const encerrar = await app.inject({
        method: "POST", url: `/usuarios/${id["carmem"]}/encerrar-sessoes`, headers: com(quem.acesso),
      });
      expect(encerrar.statusCode).toBe(403);
      expect(encerrar.json().erro).toBe("sem_permissao");
    }
  }, 300_000);

  it("conta de outro município: 404, igual a id que não existe", async () => {
    const helena = await entrar("helena@serraalta.exemplo.gov.br", SENHA_A);
    const deOutroMunicipio = await sessoesDe(id["aurelio"]!, helena.acesso);
    const inexistente = await sessoesDe("99999999-9999-4999-8999-999999999999", helena.acesso);
    expect(deOutroMunicipio.statusCode).toBe(404);
    expect(inexistente.statusCode).toBe(404);
    expect(deOutroMunicipio.json()).toEqual(inexistente.json());

    // E o inverso: a coordenadora de Vale Fundo não vê as de Serra Alta.
    const aurelio = await entrar("aurelio@valefundo.exemplo.gov.br", SENHA_B);
    expect((await sessoesDe(id["diego"]!, aurelio.acesso)).statusCode).toBe(404);
  }, 300_000);

  it("identificador que não é uuid: 422; sem token: 401", async () => {
    const helena = await entrar("helena@serraalta.exemplo.gov.br", SENHA_A);
    expect((await sessoesDe("nao-e-uuid", helena.acesso)).statusCode).toBe(422);
    const r = await app.inject({ method: "GET", url: `/usuarios/${id["diego"]}/sessoes` });
    expect(r.statusCode).toBe(401);
  }, 300_000);
});

describe("as duas recusas que a tela não oferece e a API mantém", () => {
  it("redefinir a própria senha e encerrar as próprias sessões por esta via: 422", async () => {
    const rita = await entrar("rita@serraalta.exemplo.gov.br", SENHA_A);
    const redefinir = await app.inject({
      method: "POST", url: `/usuarios/${id["rita"]}/redefinir-senha`, headers: com(rita.acesso),
    });
    expect(redefinir.statusCode).toBe(422);
    expect(redefinir.json().erro).toBe("autoredefinicao");

    const encerrar = await app.inject({
      method: "POST", url: `/usuarios/${id["rita"]}/encerrar-sessoes`, headers: com(rita.acesso),
    });
    expect(encerrar.statusCode).toBe(422);
    expect(encerrar.json().erro).toBe("autoencerramento");
  }, 300_000);
});

describe("resumirAparelho: o aparelho em uma frase, sem entregar a máquina", () => {
  it.each([
    [UA_CHROME_WINDOWS, "Chrome em Windows"],
    [UA_SAFARI_IPHONE, "Safari em iOS"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0", "Edge em Windows"],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0", "Firefox em Linux"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36", "Chrome em Android"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15", "Safari em macOS"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36", "Chrome em Windows"],
    ["okhttp/4.12.0", "Aplicativo de campo"],
    ["dc360-campo/1.0 CFNetwork/1494.0.7 Darwin/23.4.0", "Aplicativo de campo"],
    ["curl/8.5.0", "Aparelho não identificado"],
    ["", "Aparelho não identificado"],
  ])("%s", (ua, esperado) => {
    expect(resumirAparelho(ua)).toBe(esperado);
  });

  it("nulo e indefinido não quebram", () => {
    expect(resumirAparelho(null)).toBe("Aparelho não identificado");
    expect(resumirAparelho(undefined)).toBe("Aparelho não identificado");
  });

  it("nunca devolve texto do user-agent além do nome do navegador e do sistema", () => {
    const frase = resumirAparelho(UA_CHROME_WINDOWS);
    expect(frase).not.toMatch(/\d/);
    expect(frase.length).toBeLessThan(40);
  });
});
