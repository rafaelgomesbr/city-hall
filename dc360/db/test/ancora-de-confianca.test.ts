import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";

import { CA_DO_REPOSITORIO, urlComAncoraDeConfianca } from "../src/conexao.js";

/**
 * O MIGRADOR NÃO CONECTAVA EM PRODUÇÃO, e o contorno óbvio reabria um buraco
 * que este repositório já fechou uma vez.
 *
 * Provado contra a Supabase de verdade em 14/09/2026, com a credencial que já
 * estava no `.env`:
 *
 *   FALHOU: SELF_SIGNED_CERT_IN_CHAIN self-signed certificate in certificate chain
 *
 * A causa: `db/src/cli.ts` conecta com `new pg.Client({ connectionString })` e
 * mais nada, enquanto a API monta a âncora de confiança em
 * `montarConfiguracaoDoPool`. A raiz da Supabase (`prod-ca-2021`) não está no
 * repositório de certificados do sistema, então o Node recusa a cadeia.
 *
 * E o cuidado que este arquivo existe para travar: neste `pg`, `require` e
 * `verify-ca` são APELIDOS de `verify-full` (ver `apps/api/src/banco/tls.ts`).
 * Ou seja, não existe o modo frouxo do libpq: ou há âncora, ou não conecta.
 * Quem batesse no erro acima sem saber disso ia procurar o caminho que faz o
 * erro sumir, e o caminho que faz o erro sumir é tirar o `sslmode` da URL, que
 * é exatamente a omissão de uma palavra que em 09/09/2026 deixou a base de
 * todos os municípios trafegando cifrada e NÃO autenticada.
 *
 * A defesa é não deixar a pessoa chegar nesse erro: quando a URL pede
 * verificação e não diz onde está a raiz, o migrador aponta para a do próprio
 * repositório.
 */

const POOLER = "postgresql://u:s@aws-0-sa-east-1.pooler.supabase.com:5432/postgres";

describe("a âncora de confiança do migrador", () => {
  it("o certificado do repositório existe, senão nada abaixo significa coisa alguma", () => {
    expect(existsSync(CA_DO_REPOSITORIO)).toBe(true);
  });

  it("URL que pede verificação ganha a raiz do repositório", () => {
    const pronta = new URL(urlComAncoraDeConfianca(`${POOLER}?sslmode=verify-full`));

    expect(pronta.searchParams.get("sslrootcert")).toBe(CA_DO_REPOSITORIO);
    /* O resto da URL fica intacto: trocar host, porta ou papel aqui seria o
       migrador escrevendo noutro banco que não o pedido. */
    expect(pronta.hostname).toBe("aws-0-sa-east-1.pooler.supabase.com");
    expect(pronta.searchParams.get("sslmode")).toBe("verify-full");
  });

  /*
    `require` e `verify-ca` não são modos frouxos neste `pg`: são apelidos de
    `verify-full`. Deixar os dois de fora produziria de novo o erro de cadeia,
    agora em quem escreveu a URL do jeito que o painel do provedor oferece.
  */
  it("vale para os três modos que este pg verifica", () => {
    for (const modo of ["require", "verify-ca", "verify-full"]) {
      const pronta = new URL(urlComAncoraDeConfianca(`${POOLER}?sslmode=${modo}`));
      expect(pronta.searchParams.get("sslrootcert"), modo).toBe(CA_DO_REPOSITORIO);
    }
  });

  /*
    Quem já nomeou a própria raiz manda. Um município em outro provedor tem
    outra cadeia, e sobrescrever aqui faria o migrador recusar o banco certo
    com uma mensagem sobre um certificado que ninguém pediu.
  */
  it("não atropela quem já disse onde está a raiz", () => {
    const meu = "/tmp/a-minha-raiz.crt";
    const pronta = new URL(
      urlComAncoraDeConfianca(`${POOLER}?sslmode=verify-full&sslrootcert=${meu}`),
    );

    expect(pronta.searchParams.get("sslrootcert")).toBe(meu);
  });

  /*
    Sem `sslmode` a URL não verifica nada, e pendurar uma raiz ali produziria o
    pior dos mundos: uma conexão que PARECE verificar e não verifica. A API
    recusa essa combinação com erro, e aqui a resposta certa é não mexer: quem
    migra um Postgres local sem TLS é caso legítimo.
  */
  it("URL que não pede verificação sai como entrou", () => {
    const crua = "postgresql://u:s@localhost:5432/dc360";
    expect(urlComAncoraDeConfianca(crua)).toBe(crua);
  });

  it("string que não é URL sai como entrou, em vez de estourar", () => {
    expect(urlComAncoraDeConfianca("nem parece uma url")).toBe("nem parece uma url");
  });
});
