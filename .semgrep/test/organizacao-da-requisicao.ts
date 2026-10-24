// Casos de `semgrep --test` das regras de organizacao-da-requisicao.yml.
// `ruleid:` marca a linha SEGUINTE como achado esperado; `ok:` marca como
// ausência esperada. Este arquivo não é compilado nem entregue: só o Semgrep o lê.

declare const req: any;
declare const request: any;
declare const banco: any;
declare const schema: any;
declare const quem: { organizacaoId: string };

// --- acesso direto ----------------------------------------------------------

export async function positivoBody() {
  // ruleid: dc360-organizacao-lida-da-requisicao
  const org = req.body.organizacaoId;
  return org;
}

export async function positivoBodySnake() {
  // ruleid: dc360-organizacao-lida-da-requisicao
  return request.body.organizacao_id;
}

export async function positivoQuery() {
  // ruleid: dc360-organizacao-lida-da-requisicao
  return req.query.organizacaoId;
}

export async function positivoParams() {
  // ruleid: dc360-organizacao-lida-da-requisicao
  return req.params.organizacaoId;
}

export async function positivoCabecalho() {
  // ruleid: dc360-organizacao-lida-da-requisicao
  return req.headers["x-organizacao-id"];
}

export async function positivoDesestruturado() {
  // ruleid: dc360-organizacao-lida-da-requisicao
  const { organizacaoId } = req.body;
  return organizacaoId;
}

export async function positivoDesestruturadoComRenome() {
  // ruleid: dc360-organizacao-lida-da-requisicao
  const { organizacao_id: org } = req.query;
  return org;
}

export async function negativoDoToken() {
  // ok: dc360-organizacao-lida-da-requisicao
  return quem.organizacaoId;
}

export async function negativoOutroCampoDoCorpo() {
  // ok: dc360-organizacao-lida-da-requisicao
  return req.body.descricao;
}

export async function negativoOutroObjeto() {
  const config = { query: { organizacaoId: "x" } };
  // ok: dc360-organizacao-lida-da-requisicao
  return config.query.organizacaoId;
}

// --- fluxo até o tenant -----------------------------------------------------

export async function positivoFluxoDireto() {
  // ruleid: dc360-organizacao-da-requisicao-chega-no-tenant
  return banco.comTenant(req.body.valor, async () => 1);
}

export async function positivoFluxoPorVariavel() {
  const dados = schema.parse(req.body);
  // ruleid: dc360-organizacao-da-requisicao-chega-no-tenant
  return banco.comTenant(dados.org, async () => 1);
}

export async function positivoFluxoDeParametro() {
  const { id } = req.params;
  // ruleid: dc360-organizacao-da-requisicao-chega-no-tenant
  return banco.comTenant(id, async () => 1);
}

export async function negativoFluxoDoToken(id: string) {
  const dados = schema.parse(req.body);
  // ok: dc360-organizacao-da-requisicao-chega-no-tenant
  return banco.comTenant(quem.organizacaoId, async (c: any) => c.query("SELECT 1", [dados.id, id]));
}
