// Aplica UMA mutação em src/rotas/orgaos.ts do worktree, roda a varredura (e opcionalmente a prova dinâmica e o tsc), restaura.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
const [,, raiz, nome, saida, extra] = process.argv;
const arq = `${raiz}/dc360/apps/api/src/rotas/orgaos.ts`;
const original = readFileSync(arq, "utf8");
const ancora = "    const dados = orgaoSchema.parse(req.body);\n\n    try {\n      const criado";
const antesDaValidacao = '    const quem = await autorizar(app, req, "gerenciar_equipes");\n    const dados = orgaoSchema.parse(req.body);\n\n    try {\n      const criado';
const M = {
  R4_send_literal: [ancora, `    const dados = orgaoSchema.parse(req.body);
    if (dados.nome === "Mutacao R4a") return resposta.code(403).send({ erro: "vazou_send_literal", mensagem: "x" });

    try {
      const criado`],
  R4_RegraDeNegocio_403: [ancora, `    const dados = orgaoSchema.parse(req.body);
    if (dados.nome === "Mutacao R4b") throw new RegraDeNegocio("vazou_regra_403", "x", 403);

    try {
      const criado`],
  A_ponto: [ancora, `    const dados = orgaoSchema.parse(req.body);
    const recusaA: { erro: string; mensagem: string } = { erro: "sem_permissao", mensagem: "Sem permissão." };
    recusaA.erro = "vazou_por_ponto";
    if (dados.nome === "Mutacao A") return resposta.code(403).send(recusaA);

    try {
      const criado`],
  B_reatribuicao: [ancora, `    const dados = orgaoSchema.parse(req.body);
    let recusaB = { erro: "sem_permissao", mensagem: "Sem permissão." };
    if (dados.nome === "Mutacao B") recusaB = { erro: "vazou_por_reatribuicao", mensagem: "x" };
    if (dados.sigla === "MB") return resposta.code(403).send(recusaB);

    try {
      const criado`],
  C_colchete: [ancora, `    const dados = orgaoSchema.parse(req.body);
    if (dados.nome === "Mutacao C") return resposta["code"](403)["send"]({ erro: "vazou_por_colchete", mensagem: "x" });

    try {
      const criado`],
  D_homonimo: [ancora, `    const dados = orgaoSchema.parse(req.body);
    const corpo = { erro: "sem_permissao", mensagem: "Sem permissão." };
    const recusar = (c: { erro: string; mensagem: string }) => { void corpo; const corpoD = c; return resposta.code(403).send(corpoD); };
    void recusar;
    const recusarD = (corpo: { erro: string; mensagem: string }) => resposta.code(403).send(corpo);
    if (dados.nome === "Mutacao D") return recusarD({ erro: "vazou_por_homonimo", mensagem: "x" });

    try {
      const criado`],
  N_statusCode_abreviado: [ancora, `    const dados = orgaoSchema.parse(req.body);
    const statusCode = 403;
    if (dados.nome === "Mutacao N") throw Object.freeze({ code: "FST_ERR_CTP_MUTACAO", statusCode });

    try {
      const criado`],
  N2_statusCode_abreviado_sem_freeze: [ancora, `    const dados = orgaoSchema.parse(req.body);
    const statusCode = 403;
    if (dados.nome === "Mutacao N") { const e = new Error("x") as Error & { code?: string; statusCode?: number }; const extra = { code: "FST_ERR_CTP_MUTACAO", statusCode }; throw { ...e, ...extra }; }

    try {
      const criado`],
  CTRL_C_antes_da_validacao: [antesDaValidacao, `    const quem = await autorizar(app, req, "gerenciar_equipes");
    if (quem.papel === "coordenador") return resposta["code"](403)["send"]({ erro: "vazou_por_colchete", mensagem: "x" });
    const dados = orgaoSchema.parse(req.body);

    try {
      const criado`],
};
const [de, para] = M[nome];
if (!original.includes(de)) throw new Error("âncora não encontrada");
writeFileSync(arq, original.replace(de, para));
let out = `== mutação ${nome} em src/rotas/orgaos.ts ==\n${para}\n\n`;
const rodar = (cmd, cwd) => { try { return `$ ${cmd}\n` + execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 500000 }) + "\ncodigo=0\n"; } catch (e) { return `$ ${cmd}\n${e.stdout}\n${e.stderr}\ncodigo=${e.status}\n`; } };
try {
  const api = `${raiz}/dc360/apps/api`;
  out += rodar("npx tsc -p tsconfig.json --noEmit", api).split("\n").slice(-12).join("\n") + "\n";
  const r = rodar("npx vitest run test/codigos-de-erro.test.ts", api);
  out += r.split("\n").filter((l) => /✗|×|FAIL|Tests |Test Files|codigo=|vazou|orgaos\.ts:|AssertionError|Expected|Received|^\s+[-+] /.test(l)).slice(0, 60).join("\n") + "\n";
  if (extra === "dinamica") {
    const d = rodar("npx vitest run test/prova-dinamica-dos-codigos-de-erro.test.ts", api);
    out += d.split("\n").filter((l) => /✗|×|FAIL|Tests |Test Files|codigo=|vazou|AssertionError|^\s+[-+] /.test(l)).slice(0, 40).join("\n") + "\n";
  }
} finally {
  writeFileSync(arq, original);
}
writeFileSync(saida, out);
console.log(out.split("\n").filter((l) => /Tests |codigo=|vazou_|error TS/.test(l)).join("\n"));
