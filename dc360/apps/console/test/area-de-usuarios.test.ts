import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verificarSessao } from "../src/tokens.js";
import { conferirSenha } from "../../api/src/auth/senha.js";
import { base32Decodificar } from "../../api/src/auth/totp.js";
import { DONO, JWT_SEGREDO_DE_TESTE, codigoDe, codigoNovo, subirConsoleDeTeste, type ConsoleDeTeste } from "./apoio/console-de-teste.js";

/**
 * A área de usuários do console: o dono cria operadores abaixo dele, desativa,
 * e cada um troca a própria senha.
 *
 * O pedido do dono, na letra: "gerar novos usuários que vão ficar abaixo;
 * eles jamais podem ter o poder sobre a primeira conta". Três coisas se
 * seguem disso e cada uma tem caso aqui:
 *
 *   1. Só o dono lista, cria e desativa. O SERVIDOR recusa o operador, e não
 *      a tela: esconder o botão não é controle de acesso. E o BANCO recusa por
 *      baixo, com a policy, que é o portão que continua valendo quando a rota
 *      esquecer o gancho.
 *   2. O dono não se desativa, por ninguém, nem por ele mesmo pela tela: um
 *      console sem dono é um console em que ninguém mais cria operador.
 *   3. A senha inicial e o segredo do segundo fator de um operador novo
 *      aparecem UMA vez, e nada fica em texto claro: nem no banco, nem no log.
 */

/**
 * Um hash com a FORMA do produto, para as tentativas indevidas abaixo baterem
 * na policy e não no CHECK de formato da coluna: uma recusa por formato
 * provaria só que o texto estava errado, e não que o operador não pode.
 */
const HASH_COM_FORMA =
  "scrypt$131072$8$1$XenoRKJ2mWCQSO-ZnZXUvg$vO-J5ozHwGH1V29fdrVZE4F9ps_lf8oqXHLmU_6ZMrk";

let c: ConsoleDeTeste;
let tokenDoDono: string;
let operador: { id: string; email: string; senhaInicial: string; segredo: string };
let tokenDoOperador: string;

const EMAIL_DO_OPERADOR = "Plantao@Fornecedor.com.br";

beforeAll(async () => {
  c = await subirConsoleDeTeste();
  tokenDoDono = await c.entrar(DONO.email, DONO.senha, c.segredoDoDono);
}, 180_000);

afterAll(async () => {
  await c?.encerrar();
});

function comoDono(method: "GET" | "POST", url: string, payload?: unknown) {
  return c.app.inject({
    method, url, headers: { authorization: `Bearer ${tokenDoDono}` },
    ...(payload !== undefined ? { payload } : {}),
  });
}

