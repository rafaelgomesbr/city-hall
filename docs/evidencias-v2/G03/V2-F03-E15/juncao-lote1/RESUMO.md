# Junção do lote 1 da F03, segunda leva: 0G (correções 1 e 2), 1C, ADR 0009 (correções 4 a 6), portão da leitora e a E15 no desenho da ADR

Ramo de trabalho `trab/f03-juncao-lote1b`, a partir de `origin/v2/f03` (`6b2c694e`, já com a master pós-G00 e a F02). Integrador: Claude Opus 5.5. Nenhuma etapa marcada VALIDADA nem CONCLUÍDA.

## Fatos

**Ordem dos commits (as junções por `git merge --no-ff`):**

| Passo | Commit | O que entrou | Conflitos e como foram resolvidos |
| --- | --- | --- | --- |
| 1 | `42c009a3` | 0G, `origin/trab/f03-0g-extensao-do-portao` em `61f15bb7` (portão estendido e correção 1) | Só texto: `baseline.mjs` (as entradas da E04 e da 0G; o `/*` do comentário da 0G reposto), `README.md` e `COLOCAR-DE-PE.md` (contagens refeitas por `conferir:numeros`) |
| 2 | `5b72ca87` | Correção 2 da 0G (revisão independente da correção 1): `some` exige linha exclusiva; a prova da recusa fora da tabela com linha real semeada e UPDATE com mudança efetiva | Nenhum; evidência em `docs/evidencias-v2/G03/V2-F03-E08-parte-0G/correcao-2/` |
| 3 | `10101698` | 1C, `origin/trab/f03-1c-abertura-api` em `237bc670` | Só texto: `README.md` e `COLOCAR-DE-PE.md`. O comentário de `escolha_de_municipio_obrigatoria` em `packages/shared/src/erros.ts` passa a citar `VERSAO_DO_LOGIN_EM_DOIS_PASSOS` (DV-63) |
| 4 | `cb96112a` | ADR 0009, correção 4 (`1141f39f`): a marca sai com a conta; o verificador só lê | Nenhum (só `docs/adr` e a evidência da E01) |
| 5 | `689f4d84` | ADR 0009, correção 5 (`eb15163d`): o verificador provado por contadores | Nenhum |
| 6 | `798e279f` | ADR 0009, correção 6 (`348e21af`): o verificador é a leitora separada, conferida por lista permitida | Nenhum |
| 7 | `3b4c0690` | Portão: a leitora de `origens_de_conta` por lista permitida (autorizado pelo orquestrador) | Nenhum; evidência em `docs/evidencias-v2/G03/V2-F03-E08-parte-0G/leitora/` |
| 8 | este commit | 1B corrigida, `origin/trab/f03-1b-e15-pessoas` em `037ab8ab` (V2-F03-E15), no desenho da ADR 0009 com as correções 1 a 6 | Texto: `baseline.mjs`, `README.md`, `COLOCAR-DE-PE.md` e `RESTORE-DO-BANCO.md` (54 migrações, 001 a 054). Ajustes de conteúdo abaixo |

As correções 4, 5 e 6 da ADR chegaram durante a junção, por mensagens do orquestrador; a junção da 1B foi refeita por cima de cada uma (sem push, sem reescrever commit já feito). As três entram como três merges, e o resultado é o da ponta `348e21af`.

**Ajustes da 1B na junção (a diferença inteira contra `037ab8ab` em `saidas/21-diff-da-1b-na-juncao.diff.txt`):**

