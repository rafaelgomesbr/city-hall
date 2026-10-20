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
 * `ACEITAS_NO_APLICATIVO`), que casa pelo id da advisory (GHSA) e não pelo nome
 * do pacote. Advisory que não estiver nela reprova, mesmo em pacote já aceito. A diferença
 * entre uma lista nomeada e um número de tolerância é que a lista envelhece em
 * público: quando o Expo corrigir, o teste reclama de excesso e alguém apaga a
 * linha.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACEITAS_EM_DESENVOLVIMENTO, ACEITAS_NO_APLICATIVO, BANDEIRAS_DA_CONSULTA_REAL, CONTROLE, REGISTRO_OFICIAL,
  aceitasAusentes, advisoriesNaoAceitas, advisoriesProprias, arquivosDoControle, defeitoDaArvore, defeitoDoControle,
  idDaAdvisory, mudancasDeGravidade, pacotesAceitosAusentes, pacotesDeRuntimeNoCompleto, problemasDasExcecoes,
} from "./auditar-excecoes.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const APLICATIVO = join(RAIZ, "apps", "campo");

/**
 * Sai com código 2 dizendo, em português, que a auditoria NÃO aconteceu.
 *
 * Código 2 e não 1 de propósito: 1 quer dizer "auditei e achei vulnerabilidade",
 * 2 quer dizer "não consegui auditar", e quem lê o CI precisa distinguir. O que
 * este portão nunca pode fazer é aprovar sem ter auditado: com o registro de
 * avisos fora do ar o `npm audit --json` devolve só `{ message, error }`, sem
 * `metadata`, e a leitura ingênua desse relatório era "0 vulnerabilidades",
 * "Runtime limpo" e código 0 (validação de 2026-10-13, item 7 da seção 7 de
 * `28`). Falta de prova não é prova de ausência.
 *
 * O relatório bem formado e VAZIO é o mesmo caso por outro caminho: com
 * `offline=true` na configuração do npm, ou atrás de um registro que responde
 * `{}` ao endpoint de advisories, o npm devolve `total: 0` sem ter perguntado a
 * ninguém (validação da rodada 6). Por isso toda chamada fixa o registro oficial
 * e anula o modo offline (`BANDEIRAS_DA_CONSULTA_REAL`), e o portão só aprova
 * depois de provar, dentro das próprias consultas, que a resposta é real: as
 * advisories aceitas (conhecidas) têm de voltar (ver o fim do arquivo).
 */
function naoAuditou(rotulo, motivo) {
  console.error(`\nERRO: ${rotulo} NÃO foi auditado, então este portão NÃO aprova.`);
  console.error(`Motivo: ${motivo}`);
  console.error(
    "Isto não é 'zero vulnerabilidades': é 'não consegui olhar'. Confira a rede e o registro "
    + "(npm config get registry), rode de novo, e só então confie no resultado.",
  );
  process.exit(2);
}

/**
 * Sai com código 2 quando advisories que SABEMOS existir não voltaram. Não dá
 * para saber, daqui, qual das duas coisas aconteceu: a resposta foi forjada no
 * caminho (proxy de inspeção TLS ou espelho que responde `{}`) ou a lista de
 * aceitas envelheceu (o pacote foi corrigido). Nas duas, alguém tem de olhar.
 */
function semProvaNaConsulta(rotulo, oQue, ausentes, onde) {
  console.error(`\nERRO: ${rotulo} não é confiável, então este portão NÃO aprova.`);
  console.error(`${oQue} que deveriam voltar e não voltaram: ${ausentes.join(", ")}.`);
  console.error(
    "Ou a resposta do registro foi forjada no caminho (proxy, espelho ou inspeção TLS que responde vazio), "
    + `ou a lista de aceitas está velha. Confira com \`npm audit\` direto no registro oficial; se a advisory `
    + `sumiu de verdade, apague a linha em ${onde} (scripts/auditar-excecoes.mjs).`,
  );
  process.exit(2);
}

