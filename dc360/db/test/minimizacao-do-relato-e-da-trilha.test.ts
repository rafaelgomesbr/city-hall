/**
 * A MINIMIZAÇÃO POR PRAZO ALCANÇA O RELATO, A OBSERVAÇÃO DA VISTORIA E A
 * TRILHA (migração 043).
 *
 * O achado que este arquivo reproduz, provado por sondagem contra a API real:
 * com prazo de um dia e `minimizar_por_prazo(100)`, o nome do solicitante
 * virava marcador, e a MESMA pessoa continuava nomeada em três lugares que a
 * 021 e a 029 não cobriam:
 *
 *   - `ocorrencias.descricao`, o relato ("Dona Marilda ligou...");
 *   - `vistorias.observacoes`, o texto livre do agente ("moradora Marilda
 *     presente; filho Carlos acamado");
 *   - `trilha_eventos.detalhe->>'assinante'` do evento `vistoria`, que a rota
 *     de sincronização gravava com o nome de quem assinou a ciência.
 *
 * O laudo reimpresso depois do prazo trazia nome e condição de saúde da
 * família. A política do município valia só para a coluna que alguém lembrou
 * de cobrir, que é exatamente o teatro que o cabeçalho da 029 disse que não
 * podia acontecer.
 *
 * O que fica de propósito, e o arquivo cobra que fique: `vistorias.
 * assinante_nome`. É o nome de quem deu ciência do ato de interdição, faz
 * parte do ato, e `docs/PRIVACIDADE.md` declara a exceção.
 *
 * A trilha é append-only para a aplicação, e continua sendo: o único caminho
 * que a reescreve é a própria função de minimização, como dono das tabelas,
 * com `row_security = off` e conferência de que nada sobrou. O último bloco
 * prova que a aplicação segue sem UPDATE e que não nasceu policy nova.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const aqui = dirname(fileURLToPath(import.meta.url));
const pastaDeMigracoes = join(aqui, "..", "migrations");
const migracoes = readdirSync(pastaDeMigracoes)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(pastaDeMigracoes, f), "utf8"));

const MARCADOR = "removido por prazo";

let db: PGlite;

type Tx = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
};

/** Como a API executa: papel de aplicação, com ou sem município no contexto. */
async function comoApp<T>(orgId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE dc360_app");
    if (orgId) {
      await tx.query("SELECT set_config('app.organizacao_atual', $1, true)", [orgId]);
    }
    return fn(tx as unknown as Tx);
  }) as Promise<T>;
}

/** A mensagem do erro, ou vazio quando não houve erro. */
async function mensagemDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "";
  } catch (erro) {
    return erro instanceof Error ? erro.message : String(erro);
  }
}

/** O relógio da API: sem ninguém logado, sem município no contexto. */
async function varrer(teto = 100) {
  return comoApp(null, (tx) =>
    tx.query<{ municipio: string; ocorrencia: string; campos_removidos: string[] }>(
      "SELECT * FROM minimizar_por_prazo($1)", [teto],
    ),
  ).then((r) => r.rows);
}

async function criarMunicipio(nome: string, prazoDias: number | null): Promise<string> {
  const r = await db.query<{ id: string }>(
    `INSERT INTO organizacoes (nome, municipio, uf, retencao_solicitante_dias)
     VALUES ($1, $2, 'MG', $3) RETURNING id`,
    [`Defesa Civil de ${nome}`, nome, prazoDias],
  );
  return r.rows[0]!.id;
}

/**
 * A ocorrência da sondagem, inteira: relato nomeando a moradora e a saúde do
 * filho, vistoria com a mesma moradora na observação e na ciência, e o
 * evento `vistoria` da trilha como a rota de sincronização o gravava até
 * 15/09/2026, com `assinante` dentro do `detalhe`.
 */
