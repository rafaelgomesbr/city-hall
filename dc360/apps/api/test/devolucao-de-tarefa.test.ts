import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * A tarefa vencida que o agente devolve para a coordenação.
 *
 * O CENÁRIO, e ele é de chuva e não de laboratório: a ocorrência foi despachada,
 * o agente subiu o morro, o prazo VENCEU e não houve vistoria. Não achou o
 * endereço, não havia ninguém, o portão estava trancado, o barranco continuava
 * cedendo. Até aqui o produto não tinha o que fazer com isso: a ocorrência
 * ficava `em_campo` para sempre, na tela de quem já tinha desistido dela, e a
 * coordenação só descobria por telefonema, se descobrisse.
 *
 * Os dois desfechos que existiam são falsos aqui. `vistoria_concluida` seria
 * mentira gravada, e é dela que nasce o laudo. `encerrada` seria pior: a casa
 * continua precisando de vistoria, e encerrar por não ter ido é o "a prefeitura
 * não fez nada" que este produto existe para tornar impossível em silêncio.
 *
 * O QUE ESTE ARQUIVO DEFENDE, e cada um já foi quebrado de propósito para ver
 * o vermelho antes de existir a correção:
 *
 * 1. A ocorrência volta para `triagem`, sem equipe, e o PRAZO NÃO É TOCADO.
 * 2. Quem decide se venceu é o relógio do SERVIDOR, não o do aparelho.
 * 3. Ocorrência de outra equipe ou de outro município responde 404, nunca 403.
 * 4. Autoria conferida contra o dono do token, com a tentativa na trilha.
 * 5. Reenvio da mesma chave não duplica nada, porque a fila reenvia.
 */

const SENHA = "defesa-civil-2026";
const HASH_DA_SEMENTE =
  "scrypt$131072$8$1$56BVGGGziTxmINg0pEIjxw$F-aIq495xKVd9OKClsyKAFxxLHj26KkyKIWFMFAnBwk";

const SERRA_ALTA = "11111111-1111-4111-8111-000000000001";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";
const EQUIPE_BRAVO = "11111111-1111-4111-8111-0000000000e2";
const DIEGO = "11111111-1111-4111-8111-0000000000d3";
/** A colega de turno, na MESMA equipe: a divergência aqui é só de pessoa. */
const ANA = "11111111-1111-4111-8111-0000000000d9";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenDiego: string;
let tokenAna: string;
let tokenCoordenadora: string;

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

/** Uma ocorrência despachada para a equipe pedida, com prazo de quatro horas. */
async function despachada(
  endereco: string, equipeId: string = EQUIPE_ALFA,
): Promise<string> {
  const criar = await app.inject({
    method: "POST", url: "/ocorrencias", headers: com(tokenCoordenadora),
    payload: {
      solicitanteNome: "Marilda Souza Prado", canalEntrada: "telefone",
      endereco, tipo: "deslizamento",
      descricao: "Talude atrás da casa cedeu depois da chuva da madrugada.",
    },
  });
  const id = criar.json().id;
  await app.inject({
    method: "POST", url: `/ocorrencias/${id}/triagem`, headers: com(tokenCoordenadora),
    payload: { severidade: "critica", vulnerabilidadePresente: false },
  });
  const d = await app.inject({
    method: "POST", url: `/ocorrencias/${id}/despacho`, headers: com(tokenCoordenadora),
    payload: { equipeId, prazoHoras: 4 },
  });
  if (d.statusCode !== 200) throw new Error(`despacho falhou: ${d.body}`);
  return id;
}

/**
 * Empurra o prazo para o passado, como dono do banco.
 *
 * É o único jeito honesto de ter uma tarefa vencida num teste: esperar quatro
 * horas não é opção, e mexer no relógio do processo mentiria justamente sobre a
 * coisa que este arquivo verifica, que é o relógio de QUEM decide. Aqui quem
 * decide continua sendo o Postgres, com o `now()` dele.
 */
async function vencer(ocorrenciaId: string): Promise<string> {
  const r = await mem.bruto.query<{ prazo_em: string }>(
    `UPDATE ocorrencias SET prazo_em = now() - interval '3 hours'
      WHERE id = $1 RETURNING prazo_em::text`,
    [ocorrenciaId],
  );
  return r.rows[0]!.prazo_em;
}

