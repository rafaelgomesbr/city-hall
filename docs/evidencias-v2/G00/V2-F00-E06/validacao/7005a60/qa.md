---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E06
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, AUTH, AUTHZ]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

HEAD da árvore é 665b2be, que difere de 7005a60 só em `docs/roadmap-v2/STATUS.md` (git diff --stat: 1 arquivo, 1 linha). O código validado é o do SHA.

1. 401 `sessao_encerrada` pausa a fila sem perder: PASS. `packages/campo/test/pausa-de-sessao.test.ts` (28 testes, verdes) e minha sonda: o item fica `pendente`, `tentativas` inalteradas, zero `bloqueado`, `paradaPor = sessao_encerrada`, e o dreno para (o item seguinte nem é tocado).
2. 401 `nao_autenticado` renova UMA vez e repete: PASS. Sonda: a primeira requisição leva `Bearer velho`, a segunda `Bearer novo`, com a MESMA `idempotencyKey`. Se a repetição devolve 401 de novo, vira `sessao_encerrada`, sem laço. O teste "se a renovação devolve o MESMO token, nem repete o pedido" existe e passa.
3. 403 `conta_desativada` pausa a fila: PASS, por teste e por sonda. Também no caminho 401 `nao_autenticado`, renova e depois 403 `conta_desativada`: o resultado é `conta_desativada`, item pendente, tentativas 0.
4. Sem token vira `FalhaDeSessao`, não `FalhaPermanente`: PASS (teste "sem token vira FalhaDeSessao" e "sem token nenhum: pausa por sessão encerrada").
5. 403 `sem_permissao` e 403 sem código continuam bloqueando: PASS (testes dedicados; a mutação 3 abaixo os derruba).
6. Idempotência ao retomar: PASS. Na sonda, depois da pausa, os itens sobem uma vez cada, com chaves distintas e sem reenvio de item já confirmado. Integração real com a API e o banco: `apps/api/test/campo-integracao.test.ts`, 15 de 15. Conta desativada entre enfileirar e drenar devolve 403, o item fica pendente, não há nada no banco, e depois da reativação com nova entrada sobe e fica UMA vistoria.
7. Autoria: os itens do agente B esperam o autor e não sobem com a sessão do agente A. A pausa do B não aparece para o A (`pausadaPor` nulo, `deOutroAutor` 1). Teste existente, verde.
8. Item com foto: PASS. Na sonda, 401 `sessao_encerrada` em `confirmar-envio` depois do PUT deixa o item pendente, tentativas 0, a foto preservada (não perdida), e a retomada envia 1 vistoria. O progresso das fotos que já subiram é mantido (teste existente).
9. Frase "suas coletas continuam guardadas neste aparelho, procure a coordenação": existe em `falha-de-atualizacao.ts`, `pausa-da-fila.ts` e `api.ts`, e é coberta por testes de componente (`fila-pausada-pela-sessao.test.tsx` e `faixa-de-sincronizacao.test.tsx`). A aprovação da frase e o portão visual NÃO foram conferidos (ver Não verificado).
10. Regressão: `npm run test:campo` retorna 1861 de 1861 e a tipagem limpa. O resumo do implementador citava 20 falhas pré-existentes e agora há zero, então esse número está desatualizado no RESUMO.md.

## Evidência

Os comandos rodaram no SHA validado (a árvore em 665b2be difere só no STATUS). Saída no terminal da sessão; nada gravado no repositório.

- `npm run build:shared` (em `dc360/`), sem erro.
- `npx vitest run` em `dc360/packages/campo`: 9 arquivos, 187 de 187, exit 0.
- `npm run test:campo` (em `dc360/`): 127 suítes, 1861 de 1861, tipos limpos, exit 0.
- `npx vitest run test/campo-integracao.test.ts --testTimeout=120000` (em `dc360/apps/api`): 15 de 15, exit 0. Os 3 testes da E06 contra a API real passam.
- Sonda própria `packages/campo/test/zz-qa-sonda.test.ts` (criada e removida; `git status --porcelain` final só mostra pastas `validacao/`).
  - Passaram 4 de 5: 401 no meio do lote; `nao_autenticado` seguido de renovação e 403; 403 seguido de app reaberto e queda de rede; item com foto.
  - Falhou 1, a corrida de autoria (achado 1).
- Mutações, todas desfeitas com `git restore`:
  - M1: `transporte.ts` de afde25c de volta. 14 de 28 reprovam em `pausa-de-sessao.test.ts` e 2 em `fila.test.ts`.
  - M2: ramo `FalhaDeSessao` da `fila.ts` desligado. 12 de 28 reprovam.
  - M3: qualquer 403 tratado como conta desativada. 3 de 28 reprovam.
  - Os testes mordem.

## Cenários positivos

- 401 `nao_autenticado` renova e o item sobe.
- Token vencido de verdade renova uma vez e sobe sem pausar (integração com a API real).
- Reativação seguida de nova entrada: a coleta sobe e fica UMA vistoria no banco.
- Retomada depois de 401 no meio do lote: o item já confirmado não é reenviado.

## Cenários negativos

- 401 `sessao_encerrada`, 401 `nao_autenticado` sem renovação possível, 403 `conta_desativada`, sem token: zero bloqueado, zero descartado, tentativas inalteradas, dreno parado.
- 403 `sem_permissao`: bloqueia, como deve.
- Autorização e isolamento: agente A no aparelho do B desativado não envia o item do B. `enviar` não é chamado.
- Aplicativo fechado e reaberto com a fila pausada: a pausa é só de memória, `pausadaPor` começa nulo, e uma única requisição redescobre a pausa. Zero item perdido ou bloqueado.
- 403 seguido de queda de rede: o item vira adiado por falha temporária (comportamento esperado do motor), sem bloquear, e sobe depois com a rede de volta.

