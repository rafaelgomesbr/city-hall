import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { codigoDeValidacao } from "../src/documentos/laudo.js";

/**
 * Laudo de vistoria e termo de interdição.
 *
 * O servidor público julga o software pelo documento que ele produz, e um
 * laudo é peça de processo administrativo: ele pode acabar numa audiência.
 * Então o que estes testes conferem é o que faria um laudo ser contestado.
 *
 * Duas coisas em especial:
 *
 * - As DUAS marcas de tempo quando a coleta foi offline. Mostrar só a
 *   sincronização faria o documento afirmar que a vistoria aconteceu na hora
 *   em que o sinal voltou, o que é falso.
 * - Nenhuma norma além das que o projeto autoriza, e NENHUM número de artigo.
 *   Artigo errado num termo de interdição é motivo para anular o ato.
 */

const SENHA = "defesa-civil-2026";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";

/**
 * Normas que este projeto autoriza citar, conforme `docs/CONTEXTO.md`.
 * Qualquer outra lei ou decreto no documento reprova.
 */
const NORMAS_PERMITIDAS = [
  "12.608/2012", "14.750/2023", "13.709/2018", "14.133/2021",
  "182/2021", "14.129/2021", "13.146/2015",
];

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenAgente: string;
let tokenCoordenador: string;
let tokenDeFora: string;

async function entrar(email: string): Promise<string> {
  const r = await app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA } });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

const com = (t: string) => ({ authorization: `Bearer ${t}` });

/**
 * Espaço em branco não é significativo em HTML, e o template quebra frases em
 * várias linhas para caber na largura do arquivo. Comparar o texto corrido
 * evita um teste que reprova por causa de indentação.
 */
const corrido = (html: string) => html.replace(/\s+/g, " ");