async function ocorrenciaDaSondagem(
  org: string, protocolo: string, opcoes: { encerradaHaDias: number | null; observacoes?: string | null },
): Promise<{ ocorrencia: string; vistoria: string; eventoVistoria: string }> {
  const encerrada = opcoes.encerradaHaDias;
  const oc = await db.query<{ id: string }>(
    `INSERT INTO ocorrencias
       (organizacao_id, protocolo, tipo, status, severidade, endereco,
        solicitante_nome, solicitante_contato,
        vulnerabilidade_presente, vulnerabilidade_descricao,
        canal_entrada, descricao, encerrado_em, motivo_encerramento)
     VALUES ($1, $2, 'deslizamento', $3, 'alta', 'Rua das Acácias, 245, Morro do Cruzeiro',
             'Marilda Souza Prado', '(35) 99871-4402',
             true, 'Filho Carlos acamado, dependente de oxigênio.',
             'telefone',
             'Dona Marilda ligou dizendo que o talude atrás da casa cedeu; o filho Carlos está acamado no quarto dos fundos.',
             $4, $5)
     RETURNING id`,
    [
      org, protocolo,
      encerrada === null ? "vistoria_concluida" : "encerrada",
      encerrada === null ? null : new Date(Date.now() - encerrada * 86_400_000),
      encerrada === null ? null : "Risco cessado após contenção.",
    ],
  );
  const ocorrencia = oc.rows[0]!.id;

  const v = await db.query<{ id: string }>(
    `INSERT INTO vistorias
       (organizacao_id, ocorrencia_id, checklist, assinante_nome, observacoes,
        coletada_em, idempotency_key)
     VALUES ($1, $2, '[]'::jsonb, 'Marilda Souza Prado', $3, now() - interval '1 hour', gen_random_uuid())
     RETURNING id`,
    [org, ocorrencia, opcoes.observacoes === undefined
      ? "Moradora Marilda presente; filho Carlos acamado no quarto dos fundos."
      : opcoes.observacoes],
  );

  const e = await db.query<{ id: string }>(
    `INSERT INTO trilha_eventos
       (organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel, origem, ocorrido_em, detalhe)
     VALUES ($1, $2, 'vistoria', NULL, 'Diego Nakamura Alves', 'agente_campo', 'campo', now() - interval '1 hour',
             '{"fotos": 2, "gpsPrecisaoMetros": 6.2, "assinante": "Marilda Souza Prado"}'::jsonb)
     RETURNING id`,
    [org, ocorrencia],
  );
  // Um evento que nunca teve nome, para provar que a redação não inventa marcador onde não havia.
  await db.query(
    `INSERT INTO trilha_eventos
       (organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel, origem, ocorrido_em, detalhe)
     VALUES ($1, $2, 'registro', NULL, 'Jonas Ferreira', 'operador', 'escritorio', now() - interval '2 hours',
             '{"canal": "telefone"}'::jsonb)`,
    [org, ocorrencia],
  );

  return { ocorrencia, vistoria: v.rows[0]!.id, eventoVistoria: e.rows[0]!.id };
}

async function lerOcorrencia(id: string) {
  const r = await db.query<{
    solicitante_nome: string; descricao: string; descricao_removida_em: string | null;
    vulnerabilidade_descricao: string | null; endereco: string; protocolo: string;
  }>(
    `SELECT solicitante_nome, descricao, descricao_removida_em::text AS descricao_removida_em,
            vulnerabilidade_descricao, endereco, protocolo
       FROM ocorrencias WHERE id = $1`, [id],
  );
  return r.rows[0]!;
}

async function lerVistoria(id: string) {
  const r = await db.query<{
    assinante_nome: string; observacoes: string | null; observacoes_removidas_em: string | null;
  }>(
    `SELECT assinante_nome, observacoes, observacoes_removidas_em::text AS observacoes_removidas_em
       FROM vistorias WHERE id = $1`, [id],
  );
  return r.rows[0]!;
}

async function eventosDe(ocorrencia: string) {
  const r = await db.query<{
    id: string; tipo: string; autor_nome: string; detalhe: Record<string, unknown> | null;
  }>(
    "SELECT id, tipo, autor_nome, detalhe FROM trilha_eventos WHERE ocorrencia_id = $1 ORDER BY registrado_em, ocorrido_em",
    [ocorrencia],
  );
  return r.rows;
}

beforeAll(async () => {
  db = new PGlite();
  for (const migracao of migracoes) await db.exec(migracao);
});

afterAll(async () => {
  await db?.close();
});

