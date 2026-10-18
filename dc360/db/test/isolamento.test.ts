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
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

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

/**
 * Devolve o laço de eventos ao Node por um instante (V-INS-05 do registro da E03).
 *
 * O PGlite roda o Postgres em WebAssembly e responde por promessas já
 * resolvidas: uma cadeia de `await db.query(...)` NUNCA volta ao laço de
 * eventos, só à fila de microtarefas. Medido com uma sonda de atraso do laço
 * (`setInterval` de 200 ms) enquanto este arquivo rodava com 24 laços de CPU
 * ocupando a maquina: um unico atraso de 83 s, o arquivo inteiro. Nenhum
 * temporizador e nenhuma mensagem do vitest foi atendida nesse tempo. O efeito
 * visivel eram dois: o prazo do caso estourava depois do prazo (72 s para um
 * limite de 60 s), e o vitest derrubava o comando com `Timeout calling
 * "onTaskUpdate"` (leitura mais provavel, nao inspecionada no codigo do vitest:
 * a resposta do processo principal so e lida quando o laço gira, e o
 * temporizador de 60 s do RPC dispara antes dela). O fato medido e este:
 * passando de 60 s sem ceder, o comando saia com 1 mesmo com todos os casos
 * verdes, e com a cessao o erro some. Maquina livre o arquivo leva 23 s e o erro
 * nao aparece, que e por que ele so surgia sob carga.
 *
 * `setImmediate` roda depois da fase de E/S, entao as mensagens pendentes e os
 * temporizadores vencidos sao atendidos antes de seguir.
 */
const cederOLaco = (): Promise<void> => new Promise((pronto) => { setImmediate(pronto); });

afterEach(async () => {
  await cederOLaco();
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
    /*
      Os operadores do CONSOLE DO FORNECEDOR (migração 038). Não são de
      município nenhum: são as contas de quem opera a plataforma, e a tabela
      existe fora de qualquer tenant, como `organizacoes` existe acima deles.
      Ela é do fornecedor e só o papel do console a alcança; o que a prende
      não é `organizacao_id`, é o par de policies amarradas ao operador da
      sessão (`console_operador_atual()`), cobrado no bloco de tabelas do
      fornecedor logo abaixo.
    */
    "console_operadores",
    /*
      Os CÓDIGOS DE RECUPERAÇÃO de senha desses operadores (migração 039).
      Mesma razão: são do fornecedor, não de município nenhum. O que os
      prende é a policy amarrada ao operador da sessão, cobrada no bloco de
      tabelas do fornecedor logo abaixo, e o caso-irmão em
      `db/test/recuperacao-do-console.test.ts` (operador não vê nem insere
      código de outro).
    */
    "console_codigos_de_recuperacao",
  ]);

  /**
   * Quem não se amarra ao contexto do município, e por quê.
   *
   * Muito mais estreita que `SEM_TENANT`: aqui só entra tabela que existe
   * ANTES de qualquer município. `organizacoes` e `protocolo_sequencias` não
   * têm a coluna e mesmo assim têm policy de contexto, e continuam checadas.
   */
  const SEM_POLICY_DE_TENANT = new Set(["interesse_municipio"]);

  /**
   * AS TABELAS DO FORNECEDOR (migrações 038 e 039), e a regra própria delas.
   *
   * `console_operadores`, `eliminacoes_de_municipio` e
   * `console_codigos_de_recuperacao` não têm policy do produto, e não podem
   * ter: nenhum município lê os operadores do fornecedor, o livro de
   * eliminações ou os códigos de recuperação. As policies delas são todas `TO
   * dc360_console`, e a regra que este arquivo cobra nelas é OUTRA, não uma
   * mais frouxa:
   *
   *   - comando a comando, nunca `FOR ALL` e nunca DELETE (operador se
   *     desativa, o livro não se apaga, código gasto fica marcado);
   *   - toda policy que ESCREVE se apoia numa GUARDA nomeada aqui, por
   *     tabela. Nas duas da 038 a guarda é o dono do console
   *     (`console_operador_e_dono()`), porque "eles jamais podem ter o poder
   *     sobre a primeira conta" e porque só o dono agenda eliminação. A
   *     única linha que entra sem dono é o próprio dono, semeado pelo
   *     console na partida com a tabela VAZIA (`console_sem_operadores()`),
   *     e esse ramo fecha na primeira linha. Nos códigos de recuperação
   *     (039) a guarda é o OPERADOR DA SESSÃO (`console_operador_atual()`),
   *     que é o `app_organizacao_atual()` deste lado da casa: gerar os
   *     próprios códigos é ato de qualquer operador autenticado, e ver os do
   *     outro não é ato de ninguém, nem do dono. Por isso ali a guarda vale
   *     TAMBÉM na leitura (`naLeitura`), e uma policy de SELECT com `USING
   *     (true)` nessa tabela reprova aqui;
   *   - a de UPDATE dos operadores se apoia no operador da sessão, e os
   *     códigos não têm UPDATE nenhum: marcar usado é ato de função sem
   *     contexto (quem recupera não tem sessão).
   *
   * Os casos-irmãos, com o console conectado e tentando, estão em
   * `db/test/eliminacao-de-municipio.test.ts` e em
   * `db/test/recuperacao-do-console.test.ts`.
   */
  const DO_FORNECEDOR = new Map<string, { escreve: string[]; guarda: string; naLeitura: boolean }>([
    ["console_operadores", { escreve: ["INSERT", "UPDATE"], guarda: "console_operador_e_dono", naLeitura: false }],
    ["eliminacoes_de_municipio", { escreve: ["INSERT", "UPDATE"], guarda: "console_operador_e_dono", naLeitura: false }],
    ["console_codigos_de_recuperacao", { escreve: ["INSERT"], guarda: "console_operador_atual", naLeitura: true }],
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
      const r = await db.query<{
        policyname: string;
        cmd: string;
        papeis: string;
        qual: string | null;
        with_check: string | null;
      }>(
        `SELECT policyname, cmd, array_to_string(roles, ',') AS papeis, qual, with_check
           FROM pg_policies WHERE schemaname='public' AND tablename = $1`,
        [t],
      );
      expect(r.rows.length, `tabela ${t} sem nenhuma policy`).toBeGreaterThan(0);

      /*
        As policies do CONSOLE são separadas aqui, e a regra delas é OUTRA, não
        uma mais frouxa.

        O console do fornecedor (ADR 0008) existe para ler número agregado de
        mais de um município, então uma policy dele amarrada ao contexto do
        município seria fingimento: ela não teria contexto nenhum a que se
        amarrar, porque o console não é município. Fingir isolamento onde a
        leitura cruzada é o requisito produziria exatamente o teste verde e
        falso que a ADR 0008 recusa por escrito.

        O que a mantém estreita é a cobrança logo abaixo, mais o portão de
        privilégio no fim deste arquivo: a policy do console só vale onde a ADR
        a autoriza, só para SELECT, e não vale nada sem uma concessão, que é o
        que aquele portão nega em toda tabela que não seja essas duas.
      */
      const AUTORIZADAS_PARA_O_CONSOLE = new Set(["metricas_municipio", "organizacoes"]);
      const doConsole = r.rows.filter((linha) => linha.papeis === "dc360_console");

      if (DO_FORNECEDOR.has(t)) {
        const regra = DO_FORNECEDOR.get(t)!;
        const permitidos = new Set(["SELECT", ...regra.escreve]);
        expect(r.rows.length, `${t} tem policy de outro papel além do console`).toBe(doConsole.length);
        expect(
          doConsole.map((linha) => linha.cmd).sort(),
          `${t} não tem exatamente as policies que a regra do fornecedor nomeia`,
        ).toEqual([...permitidos].sort());
        for (const linha of doConsole) {
          expect(
            permitidos.has(linha.cmd),
            `policy ${linha.policyname} vale para ${linha.cmd} em ${t}: nas tabelas do ` +
            "fornecedor não há policy ALL nem DELETE",
          ).toBe(true);
          if (linha.cmd !== "SELECT" || regra.naLeitura) {
            expect(
              `${linha.qual ?? ""} ${linha.with_check ?? ""}`,
              `policy ${linha.policyname} deixa ${t} ser ${linha.cmd === "SELECT" ? "lida" : "escrita"} ` +
              `sem se apoiar em ${regra.guarda}()`,
            ).toContain(regra.guarda);
          }
        }
        continue;
      }

      for (const linha of doConsole) {
        expect(
          AUTORIZADAS_PARA_O_CONSOLE.has(t),
          `policy ${linha.policyname} dá ao console leitura cruzada em ${t}, e a ` +
          "ADR 0008 só autoriza isso na tabela de métricas e no cadastro de organizações",
        ).toBe(true);
        expect(
          linha.cmd,
          `policy ${linha.policyname} dá ao console mais que SELECT em ${t}: o console só lê`,
        ).toBe("SELECT");
      }

      const doProduto = r.rows.filter((linha) => linha.papeis !== "dc360_console");
      expect(
        doProduto.length,
        `tabela ${t} só tem policy de console, e nenhuma do produto`,
      ).toBeGreaterThan(0);

      // Toda policy precisa se apoiar na função de contexto. Uma policy com
      // `USING (true)` passaria pelo teste anterior e não isolaria nada.
      const expressoes = doProduto
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
      /*
        `console_operadores.criado_por` aponta para a própria tabela (quem
        criou o operador), e a tabela não tem município: é do fornecedor
        (migração 038, e a isenção em `SEM_TENANT`). Não há "outro município"
        a alcançar por ela. É a única referência isenta, e por nome: uma
        chave nova numa tabela nova continua reprovando aqui.
      */
      if (fk.tabela === "console_operadores" && fk.alvo === "console_operadores") continue;
      /*
        `console_codigos_de_recuperacao.operador_id` aponta para
        `console_operadores` (migração 039): código de recuperação de um
        operador do fornecedor, e nenhuma das duas tabelas tem município. A
        segunda referência isenta, e também por nome.
      */
      if (fk.tabela === "console_codigos_de_recuperacao" && fk.alvo === "console_operadores") continue;
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

      Subiu de 13 para 14 em 09/09/2026, por `minimizar_por_prazo` (migração
      021), pela mesma razão de `varrer_prazos`: ela roda num relógio, sem
      ninguém logado, então não existe token, não existe município no contexto
      e o papel de aplicação não enxergaria uma linha sequer. Sem contexto, ela
      não teria nem como descobrir QUAIS municípios têm prazo vencido. A
      alternativa seria a aplicação carregar a lista de municípios por fora do
      RLS, que é a mesma porta com o cadeado do lado de dentro. Os casos do
      bloco "Minimizacao por prazo e registro de consulta", mais abaixo,
      guardam o tamanho desta porta: sem município de parâmetro, sem prazo de
      parâmetro, e sem dado de pessoa na saída.

      Subiu de 14 para 15 em 09/09/2026, por `municipios_a_resumir` (migração
      026), e pela terceira vez pela mesma razão: é um relógio, sem ninguém
      logado. `resumir_municipio()` é SECURITY INVOKER de propósito (a métrica é
      escrita pelo próprio município, debaixo do RLS dele, e é essa inversão que
      sustenta a ADR 0008), então quem a chama precisa JÁ estar no contexto de um
      município. O relógio não estaria: sem contexto, o papel de aplicação não
      enxerga uma linha de `organizacoes` e não teria como descobrir para quem
      chamar. Esta é a menor das quinze portas: devolve `setof uuid` e nada mais,
      não aceita município de parâmetro, e não alcança tabela de negócio nenhuma.
      Os casos do bloco "O relogio que descobre para quem chamar o resumo", no
      fim deste arquivo, guardam esses três limites.

      Subiu de 15 para 16 em 14/09/2026, por `provisionar_municipio` (migração
      036), e desta vez a razão é OUTRA. As três anteriores entraram porque não
      existia contexto de município a definir; esta entra porque quem chama não
      pode ter privilégio nenhum. O console do fornecedor precisa criar a
      prefeitura e o primeiro administrador dela, e a alternativa seria dar
      INSERT em `organizacoes` e `usuarios` ao papel `dc360_console`, que é
      exatamente o que a decisão 3 da ADR 0008 proíbe: privilégio de tabela não
      se divide em "só escrever", e com ele o console criaria administrador
      dentro de município que já existe.

      Esta é a única porta deste banco aberta para um papel que não é o de
      aplicação, e por isso ela é a mais vigiada: o bloco "A porta de criar
      municipio, e por que ela nao serve para ler", mais abaixo, cobra a forma
      dela (dois uuid de saída, nenhum parâmetro que vire consulta, nenhuma
      tabela de negócio no corpo) e cobra que o console continue sem privilégio
      em tabela nenhuma depois de usá-la.

      Subiu de 16 para 22 em 15/09/2026, pela migração 038, e são seis de uma
      vez porque a feature é uma só: suspender e eliminar município, com o
      console escrevendo INTENÇÃO e o relógio da API executando o
      irreversível, guardado pelo estado no banco.

      Quatro são do console (`console_suspender_municipio`,
      `console_reativar_municipio`, `console_agendar_eliminacao`,
      `console_cancelar_eliminacao`), e entram pela razão da
      `provisionar_municipio`: quem chama não pode ter privilégio nenhum. O
      console não tem UPDATE em `organizacoes` nem em `sessoes`, nem INSERT
      em `trilha_administrativa`, e não pode ter (decisão 3 da ADR 0008). As
      quatro exigem que o operador da sessão seja o dono do console, e não
      leem nada: devolvem inteiro, void ou uma data.

      Duas são do relógio (`executar_eliminacoes_vencidas`,
      `concluir_eliminacao`), e entram pela razão de `varrer_prazos`: rodam
      sem ninguém logado e sem município no contexto, e apagam linha em
      tabelas que não têm policy de DELETE para papel nenhum. São as ÚNICAS
      funções do banco que apagam dado de município, e por isso são as mais
      vigiadas: só agem no que está vencido, não cancelado E marcado na
      organização (marca que só a função do console escreve), conferem que
      restou zero linha depois de cada DELETE, e estouram nomeando a tabela
      se o dono das tabelas for barrado pela RLS (armadilha da 037). Os casos
      estão em `db/test/eliminacao-de-municipio.test.ts`.

      Subiu de 22 para 23 no mesmo dia, por `eliminacoes_pendentes` (038),
      pela razão de `municipios_a_resumir`: a rota de saúde da API precisa
      dizer se o relógio tem trabalho, e o papel de aplicação não enxerga uma
      linha de `organizacoes` sem município no contexto. É a menor porta do
      banco: sem parâmetro, devolve dois inteiros (agendadas, vencidas) e
      nenhum nome nem id. O caso "a rota de saude conta agendadas e vencidas"
      cobra a forma dela no catálogo.

      Subiu de 23 para 26 em 15/09/2026, pela migração 039: recuperação de
      senha dos operadores do console, inclusive do dono, por códigos de
      recuperação. São três, e entram por duas razões que este arquivo já
      conhece.

      `console_renovar_codigos` entra pela razão de `provisionar_municipio`:
      quem chama não pode ter privilégio. Gerar códigos novos marca os
      anteriores como usados, que é um UPDATE, e o console não tem UPDATE na
      tabela de códigos (com ele, uma sessão comprometida desmarcaria um
      código gasto). Exige o operador da sessão, ativo, e devolve um inteiro.

      `console_recuperacao_por_email` e `console_consumir_recuperacao` entram
      pela razão de `credenciais_para_login` e `consumir_recuperacao` (002 e
      005): quem perdeu a senha NÃO TEM SESSÃO, então não existe operador no
      contexto e a policy de SELECT da tabela, amarrada ao operador da sessão,
      devolveria vazio. A primeira é a única função do banco que devolve hash
      de credencial sem sessão, e o que a mantém estreita é a forma dela: três
      colunas (id do operador, id do código, hash do CÓDIGO), sem nome, sem
      papel e sem `senha_hash`; email inexistente e operador inativo devolvem
      vazio, nunca erro, para o console não revelar quem existe. A segunda
      gasta o código e troca senha E segundo fator, escrevendo como dono das
      tabelas com `row_security = off`: com um dono sem BYPASSRLS ela estoura
      em vez de dizer "senha redefinida" com a senha velha no lugar. Os casos
      estão em `db/test/recuperacao-do-console.test.ts`.

      Subiu de 26 para 27 em 15/09/2026, por `varrer_tarefas_novas` (migração
      042), pela razão exata de `varrer_prazos`: o aviso de tarefa nova é
      enfileirado pelo despacho, dentro do contexto do município, mas quem o
      ENVIA é o relógio, sem ninguém logado, e sem município no contexto o
      papel de aplicação não enxergaria uma pendente sequer. Mesma forma da
      irmã, e mais estreita na saída: sem município de parâmetro, sem filtro
      de quem chama, e não devolve protocolo nem endereço. O bloco "O aviso de
      despacho nasce na aplicacao, pela porta estreita da 042" guarda a forma.
    */
    expect(lista.length, `funções SECURITY DEFINER demais: ${lista.map((f) => f.nome).join(", ")}`)
      .toBeLessThanOrEqual(27);
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

describe("Apagar prova é negado por AUSÊNCIA de policy, e não só por ausência de GRANT", () => {
  /**
   * A DIFERENÇA ENTRE AS DUAS AUSÊNCIAS, e por que ela não é preciosismo.
   *
   * `trilha_eventos`, `avisos_lidos` e `oficio_aberturas` declaram a policy
   * COMANDO A COMANDO (`FOR SELECT`, `FOR INSERT`). Com RLS forçada, o comando
   * que não tem policy é negado pelo Postgres para todo mundo, inclusive para
   * quem ganhar `GRANT DELETE` amanhã. São DUAS barreiras.
   *
   * `CREATE POLICY` sem cláusula `FOR` vale `FOR ALL`, ou seja, ela autoriza
   * SELECT, INSERT, UPDATE **e DELETE**. Quando a tabela é escrita assim, a
   * única coisa que impede o apagamento é o GRANT, e aí a barreira é UMA.
   *
   * As migrações 030 e 031 prometem por escrito a barreira dupla:
   *
   *   030: "SELECT e INSERT, e mais nada, pelo mesmo motivo da trilha (...).
   *         Uma declaracao de prova ausente num documento oficial nao se apaga"
   *   031: "SEM DELETE, em lugar nenhum. Nao ha policy e nao ha concessao: as
   *         duas ausencias negam."
   *
   * As duas frases eram falsas: as duas tabelas nasceram com policy `ALL`.
   *
   * O CENÁRIO CONCRETO em que isso destrói prova: uma migração futura escreve
   * `GRANT DELETE`, ou o mais banal de todos, `GRANT ALL ON ALL TABLES IN
   * SCHEMA public TO dc360_app` num script de conveniência. Na trilha isso não
   * muda nada, porque não há policy que autorize o DELETE. Em `saidas_a_campo`
   * passa a apagar, e o que se apaga é a única linha que o produto guarda sobre
   * a segurança de um servidor: a saída vencida de quem não desceu do morro,
   * apagável justamente por quem teria interesse em apagá-la. Em
   * `vistoria_evidencias_perdidas` passa a apagar a declaração de prova ausente
   * de um laudo, e o documento volta a parecer completo sem estar.
   *
   * O segundo caso deste bloco não confere lista: ele ABRE o buraco, mostra o
   * estrago, e fecha. É o que separa provar a regra de repetir o schema.
   *
   * A migração 034 trouxe para cá as dezesseis tabelas que faltavam, e elas
   * são o meio do produto: ocorrência, vistoria, evidência, providência, o
   * cadastro que assina isso, as sequências que numeram documento oficial e as
   * credenciais de entrada. A diferença delas está na segunda lista, logo
   * abaixo: elas ACEITAM UPDATE, e o que não pode existir é policy que alcance
   * DELETE.
   */
  const APPEND_ONLY = [
    "trilha_eventos",
    "avisos_lidos",
    "vistoria_evidencias_perdidas",
    "saidas_a_campo",
    /*
      As duas de baixo entraram depois, e pelo mesmo motivo das de cima: as
      duas prometem SELECT e INSERT por extenso no comentário da própria
      migração, e as duas nasceram com policy `ALL`.

      `vistoria_orgaos_indicados` (020) guarda o que o agente respondeu no
      local, embaixo da assinatura do morador, e é o que o laudo imprime como
      "acionar a Secretaria de Obras". `devolucoes_de_tarefa` (028) guarda a
      recusa institucional de subir o morro, com motivo escrito e o nome de
      quem assinou, e é a linha que responde "por que ninguém foi lá".

      Apagáveis as duas, com um `GRANT DELETE` de amanhã, por quem tem
      interesse em apagá-las.
    */
    "vistoria_orgaos_indicados",
    "devolucoes_de_tarefa",
  ];

  /**
   * AS TABELAS DO MEIO DO PRODUTO, e por que elas entram no mesmo portão sem
   * serem append-only (migração 034).
   *
   * As de cima não aceitam UPDATE. Estas aceitam, e precisam aceitar: status
   * de ocorrência muda, laudo é emitido, coordenada de GPS ruim se corrige,
   * sessão é revogada, órgão é desativado com motivo, sequência de protocolo é
   * incrementada. Então a correção delas não é "SELECT e INSERT": é
   * `FOR SELECT` mais `FOR INSERT` mais `FOR UPDATE`, e nunca `FOR ALL`.
   *
   * O que as une às de cima é só isto, e é o que este bloco cobra: nenhuma
   * policy delas pode alcançar DELETE. São as tabelas que guardam a prova que
   * o município leva para uma audiência (a ocorrência, a vistoria, a foto, o
   * encaminhamento), o cadastro que assina essa prova (organização, usuário,
   * equipe, órgão), as sequências que numeram documento oficial e as
   * credenciais que respondem "quem entrou, de onde e quando".
   *
   * Todas nasceram com policy `ALL`, vindas da 001 e das migrações que
   * copiaram a forma dela, e até a 034 quem impedia o apagamento era só a
   * ausência de `GRANT DELETE`.
   */
  const CORRIGIVEIS_QUE_NAO_SE_APAGAM = [
    "organizacoes",
    "equipes",
    "usuarios",
    "protocolo_sequencias",
    "ocorrencias",
    "vistorias",
    "evidencias",
    "providencias",
    "sessoes",
    "recuperacoes_senha",
    "aparelhos",
    "orgaos",
    "oficio_sequencias",
    "oficio_envios",
    "segundo_fator",
    "segundo_fator_recuperacao",
    /*
      Entrou junto com a própria tabela, na 035, e não depois: ela nasceu no
      mesmo dia com a mesma policy `ALL` das outras vinte, e sem esta linha o
      conserto dela não teria nada que o guardasse.

      Aqui a perda dói de um jeito próprio: esta tabela é a MEMÓRIA de que um
      arquivo foi declarado sem dono e descartado, com o nome de quem autorizou
      e o motivo escrito. Apagar a linha apaga o registro do descarte, e sobra
      um arquivo que sumiu sem ninguém ter respondido por isso.
    */
    "objetos_orfaos",
  ];

  const SEM_POLICY_DE_DELETE = [...APPEND_ONLY, ...CORRIGIVEIS_QUE_NAO_SE_APAGAM];

  it("nenhuma tabela de prova tem policy que alcance DELETE", async () => {
    for (const tabela of SEM_POLICY_DE_DELETE) {
      const r = await db.query<{ policyname: string; cmd: string }>(
        `SELECT policyname, cmd FROM pg_policies
          WHERE schemaname = 'public' AND tablename = $1 ORDER BY policyname`,
        [tabela],
      );
      expect(r.rows.length, `${tabela} sem policy nenhuma`).toBeGreaterThan(0);
      for (const p of r.rows) {
        expect(
          p.cmd,
          `${tabela}.${p.policyname} vale para ${p.cmd}: uma policy ALL autoriza `
          + "DELETE, e aí a única barreira contra apagar prova é o GRANT",
        ).not.toBe("ALL");
        expect(
          p.cmd,
          `${tabela}.${p.policyname} autoriza DELETE explicitamente`,
        ).not.toBe("DELETE");
      }
    }
  });

  it("com um GRANT DELETE a mais, as linhas continuam lá", async () => {
    /*
      A NEGATIVA AQUI É SILENCIOSA, e é isso que a torna a barreira certa.

      Sem GRANT, o Postgres recusa com erro (é o que o caso da trilha, logo
      acima, mostra). COM o grant e sem policy de DELETE, ele não recusa: a
      cláusula da policy não seleciona linha nenhuma para apagar, e o comando
      volta dizendo que apagou zero. Quem tentar apagar prova por aqui não
      recebe erro e não leva nada, que é exatamente o desfecho desejado.

      A contagem antes e depois é o que prova isso sem depender da mensagem do
      banco, e as linhas são semeadas de propósito: um DELETE contra tabela
      vazia passaria por aqui sem provar coisa nenhuma.
    */
    const oc = await db.query<{ id: string }>(
      "SELECT id FROM ocorrencias WHERE organizacao_id = $1 LIMIT 1",
      [orgA],
    );
    const ocId = oc.rows[0]!.id;
    const us = await db.query<{ id: string }>(
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel)
       VALUES ($1,'Diego Nakamura Alves','SA-9901','diego9901@serraalta.exemplo.gov.br',
               'agente_campo')
       RETURNING id`,
      [orgA],
    );
    const usId = us.rows[0]!.id;

    const vist = await db.query<{ id: string }>(
      `INSERT INTO vistorias
         (organizacao_id, ocorrencia_id, agente_id, checklist, assinante_nome,
          coletada_em, idempotency_key)
       VALUES ($1,$2,$3,'[]'::jsonb,'Marilda Souza Prado', now(), gen_random_uuid())
       RETURNING id`,
      [orgA, ocId, usId],
    );
    await db.query(
      `INSERT INTO vistoria_evidencias_perdidas
         (organizacao_id, vistoria_id, idempotency_key, papel, capturada_em)
       VALUES ($1,$2,'foto-perdida-do-portao','foto', now())`,
      [orgA, vist.rows[0]!.id],
    );
    await db.query(
      `INSERT INTO saidas_a_campo
         (organizacao_id, ocorrencia_id, agente_id, sozinho, duracao_minutos,
          declarada_em, retorno_previsto_inicial, retorno_previsto_em, idempotency_key)
       VALUES ($1,$2,$3,true,120, now(), now() + interval '2 hours',
               now() + interval '2 hours', gen_random_uuid())`,
      [orgA, ocId, usId],
    );

    /* O que o agente respondeu no local, e que o laudo imprime como "acionar a
       Secretaria de Obras". Campo livre, sem `orgao_id`, para o caso não
       depender de haver catálogo semeado. */
    await db.query(
      `INSERT INTO vistoria_orgaos_indicados
         (organizacao_id, vistoria_id, orgao_id, nome)
       VALUES ($1,$2,NULL,'Secretaria de Obras')`,
      [orgA, vist.rows[0]!.id],
    );
    /* A recusa institucional de subir o morro, com motivo escrito e o nome de
       quem assinou: a linha que responde "por que ninguém foi lá". */
    const eq = await db.query<{ id: string }>(
      "INSERT INTO equipes (organizacao_id, nome) VALUES ($1, 'Equipe do append-only') RETURNING id",
      [orgA],
    );
    await db.query(
      `INSERT INTO devolucoes_de_tarefa
         (organizacao_id, ocorrencia_id, devolvida_por, equipe_id, motivo,
          observacao, prazo_em, decidida_em, idempotency_key)
       VALUES ($1,$2,$3,$4,'risco_para_a_equipe','Barranco instável na subida.',
               now() - interval '3 hours', now(), gen_random_uuid())`,
      [orgA, ocId, usId, eq.rows[0]!.id],
    );

    await db.query(
      `INSERT INTO trilha_eventos
         (organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel,
          origem, ocorrido_em)
       VALUES ($1,$2,'registro',$3,'Diego Nakamura Alves','agente_campo','campo', now())`,
      [orgA, ocId, usId],
    );
    const aviso = await db.query<{ id: string }>(
      `INSERT INTO avisos (organizacao_id, tipo, ocorrencia_id, chave_do_fato)
       VALUES ($1,'vistoria_recebida',$2,'portao-do-append-only')
       RETURNING id`,
      [orgA, ocId],
    );
    await db.query(
      `INSERT INTO avisos_lidos (organizacao_id, aviso_id, usuario_id)
       VALUES ($1,$2,$3)`,
      [orgA, aviso.rows[0]!.id, usId],
    );

    /*
      AS LINHAS DAS TABELAS DO MEIO DO PRODUTO (migração 034).

      `organizacoes`, `equipes`, `usuarios`, `ocorrencias` e `vistorias` já têm
      linha aqui, semeadas acima ou no `beforeAll`. As outras onze estão vazias
      neste ponto do arquivo, e um DELETE contra tabela vazia passaria por este
      caso sem provar coisa nenhuma, que é exatamente o que a conferência
      `antes > 0` do laço impede.

      Elas são retiradas no fim, como dono, porque o banco é compartilhado
      pelos blocos deste arquivo: uma linha a mais deixada para trás mudaria a
      contagem de um teste lá embaixo, e a falha apareceria longe da causa.
    */
    const vistId = vist.rows[0]!.id;
    await db.query(
      `INSERT INTO evidencias
         (organizacao_id, ocorrencia_id, vistoria_id, chave_storage, capturada_em)
       VALUES ($1,$2,$3,$4, now())`,
      [orgA, ocId, vistId, `tenant/${orgA}/prova-do-portao.jpg`],
    );
    /* A linha de `orgaos` não é inserida à mão: o gatilho
       `providencia_amarra_no_catalogo` (migração 017) cria o órgão do catálogo
       a partir do destino escrito na providência, e inserir outro com o mesmo
       nome reprovaria na unicidade insensível a caixa. */
    const prov = await db.query<{ id: string; orgao_id: string }>(
      `INSERT INTO providencias
         (organizacao_id, ocorrencia_id, orgao_destino, descricao, responsavel, prazo_em)
       VALUES ($1,$2,'Secretaria de Obras','Escorar o talude da Rua das Acácias.',
               'Diego Nakamura Alves', now() + interval '5 days')
       RETURNING id, orgao_id`,
      [orgA, ocId],
    );
    /* O endereço do órgão precisa existir antes do envio: a migração 017
       recusa mandar ofício para domínio que não é de órgão ativo do município. */
    await db.query(
      "UPDATE orgaos SET email = 'obras@serraalta.exemplo.gov.br' WHERE id = $1",
      [prov.rows[0]!.orgao_id],
    );
    await db.query(
      "INSERT INTO protocolo_sequencias (organizacao_id, ano, ultimo) VALUES ($1, 2026, 1)",
      [orgA],
    );
    await db.query(
      `INSERT INTO sessoes (organizacao_id, usuario_id, token_hash, expira_em)
       VALUES ($1,$2,'resumo-de-sessao-do-portao', now() + interval '8 hours')`,
      [orgA, usId],
    );
    await db.query(
      `INSERT INTO recuperacoes_senha (organizacao_id, usuario_id, token_hash, expira_em)
       VALUES ($1,$2,'resumo-de-recuperacao-do-portao', now() + interval '1 hour')`,
      [orgA, usId],
    );
    await db.query(
      `INSERT INTO aparelhos (organizacao_id, usuario_id, plataforma, ficha)
       VALUES ($1,$2,'ios','ficha-do-portao-append-only')`,
      [orgA, usId],
    );
    await db.query(
      "INSERT INTO oficio_sequencias (organizacao_id, ano, ultimo) VALUES ($1, 2026, 1)",
      [orgA],
    );
    const oficio = await db.query<{ id: string }>(
      `INSERT INTO oficios
         (organizacao_id, ocorrencia_id, providencia_id, orgao_id, numero, ano,
          emitido_por, emitido_por_nome)
       VALUES ($1,$2,$3,$4,'000001/2026',2026,$5,'Diego Nakamura Alves')
       RETURNING id`,
      [orgA, ocId, prov.rows[0]!.id, prov.rows[0]!.orgao_id, usId],
    );
    await db.query(
      `INSERT INTO oficio_envios
         (organizacao_id, oficio_id, tentativa, destinatario_email, token_hash,
          expira_em, solicitado_por, solicitado_por_nome)
       VALUES ($1,$2,1,'obras@serraalta.exemplo.gov.br',
               'resumo-de-envio-do-portao', now() + interval '3 days', $3,
               'Diego Nakamura Alves')`,
      [orgA, oficio.rows[0]!.id, usId],
    );
    await db.query(
      `INSERT INTO segundo_fator (organizacao_id, usuario_id, segredo_cifrado, confirmado_em)
       VALUES ($1,$2,'v1.vetor-do-portao.selo-do-portao.segredo-do-portao', now())`,
      [orgA, usId],
    );
    await db.query(
      `INSERT INTO segundo_fator_recuperacao (organizacao_id, usuario_id, codigo_hash)
       VALUES ($1,$2,$3)`,
      [orgA, usId, "c".repeat(43)],
    );

    /* A memória de um descarte autorizado: nome de quem decidiu e motivo. */
    await db.query(
      `INSERT INTO objetos_orfaos
         (organizacao_id, varredura_id, chave, tamanho_bytes, especie)
       VALUES ($1, gen_random_uuid(), $2, 1024, 'objeto_sem_linha')`,
      [orgA, `tenant/${orgA}/evidencias/foto-sem-dono.jpg`],
    );

    /*
      O laço junta o estrago de TODAS as tabelas antes de reprovar, em vez de
      parar na primeira. Parando na primeira, quem revertesse a correção veria
      um nome só e acharia que o buraco era de uma tabela.
    */
    const problemas: string[] = [];
    const contar = async (tabela: string): Promise<string> => {
      const r = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM ${tabela}`);
      return r.rows[0]!.n;
    };

    /*
      A contagem de partida é tirada de TODAS as tabelas antes do primeiro
      DELETE, e não tabela a tabela dentro do laço.

      O motivo apareceu na primeira vez que a correção foi revertida de
      propósito: apagar `vistorias` leva `evidencias` junto por cascata, e a
      conferência de "não estava vazia" da evidência passava a reprovar por
      tabela vazia, escondendo o estrago atrás de um problema de arrumação do
      teste. Medindo antes, a vacuidade é cobrada com o banco ainda inteiro.
    */
    const antesPorTabela = new Map<string, string>();
    for (const tabela of SEM_POLICY_DE_DELETE) {
      const n = await contar(tabela);
      expect(Number(n), `${tabela} está vazia: o caso não provaria nada`).toBeGreaterThan(0);
      antesPorTabela.set(tabela, n);
    }

    try {
      for (const tabela of SEM_POLICY_DE_DELETE) {
        const antes = antesPorTabela.get(tabela)!;

        await db.exec(`GRANT DELETE ON ${tabela} TO dc360_app`);
        try {
          let erro: string | null = null;
          try {
            await comoApp(orgA, (tx) => tx.query(`DELETE FROM ${tabela}`));
          } catch (e) {
            erro = (e as Error).message;
          }
          const depois = await contar(tabela);
          /*
            ERRO TAMBÉM É ESTRAGO, e não alívio.

            Em várias destas tabelas quem barraria o apagamento seria uma chave
            estrangeira `ON DELETE RESTRICT`, e não a policy. Isso não é a
            proteção funcionando: é o comando tendo CHEGADO na linha. Com a
            policy certa, o DELETE não enxerga linha nenhuma para apagar, volta
            dizendo que apagou zero e não viola chave de ninguém. Um erro aqui
            significa que a linha estava visível para o comando, e portanto que
            a barreira dependia de outra coisa.
          */
          if (erro !== null) {
            problemas.push(
              `${tabela}: o DELETE alcançou as linhas e quem recusou foi outra `
              + `regra do banco, e não a ausência de policy (${erro})`,
            );
          } else if (depois !== antes) {
            problemas.push(`${tabela}: ${antes} linha(s) antes do DELETE, ${depois} depois`);
          }
        } finally {
          await db.exec(`REVOKE DELETE ON ${tabela} FROM dc360_app`);
        }
      }

      expect(
        problemas,
        "com GRANT DELETE, estas tabelas deixaram de proteger a prova: a ausência "
        + "de policy é o que precisa negar, e não a ausência de concessão",
      ).toEqual([]);
    } finally {
      // Na ordem inversa da criação, por causa das chaves estrangeiras.
      for (const limpar of [
        "DELETE FROM segundo_fator_recuperacao WHERE organizacao_id = $1",
        "DELETE FROM segundo_fator WHERE organizacao_id = $1",
        "DELETE FROM oficio_envios WHERE organizacao_id = $1",
        "DELETE FROM oficios WHERE organizacao_id = $1",
        "DELETE FROM oficio_sequencias WHERE organizacao_id = $1",
        "DELETE FROM aparelhos WHERE organizacao_id = $1",
        "DELETE FROM recuperacoes_senha WHERE organizacao_id = $1",
        "DELETE FROM sessoes WHERE organizacao_id = $1",
        "DELETE FROM evidencias WHERE organizacao_id = $1",
        "DELETE FROM providencias WHERE organizacao_id = $1",
        "DELETE FROM orgaos WHERE organizacao_id = $1",
        "DELETE FROM protocolo_sequencias WHERE organizacao_id = $1 AND ano = 2026",
      ]) {
        await db.query(limpar, [orgA]);
      }
    }
  });
});

