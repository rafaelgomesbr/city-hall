import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { derivarSenha } from "../src/auth/senha.js";
import { notificadorHttp, semOsEnderecos, URL_DO_RESEND } from "../src/auth/notificador.js";

/**
 * O cliente HTTP de email, e o contrato REAL do provedor.
 *
 * ESTE ARQUIVO TRANCA DOIS DEFEITOS, e o segundo é pior que o primeiro.
 *
 * O primeiro: `NOTIFICADOR_URL` e `NOTIFICADOR_CHAVE` existiam na configuração
 * desde a recuperação de senha, a partida em produção RECUSAVA subir sem elas
 * com a recuperação ligada, e NENHUMA linha do servidor jamais falava com esse
 * provedor. Não havia cliente. Toda mensagem caía no `notificadorDeLog`, a
 * rota respondia 202 "enviamos um link", e o link de uso único ia para o log
 * do servidor, por fora do `redact`.
 *
 * O segundo: quando o cliente finalmente apareceu, ele montava um corpo com os
 * campos `de`, `para`, `nome`, `assunto` e `texto`. NENHUM PROVEDOR DE EMAIL DO
 * MUNDO ACEITA ESSE FORMATO: os nomes foram inventados, nunca passaram por
 * documentação nenhuma, e o resultado garantido em produção seria toda
 * mensagem recusada na validação do provedor. O cliente que existia para o
 * email sair teria impedido o email de sair, e o sintoma (recuperação de senha
 * quebrada, ofício não chegando) só apareceria depois de ligado.
 *
 * Por isso os casos abaixo conferem o corpo CAMPO A CAMPO contra o contrato
 * publicado do Resend, e não contra "o que parece razoável":
 * https://resend.com/docs/api-reference/emails/send-email
 *
 *   POST https://api.resend.com/emails
 *   Authorization: Bearer re_...      Content-Type: application/json
 *   User-Agent: obrigatório (sem ele o provedor responde 403)
 *   { "from": "...", "to": ["..."], "subject": "...", "text": "..." }
 *   200 -> { "id": "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }
 *
 * Erros, do catálogo público (https://resend.com/docs/api-reference/errors):
 * 401 `missing_api_key`, 403 `validation_error` (domínio não verificado, que é
 * o erro da estreia), 422 `missing_required_field`, 429 `rate_limit_exceeded`.
 */

const SENHA = "senha-de-teste-bem-comprida";

const REMETENTE = "Defesa Civil de Serra Alta <defesacivil@serraalta.exemplo.gov.br>";

type Chamada = { url: string; opcoes: RequestInit };

/** `fetch` de mentira, com o que o teste precisa afirmar depois. */
function buscadorFalso(resposta: (n: number) => Response | Promise<Response>) {
  const chamadas: Chamada[] = [];
  const buscar = (async (url: unknown, opcoes: unknown) => {
    chamadas.push({ url: String(url), opcoes: opcoes as RequestInit });
    return resposta(chamadas.length);
  }) as unknown as typeof fetch;
  return { buscar, chamadas };
}

/** Resposta de sucesso do provedor, no formato documentado dele. */
const ID_DO_PROVEDOR = "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794";
function aceito(): Response {
  return new Response(JSON.stringify({ id: ID_DO_PROVEDOR }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Erro do provedor, no formato JSON que ele usa. */
function recusado(status: number, name: string, message: string, cabecalhos: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ statusCode: status, name, message }), {
    status,
    headers: { "content-type": "application/json", ...cabecalhos },
  });
}

function cabecalhosDe(chamada: Chamada): Record<string, string> {
  return chamada.opcoes.headers as Record<string, string>;
}

const MENSAGEM = {
  para: "destino@orgao.exemplo.gov.br",
  nome: "Corpo de Bombeiros",
  assunto: "Ofício 000001/2026",
  corpo: "Use este endereco: https://api.exemplo.br/publico/oficio/abc123",
};

