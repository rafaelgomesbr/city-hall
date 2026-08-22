import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { provisionarMunicipio } from "../src/provisionar.js";

/**
 * Provisionar um município novo.
 *
 * Este era o buraco que impedia o produto de ganhar um segundo cliente sem
 * alguém abrir o banco de produção e digitar INSERT: não havia rota nem
 * comando que criasse `organizacoes` e o primeiro administrador. Na prática o
 * poder máximo era quem tinha a `DATABASE_URL`, e isso não estava escrito.
 *
 * O que estes casos exigem, e que não é óbvio: o município recém-criado
 * precisa ENTRAR e FUNCIONAR imediatamente, sem passo manual nenhum depois. É
 * fácil escrever um provisionamento que cria as linhas e deixa o município
 * inutilizável, por exemplo sem sequência de protocolo.
 */

let mem: BancoEmMemoria;
let app: FastifyInstance;

const SENHA = "senha-inicial-sorteada-de-teste";

beforeAll(async () => {
  mem = await bancoEmMemoria();
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-provisionamento-com-mais-de-32-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
  });
  await app.ready();
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

/** O executor do teste é o banco cru, que é o papel de dono que a CLI usa. */
function comoDono() {
  return {
    query: async <T,>(sql: string, params?: readonly unknown[]) => {
      const r = await mem.bruto.query<Record<string, unknown>>(
        sql, params ? [...params] : undefined,
      );
      return { rows: r.rows as T[] };
    },
  };
}

describe("Provisionar município", () => {
  it("cria o município e o primeiro administrador", async () => {
    const criado = await provisionarMunicipio(comoDono(), {
      orgao: "Coordenadoria Municipal de Proteção e Defesa Civil de Pedra Branca",
      municipio: "Pedra Branca", uf: "mg",
      nome: "Vânia Estevam Nogueira", matricula: "PB-1",
      email: "vania.nogueira@pedrabranca.exemplo.gov.br",
      senha: SENHA,
    });

    expect(criado.organizacaoId).toMatch(/^[0-9a-f-]{36}$/);
    expect(criado.usuarioId).toMatch(/^[0-9a-f-]{36}$/);

    const org = await mem.bruto.query<{ uf: string; municipio: string }>(
      "SELECT uf, municipio FROM organizacoes WHERE id = $1", [criado.organizacaoId],
    );
    // A UF é normalizada para maiúscula na gravação: quem digita na linha de
    // comando não deve precisar lembrar disso.
    expect(org.rows[0]!.uf).toBe("MG");
    expect(org.rows[0]!.municipio).toBe("Pedra Branca");
  }, 120_000);

  it("o administrador recém-criado consegue entrar", async () => {
    // Provisionar que não deixa ninguém entrar não provisionou nada.
    const r = await app.inject({
      method: "POST", url: "/auth/entrar",
      payload: { email: "vania.nogueira@pedrabranca.exemplo.gov.br", senha: SENHA },
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().usuario.papel).toBe("administrador");
    expect(r.json().usuario.municipio).toBe("Pedra Branca");
  }, 120_000);

  it("o município nasce funcionando: dá para abrir ocorrência e sai protocolo", async () => {
    /*
      A sequência de protocolo é criada sob demanda pela função do banco, e não
      pelo provisionamento. Este caso existe para provar isso: um município que
      não consegue gerar o primeiro protocolo é um município que não funciona,
      e o defeito só apareceria na frente do primeiro cliente.
    */
    const entrada = await app.inject({
      method: "POST", url: "/auth/entrar",
      payload: { email: "vania.nogueira@pedrabranca.exemplo.gov.br", senha: SENHA },
    });
    const token = entrada.json().acesso;

    const r = await app.inject({
      method: "POST", url: "/ocorrencias",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        tipo: "deslizamento",
        endereco: "Rua da Pedreira, 80, Centro",
        solicitanteNome: "Moradora do imóvel vizinho",
        canalEntrada: "telefone",
        descricao: "Barranco cedeu depois da chuva da madrugada.",
      },
    });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().protocolo).toMatch(/^\d{6}\/\d{4}$/);
    // Município novo começa do começo, e não continua a numeração de outro.
    expect(r.json().protocolo.startsWith("000001/")).toBe(true);
  }, 120_000);

  it("o novo município não enxerga o município que já existia", async () => {
    // O provisionamento não pode abrir buraco no isolamento, que é a regra
    // número um. Aqui o município novo entra e a fila dele tem só o que é dele.
    const entrada = await app.inject({
      method: "POST", url: "/auth/entrar",
      payload: { email: "vania.nogueira@pedrabranca.exemplo.gov.br", senha: SENHA },
    });
    const token = entrada.json().acesso;

    const r = await app.inject({
      method: "GET", url: "/ocorrencias?status=todas",
      headers: { authorization: `Bearer ${token}` },
    });
    const protocolos = (r.json().itens as Array<{ protocolo: string }>)
      .map((o) => o.protocolo);
    expect(protocolos).toEqual(["000001/" + new Date().getFullYear()]);
  }, 120_000);

  it("recusa provisionar o mesmo município duas vezes", async () => {
    /*
      Sem esta recusa, provisionar de novo criaria um segundo município com o
      mesmo nome, e o isolamento faria os dados do primeiro ficarem invisíveis
      para ele. O sintoma seria "o sistema perdeu tudo", com tudo intacto no
      banco, do lado errado da parede.
    */
    await expect(provisionarMunicipio(comoDono(), {
      orgao: "Outra coordenadoria qualquer",
      municipio: "pedra branca", uf: "MG",
      nome: "Outra Pessoa", matricula: "PB-2",
      email: "outra.pessoa@pedrabranca.exemplo.gov.br",
      senha: SENHA,
    })).rejects.toThrow(/já existe município/i);
  }, 120_000);
});
