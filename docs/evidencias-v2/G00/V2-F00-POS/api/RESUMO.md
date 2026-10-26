# V2-F00-POS, consertos da API decididos pelo Rafael em 26/10/2026 (H29 A e H04 B)

Ramo `trab/f00pos-api`, a partir de `v2/f00-pos` em `59217dbd`. Ambiente: Windows 11,
Node 22.17.0, PostgreSQL 18.3 real (cluster descartável na porta 55433, binários da
instalação local, `DC360_POSTGRES_DE_PROVA=postgres://postgres@localhost:55433/postgres`)
e PGlite. Nada foi aplicado em produção nem implantado.

## Fatos

### 1. H29 A: a escrita em voo reconfere a vigência na própria transação

O defeito (rodada 4 da V2-F00-E04, red-team): `exigirAutenticacao` conferia a vigência
numa transação e a rota gravava em outra. Uma administradora desativada criava uma conta
administradora ativa até 223 ms depois de a desativação ser confirmada e respondida
(8 de 8 rodadas, a janela é o scrypt de `POST /usuarios`).

O que mudou:

- Migração nova `dc360/db/migrations/052_escrita_reconfere_a_vigencia_sob_a_trava.sql`:
  função `vigencia_de_quem_escreve(usuario, sessao)`, SECURITY INVOKER, que (1) segura a
  linha da pessoa em `usuarios` com FOR NO KEY UPDATE, (2) toma a trava da pessoa
  (`travar_sessoes_do_usuario`, 049) e (3) relê município suspenso, conta ativa, papel,
  senha provisória e sessão de pé. É a ordem que `trocarSenha` (correção 4 da E07) já
  usava: linha de `usuarios` antes da trava, sem ciclo com 049 e 050.
- `dc360/apps/api/src/auth/vigencia.ts`: `lerVigencia` passa a chamar a função (uma
  consulta só para as duas conferências); `bancoQueReconfereAEscrita` embrulha o `Banco`
  e, quando o pedido é de escrita, abre TODA transação com a reconferência e lança o
  mesmo erro do pedido seguinte (`conta_desativada` 403, `sessao_encerrada` 401,
  `nao_autenticado` 401, `acesso_suspenso` 403 ou 503 na fila do campo).
- `dc360/apps/api/src/servidor.ts`: um `AsyncLocalStorage` por pedido, aberto no
  `preHandler`; `exigirAutenticacao` anota nele quem escreve (a mesma regra de escrita de
  antes: método ou `ROTA_GET_COM_EFEITO`) e falha alto (500) se o contexto faltar. As
  rotas passam a receber o `Banco` embrulhado; a primeira conferência e o `/saude` usam o
  bruto. Leitura pura não paga nada (caso 6 do teste novo).
- Efeito colateral intencional, coberto por teste: a escrita que chega no meio de uma
  renovação da mesma pessoa espera a renovação confirmar (trava da pessoa) e escreve. O
  caso 5 do bloco Postgres de `renovacao-contra-encerramento.test.ts` foi ajustado: antes
  exigia escrever sem esperar; agora exige ver a escrita parada na trava consultiva e
  depois 200 (a rotação continua não sendo expulsão).

Prova (`dc360/apps/api/test/escrita-contra-desativacao.test.ts`, 14 casos):

- Ordem 1 (PGlite e Postgres): o pedido de `POST /usuarios` é segurado logo depois do
  COMMIT da conferência; a reação roda inteira e responde; o pedido segue. Quatro reações:
  desativar, encerrar sessões, rebaixar a coordenadora, suspender o município.
- Ordem 2 (só Postgres): o pedido é segurado no INSERT, depois da reconferência; a reação
  tem de ficar parada em trava (`pg_locks`) até a escrita confirmar; a escrita seguinte já
  ouve a reação.
- Rajada do red-team (só Postgres, sem grampo): oito rodadas com a desativação disparada
  de 0 a 105 ms depois do pedido; mede se a transação que criou a conta começou depois de
  a desativação ter sido respondida.

