import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { travaDeProcesso } from "../src/push/trava.js";
import { MARCADOR_REMOVIDO_POR_PRAZO, minimizarPorPrazo } from "../src/privacidade/minimizacao.js";

/**
 * O LAUDO REIMPRESSO DEPOIS DO PRAZO.
 *
 * O achado, provado por sondagem contra esta API: com prazo de um dia e a
 * varredura rodada, o laudo saía com "Solicitante: removido por prazo" e, na
 * mesma folha, o relato citando "Dona Marilda", as observações do agente
 * dizendo "filho Carlos acamado", e a trilha guardando o nome para sempre. A
 * minimização valia para a coluna que alguém lembrou de cobrir.
 *
 * Este arquivo percorre o caminho REAL: chamado aberto pela rota, vistoria
 * pela sincronização, encerramento pela rota, prazo do município vencido, a
 * varredura da API (`minimizarPorPrazo`, que chama a função do banco), e a
 * segunda via do laudo pela rota de documentos. O que ele cobra é o que uma
 * pessoa lendo a folha veria.
 *
 * O que FICA na folha, de propósito: o nome de quem deu ciência no local. É
 * parte do ato de interdição, e `docs/PRIVACIDADE.md` declara a exceção.
 */

const SENHA = "defesa-civil-2026";
const SERRA_ALTA = "11111111-1111-4111-8111-000000000001";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenAgente: string;
let tokenCoordenador: string;

async function entrar(email: string): Promise<string> {
  const r = await app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA } });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

const com = (t: string) => ({ authorization: `Bearer ${t}` });
const corrido = (html: string) => html.replace(/\s+/g, " ");

async function laudoDe(id: string): Promise<string> {
  const r = await app.inject({
    method: "GET", url: `/documentos/${id}/laudo`, headers: com(tokenCoordenador),
  });
  if (r.statusCode !== 200) throw new Error(`laudo falhou: ${r.statusCode} ${r.body}`);
  return r.body;
}

