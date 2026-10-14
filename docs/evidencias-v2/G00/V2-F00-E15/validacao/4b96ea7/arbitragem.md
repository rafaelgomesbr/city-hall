---
validador: arquiteto-software
papel: arbitragem
modelo: claude-opus-5-5
etapa: V2-F00-E15
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
gatilho: 9 (risco residual escalado pelo red-team)
veredito: PASS
confianca: media
---
## Relatórios em conflito

- `red-team.md` (Opus): PASS, com o achado 1 provado por falha injetada: `acolherNoAparelho` falha aberto; o agente B vê o rascunho do agente A (nome da moradora, observações, assinatura, foto) e, nos casos F1 e F2, a marca de dono passa a ser de B, o que torna o vazamento permanente. Escalou pelo gatilho 9.
- `seguranca-aplicacao.md`: PASS, viu a falha aberta na leitura do dono (achado 1, dono F14-E02 ou F14-E04).
- `privacidade-lgpd.md`: PASS, viu "marca o novo dono mesmo se o apagamento falhar" por leitura (achado 1, corrige antes de crescer, F14-E02).
- `qa.md`, `testes.md`: PASS. O `testes.md` registra ainda um mutante sobrevivente: `acolherNoAparelho` com dono nulo, sem teste que o fixe.

Os cinco concordam no fato. A pergunta é se o fato reprova a E15.

## Reprodução (comando e resultado)

Limitação desta sessão: a arbitragem rodou sem shell. Não rodei jest nem criei teste temporário; o repositório não foi tocado.

1. Código no SHA (lido), `dc360/apps/campo/src/dados/banco-local.ts`:
   - `donoDosDadosLocais` (218-229): erro de leitura vira `null`, o mesmo valor de "sem marca".
   - `acolherNoAparelho` (255-261): `null` não apaga; e marca o novo dono SEMPRE, mesmo se o apagamento falhou.
   - `apagarDadosLocais` (298-349): o `DELETE FROM rascunhos; ... marcas; ...` está num `try` que só registra o erro; a função nunca sinaliza falha a quem chamou.
   - Os três pontos juntos dão exatamente os casos F1 (leitura falha), F2 (DELETE falha) e F3 (DELETE e marca falham) do red-team.
2. Saída da sonda do red-team (lida): `scratchpad/redteam/out-e15.txt`, `node:sqlite` real com os módulos reais `banco-local` e `rascunho`, 5 de 5 casos executados. Controle: Bruno vê 0 rascunho. F1 (`SQLITE_BUSY` na leitura): `apagou=false`, Bruno vê 1 rascunho com assinante e observações, dono gravado BRUNO, segundo login dele sem falha continua vendo. F2 (`SQLITE_FULL` no DELETE): `apagou=true` e Bruno vê o rascunho, dono BRUNO. F3: vê nesta sessão, dono fica ANA. F4 (sem marca): vê (desenho declarado, janela de atualização).
3. Origem: nenhum `diff` da fase altera essas funções (busca nos patches de `docs/evidencias-v2/G00/**`: só citações em comentário e o uso de `marcarDonoDosDadosLocais` num teste novo). O red-team atribui o código a `5ecdf4c`. `encerrarSessaoVencida` também é anterior à F00 (`index.tsx` e `fila.tsx` já o usavam).

## Escopo

Não é da E15.

- O bloco diz, em "Risco de segurança": "o apagamento é regra de privacidade para aparelho compartilhado; a etapa só avisa, não muda a regra". O teste de isolamento do bloco é "outro agente entra no aparelho com o rascunho do primeiro: `acolherNoAparelho` limpa (regra mantida)", e ele está provado no caminho sem falha (QA E1 e E2; `sair-e-entrar-nao-perde-a-coleta.test.ts`; controle da sonda).
- O roadmap já tem dono para reescrever `acolherNoAparelho` com teste em SQLite: V2-F14-E02 (`10-campo-reinspecao.md:406-418`, "`acolherNoAparelho` confirma, nomeando o dono anterior"; "Testes: `acolherNoAparelho`, `marcarDonoDosDadosLocais` e `sair()` com SQLite em memória"), rastreado como GAP-P1O-11 (`17-rastreabilidade.md:693`).
- A correção 1 da E15 levou a terceira tela (vistoria) ao mesmo comportamento das outras duas, que já preservavam o disco na sessão vencida antes da F00. Isso é o objetivo da etapa ("Entrar de novo continua sem apagar nada") e aumenta só um pouco a dependência de `acolherNoAparelho`; não cria o defeito.
- Nenhum item do G00 (`03-fase-00-estabilizacao.md:772-798`) cobre a troca de pessoa no aparelho.

Diferença para o caso da E07 (FAIL), para a decisão ser coerente: lá o objetivo, o teste negativo e o item do G00 prometem a garantia que quebra, e a etapa escreveu o código da garantia. Aqui a etapa declara que não muda a regra, não tocou o código e há etapa futura nomeada para ele.

## Item da seção 7

Sim, é item 3 (vazamento de dado pessoal entre pessoas). Estar condicionado a uma falha transitória do SQLite muda a probabilidade, não a categoria, e depois da falha o vazamento persiste sem nova falha (F1, F2). Consequência prática: o achado NÃO pode ser fechado por RISCO ACEITO em etapa nenhuma nem no G00; só sai com o conserto e a prova.

## Decisão

PASS da E15 em 4b96ea7. O achado 1 do red-team fica como CORRIGE ANTES DE CRESCER, não aceitável como risco, com:

- dono: V2-F14-E02, que precisa ter o comportamento "falha fechada" escrito no bloco (hoje o bloco fala de confirmar e nomear o dono, não de falha do disco);
- prazo: antes do primeiro aparelho compartilhado com dado real (piloto). Como a F14-E02 é P1 e depende do G00, recomendo ao Rafael antecipar uma correção curta e isolada; essa decisão de prioridade é dele;
- o GATE G00 deve listar o achado como aberto, com dono, e não como aceito.

## Conserto mínimo

Não se aplica ao veredito (PASS). Para o dono do achado:

1. Distinguir "não deu para ler" de "não há marca": `donoDosDadosLocais` devolve um estado de erro, e não `null`.
2. `apagarDadosLocais` devolve se o banco foi limpo (ou lança), em vez de só registrar.
3. `acolherNoAparelho`: erro na leitura do dono ou falha no apagamento RECUSA a entrada (frase que diz o que fazer, nova tentativa), e só marca o novo dono depois de apagar com sucesso. Recusar, e não apagar por via das dúvidas, porque a leitura que falhou pode ser da mesma pessoa, e apagar destruiria a vistoria começada que a E15 protege.
4. Testes com o SQLite do Node e falha injetada nos três passos (os casos F1 a F3 do red-team viram testes permanentes) e o caso "sem marca não apaga" fixado, matando o mutante sobrevivente apontado em `testes.md`. Provar que morde voltando o `catch` antigo.
