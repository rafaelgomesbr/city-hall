---
validador: ux
modelo: claude-sonnet-5-5
etapa: V2-F00-E13
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [UI, A11Y]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: FAIL
confianca: media
humano_necessario: sim
escalar: gatilho visual (rota índice, texto de produto, Toast nas três telas de cadastro)
---
Capturas do agente independente em `<scratchpad>/web/capturas/` (scratchpad = `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad`), nome `E13-<tela>-<largura>-<tema>.png`, com `-vista` para a janela visível, e variantes `firefox/` e `webkit/`. Li as imagens citadas. Sem shell nesta sessão (sem `git diff`): o escopo saiu do dossiê e de `Grep` em `apps/web/src` (`Orgaos.tsx` importa `Toast` na linha 13 e o renderiza na 423, ou seja, a E13 mexeu na tela Órgãos).

## Critérios verificados

Rodada 1: PASS com achados anteriores à etapa (palavra quebrada "Não despachada" no Painel a 1280, sino cortado). Reteste, mais caça a regressão e defeito novo, agora em 320 e 768 que a rodada 1 não cobriu.

1. Entrar a partir de `/`: o outro agente provou por observador de DOM que "Esta página não existe" nunca aparece; `E13-destino-helena-painel-1280-claro.png` mostra o Painel operacional logo depois do login e `E13-teclado-pular-para-conteudo-390-claro.png` mostra "Pular para o conteúdo" com anel de foco como primeiro Tab. PASS.
2. Seis avisos (Toast): frases corretas em `E13-aviso-usuario-cadastrado-vista-320-claro.png` ("Usuário cadastrado. Ele já aparece na lista abaixo."), `E13-aviso-equipe-criada-vista-768-escuro.png`, `E13-aviso-orgao-corrigido-vista-390-claro.png`, `E13-aviso-orgao-cadastrado-vista-320-escuro.png`. Aviso opaco, acima da barra do pé em 768, 390 e 320, com ícone mais texto e "Fechar". Em 768 o aviso cobre um pedaço da tabela (Equipes), comportamento esperado de aviso flutuante. PASS.
3. Palavra quebrada no Painel a 1280: CONSERTADA. `E13-destino-helena-painel-1280-claro.png`: "Não despachada" agora quebra no espaço, em duas linhas, sem partir a palavra.
4. Sino a 390: consertado (ver relatório da E09, `E08-agente-sino-aberto-390-escuro.png`).
5. Órgãos a 320 px: FAIL (achado 1).

Portão visual (seção 0 de `19`), item a item:
- Alinhamento: PASS no Painel e nas entradas (`E13-entrada-768-escuro.png`: logo, título, cartão centralizados). Os seis indicadores do Painel ficam em grupo de 4 mais 2 (`E13-destino-helena-painel-1280-claro.png`), grupo desigual (anotado, anterior).
- Espaçamento: FAIL em Órgãos a 320 (rótulo "Mostrar desativados" encostado na borda do cartão).
- Nada fora do lugar: FAIL em Órgãos a 320: o rótulo "Mostrar desativados" ocupa o respiro do cartão em duas linhas, com "desativados" terminando na borda interna do cartão (`E13-aviso-orgao-cadastrado-vista-320-escuro.png`); na mesma tela, a coluna Contato vira uma pilha de pedaços de e-mail partidos em cinco linhas (`E13-aviso-orgao-cadastrado-320-claro.png`). Nos três motores, segundo o outro agente (15 px de vazamento medido). Em 390 e acima não ocorre (`E13-aviso-orgao-corrigido-vista-390-claro.png`).
- Hierarquia: PASS.
- Texto: PASS nas seis frases, sem travessão, sem erro de grafia.
- Responsivo: 320, 768, 390 e 1280 capturados; o 320 reprova em Órgãos. Zoom de 200 por cento não capturado.
- Temas, foco, contraste: dois temas capturados; foco visível no atalho; contraste não medido por mim; estado nunca só por cor (Toast com ícone).
- Estados: sucesso (Toast) lido; vazio e erro de campo do implementador não reabertos; carregando não aplicável.
- Rafael aprova: pendente.

Heurísticas de Nielsen: 1 (estado: Toast com `role="status"` confirma gravar, ok), 3 (controle: "Fechar" no aviso, ok), 4 (consistência: mesmo aviso nas três telas de cadastro, ok), 7 (eficiência: atalho "Pular para o conteúdo" e entrada direta a partir de `/`, ok), 8 (minimalismo: ok).

## Evidência

