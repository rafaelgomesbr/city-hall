# Fase 32: PostGIS e dados territoriais

**Gate da fase:** G32 POSTGIS E DADOS TERRITORIAIS PROVADOS | **Depende dos gates:** G00 a G08 (na ordem de execução de `STATUS.md`, seção 5, a F32 é a 10ª fase: vem logo depois de G08 e ANTES de G09; D-29) | **Superfícies tocadas:** `db`, `apps/api`, `packages/shared`, `apps/web` (painel), `apps/campo` (só a leitura do contexto), `scripts`, HML | **Checkpoints da fase:** CP-44 (já registrado na seção 7B de `STATUS.md`, vem de F01-E22), CP-85, CP-86, CP-87

Objetivo: cumprir D-16 (reverte DP:T36) e ALY:GEO-02. O banco passa a ter PostGIS e o município consulta o histórico por RAIO, por IMÓVEL e por ÁREA DE RISCO, com resposta que diferencia coincidência exata de aproximada. A fase entrega também a resolução do município de um ponto por polígono (consumida pela F16), os bairros e setores que a competência do órgão usa (F04-E15, F10-E17, F10-E19) e o índice espacial que a duplicidade usa (F10-E24, F16-E07). Hoje nenhuma das 46 migrações cria a extensão (`dc360/README.md:1372`), a coordenada é `double precision` em `ocorrencias`, `vistorias` e `evidencias`, e o PGlite 0.2.17 só carrega a extensão `plpgsql` mais as de `dist/contrib`: não traz PostGIS (confirmado em `node_modules/@electric-sql/pglite`).

DECISÃO CENTRAL (ADR em E01), justificada em E01 e provada em E16: a malha municipal do IBGE é dado PÚBLICO e igual para todos, então vive numa tabela COMUM de plataforma, sem `organizacao_id`, sem GRANT à aplicação e lida só por função privilegiada que devolve identificadores; bairro, setor, área de risco e imóvel são dado DO município (`organizacao_id`, RLS ativada E FORÇADA, sem DELETE). O isolamento continua a regra número um.

MANTER: as colunas `latitude` e `longitude` (e os CHECKs de faixa, `db/test/teto-de-coordenada.test.ts`), o PGlite na suíte atual (`npm run test:isolamento`), o modo local do painel e `Mapa.tsx` com seus dois modos de mapa. Testes espaciais rodam só em Postgres real (`npm run test:espacial`, F01-E21) e a migration é condicional, como a 041: tabelas, RLS e policies nascem em todo ambiente; colunas `geography`, índices e funções espaciais só com a extensão.

A fase NÃO faz: camadas externas, WMS e Cemaden (F31), geocodificação (o produto não faz; `test/mapa-e-coordenada.ts` reprova), rota e navegação (F30), mapa offline com polígonos no aparelho (F14-E21), reprojeção entre sistemas de coordenadas, edição de geometria no mapa.

Ordem sugerida: E01, E02; E03 e E04 em paralelo; E05 depois da E03; E06 e E07 depois da E05; E08 depois da E04; E09 depois de E05, E07 e E08; E10 depois da E05; E11 depois de E08 e E09; E12 depois da E06; E13 depois de E09; E14 depois de E04, E08 e E10; E15 depois de E05 a E07; E16 fecha. Toda etapa de tela (E11, E12) passa pelo portão visual de `19-definicao-de-pronto.md`, seção 0.

## Etapas

### V2-F32-E01 - ADR do modelo territorial: camada comum x por município, convenção geográfica e PGlite sem PostGIS
- **Prioridade:** P0
- **Tamanho:** S  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** não (E02 a E16 executam o ADR)
- **Objetivo:** decidir por escrito, antes de qualquer migration, o que é dado comum e o que é dado do município, e fixar a convenção geográfica que F10, F16, F31 e F32 usam.
- **Problema que resolve:** a D-16 não diz onde mora a geometria; a F16-E05 descrevia `canal_geometria_do_municipio` (já reconciliada) como tabela de tenant lida entre municípios, o que se contradiz.
- **Origem:** PR:D-16; ALY:GEO-02; DP:T36; BZ-D:ARQ-05.
- **Estado atual:** CRIAR (nenhuma migração cria a extensão).
- **Dependências de entrada:** G08; F01-E21; F01-E22; CP-44.
- **O que deve ser implementado:**
  - Arquivos: `docs/adr/NNNN-modelo-territorial.md` (NNNN próxima livre depois da 0018, a numerar na execução) com cinco decisões: (1) malha do IBGE é tabela de plataforma, sem GRANT a `dc360_app`, só por função da lista nominal (F03-E08) e entrada `plataforma` no manifesto (F05-E04); (2) bairro, setor, área de risco e imóvel são do município, RLS forçada, sem DELETE; (3) `geography(Point,4326)` e `geography(MultiPolygon,4326)`, ordem (longitude, latitude), metros; (4) sem PostGIS: tabelas e policies existem e as rotas espaciais respondem 501 `recurso_espacial_indisponivel`; (5) quem consome o quê.
- **O que NÃO deve ser implementado nesta etapa:** SQL e rotas (E02 em diante); fonte dos dados (CPs da fase).
- **Arquivos e módulos prováveis:** `docs/adr/` (nova ADR), `dc360/README.md`.
- **Risco de segurança:** tabela comum vira leitura entre municípios; o ADR proíbe dado de município nela.
- **Impacto LGPD:** Não se aplica: decisão de desenho.
- **Migração necessária:** Não.
- **Compatibilidade:** nenhuma; só registra.
- **Rollback:** reverter o documento.
- **Testes positivos:** `npm run auditar` passa com a ADR.
- **Testes negativos:** ADR sem as cinco decisões reprova a revisão.
- **Testes de autorização e isolamento:** Não se aplica: sem código; a prova do isolamento é a E16.
- **Regressão obrigatória:** `npm run auditar`; G00 a G08.
- **E2E:** Não se aplica: documento.
- **Validação humana:** Rafael aceita a divisão comum x município.
- **Evidência a produzir:** `docs/evidencias-v2/G32/V2-F32-E01/` com hash da ADR.
- **Documentação a atualizar:** `dc360/README.md`, `CLAUDE.md` (proposta de redação).
- **Definition of Done:** ADR aceita; F10 e F16 apontam para ela.
- **Checkpoint:** CP-44 (o resto da fase só roda em HML depois da resposta do provedor).

