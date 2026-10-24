# Voltas das migrações

Aqui mora o caminho de volta de cada migração nova: `NNN_nome.sql`, com o MESMO
nome do arquivo de `db/migrations` que ele desfaz. O aplicador não lê esta
pasta: `carregarMigracoes` só lê `.sql` direto de `db/migrations`.

Regra (V2-F01-E18, conferida por `db/test/migracoes-regras.test.ts`):

- toda migração fora da lista `MIGRACOES_ISENTAS_DE_DESFAZER`
  (`db/src/regras-de-migracao.ts`, as 001 a 051) traz o seu arquivo aqui; ou
- declara, nas primeiras linhas do próprio arquivo da migração:
  `-- IRREVERSIVEL: motivo; aprovado por NOME; AAAA-MM-DD`.

Uso: `npm run migrar -- --desfazer` desfaz só a ÚLTIMA migração aplicada e se
recusa em produção (`AMBIENTE_DC360=prod`, `NODE_ENV=production` ou URL com a
identidade de um banco de PRODUÇÃO). Desfazer apaga dado. Em produção, o caminho
de volta é uma migração nova (aditiva) ou restaurar a cópia.

Escreva a volta para o estado que a migração deixou, não para um estado
imaginado, e prove-a: aplicar, desfazer e reaplicar precisa deixar o
`information_schema` idêntico.
