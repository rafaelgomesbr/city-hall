import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { construirConsole } from "../src/servidor.js";
import { abrirCofre, contextoDoOperador } from "../src/operadores.js";
import { ABERTURA, ABERTURA_DE_ESCRITA, CONTEXTO_DO_OPERADOR, type BancoDoConsole } from "../src/banco.js";
import type { Config } from "../src/config.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../../api/src/banco/memoria.js";
import { travaDeProcesso } from "../../api/src/push/trava.js";
import { resumirMunicipios } from "../../api/src/metricas/resumo.js";
import { derivarSenha } from "../../api/src/auth/senha.js";
import { base32Decodificar, codigoTotp, gerarSegredoTotp, passoDe } from "../../api/src/auth/totp.js";

/**
 * O caminho inteiro, de ponta a ponta, num banco só.
 *
 * A ADR 0008 se sustenta numa inversão de direção que é fácil de descrever e
 * fácil de implementar errado. Este arquivo exercita a coisa toda, na ordem em
 * que ela acontece em produção:
 *
 *   1. O RELÓGIO DA API faz cada município escrever o próprio resumo, dentro da
 *      própria transação, com o papel `dc360_app` e debaixo do RLS. É o mesmo
 *      `resumirMunicipios` que `apps/api/src/index.ts` agenda.
 *   2. O CONSOLE, com o papel `dc360_console`, lê o que os municípios
 *      escreveram, depois de passar pela senha E pelo segundo fator.
 *   3. O MESMO CONSOLE, na mesma conexão, tenta ler ocorrência, usuário,
 *      evidência e trilha, e o BANCO recusa.
 *
 * O passo 3 é a prova de que o console é incapaz de ler dado de cidadão mesmo
 * que alguém tente, e ele vale porque quem recusa é o Postgres. O portão
 * completo dessa asserção mora em `db/test/isolamento.test.ts`, junto do CA-06,
 * onde ela é universal (vale para a tabela que alguém criar amanhã). Aqui ela é
 * repetida do lado da aplicação, pela conexão que o console de verdade usa, com
 * a mesma constante `ABERTURA` que a conexão de produção emite.
 *
 * O banco é Postgres 16 em WebAssembly, com as migrações reais e as concessões
 * reais. Não há Docker no caminho, e por isso este teste roda em toda máquina.
 */

const EMAIL = "coordenacao@fornecedor.com.br";
const SENHA = "senha-de-teste-bem-comprida-do-operador";
const CHAVE = randomBytes(32).toString("base64");

const cofre = abrirCofre(CHAVE);
const SEGREDO_TOTP = gerarSegredoTotp();

let mem: BancoEmMemoria;
let leitura: BancoDoConsole;
let app: FastifyInstance;
let token: string;

/**
 * A conexão do console sobre o MESMO Postgres em WebAssembly que a API usou.
 *
 * Emite `ABERTURA`, que é a constante exportada por `src/banco.ts` e a mesma que
 * a conexão de produção emite. Um teste que montasse a própria transação (com
 * outro papel, ou sem `SET LOCAL ROLE`) estaria atestando algo que ninguém
 * executa, e as recusas do último bloco viriam de graça.
 */
