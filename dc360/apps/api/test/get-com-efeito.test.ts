import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { rotasRegistradas, SEM_TOKEN } from "./superficie-registrada.js";

/**
 * A vigência vale para a ESCRITA, e escrita não é só o método (V2-F00-E04,
 * correção 1).
 *
 * O DEFEITO QUE A VALIDAÇÃO PROVOU em 7005a60: `exigirAutenticacao` decidia
 * "isto escreve" por `req.method !== "GET" && req.method !== "HEAD"`. Só que
 * este produto tem GET que escreve: abrir o termo de interdição É interditar o
 * imóvel e grava `documento_emitido` na trilha; abrir o laudo e os termos
 * grava o acesso; baixar o CSV grava `exportacoes` e, no nível completo, a
 * trilha administrativa. Com conta desativada, papel rebaixado ou sessão
 * encerrada o GET passava sem conferir nada, e o imóvel era interditado por
 * quem já não podia.
 *
 * O CONSERTO é uma marca na configuração da rota (`ROTA_GET_COM_EFEITO`), do
 * mesmo jeito que `filaDoCampo`. Este arquivo trava três coisas:
 *
 * 1. A LISTA EXPLÍCITA das rotas GET marcadas (`COM_EFEITO`), conferida pelo
 *    comportamento: com a conta desativada, uma rota GET responde
 *    `conta_desativada` SE E SÓ SE está na lista. Rota nova que escreve e não
 *    foi marcada não aparece na lista nem responde assim, e a varredura de
 *    fonte abaixo a denuncia; marca esquecida numa rota que só lê também
 *    reprova (a lista é a decisão, e ela é revisada).
 * 2. As quatro sondas (conta desativada, papel rebaixado, sessão encerrada e
 *    cadeia encerrada) contra o termo de interdição, o laudo, o termo de
 *    desinterdição, os PDFs e o CSV, em GET e em HEAD: a MESMA resposta que
 *    uma escrita teria, e NADA gravado.
 * 3. A varredura de PATCH, PUT, DELETE e POST com conta desativada, que a
 *    validação apontou como sem cobertura.
 */

const SENHA = "defesa-civil-2026";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";
const HELENA = "11111111-1111-4111-8111-0000000000d1";
const OC_ALFA_1 = "11111111-1111-4111-8111-0000000000c1";
const EMAIL_HELENA = "helena.coutinho@serraalta.exemplo.gov.br";
const EMAIL_RITA = "rita.lopes@serraalta.exemplo.gov.br";
const EMAIL_DIEGO = "diego.alves@serraalta.exemplo.gov.br";
const ID_FALSO = "00000000-0000-4000-8000-000000000000";
const MOTIVO =
  "Contenção do talude executada pela Secretaria de Obras e conferida em nova "
  + "vistoria técnica. Sem trincas ativas.";

/**
 * AS ROTAS GET QUE ESCREVEM, na forma "MÉTODO caminho" que `printRoutes`
 * descreve. Esta lista é a decisão e é de propósito escrita à mão: acrescentar
 * uma rota aqui é afirmar que ela muda estado ou grava registro, e tirar uma
 * é afirmar que parou de gravar.
 *
 * Por que cada uma:
 * - laudo, termos e PDFs: `registrarEmissao` (trilha), `registrarConsulta`
 *   (acesso a dado de cidadão) e, no termo de interdição, `interditada_em`.
 * - CSV: `exportacoes` e, no nível completo, a trilha administrativa.
 * - `GET /avisos`: materializa prazos vencidos e expurga avisos velhos.
 *
 * O que NÃO está na lista, de propósito: `GET /ocorrencias/:id` e `GET /busca`.
 * Eles também escrevem, mas só o registro de que foram lidos
 * (`registrarConsulta`, `privacidade/consulta.ts`): é a auditoria da própria
 * leitura, e a vigência da leitura é da F03-E03. Marcá-los antecipa essa
 * etapa e contradiz `acesso-suspenso.test.ts`. O critério é "o GET pratica um
 * ato ou muda dado do município".
 */
const COM_EFEITO = [
  "GET /documentos/:id/laudo",
  "GET /documentos/:id/laudo.pdf",
  "GET /documentos/:id/termo-de-interdicao",
  "GET /documentos/:id/termo-de-interdicao.pdf",
  "GET /documentos/:id/termo-de-desinterdicao",
  "GET /relatorios/ocorrencias.csv",
  // O Fastify registra o prefixo com e sem a barra final.
  "GET /avisos",
  "GET /avisos/",
];

