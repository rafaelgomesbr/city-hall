---
validador: ux
modelo: claude-sonnet-5-5
etapa: V2-F00-E10
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
Capturas do agente independente em `<scratchpad>/web/capturas/` (scratchpad = `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad`), nome `E10-<tela>-<largura>-<tema>.png`. Li as imagens citadas. Sem shell nesta sessão (sem `git diff`). A tela de "recuperação desligada" não foi fotografada nesta rodada (API de teste com recuperação ligada); usei a captura da rodada 1 só como registro.

## Critérios verificados

Rodada 1: PASS. Reteste agora em 320 px e nos dois temas, mais a tela de sucesso que na rodada 1 só existia na captura do implementador.

1. Pedido: `E10-pedido-formulario-320-claro.png`: título "Redefinir senha", rótulo visível "Email funcional", dica "O email da sua conta. Se ele estiver cadastrado, o link chega nessa caixa de entrada.", botão "Enviar link de redefinição" inteiro e "Voltar para a entrada". PASS.
2. Enviado: `E10-pedido-enviado-390-escuro.png`: "Se existir conta com esse email, enviamos um link de redefinição. Confira sua caixa de entrada." (resposta neutra, igual para e-mail existente ou não), dica de spam, "Pedir de novo". PASS.
3. Link vencido, usado ou trocado: `E10-redefinir-link-vencido-320-escuro.png`: "Este link de redefinição não vale mais. Ele pode ter vencido, já ter sido usado ou ter sido trocado por um pedido mais novo. Peça um novo link." com botão "Pedir um novo link". Diz o que fazer. PASS.
4. Link válido e erro de campo: `E10-redefinir-link-valido-320-claro.png` (dois campos rotulados, dica de 12 caracteres, botão "Definir nova senha") e `E10-redefinir-erro-senha-curta-390-claro.png`: o campo marcado com borda vermelha, anel de foco, ícone e texto "A senha precisa de pelo menos 12 caracteres." e o que a pessoa digitou preservado (cinco pontos nos dois campos). PASS.
5. Sucesso: `E10-redefinir-pronto-1280-claro.png`: "Senha redefinida. Entre com a nova senha." com ícone, "Você será levado para a entrada em instantes" e botão "Ir para a entrada". A tela some sozinha em cerca de 2,5 s; há botão e link para quem lê devagar. PASS com anotação.
6. Sem link: `E10-redefinir-sem-link-390-claro.png`: "Este endereço não traz um link de redefinição. Abra o link completo que chegou no seu email, ou peça um novo." com "Pedir um novo link". PASS.

Portão visual (seção 0 de `19`), item a item:
- Alinhamento: PASS (logo, título, cartão e link centralizados com a mesma largura em 320, 390 e 1280).
- Espaçamento: PASS, respiro igual; nenhum bloco grudado.
- Nada fora do lugar: PASS (botões inteiros a 320, frases quebram dentro do cartão, sem rolagem horizontal).
- Hierarquia: PASS.
- Texto: PASS, sem travessão, sem erro de grafia; "por pouco tempo" continua vago (anotado).
- Responsivo: 320, 390 e 1280 vistos; 768 não é dessa tela e não abri. Zoom de 200 por cento não capturado.
- Temas, foco, contraste: claro e escuro vistos; foco visível no campo com erro; contraste não medido por mim; estado nunca só por cor.
- Estados: normal, vazio (e-mail em branco, capturado pelo outro agente, não aberto), erro, enviado, sucesso, link inválido, sem link. Carregando e erro de rede só nas capturas do implementador (não reabertas). Recuperação desligada: não fotografada nesta rodada.
- Rafael aprova: pendente.

Heurísticas de Nielsen: 1 (estado: enviado, sucesso e redirecionamento dito), 2 (mundo real: "caixa de entrada", "spam"), 3 (controle: "Pedir de novo", "Voltar para a entrada"), 5 (prevenção de erro: dica antes do campo), 6 (reconhecer: rótulos visíveis), 9 (recuperar: cada erro diz o que fazer).

## Evidência

Capturas lidas (em `<scratchpad>/web/capturas/`): `E10-pedido-formulario-320-claro.png`, `E10-pedido-enviado-390-escuro.png`, `E10-redefinir-link-vencido-320-escuro.png`, `E10-redefinir-link-valido-320-claro.png`, `E10-redefinir-erro-senha-curta-390-claro.png`, `E10-redefinir-pronto-1280-claro.png`, `E10-redefinir-sem-link-390-claro.png`. Verificações do fluxo (três pedidos, link trocado, mesmo link duas vezes, link vencido de verdade com 5 minutos): `scratchpad/web/RELATORIO.md`, seção T5, lidas, não repetidas.

## Cenários positivos

- Pedido, link do arquivo do notificador, senha nova, "Senha redefinida", entrada.
- Resposta idêntica para e-mail existente e inexistente, na tela e na API (segundo o outro agente).

## Cenários negativos

- E-mail vazio e malformado: marcação do campo (outro agente).
- Senha curta e senhas diferentes: erro no campo certo.
- Link usado, vencido, trocado por mais novo e ausente: tela própria.

## Tentativas de reprovar

- Procurei formulário que falharia com o serviço desligado: na rodada 1 não aparecia; nesta rodada não foi reaberto.
- Procurei frase que revele se a conta existe: neutra em todas as telas vistas.
- Procurei texto cortado, botão grudado ou rolagem horizontal a 320 e 390: nada.
- Procurei valor digitado perdido após erro: preservado.
- Procurei duas saídas redundantes na tela de sucesso: "Ir para a entrada" e "Voltar para a entrada" convivem na mesma tela, repetidas (anotado, não bloqueia).
- Procurei travessão e grafia: nada.

## Achados

1. Anotado: sem saída para quem é a única pessoa administradora e esquece a senha (depende do CP-19).
2. Anotado: "O link vale por pouco tempo" sem número; a tela de sucesso some em 2,5 s e repete o caminho de volta.
3. Anotado: a tela de recuperação desligada, estado de produção, não foi refotografada nesta rodada.

## Não verificado

- Tela "recuperação desligada" (produção) no SHA.
- 429, rede caída, estados do implementador (carregando, erro de rede), zoom de 200 por cento, leitor de tela, contraste medido.
- Li 7 imagens desta etapa, de 938 do lote.

## Risco residual

Em produção a recuperação segue desligada; quem esquece a senha depende de uma pessoa.

## Motivo do humano

Gatilhos da seção 10: tela pública (recuperação de senha), texto de produto novo e fluxo de erro crítico. Rafael lê as frases e faz o fluxo com o notificador de arquivo.
