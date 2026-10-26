---
validador: arbitragem
modelo: claude-opus-5-5
etapa: V2-F00-E13
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [UI, A11Y, AUTH]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Arbitragem (seção 7 de `docs/roadmap-v2/28-execucao-e-validacao.md`) do achado A1 de `qa.md` (PASS, "corrige antes de crescer"), que `ux.md`, `acessibilidade.md` e `red-team.md` (todos PASS) não examinaram. A pergunta: o portão de `dc360/apps/web/test/acessibilidade.test.ts` fica verde sem a marca "acessibilidade: excecao" em `Modal.tsx` no checkout LF; isso é critério da etapa, e o teste da etapa morde o caso que ela declarou consertar?

Reproduzi num worktree meu destacado em `4ce0433` (`$A/wt`, onde `$A` é `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/A03-arbitragem`), `node_modules` por link. `git ls-files --eol` dá `i/lf w/lf attr/text=auto eol=lf` para `Modal.tsx` e `acessibilidade.test.ts` (o `.gitattributes` da E21 fixa LF em qualquer sistema).

| Caso (`npx vitest run test/acessibilidade.test.ts` em `apps/web`) | Resultado | Saída |
| --- | --- | --- |
| LF, `Modal.tsx` do SHA (com a marca) | 21 de 21 | `$A/saidas/e13-1-LF-com-marca.txt` |
| LF, `Modal.tsx` SEM a marca | 21 de 21, VERDE (o achado A1 se confirma) | `$A/saidas/e13-2-LF-sem-marca.txt` |
| CRLF, com a marca | 21 de 21 | `$A/saidas/e13-3-CRLF-com-marca.txt` |
| CRLF, SEM a marca | 1 falha, "componentes/Modal.tsx:260" | `$A/saidas/e13-4-CRLF-sem-marca.txt` |
| LF, arquivo sintético com `<div onClick={f}>` numa linha, sem exceção | 1 falha, "ZzArbitro.tsx:3" | `$A/saidas/e13-5-sintetico-uma-linha-LF.txt` |
| LF, arquivo sintético com `<div` sozinho na linha e `onClick` embaixo, sem exceção | 21 de 21, VERDE | `$A/saidas/e13-6-sintetico-div-sozinho-LF.txt` |
| LF, expressão de `elementos()` aceitando fim de linha, com a marca | 21 de 21 (nenhuma violação escondida aparece) | `$A/saidas/e13-7-regex-corrigida-com-marca.txt` |
| idem, sem a marca | 1 falha, "componentes/Modal.tsx:260" | `$A/saidas/e13-8-regex-corrigida-sem-marca.txt` |
| LF, `comentarioAcima` trocado de volta pela janela fixa de quatro linhas | 1 falha, "a exceção vale pelo comentário inteiro, e só por ele" | `$A/saidas/e13-9-janela-de-4-linhas-de-volta-LF.txt` |

Todas as mutações foram restauradas; `git status` do worktree limpo (fora os links de `node_modules`).

Critérios da etapa que tocam a disputa:

- "O que deve", Testes: "o portão ... procura a marca no bloco de comentário contíguo acima do elemento, em vez de uma janela fixa de quatro linhas". Implementado (`comentarioAcima`) e mordido em LF, sem depender do Modal: com a janela de quatro linhas de volta, o caso sintético reprova (linha 9 da tabela).
- Teste positivo: "os 5 casos de painel desta etapa ... `acessibilidade` passam". Passa em LF e em CRLF.
- Teste negativo: "o portão de acessibilidade ainda reprova um `onClick` sem exceção escrita (caso sintético)". Reprova: o caso sintético do arquivo e o meu sintético composto (linha 5) ficam vermelhos.
- Definition of Done: os 5 casos verdes; defeito do `/` provado; soma do painel em zero. Não tocados pela disputa; o QA os provou (669 de 669, e2e 70 de 70 em dois motores, mutações mordem).

## Evidência

- Saídas `$A/saidas/e13-1-*.txt` a `$A/saidas/e13-9-*.txt` (tabela acima).
- Origem da cegueira: `git blame -L 280,280 4ce0433 -- dc360/apps/web/test/acessibilidade.test.ts` dá o commit `029ce781` de 2026-08-21, anterior à V2. A expressão `/<[a-z][a-zA-Z0-9]*[\s/>]/` de `elementos()` não foi escrita nem alterada pela E13; ela exige um caractere depois do nome da tag, que em LF não existe quando `<div` está sozinho na linha. Em CRLF o `\r` casa com `\s`, e por isso a etapa, feita no Windows antes do `.gitattributes` da E21, viu o Modal vermelho e depois verde.

