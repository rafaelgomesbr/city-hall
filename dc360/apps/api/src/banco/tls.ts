/**
 * O que a `DATABASE_URL` diz sobre CONFERIR com quem o servidor está falando.
 *
 * Mora num módulo próprio, sem `pg` e sem `node:fs`, por uma razão prática: a
 * decisão precisa ser conferida em DOIS lugares que não podem depender um do
 * outro. Na partida, por `config.ts`, que é quem derruba o processo antes de
 * ele atender qualquer requisição; e na montagem do pool, por `postgres.ts`,
 * que é o único caminho por onde uma conexão de verdade nasce (inclusive a da
 * trava do varredor, que não passa por `config.ts`).
 *
 * O DEFEITO QUE ISTO FECHA foi provado em 09/09/2026, depois de a verificação
 * já ter sido "consertada" uma vez. `montarConfiguracaoDoPool` só monta o
 * objeto `ssl` quando a URL traz um `sslmode` da lista abaixo. Sem `sslmode`
 * nenhum, ela devolvia a string crua e o processo subia calado, sem âncora de
 * confiança, respondendo a tudo. E a palavra `verify-full` não aparecia em
 * lugar nenhum que o operador lesse: nem no `fly.toml`, nem na tabela de
 * variáveis obrigatórias de `docs/COLOCAR-DE-PE.md`, nem no `.env.example`,
 * nem no README. Existia só no `.env` local, que é ignorado pelo git.
 *
 * Ou seja: bastava alguém provisionar o segundo município colando a URL que o
 * painel do provedor oferece, que não traz `sslmode`, para que quem estivesse
 * entre a API e o banco LESSE E REESCREVESSE a base de todos os municípios,
 * sem uma linha de log dizendo isso. O SCRAM não protege desse caso: o
 * intermediário só retransmite o desafio e a resposta.
 */

/**
 * Modos em que o `pg` VERIFICA a cadeia do servidor.
 *
 * Cuidado que já custou caro: neste `pg`, `require` e `verify-ca` são apelidos
 * de `verify-full`, não os modos frouxos do libpq. O próprio
 * `pg-connection-string` avisa isso por `process.emitWarning`. Ou seja, os
 * três exigem CA e conferem o nome do host, e `sslmode=require` sem âncora não
 * conecta.
 */
export const MODOS_QUE_VERIFICAM: ReadonlySet<string> = new Set([
  "require",
  "verify-ca",
  "verify-full",
]);

/** O que a documentação manda escrever, e o que os testes cobram dela. */
export const SSLMODE_EXIGIDO = "verify-full";

/**
 * O `sslmode` declarado na URL, ou `null` quando não há.
 *
 * URL que não analisa devolve `null`, e `null` NÃO verifica: o lado seguro do
 * erro aqui é recusar. Uma string de conexão malformada que fosse tratada como
 * "provavelmente verifica" derrubaria a própria defesa no caso em que ninguém
 * sabe o que a string diz.
 */
export function modoDeSslDaUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get("sslmode");
  } catch {
    return null;
  }
}

/** `true` só quando a URL pede um modo que confere o certificado do servidor. */
export function urlDoBancoVerifica(url: string): boolean {
  const modo = modoDeSslDaUrl(url);
  return modo !== null && MODOS_QUE_VERIFICAM.has(modo);
}

/**
 * A mensagem que o operador lê quando a partida é recusada.
 *
 * Ela diz o que colar, e não só o que está errado: o defeito nasceu de alguém
 * colar a URL que o painel do provedor oferece, então a correção precisa caber
 * numa linha de terminal.
 */
export function mensagemDeUrlSemVerificacao(nomeDaVariavel: string, url: string): string {
  const modo = modoDeSslDaUrl(url);
  return (
    `${nomeDaVariavel} não pede verificação do certificado do banco `
    + `(sslmode=${modo ?? "ausente"}). Acrescente \`?sslmode=${SSLMODE_EXIGIDO}\` ao fim da URL `
    + "(ou `&sslmode=" + SSLMODE_EXIGIDO + "` se ela já tiver outro parâmetro). "
    + "Sem isso a conexão sobe cifrada e NÃO autenticada: quem estiver entre a "
    + "API e o banco lê e reescreve a base de todos os municípios, e o SCRAM não "
    + "acusa nada, porque o intermediário só retransmite o desafio e a resposta. "
    + `A âncora de confiança já está versionada no repositório, então ${SSLMODE_EXIGIDO} `
    + "funciona sem mais nenhuma configuração."
  );
}
