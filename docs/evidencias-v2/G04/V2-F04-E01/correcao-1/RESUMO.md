# V2-F04-E01, correção 1: ADR 0010 depois da revisão de segurança

## Fatos

**Base:** `origin/trab/f04-0a-e01-adr` em `87f37a74` (candidato da parte 0A). Só documento: nenhum código, nenhuma
migração, nenhum `package.json`. CLAUDE.md, STATUS, ESTADO-ATUAL, `dividas.md`, `pendencias-humanas.md`, a ADR 0009 e
o PAPEIS não foram tocados.

**Entrada:** relatório da segunda leitura de segurança (Codex, somente leitura, sem executar teste) sobre `87f37a74`,
com nove achados: três BLOQUEIA (1 a 3), cinco DÍVIDA (4 a 8) e uma NOTA (9). Cada achado foi conferido contra as
migrações e o código deste SHA antes de mudar a ADR. Os nove procedem.

**Conferências feitas no código (o que confirma cada achado):**

- `001_base.sql`, linhas 300 a 323: `trilha_eventos.tipo` é texto livre, sem CHECK; `autor_papel` só aceita
  `coordenador`, `operador`, `agente_campo` e `administrador` (linha 307); `origem` só `campo` e `escritorio`; a
  policy de INSERT confere só o município.
- `018_sino_de_avisos.sql`: `avisos_insercao` confere só o município; `aviso_unico_por_fato UNIQUE (organizacao_id,
  chave_do_fato)`; o gatilho `providencia_respondida_toca_o_sino` é `AFTER UPDATE`, grava a chave
  `providencia:<id>` com `ON CONFLICT ON CONSTRAINT aviso_unico_por_fato DO NOTHING` (por volta da linha 326). Um
  aviso gravado antes com essa chave engole o verdadeiro, e o aviso nasce ao fim do UPDATE, antes do comando seguinte
  da rota.
- `017_orgaos_oficio_e_email.sql`: `proximo_oficio` trava a linha de `oficio_sequencias` por `INSERT ... ON CONFLICT
  DO UPDATE` até o fim da transação; `oficios.observacoes` é texto livre; `abrir_oficio` (SECURITY DEFINER) trava o
  envio com `FOR UPDATE` e grava `oficio_aberturas`.
- `038_suspensao_eliminacao_e_operadores_do_console.sql`, linhas 834 a 1000: a ordem de apagamento põe
  `trilha_eventos` e `oficio_sequencias` na camada 0, `avisos` na 1 e `providencias` na 3; a função apaga tabela por
  tabela e só marca `organizacoes.eliminada_em` DEPOIS dos DELETE, sem travar a linha do município antes. O ciclo
  descrito pela revisão (caminho segurando o encaminhamento e esperando a unicidade de uma filha que a eliminação
  apagou sem confirmar) é possível com essa ordem.
- `apps/api/src/oficios/documento.ts`, linhas 98 a 135: imprime `providencias.responsavel`, `providencias.descricao`,
  dados da ocorrência e `oficios.observacoes` direto da coluna; o mesmo `oficioDeEncaminhamento` serve à impressão
  pela Defesa Civil e ao link (`rotas/oficios.ts`, linhas 367 e 639).
- `034_as_tabelas_centrais_tambem_nao_se_apagam.sql`, linhas 251 a 261: as permissivas de `providencias` são por
  comando e só por município, sem `TO`.
- `011_interesse_de_municipio.sql`: `interesse_municipio` sem `organizacao_id`, policy `interesse_escrita FOR INSERT
  TO dc360_app WITH CHECK (true)`, `GRANT INSERT` sem SELECT; `interesse_recente` SECURITY DEFINER.
  `db/test/catalogo/base.ts`, por volta da linha 500: a exceção declarada dispensa `organizacao_id` e
  `policy_de_contexto`, com `grants: { dc360_app: ["INSERT"] }`.
