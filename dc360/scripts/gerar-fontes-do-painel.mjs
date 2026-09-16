#!/usr/bin/env node
/**
 * Gera as fontes do painel web (`apps/web/public/fontes/*.woff`) a partir dos
 * `.ttf` embarcados no aplicativo de campo.
 *
 * ## Por que o painel deixou de carregar fonte do Google
 *
 * Até 15/09/2026 `apps/web/src/estilos/tokens.css` abria com um `@import` de
 * `fonts.googleapis.com`. Cada abertura do painel mandava ao Google o endereço
 * IP, o agente do navegador e o endereço da página de quem estava usando, para
 * um servidor fora do país, e `docs/SUBPROCESSADORES.md` dizia que nenhum dado
 * sai do painel estático. Uma lista de subprocessadores que omite um destino é
 * uma lista falsa, e a correção certa não é acrescentar o Google à lista por
 * causa de tipografia: é parar de mandar. As fontes passam a ser servidas do
 * próprio painel, como o console já fazia (`apps/console/src/fontes.ts`).
 *
 * ## Por que WOFF e não WOFF2
 *
 * WOFF2 exige o codificador de brotli com as transformações de tabela da
 * especificação (glyf e loca reescritas), que não existe em Node puro nem na
 * máquina que gera isto, e o repositório não instala ferramenta de fora para
 * uma tarefa de cinco arquivos. WOFF 1.0 é o mesmo `.ttf`, tabela a tabela,
 * comprimido com zlib, que o Node tem embutido: cerca de metade do tamanho, e
 * lido por todo navegador desde 2012. A diferença para o WOFF2 são algumas
 * dezenas de kilobytes por face, uma vez, com cache de um ano.
 *
 * ## Procedência e licença
 *
 * Os `.ttf` são os de `apps/campo/assets/fontes` (Work Sans v24 e Roboto Mono
 * v31, baixados do serviço oficial de fontes do Google em 13/09/2026, ver
 * `PROVENIENCIA.txt` lá). Licença SIL Open Font License 1.1, cujo texto vai
 * junto para `apps/web/public/fontes/`. A OFL permite embarcar e redistribuir
 * com o produto; o que ela proíbe (vender a fonte sozinha) não é o caso.
 *
 * ## Por que os arquivos gerados ficam no repositório
 *
 * A Vercel publica `apps/web/dist` a cada push, e o `public/` do Vite entra
 * inteiro. Gerar no build seria mais um passo que ninguém confere; gerar aqui,
 * uma vez, e conferir por teste (`scripts/fontes-do-painel.test.mjs`) que o
 * que está no repositório é exatamente o que este roteiro produz, é o que
 * mantém as duas cópias iguais sem depender de memória.
 *
 * O nome do arquivo leva a versão da fonte de propósito: `vercel.json` serve
 * `/fontes/` com cache de um ano e `immutable`, então trocar a fonte é trocar
 * o nome, nunca o conteúdo debaixo do mesmo nome.
 *
 * Uso, de dentro de `dc360`:
 *   node scripts/gerar-fontes-do-painel.mjs
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

export const RAIZ = fileURLToPath(new URL("..", import.meta.url));
export const ORIGEM = join(RAIZ, "apps", "campo", "assets", "fontes");
export const DESTINO = join(RAIZ, "apps", "web", "public", "fontes");

/**
 * As cinco faces, e o que cada uma cobre no painel.
 *
 * O CSS do painel pede pesos 500, 600, 700 e 800 de Work Sans e 500 e 600 de
 * Roboto Mono, e o `@import` antigo trazia cada um deles. Embarcar seis pesos
 * de Work Sans custaria 600 KB por ninguém perceber: no `@font-face` cada
 * arquivo declara uma FAIXA de peso (`font-weight: 400 500`), então o
 * navegador escolhe o arquivo certo sem sintetizar negrito. A faixa está em
 * `tokens.css`, ao lado da declaração.
 */
export const FACES = [
  { origem: "WorkSans-Regular.ttf", destino: "work-sans-v24-400.woff" },
  { origem: "WorkSans-SemiBold.ttf", destino: "work-sans-v24-600.woff" },
  { origem: "WorkSans-Bold.ttf", destino: "work-sans-v24-700.woff" },
  { origem: "RobotoMono-Regular.ttf", destino: "roboto-mono-v31-400.woff" },
  { origem: "RobotoMono-Bold.ttf", destino: "roboto-mono-v31-700.woff" },
];

