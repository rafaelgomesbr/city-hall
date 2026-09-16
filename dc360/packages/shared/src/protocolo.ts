/*
  Até 15/09/2026 este arquivo também exportava `formatarProtocolo`,
  `partesDoProtocolo`, `prazoAPartirDaSeveridade` e `estaAtrasada`, e nenhum
  dos quatro tinha um único uso nas quatro árvores: o protocolo nasce e se
  formata NO BANCO (`proximo_protocolo`, em `db/migrations/001_base.sql`, com
  `lpad`), o prazo é calculado pela mesma função SQL a partir de
  `PRAZO_PADRAO_HORAS`, e "atrasada" é uma expressão SQL escrita uma vez em
  `apps/web/src/dados/local.ts` e nas rotas da API. Regra que mora no banco
  não ganha uma cópia em TypeScript que ninguém chama: cópia sem uso é cópia
  que diverge sem ninguém perceber.
*/

/**
 * Chave de storage sempre prefixada por tenant. É a segunda barreira de
 * isolamento, junto do RLS: mesmo que uma URL vaze, ela não alcança outro
 * município porque o prefixo faz parte do caminho.
 */
export function chaveDeStorage(
  organizacaoId: string,
  ocorrenciaId: string,
  nomeArquivo: string,
): string {
  if (!organizacaoId) throw new Error("Chave de storage exige organizacaoId");
  const limpo = nomeArquivo.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `tenant/${organizacaoId}/ocorrencias/${ocorrenciaId}/${limpo}`;
}