function clienteCom(buscar: typeof fetch, extra: Record<string, unknown> = {}) {
  return notificadorHttp({
    url: URL_DO_RESEND,
    chave: "re_chave_secreta_do_provedor",
    remetente: REMETENTE,
    buscar,
    // Sem isto o caso do 429 dormiria de verdade e a suíte ficaria segundos
    // mais lenta a troco de nada.
    esperar: async () => {},
    sortearChave: () => "chave-de-idempotencia-fixa-do-teste",
    ...extra,
  });
}

describe("O cliente fala o contrato REAL do provedor (Resend)", () => {
  it("o corpo do pedido bate CAMPO A CAMPO com o contrato publicado", async () => {
    /*
      O caso que reprova a versão anterior deste cliente, e o motivo dele
      existir. Antes, o corpo saía como
      `{ de, para, nome, assunto, texto }`, que são cinco nomes inventados. O
      provedor devolveria 422 para toda mensagem, e a única forma de descobrir
      isso seria ligar o recurso em produção e esperar alguém reclamar.
    */
    const { buscar, chamadas } = buscadorFalso(() => aceito());

    await clienteCom(buscar).enviar(MENSAGEM);

    expect(chamadas).toHaveLength(1);
    const chamada = chamadas[0]!;

    expect(chamada.url).toBe("https://api.resend.com/emails");
    expect(chamada.opcoes.method).toBe("POST");

    const cabecalhos = cabecalhosDe(chamada);
    expect(cabecalhos["authorization"]).toBe("Bearer re_chave_secreta_do_provedor");
    expect(cabecalhos["content-type"]).toBe("application/json");
    // O provedor RECUSA com 403 quem não se identificar, e esse 403 é
    // indistinguível de "chave inválida" para quem lê o log.
    expect(
      cabecalhos["user-agent"],
      "o provedor exige User-Agent e responde 403 sem ele",
    ).toBeTruthy();

    const corpo = JSON.parse(String(chamada.opcoes.body)) as Record<string, unknown>;

    expect(corpo["from"]).toBe(REMETENTE);
    expect(corpo["to"], "`to` é lista de endereços no contrato do provedor")
      .toEqual(["destino@orgao.exemplo.gov.br"]);
    expect(corpo["subject"]).toBe("Ofício 000001/2026");
    expect(corpo["text"]).toContain("/publico/oficio/abc123");

    /*
      E os nomes inventados NÃO podem estar ali. Esta metade é a que importa:
      um cliente que mandasse os campos certos E os errados juntos passaria no
      bloco de cima e continuaria sendo recusado pelo provedor, porque campo
      desconhecido é erro de validação e não algo que ele ignore.
    */
    for (const inventado of ["de", "para", "nome", "assunto", "texto"]) {
      expect(
        Object.keys(corpo),
        `o corpo ainda carrega o campo inventado \`${inventado}\`, que provedor `
        + "nenhum aceita",
      ).not.toContain(inventado);
    }

    // Sem tempo limite, um provedor que aceita a conexão e não responde
    // pendura a requisição do coordenador até o limite do servidor.
    expect(chamada.opcoes.signal).toBeTruthy();
  });

  it("o sucesso devolve o identificador que o provedor deu", async () => {
    /*
      Sem isto, "o provedor aceitou" é a afirmação de quem tem interesse no
      assunto, e mais nada. O identificador é o que permite, meses depois,
      levar a pergunta ao painel do provedor em vez de ficar na palavra contra
      palavra com o órgão que diz não ter recebido.
    */
    const { buscar } = buscadorFalso(() => aceito());

    const recibo = await clienteCom(buscar).enviar(MENSAGEM);

    expect(recibo.idNoProvedor).toBe(ID_DO_PROVEDOR);
  });

  it("sucesso com corpo fora do formato NÃO vira falha: fica sem recibo", async () => {
    /*
      A mensagem já foi aceita quando isto acontece. Transformar um 200 de
      formato inesperado em exceção faria a rota gravar `falha` para um ofício
      que de fato saiu, e o reenvio mandaria o mesmo documento duas vezes para
      o órgão. Recibo faltando atrapalha uma investigação futura; ofício
      duplicado numa interdição é problema jurídico.
    */
    const { buscar } = buscadorFalso(() => new Response("ok", { status: 200 }));

    const recibo = await clienteCom(buscar).enviar(MENSAGEM);

    expect(recibo.idNoProvedor).toBeNull();
  });

  it("401 (chave errada) sobe como exceção e diz onde mexer", async () => {
    const { buscar } = buscadorFalso(() => recusado(
      401, "missing_api_key", "Missing API key in the authorization header.",
    ));

    const erro = await clienteCom(buscar).enviar(MENSAGEM).catch((e: Error) => e);

    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toContain("401");
    expect((erro as Error).message).toContain("missing_api_key");
    expect(
      (erro as Error).message,
      "quem lê o log às duas da manhã precisa saber qual variável conferir",
    ).toContain("NOTIFICADOR_CHAVE");
  });

  it("403 de domínio não verificado, que é o erro da estreia, é acionável", async () => {
    /*
      É o erro mais comum no primeiro dia, e no catálogo do provedor ele é um
      403 `validation_error`. A mensagem dele já diz o que fazer; o que o
      cliente acrescenta é o nome da variável deste produto, porque quem lê o
      log não sabe que `from` aqui se chama EMAIL_REMETENTE.
    */
    const { buscar } = buscadorFalso(() => recusado(
      403, "validation_error",
      "The serraalta.exemplo.gov.br domain is not verified. Please, add and verify your domain.",
    ));

    const erro = await clienteCom(buscar).enviar(MENSAGEM).catch((e: Error) => e);

    expect((erro as Error).message).toContain("403");
    expect((erro as Error).message).toContain("not verified");
    expect((erro as Error).message).toContain("EMAIL_REMETENTE");
  });

  it("422 de campo obrigatório faltando também sobe, e não vira silêncio", async () => {
    const { buscar } = buscadorFalso(() => recusado(
      422, "missing_required_field", "The request body is missing one or more required fields.",
    ));

    const erro = await clienteCom(buscar).enviar(MENSAGEM).catch((e: Error) => e);

    expect((erro as Error).message).toContain("422");
    expect((erro as Error).message).toContain("missing_required_field");
  });

  it("429 é tentado de novo, com a MESMA chave de idempotência", async () => {
    /*
      O 429 é o erro do dia de temporal: o coordenador encaminha o mesmo evento
      para seis órgãos e a fila de avisos drena junto, e o limite do provedor é
      por segundo. Ele é o único 4xx que este cliente repete, porque é o único
      que não diz nada sobre a mensagem: ela não tem defeito, chegou rápido
      demais.

      A chave de idempotência precisa ser a MESMA nas repetições. Sem ela, um
      429 que na verdade tinha passado faria o ofício sair duas vezes para o
      órgão, e ofício duplicado numa interdição é problema jurídico.

      E repetir AQUI dentro, e não devolver o 429 para fora, tem uma razão de
      negócio: a rota grava a tentativa no banco ANTES de chamar o provedor, e
      o município só tem três. Um 429 devolvido queimaria uma dessas três sem
      nenhuma mensagem ter saído.
    */
    const esperas: number[] = [];
    const { buscar, chamadas } = buscadorFalso((n) => (
      n === 1
        ? recusado(429, "rate_limit_exceeded", "Too many requests.", { "retry-after": "1" })
        : aceito()
    ));

    const recibo = await clienteCom(buscar, {
      esperar: async (ms: number) => { esperas.push(ms); },
    }).enviar(MENSAGEM);

    expect(recibo.idNoProvedor).toBe(ID_DO_PROVEDOR);
    expect(chamadas).toHaveLength(2);
    expect(esperas, "o cliente ignorou o retry-after do provedor").toEqual([1000]);

    const chaves = chamadas.map((c) => cabecalhosDe(c)["idempotency-key"]);
    expect(chaves[0]).toBeTruthy();
    expect(
      chaves[1],
      "a repetição usou chave de idempotência diferente: se o primeiro pedido "
      + "tiver passado, o órgão recebe o mesmo ofício duas vezes",
    ).toBe(chaves[0]);
  });

  it("429 que não passa nunca vira erro honesto, e não laço infinito", async () => {
    const { buscar, chamadas } = buscadorFalso(() => recusado(
      429, "rate_limit_exceeded", "Too many requests. Please limit the number of requests per second.",
    ));

    const erro = await clienteCom(buscar).enviar(MENSAGEM).catch((e: Error) => e);

    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toContain("429");
    expect((erro as Error).message).toMatch(/alguns minutos/);
    // Três no total: a primeira e as duas repetições. Mais que isso seria
    // segurar a tela do coordenador esperando.
    expect(chamadas).toHaveLength(3);
  });

  it("o teto do retry-after impede o provedor de pendurar a tela do coordenador", async () => {
    /*
      `retry-after: 3600` é o que um provedor manda quando a COTA DIÁRIA
      estourou, e não o limite por segundo. Obedecer ao pé da letra travaria a
      requisição por uma hora esperando algo que não vai melhorar.
    */
    const esperas: number[] = [];
    const { buscar } = buscadorFalso((n) => (
      n === 1
        ? recusado(429, "daily_quota_exceeded", "You have exceeded your daily email sending quota.",
                   { "retry-after": "3600" })
        : aceito()
    ));

    await clienteCom(buscar, { esperar: async (ms: number) => { esperas.push(ms); } })
      .enviar(MENSAGEM);

    expect(esperas[0]).toBeLessThanOrEqual(5_000);
  });

  it("provedor que não responde vira erro nomeado, e não travamento", async () => {
    const { buscar } = buscadorFalso(() => {
      throw new Error("The operation was aborted due to timeout");
    });

    await expect(
      clienteCom(buscar, { tempoLimiteMs: 5 }).enviar(MENSAGEM),
    ).rejects.toThrow(/nao respondeu/i);
  });

  it("o link de uso único NÃO aparece no erro que vai para o log e para o banco", async () => {
    /*
      Um provedor transacional ecoa o pedido dentro do corpo do erro de
      validação. Esse corpo vira mensagem de exceção, e a mensagem vira linha
      de log do servidor E a coluna `detalhe` da tentativa de envio, que o
      suporte abre para responder pergunta de usuário. Sem a limpeza, um erro
      de configuração grava o endereço do dossiê de uma família em dois lugares
      que ninguém trata como segredo.
    */
    const link = "https://api.exemplo.br/publico/oficio/token-de-uso-unico-secreto";
    const { buscar } = buscadorFalso(() => recusado(
      400, "validation_error", `Invalid field \`text\`: "Use este endereco: ${link}"`,
    ));

    const erro = await clienteCom(buscar).enviar({
      ...MENSAGEM, corpo: `Use este endereco: ${link}`,
    }).catch((e: Error) => e);

    expect((erro as Error).message).toContain("400");
    expect(
      (erro as Error).message,
      "o link de uso único vazou para a mensagem de erro, e daí para o log do "
      + "servidor e para a coluna que o suporte lê",
    ).not.toContain("token-de-uso-unico-secreto");
  });

  it("o endereço do destinatário NÃO aparece na mensagem de erro", async () => {
    /*
      Isto passou a importar quando o cliente começou a mandar o pedido no
      formato do provedor de verdade: o erro de validação ecoa o campo recusado,
      e o campo mais recusado na estreia é o de destinatário. Email de cidadão
      (ou do servidor público que assinou o laudo) é dado pessoal, e a Lei
      13.709/2018 não faz exceção para log de servidor.
    */
    const { buscar } = buscadorFalso(() => recusado(
      422, "validation_error",
      'Invalid `to` field: ["destino@orgao.exemplo.gov.br"] is not a valid recipient',
    ));

    const erro = await clienteCom(buscar).enviar(MENSAGEM).catch((e: Error) => e);

    expect((erro as Error).message).toContain("422");
    expect(
      (erro as Error).message,
      "o endereço do destinatário vazou do eco do provedor para o log e para a "
      + "coluna `detalhe` da tentativa de envio",
    ).not.toContain("destino@orgao.exemplo.gov.br");
  });

  it("a limpeza tira o endereço inteiro, e não só o token", () => {
    // Âncora da função de limpeza: sem ela, os casos acima poderiam passar por
    // acidente, porque nunca teriam encontrado endereço nenhum para tirar.
    const limpo = semOsEnderecos(
      "eco: https://a.exemplo.br/x/segredo e mais texto, de fulano@orgao.gov.br",
      "corpo com https://a.exemplo.br/x/segredo dentro",
      "fulano@orgao.gov.br",
    );
    expect(limpo).not.toContain("segredo");
    expect(limpo).not.toContain("fulano@orgao.gov.br");
    expect(limpo).toContain("e mais texto");
  });
});

