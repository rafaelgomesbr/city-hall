---
validador: red-team (general-purpose)
modelo: claude-opus-5-5
etapa: V2-F00-E09
sha_validado: dda7557
ci_run: 40132234324
rodada: 9
herdado_de:
tags: [AUTH, TENANT, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

API da árvore principal (HEAD `d4683cc`, produto igual a `dda7557`) subida em processo na porta 6811 com o segredo JWT de teste e o banco em WebAssembly com a semente de dois municípios (`dc360/db/seeds/desenvolvimento.sql`: Serra Alta = A, Vale Fundo = B). Todos os ataques por HTTP real. Início 22:48:56, fim 22:56 (dentro dos 45 minutos).

| Critério (DoD e campos de teste da etapa) | Prova | Resultado |
| --- | --- | --- |
| Coordenador ou admin de A pede redefinir, encerrar e listar sessões de usuário de B: 404 | `01-sonda.txt` seção 1: Rita (admin A) contra Tarcísio (B) nas três rotas: 404 `nao_encontrado` | PASS |
| `GET /usuarios/:id/sessoes` de B com token de A: 404, nunca 403 | idem; e coordenador de B contra a administradora de A: 404 (o posto não é avaliado antes do RLS, então não vaza 403) | PASS |
| Agente chama as três rotas: 403 `sem_permissao` | seção 4: Diego nas três: 403 `sem_permissao` | PASS |
| `autoredefinicao` e `autoencerramento` (422) | seção 3: própria conta em minúsculas, MAIÚSCULAS, `%2D` e `%2d` maiúsculo: sempre 422 com o código certo | PASS |
| Posto igual ou acima: 403 `posto_insuficiente` | seção 4 (coordenadora contra administradora) e `06-sonda3-posto-igual.txt` (coordenadora contra coordenadora criada na hora): 403 nas três rotas | PASS |
| Redefinir a senha de operador e a temporária exigir a troca | seções 9 e A: temporária entra, o token abre só `/auth/trocar-senha` (403 `troca_de_senha_obrigatoria` em `/ocorrencias` e `/usuarios`, inclusive depois de renovar); depois da troca o token novo vem sem `sp` | PASS |
| `GET /auth/sessoes` marca a atual, sem IP e sem user-agent | seção 8: itens com `entrouEm, validaAte, aparelho, atual`, uma só `atual: true` | PASS |
| Encerrar "as outras" mantém a de onde se clicou e a sessão antiga cai | seção 8: atual segue 200; renovação da outra 401 `sessao_encerrada`; escrita com o token da outra 401 | PASS (ver achado 1 sobre a leitura) |
| `GET /usuarios/:id/sessoes` só quantidade e datas | seção 7: `{id, sessoesAbertas, ultimaEntradaEm, validaAte}` | PASS |
| Cada redefinição e encerramento na trilha append-only com o ator certo | `03-trilha-adm.txt` (lido da saída do município de A): 4 `senha_redefinida` e 3 `sessoes_encerradas`, autor e papel corretos (Helena coordenadora, Rita administradora, Jonas no próprio encerramento com `sessaoAtualPreservada: true`), `depois` sem senha nem hash | PASS |

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/d900a13c-1e42-4b88-9465-82d873257632/scratchpad/redteam-E09/`:

- `sonda.mjs` -> `01-sonda.txt` (código 0; 81 verificações, 16 marcadas FALHA pela sonda e analisadas abaixo: 8 eram falso positivo do meu filtro de eco, que casava `dados_invalidos` com /invalid/; 2 eram o nome errado do campo na troca de senha, refeito em `sonda2`; 2 da trilha porque `/trilha` lê a trilha operacional e não a administrativa, refeito pela saída; 3 são o achado 1; 1 é o achado 2).
- `sonda2.mjs` -> `02-sonda2.txt` (código 0; 13 verificações, as 2 FALHA são o achado 1).
- `pacote-A.zip` e `pacoteA/` (saída do município de A) -> `03-trilha-adm.txt`.
- `04-mordida-sem-posto.txt` e `05-mordida-restaurada.txt` (prova de que a sonda morde, abaixo).
- `06-sonda3-posto-igual.txt`.
- CI: run 40132234324 sobre `d4683cc`, 12 de 12 verdes (fonte: instruções da rodada; não reli o CI).

## Cenários positivos

- Coordenadora redefine a senha de operador (200, `Cache-Control: no-store`, `sessoesEncerradas: 2`); administradora encerra as sessões de agente (200, 2 encerradas); a pessoa encerra as próprias outras sessões (200, a atual continua).
- Redefinir conta desativada: 200 com o aviso "está desativada", e a temporária não entra (401 `credenciais`).

## Cenários negativos

- Entre municípios: B em minúsculas, B em MAIÚSCULAS, id inexistente, UUID nulo `00000000-0000-0000-0000-000000000000` e UUID máximo `ffffffff-...`: todos 404 com o MESMO corpo byte a byte (`{"erro":"nao_encontrado","mensagem":"Usuário não encontrado."}`). Não há como distinguir "existe noutro município" de "não existe".
- Ids fora do RFC (versão 0, sem hífens, com chaves, com `%00`, com aspas e `OR 1=1`, com `<script>`): 422 `dados_invalidos` com `campos: [{campo: "id", mensagem: "Não é um identificador válido (UUID)"}]`, sem ecoar a entrada, sem pilha, sem chave do Zod em inglês. O Zod 4 não deixou nenhuma forma passar para o banco.
- Organização fora do token: `organizacaoId` e `organizacao_id` no corpo, `?organizacaoId=` na rota, `X-Organizacao-Id` no cabeçalho, `papel` e `posto` no corpo: ignorados (404 para alvo de B). `X-Papel: administrador` não muda o posto (403). Na criação de usuário, `organizacaoId` de B no corpo foi ignorado (a conta nasceu em A). Na troca de senha, `papel: "administrador"` e `organizacaoId` de B no corpo foram ignorados (token novo `operador`, org A).
- Token forjado: payload com org trocada e assinatura velha: 401; `alg: none`: 401; sem token: 401.
- Senha temporária: não aparece em `api.log`, no arquivo do notificador, na saída do município (tabelas e trilha) nem em `GET /usuarios/:id/sessoes`; uma segunda redefinição invalida a primeira; depois da troca ela não entra nem serve como "senha atual"; a senha sugerida no corpo (`senha`, `senhaTemporaria`) é ignorada e a API sorteia a sua. No painel ela fica só no estado do componente (`Usuarios.tsx:689,709`), nunca em `sessionStorage` ou `localStorage`.
- Sessão encerrada tentando encerrar a sessão viva (o ladrão revidando): 401 `sessao_encerrada`, e a sessão do dono continua.

## Tentativas de reprovar

1. IDOR por UUID nulo e máximo (o Zod 4 aceita os dois): passam na validação e caem no 404 genérico do RLS, sem 500 e sem 403.
2. Oráculo de existência entre municípios por corpo e por posto: o coordenador de B contra a administradora de A recebe 404 e não 403 `posto_insuficiente`, porque a leitura do alvo roda sob RLS antes de `exigirPostoParaGerir`.
3. Escapar da trava de autoredefinição por caixa e por `%2D`: o `toLowerCase()` do `idSchema` e o decodificador do Fastify fecham; 422 em todas as quatro formas.
4. Injeção e eco pelo `:id` (SQL, HTML, byte nulo, comprimento): 422 limpo; com mais de 100 caracteres, ver achado 2.
5. Usar a temporária para entrar sem trocar, renovar para perder a marca `sp`, reusar depois da troca: todos recusados.
6. Promover-se por chave extra no corpo (troca de senha, criação de usuário, encerramento): ignoradas.
7. Ler a contagem e o aparelho de outra pessoa sem posto: 403; com posto, só quantidade e datas.
8. **Prova de que a sonda morde:** tirei `exigirPostoParaGerir(quem.papel, alvo.papel)` de `GET /usuarios/:id/sessoes` em `dc360/apps/api/src/rotas/administracao.ts`, subi a API de novo e a coordenadora leu a contagem da administradora (200, `04-mordida-sem-posto.txt`); `git restore dc360/apps/api/src/rotas/administracao.ts`, API de novo, volta 403 `posto_insuficiente` (`05-mordida-restaurada.txt`). `git status` limpo depois (só as pastas `validacao/dda7557/` não rastreadas que já existiam).
9. Usar o token de acesso de sessão encerrada ou de senha redefinida: a escrita cai (401), a leitura não (achado 1).

## Achados

1. **corrige antes de crescer.** Depois de "Encerrar sessões" (Usuários), de "Encerrar minhas outras sessões" e de "Redefinir senha", o token de acesso da sessão encerrada continua LENDO até vencer (`ACESSO_MINUTOS`, 15 por padrão). Reprodução: Jonas entra; Rita chama `POST /usuarios/<jonas>/encerrar-sessoes`; com o token antigo, `GET /ocorrencias` 200, `GET /auth/eu` 200, `GET /auth/sessoes` 200, enquanto `POST /auth/encerrar-sessoes` 401 `sessao_encerrada` e `/auth/renovar` 401 (`01-sonda.txt` seções 7 e 8, `02-sonda2.txt` seção B; o mesmo depois de redefinir a senha). O texto da janela que a E09 entrega diz "{nome} sai de todos os navegadores e aparelhos agora" (`dc360/apps/web/src/paginas/Usuarios.tsx:650`), o que a API não cumpre para a leitura (dossiê com nome, contato e vulnerabilidade, no cenário do celular perdido que a própria etapa cita). **Condição D-31 item 1:** o assunto está na lista da seção 7 item 2 (vigência, sessão revogada), mas o comportamento é anterior à etapa e fora do escopo dela: está declarado em `auth/sessoes.ts` e `auth/suspensao.ts` desde a F00-E04 e tem etapa própria planejada, `V2-F03-E03` ("Vigência em TODA requisição autenticada... leituras inclusive", P0, `docs/roadmap-v2/05-api-identidade-autorizacao.md`). A DoD da E09 ("a sessão antiga cai") é cumprida pela renovação e pela escrita. Por isso não bloqueio a E09; o gatekeeper deve registrar como dívida com destino na V2-F03-E03 e não como RISCO ACEITO (o item 2 da seção 7 não admite). O que é da E09 é a frase "agora": ou ela passa a dizer que a leitura dura até 15 minutos, ou fica valendo só depois da F03-E03.
2. **anotado (dívida da E05 e do catálogo de códigos, V2-F02-E03).** Rota com parâmetro acima de 100 caracteres responde 414 `{"error":"Bad Request","code":"FST_ERR_MAX_PARAM_LENGTH","message":"'/usuarios/<img src=x onerror=alert(1)>111.../redefinir-senha' is exceeding the max param length"}`, e percentual malformado (`/usuarios/%E0%A4%A/sessoes`) responde 400 `FST_ERR_BAD_URL` no mesmo formato. As duas respostas saem por `res.writeHead` do próprio Fastify (`node_modules/fastify/fastify.js`, `onMaxParamLength` e `onBadUrl`, porque `servidor.ts` não define `frameworkErrors`): fora da guarda de códigos de erro, sem `helmet` (sem `X-Content-Type-Options: nosniff`, sem CSP), sem `Cache-Control: no-store`, em inglês e ecoando o caminho decodificado. Alcançável sem autenticação, mas sem impacto prático: `Content-Type: application/json` não renderiza HTML em navegador atual e não há dado nenhum na resposta. **Condição D-31 item 1:** não é (a) da E09, não é (c), e é anterior: o mesmo código existe no `fastify` 5.12.5 de `fd17ff4` (conferido no pacote publicado). Conserto provável: `frameworkErrors` no `Fastify()` devolvendo `dados_invalidos` pelo caminho normal de erro.

## Não verificado

- O CI (confiei no run 40132234324 informado pelo gatekeeper; não reli os jobs).
- PostgreSQL real: usei o banco em WebAssembly com a mesma migração e RLS; o job "API contra Postgres real" do CI cobre esse caminho.
- Corrida entre duas redefinições simultâneas e entre encerramento e renovação (a trava da migração 049 é da E07; não reexecutei).
- Diferença de tempo entre 404 de B e 404 de inexistente (corpo e código idênticos; o tempo não medi).
- O painel no navegador (cache do navegador, área de transferência, histórico): li o código; QA, UX e Acessibilidade desta rodada cobrem as telas.
- A trilha de B vista por um administrador de B (a semente não tem administrador em B; o RLS da `trilha_administrativa` é FORCE e o `test:isolamento` do gatekeeper passou).

## Risco residual

Baixo para a E09. Isolamento entre municípios, posto, permissão, autoações e a senha temporária resistiram a todas as sondas, e o Zod 4 não abriu forma nova de id. O risco que sobra é o achado 1, que é do desenho da vigência (leitura por 15 minutos) e tem etapa P0 marcada, e a frase "agora" da janela que promete mais do que a API faz hoje.

## Motivo do humano

Não se aplica a esta dimensão.
