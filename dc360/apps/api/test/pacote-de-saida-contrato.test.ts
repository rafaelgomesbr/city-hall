import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { COLUNAS_QUE_NUNCA_SAEM, TABELAS_DA_SAIDA } from "../src/saida/pacote.js";
import { lerZip } from "./ler-zip.js";

/**
 * O contrato do pacote de saída, visto de fora (V2-F00-E11).
 *
 * `saida-de-municipio.test.ts` prova a montagem do pacote chamando a rota certa
 * direto. O que ele nunca viu foi o CLIENTE: o painel chamou `/pacote.zip`
 * durante três semanas, e a rota registrada é `/saida/pacote.zip`. Este arquivo
 * prende o que o cliente e a prova de navegador (seção 28 do e2e) assumem:
 *
 *   - a rota existe SÓ sob `/saida`, e a da raiz é 404 (o defeito era o prefixo);
 *   - a organização do pacote é a do token, e o pacote de um município nunca
 *     traz linha de outro: conferido linha a linha, e não por procura de texto;
 *   - nenhuma coluna proibida aparece em cabeçalho de CSV nem em chave de JSON,
 *     e o valor sentinela de uma coluna proibida não aparece em arquivo nenhum;
 *   - a soma de verificação de cada arquivo confere, e nenhum arquivo falta nela;
 *   - município suspenso recebe 403 `acesso_suspenso` com a frase de contrato,
 *     e a falha não deixa registro de exportação (nada foi extraído).
 */

const SENHA = "defesa-civil-2026";
const ORG_SERRA_ALTA = "11111111-1111-4111-8111-000000000001";
const ORG_VALE_FUNDO = "22222222-2222-4222-8222-000000000002";
const AGENTE_SERRA_ALTA = "11111111-1111-4111-8111-0000000000d3";
const COORDENADOR_VALE_FUNDO = "22222222-2222-4222-8222-0000000000d1";

/** Valores que NUNCA podem aparecer no pacote: o que as colunas proibidas guardam. */
const FICHA_DE_SERRA_ALTA = "ficha-sentinela-serra-alta-nao-pode-sair-0123456789";
const FICHA_DE_VALE_FUNDO = "ficha-sentinela-vale-fundo-nao-pode-sair-9876543210";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenAdministradora: string;
let tokenCoordenadora: string;
let tokenAdministradorDeVale: string;

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrar(email: string): Promise<string> {
  const r = await app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA } });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

async function baixar(token: string): Promise<Map<string, Buffer>> {
  const r = await app.inject({ method: "POST", url: "/saida/pacote.zip", headers: com(token) });
  expect(r.statusCode).toBe(200);
  return lerZip(r.rawPayload);
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });

  // O pacote de Vale Fundo precisa de quem o peça, e a semente não tem
  // administrador lá: o coordenador é promovido só neste banco de teste.
  await mem.bruto.exec(`
    UPDATE usuarios SET papel = 'administrador' WHERE id = '${COORDENADOR_VALE_FUNDO}';

    -- Uma ficha de push em cada município. A coluna \`ficha\` NUNCA sai: sem uma
    -- linha com valor, a prova de que ela não sai seria vazia.
    INSERT INTO aparelhos (organizacao_id, usuario_id, plataforma, ficha)
    VALUES ('${ORG_SERRA_ALTA}', '${AGENTE_SERRA_ALTA}', 'android', '${FICHA_DE_SERRA_ALTA}'),
           ('${ORG_VALE_FUNDO}', '${COORDENADOR_VALE_FUNDO}', 'ios', '${FICHA_DE_VALE_FUNDO}');
  `);

  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-do-contrato-do-pacote-com-mais-de-32",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config, armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  tokenAdministradora = await entrar("rita.lopes@serraalta.exemplo.gov.br");
  tokenCoordenadora = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
  tokenAdministradorDeVale = await entrar("aurelio.machado@valefundo.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("A rota existe só sob /saida", () => {
  it("/pacote.zip na raiz é 404, com token de administradora, em POST e em GET", async () => {
    // Era este o caminho que o painel chamava. 404 aqui é a prova de que o
    // defeito do cliente era o prefixo, e de que ninguém "consertou" o botão
    // registrando uma segunda rota sem a trava de `/saida`.
    for (const metodo of ["POST", "GET"] as const) {
      const r = await app.inject({ method: metodo, url: "/pacote.zip", headers: com(tokenAdministradora) });
      expect(r.statusCode, `${metodo} /pacote.zip`).toBe(404);
    }
  }, 60_000);

  it("/saida/pacote.zip é só POST: GET não baixa a base inteira por um link", async () => {
    const r = await app.inject({ method: "GET", url: "/saida/pacote.zip", headers: com(tokenAdministradora) });
    expect(r.statusCode).toBe(404);
  }, 60_000);
});

