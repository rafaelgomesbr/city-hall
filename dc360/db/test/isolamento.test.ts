/**
 * CA-06: teste de isolamento entre municípios.
 *
 * Este é o portão de saída da fundação técnica, e ele bloqueia o merge.
 * A pergunta que ele responde é uma só: com o contexto de um município,
 * é possível ler, alterar ou criar dado de outro?
 *
 * Roda em PGlite (Postgres 16 em WASM), então não exige Docker nem servidor:
 * o teste que protege o isolamento não pode depender de infra que alguém
 * possa "pular por enquanto".
 *
 * Detalhe que faz o teste valer: o superusuário do Postgres ignora RLS.
 * Por isso tudo que simula a aplicação roda com SET ROLE dc360_app, que é o
 * mesmo papel sem privilégio que a API usa em produção.
 *
 * Segundo detalhe, aprendido do jeito difícil: uma versão anterior deste
 * arquivo só exercitava chamadas em sequência, e por isso deixou passar um
 * vazamento real entre municípios que só aparece quando duas transações
 * disputam a mesma conexão. O último bloco cobre exatamente esse caso.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const aqui = dirname(fileURLToPath(import.meta.url));
/**
 * TODAS as migrações, na ordem, e não só a primeira.
 *
 * Uma versão anterior lia apenas `001_base.sql`, e o efeito foi silencioso: a
 * tabela `sessoes`, criada na 002, ficou fora do portão que existe justamente
 * para garantir que nenhuma tabela de negócio escape do isolamento. Ler a
 * pasta inteira faz com que uma migração nova entre no teste sozinha.
 */
const pastaDeMigracoes = join(aqui, "..", "migrations");
const migracoes = readdirSync(pastaDeMigracoes)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(pastaDeMigracoes, f), "utf8"));

let db: PGlite;
let orgA: string;
let orgB: string;
let ocorrenciaDeB: string;

/**
 * Executa como a aplicação executaria, e pelo MESMO mecanismo: papel sem
 * privilégio, contexto do tenant, tudo dentro de `db.transaction()`.
 *
 * Usar `db.transaction()` aqui, em vez de BEGIN e COMMIT na mão, não é
 * detalhe de teste. É o que `apps/web/src/dados/banco.ts` faz, e é o que
 * mantém o par `SET LOCAL` + consulta indivisível quando a conexão é única.
 * Se o teste usasse um mecanismo diferente do da aplicação, ele estaria
 * atestando algo que ninguém executa.
 */
async function comoApp<T>(orgId: string | null, fn: (tx: any) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE dc360_app");
    if (orgId) {
      await tx.query("SELECT set_config('app.organizacao_atual', $1, true)", [orgId]);
    }
    return fn(tx);
  }) as Promise<T>;
}

beforeAll(async () => {
  db = new PGlite();
  for (const migracao of migracoes) await db.exec(migracao);

  // Semeadura roda como dono das tabelas, fora do papel de aplicação.
  const a = await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('Defesa Civil de Serra Alta','Serra Alta','MG') RETURNING id",
  );
  const b = await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('Defesa Civil de Vale Fundo','Vale Fundo','MG') RETURNING id",
  );
  orgA = a.rows[0]!.id;
  orgB = b.rows[0]!.id;

  for (const [org, protocolo, endereco] of [
    [orgA, "000001/2026", "Rua das Acácias, 245"],
    [orgB, "000001/2026", "Avenida Central, 900"],
  ] as const) {
    const r = await db.query<{ id: string }>(
      `INSERT INTO ocorrencias
         (organizacao_id, protocolo, tipo, status, endereco, solicitante_nome, canal_entrada, descricao)
       VALUES ($1,$2,'deslizamento','registrada',$3,'Fulano de Tal','telefone','Relato de teste')
       RETURNING id`,
      [org, protocolo, endereco],
    );
    if (org === orgB) ocorrenciaDeB = r.rows[0]!.id;
  }
});

afterAll(async () => {
  await db?.close();
});

