---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E04
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [AUTH, AUTHZ, TENANT, API]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: sim
escalar: nenhum
---
## Critérios verificados
HEAD da árvore 665b2be (só muda STATUS.md); produto idêntico a 7005a60. Árvore limpa antes e depois (`git status --porcelain` vazio, exceto este relatório).

- **Sonda de conta desativada não escreve**: `test/vigencia-na-escrita.test.ts`, 13 de 13 verdes. Desativar Helena (PATCH `/usuarios/:id/situacao`) e repetir `POST /ocorrencias/:id/coordenada` com o token vivo devolve 403 `conta_desativada`. Nota: o bloco da etapa diz 401; o SHA entrega 403 porque o catálogo da E05 (mesmo lote) separou os códigos. A escrita é negada; só o código difere do texto do bloco. Ver Achados 3.
- **Zero skip em vigência**: `grep` no arquivo acha a palavra "skip" só em comentário de histórico (linha 36); nenhum `describe.skip`, `it.skip` ou `.skip(` executável.
- **Papel rebaixado**: token de coordenador, banco diz operador: 401 `nao_autenticado`.
- **Sessão encerrada por administrador**: 401 `sessao_encerrada`; quem chama `/auth/encerrar-sessoes` mantém a sua (200) e a outra cai.
- **Conta ativa escreve 200**: verde (casos "antes" de cada cenário e rotação).
- **Isolamento**: token do município B contra ocorrência de A: 404 (teste "a organização continua vindo do token"). `npm run test:isolamento`: 12 arquivos, 327 passam, 3 pulados (pré-existentes da E01, fora desta etapa).
- **Regressão**: `superficie.test.ts` 9 de 9; suíte inteira da API 97 arquivos, 1267 testes, 0 falhas; `npm run test:e2e:api` 271 OK, 0 falha, zero erro de console.
- **Comentários batem com o código**: li `vigencia.ts`, o bloco de `exigirAutenticacao` em `servidor.ts`, a linha do token de acesso no README e `PENDENCIAS.md`; descrevem a regra ativa (escrita confere, leitura não).
- **E2E de navegador "desativar no painel e ver o próximo POST falhar"**: NÃO existe. Coberto só por `inject` na API. Ver Achados 2.

## Evidência
Saídas no scratchpad do sistema (`.../scratchpad/`):
- `vig-sup.txt`: vigência + superfície, exit 0, 22 testes.
- `api-full.txt`: `npm run test:api`, exit 0, 1267 passam.
- `mut1.txt`: mutação (ver Tentativas), exit 1, 6 falhas de 13.
- `isol.txt`: `npm run test:isolamento`, exit 0.
- `e2eapi.txt`: `npm run test:e2e:api`, exit 0, Passou 271 Falhou 0.
- `probe/saida.txt`, `probe/saida2.txt`: varredura de todas as rotas e sonda de GET que escreve (script em `probe/varredura.test.ts`, fora do repositório).
- CI: `gh run view 37739535524`: success, 9 de 9 jobs, headSha 7005a60.

## Cenários positivos
Conta ativa escreve 200 antes da desativação; conta restaurada escreve de novo; rotação de renovação mantém o token antigo valendo (200) e o novo (200); marca `sp` no token sem prazo no banco não tranca (200); sessão da própria pessoa que encerra as outras continua valendo (200).

## Cenários negativos
- Conta desativada: 403 `conta_desativada`. Papel diferente do token: 401 `nao_autenticado`. Sessão encerrada por administrador ou pela própria pessoa (a outra): 401 `sessao_encerrada`. `sid` de outra pessoa com `sub` de Helena: 401 `sessao_encerrada`. Município suspenso com conta desativada: 403 `acesso_suspenso` (suspensão primeiro). Prazo de senha provisória no banco sem marca no token: 403 `troca_de_senha_obrigatoria`.
- Isolamento: Aurelio (município B, ativo, token legítimo) escrevendo na ocorrência do município A: 404, nunca 403.
- Varredura independente (`probe/saida.txt`): desativei Helena e chamei com o token vivo TODA rota não-GET registrada que exige token (cerca de 50, enumeradas por `rotasRegistradas`, corpo `{}`): todas responderam 403 `conta_desativada` antes de validar o corpo. Nenhuma rota de escrita escapou de `exigirVigencia`. Isenções (`SEM_TOKEN`: `/auth/entrar`, `/renovar`, `/sair`, `/recuperar`, `/redefinir`, `/segundo-fator`, `PUT /armazenamento/objeto`, `/publico/interesse`) autenticam por outro artefato e estão fora do contrato desta etapa (renovação é E07).

