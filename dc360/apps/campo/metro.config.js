/**
 * Metro dentro de um monorepo.
 *
 * O aplicativo consome `@dc360/shared` e `@dc360/campo` por link para
 * `packages/`, fora desta pasta. Sem os dois ajustes abaixo o empacotador não
 * enxerga esses arquivos e o build quebra com "module not found" para um
 * pacote que está claramente instalado.
 */
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projeto = __dirname;
const raizMonorepo = path.resolve(projeto, "../..");

const config = getDefaultConfig(projeto);

// 1. Observar também a raiz: é lá que os pacotes compartilhados mudam.
config.watchFolders = [raizMonorepo];

// 2. Procurar dependências nos dois lugares, nesta ordem.
config.resolver.nodeModulesPaths = [
  path.resolve(projeto, "node_modules"),
  path.resolve(raizMonorepo, "node_modules"),
];

/*
  Os pacotes compartilhados publicam `exports` com a condição "default"
  apontando para ESM. O Metro precisa saber ler `exports`, senão resolve pelo
  `main` legado e perde os subcaminhos.
*/
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
