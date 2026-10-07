# V2-F00-E25: restore do esquema atual provado (CA-08) e roteiro mínimo

- **Data:** 2026-10-07
- **Status:** EM ANDAMENTO (implementação e prova feitas; faltam máquina limpa de verdade, segunda pessoa e Postgres 17, que não dependem do executor)
- **Ambiente:** Windows 11, Git Bash, Node 22.17.0, npm 10.9.2, PostgreSQL 18.3 (binários do instalador; sem Docker, sem WSL). Versões em `saidas/01-versoes.txt`.

## Correção do número

O título da etapa fala em 46 migrações. Hoje são **47** (001 a 047; a E07 acrescentou `047_familia_da_sessao.sql`). A prova usou todas as 47 (`saidas/03-migrar-origem.txt`). As tabelas são 36: as 35 de negócio que a etapa cita mais `schema_migracoes`.

## O que foi feito

1. **Dois clusters descartáveis**, criados com `initdb` numa pasta temporária fora do repositório, portas 55451 (origem) e 55452 (destino), senha aleatória gerada para a rodada e nunca impressa. O Postgres que já roda na máquina (porta 4002) não recebeu nenhuma conexão. Bancos com nome de prova: `prova_e25_origem`, `prova_e25_restaurado`, e três de negativo (`prova_e25_neg_console`, `prova_e25_neg_trgm`, `prova_e25_neg_public`).
2. **Origem provisionada como o job `implantavel` do CI** (`dc360_setup` com CREATEROLE e BYPASSRLS, `dc360_api` restrito), `npm run migrar`, `--conferir`, `--semear`, `GRANT dc360_app TO dc360_api WITH SET TRUE`.
3. **Dump** `pg_dump --format=custom --schema=public` (e, para o caminho positivo, `--extension=pg_trgm`) com o papel de setup.
4. **Destino** com os papéis criados antes (inclusive `dc360_console`, com os atributos da 023, e `dc360_app`, ambos criados pelo setup como nas migrações), banco de `template0` sem o `public` de fábrica, restore como `dc360_setup` com `--exit-on-error`.
5. **Conferência** com três arquivos SQL (`sondas/linhas.sql`, `sondas/estrutura.sql`, `sondas/isolamento.sql`) rodados igual nos dois lados e comparados com `diff`.
6. **API apontada para a cópia** (`node apps/api/dist/index.js`, `DATABASE_URL` do `dc360_api` no restaurado), sonda `sondas/api-contra-a-copia.mjs`.
7. **Limpeza:** os dois clusters parados, a pasta temporária (clusters, dumps, senha, log da API) apagada, nenhum `*.dump` no repositório nem na pasta temporária (`saidas/21-limpeza.txt`).
8. **Documentação:** `dc360/docs/RESTORE-DO-BANCO.md` (novo, com os comandos realmente rodados no Windows e os erros encontrados), nota de registro histórico no topo da Parte 6 de `dc360/docs/COLOCAR-DE-PE.md`, e a seção 3.4 de `dc360/docs/INDISPONIBILIDADE.md` apontando para o roteiro novo.

Nenhum código de produto, teste ou migração mudou. `dc360/scripts/baseline.mjs` não muda: nenhuma contagem esperada se alterou.

## Resultados (números reais)

| Conferência | Origem | Restaurado | |
| --- | ---: | ---: | --- |
| `pg_restore --exit-on-error` | | código 0, 655 ms | sem erro |
| linhas por tabela (36 tabelas, gerado do catálogo) | 106 | 106 | `diff` vazio (`saidas/13-diff-linhas.txt`) |
| migrações em `schema_migracoes` | 47 | 47 | igual |
| md5 das 47 impressões | `59a915b9fbcecc0ea7c62e6dc3d70c8f` | idem | igual, e cada linha igual |
| RLS habilitada / forçada | 35 / 35 | 35 / 35 | igual; 0 tabela de negócio sem RLS forçada |
| policies | 94 | 94 | igual, por nome, comando, papéis e md5 da expressão |
| funções / `SECURITY DEFINER` | 81 / 27 | 81 / 27 | igual, por assinatura, dono, md5 do corpo e ACL |
| índices / `gin_trgm_ops` | 137 / 4 | 137 / 4 | igual |
| extensão `pg_trgm` | 1.6, dono `dc360_setup` | idem | igual |
| restrições | 552 | 552 | igual sem parênteses (ver abaixo) |
| grants de `dc360_app` / `dc360_console` | 81 / 10 | 81 / 10 | igual, mais a ACL crua de cada tabela |
| tabelas cujo dono é `dc360_app`, `dc360_api` ou `dc360_console` | 0 | 0 | igual |
| policies de UPDATE, DELETE ou ALL na trilha | 0 | 0 | igual |
| atributos dos papéis `dc360_*` | | | iguais (nenhum superusuário; só `dc360_setup` com BYPASSRLS) |

