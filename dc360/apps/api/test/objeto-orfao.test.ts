import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import {
  armazenamentoEmMemoria, type ArmazenamentoEmMemoria,
} from "../src/armazenamento/memoria.js";
import {
  JANELA_DE_GRACA_DIAS, descartarOrfaos, varrerOrfaos,
} from "../src/armazenamento/orfaos.js";

/**
 * A varredura de objeto órfão.
 *
 * O QUE É UM ÓRFÃO AQUI, e a definição é a parte difícil: fotografia que subiu
 * ao armazenamento e que nenhum registro vivo do banco justifica. Ela paga
 * armazenamento para sempre e, pior que isso, é imagem do imóvel de um cidadão
 * guardada sem finalidade, que é exatamente o que a minimização da migração
 * 021 existe para impedir do outro lado da parede.
 *
 * O QUE ELA NÃO PODE SER: "objeto que não está na tabela, agora". As fotos
 * sobem ANTES do envelope da vistoria, de propósito, para o laudo nunca
 * apontar para arquivo que não existe. Existe portanto uma janela legítima em
 * que o objeto está lá e o registro ainda não fechou, e uma varredura ingênua
 * apagaria a foto da vistoria que o agente está fazendo AGORA, no morro, sem
 * sinal. Por isso a janela de graça é generosa e está escrita, e por isso a
 * varredura NÃO APAGA NADA: ela relata, e o descarte é ato deliberado.
 */

const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;

let mem: BancoEmMemoria;
let armazenamento: ArmazenamentoEmMemoria;
let orgA: string;
let orgB: string;
let ocorrenciaA: string;
let ocorrenciaB: string;

const BYTES = Buffer.from("fotografia de vistoria, fingida");

function haDias(dias: number): Date {
  return new Date(Date.now() - dias * DIA);
}

async function criarOrganizacao(nome: string): Promise<string> {
  const r = await mem.bruto.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ($1, $1, 'MG') RETURNING id",
    [nome],
  );
  return r.rows[0]!.id;
}

async function criarOcorrencia(org: string, protocolo: string): Promise<string> {
  const r = await mem.bruto.query<{ id: string }>(
    `INSERT INTO ocorrencias
       (organizacao_id, protocolo, tipo, status, endereco, solicitante_nome,
        canal_entrada, descricao)
     VALUES ($1, $2, 'deslizamento', 'em_campo', 'Rua das Acacias, 245',
             'Joana Ferreira', 'telefone', 'Talude com trinca aberta.')
     RETURNING id`,
    [org, protocolo],
  );
  return r.rows[0]!.id;
}

/** Uma linha de evidência, com a idade e o estado de envio que o caso pede. */
async function criarEvidencia(
  org: string,
  ocorrencia: string,
  nome: string,
  opcoes: { autorizadaHaDias?: number; confirmada?: boolean } = {},
): Promise<{ id: string; chave: string }> {
  const chave = `tenant/${org}/ocorrencias/${ocorrencia}/${nome}`;
  const r = await mem.bruto.query<{ id: string }>(
    `INSERT INTO evidencias
       (organizacao_id, ocorrencia_id, chave_storage, capturada_em, tipo_conteudo,
        tamanho_bytes, autorizada_em, enviada_em)
     VALUES ($1, $2, $3, now(), 'image/jpeg', $4, $5, $6)
     RETURNING id`,
    [
      org, ocorrencia, chave, BYTES.length,
      haDias(opcoes.autorizadaHaDias ?? 0),
      opcoes.confirmada ? new Date() : null,
    ],
  );
  return { id: r.rows[0]!.id, chave };
}

function guardar(chave: string, diasAtras = 0): void {
  armazenamento.guardar(chave, BYTES, "image/jpeg", haDias(diasAtras));
}

beforeEach(async () => {
  mem = await bancoEmMemoria();
  armazenamento = armazenamentoEmMemoria({ baseUrl: "http://api.local" });
  orgA = await criarOrganizacao("Serra Alta");
  orgB = await criarOrganizacao("Vale Fundo");
  ocorrenciaA = await criarOcorrencia(orgA, "000001/2026");
  ocorrenciaB = await criarOcorrencia(orgB, "000001/2026");
}, 180_000);

