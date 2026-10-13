---
validador: testes
modelo: claude-sonnet-5-5
etapa: V2-F00-E06
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, AUTH, AUTHZ]
nivel_de_prova_exigido: [E1]
nivel_de_prova_obtido: [E1]
veredito: FAIL
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

HEAD 665b2be difere de 7005a60 só no STATUS. Código validado: o do SHA.

1. Suíte da etapa verde e estável: `packages/campo/test/pausa-de-sessao.test.ts` 28 de 28, rodada 3 vezes seguidas, sem variação. Jest do app (token, pausa-da-fila, falha-de-atualizacao, fila-pausada-pela-sessao, faixa-de-sincronizacao, api-conta-desativada): 6 suítes, 71 de 71. Sem espera fixa nem relógio real nos testes do motor: `agora` e `dormir` são injetados; os únicos `setTimeout(r, 0)` de `token.test.ts` só cedem a vez ao laço de eventos. O único uso de relógio real é `campo-integracao.test.ts` (JWT assinado de verdade), aceitável.
2. Os testes mordem (mutação própria, 9 mutações em `transporte.ts` e `fila.ts`, rodadas contra `pausa-de-sessao.test.ts` + `fila.test.ts`, 86 testes; todas desfeitas com `git checkout -- src`):
   - M0 remover a comparação "token igual não repete": 2 reprovam.
   - M1 desligar o atalho `entrar_de_novo` (gasta renovação com sessão encerrada): 2 reprovam.
   - M2 sem token vira `FalhaPermanente`: 3 reprovam.
   - M3 repetir o pedido com o token velho: 2 reprovam.
   - M4 dreno não para após `FalhaDeSessao` (continua nos itens seguintes): 2 reprovam.
   - M5 a pausa gasta tentativa: 6 reprovam.
   - M6 `usuarioId` da pausa nulo (pausa vaza para outro autor): 4 reprovam.
   - M7 a pausa não é limpa após envio com sucesso: 2 reprovam.
   - M8 todo 403 vira `conta_desativada`: 3 reprovam.
   - Mutação de tela: `fila.tsx` sem o cartão "Guardada" (`if (false)`): 2 de 9 reprovam em `fila-pausada-pela-sessao.test.tsx`.
   Nenhum mutante sobreviveu. Os testes são de comportamento observável (estado do item, `paradaPor`, `resumo`, cabeçalhos do fio), sem mock de colaborador interno: o transporte real roda contra `fetch` falso e, em `campo-integracao`, contra a API real.
3. Cobertura de caso que a suíte NÃO tem (as duas sondas abaixo): nenhum teste cobre 403 `troca_de_senha_obrigatoria` na fila, nem a corrida `cancelar()` + troca de usuário + resposta tardia.

## Evidência

Sondas temporárias (copiadas para o scratchpad `.../scratchpad/zz-val-sonda.test.ts` e `zz-val-integracao.test.ts`, removidas do repositório):

- `npx vitest run test/zz-val-sonda.test.ts` em `dc360/packages/campo`: exit 0 (as sondas imprimem o resultado, não afirmam).
- `npx vitest run test/zz-val-integracao.test.ts --testTimeout=120000` em `dc360/apps/api`: exit 0, API real, Postgres em memória, `transporteHttp` e fila reais.
- Mutações: laço `for i in 0..8` com script Python que troca o trecho e `git checkout -- src` ao fim de cada uma.

## Cenários positivos

- 401 `nao_autenticado` renova uma vez e sobe com a mesma chave (testes do SHA, verdes).
- Conta reativada seguida de nova entrada: sobe e fica UMA vistoria (`campo-integracao`, verde no CI).

## Cenários negativos

### Ponto 1: 403 `troca_de_senha_obrigatoria` (EXECUTADO, REPROVA)

Unitário, `transporteHttp` real + `criarFilaDeSincronizacao` real, 3 coletas, resposta 403 `{erro:"troca_de_senha_obrigatoria"}`:

```
resultado {"enviados":0,"adiados":0,"bloqueados":3,"interrompido":false}
estados   3 x {estado:"bloqueado", tentativas:1, codigo:"troca_de_senha_obrigatoria", permanente:true}
segunda volta: bloqueados 0, enviados 0, fetch continua em 3 chamadas (bloqueado não volta sozinho)
```

