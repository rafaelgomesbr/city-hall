# V2-F03-E01, correção 2: ADR 0009 depois da segunda rodada da revisão de segurança

## Fatos

**Base:** `origin/trab/f03-0a-e01-adr` em `13090cf9` (correção 1). Só documento: nenhum código, nenhuma migração,
nenhum `package.json`. CLAUDE.md, STATUS, ESTADO-ATUAL, `dividas.md`, `pendencias-humanas.md` e o `plano-f03.md` não
foram tocados.

**Entrada:** relatório da segunda rodada da revisão de segurança sobre `13090cf9` (Codex, somente leitura, sem executar
teste): sete achados da primeira rodada FECHADOS como requisito (2, 4, 7, 8, 9, 10 e 11), quatro PARCIAIS (1, 3, 5 e 6),
quatro bloqueios NOVOS e dois esclarecimentos (5 e 6). Cada ponto foi conferido contra o código e as migrações deste SHA
antes de mudar a ADR. Todos procedem. A revisão disse, e esta correção mantém: "fechado" quer dizer fechado como
requisito da ADR; nada disso está implementado nem testado, porque as migrações deste SHA terminam na 052.

**Conferências feitas no código:**

- `050_login_e_suspensao_na_mesma_linha.sql` (cabeçalho, perto da linha 35) e `auth/servico.ts` (`emitirPar`, perto da
  linha 678): o login toma `organizacoes` com `FOR SHARE` ANTES de `travar_sessoes_do_usuario`, para não inverter a
  ordem da suspensão (049, que atualiza `organizacoes` e só depois trava cada conta, em ordem de id). A ordem da
  correção 1 não posicionava essa linha.
- `049_renovacao_e_encerramento_na_mesma_trava.sql`: a regra de hoje é "linha de `usuarios` antes da trava das
  sessões"; a renovação não toma a linha de `usuarios`.
- `05-api-identidade-autorizacao.md`, E09: `pessoa_acompanha_as_contas` inativa a pessoa quando a última conta ativa é
  desativada, ou seja, anda da conta para a pessoa. A ordem da correção 1 (pessoa antes da conta) fecha ciclo com ele.
- `05-api-identidade-autorizacao.md`, E10: "a conta nasce inativa e o aceite a ativa" e "`convidar_pessoa` acha ou
  cria a pessoa". Com o gatilho criador e a imutabilidade da correção 1, a conta pendente receberia pessoa nova e o
  aceite por pessoa existente seria recusado: o impasse que a revisão descreve.
- `auth/servico.ts`, `pedirRecuperacao` (perto da linha 1013): a consulta `abrir_recuperacao` é esperada dentro do
  pedido, e o envio só é preparado quando acha. O corpo e o status são uniformes e o envio sai depois da resposta, mas
  o caminho difere.
- `auth/segundo-fator.ts`, `exigenciaNoLogin` (perto da linha 182): o login pede o código sempre que o fator está
  ligado, mesmo em papel sem obrigação. A redação "quando o destino exige" da correção 1 deixava a troca mais fraca.
- `038_suspensao_eliminacao_e_operadores_do_console.sql`: `executar_eliminacoes_vencidas` apaga por
  `format('DELETE FROM %I ...')` na ordem de `ordem_de_apagamento_por_municipio()`; é o único `EXECUTE` de texto
  montado dentro de função (a outra ocorrência, na 025, é bloco de migração).
- `001_base.sql`: `dc360_app` é `NOLOGIN`, não é superusuário nem dono.

**Arquivos mudados:**

- `docs/adr/0009-pessoa-global-com-conta-por-municipio.md`: seção nova "O que a segunda rodada da revisão mudou
  (correção 2)"; decisão 1 (pessoa_id `NOT NULL`, imutável por `IS DISTINCT FROM`, só `aceitar_convite` cria conta
  com pessoa preenchida; alcance do gatilho; "Como a segunda conta é liberada"; "A conta nasce no aceite"; "E-mail:
  qual índice impede o quê"; inventário); decisão 2 (escolha e troca com a régua do login); decisão 3 (tabela de
  autorização; "Não enumeração: tempo e efeitos"); decisão 6 (sem invalidação de convite, forma final com fila);
  decisão 7 (escopo do convite; "A ordem das travas, completa", com níveis, regras, caminhos e testes concorrentes);
  decisão 8 (E16 e catálogo da 0B); premissas (P-12); consequências por etapa; testes obrigatórios; o que fica
  proibido; ruins assumidas; alternativas descartadas (seis linhas novas); estado e aceite; onde isto vive. Situação
  continua PROPOSTA.
