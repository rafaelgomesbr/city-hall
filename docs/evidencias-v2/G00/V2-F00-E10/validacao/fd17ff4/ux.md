---
validador: ux
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD, INFRA]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Montagem (minha, no scratchpad `val-ux/`): API do SHA na porta 3797 (PGlite semeado) com `NOTIFICADOR_ARQUIVO` apontado para um arquivo do scratchpad, de onde o roteiro lê o link real de redefinição; painel construído do SHA com `VITE_API_URL` e servido por `vite preview` na 4797. Playwright 1.62.1, Chromium, Firefox e WebKit. A árvore de `dc360/` em HEAD `55209ab` é idêntica à de `fd17ff4`. Capturas em `capturas/` desta pasta (prefixo `ux-E10-`, motor no nome); saídas em `SCRATCH/val-ux/saidas/`.

Por que não herdada: o diff `1ed0b71..fd17ff4` toca `app.css` (o `scroll-padding-top` e o `scroll-margin-top` do bloco de até 600 px, a dica das janelas) e `componentes/foco.ts`. As telas desta etapa (`/recuperar-senha` e `/redefinir-senha`) são públicas, sem topo fixo nem barra do pé, e não usam `focarPrimeiroInvalido`; conferi a regressão nas capturas abaixo.

| Critério | Resultado | Prova |
| --- | --- | --- |
| Pedido com resposta neutra | OK nos três motores, 1280, 768, 390 e 320, dois temas: "Se existir conta com esse email, enviamos um link de redefinição. Confira sua caixa de entrada.", foco na confirmação | `ux-E10-pedido-enviado-*` (24) |
| Email vazio e torto | OK: "Informe o seu email funcional." e "Informe um email completo, como nome@orgao.gov.br.", foco no campo, nos três motores | `ux-E10-pedido-erro-vazio-*`, `ux-E10-pedido-erro-formato-*` |
| Email longo no campo | OK: o campo rola por dentro, a página não (`ux-E10-pedido-email-longo-320-claro-chromium.png`) | 24 capturas |
| Link real do notificador abre a tela da senha nova e o token sai da barra | OK, `token some da barra: true` nas 24 combinações | `ux-E10-definir-normal-*` |
| Senha curta e senhas diferentes, erro no campo certo | OK: "A senha precisa de pelo menos 12 caracteres." com foco em `#nova-senha`; "As duas senhas precisam ser iguais." com foco em `#repetir-senha`, nos três motores | `ux-E10-definir-erro-curta-*`, `ux-E10-definir-erro-diferentes-*` |
| Sucesso | OK: "Senha redefinida. Entre com a nova senha." com o foco nela e o botão "Entrar com a nova senha" | `ux-E10-definir-sucesso-*` |
| O mesmo link de novo | OK no texto: "Este link de redefinição não vale mais. Ele pode ter vencido, já ter sido usado ou ter sido trocado por um pedido mais novo. Peça um novo link."; foco em BODY (anotado 1) | `ux-E10-definir-link-ja-usado-*` |
| Sem link | OK: "Este endereço não traz um link de redefinição. Abra o link completo que chegou no seu email, ou peça um novo." | `ux-E10-definir-sem-link-*` |
| Recuperação desligada, excesso de pedidos, sem rede | OK no texto e no desenho: o passo a passo "Quem administra o sistema na sua Defesa Civil redefine a sua senha por dentro"; "Muitos pedidos em pouco tempo. Aguarde alguns minutos e tente de novo."; "Sem conexão com o servidor. O que você preencheu não foi enviado. Verifique o sinal e tente de novo." | `ux-E10-pedido-desligada-*`, `ux-E10-pedido-erro-excesso-*`, `ux-E10-pedido-erro-rede-*` (12 cada) |
| "Esqueceu a senha?" na entrada com toque de 44 px | OK: 137x44 nos três motores | `saidas/e10-*.txt` |

Portão visual (seção 0 de `19`), item a item, sobre 300 capturas:

