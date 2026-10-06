# Fase 21: Observabilidade

**Gate da fase:** G21 OBSERVABILIDADE | **Depende dos gates:** todos os anteriores NA ORDEM DE EXECUÇÃO de `STATUS.md` (o imediato é G20; D-29) | **Superfícies tocadas:** `apps/api` (`/saude`, worker e API pública), `apps/console`, `apps/campo` e `apps/cidadao` (reportador e cabeçalhos), `apps/web` (cabeçalhos), `db`, monitor externo e alertas, `dc360/docs` | **Checkpoints da fase:** CP-06, CP-07, CP-60

O P0 JÁ EXISTE na F01-E14 e é MANTIDO: `X-Request-Id`, erro centralizado da API e do painel, monitor externo de `/saude`, rotinas em nível `error` e alerta de storage a 80%. Esta fase entrega o P1: crash dos apps móveis com alerta (E01), fila de arquivos e de sincronização (E02), falha de push e e-mail (E03), saúde semântica por serviço (E04), página de status e painel por município (E05), plantão e canal lido por alguém (E06), runbook de incidente (E07), retenção e residência de log e erro (E08) e percentis de latência por rota (E09).

Por D-13, o que era P2 ENTRA: tracing distribuído e SLO por rota crítica. A premissa é OpenTelemetry com destino configurável: instrumentação das três pontas de servidor (E10), propagação do request id e do contexto de trace até o worker e os apps (E11), amostragem com custo limitado (E12), SLO por rota crítica com alerta por taxa de consumo do orçamento de erro (E13) e painel de SLO no console (E14). A ferramenta de destino e a residência do dado são CP-60, atrás de CP-06: sem a decisão, E10 a E12 rodam só em HML e o destino padrão fica desligado. A fase NÃO fixa SLA contratual (F28-E05, CP-31). Alerta sem plantão é inútil: a E06 (P0, CP-07) dá destinatário a todo o resto.

Ordem sugerida: E06 e E08 começam já (documento e decisão, sem código); E04 depois da F07-E07; E02 e E03 depois de G07 e G01; E01 depois de F14-E07 e F17-E16; E07 depois da E06; E05 por último dos originais; E10 depois da E09, E11 e E12 em seguida, E13 depois da E12, E14 por último (G20 e E13). E02, E03 e E04 mexem nas respostas de `/saude`: em sequência. As etapas com tela (E05 e E14) passam pelo portão visual de `19-definicao-de-pronto.md`, seção 0, e pelo comando da F08-E13, com capturas arquivadas.

## Etapas

### V2-F21-E01 - Crash e erro dos apps móveis chegam ao destino com alerta
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E03)
- **Objetivo:** crash e erro de JS dos apps de campo e do cidadão chegam ao destino de CP-06, sem dado pessoal, legíveis e com alerta.
- **Problema que resolve:** `BZ-D:OPS-50`: F14-E07 e F17-E16 criam o reportador (`apps/campo/src/observabilidade/reportador.ts`) e o filtro; faltam destino de produção, mapas de origem por build e regra de alerta.
- **Origem:** DP:T33; DP:K13; REL:10 (OPS-40, OPS-50); BZ-D:CMP-78.
- **Estado atual:** EXPANDIR (reportadores de F14-E07 e F17-E16).
- **Dependências de entrada:** F14-E07; F17-E16.
- **O que deve ser implementado:**
  - Mobile: mapas de origem e símbolos nativos por build no pipeline EAS (`eas.json` dos dois apps) ao destino de CP-06; `release` (versão e build de `X-App-Version`, F02-E06) e `ambiente` em todo evento; erro de teste oculto só em HML.
  - Infraestrutura: alertas: primeira ocorrência numa versão nova; sessões sem crash abaixo de 99% (inicial); 20 erros iguais em 15 min; vão ao canal da E06, sem município.
- **O que NÃO deve ser implementado nesta etapa:** ErrorBoundary e reportador (F14-E07, F17-E16); analytics de uso; retenção do destino (E08); tracing (E10).
- **Arquivos e módulos prováveis:** `apps/campo/eas.json`, `apps/campo/src/observabilidade/reportador.ts`, `apps/cidadao/` (F17-E02), `dc360/docs/SUBPROCESSADORES.md`.
- **Risco de segurança:** mapa de origem expõe o código ao destino: sem segredo no bundle.
- **Impacto LGPD:** evento sem dado pessoal (filtro testado); subprocessador com aviso de 30 dias.
- **Migração necessária:** Não.
- **Compatibilidade:** sem DSN nada sai.
- **Rollback:** retirar o DSN do perfil EAS.
- **Testes positivos:** build de HML com erro oculto: evento com release, ambiente e pilha legível; o alerta de versão nova chega ao canal.
- **Testes negativos:** e-mail, token e coordenada na mensagem chegam mascarados; 50 erros iguais viram um alerta.
- **Testes de autorização e isolamento:** o evento não leva `organizacaoId`, `usuarioId` nem `authorization`.
- **Regressão obrigatória:** `npm run test:campo`, `npm run test:scripts`; gates anteriores.
- **E2E:** aparelho físico com build de HML: crash nativo simbolicado no destino.
- **Validação humana:** Rafael provoca o crash e recebe o alerta.
- **Evidência a produzir:** `docs/evidencias-v2/G21/V2-F21-E01/`.
- **Documentação a atualizar:** `apps/campo/LEIA-ME.md`.
- **Definition of Done:** crash simbolicado e alertado em HML nos dois apps.
- **Checkpoint:** Não (o destino em PROD é de CP-06, na E08).

### V2-F21-E02 - Fila de arquivos e de sincronização em /saude (profundidade e idade)
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (E03 e E04 mexem em `/saude`)
- **Objetivo:** profundidade e idade das filas de arquivos e de sincronização aparecem em `/saude`, com alerta.
- **Problema que resolve:** `BZ-D:OPS-42`: a sincronização só deixa recusas em `req.log.warn` (`rotas/sincronizacao.ts`) e `aparelhos_sem_aparecer`; o `/saude` do worker (F07-E07) não traz a idade por tipo.
- **Origem:** DP:T33; REL:10 (OPS-41, OPS-42); REL:03.
- **Estado atual:** EXPANDIR (`/saude` da F07-E07).
- **Dependências de entrada:** G07.
- **O que deve ser implementado:**
  - Banco: `aparelhos.fila_pendentes`, `fila_idade_s` e `fila_informada_em` (só números, CHECK de faixa), gravados por `POST /aparelhos` e pelos cabeçalhos `X-Fila-Pendentes` e `X-Fila-Idade` do app em `/sincronizacao/*`.
  - API: `/saude` do worker devolve por tipo profundidade, idade do mais antigo e mortos (`fila_de_trabalho`), e para arquivos a idade em `em_verificacao`; a da API devolve `sincronizacao` (`aparelhos_com_fila_parada`: fila acima do limite com `visto_em` recente, inicial 6 h): só números.
  - Mobile: `packages/campo/src/fila.ts` expõe contagem e idade; `apps/campo/src/dados/api.ts` envia os cabeçalhos. Alerta da E06: idade de arquivos acima de 10 min (inicial) ou mortos acima de 0.
- **O que NÃO deve ser implementado nesta etapa:** conteúdo das filas; painel por município (E05); reprocesso manual (F06-E10).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/servicos/worker.ts`, `apps/api/src/rotas/aparelhos.ts`, `apps/api/src/rotas/sincronizacao.ts`, `packages/campo/src/fila.ts`, `apps/campo/src/dados/api.ts`.
- **Risco de segurança:** `/saude` é pública: só agregado global.
- **Impacto LGPD:** contagem e idade por aparelho: dado técnico, sem conteúdo.
- **Migração necessária:** Sim (`NNN_fila_do_aparelho_visivel.sql`).
- **Compatibilidade:** app antigo sem cabeçalho: campos nulos.
- **Rollback:** ignorar os cabeçalhos.
- **Testes positivos:** arquivos em `em_verificacao` há 20 min com worker parado: alerta; aparelho com fila há 8 h entra em `aparelhos_com_fila_parada`.
- **Testes negativos:** `X-Fila-Pendentes: -1` ou 999999: ignorado; sem worker, `fila: indisponivel`, não 200.
- **Testes de autorização e isolamento:** agente de A não altera aparelho de B (404); `/saude` sem token não lista município.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:isolamento`, `npm run test:campo`; gates anteriores.
- **E2E:** HML: parar o worker, enviar anexo sintético, ver o alerta.
- **Validação humana:** Rafael derruba o worker em HML e lê a idade.
- **Evidência a produzir:** `docs/evidencias-v2/G21/V2-F21-E02/`.
- **Documentação a atualizar:** `INDISPONIBILIDADE.md`.
- **Definition of Done:** idade e profundidade das duas filas em `/saude`, com alerta provado.
- **Checkpoint:** Não.

### V2-F21-E03 - Push e e-mail: contagem de falha e alerta
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E01)
- **Objetivo:** falha de push e de e-mail vira contagem por motivo e alerta, e a cota diária de e-mail avisa antes de estourar.
- **Problema que resolve:** `BZ-D:OPS-43`, `OPS-44`: o push só mostra a última rodada de UMA máquina em `/saude`; o e-mail só tem `oficio_envios` e `req.log.error`; o Resend gratuito (100 por dia) estoura em dia de temporal.
- **Origem:** DP:T33; REL:10 (OPS-43, OPS-44, D10).
- **Estado atual:** EXPANDIR.
- **Dependências de entrada:** G01.
- **O que deve ser implementado:**
  - Banco: `entregas_externas` (plataforma, como `batimentos_de_servico` da F07-E07: sem município nem dado pessoal; `dia`, `canal` (push, e-mail, depois SMS e WhatsApp), `tipo`, `resultado` (`ok`, `falha`, `rejeitado`, `token_invalido`), `motivo`, `quantidade`).
  - API: `criarEnvio` (`push/envio.ts`) e `notificadorHttp` (`auth/notificador.ts`) passam por decorador que conta; token inválido (APNs 410, FCM `UNREGISTERED`) NÃO é falha do sistema; credencial recusada (APNs 403) é crítica.
  - Observabilidade: alertas: credencial recusada, na hora; falha de provedor acima de 20% em 15 min (mínimo 10 envios, inicial); e-mail a 80% da cota (`EMAIL_LIMITE_DIARIO`, nova em `config.ts`) ou rejeição acima de 5%.
- **O que NÃO deve ser implementado nesta etapa:** webhook de entrega; o envio de SMS (F34-E15) e WhatsApp (F31-E09), que reusam o decorador; painel (E05).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/push/envio.ts`, `push/varredor.ts`, `auth/notificador.ts`, `config.ts`, `servicos/worker.ts`.
- **Risco de segurança:** contador sem município.
- **Impacto LGPD:** só contagens por motivo; sem destinatário.
- **Migração necessária:** Sim (`NNN_contagem_de_entregas.sql`).
- **Compatibilidade:** sem `EMAIL_LIMITE_DIARIO` só o alerta de cota desliga.
- **Rollback:** migration corretiva.
- **Testes positivos:** push com 403 de credencial incrementa `falha` e alerta; 90 e-mails de 100 de cota alertam.
- **Testes negativos:** `UNREGISTERED` conta `token_invalido` e não alerta; falha na contagem não derruba o envio.
- **Testes de autorização e isolamento:** `entregas_externas` sem município nem dado pessoal; nenhuma rota de agente a lê.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:isolamento`; gates anteriores.
- **E2E:** HML: credencial inválida de teste, ver o alerta.
- **Validação humana:** Rafael recebe o alerta de credencial.
- **Evidência a produzir:** `docs/evidencias-v2/G21/V2-F21-E03/`.
- **Documentação a atualizar:** `LIGAR-O-EMAIL.md`.
- **Definition of Done:** falha contada por motivo, com alerta e cota de e-mail provados.
- **Checkpoint:** Não.

### V2-F21-E04 - Saúde semântica (console, API, worker, API pública)
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (mesmas respostas de E02 e E03)
- **Objetivo:** cada serviço responde se FAZ o que deve, e o monitor chama a sonda certa de cada um.
- **Problema que resolve:** `GET /saude` do console devolve `{ ok: true }` sem olhar o banco (`apps/console/src/servidor.ts:1338`, `BZ-D:OPS-38`); API e worker têm a semântica da F07-E07; a API pública (F15-E08) é nova; "calado" mede o relógio (`BZ-D:CON-27`).
- **Origem:** DP:T33; REL:10 (OPS-36 a OPS-38).
- **Estado atual:** EXPANDIR.
- **Dependências de entrada:** F07-E07.
- **O que deve ser implementado:**
  - API: o console ganha `GET /pronto`: transação com `SET LOCAL ROLE dc360_console`, conferência de `esquema.ts` e `max(atualizado_em)` de `metricas_municipio`; 503 se o banco não responde, o esquema perdeu algo ou o resumo parou há mais de 36 h; `/saude` segue só liveness.
  - API: `/pronto` do modo `publica` confere banco com o papel dela, tabelas de cota (F15-E10) e batimento do worker (`batimentos_de_servico`); no worker, `ultimo_sucesso_em` de relógio acima de dois intervalos dá 503.
  - Infraestrutura: o monitor da F01-E14 chama `/pronto` dos quatro serviços, com alerta distinto por serviço.
- **O que NÃO deve ser implementado nesta etapa:** página de status (E05); SLO (E13); alerta de negócio (E02, E03).
- **Arquivos e módulos prováveis:** `apps/console/src/servidor.ts`, `esquema.ts`, `apps/api/src/servicos/publica.ts`, `servicos/worker.ts`, `fly.console.toml`, `apps/console/test/saude-semantica.test.ts` (a criar).
- **Risco de segurança:** sonda pública não vaza município, versão detalhada nem erro do banco.
- **Impacto LGPD:** Não se aplica: sem dado pessoal.
- **Migração necessária:** Não.
- **Compatibilidade:** `/saude` do console segue 200.
- **Rollback:** reverter o commit.
- **Testes positivos:** banco, esquema e resumo em dia: `/pronto` do console 200.
- **Testes negativos:** banco fora, função do contrato removida, `metricas_municipio` parada há 40 h ou relógio do worker vencido: 503.
- **Testes de autorização e isolamento:** `/pronto` sem token não devolve município nem versão.
- **Regressão obrigatória:** `npm run test:console`, `npm run test:api`; gates anteriores.
- **E2E:** HML: derrubar o banco, ver um alerta por serviço.
- **Validação humana:** Rafael derruba cada serviço e confere o alerta.
- **Evidência a produzir:** `docs/evidencias-v2/G21/V2-F21-E04/`.
- **Documentação a atualizar:** `INDISPONIBILIDADE.md`.
- **Definition of Done:** quatro serviços com `/pronto` semântico e alerta distinto.
- **Checkpoint:** Não.

### V2-F21-E05 - P1: página de status e painel por município no console
- **Prioridade:** P2
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (G20 e E02 a E04)
- **Objetivo:** página de status pública fora de Fly, Vercel e Supabase e painel de saúde por município no console.
- **Problema que resolve:** `INDISPONIBILIDADE.md` seção 4: a página "ainda não existe" e deve ficar fora da infraestrutura monitorada; o console mostra cadastro e retrato, não saúde (`BZ-D:OPS-16`, `OPS-52`).
- **Origem:** DP:T33; DP:J7; REL:10 (OPS-16, OPS-52).
- **Estado atual:** CRIAR (página) e EXPANDIR (console).
- **Dependências de entrada:** G20.
- **O que deve ser implementado:**
  - Infraestrutura: página ESTÁTICA em provedor que não seja Fly, Vercel nem Supabase (terceiro entra antes em `SUBPROCESSADORES.md`, CP-06), alimentada por sonda de `/pronto` (E04): 24 h por serviço e histórico sem apagar, escrito por quem fecha o incidente (E07); sem município.
  - Migration: `aparelhos_com_fila_parada` (E02) e `push_falhas_24h` (de `notificacoes_enviadas.desfecho`) em `metricas_municipio`, `resumir_municipio(date)` e `console_situacao_dos_municipios`; nomes sem as palavras proibidas do portão.
  - Frontend: aba "Saúde" no console (pior estado primeiro, ícone e texto) com `ultimo_acesso_em` e `relogio_parado` (F20-E07); link da página na mensagem de erro 5xx do painel.
