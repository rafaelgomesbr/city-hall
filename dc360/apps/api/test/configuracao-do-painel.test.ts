import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { derivarSenha } from "../src/auth/senha.js";

/**
 * A chave do mapa vem DAQUI, em tempo de execução.
 *
 * O defeito que este arquivo fecha é de conta a pagar, e não de código
 * quebrado. O painel lia a chave de `import.meta.env["VITE_GOOGLE_MAPS_CHAVE"]`,
 * que é variável de tempo de BUILD, e o painel é um build estático só servindo
 * todos os municípios. Assar a chave ali significaria uma chave do
 * FORNECEDOR, cobrada no cartão dele, pagando o carregamento de mapa de todas
 * as prefeituras: o Google cobra por carregamento. Na prática ninguém assou
 * nada, a variável ficou vazia na Vercel, e o painel rodou desde sempre no
 * modo esquemático sem que o modo com chave jamais tivesse contato com o
 * Google.
 *
 * O que esta suíte fixa:
 *
 * - a rota existe, exige token e devolve a chave que a IMPLANTAÇÃO configurou;
 * - sem chave configurada ela devolve string vazia, que é o modo esquemático,
 *   e não um erro: município sem chave precisa subir e precisa enxergar o mapa;
 * - a resposta tem UM campo e nada mais. A configuração da API tem segredo de
 *   JWT, credencial de armazenamento e chave do segundo fator: o dia em que
 *   alguém devolver o objeto de configuração inteiro "porque é prático" é o dia
 *   em que esta rota vira vazamento;
 * - a resposta é a MESMA para os dois municípios, porque o que ela devolve é
 *   configuração da implantação e não dado de tenant.
 */

const SENHA = "senha-de-teste-bem-comprida";

/**
 * Chave de mentira, com a forma de uma de verdade.
 *
 * A chave real do Rafa mora em `apps/api/.env` e não entra em arquivo
 * versionado, em teste nem em log. O que importa aqui é que o valor
 * configurado chega ao painel intacto, e para isso qualquer texto serve.
 */
const CHAVE_DE_MENTIRA = "AIzaSyCHAVE-DE-MENTIRA-SO-PARA-O-TESTE";

let mem: BancoEmMemoria;
let comChave: FastifyInstance;
let semChave: FastifyInstance;

const tokens: Record<string, string> = {};

function configDeTeste(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
    LOGIN_POR_IP: "10000",
    ...extra,
  } as NodeJS.ProcessEnv;
}

