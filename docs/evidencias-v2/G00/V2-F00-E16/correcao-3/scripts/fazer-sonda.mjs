// Gera a sonda: o caso 0,0 com o relógio avançando 1 ms entre as duas tarefas.
import { readFileSync, writeFileSync } from "node:fs";
const [origem, destino] = process.argv.slice(2);
let t = readFileSync(origem, "utf8");
const alvo = `  it("a posição 0,0 de quem ainda não fixou o GPS não vira distância nenhuma", async () => {
    mockTarefas = [`;
if (!t.includes(alvo)) throw new Error("alvo não encontrado");
t = t.replace(alvo, `  it("a posição 0,0 de quem ainda não fixou o GPS não vira distância nenhuma", async () => {
    const relogioReal = Date.now.bind(Date);
    let passo = 0;
    const espiao = jest.spyOn(Date, "now").mockImplementation(() => relogioReal() + passo++);
    mockTarefas = [`);
const fim = `      tarefa({ id: "perto", protocolo: "000100/2026", severidade: "media", ...daquiAMetros(400) }),
    ];`;
if (!t.includes(fim)) throw new Error("fim não encontrado");
t = t.replace(fim, fim + `
    espiao.mockRestore();`);
t = t.replace(/describe\("/g, 'describe("SONDA ').replace(/\bit\("(?!a posição 0,0)/g, 'it.skip("');
writeFileSync(destino, t);
