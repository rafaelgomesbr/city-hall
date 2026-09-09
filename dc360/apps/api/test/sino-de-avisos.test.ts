import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { carregarConfig } from "../src/config.js";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { armazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { construirServidor } from "../src/servidor.js";
import { TETO_DE_AVISOS, RETENCAO_DE_AVISOS_DIAS } from "../src/rotas/avisos.js";

/*
  O sino de avisos do painel, do lado servidor.

  QUATRO COISAS ESTÃO SOB TESTE AQUI, e todas as quatro já quebraram este
  produto ou um parecido:

  1. LEITURA POR PESSOA. O mesmo fato é visto por várias pessoas, e cada uma lê
     no seu tempo. Com uma coluna `lido` dentro do aviso, a primeira pessoa da
     coordenadoria a abrir o sino apagaria o sino de todos os colegas, e nada na
     tela deles diria que passou alguma coisa. É o defeito clássico deste
     recurso, e ele é silencioso: ninguém reclama do que nunca viu.

  2. O MARCO DE TEMPO SAI DO BANCO. Se o cursor vier do relógio do navegador,
     qualquer diferença entre o relógio do computador da coordenadoria e o do
     servidor faz aviso ser pulado ou repetido. Repetido é chato; pulado é dano:
     o coordenador não fica sabendo que a vistoria chegou, e não existe nada na
     tela dizendo que ele perdeu alguma coisa.

  3. O TETO APARECE NA RESPOSTA. Teto calado faz o coordenador achar que viu
     tudo. Já aconteceu duas vezes neste produto (o mapa desenhava cem
     ocorrências sem avisar, a lista do aplicativo cortava em duzentas sem
     dizer), e por isso a resposta declara o teto, declara que cortou, e o
     número de não lidos continua contando o que foi cortado.

  4. RETENÇÃO. Aviso velho é lixo, e a consulta do sino roda a cada trinta
     segundos em toda aba aberta na prefeitura. Sem descarte, a tela mais
     consultada do produto fica mais lenta a cada mês.

  PENDÊNCIA REGISTRADA: nenhuma das duas rotas passa por `exigirPermissao`, e a
  razão está escrita em `src/rotas/avisos.ts`. Não existe ação no pacote
  compartilhado que descreva "receber aviso", e o pacote está fora da faixa
  deste turno. Se a casa preferir uma ação explícita, ela precisa nascer em
  `packages/shared/src/permissoes.ts` e entrar nas duas rotas de uma vez.
*/

let app: FastifyInstance;
let mem: BancoEmMemoria;

const SENHA = "senha-de-teste-bem-longa";

let orgId = "";
let orgVizinha = "";
let ocorrenciaId = "";
let ocorrenciaVizinha = "";
let agenteId = "";
let tokenAna = "";
let tokenBruno = "";
/** Aviso que existe no município vizinho, para provar que ele não vaza. */
let avisoVizinho = "";

type Resposta = {
  ate: string;
  ateId: string | null;
  itens: Array<{
    id: string;
    tipo: string;
    ocorrenciaId: string;
    protocolo: string;
    criadoEm: string;
    detalhe: string | null;
    lido: boolean;
  }>;
  teto: number;
  truncada: boolean;
  naoLidos: number;
  naoLidosTruncado: boolean;
};

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso as string;
}

async function sino(token: string, params: Record<string, string> = {}) {
  const busca = new URLSearchParams(params).toString();
  const r = await app.inject({
    method: "GET",
    url: busca ? `/avisos?${busca}` : "/avisos",
    headers: { authorization: `Bearer ${token}` },
  });
  return { status: r.statusCode, corpo: r.json() as Resposta };
}

async function marcarLidos(token: string, ids: string[]) {
  const r = await app.inject({
    method: "POST", url: "/avisos/lidos",
    headers: { authorization: `Bearer ${token}` },
    payload: { ids },
  });
  return { status: r.statusCode, corpo: r.json() as { marcados: number } };
}

/**
 * Grava um aviso com a idade que o teste precisa.
 *
 * Escreve pelo caminho do dono do banco, e não por uma rota, porque nenhuma
 * rota escolhe `criado_em`: a idade de um aviso é o relógio do servidor. O que
 * o teste está simulando aqui é a passagem do tempo, e não um caminho de
 * escrita que exista em produção.
 */
