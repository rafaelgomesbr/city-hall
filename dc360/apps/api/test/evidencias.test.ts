import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import {
  armazenamentoEmMemoria, type ArmazenamentoEmMemoria,
} from "../src/armazenamento/memoria.js";
import { assinarUrl, codificarRfc3986 } from "../src/armazenamento/assinatura.js";

/**
 * Evidência fotográfica, do pedido de autorização à leitura.
 *
 * A foto é a prova de uma vistoria de interdição, e ela mostra a casa e a rua
 * de uma família em situação de risco. Então o que estes testes conferem não é
 * "o upload funciona": é que o cliente não escolhe onde grava, que o arquivo
 * não vira link público, que uma prefeitura não alcança a foto de outra, e que
 * um metadado nunca fica apontando para arquivo que não chegou.
 */

const SENHA = "defesa-civil-2026";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let mem: BancoEmMemoria;
let app: FastifyInstance;
let armazenamento: ArmazenamentoEmMemoria;
let endereco: string;
let tokenAgente: string;
let tokenCoordenador: string;
let tokenOutroMunicipio: string;
let tokenAgenteDeFora: string;

async function entrar(email: string): Promise<string> {
  const r = await app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA } });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

function com(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function ocorrenciaEmCampo(endereco: string): Promise<string> {
  const criar = await app.inject({
    method: "POST", url: "/ocorrencias", headers: com(tokenCoordenador),
    payload: {
      solicitanteNome: "Moradora", canalEntrada: "telefone", endereco,
      tipo: "deslizamento", descricao: "Talude cedeu.",
    },
  });
  const id = criar.json().id;
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: com(tokenCoordenador),
    payload: { severidade: "alta", vulnerabilidadePresente: false },
  });
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/despacho`, headers: com(tokenCoordenador),
    payload: { equipeId: EQUIPE_ALFA, prazoHoras: 24 },
  });
  return id;
}

async function autorizar(ocorrenciaId: string, extras: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST", url: "/evidencias/autorizar-envio", headers: com(tokenAgente),
    payload: {
      ocorrenciaId,
      nomeArquivo: "IMG_0001.jpg",
      tipoConteudo: "image/png",
      tamanhoBytes: PIXEL_PNG.length,
      capturadaEm: new Date().toISOString(),
      legenda: "Trinca na parede dos fundos",
      ordem: 0,
      ...extras,
    },
  });
}

/** Envia os bytes pela URL assinada, como o aparelho faria. */
async function enviarBytes(url: string, cabecalhos: Record<string, string>, corpo = PIXEL_PNG) {
  const alvo = new URL(url);
  return app.inject({
    method: "PUT",
    url: alvo.pathname + alvo.search,
    headers: { ...cabecalhos, "content-length": String(corpo.length) },
    payload: corpo,
  });
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-evidencias-com-mais-de-32-bytes-ok",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);

  armazenamento = armazenamentoEmMemoria({ baseUrl: "http://api.local" });
  app = await construirServidor({ banco: mem.banco, config, armazenamento });
  await app.ready();
  endereco = "http://api.local";

  tokenAgente = await entrar("diego.alves@serraalta.exemplo.gov.br");
  tokenCoordenador = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
  tokenOutroMunicipio = await entrar("aurelio.machado@valefundo.exemplo.gov.br");
  tokenAgenteDeFora = await entrar("tarcisio.ramos@valefundo.exemplo.gov.br");
  void endereco;
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Autorização de envio", () => {
  it("o servidor decide a chave, e ela carrega o município e a ocorrência", async () => {
    const ocorrencia = await ocorrenciaEmCampo("Rua das Acácias, 245");
    const r = await autorizar(ocorrencia);

    expect(r.statusCode).toBe(201);
    const { chave, url, cabecalhos } = r.json();

    expect(chave).toMatch(
      new RegExp(`^tenant/[0-9a-f-]{36}/ocorrencias/${ocorrencia}/`),
    );
    // Nome original preservado como sufixo, com prefixo único: duas fotos
    // chamadas IMG_0001.jpg não podem sobrescrever uma à outra.
    expect(chave.endsWith("IMG_0001.jpg")).toBe(true);
    expect(url).toContain("assinatura=");
    expect(cabecalhos["content-length"]).toBe(String(PIXEL_PNG.length));
  }, 60_000);

  it("não autoriza envio para ocorrência de outro município", async () => {
    const ocorrencia = await ocorrenciaEmCampo("Rua do Sol, 10");

    // Agente do OUTRO município, e não o coordenador de lá: o coordenador
    // levaria 403 por falta de permissão, e o 403 esconderia o que este teste
    // existe para provar, que é o isolamento entre prefeituras.
    const r = await app.inject({
      method: "POST", url: "/evidencias/autorizar-envio",
      headers: com(tokenAgenteDeFora),
      payload: {
        ocorrenciaId: ocorrencia, nomeArquivo: "a.jpg", tipoConteudo: "image/png",
        tamanhoBytes: 100, capturadaEm: new Date().toISOString(),
      },
    });

    // 404 e não 403: confirmar que a ocorrência existe já seria vazamento.
    expect(r.statusCode).toBe(404);
    const nada = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM evidencias WHERE ocorrencia_id = $1", [ocorrencia],
    );
    expect(nada.rows[0]!.n).toBe("0");
  }, 60_000);

  it("recusa tipo fora da lista e tamanho acima do teto", async () => {
    const ocorrencia = await ocorrenciaEmCampo("Rua da Pedra, 5");

    const tipoRuim = await autorizar(ocorrencia, { tipoConteudo: "application/pdf" });
    expect(tipoRuim.statusCode).toBe(422);

    const grandeDemais = await autorizar(ocorrencia, { tamanhoBytes: 20 * 1024 * 1024 });
    expect(grandeDemais.statusCode).toBe(422);
  }, 60_000);

  it("coordenador não autoriza envio: quem coleta em campo é o agente", async () => {
    const ocorrencia = await ocorrenciaEmCampo("Rua do Campo, 7");
    const r = await app.inject({
      method: "POST", url: "/evidencias/autorizar-envio", headers: com(tokenCoordenador),
      payload: {
        ocorrenciaId: ocorrencia, nomeArquivo: "a.jpg", tipoConteudo: "image/png",
        tamanhoBytes: 100, capturadaEm: new Date().toISOString(),
      },
    });
    expect(r.statusCode).toBe(403);
  }, 60_000);
});

describe("Envio e confirmação", () => {
  it("fluxo completo: autoriza, envia, confirma e lê de volta", async () => {
    const ocorrencia = await ocorrenciaEmCampo("Travessa do Morro, 12");
    const autorizacao = (await autorizar(ocorrencia)).json();

    const envio = await enviarBytes(autorizacao.url, autorizacao.cabecalhos);
    expect(envio.statusCode).toBe(200);

    const confirmacao = await app.inject({
      method: "POST", url: "/evidencias/confirmar-envio", headers: com(tokenAgente),
      payload: { evidenciaId: autorizacao.evidenciaId },
    });
    expect(confirmacao.statusCode).toBe(200);
    expect(confirmacao.json().confirmada).toBe(true);

    const leitura = await app.inject({
      method: "GET", url: `/evidencias/${autorizacao.evidenciaId}/url`,
      headers: com(tokenCoordenador),
    });
    expect(leitura.statusCode).toBe(200);

    const alvo = new URL(leitura.json().url);
    const bytes = await app.inject({ method: "GET", url: alvo.pathname + alvo.search });
    expect(bytes.statusCode).toBe(200);
    expect(bytes.rawPayload.equals(PIXEL_PNG), "o conteúdo lido é o que subiu").toBe(true);
  }, 60_000);

  it("não confirma o que não chegou ao armazenamento", async () => {
    const ocorrencia = await ocorrenciaEmCampo("Rua Seca, 1");
    const autorizacao = (await autorizar(ocorrencia)).json();

    // O aparelho diz que enviou, mas não enviou: acontece quando o envio falha
    // e a confirmação sai mesmo assim por bug de retentativa.
    const r = await app.inject({
      method: "POST", url: "/evidencias/confirmar-envio", headers: com(tokenAgente),
      payload: { evidenciaId: autorizacao.evidenciaId },
    });

    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toBe("arquivo_ausente");

    const linha = await mem.bruto.query<{ enviada_em: string | null }>(
      "SELECT enviada_em FROM evidencias WHERE id = $1", [autorizacao.evidenciaId],
    );
    expect(linha.rows[0]!.enviada_em, "não pode marcar como enviada").toBeNull();
  }, 60_000);

  it("recusa quando o arquivo que chegou tem tamanho diferente do autorizado", async () => {
    const ocorrencia = await ocorrenciaEmCampo("Rua Torta, 2");
    const autorizacao = (await autorizar(ocorrencia)).json();

    // Passa por fora da URL assinada e grava algo maior, para simular um
    // objeto divergente no armazenamento.
    armazenamento.guardar(autorizacao.chave, Buffer.alloc(9999, 1), "image/png");

    const r = await app.inject({
      method: "POST", url: "/evidencias/confirmar-envio", headers: com(tokenAgente),
      payload: { evidenciaId: autorizacao.evidenciaId },
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toBe("tamanho_divergente");
  }, 60_000);

  it("confirmar duas vezes é inofensivo", async () => {
    const ocorrencia = await ocorrenciaEmCampo("Rua Dupla, 3");
    const autorizacao = (await autorizar(ocorrencia)).json();
    await enviarBytes(autorizacao.url, autorizacao.cabecalhos);

    const primeira = await app.inject({
      method: "POST", url: "/evidencias/confirmar-envio", headers: com(tokenAgente),
      payload: { evidenciaId: autorizacao.evidenciaId },
    });
    const segunda = await app.inject({
      method: "POST", url: "/evidencias/confirmar-envio", headers: com(tokenAgente),
      payload: { evidenciaId: autorizacao.evidenciaId },
    });

    expect(primeira.json().jaEstava).toBe(false);
    expect(segunda.statusCode).toBe(200);
    expect(segunda.json().jaEstava).toBe(true);
  }, 60_000);

  it("foto que ainda não subiu não devolve link de leitura", async () => {
    const ocorrencia = await ocorrenciaEmCampo("Rua Pendente, 4");
    const autorizacao = (await autorizar(ocorrencia)).json();

    const r = await app.inject({
      method: "GET", url: `/evidencias/${autorizacao.evidenciaId}/url`,
      headers: com(tokenAgente),
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toBe("envio_pendente");
  }, 60_000);
});

describe("A URL não é pública", () => {
  it("sem assinatura, o armazenamento recusa", async () => {
    const ocorrencia = await ocorrenciaEmCampo("Rua Aberta, 6");
    const autorizacao = (await autorizar(ocorrencia)).json();
    await enviarBytes(autorizacao.url, autorizacao.cabecalhos);

    const semAssinatura = await app.inject({
      method: "GET",
      url: `/armazenamento/objeto?chave=${codificarRfc3986(autorizacao.chave)}`,
    });
    expect(semAssinatura.statusCode).toBe(403);
  }, 60_000);

  it("assinatura adulterada é recusada", async () => {
    const ocorrencia = await ocorrenciaEmCampo("Rua Falsa, 8");
    const autorizacao = (await autorizar(ocorrencia)).json();
    await enviarBytes(autorizacao.url, autorizacao.cabecalhos);

    const leitura = await app.inject({
      method: "GET", url: `/evidencias/${autorizacao.evidenciaId}/url`,
      headers: com(tokenAgente),
    });
    // Nem sobe: precisa confirmar antes. Confirma e tenta de novo.
    expect(leitura.statusCode).toBe(409);

    await app.inject({
      method: "POST", url: "/evidencias/confirmar-envio", headers: com(tokenAgente),
      payload: { evidenciaId: autorizacao.evidenciaId },
    });
    const boa = await app.inject({
      method: "GET", url: `/evidencias/${autorizacao.evidenciaId}/url`,
      headers: com(tokenAgente),
    });
    const alvo = new URL(boa.json().url);

    // Troca a assinatura por outra qualquer, do mesmo tamanho.
    alvo.searchParams.set("assinatura", "x".repeat(43));
    const adulterada = await app.inject({ method: "GET", url: alvo.pathname + alvo.search });
    expect(adulterada.statusCode).toBe(403);
  }, 60_000);

  it("URL vencida é recusada", async () => {
    const relogio = { valor: new Date("2026-08-21T12:00:00.000Z") };
    const efemero = armazenamentoEmMemoria({
      baseUrl: "http://api.local",
      segundosLeitura: 60,
      agora: () => relogio.valor,
    });
    efemero.guardar("tenant/x/foto.png", PIXEL_PNG, "image/png");

    const url = await efemero.urlParaLer("tenant/x/foto.png");
    const consulta = Object.fromEntries(new URL(url).searchParams);

    expect(efemero.conferirAssinatura("GET", "tenant/x/foto.png", consulta).valida).toBe(true);

    relogio.valor = new Date("2026-08-21T12:05:00.000Z");
    const depois = efemero.conferirAssinatura("GET", "tenant/x/foto.png", consulta);
    expect(depois.valida).toBe(false);
    expect(depois.motivo).toBe("URL expirada");
  });

  it("não dá para ler o objeto de outro município mesmo sabendo a chave", async () => {
    const ocorrencia = await ocorrenciaEmCampo("Rua Vizinha, 9");
    const autorizacao = (await autorizar(ocorrencia)).json();
    await enviarBytes(autorizacao.url, autorizacao.cabecalhos);
    await app.inject({
      method: "POST", url: "/evidencias/confirmar-envio", headers: com(tokenAgente),
      payload: { evidenciaId: autorizacao.evidenciaId },
    });

    // O coordenador do outro município tenta pelo identificador da evidência.
    const r = await app.inject({
      method: "GET", url: `/evidencias/${autorizacao.evidenciaId}/url`,
      headers: com(tokenOutroMunicipio),
    });
    expect(r.statusCode).toBe(404);
  }, 60_000);
});

describe("Vínculo com a vistoria", () => {
  it("a foto enviada antes é amarrada à vistoria quando a coleta sincroniza", async () => {
    const ocorrencia = await ocorrenciaEmCampo("Rua da Ponte, 11");
    const autorizacao = (await autorizar(ocorrencia)).json();
    await enviarBytes(autorizacao.url, autorizacao.cabecalhos);
    await app.inject({
      method: "POST", url: "/evidencias/confirmar-envio", headers: com(tokenAgente),
      payload: { evidenciaId: autorizacao.evidenciaId },
    });

    const agoraIso = new Date().toISOString();
    const sincronizacao = await app.inject({
      method: "POST", url: "/sincronizacao/vistoria", headers: com(tokenAgente),
      payload: {
        idempotencyKey: "dddddddd-0000-4000-8000-000000000001",
        ocorrenciaId: ocorrencia,
        coletadaEm: agoraIso,
        vistoria: {
          checklist: [{ chave: "risco_iminente", resposta: true }],
          // A chave devolvida na autorização, não um nome de arquivo solto.
          fotos: [{ chave: autorizacao.chave, capturadaEm: agoraIso, legenda: "Trinca" }],
          gpsPrecisaoMetros: 5,
          assinanteNome: "Moradora",
          assinaturaChave: "assinatura.png",
          coletadaEm: agoraIso,
        },
      },
    });
    expect(sincronizacao.statusCode).toBe(201);

    const linhas = await mem.bruto.query<{ n: string; vistoria_id: string | null; enviada_em: string | null }>(
      `SELECT count(*) OVER ()::text AS n, vistoria_id, enviada_em
         FROM evidencias WHERE ocorrencia_id = $1`,
      [ocorrencia],
    );
    // Uma linha só: a foto já existia e foi amarrada, não duplicada.
    expect(linhas.rows[0]!.n).toBe("1");
    expect(linhas.rows[0]!.vistoria_id).not.toBeNull();
    expect(linhas.rows[0]!.enviada_em).not.toBeNull();
  }, 60_000);

  it("chave forjada com o prefixo de outro município não é aceita", async () => {
    const ocorrencia = await ocorrenciaEmCampo("Rua Forjada, 13");
    const orgOutro = "22222222-2222-4222-8222-000000000002";
    const agoraIso = new Date().toISOString();

    const r = await app.inject({
      method: "POST", url: "/sincronizacao/vistoria", headers: com(tokenAgente),
      payload: {
        idempotencyKey: "dddddddd-0000-4000-8000-000000000002",
        ocorrenciaId: ocorrencia,
        coletadaEm: agoraIso,
        vistoria: {
          checklist: [{ chave: "risco_iminente", resposta: true }],
          fotos: [{ chave: `tenant/${orgOutro}/ocorrencias/x/roubada.jpg`, capturadaEm: agoraIso }],
          gpsPrecisaoMetros: 5,
          assinanteNome: "Moradora",
          assinaturaChave: "assinatura.png",
          coletadaEm: agoraIso,
        },
      },
    });
    expect(r.statusCode).toBe(201);

    const gravada = await mem.bruto.query<{ chave_storage: string }>(
      "SELECT chave_storage FROM evidencias WHERE ocorrencia_id = $1", [ocorrencia],
    );
    // A chave forjada foi descartada e remontada sob o município do token.
    expect(gravada.rows[0]!.chave_storage).not.toContain(orgOutro);
    expect(gravada.rows[0]!.chave_storage).toContain(`/ocorrencias/${ocorrencia}/`);
  }, 60_000);
});

describe("Assinatura SigV4, além do vetor oficial", () => {
  const credenciais = { accessKeyId: "AKIA", secretAccessKey: "segredo" };
  const comum = {
    host: "conta.r2.cloudflarestorage.com",
    caminho: "/balde/tenant/abc/foto.jpg",
    regiao: "auto",
    credenciais,
    agora: new Date("2026-08-21T10:00:00.000Z"),
    expiraEmSegundos: 900,
  } as const;

  it("assinar um cabeçalho a mais muda a assinatura", () => {
    const sem = new URL(assinarUrl({ ...comum, metodo: "PUT" }));
    const com = new URL(assinarUrl({
      ...comum, metodo: "PUT",
      cabecalhosAssinados: { "content-length": "1024" },
    }));

    expect(com.searchParams.get("X-Amz-Signature"))
      .not.toBe(sem.searchParams.get("X-Amz-Signature"));
    // O cabeçalho assinado passa a ser obrigatório, e o cliente precisa saber.
    expect(com.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;host");
  });

  it("mudar o método muda a assinatura", () => {
    const leitura = new URL(assinarUrl({ ...comum, metodo: "GET" }));
    const escrita = new URL(assinarUrl({ ...comum, metodo: "PUT" }));
    // Sem isso, uma URL de leitura serviria para gravar por cima da evidência.
    expect(leitura.searchParams.get("X-Amz-Signature"))
      .not.toBe(escrita.searchParams.get("X-Amz-Signature"));
  });

  it("codifica os caracteres que a AWS exige e que encodeURIComponent deixa passar", () => {
    // Um desses num nome de arquivo faria a assinatura bater no cliente e
    // falhar no servidor, com erro genérico de assinatura inválida.
    expect(codificarRfc3986("a!b'c(d)e*f")).toBe("a%21b%27c%28d%29e%2Af");
    expect(codificarRfc3986("espaço e acento")).toBe("espa%C3%A7o%20e%20acento");
  });

  it("mantém as barras do caminho e codifica o resto", () => {
    const url = new URL(assinarUrl({
      ...comum, metodo: "GET",
      caminho: "/balde/tenant/abc/foto com espaço.jpg",
    }));
    expect(url.pathname).toBe("/balde/tenant/abc/foto%20com%20espa%C3%A7o.jpg");
  });

  it("a validade aparece na URL", () => {
    const url = new URL(assinarUrl({ ...comum, metodo: "GET", expiraEmSegundos: 300 }));
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-Date")).toBe("20260821T100000Z");
  });
});
