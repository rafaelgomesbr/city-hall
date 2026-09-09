import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { MOTIVO_RECLASSIFICAR } from "@dc360/shared";
import { carregarConfig } from "../src/config.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { construirServidor } from "../src/servidor.js";
import { laudoDeVistoria } from "../src/documentos/laudo.js";

/*
  O TIPO "OUTRO", QUE O ESQUEMA ACEITAVA E O BANCO RECUSAVA.

  `aberturaOcorrenciaSchema` passou a aceitar `tipo` igual a "outro", com uma
  descrição obrigatória junto. A restrição CHECK de `ocorrencias.tipo` continuou
  com os oito nomes da COBRADE. O buraco tinha três metades, e nenhuma delas
  aparecia num teste de tela:

  1. `POST /ocorrencias` com tipo "outro" passava pelo Zod e morria no INSERT
     com SQLSTATE 23514. O operador de plantão, com a pessoa na linha, recebia
     "erro inesperado, informe o código ao suporte" em vez de uma frase dizendo
     o que corrigir.
  2. Não existia coluna para a descrição. O texto que o operador digitasse (a
     única coisa que torna a reclassificação possível) seria descartado em
     silêncio.
  3. `triagemSchema.tipo` existia e a rota de triagem NUNCA o gravava. Quem
     classificasse via a tela confirmar e o chamado continuava "outro" no banco.

  E a regra de negócio que faltava por inteiro: "outro" não pode sobreviver ao
  despacho. A taxonomia COBRADE existe para o dado do município conversar com o
  sistema nacional, e um chamado que fica "outro" para sempre é dado perdido.
*/

let app: FastifyInstance;
let mem: BancoEmMemoria;

const SENHA = "senha-de-teste-bem-longa";
let orgId = "";
let equipeAlfa = "";
let tokenCoord = "";

async function comoUsuario(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso as string;
}

