import { writeFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CODIGOS_DA_ENTRADA, CODIGOS_DE_ERRO_DE_ACESSO } from "@dc360/shared";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { derivarSenha } from "../src/auth/senha.js";
import { rotasRegistradas } from "./superficie-registrada.js";

/**
 * A prova DINÂMICA do catálogo de códigos de erro (V2-F00-E05, correção 2).
 *
 * A varredura do fonte (`codigos-de-erro.test.ts`) lê o texto e, por mais forma
 * de emitir que cubra, não alcança o que só existe em tempo de execução: um
 * código calculado, uma classe de outro pacote, uma escrita direta na resposta.
 * Este arquivo fecha essa lacuna pelo outro lado: sobe o servidor real, lê as
 * rotas que ELE registrou (`printRoutes`, e não uma lista escrita aqui, que
 * ficaria velha) e dispara cada uma, com cada perfil de quem pede, em estados
 * negativos: sem token, token lixo, vencido, de outra assinatura, perfil
 * errado, conta desativada, senha provisória, município suspenso, município
 * de fora. Em toda resposta 401 ou 403, o `erro` do corpo TEM de ser do
 * catálogo ou da lista da entrada.
 *
 * O que ele prova e o que não prova: prova o que o servidor RESPONDEU a estes
 * pedidos. Um 403 que só sai com um corpo específico, ou com um estado que os
 * perfis abaixo não criam, não aparece aqui; é a varredura do fonte que o pega.
 * As duas se completam, e nenhuma substitui a outra.
 */

const SENHA = "serra-alta-senha-forte";
const SEGREDO = "segredo-da-prova-dinamica-com-mais-de-32-bytes";

/**
 * O alcance medido da prova (rodar com `SAIDA_ALCANCE=<arquivo.json>` grava a matriz inteira, por rota e por
 * perfil). `passou` = algum pedido da rota terminou em status que não é 401, 403 nem 429, isto é, passou da
 * autenticação e da autorização e chegou ao handler (ainda que para recusar o corpo com 422, 404 ou 409).
 */
const PISO: {
  passamDaAutorizacao: number; comSucesso: number; porPerfil: Record<string, number>; nuncaPassam: string[];
} = {
  // Dobrados pela V2-F02-E01: cada rota de negócio existe em /v1 e no espelho sem prefixo.
  passamDaAutorizacao: 222,
  comSucesso: 94,
  porPerfil: {
    semToken: 18, lixo: 18, vencido: 18, outraAssinatura: 18,
    coordA: 180, agenteA: 122, operadorA: 120, adminA: 198,
    // V2-F03-E03: a vigência vale também na leitura, então a conta desativada, a de senha provisória e a de
    // município suspenso só chegam ao handler das rotas públicas e das que a senha provisória abre (antes: 92, 96 e 106).
    desativadoA: 19, provisoriaA: 23, coordB: 190, suspensoC: 27,
  },
  /*
    As duas rotas do armazenamento local autenticam pela ASSINATURA da URL, que o pedido do teste não tem,
    e por isso todo perfil recebe 403 `assinatura` antes do handler. Quem as exercita de verdade é
    `armazenamento-local.test.ts`. Rota nova que ninguém leva além do 401 ou do 403 reprova aqui.
  */
  nuncaPassam: ["PUT /armazenamento/objeto", "GET /armazenamento/objeto"],
};

let mem: BancoEmMemoria;
let app: FastifyInstance;

const PESSOAS = [
  ["coordA", "A", "coordenador", "helena@serraalta.exemplo.gov.br"],
  ["agenteA", "A", "agente_campo", "diego@serraalta.exemplo.gov.br"],
  ["operadorA", "A", "operador", "olga@serraalta.exemplo.gov.br"],
  ["adminA", "A", "administrador", "ivone@serraalta.exemplo.gov.br"],
  ["desativadoA", "A", "coordenador", "dora@serraalta.exemplo.gov.br"],
  ["provisoriaA", "A", "coordenador", "paula@serraalta.exemplo.gov.br"],
  ["coordB", "B", "coordenador", "aurelio@valefundo.exemplo.gov.br"],
  ["suspensoC", "C", "administrador", "sara@morroazul.exemplo.gov.br"],
] as const;

const tokens: Record<string, string> = {};
let idDoAlvo = "";
let idDaOcorrencia = "";