async function vencida(endereco: string, equipeId: string = EQUIPE_ALFA): Promise<string> {
  const id = await despachada(endereco, equipeId);
  await vencer(id);
  return id;
}

type OpcoesDeDevolucao = {
  token?: string;
  chave?: string;
  devolvidaPor?: string;
  motivo?: string;
  observacao?: string;
  decididaEm?: string;
};

async function devolver(ocorrenciaId: string, opcoes: OpcoesDeDevolucao = {}) {
  return app.inject({
    method: "POST", url: "/sincronizacao/devolucao",
    headers: com(opcoes.token ?? tokenDiego),
    payload: {
      idempotencyKey: opcoes.chave ?? crypto.randomUUID(),
      ocorrenciaId,
      decididaEm: opcoes.decididaEm ?? new Date().toISOString(),
      devolvidaPor: opcoes.devolvidaPor ?? DIEGO,
      motivo: opcoes.motivo ?? "morador_ausente",
      ...(opcoes.observacao === undefined ? {} : { observacao: opcoes.observacao }),
    },
  });
}

async function ocorrencia(id: string): Promise<{
  status: string; equipe_id: string | null; prazo_em: string | null;
}> {
  const r = await mem.bruto.query<{
    status: string; equipe_id: string | null; prazo_em: string | null;
  }>(
    "SELECT status, equipe_id, prazo_em::text FROM ocorrencias WHERE id = $1",
    [id],
  );
  return r.rows[0]!;
}

async function eventos(ocorrenciaId: string): Promise<Array<{
  tipo: string; autor_id: string | null; ocorrido_em: string;
  detalhe: Record<string, unknown> | null;
}>> {
  const r = await mem.bruto.query<{
    tipo: string; autor_id: string | null; ocorrido_em: string;
    detalhe: Record<string, unknown> | null;
  }>(
    `SELECT tipo, autor_id, ocorrido_em::text, detalhe
       FROM trilha_eventos WHERE ocorrencia_id = $1 ORDER BY registrado_em`,
    [ocorrenciaId],
  );
  return r.rows;
}

