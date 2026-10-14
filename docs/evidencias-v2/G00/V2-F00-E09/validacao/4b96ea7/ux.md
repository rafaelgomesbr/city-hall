---
validador: ux
modelo: claude-sonnet-5-5
etapa: V2-F00-E09
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: gatilho visual (tela nova, texto de produto, ação destrutiva, senha única)
---
Capturas do agente independente de navegador, em `<scratchpad>/web/capturas/` (scratchpad = `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad`), nome `E09-<tela>-<largura>-<tema>.png`, mais as variantes `firefox/` e `webkit/`. Abri e li as imagens citadas abaixo; não aceitei a medição do outro agente sem olhar a captura. Limite honesto: não tive shell nesta sessão (sem `git diff`), então o escopo foi decidido pelo dossiê, por `Grep` e leitura de `app.css` e das páginas.

## Critérios verificados

Rodada 1: FAIL por botão de confirmação estourando a 390 px e "Mapa da cidade" cortado. Reteste pelo cenário que provou o defeito, mais caça a regressão.

1. Botão da janela a 390 px (era o FAIL): CONSERTADO. `E09-janela-encerrar-sessoes-vista-390-claro.png`: "Encerrar sessões de Jonas Ferreira" cabe, com borda inteira, e "Cancelar" abaixo, ambos com a largura da janela. A 320 px (`E09-janela-encerrar-sessoes-vista-320-escuro.png`) o rótulo quebra em duas linhas dentro do botão, sem passar da janela. `E09-janela-redefinir-pergunta-vista-390-escuro.png` idem, com anel de foco no "Cancelar" (foco inicial no lado seguro).
2. "Mapa da cidade" na barra do pé: CONSERTADO. Inteiro, em duas linhas, nos ladrilhos de 320, 390 e 768 (`E09-minha-conta-sessoes-390-claro.png`, `E09-janela-senha-temporaria-vista-320-claro.png`, `E09-usuarios-lista-768-claro.png`).
3. Sino a 390 px: CONSERTADO. `E08-agente-sino-aberto-390-escuro.png`: painel dentro da tela, nenhuma palavra cortada.
4. Senha temporária: `E09-janela-senha-temporaria-vista-320-claro.png`. Frase "Anote agora. Esta senha não aparece de novo...", senha em mono com rótulo, "Copiar senha" e "Já anotei a senha", 72 horas, "Esta conta não tinha nenhuma sessão aberta". Texto claro, sem travessão. Os dois botões ficam com largura do conteúdo, enquanto nas outras janelas do mesmo componente empilham com largura total (inconsistência pequena, anotada).
5. Troca obrigatória: `E09-definir-a-sua-senha-390-claro.png`: explica por que, três campos com rótulo visível, botão "Definir senha e entrar".
6. Aviso após encerrar: `E09-usuarios-sessoes-encerradas-aviso-390-escuro.png`: "Sessões de Jonas Ferreira encerradas. 2 sessões caíram." acima da barra, opaco, com "Fechar".
7. Minha conta a 320 px: FAIL (ver achado 1). A 390 px (`E09-minha-conta-sessoes-390-claro.png`) o botão "Encerrar minhas outras sessões" tem largura de conteúdo e respeita a coluna.