/** A ocorrência da sondagem, do chamado ao encerramento, pelas rotas. */
async function ocorrenciaEncerradaComVistoria(): Promise<{ id: string; vistoriaId: string }> {
  const criar = await app.inject({
    method: "POST", url: "/ocorrencias", headers: com(tokenCoordenador),
    payload: {
      solicitanteNome: "Marilda Souza Prado", solicitanteContato: "(35) 99871-4402",
      canalEntrada: "telefone", endereco: "Rua das Acácias, 245", tipo: "deslizamento",
      descricao: "Dona Marilda relatou que o talude atrás da casa cedeu depois da chuva; o filho Carlos está acamado no quarto dos fundos.",
      coordenada: { lat: -22.4187, lng: -45.4523 },
    },
  });
  if (criar.statusCode !== 201) throw new Error(`criar falhou: ${criar.body}`);
  const { id } = criar.json();

  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: com(tokenCoordenador),
    payload: {
      severidade: "critica", vulnerabilidadePresente: true,
      vulnerabilidadeDescricao: "Filho Carlos acamado, dependente de oxigênio.",
    },
  });
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/despacho`, headers: com(tokenCoordenador),
    payload: { equipeId: EQUIPE_ALFA, prazoHoras: 4 },
  });

  // Coleta agora: depois da abertura do chamado, que é o que a rota exige.
  const coletadaEm = new Date().toISOString();
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
        // Quem deu ciência não é quem ligou: é o que deixa provar que um fica e o outro sai.
        assinanteNome: "Josefa Prado da Silva",
        assinaturaChave: "assinatura.png",
        coletadaEm,
        observacoes: "Moradora Marilda presente; filho Carlos acamado no quarto dos fundos.",
      },
    },
  });
  if (sincronizacao.statusCode !== 201) throw new Error(`sincronizacao falhou: ${sincronizacao.body}`);

  const encerrar = await app.inject({
    method: "POST", url: `/ocorrencias/${id}/encerramento`, headers: com(tokenCoordenador),
    payload: { motivo: "Risco cessado após contenção." },
  });
  if (encerrar.statusCode !== 200) throw new Error(`encerrar falhou: ${encerrar.body}`);

  return { id, vistoriaId: sincronizacao.json().vistoriaId };
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-do-laudo-minimizado-com-mais-de-32-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  tokenAgente = await entrar("diego.alves@serraalta.exemplo.gov.br");
  tokenCoordenador = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Laudo reimpresso depois da minimização por prazo", () => {
  let id = "";
  let antes = "";
  let depois = "";
  let eventoAntigo = "";

  beforeAll(async () => {
    const alvo = await ocorrenciaEncerradaComVistoria();
    id = alvo.id;
    antes = await laudoDe(id);

    /*
      O município decide o prazo (um dia) e a ocorrência está encerrada há
      três. As duas escritas são como dono, porque o teste está simulando o
      calendário, não a rota: a rota de retenção e o encerramento já têm os
      próprios testes.
    */
    await mem.bruto.query(
      "UPDATE organizacoes SET retencao_solicitante_dias = 1 WHERE id = $1", [SERRA_ALTA],
    );
    await mem.bruto.query(
      "UPDATE ocorrencias SET encerrado_em = now() - interval '3 days' WHERE id = $1", [id],
    );
    /*
      Um evento `vistoria` como a rota de sincronização o gravava ATÉ
      15/09/2026, com o nome do assinante no detalhe. A rota não grava mais;
      as linhas já gravadas existem em produção, e é a varredura quem as
      redige.
    */
    const e = await mem.bruto.query<{ id: string }>(
      `INSERT INTO trilha_eventos
         (organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel, origem, ocorrido_em, detalhe)
       VALUES ($1, $2, 'vistoria', NULL, 'Diego Nakamura Alves', 'agente_campo', 'campo',
               now() - interval '3 days',
               '{"fotos": 0, "gpsPrecisaoMetros": 6.2, "assinante": "Josefa Prado da Silva"}'::jsonb)
       RETURNING id`,
      [SERRA_ALTA, id],
    );
    eventoAntigo = e.rows[0]!.id;

    // A semente tem outras ocorrências encerradas em Serra Alta, e elas saem junto.
    const resumo = await minimizarPorPrazo({ banco: mem.banco, trava: travaDeProcesso() });
    expect(resumo.ocorrencias).toBeGreaterThanOrEqual(1);

    depois = await laudoDe(id);
  }, 120_000);

  it("a âncora: antes do prazo, a folha trazia o relato, a observação e a vulnerabilidade", () => {
    expect(antes).toContain("Dona Marilda relatou");
    expect(antes).toContain("Moradora Marilda presente");
    expect(antes).toContain("Filho Carlos acamado");
    expect(antes).toContain("Marilda Souza Prado");
    expect(antes).toContain("Josefa Prado da Silva");
  });

  it("depois do prazo, nem a moradora nem a saúde do filho estão em lugar nenhum da folha", () => {
    expect(depois, "o relato continua na segunda via").not.toContain("Marilda");
    expect(depois, "a observação do agente continua na segunda via").not.toContain("Carlos");
    expect(depois).not.toContain("acamad");
    expect(depois).not.toContain("99871");
  });

  it("o marcador aparece onde o texto saiu: solicitante, relato, vulnerabilidade e observações", () => {
    const html = corrido(depois);
    expect(html).toContain(`Relato recebido</h2> <p class="relato">${MARCADOR_REMOVIDO_POR_PRAZO}</p>`);
    expect(html).toContain(`Observações do agente</h2><p class="relato">${MARCADOR_REMOVIDO_POR_PRAZO}</p>`);
    /*
      A vulnerabilidade é a única que chega NULA depois do descarte (a marca
      fica, a descrição sai). Antes daqui a folha imprimia o título com um
      parágrafo em branco embaixo, que é justamente o "espaço em branco" que o
      documento promete nunca deixar.
    */
    expect(html).toContain(
      `Vulnerabilidade social identificada</h2> <p class="relato">${MARCADOR_REMOVIDO_POR_PRAZO}</p>`,
    );
    const vezes = depois.split(MARCADOR_REMOVIDO_POR_PRAZO).length - 1;
    expect(vezes, "esperava o marcador no solicitante, no relato, na vulnerabilidade e nas observações").toBeGreaterThanOrEqual(4);
  });

  it("o nome de quem deu ciência no local FICA na folha: é parte do ato", () => {
    expect(depois).toContain("Josefa Prado da Silva");
  });

  it("a trilha da ocorrência foi redigida pela mesma varredura, e a folha continua saindo", async () => {
    const ev = await mem.bruto.query<{ detalhe: Record<string, unknown> }>(
      "SELECT detalhe FROM trilha_eventos WHERE id = $1", [eventoAntigo],
    );
    expect(ev.rows[0]!.detalhe.assinante).toBe(MARCADOR_REMOVIDO_POR_PRAZO);
    expect(ev.rows[0]!.detalhe.fotos).toBe(0);

    const m = await mem.bruto.query<{ detalhe: { campos: string[]; trilha_eventos_redigidos?: number } }>(
      "SELECT detalhe FROM trilha_eventos WHERE ocorrencia_id = $1 AND tipo = 'minimizacao_por_prazo'", [id],
    );
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0]!.detalhe.campos).toEqual(expect.arrayContaining([
      "solicitante_nome", "descricao", "vistoria_observacoes", "trilha_vistoria_assinante",
    ]));
    expect(m.rows[0]!.detalhe.trilha_eventos_redigidos).toBe(1);

    // E a trilha inteira, lida como o painel a lê, não traz mais a família.
    const bruto = JSON.stringify(
      (await mem.bruto.query("SELECT * FROM trilha_eventos WHERE ocorrencia_id = $1", [id])).rows,
    );
    expect(bruto).not.toContain("Marilda");
    expect(bruto).not.toContain("Carlos");
  });
});
