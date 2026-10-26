# ADR 0009: pessoa global com conta e vínculo por município, e token de um município por vez

- **Data da decisão:** 01/10/2026 (decisão D-08 do Rafael; registro escrito em 26/10/2026, V2-F03-E01;
  correção 1 em 26/10/2026, depois da segunda leitura de segurança)
- **Situação:** PROPOSTA. Aceite pendente do Rafael (H97, junto com a redação
  proposta para o CLAUDE.md) e parecer do encarregado de dados (CP-49). Até o
  aceite, o código da F03 segue esta proposta como premissa
  (`docs/roadmap-v2/retomada/plano-f03.md`, seção 1, E01); nada dela vai para
  produção com a mesma pessoa em mais de um município antes do CP-49.
- **Revoga:** D-02 e A-01 (`docs/roadmap-v2/01-decisoes-e-principios.md`), pela D-08
- **Depende de:** ADR 0001, ADR 0004
- **Complementa:** ADR 0006 (o teto do município continua sendo o administrador,
  e passa a valer só sobre o que é do município) e ADR 0008 (continua não
  existindo credencial que leia dado de negócio de dois municípios)
- **Escopo:** `dc360/` (o produto real). Não se aplica ao protótipo em `mockup/`.

## Contexto

### Como é hoje (árvore `v2/f03` em `ddee3fd`)

Hoje **uma pessoa é uma linha de `usuarios`, e uma linha de `usuarios` é de um
município só.**

- `usuarios` (migração 001) tem `organizacao_id`, nome, matrícula, e-mail, papel
  (CHECK com os quatro papéis), equipe e `ativo`, com `UNIQUE (organizacao_id,
  matricula)` e `UNIQUE (organizacao_id, email)`, sob RLS ativada e forçada.
- A credencial mora na mesma linha: a 002 acrescentou `senha_hash`,
  `falhas_login`, `bloqueado_ate` e `ultimo_acesso`, e a 046 acrescentou
  `senha_provisoria_ate`.
- **O papel de aplicação tem UPDATE na TABELA `usuarios` inteira** (001, linha
  330: `GRANT SELECT, INSERT, UPDATE ON ... usuarios ... TO dc360_app`), e
  nenhuma migração depois disso trocou esse privilégio por privilégio de coluna.
  No Postgres, `REVOKE UPDATE (coluna)` não retira um `UPDATE` concedido na
  tabela: os dois privilégios são independentes.
- A 002 criou `usuarios_email_global_idx`, índice único TOTAL em
  `lower(email)` sobre o sistema inteiro, com o motivo escrito no próprio
  arquivo: "na hora do login ainda não se sabe o município, e dois usuários com
  o mesmo email em prefeituras diferentes tornariam a resposta ambígua". O
  índice não olha `ativo`: conta desativada continua prendendo o e-mail. Por
  causa dele, `POST /usuarios` (`rotas/administracao.ts`) responde 201 para
  e-mail livre e 409 `usuario_repetido` para e-mail que existe em qualquer
  município: quem administra A, comparando com a própria lista, descobre que o
  e-mail tem conta fora de A. É um oráculo que existe desde a F00.
- O administrador troca o e-mail de outra conta pelo `PATCH /usuarios/:id`, e
  `abrir_recuperacao` (005) procura o e-mail em `usuarios` e manda o link para
  ele. Trocar o e-mail e pedir a recuperação é, hoje, um caminho de tomada de
  conta dentro do município (o próprio comentário da rota o descreve).
- `sessoes` (002, com `familia_id` desde a 047) é por município, sob a policy
  `organizacao_id = app_organizacao_atual()`.
- As travas são por CONTA: `travar_sessoes_do_usuario` (049) toma
  `pg_advisory_xact_lock` sobre `usuarios.id`, e o gatilho
  `recuperacoes_morrem_com_a_credencial` (051) dispara em `UPDATE OF senha_hash,
  ativo` de `usuarios` e mata os links daquela conta.
- `segundo_fator` e `segundo_fator_recuperacao` (022) são por
  `(organizacao_id, usuario_id)`: o segundo fator também é de um município. O
  consumo do código TOTP (`auth/segundo-fator.ts`) lê `ultimo_passo` sem trava e
  grava sem condição sobre o valor lido, e desligar o fator pede só a senha.
- O login chama `credenciais_para_login(email)` (SECURITY DEFINER, 002,
  redefinida na 013), que acha a única conta daquele e-mail e, com ela, o
  município. O token sai com esse município fixo. O desafio do segundo fator já
  carrega a impressão da credencial (`cr`, `auth/servico.ts`) e a sessão só
  nasce se a credencial ainda for a conferida.
- O token de acesso (`dc360/apps/api/src/auth/tokens.ts`, `CONTEUDO_ACESSO`) é
  JWT HS256 de 15 minutos com `sub` (o `usuarios.id`), `org`, `papel`, `nome`,
  `sid` e a marca opcional `sp` (senha provisória); emissor `dc360-api`,
  plateia única `dc360`.
- `exigirAutenticacao` (`dc360/apps/api/src/servidor.ts`, por volta da linha
  574 neste SHA) verifica o token e monta a `Identidade` com `usuarioId = sub`,
  `organizacaoId = org`, `papel`, `nome` e `sessaoId = sid`. A ESCRITA (método
  diferente de GET e HEAD, ou rota marcada `comEfeito`) chama `lerVigencia`
  (`auth/vigencia.ts`, uma consulta sob `comTenant(org)`) e `exigirVigencia`;
  a LEITURA PURA confia no papel, no nome e na marca `sp` do token pelos quinze
  minutos dele.
- O portão de isolamento (`dc360/db/test/isolamento.test.ts`) isenta, por nome,
  as tabelas sem `organizacao_id` em `SEM_TENANT` (`schema_migracoes`,
  `organizacoes`, `protocolo_sequencias`, `interesse_municipio`,
  `console_operadores`, `console_codigos_de_recuperacao`) e as sem policy de
  contexto em `SEM_POLICY_DE_TENANT` (só `interesse_municipio`), e limita as
  funções SECURITY DEFINER por um TETO numérico (`<= 27`), não por nome. As duas
  listas são diferentes de propósito: `organizacoes` e `protocolo_sequencias`
  não têm a coluna e TÊM policy de contexto, e continuam conferidas.

A consequência era aceita e estava escrita: um e-mail é uma conta, e uma conta
é um município. A-01 aceitou isso para a V2 ("não redesenhar o login agora") e
a D-02 deixou fora do modelo autenticado quem trabalha em vários municípios.

### Por que muda

Em 01/10/2026 o Rafael decidiu (D-08) que o órgão externo que atende vários
municípios entra na V2, com PESSOA GLOBAL e vínculos: uma conta da pessoa, um
vínculo em cada município e órgão, o token valendo para UM município por vez e
a pessoa escolhendo o município ao entrar. O isolamento entre municípios
continua como hoje.

O caso guia é o engenheiro de uma distribuidora de energia que atende doze
municípios. No modelo de hoje ele precisaria de doze e-mails, doze senhas e
doze segundos fatores, e a prefeitura que desativa a conta dele prende o
e-mail para sempre.

A dificuldade é que a regra número um do CLAUDE.md, lida ao pé da letra,
parece proibir isso: toda tabela de negócio tem `organizacao_id`, e a
organização vem só do token. Uma pessoa global, e um órgão que existe em vários
municípios, parecem violar as duas frases (achados BZ-D:IDN-35 e BZ-D:SEC-48 da
auditoria). Esta ADR mostra em que condições não violam, e transforma essas
condições em regra cobrada por teste.

### O que a segunda leitura de segurança mudou (correção 1)

