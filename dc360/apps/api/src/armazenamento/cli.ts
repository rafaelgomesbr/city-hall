import pg from "pg";
import { bancoPostgres } from "../banco/postgres.js";
import { carregarConfig } from "../config.js";
import { armazenamentoS3 } from "./s3.js";
import { descartarOrfaos, varrerOrfaos } from "./orfaos.js";

/**
 * O comando de armazenamento do operador da plataforma.
 *
 * POR QUE NÃO É ROTA DA API, e a razão é a mesma de `provisionar.ts`: as três
 * coisas que se fazem aqui são atos do FORNECEDOR e não do município.
 *
 *   - Fixar o teto é decisão de contrato. Uma rota faria o próprio limitado
 *     levantar o próprio limite, e o gatilho da migração 035 já recusa isso no
 *     banco.
 *   - Varrer alcança o balde inteiro, de todos os municípios. Um token de um
 *     município nunca pode abrir uma porta que enxerga os outros: é a regra
 *     número um deste produto.
 *   - Descartar APAGA FOTOGRAFIA, que é a única coisa irreversível do sistema.
 *     Ela existe atrás de um comando, com nome de quem autoriza e motivo
 *     escrito, e nunca atrás de um botão.
 *
 * Rodar:
 *
 *   # quanto cada município ocupa, e quanto é o teto dele
 *   DATABASE_URL=... npm run armazenamento --workspace @dc360/api -- --uso
 *
 *   # fixar o teto de um município (em gigabytes)
 *   DATABASE_URL=... npm run armazenamento --workspace @dc360/api -- \
 *     --teto --municipio <uuid> --gb 200
 *
 *   # listar objeto órfão. NÃO apaga nada, e imprime o identificador da rodada
 *   DATABASE_URL=... npm run armazenamento --workspace @dc360/api -- --varrer
 *
 *   # apagar o que aquela rodada listou, DEPOIS de conferir com o município
 *   DATABASE_URL=... npm run armazenamento --workspace @dc360/api -- \
 *     --descartar <id da varredura> \
 *     --operador "Fulana, operação da plataforma" \
 *     --motivo "Lista conferida com Serra Alta em 10/09; nenhuma vistoria refere estes arquivos." \
 *     --confirmo
 */

type Argumentos = Record<string, string | true>;

function lerArgumentos(argv: readonly string[]): Argumentos {
  const lidos: Argumentos = {};
  for (let i = 0; i < argv.length; i += 1) {
    const atual = argv[i]!;
    if (!atual.startsWith("--")) continue;
    const chave = atual.slice(2);
    const valor = argv[i + 1];
    if (valor === undefined || valor.startsWith("--")) {
      lidos[chave] = true;
      continue;
    }
    lidos[chave] = valor;
    i += 1;
  }
  return lidos;
}

function exigir(args: Argumentos, chave: string): string {
  const valor = args[chave];
  if (typeof valor !== "string" || !valor.trim()) throw new Error(`Faltou --${chave}`);
  return valor.trim();
}

const GB = 1024 * 1024 * 1024;

function emGb(bytes: number): string {
  return `${(bytes / GB).toFixed(2)} GB`;
}

/**
 * Os municípios, lidos com a credencial de DONO.
 *
 * É a única leitura deste arquivo que acontece fora de contexto de tenant, e
 * ela é do operador da plataforma, não do produto. A alternativa seria uma
 * função `SECURITY DEFINER` que enumerasse municípios, e o orçamento delas está
 * em quinze de quinze com o portão CA-06 reprovando a décima sexta: não se
 * gasta a última numa lista que um comando de linha lê com a própria
 * credencial.
 */
async function municipios(url: string): Promise<Array<{
  id: string; municipio: string; uf: string; teto: string | null;
}>> {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    const r = await cliente.query<{
      id: string; municipio: string; uf: string; teto: string | null;
    }>(
      `SELECT id, municipio, uf, teto_armazenamento_bytes::text AS teto
         FROM organizacoes ORDER BY municipio`,
    );
    return r.rows;
  } finally {
    await cliente.end();
  }
}

