# Fase 29: Incidentes e abrigos

**Gate da fase:** G29 INCIDENTES E ABRIGOS | **Depende dos gates:** G00 a G19 e G32 na ordem de execução (o imediato é G19; G32 entrega a geometria) | **Superfícies tocadas:** `apps/api`, `db`, `packages/shared`, `packages/i18n`, `apps/web` (painel), `packages/campo` e `apps/campo` (app do agente, offline) | **Checkpoints da fase:** CP-62, CP-63, CP-64, CP-65

Objetivo: o modo incidente do fluxo de ativação de emergência (ALY:§5.2): a coordenação cria um incidente, agrupa ocorrências, mantém o quadro de situação, aloca equipes e turnos, controla tarefas e presença (INC-01 a INC-04), cadastra abrigos com capacidade, ocupação e necessidades (ABR-01) e emite o relatório de situação, com a regra RN-08: agrupar não altera autoria, datas, documentos nem histórico da ocorrência. Hoje nenhuma migração cria incidente, abrigo, depósito ou estoque (REL:09, REQ-037 a REQ-048): tudo aqui é CRIAR, sobre as fundações já aprovadas.

O que se PRESERVA (MANTER): a ocorrência individual (a F29 não acrescenta coluna nem GRANT de UPDATE em `ocorrencias`), a saída a campo (migração 031) como recurso à parte, o motor offline `packages/campo` (estendido, nunca reescrito), `recorteDoAgente`, a RLS forçada e a trilha append-only.

O que a fase NÃO faz: logística, estoque e distribuição (F30); envio a S2ID, SEI e Defesa Civil Alerta (F31); previsão meteorológica, sensores e despacho 190, 192 e 193 (ALY §4); cadastro nominal de abrigados (CP-65); tempo real (a tela consulta ao abrir, por botão e a cada 30 segundos); ver `docs/roadmap-v2/21-fora-da-v2.md`.

Ordem sugerida: E01, E02; E03 depois da E02; E04, E05, E06 e E09 depois da E03 (arquivos disjuntos, cada uma com migration própria: numerar em sequência); E07 e E08 depois da E06; E10 depois da E04; E11 depois da E05, E07, E08 e E10; E12 depois da E09; E13 depois da E07, E08 e E09; E14 depois da E13; E15 depois da E05 a E09; E16 e E17 depois da E15; E18 fecha o fluxo. REGRA DE PROVA: toda etapa de tela (E10, E11, E12, E14) fecha só com capturas de tela, E2E e o portão visual de `docs/roadmap-v2/19-definicao-de-pronto.md` (seção 0) e da F08 (`V2-F08-E13`, `portao-visual.mjs`); texto de tela por chave do `packages/i18n` (F08-E08), com en e es em `pendentes.json` até o G35.

Nota de ordem das migrations de `avisos_tipo_check` (cada uma repete TODOS os valores vigentes e acrescenta os seus; confira o CHECK vigente com `pg_get_constraintdef` antes de escrever): valores atuais (migrações 018 e 031); depois F04-E11 (`encaminhamento_aceito`, `encaminhamento_devolvido`, `encaminhamento_respondido`, `esclarecimento_solicitado`, `encaminhamento_sem_aceite`, `encaminhamento_vencido`); F18-E12 (`relato_novo`, `complemento_recebido`); F34-E07 (`mensagem_do_cidadao`); F29-E07 (`tarefa_de_incidente_vencida`); F30-E11 (os cinco de estoque). A ordem é a de execução de `STATUS.md`, seção 5, não a numeração das fases.

## Etapas

### V2-F29-E01 - ADR do modo incidente e do local: vocabulário, ações e fronteiras
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (E02 em diante usam o que a ADR fixa)
- **Objetivo:** fixar por escrito o modelo de incidente, local e agrupamento, as ações de permissão e os estados, antes de qualquer tabela.
- **Problema que resolve:** sem vocabulário comum, F29 e F30 criariam duas tabelas de local; nenhuma migração trata incidente (REL:09, REQ-037 a REQ-048).
- **Origem:** PR:D-15; ALY:INC-01; ALY:ABR-01; ALY:RN-08.
- **Estado atual:** CRIAR (ADR nova; as ADR 0001 e 0003 são MANTIDAS).
- **Dependências de entrada:** G19; G32.
- **O que deve ser implementado:**
  - Documentação: ADR em `docs/adr/` (número a atribuir na execução): o incidente agrupa por tabela de vínculo e NUNCA escreve em `ocorrencias` (RN-08); uma tabela `locais` (`abrigo`, `deposito`, `ponto_de_coleta`) compartilhada com a F30; presença não é a saída a campo nem promete monitoramento; abrigo guarda só contagens.
  - Domínio: `packages/shared/src/incidentes.ts` (a criar): estados do incidente (`planejado`, `ativo`, `em_desmobilizacao`, `encerrado`) e do local (`ativo`, `desativado`); ações novas em `permissoes.ts`: `gerenciar_incidente`, `atualizar_situacao_do_incidente`, `registrar_presenca`, `gerenciar_abrigo`, `atualizar_ocupacao_de_abrigo`, `emitir_relatorio_de_situacao`.
- **O que NÃO deve ser implementado nesta etapa:** tabelas (E02, E09); rotas e telas (E03 em diante); estoque (F30).
- **Arquivos e módulos prováveis:** `docs/adr/` (nova), `packages/shared/src/incidentes.ts` (a criar), `permissoes.ts`.
- **Risco de segurança:** ação no papel errado abre incidente a quem não deve; o padrão é negar.
- **Impacto LGPD:** Não se aplica: decisão sem dado.
- **Migração necessária:** Não.
- **Compatibilidade:** os quatro papéis atuais não mudam.
- **Rollback:** reverter o commit.
- **Testes positivos:** `packages/shared/test/incidentes-permissoes.test.ts` (a criar): papéis esperados por ação.
- **Testes negativos:** ação sem entrada no manifesto reprova; `agente_campo` sem `gerenciar_incidente`.
- **Testes de autorização e isolamento:** Não se aplica: sem dado; a matriz é provada na E03.
- **Regressão obrigatória:** `npm run typecheck`, `npm test`, `npm run test:isolamento`; G00 a G19 e G32.
- **E2E:** Não se aplica: sem fluxo.
- **Validação humana:** Rafael e Alyson leem a ADR e respondem os checkpoints.
- **Evidência a produzir:** `docs/evidencias-v2/G29/V2-F29-E01/`.
- **Documentação a atualizar:** `dc360/docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** ADR aprovada; ações e estados no shared; nenhuma tabela.
- **Checkpoint:** CP-62 (níveis e quem comanda) e CP-63 (papel novo ou ações nos atuais; quem opera abrigo e depósito): o padrão proposto libera o desenvolvimento; produção fica bloqueada.

### V2-F29-E02 - Migration: incidentes, objetivos, vínculo com ocorrência e eventos
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (E03 a E08 dependem)
- **Objetivo:** criar as tabelas do incidente com RLS forçada e FKs compostas, sem nenhuma escrita em `ocorrencias`.
- **Problema que resolve:** REQ-037 e RN-08: agrupar sem tocar a ocorrência; o incidente se encerra, nunca se apaga.
- **Origem:** PR:D-15; ALY:INC-01; ALY:RN-01; ALY:RN-08.
- **Estado atual:** CRIAR (molde: `saidas_a_campo`, migração 031).
- **Dependências de entrada:** E01; G32.
- **O que deve ser implementado:**
  - Migration: `NNN_incidentes.sql` (a numerar na execução): `incidentes` (`codigo` por município e ano sem reuso, `nome`, `tipo_cobrade` nulo ou de `TIPOS_COBRADE`, `nivel`, `estado`, `inicio_em`, `fim_previsto_em`, `area` na geometria da F32, `comandante_id`, bloco de encerramento); `incidente_sequencias` e `proximo_codigo_de_incidente(ano)` sem SECURITY DEFINER (molde `001_base.sql:124`); `incidente_objetivos`; `incidente_ocorrencias` (vínculo com `desvinculada_em` e motivo); `incidente_eventos` (append-only, instante do servidor).
  - Banco: RLS forçada; FKs compostas por `organizacao_id` para `ocorrencias`, `usuarios` e `equipes`; UPDATE só em estado, nível, comando, período, área e encerramento; sem DELETE; CHECK de encerramento inteiro; índice único parcial (ocorrência em um só incidente aberto); nenhum GRANT novo sobre `ocorrencias`.
- **O que NÃO deve ser implementado nesta etapa:** rotas (E03, E04); quadro (E05); equipes, tarefas e presença (E06 a E08).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `db/test/incidentes.test.ts` (a criar), `db/src/manifesto.ts`.
- **Risco de segurança:** FK sem organização agruparia ocorrência alheia; função DEFINER estoura o teto de `isolamento.test.ts`.
- **Impacto LGPD:** sem dado pessoal por regra de tela; manifesto na E16.
- **Migração necessária:** Sim (`NNN_incidentes.sql`, a numerar na execução).
- **Compatibilidade:** só tabelas novas.
- **Rollback:** migration inversa enquanto vazias.
- **Testes positivos:** códigos sequenciais por município e ano.
- **Testes negativos:** DELETE negado; `ocorrencia_id` alheia recusada pela FK; segunda vinculação a incidente aberto recusada; fim anterior ao início recusado.
- **Testes de autorização e isolamento:** Vale Fundo não lê incidente de Serra Alta nem por id; tabelas entram em `isolamento.test.ts`.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run typecheck`, `npm run migrar -- --conferir`; G00 a G19 e G32.
- **E2E:** Não se aplica: sem rota.
- **Validação humana:** Rafael aplica a migration em banco limpo.
- **Evidência a produzir:** `docs/evidencias-v2/G29/V2-F29-E02/`.
- **Documentação a atualizar:** `dc360/docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** tabelas isoladas, sem DELETE e sem escrita em `ocorrencias`.
- **Checkpoint:** Não.

### V2-F29-E03 - Ciclo de vida do incidente: máquina de estados e rotas
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (E04 a E09 dependem)
- **Objetivo:** criar, ativar, mudar nível, comando e período, definir objetivos e encerrar incidente com motivo, com a regra no `shared` e `exigirPermissao` antes do banco.
- **Problema que resolve:** INC-01; regra que só existe no formulário não existe.
- **Origem:** PR:D-15; ALY:INC-01; DP:T08.
- **Estado atual:** CRIAR (molde: `transicaoPermitida` em `dominio.ts`).
- **Dependências de entrada:** E02; F02-E04; F03-E12.
- **O que deve ser implementado:**
  - Domínio: `TRANSICOES_DO_INCIDENTE` (`planejado -> ativo -> em_desmobilizacao -> encerrado`; `planejado -> encerrado` só com motivo); `encerrado` é terminal: fato novo é incidente novo.
  - API: `POST /v1/incidentes` (chave de idempotência), `GET /v1/incidentes` e `/:id`, `PATCH /v1/incidentes/:id` (trilha com antes e depois), `POST .../objetivos`, `POST .../encerrar` `{motivo}`; encerrar com tarefa ou presença aberta: 409 `incidente_com_pendencias`.
  - Autorização: `gerenciar_incidente` (coordenador e administrador) antes de qualquer SQL; comandante é usuário ativo do município; manifesto e matriz da F03-E13.
- **O que NÃO deve ser implementado nesta etapa:** agrupar ocorrências (E04); quadro (E05); telas (E10).
- **Arquivos e módulos prováveis:** `apps/api/src/rotas/incidentes.ts` (a criar), `packages/shared/src/incidentes.ts`, `apps/api/src/servidor.ts`, `apps/api/test/incidentes.test.ts` (a criar).
- **Risco de segurança:** nível e comando definem quem enxerga o incidente; toda escrita grava evento com ator.
- **Impacto LGPD:** Não se aplica: sem dado pessoal além do comandante.
- **Migração necessária:** Não.
- **Compatibilidade:** rotas novas sob `/v1`, no OpenAPI (F02-E04).
- **Rollback:** reverter o commit.
- **Testes positivos:** criar, ativar, mudar nível e encerrar com motivo; a mesma chave de idempotência devolve o mesmo incidente.
- **Testes negativos:** `encerrado -> ativo`: 409 `transicao_invalida`; encerrar sem motivo: 422; comandante desativado: 422.
- **Testes de autorização e isolamento:** operador cria incidente: 403; token de Vale Fundo em incidente de Serra Alta: 404.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:isolamento`, `npm run typecheck`; G00 a G19 e G32.
- **E2E:** `npm run test:e2e:api`: criar, ativar e encerrar.
- **Validação humana:** Rafael cria e encerra um incidente de teste.
- **Evidência a produzir:** `docs/evidencias-v2/G29/V2-F29-E03/`.
- **Documentação a atualizar:** `dc360/README.md`.
- **Definition of Done:** transições só pelas arestas; nenhuma rota sem ação no manifesto.
- **Checkpoint:** CP-62 (valida a escala de níveis do CHECK e quem comanda; padrão proposto: três níveis, comandante coordenador ou administrador).

### V2-F29-E04 - Agrupar e desagrupar ocorrências sem alterá-las (RN-08)
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com E05, E06 e E09: arquivos disjuntos)
- **Objetivo:** vincular e desvincular ocorrências ao incidente, deixando a ocorrência, a trilha, as vistorias e os documentos exatamente como estavam.
- **Problema que resolve:** RN-08 e INC-01: o incidente agrupa sem apagar a autonomia das ocorrências.
- **Origem:** PR:D-15; ALY:RN-08; ALY:INC-01; ALY:OCO-05.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E03; G32.
- **O que deve ser implementado:**
  - API: `POST /v1/incidentes/:id/ocorrencias` `{ocorrenciaId}`; `POST .../ocorrencias/:oid/desvincular` `{motivo}` (grava `desvinculada_em`, nunca apaga); `GET .../sugestoes`: ocorrências abertas dentro da `area` (consulta espacial da F32) ou do mesmo tipo e janela, só sugere; a coordenação confirma. Cada ato grava `incidente_eventos`.
  - Domínio: incidente encerrado não aceita vínculo novo.
  - Autorização: `gerenciar_incidente`; a leitura respeita o recorte (o agente só vê o incidente da equipe).
  - Frontend: a página da ocorrência mostra "Faz parte do incidente X" por leitura, sem escrever na trilha dela.
