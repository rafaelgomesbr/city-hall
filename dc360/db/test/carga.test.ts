/**
 * Carga: 200 ocorrências, cinco aparelhos sincronizando juntos, dois
 * municípios disputando a mesma conexão.
 *
 * =====================================================================
 * O QUE ESTE ARQUIVO NÃO MEDE, e isto precisa vir antes de qualquer número
 * =====================================================================
 *
 * Ele NÃO mede desempenho, e nenhum tempo que ele imprima pode ser
 * apresentado como latência do produto.
 *
 * O motivo é concreto: não existe Postgres de servidor nesta máquina. Como
 * todo teste de banco deste repositório, este roda em PGlite, que é o
 * Postgres 16 compilado para WASM, com um único processo, uma única conexão
 * e o disco emulado em memória. Um milissegundo medido aí não tem relação
 * com um milissegundo medido num servidor com concorrência real, cache de
 * disco real e rede no meio. Publicar um número desses como "o sistema
 * responde em X ms" seria mentira, e a regra da casa é nunca declarar como
 * testado o que não foi testado.
 *
 * O que ele mede, e isso vale de verdade:
 *
 * 1. CORREÇÃO SOB VOLUME. Com 200 ocorrências ativas, a lista e o mapa
 *    devolvem todas ao longo das páginas, cada uma exatamente uma vez.
 * 2. CORREÇÃO SOB CONCORRÊNCIA. Cinco vistorias chegando entrelaçadas na
 *    mesma conexão, e a chave de idempotência segurando o reenvio.
 * 3. ISOLAMENTO SOB DISPUTA, agora com volume. O CA-06 já pegou um
 *    vazamento real que só aparecia com transações entrelaçadas (está
 *    escrito no cabeçalho de isolamento.test.ts); aqui a mesma pressão é
 *    repetida com 260 ocorrências no banco em vez de duas.
 * 4. FORMA DA CONSULTA. O EXPLAIN é a parte que transfere melhor para
 *    produção: o planejador do PGlite É o do Postgres 16, então "existe
 *    índice que cobre este predicado" é uma afirmação sobre o esquema, e o
 *    esquema é o mesmo em produção. O que não transfere é o custo escolhido,
 *    porque com 200 linhas uma varredura completa é legitimamente barata.
 *
 * PROIBIDO rodar carga contra defesa-civil.fly.dev ou contra o Supabase de
 * produção. São 200 ocorrências falsas e cinco vistorias falsas: no banco do
 * piloto isso é sujeira que alguém teria que limpar à mão, dentro de tabelas
 * cuja regra é que registro não se apaga.
 *
 * LIMITE CONHECIDO, dito de frente: este arquivo exercita a FORMA da
 * consulta, escrevendo o mesmo SQL que a rota escreve, e não a rota em si.
 * Se alguém mudar o ORDER BY dentro de apps/api sem mudar aqui, este teste
 * continua verde e o produto quebra. Quem fecha essa fresta é um teste de
 * rota em apps/api; este aqui prova que a forma acordada está certa, e serve
 * de referência do que a rota precisa escrever.
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

/** Serra Alta, o município que levou o temporal. */
const TOTAL_A = 200;
/** Vale Fundo, o vizinho em noite calma. Serve de contraprova do isolamento. */
const TOTAL_B = 60;
const POR_PAGINA = 25;

let db: PGlite;
let orgA: string;
let orgB: string;

/**
 * Executa como a aplicação executaria: papel sem privilégio e contexto de
 * tenant dentro da transação, igual a `apps/web/src/dados/banco.ts`.
 *
 * É cópia deliberada do helper de isolamento.test.ts. Testar concorrência com
 * um mecanismo diferente do que a aplicação usa atestaria algo que ninguém
 * executa, que foi exatamente o defeito da primeira versão daquele arquivo.
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

/**
 * A ordenação acordada para a lista paginada, com o desempate por id no fim.
 *
 * O DESEMPATE NÃO É ENFEITE, e esta é a linha mais importante do arquivo.
 *
 * As três primeiras chaves empatam muito no mundo real: numa noite de
 * temporal a central registra dezenas de chamados que ainda não passaram por
 * triagem, então eles têm o MESMO grupo de status, a MESMA severidade (nula,
 * que cai no ELSE 4) e o MESMO `criado_em`, porque `now()` é constante dentro
 * da transação que os inseriu. Quando todas as chaves empatam, o Postgres
 * pode devolver as linhas empatadas em qualquer ordem, e ele de fato devolve
 * ordens diferentes para OFFSET diferentes, porque o plano de LIMIT com
 * OFFSET pequeno usa top-N heapsort e o conjunto retido muda a cada página.
 *
 * O efeito não é cosmético: a mesma ocorrência aparece na página 1 e na 2, e
 * outra não aparece em página nenhuma. Medido neste próprio arquivo, com 200
 * ocorrências e páginas de 25, tirar o `, o.id` faz 12 ocorrências sumirem da
 * lista inteira. Doze casas que o coordenador nunca vê, numa tela cuja função
 * é dizer o que falta atender.
 */