- `apps/api/src/trilha.ts` e `rotas/documentos.ts`: os GET de laudo e termos gravam `documento_emitido` na trilha
  (`registrarEmissao`) e `ocorrencia_consultas`; o GET do termo de interdição também faz `UPDATE ocorrencias`
  (`marcarInterditada`). `GET /ocorrencias/:id` e a busca gravam `ocorrencia_consultas`; o CSV grava `exportacoes`.
  Isso entra na decisão 11 como o que a lista de exceções precisa declarar.
- `packages/shared/src/erros.ts`: `dados_invalidos` é 422; `excesso_de_requisicoes` é 429 (usados na ordem de
  conferências da decisão 13).

**Arquivos mudados:**

- `docs/adr/0010-isolamento-por-orgao.md`: Contexto ampliado (o que este SHA mostra sobre trilha, 018, sequência de
  ofícios, eliminação, documento do ofício, GET que escreve e `interesse_municipio`) e seção nova "O que a segunda
  leitura de segurança mudou (correção 1)"; decisões 2, 3, 5, 6, 7 (e), 8, 9, 10, 11, 12, 13, 14, 15 e 16 refeitas
  onde os achados pedem; decisão 17 nova (os fatos do encaminhamento são gravados pelo banco); premissa P-15
  refeita; consequências por etapa, testes obrigatórios, proibições, ruins assumidas, alternativas e estado
  atualizados. Situação continua PROPOSTA.
- Nesta pasta: este RESUMO e as saídas dos portões. O `INDEX.md` da etapa recebeu só linhas novas.

## Achado a achado

