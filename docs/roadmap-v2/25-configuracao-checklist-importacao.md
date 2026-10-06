# Fase 33: Configuração por município, checklist por tipo e importação

**Gate da fase:** G33 CONFIGURAÇÃO, CHECKLIST E IMPORTAÇÃO PROVADOS | **Depende dos gates:** G00 a G14 e G32 (na ordem de execução de `STATUS.md`, seção 5, a F33 é a 17ª fase: vem depois de G14 e antes de G15; D-29), em especial G09 (snapshot e modelos), G14 (app do agente em aparelho) e G07 (worker e cadeia de arquivos) | **Superfícies tocadas:** `db`, `apps/api`, `packages/shared`, `packages/campo`, `apps/campo`, `apps/web`, HML | **Checkpoints da fase:** CP-88, CP-89, CP-90 (a eles se soma o CP-11 para o uso de dado pessoal real)

Objetivo: cumprir D-17 (ALY:CFG-01, ALY:RN-10, ALY:VIS-05, ALY:OCO-08). Hoje tipos, prazos e checklist são constantes (`PRAZO_PADRAO_HORAS` em `packages/shared/src/dominio.ts:113`, `CHECKLIST_VISTORIA` em `:306`): UM checklist de seis itens para todos os tipos, e a única CSV do produto é de exportação (`packages/shared/src/csv.ts`). A fase cria a VERSÃO de configuração do município (linha imutável, rascunho separado, trilha append-only de quem mudou o quê e quando), o checklist por tipo com perguntas condicionais consumido pelo app do agente offline, e a importação de lote por CSV com prévia, validação linha a linha, idempotência e desfazer por encerramento com motivo, nunca por exclusão.

Regra central: cada ocorrência guarda a versão aplicada ao nascer, cada vistoria a versão do checklist que respondeu e cada documento a versão no snapshot (F09-E04). Publicar uma versão nova nunca muda o que está em andamento. Os tipos são os oito da COBRADE: o município liga, desliga e renomeia o rótulo, nunca cria tipo (regra do projeto). As quatro severidades ficam (pinos e glifos dependem delas): configuram-se o prazo e a descrição de uso. A validação mora no banco e no pacote shared, com as mesmas fixtures nos dois.

MANTER: `CHECKLIST_VISTORIA` e `PRAZO_PADRAO_HORAS` como a versão 1 de todo município, o envelope de vistoria legado (sem versão), a coleta offline que nunca se perde, `proximo_protocolo`, `celulaCsv` (proteção de fórmula), a habilitação de modelos da F09-E16.

A fase NÃO faz: tipo ou severidade novos, texto jurídico livre nos modelos, migrar ocorrência em andamento para versão nova, configuração por órgão ou por secretaria, tema e cor do município (F35-E02 a E05), formulários do "MVP 2" além dos de D-17 (`docs/roadmap-v2/21-fora-da-v2.md`).

Ordem sugerida: E01, E02; E03 depois da E02; E04 e E05 depois da E03 (E05 reaproveita a função de validação); E06 depois da E05; E07 depois da E06; E08 depois da E07; E09 e E10 depois da E04; E11 depois de E04, E05, E09 e E10; E12 independe da configuração (só da E01); E13 depois de E12 e E04; E14 depois da E13; E15 depois da E14; E16 fecha. Toda etapa de tela (E08, E09, E11, E15) passa pelo portão visual de `19-definicao-de-pronto.md`, seção 0.

## Etapas

### V2-F33-E01 - ADR da configuração versionada: versão imutável, publicação e versão aplicada
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** não (E02 a E16 executam o ADR)
- **Objetivo:** fixar por escrito o modelo de versão, publicação e versão aplicada antes de qualquer migration.
- **Problema que resolve:** CFG-01 e RN-10 exigem configuração versionada que "não quebra registros históricos"; sem ADR cada fase cria o seu versionamento (documentos na F09-E04, vistoria na F14-E18).
- **Origem:** PR:D-17; ALY:CFG-01; ALY:RN-10; ALY:VIS-05; BZ-D:PRF-45.
- **Estado atual:** CRIAR (tudo é constante hoje).
- **Dependências de entrada:** G14; G32; CP-88.
- **O que deve ser implementado:**
  - Arquivos: `docs/adr/NNNN-configuracao-versionada.md` (NNNN próxima livre, a numerar na execução) com: (1) versão é linha imutável (`conteudo` jsonb, `numero` por município, hash), rascunho em tabela própria; (2) eventos append-only dizem quem mudou o quê e quando; (3) ocorrência, vistoria e documento guardam a versão aplicada e nunca a trocam; (4) conteúdo possível (oito tipos COBRADE, prazos, checklist, campos de abertura, textos delimitados dos modelos) e impossível (tipo ou severidade novos, texto jurídico livre); (5) validação em dois lugares com fixtures comuns; (6) restaurar é publicar nova versão; (7) app sem versão usa a versão 1.
- **O que NÃO deve ser implementado nesta etapa:** SQL, rotas e telas (E02 em diante).
- **Arquivos e módulos prováveis:** `docs/adr/` (nova ADR), `dc360/README.md`.
- **Risco de segurança:** versão mutável apagaria a prova de qual regra valeu.
- **Impacto LGPD:** Não se aplica: decisão de desenho.
- **Migração necessária:** Não.
- **Compatibilidade:** nenhuma; só registra.
- **Rollback:** reverter o documento.
- **Testes positivos:** `npm run auditar` passa com a ADR.
- **Testes negativos:** ADR sem as sete decisões reprova a revisão.
- **Testes de autorização e isolamento:** Não se aplica: sem código; a prova é a E16.
- **Regressão obrigatória:** `npm run auditar`; G00 a G14 e G32.
- **E2E:** Não se aplica: documento.
- **Validação humana:** Rafael aceita o modelo de versão.
- **Evidência a produzir:** `docs/evidencias-v2/G33/V2-F33-E01/` com hash da ADR.
- **Documentação a atualizar:** `dc360/README.md`.
- **Definition of Done:** ADR aceita; F09 e F14 apontam para ela.
- **Checkpoint:** CP-88 (quem publica: proposta administrador; sem decisão, só o administrador).