afterEach(async () => {
  await mem?.banco.encerrar();
});

describe("O que a varredura reconhece, e o que ela deixa em paz", () => {
  it("foto confirmada e em uso não é candidata", async () => {
    const { chave } = await criarEvidencia(orgA, ocorrenciaA, "boa.jpg", { confirmada: true });
    guardar(chave, 400);

    const resumo = await varrerOrfaos({ banco: mem.banco, armazenamento, municipios: [orgA, orgB] });

    expect(resumo.objetos).toBe(1);
    expect(resumo.candidatos).toBe(0);
  }, 120_000);

  it("envio não confirmado DENTRO da janela de graça não é candidato", async () => {
    /*
      Este é o caso que uma varredura ingênua destrói: o agente subiu a foto no
      morro, o sinal caiu antes da confirmação, e a coleta está guardada no
      aparelho esperando rede. Tudo aqui está certo, e o objeto vai ser usado.
    */
    const { chave } = await criarEvidencia(orgA, ocorrenciaA, "subindo.jpg", {
      autorizadaHaDias: JANELA_DE_GRACA_DIAS - 1,
    });
    guardar(chave, JANELA_DE_GRACA_DIAS - 1);

    const resumo = await varrerOrfaos({ banco: mem.banco, armazenamento, municipios: [orgA, orgB] });

    expect(resumo.candidatos).toBe(0);
  }, 120_000);

  it("envio não confirmado FORA da janela vira candidato, e a espécie diz qual é", async () => {
    const { chave } = await criarEvidencia(orgA, ocorrenciaA, "abandonada.jpg", {
      autorizadaHaDias: JANELA_DE_GRACA_DIAS + 5,
    });
    guardar(chave, JANELA_DE_GRACA_DIAS + 5);

    const resumo = await varrerOrfaos({ banco: mem.banco, armazenamento, municipios: [orgA, orgB] });

    expect(resumo.candidatos).toBe(1);

    const linhas = await mem.banco.comTenant(orgA, async (c) =>
      (await c.query<{ chave: string; especie: string }>(
        "SELECT chave, especie FROM objetos_orfaos",
      )).rows);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.chave).toBe(chave);
    expect(linhas[0]!.especie).toBe("envio_nunca_confirmado");
  }, 120_000);

  it("objeto sem linha nenhuma vira candidato de outra espécie", async () => {
    guardar(
      `tenant/${orgA}/ocorrencias/${ocorrenciaA}/ninguem-sabe.jpg`,
      JANELA_DE_GRACA_DIAS + 10,
    );

    const resumo = await varrerOrfaos({ banco: mem.banco, armazenamento, municipios: [orgA, orgB] });

    expect(resumo.candidatos).toBe(1);
    const linhas = await mem.banco.comTenant(orgA, async (c) =>
      (await c.query<{ especie: string }>("SELECT especie FROM objetos_orfaos")).rows);
    expect(linhas[0]!.especie).toBe("objeto_sem_linha");
  }, 120_000);

  it("chave que não nomeia município nenhum é relatada e NUNCA descartada", async () => {
    /*
      Só dá para dizer que um objeto é órfão comparando com as linhas do
      município dono dele, e o município sai do prefixo da chave. Chave que não
      tem esse prefixo, ou que nomeia organização inexistente, é um objeto que
      NÃO SABEMOS atribuir: declará-lo órfão seria afirmar o que ninguém
      verificou, e o desfecho disso é apagar prova.
    */
    guardar("solto/sem-prefixo-de-tenant.jpg", 400);
    guardar(`tenant/${crypto.randomUUID()}/ocorrencias/x/de-municipio-que-nao-existe.jpg`, 400);

    const resumo = await varrerOrfaos({ banco: mem.banco, armazenamento, municipios: [orgA, orgB] });

    expect(resumo.candidatos).toBe(0);
    expect(resumo.naoAtribuidos).toHaveLength(2);
  }, 120_000);

  it("a varredura não mistura municípios", async () => {
    // A mesma chave, com prefixo de A, mas a linha existe em B. Uma varredura
    // que consultasse sem contexto de tenant declararia o objeto em uso.
    await criarEvidencia(orgB, ocorrenciaB, "vizinha.jpg", { confirmada: true });
    guardar(`tenant/${orgA}/ocorrencias/${ocorrenciaA}/vizinha.jpg`, 400);

    const resumo = await varrerOrfaos({ banco: mem.banco, armazenamento, municipios: [orgA, orgB] });

    expect(resumo.candidatos).toBe(1);
  }, 120_000);
});

