/**
 * Prende os runbooks de `dc360/docs/runbooks/` ao que o repositório realmente
 * tem (V2-F01-E16).
 *
 * ## O defeito que isto fecha
 *
 * Um runbook que manda rodar um comando que não existe é pior que nenhum: na
 * madrugada, a pessoa que o segue (justamente uma que não escreveu o sistema)
 * perde minutos achando que errou ela. O critério da etapa diz que "runbook com
 * comando inexistente na CLI reprova a revisão"; aqui a revisão é uma máquina.
 *
 * ## O que ele confere, para cada runbook que a E16 escreveu
 *
 * - tem as seções que a etapa exige (quem executa, pré-condições, passos,
 *   verificação, voltar atrás) ou, no caso do de acesso e do ensaio, as dele;
 * - todo `node scripts/X.mjs` aponta para um arquivo que existe, e todo
 *   subcomando ou opção citado está escrito no código desse arquivo;
 * - todo `npm run X` é um script do `package.json` da raiz do produto;
 * - todo subcomando do `fly`, do `eas` e do `gh` está na lista que este
 *   repositório usa (o `flyctl` não se instala em CI, então a lista é o limite
 *   do que se afirma conhecer, e crescer exige escrever aqui);
 * - todo caminho de arquivo citado existe, salvo os que ainda nascerão e estão
 *   nomeados abaixo;
 * - toda `depende de V2-F01-Enn` aponta para uma etapa que existe no roadmap;
 * - nenhum valor de segredo: URL de banco só com senha de mentira, nada de
 *   chave PEM nem de token longo.
 *
 * ## O que ele NÃO confere
 *
 * Que o comando faz o que o texto diz (isso é o ensaio da segunda pessoa, em
 * `docs/runbooks/ensaio-da-segunda-pessoa.md`), e nada sobre `rollback.md`: ele
 * é da V2-F01-E08, escrito por outra etapa, e esta etapa nem o cria nem o varre.
 * O texto dos runbooks só APONTA para ele.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..");            // dc360/
const REPO = resolve(RAIZ, "..");            // raiz do repositório
const PASTA = join(RAIZ, "docs", "runbooks");

/** Os runbooks que a E16 escreveu. `rollback.md` NÃO está aqui, de propósito. */
export const DOS_RUNBOOKS = [
  "README.md",
  "deploy.md",
  "migracao.md",
  "rotacao-de-segredo.md",
  "acesso-e-segredos.md",
  "ensaio-da-segunda-pessoa.md",
];

/** Seções que cada um precisa ter. Texto procurado como início de linha. */
export const SECOES = {
  "deploy.md": ["Quem executa", "## Pré-condições", "## Passos", "## Verificação", "## Voltar atrás"],
  "migracao.md": ["Quem executa", "## Pré-condições", "## Passos", "## Verificação", "## Voltar atrás"],
  "rotacao-de-segredo.md": ["Quem executa", "## Pré-condições", "## Passos", "## Verificação", "## Voltar atrás"],
  "acesso-e-segredos.md": [
    "Quem executa", "## Matriz de contas por função", "## Recuperação de PROD", "## Revisão trimestral", "## Revogar",
  ],
  "ensaio-da-segunda-pessoa.md": ["## Regras do ensaio", "## Roteiro", "## Ficha de registro"],
};

/** Subcomandos que este repositório usa. Ampliar exige conhecer o comando de verdade. */
export const FLY_CONHECIDOS = new Set([
  "deploy", "status", "logs", "releases", "auth whoami", "apps create", "machine restart",
  "secrets list", "secrets import", "secrets set", "secrets unset",
]);
export const EAS_CONHECIDOS = new Set(["build", "submit", "login", "init"]);
export const GH_CONHECIDOS = new Set(["run list"]);
export const VERSAO_SUBCOMANDOS = new Set(["conferir", "mostrar", "subir", "conferir-tag"]);

/** Caminhos citados que ainda não existem ou nunca existirão no git. */
export const CAMINHOS_QUE_NAO_EXISTEM_AINDA = [
  "rollback.md",               // V2-F01-E08
  "CP-07/decisao.md",          // decisão do Rafael
  "AAAA-MM-DD",                // modelo de nome de arquivo
  "segredos/play-console.json", // fora do git, de propósito
  "<",                         // placeholder (<data>, <ID>)
];

export function lerRunbook(nome) {
  return readFileSync(join(PASTA, nome), "utf8");
}