- **Portão novo da 0G** (`db/test/catalogo/f03-e15.ts`): `gatilhoEm`, `gatilhos` (o texto de `docs/evidencias-v2/G03/V2-F03-E08-parte-0G/correcao-1/saidas/16-juncao-f03-e15.diff.txt`, com os gatilhos redistribuídos pela correção 6), `semearParaProva` (correção 2 da 0G), `semMunicipio` em `pessoas` (global, `fica`) e em `origens_de_conta` (protegida, `some`, correção 4; a correção 1 da 0G preserva o regime numa redefinição, então nasce certo já na E15), ambas com `semearOutroMunicipio`; `usuarios_pessoa_id_fkey` em `chavesParaGlobais` com `colunasReferenciadas`; `privilegiosDeColuna` (UPDATE com as 12 colunas de antes e INSERT com 14, sem `pessoa_id`).
- **A 054** (nunca aplicada fora de teste): `REVOKE INSERT` de tabela e `GRANT INSERT` por coluna sem `pessoa_id`; a chave `usuarios_pessoa_id_fkey` (NO ACTION, depois do backfill); a ESCRITORA `conta_ganha_pessoa` fica só com o `BEFORE INSERT` (`usuarios_ganha_pessoa`) e o novo `AFTER DELETE` (`usuarios_marca_sai_com_a_conta`, que apaga só `WHERE usuario_id = OLD.id`); a LEITORA nova `conferir_origem_da_conta()` (SECURITY DEFINER, `search_path = pg_catalog, public, pg_temp`, `REVOKE ALL FROM PUBLIC`, sem GRANT) executa `usuarios_origem_da_pessoa` (adiado, de linha) e `usuarios_nenhuma_pessoa_sem_conta` (de comando), com o corpo da especificação da correção 6; a trava de `origens_de_conta` recusa UPDATE e TRUNCATE sempre e DELETE de marca de conta viva (`marca_so_sai_com_a_conta`, comum, que recusa também quem não enxerga todas as contas: falha fechada); cabeçalho (itens 2, 7, 11, a, b, c, C1, C4) e `COMMENT`s reescritos. O `desfazer` acompanha.
- **`db/test/pessoas.test.ts`** (86 para 96 casos): o `pessoa_id` informado pelo app é recusado por PRIVILÉGIO; o gatilho do estado final troca para pessoa que existe (com a chave, um uuid qualquer cairia na chave antes); o privilégio de INSERT por coluna; `usuarios_papel_nao_se_converte` (053) fora da lista das funções de gatilho da 054; a leitora no inventário; o aviso de pulo dos casos de Postgres real (material guardado); e os blocos novos:
  - correção 4 (5 casos): a conta apagada leva só a sua marca, as outras ficam iguais valor por valor; marca de conta viva não se apaga, nem pelo dono, e UPDATE e TRUNCATE continuam recusados; falha fechada para papel sem BYPASSRLS; conta inserida e apagada na mesma transação (a marca sai com ela e o verificador recusa no fim, falha fechada); a eliminação de verdade numa cópia, com o destino `some` e o outro município intacto;
  - correção 6 (4 casos em PGlite e 1 em Postgres real): os gatilhos no catálogo do banco; a leitora real na lista permitida, com o `proconfig` e sem EXECUTE; os contadores da transação (`pg_stat_xact_user_tables` e, por sequência, `last_value` e `is_called` lidos da própria sequência) iguais antes e depois de `SET CONSTRAINTS usuarios_origem_da_pessoa IMMEDIATE` no caminho que passa e nos dois que recusam; as sete sabotagens (todas reprovadas pela lista permitida; as que escrevem em tabela ou sequência, também pelos contadores; `pg_notify`, `pg_advisory_lock` e `set_config` NÃO aparecem nos contadores, que é o que a lista permitida tira do alcance); e, em Postgres real, a diferença exata no `COMMIT` (`usuarios`, `pessoas` e `origens_de_conta` +1 inserção) e a sabotagem da marca temporária aparecendo nela.
- **`apps/api`**: o patch guardado (`pessoa_id` em `COLUNAS_QUE_NUNCA_SAEM`, 3 casos) sem mudança; chave `V2-F03-juncao-do-lote-1` na tabela da API.
- **Documentos**: `DICIONARIO-DE-DADOS.md` (INSERT por coluna, a chave, a marca que sai com a conta, a leitora), `inventario-da-credencial.md` da E15 (a escritora e a leitora), `RESTORE-DO-BANCO.md` (54).

**Medição dos contadores no PGlite.** Dentro da transação os contadores do PGlite refletem a escrita (as sabotagens que escrevem aparecem; a prova foi feita). Fora dela, o PGlite não descarrega as estatísticas em `pg_stat_user_tables` (conferido à parte: o acumulado fica em zero e o `pg_stat_xact_user_tables` acumula entre transações), então a medição no `COMMIT` roda só em Postgres real: no bloco de `DC360_POSTGRES_DE_PROVA` (o job `implantavel` do CI define a variável). Aqui ela rodou contra um PostgreSQL 18.3 local descartável (porta 55931, apagado no fim), três vezes seguidas, estável: `saidas/20-pessoas-com-postgres-real.txt` (96 de 96).

**Sabotagens da junção (temporárias, nunca commitadas; saída inteira em `sabotagens/`; arquivos rodados: `isolamento.test.ts`, `catalogo-nominal.test.ts` e `pessoas.test.ts`, 413 casos):**

