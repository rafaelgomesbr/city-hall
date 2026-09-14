import {
  buscarHistoricoDaCasa, historicoTemConteudo, type HistoricoDaCasa,
} from "./historico-da-casa";

/**
 * O QUE JÁ ACONTECEU NESTA CASA, do lado dos dados.
 *
 * `GET /ocorrencias/:id` e `GET /evidencias/ocorrencia/:id` existem há meses,
 * exigem só autenticação e o aplicativo nunca chamou nenhuma das duas. O que
 * este arquivo trava não é o formato do JSON, que é do servidor: é o
 * COMPORTAMENTO SOB FRACASSO, que é o único jeito de este recurso não virar o
 * primeiro lugar do aplicativo onde a falta de sinal atrapalha alguém.
 *
 * A regra que ele guarda, e que precisa continuar verdadeira depois de
 * qualquer edição: **esta função não estoura nunca**. Nenhum caminho, nenhum
 * status, nenhum corpo. A tela por onde o produto existe abre do disco e não
 * depende de sinal, e um enriquecimento oportunista que lança seria o
 * enriquecimento derrubando a coleta.
 */

jest.mock("./api", () => ({ enderecoDaApi: () => "https://api.exemplo" }));

const DOSSIE = {
  vistoria: {
    coletada_em: "2026-09-03T14:00:00.000Z",
    sincronizada_em: "2026-09-03T18:00:00.000Z",
    agente_nome: "Carlos de exemplo",
    assinante_nome: "Maria de exemplo",
    observacoes: "Trinca no muro dos fundos, sem movimento aparente.",
  },
  providencias: [{
    id: "p-1",
    orgao_destino: "Concessionária de energia",
    descricao: "Desligar o ramal do poste inclinado",
    encaminhada_em: "2026-09-03T19:00:00.000Z",
    respondida_em: null,
  }],
  vinculadas: [{
    id: "oc-9",
    protocolo: "2026/000090",
    status: "encerrada",
    endereco: "Servidão do Morro, 45",
    criado_em: "2026-08-28T10:00:00.000Z",
  }],
  devolucao: {
    decidida_em: "2026-09-05T12:00:00.000Z",
    motivo: "morador_ausente",
    observacao: "Bati três vezes, ninguém atendeu.",
    observacao_removida_em: null,
    devolvida_por_nome: "Ana de exemplo",
  },
};

const EVIDENCIAS = {
  itens: [{
    id: "ev-1", legenda: "Muro dos fundos", capturadaEm: "2026-09-03T14:10:00.000Z",
    ordem: 0, url: "https://armazenamento.exemplo/ev-1",
  }],
};

/** Uma resposta de `fetch` com o mínimo que a função lê. */
function resposta(corpo: unknown, ok = true) {
  return { ok, json: async () => corpo };
}

let chamadas: Array<{ url: string; opcoes: RequestInit }>;

/**
 * O `fetch` do ambiente, dublado por caminho.
 *
 * Por caminho e não por ordem de chamada: as duas rotas vão em `Promise.all`,
 * e um dublê que respondesse pela ordem passaria a medir a ordem de resolução
 * do `Promise.all`, que não é contrato de nada.
 */
function responderCom(mapa: Record<string, ReturnType<typeof resposta> | Error>) {
  (globalThis as { fetch: unknown }).fetch = jest.fn(async (url: unknown, opcoes: unknown) => {
    const endereco = String(url);
    chamadas.push({ url: endereco, opcoes: opcoes as RequestInit });
    for (const [trecho, saida] of Object.entries(mapa)) {
      if (endereco.includes(trecho)) {
        if (saida instanceof Error) throw saida;
        return saida;
      }
    }
    throw new Error(`rota sem dublê: ${endereco}`);
  }) as unknown as typeof fetch;
}

beforeEach(() => { chamadas = []; });

describe("o histórico chega", () => {
  it("pergunta as duas rotas, com o token no cabeçalho de cada uma", async () => {
    responderCom({
      "/ocorrencias/": resposta(DOSSIE),
      "/evidencias/ocorrencia/": resposta(EVIDENCIAS),
    });

    const r = await buscarHistoricoDaCasa("token-de-mentira", "oc-1");

    expect(r.estado).toBe("chegou");
    expect(chamadas.map((c) => c.url).sort()).toEqual([
      "https://api.exemplo/evidencias/ocorrencia/oc-1",
      "https://api.exemplo/ocorrencias/oc-1",
    ]);
    for (const c of chamadas) {
      expect((c.opcoes.headers as Record<string, string>)["authorization"])
        .toBe("Bearer token-de-mentira");
    }
  });

  it("devolve a vistoria anterior, as fotos, as providências, os vínculos e a devolução", async () => {
    responderCom({
      "/ocorrencias/": resposta(DOSSIE),
      "/evidencias/ocorrencia/": resposta(EVIDENCIAS),
    });

    const r = await buscarHistoricoDaCasa("token-de-mentira", "oc-1");

    expect(r.estado).toBe("chegou");
    if (r.estado !== "chegou") return;
    expect(r.historico.vistoriaAnterior?.agente_nome).toBe("Carlos de exemplo");
    expect(r.historico.fotosDeAntes).toHaveLength(1);
    expect(r.historico.providencias).toHaveLength(1);
    expect(r.historico.vinculadas[0]?.protocolo).toBe("2026/000090");
    expect(r.historico.devolucao?.motivo).toBe("morador_ausente");
  });
});

