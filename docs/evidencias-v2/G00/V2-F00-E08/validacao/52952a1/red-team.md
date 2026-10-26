---
validador: red-team (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E08
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [UI, A11Y, AUTH, AUTHZ, API, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Ambiente: Postgres 17.10 descartável com os papéis do job `implantavel` e a API do SHA com `dc360_api`, ninguém mais mexendo na árvore nem no banco (a rodada 2 teve falso alarme por mutação de outro validador; aqui não). Saídas em `$SP/val/red-team/`.

| Critério | Resultado | Prova |
| --- | --- | --- |
| Agente: `GET /oficios` e `GET /oficios/:id` 403 `sem_permissao` | PASS | `40-e08-agente-e-cruzamento.txt`: GET e HEAD de `/oficios`, `/oficios/:id`, `/oficios/:id/documento` e de id inexistente, todos 403 (sem oráculo de existência); emitir e enviar também 403 |
| Operador, coordenação leem ofício | PASS | operador lista e abre (200); coordenadora abre ficha e documento (200) |
| Coordenador de B contra ofício de A: 404 | PASS | ficha e documento 404, corpo idêntico ao de id inexistente |
| Sino do agente só com a equipe dele | PASS | Diego (Alfa) vê os 2 avisos de Alfa, não vê o de Bravo nem o de B; a coordenadora vê os 3 de A e não o de B |
| `naoLidos` com o mesmo recorte | PASS | agente: `naoLidos` só conta Alfa; marcar o próprio aviso muda só o dele (a coordenadora segue com 3) |
| Agente sem equipe: lista vazia e 0 não lidos | PASS | `qtd=0 naoLidos=0` com o token ainda vivo (a equipe vem do cadastro, lida a cada pedido) |
| Agente movido de equipe com token vivo | PASS | movido para Bravo, passa a ver só o de Bravo e deixa de ver Alfa no pedido seguinte |
| `POST /avisos/lidos` com aviso de outra equipe ou de outro município | PASS | `200`, banco intacto (foto de todas as tabelas), resposta igual à de id inventado |
| Agente de B não vê o sino de A | PASS | lista vazia |
| `GET /avisos` que escreve passa pela vigência | PASS | varredura da E04 (`e04/estado-*`): conta desativada, sessão encerrada, papel rebaixado, cadeia encerrada, provisória vencida e município suspenso recusam GET e HEAD de `/avisos` e `/avisos/` sem mudar o banco |
| O teste morde | PASS | M10 a M12 abaixo |
| Falso alarme do sino da rodada 2 | NÃO SE REPETE | sino do agente medido sem nenhuma mutação concorrente |

## Evidência

- `40-e08-agente-e-cruzamento.txt` (script `scripts/e08-agente.mjs`), código 0. `41-forma-do-sino.txt`: forma da resposta e a lista de evidências de outro município (vazia, igual à de id inexistente).
- `01-suites-alvo-pglite.txt`: `leitura-do-agente-oficios-e-avisos`, `sino-de-avisos`, `orgaos-e-oficio`, `agente-so-ve-a-equipe`, `superficie` verdes.
- Mutações (restauradas com `git restore`; `git status --porcelain` depois só com relatórios):
  - M10 `52-*`: as duas rotas de ofício com só `exigirAutenticacao`: 3 de 66 vermelhos.
  - M11 `53-*`: contagem do sino sem o recorte: 7 de 66 vermelhos.
  - M12 `54-*`: lista do sino sem o recorte: 7 de 66 vermelhos.
  - Verde depois: `55-e08-verde-depois.txt`, 66 de 66.
- `60-test-isolamento.txt`: 345 aprovados e 3 pulados, código 0.

## Cenários positivos

Operador, coordenação e administração mantêm ofício e sino; o agente marca como lido o que vê.

## Cenários negativos

Agente contra ofícios (todas as variantes, GET e HEAD), contra aviso de outra equipe e de outro município; coordenador de B contra ofício de A.

## Tentativas de reprovar

1. Enumerar ofício por 403 contra 404: para o agente é sempre 403 (inclusive id inexistente); para outro município é 404 com corpo idêntico ao de inexistente.
2. Rota irmã `/oficios/:id/documento` e HEAD: fechadas.
3. Marcar como lido aviso fora do recorte para descobrir se existe: mesma resposta do id inventado, nada gravado.
4. Mudar a equipe do agente com o token vivo: o recorte segue o cadastro, não o token.
5. Coordenadora rebaixada a agente com o token antigo (`42-rebaixada-a-agente-le-oficio.txt`): `GET /avisos` responde 401 `nao_autenticado` (marca de efeito), mas `GET /oficios` e a ficha seguem 200 pelos 15 minutos do token. É leitura pura pelo papel do token, fora do escopo (vigência em leitura é da F03-E03); anotado.
6. Desfiz a ação e os dois recortes (M10 a M12): os testes mordem.

## Achados

- ANOTADO (F03-E03): quem foi rebaixado de coordenação a agente continua lendo ofícios por até 15 minutos com o token antigo (tentativa 5).
- ANOTADO (rodadas anteriores, continua): `GET /oficios/:id/documento` mostra dados do solicitante sem gravar `ocorrencia_consultas` (F05-E11).

## Não verificado

- Painel (o menu "Ofícios" escondido para o agente): é das dimensões de UX e QA; não abri o navegador.
- Aviso do tipo `retorno_nao_confirmado` e `providencia_respondida` no recorte: usei os tipos presentes na semente (`vistoria_recebida`, `prazo_vencido`) e um inserido por mim em B; o recorte é por ocorrência, não por tipo.

## Risco residual

Leitura pura com papel antigo até o token vencer (F03-E03).

## Motivo do humano

Não se aplica.
