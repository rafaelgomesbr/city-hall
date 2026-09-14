import {
  cascata, fonte, fonteMinimaDeInteracao, linha, peso, rastreio, type Peso,
} from "./tokens";

/**
 * A RÉGUA DA HIERARQUIA.
 *
 * Ela é para a identidade 2.0 o que `regua.ts` é para a densidade, e nasceu da
 * mesma frase de quem paga, um mês depois:
 *
 * > "refaz a identidade do app de agente inteiro (...) o app não está bonito
 * > (...) tá com cara de projeto, transforma em produto."
 *
 * O levantamento achou a causa, e ela não é falta de capricho: **quase tudo
 * neste aplicativo tem o mesmo peso tipográfico.** Um número que responde a
 * pergunta do dia ("quantas tarefas faltam") sai do mesmo tamanho do rótulo que
 * o nomeia, e o rótulo sai do mesmo tamanho do texto de apoio ao lado. Onde
 * nada é maior que nada, o olho não tem por onde começar, e a tela vira uma
 * parede de texto. Foi essa a primeira reclamação sobre este aplicativo, meses
 * atrás ("esse app tá muito só texto"), e ela sobreviveu à correção anterior
 * porque aquela rodada acrescentou ÍCONE e SELO, que são canais novos, sem
 * mexer na ESCALA, que é o canal que ordena.
 *
 * `CLAUDE.md` pede isto desde o primeiro dia, na direção visual: "hierarquia
 * forte e intencional: números grandes com rótulos discretos no painel, pesos
 * e espaçamentos definidos como tokens". Os tokens existiam. A régua que diz
 * quando usar cada um não existia, e regra que depende de cada tela lembrar
 * dela é regra que dura uma sprint.
 *
 * ## A régua, em cinco regras
 *
 * **H1. Cada peça tem UM protagonista.** Peça é o cartão, o item de lista, a
 * seção e a tela, exatamente como na régua de densidade. Protagonista é o
 * degrau `numero`: o valor que responde sozinho à pergunta daquela peça. Dois
 * números grandes lado a lado é a mesma aritmética da R1 da densidade, com
 * outra tinta: quando tudo é grande, nada é grande, e o olho volta a começar
 * pelo canto superior esquerdo, que é onde raramente está o que importa. O
 * portão de design conta isso na árvore de elementos, e não no texto solto.
 *
 * **H2. O rótulo é do número, e ele é discreto.** O par "número mais rótulo" é
 * uma peça só (`Dado`, em `componentes.tsx`), e não dois textos que cada tela
 * arruma do seu jeito. O rótulo é menor, discreto, em maiúsculas com rastreio,
 * e cola no número: a menor distância da peça é entre os dois, porque distância
 * é o que diz o que pertence a quê. Deixar isso para o ponto de uso é como
 * nascem cinco cartões com cinco distâncias.
 *
 * **H3. A hierarquia começa por ESCALA e ESPAÇO. Peso é o segundo canal, cor é
 * o último.** Cor é o canal mais caro deste produto, e o mais disputado: ela já
 * carrega severidade da ocorrência, estado do envio e gravidade de aviso, e a
 * régua de densidade existe porque ela estourou. Escala e espaço estão livres,
 * funcionam sob sol forte, funcionam para quem não separa vermelho de âmbar e
 * não competem com nada. Medida e não opinada: entre o protagonista e o apoio
 * há pelo menos o DOBRO de tamanho, e o portão refaz essa conta.
 *
 * **H4. O cartão é objeto, e objeto tem profundidade.** Toda superfície de peça
 * sai INTEIRA de `elevacao(tema)`, nunca de um fundo mais uma borda escritos à
 * mão. A razão está no próprio token: no tema escuro quem carrega a elevação é
 * a superfície clareando, e a sombra é reforço; no claro é o contrário. Meia
 * elevação entrega o cartão achatado num tema e sem separação no outro, e foi
 * exatamente assim que a folha do diálogo terminou, no escuro, com a mesma
 * superfície de um cartão comum.
 *
 * **H5. O movimento tem ritmo, e o ritmo é um só.** A lista entra em cascata,
 * com o passo e o teto de `cascata`, via `atrasoEmCascata()`. Não é enfeite: é
 * direção de leitura, e é o que faz a lista parecer que se monta em vez de
 * piscar pronta. Ela vale para o COMEÇO da lista e nunca para o fim (ver o
 * teto), e nada disso roda quando o aparelho pede redução de movimento.
 *
 * ## O que esta régua não é
 *
 * Não é "aumente a fonte". Metade do trabalho dela é o contrário: quase todo
 * texto de uma tela é apoio, e apoio que encolhe e apaga é o que faz o
 * protagonista aparecer sem ninguém aumentar coisa nenhuma.
 *
 * E ela não afrouxa a régua de densidade em nada. As duas se somam: a densidade
 * limita quanto PESO DE COR uma peça gasta, e esta limita quanto PESO DE ESCALA.
 */

