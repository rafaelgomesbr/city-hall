---
validador: qa
modelo: claude-sonnet-5-5
etapa: V2-F00-E04
sha_validado: 4b96ea7
ci_run: 38445527075
rodada: 2
herdado_de:
tags: [API, AUTH, VIGENCIA, TENANT]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: FAIL
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Veredito: FAIL, e o motivo é só documental. O comportamento da vigência está correto e provado; a Definition of Done pede "comentários batem com o código" e sobra um comentário que afirma o contrário do código (achado 1). Árvore em `24aed19` (difere de `4b96ea7` só em registro). Saídas brutas em `scratchpad/qa-api/` (citadas por nome, sem copiar).

| Critério (bloco E04 e arbitragem da rodada 1) | Resultado | Evidência |
| --- | --- | --- |
| Conta desativada não escreve (POST, PATCH, PUT, DELETE) | PASS | varredura própria de 51 rotas de escrita fora de `SEM_TOKEN` (44 POST, 5 PATCH, 1 PUT, 1 DELETE): 51 de 51 responderam 403 `conta_desativada`, nenhuma tabela mudou (`07-escrita.*`) |
| Papel rebaixado não escreve | PASS | as mesmas 51: 401 `nao_autenticado`, nada mudou |
| Sessão encerrada e cadeia encerrada depois de renovar não escrevem | PASS | as mesmas 51: 401 `sessao_encerrada` nos dois estados, nada mudou |
| GET e HEAD com efeito (termo de interdição, termos, laudo, PDFs, CSV, `GET /avisos`) passam pela vigência | PASS | `get-com-efeito.test.ts` 10 de 10; varredura própria: com conta desativada, rotas GET fora da lista só gravam `ocorrencia_consultas` (`06-varredura.*`) |
| Varredura de PATCH, PUT e DELETE existe nos testes | PASS | caso "PATCH, PUT, DELETE e POST com conta desativada" de `get-com-efeito.test.ts`; morde para cada método (mutação abaixo) |
| Zero `skip` em vigência | PASS | `grep` de `skip`, `xit` e `todo` em `apps/api/test`: nenhum |
| Município suspenso com conta desativada responde a suspensão primeiro; `sid` de outra pessoa nega | PASS | `vigencia-na-escrita.test.ts` (linhas 210 e 231), verde |
| A própria pessoa que encerra "as outras sessões" mantém a dela (inclusive a cadeia) | PASS | `get-com-efeito.test.ts` último caso e `familia-da-sessao.test.ts`, verdes |
| Isolamento: 404 entre municípios intacto | PASS | `vigencia-na-escrita.test.ts` linha 248 e probe própria (`21-e05.json`, bloco "ativaB_em_A": 404) |
| Comentários e documentação batem com o código | FAIL | achado 1 |

## Evidência

- `npm run build:shared`, depois `npx vitest run` nos 8 arquivos ligados (`get-com-efeito`, `vigencia-na-escrita`, `familia-da-sessao`, `codigos-de-erro`, `acesso-suspenso`, `sessoes-da-conta`, `superficie`, `senha-provisoria`): 126 de 126 (`01-vigencia.txt`).
- `npm run test:api` completo: 99 arquivos, 1299 de 1299, código 0 (`22-test-api-completo.txt`).
- `node scripts/e2e-api.mjs` (API e painel em portas próprias, Chromium): "Passou: 279, Falhou: 0" mais "Passou: 50, Falhou: 0" da geometria, zero erro de console (`23-e2e-api.txt`). Seção 23 (E05) e 24 (E07) cobrem a ponta a ponta de desativar e rebaixar.
- Varredura de rotas GET: leitura de todo `app.get` de `src/rotas/*.ts` e `servidor.ts` (46 rotas), com `varre.mjs` e `chamadas.mjs` no scratchpad (padrões de escrita e chamadas de helper); depois confirmação por comportamento: hash de todas as tabelas antes e depois de cada GET e HEAD, com a conta em cada um dos quatro estados.
- Provas de que o teste morde (cada uma: mutação em `src`, vermelho, `git restore`, árvore limpa conferida por `git status`):

