---
validador: seguranca-aplicacao (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E06
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, AUTH, AUTHZ]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---

## Critérios verificados

1. 401 `sessao_encerrada` e 403 `conta_desativada` param o dreno: todos os itens ficam `pendente`, zero `bloqueado`, tentativas inalteradas, `ultimaFalha` nula, o item seguinte nem é tocado. Confirmado com o motor REAL contra a API REAL, inclusive com a conta desativada pelo endpoint no meio de um item com foto.
2. Drenar de novo com a conta desativada não bloqueia nem gasta tentativa (sem laço contra o servidor). Confirmado em 5 drenos seguidos.
3. 401 `nao_autenticado` (e 401 sem corpo) renova UMA vez; se não adianta, pausa. 401 `sessao_encerrada` não gasta a renovação. Confirmado.
4. Depois de reativar e entrar de novo, a coleta sobe UMA vez (mesma chave): uma vistoria, uma evidência confirmada e amarrada, um evento `evidencia_anexada` com o autor certo. Confirmado.
5. 403 `sem_permissao` continua bloqueando; município suspenso dá 503 (temporária) na fila, sem bloquear. Confirmado.
6. Autoria: itens de outro autor não sobem com a sessão de outra pessoa; a foto em voo com troca de conta é recusada pelo servidor (409 `autor_divergente`) sem gravar evidência nem trilha. Confirmado pelos testes do implementador, executados por mim.

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/seguranca-aplicacao-E04-E05-E06-E08/` (abaixo, `<S>`).

- Sonda própria `<S>/sonda/fila.test.ts`: `criarFilaDeSincronizacao` e `transporteHttp` de `packages/campo/src` (fonte), API real ouvindo numa porta local (`app.listen`), `fetch` de verdade com um gancho que dispara a desativação pelo endpoint `PATCH /usuarios/:id/situacao` logo ANTES de `/evidencias/autorizar-envio`, de `/evidencias/confirmar-envio` ou de `/sincronizacao/vistoria`; sessão do aparelho com renovação real por `/auth/renovar` (recusa devolve o mesmo token, como `apps/campo/src/dados/token.ts`). Código 0, 7 de 7 (`<S>/fila-sonda-saida.txt`).
- Testes na árvore: `apps/api/test/campo-integracao.test.ts` 17 de 17 e `evidencia-so-do-autor.test.ts` 11 de 11 (`<S>/api-relevantes-arvore.txt`); pacote do campo 223 de 223 (`<S>/campo-mut-base.txt`, rodado numa cópia idêntica, ver abaixo); app de campo (jest) 9 suítes, 109 de 109: `token`, `falha-de-atualizacao`, `pausa-da-fila`, `obter-fila-uma-so`, `troca-de-conta-com-pedido-em-voo`, `api-conta-desativada`, `fila-pausada-pela-sessao`, `faixa-ligada-a-fila-real`, `faixa-de-sincronizacao` (`<S>/campo-app-e06.txt`, código 0).
- `packages/campo/dist` (que `campo-integracao` importa) conferido contra compilação nova do fonte: idêntico.
- Mordida: mutações numa CÓPIA de `packages/campo` em `<S>/campo-mut` (árvore intocada; `diff -r` vazio depois), rodando os testes do pacote na cópia e a minha sonda apontada para a cópia (`<S>/mutacoes-campo.txt`):
  - controle: 223 de 223 e 7 de 7;
  - M1, `fila.ts` sem o ramo `FalhaDeSessao` do dreno: 23 reprovam no pacote, 6 de 7 na sonda;
  - M2, `transporte.ts` sem `parar_e_avisar` (403 `conta_desativada` vira permanente): 6 no pacote, 4 na sonda;
  - M3, `transporte.ts` sem o ramo do 401 (o defeito original): 15 no pacote, 2 na sonda;
  - M4, `sessao_encerrada` gastando a renovação: 2 no pacote, 1 na sonda.

## Cenários positivos

- Depois da reativação e de nova entrada, os dois itens sobem (`enviados` 2), `paradaPor` indefinido, uma vistoria por chave, uma evidência com `enviada_em` e `vistoria_id`, um `evidencia_anexada` com `autor_id` do agente.
- 401 `nao_autenticado` com renovação possível: sobe sem pausar (`campo-integracao`).

## Cenários negativos

- Desativação pelo endpoint antes da autorização da foto, antes da confirmação da foto e antes do envelope: `paradaPor` `conta_desativada`, itens `[pendente, 0, null]` e `[pendente, 0, null]`, nenhum pedido com o id do segundo item, nenhuma vistoria no banco, nenhum `evidencia_anexada` antes da confirmação (no terceiro momento a foto já fora confirmada com a conta ativa, o que é legítimo).
- Sessão encerrada pelo administrador antes da foto: `sessao_encerrada`, renovações 0, um único pedido.
- 401 sem corpo: uma renovação, dois pedidos do envelope, pausa `sessao_encerrada`, item `pendente` com 0 tentativas.
- 401 `nao_autenticado` seguido de 403 `conta_desativada` na segunda tentativa: pausa `conta_desativada`.
- Município suspenso e conta desativada juntos: 503, nenhum bloqueio, sem pausa por conta.
- 403 `sem_permissao`: `bloqueado`, como a etapa manda.

## Tentativas de reprovar

1. Queda da conta NO MEIO do item com foto, em três pontos, pelo endpoint real (que também revoga as sessões, caminho que o teste antigo com UPDATE não pegava).
2. Laço contra o servidor: cinco drenos com a conta desativada; contagem de pedidos e de renovações por dreno.
3. Renovação gasta à toa: `sessao_encerrada` não pode chamar `renovarJa`; contei.
4. 401 sem código e 403 depois da renovação, com respostas forjadas no `fetch`.
5. Duplicação na volta: conferi vistoria, evidência e trilha depois da reativação.
6. Mutações M1 a M4: o motor sem cada peça do conserto reprova os testes do pacote e a minha sonda.
7. Regressão da correção 3 da E07 sobre a fila: a API das quatro rotas da fila continua respondendo 403 `conta_desativada` e 503 na suspensão (varredura da E04, `<S>/varredura-analise.txt`).

## Achados

- Nenhum que quebre critério da etapa.
- Anotado (pré-existente, registrado em `apps/campo/PENDENCIAS.md`): `descartar` aceita coleta de outro autor em qualquer estado, com confirmação na tela. Não é disparado por 401 nem 403; é ato humano no aparelho de outra pessoa.
- Anotado: o PUT dos bytes da foto vai à URL assinada (`PUT /armazenamento/objeto`, em `SEM_TOKEN`) e não passa pela vigência; com uma URL emitida antes da desativação, os bytes ainda sobem dentro da validade dela. A confirmação (`/evidencias/confirmar-envio`) é recusada, então nada entra na trilha nem fica amarrado; existe rotina de objetos órfãos (`apps/api/src/armazenamento/orfaos.ts`), que não conferi. Fonte: `packages/campo/src/transporte.ts` (`enviarBytes`) e `apps/api/test/superficie-registrada.ts`.

## Não verificado

- CI do SHA não lido (`gh` sem login).
- Nenhuma execução em aparelho nem emulador (não há emulador Android nesta máquina). O motor foi provado contra a API real; a tela, pelos testes de componente do app. A frase e o portão visual no aparelho são das dimensões de UX e QA.
- `npm run test:campo` completo (1927 casos) não rodado por mim; rodei as 9 suítes que tocam sessão, pausa e token.
- O caminho do app que lê `conta_desativada` na renovação (`token.ts`, `renovarJa`) foi provado por teste unitário do app, não pela minha sonda (ela usa um obtentor de token equivalente, escrito por mim).

## Risco residual

- Pausa por falso 401 (renovação recusada por falta de sinal) se desfaz na volta seguinte do laço (60 s); item nunca é tocado.
- Coleta de quem foi desativado fica só no aparelho, sem reconhecimento pela coordenação (decisão futura da DP:T09, fora da etapa).

## Motivo do humano

Nenhum para esta dimensão. O critério de segurança (a fila para sem perder nem bloquear coleta e sem laço) foi provado com o motor real contra a API real. A conferência da frase no aparelho físico é de UX e QA.
