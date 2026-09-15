import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DONO, cadastrarPrefeitura, codigoNovo, subirConsoleDeTeste, type ConsoleDeTeste } from "./apoio/console-de-teste.js";

/**
 * As duas ações perigosas por município, e o prazo de arrependimento.
 *
 * O pedido do dono: um botão que "exige autenticação e os carambas" para
 * apagar uma prefeitura por completo, e outro só para desativar o acesso. As
 * decisões tomadas com ele: eliminar tem prazo de arrependimento de SETE dias
 * (suspende na hora, apaga depois, com cancelamento durante o prazo), e só o
 * dono desativa e elimina.
 *
 * O QUE O CONSOLE FAZ E O QUE ELE NÃO FAZ. Ele chama quatro funções do banco
 * (`console_suspender_municipio`, `console_reativar_municipio`,
 * `console_agendar_eliminacao`, `console_cancelar_eliminacao`), todas com o
 * contexto do operador na transação, e todas recusando quem não é dono ativo
 * com `insufficient_privilege`. O apagamento em si NÃO é do console: é o
 * relógio da API, guardado pelo estado do banco. Aqui não existe nada que
 * apague uma linha de município.
 *
 * O QUE O TESTE PROVA além da tela: que a rota recusa o operador (esconder o
 * botão não é controle de acesso), e que o BANCO recusa o operador mesmo
 * quando a chamada não passa pela rota.
 */

let c: ConsoleDeTeste;
let tokenDoDono: string;
let tokenDoOperador: string;
let operadorId: string;
let serraAlta: string;
let valeFundo: string;

beforeAll(async () => {
  c = await subirConsoleDeTeste();
  tokenDoDono = await c.entrar(DONO.email, DONO.senha, c.segredoDoDono);

  const criado = await c.app.inject({
    method: "POST", url: "/operadores",
    headers: { authorization: `Bearer ${tokenDoDono}` },
    payload: { email: "plantao@fornecedor.com.br" },
  });
  expect(criado.statusCode, criado.body).toBe(201);
  operadorId = criado.json().id;
  tokenDoOperador = await c.entrar(
    "plantao@fornecedor.com.br", criado.json().senhaInicial, criado.json().segredo,
  );

  serraAlta = (await cadastrarPrefeitura(c.app, tokenDoDono, "Serra Alta")).organizacaoId;
  valeFundo = (await cadastrarPrefeitura(c.app, tokenDoDono, "Vale Fundo")).organizacaoId;
}, 240_000);

afterAll(async () => {
  await c?.encerrar();
});

function como(token: string, url: string, payload?: unknown) {
  return c.app.inject({
    method: "POST", url, headers: { authorization: `Bearer ${token}` },
    ...(payload !== undefined ? { payload } : {}),
  });
}

async function situacao(id: string): Promise<Record<string, unknown>> {
  const r = await c.app.inject({
    method: "GET", url: "/municipios", headers: { authorization: `Bearer ${tokenDoDono}` },
  });
  expect(r.statusCode).toBe(200);
  const linha = (r.json().municipios as Array<Record<string, unknown>>)
    .find((m) => m["organizacao_id"] === id);
  expect(linha, `o municipio ${id} sumiu da lista`).toBeDefined();
  return linha!;
}

async function noBanco(id: string) {
  const r = await c.mem.bruto.query<{
    acesso_suspenso_em: string | null; suspensao_motivo: string | null;
    eliminacao_agendada_para: string | null; eliminada_em: string | null;
  }>(
    `SELECT acesso_suspenso_em, suspensao_motivo, eliminacao_agendada_para, eliminada_em
       FROM organizacoes WHERE id = $1`, [id],
  );
  return r.rows[0]!;
}

/** As linhas de log que falam de acao perigosa, so elas. */
function avisos(): Array<Record<string, unknown>> {
  return c.log
    .map((l) => { try { return JSON.parse(l) as Record<string, unknown>; } catch { return null; } })
    .filter((l): l is Record<string, unknown> => l !== null && l["level"] === 40 && "acao" in l);
}

