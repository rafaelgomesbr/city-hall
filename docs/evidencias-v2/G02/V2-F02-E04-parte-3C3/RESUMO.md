# V2-F02-E04, parte 3C3: rotas de documentos, ofícios e órgãos, prestação de contas e público descritas no contrato

Ramo `trab/f02-3c3-contrato-documentos`, a partir de `origin/v2/f02` (3d12f569). Toca só os quatro grupos de `apps/api/src/contrato/grupos/` (`documentos`, `oficios-e-orgaos`, `prestacao-de-contas`, `publico`), as quatro rotas de onde saem os esquemas (só `export`), duas linhas de contagem em `test/openapi.test.ts`, o `v1.json` regerado e o teste novo.

## Fatos

**Contagem antes e depois (nos quatro grupos desta parte):**

| Grupo | Antes (entradas / com resposta / sem resposta / pendentes) | Depois |
| --- | --- | --- |
| documentos | 5 / 0 / 5 / 1 | 6 / 6 / 0 / 0 |
| oficios-e-orgaos | 3 / 0 / 3 / 7 | 10 / 10 / 0 / 0 |
| prestacao-de-contas | 3 / 0 / 3 / 4 | 7 / 7 / 0 / 0 |
| publico | 1 / 1 / 0 / 0 | 1 / 1 / 0 / 0 |
| **Soma** | **12 / 1 / 11 / 12** | **24 / 24 / 0 / 0** |

Na minha árvore, o registro inteiro foi de 55 para 67 entradas, de 40 para 28 pendentes (95 rotas sob `/v1` em ambos: 67 + 28 = 95) e de 49 para 38 entradas existentes sem resposta (`relatorio-de-rotas.txt`). Os outros grupos não foram tocados, então o que sobra (28 pendentes, 38 sem resposta) é das partes 3A, 3C1 e 3C2.

**O que mudou:**

- `rotas/documentos.ts`, `rotas/oficios.ts`, `rotas/orgaos.ts`, `rotas/prestacao-de-contas.ts`: só `export` dos esquemas que o handler já aplicava (`codigoSchema`, `emissaoSchema`, `envioSchema`, `orgaoSchema`, `desativacaoSchema`, `filtroTrilhaSchema`, `filtroExportacaoSchema`, `nivelDaExportacaoSchema`, `filtroConsultasSchema`). Três esquemas eram locais a uma função ou inline e foram içados para o nível do módulo com o mesmo texto: `codigoSchema` (estava dentro de `rotasDocumentos`), `consultaDosOficiosSchema` (query inline de `GET /oficios`) e `consultaDosOrgaosSchema` (query inline de `GET /orgaos`). Nenhum nome de campo, status, mensagem ou ordem de validação mudou.
- `contrato/grupos/documentos.ts`: as 5 entradas ganham `resposta` (HTML `text/html`, PDF `application/pdf`) e `erros` completos; entra `GET /documentos/validar/:codigo` (era a única pendente), com `respostaDaValidacaoSchema` (união das duas formas que o handler devolve: documento técnico e ofício).
- `contrato/grupos/oficios-e-orgaos.ts`: as 7 pendentes viram entradas (`GET` e `POST /oficios`, `POST /oficios/:id/envio`, `GET` e `POST /orgaos`, `PATCH /orgaos/:id`, `POST /orgaos/:id/desativacao`) e as 3 existentes ganham `resposta`. Esquemas de resposta no próprio grupo, fiéis à linha do banco que o handler devolve (snake_case nas listas e na ficha, camelCase no envio).
- `contrato/grupos/prestacao-de-contas.ts`: as 4 pendentes viram entradas (`GET /trilha`, `GET /relatorios/ocorrencias.csv`, `GET /relatorios/resumo`, `GET /relatorios/consultas`) e as 3 existentes ganham `resposta` (`trilha/tipos` e `exportacoes` em JSON; `saida/pacote.zip` em `application/zip`).
- `test/openapi.test.ts`: tirei as 12 chaves das minhas rotas de `PENDENTES_CONGELADAS` e baixei `TETO_DE_PENDENTES` de 40 para 28. Nada mais.
- `openapi/v1.json` regerado por `npm run openapi --workspace @dc360/api` (nunca à mão), cópia em `v1.json` desta pasta.
- `test/contrato-respostas-3c3.test.ts` (novo, 14 casos): chama as 24 rotas de verdade por `/v1` e confere cada resposta contra a `resposta` que o REGISTRO declara (não contra uma constante do teste): status, esquema sem chave de sobra (`safeParse` e depois `toEqual` do objeto lido contra o original) ou, para arquivo, o tipo de mídia; mais o guarda de que nenhuma entrada dos quatro grupos fica sem resposta. Cobre o fluxo inteiro do ofício (emitir, enviar sem corpo, abrir o link uma vez, segunda abertura recusada, ficha com envio e as duas aberturas), o CSV nos dois níveis, o pacote ZIP e o laudo e os termos em HTML e PDF (gerador de PDF de mentira).

