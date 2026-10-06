import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { derivarSenha } from "../src/auth/senha.js";
import { hashDoToken as hash } from "../src/auth/tokens.js";
import { servicoDeAutenticacao, FalhaAutenticacao } from "../src/auth/servico.js";
import { servicoDeSegundoFator } from "../src/auth/segundo-fator.js";
import { notificadorDeLog } from "../src/auth/notificador.js";

/**
 * A cadeia da sessão rotacionada, o papel alterado e a senha provisória
 * (V2-F00-E07).
 *
 * TRÊS CASOS DE BORDA DA VIGÊNCIA que a E04 religou e deixou abertos:
 *
 * 1. A SESSÃO ROTACIONADA. Renovar revoga a sessão antiga com o motivo
 *    `rotacionada na renovacao` e abre outra. `auth/vigencia.ts` contava como
 *    viva TODA sessão revogada por esse motivo, mesmo depois de a cadeia ser
 *    encerrada por quem administra, pela própria pessoa, por reuso de token ou
 *    por troca de senha: o token de acesso emitido ANTES da renovação seguia
 *    escrevendo até completar os quinze minutos. A migração 047 dá a cada
 *    sessão uma `familia_id` (as sessões de uma cadeia de renovação a
 *    compartilham) e a sessão rotacionada só vale enquanto a família tem
 *    sessão de pé.
 * 2. O PAPEL ALTERADO. Papel do banco diferente do token é 401
 *    `nao_autenticado` (o cliente renova e repete), e não `sessao_encerrada`
 *    (entre de novo): a renovação já devolve o token com o papel novo.
 * 3. A SENHA PROVISÓRIA VENCIDA NO MEIO. Nem escreve nem se troca, mesmo
 *    chamando o serviço sem passar pela rota.
 *
 * A troca de papel NÃO revoga as sessões da pessoa: decisão registrada em
 * `dc360/apps/api/PENDENCIAS.md` e em `docs/DECISOES-DE-TESTE-DA-FASE-00.md`.
 */

const SENHA = "defesa-civil-2026";
const SENHA_NOVA = "outra-senha-bem-forte-2026";
const HELENA = "11111111-1111-4111-8111-0000000000d1";
const DIEGO = "11111111-1111-4111-8111-0000000000d3";
const OC_ALFA_1 = "11111111-1111-4111-8111-0000000000c1";
const EMAIL_HELENA = "helena.coutinho@serraalta.exemplo.gov.br";
const EMAIL_DIEGO = "diego.alves@serraalta.exemplo.gov.br";
const EMAIL_RITA = "rita.lopes@serraalta.exemplo.gov.br";
const EMAIL_AURELIO = "aurelio@valefundo.exemplo.gov.br";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let config: ReturnType<typeof carregarConfig>;
let tokenRita: string;
let ocorrenciaDeB: string;

type Par = { acesso: string; renovacao: string };

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrar(email: string, senha = SENHA): Promise<Par> {
  const r = await app.inject({ method: "POST", url: "/auth/entrar", payload: { email, senha } });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return { acesso: r.json().acesso, renovacao: r.json().renovacao };
}

async function renovar(renovacao: string): Promise<Par> {
  const r = await app.inject({ method: "POST", url: "/auth/renovar", payload: { renovacao } });
  if (r.statusCode !== 200) throw new Error(`renovação falhou (${r.statusCode}): ${r.body}`);
  return { acesso: r.json().acesso, renovacao: r.json().renovacao };
}

/** Uma escrita inofensiva e idempotente, permitida à coordenação. */
function escrever(token: string, ocorrenciaId = OC_ALFA_1) {
  return app.inject({
    method: "POST", url: `/ocorrencias/${ocorrenciaId}/coordenada`, headers: com(token),
    payload: { coordenada: { lat: -22.41, lng: -45.45 }, motivo: "Ponto conferido no local pela equipe." },
  });
}