describe("CA-06: isolamento entre organizações", () => {
  it("cada município enxerga apenas as próprias ocorrências", async () => {
    const deA = await comoApp(orgA, (tx) =>
      tx.query<{ endereco: string }>("SELECT endereco FROM ocorrencias"),
    );
    expect(deA.rows).toHaveLength(1);
    expect(deA.rows[0]!.endereco).toBe("Rua das Acácias, 245");

    const deB = await comoApp(orgB, (tx) =>
      tx.query<{ endereco: string }>("SELECT endereco FROM ocorrencias"),
    );
    expect(deB.rows).toHaveLength(1);
    expect(deB.rows[0]!.endereco).toBe("Avenida Central, 900");
  });

  it("não lê ocorrência de outro município nem pedindo pelo id exato", async () => {
    const r = await comoApp(orgA, (tx) =>
      tx.query("SELECT id FROM ocorrencias WHERE id = $1", [ocorrenciaDeB]),
    );
    expect(r.rows).toHaveLength(0);
  });

  it("não altera ocorrência de outro município", async () => {
    await comoApp(orgA, (tx) =>
      tx.query("UPDATE ocorrencias SET descricao = 'invadido' WHERE id = $1", [ocorrenciaDeB]),
    );
    // Sem contexto de tenant a leitura de conferência roda como dono.
    const conf = await db.query<{ descricao: string }>(
      "SELECT descricao FROM ocorrencias WHERE id = $1",
      [ocorrenciaDeB],
    );
    expect(conf.rows[0]!.descricao).toBe("Relato de teste");
  });

  it("não cria registro carimbado com o id de outro município", async () => {
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO ocorrencias
             (organizacao_id, protocolo, tipo, status, endereco, solicitante_nome, canal_entrada, descricao)
           VALUES ($1,'000999/2026','vendaval','registrada','Rua Falsa','Teste','telefone','x')`,
          [orgB],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("sem contexto de organização, não enxerga nada", async () => {
    const r = await comoApp(null, (tx) => tx.query("SELECT id FROM ocorrencias"));
    expect(r.rows).toHaveLength(0);
  });

  /**
   * A lista de tabelas é DESCOBERTA, não escrita à mão.
   *
   * Uma versão anterior deste teste enumerava as tabelas uma a uma. O efeito
   * era silencioso e já aconteceu duas vezes: `sessoes` (migração 002) e
   * `exportacoes` (migração 007) ficaram fora do portão até alguém lembrar de
   * acrescentá-las. Um portão que depende de memória não é portão.
   *
   * Agora ele pergunta ao banco quais tabelas existem, e a única isenta é a de
   * controle de migrações, que não guarda dado de município nenhum.
   */
  const SEM_TENANT = new Set([
    // Controle do próprio aplicador de migrações.
    "schema_migracoes",
    // A raiz do tenant: ela não tem organizacao_id, ela É a organização.
    "organizacoes",
    // Sequência de protocolo: tem organizacao_id e policy, mas a chave
    // primária é composta e não tem coluna `id`.
    "protocolo_sequencias",
  ]);

  async function tabelasDeNegocio(): Promise<string[]> {
    const r = await db.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    return r.rows.map((l) => l.tablename).filter((t) => t !== "schema_migracoes");
  }

  it("toda tabela do esquema tem RLS ativada E forçada", async () => {
    const tabelas = await tabelasDeNegocio();
    expect(tabelas.length).toBeGreaterThanOrEqual(11);

    for (const t of tabelas) {
      const r = await db.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = $1",
        [t],
      );
      expect(r.rows[0], `tabela ${t} não encontrada`).toBeDefined();
      expect(r.rows[0]!.relrowsecurity, `RLS desligada em ${t}`).toBe(true);
      expect(r.rows[0]!.relforcerowsecurity, `RLS não forçada em ${t}`).toBe(true);
    }
  });

  it("toda tabela de negócio tem policy amarrada na organização do contexto", async () => {
    for (const t of await tabelasDeNegocio()) {
      const r = await db.query<{ qual: string | null; with_check: string | null }>(
        "SELECT qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename = $1",
        [t],
      );
      expect(r.rows.length, `tabela ${t} sem nenhuma policy`).toBeGreaterThan(0);

      // Toda policy precisa se apoiar na função de contexto. Uma policy com
      // `USING (true)` passaria pelo teste anterior e não isolaria nada.
      const expressoes = r.rows
        .flatMap((linha) => [linha.qual, linha.with_check])
        .filter((e): e is string => Boolean(e));
      expect(expressoes.length, `policies de ${t} sem expressão`).toBeGreaterThan(0);
      for (const expressao of expressoes) {
        expect(
          expressao,
          `policy de ${t} não usa app_organizacao_atual(): ${expressao}`,
        ).toContain("app_organizacao_atual");
      }
    }
  });

  it("toda tabela de negócio carrega a coluna organizacao_id", async () => {
    for (const t of await tabelasDeNegocio()) {
      if (SEM_TENANT.has(t)) continue;
      const r = await db.query<{ existe: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name=$1 AND column_name='organizacao_id'
              AND is_nullable = 'NO'
         ) AS existe`,
        [t],
      );
      expect(r.rows[0]!.existe, `${t} não tem organizacao_id obrigatório`).toBe(true);
    }
  });

  it("toda referência entre tabelas de negócio inclui a organização", async () => {
    /*
      A verificação de chave estrangeira roda por baixo do RLS. Uma referência
      simples a outra tabela de negócio alcança linha de qualquer município, e
      isso já foi vazamento real aqui (ver migração 008). Este teste impede que
      volte por uma migração futura.
    */
    const r = await db.query<{ tabela: string; nome: string; colunas: string; alvo: string }>(`
      SELECT c.conrelid::regclass::text AS tabela,
             c.conname AS nome,
             (SELECT string_agg(a.attname, ',' ORDER BY a.attnum)
                FROM unnest(c.conkey) AS k(attnum)
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS colunas,
             c.confrelid::regclass::text AS alvo
        FROM pg_constraint c
       WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
    `);

    for (const fk of r.rows) {
      // Referência para `organizacoes` é a âncora do tenant: ela não precisa
      // (nem pode) incluir organizacao_id duas vezes.
      if (fk.alvo === "organizacoes") continue;
      expect(
        fk.colunas.split(",").includes("organizacao_id"),
        `${fk.tabela} -> ${fk.alvo} (${fk.nome}) não inclui organizacao_id: ` +
        "essa referência alcança linha de outro município",
      ).toBe(true);
    }
  });

});