export const LICENCAS = ["OFL-WorkSans.txt", "OFL-RobotoMono.txt"];

/** Sobe ao múltiplo de quatro seguinte, como a especificação manda. */
function alinhar(n) {
  return (n + 3) & ~3;
}

/**
 * Converte um `.ttf` em WOFF 1.0.
 *
 * O formato é o sfnt com cada tabela comprimida por zlib quando isso encolhe
 * (senão a tabela vai crua, como a especificação permite), um cabeçalho de 44
 * bytes e um diretório de 20 bytes por tabela. Sem metadados e sem bloco
 * privado. Função pura: mesma entrada, mesmos bytes, e é isso que o teste
 * confere contra o repositório.
 */
export function ttfParaWoff(ttf) {
  const sfntVersion = ttf.readUInt32BE(0);
  const numTables = ttf.readUInt16BE(4);

  const tabelas = [];
  for (let i = 0; i < numTables; i++) {
    const base = 12 + i * 16;
    const tag = ttf.subarray(base, base + 4);
    const checksum = ttf.readUInt32BE(base + 4);
    const offset = ttf.readUInt32BE(base + 8);
    const length = ttf.readUInt32BE(base + 12);
    tabelas.push({ tag, checksum, dados: ttf.subarray(offset, offset + length) });
  }
  /* O diretório do WOFF vai na mesma ordem do sfnt, que é por etiqueta. */
  tabelas.sort((a, b) => Buffer.compare(a.tag, b.tag));

  const cabecalho = 44;
  const diretorio = 20 * numTables;
  let offset = cabecalho + diretorio;
  let totalSfntSize = 12 + 16 * numTables;

  const entradas = [];
  const blocos = [];
  for (const t of tabelas) {
    const comprimida = deflateSync(t.dados, { level: 9 });
    const usada = comprimida.length < t.dados.length ? comprimida : t.dados;
    entradas.push({ tag: t.tag, offset, compLength: usada.length, origLength: t.dados.length, checksum: t.checksum });
    const preenchido = Buffer.alloc(alinhar(usada.length));
    usada.copy(preenchido);
    blocos.push(preenchido);
    offset += preenchido.length;
    totalSfntSize += alinhar(t.dados.length);
  }

  const saida = Buffer.alloc(offset);
  saida.write("wOFF", 0, "ascii");
  saida.writeUInt32BE(sfntVersion, 4);
  saida.writeUInt32BE(offset, 8);
  saida.writeUInt16BE(numTables, 12);
  saida.writeUInt16BE(0, 14);
  saida.writeUInt32BE(totalSfntSize, 16);
  saida.writeUInt16BE(1, 20);
  saida.writeUInt16BE(0, 22);
  // metaOffset, metaLength, metaOrigLength, privOffset, privLength: zero.

  let cursor = cabecalho;
  for (const e of entradas) {
    e.tag.copy(saida, cursor);
    saida.writeUInt32BE(e.offset, cursor + 4);
    saida.writeUInt32BE(e.compLength, cursor + 8);
    saida.writeUInt32BE(e.origLength, cursor + 12);
    saida.writeUInt32BE(e.checksum, cursor + 16);
    cursor += 20;
  }
  for (const bloco of blocos) {
    bloco.copy(saida, cursor);
    cursor += bloco.length;
  }
  return saida;
}

/** O que o roteiro produziria, sem escrever nada: é o que o teste compara. */
export function gerarEmMemoria() {
  return FACES.map((face) => ({
    nome: face.destino,
    bytes: ttfParaWoff(readFileSync(join(ORIGEM, face.origem))),
  }));
}

const chamadoDiretamente = process.argv[1]?.endsWith("gerar-fontes-do-painel.mjs") ?? false;

if (chamadoDiretamente) {
  mkdirSync(DESTINO, { recursive: true });
  for (const { nome, bytes } of gerarEmMemoria()) {
    writeFileSync(join(DESTINO, nome), bytes);
    console.log(`${nome}: ${bytes.length} bytes`);
  }
  for (const licenca of LICENCAS) {
    copyFileSync(join(ORIGEM, licenca), join(DESTINO, licenca));
  }
  console.log(`Pronto em ${DESTINO}. Confira com: npm run test:scripts`);
}
