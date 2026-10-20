#!/usr/bin/env node
/**
 * Confere os `INDEX.md` da evidência arquivada (V2-F00-E21, correção 1).
 *
 * O problema que isto fecha: o `INDEX.md` de uma etapa grava o SHA-256 dos
 * arquivos de evidência. Se o hash foi tirado do disco de uma máquina cujo fim
 * de linha o git muda ao commitar (CRLF no Windows, ou LF misturado com CRLF numa
 * saída colada à mão), ele deixa de bater em qualquer clone novo, e ninguém
 * percebe, porque nenhum teste relia a evidência. Em 2026-10-15 oito etapas da
 * F00 estavam assim.
 *
 * O que ele faz: para todo `INDEX.md` embaixo de `docs/evidencias-v2/` (em
 * qualquer profundidade), cada arquivo listado tem de existir e ter o SHA-256
 * listado. Lê os BYTES do disco, sem normalizar fim de linha: o objetivo é
 * justamente pegar a diferença de fim de linha. Quando o hash não bate mas bateria
 * trocando CRLF por LF (ou o contrário), a mensagem diz isso, porque é a causa
 * mais provável.
 *
 * Também reprova (falsos verdes que a revisão achou):
 *  - arquivo dentro da pasta do índice que o índice não lista;
 *  - pasta de etapa (qualquer subpasta de G00 etc. que não seja `validacao/`) sem `INDEX.md`;
 *  - índice que não lista nenhum arquivo de evidência (vazio, ou só com os do gatekeeper).
 *
 * Fora do alcance, de propósito: arquivo solto (que não está dentro de uma pasta de
 * etapa ou de `CP-xx`), como `G00/GUIA-DE-VALIDACAO-F00.md`. É documento, não
 * evidência com hash, e não pertence a nenhum índice.
 *
 * Fim de linha no git: `conferirFimDeLinhaNoGit` roda `git ls-files --eol` e
 * reprova (a) qualquer arquivo no índice do git com CRLF (`i/crlf`) ou misturado
 * (`i/mixed`), e (b) qualquer arquivo cujo atributo efetivo é `eol=lf` e que está no
 * disco com CRLF ou misturado (`w/crlf`, `w/mixed`): o git normaliza esse arquivo
 * para LF, então um INDEX calculado sobre os bytes do disco passa aqui e reprova num
 * clone novo (falso verde local). O `.gitattributes` (`* text=auto eol=lf`) já normaliza para
 * LF ao commitar; o que sobra de CRLF no índice é arquivo marcado `-text`, ou que
 * entrou antes da regra. Não há exceção: `*.ps1`, `*.bat` e `*.cmd` ficam CRLF só no
 * disco (`eol=crlf`), e no índice são LF. O controle contra o defeito original
 * é este script: um INDEX calculado sobre CRLF do disco fica vermelho no CI, porque
 * o checkout do CI traz os bytes que o git guarda (LF).
 *
 * O que ele NÃO confere (de propósito): `VEREDITO.md`, `RISCO-ACEITO.md` e tudo
 * em `validacao/` são do gatekeeper e mudam a cada rodada; não entram no índice
 * (mesma regra de `scripts/roadmap/conferir-evidencia.mjs`), nem o próprio `INDEX.md`.
 *
 * Não há lista de tolerância: índice que não bate reprova, em qualquer pasta.
 *
 * Uso: node scripts/conferir-indices-de-evidencia.mjs [pasta-de-evidencias]
 * Saída 1 se algum índice não bater, faltar índice de etapa ou houver CRLF no índice do git.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
export const PASTA_DE_EVIDENCIAS = resolve(AQUI, "..", "..", "docs", "evidencias-v2");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const ehDoGatekeeper = (arquivo) =>
  arquivo === "VEREDITO.md" || arquivo === "RISCO-ACEITO.md" || arquivo.startsWith("validacao/");

/** Linhas `| arquivo | sha256 |` do índice, em ordem, com o número da linha (1 a partir do topo). */
export function lerLinhasDoIndice(texto) {
  const linhas = [];
  texto.replace(/\r\n/g, "\n").split("\n").forEach((linha, i) => {
    const celulas = linha.split("|").map((c) => c.trim());
    if (celulas.length < 4 || celulas[0] !== "" || celulas[celulas.length - 1] !== "") return;
    const [arquivo, hash] = celulas.slice(1, -1);
    if (arquivo.toLowerCase() === "arquivo" || /^-+$/.test(arquivo)) return;
    linhas.push({ numero: i + 1, arquivo, hash: hash.toLowerCase() });
  });
  return linhas;
}

/** Todo `INDEX.md` embaixo de `raiz`, em qualquer profundidade, em ordem estável. */
export function acharIndices(raiz) {
  const achados = [];
  const varrer = (pasta) => {
    for (const nome of readdirSync(pasta).sort()) {
      const caminho = join(pasta, nome);
      if (statSync(caminho).isDirectory()) varrer(caminho);
      else if (nome === "INDEX.md") achados.push(caminho);
    }
  };
  if (existsSync(raiz)) varrer(raiz);
  return achados;
}

