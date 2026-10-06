# Fase 23: Acessibilidade (gate transversal e validação final)

**Gate da fase:** G23 ACESSIBILIDADE VALIDADA | **Depende dos gates:** G22 (cumulativo na ordem de execução de `STATUS.md`: G00 a G22 e G29 a G35, de modo que incidentes, abrigos, logística, canal ampliado, idiomas e tema por município já existem) | **Superfícies tocadas:** `apps/web`, `apps/portal`, `apps/console`, `apps/campo`, `apps/cidadao`, `apps/api` (só o PDF), CI e `scripts/` | **Checkpoints da fase:** CP-32, CP-15, CP-38 (decidido na F17-E15), CP-45, CP-73

A F23 é o gate TRANSVERSAL e a VALIDAÇÃO FINAL: cada etapa de interface anterior já traz o seu critério (F08-E06, F10-E11, F11-E21, F14-E10, F17-E15, F18-E10, e as fases F29 a F35 para os módulos novos); aqui se prova o conjunto em navegador e em aparelho e se corrige o que sobrou. Alvo da web (painel, portal, console): WCAG 2.2 AA, teclado completo, reflow em 320 px e zoom de 400%, contraste 4,5:1 (texto) e 3:1 (componentes), nunca só cor, autenticação que permite colar o código. Alvo do mobile (app do cidadão e do agente): VoiceOver e TalkBack em todos os fluxos, fonte até 200% sem corte, toque de 44 pt (iOS) e 48 dp (Android), movimento reduzido, rotação livre no cidadão (CP-38), linguagem simples. O documento do Alyson (ALY:RNF-09) cita WCAG 2.1 AA: o alvo da V2 é a 2.2 AA, que o inclui na prática (o 4.1.1 foi removido na 2.2).

As decisões de 2026-10-01 acrescentam à fase o PWA do painel e do portal, sem offline (D-22; o app do cidadão é React Native e não é PWA), o VLibras e os idiomas pt-BR, en e es (D-12), o tema por município com contraste AA (D-11) e os módulos novos (E09 a E13). O lint já foi criado na F01-E17: a E02 só acrescenta as regras de acessibilidade.

PRESERVA (MANTER): os portões estáticos (`apps/web/test/acessibilidade.test.ts`, `scripts/portao-acessibilidade-do-aplicativo.test.mjs`, contraste de tokens), que rodam a cada commit e não são trocados por axe, que não vê foco nem anúncio. O humano é obrigatório antes do público: leitor de tela em aparelho real (iOS e Android), fonte ampliada e, quando viável, pessoa com deficiência (CP-32).

NÃO FAZ: declaração de conformidade nem aplicabilidade legal (LBI e eMAG são o J9, jurídico, atrás do CP-32): a fase entrega o relatório técnico e a lista de verificação eMAG. Libras em vídeo, tema por secretaria e tema editável seguem fora (`21-fora-da-v2.md`); VLibras, idiomas e tema por município ENTRAM.

Ordem sugerida: E01 e E02 em paralelo; E03 e E04 depois (a E04 também exige a E01); E09 a E12 depois da E01, em paralelo, e a E13 depois da E04; E05 depois da E03; E06 independente (exige F09-E15); E07 e E08 por último (consomem as E09 a E13).

## Etapas

### V2-F23-E01 - axe-core no CI (Playwright) nas superfícies web
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com F23-E02)
- **Objetivo:** axe-core em navegador real varre toda tela web a cada PR, em dois temas, Alto Contraste e 320 px; `serious` ou `critical` reprova o merge.
- **Problema que resolve:** `BZ-D:A11-13`: nenhum `package.json` tem axe e `verificar.yml` não tem passo de acessibilidade; os portões leem fonte e token, não pixel (REL:11 2.1).
- **Origem:** DP:T29; BZ-D:A11-13; REL:11 2.1.
- **Estado atual:** CRIAR (runner e job); MANTER `acessibilidade.test.ts` e o axe do portal (F11-E21), que o runner chama.
- **Dependências de entrada:** G22 (inclui G29 a G35); F08-E06 (`scripts/superficies.json`); F10-E11.
- **O que deve ser implementado:**
  - Infraestrutura: `dc360/scripts/axe/executar.mjs` (a criar) lê as superfícies `web` ativas de `scripts/superficies.json` e, por tela, abre quatro contextos Playwright (claro, escuro, `forcedColors: 'active'`, 320x256) com `@axe-core/playwright` (tags `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`).
  - Arquivos: `dc360/scripts/axe/rotas-axe.json` (a criar) lista telas e estados (vazio, erro, modal), o seletor de município da pessoa global e o passo de colar o código no campo do TOTP (`SegundoFator.tsx`); `scripts/axe-cobertura.test.mjs` reprova rota de `App.tsx` fora da lista; `scripts/axe-excecoes.json` exige motivo, dono e vencimento ISO.
  - Infraestrutura: job `acessibilidade` em `verificar.yml`, nas regras da F01-E02.
- **O que NÃO deve ser implementado nesta etapa:** leitor de tela (E03); medição em aparelho (E04); correções (E08); lint (E02).
- **Arquivos e módulos prováveis:** `dc360/scripts/axe/executar.mjs`, `scripts/axe-cobertura.test.mjs`, `scripts/axe-excecoes.json` (a criar em `dc360/scripts/`), `.github/workflows/verificar.yml`.
- **Risco de segurança:** dependência só de desenvolvimento; exceção sem prazo vira ponto cego.
- **Impacto LGPD:** Não se aplica: dados sintéticos.
- **Migração necessária:** Não.
- **Compatibilidade:** só CI e teste.
- **Rollback:** tirar o job do ruleset.
- **Testes positivos:** zero `critical` e `serious` em toda tela e contexto.
- **Testes negativos:** `<img>` sem `alt` em PR de prova reprova; tela fora da lista e exceção vencida reprovam.
- **Testes de autorização e isolamento:** Não se aplica: sem rota nova.
- **Regressão obrigatória:** `npm test`, `npm run test:e2e`, `npm run test:scripts`; G08, G10.
- **E2E:** o próprio runner.
- **Validação humana:** Rafael confere cada exceção.
- **Evidência a produzir:** `docs/evidencias-v2/G23/V2-F23-E01/` (relatório por tela, PR de prova).
- **Documentação a atualizar:** `dc360/README.md`.
- **Definition of Done:** job obrigatório; zero `serious` e `critical`; exceções com dono e prazo.
- **Checkpoint:** Não.

### V2-F23-E02 - Regras de acessibilidade para React Native no lint (campo e cidadão)
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com F23-E01)
- **Objetivo:** acrescentar ao lint do monorepo as regras que reprovam controle sem rótulo, papel ou estado em `apps/campo` e `apps/cidadao`, no CI.
- **Problema que resolve:** o lint existe desde a F01-E17, sem regra de acessibilidade; o portão estático do app não vê `TextInput`, tocável de componente externo (A11-19) nem rótulo ruim (A11-20).
- **Origem:** DP:T29; PR:D-19; BZ-D:A11-19; BZ-D:A11-20; BZ-D:A11-21.
- **Estado atual:** EXPANDIR (`apps/campo/eslint.config.mjs`, a baseline e `lint-teto.json` da F01-E17 ficam, sem recriar); CRIAR só `apps/cidadao/eslint.config.mjs`; MANTER `scripts/portao-acessibilidade-do-aplicativo.test.mjs`, complementar.
- **Dependências de entrada:** F01-E17; G19 (traz `apps/cidadao`).
- **O que deve ser implementado:**
  - Infraestrutura: `eslint-plugin-react-native-a11y` (`has-accessibility-props`, `has-valid-accessibility-role`, `has-valid-accessibility-state`, `no-nested-touchables`) entra no config do campo (F01-E17) e no do cidadão (a criar; lockfile próprio), declarando `Tocavel` e `Botao` (`apps/campo/src/ui/componentes.tsx`) como tocáveis; o script `lint` e o job `aplicativo` já existem.
  - Arquivos: regra local reprova `TextInput` sem rótulo, `Image` sem alternativa e `allowFontScaling={false}` (protege a fonte de 200%); achado antigo vira entrada de `eslint-suppressions.json` com dono e data ISO (E08) e o teto só desce.
- **O que NÃO deve ser implementado nesta etapa:** recriar lint, Prettier ou baseline (F01-E17); formatação; leitor de tela (E03); correção em massa (E08); lint da web (E01).
- **Arquivos e módulos prováveis:** `apps/campo/eslint.config.mjs` (F01-E17), `apps/cidadao/eslint.config.mjs`, `scripts/lint-de-acessibilidade.test.mjs` (a criar em `dc360/scripts/`), `.github/workflows/verificar.yml`.
- **Risco de segurança:** devDependency nos apps: `npm audit` e `expo-doctor` seguem verdes.
- **Impacto LGPD:** Não se aplica: análise estática.
- **Migração necessária:** Não.
- **Compatibilidade:** só ferramenta.
- **Rollback:** remover as regras do plugin.
- **Testes positivos:** `npm run lint` sai 0 nos dois apps.
- **Testes negativos:** fixtures `<Pressable>` só com ícone, `<TextInput />` e `allowFontScaling={false}` reprovam em `lint-de-acessibilidade.test.mjs`; subir o teto reprova.
- **Testes de autorização e isolamento:** Não se aplica: sem rota nem dado.
- **Regressão obrigatória:** `npm run lint`, `npm run test:campo`, `npm run test:scripts`, `npx expo-doctor` no app; G01, G14.
- **E2E:** Não se aplica: lint estático.
- **Validação humana:** Rafael confere regras e baseline.
- **Evidência a produzir:** `docs/evidencias-v2/G23/V2-F23-E02/` (saída do lint, fixtures reprovadas, baseline).
- **Documentação a atualizar:** `apps/campo/LEIA-ME.md`.
- **Definition of Done:** regras no lint dos dois apps; baseline com dono e data; regras provadas por fixture.
- **Checkpoint:** Não.

### V2-F23-E03 - Leitor de tela real: VoiceOver e TalkBack em todos os fluxos
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** sim (com F23-E04: passadas distintas)
- **Objetivo:** percorrer os fluxos dos dois apps com VoiceOver (iPhone) e TalkBack (Android), e os da web com NVDA, registrando cada passo.
- **Problema que resolve:** `BZ-D:A11-14`, `A11-25`: nenhum registro de leitor de tela; `apps/campo/PENDENCIAS.md:150-155` diz que nada rodou em aparelho e `:178-180` que não há Android.
- **Origem:** DP:T29; BZ-D:A11-14; BZ-D:A11-25; BZ-D:A11-42.
- **Estado atual:** CRIAR (roteiro e registro); reaproveita roteiros de F10-E11, F11-E21, F14-E10, F17-E15.
- **Dependências de entrada:** E02; builds de HML (F14-E11, F17-E17) nos aparelhos.
- **O que deve ser implementado:**
  - Acessibilidade: `docs/evidencias-v2/G23/V2-F23-E03/roteiro-<superficie>.md` por superfície (cidadão: entrar colando o código, relato com foto, acompanhar; agente: fila, vistoria, sincronização; web: TOTP colando o código, formulário com erro, `ConfirmarAcao`). Por passo: fala do leitor, ordem de foco, estado anunciado, texto em linguagem simples, resultado, severidade.
  - Acessibilidade: atenção especial à assinatura por traço (`apps/campo/src/ui/Assinatura.tsx`), ao mapa do Google (`MapaDoGoogle.tsx`), à faixa de sincronização e à tela de erro (`ErrorBoundary`).
  - Infraestrutura: registro de modelo, sistema e hash do build; só dados sintéticos de HML.
- **O que NÃO deve ser implementado nesta etapa:** pessoa com deficiência (E05); relatório (E07); correção (E08).
- **Arquivos e módulos prováveis:** `docs/evidencias-v2/G23/V2-F23-E03/` (a criar), `apps/campo/src/ui/Assinatura.tsx`, `apps/web/src/paginas/MapaDoGoogle.tsx`.
- **Risco de segurança:** build de HML, nunca produção.
- **Impacto LGPD:** Não se aplica: dados sintéticos.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: sem mudança de produto.
- **Rollback:** Não se aplica: sem mudança de produto.
- **Testes positivos:** cada fluxo concluído sem olhar a tela, em iOS e Android.
- **Testes negativos:** botão só com ícone, foco fora da ordem, estado não anunciado e foco preso em modal viram falha.
- **Testes de autorização e isolamento:** Não se aplica: sem rota nem dado.
- **Regressão obrigatória:** `npm run test:campo`, `npm run test:e2e`; G14, G17.
- **E2E:** o roteiro humano, em dois aparelhos físicos e no desktop.
- **Validação humana:** Rafael e Alyson conduzem.
- **Evidência a produzir:** roteiros preenchidos e gravações de tela com SHA-256.
- **Documentação a atualizar:** `apps/campo/PENDENCIAS.md`.
- **Definition of Done:** todo fluxo com resultado em iOS, Android e desktop; falhas lançadas na E08.
- **Checkpoint:** Não.

### V2-F23-E04 - Fonte 200%, zoom 400% e reflow, contraste, toque e rotação
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com F23-E03)
- **Objetivo:** medir por tela fonte a 200%, zoom de 400% e reflow em 320 px, contraste renderizado, alvo de toque e rotação.
- **Problema que resolve:** `A11-12`: fontes do painel em `px` (`apps/web/src/estilos/tokens.css:160-168`) sem teste de zoom; `A11-22`: `larguraDoRotulo` (`apps/campo/src/ui/componentes.tsx:352`) estima largura com fonte fixa.
- **Origem:** DP:T29; DP:K18; BZ-D:A11-11; BZ-D:A11-12; BZ-D:A11-22.
- **Estado atual:** CRIAR (medições); EXPANDIR os portões de F14-E10 e F17-E15.
- **Dependências de entrada:** E01; E02.
- **O que deve ser implementado:**
  - Frontend: `dc360/scripts/axe/reflow.mjs` (a criar), por tela em 320x256: sem rolagem horizontal nem texto cortado, com o espaçamento de texto do WCAG injetado; alvo mínimo de 24 px (WCAG 2.2) e 44 px; contraste de lateral escura, hover, disabled e placeholder.
  - Mobile: em aparelho, iOS com o maior tamanho de texto e Android com a maior fonte e exibição, com movimento reduzido ligado; alvo de 44 pt e 48 dp medido com a ferramenta de acessibilidade de cada sistema; rotação conforme o CP-38.
