---
validador: especificacao (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E12
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [API, DOCUMENTO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Árvore em `95f09f6` (difere de `52952a1` só em `docs/roadmap-v2/STATUS.md`, conferido por `git diff 52952a1 HEAD --stat`). Código em `dc360/apps/api`. Saídas brutas em `$SP/val/especificacao/E12/`.

### Matriz requisito x implementação x evidência

| Item do bloco | Implementação (arquivo:linha) | Evidência executada | Resultado |
| --- | --- | --- | --- |
| Objetivo: o laudo do pacote imprime o mesmo aviso de equipe divergente do laudo da rota | `apps/api/src/saida/pacote.ts:524` (`ed.nome`, `ea.nome`) e `:533-534` (`LEFT JOIN equipes ed/ea`), iguais a `src/rotas/documentos.ts:107,116-117`; render comum `documentos/laudo.ts` (`avisoDeEquipe`) | sonda HTTP com a API rodando (PGlite, porta 47813), cenário A: diff do laudo INTEIRO rota x pacote (`saidas/A-diff-rota-x-pacote.txt`): o parágrafo do aviso não aparece no diff, logo é idêntico | PASS |
| O que deve: API junta `equipes ed`/`ea` e seleciona os dois nomes | idem | idem; mutação 1 abaixo | PASS |
| O que deve: testes novos (iguais, diferentes, sem equipe, sem despacho, colunas nulas) | `test/saida-de-municipio.test.ts:655,679,686,698,711` e isolamento `:740` | `npx vitest run test/saida-de-municipio.test.ts`: 32 de 32, código 0 (`01-saida-de-municipio.txt`) | PASS |
| O que deve: `PENDENCIAS.md` registra os dois montadores até a F09-E02 | `apps/api/PENDENCIAS.md:29` e seção `:255-310` | lido e conferido contra o código (abaixo) | PASS no registro; ver achado 1 sobre a tabela |
| O que NÃO deve: montador único (F09-E02), artefato e hash (F09-E04/E11), memória do pacote (F07-E06) | `git log afde25c..52952a1` em `saida/` e `documentos/`: só `99390e0`, `5dfc389`, `9f2d2e6`; nenhum faz streaming, hash guardado nem consulta única. `conferirAssinatura` (`pacote.ts:372`) é conferência local, não unificação | leitura do diff | PASS |
| Migração necessária: Não | nenhuma migração em commit da E12 (047 a 050 são E04/E07) | `git diff afde25c..52952a1 --stat -- dc360/db/migrations` | PASS |
| LGPD: nenhum campo novo sai no pacote | `assinaturaNaoConferida` só existe em `pacote.ts` e `laudo.ts` (grep), é texto no HTML, não coluna exportada | grep | PASS |
| Compatibilidade: formato do ZIP não muda | entradas iguais; o laudo ganha um parágrafo quando há divergência | sonda (cenários A a R) | PASS |
| Positivo: teste vermelho `:364` verde | `test/saida-de-municipio.test.ts:364` | passa (32 de 32); com a mutação 1, reprova | PASS |
| Positivo: F1 (Alfa designada, agente da Bravo) com trecho igual nos dois | `:655` compara os `<p class="nota">` dos dois e a frase literal | passa; e2e seção 29 no CI 38618369218, job 116039196287, 15 de 15 OK, "o trecho do aviso e IDENTICO nos dois documentos" (`06-ci-e2e-secao-29.txt`, total do roteiro 288 OK, 0 falha) | PASS |
| Negativo: equipes iguais sem aviso | `:679` | passa | PASS |
| Negativo: sem despacho, só a nota própria | `:711` | passa | PASS |
| Negativo: agente sem equipe, frase própria | `:686` | passa; mutação 1 o reprova | PASS |
| Negativo: colunas nulas, sem aviso falso | `:698`; `LEFT JOIN` | passa | PASS |
| Isolamento: ZIP de A sem nome de equipe de B; `test:isolamento` verde | `:740`; FK `vistorias_equipe_designada_do_mesmo_municipio` | sonda cenário I: UPDATE de F1 para a equipe de Vale Fundo RECUSADO pela FK; CONTROLE POSITIVO: com VF promovido a administrador e uma vistoria VF da Equipe Única, o pacote de VF cita "Equipe Única" e o de Serra Alta não (`[]`), e o de VF não cita Alfa/Bravo. `npm run test:isolamento`: 14 arquivos, 345 aprovados, 3 pulados, código 0 (`03-test-isolamento.txt`) | PASS |
| Regressão `test:api` | n/a | 100 arquivos, 1309 aprovados, 1 falha, 9 pulados de 1319 (`04-test-api.txt`); a falha é `openssl-do-teste.test.ts` (LibreSSL do macOS, divergência conhecida da máquina) | PASS |
| Regressão `test:e2e:api` | n/a | não rodado aqui; job "Fluxo ponta a ponta no navegador" do CI 38618369218 `success`, "Caminho de produção, contra a API" 288 OK e 0 falha, seção 29 inteira | PASS (E1 do CI) |
| E2E: repetir o download da E11 e abrir o laudo do pacote | seção 29 de `apps/web/test/fluxo-api.e2e.mjs:2330` | log do CI acima | PASS |
| Validação humana (Rafael compara as duas folhas da F1) | n/a | substituída por diff do HTML inteiro gerado pela API rodando, em seis cenários (A, B, C, C2, D, R) | substituída |
| Evidência a produzir: saída dos testes e as duas versões do trecho | `docs/evidencias-v2/G00/V2-F00-E12/` (`saidas/`, `trechos/`, `correcao-1/`, `correcao-2/`) | `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E12 --sha 52952a1`: sem falha, 0 aviso, INDEX com 51 arquivos SHA a SHA (`09-conferir-evidencia.txt`) | PASS |
| Documentação: `SAIDA-DE-MUNICIPIO.md` | `:95`, `:140-151`, tabela `:153-165` | conferida afirmação por afirmação (abaixo) | FAIL (achado 1) |
| Documentação: `PENDENCIAS.md` | `:29`, `:255-310` | idem | FAIL (achado 1) |
| DoD: teste vermelho verde; casos de borda | idem acima | idem | PASS |
| DoD: pendência do montador único registrada | `PENDENCIAS.md:29` e `:278-285` | lido | PASS |
| DoD: item "saída de município" do G00 marcado (com E11) | `docs/roadmap-v2/03-fase-00-estabilizacao.md:783` ainda `[ ]` | marcação é do gatekeeper no G00, e E11 está VALIDADA COM PENDÊNCIA HUMANA | não avaliável nesta dimensão (pendente por desenho) |

### Afirmações da documentação tocada, contra o código e uma execução

| Afirmação | Onde | Código que sustenta | Execução que prova | Confere? |
| --- | --- | --- | --- | --- |
| Aviso de equipe divergente sai igual | `SAIDA:95`, `:158`; `PENDENCIAS` tabela, linha "Aviso de equipe" | `pacote.ts:524,533-534` | cenário A (diff sem a nota); testes `:655-740`; e2e seção 29 | sim |
| Coordenada da vistoria sai igual | `SAIDA:95`, `:159`; `PENDENCIAS` "Coordenada" | `pacote.ts:520` (`v.latitude, v.longitude`) | cenário A (coordenada fora do diff); teste `:840` | sim |
| Fotos: o pacote traz as de TODAS as vistorias e a avulsa | `SAIDA:160`; `PENDENCIAS` "Fotos" | `pacote.ts:603-608` (sem filtro de `vistoria_id`) contra `documentos.ts` (filtra a vigente) | cenário R (re-vistoria F8 mais nova): rota imprime só a foto da F8; pacote imprime a foto da F1 E a da F8 (`saidas/R-*.html`). Primeira vez que esta linha é provada com re-vistoria real | sim |
| Seções "Fotografias anexadas" e "Registros capturados" não existem no pacote | `SAIDA:161-162`; `PENDENCIAS` | o pacote não monta `fotosAvulsas` nem `evidenciasPerdidas` | cenário A, diff | sim |
| Assinatura declarada e ausente no armazenamento: igual, "Assinatura não coletada", falta em `PENDENCIAS-DA-EXTRACAO.txt` | `SAIDA:95`, `:163`; `PENDENCIAS:300` | `pacote.ts:372-383` (prefixo, `descrever`), `:742-747` | cenário B: blocos idênticos (`B iguais: true`), pendência escrita; teste `:879`; mutação 2 o reprova | sim |
| Armazenamento sem resposta na conferência: rota "Assinatura não coletada", pacote "Não foi possível conferir...", sem imagem; leva o arquivo se a cópia funcionar, senão NÃO LIDO | `SAIDA:95`, `:164`; `PENDENCIAS:301`; comentário `pacote.ts:349-370`; `laudo.ts:90-103` | `pacote.ts:378-382` (`nao_conferida`), `:755`; `laudo.ts:673-681`; rota `documentos.ts:317` (`.catch(() => ({ existe: false }))`) | cenário C: rota e pacote como descrito, `C pacote leva o arquivo: true`; cenário C2: frase do pacote e `Assinatura NÃO LIDA` na pendência; testes `:919,:950` | sim |
| Esperado: endereço das imagens, identificador, emitente (quem emitiu na rota, quem baixou no pacote) | `SAIDA:165` | `pacote.ts` (caminho relativo, `emitidoPor`) | cenário A: "Helena Vasques Coutinho (coordenador)" x "Rita Sampaio Lopes (administrador)", identificadores e URLs diferentes | sim (achado 3 da rodada 2 consertado) |
| O bloco "campo por campo" não compara o laudo inteiro; olha títulos, coordenada, avulsa e bloco da assinatura de quem estava no local; diferença nova noutro campo passa | `SAIDA:95`; `PENDENCIAS:284-291`; `pacote.ts:568-570`; comentário do teste `:777-781` | `test/saida-de-municipio.test.ts:786-971` | leitura do teste e mutações 1 e 2 | sim (achado 2 da rodada 2 consertado) |
| O bloco "reprova se alguma das três for consertada" | `SAIDA:95`; `PENDENCIAS:284` | testes `:848` e `:860` | a faceta "fotos de vistorias anteriores" não é exercitada (só a avulsa) | em parte (achado 3, anotado) |
| As diferenças que existem HOJE são as da tabela (três continuam, uma deliberada, duas consertadas, mais as esperadas) | `SAIDA:153-165`, `:95` ("três diferenças continuam ... e uma quarta é deliberada"); `PENDENCIAS:281-310` | o pacote não lê `vistoria_evidencias_perdidas` | cenário D: diferença NÃO listada no bloco da assinatura (achado 1) | NÃO |
| "O pacote não afirma ausência que ninguém conferiu" | `SAIDA:164`; `PENDENCIAS:301`; `laudo.ts:96-99` | idem | cenário D: o pacote afirma "Assinatura não coletada" quando o banco registra que ela FOI coletada e se perdeu | NÃO (achado 1) |
| Gravidade: "a seção dos registros perdidos some, então o laudo do pacote parece completo sendo incompleto" | `PENDENCIAS:303-306` | idem | cenário D: não é só incompleto, afirma o falso no laudo e no termo de interdição | subestima (achado 1) |

### Defeitos das rodadas anteriores (reexecutados neste SHA)

| Defeito | Rodada | Ainda morde? | Prova |
| --- | --- | --- | --- |
| `SAIDA:95` respondia "Sim" | 1 | não: "Só em parte" | leitura de `:95` |
| Coordenada "não registrada" no pacote | 1 | não | cenário A; teste `:840` |
| Assinatura declarada e ausente: imagem quebrada no pacote, "Assinatura não coletada" na rota, e a tabela não listava | 2 (achado 1) | não: consertado no código e documentado | cenário B (`B iguais: true`); mutação 2 reprova 3 testes |
| "O bloco campo por campo reprova diferença nova" | 2 (achado 2) | não: frase estreitada nos quatro lugares | leitura de `SAIDA:95`, `PENDENCIAS:284-291`, `pacote.ts:568-570`, teste `:777-781` |
| Linha "Esperado" sem o emitente | 2 (achado 3) | não | `SAIDA:165`; cenário A |
| Teste de isolamento `:740` sem controle positivo | 2 (achado 4) | sim, o teste continua sem controle positivo (anotado); a garantia real (FK composta e RLS) foi provada com controle positivo na sonda | cenário I |

## Evidência

Todas as saídas em `$SP/val/especificacao/E12/`.

- `npm run build:shared`: código 0 (`00-build-shared.txt`).
- `npx vitest run test/saida-de-municipio.test.ts --reporter=verbose` (em `dc360/apps/api`): 32 de 32, código 0 (`01-saida-de-municipio.txt`).
- Sonda `sonda.mts` (tsx; constrói o servidor com `bancoEmMemoria({ semear: true })` e `armazenamentoEmMemoria`, faz `app.listen` na porta 47813 e fala com ele por HTTP de verdade: `POST /auth/entrar`, `GET /documentos/:id/laudo`, `GET /documentos/:id/termo-de-interdicao`, `POST /saida/pacote.zip`, ZIP aberto pelo leitor independente copiado do teste). Código 0 (`02-sonda-execucao.txt`, log em `saidas/sonda-log.txt`, HTML em `saidas/A-*`, `D-*`, `R-*`, diffs em `saidas/A-diff-rota-x-pacote.txt`, `saidas/D-diff-laudo.txt`, `saidas/D-diff-termo.txt`). O processo encerrou a API e saiu; `lsof -iTCP:47813 -sTCP:LISTEN` vazio.
- `npm run test:isolamento`: 345 aprovados, 3 pulados, código 0 (`03-test-isolamento.txt`).
- `npm run test:api`: 1309 aprovados, 1 falha (openssl, ambiente), 9 pulados, código 1 só por essa falha (`04-test-api.txt`).
- CI 38618369218 (SHA `7585801`, que só muda `STATUS.md` sobre `52952a1`): 9 de 9 `success` (`05-ci-jobs.txt`); seção 29 do e2e extraída de `06-ci-e2e-log-bruto.txt` para `06-ci-e2e-secao-29.txt`.
- Mutação 1 (`pacote.ts:524` trocado por `NULL::text AS equipe_designada_nome, NULL::text AS equipe_do_agente_nome`): 3 falhas de 32 (`:364`, `:655`, `:686`), código 1 (`07-mutacao-1-sem-equipes.txt`). Restaurado com `git restore`.
- Mutação 2 (`pacote.ts:745` sem `&& assinatura === "presente"`): 3 falhas de 32 (`:879`, `:919`, `:950`), código 1 (`08-mutacao-2-assinatura-sem-conferir.txt`). Restaurado com `git restore`.
- `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E12 --sha 52952a1`: sem falha, 0 aviso (`09-conferir-evidencia.txt`).
- `git status --porcelain` depois de restaurar: só as pastas `validacao/52952a1/` não rastreadas (nenhum arquivo de `dc360/` alterado).

## Cenários positivos

- A (assinatura presente, Alfa designada e agente da Bravo, coordenada, foto avulsa, foto perdida): o diff do laudo inteiro contém só as diferenças da tabela (fotos com a avulsa numerada como da vistoria, duas seções que faltam, URLs, emitente, identificador). Aviso de equipe e coordenada iguais.
- B (assinatura declarada, arquivo ausente): bloco de assinatura idêntico nos dois, "Assinatura não coletada", e "Assinatura ausente no armazenamento" em `PENDENCIAS-DA-EXTRACAO.txt`.
- Assinatura presente: imagem nos dois, e o pacote leva os bytes (teste `:905`).
- R (re-vistoria): a linha "Fotos de TODAS as vistorias" da tabela confere com o código.

## Cenários negativos

- Equipes iguais, agente sem equipe, colunas nulas, sem despacho: testes `:679-711` passam e comparam com a rota.
- C e C2 (armazenamento sem resposta): o pacote não imprime `<img class="traco">` e não afirma ausência; C2 registra "Assinatura NÃO LIDA".
- E (chave de assinatura com prefixo de outro município): o banco recusa (`assinatura_com_prefixo_do_tenant`), então o caminho nem existe; a conferência de prefixo em `conferirAssinatura` é a segunda camada.
- I (isolamento): FK composta recusa vistoria de Serra Alta apontando para a equipe de Vale Fundo; com controle positivo, o nome "Equipe Única" aparece no pacote de Vale Fundo e não no de Serra Alta, e Alfa/Bravo não aparecem no de Vale Fundo.
- D (assinatura coletada e perdida): DIFERENÇA não documentada (achado 1).

## Tentativas de reprovar

- Gerei de verdade os dois laudos por HTTP contra a API rodando e comparei o HTML inteiro, não só os campos que o teste olha: cenário A confirma a tabela.
- Procurei campo de `o.*` e `v.*` que `laudo.ts` lê e a consulta do pacote não seleciona: nenhum (todos os 16 de ocorrência e os 20 de vistoria estão no SELECT de `pacote.ts:494-535`).
- Busquei o caminho que o teste "campo por campo" não exercita no bloco da assinatura: a perda da assinatura (`vistoria_evidencias_perdidas.papel = 'assinatura'`, que a migração 030 diz chegar com `assinatura_chave` nula). Achei a diferença do achado 1, no laudo E no termo de interdição do pacote.
- Re-vistoria real (que a correção 1 admitiu não ter feito): a afirmação da tabela se sustenta.
- Desfiz as junções de equipe e a conferência da assinatura: os testes mordem (mutações 1 e 2).
- Procurei uso de `assinaturaNaoConferida` fora do pacote (a rota não pode marcar): só `pacote.ts` e `laudo.ts`.
- Conferi travessão nos quatro arquivos tocados: zero.

## Achados

1. **bloqueia (documentação desmentida pelo código, mesma classe dos FAIL das rodadas 1 e 2).** Quando o registro perdido é a ASSINATURA (`vistoria_evidencias_perdidas` com `papel = 'assinatura'`, `assinatura_chave` nula, caso descrito na migração 030), o laudo da rota imprime no bloco "Presente no local" `Assinatura coletada em campo e não recuperada do aparelho` (`laudo.ts:673-675`, alimentado por `evidenciasPerdidas` em `documentos.ts:226-233`), e o laudo do pacote imprime `Assinatura não coletada`, porque `pacote.ts` não lê `vistoria_evidencias_perdidas`. O mesmo acontece no TERMO DE INTERDIÇÃO do pacote, no bloco "Responsável pelo imóvel, ciente", que é exatamente o caso que o comentário de `laudo.ts:665-671` chama de "motivo para anular o ato". Reprodução: sonda cenário D, `saidas/D-diff-laudo.txt` linha `344c333` e `saidas/D-diff-termo.txt` linha `355c344`. A tabela "As diferenças que existem HOJE" (`SAIDA-DE-MUNICIPIO.md:153-165`) e a de `PENDENCIAS.md:293-301` não listam essa diferença do bloco da assinatura; `SAIDA:95` conta "três diferenças ... e uma quarta é deliberada"; `SAIDA:164` e `PENDENCIAS:301` justificam a diferença deliberada com "o pacote não afirma ausência que ninguém conferiu", e aqui ele afirma ausência contra o próprio registro do banco de que a assinatura foi coletada; e a gravidade em `PENDENCIAS:303-306` diz só que o laudo "parece completo sendo incompleto". Não é regressão da correção 2 (o pacote nunca leu as perdas), mas a tabela e os textos são entregáveis desta etapa e afirmam um conjunto de diferenças que o código desmente. Confiança média porque se pode argumentar que é consequência da linha "Seção Registros capturados ... não existe"; a tabela, porém, trata o bloco da assinatura como campo próprio (duas linhas), e o texto diz que o teste "olha ... o bloco da assinatura de quem estava no local", o que não cobre este caso. Conserto mínimo, só documentação: uma linha nas duas tabelas ("Assinatura coletada e perdida no aparelho: rota imprime 'Assinatura coletada em campo e não recuperada do aparelho'; pacote imprime 'Assinatura não coletada', no laudo e no termo de interdição; Diferente até a F09-E02"), a contagem de `SAIDA:95` e a gravidade de `PENDENCIAS:303` ajustadas, e de preferência um caso no bloco "campo por campo" travando a diferença. Alternativa de código: o pacote ler `vistoria_evidencias_perdidas` da vistoria vigente e passar `evidenciasPerdidas` (isso também conserta a seção dos registros perdidos e obriga a atualizar o teste `:848`).
2. **anotado.** O teste de isolamento `:740` continua sem controle positivo (a semente de Vale Fundo não tem vistoria com a Equipe Única). A garantia é a FK composta e a RLS, provadas com controle positivo no cenário I. Dono: quem mexer no bloco na F09-E02.
3. **anotado.** "Reprova se alguma das três for consertada" vale para a faceta da avulsa; a faceta "fotos de vistorias anteriores no laudo da re-vistoria" não é exercitada pelo teste (cenário R prova a afirmação, mas um conserto parcial que só filtrasse as vistorias anteriores passaria pelo teste com a documentação desatualizada). Dono: V2-F09-E02.

O código da etapa (aviso de equipe, coordenada, conferência da assinatura) está correto, dentro do escopo, e os testes mordem. O defeito é, de novo, a completude da tabela de diferenças que a própria etapa escreveu.

## Não verificado

- `npm run test:e2e:api` não rodado nesta máquina; aceito o job do CI 38618369218 (288 OK, 0 falha, seção 29 inteira em Chromium contra a API).
- Seção 29 em Firefox no caminho contra a API: o CI roda Firefox só no modo local; a correção 2 não tocou o aviso de equipe.
- Termo de interdição do pacote no cenário C (conferência sem resposta): não gerado; o código é o mesmo `ausenciaDaAssinatura` (`laudo.ts:737-738`).
- Renderização visual dos HTML no navegador (fora da dimensão; a diferença é textual).
- Marcação do item "saída de município" no G00 (é do gatekeeper).

## Risco residual

Até a F09-E02, o município que leva o pacote recebe laudo e termo de interdição que, quando a assinatura foi coletada e se perdeu, afirmam "Assinatura não coletada", contradizendo o laudo emitido e o próprio banco exportado em `tabelas/vistoria_evidencias_perdidas.csv`. Além disso continuam as três diferenças documentadas (fotos misturadas, duas seções ausentes) e a deliberada. Depois do conserto do achado 1, a documentação passa a dizer isso por inteiro.

## Motivo do humano

Nenhum. A comparação reservada ao Rafael foi feita por diff do HTML inteiro gerado pela API rodando, em seis cenários.