- **O que NÃO deve ser implementado nesta etapa:** SLA contratual (F28-E05); percentis de latência (E09).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/console/src/consultas.ts`, `pagina.ts`, `apps/api/src/metricas/resumo.ts`, `apps/web/src/dados/http.ts`.
- **Risco de segurança:** página pública: só estado de serviço, sonda sem credencial.
- **Impacto LGPD:** sem dado de município na página; contagens.
- **Migração necessária:** Sim (`NNN_metricas_de_saude.sql`).
- **Compatibilidade:** colunas nuláveis.
- **Rollback:** migration corretiva; remover a página.
- **Testes positivos:** serviço derrubado em HML aparece na página; município sintético com fila parada aparece na aba.
- **Testes negativos:** coluna com nome ou tipo proibido reprova `isolamento.test.ts`; a página não traz município.
- **Testes de autorização e isolamento:** `resumir_municipio` como A não escreve linha de B.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:console`; G20.
- **E2E:** HML: derrubar a API, ver a página mudar; Playwright captura a página e a aba.
- **Validação humana:** Rafael abre a página de fora da rede do Fly na queda; capturas aprovadas (19, seção 0).
- **Evidência a produzir:** `docs/evidencias-v2/G21/V2-F21-E05/`: testes, E2E e `capturas/INDEX.md`.
- **Documentação a atualizar:** `INDISPONIBILIDADE.md` (seção 4).
- **Definition of Done:** página viva fora da infraestrutura monitorada, com histórico; aba por município.
- **Checkpoint:** Não.

### V2-F21-E06 - Plantão, canal de alerta e segunda pessoa
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** sim (com E08)
- **Objetivo:** todo alerta tem destinatário por função, canal lido por alguém e prazo de resposta, provado por simulado.
- **Problema que resolve:** `BZ-D:OPS-15`, `OPS-39`: contatos de `INDISPONIBILIDADE.md` seção 6 vazios e nenhum alerta ativo; fator de ônibus 1 (REL:10 D4).
- **Origem:** DP:K15; REL:10 (D4; OPS-15, OPS-39).
- **Estado atual:** CRIAR.
- **Dependências de entrada:** nenhuma; CP-07.
- **O que deve ser implementado:**
  - Documentação: `dc360/docs/runbooks/plantao.md`: severidade 1 a 4 (`INDISPONIBILIDADE.md` seção 2) por origem do alerta (E01 a E04, storage, backup velho da F22-E01), com canal, destinatário e reserva por função, prazo de resposta e escalonamento (nível 1 sem reconhecimento em 15 min vai à segunda pessoa); escala com horários, ou "melhor esforço" escrito.
  - Infraestrutura: monitor com reconhecimento obrigatório e reaviso, canal que toca no telefone mais um segundo; batimento semanal sintético que o plantão DEVE reconhecer; alerta só com serviço e código.
  - Documentação: seção 6 preenchida por função e canal (nome e telefone no cofre).
- **O que NÃO deve ser implementado nesta etapa:** SLA e disponibilidade (F28-E05, CP-31); suporte do piloto (F27-E02); runbook de incidente (E07).
- **Arquivos e módulos prováveis:** `dc360/docs/runbooks/plantao.md` (a criar), `dc360/docs/INDISPONIBILIDADE.md`.
- **Risco de segurança:** plantão amplia o acesso a dado de cidadão: mínimo e MFA (F01-E16).
- **Impacto LGPD:** contatos de plantão: fora do repositório.
- **Migração necessária:** Não.
- **Compatibilidade:** nada muda no produto.
- **Rollback:** reverter o documento e a rota do monitor.
- **Testes positivos:** simulado: derrubar a API de HML; reconhecimento do nível 1 em até 15 min.
- **Testes negativos:** alerta sem reconhecimento em 15 min escala à segunda pessoa; batimento semanal ignorado gera pendência.
- **Testes de autorização e isolamento:** Não se aplica: sem dado de tenant; o alerta não carrega município.
- **Regressão obrigatória:** `npm run test:scripts`; gates anteriores.
- **E2E:** o simulado é o E2E de operação.
- **Validação humana:** a segunda pessoa reconhece o simulado.
- **Evidência a produzir:** `docs/evidencias-v2/G21/V2-F21-E06/` (tempos).
- **Documentação a atualizar:** `INDISPONIBILIDADE.md` (seção 6).
- **Definition of Done:** simulado de nível 1 reconhecido no prazo; seção 6 preenchida.
- **Checkpoint:** CP-07 (K15: bloqueia plantão real, F27-E02 e SLA; o rascunho se faz antes).

### V2-F21-E07 - Runbook de incidente e comunicação ao município
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** baixa  |  **Risco:** médio  |  **Paralelizável:** não (usa o plantão da E06)
- **Objetivo:** runbook de incidente executável, com modelos de comunicação ao município, registro e pós-incidente.
- **Problema que resolve:** `INDISPONIBILIDADE.md` (seções 3.1 a 3.5) é prosa sem modelo de mensagem, registro nem simulado (`BZ-D:OPS-14`).
- **Origem:** REL:10 (OPS-14, OPS-15); DP:K15.
- **Estado atual:** EXPANDIR (`INDISPONIBILIDADE.md` vira runbook).
- **Dependências de entrada:** E06.
- **O que deve ser implementado:**
  - Documentação: `dc360/docs/runbooks/incidente.md` e `comunicacao-ao-municipio.md` (a criar): passos 3.1 a 3.5 com comando (`fly status`, `fly logs`, `/pronto` dos quatro serviços, página de status); modelo de mensagem por nível (o que não funciona, o que continua, quando haverá nova notícia; sem prometer prazo); destino: contato institucional do município (F20-E03, se existir) e administrador; suspeita de vazamento é nível 1 e dispara a comunicação de `PRIVACIDADE.md`.
  - Documentação: registro `docs/incidentes/AAAA-MM-DD-nome.md` (a criar): linha do tempo em ISO, causa, o que continuou funcionando, ação corretiva, sem dado pessoal; pós-incidente em 5 dias úteis (inicial); histórico alimenta a página de status (E05).
  - Infraestrutura: simulado em HML (queda da API e do banco) pela segunda pessoa, só com o runbook.
- **O que NÃO deve ser implementado nesta etapa:** contingência em papel (já em `INDISPONIBILIDADE.md` seção 5); alerta (E06); SLA (F28-E05).
- **Arquivos e módulos prováveis:** `dc360/docs/runbooks/incidente.md` (a criar), `comunicacao-ao-municipio.md` (a criar), `dc360/docs/INDISPONIBILIDADE.md`.
- **Risco de segurança:** runbook com segredo ou comando errado: só nomes de segredo e comandos conferidos.
- **Impacto LGPD:** registro de incidente sem dado pessoal.
- **Migração necessária:** Não.
- **Compatibilidade:** `INDISPONIBILIDADE.md` aponta para o runbook.
- **Rollback:** reverter os documentos.
- **Testes positivos:** a segunda pessoa conduz o simulado só com o runbook e registra onde o texto falhou.
- **Testes negativos:** comando inexistente ou promessa de prazo no modelo reprova a revisão.
- **Testes de autorização e isolamento:** Não se aplica: documento.
- **Regressão obrigatória:** `npm test`; gates anteriores.
- **E2E:** o simulado em HML.
- **Validação humana:** Rafael lê o registro do simulado.
- **Evidência a produzir:** `docs/evidencias-v2/G21/V2-F21-E07/`.
- **Documentação a atualizar:** `INDISPONIBILIDADE.md`.
- **Definition of Done:** simulado só com o runbook; modelos e registro prontos.
- **Checkpoint:** Não.

### V2-F21-E08 - Retenção, residência e destino do log e do erro
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E06)
- **Objetivo:** decidir e documentar para onde vão log e erro, em que país, por quanto tempo e quem acessa, e aplicar o prazo no destino.
- **Problema que resolve:** `BZ-D:OPS-32`: o log vai à saída padrão do Fly, sem destino longo nem prazo, e leva IP, identificador de ocorrência e (`INDISPONIBILIDADE.md` seção 4.1) e-mail de servidor, contra `PRIVACIDADE.md`; sem `LOG_NIVEL`.
- **Origem:** DP:K13; DP:J7; REL:10 (OPS-30, OPS-32); ALY:RNF-05.
- **Estado atual:** EXPANDIR.
- **Dependências de entrada:** nenhuma; CP-06.
- **O que deve ser implementado:**
  - Documentação: tabela em `SUBPROCESSADORES.md` e `PRIVACIDADE.md` seção 4: destino do log e do erro, país, prazo em número (CP-06 e parecer) e acesso por função (F01-E16).
  - API: `LOG_NIVEL` na API e no console (padrão `info`); `log.test.ts` prova que a linha de login não leva e-mail em claro (senão mascarar); console com `redact` e `genReqId` como a API.
  - Infraestrutura: aplicar o prazo no destino (retenção configurada, com captura).
- **O que NÃO deve ser implementado nesta etapa:** SIEM e pesquisa avançada; trilha de auditoria (segue no banco); ferramenta nova sem CP-06.
- **Arquivos e módulos prováveis:** `apps/api/src/config.ts`, `apps/console/src/config.ts`, `apps/console/src/servidor.ts`, `apps/api/test/log.test.ts`, `dc360/docs/SUBPROCESSADORES.md`, `dc360/docs/PRIVACIDADE.md`.
- **Risco de segurança:** destino de log com acesso largo expõe IP e identificadores.
- **Impacto LGPD:** fixa o prazo do dado pessoal em log; fora do país é transferência internacional (J7).
- **Migração necessária:** Não.
- **Compatibilidade:** padrão `info` mantém o comportamento.
- **Rollback:** reverter o PR.
- **Testes positivos:** `LOG_NIVEL=warn` suprime `info`; login sem e-mail em claro.
- **Testes negativos:** `LOG_NIVEL` inválido derruba a partida; erro com e-mail chega mascarado (F01-E14).
- **Testes de autorização e isolamento:** o log de A não traz identificador de B; o console não registra corpo.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:console`; gates anteriores.
- **E2E:** HML: provocar erro e achar evento e linha de log pelo `requisicao`.
- **Validação humana:** Rafael lê a tabela e o prazo no destino.
- **Evidência a produzir:** `docs/evidencias-v2/G21/V2-F21-E08/`.
- **Documentação a atualizar:** `SUBPROCESSADORES.md`, `PRIVACIDADE.md`.
- **Definition of Done:** destino, país, prazo e acesso escritos e aplicados; `LOG_NIVEL` testado.
- **Checkpoint:** CP-06 (K13 e J7: bloqueia destino com dado de produção e prazo final).

### V2-F21-E09 - Percentis de latência por rota em produção
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (hook em `servidor.ts`)
- **Objetivo:** p50, p95 e p99 por rota em produção, sem dado pessoal, com alerta quando operação usual passa de 2 s.
- **Problema que resolve:** `BZ-D:OPS-34`: não há métrica de aplicação; a meta de 2 s (ALY:RNF-02) só é medida em carga (F24), nunca no uso real.
- **Origem:** DP:T33; ALY:RNF-02; REL:10 (OPS-34).
- **Estado atual:** CRIAR (base: `X-Request-Id` e log da F01-E14).
- **Dependências de entrada:** F21-E04; F01-E14.
- **O que deve ser implementado:**
  - API: hook `onResponse` em `apps/api/src/servidor.ts` conta histograma por MODELO de rota (`routeOptions.url`, nunca caminho nem query), método e faixa de status, com teto de 200 rotas; requisição acima de 2000 ms gera `warn` com `requisicao`, `rota` e `ms`.
  - Banco: `latencia_por_rota` (plataforma, como `batimentos_de_servico`: sem município, usuário nem IP); gravação aditiva a cada 60 s; o worker apaga linhas com mais de 30 dias; visão `latencia_percentis` dá p50, p95 e p99.
  - Observabilidade: alerta ao canal da E06 se operação usual de `DESEMPENHO.md` ficar com p95 acima de 2000 ms por 15 min.
- **O que NÃO deve ser implementado nesta etapa:** tracing (E10 a E12); SLO (E13); painel por município (E05).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/servidor.ts`, `apps/api/test/latencia-por-rota.test.ts` (a criar).
- **Risco de segurança:** identificador no rótulo vazaria dado: só o modelo, com teto.
- **Impacto LGPD:** sem município, usuário, IP nem caminho real; plataforma no manifesto (F05-E04).
- **Migração necessária:** Sim (`NNN_latencia_por_rota.sql`).
- **Compatibilidade:** hook passivo.
- **Rollback:** `LATENCIA_ATIVA=nao`.
- **Testes positivos:** `GET /ocorrencias/<uuid>` conta em `/ocorrencias/:id`; distribuição conhecida dá o p95.
- **Testes negativos:** 300 caminhos inexistentes geram uma linha; id e query nunca entram; falha no flush não derruba a resposta.
- **Testes de autorização e isolamento:** `dc360_console` sem acesso à tabela; `/pronto` não expõe a latência.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:isolamento`; gates anteriores.
- **E2E:** HML: carga da F24-E02 e leitura da visão.
- **Validação humana:** Rafael compara o p95 da visão com o do k6.
- **Evidência a produzir:** `docs/evidencias-v2/G21/V2-F21-E09/`.
- **Documentação a atualizar:** `DESEMPENHO.md`.
- **Definition of Done:** percentis por rota em HML, sem dado pessoal.
- **Checkpoint:** Não.

### V2-F21-E10 - Tracing distribuído: instrumentação OpenTelemetry da API, do worker e do console
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** médio  |  **Paralelizável:** não (E11 a E13 usam a base)
- **Objetivo:** gerar spans de requisição, banco e job na API, no worker e no console, exportados por OTLP a destino configurável, desligado por padrão.
- **Problema que resolve:** um incidente que cruza API, fila e worker só se localiza por log e request id (`BZ-D:OPS-34`).
- **Origem:** PR:D-13; DP:T33; REL:10 (OPS-34).
- **Estado atual:** CRIAR (base: `X-Request-Id`, F01-E14).
- **Dependências de entrada:** E09; F07-E07; CP-60 (destino de produção).
- **O que deve ser implementado:**
  - API: `observabilidade/tracing.ts` (a criar) inicia o SDK OpenTelemetry em `index.ts`: spans do Fastify por MODELO de rota (nunca o caminho), do `pg` e do job do worker; `TRACING_ATIVO` padrão `nao`; sem `OTEL_EXPORTER_OTLP_ENDPOINT` nada sai.
  - Domínio: atributos PERMITIDOS (`http.route`, `http.status_code`, `db.operation`, `requisicao`, `servico`); SQL, parâmetros e `organizacao_id` nunca.
  - API: o console recebe o mesmo SDK em `apps/console/src/index.ts`.
- **O que NÃO deve ser implementado nesta etapa:** propagação (E11); amostragem (E12); SLO (E13); escolha da ferramenta.
- **Arquivos e módulos prováveis:** `apps/api/src/observabilidade/tracing.ts` (a criar), `apps/api/src/index.ts`, `apps/console/src/index.ts`.
- **Risco de segurança:** atributo com dado pessoal ou SQL vaza ao destino: lista permitida e teste; `npm audit` com os pacotes novos.
- **Impacto LGPD:** spans sem dado pessoal; destino fora do país é transferência internacional (J7).
- **Migração necessária:** Não.
- **Compatibilidade:** desligado por padrão.
- **Rollback:** `TRACING_ATIVO=nao`.
- **Testes positivos:** `GET /ocorrencias/<uuid>` gera span `/ocorrencias/:id` com `requisicao`; um job do worker gera span próprio.
- **Testes negativos:** e-mail, CPF e parâmetro injetados não aparecem; sem endpoint, nenhuma conexão de saída; falha do exportador não derruba a resposta.
- **Testes de autorização e isolamento:** span de A sem `organizacaoId`; token inválido, sem identidade.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:console`, `npm audit`; gates anteriores.
- **E2E:** HML com coletor: requisição e job aparecem no destino.
- **Validação humana:** Rafael vê um trace de HML no destino (sem tela do produto: a captura do destino é a evidência).
- **Evidência a produzir:** `docs/evidencias-v2/G21/V2-F21-E10/`: testes e captura do trace de HML.
- **Documentação a atualizar:** `SUBPROCESSADORES.md`.
- **Definition of Done:** spans em HML, sem dado pessoal.
- **Checkpoint:** CP-60 (ferramenta, país, prazo: bloqueia dado de produção).

### V2-F21-E11 - Propagação do request id e do contexto de trace até a fila, o worker e os apps
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (mesmos arquivos de E10 e E12)
- **Objetivo:** um trace id liga o painel ou app, a API, a fila e o worker, e é o código que o usuário vê no erro.
- **Problema que resolve:** o job do worker nasce sem ligação com a requisição que o enfileirou.
- **Origem:** PR:D-13; DP:T33; REL:10 (OPS-34).
- **Estado atual:** EXPANDIR (`X-Request-Id`, F01-E14).
- **Dependências de entrada:** E10; F07-E02.
- **O que deve ser implementado:**
  - Migration: `traceparent` (texto nulável, CHECK no formato W3C) em `fila_de_trabalho` (F07-E02); o enfileirador o grava e o worker o retoma.
  - API: aceita `traceparent` válido; `X-Request-Id` deriva do trace id; `tracestate` e `baggage` são descartados; CORS libera o cabeçalho.
  - Frontend e Mobile: `apps/web/src/dados/http.ts`, `apps/campo/src/dados/api.ts` e o cliente de `apps/cidadao` geram `traceparent` aleatório; o código mostrado no erro e no diagnóstico (F20-E08) é o trace id.
