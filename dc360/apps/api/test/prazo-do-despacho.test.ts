import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { carregarConfig } from "../src/config.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { construirServidor } from "../src/servidor.js";
import { PRAZO_PADRAO_HORAS } from "@dc360/shared";

/*
  O defeito que este arquivo tranca.

  A triagem calcula `prazo_em` a partir da severidade, contando desde a abertura
  do chamado. O despacho, ate 09/09/2026, gravava
  `prazo_em = now() + prazoHoras` por cima disso.

  Consequencia, e ela e silenciosa: uma critica aberta as 8h com prazo de 4
  horas venceria as 12h. Despachada as 14h com 24 horas, ela passa a vencer as
  14h do dia seguinte, e as duas horas de atraso somem do indicador de
  atrasadas do painel. Redespachar zera de novo. O coordenador olha um numero
  que diz que esta tudo em dia.

  A propria tela do painel imprimia a regra que o codigo contradizia.

  O `prazoHoras` do despacho nao e lixo: e o coordenador dizendo "cheguem la em
  N horas". E outro prazo, e continua registrado no evento da trilha.
*/

let app: FastifyInstance;
let mem: BancoEmMemoria;
let orgId = "";
let token = "";

const SENHA = "senha-de-teste-bem-longa";

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: false });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }),
  });
  await app.ready();

  const { derivarSenha } = await import("../src/auth/senha.js");
  const hash = await derivarSenha(SENHA);
  const org = await mem.bruto.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('Coordenadoria','Serra Alta','MG') RETURNING id",
  );
  orgId = org.rows[0]!.id;
  await mem.bruto.query(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
     VALUES ($1,'Helena','C-1','helena@serraalta.exemplo.gov.br','coordenador',$2)`,
    [orgId, hash],
  );
  await mem.bruto.query(
    "INSERT INTO protocolo_sequencias (organizacao_id, ano, ultimo) VALUES ($1,$2,1)",
    [orgId, new Date().getFullYear()],
  );

  const r = await app.inject({
    method: "POST", url: "/auth/entrar",
    payload: { email: "helena@serraalta.exemplo.gov.br", senha: SENHA },
  });
  token = r.json().acesso;
}, 120_000);

afterAll(async () => {
  await app.close();
  await mem.banco.encerrar();
});

const cabecalho = () => ({ authorization: `Bearer ${token}` });

async function prazoDe(id: string): Promise<string | null> {
  const r = await mem.bruto.query<{ prazo_em: string | null }>(
    "SELECT prazo_em FROM ocorrencias WHERE id = $1", [id],
  );
  const v = r.rows[0]!.prazo_em;
  return v === null ? null : new Date(v).toISOString();
}

describe("o prazo pertence a triagem, nunca ao despacho", () => {
  it("despachar NAO altera o prazo que a triagem calculou", async () => {
    const aberta = await app.inject({
      method: "POST", url: "/ocorrencias", headers: cabecalho(),
      payload: {
        solicitanteNome: "Joana", canalEntrada: "telefone",
        endereco: "Servidao Boa Esperanca, 148", tipo: "deslizamento",
        descricao: "Trinca nova na parede dos fundos depois da chuva.",
      },
    });
    expect(aberta.statusCode).toBe(201);
    const id = aberta.json().id as string;

    await app.inject({
      method: "POST", url: `/ocorrencias/${id}/triagem`, headers: cabecalho(),
      payload: { severidade: "critica", vulnerabilidadePresente: false },
    });
    const depoisDaTriagem = await prazoDe(id);
    expect(depoisDaTriagem).not.toBeNull();

    const equipe = await app.inject({
      method: "POST", url: "/equipes", headers: cabecalho(),
      payload: { nome: "Equipe Alfa" },
    });
    const equipeId = equipe.json().id as string;

    // 24 horas, seis vezes o prazo de uma critica. Antes da correcao, esta
    // chamada empurrava o vencimento para o dia seguinte.
    const despacho = await app.inject({
      method: "POST", url: `/ocorrencias/${id}/despacho`, headers: cabecalho(),
      payload: { equipeId, prazoHoras: 24 },
    });
    expect(despacho.statusCode).toBe(200);

    expect(await prazoDe(id)).toBe(depoisDaTriagem);
  });

  it("o prazo continua sendo o da severidade, contado desde a abertura", async () => {
    const aberta = await app.inject({
      method: "POST", url: "/ocorrencias", headers: cabecalho(),
      payload: {
        solicitanteNome: "Pedro", canalEntrada: "telefone",
        endereco: "Rua do Morro, 12", tipo: "inundacao",
        descricao: "Agua entrando pela area de servico.",
      },
    });
    const id = aberta.json().id as string;

    await app.inject({
      method: "POST", url: `/ocorrencias/${id}/triagem`, headers: cabecalho(),
      payload: { severidade: "alta", vulnerabilidadePresente: false },
    });

    const r = await mem.bruto.query<{ horas: number }>(
      "SELECT EXTRACT(EPOCH FROM (prazo_em - criado_em)) / 3600 AS horas FROM ocorrencias WHERE id = $1",
      [id],
    );
    expect(Math.round(Number(r.rows[0]!.horas))).toBe(PRAZO_PADRAO_HORAS.alta);
  });

  it("o prazo que o coordenador deu a equipe continua registrado na trilha", async () => {
    const aberta = await app.inject({
      method: "POST", url: "/ocorrencias", headers: cabecalho(),
      payload: {
        solicitanteNome: "Marta", canalEntrada: "whatsapp",
        endereco: "Travessa das Flores, 3", tipo: "vendaval",
        descricao: "Telhado parcialmente arrancado.",
      },
    });
    const id = aberta.json().id as string;
    await app.inject({
      method: "POST", url: `/ocorrencias/${id}/triagem`, headers: cabecalho(),
      payload: { severidade: "media", vulnerabilidadePresente: false },
    });
    const equipe = await app.inject({
      method: "POST", url: "/equipes", headers: cabecalho(),
      payload: { nome: "Equipe Bravo" },
    });
    await app.inject({
      method: "POST", url: `/ocorrencias/${id}/despacho`, headers: cabecalho(),
      payload: { equipeId: equipe.json().id, prazoHoras: 6 },
    });

    const t = await mem.bruto.query<{ detalhe: { prazoHoras?: number } }>(
      "SELECT detalhe FROM trilha_eventos WHERE ocorrencia_id = $1 AND tipo = 'despacho'",
      [id],
    );
    expect(t.rows[0]!.detalhe.prazoHoras).toBe(6);
  });
});