describe("O portao universal contra apagar: nenhuma policy ALL, e DELETE so onde esta nomeado", () => {
  /**
   * POR QUE O BLOCO DE CIMA NAO BASTAVA, provado por um revisor em 15/09/2026.
   *
   * As duas listas do bloco anterior (`APPEND_ONLY` e
   * `CORRIGIVEIS_QUE_NAO_SE_APAGAM`) sao EXPLICITAS: uma tabela nova que nasca
   * com `CREATE POLICY` sem clausula `FOR` (que vale `FOR ALL`, e autoriza
   * DELETE) e com `GRANT DELETE` ao papel de aplicacao nao esta em lista
   * nenhuma, e passa. E `GRANT DELETE ON ocorrencias TO dc360_app` tambem
   * passa: o portao de privilegio la embaixo IGNORA o que `dc360_app` tem (ele
   * existe para achar OUTROS papeis), e o caso "com um GRANT DELETE a mais"
   * concede e revoga por conta propria, entao nao ve um GRANT que ja estava
   * la. A prova do revisor foi uma copia do banco com exatamente esses dois
   * defeitos, e nenhuma reprovacao.
   *
   * A resposta e a mesma forma do portao de privilegio: uma varredura sobre
   * TODA tabela de `public`, sem lista de tabelas, com lista so de EXCECOES,
   * cada uma narrada. Tabela nova entra sozinha; excecao nova exige escrever o
   * nome aqui, o que aparece na revisao.
   *
   * Tres cobrancas:
   *
   *   1. NENHUMA policy `ALL`, em tabela nenhuma. Policy `ALL` e a que autoriza
   *      DELETE sem ninguem ter escrito a palavra, e foi assim que as vinte e
   *      duas tabelas da 034 nasceram apagaveis por um GRANT.
   *   2. Policy `DELETE` so nas duas tabelas em que o produto APAGA de
   *      proposito e por idade, e a condicao de idade esta escrita na propria
   *      policy: `avisos` (018, sessenta dias) e `notificacoes_enviadas` (037,
   *      trinta dias de piso, o expurgo dentro de `varrer_prazos`).
   *   3. Privilegio EFETIVO de DELETE (`has_table_privilege`, que soma
   *      concessao direta, heranca e PUBLIC) so onde esta nomeado: `dc360_app`
   *      em `avisos`, e mais nada; `dc360_console` em lugar nenhum.
   *
   * E os dois casos-irmaos reintroduzem os defeitos da prova do revisor, no
   * mesmo banco, e veem a varredura morder. Sem eles, uma consulta de catalogo
   * com nome de coluna errado devolveria vazio e o portao passaria verde sem
   * verificar nada, que e o defeito que a ancora do bloco de privilegio ja
   * descreve.
   */
  const COM_POLICY_DE_DELETE = new Map<string, string>([
    ["avisos", "018: expurgo por idade, com os sessenta dias escritos na policy avisos_expurgo"],
    ["notificacoes_enviadas", "037: expurgo por retencao dentro de varrer_prazos, com o piso de trinta dias na policy notificacoes_expurgo"],
  ]);
  const APAGA_EM = new Map<string, Set<string>>([
    ["dc360_app", new Set(["avisos"])],
    ["dc360_console", new Set()],
  ]);

  type SobraDeDelete = { tabela: string; problema: string };

  /** Tudo que alcanca DELETE, em qualquer tabela de `public`, sem filtro de lista. */
  async function tudoQueAlcancaDelete(): Promise<{
    policiesAll: Array<{ tabela: string; policy: string }>;
    policiesDelete: Array<{ tabela: string; policy: string }>;
    privilegios: Array<{ tabela: string; papel: string }>;
  }> {
    const policies = await db.query<{ tabela: string; policy: string; cmd: string }>(
      `SELECT tablename AS tabela, policyname AS policy, cmd
         FROM pg_policies
        WHERE schemaname = 'public' AND cmd IN ('ALL', 'DELETE')
        ORDER BY tablename, policyname`,
    );
    const privilegios = await db.query<{ tabela: string; papel: string }>(
      `SELECT c.relname AS tabela, r.rolname AS papel
         FROM pg_class c
         CROSS JOIN pg_roles r
        WHERE c.relnamespace = 'public'::regnamespace
          AND c.relkind IN ('r', 'p', 'v', 'm')
          AND r.rolname IN ('dc360_app', 'dc360_console')
          AND has_table_privilege(r.oid, c.oid, 'DELETE')
        ORDER BY c.relname, r.rolname`,
    );
    return {
      policiesAll: policies.rows.filter((p) => p.cmd === "ALL"),
      policiesDelete: policies.rows.filter((p) => p.cmd === "DELETE"),
      privilegios: privilegios.rows,
    };
  }

  async function sobrasDeDelete(): Promise<SobraDeDelete[]> {
    const tudo = await tudoQueAlcancaDelete();
    const sobras: SobraDeDelete[] = [];
    for (const p of tudo.policiesAll) {
      sobras.push({
        tabela: p.tabela,
        problema: `policy ${p.policy} vale para ALL: autoriza DELETE sem ninguem ter escrito a palavra`,
      });
    }
    for (const p of tudo.policiesDelete) {
      if (!COM_POLICY_DE_DELETE.has(p.tabela)) {
        sobras.push({ tabela: p.tabela, problema: `policy ${p.policy} autoriza DELETE, e a tabela nao esta na lista nomeada` });
      }
    }
    for (const g of tudo.privilegios) {
      if (!APAGA_EM.get(g.papel)?.has(g.tabela)) {
        sobras.push({ tabela: g.tabela, problema: `${g.papel} tem privilegio efetivo de DELETE` });
      }
    }
    return sobras;
  }

  function descreverSobras(sobras: SobraDeDelete[]): string {
    return sobras.map((s) => `${s.tabela}: ${s.problema}`).join("; ");
  }

  it("a ancora: a varredura enxerga as duas excecoes nomeadas, entao ela le o catalogo de verdade", async () => {
    const tudo = await tudoQueAlcancaDelete();
    expect(tudo.policiesDelete.map((p) => p.tabela).sort()).toEqual([...COM_POLICY_DE_DELETE.keys()].sort());
    expect(tudo.privilegios).toEqual([{ tabela: "avisos", papel: "dc360_app" }]);
    /* E a lista de excecoes so nomeia tabela que existe: excecao para tabela
       renomeada seria uma excecao aberta esperando dono. */
    for (const tabela of [...COM_POLICY_DE_DELETE.keys(), ...APAGA_EM.get("dc360_app")!]) {
      const existe = await db.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM pg_tables WHERE schemaname = 'public' AND tablename = $1",
        [tabela],
      );
      expect(existe.rows[0]!.n, `a excecao nomeia ${tabela}, que nao existe`).toBe("1");
    }
  });

  it("em TODA tabela de public: nenhuma policy ALL, e policy DELETE e privilegio de DELETE so na lista nomeada", async () => {
    const sobras = await sobrasDeDelete();
    expect(
      sobras,
      "alguma coisa alcanca DELETE fora do que esta nomeado neste bloco: "
      + descreverSobras(sobras),
    ).toEqual([]);
  });

  it("caso-irmao: tabela nova com policy sem FOR e GRANT DELETE e mordida, mesmo sem estar em lista nenhuma", async () => {
    /*
      Exatamente a copia do revisor: `CREATE POLICY` sem `FOR` (vale ALL) e
      `GRANT SELECT, INSERT, UPDATE, DELETE`, que e a forma que um `GRANT ALL`
      de conveniencia produz. A tabela tem `organizacao_id` e RLS forcada, entao
      ela passa em TODOS os outros portoes deste arquivo: o unico que a barra e
      este.
    */
    await db.exec(`
      CREATE TABLE prova_do_portao_universal (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organizacao_id uuid NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT
      );
      ALTER TABLE prova_do_portao_universal ENABLE ROW LEVEL SECURITY;
      ALTER TABLE prova_do_portao_universal FORCE ROW LEVEL SECURITY;
      CREATE POLICY prova_isolamento ON prova_do_portao_universal
        USING (organizacao_id = app_organizacao_atual())
        WITH CHECK (organizacao_id = app_organizacao_atual());
      GRANT SELECT, INSERT, UPDATE, DELETE ON prova_do_portao_universal TO dc360_app;
    `);
    try {
      const sobras = await sobrasDeDelete();
      const daProva = sobras.filter((s) => s.tabela === "prova_do_portao_universal");
      expect(daProva.map((s) => s.problema).join(" | ")).toMatch(/vale para ALL/);
      expect(daProva.map((s) => s.problema).join(" | ")).toMatch(/dc360_app tem privilegio efetivo de DELETE/);
      // E so ela: o resto do banco continua limpo, para a mordida ser atribuivel.
      expect(sobras.filter((s) => s.tabela !== "prova_do_portao_universal")).toEqual([]);
    } finally {
      await db.exec("DROP TABLE prova_do_portao_universal");
    }
  });

  it("caso-irmao: GRANT DELETE ON ocorrencias TO dc360_app e mordido, sem ninguem precisar lista-lo", async () => {
    await db.exec("GRANT DELETE ON ocorrencias TO dc360_app");
    try {
      const sobras = await sobrasDeDelete();
      expect(sobras).toEqual([{ tabela: "ocorrencias", problema: "dc360_app tem privilegio efetivo de DELETE" }]);
    } finally {
      await db.exec("REVOKE DELETE ON ocorrencias FROM dc360_app");
    }
    expect(await sobrasDeDelete(), "a limpeza do caso-irmao deixou rastro").toEqual([]);
  });

  it("caso-irmao: privilegio por HERANCA tambem e mordido, porque a pergunta e feita ao banco e nao ao GRANT", async () => {
    /*
      `has_table_privilege` responde pelo que o papel PODE, venha de onde vier.
      Um papel intermediario com DELETE, do qual `dc360_app` vira membro, nao
      aparece em `role_table_grants` de `dc360_app`, e aparece aqui.
    */
    await db.exec(`
      CREATE ROLE papel_intermediario_do_portao NOLOGIN;
      GRANT DELETE ON vistorias TO papel_intermediario_do_portao;
      GRANT papel_intermediario_do_portao TO dc360_app;
    `);
    try {
      const sobras = await sobrasDeDelete();
      expect(sobras).toEqual([{ tabela: "vistorias", problema: "dc360_app tem privilegio efetivo de DELETE" }]);
    } finally {
      await db.exec(`
        REVOKE papel_intermediario_do_portao FROM dc360_app;
        REVOKE DELETE ON vistorias FROM papel_intermediario_do_portao;
        DROP ROLE papel_intermediario_do_portao;
      `);
    }
    expect(await sobrasDeDelete(), "a limpeza do caso-irmao deixou rastro").toEqual([]);
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

  it("a foto do servidor so aceita chave sob o municipio E o proprio usuario (migracao 040)", async () => {
    /*
      A foto de perfil e a segunda chave de armazenamento que mora numa tabela
      de negocio, e ela ganha a MESMA barreira da evidencia (001) e da
      assinatura (009), com um degrau a mais: o prefixo carrega o id do
      usuario. Sem isso, um servidor poderia apontar a propria foto para o
      objeto de outro colega, e a tela da equipe mostraria o rosto errado
      embaixo do nome certo.
    */
    const [meu, colega] = await Promise.all([
      db.query<{ id: string }>(
        `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel)
         VALUES ($1,'Servidor com foto','SA-FOTO-1','foto1@serraalta.exemplo.gov.br','agente_campo')
         RETURNING id`,
        [orgA],
      ),
      db.query<{ id: string }>(
        `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel)
         VALUES ($1,'Colega','SA-FOTO-2','foto2@serraalta.exemplo.gov.br','agente_campo')
         RETURNING id`,
        [orgA],
      ),
    ]);
    const eu = meu.rows[0]!.id;
    const outro = colega.rows[0]!.id;

    const gravar = (chave: string) =>
      comoApp(orgA, (tx) =>
        tx.query("UPDATE usuarios SET foto_chave = $2 WHERE id = $1", [eu, chave]));

    // Prefixo de outro municipio: a primeira barreira, a mesma da evidencia.
    await expect(gravar(`tenant/${orgB}/usuarios/${eu}/foto.jpg`))
      .rejects.toThrow(/foto_com_prefixo_do_tenant_e_do_usuario/i);
    // Municipio certo, usuario errado: a barreira nova.
    await expect(gravar(`tenant/${orgA}/usuarios/${outro}/foto.jpg`))
      .rejects.toThrow(/foto_com_prefixo_do_tenant_e_do_usuario/i);
    // A chave de uma evidencia do proprio municipio tambem nao serve de foto.
    await expect(gravar(`tenant/${orgA}/ocorrencias/${eu}/foto.jpg`))
      .rejects.toThrow(/foto_com_prefixo_do_tenant_e_do_usuario/i);

    // A chave certa entra, e voltar a nulo (remover a foto) tambem.
    await gravar(`tenant/${orgA}/usuarios/${eu}/foto-1.jpg`);
    const lida = await comoApp(orgA, (tx) =>
      tx.query<{ foto_chave: string | null }>("SELECT foto_chave FROM usuarios WHERE id = $1", [eu]));
    expect(lida.rows[0]!.foto_chave).toBe(`tenant/${orgA}/usuarios/${eu}/foto-1.jpg`);
    await comoApp(orgA, (tx) =>
      tx.query("UPDATE usuarios SET foto_chave = NULL WHERE id = $1", [eu]));
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

describe("O aviso de despacho nasce na aplicacao, pela porta estreita da 042", () => {
  /**
   * A migracao 016 deixou escrito que o papel de aplicacao NAO tinha INSERT em
   * `notificacoes_enviadas`, e que quem escrevesse o aviso de tarefa nova
   * ("ele nasce no despacho, dentro do contexto do municipio") concederia o
   * INSERT na propria migracao, de forma deliberada. A 042 e essa migracao.
   *
   * O que este bloco prova e que a porta e ESTREITA em tres direcoes:
   *
   *   1. isolamento: a linha so entra carimbada com o municipio do contexto,
   *      apontando para aparelho e ocorrencia desse mesmo municipio;
   *   2. forma: a aplicacao so enfileira (`tarefa_nova`, `pendente`). Ela nao
   *      registra entrega, nao inventa `entregue` e nao cria aviso de prazo,
   *      que continua nascendo so dentro de `varrer_prazos`;
   *   3. a funcao que reivindica as pendentes, `varrer_tarefas_novas`, tem a
   *      mesma forma da `varrer_prazos`: sem municipio de parametro, sem dado
   *      de pessoa na saida, e devolve cada pendente UMA vez.
   */
  let agenteDeA: string;
  let equipeDeA: string;
  let aparelhoDeA: string;
  let ocorrenciaDeA: string;
  let aparelhoDeB: string;
  let ocorrenciaDeBDespachada: string;

  beforeAll(async () => {
    const eqA = await db.query<{ id: string }>(
      "INSERT INTO equipes (organizacao_id, nome) VALUES ($1, 'Equipe do despacho A') RETURNING id",
      [orgA],
    );
    equipeDeA = eqA.rows[0]!.id;
    const uA = await db.query<{ id: string }>(
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, equipe_id)
       VALUES ($1, 'Agente do despacho A', 'SA-DESP-1', 'desp.sa@exemplo.gov.br', 'agente_campo', $2)
       RETURNING id`,
      [orgA, equipeDeA],
    );
    agenteDeA = uA.rows[0]!.id;
    const apA = await db.query<{ id: string }>(
      `INSERT INTO aparelhos (organizacao_id, usuario_id, plataforma, ficha)
       VALUES ($1,$2,'android','ficha-do-despacho-a') RETURNING id`,
      [orgA, agenteDeA],
    );
    aparelhoDeA = apA.rows[0]!.id;
    const ocA = await db.query<{ id: string }>(
      `INSERT INTO ocorrencias
         (organizacao_id, protocolo, tipo, status, severidade, endereco, solicitante_nome,
          canal_entrada, descricao, equipe_id, prazo_em)
       VALUES ($1,'000942/2026','deslizamento','em_campo','media','Rua do Despacho, 42','Fulano',
               'telefone','x',$2, now() + interval '40 hours')
       RETURNING id`,
      [orgA, equipeDeA],
    );
    ocorrenciaDeA = ocA.rows[0]!.id;

    const eqB = await db.query<{ id: string }>(
      "INSERT INTO equipes (organizacao_id, nome) VALUES ($1, 'Equipe do despacho B') RETURNING id",
      [orgB],
    );
    const uB = await db.query<{ id: string }>(
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, equipe_id)
       VALUES ($1, 'Agente do despacho B', 'VF-DESP-1', 'desp.vf@exemplo.gov.br', 'agente_campo', $2)
       RETURNING id`,
      [orgB, eqB.rows[0]!.id],
    );
    const apB = await db.query<{ id: string }>(
      `INSERT INTO aparelhos (organizacao_id, usuario_id, plataforma, ficha)
       VALUES ($1,$2,'ios','ficha-do-despacho-b') RETURNING id`,
      [orgB, uB.rows[0]!.id],
    );
    aparelhoDeB = apB.rows[0]!.id;
    const ocB = await db.query<{ id: string }>(
      `INSERT INTO ocorrencias
         (organizacao_id, protocolo, tipo, status, severidade, endereco, solicitante_nome,
          canal_entrada, descricao, equipe_id, prazo_em)
       VALUES ($1,'000942/2026','inundacao','em_campo','alta','Avenida do Despacho, 9','Beltrano',
               'telefone','x',$2, now() + interval '20 hours')
       RETURNING id`,
      [orgB, eqB.rows[0]!.id],
    );
    ocorrenciaDeBDespachada = ocB.rows[0]!.id;
  });

  const INSERIR = `INSERT INTO notificacoes_enviadas
                     (organizacao_id, aparelho_id, ocorrencia_id, tipo, desfecho, tentativas)
                   VALUES ($1,$2,$3,$4,$5,0)`;

  it("nao enfileira aviso carimbado com o id de outro municipio", async () => {
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(INSERIR, [orgB, aparelhoDeB, ocorrenciaDeBDespachada, "tarefa_nova", "pendente"]),
      ),
    ).rejects.toThrow();
    const conf = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM notificacoes_enviadas WHERE organizacao_id = $1",
      [orgB],
    );
    expect(conf.rows[0]!.n, "Serra Alta escreveu aviso no nome de Vale Fundo").toBe("0");
  });

  it("nao enfileira aviso para aparelho de outro municipio, nem carimbado com o proprio id", async () => {
    /*
      A policy deixa passar (o carimbo e o do contexto); quem barra e a chave
      estrangeira composta da 016, `(organizacao_id, aparelho_id)`, que e a
      unica coisa que fecha esta porta: RLS nao confere para onde a linha
      aponta.
    */
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(INSERIR, [orgA, aparelhoDeB, ocorrenciaDeA, "tarefa_nova", "pendente"]),
      ),
    ).rejects.toThrow();
  });

  it("a aplicacao so enfileira: nao registra entrega nem cria aviso de prazo", async () => {
    /*
      `entregue` escrito pela aplicacao seria a aplicacao respondendo "voce foi
      avisado as 14h32" sem ter avisado ninguem: e a resposta que o suporte da
      ao agente, e ela so pode vir de quem falou com a Apple ou com o Google.
      Aviso de prazo continua nascendo so dentro de `varrer_prazos`.
    */
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(INSERIR, [orgA, aparelhoDeA, ocorrenciaDeA, "tarefa_nova", "entregue"]),
      ),
    ).rejects.toThrow();
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(INSERIR, [orgA, aparelhoDeA, ocorrenciaDeA, "prazo_vencendo", "pendente"]),
      ),
    ).rejects.toThrow();
  });

  it("enfileira a tarefa nova pendente para aparelho e ocorrencia do proprio municipio", async () => {
    // O caso positivo, sem o qual os tres de cima passariam por falta de GRANT.
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(INSERIR, [orgA, aparelhoDeA, ocorrenciaDeA, "tarefa_nova", "pendente"]),
      ),
    ).resolves.toBeDefined();

    const deA = await comoApp(orgA, (tx) =>
      tx.query<{ desfecho: string; tentativas: number }>(
        "SELECT desfecho, tentativas FROM notificacoes_enviadas WHERE ocorrencia_id = $1 AND tipo = 'tarefa_nova'",
        [ocorrenciaDeA],
      ),
    );
    expect(deA.rows).toHaveLength(1);
    expect(deA.rows[0]!.desfecho).toBe("pendente");
    expect(deA.rows[0]!.tentativas).toBe(0);

    const deB = await comoApp(orgB, (tx) =>
      tx.query("SELECT id FROM notificacoes_enviadas WHERE ocorrencia_id = $1", [ocorrenciaDeA]),
    );
    expect(deB.rows, "Vale Fundo enxergou o aviso de despacho de Serra Alta").toHaveLength(0);
  });

  it("a varredura de tarefa nova nao aceita municipio de quem chama e nao devolve dado de pessoa", async () => {
    const assinatura = await db.query<{ args: string; resultado: string }>(
      `SELECT pg_get_function_identity_arguments(p.oid) AS args,
              pg_get_function_result(p.oid) AS resultado
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'varrer_tarefas_novas'`,
    );
    expect(assinatura.rows, "a funcao varrer_tarefas_novas nao existe").toHaveLength(1);
    expect(
      assinatura.rows[0]!.args,
      "a varredura de tarefa nova aceita parametro de municipio, e com isso virou "
      + "uma porta para ler dado de um municipio escolhido por quem chama",
    ).not.toMatch(/uuid/);
    for (const proibido of ["solicitante", "descricao", "vulnerabilidade", "contato", "nome",
                            "protocolo", "endereco"]) {
      expect(
        assinatura.rows[0]!.resultado,
        `a varredura de tarefa nova devolve ${proibido}, e isso sai do pais na notificacao`,
      ).not.toContain(proibido);
    }
  });

  it("a varredura reivindica a pendente uma vez so, e a devolve com a ficha do aparelho", async () => {
    /*
      Sem contexto de municipio, como o relogio roda: e a funcao que precisa
      enxergar, nao o papel. A segunda chamada nao devolve nada, porque a
      linha ja esta reivindicada (`enviando`) e a espera ainda nao passou:
      duas maquinas do Fly nao mandam o mesmo despacho duas vezes.
    */
    const primeira = await comoApp(null, (tx) =>
      tx.query<{ notificacao_id: string; organizacao_id: string; ficha: string; plataforma: string }>(
        "SELECT * FROM varrer_tarefas_novas($1::interval, $2, $3)", ["10 minutes", 5, 500],
      ),
    );
    expect(primeira.rows).toHaveLength(1);
    expect(primeira.rows[0]!.organizacao_id).toBe(orgA);
    expect(primeira.rows[0]!.ficha).toBe("ficha-do-despacho-a");
    expect(primeira.rows[0]!.plataforma).toBe("android");

    const estado = await db.query<{ desfecho: string; tentativas: number }>(
      "SELECT desfecho, tentativas FROM notificacoes_enviadas WHERE id = $1",
      [primeira.rows[0]!.notificacao_id],
    );
    expect(estado.rows[0]!.desfecho).toBe("enviando");
    expect(estado.rows[0]!.tentativas).toBe(1);

    const segunda = await comoApp(null, (tx) =>
      tx.query("SELECT * FROM varrer_tarefas_novas($1::interval, $2, $3)", ["10 minutes", 5, 500]),
    );
    expect(segunda.rows).toHaveLength(0);
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

describe("O tipo a classificar, e ate onde ele pode ir", () => {
  /**
   * A migracao 019 abre a restricao de `ocorrencias.tipo` para aceitar
   * "outro", e o defeito que ela fecha era do tipo mais caro: o esquema
   * compartilhado aceitava o valor e o banco recusava. `POST /ocorrencias` com
   * tipo "outro" passava pelo Zod e morria no INSERT com SQLSTATE 23514, entao
   * o operador de plantao, com a pessoa na linha, recebia "erro inesperado,
   * informe o codigo ao suporte" em vez de uma frase dizendo o que corrigir.
   *
   * Este bloco trava as quatro coisas que fazem a abertura valer, e a quarta e
   * a regra de negocio de verdade: "outro" nao passa do despacho, porque a
   * taxonomia existe para o dado do municipio conversar com o sistema
   * nacional, e um chamado que fica "outro" para sempre e dado perdido.
   */
  async function abrir(
    protocolo: string, tipo: string, descricao: string | null, status = "registrada",
  ) {
    return comoApp(orgA, (tx) =>
      tx.query<{ id: string }>(
        `INSERT INTO ocorrencias
           (organizacao_id, protocolo, tipo, tipo_descricao, status, endereco,
            solicitante_nome, canal_entrada, descricao)
         VALUES ($1,$2,$3,$4,$5,'Rua do Morro, 12','Joana','telefone','Relato de teste')
         RETURNING id`,
        [orgA, protocolo, tipo, descricao, status],
      ),
    );
  }

  it("aceita o chamado que entrou sem classificacao, com o relato junto", async () => {
    const r = await abrir("000901/2026", "outro", "Queda de arvore sobre a via");
    expect(r.rows[0]!.id).toBeTruthy();
  });

  it("recusa 'outro' sem dizer o que foi relatado", async () => {
    // Sem esta linha a triagem abre um chamado que diz "Outro" e nada mais, e
    // a decisao tecnica que a triagem existe para tomar fica sem materia prima.
    await expect(
      abrir("000902/2026", "outro", null),
    ).rejects.toThrow(/tipo_a_classificar_exige_descricao/i);
  });

  it("recusa descricao pendurada em tipo da COBRADE", async () => {
    // Campo livre dentro de registro ja classificado vira lixeira de anotacao
    // paralela: alguem escreve, ninguem le, e ninguem sabe que existe.
    await expect(
      abrir("000903/2026", "deslizamento", "anotacao que nao cabe em lugar nenhum"),
    ).rejects.toThrow(/tipo_da_cobrade_nao_guarda_descricao/i);
  });

  it("recusa despachar equipe para chamado que continua 'outro'", async () => {
    /*
      O portao. Sem ele "outro" atravessa o fluxo inteiro ate o laudo, e o
      documento oficial sai com brasao, assinatura e a palavra "Outro" no campo
      do tipo. Depois que a equipe sai, ninguem volta para classificar.
    */
    const criada = await abrir("000904/2026", "outro", "Rompimento de adutora");
    await expect(
      comoApp(orgA, (tx) =>
        tx.query("UPDATE ocorrencias SET status = 'em_campo' WHERE id = $1",
          [criada.rows[0]!.id]),
      ),
    ).rejects.toThrow(/tipo_a_classificar_nao_passa_do_despacho/i);
  });

  it("encerrar sem nunca classificar continua permitido", async () => {
    /*
      A excecao do portao, e ela e deliberada. Chamado improcedente ("era poda
      de arvore, ja resolvido") e encerrado sem nunca ter sido classificado.
      Exigir COBRADE para encerrar produziria exatamente o dado falso que a
      migracao 019 existe para acabar: alguem escolheria o menos errado so para
      o sistema deixar fechar.
    */
    const criada = await abrir("000905/2026", "outro", "Muro do vizinho caiu");
    const fechada = await comoApp(orgA, (tx) =>
      tx.query<{ status: string }>(
        `UPDATE ocorrencias
            SET status = 'encerrada', encerrado_em = now(),
                motivo_encerramento = 'Improcedente: caso de zeladoria urbana'
          WHERE id = $1 RETURNING status`,
        [criada.rows[0]!.id],
      ),
    );
    expect(fechada.rows[0]!.status).toBe("encerrada");
  });

  it("reclassificar limpa a descricao e libera o despacho", async () => {
    // O caminho legitimo inteiro, para a correcao nao ter fechado junto o que
    // ela existe para permitir.
    const criada = await abrir("000906/2026", "outro", "Barranco cedeu nos fundos");
    const id = criada.rows[0]!.id;

    await comoApp(orgA, (tx) =>
      tx.query(
        "UPDATE ocorrencias SET tipo = 'deslizamento', tipo_descricao = NULL, status = 'triagem' WHERE id = $1",
        [id],
      ),
    );
    const despachada = await comoApp(orgA, (tx) =>
      tx.query<{ status: string }>(
        "UPDATE ocorrencias SET status = 'em_campo' WHERE id = $1 RETURNING status",
        [id],
      ),
    );
    expect(despachada.rows[0]!.status).toBe("em_campo");
  });
});

describe("Orgaos indicados pela vistoria", () => {
  /**
   * A migracao 020 cria a tabela que faltava. O envelope de sincronizacao ja
   * trazia `orgaosParaAcionar`, o Zod ja o validava, e o servidor descartava
   * por nao ter onde gravar: o laudo dizia "Necessario acionar outro orgao:
   * SIM" e calava QUAL.
   *
   * O que precisa ser provado aqui nao e que a tabela existe (a varredura de
   * RLS ja a alcanca sozinha), e sim que as DUAS chaves estrangeiras sao
   * compostas. Row Level Security nao governa verificacao de chave
   * estrangeira: o Postgres confere a linha referenciada com privilegio de
   * sistema, por baixo da policy. Com chave simples, uma vistoria de Serra
   * Alta indicaria um orgao de Vale Fundo e o laudo de um municipio sairia
   * nomeando o cadastro do outro, sem que nada no RLS reclamasse.
   */
  let vistoriaDeA: string;
  let orgaoDeA: string;
  let orgaoDeB: string;
  let vistoriaDeB: string;

  beforeAll(async () => {
    const ocorrenciaDeA = await db.query<{ id: string }>(
      "SELECT id FROM ocorrencias WHERE organizacao_id = $1 LIMIT 1", [orgA],
    );
    const va = await db.query<{ id: string }>(
      `INSERT INTO vistorias
         (organizacao_id, ocorrencia_id, checklist, assinante_nome, coletada_em, idempotency_key)
       VALUES ($1,$2,'[]'::jsonb,'Morador', now(), gen_random_uuid()) RETURNING id`,
      [orgA, ocorrenciaDeA.rows[0]!.id],
    );
    vistoriaDeA = va.rows[0]!.id;

    const vb = await db.query<{ id: string }>(
      `INSERT INTO vistorias
         (organizacao_id, ocorrencia_id, checklist, assinante_nome, coletada_em, idempotency_key)
       VALUES ($1,$2,'[]'::jsonb,'Morador do vizinho', now(), gen_random_uuid()) RETURNING id`,
      [orgB, ocorrenciaDeB],
    );
    vistoriaDeB = vb.rows[0]!.id;

    const ga = await db.query<{ id: string }>(
      "INSERT INTO orgaos (organizacao_id, nome, sigla) VALUES ($1,'Corpo de Bombeiros de Serra Alta','CBMSA') RETURNING id",
      [orgA],
    );
    orgaoDeA = ga.rows[0]!.id;
    const gb = await db.query<{ id: string }>(
      "INSERT INTO orgaos (organizacao_id, nome, sigla) VALUES ($1,'Corpo de Bombeiros de Vale Fundo','CBMVF') RETURNING id",
      [orgB],
    );
    orgaoDeB = gb.rows[0]!.id;
  });

  it("grava a indicacao do proprio municipio, do catalogo e por texto livre", async () => {
    /*
      Os dois caminhos numa vistoria so, de proposito: o catalogo e o campo
      livre convivem porque um aparelho novo, que nunca sincronizou, tem
      catalogo vazio, e um item OBRIGATORIO do checklist nao pode ficar sem
      resposta possivel justamente sem sinal.
    */
    const r = await comoApp(orgA, (tx) =>
      tx.query<{ n: string }>(
        `INSERT INTO vistoria_orgaos_indicados
           (organizacao_id, vistoria_id, orgao_id, nome, ordem)
         VALUES ($1,$2,$3,'Corpo de Bombeiros de Serra Alta',0),
                ($1,$2,NULL,'Associacao de moradores do Alto da Serra',1)
         RETURNING id::text AS n`,
        [orgA, vistoriaDeA, orgaoDeA],
      ),
    );
    expect(r.rows).toHaveLength(2);
  });

  it("nao indica orgao do catalogo de outro municipio", async () => {
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO vistoria_orgaos_indicados
             (organizacao_id, vistoria_id, orgao_id, nome)
           VALUES ($1,$2,$3,'Corpo de Bombeiros de Vale Fundo')`,
          [orgA, vistoriaDeA, orgaoDeB],
        ),
      ),
    ).rejects.toThrow();
  });

  it("nao pendura indicacao em vistoria de outro municipio", async () => {
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO vistoria_orgaos_indicados
             (organizacao_id, vistoria_id, orgao_id, nome)
           VALUES ($1,$2,NULL,'Defesa Civil estadual')`,
          [orgA, vistoriaDeB],
        ),
      ),
    ).rejects.toThrow();
  });

  it("o vizinho nao le as indicacoes de quem esta ao lado", async () => {
    const daqui = await comoApp(orgB, (tx) =>
      tx.query("SELECT id FROM vistoria_orgaos_indicados"),
    );
    expect(daqui.rows).toHaveLength(0);
  });

  it("o mesmo orgao do catalogo nao entra duas vezes na mesma vistoria", async () => {
    // Envelope reenviado com a lista repetida faria o laudo imprimir o mesmo
    // orgao duas vezes e a conta de acionamentos contar duas.
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO vistoria_orgaos_indicados
             (organizacao_id, vistoria_id, orgao_id, nome)
           VALUES ($1,$2,$3,'Corpo de Bombeiros de Serra Alta')`,
          [orgA, vistoriaDeA, orgaoDeA],
        ),
      ),
    ).rejects.toThrow(/orgao_do_catalogo_uma_vez_por_vistoria|duplicate key/i);
  });

  it("a coleta de campo nao se reescreve nem se apaga", async () => {
    /*
      Sem UPDATE e sem DELETE no papel de aplicacao, pela mesma razao da
      trilha: isto e o que o agente respondeu no local, embaixo da assinatura
      do morador. Correcao se faz com vistoria nova, nunca reescrevendo o que
      ele disse depois de o laudo ter saido.
    */
    for (const comando of [
      "UPDATE vistoria_orgaos_indicados SET nome = 'Outro orgao qualquer'",
      "DELETE FROM vistoria_orgaos_indicados",
    ]) {
      await expect(
        comoApp(orgA, (tx) => tx.query(comando)),
        `o papel de aplicacao conseguiu executar: ${comando}`,
      ).rejects.toThrow(/permission denied|permissao/i);
    }
  });
});

describe("Minimizacao por prazo e registro de consulta", () => {
  /**
   * A migracao 021 traz uma tabela nova e uma funcao privilegiada nova, e as
   * duas mexem com o assunto mais delicado do produto: a primeira registra
   * QUEM leu dado de cidadao, e a segunda APAGA dado de cidadao.
   *
   * Uma funcao que escreve sem contexto de municipio e uma porta no RLS, e
   * porta no RLS precisa de caso proprio no portao. O que este bloco prova e
   * que a porta e do tamanho da pergunta que ela responde: nao aceita
   * municipio de quem chama, nao aceita prazo de quem chama, e nao devolve
   * dado de pessoa.
   */
  let servidorDeA: string;
  let servidorDeB: string;
  let ocorrenciaDeA: string;
  let consultaDeB: string;

  beforeAll(async () => {
    const uA = await db.query<{ id: string }>(
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel)
       VALUES ($1,'Coordenadora de Serra Alta','SA-LGPD-1','lgpd.sa@exemplo.gov.br','coordenador')
       RETURNING id`,
      [orgA],
    );
    servidorDeA = uA.rows[0]!.id;

    const uB = await db.query<{ id: string }>(
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel)
       VALUES ($1,'Coordenador de Vale Fundo','VF-LGPD-1','lgpd.vf@exemplo.gov.br','coordenador')
       RETURNING id`,
      [orgB],
    );
    servidorDeB = uB.rows[0]!.id;

    const oc = await db.query<{ id: string }>(
      "SELECT id FROM ocorrencias WHERE organizacao_id = $1 LIMIT 1", [orgA],
    );
    ocorrenciaDeA = oc.rows[0]!.id;

    const k = await db.query<{ id: string }>(
      `INSERT INTO ocorrencia_consultas
         (organizacao_id, ocorrencia_id, usuario_id, usuario_nome, usuario_papel,
          recurso, finalidade)
       VALUES ($1,$2,$3,'Coordenador de Vale Fundo','coordenador',
               'ocorrencia_detalhe','atendimento')
       RETURNING id`,
      [orgB, ocorrenciaDeB, servidorDeB],
    );
    consultaDeB = k.rows[0]!.id;
  });

  it("nao le o registro de acesso do municipio vizinho", async () => {
    const r = await comoApp(orgA, (tx) =>
      tx.query("SELECT id FROM ocorrencia_consultas WHERE id = $1", [consultaDeB]),
    );
    expect(
      r.rows,
      "quem consultou o que no municipio ao lado ficou legivel: o registro de "
      + "acesso descreve o comportamento de servidores identificados",
    ).toHaveLength(0);
  });

  it("nao registra consulta apontando para ocorrencia de outro municipio", async () => {
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO ocorrencia_consultas
             (organizacao_id, ocorrencia_id, usuario_id, usuario_nome, usuario_papel,
              recurso, finalidade)
           VALUES ($1,$2,$3,'Coordenadora de Serra Alta','coordenador',
                   'ocorrencia_detalhe','atendimento')`,
          [orgA, ocorrenciaDeB, servidorDeA],
        ),
      ),
    ).rejects.toThrow();
  });

  it("nao registra consulta no nome de servidor de outro municipio", async () => {
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO ocorrencia_consultas
             (organizacao_id, ocorrencia_id, usuario_id, usuario_nome, usuario_papel,
              recurso, finalidade)
           VALUES ($1,$2,$3,'Coordenador de Vale Fundo','coordenador',
                   'ocorrencia_detalhe','atendimento')`,
          [orgA, ocorrenciaDeA, servidorDeB],
        ),
      ),
    ).rejects.toThrow();
  });

  it("nao carimba o registro com o id de outro municipio", async () => {
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO ocorrencia_consultas
             (organizacao_id, ocorrencia_id, usuario_id, usuario_nome, usuario_papel,
              recurso, finalidade)
           VALUES ($1,$2,$3,'Coordenador de Vale Fundo','coordenador',
                   'ocorrencia_detalhe','atendimento')`,
          [orgB, ocorrenciaDeB, servidorDeB],
        ),
      ),
    ).rejects.toThrow();
  });

  it("o registro de acesso nao se reescreve nem se apaga", async () => {
    /*
      Um registro de acesso que quem acessou consegue apagar nao e registro de
      acesso. Append-only pelo mesmo mecanismo da trilha: ausencia de policy de
      UPDATE e de DELETE, com RLS forcada.
    */
    for (const comando of [
      "UPDATE ocorrencia_consultas SET usuario_nome = 'Outra pessoa'",
      "DELETE FROM ocorrencia_consultas",
    ]) {
      await expect(
        comoApp(orgB, (tx) => tx.query(comando)),
        `o papel de aplicacao conseguiu executar: ${comando}`,
      ).rejects.toThrow(/permission denied|permissao|policy/i);
    }
  });

  it("nao le nem altera o prazo de retencao do municipio vizinho", async () => {
    /*
      O prazo e a decisao do CONTROLADOR sobre o dia em que o dado de um
      cidadao e destruido. Alcancar a coluna do vizinho seria decidir isso no
      lugar dele.
    */
    await comoApp(orgA, (tx) =>
      tx.query("UPDATE organizacoes SET retencao_solicitante_dias = 1"),
    );
    const doVizinho = await db.query<{ dias: number | null }>(
      "SELECT retencao_solicitante_dias AS dias FROM organizacoes WHERE id = $1",
      [orgB],
    );
    expect(doVizinho.rows[0]!.dias).toBeNull();

    // E de volta ao estado anterior, para nao mudar o mundo dos outros casos.
    await db.query(
      "UPDATE organizacoes SET retencao_solicitante_dias = NULL WHERE id = $1", [orgA],
    );
  });

  it("a minimizacao nao aceita municipio nem prazo de quem chama", async () => {
    const assinatura = await db.query<{ args: string }>(
      `SELECT pg_get_function_identity_arguments(p.oid) AS args
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'minimizar_por_prazo'`,
    );
    expect(assinatura.rows).toHaveLength(1);
    expect(
      assinatura.rows[0]!.args,
      "a minimizacao passou a aceitar municipio, e virou uma porta para "
      + "escrever em municipio escolhido por quem chama",
    ).not.toMatch(/uuid/);
    expect(
      assinatura.rows[0]!.args,
      "a minimizacao passou a aceitar prazo de fora, e com isso quem chama "
      + "decide o dia da destruicao do dado, no lugar do controlador",
    ).not.toMatch(/interval/);
  });

  it("a minimizacao nao devolve dado de pessoa", async () => {
    const saida = await db.query<{ resultado: string }>(
      `SELECT pg_get_function_result(p.oid) AS resultado
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'minimizar_por_prazo'`,
    );
    for (const proibido of ["solicitante", "contato", "endereco", "descricao"]) {
      expect(
        saida.rows[0]!.resultado,
        `a minimizacao passou a devolver ${proibido}, e o que ela apaga voltaria pelo log`,
      ).not.toContain(proibido);
    }
  });

  it("nem PUBLIC nem uma conta qualquer executa a minimizacao", async () => {
    const r = await db.query<{ tem: boolean }>(
      `SELECT has_function_privilege('public', p.oid, 'EXECUTE') AS tem
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'minimizar_por_prazo'`,
    );
    expect(
      r.rows[0]!.tem,
      "a funcao que apaga dado de cidadao ficou executavel por PUBLIC",
    ).toBe(false);
  });
});

