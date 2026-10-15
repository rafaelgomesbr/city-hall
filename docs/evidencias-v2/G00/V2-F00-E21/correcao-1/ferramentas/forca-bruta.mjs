// Prova por força bruta: para um arquivo do INDEX cujo SHA-256 não bate, procura qual combinação de fim de linha
// (todo LF, todo CRLF, ou um intervalo contíguo de linhas em CRLF) reproduz o hash antigo.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const [raiz, pasta, arq] = process.argv.slice(2);
const dir = `${raiz}/docs/evidencias-v2/${/^(G00|CP-)/.test(pasta) ? "" : "G00/"}${pasta}`;
const indice = readFileSync(`${dir}/INDEX.md`, "utf8");
const m = indice.split("\n").map((l) => l.match(/^\| (.+) \| ([0-9a-f]{64}) \|$/)).find((x) => x && x[1] === arq);
const alvo = m[2];
const h = (s) => createHash("sha256").update(s).digest("hex");
const bruto = readFileSync(`${dir}/${arq}`, "utf8");
console.log(`arquivo: ${pasta}/${arq}`);
console.log(`hash no INDEX (antigo): ${alvo}`);
console.log(`hash dos bytes commitados: ${h(bruto)}  (CRLF nos bytes commitados: ${(bruto.match(/\r\n/g) ?? []).length})`);
const linhas = bruto.replace(/\r\n/g, "\n").split("\n");
const terminaEmNl = linhas[linhas.length - 1] === "";
if (terminaEmNl) linhas.pop();
const n = linhas.length;
const monta = (de, ate) => linhas.map((l, i) => l + (i >= de && i < ate ? "\r\n" : "\n")).join("");
let tentativas = 0, achou = null;
// Arquivo grande (mais de 300 linhas): varrer todo intervalo custa N^2 hashes. Ai so se testam os intervalos que
// comecam na linha 1, terminam na ultima ou tem ate 4 linhas (o que o editor ou o tee misturam na prática).
const grande = n > 300;
if (grande) console.log("arquivo grande: so intervalos que comecam na linha 1, terminam na ultima ou tem ate 4 linhas");
for (let de = 0; de <= n && !achou; de++) for (let ate = de; ate <= n; ate++) {
  if (grande && !(de === 0 || ate === n || ate - de <= 4)) continue;
  tentativas++;
  if (h(monta(de, ate)) === alvo) { achou = [de, ate]; break; }
}
console.log(`linhas: ${n}; combinacoes testadas: ${tentativas} (todo LF, todo CRLF e todo intervalo contiguo de linhas em CRLF)`);
if (achou && achou[0] === 0 && achou[1] === n) console.log(`ACHOU: o hash antigo so e reproduzido com o arquivo INTEIRO em CRLF (as ${n} linhas); o arquivo commitado esta em LF, por isso o hash de hoje e outro (acima).`);
else if (achou) console.log(`ACHOU: o hash antigo so e reproduzido com CRLF nas linhas ${achou[0] + 1} a ${achou[1]} (de 1 a ${n}) e LF nas demais: fim de linha MISTO. Com todo LF o hash e outro (acima).`);
else console.log("NAO achou nessa familia de combinacoes");
