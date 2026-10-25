# V2-F01-E13, correção do CI 2: o teste dos perfis do EAS não carregava em Windows

## Fatos

- **Origem:** o CI do ramo `v2/f01` no SHA `ef10aad`, job "Windows (auditar, test:scripts e conferir:numeros)". `scripts/perfis-do-eas.test.mjs` caiu no nível do arquivo (`not ok 26 - scripts\perfis-do-eas.test.mjs`), com `ERR_UNSUPPORTED_ESM_URL_SCHEME` no Node 22.23.4. Por consequência o passo seguinte, `conferir:numeros`, acusou 778 casos esperados e 762 na árvore: a diferença de 16 casos é o arquivo que não executou (o conferidor conta pela leitura do código; o runner só conta os que rodaram).
- **Causa:** `resolverConfiguracao` roda o `app.config.ts` em outro processo (`node --experimental-strip-types -e ...`) e o script do processo filho fazia `await import("<caminho>")` com o caminho do arquivo CRU. No Windows esse caminho é `D:\a\city-hall\city-hall\dc360\apps/campo/app.config.ts` (a raiz termina em barra invertida e o resto do texto vem com barra normal), e o carregador de módulos do Node lê `D:` como um esquema de URL e recusa. Em Linux e macOS o caminho começa com `/` e o `import()` aceita, por isso só o Windows caía. Como a chamada fica no topo do arquivo (`const hml = resolverConfiguracao("homologacao")`), o erro derrubou o arquivo inteiro, e não um caso.
- **Conserto:** o especificador passa a ser sempre uma URL `file://`, por `especificadorDoModulo(arquivo)` (`pathToFileURL`), que lida com letra de unidade, barras invertidas, mistura de barras e espaços. A opção `windows` do `pathToFileURL` existe para o teste simular o caminho do Windows em qualquer sistema. O resto do teste não mudou (o caso que escreve um `app.config` estragado numa pasta temporária usa a mesma função, e `tmpdir()` do Windows também começa com a letra da unidade).
- **Testes novos (3, em `scripts/perfis-do-eas.test.mjs`):** o caminho do Windows (`D:\a\...`, com e sem a barra misturada, e com espaço) vira `file:///D:/a/...`; o caminho POSIX vira `file:///home/...`; e nenhum especificador, de unidade `C:`, `z:` ou POSIX, deixa de começar com `file:///`. O arquivo passa de 17 para 20 casos (linha `V2-F01-E13` de `scripts/baseline.mjs`).
- **Saídas:** `saidas/01-perfis-do-eas.txt` (20 de 20 em macOS) e `saidas/02-especificador.txt` (o caminho de Windows do log do CI virando URL).

## Limitações

- Não há Windows nesta máquina. O que foi provado aqui é a causa lida no log do CI (o código `ERR_UNSUPPORTED_ESM_URL_SCHEME` é o do `import()` com `D:\...`) e a conversão do caminho de Windows feita por `pathToFileURL` com `windows: true`. A confirmação é o run do job Windows do próximo SHA (o `conferir:numeros` de lá deve fechar nos 16 casos de volta).
- Sem push.
