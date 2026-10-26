import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import {
  armazenamentoEmMemoria,
  type ArmazenamentoEmMemoria,
} from "../src/armazenamento/memoria.js";
import type { BuscarCabecalhos, Lookup } from "../src/rotas/mapa.js";
import { chaveDaRota } from "../src/contrato/tipos.js";
import { GRUPOS, ROTAS_DO_CONTRATO } from "../src/contrato/rotas.js";

/**
 * As respostas descritas no contrato de ocorrências, campo e mapa e busca
 * (V2-F02-E04, parte 3C2) são as que a API devolve de verdade.
 *
 * O contrato é só texto até alguém conferi-lo contra o servidor. Aqui cada rota
 * dos três grupos é chamada por `inject`, com dados reais do banco em memória,
 * e o corpo que veio é lido pelo esquema de RESPOSTA do próprio registro
 * (`ROTAS_DO_CONTRATO`). Duas conferências por rota:
 *
 *  1. o status é o descrito, ou um dos que a entrada declara em `tambemResponde`
 *     (200 no reenvio idempotente, onde a primeira vez é 201), e o corpo é lido
 *     pelo esquema DAQUELE status;
 *  2. o esquema ACEITA o corpo, e o que ele devolve é IGUAL ao corpo. Zod
 *     descarta chave que não conhece, então `esquema.parse(corpo)` diferente do
 *     `corpo` é campo que o handler devolve e o contrato esqueceu de descrever.
 *
 * O último caso cobra a cobertura: toda rota dos três grupos foi exercitada.
 * Rota nova nesses grupos sem passar por aqui reprova.
 */

const SENHA = "defesa-civil-2026";
const SERRA_ALTA = "11111111-1111-4111-8111-000000000001";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";
const DIEGO = "11111111-1111-4111-8111-0000000000d3";
const SEM_EQUIPE = "11111111-1111-4111-8111-0000000000dc";
const HASH_DA_SEMENTE =
  "scrypt$131072$8$1$56BVGGGziTxmINg0pEIjxw$F-aIq495xKVd9OKClsyKAFxxLHj26KkyKIWFMFAnBwk";

const LAT = -27.595378;
const LNG = -48.54805;
const LINK_CURTO = "https://maps.app.goo.gl/AbCdEfGhIjKlMnOp7";
const URL_DE_LUGAR = `https://www.google.com/maps/place/Rua+das+Flores/@${LAT},${LNG},17z/data=!3m1!4b1`;

const NOMES_DOS_GRUPOS = ["ocorrencias", "campo", "mapa-e-busca"];
const ENTRADAS = new Map(ROTAS_DO_CONTRATO.map((r) => [chaveDaRota(r), r]));
const exercitadas = new Set<string>();

let mem: BancoEmMemoria;
let app: FastifyInstance;
let armazenamento: ArmazenamentoEmMemoria;
const tokens: Record<string, string> = {};

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST",
    url: "/v1/auth/entrar",
    payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

