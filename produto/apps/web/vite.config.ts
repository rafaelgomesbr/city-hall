import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));
const raizDoMonorepo = resolve(aqui, "..", "..");

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // A migracao e importada de db/migrations, fora da raiz deste app: e o
    // mesmo arquivo que roda no servidor, e duplicar seria abrir espaco para
    // o banco do navegador divergir do banco de producao.
    fs: { allow: [raizDoMonorepo] },
  },
  // PGlite traz o Postgres em WebAssembly: pre-bundling quebra o carregamento
  // do .wasm, entao fica fora do optimizeDeps.
  optimizeDeps: { exclude: ["@electric-sql/pglite"] },
  worker: { format: "es" },
});
