---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E06
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, AUTH, AUTHZ]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: secao 7 de 28, itens 2, 4 e 5 (nao admitem risco aceito)
---
## Critérios verificados

HEAD 665b2be difere de 7005a60 só no STATUS; o código exercitado é o do SHA (`dist` de `@dc360/shared` e `@dc360/campo` reconstruído a partir da árvore antes das sondas).

1. DoD "nenhum item bloqueado ou descartado por 401 ou 403 de sessão ou conta": **VIOLADO** por 403 `troca_de_senha_obrigatoria` (A1, abaixo). Confirmo o FAIL de `testes.md` com prova própria e acrescento que o caminho de descarte é alcançável e apaga a coleta sem que ela exista no servidor.
2. Testes negativos do bloco (401 `sessao_encerrada`, 403 `conta_desativada`, sem token): cumpridos (MATRIZ e suíte do SHA, 86 de 86 em `pausa-de-sessao.test.ts` mais `fila.test.ts`).
3. Testes positivos (401 `nao_autenticado` renova uma vez; retomada sem duplicar): cumpridos (D1, D3).
4. "403 `sem_permissao` ainda bloqueia": cumprido, e tem consequência que o bloco não discute (AU2).
5. Autorização ("item de outro autor espera o autor"): cumprido no caminho sequencial; **violado na corrida** de troca de conta com item em voo (AU1), com escrita de autor errado na trilha append-only.
6. Os testes mordem: 3 mutações próprias mortas; 1 mutação inversa sobrevive e prova que nenhum teste fixa a classificação de `troca_de_senha_obrigatoria`.

## Evidência

Scratchpad: `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/78869014-3ace-4efd-a059-e24f265aea3c/scratchpad/redteam/`.

- Sonda `zz-rt-sonda.test.ts` (cópia no scratchpad; esteve em `dc360/apps/api/test/` e foi APAGADA): API real em porta efêmera, Postgres em memória com seed, `transporteHttp`, fila e `criarObtentorDeToken` (de `apps/campo/src/dados/token.ts`) reais; segundo agente Bruno (`agente_campo`, Equipe Alfa) inserido só no banco de teste. `npx vitest run test/zz-rt-sonda.test.ts --testTimeout=120000` em `dc360/apps/api`: exit 0, 7 de 7. Saída: `saida2.txt` (a primeira rodada, `saida1.txt`, foi invalidada por contaminação entre cenários: a senha redefinida em A1 vazava para os seguintes; corrigido restaurando o hash ao fim de A1).
- Base sem mutação, `dc360/packages/campo`: `npx vitest run test/pausa-de-sessao.test.ts test/fila.test.ts`, exit 0, 86 de 86 (`base.txt`).
- Mutações (cada uma desfeita com `git restore` antes da seguinte): `mutA.txt`, `mutB.txt`, `mutC.txt`, `mutD.txt`.
- `git status --porcelain` final: só as pastas `validacao/` de E04 e E06.

## Cenários positivos

- D1, retomada depois de pausa com resposta perdida: o servidor gravou (201), o aparelho recebeu 401 `sessao_encerrada` forjado; item `pendente`, tentativas 0, `paradaPor: sessao_encerrada`. Nova entrada, novo dreno: `duplicados: 1`, servidor com 1 vistoria. A chave é a do item (`id = idempotencyKey`) e nenhum caminho da pausa a reescreve.
- D3, renovação concorrente: duas filas drenando ao mesmo tempo com o mesmo obtentor, token de acesso ilegível e refresh rotativo real. `/auth/renovar` chamado 1 vez (a trava junta os dois pedidos), os dois envios sobem, nenhuma revogação por reuso.
- Matriz: 401 de qualquer código e 403 `conta_desativada` param o dreno na primeira chamada, zero bloqueado, tentativas inalteradas.

## Cenários negativos