describe("O dono cria operadores, e a credencial deles aparece uma vez", () => {
  it("criar operador devolve senha, segredo, endereco otpauth, o desenho do QR e os codigos de recuperacao, uma vez", async () => {
    const r = await comoDono("POST", "/operadores", { email: EMAIL_DO_OPERADOR });
    expect(r.statusCode, r.body).toBe(201);
    const corpo = r.json();

    expect(
      Object.keys(corpo).sort(),
      "a resposta da criacao traz campo que ninguem revisou",
    ).toEqual(["codigos", "email", "endereco", "id", "qr", "segredo", "senhaInicial"]);

    expect(corpo.email, "o email nao entrou normalizado").toBe("plantao@fornecedor.com.br");
    expect(corpo.senhaInicial.length).toBeGreaterThan(11);
    expect(base32Decodificar(corpo.segredo), "o segredo nao e base32").not.toBeNull();
    expect(corpo.endereco).toMatch(/^otpauth:\/\/totp\//);
    expect(corpo.endereco).toContain(`secret=${corpo.segredo}`);
    expect(corpo.endereco).toContain("plantao%40fornecedor.com.br");

    /*
      O QR e desenhado pelo PROPRIO processo, como matriz de linhas de 0 e 1:
      a politica de seguranca de conteudo deste console nao deixa imagem de
      fora, e a tela desenha os quadradinhos em SVG a partir disto.
    */
    expect(corpo.qr.tamanho).toBeGreaterThan(20);
    expect(corpo.qr.linhas).toHaveLength(corpo.qr.tamanho);
    for (const linha of corpo.qr.linhas as string[]) {
      expect(linha).toHaveLength(corpo.qr.tamanho);
      expect(linha).toMatch(/^[01]+$/);
    }
    // Os tres olhos do QR: canto superior esquerdo comeca com sete escuros.
    expect((corpo.qr.linhas as string[])[0]!.slice(0, 7)).toBe("1111111");

    /* Os codigos de recuperacao nascem com a conta, na mesma tela de "mostrado
       uma vez". A forma e o que eles abrem estao em recuperacao-de-senha.test.ts. */
    expect(corpo.codigos).toHaveLength(8);

    operador = corpo;
  }, 60_000);

  it("a senha e o segredo mostrados abrem a conta criada", async () => {
    tokenDoOperador = await c.entrar(operador.email, operador.senhaInicial, operador.segredo);
    expect(tokenDoOperador).toBeTypeOf("string");

    const numeros = await c.app.inject({
      method: "GET", url: "/municipios", headers: { authorization: `Bearer ${tokenDoOperador}` },
    });
    expect(numeros.statusCode, "o operador criado nao le numeros").toBe(200);
  }, 60_000);

  it("nada fica em texto claro: nem no banco, nem no log", async () => {
    const linha = await c.mem.bruto.query<{ linha: string }>(
      "SELECT row_to_json(o)::text AS linha FROM console_operadores o WHERE id = $1",
      [operador.id],
    );
    expect(linha.rows[0]!.linha).not.toContain(operador.senhaInicial);
    expect(linha.rows[0]!.linha, "o segredo do TOTP esta em texto claro no banco")
      .not.toContain(operador.segredo);
    expect(linha.rows[0]!.linha).toContain("scrypt$");
    expect(linha.rows[0]!.linha).toContain('"v1.');

    const tudo = c.log.join("\n");
    expect(tudo.length).toBeGreaterThan(0);
    expect(tudo, "a senha inicial do operador foi para o log").not.toContain(operador.senhaInicial);
    expect(tudo, "o segredo do operador foi para o log").not.toContain(operador.segredo);
    expect(tudo, "o token do operador foi para o log").not.toContain(tokenDoOperador);
    // Mas o ato tem rastro, com quem fez e quem nasceu.
    expect(tudo).toContain("operador criado pelo console");
    expect(tudo).toContain(operador.id);
  });

  it("a linha nasce como operador, ativa, criada pelo dono", async () => {
    const r = await c.mem.bruto.query<{ papel: string; ativo: boolean; criado_por: string }>(
      "SELECT papel, ativo, criado_por FROM console_operadores WHERE id = $1", [operador.id],
    );
    const dono = await c.mem.bruto.query<{ id: string }>(
      "SELECT id FROM console_operadores WHERE papel = 'dono'",
    );
    expect(r.rows[0]!.papel).toBe("operador");
    expect(r.rows[0]!.ativo).toBe(true);
    expect(r.rows[0]!.criado_por).toBe(dono.rows[0]!.id);
  });

  it("email repetido e recusado com mensagem, e nao com falha interna", async () => {
    const r = await comoDono("POST", "/operadores", { email: "plantao@fornecedor.com.br" });
    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().mensagem).toContain("plantao@fornecedor.com.br");
  }, 60_000);

  it("email invalido e recusado antes de sortear senha nenhuma", async () => {
    const r = await comoDono("POST", "/operadores", { email: "nao-e-email" });
    expect(r.statusCode).toBe(400);
    expect(r.json().mensagem).toBeTruthy();
  });

  it("a lista traz email, papel e ativo, e nunca hash nem envelope", async () => {
    const r = await comoDono("GET", "/operadores");
    expect(r.statusCode, r.body).toBe(200);
    const lista = r.json().operadores as Array<Record<string, unknown>>;
    expect(lista.length).toBeGreaterThanOrEqual(2);

    const permitidas = new Set(["id", "email", "papel", "ativo", "criado_em"]);
    for (const linha of lista) {
      const sobrando = Object.keys(linha).filter((k) => !permitidas.has(k));
      expect(sobrando, `a lista de operadores traz ${sobrando.join(", ")}`).toEqual([]);
    }
    expect(r.body).not.toContain("scrypt");
    expect(r.body).not.toContain("v1.");

    expect(lista.find((l) => l["papel"] === "dono")?.["email"]).toBe(DONO.email);
    // O dono vem primeiro: e a conta que nao se desativa, e a tela precisa
    // mostra-la de forma diferente.
    expect(lista[0]!["papel"]).toBe("dono");
  });
});