/** Aceita só um relatório que de fato contém a contagem de vulnerabilidades. */
function relatorioValido(relatorio) {
  if (relatorio === null || typeof relatorio !== "object" || Array.isArray(relatorio)) {
    return "o npm não devolveu um relatório JSON";
  }
  if (relatorio.error) {
    return `o npm audit devolveu erro (${String(relatorio.message ?? relatorio.error.summary ?? "sem mensagem").slice(0, 200)})`;
  }
  const v = relatorio.metadata?.vulnerabilities;
  if (v === null || typeof v !== "object" || typeof v.total !== "number") {
    return "o relatório não traz metadata.vulnerabilities (o npm não chegou a auditar)";
  }
  return null;
}

function auditar(argumentos, cwd, rotulo) {
  let saida;
  try {
    saida = execFileSync("npm", ["audit", "--json", ...BANDEIRAS_DA_CONSULTA_REAL, ...argumentos], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32",
      ...(cwd ? { cwd } : {}),
    });
  } catch (erro) {
    // `npm audit` sai com código diferente de zero quando acha algo, e o JSON
    // vem no stdout do mesmo jeito. Só é falha de verdade se não vier JSON.
    saida = erro.stdout?.toString() ?? "";
    if (!saida.trim()) naoAuditou(rotulo, `o npm falhou sem relatório (${erro.message.split(String.fromCharCode(10))[0]})`);
  }
  let relatorio;
  try {
    relatorio = JSON.parse(saida);
  } catch {
    return naoAuditou(rotulo, "a saída do npm audit não é JSON");
  }
  const defeito = relatorioValido(relatorio);
  if (defeito) naoAuditou(rotulo, defeito);
  return relatorio;
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
  ...problemasDasExcecoes(ACEITAS_NO_APLICATIVO, hoje, { exigirAdvisories: true }),
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

const relatorioDoRuntime = auditar(["--omit=dev", "--audit-level=low"], undefined, "o conjunto de runtime da raiz");
// `--include` explícito: `omit=dev` na configuração do npm não esconde o desenvolvimento.
const relatorioDeTudo = auditar(
  ["--include=dev", "--include=optional", "--include=peer", "--audit-level=low"], undefined, "o conjunto completo da raiz",
);
const runtime = contar(relatorioDoRuntime);
const tudo = contar(relatorioDeTudo);
const soDesenvolvimento = Math.max(0, tudo.total - runtime.total);

/*
  A consulta `--omit=dev` não tem advisory conhecida dentro, então, sozinha, uma
  resposta forjada vazia passaria. A completa tem (as aceitas de desenvolvimento,
  conferidas no fim), e o `package-lock.json` diz quais pacotes são só de
  desenvolvimento: o que estiver vulnerável na completa e não for `dev` é runtime.
*/
let lockfile;
try {
  lockfile = JSON.parse(readFileSync(join(RAIZ, "package-lock.json"), "utf8"));
} catch (erro) {
  naoAuditou("o conjunto de runtime da raiz", `não consegui ler o package-lock.json da raiz (${erro.message})`);
}
const runtimeNoCompleto = pacotesDeRuntimeNoCompleto(relatorioDeTudo.vulnerabilities, lockfile);

console.log(`Runtime (vai para a imagem): ${runtime.total} vulnerabilidade(s)`);
console.log(`Desenvolvimento (fica na máquina): ${soDesenvolvimento} vulnerabilidade(s)`);

