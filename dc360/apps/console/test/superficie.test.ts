import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { construirConsole } from "../src/servidor.js";
import { abrirCofre, contextoDoOperador } from "../src/operadores.js";
import type { Config } from "../src/config.js";
import type { LeituraDoConsole } from "../src/banco.js";
import { derivarSenha } from "../../api/src/auth/senha.js";
import { gerarSegredoTotp } from "../../api/src/auth/totp.js";
import { carregarConfig } from "../src/config.js";

/**
 * A superfície do console se defende sozinha.
 *
 * O erro que mais barato custa cometer e mais caro custa descobrir é banal:
 * alguém acrescenta uma rota e esquece o portão de sessão. Nenhum teste de
 * funcionalidade pega isso, porque a rota funciona perfeitamente. Ela só
 * funciona para qualquer um.
 *
 * No console isso pesa mais que na API, porque aqui não existe contexto de
 * município para limitar o estrago: toda rota de leitura deste processo enxerga
 * todas as prefeituras de uma vez, por desenho. Uma rota sem portão aqui é a
 * situação que a ADR 0008 aceitou correr, sem a compensação que a fez aceitável.
 *
 * A lista de isenções é curta e cada uma tem a razão escrita, e o teste reprova
 * se uma isenção sobrar apontando para rota que já não existe. É lista de
 * EXCEÇÕES e não de regras, de propósito: exceção alguém revisa, regra alguém
 * esquece.
 */

const ABERTAS: Record<string, string> = {
  "POST /entrar":
    "A primeira etapa da porta. Ela confere a senha e devolve um desafio, nunca "
    + "uma sessão: quem para aqui não alcança número nenhum.",
  "POST /entrar/codigo":
    "A segunda etapa. É ela que emite a sessão, depois do código do aplicativo "
    + "de autenticação.",
  "GET /saude":
    "Quem pergunta é o balanceador, que não tem sessão. Responde apenas que o "
    + "processo está de pé, e nenhum número de município nenhum.",
  "GET /":
    "A casca da página. Ela não traz dado nenhum dentro: os números chegam "
    + "depois, por `GET /municipios`, que exige sessão.",
  "GET /console.css": "Folha de estilo da página. Sem dado dentro.",
  "GET /console.js":
    "O comportamento da página. Sem dado dentro: ele PEDE os números, com o "
    + "token que a segunda etapa devolveu.",
};

const CHAVE = randomBytes(32).toString("base64");
const cofre = abrirCofre(CHAVE);

const LEITURA_VAZIA: LeituraDoConsole = { ler: async () => [], encerrar: async () => {} };

let app: FastifyInstance;

beforeAll(async () => {
  const config: Config = {
    NODE_ENV: "test",
    CONSOLE_PORT: 0,
    CONSOLE_HOST: "127.0.0.1",
    CONSOLE_JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes-aqui",
    CONSOLE_SEGUNDO_FATOR_CHAVE: CHAVE,
    CONSOLE_OPERADORES: JSON.stringify([{
      email: "coordenacao@fornecedor.com.br",
      senha: await derivarSenha("senha-de-teste-bem-comprida-do-operador"),
      segundoFator: cofre.cifrar(gerarSegredoTotp(), contextoDoOperador("coordenacao@fornecedor.com.br")),
    }]),
  };
  app = await construirConsole({ config, leitura: LEITURA_VAZIA, limitePorEndereco: 500 });
}, 60_000);

afterAll(async () => {
  await app?.close();
});

/**
 * Lê a árvore de rotas DO SERVIDOR MONTADO, e não uma lista escrita à mão.
 *
 * O caminho de verdade é a CONCATENAÇÃO da árvore, e não o texto de uma linha:
 * `printRoutes` desenha uma árvore em que cada linha traz só o próprio segmento.
 * Este parser é o mesmo de `apps/api/test/superficie.test.ts`, e a razão de ele
 * ser assim está escrita lá: a versão que tomava o segmento como caminho
 * inteiro pedia endereços que não existem, recebia 404, e aceitava o 404 como
 * prova de que a rota estava protegida. O portão verificava endereço nenhum.
 */
