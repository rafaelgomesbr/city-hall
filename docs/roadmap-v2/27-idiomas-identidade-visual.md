# Fase 35: Idiomas, VLibras e identidade visual por município

**Gate da fase:** G35 IDIOMAS, VLIBRAS E IDENTIDADE POR MUNICÍPIO | **Depende dos gates:** todos os anteriores na ordem de execução de `STATUS.md`, seção 5: G00 a G08, G32, G09 a G14, G33, G15 a G18, G34, G19, G29, G30 e G31 (a F35 traduz e veste as telas das fases novas, por isso vem depois delas) | **Superfícies tocadas:** `apps/web`, `apps/portal`, `apps/campo`, `apps/cidadao`, `apps/console` (só os textos atuais e a restauração do tema), `apps/api`, `db`, `packages/i18n`, `packages/design-tokens`, `packages/shared` | **Checkpoints da fase:** CP-45, CP-73, CP-95

Esta fase entrega D-11 e D-12 sobre a infraestrutura da F08: tradução completa e revisada em pt-BR, en e es de todas as telas das cinco superfícies (inclusive as das fases F29 a F34), formatação de data e número no idioma e no fuso certos, idioma do e-mail e do push, VLibras nas telas web e nos apps, e identidade por município (logotipo, nome de exibição e UMA cor de destaque) com validação de contraste AA na gravação e retorno ao tema DC360 se algo falhar. A identidade aparece no painel, no portal, nos dois apps e no cabeçalho dos documentos oficiais, sem tocar o conteúdo jurídico.

MANTER: `packages/i18n` e `pendentes.json` (F08-E08, que esta fase zera), `derivarTemaDoMunicipio` e a lista fechada de cinco tokens (F08-E10 e E11), o ponto do VLibras (F08-E12), o documento emitido imutável (F09: a identidade usada é congelada no snapshot e a reimpressão serve o PDF guardado) e a cadeia de arquivos (F06). Decisões desta fase: o documento oficial permanece em pt-BR (tradução de texto com efeito jurídico exigiria parecer; a F08-E09 cita documentos oficiais como assunto da F35: divergência registrada na E01); a mensagem livre escrita por pessoa (nota, mensagem ao cidadão, descrição) não é traduzida; os clientes traduzem o erro da API pelo `codigo` e o `mensagem` do servidor fica em pt-BR.

NÃO faz: tema por secretaria, tema completo editável (segunda cor, fonte, raio), Libras em vídeo, tradução automática em tempo de execução por serviço de terceiro, tradução juramentada, idiomas além de en e es, SVG de logotipo (recusado nesta fase) e tela nova do console (a F20 nasce com chaves de catálogo); o proibido está em `docs/roadmap-v2/21-fora-da-v2.md`. Decisão humana vira CP-NOVO: VLIBRAS (como integrar e se o script do governo pode carregar), REVISAO-DA-TRADUCAO (quem revisa en e es) e TERMO-DO-LOGOTIPO (declaração de uso da imagem).

Portão visual (`19-definicao-de-pronto.md`, seção 0) e portão da F08-E13 em toda etapa de tela, com capturas nos TRÊS idiomas, claro e escuro, e fotos do aparelho nos apps. Ordem sugerida: E01; E02 e E03; E04 depois de ambas; E05 a E08 em paralelo (arquivos disjuntos); E09 antes de E10 e E11; E12 depois do CP-45; E13 por último entre as telas; E14 fecha.

## Etapas

### V2-F35-E01 - ADR de idiomas e identidade por município: escopo, resolução e limites
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (E02 a E14 citam a ADR)
- **Objetivo:** fixar o que o município pode configurar, como se resolve o idioma e o que fica fora, antes de qualquer migration.
- **Problema que resolve:** sem escopo escrito, a cor virou tema completo, o logotipo virou SVG com script e a tradução entrou em documento jurídico.
- **Origem:** PR:D-11; PR:D-12; DP:T17; DP:K19; DP:K20.
- **Estado atual:** CRIAR a ADR (a F08-E07 já descreve a linguagem visual; a F08-E09 cita documentos oficiais como assunto da F35).
- **Dependências de entrada:** G08; G34.
- **O que deve ser implementado:**
  - Arquivos: ADR em `docs/adr/` (número: o próximo livre, conferido com `ls docs/adr`): identidade é por município e só tem nome de exibição, logotipo e uma cor; nunca por secretaria; cor reprovada em AA nos dois modos é recusada na gravação e o fallback é o DC360; idioma efetivo = usuário, depois município, depois pt-BR (cidadão: escolha no app, depois aparelho, depois pt-BR); documento oficial em pt-BR; SVG recusado; Libras só por VLibras, só no clique e fora de telas com dado.
  - Arquivos: tabela de superfícies x o que recebe (nome, logotipo, cor, idioma, VLibras); registro da divergência com a F08-E09.
- **O que NÃO deve ser implementado nesta etapa:** colunas, rotas e telas (E02 em diante); texto de termo (CP-95).
- **Arquivos e módulos prováveis:** `docs/adr/` (nova ADR, a criar), `dc360/docs/DESIGN-SYSTEM.md`.
- **Risco de segurança:** escopo frouxo abre superfície (SVG, tema livre).
- **Impacto LGPD:** Não se aplica: identidade institucional.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: documento.
- **Rollback:** substituir a ADR.
- **Testes positivos:** `npm test` aceita o arquivo (`regras-de-conteudo.test.ts`).
- **Testes negativos:** travessão ou norma fora da lista reprova; ADR que admita tema por secretaria reprova no checklist de Rafael.
- **Testes de autorização e isolamento:** Não se aplica: documento.
- **Regressão obrigatória:** `npm test`; G08, G34.
- **E2E:** Não se aplica: documento.
- **Validação humana:** Rafael aprova antes da E02.
- **Evidência a produzir:** `docs/evidencias-v2/G35/V2-F35-E01/`.
- **Documentação a atualizar:** `dc360/docs/DESIGN-SYSTEM.md`.
- **Definition of Done:** ADR aceita e citada pelas etapas seguintes.
- **Checkpoint:** Não.