| Execução | Resultado |
| --- | --- |
| SEM o conserto (mutação: `bancoQueReconfereAEscrita` devolve a transação sem reconferir) | 12 reprovados, 2 aprovados de 14; rajada: 8 de 8 escritas gravaram, as 8 com a transação começando de 442 a 686 ms depois da desativação respondida (`01-h29-corrida-SEM-o-conserto.txt`) |
| COM o conserto | 14 de 14; rajada: 0 violações (`02-h29-corrida-COM-o-conserto.txt`, junto com os 53 de `renovacao-contra-encerramento.test.ts`: 67 de 67) |

Os dois que passam sem o conserto são os controles (a escrita sem reação grava; GET não
chama a função).

### 2. H04 B: teto de reservas de envio POR PESSOA

O achado (V2-F00-E06): um token de agente reservava a margem inteira de um município de
1 GiB com cerca de 104 a 138 autorizações de 15 MB, sem subir nada; os colegas levavam 507
e a fila parava por até 30 dias. A outra pergunta da H04 (foto entre equipes) não foi
decidida e não foi tocada.

O que mudou:

- `dc360/apps/api/src/config.ts`: `RESERVA_DE_ENVIO_POR_PESSOA_MB`, inteiro de 15 a
  10240, padrão 90; linha documentada em `dc360/apps/api/.env.example`.
- `dc360/apps/api/src/armazenamento/uso.ts`: `tetoDeReservasDaPessoa` e a frase da recusa.
- `dc360/apps/api/src/rotas/evidencias.ts` (`POST /evidencias/autorizar-envio`), na MESMA
  transação e depois do teto do município: prende a linha da pessoa (FOR NO KEY UPDATE),
  soma `tamanho_bytes` das reservas dela ainda abertas (`anexada_por` = token,
  `enviada_em` e `abandonada_em` nulos) e recusa com 429 `reservas_de_envio_da_pessoa` o
  que passar do teto. 429 porque a fila do aparelho trata 429 como temporário
  (`packages/campo/src/transporte.ts`) e a coleta drena sozinha; 507 diria que o município
  está cheio, e não está. A reautorização da mesma foto (mesma `idempotencyKey`) sai antes
  e nunca é recusada; foto confirmada não conta (é uso de verdade, segurado pelo teto do
  município).
- Migração nova `dc360/db/migrations/053_indice_das_reservas_de_envio_por_pessoa.sql`:
  índice parcial `(organizacao_id, anexada_por) WHERE enviada_em IS NULL AND
  abandonada_em IS NULL`, para a soma não varrer as evidências do município.
- `dc360/docs/ARMAZENAMENTO.md` e `dc360/apps/api/PENDENCIAS.md` atualizados.

A conta do teto por pessoa:

- Uso real de uma vistoria: cerca de seis fotos (`armazenamento/uso.ts`: seis fotos de
  2 MB por vistoria). Teto por arquivo: 15 MB (`TAMANHO_MAXIMO_BYTES`).
- Padrão: 6 x 15 MB = 90 MB, uma vistoria inteira com toda foto no máximo (na foto típica
  de 2 MB são 45 fotos). O aparelho sobe uma foto por vez (autoriza, envia, confirma) e a
  reautorização reaproveita a reserva, então quem trabalha tem, na prática, uma reserva
  aberta por aparelho; o resto é folga para foto que perdeu o envio no meio.
- Contra o teto do município: o menor teto que o banco aceita é 1 GiB
  (`teto_de_armazenamento_plausivel`, migração 035), com margem de 1,5 GiB. 90 MB são 8,8%
  do teto e 5,9% da margem: são precisas 18 pessoas com o balde cheio ao mesmo tempo para
  ocupar a margem (o achado era uma pessoa só). Em contrato maior a fatia é menor.
- Trava contra configuração alta demais: o teto efetivo é
  `max(15 MB, min(configurado, margem / 10))`. Com o padrão, o décimo (153,6 MB no menor
  teto) não decide; com 1024 MB configurados e teto de 1 GiB, ninguém passa de 153,6 MB.
  Município sem teto contratado (o estado de hoje) fica com o configurado.

Prova (`dc360/apps/api/test/reserva-de-envio-por-pessoa.test.ts`, 10 casos):

