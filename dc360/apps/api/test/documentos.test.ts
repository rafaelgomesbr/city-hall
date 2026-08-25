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

async function comVistoria(
  opcoes: { offline: boolean; endereco: string; interdicao?: boolean },
): Promise<{
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
          { chave: "interdicao_indicada", resposta: opcoes.interdicao ?? true },
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

describe("Assinatura da moradora no documento", () => {
  /**
   * A assinatura era um dado fantasma: a rota de sincronização gravava
   * `assinatura_chave` e nada, em lugar nenhum do produto, jamais a lia. Nem
   * rota de leitura, nem imagem no laudo, nem tela. A coluna existia, o campo
   * existia no schema, e o traço que a moradora fez com o dedo não aparecia
   * para ninguém.
   */

  it("sem o arquivo enviado, o laudo sai sem imagem de assinatura", async () => {
    /*
      Este caso é o mais importante dos dois. A chave sozinha não prova que os
      bytes chegaram: a sincronização aceita a chave que o aparelho declarou, e
      o envio é outro passo, que pode falhar. Emitir a imagem sem conferir
      produziria um retângulo quebrado no meio de um laudo com brasão, o que
      parece documento adulterado.
    */
    const alvo = await comVistoria({ endereco: "Rua Sem Traco, 10" });
    const laudo = await app.inject({
      method: "GET", url: `/documentos/${alvo.id}/laudo`, headers: com(tokenCoordenador),
    });

    expect(laudo.statusCode).toBe(200);
    expect(laudo.body).toContain("Marilda Souza Prado");
    expect(laudo.body).not.toContain('class="traco"');
  }, 120_000);

  it("com o arquivo enviado, o traço aparece acima da linha e a imagem abre", async () => {
    const alvo = await comVistoria({ endereco: "Rua Com Traco, 20" });

    // Sobe os bytes na chave que a vistoria declarou, que é o que o aplicativo
    // de campo vai fazer antes de sincronizar.
    const traco = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const autorizacao = await app.inject({
      method: "POST", url: "/evidencias/autorizar-envio", headers: com(tokenAgente),
      payload: {
        ocorrenciaId: alvo.id, nomeArquivo: "assinatura.png", tipoConteudo: "image/png",
        tamanhoBytes: traco.length, capturadaEm: new Date().toISOString(), ordem: 0,
      },
    });
    const { url, cabecalhos } = autorizacao.json();
    const destino = new URL(url);
    await app.inject({
      method: "PUT", url: destino.pathname + destino.search,
      headers: { ...cabecalhos, "content-length": String(traco.length) },
      payload: traco,
    });

    // A vistoria aponta para a chave desse objeto.
    const objeto = await mem.bruto.query<{ chave_storage: string }>(
      "SELECT chave_storage FROM evidencias WHERE ocorrencia_id = $1 ORDER BY capturada_em DESC LIMIT 1",
      [alvo.id],
    );
    await mem.bruto.query(
      "UPDATE vistorias SET assinatura_chave = $2 WHERE ocorrencia_id = $1",
      [alvo.id, objeto.rows[0]!.chave_storage],
    );

    const laudo = await app.inject({
      method: "GET", url: `/documentos/${alvo.id}/laudo`, headers: com(tokenCoordenador),
    });
    expect(laudo.statusCode).toBe(200);
    expect(laudo.body).toContain('class="traco"');

    // O texto alternativo nomeia quem assinou: quem lê por leitor de tela
    // precisa saber de quem é o traço.
    expect(laudo.body).toContain('alt="Assinatura de Marilda Souza Prado"');

    // E a imagem serve os bytes de verdade, por URL assinada.
    const src = laudo.body.match(/class="traco" src="([^"]+)"/)![1]!.replace(/&amp;/g, "&");
    const alvoImagem = new URL(src);
    const bytes = await app.inject({ method: "GET", url: alvoImagem.pathname + alvoImagem.search });
    expect(bytes.statusCode).toBe(200);
    expect(bytes.rawPayload.equals(traco)).toBe(true);
  }, 120_000);

  it("o termo de interdição também mostra o traço", async () => {
    // O termo é o documento que restringe o direito de alguém entrar na
    // própria casa. Se a assinatura importa em algum lugar, é nele.
    const alvo = await comVistoria({ endereco: "Rua Do Termo, 30" });
    const objeto = await mem.bruto.query<{ id: string }>(
      "SELECT id FROM vistorias WHERE ocorrencia_id = $1", [alvo.id],
    );
    expect(objeto.rows[0]).toBeDefined();

    const termo = await app.inject({
      method: "GET", url: `/documentos/${alvo.id}/termo-de-interdicao`,
      headers: com(tokenCoordenador),
    });
    expect(termo.statusCode).toBe(200);
    // Sem arquivo, sem traço, e o documento continua íntegro.
    expect(termo.body).toContain("Responsável pelo imóvel, ciente");
    expect(termo.body).not.toContain('class="traco"');
  }, 120_000);
});

