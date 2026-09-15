import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { derivarSenha } from "../src/auth/senha.js";
import {
  DESTINOS_DO_GOOGLE_MAPS, ENCURTADORES_ACEITOS, TETO_DE_SALTOS, TEMPO_LIMITE_MS,
  buscarCabecalhosPorHttp, enderecoPublico, lookupFixo, urlFinalSemRastreamento,
  type BuscarCabecalhos, type Lookup,
} from "../src/rotas/mapa.js";

/**
 * O LINK CURTO DO GOOGLE MAPS, aberto pelo servidor a pedido do coordenador.
 *
 * O reclame de quem paga, na letra: "o campo localização do mapa ao abrir a
 * ocorrência tem que aceitar link curto do gmaps, hoje não tá aceitando". O
 * painel recusava de propósito, e `apps/web/PENDENCIAS.md` seção 2 escreveu a
 * especificação da rota para o dia em que ela fosse feita. Cada caso abaixo é
 * um item daquela lista, porque uma rota que aceita URL do usuário e vai
 * buscar é uma ferramenta de requisição forjada do lado servidor se for feita
 * de qualquer jeito.
 *
 * O que esta suíte prende:
 *
 * 1. **Lista fechada de encurtador**, conferida ANTES de qualquer conexão e
 *    antes de qualquer consulta de nome. Host fora da lista é 422, e o dublê
 *    de rede prova que nada saiu.
 * 2. **Endereço conferido DEPOIS de resolver o nome, a CADA salto**, e a
 *    conexão vai para o endereço conferido, nunca para uma segunda consulta ao
 *    DNS. Privado, retorno local, link-local (onde mora o serviço de metadados
 *    de nuvem) e não roteável são recusados, inclusive no segundo salto, que é
 *    como a defesa que só olha a primeira URL é contornada.
 * 3. **Tetos**: quatro saltos, cinco segundos, e nenhum corpo lido.
 * 4. **O destino final é um domínio do Google Maps**, e a coordenada é lida da
 *    URL final pelo MESMO leitor do painel (`lerLocalizacao`, do pacote
 *    compartilhado). Destino sem coordenada legível responde que o link não
 *    aponta para um ponto.
 * 5. **Nada de coordenada no log.** O coletor de log é a prova.
 */

const SENHA = "senha-de-teste-bem-comprida";

/* Um ponto real de Florianópolis, o mesmo de `rota.test.ts`. */
const LAT = -27.595378;
const LNG = -48.54805;

/* Endereços PÚBLICOS de mentira, escolhidos fora de toda faixa recusada. */
const ENDERECO_DO_ENCURTADOR = "142.250.79.4";
const ENDERECO_DO_MAPS = "172.217.29.14";
const ENDERECO_V6_PUBLICO = "2800:3f0:4001:80a::200e";

const LINK_CURTO = "https://maps.app.goo.gl/AbCdEfGhIjKlMnOp7";
const URL_DE_LUGAR =
  `https://www.google.com/maps/place/Rua+das+Flores/@${LAT},${LNG},17z/data=!3m1!4b1`;

type Resposta = {
  status: number;
  location?: string;
  /** A resposta que nunca chega: espera o sinal de abandono. */
  pendurar?: boolean;
};

type Conexao = { url: string; endereco: string; familia: number };

let mem: BancoEmMemoria;
let app: FastifyInstance;
let respostas: Record<string, Resposta> = {};
let enderecos: Record<string, string> = {};
let conexoes: Conexao[] = [];
let consultasDeNome: string[] = [];
let linhasDeLog: string[] = [];

/**
 * Doze operadoras, uma por caso, em rodízio.
 *
 * O teto da rota é de trinta pedidos por minuto POR PESSOA, e esta suíte faz
 * mais de oitenta. Com uma conta só, os casos do fim levariam 429 por causa
 * dos casos do começo, e o vermelho não diria nada sobre a rota. O rodízio
 * mantém cada caso abaixo do teto sem afrouxar o teto.
 */
const OPERADORAS = Array.from({ length: 12 }, (_, i) => `operadora${i}@serraalta.exemplo.gov.br`);
const AGENTE = "diego@serraalta.exemplo.gov.br";
let operadoraDaVez = OPERADORAS[0]!;
let rodizio = 0;

