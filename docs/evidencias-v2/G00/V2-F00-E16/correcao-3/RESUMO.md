# V2-F00-E16, correção 3: o caso da posição 0,0 deixa de depender do milissegundo em que as tarefas foram montadas

Base: `7d067cc`, ramo `trab/correcao-7`. Motivo: no CI (run 39488319365, job "Aplicativo de campo"), o caso "a posição 0,0 de quem ainda não fixou o GPS não vira distância nenhuma", de `dc360/apps/campo/src/__tests__/hoje-lista-e-mapa.test.tsx`, passou no `npm test` (1997 de 1997) e reprovou logo depois, no mesmo job, no `npm run test:campo`: esperava `["perto", "longe"]` e recebeu `["longe", "perto"]` (`saidas/00`).

Etapa dona: nenhuma etapa da V2 tocou este arquivo (o `git log` dele só tem commits anteriores à V2, e o caso nasceu em `8a7c995`). Pela regra do pedido, sem dona clara vale a etapa do aplicativo de campo, V2-F00-E16.

## Causa raiz: defeito do teste, não corrida no produto

- O auxiliar `tarefa()` dos testes calculava `prazo_em: new Date(Date.now() + 9 * HORA)` A CADA CHAMADA. As duas tarefas do caso ("longe" montada primeiro, "perto" depois) só têm o mesmo prazo se o relógio não virar de milissegundo entre as duas chamadas.
- `ordemDoDia` (`dc360/apps/campo/src/dados/ordem-do-dia.ts`) desempata, nesta ordem: grupo, faixa de prazo, distância, instante EXATO do prazo, protocolo. Sem distância, quando o relógio vira entre as duas montagens, "longe" fica com o prazo 1 ms mais cedo e passa na frente pelo degrau do prazo exato, antes de o protocolo ser consultado. O comentário do caso dizia que "sem posição, o desempate final é o protocolo", o que só era verdade quando os dois prazos caíam no mesmo milissegundo.
- O próprio log do CI descarta a hipótese de a ilha nula ter ordenado a lista: a asserção anterior, `getByText(/não considerou distância/)`, PASSOU na mesma execução, e nenhum texto de distância apareceu. Se 0,0 tivesse virado origem, o aviso sumiria e a frase "a ... km de você" apareceria (é exatamente o que a mordida da seção abaixo mostra). O produto filtra 0,0 duas vezes antes de qualquer conta: em `verOndeEstou` (`app/(agente)/index.tsx`, `pontoQueSeMede` antes do `setOndeEstou`) e de novo na entrada de `ordemDoDia`. Não há estado intermediário com 0,0.
- A mesma armadilha estava no auxiliar `tarefa()` de `mapa-tela-dedicada.test.tsx` e de `tarefas-em-sanfona.test.tsx` (texto idêntico). Não achei caso que já reprovasse por ela nesses dois, mas qualquer caso que dependesse do desempate por protocolo com o prazo padrão herdaria a mesma instabilidade.

## Correção

- Nos três arquivos, o prazo padrão virou UM instante por caso (`prazoPadrao`), fixado no `beforeEach` de topo, que roda antes de todo `beforeEach` interno e de todo caso. `tarefa()` lança erro se for chamada antes disso, para a regra não envelhecer em silêncio. O comentário do caso 0,0 passou a dizer por que o protocolo decide.
- Nenhuma asserção foi afrouxada, e nenhum código de produto mudou. A contagem de testes não muda (1997 no aplicativo de campo), então `baseline.mjs`, o README e o `COLOCAR-DE-PE.md` não foram tocados por esta correção.

## Provas

| Medida | Antes (`7d067cc`) | Depois |
| --- | --- | --- |
| Arquivo isolado, 40 rodadas (`saidas/01`, `saidas/10`) | 1 de 40 reprovou | 0 de 40 |
| Só o caso 0,0, 200 rodadas, quatro em paralelo (`saidas/02`, `saidas/11`) | 1 de 200 reprovou | 0 de 200 |
| Os três arquivos, `--runInBand`, 8 núcleos ocupados por `yes`, 25 rodadas (`saidas/03`, `saidas/12`) | 0 de 25 | 0 de 25 |
| Sonda do relógio: `Date.now` avançando 1 ms por chamada enquanto as duas tarefas são montadas (`saidas/04`, `saidas/13`) | 10 de 10 reprovaram, com a falha idêntica à do CI | 0 de 10 |