Capturas lidas (em `<scratchpad>/web/capturas/`): `E13-destino-helena-painel-1280-claro.png`, `E13-destino-helena-painel-320-escuro.png`, `E13-entrada-768-escuro.png`, `E13-teclado-pular-para-conteudo-390-claro.png`, `E13-aviso-usuario-cadastrado-vista-320-claro.png`, `E13-aviso-equipe-criada-vista-768-escuro.png`, `E13-aviso-orgao-corrigido-vista-390-claro.png`, `E13-aviso-orgao-cadastrado-320-claro.png`, `E13-aviso-orgao-cadastrado-vista-320-escuro.png`. Código: `Orgaos.tsx` linhas 254 a 263 (cartão "Órgãos cadastrados" com o `label.caixa-marcacao` no slot `acoes`) e `app.css` linhas 656 a 661 (`.caixa-marcacao`, flex sem encolhimento do rótulo).

## Cenários positivos

- Entrar por `/` e cair na tela do papel (Helena em Painel, Diego em Meu trabalho, segundo o outro agente).
- Gravar em Usuários, Equipes e Órgãos mostra o aviso certo em quatro larguras.

## Cenários negativos

- Órgãos a 320 px: o cartão "Órgãos cadastrados" não comporta o título e o controle lado a lado (falha).
- Sem sessão em `/`: vai à entrada sem frase (segundo o outro agente, T1).

## Tentativas de reprovar

- Procurei "Esta página não existe" depois do login por `/`: nunca aparece.
- Procurei Toast encoberto pela barra do pé em 768, 390 e 320: não encobre (folga medida de 15 px pelo outro agente, conferida a olho nas capturas).
- Procurei texto partido no Painel a 1280: consertado; a 320, o Painel ainda parte "escoramento" no meio da palavra (`E13-destino-helena-painel-320-escuro.png`, coluna estreita de Providências) e empilha "Travessa / São / Benedito" uma palavra por linha: anterior à etapa, em tabela que rola, anotado.
- Procurei o defeito do outro agente em Órgãos a 320 e o confirmei olhando a captura: o "Mostrar desativados" entra no respiro do cartão. Decisão de escopo: a E13 mexeu na tela Órgãos (acrescentou o `Toast` em `Orgaos.tsx`) e as capturas dela cobrem a tela em 320, então o defeito conta contra a E13. O elemento em si (slot `acoes` do cartão, `.caixa-marcacao`) é anterior; dono provável da causa: `Cartao`/`app.css`, mesma família do defeito de `.botao nowrap` da E09 (as duas correções podem sair juntas).
- Procurei travessão e grafia nas seis frases: nada.

## Achados

1. BLOQUEIA (portão visual, tela mexida pela etapa): Órgãos a 320 px, cartão "Órgãos cadastrados": o rótulo "Mostrar desativados" passa para a borda do cartão (15 px de vazamento medido, nos três motores) e a tabela de contatos parte o e-mail em cinco linhas dentro da coluna. Reprodução: entrar como Rita, abrir "Órgãos de destino" com a janela em 320 px (`E13-aviso-orgao-cadastrado-320-claro.png`, `E13-aviso-orgao-cadastrado-vista-320-escuro.png`). Correção sugerida: permitir que o cabeçalho do cartão quebre (título e controle em duas linhas, `min-width: 0` no rótulo) e deixar a tabela rolar na lateral como as demais (em vez de espremer o e-mail na coluna Contato), mais uma verificação a 320 na tela Órgãos. Barato e independente da causa de segurança.
2. Corrige antes de crescer: Painel a 320 px parte palavras no meio ("escorament / o") em colunas estreitas (dono anterior, F10).
3. Corrige antes de crescer: "Corrigir a coordenada" (botão de texto de 24 px de altura a 390 px) fica na tela Ocorrência, não é desta etapa; o outro agente o descreveu como "no sino", mas na captura ele está no cartão "Coordenada no mapa". Dono: componente `botao-texto` (F10).
4. Anotado: indicadores do Painel em grupo de 4 mais 2; barra do pé sem sinal de que rola.

## Não verificado

- Zoom de 200 por cento, leitor de tela, contraste medido.
- Sair e entrar com outro perfil no mesmo navegador (o outro agente fez T1 e passou; eu não repeti).
- Estados vazio e erro de campo do implementador não reabertos.
- Não vi as 938 capturas: li 9 desta etapa.

## Risco residual

Baixo para a rota índice e o Toast; o risco é só visual, em tela pequena, na tela Órgãos.

## Motivo do humano

Gatilhos da seção 10: nova jornada (entrar a partir de `/`), texto de produto (seis frases) e Toast reposicionado em três telas. Rafael digita só o domínio, entra e confere a tela do papel, e aprova as seis frases.
