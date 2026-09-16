/**
 * Para onde o foco vai depois de uma ação, decidido fora do React.
 *
 * O ACHADO (revisão de 15/09/2026): cinco ações do painel deixavam o foco no
 * `<body>`. "Corrigir a coordenada" trocava o botão por um formulário e o
 * botão que tinha o foco sumia; "Descobrir o ponto" sumia enquanto abria e
 * voltava como outro elemento; "Emitir ofício" removia o próprio botão da
 * lista; "Marcar como lido" no sino trocava o botão por "Lido", e como o
 * Escape do sino é ouvido no envoltório, com o foco no `body` o Escape
 * deixava de fechar o painel. E a submissão recusada de três formulários
 * deixava o foco no botão de enviar, com o erro dois campos acima.
 *
 * Para quem enxerga e usa o mouse, nada disso aparece. Para quem navega por
 * teclado, foco no `body` é começar a página do zero; para quem usa leitor de
 * tela, é silêncio. A regra da casa é a mesma do `Modal`: o comportamento
 * mora em função que diz PARA ONDE, e o componente só chama.
 *
 * Nada aqui toca o DOM de verdade: recebe o que sabe achar e focar, e é assim
 * que o teste prova a decisão sem navegador. O que só o navegador prova (que
 * `focus()` de fato move o cursor e que o leitor de tela anuncia) está dito
 * no teste, em voz alta.
 */

/** O mínimo que um nó precisa saber fazer para receber o foco. */
export type NoFocavel = { focus(): void };

/** O mínimo que uma raiz precisa saber fazer: achar o primeiro nó de um seletor. */
export type RaizDeBusca = { querySelector(seletor: string): NoFocavel | null };

/** O campo que a tela marcou como inválido, do jeito que `Campo` marca. */
export const SELETOR_INVALIDO = '[aria-invalid="true"]';

/**
 * O primeiro controle editável de um formulário que acabou de abrir.
 * `hidden` e `disabled` ficam de fora porque não recebem foco.
 */
export const SELETOR_PRIMEIRO_CAMPO =
  'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])';

/**
 * Depois de uma submissão recusada: o foco vai para o primeiro campo
 * inválido, que é onde a correção acontece. Devolve se achou algum.
 */
export function focarPrimeiroInvalido(raiz: RaizDeBusca | null | undefined): boolean {
  return focar(raiz, SELETOR_INVALIDO);
}

/**
 * Quando um formulário aparece no lugar do botão que o abriu: o foco vai para
 * o primeiro campo dele, em vez de cair no `<body>` junto com o botão que
 * deixou de existir.
 */
export function focarPrimeiroCampo(raiz: RaizDeBusca | null | undefined): boolean {
  return focar(raiz, SELETOR_PRIMEIRO_CAMPO);
}

function focar(raiz: RaizDeBusca | null | undefined, seletor: string): boolean {
  const alvo = raiz?.querySelector(seletor) ?? null;
  if (!alvo) return false;
  alvo.focus();
  return true;
}

/**
 * Quem recebe o foco quando itens de uma lista deixam de ter ação.
 *
 * A ordem é a da lista: o primeiro item ainda pendente DEPOIS do último que
 * foi resolvido, senão o primeiro pendente antes dele, senão `null` (e quem
 * chama leva o foco a um reserva fixo, como o botão de fechar). Ir para o
 * próximo, e não para o primeiro da lista, é o que faz "Marcar como lido"
 * seguido de Enter percorrer a lista de cima para baixo sem voltar ao topo.
 */
export function proximoPendente<T>(
  itens: ReadonlyArray<{ id: T; pendente: boolean }>,
  resolvidos: ReadonlyArray<T>,
): T | null {
  const marcados = new Set(resolvidos);
  const posicoes = itens
    .map((item, i) => (marcados.has(item.id) ? i : -1))
    .filter((i) => i >= 0);
  const ultima = posicoes.length > 0 ? Math.max(...posicoes) : -1;
  const pendentes = itens.filter((item) => item.pendente && !marcados.has(item.id));
  const depois = itens.slice(ultima + 1).find((item) => item.pendente && !marcados.has(item.id));
  return (depois ?? pendentes[0])?.id ?? null;
}

/**
 * Roda depois que o React pintou o resultado.
 *
 * As ações daqui mudam o estado e, no mesmo evento, precisam focar um nó que
 * só existe depois da renderização. Num evento discreto o React 18 renderiza
 * de forma síncrona antes de o navegador pintar, então o quadro seguinte já
 * vê o DOM novo. Fora do navegador (teste), roda na hora.
 */
export function depoisDePintar(acao: () => void): void {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(acao);
  } else {
    acao();
  }
}