const ORDEM_DA_LISTA = `
  ORDER BY
    CASE WHEN o.status IN ('encerrada','rascunho') THEN 1 ELSE 0 END,
    CASE o.severidade WHEN 'critica' THEN 0 WHEN 'alta' THEN 1
                      WHEN 'media' THEN 2 WHEN 'baixa' THEN 3 ELSE 4 END,
    o.criado_em DESC,
    o.id`;

/** O mesmo desempate na consulta do mapa, que ordena só por severidade. */
const ORDEM_DO_MAPA = `
  ORDER BY
    CASE severidade WHEN 'critica' THEN 0 WHEN 'alta' THEN 1
                    WHEN 'media' THEN 2 WHEN 'baixa' THEN 3 ELSE 4 END,
    criado_em DESC,
    id`;

/**
 * Semeia uma noite de temporal verossímil, e não 200 linhas idênticas.
 *
 * A distribuição importa para o teste valer. Ela reproduz três situações que
 * o painel encontra de verdade:
 *
 * - 60% esperando triagem, sem severidade e sem prazo, todas registradas no
 *   MESMO instante, porque entraram num lote da central. É o bloco que cria o
 *   empate de verdade e derruba paginação sem desempate.
 * - 20% já triadas, com prazo no futuro.
 * - 10% atrasadas, com prazo vencido. Fração pequena de propósito: é ela que
 *   torna o índice parcial de prazo seletivo, e um índice que não é seletivo
 *   não prova nada no EXPLAIN.
 * - 10% encerradas, que precisam existir para provar que saem da lista de
 *   ativas e caem no fim da ordenação.
 *
 * Uma em cada quatro das que esperam triagem fica sem coordenada, porque o
 * mapa precisa ter o que NÃO desenhar para a contagem de `semCoordenada`
 * significar alguma coisa.
 */
async function semear(org: string, quantidade: number, prefixo: number): Promise<void> {
  const esperandoTriagem = Math.round(quantidade * 0.6);
  const triadas = Math.round(quantidade * 0.2);
  const atrasadas = Math.round(quantidade * 0.1);
  const encerradas = quantidade - esperandoTriagem - triadas - atrasadas;

  await db.query(
    `INSERT INTO ocorrencias
       (organizacao_id, protocolo, tipo, status, endereco, solicitante_nome,
        canal_entrada, descricao, criado_em, prazo_em, latitude, longitude)
     SELECT $1,
            lpad(($3 + i)::text, 6, '0') || '/2026',
            (ARRAY['deslizamento','inundacao','alagamento','enxurrada','vendaval','granizo'])[1 + (i % 6)],
            'registrada',
            'Rua das Acácias, ' || i,
            'Moradora do bairro',
            'telefone',
            'Relato recebido pela central durante o temporal.',
            timestamptz '2026-09-01 22:10:00-03',
            NULL,
            CASE WHEN i % 4 = 0 THEN NULL ELSE -19.91 + (i::float / 10000) END,
            CASE WHEN i % 4 = 0 THEN NULL ELSE -43.94 + (i::float / 10000) END
       FROM generate_series(1, $2) i`,
    [org, esperandoTriagem, prefixo],
  );

  await db.query(
    `INSERT INTO ocorrencias
       (organizacao_id, protocolo, tipo, status, severidade, endereco,
        solicitante_nome, canal_entrada, descricao, criado_em, prazo_em,
        latitude, longitude)
     SELECT $1,
            lpad(($3 + i)::text, 6, '0') || '/2026',
            'deslizamento',
            (ARRAY['triagem','em_campo','vistoria_concluida'])[1 + (i % 3)],
            (ARRAY['critica','alta','media','baixa'])[1 + (i % 4)],
            'Avenida Central, ' || i,
            'Sindico do prédio',
            'whatsapp',
            'Triada e aguardando equipe.',
            timestamptz '2026-09-01 21:00:00-03' + (i * interval '1 min'),
            now() + interval '10 hours',
            -19.92 + (i::float / 10000),
            -43.95 + (i::float / 10000)
       FROM generate_series(1, $2) i`,
    [org, triadas, prefixo + esperandoTriagem],
  );

  await db.query(
    `INSERT INTO ocorrencias
       (organizacao_id, protocolo, tipo, status, severidade, endereco,
        solicitante_nome, canal_entrada, descricao, criado_em, prazo_em,
        latitude, longitude)
     SELECT $1,
            lpad(($3 + i)::text, 6, '0') || '/2026',
            'inundacao', 'em_campo', 'critica',
            'Beco do Riacho, ' || i,
            'Agente comunitário',
            'presencial',
            'Prazo vencido, equipe ainda em campo.',
            timestamptz '2026-09-01 19:00:00-03' + (i * interval '1 min'),
            now() - interval '3 hours',
            -19.93 + (i::float / 10000),
            -43.96 + (i::float / 10000)
       FROM generate_series(1, $2) i`,
    [org, atrasadas, prefixo + esperandoTriagem + triadas],
  );

  await db.query(
    `INSERT INTO ocorrencias
       (organizacao_id, protocolo, tipo, status, severidade, endereco,
        solicitante_nome, canal_entrada, descricao, criado_em, prazo_em,
        encerrado_em, motivo_encerramento, latitude, longitude)
     SELECT $1,
            lpad(($3 + i)::text, 6, '0') || '/2026',
            'vendaval', 'encerrada', 'baixa',
            'Travessa do Mirante, ' || i,
            'Morador',
            'telefone',
            'Atendida e encerrada.',
            timestamptz '2026-09-01 18:00:00-03' + (i * interval '1 min'),
            now() - interval '1 day',
            now() - interval '2 hours',
            'Risco cessou após poda da árvore.',
            -19.94 + (i::float / 10000),
            -43.97 + (i::float / 10000)
       FROM generate_series(1, $2) i`,
    [org, encerradas, prefixo + esperandoTriagem + triadas + atrasadas],
  );
}

