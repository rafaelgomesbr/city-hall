---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E08
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [UI, A11Y, AUTH, AUTHZ, API, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Diretório de trabalho (abaixo, `S`): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L09-red-team`. Worktree próprio em `4ce0433`, PostgreSQL 17.6 próprio, sonda `S/sonda/zz-l09-redteam.test.ts` (API real em porta efêmera, papel `dc360_app` com RLS forçada). Ofícios criados por fora como dono das tabelas, cada um com envio e abertura com IP (`203.0.113.77`), observações e e-mail de órgão, em três lugares: ocorrência da Equipe Alfa, da Equipe Bravo e de Vale Fundo.

| Critério (DoD e cinco campos) | Prova | Resultado |
| --- | --- | --- |
| Agente em `GET /oficios` e `GET /oficios/:id`: 403 `sem_permissao` | agente de Serra Alta (Alfa) e agente de Vale Fundo, 13 variantes cada (lista, lista filtrada, ofício da equipe, de outra equipe, de outro município, inexistente, id malformado, id em maiúsculas, HEAD da lista e da ficha, barra final, `/documento`, `POST /envio`): 26 de 26 403; os GET de leitura têm UM corpo só, idêntico para todo id; nenhum corpo traz e-mail, observações nem o IP (`S/saidas/10-sonda-pg17.log`, `S/saidas/11-sonda-pg17-completa.log`). `/documento` responde o 403 da ação `emitir_documento`, também igual para todo id | PASS |
| Operador, coordenador e administrador consultam (positivo) | operador de Serra Alta abre o ofício da Bravo: 200 com `orgao_email`; `leitura-do-agente-oficios-e-avisos.test.ts` verde (`S/saidas/01-api-arquivos-das-etapas.txt`) | PASS |
| Coordenador do município B abre ofício de A: 404 | coordenador de Vale Fundo: ficha 404, lista sem o ofício de A | PASS |
| Agente da Bravo não vê nem conta aviso da Alfa | sino do Diego comparado a um oráculo calculado no banco (avisos de ocorrências da equipe dele, até o `ate` da resposta): lista igual ao oráculo e `naoLidos` igual ao tamanho dela; movido para a Bravo pela rota de quem administra, COM O MESMO TOKEN, o sino passa a ser exatamente o da Bravo, nenhum aviso da Alfa, e marcar como lidos os da Alfa responde `marcados: 0` | PASS |
| Agente sem equipe: lista vazia e `naoLidos` 0 | equipe tirada pela rota: 0 itens, `naoLidos` 0 | PASS |
| Nada de outro município no sino | aviso de Vale Fundo inserido por fora: não aparece para a coordenação de Serra Alta e `POST /avisos/lidos` com o id dele marca 0 | PASS |
| Ação nova testada no shared e na API | `packages/shared` 185 de 185 (`S/saidas/03-shared.txt`, inclui `permissoes.test.ts` e o novo `permissoes-no-readme.test.ts` da correção 4); `leitura-do-agente-oficios-e-avisos`, `sino-de-avisos`, `agente-so-ve-a-equipe`, `orgaos-e-oficio` e `superficie` verdes nos 193 de 193 | PASS |

## Evidência

- Sonda em PG 17.6: código 0, 15 de 15, 0 FALHA (`S/saidas/11-sonda-pg17-completa-vitest.txt` e `.log`; a primeira rodada verde, 14 de 14, em `S/saidas/10-sonda-pg17.log`).
- `npx vitest run --root apps/api` com 12 arquivos: código 0, 193 de 193 (`S/saidas/01-api-arquivos-das-etapas.txt`).
- `npx vitest run --root packages/shared`: código 0, 185 de 185 (`S/saidas/03-shared.txt`).
- Prova de que morde (mutação no meu worktree, restaurada com `git checkout`):
  - M6, `GET /oficios` e `GET /oficios/:id` só com `exigirAutenticacao`: a sonda reprova (lista e fichas da Alfa e da Bravo 200 ao agente, 9 corpos distintos) (`S/saidas/20-mut-M6-oficios-so-autenticacao.log`); o teste da etapa reprova 3 de 14 (`S/saidas/21-repo-M6.txt`).
  - M7, contagem do sino sem o recorte: a sonda reprova (`naoLidos` 5 com 2 itens, e 5 sem equipe) (`S/saidas/20-mut-M7-contagem-sem-recorte.log`); o teste da etapa reprova 2 de 14 (`S/saidas/21-repo-M7.txt`).
  - M8, lista do sino sem o recorte: a sonda reprova (5 itens onde o oráculo diz 2, e 5 sem equipe) (`S/saidas/20-mut-M8-lista-sem-recorte.log`).
  - M2 (ver E04), `comEfeito` ignorado: o sino volta a responder 200 a token rebaixado, desativado e de sessão encerrada (`S/saidas/20-mut-M2-sem-comEfeito.log`).

## Cenários positivos

- Operador abre a ficha do ofício com o e-mail do órgão (ele tem `consultar_oficio`).
- O sino do agente acompanha a equipe do CADASTRO na hora (a equipe não vem do token).
- Coordenação vê o município inteiro e nunca o de outro município.

## Cenários negativos

Agente da própria cidade e de outra cidade em todas as variantes de ofício (403 da ação, corpo único); coordenação de outro município (404, nunca 403); agente de outra equipe e sem equipe no sino (lista e contagem iguais ao oráculo); marcar como lido aviso de outra equipe e de outro município (0, sem oráculo). Token velho no sino, que é rota com efeito: coordenadora rebaixada a agente 401 `nao_autenticado`, conta desativada 403 `conta_desativada`, sessão encerrada 401 `sessao_encerrada`.

## Tentativas de reprovar

1. Id em maiúsculas e malformado para distinguir "existe" de "não existe": o 403 vem antes da validação do id, corpo idêntico.
2. HEAD e barra final: mesma recusa.
3. Rota vizinha `/oficios/:id/documento` e `POST /oficios/:id/envio`: recusa pela ação delas (`emitir_documento`, `encaminhar_providencia`), que o agente não tem.
4. Trocar a equipe do agente sem trocar o token, para ver se o recorte segue a equipe velha: segue a nova, na hora.
5. Procurar outro caminho de leitura de ofício: `GET /documentos/validar/:codigo` lê `oficios` para qualquer papel autenticado, mas só devolve com o código de 12 hexadecimais impresso no documento (48 bits, sem enumeração), então não é a listagem que a etapa fecha. O pacote de saída (`saida/pacote.ts`) é do console. Nenhum caminho novo.
6. Regressão da correção 4: `permissoes.ts` não mudou; a correção acrescentou `permissoes-no-readme.test.ts` (tabela do README presa à de `PERMISSOES`), verde; `codigos-de-erro.ts` não toca `sem_permissao`.

## Achados

- **anotado** (limitação registrada pela etapa, F03-E03): coordenadora rebaixada a agente continua lendo `GET /oficios` e a ficha (200) com o token velho por até 15 minutos, porque leitura pura confere o papel do token. Reproduzido na sonda (`GET /oficios` 200, `GET /oficios/<bravo>` 200). O sino, que é rota com efeito, já recusa (401).
- **anotado** (premissa 5 da etapa, fora do escopo): `GET /orgaos` segue respondendo ao agente com o e-mail de cada órgão.
- Nenhum achado que bloqueie.

## Não verificado

- O painel (`Ocorrencia.tsx` escondendo o cartão) e a seção 25 do e2e de navegador: não rodei navegador nesta dimensão; a prova da tela é da dimensão UX e das capturas arquivadas.
- `npm run test:api` completo e `npm run test:e2e:api`: rodei os arquivos das etapas e a sonda.
- O run do CI do SHA (ausente).

## Risco residual

Leitura de ofício com papel antigo por até 15 minutos depois do rebaixamento (F03-E03). A escrita dentro do `GET /avisos` continua (F07-E03 e F04-E11), agora sob a vigência.

## Motivo do humano

A "Validação humana" da etapa pede que o Rafael veja a sonda do agente antes (200 com o e-mail do órgão) e depois (403), e o veredito da rodada 4 deixou o E4 visual da jornada nova (seção 25) para ele. Item do "Motivo do veredito" da rodada 4 (PASS de QA, Segurança, Red-team e UX; E4 visual pendente): a correção 4 não tocou ofícios nem avisos (`oficios.ts`, `avisos.ts`, `recorte-do-agente.ts` e `permissoes.ts` iguais a `bb0f654`); a prova desta rodada (26 pedidos negativos de ofício, sino igual ao oráculo em três estados de equipe, mutações M6, M7 e M8 mordendo) mostra que nada regrediu. A pendência visual segue para o Rafael.
