---
validador: ux
modelo: claude-sonnet-5-5
etapa: V2-F00-E08
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [UI, AUTH, API]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
Capturas do agente independente em `<scratchpad>/web/capturas/` (scratchpad = `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad`), nome `E08-<tela>-<largura>-<tema>.png`. Li as imagens citadas. Sem shell nesta sessão (sem `git diff`); o escopo vem do dossiê (a etapa só esconde o cartão "Ofícios de encaminhamento" de quem não tem a ação e recorta o sino).

## Critérios verificados

Rodada 1: PASS, com dois defeitos anteriores à etapa (sino cortado a 390 px e 403 de `/ocorrencias/devolvidas` para o operador). Reteste e caça a regressão.

1. Dossiê do agente sem o cartão de ofícios: `E08-agente-dossie-sem-oficios-1280-claro.png` e `E08-agente-dossie-sem-oficios-390-escuro.png`: nenhum cartão "Ofícios de encaminhamento", nenhuma faixa de erro, sem buraco; a coluna fecha em "Providências encaminhadas" e a linha do tempo mostra o ofício emitido como evento (órgão e número "000001/2026"), dado que vem da trilha da própria ocorrência da equipe dele. Contraste com a coordenadora (`E08-coordenadora-dossie-com-oficios-1280-claro.png`): ela vê "Ofícios de encaminhamento" com "000001/2026", "Não enviado por email", "Abrir ofício" e "Enviar por email". A ausência é a resposta certa para quem nunca consulta ofício. PASS.
2. Sino do agente: `E08-agente-sino-aberto-390-escuro.png`: selo "2", dois avisos da equipe dele ("Prazo de atendimento vencido" e "Vistoria recebida do campo", ambos do 000474/2026), "Marcar como lido" e "Marcar como lidos os 2 desta lista" coerentes com o selo. O painel agora fica inteiro dentro da tela a 390 px (era o defeito anterior à etapa, consertado pela correção da E09). PASS.
3. 403 de devolvidas para o operador: consertado pela correção da E09 (a tela só pede a lista a quem pode); o outro agente não viu 403 de ofício nem de devolvidas na rede do agente e do operador.

Portão visual (seção 0 de `19`), item a item, sobre a tela que a etapa tocou (dossiê):
- Alinhamento: PASS (cartões e colunas na grade, 1280 e 390).
- Espaçamento: PASS, com bolsão de altura em "Ver também" (estado vazio "Nada relacionado" em cartão alto), anotado.
- Nada fora do lugar: PASS no dossiê e no sino. Em "Providências encaminhadas" a 390 a tabela rola na lateral (coluna cortada), rolagem declarada e anterior.
- Hierarquia: PASS.
- Texto: PASS, sem travessão; a etapa não cria texto novo.
- Responsivo: 1280 e 390 vistos; 320 e 768 capturados pelo outro agente, não abertos. Zoom de 200 por cento não capturado.
- Temas, foco, contraste: claro e escuro; contraste não medido por mim.
- Estados: vazio ("Nenhuma fotografia foi anexada", "Nada relacionado") e erro (acesso negado, rodada 1) desenhados.
- Rafael aprova: não exigido (sem gatilho visual, ver Motivo do humano).

Heurísticas de Nielsen: 1 (estado: selo igual à lista), 5 (prevenção de erro: o cartão que daria 403 não aparece), 8 (minimalismo: só o que o papel usa), 10 (ajuda: a recusa por URL de tela sem acesso diz o que fazer, anotada na rodada 1).

## Evidência

Capturas lidas (em `<scratchpad>/web/capturas/`): `E08-agente-dossie-sem-oficios-1280-claro.png`, `E08-agente-dossie-sem-oficios-390-escuro.png`, `E08-agente-sino-aberto-390-escuro.png`, `E08-coordenadora-dossie-com-oficios-1280-claro.png`, `E08-coordenadora-sino-aberto-390-claro.png`. Relatório do outro agente: `scratchpad/web/RELATORIO.md`, seção E08.

## Cenários positivos

- Agente abre o dossiê da própria equipe sem erro e sem o cartão.
- Coordenadora vê o cartão no mesmo dossiê, com os botões de abrir e enviar.
- Sino do agente com selo e lista iguais; Esc fecha (outro agente).

## Cenários negativos

- Ofício emitido e agente na mesma ocorrência: a tela não pede `/oficios` (sem 403 na rede, segundo o outro agente).
- Agente em tela de administração por URL: recusa em português (rodada 1; não repeti).

## Tentativas de reprovar

- Procurei faixa de erro, cartão vazio ou rastro do ofício no dossiê do agente em 1280 e 390: nada.
- Procurei diferença entre o selo e a lista do sino: nenhuma.
- Procurei texto cortado no sino a 390: não há mais.
- Procurei o alvo de 24 px que o outro agente listou ("Corrigir a coordenada"): ele existe, mas está na tela Ocorrência, no cartão "Coordenada no mapa" (`E08-coordenadora-dossie-com-oficios-1280-claro.png` mostra o link nesse cartão; a captura 390 do sino aberto só o tem como pano de fundo), não no sino. Não é do que a etapa mudou (a etapa só esconde o cartão de ofícios); botão de texto anterior ao lote. Decisão: achado "corrige antes de crescer", dono provável o componente de botão de texto ou a F10, não conta contra a E08.
- Procurei travessão e grafia: nada.

## Achados

1. Corrige antes de crescer: "Corrigir a coordenada" é um botão de texto de 24 px de altura a 390 px (tela Ocorrência). Dono: componente `botao-texto` (F10). Não bloqueia a E08.
2. Anotado: "Ver também" com bolsão de espaço quando vazio; tabelas de "Meu trabalho" do agente a 390 px cortam colunas e partem o endereço por palavra (anterior, rolagem declarada).
3. Observação para a dimensão de API (fora do que eu posso provar): o outro agente relatou, uma vez, `GET /avisos` do agente trazendo um aviso da Equipe Bravo (3 avisos, `naoLidos` 3) com a ocorrência da Bravo dando 404, sem reproduzir depois. Se for real é vazamento e é bloqueante para a E08 na dimensão de segurança e API; do ponto de vista da tela, o selo e a lista sempre bateram nas capturas que vi.

## Não verificado

- A anomalia intermitente do item 3: não reproduzível por mim e fora da minha dimensão.
- Painel do operador (frase de falha de devolvidas) em captura minha, ofício individual por URL do agente, 320 e 768 px abertos, zoom de 200 por cento, leitor de tela, contraste medido.
- Li 5 imagens desta etapa, de 938 do lote. Etapa de risco alto: o que não foi aberto fica sem prova de UX.

## Risco residual

Baixo para a tela: a etapa só remove um cartão. O risco real da E08 é de API (item 3 dos achados), não de interface.

## Motivo do humano

Não aplicável: o diff não cria tela, rota, componente, texto nem fluxo de erro crítico novo; nenhum gatilho da seção 10 de `28` dispara.
