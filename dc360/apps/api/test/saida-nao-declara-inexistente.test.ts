import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { armazenamentoS3 } from "../src/armazenamento/s3.js";
import type { Armazenamento } from "../src/armazenamento/tipos.js";
import { montarPacoteDeSaida, relatorioDePendencias } from "../src/saida/pacote.js";

/**
 * O pacote de saída não pode DECLARAR inexistente o que ele apenas não
 * conseguiu ler.
 *
 * O defeito era de duas metades, e cada uma sozinha já bastava. A primeira, em
 * `armazenamento/s3.ts`: `baixar` fazia `.catch(() => null)` e devolvia `null`
 * tanto para o 404 quanto para erro de rede, DNS, conexão cortada, 429 de
 * limite de taxa e 503 do provedor, e sem tempo limite nenhum. A segunda, em
 * `saida/pacote.ts`: esse `null` virava uma linha impressa sob o texto "O banco
 * referia estes arquivos e eles NÃO foram encontrados no armazenamento", que é
 * uma afirmação sobre o mundo.
 *
 * O cenário: um município com três anos pede a saída, o pacote faz milhares de
 * GET assinados seguidos, e o provedor devolve 429 em quarenta deles. Quarenta
 * fotografias que EXISTEM saem declaradas inexistentes, com soma de verificação
 * ao lado dando aparência de conferência feita. E o passo 6 do procedimento (a
 * eliminação das nossas cópias) vem depois da conferência do município: quando
 * o erro aparecer, não haverá como voltar.
 *
 * É destruição de prova por engolir erro, no dia em que o produto está provando
 * que não aprisiona ninguém.
 */

const CONFIG_BASE = {
  endpoint: "https://conta.r2.cloudflarestorage.com",
  balde: "dc360-evidencias",
  regiao: "auto",
  credenciais: { chaveId: "AKIAEXEMPLO", chaveSecreta: "segredo-de-exemplo" },
  // Recuo instantâneo: o que se testa é a decisão, não a espera.
  esperar: async () => {},
};

type RespostaFalsa = { status: number; corpo?: string; erro?: Error };

/** `fetch` de mentira que devolve, em ordem, o que o caso mandar. */
function buscador(respostas: RespostaFalsa[]) {
  const chamadas: string[] = [];
  const buscar = (async (url: string) => {
    chamadas.push(String(url));
    const proxima = respostas[Math.min(chamadas.length - 1, respostas.length - 1)]!;
    if (proxima.erro) throw proxima.erro;
    return {
      ok: proxima.status >= 200 && proxima.status < 300,
      status: proxima.status,
      headers: new Headers({ "content-type": "image/jpeg" }),
      arrayBuffer: async () => new TextEncoder().encode(proxima.corpo ?? "bytes").buffer,
    };
  }) as unknown as typeof fetch;
  return { buscar, chamadas };
}

