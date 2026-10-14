---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E06
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [MOBILE, OFFLINE, AUTH, AUTHZ]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: gatilho 9 (risco residual): um token de agente para a sincronização de campo do município inteiro
---
## Critérios verificados

Veredito: **PASS na dimensão red-team**, com um achado grave de disponibilidade, anterior à etapa e fora do escopo dela (achado 1). O FAIL do QA e do validador de testes nesta rodada (faixa global sem a pausa, várias instâncias da fila) continua valendo para a etapa e não é desfeito aqui. Evidência em `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/redteam` (`redteam/`).

| Critério | Resultado |
| --- | --- |
| Pista 1: um agente consegue travar o envio de fotos do município? | **SIM, provado** (achado 1) |
| Isso é perda de dado do campo (item 5 da seção 7)? | **NÃO**: a coleta fica `pendente`, nada vira `bloqueado` e ela sobe uma vez quando o teto libera (`out-q507.txt`) |
| Autoria da foto (`coletadaPor`, confirmação só por quem autorizou) e 404 entre municípios | PASS (`evidencia-so-do-autor.test.ts` e `evidencias.test.ts` verdes em `out-api-suites.txt`) |

## Evidência

- `redteam/t1-teto.test.ts` (API real em PGlite), saída `out-t1.txt`: teto do município A em 1 GiB (o mínimo que a migração 035 aceita). O agente Diego (equipe Alfa) pediu autorizações numa ocorrência da equipe Bravo, sem enviar byte nenhum: 138 pedidos, 114 reservas, 1.610.612.736 bytes (a margem inteira de 1,5 vez o teto), em 2,6 s. Depois: o colega Bruno (Bravo) recebe 507 `teto_de_armazenamento` para foto de 200 KB, 2 MiB e 4 MiB; a foto de perfil da coordenadora também recebe 507; desativar o Diego (200) e encerrar as sessões dele (200) não muda nada, e as 114 reservas seguem vivas.
- `redteam/campo/q507.test.ts` e `q507b.test.ts` (motor real do pacote do campo, transporte HTTP real com `fetch` falso), saídas `out-q507.txt` e `out-q507b.txt`: dez dias simulados de 507 (2880 tentativas): item `pendente`, zero bloqueado, envelope da vistoria nunca enviado. Com duas coletas, a primeira com foto e a segunda SEM foto, as duas ficam paradas, porque a falha temporária interrompe o dreno (`packages/campo/src/fila.ts`, linhas 750 a 756). Liberado o teto, as duas sobem uma vez cada.

## Cenários positivos

- Teto liberado: a fila drena sozinha, sem duplicar.
- Foto do próprio agente: autoriza, envia e confirma com o autor certo (suítes).

## Cenários negativos

- 507 prolongado: nenhuma coleta descartada nem bloqueada.
- Autor declarado diferente do token: 409; confirmação por outra pessoa: 409; outro município: 404 (suítes).

## Tentativas de reprovar

1. Esgotar o teto com token de agente até o último byte. O validador de segurança parou em 15 MiB e o colega dele ainda passou com 200 KB; eu reduzi o tamanho até 1 byte, e aí nenhum colega passa.
2. Conferir se desativar ou encerrar as sessões do atacante devolve o teto: não devolve.
3. Conferir se a fila perde a coleta sob 507 prolongado: não perde, mas para o dreno inteiro do aparelho.
4. Omitir `coletadaPor` para escapar da conferência de autor: o autor passa a ser o dono do token, sem ganho para quem ataca.

## Achados

**CORRIGE ANTES DE CRESCER (condição de implantação para município com teto contratado; decisão do Rafael)**

1. **Um agente, ou um token de agente roubado, para a sincronização de campo do município inteiro por até 30 dias.** Causa: `POST /evidencias/autorizar-envio` reserva no teto o tamanho declarado antes de receber qualquer byte, sem limite de reservas abertas por pessoa e sem recorte de equipe; a reserva só sai pela varredura de órfãos depois de 30 dias (`JANELA_DE_GRACA_DIAS`) e não sai ao desativar a conta. Impacto: todo agente com foto na fila recebe 507, e como a falha temporária interrompe o dreno, as vistorias seguintes do mesmo aparelho (inclusive com interdição indicada) também não chegam à coordenação. Não há perda de dado (provado), por isso não é o item 5 da seção 7; é indisponibilidade da operação, justamente em evento. Mitigação existente: a plataforma amplia o teto pela CLI (`apps/api/src/armazenamento/cli.ts`); município sem teto (`NULL`) não é afetado. Correção sugerida: teto de reservas abertas por pessoa, abandono das reservas abertas ao desativar a conta e recorte de equipe na autorização. Anterior à etapa (migração 035 e motor offline); dono a definir pelo gatekeeper.

**ANOTADO**

2. Item recusado com 409 `autor_divergente` fica `bloqueado` com "Descartar" ao lado (janela de milissegundos, por desenho).

## Não verificado

- Emulador e aparelho: não rodei o app; a pausa visível é do QA, que reprovou a faixa global.
- Postgres real e S3 real: usei PGlite e armazenamento em memória.
- Varredura de órfãos real depois de 30 dias: li o código, não simulei o relógio na API.
- Mutação própria no motor para a pausa por sessão: usei as do QA do campo.

## Risco residual

Até o achado 1 ser corrigido, um único token de agente para o envio de vistorias de todas as equipes de um município com teto contratado, por semanas, sem remédio dentro do produto.

## Motivo do humano

Decisão do Rafael sobre o achado 1 (prioridade e dono). A frase e o item preservado no aparelho seguem pendentes, como registrou o QA.
