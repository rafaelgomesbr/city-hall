# ADR 0002: trilha de auditoria append-only por ausência de policy, não por gatilho

- **Data da decisão:** 21/08/2026 (registro escrito em 25/08/2026)
- **Situação:** aceita, em vigor
- **Depende de:** ADR 0001 (sem RLS forçada, esta decisão não funciona)

## Contexto

A trilha (`trilha_eventos`) é a prova de quem fez o quê e quando. Ela sustenta o
laudo, o termo de interdição e a resposta do município a uma cobrança futura do
tipo "a prefeitura não fez nada". Uma trilha que pode ser reescrita não prova
nada: se o histórico é editável, ele vale o mesmo que a memória de quem editou.

A forma usual de proteger histórico em banco é um gatilho `BEFORE UPDATE OR
DELETE` que levanta exceção. Funciona, e tem um problema: gatilho é código, e
código se desabilita. `ALTER TABLE ... DISABLE TRIGGER` é uma linha, e ela não
aparece em diff nenhum se for rodada direto no banco de produção.

## Decisão

A trilha é append-only pela **ausência** de policy, e não por gatilho.

`trilha_eventos` tem policy de `SELECT` e policy de `INSERT`, e nenhuma de
`UPDATE` nem de `DELETE`. Com `FORCE ROW LEVEL SECURITY` ativa, a ausência de
policy **nega** a operação. Além disso, o `GRANT` para `dc360_app` concede
apenas `SELECT, INSERT` nessa tabela.

São duas negativas independentes: mesmo que alguém acrescentasse uma policy de
UPDATE por engano, faltaria o privilégio; mesmo que concedesse o privilégio,
faltaria a policy.

A consequência de produto: **correção entra como evento novo.** Não existe
"editar evento". A mesma regra vale para `exportacoes` (migração 007), que
registra quem levou dado pessoal para fora do sistema.

## Consequências

Boas:

- Não há código para desabilitar. Reverter isto exige uma migração escrita,
  revisada e versionada, que é exatamente o atrito que se quer.
- Nem a aplicação reescreve histórico, nem por bug nem de propósito.
- O evento é gravado na mesma transação da mudança que o gerou. Se o evento
  falta, é porque a mudança não aconteceu: a trilha não é um registro paralelo
  que pode divergir do fato.

Ruins, e elas foram aceitas de olhos abertos:

- **Não dá para corrigir um evento errado.** Um nome digitado errado no campo de
  autoria fica lá para sempre, com um evento novo ao lado dizendo outra coisa.
  Isso é o desenho, não um defeito, mas incomoda quem espera um CRUD.
- **A tabela só cresce.** Não há expurgo, e não haverá sem uma decisão nova. Em
  um município com anos de operação isso é um custo de armazenamento que hoje
  ninguém mediu.
- Isso colide com o direito de eliminação de dado pessoal previsto na
  Lei 13.709/2018. A saída correta é anonimizar o titular, não apagar o evento,
  e essa anonimização **ainda não existe** (ver ADR 0008).
- A garantia é feita de uma ausência, e ausência é invisível em revisão de
  código: quem lê a migração vê duas policies e precisa saber que a falta das
  outras duas é o ponto. Daí o comentário no próprio SQL e o teste nomeado.

## Alternativas descartadas

| Alternativa | Por que não |
| --- | --- |
| Gatilho `BEFORE UPDATE OR DELETE` que levanta exceção | Gatilho se desabilita com uma linha, e a linha não deixa rastro no repositório. |
| Coluna `versao` com histórico versionado | Reescrita passa a ser possível e legítima; a discussão sobre qual versão vale acontece justamente na hora em que a prova importa. |
| Trilha em serviço externo (log agregado, bucket append-only) | Deixaria de ser gravada na mesma transação da mudança, e trilha que pode divergir do fato não é trilha. Acrescenta um fornecedor a mais para um produto de uma pessoa. |
| Confiar na aplicação para nunca emitir UPDATE | É exatamente o modelo que o ADR 0001 recusou para isolamento. Não faria sentido recusar lá e aceitar aqui. |

## Onde isto vive

- Implementa: `dc360/db/migrations/001_base.sql` (criação de `trilha_eventos`,
  as duas policies e o `GRANT SELECT, INSERT`),
  `dc360/db/migrations/007_registro_de_exportacao.sql` (mesma forma para
  `exportacoes`).
- Defende: `dc360/db/test/isolamento.test.ts`, bloco "Trilha auditável é
  append-only", que aceita inserção e exige recusa de alteração e de exclusão.
- Consome: `dc360/apps/api/src/trilha.ts` e a tela de auditoria em
  `dc360/apps/web/src/paginas/Auditoria.tsx`.
