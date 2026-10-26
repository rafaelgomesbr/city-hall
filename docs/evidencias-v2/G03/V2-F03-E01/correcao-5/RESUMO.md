# V2-F03-E01, correção 5: verificador adiado provado sem escrita por contadores da transação

**Base:** `origin/trab/f03-0a-e01-adr` em `1141f39f` (correção 4). Só documento: a ADR 0009 e esta pasta. Nenhum
código, migração, teste ou `package.json`. CLAUDE.md, STATUS, ESTADO-ATUAL, `dividas.md`, `pendencias-humanas.md` e o
`plano-f03.md` não foram tocados. Situação da ADR continua PROPOSTA. A proposta de redação do CLAUDE.md não mudou:
vale a da correção 2.

**Entrada:** quinta rodada da revisão de segurança sobre `1141f39f` (Codex, somente leitura). Eliminação: FECHADO no
desenho (sem mudança). Leitor: PARCIAL, com um IMPEDE: comparar o conteúdo de `origens_de_conta` antes e depois não
prova ausência de escrita, porque o ramo verificador da função compartilhada poderia inserir uma marca temporária
para um id sem conta e apagá-la (a trava nova permite esse DELETE e a tabela final fica igual); a conferência textual
só alcança a leitora separada. NOTA: fechamento de desenho não valida implementação (sem mudança).

## O que mudou

| # | Ponto | O que mudou | Onde na ADR |
| --- | --- | --- | --- |
| 1 | IMPEDE: a prova por conteúdo não pega marca temporária inserida e apagada | A prova passa a ser por CONTADORES de escrita da transação: antes e depois de disparar o adiado com `SET CONSTRAINTS usuarios_origem_da_pessoa IMMEDIATE`, nos caminhos que passam e nos que recusam, `n_tup_ins`, `n_tup_upd` e `n_tup_del` de `pg_stat_xact_user_tables` de toda tabela de usuário e o `last_value` de toda sequência ficam iguais. Na confirmação, a diferença dos contadores acumulados é exatamente a escrita do criador. Sabotagem obrigatória: ramo verificador que insere e apaga marca temporária (e a variante dentro de bloco `EXCEPTION` desfeito) reprova. Se a contagem não for confiável no ambiente, só a leitora separada, com a proibição textual, é aceita | Decisão 1, condição 4 do leitor e o bloco novo "A prova de que o verificador não escreve é por CONTADORES"; decisão 8 (catálogo); consequências E15; testes 0B, E15 e E10; alternativas; contexto, estado e aceite, onde isto vive |

A opção de o verificador ser um RAMO da função do criador (o que a 1B implementa) continua aceita, agora condicionada
à prova por contadores com a sabotagem reprovando. O contador da transação conta também a linha desfeita, e é a
técnica que o portão da 0G já usa na recusa comportamental das funções de gatilho
(`origin/trab/f03-0g-extensao-do-portao`, `docs/evidencias-v2/G03/V2-F03-E08-parte-0G/correcao-1/RESUMO.md`, item 6,
`provarRecusaForaDaTabela`).

Trecho central (decisão 1):

> **A prova de que o verificador não escreve é por CONTADORES de escrita da transação, não por conteúdo (correção
> 5).** Comparar o conteúdo da tabela antes e depois não basta: um ramo verificador que inserisse uma marca temporária
> para um id sem conta e a apagasse em seguida deixaria a tabela igual, e a trava de permanência deixa apagar marca de
> id sem conta.

e o fallback:

> **se a contagem não for confiável no ambiente** (o que a própria sabotagem mostra, se passar), o ramo dentro da
> função do criador deixa de ser aceito: a saída é a leitora separada, sujeita à proibição textual da condição 1.

## Para o orquestrador

**H97.** Mesma instrução da correção 4, com o SHA desta: o aceite vale para a ADR corrigida em `<SHA do commit da
correção 5>` (correção 5, depois da quinta rodada da revisão de segurança) e para a proposta de redação do CLAUDE.md
da correção 2, que continua valendo.

**Junção da 1B, teste D2 (substitui o item 5 da correção 4 na parte do verificador).** Texto a acrescentar em
`dc360/db/test/pessoas.test.ts`:

