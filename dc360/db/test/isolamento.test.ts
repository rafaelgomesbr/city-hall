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
    /*
      Se este número disparar, alguém está resolvendo com privilégio o que
      deveria resolver com contexto de tenant.

      Subiu de 12 para 13 em 09/09/2026, por `abrir_oficio` (migração 017), e a
      razão é a mesma que já justifica `credenciais_para_login` e
      `consumir_recuperacao`: quem clica no link de uso único do ofício é uma
      pessoa do órgão destinatário, sem conta, sem token e sem município. Não
      existe contexto de tenant a definir antes de descobrir de qual município
      é o link, e o único caminho até essa organização é o hash do próprio
      link. Levantar o teto por isso é diferente de levantá-lo para não
      escrever o `SET LOCAL`, e é essa diferença que este caso guarda.
    */
    expect(lista.length, `funções SECURITY DEFINER demais: ${lista.map((f) => f.nome).join(", ")}`)
      .toBeLessThanOrEqual(13);
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


describe("Sino de avisos", () => {
  /**
   * A migracao 018 traz duas tabelas, e a segunda delas tem uma armadilha de
   * isolamento que o RLS NAO pega sozinho.
   *
   * `avisos_lidos` aponta para `usuarios`. Integridade referencial roda por
   * dentro, com os privilegios do dono das tabelas, e nao enxerga policy
   * nenhuma. Com uma chave estrangeira simples para `usuarios(id)`, o banco
   * aceitaria gravar "o servidor tal, de Vale Fundo, leu o aviso tal, de Serra
   * Alta": a linha ficaria carimbada com a organizacao de Serra Alta, o RLS
   * acharia tudo em ordem, e nenhuma consulta do produto teria como acusar.
   * Por isso a chave e composta, e por isso ela tem caso proprio aqui.
   */
  let coordenadorDeA: string;
  let coordenadorDeB: string;
  let avisoDeA: string;
  let avisoDeB: string;
  let ocorrenciaDeA: string;

  beforeAll(async () => {
    const uA = await db.query<{ id: string }>(
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel)
       VALUES ($1,'Coordenadora de Serra Alta','SA-SINO-1','sino.sa@exemplo.gov.br','coordenador')
       RETURNING id`,
      [orgA],
    );
    coordenadorDeA = uA.rows[0]!.id;

    const uB = await db.query<{ id: string }>(
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel)
       VALUES ($1,'Coordenador de Vale Fundo','VF-SINO-1','sino.vf@exemplo.gov.br','coordenador')
       RETURNING id`,
      [orgB],
    );
    coordenadorDeB = uB.rows[0]!.id;

    const oc = await db.query<{ id: string }>(
      `INSERT INTO ocorrencias
         (organizacao_id, protocolo, tipo, status, endereco, solicitante_nome,
          canal_entrada, descricao)
       VALUES ($1,'000920/2026','inundacao','em_campo','Rua do Sino, 10','Fulano',
               'telefone','x')
       RETURNING id`,
      [orgA],
    );
    ocorrenciaDeA = oc.rows[0]!.id;

    const aA = await db.query<{ id: string }>(
      `INSERT INTO avisos (organizacao_id, tipo, ocorrencia_id, chave_do_fato)
       VALUES ($1,'vistoria_recebida',$2,'vistoria:sino-a') RETURNING id`,
      [orgA, ocorrenciaDeA],
    );
    avisoDeA = aA.rows[0]!.id;

    const aB = await db.query<{ id: string }>(
      `INSERT INTO avisos (organizacao_id, tipo, ocorrencia_id, chave_do_fato)
       VALUES ($1,'vistoria_recebida',$2,'vistoria:sino-b') RETURNING id`,
      [orgB, ocorrenciaDeB],
    );
    avisoDeB = aB.rows[0]!.id;
  });

  it("nao le o aviso de outro municipio", async () => {
    const r = await comoApp(orgA, (tx) =>
      tx.query("SELECT id FROM avisos WHERE id = $1", [avisoDeB]),
    );
    expect(
      r.rows,
      "o sino de um municipio mostrou o acontecimento de outro, com o protocolo "
      + "vindo por juncao junto",
    ).toHaveLength(0);
  });

  it("nao cria aviso carimbado com o id de outro municipio", async () => {
    let recusou = false;
    try {
      await comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO avisos (organizacao_id, tipo, ocorrencia_id, chave_do_fato)
           VALUES ($1,'vistoria_recebida',$2,'vistoria:invasao')`,
          [orgB, ocorrenciaDeB],
        ),
      );
    } catch {
      recusou = true;
    }
    expect(recusou, "escreveu no sino de outra prefeitura").toBe(true);
  });

  it("nao cria aviso apontando para ocorrencia de outro municipio", async () => {
    /*
      O caso que a chave estrangeira COMPOSTA existe para fechar. Com uma
      referencia simples a `ocorrencias(id)`, o INSERT passaria: o RLS
      aprovaria a linha (a organizacao e a do contexto) e a verificacao da
      chave, que roda por baixo do RLS, encontraria a ocorrencia da outra
      prefeitura. A juncao da rota do sino traria o protocolo de la.
    */
    let recusou = false;
    try {
      await comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO avisos (organizacao_id, tipo, ocorrencia_id, chave_do_fato)
           VALUES ($1,'vistoria_recebida',$2,'vistoria:atravessa')`,
          [orgA, ocorrenciaDeB],
        ),
      );
    } catch {
      recusou = true;
    }
    expect(
      recusou,
      "criou aviso apontando para ocorrencia de outro municipio: o sino passaria "
      + "a exibir o protocolo da prefeitura vizinha",
    ).toBe(true);
  });

  it("nao registra leitura no nome de servidor de outro municipio", async () => {
    /*
      A armadilha descrita no topo deste bloco, e a razao de a chave para
      `usuarios` ser (organizacao_id, id) e nao (id).
    */
    let recusou = false;
    try {
      await comoApp(orgA, (tx) =>
        tx.query(
          "INSERT INTO avisos_lidos (organizacao_id, usuario_id, aviso_id) VALUES ($1,$2,$3)",
          [orgA, coordenadorDeB, avisoDeA],
        ),
      );
    } catch {
      recusou = true;
    }
    expect(
      recusou,
      "gravou que um servidor de outro municipio leu um aviso deste: a linha fica "
      + "carimbada com a organizacao certa e o RLS nao tem como acusar",
    ).toBe(true);
  });

  it("nao registra leitura de aviso de outro municipio", async () => {
    let recusou = false;
    try {
      await comoApp(orgA, (tx) =>
        tx.query(
          "INSERT INTO avisos_lidos (organizacao_id, usuario_id, aviso_id) VALUES ($1,$2,$3)",
          [orgA, coordenadorDeA, avisoDeB],
        ),
      );
    } catch {
      recusou = true;
    }
    expect(recusou, "marcou como lido um aviso da prefeitura vizinha").toBe(true);
  });

  it("nao le quem leu o que no outro municipio", async () => {
    await db.query(
      "INSERT INTO avisos_lidos (organizacao_id, usuario_id, aviso_id) VALUES ($1,$2,$3)",
      [orgB, coordenadorDeB, avisoDeB],
    );
    const r = await comoApp(orgA, (tx) =>
      tx.query("SELECT usuario_id FROM avisos_lidos WHERE aviso_id = $1", [avisoDeB]),
    );
    expect(
      r.rows,
      "leu quem da outra prefeitura leu o que, que e rotina de trabalho de "
      + "servidor de outro municipio",
    ).toHaveLength(0);
  });

  it("nao apaga aviso de outro municipio, nem o velho", async () => {
    /*
      `avisos` tem policy de DELETE, ao contrario da trilha, porque o expurgo
      por idade precisa dela. Este caso garante que ela continua amarrada ao
      contexto: um DELETE por idade rodando no municipio A nao pode levar junto
      o historico do municipio B.
    */
    const velhoDeB = await db.query<{ id: string }>(
      `INSERT INTO avisos (organizacao_id, tipo, ocorrencia_id, chave_do_fato, criado_em)
       VALUES ($1,'vistoria_recebida',$2,'vistoria:velho-b', now() - interval '400 days')
       RETURNING id`,
      [orgB, ocorrenciaDeB],
    );

    await comoApp(orgA, (tx) =>
      tx.query("DELETE FROM avisos WHERE criado_em < now() - interval '60 days'"),
    );

    const conf = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM avisos WHERE id = $1",
      [velhoDeB.rows[0]!.id],
    );
    expect(conf.rows[0]!.n, "o expurgo de um municipio apagou o sino do vizinho").toBe("1");
  });

  it("a retencao e do banco: nem o proprio municipio apaga aviso que ainda vale", async () => {
    /*
      A idade esta DENTRO da policy de DELETE, e nao so na clausula da rota.

      A diferenca aparece no dia em que alguem escrever `DELETE FROM avisos`
      sem clausula, ou com uma clausula errada: com a idade so na rota, esse
      comando limparia o sino inteiro do municipio e ninguem descobriria, porque
      sino vazio e indistinguivel de sino sem novidade. Com a idade na policy, o
      banco recusa a parte que ainda vale e o resto do produto continua de pe.
    */
    await comoApp(orgA, (tx) => tx.query("DELETE FROM avisos"));

    const conf = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM avisos WHERE id = $1",
      [avisoDeA],
    );
    expect(
      conf.rows[0]!.n,
      "um DELETE sem clausula limpou o sino do municipio inteiro: a regra de "
      + "retencao so existia no codigo da rota",
    ).toBe("1");
  });

  it("o expurgo por idade leva junto quem leu, em vez de travar", async () => {
    /*
      Com ON DELETE RESTRICT, o primeiro aviso que alguem lesse travaria a
      limpeza inteira, e a tabela do sino voltaria a crescer para sempre, que e
      justamente o defeito que a retencao existe para evitar.
    */
    const velho = await db.query<{ id: string }>(
      `INSERT INTO avisos (organizacao_id, tipo, ocorrencia_id, chave_do_fato, criado_em)
       VALUES ($1,'vistoria_recebida',$2,'vistoria:velho-a', now() - interval '400 days')
       RETURNING id`,
      [orgA, ocorrenciaDeA],
    );
    const idVelho = velho.rows[0]!.id;
    await db.query(
      "INSERT INTO avisos_lidos (organizacao_id, usuario_id, aviso_id) VALUES ($1,$2,$3)",
      [orgA, coordenadorDeA, idVelho],
    );

    await comoApp(orgA, (tx) =>
      tx.query("DELETE FROM avisos WHERE criado_em < now() - interval '60 days'"),
    );

    const sobrou = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM avisos_lidos WHERE aviso_id = $1",
      [idVelho],
    );
    expect(sobrou.rows[0]!.n, "sobrou marca de leitura orfa de aviso ja expurgado").toBe("0");
  });

  it("o mesmo fato nao vira dois avisos", async () => {
    /*
      A rota do sino materializa prazo vencido a cada consulta, e a consulta
      roda a cada trinta segundos em toda aba aberta. Sem a unicidade por chave
      do fato, o mesmo prazo viraria uma linha nova a cada meio minuto, para
      sempre, e o sino ensinaria o coordenador a ignora-lo.
    */
    await comoApp(orgA, (tx) =>
      tx.query(
        `INSERT INTO avisos (organizacao_id, tipo, ocorrencia_id, chave_do_fato)
         VALUES ($1,'prazo_vencido',$2,'prazo:repetido:1')`,
        [orgA, ocorrenciaDeA],
      ),
    );
    let recusou = false;
    try {
      await comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO avisos (organizacao_id, tipo, ocorrencia_id, chave_do_fato)
           VALUES ($1,'prazo_vencido',$2,'prazo:repetido:1')`,
          [orgA, ocorrenciaDeA],
        ),
      );
    } catch {
      recusou = true;
    }
    expect(recusou, "o mesmo fato virou dois avisos").toBe(true);

    /*
      E a chave e por MUNICIPIO: dois municipios podem viver o mesmo fato, com
      a mesma chave, sem um denunciar a existencia do outro. Unicidade global
      aqui faria o INSERT do segundo falhar, e a mensagem de erro do Postgres
      contaria que aquela chave ja existe em algum lugar, que e o vazamento que
      a migracao 016 descreve por extenso.
    */
    await comoApp(orgB, (tx) =>
      tx.query(
        `INSERT INTO avisos (organizacao_id, tipo, ocorrencia_id, chave_do_fato)
         VALUES ($1,'prazo_vencido',$2,'prazo:repetido:1')`,
        [orgB, ocorrenciaDeB],
      ),
    );
  });

  it("aviso nao se edita, e leitura nao se desfaz", async () => {
    /*
      Sem UPDATE nao ha como antedatar `criado_em` para fugir do expurgo, nem
      trocar "prazo vencido" por outra coisa depois que alguem ja leu. E sem
      UPDATE nem DELETE em `avisos_lidos`, ninguem apaga o proprio rastro de
      ter sido avisado.
    */
    const naAvisos = await db.query<{ cmd: string }>(
      "SELECT cmd FROM pg_policies WHERE schemaname='public' AND tablename='avisos'",
    );
    expect(naAvisos.rows.map((l) => l.cmd)).not.toContain("UPDATE");
    expect(naAvisos.rows.map((l) => l.cmd)).not.toContain("ALL");

    const nosLidos = await db.query<{ cmd: string }>(
      "SELECT cmd FROM pg_policies WHERE schemaname='public' AND tablename='avisos_lidos' ORDER BY cmd",
    );
    expect(
      nosLidos.rows.map((l) => l.cmd),
      "avisos_lidos ganhou UPDATE ou DELETE: `lido_em` e a unica resposta para "
      + '"a coordenacao viu esse aviso, e a que horas?"',
    ).toEqual(["INSERT", "SELECT"]);
  });

  it("os gatilhos do sino nao sao privilegiados", async () => {
    /*
      Gatilho `SECURITY DEFINER` seria uma porta a mais na parede do RLS, e uma
      porta que nem precisa existir: os dois rodam dentro da transacao de quem
      escreveu a vistoria ou a resposta, que ja tem o municipio no contexto.
      Sem privilegio, a policy de insercao de `avisos` continua valendo para
      eles, e nenhum deles vira caminho para escrever aviso em municipio alheio.
    */
    const r = await db.query<{ nome: string; prosecdef: boolean }>(
      `SELECT p.proname AS nome, p.prosecdef
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('aviso_de_vistoria_recebida','aviso_de_providencia_respondida')`,
    );
    expect(r.rows, "os gatilhos do sino sumiram").toHaveLength(2);
    for (const f of r.rows) {
      expect(f.prosecdef, `${f.nome} virou SECURITY DEFINER sem precisar`).toBe(false);
    }
  });
});

describe("Catalogo de orgaos, oficio numerado e link de uso unico", () => {
  /**
   * A migracao 017 traz cinco tabelas, e cada uma responde por uma pergunta
   * diferente do portao:
   *
   *   `orgaos`            o destino da providencia deixou de ser texto livre;
   *   `oficio_sequencias` o numero do documento e por municipio e por ano;
   *   `oficios`           documento oficial emitido nao se corrige;
   *   `oficio_envios`     o email so vai para dominio do proprio catalogo;
   *   `oficio_aberturas`  o link abre UMA vez, e a garantia e do banco.
   *
   * As varreduras genericas la de cima ja cobram RLS forcada, policy amarrada
   * no contexto e chave estrangeira composta em todas elas. O que este bloco
   * prova e o que varredura nenhuma alcanca: a regra de negocio.
   */
  let orgaoDeA: string;
  let orgaoDeB: string;
  let providenciaDeA: string;
  let oficioDeA: string;
  let envioDeA: string;

  beforeAll(async () => {
    const a = await db.query<{ id: string }>(
      `INSERT INTO orgaos (organizacao_id, nome, sigla, email)
       VALUES ($1, 'Corpo de Bombeiros', 'CBM', 'sinistros@bombeiros-a.exemplo.gov.br')
       RETURNING id`,
      [orgA],
    );
    orgaoDeA = a.rows[0]!.id;

    const b = await db.query<{ id: string }>(
      `INSERT INTO orgaos (organizacao_id, nome, email)
       VALUES ($1, 'Secretaria de Obras', 'obras@valefundo.exemplo.gov.br')
       RETURNING id`,
      [orgB],
    );
    orgaoDeB = b.rows[0]!.id;

    const ocorrenciaDeA = await db.query<{ id: string }>(
      "SELECT id FROM ocorrencias WHERE organizacao_id = $1 LIMIT 1",
      [orgA],
    );

    const p = await db.query<{ id: string }>(
      `INSERT INTO providencias
         (organizacao_id, ocorrencia_id, orgao_id, orgao_destino, descricao, responsavel, prazo_em)
       VALUES ($1,$2,$3,'Corpo de Bombeiros','Vistoria conjunta','Chefe de plantao', now() + interval '3 days')
       RETURNING id`,
      [orgA, ocorrenciaDeA.rows[0]!.id, orgaoDeA],
    );
    providenciaDeA = p.rows[0]!.id;

    const o = await db.query<{ id: string }>(
      `INSERT INTO oficios
         (organizacao_id, ocorrencia_id, providencia_id, orgao_id, numero, ano, emitido_por_nome)
       VALUES ($1,$2,$3,$4,'000001/2026',2026,'Helena Coutinho')
       RETURNING id`,
      [orgA, ocorrenciaDeA.rows[0]!.id, providenciaDeA, orgaoDeA],
    );
    oficioDeA = o.rows[0]!.id;

    const e = await db.query<{ id: string }>(
      `INSERT INTO oficio_envios
         (organizacao_id, oficio_id, tentativa, destinatario_email, token_hash,
          expira_em, solicitado_por_nome)
       VALUES ($1,$2,1,'sinistros@bombeiros-a.exemplo.gov.br','hash-do-link-vivo',
               now() + interval '3 days','Helena Coutinho')
       RETURNING id`,
      [orgA, oficioDeA],
    );
    envioDeA = e.rows[0]!.id;
  });

  it("nao le o orgao de outro municipio nem pedindo pelo id exato", async () => {
    const r = await comoApp(orgA, (tx) =>
      tx.query("SELECT id FROM orgaos WHERE id = $1", [orgaoDeB]),
    );
    expect(r.rows).toHaveLength(0);
  });

  it("nao encaminha providencia para orgao de outro municipio", async () => {
    /*
      O caso que a chave composta existe para fechar. A verificacao de chave
      estrangeira roda por baixo do RLS, entao uma chave simples deixaria
      passar, e o relatorio de "para quem encaminhamos" de Serra Alta apontaria
      para um orgao de Vale Fundo.
    */
    const ocorrencia = await comoApp(orgA, (tx) =>
      tx.query<{ id: string }>("SELECT id FROM ocorrencias LIMIT 1"),
    );

    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO providencias
             (organizacao_id, ocorrencia_id, orgao_id, orgao_destino, descricao, responsavel, prazo_em)
           VALUES ($1,$2,$3,'Secretaria de Obras','x','y', now() + interval '1 day')`,
          [orgA, ocorrencia.rows[0]!.id, orgaoDeB],
        ),
      ),
    ).rejects.toThrow();

    const conferencia = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM providencias WHERE orgao_id = $1",
      [orgaoDeB],
    );
    expect(conferencia.rows[0]!.n).toBe("0");
  });

  it("providencia sem orgao_id cai no catalogo do proprio municipio, e nao no do vizinho", async () => {
    /*
      A rede de seguranca da migracao 017. Um caminho que ainda escreva texto
      livre precisa continuar funcionando, e precisa acabar amarrado ao
      catalogo: sem isso, `orgao_id` voltaria a ser anulavel e a chave composta
      seria dispensada pelo MATCH SIMPLE.
    */
    const ocorrencia = await comoApp(orgA, (tx) =>
      tx.query<{ id: string }>("SELECT id FROM ocorrencias LIMIT 1"),
    );

    const criada = await comoApp(orgA, (tx) =>
      tx.query<{ orgao_id: string }>(
        `INSERT INTO providencias
           (organizacao_id, ocorrencia_id, orgao_destino, descricao, responsavel, prazo_em)
         VALUES ($1,$2,'  corpo de bombeiros ','Escoramento','Engenheiro', now() + interval '2 days')
         RETURNING orgao_id`,
        [orgA, ocorrencia.rows[0]!.id],
      ),
    );

    // A grafia diferente NAO criou um segundo orgao: caiu no que ja existia.
    expect(criada.rows[0]!.orgao_id).toBe(orgaoDeA);
  });

  it("o mesmo nome de orgao nao entra duas vezes so por causa da caixa", async () => {
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          "INSERT INTO orgaos (organizacao_id, nome) VALUES ($1,'CORPO DE BOMBEIROS')",
          [orgA],
        ),
      ),
    ).rejects.toThrow(/orgaos_nome_unico_no_municipio|duplicate key/i);
  });

  it("orgao nao se apaga, se desativa com motivo", async () => {
    const alvo = await db.query<{ id: string }>(
      "INSERT INTO orgaos (organizacao_id, nome) VALUES ($1,'Defesa Sanitaria') RETURNING id",
      [orgA],
    );

    // Sem privilegio de DELETE, e nao por policy: o papel de aplicacao nunca
    // recebeu o direito de apagar orgao.
    await expect(
      comoApp(orgA, (tx) => tx.query("DELETE FROM orgaos WHERE id = $1", [alvo.rows[0]!.id])),
    ).rejects.toThrow(/permission denied|permissao/i);

    // E desativar exige motivo escrito.
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          "UPDATE orgaos SET ativo = false, desativado_em = now() WHERE id = $1",
          [alvo.rows[0]!.id],
        ),
      ),
    ).rejects.toThrow(/desativacao_de_orgao_exige_motivo/i);

    const ok = await comoApp(orgA, (tx) =>
      tx.query(
        `UPDATE orgaos SET ativo = false, desativado_em = now(),
                motivo_desativacao = 'Competencia transferida para a Secretaria de Saude'
          WHERE id = $1 RETURNING ativo`,
        [alvo.rows[0]!.id],
      ),
    );
    expect(ok.rows[0]!.ativo).toBe(false);
  });

  it("numera oficio por municipio e por ano, sem colidir entre municipios", async () => {
    const a1 = await comoApp(orgA, (tx) =>
      tx.query<{ n: string }>("SELECT proximo_oficio(2031) AS n"),
    );
    const b1 = await comoApp(orgB, (tx) =>
      tx.query<{ n: string }>("SELECT proximo_oficio(2031) AS n"),
    );
    const a2 = await comoApp(orgA, (tx) =>
      tx.query<{ n: string }>("SELECT proximo_oficio(2031) AS n"),
    );

    expect(a1.rows[0]!.n).toBe("000001/2031");
    // O primeiro oficio de Vale Fundo e o numero um dele, e nao o dois de
    // Serra Alta: sequencia compartilhada vazaria volume entre municipios.
    expect(b1.rows[0]!.n).toBe("000001/2031");
    expect(a2.rows[0]!.n).toBe("000002/2031");
  });

  it("a numeracao de oficio recusa rodar sem contexto de municipio", async () => {
    await expect(
      comoApp(null, (tx) => tx.query("SELECT proximo_oficio(2031)")),
    ).rejects.toThrow(/app\.organizacao_atual/i);
  });

  it("nao emite dois oficios para a mesma providencia", async () => {
    const ocorrencia = await db.query<{ id: string }>(
      "SELECT ocorrencia_id AS id FROM providencias WHERE id = $1",
      [providenciaDeA],
    );

    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO oficios
             (organizacao_id, ocorrencia_id, providencia_id, orgao_id, numero, ano, emitido_por_nome)
           VALUES ($1,$2,$3,$4,'000999/2026',2026,'Outra pessoa')`,
          [orgA, ocorrencia.rows[0]!.id, providenciaDeA, orgaoDeA],
        ),
      ),
    ).rejects.toThrow(/oficios_um_por_providencia|duplicate key/i);
  });

  it("oficio emitido nao se corrige: sem UPDATE e sem DELETE", async () => {
    /*
      O numero de um oficio identifica o papel que esta na mao do orgao
      destinatario. Se o numero, o orgao ou a providencia pudessem ser trocados
      depois, o 000001/2026 que o Corpo de Bombeiros recebeu passaria a ser
      outro documento aqui dentro, e ninguem conseguiria provar qual dos dois e
      o verdadeiro.
    */
    await expect(
      comoApp(orgA, (tx) =>
        tx.query("UPDATE oficios SET numero = '000042/2026' WHERE id = $1", [oficioDeA]),
      ),
    ).rejects.toThrow();

    await expect(
      comoApp(orgA, (tx) => tx.query("DELETE FROM oficios WHERE id = $1", [oficioDeA])),
    ).rejects.toThrow();

    const conferencia = await db.query<{ numero: string }>(
      "SELECT numero FROM oficios WHERE id = $1",
      [oficioDeA],
    );
    expect(conferencia.rows[0]!.numero).toBe("000001/2026");
  });

  it("nao le o oficio nem o envio de outro municipio", async () => {
    const oficios = await comoApp(orgB, (tx) =>
      tx.query("SELECT id FROM oficios WHERE id = $1", [oficioDeA]),
    );
    expect(oficios.rows).toHaveLength(0);

    const envios = await comoApp(orgB, (tx) =>
      tx.query("SELECT id FROM oficio_envios WHERE token_hash = 'hash-do-link-vivo'"),
    );
    expect(envios.rows).toHaveLength(0);
  });

  it("o email so sai para dominio de orgao ativo do proprio municipio", async () => {
    /*
      Sem esta trava, quem tem login no painel usa o sistema como encaminhador:
      manda o link do dossie de uma familia em risco para o endereco que
      quiser, com o cabecalho da prefeitura em cima.
    */
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO oficio_envios
             (organizacao_id, oficio_id, tentativa, destinatario_email, token_hash,
              expira_em, solicitado_por_nome)
           VALUES ($1,$2,2,'qualquer.um@provedor-pessoal.exemplo.com','hash-fora-da-lista',
                   now() + interval '1 day','Helena Coutinho')`,
          [orgA, oficioDeA],
        ),
      ),
    ).rejects.toThrow(/nao pertence a nenhum orgao ativo/i);

    // E o dominio do vizinho tambem nao serve, mesmo estando cadastrado la.
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO oficio_envios
             (organizacao_id, oficio_id, tentativa, destinatario_email, token_hash,
              expira_em, solicitado_por_nome)
           VALUES ($1,$2,3,'alguem@valefundo.exemplo.gov.br','hash-do-vizinho',
                   now() + interval '1 day','Helena Coutinho')`,
          [orgA, oficioDeA],
        ),
      ),
    ).rejects.toThrow(/nao pertence a nenhum orgao ativo/i);
  });

  it("o link abre uma vez, e a segunda abertura e recusada e registrada", async () => {
    const primeira = await comoApp(null, (tx) =>
      tx.query<{ resultado: string; organizacao_id: string }>(
        "SELECT * FROM abrir_oficio($1,$2,$3)",
        ["hash-do-link-vivo", "203.0.113.10", "navegador de teste"],
      ),
    );
    expect(primeira.rows[0]!.resultado).toBe("entregue");
    expect(primeira.rows[0]!.organizacao_id).toBe(orgA);

    const segunda = await comoApp(null, (tx) =>
      tx.query<{ resultado: string }>(
        "SELECT * FROM abrir_oficio($1,$2,$3)",
        ["hash-do-link-vivo", "198.51.100.7", "outro navegador"],
      ),
    );
    expect(segunda.rows[0]!.resultado).toBe("ja_aberto");

    // As duas ficaram registradas, com o endereco de quem abriu: e assim que a
    // prefeitura descobre que alguem no caminho abriu antes do destinatario.
    const registro = await db.query<{ resultado: string; ip: string }>(
      "SELECT resultado, host(ip) AS ip FROM oficio_aberturas WHERE envio_id = $1 ORDER BY registrado_em",
      [envioDeA],
    );
    expect(registro.rows.map((l) => l.resultado)).toEqual(["entregue", "recusado_ja_aberto"]);
    expect(registro.rows[0]!.ip).toBe("203.0.113.10");
  });

  it("o uso unico e do banco, e nao da aplicacao", async () => {
    /*
      A prova de que a garantia nao depende de ninguem lembrar de marcar o link
      como usado: inserir uma segunda abertura `entregue` a mao, como dono das
      tabelas e por fora da funcao, tambem e recusado.
    */
    await expect(
      db.query(
        `INSERT INTO oficio_aberturas (organizacao_id, oficio_id, envio_id, resultado)
         VALUES ($1,$2,$3,'entregue')`,
        [orgA, oficioDeA, envioDeA],
      ),
    ).rejects.toThrow(/oficio_link_abre_uma_vez|duplicate key/i);
  });

  it("link expirado nao entrega o oficio, e a recusa fica registrada", async () => {
    await db.query(
      `INSERT INTO oficio_envios
         (organizacao_id, oficio_id, tentativa, destinatario_email, token_hash,
          expira_em, solicitado_por_nome)
       VALUES ($1,$2,4,'sinistros@bombeiros-a.exemplo.gov.br','hash-do-link-vencido',
               now() - interval '1 hour','Helena Coutinho')`,
      [orgA, oficioDeA],
    );

    const r = await comoApp(null, (tx) =>
      tx.query<{ resultado: string }>(
        "SELECT * FROM abrir_oficio($1,$2,$3)",
        ["hash-do-link-vencido", "203.0.113.11", "navegador"],
      ),
    );
    expect(r.rows[0]!.resultado).toBe("expirado");

    const registro = await db.query<{ resultado: string }>(
      `SELECT a.resultado FROM oficio_aberturas a
         JOIN oficio_envios e ON e.id = a.envio_id
        WHERE e.token_hash = 'hash-do-link-vencido'`,
    );
    expect(registro.rows[0]!.resultado).toBe("recusado_expirado");
  });

  it("link desconhecido nao registra nada e nao conta se o municipio existe", async () => {
    const antes = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM oficio_aberturas",
    );

    const r = await comoApp(null, (tx) =>
      tx.query<{ resultado: string; organizacao_id: string | null }>(
        "SELECT * FROM abrir_oficio($1,$2,$3)",
        ["hash-que-nunca-existiu", "203.0.113.99", "varredor"],
      ),
    );
    expect(r.rows[0]!.resultado).toBe("desconhecido");
    expect(r.rows[0]!.organizacao_id).toBeNull();

    const depois = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM oficio_aberturas",
    );
    expect(depois.rows[0]!.n).toBe(antes.rows[0]!.n);
  });

  it("a trilha de aberturas e append-only: o papel de aplicacao le e nao escreve", async () => {
    for (const comando of [
      "INSERT INTO oficio_aberturas (organizacao_id, oficio_id, envio_id, resultado) VALUES ($1,$2,$3,'entregue')",
      "UPDATE oficio_aberturas SET resultado = 'recusado_expirado' WHERE envio_id = $3",
      "DELETE FROM oficio_aberturas WHERE envio_id = $3",
    ]) {
      await expect(
        comoApp(orgA, (tx) => tx.query(comando, [orgA, oficioDeA, envioDeA])),
        `o papel de aplicacao conseguiu executar: ${comando}`,
      ).rejects.toThrow();
    }

    const leitura = await comoApp(orgA, (tx) =>
      tx.query("SELECT id FROM oficio_aberturas WHERE envio_id = $1", [envioDeA]),
    );
    expect(leitura.rows.length).toBeGreaterThan(0);
  });
});

describe("O link do oficio nao se estende, se reenvia", () => {
  /**
   * Separado do bloco acima porque prova outra coisa: nao e isolamento entre
   * municipios, e sim o limite do que o PROPRIO municipio consegue fazer com
   * uma tentativa de envio ja gravada.
   *
   * Um link que a aplicacao consegue prorrogar nao expira de verdade, e um
   * `token_hash` substituivel transforma uma tentativa antiga, registrada como
   * enviada para um endereco, num link novo para outro, sem deixar rastro
   * novo. Por isso o privilegio de UPDATE aqui e por COLUNA, e nao por tabela.
   */
  let envio: string;

  /*
    Fixture propria, e nao a do bloco anterior.

    Este bloco chegou apoiado nas linhas criadas la em cima, e isso quebrou na
    primeira vez que alguem rodou a suite com filtro: `vitest -t` pula o
    `beforeAll` do bloco vizinho, e o teste morria lendo `undefined`. Portao
    que so passa quando a suite inteira roda e portao que ninguem consegue usar
    para investigar um caso especifico.
  */
  beforeAll(async () => {
    const orgao = await db.query<{ id: string }>(
      `INSERT INTO orgaos (organizacao_id, nome, email)
       VALUES ($1, 'Companhia de Agua', 'rede@agua-a.exemplo.gov.br') RETURNING id`,
      [orgA],
    );
    const ocorrencia = await db.query<{ id: string }>(
      "SELECT id FROM ocorrencias WHERE organizacao_id = $1 LIMIT 1",
      [orgA],
    );
    const providencia = await db.query<{ id: string }>(
      `INSERT INTO providencias
         (organizacao_id, ocorrencia_id, orgao_id, orgao_destino, descricao, responsavel, prazo_em)
       VALUES ($1,$2,$3,'Companhia de Agua','Limpeza da rede','Encarregado', now() + interval '4 days')
       RETURNING id`,
      [orgA, ocorrencia.rows[0]!.id, orgao.rows[0]!.id],
    );
    const oficio = await db.query<{ id: string }>(
      `INSERT INTO oficios
         (organizacao_id, ocorrencia_id, providencia_id, orgao_id, numero, ano, emitido_por_nome)
       VALUES ($1,$2,$3,$4,'000777/2026',2026,'Helena Coutinho')
       RETURNING id`,
      [orgA, ocorrencia.rows[0]!.id, providencia.rows[0]!.id, orgao.rows[0]!.id],
    );
    const r = await db.query<{ id: string }>(
      `INSERT INTO oficio_envios
         (organizacao_id, oficio_id, tentativa, destinatario_email, token_hash,
          expira_em, solicitado_por_nome)
       VALUES ($1,$2,1,'rede@agua-a.exemplo.gov.br','hash-do-envio-que-nao-se-estende',
               now() + interval '2 days','Helena Coutinho')
       RETURNING id`,
      [orgA, oficio.rows[0]!.id],
    );
    envio = r.rows[0]!.id;
  });

  it("o papel de aplicacao registra o desfecho e nao mexe no prazo nem no token", async () => {
    const ok = await comoApp(orgA, (tx) =>
      tx.query(
        "UPDATE oficio_envios SET desfecho = 'entregue', detalhe = 'aceito pelo provedor' WHERE id = $1 RETURNING desfecho",
        [envio],
      ),
    );
    expect(ok.rows[0]!.desfecho).toBe("entregue");

    for (const comando of [
      "UPDATE oficio_envios SET expira_em = now() + interval '365 days' WHERE id = $1",
      "UPDATE oficio_envios SET token_hash = 'hash-trocado-na-marra' WHERE id = $1",
      "UPDATE oficio_envios SET destinatario_email = 'outro@agua-a.exemplo.gov.br' WHERE id = $1",
    ]) {
      await expect(
        comoApp(orgA, (tx) => tx.query(comando, [envio])),
        `o papel de aplicacao conseguiu executar: ${comando}`,
      ).rejects.toThrow(/permission denied|permissao/i);
    }
  });
});
