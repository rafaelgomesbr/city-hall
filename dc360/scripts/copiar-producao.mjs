#!/usr/bin/env node
/**
 * COPIAR O BANCO de um ambiente antes de mexer nele: um dump lógico, fora do
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
 * ## A extensão `pg_trgm` (V2-F01-E15)
 *
 * O `pg_dump` leva `--extension=pg_trgm`. Com `--schema=public` sozinho o dump
 * não leva extensão nenhuma, e desde a migração 041 o `pg_restore
 * --exit-on-error` para no índice de busca com
 * `operator class "public.gin_trgm_ops" does not exist for access method "gin"`
 * (provado em `docs/RESTORE-DO-BANCO.md`, passo 3). Até a E15 este roteiro não
 * passava a opção, e uma cópia feita por ele não restaurava além da 041.
 *
 * ## Onde a cópia mora, e onde ela NUNCA pode morar
 *
 * `~/dc360-copias/<ambiente>/<data>.dump`, fora do repositório. Cada ambiente
 * tem a sua subpasta: a cópia de HML nunca vale como cópia de PROD para o
 * portão do migrador. Permissão só de quem rodou: 0600 no macOS e no Linux; no
 * Windows, ACL por `icacls` só para o usuário. Desde a correção 1 da F01 o
 * arquivo nasce VAZIO, é restringido e a permissão que o disco devolve é LIDA
 * e conferida (no Windows, a DACL inteira: só o operador e o SYSTEM) antes de
 * o `pg_dump` escrever o primeiro byte, e de novo depois. Se a ACL não puder
 * ser aplicada ou sobrar qualquer outra entrada, o roteiro RECUSA gravar
 * (apaga o que gravou e sai com erro). No fim, imprime o comando exato que
 * apaga a cópia.
 *
 * O dump traz DADO REAL DE CIDADÃO em PROD (`ocorrencias` guarda endereço,
 * coordenada, nome e contato do solicitante, descrição de vulnerabilidade). Em
 * HML o dado é sintético, mas o roteiro trata os dois igual. Ele nunca entra em
 * pasta versionada (viraria histórico de git para sempre), nunca em pasta
 * sincronizada com nuvem de arquivos (iCloud, Dropbox, Google Drive, OneDrive:
 * a máquina de quem opera não é subprocessador, e passaria a ser), e nunca na
 * Área de Trabalho. O roteiro RECUSA os três lugares, em qualquer sistema.
 *
 * Apague a cópia quando a migração tiver sido conferida no ar. Cópia velha é
 * dado pessoal sem finalidade, exatamente o que a minimização por prazo existe
 * para impedir dentro do banco.
 *
 * ## O que precisa estar na máquina
 *
 * `pg_dump` da MESMA versão maior do servidor ou mais novo (o servidor é 17.x;
 * `pg_dump` 16 recusa, e recusa certo). O roteiro procura, nesta ordem: a
 * variável `DC360_PG_DUMP` (caminho completo), o PATH e os lugares padrão de
 * cada sistema (Homebrew no macOS; pacotes do PGDG, `/usr/pgsql-NN` e
 * Linuxbrew no Linux; `C:\Program Files\PostgreSQL\NN\bin` no Windows). Sem
 * ele, a saída diz o que instalar naquele sistema. A versão do cliente é
 * conferida contra a do servidor ANTES de pedir o dump.
 *
 * ## Uso, de dentro de `dc360`
 *
 *   node scripts/copiar-producao.mjs --ambiente prod --conferir   # só diz o que falta, sem tocar no banco
 *   node scripts/copiar-producao.mjs --ambiente prod              # tira a cópia
 *
 * `--ambiente hml|prod` é obrigatório. A senha vem de `producao.mjs` (variável
 * de ambiente, chaveiro do sistema ou pergunta sem eco) e nunca passa pela
 * linha de comando nem pelo histórico. O `pg_dump` a recebe pela variável
 * `PGPASSWORD` do processo filho.
 *
 * O pipeline de HML (V2-F01-E12) chama este mesmo roteiro com `--ambiente hml`
 * e a senha em `DC360_SENHA_BANCO_HML`, antes de migrar.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, posix, resolve, sep, win32 } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ErroDeUso, HOST, PORTA, PROJETO, lerAmbiente, linhasDoAlvo, montarUrl, obterSenha, perfilDoAmbiente,
  sairComMensagem,
} from "./producao.mjs";

export const RAIZ_DO_REPO = dirname(dirname(fileURLToPath(import.meta.url)));

/** A âncora de confiança do provedor, que o libpq precisa receber por `sslrootcert`. */
export const CA_DO_PROVEDOR = join(RAIZ_DO_REPO, "db", "provedores", "supabase-prod-ca-2021.crt");

