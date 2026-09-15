import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { construirConsole } from "../src/servidor.js";
import { abrirCofre, contextoDoOperador } from "../src/operadores.js";
import type { Config } from "../src/config.js";
import type { EscritaDoConsole, LeituraDoConsole } from "../src/banco.js";
import { derivarSenha } from "../../api/src/auth/senha.js";
import { base32Decodificar, codigoTotp, gerarSegredoTotp, passoDe } from "../../api/src/auth/totp.js";

/**
 * Quem opera o console precisa conseguir descobrir por que alguém não entrou.
 *
 * O ESTADO ANTERIOR: credencial recusada não escrevia UMA linha, em nível
 * nenhum, nem em produção. A tela diz "email ou senha incorretos" de propósito,
 * porque a resposta precisa ser a mesma para email desconhecido e para senha
 * errada (senão a rota de entrar vira uma lista de quem trabalha no fornecedor).
 * O efeito colateral era que ninguém, nem quem administra o processo, conseguia
 * distinguir "a senha está errada" de "o segundo fator expirou" de "o operador
 * saiu da configuração" de "o processo subiu com zero operadores". Quatro
 * causas, um sintoma, zero informação.
 *
 * O LIMITE, e ele é a outra metade deste arquivo: o log deste processo é lido
 * por mais gente do que a tela e fica guardado pelo tempo de retenção inteiro.
 * Nada que sirva para ENTRAR pode cair ali: nem senha, nem código de seis
 * dígitos, nem desafio, nem token de sessão, nem o segredo do segundo fator.
 * O caso que cobra isso roda uma entrada bem-sucedida inteira e procura cada um
 * desses valores no que o processo escreveu.
 */

const EMAIL = "coordenacao@fornecedor.com.br";
const SENHA = "senha-de-teste-bem-comprida-do-operador";
const CHAVE = randomBytes(32).toString("base64");
const cofre = abrirCofre(CHAVE);
const SEGREDO_TOTP = gerarSegredoTotp();

const LEITURA_VAZIA: LeituraDoConsole = { ler: async () => [], encerrar: async () => {} };
const ESCRITA_QUE_ACUSA: EscritaDoConsole = {
  executar: async () => {
    throw new Error("uma rota escreveu durante o teste de diagnostico");
  },
};

/**
 * A senha derivada UMA vez para o arquivo inteiro.
 *
 * Cada `derivarSenha` gasta uma passagem de `scrypt` de cerca de 128 MB, e este
 * arquivo monta três consoles. Derivando em cada um deles, eram três passagens
 * do mesmo hash, e com as suítes rodando em paralelo é essa memória que faz
 * caso de OUTRO arquivo estourar o prazo. O valor é o mesmo nos três.
 */
let hashDaSenha: Promise<string> | null = null;
function senhaDerivada(): Promise<string> {
  hashDaSenha ??= derivarSenha(SENHA);
  return hashDaSenha;
}

async function configDeTeste(ambiente: Config["NODE_ENV"] = "test"): Promise<Config> {
  return {
    NODE_ENV: ambiente,
    CONSOLE_PORT: 0,
    CONSOLE_HOST: "127.0.0.1",
    CONSOLE_JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes-aqui",
    CONSOLE_SEGUNDO_FATOR_CHAVE: CHAVE,
    CONSOLE_OPERADORES: JSON.stringify([{
      email: EMAIL,
      senha: await senhaDerivada(),
      segundoFator: cofre.cifrar(SEGREDO_TOTP, contextoDoOperador(EMAIL)),
    }]),
  };
}

/** O que o processo escreveu. Um caso pode zerar antes de agir. */
let log: string[] = [];
let app: FastifyInstance;

beforeAll(async () => {
  app = await construirConsole({
    config: await configDeTeste(),
    leitura: LEITURA_VAZIA,
    escrita: ESCRITA_QUE_ACUSA,
    limitePorEndereco: 500,
    destinoDeLog: { write: (linha: string) => { log.push(linha); } },
  });
}, 120_000);

afterAll(async () => {
  await app?.close();
});

function tudo(): string {
  return log.join("\n");
}

/**
 * O log sem a contabilidade do próprio registrador.
 *
 * Procurar um código de seis dígitos dentro do log cru é procura que acha
 * sozinha: `responseTime` sai como `0.4000001999`, `time` sai com treze
 * dígitos, e mais cedo ou mais tarde a sequência procurada aparece ali dentro
 * por acaso. Aconteceu: o caso do código reprovou com "000001" achado num
 * tempo de resposta, sem que nada tivesse vazado.
 *
 * O que estes campos têm em comum é que NENHUM deles é escrito por uma rota
 * deste arquivo: são o carimbo do pino. Um segredo que realmente vazasse
 * estaria num campo nosso (ou no texto da mensagem), e esses continuam inteiros
 * aqui.
 */
