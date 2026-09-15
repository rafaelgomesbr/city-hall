import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import {
  armazenamentoEmMemoria, type ArmazenamentoEmMemoria,
} from "../src/armazenamento/memoria.js";
import { TAMANHO_MAXIMO_DA_FOTO_DE_PERFIL } from "../src/rotas/usuarios-eu.js";

/**
 * A foto de perfil do servidor, do pedido de autorização à tela da equipe.
 *
 * Ela é a segunda coisa deste produto que vive no armazenamento e aponta para
 * uma pessoa, e a primeira que a própria pessoa escolhe. O que estes casos
 * conferem não é "o upload funciona": é que o cliente não escolhe a chave, que
 * a chave carrega o município E o próprio usuário, que ninguém grava foto
 * apontando para objeto de outro (nem para fotografia de vistoria), que trocar
 * a foto apaga a anterior do armazenamento e deixa o rastro do que apagou, e
 * que a foto chega à equipe pela rota que a equipe já lê.
 */

const SENHA = "defesa-civil-2026";
const ORG_SERRA_ALTA = "11111111-1111-4111-8111-000000000001";
const DIEGO = "11111111-1111-4111-8111-0000000000d3";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
/** Outros bytes, para a troca ser visível no armazenamento. */
const OUTRO_PNG = Buffer.concat([PIXEL_PNG, Buffer.from([0])]);

let mem: BancoEmMemoria;
let app: FastifyInstance;
let armazenamento: ArmazenamentoEmMemoria;
let tokenDiego: string;
let tokenHelena: string;
let tokenRita: string;
let tokenDeFora: string;

async function entrar(email: string): Promise<string> {
  const r = await app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA } });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

function com(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function autorizar(token: string, extras: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST", url: "/usuarios/eu/foto/autorizar-envio", headers: com(token),
    payload: { tipoConteudo: "image/png", tamanhoBytes: PIXEL_PNG.length, ...extras },
  });
}

async function enviarBytes(url: string, cabecalhos: Record<string, string>, corpo = PIXEL_PNG) {
  const alvo = new URL(url);
  return app.inject({
    method: "PUT",
    url: alvo.pathname + alvo.search,
    headers: { ...cabecalhos, "content-length": String(corpo.length) },
    payload: corpo,
  });
}

/** O caminho inteiro, como o aparelho faz: autorizar, subir os bytes, confirmar. */
async function trocarFoto(token: string, corpo = PIXEL_PNG): Promise<{ chave: string; fotoUrl: string }> {
  const a = await autorizar(token, { tamanhoBytes: corpo.length });
  expect(a.statusCode).toBe(201);
  const { chave, url, cabecalhos } = a.json();
  const subiu = await enviarBytes(url, cabecalhos, corpo);
  expect(subiu.statusCode).toBe(200);
  const confirmada = await app.inject({
    method: "PUT", url: "/usuarios/eu/foto", headers: com(token), payload: { chave },
  });
  expect(confirmada.statusCode).toBe(200);
  return { chave, fotoUrl: confirmada.json().fotoUrl };
}