- **O que NÃO deve ser implementado nesta etapa:** mesclar ocorrências; despacho pelo incidente; tela do incidente (E10).
- **Arquivos e módulos prováveis:** `apps/api/src/rotas/incidentes.ts`, `db/test/incidentes-nao-altera-ocorrencia.test.ts` (a criar).
- **Risco de segurança:** vazar ocorrência de outra equipe pelo incidente.
- **Impacto LGPD:** a lista mostra protocolo, tipo, estado e severidade, nunca nome nem contato.
- **Migração necessária:** Não.
- **Compatibilidade:** `ocorrencias` e suas rotas idênticas.
- **Rollback:** reverter o commit; vínculos ficam inertes.
- **Testes positivos:** hash da ocorrência, da trilha, das vistorias e dos documentos igual antes e depois de vincular e desvincular; despacho e encerramento seguem funcionando.
- **Testes negativos:** ocorrência de outro município: 404; já agrupada: 409 `ja_agrupada`; vincular em incidente encerrado: 409; encerrar o incidente não encerra a ocorrência.
- **Testes de autorização e isolamento:** agente da equipe B vê lista vazia e 404 no detalhe do incidente da equipe A; `usuario_orgao`: 404.
- **Regressão obrigatória:** `npm run test:api` (`agente-so-ve-a-equipe`), `npm run test:isolamento`; G00 a G19 e G32.
- **E2E:** `npm run test:e2e:api`: agrupar, despachar, desagrupar.
- **Validação humana:** Alyson confere a ocorrência agrupada.
- **Evidência a produzir:** `docs/evidencias-v2/G29/V2-F29-E04/` com os hashes.
- **Documentação a atualizar:** `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** RN-08 provada por teste; nenhuma escrita nova em `ocorrencias`.
- **Checkpoint:** Não.

### V2-F29-E05 - Quadro de situação versionado e linha do tempo operacional (INC-02)
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E04, E06 e E09)
- **Objetivo:** manter o quadro de situação em versões imutáveis e a linha do tempo do incidente, com autoria, horário do servidor e conflito tratado.
- **Problema que resolve:** INC-02: atualização tem autoria, horário e versão; dois operadores não podem se sobrescrever.
- **Origem:** PR:D-15; ALY:INC-02; ALY:OCO-07.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E03.
- **O que deve ser implementado:**
  - Migration: `NNN_incidente_quadros.sql` (a numerar na execução): `incidente_quadros` append-only (`versao` única por incidente, autor, `registrado_em` do servidor, `situacao` `estavel|agravando|melhorando`, `resumo`, contagens não negativas: afetadas, desalojadas, desabrigadas, vias interditadas, `proxima_atualizacao_em`); RLS forçada; SELECT e INSERT.
  - API: `POST /v1/incidentes/:id/quadro` com `versaoAnterior` (conflito: 409 `quadro_desatualizado` com a versão atual); `GET .../quadro` (atual e histórico); `GET` e `POST .../linha-do-tempo` (nota até 500 caracteres; correção é nota nova com `corrige_id`).
  - Autorização: `atualizar_situacao_do_incidente` (operador, coordenador, administrador).
- **O que NÃO deve ser implementado nesta etapa:** telas (E11); relatório (E15).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/rotas/incidentes.ts`, `db/test/incidente-quadros.test.ts` (a criar).
- **Risco de segurança:** quadro adulterado muda a decisão da coordenação; sem UPDATE nem DELETE.
- **Impacto LGPD:** só contagens e texto curto; o rótulo pede para não escrever nome de pessoa.
- **Migração necessária:** Sim (`NNN_incidente_quadros.sql`, a numerar na execução).
- **Compatibilidade:** só tabela e rotas novas.
- **Rollback:** migration inversa enquanto vazia.
- **Testes positivos:** versões 1, 2 e 3 sem buraco; a linha do tempo mistura notas e versões na ordem do servidor.
- **Testes negativos:** duas escritas com a mesma `versaoAnterior`: uma 201 e outra 409; contagem negativa: 422; UPDATE e DELETE negados.
- **Testes de autorização e isolamento:** `agente_campo` escreve quadro: 403; Vale Fundo lê o quadro de Serra Alta: 404.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`; G00 a G19 e G32.
- **E2E:** `npm run test:e2e:api`: duas atualizações concorrentes.
- **Validação humana:** Alyson lê o quadro e a linha do tempo de um incidente de teste.
- **Evidência a produzir:** `docs/evidencias-v2/G29/V2-F29-E05/`.
- **Documentação a atualizar:** `dc360/docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** versão imutável, conflito tratado, ordem decidida pelo servidor.
- **Checkpoint:** Não.

### V2-F29-E06 - Equipes e turnos do incidente (INC-03, parte 1)
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E04, E05 e E09)
- **Objetivo:** alocar equipes existentes ao incidente e planejar turnos, com a disponibilidade consultável.
- **Problema que resolve:** INC-03: a coordenação precisa ver quem está disponível; hoje `equipes` só serve ao despacho de ocorrência.
- **Origem:** PR:D-15; ALY:INC-03.
- **Estado atual:** EXPANDIR (`equipes`, migração 001, fica como está).
- **Dependências de entrada:** E03.
- **O que deve ser implementado:**
  - Migration: `NNN_incidente_equipes_turnos.sql` (a numerar na execução): `incidente_equipes` (`funcao`, `alocada_em`, bloco de liberação com motivo), índice único parcial (equipe em um só incidente aberto); `incidente_turnos` (`equipe_id`, `inicio_previsto`, `fim_previsto`), sobreposição na mesma equipe recusada no banco; RLS forçada, FKs compostas, sem DELETE.
  - API: `POST /v1/incidentes/:id/equipes`, `POST .../equipes/:eid/liberar` `{motivo}`, `POST .../turnos`, `GET .../disponibilidade` (por turno: pessoas com presença aberta, sem presença, tarefas abertas).
  - Autorização: `gerenciar_incidente` escreve; leitura por operador, coordenador e administrador; o agente só vê a própria equipe.
- **O que NÃO deve ser implementado nesta etapa:** tarefas (E07); presença (E08); telas (E11); a equipe segue recebendo despacho de ocorrência normal.
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/rotas/incidentes.ts`, `db/test/incidente-equipes.test.ts` (a criar).
- **Risco de segurança:** equipe em dois incidentes mostraria disponibilidade falsa; o índice parcial impede.
- **Impacto LGPD:** Não se aplica: equipe e turno sem dado de cidadão.
- **Migração necessária:** Sim (`NNN_incidente_equipes_turnos.sql`, a numerar na execução).
- **Compatibilidade:** `equipes` e o despacho não mudam.
- **Rollback:** migration inversa enquanto vazias.
- **Testes positivos:** alocar, liberar e dois turnos seguidos (08h a 14h e 14h a 20h).
- **Testes negativos:** equipe em segundo incidente aberto: 409 `equipe_ja_alocada`; turnos sobrepostos: 409; liberar sem motivo: 422.
- **Testes de autorização e isolamento:** coordenador de Vale Fundo aloca equipe de Serra Alta: 404; agente lê a alocação de outra equipe: 404.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api` (`agente-so-ve-a-equipe`); G00 a G19 e G32.
- **E2E:** `npm run test:e2e:api`: alocar, escalar turno, liberar.
- **Validação humana:** Alyson confere a disponibilidade de um incidente de teste.
- **Evidência a produzir:** `docs/evidencias-v2/G29/V2-F29-E06/`.
- **Documentação a atualizar:** `dc360/docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** alocação e turno impostos pelo banco.
- **Checkpoint:** Não.

### V2-F29-E07 - Tarefas do incidente com eventos append-only (INC-03, parte 2)
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** médio  |  **Paralelizável:** não (E11 e E13 dependem; usa a alocação da E06)
- **Objetivo:** criar tarefas com responsável (equipe ou pessoa), prazo e estado, cujas mudanças são eventos append-only do painel ou do aparelho.
- **Problema que resolve:** INC-03: responsável por cada ação visível; o aparelho offline manda eventos fora de ordem.
- **Origem:** PR:D-15; ALY:INC-03; ALY:RN-06.
- **Estado atual:** CRIAR (molde: devolução de tarefa, migração 028).
- **Dependências de entrada:** E06.
- **O que deve ser implementado:**
  - Migration: `NNN_incidente_tarefas.sql` (a numerar na execução): `incidente_tarefas` (`titulo`, `prioridade`, `prazo_em`, responsável equipe ou usuário, exatamente um, `estado`, `ocorrencia_id` ou `local_id` opcionais); `incidente_tarefa_eventos` (`criada`, `aceita`, `iniciada`, `concluida`, `devolvida`, `cancelada`, `reatribuida`, `motivo`, `declarado_em`, `registrado_em`, chave de idempotência única); UPDATE só em `estado` e responsável; sem DELETE; `avisos_tipo_check` ganha `tarefa_de_incidente_vencida`, repetindo os valores vigentes (ordem: introdução da fase).
  - API: `POST /v1/incidentes/:id/tarefas` e `POST .../tarefas/:tid/eventos`; evento inválido para o estado atual: 409 `transicao_invalida` com o estado atual.
  - Autorização: coordenação cria, cancela e reatribui; o agente só aceita, inicia, conclui e devolve (com motivo) tarefa da sua equipe ou dele.
- **O que NÃO deve ser implementado nesta etapa:** telas (E11, E14); fila offline (E13).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/rotas/incidentes.ts`, `db/test/incidente-tarefas.test.ts` (a criar).
- **Risco de segurança:** agente alterar tarefa alheia; o servidor confere o responsável.
- **Impacto LGPD:** Não se aplica: sem dado de cidadão.
- **Migração necessária:** Sim (`NNN_incidente_tarefas.sql`, a numerar na execução).
- **Compatibilidade:** só tabelas novas e um valor novo no CHECK de avisos.
- **Rollback:** migration inversa enquanto vazias.
- **Testes positivos:** ciclo criada a concluída; a mesma chave devolve o mesmo evento; vencimento acende o sino.
- **Testes negativos:** `concluida` depois de `cancelada`: 409; responsável duplo: recusado pelo CHECK; devolver sem motivo: 422.
- **Testes de autorização e isolamento:** agente da equipe B conclui tarefa da equipe A: 404; token de Vale Fundo: 404.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`; G00 a G19 e G32.
- **E2E:** `npm run test:e2e:api`: criar, aceitar, concluir.
- **Validação humana:** Alyson percorre o ciclo de uma tarefa.
- **Evidência a produzir:** `docs/evidencias-v2/G29/V2-F29-E07/`.
- **Documentação a atualizar:** `dc360/docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** estado derivado só de eventos válidos; reenvio sem duplicar.
- **Checkpoint:** Não.

### V2-F29-E08 - Presença: check-in e check-out no servidor (INC-03, parte 3)
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E07, arquivos disjuntos)
- **Objetivo:** registrar entrada e saída do agente no incidente, idempotentes e aceitas da fila offline, sem prometer monitoramento.
- **Problema que resolve:** INC-03 pede check-in e check-out; a saída a campo (migração 031) é outro recurso e exige sinal.
- **Origem:** PR:D-15; ALY:INC-03; ALY:RN-06.
- **Estado atual:** CRIAR (molde: `saidas_a_campo`).
- **Dependências de entrada:** E06.
- **O que deve ser implementado:**
  - Migration: `NNN_incidente_presencas.sql` (a numerar na execução): `incidente_presencas` (`usuario_id`, `turno_id` opcional, entrada e saída com hora declarada e hora registrada, `ponto` e `precisao_m` opcionais, `encerrada_por` e motivo, chave de idempotência); índice único parcial: uma presença aberta por pessoa; UPDATE só nas colunas de saída.
  - API: `POST /v1/incidentes/:id/presencas` e `POST .../presencas/:pid/saida` (a pessoa vem do token, nunca do corpo); `POST .../presencas/:pid/encerrar` `{motivo}` pela coordenação; a hora do aparelho é informativa e a ordem é a do servidor.
  - Autorização: `registrar_presenca`; o agente só da equipe alocada.
  - UX: o texto diz que presença não é socorro nem monitoramento.
- **O que NÃO deve ser implementado nesta etapa:** GPS contínuo; alerta de ausência; telas (E11, E14); fila (E13).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/rotas/incidentes.ts`, `db/test/incidente-presencas.test.ts` (a criar).
- **Risco de segurança:** check-in em nome de outro.
- **Impacto LGPD:** ponto de GPS opcional e só no ato; retenção no manifesto (E16).
- **Migração necessária:** Sim (`NNN_incidente_presencas.sql`, a numerar na execução).
- **Compatibilidade:** `saidas_a_campo` intacta.
- **Rollback:** migration inversa enquanto vazia.
- **Testes positivos:** entrada e saída; a mesma chave não duplica.
- **Testes negativos:** segunda presença aberta: 409 `presenca_aberta` com a instrução de confirmar a saída; saída anterior à entrada: 422.
- **Testes de autorização e isolamento:** agente de equipe não alocada: 404; `usuario_id` de outro no corpo é ignorado.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`, `npm run test:campo`; G00 a G19 e G32.
- **E2E:** `npm run test:e2e:api`: entrar, sair, reenviar.
- **Validação humana:** Alyson aprova o texto da presença.
- **Evidência a produzir:** `docs/evidencias-v2/G29/V2-F29-E08/`.
- **Documentação a atualizar:** `dc360/docs/CARTAO-DO-AGENTE.md`.
- **Definition of Done:** presença única, idempotente e sem promessa de socorro.
- **Checkpoint:** Não.

### V2-F29-E09 - Locais e abrigos: cadastro, ocupação e necessidades (ABR-01)
- **Prioridade:** P0
- **Tamanho:** L  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com E04 a E06)
- **Objetivo:** cadastrar abrigos com capacidade, registrar ocupação em linhas append-only e manter as necessidades, só com contagens.
- **Problema que resolve:** ABR-01: capacidade declarada e atualização mais recente; hoje "desabrigados" é só contagem de vistoria (REL:09).
- **Origem:** PR:D-15; ALY:ABR-01; ALY:RN-07; ALY:LOG-01.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E01; G32.
- **O que deve ser implementado:**
  - Migration: `NNN_locais_e_abrigos.sql` (a numerar na execução): `locais` (`tipo`, `nome`, `endereco`, `ponto` da F32, `estado`, bloco de desativação com motivo); `abrigos` (`capacidade_declarada`, `situacao` `em_preparo|aberto|fechado`, `incidente_id` opcional, acessibilidade); `abrigo_ocupacoes` append-only (`total`, `criancas`, `idosos`, `pessoas_com_deficiencia`, `gestantes`, `declarada_em`, `registrada_em`, `origem`, chave de idempotência); `abrigo_necessidades` (`categoria`, `quantidade`, `unidade`, `prioridade`, `estado`).
  - API: `/v1/abrigos` (criar, editar, `POST .../desativar` `{motivo}`), `POST .../ocupacoes`, `GET .../ocupacoes` (última e histórico), `/necessidades`; ocupação acima da capacidade é aceita com a marca `acima_da_capacidade`, nunca recusada.
  - Autorização: `gerenciar_abrigo`; `atualizar_ocupacao_de_abrigo` (operador, coordenação e agente do incidente da equipe).