/**
 * O segundo fator (migracao 022), do lado do banco.
 *
 * Os portoes que DESCOBREM tabela em `pg_tables` ja cobram RLS, coluna de
 * municipio, policy amarrada no contexto e chave estrangeira composta destas
 * duas tabelas novas, sozinhos. O que este bloco acrescenta e o que so vale
 * para elas: um segredo de segundo fator nunca entra em texto, um codigo de
 * recuperacao nunca entra em texto, desligar apaga o segredo em vez de deixar
 * a credencial viva com a protecao desligada, e nada disso se apaga.
 *
 * O caso de isolamento proprio esta aqui e nao la em cima por proximidade: e
 * mais util ler "o municipio A nao alcanca o segundo fator de B" ao lado das
 * restricoes que descrevem a mesma tabela.
 */
describe("Segundo fator", () => {
  /** SHA-256 em base64url tem 43 caracteres, que e o que o CHECK cobra. */
  const RESUMO = "a".repeat(43);
  const ENVELOPE = "v1.dmV0b3I.c2Vsbw.Y2lmcmFkbw";

  let usuarioDeA: string;
  let usuarioDeB: string;

  beforeAll(async () => {
    const criar = async (org: string, email: string) => {
      const r = await db.query<{ id: string }>(
        `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel)
         VALUES ($1,'Helena Vasques Coutinho','M-2201',$2,'administrador')
         RETURNING id`,
        [org, email],
      );
      return r.rows[0]!.id;
    };
    usuarioDeA = await criar(orgA, "helena@serraalta.exemplo.gov.br");
    usuarioDeB = await criar(orgB, "helena@valefundo.exemplo.gov.br");

    for (const [org, usuario] of [[orgA, usuarioDeA], [orgB, usuarioDeB]] as const) {
      await db.query(
        `INSERT INTO segundo_fator (organizacao_id, usuario_id, segredo_cifrado, confirmado_em)
         VALUES ($1,$2,$3, now())`,
        [org, usuario, ENVELOPE],
      );
    }
  });

  it("um municipio nao alcanca o segundo fator do outro, nem pelo id exato", async () => {
    const lido = await comoApp(orgA, (tx) =>
      tx.query("SELECT usuario_id FROM segundo_fator WHERE usuario_id = $1", [usuarioDeB]),
    );
    expect(
      lido.rows,
      "o municipio A leu a linha de segundo fator de uma conta do municipio B",
    ).toHaveLength(0);

    // E nao desliga o segundo fator de quem nao e dele, que seria o ataque
    // util: derrubar a protecao da conta alheia antes de tentar a senha.
    await comoApp(orgA, (tx) =>
      tx.query(
        "UPDATE segundo_fator SET desativado_em = now(), segredo_cifrado = NULL WHERE usuario_id = $1",
        [usuarioDeB],
      ),
    );
    const conferencia = await db.query<{ desativado_em: string | null }>(
      "SELECT desativado_em FROM segundo_fator WHERE usuario_id = $1",
      [usuarioDeB],
    );
    expect(
      conferencia.rows[0]!.desativado_em,
      "o municipio A desligou o segundo fator de uma conta do municipio B",
    ).toBeNull();
  });

  it("recusa o segredo do TOTP gravado em texto", async () => {
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          `UPDATE segundo_fator SET segredo_cifrado = 'JBSWY3DPEHPK3PXP'
            WHERE usuario_id = $1`,
          [usuarioDeA],
        ),
      ),
      "o banco aceitou o segredo do segundo fator em texto puro: um vazamento "
      + "de banco passaria a devolver o segundo fator junto",
    ).rejects.toThrow(/segredo_vem_cifrado/i);
  });

  it("recusa desligar o segundo fator deixando o segredo guardado", async () => {
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          "UPDATE segundo_fator SET desativado_em = now() WHERE usuario_id = $1",
          [usuarioDeA],
        ),
      ),
      "o banco aceitou protecao desligada com a credencial ainda dentro, que e "
      + "o risco de guardar sem o beneficio de exigir",
    ).rejects.toThrow(/segredo_coerente_com_a_situacao/i);
  });

  it("recusa o codigo de recuperacao gravado em texto", async () => {
    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO segundo_fator_recuperacao (organizacao_id, usuario_id, codigo_hash)
           VALUES ($1,$2,'k4mp-7rqs-2xtv-9bdh')`,
          [orgA, usuarioDeA],
        ),
      ),
    ).rejects.toThrow(/codigo_guardado_como_resumo/i);
  });

  it("guarda o codigo como resumo e recusa apagar o que ja foi gasto", async () => {
    await comoApp(orgA, (tx) =>
      tx.query(
        `INSERT INTO segundo_fator_recuperacao (organizacao_id, usuario_id, codigo_hash, usado_em)
         VALUES ($1,$2,$3, now())`,
        [orgA, usuarioDeA, RESUMO],
      ),
    );

    /*
      Sem policy de DELETE, e a ausencia e o que sustenta a frase da tela
      ("voce ainda tem N codigos"): se o codigo gasto sumisse, ninguem
      distinguiria "eu usei tres" de "alguem usou tres por mim".
    */
    await expect(
      comoApp(orgA, (tx) =>
        tx.query("DELETE FROM segundo_fator_recuperacao WHERE usuario_id = $1", [usuarioDeA]),
      ),
    ).rejects.toThrow();

    // E a linha do segundo fator tambem nao se apaga: "desde quando esta conta
    // parou de exigir o segundo fator" precisa continuar tendo resposta.
    await expect(
      comoApp(orgA, (tx) =>
        tx.query("DELETE FROM segundo_fator WHERE usuario_id = $1", [usuarioDeA]),
      ),
    ).rejects.toThrow();
  });
});

/* =====================================================================
 * A ASSERCAO UNIVERSAL DE PRIVILEGIO (ADR 0008, decisao 3).
 *
 * Os portoes de cima descobrem as tabelas no catalogo e cobram RLS, policy e
 * `organizacao_id` de cada uma. Falta a outra metade da mesma pergunta: QUEM
 * TEM PRIVILEGIO nelas. RLS so vale contra quem tem permissao de chegar na
 * tabela; um papel novo com SELECT direto responde a policy com o proprio
 * contexto, e um papel com BYPASSRLS nem isso.
 *
 * A frase que este bloco afirma e uma so: nenhum papel do banco, alem do papel
 * de aplicacao e do dono das tabelas, tem privilegio em tabela de negocio. A
 * unica excecao esta escrita na ADR 0008 e e conferida aqui uma a uma: o papel
 * do console, com SELECT, e so na tabela de metricas, no cadastro de
 * organizacoes e na visao que junta as duas.
 *
 * UNIVERSAL, e nao lista de nomes: as tabelas vem do catalogo. A lista a uma
 * vale para as tabelas de hoje; a assercao vale para a tabela que alguem criar
 * amanha sem lembrar desta regra.
 * ===================================================================== */
describe("Nenhum papel alem do de aplicacao e do dono tem privilegio", () => {
  type Achado = {
    relacao: string;
    detalhe: string | null;
    especie: string;
    papel: string;
    privilegio: string;
    caminho: string;
  };

  /**
   * Os seis caminhos por onde privilegio chega, num lugar so.
   *
   * Cada um deles ja foi, em algum banco de alguem, o caminho esquecido:
   *
   * 1. concessao direta, o obvio;
   * 2. privilegio de COLUNA, que passa por fora de `role_table_grants` e por
   *    isso e o mais facil de esquecer (este banco tem um hoje, em
   *    `oficio_envios`, e ele e o que ancora esta varredura);
   * 3. heranca de papel: papel sem concessao propria que herda de quem tem;
   * 4. `PUBLIC`, que concede a todo mundo de uma vez e nao aparece como papel
   *    nomeado em lista nenhuma;
   * 5. VISAO sobre tabela de negocio, porque visao com privilegio dribla a
   *    concessao da tabela;
   * 6. funcao `SECURITY DEFINER`, porque ela roda com os privilegios do dono.
   *
   * E, no fim, o caminho que nao depende de eu ter lembrado dos outros seis: o
   * proprio banco respondendo `has_table_privilege`, que ja soma concessao
   * direta, `PUBLIC` e heranca. Ele existe porque as duas primeiras consultas
   * saem de `information_schema`, e as visoes de `information_schema` so
   * mostram concessao em que quem consulta e parte interessada. Se um dia este
   * teste rodar com um papel que nao enxerga tudo, e o `has_table_privilege`
   * que continua respondendo a verdade.
   */
  async function varredura(): Promise<Achado[]> {
    const r = await db.query<Achado>(`
      WITH RECURSIVE
      /* 5: o que cada visao alcanca, inclusive visao sobre visao. */
      alcance_da_visao AS (
        SELECT v.oid AS visao, d.refobjid AS alvo
          FROM pg_class v
          JOIN pg_rewrite w ON w.ev_class = v.oid
          JOIN pg_depend d ON d.objid = w.oid
                          AND d.classid = 'pg_rewrite'::regclass
                          AND d.refclassid = 'pg_class'::regclass
                          AND d.refobjid <> v.oid
         WHERE v.relkind IN ('v','m') AND v.relnamespace = 'public'::regnamespace
        UNION
        SELECT a.visao, d.refobjid
          FROM alcance_da_visao a
          JOIN pg_rewrite w ON w.ev_class = a.alvo
          JOIN pg_depend d ON d.objid = w.oid
                          AND d.classid = 'pg_rewrite'::regclass
                          AND d.refclassid = 'pg_class'::regclass
                          AND d.refobjid <> a.alvo
      ),
      /* 3: heranca, inclusive indireta (A membro de B, B membro de C). */
      membros AS (
        SELECT m.member AS membro, m.roleid AS ancestral
          FROM pg_auth_members m
        UNION
        SELECT x.membro, m.roleid
          FROM membros x
          JOIN pg_auth_members m ON m.member = x.ancestral
      ),
      /* 1 e 4: concessao direta, com PUBLIC aparecendo como grantee. */
      direta AS (
        SELECT g.table_name::text AS relacao,
               NULL::text AS detalhe,
               'tabela'::text AS especie,
               g.grantee::text AS papel,
               g.privilege_type::text AS privilegio,
               CASE WHEN g.grantee = 'PUBLIC'
                    THEN 'concessao a PUBLIC'
                    ELSE 'concessao direta' END AS caminho
          FROM information_schema.role_table_grants g
         WHERE g.table_schema = 'public'
      ),
      /*
        2: privilegio de coluna, e SO o que nao aparece no de cima.

        column_privileges tambem repete, coluna a coluna, tudo que foi
        concedido na tabela inteira. Trazer isso junto encheria a varredura de
        milhares de linhas repetidas e esconderia justamente o caso que
        importa: o GRANT feito em coluna, que nao aparece em
        role_table_grants nenhuma.
      */
      por_coluna AS (
        SELECT c.table_name::text,
               c.column_name::text,
               'coluna'::text,
               c.grantee::text,
               c.privilege_type::text,
               'privilegio de coluna'::text
          FROM information_schema.column_privileges c
         WHERE c.table_schema = 'public'
           AND NOT EXISTS (
             SELECT 1 FROM information_schema.role_table_grants g
              WHERE g.table_schema = 'public'
                AND g.table_name = c.table_name
                AND g.grantee = c.grantee
                AND g.privilege_type = c.privilege_type)
      ),
      por_heranca AS (
        SELECT t.relname::text,
               NULL::text,
               'tabela'::text,
               m.membro::regrole::text,
               x.privilege_type::text,
               'heranca do papel ' || m.ancestral::regrole::text
          FROM membros m
          JOIN pg_class t ON t.relnamespace = 'public'::regnamespace
                         AND t.relkind IN ('r','p')
          CROSS JOIN LATERAL aclexplode(t.relacl) x
         WHERE x.grantee = m.ancestral
      ),
      por_visao AS (
        SELECT DISTINCT
               a.visao::regclass::text,
               NULL::text,
               'visao'::text,
               COALESCE(r.rolname::text, 'PUBLIC'),
               x.privilege_type::text,
               'visao que alcanca ' || a.alvo::regclass::text
          FROM alcance_da_visao a
          JOIN pg_class v ON v.oid = a.visao
          JOIN pg_class alvo ON alvo.oid = a.alvo AND alvo.relkind IN ('r','p')
          CROSS JOIN LATERAL aclexplode(v.relacl) x
          LEFT JOIN pg_roles r ON r.oid = x.grantee
      ),
      /*
        6: acldefault no lugar de proacl quando ela e nula, porque nula
        significa "privilegio padrao", e o padrao do Postgres para funcao e
        EXECUTE para PUBLIC. Ler proacl cru deixaria a funcao mais aberta que
        existe passar como se nao tivesse concessao nenhuma.
      */
      por_funcao AS (
        SELECT p.proname::text || '()',
               NULL::text,
               'funcao'::text,
               COALESCE(r.rolname::text, 'PUBLIC'),
               x.privilege_type::text,
               'funcao SECURITY DEFINER'::text
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) x
          LEFT JOIN pg_roles r ON r.oid = x.grantee
         WHERE n.nspname = 'public' AND p.prosecdef
      ),
      /*
        O caminho que nao depende de memoria: o proprio banco respondendo se
        aquele papel pode. Os papeis pg_* sao os predefinidos do Postgres, e
        ficam de fora porque pg_read_all_data responde "sim" para toda tabela
        por definicao. Isso nao e brecha: se alguem tornar um papel do produto
        membro dele, e o papel do produto que aparece aqui com o "sim".
      */
      efetivo AS (
        SELECT t.relname::text,
               NULL::text,
               CASE WHEN t.relkind IN ('v','m') THEN 'visao' ELSE 'tabela' END,
               r.rolname::text,
               p.privilegio::text,
               'privilegio efetivo, venha ele de onde vier'::text
          FROM pg_class t
          CROSS JOIN pg_roles r
          CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE',
                                  'TRUNCATE','REFERENCES','TRIGGER']) AS p(privilegio)
         WHERE t.relnamespace = 'public'::regnamespace
           AND t.relkind IN ('r','p','v','m')
           AND r.rolname NOT LIKE 'pg\\_%'
           AND has_table_privilege(r.oid, t.oid, p.privilegio)
      )
      SELECT * FROM direta
      UNION ALL SELECT * FROM por_coluna
      UNION ALL SELECT * FROM por_heranca
      UNION ALL SELECT * FROM por_visao
      UNION ALL SELECT * FROM por_funcao
      UNION ALL SELECT * FROM efetivo
    `);
    return r.rows;
  }

  /** O dono das tabelas, perguntado ao catalogo e nunca escrito a mao. */
  async function dono(): Promise<string> {
    const r = await db.query<{ tableowner: string }>(
      "SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname = 'public'",
    );
    expect(r.rows.length, "mais de um dono no schema public").toBe(1);
    return r.rows[0]!.tableowner;
  }

  /**
   * A UNICA excecao, e ela esta na decisao 3 da ADR 0008.
   *
   * Duas tabelas e a visao que junta as duas, so SELECT. A visao entra porque
   * sem ela o console nao distinguiria "municipio parado" de "municipio que
   * nao escreveu", e ela e segura pela mesma razao que as outras duas: nao
   * alcanca tabela nenhuma alem delas, e isso e cobrado logo aqui embaixo.
   */
  const O_CONSOLE_LE = new Set([
    "metricas_municipio",
    "organizacoes",
    "console_situacao_dos_municipios",
  ]);

  /**
   * A TERCEIRA exceção (migração 038): as duas tabelas DO FORNECEDOR, onde o
   * console também ESCREVE.
   *
   * Nenhuma das duas guarda dado de município. `console_operadores` são as
   * contas de quem opera a plataforma (email, hash de senha, envelope do
   * segundo fator, papel), e saem da configuração do processo para o banco
   * porque o dono pediu tela de usuários e troca de senha. Ninguém além do
   * console as lê. `eliminacoes_de_municipio` é o livro de eliminações: id,
   * nome e UF do município (que o console já lê em `organizacoes`), o email do
   * operador que pediu, o motivo, as datas de cada fase e as contagens do que
   * saiu. Ele existe para SOBREVIVER ao município, e por isso não tem chave
   * estrangeira.
   *
   * O que o console pode em cada uma está escrito por privilégio, e não como
   * "tudo": SELECT e INSERT nas duas, UPDATE inteiro nos operadores (troca de
   * senha, desativação, contador de falhas) e UPDATE só nas DUAS COLUNAS de
   * cancelamento no livro. Um privilégio a mais reprova até alguém escrevê-lo
   * aqui. O caso-irmão (o operador não altera o dono, o operador não agenda, o
   * console não apaga nada, o livro escrito por fora não aciona o relógio)
   * está em `db/test/eliminacao-de-municipio.test.ts`.
   *
   * A QUARTA (migração 039): `console_codigos_de_recuperacao`, os códigos de
   * recuperação de senha desses mesmos operadores, guardados como hash. O
   * console lê e insere (só os próprios, pela policy amarrada ao operador da
   * sessão) e NÃO tem UPDATE nem DELETE: marcar um código como usado é ato das
   * funções da 039, e código gasto fica marcado. Os dois privilégios que
   * faltam são cobrados como buraco nos casos 10 e 11 da varredura, mais
   * abaixo. O caso-irmão (operador não vê nem insere código de outro, o
   * console não marca usado nem apaga) está em
   * `db/test/recuperacao-do-console.test.ts`.
   */
  const O_CONSOLE_ALCANCA = new Map<string, Set<string>>([
    ["console_operadores", new Set(["SELECT", "INSERT", "UPDATE"])],
    ["eliminacoes_de_municipio", new Set(["SELECT", "INSERT"])],
    ["console_codigos_de_recuperacao", new Set(["SELECT", "INSERT"])],
  ]);
  const O_CONSOLE_ALCANCA_POR_COLUNA = new Map<string, Set<string>>([
    ["eliminacoes_de_municipio", new Set(["cancelada_em:UPDATE", "cancelada_por_email:UPDATE"])],
  ]);

  /**
   * A SEGUNDA excecao, e ela e de OUTRA natureza: uma porta de ESCRITA.
   *
   * A de cima (O_CONSOLE_LE) e leitura de numero agregado. Esta e o direito de
   * EXECUTAR uma funcao, e nenhuma linha de tabela vem com ela.
   *
   * POR QUE ELA EXISTE. Cadastrar prefeitura so existia como comando de linha
   * rodado com a credencial de dono do banco, a mesma que aplica migracao. A
   * ADR 0008 ja tinha escrito o que lacuna de ferramenta produz: a operacao nao
   * some, ela vai para o caminho mais perigoso. A alternativa seria dar INSERT
   * em `organizacoes` e `usuarios` ao papel do console, e ai a decisao 3 da ADR
   * 0008 cairia inteira: com INSERT em `usuarios`, o console cria um
   * administrador dentro de um municipio que JA EXISTE e entra no painel dele.
   *
   * POR QUE ELA NAO REABRE O QUE A ASSERCAO FECHA. Porque a funcao nao e uma
   * consulta com outro nome, e isso e cobrado caso a caso no bloco "A porta de
   * criar municipio, e por que ela nao serve para ler", mais abaixo: a saida
   * sao dois uuid recem-criados, nenhum parametro vira filtro, o corpo nao
   * nomeia tabela de negocio nenhuma alem das tres que ele escreve, e o papel
   * do console continua sem UM privilegio em tabela nenhuma depois de usa-la.
   *
   * Uma segunda funcao concedida ao console reprova aqui ate alguem escrever o
   * nome dela nesta lista, e escrever o nome de uma funcao aqui e uma decisao
   * que aparece na revisao. E isso que separa excecao de buraco.
   */
  const O_CONSOLE_EXECUTA = new Set([
    "provisionar_municipio()",
    /*
      Os quatro atos de intenção da migração 038, e só eles. As duas funções
      do relógio (`executar_eliminacoes_vencidas`, `concluir_eliminacao`) NÃO
      estão aqui de propósito: o console não executa o irreversível, e uma
      concessão delas ao console reprova neste portão.
    */
    "console_suspender_municipio()",
    "console_reativar_municipio()",
    "console_agendar_eliminacao()",
    "console_cancelar_eliminacao()",
    /*
      As três da recuperação de senha do console (migração 039). Nenhuma toca
      tabela de município: as três leem e escrevem só `console_operadores` e
      `console_codigos_de_recuperacao`, as tabelas do fornecedor. A por email
      é a única sem sessão que devolve hash, e devolve o do CÓDIGO, nunca o
      da senha; a de consumir é a única que reescreve `senha_hash` e
      `segundo_fator` de um operador sem ser ele mesmo, e só com um código
      vivo. Ver o teto de funções privilegiadas, acima, e
      `db/test/recuperacao-do-console.test.ts`.
    */
    "console_renovar_codigos()",
    "console_recuperacao_por_email()",
    "console_consumir_recuperacao()",
  ]);

  async function sobras(): Promise<Achado[]> {
    // A varredura e cada chamada ao PGlite seguem por microtarefas, sem ceder ao
    // laço de eventos (ver `cederOLaco`); este caso faz 23 delas em serie.
    await cederOLaco();
    const donoAtual = await dono();
    return (await varredura()).filter((a) => {
      if (a.papel === donoAtual || a.papel === "dc360_app") return false;
      if (a.papel === "dc360_console") {
        if (a.especie === "funcao") {
          return !(a.privilegio === "EXECUTE" && O_CONSOLE_EXECUTA.has(a.relacao));
        }
        if (a.especie === "coluna") {
          return !O_CONSOLE_ALCANCA_POR_COLUNA.get(a.relacao)?.has(`${a.detalhe}:${a.privilegio}`);
        }
        if (O_CONSOLE_ALCANCA.get(a.relacao)?.has(a.privilegio)) return false;
        return !(a.privilegio === "SELECT" && O_CONSOLE_LE.has(a.relacao));
      }
      return true;
    });
  }

  function descrever(achados: Achado[]): string {
    return achados
      .map((a) => `${a.papel} tem ${a.privilegio} em ${a.relacao}` +
                  `${a.detalhe ? "." + a.detalhe : ""} (${a.caminho})`)
      .join("; ");
  }

  /**
   * A ANCORA, e ela nao e opcional.
   *
   * Uma consulta de catalogo com erro de nome de coluna devolve vazio, e vazio
   * passa verde numa assercao de "ninguem mais tem": o teste fica lindo e nao
   * verifica nada. Este projeto ja teve dois testes assim na mesma semana.
   *
   * Entao, antes de afirmar que ninguem mais tem, este caso afirma que a
   * varredura ENXERGA quem tem: o papel de aplicacao, nas tabelas conhecidas,
   * por cada um dos caminhos que existem hoje no banco.
   */
  it("a varredura enxerga o papel de aplicacao onde ele realmente tem privilegio", async () => {
    const tudo = await varredura();
    expect(tudo.length, "a varredura voltou vazia: ela quebrou, nao o banco").toBeGreaterThan(100);

    const doApp = tudo.filter((a) => a.papel === "dc360_app");

    const tabelasVistas = new Set(
      doApp.filter((a) => a.caminho === "concessao direta").map((a) => a.relacao),
    );
    expect(
      tabelasVistas.size,
      "a varredura de concessao direta nao achou o papel de aplicacao nas tabelas " +
      "que a migracao 001 concede a ele",
    ).toBeGreaterThanOrEqual(15);
    for (const conhecida of ["ocorrencias", "vistorias", "trilha_eventos", "metricas_municipio"]) {
      expect(
        tabelasVistas.has(conhecida),
        `a varredura nao viu o privilegio que o papel de aplicacao tem em ${conhecida}`,
      ).toBe(true);
    }

    /*
      A ancora do caminho mais facil de esquecer. A migracao 017 concede UPDATE
      em DUAS COLUNAS de `oficio_envios`, e nao na tabela: se a varredura de
      coluna estiver quebrada, e exatamente este privilegio que some da tela
      sem ninguem notar.

      A 027 acrescentou a TERCEIRA, `provedor_id`, e pela mesma porta: o recibo
      que o provedor de email devolve chega DEPOIS da linha existir (a linha
      nasce antes da chamada ao provedor, de proposito), entao ele precisa de
      UPDATE, e entra nomeado em vez de virar GRANT UPDATE na tabela. Tudo o
      mais da linha (para quem foi, quando, quem pediu, o hash do token) e
      registro do ato e continua sem poder ser reescrito por rota nenhuma.

      A 029 traz as DUAS ultimas, em `devolucoes_de_tarefa`, pela mesma
      decisao: a minimizacao por prazo precisa descartar a observacao em texto
      livre que o agente escreveu na rua (ela pode nomear um morador), e nada
      mais daquela linha pode ser reescrito. Motivo, prazo perdido, equipe e
      autoria sao o registro de que uma equipe nao chegou no imovel, e um
      GRANT UPDATE na tabela deixaria uma rota futura reescrever isso sem que
      ninguem percebesse.

      A 031 traz as SEIS de `saidas_a_campo`, e ali a lista de colunas E a
      regra de negocio escrita no catalogo do banco. O que pode mudar depois de
      gravado: o prazo corrente e o contador (pela prorrogacao) e o bloco de
      encerramento. O que nunca muda: quem saiu, para onde, quando, se estava
      sozinho, a duracao declarada e o PRAZO INICIAL. Sem privilegio de coluna,
      uma rota nova poderia reescrever o prazo inicial de uma saida vencida e
      fazer o atraso de um agente que nao desceu do morro desaparecer da tela
      sem deixar rastro.

      A 035 traz QUATRO em `objetos_orfaos`, e ali a lista de colunas separa o
      que a varredura VIU do que uma pessoa DECIDIU. A varredura escreve a linha
      inteira e nunca mais a toca; o unico UPDATE que existe e o bloco da
      decisao, escrito pelo descarte deliberado, com operador nomeado e motivo.
      Sem privilegio de coluna, um caminho novo poderia reescrever a especie ou
      o tamanho de um objeto listado e fazer uma fotografia em uso parecer lixo
      na lista que alguem vai autorizar a apagar.

      A 032 traz a SETIMA de `saidas_a_campo`, `prorrogacao_key`, pela mesma decisao: a rota de
      prorrogar precisa gravar a chave de idempotencia do pedido para o REENVIO
      (a resposta se perde no sinal ruim do morro e o aparelho repete) nao contar
      a prorrogacao duas vezes nem escrever dois eventos numa trilha que nao se
      corrige. Ela entra nomeada, e nao como GRANT UPDATE na tabela, pelo mesmo
      motivo das seis de cima.
    */
    const colunas = doApp.filter((a) => a.especie === "coluna");
    expect(
      colunas.map((a) => `${a.relacao}.${a.detalhe}:${a.privilegio}`).sort(),
      "a varredura de privilegio de coluna nao enxergou o GRANT UPDATE por coluna que " +
      "as migracoes 017 (desfecho, detalhe), 027 (provedor_id), 029 (observacao), " +
      "031 (o bloco de encerramento da saida a campo), 032 (a chave da " +
      "prorrogacao) e 035 (a decisao sobre o objeto orfao) fazem",
    ).toEqual([
      "devolucoes_de_tarefa.observacao:UPDATE",
      "devolucoes_de_tarefa.observacao_removida_em:UPDATE",
      "objetos_orfaos.decidido_em:UPDATE",
      "objetos_orfaos.decidido_por:UPDATE",
      "objetos_orfaos.decisao:UPDATE",
      "objetos_orfaos.decisao_motivo:UPDATE",
      "oficio_envios.desfecho:UPDATE",
      "oficio_envios.detalhe:UPDATE",
      "oficio_envios.provedor_id:UPDATE",
      "saidas_a_campo.desfecho:UPDATE",
      "saidas_a_campo.encerrada_em:UPDATE",
      "saidas_a_campo.encerrada_por:UPDATE",
      "saidas_a_campo.observacao:UPDATE",
      "saidas_a_campo.prorrogacao_key:UPDATE",
      "saidas_a_campo.prorrogacoes:UPDATE",
      "saidas_a_campo.retorno_previsto_em:UPDATE",
    ]);

    // E a ancora do caminho das funcoes privilegiadas.
    const funcoes = new Set(doApp.filter((a) => a.especie === "funcao").map((a) => a.relacao));
    expect(
      funcoes.size,
      "a varredura nao enxergou o EXECUTE que o papel de aplicacao tem nas funcoes " +
      "SECURITY DEFINER",
    ).toBeGreaterThanOrEqual(10);
    expect(funcoes.has("credenciais_para_login()")).toBe(true);

    // E a do caminho das visoes.
    const visoes = new Set(tudo.filter((a) => a.especie === "visao").map((a) => a.relacao));
    expect(
      visoes.has("console_situacao_dos_municipios"),
      "a varredura de visao nao enxergou a unica visao que o schema tem hoje",
    ).toBe(true);
  });

  it("nenhum papel alem do de aplicacao e do dono tem privilegio em tabela de negocio", async () => {
    const restou = await sobras();
    expect(
      restou.length,
      "papel com privilegio fora do permitido: " + descrever(restou),
    ).toBe(0);
  });

  it("nenhum papel do produto e superusuario ou ignora RLS", async () => {
    /*
      Universal pelo mesmo motivo do resto: pergunta ao catalogo quais papeis
      existem, em vez de conferir os que eu lembrei de escrever. Um papel novo
      criado com BYPASSRLS reprova aqui no dia em que a migracao dele entrar.
    */
    const donoAtual = await dono();
    const r = await db.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles
        WHERE rolname NOT LIKE 'pg\\_%' AND rolname <> $1`,
      [donoAtual],
    );
    expect(r.rows.length, "nenhum papel de produto encontrado: a consulta quebrou").toBeGreaterThan(0);
    for (const papel of r.rows) {
      expect(papel.rolsuper, `${papel.rolname} e superusuario`).toBe(false);
      expect(
        papel.rolbypassrls,
        `${papel.rolname} tem BYPASSRLS, e com isso o isolamento inteiro vira enfeite`,
      ).toBe(false);
    }
  });

  /**
   * A prova de que a varredura ACHA cada um dos seis caminhos, e de que as
   * excecoes da 038 tem limite.
   *
   * A ancora de cima mostra que ela ve o que existe. Este caso mostra o
   * contrario, que e o que de fato importa: que ela ACUSA o que nao deveria
   * existir, caminho por caminho. Cada bloco abre a porta, confere que o
   * portao gritou, e fecha a porta no `finally`.
   *
   * Sem isto, cinco dos seis ramos da consulta poderiam estar escritos errado
   * e o teste continuaria verde para sempre, porque o banco correto nao produz
   * linha nenhuma neles.
   */
  it("a varredura acusa cada um dos seis caminhos de privilegio", async () => {
    expect((await sobras()).length, "o banco ja comeca sujo").toBe(0);

    async function comOBuraco(abrir: string, fechar: string, esperado: RegExp, oQueSeriaVazado: string) {
      await db.exec(abrir);
      try {
        const achados = await sobras();
        expect(
          achados.length,
          `a varredura NAO acusou "${abrir}". ${oQueSeriaVazado}`,
        ).toBeGreaterThan(0);
        expect(
          achados.some((a) => esperado.test(a.caminho)),
          `a varredura acusou "${abrir}", mas por outro caminho: ${descrever(achados)}`,
        ).toBe(true);
      } finally {
        await db.exec(fechar);
      }
      expect(
        (await sobras()).length,
        `a limpeza de "${abrir}" nao desfez o buraco`,
      ).toBe(0);
    }

    // 1. Concessao direta.
    await comOBuraco(
      "GRANT SELECT ON ocorrencias TO dc360_console",
      "REVOKE SELECT ON ocorrencias FROM dc360_console",
      /concessao direta|efetivo/,
      "Um SELECT direto na tabela de ocorrencias entrega endereco, nome do " +
      "solicitante e relato de todos os municipios de uma vez.",
    );

    // 2. Privilegio de coluna, que passa por fora de role_table_grants.
    await comOBuraco(
      "GRANT UPDATE (descricao) ON ocorrencias TO dc360_console",
      "REVOKE UPDATE (descricao) ON ocorrencias FROM dc360_console",
      /coluna/,
      "Privilegio de coluna nao aparece em role_table_grants: e o caminho que " +
      "some da varredura sem ninguem perceber.",
    );

    // 3. Heranca de papel: sem concessao propria, herdando de quem tem.
    await comOBuraco(
      "GRANT dc360_app TO dc360_console",
      "REVOKE dc360_app FROM dc360_console",
      /heranca|efetivo/,
      "O console passaria a poder tudo que a aplicacao pode, sem uma linha de " +
      "GRANT com o nome dele em lugar nenhum.",
    );

    // 4. PUBLIC, que concede a todo mundo de uma vez.
    await comOBuraco(
      "GRANT SELECT ON ocorrencias TO PUBLIC",
      "REVOKE SELECT ON ocorrencias FROM PUBLIC",
      /PUBLIC|efetivo/,
      "PUBLIC nao aparece como papel nomeado: uma varredura que so olha a lista " +
      "de papeis passa direto por ele.",
    );

    // 5. Visao sobre tabela de negocio.
    await comOBuraco(
      `CREATE VIEW espia_do_portao AS SELECT protocolo, endereco FROM ocorrencias;
       GRANT SELECT ON espia_do_portao TO dc360_console`,
      "DROP VIEW espia_do_portao",
      /visao que alcanca ocorrencias/,
      "A visao pertence ao dono das tabelas, entao ela le por baixo do RLS: " +
      "quem tem SELECT nela dribla a concessao da tabela inteira.",
    );

    /*
      6. Funcao SECURITY DEFINER que alcance tabela de negocio.

      A funcao entra e sai dentro deste caso, no `finally`.

      Repare que ela e concedida ao MESMO papel que hoje tem, por excecao
      nomeada, EXECUTE em `provisionar_municipio()` (migracao 036). E isso que
      este caso mostra: a excecao e de UMA funcao, escrita pelo nome, e a
      segunda funcao concedida ao console continua reprovando aqui.
    */
    await comOBuraco(
      `CREATE FUNCTION espiar_do_portao() RETURNS bigint
         LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
         AS 'SELECT count(*) FROM ocorrencias';
       REVOKE ALL ON FUNCTION espiar_do_portao() FROM PUBLIC;
       GRANT EXECUTE ON FUNCTION espiar_do_portao() TO dc360_console`,
      "DROP FUNCTION espiar_do_portao()",
      /SECURITY DEFINER/,
      "Funcao SECURITY DEFINER roda com os privilegios do dono: quem pode " +
      "executa-la nao precisa de privilegio nenhum na tabela que ela le.",
    );
    /*
      7, 8 e 9 (migracao 038): o LIMITE das excecoes do fornecedor.

      As tabelas do fornecedor entram por PRIVILEGIO nomeado e as funcoes do
      console por NOME. Entao um DELETE no livro, o relogio nas maos do
      console e um UPDATE numa coluna do livro fora das duas de cancelamento
      continuam reprovando. Sem estes tres, a excecao aberta la em cima seria
      indistinguivel de "o console pode tudo nessas duas tabelas".
    */
    await comOBuraco(
      "GRANT DELETE ON eliminacoes_de_municipio TO dc360_console",
      "REVOKE DELETE ON eliminacoes_de_municipio FROM dc360_console",
      /concessao direta|efetivo/,
      "O livro de eliminacoes existe para SOBREVIVER ao municipio: um DELETE nele " +
      "apagaria a prova de que a eliminacao aconteceu, e de quem a pediu.",
    );
    await comOBuraco(
      "GRANT EXECUTE ON FUNCTION executar_eliminacoes_vencidas() TO dc360_console",
      "REVOKE EXECUTE ON FUNCTION executar_eliminacoes_vencidas() FROM dc360_console",
      /SECURITY DEFINER/,
      "O console so escreve intencao. Com o relogio na mao dele, uma sessao do " +
      "fornecedor comprometida apagaria um municipio sem esperar o prazo de arrependimento.",
    );
    await comOBuraco(
      "GRANT UPDATE (motivo) ON eliminacoes_de_municipio TO dc360_console",
      "REVOKE UPDATE (motivo) ON eliminacoes_de_municipio FROM dc360_console",
      /coluna/,
      "O console so alcanca as duas colunas de cancelamento do livro. Reescrever o " +
      "motivo, o prazo ou as contagens reescreveria a historia que o livro guarda.",
    );
    /*
      10 e 11 (migracao 039): o LIMITE da excecao dos codigos de recuperacao.

      O console le e insere codigos, e so isso. UPDATE direto deixaria uma
      sessao comprometida DESMARCAR um codigo gasto e usa-lo de novo; DELETE
      apagaria a prova de que alguem gastou tres codigos que o dono nao gastou.
      Os dois continuam reprovando, e marcar usado segue sendo ato de funcao.
    */
    await comOBuraco(
      "GRANT UPDATE ON console_codigos_de_recuperacao TO dc360_console",
      "REVOKE UPDATE ON console_codigos_de_recuperacao FROM dc360_console",
      /concessao direta|efetivo/,
      "Com UPDATE direto, uma sessao do console comprometida desmarcaria um codigo " +
      "de recuperacao ja gasto e o usaria de novo para trocar a senha do dono.",
    );
    await comOBuraco(
      "GRANT DELETE ON console_codigos_de_recuperacao TO dc360_console",
      "REVOKE DELETE ON console_codigos_de_recuperacao FROM dc360_console",
      /concessao direta|efetivo/,
      "Codigo gasto fica marcado para o livro contar: com DELETE, ninguem distinguiria " +
      "'usei tres' de 'alguem usou tres por mim'.",
    );
    /*
      Prazo folgado de proposito: este caso roda a varredura inteira vinte e
      tres vezes (antes, durante e depois de cada um dos onze buracos), e a
      varredura pergunta privilegio efetivo papel a papel, tabela a tabela. O
      teto padrao de cinco segundos do vitest transformaria uma maquina lenta
      numa reprovacao que nao fala do banco.

      O limite de 60 s antigo foi MEDIDO e estava curto (V-INS-05 do registro da
      E03). Maquina livre este caso leva 15 s no Mac de 8 nucleos; com 24 laços
      de CPU ocupando a maquina ele levou 72 s e reprovou com "Test timed out in
      60000ms"; nas falhas da F00 (um `ng serve` de outro projeto a 50% de CPU)
      ficou entre 58,8 s e mais de 60 s. O limite passa a 240 s (16 vezes o
      tempo livre): continua sendo limite, caso preso reprova, e nenhuma
      asserção mudou.
    */
  }, 240_000);
});

