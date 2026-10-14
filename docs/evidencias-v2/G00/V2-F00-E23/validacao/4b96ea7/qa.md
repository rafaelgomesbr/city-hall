---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E23
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [TESTE, API, CONTRATO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito: PASS. O contrato `apps/web/src/dados/http.ts` x rotas registradas existe, usa a árvore do servidor montado (não lista copiada) e morde. Árvore em `24aed19` (difere do candidato só em registro). Saídas em `scratchpad/qa-api/` (subpasta `contrato/`).

| Critério | Resultado | Evidência |
| --- | --- | --- |
| Todas as chamadas atuais de `http.ts` casam com rota registrada; contagem extraída igual à contada | PASS | `contrato-do-painel.test.ts` 12 de 12 (dentro de `15-e11-e12-e23.txt`, 59 de 59) |
| `POST /pacote.zip` sintético reprova; método errado (`GET /saida/pacote.zip`) reprova; parâmetro faltando reprova; extrator que perde uma chamada reprova | PASS | 4 casos sintéticos verdes |
| Âncora: o teste conta `chamar(` e `fetch(` por caminho independente e reprova se extrair menos | PASS | caso "âncora" e caso "extrator que perde uma chamada reprova a âncora" |
| **Teste morde com o defeito real reintroduzido em `http.ts`** | PASS | variante 1 abaixo: vermelho |
| Não concede nem testa acesso; a chamada sem token do painel continua só nas isenções de `superficie` | PASS | caso "o que o painel chama sem token está nas isenções" verde |

## Evidência

- Não mutei `apps/web` (área de outro validador). Para fazer a prova que o brief pede, copiei `http.ts` para `scratchpad/qa-api/contrato/http.original.ts`, derivei 7 variantes, e rodei uma cópia do teste (`apps/api/test/zz-qa-contrato.test.ts`, temporária, hoje em `scratchpad/qa-api/sondas-temporarias/`) em que a constante `HTTP_DO_PAINEL` lê o arquivo da variável de ambiente. O arquivo real `apps/web/src/dados/http.ts` nunca foi alterado e a cópia do teste foi removida da árvore.
- Resultados (`scratchpad/qa-api/contrato/saida.*.txt`):

| Variante do `http.ts` | Resultado |
| --- | --- |
| original | verde, 12 de 12 |
| 1. `"/saida/pacote.zip"` trocado por `"/pacote.zip"` (o defeito da E11) | VERMELHO (1 caso) |
| 2. `POST` removido da chamada do pacote (vira `GET /saida/pacote.zip`) | VERMELHO (1 caso) |
| 3. Chamada nova de `chamar<Blob>(` em várias linhas para `/relatorios/fantasma` | VERMELHO (1 caso) |
| 4. Caminho dentro de uma constante (`chamar(QA_CAMINHO, ...)`) | VERMELHO (3 casos: aparece como "não lida" e fura a âncora) |
| 5. `fetch(\`${BASE}/saida/pacote\`)` com rota que não existe | VERMELHO (1 caso) |
| 6. `${BASE}/pacote.zip` montado fora de `chamar` e de `fetch` (por exemplo para um `href`) | VERDE (limite, ver achado 1) |
| 7. Wrapper com `window.fetch(\`${BASE}${c}\`)` e a chamada com o caminho em argumento | VERMELHO (3 casos) |

- `npm run test:api` completo: 99 arquivos, 1299 de 1299 (`22-test-api-completo.txt`).

## Cenários positivos

- Todas as chamadas atuais de `http.ts` existem na árvore de rotas (servidor montado, `printRoutes`), com `MÉTODO caminho`; a expansão de `${tipo}` cobre cada valor da união `TipoDeDocumento` com a rota correspondente.

## Cenários negativos

- As variantes 1 a 5 e 7 acima, mais os quatro casos sintéticos do próprio arquivo.

## Tentativas de reprovar

1. Reintroduzi `/pacote.zip` (variante 1) e vi vermelho; restaurei (a cópia no scratchpad é a única alterada) e a variante original fica verde.
2. Procurei evasão do extrator: chamada em várias linhas, caminho em constante, `window.fetch`, wrapper novo (variantes 3, 4 e 7): o extrator ou lê, ou marca "não lida" e a âncora reprova.
3. Procurei evasão que o extrator não vê: caminho de API montado fora de `chamar`/`fetch` (variante 6). Passa. Hoje o painel não tem isso: `grep` de `fetch(`, `XMLHttpRequest`, `EventSource`, `sendBeacon` em `apps/web/src` fora de `dados/http.ts` não achou nada; `window.open` e `ancora.href` existem em três páginas (`Auditoria.tsx`, `Ocorrencia.tsx`, `Organizacao.tsx`); não rastreei a origem de cada URL, mas `abrirOficio` e os downloads do pacote e do CSV nascem de `fetch`/`chamar` dentro de `http.ts`, que o teste lê.
4. Procurei o lado do servidor: se `printRoutes` quebrasse o conjunto ficaria vazio ou cheio de lixo; a âncora "a árvore de rotas foi lida" exige mais de 50 rotas, a presença de `POST /saida/pacote.zip` e a ausência de `POST /pacote.zip`.
5. Confirmei que o teste não depende de lista copiada: usa `rotasRegistradas`, a mesma leitura do portão `superficie.test.ts`.

## Achados

**BLOQUEIA:** nenhum.

**CORRIGE ANTES DE CRESCER**

1. O extrator só enxerga `chamar(` e `fetch(`. Se alguém passar a montar `${BASE}/caminho` fora delas (um `href`, `window.open` direto, `new URL`), o defeito do `/pacote.zip` volta sem o teste ver (variante 6). Limite declarado ("versão mínima", README) e hoje sem ocorrência no painel. Dono: F02-E05, que generaliza o contrato (OpenAPI e cliente gerado).

**ANOTADO**

2. Contrato do app de campo e do console fica fora (F02-E05).

## Não verificado

- Corpo e resposta das chamadas (fora do escopo da etapa).
- Contrato do app de campo e do console.
- Mutação direta em `apps/web/src/dados/http.ts`: não fiz por restrição de paralelismo; a prova foi feita sobre uma cópia, com o mesmo código do teste (apenas a constante de caminho trocada por variável de ambiente).
- Firefox e WebKit (teste estático; não se aplica).

## Risco residual

- Falso verde para URL de API montada fora de `chamar` e `fetch`, enquanto a F02-E05 não generaliza.

## Motivo do humano

Nenhum. A demonstração que o Rafael faria (ver o teste reprovar com `/pacote.zip`) foi feita por execução (variante 1).