describe("A recuperação de senha volta a sair de verdade", () => {
  let mem: BancoEmMemoria;
  let app: FastifyInstance;
  const chamadas: Chamada[] = [];

  beforeAll(async () => {
    mem = await bancoEmMemoria({ semear: false });
    const org = await mem.bruto.query<{ id: string }>(
      "INSERT INTO organizacoes (nome,municipio,uf) VALUES ('DC Serra Alta','Serra Alta','MG') RETURNING id",
    );
    await mem.bruto.query(
      `INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,senha_hash)
       VALUES ($1,'Helena Coutinho','SA-1','helena@serraalta.exemplo.gov.br','coordenador',$2)`,
      [org.rows[0]!.id, await derivarSenha(SENHA)],
    );

    const buscar = (async (url: unknown, opcoes: unknown) => {
      chamadas.push({ url: String(url), opcoes: opcoes as RequestInit });
      return aceito();
    }) as unknown as typeof fetch;

    app = await construirServidor({
      banco: mem.banco,
      config: carregarConfig({
        NODE_ENV: "test",
        JWT_SEGREDO: "segredo-de-teste-recuperacao-com-mais-de-32-bytes",
        LOGIN_POR_IP: "10000",
        RECUPERACAO_ATIVA: "sim",
        EMAIL_ATIVO: "sim",
        NOTIFICADOR_URL: URL_DO_RESEND,
        NOTIFICADOR_CHAVE: "re_chave_falsa",
        EMAIL_REMETENTE: "defesacivil@serraalta.exemplo.gov.br",
        URL_PAINEL: "http://painel.local",
      } as NodeJS.ProcessEnv),
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
      notificador: notificadorHttp({
        url: URL_DO_RESEND, chave: "re_chave_falsa", remetente: REMETENTE, buscar,
      }),
    });
    await app.ready();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await mem?.banco.encerrar();
  });

  it("o link de redefinição sai pelo provedor, e não pelo log do servidor", async () => {
    const r = await app.inject({
      method: "POST", url: "/auth/recuperar",
      payload: { email: "helena@serraalta.exemplo.gov.br" },
    });
    expect(r.statusCode).toBe(202);

    expect(
      chamadas,
      "a rota respondeu 202 e nenhuma chamada saiu para o provedor, que é "
      + "exatamente o defeito confirmado contra a produção",
    ).toHaveLength(1);

    const corpo = JSON.parse(String(chamadas[0]!.opcoes.body)) as Record<string, unknown>;
    expect(corpo["to"]).toEqual(["helena@serraalta.exemplo.gov.br"]);
    expect(corpo["text"]).toContain("http://painel.local/redefinir-senha?token=");
  });
});
