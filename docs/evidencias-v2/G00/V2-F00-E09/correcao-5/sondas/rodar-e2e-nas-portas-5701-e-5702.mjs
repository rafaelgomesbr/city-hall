#!/usr/bin/env node
/**
 * Sobe API e painel do zero e roda as verificações do caminho de produção.
 *
 * Este arquivo existe porque a suíte `test:e2e:api` era a única que exercitava
 * autenticação real, CORS, renovação de sessão e documento saindo do servidor,
 * e mesmo assim ficou fora da integração contínua desde sempre. O motivo não
 * era preguiça: rodar aquilo à mão exigia três terminais, cinco variáveis de
 * ambiente e saber que duas delas têm padrão que só serve a outra porta.
 *
 * O preço de não rodar apareceu duas vezes, e as duas custaram caro:
 *
 * 1. Uma correção de segurança tirou o link de redefinição do log, que era de
 *    onde a suíte o lia. Quarenta e nove das cento e três verificações
 *    deixaram de ser alcançadas e ninguém viu por dias.
 * 2. `URL_PUBLICA` tem padrão `http://127.0.0.1:3333`. Subir a API em outra
 *    porta faz o endereço de envio de foto apontar para porta morta, e a
 *    falha aparece como "Failed to fetch" no meio da seção 13, que é o
 *    sintoma mais inútil possível.
 *
 * E a suíte NÃO é re-executável contra uma instância suja: ela confere
 * protocolo por número, e a detecção de duplicidade recusa o segundo registro
 * no mesmo endereço. Por isso este script sempre sobe um par novo, em portas
 * próprias, e derruba tudo no fim.
 *
 * Uso: node scripts/e2e-api.mjs [chromium|firefox]
 */
