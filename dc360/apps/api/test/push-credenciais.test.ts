import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { criarProvedorApns } from "../src/push/apns.js";
import { criarProvedorFcm, lerContaDeServico } from "../src/push/fcm.js";
import { montarAviso, type DetalheDoAviso } from "../src/push/mensagem.js";

/*
  A SEGURANÇA DO ENVIO, ligada antes do primeiro push de verdade.

  A chave `.p8` da APNs não é a chave de um aplicativo: ela assina notificação
  para QUALQUER aplicativo do time. Se ela vazar, alguém escreve na tela de
  bloqueio de um agente de Defesa Civil, e uma ordem falsa de evacuação é dano
  real, com gente saindo de casa de madrugada.

  Este arquivo tranca as três garantias que precisavam existir antes do
  primeiro envio:

    1. a chave nunca sai em log, em erro nem no corpo do que é enviado;
    2. o token de provedor é REAPROVEITADO (a Apple recusa quem gera um por
       requisição, com TooManyProviderTokenUpdates) e renovado antes da hora
       (ela também recusa token com mais de uma hora, com ExpiredProviderToken);
    3. falha de envio vira desfecho, e não exceção que derruba quem chamou.

  NENHUM ENVIO DE VERDADE ACONTECE AQUI. A chave abaixo é sorteada na hora, e o
  transporte é duplo de teste: mandar notificação real para um telefone, sem a
  metade aplicativo pronta, seria barulho sem valor.
*/

const DETALHE: DetalheDoAviso = {
  organizacaoId: "11111111-1111-4111-8111-000000000001",
  ocorrenciaId: "33333333-3333-4333-8333-000000000009",
  severidade: "alta",
  prazoEm: "2026-09-09T17:30:00.000Z",
};

const AVISO = montarAviso("prazo_vencendo", DETALHE);
const FICHA = "aabbccdd11223344556677889900ffee";

