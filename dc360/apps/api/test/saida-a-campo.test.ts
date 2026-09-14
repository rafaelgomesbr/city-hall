import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";

/**
 * Segurança do agente que trabalha sozinho.
 *
 * O CENÁRIO: o agente sobe um morro sozinho, sem sinal, para vistoriar um talude
 * que acabou de escorregar. O produto já reconhecia por escrito que isso
 * acontece (`risco_para_a_equipe` é motivo de devolução desde a migração 028) e
 * não tinha uma linha de código para o caso de ele ter entrado.
 *
 * O QUE ESTE ARQUIVO DEFENDE, e cada caso foi visto em vermelho antes de existir
 * a correção:
 *
 *  1. O PRAZO É DO SERVIDOR. Relógio de aparelho não decide nada, e um aparelho
 *     mentindo sobre a hora não compra nem perde tempo de segurança.
 *  2. Uma saída aberta por agente, imposta pelo banco, com frase que resolve.
 *  3. Autoria conferida contra o dono do token: saída com o agente errado faria
 *     a coordenação procurar a pessoa errada.
 *  4. Ocorrência de outra equipe ou de outro município responde 404, nunca 403.
 *  5. Prorrogar EMPURRA e nunca encurta, e conta a partir de agora.
 *  6. A coordenação não consegue afirmar que o agente confirmou o retorno.
 *  7. "Acionei apoio" sem dizer o que foi acionado é recusado.
 *  8. O prazo estourado vira aviso no sino, e ele some da fila quando o agente
 *     confirma antes de alguém olhar.
 *  9. A trilha registra os quatro atos, sem texto livre.
 * 10. A tela de quem coordena carrega, junto do número, a frase que diz o que o
 *     produto NÃO faz.
 */

const SENHA = "defesa-civil-2026";
const HASH_DA_SEMENTE =
  "scrypt$131072$8$1$56BVGGGziTxmINg0pEIjxw$F-aIq495xKVd9OKClsyKAFxxLHj26KkyKIWFMFAnBwk";

const SERRA_ALTA = "11111111-1111-4111-8111-000000000001";
const EQUIPE_ALFA = "11111111-1111-4111-8111-0000000000e1";
const EQUIPE_BRAVO = "11111111-1111-4111-8111-0000000000e2";
const DIEGO = "11111111-1111-4111-8111-0000000000d3";
/** O colega da equipe BRAVO: é por ele que o portão de equipe é provado. */
const BRUNO = "11111111-1111-4111-8111-0000000000da";
/**
 * A terceira agente, na equipe ALFA.
 *
 * Existe porque a regra "uma saída aberta por agente" é do banco: montar uma
 * lista com três saídas ao mesmo tempo exige três pessoas, e forçar duas do
 * mesmo agente seria escrever um estado que a aplicação não produz.
 */
const CARLA = "11111111-1111-4111-8111-0000000000db";

let mem: BancoEmMemoria;
let app: FastifyInstance;
let tokenDiego: string;
let tokenBruno: string;
let tokenCarla: string;
let tokenCoordenadora: string;
let tokenOperador: string;

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

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

type OpcoesDeSaida = {
  token?: string;
  chave?: string;
  agenteId?: string;
  duracaoMinutos?: number;
  sozinho?: boolean;
  declaradaEm?: string;
};

async function sair(ocorrenciaId: string, opcoes: OpcoesDeSaida = {}) {
  return app.inject({
    method: "POST", url: "/saida-a-campo",
    headers: com(opcoes.token ?? tokenDiego),
    payload: {
      idempotencyKey: opcoes.chave ?? crypto.randomUUID(),
      ocorrenciaId,
      agenteId: opcoes.agenteId ?? DIEGO,
      duracaoMinutos: opcoes.duracaoMinutos ?? 120,
      sozinho: opcoes.sozinho ?? true,
      declaradaEm: opcoes.declaradaEm ?? new Date().toISOString(),
    },
  });
}

/**
 * Empurra o prazo de retorno para o passado, como dono do banco.
 *
 * É o único jeito honesto de ter uma saída vencida num teste: esperar duas horas
 * não é opção, e mexer no relógio do processo mentiria justamente sobre a coisa
 * que este arquivo verifica, que é o relógio de QUEM decide. Aqui quem decide
 * continua sendo o Postgres, com o `now()` dele.
 */