**Rotas de arquivo (binário).** `resposta` leva `tipo` e nenhum esquema: `text/html` (laudo, termos, documento do ofício), `application/pdf`, `text/csv`, `application/zip`. O gerador já descrevia isso (`type: string, format: binary` no tipo de mídia), então não mudei `openapi.ts`. Limite: o registro ainda não tem campo para CABEÇALHO de resposta; o `Content-Disposition` (e o nome do arquivo) vai dito na `descricao` de cada resposta e o teste confere o padrão do nome nos PDFs, no CSV e no ZIP.

**Refinamento do CSV.** O handler aplica DOIS esquemas à mesma query (`filtroExportacaoSchema` e `nivelDaExportacaoSchema`, este com `refine`). O contrato descreve a junção, `nivelDaExportacaoSchema.safeExtend(filtroExportacaoSchema.shape)`, que preserva o refinamento: a regra "nível completo exige justificativa" sai sozinha em `x-regras-adicionais` (guarda `operacoesSemAnotacaoDeRegras` verde).

**Corpo opcional.** `POST /oficios/:id/envio` lê `req.body ?? {}`; o contrato usa `envioSchema.optional()` e o `v1.json` sai com `requestBody.required: false`. O teste envia sem corpo.

**Erros.** Cada `erros` foi tirado do handler, não da forma da rota (leia as `RegraDeNegocio` de cada um). Exemplos que a 2D deixara de fora: `sem_vistoria` e `nao_encontrada` nos documentos; `interdicao_nao_indicada`, `sem_despacho`, `ocorrencia_encerrada` e `estado_mudou` no termo de interdição; `nao_desinterditada` no termo de desinterdição; `pdf_indisponivel` nos PDFs; `envio_desligado`, `orgao_desativado`, `orgao_sem_email`, `teto_de_envios`, `dominio_nao_autorizado` e `envio_falhou` no envio do ofício; `posto_insuficiente_para_dado_pessoal` e `recorte_grande_demais` no CSV. Atenção: o catálogo tem dois códigos de 404, `nao_encontrado` (ofício, órgão, validação) e `nao_encontrada` (ocorrência, providência), e o contrato usa o que cada handler de fato emite.

## Justificativa

- **Esquema de resposta no grupo, não no shared:** a instrução da parte. Os handlers montam a resposta na mão, a partir da linha do banco, e nenhum cliente (painel ou campo) compartilha esses tipos. Tornar o esquema fonte única de verdade no shared seria outra decisão (E05/F28).
- **`z.object` sem `.strict()` e a comparação `toEqual` no teste:** o esquema de resposta tem de aceitar campo novo aditivo no futuro (a regra do campo instalado é só aditivo), mas o teste não deixa o esquema descrever MENOS do que a rota devolve hoje. Provado: tirei `abertas` do esquema do catálogo e `GET /v1/orgaos` reprovou com "a rota devolve o que o esquema não descreve" (mutação desfeita).
- **`detalhe` da trilha é `z.unknown()`:** é `jsonb` com forma por tipo de evento; descrever cada uma é trabalho da F03-E12, não desta etapa.
- **Datas como `z.string()`:** o JSON as traz em ISO 8601; o `format: date-time` ficaria promessa sem conferência no `toEqual` e fecharia a porta a formatos do driver.
- **`publico` não mudou:** já tinha entrada, esquema de corpo do shared e `resposta` fiel; só ganhou o caso no teste novo.

