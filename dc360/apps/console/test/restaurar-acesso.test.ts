import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DONO, cadastrarPrefeitura, codigoNovo, subirConsoleDeTeste, type ConsoleDeTeste } from "./apoio/console-de-teste.js";
import { conferirSenha } from "../../api/src/auth/senha.js";
import { restaurarAcessoDoAdministrador } from "../src/municipios.js";

/**
 * RESTAURAR O ACESSO DO ADMINISTRADOR DE UM MUNICÍPIO, pela rota do console
 * (migração 055, decisão H06 B do Rafael, 26/10/2026).
 *
 * Enquanto a recuperação por email estiver desligada em produção, o
 * administrador único que perde a senha não tem saída pelo painel. O caminho
 * de suporte é o dono do console sortear uma senha temporária para ele, depois
 * de conferir a identidade de quem pede fora do sistema (`docs/IMPLANTACAO.md`,
 * seção 6.5).
 *
 * O que este arquivo prova, com a rota de verdade sobre o Postgres em
 * WebAssembly com as migrações reais:
 *
 *   - só o dono, autenticado, com a senha atual e um código NOVO do
 *     aplicativo; o operador comum recebe 403 na rota e o BANCO o recusa
 *     mesmo por fora da rota;
 *   - motivo obrigatório e escrito;
 *   - conta de outro município, de outro papel ou inexistente recebe a mesma
 *     recusa, e nada muda no banco;
 *   - o caminho feliz: a senha mostrada uma vez confere com o hash gravado, é
 *     provisória (72 h), as sessões da pessoa caem, a trilha do município e o
 *     registro do console recebem o ato, e a senha não aparece no log, na
 *     trilha nem no registro.
 */

let c: ConsoleDeTeste;
let tokenDoDono: string;
let tokenDoOperador: string;
let operadorId: string;
let pedraBranca: { organizacaoId: string; usuarioId: string };
let rioClaro: { organizacaoId: string; usuarioId: string };
const EMAIL_DE_PEDRA_BRANCA = "rita@pedrabranca.mg.gov.br";
const EMAIL_DE_RIO_CLARO = "rita@rioclaro.mg.gov.br";
const MOTIVO = "Chamado 2026-311: administradora perdeu a senha; identidade conferida por videochamada.";

beforeAll(async () => {
  c = await subirConsoleDeTeste();
  tokenDoDono = await c.entrar(DONO.email, DONO.senha, c.segredoDoDono);

  const criado = await c.app.inject({
    method: "POST", url: "/operadores",
    headers: { authorization: `Bearer ${tokenDoDono}` },
    payload: { email: "suporte@fornecedor.com.br" },
  });
  expect(criado.statusCode, criado.body).toBe(201);
  operadorId = criado.json().id;
  tokenDoOperador = await c.entrar(
    "suporte@fornecedor.com.br", criado.json().senhaInicial, criado.json().segredo,
  );

  pedraBranca = await cadastrarPrefeitura(c.app, tokenDoDono, "Pedra Branca");
  rioClaro = await cadastrarPrefeitura(c.app, tokenDoDono, "Rio Claro");
}, 240_000);

afterAll(async () => {
  await c?.encerrar();
});

function pedir(token: string | null, organizacaoId: string, corpo: Record<string, unknown>) {
  return c.app.inject({
    method: "POST", url: `/municipios/${organizacaoId}/restaurar-acesso`,
    ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
    payload: corpo,
  });
}

/** Um pedido completo do dono, com código novo a cada chamada. */
function pedidoDoDono(email: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    senha: DONO.senha,
    codigo: codigoNovo(c.relogio, c.segredoDoDono),
    email,
    motivo: MOTIVO,
    ...extra,
  };
}

type Conta = { senha_hash: string; senha_provisoria_ate: string | null };
async function conta(usuarioId: string): Promise<Conta> {
  return (await c.mem.bruto.query<Conta>(
    "SELECT senha_hash, senha_provisoria_ate::text FROM usuarios WHERE id = $1", [usuarioId],
  )).rows[0]!;
}

async function abrirSessao(organizacaoId: string, usuarioId: string, rotulo: string): Promise<void> {
  await c.mem.bruto.query(
    `INSERT INTO sessoes (organizacao_id, usuario_id, token_hash, expira_em)
     VALUES ($1, $2, $3, now() + interval '8 hours')`,
    [organizacaoId, usuarioId, `sessao-${rotulo}`],
  );
}

async function sessoesAbertas(usuarioId: string): Promise<number> {
  return Number((await c.mem.bruto.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM sessoes WHERE usuario_id = $1 AND revogada_em IS NULL", [usuarioId],
  )).rows[0]!.n);
}

async function registros(organizacaoId: string): Promise<number> {
  return Number((await c.mem.bruto.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM restauracoes_de_acesso WHERE organizacao_id = $1", [organizacaoId],
  )).rows[0]!.n);
}

