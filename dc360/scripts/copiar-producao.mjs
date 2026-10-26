#!/usr/bin/env node
/**
 * COPIAR A PRODUÇÃO antes de mexer nela: um dump lógico do banco, fora do
 * repositório, com permissão só de quem rodou.
 *
 * ## Por que existe
 *
 * `scripts/migrar-producao.mjs --aplicar` é irreversível, e o único restore
 * testado deste projeto é o de 09/09/2026 (`docs/COLOCAR-DE-PE.md`, Parte 6),
 * feito contra uma cópia tirada à mão naquele dia. Entre uma migração e outra
 * ninguém tirava cópia, e a "cópia automática do provedor" é o que a Parte 6
 * chama pelo nome: uma promessa de que o arquivo existe, e nada sobre ele
 * voltar. Desde 15/09/2026 o migrador RECUSA aplicar sem uma cópia feita por
 * este roteiro nos últimos trinta minutos (ou com `--sem-copia` escrito à mão,
 * que fica registrado na saída).
 *
 * ## O formato, e por que não é `.sql.gz`
 *
 * `pg_dump --format=custom`, o mesmo do restore testado na Parte 6, que
 * restaura com `pg_restore --exit-on-error` e já vem comprimido. Um `.sql.gz`
 * restauraria por `psql`, que é um segundo caminho, nunca testado, com os
 * mesmos dois erros conhecidos (o `public` que já existe, os papéis do
 * provedor) aparecendo de outro jeito. Cópia serve para o dia ruim, e no dia
 * ruim se usa o caminho que já deu certo uma vez.
 *
 * ## Onde a cópia mora, e onde ela NUNCA pode morar
 *
 * `~/dc360-copias/<data>.dump`, com permissão 0600, fora do repositório. O
 * dump traz DADO REAL DE CIDADÃO (`ocorrencias` guarda endereço, coordenada,
 * nome e contato do solicitante, descrição de vulnerabilidade). Ele nunca
 * entra em pasta versionada (viraria histórico de git para sempre), nunca em
 * pasta sincronizada com nuvem de arquivos (iCloud, Dropbox, Google Drive,
 * OneDrive: a máquina de quem opera não é subprocessador, e passaria a ser),
 * e nunca na Área de Trabalho. O roteiro RECUSA os três lugares.
 *
 * Apague a cópia quando a migração tiver sido conferida no ar. Cópia velha é
 * dado pessoal sem finalidade, exatamente o que a minimização por prazo existe
 * para impedir dentro do banco.
 *
 * ## O que precisa estar na máquina
 *
 * `pg_dump` da MESMA versão maior do servidor ou mais novo (o servidor é 17.x;
 * `pg_dump` 16 recusa, e recusa certo). Este Mac não vem com ele:
 *
 *   brew install libpq
 *   export PATH="$(brew --prefix libpq)/bin:$PATH"
 *   pg_dump --version      # tem que responder 17.x ou mais
 *
 * O roteiro procura também nos caminhos do Homebrew, para quem instalou e não
 * mexeu no PATH, e confere a versão do cliente contra a do servidor ANTES de
 * pedir o dump.
 *
 * ## Uso, de dentro de `dc360`
 *
 *   node scripts/copiar-producao.mjs --conferir   # só diz o que falta, sem tocar no banco
 *   node scripts/copiar-producao.mjs              # tira a cópia
 *
 * A senha vem do chaveiro do Mac, pelo mesmo cofre de `migrar-producao.mjs`,
 * e nunca passa pela tela nem pelo histórico. O `pg_dump` a recebe pela
 * variável `PGPASSWORD` do processo filho, não pela linha de comando.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { montarUrl, senhaDoChaveiro } from "./producao.mjs";

export const RAIZ_DO_REPO = dirname(dirname(fileURLToPath(import.meta.url)));

/** A âncora de confiança do provedor, que o libpq precisa receber por `sslrootcert`. */
export const CA_DO_PROVEDOR = join(RAIZ_DO_REPO, "db", "provedores", "supabase-prod-ca-2021.crt");

/** Onde as cópias moram. Fora do repositório, de propósito (ver o cabeçalho). */
export const PASTA_DE_COPIAS = join(homedir(), "dc360-copias");

/** Quanto tempo uma cópia vale para o migrador: trinta minutos. */
export const JANELA_DA_COPIA_MS = 30 * 60_000;

/** A versão maior que o servidor de produção roda hoje (Parte 6 do COLOCAR-DE-PE). */
export const VERSAO_MAIOR_DO_SERVIDOR = 17;

/**
 * `2026-09-15T19-30-00.dump`: ordena por nome, cabe em qualquer sistema de
 * arquivos (sem `:`), e diz quando foi tirada sem depender do mtime.
 */
export function nomeDaCopia(data) {
  return `${data.toISOString().replace(/\.\d{3}Z$/, "").replace(/:/g, "-")}.dump`;
}

