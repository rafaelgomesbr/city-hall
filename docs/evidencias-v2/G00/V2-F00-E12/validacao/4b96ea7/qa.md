---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E12
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [API, DOCUMENTO, EXPORTACAO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito: FAIL, confirmando por execução o achado do validador de especificação (`validacao/4b96ea7/especificacao.md`). O código do aviso de equipe e da coordenada está correto; a documentação da etapa afirma o que o código desmente. Árvore em `24aed19` (difere do candidato só em registro). Saídas em `scratchpad/qa-api/`.

| Critério | Resultado | Evidência |
| --- | --- | --- |
| O laudo do pacote imprime o mesmo aviso de equipe divergente do laudo da rota | PASS | `saida-de-municipio.test.ts` 28 de 28; o teste "equipes diferentes: o trecho do aviso é o MESMO nos dois laudos" compara os `<p class="nota">` dos dois e a frase literal |
| Casos de borda: equipes iguais (sem aviso), agente sem equipe (frase própria), coleta sem despacho (nota própria), coluna nula anterior à 024 (sem aviso falso) | PASS | 4 casos verdes (linhas 679 a 711) |
| Coordenada da vistoria sai igual nos dois laudos (consertada na correção 1) | PASS | caso "campo por campo" verde |
| O ZIP de A não tem nome de equipe de B | PASS, com ressalva | caso verde; o controle é fraco (a semente de B não tem vistoria com a equipe dele). A garantia real é a FK composta e a RLS (a especificação mostrou que `UPDATE` de vistoria de A para equipe de B é recusado pelo banco) |
| `SAIDA-DE-MUNICIPIO.md` e `PENDENCIAS.md` descrevem as diferenças que existem entre os dois laudos | FAIL | achado 1 |
| O bloco "campo por campo" "reprova se aparecer uma diferença nova" (promessa em `SAIDA-DE-MUNICIPIO.md` linha 95 e no comentário do teste) | FAIL | achado 2 |

## Evidência

- `npx vitest run test/saida-de-municipio.test.ts` (com os outros três de `15-e11-e12-e23.txt`): 59 de 59. `npm run test:api` completo: 1299 de 1299. E2E: seção 29 ("O laudo do pacote avisa a equipe divergente") verde nos 279 (`23-e2e-api.txt`).
- Provas de que o teste morde: (a) `pacote.ts` trocando `ed.nome ... ea.nome ...` por `NULL::text`: 3 vermelhos, o do aviso, o "equipes diferentes" e o "agente sem equipe" (`18-mut-e12-equipes.txt`); (b) `pacote.ts` sem `v.latitude, v.longitude`: 1 vermelho, o da coordenada (`19-mut-e12-coordenada.txt`). Restaurado com `git restore`, árvore limpa.
- Reprodução do achado 1: cópia do arquivo de teste para o scratchpad (`sondas-temporarias/zz-qa-assinatura.test.ts`) com um caso a mais que grava `vistorias.assinatura_chave` com uma chave do município e SEM objeto no armazenamento, gera o laudo pela rota e o do pacote e imprime as linhas de assinatura (`17-assinatura.json`).

## Cenários positivos

- Vistoria F1 com Alfa designada e agente da Bravo: o aviso sai idêntico nos dois laudos, e a frase literal está presente.
- Coordenada de F1 aparece igual (`-22.900000, -43.200000`) nos dois.

## Cenários negativos

- Equipes iguais, agente sem equipe, colunas nulas, coleta sem despacho: sem aviso falso e com a frase própria, como o laudo da rota.
- Chave de assinatura declarada com arquivo ausente: ver achado 1 (o caso que o conjunto de testes não cobre).

## Tentativas de reprovar

1. Comparei o laudo da rota com o do pacote para a mesma vistoria nos dois cenários da especificação e re-executei o de assinatura ausente por conta própria: confirmo a diferença (achado 1).
2. Procurei outras diferenças além das quatro documentadas: as três documentadas (fotos misturadas, seção das avulsas, seção dos registros perdidos) estão travadas por teste e coerentes com a documentação; a quarta (assinatura) não.
3. Procurei vazamento pela junção nova de equipes entre municípios: `LEFT JOIN equipes ed/ea` sem filtro explícito de organização, protegido por RLS no `comTenant` e pela FK composta; a especificação provou que o banco recusa a vistoria de A apontando para equipe de B.
4. Mutei a consulta (acima) e confirmei que os testes pegam a falta de cada junção e da coordenada.
5. Procurei na documentação outra afirmação de equivalência dos laudos: só os dois arquivos, e o comentário de `pacote.ts` já diz "três pontos".

## Achados

**BLOQUEIA (documental; é condição "Reabre se" do G00)**

1. Com `assinatura_chave` declarada e o arquivo ausente do armazenamento, os dois laudos divergem. Rota (`GET /documentos/:id/laudo`): `<div class="traco-ausente">Assinatura não coletada</div>` (a rota confere o prefixo do município e chama `descrever` no armazenamento, `rotas/documentos.ts`, função `enderecoDaAssinatura`, a partir da linha 295). Pacote: `<img class="traco" src="../../evidencias/000473-2026/assinatura-fantasma.png" alt="Assinatura de ...">`, uma imagem quebrada sobre o nome da pessoa, porque `saida/pacote.ts` linhas 699 a 701 monta o caminho sempre que há chave, sem consultar o armazenamento; a falta só aparece em `PENDENCIAS-DA-EXTRACAO.txt` (linha "Assinatura ausente no armazenamento: protocolo 000473/2026 ..." confirmada na saída). É o "retângulo quebrado no meio de um laudo com brasão" que o comentário de `enderecoDaAssinatura` diz ser pior que assinatura nenhuma. Reprodução: passos acima, resultado em `17-assinatura.json`. A documentação mente: `dc360/apps/api/PENDENCIAS.md` linha 265 diz para a assinatura "diferença de mecanismo, sem efeito no papel"; `dc360/docs/SAIDA-DE-MUNICIPIO.md` linha 95 diz que "três diferenças continuam" e a tabela "As diferenças que existem HOJE" não lista a assinatura. Dono do contrato: implementador da E12. Conserto mínimo (só documentação): trocar a linha da assinatura por "diferente até a F09-E02: imagem quebrada no pacote, 'Assinatura não coletada' na rota; a falta fica em PENDENCIAS-DA-EXTRACAO.txt", acrescentar a linha à tabela de `SAIDA-DE-MUNICIPIO.md` e corrigir a contagem. Alternativa: o pacote consultar o armazenamento como a rota faz (fora do escopo declarado da etapa).
2. A promessa do teste é falsa: `SAIDA-DE-MUNICIPIO.md` linha 95 e o comentário do bloco "campo por campo" dizem que ele "reprova se aparecer uma diferença nova". Ele só olha títulos `<h2>`, a coordenada e a posição da foto avulsa: a diferença da assinatura existe e os 28 testes passam. Conserto: estreitar a frase ("trava estas diferenças") ou acrescentar o caso da assinatura ausente (regressão sugerida: a sonda `zz-qa-assinatura.test.ts` do scratchpad, com a asserção de que os dois laudos tenham o mesmo tratamento ou de que a diferença esteja documentada).

**CORRIGE ANTES DE CRESCER**

3. O teste de isolamento do ZIP (`saida-de-municipio.test.ts` linha 740, "Equipe Única") não tem controle positivo: a semente de B não tem vistoria com a equipe dele. Hoje a garantia é a FK e a RLS, não o teste. Dono: implementador da E12.

**ANOTADO**

4. A linha "Esperado" da documentação nomeia URLs e o identificador de emissão, mas não o "por nome (papel)": no pacote sai quem baixou e na rota quem emitiu.

## Não verificado

- Pacote com re-vistoria real e foto de vistoria anterior (a diferença das fotos está provada pelo SQL e pelo caso da avulsa).
- Renderização visual dos dois HTML no navegador.
- Firefox no e2e da seção 29.
- `test:isolamento` por conta própria (confio no gatekeeper: 327 passam, 3 pulados).
- Marcação do item "saída de município" no G00 (depende da E22).

## Risco residual

- Até a F09-E02, o município que leva o pacote leva um laudo que difere do emitido em: fotos de outras vistorias misturadas, duas seções ausentes e assinatura como imagem quebrada quando o arquivo não existe.

## Motivo do humano

Nenhum. A comparação que o Rafael faria foi feita por diff dos dois HTML.
