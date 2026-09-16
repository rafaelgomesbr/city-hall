import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { derivarSenha } from "../src/auth/senha.js";
import { criarEnvio, type Alvo, type ProvedorDePush } from "../src/push/envio.js";
import { montarAviso } from "../src/push/mensagem.js";
import { travaDeProcesso } from "../src/push/trava.js";
import { varrerAvisos } from "../src/push/varredor.js";

/**
 * UM AMBIENTE DE APNs POR APARELHO, E NÃO UM PARA O SERVIDOR INTEIRO.
 *
 * A Apple tem dois serviços de push que não se falam, e qual vale é decidido
 * pelo `aps-environment` com que o BINÁRIO foi assinado: o que sai do Xcode
 * fala com o sandbox, o que sai do TestFlight e da loja fala com produção.
 * Até aqui o servidor tinha UMA escolha, `APNS_AMBIENTE`, para todos os
 * aparelhos. Com um agente no binário do Xcode e outro no do TestFlight, o
 * do ambiente errado recebe `BadDeviceToken`, que está na lista de "este
 * aparelho não existe mais", e o varredor o REVOGA. Ele reinstala, registra
 * de novo, é revogado de novo. Sem erro em lugar nenhum.
 *
 * O desenho: o aplicativo diz, no registro, em qual ambiente foi compilado
 * (decidido no build, pela mesma expressão que escreve o `aps-environment`);
 * a linha de `aparelhos` guarda; e o servidor mantém DOIS provedores da
 * Apple, roteando pela coluna. `APNS_AMBIENTE` vira o padrão de quem
 * registra sem o campo (aplicativo antigo) e das linhas que já existiam.
 */

const SENHA = "senha-de-teste-bem-comprida";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let appDeTeste: FastifyInstance;
let orgA: string;
let equipeA: string;
let agenteA: string;
const tokens: Record<string, string> = {};

function configDeTeste(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
    LOGIN_POR_IP: "10000",
    PUSH_ATIVO: "sim",
    APNS_KEY_ID: "TESTE12345",
    APNS_TEAM_ID: "TIME123456",
    APNS_CHAVE: "/caminho/que/nao/e/lido/nesta/suite.p8",
    APNS_BUNDLE: "br.gov.exemplo.dc360",
    ...extra,
  } as NodeJS.ProcessEnv;
}

async function entrar(instancia: FastifyInstance, chave: string): Promise<void> {
  const r = await instancia.inject({
    method: "POST", url: "/auth/entrar",
    payload: { email: "diego@serraalta.exemplo.gov.br", senha: SENHA },
  });
  expect(r.statusCode).toBe(200);
  tokens[chave] = r.json().acesso;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: false });
  const db = mem.bruto;
  const a = await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome,municipio,uf) VALUES ('DC Serra Alta','Serra Alta','MG') RETURNING id",
  );
  orgA = a.rows[0]!.id;
  const ea = await db.query<{ id: string }>(
    "INSERT INTO equipes (organizacao_id,nome) VALUES ($1,'Equipe Alfa') RETURNING id", [orgA],
  );
  equipeA = ea.rows[0]!.id;
  const hash = await derivarSenha(SENHA);
  const u = await db.query<{ id: string }>(
    `INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,equipe_id,senha_hash)
     VALUES ($1,'Diego Alves','SA-3','diego@serraalta.exemplo.gov.br','agente_campo',$2,$3)
     RETURNING id`,
    [orgA, equipeA, hash],
  );
  agenteA = u.rows[0]!.id;

  app = await construirServidor({
    banco: mem.banco,
    config: carregarConfig(configDeTeste()),
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
  });
  await app.ready();
  await entrar(app, "producao");

  appDeTeste = await construirServidor({
    banco: mem.banco,
    config: carregarConfig(configDeTeste({ APNS_AMBIENTE: "teste" })),
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
  });
  await appDeTeste.ready();
  await entrar(appDeTeste, "teste");
}, 120_000);

afterAll(async () => {
  await app?.close();
  await appDeTeste?.close();
  await mem?.banco.encerrar();
});

async function ambienteDaFicha(ficha: string): Promise<string | undefined> {
  const r = await mem.bruto.query<{ ambiente: string }>(
    "SELECT ambiente FROM aparelhos WHERE ficha = $1", [ficha],
  );
  return r.rows[0]?.ambiente;
}

