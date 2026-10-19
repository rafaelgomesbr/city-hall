---
validador: qa (general-purpose com o papel da dimensão)
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
## Critérios verificados

Árvore em `0290af5` (difere de `bb0f654` só em `docs/roadmap-v2/STATUS.md` e `ESTADO-ATUAL.md`). Saídas na pasta `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/qa-E11-E12/` (abaixo, "pasta da validação").

| Critério da etapa | Como foi provado | Resultado |
| --- | --- | --- |
| DoD: o teste vermelho (`saida-de-municipio.test.ts`, aviso de equipe) verde | `npx vitest run test/saida-de-municipio.test.ts test/pacote-de-saida-contrato.test.ts`: 45 de 45 (37 do arquivo da etapa) | PASS |
| DoD: casos de borda cobertos | equipes iguais, diferentes, agente sem equipe, colunas nulas (anterior à migração 024) e sem despacho, no bloco do aviso; mutação M3 (nomes de equipe nulos na consulta do pacote) reprova 3 de 37 | PASS |
| DoD: pendência do montador único registrada | `apps/api/PENDENCIAS.md:289` ("Dois montadores de dados do documento") e tabela de diferenças (`:334` a `:343`); `docs/SAIDA-DE-MUNICIPIO.md:95` e tabela (`:164` a `:174`) | PASS |
| DoD: item "saída de município" do G00 marcado | caixa da linha 783 de `03-fase-00-estabilizacao.md` continua `[ ]`; pelo protocolo ela é conferida na execução do gate | não aplicável a esta rodada (registrado) |
| Teste positivo: para a vistoria divergente o trecho do aviso do pacote é igual ao da rota | e2e seção 29, roteiro completo, Chromium e Firefox: 15 de 15 nos dois, "trecho do aviso IDÊNTICO"; sonda independente (API real, leitor `zipfile` do Python) idem | PASS |
| Testes negativos: equipes iguais sem aviso; sem despacho só a nota própria; agente sem equipe frase própria; colunas nulas nada | casos do arquivo da etapa verdes; e2e seção 29 "o laudo da coleta sem divergência NÃO ganha aviso" nos dois documentos | PASS |
| Autorização e isolamento: ZIP de A sem nome de equipe de B; `test:isolamento` verde | e2e "nenhum arquivo do pacote cita a equipe de Vale Fundo" nos dois motores; sonda: nenhum arquivo cita "Equipe Única", "Vale Fundo" nem o id dele; `npm run test:isolamento` 345 aprovados e 3 pulados, código 0 | PASS |
| Correção 3 (motivo da rodada 3): assinatura coletada e perdida sai igual na rota e no pacote | sonda 3: coleta com `evidenciasPerdidas` (assinatura e foto) enviada pela SINCRONIZAÇÃO REAL, não por SQL; o laudo da rota e o do pacote imprimem "Assinatura coletada em campo e não recuperada do aparelho", o do pacote não imprime "Assinatura não coletada", e a seção dos registros perdidos até o rodapé é igual nos dois; mutação M4 (perdas vazias no pacote) reprova 4 de 37 | PASS |
| Regressão obrigatória: `test:api`, `test:isolamento`, `test:e2e:api` | rodados nesta sessão | PASS (única falha de `test:api`: `openssl-do-teste`, LibreSSL do macOS, conhecida) |
| E2E: repetir o download da E11 e abrir o laudo do pacote | seção 29 baixa pelo botão do painel duas vezes e abre o laudo do ZIP | PASS |
| Evidência: `INDEX.md` bate byte a byte | script próprio contra `git show bb0f654:<caminho>` e contra a árvore: raiz 81 de 81, `correcao-3/INDEX.md` 38 de 38; `node scripts/conferir-indices-de-evidencia.mjs` OK | PASS |

## Evidência

Comandos (em `dc360/` salvo indicação), código de saída e arquivo na pasta da validação:

- `python3 -I conferir_index.py V2-F00-E11 V2-F00-E12`, `01-conferir-index.txt`; `node scripts/conferir-indices-de-evidencia.mjs`, código 0, `02-conferir-indices-script.txt`. O único arquivo commitado fora da tabela da raiz é `correcao-3/INDEX.md`, que tem a própria tabela (38 de 38) e que o gerador `montarIndice` exclui por nome.
- `npm run build:shared`, código 0, `03-build-shared.txt`.
- `node scripts/e2e-api.mjs chromium`, código 0, `10-e2e-api-chromium.txt` (288 OK, 0 falha, zero erro de console); trecho do aviso gravado pelo próprio e2e em `e2e-chromium-trecho/trecho-do-aviso-chromium.txt` (protocolo 000483/2026, "Idênticos: sim").
- `node scripts/e2e-api.mjs firefox`, código 0, `13-e2e-api-firefox.txt` (288 OK, 0 falha); `e2e-firefox-trecho/`.
- `npx vitest run test/saida-de-municipio.test.ts test/pacote-de-saida-contrato.test.ts` (em `apps/api`), código 0, `11-api-saida-e-contrato.txt`.
- `npm run test:api`, código 1, `14-test-api.txt`: 1326 aprovados, 1 falha (`openssl-do-teste.test.ts`), 20 pulados de 1347.
- `npm run test:isolamento`, código 0, `15-test-isolamento.txt`.
- Sondas contra a API real em porta própria (3791, PGlite com a semente; roteiros `sonda/rodar.sh`, `rodar2.sh`, `rodar3.sh`): `20-sonda-independente.txt` e `21-leitor-independente-corrigido.txt` (aviso de equipe igual, escape, isolamento), `22-sonda-2-nome-de-equipe.txt` (nome de equipe malicioso), `25-sonda-3-assinatura-perdida-final.txt` (correção 3, 9 de 9). `23` e `24` são a primeira passada e o diagnóstico da sonda 3, descritos abaixo.
- Mutações feitas, medidas e desfeitas com `git restore` (`git status` limpo depois de cada uma): `32` (M3), `33` (M4), `34` (M5).

