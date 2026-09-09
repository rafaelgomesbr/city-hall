import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * O portão de autoria da coleta, do lado do servidor.
 *
 * O CENÁRIO, e ele é de plantão e não de laboratório: o aparelho é
 * compartilhado entre turnos. A agente Ana coleta a vistoria no morro, sem
 * sinal, lê a minuta em voz alta COM O NOME DELA e a moradora assina no dedo.
 * Ana sai da conta, e o diálogo promete (com razão) que as coletas continuam
 * guardadas no aparelho. Às 19:00 o agente Diego entra no mesmo aparelho, a
 * fila drena, e o envelope não dizia autor nenhum: o servidor tirava o
 * `agente_id` de quem apresentou o token. O laudo e a trilha passavam a
 * atribuir a vistoria a um servidor que nunca esteve no local, contra a minuta
 * lida em voz alta com outro nome, e a trilha é append-only: o autor errado
 * nunca é corrigido, só comentado.
 *
 * O aplicativo já se recusava a enviar coleta que não é de quem está logado
 * (`packages/campo/src/fila.ts`). Isso é portão de cliente, e portão de cliente
 * não é controle de acesso: um binário adulterado, ou um defeito futuro naquele
 * filtro, volta a produzir o mesmo laudo falso. O que este arquivo prova é que
 * o servidor passou a conferir sozinho.
 *
 * O QUE ELE NÃO PROVA, e está escrito para ninguém confundir: o campo é
 * OPCIONAL. Envelope sem `coletadaPor` continua entrando, porque existem
 * aparelhos com coleta gravada antes deste campo e não há tela para desbloquear
 * item recusado. A compatibilidade é deliberada, tem caso próprio aqui embaixo
 * e tem data de saída escrita em `packages/shared/src/schemas.ts`.
 */

const SENHA = "defesa-civil-2026";
const HASH_DA_SEMENTE =
  "scrypt$131072$8$1$56BVGGGziTxmINg0pEIjxw$F-aIq495xKVd9OKClsyKAFxxLHj26KkyKIWFMFAnBwk";

const SERRA_ALTA = "11111111-1111-4111-8111-000000000001";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";
const DIEGO = "11111111-1111-4111-8111-0000000000d3";
/** A agente do turno da manhã, que a semente não tem: o plantão tem dois. */
const ANA = "11111111-1111-4111-8111-0000000000d9";
/** O agente do município vizinho. Existe para nunca poder encostar aqui. */
const TARCISIO = "22222222-2222-4222-8222-0000000000d3";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenDiego: string;
let tokenCoordenadora: string;

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

/** Uma ocorrência despachada para a equipe do agente, pronta para vistoria. */
async function ocorrenciaEmCampo(endereco: string): Promise<string> {
  const criar = await app.inject({
    method: "POST", url: "/ocorrencias", headers: com(tokenCoordenadora),
    payload: {
      solicitanteNome: "Marilda Souza Prado", canalEntrada: "telefone",
      endereco, tipo: "deslizamento",
      descricao: "Talude atrás da casa cedeu depois da chuva da madrugada.",
    },
  });
  const id = criar.json().id;
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: com(tokenCoordenadora),
    payload: { severidade: "critica", vulnerabilidadePresente: false },
  });
  const d = await app.inject({
    method: "POST", url: `/ocorrencias/${id}/despacho`, headers: com(tokenCoordenadora),
    payload: { equipeId: EQUIPE_ALFA, prazoHoras: 4 },
  });
  if (d.statusCode !== 200) throw new Error(`despacho falhou: ${d.body}`);
  return id;
}