describe("Ler do armazenamento: nao existe e nao consegui ler sao respostas diferentes", () => {
  it("404 e a UNICA resposta que autoriza dizer que o arquivo nao existe", async () => {
    const { buscar, chamadas } = buscador([{ status: 404 }]);
    const s3 = armazenamentoS3({ ...CONFIG_BASE, buscar });

    expect(await s3.baixar("tenant/x/foto.jpg")).toEqual({ situacao: "ausente" });
    // E não insiste: o armazenamento já respondeu, e a resposta foi clara.
    expect(chamadas).toHaveLength(1);
  });

  it("429 do provedor NAO vira arquivo inexistente", async () => {
    /*
      Este é o caso reproduzido. Antes, as três tentativas (na verdade uma só)
      devolviam `null`, e o `null` era o mesmo do 404: a fotografia saía do
      pacote declarada inexistente por causa de um pico de limite de taxa.
    */
    const { buscar, chamadas } = buscador([{ status: 429 }]);
    const s3 = armazenamentoS3({ ...CONFIG_BASE, buscar });

    const resultado = await s3.baixar("tenant/x/foto.jpg");

    expect(
      resultado.situacao,
      "um 429 do provedor foi tratado como fotografia inexistente",
    ).toBe("falha");
    expect(resultado).toMatchObject({ tentativas: 3 });
    // E tentou de novo antes de desistir, que é o que resolve o caso comum.
    expect(chamadas).toHaveLength(3);
  });

  it("o que e transitorio e tentado de novo, e a segunda tentativa salva o arquivo", async () => {
    // O ponto do recuo: no pico de limite de taxa, a segunda ou a terceira
    // chamada passa, e a fotografia entra no pacote em vez de virar pendência.
    const { buscar, chamadas } = buscador([
      { status: 429 },
      { status: 503 },
      { status: 200, corpo: "os-bytes-da-fotografia" },
    ]);
    const s3 = armazenamentoS3({ ...CONFIG_BASE, buscar });

    const resultado = await s3.baixar("tenant/x/foto.jpg");
    expect(resultado.situacao).toBe("encontrado");
    expect(chamadas).toHaveLength(3);
  });

  it("cada tentativa e assinada de novo", async () => {
    /*
      A URL assinada vive sessenta segundos, e o recuo entre tentativas consome
      parte desse tempo. Assinar uma vez fora do laço faria a terceira
      tentativa morrer de expiração, ou seja, o próprio remédio produziria a
      falha que ele existe para tratar. O relógio avança um minuto por chamada
      para que a diferença apareça na assinatura.
    */
    const { buscar, chamadas } = buscador([
      { status: 429 }, { status: 429 }, { status: 200 },
    ]);
    let instante = new Date("2026-09-09T12:00:00Z").getTime();
    const s3 = armazenamentoS3({
      ...CONFIG_BASE,
      buscar,
      agora: () => { instante += 60_000; return new Date(instante); },
    });

    await s3.baixar("tenant/x/foto.jpg");
    expect(new Set(chamadas).size).toBe(3);
  });

  it("erro de rede NAO vira arquivo inexistente", async () => {
    const { buscar } = buscador([{ status: 0, erro: new Error("ECONNRESET") }]);
    const s3 = armazenamentoS3({ ...CONFIG_BASE, buscar });

    const resultado = await s3.baixar("tenant/x/foto.jpg");
    expect(resultado.situacao).toBe("falha");
    expect(resultado).toMatchObject({ motivo: expect.stringContaining("ECONNRESET") });
  });

  it("403 falha na hora, sem gastar tres tentativas", () => {
    // Credencial sem permissão, relógio fora de hora ou assinatura errada não
    // se resolvem tentando de novo: insistir só multiplica por três a chamada
    // que o provedor já recusou.
    const { buscar, chamadas } = buscador([{ status: 403 }]);
    const s3 = armazenamentoS3({ ...CONFIG_BASE, buscar });

    return s3.baixar("tenant/x/foto.jpg").then((resultado) => {
      expect(resultado.situacao).toBe("falha");
      expect(chamadas).toHaveLength(1);
    });
  });

  it("a leitura tem tempo limite, e o sinal chega ao fetch", async () => {
    /*
      Sem teto, o provedor que aceita a conexão e para de responder prende a
      montagem do pacote para sempre, com o administrador esperando e nada em
      log dizendo por quê. O duplo aqui só responde ao sinal de aborto: se ele
      não chegasse, este caso nunca terminaria.
    */
    const buscar = ((_url: string, o: { signal?: AbortSignal }) => new Promise((_, rejeitar) => {
      o.signal?.addEventListener("abort", () => rejeitar(new Error("aborted")));
    })) as unknown as typeof fetch;

    const s3 = armazenamentoS3({
      ...CONFIG_BASE, buscar, tempoLimiteMs: 40, tentativasDeLeitura: 1,
    });

    const resultado = await s3.baixar("tenant/x/foto.jpg");
    expect(resultado.situacao).toBe("falha");
  }, 10_000);
});

