import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import {
  armazenamentoEmMemoria, type ArmazenamentoEmMemoria,
} from "../src/armazenamento/memoria.js";
import type { Armazenamento } from "../src/armazenamento/tipos.js";
import type { Banco, Consulta } from "../src/banco/tipos.js";
import { travaDeProcesso, type Trava } from "../src/push/trava.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import {
  CHAVE_DA_ELIMINACAO, criarEliminador, type DependenciasDaEliminacao,
} from "../src/eliminacao/relogio.js";
import { resumirMunicipios } from "../src/metricas/resumo.js";
import {
  CHAVE_DA_MINIMIZACAO, CHAVE_DA_VARREDURA_DE_ORFAOS, CHAVE_DA_VARREDURA_DE_PRAZO,
} from "../src/push/trava.js";
import { CHAVE_DO_RESUMO } from "../src/metricas/resumo.js";

/**
 * O relógio que elimina município.
 *
 * O console do fornecedor pode ELIMINAR uma prefeitura para sempre, com sete
 * dias de arrependimento. O console só escreve a intenção
 * (`organizacoes.eliminacao_agendada_para`): ele não tem credencial de
 * armazenamento (ADR 0008), e toda execução irreversível deste produto precisa
 * ser guardada pelo ESTADO DO BANCO, e não por um clique. Quem executa é este
 * relógio, dentro da API, e ele executa em três fases que não se misturam:
 *
 *   1. `executar_eliminacoes_vencidas()`, no banco: apaga as linhas de
 *      negócio de quem venceu e marca `eliminada_em`. A linha de
 *      `organizacoes` FICA.
 *   2. A purga do armazenamento sob o prefixo da organização, objeto a objeto,
 *      contando o que apagou.
 *   3. `concluir_eliminacao(org)`: apaga a linha da organização e fecha o
 *      livro. SÓ acontece com a purga completa.
 *
 * A REGRA MAIS IMPORTANTE DO ARQUIVO É A TERCEIRA. Uma organização apagada do
 * banco com fotografias sobrando no armazenamento é dado pessoal sem dono: a
 * imagem da casa de uma família em risco, num balde, sem nenhuma linha que
 * diga de quem é nem por que está lá. É exatamente o que a varredura de
 * órfãos existe para achar, e este relógio não pode ser quem produz isso.
 * Então: listagem que falha no meio, ou um `apagar` que falha, deixa a
 * conclusão para a próxima rodada, e registra.
 *
 * Roda contra a migração 038 de verdade. O que ela exige para executar está
 * escrito nela: a organização SUSPENSA e marcada com o prazo, E uma linha no
 * livro `eliminacoes_de_municipio` vencida e não cancelada. O `agendar` deste
 * arquivo escreve as duas marcas como dono das tabelas, que é o que a função
 * do console faz. A única função que não vem da migração é a de contagem que
 * `/saude` lê, e ela vem de `test/duble-da-migracao-038.ts`, com o porquê.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const BYTES = Buffer.from("fotografia de vistoria, fingida");

let mem: BancoEmMemoria;
let armazenamento: ArmazenamentoEmMemoria;
let trava: Trava;
let orgA: string;
let orgB: string;
let registros: Array<{ evento: Record<string, unknown>; mensagem: string }>;

function dependencias(sobrescrever: Partial<DependenciasDaEliminacao> = {}): DependenciasDaEliminacao {
  return {
    banco: mem.banco,
    armazenamento,
    trava,
    registrar: (evento, mensagem) => { registros.push({ evento, mensagem }); },
    ...sobrescrever,
  };
}

/** Uma rodada, num eliminador novo: sem memória de rodada anterior. */
function executarEliminacoes(dep: DependenciasDaEliminacao) {
  return criarEliminador(dep).executar();
}

async function criarOrganizacao(nome: string): Promise<string> {
  const r = await mem.bruto.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ($1, $1, 'MG') RETURNING id",
    [nome],
  );
  return r.rows[0]!.id;
}