let mem: BancoEmMemoria;
let app: FastifyInstance;
let idB: string;

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrarCompleto(email: string): Promise<{ acesso: string; renovacao: string }> {
  const r = await app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA } });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return { acesso: r.json().acesso, renovacao: r.json().renovacao };
}
const entrar = async (email: string) => (await entrarCompleto(email)).acesso;

async function vistoriar(tokenAgente: string, ocorrenciaId: string): Promise<void> {
  const coletadaEm = new Date().toISOString();
  const s = await app.inject({
    method: "POST", url: "/sincronizacao/vistoria", headers: com(tokenAgente),
    payload: {
      idempotencyKey: crypto.randomUUID(),
      ocorrenciaId,
      coletadaEm,
      vistoria: {
        checklist: [
          { chave: "risco_iminente", resposta: true },
          { chave: "evacuacao_necessaria", resposta: true },
          { chave: "interdicao_indicada", resposta: true },
          { chave: "acionar_outro_orgao", resposta: false },
        ],
        fotos: [], gpsPrecisaoMetros: 6.2,
        assinanteNome: "Marilda Souza Prado", assinaturaChave: null,
        coletadaEm, observacoes: "Talude com trinca ativa.",
      },
    },
  });
  if (s.statusCode !== 201) throw new Error(`sincronizacao falhou: ${s.body}`);
}

