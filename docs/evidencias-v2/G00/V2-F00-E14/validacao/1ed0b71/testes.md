---
validador: testes
modelo: claude-opus-5-5
etapa: V2-F00-E14
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [MOBILE, A11Y]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

`$V` é `SCRATCH/validadores/testes`. Mutações por `$V/mutar.sh` (aplica, roda, `git restore`, confere o arquivo limpo); cada `$V/mut-*.txt` começa com o diff.

| Campo do bloco | Onde está o teste | Rodou no SHA | Morde? |
| --- | --- | --- | --- |
| Positivo: os 6 testes passam | `__tests__/a-sessao-que-terminou-nao-e-falta-de-sinal.test.tsx` ("o ⓘ ensina o caminho de volta, e promete a fila de pé"), `__tests__/perfil-a-sessao-que-terminou-e-o-aviso-que-fecha.test.tsx` ("e ensina o caminho de volta, sem prometer o que não vale"), `push/logout-cala-o-aparelho.test.tsx` (4 casos) | verde 2x | sim: m01 e m02 (frase do produto trocada) reprovam os 2 de frase; m03 (dublê sem `acolherNoAparelho`) reprova os 4 de logout e o de deriva |
| Positivo: `falha-de-atualizacao.test.ts` segue verde | `dados/falha-de-atualizacao.test.ts` | verde 2x | n/a |
| Positivo: o dublê completo faz os 4 casos exercitarem o `sessao.tsx` real | `logout-cala-o-aparelho.test.tsx` importa `ProvedorDeSessao` real | verde 2x | sim: m03 |
| Negativo: a frase da sessão encerrada não instrui "Sair da conta" | os dois arquivos de frase | verde | sim: m01 ("Toque em Sair da conta e entre de novo" no produto) reprova os 2 |
| Negativo: dublê sem `acolherNoAparelho` faz o caso de deriva reprovar | `logout-cala-o-aparelho.test.tsx`, "o dublê do banco local acompanha tudo o que sessao.tsx importa dele" | verde | sim: m03 reprova o caso de deriva |
| Autorização e isolamento: `logout-nao-apaga-prova.test.ts` segue verde | `dados/logout-nao-apaga-prova.test.ts` | verde 2x | n/a (teste da E15 e anteriores) |
| Regressão obrigatória: `npm run test:campo`, pacote campo | | `test:campo` 1997 de 1997 2x; pacote 238 de 238 2x | n/a |
| E2E | bloco diz "Não se aplica" (F14-E12) | n/a | n/a |
| DoD: nenhum arquivo de produto alterado | `saidas/08-arquivos-do-campo-alterados.txt` lista só os 3 arquivos de teste; a etapa entrou no commit conjunto `99390e0` | conferido pela lista arquivada | n/a |

## Evidência

- Os 3 arquivos da etapa e os 3 irmãos (`logout-nao-apaga-prova`, `falha-de-atualizacao`, `a-sessao-vencida-nao-apaga-a-vistoria`), 2x: 6 suítes, 52 de 52, código 0 (`$V/e14-01-arquivos-1.txt`, `-2.txt`).
- `npm run test:campo`, 2x: 139 suítes, 1997 de 1997, código 0 (`$V/geral-01-test-campo-1.txt`, `geral-02-test-campo-2.txt`).
- Pacote campo, 2x: 238 de 238 (`$V/e06-01-pacote-campo-*.txt`).
- Embaralhado (`--randomize`, sementes 21 e 22) junto com os arquivos da E15 e E16: `logout-cala-o-aparelho` verde (`$V/e15-e16-04-embaralhado-*.txt`).
- Mutações: `$V/mut-e14-m01-frase-antiga-sair-da-conta.txt` (2 de 45 reprovam), `m02-frase-sem-nada-apagado` (2 de 45), `m03-duble-sem-acolher` (5 de 45), `m04-segundo-import-nao-visto` (0 de 45).
- T42: nenhum `skip`, `only`, `todo` ou condicional de ambiente nos arquivos; varredura do portão de skip limpa (`$V/geral-05-portao-de-skip.txt`).

## Cenários positivos

- A frase da sessão encerrada exige "Entrar de novo" e "Nada é apagado", e os 4 casos de logout rodam o `sessao.tsx` real com o dublê completo.

## Cenários negativos

- A frase antiga ("Sair da conta") no produto reprova os dois testes de frase; o dublê sem `acolherNoAparelho` reprova o caso de deriva e os 4 de logout.
- Isolamento entre agentes no aparelho: `logout-nao-apaga-prova.test.ts` verde.

## Tentativas de reprovar

- Troquei a instrução da frase vigente pela antiga, e tirei "Nada é apagado" da frase: os dois casos reescritos reprovam nas duas.
- Tirei `acolherNoAparelho` do dublê: deriva e logout reprovam.
- Acrescentei a `sessao.tsx` um SEGUNDO `import` de `./banco-local` com um nome que o dublê não tem (`donoDosDadosLocais`), usado no carregamento do módulo: 45 de 45 verdes. O caso de deriva lê só o primeiro `import` (`exec`, não `matchAll`).

## Achados

### CORRIGE ANTES DE CRESCER

1. **O caso de deriva continua lendo só o primeiro `import` de `./banco-local`** (herdado das rodadas 1 a 4, sem commit da E14 desde então). Reprodução: `$V/mut-e14-m04-segundo-import-nao-visto.txt`. O negativo exigido pelo bloco (dublê sem `acolherNoAparelho` reprova) está satisfeito; a lacuna só aparece com uma segunda declaração de import do mesmo módulo. Conserto: `matchAll` e unir os nomes de todos os `import` do módulo. Dono: E14.

### ANOTADO

- O negativo confere a ausência de "Sair da conta"; uma variante sem o verbo exato passaria por ele, mas não pelo positivo, que exige "Entrar de novo" (igual à rodada 4).

## Não verificado

- Prova em aparelho: o bloco diz "E2E: Não se aplica" (F14-E12).
- Leitura humana das frases finais da sessão encerrada: validação humana do bloco, fora desta dimensão.
- CI do SHA: ausente (H32).

## Risco residual

Baixo. Os 6 testes reescritos mordem na regressão que existem para pegar. A lacuna do caso de deriva só aparece com dois imports do mesmo módulo e, se acontecer, o sintoma volta a ser um `TypeError` visível na suíte assim que o nome novo for chamado.

## Motivo do humano

não se aplica