## Limites declarados (leia antes de dar PASS)

- **Cabeçalhos de resposta:** só na `descricao` (o registro e o gerador não têm campo para eles, e a parte não podia mexer neles). Se o validador quiser `headers` no documento, é mudança em `tipos.ts` e `openapi.ts`, fora desta parte.
- **`text/html`, `text/csv` e `application/zip` saem como `string/binary`:** é o que o gerador faz hoje para todo `tipo`; o HTML e o CSV poderiam ser `string` simples. Não mudei o gerador.
- **O teste usa gerador de PDF de mentira:** confere status, tipo de mídia e nome do arquivo, não o desenho da página (isso é de `documentos.test.ts` e `pdf-na-imagem.test.ts`).
- **Ambiente Windows, só as falhas aceitas:** `regras-de-conteudo` 1 caso (EPERM em symlink, DV-46), `desfazer-migracao` 5, `guarda-da-semente` 3 e `semear-homologacao` 2. Nenhum arquivo desses foi tocado.
- **`test:e2e:api` NÃO foi rodado** (instrução da parte).
- O `TETO_DE_PENDENTES = 28` e o `baseline.mjs`/README/`COLOCAR-DE-PE.md` valem para a MINHA árvore; o integrador soma as três partes (3A, 3C1, 3C2, 3C3).

## Portões (números; saídas em `saidas/`)

- `typecheck` 0 erros (`01`); `lint` OK, monorepo e campo (`02`); `lint:teto` 431, não sobe (`03`); `formato:conferir` OK, 835 arquivos (`04`, depois de `--formatar` em 4 arquivos, `04a`).
- `npm test` (`05`): campo 261 passam; shared 416 passam e 1 falha (EPERM); API 2053 passam, 2 falham (`semear-homologacao`), 34 pulados (2089); console 379 passam; web 820 passam; db 440 passam, 8 falham (`desfazer-migracao` 5 e `guarda-da-semente` 3), 6 pulados.
- `contrato-respostas-3c3`, `openapi` e `openapi-regras`: 52 de 52 (`06`; 14 + 28 + 10).
- `conferir:numeros` OK (`07`); `auditar` código 0 (`08`); `baseline.test.mjs` verde (`09`); `regras-de-conteudo` 9 de 10, a falha é o EPERM aceito (`10`); `test:isolamento` (CA-06): só as 8 falhas de ambiente do `db` (`11`).
- `test:scripts` e índices de evidência: `12` e `13`.

## Para o orquestrador

- **Linha do STATUS sugerida:** acrescentar à E04 `parte 3C3: documentos, ofícios e órgãos, prestação de contas e público descritos (24 rotas com resposta; 12 pendentes zeradas; esquemas de resposta nos grupos, binário por tipo de mídia); +14 testes de API`.
- **Dívidas pagas:** nenhuma desta parte. (A dívida "49 entradas sem resposta" da 2D baixa em 11 aqui.)
- **Pendências humanas:** nenhuma desta parte.
- **Para quem integra:** (1) em `test/openapi.test.ts`, `TETO_DE_PENDENTES` estava em 40 e baixei para 28 (12 chaves minhas fora de `PENDENTES_CONGELADAS`); some o seu número ao das outras partes (cada parte tira as chaves dela e baixa o número, então o conflito é nas duas linhas do teto e no bloco da lista congelada). (2) `baseline.mjs` ganhou só `"V2-F02-E04-parte-3C3": 14`; os totais de README e `COLOCAR-DE-PE.md` estão na minha árvore (API 2055, `npm test` 4380, com o aplicativo 6390) e precisam ser recalculados na junção. (3) `v1.json` é derivado: em conflito, `npm run openapi --workspace @dc360/api`, nunca mesclar. (4) Conflito possível com 3C2 em `rotas/prestacao-de-contas.ts`? Não: só mexi em `export` nas quatro linhas dos filtros; `rotas/oficios.ts` e `rotas/orgaos.ts` também são só meus nesta parte.