async function estourarPrazo(saidaId: string, minutos = 40): Promise<void> {
  /*
    Os DOIS prazos andam juntos, e isso não é comodidade de teste: o CHECK
    `prorrogacao_nao_encurta` da migração 031 recusa um corrente menor que o
    inicial, de propósito, porque uma prorrogação nunca pode encurtar a margem
    de segurança de quem está lá fora. Mover só um aqui seria escrever no banco
    um estado que a aplicação não consegue produzir, e o teste passaria a provar
    um cenário que não existe.
  */
  await mem.bruto.query(
    `UPDATE saidas_a_campo
        SET retorno_previsto_inicial = now() - make_interval(mins => $2::int),
            retorno_previsto_em      = now() - make_interval(mins => $2::int)
      WHERE id = $1`,
    [saidaId, minutos],
  );
}

async function linhaDaSaida(saidaId: string): Promise<{
  agente_id: string; equipe_id: string | null; sozinho: boolean;
  duracao_minutos: number; retorno_previsto_inicial: string; retorno_previsto_em: string;
  prorrogacoes: number; encerrada_em: string | null; encerrada_por: string | null;
  desfecho: string | null; observacao: string | null;
}> {
  const r = await mem.bruto.query<{
    agente_id: string; equipe_id: string | null; sozinho: boolean;
    duracao_minutos: number; retorno_previsto_inicial: string; retorno_previsto_em: string;
    prorrogacoes: number; encerrada_em: string | null; encerrada_por: string | null;
    desfecho: string | null; observacao: string | null;
  }>(
    `SELECT agente_id, equipe_id, sozinho, duracao_minutos,
            retorno_previsto_inicial::text, retorno_previsto_em::text, prorrogacoes,
            encerrada_em::text, encerrada_por, desfecho, observacao
       FROM saidas_a_campo WHERE id = $1`,
    [saidaId],
  );
  return r.rows[0]!;
}

async function eventos(ocorrenciaId: string): Promise<Array<{
  tipo: string; autor_id: string | null; origem: string;
  detalhe: Record<string, unknown> | null;
}>> {
  const r = await mem.bruto.query<{
    tipo: string; autor_id: string | null; origem: string;
    detalhe: Record<string, unknown> | null;
  }>(
    `SELECT tipo, autor_id, origem, detalhe
       FROM trilha_eventos WHERE ocorrencia_id = $1 ORDER BY registrado_em, tipo`,
    [ocorrenciaId],
  );
  return r.rows;
}

/**
 * Consultar o sino, que é o que MATERIALIZA o fato.
 *
 * Não devolve os itens de propósito. A rota corta a resposta dez segundos atrás
 * do relógio do banco (`MARGEM_DE_COMMIT_SEGUNDOS`), porque `now()` no Postgres
 * é o início da transação e um aviso gravado agora ainda não confirmou para
 * quem está perguntando. Esperar dez segundos num teste seria trocar uma
 * verificação por uma espera, então o que se confere aqui é o que ficou
 * GRAVADO, que é o mesmo que o sino vai entregar na volta seguinte. Os casos do
 * `sino-de-avisos.test.ts` já conferem a entrega em si.
 */
async function consultarSino(token: string): Promise<void> {
  const r = await app.inject({ method: "GET", url: "/avisos", headers: com(token) });
  if (r.statusCode !== 200) throw new Error(`sino falhou: ${r.body}`);
}

