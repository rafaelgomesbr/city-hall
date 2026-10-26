---
validador: qa (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E15
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---

Pasta das saídas citadas abaixo (S): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/qa-E06-E14-E15-E16/`. A árvore validada é a do HEAD `0290af5`, que só difere de `bb0f654` em `STATUS.md` e `ESTADO-ATUAL.md`; a pasta da evidência da E15 é idêntica nos dois SHAs.

## Critérios verificados

| Critério (bloco da etapa) | Como foi provado | Resultado |
| --- | --- | --- |
| DoD: 7 testes verdes | os 10 arquivos da etapa e vizinhos (diálogo, vistoria, aviso, precisão, sair e entrar, sessão vencida, ainda não baixada, logout): 69 de 69 (`41-e15-arquivos.txt`); jest inteiro 1927 de 1927 (`01-test-campo.txt`) | PASS |
| Mobile: Perfil assina a fila por `useResumoDaFila` | `perfil.tsx:349`; mutação que entrega só o primeiro resumo (equivale a ler uma vez na montagem) derruba "o diálogo de saída conta a fila de AGORA" e "quando a fila esvazia, o chip e o aviso de esperar somem" (`44-e15-mut-resumo-uma-vez.txt`) | PASS |
| DoD: diálogo conta rascunhos, singular e plural, botão destrutivo, frase curta sem nada | `aviso-da-saida.ts`; mutação que ignora os rascunhos derruba 8 casos (`43-e15-mut-dialogo-sem-rascunhos.txt`) | PASS |
| DoD: GPS excelente conclui; `Math.max(1, Math.round(accuracy))`, ausente `null` | `precisao-do-gps.ts`; mutação sem o piso derruba 3 casos (`42-e15-mut-sem-piso.txt`); `vistoria/[id].tsx:1521` é o único ponto que lê `accuracy` | PASS |
| Domínio: mensagem em português sem afrouxar `positive()` | sonda própria do esquema compilado (`40-sonda-esquema-gps.txt`): 0, -1 e -0,0001 recusados com "Precisa ser maior que 0"; API real: 201 para 1, 201 para nulo, 422 para 0 (`05-api-campo-integracao.txt`, `precisao-do-gps-na-sincronizacao`, 3 de 3) | PASS |
| DoD: comentário de `banco-local.ts` verdadeiro | lido em `banco-local.ts:275-288`: diz que a saída apaga a vistoria começada, que o diálogo conta e onde está a prova; `apagarDadosLocais` de fato não apaga `fila_sincronizacao` nem arquivos ainda na fila | PASS |
| Testes negativos: "Entrar de novo" (sessão vencida) não apaga | `vistoria-sessao-vencida-preserva-o-rascunho.test.tsx` e `a-sessao-vencida-nao-apaga-a-vistoria.test.tsx` verdes; busca: o único `sair()` do app fora da implementação está em `perfil.tsx:1479`, depois do diálogo | PASS |
| Autorização e isolamento: outro agente encontra o aparelho limpo, a mesma pessoa reencontra a vistoria | `sair-e-entrar-nao-perde-a-coleta.test.ts` (SQLite real) verde | PASS no caminho feliz (ver Não verificado) |
| Regressão: `test:campo`, `test --workspace @dc360/shared`, `test:api` | `test:campo` 1927/1927; `test:api` 1326 passam, 1 falha só em `openssl-do-teste` (LibreSSL, máquina) (`06-test-api.txt`); o shared roda dentro de `test:scripts`/`build:shared` (ver Não verificado) | PASS com ressalva |
| Evidência: `INDEX.md` byte a byte (motivo do BLOCKED da rodada 3) | script próprio contra os blobs de `bb0f654` (`21-index-E15.txt`): 26 de 26 batem; fora só `saidas/baseline-depois/INDEX.md` (excluído por regra); `conferir-evidencia.mjs V2-F00-E15 --sha bb0f654` código 0 | PASS |

## Evidência

- `cd dc360 && npm run test:campo` código 0, 134 suítes, 1927 casos, tipos limpos (`01-test-campo.txt`).
- `cd dc360/apps/campo && npx jest <10 arquivos>` código 0, 69 de 69 (`41-e15-arquivos.txt`).
- Mutações, desfeitas com `git restore` e conferidas com `git status` limpo: `42-e15-mut-sem-piso.txt` (código 1, 3 reprovam), `43-e15-mut-dialogo-sem-rascunhos.txt` (código 1, 8 reprovam), `44-e15-mut-resumo-uma-vez.txt` (código 1, 2 reprovam).
- `node sonda-gps.mjs packages/shared/dist/index.js` (`40-sonda-esquema-gps.txt`), valores 0, -1, -0,0001, 0,3, 1, 12, 1e12, nulo, "5", NaN, Infinity, ausente.
- `cd dc360/apps/api && npx vitest run test/precisao-do-gps-na-sincronizacao.test.ts ...` 3 de 3 (`05-api-campo-integracao.txt`); `npm run test:api` (`06-test-api.txt`).
- `node scripts/roadmap/conferir-evidencia.mjs V2-F00-E15 --sha bb0f654` código 0 (`20-conferir-evidencia-E15.txt`).

## Cenários positivos

- "2 vistorias começadas" no plural e uma só no singular sem foto, com o botão de confirmar destrutivo.
- Chip e aviso de esperar somem quando a fila esvazia, sem trocar de aba.
- Precisão 0,3 grava 1 e 12,4 grava 12; "Precisão de 1 metro" no singular.
- A mesma pessoa que sai pela sessão vencida e entra de novo reencontra rascunho, foto e assinatura.

## Cenários negativos

- Sem rascunho e sem fila o diálogo não fala em apagar.
- Disco que falha ao listar rascunhos: o diálogo avisa do mesmo jeito (premissa c), coberto por `aviso-da-saida.test.ts`.
- Precisão ausente, `NaN`, infinita, zero ou negativa grava `null` (`precisao-do-gps.ts`, filtro `Number.isFinite` e `> 0`).
- Esquema: 0 e negativos recusados em português; texto recusado.
- Servidor: 422 com `vistoria.gpsPrecisaoMetros: Precisa ser maior que 0` para precisão 0 de app antigo (compatibilidade pedida).

## Tentativas de reprovar

1. Fiz o Perfil voltar a enxergar só o primeiro resumo da fila: os dois testes de "fila ao vivo" reprovam.
2. Tirei os rascunhos do texto do diálogo: 8 casos reprovam.
3. Tirei o piso do GPS: 3 casos reprovam, inclusive o que passa cada valor gravado pelo esquema do servidor.
4. Mandei valores absurdos ao esquema (achados 1 e 2): nenhum deles chega pelo fio de forma a quebrar a etapa, porque `NaN` e `Infinity` viram `null` no JSON e o app já filtra os não finitos.
5. Procurei outro chamador de `sair()` ou `apagarDadosLocais` que apague a vistoria começada sem diálogo: só o Perfil (depois do diálogo) e `acolherNoAparelho` (entrada de outra pessoa, regra mantida pela etapa).
6. Procurei rascunho antigo com precisão 0 gravada antes do conserto: na conclusão ele cai na conferência local (o campo é mapeado para a seção de localização, `vistoria/[id].tsx:231`) ou, se já estiver na fila, no 422 com "Corrigir"; não há perda, e a recusa do 0 é a compatibilidade pedida.
7. Conferi o `INDEX.md` sobre os bytes do git, não sobre o disco: bate.

## Achados

1. Anotado (fora do critério): `gpsPrecisaoMetrosSchema` com `NaN` devolve a frase "Era esperado um número, veio um número" (mal escrita; `40-sonda-esquema-gps.txt`). Inalcançável pela API (JSON não carrega `NaN`), mas é texto do mapa de mensagens do `shared`.
2. Anotado (fora do critério): o esquema aceita `Infinity` e 1e12 m (sem teto). Pelo fio `Infinity` vira `null`; 1e12 passaria. A etapa não pede teto.
3. Anotado, já registrado pela rodada 3 e com dono F14-E02 (item 3 da seção 7 de `28`, sem risco aceito, bloqueio de piloto): `acolherNoAparelho` falha aberto quando a limpeza falha no meio. Não reproduzido por mim nesta rodada (não é critério da E15: "a etapa só avisa, não muda a regra").

## Não verificado

- Os dois fluxos E2E em aparelho ou emulador (vistoria começada e "Sair da conta" com o diálogo listando o que será apagado; concluir com GPS simulado abaixo de 0,5 m sem 422): não há emulador Android e não há build para o Simulador de iOS (montar exigiria `pod install`, proibido). A metade do servidor foi provada pela rota real; a da tela, por teste de componente.
- Captura do diálogo no aparelho, nos dois temas e em tela pequena.
- `npm run test --workspace @dc360/shared` não foi rodado isoladamente por mim (o esquema foi exercitado pela sonda sobre o `dist` recém-compilado e pela rota da API).
- O caminho de falha de `acolherNoAparelho` (achado 3) e o resíduo de WAL e dos originais da câmera (achados LGPD registrados): fora do escopo da QA desta etapa.
- O run do CI do SHA (não lido nesta sessão).

## Risco residual

- Quem sai da conta ainda perde a vistoria começada; agora é avisado. Preservar é decisão do CP-24 (F14-E02).
- Achado 3: a limpeza entre pessoas que falha no meio pode deixar o rascunho de um agente visível ao seguinte.
- O texto do diálogo foi provado por teste de componente; a quebra de linha na tela real não foi vista.

## Motivo do humano

- Aparelho físico e E4 explícito na etapa: Rafael faz os dois fluxos num aparelho disponível (diálogo de saída com vistoria começada; GPS abaixo de 0,5 m concluindo).
- Texto de produto: as frases do diálogo de saída (`aviso-da-saida.ts`) e "Precisão de 1 metro" (premissa a) precisam da aprovação dele.