### V2-F32-E02 - Extensão PostGIS na migration condicional, ponto geográfico e saúde espacial
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (E03 a E10 dependem)
- **Objetivo:** criar a extensão onde ela existe, a função única de ponto e uma sinalização honesta de disponibilidade, sem quebrar PGlite.
- **Problema que resolve:** o PGlite não tem PostGIS e latitude e longitude invertidas mandam o dado ao lugar errado (F16-E06 previa `ponto_do_relato` só depois da F32).
- **Origem:** PR:D-16; BZ-D:ARQ-05.
- **Estado atual:** CRIAR (modelo: migration 041).
- **Dependências de entrada:** E01; F01-E21; F01-E22.
- **O que deve ser implementado:**
  - Migration: bloco `DO` que cria `postgis` no schema da F01-E22 só se `pg_available_extensions` a lista; `ponto_geografico(p_lat, p_lng)` IMMUTABLE (`ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography`, nulo se um eixo for nulo); sem a extensão a migration passa.
  - API: `GET /saude` (F07-E07) ganha `postgis` (versão ou `ausente`); `config.ts` recusa a partida em produção sem a extensão com `EXIGE_POSTGIS=sim`; rotas espaciais respondem 501 sem ela.
  - Arquivos: `packages/shared/src/geo.ts` (a criar): `coordenadaValida` e constantes, por subcaminho neutro (F08-E05).
- **O que NÃO deve ser implementado nesta etapa:** tabelas espaciais (E03 em diante); `ponto_do_relato` (ver E14).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/config.ts`, `apps/api/src/rotas/` (saúde), `packages/shared/src/geo.ts`, `db/test/ponto-geografico.espacial.test.ts` (a criar).
- **Risco de segurança:** `spatial_ref_sys` exposta pela API do provedor (F01-E22 revoga).
- **Impacto LGPD:** Não se aplica: função pura.
- **Migração necessária:** Sim (`NNN_postgis_e_ponto_geografico.sql`, a numerar na execução).
- **Compatibilidade:** `npm run migrar -- --conferir` verde com e sem a extensão.
- **Rollback:** migration corretiva; em HML `DROP EXTENSION postgis`.
- **Testes positivos:** com PostGIS, `ponto_geografico(-22.41, -45.45)` dá longitude -45.45; sem a extensão, suíte PGlite verde.
- **Testes negativos:** latitude 95 e longitude 190 recusadas; `EXIGE_POSTGIS=sim` sem extensão derruba a partida.
- **Testes de autorização e isolamento:** `dc360_app` executando `CREATE EXTENSION`: permissão negada; `/saude` sem dado de município.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`, `npm run test:espacial`, `npm run migrar -- --conferir`; G00 a G08.
- **E2E:** Não se aplica: a prova é o smoke de F01-E21 em Postgres real.
- **Validação humana:** Rafael vê `postgis` na `/saude` do HML.
- **Evidência a produzir:** `docs/evidencias-v2/G32/V2-F32-E02/`.
- **Documentação a atualizar:** `dc360/docs/AMBIENTES.md`.
- **Definition of Done:** extensão onde existe; ponto único; PGlite intacto.
- **Checkpoint:** CP-44 (sem resposta, só local e CI).

### V2-F32-E03 - Código IBGE do município e malha municipal comum com resolução por função privilegiada
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** crítico  |  **Paralelizável:** sim (com E04)
- **Objetivo:** guardar a geometria do município uma vez, fora de tenant, e resolver o município de um ponto sem ler tabela de outro município.
- **Problema que resolve:** relato sem token não tem município (REL:07 DH-29); F16-E05 e F15-E13 precisam disto e executam depois.
- **Origem:** PR:D-16; DP:T20; BZ-M:V2-CID-09.
- **Estado atual:** CRIAR; EXPANDIR `organizacoes` (ver E14 sobre a F15-E13).
- **Dependências de entrada:** E01; E02; CP-85 (malha real).
- **O que deve ser implementado:**
  - Migration: `organizacoes.codigo_ibge` (7 dígitos, único entre ativas) e `console_definir_codigo_ibge` (o município não escolhe o próprio código); `territorio_malha_municipal` (`codigo_ibge`, `versao`, `geom`, `fonte_sha256`; só INSERT; vale a maior `versao`), RLS forçada e REVOKE total a `dc360_app`; `territorio_municipios_do_ponto(lat, lng, margem_m)` (até 3 linhas: `codigo_ibge`, `organizacao_id`, `dentro`, `distancia_m`) e `territorio_meu_municipio()`, com `SET search_path` e `row_security = off`.
  - Arquivos: `scripts/carregar-malha-ibge.mjs` (valida e grava `fonte_sha256`) e `db/seeds/territorio-sintetico.geojson` (Serra Alta e Vale Fundo), a criar.
- **O que NÃO deve ser implementado nesta etapa:** habilitar o canal e filtrar por habilitado (F16-E05); tela de carga no console.
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `scripts/carregar-malha-ibge.mjs`, `db/test/malha-municipal.espacial.test.ts` (a criar).
- **Risco de segurança:** a função enxerga todos os municípios; devolve só identificadores.
- **Impacto LGPD:** Não se aplica: dado público.
- **Migração necessária:** Sim (`NNN_malha_municipal_e_codigo_ibge.sql`, a numerar na execução).
- **Compatibilidade:** `codigo_ibge` nulo até o console definir.
- **Rollback:** migration corretiva.
- **Testes positivos:** ponto interior de Serra Alta devolve só ela; ponto a 40 m da divisa devolve os dois.
- **Testes negativos:** IBGE com 6 dígitos ou repetido: recusado; polígono inválido recusado; ponto no mar: zero linhas.
- **Testes de autorização e isolamento:** `dc360_app` com SELECT direto na malha: 42501; a função nunca devolve geometria de outro município.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:console`, `npm run test:espacial`; G00 a G08.
- **E2E:** Não se aplica: prova em Postgres real.
- **Validação humana:** Rafael confere a divisa sintética.
- **Evidência a produzir:** `docs/evidencias-v2/G32/V2-F32-E03/`.
- **Documentação a atualizar:** `docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** malha fora do alcance da aplicação; resolução só por função.
- **Checkpoint:** CP-85 (fonte, versão, simplificação e quem carrega; sem ele só malha sintética).

### V2-F32-E04 - Ponto geográfico e índice GiST nas ocorrências e vistorias
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E03)
- **Objetivo:** dar a `ocorrencias` e `vistorias` um ponto geográfico derivado das colunas atuais, com índice espacial, sem tocar nos caminhos que gravam coordenada.
- **Problema que resolve:** `latitude` e `longitude` numéricas não têm índice espacial; a F16-E07 e a busca por raio varreriam a tabela inteira.
- **Origem:** PR:D-16; ALY:GEO-02; DP:T21.
- **Estado atual:** EXPANDIR (`ocorrencias` 001:166, `vistorias` 030:81).
- **Dependências de entrada:** E02.
- **O que deve ser implementado:**
  - Migration: `ocorrencias.ponto` e `vistorias.ponto` colunas geradas (`ponto_geografico(latitude, longitude)`, STORED, nulas sem coordenada), `GIST (ponto)`; só com PostGIS. Ensaiar a reescrita da tabela em cópia do HML (F01-E15) e registrar o tempo.
  - Banco: nenhuma coluna de coordenada muda; correção de coordenada (`POST /ocorrencias/:id/coordenada`) atualiza o ponto por derivação.
