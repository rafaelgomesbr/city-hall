---
validador: seguranca-aplicacao
modelo: claude-opus-5-5
etapa: V2-F00-E04
sha_validado: 4ce0433
ci_run: ausente
rodada: 5
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

Pasta das saídas: `<S>` = `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/768bf074-5845-4f2d-bff9-57106bf57383/scratchpad/val/L11-seguranca/saidas`.

1. Vigência ligada na escrita (DoD "sonda de conta desativada não escreve"): `apps/api/src/servidor.ts:515-524` chama `lerVigencia` e `exigirVigencia` quando o método não é GET nem HEAD OU a rota tem `config.comEfeito`; a marca de senha provisória vem do banco (`vigencia.senhaProvisoriaAte !== null`). Provado por execução: sonda própria (`<S>/sonda-l11.test.ts`, log `<S>/10-sonda-l11-log.txt`) com 17 estados negativos x 59 rotas de escrita ou com efeito (todas as rotas registradas fora de `SEM_TOKEN` que não são GET/HEAD, mais as 8 entradas `COM_EFEITO`, em GET e HEAD), cada `:param` preenchido com 8 ids reais e falsos: 4230 pedidos, ZERO aceitos (status < 400), e o hash md5 de todas as tabelas do esquema `public` idêntico antes e depois.
2. Conta inativa, papel diferente do token e sessão encerrada negam: no log, para admin, coordenador e agente: desativada 403 `conta_desativada` (206 por estado), rebaixada 401 `nao_autenticado`, sessão encerrada 401 `sessao_encerrada`, provisória vencida 401 `sessao_encerrada`, provisória só no banco 403 `troca_de_senha_obrigatoria`, `sid` de outra pessoa (token assinado com o segredo do servidor) 401 `sessao_encerrada`, município suspenso 403 `acesso_suspenso` e 503 nas 4 rotas da fila.
3. "Rotação não é expulsão" e "a própria pessoa que encerra as outras sessões mantém a sua": `vigencia-na-escrita.test.ts` e `get-com-efeito.test.ts` verdes (`<S>/01-api-arquivos-da-etapa.txt`).
4. Zero `skip` em vigência: `vigencia-na-escrita.test.ts` roda inteiro (16 arquivos ligados, 341 de 341, nenhum pulado).
5. GET com efeito: a descoberta da sonda (todo GET sem marca, com token vigente de admin, coordenador e agente, 8 ids por parâmetro, hash do banco antes e depois de CADA pedido) só achou `GET /ocorrencias/:id` gravando `ocorrencia_consultas`, que é a decisão registrada (registro da própria leitura, F03-E03). Nenhum GET não marcado muda dado do município.
6. B contra ocorrência de A continua 404: sonda (`GET /ocorrencias/<A>` com coordenador de B: 404, corpo igual ao do id inexistente) e `vigencia-na-escrita.test.ts`.
7. `superficie.test.ts` cobre a superfície real: lê `printRoutes` do servidor montado; 9 de 9 verde, e morde (mutação M4 abaixo).
8. Regressão obrigatória: `npm run test:api` 104 arquivos, 1451 aprovados e 34 pulados (o bloco de PostgreSQL de prova de `renovacao-contra-encerramento`, sem `DC360_POSTGRES_DE_PROVA`), código 0 (`<S>/04-test-api-completo.txt`); `test:isolamento` rodado pelo gatekeeper (345 e 3 pulados).
9. Nenhuma rota nova sem permissão: no diff da fase (`afde25c..4ce0433`) as rotas novas são `GET /usuarios/:id/sessoes` (`autorizar(..., "gerenciar_usuarios")` mais `exigirPostoParaGerir`, `administracao.ts:625`), `GET /auth/recuperacao` (pública, em `SEM_TOKEN`) e `GET /auth/sessoes` (a própria conta). Nenhuma rota nova no diff `bb0f654..4ce0433`.

## Evidência

- `cd dc360/apps/api && npx vitest run` com 16 arquivos (vigencia-na-escrita, get-com-efeito, superficie, acesso-suspenso, familia-da-sessao, sessoes-da-conta, campo-integracao, evidencia-so-do-autor, leitura-do-agente-oficios-e-avisos, sino-de-avisos, orgaos-e-oficio, agente-so-ve-a-equipe, codigos-de-erro, prova-dinamica-dos-codigos-de-erro, senha-provisoria, foto-do-agente): código 0, 341 de 341 (`<S>/01-api-arquivos-da-etapa.txt`).
- `npm run test:api`: código 0, 1451 aprovados e 34 pulados (`<S>/04-test-api-completo.txt`).
- Sonda própria num worktree esparso meu em `4ce0433` (arquivo novo só no worktree, `<S>/sonda-l11.test.ts`): código 0, 6 de 6 (`<S>/10-sonda-l11-vitest.txt`, `<S>/10-sonda-l11-log.txt`). Servidor real (`construirServidor`) por `inject`, banco PGlite com as migrações e a semente.
- Mutações, uma por vez, restauradas com `git checkout` e conferidas por `git status` (`<S>/20-mutacoes.txt`, roteiro `<S>/mutar.py`).
- Worktree removido ao fim (`git worktree remove --force`); a árvore principal não foi tocada além deste relatório.

