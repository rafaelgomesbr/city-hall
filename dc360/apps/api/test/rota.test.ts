import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { derivarSenha } from "../src/auth/senha.js";
import {
  CAMPOS_PEDIDOS_AO_GOOGLE, ENDERECO_DA_ROUTES_API, VALIDADE_DA_CACHE_MS, origemArredondada,
} from "../src/rotas/rota.js";

/**
 * O CAMINHO POR RUAS, pedido pelo agente e traçado pelo Google, SEM a chave
 * sair do servidor.
 *
 * O reclame de quem paga, na letra: "o mapa mostra o ponto que tem uma
 * ocorrência e só isso, não mostra a rota, o tempo pra chegar, como se fosse
 * um GPS". Decidido com ele, com o custo na mesa: rota e tempo só quando o
 * agente pedir, num botão, com cache para não repetir.
 *
 * O que esta suíte fixa, e cada item é uma promessa de `docs/SUBPROCESSADORES.md`:
 *
 * 1. **A chave do Google nunca sai daqui.** A do aplicativo é restrita a Apps
 *    iOS ou Android e não serve para HTTP; a que serve (`ROUTES_KEY`) é de
 *    servidor, sem restrição de origem, e quem a tiver gasta a conta do
 *    município. Ela vai no cabeçalho para o Google e em lugar nenhum mais.
 * 2. **Sem `ROUTES_KEY` a rota responde 503 dizendo que o município não ligou
 *    o caminho**, e não 404 (que o aplicativo leria como "servidor velho") nem
 *    200 vazio (que ele leria como "não há caminho").
 * 3. **O pedido ao Google carrega só o que a resposta precisa**, e a máscara de
 *    campos é a lista fechada: duração, distância e a polilinha. Pedir mais
 *    custa mais (a Routes API cobra por nível de campo) e traz dado que
 *    ninguém usa.
 * 4. **Cache de 24 h por par, em memória do processo.** É cache, não registro:
 *    morre com o processo, não vai ao banco, e existe para o mesmo agente
 *    tocando duas vezes no mesmo botão não custar duas vezes.
 * 5. **Nenhuma coordenada é registrada no servidor**: nem log, nem tabela. A
 *    rota é resposta, não registro. O coletor de log abaixo é a prova.
 */

const SENHA = "senha-de-teste-bem-comprida";

/**
 * Chave de mentira. NÃO começa com `AIza` porque o portão do mapa do painel e
 * do aplicativo reprovam o prefixo em qualquer fonte, e este arquivo, embora
 * fora da varredura deles, segue a mesma regra por coerência.
 */
const CHAVE_DE_MENTIRA = "chave-de-rotas-so-para-o-teste";

/* Dois pontos reais de Florianópolis, a uns 1,1 km um do outro. */
const ORIGEM = { latitude: -27.595378, longitude: -48.54805 };
const DESTINO = { latitude: -27.585378, longitude: -48.54805 };

/**
 * A resposta que a Routes API dá, na forma documentada em
 * https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes
 * com a máscara de campos que a rota pede. `duration` vem como texto com `s`
 * no fim, e é assim mesmo.
 */
const RESPOSTA_DO_GOOGLE = {
  routes: [{
    duration: "846s",
    distanceMeters: 4213,
    polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" },
  }],
};

type Chamada = { url: string; opcoes: { method: string; headers: Record<string, string>; body: string } };

let mem: BancoEmMemoria;
let comChave: FastifyInstance;
let semChave: FastifyInstance;
let chamadas: Chamada[] = [];
let respostaDoGoogle: { status: number; corpo: unknown } = { status: 200, corpo: RESPOSTA_DO_GOOGLE };
let agoraMs = Date.parse("2026-09-15T12:00:00Z");
let linhasDeLog: string[] = [];

const tokens: Record<string, string> = {};

function configDeTeste(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
    LOGIN_POR_IP: "10000",
    ...extra,
  } as NodeJS.ProcessEnv;
}