/** Trechos de código: blocos cercados e trechos entre crases, sem os cercados. */
export function trechosDeCodigo(texto) {
  const trechos = [];
  const semBlocos = texto.replace(/```[^\n]*\n([\s\S]*?)```/g, (_, corpo) => {
    trechos.push(corpo);
    return " ";
  });
  for (const m of semBlocos.matchAll(/`([^`\n]+)`/g)) trechos.push(m[1]);
  return trechos;
}

function scriptsDoProduto(raiz) {
  const pacote = JSON.parse(readFileSync(join(raiz, "package.json"), "utf8"));
  return new Set(Object.keys(pacote.scripts ?? {}));
}

/** Devolve a lista de problemas de comando em um texto. Lista vazia é tudo certo. */
export function problemasDeComando(texto, { raiz = RAIZ } = {}) {
  const problemas = [];
  const scripts = scriptsDoProduto(raiz);
  for (const trecho of trechosDeCodigo(texto)) {
    for (const linha of trecho.split("\n")) {
      // node scripts/X.mjs [subcomando] [--opções]
      for (const m of linha.matchAll(/node scripts\/([\w.-]+\.mjs)([^\n|;&)>]*)/g)) {
        const arquivo = join(raiz, "scripts", m[1]);
        if (!existsSync(arquivo)) {
          problemas.push(`script inexistente: scripts/${m[1]}`);
          continue;
        }
        const fonte = readFileSync(arquivo, "utf8");
        const resto = m[2].trim().split(/\s+/).filter(Boolean);
        for (const opcao of resto.filter((p) => p.startsWith("--"))) {
          const nome = opcao.split("=")[0];
          if (!fonte.includes(nome)) problemas.push(`opção ${nome} não existe em scripts/${m[1]}`);
        }
        const primeiro = resto[0];
        if (m[1] === "versao.mjs" && primeiro && !primeiro.startsWith("--") && !primeiro.startsWith("<")) {
          if (!VERSAO_SUBCOMANDOS.has(primeiro)) problemas.push(`subcomando ${primeiro} não existe em versao.mjs`);
        }
        if (m[1] === "rotacionar-segredo.mjs" && primeiro && !["rotacionar", "revogar"].includes(primeiro)) {
          problemas.push(`subcomando ${primeiro} não existe em rotacionar-segredo.mjs`);
        }
      }
      // npm run X
      for (const m of linha.matchAll(/npm run (?:--silent )?([\w:.-]+)/g)) {
        if (!scripts.has(m[1])) problemas.push(`npm run ${m[1]} não é script do package.json`);
      }
      // fly <subcomando> [<sub>]
      for (const m of linha.matchAll(/(?:^|[\s(`])fly ([a-z]+)(?: ([a-z]+))?/g)) {
        const grupo = ["auth", "apps", "machine", "secrets"].includes(m[1]);
        // `fly secrets` sozinho é só o nome do cofre do Fly, usado como substantivo.
        if (grupo && !m[2]) continue;
        const chave = grupo ? `${m[1]} ${m[2]}` : m[1];
        if (!FLY_CONHECIDOS.has(chave)) problemas.push(`fly ${chave} não está na lista de comandos conhecidos`);
      }
      for (const m of linha.matchAll(/(?:^|[\s(`])eas ([a-z]+)/g)) {
        if (!EAS_CONHECIDOS.has(m[1])) problemas.push(`eas ${m[1]} não está na lista de comandos conhecidos`);
      }
      for (const m of linha.matchAll(/(?:^|[\s(`])gh ([a-z]+ [a-z]+)/g)) {
        if (!GH_CONHECIDOS.has(m[1])) problemas.push(`gh ${m[1]} não está na lista de comandos conhecidos`);
      }
    }
  }
  return problemas;
}

