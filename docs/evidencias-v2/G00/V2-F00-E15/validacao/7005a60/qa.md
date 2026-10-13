---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E15
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E3a]
veredito: FAIL
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

- Diálogo "Sair da conta?" conta rascunhos, fotos e fila, singular e plural: PASS. `aviso-da-saida.test.ts` e `dialogo-na-conta-com-vistoria-comecada.test.tsx` verdes; mais 9 casos meus (ver Cenários).
- Resumo assinado (muda com a tela aberta): PASS. Teste da etapa (chip some sem trocar de aba) e caso meu: diálogo aberto com 2 coletas, ouvinte avisa 0, a frase da fila some.
- Precisão 0,3 vira 1, 12,4 vira 12, `undefined`/NaN/0/negativo viram `null`: PASS. `precisao-do-gps.test.ts`; `vistoria/[id].tsx:1515` usa `precisaoDoGpsEmMetros`. Esquema continua `positive()`: shared 3 de 3 e API (`POST /sincronizacao/vistoria`) 3 de 3.
- Comentário de `banco-local.ts` verdadeiro: PASS por leitura (E3a).
- Objetivo da etapa ("o agente deixa de perder vistoria começada ao sair da conta sem ser avisado"): FAIL, ver achado 1.

## Evidência

- `npm run build:shared`: saída 0.
- Jest dos 8 arquivos da etapa (aviso-da-saida, precisao-do-gps, sair-e-entrar-nao-perde-a-coleta, dialogo-na-conta*, vistoria-o-teclado..., a-sessao-vencida..., vistoria-ainda-nao-baixada): 8 suítes, 58 testes, verdes.
- `npm run test:campo` completo: typecheck limpo, jest 127 suítes e 1861 testes verdes (incluía meu arquivo temporário). O script saiu com código 1 só porque o conferidor de números viu o teste temporário a mais (rodada com o arquivo presente); o arquivo foi apagado. Saída: scratchpad `campo-full.txt`.
- Vitest shared e API da precisão: verdes.

## Cenários positivos

Temporários (arquivo `src/ui/tmp-qa-e15.test.tsx`, 9 de 9 verdes, apagado): rascunho criado DEPOIS de abrir o Perfil entra na contagem; só foto (sem assinatura) diz "com fotos" e não fala em assinatura; só assinatura não fala em foto; rascunho legado sem campo `fotos` não quebra; 3 rascunhos mais 1 coleta durante dreno (`sincronizando: true`) saem no mesmo diálogo com "1 coleta" no singular; `enviando` e `bloqueados` contam e `deOutroAutor` não; confirmar chama `sair` uma vez.

## Cenários negativos

- Disco não responde (`listarRascunhos` rejeita): o diálogo diz "Não deu para conferir..." e avisa do mesmo jeito. PASS.
- Sem rascunho e sem fila: frase curta, sem "começada" nem "apagar". PASS.
- "Entrar de novo" da lista de tarefas e da fila (`encerrarSessaoVencida`): não apaga. PASS (`a-sessao-vencida-nao-apaga-a-vistoria`).
- Precisão 0 e -1 no esquema: recusadas com "Precisa ser maior que 0". PASS.
- Isolamento entre agentes: `sair-e-entrar-nao-perde-a-coleta.test.ts` sobre SQLite real; outro agente recebe aparelho limpo e a fila do primeiro fica intacta. PASS (executado, não reescrito).

## Tentativas de reprovar

- Rascunho criado depois de abrir o Perfil: o Perfil lê no toque, conta certo.
- Sair durante o dreno: texto correto, mas não conferi o dreno real (só o resumo simulado).
- Sair por sessão encerrada: lista de tarefas e fila usam `encerrarSessaoVencida` (não apagam). A TELA DA VISTORIA NÃO: achado 1.
- Dois toques em "Sair da conta": cada toque lê o disco de novo, sem efeito colateral.

## Achados

1. **BLOQUEIA (a confirmar pelo gatekeeper se está no escopo da etapa).** `dc360/apps/campo/src/app/(agente)/vistoria/[id].tsx:1413-1415` (`sairEEntrarDeNovo`) chama `sair()` e é o botão "Sair e entrar de novo" (linha ~1979) quando o 401 chega ao tentar baixar uma vistoria ainda não baixada. `sair()` (`sessao.tsx:229`) chama `apagarDadosLocais`, que faz `DELETE FROM rascunhos` e apaga assinaturas e fotos fora da fila, SEM diálogo e sem contar rascunho. É o mesmo defeito do CMP-52 que `index.tsx:1223` e `fila.tsx:1748` já consertaram trocando para `encerrarSessaoVencida`. Reprodução: agente com vistoria A começada (rascunho no disco), abre a tarefa B despachada depois do último download, sessão revogada no servidor, toca "Baixar", vê "Sua sessão terminou", toca "Sair e entrar de novo": rascunho, fotos e assinatura de A somem. Evidência: o teste `vistoria-ainda-nao-baixada.test.tsx:227-246` exige `sair` chamado, o dublê de `useSessao` nem tem `encerrarSessaoVencida`, e `sair-e-entrar-nao-perde-a-coleta.test.ts` prova que `sair` apaga o rascunho. O trecho não foi tocado pela etapa (blame: 5ecdf4c4, 15/09). Correção: dono do contrato é a E15 (trocar para `encerrarSessaoVencida` e ajustar o teste).
2. **ANOTADO.** `apagarDadosLocais` também apaga `pendencias` (recuperável) e `coletas` (histórico das concluídas deste aparelho); o diálogo só fala em vistoria começada. Não é perda de trabalho não enviado.
3. **ANOTADO.** Se `listarRascunhos` demorar, o toque em "Sair da conta" não dá retorno até o disco responder (o diálogo só abre depois da leitura).

## Não verificado

- Interface real no emulador ou aparelho: o app não renderiza aqui e o APK é anterior; só teste de componente (Rafael obrigatório no portão visual, validação humana prevista na etapa). Capturas do diálogo pedidas na evidência não foram avaliadas.
- Achado 1 foi provado por leitura de código e pelo teste existente, não por execução de ponta a ponta com sessão real.
- Dreno real concorrente com a saída; leitura/acessibilidade do diálogo por leitor de tela; contraste.
- Revisão LGPD e de qualidade de testes (outros validadores).
- Comportamento com GPS real abaixo de 0,5 m em aparelho.

## Risco residual

Perda silenciosa de vistoria começada pelo caminho do achado 1 até ser corrigido. Fora isso, a regra de apagar na saída explícita permanece (decisão do CP-24, F14-E02).

## Motivo do humano

Rafael precisa fazer os dois fluxos em aparelho (previsto na etapa) e decidir se o achado 1 pertence à E15 ou vira etapa própria.

Alterações no repositório por mim: arquivo temporário `src/ui/tmp-qa-e15.test.tsx` criado e apagado; nenhuma mudança em código.