### V2-F33-E02 - Versões, rascunho e trilha de versão da configuração (migration), com a versão 1 de cada município
- **Prioridade:** P0
- **Tamanho:** L  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (E03 a E10 dependem)
- **Objetivo:** criar as tabelas de versão, rascunho e eventos, a versão 1 padrão em todo município e a coluna de versão aplicada.
- **Problema que resolve:** não há configuração por município (`dominio.ts:113`, `:306`) nem regra aplicada guardada.
- **Origem:** PR:D-17; ALY:CFG-01; ALY:RN-10; DP:T26.
- **Estado atual:** CRIAR; EXPANDIR `ocorrencias` e `vistorias`.
- **Dependências de entrada:** E01.
- **O que deve ser implementado:**
  - Migration: `configuracao_versoes` (`organizacao_id`, `numero`, `conteudo` jsonb, `hash_sha256`, `publicada_por`, `publicada_em`, `motivo`; único por município e número; só INSERT); `configuracao_rascunhos` (um por município; UPDATE permitido); `configuracao_eventos` (append-only: `rascunho_salvo`, `publicada`, `restaurada`, com `antes` e `depois`); RLS forçada; `ocorrencias.configuracao_versao_id` e `vistorias.configuracao_versao_id` (FK composta; gatilho proíbe trocar depois do INSERT); `configuracao_conteudo_valido(jsonb)` em CHECK; versão 1 igual às constantes atuais, por backfill e por gatilho em `organizacoes` (cobre `provisionar_municipio`).
  - Domínio: `packages/shared/src/configuracao.ts` (a criar): esquema Zod, `CONFIGURACAO_PADRAO`, `hashDaConfiguracao` (canonização da F09-E04); fixtures em `packages/shared/test/fixtures/configuracao/` rodadas no Zod e no SQL.
- **O que NÃO deve ser implementado nesta etapa:** rotas (E04), prazo e checklist em uso (E03, E05).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `packages/shared/src/configuracao.ts`, `db/test/configuracao-versionada.test.ts` (a criar), `db/src/manifesto.ts`.
- **Risco de segurança:** backfill em município grande: ensaiar em cópia (F01-E15).
- **Impacto LGPD:** Não se aplica: sem dado de pessoa.
- **Migração necessária:** Sim (`NNN_configuracao_versionada.sql`, a numerar na execução).
- **Compatibilidade:** ocorrências existentes ficam na versão 1, igual a hoje.
- **Rollback:** migration corretiva.
- **Testes positivos:** município novo nasce com a versão 1; as fixtures válidas passam no Zod e no SQL.
- **Testes negativos:** UPDATE ou DELETE em versão e evento: negados; trocar a versão da ocorrência: recusado; tipo `ciclone`, prazo 0 e prazo 9000: recusados nos dois lugares.
- **Testes de autorização e isolamento:** município B lê a versão do A: zero linhas; `isolamento.test.ts` (CA-06) cobre as três tabelas.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`, `npm run migrar -- --conferir`; G00 a G14 e G32.
- **E2E:** Não se aplica: sem rota; prova em PGlite.
- **Validação humana:** Rafael lê a versão 1.
- **Evidência a produzir:** `docs/evidencias-v2/G33/V2-F33-E02/`.
- **Documentação a atualizar:** `docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** versão 1 em todo município; versão aplicada imutável.
- **Checkpoint:** Não.

### V2-F33-E03 - Tipos, severidades e prazos por município: shared, banco e triagem
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** não (E04 e E05 dependem)
- **Objetivo:** a triagem calcula o prazo pela versão aplicada à ocorrência, e tipos podem ser ligados, desligados e renomeados sem criar taxonomia.
- **Problema que resolve:** o prazo sai de `PRAZO_PADRAO_HORAS` na rota (`ocorrencias.ts:769-780`), contra a regra de que a regra mora no banco e no shared.
- **Origem:** PR:D-17; ALY:CFG-01; ALY:OCO-03; BZ-D:PRF-16.
- **Estado atual:** REFATORAR (as constantes viram a versão 1).
- **Dependências de entrada:** E02.
- **O que deve ser implementado:**
  - Domínio: `prazoEmHoras(conteudo, tipo, severidade)` no shared: prazo por tipo e severidade sobrepõe o por severidade; limite de 1 a 8760 horas; `outro` (TIPO_A_CLASSIFICAR) nunca desligado.
  - Banco: `configuracao_prazo_horas(versao_id, tipo, severidade)` com a mesma regra; a triagem passa a gravar `prazo_em` por ela; paridade TypeScript x SQL pelas fixtures.
  - API: `GET /v1/configuracao` devolve a versão vigente (qualquer papel autenticado); abrir ou classificar em tipo desligado: 422 `tipo_desabilitado` (ocorrências já abertas do tipo seguem).
- **O que NÃO deve ser implementado nesta etapa:** edição e publicação (E04); checklist (E05); migrar ocorrência antiga de versão.
- **Arquivos e módulos prováveis:** `packages/shared/src/configuracao.ts`, `apps/api/src/rotas/ocorrencias.ts`, `apps/api/src/rotas/configuracao.ts`, `db/migrations/` (nova), `apps/api/test/prazo-do-despacho.test.ts`.
- **Risco de segurança:** prazo errado esconde ocorrência atrasada; o despacho continua sem tocar `prazo_em`.
- **Impacto LGPD:** Não se aplica: sem dado de pessoa.
- **Migração necessária:** Sim (`NNN_prazo_pela_configuracao.sql`, a numerar na execução).
- **Compatibilidade:** versão 1 reproduz os prazos de hoje.
- **Rollback:** migration corretiva; a rota volta às constantes.
- **Testes positivos:** versão 1: crítica 4 h; versão com crítica em 2 h: `prazo_em` de 2 h na ocorrência aberta depois.
- **Testes negativos:** tipo desligado: 422; prazo 0 e 9000: 422; ocorrência aberta antes da publicação mantém o prazo antigo.
- **Testes de autorização e isolamento:** `GET /v1/configuracao` do município B nunca devolve a do A; sem token: 401.
- **Regressão obrigatória:** `npm run test:api` (`prazo-do-despacho`, `tipo-a-classificar`), `npm run test:isolamento`, `npm run typecheck`; G00 a G14 e G32.
- **E2E:** `npm run test:e2e:api`: triar com a versão 1.
- **Validação humana:** Alyson confere os prazos da versão 1.
- **Evidência a produzir:** `docs/evidencias-v2/G33/V2-F33-E03/`.
- **Documentação a atualizar:** `docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** prazo pela versão aplicada, igual nos dois lugares.
- **Checkpoint:** Não.

### V2-F33-E04 - Publicação de versão sem quebrar ocorrência em andamento, com trilha de versão
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com E05)
- **Objetivo:** editar o rascunho, publicar, restaurar e ler a trilha de versão, sem alterar nada que esteja em andamento.
- **Problema que resolve:** ALY:RN-10 pede preservar processos anteriores; dois administradores publicando ao mesmo tempo corromperiam a numeração.
- **Origem:** PR:D-17; ALY:RN-10; ALY:AUD-01.
- **Estado atual:** CRIAR (padrão de rota: `PATCH /organizacao/retencao`, `apps/api/src/rotas/administracao.ts`).
- **Dependências de entrada:** E03; CP-88.
- **O que deve ser implementado:**
  - Banco: `publicar_configuracao(base, motivo)` valida o rascunho, recusa se `base` não for a última versão (409 `rascunho_desatualizado`) e grava a versão `numero + 1` com o evento `publicada` (`antes` e `depois`).
  - API: `PUT /v1/configuracao/rascunho` (ação `editar_configuracao`: coordenador e administrador), `POST /v1/configuracao/publicar` (`publicar_configuracao`: administrador, até o CP), `POST /v1/configuracao/restaurar` `{numero, motivo}` (nova versão com o conteúdo antigo), `GET /v1/configuracao/versoes` e `GET /v1/configuracao/eventos`; `exigirPermissao` antes do banco; motivo de pelo menos 10 caracteres.
- **O que NÃO deve ser implementado nesta etapa:** tela (E11); migrar ocorrência em andamento; apagar versão.
- **Arquivos e módulos prováveis:** `apps/api/src/rotas/configuracao.ts`, `db/migrations/` (nova), `packages/shared/src/permissoes.ts`, `apps/api/test/configuracao-versionada.test.ts` (a criar).
- **Risco de segurança:** publicação sem MFA recente mudaria prazo de todo o município; seguir a política da F03-E11.
- **Impacto LGPD:** Não se aplica: sem dado de pessoa.
- **Migração necessária:** Sim (`NNN_publicar_configuracao.sql`, a numerar na execução).
- **Compatibilidade:** rotas novas.
- **Rollback:** migration inversa com as versões intactas.
- **Testes positivos:** publicar cria a versão 2 e o evento; restaurar a 1 cria a 3 com o conteúdo da 1.
- **Testes negativos:** publicar com `base` velha: 409; sem motivo: 422; conteúdo inválido: 422 e nenhuma versão.
- **Testes de autorização e isolamento:** operador edita: 403; coordenador publica: 403; administrador do B publica no A: 404.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:isolamento`, `npm run test:scripts`; G00 a G14 e G32.
- **E2E:** `npm run test:e2e:api`: publicar prazo menor e abrir duas ocorrências, antes e depois.
- **Validação humana:** Rafael vê a trilha de versão.
- **Evidência a produzir:** `docs/evidencias-v2/G33/V2-F33-E04/`.
- **Documentação a atualizar:** `docs/PAPEIS_E_RESPONSABILIDADES.md`.
- **Definition of Done:** publicação auditada; em andamento intacto.
- **Checkpoint:** CP-88 (quem publica e se exige segundo aprovador; sem decisão, só o administrador publica).

