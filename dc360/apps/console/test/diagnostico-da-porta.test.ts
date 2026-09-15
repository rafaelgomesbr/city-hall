import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { construirConsole } from "../src/servidor.js";
import {
  DONO, cadastrarPrefeitura, codigoNovo, subirConsoleDeTeste, type ConsoleDeTeste,
} from "./apoio/console-de-teste.js";

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
 * O caso que cobra isso roda uma entrada bem-sucedida inteira, cria um
 * operador, troca a senha, agenda uma eliminação, gera códigos de recuperação
 * e recupera a conta com um deles, e procura cada um desses valores no que o
 * processo escreveu. As rotas novas entram na mesma busca: uma senha inicial
 * de operador, um código de eliminação ou um código de recuperação no log
 * seriam o mesmo defeito, num lugar novo.
 */

const EMAIL = DONO.email;
const SENHA = DONO.senha;

let c: ConsoleDeTeste;
let app: FastifyInstance;

/** O que o processo escreveu. Um caso pode zerar antes de agir. */
let log: string[] = [];

beforeAll(async () => {
  c = await subirConsoleDeTeste();
  app = c.app;
  log = c.log;
}, 180_000);

afterAll(async () => {
  await c?.encerrar();
});

/** Zera o coletor sem trocar o array que o console escreve. */
function zerar(): void {
  log.length = 0;
}

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
    zerar();
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
    zerar();
    await app.inject({
      method: "POST", url: "/entrar",
      payload: { email: "ninguem@fornecedor.com.br", senha: SENHA },
    });
    const linha = ultimaRecusa();
    expect(linha, "email desconhecido nao deixou rastro")
      .toContain("ninguem@fornecedor.com.br");
    expect(linha).toContain("email_ou_senha");

    zerar();
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
    zerar();
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
    zerar();
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
    zerar();
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
    // Console proprio sobre banco proprio: o castigo vai para a linha do dono,
    // e derrubaria os casos seguintes deste arquivo.
    const proprio = await subirConsoleDeTeste();
    try {
      const primeira = await proprio.app.inject({
        method: "POST", url: "/entrar", payload: { email: EMAIL, senha: SENHA },
      });
      const desafio = primeira.json().desafio;

      let bloqueou = false;
      for (let i = 0; i < 12 && !bloqueou; i++) {
        const r = await proprio.app.inject({
          method: "POST", url: "/entrar/codigo", payload: { desafio, codigo: "000002" },
        });
        bloqueou = r.statusCode === 429;
      }
      expect(bloqueou, "a conta nunca entrou de castigo").toBe(true);
      expect(proprio.log.join("\n")).toContain("conta_de_castigo");
    } finally {
      await proprio.encerrar();
    }
  }, 180_000);
});