async function fotoChaveNoBanco(usuarioId: string): Promise<string | null> {
  const r = await mem.banco.comTenant(ORG_SERRA_ALTA, (c) =>
    c.query<{ foto_chave: string | null }>(
      "SELECT foto_chave FROM usuarios WHERE id = $1", [usuarioId],
    ));
  return r.rows[0]?.foto_chave ?? null;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-da-foto-do-agente-com-mais-de-32-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);

  armazenamento = armazenamentoEmMemoria({ baseUrl: "http://api.local" });
  app = await construirServidor({ banco: mem.banco, config, armazenamento });
  await app.ready();

  tokenDiego = await entrar("diego.alves@serraalta.exemplo.gov.br");
  tokenHelena = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
  tokenRita = await entrar("rita.lopes@serraalta.exemplo.gov.br");
  tokenDeFora = await entrar("tarcisio.ramos@valefundo.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Autorização de envio da foto", () => {
  it("o servidor decide a chave, e ela carrega o município e o próprio usuário", async () => {
    const r = await autorizar(tokenDiego);

    expect(r.statusCode).toBe(201);
    const { chave, url, cabecalhos, expiraEm } = r.json();
    expect(chave).toMatch(new RegExp(`^tenant/${ORG_SERRA_ALTA}/usuarios/${DIEGO}/`));
    expect(url).toContain("assinatura=");
    expect(cabecalhos["content-length"]).toBe(String(PIXEL_PNG.length));
    expect(typeof expiraEm).toBe("string");
  });

  it("qualquer papel autenticado pode ter foto: a coordenadora também", async () => {
    const r = await autorizar(tokenHelena);
    expect(r.statusCode).toBe(201);
  });

  it("recusa arquivo acima do teto de foto de perfil, que é menor que o de evidência", async () => {
    const r = await autorizar(tokenDiego, { tamanhoBytes: TAMANHO_MAXIMO_DA_FOTO_DE_PERFIL + 1 });
    expect(r.statusCode).toBe(422);
  });

  it("recusa tipo que não é imagem", async () => {
    const r = await autorizar(tokenDiego, { tipoConteudo: "application/pdf" });
    expect(r.statusCode).toBe(422);
  });

  it("sem token, nada", async () => {
    const r = await app.inject({
      method: "POST", url: "/usuarios/eu/foto/autorizar-envio",
      payload: { tipoConteudo: "image/png", tamanhoBytes: 10 },
    });
    expect(r.statusCode).toBe(401);
  });
});