- **O que NÃO deve ser implementado nesta etapa:** converter fontes para `rem` (se reprovar, E08); tokens de toque do cidadão (F17-E15).
- **Arquivos e módulos prováveis:** `dc360/scripts/axe/reflow.mjs` (a criar), `apps/web/src/estilos/tokens.css`, `apps/campo/app.config.ts`.
- **Risco de segurança:** Não se aplica: medição, sem rota nem dado.
- **Impacto LGPD:** Não se aplica: HML sintético.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: só medição.
- **Rollback:** reverter os scripts.
- **Testes positivos:** a 320 px sem rolagem horizontal; a 200% o texto não corta; alvos de 44 pt e 48 dp.
- **Testes negativos:** rolagem a 320 px, texto cortado a 200%, tocável de 40 pt e placeholder abaixo de 4,5:1 reprovam.
- **Testes de autorização e isolamento:** Não se aplica: sem rota nem dado.
- **Regressão obrigatória:** `npm test --workspace @dc360/web`, `npm run test:campo`; G10, G14.
- **E2E:** runner na web; passada em aparelho no mobile.
- **Validação humana:** Rafael e Alyson na passada de fonte máxima.
- **Evidência a produzir:** `docs/evidencias-v2/G23/V2-F23-E04/` (capturas, tabela de medidas).
- **Documentação a atualizar:** `dc360/docs/DESIGN-SYSTEM.md`.
- **Definition of Done:** medidas por tela arquivadas; falhas lançadas na E08.
- **Checkpoint:** Não (a rotação segue o CP-38 da F17-E15).

### V2-F23-E05 - Teste com pessoa com deficiência (quando viável)
- **Prioridade:** P2
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** não (usa o roteiro da E03)
- **Objetivo:** sessões com pessoas com deficiência nos fluxos F e G (com vídeo e chat) e C, em en e es e com o VLibras, com consentimento e dado sintético, ou registro de não executado.
- **Problema que resolve:** `BZ-D:A11-14`, `A11-42`: nenhuma revisão por pessoa com deficiência; recrutar trata dado pessoal.
- **Origem:** DP:T29; DP:J9; BZ-D:A11-14; REL:11.
- **Estado atual:** CRIAR (protocolo e relatório).
- **Dependências de entrada:** E03; CP-32.
- **O que deve ser implementado:**
  - Domínio: `dc360/docs/TESTE-DE-ACESSIBILIDADE-COM-PESSOAS.md` (a criar): perfis mínimos propostos (leitor de tela, baixa visão, restrição motora e surdez com Libras; a validar no CP-32), tarefas e roteiro que não induz.
  - Domínio: termo de consentimento escrito (finalidade, gravação opcional, desistência, prazo de eliminação); participante por código, sem nome, contato nem dado de saúde no repositório.
  - Arquivos: achados por código, lançados na E08; sem recrutamento, `nao-executado.md` com o motivo.
- **O que NÃO deve ser implementado nesta etapa:** recrutar antes do CP-32; dado pessoal do participante no repositório; declarar conformidade (E07).
- **Arquivos e módulos prováveis:** `dc360/docs/TESTE-DE-ACESSIBILIDADE-COM-PESSOAS.md` (a criar).
- **Risco de segurança:** termo e gravações ficam fora do repositório.
- **Impacto LGPD:** alto: deficiência é dado pessoal sensível (Lei 13.709/2018); consentimento específico, código no lugar do nome, prazo de eliminação, encarregado informado.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: sem mudança de produto.
- **Rollback:** Não se aplica: eliminar as gravações encerra o tratamento.
- **Testes positivos:** o participante conclui a tarefa principal ou a falha vira achado.
- **Testes negativos:** sessão sem termo assinado não ocorre; evidência com nome ou contato reprova a varredura antes do commit.
- **Testes de autorização e isolamento:** Não se aplica: sem rota nem dado de município.
- **Regressão obrigatória:** `npm run test:scripts`; G17.
- **E2E:** humano, por tarefa.
- **Validação humana:** Alyson recruta; Rafael e quem responde pela privacidade revisam o termo.
- **Evidência a produzir:** protocolo, modelo do termo e relatório anonimizado.
- **Documentação a atualizar:** `dc360/docs/PRIVACIDADE.md`.
- **Definition of Done:** sessões feitas e achados lançados, ou decisão de não executar registrada.
- **Checkpoint:** CP-32 (decide recrutamento e aprovador do termo; sem ele a declaração de conformidade fica bloqueada).

### V2-F23-E06 - PDF oficial tagged validado
- **Prioridade:** P2
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com F23-E01 a E05)
- **Objetivo:** validar que o PDF do laudo e do ofício (modelo versão 2) tem estrutura marcada, idioma, título, ordem de leitura e texto alternativo.
- **Problema que resolve:** `apps/api/src/documentos/pdf.ts:103` não passa `tagged` até a F09-E15 e nenhuma ferramenta leu o PDF entregue a cidadão, órgão e processo (BZ-D:A11-36).
- **Origem:** DP:K21; DP:T29; BZ-D:A11-36.
- **Estado atual:** CRIAR (a validação); MANTER a geração marcada da F09-E15.
- **Dependências de entrada:** F09-E15; CP-15.
- **O que deve ser implementado:**
  - Arquivos: `dc360/scripts/validar-pdf-acessivel.mjs` (a criar) gera laudo e ofício sintéticos, confere nos bytes `/MarkInfo`, `/StructTreeRoot`, `/Lang` e título, e roda veraPDF (perfil PDF/UA-1, versão fixa).
  - Acessibilidade: leitura com NVDA e PAC: ordem igual à visual, foto com texto alternativo, tabela com cabeçalhos; falha bloqueante (sem estrutura, ordem trocada, foto sem alternativa) ou residual (erro de perfil conhecido, listado).
  - Domínio: só LÊ (D-05): emitido antes da versão 2 não é regerado e consta como não marcado.
