# V2-F00-E05, correção 5: o README diz o mesmo que o código sobre o que GARANTE o catálogo de códigos de erro

Base: `fd17ff4`, ramo `trab/correcao-7`. Motivo: achado de pré-validação da rodada 7 (documentação desmentida pelo próprio README). Só documentação.

## Fatos

- **Contradição:** `dc360/README.md`, no fim do item "Prova dinâmica" (linhas 235 a 237), dizia que "a garantia de que nenhuma recusa de acesso sai fora do catálogo vem primeiro da varredura do fonte". Nas linhas 151 e 152 o mesmo README diz "Quem GARANTE isto é uma guarda em tempo de execução ... nenhum deles é garantia sozinho", e o cabeçalho de `packages/shared/src/codigos-de-erro.ts` diz "A GARANTIA é uma guarda em tempo de execução, não um teste do texto".
- **Conserto** (`diff-da-correcao.patch`, um trecho de `dc360/README.md`): a garantia é a guarda em tempo de execução (o primeiro item da lista); a varredura do fonte é a primeira linha dos testes, heurística; a prova dinâmica é a segunda e fecha o que o texto esconde só onde chega, com os perfis e os corpos mínimos que usa; nenhuma das duas é garantia sozinha. Nenhuma linha de código mudou.
- **Varredura por outra contradição do mesmo assunto** (`saidas/01-varredura-da-contradicao.txt`): todas as menções a garantia, heurística, primeira e segunda linha, no README (linhas 145 a 270) e no cabeçalho do catálogo, depois do conserto. As restantes concordam: o README em 151-152, 174, 213 e 256-257 e o catálogo em 25-27, 60, 64, 159 e 169 dizem que a garantia é a guarda, que a varredura é heurística e que a prova dinâmica é a segunda linha; "Contra isso NÃO há garantia em tempo de execução: só a varredura" (README 256, catálogo 159) fala do que a guarda não vê (escrita direta no socket), e continua certo. Nenhuma outra contradição.
- **Regressão:** portão de conteúdo (`regras-de-conteudo.test.ts`) e `permissoes-no-readme.test.ts`, 2 arquivos, 20 testes verdes (`saidas/02`); `npm run conferir:numeros` código 0 (`saidas/03`); `conferir-indices-de-evidencia.mjs` OK (`saidas/04`).
- **Não verificado:** nada além do texto; sem teste que leia essa frase do README (a etapa pode ganhar um se a validação pedir).
