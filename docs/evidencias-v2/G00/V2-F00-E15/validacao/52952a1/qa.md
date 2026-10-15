---
validador: qa (agente general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E15
sha_validado: 52952a1
ci_run: 38618369218
rodada: 3
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Veredito: **PASS** no nível E1, com a prova em aparelho em "Não verificado". Nenhum arquivo de produto da E15 (`perfil.tsx`, `aviso-da-saida.ts`, `precisao-do-gps.ts`, `banco-local.ts`, `sessao.tsx`, `rascunho.ts`, `resumo-da-fila.ts`, `schemas.ts`, `mensagens-do-zod.ts`) mudou em `4b96ea7..52952a1`; a tela `vistoria/[id].tsx` mudou só pela E16 (`await` da foto e `SobreOVisor`), e reexecutei as provas da E15 sobre ela. O defeito da rodada 1 (botão da faixa de sessão vencida chamando `sair()`) continua consertado e o teste morde.

Sobre `acolherNoAparelho` falhar aberto se o SQLite falhar na troca de pessoa: três validadores desta rodada concordam que não é critério desta etapa (dono F14-E02, bloqueio de piloto registrado pela arbitragem da rodada 2). Não reavaliei; cito.

| Critério | Resultado | Prova |
| --- | --- | --- |
| sessão vencida na vistoria: "Entrar de novo" não apaga rascunho, foto nem assinatura (FAIL da rodada 1) | PASS, morde | mutação: o botão volta a chamar `sair()`: 3 casos reprovam em `vistoria-sessao-vencida-preserva-o-rascunho` e `vistoria-ainda-nao-baixada` (`41-mutE15-VERMELHO.txt`) |
| diálogo "Sair da conta?" conta fila, rascunhos e fotos, singular e plural, botão destrutivo; sem nada, frase curta | PASS | `dialogo-na-conta-com-vistoria-comecada`, `aviso-da-saida`, `dialogo-na-conta` verdes (`40-jest-e15.txt`) |
| Perfil assina a fila (chip e aviso somem quando a fila esvazia) | PASS | `dialogo-na-conta-com-vistoria-comecada` (`40-jest-e15.txt`) |
| GPS: piso de 1 metro (0,3 vira 1, 12,4 vira 12), ausente `null` | PASS, morde | mutação sem `Math.max(1, ...)`: 3 reprovam em `precisao-do-gps.test.ts` e na tela (`41-mutE15-VERMELHO.txt`) |
| servidor recusa 0 e negativo em português sem afrouxar `positive()` | PASS | esquema executado do `dist`: 0 e -1 "Precisa ser maior que 0", 0,3, 1, 12 e `null` aceitos, texto recusado (`42-gps-esquema.txt`); API: `precisao-do-gps-na-sincronizacao.test.ts` verde (`61-api-e06-e15.txt`) |
| outro agente entra: `acolherNoAparelho` limpa o rascunho e preserva a fila; a mesma pessoa reencontra a vistoria | PASS | `sair-e-entrar-nao-perde-a-coleta.test.ts` (SQLite real do Node) verde |
| `sair()` só no diálogo do Perfil | PASS | busca em `src/` sem testes: único chamador de `sair()` é o Perfil; vistoria usa `encerrarSessaoVencida` (`vistoria/[id].tsx:800` e `1420`) |
| regressão: `npm run test:campo`, `npm run test --workspace @dc360/shared`, `npm run test:api` | PASS | 1927 de 1927; shared 168 de 168; API 1309 aprovados, 9 pulados, 1 falha conhecida do LibreSSL desta máquina |

## Evidência

- Suítes da etapa (9 arquivos): 65 de 65 (`40-jest-e15.txt`).
- `npm run test:campo`: tipos limpos, 134 suítes, 1927 de 1927, código 0 (`11-test-campo.txt`); `npx jest`: 1927 de 1927 (`13-npx-jest-app.txt`); pacote do motor 223 de 223 (`10-pacote-campo.txt`); portões 79 de 79 (`12-portoes.txt`).
- `npm run test --workspace @dc360/shared`: 16 arquivos, 168 de 168, código 0 (`62-shared.txt`).
- `npm run test:api`: 99 de 100 arquivos, 1309 aprovados, 9 pulados, 1 falha (`openssl-do-teste.test.ts`, LibreSSL do macOS, divergência conhecida) (`63-test-api.txt`).
- Mutação combinada (`vistoria/[id].tsx` linhas 800 e 1420 chamando `sair()`; `precisao-do-gps.ts:18` sem o piso): 6 falhas em 35 casos, nomes em `41-mutE15-VERMELHO.txt`. Restaurado com `git restore`; `git status --porcelain` só com as pastas `validacao/52952a1/`.
- Simulador de iOS: build e abertura do app, sem condução da interface (ver "Não verificado" e o relatório de QA da E06).

## Cenários positivos

- Sessão vencida na vistoria, "Entrar de novo": identidade nula, `router.replace("/entrar")`, rascunho, foto e assinatura de pé; a mesma pessoa reencontra tudo.
- GPS 0,3 grava 1 e passa no esquema do servidor.

## Cenários negativos

- Controle: `sair()` explícito (o do Perfil) continua apagando o rascunho, como manda a regra do aparelho compartilhado.
- Esquema recusa 0, -1 e texto com mensagem em português.
- Sem rascunho e sem fila, o diálogo não fala em apagar.

## Tentativas de reprovar

- Conferi se a correção 2 da E16 (foto assíncrona, apagar a foto vazia) cria um caminho que apaga dado da vistoria começada: `apagarFotoDoAparelho` só é chamado no destino recém-criado que saiu vazio ou numa cópia que falhou, nunca numa foto que já entrou no rascunho (`evidencia-no-disco.ts`, ramos do `catch` e do tamanho zero).
- Conferi se o `await` novo em `guardarFoto` abre corrida no rascunho (duas fotos com a mesma ordem): `fotografar` tem a trava `fotografando`, posta antes do primeiro `await`.
- Desfiz os dois consertos centrais e vi vermelho (mutações acima).

## Achados

### BLOQUEIA

Nenhum.

### CORRIGE ANTES DE CRESCER

Nenhum novo nesta dimensão. Fica citado (não reavaliado): `acolherNoAparelho` falha aberto se o SQLite falhar (dono F14-E02, bloqueio de piloto).

### ANOTADO

- `gpsPrecisaoMetrosSchema` aceita `Infinity` e responde "Era esperado um número, veio um número" para `NaN` (`42-gps-esquema.txt`); JSON não transporta nenhum dos dois, e o app grava `null` para eles.
- "1 metros" no laudo e no Perfil continua em `PENDENCIAS.md` (item 15), fora do escopo.

## Não verificado

- E2 da etapa (no aparelho ou emulador: tocar em "Sair da conta" com vistoria começada; concluir com GPS simulado abaixo de 0,5 m sem 422): sem emulador Android; o Simulador de iOS foi construído e aberto contra uma API local, mas não houve como dirigir a interface (sem `idb`, sem permissão de acessibilidade, inspetor do Hermes sem resposta). Coberto em E1 com sessão, banco e tela reais.
- iPhone e Android físicos (a prova física é a F14-E12).

## Risco residual

Médio-baixo. Os consertos estão provados por testes que mordem com módulos reais; o que falta é ver o diálogo e a conclusão com GPS excelente num aparelho.

## Motivo do humano

Rafael faz os dois fluxos num aparelho disponível (validação humana da etapa, E4): "Sair da conta" com vistoria começada e conclusão com GPS abaixo de 0,5 m sem 422.