beforeAll(async () => {
  mem = await bancoEmMemoria();
  const config = carregarConfig({
    NODE_ENV: "test", JWT_SEGREDO: SEGREDO, LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
    // As rotas dobradas em /v1 e no espelho passam o balde de cada pessoa (um só nos dois prefixos) de 300 pedidos por minuto.
    limitePorMinuto: 100_000,
  });
  await app.ready();

  const db = mem.bruto;
  const org: Record<string, string> = {};
  for (const [chave, nome, municipio] of [
    ["A", "DC Serra Alta", "Serra Alta"], ["B", "DC Vale Fundo", "Vale Fundo"], ["C", "DC Morro Azul", "Morro Azul"],
  ] as const) {
    org[chave] = (await db.query<{ id: string }>(
      "INSERT INTO organizacoes (nome,municipio,uf) VALUES ($1,$2,'MG') RETURNING id", [nome, municipio],
    )).rows[0]!.id;
  }
  const hash = await derivarSenha(SENHA);
  let n = 0;
  for (const [, o, papel, email] of PESSOAS) {
    await db.query(
      "INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,senha_hash) VALUES ($1,$2,$3,$4,$5,$6)",
      [org[o], `Pessoa ${n}`, `M-${n++}`, email, papel, hash],
    );
  }
  idDaOcorrencia = (await db.query<{ id: string }>(
    `INSERT INTO ocorrencias (organizacao_id,protocolo,tipo,status,endereco,solicitante_nome,canal_entrada,descricao)
     VALUES ($1,'000001/2026','deslizamento','registrada','Rua das Acacias, 245','Marilda','telefone','Talude cedeu')
     RETURNING id`, [org["A"]],
  )).rows[0]!.id;
  idDoAlvo = (await db.query<{ id: string }>("SELECT id FROM usuarios WHERE email = $1", [PESSOAS[0][3]])).rows[0]!.id;

  // Entra antes de estragar o estado: o login de conta desativada ou suspensa é recusado.
  for (const [nome, , , email] of PESSOAS) {
    const r = await app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA } });
    if (r.statusCode !== 200) throw new Error(`login de ${nome} falhou: ${r.statusCode} ${r.body}`);
    tokens[nome] = r.json().acesso;
  }
  await db.query("UPDATE usuarios SET ativo = false WHERE email = $1", ["dora@serraalta.exemplo.gov.br"]);
  await db.query(
    "UPDATE usuarios SET senha_provisoria_ate = now() + interval '1 hour' WHERE email = $1", ["paula@serraalta.exemplo.gov.br"],
  );
  await db.query(
    "UPDATE organizacoes SET acesso_suspenso_em = now(), suspensao_motivo = 'contrato' WHERE id = $1", [org["C"]],
  );

  const agora = Math.floor(Date.now() / 1000);
  const assinar = (segredo: string, exp: number, papel: string) =>
    new SignJWT({ org: org["A"], papel, nome: "X", sid: "00000000-0000-4000-8000-000000000000" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(idDoAlvo)
      .setIssuer("dc360-api").setAudience("dc360")
      .setIssuedAt(agora - 1200).setExpirationTime(exp).sign(new TextEncoder().encode(segredo));
  tokens["vencido"] = await assinar(SEGREDO, agora - 300, "coordenador");
  tokens["outraAssinatura"] = await assinar("outro-segredo-qualquer-com-mais-de-32-bytes", agora + 600, "administrador");
  tokens["lixo"] = "isto-nao-e-um-jwt";
}, 300_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Prova dinâmica: nenhuma recusa de acesso do servidor real sai fora do catálogo", () => {
  it("em toda rota registrada, com cada perfil, todo 401 e todo 403 traz um `erro` do catálogo e o status do catálogo", async () => {
    const aceitos = new Map<string, readonly number[]>([
      ...Object.entries(CODIGOS_DE_ERRO_DE_ACESSO).map(([c, v]) =>
        [c, c === "acesso_suspenso" ? [403, 503] : [v.status]] as const),
      ...Object.entries(CODIGOS_DA_ENTRADA).map(([c, v]) => [c, [v.status]] as const),
    ]);

    /*
      A lista de rotas é a do servidor MONTADO, lida pela mesma função que
      `superficie.test.ts` e `contrato-do-painel.test.ts` usam, que concatena a
      árvore do Fastify (a primeira versão desta prova lia só as linhas que
      começam com `/`: pedia 39 endereços que não existem e deixava 58 rotas
      reais sem pedido, e um 403 com código novo numa delas passava).
    */
    /*
      As rotas que acabam com a sessão ou mudam a conta de quem está na prova vão por ÚLTIMO: se
      rodassem cedo, os perfis seguintes seriam recusados por sessão encerrada em tudo, e a prova
      deixaria de alcançar as recusas de permissão por posto, de papel e de município.
    */
    const DESTRUTIVAS = /encerrar-sessoes|\/sair|trocar-senha|redefinir-senha|situacao|renovar|segundo-fator|desativacao/;
    const rotas = [...rotasRegistradas(app)].sort((a, b) =>
      Number(DESTRUTIVAS.test(a.caminho)) - Number(DESTRUTIVAS.test(b.caminho)));
    const pares = new Set(rotas.map((r) => `${r.metodo} ${r.caminho}`));
    // Contagem por um caminho independente: cada `(GET, POST)` da árvore, menos HEAD e OPTIONS.
    const contagemIndependente = (app.printRoutes({ commonPrefix: false }).match(/\(([^)]+)\)/g) ?? [])
      .flatMap((g) => g.slice(1, -1).split(",").map((m) => m.trim()))
      .filter((m) => m !== "HEAD" && m !== "OPTIONS").length;
    expect(pares.size, "a leitura da árvore perdeu rotas").toBe(contagemIndependente);
    expect(pares.size, "o servidor registra rotas").toBeGreaterThan(100);

    const quem = ["semToken", "lixo", "vencido", "outraAssinatura", ...PESSOAS.map((p) => p[0])];
    const preencher = (caminho: string) =>
      caminho
        .replace(/\/usuarios\/:id/g, `/usuarios/${idDoAlvo}`)
        .replace(/:[A-Za-z_]+/g, (p) => (/usuario|pessoa/i.test(p) ? idDoAlvo : p === ":chave" || p === ":token" ? "x" : idDaOcorrencia))
        .replace(/\*/g, "x");

    const fora: string[] = [];
    const naoAlcancadas: string[] = [];
    /** O status que chegou, por rota e por perfil (todos os corpos tentados). */
    const alcance = new Map<string, Map<string, Set<string>>>();
    // Endereço de rede DISTINTO em cada pedido: o limitador por endereço (300 por minuto) devolve 429 antes do
    // handler, e sem isto os quatro perfis sem token só chegavam ao handler nas primeiras rotas (a prova
    // ignorava o 429 e passava calada). O limitador continua ligado para o resto da suíte.
    let contador = 0;
    const enderecoNovo = () => {
      contador++;
      return `10.${(contador >> 16) & 255}.${(contador >> 8) & 255}.${contador & 255}`;
    };
    let limitados = 0;
    const pedidos = new Set<string>();
    const vistos = new Map<string, number>();
    let total = 0;
    for (const rota of rotas) {
      const corpos = rota.metodo === "GET" || rota.metodo === "DELETE"
        ? [undefined] : ["{}", '{"motivo":"Motivo bem longo para passar.","ativo":false}'];
      for (const p of quem) {
        for (const corpo of corpos) {
          const headers: Record<string, string> = {};
          if (p !== "semToken") headers["authorization"] = `Bearer ${tokens[p]}`;
          if (corpo !== undefined) headers["content-type"] = "application/json";
          const r = await app.inject({
            method: rota.metodo as "GET", url: preencher(rota.caminho), headers, remoteAddress: enderecoNovo(),
            ...(corpo === undefined ? {} : { payload: corpo }),
          });
          total++;
          pedidos.add(`${rota.metodo} ${rota.caminho}`);
          let dados: { erro?: unknown; mensagem?: unknown } = {};
          try { dados = JSON.parse(r.body) as typeof dados; } catch { /* corpo que não é JSON */ }
          if (r.statusCode === 429) limitados++;
          const chaveRota = `${rota.metodo} ${rota.caminho}`;
          if (!alcance.has(chaveRota)) alcance.set(chaveRota, new Map());
          const porPerfil = alcance.get(chaveRota)!;
          if (!porPerfil.has(p)) porPerfil.set(p, new Set());
          porPerfil.get(p)!.add(typeof dados.erro === "string" && r.statusCode >= 400 ? `${r.statusCode}:${dados.erro}` : String(r.statusCode));
          // 404 do roteador: o endereço pedido não é uma rota. A prova não alcançou o que dizia alcançar.
          if (r.statusCode === 404 && dados.mensagem === "Rota não encontrada.") {
            naoAlcancadas.push(`${rota.metodo} ${rota.caminho} (${preencher(rota.caminho)})`);
          }
          if (r.statusCode !== 401 && r.statusCode !== 403) continue;
          const erro = dados.erro;
          const chave = `${r.statusCode} ${String(erro)}`;
          vistos.set(chave, (vistos.get(chave) ?? 0) + 1);
          const statusPermitidos = typeof erro === "string" ? aceitos.get(erro) : undefined;
          if (!statusPermitidos || !statusPermitidos.includes(r.statusCode)) {
            fora.push(`${rota.metodo} ${rota.caminho} como ${p}: ${r.statusCode} ${r.body.slice(0, 160)}`);
          }
        }
      }
    }
    // Cobertura: TODO par método + caminho registrado foi pedido, e nenhum pedido caiu fora das rotas.
    expect([...pares].filter((x) => !pedidos.has(x)), "rotas registradas que a prova não pediu").toEqual([]);
    expect(pedidos.size).toBe(pares.size);
    expect([...new Set(naoAlcancadas)], "pedidos que o roteador não reconheceu").toEqual([]);
    expect(total, "a prova disparou pedidos de verdade").toBeGreaterThan(1500);
    expect(fora).toEqual([]);

    // ---- Alcance: o que a prova EXERCITOU de verdade, e não só o que ela pediu ----
    expect(limitados, "429 do limitador antes do handler: a prova não alcançou o handler desses pedidos").toBe(0);
    const statusDe = (r: string, perfil: string) => [...(alcance.get(r)?.get(perfil) ?? [])];
    const passou = (st: string) => !/^(401|403|429)\b/.test(st);        // passou da autenticação e da autorização
    const deuCerto = (st: string) => /^2\d\d$/.test(st);
    const nuncaPassam = [...pares].filter((r) => ![...(alcance.get(r)?.values() ?? [])].some((ss) => [...ss].some(passou)));
    const com2xx = [...pares].filter((r) => [...(alcance.get(r)?.values() ?? [])].some((ss) => [...ss].some(deuCerto))).length;
    const passamDaAutorizacao = pares.size - nuncaPassam.length;
    const porPerfil = Object.fromEntries(quem.map((p) => [p, {
      passouDaAutorizacao: [...pares].filter((r) => statusDe(r, p).some(passou)).length,
      deuCerto: [...pares].filter((r) => statusDe(r, p).some(deuCerto)).length,
    }]));
    if (process.env["SAIDA_ALCANCE"]) {
      writeFileSync(process.env["SAIDA_ALCANCE"], JSON.stringify({
        pares: pares.size, pedidos: total, limitados, passamDaAutorizacao, comRespostaDeSucesso: com2xx,
        nuncaPassamDaAutorizacao: nuncaPassam, porPerfil,
        matriz: Object.fromEntries([...alcance].map(([r, m]) => [r, Object.fromEntries([...m].map(([p, ss]) => [p, [...ss]]))])),
      }, null, 2));
    }
    // Pisos declarados: a cobertura do handler não pode cair abaixo disto sem que alguém mude o número aqui
    // (e o README, que cita a mesma medida).
    expect(passamDaAutorizacao, "rotas cujo handler a prova alcança com algum perfil").toBeGreaterThanOrEqual(PISO.passamDaAutorizacao);
    expect(com2xx, "rotas em que algum perfil recebeu 2xx").toBeGreaterThanOrEqual(PISO.comSucesso);
    for (const [perfil, piso] of Object.entries(PISO.porPerfil)) {
      expect(porPerfil[perfil]!.passouDaAutorizacao, `rotas alcançadas no handler como ${perfil}`).toBeGreaterThanOrEqual(piso);
    }
    expect(nuncaPassam, "rotas que NENHUM perfil leva além do 401 ou 403: a prova só exercita a recusa delas").toEqual(PISO.nuncaPassam);

    // Controle de que a prova enxerga o que importa: os estados negativos produziram os códigos esperados.
    const codigosVistos = new Set([...vistos.keys()].map((k) => k.split(" ")[1]!));
    for (const esperado of [
      "nao_autenticado", "sem_permissao", "conta_desativada", "troca_de_senha_obrigatoria", "acesso_suspenso", "assinatura",
    ]) {
      expect(codigosVistos.has(esperado), `nenhum pedido produziu ${esperado}`).toBe(true);
    }
  }, 280_000);
});
