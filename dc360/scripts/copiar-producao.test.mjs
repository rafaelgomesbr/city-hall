import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, parse, resolve } from "node:path";

import {
  CA_DO_PROVEDOR, COMO_INSTALAR, JANELA_DA_COPIA_MS, PASTA_DE_COPIAS, RAIZ_DO_REPO,
  argumentosDoPgDump, candidatosDePgDump, clienteServe, comandoDeAcl, comoInstalar, copiaRecente,
  localizarPgDump, montarUrlParaPgDump, nomeDaCopia, pastaDeCopias, razaoParaRecusarAPasta,
  restringirAoDono, usuarioDoWindows, versaoDoPgDump,
} from "./copiar-producao.mjs";
import { ErroDeUso } from "./producao.mjs";
import { decidirSobreACopia, fraseDaCopia, mensagemDeRecusaSemCopia } from "./migrar-producao.mjs";

/**
 * A cópia da produção antes de migrar, e o migrador que a exige.
 *
 * Nada aqui toca a produção, o chaveiro ou o `pg_dump` de verdade: as partes
 * que decidem são funções puras, e o que precisa de disco usa uma pasta
 * temporária com o relógio controlado por `utimes`.
 */

const MINUTO = 60_000;

/** Uma pasta de cópias de mentira, com arquivos datados à mão. */
function pastaComCopias(arquivos) {
  const pasta = mkdtempSync(join(tmpdir(), "dc360-copias-de-teste-"));
  for (const { nome, minutosAtras, bytes = 100 } of arquivos) {
    const caminho = join(pasta, nome);
    writeFileSync(caminho, Buffer.alloc(bytes, 1));
    const quando = new Date(Date.now() - minutosAtras * MINUTO);
    utimesSync(caminho, quando, quando);
  }
  return pasta;
}

test("o nome da copia traz a data, ordena por nome e nao tem dois-pontos", () => {
  const nome = nomeDaCopia(new Date("2026-09-15T19:30:00.123Z"));
  assert.equal(nome, "2026-09-15T19-30-00.dump");
  assert.doesNotMatch(nome, /:/);
  assert.ok(nomeDaCopia(new Date("2026-09-15T19:31:00Z")) > nome);
});

test("a copia mora fora do repositorio, e a pasta e a da casa de quem roda", () => {
  assert.equal(razaoParaRecusarAPasta(PASTA_DE_COPIAS), null);
  assert.ok(!PASTA_DE_COPIAS.startsWith(RAIZ_DO_REPO));
});

/*
  Os caminhos nascem da raiz da plataforma, e não de texto POSIX literal. Com
  "/Users/alguem" escrito à mão, o `resolve` do código vira "C:\Users\alguem"
  no Windows, deixa de começar pela raiz do repositório de mentira e de casar
  a Área de Trabalho, e a função devolvia `null` para os cinco lugares que ela
  existe para recusar. O teste reprovava no Windows por um motivo que não era
  o que ele protege, e um teste que reprova sempre num sistema deixa de ser
  lido nele. Montados com `join` a partir de `parse(...).root`, os mesmos
  lugares valem em "/" e em "C:\\".
*/
test("a pasta de copias recusa o repositorio, a nuvem de arquivos e a Area de Trabalho", () => {
  const raiz = parse(resolve(".")).root;
  const casa = join(raiz, "Users", "alguem");
  const naCasa = (...partes) => join(casa, ...partes);
  const opcoes = { raizDoRepo: naCasa("city-hall", "dc360"), casa };
  assert.match(razaoParaRecusarAPasta(naCasa("city-hall", "dc360", "copias"), opcoes), /repositório/);
  assert.match(razaoParaRecusarAPasta(naCasa("city-hall", "dc360"), opcoes), /repositório/);
  assert.match(razaoParaRecusarAPasta(naCasa("Library", "Mobile Documents", "com~apple~CloudDocs", "copias"), opcoes), /nuvem/);
  assert.match(razaoParaRecusarAPasta(naCasa("Dropbox", "dc360"), opcoes), /nuvem/);
  assert.match(razaoParaRecusarAPasta(naCasa("Google Drive", "dc360"), opcoes), /nuvem/);
  assert.match(razaoParaRecusarAPasta(naCasa("OneDrive", "dc360"), opcoes), /nuvem/);
  assert.match(razaoParaRecusarAPasta(naCasa("Desktop", "copias"), opcoes), /Área de Trabalho/);
  assert.equal(razaoParaRecusarAPasta(naCasa("dc360-copias"), opcoes), null);
});