function pedir(metodo: "GET" | "POST", url: string, quem: string, payload?: unknown) {
  return app.inject({
    method: metodo,
    url,
    headers: { authorization: `Bearer ${tokens[quem]}` },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
}

/**
 * Confere uma resposta real contra a descrita no registro.
 * `modelo` é o caminho como o registro o escreve (`/v1/ocorrencias/:id`).
 */
function conferir(metodo: string, modelo: string, r: LightMyRequestResponse): unknown {
  const chave = `${metodo} ${modelo}`;
  const entrada = ENTRADAS.get(chave);
  expect(entrada, `sem entrada no registro: ${chave}`).toBeDefined();
  const resposta = entrada!.resposta;
  expect(resposta?.esquema, `sem esquema de resposta: ${chave}`).toBeDefined();
  /* O 200 do reenvio vem de `tambemResponde`; sem ele declarado, o status não é aceito. */
  const adicionais = entrada!.tambemResponde ?? [];
  const adicional = adicionais.find((x) => x.status === r.statusCode);
  expect([resposta!.status, ...adicionais.map((x) => x.status)], `${chave}: ${r.body}`).toContain(
    r.statusCode,
  );
  const corpo = r.json();
  const lido = (adicional?.resposta ?? resposta!.esquema!).safeParse(corpo);
  expect(lido.success, `${chave} fora do esquema: ${JSON.stringify(lido.error?.issues)}`).toBe(
    true,
  );
  expect(lido.data, `${chave}: o esquema cortou campo que a API devolve`).toEqual(corpo);
  exercitadas.add(chave);
  return corpo;
}

function abertura(endereco: string, extra: Record<string, unknown> = {}) {
  return {
    solicitanteNome: "Marilda Souza Prado",
    canalEntrada: "telefone",
    endereco,
    tipo: "deslizamento",
    coordenada: { lat: -23.5505, lng: -46.6333 },
    descricao: "Talude atrás da casa cedeu depois da chuva da madrugada.",
    ...extra,
  };
}

async function abrir(endereco: string, extra: Record<string, unknown> = {}): Promise<string> {
  const r = await pedir("POST", "/v1/ocorrencias", "helena", abertura(endereco, extra));
  conferir("POST", "/v1/ocorrencias", r);
  return (r.json() as { id: string }).id;
}

async function despachar(id: string): Promise<void> {
  const t = await pedir("POST", `/v1/ocorrencias/${id}/triagem`, "helena", {
    severidade: "critica",
    vulnerabilidadePresente: false,
  });
  conferir("POST", "/v1/ocorrencias/:id/triagem", t);
  const d = await pedir("POST", `/v1/ocorrencias/${id}/despacho`, "helena", {
    equipeId: EQUIPE_ALFA,
    prazoHoras: 4,
  });
  conferir("POST", "/v1/ocorrencias/:id/despacho", d);
}

function vistoria(ocorrenciaId: string, chave: string) {
  const coletadaEm = new Date().toISOString();
  return {
    idempotencyKey: chave,
    ocorrenciaId,
    coletadaEm,
    coletadaPor: DIEGO,
    vistoria: {
      checklist: [
        { chave: "risco_iminente", resposta: true },
        { chave: "evacuacao_necessaria", resposta: true },
        { chave: "interdicao_indicada", resposta: false },
        { chave: "acionar_outro_orgao", resposta: false },
      ],
      fotos: [],
      gpsPrecisaoMetros: 6.2,
      assinanteNome: "Marilda Souza Prado",
      assinaturaChave: null,
      coletadaEm,
      observacoes: "Trinca ativa no talude.",
    },
  };
}

let ocorrenciaA = "";
let ocorrenciaB = "";
let ocorrenciaC = "";
let saidaId = "";
let totalAntes = 0;

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  armazenamento = armazenamentoEmMemoria({ baseUrl: "http://api.local" });
  const buscar: BuscarCabecalhos = async (url) => {
    if (url.href === LINK_CURTO) return { status: 302, location: URL_DE_LUGAR };
    return { status: 200, location: null };
  };
  const lookup: Lookup = async () => ({ address: "172.217.29.14", family: 4 });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-do-contrato-3c2-com-mais-de-trinta-e-dois-bytes",
    LOGIN_POR_IP: "10000",
    ROUTES_KEY: "chave-de-mentira",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco,
    config,
    armazenamento,
    mapa: { buscar, lookup, tempoLimiteMs: 200 },
    rota: {
      buscar: async () => ({
        status: 200,
        text: async () =>
          JSON.stringify({
            routes: [
              {
                duration: "846s",
                distanceMeters: 4213,
                polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" },
              },
            ],
          }),
      }),
    },
  });
  await app.ready();

  // Um agente sem equipe: a resposta de `meu-trabalho` muda de forma para ele.
  await mem.bruto.query(
    `INSERT INTO usuarios (id, organizacao_id, nome, matricula, email, papel, senha_hash)
     VALUES ($1,$2,'Agente Sem Equipe','SA-3499','semequipe@serraalta.exemplo.gov.br',
             'agente_campo',$3)`,
    [SEM_EQUIPE, SERRA_ALTA, HASH_DA_SEMENTE],
  );

  tokens.helena = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
  tokens.diego = await entrar("diego.alves@serraalta.exemplo.gov.br");
  tokens.rita = await entrar("rita.lopes@serraalta.exemplo.gov.br");
  tokens.semEquipe = await entrar("semequipe@serraalta.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("ocorrências: o fluxo da coordenação", () => {
  it("abre, repete a abertura com a mesma chave e lê o que abriu", async () => {
    const chaveDeCriacao = crypto.randomUUID();
    const primeira = await pedir(
      "POST",
      "/v1/ocorrencias",
      "helena",
      abertura("Rua do Talude, 10", { chaveDeCriacao }),
    );
    const corpo = conferir("POST", "/v1/ocorrencias", primeira) as { id: string };
    ocorrenciaA = corpo.id;
    expect(primeira.statusCode).toBe(201);

    const repetida = await pedir(
      "POST",
      "/v1/ocorrencias",
      "helena",
      abertura("Rua do Talude, 10", { chaveDeCriacao }),
    );
    expect(conferir("POST", "/v1/ocorrencias", repetida)).toEqual(corpo);
    expect(repetida.statusCode).toBe(200);
  });

  it("triagem, despacho, mapa, lista, duplicidades e painel de uma ocorrência em campo", async () => {
    await despachar(ocorrenciaA);

    conferir(
      "GET",
      "/v1/ocorrencias",
      await pedir("GET", "/v1/ocorrencias?status=todas", "helena"),
    );
    conferir("GET", "/v1/ocorrencias/mapa", await pedir("GET", "/v1/ocorrencias/mapa", "helena"));
    const dup = await pedir(
      "GET",
      "/v1/ocorrencias/duplicidades/consulta?tipo=deslizamento&endereco=Rua%20do%20Talude",
      "helena",
    );
    const duplicidades = conferir("GET", "/v1/ocorrencias/duplicidades/consulta", dup) as {
      itens: unknown[];
    };
    expect(duplicidades.itens.length).toBeGreaterThan(0);
    const painel = conferir(
      "GET",
      "/v1/ocorrencias/indicadores/painel",
      await pedir("GET", "/v1/ocorrencias/indicadores/painel", "helena"),
    ) as { em_campo: number };
    expect(painel.em_campo).toBeGreaterThan(0);
  });

  it("providência, resposta, correção de coordenada, interdição e encerramento", async () => {
    ocorrenciaB = await abrir("Avenida das Acácias, 300", { coordenada: undefined });
    await despachar(ocorrenciaB);
    // A providência só nasce depois da vistoria: a máquina de estados exige.
    const v = await pedir(
      "POST",
      "/v1/sincronizacao/vistoria",
      "diego",
      vistoria(ocorrenciaB, crypto.randomUUID()),
    );
    conferir("POST", "/v1/sincronizacao/vistoria", v);

    const p = await pedir("POST", `/v1/ocorrencias/${ocorrenciaB}/providencia`, "helena", {
      orgaoDestino: "Secretaria de Obras",
      descricao: "Contenção do talude.",
      responsavel: "Eng. Paulo",
      prazoHoras: 24,
    });
    expect(conferir("POST", "/v1/ocorrencias/:id/providencia", p)).toMatchObject({
      orgaoDestino: "Secretaria de Obras",
    });

    const pendentes = conferir(
      "GET",
      "/v1/ocorrencias/providencias/pendentes",
      await pedir("GET", "/v1/ocorrencias/providencias/pendentes", "helena"),
    ) as { itens: Array<{ id: string; ocorrencia_id: string }> };
    expect(pendentes.itens.length).toBeGreaterThan(0);

    const providenciaId = pendentes.itens.find((i) => i.ocorrencia_id === ocorrenciaB)!.id;
    conferir(
      "POST",
      "/v1/ocorrencias/:id/providencia/:providenciaId/resposta",
      await pedir(
        "POST",
        `/v1/ocorrencias/${ocorrenciaB}/providencia/${providenciaId}/resposta`,
        "helena",
        { desfecho: "atendida", resposta: "Contenção feita.", respondidaPor: "Eng. Paulo" },
      ),
    );

    // Sem ponto na abertura: `anterior` é nulo na primeira correção.
    const c1 = await pedir("POST", `/v1/ocorrencias/${ocorrenciaB}/coordenada`, "helena", {
      coordenada: { lat: -23.5505, lng: -46.6333 },
      motivo: "Ponto conferido com a moradora por telefone.",
    });
    expect(
      (conferir("POST", "/v1/ocorrencias/:id/coordenada", c1) as { anterior: unknown }).anterior,
    ).toBeNull();
    const c2 = await pedir("POST", `/v1/ocorrencias/${ocorrenciaB}/coordenada`, "helena", {
      coordenada: { lat: -23.551, lng: -46.634 },
      motivo: "O ponto estava na quadra de baixo, conferido no local.",
    });
    expect(
      (conferir("POST", "/v1/ocorrencias/:id/coordenada", c2) as { anterior: unknown }).anterior,
    ).not.toBeNull();

    // A interdição nasce do termo de interdição; aqui entra direto, como dono do banco.
    await mem.bruto.query(
      `UPDATE ocorrencias SET interditada_em = now(),
              interditada_por = (SELECT id FROM usuarios WHERE email = 'helena.coutinho@serraalta.exemplo.gov.br')
        WHERE id = $1`,
      [ocorrenciaB],
    );
    const interditados = conferir(
      "GET",
      "/v1/ocorrencias/interditados",
      await pedir("GET", "/v1/ocorrencias/interditados", "helena"),
    ) as { itens: Array<{ id: string }> };
    expect(interditados.itens.map((i) => i.id)).toContain(ocorrenciaB);

    conferir(
      "POST",
      "/v1/ocorrencias/:id/desinterdicao",
      await pedir("POST", `/v1/ocorrencias/${ocorrenciaB}/desinterdicao`, "helena", {
        motivo: "Contenção executada e vistoriada pela engenharia.",
      }),
    );
    const e = conferir(
      "POST",
      "/v1/ocorrencias/:id/encerramento",
      await pedir("POST", `/v1/ocorrencias/${ocorrenciaB}/encerramento`, "helena", {
        motivo: "Obra concluída.",
      }),
    ) as { status: string };
    expect(e.status).toBe("encerrada");
  });
});

