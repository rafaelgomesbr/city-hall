# V2-F01-E22, correção 1: PostGIS disponível não é criável, herança de papéis e âncora TLS

Origem: revisão independente da F01 (Codex), itens 3 (BLOQUEIA), 6 e 7 (DÍVIDA) do relatório C.

## Fatos

### Item 3: o verde de PROD não provava capacidade de criar (BLOQUEIA, confirmado e consertado no que é do repositório)

- **O defeito, confirmado lendo `dc360/scripts/conferir-extensoes.mjs`:** com a extensão disponível e não instalada, `avaliarExtensoes` em PROD só avisava "nasce na F32" e aprovava, sem conferir se o papel de setup pode `CREATE EXTENSION`.
- **Conserto:** nova consulta `CONSULTAS.criacao` (só leitura): `rolsuper`, dono do banco (`pg_has_role` sobre `datdba`), `has_database_privilege(..., 'CREATE')` (o `'CREATE'` entra como parâmetro, para o teste "nenhuma consulta escreve" continuar valendo) e `trusted` da versão padrão da extensão (Postgres 13 ou mais). `coletarFatos` pergunta isso quando a extensão está disponível e não instalada. `avaliarExtensoes` REPROVA (HML e PROD) quando o papel não é superusuário, não é dono e não tem `CREATE` no banco, e reprova fato sem `criacao` (não se aprova no silêncio). Com `CREATE` mas sem ser superusuário e com a extensão não confiável, AVISA (no Postgres comum só superusuário cria; o Supabase libera por fora, o que só se confirma tentando).
- **Sonda sintética (sem banco, sem rede, sem segredo):** o mesmo fato (`disponivel`, `instalada: null`, papel sem poder criar) em PROD. Antes: `saidas/01-antes-sonda-papel-sem-poder-criar.txt` (`problemas: []`, aprovado). Depois: `saidas/02-depois-sonda-papel-sem-poder-criar.txt` (1 problema, cita o CP-44).
- **Testes** em `dc360/scripts/conferir-extensoes.test.mjs`: avaliação (sem poder reprova em PROD e em HML, `CREATE` sem superusuário avisa, superusuário passa, sem `criacao` reprova), coleta (o parâmetro `CREATE` e o formato dos fatos) e a consulta num Postgres real do PGlite (superusuário vê tudo; um papel comum sem `CREATE` no banco vê `false`; com `GRANT CREATE` passa a `true`). Saída: `saidas/03-depois-extensoes-teste.txt` (36 passam, 0 falham).
- **O que continua pendente e NÃO inventei:** a confirmação com o provedor (CP-44). `dc360/docs/AMBIENTES.md` ainda tem HML como "A PREENCHER" e PROD como "não instalada até a F32". Nada foi feito no Supabase.

### Item 6: privilégio herdado por associação de papéis (DÍVIDA, confirmado e consertado)

- **O defeito, confirmado lendo a consulta `exposicao` e o bloco de `db/provedores/supabase-endurecer.sql`:** a consulta explodia a ACL e filtrava `grantee` igual a PUBLIC ou a um dos três papéis; um papel intermediário com `EXECUTE`, de que `anon` é membro, abria a porta por herança sem aparecer. O endurecimento revogava só de PUBLIC e dos três.
- **Conserto na conferência:** `exposicao` agora pergunta o privilégio EFETIVO dos três papéis com `has_function_privilege`, `has_table_privilege` e `has_sequence_privilege` (que contam herança), mantendo PUBLIC pela ACL (não existe papel para perguntar). Para não duplicar ruído, um dos três só ganha linha própria quando o privilégio dele não é só o de PUBLIC (que já tem a sua) ou quando a ACL o cita direto. Os privilégios de tabela e de sequência entram como parâmetros `$2` e `$3`, e o objeto é contado por `oid` (antes contava uma linha por privilégio explodido).
- **Conserto no endurecimento:** dentro do laço de objetos, depois de revogar de PUBLIC e dos três, o bloco revoga `ALL` de cada papel com concessão direta no objeto de que algum dos três é membro e herda (`pg_has_role(..., 'USAGE')`), poupando o dono do objeto, o papel de setup e `dc360_app`. Continua idempotente e continua tolerando `insufficient_privilege` com `WARNING`.
- **Testes:** "privilégio herdado por papel intermediário" roda no PGlite com `pg_trgm` no lugar do PostGIS: prova a premissa (a ACL não cita nenhum dos três), a consulta nova acusa `anon`, o bloco endurecido tira a concessão do intermediário, `anon` fica limpo e `dc360_app` mantém o mínimo. Outro caso garante que o que só PUBLIC concede não vira linha repetida dos três papéis. O teste existente de coleta teve a asserção dos parâmetros de `exposicao` atualizada para os três parâmetros novos. `db/test/endurecer-extensao.test.ts` (9 casos, o bloco inteiro): `saidas/04-depois-endurecer-extensao-vitest.txt`.
- **Não pude rodar** o teste espacial em PostGIS real (`postgis-provedor.espacial.test.ts`): não há Postgres neste ambiente. Reli os 7 passos dele contra a consulta nova (o passo 3 espera a linha de PUBLIC, o passo 6 espera `anon tem privilégio em 1 objeto`, o passo 7 roda com o papel da aplicação): todos seguem coerentes, mas quem confirma é o job `implantavel`.

### Item 7: a conferência não aplicava a âncora TLS do migrador (DÍVIDA, confirmado e consertado)

- **O defeito, confirmado comparando `consultarNoBanco` com `dc360/db/src/cli.ts` e `conexao.ts`:** a conferência fazia `new pg.Client({ connectionString: url })` direto, sem `urlComAncoraDeConfianca`; `sslmode=verify-full` sem `sslrootcert` morre com `SELF_SIGNED_CERT_IN_CHAIN` contra o Supabase (documentado em `conexao.ts`).
- **Conserto:** `urlParaConferencia(url)` carrega a MESMA função compilada do migrador (`../db/dist/conexao.js`) e a aplica; `consultarNoBanco` conecta com ela. Sem a compilação, falha pedindo `npm run build:shared`, em vez de conectar sem âncora. Não copiei a lógica.
- **Testes:** `verify-full` sem `sslrootcert` ganha a raiz do repositório e o resto da URL fica igual; sem `sslmode` que verifica, com `sslrootcert` já escrito ou com `disable` a URL não muda; a função usada é a do migrador (igualdade com `urlComAncoraDeConfianca` real, e o fonte conecta por `urlParaConferencia`); sem a compilação, recusa com a instrução.
- `dc360/docs/AMBIENTES.md` ganhou a descrição da capacidade de criar, do aviso do provedor e do pré-requisito `build:shared`.

## Justificativa

- Disponível não é criável: o CP-44 pergunta as duas coisas, e a conferência só respondia a primeira. Reprovar em PROD sem privilégio nenhum e avisar quando só o provedor pode dizer separa o que o repositório consegue provar do que depende do plano contratado.
- O privilégio efetivo é o que o PostgREST enxerga; a ACL é só uma das fontes.

## Pendências humanas (não se resolvem no código)

- **CP-44:** confirmar com o provedor que o papel de setup cria `postgis` em HML e em PROD (e registrar a versão em `AMBIENTES.md`, hoje "A PREENCHER"). A conferência nova fecha a parte que se prova com o catálogo; o `supautils` do Supabase continua dependendo de tentar em HML.
