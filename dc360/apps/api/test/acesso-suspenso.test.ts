import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { derivarSenha } from "../src/auth/senha.js";

/**
 * O acesso suspenso pelo fornecedor.
 *
 * O console do fornecedor pode suspender o acesso de uma prefeitura, e a
 * suspensão é reversível: é o estado de "contrato em discussão", não o de
 * "município que saiu". O console só escreve a intenção no banco
 * (`organizacoes.acesso_suspenso_em`) e revoga as sessões; quem faz a
 * suspensão VALER é a API, porque é ela que atende o painel e o aparelho.
 *
 * O QUE ESTE ARQUIVO GUARDA, caso a caso:
 *
 *   - Entrar num município suspenso responde 403 `acesso_suspenso`, e NUNCA
 *     401: 401 é "credencial errada", e a credencial está certa. Quem lê 401
 *     vai trocar a senha, ligar para o suporte, tentar de novo; nada disso
 *     resolve, e a mensagem certa manda procurar quem administra o contrato.
 *   - A suspensão só é revelada a quem provou a senha. Senha errada num
 *     município suspenso recebe a mesma resposta genérica de sempre, senão a
 *     rota vira oráculo de quais prefeituras estão em discussão contratual.
 *   - Sessão viva de município suspenso: renovar recusa com 403 mesmo que a
 *     sessão ainda exista no banco. O console revoga as sessões, e a API não
 *     depende disso.
 *   - Token de acesso vivo: ESCRITA recusa na hora (403), LEITURA vive até o
 *     token expirar. A razão está escrita em `auth/suspensao.ts`.
 *   - Token de acesso VENCIDO de município suspenso responde 403, e não 401.
 *     É isso que permite ao aplicativo de campo distinguir "sua sessão
 *     terminou, entre de novo" de "o município está suspenso, e entrar de novo
 *     não vai adiantar", para sempre, e não só nos quinze minutos do token.
 *   - As rotas que a FILA do aparelho chama recusam com 503, e não 403: 4xx é
 *     falha permanente para a fila, e falha permanente vira item bloqueado,
 *     com botão de descartar embaixo de uma vistoria feita no morro. 503 é
 *     temporário, a fila espera, e a coleta sobe sozinha se o acesso voltar.
 */

const SENHA = "serra-alta-senha-forte";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let orgA: string;
let orgB: string;
let ocorrenciaA: string;
const SEGREDO = "segredo-do-acesso-suspenso-com-mais-de-32-bytes";

const EMAIL_A = "helena@serraalta.exemplo.gov.br";
const EMAIL_AGENTE_A = "diego@serraalta.exemplo.gov.br";
const EMAIL_B = "aurelio@valefundo.exemplo.gov.br";

async function semear(): Promise<void> {
  const db = mem.bruto;
  const a = await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome,municipio,uf) VALUES ('DC Serra Alta','Serra Alta','MG') RETURNING id",
  );
  const b = await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome,municipio,uf) VALUES ('DC Vale Fundo','Vale Fundo','MG') RETURNING id",
  );
  orgA = a.rows[0]!.id;
  orgB = b.rows[0]!.id;

  const hash = await derivarSenha(SENHA);
  await db.query(
    `INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,senha_hash)
     VALUES ($1,'Helena Coutinho','SA-1',$2,'coordenador',$3),
            ($1,'Diego Alves','SA-3',$6,'agente_campo',$3),
            ($4,'Aurelio Machado','VF-1',$5,'coordenador',$3)`,
    [orgA, EMAIL_A, hash, orgB, EMAIL_B, EMAIL_AGENTE_A],
  );

  const oc = await db.query<{ id: string }>(
    `INSERT INTO ocorrencias (organizacao_id,protocolo,tipo,status,endereco,solicitante_nome,canal_entrada,descricao)
     VALUES ($1,'000001/2026','deslizamento','registrada','Rua das Acacias, 245','Marilda','telefone','Talude cedeu')
     RETURNING id`,
    [orgA],
  );
  ocorrenciaA = oc.rows[0]!.id;
}