test("a URL do pg_dump e a mesma do migrador, com a raiz do provedor apontada para o libpq verificar a cadeia", () => {
  const url = new URL(montarUrlParaPgDump("s3nh@"));
  assert.equal(url.searchParams.get("sslmode"), "verify-full");
  assert.equal(url.searchParams.get("sslrootcert"), CA_DO_PROVEDOR);
  assert.equal(url.port, "5432");
  assert.match(url.username, /^postgres\./);
  assert.equal(decodeURIComponent(url.password), "s3nh@");
});

test("a versao do pg_dump e lida da saida dele, e o cliente serve quando a maior e a do servidor ou mais nova", () => {
  assert.equal(versaoDoPgDump("pg_dump (PostgreSQL) 17.6"), "17.6");
  assert.equal(versaoDoPgDump("pg_dump (PostgreSQL) 18.0 (Homebrew)"), "18.0");
  assert.equal(versaoDoPgDump("pg_dump (PostgreSQL) 16"), "16");
  assert.equal(versaoDoPgDump("bash: pg_dump: command not found"), null);

  assert.equal(clienteServe("17.6", 17), true);
  assert.equal(clienteServe("18.0", 17), true);
  assert.equal(clienteServe("16.4", 17), false, "pg_dump mais velho que o servidor não serve");
  assert.equal(clienteServe(null, 17), false);
});

test("localizar o pg_dump tenta o PATH e os caminhos do Homebrew, e diz o que instalar quando nao acha", () => {
  const tentados = [];
  const soNoHomebrew = localizarPgDump({
    plataforma: "darwin",
    executar: (caminho) => {
      tentados.push(caminho);
      if (caminho === "/opt/homebrew/opt/libpq/bin/pg_dump") return "pg_dump (PostgreSQL) 17.6";
      throw new Error("ENOENT");
    },
  });
  assert.deepEqual(soNoHomebrew, { caminho: "/opt/homebrew/opt/libpq/bin/pg_dump", versao: "17.6" });
  assert.equal(tentados[0], "pg_dump", "o PATH vem primeiro");

  const nenhum = localizarPgDump({ executar: () => { throw new Error("ENOENT"); } });
  assert.equal(nenhum, null);
  assert.match(COMO_INSTALAR, /brew install libpq/);
  assert.match(COMO_INSTALAR, /pg_dump --version/);
});

