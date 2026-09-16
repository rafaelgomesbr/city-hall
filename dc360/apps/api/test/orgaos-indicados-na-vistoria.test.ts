import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { carregarConfig } from "../src/config.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { construirServidor } from "../src/servidor.js";

/*
  OS ÓRGÃOS QUE A VISTORIA INDICA, COLETADOS E JOGADOS FORA.

  `vistoria.orgaosParaAcionar` já viajava no envelope de sincronização e o Zod
  já o validava. A rota NÃO gravava, porque faltava a tabela: o agente marcava
  no barranco quais órgãos precisam ser acionados, o aplicativo mandava, e o
  servidor descartava em silêncio. O laudo chegava à coordenação dizendo
  "Necessário acionar outro órgão: SIM" e calando QUAL, que era exatamente a
  reclamação que originou o desdobramento do item.

  E a outra metade: `GET /sincronizacao/pendencias` não devolvia o catálogo, e
  o catálogo do município NUNCA chegava ao aparelho. Todo agente concluía pelo
  campo livre. O aplicativo tem o caminho de "catálogo vazio" e ele funciona,
  mas funcionava por acidente, e o efeito era apagar a conta de "quantas vezes
  acionamos os bombeiros" antes mesmo de ela existir.
*/

let app: FastifyInstance;
let mem: BancoEmMemoria;

const SENHA = "senha-de-teste-bem-longa";
let orgId = "";
let equipeAlfa = "";
let tokenCoord = "";
let tokenAgente = "";
let bombeiros = "";
let aguaDesativada = "";
/** Um órgão do catálogo do município VIZINHO. Nunca pode encostar aqui. */
let orgaoDoVizinho = "";

async function comoUsuario(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso as string;
}

const comCoord = () => ({ authorization: `Bearer ${tokenCoord}` });
const comAgente = () => ({ authorization: `Bearer ${tokenAgente}` });

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

  const vizinho = await mem.bruto.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('Coordenadoria','Vale Fundo','MG') RETURNING id",
  );

  const alfa = await mem.bruto.query<{ id: string }>(
    "INSERT INTO equipes (organizacao_id, nome) VALUES ($1,'Alfa') RETURNING id", [orgId],
  );
  equipeAlfa = alfa.rows[0]!.id;

  await mem.bruto.query(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
     VALUES ($1,'Helena','C-1','helena@serraalta.exemplo.gov.br','coordenador',$2)`,
    [orgId, hash],
  );
  await mem.bruto.query(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, equipe_id, senha_hash)
     VALUES ($1,'Diego','A-1','diego@serraalta.exemplo.gov.br','agente_campo',$2,$3)`,
    [orgId, equipeAlfa, hash],
  );

  const cbm = await mem.bruto.query<{ id: string }>(
    "INSERT INTO orgaos (organizacao_id, nome, sigla) VALUES ($1,'Corpo de Bombeiros','CBM') RETURNING id",
    [orgId],
  );
  bombeiros = cbm.rows[0]!.id;
  await mem.bruto.query(
    "INSERT INTO orgaos (organizacao_id, nome, sigla) VALUES ($1,'Concessionária de energia','CEMIG') RETURNING id",
    [orgId],
  );
  const agua = await mem.bruto.query<{ id: string }>(
    `INSERT INTO orgaos
       (organizacao_id, nome, ativo, desativado_em, motivo_desativacao)
     VALUES ($1,'Companhia de Água', false, now(),
             'Competência transferida para a autarquia municipal de saneamento')
     RETURNING id`,
    [orgId],
  );
  aguaDesativada = agua.rows[0]!.id;

  const doVizinho = await mem.bruto.query<{ id: string }>(
    "INSERT INTO orgaos (organizacao_id, nome, sigla) VALUES ($1,'Defesa Civil de Vale Fundo','DCVF') RETURNING id",
    [vizinho.rows[0]!.id],
  );
  orgaoDoVizinho = doVizinho.rows[0]!.id;

  tokenCoord = await comoUsuario("helena@serraalta.exemplo.gov.br");
  tokenAgente = await comoUsuario("diego@serraalta.exemplo.gov.br");
}, 120_000);