if (runtime.total > 0) {
  console.error(`\nREPROVADO: ${runtime.detalhe} em dependência de runtime.`);
  console.error("Isto vai para o servidor que atende a prefeitura. Corrija antes de entregar.");
  process.exit(1);
}
if (runtimeNoCompleto.length > 0) {
  console.error(
    `\nREPROVADO: a auditoria completa da raiz acusa ${runtimeNoCompleto.join(", ")}, que o package-lock.json `
    + "NÃO marca como só de desenvolvimento (e a consulta de runtime voltou limpa: as duas não batem).",
  );
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

const relatorioDoApp = auditar(["--omit=dev", "--audit-level=low"], APLICATIVO, "o aplicativo de campo");
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
  .filter(([, v]) => advisoriesProprias(v).length > 0)
  .map(([nome]) => nome)
  .sort();
/*
  A exceção casa pela ADVISORY (id GHSA), não pelo pacote: advisory nova num
  pacote que já tem outra aceita é risco novo que ninguém leu, e reprova.
*/
const naoAceitas = advisoriesNaoAceitas(relatorioDoApp.vulnerabilities, ACEITAS_NO_APLICATIVO);
const idsNoRelatorio = (nome) => [...new Set(advisoriesProprias(relatorioDoApp.vulnerabilities[nome]).map(
  (origem) => idDaAdvisory(origem) ?? "(sem id)",
))].sort();

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
  (nome) => Object.hasOwn(ACEITAS_NO_APLICATIVO, nome)
    && !ACEITAS_NO_APLICATIVO[nome].comCorrecao
    && relatorioDoApp.vulnerabilities[nome].fixAvailable === true,
);

/*
  A aceitação foi de uma advisory COM uma gravidade. Se o registro reclassifica
  (por exemplo, de alta para crítica), a decisão antiga não cobre o risco novo.
*/
const mudancas = mudancasDeGravidade(relatorioDoApp.vulnerabilities, ACEITAS_NO_APLICATIVO);

console.log(`\nAplicativo de campo (vai para o telefone): ${doApp.total} vulnerabilidade(s)`);
for (const nome of pacotesDoApp) {
  for (const id of idsNoRelatorio(nome)) {
    const nova = naoAceitas.find((n) => n.pacote === nome && n.id === id);
    const mudou = mudancas.find((m) => m.pacote === nome && m.id === id);
    const aceita = ACEITAS_NO_APLICATIVO[nome];
    console.log(nova
      ? `  NOVA:   ${nome} ${id} (${nova.gravidade}: ${nova.titulo})`
      : mudou
        ? `  MUDOU:  ${nome} ${id} (aceita como ${mudou.aceita}, agora ${mudou.agora})`
        : `  aceita: ${nome} ${id} (${aceita.advisories[id] ?? "?"}, dono ${aceita.dono}, até ${aceita.ate})`);
  }
}

if (naoAceitas.length > 0) {
  console.error(
    `\nREPROVADO: ${naoAceitas.length} advisory nova no aplicativo de campo `
    + `(${naoAceitas.map((n) => `${n.pacote} ${n.id}, ${n.gravidade}`).join("; ")}).`,
  );
  console.error(
    "Isto vai instalado no telefone do agente. Corrija, ou acrescente o id da advisory "
    + "a ACEITAS_NO_APLICATIVO em scripts/auditar-excecoes.mjs COM O MOTIVO escrito.",
  );
  process.exit(1);
}

