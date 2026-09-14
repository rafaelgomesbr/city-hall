/**
 * A RÉGUA DO PESO VISUAL.
 *
 * Ela nasceu de uma frase de quem paga, olhando a lista de tarefas no iPhone:
 * "essa tela tá extremamente poluída com textos coloridos pra todo lado".
 *
 * A causa não foi descuido, e é isso que torna uma régua necessária. Cinco
 * frentes refizeram cinco telas em paralelo, cada uma obedecendo à regra da
 * casa ("nunca comunicar estado só por cor") do jeito mais direto: acrescentar
 * um bloco com fundo próprio, ícone e palavra. Cada decisão está certa
 * sozinha. Num cartão só da lista elas se empilharam em quatro: prazo vencido
 * em vermelho, tarja âmbar de vulnerabilidade, pílula verde de coleta e tarja
 * verde de confirmação de envio. Três delas com fundo cheio, uma embaixo da
 * outra.
 *
 * O erro de leitura que produziu isso é tratar "segundo canal" e "fundo cheio"
 * como a mesma coisa. Não são: o segundo canal é o ÍCONE e a PALAVRA, e ele
 * continua obrigatório em tudo aqui. O fundo cheio é PESO, e peso é um
 * recurso escasso: quando tudo pesa, nada pesa.
 *
 * ## A régua, em cinco regras
 *
 * **R1. Um bloco preenchido por peça.** Peça é o cartão, o item de lista, a
 * seção e a tela. Bloco preenchido é o que pinta um fundo de cor semântica
 * (`okFundo`, `alertaFundo`, `perigoFundo`, `sev*Fundo`). O portão que mede
 * isso é `scripts/portao-densidade-do-aplicativo.test.mjs`, e ele varre a
 * árvore de elementos, não o texto solto: sem aninhamento não existe "dentro
 * da mesma peça".
 *
 * BOTÃO fica de fora da conta, e a fronteira é deliberada: o vermelho de
 * "Descartar" não diz em que estado o registro está, diz o que acontece se o
 * dedo encostar ali. Superfície neutra (`superficie2`) também fica de fora:
 * ela é superfície do tema, não recado. O que a régua conta é COR QUE FALA.
 *
 * **R2. Quando há disputa, ganha o mais alto desta ordem, e o resto desce para
 * peso leve:** perigo (algo deu errado agora), severidade da ocorrência (a
 * gravidade do fato), alerta (uma condição que muda o que fazer). Esta é a
 * única regra que a máquina não mede: ela é a decisão de quem escreve a tela,
 * e o portão só cobra o resultado.
 *
 * **R3. Verde não preenche, nunca.** Confirmação é o caso normal deste
 * produto: quase tudo dá certo. Preenchida, ela acende a tela inteira e rouba
 * o destaque de quem precisa dele. Na tela de equipe eram até dez pílulas
 * verdes cheias, uma por vistoria concluída, dizendo um fato do passado com o
 * mesmo peso de uma coleta bloqueada. Esta regra mora no COMPONENTE e não na
 * tela (ver `pesoEfetivo`), porque regra que depende de cada ponto de uso
 * lembrar dela é regra que dura uma sprint.
 *
 * **R4. Peso leve mantém os dois canais.** Sem fundo, mas com ícone e palavra,
 * na cor do tom. O contraste do texto leve sobre o cartão e sobre o fundo da
 * tela é medido, nos dois temas, em `scripts/portao-acessibilidade-do-aplicativo.test.mjs`.
 *
 * **R5. Severidade crítica não alevia.** Não é privilégio, é aritmética: o
 * texto dela é branco nos dois temas (`sevCriticaTexto`), e branco fora do
 * vermelho mede 1.00:1 sobre o cartão claro, ou seja, some. Uma pílula crítica
 * em peso leve seria uma pílula invisível justamente na ocorrência mais grave
 * do produto. O portão de densidade PROVA esse número em vez de confiar neste
 * parágrafo.
 *
 * ## O que a régua não é
 *
 * Não é "tire a cor". A resposta quase nunca é tirar: é hierarquia. Numa
 * tarefa vencida com vulnerabilidade social, uma das duas é mais urgente que a
 * outra, e o defeito era as duas gritarem no mesmo volume.
 */

/** Os tons de estado que o `Chip` e o `Aviso` compartilham. */
export type TomComPeso =
  | "neutro" | "info" | "ok" | "sucesso" | "alerta" | "perigo"
  | "sevBaixa" | "sevMedia" | "sevAlta" | "sevCritica";

/**
 * Quanto peso a peça tem direito a ocupar.
 *
 * `forte` pinta fundo. `leve` não pinta nada e carrega o tom no ícone, na
 * palavra e (no aviso) num filete lateral.
 */
export type PesoVisual = "forte" | "leve";

/**
 * Os tons que NUNCA pintam fundo, mesmo quando quem chama pede `forte`.
 *
 * É a R3 escrita como dado, e não como disciplina. `ok` é o tom do `Chip`,
 * `sucesso` é o do `Aviso`: os dois nomes existem porque as duas peças
 * nasceram separadas, e unificar o vocabulário agora renomearia 25 chamadas
 * por uma ganho nenhum.
 */
export const TONS_QUE_NUNCA_PREENCHEM: readonly TomComPeso[] = ["ok", "sucesso"];

/**
 * Os tons que NUNCA aleviam, mesmo quando quem chama pede `leve`.
 *
 * É a R5, e o motivo é medido e não opinado: `sevCriticaTexto` é branco nos
 * dois temas. Tirar o fundo vermelho de baixo dele deixa 1.00:1 sobre o cartão
 * claro. O portão de densidade recalcula esse número a cada execução e reprova
 * se alguém tirar `sevCritica` desta lista.
 */
