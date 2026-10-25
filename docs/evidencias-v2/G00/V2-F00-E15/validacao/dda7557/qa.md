---
validador: qa (general-purpose)
modelo: claude-sonnet-5-5
etapa: V2-F00-E15
sha_validado: dda7557
ci_run: 40132234324
rodada: 9
herdado_de: fd17ff4 (rodada 7, QA PASS) para o que a etapa fez; esta rodada revalida só o que a correção 10 da E19 tocou nos testes e no esquema
tags: [MOBILE, OFFLINE, A11Y, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Notação: `$Q` = `/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/d900a13c-1e42-4b88-9465-82d873257632/scratchpad/qa-lote`. Produto validado: o da árvore em `d4683cc`, que só difere de `dda7557` em `STATUS.md` e `ESTADO-ATUAL.md`. Para rodar o aplicativo montei um worktree `wt-qa` em `d4683cc` com `npm ci --ignore-scripts` na raiz, `npm run build` de `@dc360/shared` e `@dc360/campo` e `npm ci` em `apps/campo` (removido ao fim). Por diferença desde a rodada 7 (`fd17ff4`): `git diff 60cbc2f..dda7557 -- dc360/apps/campo dc360/packages/campo` toca SÓ seis arquivos de teste (uma linha cada) e nenhum arquivo de produção do aplicativo nem do motor de campo.

| Critério (bloco da etapa) | Resultado | Prova |
| --- | --- | --- |
| DoD: os 7 testes (6 do diálogo, 1 do GPS) verdes com a árvore do Zod 4 | PASS | `$Q/e15/jest-etapa.txt`: 17 arquivos da etapa e vizinhos (diálogo, aviso da saída, precisão, sair e entrar, sessão vencida, isolamento, Perfil, vistoria), 193 de 193, código 0 |
| Diálogo conta rascunhos e fotos, botão destrutivo, singular e plural | PASS (mordida R1 abaixo) | `jest-etapa.txt`; `$Q/e15/mut-R1.txt` |
| Sem rascunho e sem fila, o diálogo não fala em apagar | PASS | `dialogo-na-conta.test.tsx` e `aviso-da-saida.test.ts` dentro de `jest-etapa.txt` |
| "Entrar de novo" (sessão vencida) não apaga | PASS (mordida V1) | `$Q/e15/mut-V1.txt` |
| GPS: `Math.max(1, Math.round(accuracy))`, ausente grava `null`, o esquema recusa 0 e negativo em português sem afrouxar `positive()` | PASS (mordida G1) | `precisao-do-gps.test.ts` em `jest-etapa.txt`; `$Q/e15/mut-G1.txt`; `$Q/e15/conferir.mjs` (saída abaixo); `npm run test --workspace @dc360/shared` 224 de 224 (`$Q/e19/shared-test.txt`); `precisao-do-gps-na-sincronizacao.test.ts` 3 de 3 dentro de `$Q/e19/api-test.txt` |
| Isolamento: outro agente entra e `acolherNoAparelho` limpa; a mesma pessoa reencontra a vistoria | PASS (mordida X1) | `entrar-de-outra-pessoa-limpa-o-aparelho.test.tsx` e `sair-e-entrar-nao-perde-a-coleta.test.ts` em `jest-etapa.txt`; `$Q/e15/mut-X1.txt` |
| A troca do dublê `11111111-1111-1111-1111-111111111111` por `11111111-1111-4111-8111-111111111111` não mascara regressão | PASS | seção "Tentativas de reprovar", itens 1 a 3 |
| O aplicativo real nunca gera id fora do padrão | PASS | seção "Tentativas de reprovar", item 4 |
| Tipos do aplicativo com o Zod 4 | PASS | `npm run typecheck` em `apps/campo`: código 0 (`$Q/e15/typecheck-app.txt`) |
| E2E no aparelho e validação humana (E4 da etapa) | Não executável aqui | pendência humana, inalterada (sem emulador nem aparelho) |

Saída de `conferirColeta` (o mesmo caminho de esquemas que o cartão "Corrija N itens" usa, com `@dc360/shared` e `@dc360/campo` compilados do worktree, `$Q/e15/conferir.mjs`):

```
válida => APROVADA
GPS 0 => vistoria.gpsPrecisaoMetros: Precisa ser maior que 0
GPS 0.3 (app antigo: cru) => APROVADA
sem assinante => vistoria.assinanteNome: Informe quem assinou
foto tipo gif => fotos.0.tipoConteudo: Tipo de arquivo não aceito: só entram JPEG, PNG, WebP e HEIC.
foto tamanho NaN => fotos.0.tamanhoBytes: O tamanho do arquivo precisa ser um número de bytes.
foto tamanho undefined => fotos.0.tamanhoBytes: O tamanho do arquivo não foi informado.
foto 20 MB => fotos.0.tamanhoBytes: O arquivo passa de 15 MB, que é o teto por arquivo.
chave de foto não UUID => fotos.0.idempotencyKey: A chave de envio deste arquivo precisa ser um UUID.
checklist vazio => vistoria.checklist: Precisa ter ao menos 1 item | vistoria.checklist: A vistoria precisa responder todos os itens obrigatórios do checklist: ...
```

(O "GPS 0.3 aprovada" é a prova de que o piso de 1 metro do aparelho não é necessário para o esquema aceitar 0,3: o esquema é `positive()`, e o que o aparelho grava é `Math.max(1, Math.round(...))`, nunca 0.)

## Evidência

- `$Q/e15/jest-etapa.txt` (193 de 193, código 0), `$Q/e15/typecheck-app.txt` (0), `$Q/e15/arquivos.txt` (a lista de arquivos).
- `$Q/e15/jest-uuid-antigo.txt`: os seis arquivos de teste com o dublê antigo restaurado (worktree).
- Mutações: `$Q/e15/mut-V1.txt`, `mut-G1.txt`, `mut-R1.txt`, `mut-X1.txt`. Cada uma foi aplicada no worktree com `sed`, rodada e desfeita com `git restore src`; `git status --short` do worktree termina vazio. A árvore principal não foi tocada para a E15.
- `$Q/e19/diff-shared3.txt` (diferencial Zod 3 contra Zod 4 do pacote que a E15 usa: `gpsPrecisaoMetrosSchema` só muda ao recusar `Infinity` com a frase "Precisa ser um número finito", que o Zod 3 aceitava).

## Cenários positivos

- Precisão 0,3 grava 1; 12,4 grava 12; ausente grava `null` (`precisao-do-gps.test.ts`, verde).
- 2 vistorias começadas, com foto e assinatura: plural; uma sem anexo: singular (`dialogo-na-conta-com-vistoria-comecada.test.tsx`, verde).
- A Ana sai pela sessão vencida e volta: rascunho, foto e assinatura continuam no disco (`vistoria-sessao-vencida-preserva-o-rascunho.test.tsx`, verde com o dublê novo).

## Cenários negativos

- Sem rascunho e sem fila o diálogo não fala em apagar.
- O esquema recusa 0 (`vistoria.gpsPrecisaoMetros: Precisa ser maior que 0`) e a API responde 422 com a frase em português (`precisao-do-gps-na-sincronizacao.test.ts`, verde).
- O Bruno entra no aparelho da Ana e não lê nada dela (X1 derruba 4 testes).

## Tentativas de reprovar

1. **A troca do dublê esconde algo?** Restaurei o `11111111-1111-1111-1111-111111111111` nos seis arquivos do worktree e rodei os seis (`$Q/e15/jest-uuid-antigo.txt`): 2 arquivos reprovam (`orgaos-a-acionar.test.tsx` e `vistoria-mapa-e-historico.test.tsx`, 4 casos que concluem a vistoria e esperam o envelope na fila); `tela-de-vistoria`, `vistoria-ainda-nao-baixada`, `sessao.test.tsx` e **o teste da E15** (`vistoria-sessao-vencida-preserva-o-rascunho.test.tsx`) PASSAM com o dublê antigo. Conclusão: o fato da correção 10 ("com o UUID não RFC os casos não enfileiravam, em 6 testes") só vale para 2 dos 6 arquivos; no arquivo da E15 a troca é de uniformidade, não de necessidade. Quanto ao risco de máscara: a troca ENDURECE o dublê (agora passa pelo mesmo `uuid()` estrito do servidor) e não relaxa asserção nenhuma (diff de uma linha por arquivo, só a constante).
2. **O teste da E15 ainda morde com o dublê novo.** V1 (a sessão vencida passa a chamar `apagarDadosLocais()`): 2 casos do arquivo da E15 reprovam, "'Entrar de novo' leva à entrada e o rascunho, a foto e a assinatura continuam no disco" e "a Ana entra de novo e reencontra a vistoria como deixou" (`mut-V1.txt`). Desfeito.
3. **Outras mordidas do conserto da E15.** G1 (sem o piso `Math.max(1, ...)`): 3 casos reprovam, entre eles "todo valor que o aparelho grava passa no esquema do servidor" (`mut-G1.txt`). R1 (o Perfil não conta rascunhos: `contarRascunhos([])`): 4 casos reprovam (`mut-R1.txt`). X1 (`acolherNoAparelho` nunca apaga): 4 casos reprovam (`mut-X1.txt`). Todas desfeitas.
4. **O aplicativo real gera id fora do padrão?** (a) `idempotencyKey`, chave da assinatura e chave da devolução: `Crypto.randomUUID()` de `expo-crypto` (`apps/campo/src/app/(agente)/index.tsx:781`, `vistoria/[id].tsx:1292,1522,1635,1853`). Li o módulo nativo instalado: Android `UUID.randomUUID().toString()`, iOS `UUID().uuidString.lowercased()`, ambos v4. (b) `ocorrenciaId`, `evidenciaId`, `usuarioId` (`coletadaPor`), `agenteId`, `equipeId`: vêm do servidor (`gen_random_uuid()`, v4). (c) O id do item da fila é a própria `idempotencyKey` (`packages/campo/src/fila.ts:471,546`). (d) O rascunho local é chaveado pela `ocorrencia_id` do servidor (`rascunho.ts:119-191`). (e) Nenhum arquivo de `apps/campo` nem de `packages/campo` importa `zod` nem monta UUID à mão (`git grep`: sem `Math.random` em id, sem gerador `xxxxxxxx-xxxx`; `git log -S` mostra `randomUUID` desde o primeiro commit do aplicativo), então não há fila antiga no aparelho com chave que o servidor passe a recusar. (f) Os únicos UUID fora do padrão em `apps/campo` são `11111111-2222-3333-4444-555555555555` em três testes de push (`aviso.test.ts`, `despacho-toca-uma-vez.test.tsx`, `tarefa-nova-com-o-aplicativo-aberto.test.tsx`), que passam no CI; o código de push do aplicativo (`src/push/*.ts`, fora dos testes) importa do `@dc360/shared` só tipos e a constante `SEVERIDADES`, nenhum esquema, então o id desses testes não passa pelo `uuid()`.
5. **A mensagem do GPS/aparelho em inglês.** Provoquei no `conferirColeta` as classes que o aparelho pode produzir (GPS 0, assinante vazio, foto GIF, tamanho NaN, ausente, 20 MB, chave não UUID, checklist vazio): todas em português (saída acima). Não achei frase em inglês.
6. **A migração do Zod muda o que o GPS aceita?** `diff-shared3.txt`: `gpsPrecisaoMetrosSchema` com 0, negativos, NaN, texto, objeto, lista: mesma aceitação e mesmas frases; só `Infinity` mudou (agora recusado, "Precisa ser um número finito"). O aparelho nunca grava `Infinity` (`precisaoDoGpsEmMetros` descarta não finito).
7. **O Perfil guarda a vistoria começada quando o disco não responde?** Coberto pelos casos "o disco não responde" e "o disco respondeu zero e na segunda pergunta falha" (R1 os derruba). Não encontrei lacuna nova.

## Achados

- Anotado (precisão do fato do implementador, sem efeito no produto): a justificativa da troca de dublê é válida só para 2 dos 6 arquivos (tentativa 1). Nada a corrigir no código; vale ajustar o texto do registro se alguém o citar.
- Herdado, sem mudança: `acolherNoAparelho` falha aberto quando a leitura do dono ou a limpeza falham (dono F14-E02, classificado nas rodadas anteriores).
- A frase "Valor não reconhecido: undefined" e os demais achados do Zod 4 estão no relatório da E19 desta rodada; nenhum alcança o fluxo da E15 (o aplicativo não tem enum obrigatório sem valor inicial; o `conferirColeta` acima não mostrou o caso).

## Não verificado

- Os dois fluxos da etapa em aparelho ou emulador (vistoria começada e "Sair da conta" com o diálogo real; GPS simulado abaixo de 0,5 m concluindo sem 422 contra o servidor): não há emulador nem aparelho nesta máquina. `expo-sqlite`, `expo-secure-store` e o disco são simulados (um dos testes usa SQLite real do Node).
- A aparência do botão de perigo e das frases na tela real.
- A suíte inteira do aplicativo (139 suítes, 1997): rodei as 17 da etapa e vizinhas; o CI rodou a inteira (jobs verdes, run 40132234324).
- As mutações foram rodadas sobre os arquivos de teste da etapa, não sobre a suíte inteira.
- Node 24.15.0 local, contra o 22 do CI.
- `acolherNoAparelho` com falha de armazenamento no meio da limpeza (herdado, fora da etapa).

## Risco residual

O que sobra é o que só o aparelho mostra: o armazenamento nativo apagando de verdade, o diálogo desenhado, o GPS real. A troca de dublê não deixa risco novo: o dublê agora é um v4 válido.

## Motivo do humano

Inalterado: o Rafael faz os dois fluxos num aparelho (vistoria começada e "Sair da conta", conferindo diálogo, botão de perigo e frases; conclusão com GPS abaixo de 0,5 m sem 422) e aprova "Precisão de 1 metro" e as frases do diálogo.
