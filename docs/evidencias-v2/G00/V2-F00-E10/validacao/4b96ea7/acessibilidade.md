---
validador: acessibilidade
modelo: claude-sonnet-5-5
etapa: V2-F00-E10
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [UI, A11Y, AUTH]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: media
humano_necessario: sim
escalar: nenhum
---
Escopo de acessibilidade da E10: `RecuperarSenha.tsx` (pedido, enviado, nova senha, link inválido ou usado, sucesso, recuperação desligada) e o ponto de entrada em `Entrar.tsx` ("Esqueceu a senha?"). Esta etapa não teve relatório de acessibilidade na rodada 1; tudo é prova nova. Nada herdado. SHA 4b96ea7, API real na porta 3891 (com `NOTIFICADOR_ARQUIVO`, para ler o link), painel do SHA na 4891, Chromium. `axe` ausente (não existe em `node_modules`; nada instalado). Pasta: `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/a11y/` (`a11y/`). A tela "recuperação desligada" não foi exercitada (a API de teste tem a recuperação ligada); ver "Não verificado".

## Critérios verificados

1. Testes estáticos e de tela (E1): `recuperar-senha.test.ts`, `recuperar-senha-e-sessao.test.ts`, `acessibilidade.test.ts`, `formularios.test.ts`, `foco.test.ts` dentro dos 15 arquivos de painel, 260 de 260 (`a11y/vitest-15-limpo.txt`); `acessibilidade.test.ts` 21 de 21.
2. Rótulos e campos (1.3.1, 3.3.2, 1.3.5): "Email funcional" é `<label for="recuperar-email">` visível, `type="email"`, `autocomplete="email"`; "Nova senha" e "Repita a nova senha" com `for`/`id` e `autocomplete="new-password"` (`a2.log`). Placeholder não é rótulo aqui. Zero campo sem rótulo nas três telas (`a1.log`).
3. Erro de formulário (3.3.1, 3.3.3, 4.1.3, 2.4.3), medido no DOM (`a2.log`):
   - e-mail vazio: `aria-invalid="true"`, `aria-describedby` apontando para `campo__erro` com `role="alert"` ("Informe o seu email funcional."), foco no campo de e-mail.
   - senha curta: foco em `nova-senha`, erro com `role="alert"` ligado ao campo ("A senha precisa de pelo menos 12 caracteres.") junto com a dica.
   - senhas diferentes: foco em `repetir-senha`.
4. Resposta neutra do pedido (4.1.3): "Se existir conta com esse email, enviamos um link..." sai em `.aviso--sucesso` com `role="status"`, inserido já com o texto (`a2.log`). Frase idêntica para e-mail existente ou não (QA, outro agente). Ícone mais texto.
5. Link inválido ou já usado, medido ao ENVIAR a nova senha com o mesmo link (`a3.log`): `aviso--perigo` com `role="alert"`, texto "Este link de redefinição não vale mais...". Contraste do perigo 4,75:1 no claro e 6,59:1 no escuro (mesmo token do E05).
6. Contraste AA, claro e escuro, 1280, 390 e 320 px, de `/recuperar-senha`, `/redefinir-senha` sem link e da tela de link usado (`a1.log`, `a3.log`): zero texto abaixo de AA (a "sigla" DC e o avatar são falso positivo de gradiente, medidos à mão acima de 6:1), zero controle sem nome, zero `id` duplicado, cabeçalhos sem salto (`h1` "Redefinir senha", "Nova senha"), alvos de 44 px ou mais na visão móvel (botão 44 px, link "Voltar").
7. Teclado (2.1.1, 2.4.7): "Esqueceu a senha?" é um link alcançável por Tab na ordem email, senha, Entrar, Esqueceu, Quero conhecer (QA e `web` T5); formulário inteiro por Tab e Enter; anel de foco de duas camadas nos dois temas (6,61:1 e 6,75:1), `outline` em Alto Contraste (`a4.log`).
8. Reflow (1.4.10): 640x450 css a 2x (zoom de 200 por cento) e 320 css a 4x das três telas, sem rolagem horizontal da página (`a1.log`).
9. Título e idioma (2.4.2, 3.1.1): `<title>` "Recuperar senha · Defesa Civil 360", `lang="pt-BR"`; o título da aba muda por tela.
10. Token fora da barra de endereço (`history.replaceState`): conferido por outro agente (T5); não tem aspecto de acessibilidade além do que está acima.

## Evidência

`a11y/a2.log` (blocos "E10 Entrar e Recuperar senha" e "E10 Redefinir senha com link"), `a11y/a3.log` (bloco "E10 link já usado (envio) e redirecionamento"), `a11y/a1.log`, `a11y/a4.log`. Capturas: `a11y/capturas/e10-recuperar-enviado.png`, `e10-sucesso.png`, `e10-link-usado.png`, `e10-link-usado-enviado.png`; do outro agente `web/capturas/E10-pedido-*`, `E10-redefinir-*` (1280, 390, 320, dois temas), lidas para alinhamento.

