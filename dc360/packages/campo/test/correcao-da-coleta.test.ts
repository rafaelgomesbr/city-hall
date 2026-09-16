import { describe, expect, it, vi } from "vitest";
import type { EnvelopeSincronizacao } from "@dc360/shared";
import {
  CODIGO_ARQUIVO_SUMIU,
  FalhaPermanente,
  conferirColeta,
  criarFilaDeSincronizacao,
  depositoSobreChaveValor,
  lojaEmMemoria,
  recusaEstaNoDado,
  transporteHttp,
  type Arquivos,
  type AutorDaColeta,
  type FotoLocal,
  type Transporte,
} from "../src/index.js";

/**
 * A VISTORIA 000009/2026 DE 15/09/2026, e as pontas soltas que ela expôs.
 *
 * O agente concluiu no iPhone: 6 de 6 itens do checklist, 1 fotografia,
 * assinada, GPS com 11 m. A tela disse "ela sobe sozinha". A fila pediu a
 * autorização da fotografia três vezes e o servidor respondeu 422 três vezes,
 * porque a fotografia foi enfileirada com `tamanhoBytes: 0` (o `size` do
 * `expo-file-system` veio zerado e o aplicativo mandou o zero adiante). A
 * assinatura, que viria depois, iria com `idempotencyKey: "<uuid>-assinatura"`,
 * que não é UUID. O cartão da fila mostrou "Precisa de atenção", "Alguns campos
 * precisam ser corrigidos", "Tentar de novo" e "Descartar". Nenhum campo, nenhum
 * botão de corrigir, e a faixa do topo dizendo "Tudo sincronizado".
 *
 * As palavras do dono: "o ideal é nem deixar ir pra fila de envio"; "cadê o
 * botão de editar? só tem de descartar"; "o tentar novamente ali não faz
 * sentido algum"; "faz um app sem pontas soltas".
 *
 * Quatro coisas ficam fixadas aqui, no motor, onde têm teste sem aparelho:
 *
 * 1. `conferirColeta` reprova ANTES de enfileirar exatamente o que o servidor
 *    reprovaria, com o mesmo esquema e as mesmas frases.
 * 2. O dreno mede o arquivo de verdade antes de pedir autorização, e zero é
 *    arquivo perdido (o caminho que já existia), nunca um número enviado.
 * 3. `retirarParaCorrecao` devolve a coleta inteira para virar rascunho de
 *    novo, sem perder nada se a gravação do rascunho falhar.
 * 4. O transporte guarda os `campos` do 422 também na rota do envelope.
 */

const MOMENTO = new Date("2026-09-15T21:00:00.000Z");
const CHAVE = "11111111-1111-4111-8111-000000000009";
const OCORRENCIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHAVE_DA_FOTO = "ffffffff-1111-4111-8111-000000000001";
const CHAVE_DA_ASSINATURA = "ffffffff-2222-4222-8222-000000000002";

const AGENTE: AutorDaColeta = {
  usuarioId: "u-klaus", nome: "Klaus Berger", organizacaoId: "org-serra-alta",
};
const OUTRO: AutorDaColeta = {
  usuarioId: "u-ana", nome: "Ana Ribeiro", organizacaoId: "org-serra-alta",
};

function envelope(): EnvelopeSincronizacao {
  return {
    idempotencyKey: CHAVE,
    ocorrenciaId: OCORRENCIA,
    coletadaEm: MOMENTO.toISOString(),
    vistoria: {
      checklist: [
        { chave: "risco_iminente", resposta: true },
        { chave: "evacuacao_necessaria", resposta: false },
        { chave: "interdicao_indicada", resposta: true },
        { chave: "acionar_outro_orgao", resposta: false },
        { chave: "danos_estruturais", resposta: true },
        { chave: "acesso_comprometido", resposta: false },
      ],
      fotos: [],
      coordenada: { lat: -27.595378, lng: -48.54805 },
      gpsPrecisaoMetros: 11,
      assinanteNome: "Klaus",
      assinaturaChave: null,
      coletadaEm: MOMENTO.toISOString(),
      observacoes: "Trinca no muro dos fundos.",
      desalojados: 2,
    },
  };
}

function foto(mudanca: Partial<FotoLocal> = {}): FotoLocal {
  return {
    idempotencyKey: CHAVE_DA_FOTO,
    uriLocal: "file:///documentos/foto-1.jpg",
    nomeArquivo: "vistoria-000009-2026-1.jpg",
    tipoConteudo: "image/jpeg",
    tamanhoBytes: 812_345,
    capturadaEm: MOMENTO.toISOString(),
    coordenada: { lat: -27.595378, lng: -48.54805 },
    ordem: 0,
    ...mudanca,
  };
}

