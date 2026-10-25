import { X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import tls from "node:tls";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CA_DO_PROVEDOR, bancoPostgres, montarConfiguracaoDoPool } from "../src/banco/postgres.js";
import { gerarCertificadoAutoassinado } from "./openssl-do-teste.js";

/**
 * A conexão com o banco confere COM QUEM está falando.
 *
 * Até 09/09/2026 não conferia: a DATABASE_URL dizia `sslmode=no-verify` e o
 * pool só repassava a string. Cifrado e não autenticado é uma combinação que
 * parece segura e não é: quem se posicionasse entre o Fly (gru) e o Supabase
 * (sa-east-1) apresentava certificado próprio, e o SCRAM não acusa nada,
 * porque o intermediário apenas retransmite o desafio e a resposta. O que
 * ficava exposto era a base de TODOS os municípios, para ler e para escrever.
 *
 * Por isso os casos daqui não param em conferir campos de configuração. O
 * caso que fecha a frente é o do impostor: um servidor local que fala o
 * suficiente do protocolo do Postgres para pedir TLS e apresenta um
 * certificado próprio, exatamente como faria o intermediário. Ele PRECISA ser
 * recusado.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CA_SUPABASE = readFileSync(join(RAIZ, CA_DO_PROVEDOR), "utf8");

/** Só as credenciais mudam de lugar; o que se testa é o TLS. */
const url = (parametros: string, hospedeiro = "banco.exemplo:5432") =>
  `postgresql://dc360_api:senha@${hospedeiro}/postgres${parametros}`;

/** O que o `pg` REALMENTE vai usar, depois do merge interno dele. */
function sslQueChegaNoDriver(configuracao: pg.ClientConfig): Record<string, unknown> {
  const cliente = new pg.Client(configuracao) as unknown as {
    connectionParameters: { ssl: Record<string, unknown> };
  };
  return cliente.connectionParameters.ssl;
}

// ---------------------------------------------------------------------------
// Um servidor que finge ser Postgres, para o certificado dele ser recusado.
// ---------------------------------------------------------------------------

/** Pedido de TLS do protocolo do Postgres: tamanho 8 e o código mágico. */
const PEDIDO_DE_TLS = 80877103;

/** ErrorResponse do protocolo, para o caso feliz terminar em erro DO BANCO. */
function erroDoProtocolo(): Buffer {
  const campos = Buffer.concat([
    Buffer.from("SFATAL\0", "utf8"),
    Buffer.from("VFATAL\0", "utf8"),
    Buffer.from("C28000\0", "utf8"),
    Buffer.from("Msou um impostor, mas o TLS passou\0", "utf8"),
    Buffer.from([0]),
  ]);
  const cabecalho = Buffer.alloc(5);
  cabecalho.write("E", 0, "latin1");
  cabecalho.writeInt32BE(campos.length + 4, 1);
  return Buffer.concat([cabecalho, campos]);
}

type Impostor = { porta: number; encerrar: () => Promise<void> };

function subirImpostor(chave: string, certificado: string): Promise<Impostor> {
  const servidor = net.createServer((socket) => {
    socket.on("error", () => undefined);
    socket.once("data", (pedido) => {
      if (pedido.length !== 8 || pedido.readInt32BE(4) !== PEDIDO_DE_TLS) {
        socket.destroy();
        return;
      }
      // "S" de sim, pode cifrar. É aqui que o intermediário real também diria
      // que sim, e a partir daqui só o certificado separa um do outro.
      socket.write("S");
      const seguro = new tls.TLSSocket(socket, {
        isServer: true, key: chave, cert: certificado,
      });
      seguro.on("error", () => undefined);
      // A primeira mensagem depois do handshake é o StartupMessage do cliente.
      seguro.once("data", () => seguro.end(erroDoProtocolo()));
    });
  });
  return new Promise((resolver) => {
    servidor.listen(0, "127.0.0.1", () => {
      const endereco = servidor.address() as net.AddressInfo;
      resolver({
        porta: endereco.port,
        encerrar: () => new Promise((pronto) => servidor.close(() => pronto())),
      });
    });
  });
}

