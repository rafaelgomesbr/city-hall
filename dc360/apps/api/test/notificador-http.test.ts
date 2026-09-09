import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { derivarSenha } from "../src/auth/senha.js";
import { notificadorHttp, semOsEnderecos } from "../src/auth/notificador.js";

/**
 * O cliente HTTP de email, que é a peça que faltava no produto inteiro.
 *
 * O DEFEITO QUE ESTE ARQUIVO TRANCA, e ele é do tipo que passa em toda
 * revisão: `NOTIFICADOR_URL` e `NOTIFICADOR_CHAVE` existiam na configuração
 * desde a recuperação de senha, a partida em produção RECUSAVA subir sem elas
 * com a recuperação ligada, e NENHUMA linha do servidor jamais falava com esse
 * provedor. Não havia cliente. Toda mensagem caía no `notificadorDeLog`, a
 * rota respondia 202 "enviamos um link", e o link de uso único ia para o log
 * do servidor, por fora do `redact`.
 *
 * É por isso que a produção roda com `RECUPERACAO_ATIVA=nao`: não foi decisão
 * de produto, foi a única saída honesta enquanto o envio não existia.
 *
 * O último caso deste arquivo é a prova de que isso acabou: com o cliente no
 * lugar, o link de redefinição sai por HTTP para o provedor, e não para o log.
 */

const SENHA = "senha-de-teste-bem-comprida";

type Chamada = { url: string; opcoes: RequestInit };

/** `fetch` de mentira, com o que o teste precisa afirmar depois. */
function buscadorFalso(resposta: () => Response | Promise<Response>) {
  const chamadas: Chamada[] = [];
  const buscar = (async (url: unknown, opcoes: unknown) => {
    chamadas.push({ url: String(url), opcoes: opcoes as RequestInit });
    return resposta();
  }) as unknown as typeof fetch;
  return { buscar, chamadas };
}

