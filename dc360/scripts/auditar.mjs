#!/usr/bin/env node
/**
 * O portão de dependência vulnerável, separado em duas perguntas diferentes.
 *
 * O CLAUDE.md diz: "Dependência com vulnerabilidade conhecida em RUNTIME é bug,
 * não pendência". Até 09/09/2026 o `verificar` rodava `npm audit` puro, que
 * mistura runtime com ferramenta de desenvolvimento, e as duas coisas têm
 * consequências diferentes:
 *
 * - Vulnerabilidade em runtime vai junto com a imagem para o servidor que
 *   atende a Defesa Civil de um município. É bug, e reprova.
 * - Vulnerabilidade em ferramenta de teste roda na máquina de quem desenvolve
 *   e no runner do CI. Não chega perto de dado de cidadão. Reprovar a entrega
 *   por causa dela, quando a correção exige salto de versão maior, produz o
 *   pior resultado possível: alguém desliga o portão inteiro.
 *
 * Então runtime reprova, e desenvolvimento aparece na tela e não reprova. O
 * que NÃO pode acontecer é o segundo caso virar invisível, porque advisory de
 * ferramenta vira advisory de runtime no dia em que alguém move o pacote.
 *
 * O APLICATIVO DE CAMPO É AUDITADO À PARTE, e ele estava CEGO até 09/09/2026.
 *
 * `apps/campo` fica fora do `workspaces` por causa do Expo (ver o comentário em
 * `conferir-numeros.mjs`, que resolve o mesmo problema para teste). O efeito
 * era que este portão dizia "runtime limpo" enquanto o aplicativo instalado no
 * telefone do agente carregava oito advisories que ninguém tinha olhado. Portão
 * que só enxerga metade do produto é pior que portão nenhum: ele dá a impressão
 * de cobertura exatamente onde ela não existe.
 *
 * O aplicativo não reprova por contagem, e sim contra uma LISTA NOMEADA (ver
 * `ACEITAS_NO_APLICATIVO`). Advisory que não estiver nela reprova. A diferença
 * entre uma lista nomeada e um número de tolerância é que a lista envelhece em
 * público: quando o Expo corrigir, o teste reclama de excesso e alguém apaga a
 * linha.
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ACEITAS_EM_DESENVOLVIMENTO, ACEITAS_NO_APLICATIVO, problemasDasExcecoes } from "./auditar-excecoes.mjs";

function auditar(argumentos, cwd) {
  try {
    const saida = execFileSync("npm", ["audit", "--json", ...argumentos], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32",
      ...(cwd ? { cwd } : {}),
    });
    return JSON.parse(saida);
  } catch (erro) {
    // `npm audit` sai com código diferente de zero quando acha algo, e o JSON
    // vem no stdout do mesmo jeito. Só é falha de verdade se não vier JSON.
    const saida = erro.stdout?.toString() ?? "";
    if (!saida.trim()) throw erro;
    return JSON.parse(saida);
  }
}

function contar(relatorio) {
  const v = relatorio.metadata?.vulnerabilities ?? {};
  return {
    total: v.total ?? 0,
    detalhe: ["critical", "high", "moderate", "low", "info"]
      .filter((n) => (v[n] ?? 0) > 0)
      .map((n) => `${v[n]} ${n}`)
      .join(", "),
  };
}

/*
  A lista de exceções precisa cumprir o CP-03 (motivo, dono e prazo, ainda no
  prazo) ANTES de qualquer auditoria: lista malformada reprova mesmo que o
  pacote dela não apareça no relatório de hoje.
*/
const hoje = new Date().toISOString().slice(0, 10);
const defeitosDaLista = [
  ...problemasDasExcecoes(ACEITAS_NO_APLICATIVO, hoje),
  ...problemasDasExcecoes(ACEITAS_EM_DESENVOLVIMENTO, hoje).map((p) => `(desenvolvimento) ${p}`),
];
if (defeitosDaLista.length > 0) {
  console.error(`\nREPROVADO: ${defeitosDaLista.length} defeito(s) na lista de exceções (CP-03: nome, dono e prazo).`);
  for (const defeito of defeitosDaLista) console.error(`  - ${defeito}`);
  console.error(
    "Corrija ou renove com motivo em ACEITAS_NO_APLICATIVO ou ACEITAS_EM_DESENVOLVIMENTO (scripts/auditar-excecoes.mjs), "
    + "ou corrija a dependência e apague a linha.",
  );
  process.exit(1);
}