- `dc360/docs/PAPEIS_E_RESPONSABILIDADES.md`: a troca pede o código sempre que a pessoa tem o fator ligado ("trocar
  nunca pede menos que entrar"); a conta só aparece quando a pessoa aceita o convite.
- `dc360/apps/api/PENDENCIAS.md`: o item 3 da seção "Uma pessoa, vários municípios" diz que o 202 só fecha a
  enumeração com tempo e efeitos iguais, e que a conta nasce no aceite.
- Nesta pasta: `proposta-de-redacao-do-claude-md.md` (versão da correção 2; as da primeira redação e da correção 1
  ficam como histórico), as saídas dos portões e este RESUMO. O `INDEX.md` da etapa recebeu só linhas novas.

## Os quatro bloqueios novos

| # | Bloqueio | Procede? | O que mudou | Onde na ADR |
| --- | --- | --- | --- | --- |
| Novo 1 | "Mesmo SHA" não garante liberação segura com várias instâncias, migração em curso e rollback | Procede. O banco é um só; uma instância anterior de pé depois da retirada do UNIQUE ainda oferece a redefinição com senha provisória do período um para um | A liberação vira procedimento em três tempos: **063 aditiva** (cria as proteções com nome ou assinatura novos, não muda o contrato de nenhuma função que a API anterior chama, lista no cabeçalho o CAMINHO ANTIGO por `regprocedure`); **implantação da API nova em todas as instâncias**, conferida e arquivada; **064 própria**, que grava a marca de liberação, revoga o EXECUTE do caminho antigo, faz cada função antiga recusar pela marca (segunda barreira) e só então retira o `UNIQUE (pessoa_id)`. API anterior contra banco liberado falha fechada. Rollback escrito por fase (antes da 064; depois dela sem segunda conta, com `desfazer/` que confere a contagem; depois da primeira segunda conta, sem volta, com parada de emergência do aceite por pessoa existente lida no banco). Testes: API do SHA anterior contra o banco liberado; funções antigas com grant devolvido recusam pela marca; `desfazer/` nos dois sentidos | Decisão 1, "Como a segunda conta é liberada"; tabela de passos (passo 4); decisão 8 (E16 e catálogo); testes da E16 e da 0B; proibido; alternativas; estado e aceite |
| Novo 2 | A não enumeração termina no status, corpo e cabeçalho; falta tempo e o que o município observa depois | Procede como lacuna de requisito (a revisão não afirmou vazamento; `pedirRecuperacao` mostra caminhos diferentes) | Regra estendida: nada que o solicitante observe depende de outro município, incluindo TEMPO, conta, contagens, estado do convite, trilha, reemissão e entrega. O pedido do município só grava na tabela do município e põe na fila (sem consultar `pessoas`, sem esperar o provedor): trabalho constante por construção. O que depende da pessoa sai de um trabalhador assíncrono; a mensagem do convite é a mesma para pessoa nova ou existente, e o trabalhador do convite não consulta `pessoas`. Estado do convite só muda por ação do município, prazo ou aceite (evento global da pessoa não o muda). Contagens e trilha só locais e iguais para pessoa nova ou existente. Município não vê entrega na F03. Limites por solicitante e município, nunca por e-mail no sistema; teto por destinatário só no trabalhador, em silêncio; deduplicação só local; falha do provedor só no trabalhador. `ultimo_acesso` fica na conta; bloqueio, falhas, fator de papel sem obrigação e verificação de e-mail não aparecem ao município. Exceção declarada: desativação e reativação (gatilho da E09) tocam a pessoa no pedido, com trabalho igual e teste de tempo. O pedido público de recuperação segue o mesmo desenho a partir da E08. Testes: estrutural determinístico (mesma sequência de comandos SQL e contagens; leituras do município iguais byte a byte depois do trabalhador) e de tempo com margem declarada (50 de aquecimento, 300 por caso intercalados, IC de 99% por bootstrap da diferença das medianas dentro de ±1 ms ou ±5%) | Decisão 3, "Não enumeração: tempo e efeitos"; decisão 6; inventário (`abrir_recuperacao` e `pedirRecuperacao`); passo 3 (`ultimo_acesso`); testes da E08, E09, E10 e E16; proibido; ruins |
| Novo 3 | Conta pendente, gatilho criador e imutabilidade sem contrato compatível; e o que impede duas pessoas com o mesmo e-mail | Procede (impasse conferido no roteiro da E10 contra a decisão 1 da correção 1) | Adotada a solução sugerida: **o convite não cria linha em `usuarios`**; `convites_de_vinculo` guarda só o que o município digitou, sem `pessoa_id` nem `usuario_id` enquanto aberto; **a conta nasce em `aceitar_convite`, já com a pessoa comprovada** (nova: define a senha; existente: prova nova, e-mail igual ao do convite, sem senha provisória vigente); o convite passa a aceito por UPDATE condicional na mesma transação. `pessoa_id` fica `NOT NULL` depois do backfill, imutável por `IS DISTINCT FROM`, e um gatilho de restrição adiado recusa conta com pessoa preenchida fora de `aceitar_convite`. O gatilho criador fica só para quem nasce fora do convite. Nenhuma exceção à imutabilidade. Tabela nova de índices: até a E15, `usuarios_email_global_idx`; da E15 à E09, ele mais `pessoas_email_idx` total (novo, na E15); a partir da E09, só `pessoas (lower(email)) WHERE ativo`, que impede duas pessoas ATIVAS com o mesmo e-mail e permite inativas, com `UNIQUE (organizacao_id, pessoa_id)` e `UNIQUE (pessoa_id)` (até a 064) impedindo duas contas da mesma pessoa | Decisão 1 (terceiro e quarto itens; "A conta nasce no aceite"; "E-mail: qual índice impede o quê"; inventário); decisão 3 (tabela de autorização); decisão 6; consequências e testes da E10 e da E15; proibido; alternativas |
| Novo 4 | Ordem das travas incompleta: ciclo com `pessoa_acompanha_as_contas` da E09 e linha de `organizacoes` do login sem lugar | Procede (050 e `emitirPar` conferidos; a ordem da correção 1 punha a pessoa antes da conta, ao contrário do gatilho) | Ordem única por níveis: N1 `organizacoes`, N2 trava da pessoa, N3 `usuarios`, N4 `pessoas`, N5 tabelas da pessoa, N6 convites, N7 links, N8 `travar_sessoes_do_usuario`, N9 `sessoes`. Regras: nunca tomar nível menor do que um que já segura; gatilho só sobe de nível (o espelho da E15 e o gatilho da E09 vão de N3 para N4, por isso a conta vem antes da pessoa); quem escreve `ativo`, cria conta ou escreve `pessoas` toma N2 antes; o gatilho da E09 confere N2 em `pg_locks` e recusa sem ela, nunca a toma sozinho; ler sem trava, travar na ordem, reler; consumo do código do fator em transação própria; INSERT de linha nova não é nível. Tabela por caminho (login, escolha, troca, suspensão, eliminação como única exceção declarada e justificada, desativação e reativação, papel e equipe, credencial antes e depois do passo 3, fator, tentativa de login, convite, aceite, link, liberação). Escopo de revogação separado de quem toma qual trava. Testes concorrentes com a ordem forçada nos dois sentidos: E08 (inclui troca de senha contra desativação da última conta), E09 (desativação contra troca e recuperação; reativação contra desativação de outra conta; gatilho sem N2; eliminação contra troca de senha), E16 (login, escolha e troca contra suspensão; troca contra desativação do destino; escolha contra recuperação) | Decisão 7, "A ordem das travas, completa"; inventário (`travar_pessoa`, gatilho da E09, eliminação); consequências e testes da E08, E09, E15 e E16; proibido; alternativas |

## Os quatro parciais da primeira rodada

| # | Achado (resumo) | O que faltava, pela revisão | O que mudou | Onde na ADR |
| --- | --- | --- | --- | --- |
| 1 | Duas origens da credencial durante o espelho | A retirada do `UNIQUE (pessoa_id)` dependia do "mesmo SHA", sem segurança durante a migração, com processos antigos e no rollback | Fechado pelo Novo 1: 063 aditiva, implantação conferida, 064 com marca e caminho antigo recusado no banco, rollback por fase, teste da API anterior contra o banco liberado | Decisão 1, "Uma conta por pessoa até a liberação" e "Como a segunda conta é liberada" |
| 3 | Respostas administrativas como oráculos | O 202 cobria status, corpo e cabeçalhos; faltavam tempo e efeitos acessíveis ao solicitante | Fechado pelo Novo 2: regra estendida a tempo e efeitos, pedido sem consulta fora do município e sem provedor, trabalhador assíncrono, testes estrutural e de tempo | Decisão 3, "Não enumeração"; decisão 6 |
| 5 | Autorização por operação e proteção de `pessoa_id` | Compatibilizar a criação automática de pessoa com a conta pendente do convite, sem reassociação nem duplicação | Fechado pelo Novo 3: sem conta pendente; conta criada no aceite já com a pessoa; `NOT NULL`, `IS DISTINCT FROM`, gatilho adiado; gatilho criador só fora do convite; tabela de índices de e-mail | Decisão 1; decisão 3 (tabela de autorização) |
| 6 | Escopos de revogação e trava global | A ordem das travas não resolvia todos os participantes, em especial o gatilho da E09 e a linha do município | Fechado pelo Novo 4: ordem por níveis, regras, tabela por caminho e testes concorrentes; escopo de revogação separado da trava | Decisão 7 |

## Os dois esclarecimentos

| # | Esclarecimento | O que mudou | Onde |
| --- | --- | --- | --- |
| 5 | Gatilho não torna a coluna inviolável pelo dono (DDL) | Escrito o alcance: a imutabilidade vale para DML com o gatilho habilitado (inclusive o dono e SECURITY DEFINER); o `dc360_app` não é dono, nem superusuário, não tem `TRIGGER` e não muda `session_replication_role`; nenhuma função privilegiada contém DDL nem mexe em `session_replication_role` (o catálogo da 0B confere o corpo, com a exceção do `DELETE FROM %I` de modelo constante da 038); DDL é das identidades de migração e de operação, só por migração revisada; teste de `tgenabled` depois da cadeia | Decisão 1 (alcance do gatilho); decisão 8 (catálogo); testes da 0B e da E15 |
| 6 | A troca deve respeitar também o fator ligado por vontade da pessoa | A escolha e a troca pedem o que o login pediria no destino: código sempre que o fator está ligado (por obrigação ou por vontade), ativação sem sessão quando o papel exige e ele não está ligado; a troca, além disso, a senha conferida na hora. Nunca entrada mais fraca que o login | Decisão 2; decisão 8 (E16); teste da E16; proposta do CLAUDE.md (troca 2); `PAPEIS_E_RESPONSABILIDADES.md` |

Nenhum ponto foi recusado. A alternativa de manter conta pendente em `usuarios` foi descartada com motivo (a revisão
pedia justificativa se outra solução fosse escolhida; foi escolhida a sugerida).

## Portões (saídas nesta pasta)

- `regras-de-conteudo.txt`: `npx vitest run packages/shared/test/regras-de-conteudo.test.ts` em `dc360/` depois de
  `npm ci --ignore-scripts`. 9 de 10 verdes; o único reprovado é o caso de ambiente Windows conhecido (EPERM ao criar
  symlink, DV-46). "Nenhum travessão em texto nenhum" e "nenhuma norma citada fora da lista autorizada" verdes com os
  arquivos mudados.
- `gerar-estado.txt`: `node scripts/roadmap/gerar-estado.mjs --conferir` da raiz, saída 0.
- `node dc360/scripts/conferir-indices-de-evidencia.mjs` da raiz: verde depois de gravar as linhas novas no `INDEX.md`
  da etapa (não arquivado porque a saída depende do próprio índice).
- `dc360/node_modules` apagado depois dos portões.

## Justificativa

A correção 1 descreveu as transições pelo resultado ("no mesmo SHA", "resposta igual", "ligada no aceite", "uma ordem
de travas"); a segunda rodada mostrou que cada uma dessas frases tinha um caminho de execução sem contrato. A correção 2
troca as frases por mecanismo: a liberação é procedimento com barreira no banco; a não enumeração é trabalho constante
por construção, provado por sequência de comandos e por tempo; a conta não existe antes do aceite, então nada precisa
ser religado; e a ordem das travas é uma só, por níveis, no sentido em que os gatilhos já andam. Duas decisões da
correção 1 foram desfeitas por causarem os problemas: a invalidação do convite por evento global da pessoa (era um
oráculo de estado) e a ordem pessoa antes de conta (era o ciclo com a E09).

## Para o orquestrador

### Mudanças exatas no `docs/roadmap-v2/retomada/plano-f03.md` (NÃO editei o plano)

Referência: o plano em `origin/v2/f03` (`8b13631a`), já revisado pela correção 1.

1. **Seção 1, P-04**, trocar o final "E16 libera a segunda conta (063)." por: "E16 libera a segunda conta em dois
   tempos: 063 aditiva (proteções com nome ou assinatura novos, nenhuma função da API anterior muda de contrato) e
   064 própria, aplicada só depois da API da E16 em todas as instâncias (marca de liberação, caminho antigo revogado e
   recusando pela marca, retirada do `UNIQUE (pessoa_id)`)."
2. **Seção 1, P-12**, trocar por: "P-12 migrações 053 a 066 se a F02 não usar nenhuma depois da 052 (a liberação é a
   064; E17 vira 065 e E20 vira 066)."
3. **Seção 1, linha da E16**: acrescentar "A escolha e a troca pedem o código sempre que o login pediria (fator
   ligado por obrigação ou por vontade da pessoa)."
