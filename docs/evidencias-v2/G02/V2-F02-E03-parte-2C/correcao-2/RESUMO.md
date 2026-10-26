# V2-F02-E03, parte 2C, correção 2: CORS nas respostas do `frameworkErrors` (achado da revisão independente do lote 2)

Feita na junção do lote 3. A evidência da parte 2C e da correção 1 (pasta acima) fica como estava.

## Fatos

1. **O defeito.** Em `apps/api/src/servidor.ts`, as respostas que o próprio Fastify escreve antes de qualquer rota (`frameworkErrors`: 400 `url_invalida` e 414 `parametro_longo_demais`) saíam sem `Access-Control-Allow-Origin`, porque o plugin `@fastify/cors` e os hooks de rota não rodam nessa fase. O painel, numa origem de `ORIGENS_PERMITIDAS`, não conseguia ler o corpo e mostrava "sem conexão" em vez da mensagem do catálogo. Confirmado com `inject` pelo revisor e de novo aqui.
2. **O conserto.** A resposta antecipada aplica a MESMA regra do plugin (`origin: config.origens`): se `Origin` é igual a uma entrada da lista, recebe `Access-Control-Allow-Origin` (a própria origem), `Access-Control-Allow-Credentials: true` e `Access-Control-Expose-Headers: x-request-id`; qualquer outra origem, e o pedido sem origem, fica sem cabeçalho de CORS, como antes. `Vary: Origin` sai sempre, porque a resposta passa a depender da origem. Nada foi afrouxado: nenhuma origem nova, nenhum curinga, e comparação por igualdade exata, a mesma do plugin. O 500 do mesmo tratador (restrição assíncrona) recebe o mesmo tratamento por usar o mesmo objeto de cabeçalhos. Corpo, status, `cache-control`, `x-content-type-options` e `x-request-id` são os de antes.
3. **O teste, escrito antes.** `apps/api/test/cors-dos-erros-do-fastify.test.ts` (novo, 8 casos: 2 situações vezes 4 comportamentos). ANTES do conserto: 2 falham (`expected undefined to be 'http://localhost:4691'`, nos dois casos de origem permitida, `/` e `/v1`) e 6 passam (origem fora da lista, sem origem, demais cabeçalhos): `saidas/20-teste-ANTES-do-conserto.txt`. DEPOIS: 8 de 8, `saidas/21-teste-DEPOIS-do-conserto.txt`. Cobre a URL malformada (`/ocorrencias/%E0%A4%A`) e o parâmetro de 150 caracteres, com e sem `/v1`.
4. **Contagens.** `baseline.mjs` ganhou `V2-F02-E03-parte-2C-correcao-2` (api +8). README (api 2153, total 4518) e `COLOCAR-DE-PE.md` (6536) ajustados; `conferir:numeros` verde.

## Limites declarados

- A DV-51 (408 de timeout de cabeçalho fora do formato) não é desta correção e não foi tocada.
- A prova é por `inject`, não por navegador; o job de ponta a ponta no navegador do CI exercita o caminho com origem permitida em outras rotas.

## Provas (em `saidas/`)

`01-typecheck.txt` (0), `02-lint.txt` (0), `03-lint-teto.txt` (431), `04-formato.txt` (0), `05-npm-test.txt` (campo 280, shared 433 de 434, api 2151 de 2187 com 34 pulados e 2 falhas, console 379, web 824, db 440 de 454 com 8 falhas e 6 pulados), `06-isolamento.txt` (as 8 falhas do ambiente Windows do `db`, ver abaixo), `07-test-scripts.txt` (`CI=true`, 831 casos), `08-conferir-numeros.txt` (0), `09-regras-de-conteudo.txt` (9 de 10), `10-auditar.txt` (0), `11-test-campo.txt` (141 suítes, 2018 testes), `20` e `21` o teste ANTES e DEPOIS.

Falhas de ambiente Windows, todas das aceitas: `regras-de-conteudo` 1 (EPERM em symlink, DV-46), `desfazer-migracao` 5, `guarda-da-semente` 3, `semear-homologacao` 2. Em `07-test-scripts.txt` o único caso reprovado é "todo INDEX.md real bate", porque esta pasta ainda não estava no INDEX da pasta pai quando a saída foi gravada; o INDEX foi completado em seguida, e o caso e `conferir-indices-de-evidencia.mjs` passam depois disso (conferido no commit).

## Para o orquestrador

- Sem dívida nova paga nem aberta aqui. A DV-51 continua com você.
- Pendência humana: nenhuma nova.
