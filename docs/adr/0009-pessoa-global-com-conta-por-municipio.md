# ADR 0009: pessoa global com conta e vínculo por município, e token de um município por vez

- **Data da decisão:** 01/10/2026 (decisão D-08 do Rafael; registro escrito em 26/10/2026, V2-F03-E01)
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
- A 002 criou `usuarios_email_global_idx`, índice único TOTAL em
  `lower(email)` sobre o sistema inteiro, com o motivo escrito no próprio
  arquivo: "na hora do login ainda não se sabe o município, e dois usuários com
  o mesmo email em prefeituras diferentes tornariam a resposta ambígua". O
  índice não olha `ativo`: conta desativada continua prendendo o e-mail.
- `sessoes` (002, com `familia_id` desde a 047) é por município, sob a policy
  `organizacao_id = app_organizacao_atual()`.
- `segundo_fator` e `segundo_fator_recuperacao` (022) são por
  `(organizacao_id, usuario_id)`: o segundo fator também é de um município.
- O login chama `credenciais_para_login(email)` (SECURITY DEFINER, 002,
  redefinida na 013), que acha a única conta daquele e-mail e, com ela, o
  município. O token sai com esse município fixo.
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
  funções SECURITY DEFINER por um TETO numérico (`<= 27`), não por nome.

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

## Decisão

**Existe pessoa global. Não existe token, sessão nem consulta que valha para dois
municípios ao mesmo tempo.** As duas frases convivem pelas decisões abaixo, e
nenhuma é opcional. As decisões 1 a 6 são os itens 1 a 6 da etapa V2-F03-E01
(`docs/roadmap-v2/05-api-identidade-autorizacao.md`); o item 7 são as
alternativas descartadas, no fim.

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
- **`sessoes` ganha `pessoa_id` e continua por município.** Cada sessão é de uma
  conta num município, e a vigência confere as três coisas juntas.
- **`orgao_vinculos` é o vínculo temporal da conta com um órgão do MESMO
  município** (E05): papel no órgão (`gestor`, `executor`, `leitor`), início,
  fim, quem concedeu e os motivos; RLS ativada e forçada por município; chave
  composta com a conta e com o órgão, de modo que uma conta de A nunca se liga a
  órgão de B. Vínculo se encerra com motivo, nunca se apaga.

#### A credencial muda de casa em três passos, sem duas fontes graváveis ao mesmo tempo (P-04)

A senha não pode ter duas cópias que alguém grave de forma independente: a
troca feita numa seria desfeita pela outra, e o bloqueio por força bruta
contaria em dobro ou não contaria. Por isso a passagem de `usuarios` para
`pessoas` é feita assim, e em nenhum SHA intermediário existe mais de uma fonte
gravável:

| Passo | Etapa e migração | Quem a aplicação e as funções GRAVAM | De onde a API LÊ | Como `pessoas` se mantém |
| --- | --- | --- | --- | --- |
| 1 | E15 (054) | `usuarios` | `usuarios` (API não muda) | gatilho espelha cada escrita de credencial de `usuarios` em `pessoas`, de mão única |
| 2 | E02 (sem migração) | `usuarios` | `pessoas` (`credenciais_da_pessoa`) | o mesmo espelho |
| 3 | E08 (061) | só `pessoas` | `pessoas` | espelho desligado e REVOKE de UPDATE nas colunas antigas de `usuarios` |

As colunas antigas caem numa migração posterior, que não é da F03. Antes do
passo 1 a E15 faz o INVENTÁRIO de toda função e rota que lê ou grava
`senha_hash`, `falhas_login`, `bloqueado_ate` ou `senha_provisoria_ate`,
inclusive as do console. O ponto de partida, lido nas migrações deste SHA (a
lista completa é da E15): `credenciais_para_login`, `registrar_tentativa_login`,
`trocar_senha`, `consumir_recuperacao`, `senha_trocada_deixa_de_ser_provisoria`,
`dono_do_token`, `provisionar_municipio` (o console cadastra prefeitura, 036), o
gatilho `recuperacoes_morrem_com_a_credencial` (051, que dispara em `UPDATE OF
senha_hash` de `usuarios` e precisa acompanhar a credencial no passo 3) e a
rota `POST /usuarios/:id/redefinir-senha` (`rotas/administracao.ts`). O backfill
cria uma pessoa por conta (o e-mail já é único no sistema, então a relação de
hoje é um para um), com as contagens antes e depois arquivadas.

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
- **Troca de município (E16):** gera sessão nova e token novo no destino. Nunca
  um token com dois `org`, nunca a lista de municípios dentro do token, nunca
  sessão compartilhada entre municípios.
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
2. **A escolha do município é a única entrada de organização fora do token, e
   ela só escolhe.** `POST /v1/auth/municipio` (E16) recebe o desafio e um
   `organizacaoId`, que é aceito só se estiver na lista de contas ativas
   daquela pessoa, conferida no banco. Ele não vira contexto de nada: o que vira
   contexto é o `org` do token assinado que sai dali.

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
   `search_path` fixo, e cada uma conferindo o tenant: a que age dentro de um
   município só alcança pessoa com conta ativa em `app_organizacao_atual()`
   (E08), e a que age antes do município (login) só devolve à própria pessoa,
   depois da senha, o que é dela. Os nomes são fixados pela etapa que cria cada
   função (`vigencia_da_sessao` e `credenciais_da_pessoa` na E15,
   `pessoa_acompanha_as_contas` na E09, `convidar_pessoa` e `aceitar_convite` na
   E10, `municipios_da_pessoa` na E16, as de autenticação redefinidas na E08).