async function devolucoes(ocorrenciaId: string): Promise<Array<{
  id: string; devolvida_por: string; equipe_id: string;
  motivo: string; observacao: string | null; prazo_em: string;
}>> {
  const r = await mem.bruto.query<{
    id: string; devolvida_por: string; equipe_id: string;
    motivo: string; observacao: string | null; prazo_em: string;
  }>(
    `SELECT id, devolvida_por, equipe_id, motivo, observacao, prazo_em::text
       FROM devolucoes_de_tarefa WHERE ocorrencia_id = $1`,
    [ocorrenciaId],
  );
  return r.rows;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-da-devolucao-de-tarefa-com-mais-de-32-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  // A segunda agente da Equipe Alfa. Existe para o caso do colega que devolveu
  // primeiro, que é o único caminho em que duas pessoas devolvem a mesma tarefa.
  await mem.bruto.query(
    `INSERT INTO usuarios (id, organizacao_id, nome, matricula, email, papel, equipe_id, senha_hash)
     VALUES ($1,$2,'Ana Ribeiro Gouveia','SA-3392','ana.gouveia@serraalta.exemplo.gov.br',
             'agente_campo',$3,$4)`,
    [ANA, SERRA_ALTA, EQUIPE_ALFA, HASH_DA_SEMENTE],
  );

  tokenDiego = await entrar("diego.alves@serraalta.exemplo.gov.br");
  tokenAna = await entrar("ana.gouveia@serraalta.exemplo.gov.br");
  tokenCoordenadora = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("A devolução aceita", () => {
  it("devolve a ocorrência para a triagem, sem equipe, e não encerra nada", async () => {
    const id = await vencida("Rua da Devolução, 1");

    const r = await devolver(id, { motivo: "acesso_impedido" });

    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().duplicada).toBe(false);
    expect(r.json().status).toBe("triagem");

    const depois = await ocorrencia(id);
    expect(depois.status).toBe("triagem");
    // A equipe é limpa porque a ocorrência deixou de ser daquela equipe. Sem
    // isso ela continuaria na lista do aparelho, que é metade do defeito.
    expect(depois.equipe_id).toBeNull();
  }, 60_000);

  it("NÃO mexe no prazo, para o atraso não sumir do painel", async () => {
    /*
      A linha mais fácil de escrever errado nesta rota. O T2 já tinha corrigido
      o mesmo defeito no despacho: zerar `prazo_em` tira a ocorrência do
      indicador de atrasadas, e o atraso desaparece da tela exatamente no minuto
      em que ele deixou de ser risco e virou fato.
    */
    const id = await vencida("Rua da Devolução, 2");
    const antes = (await ocorrencia(id)).prazo_em;

    await devolver(id);

    expect(antes).not.toBeNull();
    expect((await ocorrencia(id)).prazo_em).toBe(antes);

    // E continua contando como atrasada para quem abre o painel.
    const lista = await app.inject({
      method: "GET", url: "/ocorrencias?atrasadas=1&status=todas",
      headers: com(tokenCoordenadora),
    });
    expect(
      lista.json().itens.some((o: { id: string }) => o.id === id),
      "a ocorrência devolvida saiu do filtro de atrasadas",
    ).toBe(true);
  }, 60_000);

  it("grava a devolução com autor, equipe, motivo, observação e o prazo perdido", async () => {
    const id = await vencida("Rua da Devolução, 3");
    const prazo = (await ocorrencia(id)).prazo_em;

    await devolver(id, {
      motivo: "risco_para_a_equipe",
      observacao: "Barranco ainda cedendo, entramos sem apoio dos bombeiros.",
    });

    const linhas = await devolucoes(id);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.devolvida_por).toBe(DIEGO);
    expect(linhas[0]!.equipe_id).toBe(EQUIPE_ALFA);
    expect(linhas[0]!.motivo).toBe("risco_para_a_equipe");
    expect(linhas[0]!.observacao).toContain("bombeiros");
    // O prazo é copiado no ato: sem ele, uma triagem nova recalcularia
    // `prazo_em` e a condição que autorizou a devolução deixaria de existir.
    expect(linhas[0]!.prazo_em).toBe(prazo);
  }, 60_000);

  it("deixa na trilha tudo o que a coordenação vai querer meses depois", async () => {
    const id = await vencida("Rua da Devolução, 4");
    const prazo = (await ocorrencia(id)).prazo_em;
    const decididaEm = new Date(Date.now() - 90 * 60 * 1000).toISOString();

    await devolver(id, {
      motivo: "endereco_nao_localizado",
      observacao: "Numeração não existe na rua, ninguém soube informar.",
      decididaEm,
    });

    const evento = (await eventos(id)).find((e) => e.tipo === "devolucao_de_tarefa");
    expect(evento, "a devolução não deixou rastro na trilha").toBeDefined();
    expect(evento!.autor_id).toBe(DIEGO);
    expect(evento!.detalhe!.motivo).toBe("endereco_nao_localizado");
    expect(evento!.detalhe!.motivoRotulo).toBe("Não localizei o endereço");
    /*
      A observação NÃO está no detalhe, e a asserção anterior aqui afirmava o
      contrário. Ela foi reescrita, e o motivo está no bloco "A observação do
      agente fica fora da trilha", no fim deste arquivo: `trilha_eventos` é
      append-only, então texto livre escrito pelo agente ficaria permanente e
      imune ao prazo de retenção que o município fixa como controlador.

      O que a trilha guarda é a existência da observação e o caminho até ela.
    */
    expect(evento!.detalhe!.temObservacao).toBe(true);
    expect(evento!.detalhe!.devolucaoId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(evento!.detalhe)).not.toContain("Numeração");
    expect(evento!.detalhe!.equipeId).toBe(EQUIPE_ALFA);
    expect(evento!.detalhe!.prazoEm).not.toBeNull();
    expect(evento!.detalhe!.statusAnterior).toBe("em_campo");
    expect(prazo).not.toBeNull();

    /*
      As duas marcas de tempo. `ocorrido_em` é a hora do aparelho, que numa
      devolução decidida sem sinal é muito antes da hora do servidor. Gravar só
      a segunda faria a trilha afirmar que o agente desistiu na hora em que o
      sinal voltou.
    */
    expect(Date.parse(evento!.ocorrido_em)).toBeLessThan(Date.now() - 60 * 60 * 1000);
  }, 60_000);

  it("tira a tarefa da lista do agente e devolve a ocorrência para quem despacha", async () => {
    const id = await vencida("Rua da Devolução, 5");

    await devolver(id);

    const pendencias = await app.inject({
      method: "GET", url: "/sincronizacao/pendencias", headers: com(tokenDiego),
    });
    expect(
      pendencias.json().itens.some((i: { id: string }) => i.id === id),
      "a tarefa devolvida continuou na lista do agente",
    ).toBe(false);

    // E o caminho de volta funciona de verdade: a coordenação redespacha.
    const lista = await app.inject({
      method: "GET", url: "/ocorrencias?status=triagem", headers: com(tokenCoordenadora),
    });
    expect(lista.json().itens.some((o: { id: string }) => o.id === id)).toBe(true);

    const redespacho = await app.inject({
      method: "POST", url: `/ocorrencias/${id}/despacho`, headers: com(tokenCoordenadora),
      payload: { equipeId: EQUIPE_BRAVO, prazoHoras: 4 },
    });
    expect(redespacho.statusCode, redespacho.body).toBe(200);
    expect((await ocorrencia(id)).equipe_id).toBe(EQUIPE_BRAVO);
  }, 60_000);

  it("a reconciliação passa a responder \"devolvida\", que até aqui era inalcançável", async () => {
    /*
      O desfecho `"devolvida"` já existia na resposta da reconciliação e não
      podia acontecer, porque a máquina de estados não permitia a transição. A
      devolução fecha esse buraco, e a terceira porta da consulta é o que impede
      o buraco de virar outro: devolver limpa `equipe_id`, então sem ela a
      tarefa sumiria da tela do aparelho sem explicação nenhuma.
    */
    const id = await vencida("Rua da Devolução, 6");
    await devolver(id, { motivo: "morador_ausente" });

    const r = await app.inject({
      method: "POST", url: "/sincronizacao/pendencias/reconciliar",
      headers: com(tokenDiego), payload: { conhecidas: [id] },
    });

    const saida = r.json().saidas.find((s: { id: string }) => s.id === id);
    expect(saida, "a tarefa devolvida sumiu do aparelho sem explicação").toBeDefined();
    expect(saida.desfecho).toBe("devolvida");
    expect(saida.motivo).toBe("Não havia ninguém no local");
    expect(saida.saiuEm).not.toBeNull();
  }, 60_000);
});