### V2-F33-E05 - Checklist por tipo com perguntas condicionais: modelo no shared e no banco
- **Prioridade:** P0
- **Tamanho:** L  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com E04)
- **Objetivo:** cada tipo COBRADE pode ter checklist próprio, com perguntas obrigatórias, opções padronizadas e condicionais, avaliado por um só código.
- **Problema que resolve:** um checklist fixo de seis itens vale para todo tipo (`dominio.ts:306`).
- **Origem:** PR:D-17; ALY:VIS-05; BZ-D:CMP-29; REL:03.
- **Estado atual:** EXPANDIR (`CHECKLIST_VISTORIA` vira o padrão da versão 1).
- **Dependências de entrada:** E03; CP-89 (conteúdo).
- **O que deve ser implementado:**
  - Domínio: `packages/shared/src/checklist.ts` (a criar): item com `chave`, `rotulo`, `resposta` (`sim_nao`, `opcao` de 2 a 8 opções, `texto_curto`, `numero`), `obrigatorio` e `condicao` (`chave` de item ANTERIOR do tipo `sim_nao` ou `opcao`, e o valor); até 40 itens por tipo; tipo sem lista usa `padrao`; `lacunasDoChecklist(itens, respostas)` é o único avaliador.
  - Banco: `configuracao_conteudo_valido` confere chave única, condição para trás, limites; a chave `acionar_outro_orgao` mantém o desdobramento em órgãos (`CHAVE_ACIONAR_ORGAO`).
- **O que NÃO deve ser implementado nesta etapa:** o conteúdo técnico das perguntas por tipo (CP-89); validação na sincronização (E06); entrega ao aparelho (E07).
- **Arquivos e módulos prováveis:** `packages/shared/src/checklist.ts` (a criar), `packages/shared/src/dominio.ts`, `packages/shared/test/orgaos-do-checklist.test.ts`, `db/migrations/` (nova).
- **Risco de segurança:** condição circular travaria a vistoria; o banco recusa.
- **Impacto LGPD:** Não se aplica: pergunta sem dado de pessoa.
- **Migração necessária:** Sim (`NNN_checklist_condicional.sql`, a numerar na execução; estende a função de validação).
- **Compatibilidade:** versão 1 igual aos seis itens de hoje.
- **Rollback:** migration corretiva.
- **Testes positivos:** pergunta condicionada a "sim" fica obrigatória só com "sim"; as fixtures dão o mesmo resultado no shared e no SQL.
- **Testes negativos:** condição para item posterior, 41 itens, opção única, 9 opções e chave repetida: recusados.
- **Testes de autorização e isolamento:** Não se aplica: sem rota; isolamento nas E02 e E16.
- **Regressão obrigatória:** `npm test --workspace @dc360/shared`, `npm run test:isolamento`, `npm run typecheck`; G00 a G14 e G32.
- **E2E:** Não se aplica: a E06 prova ponta a ponta.
- **Validação humana:** Alyson lê uma lista sintética.
- **Evidência a produzir:** `docs/evidencias-v2/G33/V2-F33-E05/`.
- **Documentação a atualizar:** `docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** avaliador único, igual nos dois lugares.
- **Checkpoint:** CP-89 (quem escreve as perguntas técnicas de cada tipo; sem decisão só o padrão e exemplos sintéticos).

### V2-F33-E06 - Sincronização valida a vistoria contra a versão do checklist que o agente respondeu
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (altera `sincronizacao.ts` e o envelope, como a F14-E18)
- **Objetivo:** o servidor valida a vistoria pela versão declarada pelo aparelho, sem nunca perder coleta feita com versão antiga.
- **Problema que resolve:** `checklistSchema` confere itens de uma constante (`schemas.ts:262`); com versões, validar pela versão de hoje reprovaria o que o agente respondeu offline há dias.
- **Origem:** PR:D-17; ALY:VIS-05; ALY:RN-06; BZ-D:CMP-29.
- **Estado atual:** EXPANDIR (`apps/api/src/rotas/sincronizacao.ts`, envelope em `schemas.ts:617`).
- **Dependências de entrada:** E05; F14-E18.
- **O que deve ser implementado:**
  - API: o envelope ganha `checklistVersao` e `valor` por item (`resposta` booleana segue); com versão, valida pela versão existente no município (qualquer publicada), com `lacunasDoChecklist` dentro da `lacunasDaVistoria` da F14-E18; sem versão (app antigo) vale a regra de hoje; grava `vistorias.configuracao_versao_id`; versão diferente da da ocorrência gera evento `versao_do_checklist_diferente`, sem bloquear.
  - Banco: `vistorias.checklist` segue jsonb; item fora da versão ou de condição inativa: 422 `checklist_invalido` com a lista de chaves.
- **O que NÃO deve ser implementado nesta etapa:** recusar coleta legada; entrega ao aparelho (E07); tela (E08).
- **Arquivos e módulos prováveis:** `apps/api/src/rotas/sincronizacao.ts`, `packages/shared/src/schemas.ts`, `apps/api/test/checklist-por-versao.test.ts` (a criar).
- **Risco de segurança:** versão de outro município no envelope não pode valer.
- **Impacto LGPD:** Não se aplica: sem dado novo de pessoa.
- **Migração necessária:** Não (colunas da E02).
- **Compatibilidade:** envelope legado aceito como hoje.
- **Rollback:** reverter o commit.
- **Testes positivos:** envelope da versão 1 e da versão 2 antiga, com a 3 já publicada: 201.
- **Testes negativos:** obrigatório condicional ausente: 422 e item `bloqueado` na fila (F14-E03); resposta de item inativo: 422; versão inexistente: 422; legado sem `checklistVersao`: aceito.
- **Testes de autorização e isolamento:** envelope do A com versão do B: 422; agente de outra equipe: 404.
- **Regressão obrigatória:** `npm run test:api` (`coleta-nao-reescreve-prova`, `agente-so-ve-a-equipe`), `npm run test:campo`, `npm run test:isolamento`; G00 a G14 e G32.
- **E2E:** `npm run test:e2e:api`: enviar vistoria com versão antiga depois de publicar a nova.
- **Validação humana:** Rafael vê a coleta antiga aceita.
- **Evidência a produzir:** `docs/evidencias-v2/G33/V2-F33-E06/`.
- **Documentação a atualizar:** `docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** validação pela versão declarada; coleta nunca perdida.
- **Checkpoint:** Não.