| # | Achado (resumo) | Procede? | O que mudou | Onde na ADR |
| --- | --- | --- | --- | --- |
| 1 | BLOQUEIA: a classe E deixa o órgão escrever fato sem provar que aconteceu (tipo reservado na trilha; aviso antecipado com a chave legítima engole o verdadeiro no `ON CONFLICT DO NOTHING`) | Procede (001: `tipo` livre; 018: chave `providencia:<id>` e `DO NOTHING`) | A classe E deixa de existir: `trilha_eventos` e `avisos` passam à classe D para o órgão. Decisão 17 nova: evento de transição e fato de linha gravados pelo banco (gerador `AFTER UPDATE` em `providencias`, tipo vindo da tabela de transições, texto da rodada vindo do mesmo UPDATE), `enviado` e `reenviado` pela inserção da versão do dossiê, gatilho de restrição adiado que exige um evento por transição; espelho e aviso nascem do evento por gerador `AFTER INSERT`, presos a ele por chave composta (`encaminhamento_evento_id` em `trilha_eventos` e `avisos`, chave do aviso `encaminhamento_evento:<id>`). Os geradores são SECURITY DEFINER de gatilho (não chamáveis diretamente). O `dc360_app`, sob qualquer ator, não grava evento de transição, espelho `portal` nem aviso do encaminhamento; inserção direta só por lista positiva de tipo por ator (órgão: `visualizado`; sistema: `lembrete`, `escalonado`). Negativos obrigatórios: aviso anterior à resposta, evento de tipo reservado, trilha de qualquer tipo, `autor_tipo = 'link'` | Contexto; decisões 1, 3, 7 (e), 8, 9, 13 (3), 15, 16, 17; consequências E03, E05, E07, E08, E11; testes E03, E05, E07 |
| 2 | BLOQUEIA: a ordem N10 a N12 não exclui ciclo (o 018 grava aviso antes do evento; a eliminação apaga filha sem confirmar e espera N10 enquanto o caminho segura N10 e espera a unicidade dessa filha) | Procede (018 `AFTER UPDATE`; 038 apaga filhas antes de `providencias` sem travar o município antes) | Decisão 14 refeita: todo caminho do encaminhamento toma N1 em `FOR SHARE` como primeira trava e relê o município (revendo a regra "não toma N1 a N9"); protocolo comum com a eliminação, que toma N1 por UPDATE antes do primeiro DELETE (obrigação da F03 pela ADR 0009, conferida por teste na E05); níveis novos N11 (sequência de ofícios) e N13 (o que o banco grava a partir do evento); N10 por UPDATE sem coluna de chave ou `FOR NO KEY UPDATE`, nunca `FOR UPDATE`, com `id`, `organizacao_id` e `orgao_id` imutáveis; o 018 de `providencias` é aposentado na 070 e o aviso nasce depois do evento; tabela da ordem efetiva por caminho (transição, criação, emissão do ofício, reenvio, link, visualização, fatos de linha, relógios). Testes novos: chave idempotente contra eliminação; emissão de ofício contra transição e contra outra emissão | Contexto; decisões 7 (e), 8, 14, 17; proibições; ruins; alternativas; consequências E05, E07, E08, E10 |
| 3 | BLOQUEIA: as observações do ofício (e os demais textos livres) saem fora do controle do dossiê, inclusive nos legados | Procede (`documento.ts` imprime `oficios.observacoes`, `providencias.descricao` e `responsavel` direto da coluna, nas duas rotas) | Decisão 5 ampliada: só dois canais levam texto livre ao órgão, o dossiê (`pedido` e `observacoes_da_coordenacao` como "texto livre dirigido ao órgão", em `campos_sensiveis`, com retenção) e os eventos visíveis a ele (chaves de texto por tipo, lista de inclusão); os textos livres de `providencias` e `oficios` nunca saem direto da coluna, na família do órgão nem no documento do ofício em rota nenhuma (impressão da Defesa Civil inclusive); legados: versão `migracao` sem texto livre, legado aberto "pedido em revisão" até a Defesa Civil recompor; retenção dos textos dos eventos pedida à F05-E09 | Decisões 5, 10, 12, 16; consequências E04, E08, E12; testes E12; alternativas |
| 4 | DÍVIDA: "linha própria" da classe B precisa de matriz explícita de escrita (autopromoção e troca de órgão) | Procede (a 055 não está nesta árvore; uma policy só por `usuario_id = app_ator_id()` permitiria) | Matriz fechada e positiva na decisão 3: `usuario_orgao` não escreve em `orgao_vinculos` nem em `usuarios` (nenhum campo, em especial os de autorização), nem em `sessoes` e nas tabelas da conta por comando; única escrita pessoal na F04 é a marca de leitura em `avisos_do_orgao_lidos`. Teste da E05 no banco: autopromoção a gestor, troca de órgão, reabertura de vínculo, vínculo novo e mudança de papel ou `ativo` da conta, todos recusados, e `app_orgao_vigente()` continua nula | Decisão 3; consequências E05; testes E05; proibições |
| 5 | DÍVIDA: `interesse_municipio` (grant de INSERT, sem `organizacao_id`, formulário anterior ao ator) não cabe em "sem alcance" nem em D | Procede (011 e `catalogo/base.ts`) | Categoria nominal "anterior ao município", com essa tabela só; mantém a exceção existente e acrescenta RESTRICTIVE de INSERT `app_organizacao_atual() IS NULL AND app_ator_tipo() IS NULL`, o único `IS NULL` sobre contexto admitido, porque fecha (recusa todo ator autenticado) sem quebrar o formulário público. A E06 descobre toda tabela no catálogo do Postgres e exige exatamente uma classificação, inclusive "sem alcance" e "anterior ao município" | Decisões 2, 3, 16; consequências E05, E06; testes E05, E06 |
| 6 | DÍVIDA: o evento do link (`autor_tipo = 'link'`, sem autor, sob `sistema`) contradiz "autor igual ao ator"; o CHECK de `autor_papel` (001:307) não aceita `usuario_orgao` | Procede (001, linha 307; decisões 8 e 12 da primeira redação) | Executor técnico separado do autor: só `abrir_oficio` (redefinida pela E12) grava o `visualizado` de autor `link`, com `entregue`, preso ao envio (`envio_id`, chave composta, CHECK e unicidade por envio) e à versão do dossiê que a página mostra; nenhuma policy do `dc360_app` aceita `autor_tipo = 'link'`; a rota do link não escreve. `usuario_orgao` em `autor_papel` e `portal` em `origem` entram na 068 (E03), se a F03 não fizer | Decisões 7 (e), 8, 12, 16; consequências E03, E12; testes E12 |
| 7 | DÍVIDA: a regra de GET mistura registro de acesso com consumo de capacidade (o link muda o resultado seguinte) e o teste só vê o estado final | Procede (017: abertura e 410; a lista de "tabela de registro" não comporta o efeito) | Decisão 11: três naturezas nomeadas (registro de acesso; consumo de capacidade, só o link; ato administrativo por GET legado, os documentos de vistoria e o termo de interdição, que este SHA mostra mudando estado), cada rota com todas as tabelas e efeitos; proibição absoluta para GET da família autenticada do órgão; o teste captura comandos e contadores de escrita e prova, com casos plantados, que acusa INSERT revertido e par INSERT e DELETE | Contexto; decisões 11, 12, 16; consequências E11; testes E11; proibições |
| 8 | DÍVIDA: "conferir ação e corpo antes da busca" contradiz "nada diferente de 404 antes da busca" | Procede (decisão 13, item 2, da primeira redação) | Regra escolhida: recusa que não depende do recurso (403 de papel no órgão, 422 de corpo, 429 de taxa por solicitante e órgão) pode sair antes da busca, igual para todo id; depois a busca sob o ator (404); depois as que dependem do recurso. Decisão 6 alinhada. Teste de status, corpo e cabeçalhos iguais entre ids nos três casos, na E08 e na E13 | Decisões 6, 13 (2); consequências E08, E13; testes E13; alternativas |
| 9 | NOTA: dizer como cada policy da classe A substitui ou restringe as existentes (`USING` e `WITH CHECK` do UPDATE), com teste por comando; verificar as SECURITY DEFINER chamando cada uma sob ator de órgão | Procede como redação (034 e 017: permissivas por município sem `TO`) | Decisão 2: as permissivas por município ficam; o ramo do órgão nunca entra numa PERMISSIVE; a condição da classe A é RESTRICTIVE `TO dc360_app` por comando, UPDATE com `USING` e `WITH CHECK`; tabela nova nasce com permissiva e restritiva; sigilo por E; teste por comando e ator. Decisão 15: a E06 chama cada função privilegiada sob Maria, inclusive as `antes_do_ator`, e confere resultado e efeitos; declaração nova `gatilho` | Decisões 2, 15; consequências E05, E06; testes E05, E06 |

