import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { carregarConfig } from "../src/config.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import type { Banco, Consulta } from "../src/banco/tipos.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { construirServidor } from "../src/servidor.js";

/*
  Dois envios da MESMA vistoria em voo ao mesmo tempo.

  Achado pelo teste de carga do turno T5, e ele não é hipótese de laboratório: o
  aparelho tem tempo limite de 20 segundos no envio. Numa conexão de morro, o
  servidor recebe, começa a gravar, e o aparelho desiste antes da resposta
  chegar. A fila então reenvia, com a MESMA chave de idempotência, enquanto o
  primeiro envio ainda está sendo processado.

  A rota fazia consulta e depois inserção: os dois envios passavam pela consulta
  sem achar nada, e os dois inseriam. O dado nunca esteve em risco, porque a
  restrição de unicidade `(organizacao_id, idempotency_key)` recusa o segundo.
  O problema era o QUE o agente via: erro 500 numa coleta que já estava salva.

  E a consequência disso é a pior que existe neste produto: a fila do aparelho
  trata erro de servidor como "tenta de novo", então ela reenviaria, receberia o
  mesmo erro, e o item ficaria preso PARA SEMPRE numa vistoria que o servidor já
  tem. Vistoria salva no servidor e presa no aparelho é o defeito que ninguém
  procura, porque quem olha o painel vê a vistoria lá.

  As evidências, na mesma rota, já tratavam a corrida com `ON CONFLICT DO
  NOTHING`. A vistoria não tratava.
*/

let app: FastifyInstance;
let mem: BancoEmMemoria;

/*
  A CORRIDA PRECISA SER FORÇADA, e a forma de forçar não é óbvia.

  Duas tentativas anteriores falharam, e as duas por motivo instrutivo:

  1. Disparar dois envios com `Promise.all`. NÃO funciona: o banco de teste é
     PGlite, uma conexão só, e ele serializa as transações. A segunda espera a
     primeira terminar, e o que se testa é o reenvio comum, que já funcionava.
     Com a correção revertida, os cinco casos passavam: o teste não provava nada.
  2. Gravar a linha concorrente com a conexão de dono DENTRO do gancho. TRAVA:
     a rota está com uma transação aberta na única conexão, e a segunda escrita
     espera por ela para sempre.

  O que funciona é cegar a consulta. O gancho faz a consulta de idempotência da
  rota devolver vazio MESMO com a linha no banco, que é exatamente o estado que
  a corrida produz: a rota olhou, não viu, e vai colidir no INSERT. O caminho de
  código exercitado é o mesmo, e o efeito colateral é zero.
*/
const CONSULTA_DE_IDEMPOTENCIA = "SELECT id FROM vistorias WHERE idempotency_key";

function bancoQueCega(base: Banco): Banco & { cegarProximaConsulta: () => void } {
  let cegar = false;
  return {
    ...base,
    comTenant: (org, execucao) => base.comTenant(org, (c) => execucao({
      async query(sql, params) {
        const r = await c.query(sql, params);
        if (cegar && sql.includes(CONSULTA_DE_IDEMPOTENCIA)) {
          cegar = false;
          return { rows: [] } as never;
        }
        return r as never;
      },
    } as Consulta)),
    cegarProximaConsulta: () => { cegar = true; },
  };
}

/** Cega a consulta de idempotência da PRÓXIMA requisição, e só dela. */
let cegarProximaConsulta: () => void;
const SENHA = "senha-de-teste-bem-longa";

let orgId = "";
let equipeAlfa = "";
let tokenAgente = "";
let tokenCoord = "";

async function comoUsuario(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
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
  } as NodeJS.ProcessEnv);
  const banco = bancoQueCega(mem.banco);
  cegarProximaConsulta = banco.cegarProximaConsulta;

  app = await construirServidor({
    banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
  });
  await app.ready();

  const { derivarSenha } = await import("../src/auth/senha.js");
  const hash = await derivarSenha(SENHA);

  const org = await mem.bruto.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('Coordenadoria','Serra Alta','MG') RETURNING id",
  );
  orgId = org.rows[0]!.id;

  const alfa = await mem.bruto.query<{ id: string }>(
    "INSERT INTO equipes (organizacao_id, nome) VALUES ($1,'Alfa') RETURNING id", [orgId],
  );
  equipeAlfa = alfa.rows[0]!.id;

  await mem.bruto.query(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
     VALUES ($1,'Helena','C-1','helena@serraalta.exemplo.gov.br','coordenador',$2)`,
    [orgId, hash],
  );
  await mem.bruto.query(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, equipe_id, senha_hash)
     VALUES ($1,'Diego','A-1','diego@serraalta.exemplo.gov.br','agente_campo',$2,$3)`,
    [orgId, equipeAlfa, hash],
  );

  await mem.bruto.query(
    "INSERT INTO protocolo_sequencias (organizacao_id, ano, ultimo) VALUES ($1,$2,1)",
    [orgId, new Date().getFullYear()],
  );

  tokenCoord = await comoUsuario("helena@serraalta.exemplo.gov.br");
  tokenAgente = await comoUsuario("diego@serraalta.exemplo.gov.br");
}, 120_000);

afterAll(async () => {
  await app.close();
  await mem.banco.encerrar();
});

const comCoord = () => ({ authorization: `Bearer ${tokenCoord}` });
const comAgente = () => ({ authorization: `Bearer ${tokenAgente}` });