const tokens: Record<string, string> = {};

function configDeTeste(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv;
}

/**
 * O dublê do DNS: guarda cada nome consultado e responde o endereço que o
 * caso mandou. É por ele que a suíte consegue simular o nome público que
 * resolve para dentro da rede, que é o ataque inteiro.
 */
const lookup: Lookup = async (nome) => {
  consultasDeNome.push(nome);
  const endereco = enderecos[nome];
  if (!endereco) throw new Error(`ENOTFOUND ${nome}`);
  return { address: endereco, family: endereco.includes(":") ? 6 : 4 };
};

/**
 * O dublê da rede: guarda para ONDE cada conexão foi (URL e endereço já
 * conferido) e responde só status e `Location`, que é tudo que a rota pode
 * ler. Nenhuma requisição de verdade sai daqui.
 */
const buscar: BuscarCabecalhos = async (url, { endereco, familia, signal }) => {
  conexoes.push({ url: url.href, endereco, familia });
  const r = respostas[url.href];
  if (!r) throw new Error(`o teste não cadastrou resposta para ${url.href}`);
  if (r.pendurar) {
    await new Promise<never>((_, rejeitar) => {
      signal.addEventListener("abort", () => rejeitar(new Error("abandonada")), { once: true });
    });
  }
  return { status: r.status, location: r.location ?? null };
};

