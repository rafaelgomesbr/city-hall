---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E08
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, MOBILE, OFFLINE, A11Y, AUTH, AUTHZ, TENANT, RLS, DB, MIGRATION, API, LGPD, DOCUMENTO, ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Produto de `1ed0b71` (árvore principal em `5044e7a`, só `STATUS.md` e `ESTADO-ATUAL.md` diferem). Mutações e sondas num worktree meu destacado em `1ed0b71`, com `@dc360/shared` recompilado a cada mutação do pacote e de novo depois de restaurar. Saídas em `SCRATCH/validadores/qa/`. Desde a rodada 4 nenhum arquivo da etapa mudou (`oficios.ts`, `avisos.ts`, `recorte-do-agente.ts`, `permissoes.ts`); o que mudou em volta foi a guarda de códigos de erro, que esta validação exercita.

| Critério | Prova | Resultado |
| --- | --- | --- |
| Negativo: agente em `GET /oficios` e `GET /oficios/:id` recebe 403 `sem_permissao` | `leitura-do-agente-oficios-e-avisos` 14 de 14 (`saidas/01`); sonda própria com 13 variantes (lista, barra no fim, HEAD, filtro por ocorrência de outra equipe, ofício da equipe, de outra equipe, de outro município, id em maiúsculas, HEAD da ficha, id torto, id inexistente): todas 403 com o MESMO corpo, sem e-mail, observação, número nem IP (`saidas/36`) | PASS |
| Negativo: agente sem equipe vê lista vazia e `naoLidos` 0 | `leitura-do-agente-oficios-e-avisos` verde (`saidas/01`) | PASS |
| Positivo: operador, coordenador e administrador listam e abrem ofício (200); coordenação vê o mesmo sino | suíte da etapa verde; na sonda, o operador abre a ficha (200) e a coordenadora lista (200) | PASS |
| Autorização e isolamento: agente da Bravo não vê nem conta aviso da Alfa; coordenador de B abre ofício de A: 404 | sonda: aviso novo da Bravo criado DEPOIS do primeiro pedido não aparece nem conta para o agente da Alfa, `naoLidos` igual ao oráculo calculado no banco (com a mesma margem de 10 s da rota), o agente da Bravo vê o dele e não o da Alfa; coordenador de Vale do Fundo 404 na ficha de Serra Alta; agente de Vale do Fundo recebe a mesma recusa 403 da ação | PASS |
| `POST /avisos/lidos` não é oráculo | sonda: aviso de outra equipe `marcados: 0`, da própria equipe `marcados: 1` | PASS |
| Ação nova testada no shared e na API | `npm run test --workspace @dc360/shared` 18 arquivos, 223 de 223 (`saidas/04`); mutação M6 abaixo | PASS |
| Frontend esconde "Ofícios" de quem não tem a ação | e2e seção 25: "o agente abre o dossie da propria equipe, sem faixa de erro", "e o cartao de oficios nem aparece para ele", "o operador abre o mesmo dossie e continua vendo o cartao de oficios" (`saidas/08`) | PASS |
| E2E: com o token do agente da semente, `GET /oficios` 403 e o sino só da equipe | e2e seção 25, 14 de 14 `OK` (`saidas/08`) | PASS |
| Regressão obrigatória | `npm run test:api` 1624 de 1624 (`saidas/01`); `test --workspace @dc360/shared` (`saidas/04`); `test:isolamento` 345 e 3 pulados (`saidas/03`); `superficie.test.ts` 9 de 9; `test:e2e:api` 288 e 149 `OK`, 0 falha (`saidas/08`) | PASS |
| DoD: pendência da escrita em GET registrada | `apps/api/PENDENCIAS.md` (F07-E03, F04-E11) e a marca `ROTA_GET_COM_EFEITO` em `GET /avisos` | PASS |

## Evidência

- `saidas/01-test-api.txt`, `saidas/03-isolamento.txt`, `saidas/04-shared.txt`, `saidas/08-e2e-api.txt`: códigos 0.
- `saidas/36-sonda-oficio-agente.txt`: sonda própria `sondas/zz-qa-oficio-agente.test.ts`, 2 de 2, código 0, com a lista das respostas por variante.
- `mut/E08-M1` a `mut/E08-M6`: mutações (`mutar.py`).

## Cenários positivos

- Operador abre a ficha do ofício da Bravo (200); coordenadora lista os ofícios (200).
- Agente da Bravo vê o aviso da própria equipe no sino; o agente da Alfa marca como lido o aviso da Alfa (`marcados: 1`).

## Cenários negativos

- Agente: 403 `sem_permissao` idêntico para ofício que existe, que não existe, de outra equipe, de outro município, com id torto ou em maiúsculas, e no HEAD; um corpo só em todas as variantes da ação `consultar_oficio` (não há oráculo pelo id). `/oficios/:id/documento` e `POST /oficios/:id/envio`: 403 pelas ações delas.
- Barra no fim da ficha (`/oficios/<id>/`): 404 "Rota não encontrada.", o mesmo corpo para id existente e inexistente.
- Aviso de outra equipe: nem na lista, nem na contagem, nem marcável.
- Coordenador de outro município: 404 na ficha.

## Tentativas de reprovar

Mutações no worktree, restauradas e conferidas:

- M1, `GET /oficios` só com autenticação: 2 de 38 reprovam.
- M2, `GET /oficios/:id` só com autenticação: 2 de 14.
- M3, contagem de não lidos sem o recorte: 7 de 33.
- M4, lista sem o recorte: 7 de 33.
- M5, `POST /avisos/lidos` sem o recorte: 1 de 33.
- M6, o agente ganha `consultar_oficio` no shared (dist recompilado): `permissoes.test.ts` 2 de 16 e a suíte da etapa 3 de 14.
- Tentei caminhos que a suíte da etapa não usa (HEAD, maiúsculas, barra no fim, filtro de outra equipe, aviso criado depois do primeiro pedido, agente de outro município): nenhum vazou.

## Achados

- Nenhum achado novo. Continuam anotados das rodadas anteriores, fora do escopo: `/documentos/validar` mostra dados básicos de ofício a quem tem o código impresso; `GET /orgaos` mostra e-mails dos órgãos ao agente; a linha do tempo mostra ao agente número e órgão do ofício. Não reconferidos aqui.

## Não verificado

- Os três anotados acima (escopo da F03-E12 e da F04).
- A tela do painel foi exercitada pelo e2e em Chromium; capturas e portão visual são da dimensão de UX.
- Leitura com token de quem foi rebaixado de coordenador a agente, por até 15 minutos (vigência em leitura é da F03-E03).
- CI do SHA ausente (H32).

## Risco residual

A escrita dentro de `GET /avisos` continua (registrada para a F07-E03 e a F04-E11) e o token do agente a dispara; o que ele lê de volta está recortado. Um papel novo que ganhe a ação por engano voltaria a ler ofício: a mutação M6 prova que os testes pegam isso.

## Motivo do humano

não se aplica
