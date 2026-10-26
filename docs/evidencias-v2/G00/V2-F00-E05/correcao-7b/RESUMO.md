# V2-F00-E05, correção 7b: a guarda recusa CR ou LF nas Early Hints igual em Node 22 e 24

Base: `21fe639`, no ramo `trab/correcao-7`. A guarda nessa base é a da correção 7 (`1731b62`).

Motivo: o ensaio do CI no Linux reprovou um caso da correção 7. Foi o run 39488319365, job "Testes, tipos e scripts", sobre `c3ef03e`, em ubuntu-latest com Node v22.23.3 (`saidas/03`). O caso era o de controles do teste da guarda da API: a rota `/c7/f-early` deu `[500]` quando o esperado era `[500, 404]`. A guarda registrou o desvio "linha de status 403 escrita por fora da guarda". A correção 7 tinha sido testada só em Node 24.15.0.

## Fatos

### A causa (`saidas/02`, `scripts/early-hints-por-versao.cjs`)

A causa NÃO era a guarda. Era o Node: as duas versões tratam diferente o valor com CR ou LF em `writeEarlyHints`.

- **Node 24.15.0:** recusa e lança `ERR_INVALID_CHAR`.
- **Node 22.23.3** (a versão do `.nvmrc`, do CI e do `Dockerfile` de produção): escreve o valor como veio. Por isso `writeEarlyHints({ link, "x-s": "a\r\n\r\nHTTP/1.1 403 ..." })` põe uma cabeça 403 INTEIRA no fio, depois da linha 103.
- Na correção 7, em Node 22, a porta dos bytes pegou essa cabeça forjada. Ela trocou a resposta pela do desvio e fechou a conexão, e é por isso que o pedido seguinte não teve o 404. O resultado em Node 22 é de uma injeção pega, e não de um falso positivo. Sem a guarda, o 403 inventado chegaria ao cliente.
- O comportamento, porém, dependia da versão do Node:
  - em Node 24, 500 `erro_interno`;
  - em Node 22, 500 do desvio em teste e 403 genérico fora de teste, numa rota que nem é de acesso.

Antes desta correção, a sonda da correção 7 em Node 22 (`saidas/00` e `01`) já mostrava zero escapes e zero dessincronias nas 35 variantes, na API e no console. A única diferença era essa: `f-early` saía pela porta dos bytes.

### A dúvida do coordenador: o 103 legítimo antes do 403 do catálogo

Essa dúvida se resolveu com um caso de teste, que passa nas duas versões: `[103, 403, 404]`, sem desvio.

Ao escrever o caso apareceu um defeito do TESTE, e não da guarda. O `reply.writeEarlyHints` do Fastify devolve a própria resposta, que é "thenable" e só resolve quando a resposta termina. Por isso `await rep.writeEarlyHints(...)` trava o pedido, com e sem a guarda: medido num Fastify puro, sai só o 103. As rotas do teste passaram a chamar sem `await`.

### O que mudou

As mudanças valem para `apps/api/src/guarda-de-codigos-de-erro.ts` e para a cópia do console, iguais nas duas.

- A guarda envolve também `writeEarlyHints` da resposta, como propriedade não gravável. Ela aplica a regra do Node 24 nas duas versões:
  - nome que não é token do HTTP, ou valor (inclusive em lista) com caractere de controle, lança `ERR_INVALID_CHAR` antes de qualquer byte sair;
  - a rota cai no tratador de erro e responde 500.
- A porta dos bytes continua como segunda rede, para quem chamar o método do protótipo por fora da instância (o que a varredura proíbe).
- O cabeçalho das duas guardas, o cabeçalho de `packages/shared/src/codigos-de-erro.ts` e o `dc360/README.md` dizem isso. Também dizem que os testes da guarda rodaram em Node 22 e em Node 24.

### Testes acrescentados

**`apps/api/test/guarda-de-codigos-de-erro.test.ts`: de 138 para 140 (+2).**

- O 103 legítimo antes do 403 do catálogo passa intacto, e o pedido seguinte do socket recebe o dele.
- A guarda recusa CR ou LF nas Early Hints em qualquer versão do Node, com `ERR_INVALID_CHAR` e a fila de saída vazia.
- O caso de controles que reprovou no CI ficou como estava, e agora passa nas duas versões.