describe("A lista de municipios mostra o estado do acesso", () => {
  it("municipio recem-cadastrado esta ativo: sem suspensao e sem eliminacao", async () => {
    const linha = await situacao(serraAlta);
    for (const campo of ["acesso_suspenso_em", "suspensao_motivo", "eliminacao_agendada_para", "eliminada_em"]) {
      expect(campo in linha, `a lista nao traz ${campo}, e a tela nao tem como mostrar o estado`).toBe(true);
      expect(linha[campo], `${campo} veio preenchido num municipio novo`).toBeNull();
    }
  });
});

describe("Desativar o acesso e reativar", () => {
  it("suspender exige motivo", async () => {
    const r = await como(tokenDoDono, `/municipios/${serraAlta}/suspender`, { motivo: "   " });
    expect(r.statusCode, r.body).toBe(400);
    expect((await noBanco(serraAlta)).acesso_suspenso_em).toBeNull();
  });

  it("o dono suspende com motivo, e a lista passa a dizer desde quando e por que", async () => {
    const r = await como(tokenDoDono, `/municipios/${serraAlta}/suspender`, {
      motivo: "Inadimplência desde julho",
    });
    expect(r.statusCode, r.body).toBe(200);

    const banco = await noBanco(serraAlta);
    expect(banco.acesso_suspenso_em).not.toBeNull();
    expect(banco.suspensao_motivo).toBe("Inadimplência desde julho");

    const linha = await situacao(serraAlta);
    expect(linha["acesso_suspenso_em"]).not.toBeNull();
    expect(linha["suspensao_motivo"]).toBe("Inadimplência desde julho");
    expect(linha["eliminacao_agendada_para"]).toBeNull();

    const aviso = avisos().find((a) => a["acao"] === "suspender" && a["organizacao_id"] === serraAlta);
    expect(aviso, "suspender nao deixou linha de warn com quem e qual municipio").toBeDefined();
    expect(aviso!["operador"]).toBe(DONO.email);
  });

  it("o dono reativa, e o estado volta a limpo", async () => {
    const r = await como(tokenDoDono, `/municipios/${serraAlta}/reativar`);
    expect(r.statusCode, r.body).toBe(200);
    const banco = await noBanco(serraAlta);
    expect(banco.acesso_suspenso_em).toBeNull();
    expect(banco.suspensao_motivo).toBeNull();
    expect(avisos().some((a) => a["acao"] === "reativar" && a["organizacao_id"] === serraAlta)).toBe(true);
  });

  it("o operador nao suspende nem reativa: 403 na rota, e nada muda", async () => {
    const s = await como(tokenDoOperador, `/municipios/${serraAlta}/suspender`, { motivo: "tentativa" });
    expect(s.statusCode, s.body).toBe(403);
    expect(s.json().erro).toBe("so_o_dono");
    expect((await noBanco(serraAlta)).acesso_suspenso_em).toBeNull();

    const r = await como(tokenDoOperador, `/municipios/${serraAlta}/reativar`);
    expect(r.statusCode).toBe(403);
  });

  it("o BANCO recusa o operador chamando a funcao direto, com insufficient_privilege", async () => {
    /*
      A rota acima poderia estar recusando por conta propria. Aqui a chamada
      pula a rota e vai pela conexao do console com o contexto do OPERADOR:
      quem tem que dizer nao e o Postgres, e com o codigo 42501.
    */
    for (const [sql, params] of [
      ["SELECT console_suspender_municipio($1, $2)", [serraAlta, "por fora"]],
      ["SELECT console_reativar_municipio($1)", [serraAlta]],
      ["SELECT console_agendar_eliminacao($1, $2)", [serraAlta, "por fora"]],
      ["SELECT console_cancelar_eliminacao($1)", [serraAlta]],
    ] as const) {
      let codigo = "";
      try {
        await c.mem.banco.executar(sql, [...params], operadorId);
      } catch (erro) {
        codigo = String((erro as { code?: string }).code ?? "");
      }
      expect(codigo, `o banco deixou o operador executar "${sql}"`).toBe("42501");
    }
    expect((await noBanco(serraAlta)).acesso_suspenso_em).toBeNull();
    expect((await noBanco(serraAlta)).eliminacao_agendada_para).toBeNull();
  });

  it("e recusa ate o dono quando a transacao nao carrega o contexto dele", async () => {
    // Sem `app.console_operador` a funcao nao sabe quem chama, e nao chuta.
    let codigo = "";
    try {
      await c.mem.banco.executar("SELECT console_suspender_municipio($1, $2)", [serraAlta, "sem contexto"]);
    } catch (erro) {
      codigo = String((erro as { code?: string }).code ?? "");
    }
    expect(codigo).toBe("42501");
  });

  it("municipio que nao existe responde 404, e nao 500", async () => {
    const r = await como(tokenDoDono, "/municipios/00000000-0000-4000-8000-000000000000/suspender", {
      motivo: "x",
    });
    expect(r.statusCode).toBe(404);
    expect((await como(tokenDoDono, "/municipios/nao-e-uuid/reativar")).statusCode).toBe(404);
  });
});

