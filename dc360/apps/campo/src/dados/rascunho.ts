import type { FotoLocal } from "@dc360/campo";
import type { OrgaoIndicado } from "@dc360/shared";
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
  /**
   * O desdobramento de "necessário acionar outro órgão".
   *
   * Vive no rascunho e não em estado de React, como todo o resto desta tela: o
   * agente escolhe os órgãos na porta da casa, o Android mata o aplicativo para
   * liberar memória enquanto ele atende uma ligação, e a lista precisa estar no
   * disco quando a tela voltar.
   *
   * `orgaoId` nulo é o órgão digitado à mão, e não dado faltando. Ver
   * `orgaoIndicadoSchema`: aparelho que nunca sincronizou tem catálogo vazio, e
   * o campo livre é o que impede um item OBRIGATÓRIO do checklist de travar a
   * vistoria justamente sem sinal.
   */
  orgaosParaAcionar: OrgaoIndicado[];
  fotos: FotoLocal[];
  gpsPrecisaoMetros: number | null;
  coordenada: { lat: number; lng: number } | null;
  assinanteNome: string;
  /** Caminho local do traço da assinatura, ainda no aparelho. */
  assinaturaUri: string | null;
  observacoes: string;
  /*
    Guardadas como TEXTO, e não como número.

    É o que o campo de digitação produz, e converter a cada tecla obrigaria a
    escolher o que fazer com o estado intermediário: "" e "1" são os dois
    válidos enquanto a pessoa digita, e `Number("")` é zero. Converter só no
    envio deixa o rascunho fiel ao que está na tela, inclusive depois de o
    sistema matar o aplicativo no meio da digitação.

    Campo vazio significa NÃO CONTADO. É diferente de "0", e o laudo imprime
    os dois de formas distintas.
  */
  pessoas: Record<string, string>;
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

/**
 * Traz para o formato de hoje um rascunho gravado por uma versão anterior.
 *
 * Segue o precedente de `normalizar()` em `@dc360/campo`, e pela mesma razão:
 * este é o único ponto por onde rascunho persistido volta para a tela, então a
 * migração acontece por mecanismo e não por disciplina.
 *
 * O que mudou em 09/09/2026: o item "necessário acionar outro órgão" deixou de
 * ser só sim ou não e passou a pedir QUAIS órgãos. Um agente pode ter no
 * aparelho uma vistoria começada antes disso, com fotos, GPS, assinatura e meia
 * hora de barranco dentro dela.
 *
 * `JSON.parse` não falha com formato antigo: ele devolve um objeto sem a
 * propriedade. Sem esta conversão, a tela leria `undefined` onde espera uma
 * lista, `orgaosParaAcionar.length` estouraria na renderização e o rascunho
 * inteiro ficaria inacessível, no morro, que é exatamente o desfecho que gravar
 * a cada toque existe para impedir. Por isso a conversão é explícita, e por isso
 * ela não pode ficar no `catch` de conteúdo ilegível logo abaixo: aquele caminho
 * DESCARTA o rascunho.
 *
 * A lista nasce vazia, e não com um palpite. Se o item já estava respondido
 * "sim", a conclusão passa a cobrar o desdobramento, e cobrar é o comportamento
 * certo: o agente ainda está com a tela aberta e responde num toque, enquanto
 * inventar um órgão para desbloquear seria escrever no laudo um nome que ninguém
 * disse.
 */
function normalizar(bruto: Record<string, unknown>): Rascunho {
  if (Array.isArray(bruto["orgaosParaAcionar"])) return bruto as unknown as Rascunho;
  return { ...bruto, orgaosParaAcionar: [] } as unknown as Rascunho;
}

export async function lerRascunho(ocorrenciaId: string): Promise<Rascunho | null> {
  const db = await bancoLocal();
  const linha = await db.getFirstAsync<{ conteudo: string }>(
    "SELECT conteudo FROM rascunhos WHERE ocorrencia_id = ?",
    [ocorrenciaId],
  );
  if (!linha) return null;
  try {
    return normalizar(JSON.parse(linha.conteudo) as Record<string, unknown>);
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
    try {
      lidos.push(normalizar(JSON.parse(l.conteudo) as Record<string, unknown>));
    } catch { /* ignora o ilegível */ }
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
    orgaosParaAcionar: [],
    fotos: [],
    gpsPrecisaoMetros: null,
    coordenada: null,
    assinanteNome: "",
    assinaturaUri: null,
    observacoes: "",
    pessoas: {},
    coletadaEm: agora,
    atualizadoEm: agora,
  };
}
