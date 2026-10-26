# V2-F00-E01: Baseline atual reproduzível em máquina limpa

Situação: IMPLEMENTADA E MEDIDA em 2026-10-05; REPROVADA na validação de 2026-10-13 (SHA `7005a60`); CORREÇÃO 1 feita em 2026-10-13 (ver a seção "Correção 1" no fim e `correcao-1/RESUMO.md`).

**Como ler este arquivo.** Tudo entre o início e a seção "Correção 1" é o RESUMO ORIGINAL de 2026-10-05, preservado como histórico: descreve a linha VERMELHA de 2026-09-30 (17 de 17 conferiam com o esperado de então). O roteiro de hoje espera a árvore VERDE e sai com código 1 apenas pela divergência explicada do `expo-doctor` (V-DEP-4). O que vale hoje está na seção "Correção 1".

## O que foi entregue

- `dc360/scripts/baseline.mjs`: o roteiro. Roda os 19 passos da linha de base na ordem, arquiva a saída de cada um, redige segredo antes de gravar e compara o resultado com o esperado de 2026-09-30. `--so-listar` lista os comandos sem executar nada.
- `dc360/scripts/baseline.test.mjs`: 16 testes do roteiro (redação de JWT, Bearer, Basic, URL com senha, pasta pessoal e travessão; leitura das contagens do vitest, do node --test e do jest; comparação que não aceita ausência de contagem como "confere"; opções; E2E com servidor; `--so-listar` sem criar pasta).
- `dc360/.nvmrc` com `22`.
- `dc360/README.md`: seção "Como testar" (Node 22, ordem dos comandos, o que o CI não roda).
- `dc360/docs/COLOCAR-DE-PE.md`: Parte 8, versões de Node, PGlite, Postgres do CI e Postgres de produção.
- Esta pasta: `AMBIENTE.md`, `COMO-REPRODUZIR.md`, `saidas/` (a saída redigida de cada passo, `resultados.json`, `RESUMO.md` gerado e `INDEX.md`) e o `INDEX.md` com SHA-256.

## Resultado da medição

Dos 17 passos executados (os dois `npm ci` ficaram de fora, ver abaixo), 17 conferem com o esperado de 2026-09-30 e 0 divergem. Os números reproduzidos:

| Passo | Medido hoje | REL:01 3.4 |
| --- | --- | --- |
| typecheck | passa | passa |
| db (inclui o isolamento) | 318 testes, 315 ok, 3 pulados, verde | 318, verde |
| packages/shared | 149 testes, 1 falha (o travessão) | 149, 1 falha |
| packages/campo | 159, verde | 159, verde |
| apps/console | 259, verde | 259, verde |
| apps/web | 550, 14 falhas | 550, 14 falhas |
| apps/api | 1109: 1089 ok, 2 falhas, 18 pulados | idem |
| jest do aplicativo de campo | 1801, 20 falhas | 1801, 20 falhas |
| `test:campo` | falha no typecheck do aplicativo | idem |
| `test:scripts` | 181 testes, 3 falhas, 4 pulados | 165 sem o teste desta etapa (mais 16 = 181) |
| `conferir:numeros` | 13 afirmações não batem | 13 |
| `auditar` | falha (em Windows) | quebra por `spawnSync npm ENOENT` |
| `npm audit` raiz e campo, `expo-doctor` | vermelhos | vermelhos |
| E2E do painel local (com o painel servido) | falha esperando `.indicador` | idem |
| E2E contra a API | falha em `fluxo-api.e2e.mjs:350`, 40 verificações ok antes | idem |

O teste `db/test/isolamento.test.ts` (CA-06) roda dentro do passo db e está verde: o ponto de partida do isolamento está intacto.

## Duas descobertas durante a execução (e o que foi feito)

1. A saída bruta dos testes traz o travessão dentro das mensagens de falha, e o teste de conteúdo do repositório varre `docs/` inteiro. Arquivar a saída sem tratar fazia a PRÓPRIA evidência reprovar o portão (apareceu como segunda falha em `packages/shared`). O roteiro agora troca o travessão por `[travessao]` antes de gravar, com teste. É o mesmo problema que `docs/auditoria-v2/raw` tem desde 2026-09-30 (etapa V2-F00-E20).
2. O E2E do painel local navega em `http://localhost:4173` e precisa do painel servido, como o CI faz. Sem ele a falha era só "conexão recusada", que não é o vermelho medido. O passo agora constrói o painel, sobe o `vite preview`, espera responder e derruba o servidor no fim.

## Conferências feitas

