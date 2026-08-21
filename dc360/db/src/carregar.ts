import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Migracao } from "./migrar.js";

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

export function pastaDeSementes(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "seeds");
}

export function carregarSemente(nome = "desenvolvimento.sql"): string {
  return readFileSync(join(pastaDeSementes(), nome), "utf8");
}