Portão visual (seção 0 de `19`), item a item:
- Alinhamento: FAIL a 320 px em Minha conta: o botão vermelho passa da coluna dos cartões de sessão (termina cerca de 8 px da borda do cartão, enquanto as linhas de sessão terminam a 24 px). Nos demais tamanhos PASS.
- Espaçamento: FAIL no mesmo ponto (botão invade o respiro do cartão). Demais: PASS.
- Nada fora do lugar: FAIL a 320 px (mesma captura). Nas janelas: PASS. Em 768 e 390 a coluna "Ação" da lista de usuários, onde estão os dois botões novos, fica atrás da rolagem lateral da tabela (`E09-usuarios-lista-768-claro.png` mostra "Corrigi" e "Redefin" cortados na borda); a rolagem é declarada e tem a dica "A tabela continua para a direita", então anoto, não reprovo.
- Hierarquia: PASS.
- Texto: PASS, sem travessão, sem erro de grafia nas frases lidas.
- Responsivo: 320, 390, 768 e 1280 capturados. Zoom de 200 por cento não capturado.
- Temas, foco, contraste: os dois temas capturados; foco visível no "Cancelar" (anel violeta); contraste não medido por mim; estado nunca só por cor (ícone mais texto em "Esta sessão", avisos).
- Estados: sucesso (aviso, lido) existe; vazio (`E09-minha-conta-sessao-unica-jonas-*`) e erro (senha curta na troca) constam das capturas listadas pelo outro agente, mas não as abri nesta rodada; carregando não reaberto.
- Rafael aprova: pendente.

Heurísticas de Nielsen aplicáveis: 1 (estado: aviso com contagem, ok), 2 (mundo real: "Encerrar sessões", "Redefinir senha", ok), 3 (controle e liberdade: Esc fecha a senha temporária e a senha some, ver achado 2), 4 (consistência: botões da senha temporária diferem das outras janelas), 5 (prevenção de erro: confirmação com nome e efeito, ok; clique fora protegido, Esc não), 6 (reconhecer: duas sessões "Firefox em Windows" quase iguais, difícil saber qual é qual), 8 (minimalismo: ok), 9 (erro: senha curta diz o que fazer, ok).

## Evidência

Capturas lidas por mim (todas em `<scratchpad>/web/capturas/` salvo indicação): `E09-janela-encerrar-sessoes-vista-390-claro.png`, `E09-janela-encerrar-sessoes-vista-320-escuro.png`, `E09-janela-redefinir-pergunta-vista-390-escuro.png`, `E09-janela-senha-temporaria-vista-320-claro.png`, `E09-minha-conta-sessoes-390-claro.png`, `E09-minha-conta-sessoes-320-claro.png`, `webkit/E09-minha-conta-sessoes-320-escuro.png`, `firefox/E09-minha-conta-sessoes-320-claro.png`, `firefox/E09-janela-encerrar-minhas-outras-vista-320-claro.png`, `E09-usuarios-lista-1280-escuro.png`, `E09-usuarios-lista-768-claro.png`, `E09-usuarios-lista-320-claro.png`, `E09-definir-a-sua-senha-390-claro.png`, `E09-usuarios-sessoes-encerradas-aviso-390-escuro.png`, `E08-agente-sino-aberto-390-escuro.png`. Causa raiz lida em `dc360/apps/web/src/estilos/app.css`: `.botao` é `white-space: nowrap` (linha 670) e a correção 1 só soltou a quebra em `.modal__rodape .botao` (linha 707); o botão "Encerrar minhas outras sessões" fica fora de janela e continua `nowrap`. O teste `layout-estreito.e2e.mjs` mede janelas e barra, não a tela Minha conta, por isso passou verde.

## Cenários positivos

- Janela de encerrar sessões e de redefinir senha cabem em 1280, 768, 390 e 320, nos dois temas.
- Senha temporária exibida com frase de aviso e botão de copiar; troca obrigatória com os três campos rotulados.
- Aviso de sessões encerradas acima da barra e com fundo opaco.

## Cenários negativos

- Nome de pessoa longo no botão da janela (caso do FAIL da rodada 1): o rótulo quebra e não estoura.
- Largura 320 em Minha conta, Chromium, Firefox e WebKit: o botão passa da coluna (falha).
- Esc na janela da senha temporária: fecha (observado só pelo outro agente, no Chromium; não repeti no navegador nem li o código de `Modal`).

## Tentativas de reprovar

