---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E12
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [API, DOCUMENTO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Notação: `$V` é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/qa`. Produto de `1ed0b71` igual ao do HEAD em `dc360/`. Desde a rodada 4 (`bb0f654`) `apps/api/src/saida/pacote.ts` não mudou; mudaram `servidor.ts` (guarda global de códigos de erro no `onSend`, da E05) e `auth/servico.ts`, que passam no caminho do download do pacote: por isso o e2e completo foi rodado.

| Critério | Prova | Resultado |
| --- | --- | --- |
| O teste vermelho de `saida-de-municipio.test.ts` passa | `test/saida-de-municipio.test.ts`, 37 de 37 dentro do `test:api` | PASS |
| Vistoria F1 (Alfa designada, agente da Bravo): trecho do aviso do pacote igual ao da rota | caso "equipes diferentes: o trecho do aviso é o MESMO nos dois laudos" verde; e2e seção 29: "o laudo DO PACOTE traz o mesmo aviso" e "o trecho do aviso e IDENTICO nos dois documentos, palavra por palavra" OK | PASS |
| Equipes iguais não imprimem aviso (negativo) | caso verde; e2e "o laudo da coleta sem divergencia NAO ganha aviso de equipe no pacote" OK | PASS |
| Sem despacho: só a nota própria (negativo) | mutação E12-3 (`sem_despacho` sempre falso): reprova "coleta sem despacho: a nota própria" | PASS |
| Agente sem equipe: frase própria (negativo) | mutação E12-1: reprova "agente sem equipe registrada: a frase própria" | PASS |
| Vistoria anterior à 024, colunas nulas: nada (negativo) | mutação E12-4 (junção interna com a equipe designada): 5 reprovam, entre eles "vistoria anterior à migração 024 ... nenhum aviso falso" | PASS |
| Isolamento: o ZIP de A não cita equipe de B | caso de isolamento verde; e2e "nenhum arquivo do pacote cita a equipe de Vale Fundo" OK; `npm run test:isolamento` código 0 | PASS |
| Correções 1 a 3 (coordenada, assinatura, perdidas) continuam presas | mutação E12-5 (coordenada fora da consulta): reprova "a coordenada da vistoria sai IGUAL nos dois laudos"; os casos de assinatura e perdidas seguem verdes | PASS |
| Pendência do montador único registrada | `dc360/apps/api/PENDENCIAS.md` e `dc360/docs/SAIDA-DE-MUNICIPIO.md` citam os dois montadores e a F09-E02 (lidos) | PASS |
| Regressão obrigatória: `test:api`, `test:isolamento`, `test:e2e:api` | os três com código 0 | PASS |

## Evidência

- `npm run test:api`: código 0, 106 arquivos, 1590 aprovados, 34 pulados (Postgres real da renovação, sem `DC360_POSTGRES_DE_PROVA`). `$V/r-test-api.txt` (linha `saida-de-municipio.test.ts (37 tests)`).
- `npm run test:isolamento`: código 0, 14 arquivos, 345 aprovados, 3 pulados. `$V/r-test-isolamento.txt`.
- `npm run test:e2e:api` (Chromium, API e painel do zero em portas próprias): código 0; roteiro principal "Passou: 288 Falhou: 0", segundo roteiro "Passou: 149 Falhou: 0", "Zero erro de console". Seções 28 (download do pacote pelo painel, "o download nao falhou no meio") e 29 (aviso de equipe) inteiras em OK. `$V/r-test-e2e-api.txt`.
- `npm test` completo: código 0. `$V/r-npm-test.txt`.
- Mutações em `apps/api/src/saida/pacote.ts` num worktree destacado em `1ed0b71`, rodando `npx vitest run test/saida-de-municipio.test.ts` (37 casos; sem mutação 37 de 37): `$V/muts-e12.json`, resumo `$V/mut-e12-resumo.txt`, saída bruta com diff em `$V/mut/E12-1.txt` a `E12-5.txt`.

## Cenários positivos

- Divergência montada pela API de verdade (despacho para a Bravo, coleta do agente da Alfa por `POST /sincronizacao/vistoria`), pacote baixado pelo painel, trecho do aviso idêntico ao do laudo de `GET /documentos/:id/laudo`.

## Cenários negativos

- Equipes iguais, sem despacho, agente sem equipe, colunas nulas: cada ramo preso por teste que morde (E12-1, E12-3, E12-4).
- Pacote de Serra Alta sem nome de equipe de Vale Fundo (teste e e2e).
- `POST /pacote.zip` na raiz e `GET /saida/pacote.zip` não baixam nada (e2e seção 28).

## Tentativas de reprovar

1. Tirar os nomes das equipes da consulta (E12-1): 3 reprovam.
2. Trocar os dois nomes entre si (E12-2, aviso com as equipes invertidas): 3 reprovam; o teste compara a frase literal, não só a presença.
3. `sem_despacho` sempre falso (E12-3): 1 reprova.
4. Junção interna (E12-4), que apagaria vistorias antigas do pacote: 5 reprovam.
5. Coordenada fora (E12-5, regressão da correção 1): 1 reprova.
6. Regressão pela guarda global do `onSend` (E05) no download binário do ZIP: o e2e completo baixa o pacote duas vezes pelo painel e lê o ZIP com leitor independente; passou.

## Achados

Nenhum achado novo. Continuam valendo os da rodada 4, fora do critério da etapa: as diferenças declaradas entre os dois montadores (F09-E02) e o termo de desinterdição do pacote.

## Não verificado

- O e2e foi rodado só em Chromium (a evidência do implementador cobre Firefox nas seções 28 e 29).
- A comparação humana dos dois laudos não foi feita por mim; o e2e compara o trecho palavra por palavra, que é prova E1/E2 do mesmo fato.
- Isolamento por mutação da RLS: não refiz (é da dimensão de banco); conferi o teste e o e2e.
- CI do SHA: ausente (H32).

## Risco residual

Os dois montadores continuam existindo até a F09-E02; campo novo do laudo pode voltar a divergir. O teste "campo por campo" prende os campos conhecidos, não o documento inteiro.

## Motivo do humano

não se aplica