/** Uma prefeitura com gente, ocorrência, vistoria, evidência e trilha. */
async function povoar(org: string, quantasFotos: number): Promise<void> {
  const db = mem.bruto;
  const u = await db.query<{ id: string }>(
    `INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,senha_hash)
     VALUES ($1,'Agente','M-1',$2,'agente_campo','scrypt$x') RETURNING id`,
    [org, `agente@${org.slice(0, 8)}.exemplo.gov.br`],
  );
  const oc = await db.query<{ id: string }>(
    `INSERT INTO ocorrencias
       (organizacao_id, protocolo, tipo, status, endereco, solicitante_nome,
        canal_entrada, descricao)
     VALUES ($1, '000001/2026', 'deslizamento', 'em_campo', 'Rua das Acacias, 245',
             'Joana Ferreira', 'telefone', 'Talude com trinca aberta.')
     RETURNING id`,
    [org],
  );
  await db.query(
    `INSERT INTO vistorias
       (organizacao_id, ocorrencia_id, agente_id, checklist, assinante_nome,
        coletada_em, idempotency_key)
     VALUES ($1,$2,$3,'{}'::jsonb,'Joana', now(), gen_random_uuid())`,
    [org, oc.rows[0]!.id, u.rows[0]!.id],
  );
  await db.query(
    `INSERT INTO trilha_eventos
       (organizacao_id, ocorrencia_id, tipo, autor_nome, autor_papel, origem, ocorrido_em)
     VALUES ($1, $2, 'ocorrencia_registrada', 'Sistema', 'operador', 'escritorio', now())`,
    [org, oc.rows[0]!.id],
  );
  for (let i = 0; i < quantasFotos; i += 1) {
    const chave = `tenant/${org}/ocorrencias/${oc.rows[0]!.id}/foto-${String(i).padStart(5, "0")}.jpg`;
    await db.query(
      `INSERT INTO evidencias
         (organizacao_id, ocorrencia_id, chave_storage, capturada_em, tipo_conteudo,
          tamanho_bytes, enviada_em)
       VALUES ($1, $2, $3, now(), 'image/jpeg', $4, now())`,
      [org, oc.rows[0]!.id, chave, BYTES.length],
    );
    armazenamento.guardar(chave, BYTES, "image/jpeg");
  }
}

/**
 * Agenda a eliminação como o console agenda, escrevendo como dono das tabelas
 * as DUAS marcas que a função do relógio exige: a linha do livro e a marca na
 * organização (que a 038 só deixa existir com a organização suspensa). Direto
 * nas tabelas, e não por `console_agendar_eliminacao`, porque aquela exige
 * operador do console no contexto, e o que está em teste é o relógio.
 */
async function agendar(org: string, quando: "vencida" | "no_futuro"): Promise<void> {
  const executarEm = quando === "vencida" ? "now() - interval '1 minute'" : "now() + interval '7 days'";
  const nome = await mem.bruto.query<{ municipio: string; uf: string }>(
    "SELECT municipio, uf FROM organizacoes WHERE id = $1", [org],
  );
  await mem.bruto.query(
    `UPDATE organizacoes
        SET acesso_suspenso_em = coalesce(acesso_suspenso_em, now()),
            suspensao_motivo = coalesce(suspensao_motivo, 'fim do contrato'),
            eliminacao_agendada_para = ${executarEm}
      WHERE id = $1`,
    [org],
  );
  await mem.bruto.query(
    `INSERT INTO eliminacoes_de_municipio
       (organizacao_id, municipio_nome, uf, solicitada_em, executar_em, solicitada_por_email, motivo)
     VALUES ($1, $2, $3, ${executarEm} - interval '7 days', ${executarEm}, 'dono@fornecedor.exemplo', 'fim do contrato')`,
    [org, nome.rows[0]!.municipio, nome.rows[0]!.uf],
  );
}

async function livro(org: string) {
  const r = await mem.bruto.query<{
    banco_apagado_em: string | null; armazenamento_purgado_em: string | null;
    concluida_em: string | null; contagens: Record<string, number> | null;
  }>(
    `SELECT banco_apagado_em, armazenamento_purgado_em, concluida_em, contagens
       FROM eliminacoes_de_municipio WHERE organizacao_id = $1`,
    [org],
  );
  return r.rows[0] ?? null;
}