/* =====================================================================
 * A TABELA DE METRICAS, ESCRITA PELO PROPRIO MUNICIPIO (ADR 0008, decisao 2).
 *
 * A direcao do dado e o ponto inteiro. O console NAO consulta o municipio: o
 * municipio escreve o proprio resumo, na propria transacao, com o papel de
 * aplicacao de sempre e debaixo do mesmo RLS de sempre. Os casos abaixo provam
 * as duas metades: que a escrita nao alcanca o vizinho, e que a leitura do
 * console nao alcanca nada alem de numero agregado.
 * ===================================================================== */
describe("Metricas escritas pelo proprio municipio", () => {
  let orgC: string;

  beforeAll(async () => {
    const c = await db.query<{ id: string }>(
      `INSERT INTO organizacoes (nome, municipio, uf)
       VALUES ('Defesa Civil de Morro Claro','Morro Claro','MG') RETURNING id`,
    );
    orgC = c.rows[0]!.id;

    // Duas ocorrencias hoje, uma delas com prazo ja vencido, e um servidor.
    for (const [protocolo, prazo] of [
      ["000401/2026", "now() - interval '2 hours'"],
      ["000402/2026", "NULL"],
    ] as const) {
      await db.query(
        `INSERT INTO ocorrencias
           (organizacao_id, protocolo, tipo, status, endereco, solicitante_nome,
            canal_entrada, descricao, prazo_em)
         VALUES ($1,$2,'inundacao','registrada','Rua da Metrica, 1','Fulano',
                 'telefone','x', ${prazo})`,
        [orgC, protocolo],
      );
    }
    await db.query(
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel)
       VALUES ($1,'Servidora de Morro Claro','MC-1','mc1@exemplo.gov.br','coordenador')`,
      [orgC],
    );
  });

  it("o municipio escreve o proprio resumo, e ele bate com o que o municipio ve", async () => {
    await comoApp(orgC, (tx) => tx.query("SELECT resumir_municipio()"));

    const linha = await comoApp(orgC, (tx) =>
      tx.query<{
        ocorrencias_registradas: number;
        ocorrencias_abertas: number;
        ocorrencias_atrasadas: number;
        usuarios_ativos: number;
      }>("SELECT * FROM metricas_municipio"),
    );
    expect(linha.rows, "o municipio nao conseguiu escrever o proprio resumo").toHaveLength(1);
    expect(linha.rows[0]!.ocorrencias_registradas).toBe(2);
    expect(linha.rows[0]!.ocorrencias_abertas).toBe(2);
    expect(linha.rows[0]!.ocorrencias_atrasadas).toBe(1);
    expect(linha.rows[0]!.usuarios_ativos).toBe(1);
  });

  it("chamar duas vezes no mesmo dia corrige a linha, nao empilha outra", async () => {
    await comoApp(orgC, (tx) => tx.query("SELECT resumir_municipio()"));
    await comoApp(orgC, (tx) => tx.query("SELECT resumir_municipio()"));
    const n = await comoApp(orgC, (tx) =>
      tx.query<{ n: string }>("SELECT count(*)::text AS n FROM metricas_municipio"),
    );
    expect(n.rows[0]!.n, "o resumo do dia duplicou, e o console veria dois numeros").toBe("1");
  });

  it("o resumo conta o proprio municipio, e nao enxerga o vizinho", async () => {
    /*
      O caso que a inversao da seta existe para garantir. `resumir_municipio()`
      e SECURITY INVOKER: as contagens rodam debaixo do RLS de quem chama,
      entao as linhas do vizinho nao estao la para serem contadas. Nao existe
      erro de clausula nessa funcao capaz de produzir o numero de outra
      prefeitura.
    */
    await comoApp(orgA, (tx) => tx.query("SELECT resumir_municipio()"));

    const deC = await comoApp(orgC, (tx) =>
      tx.query<{ organizacao_id: string }>("SELECT organizacao_id FROM metricas_municipio"),
    );
    expect(deC.rows, "o municipio enxergou o resumo do vizinho").toHaveLength(1);
    expect(deC.rows[0]!.organizacao_id).toBe(orgC);

    // E, como dono, as duas linhas existem: cada uma escrita pelo seu dono.
    const todas = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM metricas_municipio",
    );
    expect(Number(todas.rows[0]!.n)).toBeGreaterThanOrEqual(2);
  });

  it("nao escreve resumo carimbado com o id de outro municipio", async () => {
    await expect(
      comoApp(orgC, (tx) =>
        tx.query(
          "INSERT INTO metricas_municipio (organizacao_id, dia) VALUES ($1, current_date + 1)",
          [orgB],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("sem contexto de municipio, a escrita nao acontece", async () => {
    // Chamar isto de um relogio, sem token e sem municipio, nao pode escrever
    // uma linha orfa: `app_organizacao_atual()` devolve nulo e a policy nega.
    await expect(
      comoApp(null, (tx) => tx.query("SELECT resumir_municipio()")),
    ).rejects.toThrow();
  });

  it("o municipio nao apaga o proprio historico de metricas", async () => {
    // Sem policy de DELETE, e com RLS forcada, a operacao e negada. Enquanto o
    // expurgo por idade nao existir, e melhor que ninguem apague nada do que
    // uma rota poder zerar a serie de um municipio com um DELETE sem clausula.
    await expect(
      comoApp(orgC, (tx) => tx.query("DELETE FROM metricas_municipio")),
    ).rejects.toThrow();
  });

  /* ------------------------------------------------------------------
   * O QUE PODE ENTRAR NA METRICA, conferido no CATALOGO.
   * ------------------------------------------------------------------ */

  /**
   * As relacoes que o console consegue ler, perguntadas ao banco.
   *
   * Escrever a lista a mao aqui seria conferir a tabela de hoje e deixar
   * passar a de amanha, que e o defeito que a ADR 0008 nomeia. Se alguem der
   * SELECT ao console numa relacao nova, ela cai nesta varredura sozinha e
   * precisa passar pelas mesmas regras.
   */
  async function relacoesQueOConsoleLe(): Promise<Array<{ relacao: string }>> {
    const r = await db.query<{ relacao: string }>(`
      SELECT c.relname AS relacao
        FROM pg_class c
       WHERE c.relnamespace = 'public'::regnamespace
         AND c.relkind IN ('r','p','v','m')
         AND has_table_privilege('dc360_console', c.oid, 'SELECT')
       ORDER BY 1
    `);
    return r.rows;
  }

  /**
   * Tipos que nao carregam pessoa nem imovel dentro.
   *
   * E lista de PERMITIDOS, e nao de proibidos, porque proibir por nome de tipo
   * envelhece mal: bastaria alguem usar `varchar`, `citext`, `json` ou um tipo
   * de geometria para a proibicao nao casar. Tipo novo reprova por padrao, e
   * quem quiser incluir um escreve a razao aqui.
   */
  const TIPOS_QUE_NAO_IDENTIFICAM = new Set([
    "smallint", "integer", "bigint", "numeric", "real", "double precision",
    "date", "timestamp with time zone", "interval", "boolean",
  ]);

  /**
   * Nomes que denunciam dado de pessoa ou de imovel.
   *
   * O tipo ja e a barreira dura (nao cabe endereco num integer). Esta segunda
   * cobranca existe para o caso que o tipo nao pega: `latitude` e `longitude`
   * sao double precision, e um par deles aponta a casa de alguem.
   */
  const NOMES_PROIBIDOS = [
    "nome", "contato", "endereco", "email", "telefone", "coordenada",
    "latitude", "longitude", "protocolo", "relato", "descricao",
    "vulnerabilidade", "matricula", "cpf", "assinatura", "ficha",
  ];

  async function colunas(relacao: string) {
    const r = await db.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name = $1 ORDER BY ordinal_position`,
      [relacao],
    );
    return r.rows;
  }

  function reprovacoes(nome: string, tipo: string): string[] {
    const problemas: string[] = [];
    if (nome === "organizacao_id") {
      // O unico identificador permitido pela ADR 0008, e ele identifica a
      // prefeitura, nao pessoa nem imovel.
      if (tipo !== "uuid") problemas.push(`organizacao_id deveria ser uuid, e e ${tipo}`);
      return problemas;
    }
    if (!TIPOS_QUE_NAO_IDENTIFICAM.has(tipo)) {
      problemas.push(`coluna ${nome} e do tipo ${tipo}, que cabe dado de pessoa dentro`);
    }
    for (const proibido of NOMES_PROIBIDOS) {
      if (nome.includes(proibido)) problemas.push(`coluna ${nome} carrega ${proibido}`);
    }
    return problemas;
  }

  it("a regra de coluna proibida reprova de verdade quando ha o que reprovar", async () => {
    /*
      A ancora desta metade. Uma regra escrita errada aprova tudo em silencio,
      e o teste fica verde afirmando que conferiu. Entao ela e apontada para
      uma tabela que SABIDAMENTE tem dado de pessoa e de imovel: se `ocorrencias`
      passar por ela, a regra nao esta verificando nada.
    */
    const problemas = (await colunas("ocorrencias"))
      .flatMap((c) => reprovacoes(c.column_name, c.data_type));
    expect(
      problemas.length,
      "a regra de coluna aprovou a tabela de ocorrencias, que tem endereco, nome " +
      "do solicitante, coordenada e relato: a regra esta quebrada",
    ).toBeGreaterThan(0);
    expect(problemas.join(" ")).toContain("endereco");
    expect(problemas.join(" ")).toContain("latitude");
  });

  it("nada que identifique pessoa ou imovel entra no que o console le", async () => {
    const relacoes = await relacoesQueOConsoleLe();
    expect(
      relacoes.length,
      "a varredura nao achou nenhuma relacao legivel pelo console: ela quebrou",
    ).toBeGreaterThanOrEqual(3);

    for (const { relacao } of relacoes) {
      /*
        `organizacoes` e a unica excecao, e ela esta nomeada na decisao 3 da
        ADR 0008: sem o cadastro, o console teria uma lista de uuid e nenhuma
        forma de dizer de que prefeitura esta falando. Ela guarda dado de
        ORGAO (nome da coordenadoria, municipio, UF), nao de pessoa nem de
        imovel, e e por isso que a excecao cabe.
      */
      if (relacao === "organizacoes") continue;

      /*
        As duas tabelas do fornecedor (038) nao sao de municipio, e a regra
        de tipo nao e a delas: `console_operadores` guarda email e hash de
        senha de quem OPERA A PLATAFORMA, nao de cidadao nem de servidor
        municipal; `eliminacoes_de_municipio` guarda o que sobrevive ao
        municipio. A regra delas e outra, e e mais dura que a de tipo: a lista
        de colunas e fechada, por nome. Uma coluna nova reprova ate alguem
        escreve-la aqui, e escreve-la aqui e o momento de perguntar se ela
        carrega dado de cidadao.
      */
      if (relacao === "console_operadores") {
        expect((await colunas(relacao)).map((c) => c.column_name)).toEqual([
          "id", "email", "senha_hash", "segundo_fator", "papel", "ativo", "criado_em",
          "criado_por", "falhas_login", "bloqueado_ate", "ultimo_passo_totp",
        ]);
        continue;
      }
      if (relacao === "eliminacoes_de_municipio") {
        expect((await colunas(relacao)).map((c) => c.column_name)).toEqual([
          "id", "organizacao_id", "municipio_nome", "uf", "solicitada_em", "executar_em",
          "solicitada_por_email", "motivo", "cancelada_em", "cancelada_por_email",
          "banco_apagado_em", "contagens", "armazenamento_purgado_em", "concluida_em",
        ]);
        continue;
      }
      /*
        A terceira do fornecedor (039): o hash do CÓDIGO de recuperação de um
        operador do console, e quando foi gerado e gasto. Nada de cidadão, nada
        de servidor municipal, e nem o hash da SENHA: a lista é fechada por
        nome, como nas outras duas, e uma coluna nova reprova até alguém
        escrevê-la aqui.
      */
      if (relacao === "console_codigos_de_recuperacao") {
        expect((await colunas(relacao)).map((c) => c.column_name)).toEqual([
          "id", "operador_id", "codigo_hash", "criado_em", "usado_em",
        ]);
        continue;
      }

      const problemas = (await colunas(relacao))
        .flatMap((c) => reprovacoes(c.column_name, c.data_type));
      expect(
        problemas,
        `${relacao} e legivel pelo console e carrega dado que nao pode sair do ` +
        `municipio: ${problemas.join("; ")}`,
      ).toEqual([]);
    }
  });

  it("a marca de tempo da ultima escrita existe e e obrigatoria", async () => {
    const r = await db.query<{ data_type: string; is_nullable: string }>(
      `SELECT data_type, is_nullable FROM information_schema.columns
        WHERE table_schema='public' AND table_name='metricas_municipio'
          AND column_name='atualizado_em'`,
    );
    expect(
      r.rows,
      "sem marca de tempo da ultima escrita, o console mostra silencio, e silencio " +
      "e indistinguivel de 'ninguem usou hoje'",
    ).toHaveLength(1);
    expect(r.rows[0]!.data_type).toBe("timestamp with time zone");
    expect(r.rows[0]!.is_nullable).toBe("NO");
  });

  it("municipio que nao escreveu aparece como sinal, e nao como linha faltando", async () => {
    /*
      A consequencia ruim assumida na ADR 0008, virada em teste. Uma consulta
      direta a `metricas_municipio` simplesmente NAO TRAZ o municipio quebrado,
      e ninguem sente falta do que nao esta la. A visao parte de
      `organizacoes`, entao todo municipio aparece sempre, e quem nao escreveu
      aparece dizendo que nao escreveu.
    */
    const semMetrica = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM metricas_municipio WHERE organizacao_id = $1",
      [orgB],
    );
    expect(semMetrica.rows[0]!.n, "o municipio B precisa estar sem metrica neste caso").toBe("0");

    const visao = await db.query<{ organizacao_id: string; sem_escrita_recente: boolean }>(
      "SELECT organizacao_id, sem_escrita_recente FROM console_situacao_dos_municipios",
    );
    const linhaDeB = visao.rows.find((l) => l.organizacao_id === orgB);
    expect(
      linhaDeB,
      "o municipio que nao escreveu sumiu da visao: o console mostraria silencio",
    ).toBeDefined();
    expect(linhaDeB!.sem_escrita_recente).toBe(true);

    const linhaDeC = visao.rows.find((l) => l.organizacao_id === orgC);
    expect(linhaDeC!.sem_escrita_recente, "quem acabou de escrever apareceu como calado").toBe(false);
  });
});

