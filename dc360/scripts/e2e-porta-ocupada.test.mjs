import { createServer } from "node:net";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

/**
 * O roteiro de ponta a ponta tem que RECUSAR subir com a porta ocupada.
 *
 * O defeito que este arquivo guarda custou duas execuções falsas em 09/09/2026,
 * e o sintoma é o pior possível: a suíte falha em lugares diferentes a cada
 * vez, e a pessoa aprende a chamar a suíte de intermitente e a ignorá-la.
 *
 * O mecanismo: `esperar()` considera a API de pé quando `/saude` responde 200.
 * Se uma execução anterior deixou a API viva naquela porta (crash no meio,
 * terminal fechado, `kill -9` no pai), a nova execução sobe a SUA API, ela
 * morre na hora com EADDRINUSE, e a resposta 200 que chega é da instância
 * VELHA. O painel recém-construído passa a conversar com um banco semeado
 * noutro momento, com conta já bloqueada por tentativa, protocolo já usado e
 * endereço já registrado.
 *
 * A correção certa não é tentar adivinhar de quem é a API que respondeu: é
 * recusar começar. Porta ocupada é estado do ambiente, e o conserto é uma linha
 * de comando que a própria mensagem ensina.
 */

const ROTEIRO = fileURLToPath(new URL("./e2e-api.mjs", import.meta.url));

/** A porta que `e2e-api.mjs` usa para a API. Escrita aqui de propósito: se ela
 *  mudar lá e não aqui, este teste para de guardar o que diz guardar, e o caso
 *  de baixo é quem percebe. */
const PORTA_API = 3691;

function ocupar(porta) {
  return new Promise((resolve, reject) => {
    const s = createServer(() => {});
    s.once("error", reject);
    s.listen(porta, "127.0.0.1", () => resolve(s));
  });
}

test("recusa subir com a porta da API ocupada, em vez de falar com a instância velha", async () => {
  const servidor = await ocupar(PORTA_API);
  try {
    const r = spawnSync(process.execPath, [ROTEIRO], { encoding: "utf8", timeout: 60_000 });
    const saida = `${r.stdout ?? ""}${r.stderr ?? ""}`;

    assert.notEqual(r.status, 0, "o roteiro começou mesmo com a porta ocupada");
    assert.match(saida, /3691/, "a mensagem não diz qual porta está ocupada");
    assert.match(
      saida, /ocupada|em uso/i,
      "a mensagem não explica que o problema é a porta, e quem lê vai procurar no lugar errado",
    );
    // E não pode ter chegado a construir o painel: isso levaria minutos antes
    // de descobrir o que já dava para saber na primeira linha.
    assert.doesNotMatch(saida, /Construindo o painel/, "gastou o build antes de desistir");
  } finally {
    await new Promise((r) => servidor.close(r));
  }
});

test("a porta conferida é a mesma que o roteiro usa", async () => {
  const { readFileSync } = await import("node:fs");
  const fonte = readFileSync(ROTEIRO, "utf8");
  assert.match(
    fonte, new RegExp(`PORTA_API\\s*=\\s*${PORTA_API}\\b`),
    "a porta mudou no roteiro e não aqui: o caso de cima passaria sem provar nada",
  );
});
