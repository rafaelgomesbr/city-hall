# Pendências conhecidas da API

O que está escrito aqui é defeito reproduzido ou risco identificado que **não**
foi corrigido, com o detalhe suficiente para alguém atacar sem repetir a
investigação. Item que já tem correção sai daqui e vira teste.

## O pacote de saída lê TODAS as tabelas em memória, e a rota promete o contrário

**Onde:** `src/saida/pacote.ts` (o bloco `banco.comTenant` que monta `dados`) e
`src/rotas/saida.ts` por volta da linha 145.

**O que acontece:** `montarPacoteDeSaida` abre uma transação e faz
`SELECT <colunas> FROM <tabela> ORDER BY ...` **sem `LIMIT` nenhum** para cada
uma das vinte e poucas tabelas de `TABELAS_DA_SAIDA`, e guarda todas as linhas
em `tabelas[].linhas`, na memória do processo, antes de o primeiro byte do ZIP
sair. Depois disso vêm as consultas de ocorrências, vistorias, evidências,
providências e ofícios, também inteiras. Só as fotografias são buscadas em
fluxo, uma a uma, e essas já estão corrigidas.

**A promessa que isso contradiz:** o comentário da rota diz, com todas as
letras, que a resposta vai em fluxo porque "montar antes para saber
significaria segurar o pacote inteiro na memória do processo. Um município com
dez mil vistorias derrubaria o servidor no dia em que pedisse para sair, que é
o pior dia possível para o servidor cair". O comportamento é o inverso do texto:
o que está em memória não é o ZIP, mas é a base inteira do município em linhas
de JavaScript, que é maior que o ZIP.

**Por que importa:** a máquina do Fly tem 1 GB (ver `fly.toml`), e o Chromium do
PDF já ocupa parte disso. `trilha_eventos` e `trilha_administrativa` são as
tabelas que mais crescem, porque a trilha é append-only por decisão de projeto:
elas nunca encolhem. Um município com três anos de operação derruba o processo
por falta de memória exatamente no dia da saída, e o sintoma que o município vê
é o download que começa e morre no meio, sem mensagem. Pior: o processo que cai
leva junto o plantão de quem estava usando o sistema.

**Como atacar:** paginar por cursor (`WHERE id > $ultimo ORDER BY id LIMIT n`) e
emitir CSV e JSON linha a linha, `yield` a cada página, em vez de acumular. Duas
restrições que não podem cair no caminho:

1. A ordem tem que continuar estável entre duas extrações, senão a conferência
   do passo 5 do procedimento deixa de valer (é por isso que existe o `ORDER BY`
   explícito hoje).
2. O JSON precisa continuar sendo um documento válido, então o `[` e o `]` saem
   fora do laço e a vírgula é decidida por posição.

A transação pode continuar existindo, e continua fechando antes das
fotografias: o problema não é ela, é acumular o resultado.

**Ainda não medido:** quantos megabytes um município de três anos produz de
verdade. Sem essa medida, qualquer teto escolhido é chute. O caminho mais barato
para medir é gerar carga sintética com o que já existe em `db/test/carga.test.ts`
e observar o processo.
