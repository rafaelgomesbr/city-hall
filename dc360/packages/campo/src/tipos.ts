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
  | "bloqueado"
  /**
   * A coleta perdeu o destino: a ocorrência foi encerrada no painel enquanto
   * ela estava na fila.
   *
   * Estado separado de `bloqueado` por uma razão de produto. Antes, o servidor
   * respondia 409 `ja_encerrada`, o item virava `bloqueado` e ficava lá PARA
   * SEMPRE: os únicos caminhos de saída eram `limparConfirmados`, que só toca
   * em confirmados, e `descartar`, manual. Ou seja, o único jeito de o agente
   * limpar a tela era apagar o próprio trabalho, e o crachá do menu ficava
   * gritando um número que ninguém conseguia zerar.
   *
   * Arquivado sai do dreno e sai da contagem de "precisa de atenção", mas a
   * coleta continua no aparelho, numa seção própria, porque ela é a prova de um
   * ato administrativo que aconteceu de verdade e a ocorrência pode ter sido
   * encerrada por engano.
   */
  | "arquivado";

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

/**
 * Papel do arquivo dentro da coleta.
 *
 * A assinatura sobe pelo mesmo caminho das fotos, com a mesma idempotência e
 * a mesma retomada, mas o envelope a referencia noutro campo. Sem esta marca,
 * a assinatura da moradora entraria no laudo como "Foto 5" do registro
 * fotográfico, e o campo de assinatura ficaria vazio.
 */
export type PapelDoArquivo = "foto" | "assinatura";

export type FotoNaFila = FotoLocal & {
  papel: PapelDoArquivo;
  /** Devolvida pelo servidor na autorização. O cliente nunca a escolhe. */
  chave: string | null;
  evidenciaId: string | null;
  enviada: boolean;
};

/** De onde saem os bytes da foto. No aparelho, `expo-file-system`. */
export type Arquivos = {
  ler(uriLocal: string): Promise<Uint8Array>;
};

/** O que sobrou de uma tentativa que falhou, guardado no disco do aparelho. */
export type FalhaRegistrada = {
  codigo: string;
  mensagem: string;
  campos: ReadonlyArray<{ campo: string; mensagem: string }>;
  /** Falha que repetir nao resolve. Determina se o item ainda sai da fila. */
  permanente: boolean;
  em: string;
};

/**
 * Quem coletou. Fica gravado no item da fila, junto com a coleta.
 *
 * O aparelho de plantão é compartilhado entre turnos, e o envelope NÃO carrega
 * autor nenhum: o servidor tira o `agente_id` de quem apresentou o token. Sem
 * esta marca, a coleta que o agente da manhã fez no morro, com a minuta lida em
 * voz alta com o nome dele e a assinatura da moradora por cima, subia às 19:00
 * com a credencial do agente da noite. O laudo e a trilha passavam a atribuir a
 * vistoria a um servidor que nunca esteve no local, contra a própria minuta, e
 * a trilha é append-only: o autor errado nunca é corrigido, só comentado por um
 * evento novo.
 *
 * `organizacaoId` entra junto com o usuário, e não é redundância: o mesmo
 * aparelho passa de município em município, e a mesma pessoa pode ter conta em
 * dois. O que precisa bater é o par.
 *
 * `nome` é o único campo que existe para a tela: sem ele, o item de outro turno
 * aparece na fila como uma coleta anônima que ninguém sabe de quem cobrar.
 */
export type AutorDaColeta = {
  usuarioId: string;
  nome: string;
  organizacaoId: string;
};

export type ItemFila = {
  /**
   * A chave de idempotência, gerada no aparelho no momento da coleta. É
   * também o identificador do item na fila, e não muda entre tentativas: é
   * exatamente isso que permite ao servidor reconhecer o reenvio.
   */
  id: string;
  /**
   * Quem coletou, carimbado no momento de enfileirar a partir da sessão que
   * estava aberta.
   *
   * `null` significa "não dá para saber": item gravado por uma versão do
   * aplicativo anterior a este campo. Item sem autor não sobe sozinho, porque
   * subir com a credencial de quem estiver logado é exatamente o defeito que
   * este campo existe para impedir; ele espera alguém assumir a autoria com o
   * dedo, em `assumir`.
   */
  autor: AutorDaColeta | null;
  ocorrenciaId: string;
  protocolo: string;
  envelope: EnvelopeSincronizacao;
  estado: EstadoItem;
  /** Quantas vezes já saiu daqui, com ou sem resposta. */
  tentativas: number;
  criadoEm: string;
  /** Antes deste instante, o item não é tentado de novo. */
  liberadoEm: string;
  /**
   * A ultima falha, inteira.
   *
   * Era `ultimoErro: string | null`, e a troca e deliberada em vez de um campo
   * a mais: dois campos para o mesmo fato divergem na primeira pressa. O
   * `codigo` importa porque e ele que separa "a ocorrencia foi encerrada"
   * (nada a fazer, arquiva) de "os dados estao errados" (o agente pode
   * corrigir), e ele era descartado junto com os campos.
   */
  ultimaFalha: FalhaRegistrada | null;
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
  /**
   * Os campos que o servidor recusou, quando ele diz quais.
   *
   * Posicional e com valor padrao para os chamadores antigos continuarem
   * compilando. Existe porque o 422 do servidor SEMPRE trouxe esta lista
   * (`servidor.ts` monta `{ erro, mensagem, campos }`) e o transporte lia so
   * `mensagem` e `erro`, jogando o resto fora. O agente que perdia uma manha de
   * coleta no morro lia "Alguns campos precisam ser corrigidos" e nao tinha
   * como agir.
   */
  constructor(
    mensagem: string,
    readonly codigo: string,
    readonly campos: ReadonlyArray<{ campo: string; mensagem: string }> = [],
  ) {
    super(mensagem);
    this.name = "FalhaPermanente";
  }
}

export type ResumoFila = {
  pendentes: number;
  enviando: number;
  confirmados: number;
  bloqueados: number;
  /** Coletas que perderam o destino. Fora da contagem de "precisa de atenção". */
  arquivados: number;
  /**
   * Coletas que NÃO sobem com a sessão que está aberta agora: são de outro
   * agente, ou não têm autor registrado.
   *
   * Conta separado de `pendentes` porque as duas frases da tela são opostas.
   * "Esperando envio" promete que sai sozinha assim que houver sinal, e isso
   * seria mentira aqui: enquanto o autor não entrar neste aparelho, ela não
   * sai. Somar as duas produziria a faixa verde "Tudo sincronizado" com uma
   * vistoria parada no aparelho, que é a pior frase que este produto pode
   * exibir.
   */
  deOutroAutor: number;
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