describe("O relatorio de pendencias diz a verdade sobre o que houve", () => {
  it("sem pendencia nenhuma, diz isso", () => {
    expect(relatorioDePendencias([], [])).toContain("Nenhuma pendência");
  });

  it("o que NAO FOI LIDO nunca aparece como nao encontrado", () => {
    const texto = relatorioDePendencias([], ["Fotografia NÃO LIDA: protocolo 000473/2026"]);

    expect(
      texto,
      "o pacote afirmou que o arquivo não existe quando só não conseguiu lê-lo",
    ).not.toContain("NÃO OS");
    expect(texto).toContain("NÃO\nRESPONDEU");
    // E manda parar antes do passo que não tem volta. Esta frase é a única
    // coisa que impede a perda depois da eliminação das nossas cópias.
    expect(texto).toContain("NÃO SIGA para o passo 6");
  });

  it("o que o armazenamento respondeu nao ter continua sendo pendencia normal", () => {
    const texto = relatorioDePendencias(["Fotografia ausente: chave x"], []);
    expect(texto).toContain("respondeu que NÃO OS");
    expect(texto).not.toContain("NÃO SIGA para o passo 6");
  });
});

describe("O pacote inteiro, com o armazenamento engasgado", () => {
  let mem: BancoEmMemoria;

  beforeAll(async () => {
    mem = await bancoEmMemoria({ semear: true });
  }, 180_000);

  afterAll(async () => {
    await mem?.banco.encerrar();
  });

  it("fotografia que nao pode ser lida nao sai declarada inexistente", async () => {
    /*
      A ponta a ponta do defeito. Um armazenamento que responde "não consegui"
      em tudo, que é o município de três anos batendo no limite de taxa do
      provedor, e o pacote precisa dizer isso com todas as letras.
    */
    const engasgado: Armazenamento = {
      urlParaEnviar: async () => { throw new Error("nao usado"); },
      urlParaLer: async () => "https://exemplo/nao-usado",
      descrever: async () => ({ existe: false, tamanhoBytes: null }),
      baixar: async () => ({
        situacao: "falha", motivo: "o armazenamento respondeu 429", tentativas: 3,
      }),
    };

    const organizacao = await mem.bruto.query<{ id: string }>(
      "SELECT id FROM organizacoes ORDER BY criado_em LIMIT 1",
    );
    const orgId = organizacao.rows[0]!.id;

    /*
      Uma evidência de verdade no banco, porque o defeito só existe quando o
      banco PROMETE um arquivo. Sem esta linha o pacote sairia sem pendência
      nenhuma e o caso passaria provando nada, que é a forma de erro que este
      arquivo inteiro existe para não repetir.
    */
    const vistoria = await mem.bruto.query<{ id: string; ocorrencia_id: string }>(
      "SELECT id, ocorrencia_id FROM vistorias WHERE organizacao_id = $1 LIMIT 1",
      [orgId],
    );
    const v = vistoria.rows[0]!;
    await mem.bruto.query(
      `INSERT INTO evidencias
         (organizacao_id, ocorrencia_id, vistoria_id, chave_storage, legenda,
          capturada_em, ordem, tipo_conteudo, tamanho_bytes, enviada_em)
       VALUES ($1,$2,$3,$4,'Talude nos fundos', now() - interval '25 hours', 0,
               'image/jpeg', 4321, now() - interval '22 hours')`,
      [orgId, v.ocorrencia_id, v.id, `tenant/${orgId}/ocorrencias/${v.ocorrencia_id}/talude.jpg`],
    );

    let relatorio = "";
    let indice = "";
    for await (const entrada of montarPacoteDeSaida({
      banco: mem.banco,
      armazenamento: engasgado,
      organizacaoId: orgId,
      emitidoPor: "Helena Vasques (administrador)",
    })) {
      const conteudo = Buffer.from(entrada.conteudo).toString("utf8");
      if (entrada.caminho === "PENDENCIAS-DA-EXTRACAO.txt") relatorio = conteudo;
      if (entrada.caminho === "INDICE.html") indice = conteudo;
    }

    // Âncora: se o município semeado não tiver evidência nenhuma, o caso
    // passaria provando nada.
    expect(relatorio, "o pacote saiu sem nenhuma pendência registrada")
      .not.toContain("Nenhuma pendência");

    expect(
      relatorio,
      "uma fotografia que o armazenamento não conseguiu entregar saiu declarada inexistente",
    ).not.toContain("respondeu que NÃO OS");
    expect(relatorio).toContain("NÃO LIDA");
    expect(relatorio).toContain("NÃO SIGA para o passo 6");
    expect(relatorio).toContain("429");

    // E o índice, que é a primeira coisa que alguém abre, avisa igual.
    expect(indice).toContain("NÃO siga para o passo 6");
  }, 180_000);
});