- **O que NÃO deve ser implementado nesta etapa:** SDK nos apps (só o cabeçalho); amostragem (E12).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/servidor.ts`, `apps/web/src/dados/http.ts`, `apps/campo/src/dados/api.ts`, `apps/api/test/propagacao-de-trace.test.ts` (a criar).
- **Risco de segurança:** trace id do cliente nunca é autoridade.
- **Impacto LGPD:** id aleatório, sem identificador de pessoa.
- **Migração necessária:** Sim (`NNN_traceparent_na_fila.sql`).
- **Compatibilidade:** cliente sem cabeçalho recebe trace novo.
- **Rollback:** ignorar a coluna.
- **Testes positivos:** requisição, job e worker compartilham o trace id; o erro mostra o mesmo código.
- **Testes negativos:** `traceparent` malformado: ignorado; `baggage` com `organizacaoId`: descartado; texto fora do formato na coluna: CHECK.
- **Testes de autorização e isolamento:** o `traceparent` da fila é por linha, sob a RLS da F07-E02: o job de A não herda contexto de B.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:campo`, `npm run test:isolamento`; gates anteriores.
- **E2E:** HML: provocar erro no app e achar o trace pelo código.
- **Validação humana:** Rafael acha o trace pelo código; capturas do erro com o código aprovadas (19, seção 0).
- **Evidência a produzir:** `docs/evidencias-v2/G21/V2-F21-E11/`: testes e `capturas/INDEX.md`.
- **Documentação a atualizar:** `INDISPONIBILIDADE.md`.
- **Definition of Done:** um trace id da tela ao worker.
- **Checkpoint:** Não.

### V2-F21-E12 - Amostragem do tracing com custo limitado
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (mesmos arquivos de E10)
- **Objetivo:** exportar só parte dos traces e SEMPRE os de erro e os lentos, com teto de volume.
- **Problema que resolve:** exportar tudo custa e engorda o destino; amostrar às cegas perde o incidente.
- **Origem:** PR:D-13; DP:T33.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E10; E11; E09.
- **O que deve ser implementado:**
  - API: amostrador por taxa (`TRACING_TAXA`: 0,1 em produção e 1 em HML), com `/saude` e `/pronto` nunca amostrados; processador em memória que guarda os spans de cada trace (até 200 traces e 30 s) e exporta, mesmo fora da taxa, o trace cuja raiz terminou em 5xx ou acima de 2000 ms.
  - Infraestrutura: `TRACING_TETO_POR_MINUTO` (padrão 600 spans): o excesso é descartado e contado em log.
- **O que NÃO deve ser implementado nesta etapa:** amostragem no coletor (do destino); SLO (E13).
- **Arquivos e módulos prováveis:** `apps/api/src/observabilidade/amostragem.ts` (a criar), `apps/api/test/amostragem.test.ts` (a criar).
- **Risco de segurança:** buffer estourando a memória da máquina de 1 GB: teto de traces e de tempo.
- **Impacto LGPD:** Não se aplica: nenhum dado novo, só volume.
- **Migração necessária:** Não.
- **Compatibilidade:** herda o padrão desligado de E10.
- **Rollback:** `TRACING_TAXA=0`.
- **Testes positivos:** 1000 requisições a 0,1 exportam cerca de 100; uma resposta 500 e uma de 2500 ms são sempre exportadas.
- **Testes negativos:** `/pronto` nunca exportado; 10 000 erros em 1 minuto exportam até o teto e contam o resto; buffer nunca passa de 200 traces.
- **Testes de autorização e isolamento:** Não se aplica: sem rota; o teste de atributos da E10 roda de novo sobre os traces amostrados.
- **Regressão obrigatória:** `npm run test:api`, `npm audit`; gates anteriores.
- **E2E:** HML: um erro e uma requisição lenta provocados aparecem no destino.
- **Validação humana:** Rafael confere o volume de um dia de HML.
- **Evidência a produzir:** `docs/evidencias-v2/G21/V2-F21-E12/` (contagens e captura do destino).
- **Documentação a atualizar:** `INDISPONIBILIDADE.md`.
- **Definition of Done:** taxa e teto aplicados; erro e lentidão sempre exportados.
- **Checkpoint:** CP-60 (o custo do destino fixa a taxa de produção).

### V2-F21-E13 - SLO por rota crítica com alerta por taxa de consumo do orçamento de erro
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** médio  |  **Paralelizável:** não (hook e worker, como E09)
- **Objetivo:** fixar SLO por rota crítica e alertar pela velocidade com que o orçamento de erro é consumido, em duas janelas.
- **Problema que resolve:** alerta de 5xx isolado não diz se a meta do mês está em risco; sem SLO a F28-E05 fica sem base.
- **Origem:** PR:D-13; DP:T33; ALY:RNF-02.
- **Estado atual:** CRIAR (base: `latencia_por_rota` da E09).
- **Dependências de entrada:** E09; E06.
- **O que deve ser implementado:**
  - Domínio: `dc360/docs/SLO.md` (a criar): rotas críticas (login, criar ocorrência, `/sincronizacao`, confirmar evidência), SLI de disponibilidade (sem 5xx) e de latência (abaixo de 2000 ms), metas iniciais PROPOSTAS de 99,5% e 95% em 30 dias, calibradas na F24-E01, nunca SLA.
  - Banco: `slo_consumo` (plataforma: sem município, usuário nem IP), gravada a cada 5 min pelo worker, e a visão `slo_situacao` com grant ao `dc360_console`.
  - Observabilidade: alerta ao canal da E06 por taxa de consumo: 14,4 vezes o ritmo em 1 h e 5 min (nível 1) e 6 vezes em 6 h e 30 min (nível 2); mínimo de 50 requisições.