/**
 * Percorre a lista página por página, do jeito que a tela percorre.
 *
 * `mexerNoMeio` reproduz o que sempre acontece num plantão: alguém triou uma
 * ocorrência enquanto o coordenador estava na página 2. A escrita mexe em
 * `descricao`, que NÃO participa da ordenação, de propósito. Se ela mexesse
 * em severidade, a linha mudaria de lugar por direito e a página seguinte
 * poderia repetir sem que isso fosse defeito nenhum. Mexendo num campo fora
 * da ordenação, qualquer repetição que apareça é culpa da ordem instável, e
 * de mais nada: no Postgres o UPDATE grava uma versão nova da linha no fim do
 * heap, e é essa mudança de posição física que a ordenação sem desempate
 * deixa vazar para o resultado.
 */
async function percorrerLista(
  org: string,
  ordem: string,
  opcoes: { mexerNoMeio?: boolean } = {},
): Promise<string[]> {
  const vistos: string[] = [];
  const paginas = Math.ceil(TOTAL_A / POR_PAGINA);

  for (let pagina = 1; pagina <= paginas; pagina++) {
    const r = await comoApp(org, (tx) =>
      tx.query<{ id: string }>(
        `SELECT o.id FROM ocorrencias o ${ordem} LIMIT $1 OFFSET $2`,
        [POR_PAGINA, (pagina - 1) * POR_PAGINA],
      ),
    );
    vistos.push(...r.rows.map((x) => x.id));

    if (pagina === 1 && opcoes.mexerNoMeio) {
      await comoApp(org, (tx) =>
        tx.query("UPDATE ocorrencias SET descricao = 'Triada durante a paginação' WHERE id = $1", [
          r.rows[5]!.id,
        ]),
      );
    }
  }
  return vistos;
}

/** Diz o que repetiu e o que sumiu, porque "faltou uma" não ajuda a depurar. */
function conferirCobertura(vistos: string[], esperados: Set<string>) {
  const contagem = new Map<string, number>();
  for (const id of vistos) contagem.set(id, (contagem.get(id) ?? 0) + 1);
  return {
    repetidas: [...contagem.entries()].filter(([, n]) => n > 1).map(([id]) => id),
    ausentes: [...esperados].filter((id) => !contagem.has(id)),
  };
}