/** `coletadaPor` ausente é o envelope do aparelho de versão anterior. */
async function sincronizar(
  ocorrenciaId: string,
  opcoes: { coletadaPor?: string; chave?: string; token?: string } = {},
) {
  const coletadaEm = new Date().toISOString();
  return app.inject({
    method: "POST", url: "/sincronizacao/vistoria",
    headers: com(opcoes.token ?? tokenDiego),
    payload: {
      idempotencyKey: opcoes.chave ?? crypto.randomUUID(),
      ocorrenciaId,
      coletadaEm,
      ...(opcoes.coletadaPor ? { coletadaPor: opcoes.coletadaPor } : {}),
      vistoria: {
        checklist: [
          { chave: "risco_iminente", resposta: true },
          { chave: "evacuacao_necessaria", resposta: true },
          { chave: "interdicao_indicada", resposta: false },
          { chave: "acionar_outro_orgao", resposta: false },
        ],
        fotos: [], gpsPrecisaoMetros: 6.2,
        assinanteNome: "Marilda Souza Prado", assinaturaChave: null,
        coletadaEm, observacoes: "Trinca ativa no talude.",
      },
    },
  });
}

async function eventos(ocorrenciaId: string): Promise<Array<{
  tipo: string; autor_id: string; autor_nome: string;
  detalhe: { coletadaPorDeclarado?: string | null; idempotencyKey?: string } | null;
}>> {
  const r = await mem.bruto.query<{
    tipo: string; autor_id: string; autor_nome: string;
    detalhe: { coletadaPorDeclarado?: string | null; idempotencyKey?: string } | null;
  }>(
    "SELECT tipo, autor_id, autor_nome, detalhe FROM trilha_eventos WHERE ocorrencia_id = $1",
    [ocorrenciaId],
  );
  return r.rows;
}

async function vistorias(ocorrenciaId: string): Promise<Array<{ agente_id: string }>> {
  const r = await mem.bruto.query<{ agente_id: string }>(
    "SELECT agente_id FROM vistorias WHERE ocorrencia_id = $1", [ocorrenciaId],
  );
  return r.rows;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-da-autoria-da-coleta-com-mais-de-32-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  /*
    A agente da manhã entra na semente aqui, e não em `desenvolvimento.sql`,
    porque ela existe para este cenário: um segundo agente NA MESMA EQUIPE, para
    a divergência ser só de pessoa. Se ela estivesse em outra equipe, a recusa
    poderia ser confundida com o portão de equipe designada, que é outro
    assunto e tem outro arquivo.
  */
  await mem.bruto.query(
    `INSERT INTO usuarios (id, organizacao_id, nome, matricula, email, papel, equipe_id, senha_hash)
     VALUES ($1,$2,'Ana Ribeiro Gouveia','SA-3392','ana.gouveia@serraalta.exemplo.gov.br',
             'agente_campo',$3,$4)`,
    [ANA, SERRA_ALTA, EQUIPE_ALFA, HASH_DA_SEMENTE],
  );

  tokenDiego = await entrar("diego.alves@serraalta.exemplo.gov.br");
  tokenCoordenadora = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Coleta que declara um autor e sobe com a credencial de outro", () => {
  it("é recusada, e a vistoria não entra", async () => {
    /*
      O caso do aparelho de plantão, com o portão do cliente furado. Se esta
      resposta for 201, o laudo daquela família sai assinado por Diego, que
      estava em casa quando a moradora assinou.
    */
    const id = await ocorrenciaEmCampo("Rua da Autoria, 1");

    const r = await sincronizar(id, { coletadaPor: ANA });

    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().erro).toBe("autor_divergente");
    expect(r.json().mensagem).toContain("conta de quem fez a vistoria");
    expect(await vistorias(id), "a coleta de outro autor foi gravada").toHaveLength(0);
  }, 60_000);

  it("deixa a tentativa na trilha, com os dois nomes da divergência", async () => {
    /*
      A recusa sozinha não basta. Tentar gravar vistoria com autor que não é o
      do token é exatamente o evento que alguém vai querer auditar depois, e a
      trilha é o único lugar onde ele não se apaga. O evento precisa SOBREVIVER
      à recusa: ele é escrito em transação própria, porque a exceção derruba a
      transação da rota.
    */
    const id = await ocorrenciaEmCampo("Rua da Autoria, 2");
    const chave = crypto.randomUUID();

    await sincronizar(id, { coletadaPor: ANA, chave });

    const recusas = (await eventos(id)).filter(
      (e) => e.tipo === "vistoria_recusada_autor_divergente",
    );
    expect(recusas, "a tentativa recusada não deixou rastro").toHaveLength(1);
    // O autor do evento é quem apresentou o token, e o detalhe diz quem o
    // envelope afirmou ser. Guardar só um dos dois seria meia frase.
    expect(recusas[0]!.autor_id).toBe(DIEGO);
    expect(recusas[0]!.detalhe?.coletadaPorDeclarado).toBe(ANA);
    expect(recusas[0]!.detalhe?.idempotencyKey).toBe(chave);
  }, 60_000);

  it("continua recusada quando a coleta JÁ tinha sido gravada pelo autor certo", async () => {
    /*
      A idempotência não pode furar o portão. O reenvio de uma chave conhecida
      devolve 200 com o recibo, e devolver isso a quem não coletou seria
      confirmar a vistoria de outra pessoa para quem apresentou credencial
      alheia. Por isso a conferência vem ANTES da consulta pela chave.
    */
    const id = await ocorrenciaEmCampo("Rua da Autoria, 3");
    const chave = crypto.randomUUID();

    const primeira = await sincronizar(id, { coletadaPor: DIEGO, chave });
    expect(primeira.statusCode, primeira.body).toBe(201);

    const reenvio = await sincronizar(id, { coletadaPor: ANA, chave });
    expect(reenvio.statusCode, reenvio.body).toBe(409);
    expect(reenvio.json().vistoriaId).toBeUndefined();
  }, 60_000);

  it("não vira erro de servidor quando a ocorrência não é deste município", async () => {
    /*
      O registro da recusa precisa de uma ocorrência para pendurar o evento, e
      ocorrência de outro município simplesmente não existe daqui (RLS). Sem a
      conferência antes do INSERT, isso batia na chave estrangeira e a recusa
      virava 500 justamente no caminho de quem está forjando autoria. E o
      desfecho é o MESMO da ocorrência que existe: a comparação não lê o banco,
      então ela não conta a ninguém se o id existe, que é a mesma razão de esta
      API responder 404 e nunca 403.
    */
    const doVizinho = await mem.bruto.query<{ id: string }>(
      `SELECT id FROM ocorrencias WHERE organizacao_id <> $1 LIMIT 1`, [SERRA_ALTA],
    );
    const alheia = doVizinho.rows[0]!.id;

    const r = await sincronizar(alheia, { coletadaPor: TARCISIO });
    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().erro).toBe("autor_divergente");
    expect(
      (await eventos(alheia)).some((e) => e.tipo === "vistoria_recusada_autor_divergente"),
      "a recusa escreveu na trilha de um município que não é o do token",
    ).toBe(false);

    const inventada = await sincronizar(crypto.randomUUID(), { coletadaPor: ANA });
    expect(inventada.statusCode, inventada.body).toBe(409);
  }, 60_000);
});