- **O que NÃO deve ser implementado nesta etapa:** regerar emitido; HTML paralelo; declarar o documento acessível (CP-15, J9).
- **Arquivos e módulos prováveis:** `dc360/scripts/validar-pdf-acessivel.mjs` (a criar), `apps/api/src/documentos/pdf.ts`, `apps/api/src/oficios/documento.ts`.
- **Risco de segurança:** só dados sintéticos; o script não escreve no banco nem no armazenamento.
- **Impacto LGPD:** Não se aplica: documentos sintéticos.
- **Migração necessária:** Não.
- **Compatibilidade:** só leitura do PDF.
- **Rollback:** Não se aplica: validação.
- **Testes positivos:** laudo e ofício v2 trazem estrutura, `pt-BR` e título; o leitor lê a tabela na ordem.
- **Testes negativos:** PDF com `tagged: false` e foto sem `alt` reprovam; PDF da versão 1 sai como não marcado, sem erro.
- **Testes de autorização e isolamento:** Não se aplica: sem rota nem dado de município.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:scripts`; G09.
- **E2E:** gerar o laudo em HML e validar o arquivo baixado.
- **Validação humana:** Rafael lê o PDF com leitor de tela.
- **Evidência a produzir:** `docs/evidencias-v2/G23/V2-F23-E06/` (saída do verificador, SHA-256).
- **Documentação a atualizar:** `README.md` (documentos).
- **Definition of Done:** resultado arquivado; "declarado acessível" segue atrás do CP-15.
- **Checkpoint:** CP-15 (decide marcar e validar; bloqueia declarar o documento acessível).

### V2-F23-E07 - Relatório de conformidade e eMAG como lista de verificação
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (consolida E03 e E04)
- **Objetivo:** relatório técnico por superfície e critério WCAG 2.2 AA e lista de verificação eMAG, sem declarar conformidade jurídica.
- **Problema que resolve:** sem relatório, ALY:RNF-09 é afirmação sem prova; LBI e eMAG só aparecem em `docs/CONTEXTO.md` e no levantamento (BZ-D:A11-37).
- **Origem:** DP:J9; DP:T29; BZ-D:A11-37; ALY:RNF-09.
- **Estado atual:** CRIAR (relatório e lista).
- **Dependências de entrada:** E03; E04; E09 a E13; CP-32.
- **O que deve ser implementado:**
  - Arquivos: `dc360/docs/RELATORIO-DE-ACESSIBILIDADE.md` (a criar): por superfície (painel, portal, console, apps, PDF), linha por critério WCAG 2.2 A e AA com método, resultado (atende, ressalva, não atende, não se aplica com motivo) e evidência; mapa 2.1 para 2.2; linhas de PWA, VLibras, idiomas, tema e módulos novos; "Limites" (vídeo do cidadão sem legenda).
  - Arquivos: `dc360/docs/EMAG-LISTA-DE-VERIFICACAO.md` (a criar): o executor transcreve as recomendações da versão vigente do eMAG (registra versão e data, sem numeração de memória) e marca: coberta, a verificar à mão ou sem correspondência.
  - Testes: `scripts/relatorio-de-acessibilidade.test.mjs` (a criar): toda linha "atende" cita evidência existente; a seção "Limites" existe.
- **O que NÃO deve ser implementado nesta etapa:** declaração de conformidade, parecer sobre LBI ou eMAG, selo (J9, CP-32, F28-E04); correção (E08).
- **Arquivos e módulos prováveis:** as duas docs (a criar em `dc360/docs/`) e `scripts/relatorio-de-acessibilidade.test.mjs` (a criar em `dc360/scripts/`).
- **Risco de segurança:** relatório que afirma mais do que provou expõe o município.
- **Impacto LGPD:** Não se aplica: sem dado pessoal; achados da E05 só anonimizados.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: documento.
- **Rollback:** reverter os documentos.
- **Testes positivos:** toda linha "atende" aponta evidência existente.
- **Testes negativos:** linha "atende" sem evidência e relatório sem "Limites" reprovam.
- **Testes de autorização e isolamento:** Não se aplica: documento.
- **Regressão obrigatória:** `npm run test:scripts`, `npm test`; G08.
- **E2E:** Não se aplica: documento.
- **Validação humana:** Alyson e Rafael leem; o jurídico recebe o relatório (J9).
- **Evidência a produzir:** relatório e lista eMAG com SHA-256.
- **Documentação a atualizar:** `dc360/docs/DECLARACAO-NAS-LOJAS.md` (acessibilidade em branco até o CP-32).
- **Definition of Done:** documentos arquivados, nenhuma declaração publicada, parecer J9 pendente listado.
- **Checkpoint:** CP-32 (aplicabilidade legal; bloqueia declarar conformidade).

### V2-F23-E08 - Correções das falhas encontradas
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (depende de E03, E04 e E05)
- **Objetivo:** zerar `serious`, `critical` e toda falha que bloqueia a tarefa principal de um fluxo; o resto com dono e data.
- **Problema que resolve:** E01 a E06 só medem; achados sem dono: console sem Alto Contraste (`apps/console/src/pagina.ts:1449`) e erro em `role="status"` sem `aria-invalid` (A11-31, A11-32); 8 tabelas do painel sem `caption` (A11-09).
- **Origem:** DP:T29; BZ-D:A11-09; BZ-D:A11-31; BZ-D:A11-32.
- **Estado atual:** CORRIGIR (superfícies existentes).
- **Dependências de entrada:** E03; E04; E05; E09 a E13.
- **O que deve ser implementado:**
  - Arquivos: `docs/evidencias-v2/G23/achados.md` (a criar): ID `A11-V2-nn`, superfície, critério WCAG, severidade (bloqueia a tarefa, atrapalha, cosmético), dono, data ISO.
  - Frontend: console com `@media (forced-colors: active)` no anel de foco, `aria-invalid` e `aria-describedby` por campo, erro em `role="alert"` e atalho de pular (paga as exceções da F08-E06); painel com `<caption>` nas tabelas e lista alternativa ao mapa do Google.
  - Mobile: o que a E03 e a E04 apontaram em rótulo, foco e escala de fonte; só o que bloqueia fecha aqui (política T42).
- **O que NÃO deve ser implementado nesta etapa:** funcionalidade nova; alternativa à assinatura por traço (A11-27, decisão de produto: PROPOSTA); declarar conformidade (CP-32).
- **Arquivos e módulos prováveis:** `apps/console/src/pagina.ts`, `apps/web/src/paginas/*.tsx`, `apps/campo/src/ui/componentes.tsx`.
- **Risco de segurança:** `aria-live` nunca recebe dado pessoal de terceiro.
- **Impacto LGPD:** Não se aplica: sem dado novo.
- **Migração necessária:** Não.
- **Compatibilidade:** só interface.
- **Rollback:** reverter por superfície.
- **Testes positivos:** axe com zero `serious` e `critical`; contagem dos portões inalterada.
- **Testes negativos:** PR de prova sem `forced-colors` no console, `<table>` sem `caption` e exceção vencida reprovam.
- **Testes de autorização e isolamento:** Não se aplica: sem rota nova.
- **Regressão obrigatória:** `npm test`, `npm run test:console`, `npm run test:campo`, `npm run test:e2e`; G08, G10, G14.
- **E2E:** runner da E01 e repetição dos passos humanos que falharam.
- **Validação humana:** Rafael repete os passos que falharam.
- **Evidência a produzir:** `docs/evidencias-v2/G23/V2-F23-E08/` (achados antes e depois).
- **Documentação a atualizar:** `dc360/docs/RELATORIO-DE-ACESSIBILIDADE.md`.
- **Definition of Done:** zero `serious`, `critical` e falha que bloqueia tarefa; restante com dono e data.
- **Checkpoint:** Não.

### V2-F23-E09 - PWA do painel e do portal: instalação acessível, sem offline
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com F23-E10 a E12)
- **Objetivo:** provar que painel e portal instalados (D-22) seguem acessíveis e sem dado de município em cache.
- **Problema que resolve:** o PWA (F10-E15, F11-E26) traz botão de instalar e service worker; nenhum portão vê o modo instalado nem garante que `/v1` não fique em disco.
- **Origem:** PR:D-22; DP:T29; BZ-D:A11-13.
- **Estado atual:** CRIAR (a prova); MANTER `apps/web/public/manifest.webmanifest` e os service workers das F10-E15 e F11-E26.
- **Dependências de entrada:** E01; F10-E15; F11-E26.
- **O que deve ser implementado:**
  - Frontend: `dc360/scripts/axe/pwa.mjs` (a criar): Playwright abre painel e portal em `display-mode: standalone`, roda o axe da E01 e confere que "Instalar o painel" e "Instalar o portal" têm nome, foco visível e teclado, e que o manifesto traz `lang` e `short_name`.
  - Offline: sem rede, a tela diz "Sem conexão. Esta tela precisa de internet." em `role="status"`; `caches.keys()` e IndexedDB sem resposta de `/v1`.
  - Mobile: ícone e nome legíveis no Android e no iPhone físicos. O app do cidadão NÃO é PWA.
- **O que NÃO deve ser implementado nesta etapa:** cache offline, fila offline e push web (fora, D-22); correção (E08).
- **Arquivos e módulos prováveis:** `dc360/scripts/axe/pwa.mjs` (a criar em `dc360/scripts/`), `apps/web/public/manifest.webmanifest`, `apps/web/src/main.tsx`.
- **Risco de segurança:** service worker que guarda resposta autenticada entrega dado de A a quem usa o aparelho depois.
- **Impacto LGPD:** Não se aplica: dado sintético; a prova é nada de município no aparelho.
- **Migração necessária:** Não.
- **Compatibilidade:** só CI.
- **Rollback:** remover o script do job.
- **Testes positivos:** instalado, zero `serious` e `critical`; instalar por teclado.
- **Testes negativos:** `sw.js` que guarda `GET /v1/ocorrencias` reprova; offline sem aviso reprova; manifesto sem `lang` reprova.
- **Testes de autorização e isolamento:** depois de sair, o usuário B no mesmo aparelho não vê dado de A (cache, `sessionStorage`, IndexedDB).
- **Regressão obrigatória:** `npm test --workspace @dc360/web`, `npm run test:scripts`, `npm run test:e2e`; G10, G11.
- **E2E:** o runner contra o HML.
- **Validação humana:** Rafael instala nos dois aparelhos.
- **Evidência a produzir:** `docs/evidencias-v2/G23/V2-F23-E09/` (capturas, saída).
- **Documentação a atualizar:** `dc360/README.md`.
- **Definition of Done:** PWA no runner, nada guardado, falhas na E08.
- **Checkpoint:** Não.

### V2-F23-E10 - VLibras: acessível, só por clique e fora das telas com dado pessoal
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com F23-E09, E11 e E12)
- **Objetivo:** provar que o VLibras (F08-E12, ligado na F35-E12) é operável por teclado e leitor de tela, não prende o foco nem cobre ação e só carrega no clique.
- **Problema que resolve:** o widget do governo injeta DOM e foco e lê o texto da página (D-12).
- **Origem:** PR:D-12; DP:K20; DP:T29.
- **Estado atual:** CRIAR (a prova); MANTER o ponto de integração da F08-E12.
- **Dependências de entrada:** E01; E04; G35; CP-45 para produção.
- **O que deve ser implementado:**
  - Frontend: `dc360/scripts/axe/libras.mjs` (a criar): axe nos quatro contextos com o widget ligado; tab atravessa "Ativar tradução em Libras" sem armadilha; Esc fecha; o leitor anuncia o estado; a 320 px o widget não cobre ação nem o campo do TOTP.
  - Frontend: telas SEM o botão (login, MFA, detalhe de ocorrência, relato, chat) conferidas no DOM.
  - Mobile: `Libras.tsx` do app com "indisponível sem conexão" lido por VoiceOver e TalkBack.
- **O que NÃO deve ser implementado nesta etapa:** Libras em vídeo (fora, D-12); ativar em produção sem o CP (F35-E12); correção (E08).
- **Arquivos e módulos prováveis:** `dc360/scripts/axe/libras.mjs` (a criar em `dc360/scripts/`), `apps/web/src/componentes/Libras.tsx` (criado na F08-E12).
- **Risco de segurança:** script de terceiro em página com sessão: só por clique, CSP restrita.
- **Impacto LGPD:** o texto da tela sai ao serviço do governo (F28-E08): nunca em tela com dado pessoal.
- **Migração necessária:** Não.
- **Compatibilidade:** desligado por padrão.
- **Rollback:** desligar `VLIBRAS_ATIVO` (F35-E12).
- **Testes positivos:** com o widget, zero `serious` e `critical`; o teclado abre e fecha.
- **Testes negativos:** sem clique, zero requisição ao domínio do VLibras; botão no login reprova; foco preso reprova.
- **Testes de autorização e isolamento:** sem botão em `/ocorrencias/:id` nem na caixa de encaminhamentos do portal.
- **Regressão obrigatória:** `npm test --workspace @dc360/web`, `npm run test:scripts`, `npm run test:e2e`; G08, G35.
- **E2E:** o runner contra o HML.
- **Validação humana:** usuário de Libras, se houver (E05); Rafael.
- **Evidência a produzir:** `docs/evidencias-v2/G23/V2-F23-E10/` (saída, capturas).
- **Documentação a atualizar:** `dc360/docs/RELATORIO-DE-ACESSIBILIDADE.md` (E07).
- **Definition of Done:** widget acessível e ausente das telas com dado pessoal.
- **Checkpoint:** CP-45 (bloqueia ativar em produção).

### V2-F23-E11 - Idiomas pt-BR, en e es: lang, leitor na voz certa e texto longo sem corte
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com F23-E09, E10 e E12)
- **Objetivo:** provar que a troca de idioma (F35-E09) mantém a acessibilidade: `lang` correto, troca anunciada, leitor na voz do idioma e tela sem corte.
- **Problema que resolve:** com `lang` fixo em `pt-BR` o leitor lê inglês com voz brasileira, e a tradução alarga botão e quebra 320 px (D-12).
- **Origem:** PR:D-12; DP:K20; DP:T29; BZ-D:A11-12.
- **Estado atual:** CRIAR (a prova); MANTER `packages/i18n` e a completude do catálogo (F08-E08).
- **Dependências de entrada:** E01; E04; G35; CP-73 para o texto "revisado".
- **O que deve ser implementado:**
  - Frontend: `dc360/scripts/axe/idiomas.mjs` (a criar): toda tela de `rotas-axe.json` nos três idiomas: `<html lang>` igual ao escolhido; trecho em outro idioma (termo COBRADE, nome de órgão) com `lang` próprio; troca anunciada em `role="status"` com foco preservado; axe e reflow a 320 px sem corte.
  - Mobile: com o aparelho em en e em es, VoiceOver e TalkBack leem rótulo e erro na voz do idioma; fonte a 200%.
- **O que NÃO deve ser implementado nesta etapa:** traduzir texto ou idioma por usuário (F35-E09, E11); revisar tradução (CP); correção (E08).
- **Arquivos e módulos prováveis:** `dc360/scripts/axe/idiomas.mjs` (a criar em `dc360/scripts/`), `dc360/packages/i18n/` (criado na F08-E08).
- **Risco de segurança:** texto de catálogo nunca vira HTML.
- **Impacto LGPD:** Não se aplica: dado sintético.
- **Migração necessária:** Não.
- **Compatibilidade:** só CI.
- **Rollback:** remover o script do job.
- **Testes positivos:** nos três idiomas, zero `serious` e `critical` e `lang` certo em toda tela; `pendentes.json` vazio.
- **Testes negativos:** `lang="pt-BR"` com a tela em en reprova; botão cortado em es a 320 px reprova; troca sem anúncio reprova.
- **Testes de autorização e isolamento:** recurso de outro município: 404 no idioma escolhido, sem dado do outro.
- **Regressão obrigatória:** `npm test --workspace @dc360/web`, `npm run test:campo`, `npm run test:scripts`; G08, G35.
- **E2E:** o runner contra o HML, três idiomas.
- **Validação humana:** falante nativo de en e de es lê duas telas; Rafael, o leitor.
- **Evidência a produzir:** `docs/evidencias-v2/G23/V2-F23-E11/` (capturas, saída).
- **Documentação a atualizar:** `dc360/docs/RELATORIO-DE-ACESSIBILIDADE.md` (E07).
- **Definition of Done:** três idiomas varridos; falhas na E08.
- **Checkpoint:** CP-73 (bloqueia chamar o texto de revisado).

### V2-F23-E12 - Tema por município: contraste AA renderizado nos dois modos e no Alto Contraste
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com F23-E09 a E11)
- **Objetivo:** provar nas telas renderizadas que a cor e o logotipo do município (D-11) mantêm AA, foco visível e estado nunca só por cor.
- **Problema que resolve:** a F08-E10 prova a função pura; hover, `disabled`, placeholder, selo, foco e logotipo (sem `alt`) só aparecem na tela.
- **Origem:** PR:D-11; DP:K19; DP:T29.
- **Estado atual:** CRIAR (a prova); MANTER `derivarTemaDoMunicipio` (F08-E10).
- **Dependências de entrada:** E01; E04; G35.
- **O que deve ser implementado:**
  - Frontend: `dc360/scripts/axe/tema.mjs` (a criar): cinco municípios sintéticos (violeta DC360, dois limites aceitos, dois de semente fixa) em claro, escuro e `forcedColors`: `color-contrast` por tela, foco a 3:1, selo de severidade com ícone e texto; logotipo com `alt` igual ao nome do município.
  - Mobile: apps do campo e do cidadão com a cor do município: botão a 4,5:1 e foco a 3:1 medidos no aparelho.
  - API: cor recusada pela função (`#FFFF00`) devolve 422 e nunca chega à tela.
- **O que NÃO deve ser implementado nesta etapa:** segunda cor, tema por secretaria ou editável (fora, D-11); mudar a derivação (F08-E10); correção (E08).
- **Arquivos e módulos prováveis:** `dc360/scripts/axe/tema.mjs` (a criar em `dc360/scripts/`), `dc360/packages/design-tokens/src/municipio.ts` (criado na F08-E10).
- **Risco de segurança:** a cor vira CSS: só o formato fechado da F08-E10 chega à página.
- **Impacto LGPD:** Não se aplica: cor e logotipo institucionais.
- **Migração necessária:** Não.
- **Compatibilidade:** sem tema vale o violeta DC360.
- **Rollback:** remover o script do job.
- **Testes positivos:** os cinco temas passam em toda tela e modo; foco visível no Alto Contraste.
- **Testes negativos:** cor boa só no claro reprova; logotipo sem `alt` reprova; selo só por cor reprova.
- **Testes de autorização e isolamento:** administrador de A altera a cor do B: 404; a tela de A nunca mostra logotipo de B.
- **Regressão obrigatória:** `npm test --workspace @dc360/web`, `npm run conferir:tokens`, `npm run test:campo`; G08, G35.
- **E2E:** o runner contra o HML, cinco municípios.
- **Validação humana:** Rafael vê as capturas.
- **Evidência a produzir:** `docs/evidencias-v2/G23/V2-F23-E12/` (capturas, medidas).
- **Documentação a atualizar:** `dc360/docs/DESIGN-SYSTEM.md`.
- **Definition of Done:** cinco temas sem violação; falhas na E08.
- **Checkpoint:** Não.

### V2-F23-E13 - Módulos novos no portão: incidentes, abrigos, logística, canal ampliado (vídeo e chat)
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** não (usa E01, E03 e E04)
- **Objetivo:** estender runner, roteiros e medidas aos módulos das fases F29 a F35, nas cinco superfícies.
- **Problema que resolve:** tela fora de `rotas-axe.json` não é varrida, e vídeo, chat, tabela de estoque e mapa com camadas trazem problemas próprios.
- **Origem:** PR:D-15; PR:D-07; PR:D-14; DP:T29.
- **Estado atual:** EXPANDIR (E01, E03 e E04 ficam).
- **Dependências de entrada:** E01; E03; E04; G29 a G35.
- **O que deve ser implementado:**
  - Frontend: `rotas-axe.json` e `axe-cobertura.test.mjs` (E01) exigem toda rota das fases F29 a F35, com vazio, erro e modal; tabelas de abrigo e estoque com `<caption>`; camadas do mapa por teclado, com lista alternativa.
  - Chat: nova mensagem em `role="log"` (polite) sem roubar o foco; campo com rótulo; erro em `role="alert"`.
  - Vídeo: player com controles rotulados, sem autoplay, descrição escrita do relato ao lado; legenda é limite registrado na E07.
  - Mobile: gravar e enviar vídeo, abrigos e logística no app do agente (offline) com VoiceOver e TalkBack, fonte 200% e alvo de 48 dp.
- **O que NÃO deve ser implementado nesta etapa:** tela ou módulo (F29 a F35); legendar vídeo do cidadão; correção (E08).
- **Arquivos e módulos prováveis:** `dc360/scripts/axe/rotas-axe.json` e `dc360/scripts/axe-cobertura.test.mjs` (criados na E01).
- **Risco de segurança:** `aria-live` do chat só recebe a mensagem.
- **Impacto LGPD:** Não se aplica: dado sintético.
- **Migração necessária:** Não.
- **Compatibilidade:** só CI.
- **Rollback:** reverter a lista.
- **Testes positivos:** zero `serious` e `critical` nos módulos novos; relato com vídeo e chat concluído com o leitor.
- **Testes negativos:** rota fora da lista, mensagem sem anúncio, player sem rótulo e tabela sem `caption` reprovam.
- **Testes de autorização e isolamento:** capturas de A sem estoque, abrigo ou vídeo de B; cidadão A não vê o chat do relato do B.
- **Regressão obrigatória:** `npm test --workspace @dc360/web`, `npm run test:campo`, `npm run test:scripts`; G29 a G35.
- **E2E:** o runner e o roteiro nos aparelhos.
- **Validação humana:** Rafael conduz o roteiro.
- **Evidência a produzir:** `docs/evidencias-v2/G23/V2-F23-E13/` (roteiros, saída).
- **Documentação a atualizar:** `dc360/docs/RELATORIO-DE-ACESSIBILIDADE.md` (E07).
- **Definition of Done:** toda rota nova varrida e roteiros feitos; falhas na E08.
- **Checkpoint:** Não.

# GATE G23 - ACESSIBILIDADE VALIDADA

Só passa se:
- [ ] V2-F23-E01: job `acessibilidade` obrigatório no ruleset, com zero `critical` e `serious` em toda tela do painel, do portal e do console, nos quatro contextos (claro, escuro, Alto Contraste, 320 px); toda rota de `App.tsx` e do portal na lista; exceções com dono e vencimento. Evidência: relatório do runner e PR de prova reprovado em `docs/evidencias-v2/G23/V2-F23-E01/`.
- [ ] V2-F23-E02: lint de React Native verde no CI em `apps/campo` e `apps/cidadao`, com baseline de dono e data e as regras provadas por fixture. Evidência: E02.
- [ ] V2-F23-E03: todos os fluxos dos dois apps percorridos com VoiceOver em iPhone FÍSICO e TalkBack em Android FÍSICO, e os da web com NVDA, com resultado por passo; emulador e simulador não substituem. Evidência: roteiros preenchidos e gravações com SHA-256.
- [ ] V2-F23-E04: fonte a 200%, reflow em 320 px, zoom de 400%, contraste renderizado, alvo de 44 pt e 48 dp e rotação (conforme CP-38) medidos por tela. Evidência: tabela de medidas e capturas.
- [ ] V2-F23-E05 (P2): teste com pessoa com deficiência feito com termo e dado sintético, ou "não executado" registrado com o motivo; CP-32 decidido ou adiado com a declaração de conformidade bloqueada. Evidência: relatório anonimizado ou `nao-executado.md`.
- [ ] V2-F23-E06 (P2) e CP-15: PDF do laudo e do ofício (versão 2) com estrutura marcada, validado por verificador e por leitor de tela, ou adiado com "documento declarado acessível" bloqueado; emitidos antigos listados como não marcados. Evidência: saída do verificador e SHA-256.
- [ ] V2-F23-E07: relatório de acessibilidade e lista eMAG arquivados, com seção de limites e sem declaração de conformidade; parecer J9 pendente listado. Evidência: documentos com hash.
- [ ] V2-F23-E08: zero `serious`, zero `critical` e zero falha que bloqueia a tarefa principal de um fluxo; o restante com dono e data ISO. Evidência: `achados.md` antes e depois.
- [ ] V2-F23-E09: painel e portal instalados varridos (axe e teclado) e sem resposta de `/v1` em cache nem IndexedDB; aviso de falta de rede; usuário B no mesmo aparelho não vê dado de A. Evidência: capturas do modo instalado e saída do runner.
- [ ] V2-F23-E10: VLibras operável por teclado e leitor de tela, sem requisição antes do clique, ausente do login, do MFA e das telas com dado pessoal; ativação em produção atrás do CP-45. Evidência: saída e capturas.
- [ ] V2-F23-E11: pt-BR, en e es varridos em toda tela, com `lang` correto, troca anunciada, leitor na voz do idioma em aparelho físico e zero corte a 320 px; `pendentes.json` vazio. Evidência: capturas por idioma e saída.
- [ ] V2-F23-E12: cinco temas de município (violeta DC360, dois limites aceitos, dois de semente fixa) com AA em toda tela nos dois modos e no Alto Contraste, logotipo com `alt` e cor recusada nunca renderizada. Evidência: capturas e medidas.
- [ ] V2-F23-E13: toda rota das fases F29 a F35 em `rotas-axe.json` e varrida; chat anunciado, player de vídeo rotulado, tabelas com `caption`, roteiro de leitor de tela nos módulos novos em aparelho físico. Evidência: roteiros e saída.
- [ ] Os portões estáticos seguem verdes e com a mesma contagem: `npm test --workspace @dc360/web`, `npm run test:scripts`, `npm run test:campo`, `npm run test:console` e `npm run conferir:numeros`.
- [ ] nenhuma regressão: gates G00 a G22 e G29 a G35 continuam verdes (se um quebrar, ESTE gate volta a REPROVADO).
- [ ] documentação atualizada e evidências arquivadas em `docs/evidencias-v2/G23/`.

**Reabre se:** tela nova (inclusive de módulo novo, idioma ou tema de município) sem entrada em `rotas-axe.json`; PWA com cache de dado; VLibras ativado em tela com dado pessoal; `serious` ou `critical` novo no CI; build de app liberado sem repetir a passada de leitor de tela; PDF oficial novo sem marcação; qualquer documento ou ficha de loja que declare conformidade antes do parecer J9 (CP-32).
**Este Gate libera:** F24, F25 e F26 (rodam sobre superfícies validadas, inclusive módulos novos, idiomas e tema por município) e a consolidação de acessibilidade da F28-E04. NÃO libera declarar conformidade nem preencher a declaração de acessibilidade das lojas: isso fica atrás do CP-32.

# Fase 25: Segurança pré-piloto

**Gate da fase:** G25 SEGURANÇA PRÉ-PILOTO | **Depende dos gates:** G24 (cumulativo na ordem de execução de `STATUS.md`: G00 a G24 e G29 a G35; os módulos novos já existem) | **Superfícies tocadas:** `apps/api` (modos `api` e `publica`), `db`, `apps/web`, `apps/portal`, `apps/console`, `apps/campo`, `apps/cidadao`, HML (Fly, Supabase, bucket), CI | **Checkpoints da fase:** CP-33, CP-30, CP-49, CP-46, CP-41, CP-47, CP-60, CP-74, CP-43

Segurança provada ANTES do piloto e de qualquer cidadão real: varredura completa (SAST, SCA, segredos), revisão manual de autenticação, matriz de autorização varrida, os três cruzamentos (tenant A x B, órgão Obras x Saúde, cidadão "só o meu"), IDOR, arquivos hostis, abuso, DAST, fuzz e, por fim, PENTEST EXTERNO com remediação e re-teste. As decisões de 2026-10-01 acrescentam: pessoa global e login em dois passos (E14), suporte assistido (E15), provedor de assinatura e integrações (E16), CPF (E17), vídeo e chat (E18), tracing e SLO (E19), varredura de IDOR nos módulos novos (E20) e a rotina recorrente de pentest, SBOM e licenças (E21). Régua: OWASP ASVS 4.0 nível 2 (alvo) e CIS Controls v8 IG1 (piso), do CLAUDE.md, citadas por capítulo e por salvaguarda, sem numerar requisito de memória; no mobile, OWASP MASVS e MASTG (levantamento).

Ambiente: HML com dado sintético (F01-E11), nunca produção nem dado real; ferramenta ativa (ZAP, fuzz, arquivo hostil, rajada) só em HML ou em processo local. Política de achados, válida em toda etapa: crítico e alto reprovam o gate e se corrigem antes do pentest; médio se corrige ou se aceita por escrito (dono, motivo, vencimento ISO); baixo se registra. O registro único é `docs/evidencias-v2/G25/achados.md` (criado na E01, IDs `SEG-nn`); achado real vira correção em PR, e o que exige mudar modelo vira PROPOSTA ao coordenador.

PRESERVA (MANTER): RLS forçada, `dc360_app` nas APIs de servidor, `exigirPermissao`, 404 para recurso alheio, trilha append-only. NÃO FAZ: certificação ISO 27001, bug bounty e anti-abuso além da base (CP-27). SBOM, licenças e scan de contêiner (D-19) e o pentest recorrente ENTRAM (F01-E19, F01-E20, E21).

Ordem sugerida: E01, E02 e E03 abrem; E04 a E07 e E14 a E19 em paralelo depois da E03 (arquivos de teste disjuntos); E08 exige o HML com worker (G07); E09 exige a API pública em HML (G15); E10 com portal e API pública no ar; E11 pode andar junto; E20 depois de E03 a E07; E12 só depois de E01 a E11 e E14 a E20 verdes (o pentest exige sistema estável); E13 depois da E12; E21 por último. O G25 NÃO libera sozinho a abertura pública do App do Cidadão: também exige CP-11, CP-26 e CP-28 (e CP-46 para CPF real).

## Etapas

### V2-F25-E01 - SAST, SCA e segredos: varredura completa e tratamento
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com F25-E02)
- **Objetivo:** varredura completa de código, dependências e histórico, no CI, com tratamento de cada achado e registro único de achados.
- **Problema que resolve:** F01-E04 a E06 instalam as ferramentas por PR, com baseline; falta a passada total sobre o produto final; `scripts/auditar.mjs` já ficou cego ao app de campo (fora do workspace) e `apps/cidadao` repete o risco (BZ-D:OPS-65).
- **Origem:** DP:T34; PR:D-19; BZ-D:OPS-65; BZ-D:OPS-68; REL:10 1.3.
- **Estado atual:** EXPANDIR (ferramentas de F01-E04 a E06, E19 e E20 mantidas).
- **Dependências de entrada:** G01; G19.
- **O que deve ser implementado:**
  - Infraestrutura: Semgrep CE em `dc360/` inteiro SEM baseline (achado corrigido ou `nosemgrep` com motivo, dono e vencimento), com regra nova para `cidadaoId` e `organizacaoId` lidos da requisição em `apps/api/src/cidadao/`; gitleaks no histórico completo, e segredo verdadeiro se rotaciona (`scripts/rotacionar-segredo.mjs`).
  - Infraestrutura: `npm run auditar` na raiz, em `apps/campo` e em `apps/cidadao` (ajustar `scripts/auditar.mjs`); SBOM e licenças (F01-E19, lista do CP-43) e Trivy (F01-E20) reexecutados no produto final.
  - Arquivos: `docs/evidencias-v2/G25/achados.md` (a criar): `SEG-nn`, origem, severidade, estado, dono, vencimento ISO.
- **O que NÃO deve ser implementado nesta etapa:** DAST (E10); pentest (E12); CodeQL.
- **Arquivos e módulos prováveis:** `.semgrep/regras/`, `.gitleaks.toml`, `dc360/scripts/auditar.mjs`, `docs/evidencias-v2/G25/achados.md` (a criar).
- **Risco de segurança:** segredo no histórico se rotaciona, não só se apaga.
- **Impacto LGPD:** Não se aplica: sem dado pessoal.
- **Migração necessária:** Não.
- **Compatibilidade:** só ferramenta.
- **Rollback:** reverter o PR da correção.
- **Testes positivos:** Semgrep sem ERROR e sem baseline; gitleaks limpo; `auditar` zerado nos três lockfiles.
- **Testes negativos:** PR de prova com `organizacaoId` de `request.body`, token sintético de provedor e advisory de runtime em `apps/cidadao` reprovam.
- **Testes de autorização e isolamento:** a regra estática cobre `organizacaoId` vindo do token; a prova dinâmica é E04 e E06.
- **Regressão obrigatória:** `npm run test:scripts`, `npm run auditar`, `npm run verificar`; G01.
- **E2E:** Não se aplica: varredura estática.
- **Validação humana:** Rafael lê a triagem.
- **Evidência a produzir:** `docs/evidencias-v2/G25/V2-F25-E01/` (relatórios redigidos, SBOM).
- **Documentação a atualizar:** `dc360/docs/DEPENDENCIAS.md`.
- **Definition of Done:** zero ERROR, segredo e advisory de runtime abertos; cada achado real vira `SEG-nn` com PR de correção; baseline zerada.
- **Checkpoint:** Não.

### V2-F25-E02 - Revisão manual de autenticação, sessão e MFA
- **Prioridade:** P0
- **Tamanho:** L  |  **Complexidade:** crítica  |  **Risco:** alto  |  **Paralelizável:** sim (com F25-E01)
- **Objetivo:** revisão manual, linha a linha e por tentativa de ataque, de token, sessão, senha, MFA, recuperação e login por código do cidadão.
- **Problema que resolve:** ferramenta não acha falha de lógica de sessão; achados da auditoria: sessão deslizante sem teto absoluto (`renovar`, `apps/api/src/auth/servico.ts:478`), senha sem checagem de vazamento (`packages/shared/src/schemas.ts:961`), token do painel em `sessionStorage` (`apps/web/src/dados/http.ts:40-50`) e `vercel.json` sem CSP (REL:06 13.2).
- **Origem:** DP:T09; DP:T18; REL:06 13.2.
- **Estado atual:** CRIAR (a revisão); MANTER scrypt, JWT, refresh rotativo e TOTP (ADR 0004).
- **Dependências de entrada:** G15.
- **O que deve ser implementado:**
  - Domínio: revisor que não escreveu o código (segunda pessoa do CP-07; sem ela, o pentest cobre); `revisao.md` por arquivo de `apps/api/src/auth/`, `apps/console/src/` e `apps/api/src/cidadao/`, com capítulo do ASVS 4.0, veredito e `SEG-nn`.
  - Testes: `apps/api/test/revisao-de-autenticacao.test.ts` (a criar): `alg: none`, `aud` errada, `sid` revogado, refresh reusado e renovação simultânea, TOTP reusado, força bruta de TOTP e de OTP.
  - Domínio: teto de sessão, senha vazada e CSP do painel e do portal viram decisão registrada.
- **O que NÃO deve ser implementado nesta etapa:** reescrever autenticação (Argon2id é proposta); WebAuthn (fora do alvo de T03).
- **Arquivos e módulos prováveis:** `apps/api/src/auth/`, `apps/api/test/revisao-de-autenticacao.test.ts` (a criar), `vercel.json`.
- **Risco de segurança:** acesso sem segundo fator ou refresh reusado aceito é crítico.
- **Impacto LGPD:** Não se aplica: contas sintéticas.
- **Migração necessária:** Não.
- **Compatibilidade:** só HML.
- **Rollback:** reverter cada PR de correção.
- **Testes positivos:** sessão legítima renova; cada ataque é recusado.
- **Testes negativos:** `alg: none`: 401; TOTP repetido: 401; refresh reusado derruba a família; duas renovações simultâneas deixam uma sessão viva.
- **Testes de autorização e isolamento:** token `dc360-cidadao` em `GET /v1/ocorrencias`: 401; `sid` de B em token de A: 401.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:console`, `npm run test:isolamento`; G03, G15.
- **E2E:** `npm run test:e2e:api` com `SEGUNDO_FATOR_ATIVO=sim`.
- **Validação humana:** Rafael decide as três pendências.
- **Evidência a produzir:** `docs/evidencias-v2/G25/V2-F25-E02/` (revisão e saída).
- **Documentação a atualizar:** ADR 0004 (nota de revisão).
- **Definition of Done:** toda linha com veredito; ataque aceito vira `SEG-nn` crítico; decisões registradas.
- **Checkpoint:** Não.

### V2-F25-E03 - Matriz de autorização varrida
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (E04 a E07 e E11 usam a matriz)
- **Objetivo:** varrer papel x rota x método x recurso na API completa da V2 (servidor e pública), comparar com o manifesto e arquivar a matriz.
- **Problema que resolve:** a matriz da F03-E13 é do G03, antes de portal, cidadão, arquivos, documentos e reinspeção; rota nova pode divergir do manifesto (`apps/api/src/contrato/rotas.ts`).
- **Origem:** DP:T08; BZ-M:V2-SEC-08; REL:06 14a.
- **Estado atual:** EXPANDIR (`apps/api/test/matriz-papel-x-rota.test.ts`, de F03-E13).
- **Dependências de entrada:** F03-E13.
- **O que deve ser implementado:**
  - Testes: `apps/api/test/matriz-papel-x-rota-x-recurso.test.ts` (a criar), em processo e contra HML: operador, agente, coordenador, administrador, `usuario_orgao` (Obras e Saúde), cidadão, operador do console, pessoa com contas em dois municípios, sessão de suporte, token de desafio, sem token e expirado; por rota de `/v1` (inclusive F29 a F35) e do espelho, com recurso próprio, de outro município e de outro órgão.
  - Autorização: esperado do manifesto: 401, 403 `sem_permissao` por ação, 404 por recurso alheio, nunca 200 fora do declarado; no modo `publica`, rota de servidor responde 404.
  - Domínio: revisão humana de toda rota `publica`, `propria_conta` e paga (`POST /rota`).
- **O que NÃO deve ser implementado nesta etapa:** dado alheio em profundidade (E04 a E06); arquivos (E07).
- **Arquivos e módulos prováveis:** `apps/api/test/matriz-papel-x-rota-x-recurso.test.ts` (a criar), `apps/api/test/matriz-papel-x-rota.test.ts`, `apps/api/src/contrato/rotas.ts`.
- **Risco de segurança:** mutações reais: banco em memória por caso, token sintético.
- **Impacto LGPD:** Não se aplica: dados da semente.
- **Migração necessária:** Não.
- **Compatibilidade:** só teste.
- **Rollback:** remover o arquivo.
- **Testes positivos:** toda célula bate com o manifesto.
- **Testes negativos:** rota sem entrada de manifesto reprova; `usuario_orgao` em `GET /v1/ocorrencias`: 403; token do cidadão ou do console em rota do painel: 401.
- **Testes de autorização e isolamento:** outro município e outro órgão: 404 em toda rota com `:id`; `agente_campo` em rota de coordenador: 403.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:isolamento`, `npm run test:e2e:api`; G03, G04.
- **E2E:** Não se aplica: matriz de API.
- **Validação humana:** Rafael lê as linhas críticas.
- **Evidência a produzir:** `docs/evidencias-v2/G25/V2-F25-E03/` (matriz, saída).
- **Documentação a atualizar:** `dc360/docs/PAPEIS_E_RESPONSABILIDADES.md`.
- **Definition of Done:** matriz verde; nenhuma rota sem manifesto; divergência vira `SEG-nn`.
- **Checkpoint:** Não.

### V2-F25-E04 - Cruzamento de tenant ampliado
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** crítico  |  **Paralelizável:** sim (com E05, E06 e E07)
- **Objetivo:** provar, no Postgres real de HML com os papéis de produção, que nenhum caminho cruza o município A com o B.
- **Problema que resolve:** `db/test/isolamento.test.ts` (CA-06) roda em PGlite; só o job `implantavel` usa papéis reais, e apenas para subir a API (REL:06 13.2).
- **Origem:** ALY:CA-06; BZ-F:P0-SEG; REL:06 13.2.
- **Estado atual:** EXPANDIR (CA-06 e F03-E08 ficam).
- **Dependências de entrada:** E03.
- **O que deve ser implementado:**
  - Banco: `dc360/scripts/conferir-catalogo-hml.mjs` (a criar) lê do HML `pg_roles` (`dc360_api` sem BYPASSRLS), `relforcerowsecurity` e `pg_policies` e confere com CA-06 e a lista nominal de funções SECURITY DEFINER.
  - Testes: `apps/api/test/cruzamento-de-tenant.test.ts` (a criar), em processo e contra HML com dois municípios sintéticos: token de B contra ids de A em leitura, escrita, busca, CSV e push; `organizacaoId` forjado em corpo, query e cabeçalho; funções SECURITY DEFINER (`trocar_senha`, `revogar_sessoes_do_usuario`) com contexto de A sobre usuário de B; pacote de saída (`apps/api/src/saida/pacote.ts`) com linha de B.
- **O que NÃO deve ser implementado nesta etapa:** órgão (E05); cidadão (E06); arquivos (E07).
- **Arquivos e módulos prováveis:** `dc360/scripts/conferir-catalogo-hml.mjs`, `apps/api/test/cruzamento-de-tenant.test.ts` (a criar).
- **Risco de segurança:** escreve só em municípios sintéticos de HML.
- **Impacto LGPD:** Não se aplica: dados sintéticos.
- **Migração necessária:** Não.
- **Compatibilidade:** só teste.
- **Rollback:** remover os arquivos.
- **Testes positivos:** catálogo de HML igual ao de CA-06.
- **Testes negativos:** token de B em `GET /v1/ocorrencias/:id` de A: 404; `org` trocado no JWT: 401; `dc360_api` com BYPASSRLS reprova o script.
- **Testes de autorização e isolamento:** coordenador de B exporta o pacote: só linhas de B; e-mail de A criado em B: resposta genérica; `trocar_senha` entre municípios: sem efeito.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`; G03 a G05.
- **E2E:** o mesmo teste contra a API de HML.
- **Validação humana:** Rafael lê a tabela vetor x resposta.
- **Evidência a produzir:** `docs/evidencias-v2/G25/V2-F25-E04/` (saída do script e do teste).
- **Documentação a atualizar:** `db/PENDENCIAS.md`.
- **Definition of Done:** catálogo de HML conferido; todo vetor 404 ou nada; zero crítico e alto.
- **Checkpoint:** Não.

### V2-F25-E05 - Cruzamento de órgão (Obras x Saúde)
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** crítico  |  **Paralelizável:** sim (com E04, E06 e E07)
- **Objetivo:** provar em HML, pelo portal real e pela API, que usuário de um órgão nunca lê, conta, busca nem responde dado de outro órgão.
- **Problema que resolve:** F04-E05, E06 e E13 provam o isolamento do G04; depois entraram anexos, busca, sino, reinspeção e pacote, e cada superfície nova reabre o vazamento por órgão (REL:05 2.5).
- **Origem:** DP:T07; BZ-M:V2-SEC-08; BZ-M:V2-SEC-09; REL:05 2.5.
- **Estado atual:** EXPANDIR (`apps/api/test/portal-cenarios-negativos.test.ts` fica).
- **Dependências de entrada:** E03.
- **O que deve ser implementado:**
  - Testes: `apps/portal/test/cruzamento-de-orgao.e2e.mjs` (a criar): Playwright contra o portal de HML com Maria (Obras), João (Saúde), Ana (os dois), Rita (coordenadora) e o município B; cada um troca o id na URL, na API e no corpo, e o teste confere o DOM.
  - Testes: vetores: lista, detalhe, busca, contadores, `orgaoId` na query, sino, histórico, anexo, ofício por link, pacote, vínculo encerrado, usuário movido de órgão.
  - Banco: com o papel real de HML, Maria em `ocorrencias`, `usuarios` alheios, `equipes` e `relatos`: 0 linhas ou 42501.
- **O que NÃO deve ser implementado nesta etapa:** tenant (E04); cidadão (E06); arquivos em profundidade (E07).
- **Arquivos e módulos prováveis:** `apps/portal/test/cruzamento-de-orgao.e2e.mjs` (a criar), `db/test/isolamento-por-orgao.test.ts`.
- **Risco de segurança:** contador que soma outro órgão vaza sem mostrar linha.
- **Impacto LGPD:** Não se aplica: dados sintéticos.
- **Migração necessária:** Não.
- **Compatibilidade:** só teste.
- **Rollback:** remover o arquivo.
- **Testes positivos:** Maria lê só Obras; Rita lê os dois.
- **Testes negativos:** Maria lê encaminhamento da Saúde por id exato: 404; busca por termo da Saúde: 0 resultados; contador de Obras não soma a Saúde.
- **Testes de autorização e isolamento:** item de outro executor do mesmo órgão: 403, fora do órgão: 404; `orgao_atual` forjado sem vínculo: 0 linhas.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`; G04, G11.
- **E2E:** o próprio Playwright contra HML.
- **Validação humana:** Rafael lê a tabela cenário x esperado x obtido.
- **Evidência a produzir:** `docs/evidencias-v2/G25/V2-F25-E05/` (tabela, saída).
- **Documentação a atualizar:** `dc360/docs/PAPEIS_E_RESPONSABILIDADES.md`.
- **Definition of Done:** todo vetor devolve 404, 403 ou zero linhas, como declarado.
- **Checkpoint:** Não.

### V2-F25-E06 - Cruzamento de cidadão (só o meu)
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** crítico  |  **Paralelizável:** sim (com E04, E05 e E07)
- **Objetivo:** provar em HML que cada cidadão alcança só o que é seu (conta, sessões, relatos, anexos, protocolo), pela API pública e pelo banco.
- **Problema que resolve:** F15-E06 e F16-E09 provam policies e modelo de leitura, mas o protocolo do relato é sequencial por município e ano (F16-E03), o que convida à enumeração (REL:07 gaps 3 e 16).
- **Origem:** DP:T02; BZ-M:V2-CID-06; REL:07 gaps 3 e 16.
- **Estado atual:** EXPANDIR (`db/test/cidadao-so-o-meu.test.ts` fica).
- **Dependências de entrada:** E03.
- **O que deve ser implementado:**
  - Testes: `apps/api/test/cruzamento-de-cidadao.test.ts` (a criar) e `scripts/e2e-cidadao.mjs` estendido, contra a API pública de HML, com cidadãos A e B (mesmo município e municípios diferentes): relato do B por id e por protocolo vizinho, anexo, complemento, sessão, aceite e aparelho.
  - API: resposta só com a lista de inclusão: sem nota interna, equipe, severidade interna nem dado de terceiro, inclusive em erro e paginação.
  - Banco: com o papel do CP-25, `SELECT` em `ocorrencias` e `usuarios`: 42501.
- **O que NÃO deve ser implementado nesta etapa:** tenant (E04); órgão (E05); anexos em profundidade (E07); abuso (E09).
- **Arquivos e módulos prováveis:** `apps/api/test/cruzamento-de-cidadao.test.ts` (a criar), `scripts/e2e-cidadao.mjs`.
- **Risco de segurança:** protocolo adivinhável: inexistente e alheio respondem igual.
- **Impacto LGPD:** Não se aplica: cidadãos sintéticos.
- **Migração necessária:** Não.
- **Compatibilidade:** só teste.
- **Rollback:** remover os arquivos.
- **Testes positivos:** A lê e complementa só o próprio relato.
- **Testes negativos:** relato do B por id exato e por protocolo vizinho: 404 idêntico ao de inexistente; token do cidadão em `GET /v1/ocorrencias`: 401.
- **Testes de autorização e isolamento:** token de servidor, portal ou console na API pública: 401; canal desligado recusa sem revelar; cidadão desativado: 403.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`; G15, G16.
- **E2E:** `scripts/e2e-cidadao.mjs` contra HML.
- **Validação humana:** Rafael tenta ler o relato do B pelo `curl`.
- **Evidência a produzir:** `docs/evidencias-v2/G25/V2-F25-E06/` (tabela, saída).
- **Documentação a atualizar:** `dc360/docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** todo vetor 404, 401 ou zero; só a lista de inclusão.
- **Checkpoint:** Não.

### V2-F25-E07 - IDOR em IDs, URLs de arquivo e presign
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com E04, E05 e E06)
- **Objetivo:** provar que identificador, chave de objeto e URL assinada não servem a quem não pode: evidência, anexo, documento emitido, pacote.
- **Problema que resolve:** URL assinada é bearer, sem vínculo a usuário nem IP (REL:06 13.1); `confirmarBytes` baixa o objeto inteiro (`apps/api/src/rotas/evidencias.ts:114`) (BZ-D:UPL-06).
- **Origem:** DP:T25; BZ-D:UPL-06; REL:08 16.3.
- **Estado atual:** EXPANDIR (`apps/api/test/evidencias.test.ts` e F04-E13 cobrem parte).
- **Dependências de entrada:** E03.
- **O que deve ser implementado:**
  - Testes: `apps/api/test/idor-de-arquivos.test.ts` (a criar), em processo e contra HML com o bucket real: id trocado em `GET /v1/evidencias/:id/url`, `/v1/arquivos/:id`, documento emitido e pacote; `ocorrencia_id`, `encaminhamento_id` ou `relato_id` de outro escopo em `POST /v1/arquivos/autorizar`.
  - Testes: presign: URL de A não resolve chave de B; PUT com tipo ou tamanho trocado; segundo PUT; PUT reusado depois de `confirmar`; GET expirado; chave de quarentena; `nome_exibicao` com `../`; `Content-Disposition: attachment` e `nosniff`.
  - Observabilidade: URL assinada fora do log (`apps/api/test/log.test.ts`).
- **O que NÃO deve ser implementado nesta etapa:** arquivo hostil (E08); cota e abuso (E09); a prova do S3 em si (F06-E15).
- **Arquivos e módulos prováveis:** `apps/api/test/idor-de-arquivos.test.ts` (a criar), `apps/api/src/rotas/evidencias.ts`, `apps/api/src/armazenamento/`.
- **Risco de segurança:** bucket de HML separado do de produção.
- **Impacto LGPD:** Não se aplica: arquivos sintéticos.
- **Migração necessária:** Não.
- **Compatibilidade:** só teste.
- **Rollback:** remover o arquivo.
- **Testes positivos:** o dono lê o próprio arquivo até o fim da validade.
- **Testes negativos:** id de outro município: 404; PUT com tamanho diferente: recusado; segundo PUT: 412; GET da quarentena: sem URL.
- **Testes de autorização e isolamento:** usuário da Saúde lê anexo do encaminhamento da Obras: 404; cidadão B lê anexo do relato do A: 404.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:isolamento`; G06, G07.
- **E2E:** subir e ler arquivo sintético pelo painel de HML.
- **Validação humana:** Rafael tenta reaproveitar uma URL assinada em outra conta.
- **Evidência a produzir:** `docs/evidencias-v2/G25/V2-F25-E07/` (tabela de vetores, sem URL assinada).
- **Documentação a atualizar:** `dc360/docs/ARMAZENAMENTO.md`.
- **Definition of Done:** todo vetor recusado; URL assinada fora do log; zero crítico e alto.
- **Checkpoint:** Não.

### V2-F25-E08 - Uploads maliciosos em HML (suíte da F06)
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com F25-E09)
- **Objetivo:** reexecutar `apps/api/test/arquivos-maliciosos.test.ts` na topologia real de HML (API e worker separados, bucket e CORS reais).
- **Problema que resolve:** a suíte da F06-E16 nasce no executor local; falha de worker, lease, bucket versionado e CORS do PUT só aparece em HML (REL:08 16.2).
- **Origem:** DP:T25; BZ-D:UPL-08; REL:08 16.2.
- **Estado atual:** EXPANDIR (a suíte da F06-E16 fica).
- **Dependências de entrada:** G07; F06-E16.
- **O que deve ser implementado:**
  - Infraestrutura: com `ARQUIVOS_HML_URL` e credencial sintética, roda a suíte inteira da F06-E16 e varre os bytes do derivado `ativo` baixado do bucket: nenhum marcador de polyglot, nenhuma coordenada de EXIF.
  - Testes: topologia: 200 envios simultâneos (`/saude` segue 200 e a fila do worker drena); worker morto na verificação (lease expira, reprocesso único); `confirmar` duas vezes e PUT depois de `confirmar` sem corrida; cota por classe (F06-E09) estourada: 429.
  - Arquivos: PDF só se a F06-E14 existir; sem ela, PDF segue recusado (CP-12); objetos sintéticos removidos ao fim.
- **O que NÃO deve ser implementado nesta etapa:** vídeo (E18); correção dos defeitos (cada achado vira `SEG-nn`).
- **Arquivos e módulos prováveis:** `apps/api/test/arquivos-maliciosos.test.ts` (F06-E16), `apps/api/src/armazenamento/cli.ts`.
- **Risco de segurança:** fixtures hostis só geradas por código; bucket de HML, nunca produção.
- **Impacto LGPD:** Não se aplica: bytes sintéticos.
- **Migração necessária:** Não.
- **Compatibilidade:** só teste.
- **Rollback:** remover os casos novos.
- **Testes positivos:** JPEG e PNG legítimos chegam a `ativo` com derivado sem EXIF.
- **Testes negativos:** cada carga termina em `rejeitado` ou em derivado sem a carga; nenhuma chega a `ativo` com os bytes de entrada.
- **Testes de autorização e isolamento:** usuário da Saúde lê anexo do encaminhamento da Obras: 404; arquivo `ativo` de A pedido por B: 404.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:isolamento`; G06, G07.
- **E2E:** autorizar, PUT, confirmar e ler pela API de HML, por caso.
- **Validação humana:** Rafael repete duas cargas à mão.
- **Evidência a produzir:** `docs/evidencias-v2/G25/V2-F25-E08/` (tabela caso x resultado).
- **Documentação a atualizar:** `dc360/docs/ARMAZENAMENTO.md`.
- **Definition of Done:** nenhum arquivo hostil `ativo`; topologia provada.
- **Checkpoint:** Não.

### V2-F25-E09 - Rate limit e abuso (duas camadas)
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com F25-E08)
- **Objetivo:** provar em HML as duas camadas de A-03 (limite na borda e cotas no banco) e medir o abuso que elas não cobrem.
- **Problema que resolve:** o limitador atual é memória por processo (`@fastify/rate-limit`, `apps/api/src/servidor.ts`), sem soma entre máquinas; as camadas de F15-E09 e F15-E10 nunca foram atacadas em conjunto (DP:T22).
- **Origem:** PR:A-03; DP:T22; REL:07 11.10.
- **Estado atual:** EXPANDIR (F15-E09 e F15-E10 ficam).
- **Dependências de entrada:** G15.
- **O que deve ser implementado:**
  - Testes: `dc360/scripts/abuso-hml.mjs` (a criar), só HML, e-mail em `notificadorDeLog`: camada 1: rajada por endereço em `/v1/cidadao/codigos`, `entrar` e `renovar`, com rotação de `X-Forwarded-For` e `Fly-Client-IP` forjado; camada 2: cotas de `pedir_codigo`, `criar_relato`, `autorizar_upload` (F15-E10) e as do chat e do vídeo (F34-E11) com duas máquinas e reinício.
  - Testes: variações do mesmo e-mail (`+alias`) e criação em massa de contas: medir e registrar (CP-27 decide); `codigos` responde igual, em forma e tempo, a e-mail existente e inexistente; falha de `cota_consumir` nega a escrita.
- **O que NÃO deve ser implementado nesta etapa:** CAPTCHA e atestação (CP-27); Redis; WAF contratado.
- **Arquivos e módulos prováveis:** `dc360/scripts/abuso-hml.mjs` (a criar), `apps/api/src/cidadao/cotas.ts`, `apps/api/src/rede.ts`.
- **Risco de segurança:** rajada só em HML; o script recusa outro host.
- **Impacto LGPD:** Não se aplica: e-mails de teste.
- **Migração necessária:** Não.
- **Compatibilidade:** só teste.
- **Rollback:** remover o script.
- **Testes positivos:** tráfego legítimo abaixo do teto passa; `/saude` segue 200 durante a rajada.
- **Testes negativos:** a cota mais um recebe 429 `cota_excedida`; cabeçalho de IP forjado não troca o balde; reinício não zera a contagem; duas máquinas contam juntas.
- **Testes de autorização e isolamento:** cidadão A que estoura a cota não derruba B atrás do mesmo IP; `SELECT` em `cotas_de_uso` pela API pública: 42501.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:isolamento`; G15.
- **E2E:** o próprio `abuso-hml.mjs` contra a API pública de HML.
- **Validação humana:** Rafael vê o 429 e a saúde estável.
- **Evidência a produzir:** `docs/evidencias-v2/G25/V2-F25-E09/` (contagens e 429).
- **Documentação a atualizar:** `dc360/docs/IMPLANTACAO.md`.
- **Definition of Done:** nenhuma evasão da cota; 429 igual para e-mail existente ou não.
- **Checkpoint:** Não.

### V2-F25-E10 - DAST em HML (baseline)
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E11; não durante as rajadas das E08 e E09)
- **Objetivo:** rodar OWASP ZAP em modo baseline (passivo) e a varredura da API por OpenAPI em HML e tratar os alertas.
- **Problema que resolve:** DAST ausente (BZ-D:OPS-71); `vercel.json` do painel só declara `Cache-Control` de ativos: sem CSP, `frame-ancestors` nem `Referrer-Policy`.
- **Origem:** DP:T34; BZ-D:OPS-71; REL:10 1.3.
- **Estado atual:** CRIAR (script e configuração).
- **Dependências de entrada:** G01 (HML); OpenAPI da F02-E04.
- **O que deve ser implementado:**
  - Infraestrutura: `dc360/scripts/dast-hml.mjs` (a criar) recusa host fora da lista de HML e `NODE_ENV=production` e roda o ZAP em contêiner de versão fixa: `zap-baseline.py` no painel, no portal, no console e na API pública; `zap-api-scan.py` com o OpenAPI de `/v1` e token sintético de HML por variável, nunca versionado.
  - Arquivos: `zap.conf` com cada supressão datada e justificada.
  - Frontend: cabeçalhos corrigidos em `vercel.json` do painel e do portal (CSP sem `unsafe-inline` em `script-src` e só com o domínio do VLibras da F08-E12, `frame-ancestors`, `Referrer-Policy`) e no `helmet` da API.
- **O que NÃO deve ser implementado nesta etapa:** varredura ativa e fuzz agressivo (E11, E12); DAST por release (backlog); scan de contêiner.
- **Arquivos e módulos prováveis:** `dc360/scripts/dast-hml.mjs` e `dc360/scripts/zap.conf` (a criar), `vercel.json`, `apps/api/src/servidor.ts`.
- **Risco de segurança:** o script nunca aponta para produção; token só em variável.
- **Impacto LGPD:** Não se aplica: HML sintético.
- **Migração necessária:** Não.
- **Compatibilidade:** CSP estrita testada em HML antes de produção.
- **Rollback:** reverter `headers` do `vercel.json`.
- **Testes positivos:** baseline sem alerta Alto ou Médio aberto nas quatro superfícies.
- **Testes negativos:** host de produção ou fora da lista: o script recusa (`scripts/dast-hml.test.mjs`); alerta Médio sem correção nem supressão datada reprova.
- **Testes de autorização e isolamento:** o scan com token de A não alcança id de B: 404.
- **Regressão obrigatória:** `npm run test:scripts`, `npm run test:e2e`; G01, G11.
- **E2E:** `npm run test:e2e` com os `headers` novos.
- **Validação humana:** Rafael lê o relatório e as supressões.
- **Evidência a produzir:** `docs/evidencias-v2/G25/V2-F25-E10/` (relatórios do ZAP, sem token).
- **Documentação a atualizar:** `dc360/docs/IMPLANTACAO.md`.
- **Definition of Done:** baseline tratada; cabeçalhos no `vercel.json`; script recusa produção.
- **Checkpoint:** Não.

### V2-F25-E11 - Fuzz e propriedade nos esquemas críticos
- **Prioridade:** P2
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E04 a E10)
- **Objetivo:** provar propriedades dos esquemas Zod e das rotas de entrada mais expostas com entradas geradas.
- **Problema que resolve:** os testes de esquema usam exemplos fixos (`packages/shared/test/csv.test.ts`, `telefone.test.ts`); a entrada do cidadão (relato, coordenada, e-mail) é hostil e nova (PR:Prompt-F25).
- **Origem:** PR:Prompt-F25; DP:T25.
- **Estado atual:** CRIAR (testes e dependência de desenvolvimento).
- **Dependências de entrada:** E03.
- **O que deve ser implementado:**
  - Testes: `packages/shared/test/propriedades.test.ts` (a criar), com `fast-check` (devDependency): `safeParse` nunca lança exceção que não seja do Zod para entrada arbitrária (`__proto__`, controle, inversão de texto); string acima do máximo é recusada; normalização de telefone, protocolo e coordenada é idempotente; `celulaCsv` (`packages/shared/src/csv.ts`) nunca gera célula que abra como fórmula.
  - Testes: `apps/api/test/corpo-malformado.test.ts` (a criar): corpo truncado, `content-type` errado, chaves duplicadas, aninhamento profundo e 2 MB em `POST` de relato, sincronização do campo e login: 400, 413 ou 415, nunca 500, sem pilha.
  - Arquivos: `seed` gravada em cada execução.
- **O que NÃO deve ser implementado nesta etapa:** fuzz de binário e de PDF (E08, F06); ZAP ativo (E12); esquema novo.
- **Arquivos e módulos prováveis:** `packages/shared/test/propriedades.test.ts` e `apps/api/test/corpo-malformado.test.ts` (a criar), `packages/shared/src/csv.ts`.
- **Risco de segurança:** propriedade que passa só porque o gerador é fraco: prova de mutação nos limites.
- **Impacto LGPD:** Não se aplica: entradas geradas.
- **Migração necessária:** Não.
- **Compatibilidade:** só teste; devDependency nova.
- **Rollback:** remover os arquivos e a dependência.
- **Testes positivos:** as propriedades passam em milhares de entradas geradas e a `seed` fixa reproduz.
- **Testes negativos:** afrouxar um máximo do esquema reprova a propriedade de limite; `celulaCsv` sem o apóstrofo reprova a de fórmula; resposta 500 reprova `corpo-malformado`.
- **Testes de autorização e isolamento:** Não se aplica: sem rota nem dado de município.
- **Regressão obrigatória:** `npm test --workspace @dc360/shared`, `npm run test:api`, `npm run auditar`; G03.
- **E2E:** Não se aplica: teste em processo.
- **Validação humana:** Rafael lê a lista de esquemas cobertos.
- **Evidência a produzir:** `docs/evidencias-v2/G25/V2-F25-E11/` (saída, seeds).
- **Documentação a atualizar:** `dc360/README.md`.
- **Definition of Done:** propriedades verdes e reproduzíveis, ou adiadas com dono e data.
- **Checkpoint:** Não.

### V2-F25-E12 - Pentest externo e remediação
- **Prioridade:** P0
- **Tamanho:** L  |  **Complexidade:** crítica  |  **Risco:** alto  |  **Paralelizável:** não (exige E01 a E10 verdes)
- **Objetivo:** pentest externo contra o HML, com escopo, regras de engajamento e remediação, antes de abrir o App do Cidadão.
- **Problema que resolve:** nenhum teste externo existe; o levantamento exige pentest antes do primeiro cliente (DP:T34).
- **Origem:** DP:T34; PR:Prompt-F25; REL:10.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E01 a E11; E14 a E20; CP-33.
- **O que deve ser implementado:**
  - Domínio: `dc360/docs/PENTEST-ESCOPO.md` (a criar): escopo do CP-33 (superfícies de rede, apps e arquivos), HML sintético, contas por papel (dois órgãos, dois municípios, pessoa em dois municípios, cidadãos A e B, operador do console, sessão de suporte), módulos das F29 a F35, janela, proibições (negação de serviço, engenharia social, dado real) e régua (ASVS 4.0 nível 2; MASVS e MASTG no mobile).
  - Domínio: três cotações (levantamento), confidencialidade e insumos (SBOM, matriz da E03, relatórios das E01 a E20).
  - Arquivos: cada achado entra em `achados.md` (`SEG-nn`); prazo por severidade fixado no contrato.
- **O que NÃO deve ser implementado nesta etapa:** pentest em produção; bug bounty; engenharia social; DAST contínuo.
- **Arquivos e módulos prováveis:** `dc360/docs/PENTEST-ESCOPO.md` (a criar), `docs/evidencias-v2/G25/achados.md`.
- **Risco de segurança:** relatório completo fora do repositório; contas do teste descartadas.
- **Impacto LGPD:** Não se aplica: dados sintéticos; o contrato proíbe dado real.
- **Migração necessária:** Não.
- **Compatibilidade:** só por PR normal.
- **Rollback:** reverter cada correção.
- **Testes positivos:** relatório com cobertura do escopo; achados lançados.
- **Testes negativos:** janela fora do HML ou sem conta sintética não começa; achado sem reprodução volta ao fornecedor.
- **Testes de autorização e isolamento:** dois municípios e dois órgãos entregues ao fornecedor, que confirma ou refuta os cruzamentos das E04 a E06.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`, `npm run auditar`.
- **E2E:** reexecutar o teste da etapa de origem a cada correção.
- **Validação humana:** Rafael aprova escopo e fornecedor e lê o resumo executivo.
- **Evidência a produzir:** `docs/evidencias-v2/G25/V2-F25-E12/` (escopo, resumo executivo, SHA-256 do relatório completo).
- **Documentação a atualizar:** `dc360/docs/PENTEST-ESCOPO.md`.
- **Definition of Done:** pentest executado; crítico e alto corrigidos; médio corrigido ou aceito.
- **Checkpoint:** CP-33 (contratação e escopo; bloqueia abrir o App do Cidadão publicamente).

### V2-F25-E13 - Re-teste e relatório
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** não (a E12 fecha antes)
- **Objetivo:** re-testar as correções do pentest e fechar o relatório pré-piloto, com cobertura por capítulo do ASVS 4.0 nível 2 e salvaguarda do CIS v8 IG1.
- **Problema que resolve:** correção sem re-teste não prova nada, e o G25 precisa de um resultado único com limites escritos (DP:T34).
- **Origem:** DP:T34; PR:Prompt-F25.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E12.
- **O que deve ser implementado:**
  - Domínio: re-teste pelo fornecedor de todo achado crítico, alto e médio corrigido; reexecução das E03 a E09, E14 a E20 e de `npm run auditar` depois das correções.
  - Arquivos: `dc360/docs/RELATORIO-DE-SEGURANCA-PRE-PILOTO.md` (a criar): por capítulo do ASVS 4.0 nível 2 e salvaguarda do CIS IG1 relevante, a etapa e a ferramenta que verificou, não se aplica com motivo, ou pendente; limites (HML não é produção; papéis de banco e `SEGUNDO_FATOR_ATIVO` de produção NÃO CONFIRMADOS); resultado: aprovado, com ressalvas ou reprovado.
  - Testes: `dc360/scripts/registro-de-achados.test.mjs` (a criar) lê `achados.md`: crítico ou alto sem correção e re-teste, médio aceito sem dono, motivo e vencimento ISO, ou aceite vencido, reprova.
- **O que NÃO deve ser implementado nesta etapa:** novo escopo de teste; certificação; declarar o sistema "seguro".
- **Arquivos e módulos prováveis:** `dc360/docs/RELATORIO-DE-SEGURANCA-PRE-PILOTO.md` e `dc360/scripts/registro-de-achados.test.mjs` (a criar), `docs/evidencias-v2/G25/achados.md`.
- **Risco de segurança:** relatório que afirma mais do que provou.
- **Impacto LGPD:** Não se aplica: sem dado pessoal.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: documento e teste.
- **Rollback:** reverter o relatório.
- **Testes positivos:** registro sem crítico nem alto aberto; o re-teste confirma cada correção.
- **Testes negativos:** achado crítico `aberto`, médio aceito sem dono e aceite vencido reprovam `registro-de-achados.test.mjs`.
- **Testes de autorização e isolamento:** matriz e cruzamentos reexecutados seguem verdes.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`, `npm run test:scripts`, `npm run auditar`; G03, G15.
- **E2E:** `npm run test:e2e:api` e `scripts/e2e-cidadao.mjs` depois das correções.
- **Validação humana:** Rafael lê o relatório e decide.
- **Evidência a produzir:** `docs/evidencias-v2/G25/V2-F25-E13/` (relatório, re-teste, registro final).
- **Documentação a atualizar:** `dc360/README.md` (segurança).
- **Definition of Done:** relatório arquivado; registro sem crítico nem alto abertos.
- **Checkpoint:** Não.

### V2-F25-E14 - Pessoa global e login em dois passos: revisão manual e ataques
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** crítica  |  **Risco:** crítico  |  **Paralelizável:** sim (com E15 a E19)
- **Objetivo:** revisar `pessoas`, o login em dois passos, a escolha e a troca de município e o MFA da pessoa com vários vínculos, por leitura e por ataque.
- **Problema que resolve:** a pessoa global é a única exceção nomeada ao isolamento (F03-E15): credencial fora do tenant, funções SECURITY DEFINER.
- **Origem:** PR:D-08; DP:T01; DP:T09; REL:06 13.3.
- **Estado atual:** EXPANDIR (a E02 revisa a autenticação anterior).
- **Dependências de entrada:** E02; G03 (F03-E15 a E18).
- **O que deve ser implementado:**
  - Domínio: `revisao.md`: por função nominal (`municipios_da_pessoa`, `vigencia_da_sessao`, `credenciais_da_pessoa`): contexto, `search_path`, grants, veredito e `SEG-nn`.
  - Testes: `apps/api/test/revisao-de-pessoa-global.test.ts` (a criar): contas em A e B; desafio reusado ou vencido; `organizacaoId` fora da lista; `sid` revogado na troca; MFA herdado além de `MFA_VIGENCIA_MINUTOS`; senha trocada em A encerra as sessões de B; e-mail inexistente responde igual.
  - Banco: `scripts/conferir-catalogo-hml.mjs` (E04): `pessoas` sem grant ao `dc360_app`.
- **O que NÃO deve ser implementado nesta etapa:** reescrever o login (E02); órgão externo (E20); suporte (E15).
- **Arquivos e módulos prováveis:** `apps/api/test/revisao-de-pessoa-global.test.ts` (a criar), `apps/api/src/auth/servico.ts`.
- **Risco de segurança:** função SECURITY DEFINER com contexto frouxo expõe credencial de outro município.
- **Impacto LGPD:** identidade global atrás do CP-49; contas sintéticas.
- **Migração necessária:** Não.
- **Compatibilidade:** só HML.
- **Rollback:** reverter cada correção.
- **Testes positivos:** pessoa com A e B entra, escolhe B e troca para A, com tokens e sessões distintos.
- **Testes negativos:** desafio vencido e município fora da lista: 401; senha errada e e-mail inexistente respondem igual; reset em A não toca a conta em B.
- **Testes de autorização e isolamento:** token de B em recurso de A: 404; `dc360_app` lendo `pessoas`: 42501; `vigencia_da_sessao` com `org` alheio: vazio.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`, `npm run test:console`; G03, G04.
- **E2E:** `npm run test:e2e:api` com `SEGUNDO_FATOR_ATIVO=sim`.
- **Validação humana:** Rafael tenta entrar sem a senha.
- **Evidência a produzir:** `docs/evidencias-v2/G25/V2-F25-E14/`.
- **Documentação a atualizar:** ADR 0009 (nota de revisão).
- **Definition of Done:** toda função com veredito; ataque aceito vira `SEG-nn` crítico.
- **Checkpoint:** CP-49 (parecer do encarregado; bloqueia a pessoa em mais de um município em produção).

### V2-F25-E15 - Suporte assistido: somente leitura, com prazo e trilha, provado
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** crítico  |  **Paralelizável:** sim (com E14 e E16 a E19)
- **Objetivo:** provar que a concessão (D-10) dá só leitura, ao operador nomeado, até `expira_em`, e que cada leitura fica na trilha.
- **Problema que resolve:** é o ÚNICO caminho de leitura do fornecedor ao dado de um município; prazo, revogação ou papel frouxos viram impersonation (ADR 0008).
- **Origem:** PR:D-10; DP:T38; DP:J10; REL:04.
- **Estado atual:** CRIAR (a prova); MANTER `suporte_concessoes` (F10-E16) e a sessão de leitura (F20-E11).
- **Dependências de entrada:** E03; G10; G20; CP-30.
- **O que deve ser implementado:**
  - Testes: `apps/api/test/suporte-somente-leitura.test.ts` (a criar): a sessão de suporte percorre TODA rota do manifesto (E03): só `GET` devolve 200; `POST`, `PUT`, `PATCH` e `DELETE` recusados antes do banco; CPF só em máscara.
  - Banco: `db/test/suporte-no-banco.test.ts` (a criar): com o papel real, `INSERT`, `UPDATE` e `DELETE` sob contexto de suporte: 42501; concessão vencida ou revogada: 0 linhas.
  - Trilha: toda leitura grava evento nominal (operador, rota, `concessao_id`) que o administrador lê.
- **O que NÃO deve ser implementado nesta etapa:** impersonation; prorrogação automática; telas (F10-E16, F20-E11).
- **Arquivos e módulos prováveis:** `apps/api/test/suporte-somente-leitura.test.ts` e `db/test/suporte-no-banco.test.ts` (a criar), `packages/shared/src/permissoes.ts`.
- **Risco de segurança:** sessão de suporte aceita em rota de escrita ou sem prazo no banco.
- **Impacto LGPD:** leitura do fornecedor é tratamento por operador sob CP-30; dado sintético.
- **Migração necessária:** Não.
- **Compatibilidade:** só HML.
- **Rollback:** reverter cada correção.
- **Testes positivos:** concessão de 2 horas lê a lista; a trilha traz a leitura.
- **Testes negativos:** `POST /v1/ocorrencias` com sessão de suporte: 403; requisição após `expira_em`: 401; concessão revogada: 401 na seguinte; prazo acima do teto: CHECK.
- **Testes de autorização e isolamento:** concessão em A lendo recurso de B: 404; coordenador liberando suporte: 403; operador sem concessão: negado.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`, `npm run test:console`; G10, G20.
- **E2E:** `npm run test:e2e:api`: liberar, ler, revogar.
- **Validação humana:** Rafael tenta escrever com a sessão de suporte.
- **Evidência a produzir:** `docs/evidencias-v2/G25/V2-F25-E15/`.
- **Documentação a atualizar:** ADR 0018 (nota de revisão).
- **Definition of Done:** nenhuma escrita passa; prazo e revogação valem no banco.
- **Checkpoint:** CP-30 (parecer J10; bloqueia o uso real do suporte).

### V2-F25-E16 - Provedor de assinatura e integrações externas: SSRF, retorno e segredos
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com E14, E15 e E17 a E19)
- **Objetivo:** provar que as saídas a terceiros (assinatura, conectores, SMS, tracing) não abrem SSRF, aceitam só retorno autenticado e não vazam segredo.
- **Problema que resolve:** hoje só `NOTIFICADOR_URL` e `push/` saem; cada integração nova traz segredo, destino e retorno público (D-09, D-14).
- **Origem:** PR:D-09; PR:D-14; DP:T34; REL:06.
- **Estado atual:** CRIAR (a prova); EXPANDIR `apps/api/test/config.test.ts`.
- **Dependências de entrada:** E01; G09; G31; G34; CP-41 para o provedor real.
- **O que deve ser implementado:**
  - Testes: `apps/api/test/saidas-externas.test.ts` (a criar): varredura de `fetch` em `apps/*/src`; todo destino vem de configuração fixa por ambiente (`ASSINATURA_URL_BASE`, `NOTIFICADOR_URL`, `S3_*`, conectores F31-E02, proxy WMS F31-E12, webhook F31-E06); URL dada por usuário (KML, WMS, GeoJSON) só por lista de permissão, `https`, sem IP privado, loopback nem `169.254.0.0/16`, sem redirecionamento para fora.
  - Testes: retorno do provedor e webhooks (WhatsApp, SMS): HMAC com `timingSafeEqual` ou consulta ativa, repetição recusada por id; PDF devolvido com hash diferente do enviado: recusado.
  - Segredos: `scripts/rotacionar-segredo.mjs` cobre os novos; segredo ausente de log e erro.
- **O que NÃO deve ser implementado nesta etapa:** escolher o provedor; credenciar WhatsApp, S2ID, SEI ou Alerta (F31-E09, E14 a E17); DAST (E10).
- **Arquivos e módulos prováveis:** `apps/api/test/saidas-externas.test.ts` (a criar), `apps/api/src/config.ts`, `scripts/rotacionar-segredo.mjs`.
- **Risco de segurança:** SSRF para metadados da nuvem ou rede interna; callback sem autenticação.
- **Impacto LGPD:** só o dado declarado sai a cada subprocessador.
- **Migração necessária:** Não.
- **Compatibilidade:** só teste.
- **Rollback:** remover o arquivo.
- **Testes positivos:** destino configurado responde; retorno assinado é aceito uma vez.
- **Testes negativos:** `http://169.254.169.254`, `localhost` e 302 para IP interno: recusados; HMAC errado: 401; repetido: 409; `ASSINATURA_PROVEDOR=memoria` em PROD: partida recusada.
- **Testes de autorização e isolamento:** retorno do provedor de A com `documento_id` de B: 404; conector de A não lê camada de B.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:scripts`, `npm run auditar`; G09, G31.
- **E2E:** provedor em sandbox de HML.
- **Validação humana:** Rafael lê a lista de destinos.
- **Evidência a produzir:** `docs/evidencias-v2/G25/V2-F25-E16/`.
- **Documentação a atualizar:** `dc360/docs/SUBPROCESSADORES.md`.
- **Definition of Done:** todo destino em lista; retorno autenticado.
- **Checkpoint:** CP-41 (provedor real; sem ele só memória e sandbox).

### V2-F25-E17 - CPF do cidadão: cifra, hash, máscara e saída
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com E14 a E16)
- **Objetivo:** provar que o CPF só existe cifrado, com hash por município, máscara nas listas e acesso auditado, em toda saída.
- **Problema que resolve:** o CPF é obrigatório no relato identificado (D-07) e de alto valor (F05-E13): o maior risco do canal é vazar.
- **Origem:** PR:D-07; DP:T19; BZ-D:LGP-01.
- **Estado atual:** EXPANDIR (F05-E13, F05-E14, F15-E16 e F16-E16 ficam).
- **Dependências de entrada:** E03; G05; G16; CP-46 para dado real.
- **O que deve ser implementado:**
  - Testes: `apps/api/test/cpf-nao-vaza.test.ts` (a criar), em HML, com CPFs gerados na hora (nunca versionados): sentinela com e sem pontuação procurada em log, erro, trilha, CSV, pacote de saída, busca, payload do agente, push e e-mail; listas só com máscara.
  - Banco: `db/test/cpf-no-banco.test.ts` (a criar): coluna só em envelope cifrado; envelope de uma linha em outra não abre; hashes de A e B diferentes; `pg_dump` de HML sem CPF em claro.
  - Chaves: `CPF_CHAVE` e `CPF_HASH_CHAVE` rotacionadas por `scripts/rotacionar-segredo.mjs`; dado antigo ainda abre (versão no envelope).
- **O que NÃO deve ser implementado nesta etapa:** base legal (CP-46); busca por CPF parcial; CPF de servidor.
- **Arquivos e módulos prováveis:** `apps/api/test/cpf-nao-vaza.test.ts` e `db/test/cpf-no-banco.test.ts` (a criar).
- **Risco de segurança:** chave junto do dado ou em log.
- **Impacto LGPD:** revelar o CPF inteiro exige permissão e gera consulta nominal (F05-E14).
- **Migração necessária:** Não.
- **Compatibilidade:** só teste.
- **Rollback:** remover os arquivos.
- **Testes positivos:** CPF sintético cifra, abre e casa pelo hash; a lista mostra a máscara.
- **Testes negativos:** CPF em claro em saída reprova; chave ausente derruba a partida.
- **Testes de autorização e isolamento:** coordenador de B lê CPF de relato de A: 404; operador sem permissão de revelar: 403; sessão de suporte: máscara.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`; G05, G16.
- **E2E:** `scripts/e2e-cidadao.mjs` com CPF gerado.
- **Validação humana:** Rafael procura o CPF de teste nos logs de HML.
- **Evidência a produzir:** `docs/evidencias-v2/G25/V2-F25-E17/`.
- **Documentação a atualizar:** `dc360/docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** zero CPF em claro fora da rota nominal; chaves rotacionadas.
- **Checkpoint:** CP-46 (base legal e finalidade; bloqueia CPF real e a abertura pública do canal).

### V2-F25-E18 - Vídeo e chat do cidadão: cadeia hostil, transcodificação isolada e abuso
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** crítica  |  **Risco:** alto  |  **Paralelizável:** sim (com E14 a E17)
- **Objetivo:** provar em HML que vídeo hostil (30 s, 50 MB, 1 por relato) não chega a `ativo`, que o `ffmpeg` roda sem rede nem segredo e que vídeo e chat resistem a abuso.
- **Problema que resolve:** `ffprobe` e `ffmpeg` processam bytes hostis e o chat é entrada livre de terceiro.
- **Origem:** PR:D-07; DP:T24; DP:T25; DP:K12.
- **Estado atual:** EXPANDIR (`video-malicioso.test.ts` da F06-E18 e a F07-E10 ficam).
- **Dependências de entrada:** G07; F06-E18 a E20; F07-E10 e E11; G34.
- **O que deve ser implementado:**
  - Testes: `apps/api/test/video-em-hml.test.ts` (a criar), com API, worker e `Dockerfile.video` reais: `dref` externo, `.m3u8` sob `video/mp4`, duas trilhas, `vp9`, truncado, 31 s, 51 MB, dois vídeos no relato, GPS no original: nenhum chega a `ativo` sem derivado limpo.
  - Isolamento: `ffmpeg` sem rede, sem `DATABASE_URL` nem chave do bucket, morto por tempo; 200 vídeos simultâneos: `/saude` segue 200 e a fila drena; custo medido (CP-47).
  - Chat: `apps/api/test/chat-do-relato.test.ts` (a criar): mensagem de 100 KB, HTML e `<script>` (escapados na leitura), rajada acima da cota: 429, relato encerrado: escrita recusada.
- **O que NÃO deve ser implementado nesta etapa:** tempo real (fora); moderação (F06-E20); câmera do app (F34-E03).
- **Arquivos e módulos prováveis:** `apps/api/test/video-em-hml.test.ts` e `apps/api/test/chat-do-relato.test.ts` (a criar).
- **Risco de segurança:** decodificador de bytes hostis; XSS pela mensagem.
- **Impacto LGPD:** Não se aplica: vídeo e mensagens sintéticos.
- **Migração necessária:** Não.
- **Compatibilidade:** só teste.
- **Rollback:** remover os arquivos.
- **Testes positivos:** MOV HEVC sintético de 10 s vira MP4 H.264 sem GPS em `ativo`.
- **Testes negativos:** cada carga termina em `rejeitado` ou em derivado limpo; `ffmpeg` travado é morto; excesso de cota: 429.
- **Testes de autorização e isolamento:** vídeo e chat do cidadão B lidos por A: 404; agente de campo não vê vídeo nem chat.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:isolamento`; G06, G07.
- **E2E:** vídeo sintético do app de HML ao painel.
- **Validação humana:** Rafael mata o worker no meio da transcodificação.
- **Evidência a produzir:** `docs/evidencias-v2/G25/V2-F25-E18/`.
- **Documentação a atualizar:** `dc360/docs/ARMAZENAMENTO.md`.
- **Definition of Done:** nenhum vídeo hostil `ativo`.
- **Checkpoint:** CP-47 (bloqueia `video_cidadao` em produção).

