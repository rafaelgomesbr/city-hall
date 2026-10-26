---
validador: seguranca-aplicacao
modelo: claude-opus-5-5
etapa: V2-F00-E10
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [UI, A11Y, AUTH, API, LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Produto de `fd17ff4` (árvore em `55209ab`). Sondas numa CÓPIA do SHA em `SCRATCH/val-seguranca/copia/` (SCRATCH = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad`); saídas em `SCRATCH/val-seguranca/saidas/`. Não herdado: o diff `1ed0b71..fd17ff4` toca a guarda e `codigos-de-erro.ts` (os 401 da redefinição passam por ela).

| Critério | Prova | Resultado |
| --- | --- | --- |
| Pedido com e-mail de A, de B, inexistente e de conta desativada: resposta idêntica | HTTP real (`20-sonda-http.txt`, seção E10): os quatro `202` com o mesmo corpo, de 1 a 2 ms | PASS |
| Só conta ativa existente recebe link | notificador de teste: 2 mensagens (A e B), nenhuma para inexistente nem desativada | PASS |
| O mesmo link duas vezes: a segunda recusada | HTTP real: `200` e depois `401 sessao_encerrada` "Este link de redefinição não vale mais" | PASS |
| Link vencido e token inventado: mesma mensagem | HTTP real: os três corpos iguais | PASS |
| O token de uma conta não serve para outra | HTTP real: depois de o Jonas redefinir, Helena com a senha nova do Jonas `401`, com a dela `200` | PASS |
| Produção desligada | `fly.toml:67` `RECUPERACAO_ATIVA = "nao"`; `config.test.ts` e `recuperacao-em-producao.test.ts` (produção com `RECUPERACAO_ATIVA=sim` sem `EMAIL_ATIVO=sim` e notificador não sobe) verdes | PASS |
| Token fora da barra de endereço e do Referer | `RecuperarSenha.tsx:372` `history.replaceState`; `vercel.json:24-25` `Referrer-Policy: no-referrer` | PASS (leitura) |

## Evidência

- `20-sonda-http.txt` / `20-sonda-http-vitest.txt`: sonda própria `zz-seg7-http.test.ts` com notificador que guarda a mensagem (o link sai dele), `fetch` real em porta efêmera; 13 de 13, código 0.
- `70-regressao-seg.txt`: `config.test.ts` 19, `recuperacao-em-producao.test.ts` 10, `recuperacao-desligada.test.ts` 3, `recuperacao-sem-oraculo.test.ts` 15, todos verdes, código 0.
- `30-base-verde.txt` (inclui `recuperacao.test.ts`): 463 de 463.
- CI: run 39420436042, 9 de 9 `success` (`05-ci-jobs.txt`).

## Cenários positivos

- Pedido para conta ativa de A gera link; redefinir com ele dá `200`; o Jonas entra com a senha nova.

## Cenários negativos

- Inexistente, desativada e conta de outro município: o mesmo `202`, sem mensagem para inexistente e desativada.
- Segunda vez o mesmo token, token vencido (vencimento forçado no banco) e token inventado do mesmo tamanho: o mesmo `401` com a mesma frase.
- A senha nova de uma conta não abre outra.

## Tentativas de reprovar

1. Medi o tempo do pedido (resposta antes do envio): 1 a 2 ms nos quatro casos; sem oráculo visível por tempo nesta medição local.
2. Tentei distinguir "vencido", "usado" e "inventado" pela resposta: indistinguíveis.
3. Usei o token de uma conta e testei a outra conta: não serve.
4. Conferi o efeito do diff da guarda nesses 401 (código `sessao_encerrada` do catálogo): sai intacto por HTTP real.

## Achados

Nenhum achado nesta dimensão.

## Não verificado

- O fluxo do painel no navegador (estados da tela e remoção do token da barra) não foi exercitado por mim; só a leitura do código e a configuração de cabeçalho do `vercel.json` (o cabeçalho real do Vercel não foi medido).
- Envio por e-mail real (produção desligada até o CP-19, por decisão).
- Node 22 do `.nvmrc` (rodei em 24.15.0).

## Risco residual

Com a produção desligada, o risco de link em log ou em caixa errada fica para o CP-19. A medição de tempo foi local e com poucas amostras; um canal de tempo pela rede sob carga não foi descartado.

## Motivo do humano

Nada nesta dimensão depende de pessoa.
