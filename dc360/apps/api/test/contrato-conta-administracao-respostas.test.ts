import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import {
  ROTAS_DO_CONTRATO,
  ROTAS_PENDENTES,
  rotasSemResposta,
  type RotaComGrupo,
} from "../src/contrato/rotas.js";
import { chaveDaRota } from "../src/contrato/tipos.js";
import { construirServidor } from "../src/servidor.js";

/**
 * As respostas descritas no contrato (V2-F02-E04, parte 3C1) dos grupos `conta`
 * e `administracao` são as que a API devolve de verdade.
 *
 * Cada caso chama a rota por `inject`, com o corpo validado pelo MESMO esquema
 * que o contrato descreve (`corpo`), e confere duas coisas: o status é o da
 * `resposta` descrita e o corpo passa no esquema da `resposta`. Se o handler
 * mudar um campo, ou o contrato descrever um que o handler não devolve, o
 * caso reprova. As rotas de `autenticacao` têm o arquivo irmão
 * `contrato-auth-respostas.test.ts`.
 */

const SENHA = "defesa-civil-2026";
const GRUPOS_DA_PARTE = ["autenticacao", "conta", "administracao"];
const ORG_SERRA_ALTA = "11111111-1111-4111-8111-000000000001";
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenDiego: string;
let tokenRita: string;
const id: Record<string, string> = {};

const com = (token: string) => ({ authorization: `Bearer ${token}` });

function rotaDe(chave: string): RotaComGrupo {
  const r = ROTAS_DO_CONTRATO.find((x) => chaveDaRota(x) === chave);
  if (!r) throw new Error(`o contrato não descreve ${chave}`);
  return r;
}

type Chamada = {
  token?: string;
  params?: Record<string, string>;
  consulta?: Record<string, string>;
  payload?: unknown;
};

/**
 * Chama a rota do contrato e confere o status e o corpo da `resposta`
 * descrita. Devolve a resposta crua e o corpo já lido pelo esquema do contrato.
 */