## Cenários positivos

- Conta vigente emite o termo, o laudo e o CSV e escreve normalmente (controle de `get-com-efeito.test.ts`; descoberta da sonda com tokens vigentes respondeu 200 nas leituras).
- Senha provisória vigente: `POST /auth/trocar-senha` e `POST /auth/encerrar-sessoes` continuam abertos (lista `ROTAS_ABERTAS_COM_SENHA_PROVISORIA`, `servidor.ts:903`).

## Cenários negativos

- 17 estados (admin, coordenador e agente em: desativada, rebaixada, sessão encerrada, provisória vencida, provisória só no banco; mais `sid` alheio e município suspenso) x 59 rotas x 8 ids, GET e HEAD nas rotas com efeito: 4230 pedidos, zero aceitos, banco intacto (`<S>/10-sonda-l11-log.txt`, bloco "E04").
- Coordenador de B contra o dossiê de A: 404.

## Tentativas de reprovar

- M1, tirar `|| comEfeito` da decisão de escrita: 7 testes reprovam (4 sondas de `get-com-efeito`, a lista comportamental, o caso de `acesso-suspenso` e a minha varredura). Morde.
- M2, desligar `exigirVigencia` (o estado de b4439ac): 13 reprovam em `vigencia-na-escrita`, `get-com-efeito` e na sonda. Morde.
- M3, não conferir o papel em `exigirVigencia`: reprovam o caso do papel rebaixado e a minha varredura. Morde.
- M4, tirar `exigirAutenticacao` de `POST /rota`: `superficie.test.ts` reprova ("nenhuma rota nova responde sem autenticação"). Morde.
- Procurei GET sem marca que escreve (descoberta por hash do banco por pedido): só o registro de consulta do dossiê, decisão registrada.
- Procurei escrita aceita com senha provisória: só `POST /auth/encerrar-sessoes`, que é a isenção por desenho (grava `trilha_administrativa`); com ela fora da varredura, zero tabelas mudadas.
- Procurei regressão da correção 4 no caminho da vigência: o diff `bb0f654..4ce0433` em `servidor.ts` é só o comentário de `/saude`; em `auth/servico.ts` a troca de senha passou a rodar sob `comTenant` com `FOR NO KEY UPDATE` e a trava 049, depois de a rota já ter passado por `exigirAutenticacao` com vigência (POST); `administracao.ts` só normaliza o id para minúsculas antes das recusas sobre a própria conta. Nenhum deles abre escrita sem vigência (a varredura negativa inclui essas rotas).

## Achados

- anotado: 20 handlers de escrita não chamam `exigirPermissao` (autenticação, segundo fator, troca de senha, encerrar sessões, `POST /avisos/lidos`, foto da própria conta, aparelhos de push, `POST /rota`, interesse público, armazenamento local). Todos são da própria conta, públicos por desenho ou autenticados pela URL, todos anteriores à fase e com o porquê no código; passam por `exigirAutenticacao` com vigência (os que exigem token). Para a F03-E12 (manifesto rota x ação). Varredura estática no fonte: `<S>/21-varredura-estatica-escrita-sem-permissao.txt`.
- anotado: `GET /ocorrencias/:id` grava `ocorrencia_consultas` sem vigência (decisão registrada, F03-E03).

## Não verificado

- O banco da varredura é PGlite (PostgreSQL embutido, superusuário só para o hash); não rodei a varredura contra PostgreSQL 17 servidor. O bloco de corridas em PostgreSQL real (`DC360_POSTGRES_DE_PROVA`) ficou pulado no `test:api` desta máquina.
- `npm run test:e2e:api` e o e2e de navegador ("desativar no painel e ver o POST falhar") não rodei; o caminho da API foi provado por `inject`.
- A renovação (`POST /auth/renovar`) com conta desativada não entrou na minha varredura (é rota sem token de acesso); coberta pelos testes do repositório que rodei, não por sonda minha.
- CI do SHA ausente (não é evidência mínima desta dimensão).

## Risco residual

Leitura pura segue pela assinatura do token até vencer (até 15 minutos) para conta desativada ou rebaixada, por desenho até a F03-E03. A conferência de "GET com efeito" depende de marca manual; a descoberta por hash cobriu os ids que usei, e um GET que só escreve com estado que a semente não cria escaparia.

## Motivo do humano

Não se aplica a esta dimensão: tudo o que ela exige foi executado aqui. A validação humana da etapa (Rafael ver a sonda antes e depois) é da etapa, não desta dimensão. Sobre o "Motivo do veredito" da rodada 4: era PASS sem defeito a consertar nesta dimensão; a correção 4 não mexeu na vigência, e a varredura negativa e as mutações desta rodada mostram que nada regrediu.
