import type { Severidade, StatusOcorrencia } from "./dominio.js";
import { PRAZO_PADRAO_HORAS, ocorrenciaAtiva } from "./dominio.js";

/**
 * Protocolo é único por organização e por ano, no formato NNNNNN/AAAA.
 *
 * A geração real acontece no banco, dentro da transação, com uma sequência
 * por (organizacao, ano) e restrição de unicidade: gerar na aplicação abriria
 * corrida entre dois operadores registrando ao mesmo tempo. Esta função existe
 * só para formatar o número que o banco devolveu.
 */
export function formatarProtocolo(sequencial: number, ano: number): string {
  if (!Number.isInteger(sequencial) || sequencial < 1) {
    throw new Error("Sequencial de protocolo deve ser inteiro positivo");
  }
  if (sequencial > 999999) {
    throw new Error("Sequencial de protocolo estourou seis dígitos no ano");
  }
  return `${String(sequencial).padStart(6, "0")}/${ano}`;
}

export function partesDoProtocolo(protocolo: string): { sequencial: number; ano: number } {
  const casou = /^(\d{6})\/(\d{4})$/.exec(protocolo);
  if (!casou) {
    throw new Error(`Protocolo fora do formato esperado: ${protocolo}`);
  }
  return { sequencial: Number(casou[1]), ano: Number(casou[2]) };
}

/** Prazo de atendimento a partir da severidade definida na triagem. */
export function prazoAPartirDaSeveridade(severidade: Severidade, base: Date): Date {
  return new Date(base.getTime() + PRAZO_PADRAO_HORAS[severidade] * 3_600_000);
}

/**
 * Atrasada é a ocorrência ainda ativa cujo prazo já venceu. Ocorrência
 * encerrada nunca conta como atrasada, mesmo que tenha vencido antes de
 * encerrar: o indicador serve para dirigir atenção ao que ainda dá para agir.
 */
export function estaAtrasada(
  status: StatusOcorrencia,
  prazoEm: Date | null,
  agora: Date,
): boolean {
  if (!ocorrenciaAtiva(status)) return false;
  if (!prazoEm) return false;
  return prazoEm.getTime() < agora.getTime();
}

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
