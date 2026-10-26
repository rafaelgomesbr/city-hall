# V2-F02-E03, parte 1C: guardas de códigos de erro (DV-01, retrato dos cabeçalhos, e DV-03, conferência linear)

## Fatos

**O que mudou:**

- `dc360/apps/api/src/guarda-de-codigos-de-erro.ts` e a cópia `dc360/apps/console/src/guarda-de-codigos-de-erro.ts` (mesma mudança nas duas):
  - **DV-01, retrato dos cabeçalhos.** No `end` de uma resposta segurada (401, 403, 1xx), a guarda lê UMA vez cada valor de `getHeaders()` e dos cabeçalhos do `writeHead`, converte para texto nessa leitura (primitivo fica como está), confere nome (token do HTTP) e valor (sem caractere de controle, a regra do Node 24) e regrava exatamente esse retrato: por `setHeader` na resposta e por um objeto NOVO de texto no `writeHead`. Valor que o Node recusaria é desvio. Vale para lista de valores, para a frase da linha de status e para o caminho do desvio.
  - **DV-01, segunda rede.** Na porta dos bytes, a cabeça que o Node montou (`_header`) só pode ter `CRLF CRLF` no fim; antes disso é uma segunda resposta dentro da cabeça. A resposta inteira é trocada pela do desvio. Vale também para respostas que não são seguradas (200, por exemplo).
  - **DV-01, `writeEarlyHints`.** O Node recebe sempre um objeto novo, de texto, montado com uma leitura de cada valor, igual em Node 22 e 24 (a regra do Node 24 que recusa CR e LF já era aplicada nas duas versões).
  - **DV-03, `chavesErro` linear.** A expressão regular `CHAVE_JSON` (que relia o resto do texto a cada aspas) foi trocada por uma passada só: cada cadeia é lida do começo ao fim uma vez, e é chave quando o próximo caractere que não é espaço é `:`. Só chave de 4 a 24 caracteres (o maior caso é `erro` escrito todo em `\uXXXX`) é analisada. Resultado igual ao anterior nos 7 casos de contagem do teste.
- `dc360/apps/api/test/guarda-de-codigos-de-erro.test.ts` (+18 casos, 140 para 158) e `dc360/apps/console/test/guarda-de-codigos-de-erro.test.ts` (+18 casos, 48 para 66):
  - 9 de DV-01 com VALORES INOFENSIVOS: um objeto cujo `toString` devolve sempre o mesmo texto comum e soma um contador (a guarda tem de ler UMA vez), e um que devolve um texto na primeira leitura e outro nas seguintes (sai a primeira, numa resposta só; quando o Node já leu a primeira, a guarda lê a segunda uma vez, vê o fim de cabeçalho e troca a resposta). Cobrem `reply.header`, `setHeader` da resposta crua, lista de objetos, frase da linha de status, desvio, 200 não segurado (segunda rede), `_header` partido por escrita por baixo mais o controle da cabeça inteira, e Early Hints (propriedade comum e getter). Nenhuma carga de injeção de cabeçalho; o texto que representa "outra resposta" é só um nome de campo e um valor comuns.
  - 2 de DV-03 de tempo (60 KB de aspas escapadas em menos de 100 ms, 1 MB em menos de 1,5 s, 20 mil chaves curtas e 20 mil cadeias com aspas escapadas em menos de 500 ms) e 7 de contagem de chaves `erro` (escape unicode, espaço e quebra antes dos dois pontos, aninhado, parecidas como `errou`, `err`).
- `dc360/apps/console/src/guarda-de-codigos-de-erro.ts.orig` (lixo de patch que veio no salvamento) foi apagado.
- Contagens: `baseline.mjs` ganhou `V2-F02-E03-parte-1C: { total: 18 }` em `MUDANCAS_DO_TESTE_API_POR_ETAPA`, e o esperado do passo `teste-console` foi de 339 para 357 (o console não tem tabela, o número é do próprio passo). README (1869 para 1887 da API, 339 para 357 do console, 3921 para 3957 no total) e `COLOCAR-DE-PE.md` (5918 para 5954). Nenhuma chave nova em `TESTES_DAS_ETAPAS_SEGUINTES_EM_SCRIPTS` (a parte não mexe em `scripts/`).