- **O que NÃO deve ser implementado nesta etapa:** `evidencias` (foto não é consulta territorial); busca (E08); ponto do relato (F16-E02).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `db/test/ponto-das-ocorrencias.espacial.test.ts` (a criar), `db/test/teto-de-coordenada.test.ts`.
- **Risco de segurança:** reescrita longa bloqueia a tabela em município grande: ensaio antes de PROD.
- **Impacto LGPD:** coordenada de ocorrência segue dado pessoal indireto; nada novo sai.
- **Migração necessária:** Sim (`NNN_ponto_das_ocorrencias.sql`, a numerar na execução).
- **Compatibilidade:** colunas novas só leitura; sem PostGIS nada muda.
- **Rollback:** migration corretiva remove colunas e índices.
- **Testes positivos:** corrigir a coordenada altera o `ponto`; ocorrência sem coordenada tem `ponto` nulo.
- **Testes negativos:** UPDATE direto em `ponto`: recusado (coluna gerada); `teto-de-coordenada.test.ts` segue verde.
- **Testes de autorização e isolamento:** `EXPLAIN` de consulta como A não toca linha de B; policy de `ocorrencias` inalterada.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api` (`coordenada-de-ocorrencia-aberta`), `npm run test:espacial`; G00 a G08.
- **E2E:** Não se aplica: a E08 prova ponta a ponta.
- **Validação humana:** Rafael lê o tempo da reescrita no HML.
- **Evidência a produzir:** `docs/evidencias-v2/G32/V2-F32-E04/` com plano e tempo.
- **Documentação a atualizar:** `docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** ponto indexado, derivado e coerente com as colunas.
- **Checkpoint:** Não.

### V2-F32-E05 - Áreas do município: bairro, distrito, setor e área de risco com validação de geometria e versões
- **Prioridade:** P0
- **Tamanho:** L  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (E06, E09 e E10 dependem)
- **Objetivo:** guardar as áreas como dado do município, validadas pelo banco, versionadas e sem exclusão.
- **Problema que resolve:** `orgao_competencias.territorio` é texto livre (F04-E15) e não existe área de risco; polígono inválido derruba o mapa.
- **Origem:** PR:D-16; ALY:GEO-02; BZ-D:PRF-48.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E03; CP-86 (só para dado real).
- **O que deve ser implementado:**
  - Migration: `territorio_areas` (`organizacao_id`, `tipo` entre `bairro`, `distrito`, `setor`, `area_de_risco`, `nome`, `nivel_de_risco` só em área de risco (propostos `baixo`, `medio`, `alto`, `muito_alto`), `geom`, `versao`, `encerrada_em`, `motivo_encerramento`); RLS forçada, sem DELETE, UPDATE só para encerrar com motivo; gatilho recusa geometria inválida (`ST_IsValid`), mais de 50 000 vértices e área acima do teto.
  - API: ação nova `gerenciar_territorio` (coordenador e administrador); `GET /v1/territorio/areas`, `GET /v1/territorio/areas/:id` (GeoJSON simplificado), `POST /v1/territorio/areas` e `POST /v1/territorio/areas/:id/encerrar` (motivo obrigatório); nova geometria cria versão e encerra a anterior; `territorio_cobre_area` confere se cabe no município (tolerância proposta de 1%).
- **O que NÃO deve ser implementado nesta etapa:** importação (E06); telas (E12); competência (E10).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/territorio/areas.ts` e `apps/api/src/rotas/territorio.ts` (a criar), `packages/shared/src/permissoes.ts`, `db/test/areas-do-municipio.espacial.test.ts` (a criar).
- **Risco de segurança:** geometria hostil como negação de serviço.
- **Impacto LGPD:** Não se aplica: área não identifica pessoa.
- **Migração necessária:** Sim (`NNN_areas_do_municipio.sql`, a numerar na execução).
- **Compatibilidade:** só itens novos.
- **Rollback:** migration inversa.
- **Testes positivos:** área válida criada; nova geometria cria a versão 2 e encerra a 1.
- **Testes negativos:** polígono com autointerseção, 60 000 vértices ou área acima do teto: 422; encerrar sem motivo: 422; DELETE e UPDATE de geometria: negados.
- **Testes de autorização e isolamento:** operador cria área: 403; município B lê a área do A: 404.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`, `npm run typecheck`, `npm run test:espacial`; G00 a G08.
- **E2E:** `npm run test:e2e:api`: criar, versionar e encerrar uma área.
- **Validação humana:** Alyson confere os níveis propostos.
- **Evidência a produzir:** `docs/evidencias-v2/G32/V2-F32-E05/`.
- **Documentação a atualizar:** `docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** áreas validadas, versionadas e isoladas.
- **Checkpoint:** CP-86 (origem do dado de risco, quem pode vê-lo e licença; sem ele só área sintética).

### V2-F32-E06 - Importação de áreas por GeoJSON e KML com prévia, relatório e idempotência
- **Prioridade:** P1
- **Tamanho:** L  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** sim (com E07)
- **Objetivo:** o município importa áreas por arquivo, vê a prévia com as rejeições e só então aplica.
- **Problema que resolve:** ALY:GEO-02 pede camadas em GeoJSON ou KML; KML é XML e admite entidade externa; arquivo sujo não cria dado parcial silencioso.
- **Origem:** PR:D-16; ALY:GEO-02; DP:T24; DP:T25.
- **Estado atual:** CRIAR (cadeia F06 e worker F07; a F31-E11 reaproveita este leitor, `territorio/kml.ts` e `geojson.ts`).
- **Dependências de entrada:** E05; F06-E04; F06-E05; F06-E06; F07-E04.
- **O que deve ser implementado:**
  - Migration: classe `camada_territorial` na cadeia de arquivos; `territorio_importacoes` (`arquivo_sha256` único por município, estado `em_validacao`, `pronta`, `aplicada`, `rejeitada`, `cancelada`) e `territorio_importacao_feicoes` (prévia e motivo de rejeição); RLS forçada.
  - API: job `territorio.importar` no worker; GeoJSON por `JSON.parse` e KML por leitor sem DTD nem entidade (recusa `<!DOCTYPE`), `NetworkLink` contado e nunca buscado; tetos propostos 10 MB, 5 000 feições, 50 000 vértices; só WGS84; guarda só `nome`, `tipo` e `nivel_de_risco`; `POST /v1/territorio/importacoes` autoriza o envio e `POST /v1/territorio/importacoes/:id/aplicar` aplica só com zero rejeição ou com confirmação explícita de ignorá-las.
- **O que NÃO deve ser implementado nesta etapa:** WMS e camadas de exibição (F31), reprojeção, KMZ, tela (E12).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/territorio/importar.ts` e `apps/api/src/territorio/kml.ts` (a criar), `packages/shared/src/geojson.ts` (a criar).
- **Risco de segurança:** entidade externa em XML, bomba de tamanho, geometria hostil.
- **Impacto LGPD:** propriedades com nome de proprietário são descartadas.
- **Migração necessária:** Sim (`NNN_importacao_de_areas.sql`, a numerar na execução).
- **Compatibilidade:** aditiva.
- **Rollback:** migration inversa.
- **Testes positivos:** GeoJSON e KML equivalentes de 3 bairros geram as mesmas áreas; mesmo arquivo reenviado: 409.
- **Testes negativos:** KML com DOCTYPE recusado; 6 000 feições: rejeitado; latitude 95 vai ao relatório; propriedade `proprietario` não é guardada.
- **Testes de autorização e isolamento:** operador importa: 403; B aplica a prévia do A: 404.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`, `npm run test:espacial`; G06, G07.
- **E2E:** HML: importar GeoJSON sintético de bairros.
- **Validação humana:** Rafael importa um arquivo de teste.
- **Evidência a produzir:** `docs/evidencias-v2/G32/V2-F32-E06/`.
- **Documentação a atualizar:** `docs/ARMAZENAMENTO.md`.
- **Definition of Done:** importação segura, sem efeito parcial silencioso.
- **Checkpoint:** CP-86 (só para arquivo real).

### V2-F32-E07 - Imóvel: cadastro mínimo e vínculo da ocorrência sem mesclar registros
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E06)
- **Objetivo:** relacionar ocorrências ao mesmo imóvel por vínculo explícito, mantendo cada protocolo independente.
- **Problema que resolve:** só existe `vinculada_a` entre ocorrências; o histórico de um imóvel exige entidade (ALY:OCO-05, lacuna L4).
- **Origem:** ALY:OCO-05; ALY:GEO-02; PR:D-20 (L4).
- **Estado atual:** CRIAR (reaproveita `normalizar_busca` e `casa_busca` da migração 041).
- **Dependências de entrada:** E04; CP-87 (só para campos além do endereço).
- **O que deve ser implementado:**
  - Migration: `imoveis` (`organizacao_id`, `endereco`, `endereco_normalizado`, `ponto`, `encerrado_em`, `motivo_encerramento`; sem nome de proprietário nem CPF); `ocorrencias.imovel_id` (FK composta); RLS forçada, sem DELETE.
  - API: `GET /v1/imoveis/sugestao?ocorrenciaId=` (até 30 m e endereço normalizado parecido, teto de 5); `POST /v1/imoveis` e `POST /v1/ocorrencias/:id/imovel` (ação `classificar_triagem`, evento `imovel_vinculado` na trilha com antes e depois); trocar o imóvel é novo evento.
- **O que NÃO deve ser implementado nesta etapa:** mesclar ocorrências; proprietário, inscrição e matrícula (CP-87); tela (E11).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/territorio/imoveis.ts` (a criar), `apps/api/src/rotas/ocorrencias.ts`.
- **Risco de segurança:** vínculo errado mistura histórico de duas famílias.
- **Impacto LGPD:** endereço do imóvel é dado pessoal indireto: classificado no manifesto (E15), sem proprietário.
- **Migração necessária:** Sim (`NNN_imoveis.sql`, a numerar na execução).
- **Compatibilidade:** coluna nula para o que existe.
- **Rollback:** migration inversa com `imoveis` vazia.
- **Testes positivos:** duas ocorrências a 20 m com endereço igual sugerem o mesmo imóvel; vínculo grava evento.
- **Testes negativos:** endereço `%%%` não casa tudo; vincular a imóvel encerrado: 409; imóvel de B em ocorrência de A: 422.
- **Testes de autorização e isolamento:** operador sem `classificar_triagem` vincula: 403; município B lê o imóvel do A: 404.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`, `npm run test:espacial`; G00 a G08.
- **E2E:** `npm run test:e2e:api`: sugerir e vincular.
- **Validação humana:** Alyson confere a sugestão com casos reais sintéticos.
- **Evidência a produzir:** `docs/evidencias-v2/G32/V2-F32-E07/`.
- **Documentação a atualizar:** `docs/DICIONARIO-DE-DADOS.md`, `docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** vínculo auditado; nenhum protocolo alterado.
- **Checkpoint:** CP-87 (o que identifica um imóvel e se inscrição ou matrícula entram; sem ele só endereço e ponto).

