import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { construirConsole } from "../src/servidor.js";
import { abrirCofre, contextoDoOperador, registroNoBanco } from "../src/operadores.js";
import { consoleEmMemoria, type ConsoleEmMemoria } from "../src/banco-em-memoria.js";
import { gerarSegredoTotp } from "../../api/src/auth/totp.js";
import {
  DONO, JWT_SEGREDO_DE_TESTE, codigoNovo, hashDoDono, subirConsoleDeTeste,
  type ConsoleDeTeste,
} from "./apoio/console-de-teste.js";

/**
 * Os operadores do console saem da variável de ambiente e vão para o banco.
 *
 * Até aqui eles viviam em `CONSOLE_OPERADORES`, porque o papel do console não
 * escrevia em tabela nenhuma. Com a migração 038 existe `console_operadores`,
 * e com ela três coisas que moravam na memória do processo passam a morar
 * numa linha da tabela: as tentativas falhadas do segundo fator, o castigo de
 * quinze minutos e o passo do TOTP já queimado. Reiniciar o processo deixa de
 * esquecer os três, e o console deixa de precisar rodar numa máquina só.
 *
 * `CONSOLE_OPERADORES` vira a SEMENTE do dono: na partida, se a tabela estiver
 * vazia e a variável existir, o console importa a linha como `papel = 'dono'`,
 * uma vez. Depois disso a variável é ignorada, com aviso no log.
 *
 * A GRAVAÇÃO DA SEMENTE É PELO PAPEL DO CONSOLE, sem credencial de dono do
 * banco: a policy de INSERT de `console_operadores` (038) tem um ramo para
 * `papel = 'dono'` que só vale enquanto a tabela está vazia, e fecha na
 * primeira linha. É isso que faz a produção de hoje (um operador na variável)
 * virar o dono no primeiro deploy, sem ninguém rodar comando. O banco aqui é o
 * Postgres em WebAssembly com as migrações reais, a 038 inclusive.
 */

let console1: ConsoleDeTeste;

beforeAll(async () => {
  console1 = await subirConsoleDeTeste();
}, 180_000);

afterAll(async () => {
  await console1?.encerrar();
});

async function linhaDoDono(mem: ConsoleEmMemoria) {
  const r = await mem.bruto.query<{
    id: string; email: string; papel: string; ativo: boolean;
    falhas_login: number; bloqueado_ate: string | null; ultimo_passo_totp: string | null;
    criado_por: string | null;
  }>(
    `SELECT id, email, papel, ativo, falhas_login, bloqueado_ate,
            ultimo_passo_totp::text, criado_por
       FROM console_operadores WHERE papel = 'dono'`,
  );
  return r.rows[0] ?? null;
}

