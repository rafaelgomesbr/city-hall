import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { travaDeProcesso, type Trava } from "../src/push/trava.js";
import {
  MARCADOR_REMOVIDO_POR_PRAZO, minimizarPorPrazo,
} from "../src/privacidade/minimizacao.js";

/**
 * A minimização por prazo, que é o que faz a seção 4 da política de
 * privacidade deixar de ser promessa.
 *
 * As perguntas que este arquivo responde são as que decidem se a coisa presta:
 *
 *   1. Vencido o prazo, o nome sai mesmo, e o ato administrativo fica?
 *   2. Dá para PROVAR que saiu, ou o campo só ficou vazio?
 *   3. Município que não configurou prazo perde alguma coisa?
 *   4. A descrição de vulnerabilidade social sai depois do nome em algum
 *      caminho?
 *   5. Duas máquinas no Fly geram evento duplicado numa trilha que não se
 *      corrige?
 *
 * Nada aqui inventa prazo: o prazo vem da coluna que o município preenche, que
 * é o ponto inteiro do desenho.
 */

let mem: BancoEmMemoria;
let orgComPrazo: string;
let orgSemPrazo: string;

const DIA = 86_400_000;

function haDias(dias: number): Date {
  return new Date(Date.now() - dias * DIA);
}

async function criarOrganizacao(
  nome: string,
  prazos: { solicitante?: number | null; vulnerabilidade?: number | null } = {},
): Promise<string> {
  const r = await mem.bruto.query<{ id: string }>(
    `INSERT INTO organizacoes
       (nome, municipio, uf, retencao_solicitante_dias, retencao_vulnerabilidade_dias)
     VALUES ($1, $1, 'MG', $2, $3) RETURNING id`,
    [nome, prazos.solicitante ?? null, prazos.vulnerabilidade ?? null],
  );
  return r.rows[0]!.id;
}

/** Uma ocorrência encerrada com dado de pessoa, que é o caso que interessa. */
async function criarOcorrencia(
  org: string,
  protocolo: string,
  opcoes: {
    encerradaHaDias?: number | null;
    comVulnerabilidade?: boolean;
    solicitante?: string;
  } = {},
): Promise<string> {
  const encerrada = opcoes.encerradaHaDias ?? null;
  const r = await mem.bruto.query<{ id: string }>(
    `INSERT INTO ocorrencias
       (organizacao_id, protocolo, tipo, status, severidade, endereco,
        solicitante_nome, solicitante_contato,
        vulnerabilidade_presente, vulnerabilidade_descricao,
        canal_entrada, descricao, encerrado_em, motivo_encerramento)
     VALUES ($1, $2, 'deslizamento', $3, 'alta',
             'Rua das Acacias, 245, Morro do Cruzeiro',
             $4, '(35) 98888-1010',
             $5, $6,
             'telefone', 'Talude com trinca aberta apos a chuva.',
             $7, $8)
     RETURNING id`,
    [
      org, protocolo,
      encerrada === null ? "em_campo" : "encerrada",
      opcoes.solicitante ?? "Joana Ferreira da Silva",
      opcoes.comVulnerabilidade ?? false,
      opcoes.comVulnerabilidade ? "Idosa acamada, dependente de oxigenio." : null,
      encerrada === null ? null : haDias(encerrada),
      encerrada === null ? null : "Risco cessado apos contencao.",
    ],
  );
  return r.rows[0]!.id;
}

async function ler(id: string) {
  const r = await mem.bruto.query<{
    protocolo: string;
    endereco: string;
    descricao: string;
    solicitante_nome: string;
    solicitante_contato: string | null;
    vulnerabilidade_presente: boolean;
    vulnerabilidade_descricao: string | null;
    solicitante_removido_em: Date | null;
    vulnerabilidade_removida_em: Date | null;
  }>("SELECT * FROM ocorrencias WHERE id = $1", [id]);
  return r.rows[0]!;
}

async function eventosDe(id: string) {
  const r = await mem.bruto.query<{
    tipo: string; autor_nome: string; autor_papel: string; autor_id: string | null;
    detalhe: { campos: string[] };
  }>(
    "SELECT * FROM trilha_eventos WHERE ocorrencia_id = $1 ORDER BY registrado_em",
    [id],
  );
  return r.rows;
}

function varrer(trava: Trava = travaDeProcesso(), teto?: number) {
  return minimizarPorPrazo({
    banco: mem.banco,
    trava,
    ...(teto === undefined ? {} : { teto }),
  });
}

beforeEach(async () => {
  mem = await bancoEmMemoria({ semear: false });
  // Trinta dias para o nome. O número é do "município": ele existe no teste
  // porque existe na coluna, e não porque o produto o conhece.
  orgComPrazo = await criarOrganizacao("Serra Alta", { solicitante: 30 });
  orgSemPrazo = await criarOrganizacao("Vale Fundo");
}, 180_000);

afterEach(async () => {
  await mem?.banco.encerrar();
});

