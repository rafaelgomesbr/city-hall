import { grupo as administracao } from "./grupos/administracao.js";
import { grupo as aplicativos } from "./grupos/aplicativos.js";
import { grupo as autenticacao } from "./grupos/autenticacao.js";
import { grupo as campo } from "./grupos/campo.js";
import { grupo as conta } from "./grupos/conta.js";
import { grupo as documentos } from "./grupos/documentos.js";
import { grupo as mapaEBusca } from "./grupos/mapa-e-busca.js";
import { grupo as ocorrencias } from "./grupos/ocorrencias.js";
import { grupo as oficiosEOrgaos } from "./grupos/oficios-e-orgaos.js";
import { grupo as prestacaoDeContas } from "./grupos/prestacao-de-contas.js";
import { grupo as publico } from "./grupos/publico.js";
import { chaveDaRota, type GrupoDoContrato, type RotaDoContrato } from "./tipos.js";

/**
 * O registro único de rotas do contrato `/v1` (V2-F02-E04).
 *
 * Esta lista é a fonte do documento OpenAPI (`openapi.ts` → `openapi/v1.json`)
 * e é o mesmo arquivo que a V2-F03-E12 estende com ação, ator, plateia e
 * escopo de cada rota: não nascem duas listas.
 *
 * As entradas moram em `grupos/*.ts`, UM ARQUIVO POR GRUPO, para quem completa
 * o contrato (lote 3 da F02) trabalhar em grupos diferentes sem conflito. Este
 * arquivo só junta.
 *
 * Como descrever uma rota que está em `pendentes`: escreva a entrada em
 * `rotas` do grupo, tire a chave de `pendentes` e rode
 * `npm run openapi --workspace @dc360/api` para regerar o `v1.json`. O teto de
 * pendências em `test/openapi.test.ts` só desce.
 *
 * Rota nova entra aqui COM `resposta` e `nova: true`.
 */
export const GRUPOS: readonly GrupoDoContrato[] = [
  administracao,
  aplicativos,
  autenticacao,
  campo,
  conta,
  documentos,
  mapaEBusca,
  ocorrencias,
  oficiosEOrgaos,
  prestacaoDeContas,
  publico,
];

/** Uma entrada com o grupo a que pertence. */
export type RotaComGrupo = RotaDoContrato & { readonly grupo: string };

/** Todas as entradas descritas, de todos os grupos. */
export const ROTAS_DO_CONTRATO: readonly RotaComGrupo[] = GRUPOS.flatMap((g) =>
  g.rotas.map((r) => ({ ...r, grupo: g.nome })),
);

/** As rotas registradas ainda sem entrada, com o grupo que responde por elas. */
export const ROTAS_PENDENTES: readonly { chave: string; grupo: string }[] = GRUPOS.flatMap((g) =>
  g.pendentes.map((chave) => ({ chave, grupo: g.nome })),
);

/** As entradas existentes (não `nova`) que ainda não descrevem a resposta. */
export function rotasSemResposta(
  rotas: readonly RotaComGrupo[] = ROTAS_DO_CONTRATO,
): readonly RotaComGrupo[] {
  return rotas.filter((r) => !r.nova && !r.resposta);
}

/** O que está errado com o registro em si (independente das rotas do servidor). */
export function problemasDoRegistro(rotas: readonly RotaComGrupo[] = ROTAS_DO_CONTRATO): string[] {
  const problemas: string[] = [];
  const vistas = new Set<string>();
  for (const r of rotas) {
    const chave = chaveDaRota(r);
    if (vistas.has(chave)) problemas.push(`entrada repetida: ${chave}`);
    vistas.add(chave);
    if (!r.caminho.startsWith("/v1/")) problemas.push(`caminho fora do /v1: ${chave}`);
    if (r.caminho.length > 1 && r.caminho.endsWith("/")) {
      problemas.push(`caminho com barra no fim: ${chave}`);
    }
    if (!r.resumo.trim()) problemas.push(`entrada sem resumo: ${chave}`);
    if (r.nova && !r.resposta) problemas.push(`rota nova sem resposta: ${chave}`);
  }
  return problemas;
}