## Cenários positivos

Pedido com e-mail válido leva à frase neutra; o link do arquivo do notificador abre a tela de nova senha; senha curta e senhas diferentes devolvem o foco ao campo certo; a senha boa mostra "Senha redefinida. Entre com a nova senha." com um link "Ir para a entrada".

## Cenários negativos

E-mail vazio e malformado, senha curta, senhas diferentes e link já usado: cada um com erro anunciável. Link usado de novo cai em `aviso--perigo` com `role="alert"`.

## Tentativas de reprovar

- Medi quanto tempo a confirmação de sucesso fica na tela antes de a página mudar sozinha: 2158 ms medidos (`a2.log`: "redireciona sozinho para /entrar após (ms): 2158"), constante `ESPERA_ATE_A_ENTRADA_MS = 2500` em `RecuperarSenha.tsx:217` e `window.location.assign("/entrar")` em `:361`. Achado 1.
- Procurei na entrada, depois do redirecionamento, alguma frase que repita que a senha foi redefinida: nenhuma (`a3.log`, FALHA "a entrada ... repete a confirmação"). A única confirmação desaparece em 2,5 s.
- Procurei região viva pré-montada nos avisos: o aviso entra com o texto dentro (achado 3).
- Procurei o foco depois de enviar o pedido, depois do sucesso e depois do link usado: nos três o foco vai a `BODY` (o botão que enviou desapareceu) (achado 2).
- Procurei `main` nas três telas: zero em todas (achado 4).
- Procurei contraste de estados raros (link usado, perigo) nos dois temas: ok.
- Tentei cobrir a tela de recuperação desligada: não deu (ver "Não verificado").

## Achados

1. **FAIL (2.2.1 Tempo ajustável, ver também a falha F40/F41 do W3C para redirecionamento com limite de tempo)**: depois de redefinir a senha, a tela se troca sozinha em cerca de 2,2 a 2,5 s por `window.location.assign("/entrar")`, sem opção de desligar, ajustar ou estender, e a entrada que carrega depois não repete que a senha foi redefinida. Quem lê devagar, quem usa leitor de tela (o anúncio de "Senha redefinida. Entre com a nova senha." leva mais que 2 s junto com o resto da tela) ou quem tem deficiência cognitiva perde a única confirmação; o botão "Ir para a entrada" existe, mas some junto com a página. Reprodução: `a11y/a2.log` (linha "redireciona sozinho ... 2158") e `a11y/a3.log` (a entrada não contém "redefinid"). Conserto: remover o redirecionamento automático e deixar só o botão "Ir para a entrada" (foco no aviso), ou, se o produto quiser o redirecionamento, passar a confirmação para a entrada como aviso e dar controle para parar a contagem.
2. corrige antes de crescer (dono F10-E11, "foco no título"): depois do envio do pedido, do sucesso e do link inválido o foco fica em `BODY` (o botão que enviou some ou o formulário é trocado), então teclado e leitor de tela recomeçam do topo (2.4.3). Reprodução: `a2.log` ("Recuperar enviado: foco", "Redefinir sucesso: foco") e `a3.log` ("link já usado ... foco BODY"). O tratamento de erro de campo, em contraste, leva o foco ao campo certo.
3. corrige antes de crescer (dono F10-E11): o aviso de sucesso (`status`) e o de link inválido (`alert`) entram no DOM com o texto já dentro; a anunciação de região inserida com conteúdo não é garantida (4.1.3). Sem leitor de tela não declaro falha.
4. anotado, pré-existente: as três telas (`/recuperar-senha`, `/redefinir-senha` e a entrada) não têm landmark `main` (landmarks 0 em `a1.log`). Telas curtas, 2.4.1 se cumpre por outro meio, mas é a base para anúncio de rota.

## Não verificado

- Leitor de tela real (NVDA, JAWS, VoiceOver, TalkBack): nenhum.
- Estado "recuperação desligada" (produção, `RECUPERACAO_ATIVA=nao`): não exercitado no navegador (a API de teste tem a recuperação ligada; uma segunda API com a flag desligada não foi subida por eu me limitar a um par de portas). A prova dele é o teste `recuperar-senha.test.ts` e os testes de API, não acessibilidade em tela. Capturas do outro agente também não o cobrem.
- Link vencido de verdade (5 minutos) e três pedidos seguidos: cobertos pelo outro agente em T5, fora desta dimensão.
- Firefox e WebKit nas minhas sondas de foco; o outro agente repetiu T5 nos três motores com o mesmo resultado funcional.
- Declaração de acessibilidade e eMAG: fora do escopo.

## Risco residual

Redirecionamento automático que apaga a confirmação em 2,5 s; foco em `BODY` depois dos envios; anúncio das regiões vivas inserido não provado em leitor de tela.

## Motivo do humano

Leitor de tela real (CP-32) para ouvir a ordem do que é dito ao pedir o link, ao redefinir (e se a frase de sucesso chega ao fim antes do redirecionamento) e ao cair em link inválido.
