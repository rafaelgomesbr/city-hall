# V2-F04-E01, correção 2: guarda N1 do órgão e correlação entre transição, evento e dossiê

## Fatos

**Base:** `origin/trab/f04-0a-e01-adr` em `3f036efb` (correção 1). Só documento: nenhum código, nenhuma migração,
nenhum `package.json`. CLAUDE.md, STATUS, ESTADO-ATUAL, `dividas.md`, `pendencias-humanas.md`, a ADR 0009 e o PAPEIS
não foram tocados.

**Entrada:** segunda rodada da segunda leitura de segurança (Codex, somente leitura) sobre `3f036efb`: sete achados
anteriores fechados, dois parciais, dois pontos novos que bloqueiam (1 e 2) e duas dívidas (3 e 4).

**Arquivo mudado:** `docs/adr/0010-isolamento-por-orgao.md` (seção nova "O que a segunda rodada mudou (correção 2)";
decisões 3, 12, 13, 14, 15, 16 e 17; consequências, testes, proibições, ruins, alternativas e estado). Situação
continua PROPOSTA.

**Demonstração da regra do Postgres** (`demo-for-share.mjs` e a saída `demo-for-share.txt`, nesta pasta): Postgres
16.4 (PGlite, banco descartável em memória), `organizacoes` com RLS forçada, as permissivas da 034 e a RESTRICTIVE de
UPDATE da classe C. Como `dc360_app` sob ator de órgão: leitura comum, 1 linha; `FOR SHARE`, 0; `FOR KEY SHARE`, 0;
UPDATE, 0. A função `travar_municipio_para_escrita()` toma a trava (só a linha do município do contexto fica com o
`xmax` da transação; as outras não), e com a trava na mão o UPDATE do órgão continua em 0 linhas e o nome não muda.
Sob servidor, o `FOR SHARE` direto passa. Município eliminado e contexto ausente: recusa. Catálogo: assinatura
`travar_municipio_para_escrita()`, SECURITY DEFINER, `search_path` e `row_security=off` fixados, ACL só `dc360_app`.
Limite: uma conexão só, por isso a trava é vista pelo `xmax` e não por uma segunda conexão esperando; o teste com duas
conexões é da E02 e da E05.

## Item a item

| # | Item | Como fechou | Onde na ADR |
| --- | --- | --- | --- |
| Novo 1 (BLOQUEIA) | A guarda N1 em `FOR SHARE` não funciona para o órgão: o Postgres aplica ao `SELECT ... FOR SHARE` o `USING` da policy de UPDATE, e a classe C nega UPDATE ao órgão | Procede, e foi demonstrado (acima). Regra citada: documentação de `CREATE POLICY`, tabela das policies por tipo de comando, linha `SELECT FOR UPDATE/SHARE` (aplica o `USING` de SELECT e o de UPDATE à linha existente), e a cláusula de trava exige privilégio de UPDATE; vale para as quatro forças. Saída: função `public.travar_municipio_para_escrita()`, `RETURNS void`, sem parâmetro, SECURITY DEFINER, `search_path` fixo, `row_security = off`, corpo de um `PERFORM ... FOR SHARE` da linha do contexto (`eliminada_em IS NULL`), erro próprio sem linha, `EXECUTE` só ao `dc360_app`; usada por todo ator, como primeiro comando de todo caminho; declaração nova `trava` na decisão 15; exceção declarada na decisão 16. Testes dos dois limites: E02 (Rita: trava A e não B, nada escrito, ACL) e E05 (Maria: trava A e não altera; não trava B; `FOR SHARE` direto devolve zero como regressão). Alternativa da policy com `USING` aceitando e `WITH CHECK` recusando descartada: deixaria o órgão tomar `FOR UPDATE` na linha do município | Correção 2 no Contexto; decisões 3 (classe C), 12, 14 (tabela N1, regras 1, 2 e 2a, item 5), 15, 16; testes E02, E05; proibições; alternativas |
| Novo 2 (BLOQUEIA) | Estar em `enviado` não prova a transição; versão adicional do dossiê gerava `reenviado`; contagem não separa transições repetidas | Procede. Decisão 17, item 2 refeito: todo evento gerado nasce de `providencias` (`AFTER INSERT OR UPDATE`), `enviado` e `reenviado` inclusive; a inserção do dossiê não gera evento. Um fato por comando (BEFORE recusa UPDATE que muda estado e coluna mapeada juntos). `fato_seq` na linha e no evento, escrito só pelo banco, único por encaminhamento. `dossie_versao_vigente` escrita só pelo banco (avança só em `devolvido` para `enviado` e na recomposição do legado, com o fato novo `dossie_recomposto`); o evento de versão leva `dossie_versao`, com chave estrangeira adiada para a versão e unicidade por versão; a versão exige, ao confirmar, exatamente um evento que a declare. O gatilho de restrição adiado dispara por comando, com o `OLD` e o `NEW` daquele comando, e compara cada transição com o seu evento pelo `fato_seq`, sem contar. Negativos: versão adicional sem transição (em `enviado` e em `aceito`); múltiplas transições na mesma transação com repetição (dois `respondido`); transição sem versão; estado e coluna juntos; recomposição sem a marca; gerador plantado que pula, repete `fato_seq` ou omite versão | Decisão 17, itens 1, 2, 5, 7 (novo); decisão 14, item 5 (reenvio com a versão antes do UPDATE); consequências E02, E03, E04, E08; testes E03, E04; proibições; ruins; alternativas |
| Dívida 3 | Reservar a chave `encaminhamento_evento:<id>` | Atribuída à E07 (070, onde já nascem as policies de `avisos`): RESTRICTIVE de INSERT exige `encaminhamento_evento_id` nulo e a chave fora do prefixo (`starts_with`, nunca `LIKE`); CHECK de coerência entre referência, chave e tipo; a lista de tipos do CHECK é redefinida na E11. Os geradores (E03, redefinido na E11) gravam o aviso sem `ON CONFLICT`: conflito é erro e a transição volta. Testes da E07 sob Rita e `sistema`, CHECK inclusive como dono, e conflito plantado num banco descartável | Decisão 17, itens 3 e 4; consequências E03, E07, E11; testes E07; proibições |
| Dívida 4 | Consistência de contratos e testes | (a) O negativo passa a "sem mudança no estado nem nas colunas mapeadas" (decisão 17, item 6, e teste da E03). (b) A criação deixa de emitir ofício na mesma transação: a emissão roda depois, como caminho próprio, e N11 nunca vem depois de N13; a regra 1 da decisão 14 explica por que a versão 1 do dossiê depois do espelho não é volta de nível (chave com id nascido na mesma transação), e o reenvio insere a versão antes do UPDATE. (c) O 429 entra na comparação de status, corpo e cabeçalhos da E08 e da E13, com os cabeçalhos do limite comparados sob relógio fixo e a contagem igual para id próprio e alheio. (d) A proibição geral do 403 remete à exceção da decisão 13, item 2 | Decisões 13 (item 2), 14 (regra 1, item 5), 17 (item 6); consequências E08, E13; testes E03, E13; proibições; ruins |

