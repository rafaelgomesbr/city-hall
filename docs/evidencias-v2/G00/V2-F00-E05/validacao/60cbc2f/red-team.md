---
validador: red-team (general-purpose)
modelo: claude-opus-5-5
etapa: V2-F00-E05
sha_validado: 60cbc2f
ci_run: 39524190207
rodada: 8
herdado_de:
tags: [UI, A11Y, AUTH, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

- Todo 401 e 403 que um cliente externo provoca na API sai com código do contrato (`CONTRATO_DE_ACESSO_DA_API`) e com o status dele, em TODA a superfície de rotas, e não só nas rotas que os validadores anteriores escolheram.
- Um cliente externo não aciona a guarda (zero desvio no modo `falhar`, zero linha de log de desvio no modo `corrigir`) e não derruba o processo.
- Isolamento: para quem é do município A (ou não tem conta válida), recurso do município B responde igual a recurso inexistente (mesmo status e mesmo código), em toda rota com parâmetro; nenhum 403 confirma existência em B.
- `nao_autenticado`, `sessao_encerrada` e `conta_desativada` saem nas situações certas para as identidades de cliente externo testadas.
- `git diff --stat 60cbc2f..HEAD`: só `qa.md`, `ESTADO-ATUAL.md` e `STATUS.md` (registro). O código validado é o de 60cbc2f.

## Evidência

Tudo numa cópia de 60cbc2f (`git archive`) e numa de fd17ff4, em `SCRATCH/red-E05/` (SCRATCH = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/d1c50ef6-d495-4393-82c6-d7e2ba48b9a4/scratchpad/r8`). API real (`construirServidor` com PGlite), socket TCP cru, sem tratador de `uncaughtException`.

- Sonda de superfície: `SCRATCH/red-E05/sondas/zz-red-superficie.ts`. Lê as rotas pela árvore do próprio Fastify (`printRoutes`): 170 pares método e caminho. Para cada um, oito identidades (sem token, `Bearer x.y.z`, JWT assinado com outro segredo, JWT vencido, JWT válido com `sid` inexistente, sessão encerrada por `/auth/sair`, conta desativada pelo painel, coordenador ativo de A) e, em rota com parâmetro, três valores (ocorrência de B, UUID inexistente, ocorrência de A). Mais as rotas `usuarios/:id` com o id de um usuário de B contra um inexistente. 2040 pedidos por execução.
- Saídas: `saidas/01-superficie-node24-falhar.txt`, `01-superficie-node24-corrigir.txt`, `02-superficie-node22-falhar.txt`, `02-superficie-node22-corrigir.txt` (Node 22.23.3, o do `.nvmrc` e do CI). As quatro: `falhas=0`, saída 0, "desvios na guarda: 0; linhas de log de desvio: 0; 500 erro nao tratado: 0", processo de pé.
- Códigos vistos (iguais nas quatro): `401 nao_autenticado` 632, `401 sessao_encerrada` 202, `403 conta_desativada` 101, `403 sem_permissao` 48, `403 assinatura` 16, HEAD 401 sem corpo 336, HEAD 403 sem corpo 63. Nenhum fora do contrato.
- Mordida 1 (mutação): `saidas/03-mutante-sem-permissao-node24-falhar.txt`.
- Mordida 2 (contra fd17ff4): `saidas/04-morde-*.txt` e `saidas/05-bruto-*-hints-node22.txt`, sonda `sondas/zz-red-morde.ts`.
- Ajuste só na cópia de 60cbc2f, para a varredura não virar 429: `max: 300` do limitador geral trocado por `max: 1000000` em `apps/api/src/servidor.ts` da cópia. A mutação da mordida 1 foi desfeita na cópia logo depois (conferido: 0 ocorrências de `sem_permissao_mutante`). Nenhum arquivo do repositório foi tocado além deste relatório.

## Cenários positivos

- Coordenador ativo de A: as rotas que ele pode usar respondem normalmente; nenhum 401 ou 403 indevido apareceu na varredura (o único 403 dele é `sem_permissao` em rota do agente, como manda o papel).
- `/saude` pipelinada depois da rota defeituosa de prova responde 200 em 60cbc2f (`05-bruto-copia-hints-node22.txt`).

## Cenários negativos

- Sem token, lixo, JWT de outro segredo, JWT vencido: 401 `nao_autenticado` em toda rota protegida.
- `sid` inexistente e sessão encerrada por `/auth/sair`: 401 `sessao_encerrada`.
- Conta desativada: 403 `conta_desativada`, com a mesma resposta para ocorrência de A, de B e inexistente.
- Ocorrência de B e usuário de B, para todas as oito identidades: mesmo status e mesmo código do inexistente em todas as rotas com parâmetro (nenhuma linha "difere de inexistente" nas quatro saídas).

## Tentativas de reprovar

1. **Achar um 401 ou 403 fora do catálogo que o CLIENTE provoque, em qualquer rota.** Os validadores anteriores sondaram um punhado de rotas com muitas formas de pedido; eu fui na largura: as 170 rotas que o Fastify registra, com oito identidades e três valores de parâmetro, nos dois modos e nas duas versões do Node. Nenhum código fora do contrato, nenhum desvio, nenhum 500 não tratado. Não reprovou.
2. **Oráculo de existência entre municípios (403 contra 404).** Comparei, rota a rota, ocorrência de B com UUID inexistente, e usuário de B com inexistente, para quem é de A, para conta desativada e para quem não tem credencial válida, inclusive em HEAD. Nenhuma diferença de status ou código. Não reprovou.
3. **Contornar `sessao_encerrada` ou `conta_desativada`.** Token de sessão encerrada por `/auth/sair` e token com `sid` que não existe dão `sessao_encerrada` em toda rota protegida; token da conta desativada dá `conta_desativada` em toda rota que exige vigência, sem nenhum 200 de escrita. JWT de outro segredo com `org` de B e papel administrador: 401 `nao_autenticado`. Não reprovou.
4. **A sonda morde (mutação).** Na cópia, troquei o código emitido por `SemPermissao` para `sem_permissao_mutante`. A mesma sonda, no modo `falhar`, terminou com saída 1 e acusou os desvios da guarda (`GET /saida-a-campo 403 sem_permissao_mutante, código fora do catálogo`, e outros). Ela pega um 403 fora do catálogo quando ele existe.
5. **A sonda morde contra fd17ff4 (a guarda reprovada na rodada 7).** Rota de prova com `writeEarlyHints` cujo valor leva CR LF e uma cabeça 403 inteira, seguida de `GET /saude` no mesmo socket, em Node 22.23.3:
   - fd17ff4 (`05-bruto-copia-fd-hints-node22.txt`): a rota, que responderia 200, chega ao cliente como `HTTP/1.1 403 Forbidden` com `sem_permissao` e `connection: close`, e a resposta do `/saude` pipelinado nunca chega. É o defeito da correção 7b: os bytes injetados nas Early Hints viram cabeça final no fio e a resposta inteira é trocada.
   - 60cbc2f (`05-bruto-copia-hints-node22.txt`): 500 `erro_interno` (a guarda recusa CR ou LF nas Early Hints em Node 22) e depois 200 do `/saude`, conexão em ordem.
   - A variante com `reply.trailer` num 403 inventado não reproduziu a queda de processo de fd17ff4 nesta sonda (as duas cópias ficaram de pé, sem resposta lida): registro como tentativa sem efeito, e a mordida fica pelas duas provas acima.

## Achados

Nenhum achado que bloqueie. Nenhum achado novo além dos já registrados como dívida nesta rodada (DV-01 e o custo quadrático de `chavesErro`), que não refiz por estarem fora do modelo de ameaça da E05 (D-31, item 2) e por eu não ter achado caminho de cliente externo até eles: na varredura, todo corpo 401 e 403 tem `mensagem` fixa, nenhum ecoa texto do pedido.

## Não verificado

- Console (`apps/console`) pela varredura de superfície: só a API foi varrida rota a rota. O console ficou com a cobertura do QA e da Segurança desta rodada.
- `/auth/entrar` e `/auth/recuperar` ficaram fora da varredura (gastam scrypt e já foram cobertos pela Segurança, inclusive tempo).
- Corpo dos pedidos: só `{}` nas escritas. Rota que só chega ao 401 ou 403 depois de validar um corpo completo não foi exercitada nesse ramo.
- Município suspenso (`acesso_suspenso`), senha provisória (`troca_de_senha_obrigatoria`) e segundo fator ligado não entraram nas identidades.
- Proxy de borda da Fly diante dessas formas: só socket cru local.
- Queda de processo por `reply.trailer` em fd17ff4 não se reproduziu na minha sonda (ver tentativa 5).
- Postgres real: tudo em PGlite.

## Risco residual

A guarda continua sendo defesa contra erro de programação, e a DV-01 (código hostil dentro da rota) e o custo quadrático de `chavesErro` seguem como dívida. Uma rota futura que ecoe texto do cliente num 401 ou 403 tornaria o segundo alcançável; a varredura de superfície desta rodada pode ser repetida para conferir isso. A comparação B contra inexistente usou status e código, não o corpo inteiro byte a byte.

## Motivo do humano

Não se aplica: nada nesta dimensão depende de juízo humano. A validação humana das três frases da etapa é de outra dimensão.