A primeira redação passou por uma leitura de segurança de outra família de
modelo (Codex, somente leitura), com onze achados, oito deles bloqueando o
aceite. Todos foram conferidos contra o código e as migrações deste SHA e
todos procedem. A tabela achado a achado, com onde cada um foi fechado, está em
`docs/evidencias-v2/G03/V2-F03-E01/correcao-1/RESUMO.md`. Em resumo, esta
redação acrescenta: a relação estritamente um para um entre conta e pessoa até
a liberação da segunda conta (decisão 1); o privilégio de coluna no lugar do
UPDATE de tabela (decisão 1); a autorização por operação e a imutabilidade de
`usuarios.pessoa_id` (decisão 3); os escopos local e global de revogação
(decisão 7, nova); a regra de que nenhuma resposta a um município depende do
que a pessoa tem em outro, que retira o 409 `pessoa_em_varios_municipios` da
primeira redação (decisão 6); a prova nova de autenticação na troca de
município (decisão 2); e os requisitos da E11, da E16 e do catálogo da parte 0B
(decisões 2, 3 e 8).

## Decisão

**Existe pessoa global. Não existe token, sessão nem consulta que valha para dois
municípios ao mesmo tempo, nem resposta a um município que dependa do que a
pessoa tem em outro.** As frases convivem pelas decisões abaixo, e nenhuma é
opcional. As decisões 1 a 6 são os itens 1 a 6 da etapa V2-F03-E01
(`docs/roadmap-v2/05-api-identidade-autorizacao.md`); a 7 e a 8 vieram da
segunda leitura de segurança; as alternativas descartadas (item 7 da etapa)
estão no fim.

### 1. Pessoa, conta e vínculo são três coisas

- **`pessoas` é global e guarda o mínimo:** nome, e-mail, a credencial
  (`senha_hash`, falhas, bloqueio, `senha_provisoria_ate`),
  `email_verificado_em`, `ativo` e, a partir da E11, o segundo fator. É a
  recomendação técnica do CP-49: o mínimo na pessoa, o resto no município, para
  que o parecer do encarregado possa restringir mais sem reescrever. Nada de
  município mora na pessoa: nem papel, nem matrícula, nem equipe, nem órgão.
- **`usuarios` passa a ser a CONTA da pessoa num município.** Mesmos ids, mesmas
  chaves estrangeiras compostas `(organizacao_id, id)` (são mais de vinte, e
  nenhuma muda), mais `pessoa_id`, com `UNIQUE (organizacao_id, pessoa_id)`
  (uma conta por pessoa em cada município) e `UNIQUE (organizacao_id, id,
  pessoa_id)` (alvo das chaves compostas que precisam carregar a pessoa).
  Papel, matrícula, equipe e `ativo` continuam na conta, sob a RLS de hoje.
- **`usuarios.pessoa_id` é atribuído uma vez e nunca muda.** Gatilho no banco
  recusa qualquer UPDATE que altere um `pessoa_id` já preenchido, para todo
  papel, inclusive o dono das funções. O papel de aplicação não tem privilégio
  de INSERT nem de UPDATE nessa coluna (privilégio de coluna, E15). A conta
  nasce ligada a uma pessoa NOVA (backfill da E15 e o cadastro de hoje, até a
  E10) ou é ligada a uma pessoa EXISTENTE só por `aceitar_convite` (E10), com a
  prova da própria pessoa. Coincidência de e-mail nunca liga conta a pessoa: o
  gatilho da E15 que preenche `pessoa_id` nulo só CRIA pessoa nova, nunca
  procura uma pelo e-mail.
- **`sessoes` ganha `pessoa_id` e continua por município.** Cada sessão é de uma
  conta num município, e a vigência confere as três coisas juntas (município,
  conta e pessoa).
- **`orgao_vinculos` é o vínculo temporal da conta com um órgão do MESMO
  município** (E05): papel no órgão (`gestor`, `executor`, `leitor`), início,
  fim, quem concedeu e os motivos; RLS ativada e forçada por município; chave
  composta com a conta e com o órgão, de modo que uma conta de A nunca se liga a
  órgão de B. Vínculo se encerra com motivo, nunca se apaga.

#### Uma conta por pessoa até a liberação da segunda conta

Enquanto existirem escritores antigos da credencial em `usuarios` (passos 1 a 3
abaixo) e enquanto as proteções globais das decisões 2, 6, 7 e 8 não estiverem
no código, **a relação entre conta e pessoa é estritamente um para um, garantida
no banco**: além dos dois UNIQUE acima, a E15 cria `UNIQUE (pessoa_id)` TOTAL em
`usuarios` (sem condição sobre `ativo`, então a conta desativada também conta).
Duas contas, em dois municípios, gravando credencial em linhas diferentes de
`usuarios` espelhadas na mesma pessoa seriam duas origens da mesma senha, que é
exatamente o que a regra dos passos proíbe; com o UNIQUE, esse estado não pode
existir em SHA nenhum.

A **liberação da segunda conta** é o passo 4 da tabela abaixo: a migração que
retira esse UNIQUE é da E16 (063), depois da E08 juntada, e só entra no mesmo
SHA em que estão provados: os escritores antigos retirados (passo 3), a
revogação com os dois escopos (decisão 7), a autorização por operação (decisão
3), as intervenções administrativas na credencial na forma final (decisão 6), o
segundo fator na pessoa com consumo atômico (E11, decisão 8) e o login em dois
passos com a troca de município da decisão 2. Antes dela, nenhuma etapa cria a
mesma pessoa em dois municípios, nem em teste de API: os testes de "mesma
pessoa em A e B" (E18, E10 com pessoa existente, E17) rodam depois da
liberação.

#### A credencial muda de casa em passos, sem duas fontes graváveis ao mesmo tempo (P-04)

A senha não pode ter duas cópias que alguém grave de forma independente: a
troca feita numa seria desfeita pela outra, e o bloqueio por força bruta
contaria em dobro ou não contaria. Por isso a passagem de `usuarios` para
`pessoas` é feita assim, e em nenhum SHA intermediário existe mais de uma fonte
gravável:

| Passo | Etapa e migração | Quem a aplicação e as funções GRAVAM | De onde a API LÊ | Como `pessoas` se mantém | Relação conta e pessoa |
| --- | --- | --- | --- | --- | --- |
| 1 | E15 (054) | `usuarios` | `usuarios` (API não muda) | gatilho espelha cada escrita de credencial e de e-mail de `usuarios` em `pessoas`, de mão única | um para um, no banco |
| 2 | E02 (sem migração) | `usuarios` | `pessoas` (`credenciais_da_pessoa`) | o mesmo espelho | um para um, no banco |
| 3 | E08 (061) | só `pessoas` | `pessoas` | espelho desligado; privilégios de `usuarios` refeitos por coluna (abaixo) | um para um, no banco |
| 4 | E16 (063) | só `pessoas` | `pessoas` | nada a espelhar | liberação da segunda conta, com as condições acima |

**O passo 3 retira o privilégio de verdade.** Revogar UPDATE das colunas antigas
não basta, porque o `dc360_app` tem UPDATE na tabela (001). A E08:

1. faz `REVOKE INSERT, UPDATE ON usuarios FROM dc360_app` (o privilégio de
   TABELA) e concede de volta, por coluna, só as colunas que a aplicação ainda
   grava, numa lista positiva escrita na migração; as colunas de credencial
   (`senha_hash`, `falhas_login`, `bloqueado_ate`, `senha_provisoria_ate`),
   `email` e `pessoa_id` ficam fora dela. A E15 já faz o mesmo para `pessoa_id`
   no passo 1 (INSERT e UPDATE por coluna, sem `pessoa_id`), então a E08 só
   encolhe a lista;
2. redefine TODOS os escritores privilegiados do inventário (funções SECURITY
   DEFINER, que gravam com o privilégio do dono e não são alcançadas por
   REVOKE nenhum) para gravar só em `pessoas`, e move para `pessoas` os
   gatilhos que acompanham a credencial (`recuperacoes_morrem_com_a_credencial`
   da 051 e `senha_trocada_deixa_de_ser_provisoria` da 046);
