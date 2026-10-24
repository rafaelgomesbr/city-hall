/**
 * Qual versão e qual commit estão rodando, para `/saude` dizer.
 *
 * Quem decide os dois valores é o BUILD DA IMAGEM, não a partida: o
 * `Dockerfile` (e o `Dockerfile.console`) recebem `DC360_VERSAO` e `DC360_COMMIT`
 * como argumentos de build e os gravam como variáveis de ambiente da imagem. O
 * número da versão vem de `package.json` (`node scripts/versao.mjs mostrar`, a
 * E07), e o commit é o SHA de quem construiu. É por isso que o rollback do Fly
 * (`docs/runbooks/rollback.md`) consegue conferir DE FORA, com um `curl`, se a
 * imagem que subiu é a que se queria.
 *
 * Fica fora de `config.ts` de propósito: não é configuração de quem opera (não
 * se muda com `fly secrets set`, e mudar à mão mentiria sobre o que está
 * rodando), é um carimbo da imagem. A leitura é validada pelo FORMATO: `/saude`
 * é pública, e um valor qualquer colado numa variável de ambiente não pode sair
 * por ela.
 *
 * Fora de uma imagem (`npm run dev`, os testes) as variáveis não existem, e a
 * resposta é `desconhecida` / `desconhecido` em vez de um número inventado.
 */

/** SemVer estrito, o mesmo formato que `scripts/versao.mjs` aceita (X.Y.Z). */
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
/** SHA de commit abreviado ou inteiro, em minúsculas. */
const SHA = /^[0-9a-f]{7,40}$/;

export const VERSAO_DESCONHECIDA = "desconhecida";
export const COMMIT_DESCONHECIDO = "desconhecido";

export interface VersaoDoBuild {
  versao: string;
  commit: string;
}

export function versaoDoBuild(ambiente: NodeJS.ProcessEnv = process.env): VersaoDoBuild {
  const versao = (ambiente["DC360_VERSAO"] ?? "").trim();
  const commit = (ambiente["DC360_COMMIT"] ?? "").trim();
  return {
    versao: SEMVER.test(versao) ? versao : VERSAO_DESCONHECIDA,
    commit: SHA.test(commit) ? commit : COMMIT_DESCONHECIDO,
  };
}
