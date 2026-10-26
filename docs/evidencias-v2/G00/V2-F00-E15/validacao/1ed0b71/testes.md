---
validador: testes
modelo: claude-opus-5-5
etapa: V2-F00-E15
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

`$V` é `SCRATCH/validadores/testes`. Mutações por `$V/mutar.sh` (aplica, roda o jest INTEIRO do aplicativo ou a suíte indicada, `git restore`, confere o arquivo limpo); cada `$V/mut-*.txt` começa com o diff.

| Campo do bloco | Onde está o teste | Rodou no SHA | Morde? |
| --- | --- | --- | --- |
| Positivo: "2 vistorias começadas" no plural e uma só no singular sem foto | `ui/dialogo-na-conta-com-vistoria-comecada.test.tsx`, `dados/aviso-da-saida.test.ts` | verde 2x | sim: p1 (singular vira plural) 4 vermelhos |
| Positivo: chip e aviso de esperar somem quando a fila esvazia, sem trocar de aba | `dialogo-na-conta-com-vistoria-comecada.test.tsx` | verde 2x | sim: r1 (o resumo da fila é lido uma vez só) 7 vermelhos |
| Positivo: precisão 0,3 vira 1 e 12,4 vira 12 | `dados/precisao-do-gps.test.ts`, `__tests__/vistoria-o-teclado-a-camera-e-o-que-ela-promete.test.tsx` ("abaixo de meio metro vira 1, e não zero") | verde 2x | sim: g1 (sem o piso) 3 vermelhos |
| Diálogo usa o botão destrutivo (motivo do FAIL da rodada 4) | `dialogo-na-conta-com-vistoria-comecada.test.tsx`, "o botão de confirmar é o de perigo" (compara o estilo com `Botao tipo="perigo"` no mesmo tema) | verde 2x | sim: d1 (`destrutiva: false`) 1 vermelho no jest inteiro |
| Negativo: sem rascunho e sem fila o diálogo não fala em apagar | `dialogo-na-conta-com-vistoria-comecada.test.tsx`, `aviso-da-saida.test.ts` | verde | sim: p2 (frase de apagar sem rascunho) 6 vermelhos |
| Negativo: precisão ausente grava `null` | `precisao-do-gps.test.ts` | verde | coberto pelo caso; g1 não altera esse ramo |
| Negativo: o esquema recusa 0 e negativo com mensagem em português | `packages/shared/test/precisao-do-gps.test.ts` (3), `apps/api/test/precisao-do-gps-na-sincronizacao.test.ts` (3, rota real) | verde 2x cada | sim: z1 (`nonnegative()`) 2 vermelhos no shared e, com o `dist` recompilado, 1 vermelho na rota da API |
| Negativo: "Entrar de novo" (sessão vencida) continua sem apagar nada | `__tests__/vistoria-sessao-vencida-preserva-o-rascunho.test.tsx`, `vistoria-ainda-nao-baixada.test.tsx`, `a-sessao-vencida-nao-apaga-a-vistoria.test.tsx` | verde 2x | sim: c1 (a vistoria usa `sair` no lugar de `encerrarSessaoVencida`) 3 vermelhos |
| E8 e E9 (achados da rodada 4) | `dialogo-na-conta-com-vistoria-comecada.test.tsx` | verde | sim: e8 2, e9 1, `enviando` fora da conta 1 vermelho |
| Autorização e isolamento: outro agente entra e `acolherNoAparelho` limpa; a mesma pessoa reencontra a vistoria | `__tests__/entrar-de-outra-pessoa-limpa-o-aparelho.test.tsx` (login real), `dados/sair-e-entrar-nao-perde-a-coleta.test.ts` (SQLite do Node) | verde 2x e embaralhado | sim: s9b (sem `acolherNoAparelho` no `entrar`) 5, m1 (sem `await`) 1, s3 (`sair` sem apagar) 1, s2 (`sair` mantém a credencial) 1 vermelho |
| Regressão: `test:campo`, shared, `test:api` | | 1997 de 1997 2x; shared 223 de 223 2x; API 1590 e 34 pulados 2x | n/a |
| E2E no aparelho | sem emulador nem aparelho | não rodado | pendência humana E4 |

## Evidência