3. esvazia as colunas antigas de credencial em `usuarios` (os valores vivem em
   `pessoas`) depois de mover os gatilhos do item 2, e retira o SELECT delas do
   `dc360_app` pelo mesmo caminho (SELECT de tabela trocado por SELECT por
   coluna), de modo que a aplicação deixa de LER cópia velha de hash a partir do
   passo 3. As colunas caem numa migração posterior, que não é da F03.

**Inventário (a lista completa e conferida é da E15, antes do passo 1).** Ele
cobre tudo o que lê ou grava a credencial, o e-mail que recebe a recuperação, a
ligação entre conta e pessoa, e todo emissor de prova de autenticação, inclusive
o console. Cada item tem etapa dona; o ponto de partida, lido nas migrações e no
código deste SHA:

| Item | O que faz hoje | Etapa dona e o que ela faz |
| --- | --- | --- |
| `credenciais_para_login` (002, 013) | lê credencial e e-mail em `usuarios` | E02 troca a leitura por `credenciais_da_pessoa`; E08 a retira ou a deixa só de leitura em `pessoas` |
| `registrar_tentativa_login` (002) | grava falhas e bloqueio em `usuarios`, pelo id recebido | E08 grava em `pessoas`, conferindo quem pede (decisão 3) |
| `trocar_senha` (005, 049) | grava `senha_hash` pelo id recebido | E08: só a própria pessoa, com a senha atual relida sob a trava (decisão 3), escopo global (decisão 7) |
| `abrir_recuperacao` (005) | procura o e-mail em `usuarios` ativos e cria o link para a conta | E08 procura em `pessoas` e cria o link para a PESSOA; antes disso, a relação um para um garante que a conta achada é a única da pessoa |
| `consumir_recuperacao` (005, 049, 051) | grava a senha da conta do link | E08 grava em `pessoas`, escopo global (decisão 7) |
| `recuperacoes_senha` (005) | link por `usuario_id` | E08 liga o link à pessoa e à versão da credencial |
| gatilho `recuperacoes_morrem_com_a_credencial` (051) | `AFTER UPDATE OF senha_hash, ativo` de `usuarios` | E08 separa: troca de credencial em `pessoas` mata os links da pessoa (global); `ativo` da conta mata só os links ligados àquela conta (local) |
| gatilho `senha_trocada_deixa_de_ser_provisoria` (046) | `BEFORE UPDATE OF senha_hash` de `usuarios` | E08 move para `pessoas` |
| `dono_do_token` (002, 046, 048) | devolve a conta e o motivo de recusa | E08 devolve também a organização e confere o tenant |
| `revogar_sessoes_do_usuario`, `travar_sessoes_do_usuario` (049) | trava e revoga por conta | E08 mantém por conta (escopo local) e cria o escopo global por pessoa (decisão 7) |
| `abrir_sessao` (002, 047, 049) e `emitirPar` (`auth/servico.ts`) | emitem a sessão e o par de tokens | E08 confere conta, pessoa e município juntos; E16 os chama na escolha e na troca |
| desafio do segundo fator (`cr`, `auth/servico.ts`) | prova intermediária ligada à credencial | E11 e E16 mantêm a ligação à credencial e a estendem à pessoa (decisão 8) |
| `auth/segundo-fator.ts` (`desativar` lê `senha_hash` de `usuarios`) | confere a senha na conta | E02 lê da pessoa; E11 move o fator para a pessoa (decisão 8) |
| `provisionar_municipio` (036) | o console cria o primeiro administrador com senha | E15 cria a pessoa nova junto (nunca liga a pessoa existente); E08 grava a credencial só em `pessoas` |
| `POST /usuarios` (`rotas/administracao.ts`) | cria a conta com a senha digitada por quem cria | E15 (gatilho cria a pessoa nova); E10 troca por convite, com senha no corpo respondendo 422 |
| `PATCH /usuarios/:id` (`rotas/administracao.ts`) | o administrador troca o e-mail de outra conta | E09 retira o e-mail do que o PATCH aceita: nenhum município troca o e-mail de uma pessoa (decisão 6) |
| `POST /usuarios/:id/redefinir-senha` (`rotas/administracao.ts`, F00-E09) | o administrador define senha provisória | E08 grava em `pessoas` sob a trava da pessoa; E16 (passo 4) a deixa na forma final da decisão 6 |
| reset do segundo fator pelo superior (nasce na E11) | não existe hoje | E11 o cria só para o período um para um; E16 (passo 4) o deixa na forma final da decisão 6 |
| `aceitar_convite`, `convidar_pessoa` (nascem na E10) | não existem hoje | E10: únicas que ligam conta a pessoa existente (decisão 3) |
| `INSERT INTO usuarios` direto (sementes, modo local, testes) | grava conta e senha | E15 confere que nenhum caminho de produção grava `pessoa_id` fora das funções acima; sementes e modo local seguem a regra da pessoa nova |

O backfill da E15 cria uma pessoa por conta (o e-mail já é único no sistema,
então a relação de hoje é um para um), com as contagens antes e depois
arquivadas.

### 2. O token vale para um município por vez, e a pessoa escolhe o município ao entrar

- **Conteúdo do token (E02):** `sub` é a PESSOA, `org` é o município ativo, mais
  `sid`, `aud`, `iss`, `iat` e `exp`. Papel, nome e a marca `sp` deixam de ser
  autoridade: vêm do banco a cada requisição. Para não derrubar quem está
  dentro, há uma janela em que `sub` também é aceito como `usuarios.id`, até
  `ACEITA_SUB_DE_CONTA_ATE`; como cumprir os dois deploys é a pendência H95.
- **Vigência em toda requisição (E03), antes do token enxuto (P-01):** conta
  ativa, sessão viva, senha provisória e município ativo são conferidos no banco
  em todo método, leituras inclusive, numa consulta só. Em nenhum SHA o papel
  sai do token sem que a leitura já consulte o banco.
- **Login em dois passos (E16):** a senha é conferida na pessoa; com uma conta
  ativa a resposta é a de hoje; com nenhuma, credenciais inválidas; com várias,
  a resposta traz a escolha (desafio curto e a lista dos municípios). A lista só
  sai DEPOIS da senha, então não é oráculo de e-mail, e mostra à pessoa só onde
  ela mesma tem conta.
- **Troca de município (E16) exige prova nova de autenticação para o destino.**
  A sessão do município de origem, sozinha, NÃO autoriza a troca: quem rouba o
  token ou a sessão de A não pode usá-los para chegar a B. `POST
  /v1/auth/trocar-municipio` exige a senha da pessoa conferida naquele momento
  e, quando a conta de destino exige segundo fator (E11), um código novo; o
  `mfa_verificado_em` do destino é o horário dessa conferência, e nada é
  herdado da sessão de origem. A troca gera sessão nova e token novo no
  destino. Nunca um token com dois `org`, nunca a lista de municípios dentro do
  token, nunca sessão compartilhada entre municípios. A forma mais leve (herdar
  a verificação do segundo fator por até `MFA_VIGENCIA_MINUTOS`, premissa
  anterior do plano) amplia o alcance de um token roubado a todos os municípios
  da pessoa; ela só pode ser adotada se o Rafael aceitar esse risco por
  escrito, na pergunta 2 do CP-50. Esta ADR não aceita esse risco.
- **Plateia pela conta escolhida (E07):** `dc360` para conta de servidor,
  `dc360-portal` para conta `usuario_orgao`. A mesma pessoa pode ter plateias
  diferentes em A e em B, e o token de uma plateia não vale em rota da outra.

#### A organização continua vindo só do token verificado