async function entrar(instancia: FastifyInstance, email: string): Promise<void> {
  const r = await instancia.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  expect(r.statusCode, `login de ${email} falhou: ${r.body}`).toBe(200);
  tokens[email] = r.json().acesso;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: false });
  const db = mem.bruto;

  const a = await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome,municipio,uf) VALUES ('DC Serra Alta','Serra Alta','MG') RETURNING id",
  );
  const hash = await derivarSenha(SENHA);
  await db.query(
    `INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,senha_hash)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [a.rows[0]!.id, "Diego Alves", "SA-3", "diego@serraalta.exemplo.gov.br", "agente_campo", hash],
  );

  /*
    O dublê do Google: guarda cada chamada e responde o que o caso mandou.
    Nenhuma requisição de verdade sai daqui, e é assim que a suíte consegue
    afirmar o que FOI mandado, que é o que importa: a chave, a máscara de
    campos e o modo de viagem.
  */
  const buscar = async (url: string, opcoes: Chamada["opcoes"]) => {
    chamadas.push({ url, opcoes });
    return { status: respostaDoGoogle.status, text: async () => JSON.stringify(respostaDoGoogle.corpo) };
  };

  comChave = await construirServidor({
    banco: mem.banco,
    config: carregarConfig(configDeTeste({ ROUTES_KEY: CHAVE_DE_MENTIRA })),
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
    rota: { buscar, agora: () => agoraMs },
    destinoDeLog: { write: (linha) => { linhasDeLog.push(linha); } },
  });
  await comChave.ready();

  semChave = await construirServidor({
    banco: mem.banco,
    config: carregarConfig(configDeTeste()),
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
    rota: { buscar, agora: () => agoraMs },
  });
  await semChave.ready();

  await entrar(comChave, "diego@serraalta.exemplo.gov.br");
}, 120_000);

afterAll(async () => {
  await comChave?.close();
  await semChave?.close();
  await mem?.banco.encerrar();
});

beforeEach(() => {
  chamadas = [];
  respostaDoGoogle = { status: 200, corpo: RESPOSTA_DO_GOOGLE };
  linhasDeLog = [];
  /* Cada caso anda o relógio um dia inteiro: a cache do caso anterior vence,
     e nenhum caso mede a cache que outro deixou. */
  agoraMs += VALIDADE_DA_CACHE_MS + 1;
});

function comToken() {
  return { authorization: `Bearer ${tokens["diego@serraalta.exemplo.gov.br"]!}` };
}

async function pedir(
  instancia: FastifyInstance,
  corpo: unknown = { origem: ORIGEM, destino: DESTINO },
) {
  return instancia.inject({ method: "POST", url: "/rota", headers: comToken(), payload: corpo });
}

describe("POST /rota, o caminho por ruas a pedido do agente", () => {
  it("traduz a resposta do Google em duração, distância e polilinha", async () => {
    const r = await pedir(comChave);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({
      duracaoSegundos: 846,
      distanciaMetros: 4213,
      polilinha: "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
    });
  });

  it("chama a Routes API com a chave no cabeçalho, a máscara fechada e o modo DRIVE", async () => {
    await pedir(comChave);
    expect(chamadas).toHaveLength(1);
    const [chamada] = chamadas;
    expect(chamada!.url).toBe(ENDERECO_DA_ROUTES_API);
    expect(chamada!.opcoes.method).toBe("POST");
    expect(
      chamada!.opcoes.headers["X-Goog-Api-Key"],
      "a chave vai no cabeçalho, e é a ROUTES_KEY do servidor: a do aplicativo "
      + "é restrita a Apps iOS ou Android e o Google recusa por HTTP",
    ).toBe(CHAVE_DE_MENTIRA);
    expect(
      chamada!.opcoes.headers["X-Goog-FieldMask"],
      "a máscara de campos é a lista fechada do que a resposta usa. A Routes "
      + "API cobra por nível de campo, e `*` pede o nível mais caro para "
      + "trazer o que ninguém lê",
    ).toBe(CAMPOS_PEDIDOS_AO_GOOGLE);
    expect(CAMPOS_PEDIDOS_AO_GOOGLE.split(",").sort()).toEqual([
      "routes.distanceMeters", "routes.duration", "routes.polyline.encodedPolyline",
    ]);

    const corpo = JSON.parse(chamada!.opcoes.body);
    expect(corpo.travelMode).toBe("DRIVE");
    /*
      A ORIGEM SAI ARREDONDADA a três casas (cerca de 111 m): é a posição de
      um servidor público identificável saindo do país, e cem metros bastam
      para um caminho de carro. O destino sai inteiro, porque é a casa.
    */
    expect(corpo.origin).toEqual({ location: { latLng: { latitude: -27.595, longitude: -48.548 } } });
    expect(corpo.origin).toEqual({ location: { latLng: origemArredondada(ORIGEM) } });
    expect(corpo.destination).toEqual({ location: { latLng: DESTINO } });
    /*
      Nada além dos três: nenhum endereço, nenhum identificador de ocorrência,
      nenhum nome. O Google recebe dois pontos e um modo de viagem, e é isso
      que a seção 2.2 de `docs/SUBPROCESSADORES.md` declara.
    */
    expect(Object.keys(corpo).sort()).toEqual(["destination", "origin", "travelMode"]);
  });

  it("a chave do Google nunca aparece na resposta", async () => {
    const r = await pedir(comChave);
    expect(r.body.includes(CHAVE_DE_MENTIRA)).toBe(false);
  });

  it("sem ROUTES_KEY responde 503 dizendo que o município não ligou o caminho", async () => {
    const r = await pedir(semChave);
    expect(
      r.statusCode,
      "503, e não 404: rota ausente o aplicativo lê como 'servidor velho'. E "
      + "não 200 vazio, que ele leria como 'não há caminho'. O serviço existe "
      + "e está desligado por escolha de quem implantou, como o push desligado",
    ).toBe(503);
    expect(r.json().erro).toBe("caminho_desligado");
    expect(r.json().mensagem).toMatch(/município não ligou o caminho/);
    expect(chamadas, "sem chave, o Google não é chamado nem por engano").toHaveLength(0);
  });

  it("exige token, e antes de qualquer outra coisa", async () => {
    const r = await comChave.inject({
      method: "POST", url: "/rota", payload: { origem: ORIGEM, destino: DESTINO },
    });
    expect(r.statusCode).toBe(401);
    expect(chamadas).toHaveLength(0);
  });

  it("coordenada que não é coordenada não vira pedido ao Google", async () => {
    /*
      A rota custa dinheiro por chamada. Um corpo com `NaN`, latitude 200 ou
      campo faltando precisa morrer aqui, com 422, antes de gastar uma chamada
      para receber um erro do Google que custaria a mesma coisa.
    */
    const casos: unknown[] = [
      { origem: { latitude: 200, longitude: 0 }, destino: DESTINO },
      { origem: { latitude: -27.5, longitude: 190 }, destino: DESTINO },
      { origem: { latitude: "x", longitude: 0 }, destino: DESTINO },
      { origem: ORIGEM },
      {},
    ];
    for (const corpo of casos) {
      const r = await pedir(comChave, corpo);
      expect(r.statusCode, JSON.stringify(corpo)).toBe(422);
    }
    expect(chamadas).toHaveLength(0);
  });

  it("a ilha nula (0,0) não é ponto de partida nem de chegada", async () => {
    /*
      É o mesmo filtro que o aplicativo aplica (`pontoQueSeMede`): 0,0 é o que
      o GPS devolve antes de fixar, e uma rota do golfo da Guiné até
      Florianópolis é seis mil quilômetros de resposta inútil, cobrada.
    */
    const r = await pedir(comChave, { origem: { latitude: 0, longitude: 0 }, destino: DESTINO });
    expect(r.statusCode).toBe(422);
    expect(chamadas).toHaveLength(0);
  });
});

describe("O teto por pessoa, porque cada chamada que passa da cache custa dinheiro", () => {
  it("o trigésimo primeiro pedido no mesmo minuto leva 429, mesmo com a cache ajudando", async () => {
    /*
      Servidor PRÓPRIO, para o balde deste caso não somar com os pedidos dos
      outros casos: o limitador conta por pessoa e por instância, e o teto
      medido aqui é o da rota, não o global de trezentos.
    */
    const proprio = await construirServidor({
      banco: mem.banco,
      config: carregarConfig(configDeTeste({ ROUTES_KEY: CHAVE_DE_MENTIRA })),
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
      rota: { buscar: async () => ({ status: 200, text: async () => JSON.stringify(RESPOSTA_DO_GOOGLE) }), agora: () => agoraMs },
    });
    await proprio.ready();
    try {
      const entrada = await proprio.inject({
        method: "POST", url: "/auth/entrar",
        payload: { email: "diego@serraalta.exemplo.gov.br", senha: SENHA },
      });
      const cabecalhos = { authorization: `Bearer ${entrada.json().acesso}` };
      const respostas: number[] = [];
      for (let i = 0; i < 31; i += 1) {
        /* Destinos diferentes, para a cache não esconder o custo: é o pior caso. */
        const r = await proprio.inject({
          method: "POST", url: "/rota", headers: cabecalhos,
          payload: { origem: ORIGEM, destino: { latitude: -27.5 - i / 1000, longitude: -48.5 } },
        });
        respostas.push(r.statusCode);
      }
      expect(respostas.slice(0, 30).every((s) => s === 200)).toBe(true);
      expect(
        respostas[30],
        "o trigésimo primeiro pedido do mesmo minuto precisa ser recusado: sem "
        + "este teto, um cliente com defeito vira uma fatura da Routes API",
      ).toBe(429);
    } finally {
      await proprio.close();
    }
  });
});

describe("A cache, que é cache e não registro", () => {
  it("o mesmo par pedido duas vezes custa UMA chamada ao Google", async () => {
    await pedir(comChave);
    await pedir(comChave);
    expect(chamadas).toHaveLength(1);
  });

  it("origem que mudou menos de cem metros ainda é a mesma origem", async () => {
    /*
      A origem é arredondada a três casas decimais (cerca de 111 m) antes de
      virar chave da cache. O agente parado no carro, com o GPS oscilando dez
      metros a cada leitura, não pode custar uma chamada por oscilação: a rota
      é a mesma, e a diferença some no primeiro quarteirão.
    */
    await pedir(comChave, { origem: { latitude: -27.5953, longitude: -48.5480 }, destino: DESTINO });
    await pedir(comChave, { origem: { latitude: -27.5954, longitude: -48.5481 }, destino: DESTINO });
    expect(chamadas).toHaveLength(1);
  });

  it("destino diferente é outro pedido", async () => {
    await pedir(comChave);
    await pedir(comChave, { origem: ORIGEM, destino: { latitude: -27.6, longitude: -48.55 } });
    expect(chamadas).toHaveLength(2);
  });

  it("depois de 24 horas o par é pedido de novo", async () => {
    /*
      Rua interditada de manhã está livre à tarde, e a estimativa de tempo
      envelhece. Vinte e quatro horas é o teto de quanto uma resposta pode
      valer; abaixo disso, o custo de reperguntar não compra precisão que o
      agente consiga usar.
    */
    await pedir(comChave);
    agoraMs += VALIDADE_DA_CACHE_MS - 1;
    await pedir(comChave);
    expect(chamadas).toHaveLength(1);

    agoraMs += 2;
    await pedir(comChave);
    expect(chamadas).toHaveLength(2);
  });

  it("resposta de erro do Google NÃO fica na cache", async () => {
    respostaDoGoogle = { status: 403, corpo: { error: { message: "API key not valid" } } };
    const falhou = await pedir(comChave);
    expect(falhou.statusCode).toBe(502);

    respostaDoGoogle = { status: 200, corpo: RESPOSTA_DO_GOOGLE };
    const deuCerto = await pedir(comChave);
    expect(deuCerto.statusCode).toBe(200);
    expect(chamadas).toHaveLength(2);
  });
});

describe("O que o servidor NÃO guarda", () => {
  it("o Google que recusou vira 502 sem repetir a mensagem dele e sem a coordenada", async () => {
    /*
      A mensagem do Google pode citar a chave ("API key not valid. Please pass a
      valid API key") e o corpo do pedido. Ela fica no servidor; o aplicativo
      recebe uma frase nossa, e a frase diz o que o agente pode fazer.
    */
    respostaDoGoogle = { status: 403, corpo: { error: { message: "API key not valid" } } };
    const r = await pedir(comChave);
    expect(r.statusCode).toBe(502);
    expect(r.json().erro).toBe("caminho_indisponivel");
    expect(r.body).not.toMatch(/API key/);
    expect(r.body).not.toMatch(/-27\.59/);
  });

  it("o Google que respondeu sem rota também vira 502, e não 200 vazio", async () => {
    respostaDoGoogle = { status: 200, corpo: { routes: [] } };
    const r = await pedir(comChave);
    expect(r.statusCode).toBe(502);
  });

  it("nenhuma coordenada vai para o log, nem no sucesso nem na falha", async () => {
    /*
      A rota é resposta, não registro. O serializador de `req` não registra o
      corpo, e este caso é o que impede alguém de acrescentar um
      `req.log.info({ origem, destino })` "para diagnóstico": a posição do
      agente é dado sobre um servidor público identificável, e o log é copiado
      para mais lugares que o banco.
    */
    await pedir(comChave);
    respostaDoGoogle = { status: 500, corpo: { error: { message: "backend error" } } };
    await pedir(comChave, { origem: ORIGEM, destino: { latitude: -27.61, longitude: -48.56 } });

    const log = linhasDeLog.join("\n");
    expect(log.length, "o coletor de log precisa ter recebido alguma coisa, senão o caso não mede nada")
      .toBeGreaterThan(0);
    for (const pedaco of ["-27.59", "-48.54", "-27.61", "-48.56", "27.585", CHAVE_DE_MENTIRA]) {
      expect(log.includes(pedaco), `o log contém "${pedaco}"`).toBe(false);
    }
  });

  it("não existe tabela nem coluna de rota no banco", async () => {
    /*
      A metade estrutural da promessa. Se um dia alguém criar `rotas_pedidas`
      "para estatística", este caso reprova antes de a migração chegar em
      produção.
    */
    const r = await mem.bruto.query<{ nome: string }>(
      `SELECT table_name || '.' || column_name AS nome
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (table_name ILIKE '%rota%' OR column_name ILIKE '%rota%')`,
    );
    expect(r.rows.map((l) => l.nome)).toEqual([]);
  });
});