if (mudancas.length > 0) {
  console.error(
    `\nREPROVADO: ${mudancas.length} advisory aceita mudou de gravidade no aplicativo de campo `
    + `(${mudancas.map((m) => `${m.pacote} ${m.id}: aceita como ${m.aceita}, agora ${m.agora}`).join("; ")}).`,
  );
  console.error(
    "A exceção foi decidida para a gravidade antiga e não vale para a nova sem decisão. Reavalie e, "
    + "se continuar aceita, atualize a gravidade e o motivo em ACEITAS_NO_APLICATIVO (scripts/auditar-excecoes.mjs).",
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


/* ---------- Antes de aprovar: provar que houve consulta de verdade ---------- */

/*
  Reprovar não precisa de prova: achado é achado. Aprovar precisa. Um zero só
  vale se (1) o relatório diz que olhou uma árvore com dependências, (2) as
  advisories que SABEMOS existir (as aceitas) voltaram DENTRO das próprias
  consultas, e (3) a consulta de controle à parte devolve a advisory conhecida.

  O (2) é o que importa. Até a revisão de 2026-10-20 só havia o (3), e um proxy
  de inspeção TLS (`https-proxy` e `cafile` na configuração, como em rede
  corporativa) que repassava ao registro só a consulta de controle e respondia
  `{}` às outras fazia o portão dizer "consulta real" com o aplicativo em 0. Uma
  consulta que carrega advisory conhecida não pode ser forjada vazia sem perder
  essa advisory; a de controle, separada, pode ser tratada à parte.
*/
for (const [relatorio, rotulo] of [
  [relatorioDoRuntime, "o conjunto de runtime da raiz"],
  [relatorioDeTudo, "o conjunto completo da raiz"],
  [relatorioDoApp, "o aplicativo de campo"],
]) {
  const defeito = defeitoDaArvore(relatorio);
  if (defeito) naoAuditou(rotulo, defeito);
}

const ausentesNoApp = aceitasAusentes(relatorioDoApp.vulnerabilities, ACEITAS_NO_APLICATIVO);
if (ausentesNoApp.length > 0) semProvaNaConsulta(
  "a auditoria do aplicativo de campo", "Advisories aceitas (conhecidas)", ausentesNoApp, "ACEITAS_NO_APLICATIVO",
);
const ausentesNoCompleto = pacotesAceitosAusentes(relatorioDeTudo.vulnerabilities, ACEITAS_EM_DESENVOLVIMENTO);
if (ausentesNoCompleto.length > 0) {
  semProvaNaConsulta(
    "a auditoria completa da raiz", "Pacotes aceitos de desenvolvimento (com advisory conhecida)", ausentesNoCompleto,
    "ACEITAS_EM_DESENVOLVIMENTO",
  );
}

/**
 * Roda o `npm audit` num projeto de controle (pasta temporária) com as mesmas
 * bandeiras e o mesmo `.npmrc` do projeto auditado, e exige a advisory conhecida.
 * O `.npmrc` é copiado porque é a única configuração que muda de uma pasta para
 * outra: a do usuário, a global e as variáveis de ambiente valem igual nas duas.
 */
function provarConsultaReal(projeto, rotulo) {
  const pasta = mkdtempSync(join(tmpdir(), "auditar-controle-"));
  // `naoAuditou` sai com process.exit, que pula `finally`; o evento `exit` não.
  const limpar = () => rmSync(pasta, { recursive: true, force: true });
  process.once("exit", limpar);
  for (const [nome, conteudo] of Object.entries(arquivosDoControle())) writeFileSync(join(pasta, nome), conteudo);
  if (existsSync(join(projeto, ".npmrc"))) copyFileSync(join(projeto, ".npmrc"), join(pasta, ".npmrc"));
  const relatorio = auditar(["--package-lock-only", "--audit-level=low"], pasta, `o projeto de controle ${rotulo}`);
  limpar();
  process.removeListener("exit", limpar);
  const defeito = defeitoDoControle(relatorio);
  if (defeito) naoAuditou("o que está acima (runtime, desenvolvimento e aplicativo)", `${defeito} (${rotulo})`);
}

provarConsultaReal(RAIZ, "com a configuração da raiz");
provarConsultaReal(APLICATIVO, "com a configuração do aplicativo de campo");
console.log(
  `\nConsulta de controle: ${CONTROLE.pacote} ${CONTROLE.versao} voltou com ${CONTROLE.advisory} `
  + `de ${REGISTRO_OFICIAL}, com a configuração da raiz e com a do aplicativo; e as `
  + `${Object.values(ACEITAS_NO_APLICATIVO).reduce((n, e) => n + Object.keys(e.advisories).length, 0)} advisories aceitas do aplicativo e os `
  + `${Object.keys(ACEITAS_EM_DESENVOLVIMENTO).length} pacotes aceitos de desenvolvimento voltaram nas próprias consultas.`,
);

console.log("\nRuntime limpo, e o aplicativo sem advisory nova.");
