---
validador: seguranca-aplicacao
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

Veredito na primeira linha: **FAIL, e o único motivo é documental**. Em execução a vigência na escrita está correta e eu não consegui furá-la. A Definition of Done da etapa pede "comentários batem com o código" e `dc360/apps/api/src/auth/suspensao.ts` (linhas 36 a 53) ainda afirma o contrário do código (achado 1). É o mesmo ponto que o QA reprovou nesta rodada; eu o reproduzi por leitura do arquivo no SHA.

Árvore validada: HEAD `24aed19`, que só difere de `4b96ea7` em arquivos de registro. Base de evidência: `C:/Users/Rfasg/AppData/Local/Temp/claude/c--Projetos-city-hall/b62645e7-c436-45b4-8ce0-4d68f4fb420f/scratchpad/seg/` (abreviada `seg/`).

| Critério | Resultado | Evidência |
| --- | --- | --- |
| Conta desativada, papel rebaixado, sessão encerrada e cadeia encerrada depois de renovar não escrevem (POST, PATCH, PUT, DELETE) | PASS | `get-com-efeito.test.ts` 10 de 10 e `vigencia-na-escrita.test.ts` verdes (`10-api-auth.txt`, 12 arquivos, 131 de 131); matriz própria por papel das 51 rotas não-GET (`4x-sweep-escrita.txt`) |
| GET e HEAD que escrevem (laudo, termos, PDFs, CSV, `GET /avisos`) passam pela vigência | PASS | os mesmos 10 casos, quatro estados x 7 rotas x GET e HEAD, mais as mutações m01, m14, m15 e m16 abaixo |
| Nada além do que a decisão documenta escreve por GET ou HEAD | PASS | varredura comportamental própria com IDs reais (`30-sweep-efeito.txt`): 4 contas desativadas x 51 rotas GET x GET e HEAD (408 pedidos), com ofício, evidência e código de validação reais; única mudança de banco: `ocorrencia_consultas` em `GET /ocorrencias/:id` e `GET /busca` (com e sem barra), exatamente a exceção documentada |
| Rota registrada por plugin, `app.route`, prefixo, `app.all` ou `app.head` explícito escapando da marca | PASS | `grep` em `src`: nenhuma rota fora de `app.get/post/put/patch/delete`, nenhum `app.head`, `app.route`, `app.all`; o HEAD automático herda a configuração (provado pelos casos de HEAD) |
| Rota GET NOVA sem a marca é barrada por um portão que obrigue a decidir | **PARCIAL** | achado 2: o portão é heurístico e a mutação m11 o atravessa |
| Zero `skip` em vigência | PASS | `grep` de `describe.skip`, `it.skip`, `xit`, `todo` em `apps/api/test`: só uma menção em comentário |
| Município suspenso responde a suspensão antes da conta desativada; `sid` de outra pessoa nega | PASS | `vigencia-na-escrita.test.ts` verde |
| Isolamento: outro município continua 404 | PASS | `4x-e05-oraculo.txt` (token vigente de B em ocorrência de A: 404 `nao_encontrada`) |
| Comentários e documentação batem com o código | **FAIL** | achado 1 |

## Evidência

- `cd dc360 && npm run build:shared`, depois `npx vitest run` em `apps/api` nos 12 arquivos de autenticação e vigência (`10-api-auth.txt`): 12 arquivos, 131 testes, todos verdes.
- Sondas próprias, com PGlite e a API real montada por `construirServidor` (scripts em `seg/`, apontando para o repositório, nada gravado no repositório):
  - `sweep-escrita.test.ts` (`4x-sweep-escrita.txt`): papel x rota para as rotas não-GET. A autorização responde antes da validação (403 `sem_permissao` para quem não pode, 422 para quem pode), coerente com a matriz de papéis.
  - `sweep-agente.test.ts` (`4x-sweep-agente.txt`): papel x rota para as GET.
  - `sweep-efeito.test.ts` (`30-sweep-efeito.txt`): snapshot de todas as tabelas (contagem e maior `xmin`) antes e depois de cada GET e HEAD, com a conta desativada e o token vivo.
  - `get-novo.test.ts` com a mutação m11 (`4x-get-novo.txt`).
- Provas de que o teste morde (cada uma: mutação em `apps/api/src`, vermelho, `git restore`, árvore conferida limpa por `git status`; saídas `seg/mNN-*.txt`):

| Mutação | Resultado |
| --- | --- |
| m01: `servidor.ts` sem `\|\| comEfeito === true` (volta a decidir só pelo método) | 5 vermelhos de 10 em `get-com-efeito.test.ts` |
| m14: `GET /documentos/:id/laudo` sem `ROTA_GET_COM_EFEITO` | 6 vermelhos de 10 |
| m15: `GET /relatorios/ocorrencias.csv` sem a marca | 6 vermelhos de 10 |
| m16: `servidor.ts` sem a chamada a `exigirVigencia` | 18 vermelhos em 3 arquivos (45 casos) |
| m06: `vigencia.ts` sem a conferência do papel | 4 vermelhos de 33 |
| m02: `vigencia.ts` com sessão rotacionada sempre viva (sem a família) | 8 vermelhos de 43 |

## Cenários positivos

- Conta vigente (coordenadora) emite termo, laudo e CSV normalmente (caso de controle de `get-com-efeito.test.ts`: as "pegadas" enxergam escrita, então o "nada gravado" das sondas não é vazio).
- A rotação normal continua valendo: o token anterior à renovação escreve até vencer (`vigencia-na-escrita.test.ts`).
- `/auth/encerrar-sessoes` com o token anterior à renovação preserva a cadeia de quem pediu (caso final de `get-com-efeito.test.ts`; mutação m07 na E07 prova que o teste morde).