A frase do CLAUDE.md fica de pé, inteira: o `org` do token assinado vira o
`SET LOCAL`, e nunca cabeçalho, parâmetro de rota ou corpo. Duas precisões, para
ninguém ler a pessoa global como brecha:

1. **Pertencer a vários municípios não dá acesso a vários municípios.** A
   vigência só aceita `(sub, org, sid)` se `sid` é sessão viva de uma conta
   ativa DA PESSOA `sub` NO município `org`, e a função que confere
   (`vigencia_da_sessao`, E15) exige `org = app_organizacao_atual()`. A lista de
   municípios da pessoa nunca vira contexto de banco.
2. **A escolha e a troca de município são as duas OPERAÇÕES RESTRITAS DE
   AUTENTICAÇÃO, as únicas que recebem organização fora do token, e elas só
   escolhem.** `POST /v1/auth/municipio` (escolha, com o desafio do login) e
   `POST /v1/auth/trocar-municipio` (troca, com a prova nova acima) recebem um
   `organizacaoId` que:
   - é validado NO BANCO contra as contas ativas daquela pessoa
     (`municipios_da_pessoa`, E16), sob o tenant do sistema, antes de qualquer
     outra consulta;
   - nunca vira contexto de banco (`SET LOCAL`) por si: o único contexto que
     sai dali é o `org` do token assinado depois da autorização;
   - não abre leitura de dado de negócio do destino antes de autorizado (a
     única consulta antes da autorização é a da lista de contas e a da
     suspensão do município, `exigirAcessoAtivo`);
   - fora da lista responde 404, o mesmo corpo para município inexistente,
     suspenso ou onde a pessoa não tem conta ativa.

**Recurso de outro município responde 404, nunca 403**, também para a pessoa
que tem conta nos dois: token de B pedindo recurso de A é 404, e
`trocar-municipio` para município onde a pessoa não tem conta é 404. A E18 prova
isso com a mesma pessoa em A e B, rota por rota.

### 3. `pessoas` é a EXCEÇÃO NOMEADA ao isolamento, e o isolamento continua garantido

`pessoas` não tem `organizacao_id`, por definição. Ela entra na lista nominal de
exceções como `interesse_municipio` entrou, com nome e motivo, e o que a prende
não é a coluna, são quatro travas que valem juntas:

1. **RLS ativada E forçada, SEM nenhuma policy.** Mesmo que alguém conceda
   privilégio por engano, o papel de aplicação lê zero linhas.
2. **Nenhum grant ao `dc360_app`:** nem SELECT, nem INSERT, nem UPDATE, nem
   DELETE, nem privilégio de coluna, nem por herança ou `PUBLIC`. O papel de
   aplicação recebe "permissão negada" ao tocar a tabela (teste negativo da E15).
3. **Acesso só por funções SECURITY DEFINER da lista nominal**, com
   `search_path` fixo, e cada uma conferindo QUEM PEDE, para QUÊ, e sobre QUEM
   (abaixo). Pertencer ao município não basta: a função que verifica só "a
   pessoa tem conta ativa em A" deixaria um ator de A alcançar a credencial de
   uma pessoa que também está em B. Os nomes são fixados pela etapa que cria
   cada função (`vigencia_da_sessao` e `credenciais_da_pessoa` na E15,
   `pessoa_acompanha_as_contas` na E09, `convidar_pessoa` e `aceitar_convite` na
   E10, `municipios_da_pessoa` na E16, as de autenticação redefinidas na E08).
4. **A lista é conferida no catálogo do banco, nos dois sentidos** (requisitos
   da parte 0B na decisão 8). O teto `<= 27` vira `FUNCOES_PRIVILEGIADAS` (P-03,
   parte 0B do lote 0, antes de qualquer função nova da F03). Função SECURITY
   DEFINER no banco fora da lista reprova; entrada na lista sem função no banco
   também. Do mesmo jeito, `SEM_TENANT` e `SEM_POLICY_DE_TENANT` viram
   `EXCECOES_AO_ISOLAMENTO`: tabela sem `organizacao_id` fora da lista reprova o
   portão.

Toda outra tabela da pessoa (o segundo fator e os códigos de recuperação da E11,
as cotas da E19) entra na lista **por nome próprio**, com a trava própria
declarada pela etapa que a cria. Não existe isenção por prefixo nem por padrão
de nome.

#### Autorização por operação sobre a pessoa

Toda função que muda a credencial da pessoa, o segundo fator dela ou a ligação
entre conta e pessoa confere NO BANCO a identidade de quem pede (a sessão viva
do solicitante, lida do contexto do ator da E06 ou recebida e conferida pela
função contra `sessoes`), a operação pedida e o alvo, pela tabela abaixo. O
alvo nunca é aceito sozinho como parâmetro: um `usuario_id` ou `pessoa_id`
vindo da API sem o solicitante conferido reprova o teste da etapa.

| Operação | Escopo (decisão 7) | Quem pode | Prova exigida, conferida na mesma transação |
| --- | --- | --- | --- |
| trocar a própria senha | global | só a própria pessoa (solicitante = alvo) | senha atual conferida contra o hash relido sob a trava da pessoa |
| recuperar a senha por link | global | quem tem o link | link de uso único, ligado à pessoa e à versão da credencial |
| ligar, trocar ou desligar o segundo fator | global | só a própria pessoa | senha atual e código do fator atual, ou código de recuperação (decisão 8) |
| redefinir senha por administrador (F00-E09) | global | administrador do município, alvo diferente do solicitante, com posto | só enquanto vale a relação um para um; no passo 4, forma final da decisão 6 |
| redefinir o segundo fator pelo superior (E11) | global | superior do município, com posto | idem |
| ligar conta a pessoa existente | não se aplica | só `aceitar_convite` | link do convite e sessão da própria pessoa (pessoa existente) ou definição da senha (pessoa nova) |
| desativar, reativar, mudar papel ou equipe da conta | local | quem gerencia usuários no município | as regras de posto de hoje |
| encerrar as próprias sessões | local | a própria conta | sessão viva |

#### O que nenhuma função e nenhuma rota pode fazer

- devolver lista de pessoas;
- dizer a um município que a pessoa tem conta, vínculo, papel, convite ou sessão
  em outro, nem a existência deles. Isto vale para o CORPO e para o STATUS da
  resposta: **nenhuma resposta a um município (código, corpo, cabeçalho) pode
  depender de conta, pessoa ou convite fora dele.** Quando o efeito tem de
  depender disso, a resposta é a mesma nos dois casos e o caminho diferente fica
  com a própria pessoa (que sabe onde tem conta) ou com o convite;
- deixar a ação de um município alterar a pessoa no que ela é para outro
  município, fora do que a tabela acima permite no período um para um.

