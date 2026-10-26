# V2-F02-E07: idempotência da criação do chamado e da chave de foto

## Fatos

**Base:** `origin/v2/f02` em `257bd42` (lote 1 juntado, inclusive o fuso da E09 em `POST /ocorrencias`, mantido: a rota
lê `organizacoes.uf` antes do `proximo_protocolo`). Ramo `trab/f02-2e-e07-idempotencia`. Não toca `servidor.ts`,
`config.ts`, `index.ts` do shared, `apps/web/src/dados/http.ts` nem `apps/api/src/contrato/**`.

**Migração 052** (`db/migrations/052_chave_de_criacao_do_chamado.sql`, com `desfazer/052_chave_de_criacao_do_chamado.sql`):
`ocorrencias.chave_de_criacao uuid` (nula) com o índice único PARCIAL `ocorrencias_chave_de_criacao`
`(organizacao_id, chave_de_criacao) WHERE chave_de_criacao IS NOT NULL`; e `evidencias_idempotencia_por_ocorrencia`
`(organizacao_id, ocorrencia_id, idempotency_key) WHERE idempotency_key IS NOT NULL`. RLS e grants não mudam (a concessão
é por tabela; as duas tabelas já têm RLS forçada).

**Dados existentes (checagem antes do índice de evidências).** O índice novo não pode ser violado por dado antigo: a
migração 004 já criou `evidencias_idempotencia` único em `(organizacao_id, idempotency_key)`, e toda linha que repetisse
(organização, ocorrência, chave) repetiria também (organização, chave). O índice novo é MAIS FRACO que o da 004 e não
rejeita nada que ele já não rejeitasse. Prova: o teste `chave-de-criacao-migracao.test.ts` leva a base à 051, semeia, grava
evidências com chave (inclusive a mesma chave em dois municípios, como a 004 permite), confere por consulta que nenhum grupo
(organização, ocorrência, chave) repete, aplica a 052 sem erro e confere que nenhum chamado antigo ganhou chave. Em
produção a mesma consulta (`SELECT 1 FROM evidencias WHERE idempotency_key IS NOT NULL GROUP BY organizacao_id,
ocorrencia_id, idempotency_key HAVING count(*) > 1`) deve voltar vazia, e pela razão acima volta. O índice fica pelo contrato
da etapa e como segunda rede se a 004 for afrouxada um dia (ver `apps/api/PENDENCIAS.md`).

**Shared:** `aberturaOcorrenciaSchema` ganha `chaveDeCriacao: uuidSchema.optional()` (aditivo). `chave_ja_usada_em_outro_registro`
sai de `CODIGOS_RESERVADOS` e entra em `CODIGOS_DE_ERRO` (409, `permanente`); o catálogo passa de 92 a 93 códigos.

**API:**

- `POST /ocorrencias` (`rotas/ocorrencias.ts`): com chave, lê `(organizacao_id, chave_de_criacao)` ANTES do
  `proximo_protocolo`; achando, devolve 200 `{ id, protocolo }` do chamado existente, sem gerar protocolo e sem novo evento
  `registro` na trilha. Sem achar, cria (201) gravando a chave. Na corrida, o segundo INSERT cai no índice (23505; só esse
  índice é tratado), a transação inteira volta (o `proximo_protocolo` roda nela, então a sequência não é consumida), a rota
  relê em transação nova e devolve 200. Sem chave: comportamento de antes (201 e um chamado por pedido). Reenvio com corpo
  diferente devolve o chamado original, sem alterá-lo.
- `POST /evidencias/autorizar-envio` (`rotas/evidencias.ts`): achada a chave, depois da conferência do autor (que continua
  primeiro, para não virar oráculo), se a ocorrência da evidência achada difere da pedida, responde 409
  `chave_ja_usada_em_outro_registro` sem gravar nada. Mesma ocorrência continua devolvendo a mesma evidência.
- Chave de OUTRO município nunca chega ao 409: a RLS a esconde e o pedido segue o fluxo normal (201 em cada município).

**Painel:** `NovaOcorrencia.tsx` gera o uuid na abertura do formulário (`useState(() => novaChaveDeCriacao())`, função
nova em `ocorrencia-regras.ts`, com plano B por `getRandomValues` para http fora de localhost) e `montar()` o põe no corpo
de todo envio, inclusive o da confirmação depois da lista de duplicidades.