describe("Confirmar a foto", () => {
  it("grava a chave, e quem sou eu passa a devolver a URL assinada", async () => {
    const { chave, fotoUrl } = await trocarFoto(tokenDiego);

    expect(await fotoChaveNoBanco(DIEGO)).toBe(chave);
    expect(fotoUrl).toContain("assinatura=");

    const eu = await app.inject({ method: "GET", url: "/usuarios/eu", headers: com(tokenDiego) });
    expect(eu.statusCode).toBe(200);
    expect(eu.json().fotoUrl).toContain("assinatura=");
    expect(eu.json().id).toBe(DIEGO);
    expect(eu.json().email).toBe("diego.alves@serraalta.exemplo.gov.br");
    /* A chave crua NUNCA sai para a tela: quem a tem poderia montar caminho
       de armazenamento, e a única forma legítima de ler é a URL que vence. */
    expect(JSON.stringify(eu.json())).not.toContain("tenant/");
  });

  it("recusa confirmar chave cujo arquivo não chegou, e não toca no banco", async () => {
    const antes = await fotoChaveNoBanco(DIEGO);
    const a = await autorizar(tokenDiego);
    const { chave } = a.json();

    const r = await app.inject({
      method: "PUT", url: "/usuarios/eu/foto", headers: com(tokenDiego), payload: { chave },
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toBe("arquivo_ausente");
    expect(await fotoChaveNoBanco(DIEGO)).toBe(antes);
  });

  it("recusa chave fora do prefixo do próprio usuário, mesmo que o objeto exista", async () => {
    /*
      A chave existe de verdade no armazenamento, sob o prefixo de OUTRO
      usuário do mesmo município: é a foto da coordenadora. Aceitar aqui faria
      o rosto dela aparecer embaixo do nome do Diego na tela da equipe.
    */
    const daHelena = await trocarFoto(tokenHelena);
    const antes = await fotoChaveNoBanco(DIEGO);

    const r = await app.inject({
      method: "PUT", url: "/usuarios/eu/foto", headers: com(tokenDiego),
      payload: { chave: daHelena.chave },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().erro).toBe("chave_fora_do_lugar");
    expect(await fotoChaveNoBanco(DIEGO)).toBe(antes);
    // E a foto da coordenadora continua lá, intacta.
    expect(armazenamento.ler(daHelena.chave)).not.toBeNull();
  });

  it("recusa chave de fotografia de vistoria: prova de ato não vira retrato", async () => {
    const chaveDeEvidencia = `tenant/${ORG_SERRA_ALTA}/ocorrencias/11111111-1111-4111-8111-0000000000c3/foto.jpg`;
    armazenamento.guardar(chaveDeEvidencia, PIXEL_PNG, "image/png");

    const r = await app.inject({
      method: "PUT", url: "/usuarios/eu/foto", headers: com(tokenDiego),
      payload: { chave: chaveDeEvidencia },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().erro).toBe("chave_fora_do_lugar");
  });

  it("recusa chave com o prefixo certo e o município errado", async () => {
    const r = await app.inject({
      method: "PUT", url: "/usuarios/eu/foto", headers: com(tokenDeFora),
      payload: { chave: `tenant/${ORG_SERRA_ALTA}/usuarios/${DIEGO}/foto.jpg` },
    });
    expect(r.statusCode).toBe(422);
  });
});

describe("Trocar a foto apaga a anterior, com rastro", () => {
  it("a chave antiga some do armazenamento, a nova fica, e a trilha guarda as duas", async () => {
    const primeira = await trocarFoto(tokenDiego, PIXEL_PNG);
    expect(armazenamento.ler(primeira.chave)).not.toBeNull();

    const segunda = await trocarFoto(tokenDiego, OUTRO_PNG);
    expect(segunda.chave).not.toBe(primeira.chave);

    /*
      O ÚNICO apagamento de objeto deste produto fora do descarte de órfão, e
      o argumento está na rota: a foto antiga não é prova de nada, é o retrato
      do servidor, e foi ele mesmo quem a trocou.
    */
    expect(armazenamento.ler(primeira.chave)).toBeNull();
    expect(armazenamento.ler(segunda.chave)?.corpo.equals(OUTRO_PNG)).toBe(true);
    expect(await fotoChaveNoBanco(DIEGO)).toBe(segunda.chave);

    const trilha = await mem.banco.comTenant(ORG_SERRA_ALTA, (c) =>
      c.query<{ acao: string; antes: { fotoChave: string | null }; depois: { fotoChave: string | null } }>(
        `SELECT acao, antes, depois FROM trilha_administrativa
          WHERE alvo_id = $1 AND acao = 'foto_trocada'
          ORDER BY registrado_em DESC LIMIT 1`,
        [DIEGO],
      ));
    expect(trilha.rows[0]?.antes.fotoChave).toBe(primeira.chave);
    expect(trilha.rows[0]?.depois.fotoChave).toBe(segunda.chave);
  });

  it("confirmar a mesma chave duas vezes não apaga a própria foto", async () => {
    const atual = await trocarFoto(tokenDiego, PIXEL_PNG);
    const r = await app.inject({
      method: "PUT", url: "/usuarios/eu/foto", headers: com(tokenDiego),
      payload: { chave: atual.chave },
    });
    expect(r.statusCode).toBe(200);
    expect(armazenamento.ler(atual.chave)).not.toBeNull();
    expect(await fotoChaveNoBanco(DIEGO)).toBe(atual.chave);
  });
});

describe("Remover a foto", () => {
  it("zera a chave, apaga o objeto e responde sem foto em quem sou eu", async () => {
    const atual = await trocarFoto(tokenDiego);

    const r = await app.inject({ method: "DELETE", url: "/usuarios/eu/foto", headers: com(tokenDiego) });
    expect(r.statusCode).toBe(204);

    expect(await fotoChaveNoBanco(DIEGO)).toBeNull();
    expect(armazenamento.ler(atual.chave)).toBeNull();

    const eu = await app.inject({ method: "GET", url: "/usuarios/eu", headers: com(tokenDiego) });
    expect(eu.json().fotoUrl).toBeNull();

    const trilha = await mem.banco.comTenant(ORG_SERRA_ALTA, (c) =>
      c.query<{ acao: string }>(
        "SELECT acao FROM trilha_administrativa WHERE alvo_id = $1 AND acao = 'foto_removida'",
        [DIEGO],
      ));
    expect(trilha.rows.length).toBeGreaterThan(0);
  });

  it("remover sem ter foto é inofensivo", async () => {
    const r = await app.inject({ method: "DELETE", url: "/usuarios/eu/foto", headers: com(tokenDiego) });
    expect(r.statusCode).toBe(204);
  });
});

describe("A equipe vê a foto e quem está em campo", () => {
  it("meu trabalho traz a URL assinada do colega, e nunca a chave", async () => {
    /* Um segundo agente na Equipe Alfa, para o Diego ter colega. */
    const criado = await app.inject({
      method: "POST", url: "/usuarios", headers: com(tokenRita),
      payload: {
        nome: "Marina Costa", matricula: "SA-7001",
        email: "marina.costa@serraalta.exemplo.gov.br", senha: SENHA,
        papel: "agente_campo", equipeId: EQUIPE_ALFA,
      },
    });
    expect(criado.statusCode).toBe(201);
    const tokenMarina = await entrar("marina.costa@serraalta.exemplo.gov.br");
    const daMarina = await trocarFoto(tokenMarina);

    const r = await app.inject({ method: "GET", url: "/campo/meu-trabalho", headers: com(tokenDiego) });
    expect(r.statusCode).toBe(200);
    const colegas: Array<{ id: string; nome: string; fotoUrl: string | null; emCampo: boolean }> =
      r.json().colegas;
    const marina = colegas.find((c) => c.nome === "Marina Costa");
    expect(marina?.fotoUrl).toContain("assinatura=");
    expect(marina?.emCampo).toBe(false);
    expect(JSON.stringify(r.json())).not.toContain(daMarina.chave);
    /* Colega sem foto vem com `null`, e não com campo ausente: a tela decide
       entre foto e iniciais por esse valor. */
    const diego = colegas.find((c) => c.id === DIEGO);
    expect(diego).toBeTruthy();
    expect("fotoUrl" in diego!).toBe(true);
  });

  it("quem declarou saída a campo aparece em campo para a equipe", async () => {
    const criar = await app.inject({
      method: "POST", url: "/ocorrencias", headers: com(tokenHelena),
      payload: {
        solicitanteNome: "Moradora", canalEntrada: "telefone", endereco: "Rua do Talude, 9",
        tipo: "deslizamento", descricao: "Talude cedeu.",
      },
    });
    const ocorrenciaId = criar.json().id;
    await app.inject({
      method: "POST", url: `/ocorrencias/${ocorrenciaId}/triagem`, headers: com(tokenHelena),
      payload: { severidade: "alta", vulnerabilidadePresente: false },
    });
    await app.inject({
      method: "POST", url: `/ocorrencias/${ocorrenciaId}/despacho`, headers: com(tokenHelena),
      payload: { equipeId: EQUIPE_ALFA, prazoHoras: 24 },
    });
    const saida = await app.inject({
      method: "POST", url: "/saida-a-campo", headers: com(tokenDiego),
      payload: {
        idempotencyKey: crypto.randomUUID(), ocorrenciaId, agenteId: DIEGO,
        duracaoMinutos: 120, sozinho: true, declaradaEm: new Date().toISOString(),
      },
    });
    expect(saida.statusCode).toBe(201);

    const r = await app.inject({ method: "GET", url: "/campo/meu-trabalho", headers: com(tokenDiego) });
    const diego = (r.json().colegas as Array<{ id: string; emCampo: boolean }>).find((c) => c.id === DIEGO);
    expect(diego?.emCampo).toBe(true);
  });

  it("cada concluída diz quando foi despachada, para a tela medir o tempo até a vistoria", async () => {
    const r = await app.inject({ method: "GET", url: "/campo/meu-trabalho", headers: com(tokenDiego) });
    const concluidas: Array<Record<string, unknown>> = r.json().concluidas;
    expect(concluidas.length).toBeGreaterThan(0);
    for (const v of concluidas) expect("despachada_em" in v).toBe(true);
    expect(typeof r.json().devolvidasNoMes).toBe("number");
  });
});