async function despachada(endereco: string): Promise<string> {
  const aberta = await app.inject({
    method: "POST", url: "/ocorrencias", headers: comCoord(),
    payload: {
      solicitanteNome: "Joana", canalEntrada: "telefone", endereco,
      tipo: "deslizamento", descricao: "Trinca nova depois da chuva.",
    },
  });
  const id = aberta.json().id as string;
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: comCoord(),
    payload: { severidade: "alta", vulnerabilidadePresente: false },
  });
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/despacho`, headers: comCoord(),
    payload: { equipeId: equipeAlfa, prazoHoras: 24 },
  });
  return id;
}

function envelope(ocorrenciaId: string, chave: string) {
  const coletadaEm = new Date(Date.now() - 3_600_000).toISOString();
  return {
    idempotencyKey: chave,
    ocorrenciaId,
    coletadaEm,
    vistoria: {
      checklist: [
        { chave: "risco_iminente", resposta: true },
        { chave: "interdicao_indicada", resposta: false },
        { chave: "evacuacao_necessaria", resposta: false },
        { chave: "acionar_outro_orgao", resposta: false },
      ],
      fotos: [],
      gpsPrecisaoMetros: 11,
      assinanteNome: "Marilda Souza Prado",
      assinaturaChave: "assinatura.png",
      coletadaEm,
      observacoes: "Coleta feita sem sinal, no alto do morro.",
    },
  };
}

function enviar(corpo: ReturnType<typeof envelope>) {
  return app.inject({
    method: "POST", url: "/sincronizacao/vistoria", headers: comAgente(), payload: corpo,
  });
}

/**
 * Grava a vistoria, depois reenvia com a consulta de idempotência cega.
 *
 * O segundo envio é o que perde a corrida: ele olha, não vê (porque o gancho
 * escondeu), e vai bater no INSERT com a chave já ocupada.
 */
async function perdendoACorrida(ocorrenciaId: string, chave: string) {
  const primeira = await enviar(envelope(ocorrenciaId, chave));
  if (primeira.statusCode !== 201) throw new Error(`primeiro envio falhou: ${primeira.body}`);
  cegarProximaConsulta();
  return enviar(envelope(ocorrenciaId, chave));
}

describe("envio que perde a corrida para outro envio da mesma chave", () => {
  it("responde como reenvio, e NÃO com erro", async () => {
    /*
      O caso inteiro em uma linha: a rota consultou, não achou, e no instante
      seguinte a linha apareceu. Antes da correção isso estourava a restrição de
      unicidade e virava erro de servidor.
    */
    const ocorrencia = await despachada("Rua da Corrida, 1");
    const r = await perdendoACorrida(ocorrencia, "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa");

    expect(r.statusCode, `corpo: ${r.body}`).toBeLessThan(400);
    expect(r.json().duplicada).toBe(true);
  });

  it("aponta para a vistoria que o outro envio gravou, e não para uma nova", async () => {
    // Se a rota devolvesse um id diferente, o painel teria duas vistorias para
    // a mesma coleta e o laudo dependeria de qual delas alguém abrisse.
    const ocorrencia = await despachada("Rua da Corrida, 2");
    const chave = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
    const r = await perdendoACorrida(ocorrencia, chave);

    const gravadas = await mem.bruto.query<{ id: string }>(
      "SELECT id FROM vistorias WHERE idempotency_key = $1", [chave],
    );
    expect(gravadas.rows).toHaveLength(1);
    expect(r.json().vistoriaId).toBe(gravadas.rows[0]!.id);
  });

  it("grava UMA vistoria só para a ocorrência", async () => {
    const ocorrencia = await despachada("Rua da Corrida, 3");
    await perdendoACorrida(ocorrencia, "cccccccc-3333-4333-8333-cccccccccccc");

    const quantas = await mem.bruto.query<{ n: string }>(
      "SELECT count(*) AS n FROM vistorias WHERE ocorrencia_id = $1", [ocorrencia],
    );
    expect(Number(quantas.rows[0]!.n)).toBe(1);
  });

  it("a marca `duplicada` é o que solta o item da fila do aparelho", async () => {
    /*
      Não basta responder sem erro. A fila do aparelho lê `duplicada` para
      confirmar o item; sem a marca, ele voltaria a ser enviado na próxima
      drenagem, para sempre.
    */
    const ocorrencia = await despachada("Rua da Corrida, 4");
    const r = await perdendoACorrida(ocorrencia, "dddddddd-4444-4444-8444-dddddddddddd");
    expect(r.json()).toMatchObject({ duplicada: true });
  });

  it("o reenvio comum, sequencial, continua funcionando como antes", async () => {
    // Controle: a correção não pode ter mexido no caminho que já estava certo.
    const ocorrencia = await despachada("Rua da Corrida, 5");
    const chave = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee";

    const primeira = await enviar(envelope(ocorrencia, chave));
    const segunda = await enviar(envelope(ocorrencia, chave));

    expect(primeira.statusCode).toBe(201);
    expect(primeira.json().duplicada).toBe(false);
    expect(segunda.statusCode).toBe(200);
    expect(segunda.json().duplicada).toBe(true);
    expect(segunda.json().vistoriaId).toBe(primeira.json().vistoriaId);
  });
}, 120_000);
