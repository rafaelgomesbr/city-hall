import {
  criarFilaDeSincronizacao,
  depositoSobreChaveValor,
  lojaEmMemoria,
  transporteHttp,
} from "@dc360/campo";
import type { EnvelopeSincronizacao } from "@dc360/shared";
import { ErroDaApi } from "./api";
import { criarObtentorDeToken, lerExpiracaoDoAcesso } from "./token";

/**
 * A pausa por 426 e a renovação antecipada do token (V2-F02-E06, correção 1,
 * achado da revisão independente dos lotes 3 e 4).
 *
 * O teste da parte 3B usava um dublê de `obterToken` e por isso não via o
 * caminho real: com o token perto do vencimento, o obtentor do aplicativo
 * tenta `/v1/auth/renovar` ANTES de cada envio, e depois da pausa por 426 isso
 * se repetia a cada dreno. Aqui a fila, o transporte e o obtentor são os
 * REAIS; só a rede é dublada, e o que se conta é o que chega a `/auth/renovar`.
 *
 * A promessa, exata: enquanto a última resposta da fila foi 426, o transporte
 * pede o token SEM renovação antecipada. O que não muda: o 401
 * `nao_autenticado` continua renovando uma vez (pedido forçado), e a primeira
 * resposta que não for 426 devolve a fila ao comportamento de sempre.
 */

const AUTOR = { usuarioId: "agente-ana", nome: "Ana Ribeiro", organizacaoId: "serra-alta" };
const OCORRENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHAVES = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
];
const T0 = Date.parse("2026-10-26T14:00:00.000Z");
const MINUTO = 60_000;

function tokenQueVenceEm(instanteDeVencimento: number): string {
  const emBase64Url = (texto: string) =>
    btoa(texto).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return [
    emBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    emBase64Url(JSON.stringify({ sub: "agente", exp: Math.floor(instanteDeVencimento / 1000) })),
    "assinatura-de-mentira",
  ].join(".");
}

function envelope(chave: string): EnvelopeSincronizacao {
  const coletadaEm = new Date(T0).toISOString();
  return {
    idempotencyKey: chave,
    ocorrenciaId: OCORRENCIA,
    coletadaEm,
    vistoria: {
      checklist: [
        { chave: "risco_iminente", resposta: true },
        { chave: "evacuacao_necessaria", resposta: false },
        { chave: "interdicao_indicada", resposta: false },
        { chave: "acionar_outro_orgao", resposta: false },
      ],
      fotos: [],
      gpsPrecisaoMetros: 6,
      assinanteNome: "Moradora",
      assinaturaChave: "assinatura.png",
      coletadaEm,
    },
  };
}

function resposta(status: number, corpo: unknown = {}): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo } as Response;
}

const RECUSA_426 = {
  erro: "versao_do_aplicativo_antiga",
  mensagem: "Atualize o aplicativo para continuar.",
  versaoMinima: "1.3.0",
};

/** O aplicativo montado de verdade, com o servidor dublado. */
function montar() {
  let agora = T0;
  let acesso = tokenQueVenceEm(T0 + 15 * MINUTO);
  let renovacao = "renovacao-1";
  const servidor = { exigeVersaoNova: true };
  const pedidos: { url: string; autorizacao: string | undefined }[] = [];
  let tentativasDeRenovacao = 0;
  let renovacoesBemSucedidas = 0;

  /* A rede: o gancho de versão responde 426 ANTES de autenticar, em toda rota. */
  const buscar = (async (url: string, opcoes?: RequestInit) => {
    const autorizacao = (opcoes?.headers as Record<string, string> | undefined)?.authorization;
    pedidos.push({ url, autorizacao });
    if (url.endsWith("/auth/renovar")) tentativasDeRenovacao += 1;
    if (servidor.exigeVersaoNova) return resposta(426, RECUSA_426);
    if (url.endsWith("/auth/renovar")) {
      renovacoesBemSucedidas += 1;
      return resposta(200, { acesso: tokenQueVenceEm(agora + 15 * MINUTO), renovacao: "novo" });
    }
    const venceuEm = lerExpiracaoDoAcesso(acesso) ?? 0;
    if (autorizacao !== `Bearer ${acesso}` || venceuEm <= agora) {
      return resposta(401, { erro: "nao_autenticado", mensagem: "Token vencido." });
    }
    return resposta(201, { vistoriaId: "v" });
  }) as unknown as typeof fetch;

  const obterToken = criarObtentorDeToken({
    lerCredenciais: () => ({ acesso, renovacao }),
    guardarCredenciais: async (novas) => {
      acesso = novas.acesso;
      renovacao = novas.renovacao;
    },
    renovar: async (r) => {
      const resp = await buscar("https://api.exemplo/v1/auth/renovar", {
        method: "POST",
        headers: { authorization: `Bearer ${r}` },
      });
      const corpo = (await resp.json()) as { erro?: string; mensagem?: string };
      if (!resp.ok) throw new ErroDaApi(resp.status, corpo.erro ?? "", corpo.mensagem ?? "");
      return corpo as unknown as { acesso: string; renovacao: string };
    },
    agora: () => agora,
  });

  const deposito = depositoSobreChaveValor(lojaEmMemoria());
  const fila = criarFilaDeSincronizacao({
    deposito,
    transporte: transporteHttp({
      baseUrl: "https://api.exemplo/v1",
      obterToken,
      buscar,
      versaoDoAplicativo: "1.2.0",
    }),
    sessaoAtual: () => AUTOR,
    agora: () => new Date(agora),
    ruido: () => 0.5,
  });

  return {
    fila,
    deposito,
    servidor,
    pedidos,
    get tentativasDeRenovacao() {
      return tentativasDeRenovacao;
    },
    get renovacoesBemSucedidas() {
      return renovacoesBemSucedidas;
    },
    avancar: (ms: number) => {
      agora += ms;
    },
    get acesso() {
      return acesso;
    },
  };
}