## Cenários negativos

- Quatro estados da conta contra as 7 rotas GET marcadas, em GET e HEAD, e contra todas as rotas de escrita: mesma resposta que um POST teria, banco intacto.
- Token adulterado, ausente ou de plateia errada: 401 `nao_autenticado`.
- Município suspenso com `GET /avisos`: 403 `acesso_suspenso` (cobertura do QA, que eu li; não repeti).

## Tentativas de reprovar

1. Procurei rota que escapasse da marca por registro: `grep` de todos os registradores de rota em `src` (nenhum `head`, `route`, `all`); o HEAD do Fastify herda a configuração, e a varredura comportamental provou isso em HEAD de cada rota marcada.
2. Procurei GET que escreve e não está marcado, por comportamento e não só por texto: varredura com IDs reais (ofício, evidência confirmada, código de validação de um laudo emitido, usuário alvo). Só o registro de consulta do dossiê e da busca mudou o banco. Os GET `/oficios/:id/documento` e `/evidencias/:id/url` leem sem gravar.
3. Procurei o caminho que o portão da fonte não vê: **m11**. Acrescentei a `GET /orgaos` uma chamada `SELECT revogar_sessoes_do_usuario(...)` (função SQL que escreve, sem `INSERT`, `UPDATE`, `DELETE` nem `registrar*` no texto). `get-com-efeito.test.ts` e `superficie.test.ts` seguiram 19 de 19 verdes, e a sonda `get-novo.test.ts` mostrou o efeito real: conta DESATIVADA, token vivo, `GET /orgaos` responde 200 e as sessões revogadas passam de 0 para 2. O portão, portanto, não obriga quem cria um GET novo a decidir (achado 2).
4. Variantes de caminho e método (barra final, `HEAD`): cobertas pelo QA com 157 respostas e por mim nos casos de HEAD; nenhuma deu 200 nem gravou.
5. Procurei defeito introduzido pelo conserto da cadeia em `encerrarSessoes` (`preservarSessaoId` por família): a mutação m07 derruba 1 caso, e a família é por login (um aparelho não preserva a cadeia de outro login).
6. Procurei corrida entre a conferência da vigência e a escrita (as duas são transações separadas): a janela é de milissegundos e não é reproduzível por `inject`; fica em "Não verificado".

## Achados

**BLOQUEIA (documental, sem efeito em execução)**

1. `dc360/apps/api/src/auth/suspensao.ts` linhas 36 a 53: o texto define escrita como "qualquer método que não seja GET ou HEAD" e afirma que `GET /avisos` "escreve (materializa avisos e expurga os velhos) e segue aceitando esse token". Desde a correção 1, `GET /avisos` e as rotas de documento e CSV levam `ROTA_GET_COM_EFEITO` e conferem vigência e suspensão. Quem lê esse comentário pode concluir que `GET /avisos` é leitura livre e remover a marca, reabrindo o defeito da rodada 1. Correção mínima: reescrever o trecho para dizer que as rotas marcadas conferem como escrita. Dono: implementador da E04.

**CORRIGE ANTES DE CRESCER**

2. O portão contra GET novo que escreve é heurístico: `get-com-efeito.test.ts` varre o texto de `src/rotas` atrás de `INSERT INTO`, `UPDATE x SET`, `DELETE FROM`, `registrarEmissao`, `registrarEvento`, `registrarAtoAdministrativo`, `marcarInterditada`, `efetivarEmissao` e `responder(Pdf)`; este produto escreve também por funções `SECURITY DEFINER` (`SELECT revogar_sessao(...)`, `abrir_oficio(...)`) e por helpers de outros diretórios, e nenhum dos dois é visto (m11). O caso comportamental "responde `conta_desativada` SE E SÓ SE está na lista" só enxerga rotas JÁ marcadas. Sugestão: uma lista fechada de GET de leitura pura, e todo GET fora dela reprova até alguém decidir. Dono: F03-E03 ou etapa de portão.
3. `GET /ocorrencias/:id` e `GET /busca` seguem fora da vigência e gravam `ocorrencia_consultas` com a conta já desativada. É a decisão documentada (vigência em leitura é da F03-E03). A seção 7 de `28` não admite risco aceito em vigência; o plano excluiu o escopo, e quem decide é o gatekeeper. Até lá, uma conta desativada lê o dossiê completo (nome, contato, endereço, vulnerabilidade) por até `ACESSO_MINUTOS` (15 padrão, teto 60).

**ANOTADO**

4. Corpo JSON truncado ou acima do `bodyLimit` responde `500 erro_interno` (e o log registra "erro nao tratado" com pilha), em vez de 400 ou 413 (`4x-erros.txt`). Já anotado pela rodada 1, dono F02-E03.
5. `GET /documentos/validar/:codigo` lê TODA a trilha de emissões e todos os ofícios do município a cada chamada, para qualquer papel autenticado: custo proporcional ao município, sob o teto de 300 pedidos por minuto por usuário.

## Não verificado

- Postgres real: usei PGlite. O `test:isolamento` contra o Postgres 18.3 local é do gatekeeper (327 aprovados).
- Navegador e e2e (QA).
- Corrida entre `lerVigencia` e a escrita (duas transações).
- Carga: custo de uma ida ao banco por GET marcado (`GET /avisos` é chamado em laço pelo sino).
- Vigência em leitura (excluída pelo plano).

## Risco residual

- Leitura com token vivo (dossiê, busca, listas, ofícios, fotos) segue válida por até 15 minutos (teto 60) depois de desativar a conta ou encerrar a sessão, até a F03-E03.
- GET novo que escreva por função SQL entra sem vigência até alguém perceber (achado 2).

## Motivo do humano

Nenhum.
