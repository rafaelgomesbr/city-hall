import { inflateRawSync } from "node:zlib";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bancoEmMemoria, type BancoEmMemoria } from "../src/banco/memoria.js";
import { carregarConfig } from "../src/config.js";
import { construirServidor } from "../src/servidor.js";
import { armazenamentoEmMemoria, type ArmazenamentoEmMemoria } from "../src/armazenamento/memoria.js";
import { fluxoZip } from "../src/saida/zip.js";
import { TABELAS_DA_SAIDA, TABELAS_QUE_NAO_SAEM } from "../src/saida/pacote.js";

/**
 * Saída de município.
 *
 * O documento `docs/SAIDA-DE-MUNICIPIO.md` prometia, na seção 4, uma ferramenta
 * que não existia: a extração saía à mão, por quem tinha acesso ao servidor, e
 * levava dias. Um município que não consegue sair não escolheu ficar, ficou
 * preso, e esse é o argumento que o concorrente usa na primeira pergunta
 * difícil de um secretário.
 *
 * O que este arquivo tranca, e cada item é uma forma diferente de a entrega
 * parecer completa sem ser:
 *
 *   - o pacote sai com TODAS as tabelas, e tabela nova de migração futura
 *     obriga alguém a decidir se ela sai ou não;
 *   - senha, token e ficha de notificação NÃO saem;
 *   - fotografia e assinatura saem como arquivo, e o laudo aponta para eles
 *     por caminho relativo, então abre daqui a dez anos sem servidor;
 *   - existe índice, e o número de linha que ele dá bate com o CSV de verdade;
 *   - arquivo que o banco promete e o armazenamento não tem vira pendência
 *     escrita, em vez de sumir;
 *   - o município do lado não aparece no pacote;
 *   - é ato de administrador, deixa trilha, e não apaga nada.
 */

const SENHA = "defesa-civil-2026";
const ORG_SERRA_ALTA = "11111111-1111-4111-8111-000000000001";
const OCORRENCIA_C3 = "11111111-1111-4111-8111-0000000000c3";
const OCORRENCIA_C4 = "11111111-1111-4111-8111-0000000000c4";
const VISTORIA_F1 = "11111111-1111-4111-8111-0000000000f1";
const COORDENADORA = "11111111-1111-4111-8111-0000000000d1";
const ORGAO = "11111111-1111-4111-8111-0000000000b1";
const PROVIDENCIA = "11111111-1111-4111-8111-0000000000b2";

const CHAVE_FOTO = `tenant/${ORG_SERRA_ALTA}/ocorrencias/${OCORRENCIA_C3}/talude-fundos.jpg`;
const CHAVE_ASSINATURA = `tenant/${ORG_SERRA_ALTA}/ocorrencias/${OCORRENCIA_C3}/assinatura-f1.png`;
const CHAVE_SUMIDA = `tenant/${ORG_SERRA_ALTA}/ocorrencias/${OCORRENCIA_C3}/foto-que-sumiu.jpg`;
/** A foto de perfil da coordenadora (migração 040): dado pessoal DELA, e sai com o município. */
const CHAVE_FOTO_DA_COORDENADORA = `tenant/${ORG_SERRA_ALTA}/usuarios/${COORDENADORA}/foto-abc.jpg`;

const BYTES_DA_FOTO = Buffer.from("conteudo-fingido-de-fotografia-de-vistoria", "utf8");
const BYTES_DA_ASSINATURA = Buffer.from("traco-fingido-de-assinatura", "utf8");
const BYTES_DA_FOTO_DA_COORDENADORA = Buffer.from("retrato-fingido-da-coordenadora", "utf8");

let mem: BancoEmMemoria;
let app: FastifyInstance;
let armazenamento: ArmazenamentoEmMemoria;
let tokenAdministradora: string;
let tokenCoordenadora: string;
let tokenOperador: string;
let tokenDeFora: string;

/* ==========================================================================
   Leitor de ZIP, escrito aqui de propósito.

   O produto escreve o pacote sem biblioteca (ver `src/saida/zip.ts`, e o porquê
   está lá). Conferir o resultado com a mesma função que o escreveu não provaria
   nada: um erro de deslocamento passaria despercebido nos dois lados. Este
   leitor parte do diretório central, que é como todo descompactador de verdade
   lê um ZIP, e não da ordem em que os bytes foram escritos.
   ========================================================================== */

function lerZip(bytes: Buffer): Map<string, Buffer> {
  let fim = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (bytes.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) throw new Error("não é um ZIP: fim do diretório central não encontrado");

  let total = bytes.readUInt16LE(fim + 10);
  let inicioDoDiretorio = bytes.readUInt32LE(fim + 16);

  // ZIP64: o localizador fica nos 20 bytes imediatamente antes do fim clássico.
  if (total === 0xffff || inicioDoDiretorio === 0xffffffff) {
    const localizador = fim - 20;
    if (bytes.readUInt32LE(localizador) !== 0x07064b50) {
      throw new Error("ZIP64 anunciado e localizador ausente");
    }
    const fim64 = Number(bytes.readBigUInt64LE(localizador + 8));
    if (bytes.readUInt32LE(fim64) !== 0x06064b50) {
      throw new Error("ZIP64: fim do diretório central não encontrado");
    }
    total = Number(bytes.readBigUInt64LE(fim64 + 32));
    inicioDoDiretorio = Number(bytes.readBigUInt64LE(fim64 + 48));
  }

  const arquivos = new Map<string, Buffer>();
  let p = inicioDoDiretorio;

  for (let n = 0; n < total; n += 1) {
    if (bytes.readUInt32LE(p) !== 0x02014b50) throw new Error("entrada central inválida");
    const metodo = bytes.readUInt16LE(p + 10);
    let comprimido = bytes.readUInt32LE(p + 20);
    let original = bytes.readUInt32LE(p + 24);
    const tamanhoNome = bytes.readUInt16LE(p + 28);
    const tamanhoExtra = bytes.readUInt16LE(p + 30);
    const tamanhoComentario = bytes.readUInt16LE(p + 32);
    let deslocamento = bytes.readUInt32LE(p + 42);
    const nome = bytes.subarray(p + 46, p + 46 + tamanhoNome).toString("utf8");

    if (original === 0xffffffff || comprimido === 0xffffffff || deslocamento === 0xffffffff) {
      const extra = bytes.subarray(p + 46 + tamanhoNome, p + 46 + tamanhoNome + tamanhoExtra);
      let q = 0;
      while (q + 4 <= extra.length) {
        const id = extra.readUInt16LE(q);
        const tam = extra.readUInt16LE(q + 2);
        if (id === 0x0001) {
          let r = q + 4;
          if (original === 0xffffffff) { original = Number(extra.readBigUInt64LE(r)); r += 8; }
          if (comprimido === 0xffffffff) { comprimido = Number(extra.readBigUInt64LE(r)); r += 8; }
          if (deslocamento === 0xffffffff) { deslocamento = Number(extra.readBigUInt64LE(r)); }
          break;
        }
        q += 4 + tam;
      }
    }

    const nomeLocal = bytes.readUInt16LE(deslocamento + 26);
    const extraLocal = bytes.readUInt16LE(deslocamento + 28);
    const inicio = deslocamento + 30 + nomeLocal + extraLocal;
    const cru = bytes.subarray(inicio, inicio + comprimido);
    const conteudo = metodo === 8 ? inflateRawSync(cru) : Buffer.from(cru);
    if (conteudo.length !== original) {
      throw new Error(`tamanho divergente em ${nome}: ${conteudo.length} != ${original}`);
    }
    arquivos.set(nome, conteudo);

    p += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
  }

  return arquivos;
}

