---
validador: seguranca-aplicacao
modelo: claude-opus-5-5
etapa: V2-F00-E07
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [AUTH, DB, MIGRATION, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2, E3a]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Régua: OWASP ASVS 4.0 nível 2 (V2 autenticação, V3 sessão, V4 autorização). Tudo rodado num worktree meu destacado em `4ce0433` (o `src` da API conferido idêntico ao do SHA com `git diff --quiet 4ce0433 -- dc360/apps/api/src`), contra PostgreSQL 17.6 real (cluster próprio, porta 56337, `log_lock_waits=on`, `deadlock_timeout=200ms`), com `DC360_POSTGRES_DE_PROVA` ligado, então o bloco de Postgres real dos testes rodou e não foi pulado.

Itens do "Motivo do veredito" da rodada 4 (bb0f654):

1. **Troca de senha com a senha antiga em voo desfazendo redefinição, link, troca pela própria pessoa ou desativação (o FAIL).** CONSERTADO. `trocarSenha` (`dc360/apps/api/src/auth/servico.ts:1065-1214`) agora grava numa transação só, sob o município: `SELECT ... FROM usuarios ... FOR NO KEY UPDATE` (linha 1154), `travar_sessoes_do_usuario` (1157), releitura da cadeia viva (1158-1170), recusa de conta desativada (403), cadeia sem sessão de pé ou provisória vencida (401 `sessao_encerrada`) e hash diferente do conferido (401 `credenciais`) (1172-1179), e só então `trocar_senha` (1187). Prova minha: (a) os casos 11 a 19 e 21 a 34 de `renovacao-contra-encerramento.test.ts` verdes em Postgres 17.6 (`saidas/01`); (b) o teste morde: com o `servico.ts` de `bb0f654` no lugar, 23 de 53 vermelhos, entre eles 11 a 17, 21 a 31, 33 e 34 (`saidas/02`); restaurado, 53 de 53 verdes (`saidas/11`); (c) sonda de caos própria, sem grampo, 60 rodadas (12 de cada reação: redefinição, link, desativação, troca pela vítima, encerrar por quem administra) com ruído simultâneo (renovação do invasor, login com a senha antiga, login errado, troca de e-mail da conta por quem administra): 0 sobrevivente, 0 erro 500 (`saidas/03`, linha `[C]`); a mesma sonda com o `servico.ts` de `bb0f654`: 13 de 30 rodadas com a senha do invasor valendo depois da reação (redefinição 6 de 6, link 5 de 6, vítima 2 de 6) (`saidas/12`).
2. **Troca com o token anterior à renovação derrubando a própria cadeia (corrige antes de crescer).** CONSERTADO. Sonda P1: login, renovação, troca com o token de acesso ANTERIOR: 200; o token devolvido escreve (200); a renovação da cadeia continua (200); a outra sessão da pessoa caiu (0 viva) (`saidas/03`, `[P1]`). Caso 18 do repositório verde e vermelho com a mutação (`saidas/01`, `02`).
3. **O FAIL da rodada 3 (login com a senha antiga, segundo fator):** fora do que esta rodada mudou; o arquivo da corrida inteiro (casos 6 a 10 do bloco de PGlite e 10 a 20 do bloco de Postgres real) segue verde em 17.6 (`saidas/01`).

Critérios da etapa que tocam a dimensão:

