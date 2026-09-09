import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { carregarConfig } from "../src/config.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { construirServidor } from "../src/servidor.js";

/*
  O defeito que este arquivo guarda.

  O limitador global contava por ENDEREÇO. A Defesa Civil inteira sai por um
  NAT só: painel da coordenação, telefone do plantão e os aparelhos dos agentes
  chegam à API com o mesmo endereço. Contando por endereço, todos dividiam UM
  balde, e o balde enche justamente na noite de chuva, quando todo mundo
  sincroniza ao mesmo tempo. O quinto agente a subir vistoria levava 429 por
  causa do tráfego dos colegas: o limite parava de conter abuso e passava a
  derrubar o uso legítimo, na pior hora possível.

  A correção é contar por usuário QUANDO HÁ TOKEN VERIFICADO. E ela tem duas
  bordas que precisam de teste tanto quanto o caso principal:

  1. A chave sai do token JÁ VERIFICADO. Se saísse de cabeçalho ou do corpo,
     bastaria inventar um identificador novo a cada requisição para ter balde
     novo a cada requisição, e o limitador viraria enfeite.
  2. O teto por endereço continua existindo. Entrar, recuperar senha e
     registrar interesse acontecem sem token, e é exatamente aí que o limite
     por endereço defende de verdade.
*/

let app: FastifyInstance;
let mem: BancoEmMemoria;

const SENHA = "senha-de-teste-bem-longa";

/** Igual ao `max` do limitador global em `src/servidor.ts`. */
const TETO_GLOBAL = 300;

/** O endereço único por onde a prefeitura inteira sai. */
const NAT_DA_PREFEITURA = "203.0.113.10";

let tokenDiego = "";
let tokenBianca = "";