describe("Funções privilegiadas", () => {
  /**
   * Login e recuperação de senha acontecem antes de existir contexto de
   * tenant, então precisam de funções `SECURITY DEFINER`, que rodam com os
   * privilégios do dono das tabelas. Cada uma delas é uma porta aberta na
   * parede do RLS, e duas coisas as mantêm portas em vez de buracos.
   */
  async function definidoras(): Promise<Array<{ nome: string; config: string[] | null; acl: string | null }>> {
    const r = await db.query<{ nome: string; config: string[] | null; acl: string | null }>(`
      SELECT p.proname AS nome,
             p.proconfig AS config,
             array_to_string(p.proacl, ',') AS acl
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prosecdef
       ORDER BY p.proname
    `);
    return r.rows;
  }

  it("existem, e são poucas o bastante para caberem numa revisão", async () => {
    const lista = await definidoras();
    expect(lista.length).toBeGreaterThan(0);
    // Se este número disparar, alguém está resolvendo com privilégio o que
    // deveria resolver com contexto de tenant.
    expect(lista.length, `funções SECURITY DEFINER demais: ${lista.map((f) => f.nome).join(", ")}`)
      .toBeLessThanOrEqual(12);
  });

  it("toda função privilegiada fixa o search_path", async () => {
    /*
      Sem `SET search_path`, quem controla o search_path da sessão pode criar
      uma tabela ou função com o mesmo nome de uma que a função usa por
      dentro, e ela será chamada com os privilégios do dono. É a escalada de
      privilégio clássica de `SECURITY DEFINER`, e ela não precisa de bug
      nenhum no SQL da função para funcionar.
    */
    for (const f of await definidoras()) {
      const fixa = (f.config ?? []).some((c) => c.startsWith("search_path="));
      expect(fixa, `${f.nome} é SECURITY DEFINER sem SET search_path`).toBe(true);
    }
  });

  it("nenhuma função privilegiada é executável por PUBLIC", async () => {
    for (const f of await definidoras()) {
      // ACL nula significa privilégio padrão, e o padrão do Postgres é
      // EXECUTE para PUBLIC: qualquer papel conectado chamaria a função.
      expect(f.acl, `${f.nome} está com o privilégio padrão, que inclui PUBLIC`).not.toBeNull();
      expect(
        /=X\//.test(f.acl!) && f.acl!.split(",").some((entrada) => entrada.startsWith("=X/")),
        `${f.nome} concede EXECUTE a PUBLIC: ${f.acl}`,
      ).toBe(false);
    }
  });

  it("o papel de aplicação não é superusuário nem dono das tabelas", async () => {
    // Se fosse, o RLS seria ignorado e tudo acima viraria enfeite.
    const papel = await db.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'dc360_app'",
    );
    expect(papel.rows[0]!.rolsuper).toBe(false);
    expect(papel.rows[0]!.rolbypassrls).toBe(false);

    const donas = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_tables
        WHERE schemaname = 'public' AND tableowner = 'dc360_app'`,
    );
    expect(donas.rows[0]!.n).toBe("0");
  });
});

describe("Trilha auditável é append-only", () => {
  it("aceita inserção mas recusa alteração e exclusão", async () => {
    const orgId = orgA;
    const oc = await db.query<{ id: string }>(
      "SELECT id FROM ocorrencias WHERE organizacao_id = $1",
      [orgId],
    );
    const ocId = oc.rows[0]!.id;

    await comoApp(orgId, (tx) =>
      tx.query(
        `INSERT INTO trilha_eventos
           (organizacao_id, ocorrencia_id, tipo, autor_nome, autor_papel, origem, ocorrido_em)
         VALUES ($1,$2,'registro','Jonas Ferreira','operador','escritorio', now())`,
        [orgId, ocId],
      ),
    );

    const lido = await comoApp(orgId, (tx) =>
      tx.query<{ id: string }>("SELECT id FROM trilha_eventos"),
    );
    expect(lido.rows).toHaveLength(1);

    // Sem policy de UPDATE nem DELETE, com RLS forçada, as duas são negadas.
    await expect(
      comoApp(orgId, (tx) => tx.query("UPDATE trilha_eventos SET tipo = 'adulterado'")),
    ).rejects.toThrow();

    await expect(
      comoApp(orgId, (tx) => tx.query("DELETE FROM trilha_eventos")),
    ).rejects.toThrow();
  });
});

describe("Regras de negócio garantidas pelo banco", () => {
  it("recusa encerrar sem motivo", async () => {
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          "UPDATE ocorrencias SET status = 'encerrada', encerrado_em = now() WHERE organizacao_id = $1",
          [orgA],
        ),
      ),
    ).rejects.toThrow(/encerramento_exige_motivo/i);
  });

  it("protocolo pode repetir entre municípios, mas não dentro do mesmo", async () => {
    // Já existe 000001/2026 nas duas organizações, provando o primeiro caso.
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO ocorrencias
             (organizacao_id, protocolo, tipo, status, endereco, solicitante_nome, canal_entrada, descricao)
           VALUES ($1,'000001/2026','granizo','registrada','Outra rua','Teste','telefone','x')`,
          [orgA],
        ),
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it("gera protocolo sequencial por organização e ano, sem colidir entre municípios", async () => {
    const p1 = await comoApp(orgA, (tx) =>
      tx.query<{ proximo_protocolo: string }>("SELECT proximo_protocolo(2027)"),
    );
    const p2 = await comoApp(orgA, (tx) =>
      tx.query<{ proximo_protocolo: string }>("SELECT proximo_protocolo(2027)"),
    );
    const pB = await comoApp(orgB, (tx) =>
      tx.query<{ proximo_protocolo: string }>("SELECT proximo_protocolo(2027)"),
    );

    expect(p1.rows[0]!.proximo_protocolo).toBe("000001/2027");
    expect(p2.rows[0]!.proximo_protocolo).toBe("000002/2027");
    // O município B recomeça do 1: a sequência é por tenant.
    expect(pB.rows[0]!.proximo_protocolo).toBe("000001/2027");
  });

  it("recusa evidência cuja chave de storage não tem o prefixo do tenant", async () => {
    const oc = await db.query<{ id: string }>(
      "SELECT id FROM ocorrencias WHERE organizacao_id = $1 LIMIT 1",
      [orgA],
    );
    const v = await comoApp(orgA, (tx) =>
      tx.query<{ id: string }>(
        `INSERT INTO vistorias
           (organizacao_id, ocorrencia_id, checklist, assinante_nome, coletada_em, idempotency_key)
         VALUES ($1,$2,'[]'::jsonb,'Alguem', now(), gen_random_uuid()) RETURNING id`,
        [orgA, oc.rows[0]!.id],
      ),
    );

    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO evidencias
             (organizacao_id, ocorrencia_id, vistoria_id, chave_storage, capturada_em)
           VALUES ($1,$2,$3,'tenant/outro-municipio/foto.jpg', now())`,
          [orgA, oc.rows[0]!.id, v.rows[0]!.id],
        ),
      ),
    ).rejects.toThrow(/chave_com_prefixo_do_tenant/i);
  });

  it("recusa a mesma coleta enviada duas vezes com a mesma chave de idempotência", async () => {
    const oc = await db.query<{ id: string }>(
      "SELECT id FROM ocorrencias WHERE organizacao_id = $1 LIMIT 1",
      [orgA],
    );
    const chave = "11111111-1111-4111-8111-111111111111";

    await comoApp(orgA, (tx) =>
      tx.query(
        `INSERT INTO vistorias
           (organizacao_id, ocorrencia_id, checklist, assinante_nome, coletada_em, idempotency_key)
         VALUES ($1,$2,'[]'::jsonb,'Alguem', now(), $3)`,
        [orgA, oc.rows[0]!.id, chave],
      ),
    );

    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO vistorias
             (organizacao_id, ocorrencia_id, checklist, assinante_nome, coletada_em, idempotency_key)
           VALUES ($1,$2,'[]'::jsonb,'Alguem', now(), $3)`,
          [orgA, oc.rows[0]!.id, chave],
        ),
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });
});