function assinatura(mudanca: Partial<FotoLocal> = {}): FotoLocal {
  return {
    idempotencyKey: CHAVE_DA_ASSINATURA,
    uriLocal: "file:///documentos/assinatura-1.png",
    nomeArquivo: "assinatura-000009-2026.png",
    tipoConteudo: "image/png",
    tamanhoBytes: 4_096,
    capturadaEm: MOMENTO.toISOString(),
    legenda: "Assinatura de quem estava no local",
    ordem: 1,
    ...mudanca,
  };
}

/* ========================================================================
   1. A conferência antes de enfileirar
   ======================================================================== */

describe("conferirColeta, a conferência que o aparelho faz antes de enfileirar", () => {
  it("aprova a coleta boa", () => {
    const r = conferirColeta({
      envelope: envelope(), fotos: [foto()], assinatura: assinatura(),
    });
    expect(r).toEqual({ aprovada: true });
  });

  it("reprova a vistoria de hoje: foto com tamanho zero e assinatura com chave fora de UUID", () => {
    const r = conferirColeta({
      envelope: envelope(),
      fotos: [foto({ tamanhoBytes: 0 })],
      assinatura: assinatura({ idempotencyKey: `${CHAVE}-assinatura` }),
    });

    expect(r.aprovada).toBe(false);
    if (r.aprovada) return;
    // Cada campo com o CAMINHO até o arquivo, e não só o nome do campo: com
    // três fotos vazias, "tamanhoBytes" três vezes não diz qual abrir.
    expect(r.campos.map((c) => c.campo)).toEqual([
      "fotos.0.tamanhoBytes",
      "assinatura.idempotencyKey",
    ]);
    // As frases são as do esquema compartilhado, em português.
    expect(r.campos[0]!.mensagem).toMatch(/vazio|não conseguiu medir/);
    expect(r.campos[1]!.mensagem).toMatch(/UUID/);
    for (const c of r.campos) expect(c.mensagem).not.toMatch(/Invalid|greater than/i);
  });

  it("reprova o envelope com o mesmo esquema do servidor, com o prefixo dele", () => {
    const semAssinante = envelope();
    semAssinante.vistoria.assinanteNome = "";
    const r = conferirColeta({ envelope: semAssinante, fotos: [foto()] });

    expect(r.aprovada).toBe(false);
    if (r.aprovada) return;
    expect(r.campos).toEqual([
      { campo: "vistoria.assinanteNome", mensagem: "Informe quem assinou" },
    ]);
  });

  it("a assinatura é opcional na conferência, como é no envelope", () => {
    expect(conferirColeta({ envelope: envelope(), fotos: [] })).toEqual({ aprovada: true });
  });
});

/* ========================================================================
   2. O dreno mede o arquivo de verdade
   ======================================================================== */

function arquivosCom(conteudo: Record<string, Uint8Array>): Arquivos {
  return {
    async ler(uri: string) {
      const bytes = conteudo[uri];
      if (!bytes) {
        throw new FalhaPermanente("Arquivo não está mais no aparelho.", CODIGO_ARQUIVO_SUMIU);
      }
      return bytes;
    },
  };
}

function montar(opcoes: {
  arquivos: Arquivos;
  sessao?: () => AutorDaColeta | null;
}) {
  const loja = lojaEmMemoria();
  const autorizacoes: Array<{ idempotencyKey: string; tamanhoBytes: number }> = [];
  const enviados: EnvelopeSincronizacao[] = [];
  const bytesEnviados: number[] = [];
  const transporte: Transporte = {
    enviar: async (e) => { enviados.push(e); return { vistoriaId: "v1", duplicada: false }; },
    devolver: async () => { throw new Error("devolver não esperado"); },
    autorizarFoto: async ({ foto: f }) => {
      autorizacoes.push({ idempotencyKey: f.idempotencyKey, tamanhoBytes: f.tamanhoBytes });
      return {
        evidenciaId: `ev-${f.idempotencyKey}`, chave: `tenant/org/${f.idempotencyKey}`,
        url: "http://127.0.0.1/upload", cabecalhos: {}, jaEnviada: false,
      };
    },
    enviarBytes: async (_url, _cab, corpo) => { bytesEnviados.push(corpo.length); },
    confirmarFoto: async () => undefined,
  };
  let instante = MOMENTO.getTime();
  const fila = criarFilaDeSincronizacao({
    deposito: depositoSobreChaveValor(loja),
    transporte,
    sessaoAtual: opcoes.sessao ?? (() => AGENTE),
    agora: () => new Date(instante),
    dormir: async () => undefined,
    ruido: () => 0.5,
    arquivos: opcoes.arquivos,
  });
  return { fila, autorizacoes, enviados, bytesEnviados, avancar: (ms: number) => { instante += ms; } };
}