### V2-F33-E07 - Entrega do checklist ao aparelho e avaliador offline em packages/campo
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (E08 depende)
- **Objetivo:** a tarefa baixada com sinal traz o checklist da versão da ocorrência e o aparelho o avalia sem rede, com o mesmo resultado do servidor.
- **Problema que resolve:** `faltaParaConcluir` (`packages/campo/src/conclusao.ts:47`) recebe uma lista fixa; o checklist por tipo precisa viajar e ficar guardado.
- **Origem:** PR:D-17; ALY:VIS-02; ALY:VIS-05; BZ-D:CMP-29.
- **Estado atual:** EXPANDIR (`GET /campo/meu-trabalho`, `apps/api/src/rotas/campo.ts:43`).
- **Dependências de entrada:** E06; G14.
- **O que deve ser implementado:**
  - API: cada tarefa ganha `configuracaoVersaoId` e `checklist` (itens do tipo na versão da ocorrência), com ETag; só para a equipe do agente (`recorteDoAgente`).
  - Mobile: `apps/campo/src/dados/api.ts` e `banco-local.ts` guardam a lista por tarefa; tarefa em cache mantém a versão antiga mesmo após publicação; `packages/campo` usa `lacunasDoChecklist` do shared por subcaminho neutro (F08-E05); sem o campo (servidor antigo) vale `CHECKLIST_VISTORIA` embutido; rascunho começado numa versão termina nela.
- **O que NÃO deve ser implementado nesta etapa:** tela (E08); baixar versão sem tarefa; tarefa por tipo desabilitado.
- **Arquivos e módulos prováveis:** `apps/api/src/rotas/campo.ts`, `packages/campo/src/conclusao.ts`, `apps/campo/src/dados/api.ts`, `apps/campo/src/dados/banco-local.ts`, `apps/campo/src/dados/rascunho-de-versao-antiga.test.ts`.
- **Risco de segurança:** checklist de outra equipe ou município no payload.
- **Impacto LGPD:** Não se aplica: sem dado de pessoa.
- **Migração necessária:** Não.
- **Compatibilidade:** campo opcional; app antigo ignora.
- **Rollback:** deixar de enviar o campo.
- **Testes positivos:** tarefa em modo avião avalia as condicionais; as fixtures da E05 dão o mesmo resultado no jest do campo.
- **Testes negativos:** cache da versão 1 depois da publicação da 2 segue na 1; payload sem `checklist` cai no embutido.
- **Testes de autorização e isolamento:** o agente da equipe A não recebe a lista da tarefa da B; município B: 404.
- **Regressão obrigatória:** `npm run test:campo`, `npm run test:api`, `npm run test:isolamento`; G00 a G14 e G32.
- **E2E:** simulador: baixar, modo avião, concluir (a prova em aparelho está na E08).
- **Validação humana:** Rafael confere a lista baixada.
- **Evidência a produzir:** `docs/evidencias-v2/G33/V2-F33-E07/`.
- **Documentação a atualizar:** `apps/campo/LEIA-ME.md`.
- **Definition of Done:** avaliação offline igual à do servidor.
- **Checkpoint:** Não.

### V2-F33-E08 - Tela do checklist condicional no app do agente
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** médio  |  **Paralelizável:** não (edita `vistoria/[id].tsx`)
- **Objetivo:** o agente responde um checklist que muda conforme as respostas, acessível, em modo avião.
- **Problema que resolve:** a tela só sabe seis itens sim ou não; pergunta condicional, opção e número não existem.
- **Origem:** PR:D-17; ALY:VIS-05; ALY:RNF-03.
- **Estado atual:** EXPANDIR (`apps/campo/src/app/(agente)/vistoria/[id].tsx`).
- **Dependências de entrada:** E07; F14-E10.
- **O que deve ser implementado:**
  - Mobile: renderiza os quatro tipos de resposta; item condicional aparece e some com anúncio (`accessibilityLiveRegion`) e foco no item novo; resposta de item que some é removida do estado local e do envio; "obrigatório" em texto, não só por cor; alvo de toque de 44 px e fonte em 200% sem corte; o botão de concluir mostra quantos itens faltam (`faltaParaConcluir`).
- **O que NÃO deve ser implementado nesta etapa:** edição do checklist no aparelho; fotos e assinatura (F14-E18).
- **Arquivos e módulos prováveis:** `apps/campo/src/app/(agente)/vistoria/[id].tsx`, `apps/campo/src/ui/componentes.tsx`, `apps/campo/src/__tests__/vistoria-como-produto.test.tsx`.
- **Risco de segurança:** resposta de item inativo enviada por engano: o servidor recusa (E06).
- **Impacto LGPD:** Não se aplica: sem dado novo de pessoa.
- **Migração necessária:** Não.
- **Compatibilidade:** sem checklist por tipo, a tela mostra os seis itens de hoje.
- **Rollback:** reverter o commit.
- **Testes positivos:** responder "sim" mostra a pergunta condicional; concluir só com as obrigatórias ativas.
- **Testes negativos:** mudar "sim" para "não" remove a resposta condicional; item `numero` com texto: recusado na tela.
- **Testes de autorização e isolamento:** Não se aplica: tela local; isolamento provado nas E06 e E07.
- **Regressão obrigatória:** `npm run test:campo`; G00 a G14 e G32.
- **E2E:** aparelho Android e iOS: vistoria com condicional em modo avião e sincronização (roteiro da F14-E12).
- **Validação humana:** um agente usa; Rafael aprova capturas e fotos do aparelho no portão visual.
- **Evidência a produzir:** `docs/evidencias-v2/G33/V2-F33-E08/` com `capturas/INDEX.md`.
- **Documentação a atualizar:** `apps/campo/LEIA-ME.md`, `docs/CARTAO-DO-AGENTE.md`.
- **Definition of Done:** checklist condicional provado em aparelho.
- **Checkpoint:** Não.