/** Caminhos de arquivo citados que não existem (fora a lista de exceções). */
export function caminhosInexistentes(texto, { raiz = RAIZ, repo = REPO } = {}) {
  const faltando = [];
  const achados = new Set();
  for (const m of texto.matchAll(/`((?:docs|apps|packages|db|scripts|\.github)\/[^`\s]+?\.(?:md|ts|mjs|toml|json|sql|crt|sh|yml))`/g)) achados.add(m[1]);
  for (const m of texto.matchAll(/`(fly(?:\.console)?\.toml|vercel\.json|Dockerfile(?:\.console)?|CHANGELOG\.md|compose\.yaml)`/g)) achados.add(m[1]);
  for (const caminho of achados) {
    if (CAMINHOS_QUE_NAO_EXISTEM_AINDA.some((p) => caminho.includes(p))) continue;
    if (!existsSync(join(raiz, caminho)) && !existsSync(join(repo, caminho))) faltando.push(caminho);
  }
  return faltando;
}

/** Referências `depende de V2-F01-Enn` cuja etapa não existe no roadmap. */
export function dependenciasInvalidas(texto, etapasQueExistem) {
  const ruins = [];
  for (const m of texto.matchAll(/V2-F01-E(\d{2})/g)) {
    if (!etapasQueExistem.has(`V2-F01-E${m[1]}`)) ruins.push(`V2-F01-E${m[1]}`);
  }
  return ruins;
}

/** Sinais de valor de segredo no texto. */
export function segredosNoTexto(texto) {
  const achados = [];
  if (/-----BEGIN [A-Z ]*PRIVATE KEY/.test(texto)) achados.push("chave privada PEM");
  if (/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(texto)) achados.push("token JWT");
  for (const m of texto.matchAll(/postgres(?:ql)?:\/\/[^:\s/]+:([^@\s]+)@/g)) {
    if (!/^<?SENHA>?$/.test(m[1])) achados.push("senha em URL de banco");
  }
  for (const m of texto.matchAll(/\b[A-Za-z0-9+_-]{40,}={0,2}(?![A-Za-z0-9+/_-])/g)) {
    const t = m[0];
    if (/\d/.test(t) && /[A-Z]/.test(t) && /[a-z]/.test(t)) achados.push(`token longo: ${t.slice(0, 6)}...`);
  }
  return achados;
}

function etapasDoRoadmap() {
  const fonte = readFileSync(join(REPO, "docs", "roadmap-v2", "04-fundacao-engenharia.md"), "utf8");
  return new Set([...fonte.matchAll(/^### (V2-F01-E\d{2}) /gm)].map((m) => m[1]));
}

test("a pasta tem os runbooks da etapa e a etapa NÃO cria o rollback.md", () => {
  for (const nome of DOS_RUNBOOKS) {
    assert.ok(existsSync(join(PASTA, nome)), `falta docs/runbooks/${nome}`);
  }
  assert.ok(!DOS_RUNBOOKS.includes("rollback.md"), "rollback.md é da V2-F01-E08");
});

test("cada runbook tem as seções que a etapa exige", () => {
  for (const [nome, secoes] of Object.entries(SECOES)) {
    const linhas = lerRunbook(nome).split("\n");
    for (const secao of secoes) {
      const achou = secao.startsWith("##")
        ? linhas.some((l) => l.startsWith(secao))
        : linhas.some((l) => l.includes(`**${secao}:**`));
      assert.ok(achou, `${nome} não tem "${secao}"`);
    }
  }
});

test("todo comando citado existe: scripts, opções, npm run, fly, eas e gh", () => {
  for (const nome of DOS_RUNBOOKS) {
    const problemas = problemasDeComando(lerRunbook(nome));
    assert.deepEqual(problemas, [], `${nome}: ${problemas.join("; ")}`);
  }
});

test("todo arquivo citado existe, salvo os que a lista nomeia", () => {
  for (const nome of DOS_RUNBOOKS) {
    const faltando = caminhosInexistentes(lerRunbook(nome));
    assert.deepEqual(faltando, [], `${nome}: ${faltando.join(", ")}`);
  }
});

test("toda etapa citada como dependência existe no roadmap da F01", () => {
  const etapas = etapasDoRoadmap();
  assert.ok(etapas.has("V2-F01-E16") && etapas.has("V2-F01-E08"), "o roadmap da F01 não foi lido");
  for (const nome of DOS_RUNBOOKS) {
    const ruins = dependenciasInvalidas(lerRunbook(nome), etapas);
    assert.deepEqual(ruins, [], `${nome}: ${ruins.join(", ")}`);
  }
});

test("os pontos que dependem de etapa futura estão marcados como tal", () => {
  const marcas = {
    "deploy.md": ["V2-F01-E08", "V2-F01-E11", "V2-F01-E12"],
    // A V2-F01-E18 saiu desta lista: a trava e a regra de migração reversível
    // existem, e o runbook passou a descrevê-las em vez de marcá-las como futuras.
    "migracao.md": ["V2-F01-E11", "V2-F01-E12"],
    "rotacao-de-segredo.md": ["V2-F01-E11"],
    "acesso-e-segredos.md": ["V2-F01-E11", "V2-F01-E12"],
    "ensaio-da-segunda-pessoa.md": ["V2-F01-E08", "V2-F01-E11", "V2-F01-E12"],
  };
  for (const [nome, etapas] of Object.entries(marcas)) {
    const texto = lerRunbook(nome);
    for (const etapa of etapas) {
      assert.ok(new RegExp(`depende(?:m)? de[^.]*?${etapa}`).test(texto.replace(/\n\s*/g, " ")), `${nome} não marca "depende de ${etapa}"`);
    }
  }
});

test("os runbooks apontam para o rollback.md sem copiá-lo", () => {
  assert.match(lerRunbook("deploy.md"), /`rollback\.md`/);
  assert.match(lerRunbook("migracao.md"), /rollback\.md/);
  assert.match(lerRunbook("README.md"), /Escrito pela V2-F01-E08/);
});

test("nenhum runbook traz valor de segredo", () => {
  for (const nome of DOS_RUNBOOKS) {
    const achados = segredosNoTexto(lerRunbook(nome));
    assert.deepEqual(achados, [], `${nome}: ${achados.join(", ")}`);
  }
});

test("nenhum runbook usa travessão", () => {
  for (const nome of DOS_RUNBOOKS) {
    assert.ok(!lerRunbook(nome).includes("\u2014"), `${nome} tem travessão`);
  }
});

test("o procedimento de rotação nomeia os dois passos e o que não gira", () => {
  const texto = lerRunbook("rotacao-de-segredo.md");
  assert.match(texto, /node scripts\/rotacionar-segredo\.mjs rotacionar/);
  assert.match(texto, /node scripts\/rotacionar-segredo\.mjs revogar/);
  assert.match(texto, /SEGUNDO_FATOR_CHAVE[^\n]*não gira sem plano/i);
  assert.match(texto, /Este passo não é opcional/);
});

test("a matriz de acesso cobre as contas da etapa e diz quem revoga", () => {
  const texto = lerRunbook("acesso-e-segredos.md");
  for (const conta of ["GitHub", "Fly", "Supabase", "Vercel", "Domínio", "Monitor", "E-mail", "Apple", "Google Play", "Expo"]) {
    assert.ok(texto.includes(conta), `a matriz não cita ${conta}`);
  }
  const secao = texto.split("## Matriz de contas por função")[1].split("\n## ")[0];
  const linhas = secao.split("\n").filter((l) => /^\| (GitHub|Fly|Supabase|Vercel|Domínio|Monitor|E-mail|Apple|Google|Expo|Cofre)/.test(l));
  assert.ok(linhas.length >= 12, `só ${linhas.length} linhas de conta`);
  for (const l of linhas) {
    assert.match(l, /Obrigatório/, `conta sem MFA obrigatório: ${l.slice(0, 40)}`);
    assert.match(l, /\| Dono \|$/, `conta sem quem revoga: ${l.slice(0, 40)}`);
  }
});

// ---------------------------------------------------------------------------
// Os casos abaixo provam que o conferidor MORDE: texto estragado reprova.
// ---------------------------------------------------------------------------

test("morde: script, opção e subcomando inexistentes reprovam", () => {
  const ruim = [
    "```bash",
    "node scripts/nao-existe.mjs",
    "node scripts/migrar-producao.mjs --inventada",
    "node scripts/versao.mjs publicar",
    "node scripts/rotacionar-segredo.mjs girar x",
    "npm run tudo-menos-isto",
    "```",
  ].join("\n");
  const problemas = problemasDeComando(ruim);
  assert.equal(problemas.length, 5, problemas.join("; "));
  assert.deepEqual(problemasDeComando("```bash\nnode scripts/migrar-producao.mjs --aplicar\nnode scripts/versao.mjs conferir\n```"), []);
});

