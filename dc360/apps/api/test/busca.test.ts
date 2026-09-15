import type { FastifyInstance } from "fastify";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { aplicarMigracoes, carregarMigracoes, carregarSemente } from "@dc360/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import type { Consulta } from "../src/banco/tipos.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { TETO_POR_GRUPO, BUSCAS_POR_MINUTO } from "../src/rotas/busca.js";

/**
 * `GET /busca?q=`: a caixa de busca do painel, pelo lado do servidor.
 *
 * O PEDIDO, NA LETRA DE QUEM PAGA: "esse input tem que conseguir indexar
 * praticamente qualquer registro e qualquer funcionalidade dela com tolerância
 * a erro". Os registros são desta rota; as funcionalidades são do painel e
 * ficam no navegador.
 *
 * O que este arquivo fixa, e cada item é uma promessa do contrato combinado
 * entre as duas frentes:
 *
 * 1. Autenticada, `q` de 2 a 100 caracteres, e a resposta tem a forma fixa:
 *    `consulta`, `teto`, `grupos[]` com `tipo` e `itens[]`. Grupo vazio some;
 *    `severidade` e `status` só existem no grupo de ocorrência.
 * 2. Os quatro exemplos de tolerância: "Servidao Boa Esperansa", "00012",
 *    "joana silv", "bombeiro".
 * 3. VISIBILIDADE POR PAPEL, e a regra é a MESMA da rota de lista de cada
 *    tipo: quem não pode `GET /usuarios` não recebe o grupo de usuários; o
 *    agente de campo só acha ocorrência da equipe dele em campo, que é a
 *    regra de `GET /campo/meu-trabalho`. Nenhuma permissão nova.
 * 4. REGISTRO DE CONSULTA: quando a ocorrência entrou no resultado porque o
 *    NOME DO SOLICITANTE casou, fica linha em `ocorrencia_consultas` com o
 *    recurso `busca`. Quando casou por protocolo ou endereço, não fica, pelo
 *    mesmo critério de `privacidade/consulta.ts`: a lista e o mapa entregam
 *    endereço sem registrar, e a busca por endereço é a mesma coisa.
 * 5. Teto próprio por pessoa, com 429.
 *
 * DOIS SABORES DE BANCO, e os dois rodam a suíte inteira. O `new PGlite()`
 * de `bancoEmMemoria` não tem `pg_trgm`, e é o que a API usa sem
 * `DATABASE_URL`; a produção (Supabase) tem. A migração 041 tem um caminho
 * para cada, e a rota não pode saber a diferença.
 */

const SENHA = "defesa-civil-2026";
/** O mesmo hash da semente, para não derivar scrypt de novo a cada usuário extra. */
const HASH_DA_SEMENTE =
  "scrypt$131072$8$1$56BVGGGziTxmINg0pEIjxw$F-aIq495xKVd9OKClsyKAFxxLHj26KkyKIWFMFAnBwk";

const ORG_A = "11111111-1111-4111-8111-000000000001";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";
const EQUIPE_BRAVO = "11111111-1111-4111-8111-0000000000e2";
/** Da semente: em campo, equipe Alfa, solicitante Marilda Souza Prado. */
const OCORRENCIA_DA_ALFA = "11111111-1111-4111-8111-0000000000c1";
const OCORRENCIA_DA_BUSCA = "11111111-1111-4111-8111-00000000b001";
const AGENTE_SEM_EQUIPE = "11111111-1111-4111-8111-00000000d0a1";

type Item = {
  id: string; titulo: string; detalhe: string; pontuacao: number;
  protocolo?: string; severidade?: string | null; status?: string;
};
type Grupo = { tipo: string; itens: Item[] };
type Resposta = { consulta: string; teto: number; grupos: Grupo[] };

/**
 * O banco em memória COM `pg_trgm`, no mesmo desenho de `bancoEmMemoria`:
 * o mesmo aplicador de migrações, a mesma semente, o mesmo `SET LOCAL ROLE`
 * e o mesmo contexto de município dentro de `db.transaction()`. A única
 * diferença é a extensão no construtor.
 */
