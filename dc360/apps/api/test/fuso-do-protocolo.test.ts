import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * O ano do protocolo e as datas do CSV saem do fuso do MUNICÍPIO (V2-F02-E09).
 *
 * O DEFEITO: `new Date().getFullYear()` devolve o ano do processo, e em
 * contêiner o processo roda em UTC. Às 22h de 31 de dezembro em Brasília a
 * ocorrência recebia protocolo do ano seguinte; do mesmo modo a planilha de
 * prestação de contas imprimia a hora do processo, e o nome do arquivo trazia a
 * data de UTC. Uma ocorrência registrada às 22h entrava na planilha com a data
 * do dia seguinte.
 *
 * ESTE ARQUIVO RODA COM `TZ=UTC` DE PROPÓSITO, como o de fuso do documento: um
 * teste escrito no fuso de Brasília passaria na máquina de quem desenvolve e
 * falharia em produção. O relógio é fixado só no `Date`, para o resto do
 * servidor continuar andando.
 */

const SENHA = "defesa-civil-2026";
const ORG_A = "11111111-1111-4111-8111-000000000001"; // Serra Alta
const ORG_B = "22222222-2222-4222-8222-000000000002"; // Vale Fundo
const TZ_ORIGINAL = process.env["TZ"];

/** 03:30Z: já é 2027 em São Paulo (00:30), ainda é réveillon no Acre (22:30). */
const VIRADA_EM_UTC = "2027-01-01T03:30:00Z";
/** 02:30Z: ainda é 2026 em São Paulo (23:30). */
const ANTES_DA_VIRADA_EM_SAO_PAULO = "2027-01-01T02:30:00Z";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenA: string;
let tokenB: string;

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST",
    url: "/auth/entrar",
    payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

async function definirUf(org: string, uf: string | null) {
  await mem.bruto.query("UPDATE organizacoes SET uf = $2 WHERE id = $1", [org, uf]);
}

async function abrir(token: string, cabecalhosExtras: Record<string, string> = {}) {
  const r = await app.inject({
    method: "POST",
    url: "/ocorrencias",
    headers: { ...com(token), ...cabecalhosExtras },
    payload: {
      solicitanteNome: "Marilda Souza Prado",
      canalEntrada: "telefone",
      endereco: "Rua do Temporal, 21",
      tipo: "deslizamento",
      descricao: "Talude cedeu durante a chuva da noite.",
    },
  });
  expect(r.statusCode, r.body).toBeLessThan(300);
  return r.json() as { protocolo: string; id: string };
}

const anoDoProtocolo = (protocolo: string) => protocolo.split("/")[1];

beforeAll(async () => {
  process.env["TZ"] = "UTC";

  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-fuso-do-protocolo-com-32-bytes-ok",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco,
    config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  tokenA = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
  tokenB = await entrar("aurelio.machado@valefundo.exemplo.gov.br");
}, 180_000);

afterEach(async () => {
  vi.useRealTimers();
  await definirUf(ORG_A, "MG");
  await definirUf(ORG_B, "MG");
});

afterAll(async () => {
  vi.useRealTimers();
  await app?.close();
  await mem?.banco.encerrar();
  if (TZ_ORIGINAL === undefined) delete process.env["TZ"];
  else process.env["TZ"] = TZ_ORIGINAL;
});

/**
 * Fixa o relógio e entra de novo: o token emitido antes do relógio mudar teria
 * emissão no passado e expiraria assim que o `Date` pulasse para 2027.
 */
async function relogioEm(iso: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
  tokenA = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
  tokenB = await entrar("aurelio.machado@valefundo.exemplo.gov.br");
}