### Matriz código x classificação (fila de campo, rotas `/sincronizacao/vistoria`, `/sincronizacao/devolucao`, `/evidencias/autorizar-envio`, `/evidencias/confirmar-envio`)

Origem na API: `servidor.ts` (`exigirAutenticacao`, `setErrorHandler`, `autorizar`), `auth/vigencia.ts` (`exigirVigencia`), `rotas/sincronizacao.ts`, `rotas/evidencias.ts`. Classificador: `packages/campo/src/transporte.ts` (`pedir`, `falhaDaResposta`). Comportamento medido na MATRIZ (fetch falso, 2 itens) e confirmado ponta a ponta onde marcado.

| Status e código | A API emite em escrita da fila? | Fila classifica | Medido |
| --- | --- | --- | --- |
| 401 `nao_autenticado` | sim (token inválido; papel do banco diferente do token) | renova 1 vez; se o token não muda, pausa `sessao_encerrada` | MATRIZ, D3 |
| 401 `sessao_encerrada` | sim (sessão ou cadeia encerrada, conta sumida, senha provisória vencida) | pausa | MATRIZ, A1 |
| 401 sem código ou outro | não esperado | pausa | MATRIZ |
| 403 `conta_desativada` | sim | pausa `conta_desativada` | MATRIZ |
| **403 `troca_de_senha_obrigatoria`** | **sim, toda escrita com senha provisória** | **permanente: bloqueia TODOS, não para o dreno** | **MATRIZ, A1** |
| 403 `sem_permissao` | sim (`autorizar`, papel sem `registrar_vistoria`) | permanente (por desenho do bloco) | MATRIZ, AU2 |
| 403 `acesso_suspenso` | não nestas rotas (503 por `ROTA_DA_FILA_DO_CAMPO`; o 403 fixo do `DC367` só sai de `abrir_sessao`, que é entrada e renovação) | permanente se chegasse | MATRIZ |
| 403 `posto_insuficiente` | não nestas rotas | permanente | MATRIZ |
| 409 `autor_divergente` | sim (vistoria e devolução) | permanente (por desenho) | MATRIZ, AU1 |
| 409 `ja_encerrada` | sim | arquivado | MATRIZ |
| 409 de dado (`tamanho_divergente`, `hash_divergente`, `arquivo_ausente`, `vistoria_ja_concluida`, `transicao_invalida`, `tarefa_no_prazo`, recusas de foto) | sim | permanente | lido |
| 410, 423 | não nestas rotas (410 só em `rotas/oficios.ts`, HTML público) | permanente se chegasse | MATRIZ |
| 503 (inclusive `acesso_suspenso`), 429, 507 | sim | temporária, para o dreno | MATRIZ |

Único código de acesso que a API emite numa escrita da fila e que cai em permanente fora do desenho do bloco: `troca_de_senha_obrigatoria`.

### A1: senha provisória, ponta a ponta (REPROVA)

2 coletas do Diego na fila; a coordenação redefine a senha (`POST /usuarios/{id}/redefinir-senha`).

```
sessao velha         paradaPor sessao_encerrada, bloq 0, 2 x pendente t0   (E06 funciona)
login provisoria     trocaDeSenhaObrigatoria true
dreno, token novo    paradaPor null, bloq 2, interrompido false,
                     2 x {bloqueado, t1, troca_de_senha_obrigatoria}
resumo               bloqueados 2, pausadaPor "sessao_encerrada" (pausa velha não limpa)
descartar(item 1)    restam 1; servidor: 0 vistorias, 0 evidencias
```

O dreno NÃO para (testa a fila inteira contra a mesma recusa de quem manda), todos viram `bloqueado`, e `fila.tsx:1354` (`podeDescartar = parada || ...`) oferece "Descartar". O descarte apaga a única cópia da coleta. O app não lê `trocaDeSenhaObrigatoria` na entrada (só a frase de `api.ts`), então o caminho é o procedimento padrão de recuperação de conta.

