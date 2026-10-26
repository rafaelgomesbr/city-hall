/*
  Teste negativo da correção 2 da V2-F00-E24. Rode na raiz do repositório:
    node docs/evidencias-v2/G00/V2-F00-E24/correcao-2/verificar-ressalvas.mjs

  A regra: nenhuma frase que afirme que alguém "acompanha quem está em campo",
  ou que descreva a saída declarada pelo agente, pode ficar sem a ressalva de
  que o recurso está em construção (o aplicativo do agente ainda não declara a
  saída, V2-F14-E01). A unidade conferida é a linha nos HTML e o parágrafo nos
  Markdown. Sai com código 1 se alguma ocorrência estiver sem ressalva, e
  imprime qual.
*/
import { readFileSync } from "node:fs";

const RESSALVA = /em constru[cç][aã]o/i;

const regras = [
  { arquivo: "docs/apresentacao-produto-alyson.html", unidade: "linha", padrao: /acompanha(r)? quem est[aá] em campo/i },
  { arquivo: "dc360/docs/apresentacao/2026-09-15-para-o-alyson.html", unidade: "linha", padrao: /acompanha(r)? quem est[aá] em campo|retorno n[aã]o confirmado/i },
  { arquivo: "dc360/docs/PRIVACIDADE.md", unidade: "paragrafo", padrao: /sa[ií]da a campo declarada pelo agente/i },
  { arquivo: "dc360/docs/PAPEIS_E_RESPONSABILIDADES.md", unidade: "paragrafo", padrao: /acompanhar quem est[aá] em campo|acompanha quem est[aá] em campo/i },
  { arquivo: "dc360/README.md", unidade: "paragrafo", padrao: /\*\*acompanha quem est[aá] em campo\*\*/i },
];

let falhas = 0;
let conferidas = 0;
for (const r of regras) {
  const texto = readFileSync(r.arquivo, "utf8");
  const unidades = r.unidade === "linha" ? texto.split("\n") : texto.split(/\n\s*\n/);
  unidades.forEach((u, i) => {
    if (!r.padrao.test(u)) return;
    conferidas++;
    if (!RESSALVA.test(u)) {
      falhas++;
      console.log(`SEM RESSALVA  ${r.arquivo}  (${r.unidade} ${i + 1}): ${u.trim().slice(0, 110)}`);
    }
  });
}
console.log(`\n${conferidas} ocorrência(s) conferida(s), ${falhas} sem a ressalva "em construção".`);
process.exit(falhas === 0 && conferidas > 0 ? 0 : 1);