### V2-F35-E02 - Identidade do município: colunas, API e validação AA na gravação
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (E03 a E08 dependem)
- **Objetivo:** gravar nome de exibição e cor do município só se a cor passar em AA nos dois modos, guardando o tema derivado.
- **Problema que resolve:** a F08-E10 prova a função pura, mas nada a chama e as telas não têm de onde ler.
- **Origem:** PR:D-11; DP:T17; DP:K19.
- **Estado atual:** EXPANDIR `organizacoes` e `apps/api/src/rotas/administracao.ts`; CRIAR a rota de identidade.
- **Dependências de entrada:** E01; F08-E10; F08-E11.
- **O que deve ser implementado:**
  - Migration: `organizacoes.nome_de_exibicao` (3 a 80 caracteres, sem marcação), `cor_de_destaque` (`^#[0-9A-Fa-f]{6}$`), `tema_derivado` (jsonb claro e escuro), `tema_formula_versao` e `logotipo_arquivo_id` (FK composta, E03); CHECK: cor, derivado e versão juntos.
  - API: `GET /v1/organizacao/identidade` (qualquer papel do município; devolve `IdentidadeDoMunicipio` da F08-E11) e `PUT /v1/organizacao/identidade` `{ nomeDeExibicao?, corDeDestaque?, restaurar? }` (`exigirPermissao("gerenciar_organizacao")` antes do banco; trilha antes e depois); chama `derivarTemaDoMunicipio` NA ESCRITA: reprovou, 422 `contraste_insuficiente` com `motivos`; fórmula de versão antiga: recalcula na leitura e, se reprovar, devolve o DC360.
  - Testes: a lista de colunas do console (F15-E13) ganha as novas, sem leitura.
- **O que NÃO deve ser implementado nesta etapa:** logotipo (E03); tela (E04); idioma (E09); segunda cor.
- **Arquivos e módulos prováveis:** `db/migrations/`, `apps/api/src/rotas/administracao.ts`, `packages/design-tokens/src/municipio.ts` (F08-E10), `apps/api/test/identidade-do-municipio.test.ts` (a criar).
- **Risco de segurança:** cor vira CSS no cliente: só hexadecimal validado.
- **Impacto LGPD:** Não se aplica: dado institucional.
- **Migração necessária:** Sim (`NNN_identidade_do_municipio.sql`, hoje 047).
- **Compatibilidade:** colunas nulas valem o tema DC360.
- **Rollback:** `restaurar: true` ou migration inversa.
- **Testes positivos:** cor aceita grava e devolve o derivado.
- **Testes negativos:** amarelo vivo: 422 com a razão; cor boa só no claro: 422; `rgb(0,0,0)`: 422; coluna de cor em `orgaos` reprova o catálogo.
- **Testes de autorização e isolamento:** coordenador grava: 403; administrador de A grava a identidade de B: 404; o console não lê as colunas.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`, `npm run test:console`; G08.
- **E2E:** `npm run test:e2e:api`: gravar, ler e recusar.
- **Validação humana:** Rafael lê as razões de recusa.
- **Evidência a produzir:** `docs/evidencias-v2/G35/V2-F35-E02/`: testes.
- **Documentação a atualizar:** `docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** cor reprovada nunca é gravada; fallback DC360 provado.
- **Checkpoint:** Não.

### V2-F35-E03 - Logotipo pela cadeia de arquivos: tipos, SVG recusado, tamanho e derivado
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com E02, até a FK)
- **Objetivo:** o administrador envia o logotipo pela cadeia de arquivos e a API serve um derivado seguro.
- **Problema que resolve:** imagem de usuário é entrada hostil; SVG executa script e carrega recurso externo.
- **Origem:** PR:D-11; DP:T25; BZ-D:UPL-14.
- **Estado atual:** CRIAR a classe `logotipo_do_municipio`; MANTER a cadeia (F06-E04 a E07).
- **Dependências de entrada:** E02; F06-E05; F06-E07.
- **O que deve ser implementado:**
  - Banco: classe nova em `arquivos.classe` e em `limites_de_arquivo`: PNG e JPEG, 1 MB, 64 a 2048 px por lado, proporção até 4:1, um `ativo` por município; emenda à ADR 0011.
  - API: `POST /v1/organizacao/identidade/logotipo/autorizar` e `/confirmar` (`gerenciar_organizacao`); bytes conferidos (F06-E05); SVG recusado `tipo_nao_permitido`; `recodificar.ts` gera PNG de 512 px sem EXIF e sem perfil, mantendo transparência; só `ativo` vira `logotipo_arquivo_id`; a troca guarda a versão anterior por evento.
  - API: `GET /v1/organizacao/identidade/logotipo` serve o derivado (`nosniff`, `image/png`, `ETag`) a qualquer papel do município.
- **O que NÃO deve ser implementado nesta etapa:** SVG saneado (etapa futura, com parecer); tela (E04); URL para o cidadão (E07).
- **Arquivos e módulos prováveis:** `db/migrations/`, `apps/api/src/arquivos/` (F06-E04), `apps/api/src/rotas/administracao.ts`, `apps/api/test/logotipo-do-municipio.test.ts` (a criar).
- **Risco de segurança:** polyglot, bomba de pixels e imagem com marcador de execução.
- **Impacto LGPD:** Não se aplica: imagem institucional; declaração de uso em CP-95.
- **Migração necessária:** Sim (`NNN_classe_logotipo.sql`, hoje 047).
- **Compatibilidade:** sem logotipo, o brasão textual DC.
- **Rollback:** restaurar a identidade.
- **Testes positivos:** PNG sintético de 400 px vira `ativo` e é servido; JPEG com EXIF sai sem ele.
- **Testes negativos:** SVG com `<script>` e SVG limpo: 422; PNG de 2 MB: 422; 5000 por 5000: `dimensoes_excessivas`; PNG com ZIP anexado: derivado limpo.
- **Testes de autorização e isolamento:** logotipo de A pedido por B: 404; coordenador envia: 403.
- **Regressão obrigatória:** `npm run test:api` (`prova-fotografica.test.ts`), `npm run test:isolamento`; G06.
- **E2E:** `npm run test:e2e:api`: enviar e ler o logotipo.
- **Validação humana:** Rafael envia um brasão sintético e um SVG.
- **Evidência a produzir:** `docs/evidencias-v2/G35/V2-F35-E03/`.
- **Documentação a atualizar:** `docs/ARMAZENAMENTO.md`.
- **Definition of Done:** só PNG e JPEG chegam a `ativo`, sempre recodificados.
- **Checkpoint:** CP-95 (declaração de uso da imagem; bloqueia logotipo de município real).