/** Todo arquivo (caminho relativo com `/`) embaixo de `pasta`, em ordem estável. */
function listarArquivos(pasta, base = pasta) {
  const achados = [];
  for (const nome of readdirSync(pasta).sort()) {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) achados.push(...listarArquivos(caminho, base));
    else achados.push(relative(base, caminho).split(sep).join("/"));
  }
  return achados;
}

/** Confere um `INDEX.md`. Devolve `{ listados, conferidos, problemas: string[] }`. */
export function conferirIndice(caminhoDoIndice) {
  const pasta = dirname(caminhoDoIndice);
  const linhas = lerLinhasDoIndice(readFileSync(caminhoDoIndice, "utf8"));
  const problemas = [];
  if (linhas.length === 0) problemas.push("o INDEX.md não tem nenhuma linha | arquivo | SHA-256 |");
  const vistos = new Set();
  let conferidos = 0;
  for (const { numero, arquivo, hash } of linhas) {
    if (ehDoGatekeeper(arquivo)) continue;
    if (vistos.has(arquivo)) {
      problemas.push(`linha ${numero}: ${arquivo} aparece duas vezes`);
      continue;
    }
    vistos.add(arquivo);
    if (!/^[0-9a-f]{64}$/.test(hash)) {
      problemas.push(`linha ${numero}: ${arquivo} tem um SHA-256 que não é 64 hexadecimais`);
      continue;
    }
    const alvo = resolve(pasta, arquivo);
    const rel = relative(pasta, alvo);
    if (isAbsolute(arquivo) || rel.startsWith("..")) {
      problemas.push(`linha ${numero}: ${arquivo} sai da pasta do índice`);
      continue;
    }
    if (!existsSync(alvo) || !statSync(alvo).isFile()) {
      problemas.push(`linha ${numero}: ${arquivo} está no índice e não existe na pasta`);
      continue;
    }
    conferidos++;
    const bytes = readFileSync(alvo);
    if (sha256(bytes) === hash) continue;
    const texto = bytes.toString("utf8");
    const lf = texto.replace(/\r\n/g, "\n");
    let causa = "";
    if (sha256(Buffer.from(lf, "utf8")) === hash) causa = " (bateria com todo o arquivo em LF: o índice foi calculado antes de o git trocar CRLF por LF)";
    else if (sha256(Buffer.from(lf.replace(/\n/g, "\r\n"), "utf8")) === hash) causa = " (bateria com todo o arquivo em CRLF: o índice foi calculado no Windows e o arquivo commitado é LF)";
    else if (/\r\n/.test(texto) && /[^\r]\n/.test(texto)) causa = " (o arquivo mistura CRLF e LF)";
    problemas.push(`linha ${numero}: ${arquivo} tem SHA-256 diferente do índice${causa}`);
  }
  if (conferidos === 0 && linhas.length > 0) problemas.push("o índice não lista nenhum arquivo de evidência (só os do gatekeeper): não prova nada");
  // Arquivo da pasta que o índice não lista. O INDEX.md (de qualquer profundidade) e os do gatekeeper ficam de fora.
  for (const arquivo of listarArquivos(pasta)) {
    if (arquivo.split("/").pop() === "INDEX.md" || ehDoGatekeeper(arquivo)) continue;
    if (!vistos.has(arquivo)) problemas.push(`${arquivo} existe na pasta e não está no índice`);
  }
  return { listados: linhas.length, conferidos, problemas };
}

/** Confere todos os índices embaixo de `raiz`. */
export function conferirTudo(raiz = PASTA_DE_EVIDENCIAS) {
  const resultado = { indices: [], falhas: [] };
  for (const caminho of acharIndices(raiz)) {
    const rel = relative(raiz, caminho).split(sep).join("/");
    const r = conferirIndice(caminho);
    resultado.indices.push({ indice: rel, ...r });
    if (r.problemas.length > 0) resultado.falhas.push({ indice: rel, problemas: r.problemas });
  }
  // Pasta de etapa sem `INDEX.md`: não há o que conferir, e isso não pode passar.
  if (existsSync(raiz)) {
    for (const fase of readdirSync(raiz).sort()) {
      const pastaDaFase = join(raiz, fase);
      if (!statSync(pastaDaFase).isDirectory()) continue; // arquivo solto na raiz ou em G00 (como o GUIA): fora do alcance, ver o cabeçalho
      if (!/^G\d+$/.test(fase)) {
        // Pasta de topo que não é de fase (CP-02, por exemplo) é evidência por si: precisa de índice.
        if (!existsSync(join(pastaDaFase, "INDEX.md"))) {
          resultado.falhas.push({ indice: `${fase}/INDEX.md`, problemas: ["a pasta de topo não tem INDEX.md"] });
        }
        continue;
      }
      for (const etapa of readdirSync(pastaDaFase).sort()) {
        const pastaDaEtapa = join(pastaDaFase, etapa);
        // Toda subpasta da fase é etapa, menos `validacao/` (pasta do gatekeeper da fase, sem índice).
        if (etapa === "validacao" || !statSync(pastaDaEtapa).isDirectory()) continue;
        if (!existsSync(join(pastaDaEtapa, "INDEX.md"))) {
          resultado.falhas.push({ indice: `${fase}/${etapa}/INDEX.md`, problemas: ["a pasta da etapa não tem INDEX.md"] });
        }
      }
    }
  }
  return resultado;
}

