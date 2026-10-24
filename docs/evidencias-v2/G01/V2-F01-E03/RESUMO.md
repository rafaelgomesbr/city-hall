# V2-F01-E03: CI roda o que só rodava local

## Fatos

### O que já existia e o que mudou

O planejador acertou: a maior parte da E03 já estava no `verificar.yml` quando a etapa começou (commit `1c6887f`, da E02): `node scripts/auditar.mjs` no job `dependencias` (chamado pelo `node` de propósito, sem `npm audit` próprio no `produto` nem no `aplicativo`), `npm run test:scripts` no `produto` depois do `npm ci` das duas árvores, e `npm run test:campo` no `aplicativo`. Nenhum job foi renomeado. O que faltava e foi feito:

- `.github/workflows/verificar.yml`, job `aplicativo`: os passos avulsos `npm run typecheck` e `npm test` saíram. O `npm run test:campo` já faz as duas coisas, na ordem, e ainda cruza a contagem do jest com a leitura do código (o comentário antigo do arquivo já previa essa troca "se o tempo do job pesar"; a etapa a pede). O passo ficou com o nome "Tipos, testes e contagem do aplicativo (test:campo)" e o artefato `03-test-campo.txt`. Diff completo em `saidas/09-diff-do-verificar-yml.patch`.
- `test:scripts` NÃO foi repetido no `aplicativo`: o texto da etapa o pede lá, mas o `produto` já o roda com as duas árvores instaladas (o `npm ci` do aplicativo vem antes, `id: instalar_app`), que é a razão que a etapa dá. Repetir só gastaria uns minutos do job. Um caso do teste prende essa ordem no `produto`.
- `dc360/scripts/conferir-workflows.test.mjs` ganhou 9 casos (24 no total): lê o script `verificar` do `package.json` e reprova se algum comando dele (`typecheck`, `npm test`, `test:scripts`, `test:campo`, `auditar`, `conferir:numeros`) não aparecer num `run:` de nenhum workflow. `npm run auditar` vale também como `node scripts/auditar.mjs` (corpo do script); `npm test` só vale literal (`npm run test --workspace X` roda um pedaço da suíte e não conta); comando só em comentário ou em `name:` não conta. Reprova também `npm audit` que decide (sem `|| true`, ou com `--audit-level`); o que sobrou no `dependencias` é o relatório bruto como evidência, com `|| true`. Prende que o `auditar` roda pelo `node` no job `dependencias` e que o `aplicativo` roda `test:campo` sem `npm audit` próprio. Casos negativos: tirar cada comando reprova.
- `dc360/scripts/baseline.mjs`: a linha `V2-F01-E02` passou de 15 para 24 casos (mesmo arquivo, uma linha só; o comentário explica).
- `dc360/README.md`: o parágrafo "O CI roda tudo o que o `npm run verificar` roda" e a linha do job `aplicativo` na tabela.
- Cabeçalho do `verificar.yml`: uma linha com a regra.

Não tocados: STATUS, ESTADO-ATUAL, pendências, dívidas, `CODEOWNERS`, `pull_request_template.md`, `CLAUDE.md`, `dc360/package.json`, `sast.yml`, `segredos.yml`, `auditoria-semanal.yml`.

### Comandos e resultados (saídas em `saidas/`)