function leituraDoConsoleSobre(bruto: BancoEmMemoria["bruto"]): BancoDoConsole {
  return {
    async ler<T>(
      sql: string, params: readonly unknown[] = [], operador: string | null = null,
    ): Promise<T[]> {
      return bruto.transaction(async (tx: any) => {
        for (const comando of ABERTURA) await tx.exec(comando);
        if (operador) await tx.query(CONTEXTO_DO_OPERADOR, [operador]);
        const r = await tx.query(sql, params.length > 0 ? [...params] : undefined);
        return r.rows as T[];
      }) as Promise<T[]>;
    },
    // A escrita, com a abertura de escrita de produção e o operador no
    // contexto. Ver `banco.ts`: a diferença para a de leitura é uma linha, a
    // que recusaria escrever.
    async executar<T>(
      sql: string, params: readonly unknown[] = [], operador: string | null = null,
    ): Promise<T[]> {
      return bruto.transaction(async (tx: any) => {
        for (const comando of ABERTURA_DE_ESCRITA) await tx.exec(comando);
        if (operador) await tx.query(CONTEXTO_DO_OPERADOR, [operador]);
        const r = await tx.query(sql, params.length > 0 ? [...params] : undefined);
        return r.rows as T[];
      }) as Promise<T[]>;
    },
    encerrar: async () => {},
  };
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });

  // Passo 1: o relógio da API. Nenhum atalho: é a função que a partida agenda.
  const escrita = await resumirMunicipios({
    banco: mem.banco,
    trava: travaDeProcesso(),
    frescorMinutos: 60,
  });
  expect(
    escrita.municipios,
    "o relogio nao escreveu resumo nenhum, e o resto deste arquivo mediria o vazio",
  ).toBeGreaterThan(0);

  leitura = leituraDoConsoleSobre(mem.bruto);

  // A semente do dono, pela mesma variavel que a producao usa (migracao 038).
  const config: Config = {
    NODE_ENV: "test",
    CONSOLE_PORT: 0,
    CONSOLE_HOST: "127.0.0.1",
    CONSOLE_JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes-aqui",
    CONSOLE_SEGUNDO_FATOR_CHAVE: CHAVE,
    CONSOLE_OPERADORES: JSON.stringify([{
      email: EMAIL,
      senha: await derivarSenha(SENHA),
      segundoFator: cofre.cifrar(SEGREDO_TOTP, contextoDoOperador(EMAIL)),
    }]),
  };

  app = await construirConsole({
    config, leitura, escrita: leitura, limitePorEndereco: 500,
  });

  // Passo 2, a porta: senha, depois o código. Não existe caminho curto.
  const primeira = await app.inject({
    method: "POST", url: "/entrar", payload: { email: EMAIL, senha: SENHA },
  });
  const codigo = codigoTotp(base32Decodificar(SEGREDO_TOTP)!, passoDe(new Date()));
  const segunda = await app.inject({
    method: "POST", url: "/entrar/codigo",
    payload: { desafio: primeira.json().desafio, codigo },
  });
  expect(segunda.statusCode, `nao consegui entrar no console: ${segunda.body}`).toBe(200);
  token = segunda.json().token;
}, 120_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

function comSessao(url: string) {
  return app.inject({ method: "GET", url, headers: { authorization: `Bearer ${token}` } });
}