async function avisosGravados(tipo: string): Promise<Array<{
  ocorrencia_id: string; detalhe: string | null; chave_do_fato: string;
}>> {
  const r = await mem.bruto.query<{
    ocorrencia_id: string; detalhe: string | null; chave_do_fato: string;
  }>(
    `SELECT ocorrencia_id, detalhe, chave_do_fato FROM avisos
      WHERE organizacao_id = $1 AND tipo = $2 ORDER BY criado_em`,
    [SERRA_ALTA, tipo],
  );
  return r.rows;
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });
  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-da-saida-a-campo-com-mais-de-trinta-e-dois-bytes",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({
    banco: mem.banco, config,
    armazenamento: armazenamentoEmMemoria({ baseUrl: "http://api.local" }),
  });
  await app.ready();

  // Um agente na OUTRA equipe. Existe para o portão de equipe ser provado com
  // gente de verdade, e não com identificador inventado.
  await mem.bruto.query(
    `INSERT INTO usuarios (id, organizacao_id, nome, matricula, email, papel, equipe_id, senha_hash)
     VALUES ($1,$2,'Bruno Tavares Lemos','SA-3401','bruno.lemos@serraalta.exemplo.gov.br',
             'agente_campo',$3,$4)`,
    [BRUNO, SERRA_ALTA, EQUIPE_BRAVO, HASH_DA_SEMENTE],
  );

  await mem.bruto.query(
    `INSERT INTO usuarios (id, organizacao_id, nome, matricula, email, papel, equipe_id, senha_hash)
     VALUES ($1,$2,'Carla Nunes Aparício','SA-3418','carla.aparicio@serraalta.exemplo.gov.br',
             'agente_campo',$3,$4)`,
    [CARLA, SERRA_ALTA, EQUIPE_ALFA, HASH_DA_SEMENTE],
  );

  tokenDiego = await entrar("diego.alves@serraalta.exemplo.gov.br");
  tokenBruno = await entrar("bruno.lemos@serraalta.exemplo.gov.br");
  tokenCarla = await entrar("carla.aparicio@serraalta.exemplo.gov.br");
  tokenCoordenadora = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
  tokenOperador = await entrar("jonas.ferreira@serraalta.exemplo.gov.br");
}, 180_000);

/*
  UMA SAÍDA ABERTA POR AGENTE é regra do banco, e é o que obriga esta limpeza:
  sem ela, a saída deixada em aberto por um caso faria todos os seguintes
  receberem `saida_ja_aberta`, e o arquivo inteiro provaria a recusa em vez do
  que cada caso diz provar. Limpar entre casos é o equivalente, aqui, a começar
  cada turno com todo mundo na base.
*/
beforeEach(async () => {
  await mem.bruto.query("DELETE FROM saidas_a_campo");
});

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("Declarar a saída", () => {
  it("grava o prazo com o relógio do SERVIDOR, e ignora o do aparelho", async () => {
    const id = await despachada("Rua do Talude, 10");

    /*
      O aparelho jura que são três horas no futuro. Se essa data encostasse no
      prazo, um relógio adiantado faria o alerta de um agente que não desceu
      sair três horas depois do que deveria, e um atrasado faria a saída nascer
      vencida. Nenhum dos dois pode acontecer.
    */
    const mentira = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    const r = await sair(id, { duracaoMinutos: 120, declaradaEm: mentira });

    expect(r.statusCode, r.body).toBe(201);
    const saida = r.json().saida;
    const linha = await linhaDaSaida(saida.id);

    const previsto = new Date(linha.retorno_previsto_em).getTime();
    const esperado = Date.now() + 120 * 60 * 1000;
    // Duas horas a partir de AGORA, com folga de um minuto para a máquina.
    expect(Math.abs(previsto - esperado)).toBeLessThan(60_000);
    // E, decisivo: nada perto das cinco horas que o aparelho pediria.
    expect(previsto).toBeLessThan(Date.now() + 3 * 60 * 60 * 1000);

    // O combinado original nasce igual ao corrente, e é ele que a prorrogação
    // não pode apagar.
    expect(linha.retorno_previsto_inicial).toBe(linha.retorno_previsto_em);
    expect(linha.prorrogacoes).toBe(0);
    expect(linha.equipe_id).toBe(EQUIPE_ALFA);
  });

  it("responde com a frase que diz o que o produto NÃO faz", async () => {
    const id = await despachada("Rua da Promessa, 20");
    const r = await sair(id);

    /*
      Esta é a única promessa que o produto faz ao agente sobre a segurança
      dele, e ela precisa dizer o limite junto: um botão de apoio que aciona
      alguém que não existe é pior do que botão nenhum, porque cria expectativa
      de socorro.
    */
    expect(r.json().aviso).toContain("ninguém é acionado automaticamente");
  });

  it("recusa a segunda saída aberta com uma frase que resolve, e não com erro de banco", async () => {
    const primeira = await despachada("Rua da Primeira, 30");
    const segunda = await despachada("Rua da Segunda, 31");

    expect((await sair(primeira)).statusCode).toBe(201);
    const r = await sair(segunda);

    /*
      O índice único parcial da migração 031 recusaria de qualquer jeito. O que
      este caso guarda é a recusa chegar como 4xx com instrução, e não como 500
      e "erro inesperado, informe o código ao suporte", para um problema que o
      agente resolve em uma tocada.
    */
    expect(r.statusCode).toBeLessThan(500);
    expect(r.json().erro).toBe("saida_ja_aberta");
    expect(r.json().mensagem).toContain("Confirme o retorno");
  });

  it("recusa saída declarada em nome de outro agente", async () => {
    const id = await despachada("Rua da Autoria, 40");
    // O token é do Bruno e o envelope diz Diego: a saída ficaria no nome de
    // quem não subiu, e a coordenação procuraria a pessoa errada no morro.
    const r = await sair(id, { token: tokenBruno, agenteId: DIEGO });

    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toBe("autor_divergente");
  });

  it("responde 404, e nunca 403, para ocorrência de outra equipe", async () => {
    const id = await despachada("Rua da Outra Equipe, 50", EQUIPE_ALFA);
    const r = await sair(id, { token: tokenBruno, agenteId: BRUNO });

    // 403 confirmaria que o registro existe, e confirmar existência já é
    // vazamento. Mesma regra do resto do produto.
    expect(r.statusCode).toBe(404);
  });

  it("recusa duração fora da faixa de um turno", async () => {
    const id = await despachada("Rua da Duração, 60");
    // Abaixo do piso o aviso chegaria antes de ele estacionar; acima do teto
    // não é jornada, é dedo escorregando na tela.
    expect((await sair(id, { duracaoMinutos: 5 })).statusCode).toBe(422);
    expect((await sair(id, { duracaoMinutos: 900 })).statusCode).toBe(422);
  });

  it("devolve o recibo antigo no reenvio da mesma chave, sem criar segunda saída", async () => {
    const id = await despachada("Rua da Chave, 70");
    const chave = crypto.randomUUID();

    const primeira = await sair(id, { chave });
    const segunda = await sair(id, { chave });

    expect(primeira.statusCode).toBe(201);
    expect(segunda.statusCode).toBe(200);
    expect(segunda.json().duplicada).toBe(true);
    expect(segunda.json().saida.id).toBe(primeira.json().saida.id);

    const quantas = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM saidas_a_campo WHERE ocorrencia_id = $1", [id],
    );
    expect(quantas.rows[0]!.n).toBe("1");
  });
});

