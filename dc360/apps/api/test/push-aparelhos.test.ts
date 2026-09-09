import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { derivarSenha } from "../src/auth/senha.js";

/**
 * As rotas de aparelho, que são a metade servidor do registro de push.
 *
 * O que elas guardam é a FICHA de push. Ela não dá acesso ao sistema, e mesmo
 * assim é material perigoso: quem tem a ficha escreve na tela bloqueada de um
 * agente de Defesa Civil, e uma ordem falsa de evacuação escrita ali tira
 * gente de casa de madrugada.
 *
 * Por isso quase todo caso aqui é uma tentativa de alcançar aparelho alheio:
 * o do colega da mesma prefeitura, e o da prefeitura vizinha.
 */

const SENHA = "senha-de-teste-bem-comprida";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let appDesligado: FastifyInstance;

let orgA: string;
let orgB: string;
let agenteA: string;
let colegaA: string;

const tokens: Record<string, { acesso: string; renovacao: string }> = {};

function configDeTeste(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
    LOGIN_POR_IP: "10000",
    PUSH_ATIVO: "sim",
    // Identificadores de mentira: nenhum envio de verdade acontece nesta
    // suíte, e a configuração exige os quatro para o push subir ligado.
    APNS_KEY_ID: "TESTE12345",
    APNS_TEAM_ID: "TIME123456",
    APNS_CHAVE: "/caminho/que/nao/e/lido/nesta/suite.p8",
    APNS_BUNDLE: "br.gov.exemplo.dc360",
    ...extra,
  } as NodeJS.ProcessEnv;
}

