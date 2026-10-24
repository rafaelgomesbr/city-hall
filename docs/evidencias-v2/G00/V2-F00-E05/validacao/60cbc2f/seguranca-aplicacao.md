---
validador: seguranca-aplicacao (general-purpose)
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
confianca: alta
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados

SCRATCH = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/d1c50ef6-d495-4393-82c6-d7e2ba48b9a4/scratchpad/r8/seg-E05`. Toda sonda e mutação rodou numa cópia do SHA (`git archive 60cbc2f` em `SCRATCH/copia`, com `node_modules` ligado e `@dc360/*` apontando para a própria cópia; `shared` e `db` compilados na cópia). `git diff --stat 60cbc2f..HEAD` confirma que HEAD `bc3c535` só muda `STATUS.md`, `ESTADO-ATUAL.md` e o `qa.md` desta rodada. As sondas são minhas, escritas do zero, e falam com a API real (`construirServidor` sobre PGlite com as migrações e o RLS reais) e com o console real (`construirConsole`) por socket TCP cru, nos modos "falhar" (teste) e "corrigir" (produção), em Node 22.23.3 (o do `.nvmrc`, do CI e do `Dockerfile`, baixado e conferido pelo SHASUMS256) e em Node 24.15.0, sem tratador de `uncaughtException`.

| Critério (etapa, campo) | Prova | Resultado |
| --- | --- | --- |
| Testes positivos: token vencido 401 `nao_autenticado`; sessão encerrada 401 `sessao_encerrada`; conta desativada 403 `conta_desativada`; catálogo comparado com o servidor | CI job 118974893692 (Node 22.23.3): `codigos-de-erro.test.ts` 229 (API) e 15 (shared), `vigencia-na-escrita` 13, `prova-dinamica` 1, guarda 140 (API) e 48 (console), API 1717 passados. Sonda minha, socket real: conta desativada pelo painel e desativada sem revogar saem 403 `conta_desativada` na escrita e no GET com efeito (CSV); renovação válida da desativada 403 sem par; renovação desconhecida 401 `sessao_encerrada` (`01`, `02`, seções 2 e 4) | PASS |
| Teste negativo: `/auth/entrar` com conta desativada igual à senha errada | Sonda, socket real, 8 rodadas intercaladas de 5 casos (ativa com senha errada, desativada com senha CERTA, desativada com senha errada, desativada sem revogar com senha certa, email inexistente): 1 forma só, byte a byte (status, corpo e todos os cabeçalhos menos `date` e contagem do limite). Tempo mediano 227 a 228 ms nos cinco (Node 24, `01`), sem oráculo de tempo. O caminho do bloqueio silencioso também foi atravessado (mais de 5 falhas por conta) | PASS |
| Teste negativo: código fora do catálogo reprova | CI (varredura e guarda verdes); mutação do QA desta rodada (30, 14 e 2 casos vermelhos com as guardas antigas). Não repeti a mutação da guarda: a prova que eu acrescento é a de que a guarda não muda a autorização (abaixo) | PASS |
| Autorização e isolamento: desativada de A escrevendo em B recebe `conta_desativada` sem confirmar nada sobre B | Sonda: escrita em ocorrência própria, de B e inexistente com o token da desativada (com e sem sessões revogadas): resposta idêntica byte a byte; corpo só com `erro` e `mensagem`; nenhum nome, matrícula, município ou id no fio. Leitura e HEAD da ocorrência de B saem 404 iguais ao inexistente (`01`, `02`, seção 2) | PASS |
| Isolamento: 404 de outro município não muda | Conta ATIVA de B contra A: escrever coordenada, ler, HEAD, desativar o administrador de A, encerrar sessões de usuário de A: todos 404 idênticos ao id inexistente; controle no mesmo município sai 403 `posto_insuficiente` (seção 5). CI: `test:isolamento` 345 passados e 3 pulados | PASS |
| A prova morde | Mutação na cópia: (1) `/auth/entrar` devolvendo `ContaDesativada` à desativada com senha certa, a sonda reprova ("2 formas", `07`); (2) a rota de coordenada respondendo 403 `sem_permissao` no lugar do 404, a sonda reprova o isolamento e o pipeline (`08`). Arquivos restaurados do `git archive` e conferidos por `diff` | PASS |
| Regressão obrigatória (`test:api`, `test:isolamento`, web, campo, `superficie`) | CI run 39524190207 sobre `c680f8d` (diff para `60cbc2f` só em `STATUS.md` e `ESTADO-ATUAL.md`), 12 de 12 jobs `success`; log do job 118974893692 lido: `superficie` 9 (API) e 12 (console), console 307, web 723, isolamento 345 (`06-ci-job-testes.log`) | PASS |
| Os achados de Segurança da rodada 7 (pipeline com `content-length` menor, trailer derrubando o processo, 1xx final) | Já reproduzidos e fechados pelo QA desta rodada com 64 variantes; eu não repeti a mesma bateria. Acrescentei o que ele não cobriu: pipeline FORA DE ORDEM (respostas 401 e 403 que terminam antes da anterior e esperam na fila `outputData`), leitor lento com 200 respostas 403 em fila, 300 conexões derrubadas no meio de 401 e 403 segurados e 18 formas de pedido estranho de cliente (abaixo) | PASS |
| E2E e validação humana (frases das três telas) | E2E pelo CI (job 118974893838 `success`, lido pelo QA); as frases são do Rafael | pendente humano |

## Evidência

Saídas em `SCRATCH/saidas/`, sondas em `SCRATCH/sondas/`:

- `zz-seg-api.ts` (API, 73 verificações): `01-api-node24-falhar.txt` e `01-api-node24-corrigir.txt` (exit=0, 73 OK, 0 FALHA); `02-api-node22-falhar.txt` e `02-api-node22-corrigir.txt` (exit=0, 73 OK, 0 FALHA).
- `zz-seg-fila.ts` (pipeline fora de ordem, 5 rodadas de 8 pedidos): `03-fila-node{22,24}-{falhar,corrigir}.txt`, exit=0 nos quatro, 0 desvios.
- `zz-seg-console.ts` (console): `09-console-node{22,24}-{falhar,corrigir}.txt`, exit=0 nos quatro, 0 desvios.
- `zz-seg-redos.ts` (custo do conferidor de corpo): `04-custo-do-conferidor.txt` (Node 24) e `04b-custo-do-conferidor-node22.txt`.
- Mutações: `07-mutacao-enumeracao-e-403.txt` (exit=1, reprova a enumeração; nessa execução a segunda troca caiu noutra rota por erro meu de posição e não mediu nada, por isso foi refeita), `08-mutacao-404-vira-403.txt` (exit=1, reprova o isolamento e o pipeline). A cópia foi restaurada e conferida por `diff` contra `git show 60cbc2f:...`.
- CI: `05-ci-run.json` e `05-ci-jobs.json` (sem token: `head_sha` `c680f8d`, `conclusion: success`, 12 jobs `success`); `06-ci-job-testes.log` (job 118974893692, por `gh` com o token só em variável de ambiente, nunca impresso).
- Árvore do repositório: `git status --porcelain` vazio antes de gravar este relatório; nada foi escrito fora do SCRATCH além deste arquivo.

## Cenários positivos

- Conta desativada (pelo painel, que revoga, e direto no banco, sem revogar): 403 `conta_desativada` na escrita, no GET com efeito e na renovação, com a frase do catálogo.
- Controle de posto no mesmo município: 403 `posto_insuficiente`.
- Pipeline de 7 pedidos numa conexão (403 do catálogo, 401, HEAD 404, GET 404, renovação 403, escrita de B em A 404, 401): sete respostas na ordem certa, nem uma a mais, nos dois modos e nas duas versões do Node.
- Pipeline fora de ordem (o primeiro pedido é o login lento, os seguintes terminam antes): `401 credenciais, 401, 401 (HEAD), 403 conta_desativada, 200, 401, 404, 401` em 5 de 5 rodadas, 0 desvios. No console: `401, 401, 401 (HEAD), 200 (console.js), 401, 401, 200`.
- Leitor que para de ler com 200 escritas em fila: 201 respostas na ordem (403 `conta_desativada` até o limite por IP de 300 por minuto, depois 429 `excesso_de_requisicoes`, e o 401 final), sem desvio.

## Cenários negativos

- **Enumeração em `/auth/entrar`:** os cinco casos (incluindo desativada com senha CERTA) dão a mesma resposta byte a byte e o mesmo tempo (diferença de mediana abaixo de 1,1 ms em 227 ms). No console, senha errada e email inexistente também são iguais.
- **Credencial inválida não revela estado da conta:** token vencido com assinatura certa, token assinado com outro segredo, token real com assinatura adulterada e `alg: none`, todos com o `sub` da conta desativada: 401 `nao_autenticado` "Token inválido ou expirado.", nunca 403. Sem token: 401 `nao_autenticado` com a frase "Informe o token de acesso." (diferença esperada, não depende de conta). Renovação desconhecida e renovação "quase igual" à real: 401 `sessao_encerrada` idênticas.
- **Isolamento:** desativada de A em B igual ao inexistente; ativa de B em A (escrita, leitura, HEAD, gestão de usuário, encerrar sessões) 404 igual ao inexistente, nunca 403.
- **Vazamento no corpo ou cabeçalho:** o 403 `conta_desativada` e o 403 da renovação só têm `erro` e `mensagem`; nenhum identificador, nome ou município no fio; os cabeçalhos são os mesmos para A, B e inexistente.
- **Dois cabeçalhos `Authorization`** (o do coordenador primeiro, o da desativada depois): o Node fica com o primeiro e a escrita sai 200; a desativada não consegue se passar por ninguém, nem o contrário.

## Tentativas de reprovar

1. **Fazer a guarda mudar o status de autorização a partir do cliente.** Mandei 18 formas de pedido que um cliente externo escolhe: HTTP/1.0 com e sem keep-alive, HEAD em rota que responde 401, `Expect: 100-continue` com token da desativada (o 100 passa, depois o 403 do catálogo), `Upgrade: websocket` e `Upgrade: h2c`, URI em forma absoluta, `OPTIONS *`, TRACE, preflight de CORS, corpo `chunked` com trailer no login, `Authorization` em caixa baixa com espaços, dois `Authorization`, `Accept-Encoding: gzip, br` no 403, `Range` e `If-None-Match` no 401, JSON torto com token da desativada, URL de 8 KB. Resultado: zero desvio acusado, zero linha de log de desvio no modo de produção, nenhum 401 ou 403 fora do catálogo, nenhuma resposta trocada. No console, HTTP/1.0, `Expect`, `Upgrade`, TRACE e JSON torto: zero desvio. Conclusão: um cliente externo não aciona a troca de resposta da guarda nem enche o log de desvios.
2. **Fila do Node.** Respostas 401 e 403 que terminam antes da anterior ficam em `outputData` e saem por `_flushOutput`, caminho que a guarda envolve e que a bateria do QA não exercitou de propósito. 5 rodadas na API e 3 no console, nas duas versões do Node e nos dois modos: ordem certa, nenhum desvio.
3. **Negação de serviço do processo pela guarda.** 300 conexões derrubadas (`destroy` e `resetAndDestroy`, de 0 a 6 ms depois do envio) no meio de 403 segurado, 401 e renovação: o processo segue de pé, sem `uncaughtException` (sonda sem tratador), sem desvio, e o pedido seguinte responde. Leitor lento com 200 respostas segurando a janela: sem perda nem reordenação.
4. **Custo do conferidor de corpo (ReDoS).** A regex `CHAVE_JSON` de `chavesErro` (desde a correção 3, `8b3ec33`) é quadrática quando o corpo 401 ou 403 tem muitas aspas escapadas: 60 KB levam 1082 ms em Node 22 e 1163 ms em Node 24 de CPU síncrona (`04`, `04b`); texto comum de 64 KB leva 0,2 ms. Procurei caminho externo até isso: todo corpo 401 e 403 da API e do console tem `mensagem` fixa do código (`SemPermissao`, `PostoInsuficiente`, `ContaDesativada`, `AcessoSuspenso`, `FalhaAutenticacao`, `RegraDeNegocio` 403, `assinatura` com motivo fixo do armazenamento, as recusas do console), nenhum leva texto do pedido, e o `campos` de `RegraDeNegocio` não aparece em 403. Não é alcançável no SHA. Ver achado 1.
5. **Oráculo de conta desativada na entrada e na renovação.** Senha certa da desativada, tempo, bloqueio silencioso, token desconhecido: nada distingue. O único ponto em que o estado aparece sem token "vivo" é a renovação com um token de renovação já revogado ou rotacionado da própria conta (achado 2).
6. **Status 404 contra 403 com a guarda no meio.** A guarda só toca 401 e 403, e as mutações mostram que a sonda pegaria um 403 que confirmasse recurso de outro município. O SHA não tem nenhum.
7. **Modelo de ameaça.** Não refiz a DV-01 (valor de cabeçalho com `toString` mutável dentro da rota): exige código hostil. Procurei variante sem código hostil (cabeçalho de resposta influenciado pelo cliente): o `id` do pedido é sorteado (`genReqId`), nenhuma rota copia cabeçalho de resposta de serviço externo (`rotas/mapa.ts` e `rotas/rota.ts` só leem status e `Location`), e o Node recusa CR e LF em `setHeader`. Nenhuma variante sem código hostil.

## Achados

1. **anotado (dívida; não bloqueia).** `chavesErro` em `dc360/apps/api/src/guarda-de-codigos-de-erro.ts` (regex `CHAVE_JSON`, linha 177) e a cópia em `dc360/apps/console/src/guarda-de-codigos-de-erro.ts` (linha 84) custam tempo quadrático no tamanho do corpo: um 403 de 60 KB com aspas escapadas bloqueia o laço de eventos por cerca de 1,1 s por resposta. Reprodução: `SCRATCH/sondas/zz-seg-redos.ts`, `conferirCorpoDeAcesso(403, JSON.stringify({ erro: "sem_permissao", mensagem: "\"".repeat(30000) }), CONTRATO_DE_ACESSO_DA_API)`. Classificação D-31: não é (a), porque nenhum critério escrito da E05 fala de custo; não é (b), porque nenhum corpo 401 ou 403 do produto neste SHA carrega texto do cliente (todas as mensagens são fixas no código), então só uma rota futura que ecoe texto do pedido numa recusa de acesso o alcançaria; não é (c), porque não é falha de isolamento, autenticação, autorização ou vigência, e sim de disponibilidade. É defeito latente que exige código errado no repositório: dívida. Conserto sugerido: contar as chaves `erro` numa varredura linear (um leitor de cadeias JSON de passada única), ou limitar o número de chaves examinadas. Dono sugerido: V2-F02-E03, que generaliza o catálogo e o esquema de erro.
2. **anotado (comportamento deliberado; não bloqueia).** A renovação com um token de renovação já revogado (rotacionado, ou revogado pela própria desativação) ou vencido, da própria conta, responde 403 `conta_desativada` quando a conta está desativada (`tratarTokenRecusado` em `apps/api/src/auth/servico.ts`, coberto por "um token de renovação JÁ ROTACIONADO... também diz conta_desativada" em `codigos-de-erro.test.ts`). O campo "Risco de segurança" da etapa diz "só a quem já apresentou token ou renovação válidos"; o código, em comentário, diz "quem já tem uma credencial que o servidor emitiu para esta conta". É a condição da correção 1: desativar revoga as sessões, então sem isso a pessoa desativada nunca leria "conta desativada". O que vaza é um bit (a conta está desativada) para quem tem uma credencial emitida àquela conta; token desconhecido continua 401 `sessao_encerrada`. Classificação D-31: não é (a) (a DoD não fala disso, e o E2E exige o comportamento); não é (b) como defeito, porque o efeito é o requisito; não é (c), porque não abre acesso nem enumeração para quem não tem credencial. Sugestão: alinhar a frase do campo "Risco de segurança" da etapa ao comentário do código, quando o roadmap for revisado.

Nenhum achado bloqueia pelas condições (a), (b) ou (c).

## Não verificado

- Proxy da borda do Fly (pipeline e conexões reaproveitadas pelo proxy diante da guarda): só socket TCP cru local. O README já declara isso.
- Postgres real: não rodei localmente; vale o job 118974893974 do CI (`success`). As sondas usam PGlite, o mesmo Postgres 16 com as migrações e o RLS reais.
- A bateria de 64 variantes de moldura do QA desta rodada: não repeti (mesma classe, já provada); só a estendi para fila e conexão derrubada.
- Mutação da guarda: não repeti; vale a do QA desta rodada.
- Tempo de resposta sob carga concorrente (o teste de tempo foi sequencial, num Mac); o login gasta o mesmo tempo nos cinco casos em série, não medi sob contenção.
- HTTP/2 e TLS: o servidor da sonda é HTTP/1.1 sem TLS, como o processo atrás do proxy.
- E2E do painel, aplicativo de campo e as três frases das telas (validação humana); DV-01, que é dívida registrada.

## Risco residual

A guarda é defesa em profundidade contra erro de programação e, nas formas que um cliente externo escolhe, não troca resposta, não acusa desvio, não reordena a conexão e não derruba o processo. Resta: a DV-01 (código hostil na rota), a escrita direta no socket (só a varredura heurística), o proxy da borda não medido, e o custo quadrático do conferidor de corpo (achado 1), inalcançável enquanto nenhuma recusa de acesso ecoar texto do pedido. A renovação com credencial revogada revela, por desenho, que a própria conta foi desativada (achado 2).

## Motivo do humano

A etapa exige que Rafael leia e aprove as três frases mostradas ao usuário (texto de produto, tela pública e fluxo de erro crítico). Isso não é prova de segurança e nenhum validador automático a substitui.
