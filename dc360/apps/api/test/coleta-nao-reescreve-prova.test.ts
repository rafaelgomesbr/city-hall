import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rotuloEventoTrilha } from "@dc360/shared";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import {
  armazenamentoEmMemoria, type ArmazenamentoEmMemoria,
} from "../src/armazenamento/memoria.js";

/**
 * A coleta que chega pela sincronização não reescreve prova que já existe, e
 * não entra com data que não pode ser verdade.
 *
 * Quatro achados de uma revisão de integridade da prova, todos provados por
 * sondagem contra a API real, e todos na mesma rota
 * (`POST /sincronizacao/vistoria`):
 *
 * 1. Uma fotografia confirmada e amarrada à vistoria A era REALOCADA para a
 *    vistoria B por um envelope posterior que referenciasse a mesma chave, com
 *    legenda nova, sem evento nenhum na trilha. O laudo vigente saía com a
 *    legenda nova e a foto sumia do laudo de A.
 * 2. Vistoria em ocorrência nunca despachada (`registrada`, `triagem`) entrava
 *    sem marca nenhuma, e o termo de interdição saía em cima dela.
 * 3. `coletadaEm` não era conferida na rota: treze horas no futuro virava 500
 *    (e a fila do aparelho insistia para sempre num CHECK do banco), 2021 era
 *    aceito e o laudo imprimia a vistoria antes de o chamado existir, e a data
 *    da foto em 2019 virava 500 do mesmo jeito.
 * 4. O evento `vistoria` da trilha não dizia QUAL vistoria, e carregava o nome
 *    da pessoa que assinou, que não entra em registro append-only.
 *
 * E o fechamento do achado 2, do lado do DOCUMENTO:
 *
 * 5. A marca do achado 2 ficava na trilha e na resposta da rota, e o papel não
 *    a imprimia: `avisoDeEquipe` devolvia vazio quando não havia equipe
 *    designada ("sem despacho não produz aviso"). O laudo saía limpo, e o termo
 *    de interdição saía como ATO em cima de uma ocorrência que a coordenação
 *    nunca despachou. Agora o laudo e o termo imprimem a nota, e o ato exige o
 *    despacho; a cópia e o laudo continuam saindo.
 */

const SENHA = "defesa-civil-2026";
const HASH_DA_SEMENTE =
  "scrypt$131072$8$1$56BVGGGziTxmINg0pEIjxw$F-aIq495xKVd9OKClsyKAFxxLHj26KkyKIWFMFAnBwk";
const SERRA_ALTA = "11111111-1111-4111-8111-000000000001";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";
/** A segunda agente da mesma equipe, que a semente não tem. */
const ANA = "11111111-1111-4111-8111-0000000000d9";
const DIEGO = "11111111-1111-4111-8111-0000000000d3";
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let mem: BancoEmMemoria;
let app: FastifyInstance;
let armazenamento: ArmazenamentoEmMemoria;
let tokenDiego: string;
let tokenAna: string;
let tokenCoordenadora: string;

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

/**
 * Uma ocorrência no status pedido. `em_campo` despacha para a Equipe Alfa, que
 * é a do Diego e da Ana; `triagem` para na triagem; `registrada` nem isso.
 */
async function ocorrencia(
  endereco: string,
  ate: "registrada" | "triagem" | "em_campo" = "em_campo",
): Promise<string> {
  const criar = await app.inject({
    method: "POST", url: "/ocorrencias", headers: com(tokenCoordenadora),
    payload: {
      solicitanteNome: "Marilda Souza Prado", canalEntrada: "telefone",
      endereco, tipo: "deslizamento",
      descricao: "Talude atrás da casa cedeu depois da chuva da madrugada.",
    },
  });
  const id = criar.json().id;
  if (ate === "registrada") return id;
  const triagem = await app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: com(tokenCoordenadora),
    payload: { severidade: "critica", vulnerabilidadePresente: false },
  });
  if (triagem.statusCode !== 200) throw new Error(`triagem falhou: ${triagem.body}`);
  if (ate === "triagem") return id;
  const despacho = await app.inject({
    method: "POST", url: `/ocorrencias/${id}/despacho`, headers: com(tokenCoordenadora),
    payload: { equipeId: EQUIPE_ALFA, prazoHoras: 4 },
  });
  if (despacho.statusCode !== 200) throw new Error(`despacho falhou: ${despacho.body}`);
  return id;
}

type Foto = { chave: string; capturadaEm: string; legenda?: string };