- **O que NÃO deve ser implementado nesta etapa:** SLA (F28-E05, CP-31); painel (E14).
- **Arquivos e módulos prováveis:** `dc360/docs/SLO.md` (a criar), `db/migrations/` (nova), `apps/api/src/metricas/slo.ts` (a criar).
- **Risco de segurança:** pouca amostra gera alerta falso.
- **Impacto LGPD:** sem dado pessoal; plataforma (F05-E04).
- **Migração necessária:** Sim (`NNN_slo_por_rota_critica.sql`).
- **Compatibilidade:** aditiva.
- **Rollback:** `SLO_ATIVO=nao`.
- **Testes positivos:** 2% de 5xx por 1 h dispara o nível 1; a visão mostra o consumo.
- **Testes negativos:** 20 requisições com 50% de erro não alertam; rota fora da lista não entra.
- **Testes de autorização e isolamento:** `dc360_app` sem acesso; `dc360_console` só lê a visão.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:isolamento`; gates anteriores.
- **E2E:** HML: injetar erros e ver o alerta no canal.
- **Validação humana:** Rafael e Alyson aprovam as metas como propostas.
- **Evidência a produzir:** `docs/evidencias-v2/G21/V2-F21-E13/` (simulação e alerta).
- **Documentação a atualizar:** `SLO.md`.
- **Definition of Done:** SLO por rota crítica com alerta por taxa de consumo, em HML.
- **Checkpoint:** Não (as metas são propostas; o SLA contratual é CP-31).

### V2-F21-E14 - Painel de SLO no console
- **Prioridade:** P2
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (`pagina.ts`, como F21-E05)
- **Objetivo:** aba "SLO" no console mostra, por rota crítica, o SLI, o orçamento restante e a taxa de consumo, com estado por ícone e texto.
- **Problema que resolve:** sem painel o SLO só existe como alerta e ninguém vê a tendência.
- **Origem:** PR:D-13; DP:T33.
- **Estado atual:** CRIAR (aba), sobre a visão `slo_situacao` da E13.
- **Dependências de entrada:** E13; G20.
- **O que deve ser implementado:**
  - API: `GET /v1/slo` no console (`consultas.ts`), só pela visão, sem município.
  - Frontend: aba "SLO" em `pagina.ts`: tabela por rota (pior primeiro) com SLI, meta, orçamento restante em barra com número, taxa de consumo, estado (Dentro, Atenção, Estourado) e série de 30 dias; estados vazio ("Sem amostra"), erro e carregando.
  - Acessibilidade: cabeçalhos de tabela, barra com texto e foco visível.
- **O que NÃO deve ser implementado nesta etapa:** painel de traces (é do destino); métrica por município (E05); SLA.
- **Arquivos e módulos prováveis:** `apps/console/src/consultas.ts`, `servidor.ts`, `pagina.ts`, `apps/console/test/painel-de-slo.test.ts` (a criar).
- **Risco de segurança:** só sessão do console lê a aba.
- **Impacto LGPD:** sem dado pessoal.
- **Migração necessária:** Não.
- **Compatibilidade:** rota e aba novas.
- **Rollback:** reverter o commit.
- **Testes positivos:** rota com 40% do orçamento consumido mostra "Atenção" e o número.
- **Testes negativos:** sem amostra mostra "Sem amostra", nunca 100%; sem sessão: 401; token do painel: 401.
- **Testes de autorização e isolamento:** `dc360_console` não lê `latencia_por_rota` cru; a aba não traz município.
- **Regressão obrigatória:** `npm run test:console`, `npm run test:isolamento`; gates anteriores.
- **E2E:** HML: injetar erros e ver a barra mudar; Playwright captura.
- **Validação humana:** Rafael lê a aba; capturas aprovadas no portão visual (19, seção 0, e F08-E13).
- **Evidência a produzir:** `docs/evidencias-v2/G21/V2-F21-E14/`: testes, E2E e `capturas/INDEX.md`.
- **Documentação a atualizar:** `SLO.md`.
- **Definition of Done:** aba de SLO no console, com capturas aprovadas.
- **Checkpoint:** Não.

# GATE G21 - OBSERVABILIDADE
Só passa se:
- [ ] (E01) o crash nativo e o erro de JS do app de campo e do app do cidadão chegam ao destino de HML com pilha simbolicada, release e ambiente, sem dado pessoal, e o alerta de versão nova chega ao canal da E06; o teste do filtro passa nos dois apps. Evidência: `docs/evidencias-v2/G21/V2-F21-E01/`.
- [ ] (E02) `/saude` do worker e da API mostra profundidade e idade das filas de arquivos e de sincronização, o alerta disparou com o worker parado em HML e a resposta pública não traz município nem aparelho. Evidência: E02.
- [ ] (E03) falha de push e de e-mail é contada por motivo, credencial recusada alerta na hora, token inválido não alerta e a cota diária de e-mail alerta a 80%. Evidência: E03.
- [ ] (E04) os quatro serviços têm `/pronto` semântico e o monitor distingue o alerta de cada um (banco, worker e esquema derrubados em HML). Evidência: E04.
- [ ] (E05) a página de status está fora de Fly, Vercel e Supabase, mostra 24 h e histórico por serviço sem dado de município, e o console tem a aba de saúde por município. Evidência: E05.
- [ ] (E06 e CP-07) P0: o simulado de nível 1 foi reconhecido pela segunda pessoa dentro do prazo e a seção 6 de `INDISPONIBILIDADE.md` não tem campo vazio por função. CP-07 decidido; se adiado por escrito, ficam bloqueados plantão real, F27-E02 e qualquer SLA (F28-E05). Evidência: E06.
- [ ] (E07) o simulado de queda de API e de banco foi conduzido só com o runbook e o registro de incidente está arquivado. Evidência: E07.
- [ ] (E08 e CP-06) destino, país, prazo e acesso do log e do erro estão escritos em `SUBPROCESSADORES.md` e `PRIVACIDADE.md` e aplicados no destino; `LOG_NIVEL` testado. CP-06 decidido; se adiado por escrito, só HML usa o destino e ficam bloqueados o destino externo com dado de produção e a cópia de storage (F22-E02). Evidência: E08.
- [ ] o P0 da F01-E14 segue operante: `X-Request-Id`, erro centralizado, monitor de `/saude`, rotinas em `error` e alerta de storage a 80%. Evidência: captura do monitor e do alerta de HML.
- [ ] V2-F21-E09 (P1): p50, p95 e p99 por rota disponíveis a partir do request id e do log, sem dado pessoal. Evidência: E09.
- [ ] V2-F21-E10 a E12 (P1 e CP-60): spans de requisição, banco e job saem da API, do worker e do console para o destino de HML, com lista fechada de atributos (teste com dado pessoal injetado passa), padrão desligado; o mesmo trace id percorre painel ou app, API, fila e worker e é o código do erro; a amostragem exporta sempre erro e lentidão, respeita taxa e teto. CP-60 decidido, ou o destino de produção fica bloqueado e só HML o usa. Evidência: E10, E11 e E12 (inclui capturas do erro com o código).
- [ ] V2-F21-E13 (P1): SLO por rota crítica em `dc360/docs/SLO.md`, `slo_consumo` e alerta por taxa de consumo do orçamento de erro em duas janelas, provado em HML com erros injetados e sem alerta com amostra abaixo do mínimo; as metas são propostas e nenhuma vira SLA. Evidência: E13.
- [ ] V2-F21-E14 (P2): a aba "SLO" do console mostra SLI, orçamento restante e taxa de consumo por rota, com estados vazio, erro e carregando. Evidência: E14 com capturas.
- [ ] toda etapa de tela da fase (E05, E11 quando altera mensagem de erro, e E14) tem capturas em 320, 768 e 1280 px, claro e escuro, nos quatro estados, com `INDEX.md` e checklist do portão visual de `19-definicao-de-pronto.md`, seção 0, rodado pelo comando da F08-E13 e aprovado por Rafael. Evidência: `capturas/` de cada etapa.
- [ ] nenhuma regressão: todos os gates anteriores na ordem de execução (G00 a G20) continuam verdes (se um quebrar, ESTE gate volta a REPROVADO), com `npm run test:api`, `npm run test:console`, `npm run test:campo`, `npm run test:isolamento`, `npm run typecheck` e `npm audit` verdes.
- [ ] documentação atualizada (`INDISPONIBILIDADE.md`, `SUBPROCESSADORES.md`, `PRIVACIDADE.md`, `SLO.md`, runbooks) e evidências arquivadas em `docs/evidencias-v2/G21/`.

**Reabre se:** falha de rotina, de fila de arquivos ou de sincronização, ou de push e e-mail ficar sem alerta; alerta sem destinatário que reconheça; serviço com `/pronto` que responde 200 sem fazer o que deve; dado pessoal em evento de erro ou em log além do prazo; destino de log ou de erro ligado com dado de produção sem CP-06; tracing com atributo de dado pessoal ou ligado em produção sem CP-60; alerta de SLO sem destinatário; meta de SLO citada como SLA; etapa de tela fechada sem capturas.
**Este Gate libera:** F26 (POC), F27-E02 (suporte do piloto), F28-E05 (observabilidade, SLA e suporte) e F28-E09 (runbooks e treinamento).

# Fase 22: Backup, DR, RPO e RTO

**Gate da fase:** G22 BACKUP E DR PROVADOS | **Depende dos gates:** todos os anteriores NA ORDEM DE EXECUÇÃO de `STATUS.md` (o imediato é G21; D-29); G01 (HML) e G06 (S3 real) por cadeia | **Superfícies tocadas:** `db`, `scripts`, `.github/workflows` (restore agendado), infraestrutura (Supabase, bucket, Fly), `dc360/docs` | **Checkpoints da fase:** CP-31, CP-06, CP-19, CP-37, CP-07, CP-47

Referência técnica, NÃO promessa: PILOTO RPO 24 h e RTO 8 h (ALY:RNF-06); PRODUÇÃO RPO 15 min e RTO 4 h. A aprovação formal é CP-31, ANTES de qualquer promessa contratual; nenhuma etapa escreve esses números em contrato (F28-E05).

Estado confirmado: o único restore provado é de 2026-09-09, com 15 migrações e 15 tabelas (`dc360/docs/COLOCAR-DE-PE.md`, Parte 6); hoje são 46 migrações, e a V2 acrescenta tabela global (`pessoas`), CPF cifrado, geometria PostGIS, vídeo derivado e documento assinado. O dump é só do esquema `public` (`pg_dump --format=custom` em `scripts/copiar-producao.mjs`): o storage não tem cópia; os roteiros só rodam em macOS (chaveiro); NÃO existe script de restore; backup do provedor e PITR são NÃO CONFIRMADOS; `pg_trgm` (migração 041) e o papel `dc360_console` (migração 023) são falhas prováveis de restore.

MANTER: o dump antes de migrar e o gate de 30 min de `scripts/migrar-producao.mjs`, e `db/provedores/supabase-endurecer.sql`. A fase NÃO faz réplica de banco nem multirregião: o RTO do banco é por restauração. A redundância de máquinas é da F07-E12 e esta fase verifica o failover dela (E11). O restore e o storage passam a cobrir os dados novos (E01 a E03 e E09), e o exercício anual de ponta a ponta entra na V2 (E10, item 38 de `21-fora-da-v2.md`).

Ordem sugerida: E01 e E02 já (decisão de plano, CP-31; E02 depois de F06-E15); E03 depois de F01-E11 e F00-E25; E04 e E05 depois da E03; E06 depois da E04; E07 depois da E03. E09 depois da E03 e das fases dos dados novos (F03, F07, F09, F32); E10 depois de E03 a E09; E11 depois da F07-E12. As rodadas em HML são em série. As etapas com tela (E10 e E11, pelas capturas) passam pelo portão visual de `19-definicao-de-pronto.md`, seção 0, e pelo comando da F08-E13.

## Etapas

### V2-F22-E01 - Backup e PITR do banco conforme o plano contratado
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com E02)
- **Objetivo:** saber o que o plano oferece (backup, retenção, PITR), configurar e monitorar só isso, e cobrir as tabelas novas (pessoas, CPF cifrado, geometrias).
- **Problema que resolve:** `BZ-D:OPS-10`: backup e PITR do Supabase são NÃO CONFIRMADOS (`COLOCAR-DE-PE.md`); o RPO é a idade da última cópia manual; o dump de PROD é local, sem cifragem (`copiar-producao.mjs:26-39`).
- **Origem:** PR:D-19; PR:D-08; PR:D-16; DP:T32; ALY:RNF-06; REL:10 (OPS-10).
- **Estado atual:** CRIAR e EXPANDIR (dump da F01-E15).
- **Dependências de entrada:** CP-31; CP-19; F03-E15; F32-E15.
- **O que deve ser implementado:**
  - Infraestrutura: registrar em `dc360/docs/BACKUP-E-CONTINUIDADE.md` (a criar) plano, backup, retenção, PITR e região, com captura; sem PITR o RPO de 15 min NÃO é prometível (CP-31). Cobertura: `pessoas` (global), o CPF cifrado, `postgis` e a chave do CPF no cofre (F01-E16).
  - Infraestrutura: com PITR, restaurar a um ponto no tempo em HML e medir; sem PITR, e se CP-31 e CP-06 aprovarem, dump diário cifrado fora da conta (E02).
  - Observabilidade: alerta de backup velho (acima de 26 h) no monitor da F21-E06.
  - Arquivos: `copiar-producao.mjs` cifra o arquivo e apaga a cópia local no prazo.
- **O que NÃO deve ser implementado nesta etapa:** restore (E03); storage (E02); réplica; prova de cobertura (E09).
- **Arquivos e módulos prováveis:** `dc360/docs/BACKUP-E-CONTINUIDADE.md` (a criar), `dc360/scripts/copiar-producao.mjs`, `dc360/docs/PRIVACIDADE.md`.
- **Risco de segurança:** chave perdida inutiliza o backup e o CPF: cofre.
- **Impacto LGPD:** o backup retém dado pessoal (CPF cifrado) após a eliminação: prazo escrito (J4, CP-29).
- **Migração necessária:** Não.
- **Compatibilidade:** dump cifrado.
- **Rollback:** só o backup do provedor.
- **Testes positivos:** plano preenchido; alerta com 30 h; `pessoas` e `postgis` na cobertura.
- **Testes negativos:** dump sem chave falha; cópia local vencida é apagada.
- **Testes de autorização e isolamento:** Não se aplica: sem rota nem tenant.
- **Regressão obrigatória:** `npm run test:scripts`; gates anteriores.
- **E2E:** Não se aplica: prova na E03.
- **Validação humana:** Rafael confere o painel.
- **Evidência a produzir:** `docs/evidencias-v2/G22/V2-F22-E01/`.
- **Documentação a atualizar:** `BACKUP-E-CONTINUIDADE.md`, `PRIVACIDADE.md`.
- **Definition of Done:** plano registrado; alerta ativo.
- **Checkpoint:** CP-31 e CP-19 .

### V2-F22-E02 - Storage versionado e cópia fora da conta
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com E01)
- **Objetivo:** storage ganha versionamento e cópia em outra conta e região, com vídeo derivado e documentos assinados, sem quebrar a eliminação.
- **Problema que resolve:** `BZ-D:OPS-11`: o dump não leva `storage.objects` e sem cópia de balde; com versionamento, `apagar` (`apps/api/src/armazenamento/s3.ts:335`) da purga só cria marcador de exclusão.
- **Origem:** PR:D-19; PR:D-07; PR:D-09; DP:T32; DP:J7; REL:10 (OPS-11).
- **Estado atual:** CRIAR.
- **Dependências de entrada:** F06-E15; F07-E10; F09; CP-31; CP-06.
- **O que deve ser implementado:**
  - Infraestrutura: versionamento conforme a prova da F06-E15 ; versões expiram em N dias (J4, CP-29); o vídeo pesa (CP-47).
  - Arquivos: `scripts/copiar-armazenamento.mjs` (a criar): cópia incremental (inclui vídeo derivado e documento assinado) a bucket de OUTRA conta e região, credencial só de leitura na origem e só de escrita no destino, criptografada, com relatório; recusa PROD sem `--ambiente prod` e destino igual à origem.
  - API: `s3.ts` ganha `listarVersoes` e `apagarVersao`; a purga apaga versões e a cópia; divergência ao monitor (F21-E06).
- **O que NÃO deve ser implementado nesta etapa:** object lock (F06-E15); restore do storage (E03, E04).
- **Arquivos e módulos prováveis:** `dc360/scripts/copiar-armazenamento.mjs` (a criar), `apps/api/src/armazenamento/s3.ts`, `eliminacao/relogio.ts`.
- **Risco de segurança:** cópia fora da eliminação reteria dado; o script nunca apaga na origem.
- **Impacto LGPD:** subprocessador novo (30 dias, CP-06): a eliminação a alcança.
- **Migração necessária:** Não.
- **Compatibilidade:** sem versionamento a purga segue.
- **Rollback:** desligar a cópia.
- **Testes positivos:** cópia de HML iguala contagem e bytes, com vídeo e PDF assinado; sobrescrito mantém a versão anterior.
- **Testes negativos:** destino igual à origem: recusa; após a purga sintética não resta versão nem cópia.
- **Testes de autorização e isolamento:** credencial de leitura não escreve; `tenant/<A>/` não lê `tenant/<B>/`.
- **Regressão obrigatória:** `npm run test:scripts`, `npm run test:api`; gates anteriores.
- **E2E:** HML: foto, vídeo e PDF sintéticos, cópia, purga, conferência.
- **Validação humana:** Rafael roda o script em HML.
- **Evidência a produzir:** `docs/evidencias-v2/G22/V2-F22-E02/`.
- **Documentação a atualizar:** `ARMAZENAMENTO.md`, `SUBPROCESSADORES.md`.
- **Definition of Done:** cópia conferida; versionamento provado ou limitado; purga alcança versões.
- **Checkpoint:** CP-31 e CP-06 (a cópia é subprocessador: bloqueia dado de produção).

### V2-F22-E03 - Restore automatizado em HML com dado sintético
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (E04 a E07 usam o script)
- **Objetivo:** um comando e um workflow agendado restauram o dump de HML em Postgres 17 descartável e provam papéis, RLS, isolamento e API.
- **Problema que resolve:** não existe script de restore: a Parte 6 de `COLOCAR-DE-PE.md` é manual e a F00-E25 prova uma vez; só vale se repetir a cada migration (`BZ-D:OPS-04`).
- **Origem:** PR:D-19; PR:D-16; DP:T32; ALY:CA-08; REL:10 (OPS-04).
- **Estado atual:** CRIAR (automação) sobre F00-E25 e F01-E15.
- **Dependências de entrada:** F01-E11; F00-E25; F32-E02.
- **O que deve ser implementado:**
  - Arquivos: `scripts/restaurar-banco.mjs` (a criar; sem chaveiro): `--destino <url>` de cluster DESCARTÁVEL (recusa host de PROD); cria `dc360_app`, `dc360_api`, `dc360_console`, instala `pg_trgm` e `postgis`, roda `pg_restore --exit-on-error` e `supabase-endurecer.sql`; confere linhas por tabela, `schema_migracoes`, RLS forçada, `gin_trgm_ops`, `pessoas` fechada ao `dc360_app`, CPF sintético decifrado com a chave do cofre, geometria válida, hash do documento assinado e a API (`/pronto`, login); tempos em JSON.
  - Infraestrutura: `.github/workflows/restaurar-hml.yml` (a criar): `schedule` semanal e manual, `postgres:17` com `postgis`, ambiente `homologacao`, ações fixadas por SHA; sem dump em artefato.
  - Banco: restaura também o storage (E02) num bucket descartável.
- **O que NÃO deve ser implementado nesta etapa:** restore de PROD; RPO (E07); runbook (E04); regra pós-migration (E05).
- **Arquivos e módulos prováveis:** `dc360/scripts/restaurar-banco.mjs` (a criar), `.github/workflows/restaurar-hml.yml` (a criar), `db/provedores/supabase-endurecer.sql`.
- **Risco de segurança:** `dc360_app` sem BYPASSRLS nem dono; host de PROD: recusa.
- **Impacto LGPD:** só sintético; sem dump arquivado.
- **Migração necessária:** Não.
- **Compatibilidade:** cliente Postgres 17.
- **Rollback:** desligar o agendamento.
- **Testes positivos:** workflow verde, 0 divergências; API sobe.
- **Testes negativos:** sem `dc360_console` o restore para; sem `pg_trgm` ou `postgis` acusa; chave do CPF errada acusa; host de PROD: recusa.
- **Testes de autorização e isolamento:** na cópia, A não lê B; `UPDATE` em `trilha_eventos` negado.
- **Regressão obrigatória:** `npm run test:scripts`, `npm run test:isolamento`; gates anteriores.
- **E2E:** o workflow: login e leitura na cópia.
- **Validação humana:** Rafael roda o script no Windows.
- **Evidência a produzir:** `docs/evidencias-v2/G22/V2-F22-E03/`.
- **Documentação a atualizar:** `RESTORE-DO-BANCO.md`.
- **Definition of Done:** restore agendado verde, com papéis e extensões.
- **Checkpoint:** Não.

### V2-F22-E04 - Roteiro de restore multiplataforma e relatório
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E05)
- **Objetivo:** runbook de restore executável em Windows, Linux ou macOS por quem não escreveu o sistema, e modelo de relatório com tempos medidos.
- **Problema que resolve:** a Parte 6 de `COLOCAR-DE-PE.md` só descreve macOS com Homebrew e 15 migrações (`BZ-D:OPS-04`, `OPS-20`); `RESTORE-DO-BANCO.md` (F00-E25) é mínimo e falta storage, segredos e apontar a API.
- **Origem:** DP:T32; REL:10 (OPS-04, OPS-13, OPS-20).
- **Estado atual:** EXPANDIR (`RESTORE-DO-BANCO.md` da F00-E25).
- **Dependências de entrada:** E03.
- **O que deve ser implementado:**
  - Documentação: `dc360/docs/runbooks/restauracao.md` (a criar): pré-condições por sistema (cliente 17, Git Bash no Windows), passos com comando e verificação (os de `restaurar-banco.mjs`), restore do storage (E02), segredos por NOME (`SEGUNDO_FATOR_CHAVE`, `JWT_SEGREDO`, `S3_*`) e o efeito de perder `SEGUNDO_FATOR_CHAVE` (TOTP ilegível), apontar a API (`fly secrets set DATABASE_URL`), conferir (`/pronto`, login, leitura) e a decisão do município sobre o ponto de restauração.
  - Documentação: modelo `docs/evidencias-v2/G22/modelo-de-relatorio-de-restauracao.md`: versões, data ISO, função de quem executou, tempo por fase, contagens e hashes, falhas e remédio; sem dump. A Parte 6 vira nota histórica que aponta ao runbook.
- **O que NÃO deve ser implementado nesta etapa:** automação (E03); medição (E07); periodicidade (E06).
- **Arquivos e módulos prováveis:** `dc360/docs/runbooks/restauracao.md` (a criar), `dc360/docs/RESTORE-DO-BANCO.md`, `dc360/docs/COLOCAR-DE-PE.md`.
- **Risco de segurança:** runbook com valor de segredo: só nomes; relatório sem dump.
- **Impacto LGPD:** o relatório leva contagens e hashes, nunca linhas.
- **Migração necessária:** Não.
- **Compatibilidade:** a Parte 6 fica como histórico.
- **Rollback:** reverter os documentos.
- **Testes positivos:** o executor da E06 conclui o runbook em HML e registra onde o texto falhou.
- **Testes negativos:** comando inexistente reprova a revisão; sem `SEGUNDO_FATOR_CHAVE` o ensaio mostra erro claro de TOTP.
- **Testes de autorização e isolamento:** Não se aplica: documento.
- **Regressão obrigatória:** `npm test`, `npm run test:scripts`; gates anteriores.
- **E2E:** o ensaio em HML pelo runbook.
- **Validação humana:** a segunda pessoa (CP-07) segue o runbook sem ajuda.
- **Evidência a produzir:** `docs/evidencias-v2/G22/V2-F22-E04/` (relatório preenchido).
- **Documentação a atualizar:** `COLOCAR-DE-PE.md`, `INDISPONIBILIDADE.md` (seção 3.4).
- **Definition of Done:** runbook executado em dois sistemas; relatório preenchido.
- **Checkpoint:** Não.

### V2-F22-E05 - Regra: restore pós-migration de papel, policy ou grant
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** sim (com E04)
- **Objetivo:** nenhuma migration que mexa em papel, policy ou grant chega a PROD sem restore provado com ela.
- **Problema que resolve:** `COLOCAR-DE-PE.md:611-614` manda refazer o restore depois de migration que mexa em papel, policy ou grant; desde a 15ª houve 023, 034, 036, 038, 039 e 046 sem restore (`BZ-D:OPS-06`).
- **Origem:** DP:T32; REL:10 (OPS-06; D1 d).
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E03.
- **O que deve ser implementado:**
  - Arquivos: `scripts/migracao-exige-restore.mjs` (a criar): acha migrations com `CREATE ROLE`, `ALTER ROLE`, `GRANT`, `REVOKE`, `POLICY`, `ROW LEVEL SECURITY` ou `CREATE EXTENSION` e as compara com `db/restore-provado.json` (a criar: `migracaoProvada`, `relatorio`, `data`); recusa sensível acima do marcador.
  - Infraestrutura: `migrar-producao.mjs --aplicar` e `promover-producao.yml` (F01-E12) chamam a conferência; `restaurar-hml.yml` (E03) emite a linha do marcador, que só muda por PR revisado.
- **O que NÃO deve ser implementado nesta etapa:** restore em PROD; rollback de migration (REL:10 gap 20); bloquear migration não sensível.
- **Arquivos e módulos prováveis:** `dc360/scripts/migracao-exige-restore.mjs` (a criar), `dc360/db/restore-provado.json` (a criar), `dc360/scripts/migrar-producao.mjs`, `.github/workflows/promover-producao.yml`.
- **Risco de segurança:** a busca por texto pode deixar escapar um padrão: lista revisada por PR e testada contra a história real.
- **Impacto LGPD:** Não se aplica: sem dado.
- **Migração necessária:** Não.
- **Compatibilidade:** `--aplicar` passa a recusar sem restore provado.
- **Rollback:** reverter o script e o marcador.
- **Testes positivos:** com `migracaoProvada` igual à última sensível, a conferência passa.
- **Testes negativos:** fixture com `GRANT` novo acima do marcador: recusa; marcador sem relatório: recusa; 023, 036, 038, 039 e 046 detectadas como sensíveis.
- **Testes de autorização e isolamento:** Não se aplica: script sem tenant.
- **Regressão obrigatória:** `npm run test:scripts`, `npm run migrar -- --conferir`; gates anteriores.
- **E2E:** HML: migration sensível sintética: `--aplicar` recusa até o marcador subir.
- **Validação humana:** Rafael vê a recusa e a liberação.
- **Evidência a produzir:** `docs/evidencias-v2/G22/V2-F22-E05/` (recusa e liberação).
- **Documentação a atualizar:** `IMPLANTACAO.md` (seção 8).
- **Definition of Done:** migration sensível sem restore provado não chega a PROD.
- **Checkpoint:** Não.

### V2-F22-E06 - Restore trimestral por pessoa que não escreveu o sistema
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (usa o runbook da E04)
- **Objetivo:** a cada trimestre, e depois de migration sensível, quem não escreveu o sistema restaura seguindo só o runbook e assina o relatório.
- **Problema que resolve:** a periodicidade tem três versões (aberta em `INDISPONIBILIDADE.md`, mensal em `COLOCAR-DE-PE.md:611-616`, trimestral no levantamento) e o executor é o autor (`BZ-D:OPS-07`; REL:10 D1).
- **Origem:** DP:T32; REL:10 (OPS-07; D1).
- **Estado atual:** CRIAR (processo).
- **Dependências de entrada:** E04.
- **O que deve ser implementado:**
  - Documentação: seção "Periodicidade" de `restauracao.md`: trimestral mais por evento (E05); executor diferente de quem escreveu a mudança, a segunda pessoa de CP-07 (F01-E16); cada rodada restaura a cópia de HML (E03) e, uma vez por ano e antes do piloto, o backup de PROD em projeto isolado de acesso restrito, comparando só contagens e destruindo o projeto no mesmo dia.
  - Arquivos: relatório assinado em `docs/evidencias-v2/G22/` (função, data ISO); falha vira issue com dono e prazo (T42); `INDISPONIBILIDADE.md` e `COLOCAR-DE-PE.md` citam uma periodicidade só.
- **O que NÃO deve ser implementado nesta etapa:** terceirizar o restore; automatizar o restore de PROD.
- **Arquivos e módulos prováveis:** `dc360/docs/runbooks/restauracao.md`, `dc360/docs/INDISPONIBILIDADE.md`, `dc360/docs/COLOCAR-DE-PE.md`.
- **Risco de segurança:** restore de PROD amplia acesso a dado de cidadão: projeto isolado, MFA, destruído no dia.
- **Impacto LGPD:** a rodada de PROD toca dado real: só contagens saem.
- **Migração necessária:** Não.
- **Compatibilidade:** nada muda no produto.
- **Rollback:** Não se aplica: processo.
- **Testes positivos:** o executor completa a rodada só com o runbook e assina o relatório.
- **Testes negativos:** relatório cujo executor escreveu a última migration sensível é recusado; rodada vencida há mais de um trimestre reabre o item.
- **Testes de autorização e isolamento:** o executor tem acesso mínimo; o projeto de PROD não sobra depois do dia.
- **Regressão obrigatória:** `npm test`; gates anteriores.
- **E2E:** a rodada em HML.
- **Validação humana:** o executor assina; Rafael confere.
- **Evidência a produzir:** `docs/evidencias-v2/G22/V2-F22-E06/` (relatório assinado).
- **Documentação a atualizar:** `restauracao.md`.
- **Definition of Done:** uma rodada por quem não escreveu o sistema, com relatório, e periodicidade única.
- **Checkpoint:** Não.

### V2-F22-E07 - Medição de RPO e RTO contra o prometido
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (usa a E03 e o runbook da E04)
- **Objetivo:** medir em HML a perda de dados (RPO) e o tempo de recuperação (RTO) e compará-los com a referência de CP-31.
- **Problema que resolve:** nada é medido (`BZ-D:OPS-08`, `OPS-09`): `COLOCAR-DE-PE.md:577-582` mede 10 s de comando; prometer número não medido é risco contratual.
- **Origem:** DP:K7; DP:R7; ALY:RNF-06; REL:10 (OPS-08, OPS-09).
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E03; CP-37.
- **O que deve ser implementado:**
  - Arquivos: `scripts/medir-rpo.mjs` (a criar): grava a cada 60 s um marcador sintético pela API de HML (município de prova); depois do restore lê o último marcador vivo: RPO = hora da falha menos a dele; por modo de E01 (backup, PITR).
  - Infraestrutura: simulado em HML: T0 = banco derrubado; `restauracao.md` seguido por quem só tem o runbook (E06); RTO = T0 até `/pronto` 200, login com TOTP, ocorrência e foto abertas, com tempos de decisão, provisionar, restaurar, apontar a API e conferir.
  - Documentação: `relatorio-de-rpo-e-rto.md`: piloto (24 h, 8 h), produção (15 min, 4 h), medido, atende ou não; "referência técnica, não promessa".
- **O que NÃO deve ser implementado nesta etapa:** ajustar o relatório ao alvo; SLA (F28-E05); restore em PROD.
- **Arquivos e módulos prováveis:** `dc360/scripts/medir-rpo.mjs` (a criar), `dc360/docs/runbooks/restauracao.md`.
- **Risco de segurança:** marcadores só em município sintético de HML.
- **Impacto LGPD:** Não se aplica: dado sintético.
- **Migração necessária:** Não.
- **Compatibilidade:** nada muda.
- **Rollback:** apagar o município de prova.
- **Testes positivos:** série sintética com 3 marcadores perdidos dá RPO de 3 min; o simulado dá RTO com cinco tempos.
- **Testes negativos:** `medir-rpo.mjs` recusa URL de PROD; relatório sem tempo medido não fecha o item.
- **Testes de autorização e isolamento:** o token do município de prova não lê outro município (404).
- **Regressão obrigatória:** `npm run test:scripts`; gates anteriores.
- **E2E:** o simulado em HML.
- **Validação humana:** Rafael acompanha o simulado.
- **Evidência a produzir:** `docs/evidencias-v2/G22/V2-F22-E07/` (relatório).
- **Documentação a atualizar:** `BACKUP-E-CONTINUIDADE.md`.
- **Definition of Done:** RPO e RTO medidos e comparados; CP-37 registrado.
- **Checkpoint:** CP-37 (K7: aceitar, ajustar plano ou promessa, nunca o relatório; bloqueia o G22).

### V2-F22-E08 - Backup do cofre de segredos e recuperação
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** sim (com E04)
- **Objetivo:** perder a máquina de quem desenvolve não perde segredo irrecuperável: inventário, cópia cifrada e ensaio.
- **Problema que resolve:** `BZ-D:OPS-13`: segredos só em `fly secrets` e no chaveiro de uma máquina; sem `SEGUNDO_FATOR_CHAVE` os TOTP ficam ilegíveis.
- **Origem:** PR:D-08; DP:K15; REL:10 (OPS-13).
- **Estado atual:** EXPANDIR (`acesso-e-segredos.md` da F01-E16).
- **Dependências de entrada:** F01-E16; F22-E01.
- **O que deve ser implementado:**
  - Documentação: inventário em `dc360/docs/runbooks/acesso-e-segredos.md`, por NOME: onde vive, quem rotaciona, o que se perde e a classe: IRRECUPERÁVEL (`SEGUNDO_FATOR_CHAVE`, `CONSOLE_SEGUNDO_FATOR_CHAVE`, a chave do CPF cifrado, `INTEGRACOES_CHAVE` da F31-E03) ou regenerável.
  - Infraestrutura: cópia cifrada só dos irrecuperáveis, fora da máquina de quem desenvolve e das contas Fly, Supabase e GitHub, aberta pela segunda pessoa de CP-07; refeita a cada rotação.
  - Arquivos: `scripts/conferir-inventario-de-segredos.mjs` (a criar) compara o inventário com os NOMES de `fly secrets list`; o ensaio, no restore trimestral (E06), abre a cópia, instala a chave num app de HML restaurado (E03) e entra com TOTP.
- **O que NÃO deve ser implementado nesta etapa:** valor de segredo em repositório, log ou evidência; trocar o cofre de CP-07.
- **Arquivos e módulos prováveis:** `dc360/docs/runbooks/acesso-e-segredos.md`, `dc360/scripts/conferir-inventario-de-segredos.mjs` (a criar).
- **Risco de segurança:** a cópia concentra os segredos mais fortes: cifrada, acesso por função e MFA; ensaio só com valor de HML.
- **Impacto LGPD:** as chaves protegem TOTP e CPF: quem abre a cópia fica registrado.
- **Migração necessária:** Não.
- **Compatibilidade:** nada muda.
- **Rollback:** Não se aplica: processo.
- **Testes positivos:** o conferidor passa; o ensaio abre a cópia, o TOTP entra e o CPF sintético decifra.
- **Testes negativos:** nome fora do inventário reprova; sem a chave o ensaio mostra erro; `gitleaks` não acha valor.
- **Testes de autorização e isolamento:** HML não recebe valor de PROD.
- **Regressão obrigatória:** `npm run test:scripts`; gates anteriores.
- **E2E:** o ensaio em HML.
- **Validação humana:** a segunda pessoa executa o ensaio.
- **Evidência a produzir:** `docs/evidencias-v2/G22/V2-F22-E08/`.
- **Documentação a atualizar:** `acesso-e-segredos.md`.
- **Definition of Done:** inventário igual aos apps; cópia fora da máquina; ensaio aprovado.
- **Checkpoint:** CP-07 (K15: bloqueia a cópia real e o ensaio; o inventário se faz antes).

### V2-F22-E09 - Cobertura de backup e restore das tabelas e do storage novos
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (usa o script da E03)
- **Objetivo:** provar que todo dado novo volta no restore: pessoa global, CPF cifrado, geometria, vídeo derivado e documento assinado.
- **Problema que resolve:** o restore provado cobre o esquema de hoje; tabela fora do tenant, coluna cifrada, geometria e prefixo novo podem ficar fora do dump ou voltar sem a chave.
- **Origem:** PR:D-19; PR:D-07; PR:D-08; PR:D-09; PR:D-16.
- **Estado atual:** CRIAR (teste de cobertura) e EXPANDIR a E03.
- **Dependências de entrada:** E01; E02; E03; F03-E15; F32-E15; F07-E10; F09; F29-E16; F30-E17; F31-E19; F33-E16; F34-E19.
- **O que deve ser implementado:**
  - Banco: `db/restore-cobertura.json` (a criar) classifica cada tabela e cada prefixo de storage; `db/test/cobertura-de-restore.test.ts` (a criar) o compara com o catálogo: item sem classificação reprova.
  - Arquivos: `scripts/restaurar-banco.mjs` prova um dado de cada tipo: pessoa com CPF sintético decifrado com a chave do cofre, geometria (`ST_IsValid`), vídeo que `ffprobe` abre e documento assinado com hash igual ao do manifesto.
  - Infraestrutura: o workflow da E03 roda a prova a cada migration que cria tabela.
- **O que NÃO deve ser implementado nesta etapa:** restore de PROD; exercício (E10); failover (E11).
- **Arquivos e módulos prováveis:** `db/restore-cobertura.json` (a criar), `db/test/cobertura-de-restore.test.ts` (a criar), `dc360/scripts/restaurar-banco.mjs`.
- **Risco de segurança:** sem a chave do CPF o dado volta ilegível; chave e CPF nunca entram no relatório.
- **Impacto LGPD:** só CPF sintético; relatório com contagens e hashes.
- **Migração necessária:** Não.
- **Compatibilidade:** aditiva.
- **Rollback:** reverter o commit.
- **Testes positivos:** o restore de HML devolve pessoa, CPF decifrado, geometria, vídeo e PDF com hash igual.
- **Testes negativos:** tabela sem classificação: reprova; chave do CPF errada: acusa; PDF alterado: reprova.
- **Testes de autorização e isolamento:** na cópia, `dc360_app` não lê `pessoas`; A não lê vídeo nem documento de B.
- **Regressão obrigatória:** `npm run test:scripts`, `npm run test:isolamento`; gates anteriores.
- **E2E:** o workflow de restore em HML com os dados sintéticos.
- **Validação humana:** Rafael lê o relatório.
- **Evidência a produzir:** `docs/evidencias-v2/G22/V2-F22-E09/`.
- **Documentação a atualizar:** `RESTORE-DO-BANCO.md`.
- **Definition of Done:** dados novos voltam no restore; o inventário reprova o que faltar.
- **Checkpoint:** CP-47 (o vídeo pesa: bloqueia `video_cidadao` em produção).

### V2-F22-E10 - Exercício anual de recuperação de desastre de ponta a ponta
- **Prioridade:** P1
- **Tamanho:** L  |  **Complexidade:** alta  |  **Risco:** médio  |  **Paralelizável:** não (usa E03 a E09)
- **Objetivo:** uma vez por ano, recuperar um ambiente espelho inteiro (banco, storage, segredos, serviços e apps), com tempo medido e relatório.
- **Problema que resolve:** o restore trimestral prova o banco; ninguém prova a cadeia inteira junta, com segredos, serviços, apps e aviso ao município (item 38).
- **Origem:** PR:D-19; REL:10.
- **Estado atual:** CRIAR; MANTER E06 e E07.
- **Dependências de entrada:** E03; E04; E06; E07; E08; E09; F21-E07.
- **O que deve ser implementado:**
  - Documentação: `dc360/docs/runbooks/exercicio-de-dr.md` (a criar): cenário (perda do banco e do app da API), roteiro cronometrado, papéis (executor que não escreveu o sistema, observador, aviso ao município pela F21-E07) e critérios de RTO e RPO (CP-37).
  - Infraestrutura: em HML espelho, dado sintético (nunca PROD): restaurar banco (E03), storage (E02) e cofre (E08), reapontar a API, entrar no painel e no console, sincronizar o campo e abrir um relato.
  - Arquivos: calendário e relatório anual em `docs/evidencias-v2/G22/exercicio-anual/`; correção aberta vira pendência datada.
  
- **O que NÃO deve ser implementado nesta etapa:** exercício em PROD; automação total; promessa contratual (F28-E05).
- **Arquivos e módulos prováveis:** `dc360/docs/runbooks/exercicio-de-dr.md` (a criar), `dc360/scripts/restaurar-banco.mjs`.
- **Risco de segurança:** só nomes de segredo no relatório; o espelho é destruído.
- **Impacto LGPD:** só dado sintético.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: rotina.
- **Rollback:** destruir o ambiente espelho.
- **Testes positivos:** fecha em até 8 h (RTO do piloto); o campo sincroniza e o relato aparece.
- **Testes negativos:** sem a chave do cofre falha e o relatório registra; host de PROD: recusa.
- **Testes de autorização e isolamento:** na cópia, A não lê B; `dc360_app` não lê `pessoas`.
- **Regressão obrigatória:** `npm run test:scripts`, `npm run test:isolamento`; gates anteriores.
- **E2E:** painel, campo e cidadão contra a cópia; Playwright captura painel e console.
- **Validação humana:** a segunda pessoa de CP-07 executa; Rafael aprova as capturas (19, seção 0).
- **Evidência a produzir:** `docs/evidencias-v2/G22/V2-F22-E10/`: relatório e `capturas/INDEX.md`.
- **Documentação a atualizar:** `INDISPONIBILIDADE.md`.
- **Definition of Done:** primeiro exercício em HML; calendário fixado.
- **Checkpoint:** CP-37 (aceita ou ajusta os números medidos) e CP-07 (executor).

### V2-F22-E11 - Verificação do failover da redundância de máquinas
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** sim (com E10)
- **Objetivo:** provar que com duas máquinas por serviço (F07-E12) a queda de uma não interrompe o atendimento nem perde ou duplica item.
- **Problema que resolve:** a F07-E12 liga a redundância e prova uma derrubada; falta o roteiro repetível, com tempos por serviço (GAP-P1O-06).
- **Origem:** PR:D-19; GAP-P1O-06; REL:10; item 41 de `21-fora-da-v2.md`.
- **Estado atual:** CRIAR (script e relatório) sobre a F07-E12 e a F07-E13.
- **Dependências de entrada:** F07-E12; F07-E13; F21-E04; CP-31.
- **O que deve ser implementado:**
  - Arquivos: `scripts/verificar-failover.mjs` (a criar): sonda `/pronto` e uma escrita sintética (login, ocorrência, sincronização do campo) por segundo; para uma máquina de cada serviço por vez e mede janela de erro, recuperação, itens perdidos e duplicados; recusa PROD sem `--ambiente prod` e CP-31; JSON por serviço.
  - Observabilidade: o alerta de cada serviço (F21-E04) dispara; o painel de SLO (F21-E14) mostra o consumo.
  - Infraestrutura: rodada trimestral com o restore (E06) e no exercício anual (E10).
- **O que NÃO deve ser implementado nesta etapa:** réplica de banco; mudar a topologia (F07-E12).
- **Arquivos e módulos prováveis:** `dc360/scripts/verificar-failover.mjs` (a criar), `fly.toml`, `fly.console.toml`.
- **Risco de segurança:** derruba máquina: recusa PROD sem a bandeira.
- **Impacto LGPD:** Não se aplica: dado sintético.
- **Migração necessária:** Não.
- **Compatibilidade:** roda em HML.
- **Rollback:** religar a máquina.
- **Testes positivos:** uma máquina da API parada em 100 sincronizações: todas concluem, nenhuma duplica, janela de erro até 30 s.
- **Testes negativos:** as duas paradas: alerta alto; PROD sem a bandeira: recusa; item duplicado reprova.
- **Testes de autorização e isolamento:** com uma máquina fora, o token de A não lê B na outra.
- **Regressão obrigatória:** `npm run test:scripts`, `npm run test:api`; gates anteriores.
- **E2E:** o script com um app de campo de HML; Playwright captura o painel de SLO no fim.
- **Validação humana:** Rafael derruba a máquina e vê o alerta; capturas (19, seção 0).
- **Evidência a produzir:** `docs/evidencias-v2/G22/V2-F22-E11/`: relatórios e `capturas/INDEX.md`.
- **Documentação a atualizar:** `INDISPONIBILIDADE.md`.
- **Definition of Done:** failover medido em API, worker e console, sem perda nem duplicação.
- **Checkpoint:** CP-31 (disponibilidade em produção: bloqueia a rodada em PROD).

# GATE G22 - BACKUP E DR PROVADOS
Só passa se:
- [ ] (E01 e CP-31) a tabela de plano do banco está preenchida com captura do painel (backup diário, retenção, PITR sim ou não); o alerta de backup velho dispara em simulação; sem PITR, consta que o RPO de 15 min não é prometível. CP-31 decidido; se adiado por escrito, ficam bloqueados a escolha do plano, o contrato e o SLA (F28-E05) e nenhum número vira promessa. Evidência: `docs/evidencias-v2/G22/V2-F22-E01/`.
- [ ] (E02) o storage tem cópia fora da conta, com vídeo derivado e documento assinado, versionamento provado ou limitação registrada, e a purga de município sintético não deixa versão nem cópia. Evidência: E02.
- [ ] (E03) `restaurar-hml.yml` está verde: restore em cluster descartável Postgres 17 com `dc360_console`, `pg_trgm` e `postgis`, `pessoas` fechada ao `dc360_app`, hashes de `schema_migracoes` iguais, RLS ativada e forçada, isolamento e API contra a cópia. Evidência: E03.
- [ ] (E04) o runbook de restauração foi executado em dois sistemas operacionais e o relatório está preenchido. Evidência: E04.
- [ ] (E05) migration que mexe em papel, policy ou grant sem restore provado é recusada por `migrar-producao.mjs --aplicar` e pela promoção; a história real é detectada. Evidência: E05.
- [ ] (E06) uma rodada de restore por quem não escreveu o sistema, com relatório assinado, e periodicidade única escrita. Evidência: E06.
- [ ] (E07 e CP-37) RELATÓRIO DE RESTORE COM TEMPOS MEDIDOS: RPO e RTO medidos em HML, comparados com a referência de piloto (24 h e 8 h) e de produção (15 min e 4 h); CP-37 decidiu aceitar, ajustar plano ou ajustar promessa. Evidência: E07.
- [ ] CP-19 decidido ou adiado por escrito (plano do banco e e-mail com domínio verificado para uso externo); adiado, ficam bloqueados convites reais e o plano de produção.
- [ ] V2-F22-E08 (P1, CP-07): inventário de segredos, cópia cifrada fora da máquina de quem desenvolve, segunda pessoa que a abre e recuperação ensaiada, sem valor de segredo em nenhum arquivo. Evidência: E08.
- [ ] V2-F22-E09 (P0): o restore de HML devolve pessoa global, CPF decifrado com a chave do cofre, geometria válida, vídeo derivado e documento assinado com hash igual, e o teste de cobertura reprova tabela ou prefixo de storage sem classificação. Evidência: E09.
- [ ] V2-F22-E10 (P1, CP-37 e CP-07): o primeiro exercício anual de recuperação de ponta a ponta foi feito em HML espelho por quem não escreveu o sistema, com banco, storage, segredos, serviços e apps, RTO e RPO medidos, capturas do painel e do console na cópia e calendário anual fixado. Evidência: E10 com capturas.
- [ ] V2-F22-E11 (P1, CP-31 para PROD): com duas máquinas por serviço, a queda de uma foi provada em HML para API, worker e console, sem perda nem duplicação de item, com janela de erro medida e alerta por serviço. Evidência: E11.
- [ ] nenhuma regressão: todos os gates anteriores na ordem de execução (G00 a G21) continuam verdes (se um quebrar, ESTE gate volta a REPROVADO), com `npm run test:scripts`, `npm run test:isolamento`, `npm run test:api` e `npm audit` verdes.
- [ ] documentação atualizada (`BACKUP-E-CONTINUIDADE.md`, `RESTORE-DO-BANCO.md`, `restauracao.md`, `COLOCAR-DE-PE.md`, `PRIVACIDADE.md`, `SUBPROCESSADORES.md`, `exercicio-de-dr.md`) e evidências arquivadas em `docs/evidencias-v2/G22/`.

**Reabre se:** migration sensível chegar a PROD sem restore provado; o workflow de restore ficar vermelho por mais de duas semanas; o storage ficar sem cópia; o RPO ou o RTO medido deixar de atender à referência aprovada sem decisão de CP-37; a cópia de storage alcançar município eliminado; dado novo da V2 ficar fora do restore sem classificação; o exercício anual passar de 12 meses sem repetição; a redundância de máquinas deixar de ser verificada; etapa de tela fechada sem capturas.
**Este Gate libera:** F23 e F24 na ordem de execução; F26 (POC, cenário de exportação, eliminação e restore de município sintético), F28-E04 (DR consolidado), F28-E05 (SLA, atrás de CP-31) e F28-E09 (runbooks e treinamento).

# Fase 24: Performance e carga

**Gate da fase:** G24 DESEMPENHO MEDIDO | **Depende dos gates:** todos os anteriores NA ORDEM DE EXECUÇÃO de `STATUS.md` (o imediato é G23; inclui G07, G29 a G32, G34 e G35; D-29) | **Superfícies tocadas:** `apps/api`, `apps/console` (só leitura), `apps/web`, `apps/portal`, clientes de teste de `apps/campo` e `apps/cidadao`, `db`, `scripts`, `carga/` (a criar), HML | **Checkpoints da fase:** CP-47 e CP-41 (plano do banco e tamanho das máquinas seguem CP-31 e CP-36)

MEDIR, não prometer. `db/test/carga.test.ts` (15 casos) declara no cabeçalho que NÃO mede desempenho (PGlite, uma conexão) e não há k6 nem autocannon (`BZ-D:BAS-45`). O que a medição enfrenta: pool de 10 conexões e ociosa de 30 s (`apps/api/src/banco/postgres.ts:152-155`; a F07-E08 declara os limites), VM `shared-cpu-1x` de 1 GB (`fly.toml:122-127`) e scrypt N=2^17 de 128 MB por login (`apps/api/src/auth/senha.ts:27`).

Meta de referência ALY:RNF-02: 95% das operações online usuais em até 2 s, sem contar upload de mídia; hipótese da especificação, não promessa. O resultado vai a `dc360/docs/DESEMPENHO.md` com data, ambiente e versão. Ferramenta: k6 para cenários (multi-passo, taxa de chegada, limiar que reprova com código de saída); autocannon só para rota única; a justificativa está na E01. Ambiente: HML com dado sintético em volume (F01-E11), nunca PROD (`carga.test.ts` já proíbe `defesa-civil.fly.dev`).

Cada etapa diz ferramenta, ambiente, métrica, limite que reprova e evidência; os limites são valores iniciais propostos e aprovados por Rafael na E01. Etapa que reprova vira defeito com dono e prazo (T42) ou desvio aceito por escrito; a fase NÃO ajusta nada sem medida. As rodadas em HML são em SÉRIE (a máquina é uma só e o paralelo contamina a medida), mesmo com scripts disjuntos.

Ampliação por D-07, D-08, D-09, D-14, D-15 e D-16: E10 mede a transcodificação de vídeo e o custo de armazenamento; E11, as consultas PostGIS; E12, o login com escolha de município; E13, a assinatura por provedor (sempre com provedor SIMULADO, nunca o real); E14, os módulos F29 a F31 (incidentes e abrigos, logística, integrações), cada um com seu script. Nenhuma delas muda o produto: defeito achado vira etapa na fase dona.

Ordem sugerida: E01; depois E02, E03, E04, E05, E06 e E08 em qualquer ordem (série na execução); E07 e E09 por último; depois E10 a E14, também em série. Etapa de medição não tem tela nova: a prova é o relatório e a saída do k6; onde uma tela é exercitada com volume (E11 e E14, e a E09 se a tela do portal aparecer), as capturas das telas com o volume gerado passam pelo portão visual de `19-definicao-de-pronto.md`, seção 0, e pelo comando da F08-E13.

## Etapas

### V2-F24-E01 - Linha de base e metas (p95, concorrência)
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (todas usam)
- **Objetivo:** fixar operações usuais, metas e volume sintético e medir a linha de base.
- **Problema que resolve:** nenhum número medido (`BZ-D:BAS-45`, `OPS-105`): `carga.test.ts` não mede desempenho e ALY:RNF-02 não lista as "operações usuais".
- **Origem:** PR:D-19; ALY:RNF-02; REL:10 (OPS-105); BZ-D:BAS-45; BZ-D:CID-14.
- **Estado atual:** CRIAR; MANTER `db/test/carga.test.ts`.
- **Dependências de entrada:** G23 (imediato na ordem de execução).
- **O que deve ser implementado:**
  - Documentação: `dc360/docs/DESEMPENHO.md` (a criar): operações usuais com a rota real: login (`POST /auth/entrar`), lista, detalhe, mapa e indicadores de `/ocorrencias`, busca (`GET /busca`), criar ocorrência, despacho, `POST /sincronizacao/vistoria`, `GET /relatorios/resumo`, portal, cidadão e, nas etapas E10 a E14, vídeo, busca por raio, login com escolha, assinatura e módulos novos; p95 até 2000 ms; PDF, pacote e upload FORA, com meta própria; limites: 5xx abaixo de 1%, CPU e memória abaixo de 80%.
  - Arquivos: `scripts/gerar-volume-sintetico.mjs` (a criar): municípios sintéticos completos; recusa ambiente fora de `hml`; perfil proposto: 50 000 ocorrências, 150 000 evidências, 500 000 eventos, 30 municípios (NÃO CONFIRMADO); geometria e vídeo na E10 e na E11.
  - Infraestrutura: k6 em `dc360/carga/` (a criar), em máquina separada em `gru`; autocannon só na linha de base.
- **O que NÃO deve ser implementado nesta etapa:** carga (E02 a E14); meta como promessa; SLA (F28-E05).
- **Arquivos e módulos prováveis:** `dc360/docs/DESEMPENHO.md`, `dc360/scripts/gerar-volume-sintetico.mjs` e `dc360/carga/` (a criar).
- **Risco de segurança:** volume em PROD por engano: o script recusa fora de `hml`.
- **Impacto LGPD:** só dado sintético.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: medição.
- **Rollback:** Não se aplica: apagar o banco de HML.
- **Testes positivos:** o volume bate; a linha de base repete com variação abaixo de 20%.
- **Testes negativos:** gerador com `AMBIENTE_DC360=prod`: recusa; rodada com CPU do gerador acima de 70%: descartada.
- **Testes de autorização e isolamento:** contagens por município conferem; o volume não cruza município.
- **Regressão obrigatória:** `npm run test:scripts`; gates anteriores.
- **E2E:** Não se aplica: sem fluxo de usuário.
- **Validação humana:** Rafael aprova metas e limites.
- **Evidência a produzir:** `docs/evidencias-v2/G24/V2-F24-E01/` (linha de base, contagens).
- **Documentação a atualizar:** `DESEMPENHO.md`.
- **Definition of Done:** metas aprovadas, volume gerável, linha de base reproduzível.
- **Checkpoint:** Não.

### V2-F24-E02 - API e banco: p95 e consultas lentas sob carga
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** médio  |  **Paralelizável:** sim (com E03: scripts disjuntos; rodadas em série)
- **Objetivo:** medir p95, erro e pressão sobre o pool nas operações usuais e achar as consultas lentas.
- **Problema que resolve:** pool de 10 conexões (`banco/postgres.ts:152-155`), vigência por requisição (F03-E03) e scrypt de 128 MB por login (`auth/senha.ts:27`) nunca foram medidos (`BZ-D:ARQ-40`).
- **Origem:** ALY:RNF-02; REL:02; REL:10 (OPS-49); BZ-D:ARQ-40; BZ-D:BAS-45.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E01.
- **O que deve ser implementado:**
  - Infraestrutura: k6 `carga/api-usual.js` (a criar): coordenação (20 usuários: lista, detalhe, mapa, indicadores, busca) e dia de pico (taxa até 5 vezes a linha de base por 10 min), com tokens obtidos antes; login em rajada à parte (40 em 2 min) com `LOGIN_POR_IP` elevado SÓ em HML, medindo memória e p95.
  - Banco: `pg_stat_statements` em HML, se o plano permitir (NÃO CONFIRMADO): 10 consultas mais caras e `EXPLAIN (ANALYZE, BUFFERS)` das 5 piores; índice vira correção com medida antes e depois.
  - Observabilidade: limite que reprova: p95 acima de 2000 ms em operação usual; 5xx a partir de 1%; espera por conexão acima de 500 ms no p95; memória acima de 80%.
- **O que NÃO deve ser implementado nesta etapa:** índice ou cache sem medida; carga de portal e cidadão (E09).
- **Arquivos e módulos prováveis:** `dc360/carga/api-usual.js` (a criar), `dc360/docs/DESEMPENHO.md`.
- **Risco de segurança:** login elevado só em HML: a matriz de ambiente (F01-E09) o recusa em PROD.
- **Impacto LGPD:** só dado sintético.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: medição.
- **Rollback:** a variável de HML volta ao padrão.
- **Testes positivos:** relatório com p50, p95, p99 e 5xx por operação.
- **Testes negativos:** consulta de 20 s cancelada pelo `statement_timeout` (F07-E08) e a API segue; token expirado: 401; gerador acima de 70% de CPU: rodada descartada.
- **Testes de autorização e isolamento:** chamadas de B a recurso de A: 404, zero 200.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:isolamento`; gates anteriores.
- **E2E:** a rodada completa em HML.
- **Validação humana:** Rafael decide cada reprovação.
- **Evidência a produzir:** `docs/evidencias-v2/G24/V2-F24-E02/`.
- **Documentação a atualizar:** `DESEMPENHO.md`.
- **Definition of Done:** operações medidas; reprovação vira defeito ou desvio escrito.
- **Checkpoint:** Não.