- A sonda (`scripts/fazer-sonda.mjs`) é a reprodução determinística: copia o arquivo de teste para um temporário em `src/__tests__/`, pula todos os outros casos e, no caso 0,0, faz o relógio andar 1 ms a cada `Date.now()` só durante a montagem das tarefas. Antes: reprova sempre, com "longe" na frente e o aviso de que a ordem não considerou distância NA TELA. Depois: passa sempre, porque o prazo já foi fixado no `beforeEach`. O arquivo temporário foi apagado depois de cada uso.
- Carga de CPU sozinha não reproduziu (0 de 25 antes): o defeito depende de o relógio virar de milissegundo entre duas chamadas a microssegundos uma da outra, não da lentidão da máquina.
- Mordida (`saidas/20`): com o teste já corrigido e a linha `if (latitude === 0 && longitude === 0) return null;` removida de `pontoQueSeMede`, o caso 0,0 reprova ("Unable to find an element with text: /não considerou distância/"). O teste continua guardando o produto; o arquivo foi restaurado da cópia logo em seguida.

## Portões rodados depois da correção

- `cd dc360/apps/campo && npm test`: 139 suítes, 1997 de 1997 (`saidas/30`).
- `npm run typecheck` do campo: saída 0 (`saidas/31`).
- `cd dc360 && npm run test:campo`: 1997 de 1997, saída 0 (`saidas/32`).
- `npm run conferir:numeros`: saída 0, 25 afirmações conferidas (`saidas/33`).
- `node --test scripts/baseline.test.mjs`: 29 de 29 (`saidas/34`).
- `node dc360/scripts/conferir-indices-de-evidencia.mjs` no worktree (`saidas/35`): a única falha é a pasta NÃO RASTREADA `G00/V2-F00-E05/correcao-7b`, de outra sessão em andamento no mesmo worktree, que não entra neste commit. O mesmo conferidor numa árvore limpa (HEAD mais esta pasta da E16, `scripts/conferir-limpo.sh`) saiu `RESULTADO: OK`, saída 0, depois de o índice estar fechado; essa saída não está arquivada porque ela mesma não poderia estar no índice que confere.
- Portão de conteúdo `npx vitest run packages/shared/test/regras-de-conteudo.test.ts`: 10 de 10 (`saidas/36`).

## O que não foi provado, ou ressalvas

- A taxa natural antes da correção é baixa (1 de 40 e 1 de 200 nesta máquina); "0 de 200 depois" sozinho não provaria nada com essa taxa. A prova de que a causa é esta, e de que a correção a fecha, é a sonda do relógio (10 de 10 contra 0 de 10).
- A primeira rodada do `npm test` do campo depois da correção, com a máquina carregada por outras sessões (média de carga entre 20 e 28 em 8 núcleos), teve 2 casos em tempo esgotado de 30 s em outros arquivos (`a-aba-nao-fica-escura.test.tsx` e `o-cartao-responde-ao-dedo.test.tsx`), sem relação com esta correção; na rodada seguinte, que é a arquivada, passaram. O `typecheck` dessa primeira rodada também reprovou pelo cache velho e ignorado pelo git de `apps/campo/.expo/types/router.d.ts` (sem `/avisos`), que o `test:campo` apaga, como já previsto em `scripts/testar-campo.mjs`; a saída arquivada é a de depois. Essas duas saídas não foram guardadas.
- O worktree tinha, ao mesmo tempo, alterações de outra sessão, não commitadas, em `apps/api`, `apps/console`, `apps/web`, `packages/shared`, `scripts/baseline.mjs`, README e `COLOCAR-DE-PE.md`. O `conferir:numeros` e o `baseline.test.mjs` rodaram com elas no disco. Nada disso entra neste commit, que tem só os três arquivos de teste e esta pasta.
- Não rodei o job do CI de novo: a confirmação no CI fica para o próximo push do ramo.
