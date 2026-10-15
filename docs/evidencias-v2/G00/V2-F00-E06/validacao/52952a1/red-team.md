---
validador: red-team (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E06
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [MOBILE, OFFLINE, AUTH, AUTHZ]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Veredito: **PASS na dimensão red-team**. Nenhuma das tentativas fez coleta ser perdida, duplicada no servidor ou enviada com sucesso pela conta de outra pessoa. Ficam dois achados "corrige antes de crescer": um anterior (o teto do município esgotado por reservas, que ainda morde) e um afinado nesta rodada (a renovação dentro do transporte atravessa a troca de conta). O código do motor (`packages/campo/src/fila.ts`, `transporte.ts`) e as rotas da API são os mesmos da rodada 2. O que a correção 2 mudou nesta etapa está no aplicativo (`apps/campo/src/dados/fila.ts`, `index.tsx`, `ordem-do-dia.ts`, `pausa-da-fila.ts`). Saídas em `$SP/val/red-team/` (arquivos com prefixo `E06-`).

| Critério ou defeito anterior | Resultado nesta rodada |
| --- | --- |
| DoD: nenhum item bloqueado ou descartado por 401 ou 403 de sessão ou conta | PASS: 401 `sessao_encerrada`, 403 `conta_desativada`, 403 `troca_de_senha_obrigatoria` e "sem token" pausam com item `pendente`, 0 tentativa e 0 bloqueado, contra a API real (sondas R3, R4 e R5, suítes `campo-integracao`) |
| Positivo: 401 `nao_autenticado` renova uma vez e envia; retomada sem duplicar | PASS: suíte `campo-integracao` ("token vencido") e sonda R3 (servidor gravou, resposta forjada 401, retomada com `duplicados: 1` e 1 vistoria) |
| Negativo: 403 `sem_permissao` ainda bloqueia | PASS (suíte `campo-integracao`) |
| Autorização: itens do B esperam o autor e não sobem com a sessão do A | PASS no caminho normal (sonda P1, com `obterFila` e `banco-local` reais). Sob corrida na renovação o pedido sai com o token do A e o servidor recusa (achado 2) |
| Integração: desativar entre enfileirar e drenar dá 403 e o item fica | PASS (suíte e sonda R4, desativação no meio do envio da foto) |
| Rodada 1, A1: 403 `troca_de_senha_obrigatoria` bloqueava tudo com "Descartar" | Não morde mais. O teste morde: mutação que tira o ramo `trocar_a_senha` de `falhaDaResposta` reprova 4 casos do pacote e 2 do app (`E06-09`, `E06-10`) |
| Rodada 1, AU1: `evidencia_anexada` com autor errado na trilha | Não morde mais: sonda R2 força a troca de conta no `confirmar-envio`, o servidor responde 409 `autor_divergente` e a trilha não ganha evento com a outra pessoa; o Diego volta e a foto sobe uma vez, com ele como autor |
| Rodada 1, D2: 401 tardio rebaixava item `confirmado` | Não morde mais. O teste morde: tirar a releitura de `devolverAoEstadoAnterior` reprova "dois drenos: o 401 tardio..." (`E06-12`) |
| Rodada 2: `obterFila` com várias instâncias e faixa sem a pausa | Não morde mais. O teste morde: `obterFila` de volta à versão antiga (memo da fila resolvida) reprova 6 de 7 casos de `obter-fila-uma-so` e `faixa-ligada-a-fila-real`; restaurado, 7 de 7 (`E06-02`, `E06-03`) |
| Rodada 2: `troca-de-conta-com-pedido-em-voo` dependia da ordem | Não morde mais: 8 sementes novas (11 a 18) com `--randomize`, 9 de 9 em todas (`E06-07`) |
| Rodada 2, achado: um token de agente esgota o teto do município | **Ainda morde** (achado 1) |

## Evidência

- `npm run build:shared` em `dc360/`, código 0 (`00-build-shared.txt`).
- `npx jest` (em `apps/campo`) de `obter-fila-uma-so`, `faixa-ligada-a-fila-real`, `troca-de-conta-com-pedido-em-voo`, `pausa-da-fila`, `ordem-do-dia` e `a-lista-com-a-fila-pausada-nao-pede-sinal`: código 0, 54 e 5 casos (`E06-01-base-verde.txt`).
- Mutação de `obterFila`: código 1, 6 falhas e 1 aprovado; `git restore`, SHA-1 do arquivo igual antes e depois (`e43d3eb1...`), 7 de 7 (`E06-02`, `E06-03`).
- `npx vitest run` de `campo-integracao`, `evidencia-so-do-autor`, `evidencias` e `senha-provisoria` (em `apps/api`, PGlite): código 0, 4 arquivos, 56 casos (`E06-04`).
- Motor `@dc360/campo`: código 0, 10 arquivos, 223 casos (`E06-05`).
- Sonda de API `zz-rt-e06.test.ts` (cópia em `$SP/val/red-team/`; esteve em `apps/api/test/` só durante a execução e foi apagada): código 0, 5 de 5, saída `E06-06-sonda-api.txt`.
- Sonda do aplicativo `zz-rt-e06-app.test.ts` (idem, em `apps/campo/src/dados/`, apagada): código 0, 2 de 2, saída `E06-08-sonda-app.txt`.
- Sonda do teto `zz-rt-teto.test.ts` (idem, apagada): saída `E06-11-teto-reservas.txt`.
- Mutações D2 e `troca_de_senha_obrigatoria`: `E06-12`, `E06-09`, `E06-10`; depois de cada `git restore`, a suíte voltou a 223 e 64 de 64, e `@dc360/campo` foi reconstruído.
- `git status --porcelain` depois de cada restauração: só as pastas `validacao/52952a1/` já existentes de outras etapas e as deste lote.

## Cenários positivos

- R3: resposta perdida depois de o servidor gravar. A retomada recebe `duplicados: 1` e há 1 vistoria.
- R4: conta desativada entre autorizar a foto e confirmá-la. A fila pausa com `conta_desativada`; depois da reativação sobem 1 evidência, amarrada, 1 vistoria e 1 evento `evidencia_anexada`.
- P1: Diego desativado sai, Ana entra no mesmo aparelho (a mesma instância de `obterFila`). Ana faz 0 pedidos de rede, vê `deOutroAutor: 1` e `pausadaPor: null`. Diego volta e a coleta sobe uma vez, com o token dele.

## Cenários negativos

- R5: sem token, `FalhaDeSessao`, item `pendente`, 0 chamada de rede.
- R1 e P2: 401 `nao_autenticado` com a troca de conta durante a renovação. O pedido repetido sai com o token da Ana e leva a coleta do Diego; o servidor recusa com 409 `autor_divergente`, 0 vistoria da Ana; o item vira `bloqueado`; o Diego volta, "Tentar de novo" e sobe 1 vistoria com ele como agente.
- Teto: o agente da Equipe Alfa reserva o teto numa ocorrência da Equipe Bravo.

## Tentativas de reprovar

1. Quatro instâncias da fila sob chamadas simultâneas: a correção segura. Desfeita, o defeito do emulador volta no teste ("Tudo sincronizado" no lugar de "Sessão encerrada").
2. Troca de conta no meio do pedido, em três pontos: entre o portão de autoria e a chamada (teste da casa), dentro da renovação do transporte (R1 e P2, sonda nova) e no `confirmar-envio` da foto (R2). Em nenhum o servidor gravou dado com o autor errado.
3. Duplicação na reconexão: dez filas com a mesma chave (suíte), resposta perdida (R3), foto já autorizada antes da pausa (R4). Sempre 1 vistoria e 1 evidência.
4. Item descartável indevidamente: o dono não consegue descartar item `pendente` (`descartar` exige `bloqueado` ou `arquivado`); outra pessoa pode descartar a coleta alheia em qualquer estado, mas isso é desenho registrado na rodada 1 (achado 7, anotado).
5. Rota de evidência: autor declarado diferente do token dá 409 antes de tocar no banco; confirmação por quem não autorizou dá 409 (R2).
6. Ordem dos testes: 8 sementes aleatórias novas, todas verdes.
7. Esgotar o teto do município: reproduzido (achado 1).

## Achados

**CORRIGE ANTES DE CRESCER**

1. **Um token de agente esgota o teto do município e para as fotos de todas as equipes (achado da rodada 2, ainda morde).** Reprodução (`E06-11`): teto do município em 1 GiB; Diego (Alfa) pede `POST /evidencias/autorizar-envio` numa ocorrência despachada para a Bravo, sem enviar byte nenhum. Em 104 pedidos e 0,8 s ele reserva 1.610.612.736 bytes (a margem inteira). Depois a coordenação desativa o Diego e encerra as sessões dele (200), e a agente Ana, da Bravo, recebe 507 `teto_de_armazenamento` para foto de 1 byte, 200 KB e 4 MiB. As 104 reservas continuam abertas. Não há perda de dado (a fila trata 507 como temporária), há indisponibilidade da operação até a varredura de órfãos. Dono: decisão de domínio do Rafael (recorte de equipe na autorização) e teto de reservas abertas por pessoa, antes do piloto.
2. **A repetição depois da renovação, dentro de `transporteHttp.pedir`, não passa pelo portão de autoria por chamada.** O motor confere autoria e marca do dreno antes de cada chamada (`transporteDoItem`), mas o segundo pedido feito por `pedir` depois de `obterToken({ renovarJa: true })` sai sem essa conferência. Quando a troca de conta acontece durante a renovação (até 20 s de tempo limite em `api.ts`), `criarObtentorDeToken` devolve o token de quem acabou de entrar (as credenciais mudaram) e o pedido vai com ele. Isso vale mesmo com `fila.cancelar()` chamado (P2). Efeito medido contra a API real (R1): o servidor recusa (409 `autor_divergente`, nada gravado), mas o item do Diego vira `bloqueado`, com "Descartar" disponível para a Ana, e a trilha append-only ganha `vistoria_recusada_autor_divergente` com a Ana como autora de uma tentativa que ela não fez. A rodada 1 tratou o 409 desse caminho como "janela de milissegundos". Sem perda de dado: o Diego volta e "Tentar de novo" sobe a coleta. Correção curta: repetir a conferência antes do segundo pedido (ou o transporte receber o autor do item) e tratar a troca como `PedidoCancelado`. Dono provável: `packages/campo`.

**ANOTADO**

3. O singleton de `obterFila` guarda a conexão aberta na criação. `apagarDadosLocais` faz `esquecerConexao()` sem fechar, então depois da primeira saída da conta convivem duas conexões no mesmo arquivo (a da fila e a nova). Isso é anterior à correção 2, e o `busy_timeout` de 5 s atenua.
4. Leitura pura (`GET`) não confere a vigência da sessão (decisão registrada para a F03-E03): fora do escopo desta etapa.

## Não verificado

- Emulador e aparelho (E2): não há emulador Android nesta máquina, e não tentei o Simulador de iOS. As corridas desta dimensão dependem de controlar o instante da troca de conta, o que só o E1 faz. A frase e o cartão no aparelho são do QA.
- Postgres 17 real: as sondas usaram PGlite. Nenhuma das sondas depende de diferença de motor (status HTTP e linhas gravadas).
- O tempo real da janela da renovação em rede de campo: simulado com promessa pendurada.
- `expo-secure-store` real e SQLite nativo.

## Risco residual

Com o achado 1 aberto, um único token de agente para o envio de fotos de todas as equipes de um município com teto contratado. Com o achado 2, a troca de turno durante uma renovação lenta deixa a coleta de quem saiu `bloqueada`, com "Descartar" ao alcance de quem entrou, e um evento de recusa em nome de quem entrou. Sem perda nem autoria falsa de vistoria ou foto.

## Motivo do humano

Achado 1: decisão de domínio do Rafael (o agente de uma equipe pode anexar foto à ocorrência de outra?) e prioridade antes do piloto. Já está registrado na rodada 2. A frase e o item preservado no aparelho continuam com o QA e o Rafael.