async function semearAviso(
  org: string,
  ocorrencia: string,
  chave: string,
  segundosAtras: number,
  tipo = "vistoria_recebida",
): Promise<string> {
  const r = await mem.bruto.query<{ id: string }>(
    `INSERT INTO avisos (organizacao_id, tipo, ocorrencia_id, chave_do_fato, criado_em)
     VALUES ($1,$2,$3,$4, now() - ($5 || ' seconds')::interval)
     RETURNING id`,
    [org, tipo, ocorrencia, chave, String(segundosAtras)],
  );
  return r.rows[0]!.id;
}

async function limparAvisos(): Promise<void> {
  await mem.bruto.query("DELETE FROM avisos_lidos");
  await mem.bruto.query("DELETE FROM avisos");
}

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

  const vizinha = await mem.bruto.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('Coordenadoria','Vale Fundo','MG') RETURNING id",
  );
  orgVizinha = vizinha.rows[0]!.id;

  // Duas pessoas do MESMO município: é entre elas que a leitura precisa ser
  // independente, e é esse o caso que uma coluna `lido` no aviso quebraria.
  for (const [nome, matricula, email] of [
    ["Ana", "SA-1", "ana@serraalta.exemplo.gov.br"],
    ["Bruno", "SA-2", "bruno@serraalta.exemplo.gov.br"],
  ] as const) {
    await mem.bruto.query(
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
       VALUES ($1,$2,$3,$4,'coordenador',$5)`,
      [orgId, nome, matricula, email, hash],
    );
  }
  const agente = await mem.bruto.query<{ id: string }>(
    `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel, senha_hash)
     VALUES ($1,'Diego','SA-3','diego@serraalta.exemplo.gov.br','agente_campo',$2)
     RETURNING id`,
    [orgId, hash],
  );
  agenteId = agente.rows[0]!.id;

  const oc = await mem.bruto.query<{ id: string }>(
    `INSERT INTO ocorrencias
       (organizacao_id, protocolo, tipo, status, severidade, endereco,
        solicitante_nome, canal_entrada, descricao)
     VALUES ($1,'000101/2026','deslizamento','em_campo','alta','Rua das Acacias, 245',
             'Joana','telefone','Trinca nova depois da chuva.')
     RETURNING id`,
    [orgId],
  );
  ocorrenciaId = oc.rows[0]!.id;

  const ocV = await mem.bruto.query<{ id: string }>(
    `INSERT INTO ocorrencias
       (organizacao_id, protocolo, tipo, status, endereco,
        solicitante_nome, canal_entrada, descricao)
     VALUES ($1,'000101/2026','inundacao','em_campo','Avenida Central, 900',
             'Marcos','telefone','Agua entrou na casa.')
     RETURNING id`,
    [orgVizinha],
  );
  ocorrenciaVizinha = ocV.rows[0]!.id;

  avisoVizinho = await semearAviso(orgVizinha, ocorrenciaVizinha, "vistoria:vizinha", 3600);

  tokenAna = await entrar("ana@serraalta.exemplo.gov.br");
  tokenBruno = await entrar("bruno@serraalta.exemplo.gov.br");
}, 120_000);

afterAll(async () => {
  await app.close();
  await mem.banco.encerrar();
});

describe("cada pessoa lê no seu tempo", () => {
  it("uma pessoa marcar como lido não apaga o sino da colega", async () => {
    /*
      ESTE É O TESTE QUE JUSTIFICA A SEGUNDA TABELA.

      Com uma coluna `lido` dentro do aviso, a Ana marcando como lido apagaria
      o sino do Bruno, e o Bruno nunca saberia que a vistoria chegou. Não
      haveria erro, nem log, nem nada na tela dele: o defeito se apaga junto
      com o aviso, e por isso ninguém reclama dele.
    */
    await limparAvisos();
    const aviso = await semearAviso(orgId, ocorrenciaId, "vistoria:compartilhada", 60);

    const antesAna = await sino(tokenAna);
    const antesBruno = await sino(tokenBruno);
    expect(antesAna.corpo.itens.map((a) => a.id)).toContain(aviso);
    expect(antesBruno.corpo.itens.map((a) => a.id)).toContain(aviso);
    expect(antesAna.corpo.naoLidos).toBe(1);
    expect(antesBruno.corpo.naoLidos).toBe(1);

    const marcou = await marcarLidos(tokenAna, [aviso]);
    expect(marcou.status).toBe(200);
    expect(marcou.corpo.marcados).toBe(1);

    const depoisAna = await sino(tokenAna);
    expect(depoisAna.corpo.itens.find((a) => a.id === aviso)?.lido).toBe(true);
    expect(depoisAna.corpo.naoLidos).toBe(0);

    const depoisBruno = await sino(tokenBruno);
    expect(
      depoisBruno.corpo.itens.find((a) => a.id === aviso),
      "o aviso sumiu do sino do colega quando a outra pessoa leu",
    ).toBeDefined();
    expect(
      depoisBruno.corpo.itens.find((a) => a.id === aviso)?.lido,
      "a leitura de uma pessoa marcou o aviso como lido para a outra",
    ).toBe(false);
    expect(
      depoisBruno.corpo.naoLidos,
      "a contagem do colega zerou porque outra pessoa leu: é o defeito que a "
      + "tabela separada existe para impedir",
    ).toBe(1);
  });

  it("marcar de novo não conta de novo, e o instante da primeira leitura fica", async () => {
    /*
      O painel reenvia o que já estava marcado toda vez que a lista recarrega.
      Sem `ON CONFLICT DO NOTHING`, isso seria erro de unicidade a cada
      recarga; sobrescrevendo, `lido_em` viraria a hora da última recarga, e a
      pergunta "a coordenação viu esse aviso, e a que horas?" perderia a única
      resposta que ela tem.
    */
    await limparAvisos();
    const aviso = await semearAviso(orgId, ocorrenciaId, "vistoria:repetida", 60);

    const primeira = await marcarLidos(tokenAna, [aviso]);
    expect(primeira.corpo.marcados).toBe(1);

    const antes = await mem.bruto.query<{ lido_em: Date }>(
      "SELECT lido_em FROM avisos_lidos WHERE aviso_id = $1",
      [aviso],
    );

    const segunda = await marcarLidos(tokenAna, [aviso]);
    expect(segunda.status).toBe(200);
    expect(
      segunda.corpo.marcados,
      "marcar como lido o que já estava lido contou de novo",
    ).toBe(0);

    const depois = await mem.bruto.query<{ lido_em: Date }>(
      "SELECT lido_em FROM avisos_lidos WHERE aviso_id = $1",
      [aviso],
    );
    expect(depois.rows).toHaveLength(1);
    expect(
      new Date(depois.rows[0]!.lido_em).getTime(),
      "a segunda marcação reescreveu a hora da primeira leitura",
    ).toBe(new Date(antes.rows[0]!.lido_em).getTime());
  });

  it("aviso de outro município não é lido nem marcado, e nada confirma que ele existe", async () => {
    /*
      Marcar como lido é escrita, e a escrita passa por dentro de `avisos`, sob
      o RLS. Um identificador de outra prefeitura não casa com linha nenhuma e
      some sem resposta. Inserido direto, ele bateria na chave estrangeira e
      voltaria como erro de banco, e um erro aqui contaria a quem perguntou que
      aquele aviso existe em algum lugar.
    */
    const visto = await sino(tokenAna);
    expect(
      visto.corpo.itens.map((a) => a.id),
      "o sino de um município mostrou o acontecimento de outro",
    ).not.toContain(avisoVizinho);

    const r = await marcarLidos(tokenAna, [avisoVizinho]);
    expect(r.status, "recurso de outro município virou erro, e erro é resposta").toBe(200);
    expect(r.corpo.marcados).toBe(0);

    const gravou = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM avisos_lidos WHERE aviso_id = $1",
      [avisoVizinho],
    );
    expect(gravou.rows[0]!.n).toBe("0");
  });
});

describe("o marco de tempo sai do banco, e o cliente só ecoa", () => {
  it("a resposta devolve a hora do banco, e a pergunta seguinte a ecoa", async () => {
    await limparAvisos();
    await semearAviso(orgId, ocorrenciaId, "vistoria:antiga", 600);

    const primeira = await sino(tokenAna);
    expect(primeira.status).toBe(200);
    expect(primeira.corpo.ate, "a resposta não devolveu marco de tempo nenhum").toBeTruthy();
    expect(Number.isNaN(Date.parse(primeira.corpo.ate))).toBe(false);
    expect(primeira.corpo.itens).toHaveLength(1);

    // Ecoando o marco, nada volta duas vezes: o que já foi entregue está
    // abaixo do corte.
    const segunda = await sino(tokenAna, { desde: primeira.corpo.ate });
    expect(
      segunda.corpo.itens,
      "o mesmo aviso voltou na pergunta seguinte, apesar do marco ecoado",
    ).toHaveLength(0);
  });

  it("cursor vindo do futuro não come aviso: ele não é cursor, e é descartado", async () => {
    /*
      ESTE É O DEFEITO QUE O MARCO DO SERVIDOR EVITA, e ele custava o sino
      inteiro.

      Um computador de prefeitura com o relógio adiantado uma hora manda um
      `desde` que ainda não aconteceu. A janela vira "o que foi criado depois
      do futuro", que é nada, e a resposta sai vazia. Sozinho isso seria só uma
      volta perdida. O dano vinha do marco: com o `ate` avançando assim mesmo,
      a pergunta SEGUINTE começava depois de tudo o que já estava gravado, e o
      histórico inteiro ficava atrás do cursor, sem erro, sem log e sem nada na
      tela dizendo que faltou alguma coisa.

      Nenhum `ate` que este servidor emite é maior que o relógio dele, então um
      `desde` adiante do banco só pode ter sido inventado pelo cliente. A rota
      descarta e trata como primeira carga: custa uma volta, não custa
      histórico.
    */
    await limparAvisos();
    const aviso = await semearAviso(orgId, ocorrenciaId, "vistoria:relogio-torto", 60);

    const futuro = new Date(Date.now() + 3_600_000).toISOString();
    const adiantada = await sino(tokenAna, { desde: futuro });
    expect(adiantada.status).toBe(200);

    expect(
      Date.parse(adiantada.corpo.ate),
      "a resposta ecoou de volta o relógio do cliente: o vão nunca mais seria "
      + "consultado, e o coordenador não teria como saber que perdeu algo",
    ).toBeLessThan(Date.parse(futuro));

    expect(
      adiantada.corpo.itens.map((a) => a.id),
      "o cursor inventado pelo cliente entrou na consulta e engoliu o aviso",
    ).toContain(aviso);

    // E o marco devolvido continua servindo para a pergunta seguinte: ele é do
    // banco, então nada do que já foi entregue volta.
    const seguinte = await sino(tokenAna, { desde: adiantada.corpo.ate });
    expect(seguinte.corpo.itens).toHaveLength(0);
  });

  it("a margem de commit atrasa o aviso recém-nascido, e não o descarta", async () => {
    /*
      `criado_em` recebe `now()`, que no Postgres é o instante em que a
      transação COMEÇOU. Uma sincronização que começa às 10h00m00s e confirma
      às 10h00m04s grava um aviso carimbado com 10h00m00s que ninguém enxerga
      antes das 10h00m04s. Sem margem, uma consulta às 10h00m01s devolveria
      "até 10h00m01s" sem ver o aviso, e a pergunta seguinte já começaria
      depois do carimbo dele: gravado no banco, invisível para sempre.

      O teste simula a passagem do tempo envelhecendo a linha, que é o que o
      relógio faria sozinho alguns segundos depois.
    */
    await limparAvisos();
    const aviso = await semearAviso(orgId, ocorrenciaId, "vistoria:recem-nascida", 0);
    const desde = new Date(Date.now() - 300_000).toISOString();

    const cedo = await sino(tokenAna, { desde });
    expect(
      cedo.corpo.itens.map((a) => a.id),
      "o aviso do instante presente entrou na resposta: sem margem, o que "
      + "confirmar depois desta consulta cai num vão que ninguém consulta de novo",
    ).not.toContain(aviso);

    await mem.bruto.query(
      "UPDATE avisos SET criado_em = now() - interval '60 seconds' WHERE id = $1",
      [aviso],
    );

    const depois = await sino(tokenAna, { desde });
    expect(
      depois.corpo.itens.map((a) => a.id),
      "o aviso segurado pela margem não apareceu na consulta seguinte: a margem "
      + "deixou de atrasar e passou a descartar",
    ).toContain(aviso);
  });
});

describe("o teto aparece na resposta, e nada é pulado por causa dele", () => {
  it("corta no teto, declara o teto e declara que cortou", async () => {
    await limparAvisos();
    /*
      Cinco a mais que o teto. Idades distintas de propósito: com o mesmo
      instante em todas, a ordem dependeria do desempate, e o que este caso
      mede é o corte, não o desempate.
    */
    for (let i = 0; i < TETO_DE_AVISOS + 5; i++) {
      await semearAviso(orgId, ocorrenciaId, `vistoria:lote-${i}`, 60 + i);
    }

    const r = await sino(tokenAna);
    expect(r.corpo.itens).toHaveLength(TETO_DE_AVISOS);
    expect(r.corpo.teto, "a resposta não declara o teto que aplicou").toBe(TETO_DE_AVISOS);
    expect(r.corpo.truncada, "a resposta cortou a lista e não avisou").toBe(true);
  });

  it("a contagem de não lidos sobrevive ao corte, senão o teto vira mentira", async () => {
    /*
      A lista cortada é aceitável; a contagem cortada junto não é. Se o número
      do sino contasse só o que coube, o coordenador leria "200 não lidos",
      leria os 200, veria o sino zerar, e os cinco que ficaram de fora nunca
      teriam existido para ele.
    */
    const r = await sino(tokenAna);
    expect(
      r.corpo.naoLidos,
      "o número do sino conta só o que coube na lista: o teto passou a mentir "
      + "pelo número em vez de pelo silêncio",
    ).toBe(TETO_DE_AVISOS + 5);
    expect(r.corpo.naoLidos).toBeGreaterThan(r.corpo.itens.length);
  });

  it("lista que cabe inteira não vem marcada como cortada", async () => {
    await limparAvisos();
    await semearAviso(orgId, ocorrenciaId, "vistoria:sozinha", 60);
    const r = await sino(tokenAna);
    expect(r.corpo.itens).toHaveLength(1);
    expect(r.corpo.truncada, "lista completa marcada como cortada assusta à toa").toBe(false);
    expect(r.corpo.teto).toBe(TETO_DE_AVISOS);
  });

  it("o corte não pula aviso: a pergunta seguinte continua de onde esta parou", async () => {
    /*
      ESTE É O CASO QUE SEPARA "CORTOU E DISSE" DE "CORTOU E PERDEU".

      Declarar `truncada` conta ao coordenador que existe mais do que coube. Não
      basta: ele precisa CONSEGUIR chegar no resto. Se o marco devolvido pular
      por cima do que ficou de fora do corte, aqueles avisos não voltam em
      pergunta nenhuma, e o número do sino passa a apontar para coisas que a
      tela não tem como mostrar.

      O teste pede página por página, ecoando o marco a cada rodada, e exige
      que a união das páginas seja o conjunto inteiro, sem falta e sem repetição.
    */
    await limparAvisos();
    const semeados: string[] = [];
    for (let i = 0; i < TETO_DE_AVISOS + 5; i++) {
      semeados.push(await semearAviso(orgId, ocorrenciaId, `vistoria:pagina-${i}`, 600 + i));
    }

    const colhidos: string[] = [];
    let desde: string | undefined;
    let desdeId: string | undefined;
    let rodadas = 0;
    for (;;) {
      rodadas += 1;
      expect(rodadas, "o sino entrou em laço sem avançar o marco").toBeLessThan(10);
      const r: { corpo: Resposta } = desde
        ? await sino(tokenAna, { desde, ...(desdeId ? { desdeId } : {}) })
        : await sino(tokenAna);
      colhidos.push(...r.corpo.itens.map((a) => a.id));
      desde = r.corpo.ate;
      desdeId = r.corpo.ateId ?? undefined;
      if (!r.corpo.truncada) break;
    }

    expect(
      new Set(colhidos).size,
      "avisos vieram repetidos entre uma pagina e a seguinte",
    ).toBe(colhidos.length);

    const faltando = semeados.filter((id) => !colhidos.includes(id));
    expect(
      faltando,
      `${faltando.length} avisos ficaram inalcançáveis: o corte os deixou de fora e o `
      + "marco devolvido passou por cima deles, então nenhuma pergunta seguinte "
      + "os traz de volta",
    ).toHaveLength(0);
  });
});

describe("retenção: aviso velho é lixo", () => {
  it("o expurgo leva o que passou do prazo e não toca no que ainda vale", async () => {
    await limparAvisos();
    const velho = await semearAviso(
      orgId, ocorrenciaId, "vistoria:vencida",
      (RETENCAO_DE_AVISOS_DIAS + 1) * 86_400,
    );
    const novo = await semearAviso(orgId, ocorrenciaId, "vistoria:viva", 60);

    // O expurgo pega carona na consulta do sino: é o único lugar do produto
    // que roda no contexto de um município sem precisar de privilégio.
    await sino(tokenAna);

    const restaram = await mem.bruto.query<{ id: string }>(
      "SELECT id FROM avisos WHERE organizacao_id = $1", [orgId],
    );
    const ids = restaram.rows.map((l) => l.id);
    expect(
      ids,
      "o aviso vencido continuou na tabela: sem descarte ela cresce para sempre "
      + "e a consulta do sino fica mais lenta a cada mês",
    ).not.toContain(velho);
    expect(ids, "o expurgo levou junto o aviso que ainda vale").toContain(novo);
  });

  it("o expurgo de um município não alcança o sino do vizinho", async () => {
    const velhoVizinho = await semearAviso(
      orgVizinha, ocorrenciaVizinha, "vistoria:vizinha-vencida",
      (RETENCAO_DE_AVISOS_DIAS + 1) * 86_400,
    );

    await sino(tokenAna);

    const conf = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM avisos WHERE id = $1", [velhoVizinho],
    );
    expect(
      conf.rows[0]!.n,
      "a consulta do sino de um município apagou histórico do outro",
    ).toBe("1");
  });
});

describe("de onde vem o fato", () => {
  it("vistoria que chega ao servidor toca o sino, e o reenvio não toca de novo", async () => {
    /*
      O aviso nasce de gatilho na tabela, e não de uma chamada dentro da rota
      de sincronização. A diferença aparece no dia em que a vistoria entrar por
      outro caminho (uma importação, um script de correção, uma segunda rota):
      amarrado à tabela, o sino toca de qualquer um deles.

      O reenvio da mesma coleta é o normal do trabalho offline, e ele não pode
      virar aviso novo: o coordenador veria a mesma vistoria três vezes numa
      noite de sinal ruim e aprenderia a ignorar o sino.
    */
    await limparAvisos();
    const chave = crypto.randomUUID();
    const vistoria = await mem.bruto.query<{ id: string }>(
      `INSERT INTO vistorias
         (organizacao_id, ocorrencia_id, agente_id, checklist, assinante_nome,
          coletada_em, idempotency_key)
       VALUES ($1,$2,$3,'{}'::jsonb,'Joana', now(), $4)
       RETURNING id`,
      [orgId, ocorrenciaId, agenteId, chave],
    );

    const avisos = await mem.bruto.query<{ tipo: string; chave_do_fato: string }>(
      "SELECT tipo, chave_do_fato FROM avisos WHERE organizacao_id = $1", [orgId],
    );
    expect(avisos.rows, "a vistoria chegou e o sino não tocou").toHaveLength(1);
    expect(avisos.rows[0]!.tipo).toBe("vistoria_recebida");
    expect(avisos.rows[0]!.chave_do_fato).toBe(`vistoria:${vistoria.rows[0]!.id}`);

    // Reenvio: a mesma chave de idempotência não grava vistoria nova, então o
    // gatilho nem chega a rodar. E se um dia rodar, a chave do fato segura.
    await mem.bruto.query(
      `INSERT INTO vistorias
         (organizacao_id, ocorrencia_id, agente_id, checklist, assinante_nome,
          coletada_em, idempotency_key)
       VALUES ($1,$2,$3,'{}'::jsonb,'Joana', now(), $4)
       ON CONFLICT (organizacao_id, idempotency_key) DO NOTHING`,
      [orgId, ocorrenciaId, agenteId, chave],
    );
    const depois = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM avisos WHERE organizacao_id = $1", [orgId],
    );
    expect(depois.rows[0]!.n, "o reenvio da mesma coleta tocou o sino de novo").toBe("1");
  });

  it("providência respondida toca o sino uma vez, e a correção de texto não toca", async () => {
    await limparAvisos();
    const prov = await mem.bruto.query<{ id: string }>(
      `INSERT INTO providencias
         (organizacao_id, ocorrencia_id, orgao_destino, descricao, responsavel, prazo_em)
       VALUES ($1,$2,'Secretaria de Obras','Conter o talude','Chefe de gabinete',
               now() + interval '5 days')
       RETURNING id`,
      [orgId, ocorrenciaId],
    );
    const provId = prov.rows[0]!.id;

    const semResposta = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM avisos WHERE organizacao_id = $1", [orgId],
    );
    expect(semResposta.rows[0]!.n, "encaminhar já tocou o sino da resposta").toBe("0");

    await mem.bruto.query(
      `UPDATE providencias
          SET respondida_em = now(), resposta = 'Talude contido.', desfecho = 'atendida'
        WHERE id = $1`,
      [provId],
    );
    const comResposta = await mem.bruto.query<{ tipo: string; chave_do_fato: string }>(
      "SELECT tipo, chave_do_fato FROM avisos WHERE organizacao_id = $1", [orgId],
    );
    expect(comResposta.rows, "a resposta chegou e o sino não tocou").toHaveLength(1);
    expect(comResposta.rows[0]!.tipo).toBe("providencia_respondida");
    expect(comResposta.rows[0]!.chave_do_fato).toBe(`providencia:${provId}`);

    /*
      Corrigir o texto de uma resposta já registrada não é fato novo. Sem a
      condição de transição no gatilho, cada correção tocaria o sino outra vez,
      e o coordenador aprenderia a ignorá-lo, que é a única forma de quebrar
      este recurso de vez.
    */
    await mem.bruto.query(
      "UPDATE providencias SET resposta = 'Talude contido com lona e drenagem.' WHERE id = $1",
      [provId],
    );
    const depois = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM avisos WHERE organizacao_id = $1", [orgId],
    );
    expect(
      depois.rows[0]!.n,
      "corrigir o texto da resposta tocou o sino de novo",
    ).toBe("1");
  });

  it("prazo que vence vira aviso uma vez só, mesmo com o sino consultado sem parar", async () => {
    /*
      Prazo vencido é o único dos três fatos que nenhuma escrita dispara: ele
      acontece pela passagem do tempo. Quem o materializa é a própria consulta
      do sino, que roda a cada trinta segundos em toda aba aberta. Sem a chave
      do fato, cada consulta criaria uma linha nova e o mesmo prazo apareceria
      repetido a cada meio minuto, para sempre.
    */
    await limparAvisos();
    await mem.bruto.query(
      "UPDATE ocorrencias SET prazo_em = now() - interval '2 hours' WHERE id = $1",
      [ocorrenciaId],
    );

    await sino(tokenAna);
    await sino(tokenBruno);
    await sino(tokenAna);

    const r = await mem.bruto.query<{ tipo: string }>(
      "SELECT tipo FROM avisos WHERE organizacao_id = $1 AND tipo = 'prazo_vencido'",
      [orgId],
    );
    expect(
      r.rows,
      "o mesmo prazo vencido virou mais de um aviso: o sino repetiria a cada "
      + "consulta e ensinaria o coordenador a ignorá-lo",
    ).toHaveLength(1);

    await mem.bruto.query(
      "UPDATE ocorrencias SET prazo_em = NULL WHERE id = $1", [ocorrenciaId],
    );
  });
});

describe("o que o sino NÃO carrega", () => {
  /**
   * O sino é a superfície mais lida do produto: uma pergunta a cada trinta
   * segundos, por pessoa logada, o dia inteiro, e a resposta passa por log de
   * proxy, cache de navegador e tela compartilhada de recepção.
   *
   * Ele não precisa de nome, contato, endereço, relato nem descrição de
   * vulnerabilidade para cumprir a função dele, que é levar a pessoa até a
   * ocorrência. O protocolo faz isso, e protocolo não identifica ninguém.
   * Carregar o resto transformaria a consulta mais frequente do sistema num
   * despejo permanente de dado pessoal de família em situação de risco.
   */
  it("nem solicitante, nem contato, nem endereço, nem relato, nem vulnerabilidade", async () => {
    await mem.bruto.query(
      `UPDATE ocorrencias
          SET solicitante_contato = '(31) 98888-7777',
              vulnerabilidade_presente = true,
              vulnerabilidade_descricao = 'Idosa acamada no imovel'
        WHERE id = $1`,
      [ocorrenciaId],
    );
    await limparAvisos();
    await semearAviso(orgId, ocorrenciaId, "vistoria:sem-dado-pessoal", 60);

    const r = await sino(tokenAna);
    const cru = JSON.stringify(r.corpo);

    for (const proibido of [
      "Joana", "98888-7777", "Rua das Acacias",
      "Trinca nova", "Idosa acamada",
    ]) {
      expect(
        cru,
        `o sino passou a devolver "${proibido}": é dado pessoal numa resposta `
        + "que sai a cada trinta segundos e entra em log de proxy e cache de "
        + "navegador",
      ).not.toContain(proibido);
    }

    // E continua servindo para o que existe: o protocolo leva ao registro.
    expect(
      r.corpo.itens.map((a) => a.protocolo),
      "sem o protocolo o aviso não leva a lugar nenhum, e aí ele é só barulho",
    ).toContain("000101/2026");
  });

  it("sem token, o sino não responde", async () => {
    const r = await app.inject({ method: "GET", url: "/avisos" });
    expect(r.statusCode).toBe(401);
  });
});

describe("a retenção é a mesma dos dois lados", () => {
  /**
   * A retenção de verdade é a policy `avisos_expurgo` da migração 018: é ela
   * que impede uma rota de apagar aviso que ainda vale, e o banco não negocia.
   * A constante da rota é uma CÓPIA, usada para pedir só o que ela pode levar.
   *
   * Cópia que ninguém confere é cópia que diverge, e a divergência aqui é
   * silenciosa nos dois sentidos: com a rota pedindo menos, avisos vencidos
   * ficariam na tabela para sempre; com a rota pedindo mais, o `DELETE` sairia
   * toda vez sem apagar nada, e o expurgo viraria uma consulta a troco de nada
   * a cada trinta segundos.
   */
  it("o prazo da rota é o mesmo número escrito na policy do banco", async () => {
    const r = await mem.bruto.query<{ qual: string }>(
      "SELECT qual FROM pg_policies WHERE tablename = 'avisos' AND policyname = 'avisos_expurgo'",
    );
    expect(r.rows, "a policy de expurgo sumiu do banco").toHaveLength(1);
    expect(
      r.rows[0]!.qual,
      "a retenção da rota e a da policy divergiram, e quem manda é a policy",
    ).toContain(`${RETENCAO_DE_AVISOS_DIAS} days`);
  });
});

describe("prazo que não é mais assunto de ninguém", () => {
  /**
   * Aviso de prazo vencido só serve enquanto houver o que fazer. Depois de
   * encerrada, a ocorrência saiu da fila, e o aviso só gastaria a atenção de
   * quem olha o sino. Sino que toca à toa é sino que a equipe aprende a
   * ignorar, e aí ele deixa de funcionar para o caso em que importa.
   */
  it("prazo vencido de ocorrência encerrada não toca o sino", async () => {
    await limparAvisos();
    const oc = await mem.bruto.query<{ id: string }>(
      `INSERT INTO ocorrencias
         (organizacao_id, protocolo, tipo, status, endereco, solicitante_nome,
          canal_entrada, descricao, prazo_em, encerrado_em, motivo_encerramento)
       VALUES ($1,'000801/2026','vendaval','encerrada','Rua Fechada, 2','Fulano',
               'telefone','x', now() - interval '30 minutes', now(),
               'sem risco remanescente')
       RETURNING id`,
      [orgId],
    );

    await sino(tokenAna);

    const r = await mem.bruto.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM avisos WHERE ocorrencia_id = $1",
      [oc.rows[0]!.id],
    );
    expect(
      r.rows[0]!.n,
      "o sino avisou sobre prazo de ocorrência já encerrada: o trabalho saiu da "
      + "fila e o aviso só gasta a atenção de quem olha",
    ).toBe("0");
  });
});