function rotas(): string[] {
  const achadas: string[] = [];
  const pilha: string[] = [];

  for (const linha of app.printRoutes({ commonPrefix: false }).split("\n")) {
    const casou = /^([\s│├└─]*)(\S+)\s+\((.+?)\)\s*$/.exec(linha);
    if (!casou) continue;

    // A profundidade sai do prefixo de desenho, contado em blocos de quatro
    // caracteres, que é como o Fastify indenta.
    const profundidade = Math.floor(casou[1]!.length / 4);
    pilha.length = profundidade;
    pilha[profundidade] = casou[2]!;
    const caminho = pilha.slice(0, profundidade + 1).join("");

    for (const metodo of casou[3]!.split(",").map((m) => m.trim())) {
      if (metodo === "HEAD" || metodo === "OPTIONS") continue;
      achadas.push(`${metodo} ${caminho}`);
    }
  }
  return achadas;
}

describe("Toda rota do console exige sessao, menos as isentas por escrito", () => {
  it("a leitura da arvore de rotas funciona", () => {
    // Sem esta âncora, uma expressão regular quebrada devolveria lista vazia e o
    // caso abaixo passaria verde sem conferir rota nenhuma.
    const lista = rotas();
    expect(lista.length, `nenhuma rota lida:\n${app.printRoutes({ commonPrefix: false })}`)
      .toBeGreaterThanOrEqual(6);
    expect(lista).toContain("GET /municipios");
    expect(lista).toContain("POST /entrar");
  });

  it("nenhuma rota fechada responde sem token", async () => {
    const semPortao: string[] = [];

    for (const rota of rotas()) {
      if (ABERTAS[rota]) continue;
      const [metodo, caminho] = rota.split(" ") as [string, string];
      const r = await app.inject({
        method: metodo as "GET",
        // O parâmetro é substituído por um uuid qualquer: a rota tem que
        // recusar ANTES de olhar para ele.
        url: caminho.replace(/:\w+/g, "00000000-0000-4000-8000-000000000000"),
      });
      if (r.statusCode !== 401) semPortao.push(`${rota} respondeu ${r.statusCode}`);
    }

    expect(
      semPortao,
      "rota do console sem portao de sessao: ela enxerga todas as prefeituras de " +
      `uma vez, para qualquer um. ${semPortao.join("; ")}`,
    ).toEqual([]);
  });

  it("nenhuma isencao sobrou apontando para rota que nao existe mais", () => {
    const existentes = new Set(rotas());
    const orfas = Object.keys(ABERTAS).filter((r) => !existentes.has(r));
    expect(
      orfas,
      `isencao de rota que ja nao existe: ${orfas.join(", ")}. Isencao esquecida vira ` +
      "permissao para a proxima rota que nascer com o mesmo nome",
    ).toEqual([]);
  });

  it("nenhuma rota de escrita existe no console, em lugar nenhum", () => {
    /*
      O console lê. A decisão 3 da ADR 0008 tira do papel de banco dele qualquer
      INSERT, UPDATE ou DELETE, então uma rota de escrita aqui não conseguiria
      escrever de qualquer forma: ela falharia com "permissão negada" na cara de
      quem a usasse. Este caso existe para o defeito aparecer na revisão, e não
      em produção, e para deixar escrito que a ausência é decisão.

      As duas rotas de POST que existem são as duas etapas da porta, e nenhuma
      delas toca no banco.
    */
    const escritas = rotas().filter((r) => /^(PUT|PATCH|DELETE) /.test(r));
    expect(escritas, `o console ganhou rota de escrita: ${escritas.join(", ")}`).toEqual([]);

    const posts = rotas().filter((r) => r.startsWith("POST "));
    expect(posts.sort()).toEqual(["POST /entrar", "POST /entrar/codigo"]);
  });
});