### V2-F25-E19 - Tracing e SLO sem vazar dado
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** sim (com E14 a E18)
- **Objetivo:** provar que o tracing (OpenTelemetry, destino configurável) não leva dado pessoal nem segredo e que o SLO por rota crítica mede de verdade.
- **Problema que resolve:** tracing copia URL, cabeçalho e SQL a um terceiro; id de município em atributo cruza tenant no destino (D-13).
- **Origem:** PR:D-13; DP:T33; REL:10.
- **Estado atual:** CRIAR (a prova); MANTER o request id (F01-E14) e a saúde (F21-E04).
- **Dependências de entrada:** G21; E16; CP-60.
- **O que deve ser implementado:**
  - Testes: `apps/api/test/tracing-sem-dado.test.ts` (a criar), com exportador em memória: sentinelas de CPF, e-mail, token, texto de relato e senha em corpo, query e cabeçalho não aparecem em span, evento, atributo nem métrica; atributos só da lista de permissão (rota modelada, método, status, duração).
  - Testes: SQL sem valor de parâmetro; PROD recusa destino `http` ou `localhost`; destino fora do ar não derruba a API (fila limitada).
  - SLO: em HML, erro injetado em rota crítica (entrar, sincronizar, relatar) queima o orçamento e dispara o alerta (F21-E06).
