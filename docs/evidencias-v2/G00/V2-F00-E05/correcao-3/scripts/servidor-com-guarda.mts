// Sobe a API do worktree (banco em memória) no modo da guarda pedido (MODO=falhar|corrigir) e faz
// POST /orgaos como coordenador; com PORTA, também por HTTP de verdade. Base: o script da revisão.
const W = process.env.W!;
const MODO = process.env.MODO as "falhar" | "corrigir";
const api = `${W}/dc360/apps/api/src`;
const { bancoEmMemoria } = await import(`${api}/banco/memoria.ts`);
const { carregarConfig } = await import(`${api}/config.ts`);
const { construirServidor } = await import(`${api}/servidor.ts`);
const { armazenamentoEmMemoria } = await import(`${api}/armazenamento/memoria.ts`);
const { derivarSenha } = await import(`${api}/auth/senha.ts`);
const { lerDesviosDaGuarda } = await import(`${api}/guarda-de-codigos-de-erro.ts`);
const mem = await bancoEmMemoria();
const log: string[] = [];
const config = carregarConfig({ NODE_ENV: "test", JWT_SEGREDO: "segredo-da-revisao-com-mais-de-32-bytes-ok", LOGIN_POR_IP: "10000" } as NodeJS.ProcessEnv);
const app = await construirServidor({ banco: mem.banco, config, armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }), modoDaGuarda: MODO, destinoDeLog: { write: (l: string) => { log.push(l); } } });
await app.ready();
const o = await mem.bruto.query("INSERT INTO organizacoes (nome,municipio,uf) VALUES ('DC Serra Alta','Serra Alta','MG') RETURNING id");
const hash = await derivarSenha("serra-alta-senha-forte");
await mem.bruto.query("INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,senha_hash) VALUES ($1,'Helena Coutinho','SA-1','helena@serraalta.exemplo.gov.br','coordenador',$2)", [o.rows[0].id, hash]);
await mem.bruto.query("INSERT INTO usuarios (organizacao_id,nome,matricula,email,papel,senha_hash) VALUES ($1,'Diego Prates','SA-2','diego@serraalta.exemplo.gov.br','agente_campo',$2)", [o.rows[0].id, hash]);
const login = await app.inject({ method: "POST", url: "/auth/entrar", payload: { email: "helena@serraalta.exemplo.gov.br", senha: "serra-alta-senha-forte" } });
const token = login.json().acesso;
const r = await app.inject({ method: "POST", url: "/orgaos", headers: { authorization: `Bearer ${token}` }, payload: {} });
console.log(`inject (${MODO}, coordenador):`, r.statusCode, r.body);
// O agente leva o 403 `sem_permissao` de `autorizar`: é por ele que M07 e M09 (que reescrevem esse 403) aparecem.
const loginAgente = await app.inject({ method: "POST", url: "/auth/entrar", payload: { email: "diego@serraalta.exemplo.gov.br", senha: "serra-alta-senha-forte" } });
const ra = await app.inject({ method: "POST", url: "/orgaos", headers: { authorization: `Bearer ${loginAgente.json().acesso}` }, payload: {} });
console.log(`inject (${MODO}, agente):`, ra.statusCode, ra.body);
console.log(`desvios registrados (${MODO}):`, JSON.stringify(lerDesviosDaGuarda()));
const doLog = log.map((l) => JSON.parse(l)).filter((l) => l.desvioDoCatalogo).map((l) => l.desvioDoCatalogo);
console.log(`log do desvio (${MODO}):`, JSON.stringify(doLog));
if (process.env.PORTA) {
  await app.listen({ port: Number(process.env.PORTA), host: "127.0.0.1" });
  const { request } = await import("node:http");
  const corpo = "{}";
  const resp: string = await new Promise((ok) => {
    const q = request({ host: "127.0.0.1", port: Number(process.env.PORTA), method: "POST", path: "/orgaos", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "content-length": corpo.length } }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => ok(`${res.statusCode} ${b}`));
    });
    q.on("error", (e) => ok(`erro de rede: ${e.message}`)); q.end(corpo);
  });
  console.log(`http real (${MODO}, porta ${process.env.PORTA}):`, resp);
}
await app.close();
await mem.banco.encerrar();
process.exit(0);