describe("A semente do dono, na partida", () => {
  it("com a tabela vazia e a variavel definida, a partida importa a linha como dono, pelo papel do console", async () => {
    const dono = await linhaDoDono(console1.mem);
    expect(dono, "a partida nao semeou o dono a partir de CONSOLE_OPERADORES").not.toBeNull();
    expect(dono!.email).toBe(DONO.email);
    expect(dono!.papel).toBe("dono");
    expect(dono!.ativo).toBe(true);
    expect(dono!.criado_por, "o dono semeado nao tem quem o criou").toBeNull();

    // E o log diz que semeou: quem sobe o console pela primeira vez precisa
    // saber que a variavel foi consumida e pode sair da configuracao.
    expect(console1.log.join("\n")).toContain("semeado");
  });

  it("o ramo da semente fecha na primeira linha: um segundo dono pelo papel do console e recusado", async () => {
    /*
      A prova de que a semente nao e uma porta aberta: com a tabela povoada, o
      mesmo INSERT que a partida fez volta como 42501. Quem tiver a conexao do
      console depois do primeiro deploy nao cria um dono novo por ela.
    */
    const cofre = abrirCofre(console1.chave);
    // O MESMO caminho que a partida usa para semear, e nao um INSERT escrito aqui.
    const registro = registroNoBanco(console1.mem.banco, console1.mem.banco);
    let codigo = "";
    try {
      await registro.semearDono({
        email: "segunda@fornecedor.com.br",
        senhaHash: await hashDoDono(),
        segundoFator: cofre.cifrar(gerarSegredoTotp(), contextoDoOperador("segunda@fornecedor.com.br")),
      });
    } catch (erro) {
      codigo = String((erro as { code?: string }).code ?? "");
    }
    expect(codigo, "o papel do console gravou um segundo dono").toBe("42501");
  }, 60_000);

  it("a semente e usada UMA vez: um segundo processo sobre o mesmo banco ignora a variavel e avisa", async () => {
    /*
      O caso de producao: a variavel continua definida no provedor depois do
      primeiro deploy com a 038. O segundo processo nao pode semear de novo
      (a tabela ja tem dono), nao pode falhar (o console cairia por causa de
      uma variavel que sobrou), e nao pode ficar calado (senao ninguem lembra
      de tira-la de la).
    */
    const segundo = await subirConsoleDeTeste({
      mem: console1.mem, chave: console1.chave, segredoDoDono: console1.segredoDoDono,
    });
    try {
      const quantos = await console1.mem.bruto.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM console_operadores",
      );
      expect(Number(quantos.rows[0]!.n), "a segunda partida semeou um segundo dono").toBe(1);

      const aviso = segundo.log.find((l) => l.includes("CONSOLE_OPERADORES") && l.includes("ignorada"));
      expect(
        aviso,
        "a variavel continuou definida com a tabela ja povoada e ninguem avisou",
      ).toBeDefined();
      expect(JSON.parse(aviso!).level, "o aviso nao saiu em warn").toBe(40);
    } finally {
      await segundo.encerrar();
    }
  });

  it("com a tabela vazia e SEM a variavel, o console nao sobe, e diz o que fazer", async () => {
    /*
      Um console sem operador nenhum sobe, responde e nao deixa ninguem entrar.
      Falhar alto na partida e melhor que parecer pronto.
    */
    const mem = await consoleEmMemoria();
    try {
      let mensagem = "";
      try {
        await subirConsoleDeTeste({ mem, semSemente: true });
      } catch (erro) {
        mensagem = erro instanceof Error ? erro.message : String(erro);
      }
      expect(mensagem, "o console subiu sem dono nenhum").toContain("CONSOLE_OPERADORES");
      expect(mensagem).toContain("dono");
    } finally {
      await mem.banco.encerrar();
    }
  }, 120_000);

  it("a semente com mais de um operador e recusada: so o dono nasce por ela", async () => {
    const mem = await consoleEmMemoria();
    try {
      const chave = randomBytes(32).toString("base64");
      const cofre = abrirCofre(chave);
      const hash = await hashDoDono();
      const dois = JSON.stringify([
        { email: "a@fornecedor.com.br", senha: hash,
          segundoFator: cofre.cifrar(gerarSegredoTotp(), contextoDoOperador("a@fornecedor.com.br")) },
        { email: "b@fornecedor.com.br", senha: hash,
          segundoFator: cofre.cifrar(gerarSegredoTotp(), contextoDoOperador("b@fornecedor.com.br")) },
      ]);
      let mensagem = "";
      try {
        await subirConsoleDeTeste({ mem, chave, sementeCrua: dois });
      } catch (erro) {
        mensagem = erro instanceof Error ? erro.message : String(erro);
      }
      expect(mensagem, "a semente com dois operadores passou").toMatch(/dono/i);
      const quantos = await mem.bruto.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM console_operadores",
      );
      expect(Number(quantos.rows[0]!.n), "a semente recusada deixou linha para tras").toBe(0);
    } finally {
      await mem.banco.encerrar();
    }
  }, 120_000);

  it("a semente continua recusando hash estragado pelo shell, antes de tocar no banco", async () => {
    const mem = await consoleEmMemoria();
    try {
      const chave = randomBytes(32).toString("base64");
      const cofre = abrirCofre(chave);
      const comido = JSON.stringify([{
        email: DONO.email,
        senha: "scrypt$$$c2FsZ2FkbzEyMzQ1Ng$aGFzaC1kZS1tZW50aXJpbmhh",
        segundoFator: cofre.cifrar(gerarSegredoTotp(), contextoDoOperador(DONO.email)),
      }]);
      let mensagem = "";
      try {
        await subirConsoleDeTeste({ mem, chave, sementeCrua: comido });
      } catch (erro) {
        mensagem = erro instanceof Error ? erro.message : String(erro);
      }
      expect(mensagem).toContain("aspas");
      const quantos = await mem.bruto.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM console_operadores",
      );
      expect(Number(quantos.rows[0]!.n)).toBe(0);
    } finally {
      await mem.banco.encerrar();
    }
  }, 120_000);
});