O primeiro `diff` de estrutura (`saidas/13-diff-estrutura.txt`) acusou três diferenças. Duas eram faltas reais que o dump não carrega, corrigidas no destino (`saidas/14-remedios-depois-do-restore.txt`): a concessão `GRANT dc360_app TO dc360_setup WITH SET TRUE` da migração 025 e o `USAGE` de fábrica do `public` para PUBLIC. Depois delas (`saidas/16-diff-estrutura-depois-dos-remedios.txt`) sobram duas linhas sem efeito: a ACL do `public` com as mesmas cinco entradas em outra ordem (conferido como conjunto ordenado) e a restrição `oficio_envios.provedor_id_plausivel` com os parênteses reagrupados pelo Postgres ao reler (`(a AND b) AND c` contra `a AND b AND c`); sem parênteses, o md5 de todas as 552 restrições bate.

**Isolamento no banco restaurado**, como `dc360_api` assumindo `dc360_app` (`saidas/17-isolamento-restaurado.txt`; a mesma sonda na origem deu saída idêntica):

- `rolsuper` e `rolbypassrls` falsos para `dc360_api` e `dc360_app`; 0 tabela com dono de um dos dois.
- Sem contexto: 31 tabelas de negócio lidas, todas com 0 linhas; 4 recusam a leitura (`console_codigos_de_recuperacao`, `console_operadores`, `eliminacoes_de_municipio`, `interesse_municipio`); `schema_migracoes` (catálogo, sem RLS, igual na origem) mostra 47.
- Contexto de Serra Alta: 30 tabelas com `organizacao_id` lidas, 47 linhas de Serra Alta, **0 fora**; 8 ocorrências, 0 de Vale Fundo; `organizacoes` mostra só Serra Alta. Contexto de Vale Fundo: 2 ocorrências, 0 de Serra Alta.
- `UPDATE` em ocorrência de Vale Fundo com contexto de Serra Alta: `UPDATE 0`.
- Trilha append-only: `UPDATE` e `DELETE` em `trilha_eventos` e `UPDATE` em `trilha_administrativa` com `permission denied`.

**API contra a cópia** (`saidas/19-api-contra-a-copia.txt`): `/saude` 200 com `status=ok` e `banco=ok` em 644 ms desde o disparo; `POST /auth/entrar` da coordenadora de Serra Alta 200; `GET /ocorrencias` 200 (6 itens na lista padrão); `GET /ocorrencias/{000471/2026}` 200, deslizamento; ocorrência de Vale Fundo com token de Serra Alta **404**; `GET /busca?q=acacias` 200, achou a 000471/2026 com pontuação 0,8 (caminho `pg_trgm`). 9 de 9 OK. O token não aparece na saída.

**Testes negativos** (cada um num banco próprio):

| Situação | Resultado | Arquivo |
| --- | --- | --- |
| destino sem `dc360_console` | código 1, `role "dc360_console" does not exist` na policy `console_codigos_insercao` (confirma a inferência do REL:10) | `saidas/08-negativo-sem-dc360_console.txt` |
| dump sem `--extension=pg_trgm` | código 1, `operator class "public.gin_trgm_ops" does not exist for access method "gin"` no índice `equipes_busca_idx`; 0 extensão e 0 índice de trigramas no destino | `saidas/09-negativo-sem-pg_trgm.txt` |
| banco sem derrubar o `public` de fábrica | código 1, `schema "public" already exists` | `saidas/10-negativo-sem-derrubar-o-public.txt` |
| `dc360_app` sem contexto | 0 linhas em toda tabela de negócio que lê | `saidas/17-isolamento-restaurado.txt` |

