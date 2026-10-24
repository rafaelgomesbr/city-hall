// Casos de `semgrep --test` da regra sql-por-interpolacao.yml.

declare const c: any;
declare const entrada: string;

export async function positivoTemplateDireto() {
  // ruleid: dc360-sql-por-interpolacao
  return c.query(`SELECT * FROM ocorrencias WHERE protocolo = '${entrada}'`);
}

export async function positivoTemplateComGenerico() {
  // ruleid: dc360-sql-por-interpolacao
  return c.query<{ id: string }>(`SELECT id FROM ocorrencias WHERE id = ${entrada}`);
}

export async function positivoTemplatePorVariavel() {
  const sql = `SELECT * FROM ocorrencias WHERE bairro = '${entrada}'`;
  // ruleid: dc360-sql-por-interpolacao
  return c.query(sql, []);
}

export async function positivoConcatenacao() {
  // ruleid: dc360-sql-por-interpolacao
  return c.query("SELECT * FROM ocorrencias WHERE id = " + entrada);
}

export async function positivoConcatenacaoPorVariavel() {
  const sql = "SELECT * FROM ocorrencias WHERE id = " + entrada;
  // ruleid: dc360-sql-por-interpolacao
  return c.query(sql);
}

export async function negativoParametrizado() {
  // ok: dc360-sql-por-interpolacao
  return c.query("SELECT * FROM ocorrencias WHERE protocolo = $1", [entrada]);
}

export async function negativoTemplateSemInterpolacao() {
  // ok: dc360-sql-por-interpolacao
  return c.query(`
    SELECT id FROM ocorrencias
     WHERE protocolo = $1`, [entrada]);
}

export async function negativoInterpolacaoForaDaConsulta() {
  const rotulo = `ocorrencia ${entrada}`;
  // ok: dc360-sql-por-interpolacao
  return c.query("SELECT $1::text", [rotulo]);
}

// Formas reais do repositório: fragmento montado por variável e consulta com
// tipo genérico em várias linhas (a consulta de contagem das listas).
declare const params: unknown[];
export async function positivoGenericoEmVariasLinhas() {
  const onde = entrada ? `WHERE x = $${params.length}` : "";
  const total = await c.query<{ total: string }>(
    // ruleid: dc360-sql-por-interpolacao
    `SELECT count(*)::text AS total FROM ocorrencias o ${onde}`,
    params,
  );
  return total;
}

export async function negativoGenericoParametrizadoComAwait() {
  // ok: dc360-sql-por-interpolacao
  const r = await c.query<{ id: string }>("SELECT id FROM ocorrencias WHERE id = $1", [entrada]);
  return r;
}

export async function positivoComAwaitSemGenerico() {
  const r = await c.query(
    // ruleid: dc360-sql-por-interpolacao
    `SELECT id FROM ocorrencias WHERE id = '${entrada}'`,
    [],
  );
  return r;
}