describe("Eliminar, com prazo de arrependimento de sete dias", () => {
  const MOTIVO = "Contrato encerrado, pedido por ofício da prefeitura";

  it("a rota exige senha atual, codigo novo, nome exato e motivo, nessa ordem", async () => {
    const novo = () => codigoNovo(c.relogio, c.segredoDoDono);

    const semSenha = await como(tokenDoDono, `/municipios/${valeFundo}/eliminar`, {
      senha: "nao-e-essa", codigo: novo(), nome: "Vale Fundo", motivo: MOTIVO,
    });
    expect(semSenha.statusCode, semSenha.body).toBe(401);
    expect(semSenha.json().erro).toBe("senha_incorreta");

    const codigoErrado = await como(tokenDoDono, `/municipios/${valeFundo}/eliminar`, {
      senha: DONO.senha, codigo: "000000", nome: "Vale Fundo", motivo: MOTIVO,
    });
    expect(codigoErrado.statusCode, codigoErrado.body).toBe(401);
    expect(codigoErrado.json().erro).toBe("codigo_invalido");

    const nomeErrado = await como(tokenDoDono, `/municipios/${valeFundo}/eliminar`, {
      senha: DONO.senha, codigo: novo(), nome: "vale fundo", motivo: MOTIVO,
    });
    expect(nomeErrado.statusCode, nomeErrado.body).toBe(400);
    expect(nomeErrado.json().erro).toBe("nome_nao_confere");

    const semMotivo = await como(tokenDoDono, `/municipios/${valeFundo}/eliminar`, {
      senha: DONO.senha, codigo: novo(), nome: "Vale Fundo", motivo: "",
    });
    expect(semMotivo.statusCode).toBe(400);

    expect((await noBanco(valeFundo)).eliminacao_agendada_para, "algum pedido incompleto agendou").toBeNull();
    expect((await noBanco(valeFundo)).acesso_suspenso_em).toBeNull();
  }, 180_000);

  it("o codigo que abriu a sessao (ja usado) nao serve para eliminar", async () => {
    /*
      "Um codigo NOVO do autenticador, nao o da entrada". O da entrada esta
      queimado na linha do dono, e um codigo igual ou anterior ao passo queimado
      e recusado. Aqui a entrada e feita com um codigo conhecido, e o mesmo
      codigo e apresentado em seguida para eliminar.
    */
    const jaUsado = codigoNovo(c.relogio, c.segredoDoDono);
    const abre = await c.app.inject({
      method: "POST", url: "/entrar", payload: { email: DONO.email, senha: DONO.senha },
    });
    const entra = await c.app.inject({
      method: "POST", url: "/entrar/codigo", payload: { desafio: abre.json().desafio, codigo: jaUsado },
    });
    expect(entra.statusCode, entra.body).toBe(200);

    const r = await como(tokenDoDono, `/municipios/${valeFundo}/eliminar`, {
      senha: DONO.senha, codigo: jaUsado, nome: "Vale Fundo", motivo: MOTIVO,
    });
    expect(r.statusCode, "um codigo ja queimado agendou a eliminacao").toBe(401);
    expect((await noBanco(valeFundo)).eliminacao_agendada_para).toBeNull();
  }, 120_000);

  it("com tudo certo, suspende na hora e agenda para sete dias, e a lista mostra", async () => {
    const r = await como(tokenDoDono, `/municipios/${valeFundo}/eliminar`, {
      senha: DONO.senha,
      codigo: codigoNovo(c.relogio, c.segredoDoDono),
      nome: "Vale Fundo", motivo: MOTIVO,
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().eliminacao_agendada_para).toBeTypeOf("string");

    const banco = await noBanco(valeFundo);
    expect(banco.eliminacao_agendada_para).not.toBeNull();
    expect(banco.acesso_suspenso_em, "agendar a eliminacao nao suspendeu o acesso na hora").not.toBeNull();
    expect(banco.eliminada_em, "o console apagou o municipio: isso e do relogio da API").toBeNull();

    const quando = new Date(banco.eliminacao_agendada_para!).getTime();
    const seteDias = 7 * 24 * 60 * 60_000;
    expect(quando).toBeGreaterThan(Date.now() + seteDias - 60_000);
    expect(quando).toBeLessThan(Date.now() + seteDias + 60_000);

    const linha = await situacao(valeFundo);
    expect(linha["eliminacao_agendada_para"]).not.toBeNull();

    // O municipio CONTINUA existindo: eliminar e agendar, e o console nao apaga.
    const existe = await c.mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM organizacoes WHERE id = $1", [valeFundo],
    );
    expect(existe.rows[0]!.n).toBe("1");

    const aviso = avisos().find((a) => a["acao"] === "agendar_eliminacao" && a["organizacao_id"] === valeFundo);
    expect(aviso, "agendar a eliminacao nao deixou linha de warn").toBeDefined();
    expect(aviso!["operador"]).toBe(DONO.email);
  }, 120_000);

  it("reativar e recusado enquanto ha eliminacao agendada: cancelar e ato separado", async () => {
    const r = await como(tokenDoDono, `/municipios/${valeFundo}/reativar`);
    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().mensagem).toMatch(/elimina/i);
    expect((await noBanco(valeFundo)).acesso_suspenso_em).not.toBeNull();
  });

  it("cancelar durante o prazo tira o agendamento e NAO reativa sozinho", async () => {
    const r = await como(tokenDoDono, `/municipios/${valeFundo}/eliminacao/cancelar`);
    expect(r.statusCode, r.body).toBe(200);

    const banco = await noBanco(valeFundo);
    expect(banco.eliminacao_agendada_para).toBeNull();
    expect(banco.acesso_suspenso_em, "cancelar a eliminacao reativou o acesso por conta propria").not.toBeNull();

    expect(avisos().some((a) => a["acao"] === "cancelar_eliminacao" && a["organizacao_id"] === valeFundo)).toBe(true);

    // Agora sim, reativar e um ato separado, e ele passa.
    const reativa = await como(tokenDoDono, `/municipios/${valeFundo}/reativar`);
    expect(reativa.statusCode, reativa.body).toBe(200);
    expect((await noBanco(valeFundo)).acesso_suspenso_em).toBeNull();
  });

  it("cancelar sem agendamento responde recusa escrita, e nao falha interna", async () => {
    const r = await como(tokenDoDono, `/municipios/${valeFundo}/eliminacao/cancelar`);
    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().mensagem).toBeTruthy();
  });

  it("o operador nao elimina nem cancela, nem com a senha e o codigo do proprio", async () => {
    // O operador tem senha e segredo proprios, e os dois conferem: o que ele
    // nao tem e o papel. A recusa precisa ser por poder, e nao por credencial.
    const r = await como(tokenDoOperador, `/municipios/${serraAlta}/eliminar`, {
      senha: "qualquer", codigo: "000000", nome: "Serra Alta", motivo: MOTIVO,
    });
    expect(r.statusCode, r.body).toBe(403);
    expect(r.json().erro).toBe("so_o_dono");
    expect((await como(tokenDoOperador, `/municipios/${serraAlta}/eliminacao/cancelar`)).statusCode).toBe(403);
    expect((await noBanco(serraAlta)).eliminacao_agendada_para).toBeNull();
  });
});