const comCoord = () => ({ authorization: `Bearer ${tokenCoord}` });

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

  const alfa = await mem.bruto.query<{ id: string }>(
    "INSERT INTO equipes (organizacao_id, nome) VALUES ($1,'Alfa') RETURNING id", [orgId],
  );
  equipeAlfa = alfa.rows[0]!.id;

  await mem.bruto.query(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
     VALUES ($1,'Helena','C-1','helena@serraalta.exemplo.gov.br','coordenador',$2)`,
    [orgId, hash],
  );

  tokenCoord = await comoUsuario("helena@serraalta.exemplo.gov.br");
}, 120_000);

afterAll(async () => {
  await app.close();
  await mem.banco.encerrar();
});

async function abrir(corpo: Record<string, unknown>) {
  return app.inject({
    method: "POST", url: "/ocorrencias", headers: comCoord(),
    payload: {
      solicitanteNome: "Joana", canalEntrada: "telefone",
      descricao: "Relato recebido pelo plantão.",
      ...corpo,
    },
  });
}

/** Uma ocorrência que entrou sem classificação, e o texto que a explica. */
async function semClassificacao(endereco: string, relato: string): Promise<string> {
  const r = await abrir({ endereco, tipo: "outro", tipoDescricao: relato });
  if (r.statusCode !== 201) throw new Error(`abertura falhou: ${r.body}`);
  return r.json().id as string;
}

async function triagem(id: string, corpo: Record<string, unknown>) {
  return app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: comCoord(),
    payload: { severidade: "alta", vulnerabilidadePresente: false, ...corpo },
  });
}

async function despachar(id: string) {
  return app.inject({
    method: "POST", url: `/ocorrencias/${id}/despacho`, headers: comCoord(),
    payload: { equipeId: equipeAlfa, prazoHoras: 24 },
  });
}

describe("a abertura aceita o chamado que ninguém sabe classificar", () => {
  it("responde 201, e não 500 com código para o suporte", async () => {
    /*
      O caso inteiro em uma linha. Antes da migração 019 este corpo passava pelo
      Zod e estourava a restrição CHECK do banco, e quem estava ao telefone com
      a pessoa via "erro inesperado" numa abertura perfeitamente válida.
    */
    const r = await abrir({
      endereco: "Rua das Acácias, 245",
      tipo: "outro",
      tipoDescricao: "Queda de árvore sobre a via, bloqueando a passagem",
    });
    expect(r.statusCode, `corpo: ${r.body}`).toBe(201);
  });

  it("guarda o que foi relatado, em vez de descartar o texto", async () => {
    // Sem esta coluna, o que o operador digitou some, e a triagem abre um
    // chamado que diz "Outro" e nada mais: a decisão técnica que ela existe
    // para tomar fica sem matéria prima.
    const id = await semClassificacao(
      "Rua do Mirante, 88", "Rompimento de adutora alagando o quintal",
    );
    const detalhe = await app.inject({
      method: "GET", url: `/ocorrencias/${id}`, headers: comCoord(),
    });
    expect(detalhe.json().ocorrencia.tipo).toBe("outro");
    expect(detalhe.json().ocorrencia.tipo_descricao)
      .toBe("Rompimento de adutora alagando o quintal");
  });

  it("recusa 'outro' mudo com 422 no campo certo, e não com erro de banco", async () => {
    const r = await abrir({
      endereco: "Rua Sem Nome, 3", tipo: "outro", tipoDescricao: "x",
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().campos.map((c: { campo: string }) => c.campo)).toContain("tipoDescricao");
  });
});

describe("o despacho é o portão da reclassificação", () => {
  it("recusa despachar equipe para chamado que continua 'outro'", async () => {
    /*
      Sem o portão, "outro" atravessa o fluxo inteiro até o laudo: o documento
      oficial sai com brasão, assinatura e a palavra "Outro" no campo do tipo, e
      depois que a equipe vai a campo ninguém volta para classificar.
    */
    const id = await semClassificacao("Rua da Pedreira, 10", "Muro do vizinho desabou");
    await triagem(id, {});

    const r = await despachar(id);
    expect(r.statusCode, `corpo: ${r.body}`).toBe(409);
    expect(r.json().erro).toBe("tipo_a_classificar");
  });

  it("a recusa diz o que fazer, e não só que deu errado", async () => {
    // A frase mora no pacote compartilhado justamente para a tela e a API
    // dizerem a mesma coisa. Um 409 com "transição inválida" mandaria o
    // coordenador procurar defeito no lugar errado.
    const id = await semClassificacao("Rua do Cedro, 45", "Cratera aberta no asfalto");
    await triagem(id, {});

    const r = await despachar(id);
    expect(r.json().mensagem).toBe(MOTIVO_RECLASSIFICAR);
    expect(r.json().mensagem).toMatch(/triagem/i);
  });

  it("a ocorrência recusada continua onde estava, sem meio despacho", async () => {
    const id = await semClassificacao("Rua do Açude, 7", "Ponte de madeira cedendo");
    await triagem(id, {});
    await despachar(id);

    const detalhe = await app.inject({
      method: "GET", url: `/ocorrencias/${id}`, headers: comCoord(),
    });
    expect(detalhe.json().ocorrencia.status).toBe("triagem");
    expect(detalhe.json().ocorrencia.equipe_id).toBeNull();
  });
});

describe("a triagem classifica, e a classificação chega ao banco", () => {
  it("grava o tipo escolhido, que antes era lido e jogado fora", async () => {
    /*
      `triagemSchema.tipo` existia desde o turno anterior e o UPDATE da rota não
      o mencionava. A tela confirmava a classificação e o banco continuava com
      "outro", sem nenhum sinal de que a escolha se perdeu.
    */
    const id = await semClassificacao("Rua da Serra, 120", "Barranco cedeu nos fundos");
    const r = await triagem(id, { tipo: "deslizamento" });
    expect(r.statusCode, `corpo: ${r.body}`).toBe(200);

    const detalhe = await app.inject({
      method: "GET", url: `/ocorrencias/${id}`, headers: comCoord(),
    });
    expect(detalhe.json().ocorrencia.tipo).toBe("deslizamento");
  });

  it("limpa a descrição, para o campo não virar anotação paralela", async () => {
    const id = await semClassificacao("Rua da Serra, 121", "Água descendo pela encosta");
    await triagem(id, { tipo: "deslizamento" });

    const detalhe = await app.inject({
      method: "GET", url: `/ocorrencias/${id}`, headers: comCoord(),
    });
    expect(detalhe.json().ocorrencia.tipo_descricao).toBeNull();
  });

  it("o relato original continua legível na trilha, que não se apaga", async () => {
    /*
      É isto que torna aceitável limpar a coluna. Sem a cópia na trilha, o que a
      pessoa contou ao telefone desapareceria no instante da classificação, e
      ninguém conseguiria mais conferir se a decisão técnica correspondia ao
      relato.
    */
    const id = await semClassificacao("Rua da Serra, 122", "Poste inclinado sobre a casa");
    await triagem(id, { tipo: "vendaval" });

    const detalhe = await app.inject({
      method: "GET", url: `/ocorrencias/${id}`, headers: comCoord(),
    });
    const eventos = detalhe.json().trilha as Array<{
      tipo: string; detalhe: Record<string, unknown> | null;
    }>;
    const classificacao = eventos.find((e) => e.tipo === "triagem")!;
    expect(classificacao.detalhe).toMatchObject({
      tipo: "vendaval",
      tipoAnterior: "outro",
      tipoDescricaoAnterior: "Poste inclinado sobre a casa",
    });
  });

  it("classificado, o despacho passa", async () => {
    // A correção não pode ter fechado junto o caminho que ela existe para abrir.
    const id = await semClassificacao("Rua da Serra, 123", "Trinca nova depois da chuva");
    await triagem(id, { tipo: "deslizamento" });

    const r = await despachar(id);
    expect(r.statusCode, `corpo: ${r.body}`).toBe(200);
  });

  it("a triagem não devolve um chamado classificado para 'outro'", async () => {
    // `triagemSchema.tipo` é `TIPOS_COBRADE` e não `TIPOS_DE_ENTRADA`: permitir
    // a volta transformaria o portão do despacho em formalidade, porque
    // bastaria reclassificar para o mesmo lugar de onde se veio.
    const aberta = await abrir({ endereco: "Rua Reta, 9", tipo: "granizo" });
    const id = aberta.json().id as string;

    const r = await triagem(id, { tipo: "outro" });
    expect(r.statusCode).toBe(422);
  });
});

describe("o chamado não classificado que mesmo assim gera papel", () => {
  it("o laudo diz o que foi relatado, em vez de imprimir só 'Outro'", () => {
    /*
      O portão do despacho impede quase todo caminho até aqui, e sobra um: um
      chamado que entrou como "outro" e foi encerrado por improcedência antes de
      alguém classificar continua podendo ter vistoria, e continua tendo laudo.
      Sem esta linha o documento sairia com brasão, assinatura e a palavra
      "Outro" sozinha no campo do tipo, sem dizer sobre o que ele é.
    */
    const html = laudoDeVistoria({
      organizacao: { nome: "Coordenadoria", municipio: "Serra Alta", uf: "MG" },
      ocorrencia: {
        id: "00000000-0000-4000-8000-000000000001",
        protocolo: "000912/2026",
        tipo: "outro",
        tipo_descricao: "Rompimento de adutora alagando três quintais",
        severidade: "media",
        endereco: "Rua do Mirante, 88",
        latitude: null, longitude: null,
        solicitante_nome: "Joana", solicitante_contato: null,
        canal_entrada: "telefone",
        descricao: "Relato recebido pelo plantão.",
        vulnerabilidade_presente: false, vulnerabilidade_descricao: null,
        criado_em: "2026-09-01T10:00:00.000Z",
        equipe_nome: null,
      },
      vistoria: {
        id: "00000000-0000-4000-8000-000000000002",
        checklist: [{ chave: "risco_iminente", resposta: true }],
        gps_precisao_metros: null,
        assinante_nome: "Joana",
        observacoes: null,
        coletada_em: "2026-09-01T12:00:00.000Z",
        sincronizada_em: "2026-09-01T12:00:30.000Z",
        agente_nome: "Diego", agente_matricula: "A-1",
        desalojados: null, desabrigados: null, feridos: null,
        desaparecidos: null, obitos: null,
      },
      fotos: [],
      emitidoPor: "Coordenação",
      emitidoEm: new Date("2026-09-02T10:00:00.000Z"),
    });

    expect(html).toContain("Relatado como");
    expect(html).toContain("Rompimento de adutora alagando três quintais");
  });
});
