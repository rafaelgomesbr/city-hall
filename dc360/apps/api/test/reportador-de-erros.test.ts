import { describe, expect, it } from "vitest";
import { filtrarEventoParaTerceiros } from "../src/observabilidade/filtro.js";
import {
  criarReportador, montarEvento, type ContextoDoErro, type EventoDeErro,
} from "../src/observabilidade/reportador.js";
import { lerAmbienteDeObservabilidade } from "../src/observabilidade/ambiente.js";
import { instalarCapturaDeProcesso } from "../src/observabilidade/captura-de-processo.js";

/**
 * O REPORTADOR DE ERROS e o filtro do que pode sair para terceiro
 * (V2-F01-E14, OPS-40).
 *
 * Não há SDK de ferramenta de erro nesta etapa (a escolha é do CP-06). O que
 * existe, e que o SDK vai receber como `beforeSend`, é o filtro: ele está aqui
 * provado ANTES de qualquer evento sair, que é a única ordem segura.
 */

const ID = "3f2b8c1e-5a47-4d0e-9b61-7c2d4e8f1a90";
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c3VhcmlvIn0.assinaturaDoToken123";

/** Um evento como o SDK do Sentry o montaria, cheio do que não pode sair. */
function eventoCheio(): EventoDeErro {
  return {
    level: "error",
    message: "falha para joana.silva@prefeitura-serra.gov.br",
    request: {
      method: "POST",
      url: "https://api.dc360.example/auth/redefinir/token-de-uso-unico-123?cpf=123.456.789-09",
      query_string: "cpf=123.456.789-09&email=a@b.org",
      route: "/auth/redefinir/:token",
      data: { senha: "senha-secreta-123", email: "a@b.org" },
      headers: {
        authorization: `Bearer ${JWT}`,
        cookie: "sid=cookie-secreto",
        "x-forwarded-for": "177.10.20.30",
        "user-agent": "Mozilla/5.0",
      },
      cookies: { sid: "cookie-secreto" },
    },
    user: { id: "u1", email: "joana.silva@prefeitura-serra.gov.br", ip_address: "177.10.20.30" },
    exception: {
      values: [{
        type: "Error",
        value: `Bearer ${JWT} recusado para (11) 91234-5678 em -22.906800, -43.172900`,
        stacktrace: {
          frames: [{
            filename: "/app/dist/rotas/x.js",
            vars: { senha: "senha-secreta-123", cpf: "12345678909" },
          }],
        },
      }],
    },
    tags: { requisicao: ID, origem: "http" },
    extra: { remoteAddress: "177.10.20.30", token: JWT, ip: "177.10.20.30", nota: "contato 11912345678" },
  };
}