describe("o dreno mede o arquivo antes de pedir autorização", () => {
  it("o tamanho que vai ao servidor é o dos bytes lidos, e não o que a coleta gravou", async () => {
    /*
      A coleta gravou 0 (o `size` do aparelho veio zerado) e o arquivo tem
      812.345 bytes de verdade. O que o servidor confere é o número da
      autorização contra o objeto que chegou: mandar o número gravado seria
      pedir a recusa, e mandar o número medido é o único que pode bater.
    */
    const conteudo = new Uint8Array(812_345);
    const { fila, autorizacoes, bytesEnviados, enviados } = montar({
      arquivos: arquivosCom({ "file:///documentos/foto-1.jpg": conteudo }),
    });
    await fila.enfileirar(envelope(), {
      protocolo: "000009/2026", fotos: [foto({ tamanhoBytes: 0 })],
    });

    await fila.drenar();

    expect(autorizacoes).toEqual([{ idempotencyKey: CHAVE_DA_FOTO, tamanhoBytes: 812_345 }]);
    expect(bytesEnviados).toEqual([812_345]);
    expect(enviados).toHaveLength(1);
    // E o item guarda o tamanho medido, para a tela e o envelope concordarem.
    const [item] = await fila.itens();
    expect(item!.fotos[0]!.tamanhoBytes).toBe(812_345);
  });

  it("arquivo de zero bytes é arquivo perdido, e cai no caminho que já existe", async () => {
    const { fila, bytesEnviados } = montar({
      arquivos: arquivosCom({ "file:///documentos/foto-1.jpg": new Uint8Array(0) }),
    });
    await fila.enfileirar(envelope(), { protocolo: "000009/2026", fotos: [foto()] });

    const r = await fila.drenar();

    // Zero bytes nunca sobem: nem como arquivo, nem como número.
    expect(bytesEnviados).toEqual([]);
    expect(r.bloqueados).toBe(1);
    const [item] = await fila.itens();
    expect(item!.estado).toBe("bloqueado");
    expect(item!.ultimaFalha?.codigo).toBe(CODIGO_ARQUIVO_SUMIU);
    expect(item!.fotos[0]!.perdida).toBe(true);
  });

  it("arquivo que sumiu pergunta ao servidor antes de virar perda, e nunca manda bytes", async () => {
    /*
      A pergunta é o achado do revisor de integridade: a foto pode ter subido
      numa tentativa anterior e o arquivo local ter ido embora depois. Sem a
      consulta, ler antes de autorizar declararia perdida uma prova que o
      servidor já tem. Aqui o servidor NÃO tem (`jaEnviada: false`), então a
      marca de perda entra, e nenhum byte sai.
    */
    const { fila, autorizacoes, bytesEnviados } = montar({ arquivos: arquivosCom({}) });
    await fila.enfileirar(envelope(), { protocolo: "000009/2026", fotos: [foto()] });

    await fila.drenar();

    expect(autorizacoes).toEqual([{ idempotencyKey: CHAVE_DA_FOTO, tamanhoBytes: 812_345 }]);
    expect(bytesEnviados).toEqual([]);
    const [item] = await fila.itens();
    expect(item!.ultimaFalha?.codigo).toBe(CODIGO_ARQUIVO_SUMIU);
    expect(item!.fotos[0]!.perdida).toBe(true);
  });

  it("arquivo que sumiu com tamanho gravado zero não pergunta nada: não há o que o servidor ter", async () => {
    const { fila, autorizacoes } = montar({ arquivos: arquivosCom({}) });
    await fila.enfileirar(envelope(), {
      protocolo: "000009/2026", fotos: [foto({ tamanhoBytes: 0 })],
    });

    await fila.drenar();

    expect(autorizacoes).toEqual([]);
    const [item] = await fila.itens();
    expect(item!.ultimaFalha?.codigo).toBe(CODIGO_ARQUIVO_SUMIU);
  });
});

/* ========================================================================
   3. Corrigir a vistoria: a coleta volta a ser rascunho
   ======================================================================== */

