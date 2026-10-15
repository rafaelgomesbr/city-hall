---
validador: qa (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E02
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: []
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Saídas em `$SP/val/qa/lote-scripts/` (abreviado `L/`). Hoje é 2026-10-15 no relógio UTC do portão.

| Critério (DoD e cinco campos) | Resultado | Prova |
| --- | --- | --- |
| Política publicada (três saídas, ambiente x incondicional, marca, prazo e quem decide) | PASS | `dc360/docs/POLITICA-DE-TESTE-VERMELHO.md` lida nas seções da marca, do prazo (5 dias corridos, D2), do dono padrão `rafael` e dos limites do portão |
| Portão verde na árvore atual | PASS | `node --test scripts/portao-de-skip.test.mjs`: 17 de 17 (`L/e02-01-portao-de-skip-test.txt`); `npm run test:scripts`: 260 de 260, código 0 (`L/90-test-scripts.txt`); CI "Testes, tipos e scripts" imprime a contagem do portão |
| A contagem por ambiente lista os 3 `it.runIf` de `busca.test.ts` e os `skip:` de `entitlements-do-ios` e `som-de-despacho` | PASS | "653 arquivos varridos; 11 skips por ambiente em 4 arquivos": 3 em `db/test/busca.test.ts`, 4 em `entitlements-do-ios.test.mjs`, 3 em `som-de-despacho.test.mjs`, 1 em `renovacao-contra-encerramento.test.ts` (`describe.skipIf(!URL_DE_PROVA)`) |
| Negativo: skip sem marca reprova | PASS | sonda N1 plantada em `apps/api/test/`, `test:scripts` do portão código 1 (`L/e02-02-sondas-portao.txt`) |
| Negativo: marca sem `dono` reprova (e sem `issue`) | PASS | N2 e N3: código 1, "marca T42 sem `dono=`" e "sem `issue=`" |
| Negativo: marca com `ate` no passado reprova | PASS | N6 (`ate=2026-10-14`): "marca T42 vencida" |
| Negativo: marca com prazo acima de 5 dias reprova (D2) | PASS | N4 (`ate=2026-10-22`, 7 dias): "prazo de 7 dias; o máximo é 5" |
| Negativo: `it.only` reprova | PASS | N7: "`.only` esquecido" |
| `describe.skip` com marca dentro do prazo passa | PASS no analisador, REPROVA na árvore | `analisarTexto` aceita (caso do próprio teste). Plantado na árvore (N8, `ate=2026-10-18`), o portão é listado como "incondicional marcado" mas `test:scripts` sai 1 por outro teste: "nenhum skip incondicional marcado deve restar na árvore". Ver achado 2 |
| Skip sem marca reprova, provado por teste que morde | PASS | mutação M1 (`PRAZO_MAXIMO_EM_DIAS = 30`) e M2 (sem exigir `dono`): 16 de 17 em cada, vermelho no caso certo; `git restore`, 17 de 17 (`L/e02-04-mutacoes-portao.txt`) |
| Vigência fora do skip (marca da E04 saiu) | PASS | `apps/api/test/vigencia-na-escrita.test.ts` sem `describe.skip` (a única ocorrência é comentário, linha 38); portão: 0 incondicionais marcados |
| Evidência íntegra | FALHA da conferência mecânica | `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E02 --sha 52952a1`: "1 FALHA(S), 2 aviso(s)": `saidas/regressao-npm-test/06-teste-web.txt` não bate com o INDEX (achado 1) |

Defeitos das rodadas anteriores (achados anotados, a etapa passou nas duas):

- `it.skipIf(true)`, `describe.runIf(false)` e `{ skip: true && "sempre" }` contados como "ambiente", sem marca: AINDA MORDEM (sondas B1 a B3, código 0).
- A política diz que o CI não roda o portão: AINDA MORDE (`POLITICA-DE-TESTE-VERMELHO.md`, última seção). O CI roda `test:scripts` (`.github/workflows/verificar.yml:140`) e o log do job 116039196254 traz "Pulos que a lista estática não enumera (política T42, scripts/portao-de-skip.mjs)".
- Prazo efetivo de 6 dias (5 mais a folga de fuso): AINDA VALE (N5, `ate=2026-10-21`, é aceita pela marca). Está escrito na política e no código; não é defeito.

## Evidência

| Comando | Código | Saída |
| --- | --- | --- |
| `node --test scripts/portao-de-skip.test.mjs` | 0 | `L/e02-01-portao-de-skip-test.txt` |
| 19 sondas: arquivo `apps/api/test/zz-sonda-qa-t42.test.ts` escrito, portão rodado, arquivo apagado | ver tabela | `L/e02-02-sondas-portao.txt` |
| `git grep` das formas que o portão conta como ambiente | 0 | `L/e02-03-varredura-bypass-na-arvore.txt` (nenhum uso literal hoje) |
| mutações M1 e M2 com `git restore` | 1, 1, depois 0 | `L/e02-04-mutacoes-portao.txt` |
| `npm run test:scripts` | 0 | `L/90-test-scripts.txt` (260 de 260; 0 pulados porque a pasta `ios/` existe aqui) |
| `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E02 --sha 52952a1` | 1 | `L/00-conferir-evidencia.txt` |

## Cenários positivos

- Árvore atual: portão verde, contagem por ambiente impressa.
- Marca válida no prazo: aceita pelo analisador.

## Cenários negativos

N1 sem marca, N2 sem dono, N3 sem issue, N4 prazo de 7 dias, N6 vencida, N7 `.only`, N9 `xit` sem marca, N10 `it.todo` sem marca, N11 data impossível (`2026-02-30`), N12 marca separada do skip por linha em branco: todos reprovam com a mensagem certa.

## Tentativas de reprovar

- B1 `it.skipIf(true)(...)`, B2 `describe.runIf(false)(...)`, B3 `test("x", { skip: true && "sempre" }, ...)`: passam como "ambiente" (código 0). A política diz que a condição precisa ser de ambiente, mas o portão não distingue constante literal.
- B4 apelido (`const pular = it.skip`) e B5 opção `skip` em linha separada: passam. São os limites declarados na política.
- B6 marca com `dono=x issue=x`: o portão aceita a marca (não valida que `issue` seja etapa ou item do GitHub), mas a árvore reprova pelo teste de "nenhum marcado".
- B7 `it.fails(...)` (teste vermelho que vira verde invertido): passa sem marca e sem contagem. Não está na lista da etapa; anotado.
- Arquivos sonda apagados depois de cada caso; `git status --porcelain` final só com as pastas `validacao/52952a1/`.

## Achados

1. bloqueia a conferência mecânica, não o critério funcional (dono: o implementador da E02 junto com a classe da E21). `INDEX.md` da E02 traz para `saidas/regressao-npm-test/06-teste-web.txt` um SHA-256 que não bate com o arquivo commitado, nem normalizando LF para CRLF. O arquivo está no índice como `i/lf` e a saída arquivada da própria E21 (`V2-F00-E21/saidas/02-git-ls-files-eol-completo.txt`) o lista como `w/mixed` na máquina do autor: o hash foi tirado da árvore de trabalho com fim de linha misto, e o git normalizou no commit. Reprodução: `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E02 --sha 52952a1`. O conteúdo é o mesmo módulo o CR; o que se perde é a verificação. Remédio: recalcular o SHA-256 do INDEX sobre o blob commitado (como `d5d3926` fez na E04).
2. corrige antes de crescer (dono: E02, política T42). O teste da árvore real exige `arvore.marcados.length === 0` ("nenhum skip incondicional marcado deve restar na árvore", `dc360/scripts/portao-de-skip.test.mjs`, teste "a vigência da escrita voltou a rodar"). Efeito: a terceira saída da política ("pular, com dono, prazo e referência") não existe na prática: quem seguir a política à letra e marcar um skip dentro do prazo deixa `test:scripts` vermelho (sonda N8). É mais rígido, e não mais frouxo, então não esconde vermelho; mas a política publicada e o portão dizem coisas diferentes. Remédio: escrever na política que, enquanto a F00 estiver aberta, nenhum skip marcado é tolerado, ou tirar a asserção.
3. anotado (herdado, ainda morde). `skipIf(true)`, `runIf(false)` e `skip: true && "x"` passam como ambiente; `it.fails` passa sem nada.
4. anotado (herdado, ainda morde). A última seção de `POLITICA-DE-TESTE-VERMELHO.md` diz que o CI não enxerga o portão; enxerga.

## Não verificado

- Windows: o portão lê com `split(/\r?\n/)`; não rodei em Windows.
- `npm test` completo como regressão: rodei `test:scripts`, `test:isolamento`, shared e web; API, console e campo valem pela linha de base do gatekeeper no SHA.

## Risco residual

- O portão é leitura por linha: skip escondido em apelido, opção em outra linha ou condição literal passa, e o CI não reprova por isso.
- A integridade da evidência da E02 só se confere na máquina do autor até o INDEX ser recalculado.

## Motivo do humano

Não se aplica.