O município enxerga a pessoa só pela conta que tem com ela. Esta última regra é
também a recomendação técnica do CP-49 ("nunca expor a um município o vínculo
da pessoa em outro").

### 4. O órgão é contexto dentro do município, não é tenant

- O tenant continua sendo SÓ o município. O órgão (secretaria, autarquia,
  concessionária, órgão estadual, bombeiros) é uma linha de `orgaos` DENTRO de um
  município; o órgão externo que atende vários municípios tem uma linha em cada
  um (E17), e não existe catálogo global de órgãos.
- O token nunca carrega órgão. O órgão da requisição vem da rota e só vale com
  vínculo vigente da conta naquele órgão, conferido no banco (E06); sem vínculo,
  404.
- O isolamento POR ÓRGÃO dentro do município (RLS fail-closed, dossiê, órgão que
  nunca consulta `ocorrencias`) é da ADR 0010 (V2-F04-E01), não desta.
- A redação que o CLAUDE.md precisa para dizer isso está proposta em
  `docs/evidencias-v2/G03/V2-F03-E01/correcao-1/proposta-de-redacao-do-claude-md.md`
  (a versão da primeira redação, na pasta da etapa, fica como histórico). O
  CLAUDE.md não é alterado antes do aceite do Rafael (H97).

### 5. O papel genérico `usuario_orgao`

- É papel da CONTA no município, com posto 1 e NENHUMA permissão de servidor
  (E04). O que a conta pode fazer vem do vínculo (`gestor`, `executor`,
  `leitor`) e das ações do encaminhamento da F04, nunca de um papel por
  secretaria.
- Nasce só por convite (E10). Nunca se converte de ou para papel de servidor:
  409 `papel_nao_se_converte` na API e gatilho no banco.
- O login dessa conta fica FECHADO até o G03: na E04 ele responde credenciais
  inválidas sem chave nenhuma, e depois por `PORTAL_ATIVO`, com padrão `nao`
  (P-09). Segundo fator obrigatório para ela (E11). O recorte de leitura é lista
  positiva: papel fora da lista recebe vazio e 404 (E14).

### 6. O administrador de município nunca define senha, e-mail nem segundo fator de pessoa com conta em outro município, e nunca descobre se ela tem

A ADR 0006 fez do administrador o teto do município. Com a pessoa global, a
pessoa fica acima de qualquer município, e o teto passa a valer só sobre o que é
do município:

- **O município controla a CONTA:** cria por convite, ativa e desativa, muda
  papel e equipe, encerra as sessões da conta NAQUELE município, concede e
  encerra vínculo. Desativar a conta em A não derruba a conta em B, e suspender
  A não suspende B (E18).
- **O município não controla a PESSOA:** senha, e-mail e segundo fator são da
  pessoa. A conta nova nasce por convite de uso único, e ninguém que cria conta
  conhece a senha de ninguém (E10).
- **Nenhum município troca o e-mail de uma pessoa.** A E09 retira o e-mail do
  que o `PATCH /usuarios/:id` aceita. Trocar o próprio e-mail fica para depois
  (`dc360/apps/api/PENDENCIAS.md`): nenhuma etapa da F03 o faz.
- **A resposta ao administrador nunca depende de outro município.** A primeira
  redação desta ADR previa 409 `pessoa_em_varios_municipios` quando o
  administrador de A tentasse redefinir a senha ou o segundo fator de quem tem
  conta em outro município. Esse 409 confirma a A uma conta fora de A, que é o
  que a decisão 3 proíbe, e foi retirado: o código não é resposta a município
  nenhum. Em seu lugar:
  - **Até a liberação da segunda conta (passos 1 a 3):** a relação um para um
    no banco garante que a pessoa da conta de A não tem conta em mais lugar
    nenhum, ativa ou desativada. A redefinição de senha com senha provisória
    (F00-E09) continua, e o reset do segundo fator pelo superior (E11) pode
    existir, porque nesse período eles alcançam só uma pessoa exclusiva do
    município, sem condição nenhuma que precise ser respondida. Os dois tomam a
    trava da pessoa (decisão 7) e invalidam os convites abertos para ela.
  - **A partir da liberação (passo 4, E16):** nenhuma intervenção de município
    na credencial de pessoa pode ser condicional ao que ela tem fora dele. A
    forma final é a recomendação técnica do CP-50 (alternativa A): o superior só
    suspende e reabilita a CONTA no município dele (e derruba as sessões ali);
    a redefinição da senha e do segundo fator é feita pela própria pessoa (link
    de recuperação, código de recuperação) ou pelo fornecedor no console, com
    verificação e trilha. A rota `redefinir-senha` e o reset do superior passam,
    no mesmo SHA da liberação, a responder igual para toda pessoa (202, pedido
    registrado, link de recuperação enviado ao e-mail DA PESSOA quando a
    recuperação por e-mail está ligada), sem senha na resposta.
  - **Se o CP-50 decidir manter alguma intervenção depois da liberação**, ela
    só existe se cumprir as quatro condições juntas: (a) conta como "outra
    conta" QUALQUER conta ligada à pessoa, ativa ou desativada, e todo convite
    aberto para ela; (b) toma a trava da pessoa e é serializada com convite,
    aceite, ativação, reativação e mudança de credencial; (c) responde ao
    administrador o mesmo status e o mesmo corpo com ou sem outra conta; (d)
    nunca devolve senha ao administrador. A forma que devolve senha provisória
    na resposta não cumpre (c) e (d) ao mesmo tempo, e por isso não sobrevive à
    liberação.
- **Criar conta também não pode ser oráculo.** Hoje o `POST /usuarios` responde
  201 ou 409 conforme o e-mail exista em outro município. A E09 não fecha isso
  (o corpo igual do 409 não muda o fato de que 201 e 409 se distinguem) e não
  pode ser apresentada como o fechamento. O fechamento é a E10: criar conta vira
  convite, e o 202 é igual para e-mail livre, para pessoa com conta ativa ou
  desativada em outro município e para pessoa com convite aberto em outro
  município. Até a E10, o oráculo de hoje fica registrado como conhecido, desde
  a F00, e não aumenta.
- **Reativar conta também não pode ser oráculo.** A reativação pela E09 responde
  igual com ou sem outra pessoa ativa usando o mesmo e-mail em outro lugar. Se
  a pessoa da conta não pode voltar a ser ativa porque o e-mail passou a outra
  pessoa ativa, a conta volta ativa no município, a pessoa antiga continua
  inativa, e o caminho é um convite novo (que alcança quem hoje tem o e-mail).
  A conta nunca se reativa para outra pessoa, porque `pessoa_id` não muda
  (decisão 1).

### 7. Revogação: escopo local e escopo global, e uma trava por pessoa

Hoje travas, links de recuperação e revogação de sessão são todos por
`usuarios.id`. Deixá-los assim faria a recuperação da senha em A deixar o
invasor renovando uma sessão em B, ou consumindo um link antigo de B.
Convertê-los todos para a pessoa faria a desativação em A derrubar B. Por isso
cada operação tem escopo declarado:

| Escopo | Operações | O que revoga |
| --- | --- | --- |
| LOCAL (a conta, no município dela) | desativar a conta; suspender ou eliminar o município (console); encerrar as próprias sessões | as sessões e famílias daquela conta e os links de recuperação ligados àquela conta, e mais nada. A pessoa e as outras contas dela não são tocadas |
| GLOBAL (a pessoa, em todos os municípios) | trocar a senha; recuperar a senha; redefinição pelo administrador no período um para um; ligar, trocar, desligar ou redefinir o segundo fator | todas as sessões e famílias de TODAS as contas da pessoa, todos os links de recuperação da pessoa, os desafios de login e de escolha emitidos antes (decisão 8) e os convites abertos para ela |

- **Trava comum por pessoa.** Toda operação global, todo aceite e emissão de
  convite para pessoa existente, toda ativação e reativação de conta e a
  liberação da segunda conta tomam `pg_advisory_xact_lock` sobre o
  `pessoa_id` (chave própria, separada da de `travar_sessoes_do_usuario`).
- **Ordem, para não haver ciclo:** trava da pessoa; depois a linha de
  `pessoas`; depois as linhas de `usuarios` envolvidas; depois
  `travar_sessoes_do_usuario` de cada conta, em ordem crescente de
  `usuarios.id`. Nenhum caminho toma a trava da pessoa depois de já ter tomado
  uma dessas. Operação local não toma a trava da pessoa e segue a ordem da 049
  (linha de `usuarios` antes da trava das sessões). A E08 escreve essa ordem no
  cabeçalho da migração 061.
- **Sobrevivência de família e de link confere as três coisas juntas.** A
  renovação de sessão e o consumo de link só valem se município, conta e pessoa
  baterem com o que estava gravado, e se a versão da credencial da pessoa ainda
  for a mesma.
- **Testes concorrentes obrigatórios (E08):** recuperação em A durante
  renovação em B (B não renova); desativação em A durante renovação em B (B
  renova); troca de senha concorrente com aceite de convite (nenhum dos dois
  perde a escrita, nenhum deadlock); dois consumos do mesmo link em municípios
  diferentes (um só vence). Os testes de B com a mesma pessoa rodam depois da
  liberação (E16), na E18.

### 8. Requisitos que a segunda leitura de segurança fixou para a E11, a E16 e o catálogo da 0B

**E11, segundo fator na pessoa:**

- consumo do código TOTP atômico: `UPDATE ... WHERE ultimo_passo IS NULL OR
  ultimo_passo < passo_novo` com `RETURNING`, ou leitura `FOR UPDATE` sob a
  trava da pessoa; o mesmo código usado em duas entradas concorrentes (no
  mesmo município ou em dois) vale uma vez só, com teste concorrente;
- contadores de falha e bloqueio do segundo fator na pessoa, separados dos
  contadores de senha;
- desligar ou trocar o fator global exige a senha atual E o código do fator
  atual (ou um código de recuperação), e é recusado enquanto alguma conta ativa
  da pessoa estiver num papel com fator obrigatório; a resposta vai à própria
  pessoa, nunca a município, e vale também quando o pedido parte de uma conta
  de papel inferior;
- o reset pelo superior existe só no período um para um (decisão 6), toma a
  trava da pessoa e tem escopo global (decisão 7).

**E16, login em dois passos, escolha e troca:**

- o desafio da escolha tem propósito e plateia próprios (não serve como token de
  acesso, nem como desafio do segundo fator, nem o contrário), é ligado à
  pessoa e à versão da credencial (como o `cr` de hoje) e é revalidado no
  consumo: pessoa ativa, credencial na mesma versão, conta de destino ativa,
  município não suspenso;
- todo evento global da decisão 7 invalida os desafios emitidos antes dele;
- `mfa_verificado_em` é o horário da conferência real do código, gravado pelo
  servidor na sessão; renovação de sessão e troca de município nunca o
  recalculam nem o estendem;
- a troca exige a prova nova da decisão 2;
- a mesma migração (063) faz a liberação da segunda conta (passo 4), com as
  condições da decisão 1, e a E16 deixa `redefinir-senha` e o reset do superior
  na forma final da decisão 6.

**Catálogo da parte 0B (`FUNCOES_PRIVILEGIADAS` e `EXCECOES_AO_ISOLAMENTO`):**

- cada função é identificada por esquema e assinatura completa (`oid::regprocedure`,
  por exemplo `public.trocar_senha(uuid,text,uuid)`), nunca só pelo nome; uma
  sobrecarga com o mesmo nome e outra assinatura é função fora da lista e
  reprova;
- cada entrada traz o motivo, como confere o tenant e quem pede, a lista exata
  de papéis com EXECUTE (conferida contra a ACL do catálogo, sem `PUBLIC`) e o
  teste comportamental que prova a conferência;
- cada exceção de tabela declara, separadamente, QUAIS invariantes do portão ela
  dispensa (entre eles, a coluna `organizacao_id` e a policy de contexto) e
  QUAIS mantém (entre eles, RLS ativada e forçada, os grants efetivos
  conferidos papel por papel, as chaves estrangeiras com a organização onde
  houver e a trilha de auditoria append-only); o teste confere, para cada
  entrada, todo invariante declarado como mantido. Estar na lista nunca é
  dispensa geral: `organizacoes` e `protocolo_sequencias` continuam sendo
  conferidas na policy, como hoje, e `pessoas` mantém RLS forçada e zero grant;
- os testes de hoje sobre grants efetivos, RLS, chaves estrangeiras e auditoria
  continuam valendo sem afrouxamento, inclusive a distinção entre "sem a
  coluna" e "sem policy".

### Premissas do plano da F03 que esta ADR fixa como norma

O plano (`docs/roadmap-v2/retomada/plano-f03.md`, seção 1) tem doze premissas.
Algumas são norma de segurança e ficam valendo como esta ADR; as outras são
ordem de trabalho e não são regra de produto. Duas premissas do plano foram
alteradas por esta correção (a herança do segundo fator na troca, na E16, e o
409 `pessoa_em_varios_municipios`, na E08 e na E11); a mudança exata do plano
está no RESUMO da correção 1, para o orquestrador.

| Premissa | O que diz | Aqui é |
| --- | --- | --- |
| P-01 | E03 antes da E02 | NORMA: a leitura passa a consultar o banco antes de o papel sair do token (decisão 2) |
| P-02 | E15 em paralelo com a E04 | ordem de trabalho |
| P-03 | lista nominal de funções privilegiadas sobe para o lote 0 | NORMA: nenhuma função privilegiada da F03 nasce sem entrada na lista, por assinatura (decisões 3 e 8) |
| P-04 | credencial em passos | NORMA: nunca duas fontes graváveis, e uma conta por pessoa até o passo 4 (decisão 1) |
| P-05 | E05 entrega o vínculo, E06 liga na vigência | ordem de trabalho; a norma é que vínculo só vale lido pela vigência (decisão 4) |
| P-06 | rotas enumeradas por `superficie-registrada.ts` até o ajudante da F02-E05 | ferramenta de teste |
| P-07 | login e relógios usam `comTenantDoSistema` | NORMA: quem age sem pessoa logada se declara `sistema`, e nenhuma transação nasce sem ator (E06) |
| P-08 | E12 em paralelo com a E06 | ordem de trabalho |
| P-09 | login do `usuario_orgao` fechado no lote 1; `PORTAL_ATIVO` declarado na 1C e ligado na 2A | NORMA: a conta `usuario_orgao` não entra antes do G03 (decisão 5) |
| P-10 | E10 e E18 divididas em banco e API | ordem de trabalho |
| P-11 | pontos de extensão vazios na abertura da API | NORMA só na parte da configuração: toda chave da F03 nasce com padrão fechado e sem efeito |
| P-12 | migrações 053 a 065 | numeração, não norma (a liberação entra na 063, sem migração nova) |

## Consequências

### O que muda em cada etapa da F03

| Etapa | O que esta ADR exige dela |
| --- | --- |
| E02 | token `{ sub, org, sid }`, `sub` é a pessoa; credencial lida da pessoa (passo 2), inclusive em `segundo-fator.ts`; nada em `apps/api/src` lê papel, nome ou `sp` do token |
| E03 | vigência em todo método, leituras inclusive; conta inativa não lê |
| E04 | domínio de papel no banco; `usuario_orgao` sem permissão, sem conversão, login fechado |
| E05 | `orgao_vinculos` por município, chave composta com a conta e o órgão, encerra e não apaga |
| E06 | ator (conta, pessoa, papel, órgão) no contexto do banco; papel e pessoa vêm da vigência, nunca do token; é dele que as funções da decisão 3 leem o solicitante |
| E07 | plateia pela conta escolhida; `dc360-portal` não vale no painel e vice-versa; registra nesta ADR o que provou (lote 7B) |
| E08 | passo 3 inteiro (privilégio de tabela retirado, lista positiva por coluna, escritores privilegiados redefinidos, gatilhos movidos, colunas antigas esvaziadas e sem SELECT); funções de autenticação conferem tenant e solicitante (decisão 3); `abrir_recuperacao` e os links na pessoa; escopos local e global e a trava da pessoa (decisão 7); `redefinir-senha` gravando em `pessoas` sob a trava |
| E09 | e-mail único só entre PESSOAS ativas; o `PATCH /usuarios/:id` deixa de aceitar e-mail; reativação com resposta igual (decisão 6); conta desativada nunca se reativa para outra pessoa; NÃO se apresenta como fechamento da enumeração no cadastro |
| E10 | conta nasce por convite; 202 igual nos quatro casos da decisão 6; a ligação a pessoa existente só no aceite, uma vez; até o passo 4 o aceite por pessoa que já tem conta é recusado à própria pessoa, com mensagem neutra, e a resposta ao administrador não muda; convidar não muda a credencial de quem já existe; mudança de credencial invalida o convite aberto, e quem convidou vê o mesmo estado de convite vencido |
| E11 | segundo fator na pessoa; obrigatório para `usuario_orgao`, coordenador e administrador; os requisitos da decisão 8; reset pelo superior só no período um para um, sem 409 `pessoa_em_varios_municipios` |
| E12 e E13 | rota sem ação declarada é negada; a matriz inclui o `usuario_orgao` |
| E14 | recorte em lista positiva |
| E15 | `pessoas` com as quatro travas da decisão 3; `UNIQUE (pessoa_id)` total em `usuarios`; `pessoa_id` imutável e fora do privilégio da aplicação; gatilho que só cria pessoa nova; backfill sem perda; espelho da credencial e do e-mail (passo 1); inventário completo da decisão 1 |
| E16 | login em dois passos; escolha e troca como operações restritas, a troca com prova nova (decisão 2); requisitos da decisão 8; liberação da segunda conta (passo 4) e forma final das intervenções da decisão 6, no mesmo SHA |
| E17 | órgão externo como linha em cada município; a mesma pessoa convidada por cada um; roda depois do passo 4 |
| E18 | prova de cruzamento com a mesma pessoa em A e B, banco e API, depois do passo 4; registra nesta ADR o resultado (lote 7B) |
| E19 | `cotas_de_uso` como exceção nomeada própria, chave por HMAC |
| E20 | a trilha da conta não revela evento de outra pessoa nem de outro município |
| E21 | o sigilo usa o ator da E06; nada muda nesta ADR |

### Testes obrigatórios que a etapa responsável traz

| Etapa | Teste |
| --- | --- |
| 0B | sobrecarga de função privilegiada com o mesmo nome e outra assinatura reprova; EXECUTE a mais que a ACL declarada reprova; tabela da lista de exceções que deixa de cumprir um invariante declarado como mantido (por exemplo, `pessoas` sem RLS forçada ou com grant ao `dc360_app`) reprova |
| E15 | segunda conta (ativa ou desativada) com o mesmo `pessoa_id` recusada pelo banco; UPDATE de `pessoa_id` já preenchido recusado, como `dc360_app` e como dono; INSERT e UPDATE de `pessoa_id` pelo `dc360_app` com "permissão negada"; e-mail de pessoa existente não liga a conta nova a ela; toque em `pessoas` pelo `dc360_app` com "permissão negada" |
| E08 | para CADA coluna antiga (`senha_hash`, `falhas_login`, `bloqueado_ate`, `senha_provisoria_ate`, `email`, `pessoa_id`), UPDATE pelo `dc360_app` recebe "permissão negada"; SELECT das colunas de credencial também; cada função do inventário, chamada, não muda as colunas antigas; função chamada com alvo e sem solicitante conferido é recusada; troca de senha de outra pessoa com a própria sessão é recusada; os testes concorrentes da decisão 7 |
| E09 | o `PATCH` com e-mail diferente é recusado; reativação com resposta byte a byte igual com e sem outra pessoa ativa usando o e-mail |
| E10 | 202 com status, corpo e cabeçalhos iguais para: e-mail livre, pessoa com conta ativa em outro município, pessoa só com conta desativada em outro município, pessoa com convite aberto em outro município; aceite com a sessão de outra pessoa recusado; aceite por pessoa que já tem conta recusado até o passo 4 |
| E11 | o mesmo código TOTP em duas entradas concorrentes vale uma vez; desligar com só a senha é recusado; desligar com conta ativa de fator obrigatório é recusado; falhas do fator não mexem nas falhas de senha |
| E16 | desafio de escolha emitido antes de uma recuperação não cria sessão depois dela; desafio de escolha não vale como desafio do segundo fator, nem o contrário; troca com só o token de origem é recusada; troca não estende `mfa_verificado_em`; `organizacaoId` fora da lista responde 404 sem nenhuma consulta de negócio do destino; na liberação, `redefinir-senha` e o reset do superior respondem igual com e sem outra conta |
| E18 | mesma pessoa em A e B: desativação em A não toca B; recuperação em A revoga B; nenhuma rota de A responde diferente por causa de B |

### O que fica proibido

São as mesmas condições que reabrem o G03:

- papel, nome, vínculo ou órgão vindos do token como autoridade;
- token, sessão ou contexto de banco que valha para mais de um município;
- organização tirada de cabeçalho, parâmetro de rota, corpo ou da lista de
  municípios da pessoa (a escolha e a troca da E16 só escolhem, decisão 2);
- troca de município autorizada só pelo token ou pela sessão de origem;
- tabela sem `organizacao_id` fora da lista nominal `EXCECOES_AO_ISOLAMENTO`, ou
  exceção que dispense invariante não declarado;
- função SECURITY DEFINER fora de `FUNCOES_PRIVILEGIADAS` (por assinatura), ou de
  autenticação que aja sem conferir o tenant e o solicitante;
- grant ou policy em `pessoas` para o `dc360_app`;
- duas fontes graváveis da credencial no mesmo SHA; UPDATE de tabela em
  `usuarios` para o `dc360_app` depois do passo 3;
- duas contas ligadas à mesma pessoa antes do passo 4; `pessoa_id` que muda
  depois de atribuído; conta ligada a pessoa existente fora de `aceitar_convite`;
- 403 onde o recurso é de outro município (é 404);
- resposta a município que dependa de conta, pessoa ou convite em outro;
- município que define senha, e-mail ou segundo fator de pessoa com conta em
  outro município, ou que enxerga a conta, o vínculo ou a sessão dela em outro;
- revogação global feita só por conta, ou revogação local que alcance outra
  conta da pessoa;
- papel por secretaria, ou conversão entre `usuario_orgao` e papel de servidor.

### Boas

- O caso guia funciona: uma pessoa, uma senha, um segundo fator, uma conta e um
  vínculo em cada município que a convidou.
- A ADR 0001 sai intacta: toda tabela de negócio continua com `organizacao_id`,
  RLS ativada e forçada e contexto vindo do token. O que muda é que a exceção
  passa a ter nome, motivo, invariantes declarados e teste, em vez de teto
  numérico.
- Conta desativada deixa de prender o e-mail (E09), e criar conta deixa de
  confirmar que o e-mail existe em outro município (E10, com o 202 igual).
- O UPDATE de tabela em `usuarios`, aberto desde a 001, vira lista positiva por
  coluna (E15 e E08).

### Ruins, e assumidas

- **A pessoa global concentra a credencial.** Uma senha vazada abre todos os
  municípios onde a pessoa tem conta, um de cada vez, mas todos. O segundo fator
  obrigatório nos papéis de mais poder (E11), o convite que não muda a
  credencial (E10) e a prova nova na troca (E16) reduzem, não eliminam. Por isso
  a etapa pediu segunda leitura de segurança antes do aceite.
- **Dado pessoal fora do tenant.** `pessoas` liga dados entre municípios, e a
  base legal, o controlador de cada dado, a retenção da pessoa sem conta e quem
  atende o titular com vários vínculos são do parecer do encarregado (CP-49), sob
  a LGPD. Até ele, a mesma pessoa em mais de um município não vai para produção;
  construção e teste com dado sintético seguem.
- **Eliminação de município não apaga a pessoa.** Na F03 a pessoa sem conta
  ativa fica inativa (E09) e não é apagada; o destino definitivo da linha é a
  pendência H98 (CP-29 com o CP-49).
- **O administrador perde a redefinição de senha na liberação da segunda conta.**
  No piloto, com a recuperação por e-mail desligada (`RECUPERACAO_ATIVA=nao`), a
  redefinição com senha provisória (F00-E09) é o único caminho de "esqueci a
  senha" pelo produto. A partir do passo 4 o caminho é a própria pessoa (link ou
  código de recuperação) ou o console do fornecedor. É a pendência H94, com a
  recomendação nova no RESUMO da correção 1.
