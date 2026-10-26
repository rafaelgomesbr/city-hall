# V2-F02-E04, parte 2D: infraestrutura do contrato OpenAPI do /v1

## Fatos

**O que mudou (todo o código em `dc360/apps/api`; nenhuma rota, nenhum arquivo de `servidor.ts`, `rotas/*.ts`, web ou campo):**

- `src/contrato/tipos.ts` (novo): a forma da entrada, `{ metodo, caminho, resumo, corpo?, consulta?, parametros?, resposta?, erros?, nova? }`, e `GrupoDoContrato = { nome, rotas, pendentes }`. `erros` é uma lista de CÓDIGOS DO CATÁLOGO (`CodigoDeErro` do shared): o gerador pega o status de cada um em `CODIGOS_DE_ERRO`, então status e código não podem divergir do catálogo.
- `src/contrato/rotas.ts` (novo): o registro único. Só importa os dez arquivos de `src/contrato/grupos/*.ts` (um por grupo, para o lote 3 trabalhar em paralelo sem conflito) e junta: `ROTAS_DO_CONTRATO`, `ROTAS_PENDENTES`, `rotasSemResposta`, `problemasDoRegistro` (entrada repetida, caminho fora do `/v1` ou com barra no fim, resumo vazio, `nova` sem `resposta`).
- `src/contrato/grupos/*.ts` (novos): `autenticacao` (+ segundo fator), `conta`, `administracao`, `ocorrencias`, `campo`, `mapa-e-busca`, `documentos`, `oficios-e-orgaos`, `prestacao-de-contas`, `publico`. Cada um declara as entradas que deu para descrever bem e a lista `pendentes` das rotas registradas que ainda não têm entrada, com o motivo no cabeçalho do arquivo e a parte do lote 3 que a zera (3C1: autenticação, conta, administração; 3C2: ocorrências, campo, mapa e busca; 3C3: documentos, ofícios e órgãos, prestação de contas, público).
- `src/contrato/comuns.ts` (novo): `parametroId`, `parametroIdEProvidencia` e as listas de erro por forma de rota (`ERROS_AUTENTICADA`, `ERROS_AUTORIZADA`).
- `src/contrato/openapi.ts` (novo): `gerarOpenApi()`, com `z.toJSONSchema` do Zod 4.6.7 no dialeto 2020-12 (que o OpenAPI 3.1 adota). Corpo, query e parâmetros usam `io: "input"` (o que o servidor aceita), resposta usa `io: "output"`. `:id` vira `{id}`; o erro da API (`erroDaApiSchema`) é descrito uma vez em `components.schemas.ErroDaApi` e referenciado por `$ref`; cada status de erro leva `x-codigos-de-erro`. Operação sem `resposta` sai com `default` e `x-resposta-pendente: true`, sem inventar um 200. As rotas ainda sem entrada saem em `x-rotas-pendentes`. O gerador FALHA se os parâmetros de caminho de `caminho` não batem com o esquema de `parametros`. Nenhuma dependência nova.
- `src/contrato/cli.ts` (novo) e o script `openapi` em `apps/api/package.json`: `npm run openapi --workspace @dc360/api` escreve `apps/api/openapi/v1.json`; com `-- --relatorio` imprime o relatório.
- `openapi/v1.json` (gerado e commitado, 131 KB, 52 caminhos): DERIVADO, nunca editado à mão. Não é rota (o teste confere que `/v1/openapi.json`, `/openapi/v1.json`, `/openapi.json` e `/v1/docs` respondem 404).
- `test/openapi.test.ts` (novo, 24 casos): ver abaixo.
- Contagem: `baseline.mjs` ganhou `"V2-F02-E04-parte-2D": { total: 24, falhas: 0, puladas: 0 }`; README e `COLOCAR-DE-PE.md` ajustados à minha árvore (API 1945 para 1969, `npm test` 4198 para 4222, total com o aplicativo 6195 para 6219). README: só o parágrafo "O contrato OpenAPI do `/v1`". `apps/api/PENDENCIAS.md`: seção da dívida das respostas.

**Números do contrato (de `relatorio-de-rotas.txt`):**

