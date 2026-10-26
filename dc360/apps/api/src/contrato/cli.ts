import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gerarOpenApi, relatorioDeRotasSemResposta, serializarOpenApi } from "./openapi.js";

/**
 * O comando que escreve `apps/api/openapi/v1.json` (V2-F02-E04).
 *
 *   npm run openapi --workspace @dc360/api              escreve o arquivo
 *   npm run openapi --workspace @dc360/api -- --relatorio   imprime o relatório
 *
 * O arquivo é derivado do registro de rotas: regere, nunca edite. Em conflito
 * de mesclagem, regere em vez de mesclar à mão.
 */
const CAMINHO_DO_V1_JSON = fileURLToPath(new URL("../../openapi/v1.json", import.meta.url));

if (process.argv.includes("--relatorio")) {
  process.stdout.write(relatorioDeRotasSemResposta());
} else {
  mkdirSync(dirname(CAMINHO_DO_V1_JSON), { recursive: true });
  writeFileSync(CAMINHO_DO_V1_JSON, serializarOpenApi(gerarOpenApi()), "utf8");
  process.stdout.write(`escrito: ${CAMINHO_DO_V1_JSON}\n`);
}