### AU2: rebaixamento de papel com coleta na fila

Bruno com 1 coleta; papel trocado para `operador` no banco. Dreno: 1 renovação (401 `nao_autenticado`, papel diferente), token novo, 403 `sem_permissao`, item `bloqueado` com "Descartar". É o desenho declarado do bloco ("403 `sem_permissao` continua permanente"), mas o efeito para a coleta é o mesmo que a etapa elimina para a desativação.

## Tentativas de reprovar

- (a) Matriz de 16 combinações status x código contra o classificador real, mais leitura de todo emissor de 401, 403, 409, 410 e 423 nas quatro rotas. Achou `troca_de_senha_obrigatoria` (bloqueia) e confirmou que `acesso_suspenso`, `posto_insuficiente`, 410 e 423 não chegam a essas rotas hoje.
- (b) Duplicação:
  - retomada com resposta perdida (D1): 1 vistoria, sem duplicação;
  - chave diferente na retomada: não alcançável pela pausa. O item pausado fica `pendente`, `retirarParaCorrecao` recusa (`nao_esta_parada`) e `enfileirar` só aceita a mesma chave com o mesmo conteúdo. Com o item `bloqueado` por A1, "Corrigir a vistoria" fica disponível, mas o servidor recusou antes de gravar, então não há vistoria a duplicar;
  - renovação concorrente (D3): 1 renovação, sem detecção de reuso;
  - dois drenos simultâneos (D2: `cancelar()` com o envelope em voo, o segundo dreno envia o mesmo item com foto, a resposta tardia do primeiro é 401): servidor com 1 vistoria e 1 evidência. Mas o 401 tardio REESCREVE o item já `confirmado` de volta para `pendente`, com `pausadaPor: sessao_encerrada` falsa. O dreno seguinte reenvia e recebe `duplicados: 1`. Sem duplicação no servidor; o estado local regride e a faixa mente até o próximo dreno. Causa: `guardarPausaDeSessao` grava o retrato velho do item sem conferir o estado atual.
- (c) Autoria (AU1): item do Diego com 1 foto; o token passa a ser do Bruno durante o PUT dos bytes (a pessoa sai e o outro entra com o envio em voo; `cancelar()` só vale entre itens). Resultado:

```
evidencias      anexada_por Diego, enviada true, vistoria_id null
trilha_eventos  evidencia_anexada                  autor "Bruno Teixeira Lima", origem campo
                vistoria_recusada_autor_divergente autor Bruno
item            bloqueado autor_divergente (com Descartar)
Diego volta e toca em Tentar de novo: vistoria do Diego, foto amarrada,
                e a trilha continua dizendo que Bruno anexou a foto
```

  `/evidencias/confirmar-envio` e `/evidencias/autorizar-envio` não conferem autor, ao contrário de `/sincronizacao/vistoria` e `/devolucao` (409 `autor_divergente`). Com a troca antes da autorização, `seguranca-aplicacao.md` (S1) obteve `anexada_por` do segundo agente; aqui, com a troca no PUT, o autor errado vai para a trilha. É escrita com autor falso na trilha append-only, sem correção possível: itens 2 e 4 da seção 7 de `28`. Não é regressão da E06 (a janela existia antes), mas a etapa afirma a propriedade "item de A não sobe com a sessão de B" e ela não vale sob corrida.
- Mutações: A (a fila trata `FalhaDeSessao` como falha comum) 12 de 86 reprovam; B (403 `conta_desativada` deixa de ser sessão) 4 reprovam; C (sem token volta a ser `FalhaPermanente`) 3 reprovam. D, inversa (classificar `trocar_a_senha` como pausa): 187 de 187 passam em `packages/campo/test/`, ou seja, nenhum teste fixa esse código. A suíte morde onde existe; o buraco não tem teste.

## Achados