describe("O limite por endereco cobre a porta, e so a porta", () => {
  /**
   * As duas metades deste caso saíram do mesmo defeito, encontrado abrindo a
   * página de verdade e não num teste.
   *
   * A primeira versão registrava o limite GLOBALMENTE. Abrir o console gasta
   * três requisições (a casca, o estilo e o script), entrar gasta mais duas e
   * ler os números gasta uma: seis por visita, contra um teto de vinte em cinco
   * minutos. O operador que recarregasse a tela três vezes seguidas seria
   * barrado do próprio console no meio de um plantão, e o console é a
   * ferramenta que ele abre justamente quando alguma coisa está errada.
   *
   * A correção óbvia (tirar o limite) seria pior: cada tentativa de entrar gasta
   * uma derivação `scrypt` de cerca de 128 MB, então marteladas nessa rota
   * derrubam o processo antes de descobrirem senha nenhuma. Por isso o teste
   * cobra as DUAS coisas: que a porta tem teto, e que o resto não tem.
   */
  let proprio: FastifyInstance;

  beforeAll(async () => {
    const config: Config = {
      NODE_ENV: "test",
      CONSOLE_PORT: 0,
      CONSOLE_HOST: "127.0.0.1",
      CONSOLE_JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes-aqui",
      CONSOLE_SEGUNDO_FATOR_CHAVE: CHAVE,
      CONSOLE_OPERADORES: JSON.stringify([{
        email: "outra@fornecedor.com.br",
        senha: "scrypt$131072$8$1$XenoRKJ2mWCQSO-ZnZXUvg$vO-J5ozHwGH1V29fdrVZE4F9ps_lf8oqXHLmU_6ZMrk",
        segundoFator: cofre.cifrar(gerarSegredoTotp(), contextoDoOperador("outra@fornecedor.com.br")),
      }]),
    };
    proprio = await construirConsole({ config, leitura: LEITURA_VAZIA, limitePorEndereco: 3 });
  }, 60_000);

  afterAll(async () => {
    await proprio?.close();
  });

  it("a porta trava depois do teto", async () => {
    const desfechos: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await proprio.inject({
        method: "POST", url: "/entrar",
        payload: { email: "ninguem@fornecedor.com.br", senha: "chute" },
      });
      desfechos.push(r.statusCode);
    }
    expect(
      desfechos.includes(429),
      "a rota de entrar aceitou cinco tentativas com teto de tres: cada uma gasta " +
      `uma derivacao scrypt de 128 MB. Desfechos: ${desfechos.join(", ")}`,
    ).toBe(true);
  }, 60_000);

  it("as rotas que nao conferem credencial nao tem teto", async () => {
    for (const caminho of ["/", "/console.css", "/console.js", "/saude"]) {
      for (let i = 0; i < 10; i++) {
        const r = await proprio.inject({ method: "GET", url: caminho });
        expect(
          r.statusCode,
          `${caminho} devolveu ${r.statusCode} na ${i + 1}a chamada: o limite por ` +
          "endereco esta pegando rota estatica, e o operador seria barrado do " +
          "proprio console por recarregar a tela",
        ).toBe(200);
      }
    }
  }, 60_000);

  it("a rota de numeros recusa por falta de sessao, e nunca por teto", async () => {
    for (let i = 0; i < 10; i++) {
      const r = await proprio.inject({ method: "GET", url: "/municipios" });
      expect(r.statusCode, `na ${i + 1}a chamada veio ${r.statusCode}`).toBe(401);
    }
  }, 60_000);
});

describe("A configuracao do console recusa o que nao pode subir", () => {
  const BASE = {
    CONSOLE_JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes-aqui",
    CONSOLE_SEGUNDO_FATOR_CHAVE: CHAVE,
    CONSOLE_OPERADORES: "[]",
  };

  it("sem segredo de token, o console nao sobe, em ambiente nenhum", () => {
    /*
      Diferente da API, que aceita subir sem `DATABASE_URL` no desenvolvimento:
      aqui não existe modo "só para experimentar". Qualquer console de pé é uma
      tela que mostra números de mais de um município, e uma chave adivinhável
      nele é uma sessão forjada.
    */
    expect(() => carregarConfig({ ...BASE, CONSOLE_JWT_SEGREDO: "curto" } as NodeJS.ProcessEnv))
      .toThrow(/CONSOLE_JWT_SEGREDO/);
  });

  it("em producao, sem banco o console nao sobe", () => {
    expect(() => carregarConfig({
      ...BASE, NODE_ENV: "production",
    } as NodeJS.ProcessEnv)).toThrow(/CONSOLE_DATABASE_URL/);
  });

  it("fora de producao, sem banco ele sobe contra o Postgres em WebAssembly", () => {
    expect(() => carregarConfig({ ...BASE, NODE_ENV: "development" } as NodeJS.ProcessEnv))
      .not.toThrow();
  });

  it("as variaveis do console nao se confundem com as do produto", () => {
    /*
      O prefixo `CONSOLE_` em tudo não é organização: com `JWT_SEGREDO` valendo
      para os dois, bastaria um painel de implantação com variáveis de projeto
      compartilhadas para os dois processos passarem a assinar com a mesma chave.
      Aqui, a configuração do produto simplesmente não satisfaz a do console.
    */
    expect(() => carregarConfig({
      NODE_ENV: "development",
      JWT_SEGREDO: "segredo-do-produto-com-mais-de-trinta-e-dois-bytes",
      SEGUNDO_FATOR_CHAVE: CHAVE,
    } as NodeJS.ProcessEnv)).toThrow(/CONSOLE_/);
  });
});