test("morde: subcomando de fly, eas e gh fora da lista reprova", () => {
  const ruim = "Rode `fly rollback -a x`, `fly secrets reveal`, `eas deploy` e `gh pr merge x`.";
  const problemas = problemasDeComando(ruim);
  assert.equal(problemas.length, 4, problemas.join("; "));
  assert.deepEqual(problemasDeComando("Rode `fly deploy -a x` e `fly secrets import -a x`."), []);
});

test("morde: arquivo inexistente e etapa inventada reprovam", () => {
  assert.deepEqual(caminhosInexistentes("Veja `docs/nao-existe.md` e `scripts/versao.mjs`."), ["docs/nao-existe.md"]);
  assert.deepEqual(caminhosInexistentes("Veja `rollback.md` e `docs/runbooks/rollback.md`."), []);
  assert.deepEqual(dependenciasInvalidas("depende de V2-F01-E99 e de V2-F01-E08", new Set(["V2-F01-E08"])), ["V2-F01-E99"]);
});

test("morde: valor de segredo no texto reprova", () => {
  assert.ok(segredosNoTexto("postgres://dc360_api:umaSenhaDeVerdade@host:5432/db").length > 0);
  assert.ok(segredosNoTexto("-----BEGIN PRIVATE KEY-----").length > 0);
  assert.ok(segredosNoTexto("JWT_SEGREDO=aB3dE5gH7jK9mN1pQ3sT5vX7zA9cE1fG3iJ5lM7oP9rS").length > 0);
  assert.deepEqual(segredosNoTexto("postgresql://postgres.<PROJETO>:<SENHA>@host:5432/postgres e JWT_SEGREDO=<novo>,<antigo>"), []);
});
