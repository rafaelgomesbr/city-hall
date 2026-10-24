import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Migracao } from "./migrar.js";
import type { Desfazer } from "./regras-de-migracao.js";

/**
 * Lê as migrações do disco.
 *
 * Fica separado do aplicador de propósito: o aplicador é lógica pura e roda
 * contra qualquer executor de SQL, o que é o que permite testá-lo sem tocar em
 * arquivo. Aqui é só a leitura.
 */
export function pastaDeMigracoes(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
}

export function carregarMigracoes(pasta = pastaDeMigracoes()): Migracao[] {
  return readdirSync(pasta)
    .filter((arquivo) => arquivo.endsWith(".sql"))
    .sort()
    .map((arquivo) => ({
      versao: arquivo,
      sql: readFileSync(join(pasta, arquivo), "utf8"),
    }));
}

/**
 * As voltas das migrações (V2-F01-E18): `db/migrations/desfazer/NNN_nome.sql`,
 * com o mesmo nome da migração que desfazem. Ficam numa subpasta para que
 * `carregarMigracoes`, que só lê `.sql` direto de `db/migrations`, nunca as
 * aplique por engano.
 */
export function pastaDeDesfazeres(): string {
  return join(pastaDeMigracoes(), "desfazer");
}

export function carregarDesfazeres(pasta = pastaDeDesfazeres()): Desfazer[] {
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta)
    .filter((arquivo) => arquivo.endsWith(".sql"))
    .sort()
    .map((arquivo) => ({
      versao: arquivo,
      sql: readFileSync(join(pasta, arquivo), "utf8"),
    }));
}

export function pastaDeSementes(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "seeds");
}

export function carregarSemente(nome = "desenvolvimento.sql"): string {
  return readFileSync(join(pastaDeSementes(), nome), "utf8");
}
