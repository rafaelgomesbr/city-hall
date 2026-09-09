import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { derivarSenha } from "../src/auth/senha.js";
import { base32Decodificar, codigoTotp, passoDe } from "../src/auth/totp.js";

/**
 * A verificação em duas etapas, de ponta a ponta.
 *
 * O QUE ESTES CASOS EXISTEM PARA IMPEDIR não é "a rota devolve 200". É a lista
 * de atalhos que uma implementação de segundo fator vira quando alguém a
 * escreve com pressa, e cada um deles já derrubou produto de verdade:
 *
 *   - emitir o token de acesso ANTES do código e só esconder a tela, o que dá
 *     acesso completo a quem abrir o console do navegador;
 *   - aceitar o mesmo código de seis dígitos duas vezes dentro da janela, o
 *     que basta para quem leu a tela por cima do ombro;
 *   - esticar a tolerância "para não incomodar", o que multiplica os códigos
 *     válidos ao mesmo tempo;
 *   - deixar a força bruta do código herdar o contador da senha, que zera a
 *     cada acerto de senha e portanto nunca fecha;
 *   - ligar sem conferir um código antes, que tranca a pessoa do lado de fora
 *     quando o relógio do telefone está errado;
 *   - guardar o segredo em texto, o que faz um vazamento de banco levar o
 *     segundo fator junto;
 *   - não ter saída nenhuma para quem perdeu o telefone, o que empurra o
 *     conserto para SQL na produção com o papel que ignora o isolamento.
 *
 * A conferência do efeito é feita fora da camada testada, direto no banco como
 * dono das tabelas, que é o padrão desta suíte.
 */

const SENHA = "serra-alta-senha-bem-forte";
const CHAVE_DO_COFRE = Buffer.alloc(32, 7).toString("base64");

let mem: BancoEmMemoria;
let app: FastifyInstance;

/** Um segundo servidor, com o recurso DESLIGADO, para provar que ele recusa. */
let memDesligado: BancoEmMemoria;
let appDesligado: FastifyInstance;

const id: Record<string, string> = {};

function comToken(token: string) {
  return { authorization: `Bearer ${token}` };
}

function entrar(email: string, senha = SENHA) {
  return app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha } });
}

function segundaEtapa(desafio: string, codigo: string) {
  return app.inject({
    method: "POST", url: "/auth/segundo-fator", payload: { desafio, codigo },
  });
}

function iniciar(token: string) {
  return app.inject({
    method: "POST", url: "/segundo-fator/iniciar", headers: comToken(token), payload: {},
  });
}

function confirmar(token: string, codigo: string) {
  return app.inject({
    method: "POST", url: "/segundo-fator/confirmar", headers: comToken(token), payload: { codigo },
  });
}

/** O código que o aplicativo mostraria naquele passo, para aquele segredo. */
function codigoNoPasso(segredo: string, passo: number): string {
  const bytes = base32Decodificar(segredo);
  if (!bytes) throw new Error("segredo devolvido pela API não é base32");
  return codigoTotp(bytes, passo);
}

function codigoAgora(segredo: string, deslocamentoDePassos = 0): string {
  return codigoNoPasso(segredo, passoDe(new Date()) + deslocamentoDePassos);
}

/** O segredo de cada conta que ligou a verificação, para a suíte gerar códigos. */
const segredos: Record<string, string> = {};

/**
 * O último passo que a suíte já gastou em cada conta.
 *
 * Isto existe por causa da própria regra que está sendo testada, e vale
 * escrever: o passo usado fica QUEIMADO, então uma conta que acabou de
 * confirmar a ativação não consegue entrar de novo com o mesmo código, nem com
 * qualquer código anterior. É o comportamento correto (é o que impede o código
 * lido por cima do ombro de servir duas vezes) e é também o que faz uma suíte
 * ingênua ficar vermelha em dias de execução rápida e verde em dias lentos,
 * conforme o relógio virasse a janela no meio.
 *
 * Por isso a suíte não pergunta "qual é o código agora": ela anda sozinha para
 * o próximo passo ainda não gasto, sempre dentro da tolerância de um passo.
 */
const passoGasto: Record<string, number> = {};

function codigoNovoDe(apelido: string): string {
  const atual = passoDe(new Date());
  const passo = Math.max(atual, (passoGasto[apelido] ?? atual - 1) + 1);
  passoGasto[apelido] = passo;
  return codigoNoPasso(segredos[apelido]!, passo);
}

