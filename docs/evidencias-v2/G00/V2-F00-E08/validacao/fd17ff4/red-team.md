---
validador: red-team
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

API em processo contra PostgreSQL 17.6 REAL (semente, derrubado no fim); suítes na CÓPIA de `fd17ff4`. Nada do repositório editado. O diff desde a rodada 6 não toca `oficios.ts`, `avisos.ts`, `recorte-do-agente.ts` nem `permissoes.ts`; a etapa é reprovável só por regressão, e ataquei por fora.

| Critério (DoD e campos de teste) | Prova | Resultado |
| --- | --- | --- |
| Agente em `GET /oficios` e `GET /oficios/:id`: 403 `sem_permissao` | HTTP real, token do agente Diego: 403 e 403 | PASS |
| Operador/coordenador/administrador listam ofício (200) | HTTP real, token da Rita (admin): 200 | PASS |
| `GET /avisos`: agente vê só avisos da própria equipe; coordenador vê mais | HTTP real: Diego (Equipe Alfa) `naoLidos=2`, só ocorrência `...c4` (Alfa); Helena (coordenadora) `naoLidos=3`, 3 itens | PASS |
| Isolamento: coordenador de B abre ofício de A: 404 | coberto por `leitura-do-agente-oficios-e-avisos` verde | PASS |
| Ação `consultar_oficio` mora no shared | `permissoes` inalterado; suíte verde | PASS |

## Evidência

- Ataques HTTP vivos: `GET /oficios` (Diego) 403; `GET /oficios/<id>` (Diego) 403; `GET /oficios` (Rita) 200; `GET /avisos` (Diego) só `...c4`, `naoLidos=2`; (Helena) 3 itens.
- `SCRATCH/val-red-team/saidas/20-suites-seg.txt`: `leitura-do-agente-oficios-e-avisos` entre as 10 suítes, código 0.
- CI: run 39420436042 sobre `55209ab`, 9 de 9 `success`.
- Prova de que morde (`SCRATCH/val-red-team/saidas/60-mutacao-e08.txt`): na CÓPIA, as duas chamadas `autorizar(app, req, "consultar_oficio")` de `rotas/oficios.ts` voltaram a ser só `app.exigirAutenticacao(req)` (o estado anterior ao conserto). `leitura-do-agente-oficios-e-avisos` + `orgaos-e-oficio` ficaram VERMELHOS (3 de 38 reprovam, código 1). Restaurado, `cmp` idêntico ao SHA, VERDES (38 de 38, código 0).

## Cenários positivos

- Rita (administradora) lista ofícios: 200. Helena (coordenadora) vê a contagem de avisos do município.

## Cenários negativos

- Agente Diego em `GET /oficios` e `GET /oficios/:id`: 403 `sem_permissao` (não chega a ver número, órgão nem e-mail do órgão).
- Agente Diego em `GET /avisos`: vê só a ocorrência da equipe dele (`...c4`); não vê nem conta avisos de outra equipe (Bravo: `...c3`/`...c8`).

## Tentativas de reprovar

1. Agente lendo ofício de qualquer equipe (o vazamento AUT-12/13 original): 403 por HTTP real, nas duas rotas.
2. Agente contando avisos do município inteiro: `naoLidos=2` e uma só ocorrência da equipe dele, contra `naoLidos=3` da coordenadora, provando que o recorte morde na lista E na contagem.
3. Regressão pelo diff: `oficios.ts`/`avisos.ts`/`recorte-do-agente.ts`/`permissoes.ts` não mudaram; a suíte de leitura do agente passa no SHA.
4. Desfiz a proteção central (a exigência da ação `consultar_oficio` nas duas leituras de ofício) numa cópia do SHA: o agente voltou a ler ofício e 3 casos reprovaram; restaurado, 38 de 38 verdes. O teste morde.

## Achados

- Nenhum. As três sondas da etapa (agente fechado em ofícios e avisos, recorte na contagem) respondem como pedido.

## Não verificado

- Isolamento cross-tenant de ofício por HTTP vivo (coordenador de B em ofício de A): confiei na suíte `leitura-do-agente-oficios-e-avisos` verde; a semente não tem ofício pronto em B para a sonda direta.
- A escrita dentro do `GET /avisos` (materializar prazos) é pendência registrada, fora do escopo desta etapa.
- Painel escondendo "Ofícios" (UX) e leitor de tela (acessibilidade).

## Risco residual

Baixo. A superfície da etapa não mudou e os ataques por fora batem no 403/recorte esperados.

## Motivo do humano

Não se aplica a esta dimensão; o painel e a sonda que o Rafael vê antes/depois são validação humana e UX.
