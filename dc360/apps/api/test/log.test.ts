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
  /*
    Tempo limite explícito, como nos nove arquivos irmãos.

    Este `beforeAll` sobe PGlite, aplica nove migrações e semeia. Isolado leva
    perto de 1,5 s; com a suíte inteira em paralelo, medimos de 4,2 a 6,3 s,
    contra o teto padrão de 10 s do vitest. Num runner de dois núcleos isso
    vira vermelho, e o portão do produto já ficou vermelho numa execução e
    verde na seguinte, no mesmo commit, por causa desta linha faltando.

    Portão que às vezes não roda ensina o time a ignorar vermelho, e o teste
    que ficava intermitente era justamente o que guarda dado pessoal fora do
    log.
  */
}, 180_000);

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

/**
 * O link de redefinição de senha nunca chega ao log.
 *
 * Este era o único caminho do produto em que um segredo VIVO saía em texto
 * puro. `servidor.ts` tinha `notificador = notificadorDeLog()` como padrão,
 * `index.ts` não passava notificador, e `config.ts` não tinha variável
 * nenhuma de notificação: produção caía no log, e o `console.log` do
 * notificador passa por fora do `redact` do Fastify.
 *
 * O que saía era uma credencial de uso único, viva por meia hora, que assume
 * qualquer conta de qualquer município, inclusive a de administrador, junto
 * do email de quem pediu.
 */
describe("O notificador de log", () => {
  it("anuncia que houve notificação, e não o que ela dizia", async () => {
    const { notificadorDeLog, mensagemDeRecuperacao } =
      await import("../src/auth/notificador.js");

    const saiu: string[] = [];
    const token = "token-de-uso-unico-muito-peculiar-8827";
    const link = `https://painel.exemplo.gov.br/redefinir-senha?token=${token}`;

    await notificadorDeLog((linha) => { saiu.push(linha); }).enviar(
      mensagemDeRecuperacao("Helena Vasques Coutinho", "helena@serraalta.exemplo.gov.br", link, 30),
    );

    const tudo = saiu.join("\n");
    // Prova de que o segredo ESTAVA na mensagem: sem isto o caso passaria
    // provando apenas que a mensagem era vazia.
    expect(
      mensagemDeRecuperacao("Helena", "helena@serraalta.exemplo.gov.br", link, 30).corpo,
    ).toContain(token);

    expect(tudo, "o token de redefinição saiu no log").not.toContain(token);
    expect(tudo, "o link de redefinição saiu no log").not.toContain("redefinir-senha");
    // O email inteiro também não: dado pessoal no mesmo lugar de onde o
    // commit anterior tirou endereço e `detail` do pg.
    expect(tudo).not.toContain("helena@serraalta.exemplo.gov.br");
    // E o que serve para diagnosticar continua lá.
    expect(tudo).toContain("[notificacao]");
    expect(tudo).toContain("h***@serraalta.exemplo.gov.br");
  });

  it("produção recusa subir com a recuperação ligada e sem destino", async () => {
    const { carregarConfig } = await import("../src/config.js");
    const base = {
      NODE_ENV: "production",
      DATABASE_URL: "postgres://u:s@localhost:5432/d",
      JWT_SEGREDO: "segredo-de-producao-com-mais-de-trinta-e-dois-bytes",
      ORIGENS_PERMITIDAS: "https://painel.exemplo.gov.br",
      URL_PAINEL: "https://painel.exemplo.gov.br",
      URL_PUBLICA: "https://api.exemplo.gov.br",
      S3_ENDPOINT: "https://s3.exemplo.com",
      S3_BALDE: "dc360",
      S3_CHAVE_ID: "chave",
      S3_CHAVE_SECRETA: "segredo",
    } as unknown as NodeJS.ProcessEnv;

    expect(
      () => carregarConfig(base),
      "produção subiu com a recuperação ligada e sem provedor: o link iria "
      + "para o log e nenhum email sairia",
    ).toThrow(/recuperação de senha está ligada e não tem por onde sair/i);

    // Desligar é decisão legítima, e explícita.
    expect(() => carregarConfig({ ...base, RECUPERACAO_ATIVA: "nao" })).not.toThrow();
    /*
      E com destino de verdade E alguém falando com ele, sobe.

      `EMAIL_ATIVO=sim` entrou aqui em 09/09/2026, junto do cliente HTTP de
      email, e a razão é a metade que faltava neste mesmo defeito: ter as
      variáveis do provedor preenchidas nunca foi suficiente, porque nenhuma
      linha do servidor as lia. A produção subia, a rota respondia "enviamos" e
      o link de uso único ia para o log, exatamente como no caso acima.
    */
    expect(() => carregarConfig({
      ...base,
      NOTIFICADOR_URL: "https://email.exemplo.com/enviar",
      NOTIFICADOR_CHAVE: "chave-do-provedor",
      EMAIL_ATIVO: "sim",
    })).not.toThrow();

    // E preencher o provedor sem ligar o envio continua sendo recusado.
    expect(() => carregarConfig({
      ...base,
      NOTIFICADOR_URL: "https://email.exemplo.com/enviar",
      NOTIFICADOR_CHAVE: "chave-do-provedor",
    })).toThrow(/EMAIL_ATIVO=nao/);
  });
});