/** Uma ocorrência vistoriada com interdição indicada e AINDA NÃO interditada. */
async function ocorrenciaInterditavel(endereco: string): Promise<string> {
  const coord = await entrar(EMAIL_HELENA);
  const agente = await entrar(EMAIL_DIEGO);
  const criar = await app.inject({
    method: "POST", url: "/ocorrencias", headers: com(coord),
    payload: {
      solicitanteNome: "Marilda Souza Prado", canalEntrada: "telefone",
      endereco, tipo: "deslizamento",
      descricao: "Talude atrás da casa cedeu depois da chuva da madrugada.",
      coordenada: { lat: -22.4187, lng: -45.4523 },
    },
  });
  if (criar.statusCode !== 201) throw new Error(`criar falhou: ${criar.body}`);
  const { id } = criar.json();
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: com(coord),
    payload: {
      severidade: "critica", vulnerabilidadePresente: true,
      vulnerabilidadeDescricao: "Idosa acamada na residência.",
    },
  });
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/despacho`, headers: com(coord),
    payload: { equipeId: EQUIPE_ALFA, prazoHoras: 4 },
  });
  await vistoriar(agente, id);
  return id;
}

async function restaurarHelena(): Promise<void> {
  await mem.bruto.query(
    "UPDATE usuarios SET ativo = true, papel = 'coordenador' WHERE id = $1", [HELENA],
  );
}

/** O que o servidor GRAVOU: contadores das tabelas que um GET indevido tocaria. */
async function pegadas(idTermo: string): Promise<Record<string, unknown>> {
  const n = async (sql: string, p: unknown[] = []) =>
    Number((await mem.bruto.query<{ n: string }>(sql, p)).rows[0]!.n);
  const interditada = await mem.bruto.query<{ interditada_em: string | null }>(
    "SELECT interditada_em FROM ocorrencias WHERE id = $1", [idTermo],
  );
  return {
    documentoEmitido: await n("SELECT count(*)::text AS n FROM trilha_eventos WHERE tipo = 'documento_emitido'"),
    trilhaTotal: await n("SELECT count(*)::text AS n FROM trilha_eventos"),
    consultas: await n("SELECT count(*)::text AS n FROM ocorrencia_consultas"),
    exportacoes: await n("SELECT count(*)::text AS n FROM exportacoes"),
    interditadaEm: interditada.rows[0]!.interditada_em,
  };
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-do-get-com-efeito-com-mais-de-32-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
    // Um gerador de mentira: o que importa aqui é a ORDEM entre conferir a
    // vigência e gravar, e sem gerador o PDF responde 503 antes de gravar.
    pdf: { gerar: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]), encerrar: async () => undefined },
  });
  await app.ready();

  // B: interditada e depois levantada. Serve ao laudo e ao termo de desinterdição.
  idB = await ocorrenciaInterditavel("Rua do Mirante, 88");
  const coord = await entrar(EMAIL_HELENA);
  const termo = await app.inject({
    method: "GET", url: `/documentos/${idB}/termo-de-interdicao`, headers: com(coord),
  });
  if (termo.statusCode !== 200) throw new Error(`termo falhou: ${termo.body}`);
  const levantou = await app.inject({
    method: "POST", url: `/ocorrencias/${idB}/desinterdicao`, headers: com(coord),
    payload: { motivo: MOTIVO },
  });
  if (levantou.statusCode !== 200) throw new Error(`desinterdição falhou: ${levantou.body}`);
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Controle: quem está vigente continua emitindo, e as pegadas enxergam a escrita", () => {
  it("termo de interdição interdita e grava; o CSV grava a exportação", async () => {
    const id = await ocorrenciaInterditavel("Rua das Acácias, 12");
    const coord = await entrar(EMAIL_HELENA);
    const antes = await pegadas(id);
    expect(antes.interditadaEm).toBeNull();

    const termo = await app.inject({
      method: "GET", url: `/documentos/${id}/termo-de-interdicao`, headers: com(coord),
    });
    expect(termo.statusCode, termo.body).toBe(200);
    const csv = await app.inject({
      method: "GET", url: "/relatorios/ocorrencias.csv", headers: com(coord),
    });
    expect(csv.statusCode, csv.body).toBe(200);

    const depois = await pegadas(id);
    expect(depois.interditadaEm).not.toBeNull();
    expect(depois.documentoEmitido).toBe((antes.documentoEmitido as number) + 1);
    expect(depois.consultas).toBeGreaterThan(antes.consultas as number);
    expect(depois.exportacoes).toBe((antes.exportacoes as number) + 1);
  });
});

type Sonda = {
  nome: string;
  /** Devolve o token que a sonda vai apresentar, já com o estado do banco virado. */
  armar(): Promise<string>;
  esperado: { status: number; erro: string };
};

const SONDAS: Sonda[] = [
  {
    nome: "conta desativada",
    async armar() {
      const token = await entrar(EMAIL_HELENA);
      await mem.bruto.query("UPDATE usuarios SET ativo = false WHERE id = $1", [HELENA]);
      return token;
    },
    esperado: { status: 403, erro: "conta_desativada" },
  },
  {
    nome: "papel rebaixado",
    async armar() {
      const token = await entrar(EMAIL_HELENA);
      await mem.bruto.query("UPDATE usuarios SET papel = 'operador' WHERE id = $1", [HELENA]);
      return token;
    },
    esperado: { status: 401, erro: "nao_autenticado" },
  },
  {
    nome: "sessão encerrada por quem administra",
    async armar() {
      const token = await entrar(EMAIL_HELENA);
      const rita = await entrar(EMAIL_RITA);
      const r = await app.inject({
        method: "POST", url: `/usuarios/${HELENA}/encerrar-sessoes`, headers: com(rita),
      });
      expect(r.statusCode, r.body).toBe(200);
      return token;
    },
    esperado: { status: 401, erro: "sessao_encerrada" },
  },
  {
    nome: "cadeia encerrada depois da renovação (token anterior à rotação)",
    async armar() {
      const { acesso, renovacao } = await entrarCompleto(EMAIL_HELENA);
      const nova = await app.inject({ method: "POST", url: "/auth/renovar", payload: { renovacao } });
      expect(nova.statusCode, nova.body).toBe(200);
      const rita = await entrar(EMAIL_RITA);
      const r = await app.inject({
        method: "POST", url: `/usuarios/${HELENA}/encerrar-sessoes`, headers: com(rita),
      });
      expect(r.statusCode, r.body).toBe(200);
      // O token ANTIGO: a sessão dele foi rotacionada, mas a cadeia caiu.
      return acesso;
    },
    esperado: { status: 401, erro: "sessao_encerrada" },
  },
];

describe("Sondas contra os GET que escrevem: mesma resposta de uma escrita, e nada gravado", () => {
  for (const sonda of SONDAS) {
    it(`${sonda.nome}: termo de interdição, laudo, termo de desinterdição, PDFs e CSV, em GET e HEAD`, async () => {
      const idTermo = await ocorrenciaInterditavel(`Travessa ${sonda.nome.length}, ${sonda.nome.length * 7}`);
      const token = await sonda.armar();
      try {
        // A referência é uma ESCRITA com o mesmo token: o GET tem de responder igual.
        const escrita = await app.inject({
          method: "POST", url: `/ocorrencias/${OC_ALFA_1}/coordenada`, headers: com(token),
          payload: { coordenada: { lat: -22.41, lng: -45.45 }, motivo: "Ponto conferido no local pela equipe." },
        });
        expect(escrita.statusCode, escrita.body).toBe(sonda.esperado.status);
        expect(escrita.json().erro).toBe(sonda.esperado.erro);

        const antes = await pegadas(idTermo);
        const alvos: Array<[string, string]> = [
          ["termo de interdição", `/documentos/${idTermo}/termo-de-interdicao`],
          ["termo de interdição em PDF", `/documentos/${idTermo}/termo-de-interdicao.pdf`],
          ["laudo", `/documentos/${idB}/laudo`],
          ["laudo em PDF", `/documentos/${idB}/laudo.pdf`],
          ["termo de desinterdição", `/documentos/${idB}/termo-de-desinterdicao`],
          ["CSV de ocorrências", "/relatorios/ocorrencias.csv"],
          ["CSV completo com dado pessoal",
            "/relatorios/ocorrencias.csv?nivel=completo&justificativa="
            + encodeURIComponent("Resposta ao ofício do Tribunal de Contas, processo de 2026.")],
        ];
        const desvios: string[] = [];
        for (const metodo of ["GET", "HEAD"] as const) {
          for (const [rotulo, url] of alvos) {
            const r = await app.inject({ method: metodo, url, headers: com(token) });
            if (r.statusCode !== sonda.esperado.status) {
              desvios.push(`${metodo} ${rotulo}: respondeu ${r.statusCode}, esperado ${sonda.esperado.status}`);
              continue;
            }
            // HEAD não leva corpo; a conferência do código vale para o GET.
            if (metodo === "GET" && r.json().erro !== sonda.esperado.erro) {
              desvios.push(`${metodo} ${rotulo}: erro ${r.json().erro}, esperado ${sonda.esperado.erro}`);
            }
          }
        }
        expect(desvios).toEqual([]);
        expect(await pegadas(idTermo)).toEqual(antes);
      } finally {
        await restaurarHelena();
      }
    }, 120_000);
  }
});

describe("A lista de GET com efeito é a decisão, e o comportamento a obedece", () => {
  it("toda entrada da lista existe nas rotas registradas (sem lista morta)", () => {
    const existentes = new Set(rotasRegistradas(app).map((r) => `${r.metodo} ${r.caminho}`));
    for (const chave of COM_EFEITO) {
      expect(existentes.has(chave), `rota da lista que não existe: ${chave}`).toBe(true);
    }
  });

  it("com a conta desativada, um GET responde conta_desativada SE E SÓ SE está na lista", async () => {
    const token = await entrar(EMAIL_HELENA);
    await mem.bruto.query("UPDATE usuarios SET ativo = false WHERE id = $1", [HELENA]);
    try {
      const marcadas: string[] = [];
      for (const rota of rotasRegistradas(app)) {
        const chave = `${rota.metodo} ${rota.caminho}`;
        if (rota.metodo !== "GET" || SEM_TOKEN.has(chave)) continue;
        const r = await app.inject({
          method: "GET", url: rota.caminho.replace(/:[A-Za-z]+/g, ID_FALSO), headers: com(token),
        });
        let erro: unknown;
        try { erro = r.json().erro; } catch { erro = undefined; }
        if (r.statusCode === 403 && erro === "conta_desativada") marcadas.push(chave);
      }
      expect(marcadas.sort()).toEqual([...COM_EFEITO].sort());
    } finally {
      await restaurarHelena();
    }
  }, 120_000);

  it("varredura da fonte: GET que escreve no corpo carrega a marca, e marca só em GET da lista", () => {
    const pasta = join(import.meta.dirname, "..", "src", "rotas");
    // `registrarConsulta` fica de fora de propósito: ver o critério acima.
    const escreve = /INSERT INTO|DELETE FROM|UPDATE\s+\w+\s+SET|\bregistrar(Emissao|Evento|AtoAdministrativo)\(|\bmarcarInterditada\(|\befetivarEmissao\(|\bresponder(Pdf)?\(/;
    const desvios: string[] = [];
    for (const arquivo of readdirSync(pasta).filter((f) => f.endsWith(".ts"))) {
      const bruto = readFileSync(join(pasta, arquivo), "utf8");
      // Sem comentários: o texto explicativo cita "INSERT" e "registrar" à vontade.
      const fonte = bruto.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
        .replace(/\/\/.*$/gm, "");
      const inicios = [...fonte.matchAll(/^\s*app\.(get|post|put|patch|delete)\(/gm)];
      inicios.forEach((m, i) => {
        if (m[1] !== "get") return;
        const trecho = fonte.slice(m.index!, inicios[i + 1]?.index ?? fonte.length);
        // O trecho vai até a próxima rota; funções auxiliares entre rotas entram
        // no trecho da rota de cima, e isso só pode causar falso positivo (que
        // pede uma marca ou uma exceção), nunca esconder uma escrita.
        const registro = trecho.slice(0, trecho.indexOf("=>"));
        const marcada = /ROTA_GET_COM_EFEITO/.test(registro);
        const caminho = /app\.get\(\s*"([^"]*)"/.exec(registro)?.[1] ?? "?";
        if (escreve.test(trecho) && !marcada) desvios.push(`${arquivo}: GET ${caminho} escreve e não tem a marca`);
        if (marcada && !escreve.test(trecho)) desvios.push(`${arquivo}: GET ${caminho} tem a marca e não escreve`);
      });
    }
    expect(desvios).toEqual([]);
  });
});

describe("PATCH, PUT, DELETE e POST com conta desativada: nenhum escreve", () => {
  it("toda rota de escrita autenticada recusa com 403 conta_desativada, sem tocar no banco", async () => {
    const token = await entrar(EMAIL_HELENA);
    await mem.bruto.query("UPDATE usuarios SET ativo = false WHERE id = $1", [HELENA]);
    try {
      const antes = await pegadas(idB);
      const totais = async () => (await mem.bruto.query<{ n: string }>(
        `SELECT (SELECT count(*) FROM trilha_eventos) + (SELECT count(*) FROM ocorrencias)
              + (SELECT count(*) FROM usuarios) + (SELECT count(*) FROM equipes)
              + (SELECT count(*) FROM orgaos) + (SELECT count(*) FROM evidencias) AS n`,
      )).rows[0]!.n;
      const totalAntes = await totais();

      const desvios: string[] = [];
      const metodos = new Set<string>();
      for (const rota of rotasRegistradas(app)) {
        const chave = `${rota.metodo} ${rota.caminho}`;
        if (rota.metodo === "GET" || SEM_TOKEN.has(chave)) continue;
        metodos.add(rota.metodo);
        const r = await app.inject({
          method: rota.metodo as "POST",
          url: rota.caminho.replace(/:[A-Za-z]+/g, ID_FALSO),
          headers: com(token),
          payload: {},
        });
        let erro: unknown;
        try { erro = r.json().erro; } catch { erro = undefined; }
        if (r.statusCode !== 403 || erro !== "conta_desativada") {
          desvios.push(`${chave}: ${r.statusCode} ${String(erro)}`);
        }
      }
      // A âncora: se a leitura da árvore deixasse de enxergar um método, a
      // varredura passaria vazia sem ninguém notar.
      for (const m of ["POST", "PATCH", "PUT", "DELETE"]) {
        expect(metodos.has(m), `a árvore não tem rota ${m}`).toBe(true);
      }
      expect(desvios).toEqual([]);
      expect(await totais()).toBe(totalAntes);
      expect(await pegadas(idB)).toEqual(antes);
    } finally {
      await restaurarHelena();
    }
  }, 120_000);
});

describe("/auth/encerrar-sessoes com o token anterior à renovação", () => {
  it("a mensagem diz a verdade: a sessão que continua aberta é a cadeia de quem pediu", async () => {
    // As sondas acima deixaram sessões vivas da Helena: parte do zero para o
    // número de sessões encerradas ser o dela e de mais ninguém.
    await mem.bruto.query(
      "UPDATE sessoes SET revogada_em = now(), motivo_revogacao = 'limpeza do teste' "
      + "WHERE usuario_id = $1 AND revogada_em IS NULL", [HELENA],
    );
    const { acesso, renovacao } = await entrarCompleto(EMAIL_HELENA);
    const outra = await entrarCompleto(EMAIL_HELENA);
    const nova = await app.inject({ method: "POST", url: "/auth/renovar", payload: { renovacao } });
    expect(nova.statusCode, nova.body).toBe(200);

    // `acesso` nasceu na sessão que a renovação rotacionou: o `sid` dele é o da
    // sessão revogada por rotação, e a viva da mesma cadeia é a da renovação.
    const r = await app.inject({
      method: "POST", url: "/auth/encerrar-sessoes", headers: com(acesso),
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().sessoesEncerradas).toBe(1);

    // "Esta continua aberta": a cadeia de quem pediu renova, e a outra caiu.
    expect((await app.inject({
      method: "POST", url: "/auth/renovar", payload: { renovacao: nova.json().renovacao },
    })).statusCode).toBe(200);
    expect((await app.inject({
      method: "POST", url: "/auth/renovar", payload: { renovacao: outra.renovacao },
    })).statusCode).toBe(401);
  });
});