describe("O relógio que decide é o do servidor", () => {
  it("recusa a tarefa que ainda não venceu, com código e frase próprios", async () => {
    /*
      Sem a trava, um dia ruim vira uma lista limpa: o agente devolve tudo às
      oito da manhã e a coordenação descobre ao meio-dia.
    */
    const id = await despachada("Rua do Prazo, 1");

    const r = await devolver(id);

    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().erro).toBe("tarefa_no_prazo");
    expect(r.json().mensagem).toContain("relógio do servidor");

    const depois = await ocorrencia(id);
    expect(depois.status).toBe("em_campo");
    expect(depois.equipe_id).toBe(EQUIPE_ALFA);
    expect(await devolucoes(id)).toHaveLength(0);
    expect((await eventos(id)).some((e) => e.tipo === "devolucao_de_tarefa")).toBe(false);
  }, 60_000);

  it("o aparelho com o relógio adiantado não burla o prazo", async () => {
    /*
      O caso concreto, e ele é comum: o telefone está com o fuso errado, três
      horas à frente. A tarefa vence daqui a quatro horas, mas a tela do
      aplicativo mostra o prazo como estourado (ele compara `prazo_em` com o
      relógio LOCAL), e o agente aperta devolver de boa-fé.

      Nada disso atravessa. Quem compara aqui é o Postgres, com `now()` da
      transação, e `decididaEm` só vai para a trilha. A recusa nomeia o relógio
      do aparelho, que é a única coisa que o agente pode corrigir.
    */
    const id = await despachada("Rua do Prazo, 2");
    const adiantado = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();

    const r = await devolver(id, { decididaEm: adiantado });

    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().erro).toBe("tarefa_no_prazo");
    expect(r.json().mensagem).toContain("relógio");
    expect(await devolucoes(id)).toHaveLength(0);
    expect((await ocorrencia(id)).status).toBe("em_campo");

    // E quando o prazo vence de verdade, o mesmo aparelho adiantado passa: o
    // relógio dele nunca decidiu nada, nem para mais nem para menos.
    await vencer(id);
    const depois = await devolver(id, { decididaEm: adiantado });
    expect(depois.statusCode, depois.body).toBe(201);
  }, 60_000);

  it("o relógio absurdo é recusado com frase própria, e não com um 500", async () => {
    /*
      O aparelho com a data de amanhã (ou de 2019) bate na restrição
      `decidida_em_plausivel` do banco, e sem conferência na rota isso chegava ao
      agente como "erro inesperado, informe o código ao suporte" para um
      problema que ele resolve acertando o relógio do próprio telefone. É a
      mesma lição da migração 024 sobre a data da foto.

      E a recusa continua não sendo o portão do prazo: a tarefa aqui está
      VENCIDA, então o que barra é só a data impossível.
    */
    const id = await vencida("Rua do Prazo, 3");
    const amanha = new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString();

    const r = await devolver(id, { decididaEm: amanha });

    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().erro).toBe("relogio_do_aparelho");
    expect(r.json().mensagem).toContain("Acerte a data");
    expect(await devolucoes(id)).toHaveLength(0);
    expect((await ocorrencia(id)).status).toBe("em_campo");

    const antigo = "2019-03-01T10:00:00.000Z";
    const velho = await devolver(id, { decididaEm: antigo });
    expect(velho.statusCode, velho.body).toBe(409);
    expect(velho.json().erro).toBe("relogio_do_aparelho");
  }, 60_000);
});

