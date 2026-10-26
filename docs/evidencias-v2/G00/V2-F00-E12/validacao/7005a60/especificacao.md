---
validador: especificacao
modelo: claude-sonnet-5-5
etapa: V2-F00-E12
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
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

Base: HEAD 665b2be (só STATUS difere de 7005a60). Matriz requisito, implementação, evidência (arquivo:linha em `dc360/apps/api`).

| Requisito do bloco | Implementação | Evidência (rodei: sim) |
| --- | --- | --- |
| Objetivo: laudo do pacote imprime o mesmo aviso de equipe do laudo da rota | `src/saida/pacote.ts:486` (nomes) e `:495-496` (`LEFT JOIN equipes ed/ea`), iguais a `src/rotas/documentos.ts:108,117-118`; render comum `documentos/laudo.ts` (`laudoDeVistoria` chamado em `pacote.ts:710`) | `npx vitest run test/saida-de-municipio.test.ts --testTimeout=120000`: 25 de 25, código 0 |
| DoD: teste vermelho (`saida-de-municipio.test.ts:364`) verde | idem | mesmo comando, caso `:364` passa |
| Positivo: F1 (Alfa designada, agente da Bravo), trecho do aviso igual | teste `:655` (compara `<p class="nota">` dos dois e a frase literal) | passa; diff do laudo inteiro abaixo: parágrafo do aviso idêntico |
| Negativo: equipes iguais sem aviso | teste `:679` | passa |
| Negativo: sem despacho, só a nota própria | teste `:711` (substitui a de divergência) | passa |
| Negativo: agente sem equipe, frase própria | teste `:686` (sem "lotado na") | passa |
| Negativo: colunas nulas (anterior à 024), sem aviso falso | teste `:698`; `LEFT JOIN` preserva a vistoria | passa |
| Isolamento: ZIP do A sem nome de equipe do B | teste `:740` ("Equipe Única") | passa; `test:isolamento` NÃO rodei (CI) |
| Regressão: `test:api`, `test:isolamento`, `test:e2e:api` | n/a | só CI 37739535524 (9 de 9) e QA (271 de 271); não rodei |
| E2E: repetir download da E11 e abrir o laudo | seção 29 de `apps/web/test/fluxo-api.e2e.mjs` | `saidas/05` e `06` e `trechos/` arquivados; não reexecutei |
| Doc: PENDENCIAS.md registra os dois montadores até a F09-E02 | `apps/api/PENDENCIAS.md` | lido; registra |
| Doc: `docs/SAIDA-DE-MUNICIPIO.md` | linhas 95 e 140-151 | lido; ver achado 2 |
| DoD: item "saída de município" do G00 marcado | n/a | pendente por desenho (E22 fecha a fase); não bloqueia |
| Fora de escopo respeitado (montador único, hash, memória) | diff só toca `pacote.ts` e o teste | confere |

## Evidência

Pergunta de especificação: o laudo do pacote e o da rota NÃO são gerados pela mesma função de dados. A renderização (`laudoDeVistoria`) é a mesma; a montagem dos dados são duas consultas à mão (`rotas/documentos.ts:60-279` e `saida/pacote.ts:457-583,694-711`), como a E12 declara que continua até a F09-E02.

Executei os dois documentos sobre a mesma vistoria F1 (teste temporário copiado de `saida-de-municipio.test.ts`, com UPDATE de latitude/longitude e equipes; arquivo apagado, `git status --porcelain` só mostra `validacao/`). Saídas: scratchpad `pacote.html`, `rota.html` (336 linhas cada), `pacote2.html`, `rota2.html`.

Diferenças de campo entre as duas consultas hoje:

1. Coordenada da vistoria (`v.latitude`, `v.longitude`): só a rota seleciona. Pacote imprime "não registrada", rota imprime "-22.900000, -43.200000". Afirmação falsa no pacote.
2. Fotos: a rota filtra `vistoria_id = vigente`; o pacote traz todas as evidências enviadas da ocorrência. Reproduzido: foto avulsa (vistoria_id nulo) sai no pacote como "Foto 3. Avulsa do Joao" do registro da vistoria; na rota sai em "Fotografias anexadas ao protocolo", com quem anexou. É o defeito que a rota já consertou, atribuindo ao agente imagem que ele não fez.
3. Avulsas (`fotosAvulsas`): pacote não monta; seção inexistente.
4. Evidências perdidas (`vistoria_evidencias_perdidas`): pacote não consulta. Reproduzido: a seção "Registros capturados que não puderam ser recuperados" some do laudo do pacote (laudo parece completo sendo incompleto).
5. Assinatura: a rota confere prefixo do tenant e `descrever` no armazenamento; o pacote só usa a chave (a falta vira `PENDENCIAS-DA-EXTRACAO.txt`).
6. Seleção da vistoria: rota aceita `vistoriaId` e usa `LIMIT 1` (mesma ordenação); pacote usa `DISTINCT ON` com a mesma ordenação. Equivalente para a vigente.
7. Esperadas e legítimas: URLs de imagem (relativas vs assinadas), "por <nome> (<papel>)", identificador de emissão.