### V2-F35-E04 - Painel: tela Identidade do município com prévia e prova de contraste
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (depende de E02 e E03)
- **Objetivo:** o administrador define nome, cor e logotipo, vê a prévia nos dois modos e lê o motivo se a cor for recusada.
- **Problema que resolve:** sem tela, a identidade só se configura por API.
- **Origem:** PR:D-11; DP:T17; DP:T29.
- **Estado atual:** CRIAR `Identidade.tsx`; EXPANDIR `App.tsx` e `Organizacao.tsx` (link).
- **Dependências de entrada:** E02; E03; F08-E13.
- **O que deve ser implementado:**
  - Frontend: página "Identidade do município" atrás de `<Exige acao="gerenciar_organizacao">`: "Nome que aparece no cabeçalho" (exemplo: Defesa Civil de Serra Alta), "Cor de destaque (6 dígitos com #)", "Logotipo (PNG ou JPEG, até 1 MB)"; prévia do cabeçalho e de um botão em claro e escuro; resultado do contraste com ícone e texto, nunca só cor; recusa do servidor com a razão e o mínimo; "Voltar ao padrão DC360" com `ConfirmarAcao`.
  - Frontend: `repositorio.ts`, `http.ts` e `local.ts`: o modo local mostra a prévia e recusa gravar, explicando.
  - Acessibilidade: foco no erro e rótulo por campo.
