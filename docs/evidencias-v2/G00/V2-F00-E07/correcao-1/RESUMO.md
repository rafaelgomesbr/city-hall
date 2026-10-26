# V2-F00-E07, correção 1: a mesma causa da E04

A reprovação da E07 (VEREDITO.md e `validacao/7005a60/qa.md`) vem da mesma causa que a da E04: `exigirAutenticacao` decidia escrita só pelo método HTTP, então `GET /documentos/:id/termo-de-interdicao` (que interdita o imóvel e grava `documento_emitido`) e o CSV passavam com o token de uma cadeia encerrada e com o de um coordenador rebaixado a operador. O conserto, o código, os testes e as saídas estão na evidência da E04, em `../../V2-F00-E04/correcao-1/`. Esta pasta só aponta para lá e diz o que, daquela correção, é da E07.

## Fatos

- Código (commit da correção, ver `../../V2-F00-E04/correcao-1/diff-da-correcao.patch`): `dc360/apps/api/src/servidor.ts` (`ROTA_GET_COM_EFEITO` e a decisão de escrita por método OU marca na rota), `rotas/documentos.ts`, `rotas/prestacao-de-contas.ts`, `rotas/avisos.ts` (rotas GET marcadas) e `auth/sessoes.ts`.
- Cadeia encerrada: o caso 4 das sondas de `dc360/apps/api/test/get-com-efeito.test.ts` renova a sessão, encerra a cadeia por quem administra e apresenta o token ANTERIOR à renovação ao termo de interdição (HTML e PDF), ao laudo (HTML e PDF), ao termo de desinterdição e ao CSV, em GET e HEAD. Esperado e obtido: 401 `sessao_encerrada` igual ao de um POST, e nada gravado. Antes do conserto reprovava (`../../V2-F00-E04/correcao-1/01-teste-novo-ANTES-do-conserto.txt`); depois passa (`02-teste-novo-DEPOIS-do-conserto.txt`).
- Papel rebaixado: o caso 2 das sondas usa o token de uma coordenadora rebaixada a operador. Esperado e obtido: 401 `nao_autenticado` igual ao de um POST, e nada gravado.
- Achado anotado pela validação, `/auth/encerrar-sessoes` com o token anterior à renovação derrubava a própria cadeia de quem pediu enquanto a mensagem dizia "Esta continua aberta". Corrigido em `auth/sessoes.ts` (`encerrarSessoes` preserva a família da sessão, e não só a linha) e travado pelo último caso de `get-com-efeito.test.ts`.
- Regressão: `npm run test:api` 1277 de 1277, `test:isolamento` 327 aprovados e 3 pulados de 330, `test:e2e:api` 271 de 271, `typecheck`, `conferir:numeros` e portão de conteúdo verdes (saídas `03` a `10` da E04).
- Limitação: a vigência em leitura pura (e no dossiê e na busca, que só gravam o registro da própria leitura) continua da F03-E03.

## Justificativa

A E07 definiu que o papel diferente do token responde 401 `nao_autenticado` e que o token anterior à renovação só vale enquanto a cadeia vive. Isso já funcionava para POST, PATCH, PUT e DELETE. O que faltava era valer também para o GET que escreve, e isso é um predicado único em `servidor.ts`, consertado e testado na E04. Duplicar o conserto ou o teste aqui criaria duas fontes de verdade.