/** Onde as cópias moram. Fora do repositório, de propósito (ver o cabeçalho). */
export const PASTA_DE_COPIAS = join(homedir(), "dc360-copias");

/**
 * A subpasta de UM ambiente. Separada de propósito: o portão do migrador olha
 * só a pasta do ambiente que vai migrar, então cópia de HML não libera PROD.
 */
export function pastaDeCopias(ambiente, raiz = PASTA_DE_COPIAS) {
  if (!["hml", "prod"].includes(ambiente)) throw new Error(`ambiente inválido para a pasta de cópias: ${ambiente}`);
  return join(raiz, ambiente);
}

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
export function montarUrlParaPgDump(senha, ca = CA_DO_PROVEDOR, perfil = { projeto: PROJETO, host: HOST, porta: PORTA }) {
  const url = new URL(montarUrl(senha, perfil));
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
 * pergunta antes de aplicar. `pasta` é a do AMBIENTE (ver `pastaDeCopias`).
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
 * Onde procurar o `pg_dump` em cada sistema, em ordem. Vence o primeiro que
 * responder `--version` com uma versão que SERVE (ver `localizarPgDump`).
 *
 * Os caminhos são montados com `posix` ou `win32` explícitos, e não com o
 * `path` do sistema em que o teste roda: assim "como é no Windows" se prova em
 * qualquer máquina.
 */
export function candidatosDePgDump({ plataforma = process.platform, env = process.env } = {}) {
  const lista = [];
  if (env.DC360_PG_DUMP) lista.push(env.DC360_PG_DUMP);
  lista.push("pg_dump");
  const versoes = [18, 17];
  if (plataforma === "win32") {
    const pastas = [env.ProgramFiles ?? "C:\\Program Files", env["ProgramFiles(x86)"]].filter(Boolean);
    for (const pasta of pastas) {
      for (const v of versoes) lista.push(win32.join(pasta, "PostgreSQL", String(v), "bin", "pg_dump.exe"));
    }
  } else if (plataforma === "linux") {
    for (const v of versoes) {
      lista.push(posix.join("/usr/lib/postgresql", String(v), "bin", "pg_dump")); // Debian, Ubuntu, PGDG
      lista.push(posix.join("/usr", `pgsql-${v}`, "bin", "pg_dump")); // RHEL, Fedora, PGDG
    }
    lista.push("/usr/local/pgsql/bin/pg_dump");
    lista.push("/home/linuxbrew/.linuxbrew/opt/libpq/bin/pg_dump");
  } else {
    lista.push("/opt/homebrew/opt/libpq/bin/pg_dump", "/usr/local/opt/libpq/bin/pg_dump");
  }
  return lista;
}

/**
 * Acha o `pg_dump`: no PATH, ou nos lugares padrão do sistema para quem
 * instalou e não mexeu no PATH (o Homebrew, por exemplo, não linka o `libpq`,
 * de propósito).
 *
 * Vence o primeiro candidato, na ordem de `candidatosDePgDump`, cuja versão
 * SERVE (`versaoMinima` ou mais nova). Até a correção 1 da F01 vencia o
 * primeiro com versão LEGÍVEL: um 16 no PATH escondia o 17 instalado em
 * Program Files, e o roteiro recusava mesmo havendo cliente que serve. Sem
 * nenhum que sirva, devolve o primeiro legível, para a recusa dizer o que achou.
 */
export function localizarPgDump({
  plataforma = process.platform,
  env = process.env,
  candidatos = candidatosDePgDump({ plataforma, env }),
  versaoMinima = VERSAO_MAIOR_DO_SERVIDOR,
  executar = (caminho) => execFileSync(caminho, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
} = {}) {
  let primeiroLegivel = null;
  for (const caminho of candidatos) {
    let versao = null;
    try {
      versao = versaoDoPgDump(executar(caminho));
    } catch {
      // próximo candidato
    }
    if (!versao) continue;
    if (clienteServe(versao, versaoMinima)) return { caminho, versao };
    primeiroLegivel ??= { caminho, versao };
  }
  return primeiroLegivel;
}

const SOBRE_A_VERSAO =
  "O servidor é PostgreSQL 17 (docs/COLOCAR-DE-PE.md, Parte 6), e um pg_dump mais\n"
  + "velho que o servidor recusa, e recusa certo.";

/** O que instalar, no sistema em que se está. */
export function comoInstalar(plataforma = process.platform) {
  const cabeca = "Não achei um pg_dump que sirva. Instale o cliente do Postgres (17 ou mais novo) e ponha no PATH:\n\n";
  if (plataforma === "win32") {
    return cabeca
      + "  Instalador da EDB (https://www.enterprisedb.com/downloads/postgres-postgresql-downloads),\n"
      + "  marcando só \"Command Line Tools\"; ou o pacote do PostgreSQL 17 pelo winget, Chocolatey ou Scoop.\n"
      + "  Depois, num PowerShell novo:  pg_dump --version      # tem que responder 17.x ou mais\n"
      + "  Se instalou fora do PATH, aponte o caminho completo:\n"
      + "    $env:DC360_PG_DUMP = \"C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe\"\n\n"
      + SOBRE_A_VERSAO;
  }
  if (plataforma === "linux") {
    return cabeca
      + "  Debian e Ubuntu: repositório do PGDG (https://www.postgresql.org/download/linux/), depois\n"
      + "    sudo apt install postgresql-client-17\n"
      + "  Fedora e RHEL: repositório do PGDG, depois  sudo dnf install postgresql17\n"
      + "  pg_dump --version      # tem que responder 17.x ou mais\n"
      + "  Se instalou fora do PATH, aponte o caminho completo:\n"
      + "    export DC360_PG_DUMP=/usr/lib/postgresql/17/bin/pg_dump\n\n"
      + SOBRE_A_VERSAO;
  }
  return cabeca
    + "  brew install libpq\n"
    + "  export PATH=\"$(brew --prefix libpq)/bin:$PATH\"\n"
    + "  pg_dump --version      # tem que responder 17.x ou mais\n\n"
    + SOBRE_A_VERSAO;
}

/** O texto de macOS, mantido porque outros testes e documentos o citam. */
export const COMO_INSTALAR = comoInstalar("darwin");

/**
 * Os argumentos do `pg_dump`.
 *
 * `--schema=public` porque o produto inteiro mora nele; os outros esquemas são
 * infraestrutura do provedor (Parte 6). `--extension=pg_trgm` porque, desde a
 * migração 041, o `pg_restore --exit-on-error` para no índice de busca sem
 * ela (`docs/RESTORE-DO-BANCO.md`, passo 3). A URL vai SEM senha: `ps` de outro
 * usuário da máquina veria a linha, e não vê a variável de ambiente.
 */
export function argumentosDoPgDump({ destino, urlSemSenha }) {
  return ["--format=custom", "--schema=public", "--extension=pg_trgm", `--file=${destino}`, urlSemSenha];
}

/** Os argumentos do `icacls`: sem herança, controle total só ao usuário. */
export function comandoDeAcl(caminho, usuario, { pasta = false } = {}) {
  return [caminho, "/inheritance:r", "/grant:r", `${usuario}:${pasta ? "(OI)(CI)F" : "F"}`];
}

/** `DOMINIO\usuario` do Windows, das variáveis da sessão ou do `whoami`. */
export function usuarioDoWindows({ env = process.env, executar } = {}) {
  if (env.USERNAME) return env.USERDOMAIN ? `${env.USERDOMAIN}\\${env.USERNAME}` : env.USERNAME;
  const quem = executar("whoami", []).trim();
  if (!quem) throw new ErroDeUso("Não consegui descobrir o usuário do Windows para restringir a cópia.", 1);
  return quem;
}

/**
 * Lê a DACL que `icacls <caminho>` imprime: o caminho e a primeira entrada na
 * mesma linha, as outras alinhadas embaixo, uma linha em branco e o resumo.
 * Devolve `[{ principal, permissoes }]`. Saída que não tem esse formato LANÇA:
 * uma DACL que não se consegue ler não é uma DACL conferida.
 */
export function lerDaclDoIcacls(saida, caminho) {
  const ilegivel = (motivo) => new ErroDeUso(
    `Não consegui ler a ACL de ${caminho} na saída do icacls (${motivo}). Recuso gravar a cópia:\n`
    + "uma permissão que não se confere não protege o dado de cidadão.",
    1,
  );
  const linhas = String(saida ?? "").split(/\r?\n/);
  const primeira = linhas[0] ?? "";
  if (!primeira.toLowerCase().startsWith(caminho.toLowerCase())) throw ilegivel("a primeira linha não é o caminho pedido");
  const brutas = [primeira.slice(caminho.length)];
  for (const linha of linhas.slice(1)) {
    if (linha.trim() === "") break;
    brutas.push(linha);
  }
  const entradas = [];
  for (const bruta of brutas.map((l) => l.trim()).filter(Boolean)) {
    const m = /^(.+?):((?:\([^()]*\))+)$/.exec(bruta);
    if (!m) throw ilegivel(`entrada fora do formato: ${bruta}`);
    entradas.push({ principal: m[1], permissoes: m[2] });
  }
  if (entradas.length === 0) throw ilegivel("nenhuma entrada");
  return entradas;
}

/** O SYSTEM, com o nome em inglês e em português: ele lê tudo de qualquer jeito. */
const NOMES_DO_SYSTEM = new Set(["nt authority\\system", "autoridade nt\\sistema"]);

/** As entradas que não são do operador nem do SYSTEM (comparação sem caixa). */
export function entradasAlheias(entradas, usuario) {
  const dono = usuario.toLowerCase();
  return entradas.filter((e) => {
    const nome = e.principal.toLowerCase();
    return nome !== dono && !NOMES_DO_SYSTEM.has(nome);
  });
}

/**
 * Confere a permissão que o DISCO devolve, depois de restringir: no Windows, a
 * DACL lida do `icacls`, que só pode ter o operador (e o SYSTEM); no macOS e
 * no Linux, o modo, sem nenhum bit de grupo ou de outros, e o dono. Reprova
 * com `ErroDeUso`, nomeando o que sobrou e como tirar.
 */
export function conferirAclDoDono(caminho, {
  plataforma = process.platform,
  env = process.env,
  executar = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
  stat = statSync,
  uid = typeof process.getuid === "function" ? process.getuid() : undefined,
} = {}) {
  if (plataforma !== "win32") {
    const info = stat(caminho);
    const modo = info.mode & 0o777;
    if ((modo & 0o077) !== 0) {
      throw new ErroDeUso(
        `${caminho} ficou com modo ${modo.toString(8).padStart(4, "0")}: grupo ou outros têm acesso. Recuso gravar a cópia.`,
        1,
      );
    }
    if (uid !== undefined && info.uid !== uid) {
      throw new ErroDeUso(`${caminho} não tem você como dono (uid ${info.uid}). Recuso gravar a cópia.`, 1);
    }
    return;
  }
  const usuario = usuarioDoWindows({ env, executar });
  let saida;
  try {
    saida = executar("icacls", [caminho]);
  } catch {
    throw new ErroDeUso(`Não consegui ler a ACL de ${caminho} (o icacls falhou). Recuso gravar a cópia.`, 1);
  }
  const entradas = lerDaclDoIcacls(saida, caminho);
  const alheias = entradasAlheias(entradas, usuario);
  if (alheias.length > 0) {
    throw new ErroDeUso(
      `A ACL de ${caminho} tem acesso além do seu usuário (${usuario}):\n`
      + alheias.map((e) => `  ${e.principal}:${e.permissoes}`).join("\n")
      + "\nRecuso gravar a cópia: o dump traz dado de cidadão, e essas entradas o deixariam legível\n"
      + "por outra pessoa desta máquina enquanto o pg_dump escreve. Tire cada uma e rode de novo:\n"
      + alheias.map((e) => `  icacls "${caminho}" /remove:g "${e.principal}"`).join("\n")
      + "\n(Se um nome aparecer com acento trocado, a página de código do console o estragou: rode\n"
      + `icacls "${caminho}" num PowerShell para ver o nome certo.)`,
      1,
    );
  }
  if (!entradas.some((e) => e.principal.toLowerCase() === usuario.toLowerCase())) {
    throw new ErroDeUso(`O seu usuário (${usuario}) não consta da ACL de ${caminho}. Recuso gravar a cópia.`, 1);
  }
}

/**
 * Restringe a pasta ou o arquivo ao dono e CONFERE o resultado. macOS e Linux:
 * `chmod`, depois o modo lido do disco. Windows: `icacls` tira as permissões
 * herdadas e concede controle total só ao usuário, depois a DACL é lida de
 * volta (`conferirAclDoDono`). A leitura existe porque `/inheritance:r` NÃO
 * tira concessão explícita: uma pasta que já dava leitura herdável a outro
 * grupo continuava dando, e o arquivo do dump nascia legível por ele (achado 1
 * da revisão independente da F01, provado numa sonda real no Windows).
 * Se não der, LANÇA: quem chama apaga o que gravou e recusa, porque um dump com
 * dado de cidadão legível por outro usuário da máquina é pior que nenhum dump.
 */
export function restringirAoDono(caminho, {
  plataforma = process.platform,
  pasta = false,
  env = process.env,
  executar = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
  chmod = chmodSync,
  stat = statSync,
  uid = typeof process.getuid === "function" ? process.getuid() : undefined,
} = {}) {
  if (plataforma !== "win32") {
    chmod(caminho, pasta ? 0o700 : 0o600);
    conferirAclDoDono(caminho, { plataforma, stat, uid });
    return;
  }
  try {
    executar("icacls", comandoDeAcl(caminho, usuarioDoWindows({ env, executar }), { pasta }));
  } catch (erro) {
    if (erro instanceof ErroDeUso) throw erro;
    throw new ErroDeUso(
      `Não consegui restringir ${caminho} só ao seu usuário (o icacls falhou). Recuso gravar a cópia:\n`
      + "o dump traz dado de cidadão, e sem a ACL outro usuário desta máquina poderia lê-lo.",
      1,
    );
  }
  conferirAclDoDono(caminho, { plataforma, env, executar });
}

/**
 * Prepara o destino da cópia ANTES de qualquer byte: a pasta do ambiente
 * restrita e conferida, e o arquivo criado VAZIO (`wx`: nunca sobrescreve),
 * restrito e conferido. Só depois disto o `pg_dump` pode escrever nele, e ele
 * escreve no arquivo que já existe, mantendo a permissão (o `pg_dump` abre com
 * truncamento, e truncar não troca a ACL nem o modo). Se a conferência do
 * arquivo reprovar, ele é apagado antes de a recusa subir.
 */
export function prepararDestinoDaCopia({ pasta, destino, criarVazio, ...opcoes }) {
  mkdirSync(pasta, { recursive: true, mode: 0o700 });
  restringirAoDono(pasta, { ...opcoes, pasta: true });
  const criar = criarVazio ?? ((alvo) => closeSync(openSync(alvo, "wx", 0o600)));
  try {
    criar(destino);
  } catch (erro) {
    if (erro?.code === "EEXIST") throw new ErroDeUso(`${destino} já existe: a cópia nunca sobrescreve outra (EEXIST).`, 1);
    throw erro;
  }
  try {
    restringirAoDono(destino, opcoes);
  } catch (erro) {
    rmSync(destino, { force: true });
    throw erro;
  }
}

/**
 * A cópia inteira, sem o banco: prepara o destino, roda o `pg_dump` (que quem
 * chama passa em `rodarPgDump(destino)`, devolvendo o código de saída) e
 * confere a permissão DE NOVO depois que ele escreveu. Falha do `pg_dump` apaga
 * o que tiver ficado e devolve o código; permissão errada depois apaga o dump
 * e lança. Devolve `{ status, bytes }`.
 */
export function tirarCopia({ pasta, destino, rodarPgDump, ...opcoes }) {
  prepararDestinoDaCopia({ pasta, destino, ...opcoes });
  const status = rodarPgDump(destino);
  if (status !== 0) {
    rmSync(destino, { force: true });
    return { status: status ?? 1, bytes: 0 };
  }
  try {
    conferirAclDoDono(destino, opcoes);
  } catch (erro) {
    rmSync(destino, { force: true });
    throw erro;
  }
  return { status: 0, bytes: statSync(destino).size };
}

/**
 * O comando que apaga ESTA cópia, com o caminho exato entre aspas simples. O
 * roteiro o imprime no fim: o runbook dizia um caminho que não era o da cópia
 * (achado 12 da revisão independente da F01), e quem seguia o runbook deixava
 * o dump com dado pessoal no disco.
 */
export function comandoParaApagar(caminho, plataforma = process.platform) {
  if (plataforma === "win32") return `Remove-Item -LiteralPath '${caminho.replace(/'/g, "''")}'`;
  return `rm -- '${caminho.replace(/'/g, "'\\''")}'`;
}

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

async function principal(argv) {
  const { ambiente, restante } = lerAmbiente(argv);
  const soConferir = restante.includes("--conferir");
  const perfil = perfilDoAmbiente(ambiente);
  const pasta = pastaDeCopias(ambiente);
  const plataforma = process.platform;
  const problemas = [];

  let pgDump = localizarPgDump();
  if (!pgDump) problemas.push(comoInstalar(plataforma));
  else if (!clienteServe(pgDump.versao)) {
    problemas.push(`O pg_dump encontrado (${pgDump.caminho}) é ${pgDump.versao}, e o servidor é ${VERSAO_MAIOR_DO_SERVIDOR}.x. ${comoInstalar(plataforma)}`);
  }

  const recusa = razaoParaRecusarAPasta(pasta);
  if (recusa) problemas.push(`A pasta de cópias (${pasta}) ${recusa}.`);
  if (!existsSync(CA_DO_PROVEDOR)) {
    problemas.push(`Falta a âncora de confiança do provedor em ${CA_DO_PROVEDOR}: sem ela o pg_dump não verifica a cadeia.`);
  }

  const ultima = copiaRecente({ pasta, janelaMs: Number.MAX_SAFE_INTEGER });
  console.log(
    `${linhasDoAlvo(perfil)}\n`
    + `Pasta de cópias: ${pasta}\n`
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

  const senha = await obterSenha({ perfil });
  const url = montarUrlParaPgDump(senha, CA_DO_PROVEDOR, perfil);

  const servidor = await versaoDoServidor(url);
  const maiorDoServidor = Number.parseInt(servidor.split(".")[0], 10);
  if (!clienteServe(pgDump.versao, maiorDoServidor)) {
    // O servidor pode ser mais novo que o 17 que a busca supôs: procura de novo, com a versão real.
    pgDump = localizarPgDump({ versaoMinima: maiorDoServidor }) ?? pgDump;
  }
  if (!clienteServe(pgDump.versao, maiorDoServidor)) {
    console.error(`O servidor é ${servidor} e o pg_dump é ${pgDump.versao}: o cliente precisa ser ${maiorDoServidor}.x ou mais novo.\n\n${comoInstalar(plataforma)}`);
    process.exit(1);
  }

  /*
    A pasta e o ARQUIVO são restringidos e conferidos ANTES do dump: o arquivo
    nasce vazio, só do operador, e o pg_dump escreve nele. Depois a permissão é
    conferida de novo. Se qualquer conferência falhar, o roteiro apaga o que
    tiver gravado e recusa.
  */
  const destino = join(pasta, nomeDaCopia(new Date()));
  const semSenha = new URL(url);
  semSenha.password = "";
  const r = tirarCopia({
    pasta,
    destino,
    rodarPgDump: (alvo) => {
      console.log(`Copiando o banco de ${ambiente.toUpperCase()} (servidor ${servidor}) para ${alvo} ...`);
      return spawnSync(
        pgDump.caminho,
        argumentosDoPgDump({ destino: alvo, urlSemSenha: semSenha.toString() }),
        { stdio: "inherit", env: { ...process.env, PGPASSWORD: senha } },
      ).status;
    },
  });
  if (r.status !== 0) {
    console.error(`\nO pg_dump saiu com código ${r.status}. Nenhuma cópia válida foi gravada.`);
    process.exit(r.status);
  }
  console.log(
    `\nPronto: ${destino} (${r.bytes} bytes, legível só por você).\n`
    + `A cópia vale por trinta minutos para \`node scripts/migrar-producao.mjs --ambiente ${ambiente} --aplicar\`.\n`
    + "Ela pode trazer dado real de cidadão: não copie para nuvem de arquivos, não mande por\n"
    + "mensagem, e apague quando a migração tiver sido conferida no ar, com:\n\n"
    + `  ${comandoParaApagar(destino, plataforma)}`,
  );
}

const chamadoDiretamente = process.argv[1]?.endsWith("copiar-producao.mjs") ?? false;

if (chamadoDiretamente) {
  try {
    await principal(process.argv.slice(2));
  } catch (erro) {
    sairComMensagem(erro);
  }
}