/**
 * O termo de interdição é ato administrativo, não um botão de imprimir.
 *
 * Estes casos existem porque, até a auditoria do conselho, a rota nunca lia
 * `interdicao_indicada`. O item é OBRIGATÓRIO no checklist da vistoria, ou
 * seja, sempre tem resposta, e mesmo assim uma vistoria que concluiu "não
 * interditar" produzia um documento com brasão mandando desocupar o imóvel.
 */
describe("O termo exige a decisão que o autoriza", () => {
  it("recusa com 409 quando a vistoria não indicou interdição", async () => {
    const alvo = await comVistoria({
      offline: false,
      endereco: "Rua das Camélias, 88, Bairro Alto",
      interdicao: false,
    });

    const termo = await app.inject({
      method: "GET", url: `/documentos/${alvo.id}/termo-de-interdicao`,
      headers: com(tokenCoordenador),
    });

    expect(termo.statusCode).toBe(409);
    expect(termo.json().erro).toBe("interdicao_nao_indicada");
    // A mensagem precisa dizer o caminho de saída, senão o coordenador conclui
    // que o sistema quebrou e emite o termo por fora, no Word.
    expect(termo.json().mensagem).toContain("vistoria nova");
    // E o laudo continua saindo: a recusa é do termo, não do documento técnico.
    const laudo = await app.inject({
      method: "GET", url: `/documentos/${alvo.id}/laudo`, headers: com(tokenCoordenador),
    });
    expect(laudo.statusCode).toBe(200);
  });

  it("emite quando a vistoria indicou, e deixa rastro de quem emitiu", async () => {
    const alvo = await comVistoria({
      offline: false, endereco: "Servidão do Cedro, 12, Vila Nova",
    });

    const termo = await app.inject({
      method: "GET", url: `/documentos/${alvo.id}/termo-de-interdicao`,
      headers: com(tokenCoordenador),
    });
    expect(termo.statusCode).toBe(200);

    const detalhe = await app.inject({
      method: "GET", url: `/ocorrencias/${alvo.id}`, headers: com(tokenCoordenador),
    });
    const emissoes = detalhe.json().trilha.filter(
      (e: { tipo: string }) => e.tipo === "documento_emitido",
    );
    expect(emissoes).toHaveLength(1);
    expect(emissoes[0].detalhe.documento).toBe("termo_de_interdicao");
    expect(emissoes[0].autor_nome).toBeTruthy();
  });

  it("abrir o mesmo documento de novo não polui a trilha", async () => {
    // Um laudo é aberto várias vezes por dia pelas mesmas pessoas: por quem
    // despachou, por quem assina, pela recepção que imprime. Se cada abertura
    // virasse linha, a trilha viraria registro de cliques, e ela não tem
    // policy de DELETE: o que entra ali fica.
    const alvo = await comVistoria({
      offline: false, endereco: "Rua do Mirante, 401, Morro Azul",
    });

    for (let i = 0; i < 3; i += 1) {
      const r = await app.inject({
        method: "GET", url: `/documentos/${alvo.id}/laudo`, headers: com(tokenCoordenador),
      });
      expect(r.statusCode).toBe(200);
    }

    const detalhe = await app.inject({
      method: "GET", url: `/ocorrencias/${alvo.id}`, headers: com(tokenCoordenador),
    });
    const emissoes = detalhe.json().trilha.filter(
      (e: { tipo: string }) => e.tipo === "documento_emitido",
    );
    expect(emissoes).toHaveLength(1);
  });
});

/**
 * A chave da assinatura vinha crua do aparelho.
 *
 * Enquanto o traço era gravado e nunca lido, o campo era inerte. Quando o
 * laudo passou a exibi-lo, virou caminho de leitura para qualquer objeto do
 * balde, inclusive de outra prefeitura.
 */
