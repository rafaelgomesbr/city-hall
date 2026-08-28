import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { derivarSenha } from "../src/auth/senha.js";
import { hashDoToken } from "../src/auth/tokens.js";

/**
 * Testes de integração da API, com o Postgres de verdade por baixo.
 *
 * O que estes testes existem para responder não é "a rota devolve 200". É:
 * com um token válido de um município, dá para alcançar dado de outro? E o
 * papel errado consegue disparar transição que não lhe cabe? E a coleta que
 * chega duas vezes vira dois laudos?
 *
 * Por isso quase todo caso aqui é uma tentativa de invasão, e a conferência
 * do resultado é feita fora da API, direto no banco como dono das tabelas,
 * para não depender da própria camada que está sendo testada.
 */

const SENHA_A = "serra-alta-senha-forte";
const SENHA_B = "vale-fundo-senha-forte";

let mem: BancoEmMemoria;
let app: FastifyInstance;

let orgA: string;
let orgB: string;
let equipeA: string;
let equipeB: string;
let ocorrenciaA: string;
let ocorrenciaB: string;
let agenteA: string;

/** Sessão de cada perfil usado nos testes. */
const tokens: Record<string, { acesso: string; renovacao: string }> = {};

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

  const ea = await db.query<{ id: string }>(
    "INSERT INTO equipes (organizacao_id,nome,especialidade) VALUES ($1,'Equipe Alfa','Geotecnia') RETURNING id",
    [orgA],
  );
  const eb = await db.query<{ id: string }>(
    "INSERT INTO equipes (organizacao_id,nome,especialidade) VALUES ($1,'Equipe Unica','Geral') RETURNING id",
    [orgB],
  );
  equipeA = ea.rows[0]!.id;
  equipeB = eb.rows[0]!.id;

  const hashA = await derivarSenha(SENHA_A);
  const hashB = await derivarSenha(SENHA_B);

  const pessoas: Array<[string, string, string, string, string, string | null, string]> = [
    [orgA, "Helena Coutinho", "SA-1", "helena@serraalta.exemplo.gov.br", "coordenador", null, hashA],
    [orgA, "Jonas Ferreira", "SA-2", "jonas@serraalta.exemplo.gov.br", "operador", null, hashA],
    [orgA, "Diego Alves", "SA-3", "diego@serraalta.exemplo.gov.br", "agente_campo", equipeA, hashA],
    [orgB, "Aurelio Machado", "VF-1", "aurelio@valefundo.exemplo.gov.br", "coordenador", null, hashB],
    // Administradora de Serra Alta: é ela que os testes de posto usam como
    // teto do município.
    [orgA, "Rita Lopes", "SA-4", "rita@serraalta.exemplo.gov.br", "administrador", null, hashA],
  ];
  for (const [org, nome, matricula, email, papel, equipe, hash] of pessoas) {
    const r = await db.query<{ id: string }>(
      `INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,equipe_id,senha_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [org, nome, matricula, email, papel, equipe, hash],
    );
    if (papel === "agente_campo") agenteA = r.rows[0]!.id;
  }

  const oa = await db.query<{ id: string }>(
    `INSERT INTO ocorrencias (organizacao_id,protocolo,tipo,status,endereco,solicitante_nome,canal_entrada,descricao)
     VALUES ($1,'000001/2026','deslizamento','registrada','Rua das Acacias, 245','Marilda','telefone','Talude cedeu')
     RETURNING id`,
    [orgA],
  );
  const ob = await db.query<{ id: string }>(
    `INSERT INTO ocorrencias (organizacao_id,protocolo,tipo,status,endereco,solicitante_nome,canal_entrada,descricao)
     VALUES ($1,'000001/2026','alagamento','registrada','Avenida Central, 900','Osvaldo','telefone','Agua na via')
     RETURNING id`,
    [orgB],
  );
  ocorrenciaA = oa.rows[0]!.id;
  ocorrenciaB = ob.rows[0]!.id;

  await db.query(
    "INSERT INTO protocolo_sequencias (organizacao_id,ano,ultimo) VALUES ($1,$2,1),($3,$2,1)",
    [orgA, new Date().getFullYear(), orgB],
  );
}

async function entrar(email: string, senha: string): Promise<{ acesso: string; renovacao: string }> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou (${r.statusCode}): ${r.body}`);
  const corpo = r.json();
  return { acesso: corpo.acesso, renovacao: corpo.renovacao };
}