/**
 * Suspende como dono das tabelas, escrevendo as colunas que o console escreve
 * pela função `console_suspender_municipio` (migração 038). Direto na tabela,
 * e não pela função, porque ela exige operador do console no contexto, e o
 * que está em teste aqui é o que a API faz com o ESTADO, venha ele de onde
 * vier. O gatilho da 038 deixa o dono escrever; o papel de aplicação, não.
 */
async function suspender(org: string): Promise<void> {
  await mem.bruto.query(
    "UPDATE organizacoes SET acesso_suspenso_em = now(), suspensao_motivo = 'contrato em discussao' WHERE id = $1",
    [org],
  );
}

async function reativar(org: string): Promise<void> {
  await mem.bruto.query(
    `UPDATE organizacoes
        SET eliminada_em = NULL, eliminacao_agendada_para = NULL,
            acesso_suspenso_em = NULL, suspensao_motivo = NULL
      WHERE id = $1`,
    [org],
  );
}

function tentarEntrar(email: string, senha: string) {
  return app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha } });
}

async function entrar(email: string): Promise<{ acesso: string; renovacao: string }> {
  const r = await tentarEntrar(email, SENHA);
  if (r.statusCode !== 200) throw new Error(`login falhou (${r.statusCode}): ${r.body}`);
  return { acesso: r.json().acesso, renovacao: r.json().renovacao };
}

function comToken(token: string) {
  return { authorization: `Bearer ${token}` };
}

/**
 * Um token de acesso AUTÊNTICO e já vencido: mesma assinatura, mesmo emissor,
 * mesma plateia, `exp` no passado. É o que o aparelho apresenta depois de a
 * renovação falhar (ver `criarObtentorDeToken` no aplicativo: ele devolve o
 * token que tem, e deixa o servidor dizer não).
 */