const relatorioDoRuntime = auditar(["--omit=dev", "--audit-level=low"]);
const relatorioDeTudo = auditar(["--audit-level=low"]);
const runtime = contar(relatorioDoRuntime);
const tudo = contar(relatorioDeTudo);
const soDesenvolvimento = Math.max(0, tudo.total - runtime.total);

console.log(`Runtime (vai para a imagem): ${runtime.total} vulnerabilidade(s)`);
console.log(`Desenvolvimento (fica na máquina): ${soDesenvolvimento} vulnerabilidade(s)`);

if (runtime.total > 0) {
  console.error(`\nREPROVADO: ${runtime.detalhe} em dependência de runtime.`);
  console.error("Isto vai para o servidor que atende a prefeitura. Corrija antes de entregar.");
  process.exit(1);
}

if (soDesenvolvimento > 0) {
  /*
    Só os pacotes com advisory PRÓPRIA (quem traz objeto em `via`), fora os que já
    aparecem no runtime. Os nomeados em ACEITAS_EM_DESENVOLVIMENTO têm dono e
    prazo (CP-03, D3 Q5); os demais continuam sendo aviso que "precisa de dono".
  */
  const proprios = (relatorio) => Object.entries(relatorio.vulnerabilities ?? {})
    .filter(([, v]) => (v.via ?? []).some((origem) => typeof origem === "object"))
    .map(([nome]) => nome);
  const noRuntime = new Set(proprios(relatorioDoRuntime));
  const nomesDeDev = proprios(relatorioDeTudo).filter((nome) => !noRuntime.has(nome)).sort();
  const semDono = nomesDeDev.filter((nome) => !(nome in ACEITAS_EM_DESENVOLVIMENTO));
  for (const nome of nomesDeDev.filter((n) => n in ACEITAS_EM_DESENVOLVIMENTO)) {
    const e = ACEITAS_EM_DESENVOLVIMENTO[nome];
    console.log(`  aceita (desenvolvimento): ${nome} (dono ${e.dono}, até ${e.ate})`);
  }
  if (semDono.length > 0) {
    console.warn(
      `\nAviso: ${soDesenvolvimento} vulnerabilidade(s) apenas em ferramenta de desenvolvimento;`
      + ` sem dono e prazo: ${semDono.join(", ")}. Não reprova, mas precisa de dono.`,
    );
    console.warn("Veja o detalhe com: npm audit --audit-level=low");
  } else {
    console.log(`\nAviso: ${soDesenvolvimento} vulnerabilidade(s) apenas em ferramenta de desenvolvimento, todas aceitas com dono e prazo (CP-03). Não reprova.`);
  }
}

/* ---------- O aplicativo de campo, que fica fora do `workspaces` ---------- */

const AQUI = dirname(fileURLToPath(import.meta.url));
const APLICATIVO = join(AQUI, "..", "apps", "campo");