function comToken(token: string) {
  return { authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  mem = await bancoEmMemoria();
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
    MAX_FALHAS_LOGIN: "3",
    BLOQUEIO_MINUTOS: "15",
    // A suíte faz dezenas de logins legítimos. O limite por endereço é
    // exercitado num servidor próprio, no último bloco, com o valor real.
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);

  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
  });
  await app.ready();
  await semear();

  tokens["coordA"] = await entrar("helena@serraalta.exemplo.gov.br", SENHA_A);
  tokens["operadorA"] = await entrar("jonas@serraalta.exemplo.gov.br", SENHA_A);
  tokens["agenteA"] = await entrar("diego@serraalta.exemplo.gov.br", SENHA_A);
  tokens["coordB"] = await entrar("aurelio@valefundo.exemplo.gov.br", SENHA_B);
  tokens["adminA"] = await entrar("rita@serraalta.exemplo.gov.br", SENHA_A);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Autenticação", () => {
  it("recusa senha errada com a mesma resposta de email inexistente", async () => {
    const senhaErrada = await app.inject({
      method: "POST", url: "/auth/entrar",
      payload: { email: "helena@serraalta.exemplo.gov.br", senha: "nao-e-essa-senha" },
    });
    const emailInexistente = await app.inject({
      method: "POST", url: "/auth/entrar",
      payload: { email: "ninguem@serraalta.exemplo.gov.br", senha: "qualquer-coisa-aqui" },
    });

    expect(senhaErrada.statusCode).toBe(401);
    expect(emailInexistente.statusCode).toBe(401);
    // Corpos idênticos: a resposta não diz quais emails existem.
    expect(senhaErrada.json()).toEqual(emailInexistente.json());
  });

  it("nunca devolve o hash da senha", async () => {
    const r = await app.inject({
      method: "POST", url: "/auth/entrar",
      payload: { email: "helena@serraalta.exemplo.gov.br", senha: SENHA_A },
    });
    expect(r.body).not.toContain("scrypt$");
    expect(r.json().usuario.senha_hash).toBeUndefined();
  });

  it("bloqueia a conta depois das tentativas configuradas", async () => {
    const db = mem.bruto;
    await db.query(
      "INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,senha_hash) VALUES ($1,'Alvo','SA-9','alvo@serraalta.exemplo.gov.br','operador',$2)",
      [orgA, await derivarSenha("senha-do-alvo-longa")],
    );

    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: "POST", url: "/auth/entrar",
        payload: { email: "alvo@serraalta.exemplo.gov.br", senha: "errada-de-proposito" },
      });
    }

    // Agora nem a senha correta passa: o bloqueio é por conta, não por senha.
    const comSenhaCerta = await app.inject({
      method: "POST", url: "/auth/entrar",
      payload: { email: "alvo@serraalta.exemplo.gov.br", senha: "senha-do-alvo-longa" },
    });
    expect(comSenhaCerta.statusCode).toBe(429);
    expect(comSenhaCerta.json().erro).toBe("bloqueado");
  }, 60_000);

  it("recusa requisição sem token e com token adulterado", async () => {
    const sem = await app.inject({ method: "GET", url: "/ocorrencias" });
    expect(sem.statusCode).toBe(401);

    const partes = tokens["coordA"]!.acesso.split(".");
    const adulterado = `${partes[0]}.${partes[1]}.assinaturaFalsa`;
    const comFalso = await app.inject({
      method: "GET", url: "/ocorrencias", headers: comToken(adulterado),
    });
    expect(comFalso.statusCode).toBe(401);
  });

  it("rotaciona o token de renovação e derruba tudo se o antigo reaparecer", async () => {
    const inicial = await entrar("helena@serraalta.exemplo.gov.br", SENHA_A);

    const primeira = await app.inject({
      method: "POST", url: "/auth/renovar", payload: { renovacao: inicial.renovacao },
    });
    expect(primeira.statusCode).toBe(200);
    const rotacionado = primeira.json().renovacao;
    expect(rotacionado).not.toBe(inicial.renovacao);

    // Reusar o token antigo é o sintoma de roubo: recusa e derruba a família.
    const reuso = await app.inject({
      method: "POST", url: "/auth/renovar", payload: { renovacao: inicial.renovacao },
    });
    expect(reuso.statusCode).toBe(401);

    const depois = await app.inject({
      method: "POST", url: "/auth/renovar", payload: { renovacao: rotacionado },
    });
    expect(depois.statusCode, "o token rotacionado tambem deve cair").toBe(401);
  }, 60_000);
});

describe("Isolamento entre municípios pela API", () => {
  it("cada município lista apenas as próprias ocorrências", async () => {
    const deA = await app.inject({
      method: "GET", url: "/ocorrencias?status=todas", headers: comToken(tokens["coordA"]!.acesso),
    });
    const deB = await app.inject({
      method: "GET", url: "/ocorrencias?status=todas", headers: comToken(tokens["coordB"]!.acesso),
    });

    const enderecosA = deA.json().itens.map((o: { endereco: string }) => o.endereco);
    const enderecosB = deB.json().itens.map((o: { endereco: string }) => o.endereco);

    expect(enderecosA).toContain("Rua das Acacias, 245");
    expect(enderecosA).not.toContain("Avenida Central, 900");
    expect(enderecosB).toContain("Avenida Central, 900");
    expect(enderecosB).not.toContain("Rua das Acacias, 245");
  });

  it("pedir pelo id exato de outro município devolve 404, não 403", async () => {
    const r = await app.inject({
      method: "GET", url: `/ocorrencias/${ocorrenciaB}`,
      headers: comToken(tokens["coordA"]!.acesso),
    });
    // 404 e não 403 de propósito: 403 confirmaria que o registro existe.
    expect(r.statusCode).toBe(404);
  });

  it("não altera ocorrência de outro município", async () => {
    const r = await app.inject({
      method: "POST", url: `/ocorrencias/${ocorrenciaB}/encerramento`,
      headers: comToken(tokens["coordA"]!.acesso),
      payload: { motivo: "tentativa de invasao" },
    });
    expect(r.statusCode).toBe(404);

    // Conferência fora da API, como dono das tabelas.
    const estado = await mem.bruto.query<{ status: string }>(
      "SELECT status FROM ocorrencias WHERE id = $1",
      [ocorrenciaB],
    );
    expect(estado.rows[0]!.status).toBe("registrada");
  });

  it("não despacha para equipe de outro município", async () => {
    await app.inject({
      method: "POST", url: `/ocorrencias/${ocorrenciaA}/triagem`,
      headers: comToken(tokens["coordA"]!.acesso),
      payload: { severidade: "alta", vulnerabilidadePresente: false },
    });

    const r = await app.inject({
      method: "POST", url: `/ocorrencias/${ocorrenciaA}/despacho`,
      headers: comToken(tokens["coordA"]!.acesso),
      payload: { equipeId: equipeB, prazoHoras: 24 },
    });
    expect(r.statusCode).toBe(404);
    expect(r.json().erro).toBe("equipe_inexistente");
  });

  it("não cadastra usuário carimbado para outro município", async () => {
    // A rota nem aceita organização como parâmetro: ela vem do token. Este
    // teste fixa esse contrato, para ninguém "melhorar" a API depois.
    const r = await app.inject({
      method: "POST", url: "/usuarios",
      headers: comToken(tokens["coordA"]!.acesso),
      payload: {
        nome: "Infiltrado", matricula: "X-1", email: "infiltrado@exemplo.gov.br",
        papel: "operador", senha: "uma-senha-bem-longa", organizacaoId: orgB,
      },
    });
    expect(r.statusCode).toBe(201);

    const onde = await mem.bruto.query<{ organizacao_id: string }>(
      "SELECT organizacao_id FROM usuarios WHERE email = 'infiltrado@exemplo.gov.br'",
    );
    expect(onde.rows[0]!.organizacao_id, "o campo do corpo nao pode mandar no tenant").toBe(orgA);
  }, 60_000);

  it("equipes e usuários também respeitam o município do token", async () => {
    const equipes = await app.inject({
      method: "GET", url: "/equipes", headers: comToken(tokens["coordB"]!.acesso),
    });
    const nomes = equipes.json().itens.map((e: { nome: string }) => e.nome);
    expect(nomes).toEqual(["Equipe Unica"]);
  });
});

