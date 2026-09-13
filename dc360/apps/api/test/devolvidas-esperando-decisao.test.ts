import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * A lista de ocorrências que voltaram do campo sem vistoria.
 *
 * ## Por que ela existe
 *
 * Devolver tira a ocorrência de `em_campo` e a devolve para `triagem`. Do lado
 * do painel isso tem um efeito que apaga informação: ela passa a aparecer como
 * "Em triagem" no meio das que nunca saíram, e o fato de uma equipe ter ido,
 * não ter conseguido e ter perdido o prazo some da tela. Quem despacha precisa
 * ver a diferença, porque a decisão é outra: uma nunca foi tentada, a outra já
 * falhou uma vez e o motivo diz o que mudar.
 *
 * ## Por que ela NÃO devolve a observação do agente
 *
 * Esta é a decisão principal deste arquivo, e ela vem do T11.
 *
 * `observacao` é texto livre escrito na rua e pode nomear um morador ou
 * descrever a saúde de quem mora na casa. Uma rota de LISTA que a devolvesse
 * entregaria o texto de todas as devoluções do município de uma vez, para
 * qualquer pessoa com acesso ao painel, a cada carregamento de tela, e sem
 * registro de consulta. Seria a versão nova do resíduo que o T11 declarou
 * sobre `GET /ocorrencias`.
 *
 * O que a lista devolve é o MOTIVO, que é de lista fechada e não é dado
 * pessoal, mais o suficiente para marcar a linha. Quem precisa do texto abre a
 * ocorrência, e aquela rota registra a consulta, que é o comportamento que o
 * T11 desenhou.
 */
let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenCoord = "";
let tokenAgente = "";
let orgA = "";
let orgB = "";

/** A senha da semente de desenvolvimento, a mesma que o painel usa em modo local. */
const SENHA = "defesa-civil-2026";

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  return r.json().acesso as string;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-da-lista-de-devolvidas-com-mais-de-32-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
  });
  await app.ready();

  const orgs = await mem.bruto.query<{ id: string; municipio: string }>(
    "SELECT id, municipio FROM organizacoes ORDER BY municipio",
  );
  orgA = orgs.rows[0]!.id;
  orgB = orgs.rows[1]?.id ?? orgs.rows[0]!.id;

  const c = await mem.bruto.query<{ email: string }>(
    `SELECT email FROM usuarios WHERE organizacao_id = $1 AND papel IN ('coordenador','administrador') LIMIT 1`,
    [orgA],
  );
  tokenCoord = await entrar(c.rows[0]!.email);

  const a = await mem.bruto.query<{ email: string }>(
    `SELECT email FROM usuarios WHERE organizacao_id = $1 AND papel = 'agente_campo' LIMIT 1`,
    [orgA],
  );
  if (a.rows[0]) tokenAgente = await entrar(a.rows[0].email);
}, 240_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

