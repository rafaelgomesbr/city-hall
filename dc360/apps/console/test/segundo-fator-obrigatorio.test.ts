import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { construirConsole } from "../src/servidor.js";
import { abrirCofre, contextoDoOperador, lerRegistro } from "../src/operadores.js";
import { verificarSessao } from "../src/tokens.js";
import type { Config } from "../src/config.js";
import type { EscritaDoConsole, LeituraDoConsole } from "../src/banco.js";
import { derivarSenha } from "../../api/src/auth/senha.js";
import { base32Decodificar, codigoTotp, gerarSegredoTotp, passoDe } from "../../api/src/auth/totp.js";

/**
 * O segundo fator no console, e a diferença que ele tem para o do produto.
 *
 * No município o segundo fator é uma exigência que o servidor liga, e o
 * administrador que ainda não ativou recebe um desafio que abre a ativação.
 * Existe, ali, um estado legítimo de "conta sem segundo fator ainda".
 *
 * NO CONSOLE ESSE ESTADO NÃO EXISTE, e a decisão 4 da ADR 0008 é explícita
 * sobre isso: "sem exceção e sem 'por enquanto não'". A conta do fornecedor é a
 * única do sistema cujo comprometimento afeta mais de um município, ainda que só
 * em métrica agregada.
 *
 * Este arquivo prova as duas metades disso:
 *
 *   1. O PROCESSO NÃO SOBE com um operador sem segredo de TOTP. A exigência é
 *      recusada na partida, e não no login, porque uma exigência que só aparece
 *      quando alguém tenta entrar é uma exigência que fica desligada nos meses
 *      em que ninguém entra.
 *   2. A SENHA SOZINHA NÃO ABRE NADA. A primeira etapa devolve um desafio, e o
 *      desafio é recusado por toda rota de leitura do console.
 *
 * O código de seis dígitos é o do produto, literalmente: `codigoTotp` de
 * `apps/api/src/auth/totp.ts`. O console não tem implementação própria de TOTP,
 * e é por isso que este teste consegue gerar um código válido chamando a mesma
 * função que o servidor confere.
 */

const EMAIL = "coordenacao@fornecedor.com.br";
const SENHA = "senha-de-teste-bem-comprida-do-operador";
const CHAVE = randomBytes(32).toString("base64");

const cofre = abrirCofre(CHAVE);
const SEGREDO_TOTP = gerarSegredoTotp();

/** Uma leitura que nunca é chamada: este arquivo não passa da porta. */
const LEITURA_VAZIA: LeituraDoConsole = {
  ler: async () => [],
  encerrar: async () => {},
};

/**
 * E uma escrita que acusa em vez de obedecer, pela mesma razão: este arquivo
 * mede a porta, e nenhum caso dele deveria chegar a escrever coisa nenhuma.
 */
const ESCRITA_QUE_ACUSA: EscritaDoConsole = {
  executar: async () => {
    throw new Error("uma rota escreveu sem passar pela porta");
  },
};

function configuracao(operadores: string): Config {
  return {
    NODE_ENV: "test",
    CONSOLE_PORT: 0,
    CONSOLE_HOST: "127.0.0.1",
    CONSOLE_JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes-aqui",
    CONSOLE_SEGUNDO_FATOR_CHAVE: CHAVE,
    CONSOLE_OPERADORES: operadores,
  };
}

let app: FastifyInstance;
let registroBom: string;

beforeAll(async () => {
  const hash = await derivarSenha(SENHA);
  registroBom = JSON.stringify([{
    email: EMAIL,
    senha: hash,
    segundoFator: cofre.cifrar(SEGREDO_TOTP, contextoDoOperador(EMAIL)),
  }]);
  app = await construirConsole({
    config: configuracao(registroBom),
    leitura: LEITURA_VAZIA,
    escrita: ESCRITA_QUE_ACUSA,
    // Alto de proposito: o limite por endereco tem caso proprio mais abaixo, e
    // aqui ele so atrapalharia os casos que medem outra coisa.
    limitePorEndereco: 500,
  });
});

afterAll(async () => {
  await app?.close();
});

function codigoDeAgora(quando = new Date()): string {
  return codigoTotp(base32Decodificar(SEGREDO_TOTP)!, passoDe(quando));
}

async function primeiraEtapa(): Promise<{ status: number; corpo: any }> {
  const r = await app.inject({
    method: "POST", url: "/entrar",
    payload: { email: EMAIL, senha: SENHA },
  });
  return { status: r.statusCode, corpo: r.json() };
}

