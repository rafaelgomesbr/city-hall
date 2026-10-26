import type { FastifyInstance } from "fastify";
import type { ZodType } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import type { Mensagem, Notificador } from "../src/auth/notificador.js";
import { ROTAS_DO_CONTRATO } from "../src/contrato/rotas.js";
import { chaveDaRota } from "../src/contrato/tipos.js";

/**
 * V2-F02-E04, parte 3C3: o contrato dos grupos `documentos`,
 * `oficios-e-orgaos`, `prestacao-de-contas` e `publico` diz o que as rotas
 * DEVOLVEM de verdade.
 *
 * Cada caso chama a rota real (pelo caminho `/v1`) e confere a resposta contra a
 * `resposta` que o registro do contrato declara para aquela rota, e não contra
 * uma constante do teste: se a entrada do contrato divergir do handler (campo a
 * mais, a menos ou de outro tipo, status ou tipo de mídia diferente), o caso
 * reprova.
 *
 * Esquema de resposta com `z.object` ignora chave de sobra, então a conferência
 * compara também o objeto lido com o original: chave que a rota devolve e o
 * esquema não descreve aparece como diferença.
 */

const SENHA = "defesa-civil-2026";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";
const MOTIVO_DO_LEVANTAMENTO =
  "Contenção do talude executada pela Secretaria de Obras e conferida em nova " +
  "vistoria técnica. Sem trincas ativas.";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenCoordenador: string;
let tokenAdministrador: string;
let tokenAgente: string;

const enviadas: Mensagem[] = [];
const notificadorFalso: Notificador = {
  async enviar(m) {
    enviadas.push(m);
    return { idNoProvedor: "5b1ff1cf-0000-4000-8000-abcdefabcdef" };
  },
};

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST",
    url: "/v1/auth/entrar",
    payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

/** A entrada do registro para uma rota, pela chave `MÉTODO /v1/caminho`. */
function entrada(chave: string) {
  const achada = ROTAS_DO_CONTRATO.find((r) => chaveDaRota(r) === chave);
  if (!achada?.resposta) throw new Error(`a rota ${chave} não tem resposta descrita no contrato`);
  return { rota: achada, resposta: achada.resposta };
}

type Resposta = Awaited<ReturnType<FastifyInstance["inject"]>>;

/** Confere status e corpo JSON de uma resposta real contra a entrada do contrato. */
function conferirJson(chave: string, r: Resposta): void {
  const { resposta } = entrada(chave);
  expect(r.statusCode, `${chave}: ${r.body}`).toBe(resposta.status);
  expect(r.headers["content-type"], chave).toContain("application/json");
  const esquema = resposta.esquema as ZodType;
  expect(esquema, `${chave} não declara esquema`).toBeDefined();
  const corpo = r.json();
  const lido = esquema.safeParse(corpo);
  expect(lido.success, `${chave}: ${JSON.stringify(lido.error?.issues)}`).toBe(true);
  // Nenhuma chave de sobra: o esquema não pode descrever MENOS do que a rota devolve.
  expect(lido.data, `${chave}: a rota devolve o que o esquema não descreve`).toEqual(corpo);
}

/** Confere status e tipo de mídia de uma resposta que é arquivo. */
function conferirArquivo(chave: string, r: Resposta): void {
  const { resposta } = entrada(chave);
  expect(r.statusCode, `${chave}: ${r.body.slice(0, 300)}`).toBe(resposta.status);
  expect(resposta.tipo, `${chave} não declara tipo`).toBeDefined();
  expect(r.headers["content-type"], chave).toContain(resposta.tipo!);
}