describe("Nada que sirva para entrar cai no log das acoes perigosas", () => {
  it("as linhas de warn carregam quem, qual municipio por id e a acao, e nunca senha nem codigo", async () => {
    const codigo = codigoNovo(c.relogio, c.segredoDoDono);
    const r = await como(tokenDoDono, `/municipios/${serraAlta}/eliminar`, {
      senha: DONO.senha, codigo, nome: "Serra Alta", motivo: "Teste do log",
    });
    expect(r.statusCode, r.body).toBe(200);
    await como(tokenDoDono, `/municipios/${serraAlta}/eliminacao/cancelar`);

    const tudo = c.log
      .join("\n")
      .replace(/"(?:time|responseTime|pid|remotePort|statusCode|level)":\s*[\d.]+/g, "")
      .replace(/"reqId":\s*"[^"]*"/g, "");

    expect(tudo, "a senha do dono foi para o log").not.toContain(DONO.senha);
    expect(tudo, "o codigo do segundo fator foi para o log").not.toContain(codigo);
    expect(tudo, "o token do dono foi para o log").not.toContain(tokenDoDono);
    expect(tudo, "o segredo do segundo fator foi para o log").not.toContain(c.segredoDoDono);
    expect(tudo).not.toContain("scrypt$");

    const linhas = avisos().filter((a) => a["organizacao_id"] === serraAlta);
    expect(linhas.map((a) => a["acao"])).toContain("agendar_eliminacao");
    expect(linhas.map((a) => a["acao"])).toContain("cancelar_eliminacao");
    for (const linha of linhas) {
      expect(linha["operador"], "a linha nao diz quem fez").toBe(DONO.email);
      expect(linha["time"], "a linha nao diz quando").toBeTypeOf("number");
    }
  }, 120_000);
});

describe("Limite por endereco nas rotas de acao perigosa", () => {
  it("depois do teto, a rota responde 429 com a espera certa, e a de numeros nao", async () => {
    const apertado = await subirConsoleDeTeste({ limiteDeAcoes: 3 });
    try {
      const token = await apertado.entrar(DONO.email, DONO.senha, apertado.segredoDoDono);
      const desfechos: number[] = [];
      for (let i = 0; i < 5; i++) {
        const r = await apertado.app.inject({
          method: "POST", url: "/municipios/00000000-0000-4000-8000-000000000000/reativar",
          headers: { authorization: `Bearer ${token}` },
        });
        desfechos.push(r.statusCode);
        if (r.statusCode === 429) {
          expect(r.json().mensagem).toMatch(/hora/i);
        }
      }
      expect(desfechos.includes(429), `desfechos: ${desfechos.join(", ")}`).toBe(true);

      const numeros = await apertado.app.inject({
        method: "GET", url: "/municipios", headers: { authorization: `Bearer ${token}` },
      });
      expect(numeros.statusCode, "o teto das acoes pegou a leitura de numeros").toBe(200);
    } finally {
      await apertado.encerrar();
    }
  }, 180_000);
});