describe("Entrar no console exige o segundo fator, sem excecao", () => {
  it("a senha certa NAO devolve sessao, devolve desafio", async () => {
    const { status, corpo } = await primeiraEtapa();
    expect(status).toBe(200);
    expect(
      corpo.token,
      "a primeira etapa devolveu um token. Quem tem o token nao precisa da tela " +
      "para nada, entao o segundo fator seria uma etapa a mais e nenhuma protecao a mais",
    ).toBeUndefined();
    expect(corpo.desafio, "a primeira etapa nao devolveu desafio nenhum").toBeTypeOf("string");
    expect(corpo.falta).toBe("codigo");

    /*
      E o desafio não é uma sessão disfarçada: a mesma verificação que o portão
      das rotas de leitura usa o recusa.
    */
    const segredo = new TextEncoder().encode(configuracao(registroBom).CONSOLE_JWT_SEGREDO);
    expect(
      await verificarSessao(segredo, corpo.desafio),
      "o desafio da primeira etapa passa como sessao: a senha sozinha abriria o console",
    ).toBeNull();
  });

  it("o desafio da primeira etapa e recusado pelas rotas de leitura", async () => {
    const { corpo } = await primeiraEtapa();
    const r = await app.inject({
      method: "GET", url: "/municipios",
      headers: { authorization: `Bearer ${corpo.desafio}` },
    });
    expect(
      r.statusCode,
      "o console entregou numero de municipio para quem so digitou a senha",
    ).toBe(401);
  });

  it("sem cabecalho nenhum, a rota de numeros recusa", async () => {
    const r = await app.inject({ method: "GET", url: "/municipios" });
    expect(r.statusCode).toBe(401);
  });

  it("a senha errada nao passa da primeira etapa, e a resposta e igual a de email desconhecido", async () => {
    const errada = await app.inject({
      method: "POST", url: "/entrar",
      payload: { email: EMAIL, senha: "nao-e-essa" },
    });
    const inexistente = await app.inject({
      method: "POST", url: "/entrar",
      payload: { email: "ninguem@fornecedor.com.br", senha: SENHA },
    });

    expect(errada.statusCode).toBe(401);
    expect(inexistente.statusCode).toBe(401);
    expect(
      errada.json(),
      "a resposta para senha errada difere da de email desconhecido, e a diferenca " +
      "transforma a rota de entrar numa lista de quem trabalha no fornecedor",
    ).toEqual(inexistente.json());
  });

  it("com o codigo certo, a sessao nasce e ela vale nas rotas de leitura", async () => {
    const { corpo: primeira } = await primeiraEtapa();
    const r = await app.inject({
      method: "POST", url: "/entrar/codigo",
      payload: { desafio: primeira.desafio, codigo: codigoDeAgora() },
    });

    expect(r.statusCode, `a segunda etapa recusou o codigo certo: ${r.body}`).toBe(200);
    const sessao = r.json();
    expect(sessao.token).toBeTypeOf("string");
    expect(sessao.operador).toBe(EMAIL);

    const numeros = await app.inject({
      method: "GET", url: "/municipios",
      headers: { authorization: `Bearer ${sessao.token}` },
    });
    expect(numeros.statusCode).toBe(200);
  });

  it("o mesmo codigo nao serve duas vezes", async () => {
    /*
      O passo usado fica queimado, como no produto. Sem isso, quem enxergou a
      tela por cima do ombro (ou leu o print mandado no grupo) entra com o mesmo
      numero enquanto a janela de trinta segundos nao virar.
    */
    /*
      O passo do MINUTO SEGUINTE, e nao o de agora: o caso anterior deste
      arquivo ja queimou o passo corrente, e reusa-lo aqui faria este caso
      passar verde por causa da queima do outro, e nao da sua propria. Um passo
      adiante continua dentro da tolerancia de um passo para cada lado.
    */
    const codigo = codigoDeAgora(new Date(Date.now() + 30_000));

    const primeira = await primeiraEtapa();
    const usa = await app.inject({
      method: "POST", url: "/entrar/codigo",
      payload: { desafio: primeira.corpo.desafio, codigo },
    });
    expect(usa.statusCode).toBe(200);

    const outra = await primeiraEtapa();
    const reusa = await app.inject({
      method: "POST", url: "/entrar/codigo",
      payload: { desafio: outra.corpo.desafio, codigo },
    });
    expect(
      reusa.statusCode,
      "o mesmo codigo de seis digitos entrou duas vezes",
    ).toBe(401);
  });

  it("desafio forjado, expirado ou de outro segredo nao vira sessao", async () => {
    for (const desafio of ["", "nao-e-um-token", "a.b.c"]) {
      const r = await app.inject({
        method: "POST", url: "/entrar/codigo",
        payload: { desafio, codigo: codigoDeAgora() },
      });
      expect(r.statusCode, `o console aceitou o desafio ${JSON.stringify(desafio)}`)
        .toBeGreaterThanOrEqual(400);
      expect(r.json().token).toBeUndefined();
    }
  });

  it("codigos errados demais poem a conta de castigo", async () => {
    /*
      Contador PROPRIO do segundo fator, separado do da senha. Com um contador
      so, o da senha zeraria a cada acerto de senha e adivinhar seis digitos
      teria tentativas infinitas: bastaria refazer a primeira etapa entre as
      tentativas, que e exatamente o que este caso faz.
    */
    const solitario = "sozinho@fornecedor.com.br";
    const hash = await derivarSenha(SENHA);
    const proprio = await construirConsole({
      config: configuracao(JSON.stringify([{
        email: solitario,
        senha: hash,
        segundoFator: cofre.cifrar(gerarSegredoTotp(), contextoDoOperador(solitario)),
      }])),
      leitura: LEITURA_VAZIA,
      escrita: ESCRITA_QUE_ACUSA,
      limitePorEndereco: 500,
    });

    try {
      const desfechos: number[] = [];
      for (let tentativa = 0; tentativa < 6; tentativa++) {
        // A senha certa a cada volta, de proposito: e o que prova que o teto do
        // segundo fator NAO e o mesmo contador da senha. Com um contador so,
        // acertar a senha zeraria as tentativas e os seis digitos teriam
        // tentativas infinitas.
        const abre = await proprio.inject({
          method: "POST", url: "/entrar",
          payload: { email: solitario, senha: SENHA },
        });
        const r = await proprio.inject({
          method: "POST", url: "/entrar/codigo",
          payload: { desafio: abre.json().desafio, codigo: "000000" },
        });
        desfechos.push(r.statusCode);
      }

      expect(
        desfechos.slice(0, 5),
        "alguma das cinco primeiras tentativas nao foi recusada como codigo errado",
      ).toEqual([401, 401, 401, 401, 401]);
      expect(
        desfechos[5],
        "a sexta tentativa passou: cinco codigos errados nao puseram a conta de " +
        "castigo, e seis digitos com tentativas infinitas sao seis digitos sem " +
        "valor nenhum",
      ).toBe(429);
    } finally {
      await proprio.close();
    }
  }, 60_000);
});