describe("Minimização por prazo", () => {
  it("vencido o prazo, o nome e o contato saem e o ato administrativo fica", async () => {
    const id = await criarOcorrencia(orgComPrazo, "000001/2026", { encerradaHaDias: 60 });

    const resumo = await varrer();
    expect(resumo.ocorrencias).toBe(1);

    const depois = await ler(id);
    expect(depois.solicitante_nome).toBe(MARCADOR_REMOVIDO_POR_PRAZO);
    expect(depois.solicitante_contato).toBeNull();

    /*
      O que NÃO pode sair junto. O endereço é atributo do imóvel vistoriado e
      do ato praticado sobre ele; o protocolo e o relato são o registro do que
      aconteceu. Apagar isso apagaria o próprio ato administrativo, que é
      permanente e do qual o município presta contas.
    */
    expect(depois.protocolo).toBe("000001/2026");
    expect(depois.endereco).toContain("Rua das Acacias");
    expect(depois.descricao).toContain("Talude com trinca");
  }, 60_000);

  it("é marcador e não nulo, senão descarte e ausência ficam iguais", async () => {
    const id = await criarOcorrencia(orgComPrazo, "000002/2026", { encerradaHaDias: 60 });
    await varrer();

    const depois = await ler(id);
    /*
      A diferença que isto protege: `NULL` não distingue "nunca teve nome" de
      "o nome foi descartado no prazo". Numa auditoria o município precisa
      PROVAR que cumpriu a retenção, e um campo vazio não prova nada, nem
      contra a suspeita de perda de dado.
    */
    expect(depois.solicitante_nome).not.toBeNull();
    expect(depois.solicitante_nome).toBe(MARCADOR_REMOVIDO_POR_PRAZO);
    expect(depois.solicitante_removido_em).not.toBeNull();
  }, 60_000);

  it("registra a remoção na trilha da própria ocorrência, com os campos", async () => {
    const id = await criarOcorrencia(orgComPrazo, "000003/2026", {
      encerradaHaDias: 60, comVulnerabilidade: true,
    });
    await varrer();

    const eventos = await eventosDe(id);
    const minimizacao = eventos.filter((e) => e.tipo === "minimizacao_por_prazo");
    expect(
      minimizacao,
      "sem evento na trilha, minimizacao e perda de dado sao indistinguiveis",
    ).toHaveLength(1);

    expect(minimizacao[0]!.detalhe.campos).toEqual([
      "solicitante_nome", "solicitante_contato", "vulnerabilidade_descricao",
    ]);
    // Não houve sessão de ninguém: o autor é o sistema, dito por extenso, e
    // sem identificador de pessoa.
    expect(minimizacao[0]!.autor_id).toBeNull();
    expect(minimizacao[0]!.autor_nome).toMatch(/automatica/i);
  }, 60_000);

  it("a trilha diz QUE saiu, e nunca o que saía", async () => {
    const id = await criarOcorrencia(orgComPrazo, "000004/2026", {
      encerradaHaDias: 60, comVulnerabilidade: true, solicitante: "Joana Ferreira da Silva",
    });
    await varrer();

    /*
      A trilha é append-only e permanente. Se ela guardasse o valor antigo,
      seria o último lugar do banco onde o dado descartado continuaria vivo, e
      a minimização não teria minimizado nada.
    */
    const bruto = JSON.stringify(await eventosDe(id));
    expect(bruto).not.toContain("Joana");
    expect(bruto).not.toContain("98888");
    expect(bruto).not.toContain("acamada");
  }, 60_000);

  it("município sem prazo configurado não perde nada", async () => {
    const id = await criarOcorrencia(orgSemPrazo, "000001/2026", { encerradaHaDias: 3650 });

    const resumo = await varrer();
    expect(resumo.ocorrencias).toBe(0);

    const depois = await ler(id);
    expect(depois.solicitante_nome).toBe("Joana Ferreira da Silva");
    expect(depois.solicitante_removido_em).toBeNull();
  }, 60_000);

  it("ocorrência ainda aberta não é minimizada, mesmo velha", async () => {
    /*
      Enquanto o atendimento corre, o nome e o contato continuam necessários: é
      por eles que o órgão avisa a família da vistoria e da interdição. O
      relógio começa no ENCERRAMENTO.
    */
    const id = await criarOcorrencia(orgComPrazo, "000005/2026", { encerradaHaDias: null });
    const resumo = await varrer();

    expect(resumo.ocorrencias).toBe(0);
    expect((await ler(id)).solicitante_nome).toBe("Joana Ferreira da Silva");
  }, 60_000);

  it("dentro do prazo, nada sai", async () => {
    const id = await criarOcorrencia(orgComPrazo, "000006/2026", { encerradaHaDias: 5 });
    await varrer();
    expect((await ler(id)).solicitante_removido_em).toBeNull();
  }, 60_000);

  it("a descrição de vulnerabilidade sai JUNTO com o nome, sem prazo próprio", async () => {
    /*
      O município configurou só o prazo do nome. Sem o segundo ramo da
      varredura, a frase que descreve a doença de quem mora na casa ficaria no
      banco depois de o nome de quem ligou já ter sido descartado, que é o
      contrário do que minimização quer dizer.
    */
    const id = await criarOcorrencia(orgComPrazo, "000007/2026", {
      encerradaHaDias: 60, comVulnerabilidade: true,
    });
    await varrer();

    const depois = await ler(id);
    expect(depois.vulnerabilidade_descricao).toBeNull();
    expect(depois.vulnerabilidade_removida_em).not.toBeNull();
    // A MARCA de que havia vulnerabilidade fica: ela é a justificativa de
    // prioridade daquele atendimento, e sem ela a auditoria não explica por
    // que o chamado passou na frente.
    expect(depois.vulnerabilidade_presente).toBe(true);
  }, 60_000);

  it("com prazo próprio menor, a vulnerabilidade sai ANTES do nome", async () => {
    const org = await criarOrganizacao("Alto Rio", {
      solicitante: 365, vulnerabilidade: 30,
    });
    const id = await criarOcorrencia(org, "000001/2026", {
      encerradaHaDias: 60, comVulnerabilidade: true,
    });

    await varrer();

    const depois = await ler(id);
    expect(depois.vulnerabilidade_descricao).toBeNull();
    // O nome ainda está no prazo do município, então continua.
    expect(depois.solicitante_nome).toBe("Joana Ferreira da Silva");
    expect(depois.solicitante_removido_em).toBeNull();
  }, 60_000);

  it("o banco recusa prazo de vulnerabilidade maior que o do nome", async () => {
    /*
      A regra vive no banco e não só na rota: configurar noventa dias para o
      nome e cinco anos para a vulnerabilidade faria o sistema descartar o
      identificador comum e continuar guardando o dado sensível.
    */
    await expect(
      criarOrganizacao("Boca do Mato", { solicitante: 90, vulnerabilidade: 1825 }),
    ).rejects.toThrow(/vulnerabilidade_nao_sai_depois_do_nome|check/i);
  }, 60_000);

  it("o banco recusa marcador incoerente: data de remoção com nome de verdade", async () => {
    const id = await criarOcorrencia(orgComPrazo, "000008/2026", { encerradaHaDias: 60 });
    await expect(
      mem.bruto.query(
        "UPDATE ocorrencias SET solicitante_removido_em = now() WHERE id = $1",
        [id],
      ),
    ).rejects.toThrow(/marcador_de_remocao_e_coerente|check/i);
  }, 60_000);

  it("a segunda passada não remove de novo nem duplica o evento", async () => {
    const id = await criarOcorrencia(orgComPrazo, "000009/2026", { encerradaHaDias: 60 });
    await varrer();
    const segunda = await varrer();

    expect(segunda.ocorrencias).toBe(0);
    /*
      A trilha não tem policy de DELETE: um segundo evento de remoção ficaria
      lá para sempre, dizendo que o dado foi descartado duas vezes.
    */
    expect(
      (await eventosDe(id)).filter((e) => e.tipo === "minimizacao_por_prazo"),
    ).toHaveLength(1);
  }, 60_000);

  it("duas máquinas do Fly: a segunda desiste da rodada", async () => {
    await criarOcorrencia(orgComPrazo, "000010/2026", { encerradaHaDias: 60 });

    // A mesma trava, como as duas máquinas veriam a trava de aviso do banco.
    const trava = travaDeProcesso();
    const [primeira, segunda] = await Promise.all([varrer(trava), varrer(trava)]);

    const travada = primeira.travado ? primeira : segunda;
    const rodou = primeira.travado ? segunda : primeira;
    expect(travada.travado).toBe(true);
    expect(travada.ocorrencias).toBe(0);
    expect(rodou.ocorrencias).toBe(1);
  }, 60_000);

  it("o teto por rodada limita, e a rodada seguinte continua", async () => {
    for (let i = 1; i <= 4; i += 1) {
      await criarOcorrencia(orgComPrazo, `00001${i}/2026`, { encerradaHaDias: 60 + i });
    }

    const primeira = await varrer(travaDeProcesso(), 2);
    expect(primeira.ocorrencias).toBe(2);

    const segunda = await varrer(travaDeProcesso(), 2);
    expect(segunda.ocorrencias).toBe(2);

    const terceira = await varrer(travaDeProcesso(), 2);
    expect(terceira.ocorrencias).toBe(0);
  }, 60_000);

  it("não atravessa municípios: cada um segue o próprio prazo", async () => {
    const daqui = await criarOcorrencia(orgComPrazo, "000020/2026", { encerradaHaDias: 60 });
    const doVizinho = await criarOcorrencia(orgSemPrazo, "000020/2026", { encerradaHaDias: 60 });

    await varrer();

    expect((await ler(daqui)).solicitante_removido_em).not.toBeNull();
    expect((await ler(doVizinho)).solicitante_removido_em).toBeNull();
  }, 60_000);
});