async function entrar(email: string): Promise<string> {
  const r = await app.inject({
    method: "POST", url: "/auth/entrar", payload: { email, senha: SENHA },
  });
  if (r.statusCode !== 200) throw new Error(`login falhou: ${r.body}`);
  return r.json().acesso;
}

const com = (t: string) => ({ authorization: `Bearer ${t}` });

async function baixarPacote(token: string): Promise<Map<string, Buffer>> {
  const r = await app.inject({
    method: "POST", url: "/saida/pacote.zip", headers: com(token),
  });
  expect(r.statusCode).toBe(200);
  expect(r.headers["content-type"]).toContain("application/zip");
  return lerZip(r.rawPayload);
}

beforeAll(async () => {
  mem = await bancoEmMemoria({ semear: true });

  /*
    A semente não tem evidência nenhuma, e sem arquivo o pacote não prova o que
    precisa provar. Estes três casos são deliberados:

      - uma fotografia com bytes no armazenamento (o caminho feliz);
      - uma assinatura com bytes (o traço que o laudo referencia);
      - uma fotografia que o BANCO promete e o armazenamento NÃO tem, que é o
        caso real de um envio interrompido, e que precisa virar pendência
        escrita em vez de sumir do pacote em silêncio.
  */
  await mem.bruto.exec(`
    INSERT INTO evidencias
      (organizacao_id, ocorrencia_id, vistoria_id, chave_storage, legenda,
       capturada_em, ordem, tipo_conteudo, tamanho_bytes, enviada_em)
    VALUES
      ('${ORG_SERRA_ALTA}', '${OCORRENCIA_C3}', '${VISTORIA_F1}',
       '${CHAVE_FOTO}', 'Talude nos fundos', now() - interval '25 hours', 0,
       'image/jpeg', ${BYTES_DA_FOTO.length}, now() - interval '22 hours'),
      ('${ORG_SERRA_ALTA}', '${OCORRENCIA_C3}', '${VISTORIA_F1}',
       '${CHAVE_SUMIDA}', 'Trinca na parede', now() - interval '25 hours', 1,
       'image/jpeg', 1234, now() - interval '22 hours');

    UPDATE vistorias SET assinatura_chave = '${CHAVE_ASSINATURA}',
           equipe_designada_id = '11111111-1111-4111-8111-0000000000e1',
           equipe_do_agente_id = '11111111-1111-4111-8111-0000000000e2'
     WHERE id = '${VISTORIA_F1}';

    UPDATE usuarios SET foto_chave = '${CHAVE_FOTO_DA_COORDENADORA}'
     WHERE id = '${COORDENADORA}';

    UPDATE ocorrencias
       SET interditada_em = now() - interval '2 days',
           interditada_por = '${COORDENADORA}',
           desinterditada_em = now() - interval '1 day',
           desinterditada_por = '${COORDENADORA}',
           desinterdicao_motivo = 'Contenção executada e vistoria nova sem risco remanescente.'
     WHERE id = '${OCORRENCIA_C4}';

    INSERT INTO orgaos (id, organizacao_id, nome, sigla, email)
    VALUES ('${ORGAO}', '${ORG_SERRA_ALTA}', 'Companhia Municipal de Energia',
            'CME', 'protocolo@cme.exemplo.gov.br');

    INSERT INTO providencias
      (id, organizacao_id, ocorrencia_id, orgao_destino, descricao, responsavel, prazo_em)
    VALUES ('${PROVIDENCIA}', '${ORG_SERRA_ALTA}', '${OCORRENCIA_C4}',
            'Companhia Municipal de Energia',
            'Desenergizar a rede de baixa tensão sobre a via até a remoção do telhado.',
            'Plantão da concessionária', now() + interval '1 day');

    INSERT INTO oficios
      (organizacao_id, ocorrencia_id, providencia_id, orgao_id, numero, ano,
       observacoes, emitido_por, emitido_por_nome)
    VALUES ('${ORG_SERRA_ALTA}', '${OCORRENCIA_C4}', '${PROVIDENCIA}', '${ORGAO}',
            '000012/2026', 2026, 'Risco de contato com fiação exposta.',
            '${COORDENADORA}', 'Helena Vasques Coutinho');
  `);

  armazenamento = armazenamentoEmMemoria({ baseUrl: "http://api.local" });
  armazenamento.guardar(CHAVE_FOTO, BYTES_DA_FOTO, "image/jpeg");
  armazenamento.guardar(CHAVE_ASSINATURA, BYTES_DA_ASSINATURA, "image/png");
  armazenamento.guardar(CHAVE_FOTO_DA_COORDENADORA, BYTES_DA_FOTO_DA_COORDENADORA, "image/jpeg");

  const config = carregarConfig({
    NODE_ENV: "test",
    JWT_SEGREDO: "segredo-de-saida-de-municipio-com-mais-de-32",
    LOGIN_POR_IP: "10000",
  } as NodeJS.ProcessEnv);
  app = await construirServidor({ banco: mem.banco, config, armazenamento });
  await app.ready();

  tokenAdministradora = await entrar("rita.lopes@serraalta.exemplo.gov.br");
  tokenCoordenadora = await entrar("helena.coutinho@serraalta.exemplo.gov.br");
  tokenOperador = await entrar("jonas.ferreira@serraalta.exemplo.gov.br");
  tokenDeFora = await entrar("aurelio.machado@valefundo.exemplo.gov.br");
}, 180_000);