function envelope(
  ocorrenciaId: string,
  opcoes: { coletadaEm?: string; fotos?: Foto[]; idempotencyKey?: string } = {},
) {
  const coletadaEm = opcoes.coletadaEm ?? new Date().toISOString();
  return {
    idempotencyKey: opcoes.idempotencyKey ?? crypto.randomUUID(),
    ocorrenciaId,
    coletadaEm,
    vistoria: {
      checklist: [
        { chave: "risco_iminente", resposta: true },
        { chave: "evacuacao_necessaria", resposta: true },
        { chave: "interdicao_indicada", resposta: true },
        { chave: "acionar_outro_orgao", resposta: false },
      ],
      fotos: opcoes.fotos ?? [],
      gpsPrecisaoMetros: 6.2,
      assinanteNome: "Marilda Souza Prado",
      assinaturaChave: null,
      coletadaEm,
      observacoes: "Trinca ativa no talude.",
    },
  };
}

async function sincronizar(token: string, corpo: ReturnType<typeof envelope>) {
  return app.inject({
    method: "POST", url: "/sincronizacao/vistoria", headers: com(token), payload: corpo,
  });
}

/** Autoriza, envia e confirma uma fotografia, como o aparelho faz antes do envelope. */
async function fotoConfirmada(
  token: string, ocorrenciaId: string, legenda: string,
): Promise<{ evidenciaId: string; chave: string }> {
  const autorizacao = await app.inject({
    method: "POST", url: "/evidencias/autorizar-envio", headers: com(token),
    payload: {
      ocorrenciaId, nomeArquivo: "IMG_0001.jpg", tipoConteudo: "image/png",
      tamanhoBytes: PIXEL_PNG.length, capturadaEm: new Date().toISOString(),
      legenda, ordem: 0, idempotencyKey: crypto.randomUUID(),
    },
  });
  if (autorizacao.statusCode !== 201) throw new Error(`autorização falhou: ${autorizacao.body}`);
  const { evidenciaId, chave, url, cabecalhos } = autorizacao.json();
  const alvo = new URL(url);
  const envio = await app.inject({
    method: "PUT", url: alvo.pathname + alvo.search,
    headers: { ...cabecalhos, "content-length": String(PIXEL_PNG.length) },
    payload: PIXEL_PNG,
  });
  if (envio.statusCode !== 200) throw new Error(`envio falhou: ${envio.body}`);
  const confirmacao = await app.inject({
    method: "POST", url: "/evidencias/confirmar-envio", headers: com(token),
    payload: { evidenciaId },
  });
  if (confirmacao.statusCode !== 200) throw new Error(`confirmação falhou: ${confirmacao.body}`);
  return { evidenciaId, chave };
}

async function evidencia(id: string) {
  const r = await mem.bruto.query<{ vistoria_id: string | null; legenda: string | null }>(
    "SELECT vistoria_id, legenda FROM evidencias WHERE id = $1", [id],
  );
  return r.rows[0]!;
}

async function trilha(ocorrenciaId: string) {
  const r = await mem.bruto.query<{ tipo: string; detalhe: Record<string, unknown> }>(
    "SELECT tipo, detalhe FROM trilha_eventos WHERE ocorrencia_id = $1 ORDER BY registrado_em, id",
    [ocorrenciaId],
  );
  return r.rows;
}

