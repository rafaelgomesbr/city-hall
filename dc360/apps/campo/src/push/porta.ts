import type { AvisoLocal } from "./aviso-local";
import type { DefinicaoDeCanal } from "./canais";
import type { EstadoDaPermissao } from "./permissao";

/**
 * Tudo o que este aplicativo precisa do sistema operacional para notificar,
 * declarado como uma porta estreita.
 *
 * Existe por uma razão que já se pagou em outras partes deste produto: o módulo
 * nativo de notificação não roda no jest, não roda no simulador sem
 * provisionamento, e não pode ser exercitado sem mandar mensagem de verdade
 * para a Apple ou para o Google. Uma regra que só é executável num aparelho com
 * certificado de produção é uma regra que ninguém prova, e regra não provada
 * neste produto é regra que quebra em campo.
 *
 * Com a porta no meio, a decisão que importa (o descarte do aviso de outro
 * município) é exercitada com um duplo de teste, e o adaptador de verdade
 * (`PortaExpo.ts`) fica reduzido a tradução: cada método dele é uma chamada ao
 * `expo-notifications` e nada mais. Onde não há decisão não há defeito escondido.
 *
 * A porta NÃO conhece município, sessão nem tela. Ela entrega o que chegou, em
 * formato bruto, e quem decide é `aviso.ts`. Se a decisão morasse aqui, ela
 * ficaria do lado do módulo nativo, que é o único lado que não dá para testar.
 */

/** Um aviso como o sistema o entregou, sem interpretação nenhuma. */
export type AvisoBruto = {
  /** O que identifica a notificação na bandeja, para poder removê-la de lá. */
  identificador: string;
  /** O dado da mensagem, cru. Ver `lerAviso` para as formas que ele assume. */
  bruto: unknown;
};

/** O que fazer com um aviso que chegou com o aplicativo aberto. */
export type Apresentacao = {
  mostrar: boolean;
  som: boolean;
};

export type PortaDePush = {
  /** `outra` cobre o navegador e qualquer coisa que não seja as duas lojas. */
  plataforma: "ios" | "android" | "outra";

  /** Pergunta ao sistema sem fazer a pergunta À PESSOA. */
  consultarPermissao(): Promise<EstadoDaPermissao>;

  /**
   * Faz a pergunta à pessoa. No iOS isto acontece uma vez por instalação, e
   * é por isso que `permissao.ts` existe.
   */
  pedirPermissao(): Promise<EstadoDaPermissao>;

  /** Abre a tela deste aplicativo nos ajustes do sistema. */
  abrirAjustes(): Promise<void>;

  /** Cria os canais do Android. Não faz nada nas outras plataformas. */
  prepararCanais(canais: readonly DefinicaoDeCanal[]): Promise<void>;

  /**
   * A ficha deste aparelho, a mesma que a Apple e o Google usam para entregar.
   *
   * Devolve nulo quando este aparelho não pode ter uma (permissão negada,
   * emulador, build sem provisionamento). Nulo NÃO é erro: é um aparelho que
   * simplesmente não recebe push, e o aplicativo inteiro continua funcionando.
   */
  obterFicha(): Promise<string | null>;

  /**
   * Decide o que acontece com o aviso que chega com o aplicativo na frente.
   *
   * É o único lugar em que o aplicativo tem voz ANTES de o aviso virar pixel.
   * Nos outros caminhos quem desenha é o sistema.
   */
  definirApresentacao(decidir: (bruto: unknown) => Apresentacao): void;

  /**
   * Mostra um aviso agora, sem passar pela Apple nem pelo Google.
   *
   * É o caminho da tarefa nova descoberta com o aplicativo aberto (ver
   * `aviso-local.ts`). O sistema desenha, toca e vibra como se o aviso tivesse
   * vindo pelo push, e o tratador de `definirApresentacao` é consultado do
   * mesmo jeito. Nunca estoura: sem permissão, o aviso simplesmente não
   * aparece, e o aplicativo continua.
   */
  avisarLocalmente(aviso: AvisoLocal): Promise<void>;

  /** A pessoa tocou numa notificação. Devolve a função que cancela a escuta. */
  aoTocar(ouvinte: (aviso: AvisoBruto) => void): () => void;

  /**
   * A notificação que abriu o aplicativo do zero, quando houve uma.
   *
   * Separado de `aoTocar` porque o toque que abre o aplicativo acontece ANTES
   * de qualquer componente montar: sem esta pergunta, o caminho mais comum de
   * todos (aparelho no bolso, aviso chega, agente toca) não abriria tarefa
   * nenhuma.
   */
  avisoQueAbriuOAplicativo(): Promise<AvisoBruto | null>;

  /** O que está na bandeja de notificações agora. */
  listarNaBandeja(): Promise<AvisoBruto[]>;

  /** Tira uma da bandeja. */
  removerDaBandeja(identificador: string): Promise<void>;
};
