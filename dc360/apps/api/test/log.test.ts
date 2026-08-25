import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { construirServidor } from "../src/servidor.js";
import { carregarConfig } from "../src/config.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * O log não pode carregar dado pessoal.
 *
 * Este arquivo existe porque o servidor subia com `logger: false` sempre que
 * `NODE_ENV === "test"`, e a consequência é que a lista de `redact`, que é a
 * defesa do produto contra a regra 15 da constituição, nunca era exercitada
 * por teste nenhum. Uma lista de proteção que ninguém roda é uma lista que
 * mente sobre estar completa, e ela estava incompleta: cobria a senha da
 * entrada e esquecia a troca de senha de quem já está dentro, o link de uso
 * único da redefinição e a barra de endereço.
 *
 * Pior que os campos esquecidos era o erro cru do `pg`: o `detail` de uma
 * violação de restrição carrega o VALOR que a violou. Um email de servidor
 * municipal, um contato de morador.
 */

let app: FastifyInstance;
let mem: BancoEmMemoria;
let linhas: string[] = [];

const coletor = { write: (linha: string) => { linhas.push(linha); } };
const tudo = () => linhas.join("\n");

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  app = await construirServidor({
    banco: mem.banco,
    config: carregarConfig({
      NODE_ENV: "test",
      JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
    }),
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
    destinoDeLog: coletor,
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await mem?.banco.encerrar();
});

/*
  Honestidade sobre o alcance destes casos, medida por mutação.

  Os que DISCRIMINAM, ou seja, reprovam quando a correção é desfeita: o do
  endereço na barra de endereço e o do `detail` do erro do `pg`.

  Os de corpo de requisição (senha, senha atual, nova senha, token de
  redefinição) passam mesmo com a entrada removida de `redact`, porque o
  serializador padrão do Fastify não registra corpo nenhum. Eles não estão
  aqui por engano: são defesa em profundidade para o dia em que alguém logar
  `req.body` num ponto de diagnóstico, que é justamente o momento em que
  ninguém vai lembrar de conferir a lista. Mas eles NÃO provam nada hoje, e
  dizer o contrário seria a mesma contabilidade que o conselho veio corrigir.
*/
describe("O que nunca pode aparecer no log", () => {
  it("a senha de quem entra", async () => {
    linhas = [];
    const senha = "Senha-Muito-Peculiar-8812";
    await app.inject({
      method: "POST", url: "/auth/entrar",
      payload: { email: "ninguem@exemplo.gov.br", senha },
    });
    expect(tudo()).not.toContain(senha);
  });

  it("a senha atual na troca de quem já está dentro", async () => {
    linhas = [];
    const atual = "Senha-Atual-Peculiar-4471";
    await app.inject({
      method: "POST", url: "/auth/trocar-senha",
      headers: { authorization: "Bearer token-invalido-de-proposito" },
      payload: { senhaAtual: atual, novaSenha: "Nova-Senha-Peculiar-9930" },
    });
    expect(tudo()).not.toContain(atual);
    expect(tudo()).not.toContain("Nova-Senha-Peculiar-9930");
  });

  it("o link de uso único da redefinição", async () => {
    linhas = [];
    const token = "token-de-redefinicao-muito-peculiar-7742";
    await app.inject({
      method: "POST", url: "/auth/redefinir",
      payload: { token, novaSenha: "Outra-Senha-Peculiar-1188" },
    });
    expect(tudo()).not.toContain(token);
  });

  it("o cabeçalho de autorização", async () => {
    linhas = [];
    const acesso = "jwt-falso-porem-peculiar-5503";
    await app.inject({
      method: "GET", url: "/ocorrencias",
      headers: { authorization: `Bearer ${acesso}` },
    });
    expect(tudo()).not.toContain(acesso);
  });

  it("o endereço da casa, que viaja na barra de endereço", async () => {
    linhas = [];
    // A consulta de duplicidade leva o endereço do imóvel na query string, que
    // é a parte do pedido que mais vaza sozinha: proxy, histórico, referer.
    const endereco = "RuaPeculiarDoBarranco4417";
    const r = await app.inject({
      method: "GET",
      url: `/ocorrencias/duplicidades/consulta?endereco=${endereco}`,
      headers: { authorization: "Bearer token-invalido-de-proposito" },
    });
    // A rota precisa EXISTIR, senão o teste passa provando nada. Um 404 sai
    // pelo mesmo caminho de log e a asserção ficaria verde para sempre.
    expect(r.statusCode).not.toBe(404);
    // Sem espaço no valor de propósito: percent-encoding transformaria
    // "do Barranco" em "do%20Barranco" e a busca literal nunca casaria,
    // que foi exatamente como esta asserção passou vazia da primeira vez.
    expect(tudo()).not.toContain(endereco);
    // E o caminho continua no log, senão não dá para diagnosticar nada.
    expect(tudo()).toContain("/ocorrencias/duplicidades/consulta");
  });

  it("o valor que violou a restrição, que o erro do pg carrega em `detail`", async () => {
    linhas = [];
    const email = "servidora.peculiar.9931@exemplo.gov.br";

    // Provoca a violação por baixo da API, no mesmo formato em que ela
    // chegaria numa rota: o índice de email é único. A primeira inserção
    // passa; é a segunda que produz o 23505 com o email dentro de `detail`.
    const inserir = (matricula: string) => mem.bruto.query(
      "INSERT INTO usuarios (organizacao_id, nome, email, matricula, papel, senha_hash) "
      + "SELECT organizacao_id, 'Fulana', $1, $2, 'operador', 'x' FROM usuarios LIMIT 1",
      [email, matricula],
    );
    await inserir("M-9931");
    const erro = await inserir("M-9932").then(() => null).catch((e: unknown) => e);
    expect(erro).toBeTruthy();
    // Prova de que o dado sensível ESTÁ no erro cru: sem isso o teste passaria
    // por acidente, provando apenas que o email nunca chegou perto do log.
    expect(JSON.stringify(
      Object.getOwnPropertyNames(erro as object)
        .reduce<Record<string, unknown>>(
          (a, k) => ({ ...a, [k]: (erro as Record<string, unknown>)[k] }), {}),
    )).toContain("peculiar.9931");

    // Sem o serializador, isto seria logado inteiro, com o email dentro.
    app.log.error({ err: erro }, "violacao de restricao");

    expect(tudo()).not.toContain("peculiar.9931");
    // E o que interessa para diagnosticar continua lá.
    expect(tudo()).toContain("violacao de restricao");
  });
});
