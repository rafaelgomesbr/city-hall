import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * Vistoria registrada por agente de fora da equipe designada.
 *
 * O DEFEITO, reproduzido: ocorrência despachada para a Equipe Bravo; o agente
 * Diego, da Equipe Alfa, NÃO a enxerga em `GET /sincronizacao/pendencias`, e
 * ainda assim `POST /sincronizacao/vistoria` respondia 201, o status virava
 * `vistoria_concluida` (a tarefa sumia da fila da equipe que de fato foi ao
 * local) e a coordenadora emitia o termo de interdição assinado com o nome de
 * Diego. É o caminho mais curto entre uma conta de agente comprometida e um
 * ato administrativo com brasão.
 *
 * A DECISÃO, e ela é o assunto deste arquivo. Recusar com 4xx parece a
 * correção e é uma troca ruim: `packages/campo/src/transporte.ts` transforma
 * toda resposta 4xx desta rota em `FalhaPermanente`, e não existe tela no
 * aplicativo para desbloquear item recusado. Uma coleta legítima (o agente
 * trocou de equipe entre coletar e enviar, ou a coordenação redespachou a
 * ocorrência enquanto ele subia o morro) morreria na fila do aparelho, com a
 * vistoria daquela família dentro. Perder coleta de campo é pior do que receber
 * coleta que precisa de conferência.
 *
 * Então: ACEITA E MARCA, em três lugares que ninguém precisa ir procurar.
 *
 * 1. As duas equipes ficam gravadas na vistoria (migração 024).
 * 2. A trilha ganha evento próprio, que a auditoria consegue listar.
 * 3. O laudo e o termo imprimem o aviso, na cara de quem vai assinar.
 *
 * E a tarefa NÃO é dada por concluída: a fila da equipe designada continua
 * intacta, que era a metade mais cara do defeito.
 */

const SENHA = "defesa-civil-2026";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";
const EQUIPE_BRAVO = "11111111-1111-4111-8111-0000000000e2";
const AGENTE_DIEGO = "11111111-1111-4111-8111-0000000000d3";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenAgente: string;
let tokenCoordenador: string;

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

async function ocorrencia(
  endereco: string, equipeId: string | null,
): Promise<string> {
  const criar = await app.inject({
    method: "POST", url: "/ocorrencias", headers: com(tokenCoordenador),
    payload: {
      solicitanteNome: "Marilda Souza Prado", canalEntrada: "telefone",
      endereco, tipo: "deslizamento",
      descricao: "Talude atrás da casa cedeu depois da chuva da madrugada.",
    },
  });
  const id = criar.json().id;
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: com(tokenCoordenador),
    payload: { severidade: "critica", vulnerabilidadePresente: false },
  });
  if (equipeId) {
    const d = await app.inject({
      method: "POST", url: `/ocorrencias/${id}/despacho`, headers: com(tokenCoordenador),
      payload: { equipeId, prazoHoras: 4 },
    });
    if (d.statusCode !== 200) throw new Error(`despacho falhou: ${d.body}`);
  }
  return id;
}

async function sincronizar(ocorrenciaId: string) {
  const coletadaEm = new Date().toISOString();
  return app.inject({
    method: "POST", url: "/sincronizacao/vistoria", headers: com(tokenAgente),
    payload: {
      idempotencyKey: crypto.randomUUID(),
      ocorrenciaId,
      coletadaEm,
      vistoria: {
        checklist: [
          { chave: "risco_iminente", resposta: true },
          { chave: "evacuacao_necessaria", resposta: true },
          { chave: "interdicao_indicada", resposta: true },
          { chave: "acionar_outro_orgao", resposta: false },
        ],
        fotos: [], gpsPrecisaoMetros: 6.2,
        assinanteNome: "Marilda Souza Prado", assinaturaChave: null,
        coletadaEm, observacoes: "Trinca ativa no talude.",
      },
    },
  });
}

