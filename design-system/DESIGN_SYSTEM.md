# Design System DC360 v0.1

Fonte única de verdade visual do projeto. O protótipo consome `tokens.css` diretamente (sem build). O produto real consumirá `_tokens.scss` (React web) e, futuramente, uma exportação TypeScript dos mesmos valores para o React Native. Os três derivam desta especificação: mudou aqui, muda em todo lugar.

Todos os pares de cor de texto listados abaixo foram verificados numericamente contra o WCAG 2.1 AA (mínimo 4.5:1 para texto normal, 3.0:1 para elementos gráficos). As razões de contraste estão anotadas.

## Princípios

1. **O laranja é identidade, nunca severidade.** O laranja institucional da Defesa Civil (cor dos coletes e uniformes) é a cor da marca e das interações: botões, links, foco, o momento de sincronização. Severidade e alerta usam escalas próprias (cinza-azulado, âmbar, vermelho). Isso elimina a ambiguidade "esse laranja é botão ou é perigo?".
2. **Cor nunca comunica sozinha.** Todo estado tem ícone mais texto além da cor.
3. **Tokens ou nada.** Nenhum componente usa cor, sombra, raio ou duração fora dos tokens. Valor hardcoded em componente é bug.
4. **Um único conjunto de primitivas, dois temas semânticos.** As primitivas (escalas de cor) são fixas; os temas claro e escuro apenas remapeiam os tokens semânticos.

## Cores primitivas

### Laranja (marca)
| Token | Hex | Uso principal |
| --- | --- | --- |
| orange-300 | #FFC078 | Realces sutis no tema escuro |
| orange-400 | #FFA94D | Texto de destaque no tema escuro (8.84:1 sobre surface escura) |
| orange-500 | #F76707 | Fundo do botão primário no tema escuro (com texto ink-950, 6.03:1) |
| orange-600 | #E8590C | Cor de marca em elementos gráficos grandes (3.58:1 com branco: nunca texto pequeno) |
| orange-700 | #C2410C | Links e botão primário no tema claro (5.18:1 com branco) |
| orange-800 | #9A3412 | Hover do botão primário no tema claro |

### Neutros (grafite-ardósia)
| Token | Hex | Uso |
| --- | --- | --- |
| ink-950 | #101519 | Fundo do tema escuro; texto sobre laranja no escuro |
| ink-900 | #14191D | Texto principal do tema claro |
| ink-850 | #171E24 | Superfície 1 do tema escuro |
| ink-800 | #1E262D | Superfície 2 do tema escuro |
| ink-700 | #2A343C | Bordas do tema escuro |
| ink-500 | #5A6B76 | Texto secundário do tema claro (5.53:1 sobre branco) |
| ink-400 | #9BAAB5 | Texto secundário do tema escuro (7.06:1 sobre surface) |
| ink-200 | #DDE3E7 | Bordas do tema claro |
| ink-100 | #E9EDF1 | Superfície 2 do tema claro |
| ink-50 | #F5F7F8 | Fundo do tema claro |
| white | #FFFFFF | Superfície 1 do tema claro |
| ice | #ECF1F4 | Texto principal do tema escuro (14.79:1 sobre surface) |

## Severidade (prioridade da ocorrência)

Regra: baixa é neutra, média é âmbar, alta é vermelho, crítica é vermelho profundo em selo sólido com ponto pulsante. O laranja da marca não aparece nesta escala.

| Nível | Tema claro (texto sobre fundo) | Contraste | Tema escuro (texto sobre surface-2) | Contraste |
| --- | --- | --- | --- | --- |
| Baixa | #4A5763 sobre #E9EDF1 | 6.30:1 | #AEB9C2 | 7.68:1 |
| Média | #92400E sobre #FEF3C7 | 6.37:1 | #FCC419 | 9.52:1 |
| Alta | #B91C1C sobre #FEE2E2 | 5.30:1 | #FF8787 | 6.62:1 |
| Crítica | #FFFFFF sobre #B91C1C (selo sólido) | 6.47:1 | #FFFFFF sobre #B91C1C | 6.47:1 |

## Status operacional

