/*
  Confere o resultado do `npx expo export` do aplicativo de campo (DV-39, job
  `aplicativo` de `.github/workflows/verificar.yml`).

  Por que existe: o jest do aplicativo não passa pelo Metro. Ele resolve os
  módulos com o resolvedor do Node e o Babel do jest; o Metro (o que empacota o
  aplicativo de verdade) tem resolvedor próprio, lê `exports` dos pacotes com
  `unstable_enablePackageExports` e faz outro corte de dependência. O
  `expo export` só empacota o JavaScript (sem Gradle nem Xcode), em segundos, e
  reprova com "Unable to resolve module" quando o Metro não acha um pacote.

  Sair com código 0 do `expo export` não basta: este conferidor abre o
  `metadata.json` que ele grava e olha DENTRO de cada pacote JavaScript gerado:

    1. cada plataforma pedida tem um pacote, não vazio;
    2. o pacote traz o zod 4 (a propriedade interna `_zod`, que o zod 3 não tem),
       que é a razão de o campo ter versão própria do zod;
    3. o pacote traz código do `@dc360/shared` (o nome de um campo do esquema
       da coleta), ou seja, o link `file:` do monorepo foi resolvido e
       empacotado, e não trocado por um módulo vazio.

  Uso (a partir de `dc360/`):

    node scripts/conferir-empacotamento-do-campo.mjs PASTA_DO_EXPORT android ios

  Imprime uma linha por plataforma com o tamanho e o SHA-256 do pacote (vai para
  o artefato do CI) e sai com 1 se algo faltar.
*/
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Marcas que o pacote precisa conter: nome e texto procurado. */
export const MARCAS = [
  { nome: "zod 4 (propriedade interna `_zod`)", texto: "_zod" },
  {
    nome: "código do @dc360/shared (campo `gpsPrecisaoMetros` do esquema da coleta)",
    texto: "gpsPrecisaoMetros",
  },
];

/** Mínimo de bytes para um pacote do aplicativo inteiro; abaixo disso o Metro empacotou quase nada. */
export const TAMANHO_MINIMO = 1_000_000;

/**
 * Devolve `{ linhas, problemas }` para as plataformas pedidas.
 * `lerPacote(caminhoRelativo)` devolve os bytes do pacote (injetável nos testes).
 */
export function conferirEmpacotamento(metadata, plataformas, lerPacote) {
  const linhas = [];
  const problemas = [];
  if (plataformas.length === 0) problemas.push("nenhuma plataforma informada");
  for (const plataforma of plataformas) {
    const pacote = metadata?.fileMetadata?.[plataforma]?.bundle;
    if (typeof pacote !== "string") {
      problemas.push(`${plataforma}: o metadata.json não lista pacote JavaScript`);
      continue;
    }
    let bytes;
    try {
      bytes = lerPacote(pacote);
    } catch {
      problemas.push(`${plataforma}: o pacote ${pacote} não existe no disco`);
      continue;
    }
    const texto = bytes.toString("utf8");
    linhas.push(
      `${plataforma}: ${pacote} ${bytes.length} bytes sha256=${createHash("sha256").update(bytes).digest("hex")}`,
    );
    if (bytes.length < TAMANHO_MINIMO)
      problemas.push(
        `${plataforma}: pacote com ${bytes.length} bytes, abaixo de ${TAMANHO_MINIMO}`,
      );
    for (const marca of MARCAS) {
      if (!texto.includes(marca.texto))
        problemas.push(`${plataforma}: o pacote não traz ${marca.nome}`);
    }
  }
  return { linhas, problemas };
}

function principal(argumentos) {
  const [pasta, ...plataformas] = argumentos;
  if (!pasta) {
    console.error("uso: conferir-empacotamento-do-campo.mjs PASTA_DO_EXPORT PLATAFORMA...");
    return 2;
  }
  let metadata;
  try {
    metadata = JSON.parse(readFileSync(join(pasta, "metadata.json"), "utf8"));
  } catch (erro) {
    console.error(`FALHA: não consegui ler ${join(pasta, "metadata.json")}: ${erro.message}`);
    return 1;
  }
  const { linhas, problemas } = conferirEmpacotamento(metadata, plataformas, (rel) => {
    const caminho = join(pasta, rel);
    statSync(caminho);
    return readFileSync(caminho);
  });
  for (const l of linhas) console.log(l);
  if (problemas.length > 0) {
    for (const p of problemas) console.error(`FALHA: ${p}`);
    return 1;
  }
  console.log(`Empacotamento do Metro conferido para: ${plataformas.join(", ")}.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(principal(process.argv.slice(2)));
}