## Tentativas de reprovar

- 401 no meio de um lote de 3: o primeiro confirmado, o segundo pendente (tentativas 0), o terceiro intocado (2 requisições no total). Não reprovou.
- Reuso da mesma chave de idempotência na repetição pós-renovação: igual. Não reprovou.
- Foto confirmada e 401 na sequência: não reprovou.
- Aplicativo reaberto com a fila pausada: não reprovou.
- Reconexão depois de 403: não reprovou.
- Corrida entre `cancelar()` (logout ou perda de sinal), troca de usuário e resposta tardia de sessão do dreno antigo: REPROVOU (achado 1).
- Leitura do caminho 403 `troca_de_senha_obrigatoria`: continua `FalhaPermanente` (achado 2).
- Mutação de `transporte.ts` e de `fila.ts`: os testes reprovam, logo não são frouxos.

## Achados

1. CORRIGE ANTES DE CRESCER (cosmético, transitório): a pausa de sessão é atribuída ao usuário errado numa corrida. Reprodução: o agente B tem um dreno em andamento (resposta pendente), `fila.cancelar()` é chamado (o aplicativo faz isso em `apps/campo/src/dados/fila.ts:149`) e o agente A entra. A resposta 403 `conta_desativada` do B chega depois. `guardarPausaDeSessao` grava `usuarioId = sessaoAtual()` (o A), então `resumo().pausadaPor` do A fica `conta_desativada` e a faixa "Conta desativada, procure a coordenação" aparece para quem não tem nada com isso. Some na próxima volta do dreno do A (envio com sucesso ou nada pronto), em até cerca de 60 s. Nenhum dado é perdido, e o item do B fica pendente. Correção sugerida: gravar o `usuarioId` capturado no início do dreno (de quem era o `item.autor`) em vez do da sessão no instante da falha. Sonda: `zz-qa-sonda.test.ts` caso "corrida" (removido; reconstruível pelo texto acima).
2. CORRIGE ANTES DE CRESCER (documentado pelo implementador em PENDENCIAS item 14, fora dos "três códigos"): 403 `troca_de_senha_obrigatoria` na rota de sincronização continua sendo `FalhaPermanente`. Em `apps/api/src/servidor.ts` (por volta da linha 491), numa escrita a vigência vem do banco; se quem administra redefine a senha do agente para provisória enquanto há coleta na fila, o envio recebe 403 `troca_de_senha_obrigatoria`, o item vira `bloqueado` com "Descartar" ao lado. Isso reproduz a perda que a etapa quer eliminar, por outro 403 de conta. Não executei o cenário contra a API (só li o código); nenhum teste cobre. Dono: quem decidir o escopo da E06 (a DoD diz "401 ou 403 de sessão ou conta"). Se o gatekeeper ler `troca_de_senha_obrigatoria` como 403 de conta, este achado passa a BLOQUEIA e o veredito muda para FAIL.
3. ANOTADO: resposta tardia de um dreno cancelado grava o item como pendente com a cópia antiga, o que pode sobrescrever um "confirmado" de um dreno novo. Risco de reenvio, absorvido pela chave de idempotência (o servidor devolve `duplicada`). É o mesmo padrão pré-existente em `tratarFalha`. Não é regressão da etapa.
4. ANOTADO: o `RESUMO.md` ainda diz "20 falhas pré-existentes" no app e `test:campo` fechando em erro de typecheck. No SHA validado, `test:campo` fecha verde com 1861 de 1861. O documento está desatualizado; os números dele não devem ser citados.

## Não verificado

- Prova em emulador ou aparelho (o E2E exigido pela etapa: desativar o agente no painel durante uma coleta na fila, ver a frase, reativar, entrar de novo e ver a MESMA coleta subir uma vez). O APK em `apps/campo/android/` é antigo (29), o app Expo não renderiza no ambiente do agente, e não gerei build atual. A prova de interface é teste de componente.
- A aparência da faixa e do aviso (portão visual do 19: alinhamento, texto cortado em 390 de largura, dois temas) e a aprovação das frases por Rafael. Isso é pendente humana registrada no STATUS.
- Acessibilidade da faixa e do aviso (leitor de tela, foco, contraste AA nos dois temas), só por testes de componente e pelo portão de densidade do repositório.
- 403 `troca_de_senha_obrigatoria` contra a API real (achado 2).
- `npm run test:api` completo, `test:isolamento` e `baseline`: fora do mínimo desta dimensão; só rodei `campo-integracao`. O CI (run 37739535524) reporta 9 de 9 verdes, e eu não reabri os logs do CI.
- O fluxo do aplicativo real de ponta a ponta (hook de sessão, `token.ts` com o piso de 60 s sob relógio real): coberto por `token.test.ts` e por testes unitários, não executado em aparelho.
- Dois usuários em duas organizações diferentes pelo mesmo aparelho: só mesma organização (A e B de `org-serra-alta`), como nos testes do repositório.

## Risco residual

- Sem prova em aparelho, ficam abertas a renderização real da frase mais longa (conta desativada) na faixa de uma linha e a conferência de que o botão "Entrar de novo" só aparece na sessão encerrada.
- Uma pausa por falso 401 (renovação recusada por falta de sinal e lida como "token igual") se desfaz na volta seguinte do laço, sem perder item.
- Achado 2: agente com senha provisória e coleta na fila.

## Motivo do humano

Rafael precisa ver a frase e o item preservado no emulador ou no aparelho (a validação humana pendente registrada no STATUS), aprovar o texto de produto e conferir o portão visual (tela de 390 de largura e os dois temas). Só uma pessoa, ou um build atual rodando num emulador, fecha isso. Também é decisão dele se o achado 2 entra no escopo da E06.
