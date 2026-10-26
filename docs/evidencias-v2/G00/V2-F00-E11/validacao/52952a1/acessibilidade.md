---
validador: acessibilidade (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E11
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [UI, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
Escopo de acessibilidade da E11: o botão "Baixar pacote de saída" em Organização, o estado "Gerando" e as faixas de erro (recusa por permissão, rede caída, falha do servidor). A DoD da etapa não traz critério de acessibilidade próprio (baixar o ZIP em dois navegadores, 401 renova, prova no e2e); a régua aplicada é a WCAG 2.2 AA nos critérios que tocam o cartão. `Organizacao.tsx` não mudou em `4b96ea7..52952a1`; o componente `Aviso` mudou (prop `foco`) e foi conferido em regressão.

## Critérios verificados

1. Nome e papel (4.1.2): alcançado pelo Tab, papel `button`, nome exato "Baixar pacote de saída" (ícone `aria-hidden`), na árvore do Chromium (CDP). `e11.log`.
2. Alvo e reflow (1.4.10 e régua de 44 px): 216 por 44 px a 1280 e a 320 px; a 320 px sem rolagem lateral com a faixa de recusa aberta. Captura `a11y-E11-organizacao-saida-recusa-320-claro.png`.
3. Contraste (1.4.3): rótulo do botão secundário 17,70:1 (claro) e 14,79:1 (escuro). A borda do botão contra o cartão é 1,30:1 e 1,33:1; o 1.4.11 não exige contorno de botão identificado pelo rótulo, então não é falha.
4. Erros ditos em texto e anunciados (1.4.1, 4.1.3): recusa 403 real servida à tela ("Seu perfil não tem permissão para alterar os dados do município."), rede caída ("Sem conexão com o servidor. O arquivo não foi baixado. Verifique o sinal e tente de novo.") e 500 ("Não foi possível concluir a operação."): cada uma nasce como `role="alert"` (`live: assertive`), com ícone e frase, a 1280 e a 320 px. Regressão do `Aviso` sem `foco`: intacta.
5. Download pelo teclado: Enter no botão baixa `dc360-pacote-de-saida-2026-10-14.zip` contra a API real.
6. Achados das rodadas 1 e 2 reexecutados (corrige antes de crescer, F10-E11): AINDA MORDEM, sem mudança. `disabled={baixando}` tira o foco do botão: durante o "Gerando" e depois do download, ou da falha, o foco está em `BODY`; nada anuncia "Gerando" (sem `aria-busy`, sem região viva) nem o fim do download. Confirmado que o `disabled` já existia em `afde25c` (anterior à fase).

## Evidência

- Painel construído do SHA fora do repositório, API PGlite nas portas 3881 e 4881 (`$SP/val/acessibilidade/subir.sh`), Chromium do Playwright 1.62.1, conta da administradora da semente.
- `node $SP/val/acessibilidade/e11.mjs`: código 0, `e11.log` com 9 OK e 8 FALHA; as 8 são as conferências dos achados F10-E11 do item 6 (foco e anúncio), escritas para falhar enquanto eles existirem. O "Gerando" foi medido segurando a resposta da rota; a recusa usa o corpo 403 REAL que a API deu à coordenadora; rede e 500 por rota simulada.
- Capturas do UX desta rodada: `E11-organizacao-saida-{antes,gerando,concluido,erro-recusa,erro-rede,erro-servidor}-*`; minha: `a11y-E11-organizacao-saida-recusa-320-claro.png`.

## Cenários positivos

Botão nomeado, alcançável e operável pelo teclado; download completo; faixas de erro em texto, com ícone, anunciadas como alerta e sem rolagem lateral a 320 px.

## Cenários negativos

Recusa de permissão, rede caída e falha do servidor: a tela diz o que houve em `alert`; o botão volta a ficar disponível.

## Tentativas de reprovar

- Procurei regressão do `Aviso` (risco novo desta rodada) nas faixas de erro: continuam `alert`.
- Procurei perda de foco e silêncio no "Gerando": continuam (item 6); anterior à fase e já atribuído à F10-E11.
- Procurei rolagem lateral e alvo baixo a 320 px com a faixa de recusa: não há.
- Procurei o botão com nome poluído pelo ícone: o nome é exatamente o rótulo.

## Achados

1. corrige antes de crescer (dono F10-E11, igual às rodadas 1 e 2): `disabled={baixando}` tira o foco para `BODY` e ele não volta depois do download nem da falha (2.4.3). Conserto simples: `aria-disabled` com a ação ignorada, ou devolver o foco ao botão no `finally`. Reprodução: `e11.mjs`, conferências de foco.
2. corrige antes de crescer (dono F10-E11, igual às rodadas 1 e 2): nada anuncia "Gerando" nem o fim do download (4.1.3). Reprodução: `e11.mjs`, conferências de anúncio.
3. anotado (texto de produto, já com o UX): a recusa diz "alterar os dados do município" a quem queria baixar; sendo `alert`, é lida em voz alta.

## Não verificado

- Leitor de tela real nas faixas de erro e no "Gerando" (CP-32).
- Firefox (não instalado) e WebKit para este fluxo.
- Zoom de 400 por cento.

## Risco residual

Quem usa leitor de tela aperta o botão, perde o foco e não ouve que o pacote está sendo gerado nem que terminou; ouve a falha, quando houver.

## Motivo do humano

Leitor de tela real no botão e nas faixas (CP-32). Portão visual por risco já registrado na rodada 2 (texto de produto e erro crítico de saída de dado): Rafael vê as capturas do botão e da recusa.