/** Chave ES256 sorteada nesta máquina, no formato do arquivo `.p8` da Apple. */
function chaveDeTeste(): string {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

function pedacosDoToken(autorizacao: string): { cabecalho: any; conteudo: any } {
  const token = autorizacao.replace(/^bearer /, "");
  const [cabecalho, conteudo] = token.split(".");
  const abrir = (parte: string) =>
    JSON.parse(Buffer.from(parte, "base64url").toString("utf8"));
  return { cabecalho: abrir(cabecalho!), conteudo: abrir(conteudo!) };
}

describe("APNs: o token de provedor é reaproveitado", () => {
  function provedorEspiao(chavePem: string) {
    const pedidos: Array<{ caminho: string; cabecalhos: Record<string, string>; corpo: string }> = [];
    let relogio = Date.parse("2026-09-09T12:00:00.000Z");

    const provedor = criarProvedorApns(
      { keyId: "TF85R64X4Q", teamId: "TIME123456", bundle: "br.gov.exemplo.dc360", chavePem },
      {
        agora: () => relogio,
        transporte: async (pedido) => {
          pedidos.push(pedido);
          return { status: 200, corpo: "" };
        },
      },
    );

    return {
      provedor,
      pedidos,
      avancarMinutos: (minutos: number) => { relogio += minutos * 60_000; },
    };
  }

  it("dois envios seguidos usam O MESMO token", async () => {
    /*
      A Apple responde 429 TooManyProviderTokenUpdates para quem gera token
      demais, e ela conta por VINTE MINUTOS. Um token por notificação faria a
      primeira noite de temporal, com dezenas de avisos em minutos, ser
      recusada inteira, justamente quando o produto mais precisa entregar.
    */
    const { provedor, pedidos } = provedorEspiao(chaveDeTeste());

    await provedor.enviar(FICHA, AVISO);
    await provedor.enviar(FICHA, AVISO);

    expect(pedidos).toHaveLength(2);
    expect(pedidos[0]!.cabecalhos.authorization).toBe(pedidos[1]!.cabecalhos.authorization);
  });

  it("o token é renovado ANTES da hora em que a Apple o recusa", async () => {
    // A Apple invalida token com mais de uma hora (ExpiredProviderToken).
    // Renovar aos cinquenta minutos deixa folga para relógio fora de sincronia.
    const { provedor, pedidos, avancarMinutos } = provedorEspiao(chaveDeTeste());

    await provedor.enviar(FICHA, AVISO);
    avancarMinutos(49);
    await provedor.enviar(FICHA, AVISO);
    expect(
      pedidos[1]!.cabecalhos.authorization,
      "renovou cedo demais: a Apple recusa quem gera token de novo antes de vinte minutos",
    ).toBe(pedidos[0]!.cabecalhos.authorization);

    avancarMinutos(2);
    await provedor.enviar(FICHA, AVISO);
    expect(
      pedidos[2]!.cabecalhos.authorization,
      "não renovou: passada uma hora, a Apple recusa o token com ExpiredProviderToken",
    ).not.toBe(pedidos[0]!.cabecalhos.authorization);
  });

  it("o token leva o identificador da chave e do time, que é o que a Apple confere", async () => {
    const { provedor, pedidos } = provedorEspiao(chaveDeTeste());
    await provedor.enviar(FICHA, AVISO);

    const { cabecalho, conteudo } = pedacosDoToken(pedidos[0]!.cabecalhos.authorization!);
    expect(cabecalho.alg).toBe("ES256");
    expect(cabecalho.kid).toBe("TF85R64X4Q");
    expect(conteudo.iss).toBe("TIME123456");
    expect(typeof conteudo.iat).toBe("number");
    expect(pedidos[0]!.cabecalhos["apns-topic"]).toBe("br.gov.exemplo.dc360");
  });

  it("a chave privada não aparece em nada que sai do processo", async () => {
    const chavePem = chaveDeTeste();
    const { provedor, pedidos } = provedorEspiao(chavePem);
    await provedor.enviar(FICHA, AVISO);

    const tudoQueSaiu = JSON.stringify(pedidos);
    /*
      A comparação é pelo MIOLO da chave, e não pelo PEM inteiro: o PEM tem
      quebras de linha que a serialização escaparia, e a checagem passaria sem
      provar nada.
    */
    const miolo = chavePem.split("\n").filter((l) => !l.startsWith("-----")).join("");
    expect(miolo.length).toBeGreaterThan(40);
    expect(tudoQueSaiu).not.toContain(miolo);
  });

  it("chave inválida falha na PARTIDA e sem citar o material", async () => {
    /*
      Falhar cedo é a metade fácil. A metade que importa é a mensagem: um erro
      que despeja a chave no log do servidor transforma um problema de
      configuração num vazamento, e log é lido por mais gente e guardado por
      mais tempo do que qualquer um imagina.
    */
    const lixo = "-----BEGIN PRIVATE KEY-----\nNAOEUMACHAVEDEVERDADE123456\n-----END PRIVATE KEY-----\n";
    const provedor = criarProvedorApns(
      { keyId: "K", teamId: "T", bundle: "b", chavePem: lixo },
      { transporte: async () => ({ status: 200, corpo: "" }) },
    );

    await expect(provedor.enviar(FICHA, AVISO)).rejects.toThrow(/APNS_CHAVE/);
    await expect(provedor.enviar(FICHA, AVISO)).rejects.not.toThrow(/NAOEUMACHAVEDEVERDADE/);
  });
});

describe("APNs: leitura da resposta", () => {
  function provedorCom(status: number, corpo: string) {
    return criarProvedorApns(
      { keyId: "K", teamId: "T", bundle: "b", chavePem: chaveDeTeste() },
      { transporte: async () => ({ status, corpo }) },
    );
  }

  it("200 é entregue", async () => {
    expect((await provedorCom(200, "").enviar(FICHA, AVISO)).desfecho).toBe("entregue");
  });

  it("aparelho que não existe mais marca a ficha como inválida", async () => {
    // É o que faz a lista de destinos se limpar sozinha: reinstalar o
    // aplicativo troca a ficha, e a antiga não volta nunca mais.
    const r = await provedorCom(410, JSON.stringify({ reason: "Unregistered" })).enviar(FICHA, AVISO);
    expect(r.desfecho).toBe("ficha_invalida");
    expect(r.detalhe).toContain("Unregistered");
  });

  it("recusa do instante é falha, e volta a ser tentada depois", async () => {
    // 429 é limite de taxa: o aparelho está vivo, quem não estava pronto era o
    // servidor da Apple. Revogar o aparelho aqui seria desligar o agente do
    // aviso por causa de um soluço de rede.
    const r = await provedorCom(429, JSON.stringify({ reason: "TooManyRequests" })).enviar(FICHA, AVISO);
    expect(r.desfecho).toBe("falha");
  });

  it("a vitrine vai em aps.alert e o detalhe vai fora dele", async () => {
    let corpoEnviado = "";
    const provedor = criarProvedorApns(
      { keyId: "K", teamId: "T", bundle: "b", chavePem: chaveDeTeste() },
      {
        transporte: async (pedido) => {
          corpoEnviado = pedido.corpo;
          return { status: 200, corpo: "" };
        },
      },
    );
    await provedor.enviar(FICHA, AVISO);

    const enviado = JSON.parse(corpoEnviado);
    expect(enviado.aps.alert.title).toBe(AVISO.titulo);
    expect(enviado.aps.alert.body).toBe(AVISO.corpo);
    expect(JSON.stringify(enviado.aps)).not.toContain(DETALHE.endereco);
    expect(enviado.endereco).toBe(DETALHE.endereco);
  });
});

describe("FCM: a conta de serviço", () => {
  function contaDeTeste() {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    return {
      project_id: "dc360-exemplo",
      client_email: "push@dc360-exemplo.iam.gserviceaccount.com",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      token_uri: "https://oauth2.exemplo/token",
    };
  }

  function provedorEspiao(conta: ReturnType<typeof contaDeTeste>, respostaDeEnvio = { status: 200, corpo: "{}" }) {
    const chamadas: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    const provedor = criarProvedorFcm(conta, {
      buscar: async (url, o) => {
        chamadas.push({ url, body: o.body, headers: o.headers });
        if (url === conta.token_uri) {
          return {
            status: 200,
            text: async () => JSON.stringify({ access_token: "acesso-de-teste", expires_in: 3600 }),
          };
        }
        return { status: respostaDeEnvio.status, text: async () => respostaDeEnvio.corpo };
      },
    });
    return { provedor, chamadas };
  }

  it("troca a credencial por token de acesso uma vez e reaproveita", async () => {
    // Uma troca por notificação transformaria uma rajada de avisos numa rajada
    // de autenticações contra o Google, e o limite de taxa é dele, não nosso.
    const conta = contaDeTeste();
    const { provedor, chamadas } = provedorEspiao(conta);

    await provedor.enviar(FICHA, AVISO);
    await provedor.enviar(FICHA, AVISO);

    const trocas = chamadas.filter((c) => c.url === conta.token_uri);
    expect(trocas).toHaveLength(1);
  });

  it("a chave privada da conta de serviço não sai no que é enviado", async () => {
    const conta = contaDeTeste();
    const { provedor, chamadas } = provedorEspiao(conta);
    await provedor.enviar(FICHA, AVISO);

    const miolo = conta.private_key.split("\n").filter((l) => !l.startsWith("-----")).join("");
    expect(JSON.stringify(chamadas)).not.toContain(miolo);
  });

  it("aparelho desconhecido do Google marca a ficha como inválida", async () => {
    const conta = contaDeTeste();
    const { provedor } = provedorEspiao(conta, {
      status: 404,
      corpo: JSON.stringify({
        error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] },
      }),
    });
    expect((await provedor.enviar(FICHA, AVISO)).desfecho).toBe("ficha_invalida");
  });

  it("erro de argumento NÃO revoga aparelho nenhum", async () => {
    /*
      `INVALID_ARGUMENT` tanto significa "essa ficha está malformada" quanto "o
      corpo que você mandou está errado". Tratar o segundo como ficha morta
      faria um defeito nosso de montagem revogar, de uma vez e em silêncio, o
      aparelho de todos os agentes de todos os municípios.
    */
    const conta = contaDeTeste();
    const { provedor } = provedorEspiao(conta, {
      status: 400,
      corpo: JSON.stringify({ error: { status: "INVALID_ARGUMENT" } }),
    });
    expect((await provedor.enviar(FICHA, AVISO)).desfecho).toBe("falha");
  });

  it("arquivo trocado é recusado na partida, dizendo qual é o arquivo certo", () => {
    // O engano comum é entregar o `google-services.json`, que é público, no
    // lugar da conta de serviço, que é segredo. Os dois são JSON e os dois têm
    // "project" no nome dos campos.
    expect(() => lerContaDeServico(JSON.stringify({ project_info: {} }), "/tmp/x.json"))
      .toThrow(/google-services/);
    expect(() => lerContaDeServico("isto nao e json", "/tmp/x.json")).toThrow(/JSON/);
  });
});
