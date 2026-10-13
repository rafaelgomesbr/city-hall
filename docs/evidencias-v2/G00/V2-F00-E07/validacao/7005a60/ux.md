---
validador: ux
modelo: claude-sonnet-5-5
etapa: V2-F00-E07
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [UI, AUTH, API]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: gatilho visual (fluxo de sessão e papel, na dúvida)
---
Capturas em `<scratchpad>/g00/capturas-ux/` (prefixo `e07-`), geradas por agente de apoio com API real e painel no SHA 7005a60, lidas por mim. O FAIL do `qa.md` (GET com efeito) é de segurança e não entra aqui.

## Critérios verificados

Foco: o que a pessoa vê quando a cadeia morre ou o papel muda.

1. Papel muda e a tela acompanha em silêncio: PASS. Antes `e07-antes-coordenadora-com-menu-usuarios-1280-claro.png` (Coordenador, menu com Equipes, Órgãos, Usuários, Prestação de contas). Depois do rebaixamento mas sem escrever, `e07-depois-do-rebaixamento-antes-de-escrever-1280-escuro.png`: já aparece "Operador de plantão" e o menu curto (a captura prova que a tela se atualiza; o roteiro diz que não foi recarregada, ver Não verificado). Depois da primeira escrita, `e07-depois-da-primeira-escrita-papel-operador-390-escuro.png`: aviso "Senha trocada" com ícone, papel "Operador de plantão", sem ir para a entrada.
2. Visibilidade do estado: o papel muda e o menu perde itens sem nenhuma frase ao usuário. Anotado.
3. Controle: operador que digita `/usuarios` vê "Seu perfil não tem acesso a esta tela. Se você precisa dela para trabalhar, peça a quem administra o município do seu órgão." (`e07-usuarios-por-url-com-papel-operador-390-claro.png`, `...-1280-escuro.png`): diz o que houve e o que fazer; "o município do seu órgão" soa estranho (anotado). A tela fica vazia abaixo do aviso, aceitável.
4. Cadeia que morre: `e07-sessao-encerrada-pela-administracao-390-claro.png` mostra a frase de encerrada (da E05) com ícone e texto; mesma ressalva "quando o seu cadastro muda".
5. Minha conta (`e07-depois-da-primeira-escrita-papel-operador-390-escuro.png`): lista de sessões com duas linhas iguais "Chrome em Windows" e a promessa "você continua aqui, sem precisar entrar de novo". O `qa.md` da E07 (achado 2) mostra que com token anterior à renovação o botão derruba a própria cadeia. Heurística 6 (reconhecer): sessões indistinguíveis.
6. Portão visual, item a item:
   - Alinhamento: PASS (cartões de mesma largura, 1280 e 390).
   - Espaçamento: PASS, respiro uniforme.
   - Nada fora do lugar: PASS no conteúdo. A barra de baixo a 390 corta "Mapa da cida..." (rolagem deliberada, documentada na E13). As faixas do topo e da barra no meio das capturas de página inteira são artefato do Playwright, conforme `indice.md`.
   - Hierarquia: PASS.
   - Texto: PASS, sem travessão.
   - Responsivo: 1280 e 390 provados; 320, 768 e zoom 200 não capturados.
   - Temas e estado só por cor: PASS (ícone mais texto no aviso e no selo "Esta sessão"); foco e contraste não medidos.
   - Estados: vazio e carregando não se aplicam; erro (sessão) coberto pela captura de encerrada.
   - Rafael aprova: pendente.

## Evidência

- Capturas lidas: `e07-antes-coordenadora-com-menu-usuarios-1280-claro.png`, `e07-depois-do-rebaixamento-antes-de-escrever-1280-claro.png` e `...-1280-escuro.png`, `e07-depois-da-primeira-escrita-papel-operador-390-escuro.png`, `e07-usuarios-por-url-com-papel-operador-390-claro.png` e `...-1280-escuro.png`, `e07-sessao-encerrada-pela-administracao-390-claro.png`.
- Simulado: nada; rebaixamento e encerramento feitos pelo painel real.

## Cenários positivos

- Rebaixada com a tela aberta: a próxima escrita renova e o menu passa a ser o do papel novo.
- Operador não alcança `/usuarios`.

## Cenários negativos

- Sessão encerrada pela administração: vai à entrada com a frase.
- Papel rebaixado tentando tela de administração: recusa em português.

## Tentativas de reprovar

- Procurei o rebaixado sendo derrubado para a entrada: não ocorre (renova em silêncio).
- Procurei aviso de mudança de papel: não existe.
- Procurei corte e desalinhamento a 390 px: apenas o corte deliberado da barra.
- Procurei como distinguir as sessões duplicadas: não há como.

## Achados

1. anotado: mudança de papel sem frase ao usuário (sugestão: aviso passageiro "Seu papel agora é Operador de plantão").
2. corrige antes de crescer: sessões idênticas na lista e promessa "continua aqui" que pode ser falsa (E07 achado 2 do QA, atinge a E09).
3. anotado: "o município do seu órgão" é desajeitado.

## Não verificado

- Painel que só mostra o papel novo sem escrever: a captura `depois-do-rebaixamento-antes-de-escrever` já exibe papel e menu novos, o que contradiz o texto do roteiro ("não foi recarregada"); possível efeito do polling do sino. Não esclarecido.
- 320 px, 768 px, zoom 200 por cento, leitor de tela, foco do teclado, contraste medido.

## Risco residual

Menu que muda sem explicação pode parecer defeito.

## Motivo do humano

Gatilho decidido pelo diff, na dúvida: toca fluxo de sessão e papel. Não cria tela, rota, componente nem texto. Rafael confere as capturas de papel antes e depois.