## Cenários positivos

- Coleta divergente montada pela API de verdade (despacho à Equipe Bravo, coleta pelo agente da Equipe Alfa): o laudo da rota e o laudo de dentro do pacote baixado pelo botão trazem o mesmo parágrafo "Atenção: esta ocorrência estava designada à Equipe Bravo e a vistoria foi coletada por agente lotado na Equipe Alfa...", palavra por palavra (e2e nos dois motores e sonda independente).
- Assinatura e foto perdidas declaradas pelo aparelho na sincronização real: frase da assinatura perdida e seção dos registros perdidos iguais nos dois laudos; `tabelas/vistoria_evidencias_perdidas.csv` do pacote traz as duas perdas de Serra Alta.

## Cenários negativos

- Coleta pela equipe designada: nenhum aviso de equipe no laudo do pacote nem no da rota (e2e).
- Equipes iguais, colunas nulas, agente sem equipe e sem despacho: os casos do arquivo da etapa verdes; M3 mostra que os casos de divergência mordem e os de ausência continuam verdes (não exigem o defeito oposto).
- Perda registrada em Vale Fundo (legenda sentinela) não aparece em nenhum arquivo do pacote de Serra Alta (sonda 3).
- Nenhum nome de equipe de Vale Fundo no pacote de Serra Alta (e2e e sonda).
- 404 entre municípios em `/documentos/:id/laudo`, nas duas direções (sonda); coordenadora e agente recebem 403 no pacote.

## Tentativas de reprovar

1. **Nome de equipe malicioso** (sonda 2): a administradora cria a equipe `=1+1 <img src=x onerror=alert(5)> & "Cia"`, a coordenação despacha para ela e o agente da Alfa coleta. O aviso sai idêntico nos dois laudos, com o nome escapado (`&lt;img ... &gt; &amp; &quot;Cia&quot;`), sem marcação crua; em `tabelas/equipes.csv` a célula sai neutralizada (`'=1+1 ...`).
2. **Correção 3 pelo caminho real e não por SQL** (sonda 3): o teste da etapa monta a perda por SQL; aqui ela veio do envelope de sincronização. Passou. A primeira passada (`23`) acusou a seção "diferente": o diagnóstico (`24`) mostrou que meu recorte avançava até o rodapé, onde emitente e identificador da emissão diferem por desenho (rota: quem emitiu; pacote: quem baixou), diferença documentada na tabela de `SAIDA-DE-MUNICIPIO.md`. Recortado até `<footer`, a seção e o bloco da assinatura são iguais (`25`).
3. **Mutação M3** (`ed.nome` e `ea.nome` trocados por `NULL` na consulta de `apps/api/src/saida/pacote.ts`): 3 de 37 reprovam, entre eles o vermelho original e "equipes diferentes: o trecho do aviso é o MESMO nos dois laudos".
4. **Mutação M4** (`evidenciasPerdidas: []` no montador do pacote): 4 de 37 reprovam, entre eles o de isolamento da perda (pelo controle positivo) e o da assinatura perdida.
5. **Mutação M5** (tirar o filtro de `..` de `normalizarCaminho`): 1 de 37 reprova (travessia de caminho).
6. **HTML e CSV com carga maliciosa** no relato, endereço, nome do solicitante e nome do assinante (sonda 1): laudo do pacote, laudo da rota e `INDICE.html` sem marcação crua; CSV com `=`/`@` no início prefixado com apóstrofo; nenhum nome de entrada do ZIP com travessia.
7. **Cabeçalho, consulta e corpo apontando Vale Fundo** no pedido do pacote: o pacote continua só de Serra Alta.

## Achados

Nenhum que quebre critério da etapa. Anotado, fora do escopo e já documentado pelo implementador: as diferenças restantes entre os dois montadores (fotos de todas as vistorias, seção das fotos avulsas, termo de interdição depois de re-vistoria, e a diferença deliberada do armazenamento sem resposta) continuam até a V2-F09-E02; a sonda 3 confirmou que, no caso da perda, o resto do laudo difere só em emitente e identificador da emissão. Achado transversal registrado no relatório da E11 (A3): a neutralização de CSV prefixa também número negativo.

## Não verificado

- O run 39143791434 do CI (Linux, PostgreSQL 17) não foi lido; a prova é local (Mac, PGlite na API, PostgreSQL 18.3 no isolamento).
- Termo de interdição e de desinterdição não foram comparados pela sonda (o caso real exigiria o ato de interdição); a comparação do termo está só nos testes do arquivo da etapa, que rodaram verdes.
- Re-vistoria real pela API (perda da ida anterior fora do laudo da vigente): coberta só pelo teste da etapa e pela mutação do implementador, não pela minha sonda.
- Pacote de Vale Fundo baixado de verdade (controle positivo do isolamento da perda): a semente não tem administrador lá; está só no teste da etapa, que promove o coordenador no banco do teste.

## Risco residual

Baixo. O aviso de equipe e a assinatura perdida saem iguais na rota e no pacote, provados pela API e pelo painel de verdade, com escape e isolamento conferidos e com mutações que mordem. O risco estrutural (dois montadores) continua aberto e registrado até a V2-F09-E02.

## Motivo do humano

Nenhum. A validação humana que a etapa pede (comparar o laudo emitido pela rota com o do pacote para uma vistoria divergente) foi feita por execução nos dois motores e por leitor independente; não depende de aparelho físico, percepção visual nem decisão de produto.
