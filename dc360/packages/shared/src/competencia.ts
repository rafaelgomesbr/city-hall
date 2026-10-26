import type { TipoCobrade } from "./dominio.js";

/** Competência cadastrada pelo município, com o identificador do órgão. */
export interface CompetenciaDoOrgao {
  readonly orgaoId: string;
  readonly tiposCobrade: readonly TipoCobrade[];
  readonly ativa: boolean;
}

/** Orientação para a escolha, sem bloquear o encaminhamento. */
export interface ResultadoDaConferencia {
  readonly entreSugeridos: boolean;
  readonly precisaJustificativa: boolean;
}

/** Sugere cada órgão uma vez, na ordem da primeira competência ativa correspondente. */
export function orgaosCompetentes(
  tipoDaOcorrencia: TipoCobrade,
  competencias: readonly CompetenciaDoOrgao[],
): string[] {
  const sugeridos = new Set<string>();

  for (const competencia of competencias) {
    if (competencia.ativa && competencia.tiposCobrade.includes(tipoDaOcorrencia)) {
      sugeridos.add(competencia.orgaoId);
    }
  }

  return [...sugeridos];
}

/**
 * Fora da sugestão, pede ao menos 20 caracteres de justificativa após aparar
 * espaços das pontas. A pendência é devolvida como dado, sem lançar erro.
 * Uma lista vazia de sugestões também deixa a escolha fora da sugestão.
 */
export function conferirEscolha(
  tipo: TipoCobrade,
  orgaoEscolhido: string,
  competencias: readonly CompetenciaDoOrgao[],
  justificativa?: string,
): ResultadoDaConferencia {
  const entreSugeridos = orgaosCompetentes(tipo, competencias).includes(orgaoEscolhido);

  return {
    entreSugeridos,
    precisaJustificativa: !entreSugeridos && (justificativa?.trim().length ?? 0) < 20,
  };
}
