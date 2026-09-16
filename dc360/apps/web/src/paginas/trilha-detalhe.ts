import {
  ROTULO_CANAL, ROTULO_DESFECHO, ROTULO_DESFECHO_DE_SAIDA, ROTULO_SEVERIDADE, ROTULO_STATUS,
  ROTULO_TIPO_COBRADE, coordenadaEmTexto,
} from "@dc360/shared";
import { formatarDataHora } from "../componentes/comuns";

/**
 * O `detalhe` de um evento da trilha, dito em português.
 *
 * O ACHADO (revisão de 15/09/2026): a linha do tempo imprimia o JSON do
 * banco com as chaves cruas, `prazoHoras: 24`, `vistoriaId: 1111…`,
 * `documento: termo_de_interdicao`. A trilha é a tela que a coordenação
 * abre para PROVAR o que aconteceu, meses depois, para quem não escreveu o
 * sistema, e o nome de uma coluna não prova nada a essa pessoa.
 *
 * Três regras, e só três:
 *
 * 1. Toda chave conhecida tem rótulo. Chave desconhecida sai como veio, em
 *    vez de sumir: um nome feio é melhor que esconder o que foi gravado, e o
 *    portão de teste aponta a chave para ganhar rótulo.
 * 2. Todo valor de lista fechada (tipo, severidade, situação, canal,
 *    documento, desfecho) passa pelo dicionário compartilhado que a tela já
 *    usa em todo lugar, e nunca por um segundo dicionário daqui.
 * 3. Identificador não é informação para quem lê: `vistoriaId`, chave de
 *    envio e resumo criptográfico ficam de fora. O que eles apontam já está
 *    na própria página (a vistoria, a foto, o ofício).
 *
 * A devolução de tarefa tem leitura própria em `../devolucao`, com o motivo
 * por extenso, e não passa por aqui.
 */

export type ParDoDetalhe = { rotulo: string; valor: string };

/** O documento emitido, como a rota `documentos` o nomeia na trilha. */
export const ROTULO_DOCUMENTO: Record<string, string> = {
  laudo: "Laudo de vistoria",
  termo_de_interdicao: "Termo de interdição",
  termo_de_desinterdicao: "Termo de desinterdição",
};

/** Rótulo de cada chave que as rotas gravam em `trilha_eventos.detalhe`. */
export const ROTULO_CHAVE_DO_DETALHE: Record<string, string> = {
  protocolo: "Protocolo",
  canal: "Canal de entrada",
  tipo: "Tipo",
  tipoAnterior: "Tipo anterior",
  tipoDescricao: "Relato do tipo",
  tipoDescricaoAnterior: "Relato que motivou a classificação",
  severidade: "Severidade",
  vulnerabilidade: "Vulnerabilidade social",
  prazoHoras: "Prazo",
  equipe: "Equipe",
  instrucoes: "Instruções",
  orgao: "Órgão",
  responsavel: "Responsável",
  desfecho: "Desfecho",
  desfechoRotulo: "Desfecho",
  respondidaPor: "Respondido por",
  motivo: "Motivo",
  providenciasSemResposta: "Providências sem resposta",
  interdicaoAtiva: "Interdição ativa no encerramento",
  interditadaEm: "Interditado em",
  anterior: "Ponto anterior",
  nova: "Ponto novo",
  statusNaCorrecao: "Situação na correção",
  statusDaOcorrencia: "Situação da ocorrência",
  statusAnterior: "Situação anterior",
  documentoJaEmitido: "Já havia documento emitido",
  documento: "Documento",
  formato: "Formato",
  numero: "Número",
  destinatario: "Destinatário",
  tentativa: "Tentativa",
  gpsPrecisaoMetros: "Precisão do GPS",
  assinante: "Assinado por",
  quantidade: "Quantidade",
  itens: "Registros perdidos",
  capturadaEm: "Hora da captura",
  coletadaPorDeclarado: "Autor declarado pelo aparelho",
  devolvidaPorDeclarado: "Autor declarado pelo aparelho",
  tamanhoBytes: "Tamanho do arquivo",
  temObservacao: "Com observação",
  retornoPrevistoEm: "Retorno previsto",
  estavaVencida: "Prazo de retorno vencido",
  prazoEm: "Prazo",
};