/* =====================================================================
 * O PAPEL DO CONSOLE, visto do lado de dentro da conexao dele.
 *
 * O bloco de privilegio de cima prova o que ele NAO tem, lendo o catalogo.
 * Este prova a mesma coisa pelo unico caminho que nao depende de eu ter lido o
 * catalogo direito: conectando como ele e tentando.
 * ===================================================================== */
describe("O console le metrica e nao alcanca dado de municipio", () => {
  async function comoConsole<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE dc360_console");
      return fn(tx);
    }) as Promise<T>;
  }

  it("le o resumo de mais de um municipio, que e o motivo de ele existir", async () => {
    const r = await comoConsole((tx) =>
      tx.query<{ organizacao_id: string }>("SELECT DISTINCT organizacao_id FROM metricas_municipio"),
    );
    expect(
      r.rows.length,
      "o console nao conseguiu ler o resumo de mais de um municipio, e sem isso " +
      "ele nao responde nenhuma das tres perguntas da ADR 0008",
    ).toBeGreaterThanOrEqual(2);
  });

  it("nao le ocorrencia, vistoria, usuario nem trilha, de municipio nenhum", async () => {
    for (const tabela of [
      "ocorrencias", "vistorias", "evidencias", "usuarios", "trilha_eventos",
      "sessoes", "aparelhos", "segundo_fator", "interesse_municipio",
    ]) {
      let recusou = false;
      try {
        await comoConsole((tx) => tx.query(`SELECT * FROM ${tabela} LIMIT 1`));
      } catch {
        recusou = true;
      }
      expect(
        recusou,
        `o console alcancou ${tabela}: uma conta do fornecedor comprometida passaria ` +
        "a valer dado de cidadao de todas as prefeituras de uma vez",
      ).toBe(true);
    }
  });

  it("nao escreve nada, nem na tabela que ele le", async () => {
    let recusou = false;
    try {
      await comoConsole((tx) =>
        tx.query("UPDATE metricas_municipio SET ocorrencias_atrasadas = 0"),
      );
    } catch {
      recusou = true;
    }
    expect(recusou, "o console alterou a metrica que ele deveria apenas ler").toBe(true);
  });

  it("a visao que ele le roda com os privilegios DELE, e nao com os do dono", async () => {
    /*
      `security_invoker` e o que impede a visao de virar a porta dos fundos.
      Sem ele, a visao rodaria com os privilegios do dono das tabelas, que e
      superusuario e ignora RLS: bastaria alguem acrescentar uma juncao com
      `ocorrencias` ali para o console passar a ler dado de cidadao sem que
      nenhuma concessao mudasse de lugar. Com ele, uma juncao dessas responde
      "permissao negada".
    */
    const r = await db.query<{ opcoes: string | null }>(
      `SELECT array_to_string(c.reloptions, ',') AS opcoes
         FROM pg_class c
        WHERE c.relname = 'console_situacao_dos_municipios'`,
    );
    expect(r.rows[0]!.opcoes ?? "").toContain("security_invoker=true");

    /*
      E a prova de que a opcao e o que faz a diferenca, e nao um enfeite na
      definicao. Duas visoes identicas sobre `ocorrencias`, uma com a opcao e
      outra sem, as duas concedidas ao console: a sem opcao ENTREGA o dado, a
      com opcao responde "permissao negada". As duas saem no `finally`.
    */
    await db.exec(`
      CREATE VIEW prova_com_invoker WITH (security_invoker = true) AS
        SELECT endereco FROM ocorrencias;
      CREATE VIEW prova_sem_invoker AS
        SELECT endereco FROM ocorrencias;
      GRANT SELECT ON prova_com_invoker, prova_sem_invoker TO dc360_console;
    `);
    try {
      let recusou = false;
      try {
        await comoConsole((tx) => tx.query("SELECT * FROM prova_com_invoker"));
      } catch {
        recusou = true;
      }
      expect(
        recusou,
        "com security_invoker a visao deveria bater na falta de concessao do console " +
        "na tabela de baixo, e ela nao bateu",
      ).toBe(true);

      const semOpcao = await comoConsole((tx) =>
        tx.query<{ endereco: string }>("SELECT * FROM prova_sem_invoker"),
      );
      expect(
        semOpcao.rows.length,
        "a visao SEM security_invoker deveria ter entregue endereco de cidadao ao " +
        "console: se ela nao entregou, esta prova nao esta provando nada",
      ).toBeGreaterThan(0);
    } finally {
      await db.exec("DROP VIEW prova_com_invoker; DROP VIEW prova_sem_invoker;");
    }
  });
});