### V2-F24-E03 - Worker e pipeline de arquivos sob carga
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** médio  |  **Paralelizável:** sim (com E02: scripts disjuntos; rodadas em série)
- **Objetivo:** medir vazão, latência e recuperação do worker (verificação de arquivos e relógios) sob volume.
- **Problema que resolve:** o worker e `fila_de_trabalho` (F07-E02, E04) são novos: tempo até `ativo`, vazão e retomada de lease não foram medidos, e os cinco relógios dividem o worker (DP:T43).
- **Origem:** DP:T43; DP:T25; REL:10 (OPS-105); BZ-D:UPL-31.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E01; G07.
- **O que deve ser implementado:**
  - Infraestrutura: k6 `carga/worker-arquivos.js` (a criar): 500 `verificar_arquivo` (JPEG de 3 MB e 12 MP) por `autorizar` e `confirmar`, worker na VM de PROD; mede `confirmar` até `ativo` (p50, p95), arquivos por minuto, memória e `morto`.
  - Banco: com 30 municípios sintéticos, a rodada completa do resumo e da minimização roda junto e é cronometrada.
  - Infraestrutura: derrubar o worker uma vez na rodada: o lease vence e outro o reassume, sem duplicado nem perdido.
  - Observabilidade: limite que reprova: p95 acima de 60 s (inicial); memória do worker acima de 80% da VM; `morto` por memória; duplicado ou perdido acima de 0; resumo dos municípios acima de 15 min (o intervalo).