- **O que NÃO deve ser implementado nesta etapa:** escolher o destino; painel de tracing; novo SLO (F21-E13).
- **Arquivos e módulos prováveis:** `apps/api/test/tracing-sem-dado.test.ts` (a criar), `apps/api/src/config.ts`.
- **Risco de segurança:** atributo livre vaza dado ao destino; destino em texto claro.
- **Impacto LGPD:** o destino é subprocessador (F28-E08); span sem dado pessoal.
- **Migração necessária:** Não.
- **Compatibilidade:** só teste.
- **Rollback:** remover o arquivo.
- **Testes positivos:** a requisição gera span com rota modelada e duração; o SLO mede.
- **Testes negativos:** sentinela em span reprova; destino `http://` em PROD: partida recusada; destino fora do ar: API segue 200.
- **Testes de autorização e isolamento:** span de A sem id de município nem de relato de B.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:console`, `npm run test:scripts`; G21.
- **E2E:** `npm run test:e2e:api` com o exportador ligado.
- **Validação humana:** Rafael lê os atributos de um span real de HML.
- **Evidência a produzir:** `docs/evidencias-v2/G25/V2-F25-E19/`.
- **Documentação a atualizar:** `dc360/docs/IMPLANTACAO.md`.
- **Definition of Done:** zero sentinela em tracing; destino fixo; SLO provado.
- **Checkpoint:** CP-60 (provedor, região e retenção; bloqueia tracing em produção).

### V2-F25-E20 - IDOR e isolamento nas cinco superfícies e nos módulos novos
- **Prioridade:** P0
- **Tamanho:** L  |  **Complexidade:** crítica  |  **Risco:** crítico  |  **Paralelizável:** não (consolida E03 a E07 nos módulos novos)
- **Objetivo:** provar, por varredura gerada do manifesto, que nenhuma rota dos módulos novos devolve dado de outro município, órgão ou cidadão.
- **Problema que resolve:** E04 a E07 cobrem o conjunto anterior; cada rota nova de incidentes, abrigos, logística, camadas, território, importação, chat e vídeo reabre o vazamento.
- **Origem:** PR:D-15; PR:D-16; PR:D-07; BZ-M:V2-SEC-08.
- **Estado atual:** EXPANDIR (a matriz da E03 e os cruzamentos das E04 a E06; reexecuta F29-E17, F30-E17, F31-E20, F32-E16, F33-E16 e F34-E18).
- **Dependências de entrada:** E03 a E07; G29 a G35.
- **O que deve ser implementado:**
  - Testes: `apps/api/test/varredura-de-idor.test.ts` (a criar): do manifesto (F03-E12), toda rota com `:id` das fases F29 a F35 recebe id de outro município, de outro órgão e de outro cidadão: 404 idêntico ao do inexistente; nunca 403 nem 200; exceções nominais, vazias por padrão.
  - Banco: consulta por raio, imóvel e área de risco com geometria de B enviada por A: 0 linhas; importação CSV com `organizacao_id` na coluna: recusada; configuração de A não altera a de B.
  - Superfícies: incidente, abrigo e estoque de B ausentes de contagem, busca, mapa e exportação de A; o payload offline do agente traz só o município e a equipe dele.
- **O que NÃO deve ser implementado nesta etapa:** arquivo (E07); abuso (E09); corrigir (cada achado vira `SEG-nn`).
- **Arquivos e módulos prováveis:** `apps/api/test/varredura-de-idor.test.ts` (a criar), `apps/api/src/contrato/rotas.ts`.
- **Risco de segurança:** rota nova sem recorte por município.
- **Impacto LGPD:** Não se aplica: dado sintético.
- **Migração necessária:** Não.
- **Compatibilidade:** só teste.
- **Rollback:** remover o arquivo.
- **Testes positivos:** cada usuário lê só o próprio município, órgão ou cidadão.
- **Testes negativos:** rota fora da varredura reprova; 403 em recurso alheio reprova.
- **Testes de autorização e isolamento:** coordenador de B lista incidentes de A: 0; agente de B lê abrigo de A: 404.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`; G03 a G07.
- **E2E:** Playwright em HML.
- **Validação humana:** Rafael lê a tabela.
- **Evidência a produzir:** `docs/evidencias-v2/G25/V2-F25-E20/`.
- **Documentação a atualizar:** `dc360/docs/PAPEIS_E_RESPONSABILIDADES.md`.
- **Definition of Done:** toda rota nova varrida; zero 200 ou 403 alheio.
- **Checkpoint:** Não.

