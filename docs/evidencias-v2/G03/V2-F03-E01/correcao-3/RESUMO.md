# V2-F03-E01, correção 3: origem protegida do `pessoa_id` e escopo das regras de trava

**Base:** `origin/trab/f03-0a-e01-adr` em `4d64a69a` (correção 2). Só documento: a ADR 0009 e esta pasta. Nenhum
código, migração ou `package.json`. CLAUDE.md, STATUS, ESTADO-ATUAL, `dividas.md`, `pendencias-humanas.md` e o
`plano-f03.md` não foram tocados. Situação da ADR continua PROPOSTA. A proposta de redação do CLAUDE.md não mudou:
vale a da correção 2.

**Entrada:** terceira rodada da revisão de segurança sobre `4d64a69a` (Codex, somente leitura). Dois pontos
impedindo o aceite e uma observação; todos procedem e só eles foram tratados.

## Os dois pontos e a observação

| # | Ponto | O que mudou | Onde na ADR |
| --- | --- | --- | --- |
| 1 | O gatilho adiado (constraint trigger, `AFTER ROW`) vê o estado final e não distingue o `pessoa_id` criado pelo gatilho criador do informado pelo chamador | A origem passa a ser gravada por quem produz o valor, na tabela `origens_de_conta` (E15): uma linha por conta, com `origem` (`backfill`, `criador`, `aceite`), `pessoa_id`, `convite_id` e `transacao` (`pg_current_xact_id()`). O `dc360_app` não tem privilégio nenhum nela; só gravam a função do gatilho criador, `aceitar_convite` (antes do INSERT da conta) e o backfill, e o catálogo da 0B reprova outra função privilegiada que a cite. Variável de sessão foi descartada porque o `dc360_app` define `dc360.*` por `set_config`. O `BEFORE INSERT` recusa na hora `pessoa_id` informado sem a marca `aceite` da mesma transação; o adiado confere marca, transação, pessoa da linha final e, no `aceite`, o convite consumido. Na E15 só há `backfill` e `criador`; a E10 (058) aceita `aceite` e tira do `dc360_app` as colunas de estado e ligação do convite. Testes positivos e negativos na E15, na E10 e na 0B | Decisão 1 (itens da criação da conta; subseção nova "De onde veio o `pessoa_id`"); "A conta nasce no aceite"; consequências E10 e E15; testes 0B, E15 e E10; proibido; alternativas; estado e aceite |
| 2 | Regra 3 (N2 para escrever `pessoas`) contradiz o espelho dos passos 1 e 2; regra 6 contradiz a desativação e a reativação locais | Regra 3 por cláusula: `ativo` de conta desde a E09; criação de conta para pessoa existente só no aceite (E10); escrita direta em linha existente de `pessoas` a partir da E08, com o espelho dos passos 1 e 2 como exceção explícita (N3 para N4, sem N2, já na tabela de caminhos); pessoa nova por INSERT segue a regra 7. Regra 6 restrita aos caminhos globais (senha, recuperação, redefinição no período um para um, segundo fator, tentativa de login); desativação e reativação locais (N3, depois N4 pelo gatilho) dentro da ordem. Sem exceção nova; N3 antes de N4 mantido | Decisão 7, regras 3 e 6; linha "as mesmas, nos passos 1 e 2" da tabela de caminhos |
| Obs. | O teste de tempo não tem estabilidade de CI demonstrada | Uma linha: a prova estrutural é a principal; o teste de tempo não é prova absoluta (em especial na E09); a etapa caracteriza o ambiente e demonstra a estabilidade do critério antes de torná-lo obrigatório no CI | Decisão 3, "Como se prova" |

Mais a seção de contexto "O que a terceira rodada da revisão mudou (correção 3)" e o caminho desta pasta em "Onde
isto vive".

## Nota sobre a frase do RESUMO da correção 2

O RESUMO da correção 2 (seção "Para o orquestrador", item 5, 1B) diz que, na E15, o gatilho adiado "recusa TODA conta
inserida com `pessoa_id` preenchido". Aplicada ao estado final da linha, essa frase recusa também a conta cuja pessoa
o gatilho criador acabou de criar. A leitura correta, que substitui aquela frase (a evidência arquivada da correção 2
não foi reescrita): **na E15, o `BEFORE INSERT` recusa todo `pessoa_id` informado pelo chamador, e o gatilho adiado
recusa toda conta sem a marca `criador` (ou `backfill`) da mesma transação e da mesma pessoa da linha final;
a E10 (058) redefine os dois para aceitar também a marca `aceite` gravada por `aceitar_convite` com o convite
consumido.** No mesmo item 5 e no item 8 (3C) do plano, o orquestrador acrescenta `origens_de_conta` à 1B (tabela,
backfill da marca, testes da E15) e à 3C (marca `aceite`, colunas do convite fora do privilégio do `dc360_app`,
testes da E10), e à 0B a reprovação de função privilegiada que cite `origens_de_conta` fora das duas autorizadas.

## Portões (saídas nesta pasta)

- `regras-de-conteudo.txt`: `npx vitest run packages/shared/test/regras-de-conteudo.test.ts` em `dc360/` depois de
  `npm ci --ignore-scripts`; o único reprovado admitido é o EPERM de symlink do Windows (DV-46).
- `gerar-estado.txt`: `node scripts/roadmap/gerar-estado.mjs --conferir` da raiz.
- `node dc360/scripts/conferir-indices-de-evidencia.mjs` da raiz, depois das linhas novas no `INDEX.md` da etapa.
- `dc360/node_modules` apagado depois dos portões.
