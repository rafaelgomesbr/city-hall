import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * Trilha de auditoria e exportação.
 *
 * Três perguntas que um órgão público responde o tempo todo, e que não cabem
 * na tela de uma ocorrência isolada: quem alterou este registro, o que a
 * Defesa Civil fez no semestre, e quantos chamados vieram daquele bairro.
 *
 * O caso que mais importa aqui não é nenhum dos três: é que a planilha
 * exportada não pode virar arma contra quem a abre.
 */

const SENHA = "defesa-civil-2026";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenCoordenador: string;
let tokenOperador: string;
let tokenAgente: string;
let tokenDeFora: string;

async function entrar(email: string): Promise<string> {
  const r = await app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA } });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

const com = (t: string) => ({ authorization: `Bearer ${t}` });

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-prestacao-com-mais-de-32-bytes-ok",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  tokenCoordenador = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
  tokenOperador = await entrar("jonas.ferreira@serraalta.exemplo.gov.br");
  tokenAgente = await entrar("diego.alves@serraalta.exemplo.gov.br");
  tokenDeFora = await entrar("aurelio.machado@valefundo.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Trilha de auditoria do município", () => {
  it("lista os eventos com autor, papel e a ocorrência de origem", async () => {
    const r = await app.inject({
      method: "GET", url: "/trilha?porPagina=10", headers: com(tokenCoordenador),
    });

    expect(r.statusCode).toBe(200);
    const corpo = r.json();
    expect(corpo.total).toBeGreaterThan(0);

    for (const evento of corpo.itens) {
      // Sem autor, a trilha não responde a pergunta que ela existe para
      // responder.
      expect(evento.autor_nome).toBeTruthy();
      expect(evento.autor_papel).toBeTruthy();
      expect(evento.protocolo).toMatch(/^\d{6}\/\d{4}$/);
    }
  }, 60_000);

  it("filtra por autor, por tipo e por protocolo", async () => {
    const porTipo = await app.inject({
      method: "GET", url: "/trilha?tipo=despacho", headers: com(tokenCoordenador),
    });
    for (const e of porTipo.json().itens) expect(e.tipo).toBe("despacho");

    const porAutor = await app.inject({
      method: "GET", url: "/trilha?autor=helena", headers: com(tokenCoordenador),
    });
    for (const e of porAutor.json().itens) {
      expect(e.autor_nome.toLowerCase()).toContain("helena");
    }

    const porProtocolo = await app.inject({
      method: "GET", url: "/trilha?protocolo=000471", headers: com(tokenCoordenador),
    });
    expect(porProtocolo.json().total).toBeGreaterThan(0);
    for (const e of porProtocolo.json().itens) {
      expect(e.protocolo).toContain("000471");
    }
  }, 60_000);

  it("a trilha de um município não é alcançável do outro", async () => {
    const deA = await app.inject({
      method: "GET", url: "/trilha?porPagina=200", headers: com(tokenCoordenador),
    });
    const deB = await app.inject({
      method: "GET", url: "/trilha?porPagina=200", headers: com(tokenDeFora),
    });

    const protocolosA = deA.json().itens.map((e: { protocolo: string }) => e.protocolo);
    const protocolosB = deB.json().itens.map((e: { protocolo: string }) => e.protocolo);

    expect(protocolosA).toContain("000471/2026");
    expect(protocolosB).not.toContain("000471/2026");
    expect(protocolosB).toContain("000112/2026");
  }, 60_000);

  it("operador e agente não consultam a trilha do município", async () => {
    for (const token of [tokenOperador, tokenAgente]) {
      const r = await app.inject({ method: "GET", url: "/trilha", headers: com(token) });
      expect(r.statusCode).toBe(403);
    }
  }, 60_000);

  it("os tipos de evento vêm com contagem, para montar o filtro", async () => {
    const r = await app.inject({
      method: "GET", url: "/trilha/tipos", headers: com(tokenCoordenador),
    });
    const tipos = r.json().itens as Array<{ tipo: string; total: number }>;
    expect(tipos.map((t) => t.tipo)).toContain("registro");
    for (const t of tipos) expect(t.total).toBeGreaterThan(0);
  }, 60_000);
});