describe("O pacote traz só o município do token", () => {
  it("toda linha de toda tabela é da organização de quem pediu, e a de Vale Fundo é só de Vale Fundo", async () => {
    const pacoteA = await baixar(tokenAdministradora);
    const pacoteB = await baixar(tokenAdministradorDeVale);

    for (const [pacote, dono, outro] of [
      [pacoteA, ORG_SERRA_ALTA, ORG_VALE_FUNDO],
      [pacoteB, ORG_VALE_FUNDO, ORG_SERRA_ALTA],
    ] as const) {
      let linhasComOrganizacao = 0;
      for (const tabela of TABELAS_DA_SAIDA) {
        const json = JSON.parse(pacote.get(`tabelas/${tabela}.json`)!.toString("utf8")) as Array<Record<string, unknown>>;
        for (const linha of json) {
          // `organizacoes` guarda o id da própria organização, não `organizacao_id`.
          const org = tabela === "organizacoes" ? linha["id"] : linha["organizacao_id"];
          if (org === undefined) continue;
          linhasComOrganizacao += 1;
          expect(org, `linha de ${tabela} de outro município`).toBe(dono);
        }
      }
      // Prova de que o laço olhou linhas de verdade (um pacote vazio passaria).
      expect(linhasComOrganizacao).toBeGreaterThan(10);

      // E o identificador do outro município não aparece em arquivo de DADO
      // nenhum (`esquema/` é o SQL do produto, igual em toda instalação).
      for (const [caminho, conteudo] of pacote) {
        if (caminho.startsWith("esquema/")) continue;
        expect(conteudo.toString("utf8"), `id do outro município em ${caminho}`).not.toContain(outro);
      }
    }
  }, 120_000);

  it("a organização continua vindo do token: parâmetro, cabeçalho e corpo não trocam de município", async () => {
    // A administradora de Serra Alta pede com o id de Vale Fundo em todo lugar
    // possível. O pacote continua sendo o de Serra Alta.
    const r = await app.inject({
      method: "POST",
      url: `/saida/pacote.zip?organizacao=${ORG_VALE_FUNDO}&organizacaoId=${ORG_VALE_FUNDO}`,
      headers: { ...com(tokenAdministradora), "x-organizacao-id": ORG_VALE_FUNDO },
      payload: { organizacaoId: ORG_VALE_FUNDO },
    });
    expect(r.statusCode).toBe(200);
    const pacote = lerZip(r.rawPayload);
    const orgs = JSON.parse(pacote.get("tabelas/organizacoes.json")!.toString("utf8")) as Array<{ id: string }>;
    expect(orgs.map((o) => o.id)).toEqual([ORG_SERRA_ALTA]);
  }, 60_000);

  it("coordenadora (tem exportar_dados, não tem gerenciar_organizacao) recebe 403 e a frase", async () => {
    const r = await app.inject({ method: "POST", url: "/saida/pacote.zip", headers: com(tokenCoordenadora) });
    expect(r.statusCode).toBe(403);
    expect(r.json().erro).toBe("sem_permissao");
    expect(String(r.json().mensagem)).toMatch(/^Seu perfil não tem permissão para /);
  }, 60_000);
});

