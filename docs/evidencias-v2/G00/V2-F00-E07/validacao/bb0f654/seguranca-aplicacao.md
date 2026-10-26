---
validador: seguranca-aplicacao (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E07
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [AUTH, DB, MIGRATION, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: media
humano_necessario: nao
escalar: arbitragem de escopo (gatilho 9) se o gatekeeper entender que o achado 1 é de outra etapa; pelo item 2 da seção 7 de 28 ele não admite risco aceito
---
## Critérios verificados

| Critério | Resultado | Prova |
| --- | --- | --- |
| Defeito da rodada 3: login com a senha antiga no mesmo instante de troca, redefinição ou desativação não deixa sessão viva | PASS | `renovacao-contra-encerramento.test.ts` 30 de 30 com o bloco de Postgres 16 real ligado, nenhum pulado (`saidas/01`); mutações M1 (sem releitura) e M2 (login sem trava) derrubam 10 e 8 casos (`saidas/10`, `11`) |
| Segundo fator: desafio emitido antes da troca de senha não abre sessão nem liga o recurso | PASS | `segundo-fator.test.ts` 23 de 23; M3a, M3b e M3c derrubam cada uma o seu caso (`saidas/12` a `14`); desafio usado fora do propósito recusado (S3, bloco C) |
| Renovação que perde a trava para a desativação responde 403 `conta_desativada` | PASS | caso 9 verde; M4 o derruba (`saidas/15`) |
| Corpo ilegível ou malformado não vira 500 | PASS | S3 bloco A: 165 pedidos em 15 rotas com 11 corpos ruins, 0 respostas 5xx; M5 derruba 2 de 3 (`saidas/16`) |
| Código de erro certo em cada ramo (401 `nao_autenticado`, 401 `sessao_encerrada`, 403 `conta_desativada`, 403 `troca_de_senha_obrigatoria`) | PASS | S3 bloco B, 15 ramos conferidos; M6 (prazo da provisória fora da vigência) derruba o caso novo (`saidas/17`) |
| Enumeração de conta por mensagem ou tempo no login | PASS | S3 bloco F: e-mail inexistente, senha errada, conta desativada e conta bloqueada (as duas com a senha certa) respondem a mesma mensagem 401 `credenciais` e mediana entre 227 e 228 ms |
| **Troca de senha e senha provisória sob mudança concorrente de credencial (sessão revogada, item 2 da seção 7)** | **FAIL** | achado 1: S1 3 de 3 com grampo; S2 8 de 8 sem grampo (PGlite); S4 8 de 8 sem grampo em Postgres 16.13 real |

## Evidência

Todas as saídas estão em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/seguranca-aplicacao-E07/saidas/` (os JWT foram redigidos). As sondas estão em `.../seguranca-aplicacao-E07/sondas/`. Postgres 16.13 descartável (`embedded-postgres` 16.13.0-beta.16, instalado só em `.../seguranca-aplicacao-E07/pg/`), porta 55977, superusuário com senha sorteada que não foi gravada aqui; desligado no fim (`pg_ctl stop`, porta livre conferida); 0 linha com "deadlock" ou 40P01 no log dele.

- `01-suites-alvo-pg16-real.txt`: `npx vitest run --root apps/api` com os arquivos `renovacao-contra-encerramento`, `segundo-fator`, `senha-provisoria`, `corpo-ilegivel`, `familia-da-sessao`, `vigencia-na-escrita` e `codigos-de-erro`, com `DC360_POSTGRES_DE_PROVA` apontando para o Postgres descartável. Código 0: 7 arquivos, 119 de 119, nenhum pulado.
- `10` a `17`: as mutações M1 a M6 (descritas em Tentativas de reprovar). Todas saíram com código 1, e cada uma foi desfeita com `git restore` logo depois. Ao fim, `git diff --stat` estava vazio.
- `s1-troca-de-senha-disputada.txt` (sonda `s1-...mts`, PGlite, grampo depois do COMMIT da leitura da senha atual em `trocarSenha`): código 0, 3 de 3 com furo.
- `s2-troca-em-laco-contra-redefinicao.txt` (PGlite, sem grampo): código 0, 8 de 8 com furo.
- `s4-troca-em-laco-postgres-real.txt` (Postgres 16.13 real, `bancoPostgres` com 8 conexões, sem grampo): código 0, 8 de 8 com furo.
- `s3-negativos-de-api.txt`: código 0, blocos A a F.

Comando das sondas: `cd dc360/apps/api && npx tsx <sonda>.mts`.

## Cenários positivos

- Renovação normal: o token anterior escreve durante e depois da rotação (caso 5 nos dois blocos, verde).
- Papel rebaixado: o token velho leva 401 `nao_autenticado`, a renovação traz o papel novo e o operador não despacha (403 `sem_permissao`) (`familia-da-sessao`, verde).
- Provisória no prazo troca a senha. Uma escrita comum com a provisória no prazo leva 403 `troca_de_senha_obrigatoria` (S3 B).
- Login, segundo fator e ativação com a credencial intacta abrem sessão (suítes verdes).

## Cenários negativos

- S3 B: sem token ou com token forjado, 401 `nao_autenticado`. Sessão encerrada: escrita, troca de senha e renovação levam 401 `sessao_encerrada`. Papel rebaixado: escrita e troca de senha com o token velho levam 401 `nao_autenticado`. Conta desativada: escrita e renovação levam 403 `conta_desativada`, e entrar leva 401 `credenciais` (genérica). Provisória vencida: escrita, troca e renovação levam 401 `sessao_encerrada`, e entrar leva 401 `senha_provisoria_vencida`.
- S3 C: desafio de qualquer propósito usado como Bearer leva 401 em leitura e escrita. O desafio de ativação na segunda etapa do login e o de segundo fator em `/segundo-fator/iniciar` levam 401.
- S3 A: corpo JSON vazio ou torto, `null`, lista, texto, número, campos com tipo errado, texto puro, formulário, 1,2 MB e `__proto__`. As respostas foram 400, 413, 415 ou 422, nunca 5xx.
- Desvio desta sonda: em S3 as rotas `/usuarios/...` rodaram sem token válido. Com o segundo fator ligado, a administradora recebe desafio e não token, então ali só a leitura do corpo foi exercitada. A autorização dessas rotas ficou coberta pelas suítes.

## Tentativas de reprovar

1. M1: tirei a releitura de `senha_hash` e `ativo` em `emitirPar`. Ficaram vermelhos 10 de 53: os casos 6 a 8, 10 a 12 e 17 a 19, mais o do desafio do segundo fator. Restaurado.
2. M2: tirei `travar_sessoes_do_usuario` do login. Ficaram vermelhos 8 de 30: os casos 10, 14 a 20 e "a disputa não aconteceu". Restaurado.
3. M3a, M3b e M3c: a impressão `cr` ignorada na segunda etapa, na conferência sob trava da ativação e nas rotas do desafio. Cada mutação derrubou exatamente o seu caso. Restaurado.
4. M4: tirei `tratarTokenRecusado` do ramo perdedor de `renovar`. O caso 9 ficou vermelho. Restaurado.
5. M5: desliguei o tratador `FST_ERR_CTP_*`. Ficaram vermelhos 2 de 3, e o controle sem corpo seguiu verde. Restaurado.
6. M6: tirei o prazo da provisória de `exigirVigencia`. O caso novo de `senha-provisoria` ficou vermelho, e o achado de teste da rodada 3 está fechado. Restaurado.
7. Procurei o mesmo padrão do defeito da rodada 3 (credencial conferida numa transação e efeito gravado em outra, sem trava nem releitura) nos outros caminhos de credencial. Encontrei-o em `trocarSenha`: achado 1.
8. Rodei corpos ruins, códigos de erro, desafio fora do propósito, `/auth/sair` com token rotacionado, troca de senha com o token anterior à renovação e tempo de resposta do login (S3).

## Achados

**1. FAIL (bloqueia; item 2 da seção 7 de 28, autenticação e sessão revogada; origem BZ-F:P0-SEG). A troca de senha com a senha ANTIGA desfaz a redefinição ou a troca concorrente.**

`trocarSenha` (`apps/api/src/auth/servico.ts:1065-1131`) lê `senha_hash` e `senha_provisoria_ate` numa transação. Depois gasta dois scrypt fora do banco (confere a senha atual e deriva a nova, cerca de 460 ms). Só então chama `trocar_senha` (migração 049, linhas 130-152) em outra transação. Essa função grava o hash sem conferir nada: nem o hash anterior, nem `ativo`, nem se a sessão de quem pede continua viva. A vigência da rota é conferida só no começo do pedido. É o mesmo padrão que a correção 3 consertou no login e no segundo fator, sem conserto aqui.

Efeito medido: quem tem a senha antiga e uma sessão manda `/auth/trocar-senha`. Enquanto o pedido está no scrypt, quem administra redefine a senha (o remédio contra invasão), ou a própria pessoa usa o link do e-mail, ou troca a senha em outro aparelho. A mudança responde 200 e encerra a sessão do invasor. Depois o pedido do invasor termina com 200 e grava a senha DELE. O resultado, nas três mudanças:

- a senha do invasor passa a valer (login 200);
- a senha temporária ou a nova da pessoa é recusada (401);
- `senha_provisoria_ate` volta a NULL, então a troca obrigatória some;
- `trocar_senha` do invasor encerra as sessões da pessoa legítima.

Reprodução:

- S1, com grampo: 3 de 3.
- S2, sem grampo: o invasor mantém um pedido de troca sempre em voo, o que é trivial e não tem limite por endereço. Deu 8 de 8 em PGlite.
- S4, sem grampo, em Postgres 16.13 real com conexões concorrentes: 8 de 8.

Nenhum teste do repositório cobre o caso.

Conserto mínimo (não implemento): fazer `trocar_senha` (ou a transação que a chama) tomar a trava da pessoa, reler o hash e conferir que ele ainda é o que o scrypt aceitou e que a sessão ainda está viva, recusando com 401 se mudou. Pode ser comparação do hash dentro da função, ou uma versão da credencial. Acrescentar caso segurado no bloco de Postgres real.

**2. CORRIGE ANTES DE CRESCER: troca de senha com o token anterior à renovação derruba a própria cadeia.** `trocar_senha` preserva a sessão pelo `id` (`id <> p_sessao_preservada`), e não pela família, como `encerrarSessoes` faz desde a correção 1. Com o token emitido antes de uma renovação, a resposta é 200 com a mensagem "As outras sessões foram encerradas". Porém o acesso devolvido leva 401 `sessao_encerrada` e a própria cadeia não renova mais (401) (S3 E). O erro é para o lado seguro, mas a mensagem é falsa e a pessoa é expulsa.

**3. ANOTADO (continua desde a rodada 3): `/auth/sair` com token já rotacionado** responde 204 e não encerra nada. A sessão viva da cadeia continua, e o par novo renova 200 (S3 D).

**4. ANOTADO (continua desde a rodada 2): a vigência não confere `expira_em` da sessão viva da família** (`vigencia.ts`, consulta de `sessao_viva`). O efeito prático é nulo enquanto a renovação durar dias e o acesso 15 minutos.

Situação dos achados "corrige antes de crescer" da rodada 3:

- 403 na renovação perdedora: corrigido (caso 9 e M4).
- Mutação M7 sem teste: corrigido (M6).
- Corpo vazio em `encerrar-sessoes` respondendo 500: corrigido (S3 A e M5).
- `/auth/sair` com token rotacionado: continua (achado 3).
- `expira_em` da família: continua (achado 4).

`exigirPermissao`: as escritas administrativas desta etapa (`redefinir-senha`, `situacao`, `encerrar-sessoes` de terceiro) passam por `autorizar(..., "gerenciar_usuarios")`. As rotas sobre a própria conta (`trocar-senha`, `encerrar-sessoes`, segundo fator) ficam de fora por decisão documentada no código, igual às rodadas anteriores.

## Não verificado

- Uma campanha própria de disputa natural (sem grampo e com atrasos sorteados) do defeito da rodada 3 em Postgres real. Montei a sonda, mas ela não chegou a rodar. O fechamento desse defeito fica provado pelos casos segurados 10 a 20 em Postgres 16 real, que rodaram verdes, e pelas mutações M1 e M2, que os derrubam.
- Postgres 17 (a produção). A prova em Postgres real foi em 16.13.
- O run do CI do SHA (não lido, ver cabeçalho).
- O achado 1 na desativação concorrente (a senha do invasor gravada numa conta desativada passa a valer se ela for reativada): a conclusão vem da leitura do código, sem medição.
- A autorização das rotas `/usuarios/...` com corpo ruim e token válido (ver o desvio em Cenários negativos).

## Risco residual

Quem tem a senha antiga e uma sessão aberta consegue desfazer, com certeza e sem janela estreita, o remédio de quem administra ou da própria pessoa (redefinição, link ou troca), recuperar a conta e derrubar a pessoa legítima. Até o achado 1 ser consertado, a garantia "redefinir a senha expulsa o invasor" não vale.

## Motivo do humano

Nenhum: os defeitos e os fechamentos são verificáveis por execução, e foram executados.