### V2-F32-E08 - Busca por raio com teto, recorte e coincidência aproximada
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (E09 e E11 dependem)
- **Objetivo:** listar as ocorrências autorizadas dentro de um raio, com distância e a diferença entre ponto preciso e aproximado.
- **Problema que resolve:** não há consulta por raio (ALY:GEO-02); sem teto no banco, raio gigante vira varredura; ponto de GPS e ponto marcado no mapa parecem iguais (F10-E26).
- **Origem:** ALY:GEO-02; PR:D-16; ALY:RN-04; ALY:RN-07.
- **Estado atual:** CRIAR (consome o índice da E04 e a precisão da F10-E26).
- **Dependências de entrada:** E04.
- **O que deve ser implementado:**
  - Banco: `ocorrencias_no_raio(p_lat, p_lng, p_raio_m, p_de, p_ate, p_tipo, p_limite)` INVOKER (sob RLS, então o sigilo da F03-E21 vale); raio entre 1 e 10 000 m (valor proposto, calibra na F24-E11) com erro `22023` fora disso; limite 200; `ST_DWithin` em `geography`.
  - API: `GET /v1/territorio/ocorrencias/raio` (ação nova `consultar_territorio`: operador, coordenador, administrador); devolve protocolo, tipo, estado, data, `distancia_m`, `precisao_m` e `coincidencia: "aproximada"`; nunca nome, contato nem descrição; grava evento `consulta_territorial` com parâmetros e contagem, sem a coordenada.
