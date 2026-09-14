import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * O COMANDO QUE DIZIA CONFERIR E APLICAVA.
 *
 * `docs/COLOCAR-DE-PE.md` manda, com estas palavras, "confere primeiro, não
 * aplica nada":
 *
 *   npm run migrar -- --conferir
 *
 * Rodado da RAIZ do repositório, que é de onde a documentação fala, esse
 * comando aplicava as migrações todas. O script da raiz é
 * `npm run migrar --workspace @dc360/db`, e sem um `--` no fim dele o npm trata
 * `--conferir` como configuração própria (ele até avisa: "Unknown cli config"),
 * não repassa nada, e o `cli.ts` cai no ramo de APLICAR.
 *
 * A prova, colada em 14/09/2026, com os dois caminhos lado a lado e o mesmo
 * banco efêmero:
 *
 *   raiz:        Aplicadas: 001_base.sql, ... 033_as_outras_duas...
 *   dentro de db/: Faltam 33 migração(ões): 001_base.sql, ...
 *
 * O estrago possível não é teórico: em 14/09/2026 a produção estava na 024 com
 * nove migrações pendentes, e o passo seguinte do roteiro era exatamente
 * "confira antes de escrever". Quem seguisse a documentação contra a produção
 * teria aplicado as nove, incluindo uma que reescreve coordenada em massa,
 * acreditando que só estava perguntando.
 *
 * Migração é irreversível. O comando que existe para NÃO fazer nada é o último
 * lugar do repositório onde uma opção pode ser engolida em silêncio.
 */

test("o script da raiz repassa as opções para o migrador", () => {
  const pacote = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));
  const migrar = pacote.scripts.migrar;

  assert.match(
    migrar, /--\s*$/,
    "o script `migrar` da raiz não termina em `--`, então `npm run migrar -- "
    + "--conferir` não chega ao cli e o comando que deveria só CONFERIR "
    + "aplica as migrações. Ver o cabeçalho deste arquivo.",
  );
});

test("rodando da raiz, --conferir confere e NÃO aplica", () => {
  /*
    Sem `DATABASE_URL`, o cli migra um Postgres em WebAssembly efêmero, que
    nasce vazio e morre no fim do processo. É por isso que este caso pode
    EXECUTAR o comando de verdade, que é a única forma de provar o que ele faz:
    conferir o texto do script prova a causa, e não o efeito.
  */
  /*
    O `catch` não é complacência: com o banco efêmero nascendo vazio, faltam
    migrações, e faltar migração é SAÍDA 1 de propósito (é assim que o contêiner
    recusa subir com esquema atrasado). Deixar o `execFileSync` estourar aqui
    mediria o código de saída, que não é o que este caso pergunta. O que ele
    pergunta é o que o comando FEZ, e isso está no texto.
  */
  let saida = "";
  try {
    saida = execFileSync("npm", ["run", "migrar", "--", "--conferir"], {
      cwd: RAIZ,
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (erro) {
    saida = `${erro.stdout ?? ""}${erro.stderr ?? ""}`;
  }

  assert.match(
    saida, /Faltam \d+ migração|Esquema em dia/,
    "o comando não chegou a CONFERIR nada: nenhuma das duas respostas do "
    + "modo de conferência apareceu na saída.",
  );

  assert.doesNotMatch(
    saida, /Aplicadas:/,
    "`npm run migrar -- --conferir` da raiz APLICOU migrações. A opção foi "
    + "engolida pelo npm antes de chegar ao cli.",
  );
});