async function contar(tabela: string, org: string): Promise<number> {
  const r = await mem.bruto.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ${tabela} WHERE organizacao_id = $1`, [org],
  );
  return Number(r.rows[0]!.n);
}

async function linhaDaOrganizacao(org: string) {
  const r = await mem.bruto.query<{
    id: string; eliminada_em: string | null; armazenamento_purgado_em: string | null;
  }>("SELECT id, eliminada_em, armazenamento_purgado_em FROM organizacoes WHERE id = $1", [org]);
  return r.rows[0] ?? null;
}

async function objetosSob(prefixo: string): Promise<number> {
  let total = 0;
  let continuacao: string | undefined;
  do {
    const pagina = await armazenamento.listar(prefixo, continuacao);
    total += pagina.objetos.length;
    continuacao = pagina.continuacao ?? undefined;
  } while (continuacao);
  return total;
}

beforeEach(async () => {
  mem = await bancoEmMemoria();
  armazenamento = armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" });
  trava = travaDeProcesso();
  registros = [];
  orgA = await criarOrganizacao("Serra Alta");
  orgB = await criarOrganizacao("Vale Fundo");
  await povoar(orgA, 3);
  await povoar(orgB, 2);
});

afterEach(async () => {
  await mem.banco.encerrar();
});

describe("O relogio que elimina municipio", () => {
  it("sem eliminacao agendada, a rodada nao toca em nada e nao faz barulho", async () => {
    const resumo = await executarEliminacoes(dependencias());

    expect(resumo.travado).toBe(false);
    expect(resumo.concluidas).toBe(0);
    expect(resumo.pendentes).toBe(0);
    expect(await contar("ocorrencias", orgA)).toBe(1);
    expect(await contar("ocorrencias", orgB)).toBe(1);
    expect(armazenamento.quantidade()).toBe(5);
    expect(registros, "rodada vazia nao pode encher o log").toEqual([]);
  });

  it("eliminacao agendada para o futuro NAO acontece: os sete dias sao de arrependimento", async () => {
    await agendar(orgA, "no_futuro");

    const resumo = await executarEliminacoes(dependencias());

    expect(resumo.concluidas).toBe(0);
    expect(await contar("ocorrencias", orgA)).toBe(1);
    expect(await contar("usuarios", orgA)).toBe(1);
    expect(await objetosSob(`tenant/${orgA}/`)).toBe(3);
    expect((await linhaDaOrganizacao(orgA))?.eliminada_em).toBeNull();
  });

  it("eliminacao vencida: banco limpo, armazenamento purgado, linha da organizacao fechada, e o vizinho intacto", async () => {
    await agendar(orgA, "vencida");

    const resumo = await executarEliminacoes(dependencias());

    expect(resumo.concluidas).toBe(1);
    expect(resumo.pendentes).toBe(0);

    // Fase 1: as linhas de negócio.
    for (const tabela of ["ocorrencias", "vistorias", "evidencias", "usuarios", "trilha_eventos"]) {
      expect(await contar(tabela, orgA), `sobrou linha em ${tabela}`).toBe(0);
    }
    // Fase 2: o armazenamento, e SÓ o prefixo daquela organização.
    expect(await objetosSob(`tenant/${orgA}/`)).toBe(0);
    expect(await objetosSob(`tenant/${orgB}/`), "a purga alcancou o vizinho").toBe(2);
    // Fase 3: a organização deixa de existir, e o livro fica, fechado.
    expect(await linhaDaOrganizacao(orgA)).toBeNull();
    const fechado = await livro(orgA);
    expect(fechado, "o livro sumiu junto com a organizacao").not.toBeNull();
    expect(fechado!.banco_apagado_em).not.toBeNull();
    expect(fechado!.armazenamento_purgado_em).not.toBeNull();
    expect(fechado!.concluida_em).not.toBeNull();
    expect(fechado!.contagens?.["ocorrencias"]).toBe(1);

    // O vizinho não sente nada.
    expect(await contar("ocorrencias", orgB)).toBe(1);
    expect(await contar("usuarios", orgB)).toBe(1);
    expect(await linhaDaOrganizacao(orgB)).not.toBeNull();
  });

  it("o log diz o identificador e quantos objetos foram apagados, por organizacao", async () => {
    await agendar(orgA, "vencida");

    await executarEliminacoes(dependencias());

    const concluida = registros.find((r) => /eliminacao concluida/.test(r.mensagem));
    expect(concluida, "faltou a linha de conclusao no log").toBeDefined();
    expect(concluida!.evento["organizacao"]).toBe(orgA);
    expect(concluida!.evento["objetosApagados"]).toBe(3);
    /*
      O que o log NÃO leva: nome de pessoa, endereço, protocolo. Ele é lido por
      mais gente e guardado por mais tempo do que qualquer um imagina, e a
      organização acabou de ser eliminada justamente para nada dela sobrar.
    */
    const tudo = JSON.stringify(registros);
    expect(tudo).not.toMatch(/Joana|Acacias|000001\/2026/);
  });

  it("listagem que falha no meio NAO conclui: a linha fica, e a proxima rodada termina o servico", async () => {
    /*
      A lista de objetos com buraco tem exatamente a forma de uma lista
      completa em que alguns objetos não aparecem. Concluir por cima dela
      apagaria a organização do banco e deixaria as fotografias que a página
      perdida escondia, sem dono, no balde. Então a rodada para, registra, e
      deixa para a próxima.
    */
    await agendar(orgA, "vencida");
    let paginasServidas = 0;
    const armazenamentoQueTropeca: Armazenamento = {
      ...armazenamento,
      async listar(prefixo, continuacao) {
        paginasServidas += 1;
        if (paginasServidas === 1) {
          return { objetos: [], continuacao: null, falha: "provedor respondeu 503 na listagem" };
        }
        return armazenamento.listar(prefixo, continuacao);
      },
    };

    const eliminador = criarEliminador(dependencias({ armazenamento: armazenamentoQueTropeca }));
    const primeira = await eliminador.executar();

    expect(primeira.concluidas).toBe(0);
    expect(primeira.pendentes).toBe(1);
    expect(eliminador.pendentes()).toEqual([orgA]);
    // As linhas de negócio já se foram (fase 1 é do banco), a organização NÃO.
    expect(await contar("ocorrencias", orgA)).toBe(0);
    const linha = await linhaDaOrganizacao(orgA);
    expect(linha, "a organizacao foi concluida com o armazenamento por purgar").not.toBeNull();
    expect(linha!.eliminada_em).not.toBeNull();
    expect(linha!.armazenamento_purgado_em).toBeNull();
    expect(await objetosSob(`tenant/${orgA}/`), "objetos apagados sem a lista completa").toBe(3);
    expect((await livro(orgA))!.concluida_em, "o livro foi fechado sem purga").toBeNull();

    const pendente = registros.find((r) => /fica para a proxima rodada/.test(r.mensagem));
    expect(pendente, "a purga incompleta nao foi registrada").toBeDefined();
    expect(pendente!.evento["organizacao"]).toBe(orgA);
    expect(String(pendente!.evento["falhas"])).toMatch(/503/);

    /*
      A rodada seguinte, com o provedor de bom humor, termina. A função do
      banco NÃO devolve a organização de novo (ela já apagou as linhas); quem
      lembra é a memória do eliminador, que reconfere no banco antes de purgar.
    */
    registros = [];
    const segunda = await eliminador.executar();
    expect(segunda.concluidas).toBe(1);
    expect(segunda.pendentes).toBe(0);
    expect(eliminador.pendentes()).toEqual([]);
    expect(await objetosSob(`tenant/${orgA}/`)).toBe(0);
    expect(await linhaDaOrganizacao(orgA)).toBeNull();
    expect((await livro(orgA))!.concluida_em).not.toBeNull();
  });

  it("um eliminador novo (processo reiniciado) REDESCOBRE a purga pendente e termina o trabalho", async () => {
    /*
      A memória do eliminador é do processo. Reiniciar a API, ou a purga ter
      começado na OUTRA máquina do Fly, perde a lista. Na primeira versão a
      função do banco não devolvia quem já tinha as linhas apagadas, e a
      organização ficava eliminada e nunca purgada: fotografias no
      armazenamento sem dono, para sempre, com `/saude` mostrando `vencidas`
      que não zera. Isso foi um caso de "limitação declarada" neste arquivo,
      e a correção veio do banco: `executar_eliminacoes_vencidas()` passou a
      devolver também quem tem `eliminada_em` sem `armazenamento_purgado_em`,
      em toda rodada, até a purga ser marcada.

      Então um processo novo, sem memória nenhuma, recebe o município de
      volta, purga, e conclui. E a fase do banco não se repete: não há mais
      nada a apagar, e o livro fica como estava.
    */
    await agendar(orgA, "vencida");
    const armazenamentoMudo: Armazenamento = {
      ...armazenamento,
      async listar() {
        return { objetos: [], continuacao: null, falha: "provedor fora do ar" };
      },
    };
    await executarEliminacoes(dependencias({ armazenamento: armazenamentoMudo }));
    expect((await linhaDaOrganizacao(orgA))?.eliminada_em).not.toBeNull();
    const livroAntes = await livro(orgA);

    const reiniciado = await executarEliminacoes(dependencias());
    expect(reiniciado.concluidas, "o processo novo não concluiu a purga que herdou").toBe(1);
    expect(await objetosSob(`tenant/${orgA}/`), "sobraram objetos no armazenamento").toBe(0);
    expect(await linhaDaOrganizacao(orgA), "a organização não foi apagada na conclusão").toBeNull();

    const livroDepois = await livro(orgA);
    /* `toEqual` e não `toBe`: `pg` devolve `Date`, e duas datas iguais são
       dois objetos. */
    expect(livroDepois!.banco_apagado_em).toEqual(livroAntes!.banco_apagado_em);
    expect(livroDepois!.contagens).toEqual(livroAntes!.contagens);
    expect(livroDepois!.concluida_em).not.toBeNull();
  });

  it("um apagar que falha NAO conclui, os outros objetos saem, e a proxima rodada termina", async () => {
    await agendar(orgA, "vencida");
    let recusas = 0;
    const armazenamentoQueRecusaUm: Armazenamento = {
      ...armazenamento,
      async apagar(chave) {
        if (chave.endsWith("foto-00001.jpg") && recusas === 0) {
          recusas += 1;
          return { situacao: "falha", motivo: "acesso negado pelo provedor" };
        }
        return armazenamento.apagar(chave);
      },
    };

    const eliminador = criarEliminador(dependencias({ armazenamento: armazenamentoQueRecusaUm }));
    const primeira = await eliminador.executar();

    expect(primeira.concluidas).toBe(0);
    expect(primeira.pendentes).toBe(1);
    expect(await objetosSob(`tenant/${orgA}/`), "os objetos que deu para apagar deviam ter saido").toBe(1);
    expect(await linhaDaOrganizacao(orgA)).not.toBeNull();

    const pendente = registros.find((r) => /fica para a proxima rodada/.test(r.mensagem));
    expect(pendente!.evento["objetosApagados"]).toBe(2);
    expect(String(pendente!.evento["falhas"])).toMatch(/acesso negado/);

    const segunda = await eliminador.executar();
    expect(segunda.concluidas).toBe(1);
    expect(await objetosSob(`tenant/${orgA}/`)).toBe(0);
    expect(await linhaDaOrganizacao(orgA)).toBeNull();
  });

  it("a retomada reconfere no banco: organizacao concluida pela outra maquina sai da memoria sem purgar nada", async () => {
    await agendar(orgA, "vencida");
    const armazenamentoMudo: Armazenamento = {
      ...armazenamento,
      async listar() {
        return { objetos: [], continuacao: null, falha: "provedor fora do ar" };
      },
    };
    const eliminador = criarEliminador(dependencias({ armazenamento: armazenamentoMudo }));
    await eliminador.executar();
    expect(eliminador.pendentes()).toEqual([orgA]);

    // A outra máquina concluiu (aqui: o dono das tabelas, direto).
    await mem.bruto.query("SELECT concluir_eliminacao($1)", [orgA]);
    expect(await linhaDaOrganizacao(orgA)).toBeNull();

    const depois = await eliminador.executar();
    expect(depois.pendentes).toBe(0);
    expect(depois.concluidas).toBe(0);
    expect(eliminador.pendentes()).toEqual([]);
  });

  it("o relogio do resumo nao escreve metrica de municipio eliminado: senao a conclusao bate na chave estrangeira", async () => {
    /*
      Entre apagar as linhas e concluir existe a purga, que demora. Nesse
      intervalo `municipios_a_resumir` ainda devolve o município (a linha
      existe, e não há métrica de hoje). Se o resumo escrevesse uma métrica,
      `metricas_municipio` voltaria a apontar para a organização, e
      `concluir_eliminacao` falharia no `DELETE` por chave estrangeira, para
      sempre. O relógio do resumo confere `eliminada_em` na mesma sentença em
      que chama a função.
    */
    await agendar(orgA, "vencida");
    const armazenamentoMudo: Armazenamento = {
      ...armazenamento,
      async listar() {
        return { objetos: [], continuacao: null, falha: "provedor fora do ar" };
      },
    };
    const eliminador = criarEliminador(dependencias({ armazenamento: armazenamentoMudo }));
    await eliminador.executar();
    expect((await linhaDaOrganizacao(orgA))?.eliminada_em).not.toBeNull();

    const resumo = await resumirMunicipios({ banco: mem.banco, trava: travaDeProcesso(), frescorMinutos: 60 });
    expect(resumo.falhas).toBe(0);
    expect(resumo.municipios, "o resumo contou o municipio eliminado como escrito").toBe(1);
    expect(await contar("metricas_municipio", orgA), "o resumo escreveu metrica de municipio eliminado").toBe(0);
    expect(await contar("metricas_municipio", orgB)).toBe(1);

    // E a conclusão passa, porque nenhuma métrica voltou a apontar para ela.
    await mem.bruto.query("SELECT concluir_eliminacao($1)", [orgA]);
    expect(await linhaDaOrganizacao(orgA)).toBeNull();
  });

  it("purga alem de uma pagina de listagem: mil e um objetos, todos apagados", async () => {
    /*
      A listagem em memória pagina em mil, o mesmo teto do S3, de propósito: um
      defeito de continuação apareceria aqui e não contra o provedor. Um
      município de três anos tem dezenas de milhares de objetos.
      */
    const orgC = await criarOrganizacao("Pedra Branca");
    await povoar(orgC, 1001);
    await agendar(orgC, "vencida");

    const resumo = await executarEliminacoes(dependencias());

    expect(resumo.concluidas).toBe(1);
    expect(await objetosSob(`tenant/${orgC}/`)).toBe(0);
    expect(await objetosSob(`tenant/${orgA}/`)).toBe(3);
    expect(await linhaDaOrganizacao(orgC)).toBeNull();
    const concluida = registros.find((r) => /eliminacao concluida/.test(r.mensagem));
    expect(concluida!.evento["objetosApagados"]).toBe(1001);
  });

  it("recusa purgar um prefixo que nao e o da propria organizacao", async () => {
    /*
      A DEFESA QUE PROTEGE O BALDE INTEIRO. O prefixo vem da função do banco, e
      a função é de outra frente. Se um dia ela devolver texto vazio, ou
      `tenant/`, ou o prefixo de outro município, o laço abaixo listaria e
      apagaria tudo o que existe no armazenamento de todas as prefeituras. A
      forma `tenant/<id da própria organização>/` é conferida antes de qualquer
      `listar`, e o que não tem essa forma não é purgado nem concluído.
    */
    await agendar(orgA, "vencida");
    const bancoComPrefixoErrado: Banco = {
      comTenant: (org, exec) => mem.banco.comTenant(org, exec),
      semTenant: async (execucao: (c: Consulta) => Promise<unknown>) =>
        mem.banco.semTenant(async (c) => {
          const original = c.query.bind(c);
          const enganado: Consulta = {
            query: async <T>(sql: string, params?: readonly unknown[]) => {
              const r = await original<Record<string, unknown>>(sql, params);
              if (/executar_eliminacoes_vencidas/.test(sql)) {
                return {
                  rows: r.rows.map((l) => ({ ...l, prefixo_do_armazenamento: "tenant/" })) as T[],
                };
              }
              return r as { rows: T[] };
            },
          };
          return execucao(enganado);
        }),
      encerrar: () => Promise.resolve(),
    } as Banco;

    const resumo = await executarEliminacoes(dependencias({ banco: bancoComPrefixoErrado }));

    expect(resumo.concluidas).toBe(0);
    expect(resumo.pendentes).toBe(1);
    expect(armazenamento.quantidade(), "a purga saiu do prefixo da organizacao").toBe(5);
    expect(await linhaDaOrganizacao(orgA)).not.toBeNull();
    const recusa = registros.find((r) => /prefixo/.test(r.mensagem));
    expect(recusa, "a recusa do prefixo nao foi registrada").toBeDefined();
  });

  it("com a trava tomada por outra maquina, a rodada desiste sem tocar em nada", async () => {
    /*
      Em produção são duas máquinas no Fly. Sem a trava, as duas listam e
      apagam o mesmo prefixo ao mesmo tempo, e o `concluir_eliminacao` de uma
      corre com a purga da outra.
    */
    await agendar(orgA, "vencida");
    await trava.tentar();

    const resumo = await executarEliminacoes(dependencias());

    expect(resumo.travado).toBe(true);
    expect(resumo.concluidas).toBe(0);
    expect(await contar("ocorrencias", orgA)).toBe(1);
    expect(await objetosSob(`tenant/${orgA}/`)).toBe(3);
  });

  it("a trava tem numero proprio, distinto das outras rotinas", () => {
    // Compartilhar a chave com outra rotina faria a eliminação deixar de rodar
    // sempre que a outra estivesse no ar, e a eliminação venceria em silêncio.
    const outras = [
      CHAVE_DA_VARREDURA_DE_PRAZO, CHAVE_DA_MINIMIZACAO, CHAVE_DA_VARREDURA_DE_ORFAOS, CHAVE_DO_RESUMO,
    ];
    expect(outras).not.toContain(CHAVE_DA_ELIMINACAO);
    expect(Number.isSafeInteger(CHAVE_DA_ELIMINACAO)).toBe(true);
  });

  it("uma falha inteira no banco solta a trava para a proxima rodada", async () => {
    const bancoQuebrado: Banco = {
      comTenant: () => Promise.reject(new Error("banco fora")),
      semTenant: () => Promise.reject(new Error("banco fora")),
      encerrar: () => Promise.resolve(),
    };
    await expect(executarEliminacoes(dependencias({ banco: bancoQuebrado }))).rejects.toThrow(/banco fora/);
    expect(await trava.tentar(), "a trava ficou presa depois da falha").toBe(true);
  });

  it("a partida da API liga o relogio SEM chave de ambiente, e nao apenas o declara", async () => {
    /*
      NÃO HÁ CHAVE PARA DESLIGAR ISTO, e a decisão está escrita em `index.ts`.
      Este relógio é o único caminho de execução de uma decisão do fornecedor
      já tomada, com segundo fator, e com sete dias de espera. Uma chave
      desligada em produção deixaria eliminações vencerem sem acontecer, em
      silêncio, e a saída seria alguém rodar `DELETE` à mão com a credencial
      de dono, que é o padrão que a ADR 0008 nomeia como o problema.
    */
    const partida = readFileSync(join(AQUI, "..", "src", "index.ts"), "utf8");
    expect(partida).toContain("agendarEliminacoes");
    expect(/agendarEliminacoes\s*\(/.test(partida)).toBe(true);
    expect(
      /ELIMINAC(?:AO|OES)_ATIVA/.test(partida),
      "a partida esconde o relogio de eliminacao atras de uma chave de ambiente",
    ).toBe(false);
  });
});

describe("A rota de saude diz se o relogio tem trabalho", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const config = carregarConfig({
      NODE_ENV: "test",
      JWT_SEGREDO: "segredo-da-saude-com-mais-de-trinta-e-dois-bytes",
    } as NodeJS.ProcessEnv);
    app = await construirServidor({ banco: mem.banco, config, armazenamento });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("sem nada agendado, diz zero", async () => {
    const r = await app.inject({ method: "GET", url: "/saude" });
    expect(r.statusCode).toBe(200);
    expect(r.json().eliminacoes).toEqual({ agendadas: 0, vencidas: 0 });
  });

  it("conta as agendadas e as vencidas, sem nome nenhum", async () => {
    await agendar(orgA, "no_futuro");
    await agendar(orgB, "vencida");

    const r = await app.inject({ method: "GET", url: "/saude" });

    expect(r.statusCode).toBe(200);
    expect(r.json().eliminacoes).toEqual({ agendadas: 2, vencidas: 1 });
    expect(r.body).not.toMatch(/Serra Alta|Vale Fundo/);
    expect(r.body).not.toContain(orgA);
    expect(r.body).not.toContain(orgB);
  });

  it("a eliminacao vencida some da conta quando o relogio conclui", async () => {
    await agendar(orgA, "vencida");
    await executarEliminacoes(dependencias());
    const r = await app.inject({ method: "GET", url: "/saude" });
    expect(r.json().eliminacoes).toEqual({ agendadas: 0, vencidas: 0 });
  });
});