describe("Isolamento sob concorrência na mesma conexão", () => {
  /**
   * O contexto de tenant vive na CONEXÃO, não na chamada: `SET LOCAL` vale
   * para a transação corrente daquela conexão. Duas transações entrelaçadas na
   * mesma conexão fazem o segundo `set_config` sobrescrever o primeiro, e a
   * consulta do primeiro município passa a rodar com o contexto do segundo.
   *
   * Este teste dispara exatamente esse entrelaçamento. Ele falha se alguém
   * remover a serialização.
   */
  it("duas leituras concorrentes de municípios diferentes não trocam de contexto", async () => {
    const rodadas = 12;
    const pares = Array.from({ length: rodadas }, (_, i) => i);

    // Os dois municípios têm protocolo 000001/2026, então o número não
    // distingue. O endereço distingue: cada semente tem o seu.
    const SO_DE_A = "Rua das Acácias, 245";
    const SO_DE_B = "Avenida Central, 900";

    const resultados = await Promise.all(
      pares.flatMap((i) => [
        comoApp(orgA, (tx) =>
          tx.query<{ endereco: string }>("SELECT endereco FROM ocorrencias"),
        ).then((r) => ({ esperado: "A", i, enderecos: r.rows.map((x) => x.endereco) })),
        comoApp(orgB, (tx) =>
          tx.query<{ endereco: string }>("SELECT endereco FROM ocorrencias"),
        ).then((r) => ({ esperado: "B", i, enderecos: r.rows.map((x) => x.endereco) })),
      ]),
    );

    for (const r of resultados) {
      const alheio = r.esperado === "A" ? SO_DE_B : SO_DE_A;
      const proprio = r.esperado === "A" ? SO_DE_A : SO_DE_B;

      expect(
        r.enderecos,
        `rodada ${r.i}: o município ${r.esperado} enxergou endereço do outro`,
      ).not.toContain(alheio);

      expect(
        r.enderecos,
        `rodada ${r.i}: o município ${r.esperado} não enxergou o próprio endereço`,
      ).toContain(proprio);
    }
  });

  it("escrita concorrente de um município não escapa para o outro", async () => {
    await Promise.all([
      comoApp(orgA, (tx) =>
        tx.query("UPDATE ocorrencias SET descricao = 'tocado por A'"),
      ),
      comoApp(orgB, (tx) =>
        tx.query("UPDATE ocorrencias SET descricao = 'tocado por B'"),
      ),
    ]);

    // Conferência fora do papel de aplicação, para enxergar as duas de uma vez.
    const todas = await db.query<{ municipio: string; descricao: string }>(
      `SELECT o.municipio, oc.descricao
         FROM ocorrencias oc JOIN organizacoes o ON o.id = oc.organizacao_id`,
    );
    for (const linha of todas.rows) {
      const esperado = linha.municipio === "Serra Alta" ? "tocado por A" : "tocado por B";
      expect(linha.descricao, `${linha.municipio} recebeu escrita do outro município`).toBe(esperado);
    }
  });
});