describe("O ano do protocolo é o do município", () => {
  it("às 03:30Z de 01/01/2027, São Paulo já está em 2027 e o Acre ainda em 2026", async () => {
    await definirUf(ORG_A, "SP");
    await definirUf(ORG_B, "AC");
    await relogioEm(VIRADA_EM_UTC);

    const emSp = await abrir(tokenA);
    const noAcre = await abrir(tokenB);

    expect(anoDoProtocolo(emSp.protocolo)).toBe("2027");
    expect(anoDoProtocolo(noAcre.protocolo)).toBe("2026");
  }, 60_000);

  it("às 02:30Z de 01/01/2027, São Paulo ainda está em 2026 (23:30 de 31/12)", async () => {
    await definirUf(ORG_A, "SP");
    await relogioEm(ANTES_DA_VIRADA_EM_SAO_PAULO);

    const emSp = await abrir(tokenA);
    expect(anoDoProtocolo(emSp.protocolo)).toBe("2026");
  }, 60_000);

  it("o fuso vem da organização do token: o de A não escolhe o fuso de B", async () => {
    await definirUf(ORG_A, "SP");
    await definirUf(ORG_B, "AC");
    await relogioEm(VIRADA_EM_UTC);

    // Tentativas de impor fuso por cabeçalho: a API não olha para nenhuma.
    const deA = await abrir(tokenA, { "x-fuso": "America/Rio_Branco", "x-uf": "AC" });
    const deB = await abrir(tokenB, { "x-fuso": "America/Sao_Paulo", "x-uf": "SP" });

    expect(anoDoProtocolo(deA.protocolo)).toBe("2027");
    expect(anoDoProtocolo(deB.protocolo)).toBe("2026");
  }, 60_000);

  it("UF desconhecida usa o fuso padrão sem erro (02:30Z ainda é 2026)", async () => {
    await definirUf(ORG_A, "ZZ");
    await relogioEm(ANTES_DA_VIRADA_EM_SAO_PAULO);

    const criada = await abrir(tokenA);
    expect(anoDoProtocolo(criada.protocolo)).toBe("2026");
  }, 60_000);

  it("a virada de ano não repete número: a sequência é por ano, em cada lado", async () => {
    await definirUf(ORG_A, "SP");

    await relogioEm(ANTES_DA_VIRADA_EM_SAO_PAULO);
    const a1 = await abrir(tokenA);
    const a2 = await abrir(tokenA);
    await relogioEm(VIRADA_EM_UTC);
    const a3 = await abrir(tokenA);
    const a4 = await abrir(tokenA);

    expect(anoDoProtocolo(a1.protocolo)).toBe("2026");
    expect(anoDoProtocolo(a2.protocolo)).toBe("2026");
    expect(anoDoProtocolo(a3.protocolo)).toBe("2027");
    expect(anoDoProtocolo(a4.protocolo)).toBe("2027");
    expect(new Set([a1, a2, a3, a4].map((o) => o.protocolo)).size).toBe(4);
    // Cada ano segue a sua própria sequência: o segundo é sempre o primeiro mais um.
    const numero = (o: { protocolo: string }) => Number(o.protocolo.split("/")[0]);
    expect(numero(a2)).toBe(numero(a1) + 1);
    expect(numero(a4)).toBe(numero(a3) + 1);
  }, 60_000);
});

describe("As datas do CSV são as do município", () => {
  async function csvDeUmaOcorrenciaDas0330Z(token: string) {
    const criada = await abrir(token);
    await mem.bruto.query("UPDATE ocorrencias SET criado_em = $2 WHERE id = $1", [
      criada.id,
      VIRADA_EM_UTC,
    ]);
    const r = await app.inject({
      method: "GET",
      url: "/relatorios/ocorrencias.csv",
      headers: com(token),
    });
    expect(r.statusCode, r.body).toBe(200);
    const linha = r.body.split("\r\n").find((l) => l.startsWith(criada.protocolo));
    expect(linha, "a ocorrência criada precisa estar no CSV").toBeDefined();
    return { linha: linha!, cabecalhos: r.headers };
  }

  it("no Acre, a ocorrência das 22:30 de 31/12 entra com a data de 31/12/2026", async () => {
    await definirUf(ORG_B, "AC");
    await relogioEm(VIRADA_EM_UTC);

    const { linha, cabecalhos } = await csvDeUmaOcorrenciaDas0330Z(tokenB);
    expect(linha).toContain("31/12/2026 22:30");
    expect(linha).not.toContain("01/01/2027");
    expect(String(cabecalhos["content-disposition"])).toContain("ocorrencias-2026-12-31.csv");
  }, 60_000);

  it("em São Paulo, a mesma hora absoluta entra como 01/01/2027 00:30", async () => {
    await definirUf(ORG_A, "SP");
    await relogioEm(VIRADA_EM_UTC);

    const { linha, cabecalhos } = await csvDeUmaOcorrenciaDas0330Z(tokenA);
    expect(linha).toContain("01/01/2027 00:30");
    expect(linha).not.toContain("31/12/2026");
    expect(String(cabecalhos["content-disposition"])).toContain("ocorrencias-2027-01-01.csv");
  }, 60_000);

  it("a ocorrência das 22h locais traz a data local mesmo com o servidor em UTC", async () => {
    // 22:00 de 10/09/2026 em Brasília são 01:00Z do dia 11 no servidor.
    await definirUf(ORG_A, "MG");
    await relogioEm("2026-09-11T01:00:00Z");

    const criada = await abrir(tokenA);
    await mem.bruto.query("UPDATE ocorrencias SET criado_em = $2 WHERE id = $1", [
      criada.id,
      "2026-09-11T01:00:00Z",
    ]);
    const r = await app.inject({
      method: "GET",
      url: "/relatorios/ocorrencias.csv",
      headers: com(tokenA),
    });
    const linha = r.body.split("\r\n").find((l) => l.startsWith(criada.protocolo))!;
    expect(linha).toContain("10/09/2026 22:00");
    expect(String(r.headers["content-disposition"])).toContain("ocorrencias-2026-09-10.csv");
  }, 60_000);

  it("UF desconhecida no CSV usa o fuso padrão, sem erro", async () => {
    await definirUf(ORG_A, "ZZ");
    await relogioEm(VIRADA_EM_UTC);

    const { linha } = await csvDeUmaOcorrenciaDas0330Z(tokenA);
    expect(linha).toContain("01/01/2027 00:30");
  }, 60_000);
});
