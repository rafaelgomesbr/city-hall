/**
 * A peça do mapa, num ponto de entrada só.
 *
 * Quatro telas vão consumir isto, e o que elas precisam saber é curto:
 *
 * ```tsx
 * const mapa = useMapaDoMunicipio(sessao.acesso);
 * <MapaDoImovel
 *   imovel={{ latitude, longitude }}
 *   agente={pontoDoGps}          // ou null enquanto o GPS não veio
 *   rotulo={endereco}
 *   mapa={mapa}
 * />
 * ```
 *
 * O resultado do gancho vai INTEIRO, e não desmontado em propriedades soltas:
 * ele já cresceu uma vez (`desistirDeEsperar` nasceu depois que o portão de
 * design cobrou a saída da espera), e a cada crescimento as quatro telas
 * teriam que ser lembradas uma a uma.
 *
 * `MapaDoImovel` já decide entre o mapa do Google e o plano esquemático, já
 * desenha a legenda de modo e já trata o Google que não responde. A tela não
 * precisa saber qual dos dois está no ar, e não deve: foi assim que a mesma
 * regra ficou escrita em quatro lugares no painel.
 *
 * `PlanoEsquematico` fica exportado à parte para a tela que quiser o desenho
 * sem a moldura e sem a legenda (por exemplo, dentro de um cartão que já tem
 * as duas coisas).
 */
export { MapaDoImovel, enquadrar } from "./MapaDoImovel";
export { ModoDoMapaDito } from "./ModoDoMapaDito";
export { PlanoEsquematico } from "./PlanoEsquematico";
export { PlanoDasTarefas } from "./PlanoDasTarefas";
export { DesenhoDaCriticidade, LegendaDeCriticidade } from "./DesenhoDaCriticidade";
export { aparenciaDaCriticidade, criticidadesNoMapa, CRITICIDADES_DA_LEGENDA } from "./criticidade";
export type { AparenciaDaCriticidade, FormaDaCriticidade } from "./criticidade";
export { caixaDosPontos, projetarNoPlano } from "./pinos";
export type { CaixaDoMapa, PinoNoMapa } from "./pinos";
export { estiloDoGoogle } from "./estilo-do-google";
export type { EstiloDoMapa } from "./estilo-do-google";
export { LADO_MAXIMO_DO_MAPA, ladoDoMapa } from "./lado";
export { useMapaDoMunicipio } from "./useMapaDoMunicipio";
export type { EstadoDoMapa } from "./useMapaDoMunicipio";