4. **A lista é conferida no catálogo do banco, nos dois sentidos.** O teto
   `<= 27` vira `FUNCOES_PRIVILEGIADAS` (P-03, parte 0B do lote 0, antes de
   qualquer função nova da F03): cada função com nome, motivo e como confere o
   tenant. Função SECURITY DEFINER no banco fora da lista reprova; nome na lista
   sem função no banco também. Do mesmo jeito, `SEM_TENANT` e
   `SEM_POLICY_DE_TENANT` viram `EXCECOES_AO_ISOLAMENTO`: tabela sem
   `organizacao_id` fora da lista reprova o portão.

Toda outra tabela da pessoa (o segundo fator e os códigos de recuperação da E11,
as cotas da E19) entra na lista **por nome próprio**, com a trava própria
declarada pela etapa que a cria. Não existe isenção por prefixo nem por padrão
de nome.

**O que nenhuma função pode fazer:** devolver lista de pessoas; dizer a um
município que a pessoa tem conta, vínculo, papel ou sessão em outro (nem a
existência deles); deixar a ação de um município alterar a pessoa no que ela é
para outro município. O município enxerga a pessoa só pela conta que tem com
ela. Esta última regra é também a recomendação técnica do CP-49 ("nunca expor a
um município o vínculo da pessoa em outro").

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
  `docs/evidencias-v2/G03/V2-F03-E01/proposta-de-redacao-do-claude-md.md`. O
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

### 6. O administrador de município nunca define senha, e-mail nem segundo fator de pessoa com conta em outro município

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
- **Transição até o CP-50:** para pessoa com conta em UM município só, a
  redefinição de senha com senha provisória (F00-E09) e o reset de segundo
  fator pelo superior (E11) continuam; para quem tem conta ativa em outro
  município, os dois respondem 409 `pessoa_em_varios_municipios`. É a premissa
  das pendências H94 e H96; a regra final é do CP-50, cuja recomendação técnica
  (alternativa A) é: o superior só suspende e reabilita a conta no município
  dele, e a redefinição da pessoa é feita por ela mesma, com código de
  recuperação, ou pelo fornecedor no console, com verificação e trilha.
- **Trocar o próprio e-mail** fica para depois (`dc360/apps/api/PENDENCIAS.md`):
  nenhuma etapa da F03 o faz, e nenhum município troca o e-mail de uma pessoa.

### Premissas do plano da F03 que esta ADR fixa como norma

O plano (`docs/roadmap-v2/retomada/plano-f03.md`, seção 1) tem doze premissas.
Algumas são norma de segurança e ficam valendo como esta ADR; as outras são
ordem de trabalho e não são regra de produto.

| Premissa | O que diz | Aqui é |
| --- | --- | --- |
| P-01 | E03 antes da E02 | NORMA: a leitura passa a consultar o banco antes de o papel sair do token (decisão 2) |
| P-02 | E15 em paralelo com a E04 | ordem de trabalho |
| P-03 | lista nominal de funções privilegiadas sobe para o lote 0 | NORMA: nenhuma função privilegiada da F03 nasce sem nome na lista (decisão 3) |
| P-04 | credencial em três passos | NORMA: nunca duas fontes graváveis (decisão 1) |
| P-05 | E05 entrega o vínculo, E06 liga na vigência | ordem de trabalho; a norma é que vínculo só vale lido pela vigência (decisão 4) |
| P-06 | rotas enumeradas por `superficie-registrada.ts` até o ajudante da F02-E05 | ferramenta de teste |
| P-07 | login e relógios usam `comTenantDoSistema` | NORMA: quem age sem pessoa logada se declara `sistema`, e nenhuma transação nasce sem ator (E06) |
| P-08 | E12 em paralelo com a E06 | ordem de trabalho |
| P-09 | login do `usuario_orgao` fechado no lote 1; `PORTAL_ATIVO` declarado na 1C e ligado na 2A | NORMA: a conta `usuario_orgao` não entra antes do G03 (decisão 5) |
| P-10 | E10 e E18 divididas em banco e API | ordem de trabalho |
| P-11 | pontos de extensão vazios na abertura da API | NORMA só na parte da configuração: toda chave da F03 nasce com padrão fechado e sem efeito |
| P-12 | migrações 053 a 065 | numeração, não norma |

## Consequências

### O que muda em cada etapa da F03

| Etapa | O que esta ADR exige dela |
| --- | --- |
| E02 | token `{ sub, org, sid }`, `sub` é a pessoa; credencial lida da pessoa (passo 2); nada em `apps/api/src` lê papel, nome ou `sp` do token |
| E03 | vigência em todo método, leituras inclusive; conta inativa não lê |
| E04 | domínio de papel no banco; `usuario_orgao` sem permissão, sem conversão, login fechado |
| E05 | `orgao_vinculos` por município, chave composta com a conta e o órgão, encerra e não apaga |
| E06 | ator (conta, pessoa, papel, órgão) no contexto do banco; papel e pessoa vêm da vigência, nunca do token |
| E07 | plateia pela conta escolhida; `dc360-portal` não vale no painel e vice-versa; registra nesta ADR o que provou (lote 7B) |
| E08 | funções de autenticação conferem o tenant; credencial gravada só em `pessoas` (passo 3); lista nominal em vigor |
| E09 | e-mail único só entre PESSOAS ativas; conflito com corpo igual para e-mail de A ou de B; conta desativada nunca se reativa para outra pessoa |
| E10 | conta nasce por convite; resposta igual para pessoa nova e existente; convidar não muda a credencial de quem já existe |
| E11 | segundo fator na pessoa; obrigatório para `usuario_orgao`, coordenador e administrador; reset por superior só para pessoa de um município |
| E12 e E13 | rota sem ação declarada é negada; a matriz inclui o `usuario_orgao` |
| E14 | recorte em lista positiva |
| E15 | `pessoas` com as quatro travas da decisão 3; backfill sem perda; espelho da credencial (passo 1); inventário das funções de credencial |
| E16 | login em dois passos, escolha e troca de município com sessão e token novos |
| E17 | órgão externo como linha em cada município; a mesma pessoa convidada por cada um |
| E18 | prova de cruzamento com a mesma pessoa em A e B; registra nesta ADR o resultado (lote 7B) |
| E19 | `cotas_de_uso` como exceção nomeada própria, chave por HMAC |
| E20 | a trilha da conta não revela evento de outra pessoa nem de outro município |
| E21 | o sigilo usa o ator da E06; nada muda nesta ADR |

### O que fica proibido

São as mesmas condições que reabrem o G03:

- papel, nome, vínculo ou órgão vindos do token como autoridade;
- token, sessão ou contexto de banco que valha para mais de um município;
- organização tirada de cabeçalho, parâmetro de rota, corpo ou da lista de
  municípios da pessoa (a escolha da E16 só escolhe, decisão 2);
- tabela sem `organizacao_id` fora da lista nominal `EXCECOES_AO_ISOLAMENTO`;
- função SECURITY DEFINER fora de `FUNCOES_PRIVILEGIADAS`, ou de autenticação
  que aja sem conferir o tenant;
- grant ou policy em `pessoas` para o `dc360_app`;
- duas fontes graváveis da credencial no mesmo SHA;
- 403 onde o recurso é de outro município (é 404);
- município que define senha, e-mail ou segundo fator de pessoa com conta em
  outro município, ou que enxerga a conta, o vínculo ou a sessão dela em outro;
- papel por secretaria, ou conversão entre `usuario_orgao` e papel de servidor.

### Boas

- O caso guia funciona: uma pessoa, uma senha, um segundo fator, uma conta e um
  vínculo em cada município que a convidou.
- A ADR 0001 sai intacta: toda tabela de negócio continua com `organizacao_id`,
  RLS ativada e forçada e contexto vindo do token. O que muda é que a exceção
  passa a ter nome, motivo e teste, em vez de teto numérico.
- Conta desativada deixa de prender o e-mail (E09), e o 409 deixa de confirmar
  que o e-mail existe em outro município.

### Ruins, e assumidas

- **A pessoa global concentra a credencial.** Uma senha vazada abre todos os
  municípios onde a pessoa tem conta, um de cada vez, mas todos. O segundo fator
  obrigatório nos papéis de mais poder (E11) e o convite que não muda a
  credencial (E10) reduzem, não eliminam. Por isso a etapa pede segunda leitura
  de segurança antes do aceite.
- **Dado pessoal fora do tenant.** `pessoas` liga dados entre municípios, e a
  base legal, o controlador de cada dado, a retenção da pessoa sem conta e quem
  atende o titular com vários vínculos são do parecer do encarregado (CP-49), sob
  a LGPD. Até ele, a mesma pessoa em mais de um município não vai para produção;
  construção e teste com dado sintético seguem.
- **Eliminação de município não apaga a pessoa.** Na F03 a pessoa sem conta
  ativa fica inativa (E09) e não é apagada; o destino definitivo da linha é a
  pendência H98 (CP-29 com o CP-49).
- **Login mais longo e cliente que precisa ser atualizado:** quem tem várias
  contas passa pela escolha, e cliente abaixo de `VERSAO_ESCOLHA_DE_MUNICIPIO`
  com várias contas recebe 409 (E16). Com uma conta, nada muda.
- **Uma consulta a mais por leitura** (E03), a medir sob pico na F07-E08 e na
  F24-E02.
- **Mais funções privilegiadas.** Cada uma é exceção ao RLS e precisa de nome,
  motivo e prova; a lista nominal custa manutenção a cada etapa.

## Alternativas descartadas (item 7 da etapa)

| Alternativa | Por que não |
| --- | --- |
| E-mail por município (só `UNIQUE (organizacao_id, email)`, credencial em cada conta) | O login fica ambíguo, que é exatamente o motivo escrito na 002 para o índice global. A pessoa do caso guia teria doze senhas e doze segundos fatores, e a recuperação de senha não saberia qual trocar. |
| Conta sem pessoa (cada `usuarios` com a própria credencial, contas ligadas pelo e-mail) | Duas ou mais fontes da mesma senha, que é o que a decisão 1 proíbe. Trocar a senha em A não a trocaria em B, bloquear em A não bloquearia em B, e coincidência de e-mail não é identidade. |
| Token multimunicípio (lista de `org` no token, ou `org` escolhido por cabeçalho a cada requisição) | Um token vazado alcançaria todos os municípios da pessoa de uma vez, e escolher a organização por cabeçalho é exatamente o que o CLAUDE.md proíbe. A troca de município com token novo (decisão 2) dá o mesmo uso sem esse dano. |
| Papel ou credencial acima do município | Recusado por princípio nas ADRs 0006 e 0008, e continua recusado: a pessoa global não tem poder em município nenhum fora da conta que tem nele. |
| Órgão como tenant | Picaria o município em vários tenants e jogaria a regra de 404 entre municípios para dentro de uma mesma prefeitura. O isolamento por órgão é da ADR 0010, dentro do tenant. |
| Manter a D-02 (conta separada por município e ofício por link) | Revogada pela D-08. O ofício por link continua só durante a transição (F04-E12). |
| Provedor de identidade externo para a pessoa global | Os motivos da ADR 0004 continuam: o `org` do token é contexto de banco e não sai do repositório, e o custo e a operação de um provedor não se pagam para servidor municipal. |

## Estado e aceite

- **Situação:** PROPOSTA.
- **Aceite do Rafael (H97):** desta ADR e da redação proposta para o CLAUDE.md
  (`docs/evidencias-v2/G03/V2-F03-E01/proposta-de-redacao-do-claude-md.md`). Com o
  aceite, a situação passa a "aceita, em vigor" com a data, e o trecho entra no
  CLAUDE.md pela mão dele.
- **Parecer do encarregado (CP-49):** base legal da identidade global, o que
  fica na pessoa e o que fica na conta, controlador de cada dado, retenção da
  pessoa sem conta e atendimento ao titular com vários vínculos. Bloqueia só a
  mesma pessoa em mais de um município em produção.
- **CP-50 (H96):** quem redefine senha e segundo fator de pessoa com vários
  municípios, e se a troca de município pede código novo. Até lá vale a
  transição da decisão 6.
- **Segunda leitura de segurança** antes do aceite (risco anotado na etapa).
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
  `db/test/pessoa-em-dois-municipios.test.ts` e
  `apps/api/test/cruzamento-de-municipios.test.ts` (E18).
- Pessoas e papéis em linguagem de gente: `dc360/docs/PAPEIS_E_RESPONSABILIDADES.md`,
  seção "Pessoa, conta e vínculo".
- Backlog que esta decisão substitui: `dc360/apps/api/PENDENCIAS.md`, seção
  "Uma pessoa, vários municípios".