async function principal(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    throw new Error(
      "DATABASE_URL ausente. Este comando é do operador da plataforma e roda "
      + "com a credencial de dono, como `provisionar`.",
    );
  }

  const args = lerArgumentos(process.argv.slice(2));
  const lista = await municipios(url);

  if (args["teto"]) {
    const municipio = exigir(args, "municipio");
    const gb = Number(exigir(args, "gb"));
    if (!Number.isFinite(gb) || gb <= 0) throw new Error("--gb precisa ser um número positivo");

    const cliente = new pg.Client({ connectionString: url });
    await cliente.connect();
    try {
      const r = await cliente.query(
        "UPDATE organizacoes SET teto_armazenamento_bytes = $2 WHERE id = $1 RETURNING municipio",
        [municipio, Math.round(gb * GB)],
      );
      if (r.rowCount === 0) throw new Error("Nenhum município com esse identificador.");
      console.log(`Teto de ${r.rows[0]!["municipio"]} fixado em ${gb} GB.`);
    } finally {
      await cliente.end();
    }
    return;
  }

  const banco = bancoPostgres(url);
  try {
    if (args["uso"]) {
      for (const org of lista) {
        const usado = await banco.comTenant(org.id, async (c) => {
          const r = await c.query<{ bytes_usados: string; situacao: string }>(
            "SELECT bytes_usados::text, situacao FROM situacao_de_armazenamento(0)",
          );
          return r.rows[0]!;
        });
        const teto = org.teto ? emGb(Number(org.teto)) : "sem teto";
        console.log(
          `${org.municipio}/${org.uf}  ${emGb(Number(usado.bytes_usados))} de ${teto}`
          + `  (${usado.situacao})  ${org.id}`,
        );
      }
      return;
    }

    const config = carregarConfig(process.env);
    if (!config.S3_ENDPOINT || !config.S3_BALDE || !config.S3_CHAVE_ID || !config.S3_CHAVE_SECRETA) {
      throw new Error(
        "Varredura e descarte precisam do armazenamento de verdade configurado "
        + "(S3_ENDPOINT, S3_BALDE, S3_CHAVE_ID, S3_CHAVE_SECRETA).",
      );
    }
    const armazenamento = armazenamentoS3({
      endpoint: config.S3_ENDPOINT,
      balde: config.S3_BALDE,
      regiao: config.S3_REGIAO,
      credenciais: {
        accessKeyId: config.S3_CHAVE_ID,
        secretAccessKey: config.S3_CHAVE_SECRETA,
      },
    });

    if (args["varrer"]) {
      const resumo = await varrerOrfaos({
        banco, armazenamento, municipios: lista.map((o) => o.id),
      });
      console.log(`Rodada:            ${resumo.varreduraId}`);
      console.log(`Objetos olhados:   ${resumo.objetos}`);
      console.log(`Candidatos:        ${resumo.candidatos} (${emGb(resumo.bytesCandidatos)})`);
      console.log(`Reservas soltas:   ${resumo.reservasAbandonadas}`);
      if (resumo.naoAtribuidos.length > 0) {
        console.log(
          `Não atribuídos:    ${resumo.naoAtribuidos.length} `
          + "(chave sem prefixo de município conhecido; nunca entram em descarte)",
        );
        for (const chave of resumo.naoAtribuidos.slice(0, 20)) console.log(`  ${chave}`);
      }
      if (resumo.falhas.length > 0) {
        console.log("");
        console.log("ATENÇÃO: a rodada NÃO foi completa, então a lista tem buraco.");
        console.log("Não autorize descarte sobre ela: refaça a varredura.");
        for (const falha of resumo.falhas) console.log(`  ${falha}`);
      }
      console.log("");
      console.log("Nada foi apagado. O descarte é comando separado, e exige nome e motivo.");
      return;
    }

    if (typeof args["descartar"] === "string") {
      /*
        `--confirmo`, e a confirmação é do tamanho do ato.

        Este é o único caminho do produto que destrói fotografia de vistoria, e
        fotografia de vistoria é a prova material de um ato administrativo que
        pode acabar numa audiência. Um comando que apagasse ao ser digitado
        errado uma vez seria desproporcional ao que ele faz.
      */
      if (!args["confirmo"]) {
        throw new Error(
          "O descarte apaga fotografia de vistoria, e isso não tem volta. "
          + "Confira a lista da rodada com o município e repita o comando com --confirmo.",
        );
      }
      const resultado = await descartarOrfaos({
        banco,
        armazenamento,
        varreduraId: args["descartar"],
        municipios: lista.map((o) => o.id),
        operador: exigir(args, "operador"),
        motivo: exigir(args, "motivo"),
      });
      console.log(`Apagados:  ${resultado.apagados} (${emGb(resultado.bytesApagados)})`);
      console.log(
        `Mantidos:  ${resultado.mantidos} `
        + "(voltaram a ser referidos entre a varredura e agora)",
      );
      for (const falha of resultado.falhas) console.log(`  falha: ${falha}`);
      return;
    }

    console.log(
      "Use --uso, --teto --municipio <uuid> --gb <n>, --varrer, ou "
      + "--descartar <rodada> --operador <nome> --motivo <frase> --confirmo.",
    );
  } finally {
    await banco.encerrar();
  }
}

principal().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : String(erro));
  process.exit(1);
});
