import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * O `openssl` que os testes de TLS chamam, sem herdar configuração quebrada.
 *
 * Existe pela V2-F00-E21. O instalador do driver ODBC do PostgreSQL no Windows
 * grava `OPENSSL_CONF` apontando para `...\psqlODBC\etc\openssl.cnf`, e o
 * arquivo não existe. O `openssl req` lê a variável, não acha o arquivo e sai
 * com erro antes de gerar a chave. O efeito era o `beforeAll` de
 * `banco-tls.test.ts` cair e os 13 casos aparecerem como pulados: justamente a
 * suíte que prova que a API recusa um intermediário com certificado próprio
 * deixava de rodar, e só na máquina de quem tinha o driver instalado.
 *
 * A regra é estreita de propósito. A variável só sai do ambiente do processo
 * filho quando aponta para um arquivo que NÃO existe: aí ela não configura
 * nada, só quebra. Quando aponta para um arquivo que existe, alguém a pôs lá
 * por um motivo, e o teste a respeita. O ambiente do próprio processo de teste
 * nunca é alterado.
 */

/** Nome da variável. No Windows o ambiente ignora caixa, então compara-se sem ela. */
const VARIAVEL = "OPENSSL_CONF";

export type AmbienteDoOpenssl = { ambiente: NodeJS.ProcessEnv; motivo?: string };

export function ambienteDoOpenssl(
  ambiente: NodeJS.ProcessEnv,
  existe: (caminho: string) => boolean = existsSync,
): AmbienteDoOpenssl {
  const chave = Object.keys(ambiente).find((k) => k.toUpperCase() === VARIAVEL);
  const valor = chave === undefined ? undefined : ambiente[chave];
  if (chave === undefined || !valor || existe(valor)) return { ambiente: { ...ambiente } };

  const limpo = { ...ambiente };
  delete limpo[chave];
  return {
    ambiente: limpo,
    motivo: `${VARIAVEL} aponta para "${valor}", que não existe; o openssl do teste roda sem a variável`,
  };
}

/**
 * Onde está o `openssl`, ou `null` se não está em lugar nenhum que se saiba.
 *
 * No Git Bash ele está no PATH (vem com o Git for Windows). No PowerShell, na
 * mesma máquina, não está: o PATH do Windows tem `Git\cmd`, onde mora o
 * `git.exe`, e não `Git\usr\bin` nem `Git\mingw64\bin`, onde mora o
 * `openssl.exe`. Então, só no Windows e só quando o PATH não resolve, ele é
 * procurado ao lado do `git` que o PATH acha. Nenhum caminho fixo de
 * instalação: se o Git estiver noutro disco, é de lá que vem.
 */
export function localizarOpenssl(
  ambiente: NodeJS.ProcessEnv,
  plataforma: NodeJS.Platform = process.platform,
  existe: (caminho: string) => boolean = existsSync,
): string | null {
  const chavePath = Object.keys(ambiente).find((k) => k.toUpperCase() === "PATH");
  const pastas = (chavePath ? ambiente[chavePath] ?? "" : "").split(plataforma === "win32" ? ";" : ":").filter(Boolean);
  const nome = plataforma === "win32" ? "openssl.exe" : "openssl";
  if (pastas.some((p) => existe(join(p, nome)))) return "openssl";
  if (plataforma !== "win32") return null;
  for (const pasta of pastas) {
    if (!existe(join(pasta, "git.exe"))) continue;
    for (const ao of [join(pasta, "..", "usr", "bin", nome), join(pasta, "..", "mingw64", "bin", nome)]) {
      if (existe(ao)) return ao;
    }
  }
  return null;
}

export type CertificadoGerado = { chave: string; certificado: string; motivo?: string };

/**
 * Gera chave e certificado autoassinado para `localhost` em `pasta`.
 *
 * O motivo de ter tirado a variável volta junto, para quem chamou imprimir: um
 * ajuste de ambiente que acontece calado é um ajuste que ninguém audita.
 */
export function gerarCertificadoAutoassinado(
  pasta: string,
  ambiente: NodeJS.ProcessEnv = process.env,
): CertificadoGerado {
  const chave = join(pasta, "impostor.key");
  const certificado = join(pasta, "impostor.crt");
  const preparado = ambienteDoOpenssl(ambiente);
  const openssl = localizarOpenssl(ambiente);
  // Sem `openssl` a suíte REPROVA, com a frase que diz o que instalar. Pular
  // seria esconder justamente o caso do intermediário com certificado próprio.
  if (openssl === null) {
    throw new Error("o openssl não está no PATH (nem ao lado do git, no Windows): instale-o para rodar os testes de TLS do banco");
  }
  execFileSync(openssl, [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", chave, "-out", certificado,
    "-days", "3650", "-subj", "/CN=localhost",
    "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
  ], { stdio: "ignore", env: preparado.ambiente });
  return {
    chave: readFileSync(chave, "utf8"),
    certificado: readFileSync(certificado, "utf8"),
    motivo: preparado.motivo,
  };
}