- **O que NÃO deve ser implementado nesta etapa:** nome ou documento de abrigado (CP-65); depósito e ponto de coleta (F30); telas (E12).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/rotas/abrigos.ts` (a criar em `apps/api/src/rotas/`), `db/test/abrigos.test.ts` (a criar).
- **Risco de segurança:** subtotais por faixa em abrigo pequeno podem identificar pessoa; só tela autenticada.
- **Impacto LGPD:** só contagens; manifesto na E16.
- **Migração necessária:** Sim (`NNN_locais_e_abrigos.sql`, a numerar na execução).
- **Compatibilidade:** só tabelas e rotas novas.
- **Rollback:** migration inversa enquanto vazias.
- **Testes positivos:** ocupação nova vira a última; reenvio da chave não duplica.
- **Testes negativos:** subtotal acima do total: 422; ocupação negativa: 422; UPDATE em ocupação e DELETE negados.
- **Testes de autorização e isolamento:** `usuario_orgao` e agente de outra equipe: 404; Vale Fundo não lê abrigo de Serra Alta.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`; G00 a G19 e G32.
- **E2E:** `npm run test:e2e:api`: cadastrar, ocupar, lotar, desativar.
- **Validação humana:** Alyson confere os campos.
- **Evidência a produzir:** `docs/evidencias-v2/G29/V2-F29-E09/`.
- **Documentação a atualizar:** `dc360/docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** abrigo se desativa e não se apaga; ocupação é histórico imutável.
- **Checkpoint:** CP-65 (pergunta se o produto deve ter cadastro nominal; fora desta fase até a resposta; bloqueia só essa ampliação).

### V2-F29-E10 - Painel: lista, criação e detalhe do incidente com agrupamento
- **Prioridade:** P1
- **Tamanho:** L  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (E11 acrescenta abas à mesma página)
- **Objetivo:** a coordenação lista, cria, detalha, agrupa e encerra incidente pela tela, nos dois modos de dados do painel.
- **Problema que resolve:** INC-01 sem tela não é usado; o painel não conhece incidente.
- **Origem:** PR:D-15; ALY:INC-01; ALY:RN-08; regra 0 de `19-definicao-de-pronto.md`.
- **Estado atual:** CRIAR (páginas) e EXPANDIR (`Ocorrencia.tsx`, `dados/`).
- **Dependências de entrada:** E04; F08-E08; F08-E13; F10-E10; F10-E11.
- **O que deve ser implementado:**
  - Frontend: `Incidentes.tsx` (filtros por estado e nível; vazio, erro e carregando) e `Incidente.tsx` (código, nível e estado com ícone e texto, comando, período, área, objetivos, ocorrências agrupadas e sugestões, encerrar com motivo em `ConfirmarAcao`); formulário com rótulos que dizem o que digitar; faixa "Faz parte do incidente X" em `Ocorrencia.tsx`.
  - Dados: funções em `dados/http.ts` e `dados/local.ts`; semente sintética em `dados/semente-da-demonstracao.sql`.
  - UX: chaves `incidente.*` do `packages/i18n`; en e es em `pendentes.json`.
  - Acessibilidade: teclado, foco ao trocar de rota e `aria-live` (F10-E11); estado nunca só por cor.
- **O que NÃO deve ser implementado nesta etapa:** quadro, equipes, tarefas (E11); abrigos (E12); tempo real.
- **Arquivos e módulos prováveis:** `apps/web/src/paginas/Incidentes.tsx` e `Incidente.tsx` (a criar em `apps/web/src/paginas/`), `App.tsx`, `dados/http.ts`, `dados/local.ts`, `apps/web/test/incidentes.test.ts` (a criar).
- **Risco de segurança:** botão escondido não é controle; a rota decide.
- **Impacto LGPD:** a tela mostra protocolo, nunca dado do solicitante.
- **Migração necessária:** Não.
- **Compatibilidade:** painel atual intacto.
- **Rollback:** reverter o commit.
- **Testes positivos:** criar, agrupar duas ocorrências, encerrar; `paridade-dos-modos.test.ts` verde.
- **Testes negativos:** encerrar sem motivo bloqueado na tela e no servidor; 409 vira frase que diz o que fazer; sem rolagem horizontal em 320 px.
- **Testes de autorização e isolamento:** operador não vê "Novo incidente" e a chamada direta dá 403; incidente de Vale Fundo na URL de Serra Alta: "Não encontrado".
- **Regressão obrigatória:** `npm run test:e2e`, `npm test`, `npm run typecheck`, `npm run test:scripts`; G00 a G19 e G32.
- **E2E:** criar incidente, agrupar, encerrar, com `apps/web/test/incidentes.e2e.mjs` (a criar).
- **Validação humana:** Rafael aprova as capturas.
- **Evidência a produzir:** `docs/evidencias-v2/G29/V2-F29-E10/capturas/` com `INDEX.md`.
- **Documentação a atualizar:** `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** fluxo completo na tela e portão visual aprovado.
- **Checkpoint:** Não.

### V2-F29-E11 - Painel: quadro, linha do tempo, equipes, turnos, tarefas e disponibilidade
- **Prioridade:** P1
- **Tamanho:** L  |  **Complexidade:** alta  |  **Risco:** médio  |  **Paralelizável:** não (mesma página da E10)
- **Objetivo:** operar o incidente em andamento: quadro, linha do tempo, equipes, turnos, tarefas e disponibilidade.
- **Problema que resolve:** INC-02 e INC-03: sem tela, o quadro e a coordenação continuam em papel e mensagem.
- **Origem:** PR:D-15; ALY:INC-02; ALY:INC-03; regra 0 de `19-definicao-de-pronto.md`.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E05; E07; E08; E10.
- **O que deve ser implementado:**
  - Frontend: abas em `Incidente.tsx`: Quadro (versão atual e histórico; nova versão; no conflito 409 mostra a versão atual e pede reaplicar), Linha do tempo (notas e versões), Equipes e turnos (grade por dia; alocar e liberar com motivo), Tarefas (por estado; criar, reatribuir, cancelar) e Disponibilidade (presença aberta; encerrar presença esquecida com motivo).
  - Atualização: botão Atualizar e consulta a cada 30 segundos, com "atualizado às HH:MM" no fuso do município (F08-E09); sem tempo real.
  - UX e acessibilidade: chaves `incidente.*`; tarefa vencida com ícone e texto; foco devolvido ao fechar o formulário.
- **O que NÃO deve ser implementado nesta etapa:** relatório (E15); fila do aparelho (E13).
- **Arquivos e módulos prováveis:** `apps/web/src/paginas/Incidente.tsx`, `apps/web/src/componentes/` (componentes novos), `dados/http.ts`, `dados/local.ts`, `apps/web/test/incidente-operacao.test.ts` (a criar).
- **Risco de segurança:** conflito mal tratado apaga a versão do colega.
- **Impacto LGPD:** Não se aplica: sem dado de cidadão.
- **Migração necessária:** Não.
- **Compatibilidade:** só telas novas.
- **Rollback:** reverter o commit.
- **Testes positivos:** nova versão do quadro, alocar equipe, criar e concluir tarefa, ver a presença.
- **Testes negativos:** duas abas com a mesma versão: a segunda vê o 409 e a versão atual; turno sobreposto recusado em frase clara.
- **Testes de autorização e isolamento:** operador sem botões de alocar e cancelar, e a chamada direta dá 403; Serra Alta não vê equipe de Vale Fundo.
- **Regressão obrigatória:** `npm run test:e2e`, `npm test`, `npm run test:scripts`; G00 a G19 e G32.
- **E2E:** `incidentes.e2e.mjs`: atualizar quadro em duas abas, alocar, tarefa, presença.
- **Validação humana:** Alyson opera um incidente de teste.
- **Evidência a produzir:** `docs/evidencias-v2/G29/V2-F29-E11/capturas/` com `INDEX.md`.
- **Documentação a atualizar:** `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** operação completa na tela e portão visual aprovado.
- **Checkpoint:** Não.

### V2-F29-E12 - Painel: abrigos, ocupação, necessidades e camada no mapa
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E11, arquivos disjuntos)
- **Objetivo:** cadastrar e acompanhar abrigos: capacidade declarada, ocupação mais recente com sua data, histórico, necessidades e posição no mapa.
- **Problema que resolve:** ABR-01: o painel mostra a capacidade declarada e a atualização mais recente.
- **Origem:** PR:D-15; ALY:ABR-01; regra 0 de `19-definicao-de-pronto.md`.
- **Estado atual:** CRIAR (páginas) e EXPANDIR (`Mapa.tsx`).
- **Dependências de entrada:** E09; F08-E13.
- **O que deve ser implementado:**
  - Frontend: `Abrigos.tsx` (lista) e `Abrigo.tsx` (ficha): capacidade e ocupação em número e texto ("42 de 60") com barra e, acima da capacidade, ícone e texto; "atualizada há X" com a hora absoluta e aviso se passou de N horas (padrão 12, configurável por município); histórico; necessidades (abrir, atender, cancelar); desativar com motivo.
  - Mapa: camada "abrigos" em `Mapa.tsx`, ícone distinto e filtro, sem usar cor de severidade.
  - UX: chaves `abrigo.*` no `packages/i18n`, en e es em `pendentes.json`; rótulo de necessidade diz "não escreva nomes de pessoas".
- **O que NÃO deve ser implementado nesta etapa:** cadastro nominal; depósito e ponto de coleta (F30-E12).
- **Arquivos e módulos prováveis:** `apps/web/src/paginas/Abrigos.tsx` e `Abrigo.tsx` (a criar em `apps/web/src/paginas/`), `Mapa.tsx`, `dados/http.ts`, `dados/local.ts`.
- **Risco de segurança:** subtotal por faixa aparece só a quem tem `gerenciar_abrigo` ou `atualizar_ocupacao_de_abrigo`.
- **Impacto LGPD:** só contagens; nenhum campo de nome.
- **Migração necessária:** Não.
- **Compatibilidade:** o mapa atual mantém as camadas.
- **Rollback:** reverter o commit.
- **Testes positivos:** ocupar, lotar, ver a ocupação anterior no histórico, desativar com motivo.
- **Testes negativos:** ocupação acima da capacidade aparece com alerta e é aceita; desativar sem motivo bloqueado; 320 px sem corte.
- **Testes de autorização e isolamento:** Serra Alta não vê abrigo de Vale Fundo no mapa nem por URL; `usuario_orgao`: "Não encontrado".
- **Regressão obrigatória:** `npm run test:e2e`, `npm test`, `npm run test:scripts`; G00 a G19 e G32.
- **E2E:** `incidentes.e2e.mjs`: cadastrar abrigo, ocupar, ver no mapa.
- **Validação humana:** Alyson confere os rótulos e o aviso de desatualização.
- **Evidência a produzir:** `docs/evidencias-v2/G29/V2-F29-E12/capturas/` com `INDEX.md`.
- **Documentação a atualizar:** `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** abrigo completo na tela, nos dois temas, sem desalinhamento.
- **Checkpoint:** Não.

### V2-F29-E13 - App do agente, núcleo offline: presença, ocupação e evento de tarefa na fila
- **Prioridade:** P0
- **Tamanho:** L  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (E14 e F30-E14 usam o que esta etapa generaliza)
- **Objetivo:** a fila leva presença, ocupação e evento de tarefa sem duplicar nem perder; o aparelho guarda o recorte do incidente.
- **Problema que resolve:** `TipoDoItem` só tem `vistoria` e `devolucao` (`packages/campo/src/tipos.ts:161`) e `ItemBase` exige `ocorrenciaId`.
- **Origem:** PR:D-15; ALY:INC-03; ALY:ABR-01; ALY:RN-06; ALY:RNF-03.
- **Estado atual:** EXPANDIR (o motor offline é MANTIDO).
- **Dependências de entrada:** E07; E08; E09; F14-E03; F14-E04.
- **O que deve ser implementado:**
  - Mobile: `tipos.ts` ganha `presenca`, `ocupacao` e `evento_de_tarefa`; `ItemBase` ganha `alvo` (item antigo vira ocorrência); `deposito-sqlite.ts` sobe a versão do esquema local sem perder item em voo; `fila.ts` drena por autor na ordem (saída só depois da entrada), trata `duplicada` como entregue, arquiva `incidente_encerrado` com aviso e leva `transicao_invalida` à revisão da F14-E03.
  - API: `POST /v1/sincronizacao/presenca`, `/ocupacao` e `/tarefa-evento` (Zod no shared, `exigirPermissao`, recorte, chave do item; repetição devolve a primeira resposta); `GET /v1/campo/incidentes`: incidente da equipe, tarefas e abrigos, sem dado de cidadão.
- **O que NÃO deve ser implementado nesta etapa:** telas (E14); estoque e entrega (F30-E14).
- **Arquivos e módulos prováveis:** `packages/campo/src/tipos.ts`, `fila.ts`, `deposito-sqlite.ts`, `apps/api/src/rotas/sincronizacao.ts`.
- **Risco de segurança:** perder item em voo na migração local; vazar incidente de outra equipe.
- **Impacto LGPD:** só dados da equipe, cifrados (F14-E04); o logout limpa o recorte e preserva item não sincronizado.
- **Migração necessária:** Não (o esquema local tem versão própria).
- **Compatibilidade:** item antigo segue legível (versão mínima, F02-E06).
- **Rollback:** reverter o commit.
- **Testes positivos:** três itens sem sinal sobem na volta; resposta perdida reenvia a chave e recebe `duplicada`.
- **Testes negativos:** incidente encerrado offline: item arquivado com aviso; `concluida` após `cancelada`: conflito; 401 não perde item (F00-E06).
- **Testes de autorização e isolamento:** agente da equipe B envia presença no incidente da A: 404.
- **Regressão obrigatória:** `npm run test:campo`, `npm run test:api`, `npm run test:isolamento`; G00 a G19.
- **E2E:** `npm run test:e2e:api`: sem sinal, três itens, reconectar, uma linha de cada.
- **Validação humana:** Rafael corta o sinal no simulador.
- **Evidência a produzir:** `docs/evidencias-v2/G29/V2-F29-E13/`.
- **Documentação a atualizar:** `apps/campo/LEIA-ME.md`.
- **Definition of Done:** itens novos sobem sem duplicar; os antigos seguem intactos.
- **Checkpoint:** Não.

### V2-F29-E14 - App do agente: telas de incidente, tarefas, presença e abrigo
- **Prioridade:** P1
- **Tamanho:** L  |  **Complexidade:** alta  |  **Risco:** médio  |  **Paralelizável:** não (depende da E13)
- **Objetivo:** o agente vê o incidente, conclui tarefas, faz check-in e check-out e atualiza a ocupação de um abrigo, com a fila visível.
- **Problema que resolve:** INC-03 e ABR-01 no campo: sem tela, o servidor da E13 não é usado.
- **Origem:** PR:D-15; ALY:INC-03; ALY:ABR-01; ALY:VIS-07; regra 0 de `19-definicao-de-pronto.md`.
- **Estado atual:** CRIAR (telas) e EXPANDIR (`(agente)/index.tsx`).
- **Dependências de entrada:** E13; F14-E10; F14-E17.
- **O que deve ser implementado:**
  - Mobile: `incidente.tsx` (nível com ícone e texto; tarefas: aceitar, iniciar, concluir, devolver com motivo; check-in e check-out) e `abrigo/[id].tsx` (total e faixas); atalho em `index.tsx`; abrigo no mapa do app.
  - UX: chip da fila em cada ação (`resumo-da-fila.ts`); estados sem incidente, sem equipe (F14-E17), sem sinal e "dados de HH:MM"; texto "Presença não é pedido de socorro".
  - Acessibilidade: alvo de 44 pt (48 no Android), fonte 200% (F14-E10), estado nunca só por cor; chaves `incidente.*` e `abrigo.*` do `packages/i18n`, en e es em `pendentes.json`.
- **O que NÃO deve ser implementado nesta etapa:** push de tarefa nova; telas de estoque (F30-E15).
- **Arquivos e módulos prováveis:** `apps/campo/src/app/(agente)/incidente.tsx` e `abrigo/[id].tsx` (a criar em `apps/campo/src/app/(agente)/`), `src/dados/`.
- **Risco de segurança:** ocupação de abrigo alheio; o servidor recusa.
- **Impacto LGPD:** Não se aplica: só contagens e tarefas.
- **Migração necessária:** Não.
- **Compatibilidade:** abas atuais intactas.
- **Rollback:** reverter o commit.
- **Testes positivos:** jest: check-in sem sinal mostra "aguardando sinal" e vira "enviado" na volta.
- **Testes negativos:** segundo check-in mostra a instrução de dar a saída; devolver sem motivo bloqueado.
- **Testes de autorização e isolamento:** agente da equipe B não vê o incidente da A; sem equipe vê a mensagem, não tela vazia.
- **Regressão obrigatória:** `npm run test:campo`, `npm run typecheck`; G00 a G19.
- **E2E:** roteiro por simulador e aparelho (F08-E13): sinal perdido, três ações, reconexão.
- **Validação humana:** foto do aparelho físico em uso.
- **Evidência a produzir:** `docs/evidencias-v2/G29/V2-F29-E14/capturas/` com `INDEX.md`.
- **Documentação a atualizar:** `dc360/docs/CARTAO-DO-AGENTE.md`.
- **Definition of Done:** fluxo no aparelho com fila visível e portão visual aprovado.
- **Checkpoint:** Não.