afterAll(async () => {
  await app?.close();
  await mem?.banco.encerrar();
});

describe("O pacote leva tudo que é do município", () => {
  it("traz toda tabela em CSV e em JSON, e o índice na raiz", async () => {
    const pacote = await baixarPacote(tokenAdministradora);

    for (const tabela of TABELAS_DA_SAIDA) {
      expect(pacote.has(`tabelas/${tabela}.csv`), `falta tabelas/${tabela}.csv`).toBe(true);
      expect(pacote.has(`tabelas/${tabela}.json`), `falta tabelas/${tabela}.json`).toBe(true);
    }

    // As quatro peças que a seção 4 do documento listava como inexistentes.
    for (const arquivo of ["INDICE.csv", "INDICE.html", "LEIA-ME.txt", "SOMAS-SHA256.txt"]) {
      expect(pacote.has(arquivo), `falta ${arquivo}`).toBe(true);
    }

    // O esquema comentado: quem for migrar precisa saber o que cada coluna
    // significa, e um despejo cru de DDL não conta isso.
    expect([...pacote.keys()].some((k) => k.startsWith("esquema/001_"))).toBe(true);

    // As tabelas que o banco cresceu depois da 007: ofício, órgão, aviso e
    // aparelho também são do município e saem junto.
    for (const nova of ["orgaos", "oficios", "avisos", "aparelhos"]) {
      expect(TABELAS_DA_SAIDA as readonly string[]).toContain(nova);
    }

    const csv = pacote.get("tabelas/ocorrencias.csv")!.toString("utf8");
    expect(csv).toContain("000473/2026");
    const json = JSON.parse(pacote.get("tabelas/ocorrencias.json")!.toString("utf8"));
    expect(json.length).toBeGreaterThan(0);
  }, 60_000);

  it("tabela nova de migração futura obriga alguém a decidir se ela sai", async () => {
    /*
      Este é o teste que impede o defeito mais provável desta funcionalidade:
      não o de hoje, o de daqui a três migrações. Uma tabela nova com dado de
      cidadão que ninguém lembrou de acrescentar aqui sairia do pacote em
      silêncio, e o município levaria um arquivo incompleto acreditando que
      levou tudo.
    */
    const r = await mem.bruto.query<{ table_name: string }>(`
      SELECT DISTINCT t.table_name
        FROM information_schema.tables t
       WHERE t.table_schema = 'public'
         AND t.table_type = 'BASE TABLE'
         AND (
           EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema = 'public' AND c.table_name = t.table_name
                      AND c.column_name = 'organizacao_id')
           OR t.table_name = 'organizacoes'
         )
    `);

    const classificadas = new Set<string>([
      ...TABELAS_DA_SAIDA,
      ...Object.keys(TABELAS_QUE_NAO_SAEM),
    ]);
    const semDecisao = r.rows.map((l) => l.table_name).filter((n) => !classificadas.has(n));

    expect(
      semDecisao,
      "tabela do município sem decisão: acrescente em TABELAS_DA_SAIDA ou "
      + "em TABELAS_QUE_NAO_SAEM, com o motivo escrito",
    ).toEqual([]);
  }, 60_000);
});

describe("Segredo não vai junto", () => {
  it("nem hash de senha, nem token de sessão, nem ficha de notificação", async () => {
    const pacote = await baixarPacote(tokenAdministradora);

    const usuarios = pacote.get("tabelas/usuarios.csv")!.toString("utf8");
    expect(usuarios).toContain("Helena");
    expect(usuarios).not.toContain("senha_hash");

    // O pacote inteiro, byte a byte: é o arquivo deste produto que mais viaja,
    // e um segredo que entrar aqui é um segredo publicado.
    for (const [caminho, conteudo] of pacote) {
      expect(conteudo.toString("utf8"), `segredo em ${caminho}`).not.toContain("scrypt$");
    }

    expect(pacote.has("tabelas/sessoes.csv")).toBe(false);
    expect(pacote.has("tabelas/recuperacoes_senha.csv")).toBe(false);
  }, 60_000);
});