async function entrar(instancia: FastifyInstance, email: string): Promise<string> {
  const r = await instancia.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  expect(r.statusCode, `login de ${email} falhou: ${r.body}`).toBe(200);
  return r.json().acesso as string;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: false });
  const db = mem.bruto;

  const a = await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome,municipio,uf) VALUES ('DC Serra Alta','Serra Alta','MG') RETURNING id",
  );
  const hash = await derivarSenha(SENHA);
  const contas: Array<[string, string, string, string]> = OPERADORAS.map((email, i) => [
    `Operadora ${i}`, `SA-${i + 10}`, email, "operador",
  ]);
  contas.push(["Diego Alves", "SA-3", AGENTE, "agente_campo"]);
  for (const [nome, matricula, email, papel] of contas) {
    await db.query(
      `INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,senha_hash)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [a.rows[0]!.id, nome, matricula, email, papel, hash],
    );
  }

  app = await construirServidor({
    banco: mem.banco,
    config: carregarConfig(configDeTeste()),
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
    mapa: { buscar, lookup, tempoLimiteMs: 80 },
    destinoDeLog: { write: (linha) => { linhasDeLog.push(linha); } },
  });
  await app.ready();

  for (const email of [...OPERADORAS, AGENTE]) tokens[email] = await entrar(app, email);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

beforeEach(() => {
  operadoraDaVez = OPERADORAS[rodizio % OPERADORAS.length]!;
  rodizio += 1;
  conexoes = [];
  consultasDeNome = [];
  linhasDeLog = [];
  enderecos = {
    "maps.app.goo.gl": ENDERECO_DO_ENCURTADOR,
    "goo.gl": ENDERECO_DO_ENCURTADOR,
    "www.google.com": ENDERECO_DO_MAPS,
    "google.com": ENDERECO_DO_MAPS,
    "maps.google.com": ENDERECO_DO_MAPS,
    "www.google.com.br": ENDERECO_DO_MAPS,
    "google.com.br": ENDERECO_DO_MAPS,
  };
  /* O caso comum: o encurtador manda para um link de lugar, que responde 200. */
  respostas = {
    [LINK_CURTO]: { status: 302, location: URL_DE_LUGAR },
    [URL_DE_LUGAR]: { status: 200 },
  };
});

async function resolver(url: unknown = LINK_CURTO, quem: string = operadoraDaVez) {
  return app.inject({
    method: "POST", url: "/mapa/resolver-link",
    headers: { authorization: `Bearer ${tokens[quem]!}` },
    payload: { url },
  });
}

describe("Quem pode pedir", () => {
  it("sem token é 401, e nada sai para a rede", async () => {
    const r = await app.inject({ method: "POST", url: "/mapa/resolver-link", payload: { url: LINK_CURTO } });
    expect(r.statusCode).toBe(401);
    expect(conexoes).toHaveLength(0);
    expect(consultasDeNome).toHaveLength(0);
  });

  it("quem não registra ocorrência leva 403 antes de qualquer conexão", async () => {
    /*
      A permissão é `abrir_ocorrencia`: é quem informa a localização quando o
      chamado entra, e é quem cola o link. O agente de campo diz onde a casa
      fica pela vistoria, com o GPS do aparelho, e não por link.
    */
    const r = await resolver(LINK_CURTO, AGENTE);
    expect(r.statusCode, r.body).toBe(403);
    expect(r.json().erro).toBe("sem_permissao");
    expect(conexoes).toHaveLength(0);
    expect(consultasDeNome).toHaveLength(0);
  });
});

describe("A lista fechada de encurtador, conferida antes de tudo", () => {
  it("as listas são as da especificação, e não uma folga", () => {
    expect([...ENCURTADORES_ACEITOS].sort()).toEqual(["goo.gl", "maps.app.goo.gl"]);
    expect([...DESTINOS_DO_GOOGLE_MAPS].sort()).toEqual([
      "google.com", "google.com.br", "maps.google.com", "www.google.com", "www.google.com.br",
    ]);
  });

  it("host fora da lista é 422 link_nao_aceito, sem consultar nome nem conectar", async () => {
    const recusados = [
      "https://bit.ly/3xYz",
      "https://tinyurl.com/abc",
      "https://www.google.com/maps?q=-27.5,-48.5",
      "https://maps.app.goo.gl.exemplo.com/AbC",
      "https://exemplo.com/maps.app.goo.gl/AbC",
      "https://maps.app.goo.gl@exemplo.com/AbC",
      "https://usuario:senha@maps.app.goo.gl/AbC",
      "https://maps.app.goo.gl:8443/AbC",
      "http://maps.app.goo.gl/AbC",
      "ftp://maps.app.goo.gl/AbC",
      "maps.app.goo.gl/AbC",
      "javascript:alert(1)",
    ];
    for (const url of recusados) {
      const r = await resolver(url);
      expect(r.statusCode, url).toBe(422);
      expect(r.json().erro, url).toBe("link_nao_aceito");
      expect(r.json().mensagem, url).toMatch(/maps\.app\.goo\.gl/);
    }
    expect(conexoes).toHaveLength(0);
    expect(consultasDeNome).toHaveLength(0);
  });

  it("corpo que não é um link de até 500 caracteres é 422", async () => {
    for (const corpo of [
      { url: "" },
      { url: `https://maps.app.goo.gl/${"a".repeat(500)}` },
      { url: 12 },
      {},
    ]) {
      const r = await app.inject({
        method: "POST", url: "/mapa/resolver-link",
        headers: { authorization: `Bearer ${tokens[operadoraDaVez]!}` },
        payload: corpo,
      });
      expect(r.statusCode, JSON.stringify(corpo)).toBe(422);
    }
    expect(conexoes).toHaveLength(0);
  });

  it("os dois encurtadores da lista passam, e o `goo.gl` antigo chega ao mesmo mapa", async () => {
    const antigo = "https://goo.gl/maps/XyZ123";
    respostas[antigo] = { status: 301, location: `${LINK_CURTO}?g_st=ic` };
    respostas[`${LINK_CURTO}?g_st=ic`] = { status: 302, location: URL_DE_LUGAR };
    const r = await resolver(antigo);
    expect(r.statusCode, r.body).toBe(200);
    expect(conexoes.map((c) => c.url)).toEqual([antigo, `${LINK_CURTO}?g_st=ic`, URL_DE_LUGAR]);
  });
});