### V2-F29-E15 - Relatório de situação por período, imutável e com PDF guardado (INC-04)
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** médio  |  **Paralelizável:** não (E16 e E17 dependem dele)
- **Objetivo:** emitir o relatório de situação de um período (ocorrências, ações, recursos e pendências) como documento imutável com PDF guardado.
- **Problema que resolve:** INC-04; `documentos_emitidos` é por ocorrência (F09-E03).
- **Origem:** PR:D-15; PR:D-05; ALY:INC-04; ALY:DOC-03.
- **Estado atual:** CRIAR (molde: F09-E02 e F09-E05).
- **Dependências de entrada:** E05; E09; F09-E02; F09-E05; F09-E14.
- **O que deve ser implementado:**
  - Migration: `NNN_incidente_relatorios.sql` (a numerar na execução): `incidente_relatorios` append-only (`versao`, período, `snapshot`, `hash_snapshot`, `versao_modelo`, `chave_pdf`, `sha256_pdf`, `marca_dagua`, emissor, `substitui_id`); sem UPDATE e DELETE.
  - API: `POST /v1/incidentes/:id/relatorios` `{inicio, fim}` monta pelo montador único (ocorrências sem solicitante, tarefas, equipes, presenças, abrigos, quadros, pendências); `GET` lista e `GET .../:rid/pdf` serve o PDF guardado; mesmo período de novo é versão nova.
  - Frontend: aba Relatórios em `Incidente.tsx`, com capturas.
  - Autorização: `emitir_relatorio_de_situacao` (coordenador, administrador); marca d'água pela F09-E14; a seção de estoque entra na F30-E16.
- **O que NÃO deve ser implementado nesta etapa:** aprovação autenticada e assinatura (F09); envio ao S2ID (F31).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/documentos/relatorio-de-situacao.ts` (a criar), `rotas/incidentes.ts`, `Incidente.tsx`.
- **Risco de segurança:** dado de cidadão no PDF.
- **Impacto LGPD:** sem nome nem contato de solicitante; snapshot classificado na E16.
- **Migração necessária:** Sim (`NNN_incidente_relatorios.sql`, a numerar na execução).
- **Compatibilidade:** `documentos_emitidos` intacta.
- **Rollback:** migration inversa se vazia.
- **Testes positivos:** período de dois dias gera a versão 1; a reimpressão devolve o mesmo PDF (hash igual) mesmo após mudanças no incidente.
- **Testes negativos:** período invertido: 422; nome sintético do solicitante ausente do PDF; UPDATE e DELETE negados.
- **Testes de autorização e isolamento:** operador emite: 403; Vale Fundo baixa o PDF de Serra Alta: 404.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:isolamento`, `npm run test:e2e`; G00 a G19 e G32.
- **E2E:** `npm run test:e2e:api`: emitir e comparar o hash.
- **Validação humana:** Alyson lê o PDF de um incidente de teste.
- **Evidência a produzir:** `docs/evidencias-v2/G29/V2-F29-E15/` (PDF sintético, hashes, capturas).
- **Documentação a atualizar:** `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** relatório imutável e reproduzível.
- **Checkpoint:** CP-64 (conteúdo, periodicidade, quem assina, aprovação autenticada; padrão: emissão pela coordenação com marca d'água); bloqueia o uso oficial.

### V2-F29-E16 - Manifesto de dados, retenção, saída e eliminação das tabelas de incidente e abrigo
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** sim (com E17)
- **Objetivo:** classificar as tabelas novas no manifesto e provar que a saída e a eliminação do município as incluem.
- **Problema que resolve:** o manifesto da F05 reprova tabela sem classificação; saída e eliminação derivam dele (F05-E05).
- **Origem:** PR:D-15; DP:T41; ALY:RN-01; ALY:RN-07; ALY:RNF-12.
- **Estado atual:** EXPANDIR (manifesto da F05 MANTIDO).
- **Dependências de entrada:** E15; F05-E03; F05-E05; F05-E09; F05-E11.
- **O que deve ser implementado:**
  - Manifesto: `db/src/manifesto.ts`: entradas para `incidentes`, objetivos, vínculo, eventos, quadros, equipes, turnos, tarefas, eventos de tarefa, presenças (hora e ponto de GPS de servidor: pessoal), `locais`, `abrigos`, ocupações, necessidades e relatórios (`snapshot`), cada uma com sai, apaga, pessoal e retenção `a_decidir` (CP-10).
  - Retenção: classes novas por município (F05-E09); presença e ponto de agente ficam fora da minimização por prazo do cidadão (razão da `observacao` da migração 031).
  - Auditoria: consulta ao ponto de GPS da presença gera registro nominal (F05-E11); pacote de saída e eliminação ganham as tabelas.
- **O que NÃO deve ser implementado nesta etapa:** retenção ativa (depende de CP-10); tabelas de logística (F30-E17).
- **Arquivos e módulos prováveis:** `db/src/manifesto.ts`, `apps/api/src/saida/pacote.ts`, `apps/api/test/saida-de-municipio.test.ts`, `eliminacao-de-municipio.test.ts`.
- **Risco de segurança:** tabela fora do manifesto fica fora da saída e da eliminação.
- **Impacto LGPD:** classificação e retenção do ponto de agente; nada de dado de abrigado.
- **Migração necessária:** Não.
- **Compatibilidade:** o pacote antigo continua válido; ganha arquivos.
- **Rollback:** reverter o commit.
- **Testes positivos:** pacote do município A traz incidentes, quadros, tarefas, presenças e abrigos; a eliminação remove tudo isso.
- **Testes negativos:** tabela nova sem classificação reprova o teste de catálogo (F05-E02); o pacote de A não contém linha de B.
- **Testes de autorização e isolamento:** eliminar Serra Alta deixa Vale Fundo intacto, com contagens iguais antes e depois.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`; G00 a G19 e G05.
- **E2E:** `npm run test:e2e:api`: saída e eliminação de município de teste com incidente.
- **Validação humana:** Rafael abre o pacote de teste e confere os arquivos.
- **Evidência a produzir:** `docs/evidencias-v2/G29/V2-F29-E16/`.
- **Documentação a atualizar:** `dc360/docs/SAIDA-DE-MUNICIPIO.md`, `dc360/docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** nenhuma tabela da F29 sem classificação; saída e eliminação provadas.
- **Checkpoint:** Não.

### V2-F29-E17 - Isolamento entre municípios, equipes e papéis em todas as rotas e tabelas da F29
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** crítico  |  **Paralelizável:** sim (com E16)
- **Objetivo:** provar por teste que nenhuma tabela ou rota da F29 vaza entre municípios, entre equipes ou a papel sem a ação.
- **Problema que resolve:** CA-06 e a regra número um: cada tabela nova é uma superfície nova.
- **Origem:** PR:D-15; ALY:RN-01; ALY:AUT-01; BZ-M:V2-SEC-08.
- **Estado atual:** EXPANDIR (`db/test/isolamento.test.ts` MANTIDO como portão).
- **Dependências de entrada:** E15; F03-E13; F03-E14.
- **O que deve ser implementado:**
  - Banco: `db/test/incidentes-isolamento.test.ts` (a criar): cada tabela da F29 com RLS ativada e forçada, policy fail-closed, FK composta; sem contexto, zero linhas; INSERT de A com `organizacao_id` de B recusado; nenhuma função nova SECURITY DEFINER.
  - API: a matriz da F03-E13 ganha as rotas novas; `recorte-fail-closed.test.ts` ganha: `usuario_orgao` e papel fora da lista em toda rota de incidente e abrigo: 404; IDs cruzados (tarefa de A com incidente de B): 404; agente da equipe B em incidente, tarefa, presença e abrigo da A: 404.
- **O que NÃO deve ser implementado nesta etapa:** correção de falha achada (vira etapa da própria tabela); RLS por equipe no banco (o recorte do agente segue na API).
- **Arquivos e módulos prováveis:** `db/test/incidentes-isolamento.test.ts` (a criar), `apps/api/test/recorte-fail-closed.test.ts`, `apps/api/test/incidentes.test.ts`.
- **Risco de segurança:** rota nova fora do manifesto cai em default deny; o teste a revela.
- **Impacto LGPD:** Não se aplica: teste sem dado real.
- **Migração necessária:** Não.
- **Compatibilidade:** só testes.
- **Rollback:** reverter o commit.
- **Testes positivos:** cada papel faz o que a matriz permite em Serra Alta.
- **Testes negativos:** coordenador de Vale Fundo em qualquer ID de Serra Alta: 404; sem token: 401; ação fora do papel: 403.
- **Testes de autorização e isolamento:** esta etapa É o teste; `npm run test:isolamento` falha se uma tabela da F29 faltar.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`, `npm run test:e2e:api`; G00 a G19 e G32.
- **E2E:** `npm run test:e2e:api` com dois municípios de teste em paralelo.
- **Validação humana:** Rafael roda o teste e vê o resultado.
- **Evidência a produzir:** `docs/evidencias-v2/G29/V2-F29-E17/` (saída do teste e matriz).
- **Documentação a atualizar:** `dc360/docs/PAPEIS_E_RESPONSABILIDADES.md`.
- **Definition of Done:** matriz completa e zero vazamento entre municípios.
- **Checkpoint:** Não.

### V2-F29-E18 - E2E do fluxo de ativação de emergência e prova em aparelho físico
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (fecha a fase)
- **Objetivo:** provar de ponta a ponta o fluxo de ativação de emergência (ALY:§5.2), do painel ao aparelho sem sinal e de volta.
- **Problema que resolve:** nenhuma etapa isolada prova o fluxo; a regra de Rafael exige E2E e capturas antes de avançar.
- **Origem:** PR:D-15; ALY:§5.2; regra 0 de `19-definicao-de-pronto.md`.
- **Estado atual:** CRIAR (cenário novo; os fluxos A a N não mudam).
- **Dependências de entrada:** E10 a E17.
- **O que deve ser implementado:**
  - Fluxo: coordenador cria o incidente; agrupa duas ocorrências; aloca equipe e turno; cria tarefa; agente (aparelho físico, sem sinal) faz check-in, aceita a tarefa e atualiza a ocupação de um abrigo; reconecta; o painel mostra tudo uma vez só; coordenação atualiza o quadro, emite o relatório e encerra.
  - Provas: `apps/web/test/incidentes.e2e.mjs`, cenário novo em `scripts/e2e-api.mjs`, capturas do painel e foto do aparelho (Android e iOS, F14-E12), dois municípios em paralelo.