| Status | Tema claro | Contraste | Tema escuro | Contraste |
| --- | --- | --- | --- | --- |
| Informação / em campo | #1864AB sobre #E7F5FF | 5.48:1 | #74C0FC | 7.80:1 |
| Sucesso / sincronizado / concluído | #14702F sobre #E6F6EA | 5.53:1 | #69DB7C | 8.77:1 |
| Perigo / atrasado / erro | #C92A2A sobre #FDEBEB | 4.75:1 | #FF8787 | 6.62:1 |
| Neutro / rascunho | escala "baixa" acima | | | |

## Temas

- Mecânica: `:root` define o tema claro; `[data-theme="dark"]` no `<html>` sobrescreve apenas os tokens semânticos. Componentes só leem tokens semânticos (`--ds-bg`, `--ds-surface`, `--ds-text`...), nunca primitivas.
- Alternância visível no topo de todas as telas, com persistência simples.
- Padrão inicial: seguir `prefers-color-scheme` do sistema.
- Botão primário muda de estratégia por tema, por contraste: claro = fundo orange-700 com texto branco; escuro = fundo orange-500 com texto ink-950.

## Sombras e elevação

No tema escuro, sombra quase não lê: elevação é comunicada por superfície mais clara mais borda sutil, com sombra reduzida.

| Nível | Tema claro | Tema escuro |
| --- | --- | --- |
| e0 (base) | nenhuma | nenhuma |
| e1 (card) | 0 1px 2px rgba(16,21,25,.06), 0 1px 3px rgba(16,21,25,.10) | 0 1px 2px rgba(0,0,0,.45); superfície ink-850; borda ink-700 |
| e2 (dropdown, card ativo) | 0 4px 12px rgba(16,21,25,.10) | 0 4px 12px rgba(0,0,0,.50); superfície ink-800 |
| e3 (modal, folha) | 0 12px 28px rgba(16,21,25,.16) | 0 12px 28px rgba(0,0,0,.60); superfície ink-800; borda ink-700 |
| foco | anel de 2px orange-600 com offset de 2px (nunca remover outline sem substituto) | anel de 2px orange-400 com offset de 2px |

## Tipografia

Pilha do sistema (regra de zero rede do protótipo): `-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. No produto real, uma fonte de marca própria e auto-hospedada poderá substituir a display, mantendo a escala.

| Token | Tamanho/linha | Peso | Uso |
| --- | --- | --- | --- |
| display | 44/48 | 800, tracking -0.02em | Números grandes do painel |
| h1 | 32/38 | 700 | Título de página |
| h2 | 24/30 | 700 | Título de seção |
| h3 | 20/26 | 600 | Título de card |
| body-lg | 18/26 | 400 | Leitura em campo (mobile) |
| body | 16/24 | 400 | Padrão |
| body-sm | 14/20 | 400 | Secundário |
| caption | 12/16 | 600, maiúsculas, tracking +0.04em | Rótulos e selos |

## Espaçamento, raio e toque

- Escala de espaçamento (px): 4, 8, 12, 16, 24, 32, 48, 64. Nada fora da escala.
- Raio: 8 padrão, 12 em cards, 999 em pílulas e selos.
- Alvo de toque mínimo: 44x44 px (token `--ds-touch`).
- Z-index nomeado: base 0, sticky 10, dropdown 20, overlay 30, modal 40, toast 50.

## Movimento

- Durações: rápida 150 ms (hover, toque), padrão 200 ms (transição de estado), lenta 300 ms (entrada de painel, fila de sincronização).
- Easing: padrão cubic-bezier(0.2, 0, 0, 1); entrada cubic-bezier(0, 0, 0.2, 1).
- `prefers-reduced-motion: reduce` zera durações e desliga animações decorativas. Obrigatório.
- O clímax visual é a fila de sincronização offline: itens entram com 300 ms escalonados, e a conclusão usa o verde de sucesso com ícone.

## Como consumir

- Protótipo (Fase 0): `<link rel="stylesheet" href="design-system/tokens.css">` e usar apenas variáveis `--ds-*`.
- Produto real (web React): importar `_tokens.scss`, que emite as mesmas variáveis CSS e oferece mixins (`elevation()`, `focus-ring()`, `touch-target()`).
- Produto real (React Native): os valores serão exportados como módulo TypeScript no pacote shared, derivados desta especificação, quando essa fase começar.