describe("O que não pode mudar de comportamento", () => {
  it("coleta com o autor certo entra, e o laudo fica com ele", async () => {
    const id = await ocorrenciaEmCampo("Rua da Autoria, 4");

    const r = await sincronizar(id, { coletadaPor: DIEGO });

    expect(r.statusCode, r.body).toBe(201);
    expect((await vistorias(id))[0]!.agente_id).toBe(DIEGO);
    expect((await eventos(id)).some(
      (e) => e.tipo === "vistoria_recusada_autor_divergente",
    )).toBe(false);
  }, 60_000);

  it("coleta de aparelho de versão anterior, sem autor no envelope, continua entrando", async () => {
    /*
      A compatibilidade, e ela é o motivo de o campo ser opcional. Existe
      aparelho em campo com coleta gravada antes deste campo, com `autor: null`,
      e não existe tela para desbloquear item recusado: nascendo obrigatório, o
      Zod devolveria 422 para sempre e uma vistoria de morro seria destruída por
      uma mudança de esquema.
    */
    const id = await ocorrenciaEmCampo("Rua da Autoria, 5");

    const r = await sincronizar(id);

    expect(r.statusCode, r.body).toBe(201);
    expect((await vistorias(id))[0]!.agente_id).toBe(DIEGO);
  }, 60_000);
});
