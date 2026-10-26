---
validador: acessibilidade
modelo: claude-sonnet-5-5
etapa: V2-F00-E05
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
Escopo de acessibilidade da E05: as três frases da tela de entrada quando a sessão acaba (`Entrar.tsx`, `Aviso`: expirou, encerrada, desativada), o erro de entrada e o diálogo "Desativar usuário". Régua: WCAG 2.2 AA, ordem teclado, contraste, rótulo, semântica, ARIA. Nada herdado da rodada 1. Tudo rodou no SHA 4b96ea7 (produto igual ao de HEAD 24aed19), com API real (porta 3891, PGlite semeado) e painel construído do SHA (porta 4891), Chromium do Playwright. `axe` ausente: `@axe-core/playwright` e `axe-core` não existem em `node_modules` (conferido com `find`), nada foi instalado; a auditoria própria de DOM (`a11y/lib.mjs`, função `auditoriaNaPagina`) cobre contraste calculado com composição de transparência, alvo, nome acessível, rótulo, id duplicado, cabeçalhos, landmarks, e declara o que não cobre.

Pasta de trabalho: `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/a11y/` (citada abaixo como `a11y/`).

## Critérios verificados

1. Portão estático do painel (E1): `npx vitest run --root apps/web test/acessibilidade.test.ts` depois de `npm run build:shared`: 21 de 21 (`a11y/vitest-a11y-base.txt`). Os 21 incluem os pares de contraste calculados dos tokens nos dois temas (aviso informativo, de sucesso e de perigo, texto, link, botão) e o foco sem `outline: none` sozinho.
2. As três frases anunciáveis e distintas (3.3.1, 4.1.3, 1.4.1), no DOM real depois de provocar cada motivo (`a11y/a3.log`, `a11y/a2.log`):
   - expirou: `role="status"`, classe `aviso--alerta`, ícone `svg` mais texto "Sua sessão expirou...".
   - desativada: `role="alert"`, `aviso--perigo`, ícone mais texto "Sua conta foi desativada. Entrar de novo não resolve...". Provocada de ponta a ponta: a coordenadora desativa Diego pelo diálogo, Diego grava, cai em `/entrar` com a frase (`a2.log`, bloco "E05 conta desativada").
   - encerrada: mesmo componente e mesma classe de `expirou` (a sonda por interceptação de rota caiu em `expirou`, porque o 401 que decide o motivo vem da chamada de dados; a frase "encerrada" em si foi vista pelo outro agente de navegador em T2, capturas `web/capturas/E05-entrada-sessao-encerrada-*`). Contraste dela é o de `expirou` (mesmo token).
3. Contraste medido em `getComputedStyle` do aviso (texto sobre fundo composto, ícone sobre fundo), `a11y/a3.log`:

| Aviso | Tema | Texto e ícone sobre o fundo |
| --- | --- | --- |
| expirou, encerrada | claro | 6,37:1 |
| expirou, encerrada | escuro | 8,98:1 |
| desativada | claro | 4,75:1 |
| desativada | escuro | 6,59:1 |

   Todos acima de 4,5:1. A margem menor é a do perigo claro (4,75). Igual à rodada 1, sem regressão.
4. Auditoria de DOM da entrada com cada aviso, claro e escuro, 1280, 390 e 320 px (36 combinações, `a3.log`): zero texto abaixo de AA, zero rolagem horizontal da página, zero controle sem nome, zero campo sem rótulo, `lang="pt-BR"`, título "Entrar", um `h1`. A única linha vermelha do auditor, "DC" em `.entrada__sigla` (e o avatar de iniciais nas telas internas), é falso positivo: o fundo é `linear-gradient` e o auditor não compõe gradiente. Conferido à mão: branco sobre `#5B21B6` no claro e `#101519` sobre `#A78BFA` no escuro, acima de 6:1; a sigla é decorativa (`aria-hidden`).
5. Teclado e foco no diálogo "Desativar usuário" (`a2.log`): `role="dialog"` com nome, `aria-modal="true"`, o resto da página (`#root`) com `aria-hidden` e `inert`, foco inicial em "Cancelar", 20 passos de Tab e Shift+Tab sem sair da janela. Esc fecha e o foco volta ao gatilho foi provado na janela irmã de "Encerrar sessões" (mesmo componente `Modal`).
6. Foco visível (2.4.7, 1.4.11) (`a4.log`): anel de duas camadas `box-shadow`, claro `#6D28D9` (6,61:1 contra a página `#F5F7F8`), escuro `#A78BFA` (6,75:1 contra `#101519`), medido 400 ms depois de focar para vencer a transição. Em `forcedColors: active` o foco vira `outline: solid 3px`.
7. Reflow (1.4.10): 640x450 css a 2x (zoom de 200 por cento) e 320 css a 4x, `/entrar`: sem rolagem horizontal da página (`a1.log`).
8. Erro de entrada: com campos vazios `entrada-email-erro` e `entrada-senha-erro` com `role="alert"` e `aria-describedby` no campo, `aria-invalid="true"` (`a2.log`, "Entrar vazio").