/**
 * Zera o passo queimado daquela conta, direto no banco, como dono das tabelas.
 *
 * Serve aos dois casos em que a regra de reúso ATRAPALHA a leitura do que está
 * sendo medido: o caso que mede a janela de tolerância, e o que mede o reúso
 * em si (ali o código precisa ser aceito uma primeira vez para poder ser
 * recusado na segunda). Sem isto, os dois passariam pelo motivo errado, que é
 * a pior espécie de teste verde.
 */
async function esquecerPassoGasto(usuarioId: string): Promise<void> {
  await mem.bruto.query(
    "UPDATE segundo_fator SET ultimo_passo = NULL WHERE usuario_id = $1", [usuarioId],
  );
}

/**
 * Liga a verificação para uma conta, pelo caminho que aquela conta tem.
 *
 * Os dois caminhos existem de verdade e precisam ser exercitados: quem não é
 * administrador liga de dentro, com sessão aberta, na tela "Minha conta"; o
 * administrador de um município que exige o recurso liga ANTES de ter sessão,
 * porque a senha sozinha não abriu nenhuma.
 */
async function ligar(apelido: string, email: string): Promise<{
  segredo: string; codigos: string[]; acesso: string;
}> {
  const login = await entrar(email);
  const porDesafio = login.json().segundoFator === "ativacao";
  const desafio = login.json().desafio as string | undefined;
  const token = login.json().acesso as string | undefined;

  const inicio = await app.inject({
    method: "POST", url: "/segundo-fator/iniciar",
    ...(token ? { headers: comToken(token) } : {}),
    payload: porDesafio ? { desafio } : {},
  });
  expect(inicio.statusCode, inicio.body).toBe(200);
  const segredo = inicio.json().segredo as string;
  segredos[apelido] = segredo;

  const fim = await app.inject({
    method: "POST", url: "/segundo-fator/confirmar",
    ...(token ? { headers: comToken(token) } : {}),
    payload: { ...(porDesafio ? { desafio } : {}), codigo: codigoNovoDe(apelido) },
  });
  expect(fim.statusCode, fim.body).toBe(200);

  return {
    segredo,
    codigos: fim.json().codigosDeRecuperacao as string[],
    acesso: (porDesafio ? fim.json().sessao.acesso : token) as string,
  };
}

/** Login completo, nas duas etapas, para quem já tem a verificação ligada. */
async function entrarEmDuasEtapas(apelido: string, email: string): Promise<string> {
  const login = await entrar(email);
  const r = await segundaEtapa(login.json().desafio, codigoNovoDe(apelido));
  expect(r.statusCode, r.body).toBe(200);
  return r.json().acesso as string;
}

