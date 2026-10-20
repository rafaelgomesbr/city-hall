---
validador: red-team
modelo: claude-opus-5-5
etapa: V2-F00-E06
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
herdado_de:
tags: [MOBILE, OFFLINE, A11Y, AUTH, AUTHZ]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Diretório de trabalho (abaixo, `S`): `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L09-red-team`. Worktree próprio em `4ce0433`, PostgreSQL 17.6 próprio, sonda `S/sonda/zz-l09-redteam.test.ts`: o MOTOR REAL (`packages/campo/src`, importado do fonte para a mutação valer) com `transporteHttp` e `fetch` de verdade contra a API real numa porta efêmera, sobre Postgres 17.6 com RLS. O `obterToken` da sonda faz o que o aparelho faz: com `renovarJa`, renova UMA vez pela rota `/auth/renovar`.

| Critério (DoD e cinco campos) | Prova | Resultado |
| --- | --- | --- |
| 403 `conta_desativada` deixa os itens `pendente`, zero `bloqueado`, tentativas inalteradas, dreno parado | sonda, dois pontos de corte, com a conta desativada PELA ROTA `PATCH /usuarios/:id/situacao`: (a) dois itens com foto, desativação quando o motor lê os bytes da primeira foto (antes do primeiro pedido do item): `paradaPor conta_desativada`, bloqueados 0, itens `pendente/0` e `pendente/0`, 0 renovação, banco com 0 vistoria e 0 evidência; (b) desativação logo DEPOIS de `autorizar-envio` responder 201 (bytes em voo): `PUT /armazenamento/objeto` 200 (URL assinada), `confirmar-envio` 403, `paradaPor conta_desativada`, item `pendente/0`, banco com 1 evidência autorizada e 0 confirmada, 0 vistoria (`S/saidas/11-sonda-pg17-completa.log`) | PASS |
| Depois de reativar e entrar de novo, os itens sobem sem duplicar (mesma chave) | (a) reativação pela rota, nova entrada, dreno: 2 enviados, segundo dreno 0, banco 2 vistorias, 2 evidências, 2 confirmadas, itens `confirmado`; (b) 1 enviado, banco 1 vistoria e a MESMA evidência (1) agora confirmada, sem linha duplicada | PASS |
| 401 `sessao_encerrada` pausa sem bloquear | sessões encerradas pela rota de quem administra entre o 1º e o 2º item: o 1º sobe, `paradaPor sessao_encerrada`, enviados 1, bloqueados 0, itens 2 e 3 `pendente/0`, 0 renovação; depois da nova entrada sobem 2, banco 3 vistorias e 3 evidências confirmadas (nenhuma duplicada) | PASS |
| Renovação única, sem laço contra servidor que disse não | contador de renovações da sonda: 0 em conta desativada, 0 em sessão encerrada, 1 no 401 `nao_autenticado` do papel trocado | PASS |
| 403 `sem_permissao` continua permanente | papel trocado (agente vira operador) pela rota com a coleta na fila: 401 `nao_autenticado`, uma renovação, token novo com `operador`, 403 `sem_permissao`, item `bloqueado/1` (por desenho, decisão registrada em `apps/campo/PENDENCIAS.md`); papel de volta, "Tentar de novo" (`reenviar`), nova entrada: sobe 1, banco 1 vistoria. Não perde nem duplica | PASS |
| Autoria: itens de um não sobem com a sessão de outro; nada de outro município | token de agente de Vale Fundo no aparelho cujo autor é o Diego: a foto recebe 409 `autor_divergente` e o item fica `bloqueado`; impressão digital de todas as tabelas igual; o envio direto da vistoria com esse token responde 404 (nunca 403) | PASS |
| `campo-integracao.test.ts` e os testes do pacote | `S/saidas/01-api-arquivos-das-etapas.txt` (inclui `campo-integracao` e `evidencia-so-do-autor`) 193 de 193; pacote do motor 231 de 231 (`S/saidas/02-pacote-campo.txt`); oito suítes de jest do aplicativo (pausa, faixa ligada à fila real, troca de conta com pedido em voo, `obterFila` única, falha de atualização, lista pausada) 92 de 92 (`S/saidas/05-app-campo-jest-e06.txt`) | PASS |
| Frase aprovada e prova em aparelho | não verificável por mim (sem emulador; texto de produto) | humano |

## Evidência

