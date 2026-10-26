---
validador: qa (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: media
humano_necessario: sim
escalar: autenticação e sessão revogada (item 2 da seção 7 de 28: não admite risco aceito)
---

## Critérios verificados

Matriz da Definition of Done e dos cinco campos de teste, por execução nesta sessão, no SHA bb0f654 (árvore em 0290af5; `dc360/` idêntico).

| Critério da etapa | Como foi provado | Resultado |
| --- | --- | --- |
| DoD: fluxo provado ponta a ponta com notificador de teste | e2e seções 14 e 27 em Chromium e Firefox (saídas 04 e 05); sonda de API 11; sonda no navegador 16 e 17 (link real lido do arquivo do notificador) | verde no caminho sem disputa |
| DoD: estados da tela testados | `recuperar-senha.test.ts` 47 de 47, `recuperar-senha-e-sessao.test.ts` 3 de 3 (saída 02); e2e seção 27 (42 conferências por motor); sondas 16 e 17 | verde |
| DoD: produção comprovadamente desligada | `fly.toml:67` `RECUPERACAO_ATIVA = "nao"`; `recuperacao-em-producao.test.ts` 10 de 10; sonda 13 chamando `carregarConfig` com ambiente de produção | sobe com `nao`; recusa as combinações proibidas |
| Positivo: pedido responde 202 neutro | sonda 11 | 202 com corpo e cabeçalhos idênticos para conta de Serra Alta, de Vale Fundo, e-mail em maiúsculas e e-mail inexistente |
| Positivo: o link do arquivo de teste redefine; a nova entra e a antiga não | sonda 11, sondas 16 e 17, e2e 14 e 27 | verde sem disputa; **FALHA sob troca de senha em voo (ver Tentativas, item 1)** |
| Negativo: o mesmo link duas vezes | sonda 11 (API), sondas 16 e 17 (tela) | segundo uso 401 "Este link de redefinição não vale mais. Peça um novo."; a senha tentada não vale |
| Negativo: link vencido | sonda 14, API própria com `RECUPERACAO_MINUTOS=5`, link usado 5 min 30 s depois | 401 com a mesma frase; a senha tentada não entra |
| Negativo: token inventado (mesma mensagem) | sonda 11 e sondas 16 e 17 | mesma resposta, byte a byte, do link usado; também com um caractere trocado |
| Negativo: e-mail inexistente (mesma resposta) | sonda 11 | idêntica; nenhum link gravado |
| Negativo: produção com `RECUPERACAO_ATIVA=sim` e `EMAIL_ATIVO=nao` não sobe | sonda 13 | recusa, inclusive com `NOTIFICADOR_URL` e `NOTIFICADOR_CHAVE` preenchidos |
| Autorização e isolamento: e-mail de conta de B pedido pela tela de A responde como inexistente | sonda 11 (Vale Fundo contra a mesma API), e2e 27 | idêntica |
| Autorização e isolamento: o token de uma conta não serve para outra | sonda 11 (o link do Jonas não mexeu na Simone, de outro município); `recuperacao.test.ts` 14 de 14 | verde |
| Infra: `Referrer-Policy: no-referrer` | leitura de `dc360/vercel.json` (bloco `headers` em `/(recuperar-senha|redefinir-senha)`, com `X-Robots-Tag: noindex`) | presente no arquivo; resposta real da Vercel não verificável aqui |
| Tela: token sai da barra (`history.replaceState`) | sondas 16 e 17; mutação (saída 21) | verde; a mutação faz 1 teste reprovar, restaurado |
| Regressão obrigatória: `test:api`, web, `test:e2e:api`, `test:scripts` | saídas 01, 02, 04, 05 | API 1326 aprovados e 1 falha conhecida da máquina (`openssl-do-teste`); web 665 de 665; e2e 288 e 64 em dois motores; `test:scripts` não rodado por mim |

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/qa-E09-E10-E13/`:

- `01-test-api.txt`: `recuperacao` 14 de 14, `recuperacao-sem-oraculo` 15 de 15, `recuperacao-desligada` 3 de 3, `recuperacao-em-producao` 10 de 10, `config` 19 de 19, `superficie` 9 de 9.
- `02-test-web.txt`: 665 de 665, código 0.
- `04-e2e-api-chromium.txt` e `05-e2e-api-firefox.txt`: seção 14 e seção 27 (42 conferências) verdes, zero erro de console, código 0.
- `11-sonda-e10-api.txt`: `ARQ=notif.txt node sonda-e10-api.mjs` contra API própria na 3791 (PGlite, `NOTIFICADOR_ARQUIVO`), 0 falha, código 0.
- `12-sonda-e10-paralelo.txt`: 10 usos paralelos do mesmo link, um 200 e nove 401; só a senha do vencedor entra.
- `13-sonda-config-producao.txt`: `npx tsx sonda-config.ts` (chama `carregarConfig` com ambiente de produção).
- `14-sonda-e10-link-vencido.txt`: API própria na 3792 com `RECUPERACAO_MINUTOS=5`. As tentativas 1 e 2 foram feitas antes de vencer o prazo, por erro de conta meu (3 min 11 s e 4 min 39 s): o link valeu, como devia, e o rótulo da saída foi corrigido no próprio arquivo. A tentativa 3 (5 min 30 s) é a prova do link vencido.
- `16-sonda-navegador-chromium.txt`, `17-sonda-navegador-firefox.txt`: telas de pedido e de redefinição no navegador.
- `21-mutacao-e10-replacestate.txt`: mutação e restauração.
- `23-sonda-e10-corrida-com-a-troca.txt`: `node sonda-e10-corrida.mjs`, a disputa com a troca de senha.
- `18-indices-byte-a-byte.txt`: `INDEX.md` da E10, 174 linhas, 174 batem byte a byte no SHA e na árvore; `conferir-indices-de-evidencia.mjs` OK.

## Cenários positivos

- `GET /auth/recuperacao` devolve só `{ ativa }`.
- Pedido para conta existente grava o link no arquivo do notificador; a tela mostra a frase neutra e leva o foco à confirmação (390 px, Chromium e Firefox).
- Link real: senhas diferentes e senha curta marcam o campo certo (`aria-invalid`); o sucesso não redireciona sozinho (3,5 s depois a URL continua `/redefinir-senha`) e o foco fica na confirmação "Senha redefinida..."; a senha do primeiro uso entra.
- Redefinir pelo link derruba as sessões abertas da conta (renovação 401).
- Pedido novo gera link novo e o anterior deixa de valer.
- Teto de 5 pedidos por e-mail por hora, sem distinguir maiúscula (8 pedidos, 5 links).

## Cenários negativos

- Segundo uso do mesmo link, link inventado, link com um caractere trocado e link vencido: a mesma frase, e a senha tentada não entra.
- 10 usos paralelos do mesmo link: exatamente um 200.
- E-mail inexistente, de outro município, em maiúsculas e de conta desativada: resposta idêntica (status, corpo e cabeçalhos, descontados data e contadores do limitador); nenhum link para inexistente nem para desativada.
- Com sessão aberta no navegador, um link inventado enviado na tela não derruba a sessão (continua em `/painel`).
- Produção: `RECUPERACAO_ATIVA=sim` sem provedor, com `EMAIL_ATIVO=nao` (mesmo com as variáveis do provedor) e com padrão ausente: recusa; `NOTIFICADOR_ARQUIVO` em produção: recusa, também com a recuperação desligada.

## Tentativas de reprovar

1. **Troca de senha em voo contra a redefinição pelo link (mesma raiz do FAIL 2 da E09).** Conta nova com senha K e uma sessão aberta; pedido de link; ao mesmo tempo, `POST /auth/trocar-senha` (K para "escolhida-pela-sessao") e, com atraso de 0 a 200 ms, `POST /auth/redefinir` com o link (para "escolhida-pelo-link"). Em 6 de 6 rodadas (saída 23): as duas respostas são 200, a tela diria "Senha redefinida. Entre com a nova senha.", **mas a senha do link não entra (401) e a da sessão que o link derrubou entra (200)**. Causa: `trocarSenha` (`apps/api/src/auth/servico.ts`) confere a senha atual numa transação, gasta dois scrypt e grava com `trocar_senha` (migração 049), um `UPDATE` incondicional, depois de `consumir_recuperacao` já ter gravado a senha do link e revogado a sessão. Quem tem a senha antiga e uma sessão (o caso em que a recuperação mais importa: conta invadida) anula a recuperação de forma repetível mantendo uma troca em curso.
2. Uniformidade da resposta: comparei status, corpo e todos os cabeçalhos (exceto data, id da requisição e contadores do limitador) entre conta existente, de outro município, em maiúsculas, desativada e inexistente: idênticos. O tempo de resposta também (mediana 2,8 ms contra 2,0 ms em 6 amostras, envio depois da resposta).
3. Uso único sob corrida: 10 usos paralelos do mesmo link, um só vence, só a senha dele entra.
4. Link vencido de verdade: instância com `RECUPERACAO_MINUTOS=5` e uso 5 min 30 s depois: recusado com a mesma frase.
5. Produção: chamei `carregarConfig` com seis combinações; só a que o `fly.toml` declara sobe.
6. Tela: com sessão aberta, link inválido enviado não derruba a sessão; token sai da barra de endereço com link válido e com link inventado; mutação no `replaceState` reprova um teste.
7. Regressão do diff `52952a1..bb0f654` (login sob `comTenant` com releitura da credencial): entrar com a senha nova depois do link funciona nos dois motores e na API.

## Achados

- **FAIL (bloqueante, autenticação e sessão revogada):** a redefinição pelo link de recuperação perde para uma troca de senha em voo da sessão que ela derruba (6 de 6). Reprodução: `sonda-e10-corrida.mjs`, saída 23. Critério quebrado: o positivo "o link do arquivo de teste redefine a senha; a nova entra e a antiga não", e a garantia "redefinir derruba todas as sessões" que o RESUMO afirma ter provado de novo. A raiz está em `trocarSenha` e `trocar_senha`, código anterior à etapa e compartilhado com a E09: um conserto (a troca reler o hash e a vigência da sessão sob a trava e recusar se mudaram, como `emitirPar` já faz) fecha as duas. Confiança média só na CLASSIFICAÇÃO como critério desta etapa (a raiz não está no diff da E10); o defeito em si está reproduzido por execução.
- **Anotado:** o cabeçalho `Referrer-Policy` só cobre `/recuperar-senha` e `/redefinir-senha` exatos (premissa registrada pela chave do Google Maps); `/redefinir-senha/` com barra final também abre a tela no roteador e não casaria o `source` do `vercel.json`. O link que o servidor gera não tem a barra e o token sai da barra de endereço na montagem, então o risco é baixo; não verificado na Vercel.

## Não verificado

- Os cabeçalhos `Referrer-Policy` e `X-Robots-Tag` na resposta real da Vercel (o `vite preview` não aplica o `vercel.json`); só a leitura do arquivo.
- Postgres 17: sondas e e2e em PGlite (a disputa depende do scrypt no Node e de um `UPDATE` incondicional, não do motor).
- `npm run test:scripts` (não rodei; o gatekeeper anota a divergência conhecida de iOS no Mac).
- Envio real de e-mail (CP-19 adiado) e leitor de tela.
- 320 px e 768 px das telas de recuperação (só 390 px e 1280 px nas minhas sondas).
- CI do SHA (dimensão Infra e CI): não lido.

## Risco residual

Médio: o fluxo, a uniformidade e a trava de produção estão provados; a recuperação, porém, pode ser anulada por quem já tem a senha e uma sessão, que é justamente o cenário de conta invadida. Enquanto a produção roda com `RECUPERACAO_ATIVA = "nao"`, o caminho exposto é o da E09 (mesma raiz).

## Motivo do humano

A etapa pede que Rafael faça o fluxo com o notificador de arquivo e confira que a produção continua desligada, e a tela é pública (portão visual obrigatório pelo texto, seção 10 de `28`): leitura das frases é texto de produto. O FAIL acima é técnico e não depende dele.
