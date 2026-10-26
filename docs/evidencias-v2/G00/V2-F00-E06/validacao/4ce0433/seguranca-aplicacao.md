---
validador: seguranca-aplicacao
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
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

Pasta das saídas: `<S>` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L11-seguranca/saidas`.

1. Classificação por código do catálogo (`packages/campo/src/transporte.ts:82-124`): 401 de qualquer código pausa `sessao_encerrada`; 403 de ação `parar_e_avisar` pausa `conta_desativada`; `trocar_a_senha` pausa `troca_de_senha_obrigatoria`; `aguardar_o_contrato` é temporária; ação `nenhuma` (`sem_permissao` e os quatro códigos que a correção 4 pôs no catálogo: `posto_insuficiente`, `posto_insuficiente_para_dado_pessoal`, `email_so_por_administrador`, `assinatura`) continua permanente. Prova: `pausa-por-senha-provisoria.test.ts` (43 casos, os 4 novos da correção 4 incluídos) e `pausa-de-sessao.test.ts` verdes no pacote (`<S>/02-pacote-campo.txt`, 10 arquivos, 231 de 231).
2. Nenhum item bloqueado ou descartado por 401 ou 403 de sessão ou conta (DoD): casos de fila da matriz ("o item termina no estado certo na fila") e "três coletas: zero bloqueadas, tentativas inalteradas, o dreno para na primeira chamada", verdes, e mordem (M5, M6).
3. Autorização do envio de foto: `POST /evidencias/autorizar-envio` recusa `coletadaPor` de outra pessoa com 409 `autor_divergente` antes de ler o banco (`rotas/evidencias.ts:246`), e `confirmar-envio` só aceita quem autorizou (`evidencias.ts:560`). Prova: `evidencia-so-do-autor.test.ts` e `campo-integracao.test.ts` verdes (`<S>/01-api-arquivos-da-etapa.txt`), e mordem (M9, M9b).
4. Desativar o agente entre enfileirar e drenar devolve 403 `conta_desativada` e o item fica no aparelho (teste de autorização e isolamento da etapa): `campo-integracao.test.ts`, motor real contra a API real, verde.
5. Rotas da fila com conta desativada ou município suspenso não escrevem: na minha varredura negativa (ver relatório da E04, mesma sonda) as 4 rotas da fila (`/sincronizacao/vistoria`, `/sincronizacao/devolucao`, `/evidencias/autorizar-envio`, `/evidencias/confirmar-envio`) respondem 403 `conta_desativada`, 401 de sessão ou 503 `acesso_suspenso`, e o banco não muda.
6. Regressão obrigatória: `npm run test --workspace @dc360/campo` 231 de 231; `npm run test:campo` tipos limpos e 1932 de 1932 no jest do aplicativo (`<S>/05-test-campo.txt`); `npm run test:api` 1451 aprovados e 34 pulados (`<S>/04-test-api-completo.txt`).

## Evidência

- `npm run test --workspace @dc360/campo`: código 0, 231 de 231 (`<S>/02-pacote-campo.txt`).
- `npm run test:campo`: código 0, "A leitura do código e o jest concordam: 1932 casos" (`<S>/05-test-campo.txt`).
- API, 16 arquivos ligados (inclui `campo-integracao`, `evidencia-so-do-autor`, `foto-do-agente`, `codigos-de-erro`, `prova-dinamica-dos-codigos-de-erro`): 341 de 341 (`<S>/01-api-arquivos-da-etapa.txt`).
- Mutações num worktree esparso meu em `4ce0433`, com o `@dc360/shared` apontado para o `src` do worktree por uma configuração do vitest só do worktree, para a mutação do catálogo valer no motor (`<S>/20-mutacoes.txt`, roteiro `<S>/mutar.py`). Worktree removido ao fim.

## Cenários positivos

- 401 `nao_autenticado` renova uma vez e envia; depois de entrar de novo, os pausados sobem sem duplicar (mesma chave de idempotência): casos de `pausa-de-sessao.test.ts` e `campo-integracao.test.ts` verdes.
- Senha redefinida, entrada com a provisória, pausa, troca no painel e subida UMA vez: `campo-integracao.test.ts` verde.

## Cenários negativos

- 401 `sessao_encerrada`, 403 `conta_desativada` e 403 `troca_de_senha_obrigatoria`: itens `pendente`, zero `bloqueado`, tentativas inalteradas, dreno parado.
- 403 `sem_permissao` e as recusas de posto e de assinatura continuam permanentes (não viram pausa que esconderia recusa real).
- Foto com o token de outra conta: 409 `autor_divergente`, nada na trilha, nada marcado.
- Agente A no aparelho depois da desativação do B: os itens do B não sobem com a sessão do A (casos de autoria do pacote, verdes).

## Tentativas de reprovar

- M5, `troca_de_senha_obrigatoria` volta a ser permanente (o defeito da rodada 1): 4 casos reprovam em `pausa-por-senha-provisoria.test.ts`. Morde.
- M6, `conta_desativada` volta a ser permanente: 6 casos reprovam em `pausa-por-senha-provisoria` e `pausa-de-sessao`. Morde.
- M7, no catálogo, `posto_insuficiente` passa a `parar_e_avisar` (pausaria a fila por recusa de papel): as 2 linhas novas da matriz reprovam. Morde: a mudança da correção 4 no teste prende o comportamento dos códigos novos.
- M8, no catálogo, `assinatura` passa a `aguardar_o_contrato` (o item ficaria pendente para sempre, sem recusa visível): as 2 linhas novas reprovam. Morde.
- M9, `confirmar-envio` sem conferir o autor: 3 casos reprovam. M9b, `autorizar-envio` aceitando `coletadaPor` alheio: 3 casos reprovam, inclusive o do motor real contra a API real. Mordem.
- Procurei regressão da correção 4 no caminho do aparelho: `codigos-de-erro.ts` ganhou quatro códigos de ação `nenhuma` e `CODIGOS_DA_ENTRADA` (fora do catálogo de acesso); o transporte só pausa por `parar_e_avisar` e `trocar_a_senha` e só deixa de renovar por `entrar_de_novo`, então nada muda para a fila; o painel (`apps/web/src/dados/http.ts:229-240`) devolve nulo para ação `nenhuma`, sem derrubar sessão. Nenhum dos quatro códigos é emitido pelas rotas da fila.

## Achados

- anotado: a recusa da foto por autor divergente não grava evento na trilha (só aviso no log), limitação declarada pela etapa.
- anotado: rebaixar o papel do agente com coleta na fila bloqueia o item (403 `sem_permissao`, permanente por decisão registrada em `apps/campo/PENDENCIAS.md`).

## Não verificado

- Nada em aparelho nem emulador (não há emulador nesta máquina): o cenário de ponta a ponta "desativar o agente no painel durante uma coleta na fila, ver a frase, nada descartado, subir depois da reativação" não foi executado por mim; foi provado em duas metades (motor real contra a API real por `campo-integracao.test.ts`, e a tela por teste de componente no jest).
- O armazenamento local do aparelho (SQLite real do Expo) e a persistência da fila entre reinícios do aplicativo não foram exercitados fora do jest.
- A API rodou sobre PGlite; o bloco de PostgreSQL de prova ficou pulado.
- CI do SHA ausente (não é evidência mínima desta dimensão).

## Risco residual

A pausa vive na memória do aplicativo; uma corrida de milissegundos entre a conferência do autor no aparelho e o pedido pode levar um item a `bloqueado` por 409 (recuperável por "Tentar de novo"), como a etapa declara. O comportamento no aparelho real depende de prova humana.

## Motivo do humano

Só o aparelho (ou emulador) prova que, com a conta desativada no painel, a coleta continua no telefone, a frase aparece e nada é oferecido para descartar; isso é o E2E da etapa e não há emulador nesta máquina. Sobre o "Motivo do veredito" da rodada 4: era PASS, com o que só o aparelho prova deixado para pessoa; a correção 4 só acrescentou 4 linhas à matriz de `pausa-por-senha-provisoria.test.ts` (que mordem, M7 e M8) e não mexeu no motor nem nas rotas da fila, e a pendência de aparelho continua igual.
