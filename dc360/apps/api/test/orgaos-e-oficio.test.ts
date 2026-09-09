import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { derivarSenha } from "../src/auth/senha.js";
import type { Mensagem, Notificador } from "../src/auth/notificador.js";

/**
 * O catálogo de órgãos, o ofício numerado e o link de uso único, pela API.
 *
 * O portão do banco (`db/test/isolamento.test.ts`) já prova o isolamento, a
 * numeração por município e o uso único garantido por índice. O que ESTE
 * arquivo prova é o que só existe do lado da rota, e cada caso aqui responde a
 * um defeito que o produto já cometeu ou cometeria:
 *
 *   1. O email leva o número e um link, e NÃO leva o endereço da família.
 *   2. Com o envio desligado, a rota RECUSA em vez de responder que mandou.
 *      Prometer email que não sai foi defeito real, confirmado em produção.
 *   3. Toda tentativa fica registrada, inclusive a que falhou.
 *   4. O ofício não sai para domínio fora do catálogo do próprio município.
 *   5. O link abre uma vez, e a segunda abertura é recusada.
 */

const SENHA = "serra-alta-senha-bem-longa";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let appSemEmail: FastifyInstance;

let orgA: string;
let orgB: string;
let ocorrenciaA: string;
let orgaoDeB: string;

const tokens: Record<string, string> = {};
/** O que o notificador falso recebeu, na ordem. */
const enviadas: Mensagem[] = [];
/** Quando preenchido, o próximo envio falha com esta mensagem. */
let falhaProgramada: string | null = null;

const notificadorFalso: Notificador = {
  async enviar(m) {
    if (falhaProgramada) {
      const erro = falhaProgramada;
      falhaProgramada = null;
      throw new Error(erro);
    }
    enviadas.push(m);
  },
};

function com(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function entrar(instancia: FastifyInstance, email: string): Promise<string> {
  const r = await instancia.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou (${r.statusCode}): ${r.body}`);
  return r.json().acesso;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: false });
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
  for (const [org, nome, matricula, email, papel] of [
    [orgA, "Helena Coutinho", "SA-1", "helena@serraalta.exemplo.gov.br", "coordenador"],
    [orgA, "Jonas Ferreira", "SA-2", "jonas@serraalta.exemplo.gov.br", "operador"],
    [orgB, "Aurelio Machado", "VF-1", "aurelio@valefundo.exemplo.gov.br", "coordenador"],
  ] as const) {
    await db.query(
      `INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,senha_hash)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [org, nome, matricula, email, papel, hash],
    );
  }

  const oa = await db.query<{ id: string }>(
    `INSERT INTO ocorrencias
       (organizacao_id,protocolo,tipo,status,severidade,endereco,solicitante_nome,
        canal_entrada,descricao,vulnerabilidade_presente,vulnerabilidade_descricao)
     VALUES ($1,'000001/2026','deslizamento','vistoria_concluida','alta',
             'Rua das Acacias, 245','Marilda Nogueira','telefone',
             'Talude cedeu sobre o quintal', true,
             'Idosa acamada e duas criancas no imovel')
     RETURNING id`,
    [orgA],
  );
  ocorrenciaA = oa.rows[0]!.id;

  const gb = await db.query<{ id: string }>(
    `INSERT INTO orgaos (organizacao_id,nome,email)
     VALUES ($1,'Secretaria de Obras','obras@valefundo.exemplo.gov.br') RETURNING id`,
    [orgB],
  );
  orgaoDeB = gb.rows[0]!.id;

  const ambienteComum = {
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-teste-oficio-com-mais-de-32-bytes",
    LOGIN_POR_IP: "10000",
    URL_PUBLICA: "http://api.local",
    OFICIO_MAX_ENVIOS: "2",
    // Vazio desliga a marca d'água: os testes leem o corpo do documento e a
    // marca só acrescentaria ruído.
    MARCA_DAGUA: "",
  } as NodeJS.ProcessEnv;

  app = await construirServidor({
    banco: mem.banco,
    config: carregarConfig({
      ...ambienteComum,
      EMAIL_ATIVO: "sim",
      NOTIFICADOR_URL: "https://provedor.exemplo.com/enviar",
      NOTIFICADOR_CHAVE: "chave-falsa-de-teste",
    } as NodeJS.ProcessEnv),
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
    notificador: notificadorFalso,
  });
  await app.ready();

  // Um segundo servidor, sobre o MESMO banco, com o envio desligado. É o
  // estado padrão do produto, e precisa ser exercitado como estado, e não como
  // ausência de teste.
  appSemEmail = await construirServidor({
    banco: mem.banco,
    config: carregarConfig({ ...ambienteComum, EMAIL_ATIVO: "nao" } as NodeJS.ProcessEnv),
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
    notificador: notificadorFalso,
  });
  await appSemEmail.ready();

  tokens["coordA"] = await entrar(app, "helena@serraalta.exemplo.gov.br");
  tokens["operadorA"] = await entrar(app, "jonas@serraalta.exemplo.gov.br");
  tokens["coordB"] = await entrar(app, "aurelio@valefundo.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await appSemEmail?.close();
  await mem?.banco.encerrar();
});