| Item | Resultado |
| --- | --- |
| Alinhamento | OK: cartão, aviso e botão no mesmo eixo nas quatro larguras |
| Espaçamento | OK: nada grudado; respiro entre dica, aviso e botão igual nos estados de erro (`ux-E10-pedido-erro-rede-320-claro-chromium.png`) |
| Nada fora do lugar | OK medido nas 300 telas: sem rolagem horizontal, nada fora da janela, nada cortado, nenhuma palavra quebrada no meio (100 de 100 linhas "sem ..." por motor em `saidas/e10-{chromium,firefox,webkit}.txt`) |
| Hierarquia | OK: título, subtítulo, rótulo, dica e ação distintos |
| Texto | OK: português correto, sem travessão, cada erro diz o que fazer |
| Responsivo | OK a 1280, 768, 390 e 320 |
| Dois temas, foco visível, estado não só por cor | OK: avisos com ícone e texto nos dois temas (`ux-E10-pedido-desligada-320-escuro-webkit.png`); anel de foco na confirmação (`ux-E10-definir-sucesso-320-escuro-chromium.png`) |
| Estados vazios e de erro | Todos desenhados com a qualidade do estado normal |

Heurísticas: visibilidade do estado (confirmação neutra focada), mundo real (passo a passo sem email), recuperação do erro (cada frase diz o próximo passo), prevenção de erro (a resposta neutra não revela se a conta existe).

## Evidência

- `MOTOR=<motor> node SCRATCH/val-ux/e10.mjs`, código 0 em Chromium, Firefox e WebKit: 100 capturas por motor; saídas `saidas/e10-{chromium,firefox,webkit}.txt` e `-run.txt`. Erros de console: só os 401 do "link já usado" (8 em Chromium e WebKit); nenhum `pageerror`.
- Estados de desligada, 429 e queda de rede provocados interceptando a rota (`auth/recuperacao`, `auth/recuperar`); o resto por fluxo real com o link do notificador de arquivo.

## Cenários positivos

1. Pedido, link real, senha nova e sucesso nas quatro larguras, dois temas e três motores.
2. Entrada: "Esqueceu a senha?" com toque de 44 px.

## Cenários negativos

1. Email vazio e email sem arroba: erro no campo, foco no campo.
2. Senha curta e senhas diferentes: erro no campo certo.
3. Link usado de novo e endereço sem link: frase que manda pedir outro.
4. Recuperação desligada no servidor, excesso de pedidos e queda de rede.

## Tentativas de reprovar

- WebKit (não rodado na rodada 6) em todo o percurso.
- 320 px no tema escuro com o estado de recuperação desligada (o texto mais longo da etapa): cabe, sem corte.
- Email de 92 caracteres no campo do pedido a 320 px: o campo rola por dentro, sem empurrar a página.
- Procurei regressão do `app.css` desta rodada: as regras novas são do bloco de até 600 px para `html` e `.campo input`; nestas telas, sem topo fixo, não mudam nada visível (nenhum campo focado por código ficou fora de vista nas 300 telas).

## Achados

1. **corrige antes de crescer.** Igual à rodada 6: o foco cai em BODY depois de "link que não vale mais" (três motores) e depois do 429 e da queda de rede no Chromium (no Firefox e no WebKit fica no botão). Os avisos são `role="alert"` e são anunciados. Não é desta rodada.
2. **anotado.** Nenhum outro.

## Não verificado

- O email de verdade (CP-19, produção desligada): só o notificador de arquivo.
- Leitor de tela e aparelho real.
- Zoom de 200 por cento nestas telas (medido na E05 para a entrada e na E09 para Minha conta).

## Risco residual

Baixo: todos os estados estão desenhados e escritos com clareza nos três motores; o resíduo é o foco em três estados de erro de rede ou de link, já registrado.

## Motivo do humano

A validação humana da etapa é do Rafael: fazer o fluxo com o notificador de arquivo e conferir que a produção continua desligada. Capturas para ele: `ux-E10-pedido-enviado-390-claro-chromium.png`, `ux-E10-definir-sucesso-390-escuro-firefox.png`, `ux-E10-pedido-desligada-390-claro-webkit.png`.
