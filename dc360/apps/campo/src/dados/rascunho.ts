import type { FotoLocal } from "@dc360/campo";
import { bancoLocal } from "./banco-local";

/**
 * A vistoria em andamento, gravada a cada toque.
 *
 * Este arquivo existe por um cenário concreto: o agente marca o checklist,
 * tira quatro fotos, captura o GPS, e o Android mata o aplicativo para liberar
 * memória enquanto ele atende uma ligação. Sem isto, ele volta para uma tela
 * em branco e refaz a vistoria inteira, no barranco, com o morador esperando.
 *
 * Por isso o rascunho **não** vive em estado de React. Cada mudança vai para o
 * disco na hora. Escrever a cada toque parece exagero até a primeira vez que o
 * sistema mata o processo.
 *
 * O rascunho é apagado num único momento: quando a coleta entra na fila de
 * sincronização. Daí em diante quem responde por ela é a fila, que já sabe
 * não perder nem duplicar.
 */

export type RespostaChecklist = Record<string, boolean>;

export type Rascunho = {
  ocorrenciaId: string;
  protocolo: string;
  /** Gerada na abertura da vistoria e reusada em toda tentativa de envio. */
  idempotencyKey: string;
  checklist: RespostaChecklist;
  fotos: FotoLocal[];
  gpsPrecisaoMetros: number | null;
  coordenada: { lat: number; lng: number } | null;
  assinanteNome: string;
  /** Caminho local do traço da assinatura, ainda no aparelho. */
  assinaturaUri: string | null;
  observacoes: string;
  /** Quando a coleta começou. É a data que vale no laudo, não a do envio. */
  coletadaEm: string;
  atualizadoEm: string;
};

/**
 * Grava por completo, sempre.
 *
 * Sem `UPDATE` parcial e sem apagar antes de inserir. `INSERT ... ON CONFLICT`
 * numa transação só significa que, se o processo morrer no meio, o que estava
 * lá antes continua íntegro. Apagar e inserir tem uma janela em que não existe
 * rascunho nenhum, e é exatamente nessa janela que o sistema escolhe matar o
 * aplicativo.
 */
export async function salvarRascunho(rascunho: Rascunho): Promise<void> {
  const db = await bancoLocal();
  const atualizado: Rascunho = { ...rascunho, atualizadoEm: new Date().toISOString() };
  await db.runAsync(
    `INSERT INTO rascunhos (ocorrencia_id, conteudo, atualizado_em)
     VALUES (?, ?, ?)
     ON CONFLICT (ocorrencia_id)
     DO UPDATE SET conteudo = excluded.conteudo, atualizado_em = excluded.atualizado_em`,
    [atualizado.ocorrenciaId, JSON.stringify(atualizado), atualizado.atualizadoEm],
  );
}

export async function lerRascunho(ocorrenciaId: string): Promise<Rascunho | null> {
  const db = await bancoLocal();
  const linha = await db.getFirstAsync<{ conteudo: string }>(
    "SELECT conteudo FROM rascunhos WHERE ocorrencia_id = ?",
    [ocorrenciaId],
  );
  if (!linha) return null;
  try {
    return JSON.parse(linha.conteudo) as Rascunho;
  } catch {
    // Conteúdo ilegível é rascunho perdido, e perder um rascunho é ruim; ficar
    // com a tela quebrada toda vez que ela abre é pior.
    await descartarRascunho(ocorrenciaId);
    return null;
  }
}

export async function listarRascunhos(): Promise<Rascunho[]> {
  const db = await bancoLocal();
  const linhas = await db.getAllAsync<{ conteudo: string }>(
    "SELECT conteudo FROM rascunhos ORDER BY atualizado_em DESC",
  );
  const lidos: Rascunho[] = [];
  for (const l of linhas) {
    try { lidos.push(JSON.parse(l.conteudo) as Rascunho); } catch { /* ignora o ilegível */ }
  }
  return lidos;
}

export async function descartarRascunho(ocorrenciaId: string): Promise<void> {
  const db = await bancoLocal();
  await db.runAsync("DELETE FROM rascunhos WHERE ocorrencia_id = ?", [ocorrenciaId]);
}

/** Um rascunho novo, com a marca de tempo da coleta já fixada. */
export function rascunhoNovo(
  ocorrenciaId: string,
  protocolo: string,
  idempotencyKey: string,
): Rascunho {
  const agora = new Date().toISOString();
  return {
    ocorrenciaId,
    protocolo,
    idempotencyKey,
    checklist: {},
    fotos: [],
    gpsPrecisaoMetros: null,
    coordenada: null,
    assinanteNome: "",
    assinaturaUri: null,
    observacoes: "",
    coletadaEm: agora,
    atualizadoEm: agora,
  };
}
