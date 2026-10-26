---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E04
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [AUTH, AUTHZ, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Diretório de trabalho (abaixo, `S`): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L09-red-team`. Worktree próprio em `4ce0433` (`S/wt`, `node_modules` por link simbólico), cluster PostgreSQL 17.6 próprio (porta 55479), sonda própria `S/sonda/zz-l09-redteam.test.ts` (servidor real em porta efêmera, banco criado do zero com as 51 migrações e a semente, papel `dc360_app` por `SET LOCAL ROLE`, então o RLS vale).

| Critério (DoD e cinco campos) | Prova | Resultado |
| --- | --- | --- |
| Sonda de conta desativada não escreve | `S/saidas/10-sonda-pg17.log`, varredura "conta desativada": 51 rotas de escrita (todo POST, PATCH, PUT e DELETE fora de `SEM_TOKEN`) mais 7 GET com efeito em GET e HEAD, 65 pedidos, todos 403 `conta_desativada` (HEAD sem corpo); impressão digital md5 de TODAS as tabelas do esquema igual antes e depois, `sessoes` igual | PASS |
| Papel rebaixado e sessão encerrada por quem administra recebem 401 | mesma varredura: papel rebaixado pela rota `PATCH /usuarios/:id` 65 de 65 401 `nao_autenticado`; sessão encerrada por `POST /usuarios/:id/encerrar-sessoes` 65 de 65 401 `sessao_encerrada`; nada mudou em tabela nenhuma | PASS |
| Cadeia encerrada depois de renovar (token anterior e posterior à rotação) e `sid` de outra pessoa | três varreduras, 65 de 65 401 `sessao_encerrada` cada, nada gravado | PASS |
| A própria pessoa que encerra "as outras" mantém a sua; rotação não é expulsão | sonda "rotação": escrita com token anterior à renovação 200; `/auth/encerrar-sessoes` com ele 200 (2 encerradas); a cadeia própria segue 200; a outra sessão 401 `sessao_encerrada` | PASS |
| Conta ativa escreve (positivo) | controle da sonda: CSV 200 e `POST /ocorrencias` 201 com token vigente, e a impressão digital acusa `exportacoes`, `ocorrencias`, `protocolo_sequencias`, `trilha_eventos` (prova que a régua enxerga escrita) | PASS |
| Município B contra A continua 404 | coordenador de Vale Fundo: triagem, laudo, termo, dossiê, `PATCH /usuarios/<id de A>/situacao`, e com o id em MAIÚSCULAS (forma que a correção 4 normaliza) situação, encerrar-sessões, redefinir-senha e sessões: 9 de 9 404; Jonas segue ativo | PASS |
| Zero `skip` em vigência | `grep` sem `.skip`/`skipIf`/`.only` em `vigencia-na-escrita.test.ts` e `get-com-efeito.test.ts` (só o comentário histórico); `S/saidas/01-api-arquivos-das-etapas.txt` 193 de 193, zero pulado | PASS |
| Regressão obrigatória (parte local) | `S/saidas/01-api-arquivos-das-etapas.txt` (12 arquivos, inclui `superficie.test.ts`, `vigencia-na-escrita`, `get-com-efeito`, `acesso-suspenso`, `familia-da-sessao`, `sessoes-da-conta`) 193 de 193; bloco de Postgres real de `renovacao-contra-encerramento.test.ts` em PG 17.6, 53 de 53 (`S/saidas/04-renovacao-pg17.txt`); `test:isolamento` rodado pelo gatekeeper (345 e 3 pulados) | PASS |
| Comentários batem com o código | `servidor.ts` linhas 505 a 523 descrevem exatamente `escrita = método ou comEfeito`, `lerVigencia` e `exigirVigencia` na escrita e a marca provisória do banco; a única mudança da correção 4 em `servidor.ts` é o comentário de `/saude` (fora da vigência) | PASS |

## Evidência

- `npx vitest run --root apps/api` com 12 arquivos das três etapas: código 0, 193 de 193 (`S/saidas/01-api-arquivos-das-etapas.txt`).
- `DC360_POSTGRES_DE_PROVA=postgres://postgres@127.0.0.1:55479/postgres npx vitest run --root apps/api test/renovacao-contra-encerramento.test.ts`: código 0, 53 de 53, o bloco de Postgres real incluso (`S/saidas/04-renovacao-pg17.txt`).
- Sonda própria em PG 17.6: código 0, 14 de 14, 33 linhas OK, 0 FALHA (`S/saidas/10-sonda-pg17-vitest.txt` e `S/saidas/10-sonda-pg17.log`).
- Prova de que morde (mutação no meu worktree, restaurada com `git checkout` e conferida com `git status`):
  - M1, `exigirVigencia(...)` desligado em `servidor.ts`: a sonda reprova 8 casos e 15 linhas (escritas 200 e tabelas `avisos`, `trilha_administrativa`, `exportacoes` mudando; depois da desativação 6 de 6 escritas aceitas em cada rodada da corrida) (`S/saidas/20-mut-M1-sem-exigirVigencia.log`); os testes do repositório `vigencia-na-escrita` e `get-com-efeito` reprovam 12 de 23 (`S/saidas/20-mut-M1-testes-do-repo.txt`).
  - M2, `comEfeito` ignorado: GET com efeito passam com token de conta desativada, papel rebaixado e sessão encerrada; `avisos` e `exportacoes` mudam (`S/saidas/20-mut-M2-sem-comEfeito.log`).
  - M3, a troca de senha volta a cunhar o papel do TOKEN (`papel: identidade.papel`): a sonda reprova (5 de 5 tokens com `coordenador` depois do rebaixamento) (`S/saidas/20-mut-M3-troca-com-papel-do-token.log`); nenhum teste do repositório reprova (`S/saidas/21-repo-M3.txt` 121 de 121, `S/saidas/21-repo-M3b.txt` 74 de 74). Ver Achados.

## Cenários positivos

- Token vigente grava (controle) e a mesma régua enxerga a escrita.
- Token de antes da renovação continua escrevendo pelos 15 minutos (decisão "rotação não é expulsão" de `vigencia.ts`).
- Quem encerra as outras sessões com o token anterior à rotação preserva a própria cadeia (200 depois).
- Rebaixada que renova recebe token com o papel novo (`operador`) e a triagem responde 403 `sem_permissao`: não escala.

## Cenários negativos

Seis estados de token velho contra toda a superfície de escrita e os GET com efeito, em Postgres 17.6 real, com os estados criados PELAS ROTAS de quem administra (não por SQL): conta desativada, papel rebaixado, sessão encerrada por quem administra, cadeia encerrada com o token anterior e com o posterior à rotação, token assinado com o `sid` de outra pessoa. 390 pedidos, 0 aceito, 0 tabela alterada. Município cruzado: 9 de 9 404, nunca 403. Troca de senha (código tocado pela correção 4): conta desativada 403 `conta_desativada`, rebaixada 401 `nao_autenticado`.

## Tentativas de reprovar

1. Corrida em PG 17.6: 6 rodadas, cada uma com 12 escritas em voo e a desativação pela rota; logo que a desativação responde 200, mais 6 escritas com o mesmo token: 0 de 36 aceitas e 0 gravadas (o banco conferido por nome). As em voo foram aceitas em 64 de 72 (rodada 0: 4 de 12), que é o risco residual já registrado na rodada 4 (escrita que começou antes confirma).
2. Papel rebaixado e CONFIRMADO no meio da troca de senha (uma transação aberta segura a linha de `usuarios` com o papel novo enquanto a rota passa pela vigência e roda o scrypt; confirma 900 ms depois): 5 de 5 trocas 200 com token de papel `operador`, e a triagem com ele 403. A correção 4 relê o papel sob a trava e não deixa cunhar 15 minutos com o papel antigo.
3. `sid` de outra pessoa num token bem assinado: recusado (401 `sessao_encerrada`) em toda a superfície.
4. Id da conta de outro município em maiúsculas nas rotas de administração (o `transform` novo da correção 4): 404, sem 403 que confirmaria existência.
5. HEAD das rotas com efeito: mesma recusa do GET (403/401 sem corpo), nada gravado.
6. A migração 051 pôs gatilho em `usuarios` (UPDATE de `ativo` e `senha_hash`): a desativação e a reativação pela rota, sob `dc360_app` e RLS forçada, responderam 200 em todas as dezenas de chamadas da sonda, e a vigência pegou a conta desativada na hora. Sem regressão.

## Achados

- **anotado** (fora do critério desta etapa; é da E07, correção 4): o conserto "o token novo da troca de senha nasce com o papel relido sob a trava" (`auth/servico.ts`, `papel: sessaoPreservada.papel`) não é preso por nenhum teste do repositório. Reprodução: trocar por `identidade.papel` e rodar `senha-e-sessoes`, `senha-provisoria`, `renovacao-contra-encerramento` (com PG), `familia-da-sessao`, `sessoes-da-conta`, `vigencia-na-escrita`, `recuperacao-morre-com-a-credencial`, `id-da-propria-conta`, `segundo-fator`, `recuperacao`: 195 de 195 verdes. Impacto limitado a leitura por até 15 minutos com o papel antigo (a escrita com esse token leva 401 `nao_autenticado`, como a mutação M3 mostrou), então não quebra a promessa da E04.
- **anotado**: risco residual da rodada 4 inalterado: escrita que já estava em voo quando a desativação confirma ainda pode ser aceita (64 de 72 nesta sonda); nenhuma escrita que começa depois da resposta da desativação é aceita.

## Não verificado

- O run do CI do SHA (ausente nesta sessão); a prova é local.
- `npm run test:api` inteiro e `npm run test:e2e:api` não foram rodados por mim (rodei os 12 arquivos das três etapas, o bloco de PG real e a sonda); o gatekeeper rodou `test:isolamento`.
- O E2E de navegador "desativar no painel e o próximo POST falha": provado só pela API (rota de quem administra seguida da escrita), não pelo painel.
- Concorrência medida em Postgres 17.6 local de uma conexão de rede só (sem pooler, sem latência de produção).
- Vigência em leitura pura segue fora por escopo (F03-E03).

## Risco residual

A janela da escrita em voo durante a desativação (milissegundos, documentada na rodada 4). Leitura pura com token velho segue pela assinatura até a F03-E03. A troca de senha com papel relido está correta no código, mas sem teste no repositório que a prenda.

## Motivo do humano

A "Validação humana" da etapa pede que o Rafael veja a sonda reproduzida antes e depois; isso continua pendente e não é algo que um validador possa fazer por ele. Item do "Motivo do veredito" da rodada 4 (todas as dimensões PASS, sem defeito a consertar): a correção 4 não tocou a vigência (em `servidor.ts` só mudou o comentário de `/saude`; em `vigencia-na-escrita.test.ts` só o título de um caso); a prova desta rodada (390 pedidos negativos, 0 aceito, mutações M1 e M2 mordendo) mostra que nada regrediu, e o risco residual de 223 ms segue o mesmo e segue para o Rafael.