- **O que NÃO deve ser implementado nesta etapa:** correção de defeito achado (volta à etapa dona); logística (F30-E18).
- **Arquivos e módulos prováveis:** `apps/web/test/incidentes.e2e.mjs` (a criar), `scripts/e2e-api.mjs`, `docs/evidencias-v2/G29/`.
- **Risco de segurança:** dado real em captura; só dado sintético.
- **Impacto LGPD:** Não se aplica: dados sintéticos.
- **Migração necessária:** Não.
- **Compatibilidade:** só testes.
- **Rollback:** reverter o commit.
- **Testes positivos:** o fluxo inteiro termina com uma linha de cada item (sem duplicata) e RN-08 intacta.
- **Testes negativos:** a reconexão repetida não duplica; incidente encerrado com o aparelho offline arquiva o item com aviso.
- **Testes de autorização e isolamento:** dado de Vale Fundo não aparece nas capturas de Serra Alta.
- **Regressão obrigatória:** `npm run verificar`, `npm run test:e2e`, `npm run test:e2e:api`; G00 a G19 e G32.
- **E2E:** o próprio fluxo.
- **Validação humana:** Rafael e Alyson assistem ao fluxo no aparelho físico.
- **Evidência a produzir:** `docs/evidencias-v2/G29/V2-F29-E18/` (saídas, capturas com `INDEX.md`, fotos, vídeo curto sem dado real).
- **Documentação a atualizar:** `dc360/README.md`, `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** fluxo verde, evidência arquivada, portão visual aprovado.
- **Checkpoint:** Não.

# GATE G29 - INCIDENTES E ABRIGOS
Só passa se:
- [ ] (E01) a ADR do modo incidente está aprovada e as ações novas estão no `shared` e no manifesto rota x ação, com os checkpoints CP-62 e CP-63 decididos, ou o padrão proposto aceito por escrito com o uso em produção bloqueado. Evidência: `docs/evidencias-v2/G29/V2-F29-E01/`.
- [ ] (E02, E03) as tabelas do incidente existem com RLS forçada e FKs compostas, o ciclo de vida só anda pelas arestas, encerrado é terminal e nada se apaga. Evidência: E02 e E03.
- [ ] (E04) RN-08 provada: hash da ocorrência, da trilha, das vistorias e dos documentos idêntico antes e depois de agrupar e desagrupar; encerrar o incidente não encerra ocorrência. Evidência: E04.
- [ ] (E05 a E08) quadro versionado com conflito 409, equipes e turnos sem sobreposição, tarefas por eventos append-only e presença única e idempotente, com o texto de que presença não é socorro. Evidência: E05 a E08.
- [ ] (E09) abrigo com capacidade, ocupação em histórico imutável e necessidades, só com contagens; CP-65 respondido ou registrado como não decidido. Evidência: E09.
- [ ] (E10, E11, E12) as telas do painel funcionam nos dois modos de dados, com capturas (320, 768 e 1280 px, claro e escuro, quatro estados) e o portão visual aprovado por Rafael. Evidência: E10, E11, E12.
- [ ] (E13, E14) o app leva presença, ocupação e evento de tarefa pela fila sem duplicar nem perder item (inclusive migrando a base local com item em voo), com foto do aparelho físico. Evidência: E13, E14.
- [ ] (E15) o relatório de situação é imutável, reimprimível com o mesmo hash e sem dado de solicitante; CP-64 decidido ou adiado com o uso oficial bloqueado. Evidência: E15.
- [ ] (E16, E17) o manifesto classifica toda tabela nova, saída e eliminação as incluem e o isolamento entre municípios, equipes e papéis está provado, com `npm run test:isolamento` verde. Evidência: E16, E17.
- [ ] (E18) o fluxo de ativação de emergência passa de ponta a ponta com o aparelho físico. Evidência: E18.
- [ ] nenhuma regressão: G00 a G19 e G32 continuam verdes (se um quebrar, ESTE gate volta a REPROVADO).
- [ ] documentação atualizada e evidências arquivadas em `docs/evidencias-v2/G29/`.

**Reabre se:** uma rota ou migration da F29 escrever em `ocorrencias`; tabela da fase ficar sem RLS forçada ou sem classificação no manifesto; agrupar alterar autoria, data, documento ou histórico de ocorrência; o aparelho duplicar ou perder presença, ocupação ou evento de tarefa; a tela prometer socorro ou monitoramento; tela do painel ou do app fechar sem capturas; função SECURITY DEFINER nova aparecer; G00 a G19 ou G32 reabrir.

**Este Gate libera:** F30 (a logística reusa `locais`, a fila generalizada e o relatório de situação), F31 (integrações que consomem incidente e abrigo), F20 em diante (o console e as métricas passam a conhecer os módulos novos) e o plano de piloto (F26 a F28) com o modo incidente.

# Fase 30: Logística humanitária

**Gate da fase:** G30 LOGÍSTICA HUMANITÁRIA | **Depende dos gates:** G00 a G19, G32 e G29 na ordem de execução (o imediato é G29) | **Superfícies tocadas:** `apps/api`, `db`, `packages/shared`, `packages/i18n`, `apps/web` (painel), `packages/campo` e `apps/campo` (app do agente, offline) | **Checkpoints da fase:** CP-66, CP-67, CP-68, CP-69, CP-70, CP-71, CP-72 (e CP-63, aberto na F29)

Objetivo: a logística humanitária 365 do fluxo de suprimentos (ALY:§5.3): depósitos e pontos de coleta, itens, lotes e validade, um razão de movimentos de onde o saldo é derivado (RN-09: o saldo é a soma dos movimentos e o ajuste é um movimento com motivo e aprovação), leitura de QR code e de código de barras com entrada manual sempre possível, comparação entre necessidade, estoque e promessa de doação, cargas, rotas e comprovante de entrega, e kits permanentes com inventário e simulados (LOG-01 a LOG-07), no painel e no app do agente offline. Hoje não existe tabela de local, item, lote, movimento nem entrega (REL:09, REQ-042 a REQ-048).

O que se PRESERVA (MANTER): `locais`, a fila generalizada e o relatório de situação da F29 (EXPANDIR); o motor offline `packages/campo`; a regra de prova do app (foto de entrega nunca é recodificada); a RLS forçada; a trilha append-only.

O que a fase NÃO faz: integração com ERP, nota fiscal ou sistema de doações (F31 e fora da V2); roteirização automática por mapa (a rota é a sequência de paradas escrita pela coordenação); previsão de demanda; medicamento e outros itens controlados (CP-68); cadastro de doador como relacionamento; tempo real; ver `docs/roadmap-v2/21-fora-da-v2.md`.

Ordem sugerida: E01; E02 e E03 depois da E01 (migrations próprias, numerar em sequência); E04 depois de ambas; E05, E06, E07 e E08 depois da E04; E09 depois da E05; E10 depois da E06; E11 depois da E06; E12 depois da E07; E13 depois da E08 a E12; E14 depois da E09 e da E10; E15 depois da E07 e da E14; E16 depois da E13; E17 e E18 por último. REGRA DE PROVA: toda etapa de tela (E12, E13, E15) fecha só com capturas, E2E e o portão visual de `docs/roadmap-v2/19-definicao-de-pronto.md` (seção 0) e da F08 (`V2-F08-E13`); textos por chave `logistica.*` do `packages/i18n`, en e es em `pendentes.json`; nenhuma função SECURITY DEFINER nova.

## Etapas

### V2-F30-E01 - ADR do razão de estoque: saldo derivado, ajuste aprovado e política do offline
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (E02 em diante usam o que a ADR fixa)
- **Objetivo:** fixar por escrito o razão de movimentos, o saldo derivado, o ajuste aprovado e a política do offline antes de qualquer tabela de estoque.
- **Problema que resolve:** RN-09: sem decisão escrita, a primeira tela criaria uma coluna `saldo` editável.
- **Origem:** PR:D-15; ALY:RN-09; ALY:LOG-04; ALY:RN-06.
- **Estado atual:** CRIAR (ADR nova; a ADR da F29 é MANTIDA).
- **Dependências de entrada:** G29.
- **O que deve ser implementado:**
  - Documentação: ADR em `docs/adr/` (número a atribuir): saldo nunca é coluna, é a view `estoque_saldos` (`security_invoker`) sobre os movimentos; correção é movimento novo; saldo negativo recusado online (409 `saldo_insuficiente`) e ACEITO se vem da fila do aparelho, marcado `divergencia` com alerta, porque a entrega já aconteceu no mundo físico; ajuste só com pedido e aprovação de outra pessoa; lote vencido só sai por ajuste de descarte.
  - Domínio: `packages/shared/src/logistica.ts` (a criar): tipos de movimento e sinais; ações em `permissoes.ts`: `gerenciar_locais_de_logistica`, `gerenciar_catalogo_de_itens`, `registrar_movimento_de_estoque`, `aprovar_ajuste_de_estoque`, `registrar_entrega`, `gerenciar_doacoes_e_necessidades`, `gerenciar_kits_e_inventario`.
- **O que NÃO deve ser implementado nesta etapa:** tabelas e rotas (E02 em diante).
- **Arquivos e módulos prováveis:** `docs/adr/` (nova), `packages/shared/src/logistica.ts` (a criar), `permissoes.ts`.
- **Risco de segurança:** saldo editável permite fraude de estoque sem rastro.
- **Impacto LGPD:** Não se aplica: decisão sem dado.
- **Migração necessária:** Não.
- **Compatibilidade:** os quatro papéis atuais não mudam.
- **Rollback:** reverter o commit.
- **Testes positivos:** `packages/shared/test/logistica-permissoes.test.ts` (a criar): papéis esperados por ação.
- **Testes negativos:** ação fora do manifesto reprova; `agente_campo` sem `aprovar_ajuste_de_estoque`.
- **Testes de autorização e isolamento:** Não se aplica: sem dado; a matriz é provada na E17.
- **Regressão obrigatória:** `npm run typecheck`, `npm test`, `npm run test:isolamento`; G00 a G19, G32 e G29.
- **E2E:** Não se aplica: sem fluxo.
- **Validação humana:** Rafael e Alyson leem a ADR.
- **Evidência a produzir:** `docs/evidencias-v2/G30/V2-F30-E01/`.
- **Documentação a atualizar:** `dc360/docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** ADR aprovada; ações no shared; nenhuma tabela.
- **Checkpoint:** CP-66 (aceitar entrega offline que zera ou negativa o saldo, como divergência) e CP-67 (quem aprova e se há limite); o padrão proposto libera o desenvolvimento; produção fica bloqueada.

### V2-F30-E02 - Locais de logística: depósitos, pontos de coleta, horário, responsáveis e permissões (LOG-01)
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E03)
- **Objetivo:** cadastrar depósito e ponto de coleta com geografia, horário e responsáveis, estendendo `locais` da F29.
- **Problema que resolve:** LOG-01: locais com geografia, horário e permissões; hoje só o abrigo existe (F29-E09).
- **Origem:** PR:D-15; ALY:LOG-01; ALY:RN-07.
- **Estado atual:** EXPANDIR (`locais` da F29-E09).
- **Dependências de entrada:** G29; F03-E06.
- **O que deve ser implementado:**
  - Migration: `NNN_locais_de_logistica.sql` (a numerar na execução): `locais` ganha `codigo` e `contato_institucional`; `local_horarios` (`dia_semana`, `abre`, `fecha`); `local_responsaveis` (`usuario_id`, `papel_no_local` `responsavel|operador_de_estoque|leitura`, `desde`, `ate`); RLS forçada, FKs compostas, UPDATE só no fim do vínculo, sem DELETE.
  - API: `/v1/locais` (criar, editar, `POST .../desativar` `{motivo}`), `.../horarios`, `.../responsaveis`; `GET` com "aberto agora" no fuso do município (F08-E09).
  - Autorização: `gerenciar_locais_de_logistica` (coordenador, administrador); o agente só vê local em que tem vínculo vigente.
- **O que NÃO deve ser implementado nesta etapa:** movimento e saldo (E04); telas (E12); o abrigo continua pela F29-E09.
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/rotas/locais.ts` (a criar em `apps/api/src/rotas/`), `db/test/locais-de-logistica.test.ts` (a criar).
- **Risco de segurança:** vínculo de responsável define quem movimenta estoque; sem DELETE e com trilha.
- **Impacto LGPD:** responsável é usuário já existente; contato é institucional, nunca pessoal.
- **Migração necessária:** Sim (`NNN_locais_de_logistica.sql`, a numerar na execução).
- **Compatibilidade:** abrigos da F29 intactos.
- **Rollback:** migration inversa se as tabelas novas estiverem vazias.
- **Testes positivos:** criar depósito, horário de segunda a sexta, vínculo de responsável.
- **Testes negativos:** horário com `fecha` antes de `abre`: 422; desativar sem motivo: 422; vínculo com usuário de outro município recusado pela FK.
- **Testes de autorização e isolamento:** agente sem vínculo lista zero locais e recebe 404 no detalhe; Vale Fundo não lê local de Serra Alta.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`; G00 a G19 e G29.
- **E2E:** `npm run test:e2e:api`: criar, vincular, desativar.
- **Validação humana:** Alyson confere os campos de um depósito de teste.
- **Evidência a produzir:** `docs/evidencias-v2/G30/V2-F30-E02/`.
- **Documentação a atualizar:** `dc360/docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** local se desativa e não se apaga; vínculo temporal imposto pelo banco.
- **Checkpoint:** CP-63 (decidido na F29-E01; aqui define quem pode ser responsável de depósito).

### V2-F30-E03 - Catálogo: categorias, itens, unidades e lotes (LOG-02, modelo)
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E02)
- **Objetivo:** cadastrar categoria, item e lote com os campos obrigatórios que variam por categoria, validados no servidor.
- **Problema que resolve:** LOG-02: item, unidade, lote, validade, condição e origem; campos obrigatórios variam por categoria.
- **Origem:** PR:D-15; ALY:LOG-02.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** G29.
- **O que deve ser implementado:**
  - Migration: `NNN_itens_e_lotes.sql` (a numerar na execução): `categorias_de_item` (`exige_validade`, `exige_lote`, `controlada`), com a lista padrão por município (água, alimento não perecível, higiene, limpeza, colchão e cobertor, vestuário, kit, outros); `itens` (`nome`, `categoria_id`, `unidade`, `permite_fracao`, `estoque_minimo`, desativação com motivo); `lotes` (`item_id`, `codigo_do_lote`, `validade`, `condicao` `novo|bom|avariado`, `origem` `compra|doacao|reposicao|externa`), imutável, único por item e código.
  - API: `/v1/categorias`, `/v1/itens` (criar, editar, desativar); `REGRAS_DA_CATEGORIA` no shared valida lote sem validade em categoria que exige (422) e unidade fracionária onde `permite_fracao` é falso; categoria `controlada`: 409 `categoria_controlada` até o checkpoint.
  - Autorização: `gerenciar_catalogo_de_itens` (coordenador, administrador).
- **O que NÃO deve ser implementado nesta etapa:** o lote nasce na entrada (E05); movimento (E04); telas (E12).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `packages/shared/src/logistica.ts`, `apps/api/src/rotas/itens.ts` (a criar), `db/test/itens-e-lotes.test.ts` (a criar).
- **Risco de segurança:** lote editável quebra a rastreabilidade; sem UPDATE.
- **Impacto LGPD:** Não se aplica: catálogo sem dado pessoal.
- **Migração necessária:** Sim (`NNN_itens_e_lotes.sql`, a numerar na execução).
- **Compatibilidade:** só tabelas novas.
- **Rollback:** migration inversa enquanto vazias.
- **Testes positivos:** item em `kg` com fração; lote de alimento com validade.
- **Testes negativos:** alimento sem validade: 422; 2,5 `un` em item sem fração: 422; categoria controlada: 409; UPDATE de lote negado.
- **Testes de autorização e isolamento:** operador cadastra item: 403; Vale Fundo não lê o catálogo de Serra Alta.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`; G00 a G19 e G29.
- **E2E:** `npm run test:e2e:api`: criar item e rejeitar lote inválido.
- **Validação humana:** Alyson revisa a lista padrão de categorias.
- **Evidência a produzir:** `docs/evidencias-v2/G30/V2-F30-E03/`.
- **Documentação a atualizar:** `dc360/docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** regra por categoria no servidor; lote imutável.
- **Checkpoint:** CP-68 (lista de categorias, campos obrigatórios e o que fica fora, como medicamento); o padrão proposto libera o desenvolvimento.

### V2-F30-E04 - Razão de movimentos e saldo derivado (RN-09, LOG-04 núcleo)
- **Prioridade:** P0
- **Tamanho:** L  |  **Complexidade:** crítica  |  **Risco:** crítico  |  **Paralelizável:** não (E05 a E09 dependem)
- **Objetivo:** criar o razão append-only e a view de saldo, com função única de registro, trava de concorrência e política do offline.
- **Problema que resolve:** RN-09 e LOG-04: todo saldo deriva de movimentos auditados.
- **Origem:** PR:D-15; ALY:RN-09; ALY:LOG-04; ALY:RN-06.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E02; E03; F03-E06.
- **O que deve ser implementado:**
  - Migration: `NNN_estoque_movimentos.sql` (a numerar na execução): `estoque_movimentos` (`tipo`: entrada, saída e entrada de transferência, separação, liberação, entrega, ajuste; local, item, lote, `delta_disponivel` e `delta_separado` com CHECK de sinais por tipo, `origem` `painel|aparelho|contingencia`, hora declarada e registrada, `ator_id`, `divergencia`, `referencia`, chave de idempotência única); FKs compostas; só SELECT e INSERT; view `estoque_saldos` com `security_invoker`; policy de INSERT: `agente_campo` só em local com vínculo vigente (ator da F03-E06).
  - API: `registrarMovimento` único, em transação com `pg_advisory_xact_lock` por local, item e lote; saldo insuficiente online: 409 `saldo_insuficiente`; da fila: aceito com `divergencia`; `GET /v1/estoque/saldos` e `/movimentos`.
- **O que NÃO deve ser implementado nesta etapa:** operações (E05, E06); telas (E12).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/estoque/movimentos.ts` (a criar em `apps/api/src/`), `db/test/estoque-movimentos.test.ts` (a criar).
- **Risco de segurança:** corrida entre pedidos zeraria o saldo duas vezes.
- **Impacto LGPD:** `ator_id` é servidor; manifesto na E17.
- **Migração necessária:** Sim (`NNN_estoque_movimentos.sql`, a numerar na execução).
- **Compatibilidade:** só tabelas e view novas.
- **Rollback:** migration inversa se vazias.
- **Testes positivos:** sequência aleatória semeada: o saldo da view é sempre a soma dos movimentos; a mesma chave não duplica.
- **Testes negativos:** UPDATE e DELETE negados; dois pedidos pelo último item: um 201 e um 409; movimento do aparelho que negativa fica com `divergencia`; sinal incoerente com o tipo recusado.
- **Testes de autorização e isolamento:** agente sem vínculo no local: 404; a view de Vale Fundo não soma linha de Serra Alta.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`; G00 a G19 e G29.
- **E2E:** `npm run test:e2e:api`: dois movimentos concorrentes.
- **Validação humana:** Rafael tenta editar um movimento.
- **Evidência a produzir:** `docs/evidencias-v2/G30/V2-F30-E04/`.
- **Documentação a atualizar:** `dc360/docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** não existe coluna de saldo.
- **Checkpoint:** CP-66 (a política de `divergencia` decidida antes de produção).