- **O que NÃO deve ser implementado nesta etapa:** PDF (E05); upload público (E04); mudar o limite de 12 MP (F06-E06).
- **Arquivos e módulos prováveis:** `dc360/carga/worker-arquivos.js` (a criar), `dc360/docs/DESEMPENHO.md`, `dc360/apps/api/src/servicos/worker.ts`.
- **Risco de segurança:** só imagens válidas; as maliciosas são da F06-E16.
- **Impacto LGPD:** só imagens sintéticas.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: medição.
- **Rollback:** Não se aplica: medição.
- **Testes positivos:** relatório de tempos e vazão; retomada de lease com contagem final igual.
- **Testes negativos:** worker derrubado: nenhum arquivo duplicado nem perdido; imagem acima do limite de pixels termina `rejeitado`.
- **Testes de autorização e isolamento:** trabalho de A não lê chave de B sob concorrência.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:isolamento`; gates anteriores.
- **E2E:** a rodada em HML.
- **Validação humana:** Rafael derruba o worker na rodada.
- **Evidência a produzir:** `docs/evidencias-v2/G24/V2-F24-E03/`.
- **Documentação a atualizar:** `DESEMPENHO.md`.
- **Definition of Done:** vazão, latência e retomada medidas.
- **Checkpoint:** Não.

### V2-F24-E04 - Upload em pico de desastre
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (disputa o worker com E03)
- **Objetivo:** medir muita gente enviando foto ao mesmo tempo (agentes e cidadãos), nas duas APIs.
- **Problema que resolve:** pico de desastre (`BZ-D:CID-14`): `autorizar` e `confirmar` passam pela API, o PUT vai ao bucket e a verificação é do worker; cota (F06-E09) e limites (F15-E09, E10) nunca foram medidos juntos, e o tráfego público não pode derrubar o campo (DP:T43).
- **Origem:** DP:T25; DP:T43; BZ-D:CID-14.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E01; G07.
- **O que deve ser implementado:**
  - Infraestrutura: k6 `carga/upload-pico.js` (a criar): rampa de 0 a 200 uploads por minuto, 80% de cidadão e 20% de agente, fotos de 3 MB, PUT real no bucket de HML (F06-E15); mede p95 de `autorizar` e `confirmar` (sem o PUT), 429, fila (F21-E02) e o p95 de lista e sincronização na API de equipe.
  - Observabilidade: limite que reprova: p95 de `autorizar` acima de 2 s; API de equipe acima de 2 s com a pública saturada; fila crescendo 10 min depois da rampa; PUT recusado ou 5xx acima de 1%; agente com 429 por tráfego de cidadão.
- **O que NÃO deve ser implementado nesta etapa:** ajuste de cotas (CP-13); anti-abuso além da base (CP-27).
- **Arquivos e módulos prováveis:** `dc360/carga/upload-pico.js` (a criar), `dc360/docs/DESEMPENHO.md`.
- **Risco de segurança:** o PUT de teste gasta cota do bucket de HML.
- **Impacto LGPD:** só imagens sintéticas.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: medição.
- **Rollback:** Não se aplica: medição.
- **Testes positivos:** relatório com p95 por chamada e a fila drenando.
- **Testes negativos:** `autorizar` acima da cota devolve 429, nunca 5xx; PUT com tamanho divergente é recusado.
- **Testes de autorização e isolamento:** a cota de cidadão não consome a do campo (o agente autoriza no pico); token de cidadão na API de equipe: 401.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:isolamento`; gates anteriores.
- **E2E:** a rodada em HML com as duas APIs.
- **Validação humana:** Rafael lê a curva da fila.
- **Evidência a produzir:** `docs/evidencias-v2/G24/V2-F24-E04/`.
- **Documentação a atualizar:** `DESEMPENHO.md`.
- **Definition of Done:** pico medido nas duas APIs; fila drena.
- **Checkpoint:** Não.