**Regressão:** `npm run test:isolamento` 327 passados e 3 pulados antes e depois (`saidas/00` e `22`); `npm run migrar -- --conferir` "Esquema em dia." na origem e no restaurado (`saidas/04` e `20`); portão de conteúdo 8 de 8 (`saidas/23`); `conferir:numeros` 24 afirmações e 0 divergência (`saidas/24`).

**Tempos** (semente sintética; não são RPO nem RTO, que são da F22-E07): migrar 47 do zero 1,7 s; semear 1,3 s; dump 0,25 s (373.746 bytes); restore 0,66 s; API até `/saude` 0,64 s.

## Achados

1. **O job `implantavel` do CI provavelmente está vermelho desde a migração 041** (inferência; o CI não foi rodado: repositório privado, `gh` sem login). Com exatamente os comandos dele, a 041 para com `permission denied to create extension "pg_trgm"` (`saidas/03a-ACHADO-migrar-como-o-ci-para-na-041.txt`): extensão confiável exige `CREATE` no banco, e o banco criado pelo `postgres` não dá isso ao `dc360_setup`. A imagem `postgres:16` traz o contrib, então o caminho com `pg_trgm` é escolhido lá também. Remédio provado: `GRANT CREATE ON DATABASE <banco> TO dc360_setup`. A mesma lacuna está na receita de papéis do `dc360/README.md` (linha 1205). O arquivo do CI era só leitura nesta etapa; registrado no STATUS, seção 11.
2. **`--schema=public` não leva a extensão.** Sem `--extension=pg_trgm` o restore para nos índices de busca. O `scripts/copiar-producao.mjs` precisa ganhar a opção (é da F01-E15, registrado).
3. **O dump não leva a concessão da migração 025** (`dc360_app` ao dono das tabelas, com SET) nem o `USAGE` de fábrica do `public`; sem a primeira, o provisionamento contra a cópia não consegue gravar a linha espelho como `dc360_app`. Os dois remédios estão no roteiro.
4. **`pg_ctl start` no Git Bash** sem redirecionar a saída não devolve o terminal, e interromper nesse estado derrubou o cluster de origem (`terminated by exception 0xC0000142`, visto no log do cluster, que foi apagado com ele). O roteiro manda redirecionar.

## Limitações (o que NÃO foi provado)

- **Máquina limpa de verdade:** os clusters são novos, a máquina é a do autor (Node, dependências e binários já instalados).
- **Postgres 17:** a produção é 17.6 e o CI 16; a prova rodou no 18.3, o único instalado. A afirmação de que as 47 migrações passam no 17 continua inferência.
- **Linux e macOS:** a seção "Fora do Windows" do roteiro não foi executada.
- **Origem Supabase** com o esquema atual (papéis do provedor, `sslmode`): não refeita; continua valendo só o restore de 2026-09-09 com 15 migrações.
- A conferência de isolamento no restaurado é por SQL como o papel da aplicação; o `isolamento.test.ts` (CA-06) roda em PGlite e foi rodado na árvore (verde), não contra o banco restaurado.
- O E2E é a sonda HTTP (login, lista, detalhe, 404 cruzado, busca), não o roteiro `e2e-api.mjs` completo, que cai na seção 13 (E18).

## Validação humana pendente

- Uma segunda pessoa (ou Rafael noutra máquina limpa) segue `dc360/docs/RESTORE-DO-BANCO.md` do zero, de preferência com Postgres 17.
- Item "restore" do G00: só se marca no gate.

## Arquivos

- `saidas/`: saída de cada comando, na ordem em que rodou (`00` a `24`), com o caminho da pasta temporária trocado por `[pasta temporaria]`.
- `sondas/`: `comum.sh` (variáveis da rodada, sem segredo), `linhas.sql`, `estrutura.sql`, `isolamento.sql`, `api-contra-a-copia.mjs`.
- Nenhum dump foi arquivado.
