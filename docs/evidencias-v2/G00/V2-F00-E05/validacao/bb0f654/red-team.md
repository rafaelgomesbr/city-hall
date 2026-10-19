---
validador: red-team (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---

## Critérios verificados

1. O servidor emite 401 `nao_autenticado` (papel diferente do token, token vencido), 401 `sessao_encerrada` e 403 `conta_desativada`, e só códigos do catálogo do shared.
2. `/auth/entrar` com conta desativada mantém a recusa genérica: mesmo status, corpo e tempo de senha errada e de e-mail inexistente (resistência a enumeração).
3. `/auth/renovar` de conta desativada responde 403 `conta_desativada`, inclusive depois da desativação pela rota real do painel (que revoga as sessões); conta reativada volta a `sessao_encerrada`.
4. Token de conta desativada do município A tentando escrever no município B recebe `conta_desativada` sem confirmar nada sobre B; o 404 de outro município não muda.

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/red-team-E04-E05-E06-E08/`. Mesmo ambiente do relatório de red-team da E04 (PostgreSQL 17.6 local, API real na porta 3791, papel de API sem BYPASSRLS).

- `sonda-e05.mjs`, saída `saida-e05.txt` (código 0; a única linha FALHA é artefato da sonda: o "código vazio" são 77 respostas a HEAD, que não têm corpo, conferido e anotado no fim da saída). Só usa tokens emitidos pela própria API.
- `saida-varredura.tsv` (da E04): códigos emitidos em 1071 pedidos com tokens em 7 estados.
- Testes sem mutação: `t-api-base.txt` (`codigos-de-erro.test.ts` entre os 107 de 107), `t-shared.txt` (`codigos-de-erro.test.ts` e `permissoes.test.ts` do shared, 26 de 26), `t-web.txt` (`sessao-e-entrada.test.ts` e o de ofício, 31 de 31).
- Mutação M3 (`m3.txt`), desfeita com `git restore`.

## Cenários positivos

- Conta desativada: 403 `conta_desativada` em toda escrita (51 de 51) e nos GET com efeito.
- Papel diferente do token: 401 `nao_autenticado` (51 de 51), o código que manda renovar.
- Sessão encerrada, reúso, cadeia encerrada, senha provisória vencida: 401 `sessao_encerrada` (51 de 51 em cada).
- Renovação de conta desativada: 403 `conta_desativada`, repetível (duas chamadas seguidas).

## Cenários negativos

- Entrada: "desativada com senha certa", "desativada com senha errada" e "e-mail inexistente" responderam exatamente `401 {"erro":"credenciais","mensagem":"Email ou senha inválidos."}`, medianas de 228, 228 e 227 ms. A senha certa de conta desativada não é distinguível da errada.
- Renovação com token desconhecido e renovação antiga de conta reativada: 401 `sessao_encerrada`, corpos idênticos.
- Conta desativada de Serra Alta em ocorrência de Vale Fundo e em id inexistente: 403 `conta_desativada` com corpo idêntico, tempo mediano 1,13 contra 1,12 ms. Coordenadora vigente de Serra Alta: 404 idêntico ao de id inexistente.
- Todo código 401 ou 403 da varredura (`conta_desativada`, `nao_autenticado`, `sessao_encerrada`, `sem_permissao`) está em `CODIGOS_DE_ERRO_DE_ACESSO` do shared construído; nenhum `sessao` solto.

## Tentativas de reprovar

1. Enumeração de conta pela entrada (estado e senha): corpo e tempo iguais nos três casos.
2. Oráculo de reativação pela renovação: a renovação antiga de conta reativada responde igual a token desconhecido.
3. Oráculo entre municípios pelo código novo: a resposta da conta desativada não muda com a existência ou o município do recurso, nem no tempo.
4. Ordem dos códigos quando a desativação também revoga as sessões (o que o painel faz): a varredura fez a desativação pela rota real e recebeu `conta_desativada`, não `sessao_encerrada`.
5. Mordida: M3 (em `exigirVigencia`, conferir a conta desativada DEPOIS da sessão) derrubou 7 casos em `codigos-de-erro.test.ts`, `get-com-efeito.test.ts` e `vigencia-na-escrita.test.ts` (`m3.txt`); restaurado.
6. Renovação perdida para a desativação (correção 3 da E07, `tratarTokenRecusado` no ramo de trava perdida): coberta pelo arquivo `renovacao-contra-encerramento.test.ts` do repositório; não a reproduzi por corrida HTTP.

## Achados

1. **Anotado (já registrado pelo QA em rodada anterior):** o 401 de `/auth/renovar` usa a mensagem "Sessão expirada. Entre novamente.", diferente da mensagem do catálogo para `sessao_encerrada`. O código é o certo; só o texto diverge.
2. Nenhum oráculo de estado de conta encontrado para quem não tem credencial.

## Não verificado

- As três frases da tela de entrada no navegador (capturas e e2e da seção 23): não rodei o painel; o comportamento do `http.ts` foi coberto só pelos testes de `sessao-e-entrada.test.ts` (verdes).
- O desafio do segundo fator vencido e o link de redefinição inválido como `sessao_encerrada` sem token: não sondei por HTTP (servidor com o segundo fator desligado).
- Token de acesso vencido de verdade respondendo `nao_autenticado`: não reproduzido por HTTP nesta sessão (exigiria esperar o vencimento); coberto por `codigos-de-erro.test.ts`.
- O run do CI do SHA.

## Risco residual

Respostas diferentes revelam o estado da conta só a quem apresenta token de acesso ou de renovação válido, como a etapa aceita. A mensagem do 401 da renovação diverge do catálogo (texto, não código).

## Motivo do humano

Nada na dimensão red-team. A aprovação das frases mostradas ao usuário é texto de produto e pertence à dimensão de UX e ao Rafael, não a esta.