describe("filtrarEventoParaTerceiros", () => {
  it("o evento filtrado não carrega corpo, cabeçalho, cookie, barra de endereço, IP nem usuário", () => {
    const saida = JSON.stringify(filtrarEventoParaTerceiros(eventoCheio()));
    for (const proibido of [
      "senha-secreta-123", "cookie-secreto", "177.10.20.30", "Mozilla", "token-de-uso-unico-123",
      "query_string", "cpf=123", "joana.silva", "a@b.org", "assinaturaDoToken123", JWT,
      "12345678909", "91234-5678", "-22.906800", "-43.172900", "11912345678",
    ]) {
      expect(saida, proibido).not.toContain(proibido);
    }
  });

  it("o bloco de usuário e os cabeçalhos somem como CHAVE, e não só o texto sensível dentro deles", () => {
    const saida = filtrarEventoParaTerceiros(eventoCheio()) as Record<string, unknown>;
    expect(saida).not.toHaveProperty("user");
    expect(saida["request"]).not.toHaveProperty("headers");
    expect(saida["request"]).not.toHaveProperty("data");
    expect(saida["request"]).not.toHaveProperty("url");
    expect(saida["extra"]).not.toHaveProperty("token");
    expect(saida["extra"]).not.toHaveProperty("ip");
  });

  it("o evento filtrado mantém o que serve ao diagnóstico: id, rota-molde, verbo e tipo do erro", () => {
    const saida = filtrarEventoParaTerceiros(eventoCheio()) as {
      tags: Record<string, string>;
      request: Record<string, unknown>;
      exception: { values: Array<{ type: string; value: string }> };
    };
    expect(saida.tags["requisicao"]).toBe(ID);
    expect(saida.request).toEqual({ method: "POST", route: "/auth/redefinir/:token" });
    expect(saida.exception.values[0]!.type).toBe("Error");
    expect(saida.exception.values[0]!.value).toContain("[telefone]");
    expect(saida.exception.values[0]!.value).toContain("[coordenada]");
  });

  it("não altera o evento original (ele ainda serve ao log local)", () => {
    const original = eventoCheio();
    const antes = JSON.stringify(original);
    filtrarEventoParaTerceiros(original);
    expect(JSON.stringify(original)).toBe(antes);
  });

  it("não quebra com referência circular nem com profundidade absurda", () => {
    const circular: Record<string, unknown> = { nome: "x" };
    circular["si"] = circular;
    let fundo: Record<string, unknown> = { fim: "senha-no-fundo" };
    for (let i = 0; i < 50; i += 1) fundo = { filho: fundo };
    expect(() => filtrarEventoParaTerceiros({ circular, fundo })).not.toThrow();
  });

  it("evento sem bloco request continua sem bloco request", () => {
    expect(filtrarEventoParaTerceiros({ level: "error" })).toEqual({ level: "error" });
  });
});

describe("criarReportador", () => {
  function coletor() {
    const chamadas: Array<{ objeto: Record<string, unknown>; mensagem: string }> = [];
    return {
      chamadas,
      log: { error: (objeto: Record<string, unknown>, mensagem: string) => { chamadas.push({ objeto, mensagem }); } },
    };
  }
  const contexto: ContextoDoErro = {
    origem: "http", requisicao: ID, metodo: "GET", rota: "/ocorrencias/:id", status: 500,
  };

  it("sem destino externo, só registra em nível error, com id, rota e status", () => {
    const { chamadas, log } = coletor();
    criarReportador({ log }).reportar(new Error("falhou"), contexto);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]!.mensagem).toBe("erro nao tratado");
    expect(chamadas[0]!.objeto).toMatchObject({ origem: "http", requisicao: ID, metodo: "GET", rota: "/ocorrencias/:id", status: 500 });
  });

  it("a mensagem e a pilha vão mascaradas para o log", () => {
    const { chamadas, log } = coletor();
    criarReportador({ log }).reportar(
      new Error("violou restrição de maria@prefeitura.gov.br, tel 11 98888-7777"), contexto,
    );
    const erro = chamadas[0]!.objeto["err"] as Error;
    expect(erro.message).toBe("violou restrição de [email], tel [telefone]");
    expect(erro.stack ?? "").not.toContain("maria@");
  });

  it("com destino externo, entrega o evento FILTRADO", () => {
    const { log } = coletor();
    const recebidos: EventoDeErro[] = [];
    const erro = new Error(`Bearer ${JWT} para joana@prefeitura.gov.br`);
    criarReportador({ log, enviar: (e) => { recebidos.push(e); } }).reportar(erro, contexto);
    expect(recebidos).toHaveLength(1);
    const texto = JSON.stringify(recebidos[0]);
    expect(texto).not.toContain(JWT);
    expect(texto).not.toContain("assinaturaDoToken123");
    expect(texto).not.toContain("joana@");
    expect(texto).toContain(ID);
    expect(recebidos[0]!["request"]).toEqual({ method: "GET", route: "/ocorrencias/:id" });
  });

  it("negativo: destino externo que lança não derruba quem reporta", () => {
    const { chamadas, log } = coletor();
    const reportador = criarReportador({ log, enviar: () => { throw new Error("destino fora do ar"); } });
    expect(() => reportador.reportar(new Error("x"), contexto)).not.toThrow();
    expect(chamadas.map((c) => c.mensagem)).toContain("o destino externo de erros falhou ao receber o evento");
  });

  it("valor lançado que não é Error (string, objeto, null) também é reportado, sem vazar", () => {
    const { chamadas, log } = coletor();
    const reportador = criarReportador({ log });
    reportador.reportar("texto com a@b.org", contexto);
    reportador.reportar({ senha: "senha-secreta-123" }, contexto);
    reportador.reportar(null, contexto);
    expect(chamadas).toHaveLength(3);
    expect(JSON.stringify(chamadas)).not.toContain("senha-secreta-123");
    expect(JSON.stringify(chamadas)).not.toContain("a@b.org");
  });

  it("montarEvento etiqueta origem, id, rotina e status", () => {
    const evento = montarEvento(new Error("x"), { origem: "rotina", rotina: "minimizacao", requisicao: ID, status: 500 });
    expect(evento["tags"]).toEqual({ origem: "rotina", requisicao: ID, rotina: "minimizacao", http_status: "500" });
    expect(evento["level"]).toBe("error");
  });
});

