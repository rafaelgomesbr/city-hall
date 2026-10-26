---
validador: especificacao
modelo: claude-sonnet-5-5
etapa: V2-F00-E12
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [API, DOCUMENTO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Base: árvore em `24aed19` (difere de `4b96ea7` só em registro: `ROTEIRO-G00.md`, `STATUS.md`, `ESTADO-ATUAL.md`). Código em `dc360/apps/api`. Saídas brutas no scratchpad `espec-e12/` (não copiadas aqui).

| Requisito do bloco | Implementação | Evidência | Resultado |
| --- | --- | --- | --- |
| Objetivo: o laudo do pacote imprime o mesmo aviso de equipe do laudo da rota | `src/saida/pacote.ts:483-497` (`ed.nome`, `ea.nome`, `LEFT JOIN equipes ed/ea`), iguais a `src/rotas/documentos.ts:108-118`; render comum `laudoDeVistoria` | `npx vitest run test/saida-de-municipio.test.ts`: 28 de 28, código 0 (`rodada-saida.txt`). Laudo inteiro dos dois lados com a F1 (Alfa designada, agente da Bravo): o parágrafo do aviso e a coordenada não aparecem no diff | PASS |
| DoD: teste vermelho (`saida-de-municipio.test.ts:364`) verde | idem | passa na rodada acima | PASS |
| Positivo: trecho do aviso da F1 igual nos dois | teste `:655` (compara `<p class="nota">` dos dois e a frase literal) | passa; seção 29 do e2e verde no CI 38445527075 ("o laudo DO PACOTE traz o mesmo aviso") | PASS |
| Negativo: equipes iguais sem aviso | teste `:679` | passa | PASS |
| Negativo: sem despacho, só a nota própria | teste `:711` | passa | PASS |
| Negativo: agente sem equipe, frase própria | teste `:686` | passa | PASS |
| Negativo: colunas nulas (anterior à 024), sem aviso falso | teste `:698`; `LEFT JOIN` | passa | PASS |
| Isolamento: ZIP de A sem nome de equipe de B | teste `:740` ("Equipe Única") | passa. Sonda minha: UPDATE de `vistorias` de A apontando para a equipe de B é RECUSADO pelo banco (FK `vistorias_equipe_designada_do_mesmo_municipio`), então o caminho de vazamento pela junção nova não existe. O teste `:740` sozinho é fraco (a semente de B não tem vistoria com a equipe dele); a garantia real é a FK e a RLS. `test:isolamento` não rodei (gatekeeper: 327 passam, 3 pulados) | PASS, com ressalva |
| Regressão: `test:api`, `test:isolamento`, `test:e2e:api` | n/a | não reexecutei; CI 38445527075 com 9 de 9 jobs, e `correcao-1/saidas/03` (1299 de 1299) | aceito do CI |
| E2E: repetir o download e abrir o laudo | seção 29 de `apps/web/test/fluxo-api.e2e.mjs` | linhas do log do CI 38445527075, seção 29, todas OK | PASS |
| Validação humana (Rafael compara as duas folhas da F1) | n/a | substituída por comparação executada do laudo inteiro, campo a campo (esta rodada) | substituída |
| Doc: `PENDENCIAS.md` registra os dois montadores até a F09-E02 | seção "Dois montadores de dados do documento" | lida; registra, mas contém afirmação que o código desmente (achado 1) | FAIL |
| Doc: `SAIDA-DE-MUNICIPIO.md` | linha 95 e capítulo "O risco que continua aberto" | lido; a linha 95 confere com o código nas diferenças medidas no cenário A, mas a tabela de diferenças está incompleta (achado 1) e promete mais do que o teste cumpre (achado 2) | FAIL |
| DoD: item "saída de município" do G00 marcado | n/a | pendente por desenho (E22 fecha a fase) | não avaliado |
| Fora de escopo respeitado (montador único, hash, memória) | o código da correção só acrescenta `v.latitude, v.longitude` | confere | PASS |

## Evidência

Comparei o laudo da rota (`GET /documentos/:id/laudo`) com o laudo de dentro do ZIP para a mesma vistoria F1, por uma cópia do teste no scratchpad (nada no repositório mudou; a cópia semeia a mesma base e grava os dois HTML). Cenário A: equipes Alfa/Bravo, coordenada, uma foto avulsa e um registro perdido. Cenário B: o mesmo, com `assinatura_chave` apontando para um arquivo que o armazenamento não tem.

Cenário A, diferenças entre os dois laudos (`pacote.html` contra `rota.html`):

1. Aviso de equipe e coordenada da vistoria: IGUAIS. O afirmado em `SAIDA-DE-MUNICIPIO.md:95` bate com o código.
2. Fotos: o pacote põe a avulsa em "Registro fotográfico" como "Foto 3. Avulsa do Joao"; a rota a põe na seção própria. Bate com a documentação.
3. Seção "Fotografias anexadas ao protocolo": só na rota. Bate.
4. Seção "Registros capturados que não puderam ser recuperados": só na rota. Bate.
5. Esperadas: URLs das imagens, "por nome (papel)" e identificador da emissão. A documentação cita as URLs e o identificador, não cita o nome de quem emitiu. Menor.

Cenário B, diferença que a documentação NÃO tem e que desmente a linha "Assinatura" de `PENDENCIAS.md`:

- Rota: `<div class="traco-ausente">Assinatura não coletada</div>` (a rota confere o prefixo do município e chama `descrever` no armazenamento, `rotas/documentos.ts:298-319`).
- Pacote: `<img class="traco" src="../../evidencias/000473-2026/assinatura-fantasma.png" alt="Assinatura de Cleuza Ramos de Andrade">`, imagem quebrada sobre o nome da pessoa (`pacote.ts` monta o caminho relativo sempre que há `assinatura_chave`, sem consultar o armazenamento). O pacote registra a falta em `PENDENCIAS-DA-EXTRACAO.txt` (conferido), mas o papel sai diferente.

Esse é o "retângulo quebrado no meio de um laudo com brasão" que o comentário de `enderecoDaAssinatura` diz ser pior que assinatura nenhuma. Foi a diferença 5 do relatório de especificação da rodada 1 (`validacao/7005a60/especificacao.md`), e a correção a rebaixou a "diferença de mecanismo, sem efeito no papel".

## Cenários positivos

- Aviso de equipe divergente igual nos dois laudos (laudo inteiro comparado, não só `<p class="nota">`).
- Coordenada da vistoria igual nos dois. Prova de que o teste novo morde: `correcao-1/saidas/01-...ANTES-do-conserto.txt` (28 testes, 1 falha, a da coordenada) e `02-...DEPOIS.txt` (28 de 28). Li os dois arquivos; não repeti a mutação nesta rodada (a instrução proíbe mexer em arquivo do repositório).
- Os 28 testes passam no SHA.

## Cenários negativos

- Equipes iguais, agente sem equipe, colunas nulas e coleta sem despacho: testes `:679` a `:711` passam e comparam com o laudo da rota.
- Vistoria de A apontando para equipe de B: o banco recusa (FK composta); o pacote de A não contém "Equipe Única".
- Assinatura ausente no armazenamento: DIFERENÇA não documentada (cenário B acima).

## Tentativas de reprovar

- Diff do laudo inteiro nos dois cenários, procurando campo que a documentação não cita: achei a assinatura.
- Procurei campo de `o.*` lido por `laudo.ts` e ausente do SELECT de ocorrências do pacote: nenhum (protocolo, tipo, tipo_descricao, severidade, endereco, latitude, longitude, solicitante_nome, canal_entrada, descricao, vulnerabilidade_*, criado_em, equipe_nome; todos estão).
- Procurei `JOIN` interno que apagasse vistoria antiga: são `LEFT JOIN`.
- Procurei vazamento entre municípios pela junção nova (FK cruzada): recusada pelo banco.
- Procurei afirmação de equivalência fora de `SAIDA-DE-MUNICIPIO.md` e `PENDENCIAS.md` (README, `COLOCAR-DE-PE.md`, comentários de `pacote.ts`): só os dois arquivos, e o comentário de `pacote.ts` já diz "três pontos".
- Li o teste "campo por campo": ele só olha títulos `<h2>`, uma string de coordenada e a posição da avulsa. Não detecta a diferença da assinatura, nem outra que não mude título.

## Achados

1. **FAIL (bloqueia).** `dc360/apps/api/PENDENCIAS.md` (tabela "As diferenças entre os dois laudos", linha "Assinatura") afirma "diferença de mecanismo, sem efeito no papel". Reproduzido que há efeito: com a chave declarada e o arquivo ausente, o laudo do pacote imprime imagem quebrada onde o da rota imprime "Assinatura não coletada". A tabela equivalente de `dc360/docs/SAIDA-DE-MUNICIPIO.md` (linhas 153 a 163, "As diferenças que existem HOJE") não lista a assinatura, e a linha 95 diz que restam "três diferenças". É o mesmo defeito que reprovou a rodada 1: documentação da etapa afirmando o que o código não faz (condição "Reabre se" do G00, sem direito a risco aceito). Conserto mínimo, só documentação: trocar a linha da assinatura por "Diferente até a F09-E02: imagem quebrada no pacote, 'Assinatura não coletada' na rota; a falta fica em PENDENCIAS-DA-EXTRACAO.txt", acrescentar a linha à tabela de `SAIDA-DE-MUNICIPIO.md` e ajustar a contagem na linha 95 e no resumo do topo de `PENDENCIAS.md`. Alternativa de código (fora do escopo declarado): o pacote consultar o armazenamento como a rota faz.
2. **FAIL (bloqueia, junto do 1).** As duas documentações e o comentário do teste dizem que o bloco "campo por campo" "reprova se aparecer uma diferença nova". Falso: ele cobre títulos de seção, a coordenada e a avulsa. A diferença da assinatura existe e o teste passa. Conserto: estreitar a frase ("trava estas diferenças") ou acrescentar o caso da assinatura ausente ao teste.
3. ANOTADO (menor): a linha "Esperado" da documentação nomeia URLs e identificador, mas não "por nome (papel)" (no pacote sai quem baixou, na rota quem emitiu).
4. ANOTADO: o teste de isolamento `:740` não tem controle positivo (a semente de B não tem vistoria com a equipe dele). A garantia é a FK e a RLS, provadas por mim; para a junção nova o teste é decorativo.

O código da E12 (aviso de equipe e coordenada) está correto e dentro do escopo; o defeito é de documentação e de uma promessa do teste, o mesmo tipo da rodada 1.

## Não verificado

- Repetição da mutação do teste da coordenada (desfazer `v.latitude, v.longitude` no `pacote.ts`, ver vermelho, restaurar): não feita por proibição de mexer no repositório nesta rodada; aceito os arquivos de saída da correção.
- `test:isolamento`, `test:api` completo e `test:e2e:api`: não reexecutei; confio no CI 38445527075 (9 de 9) e no gatekeeper.
- Re-vistoria real com foto da vistoria anterior no pacote (a diferença "fotos de todas as vistorias" está provada pelo SQL sem filtro de `vistoria_id` e pelo caso da avulsa, não por um pacote com duas vistorias).
- Renderização visual dos dois HTML no navegador.
- Marcação do item "saída de município" no G00 (depende da E22).

## Risco residual

Enquanto a F09-E02 não existir, o município leva um laudo que difere do emitido em: fotos de outras vistorias e avulsa misturadas ao registro da vistoria, duas seções ausentes e a assinatura como imagem quebrada quando o arquivo não existe. Depois do conserto do achado 1 a documentação passa a dizê-lo por inteiro.

## Motivo do humano

Nenhum. A comparação que a etapa reservava a Rafael foi executada por diff dos dois HTML.