### V2-F24-E05 - PDF, Chromium e memória
- **Prioridade:** P1
- **Tamanho:** L  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (disputa o worker de HML com E03 e E04)
- **Objetivo:** medir tempo e memória da geração de PDF no worker de 1 GB, com Chromium, em concorrência e com laudo grande.
- **Problema que resolve:** `fly.toml:122-127` dá 1 GB "por causa do Chromium", aberto por `documentos/pdf.ts` (no worker desde a F07-E05); ninguém mediu RSS por PDF, concorrência nem vazamento (`BZ-D:ARQ-26`).
- **Origem:** REL:02; DP:T43; BZ-D:ARQ-26.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E01; G07.
- **O que deve ser implementado:**
  - Infraestrutura: k6 `carga/pdf.js` (a criar): `GET /documentos/:id/laudo.pdf` com laudos de 1, 20 e 100 fotos de 3 MB, concorrência 1, 2 e 4; 50 PDFs em sequência (RSS do 50º contra o 1º); PDF junto da verificação de arquivos (E03); RSS do Node e do Chromium pela métrica do Fly.
  - Observabilidade: limite que reprova: p95 acima de 30 s com 20 fotos (inicial; a meta de 2 s não vale para PDF); RSS do worker acima de 80% de 1 GB; OOM nos logs; RSS 20% maior depois de 50 PDFs; `503 pdf_indisponivel` acima de 1%.
  - Documentação: o resultado dimensiona a VM do worker em `DESEMPENHO.md` (decisão de custo, CP-36).
- **O que NÃO deve ser implementado nesta etapa:** PDF tagged (F09-E15); guardar o PDF (F09-E05); recodificar fotos.
- **Arquivos e módulos prováveis:** `dc360/carga/pdf.js` (a criar), `dc360/docs/DESEMPENHO.md`, `dc360/apps/api/src/documentos/pdf.ts`.
- **Risco de segurança:** laudos sintéticos.
- **Impacto LGPD:** só dado sintético.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: medição.
- **Rollback:** Não se aplica: medição.
- **Testes positivos:** tabela de tempo e RSS por tamanho de laudo e concorrência.
- **Testes negativos:** Chromium indisponível: `503 pdf_indisponivel` e a API de equipe segue; pedido acima da concorrência espera.
- **Testes de autorização e isolamento:** PDF do município B pedido pelo A sob concorrência: 404.
- **Regressão obrigatória:** `npm run test:api` (`pdf-na-imagem.test.ts`); gates anteriores.
- **E2E:** a rodada em HML.
- **Validação humana:** Rafael abre o PDF de 100 fotos.
- **Evidência a produzir:** `docs/evidencias-v2/G24/V2-F24-E05/`.
- **Documentação a atualizar:** `DESEMPENHO.md`.
- **Definition of Done:** tempo, memória e vazamento medidos; VM do worker dimensionada.
- **Checkpoint:** Não.

### V2-F24-E06 - Pacote de município grande
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (disputa o worker de HML)
- **Objetivo:** provar que o pacote de saída de um município grande é montado e baixado sem derrubar o worker e com memória limitada.
- **Problema que resolve:** `montarPacoteDeSaida` lê todas as tabelas em memória (`apps/api/src/saida/pacote.ts:430-450`; `apps/api/PENDENCIAS.md`); a F07-E06 o leva ao worker com streaming e promete memória medida (`BZ-D:ARQ-28`, `OPS-23`).
- **Origem:** REL:02; REL:10 (OPS-23); BZ-D:ARQ-28.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E01.
- **O que deve ser implementado:**
  - Infraestrutura: `carga/pacote.js` (a criar): no município grande (E01), com objetos mínimos de foto, `POST /v1/saida/pacote` como administrador e estado até o download; mede tempo total, pico de RSS do worker, tamanho do ZIP, download e `SOMAS-SHA256.txt`; segundo cenário com carga usual da API de equipe durante o pacote; terceiro com dois pacotes de dois municípios juntos.
  - Observabilidade: limite que reprova: RSS do worker acima de 80% da VM; pacote sem concluir em 2 h (inicial; NÃO CONFIRMADO o que o município aceita esperar); p95 da API de equipe acima de 2 s durante o pacote; soma divergente; ZIP parcial exposto.
- **O que NÃO deve ser implementado nesta etapa:** mudar o conteúdo do pacote (F09-E11); telas (F10-E08); eliminação (F20-E04).
- **Arquivos e módulos prováveis:** `dc360/carga/pacote.js` (a criar), `dc360/docs/DESEMPENHO.md`, `dc360/apps/api/src/saida/pacote.ts`.
- **Risco de segurança:** o pacote concentra a base do município: só sintético, URL curta.
- **Impacto LGPD:** só dado sintético.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: medição.
- **Rollback:** Não se aplica: medição.
- **Testes positivos:** relatório de tempo, RSS e tamanho; as somas conferem.
- **Testes negativos:** worker reiniciado no meio: refaz sem expor pacote parcial; dois pacotes juntos: o segundo espera ou roda sem estourar memória.
- **Testes de autorização e isolamento:** administrador de B baixa pacote de A: 404.
- **Regressão obrigatória:** `npm run test:api` (`saida-de-municipio.test.ts`); gates anteriores.
- **E2E:** a rodada em HML.
- **Validação humana:** Rafael baixa o pacote e confere o índice.
- **Evidência a produzir:** `docs/evidencias-v2/G24/V2-F24-E06/` (tempos, RSS, somas).
- **Documentação a atualizar:** `DESEMPENHO.md`, `apps/api/PENDENCIAS.md`.
- **Definition of Done:** pacote do município grande medido, com memória e tempo registrados.
- **Checkpoint:** Não.

### V2-F24-E07 - Mapas e relatórios
- **Prioridade:** P2
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (rodada em série)
- **Objetivo:** medir mapa, indicadores, busca com `pg_trgm` e relatórios no município grande.
- **Problema que resolve:** `pico-lista-e-mapa.test.ts` prova teto e total com 200 ocorrências, não tempo; `GET /relatorios/ocorrencias.csv`, `GET /trilha` e a busca (`gin_trgm_ops`, migração 041) nunca rodaram em 50 000 linhas; o EXPLAIN de `carga.test.ts` aceita varredura completa porque 200 linhas é pouco.
- **Origem:** REL:02; ALY:RNF-02; BZ-D:BAS-45.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E01.
- **O que deve ser implementado:**
  - Infraestrutura: `carga/mapa-e-relatorios.js` (a criar), no município grande: `/ocorrencias/mapa` (tempo e tamanho), indicadores, busca com termo raro e comum, CSV de 12 meses (tempo e RSS), `GET /trilha` paginada sobre 500 000 eventos e `GET /relatorios/resumo`; `EXPLAIN (ANALYZE, BUFFERS)` de cada consulta no volume de HML.
  - Observabilidade: limite que reprova: p95 acima de 2 s em mapa, indicadores, busca e trilha paginada; CSV de 12 meses acima de 30 s ou RSS acima de 80%; `Seq Scan` em tabela de mais de 100 000 linhas nas consultas usuais.
- **O que NÃO deve ser implementado nesta etapa:** cache e materialização antes de uma reprovação; mapa do Google (cota externa).
- **Arquivos e módulos prováveis:** `dc360/carga/mapa-e-relatorios.js` (a criar), `dc360/docs/DESEMPENHO.md`, `dc360/db/test/carga.test.ts`.
- **Risco de segurança:** relatório CSV é exportação de dado: só sintético.
- **Impacto LGPD:** só dado sintético.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: medição.
- **Rollback:** Não se aplica: medição.
- **Testes positivos:** relatório de p95 e plano por consulta.
- **Testes negativos:** busca por termo de 2 letras não faz varredura completa; mapa acima do teto devolve o total, não trava a aba.
- **Testes de autorização e isolamento:** mapa e CSV do município B não trazem linha de A.
- **Regressão obrigatória:** `npm run test:api` (`pico-lista-e-mapa.test.ts`), `npm run test:isolamento`; gates anteriores.
- **E2E:** a rodada em HML.
- **Validação humana:** Rafael abre o mapa do município grande no painel de HML.
- **Evidência a produzir:** `docs/evidencias-v2/G24/V2-F24-E07/` (tempos e planos).
- **Documentação a atualizar:** `DESEMPENHO.md`.
- **Definition of Done:** consultas do município grande medidas, com plano e limite.
- **Checkpoint:** Não.

### V2-F24-E08 - Sincronização do campo sob concorrência
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (rodada em série)
- **Objetivo:** medir a volta do sinal com muitos aparelhos juntos: 0 vistoria perdida, 0 duplicada e o tempo para esvaziar a fila.
- **Problema que resolve:** o cenário real da ALY:RNF-03 é a volta do sinal com dezenas de aparelhos; `carga.test.ts` usa 5 numa conexão PGlite; `POST /sincronizacao/vistoria` tem idempotência e limite de 300 por minuto por usuário (`servidor.ts:381`).
- **Origem:** ALY:RNF-03; REL:03; ALY:CA-05.
- **Estado atual:** CRIAR; MANTER o motor offline `packages/campo`.
- **Dependências de entrada:** E01.
- **O que deve ser implementado:**
  - Infraestrutura: `carga/sincronizacao.js` (a criar): 60 aparelhos virtuais de uma equipe grande, cada um com 15 vistorias e 4 fotos (autorizar, PUT, confirmar), reconectando em 60 s; 10% dos itens reenviados com a mesma chave de idempotência e timeouts injetados; contagem final: vistorias e evidências iguais aos itens únicos.
  - Observabilidade: limite que reprova: perdida ou duplicada acima de 0; p95 acima de 2 s; fila esvaziando em mais de 15 min (inicial); 5xx acima de 1%; item preso por 429 além do `Retry-After`.
- **O que NÃO deve ser implementado nesta etapa:** o motor offline (Jest); push; tela de conflito (F14-E03).
- **Arquivos e módulos prováveis:** `dc360/carga/sincronizacao.js` (a criar), `dc360/docs/DESEMPENHO.md`, `dc360/apps/api/src/rotas/sincronizacao.ts`.
- **Risco de segurança:** 60 tokens de teste só em HML, revogados no fim.
- **Impacto LGPD:** só dado sintético.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: medição.
- **Rollback:** Não se aplica: medição.
- **Testes positivos:** contagem final igual aos itens únicos; tempo para esvaziar.
- **Testes negativos:** reenvio com a mesma chave não duplica; agente desativado no meio: a fila guarda o item (F00-E05).
- **Testes de autorização e isolamento:** aparelhos do município B na mesma rajada: nenhuma vistoria de B aparece em A.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:campo`, `npm run test:isolamento`; gates anteriores.
- **E2E:** a rodada em HML, com a API de coordenação lendo ao mesmo tempo.
- **Validação humana:** Rafael confere a contagem final no painel de HML.
- **Evidência a produzir:** `docs/evidencias-v2/G24/V2-F24-E08/`.
- **Documentação a atualizar:** `DESEMPENHO.md`.
- **Definition of Done:** 0 perdida e 0 duplicada sob a rajada; tempo de esvaziar registrado.
- **Checkpoint:** Não.

### V2-F24-E09 - Portal, cidadão em pico e crescimento da trilha
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** médio  |  **Paralelizável:** não
- **Objetivo:** medir o portal, o cidadão em pico e o crescimento da trilha em anos simulados.
- **Problema que resolve:** pico público (`BZ-D:CID-14`): RLS por órgão (F04-E05) e cotas de duas camadas (F15-E09, E10) não foram medidos; a trilha só cresce sem projeção.
- **Origem:** PR:D-07; REL:07; BZ-D:CID-14.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E01; F34-E06.
- **O que deve ser implementado:**
  - Infraestrutura: `carga/portal.js` (a criar): 40 usuários de 6 órgãos, com `EXPLAIN` por órgão; `carga/cidadao.js` (a criar): 500 cidadãos novos em 10 min (OTP por notificador de arquivo, relato idempotente, mensagem de chat do relato (F34-E06), acompanhamento), de dois geradores com IPs distintos.
  - Banco: `gerar-volume-sintetico.mjs --anos 5` preenche a trilha e os eventos de encaminhamento e relato e mede, por ano, `pg_total_relation_size` e o p95 de `GET /trilha`; projeta GB por município por ano contra `teto_armazenamento_bytes` e o plano do banco (NÃO CONFIRMADO).
  - Observabilidade: limite que reprova: p95 acima de 2 s no portal, no OTP e no acompanhamento; 429 em cidadão legítimo acima de 1%; `GET /trilha` acima de 2 s no ano 5; banco projetado acima de 70% do disco.
- **O que NÃO deve ser implementado nesta etapa:** abrir o canal ao público (CP-28); pentest e abuso (F25-E09).
- **Arquivos e módulos prováveis:** `dc360/carga/portal.js` (a criar), `dc360/carga/cidadao.js` (a criar), `dc360/scripts/gerar-volume-sintetico.mjs`.
- **Risco de segurança:** OTP de teste só por notificador de arquivo.
- **Impacto LGPD:** só dado sintético.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: medição.
- **Rollback:** Não se aplica: medição.
- **Testes positivos:** p95 por superfície e curva de tamanho por ano.
- **Testes negativos:** relatos do mesmo cidadão acima da cota: 429, sem 5xx; OTP repetido além do limite: 429 genérico.
- **Testes de autorização e isolamento:** usuário de Obras lê encaminhamento da Saúde: 404 sob carga; cidadão A pede relato do cidadão B: 404.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:isolamento`; gates anteriores.
- **E2E:** a rodada em HML.
- **Validação humana:** Rafael lê a projeção para o plano do banco (CP-31).
- **Evidência a produzir:** `docs/evidencias-v2/G24/V2-F24-E09/`.
- **Documentação a atualizar:** `DESEMPENHO.md`.
- **Definition of Done:** portal e cidadão medidos; crescimento projetado.
- **Checkpoint:** Não.

