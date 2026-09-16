import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DONO, codigoNovo, subirConsoleDeTeste, type ConsoleDeTeste,
} from "./apoio/console-de-teste.js";

/**
 * O dono sem códigos de recuperação, e quem avisa.
 *
 * O ACHADO (revisão de 15/09/2026): o dono semeado de `CONSOLE_OPERADORES`
 * nasce sem código de recuperação, ninguém acima dele redefine a senha, e o
 * único aviso era uma frase no passo 5 de `docs/IMPLANTACAO.md`. Roteiro se
 * pula. No dia em que a senha se fosse junto com o telefone, a saída seria a
 * credencial de dono do banco (seção 6.4 do mesmo documento).
 *
 * Duas bocas passam a avisar, enquanto for verdade:
 *
 *   1. a PARTIDA, em `warn`, nomeando o operador e mandando gerar em Minha
 *      senha, sem segredo nenhum na linha;
 *   2. a ENTRADA, que devolve quantos códigos a conta tem, para a tela mostrar
 *      o aviso na primeira coisa que o dono vê (o caso da tela está em
 *      `a-tela-responde.test.ts`).
 *
 * E as duas se calam depois que o lote é gerado, o que é a parte que separa
 * aviso de ruído: um aviso que fica depois de resolvido ensina a ignorar.
 */

let c: ConsoleDeTeste;

beforeAll(async () => {
  c = await subirConsoleDeTeste();
}, 180_000);

afterAll(async () => {
  await c?.encerrar();
});

function linhasDeAviso(log: string[]): string[] {
  return log.filter((l) => l.includes("não tem códigos de recuperação"));
}

describe("A partida avisa que o dono nao tem codigos, sem segredo na linha", () => {
  it("o warn nomeia o dono, manda gerar em Minha senha, e sai no nivel warn", () => {
    const avisos = linhasDeAviso(c.log);
    expect(avisos, "a partida não avisou").toHaveLength(1);
    const linha = JSON.parse(avisos[0]!) as { level: number; operador: string; papel: string; msg: string };
    /* 40 é `warn` no pino: `info` (30) se perde no meio das linhas normais. */
    expect(linha.level).toBe(40);
    expect(linha.operador).toBe(DONO.email);
    expect(linha.papel).toBe("dono");
    expect(linha.msg).toContain(`operador ${DONO.email} é dono e não tem códigos de recuperação`);
    expect(linha.msg).toContain("Minha senha");
  });

  it("nenhuma linha do log carrega hash de senha, envelope do segundo fator ou o segredo do TOTP", () => {
    const tudo = c.log.join("\n");
    expect(tudo).not.toContain("scrypt$");
    expect(tudo).not.toContain(c.segredoDoDono);
    expect(tudo).not.toContain(DONO.senha);
  });
});

describe("A entrada diz quantos codigos a conta tem", () => {
  it("o dono recem-semeado entra com zero, e a resposta traz o numero", async () => {
    const primeira = await c.app.inject({
      method: "POST", url: "/entrar", payload: { email: DONO.email, senha: DONO.senha },
    });
    expect(primeira.statusCode, primeira.body).toBe(200);
    const segunda = await c.app.inject({
      method: "POST", url: "/entrar/codigo",
      payload: { desafio: primeira.json().desafio, codigo: codigoNovo(c.relogio, c.segredoDoDono) },
    });
    expect(segunda.statusCode, segunda.body).toBe(200);
    expect(segunda.json().codigosDeRecuperacao).toBe(0);
    /* E só o número: os códigos não existem em texto claro em lugar nenhum. */
    expect(Object.keys(segunda.json()).sort()).toEqual(["codigosDeRecuperacao", "operador", "papel", "token"]);
  }, 60_000);
});

describe("Depois de gerar o lote, as duas bocas se calam", () => {
  it("a entrada devolve oito, e um segundo processo sobre o mesmo banco sobe sem o warn", async () => {
    const token = await c.entrar(DONO.email, DONO.senha, c.segredoDoDono);
    const gerado = await c.app.inject({
      method: "POST", url: "/codigos-de-recuperacao",
      headers: { authorization: `Bearer ${token}` },
      payload: { senha: DONO.senha, codigo: codigoNovo(c.relogio, c.segredoDoDono) },
    });
    expect(gerado.statusCode, gerado.body).toBe(200);
    expect(gerado.json().restantes).toBe(8);

    const primeira = await c.app.inject({
      method: "POST", url: "/entrar", payload: { email: DONO.email, senha: DONO.senha },
    });
    const segunda = await c.app.inject({
      method: "POST", url: "/entrar/codigo",
      payload: { desafio: primeira.json().desafio, codigo: codigoNovo(c.relogio, c.segredoDoDono) },
    });
    expect(segunda.statusCode, segunda.body).toBe(200);
    expect(segunda.json().codigosDeRecuperacao).toBe(8);

    /* O mesmo banco, outro processo: é o deploy seguinte. */
    const segundo = await subirConsoleDeTeste({
      mem: c.mem, chave: c.chave, segredoDoDono: c.segredoDoDono, relogio: c.relogio,
    });
    try {
      expect(linhasDeAviso(segundo.log), "o warn continuou depois de os códigos existirem").toEqual([]);
      expect(segundo.log.join("\n")).toContain("console do fornecedor pronto");
    } finally {
      await segundo.encerrar();
    }
  }, 120_000);
});