describe("O console le a metrica que os municipios escreveram", () => {
  it("mostra um municipio por prefeitura, com os numeros que aquela prefeitura escreveu", async () => {
    const r = await comSessao("/municipios");
    expect(r.statusCode).toBe(200);

    const lista = r.json().municipios as Array<Record<string, any>>;
    const noBanco = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM organizacoes",
    );
    expect(
      lista.length,
      "faltou municipio na tela do console, e municipio que some da lista e " +
      "municipio cujo silencio ninguem percebe",
    ).toBe(Number(noBanco.rows[0]!.n));

    for (const linha of lista) {
      const real = await mem.bruto.query<{ abertas: string; usuarios: string }>(
        `SELECT (SELECT count(*)::text FROM ocorrencias
                  WHERE organizacao_id = $1 AND status <> 'encerrada') AS abertas,
                (SELECT count(*)::text FROM usuarios
                  WHERE organizacao_id = $1 AND ativo) AS usuarios`,
        [linha["organizacao_id"]],
      );
      expect(
        String(linha["ocorrencias_abertas"]),
        `o numero de ${linha["municipio"]} no console nao e o que aquele municipio escreveu`,
      ).toBe(real.rows[0]!.abertas);
      expect(String(linha["usuarios_ativos"])).toBe(real.rows[0]!.usuarios);
      expect(linha["sem_escrita_recente"]).toBe(false);
    }
  });

  it("nao devolve campo nenhum que identifique pessoa ou imovel", async () => {
    /*
      A regra dura da decisão 2 da ADR 0008, cobrada na SAÍDA da rota e não só no
      catálogo do banco. As duas cobranças são necessárias: o banco impede a
      coluna de existir onde o console alcança, e esta impede alguém de compor a
      resposta com um campo vindo de outro lugar.

      `nome`, `municipio` e `uf` são de ÓRGÃO, e são a exceção nomeada na decisão
      3: sem o cadastro de organizações o console teria uma lista de uuid e
      nenhuma forma de dizer de que prefeitura está falando. As quatro de
      estado de acesso (migração 038) são datas e um motivo escrito pelo dono
      do console: nada de pessoa nem de imóvel.
    */
    const lista = (await comSessao("/municipios")).json().municipios as Array<Record<string, any>>;
    const permitidas = new Set([
      "organizacao_id", "nome", "municipio", "uf",
      "dia", "atualizado_em", "sem_escrita_recente", "horas_desde_a_escrita",
      "ocorrencias_registradas", "ocorrencias_encerradas", "vistorias_recebidas",
      "oficios_emitidos", "ocorrencias_abertas", "ocorrencias_atrasadas",
      "usuarios_ativos", "aparelhos_ativos", "aparelhos_sem_aparecer",
      "minutos_ate_vistoria_mediana",
      "acesso_suspenso_em", "suspensao_motivo", "eliminacao_agendada_para", "eliminada_em",
    ]);

    for (const linha of lista) {
      const sobrando = Object.keys(linha).filter((c) => !permitidas.has(c));
      expect(
        sobrando,
        `a resposta do console traz campo que ninguem revisou: ${sobrando.join(", ")}`,
      ).toEqual([]);
    }

    // E nenhum protocolo, endereço ou nome de pessoa no corpo inteiro da
    // resposta, procurado no texto cru em vez de campo a campo.
    const cru = (await comSessao("/municipios")).body;
    for (const proibido of ["endereco", "protocolo", "solicitante", "descricao", "latitude"]) {
      expect(
        cru.toLowerCase(),
        `a resposta do console carrega "${proibido}"`,
      ).not.toContain(proibido);
    }
  });

  it("a serie de um municipio traz os dias dele, e nao os do vizinho", async () => {
    const lista = (await comSessao("/municipios")).json().municipios as Array<Record<string, any>>;
    const alvo = lista[0]!;

    const r = await comSessao(`/municipios/${alvo["organizacao_id"]}/serie?dias=30`);
    expect(r.statusCode).toBe(200);

    const serie = r.json().serie as Array<Record<string, any>>;
    expect(serie.length, "a serie do municipio veio vazia").toBeGreaterThan(0);
    expect(
      String(serie[0]!["ocorrencias_abertas"]),
      "o primeiro dia da serie nao bate com o retrato de hoje daquele municipio",
    ).toBe(String(alvo["ocorrencias_abertas"]));
  });

  it("municipio que nunca escreveu aparece como calado, e nao some da lista", async () => {
    /*
      A consequência ruim que a ADR 0008 assume por escrito. Uma consulta direta
      a `metricas_municipio` simplesmente não traz o município quebrado, e
      ninguém sente falta do que não está lá. A visão parte de `organizacoes`,
      então ele aparece dizendo que falta.
    */
    await mem.bruto.query(
      `INSERT INTO organizacoes (nome, municipio, uf)
       VALUES ('Defesa Civil de Morro Claro','Morro Claro','MG')`,
    );

    const lista = (await comSessao("/municipios")).json().municipios as Array<Record<string, any>>;
    const calado = lista.find((m) => m["municipio"] === "Morro Claro");

    expect(
      calado,
      "o municipio que nao escreveu sumiu da tela do console, e silencio invisivel " +
      "e indistinguivel de 'esta tudo bem'",
    ).toBeDefined();
    expect(calado!["sem_escrita_recente"]).toBe(true);
    expect(calado!["ocorrencias_abertas"]).toBeNull();

    // E ele aparece no TOPO: quem está com problema não pode depender de
    // alguém rolar a tabela até o fim.
    expect(lista[0]!["municipio"]).toBe("Morro Claro");
  });

  it("sem sessao, a serie tambem recusa", async () => {
    const lista = (await comSessao("/municipios")).json().municipios as Array<Record<string, any>>;
    const r = await app.inject({
      method: "GET", url: `/municipios/${lista[0]!["organizacao_id"]}/serie`,
    });
    expect(r.statusCode).toBe(401);
  });
});

