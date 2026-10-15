---
validador: acessibilidade (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
Escopo de acessibilidade da E05: as três frases de sessão na tela de entrada ("Sua sessão expirou", "Sua sessão foi encerrada", "Sua conta foi desativada"), que aparecem quando o painel derruba a sessão. A DoD da etapa não traz critério de acessibilidade próprio além da frase de cada motivo; a régua aplicada é a WCAG 2.2 AA, alvo da V2 (`docs/roadmap-v2/15-seguranca-acessibilidade.md`), nos critérios que tocam a tela. Nenhum arquivo da E05 mudou em `4b96ea7..52952a1`; o componente compartilhado `Aviso` (`componentes/comuns.tsx`) mudou nesta rodada (prop `foco`), e por isso a regressão dele na entrada foi medida.

## Critérios verificados

1. As três frases aparecem e são expostas com papel na árvore de acessibilidade do Chromium (CDP `Accessibility.getPartialAXTree`): "expirou" e "encerrada" com papel `status` (`live: polite`), "desativada" com papel `alert` (`live: assertive`). Regressão do `Aviso` depois da prop `foco`: sem `foco` ele continua região viva, como antes. `$SP/val/acessibilidade/e05.log`.
2. Título da aba (2.4.2): nos três casos, ao cair na entrada, o título vira "Entrar · Defesa Civil 360". `e05.log`.
3. Contraste (1.4.3 e 1.4.11), calculado com as cores computadas dos tokens reais, nos dois temas: alerta claro `#92400E` sobre `#FEF3C7` 6,37:1, escuro 8,98:1; perigo claro `#C92A2A` sobre `#FDEBEB` 4,75:1, escuro 6,59:1; o ícone usa a cor do texto (mesma razão, acima de 3:1). `e05.log`.
4. Estado nunca só por cor (1.4.1): cada aviso tem ícone e frase com o motivo por extenso. Capturas `a11y-E05-entrada-{expirou,encerrada,desativada}-320-claro.png` e as do validador de UX `E05-entrada-*-{1280,390,320}-{claro,escuro}.png`.
5. Reflow (1.4.10): a 320 px nenhuma das três telas rola na lateral (`scrollWidth` 320 de 320). `e05.log`.
6. Teclado: o primeiro Tab depois de cair na entrada vai ao campo de email e o formulário segue entrando pelo teclado (Tab, digitar, Enter), como na E13. `e05.log`, `e13.log`.
7. Defeito de acessibilidade das rodadas 1 e 2 (achado "corrige antes de crescer", dono F10-E11): AINDA MORDE, sem mudança. Ao cair na entrada o foco fica em `BODY` nos três casos, e as regiões `status` e `alert` nascem já com o texto (o observador de mutação registra `tipo: nasceu`, nenhuma `mudou`). A região `alert` costuma ser anunciada ao nascer; a `status` nascida com o texto não tem anúncio garantido (4.1.3). Não é critério da E05 e não reprova.

## Evidência

- Painel construído do SHA (fora do repositório) com `VITE_API_URL=http://127.0.0.1:3881`, API com PGlite semeado nas portas 3881 e 4881 (`$SP/val/acessibilidade/subir.sh`), Chromium do Playwright 1.62.1.
- `node $SP/val/acessibilidade/e05.mjs`: código 0, saída `e05.log` (19 OK e 5 FALHA, as 5 são as conferências do achado F10-E11 descrito no item 7, escritas para falhar enquanto ele existir). Resultados detalhados em `$SP/val/acessibilidade/resultados.json`.
- Conta fictícia criada pela API para não mexer nas da semente ("Otávio Reis Barbosa"); as três quedas foram produzidas de verdade: token corrompido (expirou), `POST /usuarios/:id/encerrar-sessoes` (encerrada) e `PATCH /usuarios/:id/situacao` mais token de acesso vencido, com a renovação recusada em 403 (desativada).
- Capturas: `docs/evidencias-v2/G00/validacao/52952a1/navegador/capturas/a11y-E05-entrada-expirou-320-claro.png`, `a11y-E05-entrada-encerrada-320-claro.png`, `a11y-E05-entrada-desativada-320-claro.png`; e as do UX citadas no item 4.

## Cenários positivos

As três quedas levam à entrada com a frase certa, papel certo na árvore, título certo, contraste AA nos dois temas e sem rolagem lateral a 320 px; o formulário segue operável só pelo teclado.

## Cenários negativos

- Sair por vontade própria não mostra frase de sessão (conferido pelo UX nesta rodada, `E05-entrada-depois-de-sair-390-claro.png`).
- Conta desativada tentando entrar recebe a recusa genérica (UX e QA desta rodada); não há aviso de conta desativada para quem não tem token.

## Tentativas de reprovar

- Procurei regressão do `Aviso` depois da prop `foco` (risco novo desta rodada): o aviso sem `foco` continua `role="status"`/`"alert"`, sem `tabindex`. Não morde.
- Medi o contraste no tema escuro, onde o fundo do aviso é translúcido (12 por cento sobre o fundo da página): composto o fundo, a pior razão é 6,59:1. Não morde.
- Procurei rolagem lateral e texto cortado a 320 px com a frase mais longa ("encerrada", sete linhas): não há.
- Procurei o defeito F10-E11 (foco em `BODY`, região nascida com texto): continua; registrado no item 7 e em Achados, sem mudança desde a rodada 1.

## Achados

1. corrige antes de crescer (dono F10-E11, "região anunciante única" e foco no título; mesmo achado das rodadas 1 e 2): ao cair na entrada por sessão morta o foco fica em `BODY` e os avisos "expirou" e "encerrada" são `role="status"` inseridos já com o texto; anúncio por leitor de tela não garantido. Reprodução: `e05.mjs`, conferências "foco fora de BODY" e "região viva existia ANTES do texto".
2. anotado: o campo de email não aponta para o aviso (`aria-describedby` nulo); quem chega ao campo pelo Tab não ouve o motivo da queda se o anúncio da região falhar. Mesma família do achado 1.

## Não verificado

- Leitor de tela real (NVDA, VoiceOver): o anúncio das frases não foi ouvido; a prova é de árvore e de papel.
- Firefox (não instalado nesta máquina); WebKit só na E13 (entrada por teclado).
- Zoom de 400 por cento.

## Risco residual

Quem usa leitor de tela pode cair na entrada sem ouvir "sessão expirou" ou "sessão encerrada" (a de conta desativada, `alert`, tende a ser anunciada) e só descobrir o motivo lendo a página. A informação está na tela e no topo do conteúdo.

## Motivo do humano

Leitor de tela real ouvindo as três frases ao cair na entrada (CP-32; o agente não substitui leitor de tela). Portão visual por risco disparado (tela pública, texto de produto e fluxo de erro crítico de sessão, seção 10 de `28`): Rafael confere as capturas `E05-entrada-*` (pendência já registrada).
