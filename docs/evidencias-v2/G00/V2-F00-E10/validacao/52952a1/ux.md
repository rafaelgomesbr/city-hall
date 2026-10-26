---
validador: ux (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD, INFRA]
nivel_de_prova_exigido: [E2, E3a]
nivel_de_prova_obtido: [E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
Capturas em `docs/evidencias-v2/G00/validacao/52952a1/navegador/capturas/` (abaixo, `C/`), geradas por mim nesta rodada contra a API com o notificador de arquivo (ver `navegador/LEIA-ME.md`). Olhei as que cito. Diff da correção 2 lido: `RecuperarSenha.tsx` (sem relógio nem `location.assign`, foco na confirmação, `Moldura comVolta` falso no sucesso), `recuperar-regras.ts` ("Entrar com a nova senha", frase de apoio removida), `app.css` (cor do texto no hover), `comuns.tsx` (`Aviso foco`).

## Critérios verificados

1. FAIL da rodada 2 (redirecionamento automático em 2,5 s): NÃO morde. Depois de "Definir nova senha" (Enter no campo), 6 s depois a URL continua `/redefinir-senha` e a confirmação continua na tela; a ida à entrada só acontece pelo botão. Texto da tela sem "será levado", "em instantes" nem "redireciona".
2. Correção 2, foco e uma ação: foco no aviso "Senha redefinida. Entre com a nova senha." (`DIV aviso aviso--sucesso`, `tabindex=-1`, sem `role`), anel de foco visível; a tela tem UMA ação ("Entrar com a nova senha"), sem o rodapé "Voltar para a entrada" e sem a segunda frase. `C/E10-senha-redefinida-{1280,390,320}-{claro,escuro}.png`.
3. Hover do botão (achado da própria correção): texto `rgb(255,255,255)` sobre `rgb(76,29,149)` no claro e `rgb(16,21,25)` sobre `rgb(196,181,253)` no escuro, legível. `C/E10-senha-redefinida-hover-1280-{claro,escuro}.png`.
4. Pedir: "Esqueceu a senha?" alcançável pelo Tab na entrada; e-mail vazio ("Informe o seu email funcional.") e malformado ("Informe um email completo, como nome@orgao.gov.br."); a frase do enviado é IDÊNTICA para e-mail que existe e que não existe; foco vai para a confirmação; "Pedir de novo" devolve o foco ao campo de e-mail. `C/E10-pedido-formulario-*`, `C/E10-pedido-erro-vazio-{390,320}-claro.png`, `C/E10-pedido-erro-malformado-390-escuro.png`, `C/E10-pedido-enviado-*`.
5. E-mail de teste: o link chegou ao arquivo do notificador; ao abrir, o token sai da barra de endereço. Formulário, senha curta ("A senha precisa de pelo menos 12 caracteres.") e senhas diferentes ("As duas senhas precisam ser iguais."). `C/E10-redefinir-formulario-*`, `C/E10-redefinir-erro-senha-curta-{390,320}-claro.png`, `C/E10-redefinir-erro-senhas-diferentes-390-escuro.png`.
6. O mesmo link de novo: "Este link não vale mais" com a frase que manda pedir outro e o botão "Pedir um novo link". `C/E10-redefinir-link-ja-usado-*`. Sem link: "Link incompleto". `C/E10-redefinir-sem-link-{1280,390}-*`.
7. Recuperação desligada (estado de produção, resposta simulada `{ ativa: false }`): manda procurar quem administra e aponta o botão "Redefinir senha" da E09, em quatro passos. `C/E10-pedido-desligada-simulada-*`.
8. A nova senha entra (API 200).

Defeitos das rodadas anteriores: rodada 1 e 2 "a tela de sucesso some em 2,5 s" NÃO morde; rodada 2 "a tela de sucesso repete o caminho de volta" NÃO morde (uma ação); rodada 1 e 2 "recuperação desligada não refotografada" resolvido aqui por resposta simulada; "O link vale por pouco tempo" sem número e sem saída para o administrador único persistem (anotados).

Portão visual, item a item:
- Alinhamento: PASS (aviso e botão com a mesma largura dentro do cartão; o anel de foco passa 3 px para fora do aviso, é o contorno do foco, não desalinhamento).
- Espaçamento: PASS.
- Nada fora do lugar: PASS (medição sem achado em todas as capturas E10; frase longa do pedido enviado quebra em 5 linhas a 320 dentro da caixa).
- Hierarquia: PASS (título, subtítulo, aviso e ação).
- Texto: PASS (sem travessão; cada erro diz o que fazer; frase neutra igual nos dois casos).
- Responsivo: PASS em 1280, 390 e 320.
- Temas, foco, estado: PASS (anel de foco nos dois temas; aviso com ícone e texto).
- Estados: erro (vazio, malformado, curta, diferentes, link inválido, sem link, desligada) e sucesso desenhados; carregando ("Enviando", "Salvando") não capturado.
- Rafael: pendente (gatilhos).

Heurísticas: 1 (confirmação fica até a pessoa agir), 3 controle e liberdade (sem navegação imposta), 5 prevenção (erros no campo antes de enviar), 9 recuperação ("Pedir um novo link").

## Evidência

- `node $SP/val/ux/e10.mjs` (código 0), saída `$SP/val/ux/e10.log`; foco, ações e cores em `$SP/val/ux/resultados.json` (13 verificações, 0 falha).
- Capturas lidas: `E10-senha-redefinida-320-escuro.png`, `E10-senha-redefinida-hover-1280-claro.png`, `E10-pedido-enviado-320-claro.png`, `E10-redefinir-link-ja-usado-390-escuro.png`, `E10-pedido-desligada-simulada-320-claro.png`.

## Cenários positivos

- Pedir, receber o link no arquivo, definir a senha nova, entrar pelo botão, nova senha vale.

## Cenários negativos

- E-mail inexistente com a mesma frase; link reusado; sem link; senha curta e diferentes; recuperação desligada.

## Tentativas de reprovar

- Esperei 6 s na tela de sucesso (mais que o dobro do relógio antigo): não sai.
- Contei ações visíveis na tela de sucesso: uma.
- Passei o ponteiro no botão-link nos dois temas (o defeito de cor que a própria correção achou): legível.
- Procurei o foco perdido depois de enviar o pedido e de "Pedir de novo": não se perde.
- Procurei a confirmação de sucesso lida duas vezes (foco e região viva juntos): o aviso com foco não tem `role`.

## Achados

1. Anotado (fora da correção, declarado pelo implementador): depois de "Definir nova senha" com link reusado, a tela cai em "Este link não vale mais" e o foco fica em `BODY` (o aviso é `role=alert`). Dono F10-E11.
2. Anotado (persiste): "O link vale por pouco tempo" sem dizer quanto; o subtítulo "Informe o email com que você entra no sistema" continua depois do envio, quando o campo já sumiu.
3. Anotado (persiste, decisão de produto): quem é a única pessoa administradora não tem saída com a recuperação desligada (CP-19).
4. Anotado: "Repita a nova senha" aqui e "Repita a senha nova" em Minha conta e na troca obrigatória (E09).

## Não verificado

- Recuperação desligada pela API real (`RECUPERACAO_ATIVA=nao`): só por resposta simulada na tela.
- Link vencido por tempo (precisa de outra API com prazo curto); os estados "Enviando" e "Salvando".
- Firefox e WebKit; leitor de tela (CP-32).

## Risco residual

Baixo. O relógio saiu e há teste que reprova se voltar; o foco foi medido.

## Motivo do humano

Gatilhos da seção 10 disparados: tela pública (recuperação e redefinição, sem login), texto de produto (frases de `recuperar-regras.ts`, alteradas nesta correção) e componente compartilhado alterado (`Aviso` com `foco`, cor do hover em `.botao--primario` e `.botao--secundario`). Rafael lê as frases das telas `E10-*` e faz o fluxo com o notificador de arquivo (validação humana do bloco).
