import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { carregarConfig } from "../src/config.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { construirServidor } from "../src/servidor.js";

/*
  O defeito, relatado depois do primeiro uso em campo.

  O aparelho apaga e reescreve a lista de tarefas inteira a cada atualizacao.
  Uma ocorrencia encerrada no painel simplesmente DESAPARECE da tela do agente,
  sem lapide e sem aviso. Se ele tinha vistoria em andamento, o rascunho fica
  orfao e invisivel, e ao abrir o protocolo ele le "nao esta guardada neste
  aparelho, conecte-se e baixe de novo", que sugere problema de download quando
  o que houve foi cancelamento.

  E a restricao que este arquivo protege com mais cuidado: a rota nao pode
  virar oraculo de status. Quem manda um id de ocorrencia de OUTRA equipe
  precisa receber o mesmo silencio de quem manda um id inventado.
*/

let app: FastifyInstance;
let mem: BancoEmMemoria;
const SENHA = "senha-de-teste-bem-longa";

let orgId = "";
let equipeAlfa = "";
let equipeBravo = "";
let coordenador = "";
let agenteAlfa = "";
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
  orgId = org.rows[0]!.id;

  const alfa = await mem.bruto.query<{ id: string }>(
    "INSERT INTO equipes (organizacao_id, nome) VALUES ($1,'Alfa') RETURNING id", [orgId],
  );
  equipeAlfa = alfa.rows[0]!.id;
  const bravo = await mem.bruto.query<{ id: string }>(
    "INSERT INTO equipes (organizacao_id, nome) VALUES ($1,'Bravo') RETURNING id", [orgId],
  );
  equipeBravo = bravo.rows[0]!.id;

  const c = await mem.bruto.query<{ id: string }>(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
     VALUES ($1,'Helena','C-1','helena@serraalta.exemplo.gov.br','coordenador',$2) RETURNING id`,
    [orgId, hash],
  );
  coordenador = c.rows[0]!.id;
  const a = await mem.bruto.query<{ id: string }>(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, equipe_id, senha_hash)
     VALUES ($1,'Diego','A-1','diego@serraalta.exemplo.gov.br','agente_campo',$2,$3) RETURNING id`,
    [orgId, equipeAlfa, hash],
  );
  agenteAlfa = a.rows[0]!.id;

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

/** Abre, tria e despacha para a equipe pedida. Devolve o id. */
async function despachada(equipeId: string, endereco: string): Promise<string> {
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
    payload: { equipeId, prazoHoras: 24 },
  });
  return id;
}

async function reconciliar(conhecidas: string[]) {
  const r = await app.inject({
    method: "POST", url: "/sincronizacao/pendencias/reconciliar",
    headers: comAgente(), payload: { conhecidas },
  });
  return { status: r.statusCode, corpo: r.json() as { saidas: Array<Record<string, unknown>> } };
}

describe("reconciliação de pendências", () => {
  it("diz que a tarefa saiu porque a coordenação encerrou, com o motivo", async () => {
    const ativa = await despachada(equipeAlfa, "Servidão Boa Esperança, 148");
    const encerrada = await despachada(equipeAlfa, "Rua do Morro, 12");

    await app.inject({
      method: "POST", url: `/ocorrencias/${encerrada}/encerramento`, headers: comCoord(),
      payload: { motivo: "Morador se mudou por conta própria e o risco cessou." },
    });

    const { status, corpo } = await reconciliar([ativa, encerrada]);
    expect(status).toBe(200);

    // A que continua em campo NAO aparece: a resposta é só sobre o que saiu.
    expect(corpo.saidas.map((s) => s["id"])).toEqual([encerrada]);
    const saida = corpo.saidas[0]!;
    expect(saida["desfecho"]).toBe("encerrada");
    expect(String(saida["motivo"])).toContain("risco cessou");
    expect(saida["saiuEm"]).not.toBeNull();
  });

  it("id de ocorrência de OUTRA equipe é indistinguível de id inexistente", async () => {
    // Este é o teste que impede a rota de virar oráculo de status.
    const deOutraEquipe = await despachada(equipeBravo, "Travessa das Flores, 3");
    await app.inject({
      method: "POST", url: `/ocorrencias/${deOutraEquipe}/encerramento`, headers: comCoord(),
      payload: { motivo: "Encerrada pela coordenação depois da vistoria." },
    });

    const inventado = "00000000-0000-4000-8000-000000000000";
    const { corpo } = await reconciliar([deOutraEquipe, inventado]);
    expect(corpo.saidas).toEqual([]);
  });

  it("recusa lista maior que o teto, para não virar varredura de identificador", async () => {
    const muitos = Array.from({ length: 201 }, () => "00000000-0000-4000-8000-000000000000");
    const r = await app.inject({
      method: "POST", url: "/sincronizacao/pendencias/reconciliar",
      headers: comAgente(), payload: { conhecidas: muitos },
    });
    expect(r.statusCode).toBe(422);
  });

  it("lista vazia responde sem saída nenhuma", async () => {
    const { status, corpo } = await reconciliar([]);
    expect(status).toBe(200);
    expect(corpo.saidas).toEqual([]);
  });

  it("exige o papel de agente de campo", async () => {
    const r = await app.inject({
      method: "POST", url: "/sincronizacao/pendencias/reconciliar",
      headers: comCoord(), payload: { conhecidas: [] },
    });
    expect(r.statusCode).toBe(403);
  });
});