describe("O endereço é conferido depois de resolver o nome, e a cada salto", () => {
  const PRIVADOS = [
    "10.0.0.5", "127.0.0.1", "169.254.169.254", "0.0.0.0", "172.16.0.1", "192.168.1.1",
    "100.64.0.1", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "::", "::ffff:10.0.0.5",
    "::ffff:127.0.0.1", "64:ff9b::a00:5", "2002:a00:5::1",
  ];

  it("a régua de endereço, endereço a endereço", () => {
    for (const endereco of PRIVADOS) {
      expect(enderecoPublico(endereco), `${endereco} deveria ser recusado`).toBe(false);
    }
    for (const endereco of [ENDERECO_DO_ENCURTADOR, ENDERECO_DO_MAPS, ENDERECO_V6_PUBLICO, "8.8.8.8"]) {
      expect(enderecoPublico(endereco), `${endereco} deveria passar`).toBe(true);
    }
    expect(enderecoPublico("nao-e-endereco"), "o que não é endereço não é público").toBe(false);
  });

  it("nome do encurtador resolvendo para dentro da rede é recusado ANTES de conectar", async () => {
    for (const endereco of PRIVADOS) {
      conexoes = [];
      enderecos["maps.app.goo.gl"] = endereco;
      const r = await resolver();
      expect(r.statusCode, endereco).toBe(502);
      expect(r.json().erro, endereco).toBe("nao_resolveu");
      expect(conexoes, `conectou em ${endereco}`).toHaveLength(0);
    }
  });

  it("o SEGUNDO salto apontando para dentro também é recusado, e a conexão não acontece", async () => {
    /*
      O ataque clássico contra a defesa que só olha a primeira URL: o
      encurtador (público, aceito) redireciona para um nome da lista que, na
      hora da conexão, resolve para o serviço de metadados da nuvem.
    */
    for (const endereco of ["169.254.169.254", "10.0.0.5", "127.0.0.1", "::1", "fc00::1", "0.0.0.0"]) {
      conexoes = [];
      enderecos["www.google.com"] = endereco;
      const r = await resolver();
      expect(r.statusCode, endereco).toBe(502);
      expect(r.json().erro, endereco).toBe("nao_resolveu");
      expect(conexoes.map((c) => c.url), `conectou no segundo salto com ${endereco}`)
        .toEqual([LINK_CURTO]);
    }
  });

  it("cada conexão vai para o endereço que foi conferido, e o nome é consultado uma vez por salto", async () => {
    const r = await resolver();
    expect(r.statusCode, r.body).toBe(200);
    expect(consultasDeNome).toEqual(["maps.app.goo.gl", "www.google.com"]);
    expect(conexoes).toEqual([
      { url: LINK_CURTO, endereco: ENDERECO_DO_ENCURTADOR, familia: 4 },
      { url: URL_DE_LUGAR, endereco: ENDERECO_DO_MAPS, familia: 4 },
    ]);
  });

  it("endereço IPv6 público passa, com a família certa", async () => {
    enderecos["www.google.com"] = ENDERECO_V6_PUBLICO;
    const r = await resolver();
    expect(r.statusCode, r.body).toBe(200);
    expect(conexoes[1]).toEqual({ url: URL_DE_LUGAR, endereco: ENDERECO_V6_PUBLICO, familia: 6 });
  });

  it("nome que não resolve é 502, sem conectar", async () => {
    delete enderecos["www.google.com"];
    const r = await resolver();
    expect(r.statusCode).toBe(502);
    expect(r.json().erro).toBe("nao_resolveu");
    expect(conexoes.map((c) => c.url)).toEqual([LINK_CURTO]);
  });
});