describe("A varredura não apaga nada", () => {
  it("depois de varrer, o objeto continua no armazenamento", async () => {
    const chave = `tenant/${orgA}/ocorrencias/${ocorrenciaA}/intocada.jpg`;
    guardar(chave, 400);

    await varrerOrfaos({ banco: mem.banco, armazenamento, municipios: [orgA, orgB] });

    expect(armazenamento.ler(chave)).not.toBeNull();
    expect(armazenamento.quantidade()).toBe(1);
  }, 120_000);
});

describe("O descarte é ato deliberado, e confere de novo antes de apagar", () => {
  it("apaga o que a varredura listou, e registra quem decidiu", async () => {
    const chave = `tenant/${orgA}/ocorrencias/${ocorrenciaA}/para-descartar.jpg`;
    guardar(chave, 400);
    const varredura = await varrerOrfaos({ banco: mem.banco, armazenamento, municipios: [orgA, orgB] });

    const desfecho = await descartarOrfaos({
      banco: mem.banco,
      armazenamento,
      varreduraId: varredura.varreduraId,
      municipios: [orgA, orgB],
      operador: "Fulana, operação da plataforma",
      motivo: "Conferido com o município: nenhuma vistoria referencia estes arquivos.",
    });

    expect(desfecho.apagados).toBe(1);
    expect(armazenamento.ler(chave)).toBeNull();

    const linha = await mem.banco.comTenant(orgA, async (c) =>
      (await c.query<{ decisao: string; decidido_por: string; decidido_em: string }>(
        "SELECT decisao, decidido_por, decidido_em FROM objetos_orfaos",
      )).rows[0]!);
    expect(linha.decisao).toBe("descartado");
    expect(linha.decidido_por).toBe("Fulana, operação da plataforma");
    expect(linha.decidido_em).toBeTruthy();
  }, 120_000);

  it("se a linha apareceu entre a varredura e o descarte, o objeto NÃO é apagado", async () => {
    /*
      A janela entre listar e decidir é de dias ou semanas: alguém lê o
      relatório, conversa com o município, e só então autoriza. Nesse intervalo
      a coleta que estava presa num aparelho pode ter drenado, e aí o objeto
      que constava como órfão passou a ser a prova de um ato. Apagar pela lista
      antiga destruiria exatamente a fotografia que acabou de ser usada.
    */
    const chave = `tenant/${orgA}/ocorrencias/${ocorrenciaA}/voltou-a-vida.jpg`;
    guardar(chave, 400);
    const varredura = await varrerOrfaos({ banco: mem.banco, armazenamento, municipios: [orgA, orgB] });
    expect(varredura.candidatos).toBe(1);

    await mem.bruto.query(
      `INSERT INTO evidencias
         (organizacao_id, ocorrencia_id, chave_storage, capturada_em, tipo_conteudo,
          tamanho_bytes, enviada_em)
       VALUES ($1, $2, $3, now(), 'image/jpeg', $4, now())`,
      [orgA, ocorrenciaA, chave, BYTES.length],
    );

    const desfecho = await descartarOrfaos({
      banco: mem.banco,
      armazenamento,
      varreduraId: varredura.varreduraId,
      municipios: [orgA, orgB],
      operador: "Fulana, operação da plataforma",
      motivo: "Lista aprovada pelo município.",
    });

    expect(desfecho.apagados).toBe(0);
    expect(desfecho.mantidos).toBe(1);
    expect(armazenamento.ler(chave), "apagou uma foto que voltou a ser referida")
      .not.toBeNull();
  }, 120_000);

  it("descarte de uma varredura não alcança candidato de outra", async () => {
    guardar(`tenant/${orgA}/ocorrencias/${ocorrenciaA}/primeira.jpg`, 400);
    const primeira = await varrerOrfaos({ banco: mem.banco, armazenamento, municipios: [orgA, orgB] });

    guardar(`tenant/${orgA}/ocorrencias/${ocorrenciaA}/segunda.jpg`, 400);
    await varrerOrfaos({ banco: mem.banco, armazenamento, municipios: [orgA, orgB] });

    const desfecho = await descartarOrfaos({
      banco: mem.banco,
      armazenamento,
      varreduraId: primeira.varreduraId,
      municipios: [orgA, orgB],
      operador: "Fulana, operação da plataforma",
      motivo: "Só a primeira lista foi conferida.",
    });

    expect(desfecho.apagados).toBe(1);
    expect(armazenamento.quantidade()).toBe(1);
  }, 120_000);
});

