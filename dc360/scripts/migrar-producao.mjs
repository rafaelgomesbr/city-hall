#!/usr/bin/env node
/**
 * MIGRAR A PRODUÇÃO, para quem nunca fez isso.
 *
 * Existe porque o caminho manual tem três armadilhas que não avisam, e as três
 * já morderam neste repositório:
 *
 * 1. **A credencial errada.** A `DATABASE_URL` do `.env` da API é do papel de
 *    APLICAÇÃO, que não pode criar tabela, de propósito. Migrar com ela dá
 *    "permission denied for schema public", que manda procurar no lugar errado.
 * 2. **A senha na URL.** Senha gerada pelo provedor pode ter `@`, `/` ou `#`,
 *    e qualquer um dos três parte a URL ao meio. O erro que sai fala de host
 *    inexistente, não de senha.
 * 3. **A senha no histórico.** Colada na linha de comando, ela fica em
 *    `~/.zsh_history`, em texto puro, para sempre.
 *
 * A senha mora no chaveiro do macOS e nunca passa pela tela. Este roteiro lê,
 * monta a URL com a senha codificada, e chama o migrador de sempre.
 *
 * ## O padrão é CONFERIR
 *
 * Sem argumento, ele só pergunta o que falta. Aplicar exige `--aplicar`
 * escrito à mão, porque migração é irreversível e o comando que aplica não
 * pode ser o que sai por engano de uma seta para cima.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** Onde a senha mora no chaveiro. Ver `--ajuda`. */
export const CONTA = "dc360";
export const COFRE = "senha-do-banco-dc360";

/** O banco de produção, pela conexão DIRETA e não pelo pooler. */
export const HOST = "db.bppklrxxwjshxvkvwirw.supabase.co";

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
  return `postgresql://postgres:${encodeURIComponent(senha)}@${host}:5432/postgres`
    + "?sslmode=verify-full";
}

function senhaDoChaveiro() {
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

/*
  Só executa quando é CHAMADO, e não quando é importado.

  O teste importa este arquivo para provar `montarUrl`, que é a parte que erra
  em silêncio. Sem esta guarda, importar dispararia a leitura do chaveiro e o
  teste morreria pedindo uma senha de produção para medir uma função pura.
*/
const chamadoDiretamente = process.argv[1]?.endsWith("migrar-producao.mjs") ?? false;

if (chamadoDiretamente) {
  const aplicar = process.argv.includes("--aplicar");
  const url = montarUrl(senhaDoChaveiro());
  const raiz = dirname(dirname(fileURLToPath(import.meta.url)));

  console.log(
    aplicar
      ? "APLICANDO as migrações que faltam na produção.\n"
      : "Só conferindo: nada vai ser escrito. Para aplicar, repita com --aplicar.\n",
  );

  const r = spawnSync(
    "npm",
    ["run", "migrar", "--", ...(aplicar ? [] : ["--conferir"])],
    { cwd: raiz, stdio: "inherit", env: { ...process.env, DATABASE_URL: url } },
  );
  process.exit(r.status ?? 1);
}
