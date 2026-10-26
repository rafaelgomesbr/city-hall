---
validador: qa (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E02
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: []
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---

Pasta das saídas (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/qa-lote2/` (abaixo, `SAIDAS/`). Mac, Node v24.15.0. Hoje (UTC) 2026-10-18.

## Critérios verificados

| Critério | Resultado | Prova |
| --- | --- | --- |
| Política publicada (`dc360/docs/POLITICA-DE-TESTE-VERMELHO.md`): três saídas, ambiente x incondicional, marca, prazo, dono padrão, quem decide | PASS | lida; prazo máximo 5 dias (D2), folga de fuso de 1 dia, dono padrão `rafael`, coerente com `PRAZO_MAXIMO_EM_DIAS = 5` em `scripts/portao-de-skip.mjs` |
| Portão verde na árvore atual | PASS | `node --test scripts/portao-de-skip.test.mjs`: código 0, 657 arquivos varridos, 12 skips por ambiente em 5 arquivos, 0 incondicionais marcados (`SAIDAS/e02-01-portao-arvore-limpa.txt`) |
| Contagem por ambiente impressa | PASS | lista `db/test/busca.test.ts` 3, `scripts/entitlements-do-ios.test.mjs` 4, `som-de-despacho` e os demais |
| Skip sem marca reprova (plantado na árvore real) | PASS | `it.skip` sem marca acrescentado em `apps/web/test/duplicidade-sem-rede.test.ts`: código 1, motivo "sem a marca" (`SAIDAS/e02-02-portao-skip-sem-marca.txt`); desfeito com `git restore` |
| Marca sem `dono` reprova | PASS | plantado: código 1, "marca T42 sem `dono=`" (`e02-03`) |
| `ate` no passado e prazo acima do teto reprovam | PASS | sonda sobre `analisarTexto` (`SAIDAS/e02-sonda-analisar-texto.txt`): vencida em 2026-10-17 reprova; 7 dias reprova; 6 dias (teto mais folga) passa; data impossível `2026-02-30` reprova; sem `issue` reprova |
| `.only` reprova | PASS | `it.only` plantado na árvore: código 1 (`e02-06`); sonda: `describe.only` com marca e `test.concurrent.only` reprovam |
| `describe.skip` com marca no prazo passa | PASS no caso sintético (ver achado 2) | caso "describe.skip com marca dentro do prazo passa" verde; sonda: marca de 3 dias passa |
| Regressão `test:scripts` e `npm test`, `test:isolamento` | PASS | linha de base completa desta rodada: `test:scripts` 288 e 0 falhas; shared 170, db 345 e 3 pulados, pacote de campo 223, console 259, painel 665, verdes; API só com a falha de máquina do LibreSSL (`SAIDAS/baseline-completo/`) |
| `INDEX.md` byte a byte (motivo do BLOCKED da rodada 3) | PASS | conferência própria contra os blobs de `bb0f654`: raiz 21 de 21 e os 4 índices aninhados 3, 3, 3 e 8 de 8, nenhum arquivo fora (`SAIDAS/index-conferencia.txt`); `conferir-indices-de-evidencia.mjs` OK |

## Evidência

- `node --test scripts/portao-de-skip.test.mjs` na árvore limpa (código 0) e com cada plantio (`e02-02` a `e02-06`), cada plantio desfeito com `git restore apps/web/test/duplicidade-sem-rede.test.ts` e `git status` limpo depois.
- `node qa-scripts/sonda-skip.mjs` (28 casos sintéticos contra `analisarTexto`, com `hoje = 2026-10-18`).

## Cenários positivos

- Árvore real verde, contagem por ambiente impressa.
- Marca válida (3 dias, e 6 dias pela folga) aceita pelo analisador.

## Cenários negativos

- Plantados na árvore real: `it.skip` sem marca (1), marca sem dono (1), `it.only` (1).
- Sintéticos: vencida, 7 dias, sem issue, data impossível, `xit`, `it.todo`, `test.skip.each`, `{ skip: true }`, `{ skip: "texto" }` sem condição: todos reprovam.

## Tentativas de reprovar

1. Procurei formas de pular que o portão não vê. Achei três que passam caladas: `it.skipIf(true)(...)` e `it.runIf(false)(...)` (contados como "por ambiente"), `test("x", ({ skip }) => { skip(); })`, `;it.skip(` e `await describe.skip(` no começo da linha, `it .skip(` e `it["skip"](`. Plantado na árvore real, `it.skipIf(true)` passou com código 0 e entrou na contagem "por ambiente" (`SAIDAS/e02-05-portao-skipif-true.txt`).
2. Testei `skip: 1 && "motivo"` e `skip: true ? "m" : false`: passam como "por ambiente", embora a condição seja constante.
3. Conferi o prazo com o relógio: D2 de 5 dias está no código e na política, e o teste do teto usa data injetada.
4. Conferi o INDEX contra os blobs commitados (o defeito da rodada 3): bate.

## Achados

1. Corrige antes de crescer: skip incondicional disfarçado de "por ambiente" passa. `it.skipIf(true)`, `it.runIf(false)`, `describe.skipIf(1)` e a opção `skip: <constante> && "motivo"` são contados como pulo por ambiente, sem marca, embora pulem em toda máquina. A política diz que "a condição precisa ser verdadeira por causa do ambiente", mas a regra é só escrita: o varredor não rejeita condição literal, e esse buraco não está na lista de "limites ditos em voz alta" (que cita só opção em linha separada e apelido). Reprodução: acrescentar `it.skipIf(true)("x", () => {});` a qualquer teste e rodar `node --test scripts/portao-de-skip.test.mjs` (código 0). Não quebra os critérios listados da etapa (os casos pedidos reprovam), por isso não é FAIL.
2. Corrige antes de crescer: a política e o portão divergem sobre o skip marcado. A política (seção "A marca") diz que skip incondicional com marca válida é uma saída permitida; o teste da árvore real (`scripts/portao-de-skip.test.mjs:44`, acrescentado depois da E04) reprova QUALQUER marcado ("nenhum skip incondicional marcado deve restar na árvore"). Reprodução: `describe.skip` com `// T42 dono=rafael issue=V2-F00-E99 ate=2026-10-20` plantado na árvore real sai com código 1 (`SAIDAS/e02-04-portao-marca-valida.txt`). É mais estrito, não mais frouxo, mas quem segue a política escrita bate num vermelho que ela não descreve.

## Não verificado

- O portão no CI (job "Testes, tipos e scripts"): o run não foi lido.
- Mutação do próprio `portao-de-skip.mjs` para provar que os casos do teste mordem: os casos que pedi reprovaram por plantio na árvore e por sonda direta, o que já prova o efeito; não reescrevi o varredor.

## Risco residual

Médio-baixo: um pulo incondicional escrito como `skipIf(true)` passa pelo portão e só a revisão de código o pega. A vigência, que motivou a etapa, voltou a rodar e não há marca T42 na árvore.

## Motivo do humano

Nenhum. Prazo máximo e dono padrão já foram decididos por Rafael (D2, 2026-10-13).