### V2-F30-E05 - Entrada, transferência com trânsito e separação (LOG-02 e LOG-04)
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com E06, E07 e E08)
- **Objetivo:** registrar entrada de lote, transferência entre locais com estado de trânsito e separação para entrega, tudo como movimentos.
- **Problema que resolve:** LOG-02 e LOG-04: entrada gera movimento; transferência e separação não podem apagar rastro.
- **Origem:** PR:D-15; ALY:LOG-02; ALY:LOG-04; ALY:RN-09.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E04.
- **O que deve ser implementado:**
  - Migration: `NNN_estoque_transferencias.sql` (a numerar na execução): `estoque_transferencias` (`origem_id`, `destino_id`, item, lote, `quantidade`, `estado` `enviada|recebida|cancelada`, `quantidade_recebida`, atores e horas); RLS forçada; UPDATE só nas colunas de recebimento e cancelamento.
  - API: `POST /v1/estoque/entradas` (cria o lote se novo, valida pela categoria, grava `entrada`); `POST /v1/estoque/transferencias`, `.../:id/receber` (recebimento com quantidade diferente abre pedido de ajuste da E06, não corrige sozinho) e `.../:id/cancelar` `{motivo}` (movimento de volta); `POST /v1/estoque/separacoes` e `.../:id/desfazer` (liberação); `GET /v1/estoque/sugestao-de-lote`: validade mais próxima primeiro; lote vencido: 409 `lote_vencido`.
  - Autorização: `registrar_movimento_de_estoque`; o agente só em local com vínculo vigente.
- **O que NÃO deve ser implementado nesta etapa:** ajuste (E06); entrega e carga (E09); telas (E12).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/rotas/estoque.ts` (a criar), `apps/api/src/estoque/`, `apps/api/test/estoque.test.ts` (a criar).
- **Risco de segurança:** transferência para local de outro município; a FK composta recusa.
- **Impacto LGPD:** Não se aplica: sem dado pessoal além do ator.
- **Migração necessária:** Sim (`NNN_estoque_transferencias.sql`, a numerar na execução).
- **Compatibilidade:** só tabela e rotas novas.
- **Rollback:** migration inversa enquanto vazia.
- **Testes positivos:** entrada de 100 un; transferência de 40 (origem 60, em trânsito 40, destino 40 ao receber); separação de 10 e liberação.
- **Testes negativos:** transferir mais que o disponível: 409; lote vencido: 409; receber duas vezes: 409; destino de outro município: recusado.
- **Testes de autorização e isolamento:** agente sem vínculo na origem: 404; Vale Fundo não transfere para local de Serra Alta.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`; G00 a G19 e G29.
- **E2E:** `npm run test:e2e:api`: entrada, transferência, recebimento, separação.
- **Validação humana:** Alyson percorre a transferência de um lote de teste.
- **Evidência a produzir:** `docs/evidencias-v2/G30/V2-F30-E05/`.
- **Documentação a atualizar:** `dc360/docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** nada some entre a origem e o destino.
- **Checkpoint:** Não.

### V2-F30-E06 - Ajuste de estoque com motivo e aprovação de outra pessoa (RN-09)
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com E05, E07 e E08)
- **Objetivo:** o ajuste só vira movimento depois de aprovado por pessoa diferente de quem pediu.
- **Problema que resolve:** RN-09: ajuste é um movimento com motivo e aprovação; sem isso a perda some em silêncio.
- **Origem:** PR:D-15; ALY:RN-09; ALY:LOG-04.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E04.
- **O que deve ser implementado:**
  - Migration: `NNN_estoque_ajustes.sql` (a numerar na execução): `estoque_ajustes` (local, item, lote, `delta`, `motivo` `contagem|perda|avaria|vencimento|diferenca_de_transito|outro`, `justificativa` de 10 a 300 caracteres, `pedido_por`, `estado` `pendente|aprovado|recusado`, `decidido_por`, `decidido_em`, `motivo_da_decisao`, `movimento_id`); CHECK `decidido_por <> pedido_por`; o banco recusa movimento `ajuste` sem ajuste aprovado; `avisos_tipo_check` ganha `ajuste_de_estoque_pendente` (molde da migração 031, repetindo todos os valores vigentes).
  - API: `POST /v1/estoque/ajustes`, `.../:id/aprovar` e `.../:id/recusar`; pendente não altera saldo; a aprovação revalida o saldo e grava o movimento.
  - Autorização: pedir exige `registrar_movimento_de_estoque`; decidir exige `aprovar_ajuste_de_estoque` (coordenador, administrador), nunca no próprio pedido (403 `aprovacao_propria`).
- **O que NÃO deve ser implementado nesta etapa:** inventário (E10); telas (E12).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/rotas/estoque.ts`, `db/test/estoque-ajustes.test.ts` (a criar).
- **Risco de segurança:** coordenador único aprovando o próprio pedido; o CHECK impede.
- **Impacto LGPD:** Não se aplica: justificativa sem dado pessoal por regra de tela.
- **Migração necessária:** Sim (`NNN_estoque_ajustes.sql`, a numerar na execução).
- **Compatibilidade:** só tabela e rotas novas.
- **Rollback:** migration inversa enquanto vazia.
- **Testes positivos:** pedido de perda de 5 un aprovado por outro coordenador baixa o saldo em 5 e grava o movimento.
- **Testes negativos:** aprovar o próprio pedido: 403; aprovar duas vezes: 409; justificativa de 3 caracteres: 422; INSERT direto de `ajuste` sem aprovação recusado pelo banco.
- **Testes de autorização e isolamento:** operador aprova: 403; Vale Fundo aprova ajuste de Serra Alta: 404.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`; G00 a G19 e G29.
- **E2E:** `npm run test:e2e:api`: pedir, aprovar, conferir o saldo.
- **Validação humana:** Alyson aprova um pedido de teste.
- **Evidência a produzir:** `docs/evidencias-v2/G30/V2-F30-E06/`.
- **Documentação a atualizar:** `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** nenhum ajuste sem motivo e sem segunda pessoa.
- **Checkpoint:** CP-67 (se município com um só coordenador aprova com o administrador; padrão proposto liberado).

### V2-F30-E07 - QR code e código de barras com entrada manual sempre possível (LOG-03)
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E05, E06 e E08)
- **Objetivo:** resolver um código lido (QR ou barras) em item e lote, imprimir etiqueta de lote e manter a digitação manual em todo fluxo.
- **Problema que resolve:** LOG-03: a leitura acelera a operação, mas a entrada manual permanece.
- **Origem:** PR:D-15; ALY:LOG-03.
- **Estado atual:** CRIAR (o gerador de QR do painel existe em `apps/web/src/componentes/qr.ts`).
- **Dependências de entrada:** E03; E04.
- **O que deve ser implementado:**
  - Migration: `NNN_item_codigos.sql` (a numerar na execução): `item_codigos` (`item_id`, `codigo`, `tipo` `barras|interno`), único por município.
  - Shared: `lerCodigo(texto)` aceita código de barras e a carga de etiqueta de lote `dc360:l:<id do lote>`, que não leva dado pessoal.
  - API: `GET /v1/codigos/:codigo` devolve item e lote; código de outro município: 404; `POST /v1/itens/:id/codigos`.
  - Frontend: etiqueta de lote imprimível com QR (`qr.ts`); campo que aceita leitor USB (digita e Enter); entrada manual sempre disponível. O app lê com a câmera na E15.
- **O que NÃO deve ser implementado nesta etapa:** leitura por câmera no app (E15); nova biblioteca de QR.
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `packages/shared/src/logistica.ts`, `apps/api/src/rotas/itens.ts`, `apps/web/src/componentes/qr.ts`.
- **Risco de segurança:** etiqueta com dado pessoal ou URL; a carga é só o identificador.
- **Impacto LGPD:** Não se aplica: sem dado pessoal na etiqueta.
- **Migração necessária:** Sim (`NNN_item_codigos.sql`, a numerar na execução).
- **Compatibilidade:** só tabela e rotas novas.
- **Rollback:** migration inversa enquanto vazia.
- **Testes positivos:** código de barras resolve o item; etiqueta de lote resolve item e lote; o QR decodifica ao mesmo texto.
- **Testes negativos:** código repetido no município: 409; carga adulterada com id de lote alheio: 404; código vazio: 422.
- **Testes de autorização e isolamento:** código de Serra Alta lido com token de Vale Fundo: 404.
- **Regressão obrigatória:** `npm test` (`qr.test.ts`), `npm run test:api`, `npm run test:isolamento`; G00 a G19 e G29.
- **E2E:** `npm run test:e2e`: digitar o código e achar o item.
- **Validação humana:** Alyson lê a etiqueta impressa com um leitor.
- **Evidência a produzir:** `docs/evidencias-v2/G30/V2-F30-E07/` (etiqueta e leitura).
- **Documentação a atualizar:** `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** leitura e digitação levam ao mesmo lote.
- **Checkpoint:** Não.

### V2-F30-E08 - Necessidades, promessas de doação e cobertura (LOG-05, modelo e consulta)
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E05 a E07)
- **Objetivo:** registrar promessas de doação e calcular, por local e período, falta, cobertura e excesso entre necessidade, estoque e promessa.
- **Problema que resolve:** LOG-05: reduzir excessos e faltas comparando necessidade, estoque e doação prometida.
- **Origem:** PR:D-15; ALY:LOG-05; ALY:§5.3.
- **Estado atual:** CRIAR (as necessidades de abrigo vêm de `abrigo_necessidades`, F29-E09).
- **Dependências de entrada:** E04; G29.
- **O que deve ser implementado:**
  - Migration: `NNN_doacoes_prometidas.sql` (a numerar na execução): `doacoes_prometidas` (`local_destino_id`, item ou categoria, `quantidade`, unidade, `data_prevista`, `estado` `prometida|recebida|nao_cumprida|cancelada`, `doador_nome` e `doador_contato` opcionais e curtos, `movimento_id`); RLS forçada; UPDATE só no estado.
  - API: `/v1/doacoes` (prometer, receber: gera a entrada da E05 ligada à promessa, marcar não cumprida); `GET /v1/cobertura?localId&inicio&fim`: `calcularCobertura` no shared (necessidade, disponível, promessas pendentes, `falta`, `cobertura` em por cento, `excesso`); unidades diferentes nunca se somam.
  - Autorização: `gerenciar_doacoes_e_necessidades`.
- **O que NÃO deve ser implementado nesta etapa:** cadastro de doador como relacionamento; integração com sistema de doações (F31); tela (E13).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `packages/shared/src/logistica.ts`, `apps/api/src/rotas/doacoes.ts` (a criar).
- **Risco de segurança:** doador identificável sem finalidade; campos opcionais e curtos.
- **Impacto LGPD:** nome e contato de doador são dado pessoal; classificação na E17 e CP-69.
- **Migração necessária:** Sim (`NNN_doacoes_prometidas.sql`, a numerar na execução).
- **Compatibilidade:** só tabela e rotas novas.
- **Rollback:** migration inversa enquanto vazia.
- **Testes positivos:** necessidade de 100 un, estoque de 60 e promessa de 30: falta 10, cobertura 90 por cento; promessa recebida vira entrada.
- **Testes negativos:** promessa recebida duas vezes: 409; kg e un na mesma linha: nunca somados; quantidade zero: 422.
- **Testes de autorização e isolamento:** `usuario_orgao`: 404; Vale Fundo não lê promessa de Serra Alta.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`; G00 a G19 e G29.
- **E2E:** `npm run test:e2e:api`: prometer, receber, ver a cobertura.
- **Validação humana:** Alyson confere uma cobertura de teste.
- **Evidência a produzir:** `docs/evidencias-v2/G30/V2-F30-E08/`.
- **Documentação a atualizar:** `dc360/docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** cobertura calculada no servidor, igual para toda tela.
- **Checkpoint:** CP-69 (finalidade, base legal e retenção do nome e contato de doador e recebedor; bloqueia o uso real).

### V2-F30-E09 - Cargas, rotas, entregas e prova de entrega no servidor (LOG-06)
- **Prioridade:** P0
- **Tamanho:** L  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (E14 e E15 dependem)
- **Objetivo:** montar carga com itens separados, ordenar as paradas e registrar a entrega com recebedor e evidência.
- **Problema que resolve:** LOG-06: a entrega vincula itens, destino, recebedor e evidência; nada existe hoje.
- **Origem:** PR:D-15; ALY:LOG-06; ALY:RN-03; ALY:VIS-06.
- **Estado atual:** CRIAR (molde de prova: `evidencias` e a F06).
- **Dependências de entrada:** E05; F06-E02; F06-E21.
- **O que deve ser implementado:**
  - Migration: `NNN_cargas_e_entregas.sql` (a numerar na execução): `cargas` (origem, `veiculo`, `condutor_id`, `estado`, `incidente_id` opcional), `carga_itens` (ligados às separações), `carga_paradas` (`ordem`, destino, `estado`), `entregas` e `entrega_itens` (`recebedor_nome`, hora declarada e registrada, ponto de GPS, chave de idempotência única), `entrega_arquivos` (foto e assinatura, classe `comprovante_de_entrega`, nova por emenda do ADR de F06-E01 (migration em `arquivos.classe` e `limites_de_arquivo`), prova nunca recodificada); RLS forçada, sem DELETE.
  - API: `POST /v1/cargas`, `.../iniciar`, `.../cancelar` `{motivo}` (libera as separações); `POST /v1/cargas/:id/paradas/:pid/entrega` grava o movimento `entrega` idempotente; entrega parcial devolve o restante à separação; rota é a sequência de paradas, sem cálculo de trajeto.
  - Autorização: `registrar_entrega` (agente da carga, operador, coordenação); montar e cancelar: coordenação.
- **O que NÃO deve ser implementado nesta etapa:** comprovante em PDF (E16); telas (E13, E15); otimizar rota.
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/rotas/cargas.ts` (a criar), `db/test/cargas-e-entregas.test.ts` (a criar).
- **Risco de segurança:** entrega por quem não leva a carga.
- **Impacto LGPD:** nome do recebedor, mínimo; manifesto na E17.
- **Migração necessária:** Sim (`NNN_cargas_e_entregas.sql`, a numerar na execução).
- **Compatibilidade:** só novidades.
- **Rollback:** migration inversa se vazias.
- **Testes positivos:** carga de dois destinos, entrega completa e parcial; a mesma chave não duplica.
- **Testes negativos:** entrega acima do separado: 409; carga cancelada: 409; sem recebedor: 422; UPDATE e DELETE negados.
- **Testes de autorização e isolamento:** agente que não é o condutor: 404; Vale Fundo não lê carga de Serra Alta.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`; G00 a G19 e G29.
- **E2E:** `npm run test:e2e:api`: montar, entregar, concluir.
- **Validação humana:** Alyson percorre uma carga.
- **Evidência a produzir:** `docs/evidencias-v2/G30/V2-F30-E09/`.
- **Documentação a atualizar:** `dc360/docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** entrega idempotente, com prova.
- **Checkpoint:** CP-69 (recebedor: só nome e assinatura, ou também documento).