/** Grava uma devolução direto no banco: o alvo aqui é a LEITURA. */
async function devolucaoNoBanco(
  org: string, opcoes: { motivo?: string; observacao?: string; protocolo?: string } = {},
): Promise<{ ocorrencia: string; protocolo: string }> {
  const protocolo = opcoes.protocolo ?? `9${Math.floor(Math.random() * 89999 + 10000)}/2026`;
  const oc = await mem.bruto.query<{ id: string }>(
    `INSERT INTO ocorrencias
       (organizacao_id, protocolo, tipo, status, severidade, endereco,
        solicitante_nome, canal_entrada, descricao, prazo_em)
     VALUES ($1,$2,'deslizamento','triagem','alta','Rua da Devolucao, 10',
             'Quem ligou', 'telefone','Trinca no talude.', now() - interval '5 hours')
     RETURNING id`,
    [org, protocolo],
  );
  const equipe = await mem.bruto.query<{ id: string }>(
    `INSERT INTO equipes (organizacao_id, nome) VALUES ($1,$2) RETURNING id`,
    [org, `Equipe ${protocolo}`],
  );
  const agente = await mem.bruto.query<{ id: string }>(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash, equipe_id)
     VALUES ($1,'Marta Vilela',$2,$3,'agente_campo','x',$4) RETURNING id`,
    [org, `D-${protocolo.slice(0, 5)}`, `marta-${protocolo.slice(0, 5)}@exemplo.gov.br`,
     equipe.rows[0]!.id],
  );
  await mem.bruto.query(
    `INSERT INTO devolucoes_de_tarefa
       (organizacao_id, ocorrencia_id, equipe_id, devolvida_por, motivo, observacao,
        prazo_em, decidida_em, idempotency_key)
     VALUES ($1,$2,$3,$4,$5,$6, now() - interval '5 hours', now(), gen_random_uuid())`,
    [org, oc.rows[0]!.id, equipe.rows[0]!.id, agente.rows[0]!.id,
     opcoes.motivo ?? "endereco_nao_localizado", opcoes.observacao ?? null],
  );
  return { ocorrencia: oc.rows[0]!.id, protocolo };
}

function com(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe("As ocorrências que voltaram do campo", () => {
  it("aparecem na lista, com quem devolveu e o motivo", async () => {
    const d = await devolucaoNoBanco(orgA, { motivo: "endereco_nao_localizado" });

    const r = await app.inject({
      method: "GET", url: "/ocorrencias/devolvidas", headers: com(tokenCoord),
    });
    expect(r.statusCode, r.body).toBe(200);

    const itens = r.json().itens as Array<Record<string, unknown>>;
    const nossa = itens.find((i) => i["protocolo"] === d.protocolo);
    expect(nossa, "a devolvida não apareceu na lista").toBeDefined();
    expect(nossa!["motivo"]).toBe("endereco_nao_localizado");
    expect(nossa!["devolvida_por_nome"]).toBe("Marta Vilela");
    expect(nossa!["devolvida_em"]).toBeTruthy();
    // O prazo não foi tocado pela devolução, e a tela conta com isso.
    expect(nossa!["prazo_em"]).toBeTruthy();
  }, 120_000);

  it("NÃO devolve a observação em texto livre, que pode nomear um morador", async () => {
    const d = await devolucaoNoBanco(orgA, {
      motivo: "outro",
      observacao: "Moradora Dona Marta, tratamento em casa, pediu para voltar às 18h.",
    });

    const r = await app.inject({
      method: "GET", url: "/ocorrencias/devolvidas", headers: com(tokenCoord),
    });
    expect(r.statusCode).toBe(200);
    expect(r.body).not.toContain("Dona Marta");

    const nossa = (r.json().itens as Array<Record<string, unknown>>)
      .find((i) => i["protocolo"] === d.protocolo);
    expect(nossa).toBeDefined();
    expect(nossa!["observacao"]).toBeUndefined();
    // O motivo fica: ele é de lista fechada e é o que marca a linha.
    expect(nossa!["motivo"]).toBe("outro");
    // E o sinal de que há texto a ler continua, senão ninguém abre a ocorrência.
    expect(nossa!["tem_observacao"]).toBe(true);
  }, 120_000);

  it("não atravessa a fronteira do município", async () => {
    const daOutra = await devolucaoNoBanco(orgB, { motivo: "morador_ausente" });

    const r = await app.inject({
      method: "GET", url: "/ocorrencias/devolvidas", headers: com(tokenCoord),
    });
    const protocolos = (r.json().itens as Array<Record<string, unknown>>)
      .map((i) => i["protocolo"]);
    expect(protocolos).not.toContain(daOutra.protocolo);
  }, 120_000);

  it("some da lista quando a coordenação despacha de novo", async () => {
    /*
      Aviso que fica depois de resolvido ensina a ignorar aviso. O critério é a
      ocorrência ter voltado para campo, e não alguém marcar como lida.
    */
    const d = await devolucaoNoBanco(orgA, { motivo: "morador_ausente" });
    await mem.bruto.query(
      "UPDATE ocorrencias SET status = 'em_campo' WHERE id = $1", [d.ocorrencia],
    );

    const r = await app.inject({
      method: "GET", url: "/ocorrencias/devolvidas", headers: com(tokenCoord),
    });
    const protocolos = (r.json().itens as Array<Record<string, unknown>>)
      .map((i) => i["protocolo"]);
    expect(protocolos).not.toContain(d.protocolo);
  }, 120_000);

  it("exige sessão, como toda rota desta API", async () => {
    const r = await app.inject({ method: "GET", url: "/ocorrencias/devolvidas" });
    expect(r.statusCode).toBe(401);
  }, 120_000);

  it("o agente de campo não precisa dela, e ela não é dele", async () => {
    /*
      Quem decide o que fazer com uma devolvida é quem despacha. Abrir a lista
      inteira do município para o agente seria dar a ele a visão que ele não
      tem em lugar nenhum do produto, e por uma porta lateral.
    */
    if (!tokenAgente) return;
    const r = await app.inject({
      method: "GET", url: "/ocorrencias/devolvidas", headers: com(tokenAgente),
    });
    expect([403, 404]).toContain(r.statusCode);
  }, 120_000);
});