describe("campo: o trabalho do agente", () => {
  it("sem equipe, a tela do agente vem vazia e sem os totais", async () => {
    const corpo = conferir(
      "GET",
      "/v1/campo/meu-trabalho",
      await pedir("GET", "/v1/campo/meu-trabalho", "semEquipe"),
    ) as Record<string, unknown>;
    expect(corpo.equipe).toBeNull();
    expect(corpo.totalConcluidas).toBeUndefined();
  });

  it("baixa as tarefas e lê a tela do agente com equipe", async () => {
    const pend = conferir(
      "GET",
      "/v1/sincronizacao/pendencias",
      await pedir("GET", "/v1/sincronizacao/pendencias", "diego"),
    ) as { itens: Array<{ id: string }> };
    expect(pend.itens.map((i) => i.id)).toContain(ocorrenciaA);

    const meu = conferir(
      "GET",
      "/v1/campo/meu-trabalho",
      await pedir("GET", "/v1/campo/meu-trabalho", "diego"),
    ) as { designadas: unknown[]; colegas: unknown[]; totalConcluidas: number };
    expect(meu.designadas.length).toBeGreaterThan(0);
    expect(meu.colegas.length).toBeGreaterThan(0);
    totalAntes = meu.totalConcluidas;
  });

  it("autoriza o envio da foto, guarda os bytes, confirma, lista e lê a URL", async () => {
    const bytes = Buffer.alloc(120, 7);
    const pedido = {
      ocorrenciaId: ocorrenciaA,
      idempotencyKey: crypto.randomUUID(),
      nomeArquivo: "IMG_0001.png",
      tipoConteudo: "image/png",
      tamanhoBytes: bytes.length,
      capturadaEm: new Date().toISOString(),
      legenda: "Trinca na parede dos fundos",
      ordem: 0,
    };
    const a = await pedir("POST", "/v1/evidencias/autorizar-envio", "diego", pedido);
    const autorizacao = conferir("POST", "/v1/evidencias/autorizar-envio", a) as {
      evidenciaId: string;
      chave: string;
      jaEnviada: boolean;
      url?: string;
    };
    expect(autorizacao.jaEnviada).toBe(false);
    expect(autorizacao.url).toBeDefined();

    armazenamento.guardar(autorizacao.chave, bytes, "image/png");
    const c = conferir(
      "POST",
      "/v1/evidencias/confirmar-envio",
      await pedir("POST", "/v1/evidencias/confirmar-envio", "diego", {
        evidenciaId: autorizacao.evidenciaId,
      }),
    ) as { jaEstava: boolean };
    expect(c.jaEstava).toBe(false);

    // Reautorizar a mesma chave com o arquivo já confirmado: a outra forma da resposta.
    const de_novo = await pedir("POST", "/v1/evidencias/autorizar-envio", "diego", pedido);
    const jaEnviada = conferir("POST", "/v1/evidencias/autorizar-envio", de_novo) as {
      jaEnviada: boolean;
      url?: string;
    };
    expect(jaEnviada.jaEnviada).toBe(true);
    expect(jaEnviada.url).toBeUndefined();

    const confirmada = conferir(
      "POST",
      "/v1/evidencias/confirmar-envio",
      await pedir("POST", "/v1/evidencias/confirmar-envio", "diego", {
        evidenciaId: autorizacao.evidenciaId,
      }),
    ) as { jaEstava: boolean };
    expect(confirmada.jaEstava).toBe(true);

    const lista = conferir(
      "GET",
      "/v1/evidencias/ocorrencia/:id",
      await pedir("GET", `/v1/evidencias/ocorrencia/${ocorrenciaA}`, "diego"),
    ) as { itens: unknown[] };
    expect(lista.itens.length).toBe(1);
    conferir(
      "GET",
      "/v1/evidencias/:id/url",
      await pedir("GET", `/v1/evidencias/${autorizacao.evidenciaId}/url`, "diego"),
    );
  });

  it("declara, prorroga, lista, encerra pela coordenação e confirma o retorno", async () => {
    const chave = crypto.randomUUID();
    const corpoDaSaida = {
      idempotencyKey: chave,
      ocorrenciaId: ocorrenciaA,
      agenteId: DIEGO,
      duracaoMinutos: 120,
      sozinho: true,
      declaradaEm: new Date().toISOString(),
    };
    const s = await pedir("POST", "/v1/saida-a-campo", "diego", corpoDaSaida);
    const declarada = conferir("POST", "/v1/saida-a-campo", s) as { saida: { id: string } };
    saidaId = declarada.saida.id;
    expect(s.statusCode).toBe(201);

    const repetida = await pedir("POST", "/v1/saida-a-campo", "diego", corpoDaSaida);
    const igual = conferir("POST", "/v1/saida-a-campo", repetida) as { duplicada: boolean };
    expect(repetida.statusCode).toBe(200);
    expect(igual.duplicada).toBe(true);

    const minha = conferir(
      "GET",
      "/v1/saida-a-campo/minha",
      await pedir("GET", "/v1/saida-a-campo/minha", "diego"),
    ) as { saida: { id: string } | null };
    expect(minha.saida?.id).toBe(saidaId);

    const prorrogacao = {
      idempotencyKey: crypto.randomUUID(),
      saidaId,
      minutosAdicionais: 30,
      pedidaEm: new Date().toISOString(),
    };
    const p = conferir(
      "POST",
      "/v1/saida-a-campo/prorrogar",
      await pedir("POST", "/v1/saida-a-campo/prorrogar", "diego", prorrogacao),
    ) as { duplicada: boolean };
    expect(p.duplicada).toBe(false);
    const p2 = conferir(
      "POST",
      "/v1/saida-a-campo/prorrogar",
      await pedir("POST", "/v1/saida-a-campo/prorrogar", "diego", prorrogacao),
    ) as { duplicada: boolean };
    expect(p2.duplicada).toBe(true);

    const lista = conferir(
      "GET",
      "/v1/saida-a-campo",
      await pedir("GET", "/v1/saida-a-campo", "helena"),
    ) as { emCampo: number };
    expect(lista.emCampo).toBe(1);

    conferir(
      "POST",
      "/v1/saida-a-campo/encerrar",
      await pedir("POST", "/v1/saida-a-campo/encerrar", "helena", {
        saidaId,
        desfecho: "contato_estabelecido",
        observacao: "Falei com ele pelo rádio.",
      }),
    );

    // O retorno do aparelho depois de a coordenação encerrar: não é erro, vem `duplicada`.
    const tardio = conferir(
      "POST",
      "/v1/saida-a-campo/retorno",
      await pedir("POST", "/v1/saida-a-campo/retorno", "diego", {
        idempotencyKey: crypto.randomUUID(),
        saidaId,
        confirmadoEm: new Date().toISOString(),
      }),
    ) as { duplicada: boolean; desfecho: string };
    expect(tardio.duplicada).toBe(true);
    expect(tardio.desfecho).toBe("contato_estabelecido");

    // E o retorno de verdade, numa saída aberta.
    const nova = await pedir("POST", "/v1/saida-a-campo", "diego", {
      ...corpoDaSaida,
      idempotencyKey: crypto.randomUUID(),
    });
    const aberta = conferir("POST", "/v1/saida-a-campo", nova) as { saida: { id: string } };
    const retorno = conferir(
      "POST",
      "/v1/saida-a-campo/retorno",
      await pedir("POST", "/v1/saida-a-campo/retorno", "diego", {
        idempotencyKey: crypto.randomUUID(),
        saidaId: aberta.saida.id,
        confirmadoEm: new Date().toISOString(),
      }),
    ) as { duplicada: boolean; desfecho: string };
    expect(retorno).toMatchObject({ duplicada: false, desfecho: "retorno_confirmado" });
  });

  it("sincroniza a vistoria (e o reenvio) e reconcilia o que saiu da lista do aparelho", async () => {
    const chave = crypto.randomUUID();
    const v = await pedir(
      "POST",
      "/v1/sincronizacao/vistoria",
      "diego",
      vistoria(ocorrenciaA, chave),
    );
    const gravada = conferir("POST", "/v1/sincronizacao/vistoria", v) as {
      vistoriaId: string;
      duplicada: boolean;
    };
    expect(v.statusCode).toBe(201);
    expect(gravada.duplicada).toBe(false);

    const reenvio = await pedir(
      "POST",
      "/v1/sincronizacao/vistoria",
      "diego",
      vistoria(ocorrenciaA, chave),
    );
    const repetida = conferir("POST", "/v1/sincronizacao/vistoria", reenvio) as {
      vistoriaId: string;
      duplicada: boolean;
    };
    expect(reenvio.statusCode).toBe(200);
    expect(repetida).toMatchObject({ vistoriaId: gravada.vistoriaId, duplicada: true });

    const r = conferir(
      "POST",
      "/v1/sincronizacao/pendencias/reconciliar",
      await pedir("POST", "/v1/sincronizacao/pendencias/reconciliar", "diego", {
        conhecidas: [ocorrenciaA],
      }),
    ) as { saidas: Array<{ desfecho: string }> };
    expect(r.saidas.map((s) => s.desfecho)).toEqual(["concluida"]);

    // Nada a explicar: a resposta vazia também é a descrita.
    const vazia = conferir(
      "POST",
      "/v1/sincronizacao/pendencias/reconciliar",
      await pedir("POST", "/v1/sincronizacao/pendencias/reconciliar", "diego", { conhecidas: [] }),
    ) as { saidas: unknown[] };
    expect(vazia.saidas).toEqual([]);

    const meu = conferir(
      "GET",
      "/v1/campo/meu-trabalho",
      await pedir("GET", "/v1/campo/meu-trabalho", "diego"),
    ) as { concluidas: unknown[]; totalConcluidas: number };
    expect(meu.concluidas.length).toBe(meu.totalConcluidas);
    expect(meu.totalConcluidas).toBe(totalAntes + 1);
  });

  it("devolve a tarefa vencida, e a coordenação a vê na lista de devolvidas e no dossiê", async () => {
    ocorrenciaC = await abrir("Travessa da Encosta, 45");
    await despachar(ocorrenciaC);
    await mem.bruto.query(
      "UPDATE ocorrencias SET prazo_em = now() - interval '3 hours' WHERE id = $1",
      [ocorrenciaC],
    );
    const corpo = {
      idempotencyKey: crypto.randomUUID(),
      ocorrenciaId: ocorrenciaC,
      decididaEm: new Date().toISOString(),
      devolvidaPor: DIEGO,
      motivo: "morador_ausente",
      observacao: "Ninguém atendeu o portão.",
    };
    const d = await pedir("POST", "/v1/sincronizacao/devolucao", "diego", corpo);
    const feita = conferir("POST", "/v1/sincronizacao/devolucao", d) as { devolucaoId: string };
    expect(d.statusCode).toBe(201);

    const repetida = await pedir("POST", "/v1/sincronizacao/devolucao", "diego", corpo);
    const igual = conferir("POST", "/v1/sincronizacao/devolucao", repetida) as {
      devolucaoId: string;
      duplicada: boolean;
    };
    expect(repetida.statusCode).toBe(200);
    expect(igual).toMatchObject({ devolucaoId: feita.devolucaoId, duplicada: true });

    const devolvidas = conferir(
      "GET",
      "/v1/ocorrencias/devolvidas",
      await pedir("GET", "/v1/ocorrencias/devolvidas", "helena"),
    ) as { itens: Array<{ id: string; tem_observacao: boolean }> };
    expect(devolvidas.itens.map((i) => i.id)).toEqual([ocorrenciaC]);
    expect(devolvidas.itens[0]!.tem_observacao).toBe(true);

    // O agente que devolveu enxerga o desfecho na reconciliação.
    const rec = conferir(
      "POST",
      "/v1/sincronizacao/pendencias/reconciliar",
      await pedir("POST", "/v1/sincronizacao/pendencias/reconciliar", "diego", {
        conhecidas: [ocorrenciaC],
      }),
    ) as { saidas: Array<{ desfecho: string; motivo: string | null }> };
    expect(rec.saidas[0]).toMatchObject({ desfecho: "devolvida" });
  });

  it("o dossiê traz trilha, vistoria, providências, ligações e a devolução", async () => {
    const dossieDaA = conferir(
      "GET",
      "/v1/ocorrencias/:id",
      await pedir("GET", `/v1/ocorrencias/${ocorrenciaA}`, "helena"),
    ) as { vistoria: unknown; trilha: unknown[] };
    expect(dossieDaA.vistoria).not.toBeNull();
    expect(dossieDaA.trilha.length).toBeGreaterThan(0);

    const dossieDaB = conferir(
      "GET",
      "/v1/ocorrencias/:id",
      await pedir("GET", `/v1/ocorrencias/${ocorrenciaB}`, "helena"),
    ) as { providencias: unknown[] };
    expect(dossieDaB.providencias.length).toBe(1);

    const dossieDaC = conferir(
      "GET",
      "/v1/ocorrencias/:id",
      await pedir("GET", `/v1/ocorrencias/${ocorrenciaC}`, "helena"),
    ) as { devolucao: { motivo: string } | null };
    expect(dossieDaC.devolucao?.motivo).toBe("morador_ausente");

    // E uma ocorrência ligada por duplicidade, nas duas direções.
    const filha = await abrir("Travessa da Encosta, 45", { vinculadaA: ocorrenciaC });
    const daFilha = conferir(
      "GET",
      "/v1/ocorrencias/:id",
      await pedir("GET", `/v1/ocorrencias/${filha}`, "helena"),
    ) as { vinculadaA: { id: string } | null };
    expect(daFilha.vinculadaA?.id).toBe(ocorrenciaC);
    const daMae = conferir(
      "GET",
      "/v1/ocorrencias/:id",
      await pedir("GET", `/v1/ocorrencias/${ocorrenciaC}`, "helena"),
    ) as { vinculadas: unknown[] };
    expect(daMae.vinculadas.length).toBe(1);

    // A lista, agora com ocorrências de vários estados, e com o filtro de texto.
    conferir(
      "GET",
      "/v1/ocorrencias",
      await pedir("GET", "/v1/ocorrencias?status=todas&busca=Encosta&atrasadas=0", "helena"),
    );
    conferir(
      "GET",
      "/v1/ocorrencias/mapa",
      await pedir("GET", "/v1/ocorrencias/mapa?porPagina=2", "diego"),
    );
  });
});