**O que NÃO foi feito (de propósito):** o README e o cabeçalho de `packages/shared/src/codigos-de-erro.ts` não ganharam o modelo de ameaça da guarda (é a DV-02, que não é desta parte). Nenhum outro arquivo de `apps/api/src` ou `apps/console/src` foi tocado.

**Prova de mordida (`saidas/11`):** com o `guarda-de-codigos-de-erro.ts` do `origin/v2/f02` (sem as correções) no lugar, 18 dos 36 casos novos reprovam (os que dependem do conserto; os 206 restantes passam, entre eles os controles); com o código novo, 224 de 224 passam nos dois arquivos de teste.

## Limites declarados (leia antes de dar PASS)

- **Só há Node 22.17.0 nesta máquina.** A igualdade com o Node 24 não foi medida aqui: a guarda aplica a regra do Node 24 nas duas versões e os testes não dependem da versão, mas a execução em Node 24 é a do CI do SHA candidato.
- **Falhas de ambiente Windows conhecidas, fora desta parte (iguais no `origin/v2/f02`):** `regras-de-conteudo.test.ts` 1 caso (EPERM em symlink, DV-46), `desfazer-migracao.test.ts` 5 e `guarda-da-semente.test.ts` 3 (no `test:isolamento`, por `spawnSync` do tsx com status nulo), `semear-homologacao.test.ts` 2 (no `npm test` da API). Nenhuma outra falha. `test:e2e:api` não foi rodado (fica para o CI).
- **Modelo de ameaça inalterado (D-31, item 2):** tudo isto exige código hostil dentro da própria rota; nenhum cliente externo alcança. A guarda continua sem ver o que a rota escreve por fora de toda a pilha do Node.
- **Tempo é medido em máquina, com margem folgada:** os tetos (100 ms, 500 ms, 1,5 s) são ordens de grandeza abaixo do 1,1 s da forma quadrática antiga em 60 KB, mas um CI muito lento pode exigir revisão do teto.

## Provas (em `saidas/`)

1. `01-typecheck.txt` (código 0). 2. `02-lint.txt` (código 0). 3. `03-lint-teto.txt` (431 supressões, não subiu). 4. `04-formato.txt`. 5. `05-npm-test.txt` (shared 244 de 245, só o EPERM de symlink; campo 238; API 1885 passaram, 2 falhas do semear, 34 pulados; console 357 de 357; web 791; banco com as 8 falhas de ambiente). 6. `06-isolamento.txt` (`test:isolamento`: 431 passaram, 8 falharam, as 8 de ambiente Windows, 6 pulados; os 137 de CA-06 verdes). 7. `07-test-scripts.txt` (`CI=true npm run test:scripts`: 831 casos, 808 passam, 0 falham, 23 pulados). 8. `08-regras-de-conteudo.txt` (9 de 10, o EPERM de symlink). 9. `09-auditar.txt` (código 0). 10. `10-conferir-numeros.txt` (código 0). 11. `11-prova-de-mordida-codigo-antigo.txt`.

## Para o orquestrador

- **Linha do STATUS sugerida:** `V2-F02-E03 (parte 1C) | IMPLEMENTADA (candidato), DV-01 e DV-03 | guardas de códigos de erro da API e do console: retrato dos cabeçalhos lido uma vez e regravado, segunda rede contra CRLF CRLF antes do fim de _header, writeEarlyHints com objeto novo, chavesErro linear; +18 testes na API e +18 no console (API 1887, console 357, total 3957).`
- **Dívidas pagas:** DV-01 (retrato de `getHeaders()` e dos cabeçalhos segurados convertido uma vez, validado e regravado; segunda rede contra `\r\n\r\n` antes do fim de `_header`; `writeEarlyHints` sempre com objeto novo; teste que conta leituras com valores inofensivos, tem de ser uma) e DV-03 (`chavesErro` em passada única, com teste de tempo). Não paga a DV-02 (documentação do modelo de ameaça) nem a DV-36.
- **Na junção:** recalcular os totais do README e de `COLOCAR-DE-PE.md` somando as outras partes (esta parte soma +18 na API, +18 no console, +36 no total, e 5954 com o aplicativo); o esperado do passo `teste-console` em `baseline.mjs` é um número só (357), então outra parte que mexa no console precisa somar sobre ele.
- **Pendências humanas:** nenhuma.