test("a copia recente e a mais nova dentro da janela; fora dela, ou vazia, nao conta", () => {
  const pasta = pastaComCopias([
    { nome: "2026-09-15T10-00-00.dump", minutosAtras: 90 },
    { nome: "2026-09-15T11-10-00.dump", minutosAtras: 20 },
    { nome: "2026-09-15T11-25-00.dump", minutosAtras: 5, bytes: 0 },
    { nome: "anotacoes.txt", minutosAtras: 1 },
  ]);
  try {
    const achada = copiaRecente({ pasta, janelaMs: JANELA_DA_COPIA_MS });
    assert.ok(achada, "não achou a cópia de 20 minutos");
    assert.equal(achada.nome, "2026-09-15T11-10-00.dump", "a vazia de 5 minutos não vale, e o .txt não é cópia");
    assert.ok(achada.idadeMs > 19 * MINUTO && achada.idadeMs < 21 * MINUTO);

    assert.equal(copiaRecente({ pasta, janelaMs: 10 * MINUTO }), null, "com janela de 10 minutos, a de 20 não serve");
    assert.equal(copiaRecente({ pasta: join(pasta, "nao-existe") }), null);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

/* =====================================================================
 * O migrador: aplicar exige cópia recente, e pular fica registrado.
 * ===================================================================== */

test("conferir nao pergunta por copia", () => {
  const decisao = decidirSobreACopia({ argv: ["node", "migrar-producao.mjs"], ambiente: "prod", procurar: () => { throw new Error("não devia procurar"); } });
  assert.deepEqual(decisao, { situacao: "conferir" });
});

test("aplicar sem copia recente e RECUSADO, e a recusa ensina a tirar a copia e o escape", () => {
  const decisao = decidirSobreACopia({ argv: ["node", "migrar-producao.mjs", "--aplicar"], pasta: "/x/copias", procurar: () => null });
  assert.equal(decisao.situacao, "recusado");
  assert.equal(decisao.janelaMinutos, 30);
  const msg = mensagemDeRecusaSemCopia(decisao);
  assert.match(msg, /node scripts\/copiar-producao\.mjs/);
  assert.match(msg, /--sem-copia/);
  assert.match(msg, /30 minutos/);
});

test("aplicar com copia recente passa, e a conclusao nomeia a copia e a idade dela", () => {
  const copia = { caminho: "/x/copias/2026-09-15T11-10-00.dump", nome: "2026-09-15T11-10-00.dump", idadeMs: 20 * MINUTO, bytes: 100 };
  const decisao = decidirSobreACopia({ argv: ["node", "migrar-producao.mjs", "--aplicar"], ambiente: "prod", procurar: () => copia });
  assert.equal(decisao.situacao, "com_copia");
  const frase = fraseDaCopia(decisao);
  assert.match(frase, /2026-09-15T11-10-00\.dump/);
  assert.match(frase, /20 min/);
});

test("aplicar com --sem-copia passa, e a conclusao diz por extenso que a copia foi PULADA", () => {
  const decisao = decidirSobreACopia({ argv: ["node", "migrar-producao.mjs", "--aplicar", "--sem-copia"], ambiente: "prod", procurar: () => null });
  assert.equal(decisao.situacao, "pulada");
  assert.match(fraseDaCopia(decisao), /PULADA/);
  assert.match(fraseDaCopia(decisao), /decisão de quem rodou/);
});

test("com copia recente, --sem-copia nao apaga o registro: a copia que existe e a que vale", () => {
  const copia = { caminho: "/x/c.dump", nome: "c.dump", idadeMs: MINUTO, bytes: 100 };
  const decisao = decidirSobreACopia({ argv: ["node", "migrar-producao.mjs", "--aplicar", "--sem-copia"], ambiente: "prod", procurar: () => copia });
  assert.equal(decisao.situacao, "com_copia");
});

/* =====================================================================
 * V2-F01-E15: a extensao, os tres sistemas, a ACL do Windows e o ambiente.
 * ===================================================================== */

test("o pg_dump leva --extension=pg_trgm, sem o que o restore para no indice de busca desde a migracao 041", () => {
  const args = argumentosDoPgDump({ destino: "/x/c.dump", urlSemSenha: "postgresql://u@h:5432/postgres" });
  assert.ok(args.includes("--extension=pg_trgm"));
  assert.ok(args.includes("--format=custom"), "o formato do restore provado");
  assert.ok(args.includes("--schema=public"));
  assert.ok(args.includes("--file=/x/c.dump"));
  assert.equal(args.at(-1), "postgresql://u@h:5432/postgres", "a URL e o ultimo argumento");
});

test("a senha nunca vai na linha de comando do pg_dump", () => {
  const url = new URL(montarUrlParaPgDump("S3nh@-secreta"));
  const semSenha = new URL(url);
  semSenha.password = "";
  const args = argumentosDoPgDump({ destino: "/x/c.dump", urlSemSenha: semSenha.toString() });
  assert.ok(!args.join(" ").includes("secreta"));
  assert.ok(!args.join(" ").includes("S3nh"));
});

test("os candidatos de pg_dump seguem o sistema: Homebrew no macOS, PGDG no Linux, Program Files no Windows", () => {
  const mac = candidatosDePgDump({ plataforma: "darwin", env: {} });
  assert.deepEqual(mac.slice(0, 1), ["pg_dump"]);
  assert.ok(mac.includes("/opt/homebrew/opt/libpq/bin/pg_dump"));
  assert.ok(!mac.some((c) => c.includes("PostgreSQL")));

  const linux = candidatosDePgDump({ plataforma: "linux", env: {} });
  assert.ok(linux.includes("/usr/lib/postgresql/17/bin/pg_dump"), "Debian e Ubuntu");
  assert.ok(linux.includes("/usr/pgsql-17/bin/pg_dump"), "RHEL e Fedora");
  assert.ok(!linux.includes("/opt/homebrew/opt/libpq/bin/pg_dump"));

  const win = candidatosDePgDump({
    plataforma: "win32",
    env: { ProgramFiles: "D:\\Programas", "ProgramFiles(x86)": "C:\\Program Files (x86)" },
  });
  assert.ok(win.includes("D:\\Programas\\PostgreSQL\\17\\bin\\pg_dump.exe"));
  assert.ok(win.includes("C:\\Program Files (x86)\\PostgreSQL\\18\\bin\\pg_dump.exe"));
  assert.ok(win.every((c) => c === "pg_dump" || c.endsWith("pg_dump.exe")));
});

test("DC360_PG_DUMP vem antes do PATH, em qualquer sistema", () => {
  for (const plataforma of ["win32", "linux", "darwin"]) {
    const lista = candidatosDePgDump({ plataforma, env: { DC360_PG_DUMP: "/opt/meu/pg_dump" } });
    assert.equal(lista[0], "/opt/meu/pg_dump");
    assert.equal(lista[1], "pg_dump");
  }
});

test("no Linux e no Windows o pg_dump e achado no lugar padrao quando o PATH nao o tem", () => {
  const noLinux = localizarPgDump({
    plataforma: "linux",
    env: {},
    executar: (c) => {
      if (c === "/usr/lib/postgresql/17/bin/pg_dump") return "pg_dump (PostgreSQL) 17.6 (Ubuntu 17.6-1.pgdg24.04+1)";
      throw new Error("ENOENT");
    },
  });
  assert.deepEqual(noLinux, { caminho: "/usr/lib/postgresql/17/bin/pg_dump", versao: "17.6" });

  const noWindows = localizarPgDump({
    plataforma: "win32",
    env: { ProgramFiles: "C:\\Program Files" },
    executar: (c) => {
      if (c === "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe") return "pg_dump (PostgreSQL) 17.6";
      throw new Error("ENOENT");
    },
  });
  assert.equal(noWindows?.versao, "17.6");
});

test("a instrucao de instalar fala a lingua do sistema", () => {
  assert.match(comoInstalar("darwin"), /brew install libpq/);
  assert.match(comoInstalar("linux"), /postgresql-client-17/);
  assert.match(comoInstalar("linux"), /DC360_PG_DUMP/);
  assert.match(comoInstalar("win32"), /EDB/);
  assert.match(comoInstalar("win32"), /Program Files\\PostgreSQL\\17/);
  assert.doesNotMatch(comoInstalar("win32"), /brew/);
  assert.doesNotMatch(comoInstalar("linux"), /brew/);
});

test("no Windows a pasta e o arquivo ficam so do usuario por icacls, sem heranca", () => {
  assert.deepEqual(
    comandoDeAcl("C:\\Users\\rafa\\dc360-copias\\prod", "PC\\rafa", { pasta: true }),
    ["C:\\Users\\rafa\\dc360-copias\\prod", "/inheritance:r", "/grant:r", "PC\\rafa:(OI)(CI)F"],
  );
  assert.deepEqual(
    comandoDeAcl("C:\\x\\c.dump", "PC\\rafa"),
    ["C:\\x\\c.dump", "/inheritance:r", "/grant:r", "PC\\rafa:F"],
  );
  assert.equal(usuarioDoWindows({ env: { USERDOMAIN: "PC", USERNAME: "rafa" } }), "PC\\rafa");
  assert.equal(usuarioDoWindows({ env: {}, executar: () => "PC\\ana\r\n" }), "PC\\ana");

  const chamadas = [];
  restringirAoDono("C:\\x\\c.dump", {
    plataforma: "win32",
    env: { USERDOMAIN: "PC", USERNAME: "rafa" },
    executar: (cmd, args) => { chamadas.push([cmd, args]); return ""; },
    chmod: () => assert.fail("no Windows nao se usa chmod"),
  });
  assert.deepEqual(chamadas, [["icacls", ["C:\\x\\c.dump", "/inheritance:r", "/grant:r", "PC\\rafa:F"]]]);
});

test("no Windows, se o icacls falhar o roteiro RECUSA gravar, e a mensagem nao leva segredo", () => {
  assert.throws(
    () => restringirAoDono("C:\\x", {
      plataforma: "win32",
      pasta: true,
      env: { USERNAME: "rafa" },
      executar: () => { throw new Error("acesso negado"); },
    }),
    (erro) => erro instanceof ErroDeUso && /Recuso gravar a cópia/.test(erro.message),
  );
});

test("no macOS e no Linux a pasta e 0700 e o arquivo 0600", () => {
  for (const plataforma of ["darwin", "linux"]) {
    const modos = [];
    restringirAoDono("/x/pasta", { plataforma, pasta: true, chmod: (_c, m) => modos.push(m) });
    restringirAoDono("/x/a.dump", { plataforma, chmod: (_c, m) => modos.push(m) });
    assert.deepEqual(modos, [0o700, 0o600]);
  }
});

test("a pasta de copias tem uma subpasta por ambiente, e so hml e prod", () => {
  assert.equal(pastaDeCopias("prod"), join(PASTA_DE_COPIAS, "prod"));
  assert.equal(pastaDeCopias("hml"), join(PASTA_DE_COPIAS, "hml"));
  assert.throws(() => pastaDeCopias("dev"));
  assert.equal(razaoParaRecusarAPasta(pastaDeCopias("hml")), null);
});

test("a copia de HML NAO vale como copia de PROD: cada ambiente olha a sua pasta", () => {
  const raiz = mkdtempSync(join(tmpdir(), "dc360-copias-de-teste-"));
  try {
    const hml = pastaDeCopias("hml", raiz);
    mkdirSync(hml, { recursive: true });
    const caminho = join(hml, "2026-10-24T10-00-00.dump");
    writeFileSync(caminho, Buffer.alloc(100, 1));
    const umMinutoAtras = new Date(Date.now() - MINUTO);
    utimesSync(caminho, umMinutoAtras, umMinutoAtras);
    const decisaoHml = decidirSobreACopia({ argv: ["x", "--aplicar"], pasta: hml });
    assert.equal(decisaoHml.situacao, "com_copia");
    const decisaoProd = decidirSobreACopia({ argv: ["x", "--aplicar"], pasta: pastaDeCopias("prod", raiz) });
    assert.equal(decisaoProd.situacao, "recusado", "so a copia de HML existe: PROD tem de recusar");
    assert.equal(decisaoProd.pasta, join(raiz, "prod"));
    assert.match(mensagemDeRecusaSemCopia(decisaoProd, "prod"), /--ambiente prod/);
    assert.match(mensagemDeRecusaSemCopia(decisaoProd, "prod"), /PROD/);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test("a URL do pg_dump de HML usa o projeto de HML e nao o de PROD", () => {
  const hml = { projeto: "hmlprojetoabcdef", host: "h.exemplo.test", porta: 5432 };
  const url = new URL(montarUrlParaPgDump("x", CA_DO_PROVEDOR, hml));
  assert.equal(url.username, "postgres.hmlprojetoabcdef");
  assert.equal(url.hostname, "h.exemplo.test");
  assert.doesNotMatch(url.toString(), /bppklrxxwjshxvkvwirw/);
});

test("a decisao usa a pasta e a janela de verdade quando ninguem as passa", () => {
  const pasta = pastaComCopias([{ nome: "2026-09-15T11-10-00.dump", minutosAtras: 3 }]);
  try {
    const decisao = decidirSobreACopia({ argv: ["node", "x", "--aplicar"], pasta });
    assert.equal(decisao.situacao, "com_copia");
    const velha = pastaComCopias([{ nome: "2026-09-15T11-10-00.dump", minutosAtras: 31 }]);
    try {
      assert.equal(decidirSobreACopia({ argv: ["node", "x", "--aplicar"], pasta: velha }).situacao, "recusado");
    } finally {
      rmSync(velha, { recursive: true, force: true });
    }
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});
