---
validador: seguranca-aplicacao
modelo: claude-opus-5-5
etapa: V2-F00-E07
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, MOBILE, OFFLINE, A11Y, AUTH, AUTHZ, TENANT, RLS, DB, MIGRATION, API, DOCUMENTO, ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Produto de `1ed0b71`, rodado na árvore principal (HEAD `5044e7a`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md`). Postgres 17.6 real (binários de `SCRATCH/pg17`), cluster descartável meu em 127.0.0.1, porta 55931, `log_lock_waits=on`, `deadlock_timeout=200ms`, derrubado e apagado no fim. A API dos testes fala com o banco por `SET LOCAL ROLE dc360_app` (RLS forçada). Saídas em `SCRATCH/validadores/seguranca-aplicacao/` (SCRATCH é a pasta de scratchpad da sessão do gatekeeper).

1. Achado que reprovou a rodada 4 (troca de senha em voo desfaz a redefinição, o link, a troca em outro aparelho e a desativação): CONSERTADO. `trocarSenha` (`apps/api/src/auth/servico.ts`, bloco de `banco.comTenant` depois de `derivarSenha`) agora faz, numa transação sob o município: `SELECT ... FROM usuarios WHERE id = $1 FOR NO KEY UPDATE`, `travar_sessoes_do_usuario`, releitura (ativo, cadeia viva com `expira_em > now()`, provisória, hash igual ao conferido) e só então `trocar_senha` preservando a sessão viva da cadeia. Prova E2 sem grampo (sonda 04) e com grampo (suíte 01), e prova de que morde (05 e 07).
2. Sessão rotacionada só vale enquanto a cadeia vive; papel diferente do token responde 401 `nao_autenticado` e a renovação traz o papel novo; ex-coordenador rebaixado e renovado não despacha (403 `sem_permissao`); rebaixado continua sem ver B (404); provisória vencida não troca nem renova (401 `sessao_encerrada`): `familia-da-sessao.test.ts` 20 de 20 e `senha-provisoria.test.ts` 9 de 9 (01); sonda negativa própria em Postgres 17.6 (08) com as mesmas respostas pela rota real.
3. Login com a senha antiga contra as reações e renovação contra encerramento: cobertos pela minha sonda sem grampo (cada rodada dispara também um login com a senha antiga e uma renovação da cadeia do invasor) e pelos casos 1 a 20 do bloco de Postgres real do repositório (01).
4. Segundo fator: `segundo-fator.test.ts` 23 de 23 (01). O diff `bb0f654..1ed0b71` em `auth/segundo-fator.ts` é só o texto da mensagem `senha_nao_confere`.
5. Regressão obrigatória: `npm run test:api` com `DC360_POSTGRES_DE_PROVA` apontando para o cluster (106 arquivos, 1624 de 1624, zero pulado, saída 20); `npm run test:isolamento` 345 aprovados e 3 pulados de 348 (21); `npm run test:console` 274 de 274 (22).
6. Diff da rodada (`bb0f654..1ed0b71`) em `apps/api/src/auth/`, catálogo e guarda: revisado à procura de regressão de segurança (ver Tentativas de reprovar e Achados).

## Evidência

- `01-auth-pg17.txt`: `npx vitest run --root apps/api` de `renovacao-contra-encerramento` (53: 18 PGlite e 30 de Postgres real 17.6 mais 5 compartilhados), `recuperacao-morre-com-a-credencial` (7), `segundo-fator` (23), `senha-provisoria` (9), `familia-da-sessao` (20), `vigencia-na-escrita` (13), `corpo-ilegivel` (3): código 0, 128 de 128, nenhum pulado.
- `02` a `04-sonda-sem-grampo-pg17-conserto.txt`: sonda própria (`zz-sonda-seguranca-r6.test.ts`, cópia guardada em SCRATCH; copiada para `apps/api/test/` só durante a execução e retirada). 02 e 03 reprovaram por erro da própria sonda (ver Tentativas); 04 é a final: 100 rodadas (20 por reação), código 0, 0 falha, 0 erro 500.
- `05-sonda-MUTACAO-servico-de-bb0f654.txt`: a mesma sonda com o `servico.ts` de `bb0f654` (o código reprovado na rodada 4): código 1, 60 falhas em 60 rodadas, 36 delas "a senha do invasor vale depois da redefinição ou do link". Restaurado com `git restore`, `shasum -c` OK.
- `06-sonda-sem-grampo-pglite-conserto.txt`: a sonda em PGlite, 50 rodadas, 0 falha.
- `07-repo-corrida-MUTACAO-sem-hash-sem-trava.txt`: mutação minha (sem a comparação do hash conferido e sem `travar_sessoes_do_usuario` na troca) contra o arquivo da corrida em Postgres 17.6: 5 vermelhos (16, 19, 26, 33, 34). Restaurado, `shasum -c` OK.
- `08-sonda-negativas-pg17.txt`: requisições negativas reais (isolamento, vigência, provisória).
- `pg.log`: 0 `deadlock detected`, 0 `40P01` em todas as execuções (inclusive nas mutações).
- `20`, `21`, `22`: regressão.

## Cenários positivos

- Troca de senha legítima sem disputa: 200 e o token devolvido escreve (casos 18 e 34 do arquivo da corrida).
- Na disputa pela própria pessoa em dois aparelhos, exatamente uma troca vence e a senha que vale é a do vencedor (sonda 04: 10 vitórias da vítima, 10 do invasor, nunca as duas com 200).
- Redefinição por quem administra e link do email sempre deixam valendo a senha deles (sonda 04: 20 de 20 e 18 de 18; nos 2 de 20 do link em que a troca do invasor confirmou antes, o link morreu pela migração 051, que é a ordem serial "troca, depois link").
- Rebaixada renova e opera com o papel novo (08: renovar 200 com `papel: operador`).

## Cenários negativos

- Sonda sem grampo, Postgres 17.6, 100 rodadas, atrasos sorteados de 0 a 600 ms para a troca do invasor, a reação, um login com a senha antiga e uma renovação da cadeia do invasor, pool de 16 conexões. Invariantes conferidos por rodada: nenhum 500; a reação responde 200; nenhuma sessão viva da Helena fora da cadeia vencedora; o par entregue pelo login ou pela renovação disputados não renova depois; a senha do invasor não vale depois da redefinição ou do link, e a da reação vale. Resultado: redefinir (16 troca recusada 401 `sessao_encerrada`, 4 troca antes e desfeita), link (18 recusadas, 2 antes), desativar (20 recusadas 403 `conta_desativada`), troca da vítima (10 e 10), encerrar (20 recusadas 401). 0 violação.
- Requisições negativas (08): provisória vencida troca a senha, 401 `sessao_encerrada`; renova, 401; token de antes da desativação com a conta já reativada escreve, 401 `sessao_encerrada`; rebaixada com token velho despacha, 401 `nao_autenticado`; rebaixada renovada despacha, 403 `sem_permissao`; rebaixada lê e escreve em B, 404.

## Tentativas de reprovar

- Rodei a sonda sem grampo contra o conserto (04) e contra o código reprovado (05): o conserto fecha a classe (0 de 100) e a sonda pega o defeito antigo (60 de 60). Não é a prova do implementador: o desenho da sonda e os invariantes são meus.
- Mutação própria no arquivo da corrida do repositório (07): tirar a comparação do hash e a trava ainda deixa 48 verdes, mas 5 casos (16, 19, 26, 33, 34) reprovam; o repositório morde.
- Procurei falso positivo da minha sonda: as rodadas 02 e 03 acusaram (a) login com a senha válida depois de "encerrar sessões", que é legítimo porque encerrar não muda a credencial, e (b) link morto quando a troca do invasor confirmou antes, que é o comportamento da migração 051 (o link morre com toda mudança de senha). Conferi as duas pela ordem dos fatos (o link 401 só aparece com a troca 200 e atraso da troca menor) e ajustei a sonda para aceitá-las só nesses termos, exigindo nos dois casos que nada mais sobre. A versão final é a de `zz-sonda-seguranca-r6.test.ts` em SCRATCH.
- Procurei impasse: 0 `40P01` no log do Postgres em toda a sessão, inclusive com 16 conexões disputando.
- Revisei o diff `bb0f654..1ed0b71`: `servico.ts` (o conserto e o texto da mensagem), `segundo-fator.ts` (texto), `administracao.ts` (o id da rota em minúsculas antes das recusas sobre a própria conta, que fecha uma autoredefinição por caixa; reforço, não regressão), `servidor.ts` (instala a guarda de códigos de erro antes das rotas). A guarda só toca respostas 401 e 403, preserva o status, não converte 404 em 403 e, fora de teste, troca o corpo fora do catálogo pelo genérico do mesmo status; em teste vira 500, então todo código exercitado pela suíte (inclusive `conta_desativada`, `sessao_encerrada`, `nao_autenticado`, `credenciais`) passa pelo contrato: `guarda-de-codigos-de-erro`, `codigos-de-erro` e `prova-dinamica` verdes (saída `19` do lote).

## Achados

- Anotado (continua desde as rodadas 2 e 3, fora do escopo e já registrado): `/auth/sair` com token já rotacionado não encerra a cadeia; a vigência da escrita não confere `expira_em` da sessão viva da família (a troca de senha confere). Não medidos de novo nesta rodada.
- Anotado: na troca concorrente pela própria pessoa vence quem grava primeiro; se for o invasor, a vítima recebe 401 às claras e precisa da redefinição ou do link (medido: 10 de 20 na sonda). É ordem serial válida e está declarado pelo implementador.
- Nenhum achado bloqueia.

## Não verificado

- Postgres 16 (o do job `implantavel` do CI) não foi rodado; só 17.6 real e PGlite.
- CI do SHA ausente (H32); a prova é a execução local.
- O E2E de navegador do painel (rebaixar coordenador logado e ver a próxima ação renovar em silêncio) não foi rodado por mim; o comportamento de API que ele exercita foi provado pela rota real (08).
- Leitura com token de quem foi rebaixado ou desativado por até 15 minutos (F03-E03) e a janela de escrita em voo depois da desativação (risco residual da E04) não foram medidas aqui.
- Desligar o segundo fator em disputa com a redefinição não ganhou sonda própria minha.

## Risco residual

A garantia contra a troca em voo depende da ordem "linha de `usuarios`, trava, releitura" em todos os caminhos; uma mutação dessa ordem é pega pelo caso 19 e pelos casos de disputa segurada, e a sonda sem grampo cobre a classe. Sobram os anotados de rodadas anteriores (sair com token rotacionado, `expira_em` na vigência) e a vigência só na escrita.

## Motivo do humano

não se aplica
