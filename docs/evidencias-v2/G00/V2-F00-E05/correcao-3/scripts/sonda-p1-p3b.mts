// Com o `rotas/orgaos.ts` plantado da revisão (P1 e P3b), sobe a API nos dois modos da guarda e pede
// GET /orgaos sem token com `x-p1` (401 reescrito por um onSend acrescentado DEPOIS por onRoute) e
// GET /orgaos/nao/existe com `x-p3` (404 do plugin trocado por 403 por um onSend do contexto).
const W = process.env.W!;
const api = `${W}/dc360/apps/api/src`;
const { bancoEmMemoria } = await import(`${api}/banco/memoria.ts`);
const { carregarConfig } = await import(`${api}/config.ts`);
const { construirServidor } = await import(`${api}/servidor.ts`);
const { armazenamentoEmMemoria } = await import(`${api}/armazenamento/memoria.ts`);
const { lerDesviosDaGuarda } = await import(`${api}/guarda-de-codigos-de-erro.ts`);
const mem = await bancoEmMemoria();
const config = carregarConfig({ NODE_ENV: "test", JWT_SEGREDO: "segredo-da-revisao-com-mais-de-32-bytes-ok", LOGIN_POR_IP: "10000" } as NodeJS.ProcessEnv);
for (const modo of ["falhar", "corrigir"] as const) {
  const log: string[] = [];
  const app = await construirServidor({ banco: mem.banco, config, armazenamento: armazenamentoEmMemoria({ baseUrl: "http://127.0.0.1:0" }), modoDaGuarda: modo, destinoDeLog: { write: (l: string) => { log.push(l); } } });
  await app.ready();
  for (const [cab, url] of [["x-p1", "/orgaos"], ["x-p3", "/orgaos/nao/existe"]] as const) {
    const r = await app.inject({ method: "GET", url, headers: { [cab]: "1" } });
    const d = lerDesviosDaGuarda();
    const l = log.filter((x) => x.includes("desvioDoCatalogo")).map((x) => JSON.stringify(JSON.parse(x).desvioDoCatalogo));
    console.log(`${cab} ${modo.padEnd(8)} status=${r.statusCode} desvios=${d.length} corpo=${r.body.slice(0, 160)} log=${l.join(" ")}`);
    log.length = 0;
  }
  await app.close();
}
await mem.banco.encerrar();
process.exit(0);
