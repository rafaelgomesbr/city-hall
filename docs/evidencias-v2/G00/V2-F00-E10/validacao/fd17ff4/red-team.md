---
validador: red-team
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

API em processo contra PostgreSQL 17.6 REAL, `NOTIFICADOR_ARQUIVO` ligado, cluster derrubado no fim. Nada do repositório editado. O diff não toca `autenticacao.ts` nem `config.ts`; ataquei o fluxo de recuperação por HTTP real.

| Critério (DoD e campos de teste) | Prova | Resultado |
| --- | --- | --- |
| Pedido responde 202 neutro; e-mail inexistente = mesma resposta | HTTP real: Helena 202; inexistente e conta de B = mensagem idêntica | PASS |
| Link do arquivo redefine; nova senha entra, antiga não | HTTP real: redefinir 200; login antigo 401, novo 200 | PASS |
| Mesmo link duas vezes: segunda recusada; token inventado = mesma mensagem | HTTP real: reuso e inventado dão `sessao_encerrada` idêntico | PASS |
| Token de redefinição de uma conta não serve para outra | token opaco por conta; reuso invalida; sem distinção usado/inválido | PASS |
| Isolamento: pedido com e-mail de B pela tela de A = resposta de inexistente | HTTP real: idêntico | PASS |
| `recuperacao`/`recuperacao-desligada` verdes | suíte (`20-suites-seg.txt` não as inclui; CI as cobre) | ver Não verificado |

## Evidência

- `SCRATCH/val-red-team/notificacoes.txt`: linhas de notificação de Helena e de Simone (B), cada uma com link de uso único de 30 min.
- Ataques HTTP vivos: `/auth/recuperar` Helena 202, inexistente e B = `{"mensagem":"Se existir conta..."}` idêntico; `/auth/redefinir` 1ª vez 200, 2ª vez `sessao_encerrada`, token inventado `sessao_encerrada` (mesmo corpo); login antigo 401, novo 200.
- `GET /auth/recuperacao`: `{"ativa":true}` (neste cluster de teste; a trava de produção é `fly.toml`).
- CI: run 39420436042 sobre `55209ab`, 9 de 9 `success` (inclui os testes de recuperação e de configuração).

## Cenários positivos

- Helena pede, lê o link do arquivo, redefine (200), entra com a nova (200).

## Cenários negativos

- E-mail inexistente e e-mail de outro município: 202 com a MESMA mensagem (sem enumeração, sem pista de tenant).
- Reuso do link e token inventado: ambos `{"erro":"sessao_encerrada","mensagem":"Este link de redefinição não vale mais. Peça um novo."}`, indistinguíveis (não revela se o token existiu).
- Login com a senha antiga depois da redefinição: 401.

## Tentativas de reprovar

1. Enumeração de e-mails cadastrados: resposta uniforme 202 para existente, inexistente e de outro município.
2. Reuso do link de uso único: a segunda redefinição falha, e com a MESMA mensagem de um token inventado (não vira oráculo de "token já usado").
3. Token cross-conta: o token é consumido por `consumir_recuperacao` por hash; o reuso o invalida; não há caminho para um token servir a outra conta.

## Achados

- Nenhum. O fluxo resiste a enumeração, reuso e cruzamento de município.

## Não verificado

- As suítes `recuperacao*.test.ts` na minha execução local (rodei o conjunto de segurança; a recuperação foi provada por HTTP vivo ponta a ponta). O CI (Node 22) as executa e está verde.
- A trava de produção desligada (`RECUPERACAO_ATIVA=nao` em `fly.toml`, recusa de subir sem `EMAIL_ATIVO`): é config/infra, coberta pelo teste de configuração do CI; não a reencenei (exige derrubar a partida).
- A tela `RecuperarSenha.tsx` (remoção do token da URL, `Referrer-Policy`): UX/front, e canal de tempo não medido.

## Risco residual

Baixo. O servidor resiste aos três ataques clássicos de recuperação; a trava de produção é responsabilidade de infra/config, verde no CI.

## Motivo do humano

Não se aplica a esta dimensão; o fluxo com o notificador de arquivo e a prova de produção desligada que o Rafael confere são validação humana.