/**
 * Uma fila com a coleta de hoje já parada por 422.
 *
 * A sessão é mutável de propósito: a fila do aplicativo é uma só e lê a sessão
 * viva, então a troca de turno no aparelho compartilhado é representada
 * trocando `sessao.atual`, e não recriando a fila.
 */
async function filaComColetaRecusada() {
  const loja = lojaEmMemoria();
  const sessao = { atual: AGENTE as AutorDaColeta | null };
  const transporte: Transporte = {
    enviar: async () => { throw new Error("não chega ao envelope"); },
    devolver: async () => { throw new Error("devolver não esperado"); },
    autorizarFoto: async () => {
      throw new FalhaPermanente(
        "Alguns campos precisam ser corrigidos.",
        "dados_invalidos",
        [{ campo: "tamanhoBytes", mensagem: "O arquivo está vazio ou o aparelho não conseguiu medir o tamanho dele." }],
      );
    },
    enviarBytes: async () => undefined,
    confirmarFoto: async () => undefined,
  };
  const fila = criarFilaDeSincronizacao({
    deposito: depositoSobreChaveValor(loja),
    transporte,
    sessaoAtual: () => sessao.atual,
    agora: () => MOMENTO,
    dormir: async () => undefined,
    ruido: () => 0.5,
    arquivos: { ler: async () => new Uint8Array([1, 2, 3]) },
  });
  await fila.enfileirar(envelope(), {
    protocolo: "000009/2026", fotos: [foto()], assinatura: assinatura(),
  });
  await fila.drenar();
  const [item] = await fila.itens();
  expect(item!.estado).toBe("bloqueado");
  return { fila, sessao };
}

describe("retirarParaCorrecao", () => {
  it("devolve a coleta inteira e tira o item da fila", async () => {
    const { fila } = await filaComColetaRecusada();
    const guardar = vi.fn(async () => undefined);

    const r = await fila.retirarParaCorrecao(CHAVE, guardar);

    expect(r.retirada).toBe(true);
    if (!r.retirada) return;
    // O envelope como foi enfileirado, com a mesma chave para o servidor
    // reconhecer o reenvio, e os arquivos com as URIs locais que a fila guardou.
    expect(r.coleta.envelope.idempotencyKey).toBe(CHAVE);
    expect(r.coleta.envelope.vistoria.observacoes).toBe("Trinca no muro dos fundos.");
    expect(r.coleta.protocolo).toBe("000009/2026");
    expect(r.coleta.fotos.map((f) => [f.papel, f.uriLocal, f.idempotencyKey])).toEqual([
      ["foto", "file:///documentos/foto-1.jpg", CHAVE_DA_FOTO],
      ["assinatura", "file:///documentos/assinatura-1.png", CHAVE_DA_ASSINATURA],
    ]);
    // A recusa vai junto: a tela de vistoria mostra o que o servidor apontou.
    expect(r.coleta.ultimaFalha?.campos).toEqual([
      { campo: "tamanhoBytes", mensagem: "O arquivo está vazio ou o aparelho não conseguiu medir o tamanho dele." },
    ]);
    // Quem guarda o rascunho recebeu a MESMA coleta, antes de a fila largar.
    expect(guardar).toHaveBeenCalledWith(r.coleta);
    expect(await fila.itens()).toEqual([]);
    expect((await fila.resumo()).bloqueados).toBe(0);
  });

  it("se guardar o rascunho falhar, a coleta continua na fila: nada se perde", async () => {
    const { fila } = await filaComColetaRecusada();

    await expect(
      fila.retirarParaCorrecao(CHAVE, async () => { throw new Error("disco cheio"); }),
    ).rejects.toThrow("disco cheio");

    const [item] = await fila.itens();
    expect(item?.estado).toBe("bloqueado");
  });

  it("não retira coleta que ainda vai sair sozinha", async () => {
    const loja = lojaEmMemoria();
    const fila = criarFilaDeSincronizacao({
      deposito: depositoSobreChaveValor(loja),
      transporte: {
        enviar: async () => ({ vistoriaId: "v", duplicada: false }),
        devolver: async () => { throw new Error("x"); },
        autorizarFoto: async () => { throw new Error("x"); },
        enviarBytes: async () => undefined,
        confirmarFoto: async () => undefined,
      },
      sessaoAtual: () => AGENTE,
      agora: () => MOMENTO,
    });
    await fila.enfileirar(envelope(), { protocolo: "000009/2026" });
    const guardar = vi.fn(async () => undefined);

    const r = await fila.retirarParaCorrecao(CHAVE, guardar);

    expect(r).toEqual({ retirada: false, motivo: "nao_esta_parada" });
    expect(guardar).not.toHaveBeenCalled();
    expect(await fila.itens()).toHaveLength(1);
  });

  it("não retira coleta de outro agente: o rascunho seria concluído com o nome errado", async () => {
    const { fila, sessao } = await filaComColetaRecusada();
    sessao.atual = OUTRO;
    const guardar = vi.fn(async () => undefined);

    const r = await fila.retirarParaCorrecao(CHAVE, guardar);

    expect(r).toEqual({ retirada: false, motivo: "de_outro_autor" });
    expect(guardar).not.toHaveBeenCalled();
    expect(await fila.itens()).toHaveLength(1);
  });

  it("concluir de novo reusa a chave: enfileirar com a mesma chave é um item só", async () => {
    const { fila } = await filaComColetaRecusada();
    const r = await fila.retirarParaCorrecao(CHAVE, async () => undefined);
    expect(r.retirada).toBe(true);

    const deNovo = await fila.enfileirar(envelope(), {
      protocolo: "000009/2026", fotos: [foto({ tamanhoBytes: 812_345 })], assinatura: assinatura(),
    });

    expect(deNovo.id).toBe(CHAVE);
    expect(deNovo.estado).toBe("pendente");
    expect(deNovo.ultimaFalha).toBeNull();
    expect(await fila.itens()).toHaveLength(1);
  });
});