describe("A sondagem virando teste: um dia de prazo, e a mesma pessoa em quatro lugares", () => {
  let org = "";
  let alvo: Awaited<ReturnType<typeof ocorrenciaDaSondagem>>;
  let aberta: Awaited<ReturnType<typeof ocorrenciaDaSondagem>>;
  let resultado: Awaited<ReturnType<typeof varrer>>;

  beforeAll(async () => {
    org = await criarMunicipio("Serra Alta", 1);
    alvo = await ocorrenciaDaSondagem(org, "000001/2026", { encerradaHaDias: 3 });
    // A mesma forma, ainda ABERTA: nada dela pode sair, nem da trilha.
    aberta = await ocorrenciaDaSondagem(org, "000002/2026", { encerradaHaDias: null });
    resultado = await varrer();
  });

  it("a varredura alcançou a ocorrência encerrada, e só ela", () => {
    expect(resultado.map((r) => r.ocorrencia)).toEqual([alvo.ocorrencia]);
  });

  it("o relato do solicitante vira o mesmo marcador do nome, com a data do descarte", async () => {
    const o = await lerOcorrencia(alvo.ocorrencia);
    expect(o.solicitante_nome).toBe(MARCADOR);
    expect(o.descricao, "o relato ainda nomeia a moradora e a saúde do filho").not.toMatch(/Marilda|Carlos|acamado/);
    expect(o.descricao).toBe(MARCADOR);
    expect(o.descricao_removida_em, "sem a data, descarte e relato vazio ficam iguais").not.toBeNull();
    expect(o.vulnerabilidade_descricao).toBeNull();
    // O ato administrativo fica: protocolo e endereço são do imóvel e do ato.
    expect(o.protocolo).toBe("000001/2026");
    expect(o.endereco).toContain("Rua das Acácias");
  });

  it("a observação do agente na vistoria vira marcador, e o nome de quem deu ciência FICA", async () => {
    const v = await lerVistoria(alvo.vistoria);
    expect(v.observacoes, "a observação ainda nomeia a moradora e a saúde do filho").not.toMatch(/Marilda|Carlos|acamado/);
    expect(v.observacoes).toBe(MARCADOR);
    expect(v.observacoes_removidas_em).not.toBeNull();
    /*
      A exceção declarada em `docs/PRIVACIDADE.md`: quem assinou a ciência da
      interdição faz parte do ato administrativo, e o ato é permanente.
    */
    expect(v.assinante_nome).toBe("Marilda Souza Prado");
  });

  it("a trilha deixa de guardar o nome do assinante: o evento vistoria é redigido, e o resto dele fica", async () => {
    const eventos = await eventosDe(alvo.ocorrencia);
    const vistoria = eventos.find((e) => e.id === alvo.eventoVistoria)!;
    expect(vistoria.detalhe!.assinante, "o nome continua na trilha, para sempre").toBe(MARCADOR);
    // Redigir é trocar UM valor: fotos e precisão do GPS são o registro do ato e continuam.
    expect(vistoria.detalhe!.fotos).toBe(2);
    expect(vistoria.detalhe!.gpsPrecisaoMetros).toBe(6.2);

    // O evento que nunca teve nome não ganha marcador: redigir não inventa histórico.
    const registro = eventos.find((e) => e.tipo === "registro")!;
    expect(registro.detalhe).toEqual({ canal: "telefone" });
  });

  it("depois da passada, o nome da moradora e a saúde do filho não estão em lugar nenhum da trilha", async () => {
    const bruto = JSON.stringify(await eventosDe(alvo.ocorrencia));
    expect(bruto).not.toContain("Marilda");
    expect(bruto).not.toContain("Carlos");
    expect(bruto).not.toContain("acamado");
  });

  it("o evento de minimização diz QUAIS campos saíram, inclusive os três novos, e nunca o que continham", async () => {
    const eventos = await eventosDe(alvo.ocorrencia);
    const m = eventos.filter((e) => e.tipo === "minimizacao_por_prazo");
    expect(m).toHaveLength(1);
    const campos = m[0]!.detalhe!.campos as string[];
    expect(campos).toEqual(expect.arrayContaining([
      "solicitante_nome", "solicitante_contato", "vulnerabilidade_descricao",
      "descricao", "vistoria_observacoes", "trilha_vistoria_assinante",
    ]));
    // E o mesmo resultado sai da função, para o log contar sem reproduzir.
    expect(resultado[0]!.campos_removidos).toEqual(campos);
    expect(m[0]!.detalhe!.trilha_eventos_redigidos).toBe(1);
    expect(m[0]!.autor_nome).toMatch(/automatica/i);
  });

  it("a ocorrência aberta do mesmo município não perde nada, nem na trilha", async () => {
    const o = await lerOcorrencia(aberta.ocorrencia);
    expect(o.descricao).toContain("Dona Marilda");
    expect(o.descricao_removida_em).toBeNull();
    const v = await lerVistoria(aberta.vistoria);
    expect(v.observacoes).toContain("Marilda");
    expect(v.observacoes_removidas_em).toBeNull();
    const ev = (await eventosDe(aberta.ocorrencia)).find((e) => e.id === aberta.eventoVistoria)!;
    expect(ev.detalhe!.assinante).toBe("Marilda Souza Prado");
  });

  it("a segunda passada não remove de novo, não redige de novo e não duplica o evento", async () => {
    const segunda = await varrer();
    expect(segunda).toEqual([]);
    const m = (await eventosDe(alvo.ocorrencia)).filter((e) => e.tipo === "minimizacao_por_prazo");
    expect(m).toHaveLength(1);
  });
});