describe("Fotografias, assinaturas e documentos", () => {
  it("a fotografia sai em pasta por protocolo, com os bytes originais", async () => {
    const pacote = await baixarPacote(tokenAdministradora);
    const caminho = "evidencias/000473-2026/talude-fundos.jpg";
    expect(pacote.has(caminho)).toBe(true);
    expect(pacote.get(caminho)!.equals(BYTES_DA_FOTO)).toBe(true);

    const assinatura = "evidencias/000473-2026/assinatura-f1.png";
    expect(pacote.get(assinatura)!.equals(BYTES_DA_ASSINATURA)).toBe(true);
  }, 60_000);

  it("a foto de perfil do servidor sai na pasta dele, com os bytes originais", async () => {
    /*
      A foto é dado pessoal do SERVIDOR e pertence ao município que o cadastrou
      (`docs/PRIVACIDADE.md`, seção 2.2). Sai em pasta própria, por matrícula,
      e não misturada às evidências: não é prova de ocorrência nenhuma.
    */
    const pacote = await baixarPacote(tokenAdministradora);
    const caminho = "usuarios/SA-1042/foto-abc.jpg";
    expect(pacote.has(caminho)).toBe(true);
    expect(pacote.get(caminho)!.equals(BYTES_DA_FOTO_DA_COORDENADORA)).toBe(true);
    /* E a chave está na tabela, para o município saber de quem é cada arquivo. */
    const usuarios = pacote.get("tabelas/usuarios.csv")!.toString("utf8");
    expect(usuarios).toContain(CHAVE_FOTO_DA_COORDENADORA);
  }, 60_000);

  /*
    O laudo do pacote precisa dizer o que o laudo emitido pela rota diz. A
    consulta do pacote não juntava as duas equipes da vistoria, então uma
    coleta feita por agente de OUTRA equipe saía no pacote como papel limpo,
    enquanto o laudo impresso na prefeitura carregava o aviso de divergência.
    A vistoria F1 do cenário está designada à Alfa e foi coletada por agente
    lotado na Bravo, de propósito.
  */
  it("o laudo do pacote imprime o aviso de equipe divergente, como o laudo emitido", async () => {
    const pacote = await baixarPacote(tokenAdministradora);
    const laudo = pacote.get("documentos/000473-2026/laudo-de-vistoria.html")!.toString("utf8");
    expect(laudo).toContain("estava designada à Equipe Alfa");
    expect(laudo).toContain("lotado na Equipe Bravo");
  });

  it("o laudo é HTML autossuficiente e aponta para o arquivo do próprio pacote", async () => {
    const pacote = await baixarPacote(tokenAdministradora);
    const laudo = pacote.get("documentos/000473-2026/laudo-de-vistoria.html")!.toString("utf8");

    expect(laudo).toContain("000473/2026");
    // O estilo vai dentro do arquivo: sem isto o laudo abre sem formatação
    // nenhuma na máquina da prefeitura daqui a dez anos.
    expect(laudo).toContain("<style>");
    // E a imagem aponta para a pasta do pacote, e não para uma URL assinada,
    // que morre em trinta minutos e deixaria o laudo com retângulo quebrado.
    expect(laudo).toContain("../../evidencias/000473-2026/talude-fundos.jpg");
    expect(laudo).not.toContain("http://api.local");

    // O imóvel c3 está interditado na semente, então o termo sai junto.
    expect(pacote.has("documentos/000473-2026/termo-de-interdicao.html")).toBe(true);
    // E o c4 teve a interdição levantada: sai o termo de desinterdição.
    expect(pacote.has("documentos/000474-2026/termo-de-desinterdicao.html")).toBe(true);
  }, 60_000);

  it("o ofício numerado sai junto, na pasta da ocorrência dele", async () => {
    const pacote = await baixarPacote(tokenAdministradora);
    const caminho = "documentos/000474-2026/oficio-000012-2026.html";

    expect(pacote.has(caminho), `falta ${caminho}`).toBe(true);
    const oficio = pacote.get(caminho)!.toString("utf8");
    expect(oficio).toContain("000012/2026");
    expect(oficio).toContain("Companhia Municipal de Energia");
    // O ofício é o documento que o município mais precisa provar depois: ele é
    // a peça que mostra que o outro órgão foi acionado, e em que data.
    expect(oficio).toContain("Desenergizar a rede de baixa tensão");
    expect(oficio).toContain("<style>");

    // E o índice aponta para ele, senão o documento existe e ninguém acha.
    const indice = pacote.get("INDICE.csv")!.toString("utf8");
    expect(indice).toContain(caminho);
  }, 60_000);

  it("arquivo que o banco promete e o armazenamento não tem vira pendência escrita", async () => {
    const pacote = await baixarPacote(tokenAdministradora);
    const pendencias = pacote.get("PENDENCIAS-DA-EXTRACAO.txt")!.toString("utf8");

    expect(pendencias).toContain(CHAVE_SUMIDA);
    expect(pendencias).toContain("000473/2026");
    // E a extração NÃO abortou por causa disso: o resto do pacote está lá.
    expect(pacote.has("evidencias/000473-2026/talude-fundos.jpg")).toBe(true);
  }, 60_000);
});

describe("O índice liga protocolo a pasta, a documento e a linha do CSV", () => {
  it("o número de linha que o índice dá bate com o CSV de verdade", async () => {
    const pacote = await baixarPacote(tokenAdministradora);

    const indice = pacote.get("INDICE.csv")!.toString("utf8");
    const linhasDoIndice = indice.replace(/^﻿/, "").trim().split("\r\n");
    const daC3 = linhasDoIndice.find((l) => l.startsWith("000473/2026"));
    expect(daC3, "o índice não lista o protocolo 000473/2026").toBeTruthy();

    const colunas = daC3!.split(";");
    expect(colunas[1]).toBe("000473-2026");
    const linhaDeclarada = Number(colunas[6]);

    /*
      A aposta que este teste cobre: um índice que aponta para a linha errada é
      pior que índice nenhum, porque ele parece funcionar. Aqui a linha
      declarada é conferida contra o CSV de verdade, e não contra a fórmula que
      a produziu.
    */
    const csv = pacote.get("tabelas/ocorrencias.csv")!.toString("utf8");
    const linhasDoCsv = csv.replace(/^﻿/, "").split("\r\n");
    expect(linhasDoCsv[linhaDeclarada - 1]).toContain("000473/2026");

    const html = pacote.get("INDICE.html")!.toString("utf8");
    expect(html).toContain("000473/2026");
    expect(html).toContain("documentos/000473-2026/laudo-de-vistoria.html");
    // Índice que dependesse de internet seria índice quebrado justamente na
    // máquina sem rede da prefeitura.
    expect(html).not.toContain("http://");
    expect(html).not.toContain("<script");
  }, 60_000);
});

describe("Isolamento entre municípios", () => {
  it("o pacote de um município não carrega nada do outro", async () => {
    const doSerraAlta = await baixarPacote(tokenAdministradora);

    for (const [caminho, conteudo] of doSerraAlta) {
      /*
        `esquema/` fica de fora, e não por conveniência: ele é o SQL de criação
        do produto, igual em toda instalação, e os comentários dele citam os
        dois municípios da semente de desenvolvimento ao explicar o vazamento
        que a migração 008 corrigiu. Não é dado de município: é documentação
        do esquema, e ela é a mesma que o outro município levaria.
      */
      if (caminho.startsWith("esquema/")) continue;
      const texto = conteudo.toString("utf8");
      expect(texto, `dado de Vale Fundo em ${caminho}`).not.toContain("000112/2026");
      expect(texto, `dado de Vale Fundo em ${caminho}`).not.toContain("Vale Fundo");
    }
  }, 60_000);
});

