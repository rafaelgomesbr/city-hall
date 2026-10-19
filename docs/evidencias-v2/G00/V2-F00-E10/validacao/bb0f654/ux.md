---
validador: ux (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
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

Pasta das capturas (geradas por mim, Chromium do Playwright, painel do SHA ligado à API real semeada com `NOTIFICADOR_ARQUIVO`): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/ux-E05-E08-E09-E10/capturas/` (abaixo, `capturas/`). 97 capturas da etapa, em 1280, 768 (desligada), 390 e 320 px, claro e escuro.

Checklist do portão visual (seção 0 de `19`), item a item, para o pedido do link e a definição da senha nova em todos os estados:

| Item | Resultado | Prova |
| --- | --- | --- |
| Alinhamento | OK: moldura e cartão iguais nas duas telas; passos numerados alinhados | `folhas/e10-a.png` a `folhas/e10-d.png`, `folhas/e10-1280.png` |
| Espaçamento | OK: respiro igual entre aviso, texto, passos e botão | idem |
| Nada fora do lugar | OK: medidor de geometria com ZERO achados nas 97 capturas (inclui alvo de toque de 44 px até 600 px: link "Esqueceu a senha?" e "Voltar para a entrada" passam) | `geometria.json` (chaves `E10-*`) |
| Hierarquia | OK: título, subtítulo, rótulo, dica, erro e ação; o subtítulo muda com o estado ("Link incompleto", "Este link não vale mais", "Sua senha foi alterada") | `E10-definir-*` |
| Texto | OK: frases neutras e acionáveis ("Se existir conta com esse email, enviamos um link ...", "Peça um novo link.", "Aguarde alguns minutos e tente de novo.", os quatro passos de quem administra apontando o botão Redefinir senha da E09); a mensagem do servidor nunca vai para a tela; sem travessão | `saidas/e10.txt` |
| Responsivo | OK em 1280, 768, 390 e 320 | capturas |
| Temas, foco, contraste, cor | OK: claro e escuro; foco visível (anel) no campo, no botão e no link, ordem do Tab campo, botão, voltar; avisos com ícone e texto | `E10-foco-botao-390-escuro.png`, `saidas/sonda-foco.txt` |
| Estados vazio, erro, carregando | OK: verificando, vazio, formato, enviado, excesso, servidor, rede, desligada (leitura e 503), sem link, curta, diferentes, rede, servidor, link já usado, sucesso | lista em "Evidência" |

Heurísticas: visibilidade (verificando antes do formulário; enviado com o que fazer se não chegar), correspondência (sem código de erro), prevenção e recuperação de erro (erro no campo certo, com o foco nele; link inválido com "Pedir um novo link"; desligada com o caminho alternativo), controle (sucesso sem redirecionamento automático, um só botão "Entrar com a nova senha"), consistência com a entrada: OK.

## Evidência

- API real na 3791 (PGlite semeado, `NOTIFICADOR_ARQUIVO` num arquivo do scratchpad) e painel construído do SHA na 4791; derrubados no fim, arquivo de notificação no scratchpad.
- Roteiro `capturar.mjs e10`: estados de espera e falha por interceptação de rota (429, 500, aborto de rede, 503 `recuperacao_desligada`, `{ ativa: false }`); o sucesso usa o link REAL lido do arquivo do notificador, para uma pessoa criada pela API. Saída `saidas/e10.txt`; console `console-e10.txt`: só os status provocados (429, 500, ERR_FAILED, 503, 401 do link usado).
- Sonda de teclado `sonda-foco.mjs` (`saidas/sonda-foco.txt`).
- Capturas: `E10-entrada-esqueceu-{390,320}-*`, `E10-pedido-{normal,erro-vazio,enviado}-{1280,390,320}-*`, `E10-pedido-{erro-formato,excesso,servidor,rede,verificando}-{1280,390}-*`, `E10-pedido-desligada-pelo-pedido-{1280,390,320}-*`, `E10-pedido-desligada-{1280,768,390,320}-*`, `E10-definir-sem-link-{1280,390,320}-*`, `E10-definir-{normal,sucesso,link-ja-usado}-{1280,390,320}-*`, `E10-definir-erro-{curta,diferentes,servidor,rede}-{1280,390}-*`, `E10-foco-botao-390-escuro.png`. Olhadas pelas folhas `folhas/e10-a.png`, `e10-b.png`, `e10-c.png`, `e10-d.png`, `e10-1280.png` e em tamanho real o foco.

## Cenários positivos

1. "Esqueceu a senha?" leva ao pedido; e-mail de conta existente: frase neutra de envio, foco na confirmação (medido: `aviso aviso--sucesso`).
2. O link real do notificador abre "Nova senha" e o token some da barra (URL medida: `/redefinir-senha` sem `?token`).
3. Senha válida: "Senha redefinida. Entre com a nova senha." com o foco nela e um só botão "Entrar com a nova senha"; a tela não redireciona sozinha.
4. Recuperação desligada: os quatro passos para quem administra, a 320 px sem corte.

## Cenários negativos

1. E-mail vazio e torto: erro no campo, com ícone, e frase que diz o que digitar ("Informe um email completo, como nome@orgao.gov.br.").
2. Senha curta e senhas diferentes: erro no campo certo.
3. 429, 500 e rede no pedido e na definição: frases próprias, nunca a do servidor.
4. O MESMO link depois de usado: "Este link de redefinição não vale mais. Ele pode ter vencido, já ter sido usado ou ter sido trocado por um pedido mais novo. Peça um novo link." com "Pedir um novo link".
5. Endereço sem link: "Link incompleto" com o caminho de pedir outro.

## Tentativas de reprovar

- Procurei rótulo de botão cortado a 320 px ("Enviar link de redefinição", "Entrar com a nova senha", "Pedir um novo link"): cabem; medidor sem achado.
- Procurei texto do servidor vazando para a tela: troquei o corpo de 429, 500 e 503 por textos meus; a tela mostrou só as frases de `recuperar-regras.ts`.
- Procurei o redirecionamento automático do sucesso (FAIL da rodada 2): esperei 1,5 s, a tela continua na confirmação com foco nela.
- Procurei foco perdido: depois do link já usado o foco fica em `BODY` (o aviso é `role="alert"`); já registrado pelo implementador como pendência (F10-E11, `PENDENCIAS.md` seção 12). Anotado.
- Procurei contradição entre texto e tela: no estado "enviado" o subtítulo continua "Informe o email com que você entra no sistema" sem campo na tela (achado 1).

## Achados

1. **Anotado (texto).** No estado "enviado" o subtítulo segue pedindo o e-mail ("Informe o email com que você entra no sistema") quando não há mais campo; um subtítulo de estado, como as outras telas já fazem, seria coerente. `E10-pedido-enviado-320-escuro.png`.
2. **Anotado (foco, já registrado).** Link que não vale mais e recuperação desligada na definição deixam o foco em `BODY`; o anúncio é pela região `role="alert"`.
3. **Anotado (estilo da casa).** "email" sem hífen em todo o fluxo (o VOLP registra "e-mail"); é o padrão do painel inteiro, não da etapa.

## Não verificado

- O cabeçalho `Referrer-Policy: no-referrer` e `X-Robots-Tag` na Vercel (o `vite preview` não aplica o `vercel.json`); é da dimensão de infraestrutura, e a prova em produção fica para o primeiro deploy.
- Envio real de e-mail (CP-19, aberto) e a aparência da mensagem no cliente de e-mail.
- Link vencido por relógio (mesma frase do link usado pela regra; não provocado aqui).
- Leitor de tela, zoom de 200 por cento, Firefox e WebKit.
- O modo de demonstração (`pedido-modo-demonstracao`) não foi reproduzido: não construí o painel em modo local.

## Risco residual

Baixo. O fluxo é coerente, sem corte, nos dois temas e nas quatro larguras; o que sobra é texto menor (achado 1) e o foco nos estados de link inválido, já registrado.

## Motivo do humano

Gatilhos visuais pelo diff (seção 10 de `28`): **tela pública** (`/recuperar-senha` e `/redefinir-senha` sem login), **texto de produto** (todas as frases de `recuperar-regras.ts`), **nova jornada relevante** (seção 27 do e2e), **fluxo de erro crítico** (falha de envio e link inválido) e, na dúvida, **mudança grande de UX** (`RecuperarSenha.tsx` reescrita em peças). E4 visual do Rafael, nestas capturas: `capturas/E10-pedido-normal-390-escuro.png`, `capturas/E10-pedido-enviado-320-escuro.png`, `capturas/E10-pedido-erro-formato-390-escuro.png`, `capturas/E10-pedido-excesso-390-claro.png`, `capturas/E10-pedido-desligada-1280-escuro.png`, `capturas/E10-pedido-desligada-320-claro.png`, `capturas/E10-definir-normal-390-claro.png`, `capturas/E10-definir-erro-diferentes-390-claro.png`, `capturas/E10-definir-link-ja-usado-390-escuro.png`, `capturas/E10-definir-sem-link-320-escuro.png`, `capturas/E10-definir-sucesso-390-claro.png`. A "Validação humana" original (fazer o fluxo com o notificador e conferir que a produção segue desligada) tem parte objetiva coberta por outras dimensões.