describe("O console recusa subir com operador sem segundo fator", () => {
  it("operador sem `segundoFator` derruba a partida, e nao o login", async () => {
    const semSegundoFator = JSON.stringify([{
      email: EMAIL,
      senha: "scrypt$131072$8$1$sal$hash",
    }]);
    expect(
      () => lerRegistro(semSegundoFator, cofre),
      "o console aceitou um operador sem segundo fator. Ele entraria so com senha, " +
      "e a ADR 0008 fecha essa porta sem excecao",
    ).toThrow(/segundo fator não é opcional/i);
  });

  it("operador com segundo fator vazio tambem derruba a partida", async () => {
    const vazio = JSON.stringify([{
      email: EMAIL, senha: "scrypt$131072$8$1$sal$hash", segundoFator: "",
    }]);
    expect(() => lerRegistro(vazio, cofre)).toThrow();
  });

  it("registro vazio derruba a partida", () => {
    // Um console sem operador nenhum sobe, responde e nao deixa ninguem entrar.
    // Falhar alto na partida e melhor que parecer pronto.
    expect(() => lerRegistro("[]", cofre)).toThrow();
  });

  it("envelope que nao abre com a chave atual derruba a partida", () => {
    /*
      Chave trocada, envelope copiado de outra instalação ou configuração colada
      pela metade produzem o MESMO sintoma no login: "código inválido". A pessoa
      tentaria de novo, gastaria o teto e concluiria que perdeu o aparelho.
      Recusar na partida diz qual operador está com problema.
    */
    const deOutraChave = abrirCofre(randomBytes(32).toString("base64"));
    const registro = JSON.stringify([{
      email: EMAIL,
      senha: "scrypt$131072$8$1$sal$hash",
      segundoFator: deOutraChave.cifrar(SEGREDO_TOTP, contextoDoOperador(EMAIL)),
    }]);
    expect(() => lerRegistro(registro, cofre)).toThrow(/não abre/i);
  });

  it("envelope movido da linha de um operador para a de outro nao abre", () => {
    /*
      O contexto amarra o envelope ao email. Sem ele, quem conseguisse editar a
      configuração copiaria o envelope de um operador para a linha de outro e
      passaria a gerar os códigos dele com o próprio aplicativo, sem nunca
      decifrar nada.
    */
    const doOutro = cofre.cifrar(SEGREDO_TOTP, contextoDoOperador("outra@fornecedor.com.br"));
    const registro = JSON.stringify([{
      email: EMAIL, senha: "scrypt$131072$8$1$sal$hash", segundoFator: doOutro,
    }]);
    expect(() => lerRegistro(registro, cofre)).toThrow(/não abre/i);
  });
});