- Sonda em PG 17.6: código 0, 15 de 15, 0 FALHA (`S/saidas/11-sonda-pg17-completa-vitest.txt`, `S/saidas/11-sonda-pg17-completa.log`; a rodada anterior, sem o corte (b), 14 de 14 em `S/saidas/10-sonda-pg17.log`). As mutações abaixo rodaram com a versão de 14 casos.
- `npm test --workspace @dc360/campo`: código 0, 10 arquivos, 231 de 231 (`S/saidas/02-pacote-campo.txt`).
- `npx jest --silent` com 8 suítes da E06 em `apps/campo`: código 0, 92 de 92 (`S/saidas/05-app-campo-jest-e06.txt`).
- Prova de que morde (mutação no meu worktree, restaurada):
  - M4, `transporte.ts` volta a tratar 403 `parar_e_avisar` como `FalhaPermanente`: a sonda reprova (bloqueados 2, itens `bloqueado/1`, e depois da reativação nada sobe) (`S/saidas/20-mut-M4-transporte-403-permanente.log`); o pacote do motor reprova 6 de 231 (`S/saidas/21-repo-M4.txt`).
  - M5, `fila.ts` sem o ramo `FalhaDeSessao`: a sonda reprova 4 linhas (tentativa gasta, dreno não para, nada sobe depois porque a janela foi empurrada) (`S/saidas/20-mut-M5-fila-sem-ramo-de-sessao.log`); o pacote reprova 23 de 231 (`S/saidas/21-repo-M5.txt`).

## Cenários positivos

- Coleta com foto sobe uma vez depois de reativar a conta e entrar de novo.
- Itens pendentes sobem depois de a sessão cair e a pessoa entrar de novo, sem duplicar vistoria nem evidência.
- 401 `nao_autenticado` renova uma vez (visto no papel trocado).

## Cenários negativos

Conta desativada no meio da foto (pela rota, em Postgres real), sessão encerrada por quem administra entre itens, papel trocado com a coleta na fila, token de outro município no aparelho. Em nenhum o item foi apagado; nos dois de sessão e conta, nenhum foi bloqueado nem teve tentativa gasta; nada de outro município entrou e a resposta de recurso alheio foi 404.

## Tentativas de reprovar

1. Desativar exatamente entre `autorizar-envio` e o envio dos bytes (o ponto em que a linha de evidência já existe): os bytes sobem pela URL assinada (que não é sessão), a confirmação leva 403 `conta_desativada`, a evidência fica autorizada e NÃO confirmada (nenhum `evidencia_anexada` em nome de quem foi desativado), o item fica pendente; depois da reativação a mesma evidência é confirmada e a vistoria sobe uma vez.
2. Encerrar as sessões no meio do dreno de três itens: o que já subiu não volta a `pendente` e não duplica.
3. Trocar o papel com a coleta na fila para ver se a renovação forçada vira laço: uma renovação e para.
4. Usar o token de outra pessoa de outro município com o autor do item na sessão: 409 `autor_divergente` na foto, nenhuma tabela muda.
5. Procurar regressão da correção 4: o catálogo ganhou `posto_insuficiente`, `posto_insuficiente_para_dado_pessoal`, `email_so_por_administrador` e `assinatura`, todos com ação `nenhuma`; o transporte decide pela ação, então os quatro são permanentes, e o caso novo da matriz de `pausa-por-senha-provisoria.test.ts` está verde. Nenhum deles sai das quatro rotas da fila, e nenhum é de sessão: nenhum item de sessão ou conta passa a ser bloqueado por eles. A migração 051 (gatilho na desativação) não mudou a resposta da desativação nem da vigência sob RLS.

## Achados

- **anotado** (decisão registrada, fora do critério): papel trocado com coleta na fila bloqueia o item (403 `sem_permissao`) e o cartão oferece as ações de item bloqueado; o dado não se perde e sobe uma vez depois de "Tentar de novo" com o papel de volta. Está em `apps/campo/PENDENCIAS.md` como decisão do Rafael.
- Nenhum achado que bloqueie.

## Não verificado

- Aparelho ou emulador (não há nesta máquina): a frase na tela, nos dois temas e em 390 de largura, e o roteiro "desativar no painel durante a coleta e ver a frase".
- `npm run test:campo` inteiro (TypeScript estrito mais jest completo): rodei só as oito suítes da etapa.
- O 403 `troca_de_senha_obrigatoria` contra a API real em Postgres 17 (coberto pelo caso de `campo-integracao.test.ts` em PGlite, verde), e corridas de dois drenos simultâneos (cobertas pelos testes do pacote, verdes).
- O run do CI do SHA (ausente).

## Risco residual

O que só o aparelho prova (renderização da faixa e do aviso, laço de fundo de 60 s com o sistema operacional suspendendo o app) continua sem prova E2. A pausa vive só na memória: depois de fechar e abrir o app, ela é redescoberta com uma requisição (coberto pelos testes, não medido no aparelho).

## Motivo do humano

A "Validação humana" pede que o Rafael veja a frase e o item preservado no aparelho e aprove as frases (texto de produto); não há emulador aqui. Item do "Motivo do veredito" da rodada 4 (PASS em todas as dimensões, faltando aparelho e texto): a correção 4 não tocou o código do motor nem do aplicativo (em `apps/campo` mudou só um teste da E15, o do diálogo da conta com vistoria começada; em `packages/campo`, quatro linhas novas na matriz do teste para os códigos novos do catálogo; o resto é documentação); a prova desta rodada (motor real contra API real em Postgres 17.6, mutações M4 e M5 mordendo) mostra que nada regrediu. As pendências de aparelho e de texto seguem iguais.
