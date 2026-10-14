---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E02
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Saídas em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/qa-infra/` (abreviado `qa-infra/`).

| Critério | Resultado | Prova |
| --- | --- | --- |
| Política publicada com as três saídas, a diferença ambiente x incondicional, o prazo e quem decide | PASS | `dc360/docs/POLITICA-DE-TESTE-VERMELHO.md` lida inteira; prazo máximo de 5 dias e dono padrão `rafael` (D2 de 2026-10-13) |
| Portão verde na árvore atual | PASS | `qa-infra/09-portao-base.txt`: 17 de 17; "644 arquivos varridos; 10 skips por ambiente em 3 arquivos; 0 incondicionais com marca T42" |
| Contagem por ambiente lista os 3 `it.runIf` de `busca.test.ts` e os `skip:` de `entitlements-do-ios` e `som-de-despacho` | PASS | mesma saída: 3 em `db/test/busca.test.ts`, 4 em `scripts/entitlements-do-ios.test.mjs`, 3 em `scripts/som-de-despacho.test.mjs` |
| Skip sem marca reprova; marca sem dono, sem prazo, vencida ou acima do máximo reprova; `.only` reprova; `describe.skip` com marca no prazo passa | PASS | Sonda de 29 casos abaixo (`qa-infra/08-sonda-skip.txt`) |
| O `describe.skip` da vigência saiu na E04 | PASS | `apps/api/test/vigencia-na-escrita.test.ts` sem `skip`; portão: 0 incondicionais |
| Entra em `npm run test:scripts` e no CI | PASS | `qa-infra/01-test-scripts.txt`: 243 casos, 239 ok, 0 falhas, 4 pulados por ambiente; log do CI (job "Testes, tipos e scripts") imprime a linha "Portão de skip: 644 arquivos varridos" |

## Evidência

`qa-infra/sonda-skip.mjs` chama `analisarTexto` de `scripts/portao-de-skip.mjs` com `hoje = 2026-10-13`. Resultado resumido (`08-sonda-skip.txt`):

- REPROVA: `it.skip` sem marca; marca sem `dono`; `dono=` vazio; sem `ate`; sem `issue`; `ate` vencido (hoje menos 1 dia); `ate=2026-02-30`; `ate=13/10/2026`; `ate=2026-10-14T00:00`; `ate` com prazo de 7 e de 30 dias; marca separada por linha em branco; `xit`; `it.todo`; `test.skip.each`; `it.concurrent.skip`; `{ skip: true }`; `{ skip: 'motivo' }` sem condição; `t.skip()`; `it.only`; `fit`; marca dentro de bloco `/* */`.
- PASSA: `ate` igual a hoje, hoje+1, hoje+5 e hoje+6; `describe.skip` com marca no prazo; marca com CRLF; `it.skipIf/runIf` e `skip: cond && "motivo"` (contados como ambiente).

## Cenários positivos

`describe.skip` com marca válida passa e aparece como "marcado". `ate` igual a hoje ainda vale (documentado: "hoje é o último dia válido").

## Cenários negativos

- Mutação 1: `PRAZO_MAXIMO_EM_DIAS = 30`: `portao-de-skip.test.mjs` fica 16 de 17 (vermelho em "conferirMarca aceita o limite exato do prazo e rejeita um dia a mais que a folga de fuso", `qa-infra/10-portao-mut-prazo30.txt`). Restaurado.
- Mutação 2: `if (dias < 0)` trocado por `dias < -9999` (vencido deixa de reprovar): vermelho em "marca com ate no passado reprova, e ate igual a hoje ainda vale" (`11-portao-mut-vencido.txt`). Restaurado.
- Mutação 3: `dono` sai da lista de campos obrigatórios: vermelho em "marca sem dono, sem issue ou sem ate reprova" (`12-portao-mut-dono.txt`). Restaurado. Depois das três, `git status` limpo e 17 de 17.

## Tentativas de reprovar

1. Prazo: com a decisão D2 (5 dias) a marca com `ate` = hoje+6 PASSA (a política soma 1 dia de folga de fuso, escrita e testada). Só reprova a partir de hoje+7, e a mensagem diz "o máximo é 5". Não é erro de implementação (a folga está na política, no código e no teste), mas é diferente do que a frase "5 dias" da decisão sugere.
2. Skip incondicional disfarçado de ambiente: `it.skipIf(true)`, `it.runIf(false)` e `{ skip: true && 'motivo' }` PASSAM e são contados como ambiente. A política diz que a condição "precisa ser verdadeira por causa do ambiente", mas o portão não distingue constante literal de condição real, e esse caso não está entre os "limites ditos em voz alta".
3. Limites declarados que confirmei: opção `skip` em linha separada passa; chamada depois de `;` na mesma linha passa. Não declarado: `test.fixme` (Playwright) passa; o repositório não usa Playwright Test (os E2E são `node test/fluxo.e2e.mjs`), então sem efeito hoje.
4. Marca duplicada (`dono=a ... dono=b`) vale; a última ganha. Sem efeito prático.
5. Pastas varridas cobrem `apps/web/test/*.e2e.mjs` (extensão `.mjs`), o jest do aplicativo (`apps/campo/src`) e `scripts`; não achei pasta de teste fora da lista.

## Achados

1. Anotado (corrige antes de crescer, se o time quiser fidelidade à frase da decisão): prazo efetivo é 6 dias; ajustar a mensagem ou o texto de D2 para dizer "5 mais 1 de folga".
2. Anotado: `skipIf(true)`, `runIf(false)` e `skip: true && "x"` escapam como "ambiente". Remédio pequeno: tratar literal `true`/`false` como incondicional e acrescentar o caso ao teste do portão.
3. Anotado (documental): `dc360/docs/POLITICA-DE-TESTE-VERMELHO.md:176-177` diz que "o CI não o enxerga" até a F01-E03; o log do CI do run 38445527075 já mostra o portão rodando dentro de `test:scripts`. A frase está velha.

## Não verificado

- O portão sobre uma segunda máquina (Linux): vale o CI, que imprimiu a mesma contagem (10 skips por ambiente em 3 arquivos).
- Pasta de teste criada depois deste SHA.

## Risco residual

O portão é leitura por linha: um skip bem escondido (apelido, opção em linha separada, `return` antecipado dentro do teste) passa. Já declarado na política, exceto o item 2 dos achados.

## Motivo do humano

Não aplicável (a decisão D2 já foi tomada por Rafael em 2026-10-13).