1. "O verificador adiado não escreve, por contadores (ADR 0009, decisão 1, correção 5)": numa transação, como
   `dc360_app` no município, `INSERT INTO usuarios` sem `pessoa_id`; `SAVEPOINT antes_do_adiado`; ler, como dono,
   `SELECT relname, n_tup_ins, n_tup_upd, n_tup_del FROM pg_stat_xact_user_tables ORDER BY relname` e
   `SELECT schemaname, sequencename, last_value FROM pg_sequences ORDER BY 1, 2`; `SET CONSTRAINTS
   usuarios_origem_da_pessoa IMMEDIATE`; ler de novo; exigir as duas leituras iguais, linha por linha.
2. Os mesmos passos em cada caminho que recusa que a suíte da 1B já monta (no mínimo o `BEFORE INSERT` de teste que
   roda depois do criador e troca o `pessoa_id`, que deixa a marca com outra pessoa; e, onde a suíte já monta, marca
   ausente e marca de outra transação). O disparo dá o erro do adiado; `ROLLBACK TO SAVEPOINT antes_do_adiado`; ler
   de novo; exigir igual à leitura de antes do disparo.
3. "Na confirmação": em transação própria, sem `SET CONSTRAINTS`, ler `pg_stat_user_tables` depois de
   `SELECT pg_stat_force_next_flush()` e `SELECT pg_stat_clear_snapshot()`, inserir a conta, `COMMIT`, descarregar e
   limpar de novo, ler; exigir a diferença exata `usuarios` +1 inserção, `pessoas` +1, `origens_de_conta` +1, zero
   atualização e zero remoção nas três, nenhuma outra tabela com diferença e nenhuma sequência a mais. O mesmo no
   caminho que recusa na confirmação (a escrita desfeita também conta: mesma diferença).
4. Sabotagem obrigatória, arquivada com a saída "antes" (o teste passa sem a prova por contadores, ou com a prova
   por conteúdo) e "depois" (reprova): uma cópia de `conta_ganha_pessoa` cujo ramo `AFTER ROW` insere
   `INSERT INTO origens_de_conta (usuario_id, pessoa_id, origem, transacao) VALUES (gen_random_uuid(),
   gen_random_uuid(), 'criador', pg_current_xact_id())` e apaga essa linha antes de devolver; e a variante com a
   mesma escrita dentro de `BEGIN ... EXCEPTION WHEN OTHERS THEN NULL; END` que força erro depois de escrever. As
   duas reprovam o item 1.
5. Se no PGlite do portão os contadores da transação ou a descarga não refletirem a escrita (a sabotagem do item 4
   passa), parar e registrar: a ADR manda separar o verificador numa função LEITORA com a proibição textual, e isso
   muda a 054 e o catálogo (`conferirQuemCitaOrigensDeConta` passa a conhecer a leitora).

Os demais itens da junção da 1B listados na correção 4 (destino `some`, gatilho de DELETE, trava de permanência,
cabeçalho e comentário da 054, testes de eliminação) continuam valendo sem mudança.

**0B e 0D.** O portão ganha a mesma prova por contadores para o verificador declarado (ramo ou leitora) e a sabotagem
da marca temporária reprovando. Na linha 0B e 0D do bloco "Tabela protegida `origens_de_conta`" do plano, acrescentar
"e o verificador provado sem escrita por contadores de escrita da transação, com a sabotagem da marca temporária
(correção 5)".

## Portões (saídas nesta pasta)

- `regras-de-conteudo.txt`: `npx vitest run packages/shared/test/regras-de-conteudo.test.ts` em `dc360/` depois de
  `npm ci --ignore-scripts`; o único reprovado admitido é o EPERM de symlink do Windows (DV-46).
- `gerar-estado.txt`: `node scripts/roadmap/gerar-estado.mjs --conferir` da raiz.
- `node dc360/scripts/conferir-indices-de-evidencia.mjs` da raiz, depois das linhas novas no `INDEX.md` da etapa.
- `dc360/node_modules` apagado depois dos portões.