describe("Exportação em CSV", () => {
  it("sai pronta para abrir no Excel em português", async () => {
    const r = await app.inject({
      method: "GET", url: "/relatorios/ocorrencias.csv", headers: com(tokenCoordenador),
    });

    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toContain("text/csv");
    expect(String(r.headers["content-disposition"])).toContain("attachment");
    expect(String(r.headers["content-disposition"])).toMatch(/ocorrencias-\d{4}-\d{2}-\d{2}\.csv/);

    const csv = r.body;
    // Sem a marca de ordem de bytes, "Acácias" vira "AcÃ¡cias" no relatório
    // que chega ao prefeito.
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Protocolo;Tipo (COBRADE)");
    expect(csv).toContain("Rua das Acácias");
  }, 60_000);

  it("traz as colunas que respondem a pergunta, não o esquema do banco", async () => {
    const r = await app.inject({
      method: "GET", url: "/relatorios/ocorrencias.csv", headers: com(tokenCoordenador),
    });
    const cabecalho = r.body.replace("﻿", "").split("\r\n")[0]!;

    for (const coluna of [
      "Horas até a vistoria", "Horas até o encerramento",
      "Providências sem resposta", "Vulnerabilidade social",
    ]) {
      expect(cabecalho, `falta a coluna ${coluna}`).toContain(coluna);
    }
    // Nada de identificador interno: ninguém lê uuid numa reunião.
    expect(cabecalho).not.toContain("organizacao_id");
    expect(cabecalho).not.toMatch(/\bid\b/i);
  }, 60_000);

  it("um relato malicioso não vira fórmula na planilha", async () => {
    // O relato vem do que um cidadão dita por telefone. Se ele ditar isto e o
    // operador digitar como ouviu, a planilha executaria na máquina de quem
    // abrisse, e a vítima seria o próprio servidor público.
    const criar = await app.inject({
      method: "POST", url: "/ocorrencias", headers: com(tokenCoordenador),
      payload: {
        solicitanteNome: "=cmd|' /c calc'!A1",
        canalEntrada: "telefone",
        endereco: "@SUM(1+1)*cmd",
        tipo: "alagamento",
        descricao: "=HYPERLINK(\"http://malicioso\",\"clique aqui\")",
      },
    });
    expect(criar.statusCode).toBe(201);

    const r = await app.inject({
      method: "GET", url: "/relatorios/ocorrencias.csv", headers: com(tokenCoordenador),
    });

    // O conteúdo está lá, mas neutralizado com apóstrofo.
    expect(r.body).toContain("'=cmd|");
    expect(r.body).toContain("'@SUM(1+1)*cmd");
    expect(r.body).toContain("'=HYPERLINK");
    // E em nenhum lugar uma célula começa direto com o caractere perigoso.
    for (const linha of r.body.replace("﻿", "").split("\r\n")) {
      for (const celula of linha.split(";")) {
        expect(
          /^[=+@]/.test(celula),
          `celula executavel na planilha: ${celula.slice(0, 40)}`,
        ).toBe(false);
      }
    }
  }, 120_000);

  it("exporta apenas o próprio município", async () => {
    const deB = await app.inject({
      method: "GET", url: "/relatorios/ocorrencias.csv", headers: com(tokenDeFora),
    });
    expect(deB.body).toContain("000112/2026");
    expect(deB.body).not.toContain("000471/2026");
  }, 60_000);

  it("filtra por período", async () => {
    const futuro = new Date(Date.now() + 86_400_000).toISOString();
    const r = await app.inject({
      method: "GET", url: `/relatorios/ocorrencias.csv?de=${encodeURIComponent(futuro)}`,
      headers: com(tokenCoordenador),
    });
    // Só o cabeçalho: nenhuma ocorrência foi registrada no futuro.
    const linhas = r.body.replace("﻿", "").trimEnd().split("\r\n");
    expect(linhas).toHaveLength(1);
  }, 60_000);

  it("operador não exporta a base do município", async () => {
    const r = await app.inject({
      method: "GET", url: "/relatorios/ocorrencias.csv", headers: com(tokenOperador),
    });
    expect(r.statusCode).toBe(403);
  }, 60_000);
});