- **A troca de município custa uma digitação de senha** (e um código, quando o
  destino exige o fator). Com uma conta, nada muda.
- **Login mais longo e cliente que precisa ser atualizado:** quem tem várias
  contas passa pela escolha, e cliente abaixo de `VERSAO_ESCOLHA_DE_MUNICIPIO`
  com várias contas recebe 409 (E16). Com uma conta, nada muda.
- **O oráculo de cadastro da F00 dura até a E10.** Ele já existe em produção, não
  aumenta, e fecha com o convite.
- **Uma consulta a mais por leitura** (E03), a medir sob pico na F07-E08 e na
  F24-E02.
- **Mais funções privilegiadas.** Cada uma é exceção ao RLS e precisa de entrada
  por assinatura, motivo e prova; a lista nominal custa manutenção a cada etapa.

## Alternativas descartadas (item 7 da etapa)

| Alternativa | Por que não |
| --- | --- |
| E-mail por município (só `UNIQUE (organizacao_id, email)`, credencial em cada conta) | O login fica ambíguo, que é exatamente o motivo escrito na 002 para o índice global. A pessoa do caso guia teria doze senhas e doze segundos fatores, e a recuperação de senha não saberia qual trocar. |
| Conta sem pessoa (cada `usuarios` com a própria credencial, contas ligadas pelo e-mail) | Duas ou mais fontes da mesma senha, que é o que a decisão 1 proíbe. Trocar a senha em A não a trocaria em B, bloquear em A não bloquearia em B, e coincidência de e-mail não é identidade. |
| Token multimunicípio (lista de `org` no token, ou `org` escolhido por cabeçalho a cada requisição) | Um token vazado alcançaria todos os municípios da pessoa de uma vez, e escolher a organização por cabeçalho é exatamente o que o CLAUDE.md proíbe. A troca de município com token novo e prova nova (decisão 2) dá o mesmo uso sem esse dano. |
| Troca de município autorizada só pela sessão de origem, herdando o segundo fator por `MFA_VIGENCIA_MINUTOS` | Um token roubado em A chegaria a B sem mais nada, o que desfaz o motivo da alternativa acima. Não é aceita aqui; só o Rafael pode adotá-la, aceitando o risco por escrito na pergunta 2 do CP-50. |
| Papel ou credencial acima do município | Recusado por princípio nas ADRs 0006 e 0008, e continua recusado: a pessoa global não tem poder em município nenhum fora da conta que tem nele. |
| Órgão como tenant | Picaria o município em vários tenants e jogaria a regra de 404 entre municípios para dentro de uma mesma prefeitura. O isolamento por órgão é da ADR 0010, dentro do tenant. |
| Manter a D-02 (conta separada por município e ofício por link) | Revogada pela D-08. O ofício por link continua só durante a transição (F04-E12). |
| Provedor de identidade externo para a pessoa global | Os motivos da ADR 0004 continuam: o `org` do token é contexto de banco e não sai do repositório, e o custo e a operação de um provedor não se pagam para servidor municipal. |
| Responder 409 `pessoa_em_varios_municipios` ao administrador (primeira redação) | Confirma ao município A uma conta fora de A. Retirada pela correção 1 (decisão 6). |
| Conflito de cadastro com corpo igual como fechamento da enumeração (E09 da primeira redação) | 201 e 409 continuam distinguíveis: quem administra tenta um e-mail que não está na própria lista e lê a resposta. Só o 202 igual do convite (E10) fecha. |
| Contar só as contas ATIVAS para liberar intervenção do administrador | Com A ativa e B desativada, A redefiniria a credencial global; quando B reativasse, a credencial conhecida por A abriria B. Por isso a relação um para um conta toda conta, e qualquer intervenção que sobreviva à liberação conta toda conta e todo convite (decisão 6). |
| Revogar UPDATE só das colunas antigas, mantendo o UPDATE de tabela da 001 | No Postgres não retira nada: o privilégio de tabela continua cobrindo as colunas. O passo 3 retira o de tabela e concede por coluna (decisão 1). |
| Converter todas as travas e revogações de conta para pessoa | A desativação em A derrubaria B. A decisão 7 separa o escopo local do global. |
| Liberar a segunda conta junto do convite (E10) | Ainda haveria escritores antigos da credencial em `usuarios` e as proteções globais não estariam no código. A liberação é o passo 4, na E16. |