async function comVistoria(endereco: string): Promise<{ id: string; protocolo: string }> {
  const criar = await app.inject({
    method: "POST",
    url: "/v1/ocorrencias",
    headers: com(tokenCoordenador),
    payload: {
      solicitanteNome: "Marilda Souza Prado",
      canalEntrada: "telefone",
      endereco,
      tipo: "deslizamento",
      descricao: "Talude atrás da casa cedeu depois da chuva da madrugada.",
    },
  });
  if (criar.statusCode !== 201) throw new Error(`criar falhou: ${criar.body}`);
  const { id, protocolo } = criar.json();
  await app.inject({
    method: "POST",
    url: `/v1/ocorrencias/${id}/triagem`,
    headers: com(tokenCoordenador),
    payload: { severidade: "critica", vulnerabilidadePresente: false },
  });
  await app.inject({
    method: "POST",
    url: `/v1/ocorrencias/${id}/despacho`,
    headers: com(tokenCoordenador),
    payload: { equipeId: EQUIPE_ALFA, prazoHoras: 4 },
  });
  const coletadaEm = new Date().toISOString();
  const s = await app.inject({
    method: "POST",
    url: "/v1/sincronizacao/vistoria",
    headers: com(tokenAgente),
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
        assinaturaChave: null,
        coletadaEm,
        observacoes: "Talude com trinca ativa.",
      },
    },
  });
  if (s.statusCode !== 201) throw new Error(`sincronizacao falhou: ${s.body}`);
  return { id, protocolo };
}

/** O identificador impresso no rodapé do documento. */
function identificadorImpresso(html: string): string {
  const m = /Identificador da emissão<br><strong>([0-9A-F]+)<\/strong>/.exec(html);
  if (!m) throw new Error("o rodapé não traz o identificador da emissão");
  return m[1]!;
}

let alvoDoDocumento: { id: string; protocolo: string };
let alvoDoOficio: { id: string; protocolo: string };
let codigoDoLaudo: string;

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-do-contrato-3c3-com-mais-de-32-bytes",
    LOGIN_POR_IP: "10000",
    URL_PUBLICA: "http://api.local",
    MARCA_DAGUA: "",
    EMAIL_ATIVO: "sim",
    NOTIFICADOR_URL: "https://api.resend.com/emails",
    NOTIFICADOR_CHAVE: "re_chave-falsa-de-teste",
    EMAIL_REMETENTE: "defesacivil@serraalta.exemplo.gov.br",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco,
    config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
    notificador: notificadorFalso,
    // O PDF de mentira: o contrato descreve o tipo de mídia, não o desenho da página.
    pdf: {
      async gerar() {
        return new TextEncoder().encode("%PDF-1.4 documento de teste");
      },
      async encerrar() {
        /* nada a fechar */
      },
    },
  });
  await app.ready();

  tokenCoordenador = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
  tokenAdministrador = await entrar("rita.lopes@serraalta.exemplo.gov.br");
  tokenAgente = await entrar("diego.alves@serraalta.exemplo.gov.br");

  alvoDoDocumento = await comVistoria("Rua dos Documentos, 10");
  alvoDoOficio = await comVistoria("Rua dos Oficios, 20");
}, 240_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("documentos: o que cada rota devolve", () => {
  it("o laudo sai em HTML", async () => {
    const r = await app.inject({
      method: "GET",
      url: `/v1/documentos/${alvoDoDocumento.id}/laudo`,
      headers: com(tokenCoordenador),
    });
    conferirArquivo("GET /v1/documentos/:id/laudo", r);
    codigoDoLaudo = identificadorImpresso(r.body);
  });

  it("o laudo em PDF sai como application/pdf", async () => {
    const r = await app.inject({
      method: "GET",
      url: `/v1/documentos/${alvoDoDocumento.id}/laudo.pdf`,
      headers: com(tokenCoordenador),
    });
    conferirArquivo("GET /v1/documentos/:id/laudo.pdf", r);
    expect(String(r.headers["content-disposition"])).toMatch(
      /^inline; filename="laudo-de-vistoria-[0-9a-f]{8}\.pdf"$/,
    );
  });

  it("o termo de interdição sai em HTML e em PDF", async () => {
    const html = await app.inject({
      method: "GET",
      url: `/v1/documentos/${alvoDoDocumento.id}/termo-de-interdicao`,
      headers: com(tokenCoordenador),
    });
    conferirArquivo("GET /v1/documentos/:id/termo-de-interdicao", html);
    const pdf = await app.inject({
      method: "GET",
      url: `/v1/documentos/${alvoDoDocumento.id}/termo-de-interdicao.pdf`,
      headers: com(tokenCoordenador),
    });
    conferirArquivo("GET /v1/documentos/:id/termo-de-interdicao.pdf", pdf);
    expect(String(pdf.headers["content-disposition"])).toMatch(
      /^inline; filename="termo-de-interdicao-[0-9a-f]{8}\.pdf"$/,
    );
  });

  it("o termo de desinterdição sai em HTML depois do levantamento", async () => {
    const levantar = await app.inject({
      method: "POST",
      url: `/v1/ocorrencias/${alvoDoDocumento.id}/desinterdicao`,
      headers: com(tokenCoordenador),
      payload: { motivo: MOTIVO_DO_LEVANTAMENTO },
    });
    expect(levantar.statusCode, levantar.body).toBe(200);
    const r = await app.inject({
      method: "GET",
      url: `/v1/documentos/${alvoDoDocumento.id}/termo-de-desinterdicao`,
      headers: com(tokenCoordenador),
    });
    conferirArquivo("GET /v1/documentos/:id/termo-de-desinterdicao", r);
  });

  it("o identificador do rodapé do laudo se confere e a resposta casa com o esquema", async () => {
    const r = await app.inject({
      method: "GET",
      url: `/v1/documentos/validar/${codigoDoLaudo}`,
      headers: com(tokenCoordenador),
    });
    conferirJson("GET /v1/documentos/validar/:codigo", r);
    expect(r.json().documento).toBe("laudo");
  });
});