Nenhuma diferença nos campos de equipe, `sem_despacho`, agente, órgãos indicados e campos da ocorrência (a lista explícita do pacote cobre tudo que `laudo.ts` lê).

A coordenada é requisito da E12? Não. O Objetivo e os testes do bloco falam só do aviso de equipe; "igual ao laudo emitido" no pedido é leitura ampla. As diferenças 1 a 4 estão fora do escopo da E12, mas a F09-E02 (`07-documentos.md:45`) as lista como problema; o teste "montador único" da F09-E02 (linha 60) cobre fotos de re-vistoria e avulsa, e o `laudo-de-amanha-igual-ao-de-hoje` cobre coordenada e foto avulsa.

## Cenários positivos
Divergência Alfa/Bravo: aviso idêntico nos dois (diff do laudo inteiro, linhas 1 a 336, nenhuma diferença no parágrafo `nota` de equipe).

## Cenários negativos
Os cinco casos do bloco novo passam (iguais, sem equipe do agente, nulas, sem despacho, isolamento). Autorização do pacote (administrador) coberta pelos testes existentes do mesmo arquivo, verdes.

## Tentativas de reprovar
- Comparei o laudo inteiro por diff (não só o aviso) com divergência montada: achei as diferenças 1, 2 e 4 acima.
- Procurei campo de equipe faltante na lista explícita de `o.*` do pacote contra o que `laudo.ts` lê: nenhum.
- Procurei `JOIN` interno que apagasse vistoria antiga: são `LEFT JOIN`.
- Procurei vazamento pela junção nova: roda sob `comTenant`/RLS; teste de isolamento passa.
- Não repeti a mutação do QA (substituir nomes por NULL); aceito a evidência dele.

## Achados
1. ANOTADO (fora do escopo da E12, dono F09-E02): as diferenças 2, 3 e 4 (foto avulsa vira "foto da vistoria", seção de registros perdidos omitida, fotos de vistoria anterior) são mais graves que a da coordenada, e `apps/api/PENDENCIAS.md` só registra latitude/longitude ("o que a consulta ainda não lê"). Sugiro registrar as quatro lá e citar fotos avulsas, perdidas e coordenada nos critérios de aceite da F09-E02 (hoje só na lista do problema, linha 45).
2. CORRIGE ANTES DE CRESCER: `dc360/docs/SAIDA-DE-MUNICIPIO.md:95` responde "Sim" à linha "O laudo do pacote diz o mesmo que o laudo emitido". Verdadeiro para o aviso de equipe, falso para o laudo como documento (itens 1 a 4). Estreitar o rótulo para "O aviso de equipe do laudo do pacote..." ou acrescentar a ressalva, para um auditor do município não ler garantia que não existe.
3. ANOTADO: o teste da E12 compara só `<p class="nota">`, não o laudo inteiro; por isso nada pega as diferenças acima antes da F09-E02.

Nenhum achado bloqueia a E12.

## Não verificado
- `npm run test:isolamento`, `test:api` completo e `test:e2e:api` (confiei no CI 9 de 9 e na rodada do QA).
- Validação humana (Rafael compara as folhas da F1).
- Renderização visual do HTML.
- Pacote de re-vistoria real com foto da vistoria anterior (diferença 2 só inferida do SQL, exceto a avulsa, que reproduzi).

## Risco residual
Dois montadores seguem existindo; o pacote que o município leva embora pode conter laudo com foto avulsa atribuída ao agente, sem a seção de registros perdidos e sem coordenada, até a F09-E02.

## Motivo do humano
A etapa exige comparação humana das duas folhas da vistoria F1; é pendência registrada e não bloqueia o veredito de especificação.