describe("lerAmbienteDeObservabilidade", () => {
  it("sem variáveis, tudo desligado e sem aviso", () => {
    expect(lerAmbienteDeObservabilidade({})).toEqual({ errosDsn: null, cotaDeArmazenamentoBytes: null, avisos: [] });
  });

  it("lê a cota em bytes inteiros e o DSN", () => {
    const a = lerAmbienteDeObservabilidade({ S3_COTA_BYTES: "107374182400", ERROS_DSN: " https://chave@erros.exemplo/1 " });
    expect(a.cotaDeArmazenamentoBytes).toBe(107374182400);
    expect(a.errosDsn).toBe("https://chave@erros.exemplo/1");
    expect(a.avisos).toEqual([]);
  });

  it("negativo: cota que não é inteiro positivo desliga o alerta e avisa, sem derrubar a partida", () => {
    for (const ruim of ["0", "-5", "10GB", "1e12", "1.5", "abc", "007"]) {
      const a = lerAmbienteDeObservabilidade({ S3_COTA_BYTES: ruim });
      expect(a.cotaDeArmazenamentoBytes, ruim).toBeNull();
      expect(a.avisos, ruim).toHaveLength(1);
    }
  });

  it("o aviso nunca repete o DSN nem o valor errado", () => {
    const a = lerAmbienteDeObservabilidade({ S3_COTA_BYTES: "chave-secreta", ERROS_DSN: "https://segredo@x/1" });
    expect(JSON.stringify(a.avisos)).not.toContain("chave-secreta");
    expect(JSON.stringify(a.avisos)).not.toContain("segredo@");
  });
});

describe("instalarCapturaDeProcesso", () => {
  function alvoFalso() {
    const ouvintes = new Map<string, (arg: unknown) => void>();
    return {
      ouvintes,
      alvo: { on: (nome: string, f: (arg: unknown) => void) => { ouvintes.set(nome, f); return undefined as never; } },
    };
  }

  it("exceção não tratada e promessa rejeitada passam pelo reportador e depois saem com código 1", () => {
    const { ouvintes, alvo } = alvoFalso();
    const reportados: Array<{ erro: unknown; contexto: ContextoDoErro }> = [];
    const saidas: number[] = [];
    instalarCapturaDeProcesso(
      { reportar: (erro, contexto) => { reportados.push({ erro, contexto }); } },
      { alvo: alvo as never, sair: (c) => { saidas.push(c); } },
    );
    expect([...ouvintes.keys()].sort()).toEqual(["uncaughtException", "unhandledRejection"]);

    ouvintes.get("uncaughtException")!(new Error("estourou"));
    ouvintes.get("unhandledRejection")!("promessa sem catch");
    expect(reportados.map((r) => r.contexto.origem)).toEqual(["processo", "processo"]);
    expect(saidas).toEqual([1, 1]);
  });
});
