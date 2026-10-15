---
validador: red-team (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E09
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [UI, AUTH, API, LGPD]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito: **PASS na dimensão red-team**. As três rotas de quem administra (`GET /usuarios/:id/sessoes`, `POST /usuarios/:id/encerrar-sessoes`, `POST /usuarios/:id/redefinir-senha`) e as duas da própria conta (`GET /auth/sessoes`, `POST /auth/encerrar-sessoes`) resistiram a outro município, a outro papel, ao próprio id, a token de sessão encerrada e a conta desativada. A correção 2 desta etapa só mexeu na tela (`MinhaConta.tsx`, `app.css`), e as rotas são as da rodada 2. As reprovações das rodadas 1 e 2 eram de layout e foco (UX, QA, acessibilidade), fora desta dimensão. Saídas em `$SP/val/red-team/` (prefixos `E09-` e `E09E10-`).

| Critério | Resultado |
| --- | --- |
| Isolamento: coordenador de A contra conta de B, nas três rotas | PASS: 404 `nao_encontrado` com corpo idêntico ao de id inventado; a senha da conta de B não mudou (T1) |
| Agente chama as três rotas | PASS: 403 `sem_permissao` em todas, para alvo do próprio município, de outro município e inexistente (T2: o mesmo corpo nos três, sem oráculo) |
| Posto acima: 403 `posto_insuficiente`; outro município: 404 | PASS. O teste morde: mutação que tira `exigirPostoParaGerir` e troca o 404 por 403 em `GET /usuarios/:id/sessoes` reprova 2 casos; restaurado, 51 de 51 (`E09-03`, `E09-04`) |
| Autoredefinição e autoencerramento: 422 | PASS (T6) |
| Listagem sem IP e sem user-agent completo | PASS: `/auth/sessoes` devolve só "Chrome em Linux" e "Aparelho com iOS" para um user-agent hostil com `<img onerror>` e um marcador; nem o marcador nem o `onerror` voltam; `/usuarios/:id/sessoes` devolve só quantidade e datas (T3) |
| Conta desativada com token vivo não escreve | PASS: redefinir e encerrar sessões dão 403 `conta_desativada` (T5) |
| Sessão encerrada pelo administrador não derruba as sessões novas do dono | PASS: o token do "ladrão" leva 401 `sessao_encerrada` em `POST /auth/encerrar-sessoes` e na renovação; o dono continua escrevendo (T4) |

## Evidência

- Sonda `zz-rt-e09e10.test.ts` (cópia em `$SP/val/red-team/`; esteve em `apps/api/test/` só durante a execução e foi apagada). API real em PGlite com a semente dos dois municípios. Saída `E09E10-01-sonda-api.txt`, casos T1 a T6 verdes. O código 1 do arquivo vem de um caso da E10 com e-mail cercado de espaços: 422 de validação, igual para conta existente ou não, sem relação com a E09.
- Suítes `sessoes-da-conta`, `senha-e-sessoes`, `recuperacao*`, `superficie`: código 0, 7 arquivos, 95 casos (`E09E10-02-suites.txt`).
- Mutação e restauração com `git restore apps/api/src/rotas/administracao.ts`: `E09-03` (código 1, 2 falhas) e `E09-04` (código 0, 51 de 51). Depois, `git status --porcelain` sem mudança fora de `validacao/`.

## Cenários positivos

- A pessoa lista as próprias sessões, com "esta" marcada, e encerra as outras mantendo a de onde clicou.
- Quem administra vê quantas sessões outra pessoa tem, encerra e redefine, dentro do posto e do município.

## Cenários negativos

- Outro município: 404 idêntico ao de id inventado, nas três rotas.
- Agente: 403 nas três, para qualquer alvo.
- Coordenadora desativada com token vivo: 403 `conta_desativada` nas escritas.
- Token de sessão encerrada: 401 nas escritas e na renovação.

## Tentativas de reprovar

1. Usar o 403 contra o 404 como oráculo de existência entre municípios: o 404 é igual ao do id inventado; o 403 do agente é igual para qualquer alvo.
2. User-agent com HTML e marcador, para ver se volta inteiro na listagem: não volta, só o resumo.
3. O roteiro do celular roubado: o dono derruba as sessões, e o ladrão, com o token de acesso ainda dentro dos 15 minutos, tenta derrubar a sessão nova do dono. A escrita é recusada (vigência na escrita).
4. Coordenadora desativada que ainda tem token de acesso tenta redefinir a senha de um agente: recusada.

## Achados

**ANOTADO**

1. Leitura pura não confere a vigência: com o token de uma sessão já encerrada, `GET /auth/sessoes` devolve 200 com as datas e o aparelho resumido das sessões do dono, até o token de acesso vencer (no máximo 15 minutos, T4). Do mesmo jeito, uma coordenadora desativada ainda lê `GET /usuarios/:id/sessoes` (T5). É a decisão registrada no código (`servidor.ts`, vigência na leitura é da F03-E03). Sem IP nem user-agent completo, então o dado exposto é mínimo.
2. A senha temporária é conhecida de quem a sorteou e vale 72 horas (IDN-18, já em `PENDENCIAS.md`).
3. `redefinir-senha` deriva o scrypt (cerca de 128 MB) antes de conferir se o alvo existe. Um administrador pode repetir o pedido contra ids inventados. Fica limitado ao limitador global e a quem já tem `gerenciar_usuarios`.

## Não verificado

- As telas (`Usuarios.tsx`, `MinhaConta.tsx`) no navegador: são de QA, UX e acessibilidade. Esconder botão não é controle de acesso, e o controle foi provado na API.
- Postgres 17 real: a sonda usou PGlite. O 404 entre municípios vem do RLS, provado também pela suíte de isolamento do CI (job "Testes, tipos e scripts", run 38618369218).

## Risco residual

Nenhum explorável novo nesta dimensão. Fica a janela de leitura de até 15 minutos com token de sessão encerrada (anotado 1).

## Motivo do humano

Nenhum para esta dimensão.