## Estado e aceite

- **Situação:** PROPOSTA.
- **Aceite do Rafael (H97):** desta ADR e da redação proposta para o CLAUDE.md
  (`docs/evidencias-v2/G03/V2-F03-E01/correcao-1/proposta-de-redacao-do-claude-md.md`).
  Com o aceite, a situação passa a "aceita, em vigor" com a data, e o trecho
  entra no CLAUDE.md pela mão dele.
- **Parecer do encarregado (CP-49):** base legal da identidade global, o que
  fica na pessoa e o que fica na conta, controlador de cada dado, retenção da
  pessoa sem conta e atendimento ao titular com vários vínculos. Bloqueia só a
  mesma pessoa em mais de um município em produção.
- **CP-50 (H96):** (1) quem redefine senha e segundo fator de pessoa com vários
  municípios: até a decisão, vale a decisão 6 (intervenção só no período um
  para um; depois, alternativa A, com resposta igual); (2) se a troca de
  município pede código novo: até a decisão, vale a prova nova da decisão 2. A
  forma mais leve só com o risco aceito por ele, por escrito.
- **H94 (redefinição por administrador):** recomendação refeita pela correção 1
  (RESUMO da correção, seção "Para o orquestrador").
- **Segunda leitura de segurança:** feita (Codex, somente leitura, onze achados,
  oito bloqueando o aceite); a correção 1 fecha os onze nesta redação, e a
  tabela está no RESUMO da correção. Os requisitos que dependem de código
  futuro (decisões 7 e 8) são cobrados pelos testes da etapa dona, não por esta
  ADR.