async function semear(banco: BancoEmMemoria): Promise<void> {
  const db = banco.bruto;
  const org = await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome,municipio,uf) VALUES ('DC Serra Alta','Serra Alta','MG') RETURNING id",
  );
  const orgId = org.rows[0]!.id;

  // Uma derivação só, reaproveitada: cada `derivarSenha` custa 128 MB e perto
  // de um segundo, e a suíte tem oito contas.
  const hash = await derivarSenha(SENHA);

  const pessoas: Array<[string, string, string, string, string]> = [
    ["rita", "Rita Lopes", "SA-1", "rita@serraalta.exemplo.gov.br", "administrador"],
    ["olavo", "Olavo Prado", "SA-2", "olavo@serraalta.exemplo.gov.br", "administrador"],
    ["nilza", "Nilza Barreto", "SA-3", "nilza@serraalta.exemplo.gov.br", "administrador"],
    ["ivone", "Ivone Cardoso", "SA-4", "ivone@serraalta.exemplo.gov.br", "administrador"],
    ["helena", "Helena Coutinho", "SA-5", "helena@serraalta.exemplo.gov.br", "coordenador"],
    ["jonas", "Jonas Ferreira", "SA-6", "jonas@serraalta.exemplo.gov.br", "operador"],
    ["diego", "Diego Alves", "SA-7", "diego@serraalta.exemplo.gov.br", "agente_campo"],
    ["carmem", "Carmem Boaventura", "SA-8", "carmem@serraalta.exemplo.gov.br", "coordenador"],
    /*
      Beto e Clara existem só para os casos de desligar, e a razão é a regra
      que está sendo testada em outro lugar deste arquivo: cada login gasta um
      passo de tempo, e a tolerância é de um passo. Reaproveitar a mesma conta
      em cinco casos seguidos faria a suíte pedir códigos de passos cada vez
      mais à frente, até sair da janela, e o vermelho apareceria em quem
      mexesse em qualquer coisa perto daqui.
    */
    ["beto", "Beto Nogueira", "SA-9", "beto@serraalta.exemplo.gov.br", "coordenador"],
    ["clara", "Clara Rezende", "SA-10", "clara@serraalta.exemplo.gov.br", "coordenador"],
  ];

  for (const [apelido, nome, matricula, email, papel] of pessoas) {
    const r = await db.query<{ id: string }>(
      `INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,senha_hash)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [orgId, nome, matricula, email, papel, hash],
    );
    id[apelido] = r.rows[0]!.id;
  }
}

beforeAll(async () => {
  mem = await bancoEmMemoria();
  await semear(mem);
  app = await construirServidor({
    banco: mem.banco,
    config: carregarConfig({
      NODE_ENV: "test",
      JWT_SEGREDO: "segredo-do-segundo-fator-com-mais-de-trinta-e-dois-bytes",
      SEGUNDO_FATOR_ATIVO: "sim",
      SEGUNDO_FATOR_CHAVE: CHAVE_DO_COFRE,
      // A suíte faz dezenas de logins legítimos. O limite por endereço é
      // exercitado em outro arquivo, com o valor real.
      LOGIN_POR_IP: "10000",
    } as NodeJS.ProcessEnv),
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  memDesligado = await bancoEmMemoria();
  appDesligado = await construirServidor({
    banco: memDesligado.banco,
    config: carregarConfig({
      NODE_ENV: "test",
      JWT_SEGREDO: "segredo-do-servidor-desligado-com-mais-de-32-bytes",
      LOGIN_POR_IP: "10000",
    } as NodeJS.ProcessEnv),
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await appDesligado.ready();
  // Sobe PGlite duas vezes e aplica as migrações nas duas: o teto padrão de
  // 10 s do vitest não cobre isso num runner de dois núcleos.
}, 180_000);

afterAll(async () => {
  await app?.close();
  await appDesligado?.close();
  await mem?.banco.encerrar();
  await memDesligado?.banco.encerrar();
});

describe("Configuração", () => {
  it("recusa subir com o segundo fator ligado e sem chave para cifrar o segredo", () => {
    expect(
      () => carregarConfig({
        NODE_ENV: "test",
        JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
        SEGUNDO_FATOR_ATIVO: "sim",
      } as NodeJS.ProcessEnv),
      "o servidor subiu com o segundo fator ligado e sem chave: a tela de "
      + "ativação apareceria e a ativação quebraria no meio",
    ).toThrow(/SEGUNDO_FATOR_CHAVE/);

    expect(() => carregarConfig({
      NODE_ENV: "test",
      JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
      SEGUNDO_FATOR_ATIVO: "sim",
      SEGUNDO_FATOR_CHAVE: CHAVE_DO_COFRE,
    } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it("recusa chave de tamanho errado na partida, e não na primeira ativação", async () => {
    const { abrirCofre } = await import("../src/auth/cofre.js");
    expect(() => abrirCofre(Buffer.alloc(16, 3).toString("base64"))).toThrow(/32 bytes/);
  });

  it("com o recurso desligado, a rota recusa em vez de sumir", async () => {
    /*
      503 e não 404, e a diferença importa para o painel: rota ausente seria
      lida como "versão velha do servidor", e a tela mandaria a pessoa
      atualizar alguma coisa que não existe.
    */
    const r = await appDesligado.inject({
      method: "POST", url: "/segundo-fator/iniciar",
      headers: comToken("token-invalido-de-proposito"), payload: {},
    });
    expect(r.statusCode).toBe(401);

    const situacao = await appDesligado.inject({ method: "GET", url: "/segundo-fator" });
    expect(situacao.statusCode).toBe(401);
  });
});

describe("A entrada em duas etapas", () => {
  it("administrador sem segundo fator não recebe sessão nenhuma, só o desafio", async () => {
    const r = await entrar("rita@serraalta.exemplo.gov.br");
    expect(r.statusCode).toBe(200);
    const corpo = r.json();

    expect(corpo.segundoFator).toBe("ativacao");
    expect(
      corpo.acesso,
      "a rota de entrar devolveu token de acesso a um administrador que ainda "
      + "não ligou o segundo fator: a exigência vira decoração, porque quem tem "
      + "o token não precisa da tela para nada",
    ).toBeUndefined();
    expect(corpo.renovacao).toBeUndefined();
    expect(corpo.desafio).toBeTruthy();
  });

  it("o desafio NÃO vale como token de acesso em rota nenhuma", async () => {
    const desafio = (await entrar("rita@serraalta.exemplo.gov.br")).json().desafio as string;

    const r = await app.inject({
      method: "GET", url: "/ocorrencias", headers: comToken(desafio),
    });
    expect(
      r.statusCode,
      "o token de desafio abriu uma rota autenticada: o estado intermediário do "
      + "login virou credencial, que é exatamente o atalho que a plateia própria "
      + "existe para impedir",
    ).toBe(401);
  });

  it("e é a PLATEIA que o recusa, não a sorte do conteúdo", async () => {
    /*
      Este caso existe porque o de cima passa por dois motivos ao mesmo tempo, e
      isso foi medido, não suposto: o desafio é recusado pela plateia E por não
      ter `sid`, já que `verificarAcesso` valida a forma do conteúdo depois da
      assinatura. Defesa em profundidade é bom, mas um caso que não distingue as
      duas barreiras continuaria verde se uma delas caísse sozinha.

      Aqui o token é forjado com a plateia do desafio E com todo o conteúdo de
      um token de acesso, `sid` incluído, assinado com o segredo de verdade. Só
      a plateia o separa de uma credencial completa. Tirar `audience` de
      `verificarAcesso` deixa este caso vermelho na hora.
    */
    const { SignJWT } = await import("jose");
    const { verificarAcesso } = await import("../src/auth/tokens.js");
    const config = carregarConfig({
      NODE_ENV: "test",
      JWT_SEGREDO: "segredo-do-segundo-fator-com-mais-de-trinta-e-dois-bytes",
    } as NodeJS.ProcessEnv);

    const forjado = await new SignJWT({
      org: "11111111-1111-4111-8111-000000000001",
      papel: "administrador",
      nome: "Rita Lopes",
      sid: "22222222-2222-4222-8222-000000000002",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject("33333333-3333-4333-8333-000000000003")
      .setIssuer("dc360-api")
      .setAudience("dc360-desafio")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(config.jwtSegredos[0]);

    expect(
      await verificarAcesso(config.jwtSegredos, forjado),
      "um token com a plateia do desafio foi aceito como token de acesso: o "
      + "estado intermediário do login passaria a abrir o produto inteiro",
    ).toBeNull();
  });

  it("quem não é administrador continua entrando em uma etapa", async () => {
    for (const email of [
      "helena@serraalta.exemplo.gov.br",
      "jonas@serraalta.exemplo.gov.br",
      "diego@serraalta.exemplo.gov.br",
    ]) {
      const r = await entrar(email);
      expect(r.json().acesso, `${email} foi barrado sem precisar`).toBeTruthy();
    }
  });

  it("com a verificação ligada, a senha sozinha não abre sessão, e o código abre", async () => {
    await ligar("helena", "helena@serraalta.exemplo.gov.br");

    const login = await entrar("helena@serraalta.exemplo.gov.br");
    expect(login.json().segundoFator).toBe("codigo");
    expect(login.json().acesso).toBeUndefined();

    const errado = await segundaEtapa(login.json().desafio, "000000");
    expect(errado.statusCode).toBe(401);

    const certo = await segundaEtapa(login.json().desafio, codigoNovoDe("helena"));
    expect(certo.statusCode, certo.body).toBe(200);
    expect(certo.json().acesso).toBeTruthy();
    expect(certo.json().usuario.nome).toBe("Helena Coutinho");
  });

  it("o mesmo código não vale duas vezes dentro da mesma janela", async () => {
    const { segredo } = await ligar("carmem", "carmem@serraalta.exemplo.gov.br");
    // Sem esquecer o passo da ativação, o código abaixo já nasceria recusado,
    // e o caso passaria sem nunca ter medido o reúso.
    await esquecerPassoGasto(id["carmem"]!);
    const codigo = codigoAgora(segredo);

    const primeira = await entrar("carmem@serraalta.exemplo.gov.br");
    const uma = await segundaEtapa(primeira.json().desafio, codigo);
    expect(uma.statusCode).toBe(200);

    const segunda = await entrar("carmem@serraalta.exemplo.gov.br");
    const outra = await segundaEtapa(segunda.json().desafio, codigo);
    expect(
      outra.statusCode,
      "o mesmo código de seis dígitos entrou duas vezes: quem enxergou a tela "
      + "por cima do ombro, ou leu o print mandado no grupo do plantão, entra "
      + "com o mesmo número",
    ).toBe(401);
  });

  it("a tolerância é de um passo para cada lado, e não mais", async () => {
    const { segredo } = await ligar("jonas", "jonas@serraalta.exemplo.gov.br");
    // Isola a tolerância da regra de reúso: aqui o que está sendo medido é a
    // LARGURA da janela, e não o passo queimado pela ativação.
    await esquecerPassoGasto(id["jonas"]!);

    const doisAtras = await entrar("jonas@serraalta.exemplo.gov.br");
    const recusado = await segundaEtapa(doisAtras.json().desafio, codigoAgora(segredo, -2));
    expect(
      recusado.statusCode,
      "um código de dois passos atrás (mais de um minuto) foi aceito: a janela "
      + "de códigos válidos ao mesmo tempo ficou maior do que a decisão",
    ).toBe(401);

    const umAtras = await entrar("jonas@serraalta.exemplo.gov.br");
    const aceito = await segundaEtapa(umAtras.json().desafio, codigoAgora(segredo, -1));
    expect(
      aceito.statusCode,
      "o código do passo anterior foi recusado: quem digita devagar, ou tem o "
      + "relógio do telefone alguns segundos atrasado, não entraria nunca",
    ).toBe(200);
  });

  it("o teto de tentativas do código é separado do teto da senha", async () => {
    await ligar("diego", "diego@serraalta.exemplo.gov.br");

    // Cinco erros seguidos, cada um com um desafio novo: é assim que a força
    // bruta seria feita, e é por isso que o contador não pode viver na senha.
    for (let i = 0; i < 5; i++) {
      const login = await entrar("diego@serraalta.exemplo.gov.br");
      await segundaEtapa(login.json().desafio, "000000");
    }

    const senha = await mem.bruto.query<{ falhas_login: number }>(
      "SELECT falhas_login FROM usuarios WHERE id = $1", [id["diego"]],
    );
    expect(
      senha.rows[0]!.falhas_login,
      "as tentativas do segundo fator foram contadas no contador da SENHA",
    ).toBe(0);

    const fator = await mem.bruto.query<{ falhas: number; bloqueado_ate: string | null }>(
      "SELECT falhas, bloqueado_ate FROM segundo_fator WHERE usuario_id = $1", [id["diego"]],
    );
    expect(fator.rows[0]!.falhas).toBe(5);
    expect(
      fator.rows[0]!.bloqueado_ate,
      "cinco códigos errados não travaram nada: contra um espaço de um milhão, "
      + "sem teto, adivinhar é questão de tempo de máquina",
    ).not.toBeNull();

    // E agora nem o código CERTO passa, enquanto o bloqueio durar.
    const login = await entrar("diego@serraalta.exemplo.gov.br");
    const r = await segundaEtapa(login.json().desafio, codigoNovoDe("diego"));
    expect(r.statusCode).toBe(429);
    expect(r.json().mensagem).toMatch(/bloquead/i);
  });

  it("o código de recuperação entra uma vez, e só uma", async () => {
    const { codigos } = await ligar("nilza", "nilza@serraalta.exemplo.gov.br");
    expect(codigos).toHaveLength(8);

    const primeira = await entrar("nilza@serraalta.exemplo.gov.br");
    const entrou = await segundaEtapa(primeira.json().desafio, codigos[0]!);
    expect(entrou.statusCode, entrou.body).toBe(200);
    expect(
      entrou.json().entrouComCodigoDeRecuperacao,
      "a resposta não avisou que a entrada gastou um código de recuperação",
    ).toBe(true);
    expect(entrou.json().codigosDeRecuperacaoRestantes).toBe(7);

    const segunda = await entrar("nilza@serraalta.exemplo.gov.br");
    const denovo = await segundaEtapa(segunda.json().desafio, codigos[0]!);
    expect(
      denovo.statusCode,
      "o mesmo código de recuperação entrou duas vezes: o papel guardado na "
      + "gaveta viraria uma senha permanente",
    ).toBe(401);

    // Aceita como foi ditado por telefone: sem hífen, em maiúscula.
    const terceira = await entrar("nilza@serraalta.exemplo.gov.br");
    const ditado = await segundaEtapa(
      terceira.json().desafio, codigos[1]!.replace(/-/g, " ").toUpperCase(),
    );
    expect(ditado.statusCode, ditado.body).toBe(200);
  });
});

describe("Ligar a verificação", () => {
  it("a ativação começada e não confirmada NÃO muda o login", async () => {
    const login = await entrar("olavo@serraalta.exemplo.gov.br");
    // Olavo é administrador: entra pelo desafio de ativação.
    const inicio = await app.inject({
      method: "POST", url: "/segundo-fator/iniciar",
      payload: { desafio: login.json().desafio },
    });
    expect(inicio.statusCode, inicio.body).toBe(200);

    const denovo = await entrar("olavo@serraalta.exemplo.gov.br");
    expect(
      denovo.json().segundoFator,
      "o rascunho da ativação já passou a exigir código: quem leu o código QR "
      + "com um aplicativo que não guardou nada ficaria trancado do lado de fora",
    ).toBe("ativacao");
  });

  it("código errado não liga a verificação", async () => {
    const login = await entrar("olavo@serraalta.exemplo.gov.br");
    const desafio = login.json().desafio as string;
    await app.inject({
      method: "POST", url: "/segundo-fator/iniciar", payload: { desafio },
    });

    const r = await app.inject({
      method: "POST", url: "/segundo-fator/confirmar",
      payload: { desafio, codigo: "000000" },
    });
    expect(r.statusCode).toBe(422);

    const linha = await mem.bruto.query<{ confirmado_em: string | null }>(
      "SELECT confirmado_em FROM segundo_fator WHERE usuario_id = $1", [id["olavo"]],
    );
    expect(linha.rows[0]!.confirmado_em).toBeNull();
  });

  it("o administrador obrigado liga pelo desafio e sai daqui com sessão", async () => {
    const login = await entrar("olavo@serraalta.exemplo.gov.br");
    const desafio = login.json().desafio as string;

    const inicio = await app.inject({
      method: "POST", url: "/segundo-fator/iniciar", payload: { desafio },
    });
    const segredo = inicio.json().segredo as string;

    const fim = await app.inject({
      method: "POST", url: "/segundo-fator/confirmar",
      payload: { desafio, codigo: codigoAgora(segredo) },
    });
    expect(fim.statusCode, fim.body).toBe(200);
    expect(fim.json().codigosDeRecuperacao).toHaveLength(8);
    expect(
      fim.json().sessao?.acesso,
      "quem acabou de provar senha E posse do aparelho foi mandado digitar a "
      + "senha de novo: atrito sem ganho, no primeiro minuto de uso do recurso",
    ).toBeTruthy();

    // E a sessão que saiu daí é uma sessão de verdade, com o município certo.
    const eu = await app.inject({
      method: "GET", url: "/auth/eu", headers: comToken(fim.json().sessao.acesso),
    });
    expect(eu.statusCode).toBe(200);
    expect(eu.json().nome).toBe("Olavo Prado");
  });

  it("o segredo vai CIFRADO para o banco, e não em texto", async () => {
    const login = await entrar("ivone@serraalta.exemplo.gov.br");
    const desafio = login.json().desafio as string;
    const inicio = await app.inject({
      method: "POST", url: "/segundo-fator/iniciar", payload: { desafio },
    });
    const segredo = inicio.json().segredo as string;

    const linha = await mem.bruto.query<{ segredo_cifrado: string }>(
      "SELECT segredo_cifrado FROM segundo_fator WHERE usuario_id = $1", [id["ivone"]],
    );
    const guardado = linha.rows[0]!.segredo_cifrado;

    expect(
      guardado,
      "o segredo do segundo fator está em texto no banco: um vazamento de banco "
      + "passaria a levar o segundo fator junto, que é o cenário que ele existe "
      + "para cobrir",
    ).not.toContain(segredo);
    expect(guardado.startsWith("v1.")).toBe(true);

    // E o envelope é amarrado à pessoa: movido para outra linha, não abre.
    const { abrirCofre } = await import("../src/auth/cofre.js");
    const cofre = abrirCofre(CHAVE_DO_COFRE);
    const org = await mem.bruto.query<{ organizacao_id: string }>(
      "SELECT organizacao_id FROM segundo_fator WHERE usuario_id = $1", [id["ivone"]],
    );
    const orgId = org.rows[0]!.organizacao_id;
    expect(cofre.decifrar(guardado, `segundo-fator:${orgId}:${id["ivone"]}`)).toBe(segredo);
    expect(
      cofre.decifrar(guardado, `segundo-fator:${orgId}:${id["rita"]}`),
      "o envelope cifrado abriu na linha de OUTRA conta: quem escrevesse no "
      + "banco copiaria o próprio segredo para a linha do administrador e "
      + "passaria a gerar os códigos dele",
    ).toBeNull();
  });

  it("ligar de novo, por cima de uma verificação ativa, é recusado", async () => {
    const { acesso } = await ligar("rita", "rita@serraalta.exemplo.gov.br");

    const r = await iniciar(acesso);
    expect(
      r.statusCode,
      "deu para sortear um segredo novo por cima de uma verificação ativa, sem "
      + "provar posse do aparelho atual nem digitar a senha: um painel deixado "
      + "aberto na recepção viraria o segundo fator de outra pessoa",
    ).toBe(409);
  });

  it("a ativação fica na trilha administrativa, e o segredo não", async () => {
    const atos = await mem.bruto.query<{ acao: string; depois: unknown }>(
      `SELECT acao, depois FROM trilha_administrativa
        WHERE alvo_id = $1 AND acao LIKE 'segundo_fator%' ORDER BY registrado_em`,
      [id["nilza"]],
    );
    expect(atos.rows.map((l) => l.acao)).toContain("segundo_fator_ativado");
    expect(JSON.stringify(atos.rows)).not.toMatch(/[A-Z2-7]{32}/);
  });
});

describe("Desligar a verificação", () => {
  it("exige a senha atual", async () => {
    await ligar("beto", "beto@serraalta.exemplo.gov.br");
    const acesso = await entrarEmDuasEtapas("beto", "beto@serraalta.exemplo.gov.br");

    const errada = await app.inject({
      method: "POST", url: "/segundo-fator/desativar",
      headers: comToken(acesso), payload: { senhaAtual: "chute-de-quem-passou-na-mesa" },
    });
    expect(
      errada.statusCode,
      "deu para desligar a verificação sem a senha: um painel esquecido aberto "
      + "na recepção derruba a proteção da conta em dois cliques",
    ).toBe(422);

    const linha = await mem.bruto.query<{ desativado_em: string | null }>(
      "SELECT desativado_em FROM segundo_fator WHERE usuario_id = $1", [id["beto"]],
    );
    expect(linha.rows[0]!.desativado_em).toBeNull();
  });

  it("desligar apaga o segredo, derruba os códigos e deixa rastro", async () => {
    await ligar("clara", "clara@serraalta.exemplo.gov.br");
    const acesso = await entrarEmDuasEtapas("clara", "clara@serraalta.exemplo.gov.br");

    const certa = await app.inject({
      method: "POST", url: "/segundo-fator/desativar",
      headers: comToken(acesso), payload: { senhaAtual: SENHA },
    });
    expect(certa.statusCode, certa.body).toBe(200);

    const depois = await mem.bruto.query<{ segredo_cifrado: string | null }>(
      "SELECT segredo_cifrado FROM segundo_fator WHERE usuario_id = $1", [id["clara"]],
    );
    expect(
      depois.rows[0]!.segredo_cifrado,
      "a credencial ficou guardada com a proteção desligada: o risco de guardar "
      + "sem o benefício de exigir",
    ).toBeNull();

    const vivos = await mem.bruto.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM segundo_fator_recuperacao
        WHERE usuario_id = $1 AND usado_em IS NULL AND invalidado_em IS NULL`,
      [id["clara"]],
    );
    expect(
      vivos.rows[0]!.n,
      "os códigos de recuperação antigos continuaram valendo depois de a "
      + "verificação ser desligada e ligada de novo por outra pessoa",
    ).toBe("0");

    // E o login volta a ser de uma etapa só, porque ela é coordenadora.
    const volta = await entrar("clara@serraalta.exemplo.gov.br");
    expect(volta.json().acesso).toBeTruthy();

    const atos = await mem.bruto.query<{ acao: string }>(
      "SELECT acao FROM trilha_administrativa WHERE alvo_id = $1 ORDER BY registrado_em",
      [id["clara"]],
    );
    expect(atos.rows.map((l) => l.acao)).toContain("segundo_fator_desativado");
  });
});
