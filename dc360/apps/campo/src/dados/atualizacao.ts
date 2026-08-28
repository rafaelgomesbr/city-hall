/**
 * Quando vale a pena ir à rede buscar tarefa nova.
 *
 * O aplicativo só buscava na montagem da tela. Na prática isso significa que a
 * coordenação despacha uma ocorrência e o agente não fica sabendo: ele
 * continua vendo a lista que baixou antes de sair da base, até lembrar de
 * puxar a tela para baixo. Num plantão de chuva, "lembrar de puxar a tela" não
 * acontece.
 *
 * A tentação é atualizar a cada evento: ganhou foco, voltou o sinal, o
 * aplicativo voltou do segundo plano. O comentário que existia na tela avisava
 * do problema disso, e o aviso está certo: numa área de sombra o sinal pisca a
 * cada segundo, e o aplicativo passaria o dia disparando requisição e gastando
 * a bateria e o dado do agente.
 *
 * A saída é não decidir por evento, e sim por IDADE. Todo evento pergunta a
 * mesma coisa a esta função, e ela responde não enquanto a lista for recente.
 * Sinal piscando cem vezes em um minuto produz, no máximo, uma requisição.
 *
 * Fica fora do React de propósito: é a única parte disto que dá para provar
 * sem aparelho.
 */

/** Quanto tempo uma lista recém-baixada é considerada fresca. */
export const INTERVALO_PADRAO_MS = 60_000;

/**
 * Espera menor depois de uma falha, porque falhar não é ter a lista.
 *
 * Sem isto, uma tentativa que falha por sinal fraco condenaria o agente a
 * esperar o intervalo inteiro, justamente no momento em que ele mais precisa
 * que a lista chegue.
 */
export const INTERVALO_APOS_FALHA_MS = 15_000;

export type EstadoDeAtualizacao = {
  /** Quando a última tentativa começou. `null` se nunca tentou. */
  ultimaTentativa: number | null;
  /** A última tentativa trouxe lista? */
  ultimaDeuCerto: boolean;
  /** Já existe uma busca em voo. */
  emVoo: boolean;
  temSinal: boolean;
};

export function deveAtualizar(
  estado: EstadoDeAtualizacao,
  agora: number,
  intervaloMs: number = INTERVALO_PADRAO_MS,
): boolean {
  // Sem sinal não se tenta. A lista do disco continua valendo, e tentar só
  // gastaria bateria para produzir o mesmo aviso de sempre.
  if (!estado.temSinal) return false;

  // Uma busca por vez. Duas em paralelo trocariam a lista duas vezes na tela e
  // gastariam o dobro do dado do agente para o mesmo resultado.
  if (estado.emVoo) return false;

  if (estado.ultimaTentativa === null) return true;

  const espera = estado.ultimaDeuCerto ? intervaloMs : INTERVALO_APOS_FALHA_MS;
  return agora - estado.ultimaTentativa >= espera;
}

/**
 * Quanto tempo faz, em palavras que servem a quem está na rua.
 *
 * O agente precisa decidir uma coisa só olhando isto: dá para confiar nesta
 * lista, ou preciso procurar sinal antes de subir? Minuto exato não ajuda
 * nessa decisão, e "há 3 minutos" ajuda.
 */
export function idadeEmPalavras(baixadaEm: Date | null, agora: Date): string {
  if (!baixadaEm) return "ainda não baixada";
  const segundos = Math.max(0, Math.floor((agora.getTime() - baixadaEm.getTime()) / 1000));
  if (segundos < 90) return "agora há pouco";
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return horas === 1 ? "há 1 hora" : `há ${horas} horas`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "ontem" : `há ${dias} dias`;
}

/**
 * A lista está velha o bastante para o agente ser avisado?
 *
 * Meia hora é o limite escolhido, e o motivo é operacional: é mais ou menos o
 * tempo entre a base e o alto de um morro. Passou disso e o agente ainda não
 * atualizou, a chance de existir despacho novo que ele não viu deixa de ser
 * desprezível.
 */
export const LIMITE_DE_ALERTA_MS = 30 * 60_000;

export function listaEnvelheceu(baixadaEm: Date | null, agora: Date): boolean {
  if (!baixadaEm) return true;
  return agora.getTime() - baixadaEm.getTime() >= LIMITE_DE_ALERTA_MS;
}