describe("É ato administrativo grave", () => {
  it("exige administrador: quem só exporta relatório não tira a base inteira", async () => {
    // A coordenadora TEM `exportar_dados` e tira o CSV do semestre sem
    // problema. A base completa é outra coisa.
    const relatorio = await app.inject({
      method: "GET", url: "/relatorios/ocorrencias.csv", headers: com(tokenCoordenadora),
    });
    expect(relatorio.statusCode).toBe(200);

    const saida = await app.inject({
      method: "POST", url: "/saida/pacote.zip", headers: com(tokenCoordenadora),
    });
    expect(saida.statusCode).toBe(403);
  }, 60_000);

  it("recusa operador e recusa quem não apresenta token", async () => {
    const doOperador = await app.inject({
      method: "POST", url: "/saida/pacote.zip", headers: com(tokenOperador),
    });
    expect(doOperador.statusCode).toBe(403);

    const semToken = await app.inject({ method: "POST", url: "/saida/pacote.zip" });
    expect(semToken.statusCode).toBe(401);
  }, 60_000);

  it("deixa trilha, registra a exportação e NÃO apaga nada", async () => {
    const antes = await mem.bruto.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM ocorrencias WHERE organizacao_id = '${ORG_SERRA_ALTA}'`,
    );

    await baixarPacote(tokenAdministradora);

    const ato = await mem.bruto.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM trilha_administrativa
        WHERE organizacao_id = '${ORG_SERRA_ALTA}' AND acao = 'saida_de_municipio_exportada'`,
    );
    expect(Number(ato.rows[0]!.total)).toBeGreaterThan(0);

    const registro = await mem.bruto.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM exportacoes
        WHERE organizacao_id = '${ORG_SERRA_ALTA}' AND tipo = 'saida_de_municipio'`,
    );
    expect(Number(registro.rows[0]!.total)).toBeGreaterThan(0);

    /*
      Nada é apagado antes de o município confirmar que conferiu, e a ordem
      inversa (apagar contra o calendário) já destruiu dado de gente em outros
      produtos. Aqui a exportação não apaga em momento nenhum: a eliminação é
      ato contratual, com declaração escrita, depois do passo 5.
    */
    const depois = await mem.bruto.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM ocorrencias WHERE organizacao_id = '${ORG_SERRA_ALTA}'`,
    );
    expect(depois.rows[0]!.total).toBe(antes.rows[0]!.total);
  }, 60_000);

  it("a organização vem do token, e não de parâmetro nenhum", async () => {
    // Vale Fundo não tem administrador na semente, então o teto do posto já
    // recusa. O que importa aqui é que não existe caminho para pedir o pacote
    // de OUTRO município: não há parâmetro de organização na rota.
    const r = await app.inject({
      method: "POST",
      url: `/saida/pacote.zip?organizacao=${ORG_SERRA_ALTA}`,
      headers: com(tokenDeFora),
    });
    expect(r.statusCode).toBe(403);
  }, 60_000);
});

describe("O escritor de ZIP", () => {
  async function montar(entradas: Array<{ caminho: string; conteudo: Buffer }>, teto?: number) {
    async function* fonte() {
      for (const e of entradas) yield e;
    }
    const pedacos: Buffer[] = [];
    for await (const p of fluxoZip(fonte(), teto === undefined ? {} : { tetoDe32Bits: teto })) {
      pedacos.push(p);
    }
    return Buffer.concat(pedacos);
  }

  it("escreve um pacote que um leitor independente abre", async () => {
    const zip = await montar([
      { caminho: "a/b.txt", conteudo: Buffer.from("olá, acentuação e ç") },
      { caminho: "binario.bin", conteudo: Buffer.from([0, 1, 2, 255, 254]) },
    ]);
    const lido = lerZip(zip);
    expect(lido.get("a/b.txt")!.toString("utf8")).toBe("olá, acentuação e ç");
    expect(lido.get("binario.bin")!.equals(Buffer.from([0, 1, 2, 255, 254]))).toBe(true);
  });

  it("o caminho ZIP64 funciona, exercitado com o teto rebaixado", async () => {
    /*
      O pacote de um município grande passa de quatro gigabytes, e aí os campos
      de 32 bits do ZIP clássico não cabem. Esse caminho só rodaria na saída de
      um município grande, ou seja, exatamente onde não dá para descobrir
      defeito: por isso o teto é rebaixado aqui, e o mesmo código é exercitado
      com poucos bytes.
    */
    const zip = await montar([
      { caminho: "grande-1.txt", conteudo: Buffer.from("conteudo um") },
      { caminho: "grande-2.txt", conteudo: Buffer.from("conteudo dois") },
    ], 8);
    // O fim clássico precisa anunciar ZIP64, senão nenhum descompactador acha
    // o diretório central.
    expect(zip.readUInt32LE(zip.length - 22 + 16)).toBe(0xffffffff);
    const lido = lerZip(zip);
    expect(lido.get("grande-2.txt")!.toString("utf8")).toBe("conteudo dois");
  });

  it("recusa caminho repetido, que sobrescreveria arquivo em silêncio", async () => {
    await expect(montar([
      { caminho: "x.txt", conteudo: Buffer.from("um") },
      { caminho: "x.txt", conteudo: Buffer.from("dois") },
    ])).rejects.toThrow(/repetido/);
  });

  it("não deixa um nome de arquivo escapar da pasta do pacote", async () => {
    // Travessia de diretório dentro de um ZIP: quem paga é o computador da
    // prefeitura que extrai, não este servidor.
    const zip = await montar([
      { caminho: "../../etc/passwd", conteudo: Buffer.from("nao") },
    ]);
    expect([...lerZip(zip).keys()]).toEqual(["etc/passwd"]);
  });
});

/* ==========================================================================
   O aviso de equipe divergente, caso por caso.

   Fica no FIM do arquivo de propósito: estes casos alteram as duas colunas de
   equipe da vistoria F1 para exercitar cada ramo de `avisoDeEquipe`, e os
   testes anteriores leem a vistoria no estado da semente. O `afterAll`
   devolve o estado, para quem acrescentar teste depois daqui não herdar a
   última variação.

   O que se tranca aqui é a INTEGRIDADE DO DOCUMENTO, e não a consulta: o laudo
   que o município leva no pacote tem de dizer o mesmo que o laudo que a
   prefeitura imprimiu pela rota. Faltar a ressalva é grave (o ato é praticado
   sem a conferência que ela pede) e inventá-la é igualmente grave (a vistoria
   anterior à migração 024 tem as duas colunas nulas, e isso não é divergência
   nenhuma).
   ========================================================================== */