async function comVistoria(opcoes: { offline: boolean; endereco: string }): Promise<{
  id: string; protocolo: string; vistoriaId: string;
}> {
  const criar = await app.inject({
    method: "POST", url: "/ocorrencias", headers: com(tokenCoordenador),
    payload: {
      solicitanteNome: "Marilda Souza Prado", solicitanteContato: "(35) 99871-4402",
      canalEntrada: "telefone", endereco: opcoes.endereco, tipo: "deslizamento",
      descricao: "Talude atrás de duas casas cedeu depois da chuva da madrugada.",
      coordenada: { lat: -22.4187, lng: -45.4523 },
    },
  });
  const { id, protocolo } = criar.json();

  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: com(tokenCoordenador),
    payload: {
      severidade: "critica", vulnerabilidadePresente: true,
      vulnerabilidadeDescricao: "Idosa acamada e criança de 4 anos na residência.",
    },
  });
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/despacho`, headers: com(tokenCoordenador),
    payload: { equipeId: EQUIPE_ALFA, prazoHoras: 4 },
  });

  // Coleta há três horas: sincronizada agora, a diferença caracteriza offline.
  const coletadaEm = new Date(Date.now() - (opcoes.offline ? 3 * 3_600_000 : 5_000)).toISOString();
  const sincronizacao = await app.inject({
    method: "POST", url: "/sincronizacao/vistoria", headers: com(tokenAgente),
    payload: {
      idempotencyKey: crypto.randomUUID(),
      ocorrenciaId: id,
      coletadaEm,
      vistoria: {
        checklist: [
          { chave: "risco_iminente", resposta: true },
          { chave: "evacuacao_necessaria", resposta: true },
          { chave: "interdicao_indicada", resposta: true },
          { chave: "acionar_outro_orgao", resposta: false },
        ],
        fotos: [],
        gpsPrecisaoMetros: 6.2,
        assinanteNome: "Marilda Souza Prado",
        assinaturaChave: "assinatura.png",
        coletadaEm,
        observacoes: "Vistoria realizada com a moradora presente.",
      },
    },
  });
  if (sincronizacao.statusCode !== 201) throw new Error(`sincronizacao falhou: ${sincronizacao.body}`);

  return { id, protocolo, vistoriaId: sincronizacao.json().vistoriaId };
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-documentos-com-mais-de-32-bytes-aq",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  tokenAgente = await entrar("diego.alves@serraalta.exemplo.gov.br");
  tokenCoordenador = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
  tokenDeFora = await entrar("aurelio.machado@valefundo.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Laudo de vistoria", () => {
  it("traz o que o processo administrativo exige", async () => {
    const alvo = await comVistoria({ offline: true, endereco: "Rua das Acácias, 245" });

    const r = await app.inject({
      method: "GET", url: `/documentos/${alvo.id}/laudo`, headers: com(tokenCoordenador),
    });

    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toContain("text/html");
    const html = r.body;

    // Identificação do órgão e do ato.
    expect(html).toContain("Defesa Civil de Serra Alta");
    expect(html).toContain("Serra Alta");
    expect(html).toContain("Laudo de vistoria");
    expect(html).toContain(alvo.protocolo);

    // Dados da ocorrência.
    expect(html).toContain("Rua das Acácias, 245");
    expect(html).toContain("Deslizamento");
    expect(html).toContain("Crítica");
    expect(html).toContain("-22.418700, -45.452300");

    // A vulnerabilidade aparece: é o que justifica prioridade e é o que uma
    // auditoria pergunta primeiro.
    expect(html).toContain("Idosa acamada");

    // Checklist item a item, com a resposta.
    expect(html).toContain("Risco iminente identificado");
    expect(html).toContain("Interdição indicada");
    expect(html).toContain("SIM");
    expect(html).toContain("NÃO");

    // Autoria e assinatura.
    expect(html).toContain("Diego Nakamura Alves");
    expect(html).toContain("SA-3390");
    expect(html).toContain("Agente de proteção e defesa civil");
    expect(html).toContain("Marilda Souza Prado");

    // Código de validação estável.
    expect(html).toContain(codigoDeValidacao(alvo.protocolo, alvo.vistoriaId));
  }, 120_000);

  it("mostra as DUAS marcas de tempo quando a coleta foi offline", async () => {
    const alvo = await comVistoria({ offline: true, endereco: "Rua do Morro, 30" });
    const r = await app.inject({
      method: "GET", url: `/documentos/${alvo.id}/laudo`, headers: com(tokenCoordenador),
    });

    expect(r.body).toContain("Data e hora da vistoria em campo");
    expect(r.body).toContain("Recebida pelo sistema em");
    // E explica por que há duas datas, senão quem lê acha que é erro.
    expect(corrido(r.body)).toContain("coletada em campo sem conexão");
    expect(corrido(r.body)).toContain("a data de referência do ato é a da vistoria em campo");
  }, 120_000);

  it("não polui o documento com duas datas quando a coleta foi online", async () => {
    const alvo = await comVistoria({ offline: false, endereco: "Rua do Centro, 40" });
    const r = await app.inject({
      method: "GET", url: `/documentos/${alvo.id}/laudo`, headers: com(tokenCoordenador),
    });

    expect(r.body).toContain("Registrada no sistema em");
    expect(corrido(r.body)).not.toContain("coletada em campo sem conexão");
  }, 120_000);

  it("diz claramente quando não há fotografia, em vez de omitir a seção", async () => {
    const alvo = await comVistoria({ offline: false, endereco: "Rua Sem Foto, 50" });
    const r = await app.inject({
      method: "GET", url: `/documentos/${alvo.id}/laudo`, headers: com(tokenCoordenador),
    });
    // Seção ausente deixaria a dúvida de se houve foto e ela se perdeu.
    expect(r.body).toContain("Registro fotográfico");
    expect(corrido(r.body)).toContain("Nenhuma fotografia foi anexada");
  }, 120_000);

  it("sai marcado enquanto o produto está em validação", async () => {
    const alvo = await comVistoria({ offline: false, endereco: "Rua da Marca, 60" });
    const r = await app.inject({
      method: "GET", url: `/documentos/${alvo.id}/laudo`, headers: com(tokenCoordenador),
    });
    // Um laudo de validação indistinguível de um real acaba anexado a
    // processo por engano.
    expect(r.body).toContain("DOCUMENTO DE VALIDAÇÃO");
    expect(r.body).toContain("marca-dagua");
  }, 120_000);

  it("recusa gerar quando ainda não houve vistoria, e diz por quê", async () => {
    const criar = await app.inject({
      method: "POST", url: "/ocorrencias", headers: com(tokenCoordenador),
      payload: {
        solicitanteNome: "Alguém", canalEntrada: "telefone", endereco: "Rua Nova, 70",
        tipo: "granizo", descricao: "Telhas quebradas.",
      },
    });

    const r = await app.inject({
      method: "GET", url: `/documentos/${criar.json().id}/laudo`, headers: com(tokenCoordenador),
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toBe("sem_vistoria");
  }, 60_000);
});

describe("Termo de interdição", () => {
  it("cita apenas norma autorizada, e nenhum número de artigo", async () => {
    const alvo = await comVistoria({ offline: true, endereco: "Travessa São Benedito, 57" });
    const r = await app.inject({
      method: "GET", url: `/documentos/${alvo.id}/termo-de-interdicao`,
      headers: com(tokenCoordenador),
    });

    expect(r.statusCode).toBe(200);
    const html = r.body;

    expect(corrido(html)).toContain("Lei 12.608/2012");
    expect(corrido(html)).toContain("Lei 14.750/2023");

    // Nenhuma outra lei ou decreto aparece no documento.
    const citacoes = html.match(/(?:Lei|Decreto|Portaria|Instrução Normativa)[^,.;<]{0,40}?(\d[\d.]*\/\d{4})/g) ?? [];
    for (const citacao of citacoes) {
      const numero = citacao.match(/(\d[\d.]*\/\d{4})/)![1]!;
      expect(NORMAS_PERMITIDAS, `norma não autorizada citada: ${citacao}`).toContain(numero);
    }

    // Nenhum número de artigo: a lista autorizada não os especifica, e
    // inventar um é dar motivo para anular o ato.
    expect(html).not.toMatch(/\bart\.?\s*\d/i);
    expect(html).not.toMatch(/\bartigo\s+\d/i);
  }, 120_000);

  it("declara a interdição e a ciência do responsável", async () => {
    const alvo = await comVistoria({ offline: true, endereco: "Rua da Interdição, 80" });
    const r = await app.inject({
      method: "GET", url: `/documentos/${alvo.id}/termo-de-interdicao`,
      headers: com(tokenCoordenador),
    });

    expect(corrido(r.body)).toContain("Fica INTERDITADO o imóvel situado em Rua da Interdição, 80");
    expect(corrido(r.body)).toContain("vedada a permanência de pessoas");
    expect(r.body).toContain("Responsável pelo imóvel, ciente");
    // Interdição preventiva não é definitiva: o termo precisa dizer como sai.
    expect(corrido(r.body)).toContain("nova vistoria ateste a cessação do risco");
  }, 120_000);

  it("tem código de validação diferente do laudo da mesma vistoria", async () => {
    const alvo = await comVistoria({ offline: false, endereco: "Rua Dois Documentos, 90" });
    const laudo = await app.inject({
      method: "GET", url: `/documentos/${alvo.id}/laudo`, headers: com(tokenCoordenador),
    });
    const termo = await app.inject({
      method: "GET", url: `/documentos/${alvo.id}/termo-de-interdicao`, headers: com(tokenCoordenador),
    });

    const codigoLaudo = codigoDeValidacao(alvo.protocolo, alvo.vistoriaId);
    const codigoTermo = codigoDeValidacao(`INT-${alvo.protocolo}`, alvo.vistoriaId);

    expect(codigoLaudo).not.toBe(codigoTermo);
    expect(laudo.body).toContain(codigoLaudo);
    expect(termo.body).toContain(codigoTermo);
    // Dois documentos distintos não podem compartilhar código de conferência.
    expect(laudo.body).not.toContain(codigoTermo);
  }, 120_000);
});

describe("Quem pode ver o documento", () => {
  it("outro município não alcança o laudo nem sabendo o identificador", async () => {
    const alvo = await comVistoria({ offline: false, endereco: "Rua Alheia, 100" });
    const r = await app.inject({
      method: "GET", url: `/documentos/${alvo.id}/laudo`, headers: com(tokenDeFora),
    });
    expect(r.statusCode).toBe(404);
  }, 120_000);

  it("sem token não sai documento nenhum", async () => {
    const alvo = await comVistoria({ offline: false, endereco: "Rua Sem Token, 110" });
    const r = await app.inject({ method: "GET", url: `/documentos/${alvo.id}/laudo` });
    expect(r.statusCode).toBe(401);
  }, 120_000);
});

describe("Fotografia no documento", () => {
  it("a foto entra com URL assinada e legenda, e a imagem abre", async () => {
    const alvo = await comVistoria({ offline: true, endereco: "Rua Com Foto, 120" });

    const pixel = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const autorizacao = await app.inject({
      method: "POST", url: "/evidencias/autorizar-envio", headers: com(tokenAgente),
      payload: {
        ocorrenciaId: alvo.id, nomeArquivo: "trinca.png", tipoConteudo: "image/png",
        tamanhoBytes: pixel.length, capturadaEm: new Date().toISOString(),
        legenda: "Trinca na parede dos fundos", ordem: 0,
      },
    });
    const { url, cabecalhos, evidenciaId } = autorizacao.json();
    const destino = new URL(url);
    await app.inject({
      method: "PUT", url: destino.pathname + destino.search,
      headers: { ...cabecalhos, "content-length": String(pixel.length) },
      payload: pixel,
    });
    await app.inject({
      method: "POST", url: "/evidencias/confirmar-envio", headers: com(tokenAgente),
      payload: { evidenciaId },
    });

    const laudo = await app.inject({
      method: "GET", url: `/documentos/${alvo.id}/laudo`, headers: com(tokenCoordenador),
    });

    expect(laudo.body).toContain("Trinca na parede dos fundos");
    expect(laudo.body).toContain("Foto 1.");

    // A URL da imagem é assinada e serve o conteúdo de verdade.
    const src = laudo.body.match(/<img src="([^"]+)"/)![1]!.replace(/&amp;/g, "&");
    const alvoImagem = new URL(src);
    const bytes = await app.inject({ method: "GET", url: alvoImagem.pathname + alvoImagem.search });
    expect(bytes.statusCode).toBe(200);
    expect(bytes.rawPayload.equals(pixel)).toBe(true);
  }, 120_000);
});

describe("Documento em PDF", () => {
  it("gera um PDF valido a partir do mesmo HTML", async () => {
    const { geradorPlaywright } = await import("../src/documentos/pdf.js");
    const pdf = geradorPlaywright();

    const config = carregarConfig({
      NODE_ENV: "test",
      JWT_SEGREDO: "segredo-de-pdf-com-mais-de-trinta-e-dois-byt",
      LOGIN_POR_IP: "10000",
    } as NodeJS.ProcessEnv);

    const comPdf = await construirServidor({
      banco: mem.banco, config, pdf,
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
    });
    await comPdf.ready();

    try {
      const entrada = await comPdf.inject({
        method: "POST", url: "/auth/entrar",
        payload: { email: "helena.coutinho@serraalta.exemplo.gov.br", senha: SENHA },
      });
      const token = entrada.json().acesso;

      // Reaproveita uma ocorrencia que ja tem vistoria, criada acima.
      const comVistorias = await mem.bruto.query<{ ocorrencia_id: string }>(
        "SELECT ocorrencia_id FROM vistorias ORDER BY coletada_em DESC LIMIT 1",
      );
      const alvo = comVistorias.rows[0]!.ocorrencia_id;

      const r = await comPdf.inject({
        method: "GET", url: `/documentos/${alvo}/laudo.pdf`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(r.statusCode).toBe(200);
      expect(r.headers["content-type"]).toContain("application/pdf");
      expect(String(r.headers["content-disposition"])).toContain("laudo-de-vistoria");

      // Assinatura de arquivo PDF, e tamanho compativel com uma pagina real.
      expect(r.rawPayload.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(r.rawPayload.length).toBeGreaterThan(5_000);
      // Todo PDF termina com o marcador de fim de arquivo.
      expect(r.rawPayload.subarray(-1024).toString("latin1")).toContain("%%EOF");
    } finally {
      await comPdf.close();
      await pdf.encerrar();
    }
  }, 180_000);

  it("responde 503 explicando, quando o servidor nao tem gerador", async () => {
    // O servidor principal da suite sobe sem gerador de PDF.
    const comVistorias = await mem.bruto.query<{ ocorrencia_id: string }>(
      "SELECT ocorrencia_id FROM vistorias ORDER BY coletada_em DESC LIMIT 1",
    );
    const r = await app.inject({
      method: "GET", url: `/documentos/${comVistorias.rows[0]!.ocorrencia_id}/laudo.pdf`,
      headers: com(tokenCoordenador),
    });

    // Melhor um 503 que diz o que fazer do que um 500 sem explicacao.
    expect(r.statusCode).toBe(503);
    expect(r.json().erro).toBe("pdf_indisponivel");
    expect(r.json().mensagem).toContain("versão para impressão");
  }, 60_000);

  it("o PDF tambem respeita o isolamento entre municipios", async () => {
    const comVistorias = await mem.bruto.query<{ ocorrencia_id: string }>(
      "SELECT ocorrencia_id FROM vistorias ORDER BY coletada_em DESC LIMIT 1",
    );
    const r = await app.inject({
      method: "GET", url: `/documentos/${comVistorias.rows[0]!.ocorrencia_id}/laudo.pdf`,
      headers: com(tokenDeFora),
    });
    // 404 antes de qualquer renderizacao: nao gasta navegador com quem nao
    // tem acesso, e nao confirma que o registro existe.
    expect(r.statusCode).toBe(404);
  }, 60_000);
});
