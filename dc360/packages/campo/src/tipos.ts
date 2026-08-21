import type { EnvelopeSincronizacao } from "@dc360/shared";

/**
 * Fila de saída do aplicativo de campo.
 *
 * O agente coleta a vistoria no morro, sem sinal. O aparelho guarda, e o envio
 * acontece quando a rede volta, muitas vezes já dentro do carro, com a conexão
 * indo e vindo. Tudo neste pacote existe para que esse trecho não perca nem
 * duplique nada, porque um laudo perdido é uma vistoria que precisa ser
 * refeita e um laudo duplicado é problema jurídico numa interdição.
 */

export type EstadoItem =
  /** Esperando a vez, ou esperando o tempo de espera entre tentativas. */
  | "pendente"
  /** Saiu daqui e ainda não se sabe o desfecho. O estado mais delicado. */
  | "enviando"
  /** O servidor confirmou. Fica um tempo visível e depois sai da fila. */
  | "confirmado"
  /** O servidor recusou por um motivo que repetir não resolve. */
  | "bloqueado";

/**
 * Uma foto tirada em campo, ainda no aparelho.
 *
 * O arquivo mora no sistema de arquivos do celular; aqui guardamos só a
 * referência e o metadado. Copiar os bytes para dentro da fila dobraria o uso
 * de armazenamento num aparelho que já costuma estar cheio.
 */
export type FotoLocal = {
  /** Gerada na captura. É o que impede autorizar a mesma foto duas vezes. */
  idempotencyKey: string;
  /** Caminho no aparelho, resolvido pela porta `Arquivos`. */
  uriLocal: string;
  nomeArquivo: string;
  tipoConteudo: string;
  tamanhoBytes: number;
  capturadaEm: string;
  legenda?: string;
  coordenada?: { lat: number; lng: number };
  ordem: number;
};

export type FotoNaFila = FotoLocal & {
  /** Devolvida pelo servidor na autorização. O cliente nunca a escolhe. */
  chave: string | null;
  evidenciaId: string | null;
  enviada: boolean;
};

/** De onde saem os bytes da foto. No aparelho, `expo-file-system`. */
export type Arquivos = {
  ler(uriLocal: string): Promise<Uint8Array>;
};

export type ItemFila = {
  /**
   * A chave de idempotência, gerada no aparelho no momento da coleta. É
   * também o identificador do item na fila, e não muda entre tentativas: é
   * exatamente isso que permite ao servidor reconhecer o reenvio.
   */
  id: string;
  ocorrenciaId: string;
  protocolo: string;
  envelope: EnvelopeSincronizacao;
  estado: EstadoItem;
  /** Quantas vezes já saiu daqui, com ou sem resposta. */
  tentativas: number;
  criadoEm: string;
  /** Antes deste instante, o item não é tentado de novo. */
  liberadoEm: string;
  ultimoErro: string | null;
  confirmadoEm: string | null;
  /**
   * Fotos que precisam subir ANTES do envelope. Vazio quando a coleta não tem
   * foto, ou quando quem enfileirou já resolveu o envio por fora.
   */
  fotos: FotoNaFila[];
};

/**
 * Onde a fila persiste.
 *
 * É uma porta, e não um SQLite direto, porque a fila precisa sobreviver ao
 * aplicativo ser fechado, ao aparelho reiniciar e à bateria acabar, e cada
 * plataforma resolve isso de um jeito. No aparelho é `expo-sqlite`; nos
 * testes é um mapa em memória. A lógica de sincronização não muda.
 */
export type Deposito = {
  listar(): Promise<ItemFila[]>;
  salvar(item: ItemFila): Promise<void>;
  remover(id: string): Promise<void>;
};

/** Resposta do servidor a um envio aceito. */
export type Recibo = { vistoriaId: string; duplicada: boolean };

export type AutorizacaoFoto = {
  evidenciaId: string;
  chave: string;
  url: string;
  cabecalhos: Record<string, string>;
  /** O servidor já tinha esse arquivo: não precisa mandar os bytes de novo. */
  jaEnviada: boolean;
};

/**
 * O que leva o envelope até o servidor.
 *
 * A classificação do erro é responsabilidade de quem implementa: só o
 * transporte sabe distinguir "a rede caiu" de "o servidor recusou".
 */
export type Transporte = {
  enviar(envelope: EnvelopeSincronizacao): Promise<Recibo>;
  /** Pede ao servidor a chave e a URL de escrita. */
  autorizarFoto(pedido: {
    ocorrenciaId: string;
    foto: FotoLocal;
  }): Promise<AutorizacaoFoto>;
  /** Manda os bytes direto ao armazenamento, sem passar pela API. */
  enviarBytes(
    url: string,
    cabecalhos: Record<string, string>,
    corpo: Uint8Array,
  ): Promise<void>;
  /** Avisa o servidor, que então confere com o armazenamento se chegou. */
  confirmarFoto(evidenciaId: string): Promise<void>;
};

/**
 * Falha que vale a pena repetir: rede caiu, servidor fora do ar, tempo
 * esgotado. O item volta para a fila e tenta de novo mais tarde.
 */
export class FalhaTemporaria extends Error {
  constructor(mensagem: string, readonly causa?: unknown) {
    super(mensagem);
    this.name = "FalhaTemporaria";
  }
}

/**
 * Falha que repetir não resolve: dado inválido, ocorrência já encerrada,
 * permissão negada. Insistir só gastaria bateria e encheria o log do servidor.
 * O item é bloqueado e fica visível para a pessoa decidir o que fazer.
 */
export class FalhaPermanente extends Error {
  constructor(mensagem: string, readonly codigo: string) {
    super(mensagem);
    this.name = "FalhaPermanente";
  }
}

export type ResumoFila = {
  pendentes: number;
  enviando: number;
  confirmados: number;
  bloqueados: number;
  /** Verdadeiro enquanto um dreno está em andamento. */
  sincronizando: boolean;
};

export type ResultadoDreno = {
  fotosEnviadas: number;
  enviados: number;
  duplicados: number;
  adiados: number;
  bloqueados: number;
  /** O dreno parou no meio porque perdeu o sinal ou foi cancelado. */
  interrompido: boolean;
};
