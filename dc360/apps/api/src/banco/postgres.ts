import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type { Banco, Consulta } from "./tipos.js";
import { mensagemDeUrlSemVerificacao, urlDoBancoVerifica } from "./tls.js";

/**
 * Caminho da âncora de confiança do provedor, a partir da raiz do repositório.
 *
 * O certificado é público (é a raiz que assina o servidor, não uma chave), e
 * fica versionado de propósito: baixar a CA na partida do contêiner colocaria
 * a rede no meio de uma decisão de segurança, e uma partida com rede instável
 * viraria uma partida sem verificação.
 */
export const CA_DO_PROVEDOR = "db/provedores/supabase-prod-ca-2021.crt";

/**
 * Parâmetros que, se sobrarem na string de conexão, ANULAM o objeto `ssl`.
 *
 * Este é o defeito silencioso que motivou a função inteira, e ele mora no
 * `pg`: `ConnectionParameters` faz
 * `config = Object.assign({}, config, parse(config.connectionString))`, e o
 * `parse` cria um `config.ssl` próprio assim que enxerga qualquer um destes
 * parâmetros. O objeto que passamos ao lado do `connectionString` é o primeiro
 * argumento do `Object.assign`, então ele PERDE. Com a string em
 * `sslmode=no-verify`, um `ssl: { ca, rejectUnauthorized: true }` escrito com
 * a melhor das intenções chegava ao driver como `{ rejectUnauthorized: false }`
 * e ninguém via nada: a conexão subia, cifrada e sem conferir com quem estava
 * falando.
 *
 * Por isso a string e o objeto não podem discordar: aqui eles não discordam
 * porque a string para de opinar sobre TLS e o objeto passa a ser a única
 * fonte. `sslrootcert` some junto porque o `parse` o lê com `readFileSync`
 * relativo ao diretório de quem chamou, e o diretório de quem chama muda entre
 * `npm run start:env` (dentro de `apps/api`) e o contêiner (em `/app`).
 */
const PARAMETROS_DE_SSL = ["sslmode", "sslrootcert", "sslcert", "sslkey", "ssl"] as const;

export type OpcoesDoBanco = {
  maximoConexoes?: number;
  /** PEM da autoridade certificadora já lido. Existe para o teste conseguir
   *  apontar para outra âncora sem depender de arquivo no disco. */
  ca?: string;
  /** Caminho do PEM. Vence o `sslrootcert` da string de conexão. */
  caminhoDaCa?: string;
  /**
   * Se `true`, uma URL sem modo verificado DERRUBA a montagem do pool em vez
   * de virar uma conexão cifrada e não autenticada.
   *
   * O padrão é "produção sim, o resto não", e não é preferência: o `compose`
   * local sobe um Postgres sem TLS, e exigir verificação ali quebraria o
   * ambiente de desenvolvimento para ninguém. Já em produção, a URL sem
   * `sslmode` é o defeito que reabriu este buraco depois de ele ter sido
   * fechado uma vez, então a checagem vive AQUI também, e não só em
   * `config.ts`: a trava do varredor (`push/trava.ts`) monta o próprio pool e
   * não passa pela validação de configuração.
   *
   * Lê `process.env` direto de propósito. A alternativa seria passar a
   * configuração por parâmetro em todos os pontos de chamada, e o dia em que
   * um deles esquecesse de passar seria o dia em que a verificação sumiria de
   * novo, em silêncio, que é exatamente a forma de falha que este arquivo
   * existe para não repetir.
   */
  exigirVerificacao?: boolean;
};

/**
 * Procura um caminho relativo subindo diretório por diretório.
 *
 * A alternativa seria um número fixo de `..`, e ele funcionaria hoje por
 * coincidência: `src/banco` e `dist/banco` têm a mesma profundidade até a raiz
 * do repositório. Coincidência de layout quebra em silêncio no dia em que
 * alguém mexe no `outDir` ou no `COPY` da imagem, e quebra do lado errado:
 * ficaríamos sem CA num ambiente que precisa dela.
 */