describe("De quem é a tarefa", () => {
  it("ocorrência de outro município responde 404, nunca 403", async () => {
    /*
      403 confirmaria que o registro existe, e confirmar existência já é
      vazamento. Aqui quem esconde é o RLS: a linha não existe daqui.
    */
    const doVizinho = await mem.bruto.query<{ id: string }>(
      "SELECT id FROM ocorrencias WHERE organizacao_id <> $1 LIMIT 1", [SERRA_ALTA],
    );
    const alheia = doVizinho.rows[0]!.id;

    const r = await devolver(alheia);

    expect(r.statusCode, r.body).toBe(404);
    expect(r.json().erro).toBe("nao_encontrada");
    expect(await devolucoes(alheia)).toHaveLength(0);

    // E id inventado responde exatamente o mesmo, que é o ponto.
    const inventada = await devolver(crypto.randomUUID());
    expect(inventada.statusCode).toBe(404);
    expect(inventada.json().erro).toBe("nao_encontrada");
  }, 60_000);

  it("agente de outra equipe responde 404, e a tarefa continua com quem foi despachado", async () => {
    /*
      Aqui a decisão é DIFERENTE da rota de vistoria, e de propósito. Lá a
      coleta de fora da equipe é aceita e marcada, porque recusar destruiria uma
      vistoria de campo verdadeira que não existe em nenhum outro lugar. Aqui
      recusar não destrói nada (uma devolução é intenção, não prova), e aceitar
      deixaria um agente tirar da fila de OUTRA equipe uma tarefa que não é
      dele, limpando a designação dela.
    */
    const id = await vencida("Rua da Equipe Errada, 1", EQUIPE_BRAVO);

    const r = await devolver(id);

    expect(r.statusCode, r.body).toBe(404);
    expect(r.json().erro).toBe("nao_encontrada");

    const depois = await ocorrencia(id);
    expect(depois.status).toBe("em_campo");
    expect(depois.equipe_id).toBe(EQUIPE_BRAVO);
    expect(await devolucoes(id)).toHaveLength(0);
  }, 60_000);
});