describe("O laudo do pacote avisa a equipe divergente igual ao laudo da rota", () => {
  const ALFA = "11111111-1111-4111-8111-0000000000e1";
  const BRAVO = "11111111-1111-4111-8111-0000000000e2";

  /** Os parágrafos de ressalva do laudo, que é onde o aviso de equipe mora. */
  function notas(html: string): string[] {
    return [...html.matchAll(/<p class="nota">([\s\S]*?)<\/p>/g)].map((m) => m[1]!.trim());
  }

  async function laudoDoPacote(): Promise<string> {
    const pacote = await baixarPacote(tokenAdministradora);
    return pacote.get("documentos/000473-2026/laudo-de-vistoria.html")!.toString("utf8");
  }

  async function laudoDaRota(): Promise<string> {
    const r = await app.inject({
      method: "GET", url: `/documentos/${OCORRENCIA_C3}/laudo`, headers: com(tokenCoordenadora),
    });
    expect(r.statusCode).toBe(200);
    return r.body;
  }

  async function definirEquipes(designada: string | null, doAgente: string | null) {
    await mem.bruto.exec(
      `UPDATE vistorias
          SET equipe_designada_id = ${designada === null ? "NULL" : `'${designada}'`},
              equipe_do_agente_id = ${doAgente === null ? "NULL" : `'${doAgente}'`}
        WHERE id = '${VISTORIA_F1}'`,
    );
  }

  afterAll(async () => {
    await definirEquipes(ALFA, BRAVO);
    await mem.bruto.exec(
      `DELETE FROM trilha_eventos
        WHERE tipo = 'vistoria_sem_despacho' AND detalhe ->> 'vistoriaId' = '${VISTORIA_F1}'`,
    );
  });

  it("equipes diferentes: o trecho do aviso é o MESMO nos dois laudos", async () => {
    await definirEquipes(ALFA, BRAVO);

    const doPacote = notas(await laudoDoPacote());
    const daRota = notas(await laudoDaRota());

    const esperado = "Atenção: esta ocorrência estava designada à Equipe Alfa e a vistoria foi "
      + "coletada por agente lotado na Equipe Bravo. O sistema registrou a coleta e manteve a "
      + "tarefa com a equipe designada. A divergência precisa ser conferida pela coordenação "
      + "antes de o ato ser praticado.";

    /*
      Comparar os dois documentos entre si, e não cada um contra uma string
      solta, é o que impede os dois de errarem juntos: se amanhã a frase mudar
      em `documentos/laudo.ts`, os dois mudam, e o teste continua provando que
      o pacote não ficou atrás. A string literal existe junto porque dois
      documentos vazios também seriam iguais.
    */
    expect(doPacote).toContain(esperado);
    expect(daRota).toContain(esperado);
    expect(doPacote.filter((n) => n.startsWith("Atenção:")))
      .toEqual(daRota.filter((n) => n.startsWith("Atenção:")));
  }, 60_000);

  it("equipes iguais: nenhum dos dois laudos inventa aviso", async () => {
    await definirEquipes(ALFA, ALFA);

    expect(notas(await laudoDoPacote()).some((n) => n.startsWith("Atenção:"))).toBe(false);
    expect(notas(await laudoDaRota()).some((n) => n.startsWith("Atenção:"))).toBe(false);
  }, 60_000);

  it("agente sem equipe registrada: a frase própria, e não a de outra equipe", async () => {
    await definirEquipes(ALFA, null);

    const doPacote = await laudoDoPacote();
    expect(doPacote).toContain("estava designada à Equipe Alfa");
    expect(doPacote).toContain("sem equipe registrada no momento do recebimento");
    // E não pode sobrar o nome de uma equipe que o agente não tinha.
    expect(doPacote).not.toContain("lotado na");
    expect(notas(doPacote).filter((n) => n.startsWith("Atenção:")))
      .toEqual(notas(await laudoDaRota()).filter((n) => n.startsWith("Atenção:")));
  }, 60_000);

  it("vistoria anterior à migração 024, as duas colunas nulas: nenhum aviso falso", async () => {
    /*
      Este é o caso mais numeroso do banco de um município que já usava o
      produto antes da 024: as duas colunas nulas. Ler nulo como divergência
      poria ressalva em laudo de vistoria que nunca teve problema de equipe, e
      um documento que avisa sempre é um documento que ninguém mais lê.
    */
    await definirEquipes(null, null);

    expect(notas(await laudoDoPacote()).some((n) => n.startsWith("Atenção:"))).toBe(false);
    expect(await laudoDoPacote()).not.toContain("Equipe Alfa");
  }, 60_000);

  it("coleta sem despacho: a nota própria, e não a de divergência", async () => {
    /*
      Rodado por último dentro do bloco porque a marca de "sem despacho" é um
      evento da TRILHA, que é append-only no produto: aqui ela entra por SQL
      direto do arranjo de teste e o `afterAll` a remove, o que o produto não
      faz em lugar nenhum.
    */
    await definirEquipes(ALFA, BRAVO);
    await mem.bruto.exec(`
      INSERT INTO trilha_eventos
        (organizacao_id, ocorrencia_id, tipo, autor_id, autor_nome, autor_papel,
         origem, ocorrido_em, detalhe)
      VALUES ('${ORG_SERRA_ALTA}', '${OCORRENCIA_C3}', 'vistoria_sem_despacho',
              '${COORDENADORA}', 'Helena Vasques Coutinho', 'coordenador',
              'campo', now() - interval '20 hours',
              jsonb_build_object('vistoriaId', '${VISTORIA_F1}'))
    `);

    const doPacote = await laudoDoPacote();
    expect(doPacote).toContain(
      "Esta ocorrência não tinha equipe despachada quando a vistoria foi recebida.",
    );
    // A nota de sem despacho SUBSTITUI a de divergência: duas ressalvas
    // contraditórias na mesma folha é o que faz o leitor descartar as duas.
    expect(doPacote).not.toContain("estava designada à Equipe Alfa");
    expect(notas(doPacote).filter((n) => n.startsWith("Esta ocorrência não tinha")))
      .toEqual(notas(await laudoDaRota()).filter((n) => n.startsWith("Esta ocorrência não tinha")));
  }, 60_000);

  it("isolamento: o nome de equipe do outro município não entra no pacote", async () => {
    await definirEquipes(ALFA, BRAVO);

    const pacote = await baixarPacote(tokenAdministradora);
    for (const [caminho, conteudo] of pacote) {
      // `esquema/` é o SQL de criação, igual em toda instalação (mesmo motivo
      // explicado no bloco de isolamento acima).
      if (caminho.startsWith("esquema/")) continue;
      expect(conteudo.toString("utf8"), `equipe de Vale Fundo em ${caminho}`)
        .not.toContain("Equipe Única");
    }
  }, 60_000);
});