let pasta: string;
let certificadoDoImpostor: string;
let impostor: Impostor;

beforeAll(async () => {
  pasta = mkdtempSync(join(tmpdir(), "dc360-tls-"));
  // Autoassinado e com o nome `localhost`, que é como o intermediário se
  // apresentaria: um certificado tecnicamente válido, emitido por ninguém.
  // O gerador tira do ambiente do `openssl` um OPENSSL_CONF que aponta para
  // arquivo inexistente (V2-F00-E21); sem isso, nesta suíte os 13 casos viravam
  // "pulados" na máquina de quem tem o driver ODBC do PostgreSQL instalado.
  const gerado = gerarCertificadoAutoassinado(pasta);
  if (gerado.motivo) console.warn(`banco-tls: ${gerado.motivo}.`);
  certificadoDoImpostor = gerado.certificado;
  impostor = await subirImpostor(gerado.chave, certificadoDoImpostor);
}, 60_000);

afterAll(async () => {
  await impostor?.encerrar();
  if (pasta) rmSync(pasta, { recursive: true, force: true });
});

describe("Certificado do banco: o que chega no driver", () => {
  it("a CA sobrevive ao merge interno do pg", () => {
    const configuracao = montarConfiguracaoDoPool(url("?sslmode=verify-full"), { ca: CA_SUPABASE });
    const ssl = sslQueChegaNoDriver(configuracao);

    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.ca).toBe(CA_SUPABASE);
    // A string parou de opinar sobre TLS, senão ela venceria o objeto.
    expect(String(configuracao.connectionString)).not.toContain("sslmode");
  });

  it("a maneira ingenua de fazer isto nao faz nada, e e por isso que a funcao existe", () => {
    /*
      Este caso não testa o nosso código: testa o `pg`, e existe para
      documentar a armadilha. `ConnectionParameters` faz
      `Object.assign({}, config, parse(config.connectionString))`, e o `parse`
      cria um `ssl` próprio ao ver `sslmode`. O objeto que a gente passa é o
      PERDEDOR desse merge.

      Ou seja: escrever `{ connectionString, ssl: { ca, rejectUnauthorized } }`,
      que é o que qualquer pessoa escreveria, entrega ao driver um TLS sem
      âncora nenhuma. E com a string em `no-verify`, entrega verificação
      desligada, em silêncio.
    */
    const ingenuo = { ssl: { ca: CA_SUPABASE, rejectUnauthorized: true } };

    const comVerifyFull = sslQueChegaNoDriver({
      connectionString: url("?sslmode=verify-full"), ...ingenuo,
    });
    expect(comVerifyFull.ca).toBeUndefined();

    const comNoVerify = sslQueChegaNoDriver({
      connectionString: url("?sslmode=no-verify"), ...ingenuo,
    });
    expect(comNoVerify.ca).toBeUndefined();
    expect(comNoVerify.rejectUnauthorized).toBe(false);
  });

  it("recusa subir no modo verificado quando a CA nao existe", () => {
    expect(() => montarConfiguracaoDoPool(
      url("?sslmode=verify-full"), { caminhoDaCa: "/nao/existe/prod-ca.crt" },
    )).toThrow(/autoridade certificadora/i);
  });

  it("recusa CA junto de um modo que nao verifica, porque isso e ilusao de seguranca", () => {
    expect(() => montarConfiguracaoDoPool(
      url("?sslmode=no-verify"), { ca: CA_SUPABASE },
    )).toThrow(/no-verify/);
  });

  it("nao mexe na string quando ninguem pediu verificacao", () => {
    // O compose local sobe um Postgres sem TLS. Ligar verificação ali seria
    // quebrar o ambiente de desenvolvimento para ninguém.
    const semTls = url("");
    const configuracao = montarConfiguracaoDoPool(semTls);
    expect(configuracao.connectionString).toBe(semTls);
    expect(configuracao.ssl).toBeUndefined();
  });

  it("acha sozinha a CA do provedor, no mesmo caminho que o Dockerfile copia", () => {
    const configuracao = montarConfiguracaoDoPool(url("?sslmode=verify-full"));
    expect((configuracao.ssl as { ca: string }).ca).toBe(CA_SUPABASE);
  });

  it("o certificado guardado e a raiz da Supabase, e esta dentro da validade", () => {
    const raiz = new X509Certificate(CA_SUPABASE);
    expect(raiz.subject).toContain("Supabase Root 2021 CA");
    // Certificado vencido no repositório derrubaria a API na renovação, e o
    // sintoma (nenhuma conexão abre) não aponta para o arquivo.
    expect(new Date(raiz.validTo).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("Certificado do banco: contra um servidor que apresenta o proprio", () => {
  it("recusa o impostor quando o modo verificado esta ligado", async () => {
    const banco = bancoPostgres(
      url("?sslmode=verify-full", `localhost:${impostor.porta}`),
      { ca: CA_SUPABASE },
    );
    try {
      const erro = await banco.semTenant(async (c) => c.query("SELECT 1")).catch((e) => e);
      // Antes desta correção, este handshake PASSAVA: a conexão subia cifrada
      // com um estranho, e o erro só apareceria depois, na autenticação.
      expect(erro).toBeInstanceOf(Error);
      expect([
        "SELF_SIGNED_CERT_IN_CHAIN",
        "DEPTH_ZERO_SELF_SIGNED_CERT",
        "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      ]).toContain((erro as NodeJS.ErrnoException).code);
    } finally {
      await banco.encerrar().catch(() => undefined);
    }
  }, 30_000);

  it("aceita o mesmo servidor quando a CA e a dele, e ai quem recusa e o banco", async () => {
    // O contraponto obrigatório: sem ele, um `ssl` quebrado que recusasse tudo
    // passaria no caso de cima e ninguém notaria até o deploy.
    const banco = bancoPostgres(
      url("?sslmode=verify-full", `localhost:${impostor.porta}`),
      { ca: certificadoDoImpostor },
    );
    try {
      const erro = await banco.semTenant(async (c) => c.query("SELECT 1")).catch((e) => e);
      expect((erro as { code?: string }).code).toBe("28000");
      expect(String((erro as Error).message)).toContain("o TLS passou");
    } finally {
      await banco.encerrar().catch(() => undefined);
    }
  }, 30_000);
});

/**
 * O buraco que voltou por omissão de uma palavra.
 *
 * Os casos acima provam que, COM `sslmode=verify-full`, a conexão confere o
 * certificado. Nenhum deles provava o caso que uma revisão adversarial
 * reproduziu em 09/09/2026: a URL SEM `sslmode` nenhum.
 *
 * Ali `montarConfiguracaoDoPool` caía no ramo "ninguém pediu verificação",
 * devolvia a string crua sem objeto `ssl`, e a API subia calada, respondendo a
 * tudo, com a base de todos os municípios trafegando cifrada e NÃO
 * autenticada. E a palavra `verify-full` não existia em nenhum arquivo que o
 * operador lê: nem no `fly.toml`, nem na tabela de variáveis obrigatórias do
 * `COLOCAR-DE-PE.md`, nem no `.env.example`, nem no README. Ela vivia só no
 * `.env` local, que o git ignora, e nestes testes.
 *
 * Bastava então provisionar o segundo município colando a URL que o painel do
 * provedor oferece, que não traz `sslmode`, para reabrir por inteiro o defeito
 * que este arquivo diz ter fechado, e `docs/PRIVACIDADE.md` continuava
 * afirmando como fato que a conexão é verificada.
 */
describe("DATABASE_URL sem verificacao nao sobe", () => {
  /** O que o painel do provedor entrega, sem uma palavra sobre TLS. */
  const COMO_O_PROVEDOR_ENTREGA = "postgres://dc360_api.refprodxxxxxxxx:senha@db.projeto.supabase.com:5432/postgres";

  function producao(sobrescrever: Record<string, string> = {}): NodeJS.ProcessEnv {
    return {
      NODE_ENV: "production",
      DATABASE_URL: `${COMO_O_PROVEDOR_ENTREGA}?sslmode=verify-full`,
      JWT_SEGREDO: "segredo-de-producao-com-mais-de-trinta-e-dois-bytes",
      ORIGENS_PERMITIDAS: "https://painel.serraalta.mg.gov.br",
      URL_PUBLICA: "https://api.dc360.exemplo.br",
      URL_PAINEL: "https://painel.serraalta.mg.gov.br",
      S3_ENDPOINT: "https://balde.exemplo.com",
      S3_BALDE: "dc360-evidencias",
      S3_CHAVE_ID: "chave-de-acesso",
      S3_CHAVE_SECRETA: "segredo-de-acesso",
      RECUPERACAO_ATIVA: "nao",
      // O contrato de ambiente (V2-F01-E09): as três declarações não secretas.
      AMBIENTE_DC360: "prod",
      IDENTIDADE_DO_BANCO: "refprodxxxxxxxx",
      DOMINIO_DO_AMBIENTE: "serraalta.mg.gov.br",
      ...sobrescrever,
    } as NodeJS.ProcessEnv;
  }

  it("uma producao com verify-full sobe", async () => {
    // Âncora: sem ela, um erro no molde faria os casos abaixo passarem pelo
    // motivo errado, que é como esta defesa some sem ninguém ver.
    const { carregarConfig } = await import("../src/config.js");
    expect(() => carregarConfig(producao())).not.toThrow();
  });

  it("a partida recusa a URL que o painel do provedor entrega", async () => {
    const { carregarConfig } = await import("../src/config.js");

    expect(
      () => carregarConfig(producao({ DATABASE_URL: COMO_O_PROVEDOR_ENTREGA })),
      "produção subiu com a DATABASE_URL sem sslmode: a conexão com o banco "
      + "voltaria a ser cifrada e não autenticada, em silêncio",
    ).toThrow(/sslmode=verify-full/);

    // E os modos que NÃO verificam são recusados pelo nome, um a um: cada um
    // deles é uma forma de a URL parecer que trata de TLS sem tratar.
    for (const modo of ["no-verify", "disable", "prefer", "allow"]) {
      expect(
        () => carregarConfig(producao({ DATABASE_URL: `${COMO_O_PROVEDOR_ENTREGA}?sslmode=${modo}` })),
        `produção subiu com sslmode=${modo}`,
      ).toThrow(/sslmode=verify-full/);
    }
  });

  it("o pool recusa nascer sem verificacao, e nao so a partida", () => {
    /*
      A trava do varredor (`push/trava.ts`) monta o próprio pool e NÃO passa
      por `carregarConfig`. Se a checagem morasse só na partida, esse caminho
      abriria uma conexão sem âncora contra o mesmo banco.
    */
    expect(() => montarConfiguracaoDoPool(url(""), { exigirVerificacao: true }))
      .toThrow(/sslmode=verify-full/);
    expect(() => montarConfiguracaoDoPool(url("?sslmode=no-verify"), { exigirVerificacao: true }))
      .toThrow(/sslmode=verify-full/);

    // E o desenvolvimento continua subindo: o `compose` local tem um Postgres
    // sem TLS, e exigir verificação ali quebraria o ambiente para ninguém.
    expect(() => montarConfiguracaoDoPool(url(""), { exigirVerificacao: false })).not.toThrow();
  });

  it("verify-full esta escrito onde o operador le", () => {
    /*
      Este caso não testa código, e é de propósito. O defeito não foi uma
      linha errada: foi uma palavra ausente de todo arquivo que alguém abre na
      hora de subir o segundo município. Enquanto a instrução não estiver
      escrita, a próxima pessoa cola a URL do painel do provedor de novo.
    */
    for (const relativo of [
      "fly.toml",
      "docs/COLOCAR-DE-PE.md",
      "apps/api/.env.example",
      "README.md",
    ]) {
      const conteudo = readFileSync(join(RAIZ, relativo), "utf8");
      expect(conteudo, `${relativo} não diz sslmode=verify-full em lugar nenhum`)
        .toContain("sslmode=verify-full");
    }
  });
});