- Rotas registradas sob `/v1` (formas com e sem barra final contadas uma vez): **95**.
- Com entrada: **55**. Sem entrada, declaradas em `pendentes`: **40**. 55 + 40 = 95, conferido pelo teste.
- Entradas existentes **sem `resposta` descrita: 49** (relatório, não reprova). Com resposta: 6 (`GET /auth/recuperacao`, `GET /auth/eu`, `POST /auth/encerrar-sessoes`, `GET /usuarios/eu`, `DELETE /usuarios/eu/foto`, `POST /publico/interesse`).
- Por grupo (entradas / com resposta / sem resposta / pendentes): administracao 10/0/10/2; autenticacao 5/3/2/10; campo 12/0/12/3; conta 4/2/2/6; documentos 5/0/5/1; mapa-e-busca 0/0/0/3; ocorrencias 12/0/12/4; oficios-e-orgaos 3/0/3/7; prestacao-de-contas 3/0/3/4; publico 1/1/0/0.

**O que o teste cobra (`test/openapi.test.ts`):**

1. Lê da ÁRVORE que o Fastify de fato registrou (a mesma leitura de `printRoutes` da E01) as rotas sob `/v1`. Âncora: mais de 80 rotas e `POST /v1/ocorrencias` presente.
2. Toda rota registrada tem entrada ou está em `pendentes`; toda entrada tem rota; `pendentes` não cita rota inexistente nem rota já descrita. A comparação é função pura, e quatro casos sintéticos provam que cada defeito reprova.
3. Teto de pendências (`TETO_DE_PENDENTES = 40`): só desce. O lote 3 leva a zero.
4. `nova` sem `resposta` reprova (caso sintético e registro real); as existentes sem resposta saem num relatório com o número.
5. O documento regenerado em memória é igual ao `v1.json` commitado (sem deriva).
6. Forma OpenAPI 3.1 sem validador externo: `openapi: "3.1.0"`, todo caminho sob `/v1/`, nenhum `:` no caminho, cada operação com `summary` e `responses`, parâmetros de caminho declarados iguais aos do caminho, toda `$ref` resolve, nenhum `#/$defs` solto.
7. `POST /v1/ocorrencias` descreve `aberturaOcorrenciaSchema` (as propriedades batem com o `shape`).

## Justificativa

- **Por que `pendentes` e não 100% agora:** 40 rotas validam o corpo ou a query com um esquema que mora DENTRO de `rotas/*.ts` (`entradaSchema`, `consultaSchema`, `emissaoSchema`...). Descrevê-las aqui exigiria copiar o esquema (segunda fonte da verdade, exatamente o que a etapa quer evitar) ou exportá-lo de um arquivo que a parte 2E (`ocorrencias.ts`, `evidencias.ts`) ou outras partes tocam. Fica declarado, contado e com teto que só desce, e o lote 3 exporta e zera. O teste NÃO passa sem conferir: a lista é cobrada contra as rotas reais nos dois sentidos.
- **Por que `erros` são códigos do catálogo e não números:** o status sai do catálogo (`dados_invalidos` é 422, não 400: o gerador evita a suposição errada que eu mesmo fiz no início). Só listei códigos que a forma da rota garante (`nao_autenticado`, `sem_permissao`, `dados_invalidos`) e `nao_encontrada` onde li o 404 no código; a E05 confere o resto.
- **Por que sem `resposta` não inventa 200:** `default` com `x-resposta-pendente` diz a verdade. Resposta só foi descrita onde li o handler (6 rotas).
- **Por que `io: "input"` para o pedido:** esquemas com `transform` (coordenada com casas fixas, `idSchema` em minúsculas) não têm saída representável, e o que o cliente precisa saber é o que o servidor aceita.
- **O documento descreve só o `/v1`:** o espelho legado não entra (E08). Segurança por rota (quem aceita token) fica para a F03-E12, que estende este mesmo registro.

## Limites declarados (leia antes de dar PASS)