describe("Prorrogar", () => {
  it("empurra o prazo a partir de AGORA, e tira a saída do vencimento", async () => {
    const id = await despachada("Rua da Prorrogação, 80");
    const saidaId = (await sair(id)).json().saida.id;
    await estourarPrazo(saidaId);

    const r = await app.inject({
      method: "POST", url: "/saida-a-campo/prorrogar", headers: com(tokenDiego),
      payload: {
        idempotencyKey: crypto.randomUUID(), saidaId,
        minutosAdicionais: 30, pedidaEm: new Date().toISOString(),
      },
    });

    expect(r.statusCode, r.body).toBe(200);
    /*
      ESTE É O CASO QUE O CAMINHO INTUITIVO ERRA. Somando ao prazo ANTIGO, uma
      saída vencida há quarenta minutos, prorrogada em trinta, continuaria
      vencida: o agente pediria mais tempo, o pedido seria aceito, e a tela
      continuaria acusando atraso. Contado de agora, trinta minutos quer dizer
      trinta minutos a partir de agora.
    */
    const linha = await linhaDaSaida(saidaId);
    expect(new Date(linha.retorno_previsto_em).getTime()).toBeGreaterThan(Date.now());
    expect(linha.prorrogacoes).toBe(1);
    // E o combinado original não se apaga: é a prova de qual era o acordo.
    expect(new Date(linha.retorno_previsto_inicial).getTime())
      .toBeLessThan(new Date(linha.retorno_previsto_em).getTime());
  });

  it("nunca encurta o prazo de quem está lá fora", async () => {
    const id = await despachada("Rua do Encurtamento, 90");
    const saidaId = (await sair(id, { duracaoMinutos: 480 })).json().saida.id;
    const antes = (await linhaDaSaida(saidaId)).retorno_previsto_em;

    // Quinze minutos a partir de agora é MENOS que as oito horas já marcadas.
    // Aceitar isso encurtaria a margem de segurança de alguém no morro.
    await app.inject({
      method: "POST", url: "/saida-a-campo/prorrogar", headers: com(tokenDiego),
      payload: {
        idempotencyKey: crypto.randomUUID(), saidaId,
        minutosAdicionais: 15, pedidaEm: new Date().toISOString(),
      },
    });

    expect((await linhaDaSaida(saidaId)).retorno_previsto_em).toBe(antes);
  });

  it("responde 404 para a saída de um colega", async () => {
    const id = await despachada("Rua do Colega, 100");
    const saidaId = (await sair(id)).json().saida.id;

    const r = await app.inject({
      method: "POST", url: "/saida-a-campo/prorrogar", headers: com(tokenBruno),
      payload: {
        idempotencyKey: crypto.randomUUID(), saidaId,
        minutosAdicionais: 30, pedidaEm: new Date().toISOString(),
      },
    });
    expect(r.statusCode).toBe(404);
  });
});