## Justificativa

O ponto comum dos três bloqueios é o mesmo que a ADR 0009 aprendeu nas três rodadas dela: conferir QUEM e ONDE não
basta, é preciso conferir O QUE e EM QUE ORDEM. Por isso a correção do achado 1 não aperta o `WITH CHECK` da classe
E, e sim tira do `dc360_app` a escrita dos fatos: um `WITH CHECK` mais esperto ainda receberia tipo, chave e texto do
comando. Pelo mesmo motivo a distinção entre escrita do gatilho e escrita direta não usa `pg_trigger_depth()` nem
variável de sessão (marcas que o `dc360_app` alcança), e sim geradores SECURITY DEFINER de gatilho, que o Postgres
não deixa chamar diretamente. No achado 2, provar que a ordem de apagamento basta seria frágil (a revisão mostrou o
contraexemplo com a unicidade); a trava comum em N1 fecha o caso para todo nível e é o modo que o login já usa.

Nenhuma norma foi citada por número. Os rótulos "H novo, a numerar" ficam para o
orquestrador numerar em `pendencias-humanas.md`, que esta parte não edita.

## Portões (saídas nesta pasta)

- `regras-de-conteudo.txt`: `npx vitest run packages/shared/test/regras-de-conteudo.test.ts`, depois de
  `npm ci --ignore-scripts` em `dc360/`.