- **O que NÃO deve ser implementado nesta etapa:** imóvel e área (E09); tela (E11); agente de campo (E13).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/territorio/raio.ts` e `apps/api/src/rotas/territorio.ts` (a criar), `packages/shared/src/permissoes.ts`.
- **Risco de segurança:** raio na divisa não pode devolver município vizinho.
- **Impacto LGPD:** resposta sem dado de pessoa; consulta registrada.
- **Migração necessária:** Sim (`NNN_busca_por_raio.sql`, a numerar na execução).
- **Compatibilidade:** rota nova.
- **Rollback:** migration inversa; rota removida.
- **Testes positivos:** 3 ocorrências a 100, 400 e 900 m: raio de 500 devolve 2, em ordem de distância.
- **Testes negativos:** raio 0 ou 10 001: 422; latitude 95: 422; ocorrência sem coordenada nunca aparece; ocorrência `restrita` fora da visão do operador: ausente.
- **Testes de autorização e isolamento:** o raio do A ao redor da divisa não devolve ocorrência do B; agente de campo: 403; sem token: 401.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api` (`superficie.test.ts`), `npm run test:espacial`; G00 a G08.
- **E2E:** `npm run test:e2e:api`: buscar com raio de 500 m.
- **Validação humana:** Alyson reconhece o resultado num caso conhecido.
- **Evidência a produzir:** `docs/evidencias-v2/G32/V2-F32-E08/`.
- **Documentação a atualizar:** `docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** teto no banco; recorte e sigilo respeitados.
- **Checkpoint:** Não.

### V2-F32-E09 - Consulta por imóvel e por área de risco, com coincidência exata ou aproximada
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (E11 depende)
- **Objetivo:** devolver o histórico de um imóvel e as ocorrências dentro de uma área, dizendo o que é coincidência exata e o que é aproximada.
- **Problema que resolve:** ALY:GEO-02 pede "registros autorizados" que "diferenciam coincidência aproximada"; ponto cuja precisão cruza a borda da área não é prova de estar dentro.
- **Origem:** ALY:GEO-02; ALY:OCO-05; PR:D-16.
- **Estado atual:** CRIAR.
- **Dependências de entrada:** E05; E07; E08.
- **O que deve ser implementado:**
  - Banco: `ocorrencias_do_imovel(p_imovel_id)` (vínculo explícito: `exata`) e `ocorrencias_na_area(p_area_id, p_de, p_ate, p_limite)` (`ST_Covers`; `exata` se a distância do ponto à borda for maior que `precisao_m`, senão `aproximada`); INVOKER, sob RLS.
  - API: `GET /v1/territorio/imoveis/:id/historico` e `GET /v1/territorio/areas/:id/ocorrencias` (`consultar_territorio`); mesmo formato de campos da E08 mais `coincidencia`; área encerrada só com `incluirEncerradas=true`; mesmo evento `consulta_territorial`.
- **O que NÃO deve ser implementado nesta etapa:** consulta sobre camadas de F31 (a área de risco aqui é a da E05); tela (E11).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `apps/api/src/territorio/consultas.ts` (a criar), `apps/api/src/rotas/territorio.ts`.
- **Risco de segurança:** histórico de imóvel revela endereço: só campos da E08.
- **Impacto LGPD:** resposta sem nome nem contato; consulta registrada.
- **Migração necessária:** Sim (`NNN_consulta_por_imovel_e_area.sql`, a numerar na execução).
- **Compatibilidade:** rotas novas.
- **Rollback:** migration inversa.
- **Testes positivos:** ocorrência dentro da área a 200 m da borda e precisão de 20 m: `exata`; a 5 m da borda com precisão de 30 m: `aproximada`; histórico do imóvel traz as 3 ocorrências vinculadas.
- **Testes negativos:** área inexistente: 404; ocorrência fora da área ausente; imóvel sem vínculo: lista vazia, sem erro.
- **Testes de autorização e isolamento:** área de B pedida por A: 404; imóvel de B: 404; ocorrência `restrita` fora da visão do operador: ausente.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`, `npm run test:espacial`; G00 a G08.
- **E2E:** `npm run test:e2e:api`: consultar área e imóvel.
- **Validação humana:** Alyson lê uma área de risco sintética com 3 casos.
- **Evidência a produzir:** `docs/evidencias-v2/G32/V2-F32-E09/`.
- **Documentação a atualizar:** `docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** duas consultas com coincidência explícita e isolamento provado.
- **Checkpoint:** Não.

### V2-F32-E10 - Competência por área e áreas do ponto para a sugestão de destino
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E08)
- **Objetivo:** a competência do órgão passa a apontar para uma área desenhada, e o servidor responde quais áreas cobrem um ponto.
- **Problema que resolve:** `orgao_competencias.territorio` é texto (F04-E15); F10-E17 e F10-E19 pedem "áreas da F32".
- **Origem:** PR:D-18; PR:D-16; DP:T10.
- **Estado atual:** EXPANDIR (a tabela e `competencia.ts` vêm da F04-E15).
- **Dependências de entrada:** E05; F04-E15.
- **O que deve ser implementado:**
  - Migration: `orgao_competencias.area_id` (FK composta, nulo mantém o texto); função INVOKER `territorio_areas_do_ponto(lat, lng)`: tipo, nome e id das áreas vigentes que cobrem o ponto, até 10.
  - Domínio: `packages/shared/src/competencia.ts` aceita `areaIds` além do texto normalizado.
  - API: `GET /v1/territorio/areas/do-ponto` (`consultar_territorio`); a rota `orgaos-competentes` (F04-E15), consumida pela F10-E19, passa a usá-la.
- **O que NÃO deve ser implementado nesta etapa:** sugestão automática de destino (a Defesa Civil escolhe); tela de competência (F10-E17).
- **Arquivos e módulos prováveis:** `db/migrations/` (nova), `packages/shared/src/competencia.ts`, `apps/api/src/rotas/orgaos.ts`, `apps/api/src/rotas/territorio.ts`.
- **Risco de segurança:** competência de área de B não pode influenciar A.
- **Impacto LGPD:** Não se aplica: cadastro de órgão.
- **Migração necessária:** Sim (`NNN_competencia_por_area.sql`, a numerar na execução).
- **Compatibilidade:** competência só por texto continua valendo.
- **Rollback:** migration inversa.
- **Testes positivos:** deslizamento em ponto do bairro X sugere o órgão com `area_id` de X.
- **Testes negativos:** `area_id` de outro município: 422; ponto sem área: lista vazia e cai no texto.
- **Testes de autorização e isolamento:** `usuario_orgao` não escreve competência; competência do A invisível no B.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api`, `npm run test:espacial`; G04.
- **E2E:** `npm run test:e2e:api`: competência por área e sugestão.
- **Validação humana:** Alyson confere a sugestão num bairro sintético.
- **Evidência a produzir:** `docs/evidencias-v2/G32/V2-F32-E10/`.
- **Documentação a atualizar:** `docs/DICIONARIO-DE-DADOS.md`.
- **Definition of Done:** competência territorial por área, com o texto como reserva.
- **Checkpoint:** Não.

### V2-F32-E11 - Painel: consulta territorial por raio, imóvel e área no mapa
- **Prioridade:** P1
- **Tamanho:** L  |  **Complexidade:** alta  |  **Risco:** médio  |  **Paralelizável:** não (edita `Mapa.tsx` e o repositório de dados)
- **Objetivo:** o coordenador consulta o histórico territorial numa tela, com resultado na lista e no mapa.
- **Problema que resolve:** a consulta existe só na API; `Mapa.tsx` não desenha área nem raio.
- **Origem:** ALY:GEO-02; PR:D-16; REL:11.
- **Estado atual:** CRIAR a página sobre `Mapa.tsx`, `mapa-de-base.ts` e `dados/repositorio.ts`.
- **Dependências de entrada:** E08; E09; F08-E13.
- **O que deve ser implementado:**
  - Frontend: `apps/web/src/paginas/Territorio.tsx` (a criar), rota `/territorio`; três modos "Por raio", "Por imóvel" e "Por área de risco"; rótulos "Raio em metros (de 1 a 10000)" e "Ponto central (cole a coordenada)"; resultado com "Coincidência aproximada" ou "Coincidência exata" em texto e ícone; polígonos e círculo nos dois modos do mapa (no modo Google, só com `docs/SUBPROCESSADORES.md` seção 2.2 revisto); estados vazio, erro e carregando.
  - Dados: `http.ts` chama as rotas; `local.ts` oferece só o raio por Haversine marcado "cálculo aproximado" e avisa que imóvel e área exigem PostGIS.