4. **0B**: acrescentar ao escopo: conferir o corpo das funções da lista (nenhuma com DDL ou `session_replication_role`;
   `EXECUTE` de texto montado só com modelo constante de DML, como o da 038); `dc360_app` sem privilégio `TRIGGER`;
   suporte a entradas marcadas "recusada depois da liberação" (o teste confere, quando a marca existe, que não têm
   EXECUTE do `dc360_app` e recusam). Provas extras: função com DDL no corpo reprova; grant `TRIGGER` ao `dc360_app`
   reprova. Se a 0B já tiver candidato, isto entra como correção dela.
5. **1B (E15)**, acrescentar: `usuarios.pessoa_id NOT NULL` depois do backfill; o gatilho de imutabilidade compara
   com `IS DISTINCT FROM` (recusa todo UPDATE que mude a coluna); gatilho de restrição adiado que, na E15, recusa
   TODA conta inserida com `pessoa_id` preenchido (a E10 o redefine para aceitar só a que tem convite consumido na
   mesma transação); `pessoas_email_idx` UNIQUE total em `lower(email)` de `pessoas`; funções SECURITY INVOKER
   `travar_pessoa(uuid)` e `travar_pessoa_da_conta(uuid)` (chave consultiva própria, separada da da 049); a tabela de
   níveis da decisão 7 da ADR no cabeçalho da 054. Testes a mais: conta com `pessoa_id` preenchido recusada no fim da
   transação, também pelo dono; segunda pessoa com o mesmo e-mail recusada; o gatilho de imutabilidade habilitado
   (`tgenabled`) depois de toda a cadeia de migrações.