describe("o registro guarda o ambiente do binário", () => {
  it("o aplicativo compilado pelo Xcode registra `teste`, e a linha guarda", async () => {
    const r = await app.inject({
      method: "POST", url: "/aparelhos",
      headers: { authorization: `Bearer ${tokens["producao"]}` },
      payload: { plataforma: "ios", ficha: "ficha-do-xcode", ambiente: "teste" },
    });
    expect(r.statusCode).toBe(200);
    expect(await ambienteDaFicha("ficha-do-xcode")).toBe("teste");
  });

  it("o aplicativo da loja registra `producao`", async () => {
    const r = await app.inject({
      method: "POST", url: "/aparelhos",
      headers: { authorization: `Bearer ${tokens["producao"]}` },
      payload: { plataforma: "ios", ficha: "ficha-da-loja", ambiente: "producao" },
    });
    expect(r.statusCode).toBe(200);
    expect(await ambienteDaFicha("ficha-da-loja")).toBe("producao");
  });

  it("sem o campo (aplicativo antigo), vale o APNS_AMBIENTE do servidor", async () => {
    const semCampo = await app.inject({
      method: "POST", url: "/aparelhos",
      headers: { authorization: `Bearer ${tokens["producao"]}` },
      payload: { plataforma: "ios", ficha: "ficha-antiga-em-producao" },
    });
    expect(semCampo.statusCode).toBe(200);
    expect(await ambienteDaFicha("ficha-antiga-em-producao")).toBe("producao");

    const noServidorDeTeste = await appDeTeste.inject({
      method: "POST", url: "/aparelhos",
      headers: { authorization: `Bearer ${tokens["teste"]}` },
      payload: { plataforma: "ios", ficha: "ficha-antiga-em-teste" },
    });
    expect(noServidorDeTeste.statusCode).toBe(200);
    expect(await ambienteDaFicha("ficha-antiga-em-teste")).toBe("teste");
  });

  it("registrar de novo com outro ambiente ATUALIZA: é o mesmo telefone que trocou de binário", async () => {
    const cabecalho = { authorization: `Bearer ${tokens["producao"]}` };
    await app.inject({
      method: "POST", url: "/aparelhos", headers: cabecalho,
      payload: { plataforma: "ios", ficha: "ficha-que-mudou", ambiente: "teste" },
    });
    await app.inject({
      method: "POST", url: "/aparelhos", headers: cabecalho,
      payload: { plataforma: "ios", ficha: "ficha-que-mudou", ambiente: "producao" },
    });
    expect(await ambienteDaFicha("ficha-que-mudou")).toBe("producao");
  });

  it("valor fora dos dois é recusado com 422, em vez de cair no padrão calado", async () => {
    // `sandbox` é como a Apple chama; aqui o vocabulário é o de APNS_AMBIENTE.
    const r = await app.inject({
      method: "POST", url: "/aparelhos",
      headers: { authorization: `Bearer ${tokens["producao"]}` },
      payload: { plataforma: "ios", ficha: "ficha-sandbox", ambiente: "sandbox" },
    });
    expect(r.statusCode).toBe(422);
    expect(await ambienteDaFicha("ficha-sandbox")).toBeUndefined();
  });
});

describe("o envio roteia pelo ambiente do aparelho", () => {
  const AVISO = montarAviso("tarefa_nova", {
    organizacaoId: "11111111-1111-4111-8111-000000000001",
    ocorrenciaId: "33333333-3333-4333-8333-000000000009",
    severidade: "media",
    prazoEm: null,
  });

  function provedorQueAnota(nome: string, anotacoes: string[]): ProvedorDePush {
    return {
      async enviar() { anotacoes.push(nome); return { desfecho: "entregue", detalhe: null }; },
    };
  }

  it("iOS em `teste` vai para o sandbox, iOS em `producao` vai para produção", async () => {
    const anotacoes: string[] = [];
    const enviar = criarEnvio({
      apple: {
        producao: provedorQueAnota("producao", anotacoes),
        teste: provedorQueAnota("teste", anotacoes),
      },
    });
    await enviar({ ficha: "a", plataforma: "ios", ambiente: "teste" }, AVISO);
    await enviar({ ficha: "b", plataforma: "ios", ambiente: "producao" }, AVISO);
    expect(anotacoes).toEqual(["teste", "producao"]);
  });

  it("um provedor só continua valendo para tudo (compatibilidade com quem monta um)", async () => {
    const anotacoes: string[] = [];
    const enviar = criarEnvio({ apple: provedorQueAnota("unico", anotacoes) });
    await enviar({ ficha: "a", plataforma: "ios", ambiente: "teste" }, AVISO);
    await enviar({ ficha: "b", plataforma: "ios" } as Alvo, AVISO);
    expect(anotacoes).toEqual(["unico", "unico"]);
  });

  it("ambiente sem provedor vira falha com detalhe, e não exceção nem silêncio", async () => {
    const enviar = criarEnvio({ apple: { producao: provedorQueAnota("producao", []) } });
    const r = await enviar({ ficha: "a", plataforma: "ios", ambiente: "teste" }, AVISO);
    expect(r.desfecho).toBe("falha");
    expect(r.detalhe).toMatch(/teste/);
  });

  it("o varredor entrega o ambiente do aparelho ao envio", async () => {
    await mem.bruto.query(
      `INSERT INTO aparelhos (organizacao_id, usuario_id, plataforma, ficha, ambiente)
       VALUES ($1,$2,'ios','ficha-no-sandbox','teste')`,
      [orgA, agenteA],
    );
    await mem.bruto.query(
      `INSERT INTO ocorrencias
         (organizacao_id,protocolo,tipo,status,severidade,endereco,solicitante_nome,
          canal_entrada,descricao,equipe_id,prazo_em)
       VALUES ($1,'000417/2026','deslizamento','em_campo','critica','Servidão Boa Esperança, 148',
               'Marilda Nogueira','telefone','Talude cedeu',$2, now() + interval '20 minutes')`,
      [orgA, equipeA],
    );

    const alvos: Alvo[] = [];
    await varrerAvisos({
      banco: mem.banco, trava: travaDeProcesso(), janelaMinutos: 60,
      enviar: async (alvo) => { alvos.push(alvo); return { desfecho: "entregue", detalhe: null }; },
    });

    const noSandbox = alvos.find((a) => a.ficha === "ficha-no-sandbox");
    expect(noSandbox, "o aparelho do sandbox não foi alvo da rodada").toBeDefined();
    expect(noSandbox!.ambiente).toBe("teste");
  });
});
