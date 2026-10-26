# V2-F01-E05, correção 1: regras do registro fixadas e bloqueantes, impressão do trecho inteiro, análise sem arquivo reprova

Achados: codex-f01-A itens 1 (BLOQUEIA), 5 e 6 (DÍVIDA). O item 2 do mesmo pedido (E01) e os itens 7, 8 e C5 estão
nas pastas `correcao-1/` de E01, E03, E08 e E21.

## Fatos

### Item 1: regras do registro sem versão e sem poder reprovar

- Confirmado em `.github/workflows/sast.yml`: o passo "Relatório dos pacotes do registro" baixava `p/typescript`,
  `p/nodejs`, `p/react` e `p/jwt` a cada execução (pacotes móveis do registro, sem versão), com `continue-on-error`
  e `|| true`. Só as quatro regras próprias participavam do portão: um ERROR novo do registro deixava o check
  verde. A E05 pede "regras do registro fixadas" e "ERROR novo reprova".
- O RESUMO original da E05 (`../RESUMO.md`) já registrava a razão da escolha anterior: o repositório é público e as
  regras do registro são da Semgrep Rules License v1.0 (uso interno, sem redistribuição), então uma CÓPIA fixada
  no repositório foi removida. Por isso o conserto NÃO copia regras.
- Conserto: as regras do registro passam a vir de um COMMIT EXATO do repositório `semgrep/semgrep-rules`
  (`SEMGREP_RULES_SHA: 16b9e6d45f10649f6a531ec4838ed9924372c3bc`, `develop` de 2026-10-21, lido pela API do GitHub),
  baixado no runner por `git fetch --depth 1` desse SHA e conferido por `git rev-parse HEAD` (o passo falha se o
  commit baixado não for esse). É uso, não redistribuição: nada das regras entra no repositório. Em vez dos quatro
  pacotes móveis, rodam as pastas `typescript/lang`, `typescript/react`, `javascript/{lang,express,node-crypto,
  audit,jsonwebtoken,jose,jwt-simple,passport-jwt,react}` desse commit (`SEMGREP_RULES_PASTAS`). Conferi na API
  que as 11 pastas existem naquele commit.
- O passo da varredura e o passo da decisão deixam de ter `continue-on-error` e `|| true`. A decisão usa o MESMO
  `sast-baseline.mjs conferir`, agora com `--baseline .semgrep/baseline-registro.json`, o mesmo mecanismo de
  linha de base das regras próprias: só ERROR novo reprova, o antigo precisa estar triado com classe, motivo,
  dono e prazo.
- `.semgrep/baseline-registro.json` nasce com a única entrada que o relatório do registro da E05 mostrou
  (`../saidas/18-relatorio-do-registro.txt`: 1 achado, `gcm-no-tag-length` em `dc360/apps/api/src/auth/cofre.ts`).
  Li o código: a linha anterior à decifragem devolve `null` se o selo não tiver `BYTES_SELO` (16) bytes, e só então
  vêm `setAuthTag` e `final()`; é falso positivo. O id foi calculado pela própria função de impressão.
- Testes (`excecoes-de-seguranca.test.mjs`): a função pura `problemasDoRegistroNoWorkflow` exige commit de 40
  hexadecimais, `git rev-parse` conferindo, ausência de `--config p/...`, de `continue-on-error`, de `|| true` e de
  passo desligado, e o passo que compara `04-registro.json` com `baseline-registro.json`. O caso negativo estraga
  o workflow real de seis jeitos e o workflow ANTIGO (relatório que nunca reprova) reprova nela. Outro caso exige
  que a baseline do registro obedeça à política de exceção e diga de qual commit e de qual Semgrep ela vale.

### Item 5: a impressão do achado usava só a primeira linha

- Confirmado em `dc360/scripts/sast-baseline.mjs`: o hash era regra + arquivo + primeira linha do trecho. Sonda
  (`saidas/03`), em memória, sobre `rotas/busca.ts:163` (consulta de 13 linhas já triada): o texto da linha 164
  recebe `AND x.nome = '${entradaExterna}'`. ANTES: o id é o mesmo e a comparação devolve 0 achados novos. DEPOIS:
  o id muda e a comparação devolve 1 achado novo.