| Arquivo | Comando | Resultado |
| --- | --- | --- |
| `01-conferir-workflows.txt` | `node --test scripts/conferir-workflows.test.mjs` | 24 de 24, código 0 |
| `02-prova-de-mordida.txt` | o `verificar.yml` REAL estragado de oito jeitos, um por vez (restaurado no fim) | os oito reprovam, inclusive tirar `node scripts/auditar.mjs`, `test:campo` e `test:scripts` (a regra desta etapa) |
| `03-test-campo.txt` | `npm run test:campo` (Node 24 local, máquina carregada) | código 1: 1988 de 1989 casos passaram; duas suítes caíram por causa do ambiente (um worker do jest morto por `SIGSEGV` em `plano-esquematico.test.tsx`, e um timeout de 30 s em `a-sessao-vencida-nao-apaga-a-vistoria.test.tsx` rodando em paralelo com todo o resto). Nenhuma toca o que esta etapa mudou |
| `03b-test-campo-as-duas-suites-isoladas.txt` | `npx jest` só nessas duas suítes | 2 suítes, 11 casos, todas verdes, código 0 |
| `04-auditar.txt` | `node scripts/auditar.mjs` | código 1: 3 advisories de runtime (zod, fastify, fast-uri). É o vermelho conhecido, corrigido noutro ramo, e a etapa não o toca |
| `05-conferir-numeros.txt` | `npm run conferir:numeros` | "Todos os números da documentação batem com a realidade", código 0 |
| `06-baseline-test.txt` | `node --test scripts/baseline.test.mjs` | 29 de 29, código 0 |
| `07-regras-de-conteudo.txt` | `npx vitest run --root packages/shared test/regras-de-conteudo.test.ts` | 10 de 10, código 0 |
| `08-test-scripts-com-index.txt` | `npm run test:scripts` com o `INDEX.md` presente | 476 testes, 472 ok, 4 pulados, 0 falhas, código 0 (a primeira rodada, antes do `INDEX.md`, reprovou só em `conferir-indices-de-evidencia`, como esperado) |

Contagem de `scripts/`: 467 depois da E02, 476 depois desta (9 casos novos).

### Limitações

- Nada foi executado no GitHub. As provas do enunciado dependem do run do SHA candidato e de PRs de prova: "aplicativo verde com test:campo", "produto verde com auditar" (o `dependencias` fica vermelho pelas advisories acima, até a correção chegar a este ramo), o PR que muda `--ds-accent` em `tokens.css` sem mudar `tokens.ts` e deixa o `aplicativo` vermelho (o portão de paridade é do `test:scripts`, no `produto`; o `test:campo` não o roda, então esse PR de prova deve ser lido no job `produto`), e o PR que tira `npm run auditar` do workflow (aqui a prova local é a mordida em `02`).
- O `test:campo` completo não fechou verde nesta máquina (Node 24, não o 22 do CI) por falha de ambiente, com as duas suítes verdes isoladas. O run do CI é a prova que vale.
- O artefato do job `aplicativo` mudou de numeração (`03-typecheck.txt`, `04-jest.txt` e `05-test-campo.txt` viraram `03-test-campo.txt`); nenhum script do repositório lia esses nomes (conferi por busca).
- O leitor de `run:` é por texto, sem biblioteca de YAML.

## Justificativa

- Substituir os passos avulsos pelo `test:campo` é o que o enunciado manda e o que o comentário antigo do arquivo já antecipava: o comando da raiz cobre os dois e ainda confere a contagem.
- `test:scripts` fica só no `produto`: já tem as duas árvores e é onde a E21 provou a portabilidade; duplicar no `aplicativo` não acrescenta prova.
- `npm audit` com `|| true` permitido: é evidência do job `dependencias` que o validador usa para conferir a política contra os dados, e não decide nada.

## Para o orquestrador

Linha do STATUS sugerida:

`| V2-F01-E03 | CI roda o que só rodava local: auditar, test:scripts, test:campo | M | P0 | IMPLEMENTADA | Candidato <sha7>. Job aplicativo passa a rodar test:campo no lugar de typecheck e npm test avulsos; conferir-workflows ganha a regra "todo comando do script verificar aparece num run:" (npm run auditar vale como node scripts/auditar.mjs) e a proibição de npm audit que decide; 9 casos novos (baseline V2-F01-E02: 24), com prova de mordida sobre o verificar.yml real. auditar e dependencias seguem vermelhos por zod, fastify e fast-uri (outro ramo). Nada executado no GitHub ainda. |`

Pendências humanas:

1. Ver o run do SHA candidato: `aplicativo` verde com `test:campo`, `produto` verde com `test:scripts`. O `dependencias` só fica verde depois que as correções de zod, fastify e fast-uri chegarem a este ramo.
2. PR de prova da paridade (`--ds-accent` em `tokens.css` sem `tokens.ts`): o vermelho aparece no `test:scripts` do job `produto`, e não no `aplicativo`. Se a etapa quiser o vermelho no `aplicativo`, é decisão de rodar o portão de paridade lá também.