6. **1C**: se a fila de envio (convite, recuperação) precisar de chave de configuração, ela é declarada aqui, com
   padrão fechado e sem efeito (a `config.ts` congela depois da 1C).
7. **2C (E09)**: risco de médio para ALTO. Acrescentar: o gatilho `pessoa_acompanha_as_contas` em `UPDATE OF ativo` e
   em `DELETE` de `usuarios`, conferindo em `pg_locks` que a transação tem a trava da pessoa e recusando sem ela,
   com trabalho igual em todos os casos (sempre um UPDATE da linha da pessoa; o conflito de e-mail na reativação
   tratado dentro, deixando a pessoa inativa sem erro); a 056 retira também o `pessoas_email_idx` total da E15 ao
   criar o parcial; `rotas/administracao.ts` chama `travar_pessoa_da_conta` antes do UPDATE de `ativo`; a 056
   redefine `executar_eliminacoes_vencidas` (038) para tomar N1, N2 de cada pessoa e N8 de cada conta antes de
   apagar, com o argumento da exceção no cabeçalho; conferir TODO caminho que escreve `usuarios.ativo` (API, console,
   sementes, modo local do painel em `apps/web/src/dados/`, testes) e fazê-lo tomar a trava (se o modo local do
   painel escrever `ativo`, a 2C abre esse arquivo ou a regra entra pela 3A, dona dele). Testes a mais: os
   concorrentes da E09 da decisão 7 (desativação contra troca de senha e contra recuperação; reativação contra
   desativação de outra conta da mesma pessoa; gatilho sem a trava recusado; eliminação contra troca de senha);
   desativação e reativação no teste de tempo da decisão 3. Serialização: `executar_eliminacoes_vencidas` 056.