## Cenários positivos

- O conserto declarado (ler o bloco de comentário inteiro) funciona e é mordido por teste em LF (linha 9) e no composto em CRLF (linhas 3 e 4).
- Com a expressão de `elementos()` corrigida, a exceção do Modal é lida corretamente pelo novo `comentarioAcima` (linha 7) e a falta dela reprova (linha 8).

## Cenários negativos

- `onClick` em `<div>` de uma linha, sem exceção, reprova (linha 5).
- Marca solta no código e bloco distante não valem (casos sintéticos do arquivo, verdes no SHA).
- Autorização e isolamento da etapa (operador em `/usuarios` sem formulário; `/` sem sessão vai a `/entrar`): provados pelo QA em dois motores; não estão em disputa.

## Tentativas de reprovar

1. Tentei mostrar que o critério da etapa cai em LF: o caso do Modal fica verde sem a marca (confirmado). Mas o critério escrito é o portão ler o bloco contíguo e reprovar `onClick` sem exceção no caso sintético; os dois mordem em LF. O que não morde é a DETECÇÃO do elemento em `elementos()`, que a etapa não lista em "O que deve" e não alterou.
2. Tentei achar violação real escondida pela mesma cegueira: com a expressão corrigida, o painel no SHA continua 21 de 21 (linha 7). Nenhum `onClick` sem teclado passa hoje por causa do A1.
3. Tentei achar texto do repositório escrito pela etapa que prometa mais do que o portão faz (o defeito que reprova a E05 nesta mesma rodada): o docblock de `comentarioAcima` descreve só a leitura do comentário, e é verdadeiro. O nome do caso ("nenhum onClick pendurado em elemento que o teclado não alcança") é anterior à V2 e a etapa não o escreveu.
4. Princípio da fase "cada conserto é provado por teste que falha antes e passa depois": vale para o conserto declarado (linha 9 em LF; linhas 3 e 4 em CRLF). Não há mutação que desfaça o conserto da etapa e deixe o teste verde.

## Achados

**Decisão: PASS.** O A1 do QA é real e reproduzido, mas não decide critério da etapa; fica como **corrige antes de crescer**, com o mesmo conteúdo.

Por quê: a etapa prometeu trocar a janela de quatro linhas pela leitura do bloco contíguo, e isso está feito e mordido por teste em LF e em CRLF. O verde em LF sem a marca vem de uma cegueira de `elementos()` de 2026-08-21, fora do escopo e do texto da etapa, que não esconde nenhuma violação hoje (linha 7). Nenhum dos quatro PASS é contradito no que examinou.

O que ficou exposto, e por isso o A1 não pode virar "anotado": desde a E21 todo checkout é LF, inclusive no Windows e no CI, então a cobertura composta do Modal (portão inteiro vendo o fundo do modal e lendo a exceção) hoje só existe em CRLF, que nenhum checkout produz mais. Um `onClick` novo em `<div` multilinha sem teclado entra verde. Conserto: em `apps/web/test/acessibilidade.test.ts:280`, `/<[a-z][a-zA-Z0-9]*([\s/>]|$)/` (provado nas linhas 7 e 8), mais um caso sintético com `<div` sozinho na linha. Dono: correção pequena da própria E13 ou F10-E11, registrado no STATUS.

Item do "Motivo do veredito" da rodada 4: nada a consertar; a correção 4 não tocou os arquivos da etapa (QA conferiu o diff vazio).

## Não verificado

- Não reexecutei a regressão do painel, o e2e local nem as sondas de autorização: estão nos relatórios do QA, do UX e da acessibilidade e não estão em disputa.
- Leitor de tela real anunciando o `role="status"`.
- CI do SHA: ausente nesta sessão.

## Risco residual

Até o conserto do A1, um `onClick` em elemento não interativo com a tag aberta sozinha na linha passa pelo portão em qualquer checkout. Hoje não há nenhum no painel.

## Motivo do humano

A etapa pede que Rafael digite só o domínio, entre e chegue à tela do papel, e aprove as seis frases de confirmação: uso real e texto de produto, que nenhum teste decide.
