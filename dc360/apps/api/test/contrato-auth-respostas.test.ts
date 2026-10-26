import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import type { Mensagem, Notificador } from "../src/auth/notificador.js";
import { base32Decodificar, codigoTotp, passoDe } from "../src/auth/totp.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { ROTAS_DO_CONTRATO, type RotaComGrupo } from "../src/contrato/rotas.js";
import { chaveDaRota } from "../src/contrato/tipos.js";
import { construirServidor } from "../src/servidor.js";

/**
 * As respostas descritas no contrato (V2-F02-E04, parte 3C1) do grupo
 * `autenticacao` são as que a API devolve de verdade, nos dois desfechos da
 * entrada (sessão e desafio), na segunda etapa, na ativação por desafio, na
 * recuperação e na troca de senha.
 *
 * Cada caso chama a rota do contrato por `inject`, com o corpo validado pelo
 * MESMO esquema que o contrato descreve, e confere o status e o corpo da
 * `resposta`. O arquivo irmão `contrato-conta-administracao-respostas.test.ts`
 * faz o mesmo com `conta` e `administracao`.
 */

const SENHA = "defesa-civil-2026";
const CHAVE_DO_COFRE = Buffer.alloc(32, 9).toString("base64");

let mem: BancoEmMemoria;
let app: FastifyInstance;
let enviadas: Mensagem[] = [];

const notificador: Notificador = {
  async enviar(m) {
    enviadas.push(m);
    return { idNoProvedor: null };
  },
};

const com = (token: string) => ({ authorization: `Bearer ${token}` });

function rotaDe(chave: string): RotaComGrupo {
  const r = ROTAS_DO_CONTRATO.find((x) => chaveDaRota(x) === chave);
  if (!r) throw new Error(`o contrato não descreve ${chave}`);
  return r;
}

type Chamada = { token?: string; payload?: unknown };

async function chamar(
  chave: string,
  { token, payload }: Chamada = {},
): Promise<{ res: LightMyRequestResponse; corpo: unknown }> {
  const r = rotaDe(chave);
  if (!r.resposta) throw new Error(`${chave} está sem resposta no contrato`);
  if (r.corpo && payload !== undefined) r.corpo.parse(payload);

  const res = await app.inject({
    method: r.metodo,
    url: r.caminho,
    headers: token ? com(token) : {},
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });
  expect(res.statusCode, `${chave} respondeu ${res.statusCode}: ${res.body}`).toBe(
    r.resposta.status,
  );
  if (!r.resposta.esquema) return { res, corpo: undefined };
  const lido = r.resposta.esquema.safeParse(res.json());
  expect(lido.success, `${chave}: ${lido.success ? "" : lido.error.message}`).toBe(true);
  return { res, corpo: lido.success ? lido.data : undefined };
}

type Sessao = { acesso: string; renovacao: string; usuario: { id: string } };
type Desafio = { segundoFator: "codigo" | "ativacao"; desafio: string };

const emailDe = (apelido: string) =>
  ({
    helena: "helena.coutinho@serraalta.exemplo.gov.br",
    jonas: "jonas.ferreira@serraalta.exemplo.gov.br",
    diego: "diego.alves@serraalta.exemplo.gov.br",
    rita: "rita.lopes@serraalta.exemplo.gov.br",
  })[apelido]!;

async function entrar(apelido: string, senha = SENHA) {
  return chamar("POST /v1/auth/entrar", { payload: { email: emailDe(apelido), senha } });
}

/** O código que o aplicativo mostraria naquele passo, para aquele segredo. */
function codigo(segredo: string, deslocamento = 0): string {
  const bytes = base32Decodificar(segredo);
  if (!bytes) throw new Error("segredo devolvido pela API não é base32");
  return codigoTotp(bytes, passoDe(new Date()) + deslocamento);
}