async function chamar(
  chave: string,
  { token, params = {}, consulta, payload }: Chamada = {},
): Promise<{ res: LightMyRequestResponse; corpo: unknown }> {
  const r = rotaDe(chave);
  if (!r.resposta) throw new Error(`${chave} está sem resposta no contrato`);
  if (r.corpo && payload !== undefined) r.corpo.parse(payload);

  let url = r.caminho;
  for (const [nome, valor] of Object.entries(params)) url = url.replace(`:${nome}`, valor);
  if (consulta) url += `?${new URLSearchParams(consulta).toString()}`;

  const res = await app.inject({
    method: r.metodo,
    url,
    headers: token ? com(token) : {},
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });
  expect(res.statusCode, `${chave} respondeu ${res.statusCode}: ${res.body}`).toBe(
    r.resposta.status,
  );
  if (!r.resposta.esquema) return { res, corpo: undefined };
  const lido = r.resposta.esquema.safeParse(res.json());
  expect(lido.success, `${chave}: ${lido.success ? "" : lido.error.message}`).toBe(true);
  return { res, corpo: lido.success ? lido.data : undefined };
}

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST",
    url: "/v1/auth/entrar",
    payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso as string;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-do-contrato-3c1-com-mais-de-32-bytes",
    LOGIN_POR_IP: "10000",
    PUSH_ATIVO: "sim",
    // Identificadores de mentira: nenhum envio de verdade acontece aqui.
    APNS_KEY_ID: "TESTE12345",
    APNS_TEAM_ID: "TIME123456",
    APNS_CHAVE: "/caminho/que/nao/e/lido/nesta/suite.p8",
    APNS_BUNDLE: "br.gov.exemplo.dc360",
    MAPS_KEY: "chave-de-mapa-de-teste",
  } as NodeJS.ProcessEnv);

  app = await construirServidor({
    banco: mem.banco,
    config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  tokenDiego = await entrar("diego.alves@serraalta.exemplo.gov.br");
  tokenRita = await entrar("rita.lopes@serraalta.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("O contrato dos grupos da parte 3C1 está completo", () => {
  it("nenhuma rota dos três grupos está pendente nem sem resposta", () => {
    const pendentes = ROTAS_PENDENTES.filter((p) => GRUPOS_DA_PARTE.includes(p.grupo));
    expect(pendentes.map((p) => p.chave)).toEqual([]);

    const semResposta = rotasSemResposta().filter((r) => GRUPOS_DA_PARTE.includes(r.grupo));
    expect(semResposta.map((r) => `${r.grupo}: ${chaveDaRota(r)}`)).toEqual([]);
  });
});

describe("administracao: a resposta descrita é a que a API devolve", () => {
  it("equipes: listar, cadastrar e editar", async () => {
    const lista = await chamar("GET /v1/equipes", { token: tokenDiego });
    expect((lista.corpo as { itens: unknown[] }).itens.length).toBeGreaterThan(0);

    const criada = await chamar("POST /v1/equipes", {
      token: tokenRita,
      payload: { nome: "Equipe do contrato", especialidade: "Contenção" },
    });
    id.equipe = (criada.corpo as { id: string }).id;

    await chamar("PATCH /v1/equipes/:id", {
      token: tokenRita,
      params: { id: id.equipe! },
      payload: { nome: "Equipe do contrato", especialidade: null, ativa: false },
    });
  });

  it("usuários: listar, cadastrar, editar, situação, senha e sessões", async () => {
    const lista = await chamar("GET /v1/usuarios", { token: tokenRita });
    const itens = (lista.corpo as { itens: Array<{ email: string }> }).itens;
    expect(itens.some((u) => u.email === "diego.alves@serraalta.exemplo.gov.br")).toBe(true);

    const criado = await chamar("POST /v1/usuarios", {
      token: tokenRita,
      payload: {
        nome: "Pessoa do Contrato",
        matricula: "CT-001",
        email: "contrato@serraalta.exemplo.gov.br",
        papel: "operador",
        senha: "senha-longa-do-contrato-1",
      },
    });
    id.usuario = (criado.corpo as { id: string }).id;

    await chamar("PATCH /v1/usuarios/:id", {
      token: tokenRita,
      params: { id: id.usuario! },
      payload: {
        nome: "Pessoa do Contrato Editada",
        matricula: "CT-001",
        email: "contrato@serraalta.exemplo.gov.br",
        papel: "operador",
        equipeId: null,
      },
    });

    const desativado = await chamar("PATCH /v1/usuarios/:id/situacao", {
      token: tokenRita,
      params: { id: id.usuario! },
      payload: { ativo: false },
    });
    expect((desativado.corpo as { ativo: boolean }).ativo).toBe(false);
    await chamar("PATCH /v1/usuarios/:id/situacao", {
      token: tokenRita,
      params: { id: id.usuario! },
      payload: { ativo: true },
    });

    const redefinida = await chamar("POST /v1/usuarios/:id/redefinir-senha", {
      token: tokenRita,
      params: { id: id.usuario! },
    });
    expect(
      (redefinida.corpo as { senhaTemporaria: string }).senhaTemporaria.length,
    ).toBeGreaterThan(8);

    // Com a senha temporária, a pessoa entra e passa a ter uma sessão para ver e encerrar.
    const temporaria = (redefinida.corpo as { senhaTemporaria: string }).senhaTemporaria;
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/entrar",
      payload: { email: "contrato@serraalta.exemplo.gov.br", senha: temporaria },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().trocaDeSenhaObrigatoria).toBe(true);

    const sessoes = await chamar("GET /v1/usuarios/:id/sessoes", {
      token: tokenRita,
      params: { id: id.usuario! },
    });
    expect((sessoes.corpo as { sessoesAbertas: number }).sessoesAbertas).toBe(1);

    const encerradas = await chamar("POST /v1/usuarios/:id/encerrar-sessoes", {
      token: tokenRita,
      params: { id: id.usuario! },
    });
    expect((encerradas.corpo as { sessoesEncerradas: number }).sessoesEncerradas).toBe(1);

    // Sem sessão aberta as duas datas são nulas, e o esquema aceita (nulo é valor).
    const vazia = await chamar("GET /v1/usuarios/:id/sessoes", {
      token: tokenRita,
      params: { id: id.usuario! },
    });
    expect((vazia.corpo as { ultimaEntradaEm: string | null }).ultimaEntradaEm).toBeNull();
  });

  it("retenção: ler e gravar, com nulo como valor", async () => {
    const antes = await chamar("GET /v1/organizacao/retencao", { token: tokenRita });
    expect(typeof (antes.corpo as { nome: string }).nome).toBe("string");

    const gravada = await chamar("PATCH /v1/organizacao/retencao", {
      token: tokenRita,
      payload: { solicitanteDias: 365, vulnerabilidadeDias: 180 },
    });
    expect(gravada.corpo).toEqual({ solicitanteDias: 365, vulnerabilidadeDias: 180 });

    const nula = await chamar("PATCH /v1/organizacao/retencao", {
      token: tokenRita,
      payload: { solicitanteDias: null, vulnerabilidadeDias: null },
    });
    expect(nula.corpo).toEqual({ solicitanteDias: null, vulnerabilidadeDias: null });

    const lida = await chamar("GET /v1/organizacao/retencao", { token: tokenRita });
    expect(lida.corpo).toMatchObject({ solicitanteDias: null, vulnerabilidadeDias: null });
  });
});

