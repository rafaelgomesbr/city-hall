---
validador: ux
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
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

Capturas minhas, Chromium do Playwright, painel construído do SHA nos modos API e local, ligado à API real do SHA (PGlite semeado, `NOTIFICADOR_ARQUIVO` num arquivo do scratchpad, recuperação ligada como no desenvolvimento). Links de redefinição REAIS lidos do arquivo do notificador. Pasta: `docs/evidencias-v2/G00/V2-F00-E10/validacao/4ce0433/capturas/` (abaixo, `capturas/`), 128 arquivos `ux-*`, 1280, 390 e 320 px, claro e escuro; olhados diretamente ou por folha de contato.

| Estado de `RecuperarSenha.tsx` pedido pela etapa | Resultado | Prova |
| --- | --- | --- |
| Pedido: normal, vazio, formato | OK | "Informe o seu email funcional." com o foco de volta no campo; "Informe um email completo, como nome@orgao.gov.br.". `capturas/ux-pedido-normal-*`, `ux-pedido-erro-vazio-*`, `ux-pedido-erro-formato-*` |
| Resposta neutra igual para e-mail existente ou não | OK | texto da tela idêntico para `ninguem-mesmo@exemplo.gov.br` e para a conta da Simone (comparação de texto: `true`); foco na confirmação. `capturas/ux-pedido-enviado-{1280,390,320}-*` |
| Verificando, enviando, limite (429), sem rede, falha do servidor | OK | frases que dizem o que fazer ("Muitos pedidos em pouco tempo. Aguarde alguns minutos...", "Sem conexão com o servidor. O que você preencheu não foi enviado..."). `capturas/ux-pedido-verificando-*`, `ux-pedido-enviando-*`, `ux-pedido-erro-excesso-*`, `ux-pedido-erro-rede-*`, `ux-pedido-erro-servidor-*` |
| Recuperação desligada manda procurar quem administra e aponta o botão da E09 | OK | quatro passos, "usa o botão Redefinir senha"; pela leitura e pelo 503 do pedido e da senha nova. `capturas/ux-pedido-desligada-*`, `ux-pedido-desligada-pelo-pedido-*`, `ux-definir-desligada-{1280,390,320}-*` |
| Token sai da barra de endereço | OK | depois de abrir o link real, a URL é `http://localhost:4891/redefinir-senha` (log `E10 token some da barra: true`) |
| Senha curta e senhas diferentes, cada uma no campo certo | OK | `capturas/ux-definir-erro-curta-*`, `ux-definir-erro-diferentes-{1280,390,320}-*` |
| Sucesso sem ida automática, foco na confirmação, ação única | OK | "Senha redefinida. Entre com a nova senha." com foco (anel visível) e só "Entrar com a nova senha"; 5 s depois a URL continua `/redefinir-senha`. `capturas/ux-definir-sucesso-{1280,390,320}-*` |
| Link já usado, inventado: mesma frase que manda pedir outro | OK | texto idêntico (comparação `true`): "Este link de redefinição não vale mais. Ele pode ter vencido, já ter sido usado ou ter sido trocado por um pedido mais novo. Peça um novo link.". `capturas/ux-definir-link-ja-usado-{1280,390,320}-*` |
| Endereço sem link | OK | "Este endereço não traz um link de redefinição...". `capturas/ux-definir-sem-link-*` |
| Salvando, rede, servidor, limite na senha nova | OK | `capturas/ux-definir-salvando-*`, `ux-definir-erro-rede-*`, `ux-definir-erro-servidor-*`, `ux-definir-erro-excesso-*` |
| Alvo de toque do "Esqueceu a senha?" | OK | link com foco e caixa de 44 px. `capturas/ux-entrada-esqueceu-a-senha-*` |
| Modo de demonstração | OK com ressalva | pedido: aviso "A recuperação de senha exige o servidor..." e botão desabilitado. Senha nova: ver Achado 1. `capturas/ux-pedido-modo-demonstracao-*`, `ux-definir-modo-demonstracao-*`, `ux-pedido-modo-demonstracao-enviou-*`, `ux-definir-modo-demonstracao-enviou-*` |
| Portão visual (alinhamento, nada cortado, temas, contraste por tokens, estado com ícone e texto) | OK | medição sem rolagem horizontal e sem elemento além da janela em todas as capturas (`saidas/capturas.log`); a 320 px "Enviar link de redefinição" e "Pedir um novo link" cabem no botão; sem travessão em `recuperar-regras.ts` e `RecuperarSenha.tsx` (`grep`: 0) |