describe("Confirmar o retorno", () => {
  it("encerra com o desfecho do próprio agente e registra se foi no prazo", async () => {
    const id = await despachada("Rua do Retorno, 110");
    const saidaId = (await sair(id)).json().saida.id;

    const r = await app.inject({
      method: "POST", url: "/saida-a-campo/retorno", headers: com(tokenDiego),
      payload: {
        idempotencyKey: crypto.randomUUID(), saidaId,
        confirmadoEm: new Date().toISOString(),
      },
    });

    expect(r.statusCode, r.body).toBe(200);
    const linha = await linhaDaSaida(saidaId);
    expect(linha.desfecho).toBe("retorno_confirmado");
    expect(linha.encerrada_por).toBe(DIEGO);

    const evento = (await eventos(id)).find((e) => e.tipo === "retorno_de_campo_confirmado");
    expect(evento?.origem).toBe("campo");
    expect(evento?.detalhe?.["noPrazo"]).toBe(true);
  });

  it("aceita a confirmação tardia de uma saída que a coordenação já encerrou", async () => {
    const id = await despachada("Rua da Confirmação Tardia, 120");
    const saidaId = (await sair(id)).json().saida.id;
    await estourarPrazo(saidaId);

    await app.inject({
      method: "POST", url: "/saida-a-campo/encerrar", headers: com(tokenCoordenadora),
      payload: { saidaId, desfecho: "contato_estabelecido", observacao: "Falei pelo rádio" },
    });

    /*
      O CASO NORMAL, e é ele que não pode virar recusa vermelha: o agente perde
      o sinal, o prazo estoura, a coordenação fala com ele pelo rádio e encerra,
      e o aparelho dele só reencontra rede depois. Se isso fosse erro, ele
      receberia uma recusa por ter feito exatamente a coisa certa e o item
      ficaria travado na tela dele.
    */
    const r = await app.inject({
      method: "POST", url: "/saida-a-campo/retorno", headers: com(tokenDiego),
      payload: {
        idempotencyKey: crypto.randomUUID(), saidaId,
        confirmadoEm: new Date().toISOString(),
      },
    });

    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().duplicada).toBe(true);
    // E o desfecho que fica é o de quem encerrou primeiro, não o novo.
    expect(r.json().desfecho).toBe("contato_estabelecido");
    expect((await linhaDaSaida(saidaId)).desfecho).toBe("contato_estabelecido");
  });
});