describe("mapa e busca", () => {
  it("resolve o link curto do mapa", async () => {
    const r = conferir(
      "POST",
      "/v1/mapa/resolver-link",
      await pedir("POST", "/v1/mapa/resolver-link", "helena", { url: LINK_CURTO }),
    ) as { latitude: number; longitude: number };
    expect(r.latitude).toBeCloseTo(LAT, 5);
    expect(r.longitude).toBeCloseTo(LNG, 5);
  });

  it("traça o caminho por ruas", async () => {
    const r = conferir(
      "POST",
      "/v1/rota",
      await pedir("POST", "/v1/rota", "diego", {
        origem: { latitude: -27.59, longitude: -48.54 },
        destino: { latitude: LAT, longitude: LNG },
      }),
    ) as { duracaoSegundos: number };
    expect(r.duracaoSegundos).toBe(846);
  });

  it("busca ocorrências (e, para quem administra, usuários, equipes e órgãos)", async () => {
    const achada = conferir(
      "GET",
      "/v1/busca",
      await pedir("GET", "/v1/busca?q=Talude", "helena"),
    ) as { grupos: Array<{ tipo: string }> };
    expect(achada.grupos.map((g) => g.tipo)).toContain("ocorrencia");

    const todos = conferir("GET", "/v1/busca", await pedir("GET", "/v1/busca?q=Diego", "rita")) as {
      grupos: Array<{ tipo: string }>;
    };
    expect(todos.grupos.map((g) => g.tipo)).toContain("usuario");

    const equipe = conferir("GET", "/v1/busca", await pedir("GET", "/v1/busca?q=Alfa", "rita")) as {
      grupos: Array<{ tipo: string }>;
    };
    expect(equipe.grupos.map((g) => g.tipo)).toContain("equipe");

    const orgao = conferir(
      "GET",
      "/v1/busca",
      await pedir("GET", "/v1/busca?q=Secretaria", "rita"),
    ) as { grupos: Array<{ tipo: string }> };
    expect(orgao.grupos.map((g) => g.tipo)).toContain("orgao");
  });
});

describe("cobertura", () => {
  it("toda rota dos três grupos foi chamada contra o esquema de resposta", () => {
    const esperadas = GRUPOS.filter((g) => NOMES_DOS_GRUPOS.includes(g.nome))
      .flatMap((g) => g.rotas.map((r) => chaveDaRota(r)))
      .sort();
    expect(esperadas.length).toBe(34);
    expect([...exercitadas].sort()).toEqual(esperadas);
  });

  it("os três grupos não deixam rota pendente", () => {
    for (const g of GRUPOS.filter((x) => NOMES_DOS_GRUPOS.includes(x.nome))) {
      expect(g.pendentes, g.nome).toEqual([]);
    }
  });
});
