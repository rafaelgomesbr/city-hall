import { X509Certificate } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ambienteDoOpenssl, gerarCertificadoAutoassinado, localizarOpenssl } from "./openssl-do-teste.js";

/**
 * O ajuste de ambiente que deixou `banco-tls.test.ts` rodar (V2-F00-E21).
 *
 * Os casos de baixo provam as duas metades da regra: a variável quebrada sai, e
 * a variável válida fica. A segunda metade importa tanto quanto a primeira. Um
 * gerador que sempre jogasse a variável fora também faria a suíte de TLS
 * passar, e passaria por cima de uma configuração que alguém pôs de propósito.
 */

const pastas: string[] = [];
function pastaNova(): string {
  const pasta = mkdtempSync(join(tmpdir(), "dc360-openssl-"));
  pastas.push(pasta);
  return pasta;
}
afterAll(() => {
  for (const pasta of pastas) rmSync(pasta, { recursive: true, force: true });
});

/** Ambiente do processo sem nenhuma grafia de OPENSSL_CONF, para os casos montarem o seu. */
function ambienteSemAVariavel(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([k]) => k.toUpperCase() !== "OPENSSL_CONF"),
  );
}

describe("Qual OPENSSL_CONF chega no openssl do teste", () => {
  it("tira a variável que aponta para arquivo inexistente, e diz por quê", () => {
    const r = ambienteDoOpenssl({ PATH: "x", OPENSSL_CONF: "C:\\nao\\existe\\openssl.cnf" }, () => false);
    expect(r.ambiente).toEqual({ PATH: "x" });
    expect(r.motivo).toContain("C:\\nao\\existe\\openssl.cnf");
    expect(r.motivo).toContain("não existe");
  });

  it("mantém a variável que aponta para arquivo que existe, sem motivo", () => {
    const r = ambienteDoOpenssl({ PATH: "x", OPENSSL_CONF: "/etc/ssl/openssl.cnf" }, () => true);
    expect(r.ambiente).toEqual({ PATH: "x", OPENSSL_CONF: "/etc/ssl/openssl.cnf" });
    expect(r.motivo).toBeUndefined();
  });

  it("sem a variável, o ambiente passa igual", () => {
    const r = ambienteDoOpenssl({ PATH: "x" }, () => false);
    expect(r.ambiente).toEqual({ PATH: "x" });
    expect(r.motivo).toBeUndefined();
  });

  it("acha a variável em qualquer caixa, porque no Windows o nome não distingue", () => {
    const r = ambienteDoOpenssl({ PATH: "x", openssl_conf: "C:\\sumiu.cnf" }, () => false);
    expect(r.ambiente).toEqual({ PATH: "x" });
    expect(r.motivo).toBeDefined();
  });

  it("não mexe no ambiente de quem chamou", () => {
    const original = { OPENSSL_CONF: "C:\\sumiu.cnf" };
    ambienteDoOpenssl(original, () => false);
    expect(original).toEqual({ OPENSSL_CONF: "C:\\sumiu.cnf" });
  });
});

describe("Onde o teste acha o openssl", () => {
  /** Disco falso: só os caminhos listados existem. */
  const disco = (...caminhos: string[]) => (c: string) => caminhos.includes(c);

  it("usa o do PATH quando ele está lá", () => {
    const pasta = join("x", "bin");
    expect(localizarOpenssl({ PATH: pasta }, "linux", disco(join(pasta, "openssl")))).toBe("openssl");
  });

  it("no Windows sem openssl no PATH, acha o que vem ao lado do git (o caso do PowerShell)", () => {
    const gitCmd = join("D:", "Git", "cmd");
    const aoLado = join(gitCmd, "..", "usr", "bin", "openssl.exe");
    expect(localizarOpenssl({ Path: `C:\\Windows;${gitCmd}` }, "win32", disco(join(gitCmd, "git.exe"), aoLado))).toBe(aoLado);
  });

  it("sem openssl em lugar nenhum devolve null, e o gerador reprova dizendo o que instalar", () => {
    expect(localizarOpenssl({ PATH: join("x", "bin") }, "linux", disco())).toBeNull();
    expect(localizarOpenssl({ Path: join("D:", "Git", "cmd") }, "win32", disco())).toBeNull();
    expect(() => gerarCertificadoAutoassinado(pastaNova(), { PATH: "" })).toThrow(/openssl não está no PATH/);
  });
});

describe("O openssl de verdade, com cada ambiente", () => {
  it("gera o certificado com OPENSSL_CONF apontando para arquivo inexistente", () => {
    const pasta = pastaNova();
    const inexistente = join(pasta, "nao-existe", "openssl.cnf");
    const gerado = gerarCertificadoAutoassinado(pasta, { ...ambienteSemAVariavel(), OPENSSL_CONF: inexistente });

    expect(gerado.motivo).toContain(inexistente);
    const certificado = new X509Certificate(gerado.certificado);
    expect(certificado.subject).toContain("CN=localhost");
    expect(certificado.checkHost("localhost")).toBe("localhost");
  });

  it("respeita OPENSSL_CONF válido: a extensão que ele pede vai para o certificado", () => {
    /*
      A configuração pede duas coisas: `CA:FALSE` e um uso estendido de chave
      (e-mail, OID 1.3.6.1.5.5.7.3.4) que nenhum `openssl req -x509` põe por
      conta própria. O uso estendido é a prova de qual configuração foi lida, e
      vale igual no OpenSSL 3 e no LibreSSL: com a variável ele aparece, sem ela
      não.

      O campo `ca` SEM a variável fica de fora de propósito. Ele não depende da
      versão nem da família do `openssl`, e sim do `openssl.cnf` padrão da
      máquina: quando esse arquivo manda `x509_extensions = v3_ca` (o das
      distribuições do OpenSSL), o autoassinado sai como CA; o do macOS não manda
      e sai sem a extensão; o LibreSSL com `v3_ca` também marca CA. Afirmar o
      `ca` sem configuração provaria o arquivo da máquina, não o que este caso
      promete. Com a variável válida, `ca` falso é a configuração do teste
      chegando ao certificado.
    */
    const USO_ESTENDIDO_DE_EMAIL = "1.3.6.1.5.5.7.3.4";
    const pasta = pastaNova();
    const configuracao = join(pasta, "openssl.cnf");
    writeFileSync(configuracao, [
      "[req]", "distinguished_name = dn", "x509_extensions = ext",
      "[dn]", "[ext]", "basicConstraints = critical,CA:FALSE", `extendedKeyUsage = ${USO_ESTENDIDO_DE_EMAIL}`, "",
    ].join("\n"));

    const comAVariavel = gerarCertificadoAutoassinado(pasta, { ...ambienteSemAVariavel(), OPENSSL_CONF: configuracao });
    expect(comAVariavel.motivo).toBeUndefined();
    const lidoComAVariavel = new X509Certificate(comAVariavel.certificado);
    expect(lidoComAVariavel.keyUsage).toEqual([USO_ESTENDIDO_DE_EMAIL]);
    expect(lidoComAVariavel.ca).toBe(false);

    const semAVariavel = gerarCertificadoAutoassinado(pastaNova(), ambienteSemAVariavel());
    expect(new X509Certificate(semAVariavel.certificado).keyUsage).toBeUndefined();
  });
});
