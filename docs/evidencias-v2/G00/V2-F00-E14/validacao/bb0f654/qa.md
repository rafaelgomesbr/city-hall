---
validador: qa (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E14
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [MOBILE, A11Y]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---

Pasta das saídas citadas abaixo (S): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/qa-E06-E14-E15-E16/`. A árvore validada é a do HEAD `0290af5`, que só difere de `bb0f654` em `STATUS.md` e `ESTADO-ATUAL.md`; a pasta da evidência da E14 é idêntica nos dois SHAs.

## Critérios verificados

| Critério (bloco da etapa) | Como foi provado | Resultado |
| --- | --- | --- |
| DoD: 6 testes verdes | os três arquivos mais os irmãos (`a-sessao-vencida-nao-apaga-a-vistoria`, `logout-nao-apaga-prova`, `falha-de-atualizacao`): 6 suítes, 52 de 52 (`30-e14-arquivos-e-irmaos.txt`); jest do app inteiro 1927 de 1927 (`01-test-campo.txt`) | PASS |
| Testes negativos: a frase da sessão encerrada não instrui "Sair da conta" | mutação: a frase antiga (`Toque em "Sair da conta"`) no produto derruba 3 casos, inclusive V-CAM-01 e V-CAM-02 (`34-e14-mut-frase-antiga.txt`) | PASS |
| Testes negativos: dublê sem `acolherNoAparelho` faz o caso de deriva reprovar | mutação: linha do dublê removida, os 5 casos do arquivo reprovam e a deriva lista `"acolherNoAparelho"` (`32-e14-mut-duble-sem-acolher.txt`) | PASS |
| Caso de deriva acompanha a fonte de `sessao.tsx` | mutação: `sessao.tsx` importa um nome novo (`bancoLocal`) de `./banco-local`; a deriva reprova listando `"bancoLocal"` (`33-e14-mut-deriva.txt`) | PASS |
| Testes positivos: os 4 casos de logout exercitam o `sessao.tsx` real | o dublê só cobre `banco-local`; `sessao.tsx` é importado real; os 4 casos passam e reprovam com o dublê incompleto | PASS |
| Autorização e isolamento: `logout-nao-apaga-prova.test.ts` verde | incluído na rodada dos irmãos, verde | PASS |
| DoD: nenhum arquivo de produto alterado pela etapa | a frase vigente ("Toque em \"Entrar de novo\"", "Nada é apagado") já existia em `falha-de-atualizacao.ts` no pai do commit `99390e0` (linhas 152-153); `saidas/08` lista só os três testes | PASS |
| DoD: decisão registrada com evidência | `docs/DECISOES-DE-TESTE-DA-FASE-00.md` linhas 55 e 72 em diante, seção "campo: sessão encerrada e logout (E14)" | PASS, com achado 2 (linha citada derivou) |
| Regressão: `npm run test:campo` e `npm run test --workspace @dc360/campo` | 1927/1927 com tipos limpos; 223/223 | PASS |
| Evidência: `INDEX.md` byte a byte (motivo do BLOCKED da rodada 3) | script próprio contra os blobs de `bb0f654` (`21-index-E14.txt`): 15 de 15 SHA-256 batem; único arquivo fora: `saidas/baseline-depois/INDEX.md`, excluído por regra de `montarIndice`; `conferir-evidencia.mjs V2-F00-E14 --sha bb0f654` código 0 | PASS |

## Evidência

- `cd dc360 && npm run test:campo` código 0, 134 suítes, 1927 casos, tipos limpos (`01-test-campo.txt`).
- `cd dc360 && npm run test --workspace @dc360/campo` código 0, 223 de 223 (`02-pacote-campo.txt`).
- `cd dc360/apps/campo && npx jest <três arquivos e três irmãos>` código 0, 52 de 52 (`30-e14-arquivos-e-irmaos.txt`).
- Mutações, cada uma desfeita com `git restore` e conferida com `git status` limpo: `31-e14-mut-instrucao-sair.txt` (código 1, 2 reprovam), `32-e14-mut-duble-sem-acolher.txt` (código 1, 5 reprovam), `33-e14-mut-deriva.txt` (código 1, a deriva reprova), `34-e14-mut-frase-antiga.txt` (código 1, 3 reprovam).
- `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E14 --sha bb0f654` código 0 (`20-conferir-evidencia-E14.txt`); conferência própria do índice (`21-index-E14.txt`, script `conferir-index.sh`).

## Cenários positivos

- V-CAM-01 e V-CAM-02 exigem `Toque em "Entrar de novo"` e `Nada é apagado` e passam com o texto do produto.
- Os 4 casos do logout passam com o dublê completo, sem mudar asserção.
- `falha-de-atualizacao.test.ts` e `a-sessao-vencida-nao-apaga-a-vistoria.test.tsx` seguem verdes.

## Cenários negativos

- Frase antiga no produto: 3 reprovam.
- Instrução sem aspas acrescentada ("Se não der, toque em Sair da conta."): 2 reprovam (V-CAM-01 e o irmão da sessão vencida); V-CAM-02 NÃO reprova (achado 1).
- Dublê sem `acolherNoAparelho`: os 5 reprovam, com a deriva nomeando o que falta.
- Nome novo importado por `sessao.tsx` sem dublê: a deriva reprova.

## Tentativas de reprovar

1. Pus de volta a instrução antiga no produto e uma variação sem aspas, para ver se o negativo só pega a forma literal: a variação passa por V-CAM-02, mas é pega por V-CAM-01 e pelo teste irmão, que leem a mesma fonte de frase (`comoContarAFalha`).
2. Tirei `acolherNoAparelho` do dublê e acrescentei um import novo em `sessao.tsx`: a deriva reprova nos dois casos, então ela não é lista escrita à mão.
3. Procurei arquivo de produto alterado pela etapa: a frase vigente é anterior ao commit da etapa; o que mudou em `banco-local.ts` no mesmo commit agrupado é o comentário da E15.
4. Recalculei o `INDEX.md` sobre os bytes do git em `bb0f654`, e não sobre o disco, para não repetir a armadilha do fim de linha da rodada 3: bate.
5. Procurei regressão da troca de expo e expo-router nos testes da etapa: verdes no jest inteiro.

## Achados

1. Anotado: o negativo de V-CAM-02 (`perfil-a-sessao-que-terminou-e-o-aviso-que-fecha.test.tsx:176`) só reconhece a instrução COM aspas (`/toque em "Sair da conta"/i`). A frase "Se não der, toque em Sair da conta." acrescentada ao produto passa por ele (reprodução em `31-e14-mut-instrucao-sair.txt`). O defeito não escapa hoje porque V-CAM-01 e o teste irmão leem a mesma frase e reprovam; a escolha está registrada como premissa (a) da E14 (a tela tem um botão legítimo "Sair da conta").
2. Anotado (documentação): `docs/DECISOES-DE-TESTE-DA-FASE-00.md` (linhas 90 e 133) cita `app/(agente)/index.tsx:1222` como a decisão datada; em `bb0f654` o comentário "15/09/2026 este botão chamava `sair()`" está na linha 1234 (o arquivo cresceu nas correções da E06 e da E16). A citação continua achável pelo texto, mas o número de linha não aponta mais para ele.

## Não verificado

- O texto na tela real (aparelho ou emulador): não há emulador Android nesta máquina e não há build para o Simulador de iOS; a etapa declara E2E "Não se aplica" e remete a prova em aparelho à F14-E12.
- O run do CI do SHA (não lido nesta sessão).

## Risco residual

- Baixo: só testes mudaram. O negativo estreito de V-CAM-02 (achado 1) depende de V-CAM-01 continuar lendo a mesma fonte de frase.

## Motivo do humano

- Texto de produto: a validação humana da etapa é "Rafael lê as frases finais da sessão encerrada". A leitura e aprovação do texto é dele; não depende de aparelho para esta etapa.