8. **3C (E10 banco)**, trocar "`convites_de_vinculo` sob RLS por município; conta nasce inativa; `convidar_pessoa` e
   `aceitar_convite` recebem a pessoa da API, sem `app_pessoa_id()`" por: "`convites_de_vinculo` sob RLS por
   município, guardando e-mail, nome, matrícula, papel, equipe, quem convidou, hash do link, prazo e estado, SEM
   `pessoa_id` nem `usuario_id` enquanto aberto (gravados no aceite); o convite NÃO cria linha em `usuarios`;
   `convidar_pessoa` só grava o convite, sem consultar `pessoas` (pode deixar de ser SECURITY DEFINER: é INSERT do
   município sob RLS); `aceitar_convite` cria a pessoa nova (definição da senha) ou recebe da API a pessoa existente e
   a impressão da credencial que a API conferiu (padrão `cr` de `auth/servico.ts`) e relê sob a trava da pessoa,
   confere e-mail igual ao do convite e ausência de senha provisória vigente, cria a conta já com `pessoa_id`, e
   passa o convite a aceito por UPDATE condicional (sem a linha, a transação volta); a 058 redefine o gatilho adiado
   da E15 para aceitar a conta com convite consumido na mesma transação; ordem de travas do aceite da decisão 7."
   Retirar: "`convidar_pessoa` e `aceitar_convite` tomam a trava da pessoa" (fica só o aceite) e "mudança de
   credencial invalida o convite aberto, e quem convidou vê o estado de convite vencido" (trocar por "evento global
   da pessoa não muda o estado de convite nenhum"). Testes a mais: o convite não cria linha em `usuarios`; troca de
   senha, recuperação e mudança de fator não mudam estado de convite; aceite com e-mail diferente do convite ou com
   senha provisória vigente recusado; dois aceites concorrentes do mesmo convite (um vence, o outro volta sem conta).
