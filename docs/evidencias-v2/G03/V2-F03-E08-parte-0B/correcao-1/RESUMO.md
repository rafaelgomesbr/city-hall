# V2-F03-E08 (parte 0B), correção 1: sem isenção por arquivo de etapa, todos os esquemas, redefine provado

## Fatos

**Ponto de partida:** o candidato da parte 0B (`acef466`) foi REPROVADO pelo revisor adversarial. Seis sabotagens passavam pelo portão de isolamento (`isolamento.test.ts`, 137 de 137 verdes): S3, S3b, S5a, S8b, S8d e S11. Esta correção fecha os oito achados e acrescenta o requisito do catálogo da ADR 0009 corrigida (`origin/trab/f03-0a-e01-adr`, `13090cf9`): função por assinatura completa com ACL exata e teste que a prova; exceção de tabela dizendo o que DISPENSA e o que MANTÉM, com o portão conferindo o que ela mantém.

**O que mudou (código só em `dc360/db/test/` e em `scripts/roadmap/tags.mjs`):**

- `db/test/catalogo/tipos.ts`: `FuncaoPrivilegiada.argumentos` virou `assinatura` (a forma de `oid::regprocedure` com o esquema sempre escrito, por exemplo `public.trocar_senha(uuid,text,uuid)`), mais `provas` (teste que chama a função) ou `semProva` (por que não há). `ExcecaoAoIsolamento` trocou `semOrganizacaoId` e `semPolicyDeTenant` por `dispensa`, `mantem` e `grants` (os grants efetivos de `dc360_app`, `dc360_console` e `PUBLIC`, papel por papel), mais `doFornecedor`. Os invariantes são seis: `organizacao_id`, `policy_de_contexto`, `rls_forcada`, `grants_declarados`, `fk_com_organizacao` e `sem_delete`; os dois do meio nunca se dispensam.
- `db/test/catalogo/conferir.ts`: todas as consultas olham todos os esquemas fora de `pg_*` e `information_schema` (fora de `public`, menos o que é de extensão); o dono da função é conferido; a ACL é lida pelo nome do dono das tabelas e `X*` vira `WITH GRANT OPTION`; `tenant: "contexto"` exige `app_organizacao_atual` no corpo da função; a exceção é conferida invariante por invariante; duas conferências novas, `conferirEsquemas` e `conferirFontes`.
- `db/test/catalogo/index.ts`: a junção exige `etapa` igual à etapa do arquivo, `redefine` com migração maior, redefinição de exceção que não alarga a dispensa, `doFornecedor` só na base, assinatura do nome declarado e motivo de coluna com o tamanho mínimo; `fontesDoRepositorio()` lê as migrações e as provas.
- `db/test/catalogo/base.ts`: as 27 funções com assinatura e prova (ou `semProva` em três: `dono_do_token`, `abrir_recuperacao` e `interesse_recente`, que nenhum teste chama pelo nome), as quatro exceções no formato novo, e os três textos corrigidos (achado 7).
- `db/test/isolamento.test.ts`: a regra `DO_FORNECEDOR` passa a rodar ANTES do pulo da isenção de policy; `tabelasDeNegocio` olha todos os esquemas, e o caso da RLS consulta por esquema e nome; três casos novos (exceção do fornecedor só no bloco `DO_FORNECEDOR`; nada fora de `public`; a origem de cada função). Nenhum caso antigo foi tirado nem renomeado (`saidas/20`).
- `db/test/catalogo-nominal.test.ts`: de 28 para 58 casos. Fixa só a BASE; das etapas confere a forma; a sonda que criava `vigencia_da_sessao(uuid)` agora cria `sonda_funcao_de_etapa_futura(uuid)`; cada sabotagem do revisor virou caso com o nome dela.
- `db/test/catalogo/f03-e15.ts`: só o cabeçalho, que citava o campo antigo.
- `scripts/roadmap/tags.mjs` e o teste: a tag TENANT pega também `db/test/catalogo/` e `db/test/catalogo-nominal.test.ts`.
- Documentos: parágrafo do catálogo no README e os totais (510 do banco, 4428 em `npm test`), `COLOCAR-DE-PE.md` (6438), chave `V2-F03-E08-parte-0B-correcao-1` (33) no `baseline.mjs`.

**Achado a achado:**