/**
 * Nenhum arquivo do repositório pode estar no índice do git com CRLF ou fim de
 * linha misto (`git ls-files --eol`: `i/crlf`, `i/mixed`). Devolve a lista de
 * problemas; se o git não roda, devolve um problema (fail-closed).
 */
export function conferirFimDeLinhaNoGit(raizDoRepositorio) {
  let saida;
  try {
    saida = execFileSync("git", ["-C", raizDoRepositorio, "ls-files", "--eol"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (erro) {
    return [`não consegui rodar git ls-files --eol em ${raizDoRepositorio}: ${String(erro.message).split("\n")[0]}`];
  }
  const problemas = [];
  for (const linha of saida.split("\n")) {
    const [campos, caminho] = linha.split("\t");
    if (!caminho) continue;
    const indice = campos.trim().split(/\s+/)[0];
    if (indice === "i/crlf" || indice === "i/mixed") problemas.push(`${caminho} está no índice do git com fim de linha ${indice.slice(2)} (${campos.trim()})`);
    const [, disco] = campos.trim().split(/\s+/);
    // `eol=lf` no atributo efetivo: o checkout devolve LF. CRLF no disco é um arquivo que ainda não passou pelo git
    // (o hash de um INDEX calculado agora não bate num clone novo). `*.ps1` etc. têm `eol=crlf` e não entram aqui.
    if ((disco === "w/crlf" || disco === "w/mixed") && /eol=lf/.test(campos.slice(campos.indexOf("attr/")))) {
      problemas.push(`${caminho} está no disco com fim de linha ${disco.slice(2)} e o git o devolve em LF (${campos.trim()}): o SHA-256 de um INDEX calculado agora não bate num clone novo`);
    }

  }
  return problemas;
}

export function relatorio(r, fimDeLinha = []) {
  const saida = [];
  const arquivos = r.indices.reduce((s, i) => s + i.conferidos, 0);
  saida.push(`Índices de evidência: ${r.indices.length} INDEX.md, ${arquivos} arquivo(s) conferido(s) byte a byte.`);
  for (const f of r.falhas) {
    saida.push(`FALHA ${f.indice}`);
    for (const p of f.problemas.slice(0, 20)) saida.push(`  - ${p}`);
    if (f.problemas.length > 20) saida.push(`  - e mais ${f.problemas.length - 20}`);
  }
  for (const p of fimDeLinha.slice(0, 20)) saida.push(`FALHA fim de linha no git: ${p}`);
  if (fimDeLinha.length > 20) saida.push(`FALHA fim de linha no git: e mais ${fimDeLinha.length - 20}`);
  const total = r.falhas.length + fimDeLinha.length;
  saida.push(total === 0 ? "RESULTADO: OK" : `RESULTADO: ${r.falhas.length} índice(s) não batem, ${fimDeLinha.length} arquivo(s) com fim de linha errado no git`);
  return saida.join("\n");
}

/*
  "Fui chamado como comando?" compara o caminho REAL. `import.meta.url` já vem
  resolvido pelo Node (sem link simbólico) e `process.argv[1]` não: com o
  repositório num caminho que passa por link (o `/var` do macOS, que é
  `/private/var`, ou um checkout ligado por symlink) as duas pontas diferiam, o
  bloco abaixo NÃO rodava, e o script saía com código 0 sem conferir nada. Era um
  falso verde do código de saída que o CI lê (V2-F00-E21, correção 2).
*/
const chamadoComoComando = () => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
};

if (chamadoComoComando()) {
  const raiz = process.argv[2] ? resolve(process.argv[2]) : PASTA_DE_EVIDENCIAS;
  const r = conferirTudo(raiz);
  // O fim de linha do git vale para o repositório inteiro, mas só se confere o repositório que contém a pasta padrão.
  const fimDeLinha = process.argv[2] ? [] : conferirFimDeLinhaNoGit(resolve(PASTA_DE_EVIDENCIAS, "..", ".."));
  console.log(relatorio(r, fimDeLinha));
  process.exit(r.falhas.length === 0 && fimDeLinha.length === 0 ? 0 : 1);
}