9. **4B (E10 API e painel)**, acrescentar: `POST /v1/usuarios` só grava o convite e o põe na fila, sem consultar
   `pessoas` e sem o provedor no pedido; trabalhador do convite no relógio da API (`comTenantDoSistema`), mesma
   mensagem para pessoa nova ou existente, sem consulta a `pessoas`; o município não vê situação de entrega;
   limite por solicitante e por município; deduplicação só entre convites do município; a reemissão passa a ser
   sobre o CONVITE (sugestão: `POST /v1/convites/:id/reemissao` em `rotas/convites.ts`, porque não há conta antes do
   aceite); o painel lista convites separados das contas. Os testes da E10 viram o estrutural e o de tempo da decisão
   3 nos quatro casos, com as leituras do município (contas, convites, contagens, trilha, reemissão) iguais depois
   do trabalhador. O aceite por pessoa existente na API, com senha conferida na hora e código do fator, é da 5C.
10. **4A (E11)**: acrescentar a ordem de travas dos caminhos do fator (N2, N4, N5, N8, N9; o consumo do código em
    transação própria ou antes de N8) e que o reset do superior não mexe em convite.
11. **5A (E08)**, acrescentar: a ordem por níveis no cabeçalho da 061 para os caminhos dela; o teste concorrente
    "troca de senha contra desativação da última conta ativa (gatilho da E09)"; a lista positiva de SELECT de
    `usuarios` mantém `pessoa_id` (para `travar_pessoa_da_conta`; a API não o devolve em resposta) e `ultimo_acesso`
    fica na conta; o lado do banco da fila do pedido público de recuperação (o pedido só registra; a consulta, o link
    e o envio no trabalhador). Como a 5A não toca `auth/servico.ts`, a troca de `pedirRecuperacao` para a fila vai
    para a 5C. Retirar qualquer menção a `redefinir-senha` invalidar convites.
