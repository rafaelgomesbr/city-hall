---
validador: qa (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E07
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [AUTH, DB, MIGRATION, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: nao
escalar: arbitragem em Opus junto com os FAIL de banco, red-team e segurança desta rodada (mesmo defeito, reproduzido aqui de forma independente)
---
## Critérios verificados

Árvore no HEAD `95f09f6` (produto igual a `52952a1`). Saídas em `$SP/val/qa/`; sondas próprias, escritas nesta sessão, em `$SP/val/qa/sondas/` (`qa-vigencia.test.ts`, `qa-corrida-login.test.ts`, `provisionar.mjs`, `migrar-ate.mjs`, `sessoes-antigas.mjs`, `conferir-banco.mjs`). Postgres 17.10 descartável na porta 55551 (binários do gatekeeper), papéis montados como o job `implantavel` do CI; parado e apagado no fim.

Cada item da DoD e dos cinco campos de teste:

| Critério | Prova | Resultado |
| --- | --- | --- |
| Positivo: renovação normal, o token antigo escreve até vencer e o novo também | `qa-vigencia` "rotacao nao expulsa" (`30-sonda-vigencia.txt`): antigo 200, novo 200 | PASS |
| Negativo: administrador, a própria pessoa, sair, reuso de refresh e troca de senha encerram a cadeia; o token pré-renovação recebe 401 `sessao_encerrada` | `qa-vigencia`, cinco casos: em todos o token anterior à renovação dá 401 `sessao_encerrada` e o renovado também cai | PASS |
| Positivo: papel rebaixado, 401 `nao_autenticado`, renovação com o papel novo, a escrita permitida ao papel novo passa | despacho com token velho 401 `nao_autenticado`; `/auth/renovar` devolve `usuario.papel = operador`; operador abre ocorrência 201 | PASS |
| Negativo: o ex-coordenador renovado não despacha | 403 `sem_permissao` | PASS |
| Papel promovido (simetria) | token velho de operador 401; renovado despacha 200 | PASS |
| A troca de papel não revoga sessões (decisão registrada) | 2 sessões vivas depois da troca | PASS |
| Autorização e isolamento: coordenador de A rebaixado não despacha e não vê B | token velho em ocorrência de B: 401 `nao_autenticado` (nada sobre B); renovado lê ocorrência de B: 404 | PASS |
| Senha provisória no prazo troca | 200, e o token novo escreve 200 | PASS |
| Provisória vencida: trocar responde 401 `sessao_encerrada`, e renovar também (`senha-provisoria.test.ts:183`) | trocar 401 `sessao_encerrada`, renovar 401 `sessao_encerrada`, escrita 401; a senha continua provisória (nada trocado); `senha-provisoria.test.ts` verde dentro do `test:api` | PASS |
| As três sondas passam | as três acima, mais `familia-da-sessao.test.ts`, `renovacao-contra-encerramento.test.ts` e `vigencia-na-escrita.test.ts` verdes no `test:api` (`01-test-api.txt`) | PASS |
| Zero `skip` | o único `skipIf` é o bloco de Postgres real de `renovacao-contra-encerramento.test.ts`; rodei com `DC360_POSTGRES_DE_PROVA` em Postgres 17: 14 de 14, nenhum pulado (`22-corrida-pg17.txt`); no CI o job "A API sobe contra Postgres real" roda o mesmo arquivo, 14 de 14, e reprova se houver "skipped" (`08-ci-implantavel-corrida.txt`) | PASS |
| Migração aplicada do zero | banco `dc360_zero`: `npm run migrar` aplica 001 a 050, `--conferir` "Esquema em dia.", código 0 (`21-zero.txt`) | PASS |
| Migração aplicada sobre banco existente | banco `dc360` até a 046 com a semente e 3 sessões antigas (viva, rotacionada, de B) (`13`, `14`); `--conferir` antes acusa 4 faltando, código 1 (`15`); `npm run migrar` aplica 047 a 050 (`16`); `--conferir` "Esquema em dia." (`17`); de novo "Nada a fazer: 50" (`18`); sessões antigas com `familia_id = id`, coluna não nula com padrão, índice parcial `sessoes_familia_viva_idx`, uma só `abrir_sessao` de sete argumentos, 27 funções SECURITY DEFINER (o teto) (`19-conferir-banco-existente.txt`) | PASS |
| `test:isolamento` verde com a migração | 345 aprovados, 3 pulados por ambiente, código 0 (`02`) | PASS |
| E2E: rebaixar um coordenador logado, a próxima ação renova em silêncio e passa a ter só as ações do papel novo | `npm run test:e2e:api`, seção 24 (`07-test-e2e-api.txt`): "a escrita passa, sem mandar a pessoa para a entrada", "o painel tentou, levou 401, renovou e repetiu", "o menu Usuarios some", "o token renovado nao despacha equipe: 403 sem_permissao"; 288 de 288, zero erro de console, código 0 | PASS |
| Regressão: `test:api`, `test:isolamento`, `api.test.ts`, `test:console`, `test:e2e:api` | `01`: 1309 aprovados, 1 falha de ambiente (`openssl-do-teste`), 9 pulados (o bloco de Postgres real, rodado à parte); `02` verde; `03-test-console.txt` 259 de 259; e2e verde | PASS |
| G00 "Sessão revogada" e item 2 da seção 7 de `28` | `qa-corrida-login.test.ts` (`31-sonda-corrida-login.txt`), abaixo | **FAIL** |

### O defeito: sessão aberta com a senha antiga sobrevive ao ato que encerra as sessões

Reprodução própria e determinística (PGlite, servidor real por `inject`), independente das sondas de banco, red-team e segurança: o banco passado ao servidor é embrulhado e, quando termina a transação que registra o ACERTO do login (`registrar_tentativa_login(..., true)`), roda uma vez o ato do outro ator, e só então deixa o login seguir para `emitirPar` (a abertura da sessão, outra transação). É uma intercalação real: entre essas duas transações não há trava nem releitura da credencial.

| Ato no meio do login com a senha antiga | Controle: ato ANTES do login | Com o ato no meio |
| --- | --- | --- |
| troca de senha pela própria pessoa (`/auth/trocar-senha`, de outra sessão) | login com a senha antiga 401 | login 200; sessão do login VIVA depois do ato; escreve 200; renova 200; o renovado escreve 200 |
| redefinição por quem administra (`/usuarios/:id/redefinir-senha`) | 401 | login 200; sessão viva; token SEM a marca `sp`; escrita 403 `troca_de_senha_obrigatoria` (o banco manda), renova 200; a leitura segue pela assinatura |
| desativação pelo painel (`PATCH /usuarios/:id/situacao`) | 401 | login 200; sessão viva no banco; escrita 403 `conta_desativada`; renova 403 (mitigado na escrita) |

Asserção que reprova: "sessao aberta com a senha antiga sobreviveu ao ato" nos três casos com o grampo; os três controles passam. A troca de senha é o remédio de quem desconfia que a senha vazou; uma sessão autenticada pela senha antiga, que renova e escreve depois da troca, é sessão que devia estar revogada (item 2 da seção 7 de `28`, que não admite risco aceito; item "Sessão revogada" do G00, que é desta etapa). O mesmo padrão foi medido em concorrência real no Postgres 17 pelo validador de banco desta rodada (13 de 30 rodadas na troca de senha), o que mostra que a janela não é artefato do grampo.

## Evidência

- `$SP/val/qa/31-sonda-corrida-login.txt`: 3 controles verdes, 3 casos com o grampo vermelhos (código 1)
- `$SP/val/qa/30-sonda-vigencia.txt`: 18 de 18
- `$SP/val/qa/13` a `19`, `21`: migração sobre banco existente e do zero em Postgres 17.10
- `$SP/val/qa/22-corrida-pg17.txt`: bloco de Postgres real, 14 de 14, código 0
- `$SP/val/qa/40-mutacao-M1-familia.txt` e `.diff`: sem o `AND EXISTS` da família em `auth/vigencia.ts`, 5 de 18 da minha sonda e 7 de 20 de `familia-da-sessao.test.ts` reprovam; restaurado com `git restore`, `git status --porcelain` limpo depois
- `$SP/val/qa/01`, `02`, `03`, `07`; `08-ci-implantavel-corrida.txt` (log do job do CI, 14 passed, sem skipped)

## Cenários positivos

Rotação não expulsa; papel promovido renova e despacha; provisória no prazo troca e escreve; migração aplicada nos dois cenários e idempotente.

## Cenários negativos

Cinco formas de encerrar a cadeia; papel rebaixado (velho e renovado); isolamento A x B do rebaixado; provisória vencida em trocar, renovar, escrever e entrar; o login no meio de troca, redefinição e desativação.

## Tentativas de reprovar

- Derrubar a regra da cadeia: mutação M1 morde (5 e 7 vermelhos).
- Sair (`/auth/sair`) com o refresh da sessão nova: encerra a cadeia, o token pré-renovação cai.
- Migração sobre banco com sessão rotacionada antiga e sessão de outro município: backfill correto, nada recusado.
- Login concorrente com os atos que encerram as sessões: o defeito acima.

## Achados

1. **BLOQUEIA** (item 2 da seção 7 de `28`; G00 "Sessão revogada"; dono E07): sessão aberta por login que conferiu a senha antiga no instante de uma troca de senha, de uma redefinição ou de uma desativação sobrevive ao ato. Reprodução: `qa-corrida-login.test.ts`, comando `npx vitest run --root apps/api --dir $SP/val/qa/sondas qa-corrida-login` em `dc360/`. Mecanismo lido: `entrar` (`apps/api/src/auth/servico.ts`) lê a credencial e registra o acerto em transações próprias e abre a sessão em outra (`emitirPar`), sem `travar_sessoes_do_usuario` e sem reler hash e `ativo`; a 050 fechou só a suspensão. Conserto mínimo (não implemento): abrir a sessão do login sob a trava por pessoa, relendo na mesma transação o hash (ou uma versão da credencial) e `ativo`, recusando se mudaram desde a conferência; caso no bloco de Postgres real com a disputa segurada.
2. ANOTADO (já relatado por banco, red-team e segurança, não reexecutado por mim): segundo fator e ativação do segundo fator emitidos antes da troca continuam abrindo sessão; `/auth/sair` com refresh já rotacionado responde 204 sem encerrar a cadeia.

## Não verificado

- Concorrência real pela API em Postgres para o achado 1: não refeita por mim (minha prova é a intercalação determinística; a medida em concorrência real é a do validador de banco).
- Recuperação por link (`consumir_recuperacao`) no meio do login: não sondada por mim.
- Postgres 16 local: provado no CI (job `implantavel`), não aqui.
- Aplicativo de campo em aparelho: a etapa não muda o app; só `test:campo` (1927 de 1927).

## Risco residual

Fora o achado 1, os critérios literais da etapa passam com prova. A janela do achado é a do scrypt mais duas idas ao banco, estreitada por `LOGIN_POR_IP` em produção, mas a regra é inegociável.

## Motivo do humano

Não se aplica: as três sondas "antes e depois" são verificáveis por execução e foram executadas.