### V2-F30-E10 - Kits permanentes, inventário e simulados durante o ano (LOG-07, servidor)
- **Prioridade:** P1
- **Tamanho:** L  |  **Complexidade:** alta  |  **Risco:** médio  |  **Paralelizável:** sim (com E11)
- **Objetivo:** operar kits, inventário e simulados: toda diferença vira pedido de ajuste, nunca saldo editado.
- **Problema que resolve:** LOG-07: kits e inventário mantêm o estoque em uso fora da calamidade.
- **Origem:** PR:D-15; ALY:LOG-07; ALY:RN-09.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E05; E06.
- **O que deve ser implementado:**
  - Migration: `NNN_kits_inventario_simulados.sql` (a numerar na execução): `kit_modelos` e `kit_modelo_itens`; `kits` (modelo, local), montados por separações com `referencia` do kit; `inventarios` e `inventario_contagens` (`contado`, `esperado` fixado no fechamento); `simulados`; RLS forçada, sem DELETE.
  - API: `/v1/kits/modelos`, `POST /v1/kits` (montar e desmontar), `/v1/inventarios` (abrir, contar, fechar), `/v1/simulados` (criar, reservar, encerrar); fechar inventário e encerrar simulado geram pedidos de ajuste pendentes (E06); movimentos de simulado levam `referencia` própria e não contam como consumo real.
  - Domínio: `validadeDoKit` no shared: a menor validade dos lotes.
  - Autorização: `gerenciar_kits_e_inventario` (coordenador, administrador); contar exige vínculo no local.
- **O que NÃO deve ser implementado nesta etapa:** alertas (E11); telas (E13); contagem no aparelho (E14).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/rotas/kits.ts` (a criar), `packages/shared/src/logistica.ts`.
- **Risco de segurança:** inventário que corrige o saldo sozinho esconderia desvio.
- **Impacto LGPD:** Não se aplica: sem dado pessoal.
- **Migração necessária:** Sim (`NNN_kits_inventario_simulados.sql`, a numerar na execução).
- **Compatibilidade:** só novidades.
- **Rollback:** migration inversa se vazias.
- **Testes positivos:** kit com a menor validade; inventário com diferença de 2 gera ajuste pendente e o saldo não muda; simulado reserva 5 kits e devolve 4: um ajuste pendente.
- **Testes negativos:** montar kit sem saldo: 409; fechar inventário fechado: 409; reservar em simulado encerrado: 409.
- **Testes de autorização e isolamento:** operador monta kit: 403; Vale Fundo não lê kit de Serra Alta.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`; G00 a G19 e G29.
- **E2E:** `npm run test:e2e:api`: montar, inventariar, simular, aprovar.
- **Validação humana:** Alyson confere um inventário.
- **Evidência a produzir:** `docs/evidencias-v2/G30/V2-F30-E10/`.
- **Documentação a atualizar:** `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** saldo só muda por ajuste aprovado.
- **Checkpoint:** CP-71 (composição dos kits, periodicidade e como o simulado trata consumo; padrão: reservar e devolver).

### V2-F30-E11 - Alertas de validade, estoque mínimo, divergência e inventário atrasado
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E10)
- **Objetivo:** avisar no sino, por município, lote a vencer ou vencido com saldo, estoque abaixo do mínimo, divergência de saldo e inventário atrasado.
- **Problema que resolve:** LOG-07: sem alerta, o kit vence na prateleira e a divergência passa despercebida.
- **Origem:** PR:D-15; ALY:LOG-07; ALY:RN-09; DP:T12.
- **Estado atual:** CRIAR (molde: `avisos` e a migração 031).
- **Dependências de entrada:** E04; E06; F07-E03.
- **O que deve ser implementado:**
  - Migration: `NNN_alertas_de_estoque.sql` (a numerar na execução): `logistica_configuracoes` (por município: `dias_de_aviso_de_validade`, periodicidade padrão do inventário); `avisos_tipo_check` ganha `lote_a_vencer`, `lote_vencido_com_saldo`, `estoque_abaixo_do_minimo`, `divergencia_de_saldo` e `inventario_atrasado`, repetindo todos os valores vigentes (ordem: introdução da F29).
  - Worker: rotina diária no worker (F07-E03), por município com o papel de aplicação e sem BYPASSRLS (molde da migração 045), com aviso único por fato (chave `lote:<id>:<limiar>`).
  - API: `GET` e `PUT /v1/logistica/configuracao` (`gerenciar_locais_de_logistica`).
- **O que NÃO deve ser implementado nesta etapa:** e-mail ou push do alerta; tela (E13).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), o relógio do worker (F07-E03), `apps/api/src/rotas/avisos.ts`, `db/test/alertas-de-estoque.test.ts` (a criar).
- **Risco de segurança:** rotina com BYPASSRLS leria todos os municípios.
- **Impacto LGPD:** Não se aplica: aviso sem dado pessoal.
- **Migração necessária:** Sim (`NNN_alertas_de_estoque.sql`, a numerar na execução).
- **Compatibilidade:** os avisos atuais seguem iguais.
- **Rollback:** migration inversa; o CHECK volta à lista anterior.
- **Testes positivos:** lote que vence em 29 dias gera um aviso com a janela de 30; a divergência do aparelho gera aviso.
- **Testes negativos:** rodar a rotina duas vezes não duplica; lote sem saldo não avisa; dias negativos na configuração: 422.
- **Testes de autorização e isolamento:** a rotina de Serra Alta não cria aviso em Vale Fundo; operador altera a configuração: 403.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api` (testes de avisos); G00 a G19 e G29.
- **E2E:** `npm run test:e2e:api`: lote a vencer, rodar a rotina, ver o sino.
- **Validação humana:** Alyson confere o texto do aviso.
- **Evidência a produzir:** `docs/evidencias-v2/G30/V2-F30-E11/`.
- **Documentação a atualizar:** `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** cada fato avisa uma vez, por município.
- **Checkpoint:** CP-70 (antecedência da validade, estoque mínimo e prazo do inventário; padrão proposto: 30 dias).

### V2-F30-E12 - Painel: locais, itens, saldo, movimentos, ajustes e etiquetas
- **Prioridade:** P1
- **Tamanho:** L  |  **Complexidade:** alta  |  **Risco:** médio  |  **Paralelizável:** não (E13 reusa os componentes)
- **Objetivo:** a coordenação cadastra locais e itens, vê o saldo derivado, registra movimentos, pede e aprova ajuste e imprime etiquetas.
- **Problema que resolve:** LOG-01 a LOG-04 sem tela não são operáveis; o saldo nunca tem campo editável.
- **Origem:** PR:D-15; ALY:LOG-01; ALY:LOG-02; ALY:LOG-04; regra 0 de `19-definicao-de-pronto.md`.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E05; E06; E07; F08-E13; F10-E10; F10-E11.
- **O que deve ser implementado:**
  - Frontend: `Locais.tsx` (lista e ficha: horário, responsáveis, aberto agora), `Itens.tsx` (catálogo, lotes, etiqueta com QR) e `Estoque.tsx` (saldo por local, item e lote com validade e "a vencer"; movimentos paginados; formulários de entrada, transferência, recebimento e separação; fila de ajustes com aprovar e recusar; divergência com ícone e texto); campo de código aceita leitor USB e digitação.
  - Dados: `dados/http.ts` e `dados/local.ts` com paridade; saldo com "atualizado às HH:MM" e nenhum campo editável de saldo.
  - UX e acessibilidade: chaves `logistica.*`, en e es em `pendentes.json`; vazio, erro e carregando; teclado; estado nunca só por cor.
- **O que NÃO deve ser implementado nesta etapa:** cobertura, cargas, kits (E13); relatórios (E16).
- **Arquivos e módulos prováveis:** `apps/web/src/paginas/Locais.tsx`, `Itens.tsx` e `Estoque.tsx` (a criar em `apps/web/src/paginas/`), `dados/http.ts`, `dados/local.ts`, `apps/web/test/estoque.test.ts` (a criar).
- **Risco de segurança:** botão escondido não é controle; a rota decide.
- **Impacto LGPD:** Não se aplica: tela sem dado pessoal.
- **Migração necessária:** Não.
- **Compatibilidade:** painel atual intacto.
- **Rollback:** reverter o commit.
- **Testes positivos:** entrada, transferência e recebimento pela tela; `paridade-dos-modos.test.ts` verde.
- **Testes negativos:** teste que reprova input de saldo nas telas; aprovar o próprio pedido: botão ausente e 403; 409 vira frase clara.
- **Testes de autorização e isolamento:** operador sem botões de cadastro e aprovação (chamada direta: 403); Vale Fundo na URL de Serra Alta: "Não encontrado".
- **Regressão obrigatória:** `npm run test:e2e`, `npm test`, `npm run test:scripts`; G00 a G19 e G29.
- **E2E:** `apps/web/test/logistica.e2e.mjs` (a criar): entrada, transferência, ajuste e aprovação.
- **Validação humana:** Rafael aprova as capturas.
- **Evidência a produzir:** `docs/evidencias-v2/G30/V2-F30-E12/capturas/` com `INDEX.md`.
- **Documentação a atualizar:** `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** operação do estoque pela tela e portão visual aprovado.
- **Checkpoint:** Não.

### V2-F30-E13 - Painel: cobertura, doações, cargas, entregas, kits, inventário e alertas
- **Prioridade:** P1
- **Tamanho:** L  |  **Complexidade:** alta  |  **Risco:** médio  |  **Paralelizável:** não (mesma árvore de telas da E12)
- **Objetivo:** ver a cobertura por local e período, registrar doações, montar e acompanhar cargas, ver comprovantes e operar kits, inventário, simulados e a configuração dos alertas.
- **Problema que resolve:** LOG-05 a LOG-07: sem tela, a comparação e o acompanhamento ficam em planilha.
- **Origem:** PR:D-15; ALY:LOG-05; ALY:LOG-06; ALY:LOG-07; regra 0 de `19-definicao-de-pronto.md`.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E08; E09; E10; E11; E12.
- **O que deve ser implementado:**
  - Frontend: `Cobertura.tsx` (necessidade, disponível, promessas, falta, cobertura e excesso, em número, texto e barra), `Doacoes.tsx`, `Cargas.tsx` (escolher separações, ordenar paradas por botões subir e descer, iniciar, acompanhar entregas e abrir o comprovante), `Kits.tsx` (modelos, montados, validade do kit), `Inventarios.tsx` (inventário e simulado) e a configuração dos alertas.
  - Dados e texto: nos dois modos de dados; chaves `logistica.*`; unidades diferentes em linhas separadas; vazio, erro e carregando.
  - Acessibilidade: ordenação de paradas pelo teclado; tabela com cabeçalhos associados.