describe("Quem pode, e com que prova", { timeout: 120_000 }, () => {
  it("sem sessão: 401, e nada muda", async () => {
    const antes = await conta(pedraBranca.usuarioId);
    const r = await pedir(null, pedraBranca.organizacaoId, pedidoDoDono(EMAIL_DE_PEDRA_BRANCA));
    expect(r.statusCode).toBe(401);
    expect(await conta(pedraBranca.usuarioId)).toEqual(antes);
  });

  it("operador comum: 403 na rota, e o BANCO o recusa mesmo por fora dela", async () => {
    const antes = await conta(pedraBranca.usuarioId);
    const r = await pedir(tokenDoOperador, pedraBranca.organizacaoId, pedidoDoDono(EMAIL_DE_PEDRA_BRANCA));
    expect(r.statusCode).toBe(403);
    expect(r.json().erro).toBe("so_o_dono");

    let codigo = "";
    try {
      await restaurarAcessoDoAdministrador(
        c.mem.banco, operadorId, pedraBranca.organizacaoId, EMAIL_DE_PEDRA_BRANCA, MOTIVO,
      );
    } catch (erro) {
      codigo = (erro as { code?: string }).code ?? "";
    }
    expect(codigo, "o banco deixou um operador comum restaurar o acesso").toBe("42501");
    expect(await conta(pedraBranca.usuarioId)).toEqual(antes);
    expect(await registros(pedraBranca.organizacaoId)).toBe(0);
  });

  it("senha errada ou código já usado: 401, e nada muda", async () => {
    const antes = await conta(pedraBranca.usuarioId);
    const senhaErrada = await pedir(tokenDoDono, pedraBranca.organizacaoId,
      pedidoDoDono(EMAIL_DE_PEDRA_BRANCA, { senha: "nao-e-a-senha-da-dona" }));
    expect(senhaErrada.statusCode).toBe(401);
    expect(senhaErrada.json().erro).toBe("senha_incorreta");

    const usado = pedidoDoDono(EMAIL_DE_PEDRA_BRANCA, { email: "ninguem@pedrabranca.mg.gov.br" });
    // Gasta o código numa recusa do banco, e tenta de novo com o MESMO código.
    expect((await pedir(tokenDoDono, pedraBranca.organizacaoId, usado)).statusCode).toBe(409);
    const repetido = await pedir(tokenDoDono, pedraBranca.organizacaoId, { ...usado, email: EMAIL_DE_PEDRA_BRANCA });
    expect(repetido.statusCode).toBe(401);
    expect(repetido.json().erro).toBe("codigo_invalido");
    expect(await conta(pedraBranca.usuarioId)).toEqual(antes);
  });

  it("sem motivo, ou com motivo curto: 400, e nada muda", async () => {
    const antes = await conta(pedraBranca.usuarioId);
    for (const motivo of [undefined, "", "   ", "curto"]) {
      const r = await pedir(tokenDoDono, pedraBranca.organizacaoId,
        pedidoDoDono(EMAIL_DE_PEDRA_BRANCA, { motivo }));
      expect(r.statusCode, `motivo ${JSON.stringify(motivo)} passou`).toBe(400);
      expect(r.json().erro).toBe("pedido_invalido");
    }
    expect(await conta(pedraBranca.usuarioId)).toEqual(antes);
  });

  it("município que não existe: 404", async () => {
    const r = await pedir(tokenDoDono, "00000000-0000-4000-8000-0000000000aa",
      pedidoDoDono(EMAIL_DE_PEDRA_BRANCA));
    expect(r.statusCode).toBe(404);
    const malformado = await pedir(tokenDoDono, "nao-e-uuid", pedidoDoDono(EMAIL_DE_PEDRA_BRANCA));
    expect(malformado.statusCode).toBe(404);
  });
});