describe("A reserva que nunca virou byte", () => {
  it("autorização velha sem objeto é marcada abandonada e para de consumir o teto", async () => {
    /*
      O outro lado do órfão, e ele não custa armazenamento: a linha que
      autorizou um envio que nunca aconteceu. Ela não é lixo no balde, é RESERVA
      no teto: `tamanho_bytes` já foi declarado e já conta. Sem esta parte, um
      município que perdeu cem envios por sinal ruim ficaria devendo cem fotos
      que não existem.

      Marcar não é apagar: a linha continua lá, com o motivo, e a autorização
      pode ressuscitar se o mesmo envio for retomado.
    */
    await criarEvidencia(orgA, ocorrenciaA, "nunca-subiu.jpg", {
      autorizadaHaDias: JANELA_DE_GRACA_DIAS + 3,
    });

    const antes = await mem.banco.comTenant(orgA, async (c) =>
      (await c.query<{ n: string }>(
        "SELECT coalesce(sum(tamanho_bytes),0)::text AS n FROM evidencias WHERE abandonada_em IS NULL",
      )).rows[0]!.n);
    expect(Number(antes)).toBe(BYTES.length);

    const resumo = await varrerOrfaos({ banco: mem.banco, armazenamento, municipios: [orgA, orgB] });

    expect(resumo.reservasAbandonadas).toBe(1);

    const depois = await mem.banco.comTenant(orgA, async (c) =>
      (await c.query<{ n: string }>(
        "SELECT coalesce(sum(tamanho_bytes),0)::text AS n FROM evidencias WHERE abandonada_em IS NULL",
      )).rows[0]!.n);
    expect(Number(depois)).toBe(0);

    const viva = await mem.banco.comTenant(orgA, async (c) =>
      (await c.query<{ n: string }>("SELECT count(*)::text AS n FROM evidencias")).rows[0]!.n);
    expect(Number(viva), "a linha foi APAGADA em vez de marcada").toBe(1);
  }, 120_000);

  it("reserva recente não é tocada", async () => {
    await criarEvidencia(orgA, ocorrenciaA, "ainda-subindo.jpg", { autorizadaHaDias: 1 });

    const resumo = await varrerOrfaos({ banco: mem.banco, armazenamento, municipios: [orgA, orgB] });

    expect(resumo.reservasAbandonadas).toBe(0);
  }, 120_000);
});

describe("Sem a lista de municípios, que é como a API roda", () => {
  it("o dono sai do prefixo da chave e é confirmado no banco", async () => {
    /*
      Este caminho existe para a varredura poder rodar sozinha sem NENHUM
      privilégio novo. Enumerar município exigiria ler `organizacoes` fora de
      contexto de tenant, o que só uma função `SECURITY DEFINER` faria, e o
      orçamento delas está em quinze de quinze com o portão CA-06 reprovando a
      décima sexta.

      A confirmação acontece debaixo do RLS: dentro do contexto do município,
      `organizacoes` devolve a linha dele e mais nada.
    */
    guardar(`tenant/${orgA}/ocorrencias/${ocorrenciaA}/sem-lista.jpg`, 400);
    guardar(`tenant/${crypto.randomUUID()}/ocorrencias/x/fantasma.jpg`, 400);

    const resumo = await varrerOrfaos({ banco: mem.banco, armazenamento });

    expect(resumo.candidatos).toBe(1);
    expect(resumo.naoAtribuidos).toHaveLength(1);
    expect(resumo.municipios).toEqual([orgA]);
  }, 120_000);

  it("sem a lista, a reserva de um município sem objeto nenhum não é alcançada", async () => {
    /*
      O limite deste caminho, escrito em vez de descoberto depois. Município que
      nunca teve um objeto chegar não aparece em prefixo nenhum, então a rodada
      não entra nele e as reservas velhas dele continuam segurando teto.

      Quem alcança esse caso é o comando do operador, que traz a lista completa
      porque tem a credencial de dono. O custo de o caminho automático não
      alcançar é teto ocupado por reserva num município que nunca enviou foto
      nenhuma, e esse município não tem teto ocupado por nada mais.
    */
    await criarEvidencia(orgB, ocorrenciaB, "so-reserva.jpg", {
      autorizadaHaDias: JANELA_DE_GRACA_DIAS + 3,
    });

    const semLista = await varrerOrfaos({ banco: mem.banco, armazenamento });
    expect(semLista.reservasAbandonadas).toBe(0);

    const comLista = await varrerOrfaos({
      banco: mem.banco, armazenamento, municipios: [orgA, orgB],
    });
    expect(comLista.reservasAbandonadas).toBe(1);
  }, 120_000);
});

