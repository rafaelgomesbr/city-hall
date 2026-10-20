import { readFileSync, writeFileSync } from "node:fs";
const COMENT = `/**
 * O PRAZO PADRÃO, UM instante só por caso, e não um \`Date.now()\` por tarefa.
 *
 * Calculado dentro de \`tarefa()\`, cada tarefa ganhava o relógio do instante em
 * que foi montada, e duas tarefas "com o mesmo prazo" ficavam a um milissegundo
 * uma da outra sempre que o relógio virava entre as duas chamadas. A ordem do
 * dia desempata pelo instante exato do prazo ANTES do protocolo, então esse
 * milissegundo decidia a ordem, e o caso passava ou reprovava conforme a carga
 * da máquina (foi o que o CI mostrou no caso da posição 0,0: "longe" na frente
 * de "perto", com o aviso de que a ordem não considerou distância na tela).
 * Fixado no \`beforeEach\` de topo, que roda antes de todo \`beforeEach\` interno
 * e de todo caso, o empate é de verdade e quem desempata é o protocolo.
 */
let prazoPadrao = "";
`;
for (const arquivo of process.argv.slice(2)) {
  let t = readFileSync(arquivo, "utf8");
  const velho = "    prazo_em: new Date(Date.now() + 9 * HORA).toISOString(),\n    criado_em:";
  if (t.split(velho).length !== 2) throw new Error(`${arquivo}: auxiliar não encontrado uma vez`);
  t = t.replace(velho, "    prazo_em: prazoPadrao,\n    criado_em:");
  const fn = "function tarefa(parcial: Partial<Pendencia> & { id: string }): Pendencia {\n  return {";
  if (t.split(fn).length !== 2) throw new Error(`${arquivo}: função não encontrada uma vez`);
  t = t.replace(fn, COMENT + "\n" + fn.replace("  return {", "  if (!prazoPadrao) throw new Error(\"tarefa() montada antes do beforeEach de topo\");\n  return {"));
  const hook = "beforeEach(() => {\n  mockTarefas = [tarefa({ id: \"1\" })];";
  if (t.split(hook).length !== 2) throw new Error(`${arquivo}: beforeEach de topo não encontrado uma vez`);
  t = t.replace(hook, "beforeEach(() => {\n  prazoPadrao = new Date(Date.now() + 9 * HORA).toISOString();\n  mockTarefas = [tarefa({ id: \"1\" })];");
  writeFileSync(arquivo, t);
}