describe("Operador nao gerencia usuario: o servidor recusa, e o banco recusa por baixo", () => {
  function comoOperador(method: "GET" | "POST", url: string, payload?: unknown) {
    return c.app.inject({
      method, url, headers: { authorization: `Bearer ${tokenDoOperador}` },
      ...(payload !== undefined ? { payload } : {}),
    });
  }

  it("listar, criar e desativar respondem 403 para o operador, sem tocar no banco", async () => {
    const antes = await c.mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM console_operadores",
    );

    expect((await comoOperador("GET", "/operadores")).statusCode).toBe(403);
    const cria = await comoOperador("POST", "/operadores", { email: "intruso@fornecedor.com.br" });
    expect(cria.statusCode, cria.body).toBe(403);
    expect(cria.json().erro).toBe("so_o_dono");

    const dono = await c.mem.bruto.query<{ id: string }>(
      "SELECT id FROM console_operadores WHERE papel = 'dono'",
    );
    const desativa = await comoOperador("POST", `/operadores/${dono.rows[0]!.id}/desativar`);
    expect(desativa.statusCode).toBe(403);

    const depois = await c.mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM console_operadores",
    );
    expect(depois.rows[0]!.n).toBe(antes.rows[0]!.n);
  });

  it("o BANCO recusa o operador criando linha ou mexendo no dono, mesmo fora da rota", async () => {
    /*
      A prova de que o 403 de cima nao e a unica defesa. Aqui a chamada vai
      direto pela conexao do console, com o contexto do operador, sem passar
      pela rota: e o Postgres quem diz nao.
    */
    const dono = await c.mem.bruto.query<{ id: string }>(
      "SELECT id FROM console_operadores WHERE papel = 'dono'",
    );
    for (const [rotulo, sql, params] of [
      ["criar operador",
        "INSERT INTO console_operadores (email, senha_hash, segundo_fator, papel, criado_por) VALUES ($1, $3, 'v1.x', 'operador', $2)",
        ["intruso@fornecedor.com.br", operador.id, HASH_COM_FORMA]],
      ["desativar o dono",
        "UPDATE console_operadores SET ativo = false WHERE id = $1", [dono.rows[0]!.id]],
      ["trocar a senha do dono",
        "UPDATE console_operadores SET senha_hash = $2 WHERE id = $1", [dono.rows[0]!.id, HASH_COM_FORMA]],
      ["virar dono",
        "UPDATE console_operadores SET papel = 'dono' WHERE id = $1", [operador.id]],
    ] as const) {
      let recusou = false;
      let linhas: unknown[] = [];
      try {
        linhas = await c.mem.banco.executar(sql, params, operador.id);
      } catch {
        recusou = true;
      }
      /*
        Um UPDATE que a policy filtra nao lanca: ele afeta zero linhas. Os dois
        desfechos sao a mesma coisa para o que importa (nada mudou), e o estado
        e conferido abaixo.
      */
      expect(recusou || linhas.length === 0, `o operador conseguiu ${rotulo}`).toBe(true);
    }

    const estado = await c.mem.bruto.query<{ id: string; ativo: boolean; papel: string }>(
      "SELECT id, ativo, papel FROM console_operadores ORDER BY criado_em",
    );
    expect(estado.rows.find((l) => l.id === dono.rows[0]!.id)!.ativo).toBe(true);
    expect(estado.rows.find((l) => l.id === operador.id)!.papel).toBe("operador");
    expect(estado.rows.some((l) => l.papel === "dono" && l.id !== dono.rows[0]!.id)).toBe(false);
    expect(estado.rows).toHaveLength(2);
  });
});