describe("A conexão de verdade vai para o endereço conferido, e não lê corpo", () => {
  /*
    O dublê acima prova que a ROTA entrega o endereço certo à camada de rede.
    Esta parte prova que a camada de rede de PRODUÇÃO usa esse endereço: um
    servidor local escuta em 127.0.0.1, a URL leva um nome que não existe em
    DNS nenhum, e a conexão chega mesmo assim, porque o `lookup` fixo entrega
    o endereço conferido em vez de consultar o nome.
  */
  let servidor: Server;
  let porta = 0;
  let pedidos: Array<{ host: string | undefined; metodo: string | undefined; caminho: string | undefined }> = [];
  let conexaoFechada = false;

  beforeAll(async () => {
    servidor = createServer((req, res) => {
      pedidos.push({ host: req.headers.host, metodo: req.method, caminho: req.url });
      res.on("close", () => { conexaoFechada = true; });
      if (req.url === "/salto") {
        res.writeHead(302, { location: "/destino" });
        res.end();
        return;
      }
      /* Cabeçalhos, e um corpo que NUNCA termina: se a rota lesse corpo, travaria aqui. */
      res.writeHead(200, { "content-type": "text/html" });
      res.write("<html>".repeat(1000));
    });
    await new Promise<void>((resolve) => servidor.listen(0, "127.0.0.1", () => resolve()));
    porta = (servidor.address() as AddressInfo).port;
  });

  afterAll(async () => {
    servidor.closeAllConnections();
    await new Promise<void>((resolve) => servidor.close(() => resolve()));
  });

  beforeEach(() => {
    pedidos = [];
    conexaoFechada = false;
  });

  it("o `lookup` fixo devolve o endereço conferido para qualquer nome, nas duas formas que o `net` pede", async () => {
    const fixo = lookupFixo(ENDERECO_DO_MAPS, 4);
    const simples = await new Promise<unknown[]>((resolve) => {
      fixo("www.google.com", { all: false }, (...args: unknown[]) => resolve(args));
    });
    expect(simples).toEqual([null, ENDERECO_DO_MAPS, 4]);
    /* Com `autoSelectFamily`, o `net` pede `all: true` e espera uma lista. */
    const lista = await new Promise<unknown[]>((resolve) => {
      fixo("www.google.com", { all: true }, (...args: unknown[]) => resolve(args));
    });
    expect(lista).toEqual([null, [{ address: ENDERECO_DO_MAPS, family: 4 }]]);
  });

  it("conecta no endereço conferido com o nome no cabeçalho Host, e fecha sem ler o corpo", async () => {
    const url = new URL(`http://nome-que-nao-existe.invalid:${porta}/destino`);
    const controle = new AbortController();
    const r = await buscarCabecalhosPorHttp(url, {
      endereco: "127.0.0.1", familia: 4, signal: controle.signal,
    });
    expect(r).toEqual({ status: 200, location: null });
    expect(pedidos).toEqual([{ host: `nome-que-nao-existe.invalid:${porta}`, metodo: "GET", caminho: "/destino" }]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(conexaoFechada, "a conexão precisa ser fechada assim que os cabeçalhos chegam").toBe(true);
  });

  it("devolve o `Location` de um redirecionamento sem segui-lo por conta própria", async () => {
    const url = new URL(`http://nome-que-nao-existe.invalid:${porta}/salto`);
    const r = await buscarCabecalhosPorHttp(url, {
      endereco: "127.0.0.1", familia: 4, signal: new AbortController().signal,
    });
    expect(r).toEqual({ status: 302, location: "/destino" });
    expect(pedidos.map((p) => p.caminho), "quem segue o salto é a rota, depois de conferir").toEqual(["/salto"]);
  });

  it("o sinal de abandono derruba a conexão", async () => {
    const url = new URL(`http://nome-que-nao-existe.invalid:${porta}/destino`);
    const controle = new AbortController();
    controle.abort();
    await expect(buscarCabecalhosPorHttp(url, {
      endereco: "127.0.0.1", familia: 4, signal: controle.signal,
    })).rejects.toThrow();
  });
});

describe("Os tetos", () => {
  it("os números são os da especificação", () => {
    expect(TETO_DE_SALTOS).toBe(4);
    expect(TEMPO_LIMITE_MS).toBe(5_000);
  });

  it("quatro saltos passam, e o quinto é recusado sem ser seguido", async () => {
    const cadeia = (n: number) => `https://maps.app.goo.gl/salto${n}`;
    for (let i = 0; i < 4; i += 1) {
      respostas[cadeia(i)] = { status: 302, location: i === 3 ? URL_DE_LUGAR : cadeia(i + 1) };
    }
    const quatro = await resolver(cadeia(0));
    expect(quatro.statusCode, quatro.body).toBe(200);
    expect(conexoes).toHaveLength(5);

    conexoes = [];
    respostas[cadeia(3)] = { status: 302, location: cadeia(4) };
    respostas[cadeia(4)] = { status: 302, location: URL_DE_LUGAR };
    const cinco = await resolver(cadeia(0));
    expect(cinco.statusCode).toBe(502);
    expect(cinco.json().erro).toBe("nao_resolveu");
    expect(cinco.json().mensagem).toMatch(/voltas demais/);
    expect(conexoes, "o quinto redirecionamento não é seguido").toHaveLength(5);
  });

  it("tempo esgotado é 502, e a espera é abandonada", async () => {
    respostas[URL_DE_LUGAR] = { status: 200, pendurar: true };
    const inicio = Date.now();
    const r = await resolver();
    expect(r.statusCode).toBe(502);
    expect(r.json().erro).toBe("nao_resolveu");
    expect(r.json().mensagem).toMatch(/não respondeu a tempo/);
    expect(Date.now() - inicio).toBeLessThan(2_000);
  });

  it("redirecionamento sem `Location`, e status que não é nem 2xx nem 3xx, são 502", async () => {
    respostas[LINK_CURTO] = { status: 302 };
    expect((await resolver()).statusCode).toBe(502);
    respostas[LINK_CURTO] = { status: 404 };
    expect((await resolver()).statusCode).toBe(502);
    respostas[LINK_CURTO] = { status: 500 };
    expect((await resolver()).statusCode).toBe(502);
  });

  it("falha de rede é 502 sem repetir a mensagem do erro", async () => {
    delete respostas[URL_DE_LUGAR];
    const r = await resolver();
    expect(r.statusCode).toBe(502);
    expect(r.body).not.toMatch(/não cadastrou/);
  });
});

describe("O destino final só pode ser o Google Maps", () => {
  it("salto para fora do Google é recusado, e a conexão para lá nunca acontece", async () => {
    for (const destino of [
      "https://exemplo.com/mapa",
      "https://www.google.com.evil.example/maps/@-27.5,-48.5,17z",
      "http://www.google.com/maps/@-27.5,-48.5,17z",
      "https://www.google.com:8443/maps/@-27.5,-48.5,17z",
      "https://consent.google.com/m?continue=x",
      "https://169.254.169.254/latest/meta-data/",
      "https://[::1]/",
      "https://[fd00::1]/maps/@-27.5,-48.5,17z",
      "https://usuario@www.google.com/maps/@-27.5,-48.5,17z",
    ]) {
      conexoes = [];
      respostas[LINK_CURTO] = { status: 302, location: destino };
      const r = await resolver();
      expect(r.statusCode, destino).toBe(502);
      expect(r.json().erro, destino).toBe("nao_resolveu");
      expect(conexoes.map((c) => c.url), destino).toEqual([LINK_CURTO]);
    }
  });

  it("o encurtador que responde 200 em vez de redirecionar não é destino", async () => {
    respostas[LINK_CURTO] = { status: 200 };
    const r = await resolver();
    expect(r.statusCode).toBe(502);
    expect(r.json().erro).toBe("nao_resolveu");
  });

  it("`Location` relativo é resolvido contra a URL do salto", async () => {
    respostas[LINK_CURTO] = { status: 302, location: `/maps/@${LAT},${LNG},17z` };
    respostas[`https://maps.app.goo.gl/maps/@${LAT},${LNG},17z`] = { status: 302, location: URL_DE_LUGAR };
    const r = await resolver();
    expect(r.statusCode, r.body).toBe(200);
  });
});

describe("A coordenada lida da URL final, pelo leitor do painel", () => {
  const formatos: Array<[string, string]> = [
    ["@lat,lng na barra", `https://www.google.com/maps/place/Rua+X/@${LAT},${LNG},17z/data=!3m1!4b1`],
    ["!3d!4d do link de lugar", `https://www.google.com/maps/place/Rua+X/data=!4m6!3m5!1s0x0!8m2!3d${LAT}!4d${LNG}`],
    ["q= do compartilhamento", `https://maps.google.com/?q=${LAT},${LNG}`],
    ["query= com vírgula escapada", `https://www.google.com/maps/search/?api=1&query=${LAT}%2C${LNG}`],
    ["ll= do centro do mapa", `https://www.google.com.br/maps?ll=${LAT},${LNG}&z=17`],
    ["destination= do como chegar", `https://www.google.com/maps/dir/?api=1&destination=${LAT},${LNG}`],
    ["daddr= do como chegar antigo", `https://google.com/maps?daddr=${LAT},${LNG}`],
    ["domínio .com.br sem www", `https://google.com.br/maps?q=${LAT},${LNG}`],
  ];

  for (const [nome, urlFinal] of formatos) {
    it(`lê ${nome}`, async () => {
      respostas[LINK_CURTO] = { status: 302, location: urlFinal };
      respostas[urlFinal] = { status: 200 };
      const r = await resolver();
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json()).toEqual({ latitude: LAT, longitude: LNG, urlFinal });
    });
  }

  it("a URL final volta sem os parâmetros de rastreamento", async () => {
    const comRastreio = `${URL_DE_LUGAR}?g_st=ic&entry=tts&utm_source=share&g_ep=abc&shorturl=1&z=17`;
    respostas[LINK_CURTO] = { status: 302, location: comRastreio };
    respostas[comRastreio] = { status: 200 };
    const r = await resolver();
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().urlFinal).toBe(`${URL_DE_LUGAR}?z=17`);
    expect(urlFinalSemRastreamento(new URL(`https://www.google.com/maps?q=1.5,2.5&utm_campaign=x`)))
      .toBe("https://www.google.com/maps?q=1.5,2.5");
  });

  it("a coordenada volta com seis casas, como a gravação guarda", async () => {
    const longa = "https://www.google.com/maps/@-27.595378123456789,-48.548050987654321,17z";
    respostas[LINK_CURTO] = { status: 302, location: longa };
    respostas[longa] = { status: 200 };
    const r = await resolver();
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().latitude).toBe(-27.595378);
    expect(r.json().longitude).toBe(-48.548051);
  });

  it("destino sem coordenada legível é 422 sem_ponto, porque nome não é ponto", async () => {
    /*
      O Google às vezes redireciona o link curto para uma BUSCA por nome
      ("Padaria Central"), sem coordenada na URL. Transformar nome em ponto
      seria geocodificação, que este produto não faz: mandaria o endereço da
      família ao Google. A resposta diz isso e o que fazer.
    */
    for (const semPonto of [
      "https://www.google.com/maps/search/Padaria+Central/",
      "https://www.google.com/maps/place/Padaria+Central/data=!4m2!3m1!1s0x0:0x0",
      "https://maps.google.com/maps?cid=1234567890",
    ]) {
      respostas[LINK_CURTO] = { status: 302, location: semPonto };
      respostas[semPonto] = { status: 200 };
      const r = await resolver();
      expect(r.statusCode, semPonto).toBe(422);
      expect(r.json().erro, semPonto).toBe("sem_ponto");
      expect(r.json().mensagem, semPonto).toMatch(/não aponta para um ponto/);
    }
  });
});