/** Cria órgão de Serra Alta e devolve o id. */
async function criarOrgao(corpo: Record<string, unknown>): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/orgaos", headers: com(tokens["coordA"]!), payload: corpo,
  });
  if (r.statusCode !== 201) throw new Error(`criar orgao falhou (${r.statusCode}): ${r.body}`);
  return r.json().id;
}

describe("Catálogo de órgãos", () => {
  it("cadastra o órgão com email, que é o que permite o ofício sair", async () => {
    const id = await criarOrgao({
      nome: "Corpo de Bombeiros",
      sigla: "CBM",
      email: "Sinistros@Bombeiros.Exemplo.Gov.BR",
      telefone: "(31) 3333-0000",
    });

    const lista = await app.inject({
      method: "GET", url: "/orgaos", headers: com(tokens["coordA"]!),
    });
    const achado = lista.json().itens.find((o: { id: string }) => o.id === id);
    expect(achado.nome).toBe("Corpo de Bombeiros");
    // O email é normalizado para minúsculas: sem isso, o mesmo endereço
    // cadastrado com caixas diferentes viraria dois domínios distintos na
    // lista fechada do envio.
    expect(achado.email).toBe("sinistros@bombeiros.exemplo.gov.br");
  });

  it("recusa o mesmo nome escrito com outra caixa", async () => {
    /*
      O defeito que o catálogo inteiro existe para fechar: "Corpo de
      Bombeiros", "corpo de bombeiros" e "CORPO DE BOMBEIROS" como três
      destinos, e o relatório de "quantas providências foram para os bombeiros"
      contando um terço do total em cada linha.
    */
    const r = await app.inject({
      method: "POST", url: "/orgaos", headers: com(tokens["coordA"]!),
      payload: { nome: "  corpo de bombeiros " },
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toBe("orgao_repetido");
  });

  it("quem não gerencia a estrutura do município não cadastra órgão", async () => {
    // Esconder o botão na tela não é controle de acesso.
    const r = await app.inject({
      method: "POST", url: "/orgaos", headers: com(tokens["operadorA"]!),
      payload: { nome: "Secretaria de Saude" },
    });
    expect(r.statusCode).toBe(403);
  });

  it("órgão de outro município responde 404, e não 403", async () => {
    // 403 confirmaria que o registro existe em algum lugar, que é o oráculo
    // que a regra do produto inteiro existe para fechar.
    const r = await app.inject({
      method: "PATCH", url: `/orgaos/${orgaoDeB}`, headers: com(tokens["coordA"]!),
      payload: { nome: "Sequestrada" },
    });
    expect(r.statusCode).toBe(404);

    const conferencia = await mem.bruto.query<{ nome: string }>(
      "SELECT nome FROM orgaos WHERE id = $1",
      [orgaoDeB],
    );
    expect(conferencia.rows[0]!.nome).toBe("Secretaria de Obras");
  });

  it("órgão não se apaga, se desativa com motivo escrito", async () => {
    const id = await criarOrgao({ nome: "Defesa Sanitaria" });

    const curto = await app.inject({
      method: "POST", url: `/orgaos/${id}/desativacao`, headers: com(tokens["coordA"]!),
      payload: { motivo: "erro" },
    });
    expect(curto.statusCode).toBe(422);

    const ok = await app.inject({
      method: "POST", url: `/orgaos/${id}/desativacao`, headers: com(tokens["coordA"]!),
      payload: { motivo: "Competencia transferida para a Secretaria de Saude em 2026" },
    });
    expect(ok.statusCode).toBe(200);

    // A linha continua existindo, com o motivo, porque ela aparece em ofício
    // já emitido e na trilha de quem encaminhou o quê.
    const linha = await mem.bruto.query<{ ativo: boolean; motivo_desativacao: string }>(
      "SELECT ativo, motivo_desativacao FROM orgaos WHERE id = $1",
      [id],
    );
    expect(linha.rows[0]!.ativo).toBe(false);
    expect(linha.rows[0]!.motivo_desativacao).toMatch(/Secretaria de Saude/);

    // E o ato ficou na trilha administrativa, como qualquer mexida em equipe
    // ou em conta.
    const trilha = await mem.bruto.query<{ acao: string; autor_nome: string }>(
      "SELECT acao, autor_nome FROM trilha_administrativa WHERE alvo_id = $1",
      [id],
    );
    expect(trilha.rows.map((l) => l.acao)).toContain("orgao_desativado");
  });
});

describe("Providência amarrada no catálogo", () => {
  it("não encaminha para órgão de outro município", async () => {
    const r = await app.inject({
      method: "POST", url: `/ocorrencias/${ocorrenciaA}/providencia`,
      headers: com(tokens["coordA"]!),
      payload: {
        orgaoId: orgaoDeB,
        orgaoDestino: "Secretaria de Obras",
        descricao: "Escoramento do talude.",
        responsavel: "Engenheiro de plantao",
        prazoHoras: 72,
      },
    });
    expect(r.statusCode).toBe(404);
    expect(r.json().erro).toBe("orgao_nao_encontrado");
  });

  it("o texto livre de uma tela antiga cai no catálogo em vez de criar destino novo", async () => {
    /*
      A rede de segurança da migração 017. Uma tela ainda no ar manda só o
      nome; sem esta amarra, `orgao_id` teria que voltar a ser anulável, e a
      chave estrangeira composta seria dispensada pelo MATCH SIMPLE, que é
      justamente a proteção contra apontar para órgão de outro município.
    */
    const r = await app.inject({
      method: "POST", url: `/ocorrencias/${ocorrenciaA}/providencia`,
      headers: com(tokens["coordA"]!),
      payload: {
        orgaoDestino: "CORPO DE BOMBEIROS",
        descricao: "Avaliacao de risco imediato.",
        responsavel: "Chefe de plantao",
        prazoHoras: 24,
      },
    });
    expect(r.statusCode).toBe(200);

    const linha = await mem.bruto.query<{ nome: string }>(
      `SELECT g.nome FROM providencias p JOIN orgaos g ON g.id = p.orgao_id
        WHERE p.organizacao_id = $1 ORDER BY p.encaminhada_em DESC LIMIT 1`,
      [orgA],
    );
    expect(linha.rows[0]!.nome).toBe("Corpo de Bombeiros");
  });
});

describe("Ofício numerado", () => {
  let providenciaId: string;
  let oficioId: string;
  let numero: string;

  beforeAll(async () => {
    const r = await mem.bruto.query<{ id: string }>(
      `SELECT p.id FROM providencias p JOIN orgaos g ON g.id = p.orgao_id
        WHERE p.organizacao_id = $1 AND g.nome = 'Corpo de Bombeiros' LIMIT 1`,
      [orgA],
    );
    providenciaId = r.rows[0]!.id;
  });

  it("emite com número próprio do município, começando em um", async () => {
    const r = await app.inject({
      method: "POST", url: "/oficios", headers: com(tokens["coordA"]!),
      payload: { providenciaId, observacoes: "Solicitamos vistoria conjunta." },
    });
    expect(r.statusCode).toBe(201);
    oficioId = r.json().id;
    numero = r.json().numero;
    expect(numero).toBe(`000001/${new Date().getFullYear()}`);
  });

  it("não emite dois ofícios para a mesma providência", async () => {
    /*
      O segundo clique não pode queimar outro número: o órgão receberia dois
      documentos oficiais pedindo a mesma coisa, e o coordenador não teria como
      saber qual dos dois cobrar depois. A resposta diz qual já existe.
    */
    const r = await app.inject({
      method: "POST", url: "/oficios", headers: com(tokens["coordA"]!),
      payload: { providenciaId },
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toBe("ja_emitido");
    expect(r.json().mensagem).toContain(numero);
  });

  it("o documento traz o dossiê, que é justamente o que o email não leva", async () => {
    const r = await app.inject({
      method: "GET", url: `/oficios/${oficioId}/documento`, headers: com(tokens["coordA"]!),
    });
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toMatch(/text\/html/);
    expect(r.body).toContain("Rua das Acacias, 245");
    expect(r.body).toContain("Marilda Nogueira");
    expect(r.body).toContain("Idosa acamada");
    expect(r.body).toContain(numero);
  });

  it("ofício de outro município responde 404", async () => {
    const r = await app.inject({
      method: "GET", url: `/oficios/${oficioId}`, headers: com(tokens["coordB"]!),
    });
    expect(r.statusCode).toBe(404);
  });

  describe("Envio por email", () => {
    it("com o envio desligado, recusa em vez de fingir que mandou", async () => {
      /*
        Defeito real deste produto, confirmado contra a produção em 08/09/2026
        na recuperação de senha: a rota respondia 202 "enviamos um link" e nada
        saía. Aqui a recusa é explícita, e NENHUMA tentativa é registrada,
        porque nada foi tentado: registrar seria inventar um fato.
      */
      const antes = await mem.bruto.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM oficio_envios",
      );

      const r = await appSemEmail.inject({
        method: "POST", url: `/oficios/${oficioId}/envio`,
        headers: com(tokens["coordA"]!), payload: {},
      });
      expect(r.statusCode).toBe(503);
      expect(r.json().erro).toBe("envio_desligado");
      expect(r.json().mensagem).not.toMatch(/enviad|mandad/i);

      const depois = await mem.bruto.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM oficio_envios",
      );
      expect(depois.rows[0]!.n).toBe(antes.rows[0]!.n);
    });

    it("recusa endereço de domínio fora do catálogo do próprio município", async () => {
      /*
        Sem esta trava, quem tem login no painel usa o sistema como
        encaminhador: manda o link do dossiê de uma família para o endereço que
        quiser, com o cabeçalho da prefeitura em cima do documento.
      */
      const fora = await app.inject({
        method: "POST", url: `/oficios/${oficioId}/envio`,
        headers: com(tokens["coordA"]!),
        payload: { destinatario: "qualquer.um@provedor-pessoal.exemplo.com" },
      });
      expect(fora.statusCode).toBe(422);
      expect(fora.json().erro).toBe("dominio_nao_autorizado");

      // E o domínio do município vizinho também não serve, mesmo estando
      // cadastrado lá: a lista fechada é do PRÓPRIO município.
      const vizinho = await app.inject({
        method: "POST", url: `/oficios/${oficioId}/envio`,
        headers: com(tokens["coordA"]!),
        payload: { destinatario: "alguem@valefundo.exemplo.gov.br" },
      });
      expect(vizinho.statusCode).toBe(422);

      const registradas = await mem.bruto.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM oficio_envios WHERE oficio_id = $1",
        [oficioId],
      );
      expect(registradas.rows[0]!.n).toBe("0");
    });

    it("o email leva o número e o link, e NÃO leva o endereço da família", async () => {
      /*
        A decisão de privacidade desta frente inteira. Email sai do controle do
        município no instante em que é entregue: fica na caixa de quem recebeu,
        no servidor do provedor dele e em todo encaminhamento que ele fizer.
        Não existe apagar depois. O link, esse, expira e abre uma vez só.
      */
      enviadas.length = 0;
      const r = await app.inject({
        method: "POST", url: `/oficios/${oficioId}/envio`,
        headers: com(tokens["coordA"]!), payload: {},
      });
      expect(r.statusCode).toBe(202);
      expect(r.json().destinatario).toBe("s***@bombeiros.exemplo.gov.br");

      expect(enviadas).toHaveLength(1);
      const mensagem = enviadas[0]!;
      expect(mensagem.para).toBe("sinistros@bombeiros.exemplo.gov.br");
      expect(mensagem.corpo).toContain(numero);
      expect(mensagem.corpo).toMatch(/http:\/\/api\.local\/publico\/oficio\/\S+/);

      for (const sigiloso of [
        "Rua das Acacias",
        "Marilda Nogueira",
        "Idosa acamada",
        "Talude cedeu",
      ]) {
        expect(
          mensagem.corpo + mensagem.assunto,
          `o email levou "${sigiloso}", que sai do controle do municipio no `
          + "instante em que a mensagem e entregue",
        ).not.toContain(sigiloso);
      }
    });

    it("o link abre uma vez, e a segunda abertura é recusada e registrada", async () => {
      const link = /http:\/\/api\.local(\/publico\/oficio\/\S+)/
        .exec(enviadas[0]!.corpo)![1]!;

      const primeira = await app.inject({ method: "GET", url: link });
      expect(primeira.statusCode).toBe(200);
      expect(primeira.body).toContain("Rua das Acacias, 245");

      const segunda = await app.inject({ method: "GET", url: link });
      expect(segunda.statusCode).toBe(410);
      // A recusa CONTA o que aconteceu de propósito: se o destinatário
      // legítimo encontra o link já usado, alguém no caminho abriu antes dele,
      // e esconder isso deixaria o vazamento silencioso.
      expect(segunda.body).toMatch(/abriu antes|uma vez/i);
      expect(segunda.body).not.toContain("Rua das Acacias");

      const registro = await mem.bruto.query<{ resultado: string }>(
        "SELECT resultado FROM oficio_aberturas WHERE oficio_id = $1 ORDER BY registrado_em",
        [oficioId],
      );
      expect(registro.rows.map((l) => l.resultado))
        .toEqual(["entregue", "recusado_ja_aberto"]);
    });

    it("link inventado responde 404, igual a rota que não existe", async () => {
      const r = await app.inject({
        method: "GET", url: "/publico/oficio/token-que-nunca-foi-emitido",
      });
      expect(r.statusCode).toBe(404);
      expect(r.body).not.toContain("Rua das Acacias");
    });

    it("a tentativa que FALHA fica registrada, e a rota não diz que enviou", async () => {
      /*
        Tentativa que não fica registrada é a que ninguém consegue investigar.
        "Mandamos, não chegou" é uma conversa que só termina com registro de
        quem mandou, quando, para qual endereço e o que o provedor respondeu.
      */
      falhaProgramada = "O provedor de email recusou o envio (HTTP 402): sem saldo";

      const r = await app.inject({
        method: "POST", url: `/oficios/${oficioId}/envio`,
        headers: com(tokens["coordA"]!), payload: {},
      });
      expect(r.statusCode).toBe(502);
      expect(r.json().erro).toBe("envio_falhou");

      const tentativas = await mem.bruto.query<{ tentativa: number; desfecho: string; detalhe: string }>(
        "SELECT tentativa, desfecho, detalhe FROM oficio_envios WHERE oficio_id = $1 ORDER BY tentativa",
        [oficioId],
      );
      expect(tentativas.rows.map((l) => l.desfecho)).toEqual(["entregue", "falha"]);
      expect(tentativas.rows[1]!.detalhe).toContain("402");
    });

    it("o teto de reenvio para de espalhar link vivo para o mesmo dossiê", async () => {
      // `OFICIO_MAX_ENVIOS=2` neste servidor, e as duas tentativas já
      // aconteceram: a que entregou e a que falhou.
      const r = await app.inject({
        method: "POST", url: `/oficios/${oficioId}/envio`,
        headers: com(tokens["coordA"]!), payload: {},
      });
      expect(r.statusCode).toBe(409);
      expect(r.json().erro).toBe("teto_de_envios");
    });

    it("a ficha do ofício mostra as tentativas e NÃO devolve o link", async () => {
      const r = await app.inject({
        method: "GET", url: `/oficios/${oficioId}`, headers: com(tokens["coordA"]!),
      });
      expect(r.statusCode).toBe(200);
      const ficha = r.json();
      expect(ficha.envios).toHaveLength(2);
      expect(ficha.aberturas).toHaveLength(2);

      /*
        Nem o token nem o hash dele saem daqui. Devolver o hash numa leitura
        corriqueira daria um caminho para reconstruir o estado do link por fora
        da rota pública, que é onde o uso único é cobrado.
      */
      expect(JSON.stringify(ficha)).not.toContain("token");
      const hashes = await mem.bruto.query<{ token_hash: string }>(
        "SELECT token_hash FROM oficio_envios WHERE oficio_id = $1",
        [oficioId],
      );
      for (const linha of hashes.rows) {
        expect(JSON.stringify(ficha)).not.toContain(linha.token_hash);
      }
    });

    it("órgão desativado não recebe encaminhamento novo", async () => {
      const id = await criarOrgao({
        nome: "Secretaria de Transportes",
        email: "transportes@bombeiros.exemplo.gov.br",
      });

      const providencia = await mem.bruto.query<{ id: string }>(
        `INSERT INTO providencias
           (organizacao_id, ocorrencia_id, orgao_id, orgao_destino, descricao, responsavel, prazo_em)
         VALUES ($1,$2,$3,'Secretaria de Transportes','Interditar a via','Fiscal', now() + interval '2 days')
         RETURNING id`,
        [orgA, ocorrenciaA, id],
      );
      const oficio = await app.inject({
        method: "POST", url: "/oficios", headers: com(tokens["coordA"]!),
        payload: { providenciaId: providencia.rows[0]!.id },
      });
      expect(oficio.statusCode).toBe(201);

      await app.inject({
        method: "POST", url: `/orgaos/${id}/desativacao`, headers: com(tokens["coordA"]!),
        payload: { motivo: "Orgao extinto na reforma administrativa de 2026" },
      });

      const r = await app.inject({
        method: "POST", url: `/oficios/${oficio.json().id}/envio`,
        headers: com(tokens["coordA"]!), payload: {},
      });
      expect(r.statusCode).toBe(409);
      expect(r.json().erro).toBe("orgao_desativado");
    });

    it("órgão sem email não sai por email, e a rota diz o que fazer", async () => {
      const id = await criarOrgao({ nome: "Companhia de Saneamento" });
      const providencia = await mem.bruto.query<{ id: string }>(
        `INSERT INTO providencias
           (organizacao_id, ocorrencia_id, orgao_id, orgao_destino, descricao, responsavel, prazo_em)
         VALUES ($1,$2,$3,'Companhia de Saneamento','Limpeza da rede','Encarregado', now() + interval '5 days')
         RETURNING id`,
        [orgA, ocorrenciaA, id],
      );
      const oficio = await app.inject({
        method: "POST", url: "/oficios", headers: com(tokens["coordA"]!),
        payload: { providenciaId: providencia.rows[0]!.id },
      });

      const r = await app.inject({
        method: "POST", url: `/oficios/${oficio.json().id}/envio`,
        headers: com(tokens["coordA"]!), payload: {},
      });
      expect(r.statusCode).toBe(409);
      expect(r.json().erro).toBe("orgao_sem_email");
      // A saída que funciona hoje precisa estar na mensagem, senão a pessoa
      // fica parada no meio de um encaminhamento urgente.
      expect(r.json().mensagem).toMatch(/imprima|cadastre/i);
    });
  });
});

describe("Link de uso único expirado", () => {
  it("não entrega o ofício, e manda pedir reenvio", async () => {
    const oficio = await mem.bruto.query<{ id: string }>(
      "SELECT id FROM oficios WHERE organizacao_id = $1 LIMIT 1",
      [orgA],
    );
    /*
      O envio vencido é inserido direto no banco, como dono das tabelas: a rota
      não tem como produzir um link já expirado, e viajar no relógio do
      processo não moveria o `now()` do Postgres, que é quem decide.
    */
    await mem.bruto.query(
      `INSERT INTO oficio_envios
         (organizacao_id, oficio_id, tentativa, destinatario_email, token_hash,
          expira_em, solicitado_por_nome)
       VALUES ($1,$2,9,'sinistros@bombeiros.exemplo.gov.br',$3,
               now() - interval '1 hour','Helena Coutinho')`,
      [
        orgA, oficio.rows[0]!.id,
        // O mesmo hash que a rota calcularia para este token.
        (await import("../src/auth/tokens.js")).hashDoToken("token-vencido-de-teste"),
      ],
    );

    const r = await app.inject({
      method: "GET", url: "/publico/oficio/token-vencido-de-teste",
    });
    expect(r.statusCode).toBe(410);
    expect(r.body).toMatch(/expirou/i);
    expect(r.body).not.toContain("Rua das Acacias");

    const registro = await mem.bruto.query<{ resultado: string }>(
      `SELECT a.resultado FROM oficio_aberturas a
         JOIN oficio_envios e ON e.id = a.envio_id
        WHERE e.tentativa = 9`,
    );
    expect(registro.rows[0]!.resultado).toBe("recusado_expirado");
  });
});