**Compatibilidade com o campo instalado (conclusão pedida).** O 409 de chave alheia só vale se a chave de foto do campo for
um UUID por foto. Conferido: em `apps/campo/src/app/(agente)/vistoria/[id].tsx` a foto recebe `Crypto.randomUUID()` na
captura (linha 1635) e a assinatura, `rascunho.assinaturaIdempotencyKey ?? Crypto.randomUUID()` (linha 1853), guardada no
rascunho e reaproveitada em concluir, corrigir e concluir de novo, sempre da mesma ocorrência; `packages/campo/src/fila.ts`
carrega a mesma chave da foto até `/evidencias/autorizar-envio` (`transporte.ts:243`). Não existe caminho que reaproveite uma
chave de foto entre ocorrências, então o aparelho instalado não recebe o 409 em uso normal. Se um dia receber, o transporte
trata 4xx como permanente e o item da fila vira `bloqueado` (em vez de a foto entrar na ocorrência errada, que era o defeito).
Campo opcional na criação, status e `erro` das respostas existentes inalterados, `/v1` e espelho iguais.

**Migração e testes pré-existentes ajustados:** a 052 real passou a ocupar o número que `migracoes-regras.test.ts` e
`desfazer-migracao.test.ts` usavam para migrações sintéticas; elas viraram 053, e o caso "a última das 51 existentes" passou
a usar só as 51 primeiras. Nenhum caso novo ou removido nesses dois arquivos.

**Testes novos:**

- `apps/api/test/chave-de-criacao.test.ts`, 16 casos: mesma chave devolve mesmo `id` e `protocolo` e a sequência avança uma
  vez; corpo diferente não altera; sem chave, dois chamados e dois números; chaves diferentes; chave não uuid, 422 sem
  consumir número; sem credencial, 401; mesma chave em A e B cria um em cada e o reenvio de cada lado devolve o seu; B não lê
  o chamado de A; a sequência de A não gasta número de B; a corrida (a primeira leitura é cegada, o INSERT cai no 23505 real,
  a transação volta, sequência e contagem de chamados inalteradas, 200 com o mesmo chamado); sem chave a conferência não
  acontece; foto: mesma ocorrência devolve a mesma evidência, outra ocorrência é 409 sem gravar, o índice do banco recusa fora
  da rota, A e B gravam uma cada com a mesma chave, ocorrência de outro município segue 404.
- `db/test/chave-de-criacao-migracao.test.ts`, 9 casos: a 052 sobre dado antigo; coluna e índices; 23505 no mesmo município;
  aceita em dois; nula repete; o índice da evidência sozinho (o da 004 solto numa cópia) e junto; aplicar, desfazer e
  reaplicar com colunas, índices, políticas, RLS ligada e forçada e funções idênticas.
- `packages/shared/test/chave-de-criacao.test.ts`, 4 casos, e 1 caso novo em `catalogo-de-erros.test.ts`.
- `apps/web/test/chave-de-criacao.test.ts`, 6 casos.
- `protocolo-sequencias-antes-e-depois.txt`: três POST com a mesma chave (201, 200, 200) e `protocolo_sequencias` 478, 479,
  479, 479; depois dois POST sem chave (480, 481); chave não uuid, 422.

**Desfazer, provado de outro jeito:** nesta máquina os 5 casos de `desfazer-migracao.test.ts` que reprovam são os que
chamam o CLI por `spawnSync` do tsx (DV-46); os de biblioteca passam. A 052 e a sua volta foram provadas por
`desfazerUltimaMigracao` sobre PGlite no teste acima (esquema idêntico depois de desfazer, e idêntico de novo depois de
reaplicar). `npm run migrar` (efêmero) aplica as 52 do zero; `--conferir` contra o banco efêmero vazio sempre sai 1
("faltam 52"), por desenho, e não prova nada: o "aplica do zero" está em `migrar.test.ts`.

**Portões (saídas nesta pasta):** `typecheck.txt` (typecheck, lint, `lint:teto` em 431 e `formato:conferir`, verdes),
`npm-test.txt` (`npm test`), `isolamento.txt` (`test:isolamento`, `isolamento.test.ts` 137 verdes), `test-scripts.txt`
(`CI=true npm run test:scripts`), `conferencias.txt` (`conferir:numeros`: todos os números batem; `baseline.test.mjs` 29 de
29; `auditar.mjs`: runtime limpo), `regras-de-conteudo.txt`, `testes-da-etapa.txt`.