## Tentativas de reprovar
1. **Desfazer o conserto**: troquei `exigirVigencia(vigencia, conteudo, statusDaSuspensao)` por `void` em `servidor.ts` e rodei o arquivo: 6 de 13 reprovam (desativada, papel, sessões, leitura x escrita, suspensão+desativada, `sid` alheio). O teste morde. Restaurei com `git restore`; árvore limpa.
2. **Achar rota de escrita fora da vigência**: varredura acima, zero escapes. Procurei também `app.route`/`app.all`/`verificarAcesso` fora de `servidor.ts`: só `rede.ts` usa `verificarAcesso`, para a chave do limitador de taxa (não decide acesso).
3. **GET que escreve**: com Helena desativada e token vivo, `GET /relatorios/ocorrencias.csv` devolve 200 (1915 bytes) e INSERE uma linha em `exportacoes` (0 para 1); `GET /avisos` devolve 200. Ver Achados 1.
4. **sid forjado de outra pessoa**, conta de outro município, token com `sp` falso: negados como acima.
5. **Corrida entre verificação e escrita**: `lerVigencia` abre transação própria, separada da transação da rota; há janela de milissegundos em que uma desativação concorrente passa. Não construí teste de corrida (ver Não verificado).

## Achados
1. **corrige antes de crescer**: GET que escreve e entrega dado fora da vigência além de `GET /avisos`. Reprodução: desativar conta (PATCH situação), `GET /relatorios/ocorrencias.csv` com o token antigo: 200 e `exportacoes` ganha linha (probe/saida2.txt: "exportacoes 0 -> 1"). `apps/api/PENDENCIAS.md` e o bloco de `servidor.ts` citam só `GET /avisos` como "leitura que escreve". Está dentro do que a etapa declara adiar (F03-E03), mas a lista de exceções conhecidas está incompleta. Dono: quem mantém PENDENCIAS (acrescentar a rota) e F03-E03 (cobrir). Não testei o nível `completo` (exige papel administrativo).
2. **corrige antes de crescer**: o E2E exigido no bloco ("desativar um usuário no painel e confirmar que o próximo POST dele falha") não existe como teste de navegador; o `RESUMO.md` o adia para a E05, que não o criou (nenhum teste em `apps/web` cita `conta_desativada`). A prova é de API (`inject`, PGlite).
3. **anotado**: o texto do bloco da E04 pede 401 para conta desativada; o SHA entrega 403 `conta_desativada` (E05, decisão registrada em `auth/conta-desativada.ts`). O bloco deveria ser ajustado para não induzir leitura errada.
4. **anotado**: o `RESUMO.md` da pasta de evidência é anterior à separação Fatos/Justificativa da D-30, e `saidas/` foram medidas no commit da E04, não no SHA 7005a60; a prova válida para este SHA é a que rodei hoje.

Nenhum achado bloqueia.

## Não verificado
- Execução contra Postgres real (17 ou 18 local): os testes de API usam PGlite (Postgres 16 em WebAssembly). O job de CI "A API sobe contra Postgres real" só sobe o servidor e lê `/saude`; nenhum teste de vigência roda em Postgres de verdade. A consulta de `lerVigencia` é SQL padrão (LEFT JOIN, EXISTS), risco baixo, mas não provado.
- E2E de navegador (Playwright) do fluxo de desativação no painel: não existe teste; não escrevi um por não poder criar arquivo no repositório.
- Corrida (desativação concorrente a uma escrita em voo) e carga: não medidas.
- Nível `completo` do CSV com administrador desativado; leituras em geral (fora do escopo, F03-E03).
- Comportamento do aplicativo de campo diante de 401/403 na fila (E06); aparelho físico.
- A validação humana pedida no bloco (Rafael vê a sonda antes e depois): pendente.

## Risco residual
- Até a F03-E03, conta desativada lê (e exporta CSV básico) por até 15 minutos, no máximo 60 se `ACESSO_MINUTOS` subir.
- Não implantar a E04 sem E05 e E06 (o campo trata 401 como falha permanente).
- Janela de milissegundos entre `lerVigencia` e a transação da rota.
- Prova só em PGlite.

## Motivo do humano
O bloco exige que o Rafael veja a sonda antes e depois; só uma pessoa pode dar essa aceitação. O restante da prova está executado.