async function entrar(instancia: FastifyInstance, email: string): Promise<void> {
  const r = await instancia.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  expect(r.statusCode, `login de ${email} falhou: ${r.body}`).toBe(200);
  tokens[email] = r.json().acesso;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: false });
  const db = mem.bruto;

  const a = await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome,municipio,uf) VALUES ('DC Serra Alta','Serra Alta','MG') RETURNING id",
  );
  const b = await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome,municipio,uf) VALUES ('DC Vale Fundo','Vale Fundo','MG') RETURNING id",
  );

  const hash = await derivarSenha(SENHA);
  const pessoas: Array<[string, string, string, string, string]> = [
    [a.rows[0]!.id, "Helena Coutinho", "SA-1", "helena@serraalta.exemplo.gov.br", "coordenador"],
    [b.rows[0]!.id, "Aurelio Prates", "VF-1", "aurelio@valefundo.exemplo.gov.br", "coordenador"],
    [a.rows[0]!.id, "Diego Alves", "SA-3", "diego@serraalta.exemplo.gov.br", "agente_campo"],
  ];
  for (const [org, nome, matricula, email, papel] of pessoas) {
    await db.query(
      `INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,senha_hash)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [org, nome, matricula, email, papel, hash],
    );
  }

  comChave = await construirServidor({
    banco: mem.banco,
    config: carregarConfig(configDeTeste({ MAPS_KEY: CHAVE_DE_MENTIRA })),
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
  });
  await comChave.ready();

  semChave = await construirServidor({
    banco: mem.banco,
    config: carregarConfig(configDeTeste()),
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
  });
  await semChave.ready();

  await entrar(comChave, "helena@serraalta.exemplo.gov.br");
  await entrar(comChave, "aurelio@valefundo.exemplo.gov.br");
  await entrar(comChave, "diego@serraalta.exemplo.gov.br");
}, 120_000);

afterAll(async () => {
  await comChave?.close();
  await semChave?.close();
  await mem?.banco.encerrar();
});

function comToken(email: string) {
  return { authorization: `Bearer ${tokens[email]!}` };
}

describe("GET /configuracao, a chave do mapa em tempo de execução", () => {
  it("devolve a chave que a implantação configurou", async () => {
    const r = await comChave.inject({
      method: "GET", url: "/configuracao",
      headers: comToken("helena@serraalta.exemplo.gov.br"),
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(
      r.json().chaveDoMapa,
      "a chave configurada no ambiente da API não chegou ao painel. É este o "
      + "caminho que substitui a variável de build: o painel é um build só para "
      + "todos os municípios, e a chave assada ali seria a do fornecedor "
      + "pagando o mapa de todas as prefeituras",
    ).toBe(CHAVE_DE_MENTIRA);
  });

  it("sem chave configurada devolve vazio, e não erro", async () => {
    const r = await semChave.inject({
      method: "GET", url: "/configuracao",
      headers: comToken("helena@serraalta.exemplo.gov.br"),
    });
    expect(
      r.statusCode,
      "município sem chave precisa subir e precisa enxergar o mapa: vazio é o "
      + "modo esquemático prometido na seção 2.2 de docs/SUBPROCESSADORES.md, "
      + "não uma falha",
    ).toBe(200);
    expect(r.json().chaveDoMapa).toBe("");
  });

  it("exige token", async () => {
    const r = await comChave.inject({ method: "GET", url: "/configuracao" });
    expect(
      r.statusCode,
      "a rota respondeu sem token. Isto NÃO protege a chave, que é pública por "
      + "construção e viaja no JavaScript da página (quem protege a conta é a "
      + "restrição por referenciador HTTP no console do Google). O que o token "
      + "evita é uma varredura da internet colher a chave da implantação sem "
      + "nem abrir o painel, e o que ele preserva é a regra da superfície: "
      + "toda rota exige token, e isenção é decisão revisada",
    ).toBe(401);
  });

  it("devolve UM campo, e nenhum outro pedaço da configuração", async () => {
    const r = await comChave.inject({
      method: "GET", url: "/configuracao",
      headers: comToken("helena@serraalta.exemplo.gov.br"),
    });
    expect(
      Object.keys(r.json()).sort(),
      "a resposta cresceu. A configuração desta API tem JWT_SEGREDO, "
      + "credencial de armazenamento, SEGUNDO_FATOR_CHAVE e credencial de "
      + "push: cada campo novo aqui precisa ser uma decisão, porque o atalho "
      + "de devolver o objeto inteiro transforma esta rota em vazamento",
    ).toEqual(["chaveDoMapa"]);

    const texto = r.body;
    for (const proibido of ["segredo", "SEGREDO", "senha", "hash", "jwt", "JWT"]) {
      expect(texto.includes(proibido), `a resposta cita "${proibido}"`).toBe(false);
    }
  });

  it("responde igual para os dois municípios, porque não é dado de município", async () => {
    const serraAlta = await comChave.inject({
      method: "GET", url: "/configuracao",
      headers: comToken("helena@serraalta.exemplo.gov.br"),
    });
    const valeFundo = await comChave.inject({
      method: "GET", url: "/configuracao",
      headers: comToken("aurelio@valefundo.exemplo.gov.br"),
    });
    expect(
      valeFundo.json(),
      "se um dia esta resposta passar a depender de quem perguntou, ela deixa "
      + "de ser configuração da implantação e vira dado de tenant, e aí precisa "
      + "passar pelo mesmo caminho de isolamento do resto do produto em vez "
      + "deste atalho que não abre transação nenhuma",
    ).toEqual(serraAlta.json());
  });

  it("o agente de campo também recebe: o mapa não é privilégio de papel", async () => {
    /*
      Sem permissão de negócio de propósito. A tabela de permissões responde
      "quem classifica na triagem, quem despacha equipe, quem encerra": nenhuma
      dessas perguntas é esta. Escolher uma permissão arbitrária aqui deixaria
      algum papel legítimo com a tela do mapa quebrada, sem ganho nenhum de
      isolamento.
    */
    const r = await comChave.inject({
      method: "GET", url: "/configuracao",
      headers: comToken("diego@serraalta.exemplo.gov.br"),
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().chaveDoMapa).toBe(CHAVE_DE_MENTIRA);
  });
});