describe("O que o servidor não guarda", () => {
  it("nem o link nem a coordenada vão para o log, no sucesso e nas falhas", async () => {
    await resolver();
    enderecos["www.google.com"] = "169.254.169.254";
    await resolver();
    respostas[LINK_CURTO] = { status: 302, location: "https://exemplo.com/x" };
    await resolver();
    respostas[LINK_CURTO] = { status: 302, location: URL_DE_LUGAR };
    respostas[URL_DE_LUGAR] = { status: 200, pendurar: true };
    await resolver();

    const log = linhasDeLog.join("\n");
    expect(log.length, "o coletor precisa ter recebido alguma coisa, senão o caso não mede nada")
      .toBeGreaterThan(0);
    for (const pedaco of ["-27.59", "-48.54", "AbCdEfGhIjKlMnOp7", "Rua+das+Flores", "169.254", "exemplo.com"]) {
      expect(log.includes(pedaco), `o log contém "${pedaco}"`).toBe(false);
    }
  });
});

describe("O teto por pessoa", () => {
  it("o trigésimo primeiro pedido no mesmo minuto leva 429", async () => {
    /*
      Servidor próprio, para o balde deste caso não somar com os outros: o
      limitador conta por pessoa e por instância. Cada pedido que passa é o
      servidor da prefeitura falando com o Google, e um cliente com defeito não
      pode virar um laço de consultas.
    */
    const proprio = await construirServidor({
      banco: mem.banco,
      config: carregarConfig(configDeTeste()),
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
      mapa: { buscar, lookup, tempoLimiteMs: 80 },
    });
    await proprio.ready();
    try {
      const token = await entrar(proprio, OPERADORAS[0]!);
      const codigos: number[] = [];
      for (let i = 0; i < 31; i += 1) {
        const r = await proprio.inject({
          method: "POST", url: "/mapa/resolver-link",
          headers: { authorization: `Bearer ${token}` },
          payload: { url: LINK_CURTO },
        });
        codigos.push(r.statusCode);
      }
      expect(codigos.slice(0, 30).every((s) => s === 200), codigos.join(",")).toBe(true);
      expect(codigos[30]).toBe(429);
    } finally {
      await proprio.close();
    }
  });
});