/* ==========================================================================
   O laudo do pacote e o da rota, campo por campo (V2-F00-E12, correções 1 e 2).

   Existem DOIS montadores de dados do laudo (`rotas/documentos.ts` e
   `saida/pacote.ts`), e a documentação chegou a responder "Sim" a "o laudo do
   pacote diz o mesmo que o laudo emitido" porque só o aviso de equipe tinha
   sido comparado. A validação de 7005a60 gerou os dois laudos da mesma vistoria
   e achou quatro diferenças, e a de 4b96ea7 achou a quinta (a assinatura
   declarada e ausente no armazenamento). Este bloco prende o estado REAL:

     - a coordenada da vistoria (correção 1) e a assinatura declarada e ausente
       no armazenamento (correção 2) foram consertadas e têm de sair iguais
       nos dois;
     - as outras três diferenças continuam, são da V2-F09-E02 (montador
       único), e estão TRAVADAS como diferenças conhecidas. Se alguém conserta
       uma delas, o teste reprova de propósito: é o aviso para apagar a
       ressalva de `docs/SAIDA-DE-MUNICIPIO.md` e de `apps/api/PENDENCIAS.md`
       no mesmo commit, em vez de a documentação envelhecer sozinha;
     - uma quarta é deliberada (correção 2, revisão): com o armazenamento sem
       resposta na conferência da assinatura, a rota imprime "Assinatura não
       coletada" e o pacote imprime que não conseguiu conferir, sem imagem
       quebrada. Também está TRAVADA e na tabela da documentação.

   O QUE ESTE BLOCO NÃO FAZ: comparar o laudo inteiro. Ele olha os títulos das
   seções, a coordenada, a posição da foto avulsa e o bloco da assinatura de
   quem estava no local. Uma diferença nova em outro campo passa por ele sem
   reprovar; quem acrescenta campo ao laudo acrescenta o caso aqui (até a
   V2-F09-E02 unificar os montadores).

   Fica depois do bloco do aviso de equipe e limpa o que cria.
   ========================================================================== */