async function status(ocorrenciaId: string): Promise<string> {
  const r = await mem.bruto.query<{ status: string }>(
    "SELECT status FROM ocorrencias WHERE id = $1", [ocorrenciaId],
  );
  return r.rows[0]!.status;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-da-prova-que-nao-se-reescreve-com-32-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  armazenamento = armazenamentoEmMemoria({ baseUrl: "http://api.local" });
  app = await construirServidor({ banco: mem.banco, config, armazenamento });
  await app.ready();

  await mem.bruto.query(
    `INSERT INTO usuarios (id, organizacao_id, nome, matricula, email, papel, equipe_id, senha_hash)
     VALUES ($1,$2,'Ana Ribeiro Gouveia','SA-3392','ana.gouveia@serraalta.exemplo.gov.br',
             'agente_campo',$3,$4)`,
    [ANA, SERRA_ALTA, EQUIPE_ALFA, HASH_DA_SEMENTE],
  );

  tokenDiego = await entrar("diego.alves@serraalta.exemplo.gov.br");
  tokenAna = await entrar("ana.gouveia@serraalta.exemplo.gov.br");
  tokenCoordenadora = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("1. A fotografia amarrada a uma vistoria não muda de vistoria nem de legenda", () => {
  it("um envelope novo que referencia a foto de outra vistoria é recusado, e nada muda", async () => {
    const id = await ocorrencia("Rua da Prova Realocada, 1");
    const foto = await fotoConfirmada(tokenDiego, id, "Trinca na parede dos fundos");
    const agora = new Date().toISOString();

    const primeira = await sincronizar(tokenDiego, envelope(id, {
      fotos: [{ chave: foto.chave, capturadaEm: agora, legenda: "Trinca na parede dos fundos" }],
    }));
    expect(primeira.statusCode, primeira.body).toBe(201);
    const vistoriaA = primeira.json().vistoriaId as string;
    expect((await evidencia(foto.evidenciaId)).vistoria_id).toBe(vistoriaA);

    // A sondagem: a mesma chave, num envelope novo, com legenda nova.
    const segunda = await sincronizar(tokenDiego, envelope(id, {
      fotos: [{ chave: foto.chave, capturadaEm: agora, legenda: "Fachada íntegra, sem risco" }],
    }));
    expect(segunda.statusCode, segunda.body).toBe(409);
    expect(segunda.json().erro).toBe("evidencia_ja_vinculada");
    // A foto apontada em `campos`: é o que faz o cartão da fila do aparelho
    // oferecer "corrigir a vistoria" em vez de repetir a recusa para sempre.
    expect(segunda.json().campos.map((c: { campo: string }) => c.campo)).toEqual(["vistoria.fotos.0"]);

    const depois = await evidencia(foto.evidenciaId);
    expect(depois.vistoria_id, "a foto mudou de vistoria").toBe(vistoriaA);
    expect(depois.legenda, "a legenda da foto confirmada foi reescrita").toBe("Trinca na parede dos fundos");

    // E a vistoria B não entrou pela metade: a recusa desfaz a transação inteira.
    const vistorias = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM vistorias WHERE ocorrencia_id = $1", [id],
    );
    expect(vistorias.rows[0]!.n).toBe("1");
  }, 60_000);

  it("a foto que outro agente enviou não é amarrada pelo envelope de quem não a anexou", async () => {
    const id = await ocorrencia("Rua da Prova Alheia, 2");
    const daAna = await fotoConfirmada(tokenAna, id, "Muro de arrimo estufado");
    const agora = new Date().toISOString();

    const r = await sincronizar(tokenDiego, envelope(id, {
      fotos: [{ chave: daAna.chave, capturadaEm: agora, legenda: "Muro de arrimo estufado" }],
    }));
    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().erro).toBe("evidencia_de_outro_agente");
    expect(r.json().campos.map((c: { campo: string }) => c.campo)).toEqual(["vistoria.fotos.0"]);
    expect((await evidencia(daAna.evidenciaId)).vistoria_id).toBeNull();
  }, 60_000);

  it("a primeira amarração continua funcionando: foto solta, do próprio agente, entra na vistoria", async () => {
    const id = await ocorrencia("Rua da Prova Solta, 3");
    const foto = await fotoConfirmada(tokenDiego, id, "Trinca na parede dos fundos");
    const agora = new Date().toISOString();

    const r = await sincronizar(tokenDiego, envelope(id, {
      fotos: [{ chave: foto.chave, capturadaEm: agora, legenda: "Trinca na parede dos fundos" }],
    }));
    expect(r.statusCode, r.body).toBe(201);
    expect((await evidencia(foto.evidenciaId)).vistoria_id).toBe(r.json().vistoriaId);
  }, 60_000);
});

