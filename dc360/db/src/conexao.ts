import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A ÂNCORA DE CONFIANÇA DO MIGRADOR.
 *
 * O migrador conectava com `new pg.Client({ connectionString })` e mais nada,
 * enquanto a API monta o objeto `ssl` em `montarConfiguracaoDoPool`. Contra a
 * Supabase de verdade, em 14/09/2026, isso deu:
 *
 *   SELF_SIGNED_CERT_IN_CHAIN self-signed certificate in certificate chain
 *
 * A raiz da Supabase (`prod-ca-2021`) não está no repositório de certificados
 * do sistema operacional, então o Node recusa a cadeia. Quer dizer que
 * `npm run migrar` contra produção simplesmente não funcionava.
 *
 * ## Por que isso é de segurança e não de conveniência
 *
 * Neste `pg`, `require` e `verify-ca` são APELIDOS de `verify-full` (está
 * escrito e testado em `apps/api/src/banco/tls.ts`). Não existe o modo frouxo
 * do libpq: ou há âncora, ou não conecta. Então quem batesse naquele erro sem
 * saber disso iria procurar o que faz o erro sumir, e o que faz o erro sumir é
 * TIRAR o `sslmode` da URL.
 *
 * Foi exatamente essa omissão de uma palavra que, em 09/09/2026, deixou a base
 * de todos os municípios trafegando cifrada e não autenticada: quem se
 * colocasse entre o cliente e o banco apresentava certificado próprio e a
 * conexão subia igual, porque o SCRAM só retransmite desafio e resposta.
 *
 * A defesa é não deixar a pessoa chegar no erro.
 */

const DAQUI = dirname(fileURLToPath(import.meta.url));

/**
 * O certificado que acompanha o repositório, em caminho absoluto.
 *
 * Absoluto porque o `pg` resolve `sslrootcert` contra o diretório de trabalho
 * do processo, e `npm run migrar` é chamado tanto da raiz do repositório
 * quanto de dentro de `db/`. Um caminho relativo funcionaria num e falharia no
 * outro, com a mesma mensagem de cadeia recusada.
 *
 * Sobe um nível a partir daqui porque este módulo roda tanto de `src` quanto
 * de `dist`.
 */
export const CA_DO_REPOSITORIO = existsSync(resolve(DAQUI, "../provedores/supabase-prod-ca-2021.crt"))
  ? resolve(DAQUI, "../provedores/supabase-prod-ca-2021.crt")
  : resolve(DAQUI, "../../provedores/supabase-prod-ca-2021.crt");

/** Modos em que este `pg` confere a cadeia. Ver o cabeçalho. */
const MODOS_QUE_VERIFICAM = new Set(["require", "verify-ca", "verify-full"]);

/**
 * A mesma URL, com a raiz do repositório apontada quando faltava.
 *
 * Não mexe em três casos, e cada um tem razão própria:
 *
 * - **sem `sslmode` que verifica**: pendurar uma raiz ali daria uma conexão
 *   que PARECE verificar e não verifica, que é pior do que as duas pontas.
 *   Migrar um Postgres local sem TLS é caso legítimo;
 * - **com `sslrootcert` já escrito**: quem nomeou a própria raiz manda. Um
 *   município noutro provedor tem outra cadeia;
 * - **string que não analisa como URL**: o migrador não é o lugar de julgar
 *   isso. O erro que vem do `pg` é mais preciso que qualquer um que eu
 *   inventasse aqui.
 */
export function urlComAncoraDeConfianca(url: string): string {
  let endereco: URL;
  try {
    endereco = new URL(url);
  } catch {
    return url;
  }

  const modo = endereco.searchParams.get("sslmode");
  if (!modo || !MODOS_QUE_VERIFICAM.has(modo)) return url;
  if (endereco.searchParams.get("sslrootcert")) return url;

  if (!existsSync(CA_DO_REPOSITORIO)) {
    throw new Error(
      `A URL pede sslmode=${modo}, que neste pg CONFERE a cadeia do servidor, e `
      + `o certificado do provedor não está em ${CA_DO_REPOSITORIO}. `
      + "Baixe de novo em Settings > Database > SSL configuration, ou aponte o "
      + "seu com sslrootcert= na própria URL. NÃO tire o sslmode: sem ele a "
      + "conexão fica cifrada e não autenticada, que é o que parece consertado "
      + "e não está.",
    );
  }

  endereco.searchParams.set("sslrootcert", CA_DO_REPOSITORIO);
  return endereco.toString();
}
