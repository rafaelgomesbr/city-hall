---
validador: qa
modelo: claude-opus-5-5
etapa: V2-F00-E06
sha_validado: 1ed0b71
ci_run: ausente
rodada: 6
herdado_de:
tags: [UI, MOBILE, OFFLINE, A11Y, AUTH, AUTHZ, TENANT, RLS, DB, MIGRATION, API, DOCUMENTO, ARQUIVO, INFRA]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Produto de `1ed0b71` (árvore principal em `5044e7a`, que só difere em `STATUS.md` e `ESTADO-ATUAL.md`). Mutações e sondas num worktree meu destacado em `1ed0b71`, com `@dc360/campo` e `@dc360/shared` apontando para o próprio worktree e o `dist` recompilado a cada mutação de pacote (e de novo depois de restaurar). Saídas em `SCRATCH/validadores/qa/`.

| Critério | Prova | Resultado |
| --- | --- | --- |
| DoD: nenhum item bloqueado ou descartado por 401 ou 403 de sessão ou conta | pacote do motor 238 de 238 (`saidas/05`); `campo-integracao` 17 de 17 dentro de `test:api` (`saidas/01`); sonda própria contra a API real com os atos pelas ROTAS do painel (`saidas/35`) | PASS |
| Negativo: 401 `sessao_encerrada` e 403 `conta_desativada` deixam todos `pendente`, zero `bloqueado`, tentativas inalteradas, dreno parado | sonda `zz-qa-fila-pausa`: três coletas, sessões encerradas por `POST /usuarios/:id/encerrar-sessoes`, três drenos: todas `pendente`, `tentativas` 0, zero `bloqueado`, nada no banco; conta desativada por `PATCH /usuarios/:id/situacao`: no máximo dois pedidos por dreno, nada bloqueado | PASS |
| Negativo: sem token vira `FalhaDeSessao`; 403 `sem_permissao` ainda bloqueia | `pausa-de-sessao`, `pausa-por-senha-provisoria` e `campo-integracao` ("papel sem permissão continua BLOQUEANDO") verdes; mutação M6 abaixo | PASS |
| Positivo: depois de entrar de novo, sobem sem duplicar (mesma chave) | sonda: depois da nova entrada, 3 enviados, 3 vistorias (uma por chave), o dreno seguinte envia 0; com três drenos simultâneos depois da nova entrada, ainda 3 vistorias e nada bloqueado | PASS |
| Conserto do FAIL da rodada 5 (tarja de "Enviar agora" mandava esperar sinal com a fila pausada) | `__tests__/enviar-agora-com-a-fila-pausada.test.tsx` 8 de 8 no `test:campo` (`saidas/07`); mutação M5 (ramo do acesso suspenso tirado) reprova 1 de 8 | PASS |
| Correção 3b, pausa velha ao entrar de novo | sonda: depois da nova entrada `pausadaPor` cai já na LEITURA (sem dreno); a falha de rede seguinte não a traz de volta; e uma pausa NOVA da credencial nova aparece (não é engolida pela geração). Mutações M1, M2, M3 mordem (abaixo) | PASS |
| Correção 3b, Perfil e acesso suspenso param de mandar esperar sinal | mutação M4 (Perfil ignora a pausa): 9 de 27 reprovam em `dialogo-na-conta`; M5 (acesso suspenso): 1 de 8 | PASS |
| Autorização: item de outro autor espera o autor | `pausa-por-senha-provisoria` (corridas) e `campo-integracao` verdes (`saidas/01`, `saidas/05`) | PASS |
| Regressão obrigatória | `npm run test --workspace @dc360/campo` 11 arquivos, 238 de 238 (`saidas/05`); `npm run test:campo` tipos limpos, 139 suítes, 1997 de 1997, "a leitura do código e o jest concordam: 1997 casos" (`saidas/07`); `npm run test:api` 1624 de 1624 (`saidas/01`); `campo-integracao` 17 de 17 | PASS |
| E2E no emulador e validação humana (frase no aparelho, coleta preservada) | não há emulador nem aparelho nesta máquina | pendência humana |

## Evidência

- `saidas/05-pacote-campo.txt`, `saidas/07-test-campo.txt`, `saidas/01-test-api.txt`: códigos 0.
- `saidas/35-sonda-fila-pausa.txt`: sonda própria (`sondas/zz-qa-fila-pausa.test.ts`), motor real pelo `dist`, `fetch` real, servidor real numa porta efêmera (PGlite), 4 de 4, código 0.
- `saidas/37-sonda-fila-pausa-com-mutacao-M1.txt`: a mesma sonda com a conferência de geração tirada do motor: 3 de 4 reprovam (o quarto caso não depende da pausa), código 1 de propósito.
- `mut/E06-M1` a `mut/E06-M6`: mutações (`mutar.py`).

