---
validador: seguranca-aplicacao (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E08
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [UI, AUTH, AUTHZ, API, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

A rodada 2 foi PASS (com a anomalia do sino investigada e descartada). Reexecutei a leitura de ofícios e avisos pelo agente e o efeito colateral do `GET /avisos` neste SHA.

| Critério | Resultado | Prova |
| --- | --- | --- |
| Agente em `GET /oficios` e `GET /oficios/:id`: 403 `sem_permissao`, antes de abrir transação, sem revelar o que existe | PASS | sonda própria (`54-e08-sonda-agente.txt`): agente 403 `sem_permissao` na lista e na ficha; coordenadora 200; sem token 401 `nao_autenticado`. `oficios.ts:188,222` chamam `autorizar(..., "consultar_oficio")` antes do `idSchema` |
| Ação `consultar_oficio` mora no shared, concedida a operador/coordenador/administrador e NÃO ao agente | PASS | `packages/shared/src/permissoes.ts:27,93,105,122` (tem a ação) e `:96` (`agente_campo: ["registrar_vistoria"]` só); `permissoes.test.ts` 16/16 (`55-shared-permissoes.txt`) |
| `GET /oficios` e `/oficios/:id` sem a permissão reabrem o vazamento (o teste morde) | PASS | mutação MF (`oficios.ts` GET com `exigirAutenticacao` em vez de `autorizar`): 2 de 14 vermelhos (`51-mutacao-MF`) |
| Sino do agente recortado à equipe; contagem bate com a lista (sem oráculo) | PASS | mutação MG (lista sem recorte): 5 de 33 vermelhos (`52-mutacao-MG`); mutação MH (contagem sem recorte): 2 de 33 (`53-mutacao-MH`). Sonda: agente de Serra Alta sem itens de outra equipe, `naoLidos` igual à lista (`54-...`) |
| Isolamento: coordenador de outro município não vê o ofício, e o agente de outro município também 403 | PASS | sonda: coordenador de Vale Fundo não recebe o ofício de Serra Alta (`54-...`); `test:isolamento` do validador de banco (345/3) |
| `GET /avisos` sem efeito colateral acumulado (idempotente, só do município do token) | PASS | sonda: duas chamadas seguidas do agente deixam a mesma contagem de linhas em `avisos` (3 → 3, `54-...`); a materialização usa `NOT EXISTS`+`ON CONFLICT` (`avisos.ts:278-300`) |
| Operador, coordenador e administrador listam e abrem ofício; o sino deles segue o município inteiro | PASS | `leitura-do-agente-oficios-e-avisos.test.ts`, `orgaos-e-oficio.test.ts`, `sino-de-avisos.test.ts`, `agente-so-ve-a-equipe.test.ts`: 66/66 (`50-e08-base.txt`) |

Nenhum defeito das rodadas 1 e 2 desta dimensão reabre: a ação `consultar_oficio` e o recorte do sino seguem presos por teste e por mutação.

## Evidência
- `50-e08-base.txt`: 4 suítes da E08, 66/66.
- `51-mutacao-MF` / `52-mutacao-MG` / `53-mutacao-MH`: as três mutações mordem (oficios sem permissão; lista e contagem sem recorte).
- `54-e08-sonda-agente.txt`: sonda independente (`$SP/val/seguranca-aplicacao/sondas/e08-agente.test.ts`).
- `55-shared-permissoes.txt`: catálogo de permissões 16/16.
- Saídas em `$SP/val/seguranca-aplicacao/`.

## Cenários positivos
- Operador/coordenador/administrador listam e abrem ofício (200); sino deles com o município inteiro (`50-...`).
- Agente lê o sino da própria equipe (`54-...`).

## Cenários negativos
- Agente em `/oficios` e `/oficios/:id`: 403 `sem_permissao`, igual para id que existe e id que não existe (`54-...`).
- Sem token: 401 `nao_autenticado`.
- Mutações MF/MG/MH: sem a permissão ou sem o recorte, a árvore fica vermelha.

## Tentativas de reprovar
1. Removi `autorizar("consultar_oficio")` de `GET /oficios` (MF): 2 vermelhos. A ação é o que segura.
2. Zerei o recorte da lista (MG) e da contagem (MH) do sino: 5 e 2 vermelhos. O recorte à equipe morde nas duas.
3. Chamei `GET /oficios` com o token do agente (lista, ficha, id inexistente) e com o token de coordenador de outro município: 403 e lista sem o ofício alheio.
4. Chamei `GET /avisos` duas vezes com o token do agente e contei as linhas de `avisos`: não cresceu (materialização idempotente).

## Achados
**CORRIGE ANTES DE CRESCER (herdado, não bloqueia)**
1. `GET /orgaos` (e-mail e telefone) e `GET /equipes` (`em_atendimento`) respondem 200 ao agente. Adiado pelo bloco para a F04. Anotado já na rodada 2.
2. `GET /documentos/validar/:codigo` devolve ofício de outra equipe com o código de 48 bits impresso. Anotado (manifesto rota x ação, F03-E12).

**ANOTADO**
3. O papel na leitura vem do token: coordenadora rebaixada a agente ainda lê ofícios e sino até o token vencer (F03-E03). Mesma classe do risco residual da E04.

## Não verificado
- A escrita dentro do `GET /avisos` (materialização) permanecer por design até F07-E03/F04-E11: a vigência passou a valer nela (E04), mas a escrita em GET segue registrada como pendência. Confirmei só que é idempotente e do município do token.
- Capturas de UI (dimensão UX).

## Risco residual
- Leitura do agente limitada por `consultar_oficio` e pelo recorte do sino; o resíduo é a leitura com token vivo de papel desatualizado (F03-E03) e os campos de `/orgaos` e `/equipes` adiados para a F04.

## Motivo do humano
Nenhum.