| Mutação | Resultado |
| --- | --- |
| `servidor.ts`: tirar `\|\| config.comEfeito === true` (volta ao critério só por método) | 5 casos vermelhos de `get-com-efeito.test.ts` (as 4 sondas e a lista comportamental) (`02-mut-sem-comEfeito.txt`) |
| `servidor.ts`: não chamar `exigirVigencia` | 18 vermelhos em 3 arquivos (`04-mut-sem-exigirVigencia.txt`) |
| `vigencia.ts`: sessão rotacionada vale sempre (sem conferir a família) | 8 vermelhos, inclusive a sonda da cadeia em GET e HEAD (`03-mut-rotacionada-sempre-viva.txt`) |
| `vigencia.ts`: não conferir o papel | 5 vermelhos (`05-mut-sem-papel.txt`) |
| `servidor.ts`: excluir PATCH, depois PUT, depois DELETE da escrita (uma mutação por método) | 1 vermelho cada, o caso da varredura de escrita (`25-mut-PATCH.txt`, `-PUT`, `-DELETE`) |
| `avisos.ts`: tirar `ROTA_GET_COM_EFEITO` de `GET /avisos` | 2 vermelhos (lista comportamental e varredura de fonte) (`14-mut-avisos-sem-marca.txt`) |

## Cenários positivos

- Conta vigente (coordenadora) emite termo de interdição e baixa o CSV: interdita, grava `documento_emitido` e `exportacoes` (caso de controle de `get-com-efeito.test.ts`). As pegadas enxergam escrita, então o "nada gravado" das sondas não é vazio.
- Rotação normal: o token anterior à renovação escreve até vencer e o novo também (`vigencia-na-escrita.test.ts`, linha 188).
- Escrita permitida ao papel novo passa depois de renovar (E07, verde).

## Cenários negativos

- Quatro estados (conta desativada, papel rebaixado, sessão encerrada por administrador, cadeia encerrada depois de renovar) contra as 7 rotas GET marcadas (HTML, PDF, CSV, avisos) em GET e HEAD: mesma resposta que um POST teria, nada gravado.
- Os mesmos quatro estados contra as 51 rotas de escrita, todos os métodos (probe própria, nenhuma tabela mudou).
- Município suspenso e `GET /avisos` com token de agente: 403 `acesso_suspenso` (`24-suspenso.txt`).
- Dado sujo: token adulterado responde 401 `nao_autenticado`; token de renovação curto (`x`) ou inventado (43 letras `a`) responde 401 `sessao_encerrada`.

## Tentativas de reprovar

1. Procurei GET que escreve e não está marcado: lista de 46 rotas GET lidas uma a uma; sobram só `GET /ocorrencias/:id` e `GET /busca`, que gravam `registrarConsulta` (a auditoria da própria leitura). Confirmado por hash de tabela: nos quatro estados (conta desativada, rebaixada, sessão encerrada, cadeia encerrada), nenhuma tabela muda além de `ocorrencia_consultas`, e só por essas duas rotas; ver achado 2.
2. Variantes de caminho para escapar da marca na rota: barra final, barra dupla no início, `%2d`, `%64`, maiúsculas, `;a=b`, `%20`, `#frag`, `?_method=GET`, cabeçalhos `x-http-method-override`, `x-method-override` e `x-http-method` (89 respostas 403 e 68 respostas 404; nenhuma 200; contadores de trilha, consultas, exportações e avisos iguais antes e depois) (`20-variantes.txt`).
3. HEAD de cada rota marcada, nos quatro estados: coberto e igual ao GET.
4. Tentei achar rota de escrita que não passa pela vigência: nenhuma das 51 escapou; o portão `superficie.test.ts` continua verde.
5. Procurei defeito introduzido pelo conserto: `encerrarSessoes` agora preserva a cadeia (`familia_id`) de quem pediu. Testei que encerrar as OUTRAS sessões com o token anterior à renovação não derruba a própria cadeia, e que a família de outro login não é preservada por engano (`familia-da-sessao.test.ts`, "a família é por login"). Verde.
6. Corrida: não reproduzi a janela entre `revogar_sessao` e `abrir_sessao` da renovação (documentada em `PENDENCIAS.md` como limite conhecido).

