/**
 * O TETO DE SEIS CASAS DECIMAIS, cobrado pelo BANCO e não só pelo esquema.
 *
 * Ele existia em dois lugares e nenhum deles era o contrato: o painel
 * arredondava o texto colado, e o esquema da correção de coordenada arredondava
 * a si mesmo. Toda outra porta gravava o que viesse, e o caminho do aparelho é
 * justamente o que devolve os quinze dígitos do `Number`, porque o GPS do
 * celular entrega `-22.410382999999987`. A MESMA COLUNA guardava seis casas
 * quando o dado vinha do painel e quinze quando vinha do morro, e as duas telas
 * mostravam aparências de precisão diferentes para o mesmo tipo de dado, o que
 * sugere ao leitor que uma das duas foi medida melhor.
 *
 * Seis casas são cerca de dez centímetros, mais fino do que qualquer GPS de
 * celular acerta debaixo de chuva. Os dígitos seguintes são resto binário, e
 * imprimi-los num laudo com brasão convida quem lê a confiar em dígito que nunca
 * mediu nada.
 *
 * Este arquivo existe porque a regra no Zod não alcança quem não passa pelo Zod.
 * A migração 021 já ensinou isso uma vez neste produto: validação que só mora na
 * aplicação é validação que a próxima rota esquece, e aqui a próxima rota é a de
 * um recurso que ninguém escreveu ainda.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const aqui = dirname(fileURLToPath(import.meta.url));
const pastaDeMigracoes = join(aqui, "..", "migrations");
const migracoes = readdirSync(pastaDeMigracoes)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(pastaDeMigracoes, f), "utf8"));

/** O que o GPS de um celular devolve de verdade. */
const CRUA = -22.410382999999987;
const SEIS = -22.410383;

let db: PGlite;
let orgId = "";
let ocorrenciaId = "";
let vistoriaId = "";

beforeAll(async () => {
  db = new PGlite();
  for (const migracao of migracoes) await db.exec(migracao);

  const org = await db.query<{ id: string }>(
    "INSERT INTO organizacoes (nome, municipio, uf) VALUES ('Coordenadoria','Serra Alta','MG') RETURNING id",
  );
  orgId = org.rows[0]!.id;

  const oc = await db.query<{ id: string }>(
    `INSERT INTO ocorrencias
       (organizacao_id, protocolo, tipo, status, endereco, solicitante_nome,
        canal_entrada, descricao)
     VALUES ($1,'000001/2026','deslizamento','registrada','Rua das Acácias, 100',
             'Joana','telefone','Trinca nova depois da chuva.')
     RETURNING id`,
    [orgId],
  );
  ocorrenciaId = oc.rows[0]!.id;

  const v = await db.query<{ id: string }>(
    `INSERT INTO vistorias
       (organizacao_id, ocorrencia_id, checklist, assinante_nome, coletada_em, idempotency_key)
     VALUES ($1,$2,'[]'::jsonb,'Marilda', now(), gen_random_uuid())
     RETURNING id`,
    [orgId, ocorrenciaId],
  );
  vistoriaId = v.rows[0]!.id;
}, 120_000);

afterAll(async () => { await db.close(); });

async function recusa(sql: string, valores: unknown[]): Promise<string> {
  try {
    await db.query(sql, valores);
  } catch (erro) {
    return String((erro as Error).message);
  }
  throw new Error("o banco ACEITOU quinze casas decimais, e ele não pode");
}

