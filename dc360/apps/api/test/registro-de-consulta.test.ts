import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * Quem consultou dado de cidadão.
 *
 * O BURACO QUE ISTO FECHA: exportação deixava rastro desde a migração 007, e
 * leitura não deixava nenhum. O sistema sabia dizer quem tirou a base do
 * município em março e não sabia dizer quem abriu o dossiê de uma família
 * específica, que é a pergunta que a autoridade nacional faz quando um dado
 * vaza e a única que o próprio titular consegue formular.
 *
 * As duas coisas que este arquivo prova, e a segunda é tão importante quanto a
 * primeira:
 *
 *   1. abrir o dossiê e emitir o laudo deixam linha;
 *   2. a linha registra o ACESSO e nunca o DADO. Um registro que carregasse o
 *      nome lido seria uma segunda cópia do dado sensível, com a mesma
 *      exposição e sem a mesma retenção, e o produto teria inventado um
 *      vazamento novo para poder investigar vazamento.
 */

const SENHA = "defesa-civil-2026";
const OCORRENCIA_DE_A = "11111111-1111-4111-8111-0000000000c1";
const OCORRENCIA_COM_VISTORIA = "11111111-1111-4111-8111-0000000000c3";
const OCORRENCIA_DE_B = "22222222-2222-4222-8222-0000000000c1";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenCoordenador: string;
let tokenOperador: string;
let tokenDeFora: string;

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function consultasDe(ocorrenciaId: string) {
  const r = await mem.bruto.query<{
    usuario_nome: string; usuario_papel: string; recurso: string;
    finalidade: string; consultada_em: Date;
  }>(
    `SELECT * FROM ocorrencia_consultas
      WHERE ocorrencia_id = $1 ORDER BY consultada_em`,
    [ocorrenciaId],
  );
  return r.rows;
}

