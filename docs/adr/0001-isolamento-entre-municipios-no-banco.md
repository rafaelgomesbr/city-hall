# ADR 0001: isolamento entre municípios no banco, não na aplicação

- **Data da decisão:** 21/08/2026 (registro escrito em 25/08/2026)
- **Situação:** aceita, em vigor
- **Escopo:** `dc360/` (o produto real). Não se aplica ao protótipo em `mockup/`.

## Contexto

O DC360 é um SaaS para várias prefeituras dentro do mesmo banco. O pior defeito
possível deste produto não é ficar fora do ar: é dado de uma prefeitura aparecer
na tela de outra. Isso queima o contrato, é incidente de dado pessoal e é
irreversível, porque não se desfaz o que a outra pessoa já leu.

O jeito comum de resolver isso é filtrar por `organizacao_id` no `WHERE` de cada
consulta. Esse jeito depende de o desenvolvedor lembrar em cada consulta, para
sempre, inclusive na consulta escrita às duas da manhã para consertar produção.
Uma consulta esquecida basta.

O levantamento técnico (seção 4.3) já apontava banco único com RLS. Faltava
decidir se a RLS seria a garantia real ou uma segunda camada decorativa por trás
de um filtro de aplicação.

## Decisão

O isolamento é imposto pelo banco, e a aplicação não tem como escapar dele:

1. Toda tabela de negócio tem coluna `organizacao_id` obrigatória.
2. Toda tabela tem `ENABLE` **e** `FORCE ROW LEVEL SECURITY`. Sem `FORCE`, o
   dono da tabela ignora a policy, e o dono é quem aplica migração.
3. A policy compara com `app_organizacao_atual()`, que lê
   `current_setting('app.organizacao_atual')`.
4. Esse valor é definido por `SET LOCAL` no início de cada transação, sempre a
   partir do token já verificado, nunca de cabeçalho, parâmetro de rota ou corpo
   da requisição.
5. A aplicação conecta com o papel `dc360_app`, que não é superusuário e não é
   dono de tabela nenhuma. Superusuário e dono ignoram RLS.
6. Chave estrangeira entre tabelas de negócio é composta, com `organizacao_id`
   dos dois lados (migração 008). RLS governa SELECT, INSERT, UPDATE e DELETE,
   mas **não** governa a verificação de chave estrangeira, que o Postgres faz
   por baixo da policy.

## Consequências

Boas:

- Consulta sem `WHERE organizacao_id` continua devolvendo só o município certo.
  A garantia deixa de depender de memória.
- Em auditoria isso é prova, não promessa: dá para mostrar a policy.
- O mesmo contrato vale no painel em modo local e na API, porque as migrações
  são o mesmo arquivo (ver ADR 0003).

Ruins, e elas são reais:

- **Toda leitura e toda escrita precisam estar dentro de uma transação** com o
  `SET LOCAL` feito. Esquecer não vaza dado, mas quebra a consulta, e o erro
  ("app.organizacao_atual nao definido") só faz sentido para quem conhece a
  regra.
- `SET LOCAL` pertence à conexão, não à chamada. Em ambiente de conexão única
  (o PGlite do modo local), duas transações concorrentes trocam de contexto uma
  com a outra. Isso já aconteceu aqui, e foi reproduzido nos dois desfechos:
  dado de um município aparecendo para outro, e o papel voltando para
  `postgres`. A correção foi obrigar tudo a passar por `db.transaction()`, que
  retém o mutex do bloco inteiro.
- Login e renovação de sessão acontecem **antes** de existir contexto de tenant,
  então precisam ler tabelas protegidas. Isso obrigou a criar funções
  `SECURITY DEFINER`, que são portas abertas na parede. Cada uma responde uma
  pergunta por igualdade, sem filtro livre, com `search_path` fixo e `EXECUTE`
  revogado de `PUBLIC`. O portão limita quantas podem existir.
- A chave estrangeira composta exige uma restrição de unicidade em
  `(organizacao_id, id)`, redundante com a chave primária. É custo de índice
  pago em troca da garantia.

## Alternativas descartadas

| Alternativa | Por que não |
| --- | --- |
| Filtro por `organizacao_id` só na aplicação | Depende de lembrar em cada consulta. A primeira falha é silenciosa e definitiva. |
| Um banco (ou um schema) por município | Migração passa a ser N migrações, e a operação vira o gargalo. Não cabe em um desenvolvedor. |
| RLS habilitada mas não forçada | O dono das tabelas ignora a policy, e é com o dono que a migração roda. A garantia teria um buraco do tamanho do próprio deploy. |
| Um papel de banco por município | O número de papéis cresce com o número de clientes, e o pool de conexões deixa de ser compartilhável. |

## Onde isto vive

- Implementa: `dc360/db/migrations/001_base.sql` (papel, função de contexto,
  policies), `dc360/db/migrations/008_chaves_coerentes_por_municipio.sql`
  (chaves estrangeiras compostas).
- Defende: `dc360/db/test/isolamento.test.ts`, o portão CA-06. Ele não confere
  uma lista escrita à mão: pergunta ao banco quais tabelas existem e exige a
  invariante de todas, inclusive das que ainda não foram criadas.
- A API tem o espelho disso em `dc360/apps/api/src/banco/postgres.ts` e a regra
  de resposta 404 (nunca 403) para recurso de outro município.