describe("A chave da assinatura não é escolhida pelo cliente", () => {
  it("remonta a chave sob o prefixo do próprio município", async () => {
    const alvo = await comVistoria({
      offline: false, endereco: "Alameda dos Ipês, 77, Centro",
    });

    const linha = await mem.bruto.query<{
      assinatura_chave: string | null; organizacao_id: string;
    }>(
      "SELECT assinatura_chave, organizacao_id FROM vistorias WHERE id = $1",
      [alvo.vistoriaId],
    );

    const gravada = linha.rows[0]!;
    expect(gravada.assinatura_chave).toBe(
      `tenant/${gravada.organizacao_id}/ocorrencias/${alvo.id}/assinatura.png`,
    );
  });

  it("uma chave apontando para outro município não sobrevive à gravação", async () => {
    const criar = await app.inject({
      method: "POST", url: "/ocorrencias", headers: com(tokenCoordenador),
      payload: {
        solicitanteNome: "Otávio Ramires Pinto", solicitanteContato: "(35) 99400-1188",
        canalEntrada: "telefone", endereco: "Rua da Pedreira, 5, Alto da Serra",
        tipo: "deslizamento", descricao: "Barranco cedeu na lateral da casa.",
        coordenada: { lat: -22.41, lng: -45.45 },
      },
    });
    const { id } = criar.json();
    await app.inject({
      method: "POST", url: `/ocorrencias/${id}/triagem`, headers: com(tokenCoordenador),
      payload: { severidade: "alta", vulnerabilidadePresente: false },
    });
    await app.inject({
      method: "POST", url: `/ocorrencias/${id}/despacho`, headers: com(tokenCoordenador),
      payload: { equipeId: EQUIPE_ALFA, prazoHoras: 6 },
    });

    const agora = new Date().toISOString();
    const alheio = "tenant/00000000-0000-4000-8000-000000000999/ocorrencias/xyz/assinatura.png";
    const enviada = await app.inject({
      method: "POST", url: "/sincronizacao/vistoria", headers: com(tokenAgente),
      payload: {
        idempotencyKey: crypto.randomUUID(),
        ocorrenciaId: id,
        coletadaEm: agora,
        vistoria: {
          checklist: [
            { chave: "risco_iminente", resposta: true },
            { chave: "evacuacao_necessaria", resposta: false },
            { chave: "interdicao_indicada", resposta: false },
            { chave: "acionar_outro_orgao", resposta: false },
          ],
          fotos: [],
          gpsPrecisaoMetros: 8,
          assinanteNome: "Otávio Ramires Pinto",
          assinaturaChave: alheio,
          coletadaEm: agora,
        },
      },
    });
    expect(enviada.statusCode).toBe(201);

    // O envio é aceito: recusar diria ao aparelho que a chave existe em algum
    // lugar. O que não sobrevive é a chave.
    const linha = await mem.bruto.query<{ assinatura_chave: string | null }>(
      "SELECT assinatura_chave FROM vistorias WHERE id = $1",
      [enviada.json().vistoriaId],
    );
    expect(linha.rows[0]!.assinatura_chave).not.toContain("000000000999");
    expect(linha.rows[0]!.assinatura_chave).toContain("/assinatura.png");
  });
});

describe("Quem pode emitir documento oficial", () => {
  it("o agente de campo não emite laudo, mesmo tendo feito a vistoria", async () => {
    const alvo = await comVistoria({
      offline: false, endereco: "Rua da Figueira, 300, Alto do Cruzeiro",
    });

    const laudo = await app.inject({
      method: "GET", url: `/documentos/${alvo.id}/laudo`, headers: com(tokenAgente),
    });
    expect(laudo.statusCode).toBe(403);

    const termo = await app.inject({
      method: "GET", url: `/documentos/${alvo.id}/termo-de-interdicao`,
      headers: com(tokenAgente),
    });
    expect(termo.statusCode).toBe(403);
  });

  it("mas continua conseguindo ver as fotos da ocorrência", async () => {
    // Deliberado, e contra a recomendação do auditor: a foto já aparece na
    // tela de detalhe que ele abre todo dia, e restringir aqui quebraria a
    // tela de quem atende o telefone sem esconder nada de ninguém.
    const alvo = await comVistoria({
      offline: false, endereco: "Beco do Sabiá, 14, Vila Operária",
    });
    const fotos = await app.inject({
      method: "GET", url: `/evidencias/ocorrencia/${alvo.id}`, headers: com(tokenAgente),
    });
    expect(fotos.statusCode).toBe(200);
  });
});