async function esquecerPassoGasto(usuarioId: string): Promise<void> {
  await mem.bruto.query("UPDATE segundo_fator SET ultimo_passo = NULL WHERE usuario_id = $1", [
    usuarioId,
  ]);
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-do-contrato-auth-com-mais-de-32-bytes",
    LOGIN_POR_IP: "10000",
    SEGUNDO_FATOR_ATIVO: "sim",
    SEGUNDO_FATOR_CHAVE: CHAVE_DO_COFRE,
    URL_PAINEL: "https://painel.exemplo.gov.br",
  } as NodeJS.ProcessEnv);

  app = await construirServidor({
    banco: mem.banco,
    config,
    notificador,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

beforeEach(() => {
  enviadas = [];
});

describe("entrada e sessão", () => {
  it("a recuperação diz se está ligada, sem token", async () => {
    const { corpo } = await chamar("GET /v1/auth/recuperacao");
    expect(corpo).toEqual({ ativa: true });
  });

  it("entrar devolve a sessão; eu, sessões e renovar usam a mesma forma", async () => {
    const { corpo } = await entrar("diego");
    const sessao = corpo as Sessao;
    expect(sessao.usuario.id).toBeTruthy();

    await chamar("GET /v1/auth/eu", { token: sessao.acesso });

    const sessoes = await chamar("GET /v1/auth/sessoes", { token: sessao.acesso });
    const itens = (sessoes.corpo as { itens: Array<{ atual: boolean }> }).itens;
    expect(itens.some((s) => s.atual)).toBe(true);

    const renovada = await chamar("POST /v1/auth/renovar", {
      payload: { renovacao: sessao.renovacao },
    });
    expect((renovada.corpo as Sessao).renovacao).not.toBe(sessao.renovacao);

    // Sair com o token de renovação novo: 204, e sem corpo.
    const saiu = await chamar("POST /v1/auth/sair", {
      payload: { renovacao: (renovada.corpo as Sessao).renovacao },
    });
    expect(saiu.res.body).toBe("");

    // E sair com um token que não existe responde igual (a rota não é oráculo).
    await chamar("POST /v1/auth/sair", { payload: { renovacao: "token-que-nao-existe" } });
  });

  it("trocar a senha devolve o token de acesso novo; encerrar sessões conta as outras", async () => {
    const primeira = (await entrar("jonas")).corpo as Sessao;
    // Uma segunda sessão da mesma conta, que a troca vai encerrar.
    await entrar("jonas");

    const encerradas = await chamar("POST /v1/auth/encerrar-sessoes", { token: primeira.acesso });
    expect((encerradas.corpo as { sessoesEncerradas: number }).sessoesEncerradas).toBe(1);

    const troca = await chamar("POST /v1/auth/trocar-senha", {
      token: primeira.acesso,
      payload: { senhaAtual: SENHA, senha: "outra-senha-longa-do-jonas" },
    });
    expect((troca.corpo as { acesso: string }).acesso).toBeTruthy();

    // A senha antiga deixou de valer: a recusa tem a forma de erro da API.
    const recusada = await app.inject({
      method: "POST",
      url: "/v1/auth/entrar",
      payload: { email: emailDe("jonas"), senha: SENHA },
    });
    expect(recusada.statusCode).toBe(401);
    expect(recusada.json().erro).toBe("credenciais");
  });
});

describe("recuperação de senha", () => {
  it("recuperar responde 202 com a mesma frase; redefinir responde 200 com a confirmação", async () => {
    const pedido = await chamar("POST /v1/auth/recuperar", {
      payload: { email: emailDe("diego") },
    });
    expect((pedido.corpo as { mensagem: string }).mensagem.length).toBeGreaterThan(10);
    expect(enviadas).toHaveLength(1);

    const link = enviadas[0]!.corpo.match(/https?:\/\/\S+/)![0];
    const token = decodeURIComponent(new URL(link).searchParams.get("token")!);

    await chamar("POST /v1/auth/redefinir", {
      payload: { token, senha: "senha-nova-do-diego-longa" },
    });

    // Nenhuma sessão nasce da redefinição: a pessoa entra de novo com a senha nova.
    await entrar("diego", "senha-nova-do-diego-longa");
  });
});

describe("verificação em duas etapas", () => {
  it("a situação, antes de ligar, diz que está disponível e desligada", async () => {
    const { acesso } = (await entrar("helena")).corpo as Sessao;
    const { corpo } = await chamar("GET /v1/segundo-fator", { token: acesso });
    expect(corpo).toMatchObject({ ativo: false, pendente: false, disponivel: true });
  });

  it("iniciar (com e sem corpo), confirmar, segunda etapa do login e desativar", async () => {
    const { acesso } = (await entrar("helena")).corpo as Sessao;

    // Sem corpo nenhum: o contrato diz que o corpo é opcional e a rota aceita.
    const semCorpo = await app.inject({
      method: "POST",
      url: "/v1/segundo-fator/iniciar",
      headers: com(acesso),
    });
    expect(semCorpo.statusCode).toBe(200);

    const iniciada = await chamar("POST /v1/segundo-fator/iniciar", {
      token: acesso,
      payload: {},
    });
    const segredoHelena = (iniciada.corpo as { segredo: string }).segredo;
    expect((iniciada.corpo as { uri: string }).uri.startsWith("otpauth://")).toBe(true);

    const confirmada = await chamar("POST /v1/segundo-fator/confirmar", {
      token: acesso,
      payload: { codigo: codigo(segredoHelena) },
    });
    const dados = confirmada.corpo as { codigosDeRecuperacao: string[]; sessao?: unknown };
    expect(dados.codigosDeRecuperacao.length).toBeGreaterThan(0);
    // Quem já tinha sessão não recebe outra.
    expect(dados.sessao).toBeUndefined();

    const ligada = await chamar("GET /v1/segundo-fator", { token: acesso });
    expect(ligada.corpo).toMatchObject({ ativo: true, pendente: false });
    expect((ligada.corpo as { codigosRestantes: number }).codigosRestantes).toBe(
      dados.codigosDeRecuperacao.length,
    );

    // O login agora devolve o DESAFIO, com a mesma rota de entrar.
    const desafiada = await entrar("helena");
    const desafio = desafiada.corpo as Desafio;
    expect(desafio.segundoFator).toBe("codigo");

    const sessao = await chamar("POST /v1/auth/segundo-fator", {
      payload: { desafio: desafio.desafio, codigo: dados.codigosDeRecuperacao[0]! },
    });
    expect(sessao.corpo).toMatchObject({
      entrouComCodigoDeRecuperacao: true,
      codigosDeRecuperacaoRestantes: dados.codigosDeRecuperacao.length - 1,
    });

    await chamar("POST /v1/segundo-fator/desativar", {
      token: (sessao.corpo as Sessao).acesso,
      payload: { senhaAtual: SENHA },
    });
  });

  it("o administrador liga pelo desafio de ativação e a confirmação traz a sessão", async () => {
    const entrada = await entrar("rita");
    const desafio = entrada.corpo as Desafio;
    expect(desafio.segundoFator).toBe("ativacao");

    const iniciada = await chamar("POST /v1/segundo-fator/iniciar", {
      payload: { desafio: desafio.desafio },
    });
    const segredo = (iniciada.corpo as { segredo: string }).segredo;

    const confirmada = await chamar("POST /v1/segundo-fator/confirmar", {
      payload: { desafio: desafio.desafio, codigo: codigo(segredo) },
    });
    const dados = confirmada.corpo as { sessao?: Sessao };
    expect(dados.sessao?.acesso).toBeTruthy();

    // A sessão que nasceu aqui abre as rotas autenticadas.
    const situacao = await chamar("GET /v1/segundo-fator", { token: dados.sessao!.acesso });
    expect(situacao.corpo).toMatchObject({ ativo: true, exigido: true });

    // E a segunda etapa de um login seguinte, pelo código do aplicativo.
    await esquecerPassoGasto(dados.sessao!.usuario.id);
    const outro = (await entrar("rita")).corpo as Desafio;
    expect(outro.segundoFator).toBe("codigo");
    const segunda = await chamar("POST /v1/auth/segundo-fator", {
      payload: { desafio: outro.desafio, codigo: codigo(segredo) },
    });
    expect(segunda.corpo).toMatchObject({ entrouComCodigoDeRecuperacao: false });
  });
});
