// Sonda da E25: a API, apontada para o banco RESTAURADO, sobe, responde
// /saude, aceita login da semente e le uma ocorrencia; e a ocorrencia do outro
// municipio responde 404. Imprime status e campos, nunca o token.
// Uso: node api-contra-a-copia.mjs http://127.0.0.1:PORTA
const base = process.argv[2];
const SENHA_DA_SEMENTE = "defesa-civil-2026"; // fixture publica de db/seeds/desenvolvimento.sql
let falhas = 0;
function conferir(rotulo, ok, detalhe) {
  console.log(`${ok ? "OK  " : "FALHA"} ${rotulo}${detalhe ? `: ${detalhe}` : ""}`);
  if (!ok) falhas++;
}

const saude = await fetch(`${base}/saude`);
const corpoSaude = await saude.json();
conferir("GET /saude responde 200", saude.status === 200, `status ${saude.status}, status=${corpoSaude.status}, banco=${corpoSaude.banco}`);
conferir("/saude diz banco ok", corpoSaude.banco === "ok");

const entrada = await fetch(`${base}/auth/entrar`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "helena.coutinho@serraalta.exemplo.gov.br", senha: SENHA_DA_SEMENTE }),
});
const corpoEntrada = await entrada.json();
conferir("POST /auth/entrar (Helena, Serra Alta) responde 200", entrada.status === 200, `status ${entrada.status}`);
conferir("a entrada devolve token de acesso", typeof corpoEntrada.acesso === "string" && corpoEntrada.acesso.length > 20, "token omitido desta saida");
const auth = { authorization: `Bearer ${corpoEntrada.acesso}` };

const lista = await fetch(`${base}/ocorrencias`, { headers: auth });
const corpoLista = await lista.json();
const itens = Array.isArray(corpoLista) ? corpoLista : (corpoLista.itens ?? corpoLista.ocorrencias ?? []);
conferir("GET /ocorrencias responde 200", lista.status === 200, `status ${lista.status}, ${itens.length} itens`);
const protocolos = itens.map((o) => o.protocolo).filter(Boolean).sort();
console.log(`     protocolos: ${protocolos.join(", ")}`);

const propria = await fetch(`${base}/ocorrencias/11111111-1111-4111-8111-0000000000c1`, { headers: auth });
const corpoPropria = await propria.json();
conferir("GET /ocorrencias/{c1 de Serra Alta} responde 200", propria.status === 200,
  `status ${propria.status}, protocolo ${corpoPropria.protocolo ?? corpoPropria.ocorrencia?.protocolo}, tipo ${corpoPropria.tipo ?? corpoPropria.ocorrencia?.tipo}`);

// A ocorrencia de Vale Fundo: id lido da semente pelo chamador e passado como argumento.
const deOutro = process.argv[3];
const cruzada = await fetch(`${base}/ocorrencias/${deOutro}`, { headers: auth });
conferir("GET /ocorrencias/{ocorrencia de Vale Fundo} com token de Serra Alta responde 404", cruzada.status === 404, `status ${cruzada.status}`);

const busca = await fetch(`${base}/busca?q=${encodeURIComponent("acacias")}`, { headers: auth });
const corpoBusca = await busca.json();
conferir("GET /busca?q=acacias (pg_trgm restaurado) responde 200", busca.status === 200, `status ${busca.status}, ${JSON.stringify(corpoBusca).length} bytes`);
console.log(`     busca: ${JSON.stringify(corpoBusca).slice(0, 300)}`);

console.log(falhas === 0 ? "TODAS AS CONFERENCIAS PASSARAM" : `${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