- Zero segredo, zero nome de usuário e zero travessão na pasta `saidas/` (varredura por JWT, Bearer, URL com senha, nome de usuário e U+2014).
- `regras-de-conteudo.test.ts`: 1 falha, a pré-existente (travessão em `trilha-detalhe.test.ts:181`, `AUDITORIA-2026-09-30.md:313` e `docs/auditoria-v2/raw/teste-shared.txt`). Nenhum arquivo desta etapa aparece nas falhas.
- Nenhum arquivo de produto foi alterado: só `scripts/baseline.mjs`, `scripts/baseline.test.mjs`, `.nvmrc`, `README.md`, `docs/COLOCAR-DE-PE.md` e a pasta de evidência.

## Limitações (ditas abertamente)

- NÃO é máquina limpa: o `npm ci` das duas árvores não rodou (`--sem-instalar`), para não apagar o `node_modules` da máquina de trabalho. A reprodução do zero é a validação humana abaixo.
- NÃO inclui o resultado do CI no GitHub (repositório privado, `gh` sem login).
- Uma só máquina (Windows 11). Linux e macOS não foram medidos.
- O comparador confere o código de saída, as contagens que a ferramenta imprime e um trecho da saída; para `npm audit`, `expo-doctor` e `auditar` só confere que continuam vermelhos, não o conteúdo exato.

## O que falta para fechar a etapa (validação humana)

1. Uma segunda pessoa, ou o Rafael noutra máquina, segue `COMO-REPRODUZIR.md` do zero (com `npm ci`) e anexa o `RESUMO.md` dela, com a explicação de qualquer divergência.
2. O Rafael anexa o último run do workflow Verificar no GitHub.
3. Depois disso o item "baseline reproduzível" do G00 pode ser marcado e o commit `V2-F00-E01: baseline reproduzível` pode ser feito (com a aprovação dele).

## Correção 1 (2026-10-13): o estado de hoje

Reprovada em 7005a60 porque o roteiro esperava números velhos (206 casos em `test:scripts` contra 213; `auditar` e `expo-doctor` esperando uma falha que já não acontecia), saía com código 1 numa árvore verde, e a promessa "número esquecido reprova" era falsa. O detalhe, com Fatos e Justificativa, está em `correcao-1/RESUMO.md`. O resultado, em poucas linhas:

- **O esperado é o de hoje.** `dc360/scripts/baseline.mjs` espera o que a árvore verde produz. O roteiro rodado inteiro (17 dos 19 passos; o `npm ci` não roda nesta máquina) deu **16 que conferem, 0 divergentes sem explicação e 1 divergente explicada**, código de saída **1**: o `expo-doctor` dá 20 de 21 por deriva externa do Expo (seis pacotes um patch atrás do que o SDK 57 exige), nomeada como **V-DEP-4** no roteiro e descrita no item 17 de `dc360/apps/campo/PENDENCIAS.md`. Saída em `correcao-1/saidas/`.
- **Números de hoje** (tabela substitui a de 2026-10-05, que fica acima como histórico): typecheck 0; shared 168; db 327 e 3 pulados por ambiente; `packages/campo` 223; API 1299; console 259; painel 649; jest do aplicativo 1903; `test:campo` 0; `test:scripts` 240 (4 pulados por ambiente); `conferir:numeros` 0; `auditar` 0; os dois `npm audit` crus vermelhos por desenho (política do CP-03); E2E do painel "Passou: 70   Falhou: 0"; E2E da API "Passou: 279   Falhou: 0" e "Passou: 50   Falhou: 0".
- **Número velho reprova.** `npm run conferir:numeros` passou a ler as tabelas do roteiro e a compará-las com os casos que a árvore tem (`vitest list`, leitura do aplicativo e o `node --test` de `scripts/`). Prova: com número velho plantado ele sai 1 com a diferença e o nome da tabela a atualizar; com o roteiro certo, 0 (`correcao-1/saidas-de-regressao/03` e `04`).
- **Código de saída do roteiro:** 0 tudo confere, 1 só divergência explicada, 3 divergência sem explicação, 2 roteiro quebrado. O CI trata 0 como verde, 1 como aviso e 3 como falha.
- **Documentos atualizados:** `COMO-REPRODUZIR.md` (reescrito, com o histórico preservado no fim), `dc360/README.md` (seção do roteiro) e este arquivo.

O que continua verdadeiro da entrega original: o filtro de redação, o servidor do E2E, o `--so-listar` e as limitações de que a medição foi numa máquina só e de que a validação humana da etapa foi substituída pela emenda D-30 do G00 (CI Linux mais leitura a frio). O que deixou de ser verdadeiro: "17 de 17 conferem com o esperado de 2026-09-30" e a tabela de medição acima descrevem o roteiro ANTIGO.