describe("O descarte fecha a conta do teto", () => {
  it("a linha da autorização é encerrada com motivo, e não apagada", async () => {
    /*
      Se a linha ficasse viva depois de o arquivo ser apagado, ela mentiria duas
      vezes: continuaria consumindo o teto por bytes que não existem mais, e
      continuaria sendo uma reserva capaz de ser retomada para um objeto que não
      está lá.
    */
    const { chave } = await criarEvidencia(orgA, ocorrenciaA, "descartada.jpg", {
      autorizadaHaDias: JANELA_DE_GRACA_DIAS + 5,
    });
    guardar(chave, JANELA_DE_GRACA_DIAS + 5);

    const varredura = await varrerOrfaos({
      banco: mem.banco, armazenamento, municipios: [orgA, orgB],
    });
    await descartarOrfaos({
      banco: mem.banco,
      armazenamento,
      varreduraId: varredura.varreduraId,
      municipios: [orgA, orgB],
      operador: "Fulana, operação da plataforma",
      motivo: "Lista conferida com o município.",
    });

    const linha = await mem.banco.comTenant(orgA, async (c) =>
      (await c.query<{ abandonada_em: string | null; abandono_motivo: string | null }>(
        "SELECT abandonada_em, abandono_motivo FROM evidencias WHERE chave_storage = $1",
        [chave],
      )).rows[0]!);

    expect(linha.abandonada_em, "a linha continua consumindo o teto").not.toBeNull();
    expect(linha.abandono_motivo).toContain("Fulana");

    const conta = await mem.banco.comTenant(orgA, async (c) =>
      (await c.query<{ n: string }>(
        "SELECT bytes_usados::text AS n FROM situacao_de_armazenamento(0)",
      )).rows[0]!.n);
    expect(Number(conta)).toBe(0);
  }, 120_000);
});

