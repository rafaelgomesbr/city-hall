---
validador: acessibilidade (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E09
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
Escopo de acessibilidade da E09 (DoD, linha "Acessibilidade"): confirmação anunciada, foco devolvido ao botão, ícone mais texto, nas telas Minha conta (sessões) e Usuários (redefinir senha, encerrar sessões, senha temporária). A rodada 2 reprovou acessibilidade por dois motivos: o foco caía em `BODY` depois de encerrar as outras sessões (2.4.3) e o botão "Encerrar minhas outras sessões" passava da coluna a 320 px. Régua: WCAG 2.2 AA, alvo da V2 (`docs/roadmap-v2/15-seguranca-acessibilidade.md`). Diff desta rodada lido: `MinhaConta.tsx` (foco por `Aviso foco`), `comuns.tsx` (prop `foco`), `app.css` (`.botao--quebra`).

## Critérios verificados

1. Defeito 1 da rodada 2 (foco em `BODY` depois de encerrar, 2.4.3): NÃO MORDE MAIS. Só teclado, a 320 e a 1280 px no Chromium: Tab até o botão, Enter, a janela abre com o foco em "Cancelar", Tab vai à ação, Enter confirma; o foco fica no aviso "As outras N sessões foram encerradas. Esta continua aberta." (`DIV aviso aviso--sucesso`, `tabindex=-1`, sem `role`, conectado). Também no WebKit a 320 px (`e10w.log`). `e09.log`.
2. O leitor de tela recebe o texto: o nó focado tem, na árvore do Chromium (CDP), papel `generic` e NOME acessível igual à frase inteira (fonte do nome: conteúdo). O ícone do aviso é `aria-hidden`. Não há região viva junto (um só anúncio, pelo foco). `e09.log`.
3. Foco visível (2.4.7 e 1.4.11) e não encoberto (2.4.11): o aviso focado está inteiro na janela, nenhum ponto coberto por outro elemento (`elementFromPoint`), `:focus-visible` com anel `box-shadow` de 2 px mais 2 px; cor do anel `#6D28D9` contra o cartão branco 7,10:1 (claro) e `#A78BFA` contra `#171E24` 6,19:1 (escuro). Capturas `a11y-E09-minha-conta-foco-na-confirmacao-{320,1280}-{claro,escuro}.png`.
4. Defeito 2 da rodada 2 (botão a 320 px): NÃO MORDE. A 320 px o botão mede 238 por 58 px dentro da coluna, página sem rolagem lateral (1.4.10); a 1280 px, 254 por 44 px. Papel `button` e nome "Encerrar minhas outras sessões" (4.1.2). `e09.log`.
5. Janela de confirmação (Minha conta e Usuários): papel `dialog` com nome ("Encerrar minhas outras sessões", "Redefinir senha", "Senha temporária"), foco inicial em "Cancelar" (ou "Copiar senha" na senha temporária), Tab e Shift+Tab presos dentro (ciclo medido, 8 passos sem sair), Esc fecha e o foco volta ao botão que abriu. `e09.log`.
6. Usuários: depois de "Encerrar sessões" o foco volta ao botão "Encerrar sessões" da linha; ao fechar a senha temporária, volta a "Redefinir senha". `e09.log`.
7. "Senha copiada" é anunciado por mudança numa região `status` que já existia vazia (`tipo: mudou`), o padrão certo de 4.1.3. `e09.log`.
8. Achado de rodadas anteriores (Toast nasce já com o texto, `role="status"`): continua. O Toast "Sessões de ... encerradas" nasce com o texto (`tipo: nasceu`); o anúncio não é garantido. Mitigação: o foco volta ao botão e a lista mostra o resultado. Ver Achados 3.

## Evidência

- Painel construído do SHA fora do repositório, API PGlite semeada nas portas 3881 e 4881 (`$SP/val/acessibilidade/subir.sh`), Chromium e WebKit do Playwright 1.62.1.
- `node e09.mjs` (código 0, `e09.log`: 30 OK e 5 FALHA, as 5 explicadas em Achados 1 e 2), `node e09b.mjs` (`e09b.log`), `node e09c.mjs` (`e09c.log`), `node e09d.mjs` (`e09d.log`: 1 FALHA, Achado 1), `node e10w.mjs` (`e10w.log`, WebKit). Todos em `$SP/val/acessibilidade/`; detalhes em `resultados.json`.
- Mutação que prova que o teste da etapa morde: tirar `foco={confirmacao}` do aviso em `MinhaConta.tsx` faz `test/minha-conta-estreita.test.ts` reprovar (1 de 6, `mut2-minhaconta-foco.log`); restaurado com `git restore`, `git status --porcelain` sem mudança fora das pastas de validação.
- Vitest das suítes de acessibilidade do painel: `acessibilidade`, `minha-conta-estreita`, `recuperar-senha`, `semente-e-confirmacoes`, `sessao-e-entrada`, `sessoes-e-senha-temporaria`: 124 de 124 (`vitest-a11y.log`).
- Capturas (minhas): `a11y-E09-minha-conta-foco-na-confirmacao-*`, `a11y-E09-senha-temporaria-foco-ja-anotei-com-toast-320-claro.png`, `a11y-E09-senha-temporaria-foco-ja-anotei-sem-toast-320-claro.png`, `a11y-E09-toque-no-texto-do-toast-antes-320-claro.png`, `a11y-E09-toque-no-texto-do-toast-depois-320-claro.png`, `a11y-E09-toast-fechar-sobre-ja-anotei-320-claro-{mouse,toque}.png`. Do UX: `E09-minha-conta-confirmacao-com-foco-nativo-*`, `E09-janela-senha-temporaria-320-claro.png`. Elas mostram senhas temporárias sorteadas pelo banco em memória, já descartado.

## Cenários positivos

Encerrar as outras sessões só pelo teclado com o foco na confirmação nomeada; janelas com nome, foco inicial seguro, foco preso e devolvido; senha copiada anunciada; botão de Minha conta legível e dentro da coluna a 320 px.

## Cenários negativos

- Esc na janela de confirmação não encerra nada e devolve o foco ao botão.
- Clique fora não fecha a senha temporária (conferido).
- Depois do clique fora, o Tab NÃO vaza para a página de trás (o fundo está `inert` e `aria-hidden`): volta para "Copiar senha".

## Tentativas de reprovar

- Procurei foco em `BODY` com a sessão única (botão some) em Chromium e WebKit, a 320 e a 1280 px: não morde.
- Procurei o aviso focado sem nome acessível (risco do mecanismo sem `role`): o Chromium computa o nome pelo conteúdo. Mutação confirma que o teste trava o mecanismo.
- Reproduzi a nota do UX sobre o `Modal`: depois de clicar no véu, o foco vai a `BODY` e o Esc deixa de fechar (o `onKeyDown` mora no painel). Medido, ver Achado 2.
- Reproduzi a nota do UX sobre o Toast a 320 px e fui além: com o foco em "Já anotei a senha", 100 por cento do botão fica sob o Toast por cerca de 6,4 s; o "Fechar" do Toast não funciona com a janela aberta (o Toast está `inert` e `aria-hidden`, o toque atravessa); e tocar no TEXTO do Toast aciona o "Já anotei a senha" escondido embaixo e fecha a janela da senha temporária. Ver Achado 1.

## Achados

1. corrige antes de crescer (nasce nesta etapa: Toast de "Encerrar sessões" e janela da senha temporária são da E09; dono E09 ou F10-E11). A 320 px, quando quem administra encerra as sessões de alguém e em seguida (dentro de cerca de 6,4 s) redefine a senha, o Toast fica por cima do rodapé da janela "Senha temporária":
   - o foco no botão "Já anotei a senha" fica 100 por cento encoberto (falha transitória de 2.4.11, Foco não obscurecido, da WCAG 2.2 AA, que é o alvo da V2; na 2.1 não há critério equivalente);
   - o "Fechar" do Toast não fecha nada enquanto a janela está aberta (o Toast fica no fundo `inert`), ao contrário do que diz o relatório de UX desta rodada ("com Fechar");
   - tocar no texto do Toast aciona o "Já anotei a senha" que está embaixo: a janela fecha e a senha, que "não aparece de novo", se perde (é preciso redefinir outra vez, o que derruba as sessões de novo).
   Reprodução: `e09b.mjs` e `e09d.mjs` (conta fictícia criada pela API, viewport 320 por 844, toque): "toque no texto do Toast ... cai em Já anotei a senha" e "janela da senha temporária aberta = 0". Capturas `a11y-E09-toque-no-texto-do-toast-{antes,depois}-320-claro.png`. Conserto provável: fechar o Toast ao abrir uma janela, ou desenhá-lo abaixo do véu (`--ds-z-toast` acima de `--ds-z-modal` hoje). Não reprova porque a DoD de acessibilidade da etapa (anúncio, foco devolvido, ícone mais texto) está atendida, o efeito é transitório e recuperável, e a 2.4.11 pertence ao gate transversal (F23); mas é defeito real criado na fase.
2. corrige antes de crescer (anterior à fase, `componentes/Modal.tsx` sem mudança desde `afde25c`; dono F10-E11): depois de um clique no véu de janela que não fecha por clique fora, o foco vai a `BODY` e o Esc deixa de funcionar até a pessoa voltar com Tab. Pela WCAG não é falha: o Tab seguinte volta para dentro da janela (não há armadilha nem vazamento, 2.1.1, 2.1.2 e 2.4.3 se cumprem), e é uso misto de ponteiro e teclado. Mas contradiz o comentário do próprio `Modal` ("o caso do foco que não está na lista é o que salva a janela quando algo roubou o cursor (um clique no fundo...)"): o Tab se salva pelo `inert`, o Esc não. Conserto: escutar o teclado no documento enquanto a janela está aberta, ou impedir que o clique no véu tire o foco.
3. corrige antes de crescer (dono F10-E11, mesmo achado da E13 nas rodadas 1 e 2): o Toast monta a região `role="status"` já com o texto; o anúncio de "Sessões de ... encerradas" não é garantido. A DoD pede "confirmação anunciada por role=status": o papel existe, o anúncio não está provado.
4. anotado: a janela da senha temporária fecha com Esc direto (decisão de produto em aberto, já registrada como pendência do Rafael).

## Não verificado

- Leitor de tela real (NVDA, VoiceOver) no aviso focado sem papel, nas janelas e no Toast: provado por árvore de acessibilidade e por foco, não por voz.
- Firefox (não instalado); WebKit só para o foco (a árvore de acessibilidade por CDP é só do Chromium).
- Zoom de 400 por cento; 768 px medido só pelo UX.

## Risco residual

Leitor de tela que não leia o nome de um `generic` focado diria só "grupo" ou nada no aviso de Minha conta; o Chromium expõe o nome, e NVDA e VoiceOver costumam ler o conteúdo do elemento focado, mas não foi ouvido. O Achado 1 pode custar uma senha temporária a quem toca no Toast logo depois de encerrar sessões em celular.

## Motivo do humano

Leitor de tela real no aviso focado, nas janelas e no Toast (CP-32). Gatilhos visuais da seção 10 disparados pelo diff da rodada: novo padrão visual (classe compartilhada `.botao--quebra` e prop `foco` do componente compartilhado `Aviso`) e texto de produto (frases das confirmações). Rafael decide o Achado 1 (Toast por cima da janela da senha temporária) e o Esc da senha temporária (Achado 4).
