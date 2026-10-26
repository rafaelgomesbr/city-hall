import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, parse, resolve } from "node:path";

import {
  CA_DO_PROVEDOR, COMO_INSTALAR, JANELA_DA_COPIA_MS, PASTA_DE_COPIAS, RAIZ_DO_REPO,
  argumentosDoPgDump, candidatosDePgDump, clienteServe, comandoDeAcl, comandoParaApagar, comoInstalar, copiaRecente,
  entradasAlheias, lerDaclDoIcacls, tirarCopia,
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

/**
 * A saída de `icacls <caminho>` como o Windows a imprime: o caminho e a
 * primeira entrada na mesma linha, as outras alinhadas embaixo, uma linha em
 * branco e o resumo. Copiada do formato de uma sonda real (2026-10-26), com
 * nomes de mentira.
 */
function icaclsDe(caminho, entradas) {
  const recuo = " ".repeat(caminho.length + 1);
  const linhas = entradas.map((e, i) => (i === 0 ? `${caminho} ${e}` : `${recuo}${e}`));
  return `${linhas.join("\r\n")}\r\n\r\nSuccessfully processed 1 files; Failed processing 0 files\r\n`;
}

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

  // Correção 1 da F01 (parte B): depois de restringir, o roteiro LÊ a DACL que
  // o icacls devolve e a confere. A saída aqui é a de um icacls de verdade.
  const chamadas = [];
  restringirAoDono("C:\\x\\c.dump", {
    plataforma: "win32",
    env: { USERDOMAIN: "PC", USERNAME: "rafa" },
    executar: (cmd, args) => {
      chamadas.push([cmd, args]);
      return args.length === 1 ? icaclsDe("C:\\x\\c.dump", ["PC\\rafa:(F)"]) : "processed file: C:\\x\\c.dump\r\n";
    },
    chmod: () => assert.fail("no Windows nao se usa chmod"),
  });
  assert.deepEqual(chamadas, [
    ["icacls", ["C:\\x\\c.dump", "/inheritance:r", "/grant:r", "PC\\rafa:F"]],
    ["icacls", ["C:\\x\\c.dump"]],
  ]);
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
    // O modo conferido depois é o que o "disco" devolve: aqui, o que o chmod acabou de pôr.
    const disco = { chmod: (_c, m) => modos.push(m), stat: () => ({ mode: modos.at(-1), uid: 501 }), uid: 501 };
    restringirAoDono("/x/pasta", { plataforma, pasta: true, ...disco });
    restringirAoDono("/x/a.dump", { plataforma, ...disco });
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

/* =====================================================================
 * Correção 1 da F01, parte B (revisão independente, achados 1, 10 e 12).
 * ===================================================================== */

/*
  Achado 1 (E15): `icacls /inheritance:r` preserva concessão EXPLÍCITA. Se a
  pasta da cópia já tinha uma concessão herdável a outro grupo, o arquivo do
  dump nascia legível por esse grupo enquanto o `pg_dump` escrevia (sonda real
  no Windows, arquivada na evidência). Agora o arquivo nasce vazio, é
  restringido, a DACL que o `icacls` devolve é LIDA e conferida, e só então o
  `pg_dump` escreve nele. Qualquer entrada além do operador (e do SYSTEM)
  reprova.
*/

const PASTA_WIN = "C:\\Users\\rafa\\dc360-copias\\prod";
const ARQ_WIN = `${PASTA_WIN}\\2026-10-26T10-00-00.dump`;
const ENV_WIN = { USERDOMAIN: "PC", USERNAME: "rafa" };

/** Um icacls de mentira: concede sem erro e, na leitura, devolve a DACL do mapa. */
function icaclsFalso(dacls, chamadas = []) {
  return (cmd, args) => {
    chamadas.push([cmd, ...args]);
    if (cmd !== "icacls") throw new Error(`comando inesperado: ${cmd}`);
    if (args.length === 1) {
      const entradas = dacls[args[0]];
      if (!entradas) throw new Error(`sem DACL de mentira para ${args[0]}`);
      return icaclsDe(args[0], entradas);
    }
    return `processed file: ${args[0]}\r\nSuccessfully processed 1 files; Failed processing 0 files\r\n`;
  };
}

test("a DACL e lida da saida real do icacls: caminho com espaco, nome com espaco, SID cru e heranca", () => {
  const caminho = "C:\\Users\\Ana Maria\\dc360-copias\\prod";
  const saida = icaclsDe(caminho, [
    "BUILTIN\\Usuários:(OI)(CI)(R)",
    "S-1-5-21-1-2-3-1001:(I)(OI)(CI)(M)",
    "NT AUTHORITY\\SYSTEM:(I)(OI)(CI)(F)",
    "PC\\ana:(OI)(CI)(F)",
  ]);
  assert.deepEqual(lerDaclDoIcacls(saida, caminho), [
    { principal: "BUILTIN\\Usuários", permissoes: "(OI)(CI)(R)" },
    { principal: "S-1-5-21-1-2-3-1001", permissoes: "(I)(OI)(CI)(M)" },
    { principal: "NT AUTHORITY\\SYSTEM", permissoes: "(I)(OI)(CI)(F)" },
    { principal: "PC\\ana", permissoes: "(OI)(CI)(F)" },
  ]);
  assert.deepEqual(lerDaclDoIcacls(icaclsDe(caminho, ["PC\\ana:(F)"]), caminho), [{ principal: "PC\\ana", permissoes: "(F)" }]);
});

test("saida do icacls que nao e uma DACL legivel reprova (fechado na falha), sem achar que esta tudo certo", () => {
  assert.throws(() => lerDaclDoIcacls("", ARQ_WIN), ErroDeUso);
  assert.throws(() => lerDaclDoIcacls(icaclsDe("C:\\outro\\arquivo", ["PC\\rafa:(F)"]), ARQ_WIN), ErroDeUso, "caminho que nao e o pedido");
  assert.throws(() => lerDaclDoIcacls(`${ARQ_WIN} lixo sem permissao\r\n`, ARQ_WIN), ErroDeUso);
  assert.throws(() => lerDaclDoIcacls(`${ARQ_WIN}\r\n\r\nSuccessfully processed 1 files\r\n`, ARQ_WIN), ErroDeUso, "DACL vazia: nem o operador consta");
});

test("so o operador (sem diferenca de caixa) e o SYSTEM, em ingles ou em portugues, podem constar da DACL", () => {
  const ok = [
    { principal: "pc\\RAFA", permissoes: "(F)" },
    { principal: "NT AUTHORITY\\SYSTEM", permissoes: "(F)" },
    { principal: "AUTORIDADE NT\\SISTEMA", permissoes: "(F)" },
  ];
  assert.deepEqual(entradasAlheias(ok, "PC\\rafa"), []);
  const alheias = entradasAlheias([...ok, { principal: "BUILTIN\\Usuários", permissoes: "(I)(R)" }, { principal: "PC\\bob", permissoes: "(DENY)(W)" }], "PC\\rafa");
  assert.deepEqual(alheias.map((e) => e.principal), ["BUILTIN\\Usuários", "PC\\bob"]);
});

test("no Windows, a concessao explicita herdavel que o /inheritance:r preserva faz o roteiro RECUSAR, nomeando quem sobrou", () => {
  const executar = icaclsFalso({ [PASTA_WIN]: ["BUILTIN\\Usuários:(OI)(CI)(R)", "PC\\rafa:(OI)(CI)(F)"] });
  assert.throws(
    () => restringirAoDono(PASTA_WIN, { plataforma: "win32", pasta: true, env: ENV_WIN, executar }),
    (erro) => erro instanceof ErroDeUso
      && /BUILTIN\\Usuários:\(OI\)\(CI\)\(R\)/.test(erro.message)
      && /icacls ".*" \/remove:g "BUILTIN\\Usuários"/.test(erro.message)
      && /Recuso gravar a cópia/.test(erro.message),
  );
  // E a DACL sem o operador também reprova: ninguém conferiu que a cópia é dele.
  assert.throws(
    () => restringirAoDono(ARQ_WIN, { plataforma: "win32", env: ENV_WIN, executar: icaclsFalso({ [ARQ_WIN]: ["NT AUTHORITY\\SYSTEM:(F)"] }) }),
    /não consta/,
  );
});

test("no macOS e no Linux, o modo que o disco devolve e conferido: grupo ou outros com acesso reprova", () => {
  const stat = (modo) => () => ({ mode: modo, uid: 501 });
  assert.doesNotThrow(() => restringirAoDono("/x/a.dump", { plataforma: "linux", chmod: () => {}, stat: stat(0o100600), uid: 501 }));
  assert.doesNotThrow(() => restringirAoDono("/x/pasta", { plataforma: "darwin", pasta: true, chmod: () => {}, stat: stat(0o40700), uid: 501 }));
  assert.throws(() => restringirAoDono("/x/a.dump", { plataforma: "linux", chmod: () => {}, stat: stat(0o100640), uid: 501 }), /0640/);
  assert.throws(() => restringirAoDono("/x/a.dump", { plataforma: "linux", chmod: () => {}, stat: stat(0o100600), uid: 0 }), /dono/);
});

test("o arquivo da copia nasce VAZIO, restrito e conferido ANTES do pg_dump escrever o primeiro byte", () => {
  const raiz = mkdtempSync(join(tmpdir(), "dc360-copias-de-teste-"));
  try {
    const pasta = join(raiz, "prod");
    const destino = join(pasta, "2026-10-26T10-00-00.dump");
    const chamadas = [];
    const executar = icaclsFalso({ [pasta]: ["PC\\rafa:(OI)(CI)(F)"], [destino]: ["PC\\rafa:(F)"] }, chamadas);
    let vistoPeloPgDump = null;
    const r = tirarCopia({
      pasta,
      destino,
      plataforma: "win32",
      env: ENV_WIN,
      executar,
      rodarPgDump: (alvo) => {
        vistoPeloPgDump = { existe: existsSync(alvo), bytes: statSync(alvo).size, chamadasAntes: chamadas.length };
        writeFileSync(alvo, Buffer.alloc(64, 7));
        return 0;
      },
    });
    assert.deepEqual(r, { status: 0, bytes: 64 });
    assert.deepEqual(vistoPeloPgDump, { existe: true, bytes: 0, chamadasAntes: 4 }, "pasta e arquivo restringidos e lidos antes do pg_dump");
    assert.deepEqual(chamadas.slice(0, 4).map((c) => c.slice(1, 3)), [[pasta, "/inheritance:r"], [pasta], [destino, "/inheritance:r"], [destino]]);
    assert.deepEqual(chamadas.at(-1), ["icacls", destino], "e conferido de novo depois que o pg_dump escreveu");
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test("pasta com entrada alheia: o roteiro recusa e o pg_dump nem roda, e nenhum arquivo de copia nasce", () => {
  const raiz = mkdtempSync(join(tmpdir(), "dc360-copias-de-teste-"));
  try {
    const pasta = join(raiz, "prod");
    const destino = join(pasta, "2026-10-26T10-00-00.dump");
    const executar = icaclsFalso({ [pasta]: ["BUILTIN\\Usuários:(OI)(CI)(R)", "PC\\rafa:(OI)(CI)(F)"], [destino]: ["PC\\rafa:(F)"] });
    assert.throws(
      () => tirarCopia({ pasta, destino, plataforma: "win32", env: ENV_WIN, executar, rodarPgDump: () => assert.fail("o pg_dump nao pode rodar") }),
      /Usuários/,
    );
    assert.equal(existsSync(destino), false);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test("arquivo com entrada alheia antes ou depois do pg_dump: o roteiro apaga o arquivo e recusa", () => {
  const raiz = mkdtempSync(join(tmpdir(), "dc360-copias-de-teste-"));
  try {
    const pasta = join(raiz, "prod");
    const destino = join(pasta, "2026-10-26T10-00-00.dump");
    const antes = icaclsFalso({ [pasta]: ["PC\\rafa:(OI)(CI)(F)"], [destino]: ["PC\\rafa:(F)", "Todos:(R)"] });
    assert.throws(() => tirarCopia({ pasta, destino, plataforma: "win32", env: ENV_WIN, executar: antes, rodarPgDump: () => assert.fail("nao roda") }), /Todos/);
    assert.equal(existsSync(destino), false, "o arquivo vazio foi apagado");

    // Depois do pg_dump: a DACL muda (como se o arquivo tivesse sido recriado e herdado de novo).
    const dacls = { [pasta]: ["PC\\rafa:(OI)(CI)(F)"], [destino]: ["PC\\rafa:(F)"] };
    const depois = icaclsFalso(dacls);
    assert.throws(
      () => tirarCopia({
        pasta, destino, plataforma: "win32", env: ENV_WIN, executar: depois,
        rodarPgDump: (alvo) => { writeFileSync(alvo, "dado"); dacls[destino] = ["PC\\rafa:(F)", "BUILTIN\\Usuários:(I)(R)"]; return 0; },
      }),
      /Usuários/,
    );
    assert.equal(existsSync(destino), false, "o dump com a ACL errada foi apagado");

    // pg_dump que falha: apaga o que tiver gravado e devolve o código.
    const falha = tirarCopia({ pasta, destino, plataforma: "win32", env: ENV_WIN, executar: icaclsFalso({ [pasta]: ["PC\\rafa:(OI)(CI)(F)"], [destino]: ["PC\\rafa:(F)"] }), rodarPgDump: () => 3 });
    assert.deepEqual(falha, { status: 3, bytes: 0 });
    assert.equal(existsSync(destino), false);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test("a copia nunca sobrescreve um arquivo que ja existe (nasce com wx)", () => {
  const raiz = mkdtempSync(join(tmpdir(), "dc360-copias-de-teste-"));
  try {
    const pasta = join(raiz, "prod");
    mkdirSync(pasta);
    const destino = join(pasta, "2026-10-26T10-00-00.dump");
    writeFileSync(destino, "copia anterior");
    const executar = icaclsFalso({ [pasta]: ["PC\\rafa:(OI)(CI)(F)"], [destino]: ["PC\\rafa:(F)"] });
    assert.throws(() => tirarCopia({ pasta, destino, plataforma: "win32", env: ENV_WIN, executar, rodarPgDump: () => assert.fail("nao roda") }), /EEXIST|já existe/);
    assert.equal(readFileSync(destino, "utf8"), "copia anterior");
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

/*
  Achado 10 (E15): a busca devolvia o PRIMEIRO pg_dump com versão legível. Um
  16 no PATH escondia o 17 instalado em Program Files, e o roteiro recusava
  mesmo havendo cliente que serve.
*/
test("um pg_dump 16 no PATH nao esconde o 17 instalado: vence o primeiro COMPATIVEL entre todos os candidatos", () => {
  const versoes = {
    pg_dump: "pg_dump (PostgreSQL) 16.4",
    "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe": null,
    "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe": "pg_dump (PostgreSQL) 17.6",
  };
  const executar = (c) => {
    if (versoes[c]) return versoes[c];
    throw new Error("ENOENT");
  };
  const achado = localizarPgDump({ plataforma: "win32", env: { ProgramFiles: "C:\\Program Files" }, executar });
  assert.deepEqual(achado, { caminho: "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe", versao: "17.6" });

  // Servidor 18: o 17 deixa de servir e o 18 vence, se existir.
  versoes["C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe"] = "pg_dump (PostgreSQL) 18.1";
  assert.equal(localizarPgDump({ plataforma: "win32", env: { ProgramFiles: "C:\\Program Files" }, executar, versaoMinima: 18 }).versao, "18.1");
});

test("sem nenhum pg_dump compativel, a busca devolve o primeiro legivel, para a recusa dizer qual achou", () => {
  const achado = localizarPgDump({
    plataforma: "linux",
    env: {},
    executar: (c) => {
      if (c === "pg_dump") return "pg_dump (PostgreSQL) 16.4";
      if (c === "/usr/lib/postgresql/17/bin/pg_dump") return "pg_dump (PostgreSQL) 15.2";
      throw new Error("ENOENT");
    },
  });
  assert.deepEqual(achado, { caminho: "pg_dump", versao: "16.4" });
  assert.equal(clienteServe(achado.versao), false);
});

/*
  Achado 12 (E16): o runbook mandava apagar `~/dc360-copias/<data>.dump`, mas a
  cópia mora em `~/dc360-copias/prod/`. O roteiro passa a imprimir o comando
  EXATO de remoção, com o caminho que acabou de gravar.
*/
test("o comando de apagar a copia que o roteiro imprime e o caminho exato, entre aspas, nos dois sistemas", () => {
  assert.equal(comandoParaApagar("/home/ana/dc360-copias/prod/2026-10-26T10-00-00.dump", "linux"), "rm -- '/home/ana/dc360-copias/prod/2026-10-26T10-00-00.dump'");
  assert.equal(comandoParaApagar("/Users/o'neil/dc360-copias/prod/a.dump", "darwin"), "rm -- '/Users/o'\\''neil/dc360-copias/prod/a.dump'");
  assert.equal(comandoParaApagar("C:\\Users\\ana\\dc360-copias\\prod\\a.dump", "win32"), "Remove-Item -LiteralPath 'C:\\Users\\ana\\dc360-copias\\prod\\a.dump'");
  assert.equal(comandoParaApagar("C:\\Users\\o'neil\\a.dump", "win32"), "Remove-Item -LiteralPath 'C:\\Users\\o''neil\\a.dump'");
});
