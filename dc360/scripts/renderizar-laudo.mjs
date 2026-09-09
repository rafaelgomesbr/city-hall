/*
 * Renderiza um laudo de vistoria em HTML e PNG, a partir de um arquivo JSON com
 * os dados do documento, para conferência visual.
 *
 * Existe porque a conferência a olho do laudo é critério de aceite e não tem
 * como ser feita pela suíte: teste prova que a marcação saiu, não prova que o
 * documento é legível. E abrir o laudo pela API exige sessão de coordenador na
 * produção, que nem sempre está à mão, além de gravar acesso a dado de cidadão
 * na trilha por um motivo que não é atendimento.
 *
 * Uso:
 *   node scripts/renderizar-laudo.mjs <dados.json> <pasta-de-saida> [assinatura.png]
 *
 * O JSON é um `DadosDocumento` de apps/api/src/documentos/laudo.ts, com
 * `emitidoEm` em texto ISO. O terceiro argumento, quando dado, é o traço de
 * assinatura, e o roteiro gera as DUAS versões, com e sem, porque a ausência da
 * assinatura tem aparência própria no documento e ela também precisa ser
 * conferida.
 *
 * NÃO guarde o JSON dentro do repositório: ele carrega nome, contato e relato
 * de pessoa real. A pasta de trabalho da sessão é o lugar dele.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));

const [caminhoDosDados, pastaDeSaida, caminhoDaAssinatura] = process.argv.slice(2);
if (!caminhoDosDados || !pastaDeSaida) {
  console.error("uso: node scripts/renderizar-laudo.mjs <dados.json> <pasta-de-saida> [assinatura.png]");
  process.exit(2);
}

/*
 * A importação é do `dist`, e não do fonte, para o roteiro não depender de
 * carregador de TypeScript.
 *
 * Mas `dist` velho é a pior falha possível aqui, e ela aconteceu: na primeira
 * conferência a olho, em 09/09/2026, o laudo exibido veio de um build anterior
 * e não mostrava a lápide de assinatura ausente, que já estava implementada.
 * Conferência contra build desatualizado é pior que nenhuma, porque produz
 * confiança falsa num documento que sustenta ato administrativo. Por isso o
 * roteiro compara as datas e PARA, em vez de avisar.
 */
const maisNovo = (pasta) => {
  let quando = 0;
  for (const item of readdirSync(pasta, { withFileTypes: true })) {
    const caminho = join(pasta, item.name);
    quando = Math.max(quando, item.isDirectory() ? maisNovo(caminho) : statSync(caminho).mtimeMs);
  }
  return quando;
};

const FONTE = resolve(AQUI, "../apps/api/src/documentos");
const COMPILADO = resolve(AQUI, "../apps/api/dist/documentos");

let laudoDeVistoria;
try {
  if (maisNovo(FONTE) > maisNovo(COMPILADO)) {
    console.error(
      "apps/api/dist/documentos está mais velho que o fonte: o laudo conferido não seria o " +
      "laudo do código. Rode: npm run build --prefix apps/api",
    );
    process.exit(1);
  }
  ({ laudoDeVistoria } = await import(resolve(COMPILADO, "laudo.js")));
} catch (erro) {
  if (erro?.code !== "ENOENT") throw erro;
  console.error("apps/api/dist não existe. Rode: npm run build --prefix apps/api");
  process.exit(1);
}

const dados = JSON.parse(readFileSync(caminhoDosDados, "utf8"));
dados.emitidoEm = new Date(dados.emitidoEm);

const assinaturaUrl = caminhoDaAssinatura
  ? "data:image/png;base64," + readFileSync(caminhoDaAssinatura).toString("base64")
  : null;

mkdirSync(pastaDeSaida, { recursive: true });

const variantes = assinaturaUrl
  ? [["sem-assinatura", null], ["com-assinatura", assinaturaUrl]]
  : [["sem-assinatura", null]];

const paginas = [];
for (const [nome, url] of variantes) {
  const html = laudoDeVistoria({ ...dados, vistoria: { ...dados.vistoria, assinaturaUrl: url } });
  const arquivo = resolve(pastaDeSaida, `laudo-${nome}.html`);
  writeFileSync(arquivo, html);
  paginas.push([nome, arquivo, html.length]);
}

/*
 * O PNG é o que permite a conferência a olho de verdade. Se o Playwright não
 * estiver instalado, o HTML já foi gravado e continua conferível no navegador,
 * então isso é aviso e não falha.
 */
try {
  const { chromium } = await import("playwright");
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage({ viewport: { width: 900, height: 1400 } });
  for (const [nome, arquivo] of paginas) {
    await pagina.goto("file://" + arquivo);
    await pagina.screenshot({ path: resolve(pastaDeSaida, `laudo-${nome}.png`), fullPage: true });
  }
  await navegador.close();
  for (const [nome, , bytes] of paginas) console.log(`${nome}: ${bytes} bytes de HTML, mais o PNG`);
} catch (erro) {
  for (const [nome, , bytes] of paginas) console.log(`${nome}: ${bytes} bytes de HTML`);
  console.error("Sem PNG (" + erro.message + "). Abra os HTML no navegador.");
}