/**
 * Os cinco papéis que um texto exerce numa peça.
 *
 * Cinco e não quinze, pela razão que já governa `movimento` e `peso` neste
 * produto: escala com muitos degraus vira escolha por gosto a cada componente,
 * e o resultado é uma tela onde nada tem o mesmo ritmo de nada. O nome é o
 * PAPEL e nunca o tamanho, porque quem escreve a tela sabe o que aquele texto
 * está fazendo ali e não deve precisar decidir se isso são dezoito pontos.
 *
 * - `numero`: o protagonista da peça. O valor que responde sozinho à pergunta.
 * - `rotulo`: o que nomeia o número, e só ele. Pequeno, discreto, maiúsculo.
 * - `titulo`: o que a peça é. Um por peça, acima do conteúdo.
 * - `interacao`: o texto que se TOCA, ou que nomeia o que se toca. Rótulo de
 *   controle, pílula, selo. É o degrau que tem piso, e o piso é
 *   `fonteMinimaDeInteracao`.
 * - `apoio`: o resto. Texto que explica, unidade, legenda, data. Ele pode ser
 *   `legenda` (12) justamente porque ninguém o toca, e essa fronteira é a
 *   dívida 9.3 fechada como dado em vez de disciplina.
 */
export type NivelDeHierarquia = "numero" | "rotulo" | "titulo" | "interacao" | "apoio";

export type DegrauDeHierarquia = {
  fonte: number;
  linha: number;
  peso: Peso;
  /** Ausente quando o papel não pede correção ótica: ver `rastreio` em `tokens.ts`. */
  rastreio?: number;
  /** Usa `textoDiscreto` em vez de `texto`, e a cor continua saindo do tema. */
  discreto: boolean;
  /** Desenhado em caixa alta, que é o que separa rótulo de frase curta. */
  maiuscula: boolean;
};

/**
 * O degrau de cada papel, num lugar só.
 *
 * Um objeto e não um `switch` dentro do `Txt`, pelo mesmo motivo que fez
 * `pesoEfetivo` sair de dentro do `Chip`: a segunda cópia da regra não recebe o
 * caso novo, e as duas discordam em silêncio. Aqui a diferença é ainda maior,
 * porque o portão de design LÊ esta tabela para refazer a conta da H3. Regra em
 * `switch` não se mede; tabela se mede.
 */
const DEGRAUS: Record<NivelDeHierarquia, DegrauDeHierarquia> = {
  numero: {
    fonte: fonte.display,
    linha: linha.display,
    peso: peso.negrito,
    rastreio: rastreio.numeroGrande,
    discreto: false,
    maiuscula: false,
  },
  rotulo: {
    fonte: fonte.legenda,
    linha: linha.legenda,
    peso: peso.forte,
    rastreio: rastreio.rotuloDiscreto,
    discreto: true,
    maiuscula: true,
  },
  titulo: {
    fonte: fonte.h3,
    linha: linha.h3,
    peso: peso.negrito,
    discreto: false,
    maiuscula: false,
  },
  interacao: {
    /*
      O piso, e é aqui que ele vira dado. `fonteMinimaDeInteracao` governa este
      degrau e só ele; `apoio`, logo abaixo, desce a 12 de propósito e com a
      razão escrita no token.
    */
    fonte: fonteMinimaDeInteracao,
    linha: linha.corpoP,
    peso: peso.forte,
    discreto: false,
    maiuscula: false,
  },
  apoio: {
    fonte: fonte.legenda,
    linha: linha.legenda,
    peso: peso.normal,
    discreto: true,
    maiuscula: false,
  },
};

export function degrau(nivel: NivelDeHierarquia): DegrauDeHierarquia {
  return DEGRAUS[nivel];
}

/**
 * O papel que é o protagonista da peça, escrito como dado.
 *
 * É a H1 na forma que o portão consegue ler. Uma constante e não um literal
 * repetido no portão, porque o dia em que o nome do papel mudar, a contagem
 * precisa mudar junto em vez de passar a contar zero em silêncio, que é a forma
 * exata de um portão morrer sem ninguém notar.
 */
export const PAPEL_PROTAGONISTA: NivelDeHierarquia = "numero";

/**
 * Quantas vezes o protagonista é maior que o apoio.
 *
 * A H3 escrita como número, para o portão poder refazer a conta em vez de
 * confiar no parágrafo. Dois, e não "bem maior": abaixo do dobro a diferença
 * existe no arquivo e desaparece no aparelho, com o sol na tela e o telefone a
 * meio metro do rosto, que é a condição de leitura deste produto.
 */
export const SALTO_MINIMO_DE_ESCALA = 2;

/**
 * O atraso de entrada de um item de lista, pelo lugar dele na lista.
 *
 * Uma função pura, e não um valor, porque o teto é metade da decisão: sem ele a
 * cascata deixa de ser direção de leitura e vira espera. O agente que abre a
 * fila depois de descer o morro está procurando UMA resposta (o trabalho subiu
 * ou não), e uma lista que se monta durante um segundo inteiro responde essa
 * pergunta devagar por motivo de decoração.
 *
 * Índice negativo devolve zero em vez de estourar: quem desenha lista erra o
 * índice em algum momento, e uma tela que não aparece é um defeito muito pior
 * que um item entrando fora do ritmo.
 */
export function atrasoEmCascata(indice: number): number {
  if (!Number.isFinite(indice) || indice <= 0) return 0;
  return Math.min(indice, cascata.teto) * cascata.passo;
}
