---
validador: seguranca-aplicacao
modelo: claude-opus-5-5
etapa: V2-F00-E08
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
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

Produto de `fd17ff4` (árvore em `55209ab`). Sondas e mutações numa CÓPIA do SHA em `SCRATCH/val-seguranca/copia/` (SCRATCH = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad`); saídas em `SCRATCH/val-seguranca/saidas/`. Não herdado: o diff `1ed0b71..fd17ff4` toca a guarda pela qual passam os 403 desta etapa (não toca `rotas/oficios.ts`, `rotas/avisos.ts` nem `permissoes.ts`).

| Critério | Prova | Resultado |
| --- | --- | --- |
| Agente em `GET /oficios` e `GET /oficios/:id`: 403 `sem_permissao` | HTTP real (`20-sonda-http.txt`, seção E08) | PASS |
| O 403 do agente não confirma existência | HTTP real: ofício existente e inexistente dão o mesmo 403 | PASS |
| Coordenador de B abre ofício de A: 404 | HTTP real: 404 `nao_encontrado`, igual ao de inexistente | PASS |
| Operador e coordenação continuam vendo | HTTP real: operador lista (`200`), coordenadora abre (`200`) | PASS |
| Agente da equipe Alfa não vê nem conta aviso da ocorrência da equipe Bravo | HTTP real: a lista não contém a ocorrência Bravo | PASS |
| A permissão mora no shared e é conferida antes da transação | `autorizar(app, req, "consultar_oficio")` em `rotas/oficios.ts:189` e `:226`; mutação M3a | PASS |
| Os testes mordem (risco alto) | M3a (ofícios sem `consultar_oficio`) e M3b (avisos sem o recorte do agente) | PASS: 3 e 5 de 14 reprovam |

## Evidência

- `20-sonda-http.txt` / `20-sonda-http-vitest.txt`: sonda própria `zz-seg7-http.test.ts` (servidor real em porta efêmera, `fetch`, PGlite com `SET LOCAL ROLE dc360_app`); ofício e avisos semeados como dono das tabelas; 13 de 13, código 0.
- `33-m3a-e08-oficios.txt`: M3a troca as duas chamadas `autorizar(..., "consultar_oficio")` por `exigirAutenticacao`, código 1, 3 reprovados em `leitura-do-agente-oficios-e-avisos.test.ts`. `34-m3b-e08-avisos.txt`: M3b troca o recorte da lista de avisos por vazio, código 1, 5 reprovados. Restaurados e conferidos com `cmp` contra o do SHA.
- `30-base-verde.txt`: 463 de 463, código 0.
- CI: run 39420436042, 9 de 9 `success` (`05-ci-jobs.txt`).

## Cenários positivos

- Operador lista ofícios (`200`); coordenadora abre o ofício de A (`200`).
- Agente Alfa recebe o aviso da ocorrência da própria equipe (`naoLidos` 2, só avisos da equipe e do município sem recorte).

## Cenários negativos

- Agente: `GET /oficios` `403 sem_permissao`; `GET /oficios/<existente>` `403`; `GET /oficios/<inexistente>` `403` (sem oráculo de existência); `GET /oficios/:id/documento` `403 sem_permissao`.
- Coordenador de B: ofício de A `404`, ofício inexistente `404`, corpos iguais.
- Lista de avisos do agente Alfa: não contém a ocorrência da equipe Bravo.

## Tentativas de reprovar

1. Comparei o 403 do agente com ofício existente e inexistente para ver se a ordem das conferências vazava existência: não vaza (permissão antes da transação).
2. Tentei o documento do ofício como agente (rota vizinha, não citada na etapa): `403`.
3. Cruzei município: coordenador de B no ofício de A: `404`, nunca 403.
4. Mutações M3a e M3b para ver as duas linhas de defesa (permissão e recorte) presas a teste: as duas mordem.
5. Conferi que a guarda nova do diff deixa o `403 sem_permissao` destas rotas sair intacto por HTTP real.

## Achados

Nenhum achado nesta dimensão.

## Não verificado

- A escrita dentro do `GET /avisos` (idempotente, registrada em `PENDENCIAS.md`) segue fora da vigência até a F03-E03, como a etapa declara; não a tratei como defeito.
- O painel escondendo "Ofícios" (é apresentação; o controle é a API, provado acima).
- Node 22 do `.nvmrc` (rodei em 24.15.0).

## Risco residual

A contagem de `naoLidos` do agente sem equipe e o teto da contagem foram vistos só pela suíte do repositório, não pela minha sonda. A escrita em GET continua sendo exceção à regra de vigência até a F03-E03.

## Motivo do humano

Nada nesta dimensão depende de pessoa.