async function comoUsuario(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar",
    // Endereço próprio para a preparação, para não gastar nenhum dos baldes
    // que os testes abaixo medem.
    headers: { "fly-client-ip": "198.51.100.1" },
    payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso as string;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: false });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
    LOGIN_POR_IP: "10000",
    /*
      Este arquivo inteiro simula uma API atrás do edge do Fly: é assim que ele
      dá a cada caso um endereço de origem próprio, por `Fly-Client-IP`, sem
      abrir trinta conexões de lugares diferentes.

      A declaração precisa estar aqui desde 09/09/2026, quando o servidor
      deixou de aceitar aquele cabeçalho de qualquer cliente. Sem ela, todos os
      casos abaixo dividiriam UM balde (o do `req.ip` do `inject`), e o segundo
      caso já começaria com o teto do primeiro estourado. Ver
      `endereco-de-origem.test.ts` para o defeito que a declaração fecha, e
      note que ele é a outra metade deste: aqui o cabeçalho PRECISA valer, lá
      ele precisa não valer.
    */
    PROXY_DE_BORDA: "fly",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
  });
  await app.ready();

  const { derivarSenha } = await import("../src/auth/senha.js");
  const hash = await derivarSenha(SENHA);

  const org = await mem.bruto.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('Coordenadoria','Serra Alta','MG') RETURNING id",
  );
  const orgId = org.rows[0]!.id;

  const equipe = await mem.bruto.query<{ id: string }>(
    "INSERT INTO equipes (organizacao_id, nome) VALUES ($1,'Alfa') RETURNING id", [orgId],
  );
  const equipeId = equipe.rows[0]!.id;

  for (const [nome, matricula, email] of [
    ["Diego", "A-1", "diego@serraalta.exemplo.gov.br"],
    ["Bianca", "A-2", "bianca@serraalta.exemplo.gov.br"],
  ] as const) {
    await mem.bruto.query(
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, equipe_id, senha_hash)
       VALUES ($1,$2,$3,$4,'agente_campo',$5,$6)`,
      [orgId, nome, matricula, email, equipeId, hash],
    );
  }

  tokenDiego = await comoUsuario("diego@serraalta.exemplo.gov.br");
  tokenBianca = await comoUsuario("bianca@serraalta.exemplo.gov.br");
}, 120_000);

afterAll(async () => {
  await app.close();
  await mem.banco.encerrar();
});

/**
 * Bate numa rota barata e devolve os códigos. `/saude` serve porque o que está
 * sob teste é o limitador, que roda antes de qualquer regra de negócio.
 */
async function bater(
  vezes: number,
  endereco: string,
  autorizacao?: () => string | undefined,
): Promise<number[]> {
  const codigos: number[] = [];
  for (let i = 0; i < vezes; i++) {
    const token = autorizacao?.();
    const r = await app.inject({
      method: "GET", url: "/saude",
      headers: {
        "fly-client-ip": endereco,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    codigos.push(r.statusCode);
  }
  return codigos;
}

describe("limite de requisição por usuário", () => {
  it("agente que estoura o próprio teto não derruba o colega atrás do mesmo NAT", async () => {
    const doDiego = await bater(TETO_GLOBAL, NAT_DA_PREFEITURA, () => tokenDiego);
    expect(
      doDiego.every((c) => c === 200),
      `o teto do próprio agente foi cortado antes da hora: ${doDiego.join(",")}`,
    ).toBe(true);

    // O balde do Diego está cheio, e é dele que ele estourou.
    const maisUmaDoDiego = await bater(1, NAT_DA_PREFEITURA, () => tokenDiego);
    expect(maisUmaDoDiego).toEqual([429]);

    /*
      A linha que reprovava antes da correção. A Bianca não mandou requisição
      nenhuma; ela só tem o azar de estar no mesmo prédio que o Diego. Com o
      balde por endereço, ela recebia 429 no meio da chuva por causa da
      sincronização dele.
    */
    const daBianca = await bater(1, NAT_DA_PREFEITURA, () => tokenBianca);
    expect(daBianca, "colega atrás do mesmo endereço levou o 429 do outro").toEqual([200]);
  }, 120_000);

  it("token inventado a cada requisição não abre balde novo, cai no teto do endereço", async () => {
    /*
      A armadilha de segurança do limitador por identidade: se a chave viesse do
      cabeçalho como o cliente mandou, quem quisesse tráfego ilimitado só
      precisaria trocar o valor a cada chamada. Aqui cada requisição manda um
      Bearer diferente e todos são inválidos, então nenhum deles abre balde: as
      302 chamadas dividem o balde do endereço, e a última leva 429.
    */
    const endereco = "203.0.113.20";
    const inventados = await bater(
      TETO_GLOBAL, endereco, () => `nao-e-um-token-${crypto.randomUUID()}`,
    );
    expect(
      inventados.every((c) => c === 200),
      `teto do endereço cortou antes da hora: ${inventados.join(",")}`,
    ).toBe(true);

    const maisUmaInventada = await bater(1, endereco, () => `outro-${crypto.randomUUID()}`);
    expect(
      maisUmaInventada,
      "token inventado ganhou balde próprio: a chave está vindo de fora do token verificado",
    ).toEqual([429]);

    // E o balde estourado é mesmo o do endereço: quem chega sem token nenhum,
    // do mesmo lugar, encontra a porta fechada.
    const semToken = await bater(1, endereco);
    expect(semToken).toEqual([429]);
  }, 120_000);

  it("o teto por endereço continua valendo para quem não tem token", async () => {
    /*
      Sem esta garantia a correção teria trocado um problema por outro pior:
      entrar, recuperar senha e registrar interesse acontecem sem token, e é
      justamente aí que o limite por endereço é a defesa.
    */
    const endereco = "203.0.113.30";
    const anonimas = await bater(TETO_GLOBAL, endereco);
    expect(
      anonimas.every((c) => c === 200),
      `teto anônimo cortou antes da hora: ${anonimas.join(",")}`,
    ).toBe(true);

    const passandoDoTeto = await bater(1, endereco);
    expect(passandoDoTeto, "tráfego anônimo ficou sem teto nenhum").toEqual([429]);
  }, 120_000);
});