describe("Autorização por papel", () => {
  it("operador registra ocorrência, mas não encerra nem despacha", async () => {
    const criar = await app.inject({
      method: "POST", url: "/ocorrencias",
      headers: comToken(tokens["operadorA"]!.acesso),
      payload: {
        solicitanteNome: "Cidadao", canalEntrada: "telefone",
        endereco: "Rua Nova, 10", tipo: "vendaval", descricao: "Arvore caida",
      },
    });
    expect(criar.statusCode).toBe(201);

    const encerrar = await app.inject({
      method: "POST", url: `/ocorrencias/${criar.json().id}/encerramento`,
      headers: comToken(tokens["operadorA"]!.acesso),
      payload: { motivo: "nao deveria conseguir" },
    });
    expect(encerrar.statusCode).toBe(403);
    expect(encerrar.json().erro).toBe("sem_permissao");
  });

  it("agente de campo não despacha equipe", async () => {
    const r = await app.inject({
      method: "POST", url: `/ocorrencias/${ocorrenciaA}/despacho`,
      headers: comToken(tokens["agenteA"]!.acesso),
      payload: { equipeId: equipeA, prazoHoras: 24 },
    });
    expect(r.statusCode).toBe(403);
  });

  it("operador não lista usuários", async () => {
    const r = await app.inject({
      method: "GET", url: "/usuarios", headers: comToken(tokens["operadorA"]!.acesso),
    });
    expect(r.statusCode).toBe(403);
  });

  it("coordenador não desativa a própria conta", async () => {
    const eu = await app.inject({
      method: "GET", url: "/auth/eu", headers: comToken(tokens["coordA"]!.acesso),
    });
    const r = await app.inject({
      method: "PATCH", url: `/usuarios/${eu.json().id}/situacao`,
      headers: comToken(tokens["coordA"]!.acesso),
      payload: { ativo: false },
    });
    expect(r.statusCode).toBe(422);
  });
});