describe("O dono nao se desativa", () => {
  it("a rota recusa desativar o dono, mesmo pedido pelo proprio dono", async () => {
    const dono = await c.mem.bruto.query<{ id: string }>(
      "SELECT id FROM console_operadores WHERE papel = 'dono'",
    );
    const r = await comoDono("POST", `/operadores/${dono.rows[0]!.id}/desativar`);
    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().mensagem).toMatch(/dono/i);

    const ainda = await c.mem.bruto.query<{ ativo: boolean }>(
      "SELECT ativo FROM console_operadores WHERE papel = 'dono'",
    );
    expect(ainda.rows[0]!.ativo).toBe(true);
  });

  it("e o banco tambem recusa, pelo proprio contexto do dono", async () => {
    const dono = await c.mem.bruto.query<{ id: string }>(
      "SELECT id FROM console_operadores WHERE papel = 'dono'",
    );
    let recusou = false;
    try {
      await c.mem.banco.executar(
        "UPDATE console_operadores SET ativo = false WHERE id = $1",
        [dono.rows[0]!.id], dono.rows[0]!.id,
      );
    } catch {
      recusou = true;
    }
    expect(recusou, "o banco deixou o dono se desativar").toBe(true);
  });

  it("identificador que nao existe responde 404, e nao 500", async () => {
    const r = await comoDono("POST", "/operadores/00000000-0000-4000-8000-000000000000/desativar");
    expect(r.statusCode).toBe(404);
    expect((await comoDono("POST", "/operadores/nao-e-uuid/desativar")).statusCode).toBe(404);
  });
});