describe("O laudo do pacote e o da rota, campo por campo", () => {
  const CHAVE_AVULSA = `tenant/${ORG_SERRA_ALTA}/ocorrencias/${OCORRENCIA_C3}/avulsa-do-joao.jpg`;

  async function laudoDoPacote(): Promise<string> {
    const pacote = await baixarPacote(tokenAdministradora);
    return pacote.get("documentos/000473-2026/laudo-de-vistoria.html")!.toString("utf8");
  }

  async function laudoDaRota(): Promise<string> {
    const r = await app.inject({
      method: "GET", url: `/documentos/${OCORRENCIA_C3}/laudo`, headers: com(tokenCoordenadora),
    });
    expect(r.statusCode).toBe(200);
    return r.body;
  }

  const titulos = (html: string) => [...html.matchAll(/<h2>([\s\S]*?)<\/h2>/g)].map((m) => m[1]!.trim());

  /** O texto de uma seção: do título até o próximo `<h2>` (ou o fim). */
  function secao(html: string, titulo: string): string {
    const inicio = html.indexOf(`<h2>${titulo}</h2>`);
    if (inicio < 0) return "";
    const fim = html.indexOf("<h2>", inicio + 1);
    return html.slice(inicio, fim < 0 ? undefined : fim);
  }

  beforeAll(async () => {
    await mem.bruto.exec(`
      UPDATE vistorias SET latitude = -22.9, longitude = -43.2 WHERE id = '${VISTORIA_F1}';

      INSERT INTO evidencias
        (organizacao_id, ocorrencia_id, vistoria_id, chave_storage, legenda,
         capturada_em, ordem, tipo_conteudo, tamanho_bytes, enviada_em)
      VALUES
        ('${ORG_SERRA_ALTA}', '${OCORRENCIA_C3}', NULL, '${CHAVE_AVULSA}',
         'Avulsa do Joao', now() - interval '3 hours', 9,
         'image/jpeg', 1234, now() - interval '2 hours');

      INSERT INTO vistoria_evidencias_perdidas
        (organizacao_id, vistoria_id, idempotency_key, papel, capturada_em, legenda, ordem)
      VALUES
        ('${ORG_SERRA_ALTA}', '${VISTORIA_F1}', 'perdida-do-teste', 'foto',
         now() - interval '26 hours', 'Muro de arrimo que sumiu', 0);
    `);
  }, 60_000);

  afterAll(async () => {
    await mem.bruto.exec(`
      DELETE FROM vistoria_evidencias_perdidas WHERE idempotency_key = 'perdida-do-teste';
      DELETE FROM evidencias WHERE chave_storage = '${CHAVE_AVULSA}';
      UPDATE vistorias SET latitude = NULL, longitude = NULL WHERE id = '${VISTORIA_F1}';
    `);
  });

  it("a coordenada da vistoria sai IGUAL nos dois laudos (consertada nesta correção)", async () => {
    const daRota = await laudoDaRota();
    const doPacote = await laudoDoPacote();
    expect(daRota).toContain("-22.900000, -43.200000");
    expect(doPacote).toContain("-22.900000, -43.200000");
    expect(doPacote).not.toContain("não registrada");
  }, 60_000);

  it("DIFERENÇA CONHECIDA (F09-E02): o pacote não tem duas seções que a rota tem", async () => {
    const daRota = titulos(await laudoDaRota());
    const doPacote = titulos(await laudoDoPacote());

    // Só a falta: nenhuma seção do pacote pode faltar na rota.
    expect(doPacote.filter((t) => !daRota.includes(t))).toEqual([]);
    expect(daRota.filter((t) => !doPacote.includes(t)).sort()).toEqual([
      "Fotografias anexadas ao protocolo",
      "Registros capturados que não puderam ser recuperados",
    ]);
  }, 60_000);

  it("DIFERENÇA CONHECIDA (F09-E02): a foto avulsa entra no registro da vistoria só no pacote", async () => {
    const daRota = await laudoDaRota();
    const doPacote = await laudoDoPacote();

    // Na rota, a avulsa fica na seção própria, e não no registro do agente.
    expect(secao(daRota, "Registro fotográfico")).not.toContain("Avulsa do Joao");
    expect(secao(daRota, "Fotografias anexadas ao protocolo")).toContain("Avulsa do Joao");
    // No pacote, o montador traz TODA evidência da ocorrência: a avulsa vira
    // foto da vistoria, e o documento atribui ao agente uma imagem que ele não fez.
    expect(secao(doPacote, "Registro fotográfico")).toContain("Avulsa do Joao");
  }, 60_000);

  /** O bloco da assinatura de quem estava no local (a que o aparelho coleta). */
  function assinaturaNoLocal(html: string): string {
    const papel = html.indexOf('<div class="papel">Presente no local</div>');
    expect(papel, "o laudo não tem o bloco da assinatura de quem estava no local").toBeGreaterThan(0);
    return html.slice(html.lastIndexOf('<div class="assinatura">', papel), papel);
  }

  it("a assinatura declarada e AUSENTE no armazenamento sai igual nos dois: \"Assinatura não coletada\" (consertada na correção 2)", async () => {
    // A vistoria diz que há traço, e o armazenamento não tem o arquivo (envio
    // interrompido, objeto apagado). Os dois laudos conferem o objeto antes de
    // imprimir (`enderecoDaAssinatura` na rota, `conferirAssinatura` no pacote).
    // Antes da correção 2 o pacote montava o caminho só pela chave e imprimia
    // um quadro quebrado em cima do nome da pessoa.
    const fantasma = `tenant/${ORG_SERRA_ALTA}/ocorrencias/${OCORRENCIA_C3}/assinatura-fantasma.png`;
    await mem.bruto.exec(`UPDATE vistorias SET assinatura_chave = '${fantasma}' WHERE id = '${VISTORIA_F1}'`);
    try {
      const daRota = assinaturaNoLocal(await laudoDaRota());
      const pacote = await baixarPacote(tokenAdministradora);
      const doPacote = assinaturaNoLocal(pacote.get("documentos/000473-2026/laudo-de-vistoria.html")!.toString("utf8"));

      expect(daRota).toContain('<div class="traco-ausente">Assinatura não coletada</div>');
      expect(daRota).not.toContain('<img class="traco"');
      expect(doPacote, "o laudo do pacote imprime imagem para uma assinatura que ele não leva").not.toContain('<img class="traco"');
      expect(doPacote).toBe(daRota);
      expect(pacote.has("evidencias/000473-2026/assinatura-fantasma.png")).toBe(false);
      // A falta continua escrita no arquivo de pendências do pacote.
      expect(pacote.get("PENDENCIAS-DA-EXTRACAO.txt")!.toString("utf8"))
        .toContain(`Assinatura ausente no armazenamento: protocolo 000473/2026, chave ${fantasma}`);
    } finally {
      await mem.bruto.exec(`UPDATE vistorias SET assinatura_chave = '${CHAVE_ASSINATURA}' WHERE id = '${VISTORIA_F1}'`);
    }
  }, 60_000);

  it("a assinatura PRESENTE no armazenamento continua saindo como imagem nos dois, e o pacote leva o arquivo", async () => {
    // O controle positivo do caso acima: a conferência não pode apagar a
    // assinatura que existe.
    const daRota = assinaturaNoLocal(await laudoDaRota());
    const pacote = await baixarPacote(tokenAdministradora);
    const doPacote = assinaturaNoLocal(pacote.get("documentos/000473-2026/laudo-de-vistoria.html")!.toString("utf8"));
    expect(daRota).toContain('<img class="traco"');
    expect(doPacote).toContain('<img class="traco" src="../../evidencias/000473-2026/assinatura-f1.png"');
    expect(pacote.get("evidencias/000473-2026/assinatura-f1.png")).toEqual(BYTES_DA_ASSINATURA);
  }, 60_000);

  /** A frase do pacote quando o armazenamento não respondeu à conferência. */
  const NAO_CONFERIDA = "Não foi possível conferir a assinatura no armazenamento ao montar este pacote";

  it("armazenamento FORA DO AR (conferência e cópia falham): o pacote não imprime quadro quebrado nem afirma ausência", async () => {
    // O caso que a revisão da correção 2 achou: com o provedor caído, a
    // conferência lança e a cópia do arquivo também falha. A primeira versão
    // desta correção mantinha a imagem quando a conferência lançava, e o
    // pacote voltava a imprimir `<img class="traco">` para um arquivo que ele
    // não leva, o mesmo defeito da rodada 2. Agora o bloco diz o que houve:
    // ninguém conferiu. E não diz "não coletada", porque o próprio pacote, em
    // `PENDENCIAS-DA-EXTRACAO.txt`, avisa que não ter resposta não é o mesmo
    // que o arquivo não existir.
    const descrever = armazenamento.descrever;
    const baixar = armazenamento.baixar;
    armazenamento.descrever = async () => { throw new Error("provedor fora do ar na conferência"); };
    armazenamento.baixar = async (chave: string) => {
      if (chave === CHAVE_ASSINATURA) throw new Error("provedor fora do ar na cópia");
      return baixar(chave);
    };
    try {
      const pacote = await baixarPacote(tokenAdministradora);
      const doPacote = assinaturaNoLocal(pacote.get("documentos/000473-2026/laudo-de-vistoria.html")!.toString("utf8"));
      expect(doPacote, "o laudo do pacote imprime imagem para uma assinatura que ele não leva").not.toContain('<img class="traco"');
      expect(doPacote).toContain(`<div class="traco-ausente">${NAO_CONFERIDA}</div>`);
      expect(doPacote).not.toContain("Assinatura não coletada");
      expect(pacote.has("evidencias/000473-2026/assinatura-f1.png")).toBe(false);
      expect(pacote.get("PENDENCIAS-DA-EXTRACAO.txt")!.toString("utf8"))
        .toContain(`Assinatura NÃO LIDA: protocolo 000473/2026, chave ${CHAVE_ASSINATURA}`);
    } finally {
      armazenamento.descrever = descrever;
      armazenamento.baixar = baixar;
    }
  }, 60_000);

  it("DIFERENÇA CONHECIDA (correção 2): com a conferência sem resposta, a rota diz \"Assinatura não coletada\" e o pacote diz que não conferiu", async () => {
    // A rota trata a exceção da conferência como ausência
    // (`enderecoDaAssinatura`, `.catch(() => ({ existe: false }))`); o pacote
    // não, porque é o registro que fica com o município depois que as nossas
    // cópias são eliminadas. Aqui só a conferência falha e a cópia funciona:
    // o pacote leva o arquivo e o laudo dele continua sem imagem, porque o
    // laudo é montado antes da cópia. A diferença está na tabela de
    // `docs/SAIDA-DE-MUNICIPIO.md`; quem a mudar reprova aqui de propósito.
    const descrever = armazenamento.descrever;
    armazenamento.descrever = async () => { throw new Error("provedor fora do ar na conferência"); };
    try {
      const daRota = assinaturaNoLocal(await laudoDaRota());
      const pacote = await baixarPacote(tokenAdministradora);
      const doPacote = assinaturaNoLocal(pacote.get("documentos/000473-2026/laudo-de-vistoria.html")!.toString("utf8"));
      expect(daRota).toContain('<div class="traco-ausente">Assinatura não coletada</div>');
      expect(doPacote).toContain(`<div class="traco-ausente">${NAO_CONFERIDA}</div>`);
      expect(doPacote).not.toContain('<img class="traco"');
      expect(pacote.get("evidencias/000473-2026/assinatura-f1.png")).toEqual(BYTES_DA_ASSINATURA);
    } finally {
      armazenamento.descrever = descrever;
    }
  }, 60_000);
});