/**
 * A URL para o `pg_dump`, com a raiz do provedor apontada.
 *
 * O `pg` do Node monta a âncora sozinho a partir do `sslmode`; o libpq não:
 * com `verify-full` e sem `sslrootcert`, ele procura `~/.postgresql/root.crt`,
 * não acha, e morre antes de conectar. Foi o obstáculo da Parte 6, contornado
 * ali com `sslmode=require`, que NÃO verifica a cadeia. Aqui a raiz vai na URL
 * e a verificação continua completa.
 */
export function montarUrlParaPgDump(senha, ca = CA_DO_PROVEDOR) {
  const url = new URL(montarUrl(senha));
  url.searchParams.set("sslrootcert", ca);
  return url.toString();
}

/**
 * Os lugares onde a cópia NÃO pode ficar, e por quê. Devolve a razão, ou
 * `null` quando a pasta serve.
 */
export function razaoParaRecusarAPasta(pasta, { raizDoRepo = RAIZ_DO_REPO, casa = homedir() } = {}) {
  const absoluta = resolve(pasta);
  if (absoluta === raizDoRepo || absoluta.startsWith(raizDoRepo + sep)) {
    return "está dentro do repositório: o dump traz dado de cidadão e viraria histórico de git para sempre";
  }
  const nuvem = ["iCloud", "Mobile Documents", "Dropbox", "Google Drive", "GoogleDrive", "OneDrive"];
  const trecho = nuvem.find((n) => absoluta.split(sep).some((parte) => parte.includes(n)));
  if (trecho) {
    return `está numa pasta sincronizada com nuvem de arquivos (${trecho}): a máquina de quem opera não é subprocessador, e passaria a ser`;
  }
  const areaDeTrabalho = join(casa, "Desktop");
  if (absoluta === areaDeTrabalho || absoluta.startsWith(areaDeTrabalho + sep)) {
    return "está na Área de Trabalho, que é onde cópia solta esquece de ser apagada";
  }
  return null;
}

/**
 * A cópia mais recente dentro da janela, ou `null`. É o que o migrador
 * pergunta antes de aplicar.
 */
export function copiaRecente({ pasta = PASTA_DE_COPIAS, agora = new Date(), janelaMs = JANELA_DA_COPIA_MS } = {}) {
  if (!existsSync(pasta)) return null;
  const candidatas = readdirSync(pasta)
    .filter((nome) => nome.endsWith(".dump"))
    .map((nome) => {
      const caminho = join(pasta, nome);
      const info = statSync(caminho);
      return { caminho, nome, modificadaEm: info.mtime, bytes: info.size };
    })
    .filter((c) => c.bytes > 0)
    .sort((a, b) => b.modificadaEm.getTime() - a.modificadaEm.getTime());
  const ultima = candidatas[0];
  if (!ultima) return null;
  const idadeMs = agora.getTime() - ultima.modificadaEm.getTime();
  if (idadeMs < 0 || idadeMs > janelaMs) return null;
  return { ...ultima, idadeMs };
}

/** `pg_dump (PostgreSQL) 17.6` vira `17.6`; qualquer outra coisa vira `null`. */
export function versaoDoPgDump(saida) {
  const m = /\(PostgreSQL\)\s+(\d+)(?:\.(\d+))?/.exec(saida ?? "");
  return m ? `${m[1]}${m[2] ? `.${m[2]}` : ""}` : null;
}

/** A versão maior do cliente precisa ser a do servidor, ou mais nova. */
export function clienteServe(versaoDoCliente, versaoMaiorDoServidor = VERSAO_MAIOR_DO_SERVIDOR) {
  const maior = Number.parseInt(String(versaoDoCliente ?? "").split(".")[0], 10);
  return Number.isFinite(maior) && maior >= versaoMaiorDoServidor;
}

/**
 * Acha o `pg_dump`: no PATH, nos caminhos do Homebrew para quem instalou o
 * `libpq` e não mexeu no PATH (o Homebrew não o linka, de propósito), ou nos
 * do instalador padrão do Windows, que também não mexe no PATH. O mais novo
 * primeiro, porque cliente mais novo que o servidor serve.
 */
export function localizarPgDump({ candidatos = [
  "pg_dump",
  "/opt/homebrew/opt/libpq/bin/pg_dump",
  "/usr/local/opt/libpq/bin/pg_dump",
  "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe",
  "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe",
], executar = (caminho) => execFileSync(caminho, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }) } = {}) {
  for (const caminho of candidatos) {
    try {
      const saida = executar(caminho);
      const versao = versaoDoPgDump(saida);
      if (versao) return { caminho, versao };
    } catch {
      // próximo candidato
    }
  }
  return null;
}