describe("oficios-e-orgaos: o que cada rota devolve", () => {
  let orgaoId: string;
  let providenciaId: string;
  let oficioId: string;

  it("cadastra, lista, edita, desativa e reativa um órgão", async () => {
    const criar = await app.inject({
      method: "POST",
      url: "/v1/orgaos",
      headers: com(tokenCoordenador),
      payload: {
        nome: "Corpo de Bombeiros",
        sigla: "CBM",
        email: "sinistros@bombeiros.exemplo.gov.br",
        telefone: "(31) 3333-0000",
      },
    });
    conferirJson("POST /v1/orgaos", criar);
    orgaoId = criar.json().id;

    const lista = await app.inject({
      method: "GET",
      url: "/v1/orgaos",
      headers: com(tokenCoordenador),
    });
    conferirJson("GET /v1/orgaos", lista);
    expect(lista.json().itens.some((o: { id: string }) => o.id === orgaoId)).toBe(true);

    const editar = await app.inject({
      method: "PATCH",
      url: `/v1/orgaos/${orgaoId}`,
      headers: com(tokenCoordenador),
      // O PATCH substitui os campos: sem o email, o órgão perderia o endereço do envio.
      payload: {
        nome: "Corpo de Bombeiros Militar",
        sigla: "CBM",
        email: "sinistros@bombeiros.exemplo.gov.br",
      },
    });
    conferirJson("PATCH /v1/orgaos/:id", editar);

    const desativar = await app.inject({
      method: "POST",
      url: `/v1/orgaos/${orgaoId}/desativacao`,
      headers: com(tokenCoordenador),
      payload: { motivo: "Competência transferida para a Secretaria de Saúde em 2026" },
    });
    conferirJson("POST /v1/orgaos/:id/desativacao", desativar);

    // Desativado, o órgão só aparece com incluirInativos, já com o motivo.
    const todos = await app.inject({
      method: "GET",
      url: "/v1/orgaos?incluirInativos=1",
      headers: com(tokenCoordenador),
    });
    conferirJson("GET /v1/orgaos", todos);
    const inativo = todos.json().itens.find((o: { id: string }) => o.id === orgaoId);
    expect(inativo.ativo).toBe(false);
    expect(inativo.motivo_desativacao).toContain("Secretaria de Saúde");

    const reativar = await app.inject({
      method: "POST",
      url: `/v1/orgaos/${orgaoId}/reativacao`,
      headers: com(tokenCoordenador),
    });
    conferirJson("POST /v1/orgaos/:id/reativacao", reativar);
  });

  it("emite o ofício e lê a lista antes de qualquer envio", async () => {
    const prov = await app.inject({
      method: "POST",
      url: `/v1/ocorrencias/${alvoDoOficio.id}/providencia`,
      headers: com(tokenCoordenador),
      payload: {
        orgaoId,
        orgaoDestino: "Corpo de Bombeiros Militar",
        descricao: "Avaliação de risco imediato.",
        responsavel: "Chefe de plantão",
        prazoHoras: 24,
      },
    });
    expect(prov.statusCode, prov.body).toBe(200);
    const achada = await mem.bruto.query<{ id: string }>(
      "SELECT id FROM providencias WHERE ocorrencia_id = $1",
      [alvoDoOficio.id],
    );
    providenciaId = achada.rows[0]!.id;

    const emitir = await app.inject({
      method: "POST",
      url: "/v1/oficios",
      headers: com(tokenCoordenador),
      payload: { providenciaId, observacoes: "Pedido de vistoria conjunta." },
    });
    conferirJson("POST /v1/oficios", emitir);
    oficioId = emitir.json().id;

    const lista = await app.inject({
      method: "GET",
      url: `/v1/oficios?ocorrenciaId=${alvoDoOficio.id}`,
      headers: com(tokenCoordenador),
    });
    conferirJson("GET /v1/oficios", lista);
    expect(lista.json().itens).toHaveLength(1);
  });

  it("lê a ficha, abre o documento e confere o identificador do ofício", async () => {
    const ficha = await app.inject({
      method: "GET",
      url: `/v1/oficios/${oficioId}`,
      headers: com(tokenCoordenador),
    });
    conferirJson("GET /v1/oficios/:id", ficha);

    const documento = await app.inject({
      method: "GET",
      url: `/v1/oficios/${oficioId}/documento`,
      headers: com(tokenCoordenador),
    });
    conferirArquivo("GET /v1/oficios/:id/documento", documento);

    const { identificadorDoOficio } = await import("../src/oficios/documento.js");
    const codigo = identificadorDoOficio(ficha.json());
    const validar = await app.inject({
      method: "GET",
      url: `/v1/documentos/validar/${codigo}`,
      headers: com(tokenCoordenador),
    });
    conferirJson("GET /v1/documentos/validar/:codigo", validar);
    expect(validar.json().documento).toBe("oficio");
  });

  it("envia o ofício, o link abre uma vez e a ficha passa a trazer envio e aberturas", async () => {
    // Sem corpo: o handler lê `req.body ?? {}`, e o contrato diz que o corpo é opcional.
    const envio = await app.inject({
      method: "POST",
      url: `/v1/oficios/${oficioId}/envio`,
      headers: com(tokenCoordenador),
    });
    conferirJson("POST /v1/oficios/:id/envio", envio);
    expect(envio.json().destinatario).toMatch(/^s\*\*\*@/);

    const link = /http:\/\/api\.local(\/publico\/oficio\/\S+)/.exec(
      enviadas[enviadas.length - 1]!.corpo,
    )![1]!;
    expect((await app.inject({ method: "GET", url: link })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: link })).statusCode).toBe(410);

    const ficha = await app.inject({
      method: "GET",
      url: `/v1/oficios/${oficioId}`,
      headers: com(tokenCoordenador),
    });
    conferirJson("GET /v1/oficios/:id", ficha);
    const corpo = ficha.json();
    expect(corpo.envios).toHaveLength(1);
    expect(corpo.envios[0].desfecho).toBe("entregue");
    expect(corpo.aberturas.map((a: { resultado: string }) => a.resultado).sort()).toEqual([
      "entregue",
      "recusado_ja_aberto",
    ]);

    const lista = await app.inject({
      method: "GET",
      url: "/v1/oficios",
      headers: com(tokenCoordenador),
    });
    conferirJson("GET /v1/oficios", lista);
    const item = lista.json().itens.find((i: { id: string }) => i.id === oficioId);
    expect(item.envios).toBe(1);
    expect(item.aberto_em).not.toBeNull();
  });
});