- **Registros previstos nesta ADR:** o que a E07 (plateia) e a E18 (cruzamento)
  provarem entra como nota no fim, na consolidação da F03 (lote 7B), sem
  reescrever o texto acima.

## Onde isto vive

- Decisão de origem: D-08 em `docs/roadmap-v2/01-decisoes-e-principios.md`
  (seção 11), que revoga D-02 e A-01 (seções 2 e 3).
- Etapas: `docs/roadmap-v2/05-api-identidade-autorizacao.md`, V2-F03-E01 a E21 e
  o G03; plano de execução em `docs/roadmap-v2/retomada/plano-f03.md`.
- Checkpoints: CP-49 e CP-50 em `docs/roadmap-v2/18-checkpoints.md`.
- Portão: `dc360/db/test/isolamento.test.ts` (`EXCECOES_AO_ISOLAMENTO` e
  `FUNCOES_PRIVILEGIADAS`, a partir da parte 0B), mais os testes que as etapas
  criam: `db/test/pessoas.test.ts` (E15),
  `funcoes-de-autenticacao-conferem-o-tenant.test.ts` (E08),
  `email-entre-ativos.test.ts` (E09), `db/test/convite.test.ts` e
  `convite.test.ts` (E10), `escolha-de-municipio.test.ts` (E16),
  `db/test/pessoa-em-dois-municipios.test.ts` e
  `apps/api/test/cruzamento-de-municipios.test.ts` (E18).
- Revisão de segurança e correção: `docs/evidencias-v2/G03/V2-F03-E01/correcao-1/`.
- Pessoas e papéis em linguagem de gente: `dc360/docs/PAPEIS_E_RESPONSABILIDADES.md`,
  seção "Pessoa, conta e vínculo".
- Backlog que esta decisão substitui: `dc360/apps/api/PENDENCIAS.md`, seção
  "Uma pessoa, vários municípios".