describe("Nenhuma porta grava mais de seis casas decimais", () => {
  it("a ocorrência recusa, e é por CHECK e não por condição em TypeScript", async () => {
    const msg = await recusa(
      "UPDATE ocorrencias SET latitude = $1, longitude = $2 WHERE id = $3",
      [CRUA, -45.5, ocorrenciaId],
    );
    expect(msg).toContain("ocorrencia_coordenada_em_seis_casas");
  });

  it("a evidência recusa: é por aqui que o GPS do aparelho entrava", async () => {
    /*
      A foto carrega a coordenada do momento da captura, vinda direto do
      aparelho. Era a porta mais movimentada e a que nunca teve teto nenhum.
    */
    const msg = await recusa(
      `INSERT INTO evidencias
         (organizacao_id, ocorrencia_id, vistoria_id, chave_storage, latitude, longitude, capturada_em)
       VALUES ($1,$2,$3,$4,$5,$6, now())`,
      [orgId, ocorrenciaId, vistoriaId, `tenant/${orgId}/ocorrencias/x/f.jpg`, CRUA, -45.5],
    );
    expect(msg).toContain("evidencia_coordenada_em_seis_casas");
  });

  it("a vistoria recusa, e a coluna nasceu junto com a restrição", async () => {
    const msg = await recusa(
      "UPDATE vistorias SET latitude = $1, longitude = $2 WHERE id = $3",
      [CRUA, -45.5, vistoriaId],
    );
    expect(msg).toContain("vistoria_coordenada_em_seis_casas");
  });

  it("seis casas passam, e nulo passa", async () => {
    /*
      A âncora. Sem ela, uma restrição escrita errado (que recusasse TODO valor)
      deixaria os três casos acima verdes e o produto incapaz de gravar
      coordenada nenhuma, que é um desfecho pior do que o defeito original.
    */
    await db.query(
      "UPDATE ocorrencias SET latitude = $1, longitude = $2 WHERE id = $3",
      [SEIS, -45.456789, ocorrenciaId],
    );
    await db.query(
      "UPDATE vistorias SET latitude = $1, longitude = $2 WHERE id = $3",
      [SEIS, -45.456789, vistoriaId],
    );
    await db.query(
      "UPDATE ocorrencias SET latitude = NULL, longitude = NULL WHERE id = $1",
      [ocorrenciaId],
    );
    const r = await db.query<{ latitude: number | null }>(
      "SELECT latitude FROM vistorias WHERE id = $1", [vistoriaId],
    );
    expect(r.rows[0]!.latitude).toBe(SEIS);
  });

  it("meia coordenada não entra: latitude sem longitude não desenha nada", async () => {
    /*
      Não é preciosismo de tipo. Meio ponto não aparece no mapa e não diz nada no
      laudo, e permitir que ele exista deixaria uma rota gravar metade sem
      ninguém perceber até alguém procurar o pino que nunca apareceu.
    */
    const msg = await recusa(
      "UPDATE vistorias SET latitude = $1, longitude = NULL WHERE id = $2",
      [SEIS, vistoriaId],
    );
    expect(msg).toContain("vistoria_coordenada_inteira");
  });

  it("latitude fora da faixa não entra: 190 graus não é um ponto, é erro de digitação", async () => {
    const msg = await recusa(
      "UPDATE vistorias SET latitude = $1, longitude = $2 WHERE id = $3",
      [190, -45.456789, vistoriaId],
    );
    expect(msg).toContain("vistoria_coordenada_na_faixa");
  });
});

describe("A declaração de prova perdida é append-only, como a trilha", () => {
  it("o papel de aplicação pode inserir e ler, e não pode apagar nem reescrever", async () => {
    /*
      Mesma razão dos órgãos indicados e da trilha: isto é coleta de campo e é
      uma declaração de prova ausente num documento oficial. Se ela estiver
      errada, o caminho é vistoria nova, que é como este produto já trata toda
      correção de coleta. Quem recusa é o Postgres, e não um `if` na rota.
    */
    const privilegios = await db.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE table_name = 'vistoria_evidencias_perdidas' AND grantee = 'dc360_app'
        ORDER BY privilege_type`,
    );
    expect(privilegios.rows.map((p) => p.privilege_type).sort())
      .toEqual(["INSERT", "SELECT"]);
  });

  it("a mesma perda não entra duas vezes na mesma vistoria", async () => {
    /*
      O reenvio é rotina: o aparelho desiste por tempo esgotado e repete. Sem a
      unicidade, o laudo declararia a mesma fotografia perdida duas vezes e a
      contagem de prova ausente do município contaria em dobro.
    */
    const inserir = () => db.query(
      `INSERT INTO vistoria_evidencias_perdidas
         (organizacao_id, vistoria_id, idempotency_key, papel, capturada_em)
       VALUES ($1,$2,'foto-a','foto', now())`,
      [orgId, vistoriaId],
    );
    await inserir();
    await expect(inserir()).rejects.toThrow(/perda_uma_vez_por_vistoria/);
  });

  it("papel fora do catálogo não entra", async () => {
    await expect(db.query(
      `INSERT INTO vistoria_evidencias_perdidas
         (organizacao_id, vistoria_id, idempotency_key, papel, capturada_em)
       VALUES ($1,$2,'foto-z','croqui', now())`,
      [orgId, vistoriaId],
    )).rejects.toThrow(/papel/);
  });
});