async function totalDeConsultas(): Promise<number> {
  const r = await mem.bruto.query<{ total: string }>(
    "SELECT count(*)::text AS total FROM ocorrencia_consultas",
  );
  return Number(r.rows[0]!.total);
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-do-registro-de-consulta-com-32-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  tokenCoordenador = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
  tokenOperador = await entrar("jonas.ferreira@serraalta.exemplo.gov.br");
  tokenDeFora = await entrar("aurelio.machado@valefundo.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Abrir o dossiê deixa registro", () => {
  it("guarda quem, quando, qual recurso e com que finalidade", async () => {
    const antes = await consultasDe(OCORRENCIA_DE_A);

    const r = await app.inject({
      method: "GET", url: `/ocorrencias/${OCORRENCIA_DE_A}`,
      headers: com(tokenCoordenador),
    });
    expect(r.statusCode).toBe(200);

    const depois = await consultasDe(OCORRENCIA_DE_A);
    expect(depois.length).toBe(antes.length + 1);

    const ultima = depois.at(-1)!;
    expect(ultima.usuario_nome).toMatch(/Helena/i);
    expect(ultima.usuario_papel).toBe("coordenador");
    expect(ultima.recurso).toBe("ocorrencia_detalhe");
    expect(ultima.finalidade).toBe("atendimento");
  }, 60_000);

  it("registra a REPETIÇÃO, porque é ela que descreve consulta desnecessária", async () => {
    const antes = (await consultasDe(OCORRENCIA_DE_A)).length;
    for (let i = 0; i < 3; i += 1) {
      await app.inject({
        method: "GET", url: `/ocorrencias/${OCORRENCIA_DE_A}`,
        headers: com(tokenOperador),
      });
    }
    expect((await consultasDe(OCORRENCIA_DE_A)).length).toBe(antes + 3);
  }, 60_000);

  it("emitir o laudo também registra, com a finalidade do documento", async () => {
    const r = await app.inject({
      method: "GET", url: `/documentos/${OCORRENCIA_COM_VISTORIA}/laudo`,
      headers: com(tokenCoordenador),
    });
    expect(r.statusCode).toBe(200);

    const linhas = await consultasDe(OCORRENCIA_COM_VISTORIA);
    const doLaudo = linhas.filter((l) => l.recurso === "laudo");
    expect(
      doLaudo.length,
      "o laudo e onde a concentracao de dado pessoal e maior, e ele sai impresso",
    ).toBeGreaterThan(0);
    expect(doLaudo.at(-1)!.finalidade).toBe("emissao_de_documento");
  }, 60_000);
});

describe("O que NÃO deixa registro, e por quê", () => {
  it("a listagem não registra: é a fila de trabalho, não o dossiê de ninguém", async () => {
    /*
      O critério está escrito em `privacidade/consulta.ts`: registra-se a
      leitura que CONCENTRA dado de pessoa numa ocorrência identificada. A
      lista é a tela inicial do painel e é recarregada o dia inteiro por todo
      mundo; registrá-la produziria milhões de linhas por ano e a tabela que
      existe para responder "quem viu os dados dessa família?" ficaria
      ilegível justamente por excesso de resposta.
    */
    const antes = await totalDeConsultas();
    await app.inject({ method: "GET", url: "/ocorrencias", headers: com(tokenCoordenador) });
    await app.inject({ method: "GET", url: "/ocorrencias/mapa", headers: com(tokenCoordenador) });
    await app.inject({
      method: "GET", url: "/ocorrencias/indicadores/painel", headers: com(tokenCoordenador),
    });
    expect(await totalDeConsultas()).toBe(antes);
  }, 60_000);

  it("ocorrência de outro município não registra nada, nem a tentativa", async () => {
    /*
      Registrar aqui transformaria a tabela num diário de tentativas de
      adivinhação de identificador, e daria a quem varre uma forma de encher o
      registro de acesso de um município sem nem saber se ele existe.
    */
    const antes = await totalDeConsultas();
    const r = await app.inject({
      method: "GET", url: `/ocorrencias/${OCORRENCIA_DE_A}`, headers: com(tokenDeFora),
    });
    expect(r.statusCode).toBe(404);
    expect(await totalDeConsultas()).toBe(antes);
  }, 60_000);
});

describe("Registra o acesso, e nunca o dado", () => {
  it("nenhuma coluna da tabela carrega conteúdo lido", async () => {
    await app.inject({
      method: "GET", url: `/ocorrencias/${OCORRENCIA_DE_A}`,
      headers: com(tokenCoordenador),
    });

    const r = await mem.bruto.query<Record<string, unknown>>(
      "SELECT * FROM ocorrencia_consultas WHERE ocorrencia_id = $1 LIMIT 1",
      [OCORRENCIA_DE_A],
    );
    const bruto = JSON.stringify(r.rows[0]);

    // O dossiê da ocorrência da semente carrega estes três. Nenhum pode ter
    // atravessado para o registro de acesso.
    expect(bruto).not.toContain("Marilda");
    expect(bruto).not.toContain("99871");
    expect(bruto).not.toContain("acamada");
  }, 60_000);
});

describe("O registro é append-only e do próprio município", () => {
  it("o papel de aplicação não altera nem apaga o que registrou", async () => {
    for (const comando of [
      "UPDATE ocorrencia_consultas SET usuario_nome = 'Outra pessoa'",
      "DELETE FROM ocorrencia_consultas",
    ]) {
      await expect(
        mem.banco.comTenant(
          "11111111-1111-4111-8111-000000000001",
          async (c) => c.query(comando),
        ),
        `o papel de aplicacao conseguiu executar: ${comando}`,
      ).rejects.toThrow(/permission denied|permissao|policy/i);
    }
  }, 60_000);

  it("a consulta do vizinho não aparece na auditoria daqui", async () => {
    await app.inject({
      method: "GET", url: `/ocorrencias/${OCORRENCIA_DE_B}`, headers: com(tokenDeFora),
    });

    const daqui = await app.inject({
      method: "GET", url: "/relatorios/consultas?porPagina=200",
      headers: com(tokenCoordenador),
    });
    expect(daqui.statusCode).toBe(200);
    const protocolos = daqui.json().itens.map((i: { protocolo: string }) => i.protocolo);
    expect(protocolos).toContain("000471/2026");
    expect(protocolos).not.toContain("000112/2026");
  }, 60_000);

  it("filtra por ocorrência, que é a pergunta da autoridade nacional", async () => {
    const r = await app.inject({
      method: "GET", url: `/relatorios/consultas?ocorrencia=${OCORRENCIA_DE_A}`,
      headers: com(tokenCoordenador),
    });
    expect(r.statusCode).toBe(200);
    const itens = r.json().itens as { protocolo: string; usuario_nome: string }[];
    expect(itens.length).toBeGreaterThan(0);
    for (const i of itens) expect(i.protocolo).toBe("000471/2026");
  }, 60_000);

  it("a resposta da auditoria não devolve o endereço de rede de quem consultou", async () => {
    /*
      Ele fica gravado, porque distingue "abriu da prefeitura" de "abriu de
      casa às três da manhã" numa investigação, e é entregue por quem
      administra o banco a quem estiver investigando. Numa tela de uso diário
      seria vigilância de servidor público, que não é a finalidade da tabela.
    */
    const r = await app.inject({
      method: "GET", url: "/relatorios/consultas", headers: com(tokenCoordenador),
    });
    expect(r.body).not.toContain("\"ip\"");
  }, 60_000);

  it("operador não lê o registro de acesso do município", async () => {
    const r = await app.inject({
      method: "GET", url: "/relatorios/consultas", headers: com(tokenOperador),
    });
    expect(r.statusCode).toBe(403);
  }, 60_000);
});