describe("Qual conta: só o administrador ativo do município indicado", { timeout: 120_000 }, () => {
  it("administrador de OUTRO município: a mesma recusa de conta que não existe, e nada muda", async () => {
    const antesDoOutro = await conta(rioClaro.usuarioId);
    const cruzado = await pedir(tokenDoDono, pedraBranca.organizacaoId, pedidoDoDono(EMAIL_DE_RIO_CLARO));
    const inexistente = await pedir(tokenDoDono, pedraBranca.organizacaoId,
      pedidoDoDono("ninguem@pedrabranca.mg.gov.br"));
    expect(cruzado.statusCode).toBe(409);
    expect(cruzado.json()).toEqual(inexistente.json());
    expect(cruzado.json().mensagem).toBe("Nao ha administrador ativo com este email neste municipio.");
    expect(await conta(rioClaro.usuarioId)).toEqual(antesDoOutro);
    expect(await registros(pedraBranca.organizacaoId)).toBe(0);
    expect(await registros(rioClaro.organizacaoId)).toBe(0);
  });

  it("conta de coordenador do mesmo município: recusa, e nada muda", async () => {
    const coordenador = (await c.mem.bruto.query<{ id: string }>(
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
       VALUES ($1, 'Caio Prado', 'PB-2', 'caio@pedrabranca.mg.gov.br', 'coordenador',
               (SELECT senha_hash FROM usuarios WHERE id = $2)) RETURNING id`,
      [pedraBranca.organizacaoId, pedraBranca.usuarioId],
    )).rows[0]!.id;
    const antes = await conta(coordenador);
    const r = await pedir(tokenDoDono, pedraBranca.organizacaoId, pedidoDoDono("caio@pedrabranca.mg.gov.br"));
    expect(r.statusCode).toBe(409);
    expect(r.json().mensagem, "a recusa contou ao console o papel da pessoa").not.toContain("coordenador");
    expect(await conta(coordenador)).toEqual(antes);
  });
});

describe("O caminho feliz", { timeout: 120_000 }, () => {
  it("senha temporária uma vez, provisória de 72 h, sessões caídas, trilha e registro, sem a senha no log", async () => {
    await abrirSessao(pedraBranca.organizacaoId, pedraBranca.usuarioId, "rita-1");
    await abrirSessao(pedraBranca.organizacaoId, pedraBranca.usuarioId, "rita-2");
    const antesDoLog = c.log.length;

    const r = await pedir(tokenDoDono, pedraBranca.organizacaoId,
      pedidoDoDono("  RITA@pedrabranca.mg.gov.br "));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    const corpo = r.json() as {
      senhaTemporaria: string; senhaProvisoriaAte: string; sessoesEncerradas: number; mensagem: string;
    };
    expect(Object.keys(corpo).sort()).toEqual(["mensagem", "senhaProvisoriaAte", "senhaTemporaria", "sessoesEncerradas"]);
    expect(corpo.sessoesEncerradas).toBe(2);
    expect(corpo.senhaTemporaria.length).toBeGreaterThanOrEqual(12);

    // A senha mostrada é a que o banco guarda, como hash, e é provisória.
    const depois = await conta(pedraBranca.usuarioId);
    expect(await conferirSenha(corpo.senhaTemporaria, depois.senha_hash)).toBe(true);
    expect(depois.senha_hash).not.toContain(corpo.senhaTemporaria);
    expect(depois.senha_provisoria_ate).not.toBeNull();
    const horas = (new Date(corpo.senhaProvisoriaAte).getTime() - Date.now()) / 3_600_000;
    expect(horas).toBeGreaterThan(71.9);
    expect(horas).toBeLessThanOrEqual(72);
    expect(await sessoesAbertas(pedraBranca.usuarioId)).toBe(0);

    // A trilha do município e o registro do console, sem a senha.
    const trilha = (await c.mem.bruto.query<{ autor_nome: string; texto: string }>(
      `SELECT autor_nome, depois::text AS texto FROM trilha_administrativa
        WHERE organizacao_id = $1 AND acao = 'acesso_do_administrador_restaurado_pelo_fornecedor'`,
      [pedraBranca.organizacaoId],
    )).rows;
    expect(trilha).toHaveLength(1);
    expect(trilha[0]!.autor_nome).toBe(DONO.email);
    expect(trilha[0]!.texto).toContain(MOTIVO);
    expect(trilha[0]!.texto).not.toContain(corpo.senhaTemporaria);
    const registro = (await c.mem.bruto.query<Record<string, unknown>>(
      "SELECT * FROM restauracoes_de_acesso WHERE organizacao_id = $1", [pedraBranca.organizacaoId],
    )).rows;
    expect(registro).toHaveLength(1);
    expect(registro[0]!.operador_email).toBe(DONO.email);
    expect(JSON.stringify(registro[0])).not.toContain(corpo.senhaTemporaria);

    // O log tem o rastro do ato, e nem a senha nem o motivo.
    const linhas = c.log.slice(antesDoLog).join("\n");
    expect(linhas).toContain("acao perigosa no console: restaurar_acesso");
    expect(linhas, "a senha temporária foi para o log").not.toContain(corpo.senhaTemporaria);
    expect(linhas, "o motivo foi para o log").not.toContain(MOTIVO);
    expect(linhas, "a senha do dono foi para o log").not.toContain(DONO.senha);
  });

  it("o registro aparece para o dono e não para o operador", async () => {
    const doDono = await c.app.inject({
      method: "GET", url: `/municipios/${pedraBranca.organizacaoId}/restauracoes`,
      headers: { authorization: `Bearer ${tokenDoDono}` },
    });
    expect(doDono.statusCode).toBe(200);
    const lista = doDono.json().restauracoes as Array<Record<string, unknown>>;
    expect(lista).toHaveLength(1);
    expect(lista[0]!.motivo).toBe(MOTIVO);
    expect(lista[0]!.operador_email).toBe(DONO.email);

    const doOperador = await c.app.inject({
      method: "GET", url: `/municipios/${pedraBranca.organizacaoId}/restauracoes`,
      headers: { authorization: `Bearer ${tokenDoOperador}` },
    });
    expect(doOperador.statusCode).toBe(403);
  });
});