/*
  O teto de tempo é explícito, e não por gosto de número grande.

  Esta preparação faz muito mais que a dos outros arquivos de banco: aplica as
  15 migrações, semeia 260 ocorrências e 780 eventos de trilha, e ainda roda
  ANALYZE, tudo em Postgres compilado para WASM. O padrão do vitest para hook é
  10 segundos, e numa máquina ocupada isso estoura: durante a escrita deste
  arquivo a preparação passou de 14 segundos uma vez, com outros processos
  disputando a CPU, e o arquivo inteiro foi reportado como falha sem que
  nenhuma asserção tivesse sido avaliada.

  Um portão que reprova por lentidão da máquina ensina o time a ignorar o
  vermelho, que é o pior estado em que um teste de isolamento pode estar.
*/
beforeAll(async () => {
  db = new PGlite();
  for (const migracao of migracoes) await db.exec(migracao);

  const a = await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('Defesa Civil de Serra Alta','Serra Alta','MG') RETURNING id",
  );
  const b = await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('Defesa Civil de Vale Fundo','Vale Fundo','MG') RETURNING id",
  );
  orgA = a.rows[0]!.id;
  orgB = b.rows[0]!.id;

  await semear(orgA, TOTAL_A, 0);
  await semear(orgB, TOTAL_B, 500);

  /*
    Três eventos de trilha por ocorrência, para a tabela de auditoria ficar a
    maior do banco, que é o que ela é na vida real: ela só cresce, porque
    correção entra como evento novo e nada nela se reescreve. Um EXPLAIN sobre
    trilha vazia não provaria nada.
  */
  await db.query(
    `INSERT INTO trilha_eventos
       (organizacao_id, ocorrencia_id, tipo, autor_nome, autor_papel, origem, ocorrido_em)
     SELECT oc.organizacao_id, oc.id, t.tipo, 'Servidor de plantão', 'operador',
            'escritorio', oc.criado_em + (t.passo * interval '10 min')
       FROM ocorrencias oc
       CROSS JOIN (VALUES ('registro', 0), ('triagem', 1), ('despacho', 2)) AS t(tipo, passo)`,
  );

  /*
    Sem ANALYZE o planejador trabalha com estimativa padrão e escolhe plano por
    chute, o que tornaria as asserções de EXPLAIN uma leitura da sorte. Roda
    como dono das tabelas, fora do papel de aplicação.
  */
  await db.exec("ANALYZE");
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("Volume: 200 ocorrências atravessando a paginação", () => {
  it("a semeadura montou a noite de temporal que o teste precisa", async () => {
    // Se a semeadura degenerar, os testes abaixo passam sem provar nada.
    const r = await comoApp(orgA, (tx) =>
      tx.query<{ total: number; ativas: number; atrasadas: number; empatadas: number }>(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE status NOT IN ('encerrada','rascunho'))::int AS ativas,
                count(*) FILTER (WHERE status NOT IN ('encerrada','rascunho')
                                   AND prazo_em IS NOT NULL AND prazo_em < now())::int AS atrasadas,
                count(*) FILTER (WHERE severidade IS NULL
                                   AND criado_em = timestamptz '2026-09-01 22:10:00-03')::int AS empatadas
           FROM ocorrencias`,
      ),
    );
    const d = r.rows[0]!;
    expect(d.total).toBe(TOTAL_A);
    expect(d.ativas).toBe(180);
    expect(d.atrasadas).toBe(20);
    // O bloco de empate precisa ser grande, senão a instabilidade não aparece.
    expect(d.empatadas).toBe(120);
  });

  it("as 200 aparecem uma vez cada ao longo das páginas, nenhuma repete e nenhuma some", async () => {
    const todas = await comoApp(orgA, (tx) =>
      tx.query<{ id: string }>("SELECT id FROM ocorrencias"),
    );
    const esperados = new Set(todas.rows.map((r) => r.id));
    expect(esperados.size).toBe(TOTAL_A);

    const vistos = await percorrerLista(orgA, ORDEM_DA_LISTA);
    const { repetidas, ausentes } = conferirCobertura(vistos, esperados);

    expect(repetidas, `ocorrências repetidas entre páginas: ${repetidas.length}`).toEqual([]);
    expect(ausentes, `ocorrências que não apareceram em página nenhuma: ${ausentes.length}`).toEqual(
      [],
    );
    expect(vistos).toHaveLength(TOTAL_A);
  });

  it("nenhuma ocorrência se perde quando alguém tria entre uma página e a outra", async () => {
    const todas = await comoApp(orgA, (tx) =>
      tx.query<{ id: string }>("SELECT id FROM ocorrencias"),
    );
    const esperados = new Set(todas.rows.map((r) => r.id));

    const vistos = await percorrerLista(orgA, ORDEM_DA_LISTA, { mexerNoMeio: true });
    const { repetidas, ausentes } = conferirCobertura(vistos, esperados);

    expect(repetidas, "escrita no meio da paginação fez ocorrência repetir").toEqual([]);
    expect(ausentes, "escrita no meio da paginação fez ocorrência sumir da lista").toEqual([]);
  });

  it("a contagem total bate com o que as páginas entregaram", async () => {
    // O total vai na resposta ao lado dos itens, e é ele que a tela usa para
    // dizer "200 ocorrências". Total que não bate com o percorrido é a tela
    // prometendo página que não existe, ou escondendo página que existe.
    const total = await comoApp(orgA, (tx) =>
      tx.query<{ total: string }>("SELECT count(*)::text AS total FROM ocorrencias o"),
    );
    const vistos = await percorrerLista(orgA, ORDEM_DA_LISTA);
    expect(Number(total.rows[0]!.total)).toBe(vistos.length);
  });

  it("o mapa devolve todos os pontos ao longo das páginas e conta os que não desenha", async () => {
    /*
      O mapa tem um contrato a mais que a lista: ele precisa dizer quantas
      ativas NÃO têm coordenada, porque essas não aparecem em desenho nenhum.
      Mapa que corta sem contar é informação falsa numa tela de decisão, que é
      o defeito registrado no comentário da própria rota.
    */
    const contagem = await comoApp(orgA, (tx) =>
      tx.query<{ com: string; sem: string }>(
        `SELECT count(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL)::text AS com,
                count(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL)::text AS sem
           FROM ocorrencias WHERE status NOT IN ('encerrada','rascunho')`,
      ),
    );
    const com = Number(contagem.rows[0]!.com);
    const sem = Number(contagem.rows[0]!.sem);
    expect(com + sem).toBe(180);
    expect(sem, "sem ponto faltando, o teste não prova a contagem de semCoordenada").toBeGreaterThan(
      0,
    );

    const vistos: string[] = [];
    const paginas = Math.ceil(com / POR_PAGINA);
    for (let pagina = 1; pagina <= paginas; pagina++) {
      const r = await comoApp(orgA, (tx) =>
        tx.query<{ id: string }>(
          `SELECT id FROM ocorrencias
            WHERE status NOT IN ('encerrada','rascunho')
              AND latitude IS NOT NULL AND longitude IS NOT NULL
            ${ORDEM_DO_MAPA} LIMIT $1 OFFSET $2`,
          [POR_PAGINA, (pagina - 1) * POR_PAGINA],
        ),
      );
      vistos.push(...r.rows.map((x) => x.id));
    }

    expect(new Set(vistos).size, "ponto repetido entre páginas do mapa").toBe(vistos.length);
    expect(vistos).toHaveLength(com);
  });
});

describe("Cinco aparelhos sincronizando ao mesmo tempo", () => {
  /*
    HONESTIDADE SOBRE O QUE "AO MESMO TEMPO" SIGNIFICA AQUI.

    PGlite tem uma conexão só, então `Promise.all` entrelaça as transações em
    vez de rodá-las em paralelo de verdade. Não dá para simular disputa de
    lock entre processos separados nesta máquina, e este arquivo não finge que
    dá.

    O que o entrelaçamento pega, e já pegou neste projeto, é a classe de
    defeito em que o contexto de uma transação vaza para a seguinte porque as
    duas dividem a conexão. E a chave de idempotência é testada pelo que ela
    realmente é: uma restrição única no banco, que vale igual com uma conexão
    ou com cinquenta, porque quem a aplica é o Postgres e não o cliente.
  */
  const chaves = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
    "44444444-4444-4444-8444-444444444444",
    "55555555-5555-4555-8555-555555555555",
  ];
  let alvos: string[] = [];

  beforeAll(async () => {
    const r = await comoApp(orgA, (tx) =>
      tx.query<{ id: string }>(
        "SELECT id FROM ocorrencias WHERE status = 'em_campo' ORDER BY protocolo LIMIT 5",
      ),
    );
    alvos = r.rows.map((x) => x.id);
    expect(alvos).toHaveLength(5);
  });

  /**
   * O envio que o aparelho faz ao reencontrar sinal.
   *
   * `ON CONFLICT ... DO UPDATE` com atribuição inócua, e não `DO NOTHING`,
   * porque `DO NOTHING` não devolve linha no RETURNING: o aparelho reenviando
   * receberia resposta vazia e não teria como saber que a coleta dele já está
   * salva. Sem o id de volta, o aplicativo mantém o item na fila e tenta para
   * sempre.
   */
  async function sincronizar(org: string, indice: number, chave: string) {
    return comoApp(org, (tx) =>
      tx.query<{ id: string }>(
        `INSERT INTO vistorias
           (organizacao_id, ocorrencia_id, checklist, assinante_nome, coletada_em,
            idempotency_key, desalojados)
         VALUES ($1, $2, '[]'::jsonb, $3, now(), $4, $5)
         ON CONFLICT (organizacao_id, idempotency_key)
           DO UPDATE SET organizacao_id = vistorias.organizacao_id
         RETURNING id`,
        [org, alvos[indice], `Agente de campo ${indice + 1}`, chave, indice],
      ),
    );
  }

  it("cinco vistorias chegando juntas: nenhuma se perde e nenhuma duplica", async () => {
    const resultados = await Promise.all(
      chaves.map((chave, i) => sincronizar(orgA, i, chave)),
    );

    const ids = resultados.map((r) => r.rows[0]!.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size, "dois aparelhos receberam o mesmo id de vistoria").toBe(5);

    const total = await comoApp(orgA, (tx) =>
      tx.query<{ n: number }>("SELECT count(*)::int AS n FROM vistorias"),
    );
    expect(total.rows[0]!.n).toBe(5);
  });

  it("o mesmo aparelho reenviando a mesma coleta não cria segunda vistoria", async () => {
    /*
      Reenviar é o caso comum, não a exceção: o agente sai do sinal no meio do
      envio e o aplicativo tenta de novo quando a rede volta. Se cada tentativa
      virasse linha, o laudo contaria a mesma vistoria duas vezes, e a contagem
      de desalojados do município sairia dobrada no relatório.
    */
    const antes = await comoApp(orgA, (tx) =>
      tx.query<{ n: number }>("SELECT count(*)::int AS n FROM vistorias"),
    );

    const primeiro = await Promise.all(chaves.map((chave, i) => sincronizar(orgA, i, chave)));
    const segundo = await Promise.all(chaves.map((chave, i) => sincronizar(orgA, i, chave)));

    expect(
      segundo.map((r) => r.rows[0]!.id),
      "o reenvio devolveu id diferente, então o aparelho criaria vistoria nova",
    ).toEqual(primeiro.map((r) => r.rows[0]!.id));

    const depois = await comoApp(orgA, (tx) =>
      tx.query<{ n: number }>("SELECT count(*)::int AS n FROM vistorias"),
    );
    expect(depois.rows[0]!.n, "reenvio criou vistoria a mais").toBe(antes.rows[0]!.n);
  });

  it("chave repetida num INSERT simples é RECUSADA pelo banco, e não ignorada", async () => {
    /*
      Este teste existe por causa da FORMA que a rota de sincronização usa hoje
      (apps/api/src/rotas/sincronizacao.ts): ela consulta a chave primeiro e só
      insere se não achou nada, num INSERT simples, sem ON CONFLICT.

      Para o reenvio comum, que é o aparelho tentando de novo DEPOIS que a
      primeira tentativa terminou, essa forma está correta e devolve o id
      anterior. O que este teste fixa é o que acontece no caso que sobra: dois
      envios da mesma chave em voo ao mesmo tempo, quando o aplicativo desiste
      por tempo esgotado e repete enquanto o servidor ainda processa o primeiro.
      Aí os dois passam pela consulta sem achar nada e os dois tentam inserir.

      O banco segura o dado, e é isso que a asserção prova: a segunda inserção
      é RECUSADA, então vistoria duplicada não existe em hipótese nenhuma. Mas
      ela é recusada com erro, e não silenciosamente: quem chama precisa tratar
      a violação de unicidade e responder como reenvio, senão o agente vê falha
      numa coleta que na verdade está salva, e o item fica preso na fila do
      aparelho para sempre.

      LIMITE: a corrida de verdade, com as duas transações em voo, não é
      reproduzível aqui, porque PGlite tem uma conexão só. O que este teste
      prova é a consequência da corrida, que é o comportamento do banco diante
      da chave repetida, e essa parte não depende de quantas conexões existem.
    */
    const chave = chaves[1]!;
    const antes = await comoApp(orgA, (tx) =>
      tx.query<{ n: number }>("SELECT count(*)::int AS n FROM vistorias"),
    );

    await expect(
      comoApp(orgA, (tx) =>
        tx.query(
          `INSERT INTO vistorias
             (organizacao_id, ocorrencia_id, checklist, assinante_nome, coletada_em,
              idempotency_key)
           VALUES ($1, $2, '[]'::jsonb, 'Mesmo agente, segundo envio', now(), $3)`,
          [orgA, alvos[1], chave],
        ),
      ),
    ).rejects.toThrow();

    const depois = await comoApp(orgA, (tx) =>
      tx.query<{ n: number }>("SELECT count(*)::int AS n FROM vistorias"),
    );
    expect(depois.rows[0]!.n, "a chave repetida entrou e duplicou a vistoria").toBe(
      antes.rows[0]!.n,
    );
  });

  it("a chave de idempotência é por município, e não global", async () => {
    /*
      A restrição é UNIQUE (organizacao_id, idempotency_key), e o par importa.
      Fosse única global, dois municípios sorteando o mesmo uuid fariam o
      segundo envio ser recusado ou, pior, cair no ON CONFLICT e devolver o id
      da vistoria do OUTRO município: um vazamento de existência pela porta dos
      fundos, do mesmo tipo que a resposta 404 no lugar de 403 existe para
      impedir.
    */
    const alvoDeB = await comoApp(orgB, (tx) =>
      tx.query<{ id: string }>("SELECT id FROM ocorrencias WHERE status = 'em_campo' LIMIT 1"),
    );

    const criada = await comoApp(orgB, (tx) =>
      tx.query<{ id: string }>(
        `INSERT INTO vistorias
           (organizacao_id, ocorrencia_id, checklist, assinante_nome, coletada_em, idempotency_key)
         VALUES ($1, $2, '[]'::jsonb, 'Agente de Vale Fundo', now(), $3)
         RETURNING id`,
        [orgB, alvoDeB.rows[0]!.id, chaves[0]],
      ),
    );

    const idDeA = await comoApp(orgA, (tx) =>
      tx.query<{ id: string }>("SELECT id FROM vistorias WHERE idempotency_key = $1", [chaves[0]]),
    );

    expect(criada.rows[0]!.id).not.toBe(idDeA.rows[0]!.id);
    expect(idDeA.rows, "Serra Alta enxergou mais de uma vistoria com a própria chave").toHaveLength(
      1,
    );
  });
});

describe("Dois municípios sob concorrência, agora com volume", () => {
  it("sob disputa da mesma conexão, cada município conta só as próprias", async () => {
    /*
      O CA-06 já roda esta pressão com duas ocorrências. Aqui ela roda com 260
      no banco, porque o vazamento que interessa é o que aparece quando a
      consulta demora o bastante para outra transação se meter no meio, e
      consulta sobre duas linhas não demora nada.
    */
    const rodadas = 12;
    const resultados = await Promise.all(
      Array.from({ length: rodadas }, (_, i) => i).flatMap((i) => [
        comoApp(orgA, (tx) =>
          tx.query<{ n: number }>("SELECT count(*)::int AS n FROM ocorrencias"),
        ).then((r) => ({ quem: "A", i, n: r.rows[0]!.n })),
        comoApp(orgB, (tx) =>
          tx.query<{ n: number }>("SELECT count(*)::int AS n FROM ocorrencias"),
        ).then((r) => ({ quem: "B", i, n: r.rows[0]!.n })),
      ]),
    );

    for (const r of resultados) {
      const esperado = r.quem === "A" ? TOTAL_A : TOTAL_B;
      expect(r.n, `rodada ${r.i}: o município ${r.quem} contou ${r.n} em vez de ${esperado}`).toBe(
        esperado,
      );
    }
  });

  it("paginação concorrente dos dois municípios não mistura ocorrência", async () => {
    /*
      Este é o caso que o entrelaçamento existe para pegar: as duas paginações
      alternam SET LOCAL e SELECT na mesma conexão. Se o contexto de tenant
      escorregar entre elas, a página de Serra Alta traz endereço de Vale
      Fundo, e o endereço é o que distingue, porque os protocolos dos dois
      municípios se repetem por direito.
    */
    const paginasDeA = Array.from({ length: 8 }, (_, i) => i + 1);
    const paginasDeB = Array.from({ length: 3 }, (_, i) => i + 1);

    const consulta = (org: string, pagina: number) =>
      comoApp(org, (tx) =>
        tx.query<{ id: string; organizacao_id: string }>(
          `SELECT o.id, o.organizacao_id FROM ocorrencias o ${ORDEM_DA_LISTA}
            LIMIT $1 OFFSET $2`,
          [POR_PAGINA, (pagina - 1) * POR_PAGINA],
        ),
      );

    const resultados = await Promise.all([
      ...paginasDeA.map((p) => consulta(orgA, p).then((r) => ({ quem: orgA, r }))),
      ...paginasDeB.map((p) => consulta(orgB, p).then((r) => ({ quem: orgB, r }))),
    ]);

    for (const { quem, r } of resultados) {
      for (const linha of r.rows) {
        expect(
          linha.organizacao_id,
          "uma página trouxe ocorrência de outro município",
        ).toBe(quem);
      }
    }

    // E o conjunto de A continua completo depois de toda a disputa.
    const vistosDeA = resultados
      .filter((x) => x.quem === orgA)
      .flatMap((x) => x.r.rows.map((l) => l.id));
    expect(new Set(vistosDeA).size, "a disputa fez a lista de A repetir ocorrência").toBe(
      vistosDeA.length,
    );
  });

  it("escrita em volume de um município não alcança o outro", async () => {
    await Promise.all([
      comoApp(orgA, (tx) =>
        tx.query("UPDATE ocorrencias SET solicitante_contato = 'contato de Serra Alta'"),
      ),
      comoApp(orgB, (tx) =>
        tx.query("UPDATE ocorrencias SET solicitante_contato = 'contato de Vale Fundo'"),
      ),
    ]);

    // Fora do papel de aplicação, para enxergar os dois municípios de uma vez.
    const erradas = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM ocorrencias oc JOIN organizacoes o ON o.id = oc.organizacao_id
        WHERE oc.solicitante_contato <> 'contato de ' || o.municipio`,
    );
    expect(erradas.rows[0]!.n, "linhas que receberam escrita do município errado").toBe(0);
  });
});

