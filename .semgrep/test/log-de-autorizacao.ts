// Casos de `semgrep --test` da regra log-de-autorizacao.yml.

declare const req: any;
declare const request: any;
declare const app: any;

export function positivoLogDireto() {
  // ruleid: dc360-log-de-authorization
  req.log.info(req.headers.authorization);
}

export function positivoLogComColchetes() {
  // ruleid: dc360-log-de-authorization
  app.log.warn(request.headers["authorization"]);
}

export function positivoLogEmObjeto() {
  // ruleid: dc360-log-de-authorization
  req.log.error({ auth: req.headers.authorization }, "falhou");
}

export function positivoLogDeTodosOsCabecalhos() {
  // ruleid: dc360-log-de-authorization
  req.log.debug({ headers: req.headers }, "entrada");
}

export function positivoLogDeCabecalhosSozinhos() {
  // ruleid: dc360-log-de-authorization
  console.log(req.headers);
}

export function positivoLogEmTemplate() {
  // ruleid: dc360-log-de-authorization
  req.log.info(`entrou com ${req.headers.authorization}`);
}

export function negativoLogSemCredencial() {
  // ok: dc360-log-de-authorization
  req.log.info({ rota: "/ocorrencias" }, "entrada");
}

export function negativoLeituraSemLog() {
  // ok: dc360-log-de-authorization
  const cabecalho = req.headers.authorization;
  return cabecalho;
}

export function negativoOutroCabecalho() {
  // ok: dc360-log-de-authorization
  req.log.info({ agente: req.headers["user-agent"] }, "entrada");
}