describe("o histórico NÃO chega, e nada estoura", () => {
  it("rede caída vira 'nao-chegou' em vez de exceção", async () => {
    responderCom({
      "/ocorrencias/": new Error("Network request failed"),
      "/evidencias/ocorrencia/": new Error("Network request failed"),
    });

    /*
      `resolves` e não `rejects`, e é esta linha que guarda a regra inteira:
      sem o `catch` de `pedir`, a promessa chega rejeitada na tela, que a
      trataria com a tarja vermelha da coleta. Um aviso de erro no alto de uma
      tela cuja promessa é "nada aqui depende de sinal" é o produto se
      desmentindo.
    */
    await expect(buscarHistoricoDaCasa("token-de-mentira", "oc-1"))
      .resolves.toEqual({ estado: "nao-chegou" });
  });

  it("servidor que responde erro vira 'nao-chegou', não histórico vazio", async () => {
    responderCom({
      "/ocorrencias/": resposta({ mensagem: "boom" }, false),
      "/evidencias/ocorrencia/": resposta(EVIDENCIAS),
    });

    /*
      O dossiê é quem manda. Um resultado "chegou" com tudo vazio faria a tela
      afirmar, por omissão, que ninguém esteve nesta casa antes, que é
      exatamente o fato que este recurso existe para contar.
    */
    expect(await buscarHistoricoDaCasa("token-de-mentira", "oc-1"))
      .toEqual({ estado: "nao-chegou" });
  });

  it("corpo que não é JSON vira 'nao-chegou'", async () => {
    (globalThis as { fetch: unknown }).fetch = jest.fn(async () => ({
      ok: true,
      json: async () => { throw new SyntaxError("Unexpected token <"); },
    })) as unknown as typeof fetch;

    expect(await buscarHistoricoDaCasa("token-de-mentira", "oc-1"))
      .toEqual({ estado: "nao-chegou" });
  });

  it("sem token não pergunta nada a ninguém", async () => {
    responderCom({
      "/ocorrencias/": resposta(DOSSIE),
      "/evidencias/ocorrencia/": resposta(EVIDENCIAS),
    });

    expect(await buscarHistoricoDaCasa(null, "oc-1")).toEqual({ estado: "nao-chegou" });
    // Requisição sem credencial não sai daqui nem para tomar 401.
    expect(chamadas).toHaveLength(0);
  });

  it("as fotos podem faltar sem levar o resto junto", async () => {
    responderCom({
      "/ocorrencias/": resposta(DOSSIE),
      "/evidencias/ocorrencia/": new Error("Network request failed"),
    });

    const r = await buscarHistoricoDaCasa("token-de-mentira", "oc-1");

    /*
      O contrário da regra acima, e de propósito: aqui a ausência de fotografia
      é dita ao lado de uma vistoria anterior que a tela MOSTRA, então não há
      omissão que engane ninguém.
    */
    expect(r.estado).toBe("chegou");
    if (r.estado !== "chegou") return;
    expect(r.historico.fotosDeAntes).toEqual([]);
    expect(r.historico.vistoriaAnterior?.agente_nome).toBe("Carlos de exemplo");
  });

  it("listas ausentes no corpo viram listas vazias, e não um estouro na tela", async () => {
    /*
      O aplicativo em campo é a ponta que menos pode estourar. Um servidor mais
      velho, ou um intermediário que pode o corpo, não pode derrubar a tela por
      onde o produto existe com "cannot read length of undefined".
    */
    responderCom({
      "/ocorrencias/": resposta({ vistoria: null }),
      "/evidencias/ocorrencia/": resposta({}),
    });

    const r = await buscarHistoricoDaCasa("token-de-mentira", "oc-1");

    expect(r.estado).toBe("chegou");
    if (r.estado !== "chegou") return;
    expect(r.historico.providencias).toEqual([]);
    expect(r.historico.vinculadas).toEqual([]);
    expect(r.historico.fotosDeAntes).toEqual([]);
    expect(historicoTemConteudo(r.historico)).toBe(false);
  });
});

describe("tem alguma coisa para contar?", () => {
  const VAZIO: HistoricoDaCasa = {
    vistoriaAnterior: null, providencias: [], vinculadas: [],
    devolucao: null, fotosDeAntes: [],
  };

  it("nada é nada: o cartão não existe", () => {
    expect(historicoTemConteudo(VAZIO)).toBe(false);
  });

  it("qualquer um dos cinco, sozinho, já é motivo de cartão", () => {
    /*
      Um a um, e não "um deles": foi assim que uma lista de condições perdeu um
      ramo em silêncio neste repositório. Se alguém apagar uma das cinco
      cláusulas do `||`, exatamente um caso aqui reprova e diz qual.
    */
    expect(historicoTemConteudo({ ...VAZIO, vistoriaAnterior: DOSSIE.vistoria })).toBe(true);
    expect(historicoTemConteudo({ ...VAZIO, providencias: DOSSIE.providencias })).toBe(true);
    expect(historicoTemConteudo({ ...VAZIO, vinculadas: DOSSIE.vinculadas })).toBe(true);
    expect(historicoTemConteudo({ ...VAZIO, devolucao: DOSSIE.devolucao })).toBe(true);
    expect(historicoTemConteudo({ ...VAZIO, fotosDeAntes: EVIDENCIAS.itens })).toBe(true);
  });
});