- **O que NÃO deve ser implementado nesta etapa:** gestão de áreas (E12); camadas externas (F31); desenhar polígono.
- **Arquivos e módulos prováveis:** `apps/web/src/paginas/Territorio.tsx` (a criar), `apps/web/src/paginas/mapa-de-base.ts`, `apps/web/src/dados/repositorio.ts`, `http.ts`, `local.ts`, `apps/web/src/App.tsx`.
- **Risco de segurança:** link externo segue só pelo caminho de `DescobrirPonto.tsx`.
- **Impacto LGPD:** sem nome nem contato na tela.
- **Migração necessária:** Não.
- **Compatibilidade:** sem PostGIS a tela explica.
- **Rollback:** esconder a rota.
- **Testes positivos:** raio de 500 m lista e marca os pontos; lista e mapa mostram o mesmo número.
- **Testes negativos:** raio 10 001 mostra o que digitar; resposta 501 mostra o aviso; sem resultado mostra `Vazio`.
- **Testes de autorização e isolamento:** agente de campo não vê a rota; A nunca recebe ponto de B.
- **Regressão obrigatória:** `npm test --workspace @dc360/web`, `npm run test:e2e`, `npm run test:api`; G00 a G08.
- **E2E:** `fluxo.e2e.mjs` e `fluxo-api.e2e.mjs`: consultar; Playwright captura.
- **Validação humana:** Alyson usa a tela; capturas aprovadas no portão visual (nada desalinhado, grudado ou fora do lugar; texto bem escrito).
- **Evidência a produzir:** `docs/evidencias-v2/G32/V2-F32-E11/` com E2E e `capturas/INDEX.md` (`19-definicao-de-pronto.md`, seção 0).
- **Documentação a atualizar:** `docs/GUIA-DO-COORDENADOR.md`, `docs/SUBPROCESSADORES.md`.
- **Definition of Done:** três consultas na tela.
- **Checkpoint:** Não.

### V2-F32-E12 - Painel: gestão de áreas e importação com prévia
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (mesmo repositório de dados da E11)
- **Objetivo:** listar, importar com prévia, encerrar e ver o histórico de versões das áreas do município.
- **Problema que resolve:** as rotas das E05 e E06 não têm tela e o relatório de rejeição precisa ser legível.
- **Origem:** ALY:GEO-02; PR:D-16; REL:11.
- **Estado atual:** CRIAR sobre `Orgaos.tsx` como molde de lista e modal.
- **Dependências de entrada:** E06; E11.
- **O que deve ser implementado:**
  - Frontend: `apps/web/src/paginas/AreasDoMunicipio.tsx` (a criar), rota `/territorio/areas`: lista por tipo, "Importar arquivo" (GeoJSON ou KML), prévia "N áreas aceitas, M rejeitadas" com o motivo de cada uma e baixar relatório em CSV (`montarCsv`), botão "Aplicar importação", "Encerrar área" com motivo, versões.
  - Acessibilidade: foco no resumo da prévia, `aria-live` polite no resultado, alvo de toque de 44 px.
- **O que NÃO deve ser implementado nesta etapa:** edição de geometria no mapa; camadas de F31.
- **Arquivos e módulos prováveis:** `apps/web/src/paginas/AreasDoMunicipio.tsx` (a criar), `apps/web/src/dados/repositorio.ts`, `http.ts`, `apps/web/src/App.tsx`.
- **Risco de segurança:** o relatório não repete propriedade de cadastro.
- **Impacto LGPD:** Não se aplica: sem dado de pessoa.
- **Migração necessária:** Não.
- **Compatibilidade:** modo local mostra "Disponível só com API".
- **Rollback:** esconder a rota.
- **Testes positivos:** importar arquivo sintético com 2 rejeições mostra a prévia e aplica as aceitas após confirmar.
- **Testes negativos:** arquivo de 11 MB e tipo falso mostram mensagem clara; aplicar duas vezes: segunda recusada.
- **Testes de autorização e isolamento:** operador não vê "Importar": 403 na rota; município B não lista a área do A.
- **Regressão obrigatória:** `npm test --workspace @dc360/web`, `npm run test:e2e`; G00 a G08.
- **E2E:** `fluxo-api.e2e.mjs`: importar e encerrar; Playwright captura.
- **Validação humana:** Alyson importa um arquivo sintético; capturas aprovadas no portão visual.
- **Evidência a produzir:** `docs/evidencias-v2/G32/V2-F32-E12/` com `capturas/INDEX.md`.
- **Documentação a atualizar:** `docs/GUIA-DO-COORDENADOR.md`.
- **Definition of Done:** importação conferida na tela e relatório legível.
- **Checkpoint:** Não.

### V2-F32-E13 - App do agente: contexto territorial da tarefa guardado para uso sem sinal
- **Prioridade:** P2
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** sim (com E12)
- **Objetivo:** a tarefa baixada com sinal traz o contexto territorial já calculado pelo servidor, que o agente lê sem rede.
- **Problema que resolve:** o agente não sabe, no morro, se o ponto está em área de risco nem quantas ocorrências o imóvel já teve; levar polígono ao aparelho amplia dado e exige motor geométrico.
- **Origem:** ALY:GEO-02; ALY:VIS-02; PR:D-16.
- **Estado atual:** EXPANDIR `GET /campo/meu-trabalho` (`apps/api/src/rotas/campo.ts:43`).
- **Dependências de entrada:** E09; E10.
- **O que deve ser implementado:**
  - API: cada tarefa ganha `contexto_territorial` opcional (nomes e nível das áreas vigentes que cobrem o ponto, contagem de ocorrências anteriores no imóvel e em 100 m, sem protocolo alheio nem dado de pessoa), calculado só para as ocorrências da equipe do agente (`recorteDoAgente`).
  - Mobile: `apps/campo/src/dados/api.ts` e `banco-local.ts` guardam o campo; a ocorrência mostra "Área de risco: nome, nível" e "Já houve N chamados aqui" e, sem o campo (PGlite, app antigo), nada.
- **O que NÃO deve ser implementado nesta etapa:** polígono no aparelho e mapa offline (F14-E21); acionar consulta pelo agente.
- **Arquivos e módulos prováveis:** `apps/api/src/rotas/campo.ts`, `apps/campo/src/dados/api.ts`, `apps/campo/src/dados/banco-local.ts`, `apps/campo/src/app/(agente)/vistoria/[id].tsx`.
- **Risco de segurança:** o contexto não pode revelar ocorrência de outra equipe.
- **Impacto LGPD:** contagem sem identificação.
- **Migração necessária:** Não.
- **Compatibilidade:** campo opcional; app antigo ignora.
- **Rollback:** deixar de enviar o campo.
- **Testes positivos:** tarefa em área de risco traz o contexto e ele aparece em modo avião.
- **Testes negativos:** sem PostGIS o campo é omitido; contexto vazio não mostra bloco.
- **Testes de autorização e isolamento:** o agente da equipe A não recebe contagem de ocorrência da equipe B; município B: 404.
- **Regressão obrigatória:** `npm run test:campo`, `npm run test:api` (`agente-so-ve-a-equipe`), `npm run test:isolamento`; G00 a G08.
- **E2E:** simulador: baixar tarefa, ligar modo avião, ver o contexto.
- **Validação humana:** capturas de simulador aprovadas no portão visual (Rafael).
- **Evidência a produzir:** `docs/evidencias-v2/G32/V2-F32-E13/` com `capturas/INDEX.md`.
- **Documentação a atualizar:** `apps/campo/LEIA-ME.md`.
- **Definition of Done:** contexto lido sem sinal; nenhum dado de outra equipe.
- **Checkpoint:** Não.

