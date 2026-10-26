---
validador: ux
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Capturas minhas, Chromium do Playwright, painel construído do SHA (`vite build` com `VITE_API_URL`, servido por `vite preview` na 4891) ligado à API real do SHA (`tsx src/index.ts`, PGlite semeado, 3891, migração final 051). Pasta: `docs/evidencias-v2/G00/V2-F00-E05/validacao/4ce0433/capturas/` (abaixo, `capturas/`), 38 arquivos `ux-*`. Cada captura foi aberta e olhada (diretamente ou por recorte e folha de contato no scratchpad).

| Critério (DoD, cinco campos, portão visual) | Resultado | Prova |
| --- | --- | --- |
| Painel trata `sessao_encerrada` como sessão morta, com a frase certa | OK | encerrar sessões pela API e o Diego tentar escrever (trocar senha) com o token de acesso vivo: entrada com "Sua sessão foi encerrada..." em tom de alerta, ícone e texto. `capturas/ux-entrada-encerrada-pela-escrita-{1280,390,320}-{claro,escuro}.png` |
| `conta_desativada` com aviso próprio na entrada | OK | desativar pela API e renovar: "Sua conta foi desativada. Entrar de novo não resolve: procure a coordenação do seu município. Nada do que você já registrou se perdeu." em tom de perigo. `capturas/ux-entrada-desativada-{1280,390,320}-{claro,escuro}.png` |
| Sessão expirada (já existia) | OK | tokens de acesso e de renovação inválidos: "Sua sessão expirou...". `capturas/ux-entrada-expirou-{1280,390,320}-{claro,escuro}.png` |
| `/auth/entrar` de conta desativada continua genérico | OK | senha certa da conta desativada e e-mail inexistente dão a mesma frase "Email ou senha inválidos." no campo (log `E05b`). `capturas/ux-entrada-desativada-tentou-entrar-{1280,390}-{claro,escuro}.png` |
| Códigos novos do catálogo (correção 2) caem como erro comum na tela, sem derrubar a sessão | OK | coordenadora com a lista de Usuários aberta, o Jonas promovido a coordenador pela API, clique em Redefinir senha e em Encerrar sessões: 403 `posto_insuficiente` aparece DENTRO da janela, "Seu perfil não administra conta de coordenador. Peça a quem administra o município.", a sessão continua de pé. `capturas/ux-usuarios-redefinir-recusa-posto-{1280,390,320}-{claro,escuro}.png`, `capturas/ux-usuarios-encerrar-recusa-posto-{1280,390}-{claro,escuro}.png` |
| Portão visual: alinhamento, espaçamento, nada cortado, temas, estado não só por cor | OK | medição automática por captura (rolagem horizontal da página, elemento além da janela, texto cortado fora de envoltório que rola): nenhuma ocorrência nas 38 (`saidas/capturas.log`); olhadas a 320, 390 e 1280 nos dois temas |
| Texto: português, sem travessão | OK | as três frases lidas nas capturas; `grep` de U+2014 em `codigos-de-erro.ts`, `entrar-regras.ts`: 0 |

Itens do "Motivo do veredito" da rodada 4 que tocam a tela: o FAIL foi do teste de catálogo (QA), não de tela. O que a correção 2 muda na tela é que `posto_insuficiente`, `posto_insuficiente_para_dado_pessoal`, `email_so_por_administrador` e `assinatura` entram no catálogo com ação `nenhuma`. Conferi o efeito visível: o 403 `posto_insuficiente` chega como erro comum na janela, com a frase da rota, sem renovar e sem mandar para a entrada (consertado do ponto de vista de tela, sem regressão). As mensagens novas do catálogo NÃO aparecem no painel (o painel mostra a frase do servidor; o transporte do campo só usa a mensagem do catálogo para os motivos de sessão, `packages/campo/src/transporte.ts:126-137`).

## Evidência

- Construção: `vite build` modo API e modo local, código 0 (`saidas/build-api.txt`, `saidas/build-local.txt`).
- Roteiros: `e05.mjs` e `e05b.mjs` (no diretório de trabalho), com apoio `comum.mjs`; log de tudo em `saidas/capturas.log`.
- Diretório de trabalho: `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L06-ux/`.
- Console: nas três telas de entrada só os 401 e 403 esperados do próprio cenário; nenhum erro de script.

