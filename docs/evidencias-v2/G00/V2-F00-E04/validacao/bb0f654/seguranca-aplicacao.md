---
validador: seguranca-aplicacao (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E04
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [AUTH, AUTHZ, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---

## Critérios verificados

1. Conta desativada (pelo endpoint `PATCH /usuarios/:id/situacao` e por UPDATE sem revogar), papel rebaixado, sessão encerrada por quem administra, cadeia encerrada depois da renovação (token anterior à rotação), `sid` de outra pessoa, senha provisória vencida e município suspenso com conta desativada NÃO escrevem com o token vivo, em TODA rota de escrita e em todo GET com efeito, inclusive o HEAD deles. Resultado: confirmado para as 67 rotas de escrita ou com efeito, em 9 estados (603 pedidos), nenhuma tabela alterada.
2. Senha provisória vem do banco na escrita: prazo no banco sem marca no token tranca (403 `troca_de_senha_obrigatoria`), e as duas rotas abertas (`/auth/trocar-senha`, `/auth/encerrar-sessoes`) continuam abertas. Confirmado.
3. A sessão rotacionada continua valendo só enquanto a cadeia vive (rotação não é expulsão; cadeia encerrada nega). Confirmado, inclusive por mutação.
4. A própria pessoa que encerra "as outras sessões" mantém a sua. Confirmado pela varredura (estado vigente: `POST /auth/encerrar-sessoes` 200) e pelos testes `sessoes-da-conta`, `get-com-efeito` (caso 6), verdes na árvore.
5. Isolamento: B contra recurso de A continua 404; `npm run test:isolamento` verde. Confirmado.
6. Nenhum GET sem marca escreve dado do município (enumeração pelo código, não pela lista do implementador). Confirmado: com token vigente, só `GET /avisos` e `GET /relatorios/ocorrencias.csv` (marcados) e o registro de leitura de `GET /ocorrencias/:id` e `GET /busca` (decisão registrada) mudaram o banco.
7. Zero `skip` na vigência: `vigencia-na-escrita.test.ts` 13 de 13 executados, nenhum pulado.
8. Regressão da correção 3 da E07 (`auth/servico.ts`, `auth/tokens.ts`, `rotas/segundo-fator.ts`, `servidor.ts`): nada nela reabre escrita sem vigência; login agora abre a sessão sob o tenant e a trava, e as corridas passam em PostgreSQL 17.

## Evidência

Todas as saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/seguranca-aplicacao-E04-E05-E06-E08/` (abaixo, `<S>`). Sondas minhas em `<S>/sonda/`, rodadas com o vitest do repositório (`cd dc360/apps/api && npx vitest run --root <S>/sonda --config <S>/sonda/vitest.config.ts <arquivo>`), importando o código de `dc360/apps/api/src` por caminho absoluto, contra o servidor montado com `construirServidor` e PGlite semeado.

- Enumeração das rotas pelo próprio Fastify (`rotasRegistradas`, a mesma leitura de `superficie.test.ts`): `<S>/sonda/rotas.test.ts`, código 0, 114 rotas (`<S>/rotas.txt`), 13 em `SEM_TOKEN`, 101 com token, mais o HEAD de cada GET: 153 pedidos por estado.
- Varredura de vigência: `<S>/sonda/varredura.test.ts`. Para cada estado e cada pedido: novo login, estado do banco virado, impressão md5 de TODAS as 36 tabelas de `public` antes e depois, status e `erro`. Saídas `<S>/varredura-saida.txt` (primeira passada, 5 estados completos; abortou no 6º porque a própria varredura redefiniu a senha do Jonas no estado de controle, defeito da sonda, corrigido), `<S>/varredura-2-saida.txt` (código 0, os 4 estados restantes), resultado consolidado `<S>/varredura-completa.json`, análise `<S>/varredura-analise.txt` (`python3 <S>/analisar.py`): 603 pedidos de escrita ou com efeito conferidos, 0 violações.
- Pares 401/403/503 observados na varredura inteira (todos do catálogo): 401 `nao_autenticado` 59, 401 `sessao_encerrada` 236, 403 `conta_desativada` 118, 403 `acesso_suspenso` 55, 403 `troca_de_senha_obrigatoria` 57, 403 `sem_permissao` 61, 503 `acesso_suspenso` 4 (as quatro rotas da fila).
- Testes do repositório na árvore (`cd dc360/apps/api && npx vitest run` com 18 arquivos: vigencia-na-escrita, get-com-efeito, codigos-de-erro, leitura-do-agente-oficios-e-avisos, acesso-suspenso, campo-integracao, superficie, familia-da-sessao, sessoes-da-conta, evidencia-so-do-autor, renovacao-contra-encerramento, segundo-fator, senha-provisoria, sino-de-avisos, orgaos-e-oficio, agente-so-ve-a-equipe, api, corpo-ilegivel): código 0, 311 aprovados e 20 pulados (`<S>/api-relevantes-arvore.txt`). Os 20 pulados são o bloco de PostgreSQL de `renovacao-contra-encerramento`, rodado à parte abaixo.
- `renovacao-contra-encerramento.test.ts` contra PostgreSQL 17.6 (binários do scratchpad, cluster próprio na porta 55437, apagado no fim), com `DC360_POSTGRES_DE_PROVA` apontando para ele: código 0, 30 de 30 (`<S>/renovacao-pg17.txt`).
- `npm run test:isolamento`: código 0, 14 arquivos, 345 aprovados e 3 pulados (`<S>/isolamento.txt`).
- Prova de que o teste morde: mutações aplicadas numa CÓPIA de `dc360/apps/api` em `<S>/api-mut` (a árvore do repositório nunca foi tocada; `diff -r` da cópia contra o original vazio depois de cada uma), rodando os testes do implementador na cópia e minha sonda `<S>/sonda/mordida.test.ts`. Saída `<S>/mutacoes-api.txt`:
  - M1, `servidor.ts` sem `|| req.routeOptions.config.comEfeito === true`: `get-com-efeito` 5 reprovam, `acesso-suspenso` 1; minha sonda: GET e HEAD de `/avisos` e do CSV respondem 200 nos três estados.
  - M2, `servidor.ts` sem `exigirVigencia(...)`: 18 reprovam (vigencia-na-escrita 6, get-com-efeito 6, codigos-de-erro 6); minha sonda: POST e PATCH caem em 422 e o DELETE da foto responde 204 (escreveu).
  - M3b, `auth/vigencia.ts` com `AND v.revogada_em IS NULL` trocado por `AND true` (rotacionada vale mesmo com a cadeia encerrada): `familia-da-sessao` 7 reprovam, `get-com-efeito` 1. (Uma primeira versão, M3, quebrou a sintaxe do SQL e foi descartada como prova; está registrada na saída.)
  - Controle da cópia sem mutação: 7 arquivos, 105 de 105 (`<S>/api-mut-controle.txt`).

## Cenários positivos

- Estado vigente (coordenadora Helena): escritas com corpo vazio chegam à validação (422 `dados_invalidos`) ou à permissão (403 `sem_permissao`), o que prova que passaram pela vigência; `POST /auth/encerrar-sessoes` 200 e a sessão de quem pediu segue.
- `get-com-efeito` (controle): quem está vigente emite termo, interdita e grava o CSV.
- `renovacao-contra-encerramento` em PostgreSQL 17: renovação e encerramento concorrentes nunca deixam sessão viva depois do encerramento; login concorrente com troca de senha não abre sessão com a senha antiga.
- Senha provisória com prazo no banco: `/auth/trocar-senha` responde 422 (validação, não 403) e `/auth/encerrar-sessoes` 200.

## Cenários negativos

Para cada estado, a resposta de TODA rota de escrita (POST, PATCH, PUT, DELETE fora de `SEM_TOKEN`) e de todo GET e HEAD com efeito, e nenhuma das 36 tabelas mudou:

| Estado | Resposta esperada e obtida |
| --- | --- |
| desativada pelo endpoint (sessões revogadas) | 403 `conta_desativada` |
| desativada sem revogar | 403 `conta_desativada` |
| papel rebaixado | 401 `nao_autenticado` |
| sessão encerrada por quem administra | 401 `sessao_encerrada` |
| cadeia encerrada, token anterior à rotação | 401 `sessao_encerrada` |
| token assinado com o `sid` de outra pessoa | 401 `sessao_encerrada` |
| senha provisória vencida | 401 `sessao_encerrada` |
| senha provisória no banco, sem marca no token | 403 `troca_de_senha_obrigatoria` (menos as duas rotas abertas) |
| município suspenso e conta desativada | 403 `acesso_suspenso`, e 503 nas quatro rotas da fila |

## Tentativas de reprovar

1. Rota de escrita fora da lista do implementador: enumerei as 114 rotas pelo `printRoutes` e mandei TODAS em todos os estados. Nenhuma escreveu nem respondeu fora do esperado.
2. GET que escreve e não está marcado: medi o banco inteiro antes e depois de cada GET e HEAD com token vigente de coordenadora. Só escreveram as rotas marcadas e o registro de leitura já decidido (`ocorrencia_consultas` em `/ocorrencias/:id` e `/busca`).
3. HEAD automático do Fastify fugindo da marca: mandei HEAD de toda rota GET. O HEAD do CSV, de `/avisos` e dos documentos responde a mesma recusa do GET e não grava.
4. Ordem dos ramos: suspenso e desativada ao mesmo tempo responde a suspensão (403, e 503 na fila); desativada e revogada responde `conta_desativada` e não `sessao_encerrada`.
5. Token forjado com `sid` de outra pessoa e assinatura válida (segredo do teste): nega.
6. Senha provisória: os dois sentidos (marca sem prazo, prazo sem marca) e o prazo vencido.
7. Mutações M1, M2 e M3b: os testes do implementador e as minhas sondas reprovam; o conserto não é decorativo.
8. Regressão da correção 3 da E07: li o diff `52952a1..bb0f654` de `servico.ts`, `tokens.ts`, `segundo-fator.ts` e `servidor.ts`. A única mudança em `exigirAutenticacao` é nenhuma; o tratador novo de corpo ilegível (`FST_ERR_CTP_*`) responde 4xx antes do handler e não escreve; o desafio do segundo fator ganhou `cr` e as rotas por desafio conferem conta ativa e credencial. Corridas em PostgreSQL 17 verdes.
9. Escrita de conta desativada do município A na ocorrência do B: corpo idêntico ao da ocorrência de A e ao de id inexistente (sonda da E05, `<S>/codigos-log.txt`).

## Achados

- Nenhum achado que quebre critério da etapa.
- Anotado (já declarado pelo implementador, fora do escopo, F03-E03): leitura pura não confere a vigência. Na varredura, os 86 pedidos GET e HEAD sem marca responderam igual em todos os estados (66 com 200), inclusive com o município suspenso e a conta desativada; `GET /ocorrencias/:id` e `GET /busca` gravam o registro de leitura em nome da conta já desativada. Reprodução: `<S>/varredura-analise.txt`, linhas "leituras puras".

## Não verificado

- O CI do SHA (run 39143791434) não foi lido: `gh` sem login nesta sessão.
- O E2E de navegador "desativar no painel e o próximo POST falha" (`fluxo-api.e2e.mjs`): não rodei; o caminho da API foi provado por `inject` e servidor real, que é a parte desta dimensão.
- A varredura rodou em PGlite (PostgreSQL embutido), não em PostgreSQL 17 servidor; em PostgreSQL 17 rodei só o bloco de corridas de `renovacao-contra-encerramento`. RLS com papel não superusuário em servidor real ficou a cargo de `test:isolamento` (PostgreSQL 18 local).
- `npm run test:api` completo (1319 casos) não foi rodado por mim; rodei os 18 arquivos que tocam vigência, sessão, códigos, fila e leitura do agente.
- Parâmetros de rota da varredura usam ids do município A; o handler das rotas de documento não chegou a emitir (a ocorrência usada não estava vistoriada), mas a recusa vem antes do handler e `get-com-efeito` cobre a emissão real.

## Risco residual

- Até a F03-E03, conta desativada, papel rebaixado e sessão encerrada continuam LENDO por até 15 minutos (ou 60, no teto de configuração), inclusive ofício por coordenador rebaixado e o registro de leitura em nome de conta desativada.
- A vigência roda numa transação própria antes da escrita: uma desativação que confirma entre a leitura da vigência e o COMMIT da escrita não a impede (janela de milissegundos, equivalente a a escrita ter chegado um instante antes). Não é defeito desta etapa.

## Motivo do humano

Nenhum para esta dimensão: todos os critérios de segurança são verificáveis por execução e foram executados. A "validação humana" da etapa (Rafael ver a sonda antes e depois) é registro de aceite, não lacuna de prova.