- Conserto: a impressão passa a ser regra + arquivo + o TRECHO INTEIRO (linhas de `start.line` a `end.line` do JSON
  do Semgrep, cada uma sem indentação e sem espaços repetidos) + ordem entre iguais. O número de linha continua
  fora: inserir código acima não reabre o achado.
- Migração: os 33 ids de `.semgrep/baseline.json` mudaram (os 4 de consulta de uma linha só ficaram iguais). Foram
  recalculados por um script descartável (`saidas/05`) que antes confere que o id ANTIGO recalculado bate com o
  gravado (prova que arquivo e linha de cada entrada ainda apontam para o achado triado) e acha o fim de cada
  literal de template por contagem de crases e de `${ }`. A baseline ganhou o campo `impressao` com a regra nova.
  Nenhum motivo, classe, dono ou prazo foi tocado.

### Item 6: análise que não examinou arquivo nenhum aprovava

- Confirmado: com `{"results":[],"errors":[],"paths":{"scanned":[]}}` o script antigo saiu 0 com "Aprovado"
  (`saidas/04`, ANTES). Conserto: `problemasDeCobertura` reprova (código 2) quando `paths.scanned` está ausente,
  vazio ou abaixo do piso declarado (`PISO_DE_ARQUIVOS_ANALISADOS = 30` no total e
  `PISO_NA_PASTA_DAS_REGRAS_PROPRIAS = 30` em `dc360/apps/api/src/`; a varredura das regras próprias examinou 72
  arquivos em 2026-10-24). Vale para a baseline das regras próprias e para a do registro.
- Os testes que passavam `{results:[], errors:[]}` ganharam `paths` por padrão; 6 casos novos em
  `sast-baseline.test.mjs` (14 para 20): impressão do trecho inteiro, trecho sem posição final, cobertura (regra
  pura), análise vazia/ausente/abaixo do piso (linha de comando), `--baseline` com outro arquivo, `--baseline`
  inválido.

### Contagens e números

`baseline.mjs`: `V2-F01-E05` 48 para 51, `V2-F01-E05-baseline` 14 para 20. `npm run conferir:numeros` verde.

## Justificativa

- Commit do `semgrep-rules` em vez de pacote `p/`: é o único jeito de ter versão fixa sem copiar regra com licença
  que proíbe redistribuir. Os pacotes `p/` são curadorias do servidor e não têm versão.
- As pastas escolhidas aproximam os quatro pacotes (TypeScript, Node, React, JWT); não são idênticas a eles.
- Piso 30: bem abaixo do real (72), alto o bastante para pegar exclusão excessiva ou seleção vazia; sobe com o
  produto.

## O que não pude provar aqui (limitações)

- **Não há Semgrep nem Docker neste ambiente (Windows).** O workflow novo NÃO foi executado: foi validado em
  sintaxe (YAML lido por parser, conferidor de workflows do repositório) e por teste de arquivo. O formato
  `paths.scanned` do JSON do Semgrep 1.136.0 está implementado pelo que o Semgrep documenta e não foi conferido
  contra uma saída real desta versão.
- **A primeira execução do SAST no CI é a prova.** As pastas do `semgrep-rules` podem apontar um ERROR a mais do que
  os pacotes antigos apontavam; se acontecer, o passo "Achado novo do registro" lista o achado, e a triagem entra
  em `.semgrep/baseline-registro.json` (`node dc360/scripts/sast-baseline.mjs propor --baseline ... saida.json`
  imprime o candidato).
- O id da entrada do registro foi calculado supondo que o achado começa e termina na linha 107 de `cofre.ts`
  (a chamada de uma linha); se o Semgrep disser outra coisa, a baseline do registro precisa de uma linha refeita.
- A triagem das duas baselines continua sem leitura humana (`triagem_lida_por_humano: false`): é pendência do Rafael.
