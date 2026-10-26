# V2-F01-E17, correção 1: teto por arquivo e regra, e lint em caminho com espaço

Origem: revisão independente da F01 (Codex), itens 2 (BLOQUEIA) e 4 (DÍVIDA) do relatório C.

## Fatos

### Item 2: o teto valia só no total e por regra (BLOQUEIA, confirmado e consertado)

- **O defeito, confirmado lendo `dc360/scripts/lint-teto.mjs`:** `problemasContraBase` comparava `lint-teto.json` (total e contagem por regra) com o do ramo-base. Corrigir uma supressão num arquivo e abrir outra da mesma regra noutro mantém o total (431) e a contagem da regra, então o portão `contra-base` passava e a baseline regenerada ficava verde.
- **Conserto:** nova função `problemasPorArquivoERegra(atual, base)` em `dc360/scripts/lint-teto.mjs`, chamada por `problemasContraBase`. O comando `contra-base <ref>` agora lê também `eslint-suppressions.json` e `apps/campo/eslint-suppressions.json` do ramo-base (com `lerDoRef`) e reprova qualquer par (projeto, arquivo, regra) que suba ou que não existia. Descer, ficar igual e arquivo que some passam. Base ausente (introdução do mecanismo) não tem contra o quê comparar e passa, como já era para o teto.
- **Teste que falha antes e passa depois:** `dc360/scripts/lint-teto.test.mjs`, descrição "contra o ramo-base: o teto vale por arquivo e regra, não só no total" (6 casos). O caso central monta exatamente o cenário do achado (a.ts perde a supressão, `api.ts` ganha uma, total 3 e 3, regra igual) e prova as duas pontas: a comparação só por total e regra devolve `[]` (o buraco), e com as baselines por arquivo devolve 1 problema. Antes: `saidas/01-antes-lint-teto-teste.txt` (o arquivo de teste nem carrega, falta o export novo). Depois: `saidas/03-depois-lint-teto-teste.txt` (26 passam, 0 falham).
- **Prova com o comando real:** `saidas/06-prova-par-novo.txt`. Mutei `eslint-suppressions.json` (corrigi `apps/api/src/documentos/folha.ts` / `no-base-to-string` e abri o mesmo par em `apps/api/src/arquivo-novo-com-defeito.ts`), rodei `lint-teto.mjs atualizar` (grava 431, o mesmo total) e `conferir` (verde, as somas batem), e `contra-base origin/v2/f01` REPROVOU (código 1) apontando o par novo. Os dois arquivos foram restaurados do repositório depois. `saidas/05-contra-base-real.txt`: no estado real, nada subiu.

### Item 4: o lint quebrava em caminho com espaço (DÍVIDA, confirmado e consertado)

- **O defeito, confirmado lendo `dc360/scripts/lint.mjs`:** o executável absoluto (`node_modules/.bin/eslint.cmd` no Windows) ia a `spawnSync` com `shell: true` e sem aspas; num checkout como `C:\Projetos\Defesa Civil\...` o shell cortava o caminho no espaço.
- **Conserto:** nova `comandoDoEslint(raiz)` devolve o `node` que está rodando (`process.execPath`) e o script JS do ESLint (`node_modules/eslint/bin/eslint.js`). `rodar` chama `spawnSync` SEM shell, então o caminho viaja como um argumento só, em qualquer sistema. Também passou a tratar `r.error` (falha ao executar sai com 2, nunca verde) e aceita `raiz` e `stdio` para teste.
- **Teste:** `dc360/scripts/lint.test.mjs` (novo, 5 casos), com um "ESLint" falso numa pasta `lint com espaco-.../Defesa Civil/dc360`: roda de verdade, repassa os argumentos e o `cwd`, repassa `--prune-suppressions` e o código de saída, ESLint ausente sai 2, e o fonte não usa mais shell nem o atalho de lote. Antes: `saidas/02-antes-lint-teste.txt`. Depois: `saidas/04-depois-lint-teste.txt` (5 passam). O lint real nas duas árvores segue verde (ver `saidas/07-gates.txt`).

## Justificativa

- O par (arquivo, regra) é a granularidade da própria baseline do ESLint; qualquer coisa mais grossa deixa um defeito novo comprar a vaga de um corrigido. O custo é que MOVER um arquivo que tem supressão agora reprova (o par "novo" não existia): a saída é corrigir o achado em vez de carregá-lo para o endereço novo, e a mensagem diz isso.
- Não mexi no formato de `lint-teto.json`: a comparação por par usa as baselines do ramo-base, que já estão versionadas, então não há segundo arquivo para ficar fora de sincronia.
- No lint, `node` direto no script do ESLint é mais simples e mais seguro que citar o caminho para o shell (aspas diferem entre `cmd` e `bash`).

## Limitações

- O Windows real com espaço no caminho só se prova no CI Windows (o job `windows` do `verificar.yml` roda `npm run lint`); aqui a prova é o checkout falso com espaço, que exercita a mesma chamada.
- `atualizar` continua comparando só com o `lint-teto.json` gravado; o portão por arquivo e regra é o `contra-base` (o que o PR roda).