function despachar(token: string, ocorrenciaId = OC_ALFA_1) {
  return app.inject({
    method: "POST", url: `/ocorrencias/${ocorrenciaId}/despacho`, headers: com(token),
    payload: { equipeId: "11111111-1111-4111-8111-0000000000e1", prazoHoras: 24 },
  });
}

function abrirOcorrencia(token: string) {
  return app.inject({
    method: "POST", url: "/ocorrencias", headers: com(token),
    payload: {
      solicitanteNome: "Moradora", canalEntrada: "telefone",
      endereco: "Travessa do Sol, 30", tipo: "alagamento", descricao: "Agua na calcada",
    },
  });
}

async function exigirEncerrada(token: string) {
  const r = await escrever(token);
  expect(r.statusCode, r.body).toBe(401);
  expect(r.json().erro).toBe("sessao_encerrada");
}

async function restaurarHelena(): Promise<void> {
  await mem.bruto.query(
    "UPDATE usuarios SET ativo = true, papel = 'coordenador', senha_provisoria_ate = NULL, senha_hash = $2 WHERE id = $1",
    [HELENA, await derivarSenha(SENHA)],
  );
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-da-familia-da-sessao-com-32-bytes!!",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();
  tokenRita = (await entrar(EMAIL_RITA)).acesso;

  // O município B, com uma ocorrência e um coordenador: a prova de isolamento.
  const hash = await derivarSenha(SENHA);
  const b = await mem.bruto.query<{ id: string }>(
    "INSERT INTO organizacoes (nome,municipio,uf) VALUES ('DC Vale Fundo','Vale Fundo','MG') RETURNING id",
  );
  await mem.bruto.query(
    `INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,senha_hash)
     VALUES ($1,'Aurelio Machado','VF-1',$2,'coordenador',$3)`,
    [b.rows[0]!.id, EMAIL_AURELIO, hash],
  );
  const ocB = await mem.bruto.query<{ id: string }>(
    `INSERT INTO ocorrencias (organizacao_id,protocolo,tipo,status,endereco,solicitante_nome,canal_entrada,descricao)
     VALUES ($1,'000001/2026','alagamento','registrada','Rua do Rio, 12','Joaquim','telefone','Agua na calcada')
     RETURNING id`,
    [b.rows[0]!.id],
  );
  ocorrenciaDeB = ocB.rows[0]!.id;
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("A cadeia da sessão rotacionada só vale enquanto a cadeia vive", () => {
  it("renovação normal: o token antigo escreve até vencer e o novo também", async () => {
    const h = await entrar(EMAIL_HELENA);
    const novo = await renovar(h.renovacao);
    expect((await escrever(h.acesso)).statusCode).toBe(200);
    expect((await escrever(novo.acesso)).statusCode).toBe(200);
  });

  it("várias rotações seguidas: todos os tokens da cadeia escrevem, e todos caem juntos quando a cadeia é encerrada", async () => {
    const h = await entrar(EMAIL_HELENA);
    const segundo = await renovar(h.renovacao);
    const terceiro = await renovar(segundo.renovacao);
    for (const t of [h.acesso, segundo.acesso, terceiro.acesso]) {
      expect((await escrever(t)).statusCode).toBe(200);
    }
    const adm = await app.inject({
      method: "POST", url: `/usuarios/${HELENA}/encerrar-sessoes`, headers: com(tokenRita),
    });
    expect(adm.statusCode, adm.body).toBe(200);
    for (const t of [h.acesso, segundo.acesso, terceiro.acesso]) await exigirEncerrada(t);
  });

  it("quem administra encerra as sessões: o token de ANTES da renovação deixa de escrever", async () => {
    const h = await entrar(EMAIL_HELENA);
    const novo = await renovar(h.renovacao);
    expect((await escrever(h.acesso)).statusCode).toBe(200);
    const adm = await app.inject({
      method: "POST", url: `/usuarios/${HELENA}/encerrar-sessoes`, headers: com(tokenRita),
    });
    expect(adm.statusCode, adm.body).toBe(200);
    await exigirEncerrada(h.acesso);
    await exigirEncerrada(novo.acesso);
  });

  it("a própria pessoa encerra as outras sessões: o aparelho que tinha renovado perde também o token antigo", async () => {
    const painel = await entrar(EMAIL_HELENA);
    const celular = await entrar(EMAIL_HELENA);
    const celularRenovado = await renovar(celular.renovacao);
    expect((await escrever(celular.acesso)).statusCode).toBe(200);

    const r = await app.inject({
      method: "POST", url: "/auth/encerrar-sessoes", headers: com(painel.acesso),
    });
    expect(r.statusCode, r.body).toBe(200);

    await exigirEncerrada(celular.acesso);
    await exigirEncerrada(celularRenovado.acesso);
    // A de quem clicou sobrevive, e a família dela não foi tocada.
    expect((await escrever(painel.acesso)).statusCode).toBe(200);
  });

  it("sair encerra a cadeia: o token anterior à renovação deixa de escrever", async () => {
    const h = await entrar(EMAIL_HELENA);
    const novo = await renovar(h.renovacao);
    expect((await escrever(h.acesso)).statusCode).toBe(200);
    const r = await app.inject({
      method: "POST", url: "/auth/sair", payload: { renovacao: novo.renovacao },
    });
    expect(r.statusCode, r.body).toBe(204);
    await exigirEncerrada(h.acesso);
    await exigirEncerrada(novo.acesso);
  });

  it("reuso do token de renovação derruba a cadeia: o token de acesso anterior à renovação cai", async () => {
    const roubado = await entrar(EMAIL_HELENA);
    const legitimo = await renovar(roubado.renovacao);
    expect((await escrever(roubado.acesso)).statusCode).toBe(200);

    // O ladrão apresenta o token de renovação já gasto.
    const reuso = await app.inject({
      method: "POST", url: "/auth/renovar", payload: { renovacao: roubado.renovacao },
    });
    expect(reuso.statusCode).toBe(401);

    await exigirEncerrada(roubado.acesso);
    await exigirEncerrada(legitimo.acesso);
  });

  it("troca de senha em outra sessão encerra a cadeia das demais", async () => {
    const quemTroca = await entrar(EMAIL_HELENA);
    const outra = await entrar(EMAIL_HELENA);
    const outraRenovada = await renovar(outra.renovacao);
    expect((await escrever(outra.acesso)).statusCode).toBe(200);
    try {
      const troca = await app.inject({
        method: "POST", url: "/auth/trocar-senha", headers: com(quemTroca.acesso),
        payload: { senhaAtual: SENHA, senha: SENHA_NOVA },
      });
      expect(troca.statusCode, troca.body).toBe(200);

      await exigirEncerrada(outra.acesso);
      await exigirEncerrada(outraRenovada.acesso);
      // A sessão de onde se trocou continua, com o token novo.
      expect((await escrever(troca.json().acesso)).statusCode).toBe(200);
    } finally {
      await restaurarHelena();
    }
  }, 120_000);

  it("a família é por login: encerrar a cadeia de um aparelho não derruba a cadeia de outro login", async () => {
    const a = await entrar(EMAIL_HELENA);
    const aRenovada = await renovar(a.renovacao);
    const b = await entrar(EMAIL_HELENA);
    const bRenovada = await renovar(b.renovacao);

    const sair = await app.inject({
      method: "POST", url: "/auth/sair", payload: { renovacao: aRenovada.renovacao },
    });
    expect(sair.statusCode).toBe(204);

    await exigirEncerrada(a.acesso);
    await exigirEncerrada(aRenovada.acesso);
    expect((await escrever(b.acesso)).statusCode).toBe(200);
    expect((await escrever(bRenovada.acesso)).statusCode).toBe(200);
  });

  it("cada login abre família nova e cada renovação herda a família: o banco guarda isso", async () => {
    const h = await entrar(EMAIL_HELENA);
    const novo = await renovar(h.renovacao);
    const outro = await entrar(EMAIL_HELENA);
    const [primeira, segunda, terceira] = await Promise.all(
      [h, novo, outro].map(async (t) => (await mem.bruto.query<{ familia_id: string; id: string }>(
        "SELECT id, familia_id FROM sessoes WHERE token_hash = $1", [hash(t.renovacao)],
      )).rows[0]!),
    );
    // O primeiro login é a raiz da família (`familia_id = id`), a renovação a herda.
    expect(primeira!.familia_id).toBe(primeira!.id);
    expect(segunda!.familia_id).toBe(primeira!.familia_id);
    expect(segunda!.id).not.toBe(primeira!.id);
    expect(terceira!.familia_id).toBe(terceira!.id);
    expect(terceira!.familia_id).not.toBe(primeira!.familia_id);
  });
});

describe("Papel alterado: 401 nao_autenticado e a renovação resolve", () => {
  async function rebaixarHelena() {
    const r = await app.inject({
      method: "PATCH", url: `/usuarios/${HELENA}`, headers: com(tokenRita),
      payload: {
        nome: "Helena Vasques Coutinho", matricula: "SA-1042", email: EMAIL_HELENA, papel: "operador",
      },
    });
    expect(r.statusCode, r.body).toBe(200);
  }

  it("papel rebaixado: o token velho recebe 401 nao_autenticado, a renovação traz o papel novo e a escrita do papel novo passa", async () => {
    const h = await entrar(EMAIL_HELENA);
    expect((await escrever(h.acesso)).statusCode).toBe(200);
    await rebaixarHelena();
    try {
      const velho = await escrever(h.acesso);
      expect(velho.statusCode, velho.body).toBe(401);
      // É "renove e repita", e não "entre de novo".
      expect(velho.json().erro).toBe("nao_autenticado");

      const novo = await app.inject({
        method: "POST", url: "/auth/renovar", payload: { renovacao: h.renovacao },
      });
      expect(novo.statusCode, novo.body).toBe(200);
      expect(novo.json().usuario.papel).toBe("operador");

      // Operador abre ocorrência: a ação é dele.
      const abriu = await abrirOcorrencia(novo.json().acesso);
      expect(abriu.statusCode, abriu.body).toBe(201);
    } finally {
      await restaurarHelena();
    }
  });

  it("depois de rebaixado a operador, o ex-coordenador renovado não despacha: 403 sem_permissao", async () => {
    const h = await entrar(EMAIL_HELENA);
    await rebaixarHelena();
    try {
      const novo = await renovar(h.renovacao);
      const r = await despachar(novo.acesso);
      expect(r.statusCode, r.body).toBe(403);
      expect(r.json().erro).toBe("sem_permissao");
    } finally {
      await restaurarHelena();
    }
  });

  it("promoção também: papel maior no banco que no token pede renovação, e o token velho não vale como o papel novo", async () => {
    const d = await entrar(EMAIL_DIEGO);
    await mem.bruto.query("UPDATE usuarios SET papel = 'coordenador' WHERE id = $1", [DIEGO]);
    try {
      const velho = await escrever(d.acesso);
      expect(velho.statusCode, velho.body).toBe(401);
      expect(velho.json().erro).toBe("nao_autenticado");
    } finally {
      await mem.bruto.query("UPDATE usuarios SET papel = 'agente_campo' WHERE id = $1", [DIEGO]);
    }
  });

  it("a troca de papel NÃO revoga as sessões da pessoa (decisão registrada)", async () => {
    await entrar(EMAIL_HELENA);
    const antes = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM sessoes WHERE usuario_id = $1 AND revogada_em IS NULL", [HELENA],
    );
    expect(Number(antes.rows[0]!.n)).toBeGreaterThan(0);
    await rebaixarHelena();
    try {
      const depois = await mem.bruto.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM sessoes WHERE usuario_id = $1 AND revogada_em IS NULL", [HELENA],
      );
      expect(depois.rows[0]!.n).toBe(antes.rows[0]!.n);
    } finally {
      await restaurarHelena();
    }
  });

  it("sessão encerrada vence papel diferente: quem foi rebaixado E derrubado entra de novo, em vez de renovar", async () => {
    const h = await entrar(EMAIL_HELENA);
    await rebaixarHelena();
    try {
      await app.inject({
        method: "POST", url: `/usuarios/${HELENA}/encerrar-sessoes`, headers: com(tokenRita),
      });
      await exigirEncerrada(h.acesso);
    } finally {
      await restaurarHelena();
    }
  });

  it("isolamento: coordenador do município A rebaixado, o token antigo não despacha e continua sem ver o município B (404)", async () => {
    const h = await entrar(EMAIL_HELENA);
    await rebaixarHelena();
    try {
      // O token antigo não despacha equipe: 401, e nada sobre o município B.
      expect((await despachar(h.acesso)).statusCode).toBe(401);
      const contraB = await despachar(h.acesso, ocorrenciaDeB);
      expect(contraB.statusCode).toBe(401);

      // Renovado, o recurso de B continua 404 (nunca 403), antes e depois.
      const novo = await renovar(h.renovacao);
      for (const t of [h.acesso, novo.acesso]) {
        const leitura = await app.inject({
          method: "GET", url: `/ocorrencias/${ocorrenciaDeB}`, headers: com(t),
        });
        expect(leitura.statusCode, leitura.body).toBe(404);
      }
      const escritaB = await despachar(novo.acesso, ocorrenciaDeB);
      expect([403, 404]).toContain(escritaB.statusCode);
      // Operador não despacha: o 403 é do PAPEL e vem antes de qualquer busca,
      // então não confirma nada sobre o recurso de B.
      expect(escritaB.json().erro).toBe("sem_permissao");
    } finally {
      await restaurarHelena();
    }
  });

  it("coordenador do município B com o papel mudado não ganha nada no município A", async () => {
    const a = await entrar(EMAIL_AURELIO);
    expect((await escrever(a.acesso)).statusCode).toBe(404);
  });
});