### V2-F33-E09 - Formulário de abertura por tipo: campos extras versionados
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E10)
- **Objetivo:** cada tipo pode pedir campos extras na abertura da ocorrência, definidos na versão e validados no banco e no shared.
- **Problema que resolve:** ALY:OCO-02 diz que campos e regras variam por tipo; hoje a abertura é única (`aberturaOcorrenciaSchema`, `schemas.ts:85`).
- **Origem:** PR:D-17; ALY:OCO-02; ALY:CFG-01.
- **Estado atual:** EXPANDIR.
- **Dependências de entrada:** E04.
- **O que deve ser implementado:**
  - Migration: `ocorrencias.dados_do_tipo` jsonb; gatilho valida pelos campos da versão aplicada (`texto_curto` até 200 caracteres, `numero`, `opcao`, `sim_nao`; até 12 campos por tipo).
  - Domínio: `validarDadosDoTipo(conteudo, tipo, dados)` no shared, mesmas fixtures.
  - API: `POST /ocorrencias` (`ocorrencias.ts:629`) aceita `dadosDoTipo` e recusa campo obrigatório ausente.
  - Frontend: `NovaOcorrencia.tsx` mostra os campos do tipo escolhido, com rótulo que diz o que digitar.
- **O que NÃO deve ser implementado nesta etapa:** campo que pede CPF ou dado sensível; formulário de vistoria (E05); edição depois do registro (F10-E28).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `packages/shared/src/configuracao.ts`, `apps/api/src/rotas/ocorrencias.ts`, `apps/web/src/paginas/NovaOcorrencia.tsx`.
- **Risco de segurança:** texto livre vira dado pessoal sem classificação (E16 trata).
- **Impacto LGPD:** `dados_do_tipo` classificado como texto livre no manifesto.
- **Migração necessária:** Sim (`NNN_dados_do_tipo.sql`, a numerar na execução).
- **Compatibilidade:** coluna nula para o que existe.
- **Rollback:** migration inversa.
- **Testes positivos:** deslizamento com o campo obrigatório preenchido grava; opção do campo respeita a lista.
- **Testes negativos:** campo obrigatório ausente: 422; texto de 201 caracteres e opção fora da lista: 422; SQL direto inválido: recusado pelo gatilho.
- **Testes de autorização e isolamento:** agente de campo abre: 403; A nunca lê `dados_do_tipo` de B.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:isolamento`, `npm test --workspace @dc360/web`; G00 a G14 e G32.
- **E2E:** `fluxo-api.e2e.mjs`: abrir ocorrência com campo extra; Playwright captura.
- **Validação humana:** Alyson abre um chamado; capturas aprovadas no portão visual.
- **Evidência a produzir:** `docs/evidencias-v2/G33/V2-F33-E09/` com `capturas/INDEX.md`.
- **Documentação a atualizar:** `docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** campos extras validados nos dois lugares.
- **Checkpoint:** Não.

### V2-F33-E10 - Textos do modelo de documento por município, versionados no snapshot
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** sim (com E09)
- **Objetivo:** o município edita só trechos delimitados dos modelos (cabeçalho extra, orientação final e rodapé), e cada documento guarda os textos usados.
- **Problema que resolve:** a F09-E16 habilita modelos, mas o texto é código; ALY:CFG-01 pede "modelos básicos" configuráveis sem tocar fato nem prova.
- **Origem:** PR:D-17; ALY:CFG-01; ALY:DOC-03; PR:D-05.
- **Estado atual:** EXPANDIR (F09-E04, E16, E17 e E18).
- **Dependências de entrada:** E04; F09-E04; F09-E16.
- **O que deve ser implementado:**
  - Domínio: `modelos` no conteúdo: por modelo de `MODELOS_DE_DOCUMENTO`, `cabecalho_extra` (200), `orientacao_final` (500) e `rodape` (200 caracteres), texto puro, sem HTML; passam por `escapar`.
  - API: o montador (F09-E02) inclui no snapshot `configuracao_versao_id` e os textos; o hash cobre ambos; emissão posterior à publicação nova segue com o texto da versão da ocorrência.
- **O que NÃO deve ser implementado nesta etapa:** editar fatos, prova, decisão do ato de interdição ou HTML; fundamento legal (CP-14 e CP-42); tela (E11).
- **Arquivos e módulos prováveis:** `apps/api/src/documentos/` (`folha.ts`, `laudo.ts`), `packages/shared/src/documentos.ts`, `apps/api/test/modelo-versionado.test.ts`.
- **Risco de segurança:** HTML injetado em PDF oficial: texto puro e escapado.
- **Impacto LGPD:** Não se aplica: texto institucional.
- **Migração necessária:** Não.
- **Compatibilidade:** sem texto configurado, o HTML é idêntico ao de hoje.
- **Rollback:** esvaziar os campos.
- **Testes positivos:** documento com orientação final configurada a mostra e o `hash_snapshot` muda; sem texto, hash igual ao de antes.
- **Testes negativos:** `<script>` e 501 caracteres: recusados; trecho da decisão do ato não é configurável.
- **Testes de autorização e isolamento:** texto do A nunca aparece em documento do B; operador edita: 403.
- **Regressão obrigatória:** `npm run test:api` (documentos, `modelo-versionado`), `npm run test:isolamento`; G00 a G14 e G32.
- **E2E:** `npm run test:e2e:api`: configurar, emitir e reimprimir com o mesmo hash.
- **Validação humana:** o município lê o documento com o texto dele.
- **Evidência a produzir:** `docs/evidencias-v2/G33/V2-F33-E10/`.
- **Documentação a atualizar:** `docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** texto delimitado, escapado e congelado no snapshot.
- **Checkpoint:** Não.

### V2-F33-E11 - Painel de configuração: rascunho, comparação, publicação e histórico
- **Prioridade:** P1
- **Tamanho:** L  |  **Complexidade:** alta  |  **Risco:** médio  |  **Paralelizável:** não (mesmo repositório de dados do painel)
- **Objetivo:** o coordenador e o administrador editam a configuração numa tela, veem o que muda e publicam com motivo.
- **Problema que resolve:** as rotas das E03 a E10 não têm tela; publicar sem ver a diferença é risco de prazo errado.
- **Origem:** PR:D-17; ALY:CFG-01; REL:11.
- **Estado atual:** CRIAR sobre `Organizacao.tsx` (retenção) como molde.
- **Dependências de entrada:** E04; E05; E09; E10; F08-E13.
- **O que deve ser implementado:**
  - Frontend: `apps/web/src/paginas/Configuracao.tsx` (a criar), rota `/configuracao`, quatro abas "Tipos e prazos", "Checklists", "Formulário de abertura" e "Textos dos documentos"; rótulos "Prazo em horas (de 1 a 8760)"; "Salvar rascunho"; "Ver o que muda" (diferença campo a campo); "Publicar versão" com motivo e o aviso "N ocorrências em andamento continuam na versão anterior"; histórico com quem, quando, motivo e "Restaurar esta versão"; operador e agente só leem; estados vazio, erro e carregando; nos dois modos de dados.
- **O que NÃO deve ser implementado nesta etapa:** importação (E15); edição de texto jurídico; tema do município (F35-E02).
- **Arquivos e módulos prováveis:** `apps/web/src/paginas/Configuracao.tsx` (a criar), `apps/web/src/dados/repositorio.ts`, `http.ts`, `local.ts`, `apps/web/src/App.tsx`.
- **Risco de segurança:** botão escondido não é controle: a API nega (E04).
- **Impacto LGPD:** Não se aplica: sem dado de pessoa.
- **Migração necessária:** Não.
- **Compatibilidade:** sem rascunho, a tela mostra a versão vigente.
- **Rollback:** esconder a rota.
- **Testes positivos:** editar o prazo, ver a diferença, publicar e ver a versão 2 no histórico.
- **Testes negativos:** prazo 0 mostra o que digitar; rascunho velho mostra "Outra pessoa publicou antes: recarregue".
- **Testes de autorização e isolamento:** coordenador não vê "Publicar" e a API nega com 403; município B não vê versões do A.
- **Regressão obrigatória:** `npm test --workspace @dc360/web`, `npm run test:e2e`, `npm run test:api`; G00 a G14 e G32.
- **E2E:** `fluxo.e2e.mjs` e `fluxo-api.e2e.mjs`: publicar; Playwright captura.
- **Validação humana:** Alyson publica uma versão de teste; capturas aprovadas no portão visual (nada desalinhado, grudado ou fora do lugar; texto bem escrito).
- **Evidência a produzir:** `docs/evidencias-v2/G33/V2-F33-E11/` com `capturas/INDEX.md` (`19-definicao-de-pronto.md`, seção 0).
- **Documentação a atualizar:** `docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** edição, comparação, publicação e histórico na tela.
- **Checkpoint:** Não.