async function entrar(instancia: FastifyInstance, email: string): Promise<void> {
  const r = await instancia.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  expect(r.statusCode, `login de ${email} falhou: ${r.body}`).toBe(200);
  const corpo = r.json();
  tokens[email] = { acesso: corpo.acesso, renovacao: corpo.renovacao };
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
  orgA = a.rows[0]!.id;
  orgB = b.rows[0]!.id;

  const ea = await db.query<{ id: string }>(
    "INSERT INTO equipes (organizacao_id,nome) VALUES ($1,'Equipe Alfa') RETURNING id", [orgA],
  );
  const eb = await db.query<{ id: string }>(
    "INSERT INTO equipes (organizacao_id,nome) VALUES ($1,'Equipe Unica') RETURNING id", [orgB],
  );

  const hash = await derivarSenha(SENHA);
  const pessoas: Array<[string, string, string, string, string, string]> = [
    [orgA, "Diego Alves", "SA-3", "diego@serraalta.exemplo.gov.br", "agente_campo", ea.rows[0]!.id],
    [orgA, "Marta Nunes", "SA-9", "marta@serraalta.exemplo.gov.br", "agente_campo", ea.rows[0]!.id],
    [orgB, "Tarcisio Ramos", "VF-3", "tarcisio@valefundo.exemplo.gov.br", "agente_campo", eb.rows[0]!.id],
  ];
  for (const [org, nome, matricula, email, papel, equipe] of pessoas) {
    const r = await db.query<{ id: string }>(
      `INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,equipe_id,senha_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [org, nome, matricula, email, papel, equipe, hash],
    );
    if (matricula === "SA-3") agenteA = r.rows[0]!.id;
    if (matricula === "SA-9") colegaA = r.rows[0]!.id;
  }

  app = await construirServidor({
    banco: mem.banco,
    config: carregarConfig(configDeTeste()),
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
  });
  await app.ready();

  await entrar(app, "diego@serraalta.exemplo.gov.br");
  await entrar(app, "marta@serraalta.exemplo.gov.br");
  await entrar(app, "tarcisio@valefundo.exemplo.gov.br");
}, 120_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
  await appDesligado?.close();
});

function comToken(email: string) {
  return { authorization: `Bearer ${tokens[email]!.acesso}` };
}

async function registrar(email: string, corpo: Record<string, unknown>) {
  return app.inject({
    method: "POST", url: "/aparelhos", headers: comToken(email), payload: corpo,
  });
}

/** Lê como dono das tabelas, para não depender da camada que está em teste. */
async function aparelhoPorFicha(ficha: string) {
  const r = await mem.bruto.query<{
    id: string; organizacao_id: string; usuario_id: string;
    revogado_em: string | null; motivo_revogacao: string | null;
  }>("SELECT * FROM aparelhos WHERE ficha = $1", [ficha]);
  return r.rows;
}

describe("Registro de aparelho", () => {
  it("registra com o usuário e o município que vêm do token, e nada mais", async () => {
    const r = await registrar("diego@serraalta.exemplo.gov.br", {
      plataforma: "ios", ficha: "ficha-do-diego-1",
    });
    expect(r.statusCode).toBe(200);

    const linhas = await aparelhoPorFicha("ficha-do-diego-1");
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.organizacao_id).toBe(orgA);
    expect(linhas[0]!.usuario_id).toBe(agenteA);
  });

  it("a ficha NÃO volta na resposta", async () => {
    // Quem tem a ficha escreve na tela bloqueada do agente. Ela entra e não
    // sai: nem em resposta, nem em listagem.
    const r = await registrar("diego@serraalta.exemplo.gov.br", {
      plataforma: "ios", ficha: "ficha-que-nao-pode-voltar",
    });
    expect(r.body).not.toContain("ficha-que-nao-pode-voltar");
  });

  it("registrar a mesma ficha de novo ATUALIZA, e não duplica", async () => {
    /*
      O aplicativo reenvia a ficha a cada abertura, porque é assim que ele
      descobre que ela mudou. Sem isso, cada abertura viraria uma linha, e o
      agente receberia a mesma notificação uma vez por abertura de aplicativo
      que ele já fez na vida.
    */
    const primeira = await registrar("diego@serraalta.exemplo.gov.br", {
      plataforma: "ios", ficha: "ficha-repetida",
    });
    const segunda = await registrar("diego@serraalta.exemplo.gov.br", {
      plataforma: "ios", ficha: "ficha-repetida",
    });

    expect(segunda.json().id).toBe(primeira.json().id);
    expect(await aparelhoPorFicha("ficha-repetida")).toHaveLength(1);
  });

  it("telefone que passa de mão dentro da prefeitura troca de dono", async () => {
    /*
      Telefone de plantão passa de agente para agente. Se a linha continuasse
      no nome do anterior, o aparelho seguiria recebendo tarefa da equipe DELE,
      que é vazamento de dado operacional para quem não está mais naquela
      equipe.
    */
    await registrar("diego@serraalta.exemplo.gov.br", {
      plataforma: "ios", ficha: "telefone-de-plantao",
    });
    await registrar("marta@serraalta.exemplo.gov.br", {
      plataforma: "ios", ficha: "telefone-de-plantao",
    });

    const linhas = await aparelhoPorFicha("telefone-de-plantao");
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.usuario_id).toBe(colegaA);
  });

  it("a mesma ficha em dois municípios não denuncia a existência da outra", async () => {
    /*
      A decisão está no topo da migração 016: a unicidade é por município, e
      não global. Global faria o segundo registro falhar com uma mensagem que
      diz que aquela ficha já existe em outro lugar, que é o mesmo vazamento
      que a resposta 404 no lugar de 403 existe para impedir.
    */
    const emA = await registrar("diego@serraalta.exemplo.gov.br", {
      plataforma: "ios", ficha: "mesmo-aparelho-fisico",
    });
    const emB = await registrar("tarcisio@valefundo.exemplo.gov.br", {
      plataforma: "ios", ficha: "mesmo-aparelho-fisico",
    });

    expect(emA.statusCode).toBe(200);
    expect(emB.statusCode, `o segundo municipio levou erro: ${emB.body}`).toBe(200);
    expect(emB.json().id).not.toBe(emA.json().id);

    const linhas = await aparelhoPorFicha("mesmo-aparelho-fisico");
    expect(linhas.map((l) => l.organizacao_id).sort()).toEqual([orgA, orgB].sort());
  });

  it("sem token não registra nada", async () => {
    const r = await app.inject({
      method: "POST", url: "/aparelhos", payload: { plataforma: "ios", ficha: "sem-token" },
    });
    expect(r.statusCode).toBe(401);
    expect(await aparelhoPorFicha("sem-token")).toHaveLength(0);
  });

  it("plataforma fora de ios e android é recusada", async () => {
    const r = await registrar("diego@serraalta.exemplo.gov.br", {
      plataforma: "web", ficha: "ficha-de-plataforma-errada",
    });
    expect(r.statusCode).toBe(422);
  });

  it("Android é recusado enquanto não houver conta de serviço do Firebase", async () => {
    /*
      Aceitar seria guardar um aparelho que nunca receberia nada: o varredor
      gastaria as cinco tentativas em cada aviso e o agente ficaria sem saber
      por que não chega notificação. Recusar dizendo isso é a resposta honesta.
    */
    const r = await registrar("diego@serraalta.exemplo.gov.br", {
      plataforma: "android", ficha: "ficha-android",
    });
    expect(r.statusCode).toBe(503);
    expect(r.json().erro).toBe("push_android_desligado");
    expect(await aparelhoPorFicha("ficha-android")).toHaveLength(0);
  });
});

describe("Revogação de aparelho", () => {
  it("revoga o próprio aparelho", async () => {
    await registrar("diego@serraalta.exemplo.gov.br", {
      plataforma: "ios", ficha: "ficha-para-revogar",
    });
    const r = await app.inject({
      method: "POST", url: "/aparelhos/revogar",
      headers: comToken("diego@serraalta.exemplo.gov.br"),
      payload: { ficha: "ficha-para-revogar" },
    });
    expect(r.statusCode).toBe(204);

    const linhas = await aparelhoPorFicha("ficha-para-revogar");
    expect(linhas[0]!.revogado_em).not.toBeNull();
    expect(linhas[0]!.motivo_revogacao).toBeTruthy();
  });

  it("não revoga o aparelho do colega da mesma prefeitura", async () => {
    // Sem o filtro por usuário, um agente deixaria o colega sem aviso de prazo
    // na noite de temporal, e ninguém saberia por quê.
    await registrar("marta@serraalta.exemplo.gov.br", {
      plataforma: "ios", ficha: "ficha-da-marta",
    });
    const r = await app.inject({
      method: "POST", url: "/aparelhos/revogar",
      headers: comToken("diego@serraalta.exemplo.gov.br"),
      payload: { ficha: "ficha-da-marta" },
    });
    // 204 mesmo assim: dizer "essa ficha não é sua" transformaria a rota num
    // verificador de fichas alheias.
    expect(r.statusCode).toBe(204);
    expect((await aparelhoPorFicha("ficha-da-marta"))[0]!.revogado_em).toBeNull();
  });

  it("não revoga o aparelho da prefeitura vizinha", async () => {
    await registrar("tarcisio@valefundo.exemplo.gov.br", {
      plataforma: "ios", ficha: "ficha-do-vizinho",
    });
    const r = await app.inject({
      method: "POST", url: "/aparelhos/revogar",
      headers: comToken("diego@serraalta.exemplo.gov.br"),
      payload: { ficha: "ficha-do-vizinho" },
    });
    expect(r.statusCode).toBe(204);
    expect((await aparelhoPorFicha("ficha-do-vizinho"))[0]!.revogado_em).toBeNull();
  });

  it("revogar ficha que não existe responde igual, sem virar oráculo", async () => {
    const r = await app.inject({
      method: "POST", url: "/aparelhos/revogar",
      headers: comToken("diego@serraalta.exemplo.gov.br"),
      payload: { ficha: "ficha-que-nunca-existiu" },
    });
    expect(r.statusCode).toBe(204);
  });

  it("registrar de novo depois de revogar traz o aparelho de volta", async () => {
    // Quem sai e entra de novo no aplicativo está pedindo para voltar a
    // receber. Sem isto, sair uma vez calaria o aparelho para sempre.
    await registrar("diego@serraalta.exemplo.gov.br", {
      plataforma: "ios", ficha: "ficha-que-volta-do-exilio",
    });
    await app.inject({
      method: "POST", url: "/aparelhos/revogar",
      headers: comToken("diego@serraalta.exemplo.gov.br"),
      payload: { ficha: "ficha-que-volta-do-exilio" },
    });
    await registrar("diego@serraalta.exemplo.gov.br", {
      plataforma: "ios", ficha: "ficha-que-volta-do-exilio",
    });

    const linhas = await aparelhoPorFicha("ficha-que-volta-do-exilio");
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.revogado_em).toBeNull();
  });
});

describe("Sair do aplicativo cala o aparelho", () => {
  it("a saída revoga o aparelho daquela sessão", async () => {
    /*
      ISTO ERA VAZAMENTO DE DADO OPERACIONAL, e não inconveniência: sem a
      revogação, o telefone de quem saiu continuava recebendo "prazo vencendo"
      das ocorrências da equipe, com município, ocorrência e endereço no dado
      da notificação. Quem devolveu o telefone da prefeitura seguia sendo
      avisado do trabalho de um grupo do qual não faz mais parte.
    */
    await entrar(app, "marta@serraalta.exemplo.gov.br");
    await registrar("marta@serraalta.exemplo.gov.br", {
      plataforma: "ios", ficha: "ficha-da-saida",
    });

    const r = await app.inject({
      method: "POST", url: "/auth/sair",
      payload: { renovacao: tokens["marta@serraalta.exemplo.gov.br"]!.renovacao, ficha: "ficha-da-saida" },
    });
    expect(r.statusCode).toBe(204);

    const linhas = await aparelhoPorFicha("ficha-da-saida");
    expect(
      linhas[0]!.revogado_em,
      "o aparelho de quem saiu continua recebendo tarefa da equipe",
    ).not.toBeNull();
    expect(linhas[0]!.motivo_revogacao).toBe("saida do usuario");
  });

  it("sair de um aparelho não cala o outro da mesma pessoa", async () => {
    // Quem tem dois (o telefone da prefeitura e o próprio) sai de um e
    // continua recebendo no outro.
    await entrar(app, "diego@serraalta.exemplo.gov.br");
    await registrar("diego@serraalta.exemplo.gov.br", { plataforma: "ios", ficha: "aparelho-um" });
    await registrar("diego@serraalta.exemplo.gov.br", { plataforma: "ios", ficha: "aparelho-dois" });

    await app.inject({
      method: "POST", url: "/auth/sair",
      payload: { renovacao: tokens["diego@serraalta.exemplo.gov.br"]!.renovacao, ficha: "aparelho-um" },
    });

    expect((await aparelhoPorFicha("aparelho-um"))[0]!.revogado_em).not.toBeNull();
    expect((await aparelhoPorFicha("aparelho-dois"))[0]!.revogado_em).toBeNull();
  });

  it("sair sem mandar ficha continua funcionando, para o painel e para versão antiga", async () => {
    await entrar(app, "tarcisio@valefundo.exemplo.gov.br");
    const r = await app.inject({
      method: "POST", url: "/auth/sair",
      payload: { renovacao: tokens["tarcisio@valefundo.exemplo.gov.br"]!.renovacao },
    });
    expect(r.statusCode).toBe(204);
  });

  it("a saída não alcança aparelho de outra pessoa, mesmo mandando a ficha dela", async () => {
    await entrar(app, "diego@serraalta.exemplo.gov.br");
    await entrar(app, "marta@serraalta.exemplo.gov.br");
    await registrar("marta@serraalta.exemplo.gov.br", {
      plataforma: "ios", ficha: "ficha-alheia-na-saida",
    });

    await app.inject({
      method: "POST", url: "/auth/sair",
      payload: {
        renovacao: tokens["diego@serraalta.exemplo.gov.br"]!.renovacao,
        ficha: "ficha-alheia-na-saida",
      },
    });

    expect((await aparelhoPorFicha("ficha-alheia-na-saida"))[0]!.revogado_em).toBeNull();
  });
});

describe("Com PUSH_ATIVO=nao, as rotas recusam em vez de guardar", () => {
  /*
    Mesma decisão, e mesma forma, da recuperação de senha desligada. O defeito
    que isso evita é o da rota que aceita: o aplicativo guardaria a ficha, o
    servidor guardaria a ficha, ninguém receberia notificação nenhuma, e não
    haveria nada em tela que dissesse isso. Foi exatamente o que aconteceu com
    a recuperação de senha, que respondia "enviamos um link" sem enviar nada,
    em produção, por semanas.
  */
  beforeAll(async () => {
    /*
      O mesmo banco e o mesmo segredo do servidor de cima, de propósito: assim
      o token já emitido continua valendo, e o que muda entre os dois é
      exatamente uma variável, que é o que está sendo testado.
    */
    appDesligado = await construirServidor({
      banco: mem.banco,
      config: carregarConfig(configDeTeste({ PUSH_ATIVO: "nao" })),
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
    });
    await appDesligado.ready();
  }, 120_000);

  it("registrar responde 503 explicando, e a rota existe (não é 404)", async () => {
    await entrar(app, "diego@serraalta.exemplo.gov.br");
    const r = await appDesligado.inject({
      method: "POST", url: "/aparelhos",
      headers: comToken("diego@serraalta.exemplo.gov.br"),
      payload: { plataforma: "ios", ficha: "ficha-com-push-desligado" },
    });
    expect(r.statusCode).toBe(503);
    expect(r.json().erro).toBe("push_desligado");
    // A mensagem não pode assustar: o aplicativo continua funcionando.
    expect(r.json().mensagem).toMatch(/continua funcionando/i);
    // E nada foi guardado.
    expect(await aparelhoPorFicha("ficha-com-push-desligado")).toHaveLength(0);
  });

  it("revogar responde 503 do mesmo jeito", async () => {
    await entrar(app, "diego@serraalta.exemplo.gov.br");
    const r = await appDesligado.inject({
      method: "POST", url: "/aparelhos/revogar",
      headers: comToken("diego@serraalta.exemplo.gov.br"),
      payload: { ficha: "x" },
    });
    expect(r.statusCode).toBe(503);
    expect(r.json().erro).toBe("push_desligado");
  });

  it("sem token, nem o desligamento é revelado: 401 antes de qualquer coisa", async () => {
    /*
      Responder 503 a quem não tem token transformaria a rota num jeito de
      descobrir, de fora, qual município ligou o push e qual não ligou. Além
      disso, este é o portão de `superficie.test.ts`, que exige 401 de toda
      rota não declarada como pública.
    */
    const r = await appDesligado.inject({
      method: "POST", url: "/aparelhos", payload: { plataforma: "ios", ficha: "x" },
    });
    expect(r.statusCode).toBe(401);
  });

  it("com o push ligado sem credencial, o processo NÃO sobe", () => {
    /*
      A mesma classe de erro da recuperação ligada sem destino: o servidor
      sobe, o aplicativo registra, o varredor roda e nada chega a lugar nenhum.
      A única evidência de sucesso seria um telefone no bolso de outra pessoa.
    */
    expect(() =>
      carregarConfig({
        NODE_ENV: "test",
        JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
        PUSH_ATIVO: "sim",
      } as NodeJS.ProcessEnv),
    ).toThrow(/APNS_KEY_ID/);
  });
});
