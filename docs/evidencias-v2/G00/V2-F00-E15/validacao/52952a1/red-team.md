---
validador: red-team (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E15
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [MOBILE, OFFLINE, LGPD]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Veredito: **PASS na dimensão red-team**, com a falha aberta da limpeza entre pessoas **ainda reproduzível** neste SHA. A arbitragem da rodada 2 classificou esse defeito como anterior à F00 e fora do escopo da etapa ("a etapa só avisa, não muda a regra"), com dono na F14-E02 e como bloqueio de piloto que não admite risco aceito (item 3 da seção 7 de `28`). Mantenho essa classificação e confirmo que nada mudou: `banco-local.ts`, `sessao.tsx`, `rascunho.ts`, `perfil.tsx` e `precisao-do-gps.ts` estão iguais desde `4b96ea7`. Saídas em `$SP/val/red-team/` (prefixo `E15-`).

| Critério ou defeito anterior | Resultado nesta rodada |
| --- | --- |
| "Entrar de novo" (sessão vencida) não apaga a vistoria começada | PASS: `vistoria-sessao-vencida-preserva-o-rascunho`, `vistoria-ainda-nao-baixada` e `sair-e-entrar-nao-perde-a-coleta` verdes (`E15-03`, 6 suítes, 39 casos) |
| Saída explícita avisa o que apaga | PASS: `dialogo-na-conta-com-vistoria-comecada` e `aviso-da-saida` verdes |
| Outra pessoa que entra recebe o aparelho limpo (sem falha) | PASS: controle da sonda, Bruno vê 0 rascunho e passa a ser o dono. O teste morde: `acolherNoAparelho` sem apagar reprova 1 caso de `sair-e-entrar-nao-perde-a-coleta` (`E15-04`) |
| Outra pessoa não envia a coleta da anterior | PASS: o motor recusa assumir item que já tem autor, recusa retirar para correção coleta de outro autor (`de_outro_autor`) e não drena item de outro autor (ver E06, P1) |
| GPS abaixo de 0,5 m vira 1; ausente, zero, negativo, NaN e infinito viram `null` | PASS. O teste morde: `Math.round` sem o piso reprova 2 casos (`E15-05`); o esquema do servidor recusa 0 e negativo com "Precisa ser maior que 0" e aceita 0,3 e 1 (`E15-06`) |
| Rodada 2, achado 1: a limpeza entre pessoas falha aberta | **Ainda morde** (achado 1) |

## Evidência

- `npx jest` (em `apps/campo`) das seis suítes da etapa: código 0, 39 de 39 (`E15-03-base.txt`).
- Sonda `zz-rt-e15-app.test.ts` (cópia em `$SP/val/red-team/`; esteve em `apps/campo/src/dados/` só durante a execução e foi apagada), com `banco-local` e `rascunho` reais sobre o SQLite do Node e uma falha única injetada no banco: `E15-01-sonda-apagamento.txt` e `E15-02-sonda-apagamento-B.txt`.
- Mutações, cada uma desfeita com `git restore` e conferida verde em seguida (10 de 10): `E15-04` (código 1) e `E15-05` (código 1).
- `npx vitest run -t "gps|GPS|precis"` em `packages/shared`: código 0, 9 casos; e o esquema `gpsPrecisaoMetrosSchema` exercitado pelo `dist` (`E15-06`).

## Cenários positivos

- A mesma pessoa reencontra rascunho, foto e assinatura depois de "Entrar de novo".
- Precisão 0,3 vira 1 e 12,4 vira 12, e o valor gravado passa no esquema do servidor.

## Cenários negativos

- Sem falha do banco, o colega que entra não vê o rascunho anterior.
- Precisão 0 ou negativa é recusada com mensagem em português.

## Tentativas de reprovar

1. Falha única do banco na troca de pessoa, em dois pontos:
   - (A) o `DELETE` de `apagarDadosLocais` falha ("database is locked"): `acolherNoAparelho(BRUNO)` devolve `apagou: true`, a marca de dono passa a ser do Bruno, e ele lê o rascunho da Ana (protocolo, "Moradora idosa acamada, filho com deficiência", nome da assinante). No login seguinte dele, sem falha, `apagou: false` e o rascunho continua visível;
   - (B) a leitura da marca do dono falha: tratada como "sem dono", nada é apagado, a marca vira do Bruno, e ele lê o rascunho.
2. Reassumir ou retirar para correção a coleta de outra pessoa, para enviá-la como própria: recusado pelo motor.
3. Precisão com valores que o aparelho pode entregar (NaN, infinito, negativo): todos viram `null`.

## Achados

**CORRIGE ANTES DE CRESCER (bloqueio de piloto; item 3 da seção 7 de `28`, não admite risco aceito; achado da rodada 2, ainda morde)**

1. **A limpeza entre pessoas no aparelho compartilhado falha aberta.** `donoDosDadosLocais` devolve nulo quando a leitura falha, e nulo quer dizer "não apague". `apagarDadosLocais` engole o erro do `DELETE`. `acolherNoAparelho` marca o novo dono mesmo assim, e `entrar()` abre a sessão de qualquer jeito. Uma falha transitória do SQLite na troca de turno (disco cheio, banco ocupado além dos 5 s do `busy_timeout`) entrega a quem entra o rascunho de quem saiu, com dado pessoal da moradora, e nos casos A e B o vazamento fica permanente para aquele aparelho. Reprodução: `E15-01` (caso A) e `E15-02` (caso B). Correção curta: erro na leitura do dono conta como "dono desconhecido com dado presente", que apaga ou recusa a entrada; só marcar o novo dono depois de o apagamento terminar; `entrar()` falha fechado se a limpeza falhar. Dono: F14-E02, conforme a arbitragem da rodada 2.

**ANOTADO**

2. `rascunhos` não tem coluna de autor: a separação entre pessoas depende só da marca de dono (rodada 2).
3. A mensagem do esquema para `NaN` sai "Era esperado um número, veio um número", em `packages/shared`. NaN não atravessa JSON, então não chega pela rede. É só texto.

## Não verificado

- Aparelho e emulador: o comportamento real de `SQLITE_BUSY` e `SQLITE_FULL` no Android e no iOS. A prova é E1, com SQLite do Node e falha injetada.
- Se a sessão chega a abrir com o disco cheio de verdade (gravação no cofre): não provei no aparelho.
- O fluxo de GPS no emulador e o diálogo de saída na tela: são do QA (pendência E4 já registrada).

## Risco residual

Vazamento entre agentes no aparelho compartilhado, condicionado a uma falha do SQLite na troca de pessoa e persistente depois dela, até a correção do achado 1.

## Motivo do humano

Rafael decide quando entra a correção do achado 1 (registrada como bloqueio de piloto na rodada 2) e faz os dois fluxos de aparelho que a etapa reserva (pendência E4 do QA).