- **Sessão rotacionada só vale com a cadeia viva** (Testes negativos): sonda P2, renovação e depois quem administra encerra as sessões: o token pré-renovação escreve 200 antes e 401 `sessao_encerrada` depois; a troca de senha com ele 401; a senha que ele tentou não entra (`[P2]`). `familia-da-sessao.test.ts` 20 de 20 em 17.6.
- **Papel alterado responde 401 e renovar resolve** (Testes positivos e negativos): sonda P3, rebaixada a operador: despacho com o token velho 401 `nao_autenticado`; `/auth/renovar` 200 com papel `operador`; despacho com o token novo 403 `sem_permissao`; escrita permitida ao operador 200; troca de senha com o token velho 401 `nao_autenticado` (`[P3]`).
- **Senha provisória vencida nem escreve nem se troca** (`senha-provisoria.test.ts:183` e Testes negativos): sonda P4, temporária vencida: troca 401 `sessao_encerrada`, renovação 401 `sessao_encerrada`, hash intacto (`[P4]`); `senha-provisoria.test.ts` 8 de 8 em 17.6.
- **Autorização e isolamento** (A rebaixado não despacha e não vê B, 404): caso "isolamento: coordenador do município A rebaixado ..." verde em 17.6 (`saidas/01`). A troca roda sob `comTenant` com o município do token e RLS (`SET LOCAL ROLE dc360_app`, `banco/postgres.ts:235-238`); o `sid` e o usuário vêm do token verificado.
- **Sem impasse novo entre a troca e os outros caminhos que gravam `usuarios` e `sessoes`:** ver Tentativas. 0 `deadlock detected` e 0 40P01 no log do Postgres em todas as execuções desta validação, inclusive com a mutação (`saidas/13`).

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L02-seguranca/saidas/`; sondas em `.../L02-seguranca/sondas/` (`zz-sonda-l02.test.ts`, copiada para `apps/api/test/` do worktree só durante a execução).

| # | Comando | Código | Resultado |
| --- | --- | --- | --- |
| 01 | `npx vitest run` de `renovacao-contra-encerramento`, `recuperacao-morre-com-a-credencial`, `senha-provisoria`, `familia-da-sessao`, `vigencia-na-escrita`, `recuperacao`, `recuperacao-sem-oraculo`, `recuperacao-desligada` (PG 17.6) | 0 | 8 arquivos, 133 de 133, nenhum pulado |
| 02 | o mesmo arquivo da corrida com `servico.ts` de `bb0f654` | 1 | 23 de 53 vermelhos |
| 11 | o arquivo da corrida depois de restaurar | 0 | 53 de 53 |
| 03 | `npx vitest run test/zz-sonda-l02.test.ts` (RODADAS=60) | 0 | 10 de 10; caos 0 sobrevivente, 0 500 |
| 12 | caos da sonda com `servico.ts` de `bb0f654` (RODADAS=30) | 1 | 13 de 30 com sobrevivente |
| 06 | sonda E07-D, 40 rodadas com 15 operações simultâneas sobre a mesma pessoa | 0 | 0 erro 500 |
| 13 | resumo do `pg.log` | | 0 impasse; só 3 ERROR DC367 esperados (município suspenso, testes do repositório) |

## Cenários positivos

- Renovação normal: o token pré-renovação escreve antes do encerramento (P2) e a troca com ele preserva a cadeia (P1).
- Papel rebaixado: renovar devolve o papel novo e a escrita do papel novo passa (P3).
- Troca legítima sozinha e com a reação vindo depois: casos 28 a 31 (troca segura a linha e a trava, a reação espera e vem depois) verdes em 17.6.
- Caos: quando a vítima troca primeiro, a senha dela vale e a cadeia do invasor cai (3 de 12); quando o invasor troca primeiro, a vítima é recusada às claras (401), ordem serial válida (9 de 12).

## Cenários negativos

- Invasor com a senha antiga contra redefinição: 12 de 12 recusado (401), temporária entra, senha do invasor não; contra desativação: 12 de 12 403 `conta_desativada`; contra encerrar: 12 de 12 401 (`[C]`).
- Cadeia encerrada: token pré-renovação 401 `sessao_encerrada` (P2).
- Papel velho: 401 `nao_autenticado` no despacho e na troca (P3); operador renovado 403 `sem_permissao`.
- Provisória vencida: troca e renovação 401, hash intacto (P4).
- Isolamento: município B 404 com token de A (casos do repositório em 17.6).

## Tentativas de reprovar

1. **Desfazer o conserto** (servico.ts de bb0f654): os testes do repositório e a minha sonda ficam vermelhos (23 de 53; 13 de 30). Restaurado, verde.
2. **Caminho que muda credencial, `ativo`, sessão ou `senha_provisoria_ate` sem a trava e a releitura.** Varri `UPDATE usuarios` e `UPDATE sessoes` em `apps/api/src` e nas migrações ativas: redefinição por quem administra (`rotas/administracao.ts:496`, linha e depois `encerrarSessoes` com a trava), desativação (`:266`, linha e depois `revogar_sessoes_do_usuario`), troca de papel e e-mail (`:365`, não revoga por decisão; a vigência confere o papel), `registrar_tentativa_login` (002, só contadores, transação própria), `consumir_recuperacao` (051, linha, link, trava), `trocar_senha` (049, agora chamada dentro da transação conferida), `sair` (`revogar_sessao`, só revoga). Nenhum caminho de API grava `senha_hash`, `ativo` ou `senha_provisoria_ate` sem tomar a linha de `usuarios`; o console não atualiza `usuarios` (só insere na 036). Nenhum desvio achado.
3. **Impasse novo.** Raciocínio de ordem: a troca toma linha de `usuarios` (NO KEY UPDATE), trava da pessoa, linhas de links (gatilho da 051) e de `sessoes`; redefinição, desativação e link tomam linha, links, trava; login e renovação tomam trava e só pedem KEY SHARE na linha (compatível); a suspensão toma a linha do município e depois a trava (a troca não toca o município); a troca de e-mail toma FOR UPDATE na linha mas não espera nada depois. Medido: sonda E07-D, 40 rodadas com troca A, troca B, redefinição, link, pedido de link (`abrir_recuperacao`), desativação e reativação, encerrar por quem administra e pela pessoa, duas renovações, login certo e errado, troca de e-mail, sair e escrita, todos ao mesmo tempo sobre a Helena: 0 erro 500; caos C mais 60 rodadas; log com 0 impasse (`saidas/06`, `13`).
4. **Regressão no que a E07 preserva:** P1 a P4 acima, todos como a etapa exige.
5. **Força bruta da senha atual pela troca** (ver Achados A1): passou, mas não é critério da etapa.

## Achados

- **A1, corrige antes de crescer (fora do escopo da E07, pré-existente):** `/auth/trocar-senha` (`rotas/autenticacao.ts:214`) não tem limite próprio nem conta falha: com um token de acesso válido, 40 chutes da senha atual seguidos deram 40 vezes 401, nenhum 429, `falhas_login` 0 e `bloqueado_ate` nulo, e o chute certo depois trocou a senha (`saidas/03`, `[A1]`). Só o limite global de 300 por minuto por pessoa (`servidor.ts:423`) segura. Quem rouba uma sessão (renovável por dias) pode descobrir a senha e ganhar acesso que sobrevive ao encerramento da sessão (ASVS 2.2.1). Reprodução: entrar, mandar `POST /auth/trocar-senha` com `senhaAtual` errada 40 vezes.
- **A2, anotado:** `trocar_senha` (049) continua SECURITY DEFINER, executável por `dc360_app`, gravando o hash sem conferir nada; toda a conferência mora em `servico.ts`. Hoje só esse caminho a chama; um chamador novo reabre o defeito. O conserto mínimo da rodada 4 admitia esta forma.
- **A3, anotado (continua das rodadas anteriores, lido no código, não medido de novo):** `/auth/sair` com token já rotacionado responde 204 sem encerrar a cadeia (`revogar_sessao` só pega a linha viva); a vigência (`auth/vigencia.ts:105-115`) não confere `expira_em` da sessão viva da família.

## Não verificado

- CI do SHA (ausente nesta sessão). Postgres 16 (o do job `implantavel`) não foi rodado por mim; a prova em banco real é em 17.6.
- `npm run test:api` completo não rodou por mim (o gatekeeper rodou `typecheck` e `test:isolamento`); rodei os oito arquivos de autenticação e recuperação em 17.6.
- Suspensão pelo console contra a troca não entrou na minha sonda (coberta por raciocínio: a troca não toca a linha do município; e pelos casos 8, 9 e 20 do repositório, verdes em 17.6).
- A contagem "não é o último administrador" sem trava (anotada pelo implementador) não foi medida.
- E2E de navegador do rebaixamento (seção 24 do e2e) não foi rodado por mim.

## Risco residual

A1 é o risco relevante para a régua ASVS: a troca de senha é um oráculo da senha atual para quem tem sessão. A2 deixa a regra da troca só na API. A janela de milissegundos e a leitura com papel antigo por até 15 minutos seguem como a fase registrou (F03-E02, F03-E03).

## Motivo do humano

Não se aplica a esta dimensão: tudo o que ela exige foi executado. A validação humana da etapa (Rafael ver as três sondas antes e depois) continua sendo do processo, não deste relatório.