/* ========================================================================
   3b. A porta que a sondagem do revisor achou: mesma chave, envelope diferente
   ======================================================================== */

describe("enfileirar com a chave de uma coleta que já está na fila", () => {
  it("com o MESMO conteúdo devolve o item que já existe (o toque repetido)", async () => {
    const { fila } = montar({ arquivos: arquivosCom({}) });
    const primeiro = await fila.enfileirar(envelope(), { protocolo: "000009/2026" });
    const segundo = await fila.enfileirar(envelope(), { protocolo: "000009/2026" });
    expect(segundo.id).toBe(primeiro.id);
    expect(await fila.itens()).toHaveLength(1);
  });

  it("com conteúdo DIFERENTE recusa com erro nomeado, em vez de descartar a versão nova em silêncio", async () => {
    /*
      A sondagem do revisor de integridade provou o caminho: `enfileirar` com
      chave existente devolvia o item antigo e jogava fora o envelope novo sem
      uma palavra, e a tela dizia "Vistoria guardada" sobre a versão que não
      foi guardada. `refazerVistoria` reusa a chave do rascunho preso, então o
      caminho existia. Corrigir pela fila tira o item antes de reabrir e não
      cai aqui; esta é a porta fechada para o resto.
    */
    const { fila } = montar({ arquivos: arquivosCom({}) });
    await fila.enfileirar(envelope(), { protocolo: "000009/2026" });
    const corrigido = envelope();
    corrigido.vistoria.observacoes = "Trinca no muro dos fundos, e no da frente.";

    const erro = await fila.enfileirar(corrigido, { protocolo: "000009/2026" })
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(FalhaPermanente);
    expect((erro as FalhaPermanente).codigo).toBe("chave_em_uso");
    expect((erro as FalhaPermanente).message).toMatch(/já está na fila/);
    // A versão que estava na fila continua lá, intacta.
    const [item] = await fila.itens();
    expect(item!.envelope?.vistoria.observacoes).toBe("Trinca no muro dos fundos.");
  });

  it("com os mesmos dados e arquivos diferentes também recusa: arquivo é conteúdo", async () => {
    const { fila } = montar({ arquivos: arquivosCom({}) });
    await fila.enfileirar(envelope(), { protocolo: "000009/2026", fotos: [foto()] });

    const erro = await fila.enfileirar(envelope(), {
      protocolo: "000009/2026",
      fotos: [foto(), foto({ idempotencyKey: "ffffffff-9999-4999-8999-000000000009", ordem: 1 })],
    }).catch((e: unknown) => e);

    expect((erro as FalhaPermanente).codigo).toBe("chave_em_uso");
  });
});

/* ========================================================================
   3c. O arquivo que sumiu daqui mas o servidor já tem
   ======================================================================== */

