import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CA_DO_PROVEDOR, COMO_INSTALAR, JANELA_DA_COPIA_MS, PASTA_DE_COPIAS, RAIZ_DO_REPO,
  clienteServe, copiaRecente, localizarPgDump, montarUrlParaPgDump, nomeDaCopia,
  razaoParaRecusarAPasta, versaoDoPgDump,
} from "./copiar-producao.mjs";
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

test("a pasta de copias recusa o repositorio, a nuvem de arquivos e a Area de Trabalho", () => {
  const casa = "/Users/alguem";
  const opcoes = { raizDoRepo: "/Users/alguem/city-hall/dc360", casa };
  assert.match(razaoParaRecusarAPasta("/Users/alguem/city-hall/dc360/copias", opcoes), /repositório/);
  assert.match(razaoParaRecusarAPasta("/Users/alguem/city-hall/dc360", opcoes), /repositório/);
  assert.match(razaoParaRecusarAPasta("/Users/alguem/Library/Mobile Documents/com~apple~CloudDocs/copias", opcoes), /nuvem/);
  assert.match(razaoParaRecusarAPasta("/Users/alguem/Dropbox/dc360", opcoes), /nuvem/);
  assert.match(razaoParaRecusarAPasta("/Users/alguem/Google Drive/dc360", opcoes), /nuvem/);
  assert.match(razaoParaRecusarAPasta("/Users/alguem/OneDrive/dc360", opcoes), /nuvem/);
  assert.match(razaoParaRecusarAPasta("/Users/alguem/Desktop/copias", opcoes), /Área de Trabalho/);
  assert.equal(razaoParaRecusarAPasta("/Users/alguem/dc360-copias", opcoes), null);
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
  const decisao = decidirSobreACopia({ argv: ["node", "migrar-producao.mjs"], procurar: () => { throw new Error("não devia procurar"); } });
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
  const decisao = decidirSobreACopia({ argv: ["node", "migrar-producao.mjs", "--aplicar"], procurar: () => copia });
  assert.equal(decisao.situacao, "com_copia");
  const frase = fraseDaCopia(decisao);
  assert.match(frase, /2026-09-15T11-10-00\.dump/);
  assert.match(frase, /20 min/);
});

test("aplicar com --sem-copia passa, e a conclusao diz por extenso que a copia foi PULADA", () => {
  const decisao = decidirSobreACopia({ argv: ["node", "migrar-producao.mjs", "--aplicar", "--sem-copia"], procurar: () => null });
  assert.equal(decisao.situacao, "pulada");
  assert.match(fraseDaCopia(decisao), /PULADA/);
  assert.match(fraseDaCopia(decisao), /decisão de quem rodou/);
});

test("com copia recente, --sem-copia nao apaga o registro: a copia que existe e a que vale", () => {
  const copia = { caminho: "/x/c.dump", nome: "c.dump", idadeMs: MINUTO, bytes: 100 };
  const decisao = decidirSobreACopia({ argv: ["node", "migrar-producao.mjs", "--aplicar", "--sem-copia"], procurar: () => copia });
  assert.equal(decisao.situacao, "com_copia");
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
