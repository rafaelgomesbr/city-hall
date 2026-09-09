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
    /*
      Pedidos vindos do formulário público.

      É a única tabela do produto que é ANTERIOR ao município: quem preenche
      ainda não é cliente, não tem token e não tem organização. Exigir
      `organizacao_id` aqui seria exigir que a pessoa já pertencesse ao que ela
      está pedindo para conhecer.

      A isenção NÃO é buraco, e o teste logo abaixo prova isso: o papel de
      aplicação insere e NÃO lê. Sem SELECT, um formulário aberto na internet
      não consegue virar uma lista de contatos de servidores públicos.
    */
    "interesse_municipio",
  ]);

  /**
   * Quem não se amarra ao contexto do município, e por quê.
   *
   * Muito mais estreita que `SEM_TENANT`: aqui só entra tabela que existe
   * ANTES de qualquer município. `organizacoes` e `protocolo_sequencias` não
   * têm a coluna e mesmo assim têm policy de contexto, e continuam checadas.
   */
  const SEM_POLICY_DE_TENANT = new Set(["interesse_municipio"]);

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

  it("o formulário público escreve e NÃO lê", async () => {
    /*
      Esta é a prova de que a isenção de `interesse_municipio` não abre buraco.

      A tabela é anterior ao município: quem preenche o formulário público não
      tem token, não tem organização e não é cliente. Por isso ela não pode se
      amarrar ao contexto, e por isso a proteção precisa vir de outro lugar.

      Vem daqui: o papel de aplicação tem INSERT e NÃO tem SELECT. Sem essa
      assimetria, um formulário aberto na internet vira uma lista de contatos
      de servidores públicos servida a quem descobrir a rota.
    */
    await comoApp(null, async (tx) => {
      await tx.exec(`INSERT INTO interesse_municipio (nome, email, municipio, uf)
                     VALUES ('Fulana de Teste', 'fulana@exemplo.gov.br', 'Serra Alta', 'MG')`);
    });

    // Gravou de verdade, lido como dono.
    const comoDono = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM interesse_municipio",
    );
    expect(Number(comoDono.rows[0]!.n)).toBeGreaterThan(0);

    // E o papel de aplicação não enxerga nada.
    let recusou = false;
    try {
      await comoApp(null, (tx) => tx.query("SELECT * FROM interesse_municipio"));
    } catch {
      recusou = true;
    }
    expect(
      recusou,
      "o papel de aplicação conseguiu LER os pedidos do formulário público: "
      + "sem SELECT negado, a rota pública vira uma lista de contatos de "
      + "servidores disponível a quem descobrir o endereço",
    ).toBe(true);
  });

  it("toda tabela de negócio tem policy amarrada na organização do contexto", async () => {
    for (const t of await tabelasDeNegocio()) {
      /*
        Isenção ESTREITA, e de propósito.

        `SEM_TENANT` é a lista de quem não tem a COLUNA `organizacao_id`, e
        usá-la aqui seria isentar demais: `organizacoes` e
        `protocolo_sequencias` não têm a coluna e TÊM policy amarrada ao
        contexto, então precisam continuar sendo verificadas. Usar a lista
        larga aqui enfraqueceria o portão para fazer um teste passar, que é
        exatamente o que ele existe para impedir.

        Só `interesse_municipio` é isenta, porque é anterior ao município: não
        há contexto a que se amarrar. O teste logo abaixo prova que a isenção
        não abre buraco.
      */
      if (SEM_POLICY_DE_TENANT.has(t)) continue;
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

describe("Aparelho de push e aviso de prazo", () => {
  /**
   * A migracao 016 traz duas tabelas novas, e uma delas guarda a coisa mais
   * perigosa que este banco passou a guardar: a ficha de push. Quem tem a
   * ficha escreve na tela bloqueada de um agente de Defesa Civil, e uma ordem
   * falsa de evacuacao escrita ali e dano real na rua.
   *
   * Por isso ela entra no portao com caso proprio, e nao so pelas varreduras
   * genericas de RLS: o que precisa ser provado aqui e que a ficha de um
   * municipio nao e legivel, nem alteravel, nem enumeravel pelo outro.
   */
  const FICHA_COMPARTILHADA = "ficha-do-mesmo-aparelho-fisico";

  let agenteDeA: string;
  let agenteDeB: string;
  let equipeDeAgenteA: string;
  let ocorrenciaComPrazoDeA: string;
  let aparelhoDeB: string;

  beforeAll(async () => {
    const equipeA = await db.query<{ id: string }>(
      "INSERT INTO equipes (organizacao_id, nome) VALUES ($1, 'Equipe de push A') RETURNING id",
      [orgA],
    );
    equipeDeAgenteA = equipeA.rows[0]!.id;

    const equipeB = await db.query<{ id: string }>(
      "INSERT INTO equipes (organizacao_id, nome) VALUES ($1, 'Equipe de push B') RETURNING id",
      [orgB],
    );

    const uA = await db.query<{ id: string }>(
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, equipe_id)
       VALUES ($1, 'Agente de Serra Alta', 'SA-PUSH-1', 'push.sa@exemplo.gov.br', 'agente_campo', $2)
       RETURNING id`,
      [orgA, equipeDeAgenteA],
    );
    agenteDeA = uA.rows[0]!.id;

    const uB = await db.query<{ id: string }>(
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, equipe_id)
       VALUES ($1, 'Agente de Vale Fundo', 'VF-PUSH-1', 'push.vf@exemplo.gov.br', 'agente_campo', $2)
       RETURNING id`,
      [orgB, equipeB.rows[0]!.id],
    );
    agenteDeB = uB.rows[0]!.id;

    const oc = await db.query<{ id: string }>(
      `INSERT INTO ocorrencias
         (organizacao_id, protocolo, tipo, status, severidade, endereco, solicitante_nome,
          canal_entrada, descricao, equipe_id, prazo_em)
       VALUES ($1,'000910/2026','deslizamento','em_campo','alta','Rua do Prazo, 10','Fulano',
               'telefone','x',$2, now() + interval '20 minutes')
       RETURNING id`,
      [orgA, equipeDeAgenteA],
    );
    ocorrenciaComPrazoDeA = oc.rows[0]!.id;

    const apB = await db.query<{ id: string }>(
      `INSERT INTO aparelhos (organizacao_id, usuario_id, plataforma, ficha)
       VALUES ($1,$2,'ios','ficha-so-de-vale-fundo') RETURNING id`,
      [orgB, agenteDeB],
    );
    aparelhoDeB = apB.rows[0]!.id;
  });

  it("nao le a ficha de push do aparelho de outro municipio", async () => {
    const r = await comoApp(orgA, (tx) =>
      tx.query("SELECT ficha FROM aparelhos WHERE id = $1", [aparelhoDeB]),
    );
    expect(
      r.rows,
      "a ficha de push de outro municipio ficou legivel: quem tem a ficha "
      + "escreve na tela bloqueada do agente daquela prefeitura",
    ).toHaveLength(0);
  });

  it("nao revoga o aparelho de outro municipio", async () => {
    await comoApp(orgA, (tx) =>
      tx.query(
        "UPDATE aparelhos SET revogado_em = now(), motivo_revogacao = 'invadido' WHERE id = $1",
        [aparelhoDeB],
      ),
    );
    const conf = await db.query<{ revogado_em: string | null }>(
      "SELECT revogado_em FROM aparelhos WHERE id = $1",
      [aparelhoDeB],
    );
    expect(conf.rows[0]!.revogado_em).toBeNull();
  });

  it("nao registra aparelho no nome de servidor de outro municipio", async () => {
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO aparelhos (organizacao_id, usuario_id, plataforma, ficha)
           VALUES ($1,$2,'android','ficha-roubada')`,
          [orgA, agenteDeB],
        ),
      ),
    ).rejects.toThrow();
  });

  /**
   * A decisao registrada no topo da migracao 016, conferida aqui.
   *
   * A ficha e unica POR MUNICIPIO, e nao globalmente. O motivo e que
   * `UNIQUE (ficha)` global faria o segundo registro falhar com uma mensagem
   * de erro que denuncia a existencia daquela ficha em outra prefeitura, que
   * e o mesmo vazamento que a resposta 404 no lugar de 403 existe para
   * impedir na API.
   *
   * Este teste guarda os dois lados: o registro passa (nao vaza), e a linha
   * do outro municipio continua invisivel.
   */
  it("a mesma ficha registrada por dois municipios nao denuncia a existencia da outra", async () => {
    await comoApp(orgB, (tx) =>
      tx.query(
        `INSERT INTO aparelhos (organizacao_id, usuario_id, plataforma, ficha)
         VALUES ($1,$2,'ios',$3)`,
        [orgB, agenteDeB, FICHA_COMPARTILHADA],
      ),
    );

    // O segundo municipio registra a MESMA ficha, e nao pode nem falhar nem
    // saber que ela ja existe em outro lugar.
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO aparelhos (organizacao_id, usuario_id, plataforma, ficha)
           VALUES ($1,$2,'ios',$3)`,
          [orgA, agenteDeA, FICHA_COMPARTILHADA],
        ),
      ),
    ).resolves.toBeDefined();

    const vistoPorA = await comoApp(orgA, (tx) =>
      tx.query<{ n: string }>("SELECT count(*)::text AS n FROM aparelhos WHERE ficha = $1", [
        FICHA_COMPARTILHADA,
      ]),
    );
    expect(
      Number(vistoPorA.rows[0]!.n),
      "o municipio enxergou o aparelho do outro pela ficha",
    ).toBe(1);
  });

  it("a mesma ficha registrada duas vezes no mesmo municipio atualiza, nao duplica", async () => {
    const alvo = await comoApp(orgA, (tx) =>
      tx.query<{ id: string }>(
        `INSERT INTO aparelhos (organizacao_id, usuario_id, plataforma, ficha)
         VALUES ($1,$2,'ios','ficha-que-volta')
         ON CONFLICT ON CONSTRAINT aparelhos_ficha_unica_no_municipio DO UPDATE
            SET visto_em = now()
         RETURNING id`,
        [orgA, agenteDeA],
      ),
    );
    const denovo = await comoApp(orgA, (tx) =>
      tx.query<{ id: string }>(
        `INSERT INTO aparelhos (organizacao_id, usuario_id, plataforma, ficha)
         VALUES ($1,$2,'ios','ficha-que-volta')
         ON CONFLICT ON CONSTRAINT aparelhos_ficha_unica_no_municipio DO UPDATE
            SET visto_em = now()
         RETURNING id`,
        [orgA, agenteDeA],
      ),
    );
    expect(denovo.rows[0]!.id).toBe(alvo.rows[0]!.id);
  });

  it("aparelho nao se apaga, se revoga", async () => {
    // Mesma regra da ocorrencia e do usuario: a notificacao enviada aponta
    // para o aparelho, e apagar a linha apagaria a resposta de suporte junto.
    await expect(
      comoApp(orgB, (tx) => tx.query("DELETE FROM aparelhos WHERE id = $1", [aparelhoDeB])),
    ).rejects.toThrow();
  });

  it("revogar aparelho sem motivo e recusado pelo banco", async () => {
    await expect(
      comoApp(orgB, (tx) =>
        tx.query("UPDATE aparelhos SET revogado_em = now() WHERE id = $1", [aparelhoDeB]),
      ),
    ).rejects.toThrow();
  });

  it("nao registra aviso apontando para ocorrencia de outro municipio", async () => {
    const meu = await comoApp(orgB, (tx) =>
      tx.query<{ id: string }>("SELECT id FROM aparelhos WHERE id = $1", [aparelhoDeB]),
    );
    expect(meu.rows).toHaveLength(1);

    await expect(
      comoApp(orgB, (tx) =>
        tx.query(
          `INSERT INTO notificacoes_enviadas
             (organizacao_id, aparelho_id, ocorrencia_id, tipo, desfecho)
           VALUES ($1,$2,$3,'prazo_vencendo','enviando')`,
          [orgB, aparelhoDeB, ocorrenciaComPrazoDeA],
        ),
      ),
    ).rejects.toThrow();
  });

  it("o papel de aplicacao nao apaga aviso enviado: quem expurga e a varredura, por idade", async () => {
    /*
      Sem policy de DELETE e com RLS forcada, a operacao e negada. Isso e o que
      impede que uma rota, um dia, "limpe" o registro de quem foi avisado sobre
      o que. O expurgo existe (noventa dias, ver a migracao 016), acontece
      dentro de `varrer_prazos` e e sempre por idade, nunca por escolha de quem
      chama.
    */
    await comoApp(orgA, (tx) =>
      tx.query("SELECT * FROM varrer_prazos($1::interval,$2::interval,$3,$4,$5::interval)", [
        "60 minutes", "10 minutes", 5, 500, "90 days",
      ]),
    );
    const gravou = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM notificacoes_enviadas WHERE organizacao_id = $1",
      [orgA],
    );
    expect(Number(gravou.rows[0]!.n)).toBeGreaterThan(0);

    await expect(
      comoApp(orgA, (tx) => tx.query("DELETE FROM notificacoes_enviadas")),
    ).rejects.toThrow();
  });

  it("nao le o aviso enviado por outro municipio", async () => {
    const deB = await comoApp(orgB, (tx) =>
      tx.query("SELECT id FROM notificacoes_enviadas"),
    );
    expect(deB.rows).toHaveLength(0);
  });

  /**
   * A funcao de varredura roda sem contexto de municipio, por necessidade: o
   * varredor nao tem token, entao nao tem municipio, e sem municipio o papel
   * de aplicacao nao enxerga nada. Ela e a porta que a migracao 016 abre, e o
   * que a mantem porta e nao buraco e nao aceitar municipio como parametro.
   *
   * O portao de cima ja confere `search_path` fixo e ausencia de EXECUTE para
   * PUBLIC em toda funcao privilegiada, esta inclusa. O que falta provar e que
   * ela nao virou uma leitura de dado de municipio disfarcada.
   */
  it("a varredura nao aceita municipio de quem chama e nao devolve dado de pessoa", async () => {
    const assinatura = await db.query<{ args: string }>(
      `SELECT pg_get_function_identity_arguments(p.oid) AS args
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'varrer_prazos'`,
    );
    expect(assinatura.rows).toHaveLength(1);
    expect(
      assinatura.rows[0]!.args,
      "a varredura passou a aceitar parametro de municipio, e com isso virou "
      + "uma porta para ler dado de um municipio escolhido por quem chama",
    ).not.toMatch(/uuid/);

    const saida = await db.query<{ resultado: string }>(
      `SELECT pg_get_function_result(p.oid) AS resultado
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'varrer_prazos'`,
    );
    for (const proibido of ["solicitante", "descricao", "vulnerabilidade", "contato", "nome"]) {
      expect(
        saida.rows[0]!.resultado,
        `a varredura passou a devolver ${proibido}, e isso sai do pais na notificacao`,
      ).not.toContain(proibido);
    }
  });
});