O dreno não para (continua nos três itens) e todos viram `bloqueado`. Causa: `falhaDaResposta` em `packages/campo/src/transporte.ts` só reconhece 403 de ação `parar_e_avisar`; `troca_de_senha_obrigatoria` (ação `trocar_a_senha` no catálogo) cai em `FalhaPermanente`, e `tratarFalha` em `packages/campo/src/fila.ts` bloqueia.

Ponta a ponta contra a API real (Postgres em memória, seed), no caminho ORDINÁRIO de redefinição, não num caso exótico:

```
POST /usuarios/{diego}/redefinir-senha (como coordenadora)      -> 200, senha temporária
(a) fila drena com a sessão velha                                -> paradaPor sessao_encerrada, bloqueados 0, item pendente   (E06 funciona)
(b) agente entra com a senha provisória                          -> login 200, trocaDeSenhaObrigatoria true
    fila drena com o token novo                                  -> bloqueados 1, item "bloqueado", falha troca_de_senha_obrigatoria, permanente true
    resumo                                                       -> bloqueados 1, pausadaPor "sessao_encerrada" (pausa velha, não limpa)
```

A correção de que o QA desconfiava (senha redefinida com sessão viva) NÃO é o caminho: `redefinir-senha` encerra as sessões do agente (`encerrarSessoes`, `apps/api/src/rotas/administracao.ts`), então a sessão velha recebe 401 `sessao_encerrada` e pausa certo (a). O defeito aparece no passo seguinte e é o fluxo normal: a coordenação redefine, entrega a senha provisória, o agente entra no app. O app ignora `trocaDeSenhaObrigatoria` (nenhuma leitura em `apps/campo/src`, só a frase de `api.ts`), abre a sessão, o dreno automático dispara e TODA coleta guardada vira `bloqueado`. Na tela, `fila.tsx` calcula `podeDescartar = parada` e `recusaEstaNoDado` é falso para esse código, então o cartão mostra "Tentar de novo" e "Descartar" (lido no código; não renderizado). "Tentar de novo" recupera depois que a senha é trocada no painel; "Descartar" apaga a vistoria.

Classificação: BLOQUEIA. É exatamente o que o bloco da etapa diz eliminar ("coleta ... marcada como recusada", "sem tela para desbloquear e com Descartar ao lado") e o que a DoD proíbe ("nenhum item bloqueado ou descartado por 401 ou 403 de sessão ou conta"). O código é do catálogo de acesso (`CODIGOS_DE_ERRO_DE_ACESSO`), 403 de conta: a conta existe e a credencial está certa, o que falta é um ato da pessoa. Cai no item 5 da lista da seção 7 de `28` (perda de dado do campo): o item não é apagado pelo sistema, mas fica `bloqueado` com `Descartar` ao lado, e portanto NÃO admite risco aceito. Também cai na linha "Fila do campo sem perda" do G00 (`03-fase-00-estabilizacao.md:778`: "nenhum item é bloqueado, descartado ou duplicado"). A PENDENCIAS item 14 documentar o furo não o torna aceito.

Correção mínima sugerida (fora da minha alçada): tratar a ação `trocar_a_senha` como `FalhaDeSessao` (novo motivo, ou `sessao_encerrada` com frase própria "defina sua senha no painel") em `falhaDaResposta`, e limpar a pausa velha; teste primeiro (vermelho com os dois caminhos acima).

### Ponto 2: pausa atribuída ao usuário errado (EXECUTADO, CONFIRMADO)

`transporteHttp` real, dreno do agente B com resposta pendente, `fila.cancelar()`, sessão passa a A, resposta tardia 403 `conta_desativada`:

```
dreno de B      {"bloqueados":0,"interrompido":true,"paradaPor":"conta_desativada"}
resumo (sessão A) {"pendentes":0,"bloqueados":0,"deOutroAutor":1,"pausadaPor":"conta_desativada"}
itens           [{estado:"pendente", tentativas:0, autor:"u-bruno"}]
```