describe("Forma da consulta: EXPLAIN mostra índice, e não varredura completa", () => {
  /*
    ESTA É A PARTE QUE TRANSFERE PARA PRODUÇÃO, e vale explicar por quê.

    O planejador do PGlite é o do Postgres 16 de verdade, e o esquema aqui é o
    mesmo que a migração cria no servidor. Então "existe índice que cobre este
    predicado, e o predicado entra como Index Cond" é uma afirmação sobre o
    esquema, e ela vale igual em produção.

    O que NÃO transfere é a escolha do planejador com 200 linhas. Numa tabela
    pequena a varredura completa é legitimamente mais barata que o índice, e
    quando o Postgres a escolhe ele está certo. Por isso as asserções abaixo
    miram nas consultas em que o predicado é seletivo (20 atrasadas entre 200),
    onde o índice tem que ganhar. Uma asserção de EXPLAIN sobre consulta não
    seletiva seria leitura de sorte, e passaria ou falharia conforme o humor da
    estatística.
  */
  async function planoDe(org: string, sql: string): Promise<string> {
    const r = await comoApp(org, (tx) => tx.query<Record<string, string>>(`EXPLAIN ${sql}`));
    return r.rows.map((linha) => linha["QUERY PLAN"]).join("\n");
  }

  it("o filtro de atrasadas entra pelo índice parcial, com prazo_em dentro da condição", async () => {
    /*
      O predicado é o mesmo de `condicaoAtrasada` em apps/api/src/rotas/
      ocorrencias.ts, e o índice que deve atendê-lo é o parcial criado na
      migração 001:

        ocorrencias_org_prazo_idx (organizacao_id, prazo_em)
          WHERE status NOT IN ('encerrada','rascunho')

      A asserção que importa não é só "usou índice": é que `prazo_em` apareça
      dentro do Index Cond. Se ele aparecer apenas em Filter, o banco está
      lendo TODAS as ocorrências do município e descartando depois, que é o
      plano que fica caro exatamente quando o município tem histórico grande,
      ou seja, no ano dois do contrato e não na demonstração.
    */
    const plano = await planoDe(
      orgA,
      `SELECT count(*) FROM ocorrencias
        WHERE status NOT IN ('encerrada','rascunho')
          AND prazo_em IS NOT NULL AND prazo_em < now()`,
    );

    expect(plano, `plano do filtro de atrasadas:\n${plano}`).toContain("ocorrencias_org_prazo_idx");
    expect(plano, `varredura completa no filtro de atrasadas:\n${plano}`).not.toContain(
      "Seq Scan on ocorrencias",
    );

    const condicaoDoIndice = plano
      .split("\n")
      .filter((l) => l.includes("Index Cond:"))
      .join("\n");
    expect(
      condicaoDoIndice,
      `prazo_em ficou fora do Index Cond, então o banco filtra depois de ler tudo:\n${plano}`,
    ).toContain("prazo_em");
  });

  it("a lista paginada entra pelo índice do município, e não varre a tabela", async () => {
    /*
      Achado que fica registrado aqui porque ele é da FORMA da consulta e não
      do índice: o ORDER BY da lista ordena por duas expressões CASE, e
      expressão CASE não é indexável por índice comum. O plano portanto tem um
      Sort do conjunto ativo inteiro em TODA página, inclusive na última.

      Com 200 ocorrências isso é irrelevante. A observação fica escrita para o
      dia em que um município chegar a dezenas de milhares de ativas: a saída
      dali é paginar por cursor (chave composta em vez de OFFSET), não índice
      novo. Não é dívida para agora, e inventar índice de expressão hoje seria
      complicar o esquema por um problema que ninguém tem.
    */
    const plano = await planoDe(
      orgA,
      `SELECT o.* FROM ocorrencias o
        WHERE o.status NOT IN ('encerrada','rascunho')
        ${ORDEM_DA_LISTA} LIMIT 25 OFFSET 50`,
    );

    expect(plano, `a lista paginada varreu a tabela inteira:\n${plano}`).not.toContain(
      "Seq Scan on ocorrencias",
    );
    expect(plano, `plano da lista:\n${plano}`).toContain("Index Scan");
  });

  it("a trilha de auditoria de uma ocorrência entra pelo índice, e não varre a trilha", async () => {
    /*
      A trilha é append-only e só cresce: ela é a tabela que primeiro fica
      grande em qualquer município ativo. Abrir uma ocorrência lê a trilha
      dela, e esse é o caminho que não pode virar varredura.
    */
    const quantos = await comoApp(orgA, (tx) =>
      tx.query<{ n: number }>("SELECT count(*)::int AS n FROM trilha_eventos"),
    );
    // Índice sobre tabela vazia é escolha sem mérito, e a asserção seria oca.
    expect(quantos.rows[0]!.n).toBe(TOTAL_A * 3);

    const alvo = await comoApp(orgA, (tx) =>
      tx.query<{ id: string }>("SELECT id FROM ocorrencias LIMIT 1"),
    );
    const plano = await planoDe(
      orgA,
      `SELECT * FROM trilha_eventos WHERE ocorrencia_id = '${alvo.rows[0]!.id}'
        ORDER BY ocorrido_em`,
    );
    expect(plano, `a trilha foi varrida inteira:\n${plano}`).not.toContain(
      "Seq Scan on trilha_eventos",
    );
  });
});