describe("A coordenação encerra", () => {
  it("registra o ato na trilha, com desfecho e sem o texto livre", async () => {
    const id = await despachada("Rua do Encerramento, 130");
    const saidaId = (await sair(id)).json().saida.id;
    await estourarPrazo(saidaId);

    const r = await app.inject({
      method: "POST", url: "/saida-a-campo/encerrar", headers: com(tokenCoordenadora),
      payload: {
        saidaId, desfecho: "apoio_acionado",
        observacao: "Acionei o Corpo de Bombeiros às 11h20",
      },
    });

    expect(r.statusCode, r.body).toBe(200);
    const linha = await linhaDaSaida(saidaId);
    expect(linha.desfecho).toBe("apoio_acionado");
    expect(linha.observacao).toBe("Acionei o Corpo de Bombeiros às 11h20");

    const evento = (await eventos(id)).find((e) => e.tipo === "saida_a_campo_encerrada");
    expect(evento?.origem).toBe("escritorio");
    expect(evento?.detalhe?.["desfecho"]).toBe("apoio_acionado");
    /*
      Estava vencida quando encerraram? É a primeira pergunta de uma apuração, e
      ela não se responde depois: `now()` de hoje não diz nada sobre o prazo de
      seis meses atrás sem alguém refazer a conta à mão.
    */
    expect(evento?.detalhe?.["estavaVencida"]).toBe(true);
    /*
      O TEXTO NÃO ENTRA NA TRILHA, pela mesma regra da devolução: ela é
      append-only, e o que entra não sai por caminho nenhum.
    */
    expect(JSON.stringify(evento?.detalhe)).not.toContain("Bombeiros");
    expect(evento?.detalhe?.["temObservacao"]).toBe(true);
  });

  it("recusa 'acionei apoio' sem dizer o que foi acionado", async () => {
    const id = await despachada("Rua do Apoio Mudo, 140");
    const saidaId = (await sair(id)).json().saida.id;

    const r = await app.inject({
      method: "POST", url: "/saida-a-campo/encerrar", headers: com(tokenCoordenadora),
      payload: { saidaId, desfecho: "apoio_acionado" },
    });

    // "Acionei apoio" sozinho é a frase que não ajuda ninguém seis meses
    // depois, e é justamente a linha que uma apuração vai procurar.
    expect(r.statusCode).toBe(422);
  });

  it("não deixa a coordenação afirmar que o agente confirmou o retorno", async () => {
    const id = await despachada("Rua da Palavra do Agente, 150");
    const saidaId = (await sair(id)).json().saida.id;

    const r = await app.inject({
      method: "POST", url: "/saida-a-campo/encerrar", headers: com(tokenCoordenadora),
      payload: { saidaId, desfecho: "retorno_confirmado" },
    });

    /*
      Quem diz "voltei" é quem voltou. Se a coordenação pudesse marcar isso, a
      linha passaria a afirmar que o agente confirmou o retorno quando foi outra
      pessoa que decidiu por ele, e essa é exatamente a linha que alguém vai ler
      depois de um acidente.
    */
    expect(r.statusCode).toBe(422);
    expect((await linhaDaSaida(saidaId)).desfecho).toBeNull();
  });

  it("recusa o segundo encerramento da mesma saída", async () => {
    const id = await despachada("Rua do Segundo Encerramento, 160");
    const saidaId = (await sair(id)).json().saida.id;
    const corpo = { saidaId, desfecho: "retorno_a_base" };

    expect((await app.inject({
      method: "POST", url: "/saida-a-campo/encerrar",
      headers: com(tokenCoordenadora), payload: corpo,
    })).statusCode).toBe(200);

    /*
      Aqui a recusa é a resposta certa, ao contrário da rota de retorno: lá quem
      repetia era o aparelho drenando fila, e aqui é uma pessoa clicando num
      botão. Deixar passar em silêncio gravaria dois encerramentos para o mesmo
      fato, o segundo por cima do primeiro, num registro que existe para ser
      prova.
    */
    const segunda = await app.inject({
      method: "POST", url: "/saida-a-campo/encerrar",
      headers: com(tokenCoordenadora), payload: corpo,
    });
    expect(segunda.statusCode).toBe(409);
    expect(segunda.json().erro).toBe("ja_encerrada");
  });
});