`guardarPausaDeSessao` grava `usuarioId: sessaoAtual()?.usuarioId` no instante da resposta (A), não o do item (B). Resultado: o agente A vê "Conta desativada" sem ter nada com isso. Sem perda, bloqueio ou duplicação de dado (o item de B segue `pendente`, tentativas 0); some na próxima volta do dreno de A. Classificação: CORRIGE ANTES DE CRESCER (aviso falso e transitório, e conta desativada é mensagem de produto sensível). Correção: gravar `item.autor?.usuarioId`. Nenhum teste existente cobre essa corrida.

## Tentativas de reprovar

- Cenário (1) em duas camadas (unitário e API real): reprovou.
- Cenário (2): reprovou.
- 9 mutações de código e 1 de tela: todas mortas (a suíte é forte onde existe).
- Procurei outro 403 de acesso que escape do classificador: `acesso_suspenso` nas quatro rotas que a fila usa (`/sincronizacao/vistoria`, `/devolucao`, `/evidencias/autorizar-envio`, `/confirmar-envio`) está marcado `ROTA_DA_FILA_DO_CAMPO` e sai 503 (temporário), então não bloqueia. `sem_permissao` bloqueia por desenho. `posto_insuficiente` não é emitido pelas rotas da fila. Só `troca_de_senha_obrigatoria` escapa.
- Dependência de relógio e esperas fixas nos testes da etapa: nenhuma encontrada; 3 repetições idênticas.
- Teste que passa por acaso: a mutação M7 e M6 mostram que cada asserção é necessária; não achei teste vazio.

## Achados

1. BLOQUEIA: 403 `troca_de_senha_obrigatoria` bloqueia todos os itens da fila, sem parar o dreno, e o cartão oferece "Descartar". Reprodução: arquivos do scratchpad `zz-val-sonda.test.ts` (unitário) e `zz-val-integracao.test.ts` (API real); passo a passo no Ponto 1. Nenhum teste da etapa cobre esse código. Quem decide escopo: o gatekeeper já tem a resposta pelo item 5 da seção 7 de `28` (não admite risco aceito).
2. CORRIGE ANTES DE CRESCER: pausa atribuída ao usuário errado na corrida cancelar + troca de conta (Ponto 2). Falta teste da corrida.
3. ANOTADO: depois do bloqueio do Ponto 1 o `resumo().pausadaPor` continua `sessao_encerrada` (pausa de antes da nova entrada não é limpa por falha permanente), então a faixa do topo continua dizendo "Sessão encerrada" por cima de itens bloqueados.
4. ANOTADO: o `RESUMO.md` da evidência traz números desatualizados (20 falhas pré-existentes, `test:campo` caindo no typecheck); no SHA `test:campo` fecha verde (QA: 1861 de 1861). Não citar os números do RESUMO.

## Não verificado

- Interface real no emulador ou aparelho (E2 do bloco): não renderiza no ambiente. A presença de "Tentar de novo" e "Descartar" para o item bloqueado por `troca_de_senha_obrigatoria` é lida do código de `fila.tsx` e `conferencia.ts`, não de renderização nem de teste de componente.
- `npm run test:campo` completo, `test:api` completo, `test:isolamento` e `baseline`: não rodei (fora do mínimo da dimensão; QA rodou `test:campo` e `campo-integracao`; CI 9 de 9).
- Se o app, após o login com senha provisória, tem alguma tela de bloqueio que impeça o dreno: busquei `trocaDeSenhaObrigatoria` em `apps/campo/src` e não achei uso; não executei o app.
- Mutação de `token.ts` do aplicativo (piso de 60 s sob relógio real) e dos textos de `falha-de-atualizacao.ts`.
- Acessibilidade e portão visual: fora da minha dimensão.
- Vários municípios no mesmo aparelho: só mesma organização.

## Risco residual

Enquanto o achado 1 estiver aberto, todo agente cuja senha for redefinida com coleta na fila e que entrar com a senha provisória terá todas as coletas `bloqueado` com "Descartar" ao lado. A senha provisória é o procedimento padrão de recuperação de conta, então o caso é frequente, não raro. A suíte, fora esse buraco, é forte.

## Motivo do humano

Rafael decide a correção do achado 1 (tratar `trocar_a_senha` como pausa de sessão, com frase de produto a aprovar) e confere a frase nova no aparelho; o texto de produto é dele. Também é dele confirmar se prefere impedir no app a entrada com senha provisória (decisão de produto, fora desta etapa).
