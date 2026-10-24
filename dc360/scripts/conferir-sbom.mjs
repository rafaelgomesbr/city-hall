/**
 * Confere que um arquivo é mesmo um SBOM CycloneDX com conteúdo (V2-F01-E19).
 *
 * Por que existe: um gerador que falha em silêncio, ou que lê a pasta errada,
 * produz um JSON bem formado e VAZIO, e um SBOM vazio anexado ao Release parece
 * prova e não prova nada. O `sbom.yml` chama este script para cada um dos quatro
 * arquivos antes de publicar, e o `publicar-sbom.sh` chama de novo na hora de
 * anexar.
 *
 * Uso: node scripts/conferir-sbom.mjs <arquivo.cdx.json> [--minimo=N]
 * Saída: 0 em ordem, 1 reprovado, 2 uso errado ou arquivo ilegível.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Defeitos do documento (lista vazia = em ordem). `minimo` é o menor número de componentes aceito. */
export function problemasDoSbom(doc, minimo = 1) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc))
    return ["o conteúdo não é um objeto JSON"];
  const problemas = [];
  if (doc.bomFormat !== "CycloneDX")
    problemas.push(`bomFormat é ${JSON.stringify(doc.bomFormat)}, não "CycloneDX"`);
  if (typeof doc.specVersion !== "string" || !/^1\.\d+$/.test(doc.specVersion)) {
    problemas.push(`specVersion ilegível: ${JSON.stringify(doc.specVersion)}`);
  }
  const n = Array.isArray(doc.components) ? doc.components.length : 0;
  if (n < minimo)
    problemas.push(`${n} componente(s); o mínimo esperado é ${minimo} (SBOM vazio não é prova)`);
  const semNome = Array.isArray(doc.components)
    ? doc.components.filter((c) => !c || typeof c.name !== "string" || !c.name).length
    : 0;
  if (semNome > 0) problemas.push(`${semNome} componente(s) sem nome`);
  return problemas;
}

function principal(argv) {
  const arquivos = argv.filter((a) => !a.startsWith("--"));
  const opcao = argv.find((a) => a.startsWith("--"));
  const m = opcao ? /^--minimo=(\d+)$/.exec(opcao) : null;
  if (arquivos.length !== 1 || (opcao && !m)) {
    console.error("uso: node scripts/conferir-sbom.mjs <arquivo.cdx.json> [--minimo=N]");
    return 2;
  }
  const caminho = resolve(arquivos[0]);
  if (!existsSync(caminho)) {
    console.error(`conferir-sbom: não existe: ${caminho}`);
    return 2;
  }
  let doc;
  try {
    doc = JSON.parse(readFileSync(caminho, "utf8"));
  } catch (erro) {
    console.error(`conferir-sbom: não é JSON válido (${arquivos[0]}): ${erro.message}`);
    return 2;
  }
  const problemas = problemasDoSbom(doc, m ? Number(m[1]) : 1);
  if (problemas.length > 0) {
    for (const p of problemas) console.error(`conferir-sbom: ${arquivos[0]}: ${p}`);
    return 1;
  }
  console.log(`${arquivos[0]}: CycloneDX ${doc.specVersion}, ${doc.components.length} componentes`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = principal(process.argv.slice(2));
}