describe("Chave estrangeira nao atravessa municipio", () => {
  /**
   * Row Level Security governa SELECT, INSERT, UPDATE e DELETE. Ela NAO
   * governa a verificacao de chave estrangeira: o Postgres checa a existencia
   * da linha referenciada com privilegio de sistema, por baixo da policy.
   *
   * Antes da migracao 008, isso permitia gravar dado apontando para linha de
   * outro municipio, e ainda funcionava como oraculo de existencia: o insert
   * passava se o identificador existia la e falhava se nao existia. E o mesmo
   * vazamento que a resposta 404 no lugar de 403 existe para impedir na API,
   * so que pela porta dos fundos.
   *
   * A defesa e chave estrangeira COMPOSTA com organizacao_id nos dois lados.
   */
  let equipeDeB: string;
  let usuarioDeB: string;

  beforeAll(async () => {
    const e = await db.query<{ id: string }>(
      "INSERT INTO equipes (organizacao_id, nome) VALUES ($1, 'Equipe do vizinho') RETURNING id",
      [orgB],
    );
    equipeDeB = e.rows[0]!.id;

    const u = await db.query<{ id: string }>(
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel)
       VALUES ($1, 'Servidor do vizinho', 'VZ-1', 'vizinho@exemplo.gov.br', 'operador')
       RETURNING id`,
      [orgB],
    );
    usuarioDeB = u.rows[0]!.id;
  });

  it("nao vincula ocorrencia a chamado de outro municipio", async () => {
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO ocorrencias
             (organizacao_id, protocolo, tipo, status, endereco, solicitante_nome,
              canal_entrada, descricao, vinculada_a)
           VALUES ($1,'000801/2026','granizo','registrada','Rua A','F','telefone','x',$2)`,
          [orgA, ocorrenciaDeB],
        ),
      ),
    ).rejects.toThrow();
  });

  it("nao despacha para equipe de outro municipio", async () => {
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO ocorrencias
             (organizacao_id, protocolo, tipo, status, endereco, solicitante_nome,
              canal_entrada, descricao, equipe_id)
           VALUES ($1,'000802/2026','granizo','registrada','Rua A','F','telefone','x',$2)`,
          [orgA, equipeDeB],
        ),
      ),
    ).rejects.toThrow();
  });

  it("nao coloca servidor em equipe de outro municipio", async () => {
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, equipe_id)
           VALUES ($1,'Novo','SA-801','novo801@exemplo.gov.br','agente_campo',$2)`,
          [orgA, equipeDeB],
        ),
      ),
    ).rejects.toThrow();
  });

  it("nao grava vistoria apontando para ocorrencia de outro municipio", async () => {
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO vistorias
             (organizacao_id, ocorrencia_id, checklist, assinante_nome, coletada_em, idempotency_key)
           VALUES ($1,$2,'[]'::jsonb,'x', now(), gen_random_uuid())`,
          [orgA, ocorrenciaDeB],
        ),
      ),
    ).rejects.toThrow();
  });

  it("nao assina evento da trilha com servidor de outro municipio", async () => {
    // O pior dos casos: a trilha e a prova de quem fez o que, e apontar para
    // a pessoa errada a transforma no oposto do que ela existe para ser.
    const propria = await db.query<{ id: string }>(
      "SELECT id FROM ocorrencias WHERE organizacao_id = $1 LIMIT 1",
      [orgA],
    );

    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO trilha_eventos
             (organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel,
              origem, ocorrido_em)
           VALUES ($1,$2,'registro',$3,'x','operador','escritorio', now())`,
          [orgA, propria.rows[0]!.id, usuarioDeB],
        ),
      ),
    ).rejects.toThrow();
  });

  it("o vinculo dentro do proprio municipio continua funcionando", async () => {
    // A correcao nao pode ter fechado o caminho legitimo junto.
    const propria = await db.query<{ id: string }>(
      "SELECT id FROM ocorrencias WHERE organizacao_id = $1 LIMIT 1",
      [orgA],
    );

    const criada = await comoApp(orgA, (tx) =>
      tx.query<{ id: string }>(
        `INSERT INTO ocorrencias
           (organizacao_id, protocolo, tipo, status, endereco, solicitante_nome,
            canal_entrada, descricao, vinculada_a)
         VALUES ($1,'000803/2026','granizo','registrada','Rua A','F','telefone','x',$2)
         RETURNING id`,
        [orgA, propria.rows[0]!.id],
      ),
    );
    expect(criada.rows[0]!.id).toBeTruthy();
  });
});