export const TONS_QUE_NUNCA_ALEVIAM: readonly TomComPeso[] = ["sevCritica"];

/**
 * O peso que a peça REALMENTE desenha, depois das duas regras acima.
 *
 * Um lugar só, e não um ternário dentro do `Chip` mais outro dentro do
 * `Aviso`. Duas cópias da mesma regra é a forma exata do defeito que este
 * aplicativo já pagou mais de uma vez (ver o `switch` de estados da fila, em
 * `(agente)/fila.tsx`): a segunda cópia não recebe o caso novo, e as duas
 * discordam em silêncio.
 */
export function pesoEfetivo(tom: TomComPeso, pedido: PesoVisual): PesoVisual {
  if (TONS_QUE_NUNCA_PREENCHEM.includes(tom)) return "leve";
  if (TONS_QUE_NUNCA_ALEVIAM.includes(tom)) return "forte";
  return pedido;
}

/* ========================================================================
   Medir a régua no que foi DESENHADO
   ======================================================================== */

/** Só o que esta medida precisa saber de um tema, para não depender do tipo inteiro. */
type PaletaMedida = {
  fundo: string; superficie: string; superficie2: string;
  okFundo: string; alertaFundo: string; perigoFundo: string;
  sevBaixaFundo: string; sevMediaFundo: string; sevAltaFundo: string; sevCriticaFundo: string;
};

/**
 * As cores que, pintadas como fundo, fazem um bloco PREENCHIDO.
 *
 * As três superfícies do tema são descontadas da lista, e isso não é detalhe:
 * no tema claro `sevBaixaFundo` e `superficie2` são literalmente a mesma cor
 * (`tinta.t100`). Sem o desconto, toda caixa cinza do aplicativo seria contada
 * como pílula de severidade baixa, e a medida ficaria alta e inútil. Com o
 * desconto, ela erra para MENOS naquele caso, que é o lado seguro: quem mede
 * densidade prefere deixar passar um bloco a inventar quinze.
 */
export function fundosSemanticos(tema: PaletaMedida): Set<string> {
  const superficies = new Set([tema.fundo, tema.superficie, tema.superficie2]);
  return new Set(
    [
      tema.okFundo, tema.alertaFundo, tema.perigoFundo,
      tema.sevBaixaFundo, tema.sevMediaFundo, tema.sevAltaFundo, tema.sevCriticaFundo,
    ].filter((cor) => !superficies.has(cor)),
  );
}

/** Um nó da árvore que o `render` de teste devolve. */
type NoDesenhado = {
  props?: { style?: unknown; accessibilityRole?: unknown };
  children?: unknown;
} | null;

/**
 * Conta os blocos preenchidos de uma árvore JÁ DESENHADA.
 *
 * O portão em `scripts/portao-densidade-do-aplicativo.test.mjs` faz a mesma
 * contagem lendo a FONTE, e as duas precisam existir: ler a fonte pega o que
 * está escrito em todas as telas de uma vez, mas não sabe o que o React Native
 * desenha quando o estilo depende do tema, de uma condição ou de `pesoEfetivo`.
 * Esta aqui sabe, porque olha o pixel decidido, e só enxerga a tela que o teste
 * montou.
 *
 * Ela mora aqui, junto da régua, e não copiada dentro de cada arquivo de teste,
 * porque a lista do que conta como preenchimento é a MESMA decisão que o resto
 * deste arquivo toma. Duas listas para um fato só é o defeito que a própria
 * régua cita como motivo de existir.
 *
 * `achatar` entra por parâmetro (é o `StyleSheet.flatten`) para este arquivo
 * continuar sem depender do React Native: a régua é uma decisão de produto, e
 * não uma peça de interface.
 */
export function contarPreenchidos(
  raiz: unknown,
  tema: PaletaMedida,
  achatar: (estilo: unknown) => { backgroundColor?: unknown } | undefined,
): string[] {
  const semanticos = fundosSemanticos(tema);
  const achados: string[] = [];

  const visitar = (no: unknown): void => {
    if (Array.isArray(no)) { no.forEach(visitar); return; }
    if (!no || typeof no !== "object") return;
    const atual = no as NonNullable<NoDesenhado>;
    /*
      BOTÃO NÃO CONTA, e isso não é um furo na régua: é a fronteira dela.

      O fundo vermelho de "Descartar" não está dizendo em que estado o registro
      está, está dizendo o que acontece se o dedo encostar ali. São dois canais
      diferentes com a mesma tinta, e um botão perde a affordance dele se for
      obrigado a competir por uma cota de peso com os selos ao redor. Quem
      limita botão destrutivo é outra regra (ele pergunta duas vezes antes de
      apagar), e ela já existe.

      O portão que lê a fonte chega ao mesmo lugar por outro caminho: o fundo
      do `Botao` é decidido dentro de `ui/componentes.tsx`, e nenhuma tela
      escreve `backgroundColor` ao chamar um botão. As duas contagens precisam
      concordar, senão uma delas vira ruído que ninguém olha.
    */
    if (atual.props?.accessibilityRole !== "button") {
      const fundo = achatar(atual.props?.style)?.backgroundColor;
      if (typeof fundo === "string" && semanticos.has(fundo)) achados.push(fundo);
    }
    visitar(atual.children);
  };

  visitar(raiz);
  return achados;
}