/* =====================================================================
 * O RELOGIO QUE CHAMA O RESUMO (migracao 026).
 *
 * A migracao 023 criou a tabela, a funcao, a visao e o papel do console, e
 * ninguem chamava a funcao. Tabela vazia para sempre, visao dizendo
 * `sem_escrita_recente` para todo mundo, console afirmando que nenhum
 * municipio usa o produto: tudo verde, tudo desligado.
 *
 * O que faltava era o relogio saber PARA QUEM chamar, e isso ele nao tem como
 * descobrir sozinho: `resumir_municipio()` e SECURITY INVOKER, entao precisa
 * do contexto de um municipio, e sem contexto o papel de aplicacao nao enxerga
 * uma linha de `organizacoes`. Os casos abaixo guardam o tamanho da porta que
 * a 026 abriu para resolver isso: sem municipio de parametro, sem nome na
 * saida, e fechada para o papel do console.
 * ===================================================================== */
describe("O relogio que descobre para quem chamar o resumo", () => {
  async function pendentes(frescor: string): Promise<string[]> {
    const r = await comoApp(null, (tx) =>
      tx.query<{ municipios_a_resumir: string }>(
        "SELECT municipios_a_resumir($1::interval)",
        [frescor],
      ),
    );
    return r.rows.map((l) => l.municipios_a_resumir);
  }

  it("descobre quem esta sem resumo fresco, sem contexto de municipio nenhum", async () => {
    /*
      O caso central. O relogio roda sem token e sem municipio no contexto, que
      e a situacao em que o papel de aplicacao nao enxerga nem a propria
      organizacao. Sem esta funcao ele nao teria como saber que Vale Fundo
      existe, e o resumo de Vale Fundo nunca seria escrito.
    */
    const lista = await pendentes("1 hour");
    expect(
      lista,
      "o relogio nao enxergou o municipio que ainda nao escreveu resumo nenhum: " +
      "a tabela de metricas ficaria vazia para esse municipio para sempre",
    ).toContain(orgB);
    expect(
      lista,
      "o municipio que escreveu o resumo ha instantes continua na fila do relogio, " +
      "e o relogio reescreveria o mesmo numero a cada rodada",
    ).not.toContain(orgA);
  });

  it("some da fila assim que o municipio escreve, e volta quando o resumo envelhece", async () => {
    await comoApp(orgB, (tx) => tx.query("SELECT resumir_municipio()"));

    expect(
      await pendentes("1 hour"),
      "escrever o resumo nao tirou o municipio da fila do relogio",
    ).not.toContain(orgB);

    /*
      E o outro lado, que e o que impede o resumo de congelar: com frescor
      zero, todo mundo esta velho, e o relogio reescreve. Sem este ramo, uma
      funcao que simplesmente devolvesse "quem nunca escreveu" passaria no caso
      de cima e deixaria o console mostrando o numero da meia-noite para
      sempre.
    */
    expect(
      await pendentes("0 seconds"),
      "com frescor zero o municipio deveria voltar para a fila, e nao voltou: " +
      "o console mostraria o numero da primeira escrita para sempre",
    ).toContain(orgB);
  });

  it("nao aceita municipio de parametro, e nao devolve nome de prefeitura", async () => {
    /*
      O tamanho da porta, cobrado no catalogo e nao na leitura do arquivo.

      Funcao privilegiada que aceita "de qual municipio" e funcao que alguem
      vai chamar com o municipio do vizinho. E funcao privilegiada que devolve
      texto e funcao onde cabe endereco: o tipo de retorno ser `uuid` e o que
      garante que a resposta e um identificador e nada mais.
    */
    const r = await db.query<{ argumentos: string; retorno: string; conjunto: boolean }>(
      `SELECT pg_get_function_arguments(p.oid) AS argumentos,
              pg_get_function_result(p.oid)    AS retorno,
              p.proretset                      AS conjunto
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'municipios_a_resumir'`,
    );
    expect(r.rows, "a funcao do relogio nao existe").toHaveLength(1);
    expect(
      r.rows[0]!.argumentos,
      "a funcao do relogio ganhou parametro: se um deles apontar municipio, ela " +
      "vira a credencial que a ADR 0008 existe para impedir",
    ).toBe("p_frescor interval");
    expect(r.rows[0]!.retorno).toBe("SETOF uuid");
    expect(r.rows[0]!.conjunto).toBe(true);
  });

  it("o papel do console nao executa o relogio", async () => {
    /*
      Ela le `organizacoes` com os privilegios do dono, entao executa-la seria
      um caminho de leitura que nao passa por nenhuma concessao de tabela. O
      console ja le `organizacoes` por concessao propria e nao precisa desta
      funcao para nada; o que ele nao pode e ter em maos uma funcao privilegiada
      que alguem possa alargar amanha.
    */
    /*
      A ancora deste caso, e ela nao e formalidade: sem a funcao no banco a
      chamada tambem falha, e o teste ficaria verde afirmando uma recusa que na
      verdade e uma ausencia. Foi assim que ele passou na execucao em que a 026
      estava fora do lugar.
    */
    const existe = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'municipios_a_resumir'`,
    );
    expect(
      existe.rows[0]!.n,
      "a funcao do relogio nao existe, entao a recusa abaixo nao prova nada",
    ).toBe("1");

    let recusou = false;
    try {
      await db.transaction(async (tx) => {
        await tx.exec("SET LOCAL ROLE dc360_console");
        await tx.query("SELECT municipios_a_resumir(interval '1 hour')");
      });
    } catch {
      recusou = true;
    }
    expect(
      recusou,
      "o console executou a funcao privilegiada do relogio, que le organizacoes " +
      "com os privilegios do dono",
    ).toBe(true);
  });
});

/* =====================================================================
 * A PORTA DE CRIAR MUNICIPIO (migracao 036), E A PROVA DE QUE ELA NAO LE.
 *
 * A assercao universal logo acima abriu UMA excecao para um papel que nao e o
 * de aplicacao nem o dono: `dc360_console` executa `provisionar_municipio`.
 * Excecao sem caso-irmao e buraco com comentario bonito, entao este bloco e a
 * contrapartida obrigatoria dela.
 *
 * A pergunta que ele responde nao e "a funcao funciona", e sim "a funcao serve
 * para ler?". As respostas sao quatro, e cada uma tem caso proprio:
 *
 *   1. A saida sao dois uuid recem-criados, e nada mais.
 *   2. Nenhum parametro dela vira filtro de consulta.
 *   3. O corpo nao alcanca tabela de negocio nenhuma alem das tres que escreve.
 *   4. Depois de usa-la, o console continua sem enxergar o que acabou de criar.
 *
 * O quarto e o que fecha a porta de verdade: se criar municipio desse ao
 * console qualquer leitura a mais, seria por ali que uma conta do fornecedor
 * comprometida viraria dado de cidadao de todas as prefeituras.
 * ===================================================================== */
describe("A porta de criar municipio, e por que ela nao serve para ler", () => {
  /**
   * Um hash no formato do produto (`scrypt$N$r$p$sal$hash`), fixo no teste.
   *
   * Derivar de verdade aqui custaria 128 MB e alguns segundos por caso, e este
   * arquivo nao mede a derivacao: quem amarra a derivacao do console a
   * conferencia da API e `apps/console/test/cadastro-de-prefeitura.test.ts`.
   */
  const HASH = "scrypt$131072$8$1$XenoRKJ2mWCQSO-ZnZXUvg$vO-J5ozHwGH1V29fdrVZE4F9ps_lf8oqXHLmU_6ZMrk";

  const CHAMADA = "SELECT * FROM provisionar_municipio($1,$2,$3,$4,$5,$6,$7,$8)";

  /**
   * As tabelas do esquema, perguntadas ao catalogo.
   *
   * Copia local da mesma consulta que o bloco do CA-06 usa (aquela e privada
   * daquele `describe`), e ela e perguntada ao banco de proposito: a tabela que
   * alguem criar amanha entra na conferencia do corpo da funcao sozinha.
   */
  async function tabelasDoEsquema(): Promise<string[]> {
    const r = await db.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    return r.rows.map((l) => l.tablename).filter((t) => t !== "schema_migracoes");
  }

  /** Como o console executa de verdade: papel dele, e nada de superusuario. */
  async function comoConsole<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    return db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE dc360_console");
      const r = await tx.query(sql, params.length > 0 ? [...params] : undefined);
      return r.rows as T[];
    }) as Promise<T[]>;
  }

  function pedido(municipio: string, extras: Partial<Record<number, unknown>> = {}) {
    const base: unknown[] = [
      `Coordenadoria Municipal de Protecao e Defesa Civil de ${municipio}`,
      municipio, "MG",
      "Rita Lopes", "PM-1", `rita@${municipio.toLowerCase().replace(/\s/g, "")}.mg.gov.br`,
      HASH, "Rafael Gomes (operacao da plataforma)",
    ];
    for (const [i, valor] of Object.entries(extras)) base[Number(i)] = valor;
    return base;
  }

  it("o municipio, o administrador e a linha de nascimento nascem juntos", async () => {
    const criado = await comoConsole<{ organizacao_id: string; usuario_id: string }>(
      CHAMADA, pedido("Pedra Branca"),
    );
    expect(criado, "a funcao devolveu mais de uma linha").toHaveLength(1);

    const { organizacao_id: orgId, usuario_id: usuarioId } = criado[0]!;

    const org = await db.query<{ nome: string; municipio: string; uf: string }>(
      "SELECT nome, municipio, uf FROM organizacoes WHERE id = $1", [orgId],
    );
    expect(org.rows[0]!.municipio).toBe("Pedra Branca");
    expect(org.rows[0]!.uf).toBe("MG");

    const usuario = await db.query<{ papel: string; senha_hash: string; ativo: boolean }>(
      "SELECT papel, senha_hash, ativo FROM usuarios WHERE id = $1", [usuarioId],
    );
    /*
      Administrador, e nao parametro: o primeiro usuario de um municipio precisa
      ser o teto dele (ADR 0006). Nascer abaixo disso deixaria o municipio sem
      ninguem capaz de criar o proximo usuario, e a saida seria outra vez o
      banco de producao aberto na mao.
    */
    expect(usuario.rows[0]!.papel).toBe("administrador");
    expect(usuario.rows[0]!.ativo).toBe(true);
    expect(usuario.rows[0]!.senha_hash).toBe(HASH);

    /*
      A linha espelho, pela mesma razao da migracao 025: o ato e o registro do
      ato sao a mesma transacao, entao nao existe caminho que crie municipio sem
      registrar. Ela e a unica resposta que o municipio tem para "quem criou
      isto", e o municipio a le na propria trilha.
    */
    const trilha = await db.query<{
      autor_nome: string; autor_papel: string; acao: string; alvo_nome: string;
      depois: Record<string, unknown>;
    }>(
      `SELECT autor_nome, autor_papel, acao, alvo_nome, depois
         FROM trilha_administrativa WHERE organizacao_id = $1`, [orgId],
    );
    expect(
      trilha.rows,
      "o municipio nasceu sem a linha que diz quem o criou",
    ).toHaveLength(1);
    expect(trilha.rows[0]!.acao).toBe("municipio_provisionado");
    expect(trilha.rows[0]!.autor_papel).toBe("operador_da_plataforma");
    expect(trilha.rows[0]!.autor_nome).toBe("Rafael Gomes (operacao da plataforma)");
    expect(trilha.rows[0]!.alvo_nome).toBe("Pedra Branca/MG");

    /*
      E a trilha e append-only: nem o hash da senha entra nela. A migracao 010
      escreveu essa regra e este e o unico lugar do produto onde uma senha passa
      perto de uma escrita na trilha, entao a regra e cobrada aqui.
    */
    const cru = JSON.stringify(trilha.rows[0]!.depois);
    expect(cru, "o hash da senha entrou na trilha, que nao se corrige").not.toContain("scrypt");
  });

  it("a saida sao dois identificadores, e nao ha como devolver linha de tabela", async () => {
    /*
      Cobrado no CATALOGO, e nao no resultado de uma chamada: uma chamada
      mostra o que a funcao devolveu hoje, o catalogo mostra o que ela E CAPAZ
      de devolver. Se alguem acrescentar um `OUT` amanha, este caso reprova
      antes de existir tela que mostre o campo novo.
    */
    const r = await db.query<{ argumentos: string; retorno: string; conjunto: boolean }>(
      `SELECT pg_get_function_arguments(p.oid) AS argumentos,
              pg_get_function_result(p.oid)    AS retorno,
              p.proretset                      AS conjunto
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'provisionar_municipio'`,
    );
    expect(r.rows, "a funcao de provisionamento nao existe").toHaveLength(1);

    const saidas = r.rows[0]!.argumentos
      .split(", ")
      .filter((a) => a.startsWith("OUT "));
    expect(
      saidas,
      "a saida da funcao mudou: ela devolve mais que os dois identificadores do " +
      "que acabou de ser criado",
    ).toEqual(["OUT organizacao_id uuid", "OUT usuario_id uuid"]);

    // Uma linha so: `SETOF` aqui seria a forma de devolver uma lista, e lista e
    // o que uma consulta devolve.
    expect(r.rows[0]!.conjunto, "a funcao passou a devolver conjunto").toBe(false);
    expect(r.rows[0]!.retorno).toBe("record");
  });

  it("nenhum parametro dela vira consulta, e o corpo nao alcanca tabela de negocio", async () => {
    const r = await db.query<{ argumentos: string; corpo: string }>(
      `SELECT pg_get_function_arguments(p.oid) AS argumentos, p.prosrc AS corpo
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'provisionar_municipio'`,
    );
    const { argumentos, corpo } = r.rows[0]!;

    /*
      Todo parametro de entrada e VALOR A SER GRAVADO. Nenhum e identificador de
      municipio, nenhum e nome de coluna, nenhum e trecho de consulta. A lista
      inteira e conferida por extenso, e nao por contagem: um parametro novo
      chamado `p_organizacao_id` passaria por qualquer contagem.
    */
    const entradas = argumentos.split(", ").filter((a) => !a.startsWith("OUT "));
    expect(
      entradas,
      "a funcao ganhou ou perdeu parametro: cada um deles e um valor gravado, e " +
      "um parametro que escolha municipio transforma esta porta numa consulta",
    ).toEqual([
      "p_orgao text", "p_municipio text", "p_uf text",
      "p_nome text", "p_matricula text", "p_email text",
      "p_senha_hash text", "p_operador text",
    ]);

    /*
      SQL montado com texto e o caminho pelo qual um parametro vira consulta
      mesmo com a assinatura acima intacta: bastaria um `EXECUTE 'SELECT ... ' ||
      p_municipio` para a funcao virar console de consulta livre, rodando com os
      privilegios do dono.
    */
    expect(
      /\bEXECUTE\b/i.test(corpo),
      "o corpo da funcao passou a montar SQL em texto: um parametro em EXECUTE " +
      "vira consulta livre com os privilegios do dono",
    ).toBe(false);

    // Um unico SELECT, o da recusa de duplicata. Ver a migracao 036.
    expect(
      (corpo.match(/\bSELECT\b/gi) ?? []).length,
      "o corpo da funcao ganhou SELECT: ela tem um so, o que recusa municipio " +
      "duplicado antes de escrever",
    ).toBe(1);

    /*
      E o corpo nao NOMEIA tabela de negocio nenhuma alem das tres que ele
      escreve. A lista vem do catalogo, e nao de memoria: uma tabela criada
      amanha entra nesta conferencia sozinha.
    */
    const escreve = new Set(["organizacoes", "usuarios", "trilha_administrativa"]);
    const alcancadas = (await tabelasDoEsquema())
      .filter((t) => !escreve.has(t))
      .filter((t) => new RegExp(`\\b${t}\\b`, "i").test(corpo));
    expect(
      alcancadas,
      `o corpo da funcao privilegiada nomeia ${alcancadas.join(", ")}: cada uma ` +
      "dessas e lida com os privilegios do dono, por baixo do RLS",
    ).toEqual([]);
  });

  it("depois de criar o municipio, o console continua sem enxergar o que criou", async () => {
    const criado = await comoConsole<{ organizacao_id: string; usuario_id: string }>(
      CHAMADA, pedido("Serra do Meio"),
    );
    const { organizacao_id: orgId, usuario_id: usuarioId } = criado[0]!;

    /*
      A ANCORA: as linhas existem. Sem ela, a recusa abaixo seria indistinguivel
      de uma consulta que nao achou nada, e o caso ficaria verde afirmando uma
      protecao que nao existe.
    */
    const conferido = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM usuarios WHERE id = $1", [usuarioId],
    );
    expect(conferido.rows[0]!.n, "o administrador nao foi criado").toBe("1");

    for (const consulta of [
      "SELECT nome, email FROM usuarios WHERE id = $1",
      "SELECT senha_hash FROM usuarios WHERE id = $1",
    ]) {
      let mensagem = "";
      try {
        await comoConsole(consulta, [usuarioId]);
      } catch (erro) {
        mensagem = erro instanceof Error ? erro.message : String(erro);
      }
      expect(
        mensagem.toLowerCase(),
        `o console leu o administrador que acabou de criar: "${consulta}"`,
      ).toMatch(/permission denied|permissão negada/);
    }

    // E a trilha do municipio recem-criado, que e onde o nome do operador esta.
    let recusouTrilha = false;
    try {
      await comoConsole("SELECT * FROM trilha_administrativa WHERE organizacao_id = $1", [orgId]);
    } catch {
      recusouTrilha = true;
    }
    expect(recusouTrilha, "o console leu a trilha administrativa do municipio").toBe(true);

    /*
      E o portao universal continua limpo depois do ato. Sao dez concessoes,
      escritas por extenso: SELECT nas duas relacoes e na visao da ADR 0008,
      as cinco da migracao 038 nas tabelas DO FORNECEDOR (SELECT, INSERT e
      UPDATE em `console_operadores`; SELECT e INSERT em
      `eliminacoes_de_municipio`, cujo UPDATE e por coluna e nao aparece
      nesta visao do catalogo) e as duas da 039 (SELECT e INSERT em
      `console_codigos_de_recuperacao`). Nenhuma delas e tabela de municipio.
    */
    expect(
      (await db.query<{ concessao: string }>(
        `SELECT table_name || ':' || privilege_type AS concessao
           FROM information_schema.role_table_grants
          WHERE table_schema = 'public' AND grantee = 'dc360_console'
          ORDER BY 1`,
      )).rows.map((l) => l.concessao),
      "o console ganhou concessao de tabela alem das que a ADR 0008 e as migracoes 038 e 039 nomeiam",
    ).toEqual([
      "console_codigos_de_recuperacao:INSERT",
      "console_codigos_de_recuperacao:SELECT",
      "console_operadores:INSERT",
      "console_operadores:SELECT",
      "console_operadores:UPDATE",
      "console_situacao_dos_municipios:SELECT",
      "eliminacoes_de_municipio:INSERT",
      "eliminacoes_de_municipio:SELECT",
      "metricas_municipio:SELECT",
      "organizacoes:SELECT",
    ]);
  });

  it("recusa municipio duplicado ANTES de escrever, e diz qual ja existe", async () => {
    await comoConsole(CHAMADA, pedido("Vila Nova"));

    const antes = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM organizacoes",
    );

    let mensagem = "";
    try {
      // Caixa diferente de proposito: "vila nova" e "Vila Nova" sao a mesma
      // prefeitura, e dois cadastros dela seriam dois bancos invisiveis um para
      // o outro.
      await comoConsole(CHAMADA, pedido("vila nova"));
    } catch (erro) {
      mensagem = erro instanceof Error ? erro.message : String(erro);
    }
    expect(
      mensagem,
      "a recusa de duplicata nao diz QUAL municipio ja existe, e manda a pessoa " +
      "procurar sozinha numa lista",
    ).toContain("Vila Nova/MG");

    const depois = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM organizacoes",
    );
    expect(
      depois.rows[0]!.n,
      "a recusa aconteceu DEPOIS de escrever: sobrou organizacao pela metade",
    ).toBe(antes.rows[0]!.n);
  });

  it("recusa senha em texto claro, e recusa cadastro sem o nome de quem cadastrou", async () => {
    /*
      A ANCORA, e ela nao e formalidade neste caso em particular: sem a funcao
      no banco, TODA chamada abaixo tambem falha, e o caso ficaria verde
      afirmando recusas que na verdade sao ausencia. Este arquivo ja teve um
      teste assim, e o comentario de `municipios_a_resumir` conta a historia.
    */
    expect(
      (await db.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'provisionar_municipio'`,
      )).rows[0]!.n,
      "a funcao nao existe, entao as recusas abaixo nao provam nada",
    ).toBe("1");

    /*
      A primeira recusa e a que impede o defeito caro: sem ela, o dia em que
      alguem passar a senha digitada no lugar do hash termina com a senha do
      administrador em texto claro dentro de `usuarios`, onde ela fica para
      sempre.
    */
    for (const [rotulo, argumentos] of [
      ["senha em texto claro", pedido("Agua Limpa", { 6: "senha-que-a-pessoa-digitou" })],
      ["hash de outro formato", pedido("Agua Limpa", { 6: "bcrypt$2b$12$abcdefghijklmnop" })],
      ["sem operador", pedido("Agua Limpa", { 7: "   " })],
      ["uf que nao e uf", pedido("Agua Limpa", { 2: "MGG" })],
      ["email invalido", pedido("Agua Limpa", { 5: "rita-arroba-prefeitura" })],
    ] as const) {
      let recusou = false;
      try {
        await comoConsole(CHAMADA, argumentos);
      } catch {
        recusou = true;
      }
      expect(recusou, `a funcao aceitou ${rotulo}`).toBe(true);
    }

    expect(
      (await db.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM organizacoes WHERE municipio = 'Agua Limpa'",
      )).rows[0]!.n,
      "alguma das recusas aconteceu depois de escrever",
    ).toBe("0");
  });

  it("o papel de aplicacao de um municipio nao alcanca esta porta", async () => {
    /*
      `dc360_app` fica de fora do GRANT de proposito: criar prefeitura nao e ato
      de municipio nenhum. Com EXECUTE aqui, uma falha de autorizacao no painel
      de uma prefeitura viraria a capacidade de criar outra prefeitura, com um
      administrador escolhido por quem explorou a falha.
    */
    let mensagem = "";
    try {
      await db.transaction(async (tx) => {
        await tx.exec("SET LOCAL ROLE dc360_app");
        await tx.query(CHAMADA, pedido("Porto Velho do Sul"));
      });
    } catch (erro) {
      mensagem = erro instanceof Error ? erro.message : String(erro);
    }
    expect(
      mensagem.toLowerCase(),
      "o papel de aplicacao executou a funcao que cria municipio",
    ).toMatch(/permission denied|permissão negada/);
  });
});