describe("Trocar a minha senha", () => {
  const NOVA = "nova-senha-do-plantao-bem-comprida";
  let tokenNovo: string;

  it("exige a senha atual E um codigo novo do autenticador", async () => {
    const semCodigo = await c.app.inject({
      method: "POST", url: "/senha",
      headers: { authorization: `Bearer ${tokenDoOperador}` },
      payload: { senhaAtual: operador.senhaInicial, codigo: "000000", novaSenha: NOVA },
    });
    expect(semCodigo.statusCode, semCodigo.body).toBe(401);
    expect(semCodigo.json().erro).toBe("codigo_invalido");

    const senhaErrada = await c.app.inject({
      method: "POST", url: "/senha",
      headers: { authorization: `Bearer ${tokenDoOperador}` },
      payload: {
        senhaAtual: "nao-e-essa", codigo: codigoDe(operador.segredo, c.relogio.agora), novaSenha: NOVA,
      },
    });
    expect(senhaErrada.statusCode, senhaErrada.body).toBe(401);
    expect(senhaErrada.json().erro).toBe("senha_incorreta");

    // Nada mudou: a senha antiga ainda confere no banco.
    const guardado = await c.mem.bruto.query<{ senha_hash: string }>(
      "SELECT senha_hash FROM console_operadores WHERE id = $1", [operador.id],
    );
    expect(await conferirSenha(operador.senhaInicial, guardado.rows[0]!.senha_hash)).toBe(true);
  }, 120_000);

  it("o codigo da entrada, ja usado, nao serve para trocar a senha", async () => {
    /*
      A regra "um codigo novo": o que abriu a sessao ja esta queimado na linha,
      e reusa-lo aqui seria trocar a senha com um codigo que quem esta atras do
      teclado pode ter visto na tela.
    */
    const usado = codigoNovo(c.relogio, operador.segredo);
    // Queima este passo entrando com ele agora.
    const abre = await c.app.inject({
      method: "POST", url: "/entrar", payload: { email: operador.email, senha: operador.senhaInicial },
    });
    const entra = await c.app.inject({
      method: "POST", url: "/entrar/codigo", payload: { desafio: abre.json().desafio, codigo: usado },
    });
    expect(entra.statusCode, entra.body).toBe(200);

    const r = await c.app.inject({
      method: "POST", url: "/senha",
      headers: { authorization: `Bearer ${tokenDoOperador}` },
      payload: { senhaAtual: operador.senhaInicial, codigo: usado, novaSenha: NOVA },
    });
    expect(r.statusCode, "o codigo ja usado na entrada trocou a senha").toBe(401);
  }, 120_000);

  it("senha nova curta demais e recusada antes de conferir nada", async () => {
    const r = await c.app.inject({
      method: "POST", url: "/senha",
      headers: { authorization: `Bearer ${tokenDoOperador}` },
      payload: { senhaAtual: operador.senhaInicial, codigo: "123456", novaSenha: "curta" },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().mensagem).toMatch(/12/);
  });

  it("com senha atual e codigo novo, troca, e devolve uma sessao nova", async () => {
    // Um passo adiante do que ja foi queimado nos casos anteriores.
    const r = await c.app.inject({
      method: "POST", url: "/senha",
      headers: { authorization: `Bearer ${tokenDoOperador}` },
      payload: {
        senhaAtual: operador.senhaInicial,
        codigo: codigoNovo(c.relogio, operador.segredo),
        novaSenha: NOVA,
      },
    });
    expect(r.statusCode, r.body).toBe(200);
    tokenNovo = r.json().token;
    expect(tokenNovo).toBeTypeOf("string");
    expect(tokenNovo).not.toBe(tokenDoOperador);

    const guardado = await c.mem.bruto.query<{ senha_hash: string }>(
      "SELECT senha_hash FROM console_operadores WHERE id = $1", [operador.id],
    );
    expect(await conferirSenha(NOVA, guardado.rows[0]!.senha_hash)).toBe(true);
    expect(await conferirSenha(operador.senhaInicial, guardado.rows[0]!.senha_hash)).toBe(false);

    const tudo = c.log.join("\n");
    expect(tudo, "a senha nova foi para o log").not.toContain(NOVA);
    expect(tudo, "a senha antiga foi para o log").not.toContain(operador.senhaInicial);
    expect(tudo).toContain("senha trocada");
  }, 120_000);

  it("trocar a senha derruba as outras sessoes daquele operador, e a nova vale", async () => {
    const velha = await c.app.inject({
      method: "GET", url: "/municipios", headers: { authorization: `Bearer ${tokenDoOperador}` },
    });
    expect(velha.statusCode, "a sessao anterior a troca de senha continuou valendo").toBe(401);

    const nova = await c.app.inject({
      method: "GET", url: "/municipios", headers: { authorization: `Bearer ${tokenNovo}` },
    });
    expect(nova.statusCode, "a sessao devolvida pela troca nao vale").toBe(200);

    // A sessao do dono nao tem nada a ver com isso e continua de pe.
    expect((await comoDono("GET", "/operadores")).statusCode).toBe(200);
  });

  it("o token continua sem carregar email nem segredo, e nao vale sem o banco", async () => {
    const segredo = new TextEncoder().encode(JWT_SEGREDO_DE_TESTE);
    const sessao = await verificarSessao(segredo, tokenNovo);
    expect(sessao?.id).toBe(operador.id);
    expect(JSON.stringify(sessao)).not.toContain("plantao@");
  });

  it("e a senha nova abre a conta", async () => {
    const token = await c.entrar(operador.email, NOVA, operador.segredo);
    expect(token).toBeTypeOf("string");
  }, 60_000);
});