| Execução | Resultado |
| --- | --- |
| SEM o conserto (mutação: a comparação com o teto da pessoa desligada) | 7 reprovados, 3 aprovados de 10; o mesmo agente fez 102 reservas de 15 MB sem subir nada; a rajada paralela passou 20 de 20 (`03-h04-reserva-por-pessoa-SEM-o-conserto.txt`) |
| COM o conserto | 10 de 10; 6 reservas aceitas e a 7.a com 429, a colega continua com 201; 20 pedidos paralelos: exatamente 6 passam (`04-h04-reserva-por-pessoa-COM-o-conserto.txt`) |
| SEM a linha da pessoa presa (mutação: sem o FOR NO KEY UPDATE da rota e sem a reconferência da 052) | a rajada paralela passou 7 (folga para 6): a linha presa é o que serializa a soma (`05-h04-rajada-paralela-SEM-a-linha-presa.txt`) |

Os três que passam sem o conserto são a conta pura, a configuração e o índice.

### 3. Por que as migrações são aditivas (`docs/IMPLANTACAO.md` 8.1)

- 052: só uma função nova (`CREATE OR REPLACE`, `REVOKE`, `GRANT`), SECURITY INVOKER (o
  teto de 27 funções SECURITY DEFINER não muda). Nenhuma tabela, coluna, policy ou função
  existente muda. A API no ar não chama a função e continua igual contra o banco migrado.
  Ordem: migrar ANTES de implantar a API nova (ela chama a função em toda escrita).
- 053: só um índice parcial novo (`CREATE INDEX IF NOT EXISTS`). A API no ar o ignora; a
  nova funciona sem ele (só mais devagar). O `CREATE INDEX` comum segura escrita em
  `evidencias` pelo tempo de uma varredura da tabela (o aplicador roda cada arquivo numa
  transação, então não há CONCURRENTLY).

## Comandos e saídas

| Comando (em `dc360/`, salvo indicação) | Resultado | Saída |
| --- | --- | --- |
| `npm run typecheck` | código 0 | `09-typecheck.txt` |
| `npm run test:isolamento` (portão CA-06) | 14 arquivos, 345 aprovados e 3 pulados, código 0 (o mesmo número da regressão base do G00) | `07-test-isolamento.txt` |
| `DC360_POSTGRES_DE_PROVA=... npx vitest run` em `apps/api` (suíte inteira, com os blocos de Postgres real ligados) | 109 arquivos, 1777 aprovados, 0 reprovados, código 0 | `06-test-api-completa.txt` |
| `DC360_POSTGRES_DE_PROVA=... npx vitest run test/escrita-contra-desativacao.test.ts test/renovacao-contra-encerramento.test.ts` | 67 de 67 | `02-h29-corrida-COM-o-conserto.txt` |
| a mesma corrida com a mutação da H29 | 12 de 14 reprovam | `01-h29-corrida-SEM-o-conserto.txt` |
| `DC360_POSTGRES_DE_PROVA=... npx vitest run test/reserva-de-envio-por-pessoa.test.ts` | 10 de 10 | `04-h04-reserva-por-pessoa-COM-o-conserto.txt` |
| o mesmo com a mutação da H04 | 7 de 10 reprovam | `03-h04-reserva-por-pessoa-SEM-o-conserto.txt` |
| o caso 7 sem a linha presa | reprova (7 em vez de 6) | `05-h04-rajada-paralela-SEM-a-linha-presa.txt` |
| `npm run conferir:numeros` | código 1, só pela linha de base de `test:scripts` (355 esperados, 358 na árvore): ver limitações. As contagens da API (1733, +14 deste ramo), do total (3637 e 5634) e das migrações (53) foram atualizadas em `scripts/baseline.mjs` (`V2-F00-POS-api`), `README.md`, `docs/COLOCAR-DE-PE.md` e `docs/RESTORE-DO-BANCO.md` | `10-conferir-numeros.txt` |
| `npm run test:scripts` | 358 testes: 350 aprovados, 7 pulados, 1 reprovado por ambiente (ver limitações), código 1 | `08-test-scripts.txt` |