### V2-F25-E21 - Pentest recorrente, SBOM e licenças como rotina
- **Prioridade:** P1
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** não (depois da E13)
- **Objetivo:** transformar o que a F25 provou uma vez em rotina com dono e gatilho: pentest anual e a cada mudança relevante, SBOM e licenças por release.
- **Problema que resolve:** pentest único envelhece no primeiro release; SBOM, licenças e Trivy (F01-E19, F01-E20) existem no CI, mas ninguém é dono de reexecutar e triar (D-19).
- **Origem:** PR:D-19; DP:T34; REL:10.
- **Estado atual:** CRIAR (política e verificação); MANTER F01-E19 e F01-E20.
- **Dependências de entrada:** E13; CP-74; CP-43.
- **O que deve ser implementado:**
  - Domínio: `dc360/docs/ROTINA-DE-SEGURANCA.md` (a criar): pentest anual (data ISO da próxima); MUDANÇA RELEVANTE: migration de papel, policy ou grant, mudança em `apps/api/src/auth`, superfície pública, tipo de arquivo, integração ou provedor novo, incidente alto; cada uma exige re-teste da área ou novo pentest, com dono e orçamento.
  - Testes: `scripts/rotina-de-seguranca.test.mjs` (a criar): pentest vencido, mudança relevante sem re-teste (`git diff` em `db/migrations`, `db/provedores` e `apps/api/src/auth`) e SBOM mais velho que a tag reprovam.
  - Infraestrutura: o release (F01-E07) gera SBOM CycloneDX e relatório de licenças e falha com licença proibida; Trivy sem crítico.