describe("Quem devolveu não é quem enviou", () => {
  it("recusa quando o envelope declara outro autor, e deixa a tentativa na trilha", async () => {
    /*
      O aparelho de plantão é compartilhado entre turnos, e o portão do cliente
      pode furar: binário adulterado ou defeito no filtro da fila volta a subir
      o ato de uma pessoa com a credencial de outra. Quem confere é o servidor.

      A tentativa fica na trilha porque é exatamente o que alguém vai querer
      auditar depois, e o evento é escrito em transação própria: a recusa termina
      em exceção, e a exceção derrubaria a transação da rota junto com o
      registro.
    */
    const id = await vencida("Rua da Autoria da Devolução, 1");
    const chave = crypto.randomUUID();

    const r = await devolver(id, { devolvidaPor: ANA, chave });

    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().erro).toBe("autor_divergente");
    expect(await devolucoes(id)).toHaveLength(0);
    expect((await ocorrencia(id)).status).toBe("em_campo");

    const recusas = (await eventos(id)).filter(
      (e) => e.tipo === "devolucao_recusada_autor_divergente",
    );
    expect(recusas, "a tentativa recusada não deixou rastro").toHaveLength(1);
    // O autor do evento é quem apresentou o token; o detalhe diz quem o
    // envelope afirmou ser. Um dos dois sozinho seria meia frase.
    expect(recusas[0]!.autor_id).toBe(DIEGO);
    expect(recusas[0]!.detalhe!.devolvidaPorDeclarado).toBe(ANA);
    expect(recusas[0]!.detalhe!.idempotencyKey).toBe(chave);
  }, 60_000);

  it("a conferência vem antes da idempotência e antes de ler a ocorrência", async () => {
    /*
      Antes da idempotência porque devolver o recibo de uma devolução a quem não
      a fez confirma o ato de outra pessoa para quem apresentou credencial
      alheia. Antes da leitura porque a comparação não toca no banco, então ela
      responde o mesmo exista ou não a ocorrência: é o que impede a recusa de
      virar oráculo de existência.
    */
    const id = await vencida("Rua da Autoria da Devolução, 2");
    const chave = crypto.randomUUID();

    expect((await devolver(id, { chave })).statusCode).toBe(201);

    const reenvio = await devolver(id, { devolvidaPor: ANA, chave });
    expect(reenvio.statusCode, reenvio.body).toBe(409);
    expect(reenvio.json().erro).toBe("autor_divergente");
    expect(reenvio.json().devolucaoId).toBeUndefined();

    // Ocorrência de outro município recebe a MESMA recusa, e sem escrever na
    // trilha de um município que não é o do token.
    const doVizinho = await mem.bruto.query<{ id: string }>(
      "SELECT id FROM ocorrencias WHERE organizacao_id <> $1 LIMIT 1", [SERRA_ALTA],
    );
    const alheia = doVizinho.rows[0]!.id;
    const forjada = await devolver(alheia, { devolvidaPor: ANA });
    expect(forjada.statusCode, forjada.body).toBe(409);
    expect(forjada.json().erro).toBe("autor_divergente");
    expect(
      (await eventos(alheia)).some((e) => e.tipo === "devolucao_recusada_autor_divergente"),
      "a recusa escreveu na trilha de outro município",
    ).toBe(false);
  }, 60_000);
});

