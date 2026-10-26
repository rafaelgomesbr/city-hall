---
validador: seguranca-aplicacao
modelo: claude-sonnet-5-5
etapa: V2-F00-E08
sha_validado: 7005a60cd70b30a4f455a96a64c4d7a3abb2819f
ci_run: 37739535524
rodada: 1
herdado_de:
tags: [UI, A11Y, AUTH, AUTHZ, TENANT, API, LGPD]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: media
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados
Foco ASVS V4 (controle de acesso, IDOR, BOLA). Leitura de `recorte-do-agente.ts`, `rotas/avisos.ts`, `rotas/oficios.ts`, `servidor.ts` (`autorizar`, `exigirAutenticacao`) e do diff arquivado, mais sonda executada contra o servidor montado (`construirServidor` + banco em memória com semente, mesmo harness de `leitura-do-agente-oficios-e-avisos.test.ts`).
- Onde mora o filtro por equipe: no SQL da rota, não na serialização. É um `AND o.equipe_id = (SELECT equipe_id FROM usuarios WHERE id = $n)` com `usuarioId` do token, aplicado na lista, na contagem `naoLidos` e no `INSERT ... SELECT` de `POST /avisos/lidos`. A equipe vem do cadastro, lida na hora; não há parâmetro de equipe no esquema da consulta. Não é policy de RLS (a RLS é só por município); isso é decisão antiga do projeto, não regressão.
- `GET /oficios` e `GET /oficios/:id`: `autorizar(app, req, "consultar_oficio")` roda antes de qualquer `idSchema` e de abrir transação.
## Evidência
Sonda temporária `dc360/apps/api/test/zz-sonda-seg.test.ts`, 5 de 5 verdes, saída 0 (vitest, `--testTimeout=240000`); arquivo apagado. Resultados citados abaixo.
## Cenários positivos
Coordenador (Helena) continua vendo os dois avisos semeados (Alfa e Bravo) no sino. Os positivos de ofício (operador, coordenador, administração, 200) estão no teste da etapa e no `qa.md`; não os repeti.
## Cenários negativos
- Agente Diego (Alfa), com cabeçalho extra `x-organizacao-id` de outro município: 403 `sem_permissao` em `/oficios?equipe=`, `?todas=1`, `?limite=1000&ordem=desc&busca=`, `?ocorrenciaId=&organizacaoId=`, `/oficios/:id` de ofício da Bravo, de outro município, id inexistente e id malformado. Os quatro últimos têm corpo e status idênticos (conjunto de corpos com tamanho 1), então a resposta não revela existência. `/oficios/:id/documento` também 403 (outra ação, `emitir_documento`).
- Coordenador do município B em ofício do município A: 404 `Ofício não encontrado.`, corpo idêntico ao de id inexistente; `/oficios?ocorrenciaId=<oc de A>` devolve `{"itens":[]}`.
- `GET /avisos` do agente Bruno (Bravo) com `?equipe=<Alfa>`, `?todas=1`, `?ocorrenciaId=<Alfa>`, `?desde=2000-...`, `desde`+`desdeId` de aviso da Alfa, `?organizacaoId=<B>`, `?equipe[]=x&limite=9999`, mais cabeçalho `x-equipe-id`: sempre 1 item (o dele) e `naoLidos=1`; nenhum corpo contém id de aviso, id de ocorrência ou protocolo da Alfa.
- Aviso marcado como lido por outro agente: Diego marcou o da Alfa (`marcados: 1`) e tentou o da Bravo; no sino do Bruno o aviso da Bravo segue `lido=false` (a marca é por usuário). Bruno tentando marcar o aviso da Alfa: `marcados: 0`, igual a id inexistente.
- Agente sem equipe (inserido na sonda, `equipe_id` nulo): sino com 0 itens e `naoLidos` 0; `/oficios` 403.
- Papel forjado: token de Diego com `papel` trocado para coordenador mantendo a assinatura, `alg: none`, e HS256 com segredo errado: todos 401 em `/oficios`. As claims do JWT trazem `papel` assinado.
## Tentativas de reprovar
Todas as acima foram tentativas de furar o filtro (parâmetros de consulta, paginação por cursor, cabeçalhos de município e equipe, diferença 403/404/422, contagem como oráculo, marcação cruzada de leitura, agente sem equipe, token adulterado). Nenhuma passou. Também procurei outra leitura de ofício: só `documentos.ts` (`/documentos/validar/:codigo`) devolve número de ofício, protocolo e `oficioId`, e exige o código em mãos (ver achados). Rodei a sonda sem o conserto? Não: a mutação (9 de 14 vermelhos) é do `qa.md`, que li e não refiz.
## Achados
- bloqueia: nenhum.
- corrige antes de crescer: a leitura não confere o papel no banco. Reproduzido na sonda: rebaixei a coordenadora Helena a `agente_campo` no banco e o token vivo dela ainda deu 200 em `GET /oficios` e no sino completo (2 itens), por até 15 minutos. É a F03-E03, declarada em `servidor.ts` ("LEITURA com token vivo não vai ao banco"). Os controles novos herdam esse prazo: o papel é o do token. O caso inverso (agente promovido) não abre nada.
- anotado: `GET /documentos/validar/:codigo` aceita qualquer papel autenticado, inclusive agente, e para ofício devolve número, protocolo, `ocorrenciaId` e `oficioId` do município todo, sem recorte de equipe. Exige o código de emissão (hash), então não enumera; mesmo item já anotado no `qa.md`.
- anotado: `GET /avisos` segue escrevendo dentro do GET, agora também disparável pelo agente; declarado (F07-E03).
## Não verificado
- Banco PostgreSQL real (17 em produção): usei o banco em memória da suíte (PG embutido), igual ao dos testes; a prova em 17 é só do CI.
- `scripts/e2e-api.mjs` e a sonda HTTP do implementador contra processo real: não reexecutei.
- Rota de refresh/sessão: não testei se o refresh reemite `papel` atualizado.
- Painel (esconder "Ofícios") e a camada de interface: fora da minha dimensão, não abri.
- Concorrência (dois pedidos simultâneos ao sino) e carga: não testadas.
- Reatribuição de ocorrência entre equipes no meio de uma paginação por cursor: li o SQL (o recorte é por junção viva), não executei.
## Risco residual
Janela de até 15 minutos com papel antigo na leitura (F03-E03). Recorte de equipe feito na aplicação, não no banco: uma rota nova de leitura que esqueça `eRecorteDoAgente` vaza; o manifesto rota x ação é F03-E12/E14. Catálogo de órgãos e equipes aberto ao agente (`qa.md`).
## Motivo do humano
Não se aplica.