describe("Coluna proibida não sai, nem o valor dela", () => {
  it("nenhum cabeçalho de CSV nem chave de JSON traz coluna proibida, e o valor sentinela não aparece", async () => {
    const pacote = await baixar(tokenAdministradora);

    for (const [tabela, proibidas] of Object.entries(COLUNAS_QUE_NUNCA_SAEM)) {
      const csv = pacote.get(`tabelas/${tabela}.csv`);
      if (csv) {
        const cabecalho = csv.toString("utf8").replace(/^﻿/, "").split("\r\n")[0]!.split(";");
        for (const coluna of proibidas) {
          expect(cabecalho, `${tabela}.csv traz a coluna ${coluna}`).not.toContain(coluna);
        }
      }
      const json = pacote.get(`tabelas/${tabela}.json`);
      if (json) {
        const linhas = JSON.parse(json.toString("utf8")) as Array<Record<string, unknown>>;
        for (const linha of linhas) {
          for (const coluna of proibidas) {
            expect(Object.keys(linha), `${tabela}.json traz a chave ${coluna}`).not.toContain(coluna);
          }
        }
      }
    }

    // A tabela `aparelhos` TEM a linha (a semente deste teste a pôs), então a
    // prova não é de uma tabela vazia.
    const aparelhos = JSON.parse(pacote.get("tabelas/aparelhos.json")!.toString("utf8")) as unknown[];
    expect(aparelhos.length).toBeGreaterThan(0);

    for (const [caminho, conteudo] of pacote) {
      const texto = conteudo.toString("utf8");
      expect(texto, `ficha em ${caminho}`).not.toContain(FICHA_DE_SERRA_ALTA);
      expect(texto, `ficha do outro município em ${caminho}`).not.toContain(FICHA_DE_VALE_FUNDO);
      expect(texto, `hash de senha em ${caminho}`).not.toContain("scrypt$");
    }
  }, 60_000);
});

describe("A soma de verificação confere", () => {
  it("SOMAS-SHA256.txt traz uma linha por arquivo (menos ela mesma) e cada soma é a do arquivo", async () => {
    const pacote = await baixar(tokenAdministradora);
    const linhas = pacote.get("SOMAS-SHA256.txt")!.toString("utf8").trimEnd().split("\n");

    const declaradas = new Map<string, string>();
    for (const linha of linhas) {
      const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(linha);
      expect(m, `linha fora do formato: ${linha}`).not.toBeNull();
      expect(declaradas.has(m![2]!), `caminho repetido: ${m![2]}`).toBe(false);
      declaradas.set(m![2]!, m![1]!);
    }

    const reais = [...pacote.keys()].filter((c) => c !== "SOMAS-SHA256.txt");
    expect([...declaradas.keys()].sort()).toEqual(reais.sort());

    for (const [caminho, soma] of declaradas) {
      const calculada = createHash("sha256").update(pacote.get(caminho)!).digest("hex");
      expect(calculada, `soma de ${caminho}`).toBe(soma);
    }
  }, 60_000);
});

describe("Município suspenso", () => {
  it("recebe 403 acesso_suspenso com a frase de contrato, e nada é extraído nem registrado", async () => {
    const antes = await mem.bruto.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM exportacoes
        WHERE organizacao_id = '${ORG_SERRA_ALTA}' AND tipo = 'saida_de_municipio'`,
    );

    await mem.bruto.query(
      "UPDATE organizacoes SET acesso_suspenso_em = now(), suspensao_motivo = 'contrato em discussao' WHERE id = $1",
      [ORG_SERRA_ALTA],
    );
    try {
      const r = await app.inject({ method: "POST", url: "/saida/pacote.zip", headers: com(tokenAdministradora) });
      expect(r.statusCode).toBe(403);
      expect(r.json().erro).toBe("acesso_suspenso");
      expect(String(r.json().mensagem)).toMatch(/suspenso pelo fornecedor/i);
      expect(r.headers["content-type"]).not.toContain("application/zip");
    } finally {
      await mem.bruto.query(
        "UPDATE organizacoes SET acesso_suspenso_em = NULL, suspensao_motivo = NULL WHERE id = $1",
        [ORG_SERRA_ALTA],
      );
    }

    const depois = await mem.bruto.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM exportacoes
        WHERE organizacao_id = '${ORG_SERRA_ALTA}' AND tipo = 'saida_de_municipio'`,
    );
    expect(depois.rows[0]!.n).toBe(antes.rows[0]!.n);
  }, 60_000);
});