/**
 * Chaves que ficam de fora: identificadores e resumos que apontam para algo
 * que a página já mostra. Toda chave terminada em `Id` também fica.
 */
const ESCONDIDAS = new Set([
  "vinculadaA", "idempotencyKey", "sha256", "motivoRotulo", "papel",
]);

function escondida(chave: string): boolean {
  return ESCONDIDAS.has(chave) || /Id$/.test(chave);
}

/** Um dicionário de lista fechada, com o valor cru como reserva. */
function pelo(dicionario: Record<string, string>, valor: unknown): string {
  const chave = String(valor);
  return dicionario[chave] ?? chave;
}

function ehCoordenada(v: unknown): v is { lat: number; lng: number } {
  return typeof v === "object" && v !== null && "lat" in v && "lng" in v
    && typeof (v as { lat: unknown }).lat === "number"
    && typeof (v as { lng: unknown }).lng === "number";
}

function ehData(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v);
}

/** O valor de uma chave, na forma que a pessoa lê. `null` quando não há o que mostrar. */
export function valorDoDetalhe(chave: string, valor: unknown): string | null {
  if (valor === undefined || valor === "") return null;

  switch (chave) {
    case "tipo":
    case "tipoAnterior":
      return pelo(ROTULO_TIPO_COBRADE, valor);
    case "severidade":
      return pelo(ROTULO_SEVERIDADE, valor);
    case "canal":
      return pelo(ROTULO_CANAL, valor);
    case "documento":
      return pelo(ROTULO_DOCUMENTO, valor);
    case "statusNaCorrecao":
    case "statusDaOcorrencia":
    case "statusAnterior":
      return pelo(ROTULO_STATUS, valor);
    case "desfecho":
      return pelo({ ...ROTULO_DESFECHO_DE_SAIDA, ...ROTULO_DESFECHO }, valor);
    case "prazoHoras":
      return `${String(valor)} horas`;
    case "gpsPrecisaoMetros":
      return `${String(valor)} m`;
    case "tamanhoBytes":
      return `${Math.max(1, Math.round(Number(valor) / 1024))} KB`;
    case "formato":
      return String(valor).toUpperCase();
    case "anterior":
    case "nova":
      if (valor === null) return "sem ponto";
      return ehCoordenada(valor) ? coordenadaEmTexto(valor) : String(valor);
    default:
      break;
  }

  if (valor === null) return null;
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (ehData(valor)) return formatarDataHora(valor);
  if (Array.isArray(valor)) {
    if (valor.length === 0) return "nenhuma";
    const partes = valor.map((item) => {
      if (typeof item === "string") return item;
      if (typeof item === "object" && item !== null && ehData((item as { capturadaEm?: unknown }).capturadaEm)) {
        return formatarDataHora((item as { capturadaEm: string }).capturadaEm);
      }
      return null;
    });
    return partes.every((p) => p !== null)
      ? partes.join(", ")
      : `${valor.length}`;
  }
  if (typeof valor === "object") return null;
  return String(valor);
}

/**
 * Os pares rótulo e valor de um detalhe, na ordem em que foram gravados.
 * Chave escondida, valor vazio e objeto sem leitura não entram; quando
 * `desfechoRotulo` existe, ele fala por `desfecho`.
 */
export function paresDoDetalhe(detalhe: Record<string, unknown>): ParDoDetalhe[] {
  const pares: ParDoDetalhe[] = [];
  const temRotuloDeDesfecho = typeof detalhe["desfechoRotulo"] === "string";
  for (const [chave, bruto] of Object.entries(detalhe)) {
    if (escondida(chave)) continue;
    if (chave === "desfecho" && temRotuloDeDesfecho) continue;
    const valor = valorDoDetalhe(chave, bruto);
    if (valor === null) continue;
    pares.push({ rotulo: ROTULO_CHAVE_DO_DETALHE[chave] ?? chave, valor });
  }
  return pares;
}

/** Chaves do detalhe que sairiam cruas na tela: o portão de teste as lista. */
export function chavesSemRotulo(detalhe: Record<string, unknown>): string[] {
  return Object.keys(detalhe).filter((c) => !escondida(c) && !(c in ROTULO_CHAVE_DO_DETALHE));
}