import { spawn, spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = "/Users/rafaelgomes/Documents/city-hall/.claude/worktrees/wf_249935fe-9f4-1/dc360/";
const MOTOR = process.argv[2] ?? "chromium";

// Portas próprias, longe das de desenvolvimento, para não brigar com um painel
// que alguém tenha deixado aberto.
const PORTA_API = 5701;
const PORTA_WEB = 5702;
const BASE_API = `http://127.0.0.1:${PORTA_API}`;
const BASE_WEB = `http://localhost:${PORTA_WEB}`;

const pasta = mkdtempSync(join(tmpdir(), "dc360-e2e-"));
const ARQUIVO_NOTIFICACAO = join(pasta, "notificacoes.txt");

const processos = [];

function iniciar(nome, comando, argumentos, opcoes) {
  const p = spawn(comando, argumentos, {
    cwd: opcoes.cwd, env: { ...process.env, ...opcoes.env },
    stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32",
    ...(process.platform === "win32" ? {} : { detached: true }),
  });
  p.stdout.on("data", (b) => { if (process.env["VERBOSE"]) process.stdout.write(`[${nome}] ${b}`); });
  p.stderr.on("data", (b) => { if (process.env["VERBOSE"]) process.stderr.write(`[${nome}] ${b}`); });
  processos.push({ nome, p });
  return p;
}

/**
 * Derruba a ÁRVORE, e não só o processo que este script enxerga.
 *
 * No Windows, `spawn` com `shell: true` devolve o cmd.exe, e matá-lo deixa o
 * node filho vivo, segurando a porta. O sintoma é cruel: a execução seguinte
 * não consegue subir, fala com a API velha que ficou, e falha em um lugar
 * diferente a cada vez, porque a instância antiga acumula estado (conta
 * bloqueada por tentativa, protocolo já usado, endereço já registrado).
 *
 * Levei duas execuções para entender isso, e é exatamente o tipo de coisa que
 * faz uma suíte ser marcada como intermitente e depois ignorada.
 */
function derrubarTudo() {
  for (const { p } of processos) {
    if (!p.pid) continue;
    try {
      if (process.platform === "win32") {
        // Síncrono de propósito: o `exit` do node não espera assíncrono, e um
        // `spawn` aqui deixa a porta ocupada para a execução seguinte.
        spawnSync("taskkill", ["/pid", String(p.pid), "/t", "/f"], { stdio: "ignore" });
      } else {
        process.kill(-p.pid, "SIGTERM");
      }
    } catch { /* já morreu */ }
  }
  try { rmSync(pasta, { recursive: true, force: true }); } catch { /* nada a fazer */ }
}

process.on("exit", derrubarTudo);
process.on("SIGINT", () => { derrubarTudo(); process.exit(130); });

/** Espera de verdade, e não `sleep` de número inventado. */
async function esperar(url, segundos, oQue) {
  const limite = Date.now() + segundos * 1000;
  while (Date.now() < limite) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return;
    } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${oQue} não respondeu em ${segundos}s (${url})`);
}

function rodar(comando, argumentos, opcoes) {
  return new Promise((resolve, reject) => {
    const p = spawn(comando, argumentos, {
      cwd: opcoes.cwd, env: { ...process.env, ...opcoes.env },
      stdio: "inherit", shell: process.platform === "win32",
    });
    p.on("exit", (codigo) => (codigo === 0 ? resolve() : reject(new Error(`saiu com ${codigo}`))));
  });
}

/**
 * Porta ocupada: recusa comecar, em vez de falar com a instancia velha.
 *
 * Este portao custou duas execucoes falsas em 09/09/2026, e o mecanismo e
 * cruel. `esperar()` da a API por pronta quando `/saude` responde 200. Se uma
 * execucao anterior deixou a API viva nesta porta (queda no meio, terminal
 * fechado, `kill -9` no pai), a execucao nova sobe a SUA API, ela morre na hora
 * com EADDRINUSE, e o 200 que chega e da instancia VELHA. O painel recem
 * construido passa a conversar com um banco semeado noutro momento, com conta
 * ja bloqueada por tentativa, protocolo ja usado e endereco ja registrado: a
 * suite falha num lugar diferente a cada vez, e vira "intermitente".
 *
 * Adivinhar de quem e a API que respondeu seria complicado e fragil. Recusar e
 * uma linha, e a mensagem ensina o conserto.
 */
function portaOcupada(porta) {
  return new Promise((resolve) => {
    const c = createConnection({ port: porta, host: "127.0.0.1" });
    const fechar = (ocupada) => { c.destroy(); resolve(ocupada); };
    c.setTimeout(1000);
    c.once("connect", () => fechar(true));
    c.once("timeout", () => fechar(false));
    c.once("error", () => fechar(false));
  });
}

for (const [porta, oQue] of [[PORTA_API, "a API"], [PORTA_WEB, "o painel"]]) {
  if (await portaOcupada(porta)) {
    console.error(
      `\nA porta ${porta} ja esta ocupada, e e a porta de ${oQue} nesta suite.\n\n` +
      "Comecar assim seria pior do que parar: esta execucao subiria a propria\n" +
      "instancia, ela morreria com EADDRINUSE, e o painel conversaria com a\n" +
      "instancia VELHA, com estado acumulado. A falha apareceria em outro lugar,\n" +
      "longe daqui.\n\n" +
      "Quase sempre e sobra de uma execucao anterior que nao foi derrubada:\n\n" +
      `  lsof -ti :${PORTA_API} -ti :${PORTA_WEB} | xargs kill -9\n`,
    );
    process.exit(1);
  }
}

console.log(`\n== Subindo API na ${PORTA_API} ==`);
iniciar("api", "npx", ["tsx", "src/index.ts"], {
  cwd: join(RAIZ, "apps/api"),
  env: {
    PORT: String(PORTA_API),
    HOST: "127.0.0.1",
    JWT_SEGREDO: "segredo-de-teste-com-mais-de-trinta-e-dois-bytes-para-o-e2e",
    ORIGENS_PERMITIDAS: BASE_WEB,
    URL_PAINEL: BASE_WEB,
    // Sem isto o endereço de envio de foto aponta para a porta padrão, que
    // está morta, e a seção 13 falha com "Failed to fetch".
    URL_PUBLICA: BASE_API,
    // A suíte dispara muitas entradas seguidas de propósito.
    LOGIN_POR_IP: "10000",
    // Canal de teste para o link de redefinição. `config.ts` derruba a partida
    // se esta variável aparecer em produção.
    NOTIFICADOR_ARQUIVO: ARQUIVO_NOTIFICACAO,
  },
});
await esperar(`${BASE_API}/saude`, 90, "A API");
console.log("API de pé.");

console.log(`\n== Construindo o painel apontado para ${BASE_API} ==`);
if (!process.env.SEM_BUILD) await rodar("npm", ["run", "build"], {
  cwd: join(RAIZ, "apps/web"),
  env: { VITE_API_URL: BASE_API },
});

console.log(`\n== Servindo o painel na ${PORTA_WEB} ==`);
iniciar("web", "npx", ["vite", "preview", "--port", String(PORTA_WEB), "--strictPort"], {
  cwd: join(RAIZ, "apps/web"), env: {},
});
await esperar(BASE_WEB, 60, "O painel");
console.log("Painel de pé.");

console.log(`\n== Verificações do caminho de produção, em ${MOTOR} ==`);
if (!process.env.SO_LAYOUT) await rodar("node", ["test/fluxo-api.e2e.mjs"], {
  cwd: join(RAIZ, "apps/web"),
  env: {
    BASE_WEB, BASE_API, MOTOR,
    NOTIFICADOR_ARQUIVO: ARQUIVO_NOTIFICACAO,
  },
});

/*
  A geometria da tela estreita (V2-F00-E09, correção 1) roda DEPOIS da suíte
  principal, na mesma API e no mesmo painel. Ela cria a própria pessoa de nome
  longo com e-mail único, então a instância já usada não atrapalha, e fica em
  arquivo à parte para poder rodar sozinha contra um painel de pé.
*/
console.log(`\n== Geometria da tela estreita, em ${MOTOR} ==`);
await rodar("node", ["test/layout-estreito.e2e.mjs"], {
  cwd: join(RAIZ, "apps/web"),
  env: { BASE_WEB, BASE_API, MOTOR },
});

console.log("\nTUDO CERTO: o caminho de produção passou de ponta a ponta.");
/*
  Sai explicitamente, e é o `exit` que derruba a API e o painel.

  Sem isto o script NUNCA terminava quando tudo passava: os dois filhos têm o
  stdout e o stderr ligados a este processo por pipe, e pipe aberto segura o
  laço de eventos do Node. Ninguém tinha visto porque a suíte nunca tinha
  chegado verde até aqui: a falha lança, o `exit` roda e derruba tudo. A
  primeira execução verde (V2-F00-E18) ficou pendurada com as duas portas
  ocupadas, e a execução seguinte recusaria começar pelo portão de porta
  ocupada logo acima.
*/
process.exit(0);