describe("O reenvio da fila", () => {
  it("a mesma chave devolve o mesmo resultado, sem segunda linha e sem segundo evento", async () => {
    /*
      A fila reenvia por desenho: o aparelho desiste por tempo esgotado, o app
      morre no meio do envio, o Wi-Fi da prefeitura reconecta sozinho. Um
      segundo evento numa trilha append-only não se corrige depois.
    */
    const id = await vencida("Rua do Reenvio, 1");
    const chave = crypto.randomUUID();

    const primeira = await devolver(id, { chave });
    expect(primeira.statusCode, primeira.body).toBe(201);
    expect(primeira.json().duplicada).toBe(false);

    const segunda = await devolver(id, { chave });
    expect(segunda.statusCode, segunda.body).toBe(200);
    expect(segunda.json().duplicada).toBe(true);
    expect(segunda.json().devolucaoId).toBe(primeira.json().devolucaoId);

    expect(await devolucoes(id)).toHaveLength(1);
    expect(
      (await eventos(id)).filter((e) => e.tipo === "devolucao_de_tarefa"),
    ).toHaveLength(1);
  }, 60_000);

  it("a tarefa já devolvida por um colega da equipe não vira erro assustador", async () => {
    /*
      Dois agentes da mesma equipe vão ao mesmo endereço no mesmo dia e os dois
      devolvem. A segunda devolução chega com a ocorrência já em `triagem` e já
      sem equipe, e o portão de equipe responderia 404, que no aplicativo é
      falha permanente: o item ficaria bloqueado na fila de quem acertou.

      O comportamento certo é o mesmo da vistoria reenviada: 200, `duplicada`, o
      item some da fila e ninguém leva uma tela vermelha por ter feito a coisa
      certa.
    */
    const id = await vencida("Rua do Reenvio, 2");

    const daAna = await devolver(id, { token: tokenAna, devolvidaPor: ANA });
    expect(daAna.statusCode, daAna.body).toBe(201);

    const doDiego = await devolver(id);
    expect(doDiego.statusCode, doDiego.body).toBe(200);
    expect(doDiego.json().duplicada).toBe(true);
    expect(doDiego.json().devolucaoId).toBe(daAna.json().devolucaoId);

    expect(await devolucoes(id)).toHaveLength(1);
    expect(
      (await eventos(id)).filter((e) => e.tipo === "devolucao_de_tarefa"),
    ).toHaveLength(1);
  }, 60_000);

  it("recusa a tarefa cuja vistoria a equipe já registrou, e a já encerrada", async () => {
    const daVistoria = await vencida("Rua do Reenvio, 3");
    const coletadaEm = new Date().toISOString();
    const sincronizada = await app.inject({
      method: "POST", url: "/sincronizacao/vistoria", headers: com(tokenDiego),
      payload: {
        idempotencyKey: crypto.randomUUID(), ocorrenciaId: daVistoria, coletadaEm,
        vistoria: {
          checklist: [
            { chave: "risco_iminente", resposta: true },
            { chave: "evacuacao_necessaria", resposta: false },
            { chave: "interdicao_indicada", resposta: false },
            { chave: "acionar_outro_orgao", resposta: false },
          ],
          fotos: [], gpsPrecisaoMetros: 6.2,
          assinanteNome: "Marilda Souza Prado", assinaturaChave: null,
          coletadaEm, observacoes: "Trinca ativa no talude.",
        },
      },
    });
    expect(sincronizada.statusCode, sincronizada.body).toBe(201);

    const r = await devolver(daVistoria);
    expect(r.statusCode, r.body).toBe(409);
    expect(r.json().erro).toBe("vistoria_ja_concluida");
    expect(await devolucoes(daVistoria)).toHaveLength(0);

    const encerrada = await vencida("Rua do Reenvio, 4");
    const fim = await app.inject({
      method: "POST", url: `/ocorrencias/${encerrada}/encerramento`,
      headers: com(tokenCoordenadora),
      payload: { motivo: "Risco descartado depois de nova avaliação da coordenação." },
    });
    expect(fim.statusCode, fim.body).toBe(200);

    const depois = await devolver(encerrada);
    expect(depois.statusCode, depois.body).toBe(409);
    expect(depois.json().erro).toBe("ja_encerrada");
    expect(await devolucoes(encerrada)).toHaveLength(0);
  }, 60_000);
});

describe("O contrato do envelope", () => {
  it("motivo \"outro\" sem observação é recusado, porque \"outro\" sozinho não responde nada", async () => {
    const id = await vencida("Rua do Motivo, 1");

    const semNada = await devolver(id, { motivo: "outro" });
    expect(semNada.statusCode, semNada.body).toBe(422);
    expect(semNada.json().erro).toBe("dados_invalidos");
    expect(
      semNada.json().campos.some((c: { campo: string }) => c.campo === "observacao"),
    ).toBe(true);

    // E "n/a" também não passa: o piso existe para recusar a resposta com cara
    // de resposta, não para medir redação de quem está na chuva.
    const curta = await devolver(id, { motivo: "outro", observacao: "n/a" });
    expect(curta.statusCode, curta.body).toBe(422);

    expect(await devolucoes(id)).toHaveLength(0);
    expect((await ocorrencia(id)).status).toBe("em_campo");

    const escrita = await devolver(id, {
      motivo: "outro",
      observacao: "Rua interditada pela concessionária de energia desde ontem.",
    });
    expect(escrita.statusCode, escrita.body).toBe(201);
  }, 60_000);

  it("o banco recusa \"outro\" sem observação mesmo por fora da rota", async () => {
    /*
      Regra de negócio mora no banco e no pacote compartilhado, não na tela. Se
      a validação só existisse no Zod, a próxima escrita por um caminho novo
      passaria por cima dela sem nada reclamar.
    */
    const id = await vencida("Rua do Motivo, 2");
    const prazo = (await ocorrencia(id)).prazo_em;

    await expect(mem.bruto.query(
      `INSERT INTO devolucoes_de_tarefa
         (organizacao_id, ocorrencia_id, devolvida_por, equipe_id, motivo,
          prazo_em, decidida_em, idempotency_key)
       VALUES ($1,$2,$3,$4,'outro',$5, now(), gen_random_uuid())`,
      [SERRA_ALTA, id, DIEGO, EQUIPE_ALFA, prazo],
    )).rejects.toThrow();
  }, 60_000);
});