Números: shared 412 de 413 (o 1 é o de symlink), API 1959 verdes mais 2 de ambiente (1961, 34 puladas), web 797, motor de
campo 238, console 377 verdes, db 440 verdes de 454 (8 de ambiente: 5 de `desfazer-migracao` e 3 de `guarda-da-semente`, 6
puladas), `isolamento.test.ts` 137. Os únicos reprovados são os de ambiente Windows já conhecidos e fora desta parte:
`regras-de-conteudo` 1 caso (EPERM em symlink, DV-46), `desfazer-migracao` 5, `guarda-da-semente` 3 e `semear-homologacao`
2. Além deles, o console reporta 1 SUÍTE falha (`no-navegador.test.ts`: os 8 casos passam e o `afterAll` estoura 10 s ao fechar
o navegador, também isolado; o console não foi tocado por esta parte e a máquina tinha outros agentes rodando).
`test:scripts`: 831 casos, 808 verdes, 0 falhas e 23 pulados, depois de criado o `INDEX.md` (a primeira rodada reprovou só por
falta dele). O `test-scripts.txt` guardado é a rodada verde; como o log não pode conter o próprio hash, o `INDEX.md` foi
recalculado depois dela e `node dc360/scripts/conferir-indices-de-evidencia.mjs` sai 0.

## Justificativa

Toque duplo e reenvio sob sinal ruim gastavam número de protocolo oficial e abriam chamado em duplicidade. A chave é do
cliente porque só ele sabe que dois pedidos são o mesmo ato; o índice é por município porque a chave não é autoridade e não
pode revelar nada entre prefeituras; a leitura vem antes do protocolo e a corrida cai no índice porque, com a sequência
dentro da transação, o rollback devolve o número sem código extra. O 409 na chave de foto alheia troca um erro silencioso
(a foto de um chamado aparecendo no outro) por um erro visível. Ficam de fora, como a etapa manda, relato e anexo do cidadão,
um `Idempotency-Key` genérico e qualquer mudança na idempotência da sincronização do campo.

## Para o orquestrador

- **Linha do STATUS sugerida:** `V2-F02-E07: IMPLEMENTADA no ramo trab/f02-2e-e07-idempotencia (commit candidato); migração 052 (chave_de_criacao em ocorrencias e índice por ocorrência em evidencias, com desfazer); POST /ocorrencias idempotente (201/200), 409 chave_ja_usada_em_outro_registro em /evidencias/autorizar-envio; 16 testes de API, 9 de db, 5 de shared, 6 de web. Falta a validação humana: duplo clique no formulário.`
- **Dívidas pagas:** nenhuma da lista `dividas.md`.
- **Para a junção:** (1) o número 052 está ocupado; as outras partes do lote não criam migração. (2) `erros.ts` do shared: o catálogo passa a 93 e `CODIGOS_RESERVADOS` perde uma chave; se 2B/2C/2D contarem 92 em algum teste ou texto, ajustar. (3) Contagens: somei a chave `V2-F02-E07` nas quatro tabelas (`api` 16, `shared` 5, `db` 9, `web` 6) e ajustei README, `COLOCAR-DE-PE` e `RESTORE-DO-BANCO` para esta árvore; o integrador recalcula os totais na junção. (4) `migracoes-regras.test.ts` e `desfazer-migracao.test.ts` renumeraram a 052 sintética para 053: se outra parte do lote criar migração 053, trocar de novo. (5) A mensagem de 409 do aparelho: o campo não tem tela para `chave_ja_usada_em_outro_registro` (categoria `permanente`), cabe à 2B decidir se mapeia.
- **Pendências humanas:** validação do Rafael, o duplo clique em "Registrar" no formulário (E2E `test:e2e:api` NÃO foi rodado, por ordem do pedido).
- **Riscos:** (a) o índice de evidências da 052 é redundante com o da 004 (documentado e proposital); (b) reenvio com corpo diferente e a mesma chave devolve o chamado original sem avisar (em `PENDENCIAS.md`); (c) a corrida real (duas conexões) só foi simulada em memória, o 23505 e o rollback são os do Postgres, mas a concorrência de verdade fica para o HML.
