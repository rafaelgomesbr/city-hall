import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { abrirCofre } from "../src/operadores.js";
import { carregarConfig } from "../src/config.js";
import { DONO, subirConsoleDeTeste, type ConsoleDeTeste } from "./apoio/console-de-teste.js";

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
  "POST /recuperar":
    "A recuperação de senha por código de recuperação. Não há sessão por "
    + "definição: quem chega aqui perdeu a senha, e talvez o aparelho do segundo "
    + "fator. A credencial é o código, conferido contra hash scrypt, e a resposta "
    + "não traz sessão: traz o segredo novo do segundo fator, uma vez, e a pessoa "
    + "entra pela porta normal. Está sob o mesmo limite por endereço da porta.",
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
  "GET /fontes/work-sans-400.ttf":
    "Bytes de fonte. Estão aqui porque `style-src 'self'` bloqueia a folha do "
    + "Google Fonts, então o processo serve a própria tipografia. Pedir uma "
    + "fonte atrás de sessão faria a tela de LOGIN abrir sem fonte nenhuma.",
  "GET /fontes/work-sans-600.ttf": "Bytes de fonte, pela mesma razão da de cima.",
  "GET /fontes/roboto-mono-400.ttf": "Bytes de fonte, pela mesma razão da de cima.",
};

const CHAVE = randomBytes(32).toString("base64");
/* A chave abre na partida (o envelope do dono e conferido contra a linha). */
void abrirCofre(CHAVE);

/**
 * Este arquivo mede SUPERFÍCIE, não comportamento: ele pergunta quais rotas
 * existem e se cada uma tem portão. Todos os casos param no 401, e o banco por
 * baixo é o de teste, com a 038 aplicada e o dono semeado, porque desde a 038
 * a própria partida precisa dele.
 */
let c: ConsoleDeTeste;
let app: FastifyInstance;

beforeAll(async () => {
  c = await subirConsoleDeTeste({ chave: CHAVE });
  app = c.app;
}, 180_000);

