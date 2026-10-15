---
validador: qa (agente general-purpose com o papel da dimensão)
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

Árvore no HEAD `95f09f6` (produto igual a `52952a1`). O diff `4b96ea7..52952a1` em `apps/api/src/rotas/avisos.ts` é só comentário (o teto de SECURITY DEFINER); `rotas/oficios.ts` não mudou. Sonda própria `$SP/val/qa/sondas/qa-e08.test.ts`: o ofício é emitido pela API de verdade (`POST /orgaos`, providência inserida como dono, `POST /oficios`), um agente da Equipe Bravo e um agente sem equipe são acrescentados, e dois avisos semeados (um da Alfa, um da Bravo).

| Critério | Prova (`$SP/val/qa/32-sonda-e08.txt`, salvo indicação) | Resultado |
| --- | --- | --- |
| Ação nova no shared, concedida a operador, coordenador e administrador e não ao agente | `podeExecutar(..., "consultar_oficio")`: agente false, os outros três true; `packages/shared` 168 de 168 (`05-test-shared.txt`) | PASS |
| Negativo: agente em `GET /oficios` e `GET /oficios/:id`: 403 `sem_permissao` | lista, lista filtrada por ocorrência, ficha existente, ficha inexistente, id malformado e ficha de outro município: todos 403 `sem_permissao`, HEAD 403; nenhum corpo traz o e-mail do órgão | PASS |
| Positivo: operador, coordenador e administrador listam e abrem (200) | 200 na lista e na ficha para os três, com `orgao_email` | PASS |
| Isolamento: coordenador de B abre ofício de A: 404 | 404 `nao_encontrado`; a lista de B não traz o ofício de A | PASS |
| Agente da Bravo não vê nem conta o aviso da Alfa (e o inverso) | Diego (Alfa): 1 item, só a ocorrência da Alfa, `naoLidos` 1; Bia (Bravo): só a da Bravo; nenhum protocolo da outra equipe no corpo; `naoLidos` igual ao oráculo calculado no banco (avisos da equipe fora da margem de 10 s que a rota corta) | PASS |
| Agente sem equipe: lista vazia e `naoLidos` 0 | 0 itens, 0 | PASS |
| O sino do coordenador devolve a mesma contagem de antes | coordenadora vê os dois avisos, `naoLidos` igual ao total do município | PASS |
| Agente não marca como lido aviso de outra equipe | `POST /avisos/lidos` com o id do aviso da Bravo: `marcados: 0` | PASS |
| Frontend esconde "Ofícios" de quem não tem a ação | `apps/web/src/paginas/Ocorrencia.tsx:164` (`podeExecutar(sessao.papel, "consultar_oficio")`); e2e seção 25: "o cartao de oficios nem aparece para ele", "o operador ... continua vendo o cartao de oficios" | PASS |
| E2E com o token do agente da semente: `GET /oficios` 403 e o sino só com avisos da equipe | `npm run test:e2e:api`, seção 25 (`07-test-e2e-api.txt`): 14 verificações OK, entre elas "GET /oficios/:id com o token do agente: 403 sem_permissao, sem e-mail nem IP no corpo", "todo aviso do agente e de ocorrencia da equipe dele", "o numero de nao lidos do agente e o da lista dele, nao o do municipio"; 288 de 288, zero erro de console | PASS |
| Pendência da escrita em GET registrada | `GET /avisos` marcado `ROTA_GET_COM_EFEITO` e responde 403 com o município suspenso (relatório da E04); a pendência está em `apps/api/PENDENCIAS.md` (lida) | PASS |
| Regressão: `test:api`, shared, `test:isolamento`, `superficie`, `test:e2e:api` | `01` 1309 aprovados, 1 falha de ambiente (`openssl-do-teste`); `05` 168/168; `02` 345 e 3 pulados, código 0; e2e código 0 | PASS |

## Evidência

- `$SP/val/qa/32-sonda-e08.txt`: 5 de 5
- `$SP/val/qa/42-mutacao-M3-M4.txt` e `.diff`: com `GET /oficios` trocando `autorizar(..., "consultar_oficio")` por só `exigirAutenticacao`, a minha sonda reprova o caso do agente; restaurado com `git restore`, `git status --porcelain` limpo
- `$SP/val/qa/01`, `02`, `05`, `07`; CI run 38618369218, 9 de 9 `success`

## Cenários positivos

Os três papéis com a ação leem ofício; coordenação vê o sino inteiro; cada agente vê o da própria equipe.

## Cenários negativos

Agente em seis variações de URL de ofício, em GET e HEAD; agente sem equipe; agente marcando aviso de outra equipe; coordenador de B na ficha de A.

## Tentativas de reprovar

- Id malformado e id inexistente como oráculo de existência para o agente: os dois respondem o mesmo 403 que o id existente.
- HEAD como atalho para a rota: 403.
- Contagem `naoLidos` denunciando avisos fora do recorte: igual ao oráculo da equipe.
- Marcar como lido aviso de fora do recorte: `marcados: 0`.
- Ofício de outro município pela lista: não aparece.

## Achados

- Nenhum que reprove. A primeira versão do meu oráculo do sino contava avisos recém-materializados que a rota corta pela margem de 10 s (`avisos.ts`); corrigido o oráculo, não é defeito do produto.

## Não verificado

- O falso alarme do sino da rodada 2 não foi reinvestigado (era a mutação de outro validador, descartada com prova no VEREDITO); nesta rodada os validadores rodaram em sequência e o e2e passou sem mutação na árvore (as minhas mutações foram feitas depois do e2e terminar).
- `GET /documentos/validar` mostrando protocolo e emitente ao agente: já anotado para a F03-E12, não refeito.

## Risco residual

`GET /avisos` continua escrevendo dentro de um GET (pendência registrada para F07-E03 e F04-E11).

## Motivo do humano

Não se aplica: a sonda do agente antes e depois é verificável por execução.