function logSemCarimboDoRegistrador(): string {
  return tudo().replace(
    /"(?:time|responseTime|pid|remotePort|statusCode|level)":\s*[\d.]+/g,
    "",
  ).replace(/"reqId":\s*"[^"]*"/g, "");
}

/** As linhas que falam de recusa, e só elas. */
function recusas(): string[] {
  return log.filter((l) => l.includes("entrada recusada"));
}

/**
 * A ÚLTIMA recusa, e não a primeira.
 *
 * O coletor é do arquivo inteiro e cada caso o zera antes de agir, mas uma
 * linha atrasada do caso anterior ainda pode cair na lista do seguinte. Ler a
 * última é ler a que este caso acabou de provocar, e isso não enfraquece nada:
 * quem cobra a CONTAGEM de linhas é o primeiro caso, que roda uma recusa só.
 */
function ultimaRecusa(): string {
  return recusas()[recusas().length - 1] ?? "";
}

describe("Toda tentativa recusada deixa rastro suficiente para diagnosticar", () => {
  it("senha errada escreve uma linha, com o email tentado e um motivo", async () => {
    log = [];
    const r = await app.inject({
      method: "POST", url: "/entrar", payload: { email: EMAIL, senha: "chute" },
    });
    expect(r.statusCode).toBe(401);

    expect(
      recusas().length,
      "credencial recusada nao escreveu NADA no log: quem opera nao tem como saber por "
      + "que ninguem entra",
    ).toBe(1);
    expect(ultimaRecusa(), "a linha da recusa nao diz de quem foi a tentativa").toContain(EMAIL);
    expect(ultimaRecusa(), "a linha da recusa nao diz o que aconteceu").toContain("motivo");
  }, 120_000);

  it("email desconhecido tambem escreve, e com o MESMO motivo generico da senha errada", async () => {
    /*
      O motivo é genérico aqui pela mesma razão da resposta HTTP: distinguir
      "não existe" de "senha errada" não ajuda a operar e ajuda a enumerar quem
      trabalha no fornecedor. O que o log acrescenta sobre a tela é o email
      tentado e a hora, que é o que serve para diagnosticar.
    */
    log = [];
    await app.inject({
      method: "POST", url: "/entrar",
      payload: { email: "ninguem@fornecedor.com.br", senha: SENHA },
    });
    const linha = ultimaRecusa();
    expect(linha, "email desconhecido nao deixou rastro")
      .toContain("ninguem@fornecedor.com.br");
    expect(linha).toContain("email_ou_senha");

    log = [];
    await app.inject({
      method: "POST", url: "/entrar", payload: { email: EMAIL, senha: "chute" },
    });
    expect(
      ultimaRecusa(),
      "o motivo no log distingue email desconhecido de senha errada, e vira lista de quem "
      + "trabalha aqui para quem ler o log",
    ).toContain("email_ou_senha");
  }, 120_000);

  it("nem a senha nem o corpo do pedido entram na linha da recusa", async () => {
    log = [];
    await app.inject({
      method: "POST", url: "/entrar",
      payload: { email: EMAIL, senha: "senha-secreta-que-nao-pode-vazar" },
    });
    expect(
      tudo(),
      "a senha tentada foi parar no log, e log fica guardado pelo tempo de retencao inteiro",
    ).not.toContain("senha-secreta-que-nao-pode-vazar");
  }, 120_000);

  it("desafio expirado ou forjado escreve, e sem email inventado por quem chamou", async () => {
    log = [];
    const r = await app.inject({
      method: "POST", url: "/entrar/codigo",
      payload: { desafio: "isto-nao-e-um-desafio", codigo: "123456" },
    });
    expect(r.statusCode).toBe(401);

    const linha = ultimaRecusa();
    expect(linha, "desafio invalido nao deixou rastro").toContain("desafio_expirado");
    /*
      Sem email na linha, e não é descuido: o desafio não abriu, então não há
      email VERIFICADO para escrever. Um log que registra afirmação de quem
      chamou como se fosse fato é pior que um log sem o campo.
    */
    expect(linha, "o desafio quebrado nao carrega o texto que quem chamou mandou")
      .not.toContain("isto-nao-e-um-desafio");
  }, 120_000);

  it("codigo errado escreve uma linha, e o codigo NAO entra nela", async () => {
    log = [];
    const primeira = await app.inject({
      method: "POST", url: "/entrar", payload: { email: EMAIL, senha: SENHA },
    });
    expect(primeira.statusCode).toBe(200);

    const r = await app.inject({
      method: "POST", url: "/entrar/codigo",
      payload: { desafio: primeira.json().desafio, codigo: "000001" },
    });
    expect(r.statusCode).toBe(401);

    const linha = ultimaRecusa();
    expect(linha, "codigo recusado nao deixou rastro").toContain("codigo_incorreto");
    expect(linha, "a linha nao diz de quem era a conta").toContain(EMAIL);
    expect(
      logSemCarimboDoRegistrador(), "o codigo de seis digitos foi parar no log",
    ).not.toContain("000001");
    expect(tudo(), "o desafio foi parar no log").not.toContain(primeira.json().desafio);
  }, 120_000);

  it("a conta de castigo tem motivo proprio, e nao se confunde com codigo errado", async () => {
    /*
      São duas coisas diferentes para quem opera: "errou o código" se resolve
      digitando de novo, "conta de castigo" se resolve esperando quinze minutos.
      Com o mesmo motivo nos dois, o operador que já está bloqueado continua
      tentando e continua recebendo o mesmo silêncio.
    */
    const proprio = await construirConsole({
      config: await configDeTeste(),
      leitura: LEITURA_VAZIA,
      escrita: ESCRITA_QUE_ACUSA,
      limitePorEndereco: 500,
      destinoDeLog: { write: (linha: string) => { log.push(linha); } },
    });
    try {
      log = [];
      const primeira = await proprio.inject({
        method: "POST", url: "/entrar", payload: { email: EMAIL, senha: SENHA },
      });
      const desafio = primeira.json().desafio;

      let bloqueou = false;
      for (let i = 0; i < 12 && !bloqueou; i++) {
        const r = await proprio.inject({
          method: "POST", url: "/entrar/codigo", payload: { desafio, codigo: "000002" },
        });
        bloqueou = r.statusCode === 429;
      }
      expect(bloqueou, "a conta nunca entrou de castigo").toBe(true);
      expect(tudo()).toContain("conta_de_castigo");
    } finally {
      await proprio.close();
    }
  }, 120_000);
});

