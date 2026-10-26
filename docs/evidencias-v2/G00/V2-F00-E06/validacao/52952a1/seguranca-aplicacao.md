---
validador: seguranca-aplicacao (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E06
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, AUTH, AUTHZ]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Veredito da dimensão: **PASS**. Nenhum defeito de autenticação, sessão, autorização ou isolamento que viole critério da E06 foi reproduzido neste SHA. Os dois achados "corrigir antes de crescer" da rodada 2 (foto sem recorte de equipe; teto reservado por um token de agente) continuam mordendo e continuam fora do escopo da etapa. Nível E2 obtido do lado do servidor (API real em processo próprio contra Postgres 17 real); do lado do aparelho o nível é E1 (jest e vitest com a fila, o transporte e o SQLite reais), porque não há emulador Android nesta máquina.

Saídas em `$SP/val/seguranca-aplicacao/lote2/` (abaixo, `L2/`).

| Critério (DoD, cinco campos, foco desta dimensão) | Resultado | Prova |
| --- | --- | --- |
| 401 de sessão e 403 `conta_desativada` deixam o item `pendente`, sem bloquear, sem contar tentativa, dreno parado; 403 `sem_permissao` continua permanente | PASS | `L2/02-pacote-campo.txt` (10 arquivos, 223 de 223); mutação M1 (`conta_desativada` volta a `FalhaPermanente`): 6 vermelhos de 223 em 2 arquivos (`L2/mut/M1-*.txt`) |
| Token de uma pessoa nunca sai no item de outra (portão de autoria em `prontos` e conferência antes de CADA chamada) | PASS | M2 (conferência por chamada só pela marca do dreno): 1 vermelho, "trocar de conta com a foto em voo: nenhum pedido seguinte sai com a conta nova"; M3 (sem o portão de `prontos`): 1 vermelho (a conferência por chamada segura o resto, defesa em profundidade); M4 (os dois juntos): 8 vermelhos em 4 arquivos, inclusive "a coleta de um agente NAO sobe com o token do agente do turno seguinte" (`L2/mut/M2..M4-*.txt`) |
| Renovação forçada é uma só, com piso, e não vira laço contra servidor que disse não | PASS | M9 (repetir com o MESMO token): 2 vermelhos ("nem repete o pedido", "a fila pausa e o item fica"); M10 (`token.ts` sem o piso de 60 s): 4 vermelhos de 19 (`L2/mut/M9-*.txt`, `M10-*.txt`) |
| Correção 2: uma fila só por aparelho (`obterFila` guarda a promessa) | PASS | `L2/03-app-campo-suites.txt` (16 suítes, 129 de 129); M5 (`fila ??=` trocado por `fila =`): 6 vermelhos de 9 em `obter-fila-uma-so`, `faixa-ligada-a-fila-real` e `troca-de-conta-com-pedido-em-voo` (`L2/mut/M5-*.txt`) |
| Rota de evidência (autorizar, PUT, confirmar): autor do token, 409 `autor_divergente`, tenant 404 | PASS | M6 (autorizar sem conferir `coletadaPor`): 3 vermelhos de 28; M7 (confirmar sem conferir `anexada_por`): 3 vermelhos; M8 (reautorizar chave alheia): 2 vermelhos (`L2/mut/M6..M8-*.txt`); sondas abaixo |
| PUT de evidência: assinatura, tamanho, tipo, tenant | PASS (com um achado anotado) | sonda em PGlite `L2/10-sonda-e06-evidencia.txt` (6 de 6) e contra a API real em Postgres 17 `L2/11-sonda-e06-evidencia-pg17.txt` |
| Conta desativada entre enfileirar e drenar: 403 `conta_desativada`, nada marcado | PASS | sonda: autorizar e confirmar com a conta desativada respondem 403 `conta_desativada` e `enviada_em` fica nulo; `POST /sincronizacao/vistoria` também 403 antes de validar o corpo (`L2/11-*.txt`) |
| O que fica no armazenamento do aparelho | PASS | credenciais só em `expo-secure-store` com `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (`apps/campo/src/dados/sessao.tsx:80-84`); o item da fila guarda `chave`, `evidenciaId` e `enviada` por foto, nunca URL assinada nem token (`packages/campo/src/tipos.ts:72-93`); a pausa vive só na memória |
| Defeitos das rodadas 1 e 2 desta etapa | ver abaixo | |

Defeitos das rodadas anteriores, reexecutados neste SHA:

- Rodada 1, 403 `troca_de_senha_obrigatoria` bloqueava a fila: não morde mais (matriz `pausa-por-senha-provisoria.test.ts` verde em `L2/02-*`; o caso é coberto pelos 223).
- Rodada 1, `confirmar-envio` gravava `evidencia_anexada` com o autor da conta nova: não morde (sondas: Ana confirmando foto do Diego recebe 409 `autor_divergente`, zero evento na trilha; M7 prova que o teste segura).
- Rodada 2, `obterFila` criava várias instâncias: não morde (M5).
- Rodada 2, "corrigir antes de crescer", foto sem recorte de equipe: AINDA MORDE. Diego (Alfa) autoriza foto em ocorrência despachada à Bravo: 201; a lista de fotos da mesma ocorrência para ele: vazia (`L2/12-sonda-e06-rodada2.txt`).
- Rodada 2, "corrigir antes de crescer", teto reservado por um token: AINDA MORDE. Com o teto em 1 GiB (mínimo do banco), um token de agente faz 102 reservas de 15 MB sem enviar byte em 475 ms (PGlite) até o 507; desativar a conta não libera; a colega ainda sobe uma foto de 5 MB e a seguinte, de 1 MB, recebe 507 `teto_de_armazenamento` (`L2/12-*.txt`). Sem perda de dado (507 é temporário na fila).

## Evidência

- `cd dc360 && npm run build:shared`: código 0 (`L2/00-build-shared.txt`).
- `packages/campo`: `npx vitest run`, 10 arquivos, 223 de 223, código 0 (`L2/02-pacote-campo.txt`).
- `apps/campo`: `npx jest` em 16 suítes (obter-fila-uma-so, pausa-da-fila, precisao-do-gps, sair-e-entrar, sessao, token, troca-de-conta-com-pedido-em-voo, dialogo-na-conta, dialogo-na-conta-com-vistoria-comecada, faixa-ligada-a-fila-real, fila-pausada-pela-sessao, a-lista-com-a-fila-pausada-nao-pede-sinal, a-sessao-vencida-nao-apaga-a-vistoria, vistoria-sessao-vencida-preserva-o-rascunho, evidencia-no-disco, dialogo-na-fila): 129 de 129, código 0 (`L2/03-app-campo-suites.txt`).
- `apps/api`: 18 arquivos (evidencia-so-do-autor, campo-integracao, evidencias, autoria-da-coleta, cors-do-envio-de-evidencia, teto-de-armazenamento e os de E10 e E12): 217 de 217, código 0 (`L2/01-api-suites-alvo.txt`).
- Mutações M1 a M10 com `L2/mut/rodar.sh`: aplica a troca com `perl`, guarda o diff (`L2/mut/<nome>.diff`), roda, `git restore`, confere o SHA-256 do arquivo antes e depois (iguais em todas). `git status --porcelain` depois de cada uma: só os relatórios não rastreados.
- Postgres 17.10 descartável na porta 55541 (papéis como o job `implantavel`: `dc360_setup` dono, `dc360_api` restrito com `dc360_app`), 50 migrações (`L2/23-migrar.txt`), semente (`L2/24-semear.txt`), API real `npx tsx src/index.ts` na porta 55542 com `PROXY_DE_BORDA=fly` (`L2/pg/api.log`). Tudo derrubado e apagado ao final (`L2/90-pg-stop.txt`).
- `npm run test:isolamento`: 14 arquivos, 345 aprovados e 3 pulados, código 0 (`L2/60-test-isolamento.txt`).

## Cenários positivos

- Diego autoriza, faz o PUT e confirma a própria foto na API real: 201, 200, 200; um evento `evidencia_anexada` com autor Diego (`L2/11-*`).
- A mesma pessoa reautoriza a própria chave e recebe a mesma evidência; reativada a conta, a coleta sobe com a mesma chave de idempotência (`campo-integracao.test.ts`, verde).

## Cenários negativos

- Vale Fundo contra evidência de Serra Alta: autorizar 404, confirmar 404, URL de leitura 404, lista de fotos vazia; nunca 403 (PGlite e Postgres 17).
- Mesma `idempotencyKey` de Serra Alta reusada por Vale Fundo: não devolve a evidência de Serra Alta (a unicidade é por município, `UNIQUE (organizacao_id, idempotency_key)`).
- Ana confirma foto do Diego: 409; Ana reautoriza a chave do Diego sem `coletadaPor`: 409, sem URL; coordenadora confirma: 403 `sem_permissao`. Nenhum evento na trilha.
- PUT com a chave trocada na mesma assinatura: 403; com chave de outro município: 403; com a validade esticada: 403; corpo vazio: 400; PUT repetido na chave já escrita: 412 (escrita única).
- Bytes maiores que o autorizado sobem pela URL local, mas a confirmação recusa com 409 `tamanho_divergente`, `enviada_em` nulo, zero evento; 15 MB + 1 e `text/html` na autorização: 422.

## Tentativas de reprovar

1. Token de B no item de A por janela entre a conferência e a leitura do token: removi as duas barreiras do motor (M4) e 8 testes caíram; removi cada trava do servidor (M6, M7, M8) e cada uma tem teste que cai. A defesa é em profundidade e cada camada morde.
2. Fila duplicada com pausa e marca próprias (correção 2): M5 vermelho. Conferi também que as sete chamadas de `obterFila` passam o `obterToken` e o `lerIdentidade` estáveis de `useSessao` (`sessao.tsx:132,175`), então a primeira chamada vencer não prende a fila numa identidade velha.
3. Laço de renovação: M9 e M10 vermelhos.
4. PUT com tipo fora da lista (`text/html`, `image/svg+xml`): recusado, mas com 500 em vez de 415 (achado 3, anotado). Nome de arquivo hostil (`../../tenant/<outro>/<img onerror>.png`): vira sufixo higienizado dentro de `tenant/<município do token>/ocorrencias/<id>/`, cinco segmentos, sem `<` nem `>`.
5. Item que vira descartável indevidamente: a pausa por sessão nunca oferece Descartar (testes da tela verdes). Mas `descartar` aceita item de OUTRO autor em qualquer estado, com pergunta nominal (`packages/campo/src/fila.ts:1357-1378`): o agente A pode apagar a coleta guardada do agente B desativado. Já registrado em `apps/campo/PENDENCIAS.md` (achado 2).
6. Conta desativada tentando escrever com corpo inválido: 403 `conta_desativada` sai antes da validação do corpo, sem vazar nada.

## Achados

**Corrige antes de crescer (não reprova a E06; anteriores à etapa)**

1. `POST /evidencias/autorizar-envio` sem recorte de equipe (rodada 2, ainda morde): agente da Alfa anexa foto em ocorrência da Bravo (201). Reprodução: `L2/sondas/e06-evidencia.test.ts`, caso "rodada 2", saída `L2/12-sonda-e06-rodada2.txt`. Dono: decisão de domínio do Rafael, conserto antes do piloto.
2. Reserva de teto por um token de agente (rodada 2, ainda morde): 102 reservas de 15 MB em menos de meio segundo esgotam 1 GiB; desativar a conta não libera; a colega recebe 507 numa foto de 1 MB. Mesma reprodução. Dono: migração 035 e rota de evidência, antes do piloto.
3. `descartar` de item de outro autor em qualquer estado (registrado em `apps/campo/PENDENCIAS.md`, seção "Ainda aberto"): perda de coleta de quem foi desativado por ação de colega, com confirmação nominal. Dono provável: CP-24 / F14-E02.

**Anotado**

4. `PUT /armazenamento/objeto` com `content-type` sem analisador (`text/html`, `image/svg+xml`) responde 500 `erro_interno` em vez de 415 (corpo genérico, com código de requisição, sem detalhe). Rota só de desenvolvimento e teste (produção recusa subir sem armazenamento externo). Mesma família do "corpo JSON inválido responde 500" (F02-E03).

## Não verificado

- Emulador Android e aparelho físico (E2 do aparelho e E4): não há emulador nesta máquina. O cenário "desativar no painel durante a coleta e ver a frase no aparelho" não foi executado por mim; a prova do aparelho é jest com a fila, o depósito e o SQLite reais.
- `expo-secure-store` real e o Keychain do iOS: só leitura do código.
- PUT contra provedor S3 real (o tipo e o tamanho assinados em `x-amz-*`): só o armazenamento em memória; o adaptador S3 tem teste próprio contra o vetor oficial, que não reexecutei.
- Rede lenta real para a janela entre a conferência do motor e o pedido (fechada no servidor por M6 a M8).

## Risco residual

- Achados 1 e 2: escrita em dossiê de outra equipe e indisponibilidade do envio de fotos do município por um token de agente, até o piloto.
- O aparelho continua com a fila em texto claro no SQLite (F14-E04, fora do escopo).

## Motivo do humano

Ver a frase da pausa e a coleta preservada num aparelho (emulador Android ou aparelho físico): esta máquina não tem emulador, e a etapa pede E2 no emulador e a aprovação das frases pelo Rafael.
