# V2-F00-E01: Baseline atual reproduzível em máquina limpa

Situação: IMPLEMENTADA E MEDIDA em 2026-10-05; FALTA A VALIDAÇÃO HUMANA (ver o fim). Por isso a etapa não está marcada como concluída.

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
