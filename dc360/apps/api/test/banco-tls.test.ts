import { execFileSync } from "node:child_process";
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
  const chave = join(pasta, "impostor.key");
  const certificado = join(pasta, "impostor.crt");
  // Autoassinado e com o nome `localhost`, que é como o intermediário se
  // apresentaria: um certificado tecnicamente válido, emitido por ninguém.
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", chave, "-out", certificado,
    "-days", "3650", "-subj", "/CN=localhost",
    "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
  ], { stdio: "ignore" });
  certificadoDoImpostor = readFileSync(certificado, "utf8");
  impostor = await subirImpostor(readFileSync(chave, "utf8"), certificadoDoImpostor);
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