1. **BLOQUEIA** (seção 7, item 5, sem risco aceito). 403 `troca_de_senha_obrigatoria` bloqueia todas as coletas, não para o dreno, oferece "Descartar", e o descarte apaga coleta que o servidor nunca recebeu. Reprodução: A1. Correção: em `falhaDaResposta`, a ação `trocar_a_senha` vira `FalhaDeSessao` (motivo próprio, frase a aprovar pelo Rafael) e a pausa velha é limpa; teste vermelho primeiro com A1.
2. **BLOQUEIA o G00** (itens 2 e 4, sem risco aceito; anterior à E06). A corrida de troca de conta com item em voo grava `evidencia_anexada` com autor errado na trilha append-only (AU1) e `anexada_por` errado (S1 da segurança). Correção: o motor fixa o token do autor do item, ou reconfere `autoriaDaColeta(item, sessaoAtual())` antes de cada chamada e trata a troca como `FalhaDeSessao`; o servidor recusa autorizar ou confirmar evidência quando o autor declarado diverge do token, como já faz na vistoria. O gatekeeper decide se o conserto entra na E06 ou em etapa própria do G00, mas não pode virar risco aceito.
3. **Corrige antes de crescer.** D2: a resposta tardia 401 de um dreno cancelado rebaixa item `confirmado` para `pendente` e liga pausa falsa (mesma raiz do ponto 2 de `testes.md`: pausa e item gravados com o estado do momento errado). Sem perda nem duplicação no servidor.
4. **Anotado, decisão do Rafael.** AU2: rebaixar o papel de um agente com coleta na fila bloqueia tudo com "Descartar" (403 `sem_permissao`). É o que o bloco manda, mas é "403 de conta" em tudo menos no nome.
5. **Anotado.** 401 `nao_autenticado` dentro do piso de 60 s do obtentor pausa como `sessao_encerrada` ("entre de novo") quando só faltava esperar; corrige sozinho no próximo dreno.
6. **Anotado.** 403 `acesso_suspenso` seria bloqueado se chegasse a uma rota da fila; hoje não chega (503). Defesa em profundidade: classificar `aguardar_o_contrato` como temporária no cliente.
7. **Anotado, anterior à E06.** `descartar` aceita item de outro autor em qualquer estado (`fila.ts:1267`): no aparelho compartilhado, o agente A pode apagar a coleta guardada do agente B desativado, com confirmação nominal.

## Não verificado

- Emulador ou aparelho (E2 do bloco): o app Expo não renderiza no ambiente. "Descartar" no cartão foi lido em `fila.tsx`, não renderizado; o descarte foi executado pela API da fila.
- O tempo real da janela de AU1 em rede de campo (simulei a troca no instante do PUT).
- Mais de um município no mesmo aparelho; cofre real (`expo-secure-store`).
- Suítes completas `test:api`, `test:campo` e `test:isolamento`: não rodei (QA e o CI, 9 de 9, cobrem; esta dimensão rodou a suíte da etapa e as sondas).
- Duas autorizações da mesma foto no mesmo instante no banco (há índice único parcial em `004_evidencia_idempotente.sql`; D2 terminou com 1 evidência, mas não forcei a simultaneidade exata).

## Risco residual

Com o achado 1 aberto, todo agente que recebe senha provisória e entra no app com coleta na fila tem todas as coletas bloqueadas com "Descartar" ao lado. Com o achado 2 aberto, a troca de turno com envio em voo pode deixar na trilha imutável um agente como autor de foto que ele não fez. Fora isso, pausa, renovação e idempotência resistiram às tentativas.

## Motivo do humano

Rafael decide e aprova a frase do novo motivo de pausa por senha provisória (texto de produto) e confere no aparelho; decide se o rebaixamento de papel com coleta na fila (achado 4) deve pausar em vez de bloquear; e decide onde entra o conserto de autoria (achado 2), sabendo que ele não admite risco aceito.