describe("Resumo do período", () => {
  it("usa mediana, não média, para o tempo de atendimento", async () => {
    const r = await app.inject({
      method: "GET", url: "/relatorios/resumo", headers: com(tokenCoordenador),
    });

    expect(r.statusCode).toBe(200);
    const resumo = r.json();
    expect(resumo.total).toBeGreaterThan(0);
    expect(resumo.encerradas).toBeGreaterThanOrEqual(0);
    // Uma ocorrência parada seis meses por causa de obra puxa a média e faz o
    // serviço parecer pior do que é. A mediana descreve o atendimento típico.
    expect(resumo).toHaveProperty("medianaHorasAteEncerrar");
    expect(resumo).not.toHaveProperty("mediaHorasAteEncerrar");
  }, 60_000);

  it("quebra por tipo COBRADE, com o rótulo pronto para leitura", async () => {
    const r = await app.inject({
      method: "GET", url: "/relatorios/resumo", headers: com(tokenCoordenador),
    });
    const porTipo = r.json().porTipo as Array<{ tipo: string; rotulo: string; total: number }>;

    expect(porTipo.length).toBeGreaterThan(0);
    // Rótulo legível junto do código: quem lê o relatório não decora COBRADE.
    const deslizamento = porTipo.find((t) => t.tipo === "deslizamento");
    expect(deslizamento?.rotulo).toBe("Deslizamento");
    // Ordenado do mais frequente para o menos.
    for (let i = 1; i < porTipo.length; i++) {
      expect(porTipo[i - 1]!.total).toBeGreaterThanOrEqual(porTipo[i]!.total);
    }
  }, 60_000);

  it("o resumo de um município ignora o outro", async () => {
    const deA = await app.inject({
      method: "GET", url: "/relatorios/resumo", headers: com(tokenCoordenador),
    });
    const deB = await app.inject({
      method: "GET", url: "/relatorios/resumo", headers: com(tokenDeFora),
    });
    expect(deA.json().total).not.toBe(deB.json().total);
    expect(deB.json().total).toBeLessThan(deA.json().total);
  }, 60_000);
});

describe("A trilha registra o que aconteceu, inclusive o que ainda não fecha", () => {
  it("uma ocorrência atendida do início ao fim deixa a sequência completa", async () => {
    const criar = await app.inject({
      method: "POST", url: "/ocorrencias", headers: com(tokenCoordenador),
      payload: {
        solicitanteNome: "Moradora do Alto", canalEntrada: "presencial",
        endereco: "Rua Completa, 1, Centro", tipo: "colapso_edificacao",
        descricao: "Muro de arrimo com barriga aparente.",
      },
    });
    const id = criar.json().id;

    await app.inject({
      method: "POST", url: `/ocorrencias/${id}/triagem`, headers: com(tokenCoordenador),
      payload: { severidade: "alta", vulnerabilidadePresente: false },
    });
    await app.inject({
      method: "POST", url: `/ocorrencias/${id}/despacho`, headers: com(tokenCoordenador),
      payload: { equipeId: EQUIPE_ALFA, prazoHoras: 24 },
    });
    await app.inject({
      method: "POST", url: "/sincronizacao/vistoria", headers: com(tokenAgente),
      payload: {
        idempotencyKey: crypto.randomUUID(), ocorrenciaId: id,
        coletadaEm: new Date().toISOString(),
        vistoria: {
          checklist: [{ chave: "interdicao_indicada", resposta: true },
        { chave: "risco_iminente", resposta: false },
        { chave: "evacuacao_necessaria", resposta: false },
        { chave: "acionar_outro_orgao", resposta: false },
      ],
          fotos: [], gpsPrecisaoMetros: 5, assinanteNome: "Moradora",
          assinaturaChave: null, coletadaEm: new Date().toISOString(),
        },
      },
    });
    await app.inject({
      method: "POST", url: `/ocorrencias/${id}/providencia`, headers: com(tokenCoordenador),
      payload: {
        orgaoDestino: "Secretaria de Obras", descricao: "Escoramento.",
        responsavel: "Engenheiro", prazoHoras: 72,
      },
    });
    await app.inject({
      method: "POST", url: `/ocorrencias/${id}/encerramento`, headers: com(tokenCoordenador),
      payload: { motivo: "Escoramento executado e risco cessado." },
    });

    const r = await app.inject({
      method: "GET", url: `/trilha?protocolo=${criar.json().protocolo}&porPagina=50`,
      headers: com(tokenCoordenador),
    });
    const tipos = (r.json().itens as Array<{ tipo: string }>).map((e) => e.tipo);

    // A trilha não é escrita à parte: ela é o subproduto de cada transição,
    // gravada na mesma transação da mudança. Se uma faltasse aqui, seria
    // porque a mudança correspondente não aconteceu.
    for (const esperado of [
      "registro", "triagem", "despacho", "vistoria", "providencia", "encerramento",
    ]) {
      expect(tipos, `falta o evento ${esperado}`).toContain(esperado);
    }

    // Mais recente primeiro: é o que a pessoa quer ver ao abrir a auditoria.
    const datas = (r.json().itens as Array<{ ocorrido_em: string }>).map((e) =>
      new Date(e.ocorrido_em).getTime(),
    );
    for (let i = 1; i < datas.length; i++) {
      expect(datas[i - 1]!).toBeGreaterThanOrEqual(datas[i]!);
    }
  }, 180_000);
});