const enviosDaVistoria = (pedidos: { url: string }[]) =>
  pedidos.filter((p) => p.url.endsWith("/sincronizacao/vistoria")).length;

describe("426 com o token perto do vencimento: fila, transporte e obtentor reais", () => {
  it("dois drenos depois do 426 não tentam renovar, e o item sobe depois com a mesma chave", async () => {
    const app = montar();
    await app.fila.enfileirar(envelope(CHAVES[0]!), { protocolo: "000001/2026", fotos: [] });

    // 1º dreno, token novo: o 426 pausa a fila. Nenhuma renovação, o token está longe de vencer.
    const primeiro = await app.fila.drenar();
    expect(primeiro.paradaPor).toBe("versao_do_aplicativo_antiga");
    expect(app.tentativasDeRenovacao).toBe(0);

    // O plantão avança: o token entra na folga de renovação (dois minutos antes de vencer).
    app.avancar(13.5 * MINUTO);
    const segundo = await app.fila.drenar();
    app.avancar(1.1 * MINUTO);
    const terceiro = await app.fila.drenar();

    expect(segundo.paradaPor).toBe("versao_do_aplicativo_antiga");
    expect(terceiro.paradaPor).toBe("versao_do_aplicativo_antiga");
    // O envio continua sendo tentado (é assim que a fila descobre a atualização)...
    expect(enviosDaVistoria(app.pedidos)).toBe(3);
    // ...mas sem gastar o token de renovação.
    expect(app.tentativasDeRenovacao).toBe(0);

    const [item] = await app.deposito.listar();
    expect(item?.estado).toBe("pendente");
    expect(item?.tentativas).toBe(0);
    expect(item?.envelope?.idempotencyKey).toBe(CHAVES[0]);

    // O aplicativo foi atualizado: o mesmo item sobe, com a mesma chave.
    app.servidor.exigeVersaoNova = false;
    app.avancar(0.2 * MINUTO);
    // O token ainda vale por pouco tempo e a renovação continua suspensa até a resposta.
    const quarto = await app.fila.drenar();
    expect(quarto.paradaPor).toBeUndefined();
    expect(quarto.enviados).toBe(1);
    expect(app.tentativasDeRenovacao).toBe(0);
    const [depois] = await app.deposito.listar();
    expect(depois?.estado).toBe("confirmado");
    expect(depois?.envelope?.idempotencyKey).toBe(CHAVES[0]);
  });

  it("a resposta que não é 426 devolve a renovação antecipada ao que sempre foi", async () => {
    const app = montar();
    await app.fila.enfileirar(envelope(CHAVES[0]!), { protocolo: "000001/2026", fotos: [] });
    await app.fila.drenar();
    app.avancar(13.5 * MINUTO);
    app.servidor.exigeVersaoNova = false;
    expect((await app.fila.drenar()).enviados).toBe(1);
    expect(app.tentativasDeRenovacao).toBe(0);

    // Outra coleta, com o token ainda dentro da folga: agora renova antes de enviar.
    await app.fila.enfileirar(envelope(CHAVES[1]!), { protocolo: "000002/2026", fotos: [] });
    app.avancar(1.2 * MINUTO);
    expect((await app.fila.drenar()).enviados).toBe(1);
    expect(app.renovacoesBemSucedidas).toBe(1);
  });

  it("token vencido durante a pausa: o 401 continua renovando uma vez e a coleta sobe", async () => {
    const app = montar();
    await app.fila.enfileirar(envelope(CHAVES[0]!), { protocolo: "000001/2026", fotos: [] });
    await app.fila.drenar();
    app.avancar(20 * MINUTO); // o token venceu de fato
    app.servidor.exigeVersaoNova = false;

    const r = await app.fila.drenar();

    expect(r.paradaPor).toBeUndefined();
    expect(r.enviados).toBe(1);
    // Uma renovação, a do pedido forçado depois do 401, e não uma por tentativa.
    expect(app.tentativasDeRenovacao).toBe(1);
    expect(app.renovacoesBemSucedidas).toBe(1);
  });
});
