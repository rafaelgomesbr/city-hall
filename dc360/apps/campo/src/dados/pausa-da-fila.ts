import type { MotivoDeSessao } from "@dc360/campo";

/**
 * O que a tela diz quando a FILA está parada pela sessão (V2-F00-E06).
 *
 * São três pausas e três atos diferentes, e por isso três frases que não se
 * misturam:
 *
 * | Motivo | O que resolve | O que NÃO resolve |
 * | --- | --- | --- |
 * | `sessao_encerrada` | entrar de novo | esperar |
 * | `conta_desativada` | a coordenação reativar a conta | entrar de novo |
 * | `troca_de_senha_obrigatoria` | a própria pessoa definir a senha no painel | entrar de novo com a provisória |
 *
 * A terceira entrou na correção 1 da E06. O aplicativo não tem tela de troca de
 * senha (quem entrou com a senha provisória define a sua no painel, no
 * computador), então a frase diz onde fazer e o que fazer depois, e não traz
 * botão: nenhum ato dentro do aparelho resolve.
 *
 * Mora fora das telas porque três superfícies dizem a mesma coisa em três
 * tamanhos: a faixa do topo (uma linha), o aviso no alto da fila (um parágrafo)
 * e o cartão de cada coleta guardada (uma frase). Escritas em três arquivos,
 * elas divergiriam, e a divergência aqui é a pessoa lendo "entre de novo" numa
 * tela e "procure a coordenação" na outra, sobre a mesma conta.
 *
 * Toda frase carrega a mesma promessa, porque é ela que a pessoa procura antes
 * de qualquer instrução: a coleta feita no morro continua guardada. É verdade e
 * está provada em `packages/campo/test/pausa-de-sessao.test.ts`: a fila mantém
 * o item `pendente`, sem contar tentativa e sem bloquear.
 */
export type FrasesDaPausa = {
  /** A faixa do topo: título e uma linha, as duas cabem sem cortar. */
  faixaTitulo: string;
  faixaDetalhe: string;
  /** O aviso no alto da lista da fila. */
  titulo: string;
  detalhe: string;
  /** O cartão de cada coleta guardada: o que acontece COM ELA. */
  doCartao: string;
};

const FRASES: Record<MotivoDeSessao, FrasesDaPausa> = {
  sessao_encerrada: {
    faixaTitulo: "Sessão encerrada",
    faixaDetalhe: "Entre de novo: suas coletas continuam guardadas",
    titulo: "Sua sessão terminou e o envio está parado",
    detalhe:
      "Suas coletas continuam guardadas neste aparelho e nada foi apagado. "
      + "Entre de novo com o seu email e a sua senha: com o aplicativo aberto, "
      + "elas sobem depois que você entrar.",
    doCartao: "Guardada neste aparelho. Sobe depois que você entrar de novo.",
  },
  conta_desativada: {
    faixaTitulo: "Conta desativada",
    faixaDetalhe: "Suas coletas continuam guardadas neste aparelho, procure a coordenação",
    titulo: "Sua conta foi desativada e o envio está parado",
    detalhe:
      "Suas coletas continuam guardadas neste aparelho, procure a coordenação do "
      + "seu município. Entrar de novo não resolve enquanto a conta estiver "
      + "desativada. Se ela for reativada, as coletas sobem depois que você entrar.",
    doCartao:
      "Guardada neste aparelho. Só sobe depois que a coordenação reativar a sua "
      + "conta e você entrar.",
  },
  troca_de_senha_obrigatoria: {
    faixaTitulo: "Defina a sua senha",
    faixaDetalhe: "Suas coletas continuam guardadas neste aparelho",
    titulo: "Você entrou com uma senha provisória e o envio está parado",
    detalhe:
      "Suas coletas continuam guardadas neste aparelho e nada foi apagado. "
      + "Defina a sua senha no painel, no computador (a tela de entrada pede isso), "
      + "e depois entre aqui de novo: com o aplicativo aberto, elas sobem depois que você entrar.",
    doCartao:
      "Guardada neste aparelho. Só sobe depois que você definir a sua senha no "
      + "painel e entrar de novo.",
  },
};

export function frasesDaPausa(motivo: MotivoDeSessao): FrasesDaPausa {
  return FRASES[motivo];
}

/**
 * Quanto o laço de fundo espera entre uma tentativa e outra enquanto a fila
 * está parada pela sessão.
 *
 * Mais que o piso normal (15 s) porque cada tentativa é uma requisição que o
 * servidor já respondeu "não", e porque a pessoa que resolve (entrando de novo)
 * reinicia o laço na hora: o layout das abas é desmontado e montado de novo
 * com a sessão. Um minuto é o mesmo piso que `token.ts` usa entre renovações,
 * e mantém a pausa que se resolve sozinha (um 401 falso por sinal ruim na
 * renovação) a um minuto de distância, em vez de esperar o aplicativo reabrir.
 */
export const ESPERA_COM_A_FILA_PAUSADA_MS = 60_000;