describe("As bordas: vistoria sem observação, município sem prazo, e o banco cobrando coerência", () => {
  it("vistoria que nunca teve observação continua sem observação: marcador só onde havia texto", async () => {
    const org = await criarMunicipio("Vale Fundo", 1);
    const semTexto = await ocorrenciaDaSondagem(org, "000001/2026", { encerradaHaDias: 3, observacoes: null });
    await varrer();
    const v = await lerVistoria(semTexto.vistoria);
    expect(v.observacoes).toBeNull();
    expect(v.observacoes_removidas_em).toBeNull();
    // E o evento de minimização desta ocorrência não afirma ter removido o que não havia.
    const m = (await eventosDe(semTexto.ocorrencia)).filter((e) => e.tipo === "minimizacao_por_prazo");
    expect(m).toHaveLength(1);
    expect(m[0]!.detalhe!.campos).not.toContain("vistoria_observacoes");
    expect(m[0]!.detalhe!.campos).toContain("descricao");
  });

  it("município sem prazo configurado não perde relato, observação nem nome na trilha", async () => {
    const org = await criarMunicipio("Alto Rio", null);
    const velha = await ocorrenciaDaSondagem(org, "000001/2026", { encerradaHaDias: 3650 });
    await varrer();
    expect((await lerOcorrencia(velha.ocorrencia)).descricao).toContain("Dona Marilda");
    expect((await lerVistoria(velha.vistoria)).observacoes).toContain("Marilda");
    const ev = (await eventosDe(velha.ocorrencia)).find((e) => e.id === velha.eventoVistoria)!;
    expect(ev.detalhe!.assinante).toBe("Marilda Souza Prado");
  });

  it("o banco recusa marcador incoerente: data de descarte com relato de verdade, nos dois lados", async () => {
    const org = await criarMunicipio("Boca do Mato", null);
    const oc = await ocorrenciaDaSondagem(org, "000001/2026", { encerradaHaDias: null });
    await expect(
      db.query("UPDATE ocorrencias SET descricao_removida_em = now() WHERE id = $1", [oc.ocorrencia]),
    ).rejects.toThrow(/marcador_de_relato_e_coerente|check/i);
    await expect(
      db.query("UPDATE vistorias SET observacoes_removidas_em = now() WHERE id = $1", [oc.vistoria]),
    ).rejects.toThrow(/marcador_de_observacoes_e_coerente|check/i);
  });
});

