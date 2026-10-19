---
validador: seguranca-aplicacao (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---

## Critérios verificados

1. Token vencido, ausente ou com assinatura de outro segredo: 401 `nao_autenticado`. Confirmado.
2. Sessão encerrada por quem administra (e cadeia encerrada, `sid` alheio, senha provisória vencida): 401 `sessao_encerrada`. Confirmado.
3. Conta desativada: 403 `conta_desativada`, antes de `sessao_encerrada` mesmo quando a desativação revogou as sessões. Confirmado.
4. `/auth/renovar` de conta desativada (pelo endpoint real, que revoga as sessões, e por UPDATE sem revogar): 403 `conta_desativada`, repetível; token desconhecido e conta ativa encerrada saem com corpo idêntico (`sessao_encerrada`). Confirmado.
5. `/auth/entrar` com conta desativada: mesma recusa genérica, mesmo status e corpo da senha errada e do e-mail inexistente; o scrypt roda antes de olhar `ativo` (sem diferença de caminho). Confirmado.
6. Conta desativada do município A escrevendo em ocorrência do B: `conta_desativada` com corpo idêntico ao da ocorrência de A e ao de id inexistente (não confirma nada sobre B). Confirmado.
7. Catálogo: todo 401 e 403 de acesso emitido pela API está em `CODIGOS_DE_ERRO_DE_ACESSO`, com o status do catálogo; o código antigo `sessao` não aparece. Confirmado pela varredura de todas as rotas.
8. Corpo de erro sem dado a mais: só `erro` e `mensagem`. Confirmado nos seis ramos.

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/seguranca-aplicacao-E04-E05-E06-E08/` (abaixo, `<S>`).

- Sonda própria `<S>/sonda/codigos.test.ts` (servidor montado, PGlite semeado, token vencido e token forjado assinados na sonda com `jose`): código 0, 3 de 3; corpos de cada ramo em `<S>/codigos-log.txt`.
- Varredura de todas as 114 rotas registradas em 10 estados (`<S>/sonda/varredura.test.ts`, análise `<S>/varredura-analise.txt`): pares 401/403 observados, todos do catálogo: 401 `nao_autenticado`, 401 `sessao_encerrada`, 403 `conta_desativada`, 403 `acesso_suspenso`, 403 `troca_de_senha_obrigatoria`, 403 `sem_permissao`; 503 `acesso_suspenso` só nas rotas da fila.
- Testes na árvore: `codigos-de-erro.test.ts` 22 de 22 e os demais 17 arquivos de autenticação e fila (`<S>/api-relevantes-arvore.txt`, código 0); `packages/shared` `codigos-de-erro.test.ts` e `permissoes.test.ts` 26 de 26 (`<S>/shared-e05-e08.txt`); `apps/web` `sessao-e-entrada.test.ts` 27 de 27 (`<S>/web-e05-e08.txt`); app de campo `token.test.ts` e `api-conta-desativada.test.ts` entre 9 suítes, 109 de 109 (`<S>/campo-app-e06.txt`).
- Mordida (mutação numa cópia de `dc360/apps/api` em `<S>/api-mut`, árvore intocada, `diff -r` vazio depois): M4, `auth/vigencia.ts` sem a linha `if (vigencia.contaDesativada) throw new ContaDesativada();`: `codigos-de-erro` 3 reprovam, `campo-integracao` 1; minha sonda vê `401 sessao_encerrada` onde devia ser `403 conta_desativada` (`<S>/mutacoes-api.txt`). M2 (sem `exigirVigencia`) derruba 6 casos de `codigos-de-erro`.
- `shared/dist` e `campo/dist` conferidos contra uma compilação nova do fonte: idênticos (a API e os testes leem o `dist`).

## Cenários positivos

- Corpos obtidos (`<S>/codigos-log.txt`): sem token "Informe o token de acesso."; vencido e forjado "Token inválido ou expirado."; encerrada "Sua sessão foi encerrada ou o seu cadastro mudou. Entre novamente."; desativada "Sua conta foi desativada. Procure a coordenação do seu município: o que você já registrou continua guardado."
- Reativar pelo endpoint responde 200; o caso "reativada volta a entrar e a renovação antiga dá `sessao_encerrada`" é coberto por `codigos-de-erro.test.ts` (describe "Renovar depois de desativar PELO ENDPOINT real"), verde na árvore.

## Cenários negativos

- `/auth/entrar`: desativada com a senha certa, desativada com a senha errada, e-mail inexistente e conta ativa com a senha errada: os quatro 401 com o MESMO corpo `{"erro":"credenciais","mensagem":"Email ou senha inválidos."}`.
- `/auth/renovar` com token desconhecido e com token de conta ativa encerrada pelo administrador: mesmo 401 e mesmo corpo.
- Escrita da conta desativada em ocorrência do B, do A e inexistente: mesmos 403 e corpo.

## Tentativas de reprovar

1. Enumeração de conta pela entrada: comparei corpo e status nos quatro casos; e li `entrar` em `auth/servico.ts`: `conferirSenha` roda antes de `!linha.ativo`, então não há atalho rápido para conta desativada.
2. Enumeração pela renovação: token inventado e token real de sessão encerrada dão o mesmo corpo; só quem tem o token de renovação válido da conta desativada vê `conta_desativada`, como a etapa aceita.
3. Oráculo de outro município pela recusa: a vigência decide antes do handler, e o corpo não muda com o id.
4. Código fora do catálogo: varri todas as rotas em todos os estados; nenhum 401 ou 403 com código fora da lista.
5. Ordem invertida (desativada saindo como encerrada): mutação M4 reprova os testes e a sonda.
6. Regressão da correção 3 da E07: `emitirPar` agora recusa com `credenciais` (genérica) quando a credencial mudou ou a conta foi desativada entre a conferência e a abertura da sessão; e a renovação que perde a trava para uma desativação responde `conta_desativada` (`tratarTokenRecusado`). Coberto por `renovacao-contra-encerramento` em PostgreSQL 17, 30 de 30 (`<S>/renovacao-pg17.txt`).

## Achados

- Nenhum que quebre critério da etapa.
- Anotado (já conhecido, fora de segurança): a mensagem do 401 de `/auth/renovar` ("Sessão expirada. Entre novamente.") difere da mensagem do catálogo para `sessao_encerrada`. O código é o certo; só o texto diverge.

## Não verificado

- CI do SHA não lido (`gh` sem login).
- Telas do painel (capturas, frase na tela de entrada): não são desta dimensão; não abri navegador.
- `npm run test:api` completo e `npm run test --workspace @dc360/web` completo não rodados por mim; rodei os arquivos que tocam códigos e sessão.
- Tempo de resposta entre os ramos de `/auth/renovar` não medido (exige possuir um token de renovação válido).

## Risco residual

- Quem possui um token de renovação válido de uma conta desativada aprende que ela foi desativada; é o que a etapa decide e só vale para quem já teve a sessão.
- O motivo `conta_desativada` depende da migração 048 (`dono_do_token` com `usuario_ativo`); contra banco sem ela a renovação volta a `sessao_encerrada` (declarado).

## Motivo do humano

Nenhum para esta dimensão. A aprovação das três frases é texto de produto e pertence à validação de UX e ao Rafael, não ao critério de segurança, que foi provado por execução.
