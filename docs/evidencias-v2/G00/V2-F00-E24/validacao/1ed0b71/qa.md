---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E24
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: []
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Notação: `$V` é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/qa`. Documentos e testes de `1ed0b71` iguais aos do HEAD (o HEAD só difere em `STATUS.md` e `ESTADO-ATUAL.md`).

| Critério | Prova | Resultado |
| --- | --- | --- |
| A1 da rodada 5 (bloqueava): linha da tabela de papéis sem ressalva | `dc360/docs/PAPEIS_E_RESPONSABILIDADES.md:209` lida: "sim (em construção)" nas três células "sim", agente "não"; o guarda antigo da evidência sai com código 0, 11 ocorrências, 0 sem ressalva (`$V/e24-guarda-antigo.txt`) | PASS |
| A2 da rodada 5: o guarda roda no `npm test` | `packages/shared/test/ressalva-saida-a-campo.test.ts`, 38 de 38, dentro do `npm test` (`$V/r-npm-test.txt`) | PASS |
| O guarda pega a regressão real e as formas listadas | controles na minha sonda: a linha 209 antiga reprova (C1) e a negação listada "não está mais em construção" reprova (C2) (`$V/e24-sonda-burla.txt`) | PASS |
| Nenhum documento promete a declaração no app sem ressalva (DoD) | grep próprio de "declar... saída", "saída a campo", "quem está em campo", "retorno não confirmado", "prazo estourado", "confirm... o retorno", "prorrog" em `dc360/docs`, `dc360/README.md`, `docs/*.md`, `docs/*.html`, raiz e `apps/*/LEIA-ME.md`, fora auditorias; leitura de cada trecho: GUIA seção 9 abre com o quadro "a tela existe, mas fica vazia" e o desenho passa ao futuro; README com o quadro "pela metade" e a ressalva no parágrafo do operador; SEGURANCA com o quadro; PRIVACIDADE e PAPEIS com "em construção" | PASS |
| Nenhum passo do cartão manda declarar a saída no aplicativo (negativo) | `dc360/docs/CARTAO-DO-AGENTE.md:17-28` e `:95-96` lidos: passo 2 manda avisar a coordenação pelo meio combinado; quadro "O aplicativo ainda não registra a sua saída"; retorno avisado pelo mesmo meio | PASS |
| Nenhum "Pronto" na linha de segurança do agente; apresentação e PDF coerentes | HTML de 15/09 linha 394 com `p-parcial`; texto do PDF extraído por PDFKit (`$V/e24-pdf-texto.txt`, linhas 302 a 322): "Segurança do agente sozinho ... Parcial ... O aplicativo do agente ainda não declara a saída ... Corrigido em 07/10/2026"; HTML e PDF mudaram juntos no mesmo commit (`3ed4fb6`) e não mudaram depois | PASS |
| As provas da API e do painel seguem verdes (negativo: nada removido) | `saida-a-campo.test.ts` 27 de 27, `saida-nao-declara-inexistente.test.ts` 11 de 11, `quem-esta-em-campo.test.ts` (web) 4 de 4 | PASS |
| Regressão obrigatória: `npm test`, `npm run test:api` | `npm test` código 0 (campo 238, shared 223, API 1590 e 34 pulados, console 274, web 688, db 345 e 3 pulados); `test:api` código 0 | PASS |
| CP-02 registrado | `docs/evidencias-v2/CP-02/decisao.md` existe; D-25 segue premissa | PASS, com pendência humana |

## Evidência

- `npm test` (pasta `dc360`): código 0. `$V/r-npm-test.txt`.
- `npm run test:api`: código 0. `$V/r-test-api.txt`.
- `npx vitest run --root packages/shared test/ressalva-saida-a-campo.test.ts test/regras-de-conteudo.test.ts test/permissoes-no-readme.test.ts`: código 0, 58 de 58. `$V/e24-shared-guarda.txt`.
- `node docs/evidencias-v2/G00/V2-F00-E24/correcao-2/verificar-ressalvas.mjs` (raiz): código 0. `$V/e24-guarda-antigo.txt`.
- Sonda de burla do guarda novo: cópia das funções do teste (sem o import do vitest) em `$V/e24/guarda.mts`, casos em `$V/e24/sonda.mts`, rodada com `node` sobre os documentos reais mutados em memória (nenhum arquivo do repositório foi tocado); resultado `$V/e24-sonda-burla.txt`. A linha de base sem mutação dá 0 problema nos sete arquivos.
- Texto do PDF: `$V/e24-pdf-texto.txt`.

## Cenários positivos

- Linha 209 com a ressalva em cada célula: aprovada.
- Quadros de estado presentes em SEGURANCA, GUIA, CARTAO e README, com "fica vazia" ou "não avisa ninguém".
- Linha "Segurança do agente sozinho" com selo Parcial no HTML e no PDF.

## Cenários negativos

- Linha 209 antiga (a regressão da E22): o guarda reprova.
- "sim (não está mais em construção)": o guarda reprova.
- As 25 mutações embutidas no próprio teste reprovam (38 de 38 verdes significa que cada mutação devolveu ao menos um problema).

## Tentativas de reprovar

Plantei, em memória, 15 variantes que a lista da correção 3b não nomeia, cada uma contra o documento real (`$V/e24-sonda-burla.txt`). O guarda pega 1 (espaço inquebrável U+00A0, porque `\s` o casa) e deixa passar 13; uma não se aplicou.

| Variante | Classe pedida | Resultado |
| --- | --- | --- |
| V5 tabela colada a um parágrafo (sem linha em branco antes): "Resumo rápido:" seguido de "\| Ver quem está em campo \| sim \| não \| sim \| sim \|" e de outra linha com "em construção" | tabela por célula | escapa: o parágrafo não começa por "\|", vira uma unidade só e a ressalva de outra linha absolve |
| V6 lista com marcador "+" e outro item ressalvado | item de lista | escapa: `ITEM` só reconhece "-", "*" e número |
| V2 "sim (antes em construção, hoje pronto)" e V3 "sim (não se encontra mais em construção)" | negação | escapam: `NEGADA` só lista "não/nunca/sem/deixou de/já não" seguidos de "está/estar/fica/ficou" |
| V4 "sim (quem ainda não faz, aprende no dia)" | negação, ao contrário | escapa: "ainda não faz" vale como ressalva em qualquer contexto |
| V8 CARTAO: acrescentar "2. DECLARE A SAÍDA NO APLICATIVO antes de subir. Se atrasar, prorrogue" com o quadro mantido | quadros dos demais documentos | escapa: o cartão só tem a regra do quadro, e o quadro continua lá |
| V9 GUIA: acrescentar, fora do quadro, "O agente declara, antes de subir e com sinal ... o sino avisa a coordenação" | quadros | escapa |
| V10 SEGURANCA: acrescentar, fora do quadro, "antes de subir, ele declara a saída; se não voltar no prazo, a coordenação é avisada" | quadros | escapa |
| V11 README: tabela escrita à mão "Ver quem está em campo agora, com alerta de prazo \| Pronto" | tabela | escapa: toda linha de tabela do README fica fora (exceção pela tabela gerada) |
| V12 HTML de 15/09: "quem está" dentro de `<strong>` e "em campo" fora | espaços | escapa |
| V13 HTML de 15/09: "quem&amp;nbsp;está em campo" | espaços | escapa |
| V15 HTML: ressalva noutro `<span>` do mesmo `<div>` | bloco | escapa (limite declarado pelo implementador) |
| V1 sinônimo "Acompanhar os agentes em campo agora \| sim \| ..." | fora da frase | escapa (limite declarado: o guarda é por frase) |
| V7 "quem" + U+00A0 + "está em campo" | espaços | o guarda pega |

Também conferi a afirmação central da etapa no texto atual (grep e leitura acima): nenhuma das formas que escapam existe hoje nos documentos.

## Achados

- corrige antes de crescer: o guarda novo (`dc360/packages/shared/test/ressalva-saida-a-campo.test.ts`) não prende o que o teste negativo da etapa pede para o cartão, o guia e a segurança do agente: nesses três documentos ele só exige que o quadro de estado exista; uma frase nova que volte a mandar declarar a saída no aplicativo, fora do quadro, passa verde (V8, V9, V10). Também escapam a tabela colada a um parágrafo (V5), a lista com "+" (V6), tag ou entidade HTML no meio da frase (V12, V13) e negações não listadas (V2, V3). A correção 3b afirma ter fechado exatamente essas classes (tabela por célula, negação, espaços, item de lista, quadros). Não reprova a etapa porque o critério é sobre os documentos de hoje, que estão certos, e o guarda nasceu do A2 da rodada 5, classificado "corrige antes de crescer". Reprodução: `cd $V/e24 && node sonda.mts`. Conserto sugerido: regra de frase-alvo ("declar... a saída", "prorrog", "confirm... o retorno") também em CARTAO, GUIA e SEGURANCA, unidade por linha em tabela mesmo sem linha em branco antes, "+" como marcador, e o texto HTML lido sem tags e com entidades decodificadas.
- anotado (rodada 4, dono Rafael, fora da etapa): o estado vazio de "Quem está em campo" no painel (`apps/web/src/paginas/QuemEstaEmCampo.tsx`) continua dizendo que declarar a saída é um passo do aplicativo do agente.

Nenhum achado bloqueia.

## Não verificado

- Capturas do portão visual: a etapa não tem tag de UI e nenhum HTML de apresentação mudou desde a correção 2 (`3ed4fb6`); não gerei capturas novas.
- O PDF não foi regenerado por mim; conferi o texto extraído contra o HTML só na linha da segurança do agente e na contagem de "em construção".
- Documentos fora das pastas varridas (por exemplo, textos de loja ou materiais fora do repositório).
- CI do SHA: ausente (H32).

## Risco residual

Hoje nenhum documento promete a saída a campo como pronta. A trava contra a volta da promessa existe, mas cobre só as frases e formas listadas: uma edição futura no cartão, no guia ou na segurança do agente, ou uma tabela escrita sem linha em branco antes, reintroduz a promessa de segurança física sem ficar vermelha.

## Motivo do humano

Rafael e Alyson confirmam ou revertem a D-25 (CP-02 segue como premissa) e leem a apresentação ajustada antes de qualquer demonstração a município; Rafael decide também a frase do estado vazio de "Quem está em campo" no painel. São decisões de produto e de demonstração.
