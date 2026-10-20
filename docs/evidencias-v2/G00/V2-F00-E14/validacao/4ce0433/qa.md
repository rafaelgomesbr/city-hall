---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E14
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [MOBILE, A11Y]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Comandos no SHA `4ce0433` (árvore principal em `3ce67c7`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md`); mutações num worktree meu destacado em `4ce0433`.

| Critério (bloco da etapa) | Prova | Resultado |
| --- | --- | --- |
| DoD: 6 testes verdes | os três arquivos da etapa e os irmãos (`a-sessao-que-terminou-nao-e-falta-de-sinal`, `perfil-a-sessao-que-terminou-e-o-aviso-que-fecha`, `logout-cala-o-aparelho`, `falha-de-atualizacao`, `logout-nao-apaga-prova`, `a-sessao-vencida-nao-apaga-a-vistoria`): 6 suítes, 52 de 52, código 0 (saída `11`); `npm run test:campo` 1932 de 1932, código 0 (saída `01`) | PASS |
| Positivo: as duas expectativas exigem "Entrar de novo" e "Nada é apagado" | mutação M1 (frase antiga "Toque em Sair da conta e entre de novo" posta em `falha-de-atualizacao.ts`): 3 reprovam, os 2 casos da etapa e o caso irmão "o texto por extenso ... não manda 'Sair da conta'" | PASS, morde |
| Negativo: a frase da sessão encerrada não instrui "Sair da conta" | mesmos casos; o do Perfil procura `toque em "Sair da conta"` (o botão legítimo com esse rótulo continua na tela) | PASS |
| Positivo: o dublê completo faz os 4 casos do logout exercitarem o `sessao.tsx` real | mutação M4 (`sair()` manda `null` no lugar da ficha): "manda a ficha deste aparelho junto com a saída" reprova, logo o caso roda o `sessao.tsx` de verdade | PASS, morde |
| Negativo: dublê sem `acolherNoAparelho` faz o caso de deriva reprovar; caso de deriva falha se `sessao.tsx` importar nome que o dublê não tem | mutação M2 (`sessao.tsx` passa a importar `donoDosDadosLocais` na mesma linha): o caso de deriva reprova. Mutação M3 (o mesmo nome num SEGUNDO `import` de `./banco-local`): o caso de deriva fica verde (ver Achados) | PASS com achado |
| Autorização e isolamento: `logout-nao-apaga-prova.test.ts` verde; mesma pessoa reencontra, outro agente começa limpo | verde na saída `11`; a mutação B2 da E15 (`acolherNoAparelho` não apaga) é pega pela suíte irmã | PASS |
| DoD: nenhum arquivo de produto alterado | `saidas/08-arquivos-do-campo-alterados.txt` da etapa lista só os três testes; as mutações M1 e M4 no produto deixam os testes vermelhos, ou seja, o produto é a referência | PASS |
| DoD: decisão registrada com evidência | `docs/DECISOES-DE-TESTE-DA-FASE-00.md`, seção "campo: sessão encerrada e logout" (citada pela etapa; não reli linha a linha, é da dimensão de especificação) | n/a nesta dimensão |
| Regressão obrigatória `test:campo` e `test --workspace @dc360/campo` | `01` código 0 (1932); `02` 10 arquivos, 231 de 231, código 0 | PASS |

O "Motivo do veredito" da rodada 4 desta etapa foi PASS (QA e Testes) sem conserto pedido; nada a conferir de correção.

## Evidência

Diretório: `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L14-qa-campo/saidas/`.

- `01-test-campo.txt`: `npm run test:campo`, código 0, 134 suítes, 1932 de 1932.
- `02-pacote-campo.txt`: `npm run test --workspace @dc360/campo`, 231 de 231, código 0.
- `11-e14-arquivos-e-irmaos.txt`: jest dos seis arquivos, 52 de 52, código 0.
- `mut/E14-M1-*.txt`, `mut/E14-M2-*.txt`, `mut/E14-M3-*.txt`, `mut/E14-M4-*.txt`: diff aplicado, saída e código de cada mutação (roteiro `lote-e14-e16.sh`).

## Cenários positivos

- Sessão encerrada no Perfil e no ⓘ da lista: a frase manda tocar em "Entrar de novo" e diz "Nada é apagado".
- Logout com e sem ficha de push: a saída manda a ficha, esquece a ficha e guarda o município, com o `sessao.tsx` real.

## Cenários negativos

- Nenhuma instrução "Sair da conta" na frase da sessão encerrada (M1 morde).
- Dublê do banco local sem nome que `sessao.tsx` usa: o caso de deriva reprova listando o nome (M2 morde).

## Tentativas de reprovar

| Id | Mutação | Resultado |
| --- | --- | --- |
| M1 | frase antiga ("Toque em Sair da conta e entre de novo", sem "Nada é apagado") em `falha-de-atualizacao.ts` | 3 reprovam |
| M2 | `sessao.tsx` importa `donoDosDadosLocais` na linha existente de `./banco-local` | o caso de deriva reprova |
| M3 | o mesmo nome num segundo `import { ... } from "./banco-local"` | SOBREVIVE (5 de 5 verdes) |
| M4 | `sair()` envia `null` em vez da ficha | 1 reprova |

## Achados

- **Corrige antes de crescer:** o caso "o dublê do banco local acompanha tudo o que sessao.tsx importa dele" (`apps/campo/src/push/logout-cala-o-aparelho.test.tsx:181`) lê só a PRIMEIRA declaração `import { ... } from "./banco-local"` (`exec` sem laço). Reprodução: acrescentar em `dados/sessao.tsx` uma segunda linha `import { donoDosDadosLocais } from "./banco-local";` e qualquer uso que não rode nos 4 casos do logout: o arquivo passa 5 de 5 (`mut/E14-M3-segundo-import-fora-do-regex.txt`). A promessa do bloco ("falha se importar um nome que o dublê não tem") vale para a forma comum (M2 morde) e não para a segunda declaração. Não reprova a etapa porque o negativo nomeado pela etapa (dublê sem `acolherNoAparelho`) e a forma realista de deriva mordem, e um uso do nome no caminho do logout derruba os 4 casos com `TypeError`. Conserto simples: varrer todas as declarações (`matchAll`).

## Não verificado

- A leitura da frase final no aparelho (validação humana da etapa); E2E é "não se aplica" pelo bloco.
- Não reli `docs/DECISOES-DE-TESTE-DA-FASE-00.md` contra o código linha a linha.

## Risco residual

Baixo: a etapa só mexe em teste, e os testes reescritos estão presos ao texto do produto e ao `sessao.tsx` real. Resta a brecha da deriva por segunda declaração, descrita acima.

## Motivo do humano

Rafael lê as frases finais da sessão encerrada ("Toque em Entrar de novo ... Nada é apagado ..."): é texto de produto e validação humana nomeada pela etapa.
