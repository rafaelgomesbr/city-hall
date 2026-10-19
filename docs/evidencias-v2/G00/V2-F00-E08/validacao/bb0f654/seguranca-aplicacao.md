---
validador: seguranca-aplicacao (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E08
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
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

1. O agente de campo (equipe Alfa, equipe Bravo, sem equipe e agente de outro município) recebe 403 `sem_permissao` em `GET` e `HEAD` de `/oficios`, `/oficios/`, `/oficios?ocorrenciaId=...` e `/oficios/:id` (ofício da equipe dele, de outra equipe, de outro município, id inexistente, id em maiúsculas, id que não é UUID), com o MESMO corpo; nenhum corpo traz e-mail do órgão, IP de quem abriu, observações nem número do ofício. Confirmado.
2. A regra mora no shared (`consultar_oficio` em `permissoes.ts`) e passa por `exigirPermissao` (`autorizar`) antes de transação e antes da validação do id. Confirmado por leitura (`rotas/oficios.ts:189` e `:226`) e por mutação.
3. Operador, coordenador e administrador listam e abrem ofício (200, com o e-mail do órgão). Coordenador do município B: 404 no ofício de A com corpo idêntico ao de id inexistente; a lista e o filtro por ocorrência de A voltam sem o ofício de A; `/oficios/:id/documento` de A também 404. Confirmado.
4. `GET /avisos`: lista e `naoLidos` do agente iguais ao oráculo calculado no banco (só a equipe dele); agente sem equipe: lista vazia e 0; coordenação vê o município; com cursor `desde` o recorte continua; agentes e coordenador de B nunca veem aviso de A. Confirmado.
5. `POST /avisos/lidos` não é oráculo: aviso de outra equipe, de outro município e inexistente dão `marcados: 0` e não gravam; o próprio dá 1. Confirmado.
6. `GET /avisos` escreve e por isso passa pela vigência: coordenador rebaixado a agente com o token antigo recebe 401 no sino. Confirmado.

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/seguranca-aplicacao-E04-E05-E06-E08/` (abaixo, `<S>`).

- Sonda própria `<S>/sonda/agente.test.ts` (servidor montado, PGlite semeado; agentes "Bruno" da Bravo e "Sara" sem equipe criados por mim; ofícios com órgão de e-mail, providência, envio e abertura com IP, em A e em B; avisos em ocorrências da Alfa, Bravo, Charlie e de B): código 0, 6 de 6 (`<S>/agente-saida.txt`); cada pedido e resposta em `<S>/agente-log.txt`.
- Testes na árvore: `leitura-do-agente-oficios-e-avisos` 14 de 14, `sino-de-avisos` 19 de 19, `orgaos-e-oficio` 24 de 24, `agente-so-ve-a-equipe` 9 de 9, `superficie` 9 de 9 (`<S>/api-relevantes-arvore.txt`, código 0); `packages/shared` `permissoes.test.ts` 16 de 16 (`<S>/shared-e05-e08.txt`); `apps/web` `oficio-so-para-quem-consulta.test.ts` 4 de 4 (`<S>/web-e05-e08.txt`); `npm run test:isolamento` 345 aprovados e 3 pulados (`<S>/isolamento.txt`).
- Mordida: mutações numa CÓPIA de `dc360/apps/api` em `<S>/api-mut` (árvore intocada; `diff -r` vazio depois), testes do implementador na cópia e a minha sonda apontada para a cópia (`<S>/mutacoes-api.txt`):
  - M5, `rotas/oficios.ts` com `autorizar(app, req, "consultar_oficio")` trocado por `app.exigirAutenticacao(req)` na lista: teste do implementador 2 reprovam, minha sonda 1 (o agente recebe 200 na lista);
  - M6b, contagem do sino sem recorte (`eRecorteDoAgente` chamado como se o papel fosse coordenador, consulta válida): teste do implementador 2 reprovam, minha sonda 1 (`naoLidos` do Diego 3 onde o oráculo diz 1);
  - M7b, lista do sino sem recorte, pelo mesmo meio: teste do implementador 5 reprovam, minha sonda 1 (o Diego recebe os 3 avisos do município onde o oráculo diz 1);
  - uma primeira versão (M6 e M7, apagando o trecho do SQL) deixava um parâmetro sobrando e fazia a rota responder 500; foi descartada como prova de mordida e está registrada como tal na saída.

## Cenários positivos

- Jonas (operador), Helena (coordenadora) e Rita (administradora): `GET /oficios` 200 e `GET /oficios/:id` 200 com o e-mail do órgão.
- Sino: Diego (Alfa) 1 item e 1 não lido, igual ao oráculo; Bruno (Bravo) 1 e 1; Helena 3 e 3 (o município inteiro); marcar o próprio aviso: `marcados: 1`.

## Cenários negativos

- 4 agentes x 13 variantes de URL x GET e HEAD: 403 em todas, exceto `/oficios/:id/` com barra final, que é 404 "Rota não encontrada." (rota que não existe, igual para qualquer id e qualquer papel, não revela nada). `/oficios/:id/documento` responde 403 com a mensagem da ação `emitir_documento` (outra ação, mesma regra).
- Aurélio (coordenador de B): ofício de A 404 com corpo idêntico ao do id inexistente (`{"erro":"nao_encontrado","mensagem":"Ofício não encontrado."}`); filtro pela ocorrência de A: `{"itens":[]}`.
- Sara (sem equipe): sino vazio e `naoLidos` 0. Tarcísio e Aurélio (B): nenhum aviso de A.
- `POST /avisos/lidos` do Diego com o aviso da Bravo, de B e inexistente: `marcados: 0`, `avisos_lidos` inalterado.

## Tentativas de reprovar

1. Variações de caminho e de id (maiúsculas, não UUID, barra final, inexistente, de outro município) para achar um 422, 404 ou 200 que diferencie existência: nenhum.
2. HEAD em vez de GET: mesma recusa.
3. Rota vizinha que expõe o mesmo ofício (`/oficios/:id/documento`): fechada ao agente pela ação de emissão, e 404 entre municípios.
4. Cursor do sino (`desde`) para escapar do recorte: o recorte continua.
5. Diferença entre `naoLidos` e a lista como oráculo: ambos batem com o oráculo do banco.
6. Marcar como lido como oráculo: zero para tudo o que o agente não vê.
7. Papel alterado depois do token: o sino cai pela vigência (401).
8. Mutações M5, M6b e M7b: os testes e a sonda reprovam pelo vazamento em si, não por erro de consulta.
9. Leituras vizinhas do agente sobre a ocorrência da Bravo: dossiê 404, evidências `{"itens":[]}`, laudo e trilha 403 (`<S>/agente-log.txt`, linhas "E08-vizinhas").

## Achados

- Nenhum que quebre critério da etapa.
- Anotado (já registrado pelo implementador como fora do escopo, F04 ou F03-E12): `GET /orgaos` responde 200 ao agente com o catálogo de órgãos e o e-mail de cada um (`<S>/agente-log.txt`, última linha). É e-mail institucional de órgão, não dado pessoal do cidadão, mas é a mesma classe de exposição que a etapa fechou nos ofícios.
- Anotado (declarado, F03-E03): coordenador rebaixado a agente continua lendo ofício com o token antigo (200) até o token vencer, porque `GET /oficios/:id` é leitura pura e não confere a vigência.

## Não verificado

- CI do SHA não lido (`gh` sem login).
- Telas do painel (cartão "Ofícios de encaminhamento" escondido do agente, capturas): não são desta dimensão; o teste de fonte e de modo local do painel (`oficio-so-para-quem-consulta`) foi rodado.
- A seção 25 do E2E (`fluxo-api.e2e.mjs`) com navegador não foi rodada por mim.
- A escrita dentro do `GET /avisos` disparada pelo token do agente continua (materializa prazos do município inteiro); conferi só que o que volta a ele está recortado, não o volume de escrita.
- Sino truncado (mais avisos que o teto): não semeei volume para forçar `truncada`.

## Risco residual

- Até a F03-E03, leitura de ofício com papel antigo por até 15 minutos.
- Até a F04 ou F03-E12, o catálogo de órgãos com e-mails segue legível pelo agente.
- O GET que escreve (`/avisos`) segue escrevendo para qualquer papel; pendência da F07-E03 e F04-E11.

## Motivo do humano

Nenhum para esta dimensão: os critérios de autorização e minimização foram provados por execução, com sonda negativa e mutação.
