---
validador: seguranca-aplicacao
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
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Pasta das saídas: `<S>` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L11-seguranca/saidas`.

1. Ação `consultar_oficio` no shared, concedida a operador, coordenador e administrador e não ao agente (`packages/shared/src/permissoes.ts:90-125`): `permissoes.test.ts` verde (`<S>/03-shared.txt`, 185 de 185) e morde (M13).
2. `GET /oficios` e `GET /oficios/:id` passam por `autorizar(app, req, "consultar_oficio")` antes da transação e antes de validar o id (`rotas/oficios.ts:189` e `:226`). Prova por execução (sonda própria, `<S>/10-sonda-l11-log.txt`, bloco "E08"): o agente de Serra Alta e o agente de Vale Fundo, em GET e HEAD, contra lista, lista filtrada pela ocorrência da Alfa e da Bravo, ofício da própria equipe, de outra equipe, de outro município, id inexistente, id em maiúsculas e id malformado: sempre 403 `sem_permissao`, UM corpo só para todas as variantes (não revela existência), sem e-mail do órgão nem IP. `GET /oficios/:id/documento` também 403 (exige `emitir_documento`).
3. 404 entre municípios: coordenador de Vale Fundo em `GET /oficios/<ofício de A>`, na mesma em maiúsculas e em `/documento`: 404; a lista dele não traz o ofício de A; a lista filtrada pela ocorrência de A volta vazia.
4. Sino (`rotas/avisos.ts:409` e `:496`): o agente da Alfa recebe só avisos de ocorrências da Alfa em Serra Alta, igual ao oráculo calculado no banco; `naoLidos` igual à lista; o protocolo da Bravo não aparece no corpo. `POST /avisos/lidos` com aviso da Bravo, de outro município e com id em maiúsculas: `marcados: 0` e `avisos_lidos` sem mudança (hash da tabela).
5. Dossiê: agente da Alfa em ocorrência da Bravo, de outro município e inexistente: 404 com o MESMO corpo; coordenador de B no dossiê de A: 404; lista de evidências de outra equipe ou outro município: `{"itens":[]}`, igual à de id inexistente.
6. Varredura de todo GET registrado com o token do agente (8 ids por parâmetro), procurando no corpo o IP de quem abriu o link, as observações do ofício, o e-mail do órgão, o id e o protocolo da ocorrência da Bravo, ids de outro município: só `GET /orgaos` traz o e-mail do órgão (premissa 5 registrada pela etapa, fora do escopo).
7. Painel esconde "Ofícios" de quem não tem a ação (`apps/web/src/paginas/Ocorrencia.tsx:164,179`, `podeExecutar`): `oficio-so-para-quem-consulta.test.ts` 4 de 4 (`<S>/06-web-oficio.txt`).
8. Regressão: `npm run test:api` 1451 aprovados e 34 pulados (`<S>/04-test-api-completo.txt`); `superficie.test.ts` 9 de 9; shared 185 de 185; `test:isolamento` pelo gatekeeper (345 e 3 pulados).

## Evidência

- API, 16 arquivos ligados (inclui `leitura-do-agente-oficios-e-avisos`, `sino-de-avisos`, `orgaos-e-oficio`, `agente-so-ve-a-equipe`, `superficie`): código 0, 341 de 341 (`<S>/01-api-arquivos-da-etapa.txt`).
- Sonda própria (`<S>/sonda-l11.test.ts`) num worktree esparso meu em `4ce0433`: código 0, 6 de 6 (`<S>/10-sonda-l11-vitest.txt`, log `<S>/10-sonda-l11-log.txt`).
- `npm run test --workspace @dc360/shared`: código 0, 185 de 185 (`<S>/03-shared.txt`).
- Mutações restauradas uma a uma (`<S>/20-mutacoes.txt`, roteiro `<S>/mutar.py`); worktree removido ao fim.

## Cenários positivos

- Operador (Jonas) abre o ofício de A: 200, com o e-mail do órgão (quem consulta continua vendo).
- Coordenação, operador e administração com o município inteiro no sino: caso de `leitura-do-agente-oficios-e-avisos.test.ts` verde.

## Cenários negativos

- Agente (dos dois municípios) em todas as variantes de ofício: 403 idêntico, sem dado.
- Coordenador de outro município: 404 no ofício, no documento do ofício e no dossiê.
- Agente sem equipe: lista vazia e `naoLidos` 0 (caso do repositório, verde).
- `POST /avisos/lidos` fora do recorte: `marcados: 0`, nada gravado.

## Tentativas de reprovar

- M10, `GET /oficios` e `/:id` voltam a só autenticar: 3 casos do repositório e a minha sonda reprovam. Morde.
- M11, contagem do sino sem o recorte: 7 casos do repositório e a sonda reprovam. Morde.
- M12, lista do sino sem o recorte: 7 casos do repositório e a sonda reprovam. Morde.
- M13, `agente_campo` ganha `consultar_oficio` no shared: reprovam `permissoes.test.ts` (2) e as duas tabelas presas por teste (`permissoes-no-readme.test.ts`, inclusive a de `PAPEIS_E_RESPONSABILIDADES.md`, que é da correção 4 da E22). Morde. (As 2 falhas de "Regras de conteúdo" nessa rodada também aparecem no controle sem mutação, porque o worktree é esparso e não tem `mockup/` nem `docs/`; na árvore principal o shared passa 185 de 185.)
- Tentei oráculo por id em maiúsculas (a correção 4 da E09 passou a normalizar o id em `administracao.ts`): nas rotas de ofício o agente recebe o mesmo 403 e o coordenador de B o mesmo 404; no `POST /avisos/lidos` o id em maiúsculas de aviso alheio dá `marcados: 0`.
- Procurei regressão da correção 4: nenhuma linha de `oficios.ts`, `avisos.ts`, `recorte-do-agente.ts` ou `permissoes.ts` mudou em `bb0f654..4ce0433`; a mudança nesta área é o teste novo `permissoes-no-readme.test.ts`, que prende a tabela do README e de `PAPEIS_E_RESPONSABILIDADES.md` ao catálogo (e morde, M13).

## Achados

- anotado: `GET /orgaos` entrega ao agente o catálogo de órgãos com e-mail (premissa 5 da etapa; F04 ou F03-E12).
- anotado: `GET /avisos` continua escrevendo dentro de um GET, e o token do agente também dispara a materialização (pendência registrada, F07-E03 e F04-E11); passa pela vigência (`ROTA_GET_COM_EFEITO`).

## Não verificado

- `npm run test:e2e:api` e a seção 25 do e2e de navegador não rodei; a prova de API foi por `inject` no servidor real com PGlite.
- Coordenador rebaixado a agente continua lendo ofício até o token vencer (vigência só na escrita até a F03-E03): limitação declarada, não sondada.
- CI do SHA ausente (não é evidência mínima desta dimensão).

## Risco residual

A ação nova vale por papel; o recorte por órgão e a consulta nominal do ofício ficam para F04 e F05-E11. A leitura com token de papel antigo segue por até 15 minutos.

## Motivo do humano

Não se aplica a esta dimensão. Sobre o "Motivo do veredito" da rodada 4: era PASS nesta dimensão, sem defeito a consertar; o gatilho visual (E4 do Rafael, seção 25 do e2e) é da dimensão de UX. A correção 4 não alterou as rotas nem a regra da etapa, e as sondas e mutações desta rodada mostram que nada regrediu.