async function bancoComTrigramas(): Promise<BancoEmMemoria> {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.waitReady;
  await aplicarMigracoes(
    {
      query: async <T>(sql: string, params?: readonly unknown[]) => {
        const r = await db.query<Record<string, unknown>>(sql, params ? [...params] : undefined);
        return { rows: r.rows as T[] };
      },
      exec: (sql: string) => db.exec(sql),
    },
    carregarMigracoes(),
  );
  await db.exec(carregarSemente());

  async function emTransacao<T>(org: string | null, execucao: (c: Consulta) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE dc360_app");
      if (org) await tx.query("SELECT set_config('app.organizacao_atual', $1, true)", [org]);
      return execucao(tx as unknown as Consulta);
    }) as Promise<T>;
  }
  return {
    banco: {
      comTenant: (org, execucao) => emTransacao(org, execucao),
      semTenant: (execucao) => emTransacao(null, execucao),
      encerrar: () => db.close(),
    },
    bruto: db,
  };
}

const SABORES = [
  { nome: "com pg_trgm (producao)", montar: bancoComTrigramas },
  { nome: "sem pg_trgm (API sem DATABASE_URL)", montar: () => bancoEmMemoria({ semear: true }) },
];

describe.each(SABORES)("GET /busca, $nome", ({ montar }) => {
  let mem: BancoEmMemoria;
  let app: FastifyInstance;
  let tokenCoordenadora: string;
  let tokenOperador: string;
  let tokenAgente: string;
  let tokenAgenteSemEquipe: string;
  let tokenDeFora: string;

  async function entrar(email: string): Promise<string> {
    const r = await app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA } });
    if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
    return r.json().acesso;
  }
  const com = (t: string) => ({ authorization: `Bearer ${t}` });

  async function buscar(token: string, q: string) {
    return app.inject({ method: "GET", url: `/busca?q=${encodeURIComponent(q)}`, headers: com(token) });
  }
  async function grupos(token: string, q: string): Promise<Resposta> {
    const r = await buscar(token, q);
    expect(r.statusCode, r.body).toBe(200);
    return r.json() as Resposta;
  }
  function grupo(resposta: Resposta, tipo: string): Grupo | undefined {
    return resposta.grupos.find((g) => g.tipo === tipo);
  }

  async function consultasDe(ocorrenciaId: string) {
    const r = await mem.bruto.query<{ recurso: string; finalidade: string; usuario_nome: string }>(
      "SELECT recurso, finalidade, usuario_nome FROM ocorrencia_consultas WHERE ocorrencia_id = $1",
      [ocorrenciaId],
    );
    return r.rows;
  }

  beforeAll(async () => {
    mem = await montar();
    const config = carregarConfig({
      NODE_ENV: "test",
      JWT_SEGREDO: "segredo-da-busca-com-tolerancia-a-erro-32b",
      LOGIN_POR_IP: "10000",
    } as NodeJS.ProcessEnv);
    app = await construirServidor({
      banco: mem.banco, config,
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
    });
    await app.ready();

    // Os quatro exemplos combinados, mais o que os casos de visibilidade precisam.
    await mem.bruto.query(
      `INSERT INTO ocorrencias
         (id, organizacao_id, protocolo, tipo, status, severidade, endereco,
          solicitante_nome, canal_entrada, descricao, equipe_id)
       VALUES ($1, $2, '000123/2026', 'deslizamento', 'em_campo', 'alta',
               'Servidão Boa Esperança, 148', 'Joana da Silva Prado', 'telefone',
               'Talude cedeu.', $3)`,
      [OCORRENCIA_DA_BUSCA, ORG_A, EQUIPE_BRAVO],
    );
    await mem.bruto.query(
      `INSERT INTO ocorrencias
         (organizacao_id, protocolo, tipo, status, endereco, solicitante_nome,
          canal_entrada, descricao)
       SELECT $1, lpad((i + 5000)::text, 6, '0') || '/2026', 'alagamento', 'registrada',
              'Travessa das Palmeiras, ' || i, 'Morador ' || i, 'telefone', 'Água na rua.'
         FROM generate_series(1, 12) AS i`,
      [ORG_A],
    );
    await mem.bruto.query(
      `INSERT INTO usuarios (id, organizacao_id, nome, matricula, email, papel, equipe_id, senha_hash)
       VALUES (gen_random_uuid(), $1, 'Joana da Silva Prado', '0001',
               'joana.prado@serraalta.exemplo.gov.br', 'agente_campo', $2, $3),
              ($4, $1, 'Agente Recém Cadastrado', '0002',
               'recem.cadastrado@serraalta.exemplo.gov.br', 'agente_campo', NULL, $3)`,
      [ORG_A, EQUIPE_ALFA, HASH_DA_SEMENTE, AGENTE_SEM_EQUIPE],
    );
    /*
      A semente já traz órgãos pelo gatilho das providências (migração 017),
      e "Corpo de Bombeiros" pode estar entre eles: a sigla entra por cima.
    */
    await mem.bruto.query(
      `INSERT INTO orgaos (organizacao_id, nome, sigla)
       VALUES ($1, 'Corpo de Bombeiros', 'CBMSC'), ($1, 'Secretaria de Obras', NULL)
       ON CONFLICT (organizacao_id, lower(trim(nome))) DO UPDATE SET sigla = EXCLUDED.sigla`,
      [ORG_A],
    );
    await mem.bruto.exec("ANALYZE");

    tokenCoordenadora = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
    tokenOperador = await entrar("jonas.ferreira@serraalta.exemplo.gov.br");
    tokenAgente = await entrar("diego.alves@serraalta.exemplo.gov.br");
    tokenAgenteSemEquipe = await entrar("recem.cadastrado@serraalta.exemplo.gov.br");
    tokenDeFora = await entrar("aurelio.machado@valefundo.exemplo.gov.br");
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await mem?.banco.encerrar();
  });

  describe("porta e forma", () => {
    it("401 sem token", async () => {
      const r = await app.inject({ method: "GET", url: "/busca?q=servidao" });
      expect(r.statusCode).toBe(401);
    });

    it("422 com q curto, longo ou ausente", async () => {
      expect((await buscar(tokenCoordenadora, "a")).statusCode).toBe(422);
      expect((await buscar(tokenCoordenadora, "x".repeat(101))).statusCode).toBe(422);
      const sem = await app.inject({ method: "GET", url: "/busca", headers: com(tokenCoordenadora) });
      expect(sem.statusCode).toBe(422);
    });

    it("apara o termo antes de medir", async () => {
      expect((await buscar(tokenCoordenadora, "   a   ")).statusCode).toBe(422);
      expect((await buscar(tokenCoordenadora, "  ab  ")).statusCode).toBe(200);
    });

    it("devolve a forma fixa: consulta normalizada, teto, grupos sem vazio", async () => {
      const r = await grupos(tokenCoordenadora, "Servidão Boa Esperança");
      expect(r.consulta).toBe("servidao boa esperanca");
      expect(r.teto).toBe(TETO_POR_GRUPO);
      expect(r.grupos.map((g) => g.tipo)).toEqual(["ocorrencia"]);
      for (const g of r.grupos) expect(g.itens.length).toBeGreaterThan(0);
    });

    it("um termo que só tem pontuação responde vazio, e não erro", async () => {
      const r = await grupos(tokenCoordenadora, "%%%");
      expect(r.consulta).toBe("");
      expect(r.grupos).toEqual([]);
    });

    it("severidade e status só existem no grupo de ocorrência, e os rótulos vêm do pacote compartilhado", async () => {
      const r = await grupos(tokenCoordenadora, "joana");
      const oc = grupo(r, "ocorrencia")!;
      const item = oc.itens.find((i) => i.protocolo === "000123/2026")!;
      expect(item).toMatchObject({
        id: OCORRENCIA_DA_BUSCA,
        protocolo: "000123/2026",
        titulo: "Servidão Boa Esperança, 148",
        detalhe: "Deslizamento, em campo",
        severidade: "alta",
        status: "em_campo",
      });
      expect(typeof item.pontuacao).toBe("number");

      const us = grupo(r, "usuario")!;
      const joana = us.itens.find((i) => i.titulo === "Joana da Silva Prado")!;
      expect(joana.detalhe).toBe("Agente de campo, matrícula 0001");
      expect(joana).not.toHaveProperty("severidade");
      expect(joana).not.toHaveProperty("status");
      expect(joana).not.toHaveProperty("protocolo");
    });

    it("cada grupo sai em ordem de pontuação decrescente", async () => {
      const r = await grupos(tokenCoordenadora, "palmeiras");
      for (const g of r.grupos) {
        const p = g.itens.map((i) => i.pontuacao);
        expect(p).toEqual([...p].sort((a, b) => b - a));
      }
    });
  });

  describe("tolerância a erro: os quatro exemplos combinados", () => {
    it("'Servidao Boa Esperansa' acha 'Servidão Boa Esperança'", async () => {
      const r = await grupos(tokenCoordenadora, "Servidao Boa Esperansa");
      expect(grupo(r, "ocorrencia")!.itens.map((i) => i.titulo)).toContain("Servidão Boa Esperança, 148");
    });

    it("'00012' acha '000123/2026'", async () => {
      const r = await grupos(tokenCoordenadora, "00012");
      expect(grupo(r, "ocorrencia")!.itens[0]!.protocolo).toBe("000123/2026");
    });

    it("'joana silv' acha 'Joana da Silva Prado'", async () => {
      const r = await grupos(tokenCoordenadora, "joana silv");
      expect(grupo(r, "usuario")!.itens.map((i) => i.titulo)).toContain("Joana da Silva Prado");
    });

    it("'bombeiro' acha 'Corpo de Bombeiros', com a sigla no detalhe", async () => {
      const r = await grupos(tokenCoordenadora, "bombeiro");
      expect(grupo(r, "orgao")!.itens).toEqual([
        expect.objectContaining({ titulo: "Corpo de Bombeiros", detalhe: "CBMSC" }),
      ]);
    });

    it("equipe sai com quantas pessoas ativas tem", async () => {
      const r = await grupos(tokenCoordenadora, "equipe alfa");
      const alfa = grupo(r, "equipe")!.itens.find((i) => i.titulo === "Equipe Alfa")!;
      // Diego (semente) e Joana (deste arquivo).
      expect(alfa.detalhe).toBe("2 pessoas");
    });
  });

  describe("teto por grupo", () => {
    it("corta em TETO_POR_GRUPO itens, e não em menos nem em mais", async () => {
      // 12 travessas deste arquivo mais a "Rua das Palmeiras" da semente.
      const r = await grupos(tokenCoordenadora, "palmeiras");
      expect(grupo(r, "ocorrencia")!.itens).toHaveLength(TETO_POR_GRUPO);
    });
  });

  describe("visibilidade por papel: a mesma regra da rota de lista de cada tipo", () => {
    it("o operador não recebe o grupo de usuários, porque não pode GET /usuarios", async () => {
      const lista = await app.inject({ method: "GET", url: "/usuarios", headers: com(tokenOperador) });
      expect(lista.statusCode).toBe(403);

      const r = await grupos(tokenOperador, "joana");
      expect(grupo(r, "usuario")).toBeUndefined();
      // E continua achando a ocorrência, o órgão e a equipe, que ele pode listar.
      expect(grupo(r, "ocorrencia")).toBeDefined();
      expect(grupo(await grupos(tokenOperador, "bombeiro"), "orgao")).toBeDefined();
      expect(grupo(await grupos(tokenOperador, "alfa"), "equipe")).toBeDefined();
    });

    it("a coordenadora recebe os quatro grupos quando os quatro casam", async () => {
      const r = await grupos(tokenCoordenadora, "alfa");
      expect(grupo(r, "equipe")).toBeDefined();
      const r2 = await grupos(tokenCoordenadora, "joana");
      expect(r2.grupos.map((g) => g.tipo).sort()).toEqual(["ocorrencia", "usuario"]);
    });

    it("o agente de campo só acha ocorrência da equipe dele em campo (regra de /campo/meu-trabalho)", async () => {
      // 000471 é da Alfa e está em campo: aparece.
      const daAlfa = await grupos(tokenAgente, "acacias");
      expect(grupo(daAlfa, "ocorrencia")!.itens.map((i) => i.id)).toEqual([OCORRENCIA_DA_ALFA]);

      // 000123 é da Bravo: para o Diego, não existe.
      const daBravo = await grupos(tokenAgente, "Servidao Boa Esperansa");
      expect(grupo(daBravo, "ocorrencia")).toBeUndefined();

      // 000472 está em triagem, sem equipe: também não.
      const emTriagem = await grupos(tokenAgente, "beira rio");
      expect(grupo(emTriagem, "ocorrencia")).toBeUndefined();

      // E nada de usuários: agente não administra ninguém.
      expect(grupo(await grupos(tokenAgente, "joana"), "usuario")).toBeUndefined();
    });

    it("o agente sem equipe não recebe grupo de ocorrência, como /meu-trabalho devolve vazio", async () => {
      const r = await grupos(tokenAgenteSemEquipe, "acacias");
      expect(grupo(r, "ocorrencia")).toBeUndefined();
    });

    it("o órgão desativado não aparece, como na lista padrão de /orgaos", async () => {
      await mem.bruto.query(
        `UPDATE orgaos SET ativo = false, desativado_em = now(), motivo_desativacao = 'Fundiu com Obras'
          WHERE organizacao_id = $1 AND sigla = 'CBMSC'`,
        [ORG_A],
      );
      try {
        expect(grupo(await grupos(tokenCoordenadora, "bombeiro"), "orgao")).toBeUndefined();
      } finally {
        await mem.bruto.query(
          `UPDATE orgaos SET ativo = true, desativado_em = NULL, motivo_desativacao = NULL
            WHERE organizacao_id = $1 AND sigla = 'CBMSC'`,
          [ORG_A],
        );
      }
    });
  });

  describe("isolamento", () => {
    it("o coordenador de Vale Fundo não acha nada de Serra Alta, nem pelo protocolo exato", async () => {
      const deSerraAlta = new Set((await mem.bruto.query<{ id: string }>(
        "SELECT id FROM ocorrencias WHERE organizacao_id = $1", [ORG_A],
      )).rows.map((r) => r.id));

      /*
        Pelo protocolo exato de Serra Alta: o que volta, se voltar, é de Vale
        Fundo (a semente tem "000112/2026", que se PARECE com "000123/2026",
        e parecer é o que a tolerância faz). O que não pode voltar é a linha
        de Serra Alta, nem por identificador, nem por título.
      */
      const r = await grupos(tokenDeFora, "000123/2026");
      for (const item of grupo(r, "ocorrencia")?.itens ?? []) {
        expect(deSerraAlta.has(item.id), `vazou ${item.protocolo} de Serra Alta`).toBe(false);
        expect(item.protocolo).not.toBe("000123/2026");
      }
      const r2 = await grupos(tokenDeFora, "Servidao Boa Esperansa");
      expect(grupo(r2, "ocorrencia")).toBeUndefined();
      const r3 = await grupos(tokenDeFora, "joana silv");
      expect(r3.grupos).toEqual([]);
      const r4 = await grupos(tokenDeFora, "bombeiro");
      expect(grupo(r4, "orgao")).toBeUndefined();
    });
  });

  describe("registro de consulta", () => {
    it("casar pelo NOME do solicitante deixa linha com recurso 'busca', sem gravar o termo", async () => {
      const antes = await consultasDe(OCORRENCIA_DA_ALFA);
      const r = await grupos(tokenOperador, "marilda prado");
      expect(grupo(r, "ocorrencia")!.itens.map((i) => i.id)).toContain(OCORRENCIA_DA_ALFA);

      const depois = await consultasDe(OCORRENCIA_DA_ALFA);
      expect(depois.length).toBe(antes.length + 1);
      expect(depois.at(-1)).toMatchObject({ recurso: "busca", finalidade: "atendimento" });
      expect(depois.at(-1)!.usuario_nome).toMatch(/Jonas/);

      // Não existe coluna onde o termo pudesse ter ido parar.
      const colunas = await mem.bruto.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'ocorrencia_consultas'`,
      );
      expect(colunas.rows.map((c) => c.column_name)).not.toContain("termo");
    });

    it("casar pelo endereço ou pelo protocolo NÃO deixa linha, como a lista e o mapa", async () => {
      const antes = await consultasDe(OCORRENCIA_DA_ALFA);
      const porEndereco = await grupos(tokenOperador, "acacias");
      expect(grupo(porEndereco, "ocorrencia")!.itens.map((i) => i.id)).toContain(OCORRENCIA_DA_ALFA);
      const porProtocolo = await grupos(tokenOperador, "000471");
      expect(grupo(porProtocolo, "ocorrencia")!.itens.map((i) => i.id)).toContain(OCORRENCIA_DA_ALFA);
      expect((await consultasDe(OCORRENCIA_DA_ALFA)).length).toBe(antes.length);
    });

    it("o agente de campo que acha pelo nome também deixa linha", async () => {
      const antes = await consultasDe(OCORRENCIA_DA_ALFA);
      const r = await grupos(tokenAgente, "marilda");
      expect(grupo(r, "ocorrencia")!.itens.map((i) => i.id)).toEqual([OCORRENCIA_DA_ALFA]);
      expect((await consultasDe(OCORRENCIA_DA_ALFA)).length).toBe(antes.length + 1);
    });
  });

  describe("GET /ocorrencias?busca= usa a mesma normalização e tolerância", () => {
    async function lista(q: string) {
      const r = await app.inject({
        method: "GET", url: `/ocorrencias?busca=${encodeURIComponent(q)}&status=todas`,
        headers: com(tokenCoordenadora),
      });
      expect(r.statusCode, r.body).toBe(200);
      return r.json() as { itens: Array<{ protocolo: string; endereco: string }>; total: number };
    }

    it("'Servidao Boa Esperansa' acha 'Servidão Boa Esperança' na lista", async () => {
      const r = await lista("Servidao Boa Esperansa");
      expect(r.itens.map((i) => i.endereco)).toContain("Servidão Boa Esperança, 148");
    });

    it("acento e caixa não importam", async () => {
      const r = await lista("ACÁCIAS");
      expect(r.itens.map((i) => i.protocolo)).toContain("000471/2026");
    });

    it("o protocolo digitado inteiro vem no topo, e os parecidos vêm atrás", async () => {
      const r = await lista("000471/2026");
      expect(r.itens[0]!.protocolo).toBe("000471/2026");
    });

    it("o relato continua sendo procurado, por substring", async () => {
      // "Talude" só existe no relato da ocorrência deste arquivo e no da semente.
      const r = await lista("talude");
      expect(r.itens.map((i) => i.protocolo)).toContain("000123/2026");
    });

    it("termo que vira nada depois de normalizado não filtra", async () => {
      const tudo = await lista("");
      const nada = await lista("%%");
      expect(nada.total).toBe(tudo.total);
    });
  });

  describe("teto por pessoa", () => {
    it(`a ${BUSCAS_POR_MINUTO + 1}ª busca no minuto responde 429, e o colega continua servido`, async () => {
      // Uma conta só para isto, com o balde ainda cheio.
      const tokenRita = await entrar("rita.lopes@serraalta.exemplo.gov.br");
      let primeiro429 = -1;
      for (let i = 1; i <= BUSCAS_POR_MINUTO + 1; i += 1) {
        const r = await buscar(tokenRita, `palmeiras ${i}`);
        if (r.statusCode === 429) { primeiro429 = i; break; }
        expect(r.statusCode, `busca ${i}: ${r.body}`).toBe(200);
      }
      expect(primeiro429).toBe(BUSCAS_POR_MINUTO + 1);

      const colega = await buscar(tokenCoordenadora, "palmeiras");
      expect(colega.statusCode).toBe(200);
    }, 120_000);
  });
});