- **O que NÃO deve ser implementado nesta etapa:** contratar o fornecedor (CP-33); bug bounty; certificação.
- **Arquivos e módulos prováveis:** `dc360/docs/ROTINA-DE-SEGURANCA.md` e `dc360/scripts/rotina-de-seguranca.test.mjs` (a criar), `docs/evidencias-v2/G25/achados.md`.
- **Risco de segurança:** rotina sem dono vira falsa segurança.
- **Impacto LGPD:** Não se aplica: sem dado pessoal.
- **Migração necessária:** Não.
- **Compatibilidade:** só documento e teste.
- **Rollback:** reverter o commit.
- **Testes positivos:** pentest e SBOM em dia: o teste passa.
- **Testes negativos:** migration de policy sem re-teste registrado reprova; pentest vencido reprova.
- **Testes de autorização e isolamento:** o re-teste de mudança em policy repete E04 a E06 e E20.
- **Regressão obrigatória:** `npm run test:scripts`, `npm run auditar`; G01, G25.
- **E2E:** Não se aplica: documento e teste estático.
- **Validação humana:** Rafael confirma dono e data de cada rotina.
- **Evidência a produzir:** `docs/evidencias-v2/G25/V2-F25-E21/`.
- **Documentação a atualizar:** `dc360/README.md` (segurança).
- **Definition of Done:** política com dono e data; teste no CI.
- **Checkpoint:** CP-74 (dono e orçamento do pentest anual, do exercício anual de DR e da revisão de licenças).