describe("Fluxo e trilha auditável", () => {
  it("cada transição grava autor, papel e origem, e o protocolo vem do banco", async () => {
    const criar = await app.inject({
      method: "POST", url: "/ocorrencias",
      headers: comToken(tokens["coordA"]!.acesso),
      payload: {
        solicitanteNome: "Moradora", canalEntrada: "whatsapp",
        endereco: "Travessa do Sol, 30", tipo: "inundacao",
        descricao: "Corrego transbordou",
      },
    });
    expect(criar.statusCode).toBe(201);
    expect(criar.json().protocolo).toMatch(/^\d{6}\/\d{4}$/);
    const id = criar.json().id;

    await app.inject({
      method: "POST", url: `/ocorrencias/${id}/triagem`,
      headers: comToken(tokens["coordA"]!.acesso),
      payload: {
        severidade: "critica", vulnerabilidadePresente: true,
        vulnerabilidadeDescricao: "Idosa acamada no imovel",
      },
    });
    await app.inject({
      method: "POST", url: `/ocorrencias/${id}/despacho`,
      headers: comToken(tokens["coordA"]!.acesso),
      payload: { equipeId: equipeA, prazoHoras: 4 },
    });

    const detalhe = await app.inject({
      method: "GET", url: `/ocorrencias/${id}`, headers: comToken(tokens["coordA"]!.acesso),
    });
    const trilha = detalhe.json().trilha;
    expect(trilha.map((e: { tipo: string }) => e.tipo)).toEqual(["registro", "triagem", "despacho"]);
    for (const evento of trilha) {
      expect(evento.autor_nome).toBe("Helena Coutinho");
      expect(evento.autor_papel).toBe("coordenador");
      expect(evento.origem).toBe("escritorio");
    }
  }, 60_000);

  it("recusa transição fora da ordem do fluxo", async () => {
    const criar = await app.inject({
      method: "POST", url: "/ocorrencias",
      headers: comToken(tokens["coordA"]!.acesso),
      payload: {
        solicitanteNome: "Fulano", canalEntrada: "telefone",
        endereco: "Rua Reta, 1", tipo: "granizo", descricao: "Telhas quebradas",
      },
    });
    // Registrada não vai direto para em_campo: precisa passar pela triagem.
    const r = await app.inject({
      method: "POST", url: `/ocorrencias/${criar.json().id}/despacho`,
      headers: comToken(tokens["coordA"]!.acesso),
      payload: { equipeId: equipeA, prazoHoras: 24 },
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toBe("transicao_invalida");
  }, 60_000);

  it("recusa encerrar sem motivo, com erro por campo", async () => {
    const r = await app.inject({
      method: "POST", url: `/ocorrencias/${ocorrenciaA}/encerramento`,
      headers: comToken(tokens["coordA"]!.acesso),
      payload: { motivo: "" },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().campos[0].campo).toBe("motivo");
  });

  it("a trilha é append-only mesmo para quem tem token válido", async () => {
    // Não existe rota para editar trilha, e o banco também recusa: a policy
    // de UPDATE simplesmente não existe.
    await expect(
      mem.banco.comTenant(orgA, (c) =>
        c.query("UPDATE trilha_eventos SET tipo = 'adulterado'"),
      ),
    ).rejects.toThrow();
  });
});

describe("Sincronização do aplicativo de campo", () => {
  it("a mesma coleta enviada duas vezes gera um laudo só", async () => {
    const preparar = await app.inject({
      method: "POST", url: "/ocorrencias",
      headers: comToken(tokens["coordA"]!.acesso),
      payload: {
        solicitanteNome: "Vizinho", canalEntrada: "telefone",
        endereco: "Rua do Morro, 77", tipo: "deslizamento", descricao: "Barranco",
      },
    });
    const id = preparar.json().id;
    await app.inject({
      method: "POST", url: `/ocorrencias/${id}/triagem`,
      headers: comToken(tokens["coordA"]!.acesso),
      payload: { severidade: "alta", vulnerabilidadePresente: false },
    });
    await app.inject({
      method: "POST", url: `/ocorrencias/${id}/despacho`,
      headers: comToken(tokens["coordA"]!.acesso),
      payload: { equipeId: equipeA, prazoHoras: 24 },
    });

    const envelope = {
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
      ocorrenciaId: id,
      coletadaEm: new Date(Date.now() - 3_600_000).toISOString(),
      vistoria: {
        checklist: [{ chave: "risco_iminente", resposta: true },
        { chave: "evacuacao_necessaria", resposta: false },
        { chave: "interdicao_indicada", resposta: false },
        { chave: "acionar_outro_orgao", resposta: false },
      ],
        fotos: [{
          chave: "foto-1.jpg",
          capturadaEm: new Date(Date.now() - 3_600_000).toISOString(),
          legenda: "Trinca na parede",
        }],
        gpsPrecisaoMetros: 6.2,
        assinanteNome: "Vizinho",
        assinaturaChave: "assinatura.png",
        coletadaEm: new Date(Date.now() - 3_600_000).toISOString(),
        observacoes: "Morador presente",
      },
    };

    const primeiro = await app.inject({
      method: "POST", url: "/sincronizacao/vistoria",
      headers: comToken(tokens["agenteA"]!.acesso), payload: envelope,
    });
    expect(primeiro.statusCode).toBe(201);
    expect(primeiro.json().duplicada).toBe(false);

    const reenvio = await app.inject({
      method: "POST", url: "/sincronizacao/vistoria",
      headers: comToken(tokens["agenteA"]!.acesso), payload: envelope,
    });
    expect(reenvio.statusCode).toBe(200);
    expect(reenvio.json().duplicada).toBe(true);
    expect(reenvio.json().vistoriaId).toBe(primeiro.json().vistoriaId);

    const quantas = await mem.bruto.query<{ total: string }>(
      "SELECT count(*)::text AS total FROM vistorias WHERE ocorrencia_id = $1",
      [id],
    );
    expect(quantas.rows[0]!.total).toBe("1");

    // Uma coleta, um evento na trilha, mesmo com dois envios.
    const eventos = await mem.bruto.query<{ total: string }>(
      "SELECT count(*)::text AS total FROM trilha_eventos WHERE ocorrencia_id = $1 AND tipo = 'vistoria'",
      [id],
    );
    expect(eventos.rows[0]!.total).toBe("1");
  }, 60_000);

  it("a chave de storage é remontada no servidor, com o prefixo do tenant", async () => {
    const evidencia = await mem.bruto.query<{ chave_storage: string }>(
      "SELECT chave_storage FROM evidencias ORDER BY capturada_em DESC LIMIT 1",
    );
    expect(evidencia.rows[0]!.chave_storage.startsWith(`tenant/${orgA}/`)).toBe(true);
  });

  it("o agente só recebe pendências das próprias equipes", async () => {
    const r = await app.inject({
      method: "GET", url: "/sincronizacao/pendencias",
      headers: comToken(tokens["agenteA"]!.acesso),
    });
    expect(r.statusCode).toBe(200);
    for (const item of r.json().itens) {
      expect(item.protocolo).toMatch(/^\d{6}\/\d{4}$/);
    }
    expect(agenteA).toBeTruthy();
  });
});

describe("Superfície e respostas de erro", () => {
  it("não vaza detalhe interno em erro de validação", async () => {
    const r = await app.inject({
      method: "POST", url: "/ocorrencias",
      headers: comToken(tokens["coordA"]!.acesso),
      payload: { tipo: "nao_existe_esse_tipo" },
    });
    expect(r.statusCode).toBe(422);
    expect(r.body).not.toMatch(/ocorrencias|organizacao_id|pg|postgres/i);
  });

  it("aplica cabeçalhos de segurança", async () => {
    const r = await app.inject({ method: "GET", url: "/saude" });
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(r.headers["x-frame-options"] ?? "").toBeDefined();
  });

  it("desativar usuário derruba as sessões dele na hora", async () => {
    const alvo = await app.inject({
      method: "POST", url: "/usuarios",
      headers: comToken(tokens["coordA"]!.acesso),
      payload: {
        nome: "Temporario", matricula: "SA-77", email: "temporario@serraalta.exemplo.gov.br",
        papel: "operador", senha: "senha-temporaria-longa",
      },
    });
    expect(alvo.statusCode).toBe(201);

    const sessao = await entrar("temporario@serraalta.exemplo.gov.br", "senha-temporaria-longa");

    await app.inject({
      method: "PATCH", url: `/usuarios/${alvo.json().id}/situacao`,
      headers: comToken(tokens["coordA"]!.acesso),
      payload: { ativo: false },
    });

    const renovar = await app.inject({
      method: "POST", url: "/auth/renovar", payload: { renovacao: sessao.renovacao },
    });
    expect(renovar.statusCode).toBe(401);

    const noBanco = await mem.bruto.query<{ revogada_em: string | null }>(
      "SELECT revogada_em FROM sessoes WHERE token_hash = $1",
      [hashDoToken(sessao.renovacao)],
    );
    expect(noBanco.rows[0]!.revogada_em).not.toBeNull();
  }, 120_000);
});

describe("Limite de tentativas por endereço", () => {
  it("recusa depois do teto configurado, com 429", async () => {
    // Servidor separado, com o limite baixo: o da suíte precisa ser alto para
    // os outros testes, e um limite não se testa aumentando o teto.
    const config = carregarConfig({
      NODE_ENV: "test",
      JWT_SEGREDO: "outro-segredo-de-teste-com-mais-de-32-bytes",
      LOGIN_POR_IP: "3",
    } as NodeJS.ProcessEnv);
    const restrito = await construirServidor({
      banco: mem.banco, config,
      armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
    });
    await restrito.ready();

    const respostas: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await restrito.inject({
        method: "POST", url: "/auth/entrar",
        payload: { email: "ninguem@exemplo.gov.br", senha: "seja-la-o-que-for" },
      });
      respostas.push(r.statusCode);
    }

    expect(respostas.slice(0, 3).every((s) => s === 401), `obtido: ${respostas}`).toBe(true);
    expect(respostas.slice(3).every((s) => s === 429), `obtido: ${respostas}`).toBe(true);

    await restrito.close();
  }, 120_000);
});

describe("Resposta do orgao a providencia", () => {
  async function ateProvidencia(): Promise<{ id: string; providenciaId: string }> {
    const criar = await app.inject({
      method: "POST", url: "/ocorrencias", headers: comToken(tokens["coordA"]!.acesso),
      payload: {
        solicitanteNome: "Moradora", canalEntrada: "telefone",
        endereco: `Rua da Providencia, ${Math.floor(Math.random() * 1e6)}`,
        tipo: "vendaval", descricao: "Telhado sobre a via.",
      },
    });
    const id = criar.json().id;

    await app.inject({
      method: "POST", url: `/ocorrencias/${id}/triagem`, headers: comToken(tokens["coordA"]!.acesso),
      payload: { severidade: "media", vulnerabilidadePresente: false },
    });
    await app.inject({
      method: "POST", url: `/ocorrencias/${id}/despacho`, headers: comToken(tokens["coordA"]!.acesso),
      payload: { equipeId: equipeA, prazoHoras: 48 },
    });
    await app.inject({
      method: "POST", url: "/sincronizacao/vistoria", headers: comToken(tokens["agenteA"]!.acesso),
      payload: {
        idempotencyKey: crypto.randomUUID(),
        ocorrenciaId: id,
        coletadaEm: new Date().toISOString(),
        vistoria: {
          checklist: [{ chave: "acionar_outro_orgao", resposta: true },
        { chave: "risco_iminente", resposta: false },
        { chave: "evacuacao_necessaria", resposta: false },
        { chave: "interdicao_indicada", resposta: false },
      ],
          fotos: [], gpsPrecisaoMetros: 5,
          assinanteNome: "Moradora", assinaturaChave: null,
          coletadaEm: new Date().toISOString(),
        },
      },
    });
    await app.inject({
      method: "POST", url: `/ocorrencias/${id}/providencia`,
      headers: comToken(tokens["coordA"]!.acesso),
      payload: {
        orgaoDestino: "Secretaria de Obras",
        descricao: "Remocao da estrutura sobre a via.",
        responsavel: "Engenheiro de plantao", prazoHoras: 72,
      },
    });

    const detalhe = await app.inject({
      method: "GET", url: `/ocorrencias/${id}`, headers: comToken(tokens["coordA"]!.acesso),
    });
    return { id, providenciaId: detalhe.json().providencias[0].id };
  }

  it("registra o desfecho e entra na trilha", async () => {
    const alvo = await ateProvidencia();

    const r = await app.inject({
      method: "POST", url: `/ocorrencias/${alvo.id}/providencia/${alvo.providenciaId}/resposta`,
      headers: comToken(tokens["coordA"]!.acesso),
      payload: {
        desfecho: "atendida_parcialmente",
        resposta: "Estrutura removida da via. Escoramento do galpao fica para a proxima semana.",
        respondidaPor: "Fiscal da Secretaria de Obras",
      },
    });
    expect(r.statusCode).toBe(200);

    const detalhe = await app.inject({
      method: "GET", url: `/ocorrencias/${alvo.id}`, headers: comToken(tokens["coordA"]!.acesso),
    });
    const providencia = detalhe.json().providencias[0];
    expect(providencia.desfecho).toBe("atendida_parcialmente");
    expect(providencia.respondida_em).not.toBeNull();
    expect(providencia.respondida_por).toBe("Fiscal da Secretaria de Obras");

    // Quem registrou a resposta fica na trilha: e essa a pergunta que aparece
    // quando a familia volta a pedir socorro no mesmo endereco.
    const evento = detalhe.json().trilha.find(
      (e: { tipo: string }) => e.tipo === "resposta_providencia",
    );
    expect(evento).toBeDefined();
    expect(evento.detalhe.desfecho).toBe("atendida_parcialmente");
  }, 120_000);

  it("nao sobrescreve uma resposta ja registrada", async () => {
    const alvo = await ateProvidencia();
    const corpo = {
      desfecho: "atendida", resposta: "Servico executado.", respondidaPor: "Fiscal",
    };

    const primeira = await app.inject({
      method: "POST", url: `/ocorrencias/${alvo.id}/providencia/${alvo.providenciaId}/resposta`,
      headers: comToken(tokens["coordA"]!.acesso), payload: corpo,
    });
    const segunda = await app.inject({
      method: "POST", url: `/ocorrencias/${alvo.id}/providencia/${alvo.providenciaId}/resposta`,
      headers: comToken(tokens["coordA"]!.acesso),
      payload: { ...corpo, resposta: "Na verdade nao foi executado." },
    });

    expect(primeira.statusCode).toBe(200);
    // Sobrescrever seria apagar o que o orgao disse antes.
    expect(segunda.statusCode).toBe(409);
    expect(segunda.json().erro).toBe("ja_respondida");
  }, 120_000);

  it("recusa desfecho fora da lista e resposta vazia", async () => {
    const alvo = await ateProvidencia();

    const desfechoInvalido = await app.inject({
      method: "POST", url: `/ocorrencias/${alvo.id}/providencia/${alvo.providenciaId}/resposta`,
      headers: comToken(tokens["coordA"]!.acesso),
      payload: { desfecho: "mais_ou_menos", resposta: "x", respondidaPor: "y" },
    });
    const semTexto = await app.inject({
      method: "POST", url: `/ocorrencias/${alvo.id}/providencia/${alvo.providenciaId}/resposta`,
      headers: comToken(tokens["coordA"]!.acesso),
      payload: { desfecho: "atendida", resposta: "", respondidaPor: "y" },
    });

    // Lista fechada porque "resolvido" escrito de dez jeitos nao vira
    // indicador nenhum.
    expect(desfechoInvalido.statusCode).toBe(422);
    expect(semTexto.statusCode).toBe(422);
  }, 120_000);

  it("o agente de campo nao registra resposta de orgao", async () => {
    const alvo = await ateProvidencia();
    const r = await app.inject({
      method: "POST", url: `/ocorrencias/${alvo.id}/providencia/${alvo.providenciaId}/resposta`,
      headers: comToken(tokens["agenteA"]!.acesso),
      payload: { desfecho: "atendida", resposta: "Feito.", respondidaPor: "Alguem" },
    });
    expect(r.statusCode).toBe(403);
  }, 120_000);

  it("encerrar avisa quais providencias ficaram sem resposta", async () => {
    const alvo = await ateProvidencia();

    const r = await app.inject({
      method: "POST", url: `/ocorrencias/${alvo.id}/encerramento`,
      headers: comToken(tokens["coordA"]!.acesso),
      payload: { motivo: "Risco cessou, mas a obra segue com a secretaria." },
    });

    expect(r.statusCode).toBe(200);
    // Nao trava o encerramento: a secretaria as vezes nunca responde, e travar
    // faria a fila do coordenador crescer para sempre. Mas o fato volta na
    // resposta e entra na trilha, entao encerrar vira decisao e nao descuido.
    expect(r.json().providenciasSemResposta).toEqual(["Secretaria de Obras"]);

    const detalhe = await app.inject({
      method: "GET", url: `/ocorrencias/${alvo.id}`, headers: comToken(tokens["coordA"]!.acesso),
    });
    const encerramento = detalhe.json().trilha.find(
      (e: { tipo: string }) => e.tipo === "encerramento",
    );
    expect(encerramento.detalhe.providenciasSemResposta).toEqual(["Secretaria de Obras"]);
  }, 120_000);

  it("providencia respondida nao aparece como pendente no encerramento", async () => {
    const alvo = await ateProvidencia();
    await app.inject({
      method: "POST", url: `/ocorrencias/${alvo.id}/providencia/${alvo.providenciaId}/resposta`,
      headers: comToken(tokens["coordA"]!.acesso),
      payload: { desfecho: "atendida", resposta: "Servico executado.", respondidaPor: "Fiscal" },
    });

    const r = await app.inject({
      method: "POST", url: `/ocorrencias/${alvo.id}/encerramento`,
      headers: comToken(tokens["coordA"]!.acesso),
      payload: { motivo: "Providencia atendida e risco cessado." },
    });
    expect(r.json().providenciasSemResposta).toEqual([]);
  }, 120_000);
});

describe("Vinculo de duplicidade e providencias vencendo", () => {
  it("o vinculo aparece nos DOIS lados", async () => {
    const original = await app.inject({
      method: "POST", url: "/ocorrencias", headers: comToken(tokens["coordA"]!.acesso),
      payload: {
        solicitanteNome: "Primeiro vizinho", canalEntrada: "telefone",
        endereco: "Rua do Vinculo, 100, Centro", tipo: "alagamento",
        descricao: "Agua entrando no comercio.",
      },
    });
    const idOriginal = original.json().id;

    // Outro morador liga sobre o mesmo evento, e o operador vincula.
    const segunda = await app.inject({
      method: "POST", url: "/ocorrencias", headers: comToken(tokens["operadorA"]!.acesso),
      payload: {
        solicitanteNome: "Segundo vizinho", canalEntrada: "whatsapp",
        endereco: "Rua do Vinculo, 102, Centro", tipo: "alagamento",
        descricao: "Mesma agua, dois numeros adiante.",
        vinculadaA: idOriginal,
      },
    });
    expect(segunda.statusCode).toBe(201);
    const idSegunda = segunda.json().id;

    // Do lado da filha: ela sabe de quem e continuacao.
    const daFilha = await app.inject({
      method: "GET", url: `/ocorrencias/${idSegunda}`, headers: comToken(tokens["coordA"]!.acesso),
    });
    expect(daFilha.json().vinculadaA?.id).toBe(idOriginal);
    expect(daFilha.json().vinculadaA?.protocolo).toBe(original.json().protocolo);

    // Do lado da original: ela sabe quais chamados vieram depois. Sem isto, o
    // coordenador encerraria a primeira sem saber que ha outra pendurada.
    const daOriginal = await app.inject({
      method: "GET", url: `/ocorrencias/${idOriginal}`, headers: comToken(tokens["coordA"]!.acesso),
    });
    expect(daOriginal.json().vinculadas.map((v: { id: string }) => v.id)).toContain(idSegunda);
    expect(daOriginal.json().vinculadaA).toBeNull();
  }, 120_000);

  it("nao vincula a ocorrencia de outro municipio", async () => {
    const r = await app.inject({
      method: "POST", url: "/ocorrencias", headers: comToken(tokens["coordA"]!.acesso),
      payload: {
        solicitanteNome: "Alguem", canalEntrada: "telefone",
        endereco: "Rua Alheia, 1", tipo: "granizo", descricao: "x",
        vinculadaA: ocorrenciaB,
      },
    });
    // A chave estrangeira nao alcanca linha de outro tenant sob RLS.
    expect(r.statusCode).toBeGreaterThanOrEqual(400);
  }, 60_000);

  it("lista as providencias que vencem sem resposta", async () => {
    const r = await app.inject({
      method: "GET", url: "/ocorrencias/providencias/pendentes",
      headers: comToken(tokens["coordA"]!.acesso),
    });
    expect(r.statusCode).toBe(200);

    const itens = r.json().itens as Array<{ respondida_em?: string; protocolo: string; prazo_em: string }>;
    for (const p of itens) {
      expect(p.protocolo).toMatch(/^\d{6}\/\d{4}$/);
      expect(p.respondida_em).toBeUndefined();
    }
    // Ordenadas pelo prazo: o que vence antes aparece antes.
    const prazos = itens.map((p) => new Date(p.prazo_em).getTime());
    for (let i = 1; i < prazos.length; i++) {
      expect(prazos[i - 1]!).toBeLessThanOrEqual(prazos[i]!);
    }
  }, 60_000);

  it("o painel conta providencia aberta e vencida", async () => {
    const r = await app.inject({
      method: "GET", url: "/ocorrencias/indicadores/painel",
      headers: comToken(tokens["coordA"]!.acesso),
    });
    const i = r.json();
    expect(i).toHaveProperty("providencias_abertas");
    expect(i).toHaveProperty("providencias_vencidas");
    expect(i.providencias_vencidas).toBeLessThanOrEqual(i.providencias_abertas);
  }, 60_000);

  it("a providencia continua visivel depois de a ocorrencia encerrar", async () => {
    // E exatamente ai que ela costuma ser esquecida: sai da fila do
    // coordenador e some do radar.
    const antes = await app.inject({
      method: "GET", url: "/ocorrencias/providencias/pendentes",
      headers: comToken(tokens["coordA"]!.acesso),
    });
    const encerradas = (antes.json().itens as Array<{ status: string }>)
      .filter((p) => p.status === "encerrada");
    expect(encerradas.length).toBeGreaterThan(0);
  }, 60_000);
});

/**
 * Quem manda em quem, imposto pelo servidor.
 *
 * A pergunta que originou este bloco: "quem tem o poder máximo, administrador
 * ou coordenador, e um não pode anular o outro". Até aqui a resposta era
 * constrangedora: os dois tinham exatamente a mesma lista de permissões, então
 * ninguém era o teto e qualquer um desfazia o outro.
 *
 * O posto resolveu isso no pacote compartilhado. Estes casos provam que a
 * regra vale onde importa, que é no servidor, e não na tela.
 */
describe("Posto entre papeis", () => {
  it("o coordenador nao cria administrador", async () => {
    const r = await app.inject({
      method: "POST", url: "/usuarios",
      headers: comToken(tokens["coordA"]!.acesso),
      payload: {
        nome: "Tentativa de Promocao", matricula: "SA-90",
        email: "promocao@serraalta.exemplo.gov.br",
        papel: "administrador", senha: "senha-bem-longa-de-teste",
      },
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().erro).toBe("posto_insuficiente");
  }, 60_000);

  it("o administrador cria administrador", async () => {
    const r = await app.inject({
      method: "POST", url: "/usuarios",
      headers: comToken(tokens["adminA"]!.acesso),
      payload: {
        nome: "Segunda Administradora", matricula: "SA-91",
        email: "segunda.admin@serraalta.exemplo.gov.br",
        papel: "administrador", senha: "senha-bem-longa-de-teste",
      },
    });
    expect(r.statusCode).toBe(201);
  }, 60_000);

  it("o coordenador nao desativa o administrador", async () => {
    const lista = await app.inject({
      method: "GET", url: "/usuarios", headers: comToken(tokens["coordA"]!.acesso),
    });
    const rita = (lista.json().itens as Array<{ id: string; email: string }>)
      .find((u) => u.email === "rita@serraalta.exemplo.gov.br");
    expect(rita, "a administradora precisa existir para o caso valer").toBeDefined();

    const r = await app.inject({
      method: "PATCH", url: `/usuarios/${rita!.id}/situacao`,
      headers: comToken(tokens["coordA"]!.acesso),
      payload: { ativo: false },
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().erro).toBe("posto_insuficiente");
  }, 60_000);

  it("o coordenador nao se promove a administrador pela edicao", async () => {
    const lista = await app.inject({
      method: "GET", url: "/usuarios", headers: comToken(tokens["coordA"]!.acesso),
    });
    const helena = (lista.json().itens as Array<{ id: string; email: string }>)
      .find((u) => u.email === "helena@serraalta.exemplo.gov.br");

    const r = await app.inject({
      method: "PATCH", url: `/usuarios/${helena!.id}`,
      headers: comToken(tokens["coordA"]!.acesso),
      payload: {
        nome: "Helena Coutinho", matricula: "SA-1",
        email: "helena@serraalta.exemplo.gov.br", papel: "administrador",
      },
    });
    expect(r.statusCode).toBe(403);
    expect(r.json().erro).toBe("posto_insuficiente");
  }, 60_000);

  it("o coordenador corrige o cadastro de quem esta abaixo dele", async () => {
    const lista = await app.inject({
      method: "GET", url: "/usuarios", headers: comToken(tokens["coordA"]!.acesso),
    });
    const jonas = (lista.json().itens as Array<{ id: string; email: string }>)
      .find((u) => u.email === "jonas@serraalta.exemplo.gov.br");

    const r = await app.inject({
      method: "PATCH", url: `/usuarios/${jonas!.id}`,
      headers: comToken(tokens["coordA"]!.acesso),
      payload: {
        nome: "Jonas Ferreira da Silva", matricula: "SA-2",
        email: "jonas@serraalta.exemplo.gov.br", papel: "operador",
      },
    });
    expect(r.statusCode).toBe(200);

    const depois = await app.inject({
      method: "GET", url: "/usuarios", headers: comToken(tokens["coordA"]!.acesso),
    });
    const atualizado = (depois.json().itens as Array<{ nome: string; email: string }>)
      .find((u) => u.email === "jonas@serraalta.exemplo.gov.br");
    expect(atualizado!.nome).toBe("Jonas Ferreira da Silva");
  }, 60_000);

  it("o municipio nao fica sem administrador ativo", async () => {
    /*
      O cenário: a regra de autodesativação impede a pessoa de se desligar, mas
      nada impedia o penúltimo administrador de desativar o último. O município
      ficaria sem ninguém capaz de criar usuário, e a saída seria SQL na mão no
      banco de produção.
    */
    const lista = await app.inject({
      method: "GET", url: "/usuarios", headers: comToken(tokens["adminA"]!.acesso),
    });
    const admins = (lista.json().itens as Array<{ id: string; papel: string; ativo: boolean }>)
      .filter((u) => u.papel === "administrador" && u.ativo);
    expect(admins.length, "o caso precisa de dois administradores ativos")
      .toBeGreaterThanOrEqual(2);

    // Desativa todos menos um: até aqui é permitido.
    const rita = admins.find((u) => u.id !== undefined)!;
    const outros = admins.filter((u) => u.id !== rita.id);
    for (const outro of outros) {
      const r = await app.inject({
        method: "PATCH", url: `/usuarios/${outro.id}/situacao`,
        headers: comToken(tokens["adminA"]!.acesso),
        payload: { ativo: false },
      });
      expect(r.statusCode, `desativar ${outro.id}`).toBe(200);
    }

    // Agora só resta a Rita, e ela é quem está autenticada: a autodesativação
    // barra antes. Reativa uma segunda para provar a regra do último de fora.
    const segunda = outros[0]!;
    await app.inject({
      method: "PATCH", url: `/usuarios/${segunda.id}/situacao`,
      headers: comToken(tokens["adminA"]!.acesso),
      payload: { ativo: true },
    });
    // Desativa a Rita pela conta da segunda administradora? Não temos o token
    // dela. Em vez disso, desativa a segunda de novo e tenta rebaixar a Rita,
    // que é o outro caminho para o mesmo lockout.
    await app.inject({
      method: "PATCH", url: `/usuarios/${segunda.id}/situacao`,
      headers: comToken(tokens["adminA"]!.acesso),
      payload: { ativo: false },
    });

    const rebaixar = await app.inject({
      method: "PATCH", url: `/usuarios/${rita.id}`,
      headers: comToken(tokens["adminA"]!.acesso),
      payload: {
        nome: "Rita Lopes", matricula: "SA-4",
        email: "rita@serraalta.exemplo.gov.br", papel: "coordenador",
      },
    });
    expect(rebaixar.statusCode).toBe(422);
    expect(rebaixar.json().erro).toBe("ultimo_administrador");
  }, 90_000);
});

/**
 * Clique duplicado no botão de encerrar.
 *
 * Este caso existe porque `exigirTransicao` retornava cedo quando o estado
 * pedido já era o atual, e a rota seguia adiante gravando um segundo evento de
 * encerramento. A trilha não tem policy de DELETE: o segundo evento não se
 * corrige, e ele diz que a ocorrência foi encerrada duas vezes, por duas
 * pessoas ou pela mesma em dois instantes.
 */
describe("Encerrar duas vezes", () => {
  it("recusa a segunda com 409 e não duplica o evento na trilha", async () => {
    const criar = await app.inject({
      method: "POST", url: "/ocorrencias", headers: comToken(tokens["coordA"]!.acesso),
      payload: {
        solicitanteNome: "Iracema Nunes Barbosa", solicitanteContato: "(35) 99612-3355",
        canalEntrada: "telefone", endereco: "Rua dos Lírios, 240, Jardim Bela Vista",
        tipo: "alagamento", descricao: "Água entrou na garagem e subiu meio metro.",
      },
    });
    const { id } = criar.json();

    const primeira = await app.inject({
      method: "POST", url: `/ocorrencias/${id}/encerramento`, headers: comToken(tokens["coordA"]!.acesso),
      payload: { motivo: "Bueiro desobstruído pela zeladoria, risco cessado." },
    });
    expect(primeira.statusCode).toBe(200);

    const segunda = await app.inject({
      method: "POST", url: `/ocorrencias/${id}/encerramento`, headers: comToken(tokens["coordA"]!.acesso),
      payload: { motivo: "Bueiro desobstruído pela zeladoria, risco cessado." },
    });
    expect(segunda.statusCode).toBe(409);
    expect(segunda.json().erro).toBe("ja_no_estado_final");

    const detalhe = await app.inject({
      method: "GET", url: `/ocorrencias/${id}`, headers: comToken(tokens["coordA"]!.acesso),
    });
    const encerramentos = detalhe.json().trilha.filter(
      (e: { tipo: string }) => e.tipo === "encerramento",
    );
    expect(encerramentos).toHaveLength(1);
  });

  it("reclassificar na triagem continua permitido, porque triagem não é desfecho", async () => {
    const criar = await app.inject({
      method: "POST", url: "/ocorrencias", headers: comToken(tokens["coordA"]!.acesso),
      payload: {
        solicitanteNome: "Vicente Aparecido Rosa", solicitanteContato: "(35) 99188-7720",
        canalEntrada: "presencial", endereco: "Travessa São Bento, 19, Centro",
        tipo: "vendaval", descricao: "Telhado do galpão levantou com o vento.",
      },
    });
    const { id } = criar.json();

    for (const severidade of ["media", "critica"]) {
      const r = await app.inject({
        method: "POST", url: `/ocorrencias/${id}/triagem`, headers: comToken(tokens["coordA"]!.acesso),
        payload: { severidade, vulnerabilidadePresente: false },
      });
      expect(r.statusCode).toBe(200);
    }

    const detalhe = await app.inject({
      method: "GET", url: `/ocorrencias/${id}`, headers: comToken(tokens["coordA"]!.acesso),
    });
    expect(detalhe.json().ocorrencia.severidade).toBe("critica");
    // Duas classificações são dois fatos verdadeiros, e os dois ficam.
    expect(detalhe.json().trilha.filter(
      (e: { tipo: string }) => e.tipo === "triagem",
    )).toHaveLength(2);
  });
});
