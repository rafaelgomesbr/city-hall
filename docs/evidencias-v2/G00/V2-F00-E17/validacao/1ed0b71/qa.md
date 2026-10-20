---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E17
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [LGPD, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Saídas brutas: `<V>` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/qa/`. Árvore principal em `5044e7a` (produto igual ao de `1ed0b71`), macOS arm64, Node 24.15 (o `.nvmrc` pede 22; nada divergiu por isso).

| Critério | Resultado | Prova |
| --- | --- | --- |
| `npm run test:scripts` com 0 falhas | PASS: 288 testes, 288 passaram, 0 falhas, 0 pulados, código 0. Os 4 de entitlements do iOS rodaram e passaram porque `apps/campo/ios/` existe nesta máquina (sem a pasta seriam pulados por ambiente) | `<V>/E17-test-scripts.txt` |
| `npm run conferir:numeros` sem divergência | PASS: 25 afirmações conferidas, "Todos os números da documentação batem com a realidade", código 0; declara os pulos que a lista estática não enumera (0 incondicionais T42; 4 pontos por ambiente: 1 em `renovacao-contra-encerramento.test.ts`, 3 em `busca.test.ts`) | `<V>/E17-conferir-numeros.txt` |
| Caso 22: recusa repositório, nuvem (iCloud, Dropbox, Google Drive, OneDrive) e Área de Trabalho; aceita fora disso | PASS e morde (mutações M1 e M2) | `<V>/E17-mutacoes.txt` |
| Caso 37: reprova `mode` escrito à mão; `PERFIL_DE_PRODUCAO` nasce de `EAS_BUILD_PROFILE === "producao"` e alimenta `mode` e `extra.pushAmbiente` | PASS e morde (mutações M3 e M4) | `<V>/E17-mutacoes.txt`; `apps/campo/app.config.ts:158,597,642` |
| Caso 19: invocação portátil do `npm` | PASS no macOS (o `comando-de-migracao.test.mjs` passa); o lado Windows não verificável | `<V>/E17-mutacoes.txt` (controle, 22 de 22 nos três arquivos) |
| `conferir:numeros` reprova número alterado num rascunho | PASS com ressalva: `README.md:1517` com 1589 reprova (código 1); as formas elididas da rodada 4 ("258 contra a API", "17 de integração contra a API") agora reprovam; mas trocar por um número de OUTRA grandeza do mesmo grupo passa (achado 1) | `<V>/E17-neg-numero-alterado.txt`, `<V>/E17-neg-ambiguo.txt` |
| Regressão `npm test` | PASS: código 0; campo 238, shared 223, API 1590 e 34 pulados por ambiente, console 274, painel 688, banco 345 e 3 pulados | `<V>/npm-test.txt` |
| Portabilidade em duas plataformas | Não verificado aqui: só macOS (CI ausente) | |

## Evidência

- `npm run test:scripts`: código 0.
- `npm run conferir:numeros`: código 0.
- Mutações (cada uma desfeita com `git restore` logo em seguida; `git status` limpo no fim): `<V>/E17-mutacoes.txt`.
- Rascunhos de número (README alterado e restaurado com `git restore`): `<V>/E17-neg-numero-alterado.txt`, `<V>/E17-neg-ambiguo.txt`.
- `npm test`: código 0, 167 s.

## Cenários positivos

`test:scripts` 288 de 288; `conferir:numeros` 25 de 25; controle dos três arquivos de teste da etapa 22 de 22.

## Cenários negativos

- M1, tirar `"Dropbox"` da lista de nuvem em `scripts/copiar-producao.mjs:116`: o caso "a pasta de copias recusa o repositorio, a nuvem de arquivos e a Area de Trabalho" reprova.
- M2, apontar a Área de Trabalho para outra pasta (`:121`): o mesmo caso reprova.
- M3, `mode: "production"` escrito à mão em `app.config.ts:597`: 2 casos reprovam ("a escolha do ambiente continua morando no app.config.ts" e "reprova o mode escrito à mão num rascunho").
- M4, `PERFIL_DE_PRODUCAO = true` sem o perfil (`:158`): os mesmos 2 reprovam.
- Número alterado (1590 para 1589) em `README.md:1517`: código 1, "valor real é 1590 ou 258, e não 1589".
- Formas elididas: "257 contra a API" (`README.md:13`), "São 257 verificações" (`:1678`), "1996 testes" (`:1519`), "16 de integração contra a API" (`:15`): código 1 em todos.

## Tentativas de reprovar

1. Troquei números por valores que existem mas medem outra coisa:
   - `README.md:1517` "1590 testes da API" para "258 testes da API": código 0, passa.
   - `README.md:1519` "1997 testes do aplicativo de campo" para "5355 testes do aplicativo de campo": código 0, passa.
   - `README.md:1515` "3358 testes em seis pacotes" para "5355": código 1 (aqui o portão distingue).
2. Mutações dos três testes consertados pela etapa (acima): todas mordem.
3. Rodei `test:scripts` numa máquina com `apps/campo/ios/` (o oposto do ambiente da etapa): passa, sem pulo.

## Achados

1. **Corrige antes de crescer** (o mesmo da rodada 4, não consertado). `scripts/conferir-numeros.mjs` aceita uma afirmação quando o número bate com QUALQUER grandeza do grupo que a frase menciona: "258 testes da API" e "5355 testes do aplicativo de campo" passam com código 0, embora os valores certos sejam 1590 e 1997. Um número trocado por outro do mesmo grupo apodrece em silêncio, que é o que o objetivo da etapa quer impedir. Reprodução: `<V>/E17-neg-ambiguo.txt`. Não reprova a etapa porque a DoD ("0 divergências") e o negativo pedido ("reprova um número alterado de propósito") seguem válidos para a alteração comum.
2. **Anotado.** O critério "os 4 pulados seguem por ambiente (sem pasta `ios/`)" não pôde ser observado aqui, porque esta máquina tem `apps/campo/ios/`; com a pasta, os 4 rodam e passam.

## Não verificado

- Windows e Linux (`test:scripts` e `conferir:numeros`): sem as plataformas e com CI ausente (H32). O caso 19 (`shell: process.platform === "win32"`) e o caso 22 com `C:\` só se provam no Windows.
- Os 4 pulos por ambiente sem `ios/` (achado 2).
- Validação humana: Rafael rodar os dois comandos na máquina dele.

## Risco residual

O portão de números ainda deixa passar a troca entre grandezas do mesmo grupo (achado 1). A portabilidade Windows e Linux dos três testes continua sem prova nesta rodada.

## Motivo do humano

A etapa pede que Rafael rode `npm run test:scripts` e `npm run conferir:numeros` na máquina dele (Windows), a plataforma onde os três casos falhavam e que esta máquina não reproduz.