describe("2. Vistoria em ocorrência sem despacho entra, e entra marcada", () => {
  for (const ate of ["registrada", "triagem"] as const) {
    it(`em ocorrência "${ate}": 201, sinalizada na resposta, evento próprio na trilha`, async () => {
      const id = await ocorrencia(`Rua Sem Despacho, ${ate}`, ate);
      const r = await sincronizar(tokenDiego, envelope(id));

      // Aceita: o trabalho de campo não se perde. O aparelho trata 4xx como
      // falha permanente, e a coleta morreria na fila dele.
      expect(r.statusCode, r.body).toBe(201);
      expect(r.json().foraDaEquipeDesignada, "a coleta sem despacho entrou sem sinal").toBe(true);

      const eventos = await trilha(id);
      const marca = eventos.filter((e) => e.tipo === "vistoria_sem_despacho");
      expect(marca, "a vistoria sem despacho não deixou evento próprio").toHaveLength(1);
      expect(marca[0]!.detalhe["vistoriaId"]).toBe(r.json().vistoriaId);
      expect(marca[0]!.detalhe["statusDaOcorrencia"]).toBe(ate);
      // Não é o evento da equipe divergente: não havia equipe para divergir.
      expect(eventos.some((e) => e.tipo === "vistoria_fora_da_equipe")).toBe(false);

      // O status não avança: não havia tarefa em campo para concluir.
      expect(await status(id)).toBe(ate);
    }, 60_000);
  }

  it("o evento tem rótulo em português", () => {
    expect(rotuloEventoTrilha("vistoria_sem_despacho")).not.toBe("vistoria_sem_despacho");
  });

  it("com despacho para a equipe do agente, nada disso aparece", async () => {
    const id = await ocorrencia("Rua Com Despacho, 4", "em_campo");
    const r = await sincronizar(tokenDiego, envelope(id));
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().foraDaEquipeDesignada).toBe(false);
    expect((await trilha(id)).some((e) => e.tipo === "vistoria_sem_despacho")).toBe(false);
  }, 60_000);
});

describe("3. A hora da coleta e das fotos precisa poder ser verdade", () => {
  it("treze horas no futuro: 422 nomeado com o campo, e não 500", async () => {
    const id = await ocorrencia("Rua do Relógio Adiantado, 5");
    const r = await sincronizar(tokenDiego, envelope(id, {
      coletadaEm: new Date(Date.now() + 13 * 3_600_000).toISOString(),
    }));
    expect(r.statusCode, r.body).toBe(422);
    expect(r.json().erro).toBe("data_implausivel");
    expect(r.json().campos).toEqual([
      { campo: "vistoria.coletadaEm", mensagem: expect.stringMatching(/doze horas/) },
    ]);
  }, 60_000);

  it("ano de 2021: recusada, e nada gravado", async () => {
    const id = await ocorrencia("Rua do Ano Errado, 6");
    const r = await sincronizar(tokenDiego, envelope(id, {
      coletadaEm: "2021-03-10T14:00:00.000Z",
    }));
    expect(r.statusCode, r.body).toBe(422);
    expect(r.json().erro).toBe("data_implausivel");
    expect(r.json().campos.map((c: { campo: string }) => c.campo)).toEqual(["vistoria.coletadaEm"]);

    const nada = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM vistorias WHERE ocorrencia_id = $1", [id],
    );
    expect(nada.rows[0]!.n).toBe("0");
  }, 60_000);

  it("anterior à abertura do chamado: recusada, com a frase certa", async () => {
    const id = await ocorrencia("Rua de Antes do Chamado, 7");
    // Uma hora antes de o chamado existir. Dentro da folga do banco, então só a
    // rota pode pegar.
    const r = await sincronizar(tokenDiego, envelope(id, {
      coletadaEm: new Date(Date.now() - 3_600_000).toISOString(),
    }));
    expect(r.statusCode, r.body).toBe(422);
    expect(r.json().erro).toBe("data_implausivel");
    expect(r.json().campos).toEqual([
      { campo: "vistoria.coletadaEm", mensagem: expect.stringMatching(/abertura/) },
    ]);
  }, 60_000);

  it("foto datada em 2019: 422 apontando a foto, e não 500", async () => {
    const id = await ocorrencia("Rua da Foto Antiga, 8");
    const r = await sincronizar(tokenDiego, envelope(id, {
      fotos: [
        { chave: "foto-1.jpg", capturadaEm: new Date().toISOString() },
        { chave: "foto-2.jpg", capturadaEm: "2019-01-05T14:22:00.000Z" },
      ],
    }));
    expect(r.statusCode, r.body).toBe(422);
    expect(r.json().erro).toBe("data_implausivel");
    expect(r.json().campos.map((c: { campo: string }) => c.campo)).toEqual([
      "vistoria.fotos.1.capturadaEm",
    ]);
  }, 60_000);

  it("relógio adiantado dentro da folga de doze horas continua aceito", async () => {
    const id = await ocorrencia("Rua da Folga, 9");
    const r = await sincronizar(tokenDiego, envelope(id, {
      coletadaEm: new Date(Date.now() + 2 * 3_600_000).toISOString(),
    }));
    expect(r.statusCode, r.body).toBe(201);
  }, 60_000);

  it("a foto avulsa, autorizada pela rota de evidência, segue a mesma régua da abertura", async () => {
    /*
      O esquema compartilhado confere 2020 e a folga de doze horas, e não tem
      como conferir a abertura do chamado: ela está no banco. Sem esta
      conferência na rota, uma foto datada de ontem entrava numa ocorrência
      aberta hoje, nunca se amarrava a vistoria nenhuma, e saía impressa no
      laudo na seção de fotografias anexadas ao protocolo com data anterior ao
      chamado.
    */
    const id = await ocorrencia("Rua da Foto Avulsa, 9");
    const r = await app.inject({
      method: "POST", url: "/evidencias/autorizar-envio", headers: com(tokenDiego),
      payload: {
        ocorrenciaId: id, nomeArquivo: "IMG_0002.jpg", tipoConteudo: "image/png",
        tamanhoBytes: PIXEL_PNG.length,
        capturadaEm: new Date(Date.now() - 24 * 3_600_000).toISOString(),
        ordem: 0,
      },
    });
    expect(r.statusCode, r.body).toBe(422);
    expect(r.json().erro).toBe("data_implausivel");
    expect(r.json().campos).toEqual([
      { campo: "capturadaEm", mensagem: expect.stringMatching(/abertura/) },
    ]);
    const nada = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM evidencias WHERE ocorrencia_id = $1", [id],
    );
    expect(nada.rows[0]!.n).toBe("0");
  }, 60_000);
});

