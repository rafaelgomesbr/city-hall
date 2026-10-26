# V2-F02-E07, correção 1: o 23505 da autorização de envio vira 409, e o teste do município B de verdade

## Fatos

Revisão independente (Codex) da parte 2E, dois achados, corrigidos no mesmo ramo sem reescrever a evidência arquivada
da pasta pai.

**1. `POST /evidencias/autorizar-envio` devolvia 500 na corrida da chave.** Dois pedidos concorrentes do mesmo autor e
município, mesma `idempotencyKey`, ocorrências diferentes: os dois passam pela consulta por chave sem achar nada, e o
segundo INSERT cai no índice único (23505), que a rota não tratava (`erro_interno`). Conserto em
`apps/api/src/rotas/evidencias.ts`: a transação virou `autorizarNaTransacao`; se ela falha com 23505 de um dos dois
índices de idempotência da evidência (`evidencias_idempotencia`, da 004, e `evidencias_idempotencia_por_ocorrencia`, da
052, reconhecidos pelo NOME da constraint; qualquer outro 23505 sobe) e o pedido traz chave, a rota repete a transação
UMA vez no município do token. A repetição acha a linha do vencedor e responde como sempre: mesma ocorrência, a mesma
evidência (201); outra ocorrência, 409 `chave_ja_usada_em_outro_registro`; outro autor, `autor_divergente`.

**Teste escrito antes do conserto:** `antes-do-conserto.txt` é a saída com o código antigo de `evidencias.ts`: os 2 casos
novos da corrida da foto reprovam com 500 `erro_interno` (esperado 409 e 201), os outros 17 passam. A corrida é simulada
como na do chamado: um `Proxy` na `Consulta` faz a primeira leitura por `idempotency_key` voltar vazia; o INSERT e o
índice são os do Postgres.

**2. O teste do município B nunca usava a chave em B antes do pedido cruzado.** Em `chave-de-criacao.test.ts`, o caso
"a ocorrência de outro município continua 404, mesmo com chave já usada lá" virou dois:

- chave USADA em B (agente de B, ocorrência de B, 201) e depois a MESMA chave em A (agente de A, ocorrência de A): 201, sem
  `erro`, evidência e chave de armazenamento diferentes, nada de B (organização, ocorrência) na resposta, e a base com uma
  linha por município;
- chave já usada em B e o agente de A apontando para a ocorrência de B: 404, e continua uma linha só.

**Contagem:** `chave-de-criacao.test.ts` passa de 16 a 19 casos (+3 líquidos). `baseline.mjs` ganha
`V2-F02-E07-correcao-1: { total: 3 }` na tabela da API; README e `COLOCAR-DE-PE` passam a 1964 (API), 4237 e 6234.

**Portões desta correção:** `typecheck.txt` (typecheck, lint, `lint:teto` 431, `formato:conferir`, verdes);
`npm-test-api.txt` (API: 1962 verdes e 2 de ambiente Windows, `semear-homologacao`, de 1998 com 34 puladas);
`isolamento.txt` (`isolamento.test.ts` 137 verdes; db 440 verdes e 8 de ambiente, `desfazer-migracao` 5 e
`guarda-da-semente` 3, iguais aos da evidência pai); `regras-de-conteudo.txt` (9 de 10, o 1 é o EPERM de symlink);
`conferencias.txt` (`conferir:numeros`: todos os números batem; `baseline.test.mjs` 29 de 29; `auditar.mjs` limpo).
Não foi rodado `test:e2e:api`. Os outros achados da revisão (bloqueio da migração em base grande, corrida com duas
conexões reais, teste de tela sem montar o componente) ficam como dívida pelo orquestrador.

## Justificativa

A promessa da etapa é que chave de foto de outra ocorrência vira 409. Sem tratar o 23505, a mesma promessa falhava
justamente no caso concorrente, e com 500 o aparelho trataria como falha temporária e insistiria. Repetir a transação, em
vez de montar a resposta a partir do erro, reaproveita todas as conferências (autor, ocorrência, município) e não cria um
segundo caminho de resposta para divergir do primeiro.