- **O que NÃO deve ser implementado nesta etapa:** relatórios em PDF e CSV (E16); mapa de rota calculada.
- **Arquivos e módulos prováveis:** `apps/web/src/paginas/Cobertura.tsx`, `Doacoes.tsx`, `Cargas.tsx`, `Kits.tsx` e `Inventarios.tsx` (a criar em `apps/web/src/paginas/`), `dados/http.ts`, `dados/local.ts`.
- **Risco de segurança:** comprovante com nome de recebedor visto por quem não deve.
- **Impacto LGPD:** a tela mostra o nome do recebedor só a quem tem `registrar_entrega` ou coordenação.
- **Migração necessária:** Não.
- **Compatibilidade:** só telas novas.
- **Rollback:** reverter o commit.
- **Testes positivos:** cobertura de 90 por cento na tela igual ao `calcularCobertura`; montar e iniciar uma carga.
- **Testes negativos:** carga sem parada: bloqueada; entrega acima do separado: frase do 409; 320 px sem corte.
- **Testes de autorização e isolamento:** `usuario_orgao`: "Não encontrado"; Serra Alta não vê carga nem doação de Vale Fundo.
- **Regressão obrigatória:** `npm run test:e2e`, `npm test`, `npm run test:scripts`; G00 a G19 e G29.
- **E2E:** `logistica.e2e.mjs`: doação, cobertura, carga, entrega.
- **Validação humana:** Alyson opera uma carga de teste e aprova as capturas.
- **Evidência a produzir:** `docs/evidencias-v2/G30/V2-F30-E13/capturas/` com `INDEX.md`.
- **Documentação a atualizar:** `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** cobertura, carga e kit operáveis e portão visual aprovado.
- **Checkpoint:** Não.

### V2-F30-E14 - App do agente, núcleo offline: movimento, entrega e contagem na fila
- **Prioridade:** P0
- **Tamanho:** L  |  **Complexidade:** alta  |  **Risco:** crítico  |  **Paralelizável:** não (E15 depende)
- **Objetivo:** a fila leva movimento, entrega com foto e assinatura e contagem sem duplicar nem perder; o aparelho guarda saldo, cargas e códigos dos locais do agente.
- **Problema que resolve:** o motor offline não conhece estoque, e a entrega feita sem sinal já aconteceu no mundo físico (RN-06).
- **Origem:** PR:D-15; ALY:LOG-04; ALY:LOG-06; ALY:RN-06; ALY:RNF-03.
- **Estado atual:** EXPANDIR (motor offline MANTIDO; reusa a F29-E13).
- **Dependências de entrada:** E09; E10; F29-E13; F06-E21.
- **O que deve ser implementado:**
  - Mobile: `tipos.ts` ganha `movimento_de_estoque`, `entrega` e `contagem`; a entrega leva foto e assinatura por `FotoNaFila` e `PapelDoArquivo` (envio retomável, F06-E21); ordem de criação por local e item; `carga_cancelada` sem destino (arquivado com aviso); movimento que negativa o saldo sobe com `divergencia`, nunca recusado.
  - API: `POST /v1/sincronizacao/movimento`, `/entrega` e `/contagem` (Zod, `exigirPermissao`, vínculo do local, chave do item); `GET /v1/campo/logistica`: locais com vínculo, saldos, cargas do condutor, itens e códigos.
- **O que NÃO deve ser implementado nesta etapa:** telas (E15); ajuste e aprovação no aparelho.
- **Arquivos e módulos prováveis:** `packages/campo/src/tipos.ts`, `fila.ts`, `apps/api/src/rotas/sincronizacao.ts`, `campo.ts`.
- **Risco de segurança:** estoque de outro local no aparelho.
- **Impacto LGPD:** nome do recebedor no aparelho até sincronizar, cifrado (F14-E04).
- **Migração necessária:** Não.
- **Compatibilidade:** itens antigos e os de incidente seguem legíveis.
- **Rollback:** reverter o commit.
- **Testes positivos:** três itens sem sinal sobem na volta; a foto sobe antes do envelope; resposta perdida não duplica.
- **Testes negativos:** dois aparelhos entregam o último lote offline: ambos aceitos, um com `divergencia` e aviso, nenhum item perdido; carga cancelada offline: arquivado com aviso.
- **Testes de autorização e isolamento:** agente sem vínculo no local: 404 e item bloqueado.
- **Regressão obrigatória:** `npm run test:campo`, `npm run test:api`, `npm run test:isolamento`; G00 a G19 e G29.
- **E2E:** `npm run test:e2e:api`: entrega sem sinal e reconexão.
- **Validação humana:** Rafael corta o sinal no simulador e entrega.
- **Evidência a produzir:** `docs/evidencias-v2/G30/V2-F30-E14/`.
- **Documentação a atualizar:** `apps/campo/LEIA-ME.md`.
- **Definition of Done:** nada perdido e nada duplicado.
- **Checkpoint:** CP-66 (aceitar com `divergencia` decidido antes de produção).

### V2-F30-E15 - App do agente: telas de estoque, leitura de código, entrega com assinatura e contagem
- **Prioridade:** P1
- **Tamanho:** L  |  **Complexidade:** alta  |  **Risco:** médio  |  **Paralelizável:** não (depende da E14)
- **Objetivo:** o agente lê o código ou digita, vê o saldo, registra entrada, transferência, entrega com assinatura e foto e conta o inventário, com a fila visível.
- **Problema que resolve:** LOG-03 e LOG-06 no campo; sem tela, o servidor da E14 não é usado.
- **Origem:** PR:D-15; ALY:LOG-03; ALY:LOG-06; ALY:VIS-06; regra 0 de `19-definicao-de-pronto.md`.
- **Estado atual:** CRIAR (telas); câmera e assinatura já existem (`expo-camera`, `Assinatura.tsx`).
- **Dependências de entrada:** E07; E14; F14-E10.
- **O que deve ser implementado:**
  - Mobile: `logistica/index.tsx` (locais do agente), `logistica/local/[id].tsx` (saldo, entrada, enviar e receber transferência, contagem) e `carga/[id].tsx` (paradas, itens, nome do recebedor, assinatura, foto); leitura por `CameraView` (`onBarcodeScanned`) com entrada manual sempre ao lado; permissão negada leva à digitação e ao botão de ajustes.
  - UX: chip da fila em cada ação; "saldo do último contato (HH:MM)"; resumo antes de enviar.
  - Acessibilidade: alvo de 44 pt (48 no Android), fonte 200% (F14-E10); chaves `logistica.*`, en e es em `pendentes.json`.
- **O que NÃO deve ser implementado nesta etapa:** ajuste e aprovação no aparelho; nova biblioteca de leitura.
- **Arquivos e módulos prováveis:** `apps/campo/src/app/(agente)/logistica/` e `carga/[id].tsx` (a criar em `apps/campo/src/app/(agente)/`), `src/dados/`.
- **Risco de segurança:** entrega registrada para a carga errada; a tela confere o destino da parada.
- **Impacto LGPD:** o nome do recebedor sai do aparelho na sincronização.
- **Migração necessária:** Não.
- **Compatibilidade:** abas atuais intactas.
- **Rollback:** reverter o commit.
- **Testes positivos:** jest: leitura de código resolve o lote; entrega sem sinal mostra "aguardando sinal" e vira "enviado".
- **Testes negativos:** quantidade acima do separado bloqueada; código desconhecido leva à digitação.
- **Testes de autorização e isolamento:** agente não vê local sem vínculo nem carga de outro condutor.
- **Regressão obrigatória:** `npm run test:campo`, `npm run typecheck`; G00 a G19 e G29.
- **E2E:** roteiro por simulador e aparelho (F08-E13): ler, entregar sem sinal, reconectar.
- **Validação humana:** foto do aparelho físico em uma entrega de teste.
- **Evidência a produzir:** `docs/evidencias-v2/G30/V2-F30-E15/capturas/` com `INDEX.md`.
- **Documentação a atualizar:** `dc360/docs/CARTAO-DO-AGENTE.md`.
- **Definition of Done:** entrega no aparelho com prova e portão visual aprovado.
- **Checkpoint:** Não.

### V2-F30-E16 - Relatórios de logística, comprovante de entrega e contingência (RNF-15)
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** médio  |  **Paralelizável:** não (fecha as telas)
- **Objetivo:** relatórios de estoque, comprovante de entrega imutável, seção de recursos no relatório de situação e exportação para operar em papel.
- **Problema que resolve:** REL-01 e RNF-15 pede contingência antes da fase 3; o runbook geral só vem na F21-E07.
- **Origem:** PR:D-15; ALY:RNF-15; ALY:LOG-06; ALY:REL-01; ALY:RN-07.
- **Estado atual:** EXPANDIR (`packages/shared/src/csv.ts`, F29-E15, montador da F09).
- **Dependências de entrada:** E09; E13; F29-E15; F09-E02; F09-E05.
- **O que deve ser implementado:**
  - API: `GET /v1/relatorios/estoque` em CSV e PDF (saldo, movimentos, validade, entregas, cobertura) com cabeçalho de filtros, município, data e responsável; célula iniciada por `=`, `+`, `-` ou `@` é neutralizada; `exportar_dados`.
  - Migration: `NNN_entrega_comprovantes.sql` (a numerar na execução): `entrega_comprovantes` append-only (`versao`, `snapshot`, `hash_snapshot`, `sha256_pdf`); PDF pelo montador único.
  - Documento: o relatório de situação ganha a seção de recursos e entregas numa `versao_modelo` nova; versões antigas intactas.
  - Contingência: botão "Posição de contingência" (ficha com saldo, cargas abertas e contatos) e `dc360/docs/runbooks/operacao-degradada-da-logistica.md`; lançamento posterior com `origem` `contingencia`.
- **O que NÃO deve ser implementado nesta etapa:** BI; envio ao S2ID (F31); assinatura de provedor (F09).
- **Arquivos e módulos prováveis:** `apps/api/src/rotas/relatorios-de-estoque.ts` (a criar), `packages/shared/src/csv.ts`, `db/migrations/` (nova).
- **Risco de segurança:** injeção de fórmula em CSV.
- **Impacto LGPD:** o comprovante leva o nome do recebedor; o CSV não.
- **Migração necessária:** Sim (`NNN_entrega_comprovantes.sql`, a numerar na execução).
- **Compatibilidade:** relatórios já emitidos seguem idênticos.
- **Rollback:** migration inversa se vazia.
- **Testes positivos:** comprovante reimpresso com o mesmo hash; relatório de situação antigo igual.
- **Testes negativos:** item chamado `=2+2` neutralizado no CSV; período invertido: 422; UPDATE do comprovante negado.
- **Testes de autorização e isolamento:** operador exporta: 403; Vale Fundo baixa o comprovante de Serra Alta: 404.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:isolamento`, `npm run test:e2e`; G00 a G19, G09 e G29.
- **E2E:** `logistica.e2e.mjs`: entregar, abrir o comprovante, exportar a contingência.
- **Validação humana:** Alyson imprime e confere a ficha.
- **Evidência a produzir:** `docs/evidencias-v2/G30/V2-F30-E16/`.
- **Documentação a atualizar:** `dc360/docs/INDISPONIBILIDADE.md`.
- **Definition of Done:** relatórios e comprovante reproduzíveis; ficha ensaiada.
- **Checkpoint:** CP-72 (quem guarda a ficha e quem lança depois; bloqueia a operação real).

### V2-F30-E17 - Manifesto, minimização, saída, eliminação e isolamento das tabelas de logística
- **Prioridade:** P0
- **Tamanho:** L  |  **Complexidade:** alta  |  **Risco:** crítico  |  **Paralelizável:** não (exige todas as tabelas da fase)
- **Objetivo:** classificar toda tabela da F30, tratar o dado pessoal de doador e recebedor, incluir tudo na saída e na eliminação, provar o isolamento.
- **Problema que resolve:** cada tabela nova é superfície nova; o manifesto reprova a sem classificação (CA-06).
- **Origem:** PR:D-15; DP:T41; ALY:RN-01; ALY:RN-07; ALY:RNF-12.
- **Estado atual:** EXPANDIR (manifesto da F05 e `isolamento.test.ts`).
- **Dependências de entrada:** E16; F05-E03; F05-E05; F05-E10.
- **O que deve ser implementado:**
  - Manifesto: `db/src/manifesto.ts`: cada tabela com sai, apaga, pessoal e retenção `a_decidir` (CP-10); nomes de doador e recebedor pessoais, com minimização por prazo (F05-E10); classe `comprovante_de_entrega` na saída e na eliminação, e a guarda da F06-E07 passa a cobri-la.
  - Banco: `db/test/logistica-isolamento.test.ts` (a criar): RLS forçada, policy fail-closed e FK composta em toda tabela; `estoque_saldos` nunca soma entre municípios; policy do agente por vínculo; nenhuma função SECURITY DEFINER nova.
  - API: matriz da F03-E13 com as rotas novas; `usuario_orgao`: 404; ID cruzado: 404; código de barras só no município.
- **O que NÃO deve ser implementado nesta etapa:** retenção ativa (CP-10); correção de falha (volta à etapa dona).
- **Arquivos e módulos prováveis:** `db/src/manifesto.ts`, `db/test/logistica-isolamento.test.ts` (a criar), `apps/api/test/saida-de-municipio.test.ts`.
- **Risco de segurança:** tabela fora do manifesto fica fora da saída.
- **Impacto LGPD:** classificação e minimização de doador e recebedor.
- **Migração necessária:** Não.
- **Compatibilidade:** o pacote antigo segue válido.
- **Rollback:** reverter o commit.
- **Testes positivos:** o pacote de Serra Alta traz movimentos, cargas e comprovantes; a eliminação os remove.
- **Testes negativos:** tabela sem classificação reprova; o pacote de A não traz linha de B; doador e recebedor redigidos após o prazo.
- **Testes de autorização e isolamento:** esta etapa É o teste: eliminar Serra Alta deixa Vale Fundo intacto.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`, `npm run test:e2e:api`; G00 a G19 e G29.
- **E2E:** `npm run test:e2e:api`: saída e eliminação de município de teste.
- **Validação humana:** Rafael abre o pacote e roda o teste.
- **Evidência a produzir:** `docs/evidencias-v2/G30/V2-F30-E17/`.
- **Documentação a atualizar:** `dc360/docs/SAIDA-DE-MUNICIPIO.md`.
- **Definition of Done:** zero tabela sem classificação nem vazamento.
- **Checkpoint:** CP-69 (finalidade, base legal e retenção; bloqueia dado real).

### V2-F30-E18 - E2E do fluxo de suprimentos humanitários e prova em aparelho físico
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (fecha a fase)
- **Objetivo:** provar de ponta a ponta o fluxo de suprimentos (ALY:§5.3), da promessa de doação à entrega no abrigo sem sinal, com saldo, cobertura e comprovante corretos.
- **Problema que resolve:** nenhuma etapa isolada prova o fluxo; a regra de Rafael exige E2E e capturas antes de avançar.
- **Origem:** PR:D-15; ALY:§5.3; ALY:RN-09; regra 0 de `19-definicao-de-pronto.md`.
- **Estado atual:** CRIAR (cenário novo; os fluxos A a N não mudam).
- **Dependências de entrada:** E12 a E17.
- **O que deve ser implementado:**
  - Fluxo: promessa de doação; entrada no ponto de coleta; transferência ao depósito; separação; carga; agente (aparelho físico, sem sinal) entrega ao abrigo com assinatura e foto; reconecta; saldo, cobertura e comprovante conferem; ajuste pedido e aprovado por outra pessoa; inventário de um kit.
  - Concorrência: dois aparelhos entregam o último lote offline; ambos sobem, um com `divergencia` e aviso no sino.
  - Provas: `apps/web/test/logistica.e2e.mjs`, cenário novo em `scripts/e2e-api.mjs`, capturas do painel, foto do aparelho (Android e iOS, F14-E12), dois municípios em paralelo.
- **O que NÃO deve ser implementado nesta etapa:** correção de defeito achado (volta à etapa dona).
- **Arquivos e módulos prováveis:** `apps/web/test/logistica.e2e.mjs` (a criar), `scripts/e2e-api.mjs`, `docs/evidencias-v2/G30/`.
- **Risco de segurança:** dado real em captura; só dado sintético.
- **Impacto LGPD:** Não se aplica: dados sintéticos.
- **Migração necessária:** Não.
- **Compatibilidade:** só testes.
- **Rollback:** reverter o commit.
- **Testes positivos:** o saldo final é a soma dos movimentos e a cobertura bate com o cálculo manual.
- **Testes negativos:** a reconexão repetida não duplica movimento; entrega offline em carga cancelada arquiva o item com aviso.
- **Testes de autorização e isolamento:** nada de Vale Fundo nas capturas de Serra Alta.
- **Regressão obrigatória:** `npm run verificar`, `npm run test:e2e`, `npm run test:e2e:api`; G00 a G19 e G29.
- **E2E:** o próprio fluxo.
- **Validação humana:** Rafael e Alyson assistem ao fluxo no aparelho físico.
- **Evidência a produzir:** `docs/evidencias-v2/G30/V2-F30-E18/` (saídas, capturas com `INDEX.md`, fotos, vídeo curto sem dado real).
- **Documentação a atualizar:** `dc360/README.md`, `dc360/docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** fluxo verde, evidência arquivada, portão visual aprovado.
- **Checkpoint:** Não.

# GATE G30 - LOGÍSTICA HUMANITÁRIA
Só passa se:
- [ ] (E01) a ADR do razão de estoque está aprovada, as ações novas estão no `shared` e no manifesto rota x ação, e CP-66 e CP-67 estão decididos, ou o padrão proposto foi aceito por escrito com a produção bloqueada. Evidência: `docs/evidencias-v2/G30/V2-F30-E01/`.
- [ ] (E02, E03) depósitos e pontos de coleta têm geografia, horário e responsáveis; o catálogo valida os campos por categoria no servidor e categoria controlada é recusada; CP-68 decidido ou adiado com o uso real bloqueado. Evidência: E02 e E03.
- [ ] (E04) não existe coluna de saldo: a view é a soma dos movimentos (teste de propriedade); movimento só se insere; dois pedidos pelo último item dão um 201 e um 409. Evidência: E04.
- [ ] (E05, E06) entrada, transferência com trânsito e separação não perdem item; ajuste só existe aprovado por outra pessoa e o banco recusa `ajuste` sem aprovação (RN-09). Evidência: E05 e E06.
- [ ] (E07) código de barras e QR resolvem item e lote, a entrada manual funciona sempre e a etiqueta não leva dado pessoal. Evidência: E07.
- [ ] (E08) a cobertura (falta, cobertura e excesso) é calculada no servidor e as unidades diferentes nunca se somam. Evidência: E08.
- [ ] (E09, E10, E11) a entrega é idempotente, com prova que não é recodificada; kits, inventário e simulado só mudam o saldo por ajuste aprovado; os alertas avisam uma vez por fato e por município, sem BYPASSRLS. Evidência: E09, E10, E11.
- [ ] (E12, E13, E15) as telas do painel e do app têm capturas (320, 768 e 1280 px, claro e escuro, quatro estados, e foto do aparelho) e o portão visual aprovado por Rafael. Evidência: E12, E13, E15.
- [ ] (E14) o app leva movimento, entrega e contagem pela fila sem duplicar nem perder; dois aparelhos esgotando o mesmo lote deixam `divergencia` e aviso. Evidência: E14.
- [ ] (E16 e CP-72) relatórios e comprovante reproduzíveis, CSV sem injeção de fórmula, ficha de contingência ensaiada; CP decidido ou adiado com a operação real bloqueada. Evidência: E16.
- [ ] (E17 e CP-69) manifesto completo, saída e eliminação incluem as tabelas, e o isolamento entre municípios está provado com `npm run test:isolamento` verde. Evidência: E17.
- [ ] (E18) o fluxo de suprimentos passa de ponta a ponta com o aparelho físico. CP-70 e CP-71 decididos ou adiados com o que bloqueiam. Evidência: E18.
- [ ] nenhuma regressão: G00 a G19, G32 e G29 continuam verdes (se um quebrar, ESTE gate volta a REPROVADO).
- [ ] documentação atualizada e evidências arquivadas em `docs/evidencias-v2/G30/`.

**Reabre se:** existir coluna de saldo editável ou movimento com UPDATE ou DELETE; ajuste entrar sem aprovação de outra pessoa; o aparelho duplicar ou perder movimento, entrega ou contagem; foto de entrega for recodificada; tabela da fase ficar sem RLS forçada ou sem classificação; função SECURITY DEFINER nova aparecer; a view de saldo vazar entre municípios; tela fechar sem capturas; G00 a G19, G32 ou G29 reabrir.

**Este Gate libera:** F31 (integrações que consomem estoque, doações e entregas), F35 (tradução e identidade visual das telas novas), F20 em diante (o console e as métricas conhecem os módulos novos) e o plano de piloto (F26 a F28) com o módulo de logística.
