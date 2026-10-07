import type { Rascunho } from "./rascunho";

/**
 * O QUE O DIÁLOGO "SAIR DA CONTA?" DIZ, contado a partir do que está no disco
 * no instante do toque.
 *
 * A saída explícita chama `apagarDadosLocais` (`banco-local.ts`), e isso leva
 * a vistoria COMEÇADA e ainda não concluída: o rascunho, as fotos e a
 * assinatura dela, porque nenhum item da fila aponta para esses arquivos
 * ainda. Até a V2-F00-E15 o diálogo só contava a fila, e o agente com meia hora
 * de barranco gravada lia "você vai precisar de sinal e da sua senha" e perdia
 * tudo. A regra de apagar fica como está (aparelho compartilhado entre turnos:
 * quem entra depois não vê o dado de quem saiu; preservar o rascunho é decisão
 * do CP-24, em F14-E02). O que muda é que a pergunta diz, na cara, o que vai
 * embora.
 *
 * A fila é o oposto: ela NÃO é apagada na saída, e a frase dela continua
 * prometendo que as coletas ficam guardadas, porque ficam.
 *
 * Mora fora da tela para ser conferida por inteiro sem desenhar o Perfil, e
 * porque tudo dentro de `src/app` vira rota no Expo.
 */

/**
 * O que a saída apagaria, lido de `listarRascunhos` na hora do toque.
 * `null` quando o disco não respondeu: aí a frase não pode prometer que não
 * há nada, e avisa do mesmo jeito.
 */
export type RascunhosNaSaida = {
  vistorias: number;
  /** Alguma delas tem foto tirada. */
  comFotos: boolean;
  /** Alguma delas tem a assinatura colhida. */
  comAssinatura: boolean;
} | null;

/** Resume os rascunhos no que a frase precisa dizer, sem guardar dado de ninguém. */
export function contarRascunhos(
  rascunhos: ReadonlyArray<Pick<Rascunho, "fotos" | "assinaturaUri">>,
): Exclude<RascunhosNaSaida, null> {
  return {
    vistorias: rascunhos.length,
    comFotos: rascunhos.some((r) => (r.fotos?.length ?? 0) > 0),
    comAssinatura: rascunhos.some((r) => Boolean(r.assinaturaUri)),
  };
}

/** A frase curta de sempre, para quem não tem nada a perder ao sair. */
export const SAIDA_SEM_NADA_A_PERDER =
  "Você vai precisar de sinal e da sua senha para entrar de novo.";

function fraseDosRascunhos(rascunhos: RascunhosNaSaida): string | null {
  if (rascunhos === null) {
    return "Não deu para conferir se há vistoria começada neste aparelho. Sair " +
      "apaga toda vistoria que ainda não foi concluída, com as fotos e a " +
      "assinatura dela. Se você começou alguma, conclua antes de sair.";
  }
  const n = rascunhos.vistorias;
  if (n === 0) return null;
  const uma = n === 1;
  const anexos = rascunhos.comFotos && rascunhos.comAssinatura
    ? ", com fotos e assinatura"
    : rascunhos.comFotos
      ? ", com fotos"
      : rascunhos.comAssinatura
        ? ", com assinatura"
        : "";
  const oQueVaiJunto = rascunhos.comFotos || rascunhos.comAssinatura
    ? (uma ? "tudo o que já foi preenchido nela, inclusive" : "tudo o que já foi preenchido nelas, inclusive") +
      (rascunhos.comFotos && rascunhos.comAssinatura
        ? " as fotos e a assinatura"
        : rascunhos.comFotos ? " as fotos" : " a assinatura")
    : (uma ? "tudo o que já foi preenchido nela" : "tudo o que já foi preenchido nelas");
  return uma
    ? `Você tem 1 vistoria começada neste aparelho${anexos}, que ainda não foi ` +
      `concluída. Sair apaga essa vistoria e ${oQueVaiJunto}, sem volta. Para ` +
      "não perder, conclua antes de sair."
    : `Você tem ${n} vistorias começadas neste aparelho${anexos}, que ainda não ` +
      `foram concluídas. Sair apaga essas vistorias e ${oQueVaiJunto}, sem ` +
      "volta. Para não perder, conclua antes de sair.";
}

/*
  A promessa da fila, e ela precisa ser exata: as coletas continuam no
  aparelho, e só voltam a subir com a SUA conta, porque o laudo e a trilha
  registram como autor quem apresenta o token.
*/
function fraseDaFila(naFila: number): string | null {
  if (naFila <= 0) return null;
  const uma = naFila === 1;
  return uma
    ? "Você tem 1 coleta ainda não enviada. Ao sair, ela continua guardada no " +
      "aparelho e ninguém mais consegue enviá-la: o laudo sai com o nome de quem " +
      "fez a vistoria, que é você. Ela volta a subir quando você entrar de novo, " +
      "com sinal."
    : `Você tem ${naFila} coletas ainda não enviadas. Ao sair, elas continuam ` +
      "guardadas no aparelho e ninguém mais consegue enviá-las: o laudo sai com " +
      "o nome de quem fez a vistoria, que é você. Elas voltam a subir quando " +
      "você entrar de novo, com sinal.";
}

/**
 * O texto do diálogo. O que se APAGA vem primeiro, porque é o que não tem
 * volta; o que fica guardado vem depois. Sem rascunho e sem fila, volta à
 * frase curta, que não fala em apagar.
 */
export function avisoDaSaida(naFila: number | null, rascunhos: RascunhosNaSaida): string {
  const partes = [fraseDosRascunhos(rascunhos), fraseDaFila(naFila ?? 0)]
    .filter((p): p is string => p !== null);
  return partes.length === 0 ? SAIDA_SEM_NADA_A_PERDER : partes.join("\n\n");
}