describe("A porta le o banco, e grava no banco o que antes ficava na memoria", () => {
  it("o dono semeado entra com a senha e o segredo da semente", async () => {
    const token = await console1.entrar(DONO.email, DONO.senha, console1.segredoDoDono);
    expect(token).toBeTypeOf("string");
    const numeros = await console1.app.inject({
      method: "GET", url: "/municipios", headers: { authorization: `Bearer ${token}` },
    });
    expect(numeros.statusCode).toBe(200);
  }, 60_000);

  it("a entrada devolve o papel, para a tela saber o que mostrar", async () => {
    const primeira = await console1.app.inject({
      method: "POST", url: "/entrar", payload: { email: DONO.email, senha: DONO.senha },
    });
    const segunda = await console1.app.inject({
      method: "POST", url: "/entrar/codigo",
      payload: {
        desafio: primeira.json().desafio,
        // Um passo adiante no relogio de teste, porque o caso anterior queimou o de agora.
        codigo: codigoNovo(console1.relogio, console1.segredoDoDono),
      },
    });
    expect(segunda.statusCode, segunda.body).toBe(200);
    expect(segunda.json().papel).toBe("dono");
    expect(segunda.json().operador).toBe(DONO.email);
  }, 60_000);

  it("o passo do TOTP queimado fica na linha do operador, e nao na memoria", async () => {
    const dono = await linhaDoDono(console1.mem);
    expect(
      dono!.ultimo_passo_totp,
      "o passo usado nao foi gravado: reiniciar o processo deixaria o mesmo codigo valer de novo",
    ).not.toBeNull();
    expect(Number(dono!.ultimo_passo_totp)).toBeGreaterThan(50_000_000);
  });

  it("um segundo processo sobre o mesmo banco recusa o codigo que o primeiro ja queimou", async () => {
    /*
      A razao de o passo ir para o banco. Com ele na memoria, quem leu o codigo
      por cima do ombro e conseguisse reiniciar o processo (ou cair na outra
      maquina) entraria com o mesmo numero dentro da janela.
    */
    const codigo = codigoNovo(console1.relogio, console1.segredoDoDono);
    const abre = await console1.app.inject({
      method: "POST", url: "/entrar", payload: { email: DONO.email, senha: DONO.senha },
    });
    const usa = await console1.app.inject({
      method: "POST", url: "/entrar/codigo",
      payload: { desafio: abre.json().desafio, codigo },
    });
    expect(usa.statusCode, usa.body).toBe(200);

    // O segundo processo com o MESMO relogio: a diferenca entre os dois e so
    // o processo, que e o que este caso mede.
    const segundo = await subirConsoleDeTeste({
      mem: console1.mem, chave: console1.chave, segredoDoDono: console1.segredoDoDono,
      relogio: console1.relogio,
    });
    try {
      const primeira = await segundo.app.inject({
        method: "POST", url: "/entrar", payload: { email: DONO.email, senha: DONO.senha },
      });
      const reusa = await segundo.app.inject({
        method: "POST", url: "/entrar/codigo",
        payload: { desafio: primeira.json().desafio, codigo },
      });
      expect(
        reusa.statusCode,
        "o codigo queimado num processo entrou pelo outro: o passo nao esta no banco",
      ).toBe(401);
    } finally {
      await segundo.encerrar();
    }
  }, 60_000);

  it("codigos errados contam na tabela, e o quinto poe a conta de castigo tambem na tabela", async () => {
    const mem = await consoleEmMemoria();
    let proprio: ConsoleDeTeste | undefined;
    try {
      proprio = await subirConsoleDeTeste({ mem });
      const desfechos: number[] = [];
      for (let tentativa = 0; tentativa < 6; tentativa++) {
        const abre = await proprio.app.inject({
          method: "POST", url: "/entrar", payload: { email: DONO.email, senha: DONO.senha },
        });
        const r = await proprio.app.inject({
          method: "POST", url: "/entrar/codigo",
          payload: { desafio: abre.json().desafio, codigo: "000000" },
        });
        desfechos.push(r.statusCode);

        if (tentativa === 2) {
          const dono = await linhaDoDono(mem);
          expect(dono!.falhas_login, "as falhas nao estao sendo gravadas na linha").toBe(3);
        }
      }
      expect(desfechos.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
      expect(desfechos[5]).toBe(429);

      const dono = await linhaDoDono(mem);
      expect(dono!.bloqueado_ate, "o castigo nao foi gravado na linha").not.toBeNull();
      expect(new Date(dono!.bloqueado_ate!).getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);

      // E um segundo processo enxerga o castigo, que e o ponto de ele estar no banco.
      const outro = await subirConsoleDeTeste({
        mem, chave: proprio.chave, segredoDoDono: proprio.segredoDoDono, relogio: proprio.relogio,
      });
      try {
        const abre = await outro.app.inject({
          method: "POST", url: "/entrar", payload: { email: DONO.email, senha: DONO.senha },
        });
        const r = await outro.app.inject({
          method: "POST", url: "/entrar/codigo",
          payload: { desafio: abre.json().desafio, codigo: codigoNovo(outro.relogio, proprio.segredoDoDono) },
        });
        expect(r.statusCode, "o castigo gravado por um processo nao valeu no outro").toBe(429);
      } finally {
        await outro.encerrar();
      }
    } finally {
      await proprio?.encerrar();
    }
  }, 180_000);

  it("operador desativado nao entra, e a resposta e a mesma de senha errada", async () => {
    const mem = await consoleEmMemoria();
    let proprio: ConsoleDeTeste | undefined;
    try {
      proprio = await subirConsoleDeTeste({ mem });
      const token = await proprio.entrar(DONO.email, DONO.senha, proprio.segredoDoDono);
      const criado = await proprio.app.inject({
        method: "POST", url: "/operadores",
        headers: { authorization: `Bearer ${token}` },
        payload: { email: "temporario@fornecedor.com.br" },
      });
      expect(criado.statusCode, criado.body).toBe(201);
      const { id, senhaInicial, segredo } = criado.json();

      const entra = await proprio.entrar("temporario@fornecedor.com.br", senhaInicial, segredo);
      expect(entra).toBeTypeOf("string");

      const desativa = await proprio.app.inject({
        method: "POST", url: `/operadores/${id}/desativar`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(desativa.statusCode, desativa.body).toBe(200);

      const recusa = await proprio.app.inject({
        method: "POST", url: "/entrar",
        payload: { email: "temporario@fornecedor.com.br", senha: senhaInicial },
      });
      const inexistente = await proprio.app.inject({
        method: "POST", url: "/entrar",
        payload: { email: "ninguem@fornecedor.com.br", senha: senhaInicial },
      });
      expect(recusa.statusCode).toBe(401);
      expect(recusa.json()).toEqual(inexistente.json());

      // E a sessao que ele ja tinha morre junto: desativar precisa valer agora,
      // e nao daqui a trinta minutos.
      const comSessaoVelha = await proprio.app.inject({
        method: "GET", url: "/municipios", headers: { authorization: `Bearer ${entra}` },
      });
      expect(comSessaoVelha.statusCode, "o operador desativado continuou lendo numeros").toBe(401);
    } finally {
      await proprio?.encerrar();
    }
  }, 180_000);
});

describe("O que continua valendo da partida antiga", () => {
  it("a chave do segundo fator precisa abrir o envelope do dono, senao o console nao sobe", async () => {
    /*
      Antes, o envelope de cada operador era aberto na partida, lendo a
      variavel. Agora o dono vive no banco, e a mesma conferencia precisa ser
      feita contra a LINHA: chave trocada no provedor produz "codigo invalido"
      para sempre, e a pessoa concluiria que perdeu o aparelho.
    */
    const outraChave = randomBytes(32).toString("base64");
    let mensagem = "";
    try {
      await construirConsole({
        config: { ...console1.config, CONSOLE_SEGUNDO_FATOR_CHAVE: outraChave },
        leitura: console1.mem.banco,
        escrita: console1.mem.banco,
        destinoDeLog: { write: () => {} },
      });
    } catch (erro) {
      mensagem = erro instanceof Error ? erro.message : String(erro);
    }
    expect(mensagem, "o console subiu com uma chave que nao abre o segundo fator do dono")
      .toMatch(/não abre|nao abre/i);
    expect(mensagem).toContain(DONO.email);
  }, 60_000);

  it("a linha da partida diz quantos operadores ha no banco", () => {
    expect(console1.log.join("\n")).toContain("console do fornecedor pronto");
    expect(console1.log.join("\n")).toContain("1 operador");
  });

  it("o segredo do token continua sendo o do console, e o teste usa o mesmo", () => {
    expect(console1.config.CONSOLE_JWT_SEGREDO).toBe(JWT_SEGREDO_DE_TESTE);
  });
});
