---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E23
sha_validado: fd17ff4
ci_run: 39420436042
rodada: 7
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

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/20850765-8640-418e-ace7-9257aa515baf/scratchpad/val-qa/` (`SAIDAS/`). O diff `1ed0b71..fd17ff4` não toca `apps/web/src/dados/http.ts` nem `contrato-do-painel.test.ts`; toca `servidor.ts` (construtor de `RegraDeNegocio`) e a guarda de códigos de erro, que montam o mesmo servidor de que o teste lê as rotas.

| Critério | Resultado | Prova |
| --- | --- | --- |
| Teste verde na árvore atual | PASS | `contrato-do-painel.test.ts` 12 de 12, código 0 (`SAIDAS/e23-00-verde.txt`); dentro da API inteira (1685 mais 34 pulados; 1719 com Postgres real) |
| Âncora ativa: extraído igual ao contado | PASS | caso "âncora: a extração alcança todas as chamadas contadas" e "extrator que perde uma chamada reprova a âncora" verdes |
| `POST /pacote.zip`, método errado e parâmetro faltando reprovam | PASS | os casos sintéticos do arquivo, verdes (reprovam o que devem) |
| Negativo novo, lado da API: rota que o painel chama deixa de existir | PASS | `app.post("/iniciar"` virou `app.post("/comecar"` em `apps/api/src/rotas/segundo-fator.ts`: código 1, "POST /segundo-fator/iniciar (http.ts linha 434)" (`SAIDAS/e23-01-rota-renomeada-na-api.txt`); `git restore` |
| Negativo novo, lado da API: mesmo caminho, método trocado | PASS | `app.post` virou `app.put` na mesma rota: código 1, mesma chamada nomeada (`SAIDAS/e23-02-metodo-trocado-na-api.txt`); `git restore`, verde 12 de 12 (`SAIDAS/e23-03-verde-depois.txt`) |
| Rota chamada sem token só nas isenções de `superficie.test.ts` | PASS | caso verde; `superficie.test.ts` 9 de 9 junto com a vigência (`SAIDAS/e04-01-verde-antes.txt`) |
| Regressão: `test:api` e `test --workspace @dc360/web` | PASS | API sem falha (`bl2/01-teste-api.txt`), painel 699 de 699 (`bl2/03-teste-web.txt`) |

## Evidência

- `npx vitest run --root apps/api test/contrato-do-painel.test.ts`: verde 0, mutantes 1 e 1, verde 0 depois de restaurar.
- `git status --porcelain` vazio depois das mutações.
- CI run 39420436042: 9 de 9 `success`.

## Cenários positivos

- Toda chamada de `http.ts` casa com rota e método registrados no servidor do SHA.

## Cenários negativos

- Os sintéticos do arquivo (pacote, método, parâmetro, extrator cego) e as duas mutações do lado da API reprovam com a chamada e a linha.

## Tentativas de reprovar

1. As rodadas anteriores mutaram o lado do painel. Mutei o lado da API (rota renomeada e método trocado numa rota que o painel usa): o teste pega os dois, então ele lê as rotas do servidor de verdade e não uma lista copiada.
2. Conferi que as mudanças do diff no servidor (construtor de `RegraDeNegocio`, guarda) não mudam a árvore de rotas lida: o caso "a árvore de rotas foi lida e traz o prefixo da saída" segue verde.

## Achados

1. **Anotado.** O contrato confere existência de rota e método, como a etapa delimita; corpo e resposta ficam para a F02.
2. Nenhum que bloqueie.

## Não verificado

- Logs dos jobs do CI (exigem token).
- A validação humana pedida (Rafael ver o teste reprovar numa cópia de trabalho) foi substituída pelas mutações acima, como nas rodadas anteriores.

## Risco residual

O extrator lê o fonte por regras próprias; uma forma nova de chamar a API que ele não reconheça depende da âncora de contagem para aparecer.

## Motivo do humano

Não se aplica: a reprovação com o defeito reintroduzido foi reproduzida por mutação, com o comando registrado.