## Achados

**BLOQUEIA (1, só documental)**

1. Comentário de `dc360/apps/api/src/auth/suspensao.ts` linhas 50 a 53 afirma o contrário do código. Texto: a leitura não produz registro, "com UMA exceção conhecida: `GET /avisos` escreve (materializa avisos e expurga os velhos) e segue aceitando esse token (`apps/api/PENDENCIAS.md`)". Desde a correção 1, `GET /avisos` leva `ROTA_GET_COM_EFEITO` e confere a vigência e a suspensão. Reprodução: município com `acesso_suspenso_em` preenchido, token vivo de agente, `GET /avisos` responde 403 `acesso_suspenso` (e o mesmo token lendo `GET /ocorrencias` segue 200); evidência `24-suspenso.txt` (sonda `scratchpad/qa-api/sondas-temporarias/zz-qa-suspenso.test.ts`). O `PENDENCIAS.md` que o comentário cita já diz o oposto. Linhas 44 a 47 do mesmo bloco ainda definem escrita como "qualquer método que não seja GET ou HEAD", sem mencionar as rotas marcadas. A DoD da etapa exige "comentários batem com o código" e a rodada 1 reprovou também por isso. Conserto mínimo, dono do contrato (implementador da E04): reescrever essas linhas para dizer que `GET /avisos` e as demais rotas marcadas conferem a vigência e a suspensão. Nenhum efeito em runtime.

**CORRIGE ANTES DE CRESCER (2)**

2. `GET /ocorrencias/:id` (dossiê) e `GET /busca` seguem fora da vigência e gravam uma linha em `ocorrencia_consultas` atribuída a quem já não pode (conta desativada, rebaixada, sessão encerrada), com o papel velho do token. Decisão documentada e fixada (E04 exclui "vigência em LEITURAS", F03-E03). Reprodução: `06-varredura.desativada.mudou.txt` (GET e HEAD de `/ocorrencias/:id`, `/busca` e `/busca/`). Dono: F03-E03. Nota para o gatekeeper: a seção 7 de `28` não admite risco aceito em vigência; o escopo foi excluído pelo plano, mas até a F03-E03 quem teve a conta desativada ou o aparelho derrubado por roubo lê o dossiê completo por até 15 minutos (60 no teto).
3. `docs/roadmap-v2/03-fase-00-estabilizacao.md` ainda diz, na E04, que `GET /avisos` segue fora da vigência até a F03-E03. O implementador já registrou isso; o código e a documentação do produto dizem o contrário. Dono: gatekeeper (texto do plano).

**ANOTADO**

4. Nenhum caso de CSV nível completo com a conta de administrador (também grava a trilha administrativa). A trava é a mesma `exigirAutenticacao`, mas sem teste próprio.

## Não verificado

- Rota de leitura com identificadores reais de ofício, evidência e validação de documento sob conta desativada (a probe de hash usou id de ocorrência e códigos inválidos nessas); leitura de código mostra que são só SELECT.
- Janela de milissegundos entre `revogar_sessao` e `abrir_sessao` na renovação (limite documentado).
- Postgres 17 e Postgres real do CI: usei PGlite (API) e o `test:isolamento` do gatekeeper.
- Firefox e WebKit no e2e (o script roda Chromium).
- Carga: custo da ida ao banco por GET marcado (`GET /avisos` é consultado em loop pelo sino).
- A vigência em leitura, por decisão do plano.

## Risco residual

- Leitura com token vivo (dossiê, busca, listas) segue válida por até 15 minutos depois de desativar conta ou encerrar sessão, até a F03-E03.
- O comentário errado do achado 1 pode levar quem mantém a rota `GET /avisos` a achar que ela é leitura livre e desfazer a marca.

## Motivo do humano

Nenhum.