## Cenários positivos

- Expirou, encerrada (pela escrita) e desativada mostram cada uma a sua frase, nas larguras 1280, 390 e 320, claro e escuro.
- A recusa por posto aparece na janela certa e a pessoa continua logada.

## Cenários negativos

- Conta desativada tentando entrar com a senha certa: recusa genérica igual à de e-mail inexistente (não revela o estado da conta a quem não tem token).
- Sessão encerrada por quem administra e só depois o token de acesso vence (caminho comum, renovação recusada com 401 `sessao_encerrada`): a tela diz "Sua sessão expirou" e não "foi encerrada" (`capturas/ux-entrada-encerrada-{1280,390,320}-*.png`, gerada assim de propósito). Ver Achados.

## Tentativas de reprovar

- Procurei a frase "encerrada" pelo caminho mais comum (token vencido depois do encerramento): aparece "expirou". Não reprova: o servidor responde igual a renovação vencida e revogada (decisão de não revelar), e "expirou" é verdadeiro do ponto de vista de quem lê; a frase própria aparece quando a pessoa escreve com o token vivo.
- Forcei o 403 de um código novo do catálogo numa tela velha (papel mudado por baixo): não derruba a tela, não renova, frase legível. Achei um detalhe de consistência (ver Achados).
- 320 px: janela de redefinição com a recusa rola por dentro (`overflow-y: auto`, medido), o e-mail do alvo quebra no ponto, nada sai da janela.
- Varri `apps/api/src/auth` e `rotas/administracao.ts` por mensagens sem acento: só "A senha atual nao confere." (aparece em Minha conta, registrado na E09).

## Achados

- anotado: depois de quem administra encerrar as sessões, se a pessoa só lê até o token de acesso vencer, a entrada diz "Sua sessão expirou" e não "Sua sessão foi encerrada" (`apps/web/src/dados/http.ts:103-109`: renovação recusada que não é `conta_desativada` vira "expirou"). Reprodução: `e05.mjs` bloco 2. Coerente com a resposta neutra da renovação; só registro para o Rafael saber que a frase de "encerrada" aparece na escrita.
- anotado: na janela que recebeu o 403 `posto_insuficiente`, a linha de dados ainda diz "Operador de plantão" (a lista não é relida) enquanto o aviso diz "conta de coordenador", e o botão de confirmar segue ativo (repetir dá a mesma recusa). `capturas/ux-usuarios-redefinir-recusa-posto-390-claro.png`. Caso raro (papel mudado com a tela aberta).
- anotado: a mensagem nova do catálogo `email_so_por_administrador` (e a da rota, `administracao.ts:341`) diz "Peça ao administrador.", supondo o gênero, quando o resto do produto diz "quem administra". Não aparece no painel hoje (o campo fica travado para quem não administra).

## Não verificado

- App de campo (Expo): as frases do aparelho para os três códigos não foram capturadas (sem emulador nesta sessão); a etapa é do painel nesta dimensão.
- 768 px nas telas de entrada e zoom de 200 por cento; leitor de tela.
- Firefox e WebKit (só Chromium).

## Risco residual

Baixo para a tela. As três frases estão certas e no lugar; o risco é de conteúdo (aprovação das frases pelo Rafael, ainda pendente) e o caso "encerrada que vira expirou" acima.

## Motivo do humano

Validação humana da etapa (Rafael lê as três frases e aprova) e gatilhos de `28` seção 10: tela pública (entrada) e texto de produto (catálogo alterado pela correção 2). Capturas para o Rafael ver: `capturas/ux-entrada-expirou-390-claro.png`, `capturas/ux-entrada-encerrada-pela-escrita-390-claro.png`, `capturas/ux-entrada-desativada-1280-claro.png`, `capturas/ux-entrada-desativada-320-escuro.png`, `capturas/ux-entrada-desativada-tentou-entrar-390-escuro.png` e `capturas/ux-usuarios-redefinir-recusa-posto-390-claro.png` (frase nova do 403 por posto na tela). As quatro mensagens novas do catálogo (`dc360/packages/shared/src/codigos-de-erro.ts:190-224`) não têm tela no painel: o Rafael as lê no arquivo.