### V2-F32-E14 - Troca do Haversine e do módulo geográfico em TypeScript: reconciliação com F10 e F16
- **Prioridade:** P1
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** médio  |  **Paralelizável:** não (decide o que F10 e F16 consomem)
- **Objetivo:** substituir Haversine e a resolução em TypeScript pelas funções desta fase e fechar quem cria o quê.
- **Problema que resolve:** F10-E24 usa Haversine "até a F32", mas a F32 executa antes; F16-E05 e E06 criam `canal_geometria_do_municipio`, `geo.ts` e `ponto_do_relato`; F15-E13 cria `codigo_ibge`.
- **Origem:** PR:D-16; PR:D-29; DP:T36; REL:07 11.7.
- **Estado atual:** SUBSTITUIR a proposta da F16 e da F10-E24 (D-16 reverte DP:T36); a tabela abaixo já consta em F15-E13, F16-E05 a E07 e F31-E11.
- **Dependências de entrada:** E03; E04; E08; E10.
- **O que deve ser implementado:**
  - Arquivos: tabela no ADR da E01 e no gate: F10-E24 chama `ocorrencias_no_raio` (E08) com Haversine só como reserva no modo local; F16-E05 troca a tabela `canal_geometria_do_municipio` por `territorio_municipios_do_ponto` (E03), filtrando os habilitados; `geo.ts` é módulo único, criado na E02 e acrescido aqui de `distanciaEmMetros` (só exibir); F16-E06 vira EXPANDIR (só as constantes do relato; sem migration nem `ponto_do_relato`); F16-E07 usa o GiST da E04; F15-E13 mantém só `canal_cidadao_habilitado`; F10-E17 e E19 usam a E10.
  - Domínio: `db/test/geo-paridade.espacial.test.ts` (a criar): 50 pares, Haversine contra `ST_Distance`, diferença abaixo de 0,5%.
- **O que NÃO deve ser implementado nesta etapa:** mudar código de F10 e F16 (cada fase executa o seu).
- **Arquivos e módulos prováveis:** `docs/adr/` (ADR da E01), `packages/shared/src/geo.ts`, `db/test/geo-paridade.espacial.test.ts` (a criar).
- **Risco de segurança:** duas fontes de verdade para o município do relato.
- **Impacto LGPD:** Não se aplica: reconciliação de desenho.
- **Migração necessária:** Não.
- **Compatibilidade:** F10 e F16 mantêm contratos.
- **Rollback:** reverter a tabela de reconciliação.
- **Testes positivos:** Haversine e PostGIS concordam em 50 pares.
- **Testes negativos:** latitude e longitude invertidas reprovam a paridade.
- **Testes de autorização e isolamento:** Não se aplica: a E16 prova o isolamento das funções.
- **Regressão obrigatória:** `npm test --workspace @dc360/shared`, `npm run test:espacial`, `npm run typecheck`; G00 a G08.
- **E2E:** Não se aplica: sem fluxo.
- **Validação humana:** Rafael aprova a tabela de reconciliação.
- **Evidência a produzir:** `docs/evidencias-v2/G32/V2-F32-E14/`.
- **Documentação a atualizar:** ADR da E01.
- **Definition of Done:** F10, F15 e F16 sabem o que consumir e o que deixam de criar.
- **Checkpoint:** Não.

### V2-F32-E15 - Manifesto, saída, eliminação e retenção das tabelas territoriais
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** média  |  **Risco:** alto  |  **Paralelizável:** não (edita o manifesto e o pacote)
- **Objetivo:** toda tabela nova entra no inventário de dados: o que sai do município, o que a eliminação apaga e o que é dado público.
- **Problema que resolve:** tabela sem classificação reprova o teste de catálogo (F05-E02); a malha comum não pode sair nem ser apagada com um município.
- **Origem:** DP:T41; PR:D-16; BZ-F:P0-LGPD.
- **Estado atual:** EXPANDIR `db/src/manifesto.ts` (F05-E01, E03, E05).
- **Dependências de entrada:** E05; E06; E07; F05-E05.
- **O que deve ser implementado:**
  - Domínio: entradas no manifesto: `territorio_areas`, `territorio_importacoes`, `territorio_importacao_feicoes` e `imoveis` (tenant; saem; a eliminação apaga); `territorio_malha_municipal` (`plataforma`, `politica` de leitura só por função, `nao_sai` com motivo "dado público do IBGE", `fica`); `imoveis.endereco` como `pessoal`.
  - API: o pacote de saída inclui áreas e imóveis do município (colunas sem nada de outro tenant); a eliminação apaga as quatro tabelas do município e preserva a malha.