function procurarAcima(relativo: string, partida: string): string | null {
  let atual = partida;
  // Oito níveis cobrem com folga tanto o repositório quanto `/app` na imagem.
  for (let i = 0; i < 8; i += 1) {
    const tentativa = join(atual, relativo);
    if (existsSync(tentativa)) return tentativa;
    const pai = dirname(atual);
    if (pai === atual) break;
    atual = pai;
  }
  return null;
}

const DAQUI = dirname(fileURLToPath(import.meta.url));

/**
 * Onde está a CA, e o PEM lido.
 *
 * Falta de CA no modo verificado DERRUBA a partida, e é o comportamento certo:
 * o caminho oposto seria conectar sem verificar, que é exatamente o estado do
 * qual estamos saindo. Servidor que sobe pela metade é pior que servidor que
 * não sobe, porque parece que funcionou.
 */
function lerCa(caminhoPedido: string | null): { caminho: string; pem: string } {
  const candidatos: string[] = [];
  if (caminhoPedido) {
    candidatos.push(isAbsolute(caminhoPedido) ? caminhoPedido : resolve(process.cwd(), caminhoPedido));
    if (!isAbsolute(caminhoPedido)) {
      const acima = procurarAcima(caminhoPedido, process.cwd());
      if (acima) candidatos.push(acima);
    }
  } else {
    // Sem pedido explícito, vale a convenção do repositório, procurada a
    // partir deste módulo (serve para `src` e para `dist`) e depois a partir
    // de quem chamou.
    for (const partida of [DAQUI, process.cwd()]) {
      const achado = procurarAcima(CA_DO_PROVEDOR, partida);
      if (achado) candidatos.push(achado);
    }
  }

  for (const caminho of candidatos) {
    if (!existsSync(caminho)) continue;
    const pem = readFileSync(caminho, "utf8");
    if (!pem.includes("BEGIN CERTIFICATE")) {
      throw new Error(
        `O arquivo de autoridade certificadora em ${caminho} não é um PEM: ` +
        "falta a linha BEGIN CERTIFICATE. Baixe de novo o certificado do " +
        "provedor, em Settings > Database > SSL configuration.",
      );
    }
    return { caminho, pem };
  }

  throw new Error(
    "A conexão com o banco está no modo verificado e não há autoridade " +
    `certificadora para verificar contra. Procurado: ${
      candidatos.length > 0 ? candidatos.join(", ") : caminhoPedido ?? CA_DO_PROVEDOR
    }. ` +
    `Coloque o certificado do provedor em ${CA_DO_PROVEDOR}, ou aponte o ` +
    "caminho em `sslrootcert` na DATABASE_URL. Sem ele a conexão seria " +
    "cifrada mas não autenticada, que é o defeito que este modo existe para " +
    "fechar.",
  );
}

/**
 * Monta a configuração do pool a partir da string de conexão.
 *
 * Está separada de `bancoPostgres` porque é ela que carrega a decisão de
 * segurança, e decisão de segurança precisa de teste que não dependa de banco
 * nenhum de pé.
 */