Itens do "Motivo do veredito" da rodada 4 que tocam a tela: o FAIL foi a corrida da redefinição pelo link contra a troca em voo (QA), não visível em tela. A parte visível do conserto (migração 051: link pendente morre com a credencial) foi conferida: pedi o link do Tarcísio pela rota, o coordenador de Vale Fundo redefiniu a senha dele, e o link aberto em seguida mostra a frase do link que não vale mais; a senha tentada pelo link não entra (`POST /auth/entrar` 401 `credenciais`). `capturas/ux-definir-link-morto-pela-redefinicao-{1280,390}-*`. Consertado no que esta dimensão alcança.

## Evidência

- Roteiros `e10.mjs` e `e10b.mjs` no diretório de trabalho `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L06-ux/`; saídas `saidas/e10.txt` e `saidas/e10b.txt` (código 0), `saidas/capturas.log`. Os estados de espera e de falha vêm de interceptação de rota (por isso o console registra 429, 500, 503 e rede caída de propósito); console do modo local vazio.
- O arquivo do notificador foi apagado no fim (tinha links de um banco descartável).

## Cenários positivos

- Pedido, link real, senha nova, sucesso com foco e saída por um botão só.
- Desligada pela leitura, pelo 503 do pedido e pelo 503 da senha nova: a mesma orientação.

## Cenários negativos

- E-mail inexistente e existente: mesma tela.
- Link reutilizado, inventado e morto pela redefinição de quem administra: mesma frase, nada revela o motivo.

## Tentativas de reprovar

- Procurei frase que diferenciasse conta existente: nenhuma (comparação de texto).
- Abri `/redefinir-senha?token=...` no modo de demonstração e enviei: "Não foi possível redefinir a senha agora. Tente de novo em instantes." (Achado 1).
- Foco depois do "link não vale mais": `BODY` (registrado pela etapa como pendência da F10-E11; o aviso é `role="alert"`).
- 320 px em todos os estados principais: nada cortado; o e-mail digitado no campo rola dentro do próprio campo, como todo `input`.

## Achados

1. anotado: no modo de demonstração, a tela da senha nova aceita o formulário e responde "Tente de novo em instantes", o que não resolve; o pedido explica que a recuperação exige o servidor e a senha nova não. Só se chega lá digitando o endereço (no modo local não há link). `capturas/ux-definir-modo-demonstracao-enviou-390-escuro.png`.
2. anotado (pendência registrada pela etapa): foco em `BODY` quando a redefinição cai em "link não vale mais".

## Não verificado

- `Referrer-Policy` e `X-Robots-Tag` na Vercel (o `vite preview` não aplica `vercel.json`).
- Link vencido por relógio (a tela usa a mesma frase do link usado; não forcei `expira_em`).
- 768 px, zoom de 200 por cento, leitor de tela, Firefox e WebKit.

## Risco residual

Baixo para a tela. A produção segue desligada até o CP-19; o texto é tela pública e precisa do olho do Rafael.

## Motivo do humano

Validação humana da etapa (Rafael faz o fluxo com o notificador de arquivo e confere que a produção continua desligada) e gatilhos de tela pública e texto de produto (`28` seção 10). Capturas para o Rafael: `capturas/ux-pedido-normal-320-claro.png`, `capturas/ux-pedido-enviado-390-claro.png`, `capturas/ux-pedido-desligada-390-escuro.png`, `capturas/ux-definir-erro-diferentes-320-escuro.png`, `capturas/ux-definir-sucesso-1280-escuro.png`, `capturas/ux-definir-link-ja-usado-320-escuro.png` e `capturas/ux-definir-link-morto-pela-redefinicao-390-claro.png`.