- `gerar-estado.txt`: `node scripts/roadmap/gerar-estado.mjs --conferir`, da raiz.
- `node dc360/scripts/conferir-indices-de-evidencia.mjs`, da raiz, verde com o `INDEX.md` da etapa já com as linhas
  desta pasta (não arquivado aqui porque a saída depende do próprio índice).
- Fim de linha: arquivos novos normalizados para LF e conferidos com `git ls-files --eol` antes do commit.
- `dc360/node_modules` apagado depois dos portões.

## Para o orquestrador

**Mudanças exatas no plano da F04** (nenhum lote novo; escopo das partes):

- **0B (andaime do banco):** acrescentar `db/test/catalogo/f04-e12.ts` (a E12 passa a ter migração e redefine uma
  função privilegiada, `abrir_oficio`).
- **0D (E03 parte shared):** além de `TRANSICOES_DO_ENCAMINHAMENTO`, `EVENTOS_DO_ENCAMINHAMENTO` em
  `encaminhamento.ts`: por tipo, se nasce do banco ou por inserção direta, que ator o insere diretamente, se é
  visível ao órgão, as chaves de texto admitidas no `detalhe` e o que nasce dele (espelho, aviso, aviso do órgão); com
  teste no shared. Inclui o papel na tabela de transições, como a primeira redação já pedia.
- **0E (E04 parte shared):** `CAMPOS_DO_DOSSIE` ganha `pedido` (obrigatório) e `observacoes_da_coordenacao`
  (opcional), categoria "texto livre dirigido ao órgão", em `campos_sensiveis`; a versão `migracao` não copia texto
  livre.
- **1A (E02, E03 e E04 banco):** 067: as colunas do texto da rodada que o gerador copia; backfill de estado antes de
  existir gerador. 068: os geradores SECURITY DEFINER de gatilho (evento da transição e fato de linha; espelho e
  aviso a partir do evento) com a declaração `gatilho` em `catalogo/f04-e03.ts`; o gatilho de restrição adiado;
  `encaminhamento_evento_id` com chave composta em `trilha_eventos` e `avisos`; `portal` em `origem` e
  `usuario_orgao` em `autor_papel` da trilha (passam da 071 para a 068); RESTRICTIVE de INSERT em
  `encaminhamento_eventos` (tipos diretos por ator) e em `trilha_eventos`; backfill `migracao` antes dos geradores;
  ordem de apagamento com os eventos depois de `avisos` e `trilha_eventos`. 069: gerador de `enviado` e
  `reenviado` a partir da versão do dossiê; versão 1 `migracao` sem texto livre; legados abertos marcados "pedido em
  revisão", com a contagem na evidência.
- **1B (E04 API):** `comporDossie` com `pedido` e `observacoes_da_coordenacao`.
- **2B (E07, 070):** aposenta o gatilho `providencia_respondida_toca_o_sino` e a função
  `aviso_de_providencia_respondida` (com `desfazer/` que os recria); RESTRICTIVE de INSERT em `avisos` `TO
  dc360_app` com a lista positiva dos tipos que a aplicação grava; privilégio de coluna sem `id`,
  `organizacao_id` e `orgao_id`; teste de aviso único antes e depois da 070. A decisão de aposentar o 018 sai da 4C.
- **2C (E12):** ganha uma migração própria (redefine `abrir_oficio`: N1, releitura, evento `visualizado` de autor
  `link` com envio e versão), numerada na junção do lote 2 depois da 070 (P-02 desloca as seguintes), e o catálogo
  `f04-e12.ts`; o escopo em `rotas/oficios.ts` deixa de ser só `/publico/oficio/:token` e passa a incluir a impressão
  pela Defesa Civil (`GET /oficios/:id/documento`, por volta das linhas 359 a 367) e o carregador de dados comum,
  porque o documento é um só e sai do dossiê nas duas rotas. Risco sobe de alto para crítico (função privilegiada
  redefinida): Opus com revisor Opus.