export function montarConfiguracaoDoPool(url: string, opcoes: OpcoesDoBanco = {}): pg.PoolConfig {
  const comum = {
    max: opcoes.maximoConexoes ?? 10,
    // Conexão pendurada é conexão que some do pool sem avisar.
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  };

  const endereco = new URL(url);
  const modo = endereco.searchParams.get("sslmode");
  const verificado = urlDoBancoVerifica(url);

  /*
    Sem modo verificado em produção, o pool NÃO NASCE.

    Este é o ramo que reabriu o buraco. Até aqui, uma URL sem `sslmode` caía
    silenciosamente no `return` lá embaixo, com a string crua e sem objeto
    `ssl` nenhum, e o processo subia respondendo a tudo. Nada em log, nada em
    health check, e a única evidência do problema estaria na rede de outra
    pessoa. Ver `tls.ts` para o cenário completo.
  */
  const exigir = opcoes.exigirVerificacao ?? process.env["NODE_ENV"] === "production";
  if (!verificado && exigir) {
    throw new Error(mensagemDeUrlSemVerificacao("A string de conexão do banco", url));
  }

  if (!verificado) {
    /*
      A CA só entra quando a string pede verificação, e o contrário é erro de
      quem configurou, não escolha nossa: passar a âncora e deixar
      `sslmode=no-verify` na URL produz um servidor que parece verificar e não
      verifica. Esse mal-entendido é o que precisa fazer barulho, porque ele
      não aparece em nenhum log nem em nenhuma tela.
    */
    if (opcoes.ca || opcoes.caminhoDaCa) {
      throw new Error(
        `Foi passada uma autoridade certificadora, mas a DATABASE_URL está em sslmode=${modo ?? "ausente"}, ` +
        "que não verifica nada. Use sslmode=verify-full, ou tire a CA. " +
        "A combinação atual daria uma conexão cifrada e não autenticada com " +
        "cara de conexão segura.",
      );
    }
    return { connectionString: url, ...comum };
  }

  const ca = opcoes.ca ?? lerCa(opcoes.caminhoDaCa ?? endereco.searchParams.get("sslrootcert")).pem;

  for (const parametro of PARAMETROS_DE_SSL) endereco.searchParams.delete(parametro);

  return {
    connectionString: endereco.toString(),
    // `rejectUnauthorized` explícito, e não pelo padrão do Node: quem lê esta
    // linha precisa ver a decisão, não deduzir de um padrão que pode mudar.
    // Com ele ligado o Node confere a cadeia E o nome do host, e o servidor da
    // Supabase apresenta `*.pooler.supabase.com` assinado pela raiz de 2021.
    ssl: { ca, rejectUnauthorized: true },
    ...comum,
  };
}

/**
 * Implementação de produção, sobre um pool do `pg`.
 *
 * O ponto que importa: `pool.connect()` retira um cliente do pool e ele só
 * volta no `release()`, depois do COMMIT. Enquanto a transação existe, aquela
 * conexão é exclusiva desta requisição, e o `SET LOCAL` não tem como escapar
 * para outra. É o mesmo invariante que o Postgres em WebAssembly precisa de um
 * mutex para garantir, aqui obtido de graça pelo pool.
 *
 * O TLS fica em `montarConfiguracaoDoPool` porque, até 09/09/2026, aqui só se
 * repassava a `connectionString`, e a string dizia `sslmode=no-verify`. Quem
 * se colocasse entre o Fly (gru) e o Supabase (sa-east-1) apresentava
 * certificado próprio e a conexão subia igual: o SCRAM não protege desse caso,
 * porque o intermediário só retransmite o desafio e a resposta. O que estava
 * exposto era a base de todos os municípios, para ler e para escrever.
 */
export function bancoPostgres(url: string, opcoes: OpcoesDoBanco = {}): Banco {
  const pool = new pg.Pool(montarConfiguracaoDoPool(url, opcoes));

  async function emTransacao<T>(
    organizacaoId: string | null,
    execucao: (c: Consulta) => Promise<T>,
  ): Promise<T> {
    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN");
      await cliente.query("SET LOCAL ROLE dc360_app");
      if (organizacaoId) {
        await cliente.query("SELECT set_config('app.organizacao_atual', $1, true)", [organizacaoId]);
      }
      const resultado = await execucao(cliente as unknown as Consulta);
      await cliente.query("COMMIT");
      return resultado;
    } catch (erro) {
      await cliente.query("ROLLBACK").catch(() => undefined);
      throw erro;
    } finally {
      cliente.release();
    }
  }

  return {
    comTenant: (organizacaoId, execucao) => emTransacao(organizacaoId, execucao),
    semTenant: (execucao) => emTransacao(null, execucao),
    encerrar: () => pool.end(),
  };
}
