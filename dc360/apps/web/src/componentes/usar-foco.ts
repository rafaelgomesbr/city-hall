import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * O foco que acontece DEPOIS de o React ter desenhado o resultado, e não um
 * quadro de animação depois de a tela ter pedido.
 *
 * O defeito (V2-F00-E09, correção 5, rodada 6, achado 1): depois de enviar a
 * senha errada, o foco ficava em `<body>` no Firefox. As telas faziam
 * `depoisDePintar(() => focarPrimeiroInvalido(...))` DENTRO do `catch` de um
 * `await`, e ali não existe "evento discreto": o React 18 agrupa os `setState`
 * e renderiza numa tarefa própria do agendador. O `requestAnimationFrame`
 * pedido na mesma linha pode rodar ANTES dessa renderização (no Chromium
 * acontecia de rodar depois, e a correção 4 só foi provada ali). Com o DOM
 * velho, `[aria-invalid="true"]` não existe ainda, nada recebe o foco, e o
 * botão que o tinha estava desabilitado: sobra o `<body>`.
 *
 * O consertar é trocar "daqui a um quadro" por "depois do commit": quem pede
 * só incrementa um contador junto dos outros `setState` (o mesmo lote), e o
 * efeito de layout roda quando esse lote já está no DOM, nos três motores.
 * `useLayoutEffect` e não `useEffect` porque o primeiro roda antes de o
 * navegador pintar: a pessoa nunca vê o quadro intermediário sem foco.
 *
 * A função recebida é lida na hora de rodar (referência), então enxerga o
 * formulário atual e não o de quando o pedido foi feito.
 */
export function useFocoDepoisDeRenderizar(acao: () => void): () => void {
  const [pedidos, setPedidos] = useState(0);
  const acaoAtual = useRef(acao);
  acaoAtual.current = acao;

  useLayoutEffect(() => {
    if (pedidos > 0) acaoAtual.current();
  }, [pedidos]);

  return useCallback(() => setPedidos((n) => n + 1), []);
}