const relatorioDoApp = auditar(["--omit=dev", "--audit-level=low"], APLICATIVO);
const doApp = contar(relatorioDoApp);
/*
  Só os pacotes com advisory PRÓPRIA, e não a cadeia inteira que depende deles.

  O `npm audit` lista, para cada advisory, também todo pacote que a arrasta por
  transitividade: uma advisory em `decode-uri-component` faz aparecer
  `query-string`, `expo-router` e quatro pacotes do `@react-navigation`, que não
  têm defeito nenhum. Nomear a cadeia inteira na lista de aceitas faria a lista
  crescer a cada mudança de árvore de dependência e esconder o que importa.

  A distinção está no `via`: quem tem advisory própria traz OBJETO ali (com
  título, gravidade e link); quem só arrasta traz o nome do outro pacote, como
  texto.
*/
const pacotesDoApp = Object.entries(relatorioDoApp.vulnerabilities ?? {})
  .filter(([, v]) => (v.via ?? []).some((origem) => typeof origem === "object"))
  .map(([nome]) => nome)
  .sort();
const naoAceitas = pacotesDoApp.filter((nome) => !(nome in ACEITAS_NO_APLICATIVO));

/*
  Aceita QUE JÁ TEM CORREÇÃO é uma linha que virou desculpa.

  A lista existe para o que "hoje NÃO dá para fechar", e `npm audit` diz, por
  advisory, se dá: `fixAvailable: true` é correção dentro da faixa de versão
  declarada, sem salto maior, e `npm audit fix` a aplica sozinho. Um revisor
  achou `js-yaml` aceita com `fixAvailable: true` em 15/09/2026, e o motivo
  escrito na lista ("sai quando o Expo atualizar") já era falso: a correção
  estava a um comando de distância. Correção que exige salto maior vem como
  objeto (`{ name, version, isSemVerMajor: true }`), e essa continua sendo
  decisão de gente, não deste portão.
*/
const aceitasComCorrecao = pacotesDoApp.filter(
  (nome) => nome in ACEITAS_NO_APLICATIVO
    && !ACEITAS_NO_APLICATIVO[nome].comCorrecao
    && relatorioDoApp.vulnerabilities[nome].fixAvailable === true,
);

console.log(`\nAplicativo de campo (vai para o telefone): ${doApp.total} vulnerabilidade(s)`);
for (const nome of pacotesDoApp) {
  const aceita = ACEITAS_NO_APLICATIVO[nome];
  console.log(aceita ? `  aceita: ${nome} (dono ${aceita.dono}, até ${aceita.ate})` : `  NOVA:   ${nome}`);
}

if (naoAceitas.length > 0) {
  console.error(
    `\nREPROVADO: ${naoAceitas.length} advisory nova no aplicativo de campo `
    + `(${naoAceitas.join(", ")}).`,
  );
  console.error(
    "Isto vai instalado no telefone do agente. Corrija, ou acrescente a "
    + "ACEITAS_NO_APLICATIVO em scripts/auditar-excecoes.mjs COM O MOTIVO escrito.",
  );
  process.exit(1);
}

if (aceitasComCorrecao.length > 0) {
  console.error(
    `\nREPROVADO: ${aceitasComCorrecao.join(", ")} está em ACEITAS_NO_APLICATIVO, `
    + "mas o npm audit diz que a correção já existe e não exige salto maior.",
  );
  console.error(
    "Rode `npm audit fix` em apps/campo, confira o package-lock.json e a suíte, "
    + "e apague a linha da lista.",
  );
  process.exit(1);
}

/*
  Aceita que sobra na lista e sumiu do relatório é uma linha que virou mentira.
  Ela não reprova, porque não há risco nenhum nisso, mas precisa ser dita: uma
  lista de exceções que ninguém poda vira o lugar onde advisory de verdade se
  esconde.
*/
const obsoletas = Object.keys(ACEITAS_NO_APLICATIVO).filter((n) => !pacotesDoApp.includes(n));
if (obsoletas.length > 0) {
  console.warn(
    `\nAviso: ${obsoletas.join(", ")} não aparece(m) mais no relatório do `
    + "aplicativo. Apague de ACEITAS_NO_APLICATIVO em scripts/auditar-excecoes.mjs.",
  );
}

console.log("\nRuntime limpo, e o aplicativo sem advisory nova.");