describe("Senha provisória vencida no meio: nem escreve nem se troca", () => {
  async function sorteada(): Promise<string> {
    const r = await app.inject({
      method: "POST", url: `/usuarios/${HELENA}/redefinir-senha`, headers: com(tokenRita),
    });
    expect(r.statusCode, r.body).toBe(200);
    return r.json().senhaTemporaria as string;
  }

  it("no prazo, a senha provisória troca", async () => {
    const temporaria = await sorteada();
    try {
      const s = await entrar(EMAIL_HELENA, temporaria);
      const troca = await app.inject({
        method: "POST", url: "/auth/trocar-senha", headers: com(s.acesso),
        payload: { senhaAtual: temporaria, senha: SENHA_NOVA },
      });
      expect(troca.statusCode, troca.body).toBe(200);
      const prazo = await mem.bruto.query<{ senha_provisoria_ate: string | null }>(
        "SELECT senha_provisoria_ate FROM usuarios WHERE id = $1", [HELENA],
      );
      expect(prazo.rows[0]!.senha_provisoria_ate).toBeNull();
    } finally {
      await restaurarHelena();
    }
  }, 120_000);

  it("vencida no meio, pela rota: trocar a senha e renovar respondem 401 sessao_encerrada", async () => {
    const temporaria = await sorteada();
    try {
      const s = await entrar(EMAIL_HELENA, temporaria);
      await mem.bruto.query(
        "UPDATE usuarios SET senha_provisoria_ate = now() - interval '1 minute' WHERE id = $1", [HELENA],
      );
      const troca = await app.inject({
        method: "POST", url: "/auth/trocar-senha", headers: com(s.acesso),
        payload: { senhaAtual: temporaria, senha: SENHA_NOVA },
      });
      expect(troca.statusCode, troca.body).toBe(401);
      expect(troca.json().erro).toBe("sessao_encerrada");
      const renovado = await app.inject({
        method: "POST", url: "/auth/renovar", payload: { renovacao: s.renovacao },
      });
      expect(renovado.statusCode).toBe(401);
      expect(renovado.json().erro).toBe("sessao_encerrada");
      // E o hash não mudou: a senha provisória vencida não virou senha de ninguém.
      const entrou = await app.inject({
        method: "POST", url: "/auth/entrar", payload: { email: EMAIL_HELENA, senha: SENHA_NOVA },
      });
      expect(entrou.statusCode).toBe(401);
    } finally {
      await restaurarHelena();
    }
  }, 120_000);

  it("vencida no meio, pelo SERVIÇO: trocarSenha recusa por si, sem depender da rota ter conferido antes", async () => {
    const temporaria = await sorteada();
    try {
      const s = await entrar(EMAIL_HELENA, temporaria);
      const sessao = (await mem.bruto.query<{ id: string; organizacao_id: string }>(
        "SELECT id, organizacao_id FROM sessoes WHERE usuario_id = $1 AND revogada_em IS NULL ORDER BY criada_em DESC LIMIT 1",
        [HELENA],
      )).rows[0]!;
      expect(s.acesso.length).toBeGreaterThan(0);
      await mem.bruto.query(
        "UPDATE usuarios SET senha_provisoria_ate = now() - interval '1 minute' WHERE id = $1", [HELENA],
      );
      const servico = servicoDeAutenticacao(
        mem.banco, config, notificadorDeLog(), servicoDeSegundoFator(mem.banco, config),
      );
      const identidade = {
        usuarioId: HELENA, organizacaoId: sessao.organizacao_id, papel: "coordenador" as const,
        nome: "Helena Vasques Coutinho", sessaoId: sessao.id,
      };
      const erro = await servico.trocarSenha(identidade, temporaria, SENHA_NOVA).then(
        () => null, (e: unknown) => e,
      );
      expect(erro).toBeInstanceOf(FalhaAutenticacao);
      expect((erro as FalhaAutenticacao).codigo).toBe("sessao_encerrada");
      // Nada foi gravado: o hash ainda é o da provisória.
      const entrou = await app.inject({
        method: "POST", url: "/auth/entrar", payload: { email: EMAIL_HELENA, senha: SENHA_NOVA },
      });
      expect(entrou.statusCode).toBe(401);
    } finally {
      await restaurarHelena();
    }
  }, 120_000);

  it("senha comum (sem prazo) continua trocando pelo serviço: a recusa é só da provisória vencida", async () => {
    try {
      const h = await entrar(EMAIL_HELENA);
      const sessao = (await mem.bruto.query<{ id: string; organizacao_id: string }>(
        "SELECT id, organizacao_id FROM sessoes WHERE usuario_id = $1 AND revogada_em IS NULL ORDER BY criada_em DESC LIMIT 1",
        [HELENA],
      )).rows[0]!;
      expect(h.acesso.length).toBeGreaterThan(0);
      const servico = servicoDeAutenticacao(
        mem.banco, config, notificadorDeLog(), servicoDeSegundoFator(mem.banco, config),
      );
      const novo = await servico.trocarSenha(
        {
          usuarioId: HELENA, organizacaoId: sessao.organizacao_id, papel: "coordenador",
          nome: "Helena Vasques Coutinho", sessaoId: sessao.id,
        },
        SENHA, SENHA_NOVA,
      );
      expect(novo.acesso.length).toBeGreaterThan(0);
    } finally {
      await restaurarHelena();
    }
  }, 120_000);
});