12. **5C (E16)**, trocar "Migração `063_escolha_de_municipio.sql`, que também faz a liberação da segunda conta
    (retira `UNIQUE (pessoa_id)`), com as condições da decisão 1 da ADR 0009 conferidas no mesmo SHA" por: "Migração
    `063_escolha_de_municipio.sql`, ADITIVA (proteções e funções novas com nome ou assinatura novos; nenhuma função
    que a API anterior chama muda de contrato; o cabeçalho lista o caminho antigo por `regprocedure`), e migração
    `064_liberacao_da_segunda_conta.sql` (marca de liberação numa tabela de uma linha sem grant ao `dc360_app`,
    REVOKE do EXECUTE do caminho antigo, cada função antiga recusando pela marca, retirada do `UNIQUE (pessoa_id)`;
    `desfazer/` que confere a contagem de pessoas em dois municípios e recusa se não for zero), com o procedimento
    de implantação escrito (063, API nova em todas as instâncias conferida, 064)." Arquivos a mais: `rotas/convites.ts`
    (o aceite por pessoa existente com senha conferida na hora e código do fator) e `auth/servico.ts` também para
    `pedirRecuperacao` pela fila. Testes a mais: API do SHA anterior à 5C, construída e ligada ao banco com a 064 e
    uma pessoa em A e B, falha fechada no login de um passo, na redefinição com senha provisória e no reset do
    superior; funções do caminho antigo com grant devolvido recusam pela marca; `desfazer/` da 064 nos dois
    sentidos; escolha e troca pedem o código com fator ligado por vontade em papel sem obrigação; `redefinir-senha`
    e o reset na forma final com o teste estrutural e o de tempo; os concorrentes da E16 da decisão 7. Risco de alto
    para CRÍTICO; Opus com revisor Opus.
13. **Lote 6**: 6A (E17) migração `065_orgao_externo.sql` (era 064); 6B (E20) migração `066_trilha_de_sessao.sql`
    (era 065), redefinindo `registrar_tentativa_login` a partir da 061; a 6B acrescenta "a trilha registra o mesmo
    evento para pessoa nova ou existente".
14. **3D (E18 banco) e 7A (E18 API)**: acrescentar os encontros concorrentes da decisão 7 com a mesma pessoa em A e B
    (depois da 064) e as leituras do município da decisão 3 com a pessoa em A e B.
15. **Seção 3 (serialização)**: migrações do lote 5: 061 E08, 062 E21, 063 e 064 E16; lote 6: 065 E17, 066 E20.
    Funções SQL: `credenciais_da_pessoa` 054, 056 (a 063 não a redefine; se o contrato dela supuser uma conta por
    pessoa, entra no caminho antigo da 064); `trocar_senha`, `registrar_tentativa_login`, `revogar_sessoes_do_usuario`,
    `dono_do_token` 054, 061, 066; `executar_eliminacoes_vencidas` 056; gatilho adiado da conta 054, 058.
    `rotas/convites.ts`: 1C, 4B, 5C.
16. **Pendências humanas novas** (lista no fim do plano): ver abaixo.

### Pendências do Rafael (novas ou mudadas; não alterei `pendencias-humanas.md`)

- **Nova (a numerar), procedimento da liberação em produção:** quem confere, antes de aplicar a 064, que nenhuma
  instância anterior atende o banco (lista de máquinas e versões), e quando. Recomendação: a 064 em produção só depois
  do CP-49 favorável (a mesma pessoa em dois municípios já está barrada em produção até ele), com a conferência
  arquivada como evidência da implantação. A recusa no banco vale mesmo se a conferência errar.
- **Nova (a numerar), o município deixa de ver entrega e "pessoa nova ou existente" no convite:** custo de produto da
  não enumeração; o administrador vê só aberto, aceito, vencido ou revogado. Recomendação: aceitar.
- **H97 (sem mudança de texto):** o aceite agora é da ADR com a correção 2 e da proposta em
  `docs/evidencias-v2/G03/V2-F03-E01/correcao-2/proposta-de-redacao-do-claude-md.md`.
- **H94 e H96:** sem mudança de recomendação; a forma final da redefinição passa a valer na API da E16 (antes da 064),
  pelo procedimento da decisão 1.

### Linha do STATUS sugerida

`V2-F03-E01 | IMPLEMENTADA | candidato em trab/f03-0a-e01-adr (correção 2) | ADR 0009 (proposta) corrigida depois da
segunda rodada da revisão (4 bloqueios novos e 4 parciais fechados como requisito): liberação em 063 aditiva, implantação
conferida e 064 com caminho antigo recusado no banco; não enumeração com tempo e efeitos; conta nasce no aceite; ordem
de travas por níveis; plano-f03 precisa das 16 mudanças do RESUMO da correção 2`.

### Não toquei

STATUS, ESTADO-ATUAL, `dividas.md`, `pendencias-humanas.md`, CLAUDE.md, `plano-f03.md`, código, migrações.
