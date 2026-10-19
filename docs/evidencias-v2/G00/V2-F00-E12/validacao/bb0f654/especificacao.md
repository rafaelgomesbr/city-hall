---
validador: especificacao (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E12
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [API, DOCUMENTO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---

Saídas deste validador (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/especificacao-E12/` (abaixo, `$S`). A árvore estava em `0290af5`, que difere de `bb0f654` só em `docs/roadmap-v2/STATUS.md` e `ESTADO-ATUAL.md` (`git diff --stat bb0f654 0290af5`); o produto é o do SHA validado.

## Critérios verificados

Matriz requisito, implementação e evidência (DoD inteira e os cinco campos de teste da etapa).

| # | Requisito (bloco da etapa) | Implementação (bb0f654) | Evidência | Resultado |
| --- | --- | --- | --- | --- |
| D1 | DoD: teste vermelho (`saida-de-municipio.test.ts:364`) verde | `saida/pacote.ts`, consulta de vistorias com `LEFT JOIN equipes ed` e `equipes ea` e os dois nomes | `$S/01-saida-de-municipio.txt`: 37 de 37, código 0; mutação M2 (nomes trocados por NULL) derruba o caso `:364` e mais 2 (`$S/11-...`) | PASS (E1, morde) |
| D2 | DoD: casos de borda cobertos | 6 casos do bloco do aviso e 11 do bloco "campo por campo" | mesmos arquivos; sonda E2 casos 06, 06b, 06c, 06d, 13 | PASS |
| D3 | DoD: pendência do montador único registrada | `apps/api/PENDENCIAS.md:29` e `:289-375`; `docs/SAIDA-DE-MUNICIPIO.md:95` e `:140-175` | cada linha das duas tabelas conferida contra o HTML gerado (ver Cenários) | PASS |
| D4 | DoD: item "saída de município" do G00 marcado (com E11) | caixa em `03-fase-00-estabilizacao.md:783` continua `[ ]` | o conteúdo do item foi provado: e2e com o botão e a seção 29 verde em Chromium e Firefox, e o arquivo de teste verde. Marcar a caixa é ato do gate (D-30), não do implementador | PASS no conteúdo; a marcação fica para o gate |
| T1 | Testes positivos: `:364` passa; para F1 (Alfa designada, agente da Bravo) o trecho do aviso do pacote é igual ao da rota | idem D1 | teste verde; sonda caso 06: aviso igual byte a byte no laudo e no termo (`$S/sonda/06-trecho-do-aviso.txt`); e2e seção 29 "IDENTICO" em Chromium e Firefox | PASS |
| T2 | Testes negativos: iguais sem aviso; sem despacho só a nota própria; agente sem equipe com a frase própria; colunas nulas sem nada | `avisoDeEquipe` (`documentos/laudo.ts:517`) alimentado pelo pacote | teste verde; sonda casos 01, 13, 06b, 06c e o extra 06d (só a equipe do agente: sem aviso nos dois) | PASS |
| T3 | Autorização e isolamento: ZIP de A sem nome de equipe de B; `test:isolamento` verde | organização do token (`rotas/saida.ts`, `autorizar` e `exigirPermissao`); RLS forçada em `vistoria_evidencias_perdidas` (migração 030, linhas 192 e 193) | `$S/21-test-isolamento.txt`: 345 aprovados, 3 pulados, código 0; sonda caso 12: 404 entre municípios na rota, organização de Serra Alta injetada por query, cabeçalho e corpo no pacote de Vale Fundo sem efeito, pacote de Serra Alta sem "Equipe Única" nem id de Vale Fundo, 403 para coordenadora, 401 sem token | PASS |
| T4 | Regressão obrigatória: `test:api`, `test:isolamento`, `test:e2e:api` | sem mudança fora do escopo nos arquivos da etapa | `$S/20-test-api.txt`: 1326 aprovados, 1 falha, 20 pulados de 1347 (a falha é `openssl-do-teste.test.ts`, LibreSSL do macOS, divergência de máquina conhecida); `$S/21`: verde; `$S/22-test-e2e-api-chromium.txt`: 288 e 64 OK, 0 falha, código 0; `$S/23-test-e2e-api-firefox.txt`: idem | PASS |
| T5 | E2E: repetir o download da E11 e abrir o laudo do pacote | seção 29 de `apps/web/test/fluxo-api.e2e.mjs` | `$S/22` e `$S/23`, seção 29 com 15 OK em cada motor | PASS |
| R3 | Foco da rodada: assinatura coletada e perdida diz o mesmo na rota e no pacote | `pacote.ts`, consulta `perdidas` e `evidenciasPerdidas` só da vigente | sonda casos 04 e A2: laudo e termo inteiros iguais em ordem, fora o esperado; mutações M1 e M3 mordem | PASS |
| S1 | Segurança da etapa: o aviso não falta nem é inventado; texto escapado | `escapar` em `avisoDeEquipe` e `blocoEvidenciasPerdidas` | sonda caso 04: legenda com `<b>`, aspas e `&` sai escapada no pacote, nenhum HTML cru | PASS |
| X1 | D-05: documento já emitido não muda | o pacote não chama `registrarEmissao` nem escreve em ocorrência ou vistoria | sonda caso 11: hash de ocorrências, vistorias e trilha igual antes e depois do pacote; identificador de emissão do laudo e do termo pela rota igual antes e depois (8070E4BA280B, E74CC1F9BE0E) | PASS |

## Evidência

Comandos (todos de `dc360/` ou `dc360/apps/api/`), código de saída e saída:

- `npx vitest run test/saida-de-municipio.test.ts --reporter=verbose`: código 0, 37 de 37 (`$S/01-saida-de-municipio.txt`).
- Sonda E2 própria, escrita do zero neste turno (`$S/sonda-e12.mts`): API Fastify real sobre PGlite, HTTP de verdade numa porta efêmera, laudo e termo pela rota (`GET /documentos/:id/laudo` e `/termo-de-interdicao`) e pelo pacote (`POST /saida/pacote.zip`, ZIP lido por leitor próprio pelo diretório central). Compara o documento INTEIRO depois de normalizar só o que a tabela chama de esperado (endereço da imagem, identificador, emitente e instante da emissão). `npx tsx $S/sonda-e12.mts <api> $S/sonda`: código 0, 0 falhas (`$S/02-sonda-execucao.txt`; HTML e diffs em `$S/sonda/`).
- Segunda sonda (`$S/sonda-e12b.mts`): igualdade em ORDEM do documento normalizado, e as diferenças conhecidas conferidas contra o documento inteiro. Código 0, 0 falhas (`$S/03-sondab-execucao.txt`, `$S/sondab/`).
- Terceira sonda (`$S/sonda-e12c.mts`): termo de desinterdição num caso realista (achado 1). `$S/04-sondac-desinterdicao.txt`.
- Mutações em `src/saida/pacote.ts`, cada uma desfeita com `git restore` e conferida com `git diff --quiet` ("restaurado" em cada saída): M1 perdas não entregues (4 vermelhos), M2 equipes nulas (3), M3 perdas sem filtro da vigente (1, o da re-vistoria), M4 conferência sempre "presente" (3), M5 coordenada nula (1). Arquivos `$S/10-` a `$S/14-`.
- `npm run test:api` (`$S/20`), `npm run test:isolamento` (`$S/21`), `npm run test:e2e:api` (`$S/22`), `node scripts/e2e-api.mjs firefox` (`$S/23`).

## Cenários positivos

Gerados de verdade pela rota e pelo pacote, mesma vistoria F1 (protocolo 000473/2026), documento inteiro comparado:

- 01 assinatura presente: laudo e termo iguais (0 linha diferente); imagem nos dois; o pacote leva `evidencias/000473-2026/assinatura-f1.png`. Tabela "Assinatura presente: Igual" confirmada.
- 02 sem assinatura e sem perda: "Assinatura não coletada" byte a byte igual, laudo e termo. Linha "Igual" confirmada.
- 03 declarada sem arquivo: "Assinatura não coletada" igual no laudo E no termo, sem `<img class="traco">`, pendência escrita em `PENDENCIAS-DA-EXTRACAO.txt`. Linha "Igual (correção 2)" e a afirmação de `SAIDA-DE-MUNICIPIO.md:95` sobre o termo confirmadas.
- 04 coletada e perdida (mais duas fotos perdidas, uma com mesma `ordem`): "Assinatura coletada em campo e não recuperada do aparelho" igual no laudo e no termo; seção dos perdidos igual nos dois documentos; nenhuma ocorrência de "Assinatura não coletada" no pacote. A2: três perdas em ordem mista, documento inteiro igual em ordem; o CSV do próprio pacote e o laudo dizem o mesmo. Linha "Igual (correção 3)" confirmada: o defeito da rodada 3 não se reproduz.
- 05 só foto perdida: seção igual, sem a frase da assinatura perdida, assinatura continua imagem.
- 06 equipe divergente: aviso igual byte a byte no laudo e no termo. 07 coordenada ausente e 01 presente: iguais.
- 10 perda de assinatura E chave declarada sem arquivo ao mesmo tempo: igual nos dois.
- Diferenças que a tabela declara, conferidas contra o documento inteiro (B1 e C1): a avulsa entra como "Foto 2" no pacote e em "Fotografias anexadas ao protocolo" só na rota; depois de re-vistoria, a foto da ida anterior entra no laudo do pacote (rota 0 foto, pacote 1); o termo da rota sai da vistoria do ato e o do pacote da vigente. Fora das fotos, o laudo da re-vistoria é igual nos dois. Caso 08 (armazenamento sem resposta na conferência): única diferença, nos dois documentos, é a frase deliberada; o arquivo vai no pacote quando a cópia funciona. Toda linha das duas tabelas confere com o código.

## Cenários negativos

- Equipes iguais, só a equipe do agente preenchida, colunas nulas: nenhum aviso nos dois documentos.
- Agente sem equipe: frase própria, sem "lotado na". Sem despacho: só a nota própria, sem a de divergência, laudo e termo.
- Vale Fundo pedindo laudo e termo de C3: 404 (nunca 403). Pacote de Vale Fundo com a organização de Serra Alta em query, cabeçalho e corpo: nenhum arquivo cita 000473, Equipe Alfa, Equipe Bravo nem o id de Serra Alta. Coordenadora: 403; sem token: 401.
- Legenda maliciosa na perda: escapada; nenhum HTML cru.
- D-05: o pacote não grava evento novo na trilha além do próprio ato de exportação (tipos de evento inalterados), não toca ocorrência nem vistoria, e o identificador de emissão da rota não muda depois dele.

## Tentativas de reprovar

1. Procurei diferença rota x pacote fora das tabelas comparando o documento INTEIRO, em ordem, em 13 estados (presente, ausente, declarada sem arquivo, perdida, foto perdida, perdida mais declarada, quatro ramos de equipe, coordenada ausente, sem despacho, sem resposta). Nada além do que as tabelas dizem.
2. Procurei os três casos de "Assinatura não coletada" afirmados como exaustivos: pela leitura de `ausenciaDaAssinatura` (`laudo.ts:673`) e `assinatura()` (`folha.ts:377`), a frase padrão só sai com `assinaturaUrl` nulo e sem perda nem marca de não conferida, ou seja, só nos três casos descritos. Os dois primeiros executados; o do prefixo foi conferido por leitura (o banco recusa a chave pela restrição da migração 009).
3. Ordem das perdas: `ordem, capturada_em, id` nos dois montadores; três perdas com ordem mista e duas com a mesma `ordem` saem na mesma sequência.
4. Mutações para provar que o teste morde (M1 a M5): todas viram vermelho no caso esperado; tudo restaurado.
5. Tentei vazar entre municípios pela consulta nova sem `WHERE` (RLS forçada) e por parâmetro de organização no pacote: sem vazamento.
6. Janela entre a conferência e a cópia da assinatura (caso 09): reproduzi um defeito real, fora do que a tabela afirma (achado 2).
7. Termo de desinterdição, que o pacote também exporta e as tabelas não cobrem: reproduzi divergência (achado 1).

## Achados

1. **Corrige antes de crescer (fora do que a etapa afirma; mesma classe de dois montadores).** O termo de desinterdição do pacote escolhe a vistoria de forma diferente da rota. Reprodução (`$S/sonda-e12c.mts`, `$S/04-sondac-desinterdicao.txt`, HTML em `$S/sondac/`): V1 recebida, interdição, re-vistoria V2, levantamento, e uma vistoria V3 de acompanhamento recebida DEPOIS do levantamento. A rota (`vistoriaDoLevantamento`, `rotas/documentos.ts:502`, com `sincronizada_em <= desinterditada_em`) imprime V2 sob "Vistoria que motivou o levantamento"; o pacote (`saida/pacote.ts`, `comNovaVistoria` sobre a vigente) imprime V3, recebida depois do ato, como motivo dele. Não desmente nenhuma linha: as duas tabelas são escopadas a "laudo e termo de interdição" e nenhum texto afirma igualdade do termo de desinterdição. Mas a lista de diferenças de `PENDENCIAS.md:29` e `:318` e de `SAIDA-DE-MUNICIPIO.md:153` fica incompleta para a V2-F09-E02: registrar esta linha.
2. **Corrige antes de crescer.** Se `descrever` confirma a assinatura e a cópia falha depois (limite de taxa, 503), o laudo do pacote imprime `<img class="traco" src="../../evidencias/000473-2026/assinatura-f1.png">` para um arquivo que o ZIP não tem (caso 09 da sonda: "o arquivo existe no ZIP: false"); `PENDENCIAS-DA-EXTRACAO.txt` registra a assinatura como NÃO LIDA e manda não seguir ao passo 6. Os documentos são todos montados antes de qualquer cópia (`pacote.ts`, laço de documentos e depois o laço de cópias), então num pacote grande a janela é de minutos, não de duas chamadas seguidas. A limitação está no `correcao-2/RESUMO.md`, não nas tabelas públicas; a linha "Assinatura presente: imagem, e o arquivo vai no pacote" vale para o caminho normal e nenhum texto afirma que o pacote nunca imprime imagem quebrada. Registrar a janela na tabela, ou montar o laudo depois da cópia, na F09-E02 ou antes.
3. **Anotado.** A linha "Esperado" das tabelas cita endereço, identificador e emitente, não o instante "Emitido em", que também difere (inerente: são emissões diferentes).

## Não verificado

- A chave de assinatura fora do prefixo do município (terceiro caso de "Assinatura não coletada"): só por leitura, porque a restrição da migração 009 impede montá-la no banco.
- PostgreSQL 17 e o run do CI 39143791434: não lidos (sem `gh` autenticado). A prova é local, em PGlite e no PostgreSQL 18.3 da máquina (o e2e).
- A perda montada por SQL no estado que `rotas/sincronizacao.ts` grava, não por sincronização de ponta a ponta pelo aparelho.
- O caso `openssl-do-teste.test.ts` de `test:api` reprova pela divergência de máquina conhecida (LibreSSL), sem relação com a etapa.

## Risco residual

O risco estrutural continua o que a própria etapa registra: dois montadores até a V2-F09-E02, e o bloco "campo por campo" não compara o documento inteiro, então campo novo pode divergir sem teste vermelho. Os achados 1 e 2 são exemplos concretos dessa classe fora do laudo e do termo de interdição. O pacote marca a extração como incompleta no caso do achado 2, o que limita o dano antes da eliminação.

## Motivo do humano

Nenhum. A validação humana que o bloco pede (Rafael compara o laudo da rota com o do pacote para a vistoria F1) foi coberta por execução: comparação byte a byte pelo e2e em dois motores e pela sonda deste validador. Pela seção 8 de `28`, não se pede E4 quando E1 ou E2 provam.
