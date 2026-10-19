---
validador: seguranca-aplicacao (general-purpose com o papel da dimensão)
modelo: claude-opus-5-5
etapa: V2-F00-E12
sha_validado: bb0f654
ci_run: ausente (39143791434 citado pelo implementador, não lido)
rodada: 4
herdado_de:
tags: [API, DOCUMENTO]
nivel_de_prova_exigido: [E1, E2]
nivel_de_prova_obtido: [E1, E2]
veredito: PASS
confianca: alta
humano_necessario: nao
escalar: nenhum
---
## Critérios verificados

Diff da etapa no lote: `git diff afde25c..bb0f654 -- dc360/apps/api/src/saida/pacote.ts dc360/apps/api/src/documentos/laudo.ts dc360/apps/api/src/rotas/documentos.ts` (junções de equipe, coordenada, `conferirAssinatura`, leitura de `vistoria_evidencias_perdidas`, `assinaturaNaoConferida`). A mudança de `rotas/documentos.ts` neste intervalo é só a marca `ROTA_GET_COM_EFEITO` (E04), que aperta a vigência.

1. Isolamento: o pacote só traz o município do token; a consulta nova a `vistoria_evidencias_perdidas` (sem filtro no SQL) fica contida pela RLS forçada; documento de outro município responde 404. PASS.
2. HTML do laudo do pacote escapado, inclusive a legenda da perda e o nome de equipe que agora entram no documento. PASS (com lacuna de teste, achado B1).
3. CSV neutralizado contra fórmula na tabela nova que chega ao pacote com texto do agente. PASS.
4. ZIP sem travessia de caminho. PASS.
5. Sem SSRF nem leitura arbitrária pelas chaves de armazenamento (`descrever` e `baixar` só com o prefixo do município do token). PASS.
6. Papel sem permissão recusado antes de tocar o banco; organização nunca vem de parâmetro, cabeçalho ou corpo. PASS.
7. Documento emitido imutável: o pacote gera cópias e não grava nem altera emissão; o papel da aplicação não altera nem apaga a trilha. PASS.

## Evidência

Saídas em `/private/tmp/claude-501/-Users-rafaelgomes-Documents-city-hall/ded47d25-806d-4495-ac61-f9e84518cc35/scratchpad/validadores/seguranca-aplicacao-E10-E12-E15/`.

- E1: `cd dc360/apps/api && npx vitest run test/saida-de-municipio.test.ts test/pacote-de-saida-contrato.test.ts test/saida-nao-declara-inexistente.test.ts`, código 0, 56 de 56 (`e12-01-testes-saida.txt`).
- E1: `cd dc360 && npm run test:isolamento`, código 0, 14 arquivos, 345 aprovados e 3 pulados (`e12-04-test-isolamento.txt`).
- E2: sonda própria `sonda-e12.mts` (Fastify real sobre PGlite com `SET LOCAL ROLE dc360_app`, armazenamento em memória com espião em `descrever` e `baixar`, ZIP gravado e aberto com o `unzip` do sistema), `cd dc360/apps/api && npx tsx <sonda> <pasta>`, código 0, 25 conferências OK (`e12-02-sonda.txt`).
- Mordida (mutação, rodada e desfeita com `git restore`; depois, 93 de 93 nas cinco suítes em `e12-03-depois-de-restaurar.txt`):
  - M2, perdas de todas as vistorias entregues a cada laudo: 1 falha (re-vistoria) (`e12-mut-M2-perdas-de-todas-as-vistorias.txt`).
  - M4, sem `exigirPermissao(quem.papel, "gerenciar_organizacao")` em `rotas/saida.ts`: 3 falhas (`e12-mut-M4-sem-gerenciar-organizacao.txt`).
  - M1, sem a conferência de prefixo em `conferirAssinatura`: 0 falhas, sobrevive (achado B2) (`e12-mut-M1-sem-prefixo-na-conferencia.txt`).
  - M3, sem `escapar` na legenda de `blocoEvidenciasPerdidas` (`documentos/laudo.ts`): 0 falhas nas cinco suítes e em `prova-perdida-e-ponto-da-vistoria.test.ts`, sobrevive (achado B1) (`e12-mut-M3-legenda-perdida-sem-escapar.txt`, `e12-mut-M3b-prova-perdida.txt`).
- Inspeção: `db/migrations/030_*.sql:192-203` (RLS ativada e forçada, política por `app_organizacao_atual()`, só SELECT e INSERT para `dc360_app`), restrição `assinatura_com_prefixo_do_tenant` (`009`), `chave_storage` com prefixo (`001:259`), `foto_chave` com prefixo (`040:57`), `saida/zip.ts#normalizarCaminho`, `packages/shared/src/csv.ts#celulaCsv`, `rotas/sincronizacao.ts:597-602` (a chave da assinatura é remontada pelo token).

## Cenários positivos

- Administradora de Serra Alta baixa o pacote: 200, ZIP com 112 entradas, laudo com a seção dos registros perdidos e a frase da assinatura perdida igual à rota.
- Controle positivo: o pacote de Vale Fundo (Aurélio promovido só na sonda) contém a perda marcada de Vale Fundo e nada da legenda de Serra Alta.

