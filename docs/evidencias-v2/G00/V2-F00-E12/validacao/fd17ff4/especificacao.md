---
validador: especificacao
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
humano_necessario: nao
escalar: nenhum
---

Saídas deste validador (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-especificacao-e12/` (abaixo, `$S`). A árvore estava em `55209ab`; `git diff --quiet fd17ff4 55209ab -- dc360` confirmou que o produto é o do SHA validado. Os arquivos de código da etapa (`apps/api/src/saida`, `apps/api/src/documentos`, `apps/api/src/rotas/documentos.ts`, `apps/api/test/saida-de-municipio.test.ts`, `apps/web/test/fluxo-api.e2e.mjs`) não mudaram desde `bb0f654` (`git diff --stat bb0f654..fd17ff4` vazio neles). O que mudou e pode afetar a E12: `dc360/README.md`, `dc360/docs/SAIDA-DE-MUNICIPIO.md` (um parágrafo novo sobre a suspensão), `dc360/apps/api/PENDENCIAS.md` (seções de outras etapas; a seção "Dois montadores" ficou intacta) e `dc360/scripts/baseline.mjs`. Esta rodada conferiu esses documentos contra o código, em vez de herdar.

## Critérios verificados

Matriz requisito, implementação e evidência (DoD inteira e os cinco campos de teste da etapa).

| # | Requisito (bloco da etapa) | Implementação em fd17ff4 | Evidência (comando rodado nesta rodada) | Resultado |
| --- | --- | --- | --- | --- |
| D1 | DoD: teste vermelho (`saida-de-municipio.test.ts:364`) verde | `apps/api/src/saida/pacote.ts:532` (seleciona `ed.nome AS equipe_designada_nome, ea.nome AS equipe_do_agente_nome`) e `:541-542` (`LEFT JOIN equipes ed` e `ea`), iguais a `rotas/documentos.ts:108` | `npx vitest run test/saida-de-municipio.test.ts --reporter=verbose`: código 0, 37 de 37 (`$S/01-saida-de-municipio.txt`). Mutação M1 (os dois nomes trocados por NULL): `:364` e mais 2 vermelhos (`$S/10-mutacao-equipes-nulas.txt`) | PASS (E1, morde) |
| D2 | DoD: casos de borda cobertos | bloco "O laudo do pacote avisa a equipe divergente igual ao laudo da rota", `saida-de-municipio.test.ts:616` a `:740` (6 casos: diferentes `:655`, iguais `:679`, agente sem equipe `:686`, colunas nulas `:698`, sem despacho `:711`, isolamento `:740`) | os 6 verdes em `$S/01`; mutações M2 (equipe do agente = designada, 3 vermelhos), M3 (junção interna, 6 vermelhos, inclusive `:698`) e M4 (marca de sem despacho nunca lida, 1 vermelho, `:711`) em `$S/11` a `$S/13`; sonda E2 própria, casos 01 a 05 (`$S/02-sonda-execucao.txt`) | PASS (E1 e E2) |
| D3 | DoD: pendência do montador único registrada | `apps/api/PENDENCIAS.md:29` (linha do resumo, quem fecha F09-E02) e `:373-459`; `docs/SAIDA-DE-MUNICIPIO.md:95` e `:140` em diante | lidas contra o código e contra os HTML gerados pela sonda (`$S/sonda/saida/`); cada linha da tabela que a sonda cobre confere. Lacunas que já vinham da rodada 4 em Achados 1 e 2 | PASS (com achados que não bloqueiam) |
| D4 | DoD: item "saída de município" do G00 marcado (com E11) | caixa em `docs/roadmap-v2/03-fase-00-estabilizacao.md:783` continua `[ ]` | o conteúdo do item foi provado nesta rodada: botão e ZIP pela rota `/saida/pacote.zip` e aviso igual nos dois laudos, em Chromium (`$S/22`) e Firefox (`$S/23`), e o arquivo de teste verde (`$S/01`). Marcar a caixa é ato do gate (D-30) | PASS no conteúdo; a marcação é do gate |
| T1 | Testes positivos: `:364` passa; para F1 (Alfa designada, agente da Bravo) o trecho do aviso do pacote é igual ao da rota | idem D1; `avisoDeEquipe` em `documentos/laudo.ts:517-534`, chamado por `blocoVistoria` (`:393`) | `$S/01`; sonda caso 01 com a vistoria F1 do protocolo 000473/2026 (Alfa designada, Bravo do agente): trecho igual no laudo e no termo de interdição (`$S/sonda/saida/01-trecho-do-aviso.txt`); e2e seção 29 "IDENTICO" nos dois motores | PASS (E1 e E2) |
| T2 | Testes negativos: iguais sem aviso; sem despacho só a nota própria; agente sem equipe com a frase própria; colunas nulas sem nada | `avisoDeEquipe` alimentado pelas duas colunas e pela marca `sem_despacho` (`pacote.ts:533-538`, mesmo evento da trilha que a rota lê) | teste verde; sonda casos 02 (iguais, nada), 03 (frase "sem equipe registrada no momento do recebimento", sem "lotado na"), 04 (nulas, nada), 04b extra (só a equipe do agente, nada), 05 (sem despacho junto com divergência: só a nota de sem despacho), sempre iguais na rota e no pacote, laudo e termo | PASS (E1 e E2) |
| T3 | Autorização e isolamento: ZIP de A sem nome de equipe de B; `test:isolamento` verde | organização só do token na rota do pacote; RLS forçada nas tabelas lidas | `npm run test:isolamento`: 14 arquivos, 345 aprovados, 3 pulados, código 0 (`$S/21`). Sonda caso 06: pacote de Serra Alta com cabeçalho `x-organizacao-id` de Vale Fundo sem "Equipe Única" nem o id de Vale Fundo; pacote de Vale Fundo com `organizacaoId` de Serra Alta no corpo sem Equipe Alfa, Bravo nem 000473/2026 fora de `esquema/` (ver Achado 4); Vale Fundo pedindo o laudo de C3 pela rota: 404; coordenadora: 403; sem token: 401 | PASS (E1 e E2) |
| T4 | Regressão obrigatória: `test:api`, `test:isolamento`, `test:e2e:api` | sem mudança de código da etapa desde `bb0f654` | `npm run test:api`: 106 arquivos, 1685 aprovados, 34 pulados de 1719, código 0 (`$S/20`); `test:isolamento` acima; `npm run test:e2e:api` (Chromium): roteiro principal 288 OK e 0 falha, segundo roteiro 197 OK e 0 falha, zero erro de console, código 0 (`$S/22`) | PASS (E1 e E2) |
| T5 | E2E: repetir o download da E11 e abrir o laudo do pacote para conferir o aviso | seção 29 de `apps/web/test/fluxo-api.e2e.mjs:2364` | `$S/22` (Chromium) e `$S/23` (Firefox): seção 29 com 15 OK em cada motor, protocolo 000483/2026 criado pela própria seção, despacho para a Bravo e coleta pelo agente da Alfa pela API de verdade, pacote baixado pelo botão do painel, trecho idêntico palavra por palavra; controle oposto (coleta da equipe designada sem aviso nos dois) também OK | PASS (E2) |
| V1 | Validação humana: Rafael compara o laudo da rota com o do pacote para F1 | objetivamente verificável (comparação de texto entre dois documentos gerados) | coberta por E1 e E2: teste do arquivo, sonda própria (laudo e termo, seis ramos) e e2e em dois motores. Pela seção 4 de `28`, não é aparelho, percepção visual, texto de produto nem decisão; pela seção 8, não se pede E4 quando E1 ou E2 provam. A substituição precisa constar do VEREDITO | substituída por prova automatizada |
| V2 | Evidência a produzir: pasta com a saída dos testes e as duas versões do trecho do aviso | `docs/evidencias-v2/G00/V2-F00-E12/` (`saidas/`, `trechos/trecho-do-aviso-chromium.txt` e `-firefox.txt`, três correções) | `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E12 --sha fd17ff4`: código 0, sem falha e 0 aviso (`$S/31`); o trecho arquivado é o mesmo texto que o e2e desta rodada gerou, com outro protocolo | PASS |
| X1 | O que NÃO deve ser implementado: montador único (F09-E02), artefato guardado e hash (F09-E04, F09-E11), memória do pacote (F07-E06) | `pacote.ts` continua com consulta própria (não importa nada de `rotas/documentos.ts`); nenhuma migração da E12 (`git log afde25c..fd17ff4 -- db/migrations` sem E12); o pacote monta em memória como antes (pendência F07-E06 registrada em `PENDENCIAS.md`) | leitura dos imports e do diff | PASS (nada fora do escopo entrou) |
| X2 | Documentação: `SAIDA-DE-MUNICIPIO.md` e `PENDENCIAS.md` atualizados, e o que mudou desde a rodada 4 diz a verdade | parágrafo novo de `SAIDA-DE-MUNICIPIO.md` (sob suspensão, o dossiê grava uma linha em `ocorrencia_consultas`); README sem afirmação nova sobre a E12, só números | sonda caso 09: sob suspensão, `GET /ocorrencias/:id` responde 200 e `ocorrencia_consultas` de Serra Alta vai de 13 para 14; o pacote sob suspensão responde 403 `acesso_suspenso`, como o capítulo diz. `npm run conferir:numeros`: código 0 (`$S/32`) | PASS |

## Evidência

Comandos (de `dc360/` ou `dc360/apps/api/`), código de saída e saída:

- `npm run build:shared`: 0 (`$S/00-build-shared.txt`), antes de tudo.
- `npx vitest run test/saida-de-municipio.test.ts --reporter=verbose`: 0, 37 de 37 (`$S/01-saida-de-municipio.txt`).
- Mutações em `src/saida/pacote.ts`, cada uma desfeita com `git restore` e conferida com `git diff --quiet` ("restaurado" no fim de cada saída): M1 nomes nulos, 3 vermelhos (`$S/10`); M2 equipe do agente lida da designada, 3 vermelhos (`$S/11`); M3 `LEFT JOIN` trocado por junção interna, 6 vermelhos (`$S/12`); M4 marca de sem despacho apontada para tipo inexistente, 1 vermelho (`$S/13`).
- Sonda E2 própria, escrita neste turno (`$S/sonda/sonda-espec-e12.mts`): `construirServidor` real sobre PGlite com a semente, HTTP de verdade na porta 55737, laudo e termo pela rota (`GET /documentos/:id/laudo` e `/termo-de-interdicao`) e pelo pacote (`POST /saida/pacote.zip`, ZIP lido por leitor próprio pelo diretório central). `npx tsx $S/sonda/sonda-espec-e12.mts $S/sonda/saida`: código 0, 0 falhas (`$S/02-sonda-execucao.txt`; HTML em `$S/sonda/saida/`). A primeira execução reprovou a checagem de isolamento do pacote de Vale Fundo, por "Equipe Bravo" num comentário de `esquema/024_prova_tem_autor_e_equipe.sql` (Achado 4); a checagem passou a ignorar `esquema/` e foi rodada de novo.
- Segunda sonda (`$S/sonda/sonda-janela.mts`, `app.inject`, sem porta): a conferência da assinatura responde "presente" e a cópia lança. Código 0 (`$S/03-sonda-janela.txt`).
- `npm run test:api`: 0 (`$S/20-test-api.txt`). `npm run test:isolamento`: 0 (`$S/21-test-isolamento.txt`).
- `npm run test:e2e:api` (Chromium): 0 (`$S/22-test-e2e-api-chromium.txt`). `node scripts/e2e-api.mjs firefox`: 1 (`$S/23-test-e2e-api-firefox.txt`): roteiro principal 288 e 0, com as seções 28 e 29 inteiras; segundo roteiro 196 e 1, a falha é "a 1440 px, com um email de parte comprida na lista, a tabela não rola (1064/1062)", da seção 11 (E09, não desta etapa). Repetido com `node scripts/e2e-api.mjs firefox --so-layout`: 0, 197 e 0 (`$S/24`). Intermitente, ver Achado 5.
- `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E12 --sha fd17ff4`: 0 (`$S/31`). `npm run conferir:numeros`: 0 (`$S/32`).
- CI: `curl` na API pública dos jobs do run 39420436042 (`$S/30-ci-jobs.json`): 9 jobs, todos `success`, sobre `55209ab`. Os logs não foram lidos (exigem token).
- Ambiente: Node 24.15.0 (o `.nvmrc` pede 22), PGlite, Chromium e Firefox do Playwright. Nenhum Postgres foi subido por este validador.

## Cenários positivos

- F1 com Alfa designada e agente da Bravo: o laudo e o termo de interdição do pacote trazem "Atenção: esta ocorrência estava designada à Equipe Alfa e a vistoria foi coletada por agente lotado na Equipe Bravo. O sistema registrou a coleta e manteve a tarefa com a equipe designada. A divergência precisa ser conferida pela coordenação antes de o ato ser praticado.", igual ao da rota.
- O laudo inteiro da rota e o do pacote, no caso divergente, diferem só em "por <emitente>" e no identificador da emissão (`$S/sonda/saida/07-diff-laudo-divergente.txt`), o que a tabela chama de esperado.
- Agente sem equipe: a frase própria nos dois documentos.
- Nome de equipe com HTML (`<b>`, `&` e aspas) sai escapado no aviso do pacote, igual ao da rota.
- e2e nos dois motores: o pacote baixado pelo botão do painel traz o mesmo aviso que a rota, para uma divergência montada pela API de verdade.

## Cenários negativos

- Equipes iguais, só a equipe do agente preenchida, as duas nulas: nenhum aviso, nos dois documentos.
- Sem despacho junto com divergência: só a nota de sem despacho, sem "lotado na", nos dois.
- Vale Fundo pedindo o laudo de C3: 404 (nunca 403). Organização de outro município no cabeçalho ou no corpo do pedido do pacote: ignorada, nada do outro município sai nos dados nem nos documentos. Coordenadora: 403. Sem token: 401.
- Município suspenso: o pacote responde 403 `acesso_suspenso`.
- Junção interna no lugar de `LEFT JOIN` (M3): o teste reprova, inclusive o caso das colunas nulas, então ele não passa por vacuidade.

## Tentativas de reprovar

1. Quatro mutações no ponto exato da etapa (nomes nulos, equipe do agente igual à designada, junção interna, marca de sem despacho perdida): todas reprovam o caso certo. Tudo restaurado, `git status --porcelain` sem arquivo rastreado alterado.
2. Procurei o caso de teste que passa por vacuidade (colunas nulas "sem aviso" num laudo que nem existe): a mutação M3 derruba `:698`, então o teste exige o laudo.
3. Ramo que a etapa não lista: só a equipe do agente preenchida (sem designada). Nos dois documentos, nada. Coerente com `avisoDeEquipe:523`.
4. Isolamento por parâmetro: organização de outro município em cabeçalho e no corpo do pacote. Sem efeito. Achei o nome "Equipe Bravo" dentro do ZIP de Vale Fundo, e ele vem de comentário de migração em `esquema/`, não de dado (Achado 4).
5. Documento inteiro rota contra pacote no caso da etapa: nenhuma diferença além do esperado.
6. Releitura das afirmações novas desde a rodada 4 contra o código: o parágrafo de `SAIDA-DE-MUNICIPIO.md` sobre `ocorrencia_consultas` sob suspensão é verdadeiro (sonda caso 09).
7. Os dois achados da rodada 4 que não bloquearam: reproduzi os dois de novo em `fd17ff4` e conferi se os documentos passaram a registrá-los. Não passaram (Achados 1 e 2).
8. Tentei reprovar a regressão em dois motores: Firefox teve uma falha de geometria fora da etapa, que não se repetiu (Achado 5).

## Achados

1. **Corrige antes de crescer (vem da rodada 4, sem registro até hoje).** O termo de desinterdição do pacote escolhe a vistoria de um jeito e o da rota de outro. Reprodução (sonda caso 08, `$S/sonda/saida/08-*.html`): C3 interditada, levantamento há uma hora, e uma vistoria de acompanhamento recebida DEPOIS do levantamento. A rota (`vistoriaDoLevantamento`, `rotas/documentos.ts:502-517`, `sincronizada_em <= desinterditada_em`) não imprime a vistoria posterior; o pacote imprime ("vistoria posterior ao levantamento impressa na rota: false; no pacote: true"). As tabelas de `SAIDA-DE-MUNICIPIO.md` e o resumo de `PENDENCIAS.md:29` são escopados ao laudo e ao termo de interdição, então nenhuma frase fica falsa. Mas `PENDENCIAS.md:402` chama a tabela de "As diferenças entre os documentos da rota e os do pacote" e `:429` fala em "três que continuam", e há uma quarta para a V2-F09-E02 herdar. Fora do DoD da E12 (que é o aviso de equipe), e por isso não bloqueia. Registrar a linha.
2. **Corrige antes de crescer (vem da rodada 4, sem registro na tabela pública).** Com a conferência da assinatura respondendo "presente" e a cópia do arquivo falhando depois, o laudo do pacote imprime `<img class="traco" src="../../evidencias/000473-2026/assinatura-f1.png">` para um arquivo que o ZIP não tem; `PENDENCIAS-DA-EXTRACAO.txt` registra a falta (`$S/03-sonda-janela.txt`). A linha "Assinatura presente no armazenamento: imagem, e o arquivo vai no pacote" vale no caminho normal; a janela só está escrita em `correcao-2/RESUMO.md`. O pacote se declara incompleto nesse caso, o que limita o dano. Não é o defeito da etapa.
3. **Anotado.** A validação humana do bloco foi coberta por E1 e E2. O QA desta rodada marcou `humano_necessario: sim`; esta dimensão marca `nao` pela seção 4 de `28` (comparação objetiva de texto). O gatekeeper precisa decidir e registrar a substituição no VEREDITO.
4. **Anotado (o mesmo da Segurança).** O ZIP de qualquer município leva em `esquema/` os `.sql` das migrações, e os comentários citam as equipes de exemplo ("Equipe Bravo", "Equipe Alfa"). Não é dado de outro município, mas uma leitura literal do critério "o ZIP do município A não contém nome de equipe do município B" falharia com Serra Alta e Vale Fundo, e um município real com equipe de mesmo nome pode confundir quem confere o pacote.
5. **Anotado, fora da etapa (E09).** Em Firefox, uma vez, "a 1440 px, com um email de parte comprida na lista, a tabela não rola (1064/1062)" falhou; repetido sozinho, passou (197 de 197). Pode ser disputa de CPU com a outra sessão. Vale para quem valida a E09.

## Não verificado

- Os logs do run 39420436042: só a lista de jobs e o resultado (a API pública não entrega log sem token).
- PostgreSQL real para a rota do pacote: a sonda e o arquivo de teste rodam em PGlite; o e2e sobe a API do roteiro.
- Node 22 do `.nvmrc`: rodado em 24.15.0.
- A chave de assinatura fora do prefixo do município (terceiro caso de "Assinatura não coletada"): só por leitura, porque a restrição da migração 009 impede montá-la.
- A sincronização de uma vistoria divergente pelo aparelho físico: a divergência entra pela API (`POST /sincronizacao/vistoria`) no e2e e por SQL na sonda.

## Risco residual

O risco estrutural é o que a etapa registra: dois montadores até a V2-F09-E02, e nenhum teste compara os documentos inteiros, então um campo novo pode divergir sem teste vermelho. Os Achados 1 e 2 mostram essa classe fora do laudo e do termo de interdição, e já são três rodadas sem registro, o que indica que a lista para a F09-E02 está incompleta. No que a etapa pede (o aviso de equipe), a prova está no SHA atual, com mordida.

## Motivo do humano

Nenhum. A comparação que o bloco reserva a Rafael (laudo da rota contra laudo do pacote, para F1) é objetiva e foi coberta por execução: o arquivo de teste com o caso `:364` e os seis casos, a sonda desta rodada (laudo e termo, seis ramos) e o e2e em Chromium e Firefox. Ela não depende de aparelho, de percepção visual, de texto de produto nem de decisão (seção 4 de `28`).