describe("conta: a resposta descrita é a que a API devolve", () => {
  it("lê o cadastro da própria conta, sem e com foto, e o ciclo da foto", async () => {
    const semFoto = await chamar("GET /v1/usuarios/eu", { token: tokenDiego });
    expect((semFoto.corpo as { fotoUrl: string | null }).fotoUrl).toBeNull();

    const autorizada = await chamar("POST /v1/usuarios/eu/foto/autorizar-envio", {
      token: tokenDiego,
      payload: { tipoConteudo: "image/png", tamanhoBytes: PIXEL_PNG.length },
    });
    const { chave, url, cabecalhos } = autorizada.corpo as {
      chave: string;
      url: string;
      cabecalhos: Record<string, string>;
    };
    expect(chave.startsWith(`tenant/${ORG_SERRA_ALTA}/usuarios/`)).toBe(true);

    const alvo = new URL(url);
    const subiu = await app.inject({
      method: "PUT",
      url: alvo.pathname + alvo.search,
      headers: { ...cabecalhos, "content-length": String(PIXEL_PNG.length) },
      payload: PIXEL_PNG,
    });
    expect(subiu.statusCode).toBe(200);

    const confirmada = await chamar("PUT /v1/usuarios/eu/foto", {
      token: tokenDiego,
      payload: { chave },
    });
    expect(typeof (confirmada.corpo as { fotoUrl: string }).fotoUrl).toBe("string");

    const comFoto = await chamar("GET /v1/usuarios/eu", { token: tokenDiego });
    expect(typeof (comFoto.corpo as { fotoUrl: string | null }).fotoUrl).toBe("string");

    await chamar("DELETE /v1/usuarios/eu/foto", { token: tokenDiego });
  });

  it("aparelho: registrar devolve o id (sem a ficha) e revogar não tem corpo", async () => {
    const ficha = "ficha-de-aparelho-do-contrato-3c1";
    const registrado = await chamar("POST /v1/aparelhos", {
      token: tokenDiego,
      payload: { plataforma: "ios", ficha, ambiente: "teste" },
    });
    expect(registrado.res.body).not.toContain(ficha);
    expect(registrado.corpo).toMatchObject({ registrado: true });

    await chamar("POST /v1/aparelhos/revogar", { token: tokenDiego, payload: { ficha } });
  });

  it("sino: lista com itens, cursor e contagem; marcar lidos devolve quantos", async () => {
    const oc = await mem.bruto.query<{ id: string }>(
      "SELECT id FROM ocorrencias WHERE organizacao_id = $1 LIMIT 1",
      [ORG_SERRA_ALTA],
    );
    const ocorrenciaId = oc.rows[0]?.id;
    expect(ocorrenciaId, "o semeado precisa ter ao menos uma ocorrência").toBeTruthy();
    const aviso = await mem.bruto.query<{ id: string }>(
      `INSERT INTO avisos (organizacao_id, tipo, ocorrencia_id, chave_do_fato, criado_em)
       VALUES ($1,'vistoria_recebida',$2,'contrato-3c1', now() - interval '1 hour')
       RETURNING id`,
      [ORG_SERRA_ALTA, ocorrenciaId],
    );
    const avisoId = aviso.rows[0]!.id;

    const lista = await chamar("GET /v1/avisos", { token: tokenRita });
    const corpo = lista.corpo as {
      itens: Array<{ id: string; lido: boolean }>;
      naoLidos: number;
      teto: number;
    };
    expect(corpo.itens.some((a) => a.id === avisoId)).toBe(true);
    expect(corpo.naoLidos).toBeGreaterThan(0);

    const lidos = await chamar("POST /v1/avisos/lidos", {
      token: tokenRita,
      payload: { ids: [avisoId] },
    });
    expect(lidos.corpo).toEqual({ marcados: 1 });

    // A consulta com cursor devolve a mesma forma.
    await chamar("GET /v1/avisos", {
      token: tokenRita,
      consulta: { desde: "2020-01-01T00:00:00.000Z" },
    });
  });

  it("configuração e uso do armazenamento", async () => {
    const config = await chamar("GET /v1/configuracao", { token: tokenDiego });
    expect(config.corpo).toEqual({ chaveDoMapa: "chave-de-mapa-de-teste", mapaAutorizado: true });

    const uso = await chamar("GET /v1/armazenamento/uso", { token: tokenRita });
    expect(typeof (uso.corpo as { bytesUsados: number }).bytesUsados).toBe("number");
  });
});
