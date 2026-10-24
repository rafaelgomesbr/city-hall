#!/usr/bin/env node
/**
 * Confere a formatação (Prettier) com baseline que só diminui (V2-F01-E17).
 *
 * O código nasceu sem Prettier. Reformatar tudo de uma vez é UM PR à parte (e o
 * commit entra em `.git-blame-ignore-revs`), porque um diff desse tamanho
 * conflita com qualquer outra mudança em andamento. Até lá:
 *
 *   - arquivo versionado que o Prettier aprova hoje TEM de continuar aprovado;
 *   - arquivo novo TEM de nascer formatado;
 *   - arquivo que já estava mal formatado fica em `formato-baseline.json` e não
 *     reprova, mas quando alguém o formata o script exige que ele saia da lista
 *     (a lista só desce), e `lint-teto.mjs contra-base` reprova entrada nova.
 *
 * O roteiro original da etapa dizia "`prettier --check` só nos arquivos do PR".
 * A baseline faz o mesmo trabalho sem depender de saber o ramo-base (que no CI
 * muda entre pull request e push) e ainda pega o arquivo que a mudança estragou
 * sem tocá-lo.
 *
 * Uso (em `dc360/`):
 *   node scripts/formato-conferir.mjs              # confere
 *   node scripts/formato-conferir.mjs --podar      # tira da lista o que já está formatado
 *   node scripts/formato-conferir.mjs --criar      # grava a lista inicial (só se não existir)
 *   node scripts/formato-conferir.mjs --formatar   # prettier --write no que NÃO está na baseline
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";

const DC360 = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ARQUIVO_DA_BASELINE = "formato-baseline.json";
export const EXTENSOES = [".ts", ".tsx", ".js", ".mjs", ".cjs", ".css"];

export function ehCodigo(caminho) {
  return EXTENSOES.some((e) => caminho.endsWith(e));
}

/**
 * Arquivos de `dc360/` que o Prettier deve olhar (caminhos relativos, com `/`):
 * os versionados e os novos ainda sem `git add` (respeitando o `.gitignore`),
 * para que o arquivo recém-criado já seja conferido na máquina de quem o escreveu.
 */
export function listarVersionados(raiz = DC360) {
  const saida = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "."],
    { cwd: raiz, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const unicos = new Set(
    saida
      .split("\0")
      .filter(Boolean)
      .filter(ehCodigo)
      .filter((c) => existsSync(join(raiz, c))),
  );
  return [...unicos].sort();
}

/** Devolve os arquivos que o Prettier reformataria (ignorados pelo `.prettierignore` não entram). */
export async function listarMalFormatados(arquivos, raiz = DC360) {
  const ruins = [];
  for (const rel of arquivos) {
    const abs = join(raiz, rel);
    const info = await prettier.getFileInfo(abs, { ignorePath: join(raiz, ".prettierignore") });
    if (info.ignored || !info.inferredParser) continue;
    const config = (await prettier.resolveConfig(abs)) ?? {};
    const texto = readFileSync(abs, "utf8");
    const ok = await prettier.check(texto, { ...config, filepath: abs });
    if (!ok) ruins.push(rel);
  }
  return ruins;
}

/**
 * Compara o que está mal formatado com a baseline.
 * `novos`: mal formatado e fora da baseline (reprova).
 * `obsoletos`: na baseline mas já formatado ou inexistente (reprova: a lista só desce).
 */
export function compararComBaseline(malFormatados, baseline) {
  const ruins = new Set(malFormatados);
  const lista = new Set(baseline);
  return {
    novos: malFormatados.filter((a) => !lista.has(a)),
    obsoletos: baseline.filter((a) => !ruins.has(a)),
  };
}

function lerBaseline(raiz = DC360) {
  const caminho = join(raiz, ARQUIVO_DA_BASELINE);
  if (!existsSync(caminho)) return null;
  return JSON.parse(readFileSync(caminho, "utf8")).arquivos ?? [];
}

function gravar(lista, raiz = DC360) {
  const corpo = {
    versao: 1,
    explicacao:
      "Arquivos que já estavam fora do Prettier quando a E17 ligou o portão. Só desce: formate o arquivo e rode `node scripts/formato-conferir.mjs --podar`.",
    arquivos: [...lista].sort(),
  };
  writeFileSync(join(raiz, ARQUIVO_DA_BASELINE), `${JSON.stringify(corpo, null, 2)}\n`);
}

async function principal(argv) {
  const ruins = await listarMalFormatados(listarVersionados());
  const atual = lerBaseline();

  if (argv.includes("--criar")) {
    if (atual) {
      console.error(
        `RECUSADO: ${ARQUIVO_DA_BASELINE} já existe. Para baixar use --podar; subir é proibido.`,
      );
      return 1;
    }
    gravar(ruins);
    console.log(`${ARQUIVO_DA_BASELINE} criado com ${ruins.length} arquivo(s).`);
    return 0;
  }
  if (!atual) {
    console.error(`FALHA: ${ARQUIVO_DA_BASELINE} não existe. Rode com --criar uma vez.`);
    return 2;
  }
  if (argv.includes("--formatar")) {
    const alvo = ruins.filter((a) => !atual.includes(a));
    for (const rel of alvo) {
      const abs = join(DC360, rel);
      const config = (await prettier.resolveConfig(abs)) ?? {};
      writeFileSync(
        abs,
        await prettier.format(readFileSync(abs, "utf8"), { ...config, filepath: abs }),
      );
    }
    console.log(`${alvo.length} arquivo(s) formatado(s) (os da baseline ficam como estão).`);
    return 0;
  }

  const { novos, obsoletos } = compararComBaseline(ruins, atual);
  if (argv.includes("--podar")) {
    gravar(atual.filter((a) => !obsoletos.includes(a)));
    console.log(
      `${obsoletos.length} arquivo(s) saíram da baseline; restam ${atual.length - obsoletos.length}.`,
    );
    return novos.length ? 1 : 0;
  }

  if (novos.length) {
    console.error(
      `REPROVADO: ${novos.length} arquivo(s) fora do Prettier e fora da baseline:\n- ${novos.join("\n- ")}\n` +
        "Rode `npx prettier --write` neles (ou `node scripts/formato-conferir.mjs --formatar`).",
    );
  }
  if (obsoletos.length) {
    console.error(
      `REPROVADO: ${obsoletos.length} arquivo(s) na baseline que já estão formatados (ou sumiram):\n- ${obsoletos.join("\n- ")}\n` +
        "A lista só desce: rode `node scripts/formato-conferir.mjs --podar`.",
    );
  }
  if (novos.length || obsoletos.length) return 1;
  console.log(
    `OK: ${listarVersionados().length} arquivo(s) de código conferidos; ${atual.length} na baseline (só desce).`,
  );
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal(process.argv.slice(2)).then(
    (c) => process.exit(c),
    (e) => {
      console.error(`FALHA: ${e.stack ?? e}`);
      process.exit(2);
    },
  );
}