## Portões (saídas nesta pasta)

- `regras-de-conteudo.txt`: `npx vitest run packages/shared/test/regras-de-conteudo.test.ts`, depois de
  `npm ci --ignore-scripts` em `dc360/`. 9 de 10 passam, travessão e normas inclusive. A falha é a conhecida e
  alheia a esta correção (a mesma da correção 1): o caso que simula o ENOENT cria um link simbólico, e o Windows deste
  ambiente recusa a criação com EPERM.
- `gerar-estado.txt`: `node scripts/roadmap/gerar-estado.mjs --conferir`, da raiz.
- `node dc360/scripts/conferir-indices-de-evidencia.mjs`, da raiz, verde com o `INDEX.md` da etapa já com as linhas
  desta pasta (não arquivado aqui porque a saída depende do próprio índice).
- Fim de linha: arquivos novos e o editado em LF, conferidos com `git ls-files --eol`. `dc360/node_modules` apagado
  depois dos portões.

## Para o orquestrador

**Mudanças exatas no plano da F04** (nenhum lote novo; somam-se às da correção 1):

- **0B (andaime do banco):** `db/test/catalogo/f04-e02.ts`, se ainda não estiver previsto (a E02 cria
  `travar_municipio_para_escrita()`); a declaração `trava` entra no tipo do catálogo do órgão junto das outras quatro
  (ou na 3B, se o tipo nascer lá).
- **0D (E03 parte shared):** `EVENTOS_DO_ENCAMINHAMENTO` ganha `dossie_recomposto` e declara, por tipo, se leva
  `fato_seq` e `dossie_versao`; o teste do shared confere que só `enviado`, `reenviado` e `dossie_recomposto` declaram
  versão nova.
- **1A (E02, E03 e E04 banco):** 067: `fato_seq` e `dossie_versao_vigente` em `providencias` (backfill dos legados:
  `dossie_versao_vigente` 1), e `travar_municipio_para_escrita()` com o catálogo e o teste sob Rita. 068: gerador
  `AFTER INSERT OR UPDATE` em `providencias` (criação, transição, fato de linha) com `fato_seq`; um fato por comando no
  `BEFORE UPDATE`; gatilho de restrição adiado por comando; unicidade do `fato_seq` e de um evento de versão por
  versão; CHECK por tipo; gerador de espelho e aviso sem `ON CONFLICT`. 069: a inserção do dossiê deixa de gerar
  evento; versão sequencial; gatilho adiado versão para evento; chave estrangeira adiada do evento para a versão;
  recomposição do legado com `dossie_recomposto`. Os testes de correlação (decisão 17, item 7) se dividem entre a E03
  e a E04.
- **1B (E04 API):** a criação grava o encaminhamento e depois a versão 1, sem ofício na mesma transação; o reenvio e a
  recomposição gravam a versão nova antes do UPDATE.
- **2B (E07, 070):** a RESTRICTIVE de INSERT em `avisos` ganha `encaminhamento_evento_id` nulo e a chave fora do
  prefixo; CHECK de coerência de `avisos`; os testes da dívida 3.
- **3A (E05):** os dois limites da guarda sob Maria.
- **3B (E06):** a declaração `trava` e o teste comportamental dela.
- **3C (E08):** toda rota de escrita chama a função como primeiro comando (captura de comandos), nunca `FOR SHARE`
  direto; criação sem ofício na mesma transação; o 429 na comparação.
- **4B (E10) e 6A (E16):** N1 dos relógios pela função, como `sistema`.
- **4C (E11):** a redefinição do gerador continua sem `ON CONFLICT`; a migração dela redefine a lista de tipos do
  CHECK de `avisos`.
- **5A (E13):** o 429 entra na comparação de status, corpo e cabeçalhos, com relógio fixo e contagem igual entre ids.
- **Serialização (seção 3 do plano):** `travar_municipio_para_escrita()`: 067; CHECK de coerência de `avisos`: 070,
  redefinido na migração da E11.

**Pendências novas do Rafael:** nenhuma. A criação com ofício em duas transações é consequência técnica, registrada
em "Ruins, e assumidas".

**Segunda leitura de segurança:** nova rodada (Codex, somente leitura) sobre o SHA desta correção, antes do H116.