### V2-F33-E12 - Importação por CSV: modelo, envio e prévia com validação linha a linha
- **Prioridade:** P1
- **Tamanho:** L  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com E09)
- **Objetivo:** o município envia o CSV e recebe a prévia com cada erro por linha e coluna, sem criar nada.
- **Problema que resolve:** ALY:OCO-08 pede relatório de erros sem dados parciais silenciosos; hoje só há exportação.
- **Origem:** PR:D-17; ALY:OCO-08; DP:T24; DP:T25.
- **Estado atual:** CRIAR (usa `csv.ts`, F06 e F07).
- **Dependências de entrada:** E01; F06-E04; F07-E04; F02-E09; F10-E27; CP-90.
- **O que deve ser implementado:**
  - Domínio: `lerCsv` e `importacao.ts` no shared: UTF-8, separador `;` ou `,`, até 5 000 linhas e 5 MB; obrigatórias `tipo`, `data_registro`, `endereco`, `solicitante_nome`, `descricao`; datas no fuso do município; `situacao` aberta ou encerrada (encerrada exige data e motivo da F10-E27); apóstrofo inicial de `celulaCsv` removido.
  - Migration: classe `importacao_csv` na cadeia; `importacoes_lotes` (`arquivo_sha256`, estado) e `importacoes_linhas` (`linha`, `codigo`, `coluna`, mensagem, sem o valor da célula); RLS forçada.
  - API: `GET /v1/importacoes/modelo.csv`, `POST /v1/importacoes` (ação `importar_ocorrencias`: coordenador e administrador), job `importacao.validar`, `GET /v1/importacoes/:id/relatorio.csv`; mesmo arquivo: 409.