afterAll(async () => {
  await c?.encerrar();
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

/**
 * A chave sem o `/v1`: a isencao e declarada UMA vez, na forma sem prefixo, e
 * vale para a rota sob `/v1` e para o espelho (V2-F02-E02).
 */
function semV1(rota: string): string {
  return rota.replace(/^(\S+) \/v1(?=\/|$)/, "$1 ");
}

/** As rotas que existem so sem prefixo, e cada uma tem a razao escrita. */
const SO_SEM_PREFIXO: Record<string, string> = {
  "GET /saude": "Infraestrutura: quem pergunta e o balanceador, que nao conhece versao.",
  "GET /": "A casca da pagina.",
  "GET /console.css": "Estatico da pagina.",
  "GET /console.js": "Estatico da pagina.",
  "GET /fontes/work-sans-400.ttf": "Estatico da pagina.",
  "GET /fontes/work-sans-600.ttf": "Estatico da pagina.",
  "GET /fontes/roboto-mono-400.ttf": "Estatico da pagina.",
};

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
      if (ABERTAS[semV1(rota)]) continue;
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

  it("toda rota tem par sob /v1 e vice-versa, salvo as sete de infraestrutura e estaticos", () => {
    const todas = rotas();
    const legadas = todas.filter((r) => !/^\S+ \/v1(\/|$)/.test(r));
    const v1 = todas.filter((r) => /^\S+ \/v1(\/|$)/.test(r)).map(semV1);

    // Ancora: sem ela, um filtro quebrado deixaria as duas listas vazias e o caso verde.
    expect(v1.length).toBeGreaterThanOrEqual(10);

    const semPar = legadas.filter((r) => !SO_SEM_PREFIXO[r] && !v1.includes(r));
    expect(semPar, `rota sem par sob /v1: ${semPar.join(", ")}`).toEqual([]);

    const soNoV1 = v1.filter((r) => !legadas.includes(r));
    expect(soNoV1, `rota sob /v1 sem espelho: ${soNoV1.join(", ")}`).toEqual([]);

    const fora = v1.filter((r) => SO_SEM_PREFIXO[r]);
    expect(fora, `infraestrutura ou estatico entrou sob /v1: ${fora.join(", ")}`).toEqual([]);

    const orfas = Object.keys(SO_SEM_PREFIXO).filter((r) => !legadas.includes(r));
    expect(orfas, `excecao apontando para rota que nao existe: ${orfas.join(", ")}`).toEqual([]);
  });

  it("nenhuma isencao sobrou apontando para rota que nao existe mais", () => {
    const existentes = new Set(rotas().map(semV1));
    const orfas = Object.keys(ABERTAS).filter((r) => !existentes.has(r));
    expect(
      orfas,
      `isencao de rota que ja nao existe: ${orfas.join(", ")}. Isencao esquecida vira ` +
      "permissao para a proxima rota que nascer com o mesmo nome",
    ).toEqual([]);
  });

  it("a superficie de escrita do console e a lista nomeada aqui, e nenhuma rota apaga", () => {
    /*
      Em tabela de NEGÓCIO o papel do console continua sem INSERT, UPDATE ou
      DELETE (decisão 3 da ADR 0008). O que ele escreve é a tabela PRÓPRIA
      (`console_operadores`) e o que ele executa são funções concedidas por
      nome: a de cadastrar prefeitura (036) e as quatro de suspender,
      reativar, agendar e cancelar a eliminação (038).

      Este caso guarda o tamanho dessa abertura pela lista de rotas, que é a
      parte que uma revisão de diff deixa passar. DELETE continua em ZERO, e
      PUT e PATCH também: cada ato é um POST com o verbo no endereço, porque
      nenhum deles é "substituir o recurso". E nada apaga: eliminar AGENDA,
      quem apaga sete dias depois é o relógio da API; operador se desativa.

      A lista de POST é conferida por extenso, e não por contagem. Duas delas
      são as etapas da porta e não tocam no banco; todas as outras passam pelo
      portão de sessão (o caso acima cobra isso de todas, sem exceção escrita),
      e as do dono ainda pelo portão de papel, cobrado nos arquivos das
      próprias rotas.
    */
    const escritas = rotas().filter((r) => /^(PUT|PATCH|DELETE) /.test(r));
    expect(escritas, `o console ganhou rota que altera ou apaga: ${escritas.join(", ")}`)
      .toEqual([]);

    const todosOsPosts = rotas().filter((r) => r.startsWith("POST "));
    const LISTA = [
      "POST /codigos-de-recuperacao",
      "POST /entrar",
      "POST /entrar/codigo",
      "POST /municipios/:id/eliminacao/cancelar",
      "POST /municipios/:id/eliminar",
      "POST /municipios/:id/reativar",
      "POST /municipios/:id/suspender",
      "POST /operadores",
      "POST /operadores/:id/desativar",
      "POST /prefeituras",
      "POST /recuperar",
      "POST /senha",
    ];
    // A lista vale para o espelho sem prefixo e, igual, para o `/v1`.
    const posts = todosOsPosts.filter((r) => !r.startsWith("POST /v1/"));
    expect(
      [...posts].sort(),
      "o console ganhou rota de POST que ninguem nomeou neste teste",
    ).toEqual(LISTA);
    expect(
      todosOsPosts.filter((r) => r.startsWith("POST /v1/")).map(semV1).sort(),
      "o console ganhou rota de POST sob /v1 que ninguem nomeou neste teste",
    ).toEqual(LISTA);

    /*
      E nenhuma rota de escrita está entre as isentas, com UMA exceção nomeada:
      `POST /recuperar` escreve (a senha e o segundo fator novos, na linha de
      quem apresentou o código) e não tem sessão por definição. A credencial
      dela é o código de recuperação, e `recuperacao-de-senha.test.ts` cobra
      que sem um código válido ela não escreve nada. Uma isenção além dessa
      seria criar prefeitura, ou suspender município, sem entrar.
    */
    for (const post of posts) {
      if (post.startsWith("POST /entrar") || post === "POST /recuperar") continue;
      expect(Object.keys(ABERTAS), `${post} entrou na lista de rotas abertas`).not.toContain(post);
    }
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
  let apertado: ConsoleDeTeste;
  let proprio: FastifyInstance;

  beforeAll(async () => {
    apertado = await subirConsoleDeTeste({ limitePorEndereco: 3 });
    proprio = apertado.app;
  }, 180_000);

  afterAll(async () => {
    await apertado?.encerrar();
  });

  it("a porta trava depois do teto", async () => {
    const desfechos: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await proprio.inject({
        method: "POST", url: "/entrar",
        payload: { email: DONO.email, senha: "chute" },
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
    for (const caminho of [
      "/", "/console.css", "/console.js", "/saude",
      "/fontes/work-sans-400.ttf", "/fontes/work-sans-600.ttf", "/fontes/roboto-mono-400.ttf",
    ]) {
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
  };

  it("CONSOLE_OPERADORES e opcional desde a 038, e vazia conta como ausente", () => {
    /*
      Ela virou a semente do dono, lida uma vez. Um console cujo dono ja esta no
      banco sobe sem ela, e e assim que ela sai da configuracao depois do
      primeiro deploy. `CONSOLE_OPERADORES=` num arquivo de segredos e "ainda
      nao gerei", e nao um JSON invalido.
    */
    expect(carregarConfig({ ...BASE } as NodeJS.ProcessEnv).CONSOLE_OPERADORES).toBeUndefined();
    expect(carregarConfig({ ...BASE, CONSOLE_OPERADORES: "" } as NodeJS.ProcessEnv).CONSOLE_OPERADORES)
      .toBeUndefined();
    expect(carregarConfig({ ...BASE, CONSOLE_OPERADORES: "[]" } as NodeJS.ProcessEnv).CONSOLE_OPERADORES)
      .toBe("[]");
  });

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
      ...BASE, NODE_ENV: "production", AMBIENTE_DC360: "prod", CONSOLE_IDENTIDADE_DO_BANCO: "refprodxxxxxxxx",
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