## Cenários negativos

- Coordenador, operador e agente de campo: 403 no pacote, e nenhuma linha em `exportacoes`; sem token: 401.
- `?organizacao_id=`, cabeçalho `x-organizacao-id` e corpo `organizacaoId` apontando Vale Fundo, com o token de Serra Alta: o pacote sai só com Serra Alta (nenhuma marca, vistoria, perda nem bytes de Vale Fundo no ZIP extraído).
- `/documentos/<ocorrência de Vale Fundo>/laudo`, `/termo-de-interdicao` e `/laudo.pdf` com o token de Serra Alta: 404 nos três, e nenhuma emissão gravada em Vale Fundo.
- Legenda de perda `<img src=x onerror=alert(1)>"'&`: no laudo do pacote sai como `&lt;img src=x onerror=alert(1)&gt;`.
- Nome de equipe `Equipe <script>alert(2)</script>` em divergência na F1: o aviso de equipe sai escapado.
- Legenda `=HYPERLINK("http://atacante.exemplo/x","clique")`: em `tabelas/vistoria_evidencias_perdidas.csv` sai `"'=HYPERLINK(...)"`.
- `assinatura_chave` de Vale Fundo numa vistoria de Serra Alta: o banco recusa (`assinatura_com_prefixo_do_tenant`).
- `assinatura_chave` terminando em `..` (o máximo que o cliente consegue, porque o servidor remonta a chave): `descrever` foi chamado só com `tenant/<Serra Alta>/...`, e o ZIP não tem entrada com `..`, absoluta ou com barra invertida.

## Tentativas de reprovar

- Vazar dado de outro município pela consulta nova sem `WHERE organizacao_id`: não vazou (RLS forçada, controle positivo provado).
- Escolher o município por parâmetro, cabeçalho ou corpo: ignorado.
- Distinguir existência de documento alheio por 403: responde 404.
- XSS armazenado pela legenda da perda e pelo nome de equipe (texto que vem do agente e do cadastro): escapado.
- Fórmula de planilha pela legenda: neutralizada.
- Travessia de caminho pelo nome do arquivo da assinatura e leitura de objeto alheio pelo armazenamento: bloqueadas pelas duas camadas (remontagem da chave e restrição do banco) e pelo normalizador do ZIP.
- Reemissão ou alteração de documento emitido ao montar o pacote: a trilha inteira ficou idêntica antes e depois do pacote; `UPDATE` e `DELETE` em `trilha_eventos` como `dc360_app` recusados com "permission denied".
- Procurei teste que trave as duas defesas novas: as mutações M1 e M3 sobreviveram (achados B1 e B2).

## Achados

- **B1, corrige antes de crescer:** nenhum teste trava o escape da legenda na seção "Registros capturados que não puderam ser recuperados". Reprodução: remover `escapar(...)` em `documentos/laudo.ts#blocoEvidenciasPerdidas` e rodar `saida-de-municipio`, `pacote-de-saida-contrato`, `saida-nao-declara-inexistente`, `documentos`, `assinatura-ausente-no-documento` e `prova-perdida-e-ponto-da-vistoria`: todos verdes. A correção 3 passou a levar essa legenda (texto do agente) ao laudo do pacote, o documento que fica com o município. O código escapa hoje (provado pela sonda); o que falta é o caso negativo que impeça a regressão. Sugestão: um caso com legenda contendo HTML em `saida-de-municipio.test.ts`, comparando rota e pacote.
- **B2, anotado:** a conferência de prefixo de `conferirAssinatura` não tem teste (M1 sobrevive). Hoje é inalcançável pelos dados, porque o banco recusa chave fora do prefixo; é a segunda camada.
- **B3, anotado (anterior à etapa):** a cópia da assinatura e das fotos (`ler` em `saida/pacote.ts:926-968`) não confere o prefixo antes de baixar; depende só das restrições do banco, que existem para as três colunas.
- **B4, anotado (anterior à etapa):** `celulaCsv` neutraliza `= + - @`, tabulação e retorno de carro (o conjunto do guia OWASP); não trata espaço inicial nem variantes de largura total, que as planilhas atuais não avaliam como fórmula.

## Não verificado

- O pacote com o armazenamento S3 real (a sonda usa o armazenamento em memória; as chaves são literais nos dois).
- A suíte e2e de navegador (seções 28 e 29); a prova desta dimensão é pela API.
- O run do CI do SHA (não lido); PostgreSQL 17 (a prova local foi em PGlite e na suíte de isolamento local).

## Risco residual

B1: uma refatoração que perca o `escapar` da legenda passa pelos testes e abre XSS armazenado no laudo do pacote. B2 e B3 dependem da restrição do banco continuar existindo. Fora isso, o pacote respeita o isolamento, a permissão, o escape, a neutralização de CSV, o caminho do ZIP e a imutabilidade.

## Motivo do humano

Nenhum: tudo o que é desta dimensão foi verificável por execução e inspeção.