As mutações foram feitas na árvore e desfeitas copiando de volta o arquivo salvo antes;
`grep` confirmou zero resto de mutação. Nas saídas, os códigos de cor foram tirados e a
assinatura das URLs de envio do armazenamento em memória do teste foi trocada por
`[removido]`.

## Correção da revisão independente (Opus), 26/10/2026

Veredito do revisor: APROVADO COM CORREÇÕES. Antes de medir, o ramo recebeu o merge de
`origin/v2/f00-pos` (conflitos só de contagem no README e no COLOCAR-DE-PE, e no
`INDEX.md` da pasta da etapa, regenerado com `api/` e `painel/`).

### Fatos

1. **Ofício enviado sem desfecho (bloqueava o merge).** O passo 3 de
   `POST /oficios/:id/envio` (`dc360/apps/api/src/rotas/oficios.ts`), que grava o desfecho
   e o `oficio_enviado`, passava pela reconferência: a conta desativada (ou as sessões
   encerradas) durante a chamada ao provedor fazia o email sair, a resposta ser 403 e a
   tentativa ficar `enviando` sem recibo e sem evento na trilha. Agora o passo 3 usa
   `comTenantDeFatoConsumado` (`dc360/apps/api/src/auth/vigencia.ts`), que roda a transação
   sem reconferir, com o porquê escrito no código: o envio foi autorizado no passo 1, já
   reconferido, e recusar o registro não desfaz o email. O passo 1 continua reconferido.
   Teste novo `dc360/apps/api/test/oficio-enviado-contra-desativacao.test.ts` (2 casos:
   desativação e encerramento de sessões com o provedor segurado). Sem o conserto, 2 de 2
   reprovam (403 e 401 com o email já entregue; `11-oficio-SEM-o-conserto.txt`); com ele,
   2 de 2: resposta 202, `oficio_envios` com `entregue` e o recibo do provedor, um
   `oficio_enviado` na trilha, e o reenvio seguinte recusado sem chegar ao provedor.
2. **Teto de espera por trava.** Toda transação de pedido de escrita (no embrulho, antes
   da `vigencia_de_quem_escreve`) e a conferência de fora (`lerVigencia`) fazem
   `SET LOCAL lock_timeout = '5s'`. O 55P03 vira 503 `servidor_ocupado` com `retry-after: 2`
   (`servidor.ts`), que a fila do campo trata como temporário; o 40P01 dos dois impasses
   raros da 052 sai com o mesmo 503, em vez de 500 (nada é gravado nos dois casos).
   Dois casos novos no bloco Postgres de `escrita-contra-desativacao.test.ts`: a linha da
   pessoa presa por outra transação depois da conferência (9) e antes do pedido (10); os
   dois respondem 503 em cerca de 5 s e nada é gravado. Sem o `lock_timeout`, os dois
   ficam pendurados até o tempo limite do teste, 60 s (`13-lock-timeout-SEM-o-teto.txt`).
   `idle_in_transaction_session_timeout` no papel `dc360_app` NÃO foi posto e não há
   migração 054: a API entra com outro papel de login e faz `SET LOCAL ROLE dc360_app`, e
   `ALTER ROLE ... SET` só vale para quem entra com o papel; a migração não teria efeito.
   O papel do banco em produção não foi tocado.
3. **Dívidas** DV-48 a DV-52 em `docs/roadmap-v2/dividas.md` (achados 3 a 7 do revisor:
   conferência de fora que trava, `semTenant` sem guarda, reserva abandonada reativada
   fora do teto por pessoa, provas que faltam da H29 com os 40P01 não medidos, coluna
   `municipio_existe` sempre verdadeira), com dono e prazo.
4. `apps/api/PENDENCIAS.md` registra os três ajustes; `scripts/baseline.mjs` ganha
   `V2-F00-POS-api-revisao` (+2 na contagem estática da API, os dois casos de Postgres
   real ficam fora pela política T42); README e COLOCAR-DE-PE com as contagens novas.

### Comandos e saídas da correção