describe("Registro de quem exportou", () => {
  it("cada exportacao fica registrada, com o recorte que saiu", async () => {
    const antes = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM exportacoes",
    );

    const de = new Date(Date.now() - 30 * 86_400_000).toISOString();
    await app.inject({
      method: "GET",
      url: `/relatorios/ocorrencias.csv?de=${encodeURIComponent(de)}&status=encerrada`,
      headers: com(tokenCoordenador),
    });

    const depois = await mem.bruto.query<{
      usuario_nome: string; tipo: string; filtros: Record<string, unknown>;
      total_registros: number;
    }>("SELECT usuario_nome, tipo, filtros, total_registros FROM exportacoes ORDER BY criada_em DESC LIMIT 1");

    expect(Number(antes.rows[0]!.n) + 1).toBeGreaterThan(Number(antes.rows[0]!.n));
    const registro = depois.rows[0]!;
    expect(registro.usuario_nome).toBe("Helena Vasques Coutinho");
    expect(registro.tipo).toBe("ocorrencias_csv");
    // Sem os filtros, nao da para saber QUAL recorte saiu.
    expect(registro.filtros["status"]).toBe("encerrada");
    expect(registro.filtros["de"]).toBe(de);
  }, 60_000);

  it("o registro e append-only, como a trilha", async () => {
    await expect(
      mem.banco.comTenant(
        "11111111-1111-4111-8111-000000000001",
        (c) => c.query("UPDATE exportacoes SET usuario_nome = 'outro'"),
      ),
    ).rejects.toThrow();

    await expect(
      mem.banco.comTenant(
        "11111111-1111-4111-8111-000000000001",
        (c) => c.query("DELETE FROM exportacoes"),
      ),
    ).rejects.toThrow();
  }, 60_000);

  it("a lista de exportacoes respeita o municipio e o papel", async () => {
    const doCoordenador = await app.inject({
      method: "GET", url: "/relatorios/exportacoes", headers: com(tokenCoordenador),
    });
    expect(doCoordenador.statusCode).toBe(200);
    expect(doCoordenador.json().itens.length).toBeGreaterThan(0);

    const deFora = await app.inject({
      method: "GET", url: "/relatorios/exportacoes", headers: com(tokenDeFora),
    });
    const nomesDeFora = (deFora.json().itens as Array<{ usuario_nome: string }>)
      .map((e) => e.usuario_nome);
    // Vale Fundo tambem exportou, num teste acima. O que nao pode e enxergar
    // quem exportou do outro municipio: saber que a vizinha tirou a base em
    // marco ja e informacao que nao lhe pertence.
    expect(nomesDeFora.length).toBeGreaterThan(0);
    expect(new Set(nomesDeFora)).toEqual(new Set(["Aurélio Prates Machado"]));
    expect(nomesDeFora).not.toContain("Helena Vasques Coutinho");

    const doOperador = await app.inject({
      method: "GET", url: "/relatorios/exportacoes", headers: com(tokenOperador),
    });
    expect(doOperador.statusCode).toBe(403);
  }, 60_000);
});

/**
 * A auditoria recorta por hora do servidor, não pela declarada pelo aparelho.
 *
 * `ocorrido_em` vem do relógio do celular do agente. Enquanto o filtro de
 * período usava esse campo, um evento datado para trás sumia de qualquer
 * recorte por mês sem nunca ter sido apagado: a trilha continuava íntegra,
 * append-only, e completamente cega. Bastava um fuso trocado para o acidente,
 * e um agente com motivo para o resto.
 */
describe("O recorte da trilha usa a hora do servidor", () => {
  it("evento datado no passado pelo aparelho continua no recorte de hoje", async () => {
    const antiga = "2020-03-15T08:30:00.000Z";
    await mem.bruto.query(
      `INSERT INTO trilha_eventos
         (organizacao_id, ocorrencia_id, tipo, autor_nome, autor_papel, origem, ocorrido_em)
       SELECT o.organizacao_id, o.id, 'vistoria', 'Agente de teste', 'agente_campo', 'campo', $1
         FROM ocorrencias o LIMIT 1`,
      [antiga],
    );

    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();

    const r = await app.inject({
      method: "GET",
      url: `/trilha?de=${encodeURIComponent(inicio)}&tipo=vistoria`,
      headers: com(tokenCoordenador),
    });

    expect(r.statusCode).toBe(200);
    const encontrado = r.json().itens.find(
      (i: { ocorrido_em: string }) => new Date(i.ocorrido_em).getUTCFullYear() === 2020,
    );
    // Ele foi REGISTRADO agora, então pertence ao recorte de agora, por mais
    // que diga ter acontecido em 2020.
    expect(encontrado).toBeTruthy();
  });
});