/**
 * A observação em texto livre NÃO pode entrar na trilha.
 *
 * Achado na integração, e ele anula boa parte da minimização deste produto.
 *
 * `observacao` é escrita pelo agente, na rua, em texto livre, e o produto não
 * tem como saber o que ela diz. Na prática ela vai dizer coisas como "moradora
 * Dona Marta pediu para voltar às 18h" ou "casa com idosa acamada": nome de
 * pessoa e condição de saúde, que são exatamente os dois dados que a migração
 * 021 existe para descartar quando o prazo do município vence.
 *
 * `trilha_eventos` é append-only por projeto, sem policy de UPDATE nem de
 * DELETE. Um dado que entra ali não sai mais, por nenhum caminho, nem por ato
 * do administrador do município. Ou seja: gravar a observação na trilha
 * tornaria aquele texto PERMANENTE, imune ao prazo que o município é obrigado
 * a decidir como controlador, e a minimização passaria a apagar o nome do
 * solicitante em `ocorrencias` enquanto a mesma pessoa continuaria nomeada
 * numa linha de trilha ao lado.
 *
 * A migração 021 já tinha enfrentado isto e decidido igual, com todas as
 * letras: gravar o valor antigo "transformaria a trilha, que é append-only e
 * permanente, no lugar onde o dado removido continua".
 *
 * O que a trilha leva, então: o motivo (lista FECHADA, que não é dado pessoal),
 * o rótulo dele, o prazo perdido, a equipe, o status anterior, e o identificador
 * da devolução. Quem precisar do texto segue o identificador até a linha, que é
 * minimizável. Quem auditar depois do prazo vê que houve devolução, por que, e
 * que o texto foi descartado, que é a informação correta.
 */
describe("A observação do agente fica fora da trilha", () => {
  it("o detalhe do evento não carrega o texto livre, que seria permanente", async () => {
    const oc = await vencida("Rua da Trilha, 100");
    const r = await devolver(oc, {
      motivo: "outro",
      observacao: "moradora Dona Marta pediu para voltar depois das 18h",
    });
    expect(r.statusCode, r.body).toBe(201);

    const evento = await mem.bruto.query<{ detalhe: Record<string, unknown> }>(
      `SELECT detalhe FROM trilha_eventos
        WHERE ocorrencia_id = $1 AND tipo = 'devolucao_de_tarefa'`,
      [oc],
    );
    expect(evento.rows).toHaveLength(1);
    const detalhe = evento.rows[0]!.detalhe;

    // O texto livre não está lá, por nenhum nome de campo.
    expect(JSON.stringify(detalhe)).not.toContain("Dona Marta");
    expect(detalhe["observacao"]).toBeUndefined();

    // E o que a coordenação precisa continua: motivo, prazo, equipe, e o
    // caminho até o texto, que é minimizável.
    expect(detalhe["motivo"]).toBe("outro");
    expect(detalhe["prazoEm"]).toBeDefined();
    expect(detalhe["devolucaoId"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("o texto continua guardado na linha da devolução, que é onde dá para apagar", async () => {
    /*
      O oposto também precisa valer: tirar da trilha não pode virar perder. A
      coordenação depende dessa frase para decidir o que fazer com a ocorrência,
      e ela fica disponível até o prazo do município vencer.
    */
    const oc = await vencida("Rua da Trilha, 200");
    await devolver(oc, { motivo: "outro", observacao: "portão trancado, vizinha diz que viajaram" });

    const linha = await mem.bruto.query<{ observacao: string | null }>(
      "SELECT observacao FROM devolucoes_de_tarefa WHERE ocorrencia_id = $1", [oc],
    );
    expect(linha.rows[0]!.observacao).toBe("portão trancado, vizinha diz que viajaram");
  });
});
