---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E23
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: []
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Pasta das saídas (fora do repositório): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/743e49ef-b0cc-448c-8891-518b9ad66083/scratchpad/validadores/qa/` (abaixo, `SAIDAS/`). Mac arm64, Node v24.15.0. Árvore em `5044e7a` (produto igual a `1ed0b71`). `contrato-do-painel.test.ts`, `superficie-registrada.ts` e `apps/web/src/dados/http.ts` não mudaram desde `bb0f654`.

| Critério | Resultado | Prova |
| --- | --- | --- |
| Teste monta o servidor, lê as rotas por `printRoutes` e confere cada chamada de `http.ts` | PASS | 12 de 12 verdes junto com `superficie.test.ts` 9 de 9 (`SAIDAS/e23-verde.txt`) |
| Positivo: todas as chamadas atuais casam; extraído igual ao contado | PASS | casos "cada chamada de dados/http.ts casa" e "âncora: a extração alcança todas as chamadas contadas" verdes |
| Negativo: `POST /pacote.zip` reprova | PASS | plantado no `http.ts` real (linha 1106): código 1, mensagem `"POST /pacote.zip (http.ts linha 1106)"` (`SAIDAS/e23-pacote-zip.txt`) |
| Negativo: método errado reprova | PASS | `GET /saida/pacote.zip` plantado: código 1 (`SAIDAS/e23-metodo-errado.txt`) |
| Negativo: caminho com parâmetro faltando reprova | PASS | `/ocorrencias/${id}/triagem` trocado por `/ocorrencias/triagem`: código 1 (`SAIDAS/e23-parametro-faltando.txt`) |
| Negativo: extrator que perde uma chamada reprova | PASS | caminho movido para uma variável: o caso de casamento e a âncora reprovam (`SAIDAS/e23-caminho-em-variavel.txt`) |
| Autorização: o que o painel chama sem token só nas isenções de `superficie.test.ts` | PASS | caso "o que o painel chama sem token está nas isenções" verde; `superficie.test.ts` "nenhuma rota nova responde sem autenticação" verde |
| Regressão: `npm run test:api` e painel | PASS | API 1590 passam e 34 pulados por ambiente, 0 falhas; painel 688 de 688 (`SAIDAS/bl2/`) |
| Documentação: README "Como testar" | PASS | parágrafo "Contrato mínimo painel x API (V2-F00-E23)" coerente com o teste, dizendo que é a versão mínima e que a F02-E05 a generaliza |
| Evidência e `INDEX.md` | PASS | 23 de 23 linhas batem byte a byte; nenhum arquivo rastreado fora do índice; `conferir-evidencia.mjs` sem falha |

## Evidência

- `npx vitest run test/contrato-do-painel.test.ts test/superficie.test.ts --reporter=verbose` (em `apps/api`): código 0, 21 de 21 (`SAIDAS/e23-verde.txt`).
- Cinco plantios no `apps/web/src/dados/http.ts` real, um por vez, com `sed`, cada um seguido de `git restore`: os cinco saem com código 1. SHA-256 do arquivo antes e depois iguais (`SAIDAS/e23-sha-antes.txt` comparado no fim); `git status` limpo.
- Roteiro `--so=teste-api,teste-web`: conferem (`SAIDAS/bl2`).

## Cenários positivos

- A árvore real casa todas as chamadas do painel com rotas registradas, e a expansão dos cinco tipos de documento acha rota para cada um.
- A lista de exceções está vazia e o caso de entrada morta passa.

## Cenários negativos

- `POST /pacote.zip`, `GET /saida/pacote.zip`, parâmetro faltando, caminho escondido em variável e método `DELETE` numa chamada quebrada em várias linhas (`SAIDAS/e23-metodo-em-outra-linha.txt`): todos reprovam no arquivo real.

## Tentativas de reprovar

1. Reintroduzi o defeito original da E11 no arquivo de verdade, não só no caso sintético: reprova com a linha.
2. Troquei o método numa chamada formatada em várias linhas, para ver se o extrator lia o `metodo` só na primeira linha: reprova (o extrator leu o `DELETE`).
3. Escondi o caminho numa variável para cegar o extrator: a âncora de contagem pega.
4. Conferi que o teste não concede acesso: só lê rotas e isenções; a lista `SEM_TOKEN` é a mesma de `superficie.test.ts` (arquivo de apoio compartilhado).

## Achados

1. **Anotado.** O contrato confere só existência de rota e método, como a etapa delimita; corpo, resposta, aplicativo de campo e console ficam para a F02. Nenhum defeito achado no escopo.

## Não verificado

- A validação humana pedida (Rafael ver o teste reprovar numa cópia de trabalho) foi substituída pelos plantios acima, como nas rodadas 3 e 4.
- CI ausente (H32); rodei só no Mac.

## Risco residual

Baixo. Uma forma nova de chamada que a expressão de contagem também não veja (por exemplo, `chamar` renomeado por apelido) poderia escapar da âncora; nenhuma existe hoje no arquivo.

## Motivo do humano

não se aplica