describe("Nada que sirva para entrar cai no log", () => {
  it("uma entrada inteira, com as rotas novas depois dela, nao deixa segredo nenhum escrito", async () => {
    zerar();
    const primeira = await app.inject({
      method: "POST", url: "/entrar", payload: { email: EMAIL, senha: SENHA },
    });
    const desafio = primeira.json().desafio;

    const codigo = codigoNovo(c.relogio, c.segredoDoDono);
    const segunda = await app.inject({
      method: "POST", url: "/entrar/codigo", payload: { desafio, codigo },
    });
    expect(segunda.statusCode, `nao consegui entrar: ${segunda.body}`).toBe(200);
    const token = segunda.json().token;
    const comSessao = { authorization: `Bearer ${token}` };

    /*
      AS ROTAS NOVAS, na mesma varredura. Cada uma recebe ou devolve um segredo
      que nao pode cair no log: a senha inicial e o segredo do operador criado,
      a senha e o codigo apresentados para eliminar, a senha nova da troca.
    */
    const criado = await app.inject({
      method: "POST", url: "/operadores", headers: comSessao,
      payload: { email: "novo@fornecedor.com.br" },
    });
    expect(criado.statusCode, criado.body).toBe(201);

    const prefeitura = await cadastrarPrefeitura(app, token, "Morro Claro");
    const codigoDaEliminacao = codigoNovo(c.relogio, c.segredoDoDono);
    const eliminar = await app.inject({
      method: "POST", url: `/municipios/${prefeitura.organizacaoId}/eliminar`, headers: comSessao,
      payload: { senha: SENHA, codigo: codigoDaEliminacao, nome: "Morro Claro", motivo: "log" },
    });
    expect(eliminar.statusCode, eliminar.body).toBe(200);

    const NOVA = "senha-nova-da-dona-para-o-teste-do-log";
    const codigoDaTroca = codigoNovo(c.relogio, c.segredoDoDono);
    const troca = await app.inject({
      method: "POST", url: "/senha", headers: comSessao,
      payload: { senhaAtual: SENHA, codigo: codigoDaTroca, novaSenha: NOVA },
    });
    expect(troca.statusCode, troca.body).toBe(200);
    const comSessaoNova = { authorization: `Bearer ${troca.json().token}` };

    /*
      A RECUPERACAO, nas duas pontas: os oito codigos que a geracao mostra uma
      vez, e depois a senha nova e o segredo novo do segundo fator que a
      recuperacao devolve uma vez. Nenhum dos tres pode cair no log, e o
      codigo apresentado para recuperar tambem nao.
    */
    const codigoDaGeracao = codigoNovo(c.relogio, c.segredoDoDono);
    const gerados = await app.inject({
      method: "POST", url: "/codigos-de-recuperacao", headers: comSessaoNova,
      payload: { senha: NOVA, codigo: codigoDaGeracao },
    });
    expect(gerados.statusCode, gerados.body).toBe(200);
    const codigosDeRecuperacao: string[] = gerados.json().codigos;
    expect(codigosDeRecuperacao).toHaveLength(8);

    const RECUPERADA = "senha-recuperada-da-dona-para-o-teste-do-log";
    const recuperado = await app.inject({
      method: "POST", url: "/recuperar",
      payload: { email: EMAIL, codigo: codigosDeRecuperacao[2], novaSenha: RECUPERADA },
    });
    expect(recuperado.statusCode, recuperado.body).toBe(200);

    expect(
      log.length,
      "o coletor de log nao recebeu nada: a busca por segredo abaixo nao prova nada",
    ).toBeGreaterThan(0);

    for (const [nome, segredo] of [
      ["a senha", SENHA],
      ["o codigo do segundo fator", codigo],
      ["o desafio", desafio],
      ["o token de sessao", token],
      ["o segredo do segundo fator", c.segredoDoDono],
      ["a senha inicial do operador criado", criado.json().senhaInicial],
      ["o segredo do operador criado", criado.json().segredo],
      ["a senha inicial da prefeitura", prefeitura.senhaInicial],
      ["o codigo apresentado para eliminar", codigoDaEliminacao],
      ["o codigo apresentado na troca de senha", codigoDaTroca],
      ["a senha nova", NOVA],
      ["o token novo da troca", troca.json().token],
      ["o codigo apresentado para gerar codigos de recuperacao", codigoDaGeracao],
      ...codigosDeRecuperacao.map((codigo, i) => [`o codigo de recuperacao ${i + 1}`, codigo] as const),
      ...codigosDeRecuperacao.map((codigo, i) =>
        [`o codigo de recuperacao ${i + 1}, sem o hifen`, codigo.replace(/-/g, "")] as const),
      ...(criado.json().codigos as string[]).map((codigo, i) =>
        [`o codigo de recuperacao ${i + 1} do operador criado`, codigo] as const),
      ["a senha nova da recuperacao", RECUPERADA],
      ["o segredo novo do segundo fator, da recuperacao", recuperado.json().segredo],
    ] as const) {
      expect(
        logSemCarimboDoRegistrador(), `${nome} foi parar no log do console`,
      ).not.toContain(segredo);
    }
    expect(logSemCarimboDoRegistrador(), "um hash de senha foi parar no log").not.toContain("scrypt$");

    // E cada ato continua registrado, que é o outro lado da moeda.
    expect(tudo(), "entrar no console deixou de deixar rastro")
      .toContain("operador entrou no console");
    expect(tudo()).toContain(EMAIL);
    expect(tudo()).toContain("criar_operador");
    expect(tudo()).toContain("agendar_eliminacao");
    expect(tudo()).toContain("senha trocada");
    expect(tudo()).toContain("gerar_codigos_de_recuperacao");
    expect(tudo(), "a recuperacao bem-sucedida nao deixou rastro").toContain("redefinid");
  }, 240_000);
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
      // Sobre o banco que ja tem o dono: a partida conta o que ha na tabela.
      proprio = await construirConsole({
        config: { ...c.config, NODE_ENV: "development" },
        leitura: c.mem.banco,
        escrita: c.mem.banco,
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
    expect(saida, "a linha da partida nao traz a contagem").toMatch(/com \d+ operador\(es\) no banco/);
  }, 120_000);
});