- **O que NÃO deve ser implementado nesta etapa:** criar ocorrência (E13); desfazer (E14); tela (E15).
- **Arquivos e módulos prováveis:** `packages/shared/src/csv.ts`, `packages/shared/src/importacao.ts` e `apps/api/src/importacao/` (a criar), `db/migrations/` (nova).
- **Risco de segurança:** CSV com fórmula e arquivo gigante.
- **Impacto LGPD:** o CSV traz nome e contato de solicitantes; o relatório não repete valores.
- **Migração necessária:** Sim (`NNN_lotes_de_importacao.sql`, a numerar na execução).
- **Compatibilidade:** rotas novas.
- **Rollback:** migration inversa.
- **Testes positivos:** CSV de 3 linhas válidas fica `pronta`.
- **Testes negativos:** 5 001 linhas, 6 MB, tipo `ciclone`, data inexistente, latitude 95 e `encerrada` sem motivo: cada um vira erro apontado; binário barrado pela cadeia.
- **Testes de autorização e isolamento:** operador envia: 403; B lê o lote do A: 404.
- **Regressão obrigatória:** `npm test --workspace @dc360/shared`, `npm run test:api`, `npm run test:isolamento`; G00 a G14 e G32.
- **E2E:** `npm run test:e2e:api`: enviar CSV com 2 erros.
- **Validação humana:** Alyson lê as mensagens de erro.
- **Evidência a produzir:** `docs/evidencias-v2/G33/V2-F33-E12/`.
- **Documentação a atualizar:** `docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** prévia exata, sem efeito nos dados.
- **Checkpoint:** CP-90 (campos e estados importáveis e tratamento do protocolo legado; sem decisão só dado sintético).

### V2-F33-E13 - Importação por CSV: aplicar o lote com idempotência, protocolo e versão aplicada
- **Prioridade:** P1
- **Tamanho:** L  |  **Complexidade:** alta  |  **Risco:** crítico  |  **Paralelizável:** não (E14 depende)
- **Objetivo:** aplicar o lote pronto numa transação, sem duplicar e sem protocolo repetido.
- **Problema que resolve:** reenviar o mesmo arquivo ou um corrigido duplicaria ocorrências; o protocolo (RN-02) é único por município e ano e não se reutiliza.
- **Origem:** PR:D-17; ALY:OCO-08; ALY:RN-02; ALY:OCO-01.
- **Estado atual:** CRIAR (usa `proximo_protocolo`, `registrarEvento`).
- **Dependências de entrada:** E12; E04.
- **O que deve ser implementado:**
  - Migration: `ocorrencias.origem_importacao_id` e `protocolo_legado` (único por município quando preenchido); `importacoes_linhas.chave_da_linha` (protocolo legado, ou hash da linha) único entre aplicadas.
  - API: `POST /v1/importacoes/:id/aplicar` `{ignorarLinhasComErro}` (padrão falso: só com zero erro); job `importacao.aplicar` em UMA transação por lote, linhas por `data_registro`, `proximo_protocolo(ano no fuso do município)`, `canal_entrada = 'outro'`, `configuracao_versao_id` vigente, evento `registro` com `canal: importacao` e o lote; linha já aplicada: contada como "já importada"; `FOR UPDATE` no lote.
- **O que NÃO deve ser implementado nesta etapa:** desfazer (E14); tela (E15); importar vistoria, foto ou documento.
- **Arquivos e módulos prováveis:** `apps/api/src/importacao/aplicar.ts` (a criar), `apps/api/src/rotas/importacoes.ts` (a criar), `db/migrations/` (nova), `apps/api/test/importacao-aplicar.test.ts` (a criar).
- **Risco de segurança:** corrida entre dois aplicares; lote com 5 000 linhas numa transação.
- **Impacto LGPD:** dado pessoal entra pela porta de importação: autoria e lote na trilha.
- **Migração necessária:** Sim (`NNN_importacao_aplicada.sql`, a numerar na execução).
- **Compatibilidade:** aditiva; `canal_entrada` e o CHECK não mudam.
- **Rollback:** migration inversa com o desfazer (E14) já aplicado.
- **Testes positivos:** lote de 100 cria 100 ocorrências com protocolos em sequência por ano.
- **Testes negativos:** aplicar duas vezes em paralelo cria uma vez; arquivo corrigido reaplicado conta as "já importadas"; falha na linha 50 não deixa nenhuma criada.
- **Testes de autorização e isolamento:** administrador do B aplica o lote do A: 404; ocorrência importada de A invisível em B; agente de campo: 403.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:isolamento`, `npm run test:e2e:api`; G00 a G14 e G32.
- **E2E:** `npm run test:e2e:api`: validar, aplicar e ver as ocorrências na lista.
- **Validação humana:** Alyson confere as ocorrências importadas.
- **Evidência a produzir:** `docs/evidencias-v2/G33/V2-F33-E13/`.
- **Documentação a atualizar:** `docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** aplicação idempotente, atômica e auditada.
- **Checkpoint:** CP-90 (protocolo legado e estados; sem decisão só dado sintético).

### V2-F33-E14 - Desfazer o lote pelo encerramento com motivo, sem apagar
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (depende da E13)
- **Objetivo:** desfazer um lote encerrando com motivo as ocorrências intocadas e dizendo o que ficou.
- **Problema que resolve:** "registro não se apaga, se encerra com motivo"; um lote errado precisa sair da fila sem DELETE.
- **Origem:** PR:D-17; ALY:OCO-08; ALY:FLU-04; ADR 0002.
- **Estado atual:** CRIAR (usa o encerramento de `ocorrencias.ts:1081`).
- **Dependências de entrada:** E13.
- **O que deve ser implementado:**
  - API: `POST /v1/importacoes/:id/desfazer` `{motivo}` (ação `desfazer_importacao`: administrador; motivo de 20 caracteres ou mais); encerra com "Importação desfeita (lote N): motivo" cada ocorrência `registrada` sem evento além de `registro`, sem vistoria, providência nem documento; as demais (com atividade, ou já encerradas no arquivo) ficam e entram no relatório do desfazer; lote vira `desfeita` ou `desfeita_parcial`.
  - Banco: lote e linhas sem policy de DELETE; reimportar linha de lote desfeito: 409 `linha_ja_importada`.
- **O que NÃO deve ser implementado nesta etapa:** apagar ocorrência; desfazer ocorrência com atividade; tela (E15).
- **Arquivos e módulos prováveis:** `apps/api/src/importacao/desfazer.ts` (a criar), `apps/api/src/rotas/importacoes.ts`, `db/test/importacao-desfazer.test.ts` (a criar).
- **Risco de segurança:** encerrar o que alguém já trabalhou.
- **Impacto LGPD:** Não se aplica: sem dado novo.
- **Migração necessária:** Não (estados da E12).
- **Compatibilidade:** só lotes novos.
- **Rollback:** Não se aplica: ato auditado; correção é novo lote.
- **Testes positivos:** lote intocado vira `desfeita` e todas as ocorrências encerradas com o motivo.
- **Testes negativos:** ocorrência triada continua aberta e aparece no relatório; motivo curto: 422; DELETE direto: negado; lote já desfeito: 409.
- **Testes de autorização e isolamento:** coordenador desfaz: 403; B desfaz o lote do A: 404.
- **Regressão obrigatória:** `npm run test:api` (`encerrada-nao-recebe-ato`), `npm run test:isolamento`, `npm run test:e2e:api`; G00 a G14 e G32.
- **E2E:** `npm run test:e2e:api`: importar, triar uma, desfazer e ler o relatório.
- **Validação humana:** Alyson vê as ocorrências encerradas com o motivo.
- **Evidência a produzir:** `docs/evidencias-v2/G33/V2-F33-E14/`.
- **Documentação a atualizar:** `docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** desfazer sem apagar, com resto explicado.
- **Checkpoint:** Não.

### V2-F33-E15 - Painel de importação: enviar, conferir a prévia, aplicar e desfazer
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (mesmo repositório de dados)
- **Objetivo:** conduzir o município pelos quatro passos, com os erros legíveis.
- **Problema que resolve:** as rotas das E12 a E14 não têm tela e um relatório ilegível faz o município desistir.
- **Origem:** PR:D-17; ALY:OCO-08; REL:11.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E14; E11; F08-E13.
- **O que deve ser implementado:**
  - Frontend: `apps/web/src/paginas/Importacao.tsx` (a criar), rota `/importacao`: "Baixar o modelo", "Arquivo CSV (até 5 MB e 5 000 linhas)", prévia "N linhas: X aceitas, Y com erro" com os primeiros 50 erros e "Baixar relatório"; "Aplicar importação" com confirmação que repete os números; histórico de lotes com "Desfazer lote" e campo "Motivo (pelo menos 20 caracteres)"; estados vazio, erro e carregando; operador não vê a rota.
  - Acessibilidade: foco no resumo da prévia e `aria-live` polite.