- **Ambiente Windows, só as falhas aceitas:** `regras-de-conteudo` 1 caso (EPERM ao criar link simbólico, DV-46), `desfazer-migracao` 5, `guarda-da-semente` 3 e `semear-homologacao` 2 (`spawnSync` de `.bin/tsx`). Arquivos não tocados.
- **Console `no-navegador.test.ts`:** na rodada completa (`05a`) e sozinho, os 8 casos PASSAM e o arquivo reprova por `afterAll` estourar os 10 s ao fechar o navegador (Playwright no Windows, máquina carregada). Não é código desta parte (o console não foi tocado) e não está na lista de falhas aceitas: declarado aqui para o validador reconferir no CI.
- **Primeira rodada de `npm test` (`05a`)** reprovou também `codigos-de-erro.test.ts` (a varredura achou uma chave calculada `{ [tipo]: ... }` em `openapi.ts`). Corrigido (sem chave calculada) e a API inteira foi rodada de novo em `05b-test-api.txt` (2003 casos: 1967 passam, 2 falham, as de `semear-homologacao`, 34 pulados). O resto dos pacotes de `05a` não mudou com a correção.
- **`test:e2e:api` NÃO foi rodado** (instrução da parte).
- **A conferência é estrutural, não por validador de OpenAPI** (dependência nova exigiria `npm audit` em zero). Rafael ainda precisa abrir `v1.json` num visualizador e conferir três rotas conhecidas (validação humana da etapa).
- **`test:scripts`:** 807 passam e 1 falha na rodada `10` bruta, porque o `INDEX.md` desta evidência ainda não existia; o arquivo `10-test-scripts.txt` entregue é da rodada refeita com o `INDEX.md` presente: 808 passam, 0 falham, 23 pulados por ambiente.

## Provas (em `saidas/`, e na raiz `v1.json` e `relatorio-de-rotas.txt`)

`02-openapi-test.txt` (24 de 24), `03-isolamento.txt` (portão CA-06: só as 8 falhas de ambiente), `04-typecheck.txt` (0), `05a-npm-test-primeira-rodada.txt`, `05b-test-api.txt` (2003 casos), `06-lint.txt`, `07-lint-teto.txt` (431, não sobe), `08-formato.txt`, `09-conferir-numeros.txt`, `10-test-scripts.txt`, `11-regras-de-conteudo.txt` (9 de 10), `12-auditar.txt` (0), `13-baseline-test.txt` (29 de 29).

## Para o orquestrador

- **Linha do STATUS sugerida:** `V2-F02-E04 | IMPLEMENTADA (candidato, parte 2D: infraestrutura) | Registro único apps/api/src/contrato/rotas.ts com grupos/*.ts (um por grupo), gerador openapi.ts (z.toJSONSchema, OpenAPI 3.1, sem dependência nova), openapi/v1.json derivado e npm run openapi; teste de paridade contra as rotas que o Fastify registrou. 95 rotas sob /v1: 55 com entrada, 40 pendentes declaradas (teto 40 que só desce; o lote 3 zera), 49 entradas sem resposta descrita. +24 testes de API. Falta: lote 3 (3C1 a 3C3) completar os grupos; validação humana do v1.json.`
- **Dívidas pagas:** nenhuma desta parte.
- **Pendências humanas:** Rafael abrir `v1.json` num visualizador e conferir três rotas; nenhuma ação em Fly, Vercel, Supabase ou GitHub.
- **Para quem integra:** (1) `baseline.mjs` ganhou `"V2-F02-E04-parte-2D": 24` em `MUDANCAS_DO_TESTE_API_POR_ETAPA`; recalcular os totais (README 1969, 4222, `COLOCAR-DE-PE.md` 6219 na minha árvore). (2) O README ganhou um parágrafo novo logo depois de "A versão no caminho"; conflito de posição com outros parágrafos é só de texto. (3) `v1.json` é derivado: em conflito, `npm run openapi --workspace @dc360/api`, nunca mesclar. (4) Se a parte 2E registrar rota nova em `/v1`, o teste de paridade vai reprovar até a rota entrar no grupo certo (ou em `pendentes`, sem passar do teto 40: ao subir o teto, é decisão escrita).
- **Para o lote 3 (3C1 a 3C3):** para cada chave de `pendentes`, exporte o esquema local da rota, escreva a entrada em `rotas` do grupo, tire a chave de `pendentes`, regere o `v1.json` e baixe `TETO_DE_PENDENTES` em `test/openapi.test.ts`. Descreva também a `resposta` das 49 entradas sem resposta; rota nova entra com `nova: true` e `resposta`.