describe("prestacao-de-contas: o que cada rota devolve", () => {
  it("a trilha, os tipos de evento, o resumo e as consultas registradas", async () => {
    const trilha = await app.inject({
      method: "GET",
      url: "/v1/trilha?porPagina=5",
      headers: com(tokenCoordenador),
    });
    conferirJson("GET /v1/trilha", trilha);
    expect(trilha.json().itens.length).toBeGreaterThan(0);

    const tipos = await app.inject({
      method: "GET",
      url: "/v1/trilha/tipos",
      headers: com(tokenCoordenador),
    });
    conferirJson("GET /v1/trilha/tipos", tipos);

    const resumo = await app.inject({
      method: "GET",
      url: "/v1/relatorios/resumo",
      headers: com(tokenCoordenador),
    });
    conferirJson("GET /v1/relatorios/resumo", resumo);
    expect(resumo.json().total).toBeGreaterThan(0);

    // Abrir o laudo registra a consulta ao dado do cidadão.
    const consultas = await app.inject({
      method: "GET",
      url: "/v1/relatorios/consultas",
      headers: com(tokenCoordenador),
    });
    conferirJson("GET /v1/relatorios/consultas", consultas);
    expect(consultas.json().itens.length).toBeGreaterThan(0);
  }, 60_000);

  it("o CSV básico e o completo saem como text/csv, e as exportações ficam listadas", async () => {
    const basico = await app.inject({
      method: "GET",
      url: "/v1/relatorios/ocorrencias.csv",
      headers: com(tokenCoordenador),
    });
    conferirArquivo("GET /v1/relatorios/ocorrencias.csv", basico);
    expect(String(basico.headers["content-disposition"])).toMatch(
      /^attachment; filename="ocorrencias-\d{4}-\d{2}-\d{2}\.csv"$/,
    );

    const completo = await app.inject({
      method: "GET",
      url:
        "/v1/relatorios/ocorrencias.csv?nivel=completo&justificativa=" +
        encodeURIComponent("Resposta ao ofício do Tribunal de Contas, processo 123."),
      headers: com(tokenAdministrador),
    });
    conferirArquivo("GET /v1/relatorios/ocorrencias.csv", completo);
    expect(String(completo.headers["content-disposition"])).toContain("com-dados-pessoais");

    const exportacoes = await app.inject({
      method: "GET",
      url: "/v1/relatorios/exportacoes",
      headers: com(tokenCoordenador),
    });
    conferirJson("GET /v1/relatorios/exportacoes", exportacoes);
    expect(exportacoes.json().itens.length).toBeGreaterThanOrEqual(2);
  }, 60_000);

  it("o pacote de saída sai como application/zip", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/v1/saida/pacote.zip",
      headers: com(tokenAdministrador),
    });
    conferirArquivo("POST /v1/saida/pacote.zip", r);
    expect(String(r.headers["content-disposition"])).toMatch(
      /^attachment; filename="saida-.+-\d{4}-\d{2}-\d{2}\.zip"$/,
    );
  }, 120_000);
});

describe("publico: o formulário de interesse", () => {
  it("responde 202 com o esquema que o contrato declara", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/v1/publico/interesse",
      payload: {
        nome: "Paula Menezes",
        email: "paula@vale.exemplo.gov.br",
        municipio: "Vale Fundo",
        uf: "MG",
        faixaPopulacao: "ate_50_mil",
      },
    });
    conferirJson("POST /v1/publico/interesse", r);
  });
});

describe("o registro dos quatro grupos não deixa rota sem resposta", () => {
  it("toda entrada de documentos, oficios-e-orgaos, prestacao-de-contas e publico descreve a resposta", () => {
    const grupos = new Set(["documentos", "oficios-e-orgaos", "prestacao-de-contas", "publico"]);
    const sem = ROTAS_DO_CONTRATO.filter((r) => grupos.has(r.grupo) && !r.resposta).map(
      chaveDaRota,
    );
    expect(sem).toEqual([]);
  });
});
