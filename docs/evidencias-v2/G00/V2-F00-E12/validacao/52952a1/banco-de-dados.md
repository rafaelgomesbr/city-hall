---
validador: banco-de-dados (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E12
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [API, DOCUMENTO, TENANT, RLS]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Ambiente: Postgres 17.10 descartável com os papéis do job `implantavel` (`dc360_setup` dono e com BYPASSRLS; a API conecta como `dc360_api`, membro de `dc360_app`, sem BYPASSRLS e sem ser dono), semente sintética, API do SHA por `tsx`. Saídas em `$SP/val/banco-de-dados/`.

1. O que a correção 2 mudou em consulta: NADA no SQL. `git diff 4b96ea7..52952a1 -- apps/api/src/saida/pacote.ts apps/api/src/documentos/laudo.ts` acrescenta `conferirAssinatura` (armazenamento, não banco) e o campo opcional `assinaturaNaoConferida` no laudo; a consulta de vistorias do pacote e a de `rotas/documentos.ts` são as da rodada 2, já provadas pelo banco. `conferirAssinatura` repete a conferência de prefixo da rota (`tenant/<município do token>/`) ANTES de tocar o armazenamento, então chave de outro município nunca vira chamada `descrever` (sem oráculo de existência). No banco, a restrição `assinatura_com_prefixo_do_tenant` (CHECK `assinatura_chave LIKE 'tenant/' || organizacao_id || '/%'`) é a segunda barreira.
2. Leitura sob tenant do pacote de saída, em Postgres real com o login restrito: `POST /saida/pacote.zip` da administradora de Serra Alta: 200, 356.678 bytes; nenhum arquivo de `tabelas/` nem de `documentos/` contém id, e-mail, nome de pessoa ou nome do município de Vale Fundo (a única menção está nos textos das migrações copiados em `esquema/`, que são comentários de SQL) (`97b-e12-conteudo-do-zip-de-A.txt`).
3. Leitura sob tenant do laudo pela rota: com o token da coordenadora de Serra Alta, `GET /documentos/<ocorrência de A>/laudo` 200; o mesmo para as duas ocorrências de Vale Fundo: 404, e a trilha só cresceu pela emissão de A (28 para 29), nada gravado pelos 404 (`97-e12-laudo-e-fk-entre-municipios.txt`).
4. Nome de equipe de outro município no aviso: impossível no banco. Como superusuário, apontar `equipe_designada_id` ou `equipe_do_agente_id` de uma vistoria de A para uma equipe de B é recusado pelas FKs compostas `vistorias_equipe_designada_do_mesmo_municipio` e `vistorias_equipe_do_agente_do_mesmo_municipio` (23503) (`97`).
5. `test/saida-de-municipio.test.ts` (32 casos) junto de `test/codigos-de-erro.test.ts`: 54 de 54, código 0 (`99-saida-e-codigos-vitest.txt`). `npm run test:isolamento` 345 aprovados e 3 pulados, código 0 (`50`).
6. Achados da rodada 2 desta dimensão: (1) o teste de isolamento do aviso continua sem controle positivo (a semente de B não tem vistoria com equipe; conferido na semente), continua ANOTADO, a garantia é a FK composta do item 4; (2) não há CHECK no banco para `jsonb_typeof(checklist) = 'array'` (nenhuma migração o cria), continua ANOTADO e fora do escopo; (3) FKs compostas sem índice próprio, continua ANOTADO (é da 024).

## Evidência

- `97-e12-laudo-e-fk-entre-municipios.txt`: laudo 200 para A, 404 para as duas de B, trilha 28 para 29, e as duas recusas de FK.
- `97b-e12-conteudo-do-zip-de-A.txt`: a lista de arquivos do pacote de A e a busca por B fora de `esquema/` (nenhum arquivo). O ZIP (sintético) foi apagado depois da conferência.
- `99-saida-e-codigos-vitest.txt`, `50-test-isolamento.txt`.

## Cenários positivos

Laudo de A pela rota com o token de A: 200 e um evento de trilha. Pacote de A gerado com o login restrito em Postgres real.

## Cenários negativos

Laudo de ocorrência de B com token de A: 404, sem trilha. Equipe de B numa vistoria de A: recusada pelo banco. Pacote de A sem nenhum dado de B.

## Tentativas de reprovar

1. Procurar dado de Vale Fundo no ZIP de Serra Alta (ids, e-mails, nomes, município): não quebrou.
2. Laudo cruzado, inclusive conferindo se o 404 deixava rastro na trilha: não quebrou.
3. Plantar equipe de B numa vistoria de A, como superusuário, para o aviso imprimir nome de outro município: o banco recusou.
4. Chave de assinatura com prefixo de outro município: barrada antes do armazenamento pela conferência de prefixo (código, leitura) e no banco pelo CHECK de prefixo. A chave `tenant/<A>/../<B>/x` passa nas duas (prefixo literal), mas os dois armazenamentos do produto (S3 e memória) tratam a chave como literal, sem resolver `..`; registrado como anotado.

## Achados

1. ANOTADO (herdado, continua): teste de isolamento do aviso sem controle positivo.
2. ANOTADO (herdado, continua): sem CHECK de formato de `checklist` no banco.
3. ANOTADO (herdado, continua): FKs compostas da 024 sem índice próprio.
4. ANOTADO: a conferência de prefixo (`startsWith`) e o CHECK de prefixo aceitam `..` depois do prefixo; hoje sem efeito porque nenhum armazenamento resolve caminho, mas um armazenamento em disco local passaria a precisar de normalização. Dono provável: quem criar armazenamento local.

## Não verificado

- O comportamento com o armazenamento S3 fora do ar (é de QA e especificação; só a lógica de prefixo e o efeito no banco são desta dimensão).
- A comparação texto a texto dos dois laudos (especificação).

## Risco residual

Baixo nesta dimensão: a correção 2 não acrescentou consulta, e o isolamento das consultas da E12 está provado em Postgres real com o papel de aplicação restrito.

## Motivo do humano

Não se aplica.