| Sabotagem | O que faz | Resultado |
| --- | --- | --- |
| C0 | nenhuma | 403 passam, 10 pulados (Postgres real) |
| S1 | sem o gatilho `AFTER DELETE` da marca | reprova 12: a eliminação diz que as marcas SOMEM e ficaram; o disparo declarado; os casos da correção 4 |
| S2 | o ramo de DELETE sem filtro pela conta | reprova 10: a eliminação não chega ao fim (a trava recusa a marca de conta viva) e os casos da correção 4 |
| S3 | a trava deixa apagar marca de conta viva | reprova 2 (os casos do dono apagando marca viva) |
| S4 | a trava sem a falha fechada | reprova 1 (o papel sem BYPASSRLS) |
| S5 | o catálogo declara a marca `fica` | reprova 3 (a prova da eliminação diz que sumiram) |
| S6 | o verificador volta a ser ramo da escritora | reprova 45 ("ramo verificador em função escritora", o disparo declarado, e a função recusa o gatilho que não é dela) |
| S7 | a leitora sem o `search_path` fixo | reprova 2 (o `proconfig`) |
| L1 | `PERFORM pg_notify` na leitora | reprova 2, SÓ pela lista permitida (portão e `pessoas.test.ts`): sem ela, nenhum outro caso pegaria |
| L2 | `PERFORM pg_advisory_lock(1)` | reprova 4: a lista permitida, e dois casos da trava N2 que a trava consultiva de sessão esbarra |
| L3 | `PERFORM set_config` | reprova 2, SÓ pela lista permitida |
| L4 | `PERFORM nextval` (com uma sequência criada pela sabotagem) | reprova 6: a lista, os contadores, a recusa fora da tabela (a escrita aparece) e a volta da 054 |
| L5 | chamada a função do dono que escreve (`registrar_tentativa_login`) | reprova 5: a lista, os contadores e a recusa fora da tabela |
| L6 | marca temporária inserida e apagada | reprova 5: idem |
| L7 | a mesma escrita num bloco `EXCEPTION` | reprova 5: idem |

**Portões (de `dc360/`, depois da última junção; saídas em `saidas/`, códigos em `00-codigos.txt`):**

| Portão | Resultado |
| --- | --- |
| `npm run typecheck` | verde (`01`) |
| `npm run lint`, `lint:teto` (431, igual), `formato:conferir` | verdes (`02`, `03`, `04`) |
| `npm run conferir:numeros` e `node --test scripts/baseline.test.mjs` | verdes (`05`, `06`) |
| `npx vitest run packages/shared/test/regras-de-conteudo.test.ts` | 9 de 10; a falha é a aceita (EPERM em symlink, DV-46) (`07`) |
| `node scripts/auditar.mjs` | runtime limpo (`08`) |
| `npm run test:isolamento` | 820 casos: 796 passam, 16 pulados, 8 falham, todas de ambiente Windows aceitas (`desfazer-migracao` 5, `guarda-da-semente` 3) (`09`) |
| `npm test` (seis pacotes) | campo 283/283; shared 434/435 (DV-46); API 2313 passam, 34 pulados, 2 falham (`semear-homologacao`, ambiente aceito); console 379/379 no `npm test` (o `no-navegador.test.ts` estoura o `afterAll` sob carga e passa sozinho, 8/8, `10b`); painel 824/824; banco como acima (`10`) |
| `pessoas.test.ts` com Postgres real (PostgreSQL 18.3 local, descartável) | 96 de 96 (`20`) |
| `CI=true npm run test:scripts`, `conferir-indices-de-evidencia` e `gerar-estado --conferir` (raiz) | verdes (`11`, `12`, `13`) |
| `test:e2e:api` | não rodado (o CI cobre) |

## Justificativa

- **A 1B adota o portão e a ADR, e não o contrário.** A 0G entrou primeiro; as correções 4 a 6 da ADR entraram antes da 1B; a 1B se adaptou. A recusa do `pessoa_id` passa a ser de privilégio (decisão 1), a chave existe no banco, o destino das tabelas sem município é provado executando a eliminação, a marca sai com a conta que descreve, e o verificador é uma função que só lê, conferida por lista permitida e não por enumeração de efeitos.
- **A trava da marca enxerga todas as contas, ou recusa.** Quem apaga a marca sem BYPASSRLS veria zero contas e acharia que a conta não existe; por isso a trava recusa sem perguntar quando o RLS de `usuarios` vale para quem apaga.
- **Tenant da leitora: `antes_do_tenant`.** A leitora não chama `app_organizacao_atual()` (a lista permitida não deixa) e não precisa: a única chave é a conta que disparou o gatilho, já gravada sob o RLS de quem inseriu. O catálogo diz isso em `confere`.
- **Nenhum caso existente mudou de sentido sem razão.** Os ajustes de `pessoas.test.ts` medem o mesmo fato com o mecanismo novo.

## Limitações

- A medição no `COMMIT` só roda em Postgres real (PGlite não descarrega as estatísticas); no CI, no job `implantavel`.
- A lista permitida é sintática; o resíduo de operadores e conversões implícitos definidos por usuário é a DV-72.
- A sabotagem L2 deixa uma trava consultiva de sessão no PGlite e derruba dois casos da trava N2 por consequência; os casos da lista permitida reprovam por conta própria.

## Para o orquestrador

- **STATUS:** E15 IMPLEMENTADA (juntada no `v2/f03`, falta validação); E08 com a 0G (correções 1 e 2) e o portão da leitora juntados; E01 com as correções 4 a 6 juntadas; a 1C juntada.
- **Dívidas:** pagas DV-64, DV-66, DV-71; abertas DV-63, DV-65, DV-67 (mitigada), DV-68, DV-69, DV-70, DV-72.
- **Pendências humanas:** H97 cita `348e21af`; H118 atualizada; H135 nova.
- **Plano:** `plano-f03.md` (linhas da tabela protegida, 7A da E18 e a seção "Depois da junção do lote 1").