# GATE G25 - SEGURANÇA PRÉ-PILOTO

Só passa se:
- [ ] V2-F25-E01: Semgrep sem ERROR e sem baseline, gitleaks sem achado fora da allowlist no histórico completo, `npm run auditar` zerado na raiz, em `apps/campo` e em `apps/cidadao`, SBOM, licenças e Trivy sem crítico arquivados. Evidência: `docs/evidencias-v2/G25/V2-F25-E01/`.
- [ ] V2-F25-E02: revisão manual completa, com veredito por linha, ataques de autenticação recusados e as decisões (teto de sessão, senha vazada, CSP) registradas. Evidência: `revisao.md` e saída do teste.
- [ ] V2-F25-E03: matriz papel x rota x método x recurso regenerada sem divergência do manifesto, inclusive a API pública. Evidência: matriz e saída do teste.
- [ ] V2-F25-E04, E05 e E06: cruzamentos de tenant, de órgão (Obras x Saúde) e de cidadão ("só o meu") provados em HML com os papéis reais de banco, sem 200 nem 403 em recurso de outro município, órgão ou cidadão. Evidência: scripts e tabela por vetor.
- [ ] V2-F25-E07: IDOR em IDs, URLs de arquivo e presign recusado em todo vetor, e URL assinada fora do log. Evidência: tabela de vetores.
- [ ] V2-F25-E08: suíte de arquivos maliciosos verde em HML, nenhum arquivo hostil chega a `ativo`, PDF recusado enquanto a F06-E14 não existir (CP-12). Evidência: tabela caso x resultado.
- [ ] V2-F25-E09: as duas camadas de limite provadas (429, duas máquinas, reinício) e o abuso medido registrado. Evidência: contagens e 429.
- [ ] V2-F25-E10 (P1): baseline do ZAP triada, sem Alto ou Médio aberto, e cabeçalhos no `vercel.json`. Evidência: relatórios do ZAP.
- [ ] V2-F25-E11 (P2): propriedades verdes, ou adiadas com dono e data e com o que fica sem prova declarado. Evidência: saída e seeds.
- [ ] V2-F25-E12 e CP-33: pentest externo executado em HML sobre o escopo decidido, todo achado crítico e alto corrigido e médio corrigido ou aceito por escrito. Adiar o CP-33 adia este gate inteiro (E12 e E13 são P0). Evidência: escopo, resumo executivo e hash do relatório completo.
- [ ] V2-F25-E13: re-teste confirma as correções; relatório pré-piloto com cobertura por capítulo do ASVS 4.0 nível 2, por salvaguarda do CIS IG1 e limites escritos; `scripts/registro-de-achados.test.mjs` verde (zero crítico ou alto aberto e nenhum aceite vencido).
- [ ] V2-F25-E14 (P0): revisão por função de `pessoas`, do login em dois passos, da escolha e da troca de município, com ataques recusados (desafio reusado, `sid` revogado, MFA vencido) e `dc360_app` sem grant em `pessoas`; CP-49 decidido ou a pessoa em mais de um município fica desligada em produção. Evidência: `revisao.md` e saída.
- [ ] V2-F25-E15 (P0): sessão de suporte só lê (nenhuma rota de escrita, 42501 no banco), expira e revoga no banco, grava a leitura na trilha do município; CP-30 decidido ou suporte desligado. Evidência: tabela rota x resposta.
- [ ] V2-F25-E16 (P0): todo destino de rede de saída em lista, sem SSRF, retorno de provedor e webhooks autenticados e sem repetição, segredo fora de log; provedor real só com CP-41. Evidência: inventário de destinos e saída.
- [ ] V2-F25-E17 (P0): zero CPF em claro fora da rota nominal (log, erro, trilha, CSV, pacote, busca, agente, push, e-mail, tracing, `pg_dump`); chaves rotacionadas sem perder dado; CPF real só com CP-46. Evidência: tabela saída x resultado, sem CPF.
- [ ] V2-F25-E18 (P0): suíte de vídeo e de chat verde em HML, nenhum vídeo hostil `ativo`, `ffmpeg` sem rede nem segredo, 429 no excesso; `video_cidadao` em produção atrás do CP-47. Evidência: tabela caso x resultado.
- [ ] V2-F25-E19 (P1): zero sentinela em span, métrica e log de tracing, destino fixo por ambiente e SLO que queima e alerta; ligar em produção atrás do CP-60. Evidência: spans redigidos e saída.
- [ ] V2-F25-E20 (P0): varredura gerada do manifesto cobre toda rota com `:id` das fases F29 a F35, com 404 idêntico ao inexistente, e as cinco superfícies repetem os vetores dos módulos novos. Evidência: tabela rota x resultado.
- [ ] V2-F25-E21 (P1) e CP-74: política de pentest anual e por mudança relevante, SBOM e licenças por release, com dono e data ISO, e `scripts/rotina-de-seguranca.test.mjs` verde. Evidência: política e saída.
- [ ] `npm run test:isolamento`, `npm run test:api`, `npm run test:console`, `npm run test:scripts`, `npm run auditar` e `npm run typecheck` verdes.
- [ ] nenhuma regressão: gates G00 a G24 e G29 a G35 continuam verdes (se um quebrar, ESTE gate volta a REPROVADO).
- [ ] documentação atualizada e evidências arquivadas em `docs/evidencias-v2/G25/` (registro `achados.md`, relatório de segurança, escopo do pentest).

**Reabre se:** achado crítico ou alto novo (pentest, varredura ou incidente); mudança de papel de banco, de policy ou de grant sem repetir E04 a E06; rota nova sem entrada no manifesto; função SECURITY DEFINER nova sem revisão; superfície pública nova (rota, tipo de arquivo, app) sem repetir E03, E07 e E10; integração, provedor, tipo de arquivo ou módulo novo sem repetir E16, E18 e E20; mudança de papel, policy ou grant sem o re-teste da E21; destino de tracing novo sem repetir E19; dependência de runtime com advisory aberto.
**Este Gate libera:** F26 (POC controlada) e a consolidação de segurança da F28-E01 (e a rotina recorrente que a F28 entrega à operação). NÃO libera sozinho a abertura pública do App do Cidadão nem o beta externo: também exigem CP-11, CP-26 e CP-28 (e o G17 para o app).
