---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E12
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
herdado_de:
tags: [API, DOCUMENTO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

SCRATCH abaixo é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-qa-e09a13`. Árvore em `55209ab` (produto idêntico a `fd17ff4`). `apps/api/src/saida/pacote.ts`, `rotas/documentos.ts` e `documentos/laudo.ts` não mudaram em `1ed0b71..fd17ff4`; mudou o caminho por onde o pacote sai (guarda de códigos de erro, `servidor.ts` com a validação do status de `RegraDeNegocio`, `auth/suspensao.ts`). Por isso rodei a suíte, o isolamento e o e2e do download com o laudo.

| Critério | Resultado | Prova |
| --- | --- | --- |
| O teste vermelho de `saida-de-municipio.test.ts` passa | atende | `saida-de-municipio.test.ts` 37 de 37 dentro de `npm run test:api` (`SCRATCH/02-test-api.txt`, código 0) |
| Vistoria F1 (Alfa designada, agente da Bravo): o trecho do aviso do pacote é igual ao da rota | atende | caso da suíte verde; e2e seção 29, 15 de 15 OK em Chromium e em Firefox (`SCRATCH/10-e2e-api-chromium.txt`, `11-e2e-api-firefox.txt`): "o laudo DO PACOTE traz o mesmo aviso, e nao o papel limpo" e "o trecho do aviso e IDENTICO nos dois documentos, palavra por palavra" |
| Negativo: equipes iguais não imprimem aviso | atende | caso da suíte; e2e "o laudo da coleta sem divergencia NAO ganha aviso de equipe no pacote" (dois motores); no ZIP da minha sonda, semente intacta: os três documentos de `documentos/` (laudos 000473 e 000474, termo 000473) sem "estava designada" (`SCRATCH/80-sonda-e11-api.txt` e conferência por `unzip -p`) |
| Negativo: sem despacho só com a nota própria; agente sem equipe com a frase própria; vistoria anterior à 024 sem aviso falso | atende | casos correspondentes de `saida-de-municipio.test.ts` verdes (37 de 37) |
| Isolamento: o ZIP de A não cita equipe de B; `test:isolamento` verde | atende | e2e "nenhum arquivo de dado cita Vale Fundo nem o id dele" (dois motores); sonda: zero linha fora de Serra Alta, Vale Fundo só em comentário de migração; `npm run test:isolamento` código 0, 345 e 3 pulados (`SCRATCH/04-test-isolamento.txt`) |
| Pendência do montador único registrada | atende | `dc360/apps/api/PENDENCIAS.md` e `dc360/docs/SAIDA-DE-MUNICIPIO.md` não mudaram no diff e continuam citando os dois montadores e a F09-E02 (`git diff 1ed0b71..fd17ff4 --stat` sem esses arquivos) |
| Regressão obrigatória: `test:api`, `test:isolamento`, `test:e2e:api` | atende | os três com código 0 (`02`, `04`, `10`) |
| Validação humana (Rafael compara os dois laudos da F1) | pendente | fora do alcance do validador |

## Evidência

- `npm run test:api`: código 0, 1685 aprovados, 34 pulados (`SCRATCH/02-test-api.txt`).
- `npm run test:isolamento`: código 0 (`SCRATCH/04-test-isolamento.txt`).
- `node scripts/e2e-api.mjs chromium` e `firefox`: código 0, seções 28 e 29 inteiras OK (`SCRATCH/10-...`, `11-...`).
- ZIP baixado pela sonda da E11 contra API própria e conferido por `unzip -p` (`SCRATCH/80-sonda-e11-api.txt`; ZIP só no SCRATCH, semente sintética).
- Varredura dos status de `RegraDeNegocio` no código da API (por `grep`): todos inteiros entre 400 e 507, nenhum que a validação nova do construtor recusaria no caminho do pacote ou dos documentos.

## Cenários positivos

- Coleta da Equipe Alfa numa ocorrência despachada para a Bravo: o laudo da rota e o do pacote trazem o mesmo trecho, palavra por palavra (dois motores).

## Cenários negativos

- Coleta da equipe designada: nenhum aviso no pacote (e2e e semente).
- Sem despacho, agente sem equipe e vistoria antiga com colunas nulas: só a frase própria ou nada (suíte).
- Nenhum nome ou id de Vale Fundo nos dados do pacote de Serra Alta.

## Tentativas de reprovar

1. A validação nova de `RegraDeNegocio` (status inteiro de 400 a 599) poderia transformar uma recusa do montador em 500: procurei todo `new RegraDeNegocio(` com status, inclusive os de várias linhas; todos são 403, 404, 409, 422, 502, 503 ou 507. Nada no caminho do pacote é recusado.
2. Procurei aviso falso no pacote da semente intacta (sem divergência): nenhum.
3. Rodei o laudo do pacote no Firefox além do Chromium, já que o download passa pelo navegador: igual.

## Achados

Nenhum achado. 

## Não verificado

- Mutação em `saida/pacote.ts` para ver os casos de borda morderem: não refeita nesta rodada (edição da árvore recusada pelo ambiente); a rodada 6 registrou cinco mutações (E12-1 a E12-5) que reprovam os casos certos, e o arquivo não mudou desde então.
- Os logs do run 39420436042 (exigem token).

## Risco residual

Os dois montadores (rota e pacote) continuam separados até a F09-E02: um campo novo no laudo da rota pode faltar de novo no pacote; o e2e da seção 29 só compara o trecho do aviso de equipe.

## Motivo do humano

A etapa pede que Rafael compare o laudo emitido pela rota com o do pacote para a vistoria F1 (integridade de documento jurídico, leitura de quem assina).