- **O que NÃO deve ser implementado nesta etapa:** edição das linhas na tela; importação de arquivos além do CSV.
- **Arquivos e módulos prováveis:** `apps/web/src/paginas/Importacao.tsx` (a criar), `apps/web/src/dados/repositorio.ts`, `http.ts`, `apps/web/src/App.tsx`.
- **Risco de segurança:** aplicar sem ver a prévia: o botão só abre com o lote `pronta`.
- **Impacto LGPD:** tela sem valores de célula.
- **Migração necessária:** Não.
- **Compatibilidade:** modo local mostra "Disponível só com API".
- **Rollback:** esconder a rota.
- **Testes positivos:** enviar, conferir, aplicar e ver o lote no histórico.
- **Testes negativos:** CSV com erro mostra a lista e bloqueia "Aplicar" sem a opção de ignorar; 6 MB mostra o limite.
- **Testes de autorização e isolamento:** operador: rota negada; coordenador não vê "Desfazer lote".
- **Regressão obrigatória:** `npm test --workspace @dc360/web`, `npm run test:e2e`; G00 a G14 e G32.
- **E2E:** `fluxo-api.e2e.mjs`: importar e desfazer; Playwright captura.
- **Validação humana:** Alyson importa um CSV sintético; capturas aprovadas no portão visual.
- **Evidência a produzir:** `docs/evidencias-v2/G33/V2-F33-E15/` com `capturas/INDEX.md`.
- **Documentação a atualizar:** `docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** quatro passos na tela, com relatório legível.
- **Checkpoint:** Não.

### V2-F33-E16 - Manifesto, saída, eliminação, retenção e isolamento das tabelas de configuração e importação
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** não (edita o manifesto e o pacote)
- **Objetivo:** toda tabela e coluna nova entra no inventário e provada isolada.
- **Problema que resolve:** tabela sem classificação reprova o teste de catálogo (F05-E02); o CSV original duplica dado pessoal no armazenamento.
- **Origem:** DP:T41; PR:D-17; BZ-F:P0-LGPD.
- **Estado atual:** EXPANDIR `db/src/manifesto.ts` (F05-E01, E03, E05).
- **Dependências de entrada:** E02; E10; E13; F05-E05.
- **O que deve ser implementado:**
  - Domínio: entradas do manifesto: `configuracao_versoes`, `configuracao_rascunhos`, `configuracao_eventos`, `importacoes_lotes`, `importacoes_linhas` (tenant; saem; a eliminação apaga); `ocorrencias.dados_do_tipo` como texto livre pessoal (a minimização, `privacidade/minimizacao.ts`, o alcança) e `protocolo_legado`.
  - API: o pacote de saída inclui versões, eventos e lotes; arquivo CSV da classe `importacao_csv` expurgado pela limpeza (F06-E10) 30 dias depois do lote aplicado ou desfeito (valor proposto, CP-10).
  - Testes: `db/test/isolamento.test.ts` e `eliminacao-de-municipio.test.ts` cobrem as tabelas.
- **O que NÃO deve ser implementado nesta etapa:** prazo definitivo de retenção (CP-10).
- **Arquivos e módulos prováveis:** `db/src/manifesto.ts`, `apps/api/src/saida/pacote.ts`, `apps/api/src/privacidade/minimizacao.ts`, `db/test/isolamento.test.ts`.
- **Risco de segurança:** CSV com nomes esquecido no armazenamento.
- **Impacto LGPD:** inventário completo; texto livre e CSV sob retenção.
- **Migração necessária:** Sim (`NNN_eliminacao_da_configuracao.sql`, a numerar na execução; ordem de apagamento).
- **Compatibilidade:** pacote de saída ganha arquivos.
- **Rollback:** migration corretiva.
- **Testes positivos:** pacote de saída traz versões e lotes; eliminação apaga as cinco tabelas.
- **Testes negativos:** tabela nova sem entrada reprova o catálogo; CSV de lote aplicado há 31 dias é expurgado e o de 29 dias não.
- **Testes de autorização e isolamento:** pacote do A sem versão ou lote do B; CA-06 verde com as tabelas novas.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api` (`saida-de-municipio`, `eliminacao-de-municipio`, `minimizacao`); G00 a G14 e G32.
- **E2E:** `npm run test:e2e:api`: saída e eliminação com configuração e lote sintéticos.
- **Validação humana:** Rafael confere a lista do manifesto.
- **Evidência a produzir:** `docs/evidencias-v2/G33/V2-F33-E16/`.
- **Documentação a atualizar:** `docs/SAIDA-DE-MUNICIPIO.md`, `docs/PRIVACIDADE.md`.
- **Definition of Done:** tudo classificado, isolado e com retenção.
- **Checkpoint:** Não.

# GATE G33 - CONFIGURAÇÃO, CHECKLIST E IMPORTAÇÃO PROVADOS

Só passa se:
- [ ] V2-F33-E01: ADR da configuração versionada aceita (sete decisões); hash em `docs/evidencias-v2/G33/V2-F33-E01/`.
- [ ] V2-F33-E02: versão 1 em todo município (existente e novo), tabelas imutáveis e versão aplicada impossível de trocar; fixtures iguais no Zod e no SQL (`configuracao-versionada.test.ts`).
- [ ] V2-F33-E03: prazo pela versão aplicada, igual no shared e no banco; tipo desligado barrado; ocorrência aberta antes da publicação mantém o prazo.
- [ ] V2-F33-E04: publicar, restaurar e trilha de versão provados, com 409 em rascunho velho; CP-88 decidido ou adiado (só o administrador publica).
- [ ] V2-F33-E05: avaliador único de checklist condicional, igual no shared, no SQL e no jest do campo; CP-89 decidido ou adiado (só o padrão e exemplos sintéticos).
- [ ] V2-F33-E06: vistoria validada pela versão declarada; coleta feita com versão antiga aceita depois de nova publicação; envelope legado aceito.
- [ ] V2-F33-E07: tarefa baixada com checklist e avaliada em modo avião, com cache da versão antiga preservado.
- [ ] V2-F33-E08, E09, E11 e E15: telas com E2E e capturas (e fotos do aparelho na E08) aprovadas no portão visual de `19-definicao-de-pronto.md`, seção 0 (nada desalinhado, grudado ou fora do lugar; texto bem escrito), nos dois temas e nos estados normal, vazio, erro e carregando.
- [ ] V2-F33-E10: texto delimitado do modelo escapado e congelado no snapshot; sem texto, hash igual ao de antes.
- [ ] V2-F33-E12: prévia exata com erros por linha e coluna e zero efeito nos dados; 5 001 linhas e 6 MB recusados.
- [ ] V2-F33-E13: aplicação atômica e idempotente (duas em paralelo criam uma vez; arquivo corrigido não duplica) e protocolos sem repetição.
- [ ] V2-F33-E14: desfazer por encerramento com motivo, sem DELETE, com o que ficou no relatório; CP-90 decidido ou adiado (só dado sintético).
- [ ] V2-F33-E16: tabelas no manifesto, pacote de saída e eliminação cobrindo-as, CSV expurgado no prazo proposto, CA-06 verde.
- [ ] Nenhuma regressão: gates G00 a G14 e G32 continuam verdes (se um quebrar, ESTE gate volta a REPROVADO), com `npm run test:isolamento`, `npm run test:api`, `npm run test:campo`, `npm run test:console`, `npm run test:scripts`, `npm run auditar` e `npm run typecheck` verdes.
- [ ] Documentação atualizada e evidências arquivadas em `docs/evidencias-v2/G33/`.

**Reabre se:** ocorrência, vistoria ou documento passar a poder trocar a versão aplicada; publicação alterar o prazo de ocorrência já aberta; vistoria feita offline com versão antiga for recusada; algum caminho apagar ocorrência ou lote em vez de encerrar com motivo; tabela de configuração ou importação ficar sem entrada no manifesto; `dc360_app` ganhar UPDATE em versão ou evento.

**Este Gate libera:** G15 (a próxima fase na ordem de execução), a F19 (o campo e o payload do agente carregam a versão aplicada), a F29 e a F30 (as ocorrências agrupadas e entregues continuam com a versão aplicada; a F30 guarda a própria configuração de alertas em `logistica_configuracoes`, F30-E11), a F20 (F20-E18: a versão 1 nasce no gatilho de `organizacoes`, que o provisionamento já usa) e G26 a G28 (POC, piloto e candidata cobrem configuração e importação).