describe("A tela de quem coordena", () => {
  it("põe as vencidas primeiro, e quem foi sozinho na frente", async () => {
    /*
      Um município limpo, senão as saídas dos outros casos deste arquivo
      entrariam na lista e a ordem viraria coincidência.
    */
    await mem.bruto.query("DELETE FROM saidas_a_campo");

    const noPrazo = await despachada("Rua No Prazo, 170");
    const vencidaAcompanhado = await despachada("Rua Acompanhado, 171");
    const vencidaSozinho = await despachada("Rua Sozinho, 172", EQUIPE_BRAVO);

    // Diego foi acompanhado e estourou o prazo.
    const s2 = (await sair(vencidaAcompanhado, { sozinho: false })).json().saida.id;
    await estourarPrazo(s2);
    // Bruno foi SOZINHO e estourou o prazo: é ele que precisa vir primeiro.
    const s3 = (await sair(vencidaSozinho, { token: tokenBruno, agenteId: BRUNO }))
      .json().saida.id;
    await estourarPrazo(s3);
    // Carla está dentro do prazo, e por isso fica por último.
    const s4 = (await sair(noPrazo, { token: tokenCarla, agenteId: CARLA }))
      .json().saida.id;

    const r = await app.inject({
      method: "GET", url: "/saida-a-campo", headers: com(tokenCoordenadora),
    });
    expect(r.statusCode, r.body).toBe(200);
    const corpo = r.json();

    expect(corpo.itens.map((i: { id: string }) => i.id)).toEqual([s3, s2, s4]);
    expect(corpo.emCampo).toBe(3);
    expect(corpo.vencidas).toBe(2);
    /*
      O NÚMERO NÃO VEM SOZINHO. "2 com prazo estourado" ao lado de um selo
      vermelho pareceria um painel de monitoramento, e este produto não monitora
      ninguém: ele mostra o que foi declarado. Dizer isso junto do número é o
      que impede a coordenação de confiar num alarme que não existe.
    */
    expect(corpo.limite).toContain("não detecta queda");
    expect(corpo.limite).toContain("não aciona ninguém sozinho");
  });

  it("o operador de plantão enxerga a lista, porque é ele que está na sala", async () => {
    const r = await app.inject({
      method: "GET", url: "/saida-a-campo", headers: com(tokenOperador),
    });
    /*
      O valor inteiro deste recurso é alguém enxergar o prazo estourado, e a
      pessoa que está na sala às três da manhã de uma noite de temporal é o
      operador de plantão. Restringir à coordenação seria escolher a elegância
      da tabela de permissões contra a finalidade da coisa.
    */
    expect(r.statusCode, r.body).toBe(200);
  });

  it("o agente de campo não enxerga a lista do município", async () => {
    const r = await app.inject({
      method: "GET", url: "/saida-a-campo", headers: com(tokenDiego),
    });
    expect(r.statusCode).toBe(403);
  });

  it("o agente pergunta pela própria saída aberta e a encontra", async () => {
    await mem.bruto.query("DELETE FROM saidas_a_campo");
    const id = await despachada("Rua da Minha Saída, 180");
    const saidaId = (await sair(id)).json().saida.id;

    const r = await app.inject({
      method: "GET", url: "/saida-a-campo/minha", headers: com(tokenDiego),
    });
    /*
      O aparelho pergunta isto ao abrir. Sem a resposta, o agente que teve o
      aplicativo reiniciado (bateria, atualização, sistema matando o processo)
      volta sem nenhuma indicação de que está marcado como em campo, não confirma
      o retorno, e a coordenação passa a ver um alerta de alguém que está na base.
    */
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().saida.id).toBe(saidaId);
    expect(r.json().saida.vencida).toBe(false);
  });
});