afterAll(async () => {
  await app.close();
  await mem.banco.encerrar();
});

/** Uma ocorrência classificada, triada e despachada para a equipe do Diego. */
async function despachada(endereco: string): Promise<string> {
  const aberta = await app.inject({
    method: "POST", url: "/ocorrencias", headers: comCoord(),
    payload: {
      solicitanteNome: "Joana", canalEntrada: "telefone", endereco,
      tipo: "deslizamento", descricao: "Trinca nova depois da chuva.",
    },
  });
  const id = aberta.json().id as string;
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: comCoord(),
    payload: { severidade: "alta", vulnerabilidadePresente: false },
  });
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/despacho`, headers: comCoord(),
    payload: { equipeId: equipeAlfa, prazoHoras: 24 },
  });
  /*
    O chamado nasce com um dia de idade. A coleta desta suíte é datada de
    antes do envio, para o laudo ter as duas marcas de tempo, e a rota recusa
    coleta anterior à abertura do chamado (`data_implausivel`): a vistoria não
    pode ter acontecido antes de o chamado existir.
  */
  await mem.bruto.query(
    "UPDATE ocorrencias SET criado_em = now() - interval '1 day' WHERE id = $1", [id],
  );
  return id;
}

function envelope(
  ocorrenciaId: string,
  chave: string,
  orgaos: Array<{ orgaoId: string | null; nome: string }> | undefined,
  acionar = true,
) {
  const coletadaEm = new Date(Date.now() - 3_600_000).toISOString();
  return {
    idempotencyKey: chave,
    ocorrenciaId,
    coletadaEm,
    vistoria: {
      checklist: [
        { chave: "risco_iminente", resposta: true },
        { chave: "interdicao_indicada", resposta: false },
        { chave: "evacuacao_necessaria", resposta: false },
        { chave: "acionar_outro_orgao", resposta: acionar },
      ],
      ...(orgaos ? { orgaosParaAcionar: orgaos } : {}),
      fotos: [],
      gpsPrecisaoMetros: 11,
      assinanteNome: "Marilda Souza Prado",
      assinaturaChave: null,
      coletadaEm,
      observacoes: "Coleta feita sem sinal, no alto do morro.",
    },
  };
}

function enviar(corpo: ReturnType<typeof envelope>) {
  return app.inject({
    method: "POST", url: "/sincronizacao/vistoria", headers: comAgente(), payload: corpo,
  });
}

async function indicacoesDe(vistoriaId: string) {
  const r = await mem.bruto.query<{ nome: string; orgao_id: string | null; ordem: number }>(
    "SELECT nome, orgao_id, ordem FROM vistoria_orgaos_indicados WHERE vistoria_id = $1 ORDER BY ordem",
    [vistoriaId],
  );
  return r.rows;
}

describe("o catálogo do município desce com a lista de tarefas", () => {
  it("vem na MESMA resposta de /pendencias, e não numa chamada própria", async () => {
    /*
      Uma segunda chamada teria uma segunda chance de falhar, e falharia onde
      não pode: o aparelho que baixou a lista de manhã e não baixou o catálogo
      sobe o morro com um item OBRIGATÓRIO do checklist sem resposta possível.
    */
    const r = await app.inject({
      method: "GET", url: "/sincronizacao/pendencias", headers: comAgente(),
    });
    expect(r.statusCode, `corpo: ${r.body}`).toBe(200);

    /*
      A ausência do campo é o defeito inteiro, e ela precisa aparecer com este
      nome no relatório do teste. Sem esta linha, a falha vira "cannot read
      properties of undefined" três linhas abaixo, e quem lê o relatório não
      descobre que o servidor simplesmente não fala de catálogo.
    */
    expect(
      Array.isArray(r.json().orgaos),
      "a resposta de /pendencias não trouxe o catálogo de órgãos, e o aparelho "
      + "fica com catálogo vazio para sempre",
    ).toBe(true);

    const nomes = (r.json().orgaos as Array<{ nome: string }>).map((o) => o.nome);
    expect(nomes).toContain("Corpo de Bombeiros");
    expect(nomes).toContain("Concessionária de energia");
  });

  it("traz nome e sigla, e não o email nem o telefone do órgão", async () => {
    // Contato oficial não tem serventia em campo, e espalhá-lo por dezenas de
    // aparelhos que passam de turno em turno é risco sem contrapartida.
    const r = await app.inject({
      method: "GET", url: "/sincronizacao/pendencias", headers: comAgente(),
    });
    const cbm = (r.json().orgaos as Array<Record<string, unknown>>)
      .find((o) => o.nome === "Corpo de Bombeiros")!;
    expect(Object.keys(cbm).sort()).toEqual(["id", "nome", "sigla"]);
    expect(cbm.sigla).toBe("CBM");
  });

  it("não oferece órgão desativado", async () => {
    // Órgão desativado não pode voltar a ser oferecido em tela nova: o agente
    // estaria indicando quem não recebe mais ofício.
    const r = await app.inject({
      method: "GET", url: "/sincronizacao/pendencias", headers: comAgente(),
    });
    const ids = (r.json().orgaos as Array<{ id: string }>).map((o) => o.id);
    expect(ids).not.toContain(aguaDesativada);
  });

  it("não vaza o catálogo do município vizinho", async () => {
    const r = await app.inject({
      method: "GET", url: "/sincronizacao/pendencias", headers: comAgente(),
    });
    const ids = (r.json().orgaos as Array<{ id: string }>).map((o) => o.id);
    expect(ids).not.toContain(orgaoDoVizinho);
  });
});

describe("a indicação do agente chega ao banco", () => {
  it("grava um órgão por linha, do catálogo e por texto livre", async () => {
    /*
      Os dois caminhos numa coleta só, e o campo livre não é conveniência: um
      aparelho novo, que nunca sincronizou, tem catálogo vazio, e um item
      OBRIGATÓRIO do checklist não pode ficar sem resposta possível justamente
      sem sinal, que é a condição normal de trabalho deste aplicativo.
    */
    const ocorrencia = await despachada("Rua da Encosta, 1");
    const r = await enviar(envelope(
      ocorrencia, "11111111-1111-4111-8111-111111111111",
      [
        { orgaoId: bombeiros, nome: "Corpo de Bombeiros" },
        { orgaoId: null, nome: "Associação de moradores do Alto da Serra" },
      ],
    ));
    expect(r.statusCode, `corpo: ${r.body}`).toBe(201);

    const linhas = await indicacoesDe(r.json().vistoriaId);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({ nome: "Corpo de Bombeiros", orgao_id: bombeiros });
    expect(linhas[1]).toMatchObject({
      nome: "Associação de moradores do Alto da Serra", orgao_id: null,
    });
  });

  it("preserva a ordem em que o agente escolheu", async () => {
    // O laudo sai na mesma sequência da minuta lida em voz alta na porta da
    // casa. Ordens diferentes nos dois papéis parecem divergência mesmo quando
    // não são.
    const ocorrencia = await despachada("Rua da Encosta, 2");
    const r = await enviar(envelope(
      ocorrencia, "22222222-2222-4222-8222-222222222222",
      [
        { orgaoId: null, nome: "Secretaria de Obras" },
        { orgaoId: bombeiros, nome: "Corpo de Bombeiros" },
      ],
    ));

    const linhas = await indicacoesDe(r.json().vistoriaId);
    expect(linhas.map((l) => l.nome)).toEqual(["Secretaria de Obras", "Corpo de Bombeiros"]);
  });

  it("aceita indicação de órgão já desativado, sem reescrever a história", async () => {
    /*
      O catálogo do aparelho pode ter meses, e a coleta é mais velha que a
      desativação. Recusar aqui prenderia a coleta na fila do aparelho para
      sempre, porque não existe tela para corrigir item bloqueado. Quem decide
      para onde encaminhar HOJE é a providência, que lê o catálogo vigente.
    */
    const ocorrencia = await despachada("Rua da Encosta, 3");
    const r = await enviar(envelope(
      ocorrencia, "33333333-3333-4333-8333-333333333333",
      [{ orgaoId: aguaDesativada, nome: "Companhia de Água" }],
    ));
    expect(r.statusCode, `corpo: ${r.body}`).toBe(201);

    const linhas = await indicacoesDe(r.json().vistoriaId);
    expect(linhas[0]).toMatchObject({ orgao_id: aguaDesativada });
  });

  it("órgão de outro município vira texto livre, e não derruba a coleta", async () => {
    /*
      Duas coisas ao mesmo tempo, e as duas importam.

      O identificador do vizinho NÃO pode virar coluna: a chave estrangeira
      composta da migração 020 é a garantia estrutural disso, e esta conferência
      sob RLS é o que faz a garantia nunca precisar ser acionada por dado vindo
      da rede.

      E a coleta NÃO pode ser recusada: uma vistoria rejeitada volta para a fila
      do aparelho, é reenviada, e recebe a mesma recusa para sempre. O nome viaja
      no envelope, então o laudo continua dizendo quem acionar.
    */
    const ocorrencia = await despachada("Rua da Encosta, 4");
    const r = await enviar(envelope(
      ocorrencia, "44444444-4444-4444-8444-444444444444",
      [{ orgaoId: orgaoDoVizinho, nome: "Defesa Civil de Vale Fundo" }],
    ));
    expect(r.statusCode, `corpo: ${r.body}`).toBe(201);

    const linhas = await indicacoesDe(r.json().vistoriaId);
    expect(linhas).toEqual([
      expect.objectContaining({ nome: "Defesa Civil de Vale Fundo", orgao_id: null }),
    ]);
  });

  it("coleta que responde 'não' e não indica ninguém não grava linha nenhuma", async () => {
    const ocorrencia = await despachada("Rua da Encosta, 5");
    const r = await enviar(envelope(
      ocorrencia, "55555555-5555-4555-8555-555555555555", undefined, false,
    ));
    expect(await indicacoesDe(r.json().vistoriaId)).toHaveLength(0);
  });

  it("reenvio da mesma chave não duplica a lista", async () => {
    // A fila do aparelho reenvia quando a rede cai depois do envio. Se cada
    // reenvio acrescentasse linhas, o laudo listaria o mesmo órgão três vezes.
    const ocorrencia = await despachada("Rua da Encosta, 6");
    const corpo = envelope(
      ocorrencia, "66666666-6666-4666-8666-666666666666",
      [{ orgaoId: bombeiros, nome: "Corpo de Bombeiros" }],
    );
    const primeira = await enviar(corpo);
    const segunda = await enviar(corpo);
    expect(segunda.json().duplicada).toBe(true);

    expect(await indicacoesDe(primeira.json().vistoriaId)).toHaveLength(1);
  });
});

describe("meia vistoria é pior que nenhuma", () => {
  it("se a gravação dos órgãos falhar, a vistoria não entra", async () => {
    /*
      A prova de que as duas escritas estão na MESMA transação.

      A falha é forçada tirando o privilégio de INSERT da tabela: qualquer causa
      serve, e o que se prova é o desfecho. Sem a transação única, o servidor
      ficaria com uma vistoria concluída cuja lista de órgãos sumiu, e o laudo
      sairia afirmando que há órgão a acionar com a seção vazia. Ninguém
      procuraria: pelo painel, a vistoria chegou.
    */
    const ocorrencia = await despachada("Rua da Encosta, 7");
    const chave = "77777777-7777-4777-8777-777777777777";

    await mem.bruto.query("REVOKE INSERT ON vistoria_orgaos_indicados FROM dc360_app");
    try {
      const r = await enviar(envelope(
        ocorrencia, chave, [{ orgaoId: bombeiros, nome: "Corpo de Bombeiros" }],
      ));
      expect(r.statusCode).toBeGreaterThanOrEqual(500);
    } finally {
      await mem.bruto.query("GRANT INSERT ON vistoria_orgaos_indicados TO dc360_app");
    }

    const vistorias = await mem.bruto.query(
      "SELECT id FROM vistorias WHERE idempotency_key = $1", [chave],
    );
    expect(vistorias.rows, "vistoria gravada sem a lista de órgãos que a acompanhava")
      .toHaveLength(0);

    // E a ocorrência continua em campo: nada de "vistoria concluída" sem vistoria.
    const detalhe = await app.inject({
      method: "GET", url: `/ocorrencias/${ocorrencia}`, headers: comCoord(),
    });
    expect(detalhe.json().ocorrencia.status).toBe("em_campo");
  });

  it("depois do privilégio de volta, a mesma coleta entra inteira", async () => {
    // A fila do aparelho reenvia. O que falhou por causa do servidor precisa
    // poder entrar quando o servidor voltar, senão a coleta fica presa.
    const ocorrencia = await despachada("Rua da Encosta, 8");
    const r = await enviar(envelope(
      ocorrencia, "88888888-8888-4888-8888-888888888888",
      [{ orgaoId: bombeiros, nome: "Corpo de Bombeiros" }],
    ));
    expect(r.statusCode, `corpo: ${r.body}`).toBe(201);
    expect(await indicacoesDe(r.json().vistoriaId)).toHaveLength(1);
  });
});

describe("o laudo diz QUAL órgão acionar", () => {
  it("nomeia quem a vistoria indicou, em vez de só afirmar que sim", async () => {
    /*
      A reclamação que originou o item inteiro: o laudo dizia "Necessário
      acionar outro órgão: SIM" e não dizia quem. A primeira providência do
      coordenador virava um telefonema para o agente, horas depois, com ele já
      em outra ocorrência, para perguntar uma coisa que estava clara no barranco
      no minuto da vistoria.
    */
    const ocorrencia = await despachada("Rua do Laudo, 1");
    await enviar(envelope(
      ocorrencia, "99999999-9999-4999-8999-999999999999",
      [
        { orgaoId: bombeiros, nome: "Corpo de Bombeiros" },
        { orgaoId: null, nome: "Associação de moradores do Alto da Serra" },
      ],
    ));

    const laudo = await app.inject({
      method: "GET", url: `/documentos/${ocorrencia}/laudo`, headers: comCoord(),
    });
    expect(laudo.statusCode, `corpo: ${laudo.body}`).toBe(200);
    expect(laudo.body).toContain("Órgãos a acionar");
    expect(laudo.body).toContain("Corpo de Bombeiros (CBM)");
    expect(laudo.body).toContain("Associação de moradores do Alto da Serra");
  });

  it("indicou sem dizer quem, o laudo declara a lacuna em vez de calar", async () => {
    /*
      É o caso do aparelho que ainda não atualizou, e calar devolveria o
      coordenador ao telefonema: ele leria um laudo sem menção nenhuma a órgão e
      não saberia que a informação faltou.
    */
    const ocorrencia = await despachada("Rua do Laudo, 2");
    await enviar(envelope(
      ocorrencia, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", undefined, true,
    ));

    const laudo = await app.inject({
      method: "GET", url: `/documentos/${ocorrencia}/laudo`, headers: comCoord(),
    });
    expect(laudo.body).toContain("Órgãos a acionar");
    expect(laudo.body).toContain("sem especificar qual");
  });

  it("vistoria que respondeu 'não' não ganha a seção", async () => {
    // Seção vazia num documento oficial é pergunta sem pergunta: quem lê fica
    // procurando o que deveria estar ali.
    const ocorrencia = await despachada("Rua do Laudo, 3");
    await enviar(envelope(
      ocorrencia, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", undefined, false,
    ));

    const laudo = await app.inject({
      method: "GET", url: `/documentos/${ocorrencia}/laudo`, headers: comCoord(),
    });
    expect(laudo.body).not.toContain("Órgãos a acionar");
  });
});
