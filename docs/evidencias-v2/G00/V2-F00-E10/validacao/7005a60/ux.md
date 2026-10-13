---
validador: ux
modelo: claude-sonnet-5-5
etapa: V2-F00-E10
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: gatilho visual (tela pública, texto de produto novo, fluxo de erro crítico)
---
Capturas em `<scratchpad>/g00/capturas-ux/` (prefixo `e10-`), geradas por agente de apoio com API real e painel no SHA 7005a60. "Desligada": a API foi reiniciada com `RECUPERACAO_ATIVA=nao`, fluxo real sem interceptação. A tela "Senha redefinida" some em 2,5 s e não foi capturada pelo agente de apoio; usei a do implementador, `docs/evidencias-v2/G00/V2-F00-E10/capturas/definir-sucesso-390-claro.png` (marcada "impl.", não reproduzida por mim).

## Critérios verificados

Foco: recuperação de senha com o serviço desligado; a pessoa entende o que fazer?

1. Serviço desligado: PASS. `e10-esqueci-senha-desligada-390-claro.png` e `...-1280-escuro.png`: título "Redefinir senha", subtítulo "A recuperação por email não está ligada", aviso com ícone e texto "A recuperação de senha por email não está ligada neste município", e quatro passos numerados (procurar quem administra, essa pessoa usa "Redefinir senha" na lista de Usuários, entrega da senha única, escolher senha nova na primeira entrada). Sem formulário que falharia, saída "Voltar para a entrada". Escrito do lado de quem usa, e coerente com a E09 (os passos descrevem exatamente a tela que lá existe).
2. Beco sem saída: a pessoa que é a única administradora e esquece a senha não tem a quem pedir; a tela manda procurar "coordenação ou administração". Anotado (CP-19).
3. Ligada, pedido: `e10-esqueci-senha-ligada-erro-vazio-390-claro.png`: rótulo visível "Email funcional", erro no campo com ícone "Informe o seu email funcional.", anel de foco e borda de erro, dica de que o link chega à caixa de entrada, botão "Enviar link de redefinição" cabe. Enviado: `e10-esqueci-senha-ligada-enviado-1280-claro.png`: frase neutra "Se existir conta com esse email, enviamos um link", dica de spam, "Pedir de novo". "Por pouco tempo" é vago (anotado).
4. Link novo: `e10-redefinir-senha-erro-diferentes-390-escuro.png`: erro no campo certo com ícone; os valores digitados foram preservados. Link já usado: `e10-redefinir-senha-link-ja-usado-390-claro.png`: "Este link de redefinição não vale mais. Ele pode ter vencido, já ter sido usado ou ter sido trocado por um pedido mais novo. Peça um novo link." com botão "Pedir um novo link": diz o que fazer.
5. Sucesso (impl.): `definir-sucesso-390-claro.png`: "Senha redefinida. Entre com a nova senha.", "Você será levado para a entrada em instantes", botão "Ir para a entrada". Some sozinho em 2,5 s: quem lê devagar perde a leitura, mas há o botão e o link (anotado).
6. Portão visual, item a item:
   - Alinhamento: PASS. Logo, título e cartão centralizados e com a mesma largura nas telas do fluxo.
   - Espaçamento: PASS, respiro igual.
   - Nada fora do lugar: PASS. Passos quebram linha dentro do cartão a 390 px; sem rolagem horizontal; nenhum botão cortado.
   - Hierarquia: PASS.
   - Texto: PASS. Acentuação correta, sem travessão, sem supor gênero.
   - Responsivo: 1280 e 390; 320, 768, zoom 200 não capturados.
   - Temas e cor: claro e escuro completos; ícone mais texto nos avisos; foco visível nos campos com erro; contraste não medido por mim.
   - Estados: erro (vazio, diferentes, link usado, desligada), enviado e sucesso desenhados; carregando e erro de rede só nas capturas do implementador, não reabertas.
   - Rafael aprova: pendente.

## Evidência

- Capturas lidas: `e10-esqueci-senha-desligada-390-claro.png`, `e10-esqueci-senha-desligada-1280-escuro.png`, `e10-esqueci-senha-ligada-erro-vazio-390-claro.png`, `e10-esqueci-senha-ligada-enviado-1280-claro.png`, `e10-redefinir-senha-erro-diferentes-390-escuro.png`, `e10-redefinir-senha-link-ja-usado-390-claro.png`; impl.: `definir-sucesso-390-claro.png`.
- Simulado: nada; o link foi lido do arquivo do notificador de teste.

## Cenários positivos

- Pedido, link no arquivo do notificador, nova senha, redefinição.
- Serviço desligado: tela de instrução.

## Cenários negativos

- E-mail em branco, senhas diferentes e link já usado.

## Tentativas de reprovar

- Procurei formulário que falharia com o serviço desligado: não aparece.
- Procurei frase que revele se a conta existe: neutra.
- Procurei texto cortado, botão grudado ou rolagem horizontal a 390 px: nada.
- Procurei como a única administradora recupera a senha: sem caminho na tela.

## Achados

1. anotado: sem saída para quem é a única pessoa administradora (depende do CP-19).
2. anotado: "por pouco tempo" sem número; a tela de sucesso some em 2,5 s.
3. anotado: erros de rede e de servidor só nas capturas do implementador.

## Não verificado

- Tela de sucesso no navegador por mim (tela efêmera), links vencidos por relógio, 429, rede caída, 320 px, 768 px, zoom 200 por cento, leitor de tela, contraste medido.

## Risco residual

Em produção a recuperação segue desligada; quem esquece a senha depende de uma pessoa.

## Motivo do humano

Gatilhos disparados pelo diff: tela pública, texto de produto novo e fluxo de erro crítico. Rafael lê as frases (E4) e faz o fluxo com o notificador de arquivo.