describe("O console e incapaz de ler dado de cidadao, mesmo que alguem tente", () => {
  /**
   * A prova pela conexão, e não pelo catálogo.
   *
   * O portão universal (nenhum papel além do de aplicação e do dono tem
   * privilégio, por seis caminhos) mora em `db/test/isolamento.test.ts`. Este
   * caso é o mesmo fato visto do outro lado: a conexão que o console de verdade
   * usa, emitindo a mesma abertura de transação, tentando ler as tabelas que
   * guardam pessoa e imóvel.
   *
   * As tabelas TÊM linha dentro, conferido logo abaixo. Sem essa âncora, uma
   * recusa poderia ser confundida com uma tabela vazia, e o teste ficaria verde
   * afirmando uma proteção que não existe.
   */
  const GUARDAM_PESSOA = [
    "ocorrencias", "vistorias", "evidencias", "usuarios", "trilha_eventos",
    "sessoes", "equipes", "providencias",
  ] as const;

  it("as tabelas que ele tenta ler TEM dado dentro", async () => {
    for (const tabela of ["ocorrencias", "usuarios", "trilha_eventos"]) {
      const r = await mem.bruto.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM ${tabela}`,
      );
      expect(
        Number(r.rows[0]!.n),
        `${tabela} esta vazia, entao a recusa do console abaixo nao prova nada`,
      ).toBeGreaterThan(0);
    }
  });

  it("o banco recusa cada uma delas para o papel do console", async () => {
    for (const tabela of GUARDAM_PESSOA) {
      let recusou = false;
      let mensagem = "";
      try {
        await leitura.ler(`SELECT * FROM ${tabela} LIMIT 1`);
      } catch (erro) {
        recusou = true;
        mensagem = erro instanceof Error ? erro.message : String(erro);
      }
      expect(
        recusou,
        `o console alcancou ${tabela}: uma conta do fornecedor comprometida passaria ` +
        "a valer dado de cidadao de todas as prefeituras de uma vez",
      ).toBe(true);
      expect(
        mensagem.toLowerCase(),
        `a recusa de ${tabela} nao veio do banco (foi "${mensagem}"), e recusa que ` +
        "vem da aplicacao some quando alguem escreve outra consulta",
      ).toMatch(/permission denied|permissão negada/);
    }
  });

  it("o console nao escreve nada, nem na tabela que ele le", async () => {
    for (const escrita of [
      "UPDATE metricas_municipio SET ocorrencias_atrasadas = 0",
      "DELETE FROM metricas_municipio",
      "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('x','x','MG')",
    ]) {
      let recusou = false;
      try {
        await leitura.ler(escrita);
      } catch {
        recusou = true;
      }
      expect(recusou, `o console executou "${escrita}"`).toBe(true);
    }
  });

  it("uma visao nova sobre ocorrencias nao entrega dado ao console", async () => {
    /*
      O caminho que não passa por concessão nenhuma na tabela: uma visão criada
      pelo dono lê por baixo do RLS, e quem tem SELECT nela dribla a concessão da
      tabela inteira. O que fecha isso é `security_invoker`, e este caso mostra a
      diferença acontecendo, com as duas visões saindo no `finally`.
    */
    await mem.bruto.exec(`
      CREATE VIEW espia_com_invoker WITH (security_invoker = true) AS
        SELECT endereco FROM ocorrencias;
      CREATE VIEW espia_sem_invoker AS
        SELECT endereco FROM ocorrencias;
      GRANT SELECT ON espia_com_invoker, espia_sem_invoker TO dc360_console;
    `);
    try {
      let recusou = false;
      try {
        await leitura.ler("SELECT * FROM espia_com_invoker");
      } catch {
        recusou = true;
      }
      expect(
        recusou,
        "com security_invoker a visao deveria bater na falta de concessao do console",
      ).toBe(true);

      const semOpcao = await leitura.ler("SELECT * FROM espia_sem_invoker");
      expect(
        semOpcao.length,
        "a visao SEM security_invoker deveria ter entregado endereco de cidadao ao " +
        "console: se nao entregou, esta prova nao esta provando nada",
      ).toBeGreaterThan(0);
    } finally {
      await mem.bruto.exec("DROP VIEW espia_com_invoker; DROP VIEW espia_sem_invoker;");
    }
  });
});