describe("4. O evento de vistoria diz qual vistoria, e não diz quem assinou", () => {
  it("detalhe com vistoriaId e idempotencyKey, sem nome de pessoa", async () => {
    const id = await ocorrencia("Rua do Evento, 10");
    const chave = crypto.randomUUID();
    const r = await sincronizar(tokenDiego, envelope(id, { idempotencyKey: chave }));
    expect(r.statusCode, r.body).toBe(201);

    const evento = (await trilha(id)).find((e) => e.tipo === "vistoria");
    expect(evento, "o evento de vistoria não existe").toBeDefined();
    expect(evento!.detalhe["vistoriaId"]).toBe(r.json().vistoriaId);
    expect(evento!.detalhe["idempotencyKey"]).toBe(chave);
    expect(evento!.detalhe, "nome de pessoa em registro append-only").not.toHaveProperty("assinante");
  }, 60_000);
});

describe("5. O documento diz que a coleta veio sem despacho, e o ato não sai", () => {
  const FRASE_DA_NOTA = "não tinha equipe despachada quando a vistoria foi recebida";

  async function laudo(id: string) {
    const r = await app.inject({
      method: "GET", url: `/documentos/${id}/laudo`, headers: com(tokenCoordenadora),
    });
    return { status: r.statusCode, corrido: r.body.replace(/\s+/g, " ") };
  }

  async function interditada(id: string): Promise<boolean> {
    const r = await mem.bruto.query<{ interditada: boolean }>(
      "SELECT interditada_em IS NOT NULL AS interditada FROM ocorrencias WHERE id = $1", [id],
    );
    return r.rows[0]!.interditada;
  }

  for (const ate of ["registrada", "triagem"] as const) {
    it(`em ocorrência "${ate}": o laudo sai, com a nota de vistoria sem despacho`, async () => {
      const id = await ocorrencia(`Rua da Nota Sem Despacho, ${ate}`, ate);
      const r = await sincronizar(tokenDiego, envelope(id));
      expect(r.statusCode, r.body).toBe(201);

      // O laudo é relatório, não ato: continua saindo. Mas diz o que aconteceu,
      // na mesma nota em que o aviso de equipe divergente sairia.
      const { status: codigo, corrido } = await laudo(id);
      expect(codigo).toBe(200);
      expect(corrido).toContain(`<p class="nota">Esta ocorrência ${FRASE_DA_NOTA}.`);
      expect(corrido).toContain("conferida pela coordenação antes de o ato ser praticado");
      // E NÃO é o aviso de equipe: não havia equipe designada para divergir.
      expect(corrido).not.toContain("estava designada à");
    }, 60_000);

    it(`em ocorrência "${ate}": o termo de interdição como ATO responde 409 sem_despacho e não interdita`, async () => {
      const id = await ocorrencia(`Rua do Ato Sem Despacho, ${ate}`, ate);
      const r = await sincronizar(tokenDiego, envelope(id));
      expect(r.statusCode, r.body).toBe(201);

      const termo = await app.inject({
        method: "GET", url: `/documentos/${id}/termo-de-interdicao`, headers: com(tokenCoordenadora),
      });
      expect(termo.statusCode, termo.body).toBe(409);
      expect(termo.json().erro).toBe("sem_despacho");
      expect(termo.json().mensagem).toMatch(/despachar a ocorrência antes de praticar o ato/);

      // A recusa acontece em PREPARAR, antes do efeito colateral: nada foi
      // interditado e nenhuma emissão entrou na trilha.
      expect(await interditada(id), "a recusa interditou o imóvel").toBe(false);
      const emissoes = (await trilha(id)).filter((e) => e.tipo === "documento_emitido");
      expect(emissoes, "a recusa registrou emissão").toHaveLength(0);

      // O caminho do PDF passa pelo mesmo PREPARAR, então recusa pelo mesmo
      // motivo, e antes do 503 de "servidor sem gerador".
      const pdf = await app.inject({
        method: "GET", url: `/documentos/${id}/termo-de-interdicao.pdf`, headers: com(tokenCoordenadora),
      });
      expect(pdf.statusCode, pdf.body).toBe(409);
      expect(pdf.json().erro).toBe("sem_despacho");
      expect(await interditada(id)).toBe(false);
    }, 60_000);
  }

  it("depois do despacho, o ato sai, e o papel continua com a nota", async () => {
    /*
      O critério do ato é o estado do PROCESSO, e não a coluna da vistoria: a
      coordenação despachou depois de a coleta chegar, que é a conferência que a
      nota pede. O termo sai, e sai dizendo que a vistoria que o sustenta chegou
      antes do despacho, porque isso continua sendo verdade.
    */
    const id = await ocorrencia("Rua do Despacho Tardio, 11", "triagem");
    const r = await sincronizar(tokenDiego, envelope(id));
    expect(r.statusCode, r.body).toBe(201);

    const despacho = await app.inject({
      method: "POST", url: `/ocorrencias/${id}/despacho`, headers: com(tokenCoordenadora),
      payload: { equipeId: EQUIPE_ALFA, prazoHoras: 4 },
    });
    expect(despacho.statusCode, despacho.body).toBe(200);

    const termo = await app.inject({
      method: "GET", url: `/documentos/${id}/termo-de-interdicao`, headers: com(tokenCoordenadora),
    });
    expect(termo.statusCode, termo.body).toBe(200);
    expect(termo.body.replace(/\s+/g, " ")).toContain(FRASE_DA_NOTA);
    expect(await interditada(id)).toBe(true);
  }, 60_000);

  it("a vistoria antiga, sem equipe gravada e sem o evento, não recebe nota falsa", async () => {
    /*
      Toda vistoria anterior à migração 024 está no banco com
      `equipe_designada_id` nulo. Se a marca fosse lida dessa coluna, o laudo de
      cada uma delas passaria a afirmar que a coordenação não tinha despachado
      ninguém, o que é falso e treinaria o leitor a ignorar a nota. A marca é o
      evento `vistoria_sem_despacho` apontando para ESTA vistoria, e mais nada.
    */
    const id = await ocorrencia("Rua da Vistoria Antiga, 12", "em_campo");
    await mem.bruto.query(
      `INSERT INTO vistorias
         (organizacao_id, ocorrencia_id, agente_id, checklist, assinante_nome,
          coletada_em, idempotency_key)
       VALUES ($1,$2,$3,$4::jsonb,'Marilda Souza Prado', now(), $5)`,
      [
        SERRA_ALTA, id, DIEGO,
        JSON.stringify([
          { chave: "risco_iminente", resposta: true },
          { chave: "evacuacao_necessaria", resposta: true },
          { chave: "interdicao_indicada", resposta: true },
          { chave: "acionar_outro_orgao", resposta: false },
        ]),
        crypto.randomUUID(),
      ],
    );
    expect((await trilha(id)).some((e) => e.tipo === "vistoria_sem_despacho")).toBe(false);

    const { status: codigo, corrido } = await laudo(id);
    expect(codigo).toBe(200);
    expect(corrido, "nota falsa numa vistoria anterior à migração 024").not.toContain(FRASE_DA_NOTA);
    expect(corrido).not.toContain("estava designada à");

    // E o ato sai: a ocorrência foi despachada, e a coluna nula da vistoria
    // não diz o contrário.
    const termo = await app.inject({
      method: "GET", url: `/documentos/${id}/termo-de-interdicao`, headers: com(tokenCoordenadora),
    });
    expect(termo.statusCode, termo.body).toBe(200);
    expect(termo.body.replace(/\s+/g, " ")).not.toContain(FRASE_DA_NOTA);
  }, 60_000);
});