| Comando | Resultado | Saída |
| --- | --- | --- |
| `npm run typecheck` | código 0 | `14-typecheck-revisao.txt` |
| `npm run test:isolamento` | 14 arquivos, 345 aprovados e 3 pulados, código 0 | `15-test-isolamento-revisao.txt` |
| suíte inteira da API com Postgres real (`DC360_POSTGRES_DE_PROVA`) | 110 arquivos, 1781 aprovados, 0 reprovados, código 0 | `16-test-api-completa-revisao.txt` |
| `escrita-contra-desativacao`, `oficio-enviado-contra-desativacao` e `renovacao-contra-encerramento`, com Postgres real | 3 arquivos, 71 de 71 | `12-corridas-COM-a-revisao.txt` |
| `npm run conferir:numeros` | código 0, "Todos os números da documentação batem com a realidade" (API 1735, total 3676, com o aplicativo 5673) | `17-conferir-numeros-revisao.txt` |
| `npm run test:scripts` | 362 testes: 355 aprovados, 7 pulados, 0 reprovados, código 0 | `18-test-scripts-revisao.txt` |

Duas rodadas anteriores da suíte inteira, com a máquina carregada por outras sessões (58
processos `node.exe`), tiveram um reprovado cada, e os dois passam rodados sozinhos:
`segundo-fator.test.ts` ("o teto de tentativas do código é separado do teto da senha", tempo
limite de 30 s estourado; sozinho, 3,9 s) e `desinterdicao.test.ts` (login com 500 no
`beforeAll`, que é PGlite e não passa pelo embrulho de escrita; sozinho, 22 de 22). As
saídas dessas duas rodadas não foram arquivadas; o resultado da rodada arquivada está na
tabela.

## Limitações

- A rajada da H29 neste Windows termina sempre com a desativação ganhando (o scrypt aqui
  leva de 400 a 700 ms); o caminho em que a escrita ganha e a desativação espera é provado
  pelos casos 5 a 7, segurados e conferidos em `pg_locks`, e não pela rajada.
- Custo aceito da H29: as escritas da MESMA pessoa se enfileiram (a linha dela fica presa
  até o COMMIT de cada uma), e a escrita espera a renovação da própria cadeia. Dois casos
  raros fecham ciclo e o Postgres desfaz uma transação com 40P01 (sem gravar nada; desde a
  correção da revisão a resposta é 503 `servidor_ocupado`, e não 500):
  duas pessoas que se desativam ou se editam uma à outra no mesmo instante, e quem
  administra mudando a retenção do município no instante em que o console o suspende ou
  em que ela mesma entra por outro aparelho. Não foram medidos (DV-51); estão escritos na
  052 e em `apps/api/PENDENCIAS.md`.
- `semTenant` não reconfere (login, renovação, o que vem antes do município). As rotas
  autenticadas usam `comTenant`; uma rota futura que escrevesse por `semTenant` depois de
  `exigirAutenticacao` ficaria fora da reconferência (DV-49).
- H04: reserva aberta de conta desativada continua ocupando o teto do município até a
  varredura de órfão (até 30 dias), mas agora no máximo 90 MB por pessoa. Uma pessoa que
  perder seis fotos de 15 MB no meio do envio fica com o envio dela parado (429) até a
  varredura abandonar as reservas; o padrão foi escolhido para isso ser improvável (45 fotos
  típicas). O teto por pessoa não limita foto CONFIRMADA (bytes reais, com trilha), e a
  reserva abandonada que volta pela mesma chave escapa dele (DV-50).
- Primeira entrega (antes da revisão): `npm run test:scripts` teve um reprovado por
  ambiente (`e2e-porta-ocupada.test.mjs`, porta 3691 ocupada por um `node.exe` de outra
  sessão), e `conferir:numeros` reprovava pela linha de base de `test:scripts` (+3 do commit
  `f87082e8`). Os dois ficaram resolvidos na correção da revisão: a porta estava livre, e o
  merge de `origin/v2/f00-pos` trouxe as linhas da linha de base (ver a seção da correção).
- O `INDEX.md` da pasta da etapa `V2-F00-POS/` lista `api/` e `painel/` (regenerado no
  merge); se outro ramo acrescentar arquivos na mesma pasta, o índice precisa ser unido.
- Não rodados aqui: `npm run test:e2e`, `test:campo`, o CI do GitHub e qualquer
  conferência em aparelho. Nenhuma tela mudou.