describe("arquivo ausente no aparelho que o servidor já confirmou", () => {
  it("não vira perda: o servidor responde jaEnviada e a foto entra no envelope", async () => {
    /*
      A ordem nova (ler antes de autorizar) não pode custar isto: a foto subiu
      numa tentativa anterior, o envelope falhou depois, e o arquivo local se
      foi. Antes de declarar perda, o dreno pergunta ao servidor pela mesma
      chave; se ele já tem os bytes, não há o que perder.
    */
    const loja = lojaEmMemoria();
    const enviados: EnvelopeSincronizacao[] = [];
    const fila = criarFilaDeSincronizacao({
      deposito: depositoSobreChaveValor(loja),
      transporte: {
        enviar: async (e) => { enviados.push(e); return { vistoriaId: "v", duplicada: false }; },
        devolver: async () => { throw new Error("x"); },
        autorizarFoto: async ({ foto: f }) => ({
          evidenciaId: "ev-1", chave: `tenant/org/${f.idempotencyKey}`,
          url: "", cabecalhos: {}, jaEnviada: true,
        }),
        enviarBytes: async () => { throw new Error("não deveria mandar bytes"); },
        confirmarFoto: async () => undefined,
      },
      sessaoAtual: () => AGENTE,
      agora: () => MOMENTO,
      dormir: async () => undefined,
      ruido: () => 0.5,
      arquivos: arquivosCom({}),
    });
    await fila.enfileirar(envelope(), { protocolo: "000009/2026", fotos: [foto()] });

    const r = await fila.drenar();

    expect(r.enviados).toBe(1);
    expect(r.bloqueados).toBe(0);
    expect(enviados[0]!.vistoria.fotos.map((f) => f.chave)).toEqual([`tenant/org/${CHAVE_DA_FOTO}`]);
    const [item] = await fila.itens();
    expect(item!.fotos[0]!.enviada).toBe(true);
    expect(item!.fotos[0]!.perdida).toBe(false);
  });
});

/* ========================================================================
   4. O que a recusa significa, dito pelo motor
   ======================================================================== */

describe("recusaEstaNoDado", () => {
  it("422 com campos e arquivo perdido são recusas do DADO: corrigir resolve, repetir não", () => {
    expect(recusaEstaNoDado({
      codigo: "dados_invalidos", mensagem: "x", campos: [], permanente: true, em: "",
    })).toBe(true);
    expect(recusaEstaNoDado({
      codigo: CODIGO_ARQUIVO_SUMIU, mensagem: "x", campos: [], permanente: true, em: "",
    })).toBe(true);
  });

  it("sessão encerrada e ocorrência não encontrada não são do dado: repetir pode resolver", () => {
    expect(recusaEstaNoDado({
      codigo: "sem_sessao", mensagem: "x", campos: [], permanente: true, em: "",
    })).toBe(false);
    expect(recusaEstaNoDado({
      codigo: "nao_encontrada", mensagem: "x", campos: [], permanente: true, em: "",
    })).toBe(false);
    expect(recusaEstaNoDado(null)).toBe(false);
  });
});

/* ========================================================================
   5. O transporte guarda os campos do 422 nas DUAS rotas
   ======================================================================== */

describe("o transporte guarda os campos do 422", () => {
  function transporteQueResponde(corpo: unknown) {
    const buscar = vi.fn(async () => ({ ok: false, status: 422, json: async () => corpo }));
    return transporteHttp({
      baseUrl: "http://api.exemplo",
      obterToken: async () => "token",
      buscar: buscar as unknown as typeof fetch,
    });
  }
  const CORPO_422 = {
    erro: "dados_invalidos",
    mensagem: "Alguns campos precisam ser corrigidos.",
    campos: [{ campo: "tamanhoBytes", mensagem: "O arquivo está vazio." }],
  };

  it("na autorização do arquivo", async () => {
    const t = transporteQueResponde(CORPO_422);
    const erro = await t.autorizarFoto({ ocorrenciaId: OCORRENCIA, foto: foto() }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(FalhaPermanente);
    expect((erro as FalhaPermanente).campos).toEqual(CORPO_422.campos);
  });

  it("no envio do envelope, que jogava a lista fora", async () => {
    const t = transporteQueResponde({
      ...CORPO_422,
      campos: [{ campo: "vistoria.assinanteNome", mensagem: "Informe quem assinou" }],
    });
    const erro = await t.enviar(envelope()).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(FalhaPermanente);
    expect((erro as FalhaPermanente).codigo).toBe("dados_invalidos");
    expect((erro as FalhaPermanente).campos).toEqual([
      { campo: "vistoria.assinanteNome", mensagem: "Informe quem assinou" },
    ]);
  });
});
