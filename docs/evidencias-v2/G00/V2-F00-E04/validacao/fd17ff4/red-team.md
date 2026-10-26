---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E04
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [AUTH, AUTHZ, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

API de pé em processo contra PostgreSQL 17.6 REAL (cluster meu, 127.0.0.1:55471, papéis `dc360_setup`/`dc360_api`, `dc360_app` com RLS forçada, derrubado no fim), semente de desenvolvimento aplicada. Suítes na CÓPIA de `fd17ff4` (`SCRATCH/val-red-team/copia`). Nada do repositório editado. Diff desde a rodada 6 que toca a etapa: `auth/suspensao.ts` (TypeError em `AcessoSuspenso` com status fora de 403/503) e `servidor.ts` (TypeError em `RegraDeNegocio` com status fora de inteiro 400-599).

| Critério (DoD e campos de teste) | Prova | Resultado |
| --- | --- | --- |
| Conta desativada, papel rebaixado, sessão encerrada não escrevem com token vivo | `vigencia-na-escrita.test.ts` + `get-com-efeito` + `acesso-suspenso` verdes (`20-suites-seg.txt`) | PASS |
| Conta ativa escreve 200 | mesma suíte (controles verdes) | PASS |
| Isolamento: token de B contra ocorrência de A continua 404 | HTTP real: `GET /ocorrencias/OC_A` com token de Vale Fundo = 404, com token de Serra Alta = 200 | PASS |
| Município suspenso responde a suspensão (403/503) | `acesso-suspenso.test.ts` verde | PASS |
| Regressão do diff (novos TypeError) não quebra construção de erro do produto | varredura de `new RegraDeNegocio`/`AcessoSuspenso` + `codigos-de-erro`/`prova-dinamica` verdes | PASS |

## Evidência

- `SCRATCH/val-red-team/saidas/20-suites-seg.txt`: 10 suítes incluindo `vigencia-na-escrita`, `acesso-suspenso`, 460 aprovados, 34 pulados (Postgres real), código 0.
- Ataques HTTP vivos (`tok-aur.txt`, `tok-rita.txt`): POST triagem e GET de ocorrência de A com token de B = 404 (corpo `nao_encontrado` idêntico ao de id inexistente do próprio município); controle de A = 200.
- CI: run 39420436042 sobre `55209ab`, 9 de 9 `success`.
- Prova de que morde (`SCRATCH/val-red-team/saidas/60-mutacao-e04.txt`, harness `SCRATCH/val-red-team/mutar.sh`): na CÓPIA, a chamada `exigirVigencia(vigencia, conteudo, statusDaSuspensao)` de `servidor.ts` foi desligada; `vigencia-na-escrita.test.ts` ficou VERMELHO (6 de 13 reprovam, código 1). Restaurado, `cmp` idêntico ao arquivo do SHA, e o mesmo teste ficou VERDE (13 de 13, código 0).

## Cenários positivos

- Coordenadora de Serra Alta (token válido, conta ativa) lê a própria ocorrência: 200.

## Cenários negativos

- Token do município B (Aurélio) em `GET /ocorrencias/OC_A` e `POST /ocorrencias/OC_A/triagem`: 404 (body de validação 422 quando o corpo é inválido, idêntico para cross-tenant, id inexistente do próprio município e recurso existente do próprio: não distingue nada).
- Conta desativada/papel rebaixado/sessão encerrada: a suíte de vigência confirma recusa na escrita com o token ainda vivo.

## Tentativas de reprovar

1. Escrever num recurso de outro município com corpo VÁLIDO e com corpo inválido: 404 (válido) e 422 idêntico em três casos (inválido), nenhum vazamento de existência cross-tenant.
2. Distinguir cross-tenant por status/corpo no POST triagem: os três 422 têm corpo byte a byte igual (`vulnerabilidadePresente` obrigatório); o status de existência (404) só aparece com corpo válido, e é o mesmo para id inexistente do próprio município.
3. Novos TypeError do diff viram vetor? Procurei status fora de 400-599 em toda construção de erro do produto: nenhum; as suítes de status verdes.
4. Desfiz a proteção central (a conferência de vigência na escrita) numa cópia do SHA: a conta desativada, o papel rebaixado e a sessão encerrada voltaram a escrever e 6 casos reprovaram; com a proteção de volta, 13 de 13 verdes. O teste morde.

## Achados

- **anotado.** A janela de disputa entre a conferência da vigência e o INSERT (achado de rodadas anteriores) continua, endereçada à F03-E03 por decisão de escopo; não viola o critério "responde no pedido seguinte".

## Não verificado

- Vigência em LEITURA pura: fora de escopo (F03-E03); conta desativada ainda lê até o token vencer.
- `test:e2e:api` completo (depende de Vite/porta; a outra sessão ocupa a 5811) e o E2E de desativar no painel (UX/humano).
- A janela de milissegundos sob concorrência real pesada: não estressada aqui.

## Risco residual

Baixo para o critério escrito. Persiste a janela de corrida conferência-escrita, já endereçada à F03-E03.

## Motivo do humano

Não se aplica: tudo o que a dimensão exige foi executado localmente. O E2E do painel é validação humana de outra dimensão.
