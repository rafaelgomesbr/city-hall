---
validador: acessibilidade (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
Escopo de acessibilidade da E10: telas públicas `/recuperar-senha` e `/redefinir-senha` (pedido, erros de campo, confirmação do pedido, senha nova, sucesso, link que não vale mais). A rodada 2 reprovou acessibilidade porque a tela de sucesso redirecionava sozinha em cerca de 2,5 s e a entrada não repetia a confirmação (WCAG 2.2.1). O UX desta rodada anotou que o aviso de sucesso que recebe o foco não tem `role`; a pergunta é se o leitor de tela recebe o anúncio. Régua: WCAG 2.2 AA (alvo da V2). Diff lido: `RecuperarSenha.tsx` (sem relógio, foco na confirmação, `comVolta`), `recuperar-regras.ts`, `comuns.tsx` (prop `foco`), `app.css` (cor do texto no hover).

## Critérios verificados

1. Defeito da rodada 2 (2.2.1, redirecionamento por tempo): NÃO MORDE MAIS. Depois de redefinir, 6 s de espera: a URL continua `/redefinir-senha` e a confirmação continua na tela; a ida à entrada é só pelo link "Entrar com a nova senha". `e10.log`.
2. Anúncio da confirmação sem `role` (a pergunta desta rodada): o leitor de tela recebe o texto pelo FOCO. Medido na árvore de acessibilidade do Chromium (CDP) no elemento focado: depois de redefinir, papel `generic`, nome "Senha redefinida. Entre com a nova senha." (fonte: conteúdo), focável e focado; depois de enviar o pedido, papel `generic`, nome "Se existir conta com esse email, enviamos um link de redefinição. Confira sua caixa de entrada.". O ícone é `aria-hidden`. Nenhuma região viva nasce ou muda no sucesso (`regiões: []`), então não há anúncio duplo. Como a mensagem recebe o foco, o 4.1.3 (que trata de mensagem SEM foco) não se aplica, e o 2.4.3 se cumpre (o foco não cai em `BODY`). O que fica sem prova é a voz: ver Não verificado.
3. Foco visível no aviso focado (2.4.7, 1.4.11): `:focus-visible` verdadeiro depois do envio pelo teclado; anel `box-shadow` de 2 px mais 2 px, cor externa `#6D28D9` contra o cartão branco 7,10:1 (claro) e `#A78BFA` contra `#171E24` 6,19:1 (escuro). Capturas `a11y-E10-senha-redefinida-foco-1280-{claro,escuro}.png`.
4. Contraste do texto do aviso (1.4.3): claro `#14702F` sobre `#E6F6EA` 5,53:1; escuro `#69DB7C` sobre o fundo translúcido composto 7,48:1. Hover do link-botão "Entrar com a nova senha" (o defeito de rótulo invisível achado na correção 2): branco sobre `#4C1D95` 10,95:1 (claro) e `#101519` sobre `#C4B5FD` 9,95:1 (escuro). `e10.log`.
5. Teclado, ordem e erros de campo (2.1.1, 2.4.3, 3.3.1, 3.3.3): na entrada, Tab chega a "Esqueceu a senha?" (email, senha, Entrar, link) e Enter abre o pedido. No pedido, Tab: email, "Enviar link de redefinição", "Voltar para a entrada"; Shift+Tab volta na ordem inversa. Email vazio: foco fica no campo, `aria-invalid="true"` e o erro ligado por `aria-describedby`. Senha curta: foco no campo da senha nova com o erro ligado; senhas diferentes: foco no campo de repetir com o erro ligado. Depois da confirmação, Tab vai ao link (papel `link`, nome "Entrar com a nova senha"); "Pedir de novo" devolve o foco ao campo de email (Chromium e WebKit, `e10w.log`).
6. Título da aba (2.4.2): "Recuperar senha · Defesa Civil 360" e "Definir nova senha · Defesa Civil 360"; depois do link, "Entrar · Defesa Civil 360".
7. Reflow e alvo (1.4.10, 2.5.8 e régua de 44 px do projeto): a 320 px a tela de sucesso não rola na lateral; o link-botão mede 206 por 44 px. As capturas do UX a 320 px cobrem os demais estados.
8. Uma ação e um texto na tela de sucesso: só o aviso e o link (sem o rodapé "Voltar" e sem a frase repetida). Captura `a11y-E10-senha-redefinida-foco-1280-claro.png`.

## Evidência

- Painel construído do SHA fora do repositório, API PGlite com `NOTIFICADOR_ARQUIVO` nas portas 3881 e 4881 (`$SP/val/acessibilidade/subir.sh`); link real de redefinição lido do arquivo do notificador.
- `node $SP/val/acessibilidade/e10.mjs`: código 0, `e10.log` com 20 OK e 1 FALHA (a FALHA é a conferência do foco no "link que não vale mais", Achado 1, já registrado pelo implementador para F10-E11). `node e10w.mjs`: WebKit, 2 de 2 para o E10.
- Mutação que prova que o teste da etapa morde: tirar `foco={confirmacao}` do aviso de sucesso em `RecuperarSenha.tsx` faz `test/recuperar-senha.test.ts` reprovar (2 de 47, `mut3-redefinir-foco.log`); restaurado com `git restore`, árvore limpa.
- Vitest das suítes de acessibilidade do painel: 124 de 124 (`vitest-a11y.log`).
- Capturas do UX desta rodada (estados a 1280, 390 e 320 px, claro e escuro): `E10-*` em `docs/evidencias-v2/G00/validacao/52952a1/navegador/capturas/`.

## Cenários positivos

Pedido e redefinição feitos só pelo teclado, com o foco acompanhando cada troca de tela até a confirmação nomeada, sem relógio, contraste AA nos dois temas e no hover.

## Cenários negativos

- Email vazio, senha curta e senhas diferentes: o foco vai ao campo certo e o erro é lido junto com o campo.
- Link já usado: a frase de perigo (`role="alert"`, `live: assertive`) nasce na tela; ver Achado 1 para o foco.

## Tentativas de reprovar

- Procurei anúncio duplo (foco mais região): no sucesso nenhuma região viva nasce nem muda. Não morde.
- Procurei elemento focado sem nome (o risco de tirar o `role`): o Chromium expõe o nome pelo conteúdo nos dois avisos. Não morde.
- Procurei o relógio de volta (qualquer navegação sozinha em 6 s): não há.
- Procurei o anel de foco ausente no aviso: minha primeira medida olhou `outline` (que é `none` de propósito) e acusou; refeita sobre `box-shadow`, que é como o projeto desenha o anel, o anel existe e passa 3:1. Registro para não ser lido como falha.
- Procurei rótulo invisível no hover (defeito achado pela correção): 10,95:1 e 9,95:1.

## Achados

1. corrige antes de crescer (já registrado pelo implementador em `apps/web/PENDENCIAS.md`, seção 12; dono F10-E11): quando a redefinição cai em "link que não vale mais" (ou em "recuperação desligada"), o formulário some e o foco fica em `BODY`. A frase é `role="alert"` e nasce na tela, o que costuma ser anunciado; mas o Tab recomeça do topo. Reprodução: `e10.mjs`, bloco "link já usado".
2. anotado (anterior à fase, igual à rodada 2): as telas públicas de entrada e recuperação não têm a marcação `main`; telas curtas, 2.4.1 se cumpre por outro meio.
3. anotado: ao chegar a `/recuperar-senha` pelo link da entrada o foco fica em `BODY` (carga de página nova, o primeiro Tab vai ao campo de email). Comportamento esperado de página.

## Não verificado

- Leitor de tela real: a leitura do `generic` focado (sem papel) por NVDA, JAWS e VoiceOver não foi ouvida. A árvore do Chromium dá o nome certo; o comportamento do leitor diante de foco em elemento sem papel varia (pode dizer só o texto, ou "grupo" e o texto).
- Firefox (não instalado); árvore de acessibilidade só no Chromium (CDP).
- Cabeçalhos `Referrer-Policy` e `X-Robots-Tag` na Vercel (fora da dimensão).

## Risco residual

O anúncio por foco depende de o leitor ler o conteúdo de um elemento focado sem papel; é o comportamento comum, mas não provado por voz. O caso de link que não vale mais deixa o foco no topo.

## Motivo do humano

Leitor de tela real (CP-32) para ouvir "Senha redefinida. Entre com a nova senha." e a confirmação do pedido ao receberem o foco. Gatilhos visuais da seção 10 disparados: tela pública e texto de produto (frase e rótulo novos do sucesso); Rafael confere as capturas `E10-*` (pendência já registrada).