describe("Cliente HTTP de email", () => {
  it("manda o POST autenticado, com a mensagem no corpo", async () => {
    const { buscar, chamadas } = buscadorFalso(() => new Response("", { status: 202 }));
    const notificador = notificadorHttp({
      url: "https://provedor.exemplo.com/enviar",
      chave: "chave-secreta-do-provedor",
      remetente: "defesacivil@municipio.exemplo.gov.br",
      buscar,
    });

    await notificador.enviar({
      para: "destino@orgao.exemplo.gov.br",
      nome: "Corpo de Bombeiros",
      assunto: "Oficio 000001/2026",
      corpo: "Use este endereco: https://api.exemplo.br/publico/oficio/abc123",
    });

    expect(chamadas).toHaveLength(1);
    const [chamada] = chamadas;
    expect(chamada!.url).toBe("https://provedor.exemplo.com/enviar");
    expect(chamada!.opcoes.method).toBe("POST");

    const cabecalhos = chamada!.opcoes.headers as Record<string, string>;
    expect(cabecalhos["authorization"]).toBe("Bearer chave-secreta-do-provedor");
    expect(cabecalhos["content-type"]).toBe("application/json");

    const corpo = JSON.parse(String(chamada!.opcoes.body));
    expect(corpo.para).toBe("destino@orgao.exemplo.gov.br");
    expect(corpo.de).toBe("defesacivil@municipio.exemplo.gov.br");
    expect(corpo.texto).toContain("/publico/oficio/abc123");

    // Sem tempo limite, um provedor que aceita a conexão e não responde
    // pendura a requisição do coordenador até o limite do servidor.
    expect(chamada!.opcoes.signal).toBeTruthy();
  });

  it("recusa do provedor sobe como exceção, e não vira silêncio", async () => {
    /*
      Engolir o erro aqui produziria exatamente o defeito que este cliente veio
      fechar: a rota responderia "enviamos" sem ter enviado. Quem chama é que
      decide o que fazer, e no ofício a decisão é gravar a tentativa como falha.
    */
    const { buscar } = buscadorFalso(
      () => new Response("sem saldo na conta", { status: 402 }),
    );
    const notificador = notificadorHttp({
      url: "https://provedor.exemplo.com/enviar", chave: "x", buscar,
    });

    await expect(notificador.enviar({
      para: "a@b.gov.br", nome: "Alguem", assunto: "Teste",
      corpo: "https://api.exemplo.br/publico/oficio/token-secreto",
    })).rejects.toThrow(/402/);
  });

  it("o link de uso único NÃO aparece no erro que vai para o log e para o banco", async () => {
    /*
      Um provedor transacional costuma ecoar o pedido inteiro dentro do corpo
      do erro. Esse corpo vira mensagem de exceção, e a mensagem vira linha de
      log do servidor E a coluna `detalhe` da tentativa de envio, que o suporte
      abre para responder pergunta de usuário. Sem a limpeza, um erro de
      configuração do provedor grava o endereço do dossiê de uma família em
      dois lugares que ninguém trata como segredo.
    */
    const link = "https://api.exemplo.br/publico/oficio/token-de-uso-unico-secreto";
    const { buscar } = buscadorFalso(
      () => new Response(`campo texto invalido: "Use este endereco: ${link}"`, { status: 400 }),
    );
    const notificador = notificadorHttp({
      url: "https://provedor.exemplo.com/enviar", chave: "x", buscar,
    });

    const erro = await notificador.enviar({
      para: "a@b.gov.br", nome: "Alguem", assunto: "Teste",
      corpo: `Use este endereco: ${link}`,
    }).catch((e: Error) => e);

    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toContain("400");
    expect(
      (erro as Error).message,
      "o link de uso único vazou para a mensagem de erro, e daí para o log do "
      + "servidor e para a coluna que o suporte lê",
    ).not.toContain("token-de-uso-unico-secreto");
  });

  it("provedor que não responde vira erro nomeado, e não travamento", async () => {
    const { buscar } = buscadorFalso(() => {
      throw new Error("The operation was aborted due to timeout");
    });
    const notificador = notificadorHttp({
      url: "https://provedor.exemplo.com/enviar", chave: "x", buscar, tempoLimiteMs: 5,
    });

    await expect(notificador.enviar({
      para: "a@b.gov.br", nome: "Alguem", assunto: "Teste", corpo: "x",
    })).rejects.toThrow(/nao respondeu/i);
  });

  it("a limpeza tira o endereço inteiro, e não só o token", () => {
    // Âncora da função de limpeza: sem ela, os casos acima poderiam passar por
    // acidente, porque nunca teriam encontrado endereço nenhum para tirar.
    const limpo = semOsEnderecos(
      "eco: https://a.exemplo.br/x/segredo e mais texto",
      "corpo com https://a.exemplo.br/x/segredo dentro",
    );
    expect(limpo).not.toContain("segredo");
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
      return new Response("", { status: 202 });
    }) as unknown as typeof fetch;

    app = await construirServidor({
      banco: mem.banco,
      config: carregarConfig({
        NODE_ENV: "test",
        JWT_SEGREDO: "segredo-de-teste-recuperacao-com-mais-de-32-bytes",
        LOGIN_POR_IP: "10000",
        RECUPERACAO_ATIVA: "sim",
        EMAIL_ATIVO: "sim",
        NOTIFICADOR_URL: "https://provedor.exemplo.com/enviar",
        NOTIFICADOR_CHAVE: "chave-falsa",
        URL_PAINEL: "http://painel.local",
      } as NodeJS.ProcessEnv),
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
      notificador: notificadorHttp({
        url: "https://provedor.exemplo.com/enviar", chave: "chave-falsa", buscar,
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

    const corpo = JSON.parse(String(chamadas[0]!.opcoes.body));
    expect(corpo.para).toBe("helena@serraalta.exemplo.gov.br");
    expect(corpo.texto).toContain("http://painel.local/redefinir-senha?token=");
  });
});