async function tokenVencido(org: string, usuarioId: string): Promise<string> {
  const agora = Math.floor(Date.now() / 1000);
  return new SignJWT({
    org, papel: "coordenador", nome: "Helena Coutinho",
    sid: "00000000-0000-4000-8000-000000000000",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(usuarioId)
    .setIssuer("dc360-api")
    .setAudience("dc360")
    .setIssuedAt(agora - 1200)
    .setExpirationTime(agora - 300)
    .sign(new TextEncoder().encode(SEGREDO));
}

async function usuarioDe(email: string): Promise<string> {
  const r = await mem.bruto.query<{ id: string }>("SELECT id FROM usuarios WHERE email = $1", [email]);
  return r.rows[0]!.id;
}

beforeAll(async () => {
  mem = await bancoEmMemoria();
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: SEGREDO,
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
  });
  await app.ready();
  await semear();
}, 300_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

beforeEach(async () => {
  await reativar(orgA);
  await reativar(orgB);
});

describe("Entrar num municipio suspenso", () => {
  it("recusa com 403 acesso_suspenso, com a mensagem que manda procurar o contrato", async () => {
    await suspender(orgA);

    const r = await tentarEntrar(EMAIL_A, SENHA);

    expect(r.statusCode, r.body).toBe(403);
    expect(r.json().erro).toBe("acesso_suspenso");
    expect(r.json().mensagem).toMatch(/suspenso pelo fornecedor/i);
    expect(r.json().mensagem).toMatch(/contrato/i);
    // Nenhum token sai de uma entrada recusada.
    expect(r.json().acesso).toBeUndefined();
    expect(r.json().renovacao).toBeUndefined();
  });

  it("nunca responde 401: a credencial esta certa, o que falta e o contrato", async () => {
    await suspender(orgA);
    const r = await tentarEntrar(EMAIL_A, SENHA);
    expect(r.statusCode).not.toBe(401);
  });

  it("senha errada em municipio suspenso recebe a resposta generica, sem revelar a suspensao", async () => {
    /*
      A resposta de "email ou senha inválidos" é idêntica para email inexistente
      e senha errada, de propósito, para a rota não virar lista de emails da
      prefeitura. A suspensão não pode abrir uma terceira resposta antes de a
      senha conferir, senão qualquer pessoa descobre quais prefeituras estão em
      discussão contratual digitando um email e uma senha qualquer.
    */
    await suspender(orgA);
    const r = await tentarEntrar(EMAIL_A, "senha-errada-de-proposito");
    expect(r.statusCode).toBe(401);
    expect(r.json().erro).toBe("credenciais");
    expect(r.body).not.toMatch(/suspens/i);
  });

  it("nao mexe no ultimo acesso nem zera o contador: a pessoa nao entrou", async () => {
    await suspender(orgA);
    await tentarEntrar(EMAIL_A, SENHA);
    const u = await mem.bruto.query<{ ultimo_acesso: string | null }>(
      "SELECT ultimo_acesso FROM usuarios WHERE email = $1", [EMAIL_A],
    );
    expect(u.rows[0]!.ultimo_acesso).toBeNull();
  });

  it("o municipio vizinho continua entrando normalmente", async () => {
    await suspender(orgA);
    const r = await tentarEntrar(EMAIL_B, SENHA);
    expect(r.statusCode, r.body).toBe(200);
  });

  it("reativar devolve a entrada: a suspensao e reversivel", async () => {
    await suspender(orgA);
    expect((await tentarEntrar(EMAIL_A, SENHA)).statusCode).toBe(403);
    await reativar(orgA);
    expect((await tentarEntrar(EMAIL_A, SENHA)).statusCode).toBe(200);
  });

  it("municipio ja eliminado do banco, com a linha ainda de pe, tambem nao entra", async () => {
    /*
      Entre a eliminação das linhas de negócio e a purga do armazenamento, a
      linha de `organizacoes` continua existindo. As contas foram apagadas junto
      com o resto, então este caso é teórico para o login; ele existe porque a
      mesma pergunta ("este município pode usar o sistema?") é feita pelo token
      de acesso, e ali a conta não precisa existir para o token ser válido.
    */
    // A ordem que o banco cobra: suspensa, agendada, e só então eliminada.
    await suspender(orgA);
    await mem.bruto.query(
      "UPDATE organizacoes SET eliminacao_agendada_para = now() - interval '1 day', eliminada_em = now() WHERE id = $1",
      [orgA],
    );
    const r = await tentarEntrar(EMAIL_A, SENHA);
    expect(r.statusCode).toBe(403);
    expect(r.json().erro).toBe("acesso_suspenso");
  });
});

describe("A barreira do banco, quando a da API nao alcanca", () => {
  it("abrir_sessao recusando com DC367 vira 403 acesso_suspenso, e nao 500", async () => {
    /*
      `abrir_sessao` (migração 038) recusa sessão de município suspenso por
      conta própria. A API confere antes, então o caminho comum nem chega lá;
      este caso força o caminho raro (a suspensão entrando entre a conferência
      e a abertura) chamando a função direto, como a API a chama, e cobra que
      o erro que sai dela é o que a rota de entrar traduz para 403.
    */
    await suspender(orgA);
    const usuario = await usuarioDe(EMAIL_A);
    let codigo: string | undefined;
    try {
      await mem.banco.semTenant((c) =>
        c.query("SELECT abrir_sessao($1,$2,$3,$4::interval,$5,$6)", [
          orgA, usuario, "hash-qualquer", "1 day", null, null,
        ]),
      );
    } catch (erro) {
      codigo = (erro as { code?: string }).code;
    }
    expect(codigo, "o banco deixou abrir sessao de municipio suspenso").toBe("DC367");

    // A tradução: o mesmo erro, saindo de uma rota, vira acesso_suspenso.
    const outro = await construirServidor({
      banco: mem.banco,
      config: carregarConfig({
        NODE_ENV: "test", JWT_SEGREDO: SEGREDO,
      } as NodeJS.ProcessEnv),
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
    });
    outro.get("/teste-dc367", async () => {
      throw Object.assign(
        new Error("O acesso deste municipio esta suspenso pelo fornecedor."),
        { code: "DC367" },
      );
    });
    await outro.ready();
    try {
      const r = await outro.inject({ method: "GET", url: "/teste-dc367" });
      expect(r.statusCode).toBe(403);
      expect(r.json().erro).toBe("acesso_suspenso");
      expect(r.json().mensagem).toMatch(/suspenso pelo fornecedor/i);
    } finally {
      await outro.close();
    }
  });
});

describe("Sessao viva de municipio suspenso", () => {
  it("renovar recusa com 403 mesmo com a sessao ainda de pe no banco", async () => {
    /*
      O console revoga as sessões ao suspender. A API não confia nisso: se a
      revogação falhar, ou se alguém suspender por outro caminho, a renovação
      continua sendo recusada, e pelo motivo certo. Sem esta conferência a
      sessão de renovação (que vive dias) reemitiria tokens de acesso por todo
      o prazo dela.
    */
    const tokens = await entrar(EMAIL_A);
    await suspender(orgA);

    const r = await app.inject({
      method: "POST", url: "/auth/renovar", payload: { renovacao: tokens.renovacao },
    });
    expect(r.statusCode, r.body).toBe(403);
    expect(r.json().erro).toBe("acesso_suspenso");
    expect(r.json().acesso).toBeUndefined();
  });

  it("renovar com a sessao ja revogada pelo console responde 401 sessao_encerrada, e entrar de novo diz 403", async () => {
    // O caminho comum: `console_suspender_municipio` (038, 049) escreve a
    // suspensão E revoga as sessões. A sessão revogada é encerrada como outra
    // qualquer; quem diz "suspenso" é o pedido seguinte (`auth/suspensao.ts`).
    const tokens = await entrar(EMAIL_A);
    await suspender(orgA);
    await mem.bruto.query(
      `UPDATE sessoes SET revogada_em = now(), motivo_revogacao = 'acesso suspenso pelo fornecedor'
        WHERE organizacao_id = $1 AND revogada_em IS NULL`,
      [orgA],
    );

    const r = await app.inject({
      method: "POST", url: "/auth/renovar", payload: { renovacao: tokens.renovacao },
    });
    expect(r.statusCode, r.body).toBe(401);
    expect(r.json().erro).toBe("sessao_encerrada");
    const deNovo = await tentarEntrar(EMAIL_A, SENHA);
    expect(deNovo.statusCode, deNovo.body).toBe(403);
    expect(deNovo.json().erro).toBe("acesso_suspenso");
  });

  it("token de acesso vivo: escrita recusa na hora, com 403", async () => {
    const tokens = await entrar(EMAIL_A);
    await suspender(orgA);

    const r = await app.inject({
      method: "POST", url: "/ocorrencias", headers: comToken(tokens.acesso),
      payload: {
        tipo: "alagamento", endereco: "Rua Nova, 10", solicitante: { nome: "Fulana" },
        canalEntrada: "telefone", descricao: "Agua na via",
      },
    });
    expect(r.statusCode, r.body).toBe(403);
    expect(r.json().erro).toBe("acesso_suspenso");

    const n = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM ocorrencias WHERE organizacao_id = $1", [orgA],
    );
    expect(n.rows[0]!.n, "a escrita passou apesar da suspensao").toBe("1");
  });

  it("token de acesso vivo: leitura continua ate o token vencer", async () => {
    /*
      DECISÃO, e não descuido: a leitura com token vivo NÃO consulta a
      suspensão. O token de acesso vive quinze minutos e é conferido só por
      assinatura, e essa é a mesma janela que o produto já aceita quando um
      usuário é desativado ou expulso: a sessão cai, o token vivo termina o
      prazo. Suspensão contratual não é incidente de segurança, e quinze
      minutos de leitura não criam registro nenhum sob o contrato suspenso. O
      que se compra com isso é nenhuma consulta a mais em nenhuma leitura, que
      é a maior parte do tráfego de uma noite de chuva. O argumento inteiro
      está em `auth/suspensao.ts`.
    */
    const tokens = await entrar(EMAIL_A);
    await suspender(orgA);

    const r = await app.inject({
      method: "GET", url: `/ocorrencias/${ocorrenciaA}`, headers: comToken(tokens.acesso),
    });
    expect(r.statusCode, r.body).toBe(200);
  });

  it("token de acesso vivo: GET COM EFEITO recusa com 403 como a escrita (o sino, o CSV e o laudo, em GET e HEAD)", async () => {
    /*
      A afirmação de `auth/suspensao.ts` presa ao comportamento (V2-F00-E04,
      correção 2): o GET marcado com `ROTA_GET_COM_EFEITO` é escrita para a
      suspensão. O sino `GET /avisos` materializa e expurga avisos; o CSV grava
      a exportação; o laudo grava a emissão. Com o município suspenso, os três
      respondem 403 `acesso_suspenso` antes de o handler rodar (o laudo de um
      id que não existe responde 403 e não 404, prova de que a recusa vem
      antes). A leitura sem a marca, no teste anterior, continua 200.
    */
    const tokens = await entrar(EMAIL_A);
    await suspender(orgA);

    for (const method of ["GET", "HEAD"] as const) {
      for (const url of ["/avisos", "/relatorios/ocorrencias.csv", "/documentos/00000000-0000-4000-8000-000000000000/laudo"]) {
        const r = await app.inject({ method, url, headers: comToken(tokens.acesso) });
        expect(r.statusCode, `${method} ${url}: ${r.body}`).toBe(403);
        if (method === "GET") expect(r.json().erro, `${method} ${url}`).toBe("acesso_suspenso");
      }
    }
  });

  it("token de acesso VENCIDO de municipio suspenso responde 403, e nao 401", async () => {
    /*
      O caso que o aplicativo de campo precisa. Depois que a renovação falha, o
      aparelho segue apresentando o token vencido, e cada resposta 401 é lida
      como "sua sessão terminou, entre de novo". Entrar de novo num município
      suspenso dá 403 para sempre. O 403 aqui é o que faz o aplicativo dizer a
      frase certa, sem botão de "entrar de novo".
    */
    await suspender(orgA);
    const vencido = await tokenVencido(orgA, await usuarioDe(EMAIL_A));

    const r = await app.inject({
      method: "GET", url: "/sincronizacao/pendencias", headers: comToken(vencido),
    });
    expect(r.statusCode, r.body).toBe(403);
    expect(r.json().erro).toBe("acesso_suspenso");
  });

  it("token de acesso vencido de municipio ATIVO continua respondendo 401", async () => {
    const vencido = await tokenVencido(orgA, await usuarioDe(EMAIL_A));
    const r = await app.inject({
      method: "GET", url: "/sincronizacao/pendencias", headers: comToken(vencido),
    });
    expect(r.statusCode).toBe(401);
    expect(r.json().erro).toBe("nao_autenticado");
  });

  it("token adulterado de municipio suspenso continua sendo 401: a suspensao so fala com token autentico", async () => {
    /*
      A resposta 403 revela que o município está suspenso. Ela só pode sair
      para quem apresenta um token que ESTE servidor assinou, ainda que vencido.
      Um token assinado com outro segredo é de ninguém, e recebe o 401 de
      sempre, sem consultar o banco.
    */
    await suspender(orgA);
    const agora = Math.floor(Date.now() / 1000);
    const forjado = await new SignJWT({
      org: orgA, papel: "coordenador", nome: "x", sid: "00000000-0000-4000-8000-000000000000",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(await usuarioDe(EMAIL_A))
      .setIssuer("dc360-api")
      .setAudience("dc360")
      .setIssuedAt(agora - 1200)
      .setExpirationTime(agora - 300)
      .sign(new TextEncoder().encode("outro-segredo-que-nao-e-o-do-servidor-nem-de-perto"));

    const r = await app.inject({
      method: "GET", url: "/sincronizacao/pendencias", headers: comToken(forjado),
    });
    expect(r.statusCode).toBe(401);
  });
});

describe("A fila do aparelho num municipio suspenso", () => {
  it("a sincronizacao de vistoria recusa com 503 acesso_suspenso, que a fila trata como temporario", async () => {
    /*
      `packages/campo/src/transporte.ts`: 5xx e 429 são temporários, 4xx é
      permanente, e permanente vira item `bloqueado` sem tela para desbloquear,
      com "Descartar" embaixo. A coleta que está no aparelho foi feita no
      morro, e a suspensão é reversível: ela precisa esperar, e subir sozinha
      quando o acesso voltar. Por isso 503 e não 403.
    */
    const tokens = await entrar(EMAIL_AGENTE_A);
    await suspender(orgA);

    const r = await app.inject({
      method: "POST", url: "/sincronizacao/vistoria", headers: comToken(tokens.acesso),
      payload: {},
    });
    expect(r.statusCode, r.body).toBe(503);
    expect(r.json().erro).toBe("acesso_suspenso");
    expect(r.json().mensagem).toMatch(/suspenso pelo fornecedor/i);
  });

  it("as quatro rotas que a fila chama recusam com 503, e as demais escritas com 403", async () => {
    /*
      A lista é a do transporte do aparelho (`packages/campo/src/transporte.ts`):
      autorizar foto, confirmar foto, enviar vistoria, devolver tarefa. Uma rota
      nova da fila que nasça sem a marca `ROTA_DA_FILA_DO_CAMPO` recebe 403
      aqui, e 403 é o que bloqueia a coleta no aparelho.
    */
    const tokens = await entrar(EMAIL_AGENTE_A);
    await suspender(orgA);

    for (const url of [
      "/evidencias/autorizar-envio", "/evidencias/confirmar-envio",
      "/sincronizacao/vistoria", "/sincronizacao/devolucao",
    ]) {
      const r = await app.inject({
        method: "POST", url, headers: comToken(tokens.acesso), payload: {},
      });
      expect(r.statusCode, `${url}: ${r.body}`).toBe(503);
      expect(r.json().erro, url).toBe("acesso_suspenso");
    }

    // Uma escrita que NÃO é da fila (o registro do aparelho de push) é 403.
    const outra = await app.inject({
      method: "POST", url: "/aparelhos", headers: comToken(tokens.acesso),
      payload: { plataforma: "ios", ficha: "ficha" },
    });
    expect(outra.statusCode, outra.body).toBe(403);
    expect(outra.json().erro).toBe("acesso_suspenso");
  });

  it("com token vencido a fila tambem recebe 503, e nao 403", async () => {
    // Depois dos quinze minutos é este o caminho que a fila percorre a cada
    // tentativa, e ele precisa continuar temporário: um 403 aqui bloquearia a
    // coleta exatamente quando ela mais precisa esperar.
    await suspender(orgA);
    const vencido = await tokenVencido(orgA, await usuarioDe(EMAIL_AGENTE_A));
    const r = await app.inject({
      method: "POST", url: "/sincronizacao/vistoria", headers: comToken(vencido),
      payload: {},
    });
    expect(r.statusCode, r.body).toBe(503);
    expect(r.json().erro).toBe("acesso_suspenso");
  });

  it("nada e gravado: a coleta espera no aparelho, e nao no banco do municipio suspenso", async () => {
    const tokens = await entrar(EMAIL_AGENTE_A);
    await suspender(orgA);
    const antes = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM vistorias WHERE organizacao_id = $1", [orgA],
    );
    await app.inject({
      method: "POST", url: "/sincronizacao/vistoria", headers: comToken(tokens.acesso),
      payload: { ocorrenciaId: ocorrenciaA, idempotencyKey: "coleta-1" },
    });
    const depois = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM vistorias WHERE organizacao_id = $1", [orgA],
    );
    expect(depois.rows[0]!.n).toBe(antes.rows[0]!.n);
  });
});