- **O que NÃO deve ser implementado nesta etapa:** segunda cor, fonte, raio; idioma (E09); aplicar no cabeçalho (E05).
- **Arquivos e módulos prováveis:** `apps/web/src/paginas/Identidade.tsx` (a criar), `apps/web/src/App.tsx`, `apps/web/src/dados/http.ts`, `local.ts`, `repositorio.ts`.
- **Risco de segurança:** a prévia usa valor não validado; o servidor decide.
- **Impacto LGPD:** Não se aplica: dado institucional.
- **Migração necessária:** Não.
- **Compatibilidade:** sem a tela, o tema segue DC360.
- **Rollback:** esconder a rota.
- **Testes positivos:** cor aceita grava e a prévia muda; logotipo enviado aparece.
- **Testes negativos:** cor recusada mostra a razão ("no modo escuro o botão fica com 3,2 para 1; o mínimo é 4,5"); SVG: mensagem que diz o que enviar.
- **Testes de autorização e isolamento:** coordenador abre a rota: aviso de perfil, sem formulário.
- **Regressão obrigatória:** `npm test --workspace @dc360/web`, `npm run test:e2e`; G10.
- **E2E:** `fluxo-api.e2e.mjs`: gravar, recusar e restaurar; capturas nos três idiomas, claro e escuro.
- **Validação humana:** Alyson; portões visuais (`19-definicao-de-pronto.md`, seção 0; F08-E13).
- **Evidência a produzir:** `docs/evidencias-v2/G35/V2-F35-E04/`: capturas e `INDEX.md`.
- **Documentação a atualizar:** `docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** identidade configurável com prévia e razão de recusa legível.
- **Checkpoint:** Não.

### V2-F35-E05 - Identidade no painel e no portal: cabeçalho, tema e troca de município
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E06 a E08)
- **Objetivo:** painel e portal mostram o nome, o logotipo e a cor do município real, e trocam junto com o município ativo.
- **Problema que resolve:** o tema da F08-E11 e a moldura da F11-E07 usam fixture; faltam os dados reais.
- **Origem:** PR:D-11; DP:T17; DP:T16.
- **Estado atual:** EXPANDIR `Estrutura.tsx` do painel e a moldura do portal (F11-E07).
- **Dependências de entrada:** E02; E03; F08-E11; F11-E07; F11-E23.
- **O que deve ser implementado:**
  - Frontend: após o login, `GET /v1/organizacao/identidade` alimenta os cinco tokens de destaque no `<html>`, o nome no cabeçalho e o logotipo em `<img>` com `alt` igual ao nome; logotipo que falha cai no brasão textual; a aba leva o nome do município; entrada e sem município: DC360.
  - Frontend: no portal, trocar o município ativo (F11-E23) troca a identidade sem recarregar; cache por município.
  - Testes: `tema-do-municipio.test.ts` (F08-E11) ganha o caso com API; o portal tem o equivalente.
- **O que NÃO deve ser implementado nesta etapa:** tema por secretaria; outro token além dos cinco; idioma (E09).
- **Arquivos e módulos prováveis:** `apps/web/src/componentes/Estrutura.tsx`, `apps/web/src/estado/sessao.tsx`, `apps/web/src/seo/titulo.ts`, `apps/portal/src/estrutura/` (a criar na F11-E02).
- **Risco de segurança:** logotipo de outro município no cache.
- **Impacto LGPD:** Não se aplica: dado institucional.
- **Migração necessária:** Não.
- **Compatibilidade:** sem identidade, o DC360 de hoje.
- **Rollback:** ignorar a resposta e manter o DC360.
- **Testes positivos:** identidade de Serra Alta aplica cor e logotipo; a troca para Vale Fundo troca os dois.
- **Testes negativos:** logotipo com erro mostra o brasão textual; `--ds-danger` sobrescrito reprova; cor recusada nunca renderiza.
- **Testes de autorização e isolamento:** o cabeçalho de A nunca mostra o logotipo de B; recarregar com token de B não usa o cache de A.
- **Regressão obrigatória:** `npm test --workspace @dc360/web`, `npm run test:scripts`, `npm run test:e2e`; G10, G11.
- **E2E:** `fluxo-api.e2e.mjs` e `navegacao.e2e.mjs` do portal, dois municípios; capturas nos três idiomas, claro e escuro.
- **Validação humana:** Rafael vê os dois municípios; portões visuais (`19-definicao-de-pronto.md`, seção 0; F08-E13).
- **Evidência a produzir:** `docs/evidencias-v2/G35/V2-F35-E05/`: capturas.
- **Documentação a atualizar:** `dc360/docs/DESIGN-SYSTEM.md`.
- **Definition of Done:** identidade real aplicada e isolada.
- **Checkpoint:** Não.

### V2-F35-E06 - Identidade no app de campo: tema, logotipo e cache offline
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E05, E07 e E08)
- **Objetivo:** o app do agente mostra a identidade do município dele, inclusive sem sinal.
- **Problema que resolve:** `temaComMunicipio` (F08-E11) existe sem dado; o app abre offline e não pode ficar sem logotipo.
- **Origem:** PR:D-11; DP:T17.
- **Estado atual:** EXPANDIR `apps/campo/src/ui/tokens.ts` e `src/dados/sessao.tsx`.
- **Dependências de entrada:** E02; E03; F08-E11.
- **O que deve ser implementado:**
  - Mobile: depois do login e a cada 24 h com rede, lê `GET /v1/organizacao/identidade` (qualquer papel) e guarda tema e logotipo no armazenamento do app; `temaComMunicipio` aplica só os campos de destaque com o valor derivado pelo servidor; cabeçalho de `(agente)/index.tsx` com nome e logotipo.
  - Mobile: sair ou trocar de município limpa o cache de identidade (nunca a fila de prova: `logout-nao-apaga-prova.test.ts`).
  - Acessibilidade: logotipo com rótulo igual ao nome; toque de 44 pt e 48 dp.
- **O que NÃO deve ser implementado nesta etapa:** o app importar `derivarTemaDoMunicipio` em execução; tema por equipe; idioma (E09).
- **Arquivos e módulos prováveis:** `apps/campo/src/ui/tokens.ts`, `apps/campo/src/dados/sessao.tsx`, `apps/campo/src/dados/identidade.ts` (a criar), `apps/campo/src/app/(agente)/index.tsx`.
- **Risco de segurança:** cache de identidade de outro município; limpo no logout.
- **Impacto LGPD:** Não se aplica: dado institucional.
- **Migração necessária:** Não.
- **Compatibilidade:** sem identidade em cache, o DC360.
- **Rollback:** ignorar a identidade.
- **Testes positivos:** sem rede, o app abre com o logotipo guardado; a cor de prova resolve os mesmos valores do painel.
- **Testes negativos:** resposta com cor recusada: DC360; logotipo corrompido: brasão textual; sair limpa o cache e preserva a fila.
- **Testes de autorização e isolamento:** agente do município B no mesmo aparelho não vê a identidade de A.
- **Regressão obrigatória:** `npm run test:campo`, `npm run test:scripts` (paridade de tokens), `npm run typecheck`; G14.
- **E2E:** abrir o app de HML em modo avião com a identidade em cache.
- **Validação humana:** Rafael no aparelho físico; portões visuais (`19-definicao-de-pronto.md`, seção 0; F08-E13).
- **Evidência a produzir:** `docs/evidencias-v2/G35/V2-F35-E06/`: fotos do aparelho e `INDEX.md`.
- **Documentação a atualizar:** `apps/campo/LEIA-ME.md`.
- **Definition of Done:** identidade aplicada, offline e isolada.
- **Checkpoint:** Não.

### V2-F35-E07 - Identidade no app do cidadão: município resolvido, protocolo e acompanhamento
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com E05, E06 e E08)
- **Objetivo:** o cidadão vê nome e logotipo da Defesa Civil que recebe o relato, sem lista pública de municípios.
- **Problema que resolve:** só o servidor conhece o município, depois da resolução por PostGIS; a identidade viaja nessa resposta sem criar oráculo.
- **Origem:** PR:D-11; DP:T20; DP:T17.
- **Estado atual:** EXPANDIR a resposta da F16-E05, o contrato da F16-E09 e as telas da F17-E06, E09 e E10.
- **Dependências de entrada:** E02; E03; F16-E05; F16-E09; F17-E09.
- **O que deve ser implementado:**
  - API: `unico` e `confirmar` (F16-E05) levam `identidade` (nome, tema, URL assinada curta do logotipo) só de município habilitado; `nao_habilitado` segue uniforme; a leitura do relato (F16-E09) ganha `municipio` por emenda explícita e testada ao `.strict()` (regra única na F16-E09).
  - Mobile: o tema vale da confirmação do local ao detalhe do relato; antes do login, DC360; a confirmação diz "Seu relato vai para a Defesa Civil de Serra Alta".
- **O que NÃO deve ser implementado nesta etapa:** lista de municípios; escolher município no app; identidade antes do login.
- **Arquivos e módulos prováveis:** `apps/api/src/relatos/criacao.ts` (F16-E05), `packages/shared/src/relato.ts`, `apps/cidadao/src/relato/` (F17-E06).
- **Risco de segurança:** distinguir município inexistente de desligado pela identidade.
- **Impacto LGPD:** Não se aplica: dado institucional.
- **Migração necessária:** Não.
- **Compatibilidade:** app antigo ignora a chave nova (lista de inclusão).
- **Rollback:** remover a chave da resposta.
- **Testes positivos:** local em município habilitado traz nome, tema e logotipo; o detalhe do relato de B mostra a identidade de B.
- **Testes negativos:** `nao_habilitado` idêntico para município inexistente e desligado; URL do logotipo vencida: brasão textual.
- **Testes de autorização e isolamento:** cidadão A não lê a identidade do relato do B; a URL de B não serve ao token de A.
- **Regressão obrigatória:** `npm run test:api` (`relato-do-cidadao-contrato.test.ts`), `npm run test:cidadao`, `npm run test:isolamento`; G17.
- **E2E:** relato em dois municípios no HML; capturas nos três idiomas.
- **Validação humana:** Rafael e Alyson no aparelho; portões visuais (`19-definicao-de-pronto.md`, seção 0; F08-E13).
- **Evidência a produzir:** `docs/evidencias-v2/G35/V2-F35-E07/`: testes e fotos.
- **Documentação a atualizar:** ADR 0016.
- **Definition of Done:** identidade só após a resolução, sem oráculo.
- **Checkpoint:** Não.

### V2-F35-E08 - Documentos oficiais: cabeçalho com logotipo e nome, congelado no snapshot
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com E05 a E07)
- **Objetivo:** laudo, termos e ofício saem com o logotipo e o nome do município no cabeçalho, sem mudar uma palavra do conteúdo jurídico.
- **Problema que resolve:** o cabeçalho é o brasão textual "DC" (`folha.ts`, `.brasao`) e o documento emitido é imutável.
- **Origem:** PR:D-11; DP:T26; DP:T17.
- **Estado atual:** EXPANDIR `Cabecalho` e `montarFolha` em `apps/api/src/documentos/folha.ts`.
- **Dependências de entrada:** E02; E03; F09-E04; F09-E10; F07-E05.
- **O que deve ser implementado:**
  - API: `Cabecalho` ganha `identidade` (nome e logotipo em data URI, sem rede no Chromium); sem logotipo vale o brasão "DC"; `laudo.ts`, `folha.ts` e `oficios/documento.ts` usam o mesmo cabeçalho; o `alt` é o nome.
  - Domínio: o snapshot (F09-E04) congela `identidade` (nome e SHA-256 do logotipo) e o modelo sobe de versão; só o cabeçalho muda e a cor `--marca` do documento fica a do DC360.
- **O que NÃO deve ser implementado nesta etapa:** tradução do documento; cor do município no papel; assinatura ou QR.
- **Arquivos e módulos prováveis:** `apps/api/src/documentos/folha.ts`, `laudo.ts`, `apps/api/src/oficios/documento.ts`, `apps/api/test/cabecalho-do-municipio.test.ts` (a criar).
- **Risco de segurança:** imagem no PDF decodificada pelo Chromium: só o derivado recodificado da E03.
- **Impacto LGPD:** Não se aplica: dado institucional.
- **Migração necessária:** Não.
- **Compatibilidade:** documento emitido antes segue servido pelo PDF guardado.
- **Rollback:** voltar ao modelo anterior.
- **Testes positivos:** laudo de teste traz logotipo e nome; o HTML sem `<header>` é idêntico, byte a byte, ao da versão anterior.
- **Testes negativos:** trocar o logotipo não muda PDF nem hash de documento emitido; sem logotipo: brasão "DC"; nome com marcação é escapado.
- **Testes de autorização e isolamento:** documento de A nunca leva o logotipo de B.
- **Regressão obrigatória:** `npm run test:api` (documentos, `modelo-versionado.test.ts`), `npm run test:isolamento`; G09.
- **E2E:** `npm run test:e2e:api`: emitir, trocar o logotipo e reimprimir.
- **Validação humana:** Alyson compara o laudo antigo e o novo; portões visuais (`19-definicao-de-pronto.md`, seção 0; F08-E13).
- **Evidência a produzir:** `docs/evidencias-v2/G35/V2-F35-E08/`: PDFs e diff do HTML.
- **Documentação a atualizar:** `docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** cabeçalho com identidade, conteúdo jurídico idêntico, emitido imutável.
- **Checkpoint:** Não.