**`apps/console/test/guarda-de-codigos-de-erro.test.ts`: de 45 para 48 (+3).**

- Early Hints com CR ou LF sai `[500, 404]`.
- O 103 legítimo passa.
- A recusa direta.

### A mordida

Com a guarda da correção 7, isto é, com esta mudança revertida:

| Saída | Node | Pacote | Falham |
| --- | --- | --- | --- |
| `20` | 22.23.3 | API | 2 de 140: a recusa direta, e o caso de controles que reprovou no CI |
| `21` | 22.23.3 | console | 2 de 48: `f-early` com CR ou LF, e a recusa direta |
| `22` | 24.15.0 | API | 1 de 140: a recusa direta |
| `23` | 24.15.0 | console | 1 de 48: a recusa direta |

Sobre a mordida em Node 24: sem `link`, o Node 24 também não confere as outras chaves, e escreve nada.

Os casos do 103 legítimo não mordem em nenhuma das duas versões, e isso é de propósito: são controle.

### Depois

**Suíte da guarda:**

| Saída | Node | Pacote | Resultado |
| --- | --- | --- | --- |
| `10` | 22.23.3 | API | 140 de 140 |
| `11` | 22.23.3 | console | 48 de 48 |
| `12` | 24.15.0 | API | 140 de 140 |
| `13` | 24.15.0 | console | 48 de 48 |

**Sondas da correção 7** (`../correcao-7/scripts`), em Node 22 (`14` e `15`) e em Node 24 (`16` e `17`): 0 escapes e 0 dessincronias, e o processo segue de pé. `f-early` sai 500 `erro_interno` nas duas versões e nos dois modos, e o pedido seguinte recebe o dele.

**Suítes inteiras:**

| Saída | Node | Pacote | Resultado |
| --- | --- | --- | --- |
| `60` | 24 | API (`npm run test:api`) | 1717 passados e 34 pulados (o bloco de Postgres real, por ambiente), código 0 |
| `61` | 24 | console (`npm run test:console`) | 307 de 307, código 0 |
| `62` | 22.23.3 | API (vitest) | 1717 passados e 34 pulados, código 0 |
| `63` | 22.23.3 | console (vitest) | 307 de 307, código 0 |

**Demais conferências:**

- `npm run typecheck`: código 0 (`saidas/64`).
- `tsconfig` temporário com os testes da guarda, na API e no console: código 0 nos dois (`saidas/65`).
- Portão de conteúdo: 10 de 10 (`saidas/66`).
- `node scripts/baseline.test.mjs`: 29 de 29 (`saidas/68`).
- `conferir:numeros`: código 0 (`saidas/67`). Rodou sobre a árvore do COMMIT, extraída do índice do git com `git checkout-index`. A árvore de trabalho tem mudanças de outra etapa, ainda não commitadas, nos mesmos arquivos de totais. Por isso o README, o `COLOCAR-DE-PE.md` e o `baseline.mjs` entraram no índice só com os trechos desta correção.

Contagens atualizadas:

- `baseline.mjs`: entrada `V2-F00-E05-correcao-7b` com `total: 2, falhas: 0, puladas: 0`, e o console de 304 para 307.
- README: API 1717, console 307, `npm test` 3546.
- `COLOCAR-DE-PE.md`: 5543.

## O que não foi provado

- **Node 22 no Linux.** Não rodei no runner: rodei em macOS, com o binário oficial v22.23.3 conferido pelo SHASUMS256. O CI é que confirma em Linux.
- **Proxy da borda.** O proxy de produção diante das Early Hints não foi medido.
- **Postgres real.** O bloco de Postgres real da renovação (34 casos) continua pulado por ambiente.
- **Valor que não é texto.** A regra que a guarda aplica é a do Node 24 para nome e valor, conferida no texto do valor (`String(valor)`). Um valor que não é texto e cujo `toString` muda entre leituras não foi testado.

## Justificativa

A guarda tem de dar o mesmo resultado na versão do Node que roda em produção (22) e na versão em que foi escrita (24). Em Node 22, CR ou LF nas Early Hints é injeção de resposta. Recusar antes de escrever leva as duas versões ao mesmo 500 do tratador de erro, e a porta dos bytes fica como rede para o caminho por baixo.
