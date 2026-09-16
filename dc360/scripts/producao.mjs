/**
 * O que os roteiros de produção compartilham: onde a senha mora, qual é o
 * banco, e como montar a URL sem que a senha a parta ao meio.
 *
 * Saiu de `migrar-producao.mjs` em 15/09/2026, quando `copiar-producao.mjs`
 * passou a precisar das mesmas três coisas e o migrador passou a precisar de
 * saber se há cópia recente: dois arquivos importando um ao outro é um ciclo
 * que funciona por acaso. Este é o único lugar em que o projeto sabe o
 * endereço do banco de produção. Os comentários de cada constante são os de
 * origem, e valem.
 */
import { execFileSync } from "node:child_process";

/** Onde a senha mora no chaveiro. Ver `--ajuda`. */
export const CONTA = "dc360";
export const COFRE = "senha-do-banco-dc360";

/** O projeto na Supabase. Aparece no endereço e no nome do papel. */
export const PROJETO = "bppklrxxwjshxvkvwirw";

/**
 * O banco de produção, PELO POOLER, e isto foi correção e não gosto.
 *
 * A primeira versão apontava para a conexão direta
 * (`db.<projeto>.supabase.co`), com o argumento de que migração é sessão longa.
 * O argumento estava certo e o endereço estava errado: contra a rede de
 * verdade, em 14/09/2026,
 *
 *   Error: getaddrinfo ENOTFOUND db.bppklrxxwjshxvkvwirw.supabase.co
 *
 * Não é queda nem bloqueio. O nome da conexão direta só tem registro AAAA, ou
 * seja, só existe em IPv6:
 *
 *   dig +short A    db.<projeto>.supabase.co  ->  (vazio)
 *   dig +short AAAA db.<projeto>.supabase.co  ->  2600:1f1e:c3:2702:...
 *
 * Numa rede sem IPv6, que é a da máquina que rodou e provavelmente a da
 * prefeitura, aquilo é um nome que não resolve. O pooler tem IPv4.
 */
export const HOST = "aws-0-sa-east-1.pooler.supabase.com";

/**
 * MODO SESSÃO, e a porta é a diferença inteira.
 *
 * 5432 é sessão: a conexão é sua do começo ao fim. 6543 é transação, onde ela
 * volta para o bolo ao fim de cada transação, e aí não há sessão nenhuma para
 * segurar `SET ROLE`, trava de aviso, ou qualquer coisa que atravesse
 * comandos. Migração precisa das duas coisas.
 */
export const PORTA = 5432;

/**
 * A URL, com a senha codificada para caber nela.
 *
 * `encodeURIComponent` e não interpolação crua: uma senha com `@` faz o
 * analisador de URL achar que o host começa ali, e o erro que sai fala de um
 * host que não existe. Quem lê aquilo vai conferir DNS, e o problema é um
 * caractere da senha.
 *
 * Função separada e exportada porque é a única parte que dá para provar sem um
 * banco de pé, e é a parte que erra em silêncio.
 */
export function montarUrl(senha, host = HOST) {
  /*
    Pelo pooler o papel leva o projeto colado, e isso é exigência do provedor:
    é assim que ele sabe para qual banco encaminhar a conexão. O papel de
    verdade continua sendo `postgres`.
  */
  return `postgresql://postgres.${PROJETO}:${encodeURIComponent(senha)}`
    + `@${host}:${PORTA}/postgres?sslmode=verify-full`;
}

export function senhaDoChaveiro() {
  try {
    return execFileSync(
      "security",
      ["find-generic-password", "-a", CONTA, "-s", COFRE, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).replace(/\n$/, "");
  } catch {
    console.error(
      `\nNão achei a senha do banco no chaveiro do Mac.\n\n`
      + `Guarde ela primeiro com o comando abaixo. Ele vai PERGUNTAR a senha e\n`
      + `pedir de novo para conferir, e ela não aparece na tela nem fica no\n`
      + `histórico do terminal:\n\n`
      + `  security add-generic-password -a ${CONTA} -s ${COFRE} -w\n\n`
      + `A senha é a do banco, que se gera no painel da Supabase em\n`
      + `Database > Settings > Reset database password.\n`,
    );
    process.exit(1);
  }
}