### V2-F35-E09 - Idioma: preferência por usuário, município, aparelho e cidadão
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (E10 e E11 usam a resolução)
- **Objetivo:** cada pessoa escolhe pt-BR, en ou es e o servidor resolve o idioma efetivo: usuário, depois município, depois pt-BR.
- **Problema que resolve:** o portal guarda a escolha só em `localStorage` (F11-E27); e-mail e push não sabem o idioma.
- **Origem:** PR:D-12; DP:K20; DP:T28.
- **Estado atual:** EXPANDIR `apps/api/src/rotas/usuarios-eu.ts`, `aparelhos.ts` e o seletor do portal (F11-E27).
- **Dependências de entrada:** E01; F08-E08; F08-E09; F11-E27; F15-E02.
- **O que deve ser implementado:**
  - Migration: `pessoas.idioma` (F03-E15; nulo, `pt-BR`, `en` ou `es`), `organizacoes.idioma_padrao` (padrão `pt-BR`), `aparelhos.idioma` e `cidadaos.idioma`.
  - Domínio: `packages/i18n/src/idioma.ts` (a criar): `resolverIdioma` com a ordem da ADR; idioma fora da lista cai em pt-BR.
  - API: `PUT /v1/usuarios/eu/idioma` (só o próprio), `PUT /v1/organizacao/idioma` (`gerenciar_organizacao`, trilha), `PUT /v1/cidadao/eu/idioma`; `GET /v1/usuarios/eu` devolve o idioma efetivo; o registro do aparelho leva o idioma.
  - Frontend e mobile: seletor com cada idioma na própria língua em "Minha conta" (painel, portal, campo, cidadão) e idioma padrão em `Identidade.tsx`; `<html lang>` acompanha; o servidor é a fonte e `localStorage` só o cache.