describe("A trilha continua append-only para a aplicação: a única escrita é a da função do dono", () => {
  it("não nasceu policy de UPDATE nem de DELETE em trilha_eventos", async () => {
    const r = await db.query<{ policyname: string; cmd: string }>(
      "SELECT policyname, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = 'trilha_eventos' ORDER BY 1",
    );
    expect(r.rows.map((p) => p.cmd).sort()).toEqual(["INSERT", "SELECT"]);
  });

  it("o papel de aplicação continua sem conseguir redigir a trilha por conta própria", async () => {
    const org = await criarMunicipio("Porto Velho do Sul", null);
    const oc = await ocorrenciaDaSondagem(org, "000001/2026", { encerradaHaDias: null });
    const msg = await mensagemDe(() =>
      comoApp(org, (tx) => tx.query(
        "UPDATE trilha_eventos SET detalhe = detalhe || '{\"assinante\": \"x\"}'::jsonb WHERE id = $1",
        [oc.eventoVistoria],
      )),
    );
    expect(msg, "a aplicação reescreveu a trilha").toMatch(/permission denied|permissão|policy/i);
    const ev = (await eventosDe(oc.ocorrencia)).find((e) => e.id === oc.eventoVistoria)!;
    expect(ev.detalhe!.assinante).toBe("Marilda Souza Prado");
  });

  it("a função de minimização fixa o search_path e desliga o row_security, como as da 038 e da 039", async () => {
    const r = await db.query<{ prosecdef: boolean; config: string[] | null }>(
      `SELECT p.prosecdef, p.proconfig AS config
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'minimizar_por_prazo'`,
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.prosecdef).toBe(true);
    expect((r.rows[0]!.config ?? []).some((c) => c.startsWith("search_path="))).toBe(true);
    /*
      `row_security = off` é a guarda contra o dono sem BYPASSRLS: a escrita que
      SERIA filtrada por policy (e a trilha não tem policy de UPDATE para
      ninguém) vira erro, em vez de zero em silêncio. O bloco seguinte prova o
      efeito; este caso prova que a guarda está declarada.
    */
    expect((r.rows[0]!.config ?? []).includes("row_security=off")).toBe(true);
  });
});

/* =====================================================================
 * ARMADILHA 1: o dono das tabelas SEM BYPASSRLS (cabeçalho da 038).
 *
 * `FORCE ROW LEVEL SECURITY` vale para o dono, e `trilha_eventos` não tem
 * policy de UPDATE para papel nenhum. Uma função privilegiada ingênua que
 * redigisse a trilha com um dono sem `BYPASSRLS` redigiria ZERO em silêncio,
 * e o evento de minimização diria que redigiu. O PGlite roda como
 * superusuário, então o cenário é simulado dando a função a um dono não
 * superusuário e sem `BYPASSRLS`, com privilégio em todas as tabelas.
 * ===================================================================== */
describe("Armadilha 1: com o dono sem BYPASSRLS, a minimização estoura em vez de minimizar pela metade", () => {
  let org = "";
  let alvo: Awaited<ReturnType<typeof ocorrenciaDaSondagem>>;
  let donoDeVerdade = "";

  beforeAll(async () => {
    org = await criarMunicipio("Pedra Branca", 1);
    alvo = await ocorrenciaDaSondagem(org, "000001/2026", { encerradaHaDias: 3 });
    donoDeVerdade = (await db.query<{ o: string }>(
      "SELECT DISTINCT tableowner AS o FROM pg_tables WHERE schemaname = 'public'",
    )).rows[0]!.o;
    await db.exec(`
      CREATE ROLE dono_sem_bypassrls_043 NOLOGIN NOSUPERUSER NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public TO dono_sem_bypassrls_043;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO dono_sem_bypassrls_043;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO dono_sem_bypassrls_043;
      ALTER FUNCTION minimizar_por_prazo(integer) OWNER TO dono_sem_bypassrls_043;
    `);
  });

  afterAll(async () => {
    await db.exec(`
      ALTER FUNCTION minimizar_por_prazo(integer) OWNER TO ${donoDeVerdade};
      REVOKE ALL ON ALL TABLES IN SCHEMA public FROM dono_sem_bypassrls_043;
      REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM dono_sem_bypassrls_043;
      REVOKE USAGE ON SCHEMA public FROM dono_sem_bypassrls_043;
      DROP ROLE dono_sem_bypassrls_043;
    `);
  });

  it("estoura nomeando BYPASSRLS, e nada sai: nem o nome, nem o relato, nem a trilha", async () => {
    const msg = await mensagemDe(() => varrer());
    expect(msg, "a função devolveu sucesso com o dono sem BYPASSRLS").not.toBe("");
    expect(msg).toMatch(/BYPASSRLS/);

    const o = await lerOcorrencia(alvo.ocorrencia);
    expect(o.solicitante_nome).toBe("Marilda Souza Prado");
    expect(o.descricao).toContain("Dona Marilda");
    expect((await lerVistoria(alvo.vistoria)).observacoes).toContain("Marilda");
    const eventos = await eventosDe(alvo.ocorrencia);
    expect(eventos.find((e) => e.id === alvo.eventoVistoria)!.detalhe!.assinante).toBe("Marilda Souza Prado");
    expect(eventos.filter((e) => e.tipo === "minimizacao_por_prazo")).toHaveLength(0);
  });
});