describe("O sino", () => {
  it("toca quando o prazo estoura, dizendo se o agente foi sozinho", async () => {
    await mem.bruto.query("DELETE FROM saidas_a_campo");
    await mem.bruto.query("DELETE FROM avisos_lidos");
    await mem.bruto.query("DELETE FROM avisos");

    const id = await despachada("Rua do Sino, 190");
    const saidaId = (await sair(id, { sozinho: true })).json().saida.id;
    await estourarPrazo(saidaId);

    await consultarSino(tokenCoordenadora);
    const avisos = await avisosGravados("retorno_nao_confirmado");

    expect(avisos).toHaveLength(1);
    expect(avisos[0]!.ocorrencia_id).toBe(id);
    // 'sozinho' é o que decide se quem leu larga o que está fazendo. E é só
    // isso: nome de agente não passa pelo sino, que é a consulta mais frequente
    // do produto.
    expect(avisos[0]!.detalhe).toBe("sozinho");
  });

  it("não toca pela saída que o agente encerrou antes de alguém olhar", async () => {
    await mem.bruto.query("DELETE FROM saidas_a_campo");
    await mem.bruto.query("DELETE FROM avisos_lidos");
    await mem.bruto.query("DELETE FROM avisos");

    const id = await despachada("Rua do Silêncio, 200");
    const saidaId = (await sair(id)).json().saida.id;
    await estourarPrazo(saidaId);
    await app.inject({
      method: "POST", url: "/saida-a-campo/retorno", headers: com(tokenDiego),
      payload: { idempotencyKey: crypto.randomUUID(), saidaId,
        confirmadoEm: new Date().toISOString() },
    });

    /*
      O ALARME FALSO MAIS PREVISÍVEL DAQUI: o agente perde o sinal, volta dez
      minutos depois do prazo e confirma. Alarme falso repetido é o único jeito
      conhecido de matar este recurso de vez, porque a coordenação aprende a
      ignorar o sino.
    */
    await consultarSino(tokenCoordenadora);
    expect(await avisosGravados("retorno_nao_confirmado")).toEqual([]);
  });

  it("toca de novo quando uma saída prorrogada vence outra vez", async () => {
    await mem.bruto.query("DELETE FROM saidas_a_campo");
    await mem.bruto.query("DELETE FROM avisos_lidos");
    await mem.bruto.query("DELETE FROM avisos");

    const id = await despachada("Rua do Segundo Vencimento, 210");
    const saidaId = (await sair(id)).json().saida.id;
    await estourarPrazo(saidaId);
    await consultarSino(tokenCoordenadora);

    await app.inject({
      method: "POST", url: "/saida-a-campo/prorrogar", headers: com(tokenDiego),
      payload: { idempotencyKey: crypto.randomUUID(), saidaId,
        minutosAdicionais: 30, pedidaEm: new Date().toISOString() },
    });
    /*
      Trinta e cinco e não quarenta: a chave do fato é o instante do prazo
      truncado em SEGUNDOS, e dois vencimentos no mesmo segundo seriam o mesmo
      fato. Em produção isso não acontece (a prorrogação mínima é de quinze
      minutos), e aqui o número precisa diferir para o teste medir o que diz
      medir, e não a granularidade do relógio.
    */
    await estourarPrazo(saidaId, 35);

    /*
      O instante do prazo entra na chave do fato justamente por isto: prorrogada,
      a saída pode vencer de novo, e isso é fato novo. Fosse só o id da saída, o
      segundo vencimento seria engolido em silêncio, que é o que não pode
      acontecer quando o assunto é alguém que não desceu do morro.
    */
    await consultarSino(tokenCoordenadora);
    const avisos = await avisosGravados("retorno_nao_confirmado");
    expect(avisos).toHaveLength(2);
    // E as duas chaves são diferentes: é o instante do prazo que as separa.
    expect(avisos[0]!.chave_do_fato).not.toBe(avisos[1]!.chave_do_fato);
  });
});

describe("Isolamento entre municípios", () => {
  it("a lista de um município não mostra saída de outro", async () => {
    await mem.bruto.query("DELETE FROM saidas_a_campo");
    const id = await despachada("Rua do Isolamento, 220");
    await sair(id);

    const tokenVizinho = await entrar("aurelio.machado@valefundo.exemplo.gov.br");
    const r = await app.inject({
      method: "GET", url: "/saida-a-campo", headers: com(tokenVizinho),
    });

    expect(r.statusCode).toBe(200);
    expect(r.json().itens).toEqual([]);
    expect(r.json().emCampo).toBe(0);
  });

  it("encerrar saída de outro município responde 404, e nunca 403", async () => {
    await mem.bruto.query("DELETE FROM saidas_a_campo");
    const id = await despachada("Rua do 404, 230");
    const saidaId = (await sair(id)).json().saida.id;

    const tokenVizinho = await entrar("aurelio.machado@valefundo.exemplo.gov.br");
    const r = await app.inject({
      method: "POST", url: "/saida-a-campo/encerrar", headers: com(tokenVizinho),
      payload: { saidaId, desfecho: "retorno_a_base" },
    });

    expect(r.statusCode).toBe(404);
    expect((await linhaDaSaida(saidaId)).encerrada_em).toBeNull();
  });
});
