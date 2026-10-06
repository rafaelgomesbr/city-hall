/**
 * Sonda da V2-F00-E08: o que o token do AGENTE DE CAMPO consegue ler.
 *
 * Roda contra uma API recem-semeada (BASE_API, padrao http://127.0.0.1:3333),
 * so com HTTP, sem navegador. Imprime o que a API respondeu e sai com codigo 1
 * se houver vazamento. Antes do conserto: sai com 1 (200 com o oficio e o sino
 * do municipio). Depois: sai com 0 (403 e sino da equipe).
 */
const API = process.env.BASE_API ?? "http://127.0.0.1:3333";
const SENHA = "defesa-civil-2026";
const OC_ALFA_4 = "11111111-1111-4111-8111-0000000000c4";

async function via(caminho, { metodo = "GET", token, corpo } = {}) {
  const r = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: {
      ...(corpo ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
const entrar = async (email) =>
  (await via("/auth/entrar", { metodo: "POST", corpo: { email, senha: SENHA } })).json.acesso;

const rita = await entrar("rita.lopes@serraalta.exemplo.gov.br");
const diego = await entrar("diego.alves@serraalta.exemplo.gov.br");

const pendentes = await via("/ocorrencias/providencias/pendentes", { token: rita });
const providencia = pendentes.json.itens.find((p) => p.ocorrencia_id === OC_ALFA_4);
const emitido = await via("/oficios", { metodo: "POST", token: rita, corpo: { providenciaId: providencia.id } });
const oficioId = emitido.json.id
  ?? (await via(`/oficios?ocorrenciaId=${OC_ALFA_4}`, { token: rita })).json.itens[0].id;

let vazou = false;
const linha = (nome, vazamento, extra) => {
  if (vazamento) vazou = true;
  console.log(`${vazamento ? "VAZA " : "FECHA"}  ${nome}  ${extra}`);
};

const lista = await via("/oficios", { token: diego });
linha("GET /oficios (token do agente)", lista.status === 200,
  `-> ${lista.status} ${lista.json.erro ?? `(${lista.json.itens?.length} oficios do municipio)`}`);
const ficha = await via(`/oficios/${oficioId}`, { token: diego });
linha("GET /oficios/:id (token do agente)", ficha.status === 200,
  `-> ${ficha.status} ${ficha.json.erro ?? `orgao_email=${ficha.json.orgao_email} aberturas=${ficha.json.aberturas?.length}`}`);

const minhas = await via("/ocorrencias?status=todas&porPagina=100", { token: diego });
const ids = new Set(minhas.json.itens.map((i) => i.id));
const sinoAgente = await via("/avisos", { token: diego });
const sinoAdmin = await via("/avisos", { token: rita });
const fora = sinoAgente.json.itens.filter((a) => !ids.has(a.ocorrenciaId));
linha("GET /avisos: avisos de outra equipe na lista do agente", fora.length > 0,
  `-> ${fora.length} de ${sinoAgente.json.itens.length} (protocolos: ${fora.map((a) => a.protocolo).join(", ") || "nenhum"})`);
linha("GET /avisos: naoLidos do agente alem da lista dele",
  sinoAgente.json.naoLidos !== sinoAgente.json.itens.filter((a) => !a.lido).length,
  `-> naoLidos=${sinoAgente.json.naoLidos}, lista=${sinoAgente.json.itens.filter((a) => !a.lido).length}, municipio=${sinoAdmin.json.naoLidos}`);

console.log(vazou ? "\nRESULTADO: VAZAMENTO" : "\nRESULTADO: fechado");
process.exit(vazou ? 1 : 0);