- **O que NÃO deve ser implementado nesta etapa:** prazo de retenção (CP-10); apagar a malha.
- **Arquivos e módulos prováveis:** `db/src/manifesto.ts`, `apps/api/src/saida/pacote.ts`, `db/test/isolamento.test.ts`, `db/test/eliminacao-de-municipio.test.ts`.
- **Risco de segurança:** eliminar a malha quebraria todos os municípios.
- **Impacto LGPD:** endereço do imóvel inventariado; a retenção segue a classe do município.
- **Migração necessária:** Sim (`NNN_eliminacao_territorial.sql`, a numerar na execução; ordem de apagamento).
- **Compatibilidade:** pacote de saída ganha arquivos.
- **Rollback:** migration corretiva.
- **Testes positivos:** pacote de saída traz as áreas; eliminação apaga as tabelas do município.
- **Testes negativos:** tabela nova sem entrada reprova o catálogo; eliminar município não apaga a malha.
- **Testes de autorização e isolamento:** pacote do A não contém área do B; `isolamento.test.ts` (CA-06) inclui as tabelas novas.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:api` (`saida-de-municipio`, `eliminacao-de-municipio`); G00 a G08.
- **E2E:** `npm run test:e2e:api`: saída e eliminação com área sintética.
- **Validação humana:** Rafael confere a lista do manifesto.
- **Evidência a produzir:** `docs/evidencias-v2/G32/V2-F32-E15/`.
- **Documentação a atualizar:** `docs/SAIDA-DE-MUNICIPIO.md`, `docs/PRIVACIDADE.md`.
- **Definition of Done:** todas as tabelas classificadas; a malha preservada.
- **Checkpoint:** Não.

### V2-F32-E16 - Prova em Postgres real: isolamento espacial, divisa, plano de consulta e HML
- **Prioridade:** P0
- **Tamanho:** M  |  **Complexidade:** alta  |  **Risco:** alto  |  **Paralelizável:** não (fecha a fase)
- **Objetivo:** provar com Postgres real e PostGIS que o isolamento vale nas consultas espaciais, que a divisa não vaza e que os índices são usados.
- **Problema que resolve:** o PGlite não roda PostGIS; sem esta etapa o isolamento espacial só seria declarado, nunca provado.
- **Origem:** PR:D-16; ALY:RN-01; DP:T30; REL:02 G-14.
- **Estado atual:** CRIAR (`test:espacial` vem da F01-E21).
- **Dependências de entrada:** E03 a E10; E15; CP-44.
- **O que deve ser implementado:**
  - Banco: `db/test/isolamento-espacial.espacial.test.ts` (a criar): com `dc360_app`, dois municípios vizinhos e dados na divisa; cada função e rota espacial como A nunca devolve linha de B; `EXPLAIN` de cada consulta usa `Index Scan` em GiST com 5 000 pontos sintéticos.
  - Infraestrutura: o mesmo teste roda em HML contra o provedor; resultado arquivado; `DC360_EXIGE_POSTGIS=1` no CI.
- **O que NÃO deve ser implementado nesta etapa:** carga com 50 000 pontos (F24-E11); mudar índice (defeito vira etapa desta fase).
- **Arquivos e módulos prováveis:** `db/test/isolamento-espacial.espacial.test.ts` (a criar), `db/vitest.espacial.config.ts`, `.github/workflows/verificar.yml`.
- **Risco de segurança:** função privilegiada que vaza geometria alheia.
- **Impacto LGPD:** coordenadas sintéticas.
- **Migração necessária:** Não.
- **Compatibilidade:** Não se aplica: teste.
- **Rollback:** Não se aplica: teste.
- **Testes positivos:** consultas do A veem só as próprias linhas e usam o índice.
- **Testes negativos:** ponto na divisa não resolve para município não cadastrado; consulta sem contexto de tenant não devolve linha.
- **Testes de autorização e isolamento:** `dc360_app` sem GRANT na malha: 42501; função privilegiada fora da lista nominal reprova `isolamento.test.ts`.
- **Regressão obrigatória:** `npm run test:isolamento`, `npm run test:espacial`, `npm run verificar`; G00 a G08.
- **E2E:** `npm run test:e2e:api` em HML com PostGIS real.
- **Validação humana:** Rafael lê os planos.
- **Evidência a produzir:** `docs/evidencias-v2/G32/V2-F32-E16/` com planos e saída do HML.
- **Documentação a atualizar:** `dc360/README.md`, `dc360/docs/DESEMPENHO.md`.
- **Definition of Done:** isolamento e índices provados em Postgres real.
- **Checkpoint:** Não.

# GATE G32 - POSTGIS E DADOS TERRITORIAIS PROVADOS

Só passa se:
- [ ] V2-F32-E01: ADR do modelo territorial aceita (comum x município, convenção `geography` 4326, PGlite sem a extensão); hash em `docs/evidencias-v2/G32/V2-F32-E01/`.
- [ ] V2-F32-E02: extensão criada onde existe, `ponto_geografico` em uso, `/saude` informa `postgis`, partida em produção cai sem a extensão com `EXIGE_POSTGIS=sim`, e a suíte PGlite segue verde (saída arquivada).
- [ ] V2-F32-E03: `territorio_malha_municipal` sem GRANT a `dc360_app`, `territorio_municipios_do_ponto` devolve só identificadores e o ponto a 40 m da divisa devolve os dois municípios (`malha-municipal.espacial.test.ts`).
- [ ] V2-F32-E04: `ocorrencias.ponto` e `vistorias.ponto` indexados por GiST e coerentes com `latitude` e `longitude`; tempo da reescrita em HML anotado.
- [ ] V2-F32-E05: áreas validadas pelo banco, versionadas, sem DELETE; polígono inválido e gigante recusados.
- [ ] V2-F32-E06: importação de GeoJSON e KML com prévia, relatório e idempotência; KML com DOCTYPE recusado; nenhuma propriedade não escolhida guardada.
- [ ] V2-F32-E07: vínculo de imóvel auditado, sem mesclar protocolos.
- [ ] V2-F32-E08: busca por raio com teto no banco, recorte e sigilo respeitados; raio na divisa não devolve o vizinho.
- [ ] V2-F32-E09: consulta por imóvel e por área de risco com coincidência exata ou aproximada correta nos casos de borda.
- [ ] V2-F32-E10: competência por área funcionando, com o texto como reserva.
- [ ] V2-F32-E11 e E12: telas de consulta e de gestão de áreas com E2E e capturas aprovadas no portão visual de `19-definicao-de-pronto.md`, seção 0 (nada desalinhado, grudado ou fora do lugar; texto bem escrito), nos dois modos de dados.
- [ ] V2-F32-E13: contexto territorial da tarefa lido sem sinal em simulador, sem dado de outra equipe.
- [ ] V2-F32-E14: tabela de reconciliação com F10-E24, F10-E17, F10-E19, F15-E13, F16-E05, F16-E06 e F16-E07 aceita por Rafael e entregue ao RV-15.
- [ ] V2-F32-E15: todas as tabelas novas no manifesto; pacote de saída e eliminação cobrem as quatro tabelas do município e preservam a malha.
- [ ] V2-F32-E16: `isolamento-espacial.espacial.test.ts` verde em Postgres real (CI com `DC360_EXIGE_POSTGIS=1` e HML), planos com `Index Scan` arquivados.
- [ ] CP-44 decidido, ou adiado por escrito com o que fica bloqueado: tudo desta fase em HML e PROD (CI e local seguem). CP-85, CP-86 e CP-87 decididos ou adiados com o que fica bloqueado: malha real, áreas reais e campos de imóvel além do endereço.
- [ ] Nenhuma regressão: gates G00 a G08 continuam verdes (se um quebrar, ESTE gate volta a REPROVADO), com `npm run test:isolamento`, `npm run test:api`, `npm run test:console`, `npm run test:espacial` e `npm run typecheck` verdes.
- [ ] Documentação atualizada e evidências arquivadas em `docs/evidencias-v2/G32/`.

**Reabre se:** tabela espacial nova ficar sem entrada no manifesto; `dc360_app` ganhar leitura direta da malha; consulta espacial deixar de usar o índice ou aceitar raio sem teto; função privilegiada devolver geometria de outro município; o PGlite passar a exigir a extensão; coincidência aproximada for tratada como exata.

**Este Gate libera:** G09 (a próxima fase na ordem de execução) e, em cadeia, G10 (F10-E17, E19, E24 consomem áreas e `ocorrencias_no_raio`), G15 e G16 (resolução do município, índice e constantes geográficas), G31 (tipo geométrico, índice e leitor de GeoJSON e KML), G24 (F24-E11 mede estas consultas) e G26 a G28 (POC, piloto e candidata cobrem o módulo territorial).