async function detalhe(id: string): Promise<{
  status: string; trilha: Array<{ tipo: string }>;
}> {
  const r = await app.inject({
    method: "GET", url: `/ocorrencias/${id}`, headers: com(tokenCoordenador),
  });
  const corpo = r.json();
  return { status: corpo.ocorrencia.status, trilha: corpo.trilha };
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-equipe-da-vistoria-com-32-bytes-ok",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  tokenAgente = await entrar("diego.alves@serraalta.exemplo.gov.br");
  tokenCoordenador = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Coleta de agente de fora da equipe designada", () => {
  it("a tarefa nem aparece na lista do agente, e a coleta é aceita assim mesmo", async () => {
    const id = await ocorrencia("Rua da Equipe, 1", EQUIPE_BRAVO);

    const pendencias = await app.inject({
      method: "GET", url: "/sincronizacao/pendencias", headers: com(tokenAgente),
    });
    expect(
      pendencias.json().itens.some((i: { id: string }) => i.id === id),
      "a tarefa de outra equipe apareceu na lista do agente",
    ).toBe(false);

    const r = await sincronizar(id);
    // Aceita, e não recusada: o aplicativo trata 4xx como falha permanente, e
    // a coleta morreria na fila do aparelho.
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().foraDaEquipeDesignada).toBe(true);
  }, 60_000);

  it("a tarefa continua na fila da equipe designada, em vez de sumir", async () => {
    /*
      A metade mais cara do defeito. O aparelho apaga e reescreve a lista
      inteira a cada atualização, então `vistoria_concluida` fazia a ocorrência
      DESAPARECER da tela da equipe que de fato tinha ido ao local, sem lápide e
      sem aviso, por um envio que não foi dela.
    */
    const id = await ocorrencia("Rua da Equipe, 2", EQUIPE_BRAVO);
    await sincronizar(id);

    expect((await detalhe(id)).status).toBe("em_campo");
  }, 60_000);

  it("a divergência entra na trilha, com as duas equipes", async () => {
    const id = await ocorrencia("Rua da Equipe, 3", EQUIPE_BRAVO);
    await sincronizar(id);

    const eventos = (await detalhe(id)).trilha.filter(
      (e) => e.tipo === "vistoria_fora_da_equipe",
    );
    expect(eventos, "a coleta de fora da equipe não deixou rastro").toHaveLength(1);

    const linha = await mem.bruto.query<{
      equipe_designada_id: string; equipe_do_agente_id: string;
    }>(
      `SELECT equipe_designada_id, equipe_do_agente_id
         FROM vistorias WHERE ocorrencia_id = $1`,
      [id],
    );
    expect(linha.rows[0]!.equipe_designada_id).toBe(EQUIPE_BRAVO);
    expect(linha.rows[0]!.equipe_do_agente_id).toBe(EQUIPE_ALFA);
  }, 60_000);

  it("o termo de interdição imprime o aviso, antes de alguém assinar", async () => {
    /*
      Onde o defeito virava ato administrativo: a coordenadora emitia o termo
      com o nome do agente que não foi designado, e nada no papel dizia isso.
    */
    const id = await ocorrencia("Rua da Equipe, 4", EQUIPE_BRAVO);
    await sincronizar(id);

    const termo = await app.inject({
      method: "GET", url: `/documentos/${id}/termo-de-interdicao`,
      headers: com(tokenCoordenador),
    });
    expect(termo.statusCode).toBe(200);
    const corrido = termo.body.replace(/\s+/g, " ");
    expect(corrido).toContain("esta ocorrência estava designada à Equipe Bravo");
    expect(corrido).toContain("lotado na Equipe Alfa");
  }, 60_000);
});

describe("A coleta da equipe designada não muda de comportamento", () => {
  it("conclui a vistoria, sem aviso e sem evento de divergência", async () => {
    const id = await ocorrencia("Rua da Equipe, 5", EQUIPE_ALFA);
    const r = await sincronizar(id);

    expect(r.statusCode).toBe(201);
    expect(r.json().foraDaEquipeDesignada).toBe(false);

    const depois = await detalhe(id);
    expect(depois.status).toBe("vistoria_concluida");
    expect(depois.trilha.some((e) => e.tipo === "vistoria_fora_da_equipe")).toBe(false);

    const laudo = await app.inject({
      method: "GET", url: `/documentos/${id}/laudo`, headers: com(tokenCoordenador),
    });
    expect(laudo.body).not.toContain("estava designada à");
  }, 60_000);

  it("ocorrência sem despacho não produz aviso: não há designação a violar", async () => {
    /*
      Avisar aqui treinaria quem lê o documento a ignorar o aviso, justamente
      no dia em que ele importa.
    */
    const id = await ocorrencia("Rua da Equipe, 6", null);
    const r = await sincronizar(id);

    expect(r.statusCode).toBe(201);
    expect(r.json().foraDaEquipeDesignada).toBe(false);
    expect((await detalhe(id)).trilha.some(
      (e) => e.tipo === "vistoria_fora_da_equipe",
    )).toBe(false);
  }, 60_000);
});

describe("A coleta legítima de quem trocou de equipe não se perde", () => {
  it("o envio é aceito depois de a coordenação mudar o agente de equipe", async () => {
    /*
      É o caso que proíbe recusar. O agente coletou pela Equipe Alfa, a
      coordenação o passou para a Bravo antes de o sinal voltar, e a coleta que
      ele fez continua sendo verdadeira. Ela entra, marcada, e a coordenação
      decide o que fazer com a marca. Uma recusa aqui apagaria a vistoria de uma
      família por causa de uma troca de escala.
    */
    const id = await ocorrencia("Rua da Equipe, 7", EQUIPE_ALFA);

    await mem.bruto.query(
      "UPDATE usuarios SET equipe_id = $1 WHERE id = $2",
      [EQUIPE_BRAVO, AGENTE_DIEGO],
    );
    try {
      const r = await sincronizar(id);
      expect(r.statusCode, r.body).toBe(201);
      expect(r.json().foraDaEquipeDesignada).toBe(true);

      const linha = await mem.bruto.query<{ id: string }>(
        "SELECT id FROM vistorias WHERE ocorrencia_id = $1", [id],
      );
      expect(linha.rows, "a coleta legítima se perdeu").toHaveLength(1);
    } finally {
      await mem.bruto.query(
        "UPDATE usuarios SET equipe_id = $1 WHERE id = $2",
        [EQUIPE_ALFA, AGENTE_DIEGO],
      );
    }
  }, 60_000);
});