export const COMO_INSTALAR =
  "Não achei um pg_dump que sirva. Instale o cliente do Postgres e ponha no PATH:\n\n"
  + "  brew install libpq\n"
  + "  export PATH=\"$(brew --prefix libpq)/bin:$PATH\"\n"
  + "  pg_dump --version      # tem que responder 17.x ou mais\n\n"
  + "O servidor de produção é PostgreSQL 17 (docs/COLOCAR-DE-PE.md, Parte 6), e um\n"
  + "pg_dump mais velho que o servidor recusa, e recusa certo.";

/**
 * A versão do servidor, perguntada com o `pg` do repositório antes de chamar o
 * `pg_dump`. A mesma URL do `pg_dump`: o `pg` lê `sslrootcert` da string e
 * verifica a cadeia com ela, como o libpq.
 */
async function versaoDoServidor(url) {
  const { default: pg } = await import("pg");
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    const r = await cliente.query("SELECT current_setting('server_version') AS v");
    return String(r.rows[0]?.v ?? "");
  } finally {
    await cliente.end();
  }
}

const chamadoDiretamente = process.argv[1]?.endsWith("copiar-producao.mjs") ?? false;

if (chamadoDiretamente) {
  const soConferir = process.argv.includes("--conferir");
  const problemas = [];

  const pgDump = localizarPgDump();
  if (!pgDump) problemas.push(COMO_INSTALAR);
  else if (!clienteServe(pgDump.versao)) {
    problemas.push(`O pg_dump encontrado (${pgDump.caminho}) é ${pgDump.versao}, e o servidor é ${VERSAO_MAIOR_DO_SERVIDOR}.x. ${COMO_INSTALAR}`);
  }

  const recusa = razaoParaRecusarAPasta(PASTA_DE_COPIAS);
  if (recusa) problemas.push(`A pasta de cópias (${PASTA_DE_COPIAS}) ${recusa}.`);
  if (!existsSync(CA_DO_PROVEDOR)) {
    problemas.push(`Falta a âncora de confiança do provedor em ${CA_DO_PROVEDOR}: sem ela o pg_dump não verifica a cadeia.`);
  }

  const ultima = copiaRecente({ janelaMs: Number.MAX_SAFE_INTEGER });
  console.log(
    `Pasta de cópias: ${PASTA_DE_COPIAS}\n`
    + `pg_dump: ${pgDump ? `${pgDump.caminho} (${pgDump.versao})` : "não encontrado"}\n`
    + `Última cópia: ${ultima ? `${ultima.nome}, ${Math.round(ultima.idadeMs / 60_000)} min atrás, ${ultima.bytes} bytes` : "nenhuma"}\n`,
  );

  if (problemas.length > 0) {
    console.error(problemas.join("\n\n"));
    process.exit(1);
  }
  if (soConferir) {
    console.log("Só conferindo: nada foi lido do banco. Para copiar, rode sem --conferir.");
    process.exit(0);
  }

  const senha = senhaDoChaveiro();
  const url = montarUrlParaPgDump(senha);

  const servidor = await versaoDoServidor(url);
  const maiorDoServidor = Number.parseInt(servidor.split(".")[0], 10);
  if (!clienteServe(pgDump.versao, maiorDoServidor)) {
    console.error(`O servidor é ${servidor} e o pg_dump é ${pgDump.versao}: o cliente precisa ser ${maiorDoServidor}.x ou mais novo.\n\n${COMO_INSTALAR}`);
    process.exit(1);
  }

  mkdirSync(PASTA_DE_COPIAS, { recursive: true, mode: 0o700 });
  chmodSync(PASTA_DE_COPIAS, 0o700);
  const destino = join(PASTA_DE_COPIAS, nomeDaCopia(new Date()));

  console.log(`Copiando a produção (servidor ${servidor}) para ${destino} ...`);
  /*
    `--schema=public` porque o produto inteiro mora nele; os outros esquemas
    são infraestrutura do provedor (Parte 6). A senha vai por PGPASSWORD, e a
    URL sem senha na linha de comando: `ps` de outro usuário da máquina veria a
    linha, e não vê a variável.
  */
  const semSenha = new URL(url);
  semSenha.password = "";
  const r = spawnSync(
    pgDump.caminho,
    ["--format=custom", "--schema=public", `--file=${destino}`, semSenha.toString()],
    { stdio: "inherit", env: { ...process.env, PGPASSWORD: senha } },
  );
  if (r.status !== 0) {
    console.error(`\nO pg_dump saiu com código ${r.status}. Nenhuma cópia válida foi gravada.`);
    process.exit(r.status ?? 1);
  }
  chmodSync(destino, 0o600);
  const bytes = statSync(destino).size;
  console.log(
    `\nPronto: ${destino} (${bytes} bytes, permissão 0600).\n`
    + "A cópia vale por trinta minutos para `node scripts/migrar-producao.mjs --aplicar`.\n"
    + "Ela traz dado real de cidadão: não copie para nuvem de arquivos, não mande por\n"
    + "mensagem, e apague quando a migração tiver sido conferida no ar.",
  );
}