| Achado | O que fecha | Prova de que falhava antes | Prova de que passa depois |
| --- | --- | --- | --- |
| 1 (bloqueia) | (a) `conferirExcecoes` recusa dispensar a policy de contexto em tabela com `organizacao_id` obrigatório; (b) no portão, `DO_FORNECEDOR` roda antes do pulo, e o caso novo exige que toda exceção `doFornecedor` esteja no bloco; (c) sem policy de contexto, o banco só pode dar INSERT ao app (conferido nos grants e nas policies), salvo `doFornecedor`, que só a base declara; redefinição de exceção não alarga; o que a exceção mantém é conferido no banco | `sabotagens/antes/S8b.txt` e `S8d.txt`: isolamento 137 de 137 verde | `sabotagens/depois/S8b.txt` e `S8d.txt` (isolamento reprova 2 casos cada); sondas 7 e 8 |
| 2 (bloqueia) | todas as consultas olham todos os esquemas; `conferirEsquemas` reprova objeto próprio fora de `public`, CREATE de papel do produto em qualquer esquema e USAGE fora de `public` salvo esquema só de extensão | `antes/S3.txt` e `S3b.txt`: 165 de 165 verdes | `depois/S3.txt` (2 casos do portão) e `S3b.txt` (4); sonda 9 |
| 3 | `redefine` exige migração maior (junção) e a migração contendo `CREATE OR REPLACE FUNCTION` da função (`conferirFontes`); `migracao` tem de ser a última que cria a função; `tenant: "contexto"` cruzado com o corpo; `etapa` cruzada com o arquivo | `antes/S5a.txt`: isolamento verde | `depois/S5a.txt` (2 casos do portão); sondas 5, 10 e 11 |
| 4 | só a BASE é fixada; das etapas, a forma; sonda renomeada | `antes/S5a.txt`, `S8b.txt`, `S8d.txt`: "as 13 etapas da F03 estão no catálogo, vazias" reprova qualquer entrada de etapa, honesta ou não | `depois/L1.txt`: uma etapa honesta (tabela no formato de `pessoas` e uma função nova, só no `f03-e04.ts`) deixa o portão e as sondas verdes, 198 de 198 |
| 5 | TENANT para `db/test/catalogo/` e `catalogo-nominal.test.ts` | `saidas/A5-tags-ANTES.txt`: 1 falha | `saidas/A5-tags-DEPOIS.txt`: 33 de 33 |
| 6 | `X*` vira `papel WITH GRANT OPTION` e não bate com o declarado | `antes/S11.txt`: 165 de 165 verdes | `depois/S11.txt` (1 caso do portão); sonda 4 |
| 7 | `concluir_eliminacao` (só exige `eliminada_em` preenchido, apaga e registra as sobras em `sobras_na_conclusao`, DC365 e DC366), `console_cancelar_eliminacao` (não devolve nada), `municipios_a_resumir` (junção com `metricas_municipio`) | texto, sem teste | lido contra a 038 |
| 8 | motivo de coluna com mínimo (junção); troca de dono pega pelo catálogo | `antes/S12.txt`: só a varredura de privilégio pegava | `depois/S12.txt`: o caso do catálogo reprova também; sonda 4 |

**As sabotagens do revisor, antes e depois** (portão = `isolamento.test.ts`; antes com 137 casos, depois com 140; roteiro em `sabotagens/roteiro/`, migração 999 temporária e apagada no fim de cada rodada). Nas sabotagens que mexem no catálogo, a rodada de depois usa o atacante ADAPTADO ao formato novo (`roteiro/e04-depois/`), e não o arquivo antigo, que reprovaria só por formato:

| Sabotagem | Portão antes | Portão depois | Sondas antes | Sondas depois |
| --- | --- | --- | --- | --- |
| S1 `executavelPor` errado na base | 1 falha | 1 falha | 9 | 13 |
| S2 EXECUTE a PUBLIC | 4 | 4 | 5 | 5 |
| S3 função SECURITY DEFINER noutro esquema | **verde** | 2 | verde | 15 |
| S3b tabela noutro esquema sem RLS | **verde** | 4 | verde | 12 |
| S4 tirar exceção da base | 1 | 1 | 8 | 10 |
| S5a apagar dívida só no catálogo | **verde** | 2 | 3 | 13 |
| S5c EXECUTE ao console pela etapa | 2 | 4 | 3 | 14 |
| S6 tabela sem coluna e sem RLS | 3 | 3 | 7 | 8 |
| S7 UPDATE por coluna a mais | 2 | 2 | verde | verde |
| S8 policies FOR ALL no livro | 4 | 6 | 2 | 8 |
| S8b isenção do livro de eliminações | **verde** | 2 | 2 | 9 |
| S8c a migração da S8b sem isenção | 1 | 1 | verde | 1 |
| S8d redefinir `console_operadores` | **verde** | 2 | 1 | 9 |
| S11 EXECUTE WITH GRANT OPTION | **verde** | 1 | verde | 8 |
| S12 troca de dono da função | 2 | 3 | verde | 12 |
| L1 controle legítimo (não é sabotagem) | (não rodado) | verde, 140 de 140 | | verde, 58 de 58 |

Todas as quinze reprovam o portão depois. Os casos que reprovam em cada uma estão em `sabotagens/depois/RESUMO.txt` e no arquivo da sabotagem.

**Portão antigo contra o novo (`saidas/20` a `22`):** os 137 casos do `isolamento.test.ts` antigo existem todos no novo, com o mesmo nome, e passam; o novo tem 3 a mais. No `catalogo-nominal.test.ts`, os 28 casos antigos foram reescritos para o formato novo; os que saíram de propósito são os que fixavam a lista inteira e as "13 etapas vazias" (achado 4), substituídos pela BASE congelada e pela forma das etapas. Nenhuma sabotagem que o portão antigo reprovava passa no novo (tabela acima).

**Portões (`saidas/00` e seguintes):** ver `saidas/00-codigos-de-saida.txt`.

**Sem prova, e por quê:**

- A regra de esquemas foi feita para não quebrar o PostGIS do provedor (esquema `extensions` só com objetos da extensão, onde `supabase-endurecer.sql` dá USAGE ao app de propósito), mas NÃO foi conferida contra a imagem `postgis/postgis:17-3.5` do CI: não há Docker nesta máquina. O portão roda em PGlite (onde não há outro esquema nem extensão além de `plpgsql`), e é lá que esta prova vale. Se um dia o `test:isolamento` rodar contra o banco do provedor, um objeto que não seja da extensão dentro de `extensions` reprova.
- `dono_do_token`, `abrir_recuperacao` e `interesse_recente` declaram `semProva`: nenhum teste as chama pelo nome (as duas primeiras são exercitadas por dentro das rotas da API; a terceira não tem teste de rota).
- A conferência de prova e de migração é textual (a função chamada pelo nome fora de comentário; `CREATE [OR REPLACE] FUNCTION nome(` fora de comentário). Uma migração que recria a função dentro de `EXECUTE format(...)` com o nome montado em tempo de execução escapa da regra da "última migração"; a regra do corpo (`app_organizacao_atual`) e as do banco continuam valendo.
- A regra do fornecedor nas policies (comando a comando, guarda nomeada) continua sendo por texto da expressão (`toContain` da guarda), como era.

## Justificativa

O achado 1 era o pior: o portão aceitava uma isenção porque um arquivo de etapa a declarava, e a isenção desligava justamente a regra mais forte que existia para aquela tabela. A correção ataca as três pontas: a tabela com município nunca dispensa a policy de contexto; a regra do fornecedor roda antes de qualquer pulo; e uma dispensa de policy nascida numa etapa só é aceita na forma que o banco prova inofensiva (no máximo o INSERT do papel de aplicação), enquanto a forma do fornecedor só existe na base congelada. O requisito da ADR 0009 corrigida encaixa aqui: a exceção diz o que mantém, e o portão confere o que ela mantém no banco, papel por papel.

Para o achado 2 foram feitas as duas opções juntas, que é a mais estrita sem quebrar o PostGIS: as conferências olham todos os esquemas, e o portão reprova qualquer objeto próprio fora de `public` e qualquer USAGE do produto noutro esquema que não seja só de extensão. Assim as dezenas de varreduras do `isolamento.test.ts` que perguntam por `public` continuam suficientes sem ser reescritas uma a uma.

O achado 3 virou regra de origem: a migração declarada tem de ser a última que cria a função. Isso faz o `redefine` ser obrigatório quando o SQL muda e impossível quando não muda, que é o par que a sabotagem S5a explorava.