## Cenários positivos

- Sessão encerrada, nova entrada, rede volta: as três coletas sobem uma vez cada; dreno seguinte não envia nada; `pausadaPor` nulo.
- Conta desativada, reativada pela rota, nova entrada: a pausa cai na leitura, as duas coletas sobem uma vez cada.

## Cenários negativos

- Enquanto a sessão está morta, três drenos seguidos: a pausa fica, nenhum item muda de estado, nada no banco.
- Conta desativada: a entrada responde 401 (recusa genérica) e a pausa continua; nenhum item bloqueado.
- Nova entrada seguida de sessão encerrada outra vez antes do primeiro envio: a pausa da credencial nova aparece (a geração não a engole).
- Falha de rede logo depois da nova entrada: a pausa velha não volta; os itens continuam no aparelho.

## Tentativas de reprovar

Mutações no worktree, cada uma restaurada e conferida (`git status` do arquivo limpo, `dist` recompilado e sem o trecho mutado):

- M1, a pausa velha nunca cai (`pausa.geracao !== geracaoDaSessao()` desligado): `pausa-velha` 5 de 7 reprovam; no aplicativo, `pausa-cai-ao-entrar-de-novo` 1 de 2; e a minha sonda contra a API real, 3 de 4.
- M2, a pausa guarda a geração da hora da RESPOSTA, e não a do pedido: `pausa-velha` 1 de 7 (o caso "recusa de pedido feito com a credencial velha não pausa a nova").
- M3, `entrar` não sobe a geração (`sessao.tsx`): 1 de 13 em `pausa-cai-ao-entrar-de-novo` e `entrar-de-outra-pessoa-limpa-o-aparelho`.
- M4, o Perfil ignora a pausa: 9 de 27 em `dialogo-na-conta`.
- M5, "Enviar agora" sem o ramo do acesso suspenso: 1 de 8.
- M6, `FalhaDeSessao` levada ao tratamento comum (bloqueio): 28 de 79 no pacote; contra a API real, `campo-integracao` 5 de 17.
- Na sonda, uma primeira versão com o relógio real só viu 2 de 3 envios em seis drenos depois da falha de rede: era o recuo (`liberadoEm`) da terceira coleta, que continuava `pendente` no aparelho; com o relógio injetado andando, as 3 sobem. Não é perda.
- Procurei, no texto do aplicativo, outras promessas de "houver sinal" que valessem com a fila pausada: as que restam estão atrás de `pausadaPor` (cartão, devolução, vistoria guardada, Perfil) ou não coexistem com a pausa ("A fila não abriu").

## Achados

- Anotado: na tela da fila, com a fila pausada E sem sinal, o botão apagado diz "Este botão volta assim que a conexão voltar." (`fila.tsx`, `porQueApagado`): é verdade sobre o botão, mas com a pausa a conexão sozinha não faz nada sair. O aviso do alto da lista já diz o que destrava; texto de produto para o Rafael decidir.
- Nenhum achado que bloqueia. O FAIL da rodada 5 (tarja de "Enviar agora") está consertado e preso por teste que morde.

## Não verificado

- E2E em emulador ou aparelho (desativar no painel com coleta na fila, ver a frase, reativar e ver subir): não há emulador Android nem aparelho nesta máquina. A metade de servidor e motor foi feita em E2 pela sonda contra a API real; a tela, só por teste de componente (E1).
- Capturas da tela e portão visual: dimensão de UX.
- A frase de cada pausa no aparelho, nos dois temas e a 390 px.
- "Descartar" para coleta de outro autor (anotado em rodadas anteriores): não reconferido.
- CI do SHA ausente (H32).

## Risco residual

O critério sem risco aceito (não perder nem duplicar coleta) está provado por testes que mordem e por sonda própria contra as rotas reais do painel, inclusive com drenos simultâneos e com a re-entrada. O que fica é o que só o aparelho mostra: a frase desenhada e o laço de fundo do aplicativo de verdade.

## Motivo do humano

Rafael precisa ver no aparelho (ou no emulador) a frase da conta desativada e da sessão encerrada com a coleta preservada, e aprovar as frases (validação humana e critério E4 explícitos na etapa). Não há emulador nem aparelho nesta máquina.