describe("Nada que sirva para entrar cai no log", () => {
  it("uma entrada inteira, bem-sucedida, nao deixa segredo nenhum escrito", async () => {
    log = [];
    const primeira = await app.inject({
      method: "POST", url: "/entrar", payload: { email: EMAIL, senha: SENHA },
    });
    const desafio = primeira.json().desafio;

    const codigo = codigoTotp(base32Decodificar(SEGREDO_TOTP)!, passoDe(new Date()));
    const segunda = await app.inject({
      method: "POST", url: "/entrar/codigo", payload: { desafio, codigo },
    });
    expect(segunda.statusCode, `nao consegui entrar: ${segunda.body}`).toBe(200);
    const token = segunda.json().token;

    expect(
      log.length,
      "o coletor de log nao recebeu nada: a busca por segredo abaixo nao prova nada",
    ).toBeGreaterThan(0);

    for (const [nome, segredo] of [
      ["a senha", SENHA],
      ["o codigo do segundo fator", codigo],
      ["o desafio", desafio],
      ["o token de sessao", token],
      ["o segredo do segundo fator", SEGREDO_TOTP],
    ] as const) {
      expect(
        logSemCarimboDoRegistrador(), `${nome} foi parar no log do console`,
      ).not.toContain(segredo);
    }

    // E a entrada BEM-sucedida continua registrada, que é o outro lado da moeda.
    expect(tudo(), "entrar no console deixou de deixar rastro")
      .toContain("operador entrou no console");
    expect(tudo()).toContain(EMAIL);
  }, 120_000);
});

describe("A partida diz quantos operadores foram carregados", () => {
  it("a linha da partida sai FORA de producao, no terminal de quem subiu o processo", async () => {
    /*
      A linha já existia e só aparecia em produção, o que é o contrário do útil:
      quem precisa saber se a configuração de operadores foi lida é justamente
      quem acabou de subir o console na própria máquina e está tentando entrar.
      Zero operadores é a explicação inteira para "a senha não funciona", e essa
      conta nunca chegava a quem estava olhando o terminal.

      Este caso NÃO usa o coletor de log de propósito: o coletor força o destino,
      e o defeito estava no NÍVEL. Ele escuta a saída padrão de verdade, que é
      onde a linha precisa aparecer.
    */
    const escrito: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((pedaco: string | Uint8Array, ...resto: unknown[]) => {
      escrito.push(typeof pedaco === "string" ? pedaco : Buffer.from(pedaco).toString());
      return (original as (...a: unknown[]) => boolean)(pedaco, ...resto);
    }) as typeof process.stdout.write;

    let proprio: FastifyInstance | undefined;
    try {
      proprio = await construirConsole({
        config: await configDeTeste("development"),
        leitura: LEITURA_VAZIA,
        escrita: ESCRITA_QUE_ACUSA,
      });
    } finally {
      process.stdout.write = original;
      await proprio?.close();
    }

    const saida = escrito.join("");
    expect(
      saida,
      "fora de producao o console sobe sem dizer quantos operadores leu: quem esta "
      + "tentando entrar na propria maquina nao tem essa conta em lugar nenhum",
    ).toContain("console do fornecedor pronto");
    expect(saida, "a linha da partida nao traz a contagem").toContain("1 operador");
  }, 120_000);
});