describe("A foto de perfil (migracao 040) tem dono, e a varredura sabe disso", () => {
  /**
   * O ACHADO (revisao de 15/09/2026): a varredura so conhecia `evidencias`.
   * Passados trinta dias, TODA foto de perfil virava candidata
   * `objeto_sem_linha`, e um descarte autorizado sobre essa lista apagaria o
   * rosto de cada agente do municipio, com a chave ainda gravada em
   * `usuarios.foto_chave` apontando para um objeto que nao existe mais.
   *
   * A linha justificadora da foto e `usuarios.foto_chave`, e ela e conferida
   * dentro do mesmo `comTenant`, debaixo do RLS: a foto de um municipio so e
   * justificada por um usuario DO MESMO municipio.
   */
  async function criarAgenteComFoto(org: string, nome: string, matricula: string): Promise<{ id: string; chave: string }> {
    const r = await mem.bruto.query<{ id: string }>(
      `INSERT INTO usuarios (organizacao_id, nome, matricula, email, papel)
       VALUES ($1, $2, $3, $4, 'agente_campo') RETURNING id`,
      [org, nome, matricula, `${matricula.toLowerCase()}@exemplo.gov.br`],
    );
    const id = r.rows[0]!.id;
    const chave = `tenant/${org}/usuarios/${id}/foto-atual.jpg`;
    await mem.bruto.query("UPDATE usuarios SET foto_chave = $2 WHERE id = $1", [id, chave]);
    return { id, chave };
  }

  it("a foto de perfil viva NUNCA e candidata, por mais velha que seja", async () => {
    const { chave } = await criarAgenteComFoto(orgA, "Diego Nakamura Alves", "SA-0451");
    guardar(chave, 400);

    const resumo = await varrerOrfaos({ banco: mem.banco, armazenamento, municipios: [orgA, orgB] });

    expect(resumo.objetos).toBe(1);
    expect(resumo.candidatos, "a foto de perfil foi listada como orfa").toBe(0);
    expect(resumo.naoAtribuidos).toEqual([]);
    const listados = await mem.banco.comTenant(orgA, (c) => c.query("SELECT chave FROM objetos_orfaos"));
    expect(listados.rows).toEqual([]);
  }, 120_000);

  it("a foto de perfil de OUTRO municipio nao justifica a chave: o dono e quem esta no prefixo", async () => {
    /*
      Uma chave sob o prefixo de A que a linha de um usuario de B afirmasse ser
      dela. O CHECK da 040 impede isso no banco; aqui o caso e conferido pelo
      lado da varredura, que consulta `usuarios` dentro do contexto de A e por
      isso nao enxerga B.
    */
    const chaveEmA = `tenant/${orgA}/usuarios/00000000-0000-4000-8000-000000000001/foto-sem-dono.jpg`;
    guardar(chaveEmA, 400);
    const resumo = await varrerOrfaos({ banco: mem.banco, armazenamento, municipios: [orgA, orgB] });
    expect(resumo.candidatos).toBe(1);
    const linha = await mem.banco.comTenant(orgA, (c) =>
      c.query<{ especie: string }>("SELECT especie FROM objetos_orfaos WHERE chave = $1", [chaveEmA]));
    expect(linha.rows[0]?.especie).toBe("objeto_sem_linha");
  }, 120_000);

  it("a foto ANTERIOR, cujo apagamento falhou na troca, continua sendo orfa de verdade", async () => {
    /*
      A rota de troca apaga a anterior fora da transacao, e se o apagamento
      falhar o objeto sobra: e exatamente o que a varredura existe para achar.
      Sem este caso, a correcao poderia ter ido longe demais e isentado o
      prefixo `usuarios/` inteiro.
    */
    const agente = await criarAgenteComFoto(orgA, "Marina Costa", "SA-7001");
    guardar(agente.chave, 400);
    const anterior = `tenant/${orgA}/usuarios/${agente.id}/foto-anterior.jpg`;
    guardar(anterior, 400);

    const resumo = await varrerOrfaos({ banco: mem.banco, armazenamento, municipios: [orgA, orgB] });

    expect(resumo.objetos).toBe(2);
    expect(resumo.candidatos).toBe(1);
    const listados = await mem.banco.comTenant(orgA, (c) =>
      c.query<{ chave: string; especie: string }>("SELECT chave, especie FROM objetos_orfaos"));
    expect(listados.rows).toEqual([{ chave: anterior, especie: "objeto_sem_linha" }]);
  }, 120_000);

  it("no descarte, a foto que virou perfil entre a varredura e a decisao e MANTIDA", async () => {
    const agente = await criarAgenteComFoto(orgA, "Rita Lopes", "SA-0001");
    const chave = `tenant/${orgA}/usuarios/${agente.id}/foto-nova.jpg`;
    guardar(chave, 400);
    const varredura = await varrerOrfaos({ banco: mem.banco, armazenamento, municipios: [orgA, orgB] });
    expect(varredura.candidatos).toBe(1);

    // A pessoa trocou de foto para exatamente esta chave no intervalo.
    await mem.bruto.query("UPDATE usuarios SET foto_chave = $2 WHERE id = $1", [agente.id, chave]);

    const desfecho = await descartarOrfaos({
      banco: mem.banco,
      armazenamento,
      varreduraId: varredura.varreduraId,
      municipios: [orgA, orgB],
      operador: "Fulana, operação da plataforma",
      motivo: "Lista aprovada pelo município.",
    });

    expect(desfecho.apagados).toBe(0);
    expect(desfecho.mantidos).toBe(1);
    expect(armazenamento.ler(chave), "apagou a foto de perfil de um agente").not.toBeNull();
  }, 120_000);
});
