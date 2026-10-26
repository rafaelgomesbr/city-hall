---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E08
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [UI, A11Y, AUTH, AUTHZ, TENANT, API, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados
- Agente em `GET /oficios` e `GET /oficios/:id`: 403 `sem_permissao`, sem e-mail do órgão, observações nem IP no corpo. Provado pelo teste da etapa e pela sonda temporária (variantes de rota abaixo).
- Sino do agente recortado à equipe, na lista E na contagem `naoLidos`, e `POST /avisos/lidos` sem oráculo: provado por mutação de cada um dos três recortes separadamente (o teste morde em cada um, por asserção e não por erro 500).
- Coordenador do município B no ofício de A: 404 com corpo idêntico ao de id inexistente (sonda).
- Coordenação e administração sem mudança: teste da etapa verde no SHA; a mutação não altera esses casos.
- `exigirPermissao` antes da transação e antes do `idSchema` (`apps/api/src/rotas/oficios.ts:189` e `:226`): id em maiúsculas e `%2e` também respondem 403, sem tocar no banco.

## Evidência
Saídas no scratchpad da sessão (`C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/78869014-3ace-4efd-a059-e24f265aea3c/scratchpad/`):
- `rt1.txt`: `npx vitest run test/zz-redteam-e08.test.ts` (teste temporário, 4 de 4, saída 0), log das sondas abaixo.
- `rt2.txt`: medição de tempo intercalada, 500 amostras por braço (saída 0).
- `mutA2.txt`, `mutB2.txt`, `mutC.txt`, `mutD.txt`: `npx vitest run test/leitura-do-agente-oficios-e-avisos.test.ts` com uma mutação por vez (saída 1 em todas).
- `packages/shared/dist/permissoes.js` contém `consultar_oficio` (o dist lido pela API é o do SHA).
- O teste temporário `dc360/apps/api/test/zz-redteam-e08.test.ts` foi apagado; cada mutação foi desfeita com `git restore`. `git status --porcelain` ao fim mostra só as pastas `validacao/`.

## Cenários positivos
- Agente da Alfa abre o dossiê da própria ocorrência (c1): 200.
- Coordenador de B lista os ofícios do próprio município (teste da etapa).
- Token assinado com o segredo verdadeiro e papel coordenador: 200 (controle: confirma que a sonda de forja mede a assinatura, e não outra coisa).

## Cenários negativos
- Variantes de rota com o token do agente, em GET e HEAD: `/oficios/` e `/oficios?ocorrenciaId=` 403; `/oficios/<id>/`, `/oficios//<id>`, `/OFICIOS/<id>`, `//oficios/<id>` 404 de rota inexistente; `/oficios/<ID EM MAIÚSCULAS>` e `/oficios/%2e/<id>` 403. Nenhum corpo trouxe e-mail, IP ou observação.
- Token forjado com papel trocado para coordenador: segredo errado, HS512 com o segredo certo, `alg: none` e payload trocado com a assinatura original: 401 nas três rotas (`/oficios`, `/oficios/:id`, `/avisos`), 12 de 12.
- Caminhos indiretos com o token do agente da Alfa e um ofício da Bravo semeado (com envio, abertura com IP e evento `oficio_enviado` na trilha):
  - `GET /ocorrencias/<c8 da Bravo>`: 404 genérico, sem nome de equipe.
  - `GET /evidencias/ocorrencia/<c8>`: lista vazia.
  - `GET /documentos/<c8 e c1>/laudo`, `GET /relatorios/ocorrencias.csv`, `POST /saida/pacote.zip`: 403.
  - `GET /busca?q=000902` (número do ofício): grupos vazios; `q=bombeiros` devolve só o catálogo de órgãos.
  - `GET /campo/meu-trabalho`, `/sincronizacao/pendencias`, `/ocorrencias/providencias/pendentes`, `/ocorrencias/indicadores/painel`: nada da Bravo nem do ofício.
  - `GET /avisos?desde=1970...&desdeId=0000...`: cursor forjado devolve lista vazia e `naoLidos` 0, sem aviso alheio.
- Canal lateral por tempo em `GET /oficios/:id` (intercalado, 500 amostras): agente, existente x inexistente, mediana 0,435 x 0,414 ms (a rota responde antes do banco); coordenador de B, ofício de A x inexistente, p25/p50/p75 0,285/0,431/0,594 x 0,288/0,431/0,637 ms. Indistinguível.

## Tentativas de reprovar
- Prova de que o teste morde, uma mutação por vez (a do QA desfez o conserto inteiro; aqui cada controle foi isolado):
  - A: `recorteDaContagem = ""` (só a contagem sem recorte): 2 falhas por asserção, `expected 6 to be 3` e `expected 6 to be +0`. A primeira tentativa (apagar só a interpolação) dava erro de parâmetro e falhava por 500, o que não provaria nada; refeita.
  - B: `recorteDeLidos = ""`: 1 falha, `marcados` 2 em vez de 0.
  - C: `GET /oficios/:id` volta a `exigirAutenticacao`: 2 falhas, 200 e 404 em vez de 403.
  - D: `recorteDaLista = ""`: 5 falhas.
- Forja de token, variantes de rota, cursor forjado, tempo de resposta e oito caminhos indiretos: descritos acima, nenhum passou.
- Procurei toda leitura de `oficios`, `oficio_envios` e `oficio_aberturas` fora de `rotas/oficios.ts`: só `documentos.ts:916` (validar) e `saida/pacote.ts` (exige `exportar_dados`). `GET /oficios/:id/documento` exige `emitir_documento`.
- Procurei eventos de trilha que carreguem dado de ofício: `oficio_emitido` (número, órgão) e `oficio_enviado` (número, órgão, destinatário completo). Ver achados.

## Achados
- bloqueia: nenhum.
- anotado: `GET /ocorrencias/:id` da PRÓPRIA equipe entrega ao agente, pela trilha, o evento `oficio_enviado` com número do ofício, órgão e o e-mail do destinatário por extenso (sonda: c1, `email=true of901=true`). Não é outra equipe, o endereço é institucional por construção (`oficios.ts:562`) e já sai em `GET /orgaos`; observações e IP não saem. É incoerente com o 403 da ficha do ofício da própria equipe. Sugestão para F03-E12 ou F04: encobrir o destinatário no `detalhe` como a resposta do envio já faz (`oficios.ts:591`).
- anotado: `GET /documentos/validar/:codigo` aceita o agente e devolve número, protocolo, `ocorrenciaId`, `oficioId` e nome de quem emitiu o ofício da Bravo (sonda, 200). Exige o código de 48 bits impresso no papel, derivado de um UUID aleatório: não enumera, e quem tem o código já tem o papel com esses dados. Concordo com `qa.md` e `seguranca-aplicacao.md`; fora do escopo do bloco (manifesto rota x ação, F03-E12).
- anotado: na leitura o papel vem do token (F03-E03, declarado); a forja sem o segredo não passa.
- Nenhum destes é vazamento de dado pessoal de cidadão nem de outra equipe acessível sem posse prévia do dado (item 3 da seção 7 de `28`).

## Não verificado
- Tempo de resposta em PostgreSQL 17 real e atrás do proxy de produção: medi no banco em memória (PGlite) via `app.inject`, sem rede. Diferença de microssegundos no índice com RLS não é observável aqui e pode ser em outro ambiente; a rota do agente não toca o banco, então o risco fica só no 404 entre municípios.
- O painel web renderizando a trilha do dossiê para o agente (se mostra o destinatário por extenso): não abri o navegador; a API entrega o dado.
- Aplicativo de campo e console: fora do diff; não exercitados.
- Conteúdo de CSV e pacote de saída para o agente: 403 antes de gerar, então não há conteúdo a inspecionar.
- Rate limit de `/documentos/validar/:codigo`: não medido (força bruta de 48 bits é inviável de qualquer forma).
- O recorte de equipe é da aplicação, não do RLS (o RLS recorta só município): uma rota nova que esqueça `eRecorteDoAgente` volta a vazar. É o desenho atual, e o default deny é F03-E12 e F03-E14.

## Risco residual
- Rotas futuras sem o recorte (o controle é por rota, não por banco) até o manifesto rota x ação.
- Papel do token vale na leitura por até 15 minutos depois de rebaixamento (F03-E03).
- Metadado de ofício da própria equipe pela trilha, e de outra equipe por código impresso, como descrito nos achados.

## Motivo do humano
Não se aplica.