- **3A (E05, 071):** sem classe E; `trilha_eventos` e `avisos` na classe D; categoria "anterior ao município";
  matriz de escrita da classe B com o teste de autopromoção; composição da classe A por comando; os negativos da
  decisão 17 sob ator de órgão; testes concorrentes com a chave idempotente contra a eliminação e a emissão de
  ofício; teste de que a eliminação juntada toma N1 antes do primeiro DELETE. Sai da 071 o CHECK de `origem` (vai
  para a 068).
- **3B (E06):** uma classificação por tabela descoberta (inclusive "sem alcance" e "anterior ao município");
  nenhuma PERMISSIVE de classe A com o ramo do órgão; RESTRICTIVE em cada comando; chamada de cada função
  privilegiada sob ator de órgão com resultado e efeitos; a declaração `gatilho`.
- **3C (E08):** transição só por UPDATE condicional, sem gravar evento, espelho ou aviso
  (`encaminhamentos/eventos.ts` só grava `visualizado`); N1 em `FOR SHARE` primeiro em todo caminho; a ordem de
  conferências da decisão 13; a lista de inclusão sem os textos livres de `providencias` e `oficios`; testes de
  status, corpo e cabeçalhos.
- **4B (E10):** N1 antes de N10; `lembrete` por inserção direta do sistema; `prazo_alterado` gerado pelo banco.
- **4C (E11):** acrescenta os tipos `encaminhamento_*` ao mapeamento e ao gerador da 068 (redefinição declarada em
  `catalogo/f04-e11.ts`), nunca INSERT do órgão em `avisos`; `get-nao-escreve.test.ts` com as três naturezas, todas
  as tabelas e efeitos por rota, e o mecanismo que acusa escrita revertida.
- **5A (E13):** status, corpo e cabeçalhos iguais entre ids no 403 de papel, no 422 e no 404.
- **5B (E14):** `prioridade_alterada` como fato de linha gerado pelo banco (mapeamento e gerador redefinidos na 075,
  declarado no catálogo).
- **6A (E16):** `escalonado` por inserção direta do sistema; N1 antes de N10.
- **Serialização (seção 3 do plano):** o gerador de evento e o de espelho e aviso: 068, depois 074 e 075;
  `abrir_oficio`: migração da 2C; policies de `avisos`: 070; CHECK de `origem` e de `autor_papel` da trilha: 068 (não
  mais 071).

**Dependência da F03 a confirmar no plano da F03:** a E09 da F03 redefine `executar_eliminacoes_vencidas` tomando N1
(UPDATE da linha do município) antes do primeiro DELETE, como a ADR 0009 (decisão 7) manda; a 038 desta árvore não o
faz. Sem isso, a 3A não junta.

**Pendências novas do Rafael** (numeração a definir pelo orquestrador):

1. **GET de documento que pratica ato.** `GET .../termo-de-interdicao` (e o PDF) muda o estado da ocorrência
   (`marcarInterditada`), e os documentos de vistoria registram `documento_emitido` na trilha. A ADR os nomeia como
   "ato administrativo por GET (legado)", fora da família do órgão e sem entrada nova permitida. Pergunta: converter
   em POST numa etapa fora da F04 (recomendação: F09, junto do documento emitido da ADR 0013)?
2. **Legados sem texto livre.** Encaminhamento aberto antes da F04 só volta ao órgão depois de a Defesa Civil
   recompor o dossiê (versão 2); até lá o órgão vê só protocolo, tipo e endereço. Recomendação: aceitar.
3. **Retenção dos textos visíveis ao órgão nos eventos** (resposta, motivos, esclarecimentos): pedido de escopo à
   F05-E09, junto do CP-10, que hoje fala só de `campos_sensiveis`. Recomendação: aceitar e registrar no CP-10.

**Segunda leitura de segurança:** nova rodada (Codex, somente leitura) sobre o SHA desta correção, antes do H116.
