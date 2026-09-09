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

/**
 * Advisories do aplicativo de campo que hoje NÃO dá para fechar, com o motivo.
 *
 * Nenhuma delas vem de dependência escolhida por este projeto: as duas chegam
 * por dentro do Expo, e `npm audit fix --force` quebraria a compilação nativa.
 * A lista tem nome e razão de propósito, para envelhecer em público.
 */
const ACEITAS_NO_APLICATIVO = {
  "js-yaml": "Chega por expo > @expo/cli > @expo/xcpretty, que é FERRAMENTA DE "
    + "COMPILAÇÃO: formata a saída do Xcode e não entra no pacote instalado no "
    + "telefone. Sai quando o Expo atualizar o xcpretty.",
  "decode-uri-component": "Chega por expo-router > query-string, e esta vai "
    + "junto com o aplicativo. O ataque é negação de serviço por percentual mal "
    + "formado numa URL, e a única URL que o aplicativo analisa é o próprio link "
    + "profundo dele. Sem correção acima sem trocar o expo-router.",
};

function auditar(argumentos, cwd) {
  try {
    const saida = execFileSync("npm", ["audit", "--json", ...argumentos], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...(cwd ? { cwd } : {}),
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

const runtime = contar(auditar(["--omit=dev", "--audit-level=low"]));
const tudo = contar(auditar(["--audit-level=low"]));
const soDesenvolvimento = Math.max(0, tudo.total - runtime.total);

console.log(`Runtime (vai para a imagem): ${runtime.total} vulnerabilidade(s)`);
console.log(`Desenvolvimento (fica na máquina): ${soDesenvolvimento} vulnerabilidade(s)`);

if (runtime.total > 0) {
  console.error(`\nREPROVADO: ${runtime.detalhe} em dependência de runtime.`);
  console.error("Isto vai para o servidor que atende a prefeitura. Corrija antes de entregar.");
  process.exit(1);
}

if (soDesenvolvimento > 0) {
  console.warn(
    `\nAviso: ${soDesenvolvimento} vulnerabilidade(s) apenas em ferramenta de`
    + " desenvolvimento. Não reprova, e precisa de dono.",
  );
  console.warn("Veja o detalhe com: npm audit --audit-level=low");
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

console.log(`\nAplicativo de campo (vai para o telefone): ${doApp.total} vulnerabilidade(s)`);
for (const nome of pacotesDoApp) {
  const razao = ACEITAS_NO_APLICATIVO[nome];
  console.log(razao ? `  aceita: ${nome}` : `  NOVA:   ${nome}`);
}

if (naoAceitas.length > 0) {
  console.error(
    `\nREPROVADO: ${naoAceitas.length} advisory nova no aplicativo de campo `
    + `(${naoAceitas.join(", ")}).`,
  );
  console.error(
    "Isto vai instalado no telefone do agente. Corrija, ou acrescente a "
    + "ACEITAS_NO_APLICATIVO em scripts/auditar.mjs COM O MOTIVO escrito.",
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
    + "aplicativo. Apague de ACEITAS_NO_APLICATIVO em scripts/auditar.mjs.",
  );
}

console.log("\nRuntime limpo, e o aplicativo sem advisory nova.");