- 10 arquivos de teste da etapa e vizinhos no jest do app, 2x: 100 de 100, código 0 (`$V/e15-01-arquivos-1.txt`, `-2.txt`); embaralhados com os da E14 e E16 (sementes 21 e 22): verdes (`$V/e15-e16-04-embaralhado-*.txt`).
- `packages/shared/test/precisao-do-gps.test.ts`, 2x: 3 de 3 (`$V/e15-02-shared-gps-*.txt`); `apps/api/test/precisao-do-gps-na-sincronizacao.test.ts`, 2x: 3 de 3 (`$V/e15-03-api-gps-*.txt`).
- `npm run test --workspace @dc360/shared`, 2x: 18 arquivos, 223 de 223 (`$V/geral-04-shared-*.txt`).
- `npm run test:campo`, 2x: 1997 de 1997 (`$V/geral-01-*.txt`, `geral-02-*.txt`). `npm run test:api`, 2x: 1590 passaram, 34 pulados (todos de `renovacao-contra-encerramento`, por ambiente, fora da etapa) (`$V/geral-03-*.txt`, `geral-06-*.txt`).
- Mutações: `$V/mut-e15-d1`, `e8`, `e9`, `c1-pendentes-sem-enviando`, `g1`, `s9b`, `m1`, `s3`, `s2`, `c1-vistoria-401-chama-sair`, `p1`, `p2`, `r1`, `z1`. Todas reprovam. O `dist` de `@dc360/shared` foi recompilado com o arquivo restaurado depois de z1.
- T42: nenhum `skip`, `only`, `todo` ou condicional de ambiente nos arquivos da etapa; varredura limpa (`$V/geral-05-portao-de-skip.txt`).

## Cenários positivos

- Diálogo conta rascunhos, fotos e assinatura com singular e plural; Perfil assina a fila e o chip some quando ela esvazia; GPS de 0,3 m grava 1 e a rota aceita.

## Cenários negativos

- Sem rascunho e sem fila, sem a palavra "apaga"; disco ilegível avisa "Não deu para conferir"; precisão 0 recusada com frase em português pela rota real; "Entrar de novo" na vistoria não apaga; outro agente no aparelho recebe o aparelho limpo, sem perder o item da fila do primeiro.

## Tentativas de reprovar

- D1, a mutação que derrubou a rodada 4 (`destrutiva: false` no "Sair da conta"): agora o jest inteiro reprova 1 caso. Consertado.
- E8 (o `catch` grava "zero vistorias") e E9 (bloqueados fora da conta): reprovam. Consertados.
- O login real sem a limpeza, com a limpeza sem `await`, e a saída que esquece de apagar ou de tirar a credencial: todas reprovam.
- A tela da vistoria voltando a chamar `sair` no 401: reprova 3.
- O resumo da fila lido uma vez só: reprova 7.
- Esquema afrouxado para aceitar 0: reprova no shared e na rota da API.

## Achados

### ANOTADO

- O caso "Sair da conta e depois o Bruno entra" só reprova com as duas defesas fora (S9b e S3), porque `sair()` já apaga; é o caso da sessão vencida que carrega a mordida de S9b (dito no próprio RESUMO e reproduzido aqui: s9b sozinha reprova 5 casos).
- O cofre, o disco e o SQLite são simulados nos testes de tela: provam que o código chama a remoção, não a garantia do chaveiro do aparelho.

## Não verificado

- E2E do bloco no aparelho ou emulador: começar vistoria e tocar em "Sair da conta"; concluir com GPS simulado abaixo de 0,5 m sem 422. Não há emulador nem aparelho nesta máquina. Pendência humana E4.
- A falha aberta de `acolherNoAparelho` (limpeza que falha no meio) continua fora do escopo (F14-E02); não testei injeção de falha.
- CI do SHA: ausente (H32).

## Risco residual

Os critérios da etapa estão presos por testes que mordem, inclusive o do botão destrutivo que reprovou a rodada 4. O que fica é o comportamento físico no aparelho (diálogo desenhado, GPS real, cofre nativo), sem prova nesta máquina.

## Motivo do humano

O E2E e a validação humana do bloco pedem o aparelho: Rafael faz os dois fluxos (sair com vistoria começada; GPS abaixo de 0,5 m concluindo sem 422). Esta máquina não tem emulador nem aparelho.