### V2-F24-E10 - Transcodificação de vídeo sob carga e custo de armazenamento
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (a máquina do worker é uma só)
- **Objetivo:** medir a transcodificação do vídeo do cidadão (30 s, 50 MB) em pico: tempo, memória, fila, efeito sobre a API e custo por município.
- **Problema que resolve:** a F07-E10 isola o `ffmpeg` e a F07-E11 fixa a concorrência em teste isolado; ninguém mediu o pico de 50 envios juntos nem o efeito no p95 da API.
- **Origem:** PR:D-07; PR:D-19; DP:T25.
- **Estado atual:** CRIAR (cenário), sobre F07-E10 e F07-E11.
- **Dependências de entrada:** E01; E04; F07-E10; F07-E11; F34-E04.
- **O que deve ser implementado:**
  - Infraestrutura: `carga/video.js` (a criar): 50 vídeos sintéticos de 30 s (HEVC e H.264, 5 a 50 MB) em 10 min; mede o tempo até `ativo`, o pico de memória do `ffmpeg` e a idade da fila.
  - Observabilidade: limites que reprovam: fila sem drenar em 30 min, p95 da API 20% acima da linha de base na rampa, memória do worker acima de 80%.
  - Banco: projeção de GB por município por ano para 100 vídeos por mês (CP-47).
- **O que NÃO deve ser implementado nesta etapa:** mudar o `ffmpeg` ou a concorrência (F07-E10, F07-E11); abrir o vídeo em produção; moderação.
- **Arquivos e módulos prováveis:** `dc360/carga/video.js` (a criar), `dc360/scripts/gerar-volume-sintetico.mjs`.
- **Risco de segurança:** vídeo sintético só em HML; o worker segue sem rede.
- **Impacto LGPD:** só vídeo sintético.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: medição.
- **Rollback:** Não se aplica: medição.
- **Testes positivos:** os 50 vídeos chegam a `ativo`; a projeção de GB sai.
- **Testes negativos:** vídeo de 60 s ou 51 MB: recusado sem 5xx; vídeo que trava o `ffmpeg`: `rejeitado`, a fila segue.
- **Testes de autorização e isolamento:** o vídeo de A não é lido com URL de B sob carga.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:scripts`; gates anteriores.
- **E2E:** a rodada em HML, API e worker separados.
- **Validação humana:** Rafael lê a projeção para CP-47.
- **Evidência a produzir:** `docs/evidencias-v2/G24/V2-F24-E10/`.
- **Documentação a atualizar:** `DESEMPENHO.md`.
- **Definition of Done:** pico de vídeo medido e custo projetado.
- **Checkpoint:** CP-47 (o custo fixa o teto de vídeo em produção).

### V2-F24-E11 - Consultas PostGIS: raio, imóvel e área de risco sob volume
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** médio  |  **Paralelizável:** não (mesmo banco de HML)
- **Objetivo:** medir a busca por raio, por imóvel e por área de risco com geometria em volume, com plano de consulta e índice espacial.
- **Problema que resolve:** o PostGIS entra na V2 (D-16); consulta espacial sem `GiST` vira varredura completa, e o PGlite do CI não mede a extensão real.
- **Origem:** PR:D-16; PR:D-19; ALY:GEO-02.
- **Estado atual:** CRIAR (cenário), sobre F32-E08 e E09.
- **Dependências de entrada:** E01; E02; F32-E08; F32-E09.
- **O que deve ser implementado:**
  - Banco: `gerar-volume-sintetico.mjs --geo` cria 50 000 ocorrências com ponto e 2 000 áreas de risco em polígono, em 5 municípios; `EXPLAIN (ANALYZE, BUFFERS)` de cada consulta espacial, exigindo índice `GiST` e sem varredura completa.
  - Infraestrutura: `carga/geo.js` (a criar): busca por raio de 500 m e de 5 km, por imóvel e por interseção com área de risco, em 20 usuários, usando as rotas da F32.
  - Observabilidade: limites que reprovam: p95 acima de 2000 ms, plano sem índice espacial, 5xx acima de 1%.
- **O que NÃO deve ser implementado nesta etapa:** mudar consultas ou índices (defeito vira etapa da F32); camadas externas GIS (F31-E13).
- **Arquivos e módulos prováveis:** `dc360/carga/geo.js` (a criar), `dc360/scripts/gerar-volume-sintetico.mjs`, `dc360/docs/DESEMPENHO.md`.
- **Risco de segurança:** raio não cruza município: conferido sob carga.
- **Impacto LGPD:** coordenadas sintéticas.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: medição.
- **Rollback:** Não se aplica: medição.
- **Testes positivos:** p95 abaixo de 2000 ms e `Index Scan` em todas as consultas espaciais.
- **Testes negativos:** raio acima do teto da F32-E08: 422; consulta sem índice reprova.
- **Testes de autorização e isolamento:** o raio de A ao redor da divisa não devolve ocorrência de B; a área de risco de B: 404.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:isolamento`; gates anteriores.
- **E2E:** a rodada em HML com PostGIS real.
- **Validação humana:** Rafael lê os planos; capturas do mapa com 50 000 pontos no portão visual (19, seção 0).
- **Evidência a produzir:** `docs/evidencias-v2/G24/V2-F24-E11/`: planos, saída do k6 e `capturas/INDEX.md`.
- **Documentação a atualizar:** `DESEMPENHO.md`.
- **Definition of Done:** consultas espaciais medidas, com índice e dentro do limite.
- **Checkpoint:** Não.

### V2-F24-E12 - Login com escolha de município e troca de município sob rajada
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (mesma máquina e pool da E02)
- **Objetivo:** medir o login em dois passos (senha, depois escolha do município) e a troca de município, para pessoas com 1, 12 e 50 vínculos.
- **Problema que resolve:** o `scrypt` custa 128 MB por login; o segundo passo não pode repetir esse custo, e a lista de municípios da pessoa não pode ficar lenta.
- **Origem:** PR:D-08; PR:D-19; DP:T03.
- **Estado atual:** CRIAR (cenário), sobre F03-E15 e F03-E16.
- **Dependências de entrada:** E01; E02; F03-E16.
- **O que deve ser implementado:**
  - Infraestrutura: `carga/login-com-escolha.js` (a criar): 30 logins em rajada, depois `POST /v1/auth/municipio` e `POST /v1/auth/trocar-municipio`, com pessoas sintéticas de 1, 12 e 50 vínculos.
  - Observabilidade: memória por processo durante a rajada; contagem de execuções do `scrypt` (uma por login, nenhuma na escolha ou na troca); p95 de cada passo.
  - Observabilidade: limites que reprovam: p95 acima de 2000 ms, memória da API acima de 80%, escolha ou troca refazendo o `scrypt`.
- **O que NÃO deve ser implementado nesta etapa:** mudar o custo do `scrypt` ou o desafio de 5 minutos (F03-E16); tela de escolha (F10-E01).
- **Arquivos e módulos prováveis:** `dc360/carga/login-com-escolha.js` (a criar), `apps/api/src/auth/servico.ts`, `dc360/docs/DESEMPENHO.md`.
- **Risco de segurança:** a rajada de senha errada não pode revelar se o e-mail existe nem trancar outra pessoa.
- **Impacto LGPD:** pessoas sintéticas.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: medição.
- **Rollback:** Não se aplica: medição.
- **Testes positivos:** pessoa de 50 vínculos escolhe e troca com p95 abaixo de 2000 ms; o `scrypt` roda uma vez por login.
- **Testes negativos:** desafio vencido: 401 sem custo de `scrypt`; 30 senhas erradas de um IP: 429 sem derrubar o login de outro IP.
- **Testes de autorização e isolamento:** escolha de município fora da lista da pessoa: 401; o token de B não lê A depois da troca.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:isolamento`; gates anteriores.
- **E2E:** a rodada em HML.
- **Validação humana:** Rafael lê o relatório.
- **Evidência a produzir:** `docs/evidencias-v2/G24/V2-F24-E12/` (saída do k6 e memória).
- **Documentação a atualizar:** `DESEMPENHO.md`.
- **Definition of Done:** login com escolha e troca medidos, sem `scrypt` repetido.
- **Checkpoint:** Não.

### V2-F24-E13 - Assinatura por provedor externo sob carga, com provedor simulado
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** médio  |  **Paralelizável:** não (worker e fila compartilhados)
- **Objetivo:** medir a assinatura por provedor externo (D-09) com provedor SIMULADO de latência e falha configuráveis: fila, repetição, idempotência e tempo até o estado final.
- **Problema que resolve:** sem medida, a fila de assinatura pode travar o worker, duplicar chamada ou deixar documento sem estado final.
- **Origem:** PR:D-09; PR:D-19; DP:T27.
- **Estado atual:** CRIAR (cenário), sobre a F09-E22.
- **Dependências de entrada:** E01; E03; F09-E22; F07-E02.
- **O que deve ser implementado:**
  - Infraestrutura: `carga/assinatura.js` (a criar) e `carga/provedor-simulado.mjs` (a criar), com latência de 200 ms, 2 s e 30 s e 20% de falha; 100 documentos em 10 min.
  - Observabilidade: tempo da aprovação autenticada (síncrono) e até o estado final do provedor (assíncrono); idade da fila; chamadas repetidas por documento.
  - Observabilidade: limites que reprovam: aprovação acima de 2000 ms, documento sem estado final em 30 min, chamada duplicada com a mesma chave de idempotência.
- **O que NÃO deve ser implementado nesta etapa:** chamar o provedor real (custo e cota, CP-41); nomenclatura jurídica (J8); mudar o adaptador (F09).
- **Arquivos e módulos prováveis:** `dc360/carga/assinatura.js` e `provedor-simulado.mjs` (a criar).
- **Risco de segurança:** o simulado só responde a HML e nunca recebe documento real.
- **Impacto LGPD:** documentos sintéticos.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: medição.
- **Rollback:** Não se aplica: medição.
- **Testes positivos:** 100 documentos chegam ao estado final; o p95 da aprovação fica abaixo de 2000 ms com o provedor a 30 s.
- **Testes negativos:** provedor fora por 5 min: documentos esperam e retomam sem duplicar; retorno repetido: um só efeito.
- **Testes de autorização e isolamento:** aprovação de A em documento de B: 404; retorno do provedor para documento de outro município: descartado.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:scripts`; gates anteriores.
- **E2E:** a rodada em HML com o provedor simulado.
- **Validação humana:** Rafael lê o relatório.
- **Evidência a produzir:** `docs/evidencias-v2/G24/V2-F24-E13/`.
- **Documentação a atualizar:** `DESEMPENHO.md`.
- **Definition of Done:** fluxo de assinatura medido com falha e latência, sem duplicação.
- **Checkpoint:** CP-41 (a medição com o provedor real fica bloqueada).

### V2-F24-E14 - Módulos de incidentes, logística e integrações: carga por fase
- **Prioridade:** P2
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (mesma máquina de HML)
- **Objetivo:** medir as leituras e escritas principais de F29 (incidentes e abrigos), F30 (logística) e F31 (integrações), cada módulo com seu script.
- **Problema que resolve:** os módulos novos nascem depois da linha de base e entram sem medida; um incidente grande e um abrigo cheio são o pico real de desastre.
- **Origem:** PR:D-15; PR:D-14; PR:D-19.
- **Estado atual:** CRIAR (roteiro por fase); os números abaixo são propostas, NÃO CONFIRMADAS.
- **Dependências de entrada:** E01; E02; G29; G30; G31.
- **O que deve ser implementado:**
  - Infraestrutura: `carga/incidentes.js`, `carga/logistica.js` e `carga/integracoes.js` (a criar), um por módulo: incidente com 500 ocorrências e 30 abrigos com ocupação (F29); 10 000 movimentos de estoque (F30); fila de 1 000 mensagens a conectores simulados, com falha e repetição (F31).
  - Observabilidade: limites que reprovam: p95 acima de 2000 ms, fila sem drenar em 30 min, mensagem duplicada ao conector.
  - Documentação: `DESEMPENHO.md` ganha uma seção por módulo.
- **O que NÃO deve ser implementado nesta etapa:** chamar S2ID, SEI, WhatsApp ou Cemaden reais (credenciamento, F31-E09, E14 a E17); alterar os módulos; escrever o script de um módulo antes do gate dele.
- **Arquivos e módulos prováveis:** `dc360/carga/incidentes.js`, `logistica.js` e `integracoes.js` (a criar).
- **Risco de segurança:** conector simulado nunca recebe dado real.
- **Impacto LGPD:** só dado sintético.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: medição.
- **Rollback:** Não se aplica: medição.
- **Testes positivos:** cada módulo mede p95 abaixo de 2000 ms e drena a fila.
- **Testes negativos:** conector que devolve 429: espera e repete sem duplicar.
- **Testes de autorização e isolamento:** incidente e abrigo de A, para B sob carga: 404.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:isolamento`; gates anteriores.
- **E2E:** a rodada em HML, uma por módulo.
- **Validação humana:** Rafael lê os relatórios; capturas das telas com o volume (19, seção 0).
- **Evidência a produzir:** `docs/evidencias-v2/G24/V2-F24-E14/`: saídas do k6 e `capturas/INDEX.md`.
- **Documentação a atualizar:** `DESEMPENHO.md`.
- **Definition of Done:** os três módulos medidos, com limites aplicados.
- **Checkpoint:** Não.

# GATE G24 - DESEMPENHO MEDIDO
Só passa se:
- [ ] (E01) `DESEMPENHO.md` lista as operações usuais com a rota real e a meta de p95 de 2 s (ALY:RNF-02, sem upload), os limites foram aprovados por Rafael, o volume sintético é gerável só em HML e a linha de base repete com variação abaixo de 20%. Evidência: `docs/evidencias-v2/G24/V2-F24-E01/`.
- [ ] (E02) o p95 das operações usuais, a pressão sobre o pool de 10 conexões, o login em rajada e as 10 consultas mais caras foram medidos; cada reprovação virou defeito com dono ou desvio aceito por escrito. Evidência: E02.
- [ ] (E03) vazão e latência da verificação de arquivos e dos relógios foram medidas e a retomada de lease do worker foi provada sem duplicado nem perdido. Evidência: E03.
- [ ] (E04) o upload em pico foi medido nas duas APIs e a fila de arquivos drenou depois da rampa. Evidência: E04.
- [ ] (E05) tempo, memória e vazamento do PDF com Chromium foram medidos na VM de 1 GB e a VM do worker foi dimensionada. Evidência: E05.
- [ ] (E06) o pacote do município grande foi montado e baixado com memória e tempo registrados. Evidência: E06.
- [ ] (E07) mapa, indicadores, busca e relatórios do município grande foram medidos, com plano por consulta. Evidência: E07.
- [ ] (E08) a sincronização com 60 aparelhos em rajada terminou com 0 vistoria perdida e 0 duplicada e o tempo para esvaziar a fila foi registrado. Evidência: E08.
- [ ] (E09) portal e cidadão em pico foram medidos e o crescimento da trilha foi projetado em cinco anos contra o plano do banco. Evidência: E09.
- [ ] (E10) o pico de 50 vídeos foi medido (tempo até `ativo`, memória do `ffmpeg`, fila drenada em 30 min, p95 da API até 20% acima da linha de base) e a projeção de GB por município foi entregue ao CP-47. Evidência: E10.
- [ ] (E11) as consultas por raio, imóvel e área de risco usam índice espacial, ficam abaixo de 2000 ms de p95 em 50 000 ocorrências e não cruzam município; capturas do mapa com volume. Evidência: E11.
- [ ] (E12) o login com escolha e a troca de município foram medidos com pessoas de 1, 12 e 50 vínculos, sem repetir o `scrypt` na escolha. Evidência: E12.
- [ ] (E13 e CP-41) a assinatura por provedor SIMULADO terminou com 100 documentos em estado final e sem chamada duplicada; a medida com o provedor real fica bloqueada até a contratação. Evidência: E13.
- [ ] (E14) incidentes e abrigos, logística e integrações foram medidos com seus scripts, dentro do limite de 2000 ms de p95 e sem mensagem duplicada ao conector simulado; capturas das telas com volume. Evidência: E14.
- [ ] `DESEMPENHO.md` registra data, ambiente, versão e resultado de cada rodada, e nenhum número foi escrito como promessa (SLA fica em F28-E05, atrás de CP-31).
- [ ] nenhuma regressão: todos os gates anteriores na ordem de execução (G00 a G23) continuam verdes (se um quebrar, ESTE gate volta a REPROVADO), com `npm run test:api`, `npm run test:isolamento`, `npm run test:campo`, `npm run test:scripts` e `npm audit` verdes.
- [ ] documentação atualizada (`DESEMPENHO.md`, `IMPLANTACAO.md`) e evidências arquivadas em `docs/evidencias-v2/G24/`.

**Reabre se:** uma rodada nova mostrar operação usual com p95 acima de 2 s sem desvio escrito; o worker ou a API estourarem memória na VM dimensionada; perda ou duplicidade na sincronização; carga rodada contra PROD; número medido virar promessa sem CP-31; módulo novo (F29 a F31) ou provedor de assinatura em produção sem medida; consulta espacial sem índice; etapa com tela fechada sem capturas.
**Este Gate libera:** F26 (POC com os números medidos), F27 (limites do piloto e critérios de parada), F28-E05 (SLA, atrás de CP-31) e a revisão de capacidade e custo da onda seguinte (CP-36).