- **O que NÃO deve ser implementado nesta etapa:** tradução das telas (E11); e-mail e push (E10).
- **Arquivos e módulos prováveis:** `db/migrations/`, `packages/i18n/src/idioma.ts`, `apps/api/src/rotas/usuarios-eu.ts`, `aparelhos.ts`, `apps/web/src/paginas/MinhaConta.tsx`, `apps/campo/src/app/(agente)/perfil.tsx`.
- **Risco de segurança:** idioma de outro usuário alterado por parâmetro; só o token decide.
- **Impacto LGPD:** preferência de idioma, `pessoal` no manifesto.
- **Migração necessária:** Sim (`NNN_idioma_do_usuario.sql`, hoje 047).
- **Compatibilidade:** coluna nula vale o padrão do município.
- **Rollback:** migration inversa.
- **Testes positivos:** usuário en e município es: efetivo en; sem preferência: es; sem nada: pt-BR.
- **Testes negativos:** `fr`: 422; `PUT` com `usuarioId` no corpo: ignorado; token expirado: 401.
- **Testes de autorização e isolamento:** coordenador troca o padrão do município: 403; administrador de A altera o de B: 404.
- **Regressão obrigatória:** `npm run test:api`, `npm run test:isolamento`, `npm run test:campo`; G08, G11.
- **E2E:** trocar para en no painel e ver `lang` e datas, com capturas.
- **Validação humana:** Rafael troca nos quatro apps; portões visuais (`19-definicao-de-pronto.md`, seção 0; F08-E13).
- **Evidência a produzir:** `docs/evidencias-v2/G35/V2-F35-E09/`.
- **Documentação a atualizar:** `docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** idioma efetivo resolvido no servidor e persistido.
- **Checkpoint:** Não.

### V2-F35-E10 - E-mail, SMS e push nos três idiomas
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (depende da E09)
- **Objetivo:** e-mail, SMS e push saem no idioma de quem recebe, sem trazer dado de ocorrência na vitrine.
- **Problema que resolve:** `notificador.ts` e `push/mensagem.ts` têm texto fixo em português; o código do cidadão sai antes de a conta existir.
- **Origem:** PR:D-12; DP:K20; DP:T31.
- **Estado atual:** EXPANDIR `apps/api/src/auth/notificador.ts` (`mensagemDeRecuperacao`) e `apps/api/src/push/mensagem.ts` (`VITRINE`).
- **Dependências de entrada:** E09; F08-E08; F15-E04; F17-E13; F34-E15.
- **O que deve ser implementado:**
  - API: as funções de mensagem (recuperação, convite, senha provisória, aviso ao órgão, código do cidadão, SMS) recebem `idioma` e leem o catálogo `email.*`; o código do cidadão usa o idioma enviado pelo app no pedido (a conta pode não existir) e, depois, o da conta.
  - API: `VITRINE` vira `Record<idioma, Record<tipo, ...>>`, ainda constante e sem interpolação; tipos de aviso novos entram com as três línguas; idioma desconhecido: pt-BR.
  - Domínio: `completude.test.ts` cobre `email.*` e `push.*`.
- **O que NÃO deve ser implementado nesta etapa:** conteúdo de ocorrência ou relato na vitrine; documento oficial; WhatsApp (F31-E07).
- **Arquivos e módulos prováveis:** `apps/api/src/auth/notificador.ts`, `apps/api/src/push/mensagem.ts`, `packages/i18n/` (chaves `email.*` e `push.*`), `apps/api/test/mensagem-de-push.test.ts` (a criar).
- **Risco de segurança:** interpolação na vitrine vazaria endereço na tela bloqueada.
- **Impacto LGPD:** a vitrine segue constante; o e-mail traz o mínimo.
- **Migração necessária:** Não (E09).
- **Compatibilidade:** sem idioma, pt-BR de hoje.
- **Rollback:** fixar pt-BR.
- **Testes positivos:** e-mail de recuperação em es e en com `lang` certo; push em en para `aparelhos.idioma` en.
- **Testes negativos:** teste de fonte reprova `${` em `VITRINE`; chave ausente em es cai em pt-BR; e-mail sem protocolo, endereço ou nome do cidadão.
- **Testes de autorização e isolamento:** aviso do relato de A nunca sai ao aparelho de B em nenhum idioma.
- **Regressão obrigatória:** `npm run test:api` (`push-*.test.ts`, `notificador.test.ts`), `npm run test:isolamento`; G15.
- **E2E:** `scripts/conferir-push.mjs` e `scripts/e2e-cidadao.mjs`: código em en recebido; captura do e-mail nos três idiomas.
- **Validação humana:** Rafael lê os três e-mails; portão visual do e-mail (`19-definicao-de-pronto.md`, seção 0).
- **Evidência a produzir:** `docs/evidencias-v2/G35/V2-F35-E10/`: capturas dos e-mails.
- **Documentação a atualizar:** `docs/LIGAR-O-EMAIL.md`, `docs/SUBPROCESSADORES.md`.
- **Definition of Done:** mensagens nos três idiomas, vitrine constante.
- **Checkpoint:** Não.

### V2-F35-E11 - Tradução completa e revisada das telas: pendentes.json vazio
- **Prioridade:** P0
- **Tamanho:** L  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (por superfície, com E12)
- **Objetivo:** toda tela das cinco superfícies, inclusive as das fases F29 a F34, existe e está revisada em pt-BR, en e es, sem chave pendente.
- **Problema que resolve:** o catálogo da F08-E08 nasceu com `pendentes.json` cheio e as fases novas acrescentaram telas.
- **Origem:** PR:D-12; DP:K20; DP:T28.
- **Estado atual:** EXPANDIR `packages/i18n/` e os textos das cinco superfícies.
- **Dependências de entrada:** E09; E10; F08-E08; CP-73.
- **O que deve ser implementado:**
  - Domínio: zerar `pendentes.json`; `completude.test.ts` exige as três línguas e o `{marcador}` em todo catálogo; `glossario.json` (a criar) fixa vistoria, interdição, protocolo e providência (traduz o rótulo, nunca o código COBRADE); `revisoes.json` (a criar) liga chave a revisor e data ISO; `revisao.test.ts` com `REVISAO_OBRIGATORIA=sim` reprova chave sem revisão.
  - Frontend e mobile: `sem-texto-fixo.test.ts` por superfície varre literais em JSX; o console atual passa a `t()`; o erro da API é traduzido pelo `codigo` e `params`.
- **O que NÃO deve ser implementado nesta etapa:** tradução do documento oficial e de mensagem livre; tradução por terceiro em execução; tela nova do console (F20).
- **Arquivos e módulos prováveis:** `packages/i18n/pendentes.json`, `completude.test.ts` (F08-E08), `apps/console/src/pagina.ts`, `apps/*/test/sem-texto-fixo.test.ts` (a criar).
- **Risco de segurança:** texto de catálogo nunca vira HTML.
- **Impacto LGPD:** Não se aplica: catálogo sem dado pessoal.
- **Migração necessária:** Não.
- **Compatibilidade:** pt-BR igual ao de hoje.
- **Rollback:** voltar chaves a `pendentes.json`.
- **Testes positivos:** `pendentes.json` vazio; cinco superfícies navegáveis nos três idiomas.
- **Testes negativos:** chave só em pt-BR, `{limite}` perdido e literal em JSX reprovam; chave sem revisão reprova no gate.
- **Testes de autorização e isolamento:** o 404 de outro município segue 404 em qualquer idioma.
- **Regressão obrigatória:** `npm test`, `npm run test:campo`, `npm run test:cidadao`, `npm run test:console`; G08, G34.
- **E2E:** roteiro por superfície nos três idiomas, sem corte nem sobreposição.
- **Validação humana:** revisor fluente e Alyson; portões visuais (`19-definicao-de-pronto.md`, seção 0; F08-E13).
- **Evidência a produzir:** `docs/evidencias-v2/G35/V2-F35-E11/`: relatório de completude e revisão.
- **Documentação a atualizar:** `dc360/docs/DESIGN-SYSTEM.md`.
- **Definition of Done:** zero pendência, toda chave revisada, nenhuma frase fixa.
- **Checkpoint:** CP-73 (quem revisa en e es, e como; bloqueia declarar a F35 concluída).

### V2-F35-E12 - VLibras nas telas web e nos apps: lista de telas, chave e CSP
- **Prioridade:** P2
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E11)
- **Objetivo:** o botão de Libras aparece só nas telas sem dado pessoal, só carrega no clique e só com a chave ligada.
- **Problema que resolve:** o script do governo envia o texto da página a terceiro; a F08-E12 deixou o ponto desligado.
- **Origem:** PR:D-12; DP:K20.
- **Estado atual:** EXPANDIR `Libras.tsx` (F08-E12) e o portal (F11-E30); CRIAR o do cidadão.
- **Dependências de entrada:** E11; F08-E12; F11-E30; CP-45.
- **O que deve ser implementado:**
  - Frontend: `telas-do-vlibras.json` (a criar) lista as rotas permitidas (início, ajuda, política, "Minha conta" sem dado de ocorrência); rota que marca `dadoPessoal` nunca entra; `VLIBRAS_ATIVO` (padrão `nao`) liga o botão; a CSP cita só o domínio do VLibras; sem clique, zero requisição externa.
  - Mobile: `apps/cidadao/src/ui/Libras.tsx` (a criar) e `apps/campo/src/ui/Libras.tsx` com o contrato do CP (WebView ou aplicativo do governo), "indisponível sem conexão", fora de login, CPF, relato e conversa.
  - Infraestrutura: aviso de 30 dias do subprocessador novo.
- **O que NÃO deve ser implementado nesta etapa:** Libras em vídeo (fora, D-12); ativar em produção sem o CP; botão em tela com dado.
- **Arquivos e módulos prováveis:** `apps/web/src/componentes/Libras.tsx`, `apps/cidadao/src/ui/Libras.tsx` (a criar), `vercel.json`, `apps/web/test/libras.test.ts`.
- **Risco de segurança:** script de terceiro em página com sessão: CSP restrita, só por clique.
- **Impacto LGPD:** o texto da página sai ao governo, só nas telas da lista.
- **Migração necessária:** Não.
- **Compatibilidade:** desligado por padrão.
- **Rollback:** `VLIBRAS_ATIVO=nao`.
- **Testes positivos:** com a chave ligada e o clique, um só script carrega e a CSP o aceita.
- **Testes negativos:** sem clique, zero requisição externa; tela `dadoPessoal` na lista reprova; sem botão em login, MFA e conversa.
- **Testes de autorização e isolamento:** o script não recebe token nem dado de município.
- **Regressão obrigatória:** `npm test`, `npm run test:cidadao`, `npm run test:campo`; G08, G11.
- **E2E:** `libras.e2e.mjs`: clique, carga única e teclado.
- **Validação humana:** Rafael ativa em HML; portões visuais (`19-definicao-de-pronto.md`, seção 0; F08-E13).
- **Evidência a produzir:** `docs/evidencias-v2/G35/V2-F35-E12/`.
- **Documentação a atualizar:** `docs/SUBPROCESSADORES.md`.
- **Definition of Done:** botão só nas telas da lista e só no clique.
- **Checkpoint:** CP-45 (como integrar e se o script pode carregar; bloqueia ativar em produção).

### V2-F35-E13 - Console: ver a identidade e restaurar o tema DC360 (suporte)
- **Prioridade:** P3
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E12)
- **Objetivo:** o fornecedor devolve ao DC360 a identidade de um município quando o logotipo ou o nome for indevido, com motivo e trilha no município.
- **Problema que resolve:** o município configura a própria marca; logotipo ofensivo ou nome enganoso à população precisa de saída sem esperar o administrador.
- **Origem:** PR:D-11; DP:T17; DP:T37.
- **Estado atual:** EXPANDIR `apps/console/src/municipios.ts` e `servidor.ts`.
- **Dependências de entrada:** E02; E03; `apps/console` atual (a F20 executa depois).
- **O que deve ser implementado:**
  - Migration: função `console_restaurar_identidade(p_org, p_motivo)` (SECURITY DEFINER, na lista nominal da F03-E08 e em `O_CONSOLE_EXECUTA`): zera nome, cor, derivado e logotipo, grava evento na trilha administrativa do município com autor "fornecedor" e `motivo_codigo` fechado (`logotipo_indevido`, `nome_enganoso`, `cor_ilegivel`, `pedido_do_municipio`).
  - API: `POST /municipios/:id/identidade/restaurar` (operador com segundo fator, como as ações perigosas do console).
  - Frontend: botão na ficha do município, com confirmação e motivo; lê só "personalizada: sim ou não", nunca a imagem.
- **O que NÃO deve ser implementado nesta etapa:** editar nome, cor ou logotipo pelo console; ler tabela do município; tela nova (F20).
- **Arquivos e módulos prováveis:** `apps/console/src/municipios.ts`, `apps/console/src/servidor.ts`, `db/migrations/`, `db/test/isolamento.test.ts`.
- **Risco de segurança:** função privilegiada que age em município pelo console: id explícito, lista nominal e MFA.
- **Impacto LGPD:** Não se aplica: dado institucional; o motivo é código.
- **Migração necessária:** Sim (`NNN_restaurar_identidade.sql`, hoje 047).
- **Compatibilidade:** console atual intacto.
- **Rollback:** migration inversa.
- **Testes positivos:** restaurar leva o município ao DC360 e o administrador vê o evento.
- **Testes negativos:** sem segundo fator: 403; motivo fora da lista: 422; município inexistente: 404.
- **Testes de autorização e isolamento:** o município B segue intacto; o console não lê as colunas de identidade; função fora da lista nominal reprova.
- **Regressão obrigatória:** `npm run test:console`, `npm run test:isolamento`; G15.
- **E2E:** `apps/console/test/ponta-a-ponta.test.ts`: restaurar e conferir o painel.
- **Validação humana:** Rafael restaura uma identidade de teste.
- **Evidência a produzir:** `docs/evidencias-v2/G35/V2-F35-E13/`: testes e capturas.
- **Documentação a atualizar:** `docs/PAPEIS_E_RESPONSABILIDADES.md`.
- **Definition of Done:** restauração com motivo, trilha e MFA.
- **Checkpoint:** Não.

### V2-F35-E14 - E2E de idiomas e identidade: cinco superfícies, três idiomas, claro e escuro
- **Prioridade:** P0
- **Tamanho:** L  |  **Complexidade:** alta  |  **Risco:** médio  |  **Paralelizável:** não (fecha a fase)
- **Objetivo:** provar de ponta a ponta, com capturas, que idioma, identidade e VLibras funcionam e não vazam entre municípios.
- **Problema que resolve:** cada etapa prova seu pedaço; o conjunto em três idiomas, dois temas e dois municípios só se vê inteiro aqui.
- **Origem:** PR:D-11; PR:D-12; PR:Fluxos.
- **Estado atual:** EXPANDIR `scripts/portao-visual.mjs` (F08-E13) e os E2E de cada superfície.
- **Dependências de entrada:** E01 a E13 (E12 e E13 se decididos).
- **O que deve ser implementado:**
  - E2E: roteiro com Serra Alta (cor aceita e logotipo) e Vale Fundo (sem identidade): configurar, recusar cor reprovada, enviar SVG (422), aplicar nos cinco lugares, emitir laudo, trocar idioma e receber e-mail e push em en e es.
  - Evidência visual: `portao-visual.mjs` nas cinco superfícies nos três idiomas, claro e escuro, estados normal, vazio, erro e carregando; aparelho físico nos dois apps; texto longo em en e es sem corte.
- **O que NÃO deve ser implementado nesta etapa:** axe-core e leitor de tela (F23); produção.
- **Arquivos e módulos prováveis:** `scripts/portao-visual.mjs` (F08-E13), `apps/web/test/fluxo-api.e2e.mjs`, `docs/evidencias-v2/G35/`.
- **Risco de segurança:** captura com dado real; só sintético.
- **Impacto LGPD:** Não se aplica: dado sintético.
- **Migração necessária:** Não.
- **Compatibilidade:** só testes.
- **Rollback:** reverter os roteiros.
- **Testes positivos:** 30 combinações de superfície, idioma e tema sem erro de alinhamento, corte ou texto fixo.
- **Testes negativos:** cor reprovada nunca renderiza; SVG recusado; `fr` cai em pt-BR; Libras sem clique: zero requisição.
- **Testes de autorização e isolamento:** nenhuma captura de Vale Fundo traz o nome ou o logotipo de Serra Alta.
- **Regressão obrigatória:** `npm run test:e2e`, `npm run test:e2e:api`, `npm run test:scripts`, `npm run test:campo`, `npm run test:cidadao`, `npm run typecheck`; G08 a G34.
- **E2E:** este é o item.
- **Validação humana:** Rafael aprova as capturas; revisor fluente lê en e es.
- **Evidência a produzir:** `docs/evidencias-v2/G35/V2-F35-E14/capturas/` com `INDEX.md` por idioma.
- **Documentação a atualizar:** `dc360/docs/DESIGN-SYSTEM.md`.
- **Definition of Done:** conjunto aprovado, sem defeito visual ou de texto.
- **Checkpoint:** Não.

# GATE G35 - IDIOMAS, VLIBRAS E IDENTIDADE POR MUNICÍPIO
Só passa se:
- [ ] ADR aceita com escopo da identidade, ordem de resolução do idioma, documento oficial em pt-BR e a divergência com a F08-E09 registrada (V2-F35-E01; evidência: hash e aceite).
- [ ] Cor de destaque gravada só se passar em AA nos dois modos, com tema derivado, versão da fórmula, fallback DC360 e nenhuma coluna de cor em `orgaos` (V2-F35-E02; evidência: `identidade-do-municipio.test.ts`).
- [ ] Logotipo só PNG ou JPEG pela cadeia de arquivos, recodificado, com SVG recusado e isolamento entre municípios (V2-F35-E03; evidência: `logotipo-do-municipio.test.ts`); CP-95 decidido, ou adiado com logotipo de município real bloqueado.
- [ ] Tela de identidade com prévia, razão de recusa e restauração (V2-F35-E04; evidência: capturas nos três idiomas, claro e escuro).
- [ ] Identidade aplicada no painel, no portal, no app de campo (inclusive offline) e no app do cidadão sem oráculo de município (V2-F35-E05 a E07; evidência: testes e capturas).
- [ ] Cabeçalho dos documentos com logotipo e nome, conteúdo jurídico idêntico e documento emitido imutável (V2-F35-E08; evidência: diff do HTML e PDFs).
- [ ] Idioma resolvido no servidor (usuário, município, pt-BR; cidadão e aparelho) e persistido (V2-F35-E09; evidência: `idioma.test.ts`).
- [ ] E-mail, SMS e push nos três idiomas, vitrine constante (V2-F35-E10; evidência: `mensagem-de-push.test.ts` e capturas dos e-mails).
- [ ] `pendentes.json` vazio, toda chave revisada, nenhum texto fixo nas cinco superfícies (V2-F35-E11, P0; evidência: relatório de completude e de revisão); CP-73 decidido.
- [ ] VLibras só nas telas da lista, só no clique e desligado por padrão (V2-F35-E12, P2; evidência: `libras.test.ts`); CP-45 decidido, ou adiado com a ativação em produção bloqueada.
- [ ] Restauração do tema DC360 pelo console com motivo, MFA e trilha (V2-F35-E13, P3; evidência: testes), ou adiada por escrito.
- [ ] E2E de idiomas e identidade aprovado, com capturas das cinco superfícies nos três idiomas, claro e escuro (V2-F35-E14; evidência: `capturas/` e `INDEX.md`).
- [ ] Portão visual: toda etapa de tela (E04 a E09, E11, E12 e E14) tem capturas e fotos do aparelho com o checklist da seção 0 de `19-definicao-de-pronto.md` preenchido e o portão da F08-E13 verde; Rafael aprovou.
- [ ] nenhuma regressão: todos os gates anteriores na ordem de execução continuam verdes (se um quebrar, ESTE gate volta a REPROVADO), com `npm run test:isolamento`, `npm run test:api`, `npm run test:campo`, `npm run test:cidadao`, `npm run test:scripts`, `npm run test:e2e`, `npm run auditar` e `npm run typecheck` verdes.
- [ ] documentação atualizada e evidências arquivadas em `docs/evidencias-v2/G35/`.

**Reabre se:** cor sem AA for gravada ou renderizada; tema por secretaria, SVG ou segunda cor entrarem; o logotipo ou a identidade de um município aparecer em outro; documento emitido mudar depois de trocar o logotipo; texto fixo ou chave pendente voltar; a vitrine do push ganhar interpolação; o VLibras carregar sem clique, em tela com dado ou sem o CP; G34 ou G08 reabrirem.
**Este Gate libera:** F20 (as telas novas do console nascem com chaves de catálogo e a restauração do tema entra na ficha do município), F21 a F25 (com os demais gates), F23 (acessibilidade valida idioma, VLibras e as cinco identidades de prova) e a POC (F26) com identidade e idiomas. NÃO libera ativar o VLibras em produção nem logotipo de município real antes dos CP-NOVO da fase.
