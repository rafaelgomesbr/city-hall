---
validador: qa (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [UI, AUTH, API, LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
Veredito: PASS. O defeito da rodada 2 (redirecionamento automático 2,5 s depois de redefinir) não morde: 7 s depois a tela continua em `/redefinir-senha` com a confirmação, o foco está nela, há uma ação e um texto, medido em Chromium e WebKit, 320, 390 e 1280 px, claro e escuro. Fluxo ponta a ponta com o notificador de arquivo e todos os negativos da etapa passaram; o teste de fonte morde quando o relógio volta.

Saídas em `$SP/val/qa/painel/` (abaixo, `painel/`). API própria (PGlite, `NOTIFICADOR_ARQUIVO` em `painel/notificacoes.txt`) na 47611, painel do SHA na 47612, derrubados no fim.

## Critérios verificados

| # | Critério | Resultado e prova |
| --- | --- | --- |
| 1 | Pedido responde 202 neutro; e-mail inexistente e de outro município, mesma resposta | PASS. `POST /auth/recuperar` com conta de Serra Alta, e-mail inexistente e conta de Vale Fundo: mesmo status 202 e corpo idêntico byte a byte (`painel/23-e10-sonda-*.txt`, bloco "API"); na tela, a mesma frase (e2e seção 27) |
| 2 | O link do arquivo redefine; a nova entra, a antiga não | PASS. 12 rodadas (2 motores x 3 larguras x 2 temas), cada uma com pessoa própria: link lido do notificador, senha definida pela tela, antiga 401, nova 200 |
| 3 | Token sai da barra de endereço | PASS. Depois de abrir o link, `location` é `/redefinir-senha` sem `token`, e o token não está em `history.state` |
| 4 | Estados da tela: senha curta, senhas diferentes, link usado, inventado, sem link, desligada | PASS. Curta: "A senha precisa de pelo menos 12 caracteres."; diferentes: "As duas senhas precisam ser iguais."; link usado duas vezes: recusado, manda pedir outro, e a senha da segunda tentativa não vale (401); token inventado: exatamente a mesma frase; sem link e desligada pelo e2e seção 27 (42 de 42 em Chromium) |
| 5 | Rodada 2: redirecionamento por tempo | NÃO MORDE. 7 s depois do sucesso, URL `/redefinir-senha` e o aviso na tela, nas 12 rodadas |
| 6 | Correção 2: foco na confirmação, uma ação, um texto | PASS. Foco em `DIV.aviso aviso--sucesso`, `tabindex=-1`, `role=null`; ações visíveis na tela: só "Entrar com a nova senha"; textos: "Sua senha foi alterada" (subtítulo) e "Senha redefinida. Entre com a nova senha."; nenhuma frase de ida automática; no pedido enviado o foco vai à confirmação e "Pedir de novo" devolve o foco ao campo de e-mail |
| 7 | Hover do botão legível | PASS. Claro: `rgb(255,255,255)` sobre `rgb(76,29,149)`; escuro: `rgb(16,21,25)` sobre `rgb(196,181,253)`; o e2e mede contraste >= 4,5 nos dois temas |
| 8 | Geometria a 320, 390 e 1280 | PASS. Nada fora do `.cartao__corpo`, sem rolagem horizontal, botão com 44 px |
| 9 | Produção desligada; `config.ts` recusa as combinações | PASS. `fly.toml:67` `RECUPERACAO_ATIVA = "nao"`. Sonda própria de `carregarConfig` em produção (`painel/24-e10-config.txt`): `RECUPERACAO_ATIVA=sim` sem notificador recusa ("A recuperação de senha está ligada e não tem por onde sair"); com `NOTIFICADOR_ARQUIVO` recusa ("NOTIFICADOR_ARQUIVO é canal de teste e não pode existir em produção"). `config.test.ts` 19, `recuperacao-em-producao.test.ts` 10, `recuperacao-desligada.test.ts` 3, `recuperacao.test.ts` 14, `recuperacao-sem-oraculo.test.ts` 15, todos verdes em `painel/06-test-api.txt` |
| 10 | `Referrer-Policy: no-referrer` (vercel.json) | PASS por leitura e teste: bloco `headers` com `/(recuperar-senha\|redefinir-senha)` e `recuperar-senha.test.ts` o confere. No preview local (sem esse cabeçalho) os pedidos de JS e CSS da mesma origem levam o token no Referer antes do `replaceState`; nenhum pedido à API (outra origem) o leva. O cabeçalho em produção não foi verificado por execução (ver Não verificado) |
| 11 | Regressão obrigatória | PASS. `npm run test:api` 1309 aprovados, 1 falha alheia (openssl do macOS); `npm run test --workspace @dc360/web` 665 de 665; `npm run test:e2e:api` Chromium 288 de 288 mais 64 de geometria, zero erro de console; `npm run test:scripts` 260 de 260 |

## Evidência

- `painel/01-web-vitest.txt` (0), `06-test-api.txt` (1, só openssl), `09-test-scripts.txt` (0), `04-test-e2e-api-chromium.txt` (0; seção 14: 7 de 7, seção 27: 42 de 42), `04-test-e2e-api-webkit.txt` (seção 14: 7 de 7, seção 27: 41 de 42; a falha é o Tab do WebKit, que não alcança links no macOS).
- Sonda: `painel/scripts/e10-sonda.mjs`, saídas `painel/23-e10-sonda-chromium.txt` e `23-e10-sonda-webkit.txt`, 100 de 100 cada; os 7 erros de console de cada uma são os 401 de `/auth/redefinir` que eu provoquei (link reusado e inventado).
- Config: `painel/scripts/e10-config.mts`, saída `painel/24-e10-config.txt`.
- Capturas: `painel/capturas/e10-senha-redefinida-{chromium,webkit}-{320,390,1280}-{claro,escuro}.png` e `e10-pedido-enviado-*-{320,390}-*`. Olhada: `e10-senha-redefinida-webkit-320-escuro.png` (confirmação com anel de foco, uma ação, sem rodapé).
- Prova de que o teste morde: `painel/33-mutacao-e10.diff` (devolvi o efeito com `setTimeout` e `location.assign("/entrar")` em 2500 ms e tirei a prop `foco` do aviso), `npx vitest run test/recuperar-senha.test.ts`: 3 falhas de 47 (`painel/33-mutacao-e10-vitest.txt`); `git restore`; de novo 47 de 47.

## Cenários positivos

Pedir, receber o link pelo notificador, abrir, definir, ver a confirmação com foco, esperar 7 s sem ir embora, entrar pelo botão, a nova senha valer.

## Cenários negativos

Senha curta; senhas diferentes; link usado duas vezes (e a senha que a segunda tentativa quis não vale); token inventado com a mesma frase; e-mail inexistente e de outro município com resposta idêntica; produção com `RECUPERACAO_ATIVA=sim` sem notificador e com `NOTIFICADOR_ARQUIVO` não sobe.

## Tentativas de reprovar

1. Esperei 7 s (quase três vezes o relógio antigo) em cada uma das 12 combinações: nenhum redirecionamento.
2. Procurei o token no `history.state` e no Referer de pedidos à API: ausente. Achei o token no Referer de pedidos da mesma origem no preview local, que não aplica o cabeçalho do `vercel.json`: não é defeito do produto, mas mostra que a proteção depende só do cabeçalho de produção.
3. Pedi seis links seguidos para a mesma pessoa e o sexto não saiu (teto por e-mail em uma hora, `auth/servico.ts`), com a mesma resposta neutra na tela: comportamento previsto, não defeito; refiz com uma pessoa por rodada.
4. Usei o mesmo link duas vezes e tentei fixar outra senha na segunda: recusado e a senha não mudou.
5. Rodei em WebKit além de Chromium: tudo igual, exceto o Tab do motor.

## Achados

- anotado: no preview local o token aparece no Referer dos pedidos de JS e CSS da mesma origem (não há o cabeçalho do `vercel.json`); em produção depende do cabeçalho da Vercel, que só se confere implantado.
- anotado (rodada 2, ainda vale): com "link não vale mais" ou "recuperação desligada" o foco não vai ao aviso (o aviso de perigo é `role=alert`); registrado para F10-E11 pelo implementador.

## Não verificado

- O cabeçalho `Referrer-Policy` servido de verdade pela Vercel (exige implantação); Firefox (não instalado); leitor de tela real; link vencido por tempo real (coberto só por `recuperacao.test.ts`, que roda verde); envio por provedor real (CP-19).

## Risco residual

Anúncio por leitor de tela da confirmação por foco; Referer dependente do cabeçalho de produção.

## Motivo do humano

A etapa pede que o Rafael faça o fluxo com o notificador de arquivo e confira que a produção continua desligada; o leitor de tela real é da pessoa com leitor (CP-32).