## Evidência

`a11y/vitest-a11y-base.txt`, `a11y/a1.log` (auditoria de DOM em 9 telas, dois temas, três larguras, mais reflow), `a11y/a2.log` (teclado, diálogos, regiões vivas, foco), `a11y/a3.log` (avisos e contrastes), `a11y/a4.log` (foco, Alto Contraste, movimento reduzido, 1.4.12). Scripts: `a11y/lib.mjs`, `a1-auditoria.mjs`, `a2-teclado.mjs`, `a3-avisos.mjs`, `a4-foco-movimento.mjs`. Capturas: `a11y/capturas/e05-desativada-claro.png`, `e05-desativada-1280.png`, `e05-expirou-claro.png`; do outro agente `web/capturas/E05-*` (1280, 768, 390, 320, dois temas), lidas por mim para o alinhamento, nada cortado.

## Cenários positivos

Desativada de ponta a ponta chega à entrada com `role="alert"`, frase completa, ícone e texto; expirou chega com `role="status"`. O diálogo de desativar prende o foco e é inerte ao fundo. Foco com anel nos dois temas e em Alto Contraste.

## Cenários negativos

Campos vazios geram erro ligado ao campo e anunciado. Entrada com conta desativada continua com a recusa genérica (QA). Texto fraco não foi plantado nesta rodada (auditor validado na rodada 1 com `#bbb` sobre branco a 1,92:1); nesta rodada o auditor achou a `sigla` em gradiente como falso positivo, o que prova que ele enxerga a página.

## Tentativas de reprovar

- Contraste de ícone e de texto dos três avisos nos dois temas, incluindo composição de transparência: nada abaixo de AA.
- Dependência só de cor: os três têm ícone mais texto (4 passagens por tema).
- Região viva pré-montada: não existe (o aviso entra com o texto já dentro, `a2.log`: `regiao-inserida-dentro comTexto=true`), ver achado 1.
- Para onde vai o foco depois do redirecionamento por sessão morta: `BODY` (achado 1).
- Foco depois de enviar a entrada vazia: fica no botão "Entrar" e não vai ao primeiro campo inválido (achado 3).
- Procurei `main`/`nav` na entrada: zero (achado 2).
- Zoom de 200 e 400 por cento na entrada: sem rolagem horizontal.
- Mutação do portão estático: o furo do portão de exceção (comentário em linha de código) e as tags fora da lista continuam abertos, registrado em E13, não é desta etapa.

## Achados

1. corrige antes de crescer (dono F10-E11, "região anunciante única" e "foco no título"), mesmo achado da rodada 1 e sem mudança: depois do redirecionamento por sessão morta o foco fica em `BODY`; `status` e `alert` são inseridos já com o texto, junto com a página. A anunciação de região inserida com conteúdo não é garantida em leitor de tela (4.1.3). Sem leitor de tela não declaro falha.
2. anotado, pré-existente: a tela de entrada não tem landmark `main`. A tela é curta, 2.4.1 se cumpre por outro meio, mas é a única tela de erro de sessão sem `main` (landmarks 0 em `a1.log`). O mesmo vale para `/recuperar-senha` e `/redefinir-senha` (E10).
3. anotado, pré-existente: depois de enviar a entrada vazia o foco permanece em "Entrar" em vez de ir ao primeiro campo inválido (`a2.log`, "Entrar vazio"), diferente de Usuários e da recuperação (E10), onde vai ao campo.

Nenhum item bloqueia a etapa.

## Não verificado

- Leitor de tela real (NVDA, JAWS, VoiceOver, TalkBack): nenhum. O anúncio das frases e a ordem de leitura não foram ouvidos.
- A frase "encerrada" foi vista na tela por outro agente e coberta pela mesma classe de componente, mas não repeti a sonda com a classe própria nesta rodada.
- Firefox e WebKit nas minhas sondas (o outro agente repetiu T2 e T3 nos três motores sem diferença).
- App de campo (a frase do aparelho para `conta_desativada`) está fora desta dimensão nesta etapa.

## Risco residual

Anúncio por leitor de tela das frases de sessão encerrada ou expirada não provado; foco em `BODY` depois do redirecionamento.

## Motivo do humano

Só uma pessoa com NVDA ou VoiceOver confirma que a frase é ouvida ao cair na entrada e que o foco em `BODY` não desorienta (CP-32). Pendente, não bloqueia.