- Procurei o botão cortado a 390 e 320 nas duas janelas de confirmação: não acontece mais.
- Procurei o mesmo defeito (`.botao` nowrap) fora de janela, em tela que a etapa criou: achei em Minha conta a 320 px. O outro agente registrou só o Firefox; a captura do Chromium (`E09-minha-conta-sessoes-320-claro.png`) e a do WebKit (`webkit/E09-minha-conta-sessoes-320-escuro.png`) mostram o botão mais largo que as linhas de sessão acima dele do mesmo jeito. A medição de `scrollWidth` do agente não pegou porque o botão ainda cabe dentro do cartão, mas invade o respiro.
- Procurei sessões que se distingam: as duas linhas mostram o mesmo navegador e a mesma hora; sem local, sem última atividade.
- Procurei travessão e grafia: nada.

## Achados

1. BLOQUEIA (portão visual, tela criada pela etapa): Minha conta a 320 px, cartão "Minhas sessões", o botão "Encerrar minhas outras sessões" passa da coluna e fica grudado no respiro do cartão, nos três motores. Reprodução: entrar como Helena, abrir Minha conta com a janela em 320 px. Dono: E09 (`MinhasOutrasSessoes`); correção provável: o mesmo tratamento de `.modal__rodape .botao` (quebra de linha e `max-width: 100%`) aplicado ao botão da seção de sessões, e uma verificação nova em `layout-estreito.e2e.mjs` para Minha conta a 320 (o teste precisa morder: hoje não mede essa tela).
2. Corrige junto (decisão de produto, não é falha do portão): na janela "Senha temporária" o Esc fecha e a senha some, mas o clique fora não fecha. A frase da própria janela diz que fechar sem anotar obriga a redefinir. O reflexo de apertar Esc perde o único exemplar. Sugestão: Esc só fecha depois de "Copiar senha" ou "Já anotei a senha", ou pede o mesmo cuidado do clique fora. Dono: E09. Decisão do Rafael.
3. Corrige antes de crescer: duas sessões "Firefox em Windows" quase iguais na lista, sem como distinguir (rodada 1, achado persistente, anterior ao conserto).
4. Corrige antes de crescer: a coluna "Ação" da lista de Usuários, onde ficam "Redefinir senha" e "Encerrar sessões", fica atrás da rolagem lateral em 768 e 390 (as duas ações novas da etapa só aparecem ao rolar). Dono: E09 e F10 (menu de ações por linha).
5. Anotado: botões da janela de senha temporária com largura de conteúdo, diferentes das demais janelas; espaço vazio no fim da janela a 320.

Os quatro defeitos do outro agente, decididos: (1) Órgãos a 320, tela Orgaos, vai para a E13 (ver o relatório dela); (2) Minha conta a 320 px, tela criada pela E09: conta contra a E09 (achado 1, em todos os motores, não só no Firefox); (3) Esc na senha temporária: da E09, achado 2; (4) "Corrigir a coordenada" a 24 px: tela Ocorrência, elemento anterior ao lote, não é desta etapa (ver E08).

## Não verificado

- Zoom de 200 por cento, leitor de tela, contraste medido.
- Foco do teclado dentro das janelas (li só o resultado do outro agente: foco inicial em "Cancelar", Tab preso, Esc devolve o foco).
- Capturas do implementador (`correcao-1/capturas/`) não reabertas; usei só as independentes.
- Copiar senha no Firefox e no WebKit (sem permissão de área de transferência no Playwright).
- Não vi as 938 capturas: amostrei 15 imagens desta etapa, as de maior risco (320 e as janelas).

## Risco residual

Pessoa em celular pequeno com o botão destrutivo encostado na borda do cartão; e a senha temporária perdida por Esc, sem como recuperar a não ser redefinir de novo.

## Motivo do humano

Gatilhos da seção 10 disparados: nova superfície (Minha conta com sessões, janelas novas), texto de produto novo (frase da senha única e confirmações) e ação destrutiva. Rafael lê a frase da senha única e a decisão sobre o Esc (achado 2).
